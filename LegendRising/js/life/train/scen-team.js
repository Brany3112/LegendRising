/* ============ Training Mode: team scenarios, the shared framework ============
   Owner: P6-B (Training Mode Phase 6: Attacking, Defending and Match scenarios on one shared framework). Contract:
   BUILD-PLAN P6-B work items 1 to 4 and 7; TRAINING-SPEC 0 (up to 6 v 6 plus an AI keeper, the keeper never a role),
   2 (offside respected when a scenario is set up), 4 (scenario lifecycle, every setting real) and 5 (Attacking,
   Defending and Match scenarios: counts, keeper, positions, possession, attributes and objective configurable).

   One framework for every team scenario of the three categories. A drill is plain data: its type (config.js
   'attacking', 'defending' or 'scenarios'), a name and a description, the starting configuration it suggests (my role,
   who starts with the ball, the counts, the keeper, the offside law, the pitch, every starting position), its
   objective, and any runs it scripts (a full-back's overlap, a striker's run in behind). Everything a drill sets is an
   ordinary field of the configuration, so the sheet shows it and changes it, and a preset keeps it; the drill itself
   rides along as the hidden option opts.drill, so a preset knows which drill it was.
   - build(config, env) is the runner's: the setup from the configuration (teams.js setupFromConfig: places, onside
     starts, attributes, the ball), the scenario's tempo (AI-4: how readily the computer's players shoot follows the
     objective; an objective with no goal in it switches shooting off, brain.js goalOn) and its plan (the objective,
     the runs) for the go.
   - The objectives (OBJECTIVES), judged on the simulation's own state and events, from my side's point of view:
     score (my side scores within the time), keep (my side keeps the ball for the time), line (my side gets the ball
     under control within lineD metres of the goal line it attacks), winback (my side wins the ball, then carries it 12
     m forward or scores within 8 s), clean (my side does not concede for the time). Losing the ball means the other
     side has had it under control (or in the keeper's hands, or a restart of theirs) for 0.6 s: a touch in a scramble
     is not a loss.
   - Runs: at its time, a scripted run is the AI's own run (brain.js a.task.run: held onside at the line until the pass
     when offside is played, else straight away), so the passer sees it as he sees any run.
   Pure: no DOM, no globals, no Math.random; Node runs it (qa/tr6-team.mjs). The category modules (scen-attack.js,
   scen-defend.js, scen-match.js) hand their drills to registerDrills; the runner (runner.js) registers each one as a
   scenario as soon as it is handed over (drillSink), so this module never imports the runner. */
import {registerType, validate, typeOf, ROLE_NAMES} from "./config.js";
import {setupFromConfig} from "./teams.js";
import {createMatch, REF, AR1, AR2, TEMPO} from "../football/sim.js";
import {goalsLawOf} from "../football/cagespec.js";
import {attrsForAI} from "../football/attrs.js";
import {ballKick} from "../football/ball.js";
import {logEv, chainKick} from "../football/events.js";
import {refreshPred} from "../football/actions.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const copy = o => o == null ? o : JSON.parse(JSON.stringify(o));

/* ---------- the objectives ---------- */
export const OBJECTIVES = Object.freeze({
  score:{name:"Score a goal", hud:t => `Score within ${t} seconds`},
  keep:{name:"Keep the ball", hud:t => `Keep the ball for ${t} seconds`},
  line:{name:"Get it to the line", hud:(t, d) => `Get the ball under control within ${d} m of their goal line, within ${t} seconds`},
  winback:{name:"Win it back and go", hud:t => `Win the ball back within ${t} seconds, then take it forward`},
  clean:{name:"Keep a clean sheet", hud:t => `Don't concede for ${t} seconds`}
});
export const OBJ_IDS = Object.freeze(Object.keys(OBJECTIVES));
// the judge's numbers: lost after the other side has had it this long (s); a win back must go this far forward (m)
// within this long (s)
export const JUDGE = Object.freeze({LOST_T:0.6, WON_T:0.6, FWD:12, FWD_T:8});
// (AI-4) how readily the computer's players shoot, by objective: the 11-a-side calibration's 1.9 made small games
// shoot from anywhere (ai.md: 30 shots in 30 goes of a 3 v 2); an objective without a goal in it switches the shot,
// the cross and the attacking header off (brain.js goalOn reads shotBias 0)
export const SHOT_BIAS = Object.freeze({score:1.0, keep:0, line:0, winback:1.0, clean:1.0});
export function tempoFor(objective){
  const t = Object.assign({}, TEMPO[2]);
  t.shotBias = SHOT_BIAS[objective] != null ? SHOT_BIAS[objective] : 1.0;
  return t;
}

/* ---------- the drills ---------- */
const DRILLS = new Map();          // id -> drill
const BY_TYPE = new Map();         // type -> [ids]
const SINK = {fn:null, queue:[]};
// a drill's starting position: a formation slot and how far to move it (forward toward the goal attacked, across)
export const P = (slot, dx = 0, dz = 0) => ({slot, dx, dz});
export const drill = id => DRILLS.get(id) || null;
export const drillsOf = type => (BY_TYPE.get(type) || []).map(id => DRILLS.get(id));
export const allDrills = () => [...DRILLS.values()];

/* registerDrills(type, list, o): list = [{id, name, desc, cfg: {configuration fields}, objective, time, lineD?, runs?,
   hint?}], o = {category (the hub's), objective (the type's default), replay (instant replay on by default)}. Adds
   the type's options (the drill, the objective, its time and line, the instant replay) to config.js, once; each
   drill is then handed to the runner (drillSink) */
export function registerDrills(type, list, o = {}){
  const S0 = typeOf(type);
  if (!S0) throw new Error(`registerDrills: config.js has no type "${type}"`);
  const ids = BY_TYPE.get(type) || [];
  for (const d of list){
    if (!d || typeof d.id !== "string" || DRILLS.has(d.id)) throw new Error(`registerDrills: a drill needs a new id (${d && d.id})`);
    if (!OBJECTIVES[d.objective]) throw new Error(`registerDrills: "${d.id}" has no objective of ${OBJ_IDS.join(", ")}`);
    const dr = Object.freeze(Object.assign({}, d, {type, category:o.category || type}));
    DRILLS.set(d.id, dr); ids.push(d.id);
  }
  BY_TYPE.set(type, ids);
  // the type's own options (config.js registerType adds them to the type; the offside law is a field of every team type)
  const fields = S0.fields.includes("offside") ? null : [...S0.fields, "offside"];
  registerType(type, Object.assign(fields ? {fields} : {}, {options:{
    drill:{kind:"enum", label:"Drill", values:ids.map(id => ({v:id, label:DRILLS.get(id).name})), def:ids[0], when:() => false},
    objective:{kind:"enum", label:"Objective", values:OBJ_IDS.map(v => ({v, label:OBJECTIVES[v].name})), def:o.objective || "score"},
    time:{kind:"int", label:"Seconds", help:"The time limit, or how long to hold out.", min:5, max:90, step:5, def:20},
    lineD:{kind:"int", label:"How close to their goal line (m)", min:2, max:60, step:1, def:6, when:c => c.opts.objective === "line"},
    replay:{kind:"bool", label:"Instant replay of a goal", def:o.replay !== false}
  }}));
  for (const id of ids.slice(ids.length - list.length)) toSink(DRILLS.get(id));
  return ids.map(id => DRILLS.get(id));
}
function toSink(d){ if (SINK.fn) SINK.fn(teamScenario(d)); else SINK.queue.push(d); }
// the runner's registration (runner.js): fn(scenario) for every drill handed over, those before it first
export function drillSink(fn){
  SINK.fn = typeof fn === "function" ? fn : null;
  if (SINK.fn) for (const d of SINK.queue.splice(0)) SINK.fn(teamScenario(d));
}

// a drill's configuration: the type's defaults, then the drill's own fields, its objective and itself as opts
export function drillConfig(d){
  const c = Object.assign({}, copy(d.cfg || {}));
  c.opts = Object.assign({}, c.opts || {}, {drill:d.id, objective:d.objective, time:d.time || 20});
  if (d.lineD != null) c.opts.lineD = d.lineD;
  if (d.replay != null) c.opts.replay = !!d.replay;
  return validate(d.type, c);
}
// the drill a configuration plays: its opts.drill when that is one of the type's, else the scenario's own
export function drillOf(config, fallback = null){
  const id = config && config.opts && config.opts.drill;
  const d = id && DRILLS.get(id);
  return d && (!fallback || d.type === fallback.type) ? d : fallback;
}

/* ---------- the setup ----------
   buildTeam(drill, config, env) -> the runner's setup (runner.js), with tempo and plan: {objective, time, lineD,
   replay, drill, runs: [{team: 'mine' | 'theirs', i, x, z, at, dur, kind}], hint} */
export function buildTeam(d0, config, env = {}){
  const d = drillOf(config, d0) || d0;
  const c = validate(d.type, config);
  const s = setupFromConfig(d.type, c, {spec:env.spec, seed:env.seed});
  const o = c.opts || {};
  const objective = OBJECTIVES[o.objective] ? o.objective : d.objective;
  const spec = env.spec;
  const meAtt = c.role !== "defender";
  // a run: 'att.i' or 'def.i' (the configuration's own order of the computer's players) to {d, w}: d metres from the
  // goal line the attackers attack, w across; at s after the start, for dur s
  const runs = [];
  for (const r of d.runs || []){
    const [side, k] = String(r.who || "").split("."), i = +k;
    if (!(side === "att" || side === "def") || !Number.isInteger(i)) continue;
    const list = side === "att" ? (meAtt ? s.mates : s.opps) : (meAtt ? s.opps : s.mates);
    if (i < 0 || i >= list.length) continue;
    const hx = spec ? spec.hx : 52.5, hz = spec ? spec.hz : 34;
    runs.push({team:(side === "att") === meAtt ? "mine" : "theirs", i, x:+clamp(hx - r.to.d, -hx + 1, hx - 1).toFixed(3), z:+clamp(r.to.w, -hz + 1, hz - 1).toFixed(3),
      at:r.at || 0, dur:r.dur || 5, kind:r.kind || "run"});
  }
  s.tempo = tempoFor(objective);
  s.plan = {objective, time:o.time || d.time || 20, lineD:o.lineD != null ? o.lineD : d.lineD || 6, replay:!!o.replay, drill:d.id, runs, hint:d.hint || null};
  s.role = ROLE_NAMES[c.role] || "Player";
  return s;
}

/* ---------- the simulation of a setup ----------
   matchOf(setup, spec, mode) -> {ms, order}: the match the runner plays a setup on (sim.js createMatch in Training's
   mode, no officials on the grass, everyone where the setup puts him, the ball at rest where it is placed, play on from
   the first step, and a configured launch played as a kick from outside the play). order[t][i] is the setup place of
   team t's i-th player agent (my side: me, then the team-mates; theirs: the opponents; the keeper last on his side),
   so the runner can hand each agent its pooled body. The setup is read, never written. The runner and the Node tests
   build the same match from the same setup. o: {foot, meAt (my attributes when the setup has none), scaleOf(t, i) (the
   body's whole-body scale), aiMe (my place played by one of the computer's players: the tests' comparison of how
   often the AI passes to me against how often it passes to an AI player in my place)} */
const POS_OF = {GK:"GK", LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", RF:"ST", CF:"ST", ST:"ST"};
const ARCH_OF = {GK:"GK", DF:"DF", CM:"CM", CAM:"AM", LW:"W", RW:"W", ST:"ST"};
export function recOf(p, id, o = {}){
  const pos = POS_OF[p.slot] || "CM";
  return {pid:id, name:o.name || "", number:o.number || 0, slot:p.slot, arch:ARCH_OF[pos] || "CM", isGK:p.slot === "GK", isMe:!!o.me,
    scale:o.scale || 1, at:p.at || o.at || attrsForAI({id, ovr:p.ovr, pos}), energy:100, fatigue:0, prefFoot:o.foot || "Right", items:null};
}
const touchKind = k => k === "cross" || k === "loft" ? "cross" : "pass";
export function matchOf(setup0, spec, mode = "train", o = {}){
  const setup = copy(setup0);
  const myTeam = setup.myTeam, oppTeam = 1 - myTeam;
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  const order = [[], []];
  const add = (t, r, p) => { teams[t].players.push(r); order[t].push(p); };
  // (o.scaleOf(t, i): the whole-body scale of the body drawn for team t's i-th player, when the runner has one)
  const sc = (t, d) => { const v = o.scaleOf ? +o.scaleOf(t, order[t].length) : NaN; return v > 0 ? v : d; };
  const foot = setup.me.foot || o.foot || "Right";
  add(myTeam, recOf(setup.me, 1, {me:!o.aiMe, at:setup.me.at || o.meAt, foot, number:9, scale:setup.me.scale || sc(myTeam, 1)}), setup.me);
  setup.mates.forEach((p, i) => add(myTeam, recOf(p, 100 + i, {number:2 + i, scale:sc(myTeam, 1)}), p));
  setup.opps.forEach((p, i) => add(oppTeam, recOf(p, 200 + i, {number:2 + i, scale:sc(oppTeam, 1)}), p));
  if (setup.keeper){ const t = setup.keeper.side === "mine" ? myTeam : oppTeam; add(t, recOf(setup.keeper, 300, {number:1, scale:sc(t, 1)}), setup.keeper); }
  const rules = Object.assign({goals:goalsLawOf(spec), offside:false, restarts:false, cards:false, subs:0, halfTime:false, stoppage:false}, setup.laws);
  const tempo = Object.assign({}, TEMPO[2], setup.tempo || {});
  const ms = createMatch({seed:setup.seed, mode, spec, halfRealSec:1e6, tempo, teams,
    me:{team:myTeam, slot:setup.me.slot, prefFoot:foot, role:"starter"}, rules, kickoffTeam:myTeam, htAuto:true});
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  for (const t of [0, 1]){
    const list = ms.agents.filter(a => a.team === t && a.role === "player");
    list.forEach((a, i) => {
      const p = order[t][i]; if (!p) return;
      a.m.x = a.x0 = p.x; a.m.z = a.z0 = p.z; a.m.vx = a.m.vz = 0; a.m.speed = 0; a.m.yaw = a.m.heading = p.yaw;
      a.set = null;
      if (p.drill) a.drill = {behave:p.drill.behave, x:p.x, z:p.z};
    });
  }
  ms.cutStep = ms.step;
  const b = ms.ball, s = setup.ball;
  b.p.x = s.x; b.p.y = s.y; b.p.z = s.z; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
  b.state = s.free ? "free" : "dead";
  ms.restart = null; ms.phase = "live";
  for (const a of ms.agents) a.set = null;
  if (Math.hypot(s.vx, s.vy, s.vz) > 1e-9){
    const kind = touchKind(s.kind);
    ballKick(b, {x:s.vx, y:s.vy, z:s.vz}, {x:s.wx || 0, y:s.wy || 0, z:s.wz || 0}, {agent:-1, team:myTeam, kind, t:ms.t});
    const ev = logEv(ms, "kick", myTeam, -1, b.p.x, b.p.z, {intent:kind, recv:-1, coach:true, noOffside:true, launch:s.kind || kind,
      speed:Math.round(Math.hypot(s.vx, s.vy, s.vz)*100)/100});
    chainKick(ms, ev);
    ms.kick = {seq:(ms.kick ? ms.kick.seq : 0) + 1, ev, t:ms.t, team:myTeam, agent:-1};
  }
  refreshPred(ms);
  return {ms, order};
}

/* ---------- the go: the scripted runs and the objective ----------
   goState(ms) -> a fresh record for one go of a setup (a restart makes a new simulation, so a new record) */
export function goState(ms){
  return {ms, t0:ms.t, evAt:ms.events.length, oppT:0, myT:0, won:null, mine:0, theirs:0, goalT:null, runsDone:0, done:null};
}
// the agent of team t holding the i-th place of its side's computer players ('mine': after me; 'theirs': in order)
function npcAgent(ms, team, i, mine){
  let k = -1;
  for (const a of ms.agents){
    if (a.team !== team || a.role !== "player" || a.isGK) continue;
    if (mine && a.isMe) continue;
    if (++k === i) return a;
  }
  return null;
}
// the runs whose time has come (once each): the brain's own run record on the runner
export function runsStep(J, ms, plan, myTeam){
  const runs = plan && plan.runs || [];
  if (J.runsDone >= runs.length) return;
  const t = ms.t - J.t0;
  for (let k = J.runsDone; k < runs.length; k++){
    const r = runs[k];
    if (t < r.at) break;
    J.runsDone = k + 1;
    const team = r.team === "mine" ? myTeam : 1 - myTeam, a = npcAgent(ms, team, r.i, r.team === "mine");
    if (!a || !a.onPitch) continue;
    // (with offside played he holds onside at the line until the ball is played to him, as any runner does)
    a.task.run = {x:r.x, z:r.z, until:ms.t + r.dur, go:!(ms.rules && ms.rules.offside), kind:r.kind};
    a.tgtSet = false;
  }
}
// which side has the ball: in a keeper's hands, under someone's control, or a restart of theirs waiting; -1 loose
export function holderTeam(ms){
  const b = ms.ball;
  if (b.state === "held" && b.holder >= 0 && ms.agents[b.holder]) return ms.agents[b.holder].team;
  if (ms.restart && !ms.restart.taken && (ms.restart.team === 0 || ms.restart.team === 1)) return ms.restart.team;
  if (ms.poss.ctl >= 0) return ms.poss.team;
  return -1;
}
/* judgeStep(J, ms, plan, myTeam, dt) -> null while the go is on, else {done: true, ok, text, why, goal}. Called after
   every fixed step */
export function judgeStep(J, ms, plan, myTeam, dt = 1/60){
  if (J.done) return J.done;
  const opp = 1 - myTeam, dir = ms.dirs[myTeam], E = ms.events;
  for (let i = J.evAt; i < E.length; i++){
    const e = E[i];
    if (e.kind === "goal" && !e.disallowed){ if (e.team === myTeam) J.mine++; else J.theirs++; J.goalT = e.t; }
  }
  J.evAt = E.length;
  const h = holderTeam(ms);
  J.oppT = h === opp ? J.oppT + dt : 0;
  J.myT = h === myTeam ? J.myT + dt : 0;
  const t = ms.t - J.t0, T = plan.time || 20, lost = J.oppT >= JUDGE.LOST_T;
  const end = (ok, why, text) => (J.done = {done:true, ok, why, text, goal:J.goalT != null, goalT:J.goalT, t:Math.round(t*100)/100});
  switch (plan.objective){
    case "score":
      if (J.mine) return end(true, "goal", "Goal!");
      if (J.theirs) return end(false, "conceded", "They scored.");
      if (lost) return end(false, "lost", "They won the ball.");
      if (t >= T) return end(false, "time", "Out of time.");
      break;
    case "keep":
      if (J.theirs) return end(false, "conceded", "They scored.");
      if (lost) return end(false, "lost", "They won it off you.");
      if (J.mine) return end(true, "goal", "Goal! That'll do.");
      if (t >= T) return end(true, "kept", `You kept it for ${T} seconds.`);
      break;
    case "line": {
      if (J.theirs) return end(false, "conceded", "They scored.");
      if (lost) return end(false, "lost", "They won the ball.");
      const c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
      if (J.mine || h === myTeam && c && c.team === myTeam && dir*c.m.x >= ms.spec.hx - (plan.lineD || 6)) return end(true, "line", "You got there.");
      if (t >= T) return end(false, "time", "Out of time.");
      break;
    }
    case "winback":
      if (J.theirs) return end(false, "conceded", "They scored.");
      if (!J.won){
        if (J.myT >= JUDGE.WON_T) J.won = {x:ms.ball.p.x, t:ms.t};
        else if (t >= T) return end(false, "time", "They kept the ball.");
      } else {
        if (J.mine) return end(true, "goal", "Won it back and scored!");
        if (lost) return end(false, "lost", "They won it straight back.");
        if (h === myTeam && dir*(ms.ball.p.x - J.won.x) >= JUDGE.FWD) return end(true, "won", "Won it back and away you go.");
        if (ms.t - J.won.t >= JUDGE.FWD_T) return end(false, "slow", "You won it, but the attack never got going.");
      }
      break;
    case "clean":
      if (J.theirs) return end(false, "conceded", "They scored.");
      if (t >= T) return end(true, "clean", `Clean sheet for ${T} seconds.`);
      break;
  }
  return null;
}
// what the Training HUD says about the go: the objective, with its numbers
export function objectiveLine(plan){
  const O = OBJECTIVES[plan && plan.objective];
  return O ? O.hud(plan.time || 20, plan.lineD || 6) : null;
}

/* ---------- a drill as one of the runner's scenarios ----------
   (runner.js registerScenario: id, category, type, name, desc, config, build, step, judge, ui) */
const GO = new WeakMap();          // ms -> the go's record
function goOf(T){
  let J = GO.get(T.ms);
  if (!J){ J = goState(T.ms); GO.set(T.ms, J); }
  return J;
}
export function teamScenario(d){
  return {id:d.id, category:d.category, type:d.type, name:d.name, desc:d.desc, config:drillConfig(d),
    build:(config, env) => buildTeam(d, config, env),
    // (the runner's setup snapshot carries the plan; a stopped scenario's own configuration has the same)
    step:(T, run) => { const s = run && run.setup; if (s && s.plan) runsStep(goOf(T), T.ms, s.plan, T.myTeam); },
    judge:(T, run) => {
      const s = run && run.setup; if (!s || !s.plan) return null;
      const v = judgeStep(goOf(T), T.ms, s.plan, T.myTeam);
      return v ? Object.assign({}, v, {replay:!!(v.goal && s.plan.replay)}) : null;
    },
    ui:(T, run) => {
      const s = run && run.setup, plan = s && s.plan, dd = plan ? drill(plan.drill) : null;
      const lines = [objectiveLine(plan)].filter(Boolean);
      return {name:dd && dd.id !== d.id ? dd.name : null, lines, keys:plan && plan.hint ? [plan.hint] : null};
    }};
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainTeam = {OBJECTIVES, JUDGE, SHOT_BIAS, drill, drillsOf, allDrills, drillConfig, buildTeam, judgeStep, goState, holderTeam};
