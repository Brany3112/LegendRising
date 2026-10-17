// js/life/football/zone.js: the control zone and the race to the ball. A player's ratings for a contest (control c and
// its comfortable ball speed vc, shield S, challenge D, tackle T, control against a tackle C), his control radius R for
// a ball (its speed relative to him, its height, where it is against his facing, his breath), the body part a ball at
// a height is met with, the quality q of a first touch and how far it knocks the ball, and who gets to the ball first
// (the arrival time of every nearby player on the ball's predicted path, with his own mover).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN Phase 2b "zone.js"; formulas
// TRAINING-SPEC section 3 (first to the ball, control zone and touch), the stat mapping in attrs.js.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Every constant is a tunable read
// at call time (tune.js).
//
// Readings of the spec where it leaves a choice (BUILD-PLAN P2b-A deviations):
// - v, the ball speed in fSpeed and q, is the ball's speed relative to the player's body, so a pass met on the run is
//   as easy as the same pass met standing at the speed it closes on him (receiving on the move, ball-1);
// - breath is the engine's breath factor bF (stamina.js stamFactors: sstep(0, 35, B)), the one every other tired
//   effect reads;
// - fHeight eases from 1 at 0.4 m to 0.6 at 1.4 m with a smoothstep (the spec says "easing"); above 1.4 m it is a header,
//   so R is 0 there (headers are their own contact, touch.js headerContact);
// - heights are of the ball's centre above the player's root, scaled by his height (agent.scale).

import {TUNE} from "./tune.js";
import {balanceOf, strengthOf, defAwareOf} from "./attrs.js";
import {firstReach} from "./ball.js";
import {sprintSpeed} from "../mover.js";
import {FRESH} from "../stamina.js";
import {dirOf} from "./pitchspec.js";
import {hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const num = (v, d = 50) => v == null || !Number.isFinite(+v) ? d : +v;

/* ---------- ratings ---------- */

// The contest ratings of an attribute record (spec 3), each on the 1 to 99 scale except c (0 to 1):
//   c  = (0.55 BallControl + 0.20 Agility + 0.15 Composure + 0.10 Balance)/99   control
//   vc = 8 + 10 c                                                              comfortable ball speed (m/s)
//   S  = 0.45 Strength + 0.35 BallControl + 0.20 Balance                        shield
//   D  = 0.45 Tackling + 0.30 Strength + 0.25 DefAwareness                      a defender against a shield
//   T  = 0.50 Tackling + 0.25 Strength + 0.25 DefAwareness                      tackle
//   C  = 0.50 BallControl + 0.30 Agility + 0.20 Balance                         control against a tackle
// out: a record to fill (no allocation in a step)
export function ratings(at, out = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}){
  const a = at || {};
  const ctrl = num(a.ctrl), agi = num(a.agility), cmp = num(a.composure), tkl = num(a.tackling);
  const bal = balanceOf(a), str = strengthOf(a), def = defAwareOf(a);
  const U = TUNE;
  out.c = clamp((U.C_CTRL.value*ctrl + U.C_AGI.value*agi + U.C_CMP.value*cmp + U.C_BAL.value*bal)/99, 0, 1);
  out.vc = U.VC0.value + U.VC1.value*out.c;
  out.S = U.S_STR.value*str + U.S_CTRL.value*ctrl + U.S_BAL.value*bal;
  out.D = U.D_TKL.value*tkl + U.D_STR.value*str + U.D_DEF.value*def;
  out.T = U.T_TKL.value*tkl + U.T_STR.value*str + U.T_DEF.value*def;
  out.C = U.CT_CTRL.value*ctrl + U.CT_AGI.value*agi + U.CT_BAL.value*bal;
  return out;
}
const RT = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
// c alone (agent, attribute record or a number)
export function cOf(x){
  if (typeof x === 'number') return clamp(x, 0, 1);
  return ratings(x && x.at ? x.at : x, RT).c;
}

/* ---------- the control radius ---------- */

// the factors of R (spec 3)
export const fSpeed = (v, vc) => 1/(1 + Math.max(0, v - vc)/TUNE.FS_DIV.value);
export function fHeight(y, scale = 1){
  const s = scale || 1, y0 = TUNE.FH_Y0.value*s, y1 = TUNE.FH_Y1.value*s;
  if (y <= y0) return 1;
  if (y > y1) return 0;                 // a header
  return 1 + (TUNE.FH_MIN.value - 1)*sstep(y0, y1, y);
}
export const fAngle = cosA => Math.max(TUNE.FA_MIN.value, TUNE.FA_0.value + TUNE.FA_K.value*clamp(cosA, -1, 1));
export const fFatigue = breath => TUNE.FF_0.value + TUNE.FF_K.value*clamp(breath == null ? 1 : +breath, 0, 1);
// R = 0.9 (0.6 + 0.8 c) fSpeed fHeight fAngle fFatigue (metres), from the numbers themselves
export function radius(c, v, vc, y, scale, cosA, breath){
  return TUNE.R0.value*(TUNE.R_A.value + TUNE.R_B.value*c)*fSpeed(v, vc)*fHeight(y, scale)*fAngle(cosA)*fFatigue(breath);
}

// The geometry of a ball against a body, filled into out (one record reused; no allocation in a step):
// dist (horizontal, centre to centre), y (the ball's centre above his root), cosA (the ball's direction against his
// facing: 1 ahead, -1 behind), side ('R' | 'L'), vrel (the ball's speed relative to his body).
export function geom(a, ball, out){
  const m = a.m || a, P = ball.p || ball, V = ball.v || ZERO;
  const dx = P.x - m.x, dz = P.z - m.z, dist = hypot(dx, dz);
  const f = dirOf(m.yaw != null ? +m.yaw : 0);
  out.dist = dist; out.y = P.y - (+a.y || 0);
  out.cosA = dist > 1e-6 ? (dx*f.x + dz*f.z)/dist : 1;
  out.side = dx*(-f.z) + dz*f.x >= 0 ? 'R' : 'L';
  const vx = (+V.x || 0) - (+m.vx || 0), vz = (+V.z || 0) - (+m.vz || 0), vy = +V.y || 0;
  out.vrel = hypot(vx, vy, vz);
  return out;
}
const ZERO = {x: 0, y: 0, z: 0};
const GM = {dist: 0, y: 0, cosA: 1, side: 'R', vrel: 0};
// the breath of a body: its stamina factors' bF (fresh when it has none)
export function breathOf(a){ return a && a.fac && a.fac.bF != null ? a.fac.bF : 1; }

// R(a, ball, ms): the control radius (metres) of agent a for the ball now. opt (optional): {angle: false} leaves the
// facing out (a player running to a ball turns to it: the race uses that), {speed: false} leaves the ball's speed out
// (the leg's stretch for a block), {breath} overrides his breath. 0 for a ball above the body (a header).
export function R(a, ball, ms, opt){
  const g = geom(a, ball, GM), r = ratings(a.at, RT);
  const cosA = opt && opt.angle === false ? 1 : g.cosA;
  const v = opt && opt.speed === false ? 0 : g.vrel;
  const breath = opt && opt.breath != null ? opt.breath : breathOf(a);
  return radius(r.c, v, r.vc, g.y, a.scale || 1, cosA, breath);
}

// the body part a ball at height y (its centre above the root, metres; scale the body's height) is met with: under
// 0.4 m the foot, up to 0.95 m the thigh, up to 1.4 m the chest, above that the head
export function part(y, scale = 1){
  const s = scale || 1;
  if (y < TUNE.FH_Y0.value*s) return 'foot';
  if (y < 0.95*s) return 'thigh';
  if (y <= TUNE.FH_Y1.value*s) return 'chest';
  return 'head';
}

/* ---------- the first touch ---------- */

// q = clamp(1.2 c - 0.04 max(0, v - vc) - 0.2 pressure - 0.1 (1 - breath), 0, 1) (spec 3). a: an agent, an attribute
// record or c itself; v the ball's speed relative to him (m/s); pressure and breath 0 to 1
export function q(a, v, pressure = 0, breath = 1){
  let c, vc;
  // (a reading that is not a number counts as none: no speed, no pressure, a full breath, no control)
  if (typeof a === 'number'){ c = clamp(a === a ? a : 0, 0, 1); vc = TUNE.VC0.value + TUNE.VC1.value*c; }
  else { const r = ratings(a && a.at ? a.at : a, RT); c = r.c; vc = r.vc; }
  return clamp(TUNE.Q_C.value*c - TUNE.Q_V.value*Math.max(0, (+v || 0) - vc) - TUNE.Q_P.value*clamp(+pressure || 0, 0, 1)
    - TUNE.Q_B.value*(1 - clamp(breath == null || +breath !== +breath ? 1 : +breath, 0, 1)), 0, 1);
}
// how far ahead a touch of quality q leaves the ball: 0.6 + 0.8 (1 - q) metres
export const touchDist = qq => TUNE.TD_0.value + TUNE.TD_K.value*(1 - clamp(+qq || 0, 0, 1));

/* ---------- first to the ball ---------- */

// the kicker cannot play his own kick again this soon (its first metres pass him): a ball he struck, headed, threw,
// blocked or tackled under GHOST_T s ago is not his (his own dribble or control touch is)
export const GHOST_T = 0.3;
export function ghosted(ms, a){
  const L = ms.ball.last;
  return a.id === L.agent && ms.t - L.t < GHOST_T && L.kind !== 'dribble' && L.kind !== 'control';
}

// Can this body play the ball at all now (the race's candidates): on the pitch, a player, not leaving, not down, not
// staggered, not in the middle of a kick, tackle, header or throw, not a diving or holding keeper, not barred by a lost
// 50/50 or a tackle he is still getting up from (noTouch, recoverT).
export function canPlay(ms, a){
  if (!a.onPitch || a.role !== 'player' || a.leaving || a.sentOff) return false;
  if (a.state === 'ground' || a.m.stagger > 0.2 || ms.t < (a.noTouch || 0) || ms.t < (a.recoverT || 0)) return false;
  const k = a.act && a.act.kind;
  if (k && (k === 'kick' && !a.act.done || k === 'header' || k === 'tackle' || k === 'slide' || k === 'throw')) return false;
  if (a.isGK && a.gk && (a.gk.state === 'dive' || a.gk.state === 'hold')) return false;
  return true;
}
// The earliest simulation time canPlay's timed bars let him play the ball (the step whose ball check runs at that
// time), as things stand: a lost 50/50 (noTouch), a tackle he is getting up from (recoverT), his own touch a moment ago
// (ghosted: GHOST_T after it), a stagger (the mover takes h off it each step before the ball is looked at, and it bars
// him above 0.2). Infinity for a man on the ground. h: the step (1/60). Read by the view (P6-A) so a first touch is
// never posed before the simulation can take it.
export function playableFrom(ms, a, h){
  if (a.state === 'ground') return Infinity;
  let t = Math.max(ms.t, a.noTouch || 0, a.recoverT || 0);
  const L = ms.ball.last;
  if (a.id === L.agent && L.kind !== 'dribble' && L.kind !== 'control') t = Math.max(t, L.t + GHOST_T);
  const sg = a.m.stagger || 0;
  if (sg > 0.2) t = Math.max(t, ms.t + Math.ceil((sg - 0.2)/h - 1 - 1e-9)*h);
  return t;
}

// The arrival time of agent a on the ball's predicted path (ms.pred, ball.js ballPredict): when, from now, his mover
// (acceleration, top speed, turning: ball.js firstReach on mover.js timeToPointQ) can first have the ball inside his
// control radius (R without the facing: he turns to it as he runs; the ball's speed relative to him now), with no
// reaction time (he is already playing). 0 when it is inside his full R now; Infinity when he cannot within tMax
// seconds (default TUNE.RACE_HORIZON). The path cache may be a few steps old: its times are taken from now (the cache's
// age goes in as firstReach's reaction time, so a sample is his only when he can be there by it from where he is now,
// and the part of the path the ball has already run is nobody's).
const FA = {m: null, prm: null, fac: null, react: 0, reachY: 1.4, reach: 0.9};
const NO_ANGLE = Object.freeze({angle: false});   // (one option record: nothing allocated in a step)
export function arrivalOf(ms, a, tMax){
  const ball = ms.ball, r0 = R(a, ball, ms);
  if (r0 > 0 && GM.dist <= r0) return 0;
  // (his reach as he faces now, against where the ball is: a man running away from the ball, or with it behind him,
  // gets less of it than one who faces it; the lower bound below takes the full reach)
  const reach = r0 > 0 ? r0 : R(a, ball, ms, NO_ANGLE);
  const age = Math.max(0, ms.t - (ms.predT || 0)), T = tMax == null ? TUNE.RACE_HORIZON.value : tMax;
  const n = ms.predN || 0;
  if (n <= 0) return Infinity;
  FA.m = a.m; FA.prm = a.prm; FA.fac = a.fac; FA.react = age;
  FA.reachY = TUNE.FH_Y1.value*(a.scale || 1); FA.reach = Math.max(0.05, reach);
  const nMax = Math.min(n, Math.ceil((T + age)*30) + 2);
  const fr = firstReach(ms.pred, nMax, FA);
  if (!fr) return Infinity;
  const t = Math.max(0, fr.t - age);
  return t <= T ? t : Infinity;
}

// arrivals(ms, opt): every player who could play the ball and get to it within the race's horizon, sorted by arrival
// time ([{id, t, team}], earliest first; ties by id). With opt.window only those inside the duel window of the first
// are listed: then only the candidates whose lower bound (a straight run at his best acceleration to the nearest point
// of the path, brain.js reachLB's bound) could still be inside it are worked out exactly. The list is cached for the
// step (ms.zone; opt.fresh works it out again) and reused, so it costs nothing to ask twice.
export function arrivals(ms, opt){
  const Z = ms.zone || (ms.zone = {step: -1, list: [], pool: [], n: 0, win: false});
  const onlyWin = !!(opt && opt.window);
  if (Z.step === ms.step && Z.win === onlyWin && !(opt && opt.fresh)) return Z.list;
  Z.step = ms.step; Z.win = onlyWin; Z.list.length = 0;
  const b = ms.ball;
  if (!b || b.state !== 'free') return Z.list;
  const win = onlyWin ? TUNE.DUEL_WIN.value : Infinity;
  let best = Infinity, k = 0;
  // lower bounds first, nearest-first exact search (cheap: most candidates stop at the bound)
  const cand = Z.cand || (Z.cand = []);
  cand.length = 0;
  for (const a of ms.agents){
    if (a.team < 0 || !canPlay(ms, a) || ghosted(ms, a)) continue;
    cand.push(a);
    a.zLB = lowerBound(ms, a);
  }
  cand.sort((p, q2) => p.zLB - q2.zLB || p.id - q2.id);
  for (const a of cand){
    if (a.zLB > best + win + 1e-9 || a.zLB > TUNE.RACE_HORIZON.value) continue;
    const t = arrivalOf(ms, a, Math.min(TUNE.RACE_HORIZON.value, best + win + 0.05));
    if (onlyWin && t > best + win) continue;
    if (!(t < Infinity)) continue;
    if (t < best) best = t;
    const rec = Z.pool[k] || (Z.pool[k] = {id: 0, t: 0, team: 0});
    rec.id = a.id; rec.t = t; rec.team = a.team; k++;
    Z.list.push(rec);
  }
  Z.list.sort((p, q2) => p.t - q2.t || p.id - q2.id);
  if (onlyWin && Z.list.length){ const t0 = Z.list[0].t; let n = Z.list.length; while (n > 1 && Z.list[n - 1].t > t0 + TUNE.DUEL_WIN.value) n--; Z.list.length = n; }
  return Z.list;
}
// a lower bound of arrivalOf: the first path sample a straight run from his present speed at full acceleration could be
// within his radius of (no turn, no braking)
function lowerBound(ms, a){
  const P = ms.pred, n = ms.predN || 0, m = a.m, prm = a.prm, fac = a.fac;
  const reach = R(a, ms.ball, ms, NO_ANGLE);
  if (GM.dist <= reach) return 0;
  if (n <= 0) return Infinity;
  const age = Math.max(0, ms.t - (ms.predT || 0));
  const vTop = Math.max(0.1, sprintSpeed(prm, fac || FRESH));
  const v0 = Math.min(m.speed || 0, vTop), a0 = Math.max(0.1, (prm.a0 || 4)*(fac && fac.accel != null ? fac.accel : 1));
  const t1 = (vTop - v0)/a0, d1 = (v0 + vTop)*0.5*t1, yMax = TUNE.FH_Y1.value*(a.scale || 1);
  for (let k = 0; k < n; k++){
    const o = 4*k, t = P[o + 3] - age;
    if (!(P[o + 1] <= yMax)) continue;
    const ex = P[o] - m.x, ez = P[o + 2] - m.z, d = Math.max(0, Math.sqrt(ex*ex + ez*ez) - reach);
    const tm = d <= d1 ? (Math.sqrt(v0*v0 + 2*a0*d) - v0)/a0 : t1 + (d - d1)/vTop;
    if (t + 1/30 >= tm - 1e-9) return Math.max(0, k > 0 ? P[o - 1] - age : 0);
  }
  return Infinity;
}
