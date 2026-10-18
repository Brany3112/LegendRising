// qa/tr6-teamlib.mjs: the Node side of P6-B's team scenarios, shared by qa/tr6-team.mjs: every drill built on its cage
// (scen-team.js buildTeam, the runner's own setup) and played on the simulation the runner plays it on (scen-team.js
// matchOf), with the player as a bot that either stands in as the AI (meAI) or does what a test tells it.
// Owner: P6-B (Training Mode Phase 6). Contract: BUILD-PLAN P6-B acceptance (qa/tr6-team.mjs).
import {cagePitch} from "../js/life/football/cagespec.js";
import {simStep} from "../js/life/football/sim.js";
import {allDrills, drillConfig, buildTeam, matchOf, goState, runsStep, judgeStep} from "../js/life/train/scen-team.js";
import "../js/life/train/scen-attack.js";
import "../js/life/train/scen-defend.js";
import "../js/life/train/scen-match.js";

export const H = 1/60;
export {allDrills, drillConfig, buildTeam, matchOf, goState, runsStep, judgeStep};

// a drill's setup and match on its own cage, for a seed (the configuration's seed: the computer's players' attributes)
export function setupOf(d, seed = 1, over = null){
  const cfg = drillConfig(d);
  cfg.seed = seed;
  if (over) over(cfg);
  const spec = cagePitch(cfg.pitch);
  const setup = buildTeam(d, cfg, {spec});
  return {cfg, spec, setup};
}
/* play one go: o.meAI (the player as the AI plays him), o.bot(ms, me, t) (the player's intent each step otherwise),
   o.onStep(ms, J, t), o.max (s). Returns {ms, J, verdict, t} */
export function playGo(d, seed = 1, o = {}){
  const {cfg, spec, setup} = setupOf(d, seed, o.over || null);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = !!o.meAI;
  if (o.onDecide) ms.onDecide = o.onDecide;
  const me = ms.agents[ms.me], J = goState(ms), plan = setup.plan;
  let v = null;
  const max = o.max || plan.time + 2;
  while (ms.t < max){
    if (!ms.meAI){ me.intent.dx = 0; me.intent.dz = 0; if (o.bot) o.bot(ms, me, ms.t); }
    simStep(ms, H);
    // (a drill has no restarts unless its laws stop for them: training.js fixedItem)
    if (!setup.laws.restarts && setup.laws.out !== "stop" && (ms.restart || ms.phase !== "live")){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; a.wall = false; } }
    runsStep(J, ms, plan, setup.myTeam);
    if (o.onStep) o.onStep(ms, J, ms.t, setup);
    v = judgeStep(J, ms, plan, setup.myTeam, H);
    if (v && !o.playOn) break;
  }
  return {ms, J, verdict:v, t:ms.t, setup, spec, cfg};
}
