// js/life/football/duel.js: the odds of a contest for the ball. The shield challenge (a defender trying to take the ball
// off a shielding carrier without a tackle), the 50/50 of two players arriving together, the tackle's win chance with
// its timing and angle, the standing tackle's reach, the slide's reach, its friction and the time a slider needs to get
// up again.
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN Phase 2b "duel.js"; formulas
// TRAINING-SPEC section 3 (shield, tackle) with the Gate G0 lead readings (fatigue factor, 50/50 rating X = S + C, the
// shield challenge).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Every constant is a tunable read
// at call time (tune.js). Angles: rel is the angle in radians between the reference body's facing and the direction to
// the other body (0 in front, PI/2 at the side, PI behind); only its size matters.

import {TUNE} from "./tune.js";
import {exp} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const PI = Math.PI, HALF = PI/2;
const G = 9.81;

// the logistic of the spec: 1/(1 + exp(-x/k))
export const logistic = (x, k = 8) => 1/(1 + exp(-x/k));

/* ---------- the shield ---------- */

// p(the defender wins a shield challenge) = clamp(logistic((D - S)/8) x angle x fatigue, 0.05, 0.90) (spec 3)
export function pShieldLoss(S, D, angle = 1, fatigue = 1){
  return clamp(logistic(D - S, TUNE.SH_K.value)*angle*fatigue, TUNE.SH_LO.value, TUNE.SH_HI.value);
}
// the shield's angle factor: a challenge from behind 0.6, from the side 1.0 (and from the front, where the body is not
// between them, as from the side); between behind and the side it is interpolated by the angle
export function shieldAngle(rel){
  const a = Math.abs(+rel || 0);
  if (a <= HALF) return TUNE.SH_SIDE.value;
  const u = clamp((a - HALF)/HALF, 0, 1);
  return TUNE.SH_SIDE.value + (TUNE.SH_BEHIND.value - TUNE.SH_SIDE.value)*u;
}
// the fatigue factor of a challenge (G0): fF(challenger's breath)/fF(holder's breath), fF(b) = 0.85 + 0.15 b, the
// control zone's own fFatigue. Equal breath gives 1; a spent holder against a fresh challenger 1.18
export const fF = b => TUNE.FF_0.value + TUNE.FF_K.value*clamp(b == null ? 1 : +b, 0, 1);
export function fatigueFactor(bChallenger, bHolder){ return fF(bChallenger)/fF(bHolder); }

/* ---------- the 50/50 ---------- */

// p(A wins a 50/50) with each side's X = S + C (shield plus control rating, G0): clamp(logistic((XA - XB)/DUEL_K) x angle
// x fatigue, 0.05, 0.90). At equal angle and fatigue p(A, B) + p(B, A) = 1 inside the clamps
export function p5050(XA, XB, angle = 1, fatigue = 1){
  return clamp(logistic(XA - XB, TUNE.DUEL_K.value)*angle*fatigue, TUNE.DUEL_LO.value, TUNE.DUEL_HI.value);
}

/* ---------- the tackle ---------- */

// p(the tackler wins) = clamp(logistic((T - C)/8) x timing x angle, 0.05, 0.92) (spec 3). C is S while the carrier shields
export function pTackleWin(T, C, timing = 1, angle = 1){
  return clamp(logistic(T - C, TUNE.TK_K.value)*timing*angle, TUNE.TK_LO.value, TUNE.TK_HI.value);
}
// timing: 1 when the foot meets the ball within 0.08 s of the ball's closest point, falling linearly to 0.3 at 0.3 s
// (and staying there beyond); dt in seconds, either sign
export function timingFactor(dt){
  const a = Math.abs(+dt || 0), ok = TUNE.TM_OK.value, bad = Math.max(ok + 1e-6, TUNE.TM_BAD.value);
  if (a <= ok) return 1;
  const u = clamp((a - ok)/(bad - ok), 0, 1);
  return 1 + (TUNE.TM_MIN.value - 1)*u;
}
// the tackle's angle factor from the carrier's facing: front 1.0, side 0.9, behind 0.5, interpolated by the angle
export function angleFactor(rel){
  const a = clamp(Math.abs(+rel || 0), 0, PI), F = TUNE.TA_FRONT.value, S = TUNE.TA_SIDE.value, B = TUNE.TA_BEHIND.value;
  return a <= HALF ? F + (S - F)*a/HALF : S + (B - S)*(a - HALF)/HALF;
}
// the late-or-behind foul chance of a tackle that reached the ball: TF_BEHIND x fromBehind (0..1) + TF_LATE x lateness,
// where lateness runs 0 at 0.08 s off the moment to 1 at 0.3 s
export function lateness(dt){
  const a = Math.abs(+dt || 0), ok = TUNE.TM_OK.value, bad = Math.max(ok + 1e-6, TUNE.TM_BAD.value);
  return clamp((a - ok)/(bad - ok), 0, 1);
}
export function pTackleFoul(fromBehind, dt){
  return clamp(TUNE.TF_BEHIND.value*clamp(+fromBehind || 0, 0, 1) + TUNE.TF_LATE.value*lateness(dt), 0, 0.9);
}

// the standing tackle's reach: 0.95 + 0.25 tackling/99 m from the body to the ball's centre (spec 3); a toe poke
// reaches TUNE.POKE_DR further
export function standReach(tackling){ return TUNE.TR_0.value + TUNE.TR_K.value*clamp(+tackling || 0, 0, 99)/99; }
export function pokeReach(tackling){ return standReach(tackling) + TUNE.POKE_DR.value; }

/* ---------- the slide ---------- */

// the slide's reach: 1.6 + 0.9 v/vTop m from where it starts (spec 3)
export function slideReach(v, vTop){
  const top = Math.max(0.1, +vTop || 0.1);
  return TUNE.SL_R0.value + TUNE.SL_RK.value*clamp((+v || 0)/top, 0, 1);
}
// the slide's deceleration on grass: mu x g
export const slideDecel = () => TUNE.SL_MU.value*G;
// One step of a sliding body (its momentum carried, slowed by grass friction): state = {x, z, vx, vz} is moved in place
// over h seconds; the speed falls by mu g h and never turns round. Returns the distance moved this step.
export function slideStep(state, h){
  const vx = +state.vx || 0, vz = +state.vz || 0, v = Math.sqrt(vx*vx + vz*vz);
  if (!(v > 0) || !(h > 0)){ state.vx = 0; state.vz = 0; return 0; }
  const dv = slideDecel()*h, v1 = Math.max(0, v - dv);
  // the distance at the mean speed of the step (exact under constant deceleration, up to where it stops)
  const tt = v1 > 0 ? h : v/slideDecel(), d = 0.5*(v + v1)*tt;
  state.x += vx/v*d; state.z += vz/v*d;
  state.vx = vx/v*v1; state.vz = vz/v*v1;
  return d;
}
// the slide's whole run from an approach speed v0: travel v0^2/(2 mu g) m over v0/(mu g) s
export function slideTravel(v0){ const v = Math.max(0, +v0 || 0); return v*v/(2*slideDecel()); }
export function slideTime(v0){ return Math.max(0, +v0 || 0)/slideDecel(); }

// the time a slider needs to get up: 0.45 + 0.6(1 - agility/99) s, REC_MISS times that after a miss (spec 3)
export function recovery(agility, missed = false){
  const t = TUNE.REC_0.value + TUNE.REC_K.value*(1 - clamp(+agility || 0, 0, 99)/99);
  return missed ? t*TUNE.REC_MISS.value : t;
}
