// qa/tr7-lib.mjs: the Node side of P7-B's set pieces, shared by qa/tr7-corner.mjs, qa/tr7-throw.mjs and qa/tr7-penalty.mjs:
// a set piece's setup on its cage (setpiece.js build, the runner's own setup), played on the simulation the runner plays
// it on (scen-team.js matchOf) with the runner's own per-step calls (setStep, judge), the player either standing in as
// the AI (meAI) or doing what a test tells him.
// Owner: P7-B (Training Mode Phase 7).
import {cagePitch} from "../js/life/football/cagespec.js";
import {simStep} from "../js/life/football/sim.js";
import {matchOf} from "../js/life/train/scen-team.js";
import {build, goState, setStep, judge, agentOf} from "../js/life/train/setpiece.js";
import {defaults, validate} from "../js/life/train/config.js";

export const H = 1/60;
export {build, goState, setStep, judge, agentOf};

// a configuration of a set-piece type: its defaults, then the changes (opts merged)
export function cfgOf(type, over = {}){
  const c = defaults(type);
  for (const [k, v] of Object.entries(over)) if (k === "opts") Object.assign(c.opts, v); else c[k] = v;
  return validate(type, c);
}
export function setupOf(type, cfg, seed = 1){
  const c = Object.assign({}, cfg, {seed});
  const spec = cagePitch(c.pitch || "half");
  return {cfg:c, spec, setup:build(type, c, {spec})};
}
/* play one go: o.meAI (the player as the AI plays him: default true), o.bot(ms, me, J) (the player's intent each step
   otherwise), o.onStep(ms, J, setup), o.max (s, default 40), o.ms(ms) (a change to the match before the first step).
   Returns {ms, J, v, setup, spec} */
export function playSet(type, cfg, seed = 1, o = {}){
  const {spec, setup} = setupOf(type, cfg, seed);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = o.meAI !== false;
  if (o.ms) o.ms(ms, setup);
  const me = ms.agents[ms.me], J = goState(ms);
  let v = null;
  const max = o.max || 40;
  while (ms.t < max){
    if (!ms.meAI){ me.intent.dx = 0; me.intent.dz = 0; if (o.bot) o.bot(ms, me, J, setup); }
    simStep(ms, H);
    setStep(J, ms, setup);
    if (o.onStep) o.onStep(ms, J, setup);
    v = judge(J, ms, setup);
    if (v) break;
  }
  return {ms, J, v, setup, spec};
}
