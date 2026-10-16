/* ============ Training Mode: Attacking ============
   Owner: P6-B (Training Mode Phase 6). Contract: BUILD-PLAN P6-B work item 2 (Attacking); TRAINING-SPEC 5 (Attacking:
   from midfield; me alone; with team-mates; an AI carrier while I play another role; me requesting a pass; runs
   behind; winger, attacking midfielder and support roles; a keeper with no defenders; a keeper with defenders; no
   keeper; counts configurable, 0 allowed; instant replay).

   The Attacking category's drills, on the shared framework (scen-team.js): each one is a starting configuration of
   type 'attacking' (the sheet changes any of it), an objective and, where the drill is about one, a scripted run.
   You attack the goal at +x (every cage has it); the defenders and the keeper are the computer's. Plain data and
   registrations only: Node imports it for qa/tr6-team.mjs. */
import {registerDrills, P} from "./scen-team.js";

const T = "attacking";
export const ATTACK = Object.freeze([
  {id:"att-midfield", name:"From midfield, on your own",
    desc:"You pick it up at halfway with two defenders and the keeper between you and the goal. Go and score.",
    cfg:{role:"attacker", possession:"me", mates:false, attackers:1, opps:true, defenders:2, keeper:true, pitch:"half",
      positions:{me:P("CM", -12), def:[P("CB", -2, -5), P("CDM", -2, 4)]}},
    objective:"score", time:25},
  {id:"att-midfield-mates", name:"From midfield, with team-mates",
    desc:"You start on the ball at halfway with a winger and a striker ahead of you, against three defenders and the keeper.",
    cfg:{role:"attacker", possession:"me", mates:true, attackers:3, opps:true, defenders:3, keeper:true, pitch:"half",
      positions:{me:P("CM", -10), att:[P("LW", -4), P("ST", -6)], def:[P("CB", 0, -6), P("CB", 0, 6), P("CDM")]}},
    objective:"score", time:25},
  {id:"att-carrier", name:"Your team-mate on the ball",
    desc:"A team-mate starts with it in midfield. Get into a good spot, get on the end of it and finish the move.",
    cfg:{role:"support", possession:"mates", mates:true, attackers:3, opps:true, defenders:2, keeper:true, pitch:"half",
      positions:{me:P("ST", -2, 6), att:[P("CM", -4), P("LW", -2)], def:[P("CB", 0, -4), P("CB", 0, 4)]}},
    objective:"score", time:25, hint:{key:"R", text:"call for the ball"}},
  {id:"att-call", name:"Call for it",
    desc:"Your team-mate has the ball and you're on the right. Find space, press R when you're free and onside, and he'll find you.",
    cfg:{role:"attacker", possession:"mates", mates:true, attackers:2, opps:true, defenders:2, keeper:true, pitch:"half",
      positions:{me:P("RW", 2, -4), att:[P("CM", -2)], def:[P("CB", 0, -3), P("LB", 0, 2)]}},
    objective:"score", time:20, hint:{key:"R", text:"call for it, hold R for a ball in behind"}},
  {id:"att-behind", name:"Runs in behind",
    desc:"Two defenders hold a high line. Time your run, hold R for the ball in behind and stay onside.",
    cfg:{role:"attacker", possession:"mates", mates:true, attackers:2, opps:true, defenders:2, keeper:true, offside:true, pitch:"half",
      positions:{me:P("ST", -6), att:[P("CAM", -8)], def:[P("CB", -8, -5), P("CB", -8, 5)]}},
    objective:"score", time:20, hint:{key:"R", text:"hold for a ball in behind"}},
  {id:"att-winger", name:"On the wing",
    desc:"You're the left winger with the ball, a striker and a ten inside you. Beat your full-back, cross it or cut in.",
    cfg:{role:"attacker", possession:"me", mates:true, attackers:3, opps:true, defenders:3, keeper:true, pitch:"half",
      positions:{me:P("LW", -4), att:[P("ST", -2), P("CAM", -2)], def:[P("CB", 0, -4), P("CB", 0, 4), P("LB", -4, -2)]}},
    objective:"score", time:25},
  {id:"att-am", name:"Attacking midfielder",
    desc:"You're the ten on the ball, two wingers and a striker ahead of you against a back four and the keeper.",
    cfg:{role:"attacker", possession:"me", mates:true, attackers:4, opps:true, defenders:4, keeper:true, pitch:"half",
      positions:{me:P("CAM", -4), att:[P("LW", -2), P("RW", -2), P("ST", -2)], def:[P("CB", 0, -4), P("CB", 0, 4), P("LB"), P("RB")]}},
    objective:"score", time:25},
  {id:"att-support", name:"In support",
    desc:"The ten has it ahead of you. Support him, give him an angle and arrive late in the box.",
    cfg:{role:"support", possession:"mates", mates:true, attackers:3, opps:true, defenders:3, keeper:true, pitch:"half",
      positions:{me:P("CM", -2), att:[P("CAM", -2), P("ST", -2)], def:[P("CB", 0, -4), P("CB", 0, 4), P("CDM")]}},
    objective:"score", time:25},
  {id:"att-keeper", name:"Through on the keeper",
    desc:"Just you, the ball and the keeper. Take him on or pick your spot.",
    cfg:{role:"attacker", possession:"me", mates:false, attackers:1, opps:false, defenders:0, keeper:true, pitch:"half",
      positions:{me:P("ST", -10)}},
    objective:"score", time:12},
  {id:"att-keeper-defs", name:"Keeper and defenders",
    desc:"You and a striker against two centre-backs and the keeper.",
    cfg:{role:"attacker", possession:"me", mates:true, attackers:2, opps:true, defenders:2, keeper:true, pitch:"half",
      positions:{me:P("CAM", -4), att:[P("ST", -2)], def:[P("CB", 0, -4), P("CB", 0, 4)]}},
    objective:"score", time:20},
  {id:"att-nokeeper", name:"No keeper",
    desc:"An empty goal, but two defenders in the way. You and a team-mate against them.",
    cfg:{role:"attacker", possession:"me", mates:true, attackers:2, opps:true, defenders:2, keeper:false, pitch:"half",
      positions:{me:P("CAM", -4), att:[P("ST", -2)], def:[P("CB", 0, -4), P("CB", 0, 4)]}},
    objective:"score", time:20}
].map(d => Object.freeze(d)));

registerDrills(T, ATTACK, {category:"attacking", objective:"score", replay:true});
