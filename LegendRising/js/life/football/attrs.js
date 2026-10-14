// js/life/football/attrs.js: what a footballer can do, as the numbers the simulation reads. The player's vector comes
// from his effective skills (the 14 career skills after nerves and tired legs), his boots and his personality; every AI
// player's comes from his overall, his position and a fixed per-player wobble, so a squad is the same squad every time.
// Owner: WP-E (match simulation). Contract DESIGN 1.4.13 (Attrs, attrsForPlayer, attrsForAI); rules 3.2.5 (AI
// attributes) and 1.5.3 (ctrl, pacc).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. The per-player wobble is a hash of
// the player's id (rng.js hashStr), not a random draw.

import {hashStr} from "./rng.js";
import {TUNE} from "./tune.js";

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
// of the game.
//
// The duel stats of TRAINING-SPEC section 3 (P2b-A, ball-4 and ATTR-1). The spec names seven stats; the game has four
// of them and the other three are derived here from the real skills (the coefficients are tunables, tune.js MAP_*):
//
//   spec stat      the game's attribute
//   BallControl    ctrl (derived above)
//   Agility        agility (derived above)
//   Composure      composure (a career skill)
//   Tackling       tackling (a career skill)
//   Strength       strength = 0.75 power + 0.25 jumping (Shot power is what the gym's strength sets train)
//   Balance        balance = 0.4 agility + 0.3 ctrl + 0.3 power
//   DefAwareness   defAware = 0.6 interception + 0.25 composure + 0.15 tackling
//
// levelled() and raised() derive them again with the rest. A record made before they existed (an old checkpoint, a
// test's bare record) reads them through strengthOf, balanceOf and defAwareOf, which work them out the same way.
const num = v => v == null || !Number.isFinite(+v) ? 50 : +v;
export const strengthOf = a => a && a.strength != null ? +a.strength : clamp(TUNE.MAP_STR_POW.value*num(a && a.power) + TUNE.MAP_STR_JMP.value*num(a && a.jumping), 1, 99);
export const balanceOf = a => a && a.balance != null ? +a.balance : clamp(TUNE.MAP_BAL_AGI.value*num(a && a.agility) + TUNE.MAP_BAL_CTL.value*num(a && a.ctrl) + TUNE.MAP_BAL_POW.value*num(a && a.power), 1, 99);
export const defAwareOf = a => a && a.defAware != null ? +a.defAware : clamp(TUNE.MAP_DEF_INT.value*num(a && a.interception) + TUNE.MAP_DEF_CMP.value*num(a && a.composure) + TUNE.MAP_DEF_TKL.value*num(a && a.tackling), 1, 99);
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
  a.strength = null; a.balance = null; a.defAware = null;
  a.strength = strengthOf(a); a.balance = balanceOf(a); a.defAware = defAwareOf(a);
  return a;
}

// what derive() is given for a record: the player's boots and decision trait (attrsForPlayer keeps them on it); an AI
// player's record has neither
function deriveOpts(a){ return {control: !!a.controlBoots, dec: a.decTrait != null ? a.decTrait : null}; }

// The player's attributes (1.4.13) from his effective skills (bridge.effSkills: S.skills after nerves and tired legs,
// composure exempt), his items ({grip, strike, control}) and his traits ({team, conf, dec, risk}).
export function attrsForPlayer(effSkills, items = {}, traits = {}){
  const a = {};
  for (const k of SKILL_KEYS) a[k] = clamp(effSkills && effSkills[k] != null ? +effSkills[k] : 50, 1, 99);
  // the two speed skills of a migrated career (pace their mean when the record no longer has it)
  for (const k of SPEED_KEYS) if (effSkills && effSkills[k] != null) a[k] = clamp(+effSkills[k], 1, 99);
  if (effSkills && effSkills.pace == null && a.acceleration != null && a.sprintSpeed != null) a.pace = (a.acceleration + a.sprintSpeed)/2;
  // (the boots and the decision trait kept on the record, so anything that works the derived numbers out again from
  // moved skills, a warm-up's boost, uses the same ones: deriveOpts)
  a.controlBoots = !!(items && items.control);
  a.decTrait = traits && traits.dec != null ? +traits.dec : null;
  derive(a, deriveOpts(a));
  a.gk = null;
  a.strikeBoots = !!(items && items.strike);
  a.grip = !!(items && items.grip);
  return a;
}

// An AI player's attributes from p = {id, ovr, pos} (pos is the world code GK, DF, CM, CAM, LW, RW, ST or an
// archetype): attr[k] = clamp(ovr + PROFILE[arch][k] + 6 hashNoise(id, k), 20, 99) (3.2.5). A keeper gets his keeping
// numbers {reflex, dive, handling, posit, distrib} from his overall plus the same wobble, and outfield skills a little
// under it (a keeper is not picked for his finishing).
//
// (P4-A, ATTR-1) o.training: a Training Mode NPC, whose average is set in the attribute editor. Its floor is the
// editor's (1, not 20: an average of 10 means a side of tens), and both speed skills are its pace's profile plus the
// same wobble as every other skill, so each of the 15 editor skills is average + PROFILE[arch][k] + up to 6 either
// way before the clamps (G0 decision f). Its id comes from the training seed (train/teams.js), so the same seed gives
// the same players. A career's AI players never pass it: their numbers are unchanged.
export function attrsForAI(p, o = {}){
  const id = p.id != null ? p.id : 0, ovr = clamp(+p.ovr || 50, 1, 99);
  const arch = ARCH_OF_POS[p.pos] || (PROFILE[p.pos] ? p.pos : 'CM');
  const lo = o.training ? 1 : 20;
  const a = {};
  if (arch === 'GK'){
    for (const k of SKILL_KEYS) a[k] = clamp(Math.round(ovr - 10 + 6*hashNoise(id, k)), lo, 99);
    a.passing = clamp(Math.round(ovr - 4 + 6*hashNoise(id, 'passing')), lo, 99);
    // his first steps are keeping, not outfield running: set, shuffle and the step across before a dive come from his
    // acceleration (and his agility from it), so it is at his overall like his keeping numbers. Since the speed split
    // (A1.1) steepened the mover below acceleration 50, a keeper at ovr - 10 set himself late (P2b: close-range saves
    // and the harness goals per match)
    a.acceleration = clamp(Math.round(ovr + 6*hashNoise(id, "gkacc")), lo, 99);
    derive(a);
    a.gk = {};
    for (const k of GK_KEYS) a.gk[k] = clamp(Math.round(ovr + 6*hashNoise(id, "gk" + k)), lo, 99);
    return a;
  }
  const P = PROFILE[arch];
  for (const k of SKILL_KEYS) a[k] = clamp(Math.round(ovr + P[k] + 6*hashNoise(id, k)), lo, 99);
  if (o.training){
    a.acceleration = clamp(Math.round(ovr + P.pace + 6*hashNoise(id, "acc")), 1, 99);
    a.sprintSpeed = clamp(Math.round(ovr + P.pace + 6*hashNoise(id, "spr")), 1, 99);
    derive(a);
    a.gk = null;
    return a;
  }
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
  derive(a, deriveOpts(a));
  if (at.gk){ a.gk = {}; for (const [k, v] of Object.entries(at.gk)) a.gk[k] = clamp(Math.round(v + shift), 20, 99); }
  return a;
}

// The player's attributes with skill points on top (a warm-up's boost, A1.8): every career skill up by all, the ones
// in add ({skill: +n}) by their own amount as well, each capped at 99 as career.js effSkill caps them, and the derived
// ones worked out again with the same boots and decision trait, so the record is what attrsForPlayer makes from the
// raised skills. (pace is not a career skill: it stays the mean of the two speed skills.) A new object
export function raised(at, all = 0, add = {}){
  if (!at) return at;
  const a = Object.assign({}, at);
  for (const k of SKILL_KEYS.concat(SPEED_KEYS)) if (k !== "pace" && a[k] != null) a[k] = clamp(Math.min(99, a[k] + all + (+add[k] || 0)), 1, 99);
  derive(a, deriveOpts(a));
  return a;
}

// a keeper's numbers for anyone who has to go in goal (an outfield player after a red card to the keeper)
export function keeperOf(at){
  if (at.gk) return at.gk;
  const base = clamp(0.5*at.jumping + 0.3*at.composure + 0.2*at.agility - 15, 20, 99);
  return {reflex: base, dive: base, handling: base, posit: base, distrib: clamp(at.passing - 10, 20, 99)};
}

/* ---------- Training Mode (P4-A, ATTR-1; TRAINING-SPEC 4, the attribute editor) ----------
   The editor shows the 15 career skills (js/data/game.js SKILLS: pace is two skills there, acceleration and sprint
   speed) at 1 to 99, and the keeper's set. The presets are the lead's G0 values. */
export const EDIT_SKILLS = Object.freeze(["power", "aero", "curve", "accuracy", "passing", "passacc", "acceleration", "sprintSpeed",
  "dribbling", "stamina", "composure", "tackling", "interception", "jumping", "heading"]);
export const GK_KEYS = Object.freeze(["reflex", "dive", "handling", "posit", "distrib"]);
export const ATTR_MIN = 1, ATTR_MAX = 99;
export const ATTR_PRESETS = Object.freeze({low: 35, average: 55, high: 75, max: 99});
// the derived values the editor shows read-only (derive() works them out)
export const DERIVED_KEYS = Object.freeze(["pace", "ctrl", "agility", "strength", "balance", "defAware"]);

// every editor skill at one value (a preset: 'low', 'average', 'high', 'max', or a number)
export function presetSkills(level = "average", keys = EDIT_SKILLS){
  const v = clamp(Math.round(typeof level === "number" ? level : ATTR_PRESETS[level] || ATTR_PRESETS.average), ATTR_MIN, ATTR_MAX), o = {};
  for (const k of keys) o[k] = v;
  return o;
}
// a set of editor values made safe: every key of keys an integer 1 to 99, a missing or bad one from dflt
export function cleanSkills(src, dflt, keys = EDIT_SKILLS){
  const o = {};
  for (const k of keys){
    const v = src && src[k] != null && src[k] !== "" && Number.isFinite(+src[k]) ? +src[k] : dflt && Number.isFinite(+dflt[k]) ? +dflt[k] : ATTR_PRESETS.average;
    o[k] = clamp(Math.round(v), ATTR_MIN, ATTR_MAX);
  }
  return o;
}

// The player's attributes in Training from raw editor values (no effSkill: it is 0 with no career, career.js), through
// the same chain as a career's (attrsForPlayer, derive). gk (optional): a keeper's set on the record.
export function attrsForTraining(skills, gk = null){
  const a = attrsForPlayer(cleanSkills(skills, null), {}, {});
  if (gk) a.gk = cleanSkills(gk, null, GK_KEYS);
  return a;
}
// the derived values of a set of editor values (what the editor shows read-only)
export function derivedOf(skills){
  const a = attrsForTraining(skills), o = {};
  for (const k of DERIVED_KEYS) o[k] = Math.round(a[k]*10)/10;
  return o;
}
