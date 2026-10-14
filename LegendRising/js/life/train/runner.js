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
      ball: {x, y, z, vx, vy, vz, free}}
   The runner plays it on the match's own simulation (sim.js createMatch with the training mode, its laws from the
   setup, out of play included), with the match's own controls, camera, HUD and bodies: training.js's mode train,
   handed an item of the runner's (pooled bodies from pool.js, no officials drawn, one SCHED.fixed task stepping the
   simulation). Starting again (Backspace, restart()) puts back exactly the setup it started from: a new simulation
   from the same setup and seed, the same pooled bodies, nothing built, the camera, HUD and controls kept. A pitch
   change rebuilds the cage zone, which ends a scenario (the mode leaves on a zone change). Leaving Training
   (train:exit, fired by sandbox.js) stops whatever runs. Nothing here touches the career. */
import {onBegin} from "../build.js";
import {P, FLAGS} from "../core/state.js";
import {enterMode, exitMode, mode, modeArg} from "../core/modes.js";
import {SCHED} from "../core/sched.js";
import {createMatch, REF, AR1, AR2, TEMPO} from "../football/sim.js";
import {MODES} from "../football/rules.js";
import {refreshPred} from "../football/actions.js";
import {attrsForAI, attrsForPlayer} from "../football/attrs.js";
import {goalsLaw} from "../football/trainspec.js";
import {controlReset} from "../football/control.js";
import {viewInit, viewDispose} from "../football/view.js";
import {RUN as TRUN, fixedRun, viewOpts} from "../football/training.js";
import {CAGE} from "./cage.js";
import {takeBodies, returnBodies, poolStats, poolMeLook, poolDispose, KITS, POOL_DRILL} from "./pool.js";
import * as THUD from "./thud.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = .11;

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
   RUN.cur: the scenario playing ({id, sc, config, T}) or null; RUN.setup: the setup it started from (what a restart
   puts back); RUN.ms: its simulation; RUN.last: the last one played ({id, config, setup}, what Replay starts again);
   RUN.task: the one scheduler task stepping it; RUN.starts and RUN.restarts count (tests) */
export const RUN = {cur:null, setup:null, last:null, task:null, starts:0, restarts:0, get ms(){ return RUN.cur && RUN.cur.T ? RUN.cur.T.ms : null; }, get T(){ return RUN.cur ? RUN.cur.T : null; }};

// the most agents a drill may have (G0 decision h): me, five team-mates, six opponents and a keeper
export const LIMITS = Object.freeze({mates:5, opps:6, agents:13});
// the training mode of the simulation (rules.js MODES; P3-A adds 'train', with laws.out)
const SIM_MODE = MODES.includes("train") ? "train" : "drill";

const num = (v, d) => Number.isFinite(+v) ? +v : d;
// a setup made safe: counts within the limits, every number a number, everyone inside the movers' run-off
export function cleanSetup(s, spec){
  const B = spec.runoff || {hx:spec.hx + 2, hz:spec.hz + 2};
  const pt = (p, d = {}) => ({slot:typeof (p && p.slot) === "string" ? p.slot : d.slot || "CM", x:clamp(num(p && p.x, 0), -B.hx, B.hx), z:clamp(num(p && p.z, 0), -B.hz, B.hz),
    yaw:num(p && p.yaw, 0), at:p && p.at && typeof p.at === "object" ? Object.assign({}, p.at) : null, ovr:clamp(num(p && p.ovr, 60), 1, 99)});
  const b = s.ball || {};
  return {
    myTeam:s.myTeam === 1 ? 1 : 0, role:String(s.role || ""), seed:num(s.seed, 1) >>> 0,
    laws:Object.assign({}, s.laws || {}),
    me:pt(s.me, {slot:"CM"}),
    mates:(s.mates || []).slice(0, LIMITS.mates).map(p => pt(p, {slot:"CM"})),
    opps:(s.opps || []).slice(0, LIMITS.opps).map(p => pt(p, {slot:"CB"})),
    keeper:s.keeper ? Object.assign(pt(s.keeper, {slot:"GK"}), {slot:"GK", side:s.keeper.side === "mine" ? "mine" : "theirs"}) : null,
    ball:{x:clamp(num(b.x, 0), -B.hx, B.hx), y:Math.max(R, num(b.y, R)), z:clamp(num(b.z, 0), -B.hz, B.hz), vx:num(b.vx, 0), vy:num(b.vy, 0), vz:num(b.vz, 0), free:!!b.free}
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

/* the simulation for a setup, and the pooled body of each agent. Returns {ms, bodyOf: Map(agentId -> body)} */
function buildMatch(setup, spec, B){
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
  const b = ms.ball, s = setup.ball;
  b.p.x = s.x; b.p.y = s.y; b.p.z = s.z; b.v.x = s.vx; b.v.y = s.vy; b.v.z = s.vz; b.w.x = b.w.y = b.w.z = 0;
  b.state = s.free || Math.hypot(s.vx, s.vy, s.vz) > 0 ? "free" : "dead";
  // play is on from the first step: no kick-off, no restart pending (a set piece's own scenario sets one itself)
  ms.restart = null; ms.phase = "live";
  for (const a of ms.agents) a.set = null;
  refreshPred(ms);
  return {ms, bodyOf};
}

// the kits by team (home is team 0's): my side's bib on my team, whichever way it attacks
const kitsFor = myTeam => myTeam === 1 ? {home:KITS.theirs, away:KITS.mine} : {home:KITS.mine, away:KITS.theirs};
// what the runner's items ask of a host (training.js's mode train): looks and kits, no clock and no career
const HOST = Object.freeze({look:() => poolMeLook(), kits:() => kitsFor(RUN.setup ? RUN.setup.myTeam : 0), clubShort:() => "YOU", pass(){}, xp:() => 0});

// the counts a setup takes from the pool
const need = s => ({mine:s.mates.length, theirs:s.opps.length, keeper:!!s.keeper});

/* ---------- start, restart, stop ---------- */
// config: the scenario's configuration (P4-A builds it; a scenario fills in its own defaults). Resolves to true when
// it is playing, false when it could not start (another is running, an unknown id, no cage)
export function startScenario(id, config = {}){
  const sc = REG.get(id);
  if (!sc) return false;
  if (RUN.cur) return false;
  if (!CAGE || !CAGE.spec) return false;
  const spec = CAGE.spec;
  const setup = cleanSetup(sc.build(config || {}, {cage:CAGE, spec, limits:LIMITS}) || {}, spec);
  return play(sc, config || {}, setup);
}
function play(sc, config, setup){
  const spec = CAGE.spec;
  const B = takeBodies(need(setup));
  if (!B) return false;
  const {ms, bodyOf} = buildMatch(setup, spec, B);
  const run = {id:sc.id, sc, config, T:null, prev:mode(), prevArg:modeArg(), state:"play", wait:0, verdict:null};
  const T = itemFor(run, setup, spec, ms, bodyOf, B);
  run.T = T;
  RUN.cur = run; RUN.setup = setup; RUN.starts++;
  // one scheduler task steps the simulation (perf-8), only while a scenario plays
  RUN.task = SCHED.fixed({id:"train-sim", hz:60, maxSteps:4, kind:"zone", run:h => { if (RUN.cur === run && run.T) fixedRun(run.T, h); }});
  T.fixed = RUN.task;
  P.yaw = setup.me.yaw;
  enterMode("train", T);
  THUD.thudShow(thudInfo(run));
  emit();
  return true;
}
function itemFor(run, setup, spec, ms, bodyOf, B){
  const F = spec.frame || {cx:0, cz:0};
  const T = {item:{kind:"scenario", score:false, restarts:setup.laws.out === "stop" || !!setup.laws.restarts, kickoff:false}, spec, F, ac:{x:0, z:0}, ms, me:ms.agents[ms.me],
    myTeam:setup.myTeam, oppTeam:1 - setup.myTeam, bodies:new Map(), V:null, t:0, acc:0, host:HOST, evFrom:0, evSeen:0, tries:0, rep:0, results:[], xp:{}, xpRaw:0,
    qs:[], done:false, phase:"play", tRep:0, opts:{}, onEnd:null, traits:{}, sprintD:0, ballSeen:true, inPlay:false, goalAt:null, bounces:0, rate:0,
    kits:kitsFor(setup.myTeam), officials:false, fpBody:B.fp, bodyOf:a => bodyOf.get(a.id) || null, fixed:null};
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
    preset:ui.preset || null, lines:ui.lines || null};
}

/* the same scenario from its setup, at once: the same seed, the same places, the same ball, the same bodies (back to
   the pool and taken again); the controls let go, the simulation new. The camera and the HUD stay up */
export function restart(){
  const run = RUN.cur; if (!run || !run.T || !RUN.setup) return false;
  const T = run.T, spec = T.spec;
  if (T.V) viewDispose(T.V);
  T.V = null;
  returnBodies();
  const B = takeBodies(need(RUN.setup));
  const {ms, bodyOf} = buildMatch(RUN.setup, spec, B);
  T.ms = ms; T.me = ms.agents[ms.me]; T.bodyOf = a => bodyOf.get(a.id) || null; T.fpBody = B.fp;
  T.t = 0; T.acc = 0; T.tRep = 0; T.slow = null; T.done = false; T.evFrom = 0; T.evSeen = 0; T.sprintD = 0; T.goalAt = null; T.bounces = 0; T.feed = null;
  controlReset();
  T.V = viewInit(ms, T.group, T.kits, viewOpts(T, HOST.look()));
  T.V.me = ms.me;
  // you where your agent starts, looking the way the setup faces you (a cut: the camera does not glide there)
  const a = T.me, F = T.F;
  P.x = a.m.x + F.cx; P.z = a.m.z + F.cz; P.yaw = RUN.setup.me.yaw; P.pitch = 0;
  run.state = "play"; run.wait = 0; run.verdict = null;
  RUN.restarts++;
  THUD.thudShow(thudInfo(run));
  emit();
  return true;
}

/* the scenario stops: its mode ends (the bodies go back to the pool, the HUD and the camera with it), its task goes,
   and you are back walking in the cage where you were. reason: 'quit' (Esc), 'done', 'ended' (the mode ended under
   it: a zone change), 'exit' (Training is left) */
export function stopScenario(reason = "quit"){
  const run = RUN.cur; if (!run) return false;
  RUN.cur = null;
  if (RUN.task){ SCHED.remove(RUN.task); RUN.task = null; }
  if (mode() === "train" && TRUN.T === run.T) exitMode(reason === "done" ? "done" : "quit");
  if (run.T){ if (run.T.V){ viewDispose(run.T.V); run.T.V = null; } run.T.done = true; }
  returnBodies();
  RUN.last = {id:run.id, config:run.config, setup:RUN.setup};
  THUD.thudHide();
  // back to the mode you walked about in (the sandbox's), unless the place itself is changing or Training is over
  if (reason !== "ended" && reason !== "exit" && run.prev && run.prev !== "life" && mode() === "life") enterMode(run.prev, run.prevArg);
  emit();
  // (the hub hears it: Esc out of a scenario opens it on that scenario's category)
  if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("train:scenario", {detail:{state:"stopped", reason, id:run.id, category:run.sc.category}}));
  return true;
}
// the last scenario again from the setup it started from (not where the last go ended)
export function replay(){
  const L = RUN.last; if (!L || RUN.cur) return false;
  const sc = REG.get(L.id); if (!sc || !CAGE || !CAGE.spec) return false;
  return play(sc, L.config, L.setup);
}
export const running = () => !!RUN.cur;

// leaving Training stops whatever plays (sandbox.js fires train:exit; it never imports this module)
if (typeof addEventListener === "function") addEventListener("train:exit", () => { stopScenario("exit"); RUN.last = null; RUN.setup = null; poolDispose(); });
// a new place being built (a pitch change): whatever played there is over, its task gone with the place's
onBegin(() => { if (RUN.cur) stopScenario("ended"); });

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainRun = {RUN, CATEGORIES, LIMITS, POOL_DRILL, registerScenario, startScenario, restart, stopScenario, replay, scenario, scenariosOf, poolStats};
