// qa/tr6-lib.mjs: the receiving drills under node, the way the scenario runner plays them (runner.js buildMatch: the
// setup's people as player records, the officials off the grass, the ball at rest where the setup puts it, play live),
// with the real controls (control.js controlStep with keys held, then simStep, then the scenario's step, as training.js
// fixedItem does).
// Owner: P6-A (Training Mode Phase 6). Contract: BUILD-PLAN P6-A acceptance "qa/tr6-receive.mjs" (Node with controlStep
// bots). The runner itself needs the page (it imports the renderer), so this mirrors its buildMatch for a setup.
import {createMatch, simStep, REF, AR1, AR2, TEMPO} from "../js/life/football/sim.js";
import {MODES} from "../js/life/football/rules.js";
import {refreshPred} from "../js/life/football/actions.js";
import {goalsLawOf, cagePitch} from "../js/life/football/cagespec.js";
import * as CT from "../js/life/football/control.js";
import {P} from "../js/life/core/state.js";
import * as RC from "../js/life/train/receive.js";

export const H = 1/60;
const POS_OF = {GK:"GK", LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", RF:"ST", CF:"ST", ST:"ST"};
const ARCH_OF = {GK:"GK", DF:"DF", CM:"CM", CAM:"AM", LW:"W", RW:"W", ST:"ST"};
function rec(p, id, o = {}){
  const pos = POS_OF[p.slot] || "CM";
  return {pid:id, name:"", number:o.number || 0, slot:p.slot, arch:ARCH_OF[pos] || "CM", isGK:p.slot === "GK", isMe:!!o.me, scale:o.scale || 1, at:p.at,
    energy:100, fatigue:0, prefFoot:o.foot || "Right", items:null};
}
// the runner's buildMatch for a setup (runner.js), on a cage pitch spec
export function matchOf(s, spec){
  const myTeam = s.myTeam, oppTeam = 1 - myTeam;
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  teams[myTeam].players.push(rec(s.me, 1, {me:true, number:9, scale:s.me.scale, foot:s.me.foot}));
  s.mates.forEach((p, i) => teams[myTeam].players.push(rec(p, 100 + i, {number:2 + i})));
  s.opps.forEach((p, i) => teams[oppTeam].players.push(rec(p, 200 + i, {number:2 + i})));
  if (s.keeper) teams[s.keeper.side === "mine" ? myTeam : oppTeam].players.push(rec(s.keeper, 300, {number:1}));
  const rules = Object.assign({goals:goalsLawOf(spec), offside:false, restarts:false, cards:false, subs:0, halfTime:false, stoppage:false}, s.laws);
  const ms = createMatch({seed:s.seed, mode:MODES.includes("train") ? "train" : "drill", spec, halfRealSec:1e6, tempo:Object.assign({}, TEMPO[2]), teams,
    me:{team:myTeam, slot:s.me.slot, prefFoot:s.me.foot || "Right", role:"starter"}, rules, kickoffTeam:myTeam, htAuto:true});
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  const places = [[], []];
  places[myTeam].push(s.me, ...s.mates); places[oppTeam].push(...s.opps);
  if (s.keeper) places[s.keeper.side === "mine" ? myTeam : oppTeam].push(s.keeper);
  for (const t of [0, 1]){
    ms.agents.filter(a => a.team === t && a.role === "player").forEach((a, i) => {
      const p = places[t][i]; if (!p) return;
      a.m.x = a.x0 = p.x; a.m.z = a.z0 = p.z; a.m.vx = a.m.vz = 0; a.m.speed = 0; a.m.yaw = a.m.heading = p.yaw; a.set = null;
      if (p.drill) a.drill = {behave:p.drill.behave, x:p.x, z:p.z};
    });
  }
  const b = ms.ball, sb = s.ball;
  b.p.x = sb.x; b.p.y = sb.y; b.p.z = sb.z; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
  b.state = sb.free ? "free" : "dead";
  ms.restart = null; ms.phase = "live";
  for (const a of ms.agents) a.set = null;
  refreshPred(ms);
  return ms;
}
// a drill's go: its setup and its match, the controls let go, the look the setup gives
export function go(config, o = {}){
  const spec = cagePitch(config.pitch || "half");
  const s = RC.build(config, {spec});
  const ms = matchOf(s, spec);
  CT.controlReset(); CT.CTRL.enabled = true;
  P.yaw = s.me.yaw; P.pitch = -0.15;
  return {spec, s, ms, me:ms.agents[ms.me], config};
}
// one step as training.js fixedItem: the controls, the simulation, a drill's play going on after a stop, the drill's step
export function step(g){
  const {ms, me, spec, config} = g;
  CT.controlStep(ms, me, H, {traits:{}, live:true});
  simStep(ms, H);
  if (ms.restart || ms.phase !== "live"){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; a.wall = false; } }
  return RC.goStep(ms, config, spec);
}
