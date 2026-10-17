/* ============ Training Mode: corners ============
   Owner: P7-B (Training Mode Phase 7: corners, throw-ins and penalties). Contract: BUILD-PLAN P7-B work item "Corners"
   and the runner's contract (runner.js registerScenario: build, step, judge, ui); TRAINING-SPEC 5 (Corners: I take; the
   AI takes and I play in the box; attacker in the box; defender; support outside the box; designated receiver. Counts,
   keeper, taker, controlled player, positions, marking, attributes. The ball at the correct corner. Crosses, short
   corners, runs, marking, headers, volleys, clearances, second balls. Instant replay).

   The Set Pieces category's corners, one scenario per role, all of config type 'corner' (setpiece.js: the setup, the
   go and the judge), so a corner preset loads into any of them and the sheet changes any of it. */
import {registerScenario} from "./runner.js";
import {scenarioOf} from "./setpiece.js";

export const CORNERS = Object.freeze([
  {id:"corner-take", name:"Corners: you take it",
    desc:"Your corner from the left. Three team-mates attack the box against four defenders and the keeper. Whip it in.",
    cfg:{role:"taker", attackers:4, defenders:4, mates:true, opps:true, keeper:true, opts:{side:"left", zone:"near", marking:"man"}}},
  {id:"corner-box", name:"Corners: attack the box",
    desc:"A team-mate takes it. Make your run, beat your man and get on the end of it.",
    cfg:{role:"attacker", attackers:4, defenders:4, mates:true, opps:true, keeper:true, opts:{side:"right", zone:"far", marking:"man", delivery:"cross"}}},
  {id:"corner-target", name:"Corners: you're the target",
    desc:"It's coming to you. Attack the near post and head it in.",
    cfg:{role:"receiver", attackers:4, defenders:4, mates:true, opps:true, keeper:true, opts:{side:"left", zone:"near", marking:"zonal", delivery:"cross"}}},
  {id:"corner-edge", name:"Corners: edge of the box",
    desc:"Wait on the edge of the box for the clearance and hit the second ball.",
    cfg:{role:"support", attackers:5, defenders:4, mates:true, opps:true, keeper:true, opts:{side:"right", zone:"near", marking:"zonal", delivery:"cross"}}},
  {id:"corner-short", name:"Corners: the short one",
    desc:"A short corner to you near the flag. Work it into the box with your team-mates.",
    cfg:{role:"receiver", attackers:4, defenders:3, mates:true, opps:true, keeper:true, opts:{side:"left", zone:"near", marking:"man", delivery:"short"}}},
  {id:"corner-defend", name:"Corners: defend it",
    desc:"Their corner. Stay goal side of your man and get it clear.",
    cfg:{role:"defender", attackers:4, defenders:4, mates:true, opps:true, keeper:true, opts:{side:"left", zone:"near", marking:"man", delivery:"cross"}}}
].map(d => Object.freeze(d)));

for (const d of CORNERS) registerScenario(scenarioOf("corner", d));
