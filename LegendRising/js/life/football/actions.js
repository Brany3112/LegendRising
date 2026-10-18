// js/life/football/actions.js: everything a body does to the ball, for any agent. The player's controls (control.js)
// and the AI (brain.js, gkbrain.js) both produce the same Action records; this module carries them out: strikes with
// their contact scheduled inside the reach window (a stride adjust when the ball is not there yet, a scuff when it never
// comes, never a silent cancel), the first touch, dribble touches on the footfalls of the gait clock, standing tackles,
// pokes and slides decided by what the sweeping foot meets first, headers off a real jump, throw-ins, blocks, and the
// steering that turns a target into the mover's intent. Each touch is a real kick of the one ball (ball.js) and an
// entry in the log (events.js).
// Owner: WP-E, then WP-F2 (addendum A1.7: the player's strike on his plant, its rhythm and its body shape logged with
// the kick), then P2b-A (TRAINING-SPEC section 3: who plays the ball is decided by the race to it and the 50/50 duel,
// control lapses when the ball leaves the controller's radius, the first touch is the spec's q, the shield, the slide
// carried on its own momentum, tackles on a loose ball). Contract DESIGN 1.4.14 (Action, actionStep, canStrike) and
// BUILD-PLAN Phase 2b; numbers 1.5.3 and tune.js; behaviour 3.1.7.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {ballKick, ballPredict, ballRelease, ballHold, BALL} from "./ball.js";
import {planShot, solveStrike, idealPassSpeed, shotSpeed, presolve, presolveStep, presolveWarm, aimOf, devDraws} from "./strike.js";
import {reachEnvelope, firstTouch, dribbleTouch, dribbleCadence, tackleOutcome, slideProfile, slideDistance, headerContact,
  classifyContact, TOUCH, TACKLE} from "./touch.js";
import {truncNormal} from "./rng.js";
import {stamAction, stamShield} from "../stamina.js";
import {TUNE} from "./tune.js";
import {ratings, canPlay, arrivalOf, breathOf, ghosted, GHOST_T} from "./zone.js";
import {p5050, fatigueFactor, slideStep, recovery, standReach, shieldAngle} from "./duel.js";
import {logEv, chainKick, chainControl, chainKeep, chainTouch} from "./events.js";
import {onKick, onTouch, setCtl, clearCtl, foul, restartTaken} from "./rules.js";
import {xgAt, decisionRecord} from "./judge.js";
import {jumpHeight, raiseHand} from "./agent.js";
import {jumpRoot} from "./gkplan.js";
import {sprintSpeed} from "../mover.js";
import {dirOf, yawOf, wrapA, inBox} from "./pitchspec.js";
import {sin, cos, hypot, atan2, acos} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180, R = BALL.R, G = 9.81;

// 1.5.3 and 3.1.7 numbers
export const ACT = Object.freeze({
  SAFETY: [30, 6.5, 11, 1.0, 3, 11, 8],   // a clearing header for safety: within 30 m of his goal line, an attacker within
                                  // 6.5 m or the ball faster than 11 m/s, taken every time: aimed 3 m beyond his goal
                                  // line, 11 to 19 m off the middle on the ball's side (TR-2b refit, was 22 m, 4.5 m,
                                  // 13 m/s, 90%: with the possession rework fewer balls went behind and the corners per
                                  // match fell under the 2.3 WP-E band)
  REACH0: 0.45, REACH1: 0.90, REACH_LAT: 0.5,   // the ball's place for a strike: 0.45 to 0.90 m ahead, within 0.5 m across
  TC_MAX: 0.18, ADJUST: 0.35, SCUFF_D: 1.3,     // contact within 0.18 s; a stride adjust of at most 0.35 s; a scuff up to 1.3 m
  FOLLOW: 0.28,                                 // follow-through after contact
  GHOST: GHOST_T,                               // the kicker cannot play his own kick again this soon (zone.js)
  LOSE_CTL: 2.4,                                // (the old fixed lapse distance; now TUNE.CTL_FAR, with the race: touchCheck)
  HEADER_LOAD: 0.18, HEADER_RECOVER: 0.25,
  THROW_DUR: 1.0, THROW_REL: 0.62, THROW_Y: 2.0,
  BLOCK_GLANCE: 0.7, BLOCK_BACK: [0.25, 0.45],     // most blocks glance on (turned), the rest come back off the shin at this share
  BLOCK_KEEP: [0.5, 0.85],                     // a leg block keeps this share of the ball's speed
  BLOCK_TURN: [45, 70], BLOCK_LOOP: 4,         // degrees a glance and a square block turn it, at most; a glance loops up to 4 m/s
  SETTLE: [0.12, 0.25, 0.45],                  // the first decision after a reception: pressed, a heavy touch, settled on it
                                               // (P2b-A: 0.45 s, was 1.0, now the ball can be taken off a man who waits on it)
  AERIAL_FOUL: [1.1, 0.15, 0.25, 0.25],        // an aerial duel with the bodies within 1.1 m: a foul by the loser 15% of the time,
                                               // severity 0.25 to 0.5
  RHYTHM: [0.12, 0.06],                        // A1.7: a strike released out of the stride's rhythm (rhythm 1) adds this much plant
                                               // error, a shot and a pass (the player's controls set action.rhythm)
  CLEAN_PLANT: 0.03                            // UF2-A (U18): a clean release (the meter's sweet spot) leaves at most this much plant
                                               // error
});

/* ---------- the shared ball path cache (1.5.6) ---------- */

// refresh ms.pred: 90 samples at 30 Hz of the live ball (ball.js ballPredict, no bodies)
export function refreshPred(ms){
  ms.predN = ballPredict(ms.ball, ms.bw, ms.pred, 90, 30);
  ms.predAt = ms.step; ms.predT = ms.t;
  ms.predSeq = (ms.predSeq || 0) + 1;
  return ms.predN;
}
// the predicted ball at time t from now (interpolated), out {x, y, z}
export function predAt(ms, t, out){
  const P = ms.pred, n = ms.predN, dt0 = ms.t - ms.predT;
  const tt = t + dt0, k = clamp(tt*30, 0, n - 1.001), i = Math.floor(k), f = k - i, o = 4*i;
  if (n <= 0){ out.x = ms.ball.p.x; out.y = ms.ball.p.y; out.z = ms.ball.p.z; return out; }
  if (i >= n - 1){ out.x = P[4*(n - 1)]; out.y = P[4*(n - 1) + 1]; out.z = P[4*(n - 1) + 2]; return out; }
  out.x = P[o] + (P[o + 4] - P[o])*f; out.y = P[o + 1] + (P[o + 5] - P[o + 1])*f; out.z = P[o + 2] + (P[o + 6] - P[o + 2])*f;
  return out;
}

/* ---------- steering ---------- */

// Turn a target into the mover's intent: run (at a gait) toward (tx, tz), slowing so that the brakes stop him at it
// (within `stop` metres he stands), facing `face` ({x, z} direction) when given. cap: a speed cap. Returns the distance.
// An AI body paces itself: with its breath spent (under PACE[0]) it runs where it was asked to sprint, until it has
// PACE[1] of it back. A sprint held on empty lungs keeps draining (addendum A1.6, stamina.js effortOf) and is slower
// than a run, so a man who never let up would cross the pitch at a blown sprint and never get his breath back.
export const PACE = Object.freeze([8, 25]);
export function steer(a, tx, tz, gait = 'jog', stop = 0.3, face = null, cap = Infinity, strafe = false){
  const m = a.m, I = a.intent, dx = tx - m.x, dz = tz - m.z, d = hypot(dx, dz);
  if (gait === 'sprint' && a.st){
    if (a.st.B < PACE[0]) a.blown = true; else if (a.st.B >= PACE[1]) a.blown = false;
    if (a.blown) gait = 'run';
  }
  I.face = face; I.strafe = strafe; I.gait = gait;
  if (d <= stop){ I.dx = 0; I.dz = 0; I.speedCap = cap; return d; }
  I.dx = dx/d; I.dz = dz/d;
  I.speedCap = Math.min(cap, Math.sqrt(2*6.5*Math.max(0, d - stop*0.5)) + 0.15);
  return d;
}
export function standStill(a, face = null){ const I = a.intent; I.dx = 0; I.dz = 0; I.face = face; I.speedCap = Infinity; I.strafe = false; }
// the facing toward a point, as an intent face
export function faceTo(a, x, z, out = {x: 0, z: 0}){
  const dx = x - a.m.x, dz = z - a.m.z, d = hypot(dx, dz) || 1;
  out.x = dx/d; out.z = dz/d;
  return out;
}

/* ---------- strikes (3.1.7) ---------- */

// the foot a ball on this side is struck with: the strong foot unless it is over 0.25 m to the weak side
function footFor(a, lat){
  const pf = a.foot || 'R';
  if (pf === 'B') return lat >= 0 ? 'R' : 'L';
  if (pf === 'R' && lat < -TOUCH.WEAK_SIDE) return 'L';
  if (pf === 'L' && lat > TOUCH.WEAK_SIDE) return 'R';
  return pf;
}
// where the ball is relative to the body: ahead along the facing, across (+ to his right), and the distance
const RB = {ahead: 0, lat: 0, dist: 0};
function relBall(a, b, out = RB){
  const m = a.m, f = dirOf(m.yaw), dx = b.p.x - m.x, dz = b.p.z - m.z;
  out.ahead = dx*f.x + dz*f.z; out.lat = dx*(-f.z) + dz*f.x; out.dist = hypot(dx, dz);
  return out;
}

// The reach window for release-to-contact (1.4.14, 1.5.3): the ball 0.45 to 0.90 m ahead on the kicking side and within
// 0.5 m across, low: contact on the next swing, at most 0.18 s later. Returns {ok, side, tc} plus foot and the geometry.
// A strike in the air (A1.5, the resolver's style: a volley, a side volley, a scissor or an overhead kick) widens the
// window: the ball up to VOLLEY.H (VOLLEY.HI for the acrobatic ones) and, struck side-on, further across and less ahead.
export const VOLLEY = Object.freeze({STYLES: new Set(['volley', 'sidevolley', 'scissor', 'bicycle']), H: 1.25, HI: 1.7, LAT: 1.05, AHEAD0: -0.15,
  WAIT: 1.2, WHIFF_H: 1.0});
// out: a record to fill in place (the engine's per-step checks pass one, so nothing is allocated); a new one by default
const RBS = {ahead: 0, lat: 0, dist: 0};
export function canStrike(a, ball, style, out){
  const r = relBall(a, ball, RBS);
  const foot = footFor(a, r.lat), side = foot === 'R' ? 1 : -1;
  const s = a.scale || 1;
  const air = !!style && VOLLEY.STYLES.has(style), wide = air && style !== 'volley';
  const low = ball.p.y - (a.y || 0) < (air ? (style === 'scissor' || style === 'bicycle' ? VOLLEY.HI : VOLLEY.H) : 0.6)*s;
  const ok = low && r.ahead >= (wide ? VOLLEY.AHEAD0 : ACT.REACH0*0.6) && r.ahead <= ACT.REACH1*s*(air ? 1.2 : 1) && Math.abs(r.lat) <= (wide ? VOLLEY.LAT : ACT.REACH_LAT);
  // the next swing: sooner when the ball is well placed, a little later at the edge of the window
  const tc = ok ? clamp(0.11 + 0.07*Math.abs(r.ahead - 0.65)/0.25, 0.10, ACT.TC_MAX) : ACT.TC_MAX;
  const o = out || {ok: false, side: 0, tc: 0, foot: 'R', ahead: 0, lat: 0, dist: 0};
  o.ok = ok; o.side = side; o.tc = tc; o.foot = foot; o.ahead = r.ahead; o.lat = r.lat; o.dist = r.dist;
  return o;
}

// Begin a kick (shot, pass, through ball, cross, lob, clear, goal kick, punt). action = {kind, target: {x, y, z}, recv,
// power (0..1 for shots, the speed in m/s for passes when speed is given), speed, contact, finesse, firstTime}.
// Contact comes at the scheduled step: within 0.18 s with the ball in reach, else after a stride adjust of up to
// 0.35 s, then a scuff if it is still not there.
/* (P9-A, MV-14) the root's speed through a strike as a share of the approach speed: the same curve as moves.js
   strikeRoot (3.5.7: 0.55 at contact, 0.40 at +0.25 s, then back to 1 by +0.6 s), kept here because the simulation is
   pure (moves.js draws). Never under STRIKE_ROOT.MIN m/s, so a strike from a stand still shifts its weight */
export const STRIKE_ROOT = Object.freeze({MIN: 0.3});
const sstep01 = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
export function strikeRoot(t, contact){
  if (t < contact) return 1 + (0.55 - 1)*sstep01(contact - 0.18, contact, t);
  if (t < contact + 0.25) return 0.55 + (0.40 - 0.55)*(t - contact)/0.25;
  return 0.40 + (1 - 0.40)*sstep01(contact + 0.25, contact + 0.6, t);
}
export function startKick(ms, a, action){
  const cs = canStrike(a, ms.ball, action.style);
  // a dead ball (a set piece) is walked up to: the run-up has no 0.35 s limit, only a generous one; a ball in the air
  // met on the volley (A1.5) is waited for until it arrives (the resolver's time to the meeting point, at most 1.2 s)
  const dead = ms.ball.state === 'dead' || ms.restart && ms.restart.taker === a.id;
  const air = !!action.style && VOLLEY.STYLES.has(action.style);
  const wait = air ? clamp((+action.tc || 0) + 0.2, ACT.ADJUST, VOLLEY.WAIT) : ACT.ADJUST;
  // (the player's strike lands on his support foot's plant when that comes inside the window: action.tcWant, A1.7)
  const tc0 = cs.ok && action.tcWant != null && !air ? clamp(+action.tcWant, 0.10, ACT.TC_MAX) : cs.tc;
  a.act = {kind: 'kick', action, t: 0, tc: cs.ok ? tc0 : ACT.ADJUST + ACT.TC_MAX, adjust: !cs.ok, dur: (cs.ok ? tc0 : ACT.ADJUST) + ACT.FOLLOW,
    foot: cs.foot, side: cs.side, done: false, plan: null, startStep: ms.step, contactStep: -1, adjustMax: dead ? 3.0 : wait, pre: null, devZ: null, air};
  a.state = 'strike'; a.stateT = 0;
  if (a.drib) a.drib = null;
  return a.act;
}

// the speed of a ground pass for an arrival speed (auto weight: 9 m/s, clamped 8 to 10)
export function passSpeedFor(d, arrive = 9, roll = 1.1){ return idealPassSpeed(Math.max(1, d), clamp(arrive, 6, 10), roll); }

// a lofted ball's speed for a distance: enough that a launch of about 25 to 35 degrees with backspin carries it
export function loftSpeedFor(d){ return clamp(Math.sqrt(12.5*Math.max(4, d))*(1 + 0.005*d), 9, 30); }

const BS = {x: 0, y: 0, z: 0};
// What a kick asks the strike solver for with the ball at bp ({x, y, z}): the target (moved by a scuff), the speed and
// the spin. The strike at contact uses it, and so does its presolve through the swing (bp then where the ball will be
// at contact). Returns {req, tx, ty, tz, dist, isShot, ctxKind, acc, contact}.
function kickRequest(ms, a, act, scuff, bp, foot){
  const b = ms.ball, rq = act.action, at = a.at, fac = a.fac || {};
  const tgt = rq.target || {x: a.m.x + dirOf(a.m.yaw).x*20, y: R, z: a.m.z + dirOf(a.m.yaw).z*20};
  let tx = tgt.x, ty = tgt.y != null ? tgt.y : R, tz = tgt.z;
  const kind = rq.kind;
  const isShot = kind === 'shot';
  // the scuff (1.5.3): aim lerped 25% toward the goal centre or the receiver's feet
  if (scuff){
    if (isShot){ const gx = ms.dirs[a.team]*ms.spec.hx; tx += (gx - tx)*0.25; tz += (0 - tz)*0.25; ty += (1.0 - ty)*0.25; }
    else if (rq.recv >= 0 && ms.agents[rq.recv]){ const q = ms.agents[rq.recv].m; tx += (q.x - tx)*0.25; tz += (q.z - tz)*0.25; }
  }
  const dist = hypot(tx - bp.x, tz - bp.z);
  const contact = rq.contact != null ? rq.contact : 0;
  let speed, ctxKind, acc;
  if (isShot){
    const p = clamp(rq.power != null ? rq.power : 0.85, 0.05, 1);
    speed = shotSpeed(at.power, p, !!at.strikeBoots, fac.power != null ? fac.power : 1)*(rq.finesse ? 0.92 : 1);
    if (rq.finesse) speed = Math.min(speed, shotSpeed(at.power, 0.85, !!at.strikeBoots, fac.power != null ? fac.power : 1));
    ctxKind = contact > 0 && rq.chip ? 'chip' : 'shot'; acc = at.accuracy;
  } else {
    speed = rq.speed != null ? rq.speed : kind === 'pass' || kind === 'through' || kind === 'roll' ? passSpeedFor(dist, 9, b.rollDecel) : loftSpeedFor(dist);
    speed *= fac.power != null ? 0.95 + 0.05*fac.power : 1;
    ctxKind = kind === 'clear' || kind === 'goalkick' || kind === 'punt' ? 'clear' : kind; acc = at.passAcc;
  }
  if (scuff) speed *= 0.55;
  // (rq.bend, the player's sweep through the release, A1.7: the way the ball is to bend, + to its right; the curl that
  // does it depends on the foot that strikes it, the inside of one is the outside of the other)
  const curl = rq.bend != null ? (foot === 'L' ? 1 : -1)*clamp(+rq.bend, -1, 1) : rq.finesse ? (rq.curl != null ? rq.curl : 1) : (rq.curl || 0);
  const req = {from: {x: bp.x, y: bp.y, z: bp.z}, target: {x: tx, y: ty, z: tz}, speed, contact, curl,
    foot, kind: ctxKind === 'chip' ? 'chip' : ctxKind, rollDecel: b.rollDecel, curve: at.curve, aero: at.aero};
  return {req, tx, ty, tz, dist, isShot, ctxKind, acc, contact};
}
// The strike's context for its deviation (1.5.3) with the ball at bp, the ball `ahead` m in front of the body
function kickCtx(ms, a, act, K, bp, ahead, weak, scuff){
  const b = ms.ball, rq = act.action, at = a.at, fac = a.fac || {};
  const kdir = yawOf(K.tx - bp.x, K.tz - bp.z);
  const bodyAngleDeg = Math.abs(wrapA(kdir - a.m.yaw))/DEG;
  // (a volley's timing from the ring, A1.5: 0 on the moment, 1 at the ring's edge or beyond, widens it as a bad plant)
  // (UF2-A, U18: the player's release in the meter's sweet spot is a clean strike, rq.clean: his plant is forgiven, at
  // most CLEAN_PLANT of it left; a scuff is still a scuff. Only the player's controls ever ask for it)
  const plant0 = clamp(Math.abs(ahead - 0.65) - 0.15, 0, 0.4) + (scuff ? 0.2 : 0) + 0.3*clamp(+rq.timing || 0, 0, 1) +
    ACT.RHYTHM[K.isShot ? 0 : 1]*clamp(+rq.rhythm || 0, 0, 1);
  const plantErr = rq.clean && !scuff ? Math.min(plant0, ACT.CLEAN_PLANT) : plant0;
  const sp = hypot(b.v.x, b.v.y, b.v.z);
  const air = b.p.y > R + 0.05;
  const ballState = !air ? (sp < 0.4 ? 'still' : 'rolling') : (b.v.y < 0 && b.p.y > 0.35 ? 'volley' : 'bouncing');
  const first = !(ms.poss.ctl === a.id) || !!rq.firstTime;
  const pr = pressureOn(ms, a);
  return {kind: K.ctxKind, dist: K.dist, power01: K.isShot ? clamp(rq.power != null ? rq.power : 0.85, 0, 1) : 0.6, acc: K.acc, contact: K.contact, weakFoot: weak,
    bodyAngleDeg, plantErr, ballState, pressure01: pr, composure: at.composure, bF: fac.bF != null ? fac.bF : 1, eF: fac.eF != null ? fac.eF : 1,
    finesse: !!rq.finesse, firstTime: first && sp > 1, vIn: first ? sp : 0, power: at.power, scuff: !!scuff,
    weightSigma: K.isShot ? undefined : rq.weightSigma != null ? rq.weightSigma : rq.charged ? (rq.sweet ? 0.02 : 0.0) : (1 - at.passing/120)*0.12};
}
// The kick's presolve (2.3 WP-E step cost): as the swing starts the deviation's three draws are made (devDraws) and the
// solve starts for the point they aim at, with the ball where it will be at contact; it runs a flight a step through
// the swing, and the strike at contact (the same draws, the context as it is then) starts from it (solveStrike warm),
// so it needs a flight or two where a cold solve can need thirteen. Only for the strikes the solver works out by
// Newton (shots and lofted balls; a ground pass is one or two flights anyway).
const PRE_B = {x: 0, y: 0, z: 0};
function kickPresolve(ms, a, act){
  if (act.pre === false) return;
  if (!act.pre){
    const b = ms.ball;
    if (b.state === 'dead' || b.state === 'held' || hypot(b.v.x, b.v.y, b.v.z) < 0.05){ PRE_B.x = b.p.x; PRE_B.y = b.p.y; PRE_B.z = b.p.z; }
    else predAt(ms, act.adjust ? ACT.TC_MAX : Math.max(0, act.tc - act.t), PRE_B);
    const foot = act.foot || 'R', weak = a.foot === 'B' ? 'both' : foot !== (a.foot || 'R');
    const K = kickRequest(ms, a, act, false, PRE_B, foot);
    if (K.ty <= R + 0.05 && PRE_B.y <= R + 0.05 && K.contact <= 0){ act.pre = false; return; }
    act.devZ = devDraws(ms.r);
    const ctx = kickCtx(ms, a, act, K, PRE_B, 0.65, weak, false);
    ctx.z = act.devZ;
    act.pre = presolve(aimOf(K.req, ctx, ms.r).req);
  }
  presolveStep(act.pre, 1);
}
// the contact itself: plan the launch with the ball as it is now (touch the one ball through ballKick), log the kick
function strikeContact(ms, a, act, scuff){
  const b = ms.ball, rq = act.action, at = a.at, fac = a.fac || {};
  const r = relBall(a, b, {ahead: 0, lat: 0, dist: 0});
  // (a man who has lost the ball in his swing does not strike it: he lost a 50/50 or a tackle for it since the swing
  // began (noTouch), or a man of the other side has it under his control now. The foot comes through on air)
  // (in open play only: a dead ball at a restart is the taker's, whoever was last on it)
  const lost = b.state === 'free' && ms.phase === 'live' && !(ms.restart && ms.restart.taker === a.id) &&
    (ms.t < (a.noTouch || 0) || ms.poss.ctl >= 0 && ms.poss.ctl !== a.id && ms.agents[ms.poss.ctl].team !== a.team);
  if (lost || r.dist > ACT.SCUFF_D || b.p.y - (a.y || 0) > (act.air ? VOLLEY.HI : VOLLEY.WHIFF_H) || b.state === 'held' && b.holder !== a.id){
    // the ball is gone: an air kick, still a kick in the log (never a silent cancel)
    const ev = logEv(ms, 'kick', a.team, a.id, a.m.x, a.m.z, {intent: rq.kind, recv: rq.recv != null ? rq.recv : -1, whiff: true, speed: 0});
    act.done = true; act.ev = ev;
    return ev;
  }
  const foot = footFor(a, r.lat), weak = a.foot === 'B' ? 'both' : foot !== (a.foot || 'R');
  const kind = rq.kind;
  const K = kickRequest(ms, a, act, scuff, b.p, foot), req = K.req;
  const tx = K.tx, ty = K.ty, tz = K.tz, dist = K.dist, isShot = K.isShot, ctxKind = K.ctxKind, acc = K.acc, contact = K.contact;
  // (the player's shot let go off the meter's sweet spot is scuffed, rq.scuff: control.js has already moved its aim
  // and its power, here it strikes as a scuff does, wider and dull)
  const mis = !scuff && !!rq.scuff;
  const ctx = kickCtx(ms, a, act, K, b.p, r.ahead, weak, scuff || mis);
  if (act.devZ) ctx.z = act.devZ;
  // the player's decision, recorded with his options as they were at the strike (judged later: 3.2.11)
  if (a.isMe && !rq.noRecord && (isShot || kind === 'pass' || kind === 'through' || kind === 'cross' || kind === 'lob')){
    const rec = decisionRecord(ms, a, {choice: isShot ? 'shoot' : kind === 'cross' ? 'cross' : 'pass', recv: rq.recv != null ? rq.recv : -1,
      setPiece: ms.restart && ms.restart.taker === a.id ? (ms.restart.kind === 'penalty' ? 'penalty' : ms.restart.kind === 'free' ? 'freekick' : null) : null});
    logEv(ms, 'decision', a.team, a.id, b.p.x, b.p.z, {rec});
  }
  // (a scuff changes the speed and the aim: it starts cold)
  const plan = planShot(req, ctx, ms.r, scuff ? null : presolveWarm(act.pre));
  act.pre = null; act.devZ = null;
  const L = plan.launch;
  ballKick(b, L.v, L.w, {agent: a.id, team: a.team, kind: isShot ? 'shot' : kind, aero: at.aero, t: ms.t, knuck: L.knuck});
  stamAction(a.st, isShot ? 'shot' : 'pass');
  // (the ball is struck away: nobody has it under control now, whoever had it)
  if (ms.poss.ctl >= 0) clearCtl(ms);
  // (a struck ball is a new ball: a man of the other side who lost a 50/50, a tackle or a shield challenge for the
  // ball a moment ago is barred from playing that ball, DUEL_LOCK, not from blocking the shot or the pass struck after
  // it; his body is in the way all the same)
  for (const o of ms.agents) if (o.team !== a.team && o.noTouch > ms.t) o.noTouch = ms.t;
  a.drib = null;
  refreshPred(ms);
  const extra = {intent: kind === 'roll' ? 'roll' : kind, recv: rq.recv != null ? rq.recv : -1, speed: Math.round(hypot(L.v.x, L.v.y, L.v.z)*100)/100,
    contact, finesse: !!rq.finesse, firstTime: ctx.firstTime, dist: Math.round(dist*10)/10, scuff: !!(scuff || mis), curl: req.curl,
    tx: Math.round(tx*100)/100, ty: Math.round(ty*100)/100, tz: Math.round(tz*100)/100};
  if (isShot || rq.atGoal){
    extra.xg = Math.round(xgAt(ms, a.team, b.p.x, b.p.z)*1000)/1000;
    extra.onTarget = predOnTarget(ms, a.team);
    extra.sigma = Math.round(plan.sigma*1e4)/1e4;
    if (isShot) ms.stats.shots[a.team]++;
  } else if (kind !== 'clear') ms.stats.passes[a.team]++;
  if (rq.pOK != null) extra.pOK = Math.round(rq.pOK*100)/100;
  // the player's strike (A1.7): its body shape, how far out of his stride he let it go, and how cleanly it was struck
  // (1 sweet, 0 a snatch: the plant error, the scuff, the over-hit, the legs), for the line under the reticle and the
  // contact's sound and hit-stop
  if (rq.shape){
    extra.shape = rq.shape; extra.rhythm = rq.rhythm || 0;
    // (UF2-A: the meter's verdict and the kick type, for the HUD's flash, the sound and the camera)
    if (rq.clean) extra.clean = true;
    if (rq.grade) extra.grade = rq.grade;
    if (rq.kick) extra.kick = rq.kick;
    const over = isShot && rq.power > 0.92 ? 3*(rq.power - 0.92) : 0;
    extra.strike = Math.round(clamp(1 - 1.8*ctx.plantErr - over - (scuff || mis ? 0.5 : 0) - 0.25*(1 - ctx.bF) - 0.2*(rq.over || 0), 0, 1)*100)/100;
  }
  if (rq.fk) extra.fk = true;
  if (rq.pen) extra.pen = true;
  // the target in the team frame, and how far forward the kick sends it
  const dirT = ms.dirs[a.team];
  extra.tu = Math.round((dirT*tx + ms.spec.hx)*100)/100; extra.tw = Math.round((dirT*tz + ms.spec.hz)*100)/100;
  extra.gain = Math.round((extra.tu - (dirT*b.p.x + ms.spec.hx))*100)/100;
  const restart = ms.restart && ms.restart.taker === a.id && !ms.restart.taken ? ms.restart : null;
  if (restart && restart.noOff) extra.noOffside = true;
  const ev = logEv(ms, 'kick', a.team, a.id, b.p.x, b.p.z, extra);
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onTouch(ms, a, 'kick', ev);
  onKick(ms, ev);
  // was the intended receiver beyond the line at the contact (the AI's through balls are checked on this)
  if (ev.recv >= 0 && ms.offside.set.has(ev.recv) && ms.offside.set.get(ev.recv) > 0.01) ev.recvOff = true;
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
  act.done = true; act.ev = ev; act.contactStep = ms.step;
  return ev;
}
// is the predicted path inside the frame at the goal line (before any save or block)? Interpolated on ms.pred.
function predOnTarget(ms, team){
  const P = ms.pred, n = ms.predN, dir = ms.dirs[team], gx = dir*(ms.spec.hx + R), mh = 3.66 - 0.0, top = 2.44;
  for (let k = 1; k < n; k++){
    const x0 = P[4*(k - 1)], x1 = P[4*k];
    if ((x0 - gx)*dir < 0 && (x1 - gx)*dir >= 0){
      const f = (gx - x0)/(x1 - x0 || 1e-9), y = P[4*(k - 1) + 1] + f*(P[4*k + 1] - P[4*(k - 1) + 1]), z = P[4*(k - 1) + 2] + f*(P[4*k + 2] - P[4*(k - 1) + 2]);
      return Math.abs(z) < mh && y < top;
    }
  }
  return false;
}
// pressure on an agent: the nearest opponent's closeness, 0 at 3 m or more, 1 at contact
export function pressureOn(ms, a){
  let d = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch) continue;
    const dd = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (dd < d) d = dd;
  }
  return clamp(1 - (d - 0.6)/2.4, 0, 1);
}

/* ---------- receiving, interceptions and blocks (3.1.4, 3.1.7) ---------- */

// The first touch: the ball in the agent's control radius and he wants it (the intended receiver, a chaser, an
// interceptor, or a defender in its path with nothing queued). push: the WASD direction (player) or the AI's next
// direction; with none, his facing. The touch is the spec's (touch.js firstTouch): its quality q from his control
// rating, the ball's speed against his own, the pressure on him and his breath; the ball left touchDist(q) ahead of him
// on his way, carried at his running speed (P2b-A, ball-1: receiving on the move).
export function receive(ms, a, push = null, pushK = 0.5){
  const b = ms.ball, fac = a.fac || {};
  const vIn = hypot(b.v.x, b.v.y, b.v.z);
  // (UF2-A, U17: the player's settle, his plan's settle share: the ball killed onto his preferred foot, touch.js)
  const settle = a.plan && a.plan.kind === 'receive' && a.plan.settle > 0 ? clamp(+a.plan.settle, 0, 1) : 0;
  const ft = firstTouch(a, b, {dir: push, push: pushK}, {pressure01: pressureOn(ms, a), bF: fac.bF != null ? fac.bF : 1,
    rollDecel: b.rollDecel, settle}, ms.r);
  ballKick(b, ft.v, null, {agent: a.id, team: a.team, kind: 'control', aero: 0, t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'control', quality: Math.round(ft.quality*100)/100, heavy: ft.heavy,
    part: ft.part, vIn: Math.round(vIn*10)/10, vRel: Math.round(ft.vRel*10)/10, td: Math.round(ft.dist*100)/100,
    dx: Math.round(ft.dir.x*1000)/1000, dz: Math.round(ft.dir.z*1000)/1000, a0: Math.round(ft.ahead0*100)/100});
  if (settle > 0) ev.settle = Math.round(settle*100)/100;
  chainControl(ms, a, 'control', ev);
  onTouch(ms, a, 'control', ev);
  setCtl(ms, a);
  a.plan = null; a.drib = null; a.ctlT = ms.t;
  // he looks up once it is under control: at once under pressure, after a heavy touch a little later, unpressed he settles it
  const prs = pressureOn(ms, a);
  a.brain.next = ms.t + (prs > 0.5 ? ACT.SETTLE[0] : ft.heavy ? ACT.SETTLE[1] : ACT.SETTLE[2]);
  a.brain.pending = false;
  refreshPred(ms);
  return ev;
}
// a leg block of a ball too fast to control: it keeps a quarter to a half of its pace, turned off the leg
export function block(ms, a){
  const b = ms.ball, r = ms.r;
  // a glancing touch sends it on, turned (often wide of where it was going); a square one sends it back off the shin
  const glance = r() < ACT.BLOCK_GLANCE;
  const k = glance ? ACT.BLOCK_KEEP[0] + (ACT.BLOCK_KEEP[1] - ACT.BLOCK_KEEP[0])*r() : -(ACT.BLOCK_BACK[0] + (ACT.BLOCK_BACK[1] - ACT.BLOCK_BACK[0])*r());
  // a glance turns it hard (off the side of the boot or the shin, often looping up), a square block less
  const spread = glance ? ACT.BLOCK_TURN[0] : ACT.BLOCK_TURN[1];
  const ang = (r() - 0.5)*2*spread*DEG, c = cos(ang), s = sin(ang);
  const vx = b.v.x*k, vz = b.v.z*k;
  ballKick(b, {x: vx*c - vz*s, y: Math.max(0, b.v.y*k) + (glance ? ACT.BLOCK_LOOP*r() : 0.6*r()), z: vx*s + vz*c}, null, {agent: a.id, team: a.team, kind: 'block', t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'block', quality: 0});
  chainTouch(ms, a, 'block', ev);
  onTouch(ms, a, 'block', ev);
  clearCtl(ms);
  refreshPred(ms);
  return ev;
}
// a ball that hit a body (ball.js 'body' event, not a keeper's hands): a deflection or a block in the log
export function bodyContact(ms, a, part){
  const how = classifyContact(a, ms.ball, a.state === 'jockey' || a.state === 'tackle' || a.state === 'slide' ? {stance: a.state} : null) === 'block' ? 'block' : 'deflect';
  const b = ms.ball;
  b.last.kind = 'deflect';
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how, part, quality: 0, body: true});
  chainTouch(ms, a, how, ev, true);
  onTouch(ms, a, 'deflect', ev);
  if (ms.poss.ctl >= 0 && ms.poss.ctl !== a.id) clearCtl(ms);
  return ev;
}

/* ---------- who plays the ball: the race and the 50/50 (spec 3, P2b-A) ---------- */

// Every step before the ball moves (ball-2, ball-3). A loose ball is played by whoever has it inside his control
// radius R first (zone.js): the earliest arrival wins; when a player of the other side gets to it within DUEL_WIN
// (0.15 s) of him, it is a 50/50 (duel.p5050 with each side's X = S + C, his breath against the other's, the seeded
// ms.r), and the loser cannot touch it for DUEL_LOCK. A ball under somebody's control is his while it is inside his
// radius, unless an opponent is nearer it with it inside his own: then they contest it, one 50/50 for the engagement.
// Once it is outside the controller's radius (a heavy touch, a dribble run on too far) it is anyone's who gets there
// before him, or with him: control lapses and the loose-ball race decides. What the winner does is as before: the
// intended receiver and a chaser control it (or play the first-time action they planned); a defender in its path with
// nothing queued controls it under his comfortable speed and blocks it above; a team-mate with nothing queued takes it
// when it is slow enough for him. The controller's own dribble touches come from his footfalls (dribbleFoot).
export function touchCheck(ms){
  const b = ms.ball;
  if (b.state !== 'free' || ms.phase !== 'live') return false;
  if (ms.poss.ctl >= 0){
    if (contest(ms)) return true;
    if (ms.poss.ctl >= 0) return false;
  }
  return looseBall(ms);
}


// What a body would do with the ball if it were his now: 'first' (the first-time strike he planned), 'gk' (a keeper
// in his box gathers it), 'control', 'block', or null (a team-mate with nothing queued and a ball too fast for him).
function wouldPlay(ms, a){
  const b = ms.ball, plan = a.plan;
  const wantsIt = !!plan && (plan.kind === 'receive' || plan.kind === 'chase' || plan.kind === 'intercept');
  if (wantsIt && plan.first && plan.first.kind) return 'first';
  const lastTeam = b.last.team;
  if (a.isGK && a.gk && inOwnBox(ms, a) && !a.gk.noHands && b.p.y < 2.2 && !(lastTeam === a.team && b.last.kind !== 'deflect' && b.last.kind !== 'block') && ms.gkCollect) return 'gk';
  if (lastTeam >= 0 && lastTeam !== a.team){
    // an interception (1.5.3): controlled under his comfortable speed (a little more when he was going for it), blocked above
    return classifyContact(a, b, {plan: 'intercept', going: wantsIt}) === 'control' ? 'control' : 'block';
  }
  if (classifyContact(a, b, 'receive') === 'control') return 'control';
  return wantsIt ? 'block' : null;
}

// the ball played by a now, as wouldPlay said; false when he leaves it this step
function playIt(ms, a, how, dist){
  const b = ms.ball;
  if (how === 'first'){
    const cs = canStrike(a, b);
    if (cs.ok || dist < 0.9){
      const first = a.plan.first;
      a.plan = null;
      startKick(ms, a, first);
      a.act.tc = Math.min(a.act.tc, 0.05); a.act.adjust = false;
      return true;
    }
    // (the player's own first-time action, control.js, not yet where he can strike it but still coming in to him: he
    // waits for it this step rather than taking a control touch he never asked for; at its closest the strike goes as
    // above, or he controls it below. The AI's first-time actions, brain.js, are as they were: the match's figures are
    // calibrated on them. The TR-2 integrator's approved Phase 2 edit, kept by P2b-A: the race and the control radius
    // decide that the ball is his to play; this wait decides how he plays it, and qa/tr2-passme.mjs checks it.)
    const m = a.m, cx = m.x - b.p.x, cz = m.z - b.p.z;
    if (a.isMe && !ms.meAI && (b.v.x - (m.vx || 0))*cx + (b.v.z - (m.vz || 0))*cz > 0.05) return false;
    how = b.last.team >= 0 && b.last.team !== a.team ? (classifyContact(a, b, {plan: 'intercept', going: true}) === 'control' ? 'control' : 'block')
      : classifyContact(a, b, 'receive') === 'control' ? 'control' : 'block';
  }
  if (how === 'gk'){ ms.gkCollect(ms, a); return true; }
  if (how === 'control'){ receive(ms, a, a.plan && a.plan.push, b.last.team >= 0 && b.last.team !== a.team ? 0.45 : 0.5); return true; }
  if (how === 'block'){ block(ms, a); return true; }
  return false;
}

// A 50/50 between a (the first to it) and o (the other side, inside the window): returns the winner. X = S + C for
// each (zone.ratings), the fatigue factor a's breath against o's (G0), the seeded roll; the loser cannot touch the ball
// for DUEL_LOCK. Logged as a 'duel' event {other, p, won, gap}. angle: the shield's angle factor when the controller
// shields (from the challenger's side), else 1.
const RD1 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}, RD2 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
export function duel5050(ms, a, o, gap = 0, angle = 1, kind = 'loose'){
  const ra = ratings(a.at, RD1), ro = ratings(o.at, RD2);
  const p = p5050(ra.S + ra.C, ro.S + ro.C, angle, fatigueFactor(breathOf(a), breathOf(o)));
  const won = ms.r() < p, w = won ? a : o, l = won ? o : a;
  l.noTouch = Math.max(l.noTouch || 0, ms.t + TUNE.DUEL_LOCK.value);
  // whose ball it was: the controller it was contested at the feet of, or the one whose control has just lapsed to it
  const holder = kind === 'feet' ? o : ms.lapseT === ms.t && (ms.lapseBy === a.id || ms.lapseBy === o.id) ? ms.agents[ms.lapseBy] : null;
  logEv(ms, 'duel', a.team, a.id, ms.ball.p.x, ms.ball.p.z, {other: o.id, p: Math.round(p*1000)/1000, won: w.id, gap: Math.round(gap*1000)/1000, at: kind,
    holder: holder ? holder.id : -1, xa: Math.round((ra.S + ra.C)*10)/10, xb: Math.round((ro.S + ro.C)*10)/10});
  // the ball won off the man who had it is a tackle won (the event the counters, the commentary and the camera read)
  if (holder && w !== holder && w.team !== holder.team)
    logEv(ms, 'tackle', w.team, w.id, w.m.x, w.m.z, {on: holder.id, result: 'won', won: true, type: 'duel', p: Math.round((w === a ? p : 1 - p)*1000)/1000});
  return w;
}

// Is the way from a to the ball blocked by a body of the other side (a man standing between them, within 0.3 m of the
// line, in its middle stretch)? A ball he has within his radius but behind an opponent's body is not his to play: he
// would have to go through the man (that is what a tackle or a shield challenge is for).
const BODY_BLOCK = 0.3;
function blocked(ms, a, b){
  const lx = b.p.x - a.m.x, lz = b.p.z - a.m.z, L2 = lx*lx + lz*lz;
  if (L2 < 0.09) return false;
  for (const x of ms.agents){
    if (x.team === a.team || x.team < 0 || !x.onPitch || x.role !== 'player') continue;
    const ex = x.m.x - a.m.x, ez = x.m.z - a.m.z;
    if (ex*ex + ez*ez > L2) continue;
    const t = (ex*lx + ez*lz)/L2;
    if (t <= 0.15 || t >= 0.9) continue;
    const px = lx*t - ex, pz = lz*t - ez;
    if (px*px + pz*pz < BODY_BLOCK*BODY_BLOCK) return true;
  }
  return false;
}
// the ball as his own last touch left it (a dribble or a control a moment ago), won back by him in the race: his again,
// with no new touch (it is already going where he played it)
function ownBall(ms, a){
  const L = ms.ball.last;
  return L.agent === a.id && (L.kind === 'dribble' || L.kind === 'control') && ms.t - L.t < 3;
}
function regain(ms, a){ setCtl(ms, a); a.ctlT = ms.t; return true; }

// a loose ball: who has it inside his radius now, and who of the other side gets there inside the window
const NEAR = [];
function looseBall(ms){
  const b = ms.ball, sp = hypot(b.v.x, b.v.y, b.v.z), win = TUNE.DUEL_WIN.value;
  const box = 1.6 + 9*win + sp*win;
  let first = null, fd = Infinity, fHow = null;
  NEAR.length = 0;
  for (const a of ms.agents){
    if (a.team < 0) continue;
    const dx = b.p.x - a.m.x, dz = b.p.z - a.m.z;
    if (dx > box || dx < -box || dz > box || dz < -box) continue;
    if (ghosted(ms, a) || !canPlay(ms, a)) continue;
    const how = wouldPlay(ms, a);
    if (!how) continue;
    let env = envAhead(a, b);
    if (env && env.part === 'head') env = null;
    // a ball that comes inside his radius only at the end of this step is played next step, from inside it (where the
    // foot meets it), not now from beyond it
    if (env && env.later === 1 && env.dist > LATER_MIN) env = null;
    // a ball too fast to control is still blocked by a leg stretched to it (the radius without its speed term)
    if (!env && how === 'block'){ env = envAhead(a, b, BLK); if (env && env.part === 'head') env = null; }
    if (env && blocked(ms, a, b)) env = null;
    a.zIn = !!env; a.zD = env ? env.dist : Infinity;
    NEAR.push(a);
    if (env && env.dist < fd){ fd = env.dist; first = a; fHow = how; }
  }
  if (!first) return false;
  // a keeper's hands in his box take it before any foot
  if (fHow === 'gk') return playIt(ms, first, fHow, fd);
  // the race: the first of the other side to get there, if it is inside the window
  let rival = null, rt = Infinity;
  for (const o of NEAR){
    if (o.team === first.team) continue;
    const t = o.zIn ? 0 : arrivalOf(ms, o, win);
    if (t <= win && (t < rt || t === rt && rival && o.zD < rival.zD)){ rt = t; rival = o; }
  }
  if (!rival || wouldPlay(ms, rival) === 'gk') return fHow === 'control' && ownBall(ms, first) ? regain(ms, first) : playIt(ms, first, fHow, fd);
  const w = duel5050(ms, first, rival, rt);
  if (w === first) return fHow === 'control' && ownBall(ms, first) ? regain(ms, first) : playIt(ms, first, fHow, fd);
  // the other man won it: he plays it now if it is in his reach, else it runs on to him
  if (!rival.zIn) return true;
  const rHow = wouldPlay(ms, rival);
  return rHow === 'control' && ownBall(ms, rival) ? regain(ms, rival) : playIt(ms, rival, rHow, rival.zD);
}

// The controller's ball (ball-3: no more 2.4 m stickiness). Inside his radius it is his, unless an opponent nearer it
// has it inside his own: one 50/50 per engagement (another only once contact breaks, or after CHAL_GAP); the controller
// who wins it takes it away from him. Outside his radius: an opponent nearer it with it in reach makes it loose
// (control lapses; the loose-ball race decides who plays it). Above 1.8 m, or further than CTL_FAR from him, it is
// loose. Returns true when the ball was played.
const CS_C = {ok: false, side: 0, tc: 0, foot: 'R', ahead: 0, lat: 0, dist: 0};
function contest(ms){
  const b = ms.ball, C = ms.agents[ms.poss.ctl];
  if (!C || !C.onPitch){ clearCtl(ms); return false; }
  const d = hypot(b.p.x - C.m.x, b.p.z - C.m.z);
  if (b.p.y > 1.8 || d > TUNE.CTL_FAR.value){ clearCtl(ms); C.drib = null; return false; }
  // (a controller already swinging at it, the ball in his strike window, is playing it: his strike is his touch, and a
  // man who would take it off him first has to win it at his feet)
  const striking = !!C.act && C.act.kind === 'kick' && !C.act.done && canStrike(C, b, C.act.action && C.act.action.style, CS_C).ok;
  const eC = envAhead(C, b), inC = striking || !!eC && eC.part !== 'head', dC = eC && eC.part !== 'head' ? eC.dist : d;
  // the nearest opponent with the ball inside his radius; an engagement whose contact has broken is closed
  let opp = null, od = Infinity;
  const box = d + 3;
  for (const o of ms.agents){
    if (o.team === C.team || o.team < 0) continue;
    const dx = b.p.x - o.m.x, dz = b.p.z - o.m.z;
    if (dx > box || dx < -box || dz > box || dz < -box || !canPlay(ms, o) || ghosted(ms, o)){ if (o.duelOn === C.id) o.duelOn = -1; continue; }
    const e = dx > 1.6 || dx < -1.6 || dz > 1.6 || dz < -1.6 ? null : envAhead(o, b);
    if (!e || e.part === 'head' || blocked(ms, o, b)){ if (o.duelOn === C.id) o.duelOn = -1; continue; }
    if (e.dist < od){ od = e.dist; opp = o; }
  }
  if (inC){
    if (!opp || od >= dC) return false;
    // one roll per engagement
    if (opp.duelOn === C.id && ms.t - opp.duelT < TUNE.CHAL_GAP.value) return false;
    opp.duelOn = C.id; opp.duelT = ms.t;
    // (a controller who shields: the shield's angle factor from the challenger's side of him, as for a shield challenge)
    let ang = 1;
    if (C.shield && C.shield.on){
      const f = dirOf(C.m.yaw), ox = opp.m.x - C.m.x, oz = opp.m.z - C.m.z, ol = hypot(ox, oz) || 1;
      ang = shieldAngle(acos(clamp((ox*f.x + oz*f.z)/ol, -1, 1)));
    }
    const w = duel5050(ms, opp, C, 0, ang, 'feet');
    if (w === opp){
      clearCtl(ms); C.drib = null;
      const how = wouldPlay(ms, opp) || 'control';
      return playIt(ms, opp, how === 'gk' || how === 'first' ? 'control' : how, od);
    }
    // he keeps it: swinging at it, his strike goes on; else he takes it away from the man, a short touch on his way
    if (striking) return false;
    const ux = b.p.x - opp.m.x, uz = b.p.z - opp.m.z, ul = hypot(ux, uz) || 1;
    ballKick(b, {x: (C.m.vx || 0) + 2.2*ux/ul, y: 0, z: (C.m.vz || 0) + 2.2*uz/ul}, null, {agent: C.id, team: C.team, kind: 'dribble', t: ms.t});
    logEv(ms, 'touch', C.team, C.id, b.p.x, b.p.z, {how: 'dribble', quality: 1, kept: true});
    chainKeep(ms, C);
    refreshPred(ms);
    return true;
  }
  // outside his radius: an opponent nearer it, with it in reach, makes it loose, and the race decides it at once (his,
  // or a 50/50 when the controller gets there inside the window). Until somebody can play it, it is the controller's
  // (a ball a step outside his reach, with the man nearest it his own, is still his next touch): who would get there
  // first is settled when he does (the brains do not chase a ball a man is dribbling)
  if (opp && od < dC){ clearCtl(ms); C.drib = null; ms.lapseT = ms.t; ms.lapseBy = C.id; return false; }
  return false;
}

// the control radius now, or where the ball will be later in this step: a ball dropping onto a man passes through his
// chest band between two steps, and it is his to play (not a deflection off his body). opt: reachEnvelope's. later:
// 0.5 or 1 when it is inside only that far into the step (a ball still inside at the step's end is played then)
const BA = {p: {x: 0, y: 0, z: 0}, v: null};
const BLK = {speed: false}, HALVES = [1, 0.5];
// (a ball that will be this close to him by the end of the step is played now: next step it would meet his legs)
const LATER_MIN = 0.45;
function envAhead(a, b, opt, h = 1/60){
  const env = reachEnvelope(a, b, opt);
  if (env && env.part !== 'head') return env;
  for (const f of HALVES){
    const t = f*h;
    BA.p.x = b.p.x + b.v.x*t; BA.p.y = b.p.y + b.v.y*t - 0.5*G*t*t; BA.p.z = b.p.z + b.v.z*t; BA.v = b.v;
    const e2 = reachEnvelope(a, BA, opt);
    if (e2 && e2.part !== 'head'){ e2.later = f; return e2; }
  }
  return env;
}
function inOwnBox(ms, a){
  const dir = ms.dirs[a.team], ex = -dir*a.m.x;
  return ex >= ms.spec.hx - 16.5 && Math.abs(a.m.z) <= 20.16;
}

/* ---------- dribbling (3.1.4) ---------- */

// On a footfall of the controller: a dribble touch when the cadence says so (every stride under 3 m/s, every second
// stride to 6, every third above) and the ball is within 0.9 m and 50 degrees ahead, along a.drib.dir.
export function dribbleFoot(ms, a, side){
  const b = ms.ball;
  if (ms.poss.ctl !== a.id || b.state !== 'free' || !a.drib) return false;
  // (U27: a ball in close control is touched by keepStep, not on the strides; a knocked-on ball is left to run for
  // KNOCK.LET s: a stride's touch straight after it played it again along the dribble's line, off the knock's way)
  if (a.ctlOn || (a.knockT != null && ms.t - a.knockT < KNOCK.LET) || (a.act && a.act.kind === 'fake')) return false;
  const v = a.m.speed;
  if (side === touchSideOf(a)) a.strides++;
  const every = dribbleCadence(v);
  const r = relBall(a, b, RB3);
  // (the cadence waits only while the ball will still be well ahead at the next footfall: one he is about to run onto
  // is played now, WP-F; a short touch, Ball Control's, closes faster)
  const f = dirOf(a.m.yaw), close = Math.max(0, v - (b.v.x*f.x + b.v.z*f.z));
  if (a.strides < every && v > 0.6 && r.ahead - close*DRIB_FOOT_DT > DRIB_CLOSE*0.5) return false;
  if (r.dist > TOUCH.DRIB_REACH || r.ahead < r.dist*cos(TOUCH.DRIB_CONE) || b.p.y > 0.5) return false;
  a.strides = 0;
  return dribbleKick(ms, a);
}
// a dribble touch now: the ball played on along a.drib's way (a footfall's, or the first stride's from standing)
function dribbleKick(ms, a){
  const b = ms.ball, v = a.m.speed;
  const d = a.drib, fac = a.fac || {}, vv = Math.max(v, d.speed || v);
  // played back onto the line he runs along (a point on it about where the next touch comes), so a touch that went a little
  // wide is brought back on the next one rather than drifting off his line (WP-F)
  const dl = hypot(d.dx, d.dz) || 1, ux = d.dx/dl, uz = d.dz/dl;
  const along = (b.p.x - a.m.x)*ux + (b.p.z - a.m.z)*uz + 3.0;
  // shielding (P2b-A): the line is kept on his far side from the defender, so the ball runs on the far foot
  let ox = 0, oz = 0;
  const sh = a.shield && a.shield.on && a.shield.by >= 0 ? ms.agents[a.shield.by] : null;
  if (sh){
    const rx = -uz, rz = ux, side = (sh.m.x - a.m.x)*rx + (sh.m.z - a.m.z)*rz >= 0 ? -1 : 1;
    ox = rx*side*SHIELD_LAT; oz = rz*side*SHIELD_LAT;
  }
  let kx = a.m.x + ox + ux*along - b.p.x, kz = a.m.z + oz + uz*along - b.p.z;
  const kl = hypot(kx, kz) || 1; kx /= kl; kz /= kl;
  // (UF2-A, U17: d.close, the player's close control below a sprint, touch.js dribbleTouch)
  const dt = dribbleTouch(a, b, {x: kx, z: kz}, vv, {drib: a.at.dribbling, bF: fac.bF != null ? fac.bF : 1,
    walk: vv < 2.0, rollDecel: b.rollDecel, ctrl: a.at.ctrl, small: !!d.small, close: +d.close || 0}, ms.r);
  ballKick(b, dt.v, null, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: dt.heavy ? 0.5 : 1, heavy: !!dt.heavy});
  chainKeep(ms, a);
  onTouch(ms, a, 'dribble', ev);
  refreshPred(ms);
  return true;
}
function touchSideOf(a){ return a.foot === 'L' ? 'L' : 'R'; }

/* ---------- the fake shot and the drag-backs (U28 part E) ----------
   S held as a shot is let go (control.js shotKeys): the swing stops short of the ball, which stays at your feet. With A
   or D held as well, the sole drags it back and to that side (S+A left, S+D right); with W, it is nudged on first, then
   dragged back. From the skills: the whole move takes FAKE.DUR less FAKE.AGI of Agility; the drag goes FAKE.DRAG plus
   FAKE.CTRL of Ball Control across, and lands within FAKE.ERR (1 - Ball Control/110) of where it was meant to. The touches
   are real (ballKick); a fake keeps close control */
export const FAKE = Object.freeze({DUR: .62, AGI: .18, STOP: .22, DRAG_AT: .3, NUDGE_AT: .18, AFTER: .26, BACK: .3, DRAG: .42, CTRL: .25, ERR: .22, T: .32, REACH: 1.3});
function startFake(ms, a, rq){
  const q = clamp((a.at.agility || 50)/99, 0, 1.1), f = dirOf(a.m.yaw);
  const act = {kind: 'fake', t: 0, dur: FAKE.DUR - FAKE.AGI*q, stop: FAKE.STOP, drag: rq.drag || 0, nudge: !!rq.nudge, done: false,
    fx: f.x, fz: f.z, nudged: false, dragged: false};
  act.dragAt = (act.nudge ? FAKE.NUDGE_AT + FAKE.AFTER : FAKE.DRAG_AT) - .08*q;
  a.act = act; a.state = 'kick';
  logEv(ms, 'fake', a.team, a.id, a.m.x, a.m.z, {drag: act.drag, nudge: act.nudge});
  return act;
}
// a real touch rolling the ball to a stop at (tx, tz): the sole's soft roll (the speed the grass takes off over D)
function rollTo(ms, a, tx, tz, T, how){
  const b = ms.ball, dec = b.rollDecel || 1.1, ex = tx - b.p.x, ez = tz - b.p.z, D = hypot(ex, ez), sp = D > 1e-3 ? Math.min(Math.sqrt(2*dec*D), 10) : 0;
  const kx = D > 1e-3 ? ex/D*sp : 0, kz = D > 1e-3 ? ez/D*sp : 0;
  ballKick(b, {x: kx, y: 0, z: kz}, {x: kz/BALL_R, y: 0, z: -kx/BALL_R}, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1, keep: true, foot: touchSideOf(a), part: 'sole', fake: how});
  chainKeep(ms, a); onTouch(ms, a, 'dribble', ev); refreshPred(ms);
}
function fakeStep(ms, a, act, h){
  a.intent.speedCap = Math.min(a.intent.speedCap, 1.2);
  const b = ms.ball, mine = ms.poss.ctl === a.id && b.state === 'free' && b.p.y < .4 && hypot(b.p.x - a.m.x, b.p.z - a.m.z) <= FAKE.REACH*(a.scale || 1);
  if (!mine) return;
  const sc = a.scale || 1, c = clamp((a.at.ctrl || 50)/110, 0, 1), fx = act.fx, fz = act.fz, rx = -fz, rz = fx;
  if (act.nudge && !act.nudged && act.t >= FAKE.NUDGE_AT){
    act.nudged = true;
    rollTo(ms, a, a.m.x + fx*.55*sc, a.m.z + fz*.55*sc, FAKE.T*.8, 'nudge');
  }
  if ((act.drag || act.nudge) && !act.dragged && act.t >= act.dragAt){
    act.dragged = true;
    const across = act.drag*(FAKE.DRAG + FAKE.CTRL*c)*sc, back = (act.nudge && !act.drag ? .45 : FAKE.BACK)*sc;
    const e = FAKE.ERR*(1 - c)*sc, ex = truncNormal(ms.r, e, 2), ez = truncNormal(ms.r, e, 2);
    rollTo(ms, a, a.m.x - fx*back + rx*across + ex, a.m.z - fz*back + rz*across + ez, FAKE.T, act.drag ? (act.drag < 0 ? 'drag left' : 'drag right') : 'drag back');
  }
}

/* ---------- close control (USER-ISSUES U27), and the knock-on (U26) ----------
   F (control.js) asks to take the ball into close control for TAKE.WIN s (a.takeT): as soon as it is within TAKE.REACH,
   low and nobody else's, it is gathered with a touch and a.ctlOn is set. In close control the ball is kept on a spot
   at your strong foot's side, CTL.LEAD (plus CTL.LV a m/s of your speed, CTL.LMAX at most) ahead along the way the keys take you, or in
   front of that foot standing still, at every pace: a sprint keeps it too. Whenever it would be more than CTL.TOL off
   that spot in CTL.T s, a real touch (at most every CTL.DT s, sooner on a turn) sends it there, rolling with the spin
   the contact gives; a turn is played with the side of the strong foot the turn needs (turning left, the ball's right
   side: the inside of a right foot, the outside of a left one; turning right, the other way round). It ends when anyone
   else has the ball (a tackle won, a poke, a foul, a deflection), when you start a kick or a tackle, when the ball is
   out of reach, and with the knock-on: Shift tapped twice (a.intent.knock) knocks it KNOCK.D on along your way, to run
   onto and take again with F */
// (WIN: an F pressed while you chase a ball still a couple of strides off holds until you get there)
export const TAKE = Object.freeze({REACH: 1.2, WIN: 2, MAX_Y: .5});
export const CTL = Object.freeze({LEAD: .3, LV: .05, LMAX: .5, SIDE: .35, LAT: .1, REACH: 1.25, TOL: .12, DT: .18, T: .3, TURN: 25*Math.PI/180, SPIN: 3});
export const KNOCK = Object.freeze({D: 9, MIN_V: 4, OVER: 2.5, REACH: 1.8, LET: .8});
const BALL_R = 0.11;
// the end of close control (and why: the test reads a.ctlEnd)
function ctlOff(a, why){ if (a.ctlOn){ a.ctlOn = false; a.ctlEnd = why; } }
export function keepStep(ms, a, h){
  const b = ms.ball, I = a.intent, sc = a.scale || 1;
  const dist = hypot(b.p.x - a.m.x, b.p.z - a.m.z);
  const mv = hypot(I.dx || 0, I.dz || 0) > 0.1;
  let ux, uz;
  if (mv){ const l = hypot(I.dx, I.dz); ux = I.dx/l; uz = I.dz/l; } else { const f = dirOf(a.m.yaw); ux = f.x; uz = f.z; }
  // the ends of close control
  if (a.ctlOn){
    if (ms.phase !== 'live') ctlOff(a, 'stop');
    else if (a.act && !a.act.done && a.act.kind !== 'header' && a.act.kind !== 'fake') ctlOff(a, a.act.kind);
    else if (ms.poss.ctl !== a.id) ctlOff(a, 'lost');
    else if (b.state !== 'free' || b.p.y > TAKE.MAX_Y + .3 || dist > CTL.REACH*sc) ctlOff(a, 'reach');
  }
  // the knock-on (on a ball a stride's touch may just have played on: KNOCK.REACH)
  if (I.knock){
    I.knock = false;
    if ((a.ctlOn || ms.poss.ctl === a.id) && ms.phase === 'live' && dist <= KNOCK.REACH*sc){ ctlOff(a, 'knock'); return knockOn(ms, a, ux, uz); }
  }
  // F: taking it, within TAKE.WIN s of the press
  if (!a.ctlOn && a.takeT != null){
    if (ms.t - a.takeT > TAKE.WIN) a.takeT = null;
    else if (ms.phase === 'live' && b.state === 'free' && b.p.y < TAKE.MAX_Y && dist <= TAKE.REACH*sc && (ms.poss.ctl < 0 || ms.poss.ctl === a.id) && !(a.act && !a.act.done)){
      a.takeT = null; a.ctlOn = true; a.ctlEnd = null; a.ctlDir = {x: ux, z: uz};
      if (ms.poss.ctl !== a.id) setCtl(ms, a);
      return ctlTouch(ms, a, ux, uz, true);
    }
  }
  if (!a.ctlOn || (a.act && a.act.kind === 'fake')) return false;
  return ctlTouch(ms, a, ux, uz, false);
}
// one touch of close control, if the ball is drifting off its spot (or force: the gathering touch)
function ctlTouch(ms, a, ux, uz, force){
  const b = ms.ball, sc = a.scale || 1, d0 = a.ctlDir || (a.ctlDir = {x: ux, z: uz});
  // a turn: the way the keys take you now against the last touch's
  const cross = d0.x*uz - d0.z*ux, dot = d0.x*ux + d0.z*uz, turn = atan2(cross, dot);
  const turning = Math.abs(turn) > CTL.TURN;
  if (!force && ms.t - (a.keepT != null ? a.keepT : -9) < (turning ? CTL.DT*.5 : CTL.DT)) return false;
  const vx = a.m.vx || 0, vz = a.m.vz || 0, v = hypot(vx, vz), T = CTL.T, dec = b.rollDecel || 1.1;
  // the spot: in front of you as you face, leaning towards the way you go as much as that way is forward (running on,
  // ahead along it; sideways or backwards, in front of your feet, with CTL.SIDE of a lead the way you go), at the strong
  // foot's side of your facing (its right, (-fz, fx), for a right foot). Put ahead along the way alone, a sideways run
  // carried it a metre out to your side, away from both feet
  const F = dirOf(a.m.yaw), fwd = Math.max(0, ux*F.x + uz*F.z), sx0 = F.x + ux*fwd + ux*CTL.SIDE*(1 - fwd), sz0 = F.z + uz*fwd + uz*CTL.SIDE*(1 - fwd), sl = hypot(sx0, sz0) || 1, sx = sx0/sl, sz = sz0/sl;
  const strong = touchSideOf(a), lat = (strong === 'R' ? 1 : -1)*CTL.LAT*sc, lead = Math.min(CTL.LEAD + CTL.LV*v*fwd, CTL.LMAX)*sc;
  const tx = a.m.x + vx*T + sx*lead - F.z*lat, tz = a.m.z + vz*T + sz*lead + F.x*lat;
  const bs = hypot(b.v.x, b.v.z), tr = bs > 1e-4 ? Math.min(T, bs/dec) : 0, go = bs > 1e-4 ? (bs*tr - .5*dec*tr*tr)/bs : 0;
  const px = b.p.x + b.v.x*go, pz = b.p.z + b.v.z*go;
  if (!force && !turning && hypot(px - tx, pz - tz) < CTL.TOL*sc) return false;
  // the touch: onto the spot in T s, rolling (the spin of a ball rolling that way), with a turn's side spin
  const ex = tx - b.p.x, ez = tz - b.p.z, D = hypot(ex, ez), sp = D > 1e-3 ? Math.min(D/T + .5*dec*T, 14) : 0;
  const kx = D > 1e-3 ? ex/D*sp : 0, kz = D > 1e-3 ? ez/D*sp : 0;
  // which side of the ball and which part of the strong foot: turning left (turn < 0: the right of the old way is
  // (-uz, ux), so a turn towards it has a positive cross product) the ball is played on its right side
  const left = turning && turn < 0, right = turning && turn > 0;
  const ballSide = left ? 'right' : right ? 'left' : 'back';
  const part = !turning ? 'laces' : (ballSide === 'right') === (strong === 'R') ? 'inside' : 'outside';
  const wy = turning ? (ballSide === 'right' ? 1 : -1)*CTL.SPIN : 0;
  ballKick(b, {x: kx, y: 0, z: kz}, {x: kz/BALL_R, y: wy, z: -kx/BALL_R}, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  a.keepT = ms.t; a.ctlDir = {x: ux, z: uz};
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1, keep: true, foot: strong, part, ballSide, dx: ux, dz: uz});
  chainKeep(ms, a);
  onTouch(ms, a, 'dribble', ev);
  refreshPred(ms);
  return true;
}
// the knock-on: the ball KNOCK.D on along (ux, uz), faster than your sprint by KNOCK.OVER, MIN_V over your speed now
function knockOn(ms, a, ux, uz){
  const b = ms.ball, dec = b.rollDecel || 1.1, sp = Math.max(Math.sqrt(2*dec*KNOCK.D*(a.scale || 1)), a.m.speed + KNOCK.MIN_V, (a.prm && a.prm.sprint || 8) + KNOCK.OVER);
  ballKick(b, {x: ux*sp, y: 0, z: uz*sp}, {x: uz*sp/BALL_R, y: 0, z: -ux*sp/BALL_R}, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  a.keepT = ms.t; a.knockT = ms.t; a.intent.knock = false;
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1, knock: true, foot: touchSideOf(a)});
  chainKeep(ms, a);
  onTouch(ms, a, 'dribble', ev);
  refreshPred(ms);
  return true;
}
const SHIELD_LAT = 0.3;     // a shielder's dribble runs this far to his far side of the line

/* ---------- the shield (spec 3, P2b-A) ---------- */

// The shield, for the man on the ball whose intent asks for it (a.intent.shield: control.js for the player, brain.js for
// the AI): a.shield = {on, by (the defender he shields from, -1 for none), since, S, D, touchT}. While it is on he goes
// at no more than SH_SPEED of his jog, turns his back to the defender (the body between the man and the ball), keeps
// the ball on his far side (a soft touch to SH_BALL m beyond him from the defender, at most every 0.25 s), and it costs
// breath (stamina.js stamShield: a base cost, more for each point the defender's D is over his S). A challenge on him is
// resolved in sim.js (shieldChallenges), a tackle by the tackle formula with his S for C (touch.js tackleOutcome).
const RS1 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}, RS2 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
// Does he ask to shield? intent.shield (the player's controls; the AI's once brain.js sets it, P2b-B), or, for an AI
// carrier until then, the brain's own shield stance: no dribble on, a.state 'shield' (carrierMove: holding the ball with
// an opponent within 3 m). The stance has always meant to keep the body between the man and the ball; the engine now
// carries it out (the back to him, the ball on the far foot) instead of a walk to a spot beside the ball.
export function wantsShield(ms, a){
  if (a.intent.shield) return true;
  // (a kick he has chosen and is setting up is not a shield: the ball goes onto his foot, not to his far side)
  return (!a.isMe || ms.meAI) && !a.drib && !a.pendKick && a.state === 'shield';
}
export function shieldStep(ms, a, h){
  const I = a.intent, b = ms.ball;
  const on = wantsShield(ms, a) && ms.poss.ctl === a.id && b.state === 'free' && ms.phase === 'live' && !(a.act && !a.act.done);
  if (!on){ if (a.shield) a.shield.on = false; return false; }
  const sh = a.shield || (a.shield = {on: false, by: -1, since: 0, S: 0, D: 0, touchT: -9});
  if (!sh.on){ sh.on = true; sh.since = ms.t; }
  // the defender: the nearest opponent who can play within SH_NEAR
  let o = null, od = TUNE.SH_NEAR.value;
  for (const x of ms.agents){
    if (x.team === a.team || x.team < 0 || !x.onPitch || x.role !== 'player') continue;
    const dd = hypot(x.m.x - a.m.x, x.m.z - a.m.z);
    if (dd < od){ od = dd; o = x; }
  }
  sh.by = o ? o.id : -1;
  sh.S = ratings(a.at, RS1).S; sh.D = o ? ratings(o.at, RS2).D : 0;
  I.speedCap = Math.min(I.speedCap, TUNE.SH_SPEED.value*a.prm.jog);
  if (I.gait === 'sprint' || I.gait === 'run') I.gait = 'jog';
  if (o){
    const ux = a.m.x - o.m.x, uz = a.m.z - o.m.z, ul = hypot(ux, uz) || 1;
    const f = a.faceV; f.x = ux/ul; f.z = uz/ul; I.face = f;
    // the ball on the far side: a soft touch to the spot beyond him, rolling to rest there with his own speed on top
    const sx = a.m.x + f.x*TUNE.SH_BALL.value, sz = a.m.z + f.z*TUNE.SH_BALL.value;
    const ex = sx - b.p.x, ez = sz - b.p.z, ed = hypot(ex, ez), bd = hypot(b.p.x - a.m.x, b.p.z - a.m.z);
    if (ed > 0.25 && bd < 1.3 && b.p.y < 0.5 && ms.t - sh.touchT > 0.25){
      const v = Math.min(3, Math.sqrt(2*(b.rollDecel || 1.1)*ed));
      ballKick(b, {x: (a.m.vx || 0) + ex/ed*v, y: 0, z: (a.m.vz || 0) + ez/ed*v}, null, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
      logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1, shield: true});
      chainKeep(ms, a);
      refreshPred(ms);
      sh.touchT = ms.t;
    }
  }
  stamShield(a.st, h, o ? sh.D - sh.S : -Infinity, TUNE.SH_B0.value, TUNE.SH_BK.value);
  return true;
}
const RB2 = {ahead: 0, lat: 0, dist: 0}, RB3 = {ahead: 0, lat: 0, dist: 0};
const DRIB_CLOSE = 0.6, DRIB_FOOT_DT = 0.4;      // (a footfall comes about every 0.3 to 0.4 s at a jog)

// a stationary or slow controller with the ball at his feet but not ahead keeps it there: a small touch back under
// him on a footfall (the sole), so a turn with the ball is a real turn of the ball
export function nudge(ms, a, dx, dz, k = 1.4){
  const b = ms.ball;
  ballKick(b, {x: dx*k, y: 0, z: dz*k}, null, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1});
  chainKeep(ms, a);
  refreshPred(ms);
}

/* ---------- tackles (3.1.4, 3.2.9, spec 3) ---------- */

// Begin a tackle: 'stand' (wind-up 0.12 s, active 0.25 s), 'poke' or 'slide'. carrier: the man on the ball, or null
// for a loose ball (ball-8: the tackle is aimed at where the ball will be when the foot gets there). What the sweep
// meets first, and whether it wins (the T against C logistic with the timing and the angle), is decided at the start
// from the positions and velocities (touch.js tackleOutcome), with the AI's timing error (sigma 0.12 (1 - tackling/110)
// s) moving where it aims; it is applied when it happens. A loose ball another player of the other side also has in
// reach is a 50/50 (duel.p5050). A slide carries the run-in: it starts at his speed along the way he runs (at least a
// lunge's), slides to a stop on grass friction, and he gets up after duel.recovery (longer after a miss; P2b-A, ball-7).
// The act carries {contact: {x, y, z} (where the foot meets the ball or the man), tc, side ('L' | 'R', the ball's side
// of him), outcome, v0} for the animation (P2b-B).
// timingErr null: the player's own press (control.js through startAction). His foot is not aimed by the engine at where
// the ball will be: it goes to where the ball's path comes nearest his body as the foot comes through (where he puts his
// foot in its way), so whether the ball is there when the foot is is down to when he pressed (tackleOutcome's timing:
// on time when the ball is nearest that point at mid-sweep; late once it has gone by him, early while it is still far).
export function startTackle(ms, a, kind, carrier, timingErr = 0){
  const b = ms.ball;
  const own = timingErr == null;
  if (own) timingErr = 0;
  const K = kind === 'slide' ? null : kind === 'poke' ? TACKLE.poke : TACKLE.stand;
  // the slide's run-in
  const vx = a.m.vx || 0, vz = a.m.vz || 0, v = hypot(vx, vz);
  const prof = kind === 'slide' ? slideProfile(v, sprintSpeed(a.prm, a.fac || undefined)) : null;
  // the foot goes for where the ball will be as it comes through (mid-sweep, or the slide's foot at its reach), off
  // by the timing error
  const tMid = (K ? K.wind + K.active/2 : prof.tActive*0.5) + timingErr;
  const PA = own && carrier ? pathAim(ms, a, tMid, {x: 0, y: 0, z: 0}) : predAt(ms, Math.max(0, tMid), {x: 0, y: 0, z: 0});
  const target = {x: PA.x, z: PA.z};
  // a slide goes the way he runs (his momentum), else toward the ball
  let sweepTarget = target;
  if (prof && v > 1.5) sweepTarget = {dx: vx/v, dz: vz/v};
  const out = tackleOutcome(a, carrier, b, {kind, target: sweepTarget, t: 0, prof}, {tackling: a.at.tackling}, ms.r);
  // a loose ball someone of theirs can also play: a 50/50 for it
  let rival = null;
  if (!carrier && (out.result === 'won' || out.result === 'poke')){
    let rd = Infinity;
    for (const o of ms.agents){
      if (o.team === a.team || o.team < 0 || !canPlay(ms, o)) continue;
      const dd = hypot(o.m.x - b.p.x, o.m.z - b.p.z);
      if (dd > 3) continue;
      const tt = arrivalOf(ms, o, Math.max(0.05, out.tBall + TUNE.DUEL_WIN.value));
      if (tt <= out.tBall + TUNE.DUEL_WIN.value && dd < rd){ rd = dd; rival = o; }
    }
    if (rival){
      const ra = ratings(a.at, RD1), ro = ratings(rival.at, RD2);
      const p = p5050(ra.S + ra.C, ro.S + ro.C, 1, fatigueFactor(breathOf(a), breathOf(rival)));   // (G0: X = S + C for each side)
      out.duel = {other: rival.id, p};
      if (!(ms.r() < p)){ out.result = 'miss'; out.ridden = true; out.impulse = null; }
    }
  }
  const missed = !(out.result === 'won' || out.result === 'poke' || out.result === 'foul');
  const tEff = out.result === 'foul' ? (out.tLeg >= 0 ? out.tLeg : out.tBall) : out.tBall >= 0 && !(out.result === 'miss' && !out.ridden) ? out.tBall : (K ? K.wind + K.active : prof.tActive);
  const rec = prof ? recovery(a.at.agility, missed) : 0;
  const dur = prof ? prof.tStop + rec : (K.wind + K.active + 0.25);
  const dx = target.x - a.m.x, dz = target.z - a.m.z, dl = hypot(dx, dz) || 1;
  const f = dirOf(a.m.yaw), lat = (b.p.x - a.m.x)*(-f.z) + (b.p.z - a.m.z)*f.x;
  const sdir = prof && v > 1.5 ? {x: vx/v, z: vz/v} : {x: dx/dl, z: dz/dl};
  a.act = {kind: kind === 'slide' ? 'slide' : 'tackle', sub: kind, t: 0, dur, tEff: Math.max(0.02, tEff), out, on: carrier ? carrier.id : -1, done: false,
    dir: sdir, x0: a.m.x, z0: a.m.z, prof, tc: Math.max(0.02, tEff), rec, missed,
    contact: out.contact || {x: target.x, y: R, z: target.z}, d0: hypot(b.p.x - a.m.x, b.p.z - a.m.z), geo: out.tBall >= 0 ? (out.tLeg >= 0 && out.tLeg < out.tBall ? "leg" : "ball") : out.tLeg >= 0 ? "leg" : "none", side: lat >= 0 ? 'R' : 'L', outcome: out.result, v0: prof ? prof.v0 : 0,
    sv: prof ? {x: a.m.x, z: a.m.z, vx: sdir.x*prof.v0, vz: sdir.z*prof.v0} : null};
  a.state = kind === 'slide' ? 'slide' : 'tackle'; a.stateT = 0;
  stamAction(a.st, kind === 'slide' ? 'slide' : 'tackle');
  a.cool.tackle = ms.t + dur + 0.4;
  if (prof) a.recoverT = ms.t + dur;
  return a.act;
}
// the point of the ball's path (ms.pred, the next 1.5 s) nearest his body as the foot comes through (tMid from now)
const PA2 = {x: 0, y: 0, z: 0};
function pathAim(ms, a, tMid, out){
  const bx = a.m.x + (a.m.vx || 0)*tMid, bz = a.m.z + (a.m.vz || 0)*tMid;
  let best = Infinity;
  for (let k = 0; k <= 45; k++){
    predAt(ms, k/30, PA2);
    const d = hypot(PA2.x - bx, PA2.z - bz);
    if (d < best - 1e-6){ best = d; out.x = PA2.x; out.y = PA2.y; out.z = PA2.z; }
  }
  return out;
}
function tackleApply(ms, a, act){
  act.done = true;
  const b = ms.ball, out = act.out, c = act.on >= 0 ? ms.agents[act.on] : null;
  let result = out.result;
  // the carrier may have touched the ball on since the tackle began: a ball no longer where the sweep goes is missed
  if ((result === 'won' || result === 'poke') && hypot(b.p.x - a.m.x, b.p.z - a.m.z) > (act.sub === 'slide' ? 2.2 : 1.5)) result = 'miss';
  if (result === 'foul' && (!c || hypot(c.m.x - a.m.x, c.m.z - a.m.z) > 2.2)) result = 'miss';
  // (a loose ball the carrier has since lost to someone else is played as it lies: the race decides after)
  const ev = logEv(ms, 'tackle', a.team, a.id, a.m.x, a.m.z, {on: act.on, result, won: result === 'won', type: act.sub,
    p: Math.round((out.p != null ? out.p : 1)*1000)/1000, timing: Math.round((out.timing != null ? out.timing : 1)*100)/100,
    dt: Math.round((out.dt || 0)*1000)/1000, ridden: !!out.ridden, late: !!out.late, loose: act.on < 0, d0: Math.round(act.d0*100)/100, geo: act.geo});
  if (result === 'won' || result === 'poke'){
    ballKick(b, out.impulse, null, {agent: a.id, team: a.team, kind: 'tackle', t: ms.t});
    const tev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'tackle', quality: result === 'won' ? 1 : 0.4});
    chainTouch(ms, a, 'tackle', tev);
    onTouch(ms, a, 'tackle', tev);
    clearCtl(ms);
    if (c){ c.drib = null; c.brain.next = ms.t + 0.15; c.noTouch = ms.t + 0.4; }
    refreshPred(ms);
  } else if (result === 'foul' && c){
    if (out.impulse){ c.m.vx += out.impulse.x; c.m.vz += out.impulse.z; }
    c.m.stagger = c.prm.staggerT;
    foul(ms, a, c, out.severity, c.m.x, c.m.z, {slide: act.sub === 'slide', down: out.severity > 0.5});
  }
  return ev;
}

/* ---------- headers (1.5.3, 3.1.7) ---------- */

// Plan a header: take off so that the head meets the ball at tContact (seconds from now) near its apex. intent: 'attack'
// (toward goal, 5 degrees down), 'pass' (to target), 'clear'. charge 0..1.
export function startHeader(ms, a, tContact, intent, target = null, charge = 1, dive = false, ballY = null){
  if (dive) return startDiveHeader(ms, a, tContact, intent, target);
  let v0 = (0.8 + 0.2*clamp(charge, 0, 1))*(2.6 + 0.012*a.at.jumping);
  // the player's header (WP-F, A1.5) sizes the leap to the ball: none for a ball at the brow (a standing header,
  // the head meets it as it comes), the jump that lifts the brow to it for one above
  if (ballY != null){
    const need = ballY - (headOf(a, HP).y - (a.y || 0));
    v0 = need <= 0.08 ? 0 : Math.min(v0, Math.sqrt(2*G*need) + 0.25);
  }
  const tApex = v0/G, tJump = Math.max(0, tContact - Math.max(0.05, tApex - 0.05));
  a.act = {kind: 'header', t: 0, jumpAt: Math.max(ACT.HEADER_LOAD*0.5, tJump), v0, tc: tContact, intent, target, done: false, air: false,
    dur: Math.max(tContact, tJump) + 2*tApex + ACT.HEADER_RECOVER, standing: false};
  a.state = 'jump'; a.stateT = 0;
  stamAction(a.st, 'jump');
  a.cool.header = ms.t + 1.2;
  return a.act;
}
// The diving header (addendum A1.5, WP-F): from a stride, the body launched flat at a low ball in front, head first.
// The hips travel on a straight line to the point that puts the brow on the ball at contact (moves.js diveHeaderRoot
// draws the same line), the root rising a little and coming down onto the chest; then 0.8 s on the ground. The head
// leads the hips by DIVE.REACH along the facing, at the root's height plus DIVE.HEAD.
export const DIVE = Object.freeze({LOAD: 0.12, REACH: 0.95, HEAD: 0.32, RISE: 0.35, GROUND: 0.8, MAX_V: 7.5});
function startDiveHeader(ms, a, tContact, intent, target){
  const tc = clamp(tContact, DIVE.LOAD + 0.12, 0.7);
  const P0 = predAt(ms, tc, {x: 0, y: 0, z: 0}), f = dirOf(a.m.yaw);
  const t = tc - DIVE.LOAD, cx = P0.x - f.x*DIVE.REACH, cz = P0.z - f.z*DIVE.REACH;
  let vx = (cx - a.m.x)/t, vz = (cz - a.m.z)/t;
  const vl = hypot(vx, vz); if (vl > DIVE.MAX_V){ vx *= DIVE.MAX_V/vl; vz *= DIVE.MAX_V/vl; }
  a.act = {kind: 'header', t: 0, jumpAt: DIVE.LOAD, v0: 0, tc, intent, target, done: false, air: false, dive: true, vx, vz, x0: a.m.x, z0: a.m.z,
    dur: tc + 0.3 + DIVE.GROUND, standing: false, ballY: Math.max(0.25, P0.y)};
  a.state = 'jump'; a.stateT = 0;
  stamAction(a.st, 'jump');
  a.cool.header = ms.t + 1.6;
  return a.act;
}
// one step of a diving header's body: along its line until it lands (contact + 0.25 s), then on the ground
function diveStep(ms, a, act, h){
  const tf = act.t - act.jumpAt;
  if (tf <= 0) return;
  const fly = act.tc - act.jumpAt + 0.25;
  if (tf <= fly){
    a.m.x += act.vx*h; a.m.z += act.vz*h; a.m.vx = act.vx; a.m.vz = act.vz; a.m.speed = hypot(act.vx, act.vz);
    const k = tf/fly;
    a.y = Math.max(0, DIVE.RISE*4*k*(1 - k) + (act.ballY - DIVE.HEAD - 0.1)*Math.max(0, 1 - k)*0.5);
    act.air = true;
  } else { a.m.vx = a.m.vz = a.m.speed = 0; a.y = 0; act.air = false; act.landed = true; a.state = 'ground'; }
  a.slideMoved = true;
}
// the head's centre now (a diving header's leads the body)
function headOf(a, out){
  const act = a.act;
  if (act && act.dive){ const f = dirOf(a.m.yaw); out.x = a.m.x + f.x*DIVE.REACH; out.z = a.m.z + f.z*DIVE.REACH; out.y = (a.y || 0) + DIVE.HEAD*(a.scale || 1); return out; }
  out.x = a.m.x; out.z = a.m.z; out.y = (a.y || 0) + 1.66*(a.scale || 1) + 0.06; return out;
}
const HP = {x: 0, y: 0, z: 0};
function headerTry(ms, a, act){
  const b = ms.ball;
  if (b.state !== 'free') return false;
  const h = headOf(a, HP);
  const look = {yaw: a.m.yaw, pitch: 0};
  const dirTeam = ms.dirs[a.team];
  if (act.intent === 'attack'){
    const gx = dirTeam*ms.spec.hx, tz = act.target ? act.target.z : 0;
    look.yaw = yawOf(gx - b.p.x, tz - b.p.z);
    const d = hypot(gx - b.p.x, tz - b.p.z);
    look.pitch = atan2((act.target ? act.target.y : 1.0) - b.p.y, d);
  } else if (act.intent === 'clear'){
    look.yaw = yawOf(dirTeam, (b.p.z >= 0 ? 0.4 : -0.4));
    // near his own goal with an attacker on him (or a ball whipped across fast), safety first: headed behind, over his
    // own goal line well wide of the post (a corner costs less than a chance), rather than back into the middle
    const ogx = -dirTeam*ms.spec.hx, near = Math.abs(ogx - b.p.x) < ACT.SAFETY[0];
    let pressed = false;
    for (const o of ms.agents){ if (o.team !== a.team && o.team >= 0 && o.onPitch && hypot(o.m.x - a.m.x, o.m.z - a.m.z) < ACT.SAFETY[1]){ pressed = true; break; } }
    const fast = hypot(b.v.x, b.v.z) > ACT.SAFETY[2];
    if (near && (pressed || fast) && ms.r() < ACT.SAFETY[3]){
      const side = b.p.z >= 0 ? 1 : -1;
      look.yaw = yawOf(ogx - dirTeam*ACT.SAFETY[4] - b.p.x, side*(ACT.SAFETY[5] + ACT.SAFETY[6]*ms.r()) - b.p.z);
    }
  }
  const res = headerContact(a, b, h, {kind: act.intent, look: act.intent === 'pass' ? null : look, target: act.target}, {heading: a.at.heading,
    vIn: b.v, running: a.m.speed > 3}, ms.r);
  if (!res) return false;
  ballKick(b, res.v, null, {agent: a.id, team: a.team, kind: 'header', t: ms.t});
  act.done = true;
  if (ms.poss.ctl >= 0) clearCtl(ms);
  refreshPred(ms);
  const atGoal = act.intent === 'attack';
  const extra = {intent: 'header', recv: act.recv != null ? act.recv : -1, speed: Math.round(res.speed*100)/100, contact: 0, firstTime: true,
    dist: Math.round(hypot(dirTeam*ms.spec.hx - b.p.x, b.p.z)*10)/10, atGoal, quality: Math.round(res.quality*100)/100};
  // a header played on to a team-mate: how far forward it sends the ball (as a pass's gain)
  if (act.target && extra.recv >= 0) extra.gain = Math.round(dirTeam*(act.target.x - b.p.x)*100)/100;
  if (atGoal){
    extra.xg = Math.round(0.6*xgAt(ms, a.team, b.p.x, b.p.z)*1000)/1000;
    extra.onTarget = predOnTarget(ms, a.team);
    ms.stats.shots[a.team]++;
  }
  const restart = ms.restart && ms.restart.taker === a.id ? ms.restart : null;
  const ev = logEv(ms, 'kick', a.team, a.id, b.p.x, b.p.z, extra);
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onTouch(ms, a, 'header', ev);
  onKick(ms, ev);
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
  // an aerial duel: anyone else in the air for it lost it
  for (const o of ms.agents){
    if (o === a || !o.onPitch || !o.act || o.act.kind !== 'header' || o.act.done || o.team === a.team) continue;
    const dd = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (dd < 2.5){
      o.act.done = true;
      logEv(ms, 'aerial', a.team, a.id, b.p.x, b.p.z, {winner: a.id, loser: o.id});
      // bodies together in the air: the man who lost it may have gone through the back of the one who won it (in the
      // winner's attacking box the referee lets that contact go: it takes more than a challenge in the air for a penalty)
      if (dd < ACT.AERIAL_FOUL[0] && ms.r() < ACT.AERIAL_FOUL[1] && !inBox(ms.spec, ms.dirs[a.team], a.m.x, a.m.z))
        foul(ms, o, a, ACT.AERIAL_FOUL[2] + ACT.AERIAL_FOUL[3]*ms.r(), a.m.x, a.m.z, {aerial: true, down: false});
    }
  }
  return true;
}

/* ---------- throw-ins ---------- */

// the throw: from 2.0 m at up to 8 + 0.07 passing m/s, released at 0.62 s of a 1.0 s clip
// (a throw to a man's height goes at about 20 degrees: tan and cos squared of it)
const THROW_TAN = 0.36397, THROW_COS2 = 0.88302;
export function startThrow(ms, a, target, recv = -1){
  a.act = {kind: 'throw', t: 0, dur: ACT.THROW_DUR, tc: ACT.THROW_REL, target, recv, done: false, pre: null, preReq: null};
  a.state = 'throw'; a.stateT = 0;
  return a.act;
}
// the throw's solve request with the ball where it is (a throw is solved through the clip, a flight a step, and at the
// release the answer is used when the ball has not moved since; else it is solved again from there)
function throwRequest(ms, a, act){
  const b = ms.ball, tg = act.target;
  const vmax = 8 + 0.07*a.at.passing;
  const from = {x: b.p.x, y: Math.max(1.6, b.p.y), z: b.p.z};
  const d = hypot(tg.x - from.x, tg.z - from.z);
  // (P7-B) a target with a height is thrown to arrive there, on a flatter line (about 20 degrees: a throw to a man's
  // thigh, Training's set pieces; the lob's speed would leave the solver the high arc, which only a header meets);
  // without one, onto the grass at the point on the lob, as always
  const ty = tg.y != null && Number.isFinite(+tg.y) && +tg.y > R + 0.05 ? clamp(+tg.y, R, 2) : R;
  let sp = clamp(Math.sqrt(9.81*Math.max(2, d)/0.9396926207859083)*0.92, 5, vmax);
  if (ty > R){
    const dd = Math.max(2, d), q = dd*THROW_TAN - (ty - from.y);
    sp = clamp(Math.sqrt(9.81*dd*dd/(2*THROW_COS2*Math.max(0.3, q)))*1.04, 5, vmax);
  }
  return {from, target: {x: tg.x, y: ty, z: tg.z}, speed: sp, contact: 0, curl: 0, foot: 'R', kind: 'throw', rollDecel: b.rollDecel};
}
const sameReq = (p, q) => p.from.x === q.from.x && p.from.y === q.from.y && p.from.z === q.from.z && p.target.x === q.target.x &&
  p.target.z === q.target.z && p.speed === q.speed && p.rollDecel === q.rollDecel;
function throwPresolve(ms, a, act){
  if (!act.pre){ act.preReq = throwRequest(ms, a, act); act.pre = presolve(act.preReq); }
  presolveStep(act.pre, 1);
}
function throwRelease(ms, a, act){
  const b = ms.ball;
  const rq = throwRequest(ms, a, act), from = rq.from, d = hypot(rq.target.x - from.x, rq.target.z - from.z), sp = rq.speed;
  const pre = act.pre, same = !!(pre && act.preReq && sameReq(act.preReq, rq));
  // the same request solved to the end through the clip is the same answer; anything else (the ball moves a little in
  // his hands as he throws) is solved here from the presolve's launch
  const L = same && pre.done ? pre.res : solveStrike(rq, presolveWarm(pre));
  act.pre = null; act.preReq = null;
  ballRelease(b, from, L.v, {x: 0, y: 0, z: 0});
  b.last.agent = a.id; b.last.team = a.team; b.last.kind = 'throw'; b.last.t = ms.t;
  b.pendN = 0;
  act.done = true;
  refreshPred(ms);
  const restart = ms.restart && ms.restart.taker === a.id ? ms.restart : null;
  const ev = logEv(ms, 'kick', a.team, a.id, from.x, from.z, {intent: 'throw', recv: act.recv, speed: Math.round(sp*100)/100, contact: 0,
    dist: Math.round(d*10)/10, noOffside: true});
  ms.stats.passes[a.team]++;
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onKick(ms, ev);
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
}

/* ---------- the action step (3.2.1 step 4) ---------- */

// Carry the agent's action forward one step: contacts at their scheduled step, the jump and the slide on their root
// curves, the recovery after. A player's queued Action (intent.action, from control.js) starts here.
export function actionStep(ms, a, h){
  const I = a.intent;
  if (I.action && !a.act){ startAction(ms, a, I.action); I.action = null; }
  // the shield (P2b-A): its stance, its speed cap, the ball on the far foot and its breath
  if (I.shield || a.state === 'shield' || a.shield && a.shield.on) shieldStep(ms, a, h);
  // setting off with the ball from standing (a.drib.start, the player's controls): the first stride plays it on, before
  // the body can run over it (the footfalls come half a stride later)
  if (!a.act && a.drib && a.drib.start && ms.poss.ctl === a.id && ms.phase === 'live' && ms.ball.state === 'free'){
    const r = relBall(a, ms.ball, RB2);
    if (r.dist <= TOUCH.DRIB_REACH && r.ahead > 0.15 && ms.ball.p.y < 0.5){ a.drib.start = false; a.strides = 0; dribbleKick(ms, a); }
    else if (r.ahead <= 0.15) a.drib.start = false;
  }
  const act = a.act;
  if (!act){ if (a.state !== 'idle' && a.state !== 'run' && a.state !== 'jockey' && a.state !== 'shield') a.state = a.m.speed > 0.3 ? 'run' : 'idle'; return; }
  act.t += h;
  switch (act.kind){
    case 'kick': {
      if (!act.done){
        const b = ms.ball;
        if (act.adjust){
          // the stride adjust: steer to the plant spot behind the ball; strike the moment it is in the window
          const cs = canStrike(a, b, act.action.style);
          // a volley is struck as the ball drops into the window, on the next swing (the timing is the ring's)
          if (cs.ok){ act.adjust = false; act.tc = act.t + (act.air ? Math.min(cs.tc, 1/30) : cs.tc); act.dur = act.tc + ACT.FOLLOW; }
          else if (act.t >= (act.adjustMax || ACT.ADJUST)){ strikeContact(ms, a, act, true); act.dur = act.t + ACT.FOLLOW; break; }
          else {
            // a ball in the air: to where it will be met (the resolver's point), else the ball itself
            const mp = act.air && act.action.meet ? act.action.meet : b.p;
            const tg = act.action.target || {x: mp.x, z: mp.z};
            const kx = tg.x - mp.x, kz = tg.z - mp.z, kl = hypot(kx, kz) || 1;
            // the plant: behind the ball on the line of the kick, a little to the support foot's side
            const sd = act.foot === 'L' ? 1 : -1, rx = -kz/kl, rz = kx/kl;
            const back = act.air && act.action.style !== 'volley' ? 0.15 : 0.62;
            const px = mp.x - kx/kl*back + rx*sd*(act.air && act.action.style !== 'volley' ? 0.75 : 0.12), pz = mp.z - kz/kl*back + rz*sd*(act.air && act.action.style !== 'volley' ? 0.75 : 0.12);
            // at a dead ball, slowing as he comes onto the spot (1.5 m/s a metre away), so he settles on it rather than
            // circling it; a moving ball is chased at full stride
            const cap = act.adjustMax > 1 ? Math.max(0.6, 1.5*hypot(px - a.m.x, pz - a.m.z) + 0.3) : Infinity;
            steer(a, px, pz, act.adjustMax > 1 ? 'jog' : 'run', 0.04, {x: kx/kl, z: kz/kl}, cap);
          }
        }
        if (!act.adjust && !act.done){
          const tg = act.action.target;
          if (tg){ const f = faceTo(a, tg.x, tg.z, a.faceV); I.face = f; }
          // ((P9-A, MV-14) the root's speed through the strike is the clip's: strikeRoot of the approach speed, so the
          // planted foot does not skate under a body still moving at the run-up's pace)
          if (act.vIn == null) act.vIn = a.m.speed;
          I.speedCap = Math.min(I.speedCap, Math.max(1.5, a.m.speed*0.97), Math.max(STRIKE_ROOT.MIN, act.vIn*strikeRoot(act.t, act.tc)));
          if (act.t >= act.tc - 1e-9) strikeContact(ms, a, act, false);
        }
        // the solve, a flight a step through the swing (a stride adjust included)
        if (!act.done) kickPresolve(ms, a, act);
      } else I.speedCap = Math.min(I.speedCap, 2.5, act.vIn != null ? Math.max(STRIKE_ROOT.MIN, act.vIn*strikeRoot(act.t, act.tc)) : 2.5);
      if (act.done && act.t >= act.dur){ a.act = null; a.state = 'idle'; }
      break;
    }
    case 'tackle': {
      I.speedCap = Math.min(I.speedCap, 2.5);
      if (!act.done && act.t >= act.tEff) tackleApply(ms, a, act);
      if (act.t >= act.dur){ if (!act.done) tackleApply(ms, a, act); a.act = null; a.state = 'idle'; }
      break;
    }
    case 'slide': {
      // the body slides on its own momentum, slowed by the grass (duel.slideStep: mu g), then lies until he is up
      // again (duel.recovery: from his agility, longer after a miss)
      const p = act.prof, sv = act.sv;
      sv.x = a.m.x; sv.z = a.m.z;
      slideStep(sv, h);
      a.m.x = sv.x; a.m.z = sv.z; a.m.vx = sv.vx; a.m.vz = sv.vz;
      a.m.speed = hypot(sv.vx, sv.vz);
      a.slideMoved = true;
      if (!act.done && act.t >= act.tEff) tackleApply(ms, a, act);
      a.state = act.t < p.tStop ? 'slide' : 'ground';
      if (act.t >= act.dur){ a.act = null; a.state = 'idle'; a.m.speed = 0; a.m.vx = 0; a.m.vz = 0; }
      break;
    }
    case 'header': {
      if (act.dive){
        diveStep(ms, a, act, h);
        if (!act.done && act.t >= act.jumpAt - 0.02) headerTry(ms, a, act);
        if (act.t >= act.dur){ a.act = null; a.y = 0; a.vy = 0; a.state = 'idle'; }
        break;
      }
      if (act.t >= act.jumpAt && !act.air && !act.landed){ act.air = true; act.t0 = act.t; }
      if (act.air){
        const J = jumpRoot({v0: act.v0}, act.t - act.t0, {y: 0});
        a.y = J.y; a.vy = J.vy || 0;
        if (!J.air && act.t - act.t0 > 0.05){ act.air = false; act.landed = true; a.y = 0; a.vy = 0; }
      }
      if (!act.done && (act.air || act.t >= act.jumpAt - 0.02)) headerTry(ms, a, act);
      I.speedCap = Math.min(I.speedCap, act.air ? a.m.speed : 4);
      if (act.t >= act.dur || act.landed && act.done && act.t > act.tc + 0.3 || act.landed && act.t > act.tc + 0.6){ a.act = null; a.y = 0; a.vy = 0; a.state = 'idle'; }
      break;
    }
    case 'fake': {
      fakeStep(ms, a, act, h);
      if (act.t >= act.dur){ a.act = null; a.state = 'idle'; }
      break;
    }
    case 'throw': {
      standStill(a, faceTo(a, act.target.x, act.target.z, a.faceV));
      if (!act.done && act.t >= act.tc) throwRelease(ms, a, act);
      else if (!act.done) throwPresolve(ms, a, act);
      if (act.t >= act.dur){ a.act = null; a.state = 'idle'; }
      break;
    }
    default:
      if (act.t >= (act.dur || 0)) a.act = null;
  }
}

// start an Action record (1.4.14) for an agent: the player's controls and the AI land here
export function startAction(ms, a, rq){
  switch (rq.kind){
    case 'shot': case 'pass': case 'through': case 'cross': case 'lob': case 'clear': case 'goalkick': case 'punt': case 'roll':
      return startKick(ms, a, rq);
    case 'tackle': case 'slide': {
      // rq.target: an agent id (the man on the ball), 'ball' (a loose ball, ball-8), or none: the man on the ball if
      // he is theirs, else the ball when nobody has it
      // (the player's press is timed by him: no aim from the engine, startTackle's own mode; the AI's challenges on a
      // loose ball come through here too, aimed at the predicted ball)
      const kind = rq.kind === 'slide' ? 'slide' : (rq.sub || 'stand'), tg = rq.target;
      const c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
      if (tg !== 'ball' && c && c.team !== a.team && (tg == null || tg === c.id)) return startTackle(ms, a, kind, c, a.isMe && !ms.meAI ? null : 0);
      if ((tg === 'ball' || tg == null) && ms.poss.ctl < 0 && ms.ball.state === 'free') return startTackle(ms, a, kind, null, 0);
      return null;
    }
    case 'header': return startHeader(ms, a, rq.tc != null ? rq.tc : 0.3, rq.intent || 'clear', rq.target, rq.power != null ? rq.power : 1, !!rq.dive, rq.ballY != null ? rq.ballY : null);
    case 'fake': return startFake(ms, a, rq);
    case 'throw': return startThrow(ms, a, rq.target, rq.recv != null ? rq.recv : -1);
    case 'call':
      logEv(ms, 'call', a.team, a.id, a.m.x, a.m.z, {how: rq.how || 'here', px: rq.target ? rq.target.x : null, pz: rq.target ? rq.target.z : null});
      a.lastCall = ms.t; a.calls++; raiseHand(a, ms.t);
      return null;
    default: return null;
  }
}

// the ball held by a body follows the hands (keeper, a restart taker); a free ball that has run away from its
// controller (above 1.8 m, or further than TUNE.CTL_FAR) is no longer under his control. Whether a ball nearer him is
// still his is the race's (touchCheck's contest): this only clears the obvious cases before it
export function controlCheck(ms){
  const c = ms.poss.ctl;
  if (c < 0) return;
  const a = ms.agents[c], b = ms.ball;
  if (!a || !a.onPitch){ clearCtl(ms); return; }
  if (b.state === 'held') return;
  const d = hypot(b.p.x - a.m.x, b.p.z - a.m.z);
  if (d > TUNE.CTL_FAR.value || b.p.y > 1.8){ clearCtl(ms); a.drib = null; }
}

export {ballHold};
