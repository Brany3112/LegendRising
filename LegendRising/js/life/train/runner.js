/* ============ Training Mode: the scenario runner ============
   Owner: P3-B (TR-3, Training Mode Phase 3). Contract: BUILD-PLAN Phase 3 "Contracts (P3-B stubs them)", runner.js
   (registerScenario, startScenario, restart, stopScenario, RUN); TRAINING-SPEC 1 (one football engine), 4 (scenario
   lifecycle: configure, prepare, spawn or reuse, position, place the ball, activate, play, reset or complete, clean up;
   no full reload) and 8 (nothing inactive running, no leaks over repeated resets). INF-5, perf-7, perf-8.

   A scenario is registered by its own module (registerScenario) with what it is (id, category, name, desc, type) and
   what it does: build(config, env) gives the setup, step(T) runs after every fixed step of play, judge(T) says when
   a go is decided, ui(T) gives the Training HUD its lines. The setup is plain data in the cage pitch's own frame
   (CAGE.spec, pitch-local metres):
     {myTeam: 0 | 1 (team 0 attacks +x), laws: {out, offside, restarts, goals}, role, seed,
      me: {slot, x, z, yaw, at?}, mates: [{slot, x, z, yaw, at?}], opps: [...], keeper: {side: 'theirs' | 'mine', x, z, yaw, at?} | null,
      ball: {x, y, z, vx, vy, vz, wx?, wy?, wz?, kind?, free}, poss?, config?, notes?}
   The runner plays it on the match's own simulation (sim.js createMatch with the training mode, its laws from the
   setup, out of play included), with the match's own controls, camera, HUD and bodies: training.js's mode train,
   handed an item of the runner's (pooled bodies from pool.js, no officials drawn, one SCHED.fixed task stepping the
   simulation). Starting again (Backspace, restart()) puts back exactly the setup it started from: a new simulation
   from the same setup and seed, the same pooled bodies, nothing built, the camera, HUD and controls kept. A pitch
   change rebuilds the cage zone, which ends a scenario (the mode leaves on a zone change). Leaving Training
   (train:exit, fired by sandbox.js) stops whatever runs. Nothing here touches the career.

   P4-B (Training Mode Phase 4, BUILD-PLAN P4-B work items 4 and 6; TRAINING-SPEC 0 and 4; INF-9, INF-10, perf-7):
   - The configured ball at activation. The setup's ball is the placement (P4-A teams.js ballInit.p); when it has a
     velocity, the ball is placed there at rest and the launch is played at activation through ball.js ballKick, the
     one way a player changes the ball's velocity, logged as a kick from outside the play (agent -1), as the coach's
     feed is. So the flight is real ball physics, never a placed path (Phase 6's feeder plays the same launch from a
     passer's foot instead).
   - The setup snapshot. At activation the run keeps a deep copy of the setup (the configuration, every place and
     facing, the ball's position, velocity and spin, possession, the seed) and the cage kind it was made for.
     restart() plays that snapshot again; replay() plays the run before this one (RUN.last), never the end state of
     an attempt and never touched by a later configuration edit.
   - A reset restores everything without building a body: a new simulation from the snapshot (agents, AI plans, acts
     and brain timers, stamina, flags, the ball and any extra ball, the sim.on handles all made afresh), the controls
     let go, every pooled body put back to the state it was built in (pool.js: clip, upper layers, inertialisation and
     IK buffers, gait clock) and its view record made afresh, and the runner's own flags, notices and timers.
   - digest() is a stable hash of all of that (below), so a test compares the whole reset state, not a sample. Left
     out on purpose, because they are meant to differ between two activations of one setup: RUN.starts and
     RUN.restarts, the attempt list (T.results, T.tries), wall-clock times, the camera and P (presentation, set from
     the agent every frame), body.gen (the place a body belongs to) and the RNG's internal word, which cannot be read
     without drawing from it: each activation makes the generator afresh from the setup's seed, which is hashed.
   - Pause: the host hands training.js a pause callback (HOST.pause), so in Training Mode Esc and losing the pointer
     open the pause card (quick.js registers it with setPauseMenu) instead of ending the scenario; while it is up the
     fixed task does not step (RUN.paused). Career drills have no pause and keep their own behaviour.
   - Pitch switching: startScenario compares config.pitch with CAGE.kind and, when they differ, rebuilds the cage of
     that kind under the fade (cage.js cageEnter) before anything is spawned; the pool's bodies are kept. A type with
     a fixed pitch gets it through config.js validate. Returning to the hub never switches back. */
import {onBegin} from "../build.js";
import {P, FLAGS} from "../core/state.js";
import {enterMode, exitMode, mode, modeArg, modeFlags} from "../core/modes.js";
import {SCHED} from "../core/sched.js";
import {createMatch, REF, AR1, AR2, TEMPO} from "../football/sim.js";
import {MODES} from "../football/rules.js";
import {refreshPred} from "../football/actions.js";
import {attrsForAI, attrsForPlayer} from "../football/attrs.js";
import {goalsLawOf as goalsLaw, CAGES} from "../football/cagespec.js";
import {ballKick} from "../football/ball.js";
import {logEv, chainKick} from "../football/events.js";
import {hashStr} from "../football/rng.js";
import {controlReset, CTRL} from "../football/control.js";
import {viewInit, viewDispose} from "../football/view.js";
import {RUN as TRUN, fixedRun, viewOpts} from "../football/training.js";
import {CAGE, cageEnter} from "./cage.js";
import {takeBodies, returnBodies, poolStats, poolMeLook, poolDispose, bodyData, KITS, POOL_DRILL} from "./pool.js";
import * as THUD from "./thud.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = .11;
const copy = o => o == null ? o : JSON.parse(JSON.stringify(o));

/* ---------- the categories (TRAINING-SPEC 4, in its order) ---------- */
export const CATEGORIES = Object.freeze([
  {id:"setpieces", name:"Set Pieces", desc:"Free kicks over a wall, corners, throw-ins and penalties."},
  {id:"attacking", name:"Attacking", desc:"Build an attack from midfield, on your own or with team-mates, against defenders and a keeper."},
  {id:"defending", name:"Defending", desc:"From one against one up to six against six. Jockey, track your man, tackle and win it back."},
  {id:"receiving", name:"Ball Receiving and First Touch", desc:"Passes and crosses of every kind coming your way. Get the first touch right."},
  {id:"scenarios", name:"Match Scenarios", desc:"Wing play, one-twos, overlaps, counters and other moments from a real game."},
  {id:"fullmatch", name:"Full Match", desc:"Eleven against eleven with the real rules, from the kick-off or from the bench."},
  {id:"freeplay", name:"Free Play", desc:"No objectives. You, a ball and the whole pitch."}
].map(c => Object.freeze(c)));
export const categoryOf = id => CATEGORIES.find(c => c.id === id) || null;

/* ---------- the registry ---------- */
const REG = new Map();
const SUBS = new Set();
const emit = () => { for (const fn of SUBS) try { fn(); } catch(e){ console.error(e); } };
// fn() whenever a scenario is registered or one starts or stops (the hub and the cones redraw); returns the unsubscribe
export function onRunner(fn){ SUBS.add(fn); return () => SUBS.delete(fn); }
export function registerScenario(sc){
  if (!sc || typeof sc.id !== "string" || !sc.id) throw new Error("registerScenario: a scenario needs an id");
  if (!categoryOf(sc.category)) throw new Error(`registerScenario: "${sc.id}" has no category of ${CATEGORIES.map(c => c.id).join(", ")}`);
  if (typeof sc.build !== "function") throw new Error(`registerScenario: "${sc.id}" needs build(config, env)`);
  const s = Object.freeze({id:sc.id, category:sc.category, name:String(sc.name || sc.id), desc:String(sc.desc || ""), type:sc.type || sc.category,
    build:sc.build, step:typeof sc.step === "function" ? sc.step : null, judge:typeof sc.judge === "function" ? sc.judge : null,
    ui:typeof sc.ui === "function" ? sc.ui : null, config:sc.config || null, configure:typeof sc.configure === "function" ? sc.configure : null});
  REG.set(s.id, s);
  emit();
  return s;
}
export const scenario = id => REG.get(id) || null;
export const scenariosOf = category => [...REG.values()].filter(s => s.category === category);

/* ---------- the run ----------
   RUN.cur: the scenario playing ({id, sc, config, T, preset, kind}) or null; RUN.setup: the snapshot of the setup it
   started from (what a restart puts back); RUN.ms: its simulation; RUN.last: the run before ({id, config, setup, kind,
   preset}, what Replay Last plays again); RUN.task: the one scheduler task stepping it; RUN.paused: the pause card is
   up (the task does not step); RUN.pending: a start waiting on a pitch change; RUN.starts and RUN.restarts count
   (tests) */
export const RUN = {cur:null, setup:null, last:null, task:null, paused:false, pending:null, starts:0, restarts:0,
  get ms(){ return RUN.cur && RUN.cur.T ? RUN.cur.T.ms : null; }, get T(){ return RUN.cur ? RUN.cur.T : null; }};

// the most agents a drill may have (G0 decision h): me, five team-mates, six opponents and a keeper
export const LIMITS = Object.freeze({mates:5, opps:6, agents:13});
// the training mode of the simulation (rules.js MODES; P3-A adds 'train', with laws.out)
const SIM_MODE = MODES.includes("train") ? "train" : "drill";

const num = (v, d) => Number.isFinite(+v) ? +v : d;
// a setup made safe: counts within the limits, every number a number, everyone inside the movers' run-off
export function cleanSetup(s, spec){
  const B = spec.runoff || {hx:spec.hx + 2, hz:spec.hz + 2};
  const pt = (p, d = {}) => ({slot:typeof (p && p.slot) === "string" ? p.slot : d.slot || "CM", x:clamp(num(p && p.x, 0), -B.hx, B.hx), z:clamp(num(p && p.z, 0), -B.hz, B.hz),
    yaw:num(p && p.yaw, 0), at:p && p.at && typeof p.at === "object" ? copy(p.at) : null, ovr:clamp(num(p && p.ovr, 60), 1, 99)});
  const b = s.ball || {};
  // the launch's kind: the setup's own, else the configuration's (P4-A teams.js keeps the configuration on the setup)
  const L = s.config && s.config.ball && s.config.ball.launch;
  const kind = typeof b.kind === "string" ? b.kind : L && typeof L.kind === "string" ? L.kind : null;
  const ps = s.poss && typeof s.poss === "object" ? {team:s.poss.team === 0 || s.poss.team === 1 ? s.poss.team : -1, who:typeof s.poss.who === "string" ? s.poss.who : null, i:num(s.poss.i, -1) | 0} : null;
  return {
    myTeam:s.myTeam === 1 ? 1 : 0, role:String(s.role || ""), seed:num(s.seed, 1) >>> 0,
    laws:Object.assign({}, s.laws || {}),
    me:pt(s.me, {slot:"CM"}),
    mates:(s.mates || []).slice(0, LIMITS.mates).map(p => pt(p, {slot:"CM"})),
    opps:(s.opps || []).slice(0, LIMITS.opps).map(p => pt(p, {slot:"CB"})),
    keeper:s.keeper ? Object.assign(pt(s.keeper, {slot:"GK"}), {slot:"GK", side:s.keeper.side === "mine" ? "mine" : "theirs"}) : null,
    ball:{x:clamp(num(b.x, 0), -B.hx, B.hx), y:Math.max(R, num(b.y, R)), z:clamp(num(b.z, 0), -B.hz, B.hz), vx:num(b.vx, 0), vy:num(b.vy, 0), vz:num(b.vz, 0),
      wx:num(b.wx, 0), wy:num(b.wy, 0), wz:num(b.wz, 0), kind, free:!!b.free},
    poss:ps, notes:Array.isArray(s.notes) ? s.notes.filter(n => typeof n === "string").slice(0, 8) : []
  };
}
const POS_OF = {GK:"GK", LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", RF:"ST", CF:"ST", ST:"ST"};
const ARCH_OF = {GK:"GK", DF:"DF", CM:"CM", CAM:"AM", LW:"W", RW:"W", ST:"ST"};
// a player record for createMatch (sim.js 1.4.13): an NPC's attributes from the seeded role profile (attrs.js, G0 f)
function rec(p, id, body, o = {}){
  const pos = POS_OF[p.slot] || "CM";
  return {pid:id, name:o.name || "", number:o.number || 0, slot:p.slot, arch:ARCH_OF[pos] || "CM", isGK:p.slot === "GK", isMe:!!o.me,
    scale:body && body.scale ? body.scale : 1, at:p.at || o.at || attrsForAI({id, ovr:p.ovr, pos}), energy:100, fatigue:0, prefFoot:o.foot || "Right", items:null};
}
// my attributes (G0 decision e): the held career's skills on the day when there is one, else an even 60 for my slot
function myAttrs(p){
  if (p.at) return p.at;
  const sk = typeof heldSkills === "function" ? heldSkills() : null;
  if (sk) return attrsForPlayer(sk, {}, {});
  return attrsForAI({id:1, ovr:p.ovr, pos:POS_OF[p.slot] || "CM"});
}
const myFoot = () => { const f = typeof heldFoot === "function" ? heldFoot() : null; return f === "Left" || f === "L" ? "Left" : f === "Both" || f === "B" ? "Both" : "Right"; };
// the touch kind ball.js records for a launch (the coach feed's: a lofted ball is a cross, anything else a pass)
const touchKind = k => k === "cross" || k === "loft" ? "cross" : "pass";

/* the simulation for a setup, and the pooled body of each agent. Returns {ms, bodyOf: Map(agentId -> body)}. The
   setup is read, never written: the simulation gets its own copies (the agents' attributes included) */
function buildMatch(setup0, spec, B){
  const setup = copy(setup0);
  const myTeam = setup.myTeam, oppTeam = 1 - myTeam;
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  const order = [[], []];
  const add = (t, r, body) => { teams[t].players.push(r); order[t].push(body); };
  add(myTeam, rec(setup.me, 1, B.me, {me:true, at:myAttrs(setup.me), foot:myFoot(), number:9}), B.me);
  setup.mates.forEach((p, i) => add(myTeam, rec(p, 100 + i, B.mine[i], {number:2 + i}), B.mine[i]));
  setup.opps.forEach((p, i) => add(oppTeam, rec(p, 200 + i, B.theirs[i], {number:2 + i}), B.theirs[i]));
  if (setup.keeper) add(setup.keeper.side === "mine" ? myTeam : oppTeam, rec(setup.keeper, 300, B.keeper, {number:1}), B.keeper);
  const rules = Object.assign({goals:goalsLaw(spec), offside:false, restarts:false, cards:false, subs:0, halfTime:false, stoppage:false}, setup.laws);
  const ms = createMatch({seed:setup.seed, mode:SIM_MODE, spec, halfRealSec:1e6, tempo:Object.assign({}, TEMPO[2]), teams,
    me:{team:myTeam, slot:setup.me.slot, prefFoot:myFoot(), role:"starter"}, rules, kickoffTeam:myTeam, htAuto:true});
  // no officials in a drill: off the grass, and no bodies for them (the view is told so)
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  const bodyOf = new Map();
  const places = [[], []];
  places[myTeam].push(setup.me, ...setup.mates);
  places[oppTeam].push(...setup.opps);
  if (setup.keeper) places[setup.keeper.side === "mine" ? myTeam : oppTeam].push(setup.keeper);
  for (const t of [0, 1]){
    const list = ms.agents.filter(a => a.team === t && a.role === "player");
    list.forEach((a, i) => {
      const p = places[t][i]; if (!p) return;
      a.m.x = a.x0 = p.x; a.m.z = a.z0 = p.z; a.m.vx = a.m.vz = 0; a.m.speed = 0; a.m.yaw = a.m.heading = p.yaw;
      a.set = null;
      if (order[t][i]) bodyOf.set(a.id, order[t][i]);
    });
  }
  ms.cutStep = ms.step;
  // the ball where the setup places it, at rest
  const b = ms.ball, s = setup.ball;
  b.p.x = s.x; b.p.y = s.y; b.p.z = s.z; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
  b.state = s.free ? "free" : "dead";
  // play is on from the first step: no kick-off, no restart pending (a set piece's own scenario sets one itself)
  ms.restart = null; ms.phase = "live";
  for (const a of ms.agents) a.set = null;
  // the configured launch, played as a real kick from outside the play (the coach feed's way, training.js feedStep):
  // ball.js ballKick gives the ball its velocity and spin, the kick is in the chain of play with no offside snapshot
  if (Math.hypot(s.vx, s.vy, s.vz) > 1e-9){
    const kind = touchKind(s.kind);
    ballKick(b, {x:s.vx, y:s.vy, z:s.vz}, {x:s.wx, y:s.wy, z:s.wz}, {agent:-1, team:myTeam, kind, t:ms.t});
    const ev = logEv(ms, "kick", myTeam, -1, b.p.x, b.p.z, {intent:kind, recv:-1, coach:true, noOffside:true, launch:s.kind || kind,
      speed:Math.round(Math.hypot(s.vx, s.vy, s.vz)*100)/100});
    chainKick(ms, ev);
    ms.kick = {seq:(ms.kick ? ms.kick.seq : 0) + 1, ev, t:ms.t, team:myTeam, agent:-1};
  }
  refreshPred(ms);
  return {ms, bodyOf};
}

// the kits by team (home is team 0's): my side's bib on my team, whichever way it attacks
const kitsFor = myTeam => myTeam === 1 ? {home:KITS.theirs, away:KITS.mine} : {home:KITS.mine, away:KITS.theirs};
/* the pause card (quick.js registers it: setPauseMenu(fn), fn(T) -> true when it is up) and the preset a configuration
   came from (presetui.js registers it: setPresetLookup(fn), fn(type, config) -> {id, name} | null). Training Mode's own
   modules hand these in, so the runner never imports them (and plays on with neither) */
const HOOKS = {pause:null, preset:null};
export function setPauseMenu(fn){ HOOKS.pause = typeof fn === "function" ? fn : null; }
export function setPresetLookup(fn){ HOOKS.preset = typeof fn === "function" ? fn : null; }
// what the runner's items ask of a host (training.js's mode train): looks and kits, no clock and no career. pause(T):
// Esc or the pointer let go opens the pause card instead of ending the scenario; false when there is none
const HOST = Object.freeze({look:() => poolMeLook(), kits:() => kitsFor(RUN.setup ? RUN.setup.myTeam : 0), clubShort:() => "YOU", pass(){}, xp:() => 0,
  pause:T => { if (!HOOKS.pause || !RUN.cur || RUN.cur.T !== T) return false; try { return HOOKS.pause(T) !== false; } catch(e){ console.error(e); return false; } }});

// the counts a setup takes from the pool
const need = s => ({mine:s.mates.length, theirs:s.opps.length, keeper:!!s.keeper});

/* ---------- start, restart, stop ---------- */
// the cage kind a configuration asks for (config.pitch: 'full', 'half' or 'onegoal'), or null to play where you are
const kindOf = config => config && typeof config.pitch === "string" && CAGES[config.pitch] ? config.pitch : null;
// the preset a start names: the one handed in, else the stored one whose configuration this is exactly
function presetFor(sc, config, opts){
  if (opts && opts.preset && opts.preset.name) return {id:opts.preset.id || null, name:String(opts.preset.name)};
  if (!HOOKS.preset) return null;
  try { return HOOKS.preset(sc.type, config) || null; } catch(e){ console.error(e); return null; }
}
/* config: the scenario's configuration (P4-A config.js). opts: {preset: {id, name}} when it was loaded from one.
   Returns true when it is playing, or will be once the cage of the configured pitch is up (RUN.pending is that
   promise, resolving to whether it started); false when it cannot start (another is running or starting, an unknown
   id, no cage) */
export function startScenario(id, config = {}, opts = {}){
  const sc = REG.get(id);
  if (!sc) return false;
  if (RUN.cur || RUN.pending) return false;
  if (!CAGE || !CAGE.spec) return false;
  const cfg = copy(config || {}), preset = presetFor(sc, cfg, opts);
  const go = () => {
    const spec = CAGE.spec;
    const setup = cleanSetup(sc.build(copy(cfg), {cage:CAGE, spec, limits:LIMITS}) || {}, spec);
    return play(sc, cfg, setup, preset);
  };
  const want = kindOf(cfg);
  if (want && want !== CAGE.kind) return switchThen(want, go);
  return go();
}
// the cage of another kind first, under the fade (the pool's bodies are kept), then fn()
function switchThen(kind, fn){
  const p = RUN.pending = cageEnter(kind).then(() => {
    RUN.pending = null;
    if (RUN.cur || !CAGE.spec || CAGE.kind !== kind) return false;
    return fn();
  }, e => { console.error(e); RUN.pending = null; return false; }).then(ok => {
    if (!ok){ emit(); if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("train:scenario", {detail:{state:"failed"}})); }
    return !!ok;
  });
  emit();
  return !!p;
}
// every participant's attributes worked out once, into the setup (the seeded role profiles and my own): the snapshot
// holds them, so a reset never works them out again
function resolveAttrs(setup){
  if (!setup.me.at) setup.me.at = myAttrs(setup.me);
  setup.mates.forEach((p, i) => { if (!p.at) p.at = attrsForAI({id:100 + i, ovr:p.ovr, pos:POS_OF[p.slot] || "CM"}); });
  setup.opps.forEach((p, i) => { if (!p.at) p.at = attrsForAI({id:200 + i, ovr:p.ovr, pos:POS_OF[p.slot] || "CM"}); });
  if (setup.keeper && !setup.keeper.at) setup.keeper.at = attrsForAI({id:300, ovr:setup.keeper.ovr, pos:"GK"});
  return setup;
}
function play(sc, config, setup, preset = null){
  const spec = CAGE.spec;
  resolveAttrs(setup);
  const B = takeBodies(need(setup));
  if (!B) return false;
  const {ms, bodyOf} = buildMatch(setup, spec, B);
  const run = {id:sc.id, sc, config:copy(config), T:null, prev:mode(), prevArg:modeArg(), prevFlags:modeFlags(), state:"play", wait:0, verdict:null,
    preset:preset ? {id:preset.id || null, name:String(preset.name)} : null, kind:CAGE.kind};
  const T = itemFor(run, setup, spec, ms, bodyOf, B);
  run.T = T;
  RUN.cur = run; RUN.setup = copy(setup); RUN.starts++; RUN.paused = false;
  // one scheduler task steps the simulation (perf-8), only while a scenario plays and is not paused
  RUN.task = SCHED.fixed({id:"train-sim", hz:60, maxSteps:4, kind:"zone", run:h => { if (RUN.cur === run && run.T && !RUN.paused) fixedRun(run.T, h); }});
  T.fixed = RUN.task;
  P.yaw = setup.me.yaw; P.pitch = 0;
  enterMode("train", T);
  THUD.thudShow(thudInfo(run));
  emit();
  return true;
}
// the runner's own flags of a go, as they are at activation (restart puts them back)
function runFlags(T){
  T.t = 0; T.acc = 0; T.tRep = 0; T.slow = null; T.done = false; T.evFrom = 0; T.evSeen = 0; T.sprintD = 0; T.goalAt = null; T.bounces = 0; T.feed = null;
  T.fedAt = null; T.fedBounces = 0; T.hintT = 0; T.inPlay = false; T.ballSeen = true; T.phase = "play"; T.quit = false; T.qs.length = 0;
}
function itemFor(run, setup, spec, ms, bodyOf, B){
  const F = spec.frame || {cx:0, cz:0};
  const T = {item:{kind:"scenario", score:false, restarts:setup.laws.out === "stop" || !!setup.laws.restarts, kickoff:false}, spec, F, ac:{x:0, z:0}, ms, me:ms.agents[ms.me],
    myTeam:setup.myTeam, oppTeam:1 - setup.myTeam, bodies:new Map(), V:null, t:0, acc:0, host:HOST, evFrom:0, evSeen:0, tries:0, rep:0, results:[], xp:{}, xpRaw:0,
    qs:[], done:false, phase:"play", tRep:0, opts:{}, onEnd:null, traits:{}, sprintD:0, ballSeen:true, inPlay:false, goalAt:null, bounces:0, rate:0,
    kits:kitsFor(setup.myTeam), officials:false, fpBody:B.fp, bodyOf:a => bodyOf.get(a.id) || null, fixed:null};
  runFlags(T);
  T.onQuit = () => stopScenario("quit");
  T.onRestart = () => restart();
  T.onEnd = () => { if (RUN.cur === run) stopScenario("ended"); };
  T.script = {
    post(T){
      const sc = run.sc;
      if (sc.step) sc.step(T, run);
      if (run.state === "play" && sc.judge){
        const v = sc.judge(T, run);
        if (v && v.done){ run.state = "result"; run.wait = 1.6; run.verdict = v; T.results.push(v); THUD.thudNotice(v.text || (v.ok ? "Well done" : "Not this time"), v.ok); }
      } else if (run.state === "result" && (run.wait -= 1/60) <= 0){
        // the go is over: the same setup again (a scenario that plays once says repeat false and ends here)
        if (run.verdict && run.verdict.repeat === false) stopScenario("done"); else restart();
      }
    },
    frame(T){ THUD.thudFrame(T); }
  };
  return T;
}
function thudInfo(run){
  const s = RUN.setup, sc = run.sc, ui = sc.ui ? sc.ui(run.T, run) || {} : {};
  return {scenario:sc.name, role:ui.role || s.role || "Player", mine:1 + s.mates.length, theirs:s.opps.length, keeper:!!s.keeper,
    preset:ui.preset || (run.preset ? run.preset.name : null), lines:ui.lines || null, pauseMenu:!!HOOKS.pause};
}

/* the same scenario from its setup snapshot, at once: the same seed, the same places, the same ball and launch, the
   same bodies (back to the pool and taken again, each put back to the state it was built in); the controls let go,
   the simulation new, the runner's flags and notices cleared. The camera and the HUD stay up */
export function restart(){
  const run = RUN.cur; if (!run || !run.T || !RUN.setup) return false;
  const T = run.T, spec = T.spec;
  if (T.V) viewDispose(T.V);
  T.V = null;
  returnBodies();
  const B = takeBodies(need(RUN.setup));
  const {ms, bodyOf} = buildMatch(RUN.setup, spec, B);
  T.ms = ms; T.me = ms.agents[ms.me]; T.bodyOf = a => bodyOf.get(a.id) || null; T.fpBody = B.fp;
  runFlags(T);
  // you where your agent starts, looking the way the setup faces you (a cut: the camera does not glide there), and
  // the controls let go from that look
  const a = T.me, F = T.F;
  P.x = a.m.x + F.cx; P.z = a.m.z + F.cz; P.yaw = RUN.setup.me.yaw; P.pitch = 0;
  controlReset();
  T.V = viewInit(ms, T.group, T.kits, viewOpts(T, HOST.look()));
  T.V.me = ms.me;
  // (what happened before this go is not this go's: the mode's enter does the same at activation)
  T.evFrom = T.evSeen = ms.events.length;
  run.state = "play"; run.wait = 0; run.verdict = null;
  RUN.restarts++;
  THUD.thudShow(thudInfo(run));
  emit();
  return true;
}

/* the scenario stops: its mode ends (the bodies go back to the pool, the HUD and the camera with it), its task goes,
   and you are back walking in the cage where you were. reason: 'quit' (Esc without a pause card, the hub's End it),
   'hub' and 'config' (the pause card's Return to Hub and Return to Configuration), 'replay', 'done', 'ended' (the
   mode ended under it: a zone change), 'exit' (Training is left) */
export function stopScenario(reason = "quit"){
  const run = RUN.cur; if (!run) return false;
  RUN.cur = null; RUN.paused = false;
  if (RUN.task){ SCHED.remove(RUN.task); RUN.task = null; }
  if (mode() === "train" && TRUN.T === run.T) exitMode(reason === "done" ? "done" : "quit");
  if (run.T){ if (run.T.V){ viewDispose(run.T.V); run.T.V = null; } run.T.done = true; }
  returnBodies();
  // what Replay Last plays: this run's own setup snapshot, as it started
  RUN.last = {id:run.id, config:copy(run.config), setup:copy(RUN.setup), kind:run.kind, preset:run.preset};
  THUD.thudHide();
  // back to the mode you walked about in (the sandbox's) unless Training is over. On a change of place ('ended') only
  // a mode that stays on through a zone change goes back on (the sandbox's does: a pitch change keeps you in
  // Training); a mode the change of place would end anyway stays off
  const pf = run.prev && run.prev !== "life" ? run.prevFlags : null;
  if (reason !== "exit" && pf && (reason !== "ended" || pf.leaveOnZone === false) && mode() === "life") enterMode(run.prev, run.prevArg);
  emit();
  // (the hub hears it: Esc out of a scenario opens it on that scenario's category)
  if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("train:scenario", {detail:{state:"stopped", reason, id:run.id, category:run.sc.category}}));
  return true;
}
/* the last scenario again from the setup snapshot it started from (not where its last go ended, and not changed by
   any configuration edit since). With a scenario playing, the last one is the one before it: this one stops first.
   On the cage that setup was made for (switched under the fade when another is up). Returns as startScenario does */
export function replay(){
  const L = RUN.last; if (!L || RUN.pending) return false;
  const sc = REG.get(L.id); if (!sc || !CAGE || !CAGE.spec) return false;
  const last = {id:L.id, config:copy(L.config), setup:copy(L.setup), kind:L.kind, preset:L.preset};
  if (RUN.cur) stopScenario("replay");
  const go = () => play(sc, last.config, last.setup, last.preset);
  if (last.kind && CAGES[last.kind] && last.kind !== CAGE.kind) return switchThen(last.kind, go);
  return go();
}
export const running = () => !!RUN.cur;
export const paused = () => !!(RUN.cur && RUN.paused);
// the pause card holds the simulation (on) or lets it go on (off)
export function setPaused(on){ RUN.paused = !!(on && RUN.cur); return RUN.paused; }

/* ---------- the reset state, as one hash (tests) ----------
   Everything a reset has to put back (BUILD-PLAN P4-B item 4, TRAINING-SPEC 4): every agent whole (position,
   velocity, facing, act, state and its time, plan, intent and shield, cooldowns, recovery, challenge, stagger and
   ground state, stamina, the gait clock and phase: the whole agent record), every drawn body (its view record: clip,
   act, reception; the body's own animation state from pool.js bodyData: mode, clip, upper layers, inertialisation
   and IK buffers, gait), the ball and every extra ball, the match (possession, chain, call, the restart and phase,
   the judge queue, the time and step, the seed, the kick, the events so far, the sim.on handle count), the controls,
   and the runner's own flags, notice and timers. See the header for what is left out and why */
function canon(v, seen, depth){
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === "number") return Number.isFinite(v) ? Math.round(v*1e6)/1e6 : String(v);
  if (t === "string" || t === "boolean") return v;
  if (t === "function" || t === "symbol" || t === "bigint") return undefined;
  if (ArrayBuffer.isView(v)) return Array.from(v, x => Number.isFinite(x) ? Math.round(x*1e6)/1e6 : String(x));
  if (seen.has(v)) return "#ref";
  if (depth > 7) return "#deep";
  const pr = Object.getPrototypeOf(v);
  if (!Array.isArray(v) && pr !== Object.prototype && pr !== null) return v.isObject3D || v.isMaterial || v.isBufferGeometry ? "#three" : "#" + (pr && pr.constructor ? pr.constructor.name : "obj");
  seen.add(v);
  let out;
  if (Array.isArray(v)) out = v.map(x => { const c = canon(x, seen, depth + 1); return c === undefined ? null : c; });
  else { out = {}; for (const k of Object.keys(v).sort()){ const c = canon(v[k], seen, depth + 1); if (c !== undefined) out[k] = c; } }
  seen.delete(v);
  return out;
}
const C = v => canon(v, new Set(), 0);
/* the controls' state a reset lets go of (control.js controlReset): what is held and charging, the queue, the look's
   history per step and the aim points. Not in it: what the controls work out afresh every step from the play (ctx,
   resolve), the times of the last presses (lmbT, rmbT: wall clock), the last strike's shape (ret.kind, wind.side), and
   what the device has learnt (uses, tipAsked, tipFS: the hints' counts, kept on purpose) */
const CTRL_RESET = ["lmb", "rmb", "queue", "charge", "scan", "rHeld", "jockey", "shield", "note", "ring", "eHeld", "acro", "lastShotT", "gx", "gy", "gi", "hy", "hp", "aim", "ground"];
const pick = (o, keys) => { const r = {}; for (const k of keys) r[k] = o ? o[k] : undefined; return r; };
export function digestState(){
  const run = RUN.cur; if (!run || !run.T) return null;
  const T = run.T, ms = T.ms, V = T.V;
  const agents = ms.agents.map(a => C(a));
  const bodies = V ? V.rec.map(Rr => Rr ? {id:Rr.a.id, rec:C(pick(Rr, ["st", "clip", "kind", "recv", "cel", "x", "z", "hidden", "pos"])), body:bodyData(Rr.h)} : null) : [];
  const fp = V && V.fp ? bodyData(V.fp) : null;
  let subs = 0; for (const k in ms.subsFn) subs += (ms.subsFn[k] || []).length;
  const match = C(pick(ms, ["poss", "chain", "call", "restart", "phase", "judgeQ", "judgeLast", "t", "step", "seed", "kick", "half", "score", "restartLog", "physQ", "deadBall", "carrierEval", "planSeq", "zone", "lapseT", "lapseBy"]));
  const ball = C(ms.ball), extra = C((ms.spares || []).map(s => ({state:s.state, cone:s.cone, ball:s.ball === ms.ball ? "#main" : s.ball})));
  const runner = C({state:run.state, wait:run.wait, verdict:run.verdict, paused:RUN.paused, id:run.id, kind:run.kind,
    T:pick(T, ["t", "acc", "tRep", "slow", "done", "evFrom", "evSeen", "sprintD", "goalAt", "bounces", "feed", "fedAt", "fedBounces", "inPlay", "ballSeen", "phase", "quit", "qs"]),
    hud:THUD.thudState ? THUD.thudState() : null});
  const ctrl = C(Object.assign(pick(CTRL, CTRL_RESET), {held:Object.keys(CTRL.held).filter(k => CTRL.held[k]).sort(),
    ret:pick(CTRL.ret, ["on", "x", "y", "z", "ok"]), wind:pick(CTRL.wind, ["p", "over", "kind"])}));
  return {agents, bodies, fp, subs, events:ms.events.length, match, ball, extra, runner, ctrl};
}
export function digest(){
  const s = digestState(); if (!s) return null;
  const parts = Object.entries(s).map(([k, v]) => k + ":" + hashStr(JSON.stringify(v)).toString(16));
  return {hash:hashStr(parts.join("|")).toString(16), parts};
}

// leaving Training stops whatever plays (sandbox.js fires train:exit; it never imports this module)
if (typeof addEventListener === "function") addEventListener("train:exit", () => { stopScenario("exit"); RUN.last = null; RUN.setup = null; poolDispose(); });
// a new place being built (a pitch change): whatever played there is over, its task gone with the place's
onBegin(() => { if (RUN.cur) stopScenario("ended"); });

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainRun = {RUN, CATEGORIES, LIMITS, POOL_DRILL, registerScenario, startScenario, restart, stopScenario, replay, scenario, scenariosOf, poolStats,
  digest, digestState, setPaused, paused};
