// js/life/football/attrs.js: what a footballer can do, as the numbers the simulation reads. The player's vector comes
// from his effective skills (the 14 career skills after nerves and tired legs), his boots and his personality; every AI
// player's comes from his overall, his position and a fixed per-player wobble, so a squad is the same squad every time.
// Owner: WP-E (match simulation). Contract DESIGN 1.4.13 (Attrs, attrsForPlayer, attrsForAI); rules 3.2.5 (AI
// attributes) and 1.5.3 (ctrl, pacc).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. The per-player wobble is a hash of
// the player's id (rng.js hashStr), not a random draw.

import {hashStr} from "./rng.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const r1 = v => Math.round(v*10)/10;

// the 14 career skills (js/data/game.js SKILLS), in that order
export const SKILL_KEYS = Object.freeze(["power", "aero", "curve", "accuracy", "passing", "passacc", "pace", "dribbling",
  "stamina", "composure", "tackling", "interception", "jumping", "heading"]);

// what each match archetype asks of a player (js/data/game.js POS bonuses, the same numbers), used to give AI players
// a profile around their overall: profile[k] = 1.2 x (bonus[k] - the archetype's mean bonus), so the profile averages
// to zero and an AI player's mean skill is his overall
const POS_BONUS = {
  DF: {tackling: 9, composure: 5, passing: 3, interception: 7, heading: 6, jumping: 4},
  CM: {passing: 6, stamina: 4, tackling: 4, passacc: 5, interception: 4},
  AM: {curve: 4, passing: 6, accuracy: 2, passacc: 5},
  W: {pace: 6, dribbling: 6, passacc: 2},
  ST: {power: 6, accuracy: 6, heading: 4, jumping: 3}
};
export const PROFILE = {};
for (const [arch, b] of Object.entries(POS_BONUS)){
  const mean = SKILL_KEYS.reduce((s, k) => s + (b[k] || 0), 0)/SKILL_KEYS.length, p = {};
  for (const k of SKILL_KEYS) p[k] = r1(1.2*((b[k] || 0) - mean));
  PROFILE[arch] = Object.freeze(p);
}
Object.freeze(PROFILE);

// the world's position codes (W.players[].pos) to the match archetype
export const ARCH_OF_POS = Object.freeze({GK: 'GK', DF: 'DF', CM: 'CM', CAM: 'AM', LW: 'W', RW: 'W', ST: 'ST'});

// a fixed wobble in [-1, 1) for a player and a skill
export function hashNoise(id, k){ return hashStr("attr:" + id + ":" + k)/2147483648 - 1; }

// Pace is two skills (addendum A1.1, WP-F): acceleration (how steeply you get up to speed) and sprintSpeed (how fast
// you go flat out). A record that has only pace (an old save before its migration, a test) has both at its pace; pace
// itself stays as their mean, for every reader that weighs a player's pace as one number.
export const SPEED_KEYS = Object.freeze(["acceleration", "sprintSpeed"]);
// the attributes that are not career skills, from the ones that are (both paths use the same formulas):
// ctrl (Ball Control) = 0.65 dribbling + 0.2 composure + 0.15 passing (+5 with the control boots), pacc = 0.65 passacc
// + 0.35 passing, agility = (acceleration + dribbling)/2, vision and decision from passing, composure and the reading
// of the game
function derive(a, o = {}){
  if (a.acceleration == null) a.acceleration = a.pace;
  if (a.sprintSpeed == null) a.sprintSpeed = a.pace;
  a.acceleration = clamp(a.acceleration, 1, 99); a.sprintSpeed = clamp(a.sprintSpeed, 1, 99);
  a.pace = (a.acceleration + a.sprintSpeed)/2;
  a.ctrl = clamp(0.65*a.dribbling + 0.2*a.composure + 0.15*a.passing + (o.control ? 5 : 0), 1, 99);
  a.passAcc = clamp(0.65*a.passacc + 0.35*a.passing, 1, 99);
  a.agility = (a.acceleration + a.dribbling)/2;
  const read = o.dec != null ? clamp(+o.dec, 0, 100) : 0.5*(a.composure + a.passing);
  a.vision = clamp(0.5*a.passing + 0.2*a.passacc + 0.3*a.composure, 1, 99);
  a.decision = clamp(0.6*(0.5*a.composure + 0.5*a.passing) + 0.4*read, 1, 99);
  return a;
}

// The player's attributes (1.4.13) from his effective skills (bridge.effSkills: S.skills after nerves and tired legs,
// composure exempt), his items ({grip, strike, control}) and his traits ({team, conf, dec, risk}).
export function attrsForPlayer(effSkills, items = {}, traits = {}){
  const a = {};
  for (const k of SKILL_KEYS) a[k] = clamp(effSkills && effSkills[k] != null ? +effSkills[k] : 50, 1, 99);
  // the two speed skills of a migrated career (pace their mean when the record no longer has it)
  for (const k of SPEED_KEYS) if (effSkills && effSkills[k] != null) a[k] = clamp(+effSkills[k], 1, 99);
  if (effSkills && effSkills.pace == null && a.acceleration != null && a.sprintSpeed != null) a.pace = (a.acceleration + a.sprintSpeed)/2;
  derive(a, {control: !!(items && items.control), dec: traits && traits.dec != null ? traits.dec : null});
  a.gk = null;
  a.strikeBoots = !!(items && items.strike);
  a.grip = !!(items && items.grip);
  return a;
}

// An AI player's attributes from p = {id, ovr, pos} (pos is the world code GK, DF, CM, CAM, LW, RW, ST or an
// archetype): attr[k] = clamp(ovr + PROFILE[arch][k] + 6 hashNoise(id, k), 20, 99) (3.2.5). A keeper gets his keeping
// numbers {reflex, dive, handling, posit, distrib} from his overall plus the same wobble, and outfield skills a little
// under it (a keeper is not picked for his finishing).
export function attrsForAI(p){
  const id = p.id != null ? p.id : 0, ovr = clamp(+p.ovr || 50, 1, 99);
  const arch = ARCH_OF_POS[p.pos] || (PROFILE[p.pos] ? p.pos : 'CM');
  const a = {};
  if (arch === 'GK'){
    for (const k of SKILL_KEYS) a[k] = clamp(Math.round(ovr - 10 + 6*hashNoise(id, k)), 20, 99);
    a.passing = clamp(Math.round(ovr - 4 + 6*hashNoise(id, 'passing')), 20, 99);
    derive(a);
    a.gk = {};
    for (const k of ["reflex", "dive", "handling", "posit", "distrib"]) a.gk[k] = clamp(Math.round(ovr + 6*hashNoise(id, "gk" + k)), 20, 99);
    return a;
  }
  const P = PROFILE[arch];
  for (const k of SKILL_KEYS) a[k] = clamp(Math.round(ovr + P[k] + 6*hashNoise(id, k)), 20, 99);
  // the speed split (A1.1), as the migration splits a career's pace: wingers and full-backs quicker off the mark,
  // centre-backs and strikers quicker flat out, the other skill 3 under; the rest as their pace; a fixed wobble on top
  const nudge = speedNudge(arch, p.slot, id);
  a.acceleration = clamp(Math.round(a.pace + 3*nudge + 2*hashNoise(id, "acc")), 20, 99);
  a.sprintSpeed = clamp(Math.round(a.pace - 3*nudge + 2*hashNoise(id, "spr")), 20, 99);
  derive(a);
  a.gk = null;
  return a;
}

// +1 for a body built for the first yards (wingers, full-backs), -1 for one built for the long run (centre-backs,
// strikers), 0 otherwise. slot (positions.js code) when known; a defender without one is either, by his id
export function speedNudge(arch, slot, id = 0){
  if (slot === "LB" || slot === "RB" || slot === "LWB" || slot === "RWB" || slot === "LW" || slot === "RW" || slot === "LM" || slot === "RM") return 1;
  if (slot === "CB" || slot === "ST" || slot === "CF") return -1;
  if (arch === "W") return 1;
  if (arch === "ST") return -1;
  if (arch === "DF") return hashNoise(id, "fb") > 0 ? 1 : -1;
  return 0;
}
// An AI player's attributes moved by shift points (the match's levelling of the two sides, sim.js LEVEL): every
// skill and keeping number, the derived ones worked out again. A new object; at itself is not changed.
export function levelled(at, shift){
  if (!at || !shift) return at;
  const a = Object.assign({}, at);
  for (const k of SKILL_KEYS.concat(SPEED_KEYS)) if (a[k] != null) a[k] = clamp(Math.round(a[k] + shift), 20, 99);
  derive(a);
  if (at.gk){ a.gk = {}; for (const [k, v] of Object.entries(at.gk)) a.gk[k] = clamp(Math.round(v + shift), 20, 99); }
  return a;
}

// a keeper's numbers for anyone who has to go in goal (an outfield player after a red card to the keeper)
export function keeperOf(at){
  if (at.gk) return at.gk;
  const base = clamp(0.5*at.jumping + 0.3*at.composure + 0.2*at.agility - 15, 20, 99);
  return {reflex: base, dive: base, handling: base, posit: base, distrib: clamp(at.passing - 10, 20, 99)};
}
