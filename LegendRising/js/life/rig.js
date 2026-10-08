/* ============ LIFE: the rig ============
   Owner: WP-B (Stage 1). Contract: DESIGN 1.2 (rig.js), 1.4.18, 3.5.1 (module split), 3.5.6 (quaternion pose).
   The skeleton every body shares (human.js builds the meshes on it, gait.js walks it, moves.js and gkmoves.js pose it):
   the 20 bones and their parents, a body's measurements and rest pose, and the two pose buffers:
     Te  Float32Array(NP = 63): 20 bones x 3 Euler angles (XYZ) plus the hips' offset. The life poses (sitting, typing,
         the counter, stretches, the gym) and the older clips are written this way, through legIK / armIK / plantHand.
     Q   Float32Array(NQ = 83): 20 bones x a quaternion (x, y, z, w) plus the hips' offset (80..82). Everything after
         the base pose works on this: blending (inertialisation), the constraint pass (solveLeg, solveArm write
         quaternions directly, no Euler round trips), ground(), and the bones (quaternion.copy).
   Body space: the rig's own frame, feet at the origin, +X the body's left, +Y up, +Z forward, in the units of a
   1.80 m frame (a body of height h is the group scaled by h). fkQ() gives every bone's body-space position and
   rotation as plain numbers (no THREE objects on the hot path). */
import {THREE} from "./build.js";

/* ---------- small maths ---------- */
export const TAU = Math.PI*2, D2R = Math.PI/180;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a)*t;
export const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
export const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
// eased keyframes: [[t, v], ...]
export function kf(t, K){
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) return lerp(K[i-1][1], K[i][1], sstep(K[i-1][0], K[i][0], t));
  return K[K.length - 1][1];
}

/* ---------- the bones ---------- */
export const BN = ["root", "hips", "spine", "chest", "neck", "head", "uaL", "faL", "haL", "uaR", "faR", "haR", "thL", "shL", "ftL", "toL", "thR", "shR", "ftR", "toR"];
export const PAR = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 3, 9, 10, 1, 12, 13, 14, 1, 16, 17, 18];
export const BONE = Object.fromEntries(BN.map((n, i) => [n, i]));
export const B = BONE;
// a limb's bones (one shared, frozen list per side: these are asked for many times in every pose, and a new array each
// time was garbage the collector then had to sweep up mid-frame)
const ARM_L = Object.freeze([6, 7, 8]), ARM_R = Object.freeze([9, 10, 11]), LEG_L = Object.freeze([12, 13, 14, 15]), LEG_R = Object.freeze([16, 17, 18, 19]);
export const ARM = s => s > 0 ? ARM_L : ARM_R, LEG = s => s > 0 ? LEG_L : LEG_R;
export const NP = 63;                                      // Euler pose: 20 bones x 3 rotations + the hips' offset
export const NQ = 83;                                      // quaternion pose: 20 bones x 4 + the hips' offset (80..82)
export const LEGB = [12, 13, 14, 15, 16, 17, 18, 19];
export const UPPER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const BUILDS = {
  slim:     {sh:.95, ch:.92, wa:.9,  hp:.94, arm:.87, leg:.9,  belly:0,  mus:0,  nk:.94},
  average:  {sh:1,   ch:1,   wa:1,   hp:1,   arm:1,   leg:1,   belly:.3, mus:.2, nk:1},
  athletic: {sh:1.05, ch:1.05, wa:.95, hp:.98, arm:1.06, leg:1.06, belly:0, mus:.6, nk:1.04},
  stocky:   {sh:1.04, ch:1.1, wa:1.18, hp:1.08, arm:1.1, leg:1.1, belly:1,  mus:.2, nk:1.1},
  muscular: {sh:1.09, ch:1.12, wa:1.0, hp:1.0, arm:1.16, leg:1.12, belly:0, mus:1,  nk:1.1}
};
// body measurements for a 1.80 m frame; height is a uniform scale on top
export function dims(look){
  const b = BUILDS[look.build] || BUILDS.average, f = look.sex === "f", old = Math.round(sstep(45, 78, look.age || 25)*4)/4;
  // the head is a little over 1/7.3 of the height (a touch larger than life, the way stylised figures read best), its
  // crown at the full height, so a bigger head brings the chin down and shortens the neck rather than adding height.
  // A woman's smaller head sits a little lower on a slimmer (not thinner-than-life) neck, with the shoulders a touch
  // higher: the same short neck as a man's, not a long stalk
  const hs = (f ? .955 : 1)*1.055, drop = f ? .024 : 0;
  return {f, old, hs, hipY:.93, kneeY:.5, ankY:.085, hipX:f ? .087 : .09, hipsY:.96, spineY:1.08, chestY:1.26, neckY:1.5, headY:1.62,
    shY:f ? 1.432 : 1.435, shX:(f ? .166 : .18)*b.sh, elbowL:.285, foreL:.245,
    sh:b.sh*(f ? .9 : 1), ch:b.ch*(f ? .9 : 1), wa:b.wa*(f ? .86 : 1) + old*.05, hp:b.hp*(f ? 1.09 : 1), arm:b.arm*(f ? .86 : 1), leg:b.leg*(f ? 1.02 : 1),
    belly:b.belly*(f ? .3 : 1) + old*.5, mus:b.mus*(f ? .3 : 1), bust:f ? 1 : 0, nk:b.nk*(f ? .92 : 1),
    hc:[0, 1.80 - .117*hs - drop, .012]};
}
export function restPos(D){
  const P = [];
  P[B.root] = [0, 0, 0]; P[B.hips] = [0, D.hipsY, 0]; P[B.spine] = [0, D.spineY, .004]; P[B.chest] = [0, D.chestY, 0];
  P[B.neck] = [0, D.neckY, -.012]; P[B.head] = [0, D.headY, -.004];
  for (const s of [1, -1]){
    const [u, f, h] = ARM(s), x = s*D.shX;
    P[u] = [x, D.shY, -.005]; P[f] = [x, D.shY - D.elbowL, -.005]; P[h] = [x, D.shY - D.elbowL - D.foreL, -.005];
    const [t, k, a, o] = LEG(s), lx = s*D.hipX;
    P[t] = [lx, D.hipY, 0]; P[k] = [lx, D.kneeY, 0]; P[a] = [lx, D.ankY, 0]; P[o] = [lx, .025, .11];
  }
  return P;
}
// each bone's offset from its parent at rest, as plain numbers (restA[i*3 ..]) and as vectors (the Euler tools)
export function restOffsets(rest){
  const A = new Float64Array(60), V = [];
  for (let i = 0; i < 20; i++){
    const q = PAR[i] < 0 ? [0, 0, 0] : rest[PAR[i]], p = rest[i];
    A[i*3] = p[0] - q[0]; A[i*3 + 1] = p[1] - q[1]; A[i*3 + 2] = p[2] - q[2];
    V.push(new THREE.Vector3(A[i*3], A[i*3 + 1], A[i*3 + 2]));
  }
  return {A, V};
}

/* ---------- Euler pose tools (the life poses and the older clips) ---------- */
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _V = new THREE.Vector3(), _P = new THREE.Vector3(), _ONE = new THREE.Vector3(1, 1, 1);
export const R3 = (T, b, x, y = 0, z = 0) => { T[b*3] = x; T[b*3 + 1] = y; T[b*3 + 2] = z; };
// the body-space matrix of a bone under Euler pose T (rest rotations are all identity)
export function frameOf(h, T, b, out){
  const chain = []; for (let i = b; i > 0; i = PAR[i]) chain.unshift(i);
  out.identity();
  for (const i of chain){
    _P.copy(h.rest[i]); if (i === B.hips){ _P.x += T[60]; _P.y += T[61]; _P.z += T[62]; }
    _E.set(T[i*3], T[i*3 + 1], T[i*3 + 2], "XYZ"); _Q.setFromEuler(_E);
    out.multiply(_M2.compose(_P, _Q, _ONE));
  }
  return out;
}
// how far a two-bone limb reaches for a target d away: exact until nearly straight, then easing into full stretch
// (a hard clamp snaps the knee straight the frame the target slips out of reach)
export function softReach(d, L1, L2){
  const mx = L1 + L2 - 1e-4, mn = Math.abs(L1 - L2) + .02, ls = .985*mx;
  return d < mn ? mn : d <= ls ? d : ls + (mx - ls)*(1 - Math.exp(-(d - ls)/(mx - ls)));
}
// two-bone IK in the parent's frame: the limb hangs along -y at rest; bend = +1 (knee, shin folds back) or -1 (elbow)
function twoBone(T, b0, b1, v, L1, L2, bend){
  let d = v.length(); const dc = softReach(d, L1, L2); if (d < 1e-6){ v.set(0, -1, 0); d = 1; } v.multiplyScalar(dc/d); d = dc;
  const k = Math.acos(clamp((d*d - L1*L1 - L2*L2)/(2*L1*L2), -1, 1)), a = -(L1 + L2*Math.cos(k)), bb = bend*-L2*Math.sin(k);
  const phi = Math.asin(clamp(v.x/(-a), -1, 1)), p = a*Math.cos(phi);
  const th = wrap(Math.atan2(v.z, v.y) - Math.atan2(bb, p));
  T[b0*3] = th; T[b0*3 + 1] = 0; T[b0*3 + 2] = phi; T[b1*3] = bend*k;
  return th;
}
export function legIK(h, T, s, x, y, z, pitch = 0, toe = 0){
  const [th, sh, ft, to] = LEG(s), D = h.D;
  frameOf(h, T, B.hips, _M).invert();
  _V.set(x, y, z).applyMatrix4(_M).sub(h.rest[th]);
  const t = twoBone(T, th, sh, _V, D.hipY - D.kneeY, D.kneeY - D.ankY, 1);
  R3(T, ft, pitch - t - T[sh*3] - T[B.hips*3]); R3(T, to, toe);
}
/* arm IK with an elbow pole: the wrist goes to (x, y, z) in body space, the elbow swings toward pole (in the
   chest's frame, given for the left arm and mirrored for the right), and the forearm folds about its own x.
   The default pole keeps the elbows back and a little out, so forearms come forward past the ribs, not through them. */
const _Wv = new THREE.Vector3(), _Ev = new THREE.Vector3(), _Xa = new THREE.Vector3(), _Ya = new THREE.Vector3(), _Za = new THREE.Vector3(), _Pv = new THREE.Vector3();
export const POLE = [.3, -.25, -1];
export function armIK(h, T, s, x, y, z, twist = 0, wrist = 0, pole = POLE){
  const [ua, fa, hd] = ARM(s), D = h.D, L1 = D.elbowL, L2 = D.foreL;
  frameOf(h, T, B.chest, _M).invert();
  _Wv.set(x, y, z).applyMatrix4(_M).sub(h.rest[ua]);
  let d = _Wv.length(); if (d < 1e-6){ _Wv.set(0, -1, 0); d = 1; }
  const dc = softReach(d, L1, L2); _Wv.multiplyScalar(dc/d); d = dc;
  const u = _Ya.copy(_Wv).divideScalar(d);
  _Pv.set(s*pole[0], pole[1], pole[2]); _Pv.addScaledVector(u, -_Pv.dot(u));
  if (_Pv.lengthSq() < 1e-8) _Pv.set(0, 0, -1).addScaledVector(u, -u.z);
  _Pv.normalize();
  const ca = clamp((L1*L1 + d*d - L2*L2)/(2*L1*d), -1, 1);
  _Ev.copy(u).multiplyScalar(ca*L1).addScaledVector(_Pv, Math.sqrt(1 - ca*ca)*L1);             // the elbow
  // the upper arm's frame: -y down the bone, +z the way the forearm folds
  _Ya.copy(_Ev).normalize().negate();
  _Za.copy(_Wv).sub(_Ev); _Za.addScaledVector(_Ya, -_Za.dot(_Ya));
  if (_Za.lengthSq() < 1e-8) _Za.copy(_Pv).negate().addScaledVector(_Ya, _Pv.dot(_Ya));
  _Za.normalize(); _Xa.crossVectors(_Ya, _Za);
  _Q.setFromRotationMatrix(_M2.makeBasis(_Xa, _Ya, _Za)); _E.setFromQuaternion(_Q, "XYZ");
  R3(T, ua, _E.x, _E.y, _E.z);
  const k = Math.PI - Math.acos(clamp((L1*L1 + L2*L2 - d*d)/(2*L1*L2), -1, 1));
  R3(T, fa, -k, twist, 0); R3(T, hd, wrist);
}
/* a hand laid flat on something: the wrist goes to (x, y, z) in body space, then the hand turns so the fingers
   point along dir and the palm lies on the surface whose up is up. The part of that turn about the forearm's own
   axis is done by the forearm (the way a real forearm turns the palm over), only the rest at the wrist. The wrist
   joint sits PALM above the surface when the hand lies flat. */
export const PALM = .029;
export const UPV = new THREE.Vector3(0, 1, 0);
const _Fm = new THREE.Matrix4(), _Fx = new THREE.Vector3(), _Fy = new THREE.Vector3(), _Fz = new THREE.Vector3();
const _Qh = new THREE.Quaternion(), _Qf = new THREE.Quaternion(), _Qy = new THREE.Quaternion();
export function plantHand(h, T, s, x, y, z, dir, up = UPV, pole = POLE, follow = .5){
  armIK(h, T, s, x, y, z, 0, 0, pole);
  const fa = ARM(s)[1], hd = ARM(s)[2];
  // the fingers point partly the way the forearm comes in, so the wrist isn't bent hard sideways
  const e = frameOf(h, T, fa, _Fm).elements;
  _Fx.set(-e[4], -e[5], -e[6]).addScaledVector(up, (e[4]*up.x + e[5]*up.y + e[6]*up.z)).normalize();
  _Fy.copy(dir).normalize().lerp(_Fx, follow).negate().normalize();     // the hand's -y runs along the fingers
  _Fx.copy(up).multiplyScalar(s); _Fx.addScaledVector(_Fy, -_Fx.dot(_Fy)).normalize();   // its palm side (-s·x) faces down onto the surface
  _Fz.crossVectors(_Fx, _Fy);
  _Qh.setFromRotationMatrix(_Fm.makeBasis(_Fx, _Fy, _Fz));
  _Qf.setFromRotationMatrix(frameOf(h, T, fa, _Fm)).invert().multiply(_Qh);
  const tw = clamp(wrap(2*Math.atan2(_Qf.y, _Qf.w)), -1.9, 1.9);
  T[fa*3 + 1] = tw; _Qf.premultiply(_Qy.setFromAxisAngle(UPV, -tw));
  _E.setFromQuaternion(_Qf, "XYZ"); R3(T, hd, _E.x, _E.y, _E.z);
}
// bend forward from the hips (hips, spine and chest share it, the head stays level, the seat goes back for balance) until
// the shoulders are near enough to reach (x, y, z) with the elbows a little bent; the feet stay where they stood
const _Ms = new THREE.Matrix4();
export function leanTo(h, T, x, y, z, feet, straight = .9, most = 1.3){
  const D = h.D, base = [T[B.hips*3], T[B.spine*3], T[B.chest*3], T[B.neck*3], T[B.head*3], T[62]], reach = straight*(D.elbowL + D.foreL);
  const set = a => { T[B.hips*3] = base[0] + a*.35; T[B.spine*3] = base[1] + a*.45; T[B.chest*3] = base[2] + a*.2; T[B.neck*3] = base[3] - a*.32; T[B.head*3] = base[4] - a*.26; T[62] = base[5] - a*.13; };
  const gap = a => { set(a); return _V.setFromMatrixPosition(frameOf(h, T, B.uaL, _Ms)).distanceTo(_P.set(x, y, z)); };
  let lo = 0, hi = most;
  if (gap(0) > reach){ for (let i = 0; i < 7; i++){ const m = (lo + hi)/2; if (gap(m) > reach) lo = m; else hi = m; } set(hi); }
  else set(0);
  feet();
}

/* ---------- quaternions as plain numbers ---------- */
// Euler XYZ (three.js order) to a quaternion written into out at o (an angle of exactly 0 needs no sine or cosine: most
// bones of most poses turn about one axis or none, and this runs for every bone of every full pose)
export function qEuler(out, o, x, y, z){
  const c1 = x === 0 ? 1 : Math.cos(x/2), c2 = y === 0 ? 1 : Math.cos(y/2), c3 = z === 0 ? 1 : Math.cos(z/2);
  const s1 = x === 0 ? 0 : Math.sin(x/2), s2 = y === 0 ? 0 : Math.sin(y/2), s3 = z === 0 ? 0 : Math.sin(z/2);
  out[o] = s1*c2*c3 + c1*s2*s3; out[o + 1] = c1*s2*c3 - s1*c2*s3; out[o + 2] = c1*c2*s3 + s1*s2*c3; out[o + 3] = c1*c2*c3 - s1*s2*s3;
}
// a*b (a then b in the frame of a) into out at o (out may be a or b)
export function qMul(a, ai, b, bi, out, o){
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  out[o] = ax*bw + aw*bx + ay*bz - az*by; out[o + 1] = ay*bw + aw*by + az*bx - ax*bz;
  out[o + 2] = az*bw + aw*bz + ax*by - ay*bx; out[o + 3] = aw*bw - ax*bx - ay*by - az*bz;
}
// conj(a)*b: b in a's frame
export function qMulInv(a, ai, b, bi, out, o){
  const ax = -a[ai], ay = -a[ai + 1], az = -a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  out[o] = ax*bw + aw*bx + ay*bz - az*by; out[o + 1] = ay*bw + aw*by + az*bx - ax*bz;
  out[o + 2] = az*bw + aw*bz + ax*by - ay*bx; out[o + 3] = aw*bw - ax*bx - ay*by - az*bz;
}
// v rotated by q, into out at o
export function qRot(q, qi, x, y, z, out, o){
  const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const tx = 2*(qy*z - qz*y), ty = 2*(qz*x - qx*z), tz = 2*(qx*y - qy*x);
  out[o] = x + qw*tx + (qy*tz - qz*ty); out[o + 1] = y + qw*ty + (qz*tx - qx*tz); out[o + 2] = z + qw*tz + (qx*ty - qy*tx);
}
// v rotated by conj(q)
export function qRotInv(q, qi, x, y, z, out, o){
  const qx = -q[qi], qy = -q[qi + 1], qz = -q[qi + 2], qw = q[qi + 3];
  const tx = 2*(qy*z - qz*y), ty = 2*(qz*x - qx*z), tz = 2*(qx*y - qy*x);
  out[o] = x + qw*tx + (qy*tz - qz*ty); out[o + 1] = y + qw*ty + (qz*tx - qx*tz); out[o + 2] = z + qw*tz + (qx*ty - qy*tx);
}
// the rotation with these columns (an orthonormal basis), into out at o
export function qBasis(out, o, xx, xy, xz, yx, yy, yz, zx, zy, zz){
  const tr = xx + yy + zz;
  let x, y, z, w;
  if (tr > 0){ const s = .5/Math.sqrt(tr + 1); w = .25/s; x = (yz - zy)*s; y = (zx - xz)*s; z = (xy - yx)*s; }
  else if (xx > yy && xx > zz){ const s = 2*Math.sqrt(1 + xx - yy - zz); w = (yz - zy)/s; x = .25*s; y = (yx + xy)/s; z = (zx + xz)/s; }
  else if (yy > zz){ const s = 2*Math.sqrt(1 + yy - xx - zz); w = (zx - xz)/s; x = (yx + xy)/s; y = .25*s; z = (zy + yz)/s; }
  else { const s = 2*Math.sqrt(1 + zz - xx - yy); w = (xy - yx)/s; x = (zx + xz)/s; y = (zy + yz)/s; z = .25*s; }
  out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = w;
}
// rotation about the X axis
export function qX(out, o, a){ out[o] = Math.sin(a/2); out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = Math.cos(a/2); }
export function qY(out, o, a){ out[o] = 0; out[o + 1] = Math.sin(a/2); out[o + 2] = 0; out[o + 3] = Math.cos(a/2); }
// log map: the rotation vector (axis times angle) of q, into out at o (the short way round)
export function qLog(q, qi, out, o){
  let x = q[qi], y = q[qi + 1], z = q[qi + 2], w = q[qi + 3];
  if (w < 0){ x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-9){ out[o] = 2*x; out[o + 1] = 2*y; out[o + 2] = 2*z; return; }
  const k = 2*Math.atan2(s, w)/s;
  out[o] = x*k; out[o + 1] = y*k; out[o + 2] = z*k;
}
// exp map: the quaternion of a rotation vector, into out at o
export function qExp(rx, ry, rz, out, o){
  const a = Math.hypot(rx, ry, rz);
  if (a < 1e-9){ out[o] = rx/2; out[o + 1] = ry/2; out[o + 2] = rz/2; out[o + 3] = 1; return; }
  const s = Math.sin(a/2)/a;
  out[o] = rx*s; out[o + 1] = ry*s; out[o + 2] = rz*s; out[o + 3] = Math.cos(a/2);
}
// the Euler pose Te as quaternions in Q (the hips' offset carried over)
export function eulerToQ(Te, Q){
  Q[0] = Q[1] = Q[2] = 0; Q[3] = 1;
  for (let i = 1; i < 20; i++) qEuler(Q, i*4, Te[i*3], Te[i*3 + 1], Te[i*3 + 2]);
  Q[80] = Te[60]; Q[81] = Te[61]; Q[82] = Te[62];
}
// the angle between two quaternions (radians)
export function qAngle(a, ai, b, bi){
  const d = Math.abs(a[ai]*b[bi] + a[ai + 1]*b[bi + 1] + a[ai + 2]*b[bi + 2] + a[ai + 3]*b[bi + 3]);
  return 2*Math.acos(Math.min(1, d));
}

/* ---------- forward kinematics on the quaternion pose ----------
   F (Float64Array(140)): bone i's body-space position at i*7, its rotation (a quaternion) at i*7 + 3 */
export const newFK = () => new Float64Array(140);
const _t3 = new Float64Array(3);
export function fkQ(h, Q, F, upto = 20){
  const A = h.restA;
  F[0] = F[1] = F[2] = 0; F[3] = F[4] = F[5] = 0; F[6] = 1;
  for (let i = 1; i < upto; i++){
    const p = PAR[i]*7, o = i*7;
    let x = A[i*3], y = A[i*3 + 1], z = A[i*3 + 2];
    if (i === 1){ x += Q[80]; y += Q[81]; z += Q[82]; }
    qRot(F, p + 3, x, y, z, _t3, 0);
    F[o] = F[p] + _t3[0]; F[o + 1] = F[p + 1] + _t3[1]; F[o + 2] = F[p + 2] + _t3[2];
    qMul(F, p + 3, Q, i*4, F, o + 3);
  }
  return F;
}
// the chain from the hips to one leg only (the leg pass and the gait's reach checks)
export function fkHips(h, Q, F){ return fkQ(h, Q, F, 2); }

/* ---------- limbs on the quaternion pose ----------
   solveLeg: the ankle of leg s (+1 left, -1 right) to (x, y, z) in body space, the foot turned to fq (a body-space
   quaternion, four numbers at fq[fi]), the toe bent by toe, the knee pointing over the foot (and pole, if given, a
   body-space direction). Needs F up to the hips (fkHips). Returns how far the ankle falls short of the target. */
const _sl = new Float64Array(16);
export function solveLeg(h, Q, F, s, x, y, z, fq, fi, toe = 0, pole = null){
  const [th, sh, ft, to] = LEG(s), D = h.D, L1 = D.hipY - D.kneeY, L2 = D.kneeY - D.ankY, A = h.restA, w = _sl;
  // the hip joint, and the target from it
  qRot(F, 10, A[th*3], A[th*3 + 1], A[th*3 + 2], w, 0);
  const hx = F[7] + w[0], hy = F[8] + w[1], hz = F[9] + w[2];
  let vx = x - hx, vy = y - hy, vz = z - hz;
  let d = Math.hypot(vx, vy, vz);
  if (d < 1e-6){ vx = 0; vy = -1; vz = 0; d = 1; }
  const ux = vx/d, uy = vy/d, uz = vz/d, dc = softReach(d, L1, L2);
  const k = Math.PI - Math.acos(clamp((L1*L1 + L2*L2 - dc*dc)/(2*L1*L2), -1, 1));
  const ca = clamp((L1*L1 + dc*dc - L2*L2)/(2*L1*dc), -1, 1), sa = Math.sqrt(1 - ca*ca);
  // the knee's way: over the toes (the foot's forward), a little out
  let px, py, pz;
  if (pole){ px = pole[0]; py = pole[1]; pz = pole[2]; }
  else { qRot(fq, fi, 0, 0, 1, w, 3); px = w[3] + s*.06; py = w[4]*.3; pz = w[5]; }
  let pd = px*ux + py*uy + pz*uz; px -= ux*pd; py -= uy*pd; pz -= uz*pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-6){ px = 0; py = 0; pz = 1; pd = uz; px -= ux*pd; py -= uy*pd; pz -= uz*pd; pl = Math.hypot(px, py, pz) || 1; }
  px /= pl; py /= pl; pz /= pl;
  // the thigh: from the hip-ankle line towards the knee's way by the triangle's angle at the hip
  const tx = ux*ca + px*sa, ty = uy*ca + py*sa, tz = uz*ca + pz*sa;
  // its frame: -Y down the bone, +Z the way the knee points (the shin folds back, to -Z), X = Y x Z
  const Yx = -tx, Yy = -ty, Yz = -tz;
  let zd = px*tx + py*ty + pz*tz, Zx = px - tx*zd, Zy = py - ty*zd, Zz = pz - tz*zd;
  const zl = Math.hypot(Zx, Zy, Zz) || 1; Zx /= zl; Zy /= zl; Zz /= zl;
  const Xx = Yy*Zz - Yz*Zy, Xy = Yz*Zx - Yx*Zz, Xz = Yx*Zy - Yy*Zx;
  qBasis(w, 6, Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz);                   // the thigh in body space
  qMulInv(F, 10, w, 6, Q, th*4);                                     // ... in the hips' frame
  qX(Q, sh*4, k);                                                    // the knee is a hinge
  qMul(w, 6, Q, sh*4, w, 10);                                        // the shin in body space
  qMulInv(w, 10, fq, fi, Q, ft*4);                                   // the foot as asked, in the shin's frame
  qX(Q, to*4, toe);
  return d - dc;
}
/* solveArm: the wrist of arm s to (x, y, z) in body space with the elbow towards pole (in the chest's frame, given for
   the left arm and mirrored), the forearm turned by twist and the wrist bent by wrist. Needs F up to the chest. */
export function solveArm(h, Q, F, s, x, y, z, twist = 0, wrist = 0, pole = POLE){
  const [ua, fa, hd] = ARM(s), D = h.D, L1 = D.elbowL, L2 = D.foreL, A = h.restA, w = _sl, C = B.chest*7;
  // the target in the chest's frame, from the shoulder
  qRotInv(F, C + 3, x - F[C], y - F[C + 1], z - F[C + 2], w, 0);
  let vx = w[0] - A[ua*3], vy = w[1] - A[ua*3 + 1], vz = w[2] - A[ua*3 + 2];
  let d = Math.hypot(vx, vy, vz); if (d < 1e-6){ vx = 0; vy = -1; vz = 0; d = 1; }
  const dc = softReach(d, L1, L2); vx *= dc/d; vy *= dc/d; vz *= dc/d; d = dc;
  const ux = vx/d, uy = vy/d, uz = vz/d;
  let px = s*pole[0], py = pole[1], pz = pole[2], pd = px*ux + py*uy + pz*uz; px -= ux*pd; py -= uy*pd; pz -= uz*pd;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-6){ px = 0; py = 0; pz = -1; pd = -uz; px -= ux*pd; py -= uy*pd; pz -= uz*pd; pl = Math.hypot(px, py, pz) || 1; }
  px /= pl; py /= pl; pz /= pl;
  const ca = clamp((L1*L1 + d*d - L2*L2)/(2*L1*d), -1, 1), sa = Math.sqrt(1 - ca*ca);
  const ex = (ux*ca + px*sa)*L1, ey = (uy*ca + py*sa)*L1, ez = (uz*ca + pz*sa)*L1;      // the elbow
  const el = Math.hypot(ex, ey, ez) || 1, Yx = -ex/el, Yy = -ey/el, Yz = -ez/el;
  let Zx = vx - ex, Zy = vy - ey, Zz = vz - ez, zd = Zx*Yx + Zy*Yy + Zz*Yz; Zx -= Yx*zd; Zy -= Yy*zd; Zz -= Yz*zd;
  let zl = Math.hypot(Zx, Zy, Zz);
  if (zl < 1e-6){ Zx = -px; Zy = -py; Zz = -pz; zd = Zx*Yx + Zy*Yy + Zz*Yz; Zx -= Yx*zd; Zy -= Yy*zd; Zz -= Yz*zd; zl = Math.hypot(Zx, Zy, Zz) || 1; }
  Zx /= zl; Zy /= zl; Zz /= zl;
  const Xx = Yy*Zz - Yz*Zy, Xy = Yz*Zx - Yx*Zz, Xz = Yx*Zy - Yy*Zx;
  qBasis(Q, ua*4, Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz);
  const k = Math.PI - Math.acos(clamp((L1*L1 + L2*L2 - d*d)/(2*L1*L2), -1, 1));
  qEuler(Q, fa*4, -k, twist, 0); qEuler(Q, hd*4, wrist, 0, 0);
}

/* ---------- keeping people on the ground ----------
   After a pose that lies low or kneels (a slide, a keeper's dive, getting up), or stands on an uneven floor: nothing of
   the body goes below the floor (the hips rise to clear it), a foot that would dip under is lifted by IK keeping its
   angle, and people lying down are lowered until they rest on it (rest > 0). Points are [bone, x, y, z (in the bone's
   own frame), radius]. */
export const BODYPTS = [[B.hips, .09, -.1, -.06, .07], [B.hips, -.09, -.1, -.06, .07], [B.hips, 0, -.11, .05, .06], [B.spine, 0, 0, 0, .1], [B.spine, .15, -.03, 0, .05], [B.spine, -.15, -.03, 0, .05],
  [B.chest, 0, .04, 0, .1], [B.chest, .16, .05, 0, .06], [B.chest, -.16, .05, 0, .06], [B.head, 0, .06, .01, .11]];
for (const s of [1, -1]){
  const [, fa, hd] = ARM(s), [th, sh] = LEG(s);
  BODYPTS.push([fa, 0, 0, 0, .04], [hd, 0, -.08, .01, .03], [th, 0, -.22, 0, .07], [sh, 0, 0, .01, .05], [sh, 0, -.2, 0, .045]);
}
export const FOOTPTS = [[0, 0, -.085, -.078], [0, .028, -.083, -.062], [0, -.028, -.083, -.062], [0, .045, -.085, .085], [0, -.045, -.085, .085], [1, 0, -.025, .08], [1, .032, -.025, .05], [1, -.032, -.025, .05]];
const _g3 = new Float64Array(3);
const lowY = (F, b, x, y, z) => { qRot(F, b*7 + 3, x, y, z, _g3, 0); return F[b*7 + 1] + _g3[1]; };
export function footLow(F, s){ const [, , ft, to] = LEG(s); let m = 1e9; for (const [k, x, y, z] of FOOTPTS){ const v = lowY(F, k ? to : ft, x, y, z); if (v < m) m = v; } return m; }
const _Qa = new THREE.Quaternion(), _Qb = new THREE.Quaternion(), _Qc = new THREE.Quaternion(), _Qd = new THREE.Quaternion(), _Qe = new THREE.Quaternion(), _Va = new THREE.Vector3(), _Vb = new THREE.Vector3(), _Eg = new THREE.Euler();
const qIn = (Q, i, q) => q.set(Q[i], Q[i + 1], Q[i + 2], Q[i + 3]);
const qOut = (q, Q, i) => { Q[i] = q.x; Q[i + 1] = q.y; Q[i + 2] = q.z; Q[i + 3] = q.w; };
/* raise a foot by dy, keeping the way it points and the way the knee points. The knee opens just enough for the new
   hip-ankle distance, then the thigh turns by the smallest rotation that brings the ankle up, so a leg folded out
   sideways (a slide, a dive) stays folded the same way and is only nudged, never re-solved into a new pose. */
function liftFoot(h, Q, F, s, dy){
  const [th, sh, ft] = LEG(s), D = h.D, L1 = D.hipY - D.kneeY, L2 = D.kneeY - D.ankY, A = h.restA;
  const fw = qIn(F, ft*7 + 3, _Qd);                                                      // the foot in body space, kept
  const hr = qIn(F, 10, _Qe);
  _Va.set(F[ft*7] - F[7], F[ft*7 + 1] + dy - F[8], F[ft*7 + 2] - F[9]).applyQuaternion(_Qb.copy(hr).invert());
  _Va.x -= A[th*3]; _Va.y -= A[th*3 + 1]; _Va.z -= A[th*3 + 2];                        // where the ankle must go, from the hip
  _Eg.setFromQuaternion(qIn(Q, sh*4, _Qb), "XYZ");
  const k0 = _Eg.x, d = softReach(_Va.length(), L1, L2), k1 = (k0 < 0 ? -1 : 1)*Math.acos(clamp((d*d - L1*L1 - L2*L2)/(2*L1*L2), -1, 1));
  _Eg.x = k1; _Qb.setFromEuler(_Eg); qOut(_Qb, Q, sh*4);
  _Vb.set(0, -L2, 0).applyQuaternion(_Qb); _Vb.y -= L1;                                  // the ankle in the thigh's frame
  const qt = qIn(Q, th*4, _Qc);
  _Vb.applyQuaternion(qt).normalize();
  qt.premultiply(_Qa.setFromUnitVectors(_Vb, _Va.normalize())); qOut(qt, Q, th*4);
  // the ankle turned back to the foot's old angle
  _Qa.copy(hr).multiply(qt).multiply(_Qb);
  qOut(_Qa.invert().multiply(fw), Q, ft*4);
}
export function ground(h, Q, F, rest){
  fkQ(h, Q, F);
  let lo = 1e9;
  for (const [b, x, y, z, r] of BODYPTS){ const v = lowY(F, b, x, y, z) - r - .008; if (v < lo) lo = v; }
  let lift = lo < 0 ? -lo : 0;
  if (rest > 0){ const m = Math.min(lo, footLow(F, 1), footLow(F, -1)); if (m > 0) lift = -m*rest; }
  if (Math.abs(lift) > 1e-4){ Q[81] += lift; fkQ(h, Q, F); }
  for (const s of [1, -1]){ const m = footLow(F, s); if (m < -.002){ liftFoot(h, Q, F, s, -m); fkQ(h, Q, F); } }
}

/* ---------- the bones themselves ----------
   Bones are written as quaternions with their matrices updated here only (matrixAutoUpdate is off: a body not posed this
   frame costs nothing). list: the bones to write (all by default) */
const ALLB = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export function writeBones(h, Q, list = ALLB){
  const bn = h.bones, r = h.restA;
  for (let j = 0; j < list.length; j++){
    const i = list[j], b = bn[i], q = b.quaternion;
    // (straight into the quaternion: its setter would also work out the bone's Euler angles, which nothing reads, and
    // that costs more than the rest of this together)
    q._x = Q[i*4]; q._y = Q[i*4 + 1]; q._z = Q[i*4 + 2]; q._w = Q[i*4 + 3];
    if (i === 1) b.position.set(r[3] + Q[80], r[4] + Q[81], r[5] + Q[82]);
    b.updateMatrix();
  }
}
export const LEGW = [1, 12, 13, 14, 15, 16, 17, 18, 19];
