/* ============ LIFE: the goalkeeper's moves ============
   Owner: WP-K (Stage P2). Contract: DESIGN 1.4.18 (gkmoves.js: the keeper modes registered through human.js
   registerMode), 3.5.8 (the keeper set), 3.5.6 (constraint order), 3.5.9 (match bodies pass the plan); the plan maths
   are gkplan.js's (WP-E, 1.4.14), shared with the keeper's brain, so the save on screen is the save the simulation made.

   ---- modes (st fields) ----
   'gkready'      {focus ({x, z} world or a yaw), alert (0..1)}: feet hip width + 0.18, hips down 0.12, heels up 0.10,
                  hands at (+-0.28, 1.00, 0.32), the head and chest toward the focus, a 2.2 Hz bounce of 8 mm while calm.
   'gkset'        {}: the split step (a 0.05 m hop over 0.18 s, landing 0.60 wide; EV.LAND marks him set), then held.
   'gkdive'       {plan, outcome: 'catch' | 'parry' | 'tip' | 'miss', at (seconds into the dive: the simulation's
                  diveT), steer ({x, y, z}: the re-read's move of the contact point), hands ([{x, y, z}] the
                  simulation's hand spheres, when it has them), lie (s on the ground, default 0.45), getUp (s)}.
                  The centre of mass follows diveRoot (the same curve the brain moves him along), the body's long axis
                  turns from upright to the hands' line by contact and down to the grass by the landing, the hands
                  are put by IK exactly on handsAt (or st.hands) and stay with the ball for the outcome after it; he
                  lands forearm, hip, shoulder, slides, lies, and gets up (hand plant, knee under, rise) into the
                  ready stance, so the next mode (gkready, blended over 0.25 s) starts from the pose this one ended on.
                  Events: TAKEOFF at the plan's load, CONTACT at plan.tc, LAND at the plan's landing, END when up.
   'gkcatch'      {height: 'chest' | 'high', ball, tc, jump}   chest 0.60 / 0.25; high 0.80 / 0.35 on a jump
   'gkcollect'    {style: 'scoop' | 'barrier' | 'smother', ball, tc}   0.75 / 0.30, 0.85 / 0.35, 0.90 / 0.30
   'gkpunch'      {hands: 1 | 2, ball, dir, tc, jump}   0.75 / 0.30, fists out 0.25 m in 0.10 s
   'gktip'        {ball, tc}   0.85 / 0.38: a step back and a jump, fingertips under the ball
   'gkdistribute' {kind: 'throw' | 'roll' | 'punt' | 'dropkick', dir, power}: throw 0.9 s (release 0.55), roll 0.8 s
                  (release 0.45), punt and drop kick (the ball dropped at 0.20, the volley path after); a goal kick is
                  moves.js's strike.
   Exports: GKM (timings), gkDiveTimes(plan, st) (the phases of a dive), gkReadyPose. */
import {THREE} from "./build.js";
import {clamp, lerp, sstep, kf, wrap, B, ARM, LEG, R3, frameOf, legIK, armIK} from "./rig.js";
import {EV} from "./gait.js";
import {registerMode} from "./human.js";
import {diveRoot, handsAt, jumpRoot, GKP} from "./football/gkplan.js";
import {KIT, getupPose, RATE} from "./moves.js";

const {clock, setBT, toB, toW, dirB, BT, startFeet, legW, footTo, lockFeet, plantOut, armPose, lookAt, camFx, ease, bump, rateLimit} = KIT;

export const GKM = {
  GETUP: {collapse: .8, low: .9, mid: .9, high: 1.0, stand: 0},   // 3.5.8 phase table
  LIE: .45,                                                     // on the ground before the get-up (gkbrain GROUND)
  catch: {chest: [.60, .25], high: [.80, .35]}, collect: {scoop: [.75, .30], barrier: [.85, .35], smother: [.90, .30]},
  punch: [.75, .30], tip: [.85, .38], throw: [.90, .55], roll: [.80, .45], punt: [1.0, .42], dropkick: [1.0, .44]
};

const _M = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _Qg = new THREE.Quaternion();
const _E = new THREE.Euler(), _V = new THREE.Vector3(), _V2 = new THREE.Vector3(), _U = new THREE.Vector3(), _F = new THREE.Vector3(), _X = new THREE.Vector3();
const _w = {x:0, y:0, z:0}, _b = {x:0, y:0, z:0}, _d2 = {x:0, z:0};
const _spec = {dur:1, contact:.5, pre:0, events:null, begin:null};
const YUP = new THREE.Vector3(0, 1, 0);

/* ---------- the ready stance (3.5.8) ---------- */
// focus: a world point {x, z} or a yaw (the P.yaw convention); the head and chest turn to it (the group is the owner's)
function focusYaw(h, st){
  const f = st.focus;
  if (f == null) return 0;
  if (typeof f === "number"){ dirB(-Math.sin(f), -Math.cos(f), _d2); return clamp(Math.atan2(_d2.x, _d2.z), -1, 1); }
  toB(f.x, f.y || 1, f.z, _b); return clamp(Math.atan2(_b.x, _b.z), -1, 1);
}
/* the ready pose into T (Euler): feet planted hip width + 0.18 apart, knees bent (hips 0.12 down), heels up 0.10, the
   hands in front at (+-0.28, 1.00, 0.32) of the body, the chest and head turned to yaw; bounce: metres of hop */
export function gkReadyPose(h, T, yaw = 0, bounce = 0, wide = .18){
  const D = h.D, sc = h.scale || 1;
  T[60] = 0; T[61] = -.12 + bounce/sc; T[62] = -.02;
  R3(T, B.hips, .22, yaw*.15, 0); R3(T, B.spine, .2, yaw*.25, 0); R3(T, B.chest, .08, yaw*.25, 0);
  R3(T, B.neck, -.22, yaw*.15, 0); R3(T, B.head, -.18, yaw*.2, 0);
  // heels up 0.10: on the balls of the feet (the ankle rides up, the toes stay flat)
  for (let s = 1; s >= -1; s -= 2) legIK(h, T, s, s*(D.hipX + wide/2), D.ankY + .055, .03, .55, -.5);
  for (let s = 1; s >= -1; s -= 2) armIK(h, T, s, s*.28, 1.0 + T[61], .32, s*1.1, -.35, [.8, -.3, -.6]);
}
function gkready(h, T, st, dt){
  const t = h.t, calm = 1 - clamp(st.alert != null ? +st.alert : 0, 0, 1);
  // 2.2 Hz, +-8 mm, only while calm
  const b = .008*Math.sin(t*2.2*Math.PI*2)*calm;
  gkReadyPose(h, T, focusYaw(h, st), b);
  h.gw = 0;
  if (h.mv && h.mv.key !== "gkready") h.mv.key = "gkready";
}
/* the split step: a 0.05 m hop over 0.18 s that lands 0.60 wide (EV.LAND: set), then held */
function gkset(h, T, st, dt){
  _spec.dur = .18; _spec.contact = 1e8; _spec.pre = 0; _spec.events = SET_EV;
  const C = clock(h, "gkset", st, _spec);
  const u = clamp(C.tau/.18, 0, 1), hop = .05*Math.sin(Math.PI*u);
  gkReadyPose(h, T, focusYaw(h, st), hop - .02*sstep(.7, 1, u)*(1 - sstep(1, 1.3, C.tau/.18)), lerp(.18, .60 - 2*h.D.hipX, sstep(.2, .9, u)));
  h.gw = 0;
}
const SET_EV = [[EV.LAND, .18]];

/* ---------- the dive (3.5.8) ---------- */
// the phases of a dive (seconds from its start): load, contact, landing, the end of the slide, get-up start and end
export function gkDiveTimes(plan, st = {}){
  const k = plan.kind, stand = k === "stand";
  const land = stand ? plan.tc + .25 : plan.land;
  const slide = stand ? land : land + GKP.SLIDE;
  const lie = stand ? 0 : st.lie != null ? +st.lie : GKM.LIE;
  const up = stand ? 0 : clamp(st.getUp != null ? +st.getUp : GKM.GETUP[k] || .9, .8, 1.0);
  return {load:plan.tLoad, contact:plan.tc, land, slide, upAt:slide + lie, end:slide + lie + up, up};
}
const _R = {x:0, y:0, z:0, roll:0}, _H = [{x:0, y:0, z:0, r:.11}, {x:0, y:0, z:0, r:.11}];
// the dive body's world frame at time t: the centre of mass, the long axis (U, feet to head) and the chest's way (F)
function diveFrame(plan, t, TT, side, o){
  diveRoot(plan, t, _R);
  o.cx = _R.x; o.cz = _R.z; o.cy = plan.C0.y + _R.y;
  const f = {x:-Math.sin(plan.yaw), z:-Math.cos(plan.yaw)}, r = {x:-f.z, z:f.x};
  // the axis at contact: from the centre of mass to the hands
  handsAt(plan, plan.tc, _H, o.steer);
  diveRoot(plan, plan.tc, _R);
  const ccx = _R.x, ccy = plan.C0.y + _R.y, ccz = _R.z;
  _V.set((_H[0].x + _H[1].x)/2 - ccx, (_H[0].y + _H[1].y)/2 - ccy, (_H[0].z + _H[1].z)/2 - ccz);
  if (_V.lengthSq() < 1e-6) _V.set(0, 1, 0);
  _V.normalize();
  // never past flat at contact (a low ball is reached with the body flat and the arms down to it)
  if (_V.y < -.35){ _V.y = -.35; _V.normalize(); }
  const Uc = _V2.copy(_V);
  // lying: along the dive's side, flat
  const sd = plan.kind === "stand" ? 0 : side;
  const Ul = _X.set(r.x*sd, .0, r.z*sd);
  const stand = plan.kind === "stand";
  const a = stand ? 0 : sstep(TT.load*.4, TT.contact, t), b = stand ? 0 : sstep(TT.contact, TT.land + .03, t);
  _U.copy(YUP).lerp(Uc, a);
  if (b > 0 && Ul.lengthSq() > 0) _U.lerp(Ul, b);
  if (_U.lengthSq() < 1e-6) _U.copy(YUP);
  _U.normalize();
  // the chest faces the way he faces, square to the axis
  _F.set(f.x, 0, f.z); _F.addScaledVector(_U, -_F.dot(_U));
  if (_F.lengthSq() < 1e-6) _F.set(f.x, 0, f.z);
  _F.normalize();
  o.U = _U; o.F = _F;
  return o;
}
const _fr = {cx:0, cy:0, cz:0, U:null, F:null, steer:null};
// the hips' world rotation from the body's axes (+Y the long axis U, +Z the chest's way F), as a body-space Euler pose
function hipsFrom(U, F, T){
  _X.crossVectors(U, F).normalize();
  _M.makeBasis(_X, U, _F.copy(F));
  _Q.setFromRotationMatrix(_M);
  _Qg.setFromAxisAngle(YUP, BT.ry).invert();
  _Q.premultiply(_Qg);
  _E.setFromQuaternion(_Q, "XYZ");
  R3(T, B.hips, _E.x, _E.y, _E.z);
}
// a hand's palm (the middle of it) at world point p: the wrist is solved there, then corrected by what the hand adds
const PALM_OFF = [0, -.08, .01];
function handTo(h, T, s, px, py, pz, pole){
  const hd = ARM(s)[2];
  toB(px, py, pz, _b);
  let tx = _b.x, ty = _b.y, tz = _b.z;
  for (let it = 0; it < 3; it++){
    armIK(h, T, s, tx, ty, tz, s*.9, -.1, pole);
    frameOf(h, T, hd, _M); _V.set(PALM_OFF[0], PALM_OFF[1], PALM_OFF[2]).applyMatrix4(_M);
    tx += _b.x - _V.x; ty += _b.y - _V.y; tz += _b.z - _V.z;
  }
  armIK(h, T, s, tx, ty, tz, s*.9, -.1, pole);
}
// the shoulders' middle (body space) of the pose so far
function shoulderMid(h, T, o){
  frameOf(h, T, B.chest, _M);
  _V.set(0, h.D.shY - h.D.chestY, -.005).applyMatrix4(_M);
  o.x = _V.x; o.y = _V.y; o.z = _V.z; return o;
}
const POLE_DIVE = [.6, -.2, -.6];
const _sh = {x:0, y:0, z:0}, _hc = [{x:0, y:0, z:0}, {x:0, y:0, z:0}];
function gkdive(h, T, st, dt){
  const plan = st.plan;
  if (!plan){ gkready(h, T, st, dt); return; }
  const TT = gkDiveTimes(plan, st);
  _spec.dur = TT.end; _spec.contact = plan.tc; _spec.pre = 0;
  _spec.events = plan.kind === "stand" ? null : [[EV.TAKEOFF, plan.tLoad], [EV.LAND, TT.land]];
  // the dive's own time is the simulation's when it is given (st.at); the clip clock runs on it (st.tc from it)
  const C = clock(h, "gkdive", diveSt(st), _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data;
  const t = st.at != null ? +st.at : C.tau;
  if (!d.init){
    d.init = true; startFeet(h, C); d.gy = plan.ground || 0;
    d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw}));
    d.side = plan.side || 1;
  }
  const side = d.side, stand = plan.kind === "stand";
  _fr.steer = st.steer || null;
  // ---- the get-up: lying -> hands and knee -> the ready stance (over the get-up's time), at the group's own place
  if (!stand && t >= TT.upAt){
    const u = clamp((t - TT.upAt)/TT.up, 0, 1);
    diveBody(h, T, plan, TT, TT.upAt, side, st, d);      // the lying pose it starts from
    const A = _A; A.set(T);
    T.fill(0);
    getupPose(h, T, "side", sstep(0, .75, u), side);
    const K = _K; K.set(T);
    T.fill(0);
    gkReadyPose(h, T, 0, 0);
    // A (lying) -> K (rising) over the first 55%, K -> ready over the rest (the hips' turn by quaternions)
    const a = sstep(0, .55, u), r = sstep(.45, 1, u);
    mixPose(T, A, K, a, r);
    rateLimit(h, T, GK_ALL, dt);
    C.feet[0].w = C.feet[1].w = 0; lockFeet(h, C);
    h.gw = 1 - sstep(.3, .7, u);
    if (u >= 1) h.gw = 0;
    camFx(h, 0, 0, 0, 0);
    return;
  }
  diveBody(h, T, plan, TT, t, side, st, d);
  // every joint under the speed limit from the pose last drawn (moves.js RATE): the take-off's switch from planted legs
  // to trailing ones, a reflex save's arms, the turn onto the side
  rateLimit(h, T, GK_RATE_B, dt);
  // (the arms too, but never so much that the hands miss the ball: before the contact each arm may turn as fast as it
  // must to be on its point at the contact, spread over the time left)
  if (dt > 0 && h.posed){
    const left = plan.tc - t, cap = RATE.max*Math.min(dt, .1);
    for (const b of GK_ARMS){
      const P = h.pose;
      _Qa.set(P[b*4], P[b*4 + 1], P[b*4 + 2], P[b*4 + 3]);
      _E.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Qb.setFromEuler(_E);
      const a = _Qa.angleTo(_Qb), lim = left > 1e-4 ? Math.max(cap, a*Math.min(1, dt/left)) : cap;
      if (a <= lim) continue;
      _Qa.slerp(_Qb, lim/a); _E.setFromQuaternion(_Qa, "XYZ"); T[b*3] = _E.x; T[b*3 + 1] = _E.y; T[b*3 + 2] = _E.z;
    }
  }
  lockFeet(h, C);
  // the camera follows the hips (60%) and their roll (30%) through a dive (3.5.9)
  camFx(h, 0, 0, .3*(stand ? 0 : side*sstep(TT.load, TT.land, t)), 0);
}
// what the clip clock needs of a dive's state: the contact as a countdown on the simulation's dive time when it has one
const _st = {id:undefined, tc:undefined, rate:undefined, t:undefined};
function diveSt(st){ _st.id = st.id; _st.rate = st.rate; _st.t = undefined; _st.tc = st.at != null && st.plan ? st.plan.tc - st.at : undefined; return _st; }
const _A = new Float32Array(63), _K = new Float32Array(63);
// T = (A -> K by a) -> ready (T's own) by r: Euler for the limbs, quaternions for the hips
function mixPose(T, A, K, a, r){
  // (every joint turned the short way, as quaternions: an Euler lerp between a lying and a crouching pose can swing a
  // joint right round)
  for (let b = 1; b < 20; b++){
    _E.set(A[b*3], A[b*3 + 1], A[b*3 + 2], "XYZ"); _Q.setFromEuler(_E);
    _E.set(K[b*3], K[b*3 + 1], K[b*3 + 2], "XYZ"); _Q2.setFromEuler(_E);
    _Q.slerp(_Q2, a);
    _E.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Q2.setFromEuler(_E);
    _Q.slerp(_Q2, r);
    _E.setFromQuaternion(_Q, "XYZ");
    T[b*3] = _E.x; T[b*3 + 1] = _E.y; T[b*3 + 2] = _E.z;
  }
  for (let i = 60; i < 63; i++) T[i] = lerp(lerp(A[i], K[i], a), T[i], r);
}
// bone b of T turned from its value in S by the share w of the way to T's own (quaternions)
function slerpBone(T, S, b, w){
  _E.set(S[b*3], S[b*3 + 1], S[b*3 + 2], "XYZ"); _Q.setFromEuler(_E);
  _E.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Q2.setFromEuler(_E);
  _Q.slerp(_Q2, w);
  _E.setFromQuaternion(_Q, "XYZ");
  T[b*3] = _E.x; T[b*3 + 1] = _E.y; T[b*3 + 2] = _E.z;
}
/* the dive's body at time t (load, flight, contact, landing, slide, lying) into T */
function diveBody(h, T, plan, TT, t, side, st, d){
  const D = h.D, sc = BT.sc, stand = plan.kind === "stand", C = h.mv;
  const fr = diveFrame(plan, t, TT, side, _fr);
  const U = fr.U, F = fr.F;
  // the load (power step): knees bend, the lead foot steps out toward the ball
  const load = stand ? 0 : clamp(t/Math.max(.05, plan.tLoad), 0, 1);
  const air = !stand && t > plan.tLoad;
  // ---- the hips: the centre of mass less a little along the axis (the body's centre sits just above the hips joint)
  hipsFrom(U, F, T);
  const px = fr.cx - U.x*.06*sc, py = fr.cy - U.y*.06*sc, pz = fr.cz - U.z*.06*sc;
  toB(px, py, pz, _b);
  T[60] = _b.x; T[61] = _b.y - D.hipsY; T[62] = _b.z;
  // ready-like crouch before the take-off (the brain's own load dips the centre 0.08)
  const crouch = stand ? .5 : 1 - sstep(plan.tLoad*.6, plan.tLoad + .08, t);
  R3(T, B.spine, lerp(-.05, .2, crouch), 0, air ? -side*.05 : 0); R3(T, B.chest, lerp(-.05, .08, crouch));
  // ---- the hands: on the plan's line to the ball until contact, then with the ball for the outcome
  const H = st.hands && st.hands.length === 2 && t <= plan.tc ? st.hands : handsAt(plan, Math.min(t, plan.tc), _H, st.steer || null);
  let hx0 = H[0].x, hy0 = H[0].y, hz0 = H[0].z, hx1 = H[1].x, hy1 = H[1].y, hz1 = H[1].z;
  if (t > plan.tc){
    // after contact: the hands keep their place on the body (as it was at contact), plus the outcome's own move
    const sinceC = t - plan.tc, out = st.outcome || "catch";
    const fr0 = diveFrame(plan, plan.tc, TT, side, {cx:0, cy:0, cz:0, U:null, F:null, steer:st.steer || null});
    const Uc = _Uc.copy(fr0.U), Fc = _Fc.copy(fr0.F), cx0 = fr0.cx, cy0 = fr0.cy, cz0 = fr0.cz;
    diveFrame(plan, t, TT, side, _fr);
    _Xc.crossVectors(Uc, Fc); _Xn.crossVectors(fr.U, fr.F);
    for (let i = 0; i < 2; i++){
      const hx = i ? hx1 : hx0, hy = i ? hy1 : hy0, hz = i ? hz1 : hz0;
      const ox = hx - cx0, oy = hy - cy0, oz = hz - cz0;
      // the hand's offset in the contact frame, put back in the frame now
      const a1 = ox*_Xc.x + oy*_Xc.y + oz*_Xc.z, a2 = ox*Uc.x + oy*Uc.y + oz*Uc.z, a3 = ox*Fc.x + oy*Fc.y + oz*Fc.z;
      let nx = fr.cx + _Xn.x*a1 + fr.U.x*a2 + fr.F.x*a3, ny = fr.cy + _Xn.y*a1 + fr.U.y*a2 + fr.F.y*a3, nz = fr.cz + _Xn.z*a1 + fr.U.z*a2 + fr.F.z*a3;
      // catch: drawn in toward the chest; parry: pushed 0.15 m away in 0.08 s; tip: up; miss: on along the line
      const k = sstep(0, .25, sinceC);
      if (out === "catch"){ nx += (fr.cx + fr.U.x*.35*sc + fr.F.x*.25*sc - nx)*k*.7; ny += (fr.cy + fr.U.y*.35*sc + fr.F.y*.25*sc - ny)*k*.7; nz += (fr.cz + fr.U.z*.35*sc + fr.F.z*.25*sc - nz)*k*.7; }
      else if (out === "parry"){ const p = .15*sc*sstep(0, .08, sinceC); nx += fr.F.x*p; nz += fr.F.z*p; }
      else if (out === "tip"){ ny += .1*sc*sstep(0, .1, sinceC); }
      else { nx += fr.U.x*.12*sc*k; ny += fr.U.y*.12*sc*k; nz += fr.U.z*.12*sc*k; }
      // lying: the arms come down onto the grass (no reach any more)
      const lieK = stand ? 0 : sstep(TT.land - .02, TT.slide + .1, t);
      if (lieK > 0){ ny = lerp(ny, Math.max(ny*.3, (d.gy || 0) + .1*sc), lieK*.6); }
      if (i){ hx1 = nx; hy1 = ny; hz1 = nz; } else { hx0 = nx; hy0 = ny; hz0 = nz; }
    }
  }
  // ---- reach: the shoulders near enough to put the hands on their points (the body moves along to them if not)
  // (each arm from its own shoulder: the far hand of a two-handed reach across the body is the one that runs short)
  const reachMax = (D.elbowL + D.foreL)*.97*sc + .07*sc;
  for (let it = 0; it < 3; it++){
    for (const s of [1, -1]){
      frameOf(h, T, ARM(s)[0], _M); _V.setFromMatrixPosition(_M); toW(_V.x, _V.y, _V.z, _w);
      const hx = s > 0 ? hx0 : hx1, hy = s > 0 ? hy0 : hy1, hz = s > 0 ? hz0 : hz1;
      const mx = hx - _w.x, my = hy - _w.y, mz = hz - _w.z, ml = Math.hypot(mx, my, mz);
      const ex = ml - reachMax;
      if (ex > 0){ dirB(mx/ml, mz/ml, _d2); T[60] += _d2.x*ex/sc; T[62] += _d2.z*ex/sc; T[61] += my/ml*ex/sc; }
    }
  }
  // hands: before the take-off, from the ready stance; then IK onto the points (the palm's middle on each)
  if (!air && !stand && load < 1){
    gkHandsReady(h, T);
  }
  // (on by the load, or by the contact when that comes first: a reflex save's hands are on the ball when it arrives)
  const ik = stand ? 1 : sstep(0, Math.max(.06, Math.min(plan.tLoad, plan.tc)), t);
  if (ik > 0){
    // (the left hand is H[0]: gkplan puts it on the keeper's left of the ball's path)
    const sv = _Tsave; sv.set(T);
    handTo(h, T, 1, hx0, hy0, hz0, POLE_DIVE); handTo(h, T, -1, hx1, hy1, hz1, POLE_DIVE);
    if (ik < 1) for (const b of [6, 7, 8, 9, 10, 11]) slerpBone(T, sv, b, ik);
  }
  // the head on the ball until the landing
  if (plan.hit) lookAt(h, T, plan.hit.x, plan.hit.y, plan.hit.z, 1 - sstep(TT.land, TT.slide, t)*.7);
  // ---- the legs: planted through the load (the lead foot steps out), trailing in the air, relaxed lying down
  const F2 = C.feet;
  if (!air){
    for (let j = 0; j < 2; j++){
      const f = F2[j], f0 = d.f0[j], s = j ? -1 : 1;
      // the lead foot is the one on the dive's side (side +1 is the keeper's right: the right foot, j = 1)
      const lead = stand ? false : (side > 0 ? j === 1 : j === 0);
      const rr = {x:-(-Math.cos(plan.yaw)), z:-Math.sin(plan.yaw)};
      const st2 = lead ? .25*sc*sstep(0, 1, load) : 0;
      f.x = f0.x + rr.x*side*st2; f.z = f0.z + rr.z*side*st2; f.y = f0.y + .05*sc*bump(load)*(lead ? 1 : 0);
      if (stand){
        // a standing save: the body shifts across on its feet (the root carries it)
        toB(f0.x, f0.y, f0.z, _b); toW(_b.x, _b.y, _b.z, _w);
        f.x = f0.x; f.z = f0.z;
      }
      f.yaw = f0.yaw; f.pitch = 0; f.roll = 0; f.w = 1;
      legW(h, T, s, f.x, f.y, f.z, f.yaw, -.2*crouch, 0, .3*crouch);
    }
  } else {
    const fly = sstep(plan.tLoad, plan.tLoad + .12, t), down = sstep(TT.land - .05, TT.slide, t);
    for (let j = 0; j < 2; j++){
      const s = j ? -1 : 1, LG = LEG(s), lead = side > 0 ? j === 1 : j === 0;
      // the push-off leg straightens behind, the lead leg folds a little; lying, both relax with the knees bent
      const thX = lerp(lead ? -.35 : .15, lead ? -.45 : -.2, down), knee = lerp(lead ? .45 : .25, lead ? .9 : .6, down);
      R3(T, LG[0], thX*fly, 0, s*(lead ? .12 : .04)*fly);
      R3(T, LG[1], lerp(.6, knee, fly)); R3(T, LG[2], lerp(.2, .45, fly)); R3(T, LG[3], 0);
      F2[j].w = 0;
    }
  }
  h.gw = stand ? 0 : sstep(TT.land - .02, TT.land + .1, t);
}
const GK_RATE_B = [4, 5, 12, 13, 14, 15, 16, 17, 18, 19], GK_ARMS = [6, 7, 8, 9, 10, 11], GK_ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const _Qa = new THREE.Quaternion(), _Qb = new THREE.Quaternion();
const _Uc = new THREE.Vector3(), _Fc = new THREE.Vector3(), _Xc = new THREE.Vector3(), _Xn = new THREE.Vector3();
const _Tsave = new Float32Array(63);
function gkHandsReady(h, T){ for (let s = 1; s >= -1; s -= 2) armIK(h, T, s, s*.28, 1.0 + T[61], .32 + T[62], s*1.1, -.35, [.8, -.3, -.6]); }

/* ---------- catches, collections, the punch, the tip ----------
   The hands meet the ball at contact (palms behind it, 0.09 m apart; fists for a punch; fingertips under it for the
   tip) and the body brings it in: elbows cushion over 0.10 s, the ball to the chest. A high catch, the punch with jump
   and the tip go up on jumpRoot (the simulation's curve). */
function handsClip(h, T, st, dt, key, dur, ct, kind){
  _spec.dur = dur; _spec.contact = ct; _spec.pre = 0;
  _spec.events = st.jump || kind === "high" || kind === "tip" ? [[EV.TAKEOFF, .14], [EV.LAND, ct + .3]] : null;
  const C = clock(h, key, st, _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, tau = C.tau;
  if (!d.init){
    d.init = true; startFeet(h, C); d.gy = BT.gy; d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw}));
    const b = st.ball;
    if (b){ d.bx = b.x; d.by = b.y; d.bz = b.z; }
    else { toW(0, kind === "high" ? 2.35 : kind === "chest" ? 1.25 : kind === "scoop" || kind === "barrier" ? .12 : kind === "smother" ? .12 : kind === "tip" ? 2.55 : 2.2, kind === "smother" ? 1.2 : .5, _w); d.bx = _w.x; d.by = _w.y; d.bz = _w.z; }
  }
  const jump = (st.jump || kind === "high" || kind === "tip") ? jumpRoot({v0:kind === "tip" ? 3.0 : 2.6*(st.jump || 1), tLoad:.14}, tau, _J) : null;
  const rise = jump ? jump.y/sc : 0;
  const low = kind === "scoop" || kind === "barrier" || kind === "smother";
  // the body: from the ready stance into the move
  gkReadyPose(h, T, 0, 0);
  const w = sstep(0, ct, tau)*(1 - sstep(ct + .2, dur, tau)*.6);
  T[61] += rise;
  if (kind === "scoop"){ T[61] -= .2*w; R3(T, B.hips, .22 + .55*w); R3(T, B.spine, .2 + .3*w); }
  if (kind === "barrier"){ T[61] -= .38*w; R3(T, B.hips, .22 + .35*w, .5*w, 0); R3(T, B.spine, .2 + .25*w); }
  if (kind === "smother"){
    // down sideways onto the ball at the attacker's feet (the body flat and long across it)
    const k = sstep(0, ct, tau), sd = st.side || 1;
    T[61] = lerp(-.12, -(D.hipsY - .2), k); T[62] = .35*k; R3(T, B.hips, lerp(.22, .5, k), 0, sd*1.3*k); R3(T, B.spine, .1);
  }
  if (kind === "tip"){ T[62] -= .25*sstep(0, .14, tau); R3(T, B.spine, -.1*w); R3(T, B.chest, -.1*w); }
  // the hands: palms behind the ball, 0.09 apart (fists for the punch, fingertips under it for the tip); the ball comes in after
  const bx = d.bx, by = d.by, bz = d.bz;
  const f = {x:Math.sin(BT.ry), z:Math.cos(BT.ry)}, l = {x:f.z, z:-f.x};
  const toBody = kind === "punch" ? 0 : sstep(ct, ct + .25, tau);
  for (let s = 1; s >= -1; s -= 2){
    let hx = bx + l.x*s*.045*sc - f.x*.08*sc, hy = by + (kind === "tip" ? -.11*sc : 0), hz = bz + l.z*s*.045*sc - f.z*.08*sc;
    if (low){ hy = by - .02*sc; hx = bx + l.x*s*.06*sc + f.x*.05*sc; hz = bz + l.z*s*.06*sc + f.z*.05*sc; }
    if (kind === "punch"){
      const two = st.hands !== 1, ext = .25*sc*sstep(ct - .1, ct, tau)*(1 - sstep(ct + .15, dur, tau));
      if (!two && s > 0){ hx = BT.gx + l.x*.25*sc; hy = BT.gy + 1.2*sc + rise*sc; hz = BT.gz + l.z*.25*sc; }
      else { const dir = st.dir ? st.dir : f; hx = bx - f.x*.1*sc + l.x*s*(two ? .06 : 0)*sc + dir.x*ext; hz = bz - f.z*.1*sc + l.z*s*(two ? .06 : 0)*sc + (dir.z || 0)*ext; }
    }
    // before contact: from the ready hands, meeting the ball's point at contact
    const k = sstep(0, ct*.9, tau);
    toW(s*.28, 1.0 - .12 + rise, .32, _w);
    let x = lerp(_w.x, hx, k), y = lerp(_w.y, hy, k), z = lerp(_w.z, hz, k);
    // after: toward the chest (the ball held), elbows giving over 0.10 s
    if (toBody > 0){ toW(s*.07, 1.18 + rise + T[61] + .12, .22, _w); x = lerp(x, _w.x, toBody); y = lerp(y, _w.y, toBody); z = lerp(z, _w.z, toBody); }
    handTo(h, T, s, x, y, z, [.8, -.3, -.6]);
  }
  lookAt(h, T, bx, by, bz, 1 - toBody*.5);
  // feet: planted, or off the ground through the jump (they come back down where they left); the barrier's trailing knee down
  const F = C.feet;
  for (let j = 0; j < 2; j++){
    const ff = F[j], f0 = d.f0[j], s = j ? -1 : 1;
    ff.x = f0.x; ff.z = f0.z; ff.y = f0.y + (jump ? Math.max(0, jump.y - .02*sc) : 0); ff.yaw = f0.yaw; ff.pitch = jump && jump.air ? .4 : 0; ff.roll = 0; ff.w = 1;
    if (kind === "barrier" && j === 1){
      // the trailing knee down beside the locked lead heel
      toB(d.f0[0].x, d.f0[0].y, d.f0[0].z, _b);
      toW(_b.x - .25, D.ankY + .02, _b.z - .35*w, _w);
      ff.x = lerp(f0.x, _w.x, w); ff.z = lerp(f0.z, _w.z, w); ff.pitch = .9*w;
    }
    if (kind === "smother"){ ff.w = 1 - sstep(0, ct, tau); }
    if (kind === "tip"){
      // the backpedal step: the feet go back 0.25 m before the jump
      toB(f0.x, f0.y, f0.z, _b); toW(_b.x, _b.y, _b.z - .25*sstep(0, .14, tau), _w); ff.x = _w.x; ff.z = _w.z;
    }
    if (ff.w > 0) legW(h, T, s, ff.x, ff.y, ff.z, ff.yaw, ff.pitch, 0);
  }
  lockFeet(h, C);
  h.gw = kind === "smother" ? sstep(.1, ct, tau) : low ? .0 : 0;
}
const _J = {y:0, vy:0, air:false};
function gkcatch(h, T, st, dt){ const k = st.height === "high" ? "high" : "chest", c = GKM.catch[k]; handsClip(h, T, st, dt, "gkcatch", c[0], c[1], k); }
function gkcollect(h, T, st, dt){ const k = GKM.collect[st.style] ? st.style : "scoop", c = GKM.collect[k]; handsClip(h, T, st, dt, "gkcollect", c[0], c[1], k); }
function gkpunch(h, T, st, dt){ handsClip(h, T, st, dt, "gkpunch", GKM.punch[0], GKM.punch[1], "punch"); }
function gktip(h, T, st, dt){ handsClip(h, T, st, dt, "gktip", GKM.tip[0], GKM.tip[1], "tip"); }

/* ---------- distribution ---------- */
function gkdistribute(h, T, st, dt){
  const kind = GKM[st.kind] && st.kind !== "throw" && st.kind !== "roll" && st.kind !== "punt" && st.kind !== "dropkick" ? "throw" : st.kind || "throw";
  const c = GKM[kind] || GKM.throw;
  _spec.dur = c[0]; _spec.contact = c[1]; _spec.pre = 0; _spec.events = kind === "punt" || kind === "dropkick" ? [[EV.RELEASE, .2]] : null;
  const C = clock(h, "gkdistribute", st, _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, tau = C.tau, rel = c[1];
  if (!d.init){ d.init = true; startFeet(h, C); d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw})); }
  // a throw or a roll lets go at the clip's contact (RELEASE then, as the strike's CONTACT)
  if ((kind === "throw" || kind === "roll") && (h.ev.mask & EV.CONTACT)){ C.fired |= EV.RELEASE; h.ev.mask |= EV.RELEASE; }
  const F = C.feet;
  // a step forward with the left foot through the action
  const stepK = sstep(.05, rel, tau);
  for (let j = 0; j < 2; j++){
    const ff = F[j], f0 = d.f0[j];
    const fwd = j === 0 ? (kind === "roll" ? .55 : .45)*stepK : 0;
    toB(f0.x, f0.y, f0.z, _b); toW(_b.x, _b.y, _b.z + fwd, _w);
    ff.x = _w.x; ff.z = _w.z; ff.y = f0.y + (j === 0 ? .06*sc*bump(clamp(tau/rel, 0, 1)) : 0); ff.yaw = f0.yaw; ff.pitch = 0; ff.roll = 0; ff.w = 1;
  }
  if (kind === "throw"){
    // overarm: the ball back behind the head in the right hand, the left arm pointing the way, then over the top
    const back = kf(tau, [[0, 0], [.35, 1], [rel, 0], [.9, -.3]]);
    T[61] = -.05 - .05*stepK; T[62] = .1*stepK;
    R3(T, B.hips, .05, -.4*back, 0); R3(T, B.spine, .1 - .15*back + .2*sstep(rel - .1, .9, tau), -.3*back, 0); R3(T, B.chest, 0, -.2*back, 0);
    armPose(T, -1, .5, kf(tau, [[0, .3], [.35, -.6], [rel - .08, 2.4], [rel, 2.9], [.9, 1.0]]), kf(tau, [[0, .5], [.35, 1.6], [rel, .2], [.9, .4]]));
    armPose(T, 1, .3, kf(tau, [[0, .3], [.35, 1.5], [rel, .5], [.9, .2]]), .3);
  } else if (kind === "roll"){
    // underarm, low: the body bows to the grass, the ball let go by the front foot
    const bow = kf(tau, [[0, 0], [.3, .4], [rel, .9], [.8, .3]]);
    T[61] = -.3*bow; T[62] = .05*bow;
    R3(T, B.hips, .4*bow); R3(T, B.spine, .35*bow); R3(T, B.chest, .1*bow);
    armPose(T, -1, .25, kf(tau, [[0, .2], [.3, -.7], [rel, .9], [.8, .6]]), .15);
    armPose(T, 1, .4, .3, .5);
  } else {
    // punt and drop kick: the ball held out, dropped at 0.20, struck on the volley path by the right foot
    const kick = sstep(.25, rel, tau)*(1 - sstep(rel + .15, .95, tau));
    T[61] = -.04; R3(T, B.spine, -.15*kick + .05); R3(T, B.chest, -.05*kick);
    armPose(T, 1, .9, .3 + .4*sstep(.15, .3, tau), .3); armPose(T, -1, .9, .3 + .4*sstep(.15, .3, tau), .3);
    const f1 = F[1], f0 = d.f0[1];
    toB(f0.x, f0.y, f0.z, _b);
    const swing = kf(tau, [[0, 0], [.25, -.35], [rel, .45], [rel + .25, .9], [1, .2]]), up = kf(tau, [[0, 0], [.25, .35], [rel, kind === "punt" ? .55 : .15], [rel + .25, 1.0], [1, 0]]);
    toW(_b.x, D.ankY + up, _b.z + swing, _w); f1.x = _w.x; f1.y = _w.y; f1.z = _w.z; f1.pitch = .8*kick; f1.w = 1;
  }
  for (let j = 0; j < 2; j++){ const ff = F[j]; legW(h, T, j ? -1 : 1, ff.x, ff.y, ff.z, ff.yaw, ff.pitch, 0); }
  lockFeet(h, C);
  h.gw = 0;
}

/* ---------- events between full poses (as moves.js) ---------- */
export function gkEvents(h, st){
  if (!st || h.mode !== st.mode || !h.mv || h.mv.key !== st.mode) return h.ev;
  // the clips advance by their own clock (idempotent): only their timing is needed
  const m = st.mode;
  if (m === "gkdive" && st.plan){
    const TT = gkDiveTimes(st.plan, st);
    _spec.dur = TT.end; _spec.contact = st.plan.tc; _spec.pre = 0; _spec.events = st.plan.kind === "stand" ? null : [[EV.TAKEOFF, st.plan.tLoad], [EV.LAND, TT.land]];
    clock(h, m, diveSt(st), _spec);
  }
  return h.ev;
}

/* ---------- registration ---------- */
const plant = plantOut;
export const GK_MODES = {
  gkready:registerMode("gkready", gkready, {blend:.25, low:true}),
  gkset:registerMode("gkset", gkset, {blend:.12, low:true}),
  gkdive:registerMode("gkdive", gkdive, {blend:.06, plant, low:true}),
  gkcatch:registerMode("gkcatch", gkcatch, {blend:.12, plant, low:true}),
  gkcollect:registerMode("gkcollect", gkcollect, {blend:.12, plant, low:true}),
  gkpunch:registerMode("gkpunch", gkpunch, {blend:.12, plant, low:true}),
  gktip:registerMode("gktip", gktip, {blend:.12, plant, low:true}),
  gkdistribute:registerMode("gkdistribute", gkdistribute, {blend:.2, plant})
};
GK_MODES.gkdive.events = gkEvents;
