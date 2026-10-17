/* ============ LIFE: football moves ============
   Owner: WP-K (Stage P2). Contract: DESIGN 1.4.18 (moves.js: planStrike, the football modes registered through
   human.js registerMode), 3.5.7 (football actions), 3.5.6 (constraint order), 3.5.9 (match bodies, camera channels);
   addendum A1.5 (volley, side volley, header and diving header with the striking part IK-guided to the predicted
   contact point; rig hooks and first real motion for the scissor, the overhead bicycle and the rabona).
   WP-D3 (Stage P3a, DESIGN 2.7's hook queue rows deferred to P3; addendum A1.7): the held backswing (st.hold, WIND,
   windHold, windUpper: the wind-up as the strike clip's own pose) and the plant of a fast run-up landing on its point.

   Every move here is a clip on the shared rig (rig.js) posed by human.js's pipeline: this file writes the base pose (in
   Euler, the way the other clips are written) and keeps both feet as world points (h.locks, planted or on their way)
   that human.js's plant pass holds them to after the blend (plantLegs: after inertialisation, before the floor), so
   a planted foot never slides and a striking foot is where the ball will be, whatever the blend still carries.

   ---- timing (3.5.7 contact scheduling) ----
   Clips are time based: each has dur and contact in seconds at rate 1. st.tc, when given, is the time from now to the
   contact the simulation has scheduled (a countdown, as view.js passes it: (stepContact - step - alpha)/60); the part
   of the clip before contact plays at rate (contact - clipTime)/(time left), clamped to [0.7, 1.4], re-aimed every
   call; after contact it plays at rate 1. The contact event fires at the scheduled moment whatever the pose: when the
   clamp kept the clip from getting there, h.ev.reachErr says by how much (clip seconds; 0 means the pose and the
   schedule agree). Without st.tc the clip runs at rate 1 (st.rate scales it). Legacy st.t (0..1 of the clip) is honoured.
   Events (EV from gait.js): PLANT (the support foot down), TAKEOFF, CONTACT, RELEASE, LAND, END, each with h.ev.at
   (the offset inside the time this call covered, as human.js documents) and h.ev.t (the clip's own time of the event,
   in real seconds from its start, exact at every tier). moveEvents(h, st) is the same bookkeeping without a pose: it
   is set as the modes' .events, so a body between full poses (tiers T2, T3) still gets its events on time.

   ---- modes registered here (st fields) ----
   'strike'  {kind, side, ball, dir, power, curl, lowHigh, tc, plant?}
             kind: 'instep' | 'side' | 'chip' | 'lofted' | 'volley' | 'sidevolley' | 'halfvolley' | 'scissor' |
             'bicycle' | 'rabona' (and the action names 'shot', 'pass', 'cross', 'driven', 'through', 'clear');
             side 'L' | 'R' the striking foot; ball {x, y, z} the ball's centre at contact (world); dir the aim (world
             {x, z} or a yaw); plant {x, z, yaw} the support footprint (planStrike's), else worked out from the ball.
             hold (0..1, with over 0..1): the wind-up held, a shot or a pass being charged (windHold gives the state);
             nothing fires while it is held, and the strike that lets it go starts from it.
   'receive' {part: 'inside' | 'sole' | 'air' | 'thigh' | 'chest', side, ball, tc, cushion, ballV, push, rootV, ballNow}
             (P6-A: the whole-body receive; see RECEIVING below)
   'header'  {jump (0..1), take: 'stand' | 'jump' | 'dive', ball, dir, tc}
   'tackle'  {kind: 'stand' | 'poke' | 'slide' | 'block', side, target {x, y, z} (the contact), tc, reach; a slide's
             v0, decel, dir {x, z} and dur (P2b-B)}
   'throwin' {run}            'celebrate' {style: 'armsUp' | 'fistPump' | 'kneeSlide' | 'runArmsOut'}
   'getup'   {from: 'front' | 'back' | 'side', side}       'tired' (standing, hands on the thighs: st.fatigue > 0.7)
   upper gestures for st.upper: 'call', 'point', 'appeal', 'shield', 'armsOut', 'windup', 'hand' (a hand raised for
   the ball and dropped again, UF-A U10), 'holdBall' (both hands on the ball, UF-A U6), 'ready' (a ball on its way to
   him: the head on it, the chest turned to it, the arms off the body; P6-A) (and the fatigue overlay, fatigueOver).
   Exports: planStrike, runupStep, strikeRoot (the rootSpeed curves the mover applies), moveEvents, KINDS, partPoint
   (a part of the foot or head in world space: what the tests measure), headerPlan, diveHeaderRoot, WIND, windHold,
   windUpper. */
import {THREE} from "./build.js";
import {clamp, lerp, sstep, kf, wrap, B, ARM, LEG, R3, frameOf, legIK, armIK, fkQ, newFK} from "./rig.js";
import {EV, footstep} from "./gait.js";
import {stepLen} from "./gaitcore.js";
import {registerMode} from "./human.js";
import {jumpRoot, slideRoot} from "./football/gkplan.js";

const G = 9.81, BR = .11;             // gravity, the ball's radius (m)

/* ---------- the strikes (3.5.7 timings; acrobatics A1.5) ----------
   dur, contact: seconds at rate 1. plant: [lateral, along] of the support footprint from the ball (m, along the aim; the
   volleys' plant is set from the ball's height by IK). part: the face of the foot that meets the ball. ft: the height of
   the foot at the top of the follow-through (m). lift: how far up the strike goes through the ball (0 drives it flat).
   app: the approach's angle off the aim line (radians). */
export const KINDS = {
  instep:     {dur:.80, contact:.22, plant:[.26, -.08], part:"laces",  ft:.90, lift:.08, app:30, pass:false},
  side:       {dur:.62, contact:.19, plant:[.22, 0],    part:"inside", ft:.40, lift:.02, app:10, pass:true},
  chip:       {dur:.70, contact:.20, plant:[.28, -.22], part:"toe",    ft:.30, lift:.9,  app:20, pass:false},
  lofted:     {dur:.85, contact:.23, plant:[.30, -.15], part:"laces",  ft:1.2, lift:.45, app:35, pass:false},
  volley:     {dur:.70, contact:.20, plant:[.24, -.30], part:"laces",  ft:1.0, lift:.05, app:15, air:true},
  sidevolley: {dur:.80, contact:.24, plant:[.62, -.12], part:"laces",  ft:1.1, lift:.05, app:0,  air:true, side:true},
  halfvolley: {dur:.75, contact:.21, plant:[.25, -.10], part:"laces",  ft:.85, lift:.04, app:20},
  // the acrobatics (A1.5): first real motion on the same hooks; the polish stage times and dresses them
  scissor:    {dur:1.25, contact:.36, plant:[.55, -.25], part:"laces", ft:1.4, lift:.02, app:0,  air:true, side:true, acro:true},
  bicycle:    {dur:1.45, contact:.42, plant:[.10, .25],  part:"laces", ft:1.8, lift:.05, app:0,  air:true, acro:true, over:true},
  rabona:     {dur:.85, contact:.26, plant:[.10, .02],  part:"laces",  ft:.7,  lift:.15, app:25, rabona:true}
};
const ALIAS = {shot:"instep", driven:"instep", pass:"side", through:"side", short:"side", cross:"lofted", long:"lofted", clear:"lofted", lob:"chip"};
export const kindOf = k => KINDS[k] ? k : ALIAS[k] || "instep";

/* the faces of the foot in the foot bone's own frame (body units: the ankle at the origin, +z along the foot, the sole at
   -0.085): the laces 0.06 above the sole, the inside face, the tip of the toes (under the ball for a chip), the sole */
export const PARTS = {laces:[0, -.03, .07], inside:[1, -.045, .035], toe:[0, -.07, .17], sole:[0, -.085, .09], outside:[-1, -.05, .05]};
const partLocal = (part, s, o) => { const p = PARTS[part]; o[0] = p[0] === 0 ? 0 : p[0]*-s*.045; o[1] = p[1]; o[2] = p[2]; return o; };
// the forehead in the head bone's frame
const BROW = [0, .1, .1];

/* ---------- scratch (no allocation in a pose) ---------- */
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _V2 = new THREE.Vector3();
const _pl = [0, 0, 0];

/* ---------- world <-> body space ----------
   Body space: the rig's frame, +X the body's left, +Y up, +Z forward, in units of the 1.80 m frame (the group is
   scaled by h.scale). The group stands at g.position facing ry = g.rotation.y. */
const BT = {gx:0, gy:0, gz:0, c:1, s:0, sc:1, ry:0};
function setBT(h){ const g = h.g; BT.gx = g.position.x; BT.gy = g.position.y; BT.gz = g.position.z; BT.ry = g.rotation.y; BT.c = Math.cos(BT.ry); BT.s = Math.sin(BT.ry); BT.sc = h.scale || 1; }
function toB(x, y, z, o){ const ox = (x - BT.gx)/BT.sc, oz = (z - BT.gz)/BT.sc; o.x = ox*BT.c - oz*BT.s; o.z = ox*BT.s + oz*BT.c; o.y = (y - BT.gy)/BT.sc; return o; }
function toW(x, y, z, o){ o.x = BT.gx + (x*BT.c + z*BT.s)*BT.sc; o.z = BT.gz + (-x*BT.s + z*BT.c)*BT.sc; o.y = BT.gy + y*BT.sc; return o; }
// a world direction (x, z) as a body direction
function dirB(x, z, o){ o.x = x*BT.c - z*BT.s; o.z = x*BT.s + z*BT.c; return o; }
// the world's horizontal unit vectors: forward of a world yaw (the group's convention: (sin, cos)) and its left
const leftOf = (fx, fz, o) => { o.x = fz; o.z = -fx; return o; };
// st.dir: {x, z} or a number (the P.yaw convention of pitchspec: yaw 0 faces -Z)
function aimOf(st, h, o){
  const d = st.dir;
  if (typeof d === "number"){ o.x = -Math.sin(d); o.z = -Math.cos(d); }
  else if (d && (d.x || d.z)){ const l = Math.hypot(d.x, d.z) || 1; o.x = d.x/l; o.z = d.z/l; }
  else { o.x = Math.sin(h.g.rotation.y); o.z = Math.cos(h.g.rotation.y); }
  return o;
}

/* ---------- the joints' own speed limit ----------
   A joint in the air (a swinging leg, a reaching arm) turns no faster than RATE rad/s from the pose last drawn
   (h.pose, the bones as they were written last time): the clips' targets move fast near a contact, and an IK target
   that sweeps past a leg's line can ask for a twist the limb cannot make in one frame. A held leg is limited too
   (see rateLegs). Ceiling 20 rad/s: 0.33 rad a frame at 60 Hz. */
export const RATE = {max:20};
const _Qa = new THREE.Quaternion(), _Qb = new THREE.Quaternion(), _Er = new THREE.Euler();
export function rateLimit(h, T, bones, dt, rate = RATE.max){
  if (!h.posed || !(dt > 0)) return;
  const P = h.pose, lim = rate*Math.min(dt, .1);
  for (let j = 0; j < bones.length; j++){
    const b = bones[j];
    _Qa.set(P[b*4], P[b*4 + 1], P[b*4 + 2], P[b*4 + 3]);
    _Er.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Qb.setFromEuler(_Er);
    const a = _Qa.angleTo(_Qb);
    if (a <= lim) continue;
    _Qa.slerp(_Qb, lim/a);
    _Er.setFromQuaternion(_Qa, "XYZ"); T[b*3] = _Er.x; T[b*3 + 1] = _Er.y; T[b*3 + 2] = _Er.z;
  }
}
const LEGB_L = [12, 13, 14, 15], LEGB_R = [16, 17, 18, 19], TRUNK = [1, 2, 3], ARMS = [4, 5, 6, 7, 8, 9, 10, 11];
// the hips' shift and turn under a speed limit too (vmax in body units a second): a planted leg is solved to them, so
// the hips are what decides how fast its knee turns
export function rateHips(h, T, dt, vmax = 1.2){
  if (!h.posed || !(dt > 0)) return;
  const P = h.pose, lim = vmax*Math.min(dt, .1);
  const dx = T[60] - P[80], dy = T[61] - P[81], dz = T[62] - P[82], dl = Math.hypot(dx, dy, dz);
  if (dl > lim){ const k = lim/dl; T[60] = P[80] + dx*k; T[61] = P[81] + dy*k; T[62] = P[82] + dz*k; }
  rateLimit(h, T, TRUNK, dt, 8);
  rateLimit(h, T, ARMS, dt);
}
// the legs of the feet not held (w 0) under the speed limit
// (a held leg too: the plant pass solves it after, but when the hold ends the pose's own leg takes over from the drawn
// one, and kept within a frame's turn of it there is no snap at the hand-over)
function rateLegs(h, T, C, dt){ if (!C.feet) return; rateLimit(h, T, LEGB_L, dt); rateLimit(h, T, LEGB_R, dt); }

/* ---------- small curves ---------- */
// Hermite from p0 to p1 over u in [0, 1] with end tangents m0, m1 (already times the segment's duration)
const herm = (p0, m0, p1, m1, u) => { const u2 = u*u, u3 = u2*u; return (2*u3 - 3*u2 + 1)*p0 + (u3 - 2*u2 + u)*m0 + (-2*u3 + 3*u2)*p1 + (u3 - u2)*m1; };
const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u*u*(3 - 2*u);
// a cubic Bezier through p0 and p3 with controls p1, p2, at u
const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return v*v*v*p0 + 3*v*v*u*p1 + 3*v*u*u*p2 + u*u*u*p3; };
const bump = u => u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI*u);

/* ---------- the clip clock ----------
   h.mv: the clip running on this body. A new one starts when the mode changes (human.js sets h.at to 0), when st.id
   changes, or when the same mode's clock went backwards. */
function newClip(h, key, st, spec){
  const C = h.mv || (h.mv = {});
  C.key = key; C.id = st.id; C.base = h.at; C.lastAt = h.at; C.lastT = 0; C.tau = spec.pre ? -spec.pre : 0; C.pre = spec.pre || 0; C.back = 0;
  C.dur = spec.dur; C.contact = spec.contact; C.fired = 0; C.contactDone = false; C.reachErr = 0; C.tcAt = NaN; C.rate = 1;
  C.post = st.rate > 0 ? st.rate : 1;
  C.events = spec.events || null;             // [[bit, tau], ...] the clip's own moments (contact excluded)
  C.legacy = st.t != null && st.tc == null;
  C.st = st; C.init = false; C.vx = 0; C.vz = 0; C.rx = h.g.position.x; C.rz = h.g.position.z; C.data = {};
  // (a clip may begin part of the way in: C.tau0, set by its begin, the strike let go from a held wind-up)
  C.tau0 = 0;
  if (spec.begin){ spec.begin(h, C, st); C.tau = C.pre ? -C.pre : C.tau0; }
  if (!C.legacy){ C.tcAt = st.tc != null && isFinite(st.tc) ? Math.max(0, h.at - C.base + st.tc) : (C.contact - C.tau)/C.post; }
  return C;
}
function fire(h, C, bit, tEv, adt, T){
  if (C.fired & bit) return;
  C.fired |= bit;
  h.ev.mask |= bit;
  h.ev.at = clamp(adt - (T - tEv), 0, adt);
  h.ev.t = tEv;
  if (bit === EV.CONTACT) h.ev.reachErr = C.reachErr;
  const L = h.evLog; if (L){ L.push({bit, t:tEv, key:C.key, reachErr:C.reachErr}); if (L.length > 200) L.shift(); }
}
/* advance the clip to now (h.at): idempotent, so the pose and the events can both call it */
function clock(h, key, st, spec){
  let C = h.mv;
  const now = h.at;
  if (!C || C.key !== key || now < C.lastAt - 1e-9 || (st.id != null && st.id !== C.id)){
    // (a clip that starts with its mode began when human.js reset h.at, at the start of this call's time; one restarted
    // by a new st.id inside the same mode begins now)
    const fresh = !C || C.key !== key || now < C.lastAt - 1e-9;
    C = newClip(h, key, st, spec);
    if (fresh && h.mode === key){ C.base = 0; C.lastAt = 0; if (!C.legacy) C.tcAt = st.tc != null && isFinite(st.tc) ? Math.max(0, now + st.tc) : (C.contact - C.tau)/C.post; }
  }
  const T = now - C.base, T0 = C.lastT, dt = T - T0;
  // (the time this call covers: since the last pose or event call, at most dt)
  const adt = Math.max(0, dt);
  if (dt <= 0 && C.init) return C;
  const tau0 = C.tau;
  if (C.legacy){
    C.tau = clamp(+st.t, 0, 1)*C.dur;
    if (!C.contactDone && C.tau >= C.contact){ C.contactDone = true; C.reachErr = 0; fire(h, C, EV.CONTACT, T, adt, T); }
  } else if (!C.contactDone){
    if (st.tc != null && isFinite(st.tc)) C.tcAt = T + st.tc;
    const rem = C.tcAt - T0;
    const rate = rem > 1e-6 ? clamp((C.contact - C.tau)/rem, .7, 1.4) : 1.4;
    C.rate = rate;
    if (T >= C.tcAt - 1e-9){
      const tauC = C.tau + rate*Math.max(0, C.tcAt - T0);
      C.reachErr = Math.abs(C.contact - tauC) < 1e-6 ? 0 : C.contact - tauC;
      C.tau = (C.reachErr === 0 ? C.contact : tauC) + (T - C.tcAt)*C.post;
      C.contactDone = true;
      fire(h, C, EV.CONTACT, C.tcAt, adt, T);
    } else C.tau += rate*dt;
  } else C.tau += dt*C.post;
  // the clip's other moments, by its own time (their real time interpolated inside this step)
  if (C.events){
    for (let i = 0; i < C.events.length; i++){
      const e = C.events[i], bit = e[0], te = e[1];
      if (C.fired & bit) continue;
      if (C.tau >= te - 1e-9 && (tau0 < te || !C.init)){
        // (a moment at the clip's very start fires at it)
        const k = C.tau > tau0 ? clamp((te - tau0)/(C.tau - tau0), 0, 1) : 1;
        fire(h, C, bit, T0 + k*dt, adt, T);
      }
    }
  }
  if (!(C.fired & EV.END) && C.tau >= C.dur){ fire(h, C, EV.END, T, adt, T); }
  // the root's own velocity (for where feet will land): from the group, smoothed
  if (dt > 1e-5 && C.init){
    const vx = (h.g.position.x - C.rx)/dt, vz = (h.g.position.z - C.rz)/dt, k = 1 - Math.exp(-10*dt);
    if (Math.hypot(vx, vz) < 15){ C.vx += (vx - C.vx)*k; C.vz += (vz - C.vz)*k; }
  }
  C.rx = h.g.position.x; C.rz = h.g.position.z;
  C.lastT = T; C.lastAt = now; C.init = true;
  return C;
}

/* ---------- feet as world points ----------
   Each foot is a world ankle point (x, y, z) with a body-space orientation (yaw from the body's forward, pitch toes down,
   roll), kept in C.feet; the pose solves the legs to them and human.js's plant pass holds them there after the blend. */
function footRec(){ return {x:0, y:0, z:0, yaw:0, pitch:0, roll:0, w:1, x0:0, y0:0, z0:0, down:true, kb:1, kt:0, landT:null, wasDown:true}; }
const _FKs = newFK();
function startFeet(h, C){
  const F = C.feet || (C.feet = [footRec(), footRec()]);
  setBT(h);
  // the feet's turn as drawn (body space), so a foot in the air or rolled onto its toes starts from where it is
  if (h.posed) fkQ(h, h.pose, _FKs);
  for (let i = 0; i < 2; i++){
    const L = h.locks[i], f = F[i], s = i ? -1 : 1;
    // (a footprint left far from the body, one put somewhere else since it was last posed, is not where the foot is:
    // the stance under the body is, P2b-B)
    if (L && h.posed && Math.hypot(L.x - BT.gx, L.z - BT.gz) < 1.6*BT.sc){ f.x = L.x; f.y = L.y; f.z = L.z; f.yaw = wrap((L.yaw != null ? L.yaw : BT.ry) - BT.ry); }
    else { toW(s*(h.D.hipX + .02), h.D.ankY, 0, _w3); f.x = _w3.x; f.y = _w3.y; f.z = _w3.z; f.yaw = 0; }
    f.x0 = f.x; f.y0 = f.y; f.z0 = f.z; f.pitch = 0; f.roll = 0; f.w = 1; f.down = true; f.kb = 1; f.kt = C.tau; f.landT = null; f.wasDown = true;
    if (h.posed){
      const o = LEG(s)[2]*7 + 3;
      _Q2.set(_FKs[o], _FKs[o + 1], _FKs[o + 2], _FKs[o + 3]); _E.setFromQuaternion(_Q2, "YXZ");
      f.yaw = _E.y; f.pitch = _E.x; f.roll = _E.z;
    }
    f.p0 = f.pitch; f.hold = true;
  }
  return F;
}
const _w3 = {x:0, y:0, z:0}, _b3 = {x:0, y:0, z:0}, _b4 = {x:0, y:0, z:0}, _d2 = {x:0, z:0}, _l2 = {x:0, z:0}, _a2 = {x:0, z:0};
// the knee's way eases between the plant pass's (held) and the pose's own (in the air) over 0.12 s of clip time
// (soon: the foot comes down within 0.12 s, so the knee is already the plant pass's way when the hold begins)
function kneeBlend(f, tau, soon = false){
  const dt = Math.max(0, tau - f.kt); f.kt = tau;
  f.kb = clamp(f.kb + (f.down || soon ? dt : -dt)/.12, 0, 1);
}
// the plant pass's weights: both feet held to their world points (st.plantW overrides for a foot left free)
function plantOut(h, st, out){ const C = h.mv; out[0] = C && C.feet ? C.feet[0].w : 0; out[1] = C && C.feet ? C.feet[1].w : 0; return out; }
// write the feet into h.locks (the plant pass reads x, y, z of the ankle in world metres)
function lockFeet(h, C){
  for (let i = 0; i < 2; i++){
    const f = C.feet[i], L = h.locks[i] || (h.locks[i] = {x:0, y:0, z:0, yaw:0});
    L.x = f.x; L.y = f.y; L.z = f.z; L.yaw = BT.ry + f.yaw;
  }
}
/* solve leg s to the world ankle (x, y, z) with the foot turned to (yaw, pitch, roll) in body space; the toe bent by toe.
   The knee points the way the foot does and up (a pole of (sin yaw, 0.5, cos yaw) in the hips' frame), turned about the
   hip-ankle line so the ankle stays put: a heel kicked up behind has the knee forward and down, a leg lifted in front
   has it up, a side-foot pass has it turned out, and none of them flips over as the leg goes through */
// (an ankle is never asked to come nearer the hip joint than LEG_MIN of the leg: a leg folded right up has no line from
// hip to ankle to turn the knee about, and a path that passes there would flip the knee over)
const LEG_MIN = .5;
function legW(h, T, s, x, y, z, yaw, pitch, roll, toe = 0, kb = 0){
  toB(x, y, z, _b3);
  frameOf(h, T, LEG(s)[0], _M); _V.setFromMatrixPosition(_M);
  const dx = _b3.x - _V.x, dy = _b3.y - _V.y, dz = _b3.z - _V.z, dl = Math.hypot(dx, dy, dz), mn = LEG_MIN*(h.D.hipY - h.D.ankY);
  if (dl < mn){
    if (dl > 1e-4){ const k = mn/dl; _b3.x = _V.x + dx*k; _b3.y = _V.y + dy*k; _b3.z = _V.z + dz*k; }
    else _b3.y = _V.y - mn;
  }
  legIK(h, T, s, _b3.x, _b3.y, _b3.z, 0, toe);
  kneeTo(h, T, s, yaw, pitch, roll, kb);
  footTo(h, T, s, yaw, pitch, roll);
}
const _ha = new THREE.Vector3(), _ka = new THREE.Vector3(), _pa = new THREE.Vector3(), _Mh = new THREE.Matrix4(), _Qk = new THREE.Quaternion(), _Qt = new THREE.Quaternion();
/* kb (0..1): how much of the plant pass's own knee way to take instead (human.js plantLegs solves a held foot's leg
   with the knee over the toes, rig.js solveLeg): a foot about to be held, or just let go, eases between the two so the
   knee never flips across when the hold starts or ends */
function kneeTo(h, T, s, yaw, pitch = 0, roll = 0, kb = 0){
  const th = LEG(s)[0], sh = LEG(s)[1];
  // in the hips' frame: the hip joint, the knee, the ankle
  frameOf(h, T, B.hips, _Mh); _Mi.copy(_Mh).invert();
  frameOf(h, T, sh, _M); _ka.setFromMatrixPosition(_M).applyMatrix4(_Mi);
  frameOf(h, T, LEG(s)[2], _M); _pa.setFromMatrixPosition(_M).applyMatrix4(_Mi);
  _ha.copy(h.rest[th]);                                   // (rest: each bone's offset from its parent)
  const ax = _V2.copy(_pa).sub(_ha); const al = ax.length(); if (al < 1e-4) return; ax.divideScalar(al);
  // the knee's way now, square to the hip-ankle line
  const k0 = _ka.sub(_ha); k0.addScaledVector(ax, -k0.dot(ax));
  // the way wanted: the hip-ankle line turned a quarter forward about the foot's own across (the body's left turned by
  // the foot's yaw), in body space; a small share of the foot's forward keeps it defined when the leg points across
  _Q.setFromRotationMatrix(_Mh); _Qt.copy(_Q).invert();
  const lat = _E0.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(_Qt);
  // (plus the foot's forward-and-up square to the line: it holds the knee forward when the leg points out sideways,
  // where the turn about the across axis alone would flip over as the leg passes the horizontal)
  const P = _V3.set(Math.sin(yaw), .35, Math.cos(yaw)).applyQuaternion(_Qt);
  P.addScaledVector(ax, -P.dot(ax));
  _V.crossVectors(ax, lat).addScaledVector(P, .6);
  _V.addScaledVector(ax, -_V.dot(ax));
  if (kb > 0){
    // the plant pass's way: the foot's forward, a little out, its rise a third (solveLeg's pole)
    _E.set(pitch, yaw, roll, "YXZ"); _Q2.setFromEuler(_E);
    const fw = _V4.set(0, 0, 1).applyQuaternion(_Q2);
    fw.set(fw.x + s*.06, fw.y*.3, fw.z).applyQuaternion(_Qt);
    fw.addScaledVector(ax, -fw.dot(ax));
    if (fw.lengthSq() > 1e-8 && _V.lengthSq() > 1e-8){ fw.normalize(); _V.normalize().lerp(fw, kb); }
  }
  if (k0.lengthSq() < 1e-8 || _V.lengthSq() < 1e-8) return;
  k0.normalize(); _V.normalize();
  const ang = Math.atan2(_V3.crossVectors(k0, _V).dot(ax), k0.dot(_V));
  if (Math.abs(ang) < 1e-5) return;
  // turn the thigh about that line (in the hips' frame: the thigh's parent)
  _Qk.setFromAxisAngle(ax, ang);
  _E.set(T[th*3], T[th*3 + 1], T[th*3 + 2], "XYZ"); _Qt.setFromEuler(_E);
  _Qt.premultiply(_Qk);
  _E.setFromQuaternion(_Qt, "XYZ"); R3(T, th, _E.x, _E.y, _E.z);
}
const _V4 = new THREE.Vector3();
const _V3 = new THREE.Vector3();
const _E0 = new THREE.Vector3();
// turn the foot of leg s to a body-space orientation (yaw about up, then pitch toes down, then roll) under its shin
function footTo(h, T, s, yaw, pitch, roll){
  const sh = LEG(s)[1], ft = LEG(s)[2];
  frameOf(h, T, sh, _M); _Q.setFromRotationMatrix(_M);
  _E.set(pitch, yaw, roll, "YXZ"); _Q2.setFromEuler(_E);
  _Q.invert().multiply(_Q2);
  _E.setFromQuaternion(_Q, "XYZ");
  R3(T, ft, _E.x, _E.y, _E.z);
}
// the ankle (world) that puts a part of the foot (partLocal, body units in the foot's frame) at world point p, with the
// foot turned to (yaw, pitch, roll) in body space
function ankleFor(h, part, s, px, py, pz, yaw, pitch, roll, out){
  partLocal(part, s, _pl);
  _E.set(pitch, yaw + 0, roll, "YXZ"); _Q2.setFromEuler(_E);
  _V.set(_pl[0], _pl[1], _pl[2]).applyQuaternion(_Q2);            // body-space offset from the ankle to the part
  // that offset as a world vector (rotate body x, z into the world; scale)
  const wx = (_V.x*BT.c + _V.z*BT.s)*BT.sc, wz = (-_V.x*BT.s + _V.z*BT.c)*BT.sc, wy = _V.y*BT.sc;
  out.x = px - wx; out.y = py - wy; out.z = pz - wz;
  return out;
}
// the lowest point of a foot turned so, relative to its ankle (body units): to keep a striking toe out of the grass
function footLowRel(yaw, pitch, roll){
  _E.set(pitch, yaw, roll, "YXZ"); _Q2.setFromEuler(_E);
  let m = 1e9;
  for (const p of FOOT_PTS){ _V.set(p[0], p[1], p[2]).applyQuaternion(_Q2); if (_V.y < m) m = _V.y; }
  return m;
}
const FOOT_PTS = [[0, -.085, -.07], [0, -.085, .1], [0, -.06, .2], [.04, -.085, .08], [-.04, -.085, .08]];

/* ---------- where things are, for tests and the camera ----------
   partPoint(h, part, side): the world point of a face of the foot ('laces', 'inside', 'toe', 'sole'), or 'brow' (the
   forehead), 'chest', 'thigh', 'handL', 'handR' (the middle of the palm), from the bones as last written */
export function partPoint(h, part, side = "R"){
  const s = side === "L" || side === 1 ? 1 : -1;
  h.g.updateMatrixWorld(true);
  let bone, x = 0, y = 0, z = 0;
  if (part === "brow"){ bone = h.bones[B.head]; [x, y, z] = BROW; }
  else if (part === "chest"){ bone = h.bones[B.chest]; x = 0; y = .08; z = .13; }
  else if (part === "thigh"){ bone = h.bones[LEG(s)[0]]; x = 0; y = -.25; z = .08; }
  else if (part === "handL" || part === "handR"){ bone = h.bones[ARM(part === "handL" ? 1 : -1)[2]]; x = 0; y = -.08; z = .01; }
  else { bone = h.bones[LEG(s)[2]]; partLocal(part, s, _pl); [x, y, z] = _pl; }
  return bone.localToWorld(new THREE.Vector3(x, y, z));
}

/* ---------- body pieces shared by the clips ---------- */
// look at a world point: neck and head share the turn and the tilt, worked out in the chest's own frame (so it holds for
// a body rolled on its side or tipped back as well as standing)
const _Mi = new THREE.Matrix4();
function lookAt(h, T, wx, wy, wz, w = 1){
  if (wx == null || !(w > 0)) return;
  toB(wx, wy, wz, _b3);
  frameOf(h, T, B.chest, _M); _Mi.copy(_M).invert();
  _V.set(_b3.x, _b3.y, _b3.z).applyMatrix4(_Mi);
  const vx = _V.x, vy = _V.y - (h.D.neckY - h.D.chestY) - .08, vz = _V.z + .012;
  const yaw = clamp(Math.atan2(vx, Math.max(.05, vz)), -1.2, 1.2), pit = clamp(Math.atan2(-vy, Math.hypot(vx, vz)), -.8, 1.0);
  T[B.neck*3] = lerp(T[B.neck*3], pit*.45, w); T[B.neck*3 + 1] = lerp(T[B.neck*3 + 1], yaw*.45, w);
  T[B.head*3] = lerp(T[B.head*3], pit*.55, w); T[B.head*3 + 1] = lerp(T[B.head*3 + 1], yaw*.55, w);
}
// arms: s side, abduction (out), flexion (forward, negative x), elbow bend
function armPose(T, s, out, fwd, elbow, twist = 0){ const a = ARM(s); R3(T, a[0], -fwd, 0, s*out); R3(T, a[1], -elbow, s*twist, 0); R3(T, a[2], -.1, 0, 0); }
// the fatigue overlay (3.5.7): chest flexion +0.08, head down 0.06 (any clip or a caller's pose may lay it over)
export function fatigueOver(T, f){
  if (!(f > 0)) return;
  T[B.chest*3] += .08*f; T[B.head*3] += .06*f; T[B.neck*3] += .03*f;
}

/* ====================================================================================================
   STRIKES
   ==================================================================================================== */
/* where the support foot goes for a strike of kind k with foot side ('L' | 'R') at ball (world) aimed along f ({x, z}) */
function plantSpot(k, side, ball, f, scale, out){
  const K = KINDS[k], ss = side === "L" ? -1 : 1;           // the support foot's side: +1 left, -1 right
  leftOf(f.x, f.z, _l2);
  let lat = K.plant[0], along = K.plant[1];
  // volleys: the higher the ball, the further the body stands from it (the leg reaches up and across to it)
  if (K.air){ const y = Math.max(0, (ball.y || BR) - BR); lat += K.side ? .45*y : .05*y; along -= K.over ? 0 : K.side ? .25*y : .45*y; }
  out.x = ball.x + (f.x*along + _l2.x*ss*lat)*scale; out.z = ball.z + (f.z*along + _l2.z*ss*lat)*scale;
  const a = approachDir(k, side, f, _a2);
  out.yaw = Math.atan2(a.x*.4 + f.x*.6, a.z*.4 + f.z*.6);
  if (K.side) out.yaw = Math.atan2(f.x - _l2.x*ss*.8, f.z - _l2.z*ss*.8);
  if (K.over) out.yaw = Math.atan2(-f.x, -f.z);           // the overhead kick: his back to the goal
  return out;
}
// the approach: from the support side, app degrees off the aim line
function approachDir(k, side, f, out){
  const K = KINDS[k], ss = side === "L" ? -1 : 1, a = K.app*Math.PI/180;
  leftOf(f.x, f.z, _l2);
  out.x = f.x*Math.cos(a) - _l2.x*ss*Math.sin(a); out.z = f.z*Math.cos(a) - _l2.z*ss*Math.sin(a);
  if (K.over){ out.x = -f.x; out.z = -f.z; }
  return out;
}

/* planStrike(h, ball, kind, side, dir, power) -> {plant: {x, z, yaw}, steps, n, scale, tContact, feasible, err, approach}
   The run-up (3.5.7): the support foot's plant beside the ball, the approach from the support side, n footfalls to it
   (round(D / step(v)), one more for foot parity), each step scaled the same (clamped to [0.75, 1.2]; outside that
   feasible is false and err says by how much), the penultimate step 1.10 long. steps is the list of footprints
   [{side: 'L' | 'R', x, z, yaw}] the gait is given one at a time (runupStep); tContact the seconds from now to the
   contact at the clip's own timing. A body standing (under 0.5 m/s) makes the plant inside the clip (a short step). */
export function planStrike(h, ball, kind, side = "R", dir = null, power = .7){
  const k = kindOf(kind), K = KINDS[k], sc = h.scale || 1, Gt = h.gait;
  const f = {x:0, z:0};
  if (typeof dir === "number"){ f.x = -Math.sin(dir); f.z = -Math.cos(dir); }
  else if (dir){ const l = Math.hypot(dir.x, dir.z) || 1; f.x = dir.x/l; f.z = dir.z/l; }
  else { f.x = Math.sin(h.g.rotation.y); f.z = Math.cos(h.g.rotation.y); }
  const plant = plantSpot(k, side, ball, f, sc, {x:0, z:0, yaw:0});
  const a = approachDir(k, side, f, {x:0, z:0});
  const v = Gt ? Math.max(Gt.vs, 0) : 0, mode = v > 2.3 ? "R" : "W";
  const res = {kind:k, side, plant, approach:a, steps:[], n:0, scale:1, tContact:K.contact, feasible:true, err:0, power, aim:f, ball:{x:ball.x, y:ball.y != null ? ball.y : BR, z:ball.z}};
  if (!Gt || v < .5){
    // standing: the plant is a step inside the clip
    const sd = side === "L" ? 1 : 0, ft = Gt ? Gt.feet[sd] : null;
    const d = ft ? Math.hypot(ft.x - plant.x, ft.z - plant.z) : 0;
    res.pre = d > .03*sc ? preStep(d/sc) + PLANT_BACK : 0; res.tContact = res.pre + K.contact;
    res.tPlant = res.pre ? res.pre - PLANT_BACK : 0;
    res.feasible = d < .9*sc; res.err = Math.max(0, d - .9*sc);
    res.root = rootAtPlant(h, k, side, plant, f, sc);
    return res;
  }
  // the root at the plant: the support footprint less half a stance across and the footprint's lead ahead of the hips
  const ss = side === "L" ? -1 : 1;
  leftOf(a.x, a.z, _l2);
  // (the root is aimed a little past where the hips would be over a footprint's usual lead: a body that is late to its
  // plant has its last swing cut short by the gait, one that is early only plants under itself)
  const hw = (h.D.hipX - .012)*sc, lead = (mode === "R" ? .16 : .18)*sc, rlead = (mode === "R" ? .04 : .1)*sc;
  const rpx = plant.x - _l2.x*ss*hw - a.x*rlead, rpz = plant.z - _l2.z*ss*hw - a.z*rlead;
  const rx = h.g.position.x, rz = h.g.position.z;
  // the root runs straight to where it is at the plant (the owner's mover steers it there)
  const D = Math.hypot(rpx - rx, rpz - rz), px0 = D > 1e-3 ? (rpx - rx)/D : a.x, pz0 = D > 1e-3 ? (rpz - rz)/D : a.z;
  leftOf(px0, pz0, _l2);
  const st0 = stepLen(v, mode, sc);
  // which foot lands next: the one in the air, or the other of the last down
  const Fe = Gt.feet, next = !Fe[0].down && Fe[1].down ? "L" : !Fe[1].down && Fe[0].down ? "R" : Gt.side === "L" ? "R" : "L";
  const sup = side === "L" ? "R" : "L";
  // the n-th footfall from now (1 = the next) must be the support foot's; of the counts that give it, the one whose
  // steps are nearest the natural length (and never a plant on the very next landing of a foot already in the air: that
  // one can only be eased toward)
  const nth = i => (i % 2 === 1) ? next : (next === "L" ? "R" : "L");
  const supDown = Fe[side === "L" ? 1 : 0].down;
  let n = 0, best = 1e9;
  // (the gait's clock lands the c-th foot from now after floor(2 phi) + c - 2 phi steps of travel: the part of the
  // step already gone counts)
  const ph = Math.floor(2*Gt.phi) - 2*Gt.phi;
  for (let c = 1; c <= 40; c++){
    if (nth(c) !== sup || (c === 1 && !supDown)) continue;
    const sc1 = D/(Math.max(.05, c + ph)*st0), cost = Math.abs(Math.log(Math.max(1e-3, sc1)));
    if (cost < best){ best = cost; n = c; }
    if (sc1 < .5) break;
  }
  if (!n) n = nth(1) === sup && supDown ? 1 : 2;
  // footprints: the root's path split evenly, the penultimate step 1.10 of the others
  const wsum = Math.max(.05, n + ph);
  const unit = D/wsum;
  res.scale = unit/st0; res.n = n;
  // (a plant that is the very next landing of a foot already in the air can only be eased toward: not exact)
  const supIdx = side === "L" ? 1 : 0;
  res.feasible = res.scale >= .75 && res.scale <= 1.2 && !(n === 1 && !Fe[supIdx].down);
  res.err = res.feasible ? 0 : Math.max(0, res.scale < .75 ? (.75 - res.scale) : (res.scale - 1.2))*st0*n;
  // (a ball above what the striking face reaches from the ground, about 0.8 of a 1.80 body's hip height for a front-on
  // volley, is met short of its centre: not exact either)
  const hMax = (K.acro ? 9 : K.side ? .95 : .8)*sc;
  if (res.ball.y > hMax){ res.err += res.ball.y - hMax; res.feasible = false; }
  let along = 0;
  for (let i = 1; i <= n; i++){
    along += unit*(i === n - 1 ? 1.1 : 1);
    const sd = nth(i), s = sd === "L" ? 1 : -1;
    if (i === n){ res.steps.push({side:sd, x:plant.x, z:plant.z, yaw:plant.yaw}); break; }
    const px = rx + px0*(along + lead) + _l2.x*s*hw, pz = rz + pz0*(along + lead) + _l2.z*s*hw;
    res.steps.push({side:sd, x:px, z:pz, yaw:Math.atan2(px0, pz0) + s*.04});
  }
  res.root = {x:rpx, z:rpz};
  res.g0 = Gt.n;
  res.tContact = D/Math.max(v, .5) + K.contact;
  res.pre = 0;
  return res;
}
const preStep = d => clamp(.14 + .3*d, .16, .3);
/* where the root stands when the support foot comes down on its plant: half a stance across from it and a little
   behind (a standing strike's owner carries the root there over the plant step, plan.pre seconds) */
function rootAtPlant(h, k, side, plant, f, sc){
  const ss = side === "L" ? -1 : 1, a = approachDir(k, side, f, {x:0, z:0});
  leftOf(a.x, a.z, _l2);
  const hw = (h.D.hipX + .02)*sc;
  return {x:plant.x - _l2.x*ss*hw - a.x*.12*sc, z:plant.z - _l2.z*ss*hw - a.z*.12*sc};
}
/* runupStep(h, plan): call every frame before animateHuman while the body runs up. The footfalls left to the plant are
   counted down as they come; each foot is given its next landing (a footstep override, set while it is still down so
   it lands exactly there): the plant itself for the support foot's last step, the others spread evenly between where
   the body is and the plant, so a stride that started early or late is taken up by the steps after it. Returns
   {planted, t, x, z} once the support foot has come down on the plant (t: seconds into the last call's step), else null. */
export function runupStep(h, plan){
  const Gt = h.gait; if (!Gt || !plan || !plan.n) return null;
  const sc = h.scale || 1;
  if (plan.sup == null){ plan.sup = plan.side === "L" ? "R" : "L"; if (plan.g0 == null) plan.g0 = Gt.n; }
  // the plant: the support foot down on its spot in the last call
  // (a footfall near the plant before its turn, a stop's short closing step, is not it unless it is right on it)
  const kNow = plan.n - (Gt.n - plan.g0);
  for (const fl of Gt.falls){
    if (Gt.n > plan.g0 && fl.side === plan.sup && Math.hypot(fl.x - plan.plant.x, fl.z - plan.plant.z) < (kNow <= 0 ? .06 : .02)*sc){
      plan.planted = {x:fl.x, z:fl.z, t:fl.t}; plan.k = 0;
      return {planted:true, t:fl.t, x:fl.x, z:fl.z};
    }
  }
  // the plant's own step: once the support foot is in the air for it, the strike takes it over (st.pre = the swing time
  // left), so the clip lands it on the plant exactly; the gait would cut a late body's last swing short
  {
    const k0 = plan.n - (Gt.n - plan.g0), supF = Gt.feet[plan.sup === "L" ? 0 : 1];
    if (k0 === 1 && !supF.down && supF.sw && supF.sw.u < .8){
      // (the step lands when the body has come to its place over the plant: the swing's own time left, stretched or
      // shortened, within reason, to the time the root takes to get there at its speed)
      const left = (1 - supF.sw.u)*supF.sw.T, v = Math.max(.5, Gt.vs);
      const along = Math.hypot(plan.root.x - h.g.position.x, plan.root.z - h.g.position.z);
      // (a body still more than that from its place takes another stride first: the plant moves to the support foot's
      // next landing but one, and this step becomes an ordinary one)
      if (along/v > left*1.8 + .05) plan.n += 2;
      else {
        const pre = clamp(along/v, Math.max(.1, left*.85), left*1.8 + .05);
        plan.k = 1; plan.last = {pre};
        return {last:true, pre, planted:false};
      }
    }
  }
  // the footfalls left, from the gait's own counter (every footfall since the plan was made); a step more than planned
  // (a settle, a stop's close) puts the plant two footfalls on, the support foot's next landing
  plan.k = plan.n - (Gt.n - plan.g0);
  while (plan.k <= 0){ plan.n += 2; plan.k += 2; }
  // the next footfall's side: the foot in the air, else the other of the last one down
  const Fe = Gt.feet, next = !Fe[0].down && Fe[1].down ? "L" : !Fe[1].down && Fe[0].down ? "R" : Gt.side === "L" ? "R" : "L";
  // the centre line from the root (plus a footprint's lead) to the root's place at the plant
  const a = plan.approach, ss = plan.side === "L" ? -1 : 1;
  const rx = h.g.position.x, rz = h.g.position.z, px = plan.root.x, pz = plan.root.z;
  const dx = px - rx, dz = pz - rz, dl = Math.hypot(dx, dz) || 1e-6, ux = dx/dl, uz = dz/dl;
  leftOf(ux, uz, _l2);
  const hw = (h.D.hipX - .012)*sc, lead = (Gt.mode === "R" ? .16 : .18)*sc;
  for (const sd of ["L", "R"]){
    const j = sd === next ? 1 : 2;                         // this foot's next landing is the j-th footfall from now
    if (j > plan.k) continue;
    if (sd === plan.sup && j === plan.k){ footstep(h, sd, plan.plant.x, plan.plant.z, plan.plant.yaw); continue; }
    // in between: its share of the way, on its own side of the line
    const f = j/plan.k, s = sd === "L" ? 1 : -1;
    const cx = rx + dx*f + ux*lead, cz = rz + dz*f + uz*lead;
    footstep(h, sd, cx + _l2.x*s*hw, cz + _l2.z*s*hw, Math.atan2(ux, uz) + s*.04);
  }
  planHint(h, plan, dl);
  void a; void ss;
  return null;
}
/* the speed that brings the root to its plant place on the plant's own footfall: the gait's clock lands a foot every
   step length of travel (gaitcore phaseAdvance), so the k-th footfall from now comes after (floor(2 phi) + k - 2 phi)
   steps; the step length that makes that the distance left, and the speed that gives that step (a run-up's stride
   adjustment: the owner's mover eases toward plan.speed). Once the plant's own swing is in the air its landing time is
   set, and the speed is held (plan.hold). */
function planHint(h, plan, dl){
  const Gt = h.gait, sc = h.scale || 1;
  if (dl == null) dl = Math.hypot(plan.root.x - h.g.position.x, plan.root.z - h.g.position.z);
  const supF = Gt.feet[plan.sup === "L" ? 0 : 1];
  const m = Math.floor(2*Gt.phi) + plan.k - 2*Gt.phi;
  plan.hold = plan.k === 1 && !supF.down;
  if (!plan.hold && m > .05){
    const want = dl/m;
    let lo = .4, hi = 9.5;
    for (let it = 0; it < 24; it++){ const mid = (lo + hi)/2; if (stepLen(mid, Gt.mode, sc) < want) lo = mid; else hi = mid; }
    plan.speed = (lo + hi)/2;
  }
  return null;
}
/* the root's speed through a strike, as a share of the approach speed (3.5.7: 0.55 at contact, 0.40 at +0.25 s, then
   back to 1): the mover applies it, the animation never moves the root on the ground */
export function strikeRoot(t, contact){
  if (t < contact) return lerp(1, .55, sstep(contact - .18, contact, t));
  if (t < contact + .25) return lerp(.55, .40, (t - contact)/.25);
  return lerp(.40, 1, sstep(contact + .25, contact + .6, t));
}

const STRIKE_EV = [[EV.PLANT, 0]];
function strikeSpec(st){
  const k = kindOf(st.kind), K = KINDS[k];
  _spec.dur = K.dur; _spec.contact = K.contact; _spec.pre = st.pre || 0;
  _spec.events = K.air && (K.acro) ? ACRO_EV[k] : STRIKE_EV;           // (PLANT at clip time 0: after a run-up's last step)
  _spec.begin = st.pre == null ? strikeBegin : null;
  return _spec;
}
const _spec = {dur:1, contact:.5, pre:0, events:null, begin:null};
/* a support foot not yet on its plant (a strike from a stand, or a plant the run-up missed): the clip begins with the
   step onto it, before the plant moment (clip time below 0) */
function strikeBegin(h, C, st){
  setBT(h);
  // (let go from a held wind-up: the support foot is already planted and the leg cocked, so no step onto a plant; the
  // swing goes on from where the hold has it)
  // (only with the leg that was held: a release that kicks with the other foot steps onto its plant as any strike)
  C.fromHold = h.heldAt != null && h.t - h.heldAt < .1 && h.heldSide === (st.side === "L" || st.side === 1 ? 1 : -1);
  if (C.fromHold){ C.pre = 0; C.back = 0; C.tau0 = Math.max(0, KINDS[kindOf(st.kind)].contact - WIND.SWING); return; }
  const k = kindOf(st.kind), sc = BT.sc, kickS = st.side === "L" || st.side === 1 ? 1 : -1, iS = kickS > 0 ? 1 : 0;
  const f = aimOf(st, h, {x:0, z:0}), ball = st.ball || defaultBall(h, kickS, f);
  const p = st.plant || plantSpot(k, kickS > 0 ? "L" : "R", {x:ball.x, y:ball.y != null ? ball.y : BR, z:ball.z}, f, sc, {x:0, z:0, yaw:0});
  const L = h.posed && h.locks[iS];
  if (L) toB(L.x, L.y, L.z, _b3); else { _b3.x = -kickS*(h.D.hipX + .02); _b3.z = 0; }
  toB(p.x, 0, p.z, _b4);
  const dist = Math.hypot(_b3.x - _b4.x, _b3.z - _b4.z);
  // (a strike from a stand swings the leg back after the plant, which a run-up has done on the way: PLANT_BACK more)
  C.pre = dist > .03 ? preStep(dist) + PLANT_BACK : 0;
  C.back = C.pre ? PLANT_BACK : 0;
  if (C.pre) C.events = PRE_EV;
}
const PLANT_BACK = .14, PRE_EV = [[EV.PLANT, -PLANT_BACK]];
const ACRO_EV = {
  scissor:[[EV.PLANT, 0], [EV.TAKEOFF, .2], [EV.LAND, .78]],
  bicycle:[[EV.PLANT, 0], [EV.TAKEOFF, .2], [EV.LAND, .86]]
};

/* ---------- the held backswing (A1.7, WP-D3) ----------
   While a shot or a pass is charged (st.hold: the charge 0..1, st.over: held past full 0..1) the strike clip holds its
   wind-up instead of running to a contact: the support foot planted under the body, the kicking leg cocked as far as
   the charge has gone (the knee lifted in front and a little out, the knee bent hard so the shin sweeps back and the
   boot is drawn back behind it and out beside it, the foot pointed), the hips opening, the support side's arm going
   out, the chest leaning back when it is held past full. A pass draws it back 60% as far. It is the clip's own pose,
   so your whole body (third person, a replay) and the body in your eyes show the same thing, and looking down at the
   ball you see your leg cocked. The release is a strike clip of its own (a new st.id, from wherever the held pose
   has the feet: startFeet reads them), so the swing goes on from the wind-up. Walking with it held, the support foot
   re-steps under the body; above WIND.V the stride keeps the legs and the wind-up is the upper body's (st.upper
   {g: 'windup', w, side}, windUpper). The camera is never pitched for you by any of it (D22): matchcam.js only dips
   the view within its action springs. Let go any other way (the charge dropped, a stride adjust before the strike, the
   body sped up past the line with it still held), the same clip lets the leg down: the charge eases to nothing over
   WIND.REL and only then does locomotion take the legs back (windHold), so the cocked foot is never put onto a
   footprint in one frame. A change of striking foot in the middle of it puts the cocked leg down first and then
   cocks the other one, the arms changing over as it does.
   WIND: the cocked leg at a full charge (radians, about the hips' axes: +X the body's left, +Y up, +Z forward): the thigh
   flexed up in front (THIGH), taken out to the side (ABD) after a turn out about its own length (ROT), the knee
   (KNEE), the foot (FOOT); the hips' opening (HIPS), the support arm out (ARM), the lean back held past full (LEAN);
   the hips' drop over the bending support knee (DROP); V: the speed (m/s) above which the stride keeps the legs;
   STEP: the support foot re-steps when it is this far from under its hip (m), taking STEP_T seconds; SWING: let go,
   the strike begins this long (clip seconds) before its contact (the backswing is done: strikeBegin's C.tau0), the
   leg whipping through in its joints from the cocked pose to the one that meets the ball; DOWN: let go, standing or
   walking, the leg is put down no faster than a full charge in this long (s; the charge as drawn eases out at 24/s
   within that, so the joints stay well under their speed limit and the foot is set down, not stamped); on the run
   (over RUN m/s, where the stride wants the legs back) it eases out at 24/s alone; REL, REL_RUN: let go without a
   strike, how long the clip goes on letting the leg down standing and on the run (s: by then at most SWAP of the
   charge is left either way); SWAP: the charge as drawn below which a change of striking foot changes the legs
   over; LIFT: the charge as drawn by which the kicking foot is wholly off its footprint (below it the leg is between
   standing on it and the joints' own pose); STAND: the hips' height with nothing drawn (body units), the gait's own
   standing posture, so the legs stand on the same knees as when the gait has them and the hand-over either way is a
   knee's bend apart at most. */
export const WIND = Object.freeze({THIGH: -1.3, ABD: .45, ROT: -.6, KNEE: 2.1, FOOT: .4, HIPS: .2, ARM: .95, LEAN: .14, DROP: .015,
  V: 1.3, STEP: .16, STEP_T: .2, PASS: .6, BLEND: .15, SWING: .13, DOWN: .16, RUN: 1.7, REL: .24, REL_RUN: .15, SWAP: .03, LIFT: .2,
  STAND: -.01});
const HOLD_SPEC = {dur:1e9, contact:1e9, pre:0, events:null, begin:null};
const _Qh = new THREE.Quaternion(), _Qx = new THREE.Quaternion(), _Ax = new THREE.Vector3(), _KL = new Float64Array(12);
function strikeHold(h, T, st, dt){
  const C = clock(h, "strike", st, HOLD_SPEC);
  setBT(h);
  const d = C.data, D = h.D, sc = BT.sc, adt = Math.max(0, dt);
  const sideNow = st.side === "L" || st.side === 1 ? 1 : -1;
  const F = C.feet || startFeet(h, C);
  if (!d.held){ d.held = true; startFeet(h, C); d.k = 0; d.over = 0; d.step = null; d.hip0 = h.posed ? [h.pose[80], h.pose[81], h.pose[82]] : [0, 0, 0]; d.side = sideNow; d.ks = sideNow; }
  // the striking foot changed in the middle of it (the ball rolled across to the other foot): the cocked leg comes down
  // onto its footprint first (the charge as drawn eased out), then the legs change over, the one that was the support
  // standing where it is until the charge lifts it; a support foot in the middle of a re-step lands first. The new
  // support foot is held where the other one came down, the plant pass coming in over 0.05 s
  const swap = sideNow !== d.side;
  if (swap && d.k < WIND.SWAP && !d.step){
    const Fo = F[d.side > 0 ? 1 : 0];
    d.side = sideNow; d.landAt = C.lastT; d.kr = {x:Fo.x, z:Fo.z, wy:BT.ry + Fo.yaw};
  }
  const kickS = d.side, supS = -kickS, iK = kickS > 0 ? 0 : 1, iS = 1 - iK;
  const Fs = F[iS], Fk = F[iK];
  // (the kicking foot's footprint: where it stood as the hold began, then under its hip once it is up, for it to come
  // down onto)
  if (!d.kr) d.kr = {x:Fk.x, z:Fk.z, wy:BT.ry + Fk.yaw};
  // the charge as drawn: eased in as it fills, out when it drops (to nothing while the legs change over, and while the
  // clip lets the leg down after a let-go without a strike: st.hold 0); standing or walking either way no faster than
  // WIND.DOWN for the whole of it (a charge builds slower than that: this holds back the leg put down, and the other
  // one cocked at once to a charge already full after a change of foot)
  const want = sideNow !== d.side ? 0 : clamp(+st.hold || 0, 0, 1)*(kindOf(st.kind) === "side" ? WIND.PASS : 1);
  {
    const step = (want - d.k)*(1 - Math.exp(-(want > d.k ? 14 : 24)*adt)), cap = adt/WIND.DOWN;
    d.k += want < d.k && Math.hypot(C.vx, C.vz) > WIND.RUN*sc ? step : clamp(step, -cap, cap);
  }
  d.over += ((sideNow !== d.side ? 0 : clamp(+st.over || 0, 0, 1)) - d.over)*(1 - Math.exp(-10*adt));
  // (the arms change over with the legs, eased: ks goes from one side's sign to the other's)
  d.ks += (kickS - d.ks)*(1 - Math.exp(-14*adt));
  const k = d.k, groundY = BT.gy + D.ankY*sc;
  // --- the support foot: planted; when the body has moved off it (a walk with the charge held) or turned well away
  // from it, a short step puts it back under its hip
  toW(supS*(D.hipX + .02), 0, .02, _w3);
  const ux = _w3.x, uz = _w3.z;
  if (!d.step && (Math.hypot(Fs.x - ux, Fs.z - uz) > WIND.STEP*sc || Math.abs(wrap(Fs.yaw)) > .6)) d.step = {t:0, x0:Fs.x, z0:Fs.z, y0:Fs.yaw};
  if (d.step){
    const S = d.step; S.t += adt;
    const u = clamp(S.t/WIND.STEP_T, 0, 1), e = ease(u);
    Fs.x = lerp(S.x0, ux, e); Fs.z = lerp(S.z0, uz, e); Fs.y = groundY + .06*sc*bump(u); Fs.yaw = lerp(S.y0, 0, e);
    Fs.pitch = -.12*bump(u); Fs.roll = 0; Fs.down = u >= 1;
    if (u >= 1) d.step = null;
  } else { Fs.y = groundY; Fs.pitch = 0; Fs.roll = 0; Fs.down = true; }
  // --- the body: over the support foot a little, lowered as its knee bends; the hips opening, the support arm out, the
  // other back, the head down on the ball; leaning back held past full
  toB(Fs.x, Fs.y, Fs.z, _b3);
  {
    // (the hips start where the pose before had them and come to the wind-up's over a quarter of a second)
    const e = sstep(0, .25, C.lastT);
    T[60] = lerp(d.hip0[0], clamp(_b3.x*.35, -.1, .1)*k, e); T[61] = lerp(d.hip0[1], WIND.STAND - WIND.DROP*k, e); T[62] = lerp(d.hip0[2], 0, e);
  }
  R3(T, B.hips, .03*k, -kickS*WIND.HIPS*k, kickS*.05*k);
  R3(T, B.spine, .04 - .5*WIND.LEAN*d.over, kickS*WIND.HIPS*.4*k, 0); R3(T, B.chest, .03 - WIND.LEAN*d.over, kickS*WIND.HIPS*.3*k, 0);
  R3(T, B.neck, .1 + .05*k, 0, 0); R3(T, B.head, .12 + .08*k, 0, 0);
  // (each arm between the support side's pose, out and forward, and the kicking side's, back: u 1 is the support side's)
  for (let s = -1; s <= 1; s += 2){
    const u = (1 - s*d.ks)/2;
    armPose(T, s, lerp(.2 + .15*k, .2 + WIND.ARM*k, u), lerp(-.15 - .3*k, .1 + .25*k, u), lerp(.5, .4, u));
  }
  // --- the support leg onto its foot
  kneeBlend(Fs, C.tau, false);
  legW(h, T, supS, Fs.x, Fs.y, Fs.z, Fs.yaw, Fs.pitch, Fs.roll, 0, 1);
  // --- the kicking leg, cocked: written as turns of its own joints (no foot target to solve to: it is in the air); as
  // the charge begins (u below 1) it comes up off its footprint, the leg between standing on it (solved onto it, the
  // way the support leg is) and the joints' own pose, and let go it comes back down onto one the same way, so with
  // nothing drawn the body stands on both feet just as the gait stands it
  const [th, sh, ft, to] = LEG(kickS), u = sstep(0, WIND.LIFT, k);
  // (on the move it keeps to its place under the hip all the way down, so it is not left behind as the body goes on)
  if (u > .5 || Math.hypot(C.vx, C.vz) > 1){ toW(kickS*(D.hipX + .02), 0, .02, _w3); d.kr.x = _w3.x; d.kr.z = _w3.z; d.kr.wy = BT.ry; }
  const kyaw = wrap(d.kr.wy - BT.ry);
  if (u < 1){
    legW(h, T, kickS, d.kr.x, groundY, d.kr.z, kyaw, 0, 0, 0, 1);
    for (let j = 0; j < 4; j++){ const b = [th, sh, ft, to][j]; _KL[j*3] = T[b*3]; _KL[j*3 + 1] = T[b*3 + 1]; _KL[j*3 + 2] = T[b*3 + 2]; }
  }
  _Qh.setFromAxisAngle(_Ax.set(0, 1, 0), kickS*WIND.ROT*k);
  _Qx.setFromAxisAngle(_Ax.set(1, 0, 0), WIND.THIGH*k); _Qh.premultiply(_Qx);
  _Qx.setFromAxisAngle(_Ax.set(0, 0, 1), kickS*WIND.ABD*k); _Qh.premultiply(_Qx);
  _E.setFromQuaternion(_Qh, "XYZ"); R3(T, th, _E.x, _E.y, _E.z);
  R3(T, sh, WIND.KNEE*k, 0, 0); R3(T, ft, WIND.FOOT*k, 0, 0); R3(T, to, 0, 0, 0);
  if (u < 1) for (let j = 0; j < 4; j++){
    const b = [th, sh, ft, to][j];
    _E.set(_KL[j*3], _KL[j*3 + 1], _KL[j*3 + 2], "XYZ"); _Qx.setFromEuler(_E);
    _E.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Qh.setFromEuler(_E);
    _Qx.slerp(_Qh, u); _E.setFromQuaternion(_Qx, "XYZ"); R3(T, b, _E.x, _E.y, _E.z);
  }
  rateLegs(h, T, C, adt);
  // the kicking foot where the pose has it (its lock follows it; the plant pass holds it only as it stands on its
  // footprint), so the release's own clip starts from it
  frameOf(h, T, ft, _M); _V.setFromMatrixPosition(_M); toW(_V.x, _V.y, _V.z, _w3);
  Fk.x = _w3.x; Fk.y = _w3.y; Fk.z = _w3.z; Fk.down = u < .05; Fk.w = 1 - u; Fk.hold = false;
  if (u < .5) Fk.yaw = kyaw;
  // the support leg is the pose's own, solved onto its foot under the joints' speed limit (the plant pass solving it
  // again at once, with a knee of its own, would turn it faster than a joint may in a frame); once the clip has
  // settled, 0.1 to 0.3 s in, and again just after a re-step lands, the plant pass comes in to hold it exactly where it
  // stands, so a walk with the charge held never slides it
  if (d.step || !Fs.down) d.landAt = C.lastT;
  Fs.w = d.step || !Fs.down ? 0 : sstep(0, .1, C.lastT)*(d.landAt != null ? sstep(0, .05, C.lastT - d.landAt) : 1); Fs.hold = false;
  lockFeet(h, C);
  h.ev.reachErr = 0;
  h.gw = 0;
  // (a strike let go from it starts from the cocked leg only while the leg is being held cocked: not while the clip is
  // letting it down, nor while the legs change over)
  if (want > 0){ h.heldAt = h.t; h.heldSide = kickS; } else h.heldAt = null;
}
// the upper body of a wind-up on the run (st.upper {g: 'windup', w (the charge), side}): the support arm out, the hips
// and chest opening; the legs are the stride's
function upWindup(h, T, st){
  const s = st.side === "L" ? 1 : -1, k = clamp(st.w != null ? +st.w : 1, 0, 1);
  R3(T, B.spine, .02, s*WIND.HIPS*.5*k, 0); R3(T, B.chest, .03, s*WIND.HIPS*.4*k, 0);
  armPose(T, -s, .25 + WIND.ARM*.8*k, .15 + .2*k, .4); armPose(T, s, .2 + .1*k, -.2 - .25*k, .5);
}
/* the state a body winding up is posed with (view.js, for your agent; null when nothing is held): wind = control.js
   CTRL.wind {p, over, side, kind}; speed: the agent's (m/s); out: the body's own record for it, kept between calls
   (a new wind-up gets a new id, so its clip starts afresh); dt: the time since the last call (s, a 60 Hz frame when not
   given); cut: an action has taken over from the hold (the strike that lets it go, a tackle, a header), so nothing is
   let down. Above WIND.V it is null: windUpper gives the upper body's. Let go without a strike (the charge gone, or the
   speed over the line with it held), it is the same clip with no charge for WIND.REL more (WIND.REL_RUN on the run;
   out.hold 0), the leg coming down, and on the run the upper body's wind-up laid over it (out.upper) as the stride's
   will be; then null */
let HOLD_N = 0;
export function windHold(wind, speed, out, dt = 1/60, cut = false){
  const on = !!(wind && (wind.kind === "shot" || wind.kind === "pass") && wind.p > 0);
  if (cut){ out.held = false; out.still = false; out.upper = null; return null; }
  // (with a little hysteresis: held standing, it stays the clip's up to WIND.V + 0.4 m/s, so a speed about the line never
  // flips the body between the two)
  out.still = on && speed <= WIND.V + (out.still ? .4 : 0);
  if (on && out.still){
    if (!out.held){ out.held = true; out.id = "hold" + (++HOLD_N); }
    out.rel = 0; out.upper = null;
    out.mode = "strike"; out.kind = wind.kind === "pass" ? "side" : "instep"; out.side = wind.side === "L" ? "L" : "R";
    out.hold = clamp(+wind.p || 0, 0, 1); out.over = clamp(+wind.over || 0, 0, 1); out.blend = WIND.BLEND; out.tc = undefined;
    return out;
  }
  // let go without a strike: the leg let down in the clip before locomotion has it
  if (out.held && out.rel < (speed > WIND.RUN ? WIND.REL_RUN : WIND.REL)){
    out.rel += Math.max(0, +dt || 0); out.hold = 0; out.over = 0;
    out.upper = on ? windUpper(wind, speed, out.up || (out.up = {})) : null;
    return out;
  }
  out.held = false; out.upper = null;
  return null;
}
export function windUpper(wind, speed, out){
  if (!(wind && (wind.kind === "shot" || wind.kind === "pass") && wind.p > 0) || !(speed > WIND.V)) return null;
  out.g = "windup"; out.side = wind.side === "L" ? "L" : "R"; out.w = clamp(+wind.p || 0, 0, 1)*(wind.kind === "pass" ? WIND.PASS : 1);
  return out;
}

function strike(h, T, st, dt){
  if (st.hold != null) return strikeHold(h, T, st, dt);
  const sp = strikeSpec(st), C = clock(h, "strike", st, sp);
  setBT(h);
  const k = kindOf(st.kind), K = KINDS[k], D = h.D, sc = BT.sc;
  const kickS = st.side === "L" || st.side === 1 ? 1 : -1, supS = -kickS;   // leg sides: +1 left, -1 right
  const iK = kickS > 0 ? 0 : 1, iS = 1 - iK;
  const d = C.data;
  if (!d.k){
    // the strike's fixed geometry, worked out when it starts
    d.k = k;
    startFeet(h, C);
    const f = aimOf(st, h, {x:0, z:0});
    d.fx = f.x; d.fz = f.z;
    const ball = st.ball || defaultBall(h, kickS, f);
    d.bx = ball.x; d.by = ball.y != null ? ball.y : BR; d.bz = ball.z;
    const Fp = C.feet[iS];
    const p = C.fromHold ? {x:Fp.x, z:Fp.z, yaw:BT.ry + Fp.yaw} : st.plant || plantSpot(k, kickS > 0 ? "L" : "R", {x:d.bx, y:d.by, z:d.bz}, f, sc, {x:0, z:0, yaw:0});
    // (from a held wind-up the support foot stays planted where the hold had it; every joint goes on from the held pose
    // under the same speed limit, so the hand-over needs no blend)
    if (C.fromHold) h.heldAt = null;
    d.px = p.x; d.pz = p.z; d.pyaw = wrap(p.yaw - BT.ry);
    // (the overhead kick's plant: turned at most 1.2 rad from the body's way on its step; the rest of the turn back to
    // the goal is made in the air, where no foot holds the leg)
    if (K.over) d.pyaw = clamp(d.pyaw, -1.2, 1.2);
    const F = C.feet[iS];
    d.sx0 = F.x; d.sy0 = F.y; d.sz0 = F.z; d.syaw0 = F.yaw; d.sp0 = F.pitch;
    // (a run-up's last step handed over in flight: the gait's swing as it was, read only)
    const gs = C.pre > 0 && !C.back && h.gait && h.gait.feet[iS] && h.gait.feet[iS].sw;
    if (gs){
      // the swing began at the ankle (x0, z0) of the footprint it left; the gait's footprint (heel point) runs along the foot
      d.sw = {u0:clamp(gs.u, 0, .95), x0:gs.x0, z0:gs.z0, y0:F.y, lift:gs.lift || .1*sc};
      // the start brought back so that at u0 the path is where the foot is now
      const k0 = ease(Math.min(1, d.sw.u0/.95));
      if (k0 < .98){ d.sw.x0 = (F.x - d.px*k0)/(1 - k0); d.sw.z0 = (F.z - d.pz*k0)/(1 - k0); }
      d.sw.y0 = F.y - d.sw.lift*Math.sin(Math.PI*d.sw.u0);
    }
    const Fk = C.feet[iK]; d.kx0 = Fk.x; d.ky0 = Fk.y; d.kz0 = Fk.z; d.kyaw0 = Fk.yaw; d.kp0 = Fk.pitch; d.kr0 = Fk.roll;
    // (was the striking foot on the ground when the plant came down? a walk-up's trailing foot often still is)
    d.kDown = !C.fromHold && (!h.gait || !h.gait.feet[iK] || h.gait.feet[iK].down);
    d.power = clamp(st.power != null ? +st.power : .7, 0, 1);
    d.lowHigh = clamp(+st.lowHigh || 0, -1, 1);
    d.curl = clamp(+st.curl || 0, -1, 1);
    d.gy = BT.gy;
    // the swing's speed at contact (3.5.7) and the time from the top of the backswing, kept to what the rig's joints
    // can turn (no bone faster than about 0.3 rad a frame at 60 Hz)
    d.vFoot = K.pass ? 4 + 10*d.power : 6 + 14*d.power;
  }
  const tau = C.tau, ct = K.contact, dur = K.dur;
  const ball = _b4; ball.x = d.bx; ball.y = d.by; ball.z = d.bz;
  const fx = d.fx, fz = d.fz;
  leftOf(fx, fz, _l2); const lx = _l2.x, lz = _l2.z;
  const F = C.feet, Fs = F[iS], Fk = F[iK];
  // --- the support foot: the plant step (inside the clip for a standing strike), then planted until after contact
  const tPre = -C.pre;
  const groundY = d.gy + D.ankY*sc;
  const tP = -(C.back || 0);                                // the plant comes down
  if (tau < tP && d.sw){
    // a run-up's last swing, taken over from the gait in flight: the same path it was on (from where the swing began,
    // over the ground with zero speed at both ends, the foot lifted at mid-swing), now ending on the plant exactly
    const v = clamp((tau - tPre)/Math.max(.05, tP - tPre), 0, 1), w = d.sw, u = w.u0 + (1 - w.u0)*v, k = ease(Math.min(1, u/.95));
    Fs.x = w.x0 + (d.px - w.x0)*k; Fs.z = w.z0 + (d.pz - w.z0)*k;
    Fs.y = lerp(w.y0, groundY, ease(u)) + w.lift*Math.sin(Math.PI*u)*(1 - sstep(.85, 1, u));
    Fs.yaw = lerp(d.syaw0, d.pyaw, ease(v)); Fs.pitch = lerp(d.sp0, 0, ease(v)); Fs.roll = 0; Fs.down = v >= 1;
  } else if (tau < tP){
    const u = clamp((tau - tPre)/Math.max(.05, tP - tPre), 0, 1), e = ease(u);
    Fs.x = lerp(d.sx0, d.px, e); Fs.z = lerp(d.sz0, d.pz, e); Fs.y = lerp(d.sy0, groundY, e) + .07*sc*bump(u);
    Fs.yaw = lerp(d.syaw0, d.pyaw, e); Fs.pitch = -.15*bump(u); Fs.roll = 0; Fs.down = u >= 1;
  } else {
    Fs.x = d.px; Fs.z = d.pz; Fs.y = groundY; Fs.yaw = d.pyaw; Fs.pitch = 0; Fs.roll = 0; Fs.down = true;
  }
  // --- the striking foot: from where it was, back to the top of the backswing, through the ball, up to the top of the
  // follow-through, then down onto its landing ahead
  const P = strikePath(h, C, d, k, K, kickS, tau, ball);
  Fk.x = P.x; Fk.y = P.y; Fk.z = P.z; Fk.yaw = P.yaw; Fk.pitch = P.pitch; Fk.roll = P.roll; Fk.down = P.down;
  // after contact: the body comes down onto the kicking foot; when the run carries on (the root still moving), the support
  // foot then comes off and steps through; a strike from a stand stays on it. The acrobatics take off from it.
  const moving = Math.hypot(C.vx, C.vz) > 1.2*sc;
  const sUp = K.acro ? .2 : moving || d.sMove ? P.tLand + .02 : 1e9;
  if (moving) d.sMove = true;
  if (tau > sUp){
    const tl = K.acro ? (k === "bicycle" ? .86 : .78) : Math.max(sUp + .2, Math.min(dur, sUp + .28));
    d.sLandT = tl;
    const u = clamp((tau - sUp)/Math.max(.05, tl - sUp), 0, 1);
    if (!d.sLand){
      // where it will land: ahead of where the root will be
      const dtl = Math.max(0, (tl - tau)/Math.max(.3, C.post));
      d.sLand = {x:C.rx + C.vx*dtl + (fx*.25 + lx*supS*.12)*sc, z:C.rz + C.vz*dtl + (fz*.25 + lz*supS*.12)*sc};
      if (K.acro){ d.sLand.x = d.px + fx*.1*sc*(K.over ? -1 : 1) + lx*supS*.05*sc; d.sLand.z = d.pz + fz*.1*sc*(K.over ? -1 : 1) + lz*supS*.05*sc; }
    }
    const e = ease(u);
    Fs.x = lerp(d.px, d.sLand.x, e); Fs.z = lerp(d.pz, d.sLand.z, e);
    Fs.y = groundY + (K.acro ? acroLeg(k, tau, sc) : .1*sc*bump(u)); Fs.yaw = lerp(d.pyaw, 0, e); Fs.pitch = K.acro ? .3*bump(u) : -.15*bump(u); Fs.down = u >= 1;
  }
  // the body: hips over the support foot, the turn of the hips through the swing, the lean
  strikeBody(h, T, C, d, k, K, kickS, tau, ball);
  // (the hips start where the gait had them and come to the strike's own over its first quarter second)
  if (!d.hip0){ d.hip0 = h.posed ? [h.pose[80], h.pose[81], h.pose[82]] : [0, 0, 0]; d.hipQ0 = h.posed ? [h.pose[4], h.pose[5], h.pose[6], h.pose[7]] : [0, 0, 0, 1]; }
  {
    // (and turned as they were: a run's pelvis twist and lean, eased out with the same curve)
    const e = sstep(0, .25, C.lastT); T[60] = lerp(d.hip0[0], T[60], e); T[61] = lerp(d.hip0[1], T[61], e); T[62] = lerp(d.hip0[2], T[62], e);
    if (e < 1){
      _E.set(T[3], T[4], T[5], "XYZ"); _Q2.setFromEuler(_E);
      _Q.set(d.hipQ0[0], d.hipQ0[1], d.hipQ0[2], d.hipQ0[3]).slerp(_Q2, e);
      _E.setFromQuaternion(_Q, "XYZ"); T[3] = _E.x; T[4] = _E.y; T[5] = _E.z;
    }
  }
  // the striking leg reaches the ball at contact: if the hips are too far from it, the body comes on toward it (all of
  // the way at the contact, easing in and out over a tenth of a second either side)
  // the support leg keeps a bend: the hips come down (at most 0.1) rather than the knee locking straight as the body
  // passes over or reaches for the plant
  if (!K.acro || tau < .15){
    const L = h.D.hipY - h.D.ankY;
    let drop = 0;
    // (and the plant step, over its last tenth of a second in the air: measured to where it will come down, so the leg
    // lands with its knee already bent; a leg that reaches the ground nearly straight has to fold fast as the hips
    // come over it, faster than a knee turns in a frame)
    const landing = !Fs.down && tau < tP && tau > tP - .12;
    for (const [f, s2] of [[Fs, supS], [Fk, kickS]]){
      const pre = f === Fs && landing;
      if (!f.down && !pre) continue;
      frameOf(h, T, LEG(s2)[0], _M); _V.setFromMatrixPosition(_M);
      if (pre) toB(d.px, groundY, d.pz, _b3); else toB(f.x, f.y, f.z, _b3);
      // (a foot behind the hips rolls onto its toes instead: only one ahead or under them asks the hips down)
      if (_b3.z < _V.z - .05) continue;
      const dl = Math.hypot(_b3.x - _V.x, _b3.y - _V.y, _b3.z - _V.z), dyv = _V.y - _b3.y;
      if (dl > .93*L && dyv > .1){
        const hz2 = dl*dl - dyv*dyv, want = .93*L, ny = Math.sqrt(Math.max(0, want*want - hz2));
        drop = Math.max(drop, Math.min(.1, Math.max(0, dyv - (ny > 0 ? ny : dyv - .1))));
      }
    }
    T[61] -= drop;
  }
  rateHips(h, T, dt);
  // (after the contact the shift it last needed eases away, rather than chasing the follow-through)
  if (tau <= ct){ reachHips(h, T, kickS, Fk, Math.exp(-Math.pow((tau - ct)/(K.acro ? .2 : .12), 2)), d.rh || (d.rh = {x:0, y:0, z:0})); }
  else if (d.rh){ const w = Math.exp(-Math.pow((tau - ct)/.2, 2)); T[60] += d.rh.x*w; T[61] += d.rh.y*w; T[62] += d.rh.z*w; }
  // the support foot's landing on its plant: a fast run-up carries the body on past it, so where the leg would not reach
  // the point it lands on, the hips come back toward it, easing in over the last tenth of a second of the step and out
  // over the first fifth of a second down (the leg then lands on its point instead of short of it)
  {
    // (an acrobatic strike stays on it until he takes off from it: the hips keep back over it to the take-off)
    const wEnd = K.acro ? sUp : tP + .1;
    const wl = sstep(tP - .1, tP, tau)*(1 - sstep(wEnd - .08, wEnd, tau));
    if (wl > .01){ _land.x = d.px; _land.y = groundY; _land.z = d.pz; reachHips(h, T, supS, _land, wl, null, true); }
  }
  // a held support leg that the body is leaving behind rolls up onto the ball of its foot (the heel rises), so its knee
  // keeps a bend instead of snapping straight
  // the striking foot, while it is still the one standing (a run-up's last step), rolls up onto its toes as the body
  // runs past it (the toe-off it would have had), and the knee keeps a bend
  if ((!K.acro || tau < .2) && Fk.down && tau < .02) d.hrK = heelRise(h, T, kickS, Fk, 1, d.hrK || 0, dt);
  else if (d.hrK && !Fk.down){ heelApply(Fk, d.hrK*(1 - sstep(tK0Of(C), tK0Of(C) + .1, tau))); }
  if (!K.acro && tau > ct - .06){
    if (tau <= sUp){ d.hr = heelRise(h, T, supS, Fs, sstep(ct - .06, ct + .06, tau), d.hr || 0, dt); d.hrLift = d.hr; }
    else if (d.hrLift){
      // the step through starts from the heel as it had risen, which lowers away over the first half of the step
      const u = clamp((tau - sUp)/Math.max(.05, (d.sLandT || sUp + .2) - sUp), 0, 1);
      heelApply(Fs, d.hrLift*(1 - sstep(0, .5, u)));
    }
  }
  // legs onto the feet
  for (let j = 0; j < 2; j++){ const i = j ? iK : iS;
    const f = F[i], s = i ? -1 : 1;
    kneeBlend(f, tau, i === iK ? tau > P.tLand - .12 && tau < P.tLand : (d.sLandT != null && tau > d.sLandT - .12 && tau < d.sLandT) || (tau > tP - .12 && tau < tP));
    legW(h, T, s, f.x, f.y, f.z, f.yaw, f.pitch, f.roll, i === iS && tau > ct && !K.acro ? .25*sstep(ct, ct + .1, tau)*(1 - sstep(sUp, sUp + .1, tau)) : 0, f.kb);
    // a foot on the ground is held there after the blend; one in the air is the pose's own (its knee kept as solved)
    // (the plant pass holds a standing foot only while the blend into the clip runs, 0.12 s: after it the pose's own
    // legs, solved onto the same points and kept under the joints' speed limit, stand there)
    // (and through its first tenth of a second down, the landing, where the swing's speed would outrun the limit)
    if (f.down && !f.wasDown) f.landT = tau;
    f.wasDown = f.down;
    // (the landing's hold eases in and out: the plant pass carries the pose's foot onto its point over a few frames
    // rather than in one)
    // (a foot already rolling onto its toe is let go at once: the plant pass would turn its shin to the heel's pitch)
    // (and once let go it stays free: taken again it would be pulled back onto its point in one frame)
    f.hold = f.hold !== false && f.down && C.lastT < .12 && Math.abs(f.y - f.y0) < .01 && Math.abs(f.pitch - (f.p0 || 0)) < .05;
    // (the support foot that has just landed on its plant is held on its point through its first tenth of a second,
    // letting go over the last forty milliseconds of it: below)
    f.land = i === iS && f.down && f.landT != null && f.landT <= tP + .02 && tau < sUp && !f.hold ? 1 - sstep(.06, .1, tau - f.landT) : 0;
    f.w = f.hold ? 1 : 0;
  }
  // let go from a held wind-up, the kicking leg swings in its joints: from the cocked pose straight to the one that
  // meets the ball (the leg solved onto the contact), arriving at the contact. (The foot's own path from up and back
  // there would ask its joints to turn faster at the end than any joint may in a frame, and arrive short)
  if (C.fromHold && tau <= ct){
    const lb = LEG(kickS);
    if (!d.hq){ d.hq = lb.map(b => [h.pose[b*4], h.pose[b*4 + 1], h.pose[b*4 + 2], h.pose[b*4 + 3]]); }
    legW(h, T, kickS, P.cx, P.cy, P.cz, P.cyaw, P.cpitch, P.croll, 0, Fk.kb);
    const u = Math.pow(clamp((tau - C.tau0)/Math.max(.05, ct - C.tau0), 0, 1), 1.25);
    for (let j = 0; j < lb.length; j++){
      const b = lb[j], q = d.hq[j];
      _Qa.set(q[0], q[1], q[2], q[3]); _Er.set(T[b*3], T[b*3 + 1], T[b*3 + 2], "XYZ"); _Qb.setFromEuler(_Er);
      _Qa.slerp(_Qb, u); _Er.setFromQuaternion(_Qa, "XYZ"); T[b*3] = _Er.x; T[b*3 + 1] = _Er.y; T[b*3 + 2] = _Er.z;
    }
  }
  rateLegs(h, T, C, dt);
  // the landing's hold: the hips came back for the plant above, so the pose's own leg, kept under the joints' speed
  // limit, stands on its point or within a few millimetres of it; the plant pass takes up only that much (held only
  // while the drawn ankle is within a centimetre of the point: a larger pull would turn a knee near straight faster
  // than any joint may turn in a frame)
  for (let j = 0; j < 2; j++){ const i = j ? iK : iS;
    const f = F[i];
    if (!(f.land > 0) || f.w) continue;
    frameOf(h, T, LEG(i ? -1 : 1)[2], _M); _V.setFromMatrixPosition(_M);
    toB(f.x, f.y, f.z, _b3);
    if (Math.hypot(_b3.x - _V.x, _b3.y - _V.y, _b3.z - _V.z)*sc < .01) f.w = f.land;
  }
  lockFeet(h, C);
  h.ev.reachErr = C.reachErr;
  // the camera channels (3.5.9): a strike pitches the view a touch and dips it at the plant
  camFx(h, (tau > 0 && tau < ct + .3 ? .015*bump(tau/(ct + .3)) : 0), tau > -.05 && tau < .2 ? -.02*bump((tau + .05)/.25) : 0, 0);
  // the floor for the low clips
  h.gw = K.acro ? acroGround(k, tau) : 0;
}
// a ball where a strike with no ball asked for would meet it: in front of the striking foot (drills, tests)
function defaultBall(h, s, f){
  setBT(h);
  toW(s*.12, BR/BT.sc, .55, _w3);
  return {x:_w3.x, y:BR, z:_w3.z};
}
const _sp = {x:0, y:0, z:0, yaw:0, pitch:0, roll:0, down:false, tLand:0};
/* the striking foot at clip time tau: an ankle point and the foot's turn */
function strikePath(h, C, d, k, K, s, tau, ball){
  const sc = BT.sc, D = h.D, ct = K.contact, dur = K.dur, fx = d.fx, fz = d.fz;
  leftOf(fx, fz, _l2); const lx = _l2.x, lz = _l2.z;
  // the aim and the body's facing in body space (the foot's yaw is in body space)
  dirB(fx, fz, _d2); const aimYaw = Math.atan2(_d2.x, _d2.z);
  const out = s;                                              // the striking leg's own outside (+x for the left leg)
  // the contact: the part's point a little into the ball, on the side away from the aim (lowHigh moves it up or down)
  const lift = K.lift, nl = Math.hypot(1, lift), nx = fx/nl, nz = fz/nl, ny = lift/nl;
  let part = K.part, cyaw = aimYaw, cpitch = .65, croll = 0;
  // (the inside of the foot square to the aim: the toes turned out, a right foot's to the right)
  if (part === "inside"){ cyaw = aimYaw + s*1.35; cpitch = .05; croll = 0; }
  if (part === "toe"){ cyaw = aimYaw; cpitch = .25; }
  if (k === "lofted"){ cpitch = .45; }
  if (K.side){ cyaw = aimYaw - out*.35; cpitch = .55; croll = out*1.15; }
  if (K.over){ cyaw = aimYaw + Math.PI; cpitch = 1.0; croll = 0; }
  if (K.rabona){ cyaw = aimYaw - out*.5; cpitch = .55; croll = -out*.3; }
  const into = .025;
  let cx = ball.x - nx*(BR - into), cy = ball.y - ny*(BR - into) + d.lowHigh*.05, cz = ball.z - nz*(BR - into);
  if (part === "toe"){ cy = ball.y - BR*.7; }
  if (K.over){ cx = ball.x - fx*(BR - into); cz = ball.z - fz*(BR - into); cy = ball.y + .02; }
  // keep the toes out of the grass: the part rises until the lowest point of the foot clears it by 1 cm
  ankleFor(h, part, s, cx, cy, cz, cyaw, cpitch, croll, _w3);
  const low = _w3.y + footLowRel(cyaw, cpitch, croll)*sc - d.gy;
  if (low < .01){ cy += .01 - low; _w3.y += .01 - low; }
  const ax = _w3.x, ay = _w3.y, az = _w3.z;
  // the backswing's top and the follow-through's top belong to the body, not the ball: they are placed from where the
  // root is now (a run carries the body on through a strike, so the backswing is behind the hips it has then and the
  // follow-through travels on with him); the contact alone is the ball's
  let bx, by, bz, byaw = aimYaw, bpitch = 1.2, broll = 0;
  const gy = d.gy, gx = BT.gx, gz = BT.gz, hx = D.hipX*sc*out;
  const back = (K.pass ? .3 : .42 + .1*d.power)*sc;
  const at = (al, la, o2) => { o2.x = gx + fx*al + lx*la; o2.z = gz + fz*al + lz*la; return o2; };
  if (K.side){ at(-.2*sc, hx + out*.55*sc, _a2); by = Math.max(gy + .35*sc, ball.y + .15*sc); byaw = aimYaw - out*.8; bpitch = .7; broll = out*.9; }
  else if (K.over){ _a2.x = ball.x + fx*.5*sc; _a2.z = ball.z + fz*.5*sc; by = ball.y - .9*sc; byaw = aimYaw + Math.PI; bpitch = .4; }
  else if (K.rabona){ at(-back, hx - out*.3*sc, _a2); by = gy + .45*sc; bpitch = 1.3; byaw = aimYaw + out*.4; }
  else if (part === "inside"){ at(-back, hx + out*.12*sc, _a2); by = gy + (.2 + .1*d.power)*sc; byaw = aimYaw + out*.7; bpitch = .6; }
  else { at(-back, hx + out*.04*sc, _a2); by = Math.max(gy + (part === "toe" ? .3 : .34 + .08*d.power)*sc, ball.y + .15*sc); }
  bx = _a2.x; bz = _a2.z;
  // a volley's backswing is a knee lift: the foot back under the seat at about the ball's height, never folded right up
  if (K.air && !K.side && !K.over){ by = gy + clamp(ball.y - gy - .15*sc, .3*sc, .5*sc); at(-back - .05*sc, hx, _a2); bx = _a2.x; bz = _a2.z; bpitch = .9; }
  // the follow-through's top: on along the aim and up (heights of 3.5.7), across toward the support side
  const ftH = K.ft*(K.pass ? .6 + .6*d.power : .7 + .45*d.power);
  at(.75*sc, hx - out*.18*sc, _a2);
  let tx = _a2.x, tz = _a2.z, ty = gy + ftH*sc;
  if (K.side){ at(.45*sc, -out*.25*sc, _a2); tx = _a2.x; tz = _a2.z; ty = Math.max(ty, ball.y + .1*sc); }
  if (K.over){ tx = ball.x - fx*.4*sc; tz = ball.z - fz*.4*sc; ty = ball.y + .2*sc; }
  // timing: one smooth curve from when the foot leaves (at the plant for a run-up, the swing already on its way back;
  // a strike from a stand lifts it as the plant comes down) through the backswing to the ball, arriving along the aim at
  // the foot's speed; then up into the follow-through and down onto its landing. (One cubic each side of the contact,
  // so no joint has to turn faster than about 0.3 rad a frame at 60 Hz.)
  const tK0 = C.back ? -C.back - .03 : 0, W = Math.max(.12, ct - tK0);
  const vend = clamp(.55*d.vFoot, 3.5, 8.5)*sc;
  // (the follow-through takes at most 45% of what is left after the contact; the landing has the rest)
  const dft = Math.hypot(tx - ax, ty - ay, tz - az), Tft = Math.min(clamp(dft/(.4*d.vFoot), .28, .4), (dur - ct)*.45);
  const tT = ct + Tft;
  // the landing of the striking foot: ahead of where the root will be, or (acrobatics) where he comes down
  const tL = K.acro ? (K.over ? 1.05 : .95) : dur - .02;
  // (worked out from the contact on: where the root is then and how it moves)
  if (!C.data.kLand && tau >= ct){
    const dtl = Math.max(0, tL - tau);
    C.data.kLand = {x:C.rx + C.vx*dtl + (fx*.2 + lx*out*.12)*sc, z:C.rz + C.vz*dtl + (fz*.2 + lz*out*.12)*sc};
    if (K.acro){ C.data.kLand.x = d.px + (lx*out*.3 - fx*.1)*sc; C.data.kLand.z = d.pz + (lz*out*.3 - fz*.1)*sc; }
  }
  const L = C.data.kLand || _w3;
  const ry = gy + D.ankY*sc;
  const o = _sp;
  o.tLand = tL;
  // (the contact itself: where the foot meets the ball and how it is turned, for a swing made in the joints)
  o.cx = ax; o.cy = ay; o.cz = az; o.cyaw = cyaw; o.cpitch = cpitch; o.croll = croll;
  if (tau <= tK0 && C.pre > 0){
    // the plant step (a stand's, or the last of a run-up's): this foot is the one standing
    o.x = d.kx0; o.y = d.ky0; o.z = d.kz0; o.yaw = d.kyaw0; o.pitch = d.kp0; o.roll = d.kr0; o.down = true;
  } else if (tau <= ct){
    // the controls: past the backswing's top (the curve turns short of it), and back from the ball along the way it is
    // struck by a third of the curve's time at the foot's speed
    // (a foot that was standing starts from rest: the curve's clock eases in, keeping its speed at the ball)
    // (the run in to the ball is kept short, so the curve never cuts up past the hip: a volley rises into the ball
    // from under it)
    const u0 = clamp((tau - tK0)/W, 0, 1), u = C.back || d.kDown ? u0*u0*(2 - u0) : u0, k3 = Math.min(vend*W/3, .35*sc);
    // (let go from a held wind-up the foot is already back and up: it whips straight on from there, no further back)
    const pb = C.fromHold ? 0 : 1, p1x = pb ? bx*1.35 - d.kx0*.35 : lerp(d.kx0, ax, .4), p1y = pb ? by*1.35 - d.ky0*.35 : d.ky0, p1z = pb ? bz*1.35 - d.kz0*.35 : lerp(d.kz0, az, .4);
    const p2x = ax - fx*k3, p2y = Math.max(gy + .06*sc, ay - ny*k3 - (K.air && !K.side && !K.over ? .25*sc : 0)), p2z = az - fz*k3;
    o.x = bez(d.kx0, p1x, p2x, ax, u); o.y = Math.max(gy + .02*sc, bez(d.ky0, p1y, p2y, ay, u)); o.z = bez(d.kz0, p1z, p2z, az, u);
    // the foot turns to the backswing's angle by 45% of the way, then to the contact's
    const e1 = ease(u/.45), e2 = ease((u - .45)/.55);
    o.yaw = u < .45 ? lerp(d.kyaw0, byaw, e1) : lerp(byaw, cyaw, e2);
    o.pitch = u < .45 ? lerp(d.kp0, bpitch, e1) : lerp(bpitch, cpitch, e2);
    o.roll = u < .45 ? lerp(d.kr0, broll, e1) : lerp(broll, croll, e2);
    o.down = u <= 0 && !C.fromHold;
    if (u >= 1){ o.x = ax; o.y = ay; o.z = az; o.yaw = cyaw; o.pitch = cpitch; o.roll = croll; }
  } else if (tau <= tT){
    // through: leaving the ball at the same speed and slowing to the top of the follow-through
    const u = (tau - ct)/Tft, m = Math.min(vend*Tft/3, .45*dft);
    o.x = bez(ax, ax + fx*m, tx, tx, u); o.z = bez(az, az + fz*m, tz, tz, u); o.y = bez(ay, ay + ny*m + (ty - ay)*.15, ty, ty, u);
    const e = ease(u);
    o.yaw = lerp(cyaw, aimYaw - out*.15, e); o.pitch = lerp(cpitch, .5, e); o.roll = lerp(croll, 0, e); o.down = false;
  } else {
    // down onto the landing
    const u = clamp((tau - tT)/Math.max(.05, tL - tT), 0, 1), e = ease(u);
    o.x = lerp(tx, L.x, e); o.z = lerp(tz, L.z, e); o.y = lerp(ty, ry, ease(Math.min(1, u*1.1)));
    o.yaw = lerp(aimYaw - out*.15, 0, e); o.pitch = lerp(.5, 0, e); o.roll = 0; o.down = u >= 1;
  }
  return o;
}
/* the body through a strike: the hips over the support foot and lowered at contact, the hips turning from open to
   through, the lean over the ball (back for a lofted ball or a volley), the arms out for balance, the head on the ball */
function strikeBody(h, T, C, d, k, K, s, tau, ball){
  const D = h.D, sc = BT.sc, ct = K.contact, dur = K.dur;
  if (K.acro) return acroBody(h, T, C, d, k, K, s, tau, ball);
  const sup = C.feet[s > 0 ? 1 : 0];
  toB(sup.x, sup.y, sup.z, _b3);
  const w = sstep(-.1, .08, tau)*(1 - sstep(ct + .2, dur, tau));
  // over the support foot (sideways), lowered by the bend of the support knee at contact
  T[60] = clamp(_b3.x*.45, -.13, .13)*w;
  const dip = (K.pass ? .035 : .06)*Math.exp(-Math.pow((tau - ct)/.14, 2));
  T[61] = -.02*w - dip;
  T[62] = clamp(_b3.z*.25, -.12, .12)*w;
  // the hips turn: open (the striking hip back) through the backswing, square or past it at contact
  const turn = kf(tau, [[-.1, 0], [ct*.55, -s*.38], [ct, s*.05], [ct + .18, s*.3], [dur, 0]]);
  const lean = K.side ? s*.45 : 0;
  const roll = kf(tau, [[-.1, 0], [ct*.5, s*.08], [ct, s*.12 + lean], [ct + .25, s*.05 + lean*.5], [dur, 0]]);
  R3(T, B.hips, .05*w, turn, roll);
  // the lean: over the ball for a low drive, back for a lofted ball, a chip or a volley
  const back = k === "lofted" ? -.16 : k === "chip" ? -.1 : K.air ? -.12 : .04;
  const lowH = d.lowHigh*-.06;
  const sp = kf(tau, [[-.1, .05], [ct*.5, -.06], [ct, .14 + back + lowH], [ct + .2, .1 + back*.5], [dur, .04]]);
  R3(T, B.spine, sp, -turn*.35, -roll*.4); R3(T, B.chest, .04 + sp*.3, -turn*.25, -roll*.3);
  R3(T, B.neck, .12, 0, 0); R3(T, B.head, .15, 0, 0);
  // arms: the support side's arm out wide, the striking side's swings back and through
  const sa = s > 0 ? -1 : 1;                                 // support arm side
  const wide = kf(tau, [[-.1, .25], [ct*.4, .95], [ct, 1.15], [ct + .3, .8], [dur, .2]]);
  armPose(T, sa, wide, kf(tau, [[-.1, .1], [ct, .45], [dur, .1]]), .45);
  armPose(T, -sa, kf(tau, [[-.1, .2], [ct, .55], [dur, .2]]), kf(tau, [[-.1, 0], [ct*.5, -.45], [ct, .35], [ct + .3, .6], [dur, .1]]), .5);
  lookAt(h, T, ball.x, ball.y, ball.z, 1 - sstep(ct + .15, ct + .45, tau)*.6);
}

// (prev, dt: the heel rises at most 7 rad/s from where it was)
function heelRise(h, T, s, f, w = 1, prev = 0, dt = 0){
  if (!f.down || !(w > 0)) return 0;
  const D = h.D, L = D.hipY - D.ankY;
  frameOf(h, T, LEG(s)[0], _M); _V.setFromMatrixPosition(_M);
  toB(f.x, f.y, f.z, _b3);
  const dl = Math.hypot(_b3.x - _V.x, _b3.y - _V.y, _b3.z - _V.z), ex = dl - .9*L;
  // the heel comes up about the ball of the foot (0.11 ahead of the ankle): the ankle rises and the foot pitches toes down
  let r = ex > 0 ? w*clamp(Math.asin(clamp(ex/.13, 0, .95)), 0, 1.1) : 0;
  if (dt > 0) r = clamp(r, prev - 7*dt, prev + 7*dt);
  if (!(r > 0)) return 0;
  heelApply(f, r);
  return r;
}
const tK0Of = C => C.back ? -C.back - .03 : 0;
function heelApply(f, r){
  if (!(r > 0)) return;
  const sc = BT.sc;
  f.y += (.11*Math.sin(r) + .085*(Math.cos(r) - 1))*sc;
  const fx = Math.sin(BT.ry + f.yaw), fz = Math.cos(BT.ry + f.yaw);
  f.x += fx*.11*(1 - Math.cos(r))*sc; f.z += fz*.11*(1 - Math.cos(r))*sc;
  f.pitch += r;
}
// bring the hips toward a foot's world target when the leg would not reach it (weight w of the shortfall)
const _land = {x:0, y:0, z:0};
function reachHips(h, T, s, f, w, keep = null, farOnly = false){
  if (keep){ keep.x = keep.y = keep.z = 0; }
  if (!(w > .01)) return;
  const D = h.D, L = (D.hipY - D.ankY)*.975;
  frameOf(h, T, LEG(s)[0], _M); _V.setFromMatrixPosition(_M);
  toB(f.x, f.y, f.z, _b3);
  // (too near is no better: a leg folded right up cannot strike, so the body leans away from a ball on top of it)
  const dx = _b3.x - _V.x, dy = _b3.y - _V.y, dz = _b3.z - _V.z, dl = Math.hypot(dx, dy, dz), near = .72*(D.hipY - D.ankY);
  const ex = dl > L ? dl - L : dl < near && !farOnly ? dl - near : 0;
  if (ex === 0 || dl < 1e-4) return;
  const k = clamp(ex, -.3, .35)*w/dl;
  T[60] += dx*k; T[61] += dy*k; T[62] += dz*k;
  if (keep){ keep.x = dx*k/w; keep.y = dy*k/w; keep.z = dz*k/w; }
}
/* ---------- the acrobatics (A1.5 hooks): scissor (side bicycle) and the overhead bicycle ----------
   Take-off from the plant at 0.2 s on a real jump (jumpRoot, the simulation's own curve), the body tips back (over the
   support side for the scissor, straight back for the bicycle) so the striking leg comes over at the ball's height, the
   legs scissor (the support leg kicks up first, the striking leg whips through it), and he lands on his hands and
   side or back; the get-up is chained after (the 'getup' clip, by the caller, or the clip's own end pose lying). */
function acroRise(k, tau){ const J = jumpRoot({v0:k === "bicycle" ? 3.6 : 3.1, tLoad:.2}, tau, _jr); return J.y; }
const _jr = {y:0, vy:0, air:false};
function acroLeg(k, tau, sc){ return 0; }
function acroGround(k, tau){ return sstep(k === "bicycle" ? .86 : .78, k === "bicycle" ? 1.0 : .92, tau); }
function acroBody(h, T, C, d, k, K, s, tau, ball){
  const D = h.D, sc = BT.sc, over = !!K.over;
  const rise = acroRise(k, tau)/sc, land = over ? .86 : .78;
  // tip: back (bicycle) or over the support side (scissor), most at contact, then down to the ground
  const tip = kf(tau, over ? [[0, 0], [.2, .25], [.42, 1.55], [.7, 1.75], [.86, 1.55], [1.45, 1.5]] : [[0, 0], [.2, .15], [.36, 1.05], [.6, 1.25], [.78, 1.4], [1.25, 1.4]]);
  const down = sstep(land - .05, land + .15, tau);
  // the hips rise with the jump, then lie at the height of a body on its back or side
  T[61] = lerp(-.04 + rise, -(D.hipsY - .16), down) - .08*Math.exp(-Math.pow((tau - .1)/.07, 2));
  T[60] = over ? 0 : -s*.0; T[62] = over ? lerp(0, -.25, down) : 0;
  if (over) R3(T, B.hips, -tip, 0, 0);
  else R3(T, B.hips, -tip*.25, s*.35*sstep(.1, .4, tau), s*tip);
  R3(T, B.spine, over ? .25*sstep(.3, .5, tau) : .2, 0, over ? 0 : -s*.15); R3(T, B.chest, over ? .2 : .1, 0, 0);
  R3(T, B.neck, over ? .45 : .2, over ? 0 : -s*.3, 0); R3(T, B.head, over ? .3 : .2, 0, 0);
  // arms: out and back to break the fall
  armPose(T, 1, kf(tau, [[0, .3], [.3, 1.1], [land, 1.3], [1.4, 1.2]]), kf(tau, [[0, 0], [.3, over ? -.6 : -.2], [land, over ? -.9 : -.4], [1.4, -.6]]), .3);
  armPose(T, -1, kf(tau, [[0, .3], [.3, 1.1], [land, 1.3], [1.4, 1.2]]), kf(tau, [[0, 0], [.3, over ? -.6 : -.2], [land, over ? -.9 : -.4], [1.4, -.6]]), .3);
  lookAt(h, T, ball.x, ball.y, ball.z, 1 - down);
}

/* ====================================================================================================
   RECEIVING (3.5.7; P6-A, TRAINING-SPEC 5: anticipation, adjustment steps, foot placement, body orientation, hip and
   torso rotation, arms and balance, weight transfer, contact timing, deceleration or redirection, recovery and
   transition; never an animation where the ball is not, no excessive locking). The part is touch.js touchPart's, the
   one the simulation takes it with: the inside of the foot ('inside'), the sole on a slow ball ('sole'), the inside of
   a raised foot for a ball in the air to the side ('air'), the thigh, the chest. The outcome is touch.js's; the clip
   shows it, on the whole body over planted feet:
   - anticipation: the knees give and the hips come down, the arms come out for balance, the head and then the chest
     and the hips turn to the ball (the hips' turn is the whole body's: the feet are held where they stand, so it is
     never a turret's turn of the trunk over still legs);
   - the adjustment step: the support foot is set beside where the ball will be met (a little behind it, out to its
     own side); when it is not there already (more than STEP from it) it steps there and lands before the contact
     (the clip's PLANT event, C.data.steps), so a ball off the line is reached by a step, not by a leg stretched out;
     on the run the same step is the stride's plant, where the run will have taken the body by then;
   - weight transfer: the hips go over the support foot as it lands, and on toward the ball for the contact (the part
     is brought onto the ball: the hips are moved, at most REACH, rather than the leg straining);
   - the contact: the part is on the ball (st.ball, which the view keeps on the simulation's own contact point up to
     the contact) at the simulation's contact moment (st.tc), and gives with it (cushion x 0.6 x its speed x 0.12, at
     most 0.25 m) along its way, then on into the way the touch goes (st.push) for a redirection;
   - recovery and transition: the receiving foot comes down where the next stride will put it (ahead of the root on
     the run) and the hips come back up; the clip is over at most POST s after the contact (the view hands the body
     back to the gait then), so the body is never held in it longer than that. */
const RECV = {inside:{dur:.62, contact:.32}, sole:{dur:.58, contact:.30}, air:{dur:.64, contact:.32}, thigh:{dur:.64, contact:.32}, chest:{dur:.66, contact:.34}};
// STEP: how far the support foot may be from its spot before it steps (m, x height); LIFT: its step's height; REACH:
// the most the hips move to bring the part onto the ball; POST: the clip's end after the contact (on the run, RUN_POST)
// (the chest and the thigh: the body steps in to the ball, the support foot planted under where the hips will be, BODY_BACK
// m short of the ball's centre, chest or thigh, and the hips go on to it by at most REACH_BODY; a foot's ball further
// out than FOOT_BACK m from the hips at the contact: the hips go in toward it with the support foot's step by the rest)
export const RCV = Object.freeze({STEP:.16, LIFT:.07, REACH:.32, POST:.3, RUN_POST:.16, RUN_V:2.2, SUP_BACK:.18, SUP_OUT:.2, SUP_MAX:.62,
  BODY_BACK:{chest:.26, thigh:.3}, REACH_BODY:.5, FOOT_BACK:.5, FOOT_RUN:[5, 2.5]});
const RECV_EV = [];
function recvSpec(st){
  const R0 = RECV[st.part] || RECV.inside, v = st.rootV ? Math.hypot(st.rootV.x, st.rootV.z) : 0;
  _spec.contact = R0.contact; _spec.dur = Math.min(R0.dur, R0.contact + (v > RCV.RUN_V ? RCV.RUN_POST : RCV.POST));
  _spec.pre = 0; _spec.begin = null; _spec.events = RECV_EV;
  return _spec;
}
const _rp = {x:0, y:0, z:0}, _rq = {x:0, y:0, z:0};
// a part's point in body space (from the pose being written: T)
function partB(h, T, part, s, out){
  if (part === "chest"){ frameOf(h, T, B.chest, _M); _V.set(0, .08, .13); }
  else if (part === "thigh"){ frameOf(h, T, LEG(s)[0], _M); _V.set(0, -.25, .08); }
  else { frameOf(h, T, LEG(s)[2], _M); partLocal(part === "air" ? "inside" : part, s, _pl); _V.set(_pl[0], _pl[1], _pl[2]); }
  _V.applyMatrix4(_M); out.x = _V.x; out.y = _V.y; out.z = _V.z;
  return out;
}
// (the receive clip's keyframes, every frame for every receiving body: on scratch arrays, not new ones each call)
const KF4 = [[0, 0], [0, 0], [0, 0], [0, 0]], KF3 = [[0, 0], [0, 0], [0, 0]];
function kf4(t, a0, v0, a1, v1, a2, v2, a3, v3){
  KF4[0][0] = a0; KF4[0][1] = v0; KF4[1][0] = a1; KF4[1][1] = v1; KF4[2][0] = a2; KF4[2][1] = v2; KF4[3][0] = a3; KF4[3][1] = v3;
  return kf(t, KF4);
}
function kf3(t, a0, v0, a1, v1, a2, v2){
  KF3[0][0] = a0; KF3[0][1] = v0; KF3[1][0] = a1; KF3[1][1] = v1; KF3[2][0] = a2; KF3[2][1] = v2;
  return kf(t, KF3);
}
// the receive clip's legs onto its feet (the support foot's knee eased as it plants, the receiving foot's as it lands)
function recvLegs(h, T, F, d, tau, j){
  for (let k = 0; k < 2; k++){
    const f = F[k], sk = k ? -1 : 1;
    kneeBlend(f, tau, k === j ? d.step && tau > d.tDown - .12 && tau < d.tDown : tau > d.tLand - .12 && tau < d.tLand);
    legW(h, T, sk, f.x, f.y, f.z, f.yaw, f.pitch, f.roll, 0, f.kb);
  }
}
function receive(h, T, st, dt){
  const part = RECV[st.part] ? st.part : "inside", sp = recvSpec(st);
  const C = clock(h, "receive", st, sp);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, s = st.side === "L" || st.side === 1 ? 1 : -1, i = s > 0 ? 0 : 1, j = 1 - i, sup = -s;
  const ct = sp.contact, dur = sp.dur, tau = C.tau;
  const groundY = BT.gy + D.ankY*sc;
  // the ball: where the simulation meets it (kept on it by the view up to the contact)
  // (read up to and including the frame of the contact: the view puts it on the simulation's own point then)
  if (!d.ballSet){
    const b = st.ball || defaultBall(h, s, aimOf({}, h, _d2));
    d.bx = b.x; d.by = b.y != null ? b.y : BR; d.bz = b.z;
    if (C.contactDone) d.ballSet = true;
  }
  if (!d.id){
    d.id = 1;
    startFeet(h, C);
    const F = C.feet;
    // the way it comes (its travel) and how far the part gives with it
    const v = st.ballV || null, spd = v ? Math.hypot(v.x, v.y || 0, v.z) : 8, vl = v ? Math.hypot(v.x, v.z) : 0;
    if (vl > .3){ d.vx = v.x/vl; d.vz = v.z/vl; }
    else { const bx = d.bx - BT.gx, bz = d.bz - BT.gz, bl = Math.hypot(bx, bz) || 1; d.vx = -bx/bl; d.vz = -bz/bl; }
    d.give = Math.min(.25, (st.cushion != null ? +st.cushion : .7)*.6*spd*.12)*sc;
    // the way the touch goes (the receiver's own way: keys or look), else on along the ball's
    const pu = st.push, pl = pu ? Math.hypot(pu.x, pu.z) : 0;
    d.ux = pl > .1 ? pu.x/pl : d.vx; d.uz = pl > .1 ? pu.z/pl : d.vz;
    d.gy = BT.gy;
    d.rv = st.rootV ? {x:+st.rootV.x || 0, z:+st.rootV.z || 0} : {x:0, z:0};
    d.run = Math.hypot(d.rv.x, d.rv.z) > RCV.RUN_V;
    // the receiving foot and the support foot as they stand
    const Fk = F[i], Fs = F[j];
    d.kx0 = Fk.x; d.ky0 = Fk.y; d.kz0 = Fk.z; d.kyaw0 = Fk.yaw; d.kp0 = Fk.pitch;
    d.sx0 = Fs.x; d.sy0 = Fs.y; d.sz0 = Fs.z; d.syaw0 = Fs.yaw; d.sp0 = Fs.pitch;
    // where the root will be at the contact (the run carried on), and the support foot's spot there: beside the ball,
    // a little behind it on its way, out to its own side; no further from the root than a step
    const tLeft = Math.max(0, (ct - tau)/Math.max(.7, C.rate || 1));
    const rx = BT.gx + d.rv.x*tLeft, rz = BT.gz + d.rv.z*tLeft;
    const lx0 = BT.c, lz0 = -BT.s;                              // the body's left in the world
    const ox = sup*RCV.SUP_OUT*sc*lx0, oz = sup*RCV.SUP_OUT*sc*lz0;
    let px = d.bx + ox, pz = d.bz + oz;
    // (behind the ball along the line from it to the root: the foot plants short of it)
    const tx = rx - d.bx, tz = rz - d.bz, tl = Math.hypot(tx, tz) || 1;
    px += tx/tl*RCV.SUP_BACK*sc; pz += tz/tl*RCV.SUP_BACK*sc;
    // (the chest and the thigh are taken square on, the support foot under the body)
    d.ax = 0; d.az = 0; d.along = 0;
    if (part === "inside" || part === "sole" || part === "air"){
      // (a ball further out than a leg reaches from where the hips are (FOOT_BACK): the hips go in toward it with the
      // support foot's step, the weight onto that foot, so the foot is put on it rather than a leg stretched for it;
      // at a sprint the stride itself carries him onto it, so less of it, none from FOOT_RUN[0] + FOOT_RUN[1] m/s)
      const bx = d.bx - rx, bz = d.bz - rz, bl = Math.hypot(bx, bz) || 1, rv = Math.hypot(d.rv.x, d.rv.z);
      const kRun = clamp(1 - (rv - RCV.FOOT_RUN[0])/RCV.FOOT_RUN[1], 0, 1);
      d.ax = bx/bl; d.az = bz/bl; d.along = kRun*Math.min(RCV.SUP_MAX*sc, Math.max(0, bl - RCV.FOOT_BACK*sc));
    }
    if (part === "chest" || part === "thigh"){
      // (stepped in to it: under where the hips take the ball, BODY_BACK short of its centre)
      const bx = d.bx - rx, bz = d.bz - rz, bl = Math.hypot(bx, bz) || 1;
      d.ax = bx/bl; d.az = bz/bl; d.along = Math.min(RCV.SUP_MAX*sc, Math.max(0, bl - RCV.BODY_BACK[part]*sc));
      px = rx + ox*.5 + d.ax*d.along; pz = rz + oz*.5 + d.az*d.along;
    }
    const pdx = px - rx, pdz = pz - rz, pdl = Math.hypot(pdx, pdz), mx = RCV.SUP_MAX*sc;
    if (pdl > mx){ px = rx + pdx/pdl*mx; pz = rz + pdz/pdl*mx; }
    d.px = px; d.pz = pz;
    // the support foot turned to the ball's way as it plants (square on to where the ball comes from)
    dirB(-d.vx, -d.vz, _d2); const faceYaw = Math.atan2(_d2.x, _d2.z);
    d.faceYaw = faceYaw;
    d.pyaw = clamp(wrap(faceYaw*.6), -1.1, 1.1);
    // does it need the step? (on the run it always does: it is the stride's plant)
    d.step = d.run || Math.hypot(Fs.x - px, Fs.z - pz) > RCV.STEP*sc || Math.abs(wrap(Fs.yaw - d.pyaw)) > .7;
    d.tUp = d.run ? 0 : .03; d.tDown = Math.max(.12, ct - .1);
    if (!d.step){ d.px = Fs.x; d.pz = Fs.z; d.pyaw = Fs.yaw; }
    d.steps = 0; d.plantT = -1;
    // the receiving foot comes down after the contact where the next stride puts it: beside the support foot, ahead of
    // the root by the time it lands, a little into the touch's way
    d.tLand = Math.min(dur - .02, ct + (d.run ? .12 : .2));
    const tL = Math.max(0, (d.tLand - tau)/Math.max(.7, C.rate || 1));
    d.lx = BT.gx + d.rv.x*tL + s*.12*sc*lx0 + d.ux*.12*sc; d.lz = BT.gz + d.rv.z*tL + s*.12*sc*lz0 + d.uz*.12*sc;
  }
  const F = C.feet, Fk = F[i], Fs = F[j];
  dirB(-d.vx, -d.vz, _d2); const faceYaw = Math.atan2(_d2.x, _d2.z);
  // --- the support foot: the adjustment step (lift, swing, land before the contact), then planted
  if (d.step && tau < d.tDown){
    const u = clamp((tau - d.tUp)/Math.max(.05, d.tDown - d.tUp), 0, 1), e = ease(u);
    Fs.x = lerp(d.sx0, d.px, e); Fs.z = lerp(d.sz0, d.pz, e); Fs.y = lerp(d.sy0, groundY, e) + RCV.LIFT*sc*bump(u);
    Fs.yaw = lerp(d.syaw0, d.pyaw, e); Fs.pitch = lerp(d.sp0, 0, e) - .15*bump(u); Fs.roll = 0; Fs.down = u >= 1;
  } else {
    if (d.step && d.plantT < 0){ d.plantT = tau; d.steps++; fire(h, C, EV.PLANT, C.lastT, Math.max(0, dt), C.lastT); }
    Fs.x = d.px; Fs.z = d.pz; Fs.y = groundY; Fs.yaw = d.pyaw; Fs.pitch = 0; Fs.roll = 0; Fs.down = true;
    // on the run the support foot comes off again after the contact (the next stride takes it through)
    if (d.run && tau > ct + .04){ const u = clamp((tau - ct - .04)/.12, 0, 1); Fs.y = groundY + .05*sc*bump(u*.5); Fs.pitch = .35*sstep(0, 1, u); Fs.down = u <= 0; }
  }
  // --- the receiving part: to the ball for the contact, giving with it, then down where the next stride lands
  const gk = sstep(ct, ct + .14, tau)*(1 - sstep(ct + .16, dur, tau)*.4);
  const gx = (d.vx*.7 + d.ux*.3)*d.give*gk, gz = (d.vz*.7 + d.uz*.3)*d.give*gk;
  const lift0 = d.run ? 0 : .06;                                // (standing, the weight goes onto the support foot first)
  const uIn = clamp((tau - lift0)/Math.max(.08, ct - lift0), 0, 1), eIn = ease(uIn);
  const uOut = clamp((tau - ct - .1)/Math.max(.06, d.tLand - ct - .1), 0, 1), eOut = ease(uOut);
  if (part === "inside" || part === "sole" || part === "air"){
    // the face of the foot onto the ball: the inside turned to meet it (raised, for a ball in the air), the sole on top
    const yaw = part === "sole" ? faceYaw*.5 : faceYaw + s*(part === "air" ? 1.15 : 1.35), pitch = part === "sole" ? -.45 : part === "air" ? .25 : .05;
    // (the face against the ball's near side, pressed a little into it: where the ball's centre and the face meet)
    const px = d.bx + (part === "sole" ? 0 : d.vx*BR*.5) + gx, pz = d.bz + (part === "sole" ? 0 : d.vz*BR*.5) + gz;
    const py = part === "sole" ? d.by + BR*.6 : d.by;
    d.tx = px; d.ty = py; d.tz = pz;
    ankleFor(h, part === "air" ? "inside" : part, s, px, py, pz, yaw, pitch, 0, _w3);
    Fk.x = lerp(d.kx0, _w3.x, eIn); Fk.z = lerp(d.kz0, _w3.z, eIn); Fk.y = lerp(d.ky0, _w3.y, eIn) + .06*sc*bump(uIn)*(part === "air" ? 0 : 1);
    Fk.yaw = lerp(d.kyaw0, yaw, eIn); Fk.pitch = lerp(d.kp0, pitch, eIn); Fk.roll = 0;
    if (tau > ct + .1){
      Fk.x = lerp(_w3.x, d.lx, eOut); Fk.z = lerp(_w3.z, d.lz, eOut); Fk.y = lerp(_w3.y, groundY, eOut) + .04*sc*bump(uOut);
      Fk.yaw = lerp(yaw, faceYaw*.3, eOut); Fk.pitch = lerp(pitch, 0, eOut);
    }
    Fk.down = tau < lift0 || uOut >= 1;
  } else if (part === "thigh"){
    // the thigh comes up under the ball (the knee as high as the ball asks) and drops away with it
    const lift = kf4(tau, 0, 0, ct, 1, ct + .15, .7, dur, 0), hb = clamp((d.by - d.gy)/sc - .4, 0, .6)/.55;
    // (from where it stood, carried in with the body's step to the ball)
    const ein = ease(clamp(tau/Math.max(.1, ct), 0, 1));
    toB(d.kx0 + d.ax*d.along*ein, d.ky0, d.kz0 + d.az*d.along*ein, _b3);
    toW(_b3.x, D.ankY + (.1 + .14*hb)*lift, _b3.z + (.14 + .16*hb)*lift, _w3);
    Fk.x = _w3.x; Fk.y = _w3.y; Fk.z = _w3.z; Fk.yaw = 0; Fk.pitch = .6*lift; Fk.roll = 0; Fk.down = lift <= 0;
  } else {
    // the chest: both feet stay (the support foot set under the body), the receiving foot steps back a touch to brace
    const u = clamp((tau - .04)/.2, 0, 1), e = ease(u);
    // (it follows the body's step in to the ball by half, behind the support foot)
    toB(d.kx0 + d.ax*d.along*.5*e, d.ky0, d.kz0 + d.az*d.along*.5*e, _b3);
    toW(_b3.x, D.ankY, _b3.z - .08*e, _w3);
    Fk.x = _w3.x; Fk.y = lerp(d.ky0, _w3.y, e) + .04*sc*bump(u); Fk.z = _w3.z; Fk.yaw = lerp(d.kyaw0, 0, e); Fk.pitch = 0; Fk.roll = 0; Fk.down = u >= 1;
  }
  // --- the whole body: anticipation (down and set), the turn to the ball from the hips, the weight over the support
  // foot as it lands and on toward the ball for the contact, back up after
  const wIn = sstep(0, .14, tau)*(1 - sstep(dur - .14, dur, tau));
  const wC = Math.exp(-Math.pow((tau - ct)/.12, 2));
  const turn = clamp(faceYaw, -1.4, 1.4);
  T[61] = -(.035 + (part === "inside" || part === "sole" ? .03 : 0))*wIn - .03*wC;
  T[60] = sup*.045*sstep(0, d.tDown, tau)*(1 - sstep(ct, ct + .2, tau))*wIn;
  // (the chest and the thigh: the hips go in with the step to the ball and come part of the way back after)
  if (d.along > 0){
    dirB(d.ax, d.az, _d2); const k = d.along*kf4(tau, 0, 0, ct, 1, ct + .12, 1, dur, .35);
    T[60] += _d2.x*k; T[62] += _d2.z*k;
  }
  R3(T, B.hips, .04*wIn, turn*.38*wIn, 0);
  R3(T, B.spine, (part === "chest" ? 0 : .1)*wIn, turn*.14*wIn, -sup*.04*wC);
  R3(T, B.chest, (part === "chest" ? 0 : .05)*wIn, turn*.1*wIn, 0);
  // arms out for balance: the side of the receiving leg out and a little back, the other forward across the body; for
  // the chest both out wide and clear of the ball (no handball)
  if (part === "chest"){
    const arch = kf4(tau, 0, 0, ct - .06, -.3, ct + .1, -.2, dur, 0);
    R3(T, B.spine, arch*.6, turn*.14*wIn, 0); R3(T, B.chest, arch*.5, turn*.1*wIn, 0);
    const o = kf3(tau, 0, .3, ct, 1.25, dur, .35);
    armPose(T, 1, o, .15, .6); armPose(T, -1, o, .15, .6);
  } else {
    armPose(T, s, .3 + .45*wIn, -.15*wIn, .4); armPose(T, sup, .25 + .3*wIn, .35*wIn, .55);
  }
  // the head: on the ball as it comes, still on it through the touch, then up to see what is next
  const bn = st.ballNow || {x:d.bx, y:d.by, z:d.bz};
  lookAt(h, T, bn.x, bn.y, bn.z, 1 - .5*sstep(ct + .1, dur, tau));
  // legs onto the feet; then the part onto the ball: the hips move (at most REACH) to put it there at the contact
  recvLegs(h, T, F, d, tau, j);
  if (wC > .02 && (tau < ct + .1)){
    // where the part is in the pose, against where it has to be (the ball's centre, its own face on the ball's surface)
    partB(h, T, part, s, _rp);
    // (the foot's face where the foot was put on the ball above; the thigh and the chest on the ball's near surface)
    const body = part === "chest" || part === "thigh";
    if (body) toB(d.bx + d.vx*BR*.5, d.by, d.bz + d.vz*BR*.5, _rq); else toB(d.tx, d.ty, d.tz, _rq);
    let ex = _rq.x - _rp.x, ey = _rq.y - _rp.y, ez = _rq.z - _rp.z;
    // (the feet stay down: the hips go no lower than a bent knee allows, and for a foot the leg reaches as well)
    const el = Math.hypot(ex, ey, ez), mx = body ? RCV.REACH_BODY : RCV.REACH;
    if (el > mx){ ex *= mx/el; ey *= mx/el; ez *= mx/el; }
    T[60] += ex*wC; T[61] += clamp(ey, -.12, body ? .1 : .06)*wC; T[62] += ez*wC;
    recvLegs(h, T, F, d, tau, j);
  }
  rateHips(h, T, dt, 2.2);
  rateLegs(h, T, C, dt);
  for (let k = 0; k < 2; k++){
    const f = F[k];
    if (f.down && !f.wasDown) f.landT = tau;
    f.wasDown = f.down;
    f.hold = f.hold !== false && f.down && C.lastT < .12 && Math.abs(f.y - f.y0) < .01;
    f.w = f.down && (f.hold || (k === j && (!d.step || tau >= d.tDown))) ? 1 : 0;
  }
  lockFeet(h, C);
  h.ev.reachErr = C.reachErr;
  if (part === "chest") camFx(h, 0, -.03*bump(clamp((tau - ct + .1)/.3, 0, 1)), 0);
  else camFx(h, .01*wC, -.015*wIn, 0);
  h.gw = 0;
}
/* the receiver's readiness before the clip (P6-A anticipation): a ball coming to him a second or so away, nothing to
   do with it yet. st = {ball: {x, y, z} where it is, w}: the head on it, the chest turned a little to it, the arms off
   the body; over whatever the legs are doing */
function upReady(h, T, st){
  const b = st.ball; if (!b) return;
  setBT(h); toB(b.x, b.y, b.z, _hb);
  const yaw = clamp(Math.atan2(_hb.x, Math.max(.1, _hb.z)), -1, 1);
  R3(T, B.spine, .06, yaw*.15, 0); R3(T, B.chest, .03, yaw*.15, 0);
  armPose(T, 1, .32, .1, .45); armPose(T, -1, .32, .1, .45);
  lookAt(h, T, b.x, b.y, b.z);
}
upReady.mask = [[B.spine, .5], [B.chest, .7], [B.neck, 1], [B.head, 1], [ARM(1)[0], .6], [ARM(1)[1], .6], [ARM(-1)[0], .6], [ARM(-1)[1], .6]];

/* ====================================================================================================
   HEADERS (3.5.7, A1.5): standing (0.55 / 0.25), a jump (jumpRoot: height 0.55 jump, load 0.18 s, contact at the apex
   less 0.05 s, the neck and chest extend then flex over 0.12 s, landing on its footprints, 0.25 s recovering) and the
   diving header (the body launched flat at the ball, head first, landing on the hands and chest, the get-up after).
   The forehead is put on the ball at contact by moving the whole upper body (hips offset), as far as the body can.
   ==================================================================================================== */
export function headerPlan(st, scale = 1){
  // (the drills' legacy call, st.t with no take: the jumping header the old clip was)
  const take = st.take || (st.jump > 0 || (st.t != null && st.tc == null) ? "jump" : "stand");
  if (take === "stand") return {take, dur:.55, contact:.25, tLoad:0, v0:0};
  if (take === "dive") return {take, dur:1.05, contact:.32, tLoad:.12, v0:0};
  const hgt = .55*clamp(st.jump != null ? +st.jump : 1, 0, 1.2)*scale, v0 = Math.sqrt(2*G*Math.max(.02, hgt));
  const tLoad = .18, contact = tLoad + v0/G - .05, air = 2*v0/G;
  return {take, dur:tLoad + air + .25 + .1, contact, tLoad, v0, land:tLoad + air};
}
function header(h, T, st, dt){
  const hp = headerPlan(st, h.scale || 1);
  _spec.dur = hp.dur; _spec.contact = hp.contact; _spec.pre = 0; _spec.begin = null;
  _spec.events = hp.take === "jump" ? [[EV.TAKEOFF, hp.tLoad], [EV.LAND, hp.land]] : hp.take === "dive" ? [[EV.TAKEOFF, hp.tLoad], [EV.LAND, hp.contact + .25]] : RECV_EV;
  const C = clock(h, "header", st, _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, tau = C.tau, ct = hp.contact;
  if (!d.id){
    d.id = 1; startFeet(h, C); d.gy = BT.gy;
    const f = aimOf(st, h, {x:0, z:0}); d.fx = f.x; d.fz = f.z;
    const b = st.ball;
    if (b){ d.bx = b.x; d.by = b.y; d.bz = b.z; }
    else { toW(0, hp.take === "dive" ? .7 : 1.75 + (hp.v0*hp.v0/(2*G))/sc, hp.take === "dive" ? 1.2 : .12, _w3); d.bx = _w3.x; d.by = _w3.y; d.bz = _w3.z; }
    d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw}));
  }
  if (hp.take === "dive") return diveHeader(h, T, C, d, hp, st);
  // legacy drills ask for st.t with their own ball: the old clip's shape on the new timing
  const J = hp.take === "jump" ? jumpRoot({v0:hp.v0, tLoad:hp.tLoad}, tau, _jr) : null;
  const rise = J ? J.y : 0, air = J ? J.air : false;
  // the body's rise in body units, less what the owner already carries in the group
  const riseB = Math.max(0, rise - Math.max(0, BT.gy - d.gy))/sc;
  const load = J ? Math.exp(-Math.pow((tau - hp.tLoad*.7)/.08, 2)) : 0;
  const landT = hp.land || 0, recov = J ? Math.exp(-Math.pow((tau - landT - .06)/.07, 2))*sstep(landT - .02, landT + .02, tau) : 0;
  // the neck and chest: back (cocked) before contact, through it over 0.12 s
  const cock = kf(tau, [[0, 0], [ct - .14, -.3], [ct - .02, -.18], [ct + .1, .35], [ct + .3, .1], [hp.dur, 0]]);
  T[61] = riseB - .14*load - .12*recov - (hp.take === "stand" ? .04*bump(tau/hp.dur) : 0);
  // the forehead onto the ball at contact: the upper body shifts (at most 0.3 m sideways or along), as the jump allows
  const wC = Math.exp(-Math.pow((tau - ct)/.12, 2));
  R3(T, B.hips, .05 + .15*load, 0, 0);
  R3(T, B.spine, .05 + cock*.5 + .2*load, 0, 0); R3(T, B.chest, cock*.35, 0, 0);
  R3(T, B.neck, cock*.5, 0, 0); R3(T, B.head, cock*.4, 0, 0);
  frameOf(h, T, B.head, _M); _V.set(BROW[0], BROW[1], BROW[2]).applyMatrix4(_M);
  toB(d.bx, d.by, d.bz, _b3);
  // the brow meets the ball's back (the side away from the aim)
  dirB(d.fx, d.fz, _d2);
  const tx = _b3.x - _d2.x*BR*.9/sc, tz = _b3.z - _d2.z*BR*.9/sc, ty = _b3.y;
  T[60] += clamp(tx - _V.x, -.3, .3)*wC; T[62] += clamp(tz - _V.z, -.3, .3)*wC;
  if (!air) T[61] += clamp(ty - _V.y, -.25, 0)*wC;
  // arms: up and forward for the leap (elbows out to the sides), down through the landing
  const aUp = J ? kf(tau, [[0, .2], [hp.tLoad*.8, -.4], [hp.tLoad + .1, 1.6], [ct, 1.3], [ct + .2, .5], [hp.dur, .15]]) : .3 + .3*wC;
  armPose(T, 1, J ? .5 + .2*sstep(hp.tLoad, ct, tau) : .35, aUp, 1.0); armPose(T, -1, J ? .5 + .2*sstep(hp.tLoad, ct, tau) : .35, aUp, 1.0);
  // the feet: on their footprints; in the air they come off them, tucked a little, and land where they left
  const F = C.feet;
  for (let j = 0; j < 2; j++){
    const f = F[j], f0 = d.f0[j], s = j ? -1 : 1;
    if (air){
      const tuck = Math.min(.2, (rise > 0 ? .5*rise : 0))/sc;
      toB(f0.x, f0.y, f0.z, _b3); toW(_b3.x, T[61] + D.ankY + .02 + tuck*(j ? .6 : 1), _b3.z - tuck*.4, _w3);
      f.x = _w3.x; f.y = Math.max(f0.y, _w3.y); f.z = _w3.z; f.pitch = .5*sstep(0, .1, rise); f.w = 1;
    } else { f.x = f0.x; f.y = f0.y; f.z = f0.z; f.pitch = 0; f.w = 1; }
    f.yaw = f0.yaw; f.roll = 0;
    legW(h, T, s, f.x, f.y, f.z, f.yaw, f.pitch, 0);
  }
  lockFeet(h, C);
  camFx(h, 0, 0, 0, .05*Math.exp(-Math.pow((tau - ct - .05)/.06, 2)));
  h.gw = 0;
}
/* the diving header: from a stride, launched at the ball (the body's centre on a ballistic line that puts the brow on the
   ball at contact), head first and flat, the arms reaching forward to land on, then lying until the clip ends */
export function diveHeaderRoot(p0, ball, f, tc, tLoad, out){
  // p0: the root at the start (world), ball: the contact point (world); the brow is 0.95 m ahead of the hips flat out
  const t = Math.max(.12, tc - tLoad), cx = ball.x - f.x*.95, cz = ball.z - f.z*.95, cy = Math.max(.25, ball.y - .05);
  out.vx = (cx - p0.x)/t; out.vz = (cz - p0.z)/t; out.vy = (cy - .95)/t + .5*G*t; out.t = t; out.cy = cy;
  return out;
}
const _dh = {vx:0, vy:0, vz:0, t:0, cy:0};
function diveHeader(h, T, C, d, hp, st){
  const D = h.D, sc = BT.sc, tau = C.tau, ct = hp.contact, f = {x:d.fx, z:d.fz};
  if (!d.dv){ d.dv = Object.assign({}, diveHeaderRoot({x:C.feet[0].x*.5 + C.feet[1].x*.5, z:C.feet[0].z*.5 + C.feet[1].z*.5}, {x:d.bx, y:d.by, z:d.bz}, f, ct, hp.tLoad, _dh)); d.p0x = (C.feet[0].x + C.feet[1].x)/2; d.p0z = (C.feet[0].z + C.feet[1].z)/2; }
  const dv = d.dv, t = Math.max(0, tau - hp.tLoad), land = ct + .25;
  // the centre of the body along the flight, down onto the chest at landing, a short slide
  const tf = Math.min(t, land - hp.tLoad);
  let cx = d.p0x + dv.vx*tf, cz = d.p0z + dv.vz*tf, cy = Math.max(.2, .95 + dv.vy*tf - .5*G*tf*tf);
  if (tau > land){ const u = Math.min(tau - land, .2), sl = u - u*u/.4; cx += dv.vx*.3*sl; cz += dv.vz*.3*sl; cy = .2; }
  if (tau < hp.tLoad){ cx = d.p0x; cz = d.p0z; cy = .95 - .12*sstep(0, hp.tLoad, tau); }
  // pitch: upright to flat (head first) by contact
  const pitch = kf(tau, [[0, .1], [hp.tLoad, .35], [ct, 1.45], [land, 1.55], [hp.dur, 1.55]]);
  toB(cx, cy, cz, _b3);
  T[60] = _b3.x; T[62] = _b3.z; T[61] = _b3.y - D.hipsY;
  R3(T, B.hips, pitch, 0, 0); R3(T, B.spine, -.15, 0, 0); R3(T, B.chest, -.15, 0, 0);
  R3(T, B.neck, -.55*sstep(hp.tLoad, ct, tau), 0, 0); R3(T, B.head, -.25*sstep(hp.tLoad, ct, tau), 0, 0);
  // arms forward and down to take the landing
  const reach = sstep(ct - .1, land, tau);
  armPose(T, 1, .45, lerp(.6, 2.0, reach), lerp(.6, .25, reach)); armPose(T, -1, .45, lerp(.6, 2.0, reach), lerp(.6, .25, reach));
  // legs trail straight out behind
  const F = C.feet;
  for (let j = 0; j < 2; j++){
    const ff = F[j], s = j ? -1 : 1;
    if (tau < hp.tLoad){ legW(h, T, s, ff.x, ff.y, ff.z, ff.yaw, 0, 0); ff.w = 1; continue; }
    const LG = LEG(s); R3(T, LG[0], lerp(-.1, .05, sstep(hp.tLoad, ct, tau)), 0, s*.08); R3(T, LG[1], lerp(.5, .25 + .15*j, sstep(hp.tLoad, ct, tau))); R3(T, LG[2], .7); R3(T, LG[3], 0);
    ff.w = 0;
  }
  // forehead exactly on the ball at contact: shift the body by what is left
  const wC = Math.exp(-Math.pow((tau - ct)/.1, 2));
  frameOf(h, T, B.head, _M); _V.set(BROW[0], BROW[1], BROW[2]).applyMatrix4(_M);
  toB(d.bx, d.by, d.bz, _b3); dirB(d.fx, d.fz, _d2);
  T[60] += (_b3.x - _d2.x*BR*.9/sc - _V.x)*wC; T[61] += (_b3.y - _V.y)*wC; T[62] += (_b3.z - _d2.z*BR*.9/sc - _V.z)*wC;
  lockFeet(h, C);
  h.gw = sstep(land - .05, land + .1, tau);
  camFx(h, 0, 0, 0, .05*Math.exp(-Math.pow((tau - ct)/.06, 2)));
}

/* ====================================================================================================
   TACKLES (3.5.7; P2b-B, TRAINING-SPEC 3): the tackling foot is put on the real contact point. st.target {x, y, z} is
   where the simulation has the foot meet the ball (act.contact), st.side the ball's side of the body (that leg
   tackles), st.reach the simulation's reach (duel.js standReach, the poke's further): the foot never goes further from
   the body than the simulation lets it, and the body lunges for it (the hips lowered and carried toward the ball, the
   support foot stepping in when the lunge is long) so the leg is never stretched past its length. Standing 0.70 / 0.30,
   poke 0.50 / 0.18, the block 0.60. The slide runs on slideRoot at the act's own carried speed (st.v0), along its own
   way (st.dir), slowed by the grass (st.decel), the tackling leg out along the grass on the ball's side and guided to
   the contact; down until the get-up, which ends with the act (st.dur: the slide, then the recovery by Agility).
   ==================================================================================================== */
const TACK = {stand:{dur:.70, contact:.30}, poke:{dur:.50, contact:.18}, slide:{dur:1.9, contact:.35}, block:{dur:.60, contact:.25}};
// the clip's length: a slide's is the act's own (its slide and the recovery), the others the table's
const tackDur = (kind, st) => kind === "slide" && st && st.dur > .8 ? +st.dur : TACK[kind].dur;
// how far a leg reaches, hip joint to ankle, straight (a share of its length: never locked straight)
const LEG_REACH = .97;
function tackle(h, T, st, dt){
  const kind = TACK[st.kind] ? st.kind : st.t != null ? "slide" : "stand", K0 = TACK[kind], dur = tackDur(kind, st);
  _spec.dur = dur; _spec.contact = K0.contact; _spec.pre = 0; _spec.begin = null; _spec.events = kind === "slide" ? [[EV.LAND, .2]] : RECV_EV;
  const C = clock(h, "tackle", st, _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, tau = C.tau, ct = K0.contact, s = st.side === "L" || st.side === 1 ? 1 : -1, i = s > 0 ? 0 : 1;
  if (!d.id){
    d.id = 1; startFeet(h, C); d.gy = BT.gy;
    const tg = st.target || (() => { toW(s*.15, 0, kind === "poke" ? 1.0 : .85, _w3); return {x:_w3.x, y:BR, z:_w3.z}; })();
    d.tx = tg.x; d.ty = tg.y != null ? tg.y : BR; d.tz = tg.z;
    d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw}));
    d.root0 = {x:BT.gx, z:BT.gz};
    if (kind === "slide"){
      // the slide's way: the act's (st.dir, world), else the way the body faces
      const dl = st.dir ? Math.hypot(st.dir.x, st.dir.z) : 0;
      d.slide = {x:BT.gx, z:BT.gz, dx:dl > 1e-6 ? st.dir.x/dl : Math.sin(BT.ry), dz:dl > 1e-6 ? st.dir.z/dl : Math.cos(BT.ry), v0:Math.max(1.5, st.v0 || 5), decel:st.decel > 0 ? st.decel : 6};
    } else d.slide = null;
  }
  // the contact point is followed until the foot gets there (a ball the carrier touches on is followed), then kept
  if (tau < ct && st.target){ d.tx = st.target.x; d.ty = st.target.y != null ? st.target.y : BR; d.tz = st.target.z; }
  const F = C.feet;
  // (a slide whose contact comes sooner than the clip can be sped up to: the foot is guided on to it at the clip time
  // the real contact falls on, not at the table's)
  if (kind === "slide"){
    const ctS = C.legacy || !isFinite(C.tcAt) ? ct : C.contactDone ? C.contact - C.reachErr : Math.min(ct, C.tau + C.rate*Math.max(0, C.tcAt - C.lastT));
    return slidePose(h, T, C, d, s, tau, false, dur, ctS);
  }
  // standing, poke, block: the face of the foot that meets the ball on the contact point (the inside for a standing
  // tackle, turned out across the ball's way; the toe for a poke; the block's inside, square)
  const part = kind === "poke" ? "toe" : "inside";
  const fyaw = kind === "block" ? s*-1.2 : kind === "poke" ? 0 : s*-.9, fpitch = kind === "poke" ? .5 : .1;
  // (no further from the body than the simulation's reach: its reach is from the body to the ball's centre)
  let cx = d.tx, cz = d.tz;
  const reach = st.reach > 0 ? +st.reach : kind === "poke" ? 1.15 : 1.05;
  { const rx = cx - BT.gx, rz = cz - BT.gz, rl = Math.hypot(rx, rz); if (rl > reach){ cx = BT.gx + rx/rl*reach; cz = BT.gz + rz/rl*reach; } }
  ankleFor(h, part, s, cx, Math.max(d.ty, BR*.6), cz, fyaw, fpitch, 0, _w3);
  _w3.y = Math.max(_w3.y, d.gy + D.ankY*sc*.8);
  const u = kf(tau, [[0, 0], [ct, 1], [ct + (kind === "poke" ? .1 : .18), 1], [dur, 0]]);
  // the lunge: how far the hip joint has to come (lowered first, then carried toward the ball) for the leg to reach
  toB(_w3.x, _w3.y, _w3.z, _b3);
  const Lmax = LEG_REACH*(D.hipY - D.ankY), hx = _b3.x - s*D.hipX, hz = _b3.z, hd = Math.hypot(hx, hz);
  const need = y => Math.max(0, hd - Math.sqrt(Math.max(0, Lmax*Lmax - (D.hipY - y - _b3.y)*(D.hipY - y - _b3.y))));
  let drop = .12;
  if (need(drop) > 0) drop = Math.min(.32, drop + need(drop)*.6);
  const shift = Math.min(.55, need(drop)*1.04), sx = hd > 1e-6 ? hx/hd*shift : 0, sz = hd > 1e-6 ? hz/hd*shift : 0;
  const f0 = d.f0[i], Fk = F[i], Fs = F[1 - i], f1 = d.f0[1 - i];
  Fk.x = lerp(f0.x, _w3.x, u); Fk.z = lerp(f0.z, _w3.z, u); Fk.y = lerp(f0.y, _w3.y, u) + .06*sc*bump(clamp(tau/ct, 0, 1));
  Fk.yaw = fyaw*u; Fk.pitch = fpitch*u; Fk.roll = 0;
  // the support foot steps in behind the lunge (as far as the hips are carried, before the contact), so the support
  // leg stays under the body; with no lunge it stays where it is
  const step = shift*sstep(0, ct*.8, tau)*(1 - sstep(ct + .2, dur, tau));
  toW(shift > 1e-6 ? sx/shift*step : 0, 0, shift > 1e-6 ? sz/shift*step : 0, _a3);
  const ox = _a3.x - BT.gx, oz = _a3.z - BT.gz;
  Fs.x = f1.x + ox; Fs.y = f1.y + (shift > .05 ? .05*sc*bump(clamp(tau/(ct*.8), 0, 1)) : 0); Fs.z = f1.z + oz; Fs.yaw = f1.yaw; Fs.pitch = 0; Fs.roll = 0;
  // the body lowers, carries over the support leg toward the ball and leans into it, the arms out for balance
  T[61] = -drop*u; T[60] = (sx - s*.05)*u; T[62] = (sz - .05)*u;
  R3(T, B.hips, .15*u, s*.2*u, -s*.08*u); R3(T, B.spine, .2*u + .25*shift*u); R3(T, B.chest, .05); R3(T, B.neck, .1); R3(T, B.head, .2);
  armPose(T, 1, .3 + .6*u, .2, .5); armPose(T, -1, .3 + .6*u, .2, .5);
  lookAt(h, T, d.tx, d.gy + .1, d.tz);
  for (let j = 0; j < 2; j++){ const f = F[j]; legW(h, T, j ? -1 : 1, f.x, f.y, f.z, f.yaw, f.pitch, f.roll); f.w = 1; }
  lockFeet(h, C);
  h.gw = 0;
}
const _a3 = {x:0, y:0, z:0};
/* the slide (and the knee slide of a celebration, upright): the body along slideRoot, down on the hip, the tackling leg
   out along the grass (the ball's side: the right leg as drawn, mirrored for the left), the trailing knee folded, a
   hand back to the grass; the tackling foot guided onto the contact around the contact time; the get-up over the last
   0.9 s of the act */
function slidePose(h, T, C, d, s, tau, knees, dur = 1.9, ct = .35){
  const D = h.D, sc = BT.sc, S = d.slide;
  const R = slideRoot(S, tau, _sr);
  toB(R.x, d.gy, R.z, _b3);                                   // where the slide has got to, from the group
  const tUp = Math.max(.6, dur - .9), tEnd = Math.max(tUp + .5, dur);
  const down = knees ? sstep(0, .25, tau) : kf(tau, [[0, 0], [.2, 1], [tUp, 1], [tUp + .4, .55], [tEnd, 0]]);
  const up = knees ? 0 : sstep(tUp, tEnd, tau);
  if (knees){
    // on both knees, upright, arms out (the celebration)
    T[60] = _b3.x; T[62] = _b3.z; T[61] = -(.42*down);
    R3(T, B.hips, -.25*down); R3(T, B.spine, -.25*down); R3(T, B.chest, -.2*down); R3(T, B.neck, -.25*down); R3(T, B.head, -.2*down);
    for (let j = 0; j < 2; j++){ const s2 = j ? -1 : 1, LG = LEG(s2); R3(T, LG[0], lerp(0, .25, down), 0, s2*.05); R3(T, LG[1], lerp(.1, 2.2, down)); R3(T, LG[2], lerp(0, .9, down)); R3(T, LG[3], 0); }
    armPose(T, 1, lerp(.3, 1.4, down), lerp(0, .3, down), .2); armPose(T, -1, lerp(.3, 1.4, down), lerp(0, .3, down), .2);
    C.feet[0].w = C.feet[1].w = 0; lockFeet(h, C); h.gw = down; return;
  }
  // (m: 1 with the right leg out, the pose as drawn; -1 mirrors it for the left)
  const m = -s;
  T[60] = _b3.x + m*.03*down; T[62] = _b3.z + .05*down; T[61] = -.72*down;
  R3(T, B.hips, -.5*down, m*.2*down, m*-.35*down);
  R3(T, B.spine, .14*down + .3*up, m*-.15*down, m*.2*down); R3(T, B.chest, .06*down, m*-.1*down, m*.1*down); R3(T, B.neck, .15*down, 0, m*.1*down); R3(T, B.head, .2*down, 0, m*.05*down);
  const tR = LEG(-m), tL = LEG(m);
  R3(T, tR[0], lerp(0, -1.1, down), 0, m*lerp(0, .06, down)); R3(T, tR[1], lerp(.1, .12, down)); R3(T, tR[2], lerp(0, -.25, down)); R3(T, tR[3], 0);
  R3(T, tL[0], lerp(0, -1.15, down), m*lerp(0, 1.45, down), 0); R3(T, tL[1], lerp(.1, 1.95, down)); R3(T, tL[2], lerp(0, .35, down)); R3(T, tL[3], 0);
  // a hand back to the grass, the other up for balance; through the get-up the hand pushes off
  R3(T, ARM(m)[0], lerp(.05, .55, down), 0, m*lerp(.1, .55, down)); R3(T, ARM(m)[1], lerp(-.15, -.2, down)); R3(T, ARM(m)[2], -.4*down);
  R3(T, ARM(-m)[0], lerp(.05, -1.25, down), 0, m*lerp(-.1, -.55, down)); R3(T, ARM(-m)[1], lerp(-.15, -.6, down));
  // the tackling foot onto the contact: its laces meet the ball as the slide gets there (eased in before, out after)
  const wc = d.tx != null && up <= 0 ? sstep(ct - .2, ct - .02, tau)*(1 - sstep(ct + .12, ct + .35, tau))*down : 0;
  if (wc > 0){
    ankleFor(h, "laces", -m, d.tx, Math.max(d.ty, BR*.6), d.tz, 0, -.2, 0, _w3);
    // (as far as the leg reaches from where the slide has the hip; a contact a little beyond it brings the hip on
    // toward it, up to 0.3 m, as a slider stretches into the ball; anything further is the slide's own carry)
    let tw = _tmpT(T); frameOf(h, tw, tR[0], _M); _V.setFromMatrixPosition(_M); toB(_w3.x, _w3.y, _w3.z, _b4);
    let ex = _b4.x - _V.x, ey = _b4.y - _V.y, ez = _b4.z - _V.z, el = Math.hypot(ex, ey, ez);
    const Lm = LEG_REACH*(D.hipY - D.ankY), hl = Math.hypot(ex, ez);
    if (el > Lm && hl > 1e-6){
      const sh = Math.min(el - Lm, .3)*wc;
      T[60] += ex/hl*sh; T[62] += ez/hl*sh;
      tw = _tmpT(T); frameOf(h, tw, tR[0], _M); _V.setFromMatrixPosition(_M);
      ex = _b4.x - _V.x; ey = _b4.y - _V.y; ez = _b4.z - _V.z; el = Math.hypot(ex, ey, ez);
    }
    if (el > Lm){ const k = Lm/el; _b4.x = _V.x + ex*k; _b4.y = _V.y + ey*k; _b4.z = _V.z + ez*k; }
    legIK(h, tw, -m, _b4.x, _b4.y, _b4.z, 0);
    for (const b of tR) for (let c = 0; c < 3; c++) T[b*3 + c] = lerp(T[b*3 + c], tw[b*3 + c], wc);
  }
  if (up > 0){
    // standing again: the legs come under the body onto the ground where it stopped
    for (let j = 0; j < 2; j++){ const s2 = j ? -1 : 1; legIK(h, _tmpT(T), s2, s2*(D.hipX + .03), D.ankY, _b3.z + (j ? -.05 : .1), 0); }
    for (const b of [12, 13, 14, 15, 16, 17, 18, 19]) for (let c = 0; c < 3; c++) T[b*3 + c] = lerp(T[b*3 + c], _TT[b*3 + c], sstep(.3, 1, up));
  }
  C.feet[0].w = C.feet[1].w = 0; lockFeet(h, C);
  h.gw = down;
  camFx(h, 0, -.04*down, 0, 0);
}
const _sr = {x:0, z:0, v:0};
const _TT = new Float32Array(63);
function _tmpT(T){ _TT.set(T); return _TT; }

/* ====================================================================================================
   THROW-IN (3.5.7): feet locked throughout, both hands on the ball 0.10 m behind the head, the arch -0.30 then the
   whip; 1.0 s, release at 0.62 (EV.RELEASE). The run-up variant drags the trailing toe.
   UF-A (USER-ISSUES U6): the clip starts where the taker already holds the ball, overhead in both hands (THROW_HOLD,
   where the simulation keeps a thrower's ball: rules.js handsOf, 0.28 m ahead at 2.0 m), takes it back behind the
   head (the wind-up), and brings it through to that same point at the release, so the ball the simulation lets go
   leaves the hands there; the hands come off it only after the release. heldBall(h) is the ball between the hands, for
   the view to draw it there while it is held (the simulation's ball is still, held at THROW_HOLD).
   ==================================================================================================== */
export const THROW_HOLD = {y:2.0, z:.28, w:.13};
function throwin(h, T, st, dt){
  _spec.dur = 1.0; _spec.contact = .62; _spec.pre = 0; _spec.begin = null; _spec.events = null;
  const C = clock(h, "throwin", st, _spec);
  setBT(h);
  const D = h.D, sc = BT.sc, d = C.data, tau = C.tau;
  if (!d.id){ d.id = 1; startFeet(h, C); d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw})); }
  // RELEASE is the clip's contact moment (scheduled like a strike's)
  if ((h.ev.mask & EV.CONTACT) && !(C.fired & EV.RELEASE)){ C.fired |= EV.RELEASE; h.ev.mask |= EV.RELEASE; }
  const arch = kf(tau, [[0, 0], [.35, -.3], [.5, -.32], [.62, .2], [.8, .3], [1, .05]]);
  // (the knees keep a little bend through the follow-through: legs pulled straight by the hips coming forward would lift
  // the heels off their footprints)
  const kneeB = kf(tau, [[0, 0], [.4, .08], [.62, .045], [1, .035]]);
  T[61] = -kneeB; T[62] = -.05*sstep(0, .45, tau) + .06*sstep(.5, .7, tau);
  R3(T, B.hips, arch*.3); R3(T, B.spine, arch*.6); R3(T, B.chest, arch*.5); R3(T, B.neck, -arch*.3); R3(T, B.head, -arch*.2);
  // the ball: held overhead, taken back behind the head (the wind-up), then over it and away; both hands on it (0.12 m
  // behind the head at the top of the wind-up). At 0 and at the release the hands are at THROW_HOLD with the hips'
  // offset of that moment taken back out, so the ball is where the simulation holds it and lets it go
  const H0 = THROW_HOLD, kb = .045, kz = -.011;          // the knees' bend and the hips' shift at the release (below)
  const bz = kf(tau, [[0, H0.z], [.3, -.12], [.5, -.27], [.62, H0.z - kz], [.75, .45], [1, .3]]);
  const by = kf(tau, [[0, H0.y], [.3, 1.92], [.5, 1.88], [.62, H0.y + kb], [.75, 1.6], [1, 1.2]]);
  const off = tau < .62 ? 0 : sstep(.62, .72, tau);       // the hands come off the ball after the release
  for (let s = 1; s >= -1; s -= 2){
    armIK(h, T, s, s*(H0.w + .06*off), by + T[61], bz + T[62] - (tau < .62 ? 0 : .1*off), -s*.4, -.2, [.6, -.1, -.5]);
  }
  const F = C.feet;
  for (let j = 0; j < 2; j++){
    const f = F[j], f0 = d.f0[j];
    f.x = f0.x; f.y = f0.y; f.z = f0.z; f.yaw = f0.yaw; f.pitch = 0; f.roll = 0; f.w = 1;
    // the run-up variant: the trailing toe drags (the heel up, the toes on the grass)
    legW(h, T, j ? -1 : 1, f.x, f.y + (st.run && j === 1 ? .05*sc*sstep(.3, .62, tau) : 0), f.z, f.yaw, st.run && j === 1 ? .5*sstep(.3, .62, tau) : 0, 0);
  }
  lockFeet(h, C);
  h.gw = 0;
}

/* ====================================================================================================
   CELEBRATIONS, GET-UP, TIRED (3.5.7)
   ==================================================================================================== */
function celebrate(h, T, st, dt){
  const style = st.style || "armsUp";
  _spec.dur = style === "kneeSlide" ? 3 : 1e9; _spec.contact = 1e8; _spec.pre = 0; _spec.begin = null; _spec.events = null;
  const C = clock(h, "celebrate", st, _spec);
  setBT(h);
  const D = h.D, d = C.data, t = C.tau;
  if (!d.id){ d.id = 1; startFeet(h, C); d.gy = BT.gy; d.f0 = C.feet.map(f => ({x:f.x, y:f.y, z:f.z, yaw:f.yaw}));
    d.slide = {x:BT.gx, z:BT.gz, dx:Math.sin(BT.ry), dz:Math.cos(BT.ry), v0:Math.max(3, st.v0 || 5), decel:4}; }
  if (style === "kneeSlide") return slidePose(h, T, C, d, 1, t, true);
  const F = C.feet;
  let hop = 0;
  if (style === "armsUp"){
    hop = .07*Math.abs(Math.sin(t*5.2));
    T[61] = -.04 + hop/h.scale; R3(T, B.hips, -.05); R3(T, B.spine, -.15); R3(T, B.chest, -.12); R3(T, B.neck, -.15); R3(T, B.head, -.25, .2*Math.sin(t*1.3), 0);
    for (let s = 1; s >= -1; s -= 2){ const p = Math.sin(t*5.2 + (s > 0 ? 0 : 1)); const a = ARM(s); R3(T, a[0], -2.75 + .15*p, 0, s*.38); R3(T, a[1], -.35 - .45*Math.max(0, p)); R3(T, a[2], -.2); }
  } else if (style === "fistPump"){
    const p = Math.max(0, Math.sin(t*6));
    T[61] = -.08; R3(T, B.hips, .05); R3(T, B.spine, .15 + .1*p); R3(T, B.chest, .05); R3(T, B.neck, -.1); R3(T, B.head, -.15);
    armPose(T, 1, .25, -.1 + 1.2*p, 1.9 - .4*p, -.4); armPose(T, -1, .35, .3, .4);
  } else {
    // arms out, wheeling (the aeroplane): leaning into a slow turn
    const sw = Math.sin(t*1.4);
    T[61] = -.03; R3(T, B.hips, .05, 0, .15*sw); R3(T, B.spine, .08, 0, .1*sw); R3(T, B.chest, 0, 0, .08*sw); R3(T, B.head, -.1, -.2*sw, 0);
    armPose(T, 1, 1.45, .05, .15); armPose(T, -1, 1.45, .05, .15);
  }
  for (let j = 0; j < 2; j++){
    const f = F[j], f0 = d.f0[j];
    f.x = f0.x; f.z = f0.z; f.y = f0.y + (hop > .03 ? hop - .03 : 0); f.yaw = f0.yaw; f.pitch = hop > .03 ? .3 : 0; f.roll = 0; f.w = 1;
    legW(h, T, j ? -1 : 1, f.x, f.y, f.z, f.yaw, f.pitch, 0);
  }
  lockFeet(h, C);
  h.gw = 0;
}
/* getting up off the grass (front: off the chest; back: off the back; side: off a hip): a hand planted, a knee brought
   under, up through a crouch onto the feet. 0.9 s; the caller chains it after a slide, a diving header or a fall. */
export const GETUP = {front:.9, back:1.0, side:.9};
function getup(h, T, st, dt){
  const from = GETUP[st.from] ? st.from : "front", dur = st.dur || GETUP[from];
  _spec.dur = dur; _spec.contact = 1e8; _spec.pre = 0; _spec.begin = null; _spec.events = null;
  const C = clock(h, "getup", st, _spec);
  setBT(h);
  const D = h.D, tau = C.tau, u = clamp(tau/dur, 0, 1), d = C.data;
  if (!d.id){ d.id = 1; startFeet(h, C); }
  getupPose(h, T, from, u, st.side || 1);
  C.feet[0].w = C.feet[1].w = 0; lockFeet(h, C);
  h.gw = 1 - sstep(.55, .85, u);
}
/* the get-up's pose at progress u (0 lying, 1 standing), shared with the keeper's get-up (gkmoves.js) */
export function getupPose(h, T, from, u, side = 1){
  const D = h.D;
  // lying -> on hands and a knee -> crouched on the feet -> standing
  const lie = 1 - sstep(0, .35, u), crouch = sstep(.2, .6, u)*(1 - sstep(.6, 1, u)), stand = sstep(.6, 1, u);
  const pitchLie = from === "back" ? -1.5 : from === "side" ? 0 : 1.5, rollLie = from === "side" ? side*1.5 : 0;
  const hipsP = lerp(lerp(pitchLie, .9, sstep(0, .35, u)), .05, stand) + (from === "back" ? .3*crouch : 0);
  const hipsR = rollLie*lie;
  T[61] = lerp(-(D.hipsY - .2), lerp(-.55, 0, stand), sstep(0, .45, u));
  T[62] = -.1*crouch; T[60] = 0;
  R3(T, B.hips, hipsP*(1 - stand) + .05*stand, 0, hipsR);
  R3(T, B.spine, lerp(.1, .4, crouch)*(1 - stand) + .03*stand); R3(T, B.chest, .1*(1 - stand));
  R3(T, B.neck, lerp(-.5, -.2, u)*(1 - stand)); R3(T, B.head, -.2*(1 - stand));
  // legs: folded under (a knee on the grass), then onto the feet
  const kneel = sstep(.1, .45, u)*(1 - stand);
  for (let s = 1; s >= -1; s -= 2){
    const LG = LEG(s), lead = s === side;
    if (stand > .01 || kneel > .01){
      legIK(h, T, s, s*(D.hipX + .04), D.ankY + (lead ? 0 : .05*kneel), lead ? .15 : -.3*kneel, lead ? 0 : .6*kneel);
      if (lie > .01) for (let c = 0; c < 4; c++){ const b = LG[c]; T[b*3] = lerp(T[b*3], c === 1 ? .2 : c === 2 ? .4 : 0, lie); T[b*3 + 1] *= 1 - lie; T[b*3 + 2] = lerp(T[b*3 + 2], c === 0 ? s*.08 : 0, lie); }
    } else { R3(T, LG[0], 0, 0, s*.08); R3(T, LG[1], .2); R3(T, LG[2], .4); R3(T, LG[3], 0); }
  }
  // arms: a hand pushes off the grass, then they come down by the sides
  const push = (1 - stand)*sstep(0, .2, u);
  armPose(T, 1, lerp(.2, .35, push), lerp(.0, 1.1, push), lerp(.3, .1, push)); armPose(T, -1, lerp(.2, .35, push), lerp(.0, 1.1, push), lerp(.3, .1, push));
}
// standing, hands on the thighs, breathing hard (fatigue above 0.7 while standing)
function tired(h, T, st, dt){
  const D = h.D, t = h.t, br = Math.sin(t*3.2);
  T[61] = -.1; T[62] = -.03;
  R3(T, B.hips, .45); R3(T, B.spine, .35 + .03*br); R3(T, B.chest, .1 + .03*br); R3(T, B.neck, -.4); R3(T, B.head, -.15);
  for (let s = 1; s >= -1; s -= 2) legIK(h, T, s, s*(D.hipX + .05), D.ankY, .02, 0);
  // the hands just above the knees
  frameOf(h, T, LEG(1)[1], _M); _V.setFromMatrixPosition(_M); armIK(h, T, 1, _V.x + .02, _V.y + .1, _V.z + .06, -.6, -.4, [1, -.2, -.25]);
  frameOf(h, T, LEG(-1)[1], _M); _V.setFromMatrixPosition(_M); armIK(h, T, -1, _V.x - .02, _V.y + .1, _V.z + .06, .6, -.4, [1, -.2, -.25]);
}

/* ---------- upper-body gestures (st.upper = {g, dir, w}; human.js lays them over the base pose) ---------- */
function upCall(h, T, st){ const t = h.t; R3(T, B.chest, -.04); R3(T, B.head, -.15); armPose(T, -1, .25, 2.6 + .1*Math.sin(t*5), .3); R3(T, ARM(-1)[2], .4); armPose(T, 1, .2, .2, .4); }
function upPoint(h, T, st){ armPose(T, -1, .2, 1.5, .05); R3(T, B.chest, 0, -.15, 0); armPose(T, 1, .15, .1, .4); }
function upAppeal(h, T, st){ armPose(T, -1, .15, 2.9, .05); R3(T, ARM(-1)[2], .2); armPose(T, 1, .2, .15, .5); R3(T, B.head, -.1, .2, 0); }
// shielding (P2b-B): bent at the hips, the chest up, both arms out wide and a little back to feel for the man behind
// and keep him there, the head down over the ball
function upShield(h, T, st){ R3(T, B.spine, .24, 0, 0); R3(T, B.chest, -.06, 0, 0); R3(T, B.neck, .12); R3(T, B.head, .3); armPose(T, 1, 1.25, -.5, .75); armPose(T, -1, 1.25, -.5, .75); }
function upArmsOut(h, T, st){ armPose(T, 1, 1.35, .1, .2); armPose(T, -1, 1.35, .1, .2); }

/* ---------- UF-A: a hand raised for the ball (USER-ISSUES U10), the ball held in both hands (U6) ---------- */
/* 'hand' {k (seconds since the call), fp}: the right hand goes up (HAND.UP), stays up a moment and comes back down by
   HAND.END, the open palm out; the left arm goes on with whatever the legs do (the gesture's mask is the right arm and a
   little of the chest). Your own first-person body (fp) raises it forward and up instead, so the hand comes into the top
   right of your view for that moment */
export const HAND = {UP:.2, HOLD:.5, END:.85};
export const handLift = k => sstep(0, HAND.UP, k)*(1 - sstep(HAND.HOLD, HAND.END, k));
function upHand(h, T, st){
  const r = handLift(st.k || 0), fp = !!st.fp, ua = ARM(-1);
  R3(T, B.chest, -.03*r, fp ? 0 : -.06*r, fp ? 0 : .04*r);
  // (the shoulder raises the arm forward and up: 2.75 rad, all but straight up, seen from outside; 2.1 in your own eyes,
  // the hand up in front of your face)
  R3(T, ua[0], -(.12 + (fp ? 2.0 : 2.62)*r), 0, -(.16 + (fp ? .08 : .2)*r));
  R3(T, ua[1], -(.3 - .15*r), 0, 0);
  R3(T, ua[2], .25*r, 0, 0);
}
upHand.mask = [[B.chest, .3], [ARM(-1)[0], 1], [ARM(-1)[1], 1], [ARM(-1)[2], 1]];
/* 'holdBall' {ball (world {x, y, z}: where the ball is)}: both hands on it, either side, the elbows out; a ball low down
   (being picked up) is reached for with the back bent over it */
const _hb = {x:0, y:0, z:0};
function upHoldBall(h, T, st){
  const b = st.ball; if (!b) return;
  setBT(h); toB(b.x, b.y, b.z, _hb);
  const low = clamp((1.15 - _hb.y)/.8, 0, 1);
  R3(T, B.spine, .55*low, 0, 0); R3(T, B.chest, .3*low - .05*(1 - low), 0, 0); R3(T, B.neck, -.1*(1 - low)); R3(T, B.head, -.15*(1 - low) + .25*low);
  for (let s = 1; s >= -1; s -= 2) armIK(h, T, s, _hb.x + s*THROW_HOLD.w, _hb.y, _hb.z, -s*.4, -.2, [.6, -.1, -.5]);
}
/* the ball held between the two hands of body h, as last posed (world point into out): the wrists' middle, carried on
   along the forearms to the palms */
const _FKh = newFK();
export function heldBall(h, out){
  if (!h.posed) return null;
  fkQ(h, h.pose, _FKh, 12);
  const L = ARM(1), R = ARM(-1), wl = L[2]*7, wr = R[2]*7, el = L[1]*7, er = R[1]*7;
  let x = (_FKh[wl] + _FKh[wr])/2, y = (_FKh[wl + 1] + _FKh[wr + 1])/2, z = (_FKh[wl + 2] + _FKh[wr + 2])/2;
  // (the palms are a few centimetres on from the wrists, along the forearms)
  let fx = _FKh[wl] - _FKh[el] + _FKh[wr] - _FKh[er], fy = _FKh[wl + 1] - _FKh[el + 1] + _FKh[wr + 1] - _FKh[er + 1], fz = _FKh[wl + 2] - _FKh[el + 2] + _FKh[wr + 2] - _FKh[er + 2];
  const fl = Math.hypot(fx, fy, fz) || 1; x += fx/fl*.05; y += fy/fl*.05; z += fz/fl*.05;
  const d = h.drawn, c = Math.cos(d[3]), sn = Math.sin(d[3]), sc = h.scale || 1;
  out.x = d[0] + (x*c + z*sn)*sc; out.y = d[1] + y*sc; out.z = d[2] + (-x*sn + z*c)*sc;
  return out;
}

/* ---------- the camera channels (3.5.9: h.camFx, applied through camKick, never into P.yaw / P.pitch) ---------- */
function camFx(h, pitch, dip, roll, nod = 0){
  const c = h.camFx || (h.camFx = {pitch:0, dip:0, roll:0, nod:0});
  c.pitch = pitch; c.dip = dip; c.roll = roll; c.nod = nod;
}

/* ---------- events between full poses ----------
   moveEvents(h, st): run the clip's clock to h.at and set its events in h.ev, without a pose. Every mode registered
   here carries it as .events; a caller that animates bodies at tiers T2 and T3 calls it after animateHuman (or
   human.js does, when it calls a mode's .events on the calls it does not pose), so contacts and releases arrive on the
   frame they happen. Idempotent: an event fires once per clip. */
const SPECS = {
  strike: st => strikeSpec(st),
  receive: st => recvSpec(st),
  header: st => { const hp = headerPlan(st); _spec.dur = hp.dur; _spec.contact = hp.contact; _spec.pre = 0; _spec.begin = null; _spec.events = hp.take === "jump" ? [[EV.TAKEOFF, hp.tLoad], [EV.LAND, hp.land]] : hp.take === "dive" ? [[EV.TAKEOFF, hp.tLoad], [EV.LAND, hp.contact + .25]] : RECV_EV; return _spec; },
  tackle: st => { const K0 = TACK[st.kind] || TACK.stand; _spec.dur = tackDur(TACK[st.kind] ? st.kind : "stand", st); _spec.contact = K0.contact; _spec.pre = 0; _spec.begin = null; _spec.events = st.kind === "slide" ? [[EV.LAND, .2]] : RECV_EV; return _spec; },
  throwin: st => { _spec.dur = 1.0; _spec.contact = .62; _spec.pre = 0; _spec.begin = null; _spec.events = null; return _spec; }
};
export function moveEvents(h, st){
  const mode = st && st.mode, sp = SPECS[mode];
  // (a held wind-up has no moments: nothing fires until it is let go, as a strike clip of its own)
  if (mode === "strike" && st.hold != null) return h.ev;
  if (!sp || !(h.mode === mode)) return h.ev;
  const C = clock(h, mode, st, sp(st));
  if (mode === "throwin" && (C.fired & EV.CONTACT) && !(C.fired & EV.RELEASE)){ C.fired |= EV.RELEASE; h.ev.mask |= EV.RELEASE; }
  return h.ev;
}
/* clip state for tests and the camera: the clip running on h (null when none) */
export function clipOf(h){ return h.mv ? {key:h.mv.key, tau:h.mv.tau, rate:h.mv.rate, reachErr:h.mv.reachErr, fired:h.mv.fired, contact:h.mv.contact, dur:h.mv.dur} : null; }

/* ---------- registration ---------- */
const plant = plantOut;
export const MOVE_MODES = {
  strike:registerMode("strike", strike, {blend:.02, plant, ground:false}),
  receive:registerMode("receive", receive, {blend:.15, plant, ground:true}),
  header:registerMode("header", header, {blend:.12, plant, low:true}),
  tackle:registerMode("tackle", tackle, {blend:.12, plant, low:true}),
  throwin:registerMode("throwin", throwin, {blend:.2, plant}),
  celebrate:registerMode("celebrate", celebrate, {blend:.3, plant, low:true}),
  getup:registerMode("getup", getup, {blend:0, plant, low:true}),
  tired:registerMode("tired", tired, {blend:.4})
};
for (const k of ["strike", "receive", "header", "tackle", "throwin"]) MOVE_MODES[k].events = (h, st) => moveEvents(h, st);
registerMode("upper:call", upCall); registerMode("upper:point", upPoint); registerMode("upper:appeal", upAppeal);
registerMode("upper:shield", upShield); registerMode("upper:armsOut", upArmsOut); registerMode("upper:windup", upWindup);
registerMode("upper:hand", upHand); registerMode("upper:holdBall", upHoldBall); registerMode("upper:ready", upReady);

/* the pieces the keeper's moves (gkmoves.js) share with these: one clip clock, one way of keeping feet, one head */
export const KIT = {rateLimit, rateHips, clock, setBT, toB, toW, dirB, BT, startFeet, legW, footTo, lockFeet, plantOut, armPose, lookAt, camFx, ease, bump, herm};
