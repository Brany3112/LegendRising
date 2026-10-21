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
     a fixed pitch gets it through config.js validate. Returning to the hub never switches back.

   P5-A (Training Mode Phase 5, BUILD-PLAN Phase 5 "Contracts" runner.js and P5-A work items 1b, 3 and 4; TRAINING-SPEC 4,
   the admin panel: "live where safe, otherwise applied at the next safe state with a note"):
   - applyLive(fn) runs fn(ms) between two simulation steps (at once when no step is running, else right after it):
     for changes that are safe mid-play (attribute values, stamina, tunables, the keeper's attributes). false when
     nothing plays.
   - queueChange({key, label, apply(config)}) holds a change until the next safe state (a restart, a replay, a new
     start: Phase 8's resets call takePending too) and applies it to the configuration before anything is spawned; a
     later change with the same key takes the earlier one's place. RUN.pending lists them ({key, label}, oldest first;
     null when there are none) and the Training HUD shows each label as a note ("Applies on restart: 4 defenders"). A
     restart with changes waiting is a new start of the scenario from the changed configuration (its setup is made
     again), so Replay Last still plays the setup from before the change. A scenario stopped with changes still
     waiting (Return to Configuration, Return to Hub, Esc) takes them into its own configuration as it stops, so
     they never land on the next start of something else and the sheet shows what Start will play.
   - The start waiting on a pitch change is RUN.switching (it was RUN.pending up to Phase 4; the name now belongs to
     the contract's queue).
   - My height and foot (setup.me.scale and setup.me.foot, teams.js from config.me.height and config.me.prefFoot): my
     player record gets them, and at every start and restart my pooled body is built again at that scale when it is
     not already (pool.js replaceMe, under the fade), the sandbox body with it (core/me.js sandboxHeight), so the eye,
     the capsules and the body drawn all agree inside and outside a scenario.
   - A participant's drill behaviour (setup p.drill = {behave: 'stand' | 'jockey' | 'press'}, Free Play's practice
     opponents) is put on his agent (a.drill, with his spawn point): brain.js reads it in the training mode only.

   P6-B (Training Mode Phase 6, BUILD-PLAN P6-B work items 1, 4 and 7; TRAINING-SPEC 2, offside notices, and 5, instant
   replay):
   - The team scenarios (scen-team.js, handed over by scen-attack.js, scen-defend.js and scen-match.js) are registered
     here as they come (drillSink). The simulation of a setup is scen-team.js matchOf, the one builder the runner and
     the Node tests share; a setup may carry the scenario's tempo (setup.tempo, sim.js cfg.tempo: AI-4) and its plan
     (setup.plan: the objective and the scripted runs, plain data kept in the snapshot). A scenario's step, judge and
     ui see the setup it started from as run.setup.
   - Offside (OFF-2): when the flag goes up in a scenario, the Training HUD says who was offside and by how much, in
     the match's words (controller.js offside notice).
   - Sound: a start asks for the match's audio (audio.js AUD.init), so the kicks and the team-mates' calls are heard.
   - Instant replay: every go is recorded (replay.js, the match's own ring, 12 s) and a go a scenario decides with a
     goal it wants replayed (verdict.replay) is played back from the match's replay cameras, framed on the cage, before
     the next go: the simulation waits, Space, Enter or Esc skips it, and the next go starts as it would have. */
import {onBegin} from "../build.js";
import {P, FLAGS} from "../core/state.js";
import {enterMode, exitMode, mode, modeArg, modeFlags} from "../core/modes.js";
import {SCHED} from "../core/sched.js";
import {MODES, clearCtl, liveRoll} from "../football/rules.js";
import {refreshPred} from "../football/actions.js";
import {attrsForAI, attrsForPlayer} from "../football/attrs.js";
import {CAGES} from "../football/cagespec.js";
import {hashStr} from "../football/rng.js";
import {recInit, rec as recStep, clip as recClip, play as replayPlay, playing as replayPlaying, skip as replaySkip, replayStep} from "../football/replay.js";
import {controlReset, CTRL} from "../football/control.js";
import {viewInit, viewDispose, viewPreStep} from "../football/view.js";
import {RUN as TRUN, fixedRun, viewOpts} from "../football/training.js";
import {CAGE, cageEnter} from "./cage.js";
import {takeBodies, returnBodies, poolStats, poolMeLook, poolDispose, bodyData, replaceMe, KITS, POOL_DRILL} from "./pool.js";
import {sandboxHeight} from "../core/me.js";
import * as THUD from "./thud.js";
import {scaleOfHeight, defaultHeight} from "./config.js";
import {matchOf, drillSink} from "./scen-team.js";
import {AUD} from "../football/audio.js";

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
   up (the task does not step); RUN.switching: a start waiting on a pitch change (a promise); RUN.pending: the changes
   queued for the next safe state ({key, label}, or null: P5-A); RUN.starts and RUN.restarts count (tests) */
export const RUN = {cur:null, setup:null, last:null, task:null, paused:false, switching:null, pending:null, starts:0, restarts:0, replays:0,
  get ms(){ return RUN.cur && RUN.cur.T ? RUN.cur.T.ms : null; }, get T(){ return RUN.cur ? RUN.cur.T : null; }};

// the most agents a drill may have (G0 decision h): me, five team-mates, six opponents and a keeper
export const LIMITS = Object.freeze({mates:5, opps:6, agents:13});
// the training mode of the simulation (rules.js MODES; P3-A adds 'train', with laws.out)
const SIM_MODE = MODES.includes("train") ? "train" : "drill";

const num = (v, d) => Number.isFinite(+v) ? +v : d;
// a setup made safe: counts within the limits, every number a number, everyone inside the movers' run-off
export function cleanSetup(s, spec){
  const B = spec.runoff || {hx:spec.hx + 2, hz:spec.hz + 2};
  const pt = (p, d = {}) => {
    const o = {slot:typeof (p && p.slot) === "string" ? p.slot : d.slot || "CM", x:clamp(num(p && p.x, 0), -B.hx, B.hx), z:clamp(num(p && p.z, 0), -B.hz, B.hz),
      yaw:num(p && p.yaw, 0), at:p && p.at && typeof p.at === "object" ? copy(p.at) : null, ovr:clamp(num(p && p.ovr, 60), 1, 99)};
    // (P5-A) a practice opponent's behaviour (brain.js, the training mode only)
    if (p && p.drill && BEHAVES.includes(p.drill.behave)) o.drill = {behave:p.drill.behave};
    return o;
  };
  // (P5-A) my body: the whole-body scale my height gives and my preferred foot, when the setup says (teams.js)
  const meBody = p => {
    const o = {};
    if (p && Number.isFinite(+p.scale) && +p.scale > 0) o.scale = +clamp(+p.scale, .85, 1.15).toFixed(3);
    if (p && FOOT_OF[p.foot]) o.foot = FOOT_OF[p.foot];
    return o;
  };
  const b = s.ball || {};
  // the launch's kind: the setup's own, else the configuration's (P4-A teams.js keeps the configuration on the setup)
  const L = s.config && s.config.ball && s.config.ball.launch;
  const kind = typeof b.kind === "string" ? b.kind : L && typeof L.kind === "string" ? L.kind : null;
  const ps = s.poss && typeof s.poss === "object" ? {team:s.poss.team === 0 || s.poss.team === 1 ? s.poss.team : -1, who:typeof s.poss.who === "string" ? s.poss.who : null, i:num(s.poss.i, -1) | 0} : null;
  return {
    myTeam:s.myTeam === 1 ? 1 : 0, role:String(s.role || ""), seed:num(s.seed, 1) >>> 0,
    laws:Object.assign({}, s.laws || {}),
    me:Object.assign(pt(s.me, {slot:"CM"}), meBody(s.me)),
    mates:(s.mates || []).slice(0, LIMITS.mates).map(p => pt(p, {slot:"CM"})),
    opps:(s.opps || []).slice(0, LIMITS.opps).map(p => pt(p, {slot:"CB"})),
    keeper:s.keeper ? Object.assign(pt(s.keeper, {slot:"GK"}), {slot:"GK", side:s.keeper.side === "mine" ? "mine" : "theirs"}) : null,
    ball:{x:clamp(num(b.x, 0), -B.hx, B.hx), y:Math.max(R, num(b.y, R)), z:clamp(num(b.z, 0), -B.hz, B.hz), vx:num(b.vx, 0), vy:num(b.vy, 0), vz:num(b.vz, 0),
      wx:num(b.wx, 0), wy:num(b.wy, 0), wz:num(b.wz, 0), kind, free:!!b.free},
    poss:ps, notes:Array.isArray(s.notes) ? s.notes.filter(n => typeof n === "string").slice(0, 8) : [],
    // (P6-B) the scenario's tempo (numbers only) and its plan (plain data: the objective, the runs)
    tempo:cleanTempo(s.tempo), plan:s.plan && typeof s.plan === "object" ? copy(s.plan) : null
  };
}
const cleanTempo = t => {
  if (!t || typeof t !== "object") return null;
  const o = {};
  for (const k of ["directness", "shotBias", "pressMul"]) if (Number.isFinite(+t[k])) o[k] = clamp(+t[k], 0, 4);
  return Object.keys(o).length ? o : null;
};
// the practice opponents' behaviours (P5-A, brain.js drillMove) and the feet a setup may name
export const BEHAVES = Object.freeze(["stand", "jockey", "press"]);
const FOOT_OF = Object.freeze({Right:"Right", R:"Right", Left:"Left", L:"Left", Both:"Both", B:"Both"});
const POS_OF = {GK:"GK", LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", RF:"ST", CF:"ST", ST:"ST"};
// my attributes (G0 decision e): the held career's skills on the day when there is one, else an even 60 for my slot
function myAttrs(p){
  if (p.at) return p.at;
  const sk = typeof heldSkills === "function" ? heldSkills() : null;
  if (sk) return attrsForPlayer(sk, {}, {});
  return attrsForAI({id:1, ovr:p.ovr, pos:POS_OF[p.slot] || "CM"});
}
const myFoot = () => { const f = typeof heldFoot === "function" ? heldFoot() : null; return f === "Left" || f === "L" ? "Left" : f === "Both" || f === "B" ? "Both" : "Right"; };

/* the simulation for a setup, and the pooled body of each agent. Returns {ms, bodyOf: Map(agentId -> body)}. The
   setup is read, never written (scen-team.js matchOf, P6-B: the one builder, which the Node tests use too) */
function buildMatch(setup, spec, B){
  const myTeam = setup.myTeam, oppTeam = 1 - myTeam;
  const bodies = [[], []];
  bodies[myTeam].push(B.me, ...setup.mates.map((p, i) => B.mine[i]));
  bodies[oppTeam].push(...setup.opps.map((p, i) => B.theirs[i]));
  if (setup.keeper) bodies[setup.keeper.side === "mine" ? myTeam : oppTeam].push(B.keeper);
  const {ms} = matchOf(setup, spec, SIM_MODE, {foot:setup.me.foot || myFoot(), meAt:myAttrs(setup.me),
    scaleOf:(t, i) => bodies[t][i] && bodies[t][i].scale});
  const bodyOf = new Map();
  for (const t of [0, 1]){
    ms.agents.filter(a => a.team === t && a.role === "player").forEach((a, i) => { if (bodies[t][i]) bodyOf.set(a.id, bodies[t][i]); });
  }
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
   Returns true when it is playing, or will be once the cage of the configured pitch is up (RUN.switching is that
   promise, resolving to whether it started); false when it cannot start (another is running or starting, an unknown
   id, no cage) */
export function startScenario(id, config = {}, opts = {}){
  const sc = REG.get(id);
  if (!sc) return false;
  if (RUN.cur || RUN.switching) return false;
  if (!CAGE || !CAGE.spec) return false;
  // (P5-A) the changes queued for the next safe state go into the configuration first; a preset is no longer what
  // plays once one of them has changed it
  const cfg = takePending(copy(config || {}), sc), changed = cfg.__changed; delete cfg.__changed;
  const preset = presetFor(sc, cfg, changed ? {} : opts);
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
// (Training left while it switches: cage.js gives the switch up and it resolves to null; nothing starts.) A sheet put
// up while it switched (the hub on Esc) is still up when it plays: the scenario starts held, as the pause card holds
// it, and the card comes up once the sheet goes (nothing runs behind the hub). With no pause card there is no hold
function switchThen(kind, fn){
  const p = RUN.switching = cageEnter(kind).then(c => {
    RUN.switching = null;
    if (!c || RUN.cur || !CAGE.spec || CAGE.kind !== kind) return false;
    const ok = fn();
    if (ok && RUN.cur && sheetUp()) holdUnderSheet();
    return ok;
  }, e => { console.error(e); RUN.switching = null; return false; }).then(ok => {
    if (!ok){ emit(); if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("train:scenario", {detail:{state:"failed"}})); }
    return !!ok;
  });
  emit();
  return !!p;
}
// (the hub is up from the moment it opens, before its sheet has slid in: hub.js gives window.trainHubOpen)
const sheetUp = () => { const r = typeof document !== "undefined" && document.getElementById("sheetRoot");
  return !!r && (r.classList.contains("open") || (typeof window.trainHubOpen === "function" && window.trainHubOpen())); };
function holdUnderSheet(){
  const T = RUN.cur && RUN.cur.T;
  if (HOOKS.pause && T){ try { HOOKS.pause(T); } catch(e){ console.error(e); } }
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
  returnBodies();
  fitMe(setup);
  const B = takeBodies(need(setup));
  if (!B) return false;
  const {ms, bodyOf} = buildMatch(setup, spec, B);
  const run = {id:sc.id, sc, config:copy(config), T:null, prev:mode(), prevArg:modeArg(), prevFlags:modeFlags(), state:"play", wait:0, verdict:null,
    preset:preset ? {id:preset.id || null, name:String(preset.name)} : null, kind:CAGE.kind};
  const T = itemFor(run, setup, spec, ms, bodyOf, B);
  run.T = T;
  RUN.cur = run; RUN.setup = copy(setup); RUN.starts++; RUN.paused = false;
  // (P6-B) the scenario's step, judge and ui see the setup it started from
  run.setup = RUN.setup;
  // one scheduler task steps the simulation (perf-8), only while a scenario plays and is not paused (nor replayed)
  RUN.task = SCHED.fixed({id:"train-sim", hz:60, maxSteps:4, kind:"zone", run:h => { if (RUN.cur === run && run.T && !RUN.paused && !run.replaying) stepRun(run, h); }});
  T.fixed = RUN.task;
  P.yaw = setup.me.yaw; P.pitch = 0;
  enterMode("train", T);
  // (P6-B) the match's sound in a scenario too: the kicks, the team-mates' calls (spoken when the setting allows). The
  // train mode never asked for it, so a call in Training was silent; the context is made at the page's first gesture
  try { AUD.init(); } catch(e){ console.error(e); }
  goStart(run);
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
      // (P6-B) the go's record for an instant replay, and the flag's notice
      recStep(T.ms);
      offsideNotes(run, T);
      if (sc.step) sc.step(T, run);
      if (run.state === "play" && sc.judge){
        const v = sc.judge(T, run);
        if (v && v.done){ run.state = "result"; run.wait = 1.6; run.verdict = v; T.results.push(v); THUD.thudNotice(v.text || (v.ok ? "Well done" : "Not this time"), v.ok); }
      } else if (run.state === "result" && (run.wait -= 1/60) <= 0){
        // the go is over: its goal again when it asks for an instant replay (P6-B), then the same setup again (a
        // scenario that plays once says repeat false and ends here)
        if (run.verdict && run.verdict.replay && startReplay(run)) return;
        nextGo(run);
      }
    },
    frame(T, real){ if (run.replaying) replayStep(Math.max(0, +real || 0)); THUD.thudFrame(T); }
  };
  return T;
}
/* ---------- a go's own extras (P6-B): the flag's notice and the instant replay ---------- */
// at the start of every go (a start, a restart): the replay's record from now, no notice owed for what came before
function goStart(run){
  const T = run.T; if (!T) return;
  run.offSeen = T.ms.events.length;
  recInit(T.ms, 20, 12, T.V);
}
// the flag up (OFF-2): who was offside and by how much, in the match's words (controller.js)
export function offsideText(ms, ev, myTeam){
  const m = (+ev.margin || 0).toFixed(1);
  if (ev.agent === ms.me) return `Offside. You were ${m} m past the last defender when the pass was played.`;
  if (ev.team === myTeam) return `Offside. Your team-mate was ${m} m past the last defender.`;
  return `Offside against them. Their man was ${m} m past your last defender.`;
}
function offsideNotes(run, T){
  const E = T.ms.events;
  for (let i = run.offSeen || 0; i < E.length; i++){
    const e = E[i];
    if (e.kind === "offside"){ run.offNotes = (run.offNotes || 0) + 1; THUD.thudNotice(offsideText(T.ms, e, T.myTeam), false); }
  }
  run.offSeen = E.length;
}
// the next go, or the end of a scenario that plays once
function nextGo(run){
  if (RUN.cur !== run) return;
  if (run.verdict && run.verdict.repeat === false) stopScenario("done"); else restart();
}
// the goal again (replay.js, the match's replay cameras framed on the cage): the simulation waits while it plays;
// Space, Enter or Esc skips it; then the next go. false when there is nothing to show
const REPLAY = Object.freeze({BEFORE:6, AFTER:1.2});
function startReplay(run){
  const T = run.T, v = run.verdict;
  if (!T || !T.V || v.goalT == null) return false;
  const c = recClip(v.goalT - REPLAY.BEFORE, v.goalT + REPLAY.AFTER);
  if (!c.frames || c.frames.length < 2) return false;
  const spec = T.spec, end = c.frames[c.frames.length - 1].ball.x < 0 ? -1 : 1;
  run.replaying = true; run.state = "replay"; RUN.replays++;
  replayKeys(true);
  THUD.thudNotice("Replay. Space skips it.", true);
  replayPlay(c, {frame:T.F, cams:[
    {until:.5, fov:38, pos:b => ({x:clamp(b.x*.8, -spec.hx, spec.hx), y:12, z:-(spec.hz + 12)})},
    {until:1, fov:44, pos:b => ({x:end*(spec.hx + 9), y:4.2, z:clamp(b.z*.3, -6, 6)})}]}).then(() => {
    replayKeys(false);
    if (RUN.cur !== run || !run.replaying) return;
    run.replaying = false; run.state = "result";
    nextGo(run);
  });
  return true;
}
// a replay under way stops (a restart, a stop): the simulation is the play's again
function endReplay(run){
  if (!run || !run.replaying) return;
  run.replaying = false;
  replayKeys(false);
  if (replayPlaying()) replaySkip();
}
const RK = {fn:null};
function replayKeys(on){
  if (typeof addEventListener !== "function") return;
  if (on && !RK.fn){
    RK.fn = e => {
      if (e.code !== "Space" && e.code !== "Enter" && e.code !== "NumpadEnter" && e.key !== "Escape") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat && replayPlaying()) replaySkip();
    };
    addEventListener("keydown", RK.fn, true);
  } else if (!on && RK.fn){ removeEventListener("keydown", RK.fn, true); RK.fn = null; }
}

function thudInfo(run){
  const s = RUN.setup, sc = run.sc, ui = sc.ui ? sc.ui(run.T, run) || {} : {};
  return {scenario:ui.name || sc.name, role:ui.role || s.role || "Player", mine:1 + s.mates.length, theirs:s.opps.length, keeper:!!s.keeper,
    preset:ui.preset || (run.preset ? run.preset.name : null), lines:ui.lines || null, pauseMenu:!!HOOKS.pause,
    keys:Array.isArray(ui.keys) ? ui.keys : null, pending:RUN.pending ? RUN.pending.map(c => c.label) : null};
}

/* the same scenario from its setup snapshot, at once: the same seed, the same places, the same ball and launch, the
   same bodies (back to the pool and taken again, each put back to the state it was built in); the controls let go,
   the simulation new, the runner's flags and notices cleared. The camera and the HUD stay up */
export function restart(){
  const run = RUN.cur; if (!run || !run.T || !RUN.setup) return false;
  endReplay(run);
  // (P5-A) changes waiting for this safe state: the scenario starts again from the changed configuration, its setup
  // made again (and this go becomes the last one, what Replay Last plays)
  if (RUN.pending){
    const cfg = takePending(copy(run.config), run.sc); delete cfg.__changed;
    const id = run.id;
    stopScenario("restart");
    return startScenario(id, cfg);
  }
  const T = run.T, spec = T.spec;
  if (T.V) viewDispose(T.V);
  T.V = null;
  returnBodies();
  fitMe(RUN.setup);
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
  goStart(run);
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
  endReplay(run);
  RUN.cur = null; RUN.paused = false;
  if (RUN.task){ SCHED.remove(RUN.task); RUN.task = null; }
  if (mode() === "train" && TRUN.T === run.T) exitMode(reason === "done" ? "done" : "quit");
  if (run.T){ if (run.T.V){ viewDispose(run.T.V); run.T.V = null; } run.T.done = true; }
  returnBodies();
  // what Replay Last plays: this run's own setup snapshot, as it started
  RUN.last = {id:run.id, config:copy(run.config), setup:copy(RUN.setup), kind:run.kind, preset:run.preset};
  // (P5-A) the changes still queued for this scenario are not carried to whatever starts next: stopping is their safe
  // state, so they go into this run's configuration (run.config), which is what Return to Configuration hands the
  // sheet and what the hub keeps for the scenario (the stopped event carries it). Whatever is then picked on the sheet
  // is what plays. Replay Last still plays the setup from before them, as a restart with changes leaves it. (Leaving
  // Training drops them instead: nothing queued outlives it; a restart with changes has already taken them and starts
  // again at once.) The live edits the admin panel made (attributes, foot,
  // the keeper, Free Play's ball spawn) are already in run.config, so the hub keeps them on every stop, whether or
  // not something was also queued
  let kept = null;
  if (reason !== "exit" && reason !== "restart"){
    if (QUEUE.length){ const folded = takePending(copy(run.config), run.sc); delete folded.__changed; run.config = folded; }
    kept = run.config;
  }
  THUD.thudHide();
  // back to the mode you walked about in (the sandbox's) unless Training is over. On a change of place ('ended') only
  // a mode that stays on through a zone change goes back on (the sandbox's does: a pitch change keeps you in
  // Training); a mode the change of place would end anyway stays off
  const pf = run.prev && run.prev !== "life" ? run.prevFlags : null;
  if (reason !== "exit" && pf && (reason !== "ended" || pf.leaveOnZone === false) && mode() === "life") enterMode(run.prev, run.prevArg);
  emit();
  // (the hub hears it: Esc out of a scenario opens it on that scenario's category)
  if (typeof dispatchEvent === "function") dispatchEvent(new CustomEvent("train:scenario", {detail:{state:"stopped", reason, id:run.id, category:run.sc.category, config:kept ? copy(kept) : null}}));
  return true;
}
/* the last scenario again from the setup snapshot it started from (not where its last go ended, and not changed by
   any configuration edit since). With a scenario playing, the last one is the one before it: this one stops first.
   On the cage that setup was made for (switched under the fade when another is up). Returns as startScenario does */
export function replay(){
  const L = RUN.last; if (!L || RUN.switching) return false;
  const sc = REG.get(L.id); if (!sc || !CAGE || !CAGE.spec) return false;
  const last = {id:L.id, config:copy(L.config), setup:copy(L.setup), kind:L.kind, preset:L.preset};
  if (RUN.cur) stopScenario("replay");
  // (P5-A) changes waiting for this safe state: the last configuration with them, its setup made again from it
  if (RUN.pending){
    const cfg = takePending(copy(last.config), sc); delete cfg.__changed;
    return startScenario(last.id, cfg);
  }
  const go = () => play(sc, last.config, last.setup, last.preset);
  if (last.kind && CAGES[last.kind] && last.kind !== CAGE.kind) return switchThen(last.kind, go);
  return go();
}
export const running = () => !!RUN.cur;
export const paused = () => !!(RUN.cur && RUN.paused);
// the pause card holds the simulation (on) or lets it go on (off)
export function setPaused(on){ RUN.paused = !!(on && RUN.cur); return RUN.paused; }

/* ---------- changes from the admin panel (P5-A, the Phase 5 contract) ---------- */
const LIVE = {stepping:false, q:[]};
// one fixed-step call of the scenario's simulation; what applyLive was handed while it ran is applied right after it
function stepRun(run, h){
  LIVE.stepping = true;
  try { fixedRun(run.T, h); }
  finally {
    LIVE.stepping = false;
    if (LIVE.q.length){ const q = LIVE.q.splice(0); for (const fn of q) liveNow(fn); }
  }
}
function liveNow(fn){
  const ms = RUN.ms; if (!ms) return false;
  try { fn(ms); } catch(e){ console.error(e); return false; }
  return true;
}
// fn(ms) between two simulation steps: at once when no step is running (the usual case: a click or a key), else right
// after the step under way. false when no scenario plays
export function applyLive(fn){
  if (typeof fn !== "function" || !RUN.ms) return false;
  if (LIVE.stepping){ LIVE.q.push(fn); return true; }
  return liveNow(fn);
}
// a change held for the next safe state: {key, label, apply(config) -> config (or changes it in place)}. The same key
// again takes the earlier one's place. Returns the queue as RUN.pending lists it
const QUEUE = [];
export function queueChange(c){
  if (!c || typeof c.key !== "string" || !c.key || typeof c.apply !== "function") throw new Error("queueChange: a change needs a key and apply(config)");
  const i = QUEUE.findIndex(q => q.key === c.key);
  const rec = {key:c.key, label:String(c.label || c.key), apply:c.apply};
  if (i >= 0) QUEUE.splice(i, 1);
  QUEUE.push(rec);
  pendingChanged();
  return RUN.pending;
}
/* a ball put somewhere by hand during play (Free Play's Q, the admin panel's reset), the one way both do it:
   placeBall(ms, p, free) takes it out of anyone's hands or feet, puts it at rest at p (a free ball, or a dead one),
   clears its net contact and dead-ball roll, and ends a restart that was waiting (play goes on from here). The caller
   may then launch it (ball.js ballKick); ballPlaced(ms) works out the predictions again and tells the view it was put
   there, so no streak is drawn from where it was */
export function placeBall(ms, p, free = true){
  const b = ms.ball;
  clearCtl(ms);
  for (const a of ms.agents) if (a.drib) a.drib = null;
  b.p.x = p.x; b.p.y = Math.max(R, p.y); b.p.z = p.z;
  b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
  b.knuck = null; b.state = free ? "free" : "dead"; b.holder = -1; b.sleep = false; b.still = 0; b.dragMul = 1;
  b.grounded = b.p.y <= R + 0.02; b.inField = null;
  if (b.netSide) b.netSide.fill(0);
  b.netHit = false; b.netQ = 0; b.netAny = false; b.pendN = 0;
  liveRoll(b);
  if (ms.restart || ms.phase !== "live"){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; a.wall = false; } }
  return b;
}
export function ballPlaced(ms){
  refreshPred(ms);
  const T = RUN.cur && RUN.cur.T;
  if (T && T.V && T.ms === ms) viewPreStep(T.V, ms);
}
// a queued change taken back (the admin set it back before the restart). true when there was one
export function dropChange(key){
  const i = QUEUE.findIndex(q => q.key === key);
  if (i < 0) return false;
  QUEUE.splice(i, 1);
  pendingChanged();
  return true;
}
function pendingChanged(){
  RUN.pending = QUEUE.length ? QUEUE.map(q => ({key:q.key, label:q.label})) : null;
  if (RUN.cur && RUN.cur.T) THUD.thudPending(RUN.pending ? RUN.pending.map(c => c.label) : null);
  emit();
}
/* the queued changes applied to a copy of a configuration, the queue left as it is: what a configuration sheet opened
   while they wait shows (Start then plays what the sheet set) */
export function withPending(config, sc = null){
  let c = copy(config || {});
  for (const q of QUEUE){
    try { const r = q.apply(c, sc ? {id:sc.id, type:sc.type} : null); if (r && typeof r === "object") c = r; } catch(e){ console.error(e); }
  }
  return c;
}
/* the queued changes applied to a configuration (each in turn, oldest first) and the queue emptied: what a safe state
   does before anything is spawned. Marks the result __changed when there were any (the caller takes the mark off) */
export function takePending(config, sc = null){
  if (!QUEUE.length) return config;
  let c = config;
  for (const q of QUEUE.splice(0)){
    try { const r = q.apply(c, sc ? {id:sc.id, type:sc.type} : null); if (r && typeof r === "object") c = r; } catch(e){ console.error(e); }
  }
  pendingChanged();
  c.__changed = true;
  return c;
}
// my pooled body (and the sandbox's) at the scale the setup gives me, built again only when it is not already. A setup
// that names no scale (one not made from a typed configuration) gets the height you walk Training at, never whatever
// the pooled body was last built to
function fitMe(setup){
  let want = setup && setup.me ? +setup.me.scale : NaN;
  if (!(want > 0)) want = scaleOfHeight(defaultHeight());
  if (!(want > 0)) return 0;
  const L = poolMeLook(), cur = L && +L.height > 0 ? +L.height : 1;
  const n = Math.abs(cur - want) > 1e-4 ? replaceMe(Object.assign({}, L || {}, {height:want})) : 0;
  try { sandboxHeight(want); } catch(e){ console.error(e); }
  return n;
}

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
const CTRL_RESET = ["lmb", "rmb", "queue", "charge", "wish", "rHeld", "jockey", "shield", "note", "ring", "eHeld", "acro", "lastShotT", "gx", "gy", "gi", "hy", "hp", "aim", "ground"];
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
  const runner = C({state:run.state, wait:run.wait, verdict:run.verdict, paused:RUN.paused, id:run.id, kind:run.kind, replaying:!!run.replaying,
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
if (typeof addEventListener === "function") addEventListener("train:exit", () => {
  stopScenario("exit"); RUN.last = null; RUN.setup = null; poolDispose();
  // (P5-A) nothing queued outlives Training, and the sandbox body's height is the look's own again next time
  QUEUE.length = 0; RUN.pending = null; LIVE.q.length = 0;
  try { sandboxHeight(null, {build:false}); } catch(e){ console.error(e); }
});
// a new place being built (a pitch change): whatever played there is over, its task gone with the place's
onBegin(() => { if (RUN.cur) stopScenario("ended"); });
// (P6-B) the team scenarios of scen-team.js, registered as each category module hands them over
drillSink(sc => registerScenario(sc));

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainRun = {RUN, CATEGORIES, LIMITS, POOL_DRILL, registerScenario, startScenario, restart, stopScenario, replay, scenario, scenariosOf, poolStats,
  digest, digestState, setPaused, paused, applyLive, queueChange, dropChange, takePending, withPending, placeBall, ballPlaced, BEHAVES,
  offsideText, replaying:() => !!(RUN.cur && RUN.cur.replaying), skipReplay:() => { if (replayPlaying()) replaySkip(); }};
