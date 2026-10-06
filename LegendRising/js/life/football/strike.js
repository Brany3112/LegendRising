// js/life/football/strike.js: from "I want the ball there" to a launch. The launch solver (yaw and elevation at a given
// speed and spin, Newton on the real ball integrator), the deviation model that makes skill, fatigue, pressure, the
// weak foot, the body shape and the ball's state matter, the shot planner that puts the two together, and the closed
// forms and tables the AI scores with (never the solver).
// Owner: WP-C (ball, strike and touch models). Contract DESIGN 1.4.11; numbers 1.5.1 and 1.5.3; behaviour 3.1.3.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Every random draw takes the
// generator passed in as r (rng.js).
//
//   const L = solveStrike({from, target, speed: 26, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1});
//   const plan = planShot(req, {kind: 'shot', dist, power01: 0.8, acc: 72, ...}, r);
//   ballKick(ball, plan.launch.v, plan.launch.w, {agent, team, kind: 'shot', aero, t, knuck: plan.launch.knuck});
//
// Conventions: yaw as DESIGN 1.1 (yaw 0 faces -Z, dirOf/yawOf from pitchspec.js). Right of a facing d is (-dz, dx).
// Backspin turns about the right-hand axis of travel and lifts; a positive vertical spin curls the ball to its left,
// so a right foot's inside curl (right to left, as the striker sees it) is w.y > 0.

import {BALL, createBall, ballFlyTo, rollTime, rollSpeedFor, createBallWorld, ballStep} from "./ball.js";
import {truncNormal} from "./rng.js";
import {dirOf, yawOf} from "./pitchspec.js";
import {sin, cos, exp, pow, atan2, asin, hypot} from "./detmath.js";

const DEG = Math.PI/180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const {R, G, KD, KM, VMAX} = BALL;

// 1.5.3 and 3.1.3 numbers in one place
export const STRIKE = Object.freeze({
  LOW_MAX: 6*DEG, LOW_TOP: 15,          // Low contact: elevation at most 6 degrees, topspin 15 rad/s
  HIGH_MIN: 14*DEG, HIGH_BACK: 20,      // High contact: elevation at least 14 degrees, backspin 20 rad/s
  ELEV_MIN: -30*DEG, ELEV_MAX: 70*DEG,  // the solver's elevation range (the low branch is taken)
  RANGE_EL: 40*DEG,                     // about the longest-range elevation under drag: where a short ball is sent
  CURL_BASE: 18, CURL_K: 0.25,          // finesse sidespin 18 + 0.25 curve rad/s
  TOL: 0.01, MISS_OK: 0.05, ITERS: 4,   // Newton: stop under 1 cm, a solution is ok within 5 cm, at most 4 updates
  T_MAX: 6,                             // seconds of flight the solver follows
  AIM_Y0: 0.11, AIM_Y1: 6.0,            // aim heights are clamped to this (3.1.3)
  KNUCK: {W: 4, V: 24, P: 0.72, A0: 1.2, A1: 2.6, F0: 5, F1: 9},   // 1.5.1 knuckle conditions and wobble
  KV: {low: 0.8, normal: 0.8, high: 1.2},                          // vertical sigma factor by contact
  BALL_STATE: {still: 1, rolling: 1.1, bouncing: 1.25, volley: 1.5}
});

const SHOT_KINDS = new Set(['shot', 'chip']);
const GROUND_KINDS = new Set(['pass', 'through', 'roll']);
const DRIVEN_KINDS = new Set(['shot', 'header']);

/* ---------- spin ---------- */

// the spin of a launch along the horizontal facing (dx, dz): topspin for Low, backspin for High, and the finesse
// sidespin |curl|*(18 + 0.25 curve) curling toward the striking foot's inside for curl > 0 (outside of the foot for
// curl < 0). out: {x, y, z} to fill.
export function launchSpin(dx, dz, contact, curl, foot, curve = 50, out = {x: 0, y: 0, z: 0}){
  const rx = -dz, rz = dx;                       // right of the facing
  const tb = contact > 0 ? STRIKE.HIGH_BACK : contact < 0 ? -STRIKE.LOW_TOP : 0;
  const c = clamp(+curl || 0, -1, 1);
  const side = Math.abs(c)*(STRIKE.CURL_BASE + STRIKE.CURL_K*clamp(+curve || 0, 0, 99));
  out.x = tb*rx; out.z = tb*rz;
  out.y = (foot === 'L' ? -1 : 1)*Math.sign(c)*side;
  return out;
}

/* ---------- the solver ---------- */

const SB = createBall();
const FO = {hit: false, x: 0, y: 0, z: 0, t: 0, apex: 0, vx: 0, vy: 0, vz: 0};
const WS = {x: 0, y: 0, z: 0};

// one flight for (yaw, elev): the miss in the target plane (lateral to the right, vertical up) or a short flight
const EV = {lat: 0, ver: 0, short: false, t: 0, apex: 0, x: 0, y: 0, z: 0};
function evalLaunch(sv, yaw, el){
  const d = dirOf(yaw), c = cos(el), sp = sv.speed;
  SB.p.x = sv.from.x; SB.p.y = Math.max(R, sv.from.y); SB.p.z = sv.from.z;
  SB.v.x = sp*c*d.x; SB.v.y = sp*sin(el); SB.v.z = sp*c*d.z;
  launchSpin(d.x, d.z, sv.contact, sv.curl, sv.foot, sv.curve, WS);
  SB.w.x = WS.x; SB.w.y = WS.y; SB.w.z = WS.z;
  SB.dragMul = sv.dragMul; SB.rollDecel = sv.rollDecel; SB.state = 'free'; SB.knuck = null;
  SB.grounded = SB.p.y <= R + 0.002 && SB.v.y <= 0.05;
  ballFlyTo(SB, null, sv.tx, sv.tz, sv.ax, sv.az, STRIKE.T_MAX, FO);
  EV.short = !FO.hit; EV.t = FO.t; EV.apex = FO.apex; EV.x = FO.x; EV.y = FO.y; EV.z = FO.z;
  EV.lat = (FO.x - sv.tx)*sv.rx + (FO.z - sv.tz)*sv.rz;
  EV.ver = FO.y - sv.ty;
  return EV;
}

// a first guess: the drag-aware flight time to the plane and the low elevation that clears the drop under the
// spin-adjusted gravity; the curl's bend aimed off to the other side
function guess(sv, D, dy){
  const sp = sv.speed, kSpin = sv.contact > 0 ? -KM*STRIKE.HIGH_BACK*sp : sv.contact < 0 ? KM*STRIKE.LOW_TOP*sp : 0;
  const g = Math.max(1, G + 0.8*kSpin);
  let el = atan2(dy, D), t = 0;
  for (let i = 0; i < 6; i++){
    t = (exp(KD*sv.dragMul*D) - 1)/(KD*sv.dragMul*sp*Math.max(0.2, cos(el)));
    el = atan2(dy + 0.5*g*t*t, D);
  }
  WS.y = 0;
  launchSpin(sv.ax, sv.az, 0, sv.curl, sv.foot, sv.curve, WS);
  const bend = 0.5*KM*Math.abs(WS.y)*sp*t*t*0.85;
  // w.y > 0 curls left: aim right (yaw decreases to the right)
  const yaw = sv.yawT - Math.sign(WS.y)*atan2(bend, D);
  return {yaw, el, t};
}

// Solve the launch (1.4.11, 3.1.3). req = {from, target, speed, contact: -1|0|1, curl: -1..1, foot: 'L'|'R', kind,
// rollDecel} plus optional curve (the curve skill for the finesse spin, default 50) and aero (the striker's aero
// skill, default 0). Unknowns are yaw and elevation at the requested speed and spin; the residual is the lateral and
// vertical miss in the vertical plane through the target across the aim; Newton with finite-difference Jacobians on
// the ball integrator (3 flights per update), at most 4 updates. Contact constrains the elevation (Low at most 6
// degrees, High at least 14, Normal the lower solution). A ground target from a ball on the ground with Low or Normal
// contact is a rolling ball (elevation 0). Returns {v, w, ok, tFlight, apex} plus yaw, elev, miss (metres) and iters.
// ok is false when the target is out of reach at that speed and contact: the launch returned is the closest one, and
// the ball then falls short or flies over by physics.
export function solveStrike(req){
  const from = req.from, tg = req.target;
  const contact = req.contact > 0 ? 1 : req.contact < 0 ? -1 : 0;
  const sv = {from, speed: clamp(+req.speed || 0, 0.1, VMAX), contact, curl: clamp(+req.curl || 0, -1, 1),
    foot: req.foot === 'L' ? 'L' : 'R', curve: req.curve != null ? +req.curve : 50,
    dragMul: 1 - 0.0045*clamp(+req.aero || 0, 0, 99), rollDecel: req.rollDecel != null ? +req.rollDecel : 1.1,
    tx: tg.x, ty: clamp(tg.y, R, 60), tz: tg.z, ax: 0, az: 0, rx: 0, rz: 0, yawT: 0};
  const dx = tg.x - from.x, dz = tg.z - from.z, D = hypot(dx, dz);
  if (D < 0.05){
    // straight at it
    const dy = sv.ty - from.y, L = hypot(dx, dy, dz) || 1;
    return result(sv, {x: sv.speed*dx/L, y: sv.speed*dy/L, z: sv.speed*dz/L}, yawOf(dx || 0, dz || -1), asin(clamp(dy/L, -1, 1)),
      true, 0, from.y, 0, 0);
  }
  sv.ax = dx/D; sv.az = dz/D; sv.rx = -sv.az; sv.rz = sv.ax; sv.yawT = yawOf(sv.ax, sv.az);
  const lo = contact < 0 ? STRIKE.ELEV_MIN : contact > 0 ? STRIKE.HIGH_MIN : STRIKE.ELEV_MIN;
  const hi = contact < 0 ? STRIKE.LOW_MAX : STRIKE.ELEV_MAX;

  // a rolling ball for a ground target
  if (sv.ty <= R + 0.05 && from.y <= R + 0.05 && contact <= 0){
    let yaw = sv.yawT, e = evalLaunch(sv, yaw, 0), it = 0;
    while (!e.short && Math.abs(e.lat) > STRIKE.TOL && it < STRIKE.ITERS){
      yaw -= e.lat/D; it++;                     // a rolling ball goes straight: d(lat)/d(yaw) = -D
      e = evalLaunch(sv, yaw, 0);
    }
    const miss = e.short ? Infinity : hypot(e.lat, e.ver);
    return result(sv, null, yaw, 0, !e.short && miss <= STRIKE.MISS_OK, e.short ? Infinity : e.t, e.apex, miss, it);
  }

  const g0 = guess(sv, D, sv.ty - Math.max(R, from.y));
  let yaw = g0.yaw, el = clamp(g0.el, lo, hi), it = 0;
  let e = evalLaunch(sv, yaw, el);
  let lat = e.lat, ver = e.ver, short = e.short, t = e.t, apex = e.apex;
  // the closest launch seen: a crossing scores its miss, a ball that dies first scores 1000 plus how far short it is
  const best = {score: Infinity, yaw, el, t, apex, miss: Infinity};
  const keep = () => {
    const sc = short ? 1000 + Math.max(0, (sv.tx - e.x)*sv.ax + (sv.tz - e.z)*sv.az) : hypot(lat, ver);
    if (sc < best.score){ best.score = sc; best.yaw = yaw; best.el = el; best.t = t; best.apex = apex; best.miss = short ? Infinity : sc; }
  };
  keep();
  const dp = 1e-3, de = 1e-3;
  while (it < STRIKE.ITERS){
    if (!short && hypot(lat, ver) <= STRIKE.TOL) break;
    it++;
    if (short){
      // the ball dies before the plane: more elevation, toward the longest range (about 40 degrees under drag)
      const top = Math.min(hi, STRIKE.RANGE_EL);
      if (el >= top - 1e-9) break;
      el = Math.min(top, el + Math.max(0.08, 0.5*(top - el)));
      e = evalLaunch(sv, yaw, el); lat = e.lat; ver = e.ver; short = e.short; t = e.t; apex = e.apex;
      keep();
      continue;
    }
    const e1 = evalLaunch(sv, yaw + dp, el), l1 = e1.lat, v1 = e1.ver, s1 = e1.short;
    const eStep = el + de <= hi ? de : -de;
    const e2 = evalLaunch(sv, yaw, el + eStep), l2 = e2.lat, v2 = e2.ver, s2 = e2.short;
    const j00 = s1 ? -D : (l1 - lat)/dp, j10 = s1 ? 0 : (v1 - ver)/dp;
    const j01 = s2 ? 0 : (l2 - lat)/eStep, j11 = s2 ? 1 : (v2 - ver)/eStep;
    const det = j00*j11 - j01*j10;
    let dYaw, dEl;
    if (Math.abs(det) > 1e-9){
      dYaw = -(j11*lat - j01*ver)/det;
      dEl = -(-j10*lat + j00*ver)/det;
    } else { dYaw = Math.abs(j00) > 1e-9 ? -lat/j00 : 0; dEl = Math.abs(j11) > 1e-9 ? -ver/j11 : 0; }
    dYaw = clamp(dYaw, -0.3, 0.3); dEl = clamp(dEl, -0.3, 0.3);
    let elN = el + dEl;
    if (elN < lo || elN > hi){
      // the contact's bound holds the elevation: aim the yaw alone at the bound
      elN = clamp(elN, lo, hi);
      dYaw = Math.abs(j00) > 1e-9 ? clamp(-(lat + j01*(elN - el))/j00, -0.3, 0.3) : 0;
    }
    yaw += dYaw; el = elN;
    e = evalLaunch(sv, yaw, el); lat = e.lat; ver = e.ver; short = e.short; t = e.t; apex = e.apex;
    keep();
  }
  return result(sv, null, best.yaw, best.el, best.miss <= STRIKE.MISS_OK, Number.isFinite(best.miss) ? best.t : Infinity,
    best.apex, best.miss, it);
}

function result(sv, vDirect, yaw, el, ok, tFlight, apex, miss, iters){
  const d = dirOf(yaw), c = cos(el);
  const v = vDirect || {x: sv.speed*c*d.x, y: sv.speed*sin(el), z: sv.speed*c*d.z};
  const w = launchSpin(d.x, d.z, sv.contact, sv.curl, sv.foot, sv.curve, {x: 0, y: 0, z: 0});
  return {v, w, ok: !!ok, tFlight, apex, yaw, elev: el, miss, iters};
}

/* ---------- deviation (1.5.3) ---------- */

// The spread of a strike (1.5.3) and one sample of it. ctx = {kind, dist, power01, acc, contact, weakFoot, bodyAngleDeg,
// plantErr, ballState: 'still'|'rolling'|'bouncing'|'volley', pressure01, composure, bF, eF, finesse, firstTime, vIn}
// plus optional power (the power skill, for the speed spread; default 50), scuff (a mistimed contact: sigma x2) and
// weightSigma (a pass's speed spread; default 2%). weakFoot: true for the weak foot, 'both' for a two-footed player.
// Shots: s = (0.007 + 0.053(1 - acc/100)^1.2)(0.6 + 0.8 p^2) x over-hit x fatigue x pressure x foot x body x ball state
// x first time x finesse, radians. Passes: (0.006 + 0.05(1 - acc/100)^1.4) x pressure x foot x body x fatigue, x1.3
// first time. Headers: (1 - acc/110) x 6 degrees. Offsets in the target plane: ex = D s z1 laterally (right positive),
// ey = D s kv z2 (kv 0.8 Low and Normal, 1.2 High), with z truncated normal at 2.5; es = 1 + sigma_v z3 the speed factor
// (shots 4%(1 - power/150)). Returns {ex, ey, es} plus s (radians) and sv (the speed spread).
export function deviation(ctx, r){
  const s = sigmaOf(ctx), D = Math.max(0, +ctx.dist || 0), kind = ctx.kind || 'shot';
  const kv = ctx.contact > 0 ? STRIKE.KV.high : STRIKE.KV.normal;
  const sv = SHOT_KINDS.has(kind) ? 0.04*(1 - clamp(ctx.power != null ? +ctx.power : 50, 0, 150)/150)
    : ctx.weightSigma != null ? +ctx.weightSigma : 0.02;
  const ex = D*s*truncNormal(r, 1, 2.5);
  const ey = D*s*kv*truncNormal(r, 1, 2.5);
  const es = 1 + sv*truncNormal(r, 1, 2.5);
  return {ex, ey, es, s, sv};
}

// the angular sigma (radians) of 1.5.3 for a context; no randomness
export function sigmaOf(ctx){
  const kind = ctx.kind || 'shot', acc = clamp(ctx.acc != null ? +ctx.acc : 50, 0, 100);
  const bF = ctx.bF != null ? clamp(+ctx.bF, 0, 1) : 1, eF = ctx.eF != null ? clamp(+ctx.eF, 0, 1) : 1;
  const fatigue = 1 + 0.25*(1 - bF) + 0.35*(1 - eF);
  const pressure = 1 + 0.4*clamp(+ctx.pressure01 || 0, 0, 1)*(1 - clamp(ctx.composure != null ? +ctx.composure : 50, 0, 150)/150);
  const foot = ctx.weakFoot === 'both' || ctx.weakFoot === 'Both' ? 1.1 : ctx.weakFoot ? 1.35 : 1;
  const body = 1 + 1.5*Math.abs(+ctx.plantErr || 0)/0.3 + Math.max(0, (+ctx.bodyAngleDeg || 0) - 45)/45*0.6;
  const vIn = ctx.vIn == null ? 0 : typeof ctx.vIn === 'number' ? Math.abs(ctx.vIn) : hypot(ctx.vIn.x || 0, ctx.vIn.y || 0, ctx.vIn.z || 0);
  const scuff = ctx.scuff ? 2 : 1;
  if (kind === 'header') return (1 - clamp(acc, 0, 110)/110)*6*DEG*fatigue*pressure*scuff;
  if (SHOT_KINDS.has(kind)){
    const p = clamp(ctx.power01 != null ? +ctx.power01 : 0.8, 0, 1);
    const over = p > 0.92 ? 1 + 3*(p - 0.92) : 1;
    const ball = STRIKE.BALL_STATE[ctx.ballState] || 1;
    const first = ctx.firstTime ? 1 + vIn/30 : 1;
    const fin = ctx.finesse ? 0.85 : 1;
    return (0.007 + 0.053*pow(1 - acc/100, 1.2))*(0.6 + 0.8*p*p)*over*fatigue*pressure*foot*body*ball*first*fin*scuff;
  }
  return (0.006 + 0.05*pow(1 - acc/100, 1.4))*pressure*foot*body*fatigue*(ctx.firstTime ? 1.3 : 1)*scuff;
}

// A strike with its deviation (1.4.11): the sample of deviation() moves the aim point in the target plane (a ground
// pass keeps its height and shows its error in direction and weight), the moved point is solved again at the sampled
// speed, and a knuckle is armed when 1.5.1's conditions hold (|w| < 4 rad/s, over 24 m/s, Normal contact, no finesse,
// power over 0.72). Returns {launch, aimed, sigma (radians), quality} plus sigmaM (metres at the target) and dev.
// quality is 1 for a ball that goes exactly where it was meant to and 0 for a miss of 6% of the distance (or 25 cm).
export function planShot(req, ctx, r){
  const from = req.from, tg = req.target;
  const D = ctx.dist != null ? +ctx.dist : hypot(tg.x - from.x, tg.z - from.z);
  const c = Object.assign({}, ctx, {dist: D, kind: ctx.kind || req.kind, contact: ctx.contact != null ? ctx.contact : req.contact});
  const dev = deviation(c, r);
  let ax = tg.x - from.x, az = tg.z - from.z;
  const al = hypot(ax, az) || 1; ax /= al; az /= al;
  const ground = tg.y <= R + 0.05 && GROUND_KINDS.has(c.kind || 'pass') && !(c.contact > 0);
  const aimed = {x: tg.x + dev.ex*(-az), y: ground ? tg.y : clamp(tg.y + dev.ey, STRIKE.AIM_Y0, STRIKE.AIM_Y1), z: tg.z + dev.ex*ax};
  const launch = solveStrike(Object.assign({}, req, {target: aimed, speed: req.speed*dev.es}));
  const wl = hypot(launch.w.x, launch.w.y, launch.w.z), sp = hypot(launch.v.x, launch.v.y, launch.v.z);
  const K = STRIKE.KNUCK, p = clamp(c.power01 != null ? +c.power01 : 0, 0, 1);
  launch.knuck = null;
  if (wl < K.W && sp > K.V && !(req.contact) && !c.finesse && p > K.P && SHOT_KINDS.has(c.kind)){
    launch.knuck = {amp: (K.A0 + (K.A1 - K.A0)*r())*p, freq: K.F0 + (K.F1 - K.F0)*r(), phase: 2*Math.PI*r()};
  }
  const off = hypot(dev.ex, ground ? 0 : aimed.y - tg.y);
  const quality = clamp(1 - off/Math.max(0.25, 0.06*D), 0, 1);
  return {launch, aimed, sigma: dev.s, sigmaM: dev.s*D, quality, dev};
}

/* ---------- AI scoring: closed forms and tables (never the solver) ---------- */

// the start speed of a ground pass that arrives d metres away at `arrive` m/s
export function idealPassSpeed(d, arrive = 9, rollDecel = 1.1){
  return rollSpeedFor(d, arrive, rollDecel);
}

// lofted flights tabulated over 16 speeds x 12 elevations (3.1.3): landing distance and time for a High-contact ball
// (backspin 20 rad/s) from the ground, and for a throw (no spin) from 2.0 m. Built on first use.
const TAB = {v0: 6, dv: 2, nv: 16, e0: 5*DEG, de: 5*DEG, ne: 12, loft: null, throw: null};
function buildTable(fromY, spin){
  const n = TAB.nv*TAB.ne, rng = new Float32Array(n), tim = new Float32Array(n);
  const b = createBall();
  let land = null;
  const w = createBallWorld({onEvent: (type, d) => { if (type === 'bounce' && !land) land = d; }});
  for (let i = 0; i < TAB.nv; i++) for (let j = 0; j < TAB.ne; j++){
    const v = TAB.v0 + TAB.dv*i, el = TAB.e0 + TAB.de*j;
    b.p.x = 0; b.p.y = fromY; b.p.z = 0;
    b.v.x = v*cos(el); b.v.y = v*sin(el); b.v.z = 0;
    b.w.x = 0; b.w.y = 0; b.w.z = spin;            // backspin for travel along +X is +Z
    b.dragMul = 1; b.knuck = null; b.state = 'free'; b.grounded = false; b.rollDecel = 1.1;
    land = null; w.t = 0;
    for (let k = 0; k < 900 && !land; k++) ballStep(b, w, 1/60);
    rng[i*TAB.ne + j] = land ? land.x : Infinity; tim[i*TAB.ne + j] = land ? land.t : Infinity;
  }
  return {rng, tim};
}
function loftTime(tab, d, v0){
  const fi = clamp((v0 - TAB.v0)/TAB.dv, 0, TAB.nv - 1), i0 = Math.floor(fi), i1 = Math.min(TAB.nv - 1, i0 + 1), f = fi - i0;
  const a = rowTime(tab, i0, d), b = f > 0 ? rowTime(tab, i1, d) : a;
  if (f <= 0) return a;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return f < 0.5 ? (Number.isFinite(a) ? a : Infinity) : (Number.isFinite(b) ? b : Infinity);
  return a + (b - a)*f;
}
// the landing time of the lowest elevation in a speed row whose ball lands d metres away (Infinity: out of range)
function rowTime(tab, i, d){
  const o = i*TAB.ne;
  if (d <= tab.rng[o]) return tab.tim[o]*d/tab.rng[o];
  for (let j = 1; j < TAB.ne; j++){
    const r0 = tab.rng[o + j - 1], r1 = tab.rng[o + j];
    if (r1 < r0) break;                          // past the longest range: the high branch is not used
    if (d <= r1){ const f = (d - r0)/(r1 - r0); return tab.tim[o + j - 1] + f*(tab.tim[o + j] - tab.tim[o + j - 1]); }
  }
  return Infinity;
}

// Seconds a ball of a kind takes to cover d metres from v0 (1.4.11): ground kinds roll (closed form with drag),
// shots and headers fly straight under drag, lofted kinds (cross, lob, chip, clear, goal kick, punt, throw) land at d
// on the lowest elevation that reaches (tables). Infinity when it cannot get there.
export function flightTime(kind, d, v0, rollDecel = 1.1){
  d = Math.max(0, +d || 0); v0 = Math.max(0, +v0 || 0);
  if (d === 0) return 0;
  if (!(v0 > 0)) return Infinity;
  if (GROUND_KINDS.has(kind)) return rollTime(v0, d, rollDecel);
  if (DRIVEN_KINDS.has(kind)) return (exp(KD*d) - 1)/(KD*v0);
  if (kind === 'throw'){
    if (!TAB.throw) TAB.throw = buildTable(2.0, 0);
    return loftTime(TAB.throw, d, v0);
  }
  if (!TAB.loft) TAB.loft = buildTable(R, STRIKE.HIGH_BACK);
  return loftTime(TAB.loft, d, v0);
}

// the shot speed of 1.5.3: (18 + 0.17 power)*p, x1.04 with strike boots, times the stamina power factor
export function shotSpeed(power, p, strikeBoots = false, facPower = 1){
  return (18 + 0.17*clamp(+power || 0, 0, 99))*clamp(+p || 0, 0, 1)*(strikeBoots ? 1.04 : 1)*(facPower == null ? 1 : facPower);
}

