/* ============ Training Mode: corners, throw-ins and penalties, the shared set-piece framework ============
   Owner: P7-B (Training Mode Phase 7: corners, throw-ins and penalties). Contract: BUILD-PLAN P7-B work items (corners,
   throw-ins, penalties) and the Phase 7 contract (rules.js startRestart opt.*, brain.js cornerPlan); TRAINING-SPEC 0
   (up to 6 v 6 plus an AI keeper, the keeper never a role), 1 (one engine: the real restart, the real kick and throw,
   the real keeper), 4 (scenario lifecycle, every setting real, presets by type) and 5 (Corners, Throw-ins, Penalties).

   Three configuration types of config.js, one per set piece: 'corner', 'throw' and 'penalty' (presets are kept apart
   by type). A configuration is the shared schema (role, counts, the keeper, attributes, the pitch) plus each type's own
   options (opts: the side, the spot, the delivery, the marking, the time). My role says what I do:
     corner   taker (I take it), attacker (the AI takes it, I attack the box), receiver (I am the designated receiver),
              support (outside the box, for the second ball), defender (I defend it)
     throw    taker (I throw), receiver (the AI throws to me), attacker (I run down the line, he throws into my path),
              defender (I mark the man he throws to), support (I support for the second ball)
     penalty  taker (I take it), attacker (the AI takes it, I follow in for the rebound), defender (they take it, I am on
              the edge of the box for the rebound)
   The keeper is always the computer's.

   build(type, config, env) is the runner's: the setup (runner.js), everyone on his own spot for the set piece, the
   ball dead on the restart's spot, and the go's plan (setup.plan, plain data the snapshot keeps): the kind, the side
   that takes it and the end it is taken at, the spot, who takes it and who it is meant for, the delivery, the runs and
   the marking. The participants' attributes, height and foot are teams.js setupFromConfig's, the same as every other
   scenario's.

   A go (goState, setStep, judge) is the real restart: at the first step rules.js startRestart starts it with the
   Phase 7 options (opt.taker, opt.side, opt.noKeeper, opt.plan; opt.hold when the computer's taker plays it to a
   designated man). Until it is taken everyone holds his set-piece spot, a man-marker goal side of his man; the
   computer's taker delivers it the way the configuration says (actions.js startKick, startThrow: the same kick and
   throw the brain would make, aimed at the designated man), my own taking is the match's controls; the attackers make
   their runs as it is struck. From the contact on it is ordinary play on the one engine (headers, volleys,
   clearances, saves, rebounds), and the go is judged on the simulation's own events from my side's point of view.

   P7-A's brain.js cornerPlan(ms, R0, spec), when it is there, is asked for the designated receiver and the marking
   (the contract's corner plan); without it (or when it has no answer) the configuration's own are used.

   Pure: no DOM, no globals, no Math.random (the match RNG ms.r is the seeded variety); Node runs it (qa/tr7-*.mjs).
   The scenario modules scen-corner.js, scen-throw.js and scen-penalty.js register the scenarios with the runner. */
import {registerType, validate, ROLE_NAMES} from "./config.js";
import {setupFromConfig} from "./teams.js";
import {describe} from "./presets.js";
import {goalsLawOf} from "../football/cagespec.js";
import {startRestart, RULES} from "../football/rules.js";
import {startKick, startThrow, loftSpeedFor} from "../football/actions.js";
import {TEMPO} from "../football/sim.js";
import {atan2} from "../football/detmath.js";
import * as BR from "../football/brain.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = 0.11;
const r3 = v => Math.round(v*1000)/1000;
const r2 = v => Math.round(v*100)/100;
const faceTo = (dx, dz) => atan2(-dx, -dz);

/* ---------- the types ---------- */
export const TYPES = Object.freeze({corner:"corner", throw:"throw", penalty:"penalty"});
const FIELDS = Object.freeze(["role", "attackers", "defenders", "mates", "opps", "keeper", "me", "attAvg", "defAvg", "gk", "pitch"]);
export const SIDES = Object.freeze(["left", "right"]);
const SIDE_NAMES = Object.freeze({left:"Left", right:"Right"});
export const ENDS = Object.freeze(["main", "other"]);
// the corner's zones in the box, metres out from the goal line and across (+ toward the corner it is taken from)
export const ZONES = Object.freeze({near:[5.5, 2.2], far:[6.5, -3.6], six:[6, -0.6], spot:[11, 0], edge:[17.5, -2]});
export const ZONE_NAMES = Object.freeze({near:"Near post", far:"Far post", six:"Middle of the six-yard box", spot:"Penalty spot", edge:"Edge of the box"});
export const MARKINGS = Object.freeze({zonal:"Zonal", man:"Man to man", mixed:"Zonal at the near post, man to man for the rest"});
export const DELIVERIES = Object.freeze({cross:"Cross into the box", short:"Short corner", mixed:"Either, he decides"});
export const THROW_TO = Object.freeze({feet:"To his feet", space:"Into space down the line, ahead of him"});
// the defaults of a go after the restart is taken (s): how long play runs on before it is judged
export const AFTER = Object.freeze({corner:8, throw:8, penalty:5});
// the most a restart waits on its taker before the go is called off (s; the referee hands it on at 25 s: rules.js)
const SET_MAX = 30;

const timeOpt = (d, max = 20) => ({kind:"int", label:"Seconds of play after it is taken", help:"How long the go runs on from the moment it is taken.", min:3, max, step:1, def:d});
registerType("corner", {name:"Corner", fields:FIELDS, roles:["taker", "attacker", "receiver", "support", "defender"],
  defaults:{role:"taker", attackers:4, defenders:4, mates:true, opps:true, keeper:true, pitch:"half"},
  options:{
    side:{kind:"enum", label:"Corner", help:"Which flag it's taken from, as the attackers look at the goal.", values:SIDES.map(v => ({v, label:SIDE_NAMES[v]})), def:"left"},
    end:{kind:"enum", label:"Goal", help:"On the full pitch, which of the two goals it's taken at.", values:[{v:"main", label:"The main goal"}, {v:"other", label:"The other goal"}], def:"main", when:c => c.pitch === "full"},
    zone:{kind:"enum", label:"Where the receiver attacks", values:Object.entries(ZONE_NAMES).map(([v, label]) => ({v, label})), def:"near"},
    delivery:{kind:"enum", label:"The taker plays", values:Object.entries(DELIVERIES).map(([v, label]) => ({v, label})), def:"cross", when:c => c.role !== "taker"},
    marking:{kind:"enum", label:"Marking", values:Object.entries(MARKINGS).map(([v, label]) => ({v, label})), def:"man", when:c => !!c.opps || c.role === "defender"},
    runs:{kind:"bool", label:"Attackers make their runs as it's struck", def:true},
    time:timeOpt(AFTER.corner),
    replay:{kind:"bool", label:"Instant replay of each corner", def:true}
  }});
registerType("throw", {name:"Throw-in", fields:FIELDS, roles:["taker", "receiver", "attacker", "defender", "support"],
  defaults:{role:"taker", attackers:3, defenders:2, mates:true, opps:true, keeper:false, pitch:"half"},
  options:{
    side:{kind:"enum", label:"Touchline", help:"Which touchline, as the attackers look at the goal.", values:SIDES.map(v => ({v, label:SIDE_NAMES[v]})), def:"left"},
    along:{kind:"int", label:"How far from their goal line (m)", help:"Where on the touchline it's taken.", min:4, max:100, step:1, def:30},
    to:{kind:"enum", label:"The thrower aims", values:Object.entries(THROW_TO).map(([v, label]) => ({v, label})), def:"feet", when:c => c.role !== "taker"},
    time:timeOpt(AFTER.throw)
  }});
registerType("penalty", {name:"Penalty", fields:FIELDS.filter(f => f !== "pitch"), roles:["taker", "attacker", "defender"],
  defaults:{role:"taker", attackers:1, defenders:0, mates:false, opps:false, keeper:true, pitch:"half"},
  options:{
    time:timeOpt(AFTER.penalty, 12)
  }});

// what a preset's Load list shows for a set piece (presets.js describe)
const sideWord = c => c.opts && c.opts.side === "right" ? "right" : "left";
describe("corner", c => `${ROLE_NAMES[c.role] || "Player"}, ${sideWord(c)} corner, ${c.attackers} v ${c.defenders}${c.keeper ? " plus a keeper" : ""}, ${MARKINGS[c.opts && c.opts.marking] || ""}`);
describe("throw", c => `${ROLE_NAMES[c.role] || "Player"}, ${sideWord(c)} touchline ${c.opts ? c.opts.along : 30} m out, ${c.attackers} v ${c.defenders}`);
describe("penalty", c => `${c.role === "taker" ? "You take it" : c.role === "defender" ? "They take it" : "A team-mate takes it"}, ${c.keeper ? "keeper in goal" : "empty goal"}`);

/* ---------- the setup ----------
   Everything is worked out with the goal attacked at +x (gx = hx) and the attackers' left at -z, then turned round
   (x and z both negated, the facing by half a turn) for a corner at the other goal of the full pitch, which keeps the
   attackers' left and right. Team 0 attacks +x (sim.js), so the side that takes it is team 0 at the main goal and
   team 1 at the other. */
const spotTo = (E, p) => ({x:r3(E*p.x), z:r3(E*p.z)});
const yawTo = (E, fx, fz) => r3(faceTo(E*fx, E*fz));

/* the people a role needs (my side counts me): an AI taker on the side that takes it, the man it is meant for, a
   second man to support. A configuration short of them gets them, with a note saying so (the sheet shows the counts
   that play: Start plays this configuration) */
export const NEEDS = Object.freeze({
  corner:{taker:{att:1}, attacker:{att:3}, receiver:{att:2}, support:{att:3}, defender:{att:2}},
  throw:{taker:{att:1}, receiver:{att:2}, attacker:{att:2}, support:{att:3}, defender:{att:2}},
  penalty:{taker:{att:1}, attacker:{att:2}, defender:{att:1}}
});
export function fitConfig(type, config, notes = null){
  const c = validate(type, config);
  const need = (NEEDS[type] || {})[c.role] || {att:1};
  const meAtt = c.role !== "defender";
  if (c.attackers < need.att || (meAtt ? need.att > 1 && !c.mates : !c.opps)){
    c.attackers = Math.max(c.attackers, need.att);
    if (meAtt && need.att > 1) c.mates = true;
    if (!meAtt) c.opps = true;
    if (notes) notes.push(meAtt ? `This needs ${need.att} on your side, so team-mates are on.` : `This needs ${need.att} of them to take it, so opponents are on.`);
  }
  return validate(type, c);
}
function base(type, config, env){
  const notes = [];
  const c = fitConfig(type, config, notes);
  const spec = env.spec;
  const s0 = setupFromConfig(type, c, {spec, seed:env.seed});
  const meAtt = c.role !== "defender";
  const E = type === "corner" && c.pitch === "full" && c.opts.end === "other" ? -1 : 1;
  const attTeam = E > 0 ? 0 : 1;
  s0.notes = [...notes, ...(s0.notes || [])];
  return {c, spec, s0, meAtt, E, attTeam, myTeam:meAtt ? attTeam : 1 - attTeam, hx:spec.hx, hz:spec.hz, side:c.opts.side === "right" ? 1 : -1};
}
// the attackers and the defenders as setup places, in the setup's own order: the attackers are me (when I attack) and
// my team-mates, or the opponents (when I defend)
function sidesOf(B){
  const s = B.s0, me = Object.assign({}, s.me), mates = s.mates.map(p => Object.assign({}, p)), opps = s.opps.map(p => Object.assign({}, p));
  const att = B.meAtt ? [me, ...mates] : opps, def = B.meAtt ? opps : [me, ...mates];
  return {me, mates, opps, att, def};
}
// who a place is in the plan: {team: 'mine' | 'theirs', i} (i -1: me)
function refOf(B, S, p){
  if (p === S.me) return {team:"mine", i:-1};
  const k = S.mates.indexOf(p);
  if (k >= 0) return {team:"mine", i:k};
  return {team:"theirs", i:S.opps.indexOf(p)};
}
const put = (B, p, x, z, fx, fz) => { const q = spotTo(B.E, {x, z}); p.x = q.x; p.z = q.z; p.yaw = yawTo(B.E, fx, fz); };
function finish(B, S, plan, ball){
  const s = B.s0;
  const keeper = s.keeper ? Object.assign({}, s.keeper) : null;
  if (keeper){ const q = spotTo(B.E, {x:B.hx - 1, z:0}); keeper.x = q.x; keeper.z = q.z; keeper.yaw = yawTo(B.E, -1, 0); keeper.side = B.meAtt ? "theirs" : "mine"; }
  const b = spotTo(B.E, ball);
  return {myTeam:B.myTeam, role:ROLE_NAMES[B.c.role] || "Player", seed:s.seed, laws:{out:"stop", offside:false, goals:goalsLawOf(B.spec), restarts:true},
    me:S.me, mates:S.mates, opps:S.opps, keeper, ball:{x:b.x, y:R, z:b.z, vx:0, vy:0, vz:0, wx:0, wy:0, wz:0, free:false},
    poss:null, notes:s.notes || [], tempo:Object.assign({}, TEMPO[2], {shotBias:1}), plan, config:B.c};
}
// keep a defender out of 9.15 m of the ball (the law at a corner), on the far side of the ball from it
function off915(p, ball){
  const dx = p.x - ball.x, dz = p.z - ball.z, d = Math.hypot(dx, dz);
  if (d >= RULES.WALL_D + 0.3) return p;
  const k = (RULES.WALL_D + 0.35)/(d || 1);
  return {x:ball.x + dx*k, z:ball.z + dz*k};
}

/* ---------- corners ---------- */
function buildCorner(B){
  const S = sidesOf(B), c = B.c, o = c.opts, hx = B.hx, hz = B.hz, s = B.side;
  const ball = {x:hx - 0.4, z:s*(hz - 0.4)};
  const aiTakes = c.role !== "taker";
  // the taker: me, or the first of my team-mates (or theirs when I defend) behind the ball, facing the box
  const taker = aiTakes ? S.att.find(p => p !== S.me) || null : S.me;
  if (taker) put(B, taker, ball.x + 0.65, ball.z + s*0.85, -0.6, -s*0.8);
  // the zones of the attackers in the box: the designated receiver's first; me in support on the edge
  const order = ["near", "far", "six", "spot", "edge"].filter(z => z !== o.zone);
  const recv = c.role === "receiver" ? S.me : S.att.find(p => p !== taker && p !== S.me) || null;
  const zoneOf = new Map(), runs = [];
  const box = S.att.filter(p => p !== taker);
  let shortMan = null;
  if (aiTakes && o.delivery !== "cross"){
    // a short option near the flag: a team-mate who is not the receiver (the receiver himself when he is the only one)
    shortMan = box.find(p => p !== recv && p !== S.me) || (o.delivery === "short" ? recv : null);
  }
  for (const p of box){
    if (p === shortMan && p !== recv) continue;
    if (p === recv){ zoneOf.set(p, o.zone); continue; }
    if (p === S.me && c.role === "support"){ zoneOf.set(p, "edge"); continue; }
    const z = order.find(k => ![...zoneOf.values()].includes(k));
    zoneOf.set(p, z || "back");
  }
  // where each stands at the start and where he runs to as it is struck (runs off: he stands in his zone)
  let backN = 0;
  for (const p of box){
    if (p === shortMan && p !== recv){ put(B, p, hx - 4.5, s*(hz - 8), 0.5, s*0.8); continue; }
    const z = zoneOf.get(p);
    if (z === "back"){ put(B, p, hx - 26, (backN++ % 2 ? 1 : -1)*9, 1, 0); continue; }
    const [d, w] = ZONES[z], tx = hx - d, tz = s*w;
    if (o.runs && z !== "edge"){
      // from a cluster round the penalty spot, a step apart, to the zone
      const k = runs.length, sx = hx - 12.5 - (k % 2)*1.4, sz = clamp(tz*0.35 + (k - 1.5)*1.6, -6, 6);
      put(B, p, sx, sz, 1, 0);
      runs.push(Object.assign(refOf(B, S, p), {zone:z, x:spotTo(B.E, {x:tx, z:tz}).x, z:spotTo(B.E, {x:tx, z:tz}).z}));
    } else put(B, p, tx, tz, 1, -s*0.3);
  }
  // the defenders: zonal spots, or goal side of a man (the receiver first); never inside 9.15 m of the ball
  const ZD = [[1.0, s*3.3], [5.5, s*2.5], [5.5, 0], [5.5, -s*2.5], [1.0, -s*3.3], [10, 0]];
  const marks = [];
  const targets = [recv, ...box.filter(p => p !== recv && p !== shortMan && zoneOf.get(p) !== "back"), ...box.filter(p => p === shortMan || zoneOf.get(p) === "back")].filter(Boolean);
  let zi = 0, mi = 0;
  S.def.forEach((p, k) => {
    const zonal = o.marking === "zonal" || o.marking === "mixed" && k === 0 || mi >= targets.length;
    if (zonal){
      const [d, w] = ZD[zi++ % ZD.length];
      const q = off915({x:hx - d, z:w}, ball);
      put(B, p, q.x, q.z, -1, 0);
      return;
    }
    const t = targets[mi++];
    // (the man's spot in the +x frame: his place turned back)
    const tx = B.E*t.x, tz = B.E*t.z, gx = hx, ux = gx - tx, uz = -tz, ul = Math.hypot(ux, uz) || 1;
    const q = off915({x:tx + ux/ul*0.9, z:tz + uz/ul*0.9}, ball);
    put(B, p, q.x, q.z, tx - q.x, tz - q.z);
    marks.push({def:refOf(B, S, p), on:refOf(B, S, t)});
  });
  const plan = {kind:"corner", attTeam:B.attTeam, end:B.E, spot:spotTo(B.E, ball), side:B.E*s, role:c.role,
    taker:taker ? refOf(B, S, taker) : null, recv:recv ? refOf(B, S, recv) : null, short:shortMan ? refOf(B, S, shortMan) : null,
    zone:o.zone, delivery:aiTakes ? o.delivery : null, marking:o.marking, runs, marks, time:o.time, replay:!!o.replay, noKeeper:!c.keeper};
  return finish(B, S, plan, ball);
}

/* ---------- throw-ins ---------- */
function buildThrow(B){
  const S = sidesOf(B), c = B.c, o = c.opts, hx = B.hx, hz = B.hz, s = B.side;
  const xs = clamp(hx - o.along, -hx + 3, hx - 3);
  const ball = {x:xs, z:s*(hz - 0.05)};
  const aiThrows = c.role !== "taker";
  // the thrower stands on the line, the ball over it in his hands, facing in; the ball lies where he picks it up
  const thrower = aiThrows ? S.att.find(p => p !== S.me) || null : S.me;
  if (thrower) put(B, thrower, xs, s*(hz + 0.22), 0, -s);
  const others = S.att.filter(p => p !== thrower);
  // the man it is meant for: me (receiver, my run), or the first team-mate of the thrower's other than me
  const recv = c.role === "receiver" || c.role === "attacker" ? S.me : others.find(p => p !== S.me) || null;
  let runTo = null;
  if (recv){
    if (c.role === "attacker"){
      // my run down the line: from 4 m behind the throw to space 9 m ahead of it
      put(B, recv, xs - 4, s*(hz - 6), 1, 0);
      runTo = spotTo(B.E, {x:clamp(xs + 9, -hx + 2, hx - 2), z:s*(hz - 4.5)});
    } else {
      put(B, recv, clamp(xs + 3, -hx + 2, hx - 2), s*(hz - 9), -0.3, s);
      if (aiThrows && o.to === "space") runTo = spotTo(B.E, {x:clamp(xs + 9, -hx + 2, hx - 2), z:s*(hz - 7)});
    }
  }
  // the other options round the throw, and me in support for the second ball
  const OPT = [[10, 14], [-8, 12], [2, 20], [14, 22], [-14, 18]];
  let k = 0;
  for (const p of others){
    if (p === recv) continue;
    if (p === S.me && c.role === "support"){ put(B, p, clamp(xs + 1, -hx + 2, hx - 2), s*(hz - 17), 0, s); continue; }
    const [dx, dz] = OPT[k++ % OPT.length];
    put(B, p, clamp(xs + dx, -hx + 2, hx - 2), s*(hz - dz), -dx*0.05, s);
  }
  // the defenders: the first goal side of the man it is meant for (me, when I mark him), the rest between the ball
  // and the goal
  const marks = [];
  const DZ = [[6, 10], [4, 18], [12, 14], [10, 24], [16, 8]];
  let j = 0;
  S.def.forEach((p, i) => {
    if (i === 0 && recv){
      const tx = B.E*recv.x, tz = B.E*recv.z, ux = hx - tx, uz = -tz, ul = Math.hypot(ux, uz) || 1;
      put(B, p, tx + ux/ul*1.5, tz + uz/ul*1.5, -ux, -uz);
      marks.push({def:refOf(B, S, p), on:refOf(B, S, recv)});
      return;
    }
    const [dx, dz] = DZ[j++ % DZ.length];
    put(B, p, clamp(xs + dx, -hx + 2, hx - 2), s*(hz - dz), xs - (xs + dx), dz*s);
  });
  const plan = {kind:"throw", attTeam:B.attTeam, end:B.E, spot:spotTo(B.E, ball), side:B.E*s, role:c.role,
    taker:thrower ? refOf(B, S, thrower) : null, recv:recv ? refOf(B, S, recv) : null, to:aiThrows ? (c.role === "attacker" || o.to === "space" ? "space" : "feet") : null,
    runTo, along:o.along, marks, time:o.time, replay:false, noKeeper:!c.keeper};
  // (the ball on the line where the thrower picks it up)
  return finish(B, S, plan, {x:ball.x, z:ball.z});
}

/* ---------- penalties ---------- */
// the spots on the edge of the box for the rebound, outside the box and the arc, behind the ball (+ frame)
const PEN_EDGE = [[17.4, -7.2], [17.4, 7.2], [17.6, -10.5], [17.6, 10.5], [19, -4.8], [19, 4.8], [17.8, -14], [17.8, 14], [20.5, -1.5], [20.5, 1.5], [18, -17.5], [18, 17.5]];
function buildPenalty(B){
  const S = sidesOf(B), c = B.c, hx = B.hx;
  const ball = {x:hx - 11, z:0};
  const taker = c.role === "taker" ? S.me : S.att.find(p => p !== S.me) || null;
  // the run-up: 2.2 m back and a little to the side, facing the goal
  if (taker) put(B, taker, ball.x - 2.2, -0.7, 1, 0.15);
  // everyone else on the edge of the box, attackers and defenders side by side for the rebound (me on the first one)
  const rest = [...S.att.filter(p => p !== taker), ...S.def];
  rest.sort((p, q) => (p === S.me ? -1 : q === S.me ? 1 : 0));
  rest.forEach((p, k) => { const [d, w] = PEN_EDGE[k % PEN_EDGE.length]; put(B, p, hx - d, w, 1, -w*0.03); });
  const plan = {kind:"penalty", attTeam:B.attTeam, end:B.E, spot:spotTo(B.E, ball), side:1, role:c.role,
    taker:taker ? refOf(B, S, taker) : null, recv:null, marks:[], time:c.opts.time, replay:false, noKeeper:!c.keeper};
  return finish(B, S, plan, ball);
}

/* build(type, config, env) -> the runner's setup (runner.js cleanSetup keeps it as it is) */
export function build(type, config, env = {}){
  if (!env.spec) throw new Error("setpiece build: the cage's pitch spec is needed (env.spec)");
  const B = base(type, config, env);
  return type === "corner" ? buildCorner(B) : type === "throw" ? buildThrow(B) : buildPenalty(B);
}

/* ---------- the agents of a setup ----------
   matchOf (scen-team.js) makes team t's player agents in the setup's order: my side me, then the team-mates; theirs the
   opponents; the keeper last on his side. agentOf(ms, setup, ref) -> the agent of a plan's {team, i} */
export function agentOf(ms, setup, ref){
  if (!ref) return null;
  if (ref.team === "mine" && ref.i < 0) return ms.agents[ms.me] || null;
  const team = ref.team === "mine" ? setup.myTeam : 1 - setup.myTeam;
  const list = ms.agents.filter(a => a.team === team && a.role === "player" && !a.isGK && !(ref.team === "mine" && a.isMe));
  return list[ref.i] || null;
}

/* ---------- a go ----------
   goState(ms) -> a fresh record for one go of a setup (a restart makes a new simulation, so a new record). Plain data
   and agent ids only, so the runner's digest of a reset state is the same every time */
export function goState(ms){
  return {t0:ms.t, started:false, taken:false, takenT:null, kickAt:null, evAt:0, delivered:false, runsGo:false, tags:[], first:null,
    firstT:null, touches:0, goal:null, goalT:null, saved:false, held:false, out:false, verdict:null, yPrev:R, recvTouch:null, release:null,
    poss:-1, possT:0, myCtlT:0, oppCtlT:0, endT:null};
}
// the plan's corner plan from P7-A (brain.js cornerPlan), when it is there: {recv: agent id, marking} or null
function brainPlan(ms, R0, setup){
  const fn = BR.cornerPlan;
  if (typeof fn !== "function") return null;
  try { return fn(ms, R0, {recv:R0.plan && R0.plan.recvId, marking:setup.plan.marking, zone:setup.plan.zone}) || null; } catch(e){ return null; }
}

/* setStep(J, ms, setup) after every fixed step: starts the restart at the first one; until it is taken, everyone
   holds his set-piece spot (a man-marker goal side of his man) and the computer's taker plays it when the time comes;
   the runs as it is struck; then the record of what happens */
export function setStep(J, ms, setup){
  const P = setup.plan; if (!P) return;
  if (!J.started){ startGo(J, ms, setup); return; }
  const R0 = J.R0;
  if (!J.taken){
    if (ms.restart !== R0 || R0.taken){ J.taken = true; J.takenT = ms.t; J.evAt = J.evAt || 0; }
    else { holdShape(J, ms, setup); deliver(J, ms, setup); }
  }
  if (J.taken) watch(J, ms, setup);
  J.yPrev = ms.ball.p.y;
}
function startGo(J, ms, setup){
  const P = setup.plan;
  J.started = true;
  const tk = agentOf(ms, setup, P.taker), recv = agentOf(ms, setup, P.recv);
  const hold = !!tk && !tk.isMe && P.kind !== "penalty";
  const plan = {recvId:recv ? recv.id : -1, zone:P.zone || null, marking:P.marking || null, delivery:P.delivery || null, to:P.to || null};
  J.R0 = startRestart(ms, P.kind, P.attTeam, {x:P.spot.x, z:P.spot.z}, {taker:tk ? tk.id : null, side:P.side, noKeeper:!!P.noKeeper, plan, hold});
  // (P7-A's corner plan, when brain.js has it: its receiver and marking over the configuration's)
  if (P.kind === "corner"){
    const bp = brainPlan(ms, J.R0, setup);
    if (bp && bp.recv >= 0 && ms.agents[bp.recv]) J.R0.plan.recvId = bp.recv;
    if (bp && bp.marking) J.R0.plan.marking = bp.marking;
  }
  J.evAt = ms.events.length;
  J.tkId = tk ? tk.id : -1; J.recvId = J.R0.plan.recvId;
  // everyone's set-piece spot is where the setup put him
  J.spots = ms.agents.filter(a => a.role === "player" && a.onPitch).map(a => ({id:a.id, x:a.m.x, z:a.m.z, yaw:a.m.yaw}));
  J.marks = (P.marks || []).map(m => { const d = agentOf(ms, setup, m.def), o = agentOf(ms, setup, m.on); return d && o ? {d:d.id, o:o.id} : null; }).filter(Boolean);
  J.runs = (P.runs || []).map(r => { const a = agentOf(ms, setup, r); return a ? {id:a.id, x:r.x, z:r.z} : null; }).filter(Boolean);
}
// everyone but the taker (and the man fetching or carrying the ball) on his spot, facing the ball; a man-marker goal
// side of his man as he moves; the runners off as the taker strikes it. (rules.js's own set-piece shape, restartShape,
// is held off while the scenario sets the spots: R0.shapeStep)
function holdShape(J, ms, setup){
  const R0 = J.R0, b = ms.ball, gx = ms.dirs[R0.team]*ms.spec.hx;
  R0.shapeStep = ms.step;
  const tk = ms.agents[R0.taker];
  const striking = !!(tk && tk.act && (tk.act.kind === "kick" || tk.act.kind === "throw"));
  if (striking && !J.runsGo) J.runsGo = true;
  for (const sp of J.spots){
    const a = ms.agents[sp.id];
    if (!a || a.isGK || a.isMe && !ms.meAI) continue;
    if (a === tk){
      // the taker's spot at the ball once it is there for him (the restart's own steps take him to it before that)
      if (R0.stage === "wait" || R0.stage === "go"){ a.set = {x:sp.x, z:sp.z, role:"taker", face:{x:b.p.x - sp.x, z:b.p.z - sp.z}, gait:"walk", stop:0.15}; }
      continue;
    }
    if (a.id === R0.fetcher && (R0.stage === "fetch" || R0.stage === "serve") || a.id === R0.carrier) continue;
    const run = J.runsGo ? J.runs.find(r => r.id === a.id) : null;
    if (run){ a.set = {x:run.x, z:run.z, role:"run", gait:"sprint", stop:0.2, face:null}; continue; }
    const mk = J.marks.find(m => m.d === a.id);
    if (mk){
      // goal side of his man (0.9 m at a corner, 1.5 m at a throw), and out of 9.15 m of the ball at a corner
      const o = ms.agents[mk.o], ux = gx - o.m.x, uz = -o.m.z, ul = Math.hypot(ux, uz) || 1, k = R0.kind === "corner" ? 0.9 : 1.5;
      let x = o.m.x + ux/ul*k, z = o.m.z + uz/ul*k;
      if (R0.kind === "corner"){ const q = off915({x, z}, b.p); x = q.x; z = q.z; }
      a.set = {x, z, role:"mark", gait:"run", stop:0.15, face:{x:b.p.x - x, z:b.p.z - z}};
      continue;
    }
    a.set = {x:sp.x, z:sp.z, role:"set", gait:"jog", stop:0.25, face:{x:b.p.x - sp.x, z:b.p.z - sp.z}};
  }
}
// the computer's taker plays a held restart (opt.hold): once the ball is his at the spot and everyone is set (or long
// enough has passed), the delivery the configuration asks for, at the designated man
function deliver(J, ms, setup){
  const R0 = J.R0, P = setup.plan;
  if (!R0.hold || J.delivered) return;
  const tk = ms.agents[R0.taker];
  if (!tk || tk.isMe || tk.act) return;
  if (R0.stage !== "wait") return;
  const el = ms.t - R0.t0, b = ms.ball;
  if (hypot2(tk.m.x - b.p.x, tk.m.z - b.p.z) > RULES.TAKER_AT && R0.kind !== "throw") return;
  const recv = ms.agents[R0.plan.recvId];
  if (R0.kind === "throw"){
    // in the hands: the throw to the man (to his feet, his head, or into the space down the line ahead of his run)
    if (el < 1.2) return;
    let tg;
    if (P.to === "space" && P.runTo){
      // he goes as the runner sets off (or at 4.5 s); the ball into the space ahead of him
      if (recv && recv.m.speed < 2.5 && el < 4.5) return;
      tg = {x:P.runTo.x, y:R, z:P.runTo.z};
    } else {
      if (!R0.set && el < 3) return;
      // to his feet: where he is going to be, a stride short of him (a man steps in to meet a throw), at knee height
      if (recv){
        const lead = 0.5, px = recv.m.x + recv.m.vx*lead, pz = recv.m.z + recv.m.vz*lead, ux = b.p.x - px, uz = b.p.z - pz, ul = Math.hypot(ux, uz) || 1;
        tg = {x:px + ux/ul*1.2, y:0.4, z:pz + uz/ul*1.2};
      } else tg = {x:b.p.x + ms.dirs[R0.team]*10, y:R, z:b.p.z*0.7};
    }
    startThrow(ms, tk, tg, recv ? recv.id : -1);
    J.delivered = true; J.kickAt = ms.t;
    return;
  }
  // a corner: once everyone is set (2 s at least), else at 6 s
  if (!(R0.set && el >= 2) && el < 6) return;
  const r = ms.r();
  const short = P.delivery === "short" || P.delivery === "mixed" && r < 0.35;
  const sm = agentOf(ms, setup, P.short);
  if (short && sm){
    startKick(ms, tk, {kind:"pass", target:{x:sm.m.x, y:R, z:sm.m.z}, recv:sm.id, contact:0});
  } else {
    // at the receiver's run (where he will be), his head or, one time in three, lower for a volley
    const run = recv ? J.runs.find(q => q.id === recv.id) : null;
    const at = run ? {x:run.x, z:run.z} : recv ? {x:recv.m.x + recv.m.vx*0.8, z:recv.m.z + recv.m.vz*0.8} : {x:ms.dirs[R0.team]*(ms.spec.hx - 6), z:0};
    const y = ms.r() < 0.67 ? 1.75 : 0.7;
    const d = hypot2(at.x - b.p.x, at.z - b.p.z);
    startKick(ms, tk, {kind:"cross", target:{x:at.x, y, z:at.z}, recv:recv ? recv.id : -1, contact:1, speed:loftSpeedFor(d)*1.06, curl:0.6});
  }
  J.delivered = true; J.kickAt = ms.t;
}
const hypot2 = (x, z) => Math.sqrt(x*x + z*z);

// after it is taken: the runners carry on to their zones until the ball arrives, and the record of what happens
function watch(J, ms, setup){
  const P = setup.plan, E = ms.events, b = ms.ball;
  if (J.runs.length && J.takenT != null && ms.t - J.takenT < 0.05){
    for (const r of J.runs){
      const a = ms.agents[r.id];
      if (a && !a.isMe && hypot2(a.m.x - r.x, a.m.z - r.z) > 0.8){ a.task.run = {x:r.x, z:r.z, until:ms.t + 1.6, go:true, kind:"corner"}; a.tgtSet = false; }
    }
  }
  for (let i = J.evAt; i < E.length; i++){
    const e = E[i];
    if (e.kind === "goal" && !e.disallowed && J.goal == null){ J.goal = e.team; J.goalT = e.t; J.goalHow = lastHow(J); }
    else if (e.kind === "save"){ J.saved = true; if (e.outcome === "catch") J.held = true; tag(J, "save"); }
    else if (e.kind === "kick" || e.kind === "touch"){
      if (e.agent === J.tkId && J.touches === 0 && (e.intent === "throw" || e.kind === "kick")){ if (e.intent === "throw") J.release = {t:e.t, x:e.x, z:e.z}; J.touches = 0; continue; }
      if (e.agent < 0) continue;
      J.touches++;
      const a = ms.agents[e.agent], att = a && a.team === P.attTeam;
      const how = e.kind === "kick" && e.intent === "header" ? "header" : e.kind === "kick" && J.yPrev > 0.45 && e.intent !== "throw" ? "volley" : e.kind === "touch" ? e.how || "touch" : e.intent || "kick";
      if (J.first == null){
        J.first = {agent:e.agent, team:a ? a.team : -1, how, t:e.t};
        if (how === "header") tag(J, "header");
        if (how === "volley") tag(J, "volley");
        if (a && !att && (e.kind === "kick" || how === "header")) tag(J, "clearance");
        if (e.agent === J.recvId) J.recvTouch = {t:e.t, how};
      } else if (e.agent !== J.first.agent && !J.second && (J.first.how === "header" || hasTag(J, "clearance") || J.first.how === "volley")){
        J.second = {agent:e.agent, team:a ? a.team : -1, how, t:e.t}; tag(J, "second");
        if (how === "header") tag(J, "header");
        if (how === "volley") tag(J, "volley");
        if (a && !att && e.kind === "kick") tag(J, "clearance");
      } else {
        if (how === "header") tag(J, "header");
        if (how === "volley") tag(J, "volley");
      }
      if (e.agent === J.recvId && !J.recvTouch) J.recvTouch = {t:e.t, how};
      J.lastHow = how; J.lastTeam = a ? a.team : -1;
    }
  }
  J.evAt = E.length;
  // a new restart once this one has been taken: the ball went out (or a goal's kick-off)
  if (ms.restart && ms.restart !== J.R0 && J.goal == null && !J.out){ J.out = ms.restart.kind; J.outTeam = ms.restart.team; }
  // who has it, and for how long (the keeper's hands count)
  const h = 1/60, ctl = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : b.state === "held" && b.holder >= 0 ? ms.agents[b.holder] : null;
  const team = ctl ? ctl.team : -1;
  J.myCtlT = team === setup.myTeam ? J.myCtlT + h : 0;
  J.oppCtlT = team === 1 - setup.myTeam ? J.oppCtlT + h : 0;
  if (b.state === "held" && ctl && ctl.isGK) J.held = true;
  if (ctl && ctl.id === J.recvId && !J.recvTouch) J.recvTouch = {t:ms.t, how:"control"};
}
const tag = (J, k) => { if (!J.tags.includes(k)) J.tags.push(k); };
const hasTag = (J, k) => J.tags.includes(k);
const lastHow = J => J.lastHow || null;

/* judge(J, ms, setup) -> null while the go is on, else {done: true, ok, why, text, goal, goalT, tags, t, replay} */
export function judge(J, ms, setup){
  if (J.verdict) return J.verdict;
  const P = setup.plan; if (!P || !J.started) return null;
  const myAtt = setup.myTeam === P.attTeam, el = ms.t - J.t0;
  const end = (ok, why, text) => {
    J.endT = ms.t;
    // (the replay is of the set piece: from the kick to the end of the go)
    return (J.verdict = {done:true, ok, why, text, goal:J.goal != null, goalT:J.goal != null ? J.goalT : ms.t, tags:J.tags.slice(), t:r2(el), replay:!!P.replay && J.taken});
  };
  if (!J.taken){
    if (el > SET_MAX) return end(false, "slow", "It never got taken.");
    return null;
  }
  const after = ms.t - J.takenT, T = P.time || AFTER[P.kind];
  // a foul after it was taken: the free kick (or penalty) decides it for the side that won it
  if (J.out && J.goal == null && (J.out === "free" || J.out === "indirect" || J.out === "penalty")){
    const ours = J.outTeam === setup.myTeam, pen = J.out === "penalty";
    return end(ours, "foul", ours ? (pen ? "Penalty to you!" : "Fouled. Free kick to you.") : (pen ? "Penalty to them." : "Foul. Free kick to them."));
  }
  if (J.goal != null){
    const ours = J.goal === P.attTeam;
    const how = J.goalHow === "header" ? "header" : J.goalHow === "volley" ? "volley" : null;
    if (myAtt) return end(ours, ours ? "goal" : "conceded", ours ? (P.kind === "penalty" ? "Scored." : how === "header" ? "Goal! Great header." : how === "volley" ? "Goal! What a volley." : "Goal!") : "They scored on the break.");
    return end(!ours, ours ? "conceded" : "goal", ours ? (P.kind === "penalty" ? "They scored it." : "They scored from it.") : "You scored on the break!");
  }
  if (P.kind === "penalty"){
    if (J.held) return end(!myAtt, "saved", myAtt ? "The keeper holds it." : "Saved, and he holds it.");
    if (J.out) return end(!myAtt, "out", J.saved ? (myAtt ? "Saved, and out it goes." : "Saved and out.") : myAtt ? "Missed." : "Missed it.");
    if (myAtt && J.oppCtlT >= 0.6) return end(false, "cleared", "Saved, and they cleared the rebound.");
    if (J.myCtlT >= 0.6 && !myAtt) return end(true, "cleared", "Saved, and you cleared the rebound.");
    if (after >= T) return end(!myAtt, "time", J.saved ? (myAtt ? "Saved, and nothing came of the rebound." : "Saved, and the rebound came to nothing.") : myAtt ? "No goal." : "No goal.");
    return null;
  }
  if (P.kind === "corner"){
    if (J.held) return end(!myAtt, "keeper", myAtt ? "The keeper claims it." : "Your keeper claims it.");
    if (J.out) return end(!myAtt, "out", myAtt ? "Out of play." : "Cleared out of play.");
    if (J.oppCtlT >= 0.8) return end(false, "lost", myAtt ? "Cleared, and they have it." : "They kept it.");
    if (!myAtt && J.myCtlT >= 0.8) return end(true, "cleared", "Cleared and won.");
    if (after >= T) return end(!myAtt, "time", myAtt ? "No goal from it." : "No goal from it. Well defended.");
    return null;
  }
  // a throw-in: my side's man gets it under control and keeps it (attacking roles), or I win it back (defending)
  if (J.out) return end(false, "out", "Out of play.");
  if (myAtt){
    if (J.oppCtlT >= 0.6) return end(false, "lost", "They won it.");
    const okT = J.myCtlT >= 1.2 && J.recvTouch != null;
    if (okT && (P.role !== "support" || J.second || after > 3)) return end(true, "kept", P.role === "taker" ? "Good throw. He's got it." : P.role === "support" ? "Kept it." : "Got it under control.");
    if (after >= T) return end(J.myCtlT > 0, "time", J.myCtlT > 0 ? "Kept it." : "Nobody got hold of it.");
    return null;
  }
  if (J.myCtlT >= 0.6) return end(true, "won", "Won it back.");
  if (after >= T) return end(false, "time", "They kept the ball.");
  return null;
}

/* what the Training HUD says: the set piece, what to do, and the keys */
export function uiOf(setup){
  const P = setup && setup.plan; if (!P) return {lines:[], keys:null};
  const side = P.side*(P.end || 1) > 0 ? "right" : "left";
  const L = [];
  let keys = null;
  if (P.kind === "corner"){
    const z = ZONE_NAMES[P.zone] ? ZONE_NAMES[P.zone].toLowerCase() : "box";
    if (P.role === "taker"){ L.push(`Corner from the ${side}. Your team-mates attack the ${z}.`); keys = [{key:"LMB", text:"hold and let go to cross it"}, {key:"RMB", text:"a short one to a team-mate"}]; }
    else if (P.role === "receiver") L.push(`Corner from the ${side}. It's coming to you: get to the ${z} and attack it.`);
    else if (P.role === "attacker") L.push(`Corner from the ${side}. Get in the box and get on the end of it.`);
    else if (P.role === "support") L.push(`Corner from the ${side}. Stay on the edge of the box for anything that drops.`);
    else L.push(`Their corner from the ${side}. ${P.marking === "zonal" ? "Hold your zone" : "Stay goal side of your man"} and clear it.`);
    if (P.role !== "taker" && P.role !== "defender") keys = [{key:"Space", text:"header"}, {key:"LMB", text:"shoot"}];
  } else if (P.kind === "throw"){
    if (P.role === "taker"){ L.push("Your throw. Find a team-mate."); keys = [{key:"RMB", text:"aim and throw"}]; }
    else if (P.role === "receiver") L.push("He throws it to you. Get it under control and keep it.");
    else if (P.role === "attacker") L.push("Run down the line. He'll throw it into your path.");
    else if (P.role === "support") L.push("Support the man he throws to and pick up the second ball.");
    else L.push("Mark the man he throws to and win it back.");
  } else {
    if (P.role === "taker"){ L.push(P.noKeeper ? "Penalty. An empty goal, so don't miss." : "Penalty. Pick your spot."); keys = [{key:"LMB", text:"hold and let go to shoot"}]; }
    else if (P.role === "defender") L.push("Their penalty. Stay out of the box until it's struck, then go for the rebound.");
    else L.push("Your team-mate takes it. Follow in for the rebound once it's struck.");
  }
  return {lines:L, keys};
}

/* ---------- a set piece as one of the runner's scenarios ----------
   scenarioOf(type, d) -> what runner.js registerScenario takes, for a drill d = {id, name, desc, cfg} of a set-piece type
   (the scenario modules register it; this module never imports the runner). Its go's record lives with its simulation
   (a restart makes a new one, so a new record) */
const GO = new WeakMap();
export function goOf(ms){
  let J = GO.get(ms);
  if (!J){ J = goState(ms); GO.set(ms, J); }
  return J;
}
export function scenarioOf(type, d){
  return {id:d.id, category:"setpieces", type, name:d.name, desc:d.desc, config:validate(type, d.cfg),
    build:(config, env) => build(type, config, env),
    step:(T, run) => { if (run && run.setup) setStep(goOf(T.ms), T.ms, run.setup); },
    judge:(T, run) => run && run.setup ? judge(goOf(T.ms), T.ms, run.setup) : null,
    ui:(T, run) => uiOf(run && run.setup)};
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainSet = {TYPES, ZONES, MARKINGS, DELIVERIES, AFTER, NEEDS, build, goState, goOf, setStep, judge, uiOf, agentOf, fitConfig};
