/* ============ Training Mode: penalties ============
   Owner: P7-B (Training Mode Phase 7: corners, throw-ins and penalties). Contract: BUILD-PLAN P7-B work item
   "Penalties" and the runner's contract (runner.js registerScenario); TRAINING-SPEC 5 (Penalties: I take; the AI
   takes while I play another outfield role; keeper on or off, the empty-goal drill; attributes including the keeper's.
   Approach, strike, contact, direction, power, trajectory, keeper reactions, saves, goals, rebounds. Instant retry).

   The Set Pieces category's penalties, all of config type 'penalty' (setpiece.js). The penalty is the match's own
   restart (rules.js startRestart 'penalty', opt.noKeeper for the empty goal), the keeper's guess and dive gkbrain.js
   penaltyStep. Retry is the runner's restart (Backspace, or the next go once one is decided). */
import {registerScenario} from "./runner.js";
import {scenarioOf} from "./setpiece.js";

export const PENALTIES = Object.freeze([
  {id:"pen-take", name:"Penalties: you take it",
    desc:"Twelve yards, you and the keeper. Pick your spot.",
    cfg:{role:"taker", attackers:1, defenders:0, mates:false, opps:false, keeper:true}},
  {id:"pen-empty", name:"Penalties: empty goal",
    desc:"No keeper. Practise your run-up and your contact.",
    cfg:{role:"taker", attackers:1, defenders:0, mates:false, opps:false, keeper:false}},
  {id:"pen-follow", name:"Penalties: follow it in",
    desc:"A team-mate takes it. Wait on the edge of the box and follow in for the rebound.",
    cfg:{role:"attacker", attackers:3, defenders:2, mates:true, opps:true, keeper:true}},
  {id:"pen-defend", name:"Penalties: theirs",
    desc:"They have a penalty. Stay out of the box until it's struck, then get to the rebound first.",
    cfg:{role:"defender", attackers:3, defenders:2, mates:true, opps:true, keeper:true}}
].map(d => Object.freeze(d)));

for (const d of PENALTIES) registerScenario(scenarioOf("penalty", d));
