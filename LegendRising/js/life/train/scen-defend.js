/* ============ Training Mode: Defending ============
   Owner: P6-B (Training Mode Phase 6). Contract: BUILD-PLAN P6-B work item 2 (Defending); TRAINING-SPEC 5 (Defending:
   1v1, 2v1, 1v2, 1v3, many against many, a lone attacker against the keeper, positioning without a keeper, AI attackers
   passing, AI carrying at me; jockeying, tracking, closing space, interceptions, tackles, recovery, transition to
   attack after winning the ball).

   The Defending category's drills, on the shared framework (scen-team.js): configurations of type 'defending' with
   you as a defender (team-mates are the other defenders), the computer's attackers coming at the goal you and your
   keeper defend. The counts read attackers v defenders, you counted in the defenders. Plain data and registrations
   only: Node imports it for qa/tr6-team.mjs. */
import {registerDrills, P} from "./scen-team.js";

const T = "defending";
const D = (o, def = []) => Object.assign({role:"defender", possession:"opps", keeper:true, pitch:"half"}, o, {positions:Object.assign({def}, o.positions || {})});
export const DEFEND = Object.freeze([
  {id:"def-1v1", name:"One against one",
    desc:"A striker runs at you with the ball. Jockey him, stay goal side and win it when he shows it to you.",
    cfg:D({mates:false, defenders:1, opps:true, attackers:1, positions:{me:P("CB", 0), att:[P("ST", -10)]}}),
    objective:"winback", time:20},
  {id:"def-2v1", name:"Two against you",
    desc:"Two attackers and only you in front of the keeper. Delay them, show them wide and don't sell yourself.",
    cfg:D({mates:false, defenders:1, opps:true, attackers:2, positions:{me:P("CB", 0), att:[P("ST", -10, -4), P("CF", -12, 6)]}}),
    objective:"clean", time:15},
  {id:"def-1v2", name:"You and a team-mate against one",
    desc:"You and another centre-back against one striker. One of you presses, the other covers.",
    cfg:D({mates:true, defenders:2, opps:true, attackers:1, positions:{me:P("CB", 0, -4), att:[P("ST", -10)]}}, [P("CB", 0, 4)]),
    objective:"winback", time:20},
  {id:"def-1v3", name:"Three of you against one",
    desc:"Three defenders against one attacker. Close him down together without leaving a gap.",
    cfg:D({mates:true, defenders:3, opps:true, attackers:1, positions:{me:P("CB", 0), att:[P("ST", -12)]}}, [P("LB", 0, 6), P("RB", 0, -6)]),
    objective:"winback", time:15},
  {id:"def-many", name:"Many against many",
    desc:"Five against five in front of your keeper. Hold the shape, track your runner, keep them out.",
    cfg:D({mates:true, defenders:5, opps:true, attackers:5, positions:{me:P("CB", 0, -5), att:[P("ST", -8), P("LW", -8), P("RW", -8), P("CAM", -6), P("CM", -6)]}},
      [P("CB", 0, 5), P("LB"), P("RB"), P("CDM")]),
    objective:"clean", time:30},
  {id:"def-lone", name:"Lone attacker on the keeper",
    desc:"He's through on goal and you're chasing him. Get back, get goal side and help your keeper.",
    cfg:D({mates:false, defenders:1, opps:true, attackers:1, positions:{me:P("CB", -18, 3), att:[P("ST", -10)]}}),
    objective:"clean", time:12},
  {id:"def-nokeeper", name:"No keeper behind you",
    desc:"Three against three and an empty goal behind you. Your positioning is all there is.",
    cfg:D({mates:true, defenders:3, opps:true, attackers:3, keeper:false, positions:{me:P("CB", 0), att:[P("ST", -8), P("LW", -6), P("RW", -6)]}},
      [P("LB"), P("RB")]),
    objective:"clean", time:25},
  {id:"def-passing", name:"Attackers who pass",
    desc:"Three attackers moving it about against you and one team-mate. Read the pass, cut out the lane, win it.",
    cfg:D({mates:true, defenders:2, opps:true, attackers:3, positions:{me:P("CB", -2, -4), att:[P("CM", -6), P("LW", -6), P("RW", -6)]}}, [P("CB", -2, 4)]),
    objective:"winback", time:25},
  {id:"def-carry", name:"Carried at you",
    desc:"He picks it up 30 m out and drives straight at you. Slow him down, pick your moment and tackle.",
    cfg:D({mates:false, defenders:1, opps:true, attackers:1, positions:{me:P("CB", -4), att:[P("CM", 6)]}}),
    objective:"winback", time:20}
].map(d => Object.freeze(d)));

registerDrills(T, DEFEND, {category:"defending", objective:"winback", replay:true});
