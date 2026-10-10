/* ============ Football: the match through your eyes ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (matchcam.js: the camera owners match-fp 40 and match-bench 41),
   1.4.2 (camera owners and kicks), 1.5.9 (camera numbers), 3.5.9 (head bob from the body's own pelvis, the clips'
   camera channels); addendum A1.2 (speed you can feel), A1.3 (fatigue you can see), A1.5 (the cinematic owner for a
   third-person shot of an acrobatic strike).

   match-fp: your eye, 1.68 m times your height over where your agent stands (between its last two fixed steps), a
   little ahead of the neck as the head bends to look down; the bob from your first-person body's own pelvis (the
   gait the simulation drives), a small nod on each footfall, a lean with acceleration, the clips' own camera channels
   (a strike's dip, a header's nod), and the action springs (a shot's backswing, the strike, a slide's drop). Nothing
   here ever writes where you look (P.yaw, P.pitch): every offset goes on top, eased, so the view never turns by
   itself. No random shake: the trauma of a hit is a fixed wobble that dies away.
   match-bench: seated in the dugout (eye 1.18 m), the look held within 100 degrees of the pitch and 30 down to 20 up.
   match-cine: a third-person shot for a moment worth seeing (an overhead kick in slow motion), above both.

   Speed you can feel (A1.2), one implementation for the match and the life camera (speedFx): every effect follows
   the share of YOUR OWN top speed, eased in and out, never switched by a key: the field of view widens by up to 5
   degrees over the last 20%, speed lines at the screen's edges above 85% (fphud draws them from FX.lines), a low
   sway that rises with speed, the bob's rhythm from the gait. The "Camera motion and effects" setting scales all of
   it (0 turns it off). Fatigue (A1.3): below 40 breath a vignette creeps in (fphud), below 20 it pulses with the
   breathing and the footfalls land heavier and uneven; empty, the view sways a little.

   First-person striking (A1.7, WP-F2): the wind-up is seen. While a shot or a pass is held your first-person body
   draws its kicking leg back (the thigh back, the knee bent, the hips opening, the other arm out for balance), as far
   as the charge has gone; held past full the body leans back and the view trembles a little. After your own shot or
   cross the head follows the ball for a moment (on top of where you look; moving the mouse takes the look back where
   the head has turned, so nothing jumps). On the bench (seated) your own legs are not drawn under the eye. */
import {P, RT} from "../core/state.js";
import {camPush, camPop, camKick} from "../core/camera.js";
import {dirOf, wrapA} from "./pitchspec.js";
import {EV} from "../human.js";
import {THREE} from "../build.js";
import {CTRL} from "./control.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const lerp = (a, b, t) => a + (b - a)*t;
const DEG = Math.PI/180;

// 1.5.9 and A1.2 numbers
export const CAM = Object.freeze({
  EYE: 1.68, BENCH_EYE: 1.18, NEAR: .1,
  FOV: 78, FOV_SPRINT: 5, FOV_FROM: .8, FOV_RATE: 5,          // up to +5 degrees over the last 20% of your top speed
  LINES_FROM: .85,                                             // speed lines from 85% of your top speed
  NOD: .15*DEG, NOD_W: 30,                                     // a footfall's nod: 0.15 degrees x min(1, v/8)
  TILT: .015, TILT_MAX: .03,                                   // the lean with acceleration: -0.015 rad per m/s2, at most 0.03
  SWAY: .25*DEG,                                               // the sway at full speed (yaw and roll, with the stride)
  ACT_MAX_A: 3*DEG, ACT_MAX_D: .06, ACT_W: 12,                 // the action springs: held within 3 degrees and 6 cm
  BENCH_YAW: 100*DEG, BENCH_UP: 20*DEG, BENCH_DOWN: 30*DEG,
  VIG_FROM: 40, VIG_MAX: .92, DESAT: .38,                      // the fatigue vignette from 40 breath down; the grey near empty
  // the wind-up (A1.7): the kicking thigh back, the knee bent, the foot, the hips opening, the other arm out (radians at
  // a full charge; a pass draws it back 60% as far); the view dips with the charge and leans back held past full
  WIND: Object.freeze({THIGH: .62, KNEE: 1.25, FOOT: .35, HIPS: .2, ARM: .7, LEAN: .14, PITCH: -1.4*DEG, DZ: -.03,
    OVER_PITCH: 2.2*DEG, TREMBLE: .22*DEG}),
  // the head following your shot (A1.7): at most this far from where you look, turning at most this fast
  FOLLOW: Object.freeze({YAW: 40*DEG, PITCH: 22*DEG, RATE: 34*DEG, HOLD: 1.3, BACK: .5})
});

/* ---------- speed and breath you can feel (A1.2, A1.3), the one implementation ----------
   share: speed over your own top speed (0..1+); breath: the stamina pool's B (0..100); motion: the setting (0..1);
   dt: seconds. Fills and returns FX: fov (degrees to add), lines (0..1, the edge streaks), sway (0..1), vig (0..1,
   the fatigue vignette), pulse (0..1, its beat), heavy (0..1, the footfalls' weight), wind (0..1, the audio). */
export const FX = {share:0, fov:0, lines:0, sway:0, vig:0, pulse:0, heavy:0, wind:0, top:0, topT:0, beat:0, desat:0};
export function speedFx(share, breath, motion, dt, out = FX){
  const s = clamp(share || 0, 0, 1.2), k = clamp(motion == null ? 1 : motion, 0, 1);
  const ease = 1 - Math.exp(-CAM.FOV_RATE*Math.max(0, dt || 0));
  out.share += (s - out.share)*ease;
  const sh = out.share;
  out.fov = CAM.FOV_SPRINT*sstep(CAM.FOV_FROM, 1, sh)*k;
  out.lines = sstep(CAM.LINES_FROM, 1, sh)*k;
  out.sway = sh*sh*k;
  out.wind = sstep(.35, 1, sh)*k;
  // a subtle pulse the moment you reach your top speed (once, until you drop under 95% again)
  if (sh >= .985 && !out.top){ out.top = 1; out.topT = .35; }
  else if (sh < .95) out.top = 0;
  out.topT = Math.max(0, out.topT - (dt || 0));
  // the breath: a soft vignette under 40, darker and beating with the breathing under 20 (it starts earlier when the
  // cap is low: the pool can never fill past it), a little grey at the edges near empty
  const B = breath == null ? 100 : breath;
  out.beat = (out.beat + (dt || 0)*(1.1 + 1.4*(1 - sstep(0, 40, B))))%1;
  // (A1.6: the vignette reads from 40 down, a steady ramp, not a faint one that only shows near empty)
  const v1 = clamp((CAM.VIG_FROM - B)/CAM.VIG_FROM, 0, 1), v2 = 1 - sstep(0, 20, B);
  out.vig = CAM.VIG_MAX*Math.pow(v1, .8);
  out.pulse = v2*(.5 + .5*Math.sin(out.beat*2*Math.PI));
  out.heavy = v2;
  // a little grey at the edges under 25 (fphud applies it to the picture)
  out.desat = CAM.DESAT*(1 - sstep(0, 25, B));
  return out;
}

/* ---------- the state of the camera ---------- */
// src: what the controller hands over (set by camInit): {me() -> agent | null, view() -> V | null, eye() -> {x, y, z}
// or null (the controller's own eye before the agent is on the pitch), speed() -> m/s, top() -> your top speed,
// breath() -> B, accel() -> m/s2 along your way, bench() -> {x, z, yaw} | null, motion() -> 0..1, fov() -> degrees}
let SRC = null;
export const MC = {
  fov:CAM.FOV, on:false, bench:false,
  // the bob (from the first-person body's pelvis)
  bob:{mean:null, x:0, y:0, nods:0},
  // the action springs: pitch (rad), dy, dz (m), roll; their targets and how long they are held
  act:{p:0, pv:0, y:0, yv:0, dz:0, dzv:0, r:0, rv:0, tp:0, ty:0, tdz:0, tr:0, hold:0},
  // the wind-up as drawn (eased toward control.js CTRL.wind), and the head following the ball after your strike
  wind:{k:0, over:0, side:"R"}, follow:{on:false, t:0, y:0, p:0, seq:-1, yaw:0, pitch:0},
  // the trauma of a hit (0..1, squared for the amplitude), and the offsets this frame (for the tests)
  trauma:0, tt:0, off:{p:0, y:0, r:0, dy:0, dz:0}, last:{p:0, y:0, r:0},
  tilt:0, sway:0, t:0,
  // the cinematic shot (A1.5): {t, dur, frame(dt, cam, k)} while one runs
  cine:null
};

// once per match (controller.js)
export function camInit(src){
  SRC = src;
  MC.bob.mean = null; MC.bob.x = MC.bob.y = 0; MC.trauma = 0; MC.cine = null;
  MC.wind.k = MC.wind.over = 0; const F = MC.follow; F.on = false; F.y = F.p = 0; F.seq = -1;
  const a = MC.act; for (const k in a) a[k] = 0;
  camPush(FP_OWNER);
  MC.on = true;
}
export function camDispose(){
  camPop("match-fp"); camPop("match-bench"); camPop("match-cine");
  MC.on = false; MC.bench = false; MC.cine = null; SRC = null;
}
export function benchCam(on){
  if (on === MC.bench) return;
  MC.bench = on;
  if (on) camPush(BENCH_OWNER); else camPop("match-bench");
}

/* ---------- the action springs (1.5.9): eased offsets, never an impulse that jumps a frame ----------
   kind: 'backswing' (a shot charging), 'strike' (contact), 'pass' (half the strike), 'header', 'slide', 'fouled',
   'chest', 'land'. Every number scaled by the motion setting and held within 3 degrees and 6 cm. */
const ACTS = {
  backswing:{p:-2.5, dz:-.04, hold:.25}, strike:{p:1.5, dz:.06, hold:.12}, pass:{p:.75, dz:.03, hold:.1},
  header:{p:-4, dy:0, hold:.12}, slide:{dy:-.06, hold:.5}, fouled:{p:6, hold:.4}, chest:{dy:-.03, hold:.15},
  land:{dy:-.03, hold:.08}
};
export function camAction(kind){
  const A = ACTS[kind]; if (!A || !SRC) return;
  const k = SRC.motion ? clamp(SRC.motion(), 0, 1) : 1, a = MC.act;
  a.tp = clamp((A.p || 0)*DEG*k, -CAM.ACT_MAX_A, CAM.ACT_MAX_A); a.ty = clamp((A.dy || 0)*k, -CAM.ACT_MAX_D, CAM.ACT_MAX_D);
  a.tdz = clamp((A.dz || 0)*k, -CAM.ACT_MAX_D, CAM.ACT_MAX_D); a.tr = 0; a.hold = A.hold || .2;
}
// a hit (a shot struck, a tackle, a collision, a hard plant, a landing): trauma that dies away, squared
export function camTrauma(v){ const k = SRC && SRC.motion ? clamp(SRC.motion(), 0, 1) : 1; MC.trauma = clamp(MC.trauma + v*k, 0, 1); }

// a critically damped spring of stiffness w toward a target (no impulse: it starts from rest and never overshoots)
function toward(o, kx, kv, target, w, dt){
  const x = o[kx] - target, v = o[kv], e = Math.exp(-w*dt);
  o[kx] = target + (x + (v + w*x)*dt)*e;
  o[kv] = (v - w*(v + w*x)*dt)*e;
}

/* ---------- match-fp ---------- */
const _v = {x:0, y:0, z:0};
function fpFrame(dt, cam){
  if (!SRC) return;
  const a = SRC.me ? SRC.me() : null, V = SRC.view ? SRC.view() : null;
  const s = a ? a.scale || 1 : 1;
  const motion = SRC.motion ? clamp(SRC.motion(), 0, 1) : 1;
  // the eye: over your feet (the agent between its steps, or the controller's own walk), ahead of the neck
  const e = SRC.eye ? SRC.eye(_v) : null;
  const x = e ? e.x : P.x, z = e ? e.z : P.z, y0 = e ? e.y : P.eye;
  const ahead = (.07 + .15*sstep(.75, 1.35, -P.pitch))*s, f = dirOf(P.yaw);
  // the first-person body under the eye, posed first so its pelvis this frame gives the bob
  let ev = 0, h = null;
  if (V && V.fp && SRC.pose){ ev = SRC.pose(x, z, P.yaw, dt) || 0; h = V.fp; }
  const v = SRC.speed ? SRC.speed() : 0, top = SRC.top ? Math.max(1, SRC.top()) : 8, B = SRC.breath ? SRC.breath() : 100;
  // the wind-up drawn on your body (A1.7), and the head following your own strike
  windup(h && h.g.visible ? h : null, dt, v);
  follow(a, V, x, y0, z, dt);
  speedFx(v/top, B, motion, dt);
  // the bob (3.5.9, 1.5.9): the pelvis against its running mean, held within 0.006 + 0.0016 v; heavier and uneven when
  // the breath is gone (A1.3); nothing standing still
  const bob = MC.bob, G = h && h.gait;
  if (G){
    const dy = (G.hipDy || 0)*s, mv = sstep(.05, .5, v);
    if (bob.mean == null) bob.mean = dy;
    bob.mean += (dy - bob.mean)*(1 - Math.exp(-2.5*dt));
    const heavy = 1 + .45*FX.heavy, A = (.006 + .0016*v)*heavy, k = lerp(.45, .32, G.R || 0);
    bob.y = clamp(k*(dy - bob.mean)*heavy, -A, A)*mv*(.35 + .65*motion);
    bob.x = clamp(-.35*(G.hipLat || 0)*s, -.006, .006)*mv*(.35 + .65*motion);
    if ((ev & EV.FOOTFALL) && v > .3){
      bob.nods++;
      // a footfall's nod (the uneven, heavier landings of an empty tank: every other one harder)
      const uneven = FX.heavy > 0 ? 1 + .6*FX.heavy*((bob.nods & 1) ? 1 : -.4) : 1;
      camKick({pitch:-CAM.NOD*Math.min(1, v/8)*uneven*(.4 + .6*motion), w:CAM.NOD_W});
    }
  } else { bob.x *= .8; bob.y *= .8; }
  // the lean with acceleration (forward when speeding up, back when braking), eased
  const acc = SRC.accel ? SRC.accel() : 0;
  MC.tilt += (clamp(-CAM.TILT*acc, -CAM.TILT_MAX, CAM.TILT_MAX)*motion - MC.tilt)*(1 - Math.exp(-6*dt));
  // the action springs
  const A = MC.act;
  if (A.hold > 0){ A.hold -= dt; if (A.hold <= 0){ A.tp = A.ty = A.tdz = A.tr = 0; } }
  toward(A, "p", "pv", A.tp, CAM.ACT_W, dt); toward(A, "y", "yv", A.ty, CAM.ACT_W, dt); toward(A, "dz", "dzv", A.tdz, CAM.ACT_W, dt);
  toward(A, "r", "rv", A.tr, CAM.ACT_W, dt);
  // the trauma: a fixed wobble (two sines that never line up), squared, dying away over about half a second
  MC.t += dt; MC.trauma = Math.max(0, MC.trauma - 1.8*dt);
  const tr = MC.trauma*MC.trauma, wob = .9*DEG*tr;
  // the sway: low, with the stride, rising with speed; and the slight sway of an empty tank (A1.2, A1.3)
  const ph = G ? (G.phi || 0)*2*Math.PI : MC.t*2;
  const sw = CAM.SWAY*(FX.sway + .6*FX.heavy*(B < 5 ? 1 : 0));
  // the clips' own camera channels (a strike's pitch and dip, a header's nod, a chest receive): the body's
  const cf = h && h.camFx && SRC.clip && SRC.clip() ? h.camFx : null;
  // the wind-up: the view dips a little with the charge; held past full it leans back and trembles (A1.7)
  const WK = CAM.WIND, wk = MC.wind.k*motion, wo = MC.wind.over*motion;
  const op = (cf ? cf.pitch + cf.nod : 0) + A.p + MC.tilt + wob*Math.sin(MC.t*23.7) + WK.PITCH*wk + WK.OVER_PITCH*wo + WK.TREMBLE*wo*Math.sin(MC.t*61);
  const oy = sw*Math.sin(ph) + wob*.6*Math.sin(MC.t*17.3 + 1.3) + WK.TREMBLE*wo*Math.sin(MC.t*53 + .4);
  const or = sw*.8*Math.sin(ph + .7) + A.r + (cf ? cf.roll*.3 : 0);
  const ody = (cf ? cf.dip : 0) + A.y + bob.y, odz = A.dz;
  MC.last.p = MC.off.p; MC.last.y = MC.off.y; MC.last.r = MC.off.r;
  MC.off.p = clamp(op, -CAM.ACT_MAX_A, CAM.ACT_MAX_A); MC.off.y = clamp(oy, -CAM.ACT_MAX_A, CAM.ACT_MAX_A); MC.off.r = clamp(or, -CAM.ACT_MAX_A, CAM.ACT_MAX_A);
  MC.off.dy = clamp(ody, -CAM.ACT_MAX_D, CAM.ACT_MAX_D); MC.off.dz = clamp(odz + WK.DZ*wk, -CAM.ACT_MAX_D, CAM.ACT_MAX_D);
  // place it: the eye with the bob across the view (x) and up (y), then the offsets about its own axes
  const c = Math.cos(P.yaw), sn = Math.sin(P.yaw);
  cam.position.set(x + f.x*ahead + c*bob.x, y0 - .035*sstep(.3, 1.2, -P.pitch), z + f.z*ahead - sn*bob.x);
  const Fo = MC.follow;
  cam.rotation.set(clamp(P.pitch + Fo.p, -1.45, 1.45), P.yaw + Fo.y, 0, "YXZ");
  cam.rotateY(MC.off.y); cam.rotateX(MC.off.p); cam.rotateZ(MC.off.r);
  if (MC.off.dy) cam.translateY(MC.off.dy);
  if (MC.off.dz) cam.translateZ(-MC.off.dz);
  MC.fov = (SRC.fov ? SRC.fov() : CAM.FOV) + FX.fov;
  if (SRC.after) SRC.after(dt, cam);
}
const FP_OWNER = {id:"match-fp", priority:40, frame:fpFrame, fov:() => Math.round(MC.fov*20)/20, near:CAM.NEAR};

/* ---------- the wind-up on your body (A1.7) ----------
   Laid over the pose the body has this frame (after view.js fpPose, before it is drawn): the kicking thigh drawn back
   and the knee bent as far as the charge has gone, the foot pointed, the hips turning open and the other arm going
   out, the chest leaning back when held past full. Eased in as the button is held and out fast once it is let go (the
   strike's own swing, moves.js, takes over). A running body draws it back about half as far: its stride has the leg. */
const WQ = new THREE.Quaternion(), WA = new THREE.Vector3();
function turnBone(b, x, y, z, a){
  if (!b || !a) return;
  WA.set(x, y, z); WQ.setFromAxisAngle(WA, a);
  b.quaternion.premultiply(WQ); b.updateMatrix();
}
export const WSIGN = {thigh: 1, knee: 1, foot: 1, hips: 1, arm: 1, lean: 1};
function windup(h, dt, v){
  const W = CTRL.wind, Mw = MC.wind;
  const want = W.kind === "shot" ? W.p : W.kind === "pass" ? .6*W.p : 0;
  Mw.k += (want - Mw.k)*(1 - Math.exp(-(want > Mw.k ? 14 : 24)*Math.max(0, dt)));
  Mw.over += ((W.kind ? W.over : 0) - Mw.over)*(1 - Math.exp(-10*Math.max(0, dt)));
  if (want > 0) Mw.side = W.side === "L" ? "L" : "R";
  if (!h || !h.bones || Mw.k < .01) return;
  const K = CAM.WIND, k = Mw.k*(1 - .5*sstep(3, 7, v)), L = Mw.side === "L", Bn = h.bones, s = L ? 1 : -1, S = WSIGN;
  // (bone axes: the rig's body frame, +X the body's left, +Y up, +Z forward; a turn about +X takes a hanging leg back)
  turnBone(Bn[L ? 12 : 16], 1, 0, 0, S.thigh*K.THIGH*k);
  turnBone(Bn[L ? 13 : 17], 1, 0, 0, S.knee*K.KNEE*k);
  turnBone(Bn[L ? 14 : 18], 1, 0, 0, S.foot*K.FOOT*k);
  turnBone(Bn[1], 0, 1, 0, S.hips*-s*K.HIPS*k);
  turnBone(Bn[L ? 9 : 6], 0, 0, 1, S.arm*s*K.ARM*k);
  turnBone(Bn[3], 1, 0, 0, S.lean*-K.LEAN*Mw.over);
}

/* ---------- the head following your strike (A1.7) ----------
   After your own shot, cross or lofted ball the head turns after the ball for a moment (HOLD seconds), at most FOLLOW.YAW
   and .PITCH off where you look and at most .RATE a second, then comes back. It sits on top of P.yaw and P.pitch; a
   look of your own (the mouse moved them) takes over from where the head is, so the view never jumps */
function follow(a, V, x, y, z, dt){
  const F = MC.follow, ms = V && V.ms, K = CAM.FOLLOW;
  if (F.on && (P.yaw !== F.yaw || P.pitch !== F.pitch)){
    P.yaw = wrapA(P.yaw + F.y); P.pitch = clamp(P.pitch + F.p, -1.35, 1.35);
    F.on = false; F.y = F.p = 0;
  }
  if (a && ms && ms.kick && ms.kick.seq !== F.seq){
    F.seq = ms.kick.seq;
    const ev = ms.kick.ev, it = ev && ev.intent;
    if (ms.kick.agent === a.id && ev && !ev.whiff && (it === "shot" || it === "cross" || it === "lob" || (it === "header" && ev.atGoal))){ F.on = true; F.t = 0; }
  }
  if (!F.on || !ms){ F.y *= .8; F.p *= .8; if (Math.abs(F.y) + Math.abs(F.p) < 1e-4){ F.y = F.p = 0; } F.yaw = P.yaw; F.pitch = P.pitch; return; }
  F.t += dt;
  const b = ms.ball.p, bx = b.x + (V.ox || 0), bz = b.z + (V.oz || 0), dx = bx - x, dz = bz - z;
  const w = F.t < K.HOLD ? sstep(0, .2, F.t) : 1 - sstep(K.HOLD, K.HOLD + K.BACK, F.t);
  const ty = clamp(wrapA(Math.atan2(-dx, -dz) - P.yaw), -K.YAW, K.YAW)*w;
  const tp = clamp(Math.atan2(b.y - y, Math.hypot(dx, dz)) - P.pitch, -K.PITCH, K.PITCH)*w;
  const mx = K.RATE*Math.max(0, dt);
  F.y += clamp(ty - F.y, -mx, mx); F.p += clamp(tp - F.p, -mx, mx);
  if (F.t > K.HOLD + K.BACK){ F.on = false; F.y = F.p = 0; }
  F.yaw = P.yaw; F.pitch = P.pitch;
}

/* ---------- match-bench ---------- */
function benchFrame(dt, cam){
  if (!SRC) return;
  const b = SRC.bench ? SRC.bench() : null;
  if (!b){ fpFrame(dt, cam); return; }
  // seated: your own first-person body is not drawn under the eye (its legs would fill the view, A1.6); the pose call
  // is what hides it (the controller's pose says so while you sit)
  const V = SRC.view ? SRC.view() : null;
  if (V && V.fp && SRC.pose) SRC.pose(b.x, b.z, P.yaw, dt);
  if (V && V.fp && V.fp.g.visible && !V.fpOn) V.fp.g.visible = false;
  cam.position.set(b.x, (b.y || 0) + CAM.BENCH_EYE, b.z);
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  MC.fov = SRC.fov ? SRC.fov() : CAM.FOV;
  if (SRC.after) SRC.after(dt, cam);
}
// the look on the bench: within 100 degrees of facing the pitch, 30 down to 20 up (the controller's look() calls it)
export function benchClamp(yaw0){
  const d = wrapA(P.yaw - yaw0);
  if (Math.abs(d) > CAM.BENCH_YAW) P.yaw = wrapA(yaw0 + Math.sign(d)*CAM.BENCH_YAW);
  P.pitch = clamp(P.pitch, -CAM.BENCH_DOWN, CAM.BENCH_UP);
}
const BENCH_OWNER = {id:"match-bench", priority:41, frame:benchFrame, fov:() => Math.round(MC.fov*20)/20, near:CAM.NEAR};

/* ---------- match-cine: a third-person shot (A1.5) ----------
   o = {dur, frame(dt, cam, k) (k: 0..1 through the shot)}: on top of both match owners until it ends (or cineStop) */
export function cineShot(o){
  MC.cine = {t:0, dur:o.dur || 2, frame:o.frame, done:o.done || null};
  camPush(CINE_OWNER);
}
export function cineStop(){ if (!MC.cine) return; const d = MC.cine.done; MC.cine = null; camPop("match-cine"); if (d) d(); }
function cineFrame(dt, cam){
  const C = MC.cine; if (!C){ camPop("match-cine"); return; }
  C.t += dt;
  const k = clamp(C.t/C.dur, 0, 1);
  if (C.frame) C.frame(dt, cam, k);
  if (k >= 1) cineStop();
}
const CINE_OWNER = {id:"match-cine", priority:90, frame:cineFrame, fov:() => 50, near:CAM.NEAR};

// where the camera is looking from, for the HUD's projections and the audio (the controller reads it after a frame)
export const camNow = () => RT.cam;
