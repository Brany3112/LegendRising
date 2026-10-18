/* ============ Training Mode: throw-ins ============
   Owner: P7-B (Training Mode Phase 7: corners, throw-ins and penalties). Contract: BUILD-PLAN P7-B work item "Throw-ins"
   and the runner's contract (runner.js registerScenario); TRAINING-SPEC 5 (Throw-ins: I throw; the AI throws and I
   receive; I run to receive; I mark a receiver; I support for the second ball. Counts, location, thrower, receiver,
   positions, attributes. Throw animation, release, trajectory, receiving, first touch, possession transition; no
   teleport).

   The Set Pieces category's throw-ins, one scenario per role, all of config type 'throw' (setpiece.js). The throw is
   the match's own: the ball picked up and held overhead in both hands, the wind-up and the release (actions.js
   startThrow, view.js and moves.js 'throwin'). */
import {registerScenario} from "./runner.js";
import {scenarioOf} from "./setpiece.js";

export const THROWS = Object.freeze([
  {id:"throw-take", name:"Throw-ins: you throw it",
    desc:"Your throw on the left touchline. Find a team-mate before their defenders close him down.",
    cfg:{role:"taker", attackers:3, defenders:2, mates:true, opps:true, keeper:false, opts:{side:"left", along:30}}},
  {id:"throw-receive", name:"Throw-ins: take it in",
    desc:"A team-mate throws it to your feet with a defender behind you. Control it and keep it.",
    cfg:{role:"receiver", attackers:2, defenders:1, mates:true, opps:true, keeper:false, opts:{side:"left", along:30, to:"feet"}}},
  {id:"throw-run", name:"Throw-ins: run down the line",
    desc:"Set off down the line and he'll throw it into your path.",
    cfg:{role:"attacker", attackers:2, defenders:1, mates:true, opps:true, keeper:false, opts:{side:"right", along:35}}},
  {id:"throw-mark", name:"Throw-ins: mark the receiver",
    desc:"Their throw. Stay tight to the man it's meant for and win it back.",
    cfg:{role:"defender", attackers:2, defenders:2, mates:true, opps:true, keeper:false, opts:{side:"left", along:30, to:"feet"}}},
  {id:"throw-support", name:"Throw-ins: the second ball",
    desc:"The throw goes to your team-mate under pressure. Be there for whatever comes off him.",
    cfg:{role:"support", attackers:3, defenders:2, mates:true, opps:true, keeper:false, opts:{side:"right", along:25, to:"feet"}}}
].map(d => Object.freeze(d)));

for (const d of THROWS) registerScenario(scenarioOf("throw", d));
