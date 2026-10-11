// js/life/football/ball.js: the one ball. Every ball that moves in the game (the match ball, training balls, the
// apartment football) is a Ball stepped by ballStep: gravity, real drag, Magnus curl, spin decay, the knuckle wobble,
// bounces with friction that turns slip into spin, rolling on grass of a given pace, and swept collisions with the
// posts, the crossbar, soft nets, advertising boards, bodies, hands and (in life zones) the world's solids.
// Owner: WP-C (ball, strike and touch models). Contract DESIGN 1.4.10; constants 1.5.1; behaviour 3.1.1 and 3.1.2.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Randomness (the spread off a
// body or a board) comes from the RNG handed to createBallWorld (rng.js); geometry comes from pitchspec.js.
//
//   const b = createBall({x: 0, z: 0, rollDecel: spec.roll});
//   const bw = createBallWorld({spec, bodies: () => list, hands: () => list, onEvent: (type, data) => ..., rng});
//   ballKick(b, {x: 20, y: 3, z: 0}, {x: 0, y: 30, z: 0}, {agent: 7, team: 0, kind: 'shot', aero: 60, t: ms.t});
//   each 60 Hz step: ballStep(b, bw, 1/60);
//
// Frames: pitch-local metres on a pitch (DESIGN 1.1: X along the length, Z across, grass at y = 0, a resting ball centre
// at y = 0.11); world metres in a life zone (no spec). Spin w is in rad/s about world axes, Magnus is KM*(w x v), so
// backspin about the right-hand axis of travel lifts and a positive vertical spin curls the ball to its left.
//
// Integration (3.1.1): each 60 Hz step is cut into n = clamp(ceil(|v|*h/0.12), 1, 6) sub-steps (|v| here is the
// largest speed the step can reach: the speed now plus what gravity, the Magnus cap and a stretched net could add), so the ball never
// travels more than 0.12 m in one, live and headless alike. Inside a sub-step the forces are taken at its start and the
// motion under them is exact (p += v*t + a*t*t/2), which keeps bounce heights true to the restitution model at any
// step size. Collisions are swept along the sub-step, earliest first, at most 3 a sub-step: the ground exactly on the
// path's parabola, everything else on its chord. Events are handed to onEvent when the step is over (each with the
// exact time it happened inside it). Nothing here allocates per step except the data of an event that fires.

import {timeToPointQ, TT, moverParams, sprintSpeed} from "../mover.js";
import {yawOf} from "./pitchspec.js";
import {FRESH} from "../stamina.js";
import {truncNormal} from "./rng.js";
import {sin, cos, tan, exp, log, atan, acos, hypot, DR, sinQ, cosQ, expQ, atanQ, atan2Q} from "./detmath.js";

// 1.5.1, the frozen table
export const BALL = Object.freeze({R:0.11, G:9.81, KD:0.0135, KM:0.0055, AMAX:9, SPIN_DECAY:0.25, E_MAX:0.62, E_MIN:0.45,
  MU:0.4, ROLL_STOP:0.05, VMAX:40, SUB_TRAVEL:0.12, E_POST:0.6, MU_POST:0.15, E_BOARD:0.5, E_BODY:0.3, NET_K:600,
  NET_C:25, NET_T:3});

// the rest of the model's numbers (3.1.1 and 1.5.1 in words), in one place
export const BALL_X = Object.freeze({
  ROLL_VY: 0.6,        // a bounce that leaves the ground slower than this becomes rolling
  AIR_Y: 0.002,        // airborne above R + this, or rising faster than AIR_VY
  AIR_VY: 0.05,
  ROLL_SPIN: 8,        // per second: rolling spin locks to v/R at this rate
  NET_IN: 4,           // per second: extra damping once the ball has met the net, while it is inside the goal
  NET_MAX: 1.2,        // metres: the most a net gives before it holds the ball like a wall
  SPREAD: 8*Math.PI/180,   // standard deviation of the tangential spread off a body or a board
  MU_BOARD: 0.3, MU_BODY: 0.3,
  SLEEP_T: 0.3,        // life balls sleep after this long at rest
  GHOST_T: 0.25,       // the kicker's own body ignores the ball this long after his touch
  MAX_SUB: 6, MAX_HITS: 3, MAX_PIECES: 16,
  BODY: {legsTop: 0.85, legsR: 0.16, torsoTop: 1.5, torsoR: 0.25, headY: 1.66, headR: 0.12},  // x the body's height scale
  EDGE_R: 0.02         // the rounded top edge of a board
});

const {R, G, KD, KM, AMAX, SPIN_DECAY, E_MAX, E_MIN, MU, ROLL_STOP, VMAX, SUB_TRAVEL, E_POST, MU_POST, E_BOARD, E_BODY,
  NET_K, NET_C, NET_T} = BALL;
const X = BALL_X;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const INV_STICK = 1/3.5;          // a solid sphere: a tangential impulse changes the contact slip 3.5 times as much
const SPIN_K = 5/(2*R);           // spin change per unit of tangential velocity change: (r x dv)/I

/* ---------- the ball ---------- */

// b = {p, v, w, dragMul, knuck, state, holder, last, rollDecel, sleep, still} (1.4.10) plus what the integrator keeps:
// grounded, inField (null until the first step on a pitch), the net contact memory, the floor under a life ball and the
// queue of touches that ballStep reports.
export function createBall({x = 0, y = R, z = 0, rollDecel = 1.1} = {}){
  const pend = [];
  for (let i = 0; i < 4; i++) pend.push({agent: -1, team: -1, kind: '', t: -1});
  return {
    p: {x, y, z}, v: {x: 0, y: 0, z: 0}, w: {x: 0, y: 0, z: 0}, dragMul: 1, knuck: null,
    state: 'free', holder: -1, last: {agent: -1, team: -1, kind: '', t: 0, x: 0, z: 0}, rollDecel, sleep: false, still: 0,
    grounded: y <= R + X.AIR_Y, inField: null, netSide: new Int8Array(16), netHit: false, netQ: 0, netAny: false, floor: null,
    pend, pendN: 0
  };
}

// the touch a player gives the ball: the only way a player changes its velocity. v and w are the new velocity and spin;
// touch = {agent, team, kind, aero /* the striker's aero skill: drag x (1 - 0.0045 aero) for this flight */, t,
// knuck /* {amp, freq, phase} from planShot when the knuckle conditions hold */}. The touch is reported as a 'touch'
// event by the next ballStep. The speed is capped at VMAX.
export function ballKick(b, v, w, touch = {}){
  touch = touch || {};
  let vx = +(v && v.x) || 0, vy = +(v && v.y) || 0, vz = +(v && v.z) || 0;
  const s = hypot(vx, vy, vz);
  if (s > VMAX){ const k = VMAX/s; vx *= k; vy *= k; vz *= k; }
  b.v.x = vx; b.v.y = vy; b.v.z = vz;
  b.w.x = +(w && w.x) || 0; b.w.y = +(w && w.y) || 0; b.w.z = +(w && w.z) || 0;
  b.state = 'free'; b.holder = -1; b.sleep = false; b.still = 0;
  b.dragMul = 1 - 0.0045*clamp(+touch.aero || 0, 0, 99);
  const kn = touch.knuck;
  b.knuck = kn ? {amp: +kn.amp || 0, freq: +kn.freq || 0, phase: +kn.phase || 0, t: 0} : null;
  if (b.p.y < R) b.p.y = R;
  b.grounded = b.p.y <= R + X.AIR_Y && vy <= X.AIR_VY;
  const L = b.last, t = touch.t != null && Number.isFinite(+touch.t) ? +touch.t : NaN;
  L.agent = touch.agent != null ? touch.agent : -1; L.team = touch.team != null ? touch.team : -1;
  L.kind = touch.kind || 'kick'; L.t = t; L.x = b.p.x; L.z = b.p.z;
  if (b.pendN < b.pend.length){
    const q = b.pend[b.pendN++];
    q.agent = L.agent; q.team = L.team; q.kind = L.kind; q.t = Number.isNaN(t) ? -1 : t;
  }
  return b;
}

// a holder takes the ball in hands or at the feet: holder is an agent id, or {id, team, x, y, z, vx, vy, vz, t} whose
// position is where the ball now is (the hands or the foot target) and whose velocity it moves with until the next call.
// Call it every step while the ball is held; ballStep moves a held ball with that velocity and nothing else.
export function ballHold(b, holder){
  const obj = holder && typeof holder === 'object';
  const id = obj ? (holder.id != null ? holder.id : -1) : (holder != null ? +holder : -1);
  if (obj && holder.x != null){
    b.p.x = +holder.x; b.p.y = holder.y != null ? Math.max(R, +holder.y) : b.p.y; b.p.z = +holder.z;
  }
  b.v.x = obj ? +holder.vx || 0 : 0; b.v.y = obj ? +holder.vy || 0 : 0; b.v.z = obj ? +holder.vz || 0 : 0;
  b.w.x = 0; b.w.y = 0; b.w.z = 0; b.knuck = null; b.sleep = false; b.still = 0;
  if (b.state !== 'held' || b.holder !== id){
    const L = b.last;
    L.agent = id; L.team = obj && holder.team != null ? holder.team : L.team; L.kind = 'hold';
    L.t = obj && holder.t != null ? +holder.t : L.t; L.x = b.p.x; L.z = b.p.z;
  }
  b.state = 'held'; b.holder = id;
  return b;
}

// the holder lets go: from p (or where the ball is) with velocity v and spin w (a throw, a drop kick's drop, a roll)
export function ballRelease(b, p, v, w){
  if (p){ b.p.x = +p.x; b.p.y = Math.max(R, +p.y); b.p.z = +p.z; }
  let vx = +(v && v.x) || 0, vy = +(v && v.y) || 0, vz = +(v && v.z) || 0;
  const s = hypot(vx, vy, vz);
  if (s > VMAX){ const k = VMAX/s; vx *= k; vy *= k; vz *= k; }
  b.v.x = vx; b.v.y = vy; b.v.z = vz;
  b.w.x = +(w && w.x) || 0; b.w.y = +(w && w.y) || 0; b.w.z = +(w && w.z) || 0;
  b.state = 'free'; b.knuck = null; b.sleep = false; b.still = 0;
  b.last.agent = b.holder; b.last.kind = 'release'; b.last.x = b.p.x; b.last.z = b.p.z;
  b.holder = -1;
  b.grounded = b.p.y <= R + X.AIR_Y && vy <= X.AIR_VY;
  return b;
}

/* ---------- the world the ball lives in ---------- */

// spec: a PitchSpec (pitchspec.js) or null. bodies() -> [{id, team, x, z, h, vx, vz}] at the end of this step (optional
// y: a jump's root offset; optional seg {ax, ay, az, bx, by, bz, r}: one capsule instead of the standing body, for a
// keeper in a dive; optional ghost: true to skip). hands() -> [{id, x, y, z, r}] (optional vx, vy, vz): keeper hands and
// tackle feet. solids: the life adapter {cast(ox, oy, oz, dx, dy, dz, len, out) -> distance, floor(x, y, z) -> y | null}.
// onEvent(type, data) receives the events of 1.4.10. Additions: rng (the match RNG, for the spread off bodies and
// boards; none means no spread), trace(kind, x0, y0, z0, x1, y1, z1, dt) called for every straight piece of motion
// (tests), t (the clock ballStep advances; the simulation may set it to ms.t), floorY (the ground without a spec).
export function createBallWorld({spec = null, bodies = null, hands = null, solids = null, onEvent = null, rng = null,
  trace = null, t = 0, floorY = 0} = {}){
  const bw = {spec, bodies, hands, solids, onEvent, rng, trace, traceQ: null, t, floorY,
    caps: [], panels: [], boards: [], vols: [], goalX: Infinity, touchZ: Infinity, mouthHalf: 0, mouthTop: 0,
    pred: null, qa: [], qb: [], qOn: false, netNear: Infinity};
  if (spec){
    const C = spec.colliders || {};
    for (const p of C.posts || []) bw.caps.push(capsule(p.x, p.y0, p.z, p.x, p.y1, p.z, p.r, 'post', p.end));
    for (const s of C.bars || []) bw.caps.push(capsule(s.x, s.y, s.z0, s.x, s.y, s.z1, s.r, 'bar', s.end));
    for (const net of C.nets || []) for (const pl of net.planes) bw.panels.push(panel(pl, net.end, bw.panels.length));
    // nearer the halfway line than every panel's reach, the nets cannot act
    for (const pn of bw.panels) bw.netNear = Math.min(bw.netNear, pn.x0 > 0 ? pn.x0 : pn.x1 < 0 ? -pn.x1 : 0);
    for (const bd of C.boards || []){
      bw.boards.push(boardOf(bd));
      const q = bd.quad;
      if (q && q.length === 4) bw.caps.push(capsule(q[3][0], q[3][1], q[3][2], q[2][0], q[2][1], q[2][2], X.EDGE_R, 'board', 0));
    }
    for (const g of spec.goals || []){
      const back = (C.nets || []).find(n => n.end === g.end);
      const bp = back && back.planes.find(p => p.part === 'back');
      const x1 = bp ? Math.abs(bp.bounds.x0) : Math.abs(g.postX) + 2;
      const yb = bp ? bp.bounds.y1 : 1.9;
      const zh = Math.abs(g.post[0].z);
      bw.vols.push({end: g.end, x0: Math.abs(g.postX), x1, zh, y0: g.barY, y1: yb});
    }
    bw.goalX = spec.goalX != null ? spec.goalX : spec.hx + R;
    bw.touchZ = spec.touchZ != null ? spec.touchZ : spec.hz + R;
    const g0 = (spec.goals || [])[0], b0 = (C.bars || [])[0];
    bw.mouthHalf = g0 ? g0.mouthHalf : 3.66;
    bw.mouthTop = g0 ? g0.barY - (b0 ? b0.r : 0.06) : 2.44;
  }
  return bw;
}

// a capsule from (ax, ay, az) to (bx, by, bz), radius r, with the ball's radius added and a box for quick rejection
function capsule(ax, ay, az, bx, by, bz, r, kind, end){
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = hypot(dx, dy, dz) || 1e-9, rr = r + R;
  return {ax, ay, az, ux: dx/L, uy: dy/L, uz: dz/L, L, r, rr, kind, end,
    x0: Math.min(ax, bx) - rr, x1: Math.max(ax, bx) + rr, y0: Math.min(ay, by) - rr, y1: Math.max(ay, by) + rr,
    z0: Math.min(az, bz) - rr, z1: Math.max(az, bz) + rr};
}

// a net panel: its plane (n into the goal), its corners for the inside test, and the box within which it can act
function panel(pl, end, idx){
  const [nx, ny, nz] = pl.n, q = pl.quad, m = X.NET_MAX + R + 0.2, bd = pl.bounds;
  const edges = [];
  for (let i = 0; i < 4; i++){
    const a = q[i], c = q[(i + 1)%4];
    // inward edge normal in the panel's plane: n x (c - a) points into the quad for a counter-clockwise order, or out
    const ex = c[0] - a[0], ey = c[1] - a[1], ez = c[2] - a[2];
    const kx = ny*ez - nz*ey, ky = nz*ex - nx*ez, kz = nx*ey - ny*ex;
    edges.push({ax: a[0], ay: a[1], az: a[2], kx, ky, kz, kl: hypot(kx, ky, kz)});
  }
  // the orientation: the centre of the quad must be inside
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0])/4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1])/4, cz = (q[0][2] + q[1][2] + q[2][2] + q[3][2])/4;
  const e0 = edges[0], sgn = (cx - e0.ax)*e0.kx + (cy - e0.ay)*e0.ky + (cz - e0.az)*e0.kz >= 0 ? 1 : -1;
  for (const e of edges){ e.kx *= sgn; e.ky *= sgn; e.kz *= sgn; }
  return {nx, ny, nz, d: pl.d, edges, end, part: pl.part || 'net', idx,
    x0: bd.x0 - m, x1: bd.x1 + m, y0: bd.y0 - m, y1: bd.y1 + m, z0: bd.z0 - m, z1: bd.z1 + m};
}
// inside the panel's quad as projected along its normal, with an optional margin (metres) past its edges
function inQuad(pn, x, y, z, margin = 0){
  for (let i = 0; i < 4; i++){
    const e = pn.edges[i];
    if ((x - e.ax)*e.kx + (y - e.ay)*e.ky + (z - e.az)*e.kz < -1e-9 - margin*e.kl) return false;
  }
  return true;
}
function boardOf(bd){
  const [nx, ny, nz] = bd.n, b = bd.bounds;
  return {nx, ny, nz, d: bd.d, e: bd.e != null ? bd.e : E_BOARD, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1};
}

/* ---------- swept tests (module scratch: the normal of the last hit) ---------- */

const CN = {x: 0, y: 0, z: 0};

// The step's own calling convention (3.9.6: the ball allocates nothing per step). A call that passes or returns a
// fractional number boxes it in a new heap object unless the engine inlines the callee, and these tests run for every
// sub-step of every ball (the live one, the prediction, the solver's flights), so their numbers go through these
// arrays instead. PC, the piece: 0..2 its start, 3..5 its motion, 6 its length in seconds, 7 its start within the 60 Hz
// step, 8 its absolute start, 9..11 the acceleration, 12 the resting centre height, 13 the spin clock's time, 14..15
// the nets' piece length and time. SW, a swept capsule: 0..2 the point, 3..5 its motion, 6..8 the segment's start,
// 9..11 its unit direction, 12 its length, 13 the radius; the answer in SW[14]. ZC, the zone check: 0..2 from, 3..5
// to, 6 the time at the start, 7 the length. TRC, a traced piece (traceQ): 0..2 from, 3..5 to, 6 the length. SUB, a
// sub-step: 0 its length, 1 its absolute start, 2 its start within the step, 3 the speed it is sized for; the time it
// used in SUB[4].
const PC = new Float64Array(16), SW = new Float64Array(15), ZC = new Float64Array(8), TRC = new Float64Array(7), SUB = new Float64Array(5);

// earliest s in [0, 1] at which the point p0 + s*d comes within rr of the segment a + t*u, t in [0, L]; -1 if never.
// A point already inside and moving deeper counts at s = 0. CN receives the unit normal from the segment at contact.
// (Arguments and answer in SW.)
function sweepCapsuleQ(){
  const px = SW[0], py = SW[1], pz = SW[2], dx = SW[3], dy = SW[4], dz = SW[5], ax = SW[6], ay = SW[7], az = SW[8];
  const ux = SW[9], uy = SW[10], uz = SW[11], L = SW[12], rr = SW[13];
  let best = 2;
  const mx = px - ax, my = py - ay, mz = pz - az;
  const md = mx*ux + my*uy + mz*uz, dd = dx*ux + dy*uy + dz*uz;
  const mpx = mx - md*ux, mpy = my - md*uy, mpz = mz - md*uz;
  const dpx = dx - dd*ux, dpy = dy - dd*uy, dpz = dz - dd*uz;
  const A = dpx*dpx + dpy*dpy + dpz*dpz, B = mpx*dpx + mpy*dpy + mpz*dpz, C = mpx*mpx + mpy*mpy + mpz*mpz - rr*rr;
  if (C <= 0){
    if (md >= 0 && md <= L && B < 0) best = 0;
  } else if (A > 1e-18){
    const disc = B*B - A*C;
    if (disc >= 0){
      const s = (-B - Math.sqrt(disc))/A;
      if (s >= 0 && s <= 1){ const ax2 = md + s*dd; if (ax2 >= 0 && ax2 <= L) best = s; }
    }
  }
  // the two end spheres: the earliest s at which m + s*d (relative to the sphere's centre) comes within rr
  for (let e = 0; e < 2; e++){
    const ex = e ? mx - L*ux : mx, ey = e ? my - L*uy : my, ez = e ? mz - L*uz : mz;
    const A2 = dx*dx + dy*dy + dz*dz, B2 = ex*dx + ey*dy + ez*dz, C2 = ex*ex + ey*ey + ez*ez - rr*rr;
    let se = -1;
    if (C2 <= 0) se = B2 < 0 ? 0 : -1;
    else if (!(A2 < 1e-18)){
      const disc2 = B2*B2 - A2*C2;
      if (!(disc2 < 0)){ const s = (-B2 - Math.sqrt(disc2))/A2; se = s >= 0 && s <= 1 ? s : -1; }
    }
    if (se >= 0 && se < best) best = se;
  }
  if (best > 1){ SW[14] = -1; return; }
  const qx = px + best*dx, qy = py + best*dy, qz = pz + best*dz;
  const t = clamp((qx - ax)*ux + (qy - ay)*uy + (qz - az)*uz, 0, L);
  let nx = qx - (ax + t*ux), ny = qy - (ay + t*uy), nz = qz - (az + t*uz);
  const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (nl > 1e-12){ CN.x = nx/nl; CN.y = ny/nl; CN.z = nz/nl; }
  else { const dl = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1; CN.x = -dx/dl; CN.y = -dy/dl; CN.z = -dz/dl; }
  SW[14] = best;
}
/* ---------- collision response ---------- */

// an impulse at a contact with unit normal n (pointing to the ball) on a surface moving at sv: restitution e on the
// normal, Coulomb friction mu (at most the impulse that would make the contact roll), the tangential impulse turned into
// spin. Returns the normal speed of approach (0 when already separating).
function respond(b, nx, ny, nz, e, mu, svx, svy, svz){
  const V = b.v, Wv = b.w;
  const rvx = V.x - svx, rvy = V.y - svy, rvz = V.z - svz;
  const vn = rvx*nx + rvy*ny + rvz*nz;
  if (vn >= 0) return 0;
  const jn = -(1 + e)*vn;
  V.x += jn*nx; V.y += jn*ny; V.z += jn*nz;
  // slip of the contact point: relative velocity plus w x (-R n), its tangential part
  let ux = rvx - R*(Wv.y*nz - Wv.z*ny), uy = rvy - R*(Wv.z*nx - Wv.x*nz), uz = rvz - R*(Wv.x*ny - Wv.y*nx);
  const un = ux*nx + uy*ny + uz*nz;
  ux -= un*nx; uy -= un*ny; uz -= un*nz;
  const ul = hypot(ux, uy, uz);
  if (ul > 1e-9 && mu > 0){
    const J = Math.min(ul*INV_STICK, mu*jn), k = -J/ul;
    const dvx = k*ux, dvy = k*uy, dvz = k*uz;
    V.x += dvx; V.y += dvy; V.z += dvz;
    // dw = (5/(2R)) (dv x n)
    Wv.x += SPIN_K*(dvy*nz - dvz*ny); Wv.y += SPIN_K*(dvz*nx - dvx*nz); Wv.z += SPIN_K*(dvx*ny - dvy*nx);
  }
  return -vn;
}

// turn the outgoing relative velocity about the vertical by a seeded angle (the spread off a body or a board), keeping
// it moving away from the surface
function spread(b, bw, nx, ny, nz, svx, svz){
  if (!bw.rng) return;
  const a = truncNormal(bw.rng, X.SPREAD, 2.5);
  const rx = b.v.x - svx, rz = b.v.z - svz, c = cos(a), s = sin(a);
  const qx = rx*c - rz*s, qz = rx*s + rz*c;
  if ((qx*nx + (b.v.y)*ny + qz*nz) > 0){ b.v.x = qx + svx; b.v.z = qz + svz; }
}

function capSpeed(b){
  const V = b.v, s = hypot(V.x, V.y, V.z);
  if (s > VMAX){ const k = VMAX/s; V.x *= k; V.y *= k; V.z *= k; }
}

// Events raised inside a step are queued and handed out when the step is over, so a handler may predict, kick or step
// another ball (the simulation refreshes its prediction on bounces and collisions) without disturbing the step it
// came from. Each event still carries the exact time it happened inside the step.
function emit(bw, type, data){
  if (!bw.onEvent) return;
  if (bw.qOn) bw.qa.push(type, data);
  else bw.onEvent(type, data);
}
// two queues used in turn, so a handler that steps this world again queues into the other one
function stepEnd(bw){
  const q = bw.qa;
  bw.qa = bw.qb; bw.qb = q; bw.qOn = false;
  BODIES = HANDS = null;
  for (let i = 0; i < q.length; i += 2) bw.onEvent(q[i], q[i + 1]);
  q.length = 0;
}

/* ---------- stepping ---------- */

// the bodies and hands of the current step (read once per ballStep)
let BODIES = null, HANDS = null, STEP_H = 1/60;

// One 60 Hz step (h seconds) of the ball (3.1.1). Advances bw.t by h.
export function ballStep(b, bw, h){
  if (!(h > 0)) return b;
  const t0 = bw.t;
  bw.qOn = !!bw.onEvent;
  if (b.pendN) flushTouches(b, bw);
  if (b.state === 'held'){
    const P = b.p, V = b.v;
    const x0 = P.x, z0 = P.z;
    P.x += V.x*h; P.y = Math.max(R, P.y + V.y*h); P.z += V.z*h;
    if (bw.spec){ ZC[0] = x0; ZC[1] = P.y; ZC[2] = z0; ZC[3] = P.x; ZC[4] = P.y; ZC[5] = P.z; ZC[6] = t0; ZC[7] = h; zoneCheckQ(b, bw); }
    bw.t = t0 + h;
    stepEnd(bw);
    return b;
  }
  BODIES = bw.bodies ? bw.bodies() : null;
  HANDS = bw.hands ? bw.hands() : null;
  STEP_H = h;
  if (b.sleep){
    if (!wakeCheck(b)){ bw.t = t0 + h; stepEnd(bw); return b; }
    b.sleep = false; b.still = 0;
  }
  // sub-steps for T seconds: enough that even the fastest the ball can get in T moves at most SUB_TRAVEL in each, the
  // most the forces can add to its speed a second being gravity, the Magnus cap and, while it is in a net, the net's
  // spring at its present stretch plus one sub-step more (written out here, and the sub-step's numbers passed through
  // SUB: nothing boxed, 3.9.6)
  const V = b.v;
  let remT = h, tL = 0, guard = 0;
  let vb = Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z) + (G + AMAX + (b.netQ > 0 ? NET_K*(b.netQ + SUB_TRAVEL) : 0))*h;
  let n = clamp(Math.ceil(vb*h/SUB_TRAVEL - 1e-12), 1, X.MAX_SUB);
  while (n > 0 && remT > 1e-12 && guard++ < X.MAX_PIECES){
    const dt = remT/n;
    const vSize = Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z) + (G + AMAX + (b.netQ > 0 ? NET_K*(b.netQ + SUB_TRAVEL) : 0))*dt;
    SUB[0] = dt; SUB[1] = t0 + tL; SUB[2] = tL; SUB[3] = vSize;
    subStepQ(b, bw);
    const used = SUB[4];
    tL += used; remT -= used; n--;
    if (used < dt - 1e-12 && remT > 1e-12){
      // a collision left it faster: re-split the rest
      vb = Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z) + (G + AMAX + (b.netQ > 0 ? NET_K*(b.netQ + SUB_TRAVEL) : 0))*remT;
      n = clamp(Math.ceil(vb*remT/SUB_TRAVEL - 1e-12), 1, X.MAX_SUB);
    }
  }
  bw.t = t0 + h;
  stepEnd(bw);
  return b;
}

function speedOf(b){ return hypot(b.v.x, b.v.y, b.v.z); }

function flushTouches(b, bw){
  for (let i = 0; i < b.pendN; i++){
    const q = b.pend[i], t = q.t >= 0 ? q.t : bw.t;
    if (Number.isNaN(b.last.t)) b.last.t = t;
    emit(bw, 'touch', {agent: q.agent, team: q.team, kind: q.kind, x: b.p.x, y: b.p.y, z: b.p.z, t});
  }
  b.pendN = 0;
  if (Number.isNaN(b.last.t)) b.last.t = bw.t;
}

// a sleeping life ball wakes when a body or a hand reaches it
function wakeCheck(b){
  const P = b.p;
  if (BODIES) for (const bd of BODIES){
    if (!bd || bd.ghost) continue;
    const hh = bd.h || 1, r = X.BODY.torsoR*hh + R, dx = P.x - bd.x, dz = P.z - bd.z;
    if (dx*dx + dz*dz < r*r && P.y < (bd.y || 0) + 1.9*hh) return true;
  }
  if (HANDS) for (const hd of HANDS){
    if (!hd) continue;
    const r = (hd.r || 0.1) + R, dx = P.x - hd.x, dy = P.y - hd.y, dz = P.z - hd.z;
    if (dx*dx + dy*dy + dz*dz < r*r) return true;
  }
  return false;
}

// the floor under the ball: y = 0 on a pitch; in a life zone the solids' floor (a surface at most 5 cm above the
// ball's bottom counts as a lip it rolls onto), else the last floor it had, else bw.floorY
function floorAt(b, bw){
  const sol = bw.solids;
  if (sol && sol.floor){
    const bottom = b.p.y - R, f = sol.floor(b.p.x, bottom + 0.05, b.p.z);
    if (f != null && Number.isFinite(f) && f <= bottom + 0.05){ b.floor = f; return f; }
    if (b.floor != null && b.floor <= bottom + 0.05) return b.floor;
  }
  return bw.floorY;
}

// the best hit of the current piece
const HIT = {s: 2, tau: 0, kind: '', nx: 0, ny: 0, nz: 0, e: 0, mu: 0, svx: 0, svy: 0, svz: 0, spread: false, end: 0, part: '',
  id: -1, team: -1, ground: false, px: 0, py: 0, pz: 0};
const NB = new Float32Array(3);

// one sub-step of dt seconds starting at absolute time tS (tL into the 60 Hz step). Returns the time consumed: dt, or
// less when a collision left the ball faster than vSize (the step then re-splits what is left).
function subStepQ(b, bw){
  const dt = SUB[0], tS = SUB[1], tL = SUB[2], vSize = SUB[3];
  const P = b.p, V = b.v, Wv = b.w;
  let rem = dt, used = 0, hits = 0;
  while (rem > 1e-12){
    const fy = floorAt(b, bw), Yc = fy + R;
    if (P.y < Yc) P.y = Yc;
    let gr = P.y <= Yc + X.AIR_Y && V.y <= X.AIR_VY;
    if (gr && V.y < -X.AIR_VY && hits < X.MAX_HITS){
      // on the floor and moving into it: a bounce here and now
      groundImpact(b, bw, tS + used);
      hits++;
      gr = V.y <= X.AIR_VY;
    }
    if (gr){ P.y = Yc; V.y = 0; }
    b.grounded = gr;

    // nets act as soft constraints on the velocity for this piece (implicit spring and damper); far from both goals
    // there is nothing to do but forget which side of each panel the ball was on
    if (bw.panels.length){
      if (Math.abs(P.x) >= bw.netNear){ PC[14] = rem; PC[15] = tS + used; netApplyQ(b, bw); }
      else if (b.netAny){ b.netSide.fill(0); b.netQ = 0; b.netHit = false; b.netAny = false; }
    }

    // accelerations, constant over the piece
    const sp = Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z), kd = KD*b.dragMul*sp;
    let ax = -kd*V.x, ay = -kd*V.y - G, az = -kd*V.z, mT = rem, stops = false;
    if (!gr){
      let mx = KM*(Wv.y*V.z - Wv.z*V.y), my = KM*(Wv.z*V.x - Wv.x*V.z), mz = KM*(Wv.x*V.y - Wv.y*V.x);
      const ml = Math.sqrt(mx*mx + my*my + mz*mz);
      if (ml > AMAX){ const k = AMAX/ml; mx *= k; my *= k; mz *= k; }
      ax += mx; ay += my; az += mz;
      const kn = b.knuck;
      if (kn){
        const vh = Math.sqrt(V.x*V.x + V.z*V.z);
        if (vh > 0.3){ DR[0] = kn.freq*kn.t + kn.phase; sinQ(); const a = kn.amp*DR[0]; ax += a*V.z/vh; az -= a*V.x/vh; }
      }
    } else {
      ay = 0;
      const vh = Math.sqrt(V.x*V.x + V.z*V.z);
      if (vh > 0){
        ax -= b.rollDecel*V.x/vh; az -= b.rollDecel*V.z/vh;
        const dec = b.rollDecel + kd;
        if (vh <= dec*rem){ stops = true; mT = vh/dec; }
      }
    }
    // the motion over the piece: exact for these accelerations (a stop inside it ends the motion at the stop)
    let ex, ey, ez, evx, evy, evz;
    if (stops){
      ex = P.x + V.x*mT*0.5; ey = P.y; ez = P.z + V.z*mT*0.5; evx = 0; evy = 0; evz = 0;
    } else {
      evx = V.x + ax*mT; evy = V.y + ay*mT; evz = V.z + az*mT;
      ex = P.x + (V.x + evx)*0.5*mT; ey = P.y + (V.y + evy)*0.5*mT; ez = P.z + (V.z + evz)*0.5*mT;
    }
    const dX = ex - P.x, dY = ey - P.y, dZ = ez - P.z;

    // the earliest contact along the piece
    HIT.s = 2;
    if (hits < X.MAX_HITS){
      PC[0] = P.x; PC[1] = P.y; PC[2] = P.z; PC[3] = dX; PC[4] = dY; PC[5] = dZ; PC[6] = mT; PC[7] = tL + used; PC[8] = tS + used;
      PC[9] = ax; PC[10] = ay; PC[11] = az; PC[12] = Yc;
      if (!gr) groundHitQ(P, V);
      if (bw.caps.length) capsHitQ(bw);
      if (bw.boards.length) boardsHitQ(bw);
      if (BODIES) bodiesHitQ(b, bw);
      if (HANDS) handsHitQ();
      if (bw.solids && bw.solids.cast) wallHitQ(bw);
    }

    if (HIT.s > 1){
      // no contact: commit the piece
      const x0 = P.x, y0 = P.y, z0 = P.z;
      P.x = ex; P.y = Math.max(ey, Yc); P.z = ez; V.x = evx; V.y = evy; V.z = evz;
      PC[13] = mT; spinAndClockQ(b, gr, V);
      if (bw.traceQ){ TRC[0] = x0; TRC[1] = y0; TRC[2] = z0; TRC[3] = P.x; TRC[4] = P.y; TRC[5] = P.z; TRC[6] = rem; bw.traceQ(''); }
      else if (bw.trace) bw.trace('', x0, y0, z0, P.x, P.y, P.z, rem);
      if (bw.spec){ ZC[0] = x0; ZC[1] = y0; ZC[2] = z0; ZC[3] = P.x; ZC[4] = P.y; ZC[5] = P.z; ZC[6] = tS + used; ZC[7] = mT; zoneCheckQ(b, bw); }
      used += rem; rem = 0;
      break;
    }
    // move to the contact and respond
    // (a stop inside the piece decelerates evenly: at a fraction s of its distance the speed is v*sqrt(1 - s))
    const s = HIT.s, left = Math.sqrt(Math.max(0, 1 - s));
    const tc = HIT.ground ? HIT.tau : stops ? mT*(1 - left) : s*mT;
    const x0 = P.x, y0 = P.y, z0 = P.z;
    if (HIT.ground){
      P.x = HIT.px; P.y = HIT.py; P.z = HIT.pz;
    } else {
      P.x += s*dX; P.y += s*dY; P.z += s*dZ;
    }
    if (stops){ V.x *= left; V.z *= left; }
    else { V.x += ax*tc; V.y += ay*tc; V.z += az*tc; }
    PC[13] = tc; spinAndClockQ(b, gr, V);
    if (bw.traceQ){ TRC[0] = x0; TRC[1] = y0; TRC[2] = z0; TRC[3] = P.x; TRC[4] = P.y; TRC[5] = P.z; TRC[6] = tc; bw.traceQ(HIT.kind); }
    else if (bw.trace) bw.trace(HIT.kind, x0, y0, z0, P.x, P.y, P.z, tc);
    if (bw.spec){ ZC[0] = x0; ZC[1] = y0; ZC[2] = z0; ZC[3] = P.x; ZC[4] = P.y; ZC[5] = P.z; ZC[6] = tS + used; ZC[7] = tc; zoneCheckQ(b, bw); }
    used += tc; rem -= tc; hits++;
    resolve(b, bw, tS + used);
    // a hair off the surface, so the next piece starts outside it
    if (!HIT.ground){ P.x += HIT.nx*1e-7; P.y += HIT.ny*1e-7; P.z += HIT.nz*1e-7; }
    if (P.y < Yc) P.y = Yc;
    if (Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z) > vSize + 1e-9){ SUB[4] = used; return; }
  }
  // rest
  if (b.grounded && Math.sqrt(V.x*V.x + V.y*V.y + V.z*V.z) < ROLL_STOP && b.state === 'free'){
    V.x = 0; V.y = 0; V.z = 0; Wv.x = 0; Wv.y = 0; Wv.z = 0;
    b.still += dt;
    if (bw.solids && b.still >= X.SLEEP_T) b.sleep = true;
  } else b.still = 0;
  SUB[4] = used;
}

// spin decay in the air (and the knuckle's clock), or the lock to rolling spin on the ground, over PC[13] seconds. (A
// step's sub-steps repeat the same few lengths step after step, so the two decay factors are kept for the last lengths
// asked: the same numbers, without an exp() for every sub-step of every flight the strike solver and the prediction run.)
const SPK_N = 8, SPK_T = new Float64Array(2*SPK_N).fill(NaN), SPK_K = new Float64Array(2*SPK_N);
let SPK_I = 0;
// exp(-rate t) for t = PC[13], left in SPK_K[DK_AT]
let DK_AT = 0;
function decayQ(slot, rate){
  const o = slot*SPK_N, t = PC[13];
  for (let i = 0; i < SPK_N; i++) if (SPK_T[o + i] === t){ DK_AT = o + i; return; }
  DR[0] = -rate*t; expQ();
  const j = o + (SPK_I = (SPK_I + 1) % SPK_N);
  SPK_T[j] = t; SPK_K[j] = DR[0]; DK_AT = j;
}
function spinAndClockQ(b, gr, V){
  const t = PC[13];
  if (!(t > 0)) return;
  const Wv = b.w;
  if (!gr){
    decayQ(0, SPIN_DECAY);
    const k = SPK_K[DK_AT];
    Wv.x *= k; Wv.y *= k; Wv.z *= k;
    if (b.knuck) b.knuck.t += t;
  } else {
    // rolling spin (n x v)/R with n up: (vz, 0, -vx)/R
    decayQ(1, X.ROLL_SPIN);
    const f = 1 - SPK_K[DK_AT];
    Wv.x += (V.z/R - Wv.x)*f; Wv.y += (0 - Wv.y)*f; Wv.z += (-V.x/R - Wv.z)*f;
  }
}

// the ground on the piece's exact parabola: the first time y reaches Yc while moving down
function groundHitQ(P, V){
  const ax = PC[9], ay = PC[10], az = PC[11], Yc = PC[12], T = PC[6];
  const c = P.y - Yc;
  let tau = -1;
  if (c <= 0){ if (V.y < 0) tau = 0; }
  else {
    const A = 0.5*ay, B = V.y;
    if (Math.abs(A) < 1e-12){ if (B < 0) tau = -c/B; }
    else {
      const disc = B*B - 4*A*c;
      if (disc >= 0){
        const sq = Math.sqrt(disc), r1 = (-B - sq)/(2*A), r2 = (-B + sq)/(2*A);
        const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
        tau = lo > 0 ? lo : hi > 0 ? hi : -1;
      }
    }
  }
  if (!(tau >= 0) || tau > T) return;
  const s = T > 0 ? tau/T : 0;
  if (s >= HIT.s) return;
  HIT.s = s; HIT.kind = 'ground'; HIT.ground = true; HIT.tau = tau;
  HIT.px = P.x + V.x*tau + 0.5*ax*tau*tau; HIT.py = Yc; HIT.pz = P.z + V.z*tau + 0.5*az*tau*tau;
  HIT.nx = 0; HIT.ny = 1; HIT.nz = 0;
}

function capsHitQ(bw){
  const px = PC[0], py = PC[1], pz = PC[2], dx = PC[3], dy = PC[4], dz = PC[5];
  const lx = Math.min(px, px + dx), hx = Math.max(px, px + dx), ly = Math.min(py, py + dy), hy = Math.max(py, py + dy);
  const lz = Math.min(pz, pz + dz), hz = Math.max(pz, pz + dz);
  for (const c of bw.caps){
    if (hx < c.x0 || lx > c.x1 || hy < c.y0 || ly > c.y1 || hz < c.z0 || lz > c.z1) continue;
    SW[0] = px; SW[1] = py; SW[2] = pz; SW[3] = dx; SW[4] = dy; SW[5] = dz;
    SW[6] = c.ax; SW[7] = c.ay; SW[8] = c.az; SW[9] = c.ux; SW[10] = c.uy; SW[11] = c.uz; SW[12] = c.L; SW[13] = c.rr;
    sweepCapsuleQ();
    const s = SW[14];
    if (s < 0 || s >= HIT.s) continue;
    HIT.s = s; HIT.kind = c.kind; HIT.ground = false; HIT.nx = CN.x; HIT.ny = CN.y; HIT.nz = CN.z;
    HIT.e = c.kind === 'board' ? E_BOARD : E_POST; HIT.mu = c.kind === 'board' ? X.MU_BOARD : MU_POST;
    HIT.svx = HIT.svy = HIT.svz = 0; HIT.spread = c.kind === 'board'; HIT.end = c.end; HIT.part = c.kind;
  }
}

function boardsHitQ(bw){
  const px = PC[0], py = PC[1], pz = PC[2], dx = PC[3], dy = PC[4], dz = PC[5];
  for (const B of bw.boards){
    const s0 = B.nx*px + B.ny*py + B.nz*pz - B.d, ds = B.nx*dx + B.ny*dy + B.nz*dz;
    let s = -1, side = 1;
    if (s0 >= 0){
      if (ds < 0){ if (s0 <= R) s = 0; else if (s0 + ds < R) s = (s0 - R)/(-ds); }
    } else {
      side = -1;
      if (ds > 0){ if (s0 >= -R) s = 0; else if (s0 + ds > -R) s = (-R - s0)/ds; }
    }
    if (s < 0 || s > 1 || s >= HIT.s) continue;
    // the contact point on the board's face must be within the board
    const cx = px + s*dx, cy = py + s*dy, cz = pz + s*dz, off = B.nx*cx + B.ny*cy + B.nz*cz - B.d;
    const qx = cx - off*B.nx, qy = cy - off*B.ny, qz = cz - off*B.nz, tol = 1e-6;
    if (qx < B.x0 - tol || qx > B.x1 + tol || qz < B.z0 - tol || qz > B.z1 + tol || qy > B.y1 || qy < B.y0 - R) continue;
    HIT.s = s; HIT.kind = 'board'; HIT.ground = false; HIT.nx = side*B.nx; HIT.ny = side*B.ny; HIT.nz = side*B.nz;
    HIT.e = B.e; HIT.mu = X.MU_BOARD; HIT.svx = HIT.svy = HIT.svz = 0; HIT.spread = true; HIT.end = 0; HIT.part = 'board';
  }
}

// bodies: standing capsules (legs, torso, head) moved to the step, or one capsule given by the record (a diving keeper).
// Each moves at its own velocity through the step, so the test runs on the ball's motion relative to it.
function bodiesHitQ(b, bw){
  const px = PC[0], py = PC[1], pz = PC[2], dx = PC[3], dy = PC[4], dz = PC[5], T = PC[6], tPiece = PC[7], tAbs = PC[8];
  const Bd = X.BODY, back = STEP_H - tPiece;    // the body positions are for the end of the step
  for (const bd of BODIES){
    if (!bd || bd.ghost) continue;
    if (bd.id === b.last.agent && tAbs - b.last.t < X.GHOST_T) continue;
    const bvx = +bd.vx || 0, bvz = +bd.vz || 0, bvy = +bd.vy || 0;
    const rdx = dx - bvx*T, rdy = dy - bvy*T, rdz = dz - bvz*T;    // the ball's motion seen from the body
    if (bd.seg){
      const g = bd.seg, sx = -bvx*back, sy = -bvy*back, sz = -bvz*back;
      const gx = g.bx - g.ax, gy = g.by - g.ay, gz = g.bz - g.az, L = Math.sqrt(gx*gx + gy*gy + gz*gz) || 1e-9;
      SW[0] = px; SW[1] = py; SW[2] = pz; SW[3] = rdx; SW[4] = rdy; SW[5] = rdz; SW[6] = g.ax + sx; SW[7] = g.ay + sy; SW[8] = g.az + sz;
      SW[9] = (g.bx - g.ax)/L; SW[10] = (g.by - g.ay)/L; SW[11] = (g.bz - g.az)/L; SW[12] = L; SW[13] = (g.r || 0.2) + R;
      sweepCapsuleQ();
      const s = SW[14];
      if (s >= 0 && s < HIT.s) bodyHitSet(s, bd, 'body', bvx, bvy, bvz);
      continue;
    }
    const hh = +bd.h || 1, by = +bd.y || 0, x0 = bd.x - bvx*back, z0 = bd.z - bvz*back, y0 = by - bvy*back;
    const reach = Bd.torsoR*hh + R + Math.sqrt(rdx*rdx + rdz*rdz) + 0.05, ddx = px - x0, ddz = pz - z0;
    if (ddx*ddx + ddz*ddz > reach*reach) continue;
    if (py > y0 + (Bd.headY + Bd.headR)*hh + R + Math.abs(rdy) + 0.05) continue;
    // the legs, the torso and the head: three upright capsules (SW's point, motion and direction are the same for all)
    SW[0] = px; SW[1] = py; SW[2] = pz; SW[3] = rdx; SW[4] = rdy; SW[5] = rdz; SW[9] = 0; SW[10] = 1; SW[11] = 0;
    SW[6] = x0; SW[7] = y0; SW[8] = z0; SW[12] = Bd.legsTop*hh; SW[13] = Bd.legsR*hh + R;
    sweepCapsuleQ();
    let s = SW[14];
    if (s >= 0 && s < HIT.s) bodyHitSet(s, bd, 'legs', bvx, bvy, bvz);
    SW[6] = x0; SW[7] = y0 + Bd.legsTop*hh; SW[8] = z0; SW[12] = (Bd.torsoTop - Bd.legsTop)*hh; SW[13] = Bd.torsoR*hh + R;
    sweepCapsuleQ();
    s = SW[14];
    if (s >= 0 && s < HIT.s) bodyHitSet(s, bd, 'torso', bvx, bvy, bvz);
    SW[6] = x0; SW[7] = y0 + Bd.headY*hh; SW[8] = z0; SW[12] = 0; SW[13] = Bd.headR*hh + R;
    sweepCapsuleQ();
    s = SW[14];
    if (s >= 0 && s < HIT.s) bodyHitSet(s, bd, 'head', bvx, bvy, bvz);
  }
}
function bodyHitSet(s, bd, part, vx, vy, vz){
  HIT.s = s; HIT.kind = 'body'; HIT.ground = false; HIT.nx = CN.x; HIT.ny = CN.y; HIT.nz = CN.z;
  HIT.e = E_BODY; HIT.mu = X.MU_BODY; HIT.svx = vx; HIT.svy = vy; HIT.svz = vz; HIT.spread = true;
  HIT.end = 0; HIT.part = part; HIT.id = bd.id != null ? bd.id : -1; HIT.team = bd.team != null ? bd.team : -1;
}
function handsHitQ(){
  const px = PC[0], py = PC[1], pz = PC[2], dx = PC[3], dy = PC[4], dz = PC[5], T = PC[6], tPiece = PC[7];
  const back = STEP_H - tPiece;
  for (const hd of HANDS){
    if (!hd) continue;
    const vx = +hd.vx || 0, vy = +hd.vy || 0, vz = +hd.vz || 0;
    const cx = hd.x - vx*back, cy = hd.y - vy*back, cz = hd.z - vz*back;
    SW[0] = px; SW[1] = py; SW[2] = pz; SW[3] = dx - vx*T; SW[4] = dy - vy*T; SW[5] = dz - vz*T;
    SW[6] = cx; SW[7] = cy; SW[8] = cz; SW[9] = 0; SW[10] = 1; SW[11] = 0; SW[12] = 0; SW[13] = (hd.r || 0.1) + R;
    sweepCapsuleQ();
    const s = SW[14];
    if (s >= 0 && s < HIT.s){
      HIT.s = s; HIT.kind = 'body'; HIT.ground = false; HIT.nx = CN.x; HIT.ny = CN.y; HIT.nz = CN.z;
      HIT.e = E_BODY; HIT.mu = X.MU_BODY; HIT.svx = vx; HIT.svy = vy; HIT.svz = vz; HIT.spread = false;
      HIT.end = 0; HIT.part = 'hand'; HIT.id = hd.id != null ? hd.id : -1; HIT.team = hd.team != null ? hd.team : -1;
    }
  }
}
// life walls and furniture: a ray from the centre along the piece, the surface taken as the plane through the hit
function wallHitQ(bw){
  const px = PC[0], py = PC[1], pz = PC[2], dx = PC[3], dy = PC[4], dz = PC[5];
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (len < 1e-9) return;
  const ux = dx/len, uy = dy/len, uz = dz/len;
  const t = bw.solids.cast(px, py, pz, ux, uy, uz, len + R, NB);
  if (!(t < len + R - 1e-9)) return;
  let nx = NB[0], ny = NB[1], nz = NB[2];
  const nl = hypot(nx, ny, nz);
  if (nl < 1e-9) return;
  nx /= nl; ny /= nl; nz /= nl;
  const nu = nx*ux + ny*uy + nz*uz;
  if (nu >= -1e-9) return;
  const s0 = -t*nu;                       // centre's distance to the plane now
  let sig = (s0 - R)/(-nu);
  if (sig < 0) sig = 0;
  const s = sig/len;
  if (s > 1 || s >= HIT.s) return;
  HIT.s = s; HIT.kind = 'wall'; HIT.ground = false; HIT.nx = nx; HIT.ny = ny; HIT.nz = nz;
  HIT.e = E_BOARD; HIT.mu = X.MU_BOARD; HIT.svx = HIT.svy = HIT.svz = 0; HIT.spread = false; HIT.end = 0; HIT.part = 'wall';
}

// the response to HIT and its event
function resolve(b, bw, t){
  const V = b.v, P = b.p;
  if (HIT.ground){ groundImpact(b, bw, t); return; }
  const vix = V.x, viy = V.y, viz = V.z;
  const sp = respond(b, HIT.nx, HIT.ny, HIT.nz, HIT.e, HIT.mu, HIT.svx, HIT.svy, HIT.svz);
  if (sp <= 0) return;
  if (HIT.spread) spread(b, bw, HIT.nx, HIT.ny, HIT.nz, HIT.svx, HIT.svz);
  capSpeed(b);
  if (b.knuck) b.knuck = null;
  if (b.state === 'dead') return;
  const vIn = {x: vix, y: viy, z: viz}, vOut = {x: V.x, y: V.y, z: V.z}, n = {x: HIT.nx, y: HIT.ny, z: HIT.nz};
  if (HIT.kind === 'post' || HIT.kind === 'bar'){
    emit(bw, HIT.kind, {end: HIT.end, x: P.x, y: P.y, z: P.z, t, speed: sp, vIn, vOut, n});
  } else if (HIT.kind === 'board'){
    emit(bw, 'board', {x: P.x, y: P.y, z: P.z, t, speed: sp, vIn, vOut, n});
  } else if (HIT.kind === 'body'){
    const L = b.last;
    L.agent = HIT.id; L.team = HIT.team; L.kind = 'deflect'; L.t = t; L.x = P.x; L.z = P.z;
    emit(bw, 'body', {id: HIT.id, team: HIT.team, part: HIT.part, x: P.x, y: P.y, z: P.z, t, speed: sp, vIn, vOut, n});
  } else if (HIT.kind === 'wall'){
    emit(bw, 'wall', {x: P.x, y: P.y, z: P.z, t, speed: sp, vIn, vOut, n});
  }
}

// a bounce on the floor (1.5.1): restitution clamp(0.62 - 0.012(|vy| - 4), 0.45, 0.62), friction mu 0.4 toward
// rolling, the knuckle reset; rolling from here when it leaves slower than 0.6 m/s
function groundImpact(b, bw, t){
  const V = b.v, vyIn = -V.y;
  if (!(vyIn > 0)) { V.y = Math.max(0, V.y); return; }
  const e = clamp(E_MAX - 0.012*(vyIn - 4), E_MIN, E_MAX);
  respond(b, 0, 1, 0, e, MU, 0, 0, 0);
  if (V.y < X.ROLL_VY) V.y = 0;
  b.knuck = null;
  if (vyIn >= X.ROLL_VY && b.state !== 'dead') emit(bw, 'bounce', {x: b.p.x, y: b.p.y, z: b.p.z, t, vy: vyIn, e});
}

// nets (1.5.1): a soft plane per panel, a = -600 d n - 25 v_n n - 3 v_t on penetration d, taken implicitly over the
// piece so it never rings; the side the ball belongs on is remembered per panel, so a ball can bulge the net past
// its plane and a ball outside the goal is kept out the same way. Once the ball has met a net it is damped by
// exp(-4 t) while it stays inside the goal.
function netApplyQ(b, bw){
  const T = PC[14], t = PC[15];
  const P = b.p, V = b.v, ns = b.netSide;
  let qMax = 0;
  b.netAny = true;
  for (const pn of bw.panels){
    const i = pn.idx;
    if (P.x < pn.x0 || P.x > pn.x1 || P.y < pn.y0 || P.y > pn.y1 || P.z < pn.z0 || P.z > pn.z1){ ns[i] = 0; continue; }
    const sd = pn.nx*P.x + pn.ny*P.y + pn.nz*P.z - pn.d, cur = ns[i], wasIn = cur === 2 || cur === -2;
    // beside the panel (a ball already in the net keeps it a ball's width past the edge): the side is where it is now
    if (!inQuad(pn, P.x, P.y, P.z, wasIn ? R : 0)){ ns[i] = sd >= 0 ? 1 : -1; continue; }
    const side = cur > 0 ? 1 : cur < 0 ? -1 : sd >= 0 ? 1 : -1;
    const q = R - side*sd;
    if (q <= 0){ ns[i] = side; continue; }                                   // clear of it
    if (q >= X.NET_MAX + R + 0.1){ ns[i] = sd >= 0 ? 1 : -1; continue; }     // well past it: the other side now
    if (!wasIn){
      ns[i] = 2*side;
      b.netHit = true;
      if (b.state !== 'dead') emit(bw, 'net', {end: pn.end, part: pn.part, x: P.x, y: P.y, z: P.z, t, speed: speedOf(b)});
    }
    if (q > qMax) qMax = q;
    const vn = V.x*pn.nx + V.y*pn.ny + V.z*pn.nz;
    const qd = -side*vn;                                    // how fast the ball goes deeper
    const qd1 = (qd - NET_K*T*q)/(1 + NET_C*T + NET_K*T*T);
    const vn1 = -side*qd1, kt = exp(-NET_T*T);
    V.x = (V.x - vn*pn.nx)*kt + vn1*pn.nx; V.y = (V.y - vn*pn.ny)*kt + vn1*pn.ny; V.z = (V.z - vn*pn.nz)*kt + vn1*pn.nz;
    if (q >= X.NET_MAX + R - 0.05 && qd1 > 0){
      // fully stretched: the net holds like a wall
      V.x -= vn1*pn.nx; V.y -= vn1*pn.ny; V.z -= vn1*pn.nz;
    }
  }
  b.netQ = qMax;
  if (b.netHit){
    let inside = false;
    for (const g of bw.vols){
      const ax = g.end*P.x;
      if (ax < g.x0 || ax > g.x1 + 0.5 || Math.abs(P.z) > g.zh + 0.5) continue;
      const top = g.y0 + (g.y1 - g.y0)*clamp((ax - g.x0)/(g.x1 - g.x0), 0, 1);
      if (P.y <= top + 0.5){ inside = true; break; }
    }
    if (inside){ const k = exp(-X.NET_IN*T); V.x *= k; V.y *= k; V.z *= k; }
    else b.netHit = false;
  }
}

// goal and out of play on a pitch (3.1.1 step 5): the first line the ball's centre crosses on the way out, interpolated
// inside the piece; a goal when that is the goal line inside the mouth (|z| < 3.66, y < 2.44 at the crossing)
function zoneCheckQ(b, bw){
  const x0 = ZC[0], y0 = ZC[1], z0 = ZC[2], x1 = ZC[3], y1 = ZC[4], z1 = ZC[5], tA = ZC[6], dtp = ZC[7];
  const gx = bw.goalX, tz = bw.touchZ;
  if (b.inField === null) b.inField = Math.abs(x0) < gx && Math.abs(z0) < tz;
  const in1 = Math.abs(x1) < gx && Math.abs(z1) < tz;
  if (in1){ b.inField = true; return; }
  if (!b.inField) return;
  b.inField = false;
  if (b.state !== 'free') return;
  let fx = 2, fz = 2;
  if (Math.abs(x1) >= gx){ const L = x1 > 0 ? gx : -gx; fx = x1 === x0 ? 0 : clamp((L - x0)/(x1 - x0), 0, 1); }
  if (Math.abs(z1) >= tz){ const L = z1 > 0 ? tz : -tz; fz = z1 === z0 ? 0 : clamp((L - z0)/(z1 - z0), 0, 1); }
  const f = Math.min(fx, fz), cx = x0 + f*(x1 - x0), cy = y0 + f*(y1 - y0), cz = z0 + f*(z1 - z0), t = tA + f*dtp;
  if (fx <= fz){
    const end = x1 > 0 ? 1 : -1;
    if (Math.abs(cz) < bw.mouthHalf && cy < bw.mouthTop) emit(bw, 'goal', {end, x: cx, y: cy, z: cz, t});
    else emit(bw, 'out', {line: 'goal', end, x: cx, y: cy, z: cz, t});
  } else emit(bw, 'out', {line: 'touch', end: z1 > 0 ? 1 : -1, x: cx, y: cy, z: cz, t});
}

/* ---------- prediction (3.1.2) ---------- */

const PB = createBall(), FB = createBall();
const FREE = createBallWorld({});            // open ground, nothing else: the solver's world

function copyBall(dst, src, spinMul = 1){
  dst.p.x = src.p.x; dst.p.y = src.p.y; dst.p.z = src.p.z;
  dst.v.x = src.v.x; dst.v.y = src.v.y; dst.v.z = src.v.z;
  dst.w.x = src.w.x*spinMul; dst.w.y = src.w.y*spinMul; dst.w.z = src.w.z*spinMul;
  dst.dragMul = src.dragMul; dst.knuck = null; dst.state = src.state === 'held' ? 'held' : 'free'; dst.holder = src.holder;
  dst.rollDecel = src.rollDecel; dst.sleep = false; dst.still = 0; dst.grounded = src.grounded; dst.inField = null;
  dst.netSide.set(src.netSide); dst.netHit = src.netHit; dst.netQ = src.netQ; dst.netAny = src.netAny; dst.floor = src.floor;
  dst.pendN = 0;
  dst.last.agent = src.last.agent; dst.last.t = -1e9;
  return dst;
}
// the world a prediction runs in: the same pitch colliders but only the ground, posts, bar and nets (no bodies, no
// boards, no events, no randomness); a life zone keeps its floor
function predWorld(bw){
  if (!bw) return FREE;
  if (!bw.pred){
    const pw = createBallWorld({spec: bw.spec, solids: bw.solids && bw.solids.floor ? {floor: bw.solids.floor} : null,
      floorY: bw.floorY});
    pw.boards = []; pw.caps = pw.caps.filter(c => c.kind !== 'board');
    bw.pred = pw;
  }
  return bw.pred;
}

// N samples of the ball's future at hz per second, written as x, y, z, t (t from now: sample 0 is the ball now) into
// out (Float32Array(4*N)). The same integrator at 60 Hz steps (hz = 30: two steps a sample, exactly what the live ball
// will do without bodies in the way). spinMul scales the spin read (a keeper's misread); the knuckle's wobble is never
// predicted. Returns the number of samples written.
export function ballPredict(b, bw, out, N = 90, hz = 30, spinMul = 1){
  const cap = Math.min(N, Math.floor(out.length/4));
  if (cap <= 0) return 0;
  const pw = predWorld(bw), per = Math.max(1, Math.round(60/hz)), hs = 1/(hz*per);
  copyBall(PB, b, spinMul);
  pw.t = 0;
  out[0] = PB.p.x; out[1] = PB.p.y; out[2] = PB.p.z; out[3] = 0;
  for (let k = 1; k < cap; k++){
    const atRest = PB.state !== 'held' && PB.v.x === 0 && PB.v.y === 0 && PB.v.z === 0 && PB.grounded;
    if (!atRest) for (let j = 0; j < per; j++) ballStep(PB, pw, hs);
    const o = 4*k;
    out[o] = PB.p.x; out[o + 1] = PB.p.y; out[o + 2] = PB.p.z; out[o + 3] = k/hz;
  }
  return cap;
}

// The first sample of a prediction an actor can reach (3.1.2): timeToPoint(actor, sample) + react <= sample.t with the
// sample's height within reachY. actor = {x, z, vx, vz, prm, fac, react, reachY} or {m /* a mover */, prm, fac, react,
// reachY}; prm defaults to the football profile, fac to fresh, reachY to 0.6 (feet). Between the last sample out of
// reach and the first in reach the time is interpolated, so the answer is not tied to the 30 Hz grid.
// (Addition: reach, metres the actor can stretch, so he need not stand on the ball's point; default 0.)
const MV = {x: 0, z: 0, speed: 0, heading: 0};
let PRM_DEF = null;
// the margin t - (timeToPoint + react) of prediction sample k for the actor set up in MV
function reachMargin(predOut, k, prm, fac, react, reach){
  const o = 4*k, x = predOut[o], z = predOut[o + 2];
  let tx = x, tz = z;
  if (reach > 0){
    const dx = x - MV.x, dz = z - MV.z, d = Math.sqrt(dx*dx + dz*dz);
    if (d <= reach){ tx = MV.x; tz = MV.z; } else { tx = MV.x + dx*(d - reach)/d; tz = MV.z + dz*(d - reach)/d; }
  }
  TT[0] = tx; TT[1] = tz; TT[2] = react;
  timeToPointQ(MV, prm, fac);
  return predOut[o + 3] - TT[0];
}
export function firstReach(predOut, count, actor){
  if (!actor || !(count > 0)) return null;
  const m = actor.m || actor;
  MV.x = +m.x || 0; MV.z = +m.z || 0;
  if (actor.m){ MV.speed = +m.speed || 0; MV.heading = +m.heading || 0; }
  else {
    const vx = +actor.vx || 0, vz = +actor.vz || 0;
    MV.speed = hypot(vx, vz); MV.heading = MV.speed > 1e-6 ? yawOf(vx, vz) : 0;
  }
  const prm = actor.prm || PRM_DEF || (PRM_DEF = moverParams({}, "football"));
  const fac = actor.fac || FRESH, react = +actor.react || 0, reachY = actor.reachY != null ? +actor.reachY : 0.6;
  const reach = +actor.reach || 0, vTop = Math.max(0.1, sprintSpeed(prm, fac));
  // the fastest any run could be: from his present speed at the full a0 (moverStep's acceleration only falls off from
  // there) up to top speed; so a sample sooner than react + tMin(d) is out of reach without asking timeToPoint
  const v0 = Math.min(MV.speed, vTop), a0 = Math.max(0.1, prm.a0*(fac.accel != null ? fac.accel : 1));
  const t1 = (vTop - v0)/a0, d1 = (v0 + vTop)*0.5*t1;
  const tMin = d => d <= d1 ? (Math.sqrt(v0*v0 + 2*a0*d) - v0)/a0 : t1 + (d - d1)/vTop;
  // pg: the previous sample's margin when it was in reach in height (NaN: not worked out yet, known to be short)
  let pg = NaN, pOk = false;
  for (let k = 0; k < count; k++){
    const o = 4*k, x = predOut[o], y = predOut[o + 1], z = predOut[o + 2], t = predOut[o + 3];
    if (!(y <= reachY)){ pOk = false; continue; }
    // no one gets there sooner than that: most samples stop here
    const ex = x - MV.x, ez = z - MV.z, d = Math.max(0, Math.sqrt(ex*ex + ez*ez) - reach);
    if (t < react + tMin(d) - 1e-9){ pg = NaN; pOk = true; continue; }
    const g = reachMargin(predOut, k, prm, fac, react, reach);
    if (g >= 0){
      if (k === 0) return {t, x, y, z};
      const po = o - 4, t0 = predOut[po + 3];
      let f;
      if (pOk){
        if (Number.isNaN(pg)) pg = reachMargin(predOut, k - 1, prm, fac, react, reach);
        f = pg < 0 ? pg/(pg - g) : 0;                                        // the margin crosses zero
      } else {
        const y0 = predOut[po + 1];                                          // the ball drops into reach
        f = y0 > reachY && y0 !== y ? (y0 - reachY)/(y0 - y) : 1;
      }
      f = clamp(f, 0, 1);
      return {t: t0 + f*(t - t0), x: predOut[po] + f*(x - predOut[po]), y: predOut[po + 1] + f*(y - predOut[po + 1]),
        z: predOut[po + 2] + f*(z - predOut[po + 2])};
    }
    pg = g; pOk = true;
  }
  return null;
}

// Addition for the strike solver (strike.js): fly a copy of b until its centre crosses the vertical plane through
// (px, pz) with horizontal unit normal (nx, nz) (signed distance going from below zero to zero or above), or tMax
// seconds pass, or it comes to rest. bw null is open ground; otherwise the prediction colliders of bw. The crossing is
// interpolated on the sub-step piece it falls in. out = {hit, x, y, z, t, apex, vx, vy, vz} (filled and returned).
const FLY = {px: 0, pz: 0, nx: 0, nz: 0, t: 0, done: false, apex: 0, out: null};
function flyTraceQ(kind){
  if (FLY.done) return;
  const x0 = TRC[0], y0 = TRC[1], z0 = TRC[2], x1 = TRC[3], y1 = TRC[4], z1 = TRC[5], dt = TRC[6];
  const s0 = (x0 - FLY.px)*FLY.nx + (z0 - FLY.pz)*FLY.nz, s1 = (x1 - FLY.px)*FLY.nx + (z1 - FLY.pz)*FLY.nz;
  if (s0 < 0 && s1 >= 0){
    const f = s0/(s0 - s1), o = FLY.out;
    o.hit = true; o.x = x0 + f*(x1 - x0); o.y = y0 + f*(y1 - y0); o.z = z0 + f*(z1 - z0); o.t = FLY.t + f*dt;
    if (o.y > FLY.apex) FLY.apex = o.y;
    FLY.done = true;
    return;
  }
  if (y1 > FLY.apex) FLY.apex = y1;
  FLY.t += dt;
}
export function ballFlyTo(b, bw, px, pz, nx, nz, tMax, out = {}){
  const w = predWorld(bw), keep = w.trace, keepQ = w.traceQ;
  copyBall(FB, b);
  out.hit = false; out.x = FB.p.x; out.y = FB.p.y; out.z = FB.p.z; out.t = 0;
  FLY.px = px; FLY.pz = pz; FLY.nx = nx; FLY.nz = nz; FLY.t = 0; FLY.done = false; FLY.apex = FB.p.y; FLY.out = out;
  const s0 = (FB.p.x - px)*nx + (FB.p.z - pz)*nz;
  if (s0 >= 0){ out.hit = true; out.apex = FB.p.y; out.vx = FB.v.x; out.vy = FB.v.y; out.vz = FB.v.z; return out; }
  w.trace = null; w.traceQ = flyTraceQ; w.t = 0;
  const h = 1/60;
  let steps = 0;
  const maxSteps = Math.ceil(tMax/h);
  try {
    while (!FLY.done && steps++ < maxSteps){
      ballStep(FB, w, h);
      if (FB.grounded && FB.v.x === 0 && FB.v.z === 0) break;
    }
  } finally { w.trace = keep; w.traceQ = keepQ; }
  if (!FLY.done){ out.x = FB.p.x; out.y = FB.p.y; out.z = FB.p.z; out.t = FLY.t; }
  out.apex = FLY.apex; out.vx = FB.v.x; out.vy = FB.v.y; out.vz = FB.v.z;
  return out;
}

/* ---------- closed forms of the ground roll (3.1.3): dv/dt = -(rollDecel + KD v^2) ---------- */

// metres a ball rolling at v0 covers until it has slowed to v1
export function rollDistance(v0, v1 = 0, rollDecel = 1.1, dragMul = 1){
  const k = KD*dragMul;
  if (!(v0 > v1)) return 0;
  return log((rollDecel + k*v0*v0)/(rollDecel + k*v1*v1))/(2*k);
}
// the speed a rolling ball needs to arrive d metres away at v1
export function rollSpeedFor(d, v1 = 0, rollDecel = 1.1, dragMul = 1){
  const k = KD*dragMul;
  return Math.sqrt(Math.max(0, ((rollDecel + k*v1*v1)*exp(2*k*Math.max(0, d)) - rollDecel)/k));
}
// seconds a ball rolling at v0 takes to cover d metres (Infinity when it stops short)
// (the pass model asks this for one pass speed at a dozen distances in a row: the part that depends only on the speed
// is kept from the last call, the same numbers it would work out again. rollTimeQ is the register form for the pass
// model's loops: RQT[0] = v0, RQT[1] = d, RQT[2] = rollDecel, RQT[3] = dragMul in, the seconds in RQT[0] out; nothing
// boxed, 3.9.6)
const RT = {v0: NaN, rd: NaN, dm: NaN, phi0: 0, cp: 0};
export const RQT = new Float64Array(4);
export function rollTime(v0, d, rollDecel = 1.1, dragMul = 1){
  RQT[0] = v0; RQT[1] = d; RQT[2] = rollDecel; RQT[3] = dragMul;
  rollTimeQ();
  return RQT[0];
}
export function rollTimeQ(){
  const v0 = RQT[0], d = RQT[1], rollDecel = RQT[2], dragMul = RQT[3];
  if (!(d > 0)){ RQT[0] = 0; return; }
  if (!(v0 > 0)){ RQT[0] = Infinity; return; }
  const k = KD*dragMul, c = Math.sqrt(rollDecel*k);
  if (v0 !== RT.v0 || rollDecel !== RT.rd || dragMul !== RT.dm){
    RT.v0 = v0; RT.rd = rollDecel; RT.dm = dragMul;
    DR[0] = v0*Math.sqrt(k/rollDecel); atanQ(); RT.phi0 = DR[0];
    DR[0] = RT.phi0; cosQ(); RT.cp = DR[0];
  }
  DR[0] = k*d; expQ();
  const phi0 = RT.phi0, q = RT.cp*DR[0];
  if (q >= 1){ RQT[0] = Infinity; return; }
  // acos(q) as detmath's acos: atan2(sqrt((1 - q)(1 + q)), q) for q in [-1, 1], else NaN
  let ac = NaN;
  if (q >= -1 && q <= 1){ DR[0] = Math.sqrt((1 - q)*(1 + q)); DR[1] = q; atan2Q(); ac = DR[0]; }
  RQT[0] = (phi0 - ac)/c;
}
// the speed of that ball after t seconds
export function rollSpeedAt(v0, t, rollDecel = 1.1, dragMul = 1){
  const k = KD*dragMul, c = Math.sqrt(rollDecel*k), phi = atan(v0*Math.sqrt(k/rollDecel)) - c*t;
  return phi <= 0 ? 0 : Math.sqrt(rollDecel/k)*tan(phi);
}
