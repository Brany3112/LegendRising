/* ============ Training Mode: a configuration as teams ============
   Owner: P4-A (Training Mode Phase 4: configuration and attributes). Contract: BUILD-PLAN Phase 4 "Contracts (P4-A
   stubs them)", teams.js cfgFromConfig(type, config, seed) and P4-A work item 5; TRAINING-SPEC 0 (6 v 6 plus an AI
   keeper, the keeper never a role), 2 (offside: nobody starts offside when the law is on), 4 (every setting changes
   the real configuration; NPC averages with modest, reproducible variation) and G0 decisions (d), (f) and (h).

   cfgFromConfig(type, config, seed) -> {cfg, ballInit, setup, poss, notes}
     cfg       a createMatch cfg (sim.js): the two teams with each player's slot, attributes and place ({x, z, yaw} on
               the record), the keeper, my agent and role, the laws (out of play, offside, goals) and the pitch spec
     ballInit  {p, v, w}: the configured ball placement, and the launch resolved from the configured flight by
               strike.js solveStrike (the solver the coach feed uses): zero velocity and spin when there is none
     setup     the same in the scenario runner's setup form (runner.js: {myTeam, laws, role, seed, me, mates, opps,
               keeper, ball}), so a scenario's build() can return setupFromConfig(...) as it is
     poss      who starts with the ball: {team, who: 'me' | 'mates' | 'opps' | null, i}
     notes     plain sentences for anything the configuration asked that had to change (a limit, an offside start)
   Pure: nothing is moved or drawn here. The runner applies the setup at activation (P4-B plays ballInit's launch
   through ball.js ballKick), and Phase 6's feeder strikes the same launch from a passer's foot.

   The frame is the cage pitch's own (pitch-local metres): +x is the goal the attackers attack (every cage has it);
   team 0 attacks +x, so the attackers are team 0 and the defenders, with the keeper in the +x goal, team 1. A slot's
   place is a distance from that goal line and a distance across, cut to the area; the offset moves it from there. */
import {cagePitch, goalsLawOf} from "../football/cagespec.js";
import {solveStrike} from "../football/strike.js";
import {attrsForAI, attrsForTraining} from "../football/attrs.js";
import {RULES} from "../football/rules.js";
import {atan2} from "../football/detmath.js";
import {validate, counts, sideOf, ROLE_SLOT, ROLE_NAMES, typeOf} from "./config.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = 0.11;
const faceTo = (dx, dz) => atan2(-dx, -dz);
const r4 = v => Math.round(v*1e4)/1e4;

// where a slot stands: metres from the goal line the attackers attack (d) and across (w, +z), for the attacking side
// and for the defending side
const SPOT_ATT = Object.freeze({ST:[16, 0], CF:[18, 0], LF:[18, -7], RF:[18, 7], LW:[22, -20], RW:[22, 20], CAM:[26, 0], LM:[32, -22], RM:[32, 22],
  CM:[36, 0], CDM:[42, 0], LWB:[38, -26], RWB:[38, 26], LB:[45, -24], RB:[45, 24], CB:[48, 0]});
const SPOT_DEF = Object.freeze({CB:[12, 0], LB:[14, -18], RB:[14, 18], LWB:[20, -24], RWB:[20, 24], CDM:[22, 0], CM:[28, 0], LM:[26, -20], RM:[26, 20],
  CAM:[30, 0], LW:[34, -22], RW:[34, 22], LF:[38, -8], RF:[38, 8], CF:[40, 0], ST:[40, 0]});
// the world position code of a slot (attrs.js ARCH_OF_POS: the role profile an NPC gets)
const POS_OF = Object.freeze({LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", CF:"ST", RF:"ST", ST:"ST", GK:"GK"});
const ARCH_OF = Object.freeze({GK:"GK", DF:"DF", CM:"CM", CAM:"AM", LW:"W", RW:"W", ST:"ST"});
export const posOfSlot = slot => POS_OF[slot] || "CM";
// the wall stands this far from the ball (the laws' 9.15 m), its players this far apart
export const WALL = Object.freeze({D:9.15, GAP:0.65});
const SPREAD = 6;      // two players given the same slot stand this far apart across

// the seeded id of an NPC (G0 decision f: the same seed gives the same players, another seed others)
export const npcId = (seed, side, i) => `t${seed >>> 0}:${side}${i}`;

/* the places on a pitch: {x, z} of a slot for a side ('att' or 'def'), the k-th player given that slot on that side
   spread across */
function slotPlace(spec, side, slot, k){
  const [d0, w0] = (side === "att" ? SPOT_ATT : SPOT_DEF)[slot] || (side === "att" ? SPOT_ATT.CM : SPOT_DEF.CB);
  const L = 2*spec.hx, d = Math.min(d0, L - 1.5);
  const w = w0 + (k ? (k % 2 ? -1 : 1)*SPREAD*Math.ceil(k/2) : 0);
  return {x:spec.hx - d, z:clamp(w, -spec.hz + 1, spec.hz - 1)};
}
const inside = (spec, p) => {
  const B = spec.runoff || {hx:spec.hx + 2, hz:spec.hz + 2};
  return {x:r4(clamp(p.x, -B.hx + 0.5, B.hx - 0.5)), z:r4(clamp(p.z, -B.hz + 0.5, B.hz - 0.5))};
};

/* ---------- resolving a configuration ---------- */
function resolve(type, config, seed, specIn){
  const notes = [];
  const c = validate(type, config, notes), S = typeOf(type);
  const spec = specIn || cagePitch(c.pitch);
  const n = counts(type, c), meAtt = n.meSide === "att", sd = (seed != null ? seed : c.seed) >>> 0;
  const myTeam = meAtt ? 0 : 1;
  // the participants by side, in the configuration's order: me first on mine, then the NPCs
  const used = {att:new Map(), def:new Map()};
  const place = (side, slot, off) => {
    const k = used[side].get(slot) || 0; used[side].set(slot, k + 1);
    const p = slotPlace(spec, side, slot, k);
    return inside(spec, {x:p.x + (off ? off.dx : 0), z:p.z + (off ? off.dz : 0)});
  };
  const mySide = meAtt ? "att" : "def", theirSide = meAtt ? "def" : "att";
  const meSlot = c.positions.me.slot || ROLE_SLOT[c.role] || "CM";
  const me = Object.assign({slot:meSlot, who:"me"}, place(mySide, meSlot, c.positions.me));
  const npcs = {att:[], def:[]};
  const list = side => side === "att" ? c.positions.att : c.positions.def;
  const npcCount = {att:n.npcAtt, def:n.npcDef - n.wall};
  for (const side of ["att", "def"]){
    for (let i = 0; i < npcCount[side]; i++){
      const P = list(side)[i], slot = P.slot || (side === "att" ? "CM" : "CB");
      npcs[side].push(Object.assign({slot, side, i, id:npcId(sd, side, i)}, place(side, slot, P)));
    }
  }
  const keeper = n.keeper ? {slot:"GK", side:"def", id:npcId(sd, "gk", 0), x:r4(spec.hx - 1), z:0} : null;

  // the ball: placed, or at the feet of whoever has it
  const attackDir = side => side === "att" ? 1 : -1;
  const mates = npcs[mySide], opps = npcs[theirSide];
  let possWho = c.possession, holder = null;
  if (possWho === "me") holder = {p:me, side:mySide};
  else if (possWho === "mates") holder = mates.length ? {p:mates[0], side:mySide} : {p:me, side:mySide};
  else if (possWho === "opps") holder = opps.length ? {p:opps[0], side:theirSide} : null;
  // (validate() has already kept the holder to an outfield player on the pitch, never the wall; this is the last word)
  if (possWho === "mates" && !mates.length) possWho = "me";
  if (possWho === "opps" && !opps.length) possWho = "loose";
  let ball;
  if (c.ball.at) ball = {x:c.ball.at.x, y:c.ball.at.y, z:c.ball.at.z};
  else if (holder) ball = {x:holder.p.x + 0.55*attackDir(holder.side), y:R, z:holder.p.z};
  else {
    const near = opps.length ? opps.reduce((b, o) => Math.hypot(o.x - me.x, o.z - me.z) < Math.hypot(b.x - me.x, b.z - me.z) ? o : b) : null;
    ball = near ? {x:(me.x + near.x)/2, y:R, z:(me.z + near.z)/2} : {x:me.x + 8*attackDir(mySide), y:R, z:me.z};
  }
  const bIn = inside(spec, ball);
  ball = {x:bIn.x, y:Math.max(R, ball.y), z:bIn.z};

  // the wall (G0 decision d: its players are defenders): a line across the way from the ball to the goal's centre
  const wall = [];
  if (n.wall > 0){
    const gx = spec.hx, dx = gx - ball.x, dz = -ball.z, D = Math.hypot(dx, dz) || 1, ux = dx/D, uz = dz/D;
    const dist = Math.min(WALL.D, Math.max(1, D - 1.5));
    for (let i = 0; i < n.wall; i++){
      const off = (i - (n.wall - 1)/2)*WALL.GAP;
      wall.push(Object.assign({slot:"CB", side:"def", i:npcCount.def + i, id:npcId(sd, "def", npcCount.def + i), wall:true},
        inside(spec, {x:ball.x + ux*dist - uz*off, z:ball.z + uz*dist + ux*off})));
    }
    npcs.def.push(...wall);
  }

  // onside starts (TRAINING-SPEC 2): with the offside law on, an attacker past the second-last defender (the keeper
  // counted; with fewer than two the last; with none the halfway line) and past the ball, in the defenders' half, is
  // moved back level with that line, and the sheet says so (rules.js offsidePosition is the same test)
  if (c.offside){
    const B = RULES.OFF.body, eps = RULES.OFF.eps;
    const defs = [...(meAtt ? [] : [me]), ...npcs.def, ...(keeper ? [keeper] : [])].map(p => p.x + B).sort((a, b) => b - a);
    const half = spec.area && Number.isFinite(spec.area.x0) ? -(spec.area.x0 + spec.area.x1)/2 : 0;
    const line = Math.max(defs.length >= 2 ? defs[1] : defs.length ? defs[0] : half, ball.x);
    for (const p of [...(meAtt ? [me] : []), ...npcs.att]){
      if (p.x + B > line + eps && p.x + B > half + 0.06){
        p.x = r4(Math.max(line - B - 0.02, half - B));
        notes.push(p.who === "me" ? "You started offside, so you've been moved back onto the line."
          : `The ${meAtt ? "team-mate" : "opponent"} at ${p.slot} started offside, so he's been moved back onto the line.`);
      }
    }
  }

  // facing: the side with the ball faces the goal it attacks, the other side and the keeper face the ball
  const possSide = holder ? holder.side : null;
  const faceOf = (p, side) => side === possSide || (!possSide && side === "att") ? faceTo(attackDir(side), 0) : faceTo(ball.x - p.x, ball.z - p.z);
  me.yaw = r4(faceOf(me, mySide));
  for (const side of ["att", "def"]) for (const p of npcs[side]) p.yaw = r4(faceOf(p, side));
  if (keeper) keeper.yaw = r4(faceTo(ball.x - keeper.x, ball.z - keeper.z));

  // attributes: mine from the editor (raw, no effSkill: attrs.js attrsForTraining), the NPCs' from their side's
  // average through the seeded role profile (attrsForAI, G0 f), the keeper's set as configured
  me.at = attrsForTraining(c.me);
  for (const side of ["att", "def"]){
    const avg = side === "att" ? c.attAvg : c.defAvg;
    for (const p of npcs[side]){ p.ovr = avg; p.at = attrsForAI({id:p.id, ovr:avg, pos:posOfSlot(p.slot), slot:p.slot}, {training:true}); }
  }
  if (keeper){
    const g = c.gk, ovr = Math.round((g.reflex + g.dive + g.handling + g.posit)/4);
    keeper.ovr = ovr;
    keeper.at = attrsForAI({id:keeper.id, ovr, pos:"GK"}, {training:true});
    keeper.at.gk = Object.assign({}, g);
  }

  // the ball's flight: the launch solved from the placement to the target (no ball is moved here)
  let v = {x:0, y:0, z:0}, w = {x:0, y:0, z:0}, solve = null;
  if (c.ball.launch){
    const L = c.ball.launch;
    const contact = L.kind === "driven" ? -1 : L.kind === "cross" || L.kind === "loft" ? 1 : 0;
    solve = solveStrike({from:{x:ball.x, y:ball.y, z:ball.z}, target:L.target, speed:L.speed, contact, curl:L.curl, foot:"R", kind:L.kind, rollDecel:spec.roll});
    v = {x:solve.v.x, y:solve.v.y, z:solve.v.z}; w = {x:solve.w.x, y:solve.w.y, z:solve.w.z};
    if (!solve.ok) notes.push("The ball can't quite reach that target at that speed, so it goes as close as it can.");
  }
  const laws = {out:c.out, offside:!!c.offside, goals:goalsLawOf(spec), restarts:c.out === "stop"};
  const poss = {team:possSide == null ? -1 : possSide === "att" ? 0 : 1, who:possWho === "loose" ? null : possWho, i:possWho === "mates" || possWho === "opps" ? 0 : -1};
  return {c, spec, n, myTeam, me, mates:npcs[mySide], opps:npcs[theirSide], keeper, ball, v, w, solve, laws, poss, notes, sd, S};
}

/* ---------- the runner's setup ---------- */
const spot = p => ({slot:p.slot, x:p.x, z:p.z, yaw:p.yaw, at:p.at, ovr:p.ovr});
function setupOf(r){
  return {myTeam:r.myTeam, role:ROLE_NAMES[r.c.role] || "Player", seed:r.sd, laws:r.laws,
    me:spot(r.me), mates:r.mates.map(spot), opps:r.opps.map(spot),
    keeper:r.keeper ? Object.assign(spot(r.keeper), {side:r.myTeam === 1 ? "mine" : "theirs"}) : null,
    ball:{x:r.ball.x, y:r.ball.y, z:r.ball.z, vx:r.v.x, vy:r.v.y, vz:r.v.z, wx:r.w.x, wy:r.w.y, wz:r.w.z, free:true},
    poss:r.poss, config:r.c};
}
// a scenario's build(config, env) as the runner calls it: the setup on the cage's own pitch (env.spec)
export function setupFromConfig(type, config, env = {}){
  const r = resolve(type, config, env.seed != null ? env.seed : null, env.spec || null);
  const s = setupOf(r);
  s.notes = r.notes;
  return s;
}

/* ---------- the createMatch cfg ---------- */
const rec = (p, pid, o = {}) => {
  const pos = posOfSlot(p.slot);
  return {pid, name:o.name || "", number:o.number || 0, slot:p.slot, arch:ARCH_OF[pos] || "CM", isGK:p.slot === "GK", isMe:!!o.me, scale:1,
    at:p.at, energy:100, fatigue:0, prefFoot:"Right", items:null, place:{x:p.x, z:p.z, yaw:p.yaw}, ovr:p.ovr != null ? p.ovr : null};
};
// an eleven-a-side match (Full Match): my team in a 4-3-3 with me in my role's slot, theirs the same, both keepers
const XI = Object.freeze(["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"]);
function matchCfg(type, config, seed){
  const notes = [], c = validate(type, config, notes), sd = (seed != null ? seed : c.seed) >>> 0, spec = cagePitch("full");
  const mySlot = ROLE_SLOT[c.role] || "CM";
  const teams = [0, 1].map(t => ({name:t ? "B" : "A", players:[], bench:[]}));
  for (const t of [0, 1]){
    let mePlaced = false;
    XI.forEach((slot, i) => {
      const isMe = t === 0 && !mePlaced && slot === mySlot;
      if (isMe) mePlaced = true;
      const avg = t === 0 ? c.attAvg : c.defAvg, id = npcId(sd, t ? "b" : "a", i);
      let at;
      if (isMe) at = attrsForTraining(c.me);
      else if (slot === "GK"){ at = attrsForAI({id, ovr:avg, pos:"GK"}, {training:true}); if (t === 1) at.gk = Object.assign({}, c.gk); }
      else at = attrsForAI({id, ovr:avg, pos:posOfSlot(slot), slot}, {training:true});
      teams[t].players.push(rec({slot, at, x:0, z:0, yaw:0, ovr:isMe ? null : avg}, t*100 + i + 1, {me:isMe, number:i + 1}));
    });
  }
  const cfg = {seed:sd, mode:"train", spec, halfRealSec:600, teams, me:{team:0, slot:mySlot, prefFoot:"Right", role:"starter"},
    rules:{out:"stop", offside:true, goals:2, restarts:true, cards:true, halfTime:true, stoppage:true}, kickoffTeam:0};
  return {cfg, ballInit:{p:{x:0, y:R, z:0}, v:{x:0, y:0, z:0}, w:{x:0, y:0, z:0}}, setup:null, poss:{team:0, who:"me", i:-1}, notes};
}

// cfgFromConfig(type, config, seed): see the header
// (no seed given: the configuration's own, which a preset keeps with it)
export function cfgFromConfig(type, config, seed = null, spec = null){
  const S = typeOf(type);
  if (S && S.match) return matchCfg(type, config, seed);
  const r = resolve(type, config, seed, spec);
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  const oppTeam = 1 - r.myTeam;
  teams[r.myTeam].players.push(rec(r.me, 1, {me:true, number:9}));
  r.mates.forEach((p, i) => teams[r.myTeam].players.push(rec(p, 100 + i, {number:2 + i})));
  r.opps.forEach((p, i) => teams[oppTeam].players.push(rec(p, 200 + i, {number:2 + i})));
  if (r.keeper) teams[1].players.push(rec(r.keeper, 300, {number:1}));
  const cfg = {seed:r.sd, mode:"train", spec:r.spec, halfRealSec:1e6, teams,
    me:{team:r.myTeam, slot:r.me.slot, prefFoot:"Right", role:"starter"},
    rules:Object.assign({offside:false, restarts:false, cards:false, subs:0, halfTime:false, stoppage:false}, r.laws),
    kickoffTeam:r.poss.team >= 0 ? r.poss.team : r.myTeam, htAuto:true};
  const ballInit = {p:{x:r.ball.x, y:r.ball.y, z:r.ball.z}, v:r.v, w:r.w, kind:r.c.ball.launch ? r.c.ball.launch.kind : null,
    apex:r.solve ? r.solve.apex : null, tFlight:r.solve ? r.solve.tFlight : null, ok:r.solve ? r.solve.ok : true};
  return {cfg, ballInit, setup:setupOf(r), poss:r.poss, notes:r.notes};
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainTeams = {cfgFromConfig, setupFromConfig, npcId, WALL};
