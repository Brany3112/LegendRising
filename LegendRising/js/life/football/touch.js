// js/life/football/touch.js: the body meeting the ball. Which part of a player can reach it, the first touch (how much
// of the incoming pace the control kills and where the rest goes), the dribble touch on a footfall, the tackle's foot
// sweep and what it meets first, the header, and how an unplanned contact is read (control, deflection or block).
// Owner: WP-C (ball, strike and touch models). Contract DESIGN 1.4.12; numbers 1.5.3; behaviour 3.1.4 (fouls 3.2.9).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Randomness comes from r (rng.js).
// Every function returns velocities and decisions; the caller applies them with ballKick (ball.js), so a touch is a
// real kick of the one ball and nothing attaches from outside the reach envelope.
//
// An agent is the simulation's record (agent.js: m the mover, at the attributes, scale, y the jump offset, state) or a
// flat {x, z, yaw, vx, vz, scale, y} for tests and life; skills come from ctx first, then agent.at, then 50.
// Directions: yaw as DESIGN 1.1 (yaw 0 faces -Z); right of a facing d is (-dz, dx).

import {BALL, rollDistance} from "./ball.js";
import {truncNormal} from "./rng.js";
import {dirOf, yawOf} from "./pitchspec.js";
import {sin, cos, pow, atan2, atan, asin, acos, hypot} from "./detmath.js";

const DEG = Math.PI/180;
const {R, KD, G} = BALL;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

// 1.5.3 and 3.1.4 numbers in one place
export const TOUCH = Object.freeze({
  FOOT: 0.75, FOOT_K: 0.003, FOOT_Y: 0.6,         // foot reach 0.75 + 0.003 dribbling with the ball under 0.6 m
  SOLE: 0.45, SOLE_Y: 0.15,                       // sole: within 0.45 m, ball under 0.15 m
  BODY: 0.6, THIGH_Y: [0.6, 0.95], CHEST_Y: [0.95, 1.4],   // thigh or chest within 0.6 m at 0.6 to 1.4 m
  HEAD: 0.55, HEAD_Y: [1.5, 2.1],                 // head 1.5 to 2.1 m (plus the jump)
  ABSORB_MIN: 0.04, ABSORB_MAX: 0.6, BODY_ABSORB: 0.08,
  PUSH: [1, 3],                                   // a first touch pushes 1 to 3 m/s along WASD
  HEAVY: 1.5,                                     // metres: a touch that leaves the ball further than this is heavy
  DRIB_REACH: 0.9, DRIB_CONE: 50*DEG, WEAK_SIDE: 0.25,
  CADENCE: [[3, 1], [6, 2], [Infinity, 3]],       // every stride under 3 m/s, every 2nd to 6, every 3rd above
  HEADER_R: 0.17, HEADER_RK: 0.0015,
  CONTROL: {intercept: [8, 0.12], receive: [18, 0.12]}   // control thresholds (m/s): base + k x skill
});

// the tackles of 1.5.3: standing (wind-up 0.12 s, active 0.25 s, reach 1.05 + 0.003 tackling in a 50 degree cone),
// a toe poke (a shorter, straight jab), and the slide (travel 2.8 + 0.01 tackling at 6 m/s squared, sweep 1.3 m,
// commitment 1.1 s, 0.8 s on the ground)
export const TACKLE = Object.freeze({
  FOOT_R: 0.12, LEG_R: 0.16, LEG_TOP: 0.85, NEAR_T: 0.08,
  stand: {wind: 0.12, active: 0.25, reach: 1.05, reachK: 0.003, cone: 50*DEG, rest: 0.35},
  poke: {wind: 0.08, active: 0.18, reach: 1.15, reachK: 0.003, cone: 0, rest: 0.3},
  slide: {travel: 2.8, travelK: 0.01, decel: 6, sweep: 1.3, lead: 0.9, commit: 1.1, ground: 0.8}
});

/* ---------- reading an agent ---------- */

function posOf(a){ return a.m || a; }
// a skill from ctx (under key or alt), else from the agent's attributes (under key or alt), else 50
function skillOf(a, ctx, key, alt){
  if (ctx && ctx[key] != null) return +ctx[key];
  if (alt && ctx && ctx[alt] != null) return +ctx[alt];
  const at = a && a.at;
  if (at && at[key] != null) return +at[key];
  if (alt && at && at[alt] != null) return +at[alt];
  return 50;
}
function yawOfAgent(a){ const m = posOf(a); return m.yaw != null ? +m.yaw : 0; }
function velOf(a){
  const m = posOf(a);
  if (m.vx != null || m.vz != null) return {x: +m.vx || 0, z: +m.vz || 0};
  return {x: 0, z: 0};
}
function footOf(a){
  const f = a.foot || a.prefFoot || (a.at && a.at.foot) || 'R';
  return f === 'Left' || f === 'L' ? 'L' : f === 'Both' || f === 'B' ? 'B' : 'R';
}

/* ---------- reach ---------- */

// Which part of the agent can play the ball now (3.1.4), or null: a ball outside every envelope stays loose.
// Heights scale with the agent's height (scale) and are measured from his root (y, raised by a jump). side is the side
// of his body the ball is on; dist the horizontal distance from his centre.
export function reachEnvelope(agent, ball){
  const m = posOf(agent), P = ball.p || ball, T = TOUCH;
  const sc = agent.scale || 1, root = +agent.y || 0;
  const dx = P.x - m.x, dz = P.z - m.z, dist = hypot(dx, dz), y = P.y - root;
  const f = dirOf(yawOfAgent(agent)), lat = dx*(-f.z) + dz*f.x;
  const side = lat >= 0 ? 'R' : 'L';
  const drib = skillOf(agent, null, 'dribbling');
  if (y < T.SOLE_Y*sc && dist <= T.SOLE) return {part: 'sole', side, dist};
  if (y < T.FOOT_Y*sc && dist <= T.FOOT + T.FOOT_K*drib) return {part: 'foot', side, dist};
  if (dist <= T.BODY){
    if (y >= T.THIGH_Y[0]*sc && y < T.THIGH_Y[1]*sc) return {part: 'thigh', side, dist};
    if (y >= T.CHEST_Y[0]*sc && y <= T.CHEST_Y[1]*sc) return {part: 'chest', side, dist};
  }
  if (dist <= T.HEAD && y >= T.HEAD_Y[0]*sc && y <= T.HEAD_Y[1]*sc) return {part: 'head', side, dist};
  return null;
}

/* ---------- first touch ---------- */

// The first touch (1.5.3, 3.1.4). intent = {dir: {x, z} | null (cushion), push: 0..1}; ctx = {ctrl, pressure01, bF,
// vIn} (vIn: the ball's velocity or speed at contact, else its own; optional rollDecel for the heavy test). absorb =
// clamp(0.05 + 0.13(1 - ctrl/100)^1.2 + 0.01 max(0, |vIn| - 10) + 0.12 pressure + 0.08(1 - bF), 0.04, 0.6), +0.08 on
// the chest or thigh (and a cushioning head). The ball leaves
// along its incoming direction at |vIn| x absorb plus a push of 1 to 3 m/s along intent.dir, turned by a direction error
// of sigma (1 - ctrl/110) x 0.35 x |vIn|/15 rad. heavy: what the control failed to kill would roll more than 1.5 m.
// Returns {v, quality, heavy, bounce} plus part, absorb, angErr and rest (metres the uncontrolled part rolls).
export function firstTouch(agent, ball, intent, ctx, r){
  intent = intent || {}; ctx = ctx || {};
  const T = TOUCH, B = ball.v ? ball : {v: {x: 0, y: 0, z: 0}, p: ball};
  const vIn = ctx.vIn == null ? B.v : ctx.vIn;
  let vix, viy, viz;
  if (typeof vIn === 'number'){ const hv = hypot(B.v.x, B.v.z) || 1; vix = vIn*B.v.x/hv; viy = 0; viz = vIn*B.v.z/hv; }
  else { vix = +vIn.x || 0; viy = +vIn.y || 0; viz = +vIn.z || 0; }
  const sp = hypot(vix, viy, viz), hs = hypot(vix, viz);
  const ctrl = clamp(skillOf(agent, ctx, 'ctrl'), 0, 100);
  const press = clamp(+ctx.pressure01 || 0, 0, 1), bF = ctx.bF != null ? clamp(+ctx.bF, 0, 1) : 1;
  const env = ball.p ? reachEnvelope(agent, ball) : null;
  const part = env ? env.part : 'foot';
  let absorb = clamp(0.05 + 0.13*pow(1 - ctrl/100, 1.2) + 0.01*Math.max(0, sp - 10) + 0.12*press + 0.08*(1 - bF),
    T.ABSORB_MIN, T.ABSORB_MAX);
  if (part === 'chest' || part === 'thigh' || part === 'head') absorb = Math.min(T.ABSORB_MAX + T.BODY_ABSORB, absorb + T.BODY_ABSORB);
  // the cushion keeps a little of the ball's own line; with no line (a ball dropping straight down) his facing
  let cx, cz;
  if (hs > 0.05){ cx = vix/hs; cz = viz/hs; } else { const f = dirOf(yawOfAgent(agent)); cx = f.x; cz = f.z; }
  const keep = sp*absorb;
  let ox = cx*keep, oz = cz*keep;
  const dir = intent.dir;
  const dl = dir ? hypot(dir.x || 0, dir.z || 0) : 0;
  let push = 0;
  if (dl > 1e-6){
    push = T.PUSH[0] + (T.PUSH[1] - T.PUSH[0])*clamp(intent.push != null ? +intent.push : 0.5, 0, 1);
    ox += push*dir.x/dl; oz += push*dir.z/dl;
  }
  const sig = (1 - ctrl/110)*0.35*sp/15;
  const angErr = sig > 0 ? truncNormal(r, sig, 2.5) : 0;
  const c = cos(angErr), s = sin(angErr);
  const vx = ox*c - oz*s, vz = ox*s + oz*c;
  const airborne = ball.p ? ball.p.y > R + 0.05 : false;
  const vy = part === 'chest' ? 0.6 : part === 'thigh' ? 0.3 : 0;
  const rest = rollDistance(keep, 0, ctx.rollDecel != null ? +ctx.rollDecel : (ball.rollDecel || 1.1));
  const heavy = rest > T.HEAVY;
  const quality = clamp(1 - (absorb - T.ABSORB_MIN)/(T.ABSORB_MAX - T.ABSORB_MIN) - Math.abs(angErr)/0.6, 0, 1);
  return {v: {x: vx, y: vy, z: vz}, quality, heavy, bounce: airborne || vy > 0, part, absorb, angErr, rest, push};
}

/* ---------- dribbling ---------- */

// how many strides a dribbler at speed v takes between touches (1.5.3 cadence)
export function dribbleCadence(v){
  for (const [vmax, every] of TOUCH.CADENCE) if (v < vmax) return every;
  return 3;
}

// the gap a ball rolling from u0 opens on a runner at a steady v before he catches up with it (its farthest lead),
// under the ground roll of ball.js: the ball's lead grows while it is faster than him
function maxGap(u0, v, rd){
  if (u0 <= v) return 0;
  const k = KD, c = Math.sqrt(rd*k), A = Math.sqrt(k/rd);
  const tStar = (atan(u0*A) - atan(v*A))/c;          // when the ball has slowed to his speed
  const xb = rollDistance(u0, v, rd);
  return xb - v*tStar;
}

// A dribble touch on a touch-foot footfall (1.5.3, 3.1.4): the ball is kicked along dir so that its lead over the
// dribbler, running on at `speed`, peaks at 0.6 + 0.22 v metres (x0.5 walking), with the angle error sigma
// (1 - drib/110)(0.06 + 0.10 v/8)(1 + 0.5(1 - bF)) and the length error sigma 15%(1 - drib/100)(1 + 0.5(1 - bF)).
// ctx = {drib, bF, walk, rollDecel}. Returns {v, lead} plus foot (the strong foot unless the ball is more than
// 0.25 m to the weak side), angErr and the touch's own reach test (ok: the ball within 0.9 m and 50 degrees ahead).
export function dribbleTouch(agent, ball, dir, speed, ctx, r){
  ctx = ctx || {};
  const T = TOUCH, m = posOf(agent), P = ball.p || ball;
  const v = Math.max(0, +speed || 0), drib = clamp(skillOf(agent, ctx, 'drib', 'dribbling'), 0, 100);
  const bF = ctx.bF != null ? clamp(+ctx.bF, 0, 1) : 1, tired = 1 + 0.5*(1 - bF);
  const rd = ctx.rollDecel != null ? +ctx.rollDecel : (ball.rollDecel || 1.1);
  let dx = dir ? +dir.x || 0 : 0, dz = dir ? +dir.z || 0 : 0;
  const dl = hypot(dx, dz);
  if (dl < 1e-6){ const f = dirOf(yawOfAgent(agent)); dx = f.x; dz = f.z; } else { dx /= dl; dz /= dl; }
  const lead0 = (0.6 + 0.22*v)*(ctx.walk ? 0.5 : 1);
  const angErr = truncNormal(r, (1 - drib/110)*(0.06 + 0.10*v/8)*tired, 2.5);
  const lead = Math.max(0.1, lead0*(1 + truncNormal(r, 0.15*(1 - drib/100)*tired, 2.5)));
  // the kick speed whose lead peaks at `lead` (bisection on the monotonic gap)
  let lo = v, hi = v + 2 + Math.sqrt(2*(rd + KD*(v + 6)*(v + 6))*lead)*2;
  while (maxGap(hi, v, rd) < lead && hi < 40) hi *= 1.5;
  for (let i = 0; i < 40; i++){ const mid = (lo + hi)/2; if (maxGap(mid, v, rd) < lead) lo = mid; else hi = mid; }
  const u0 = Math.min(BALL.VMAX, (lo + hi)/2);
  const c = cos(angErr), s = sin(angErr), kx = dx*c - dz*s, kz = dx*s + dz*c;
  // which foot: strong unless the ball sits more than 0.25 m to the weak side
  const f = dirOf(yawOfAgent(agent)), bx = P.x - m.x, bz = P.z - m.z, lat = bx*(-f.z) + bz*f.x;
  const pf = footOf(agent);
  let foot = pf === 'B' ? (lat >= 0 ? 'R' : 'L') : pf;
  if (pf === 'R' && lat < -T.WEAK_SIDE) foot = 'L';
  if (pf === 'L' && lat > T.WEAK_SIDE) foot = 'R';
  const dist = hypot(bx, bz), ahead = dist > 1e-6 ? acos(clamp((bx*f.x + bz*f.z)/dist, -1, 1)) : 0;
  const ok = dist <= T.DRIB_REACH && ahead <= T.DRIB_CONE && P.y < T.FOOT_Y;
  return {v: {x: u0*kx, y: 0, z: u0*kz}, lead, foot, angErr, ok, speed: u0};
}

/* ---------- tackles ---------- */

// the slide's numbers for a tackling skill: the body travels `travel` metres decelerating at 6 m/s squared from v0, so
// it stops at tStop; it is committed for 1.1 s and on the ground for 0.8 s after it stops
export function slideProfile(tackling = 50){
  const SL = TACKLE.slide, travel = SL.travel + SL.travelK*clamp(+tackling || 0, 0, 99);
  const v0 = Math.sqrt(2*SL.decel*travel), tStop = v0/SL.decel;
  return {travel, v0, tStop, commit: SL.commit, ground: SL.ground, decel: SL.decel};
}
// how far the sliding body has gone after t seconds
export function slideDistance(prof, t){
  const tt = clamp(t, 0, prof.tStop);
  return prof.v0*tt - 0.5*prof.decel*tt*tt;
}

// the tackle's direction (target.dx/dz when given, fixed at the start; else toward target from the body; else his
// facing) and how far out the foot aims: the target's distance clamped to the reach, or the full reach for a direction
function tackleDir(tackler, target, out){
  const m = posOf(tackler);
  let dx = 0, dz = 0, aim = Infinity;
  if (target && (target.dx != null || target.dz != null)){ dx = +target.dx || 0; dz = +target.dz || 0; }
  else if (target){ dx = target.x - m.x; dz = target.z - m.z; aim = hypot(dx, dz); }
  let l = hypot(dx, dz);
  if (l < 1e-6){ const f = dirOf(yawOfAgent(tackler)); dx = f.x; dz = f.z; l = 1; aim = Infinity; }
  out.x = dx/l; out.z = dz/l; out.aim = aim;
  return out;
}

const TD = {x: 0, z: 0, aim: Infinity};
// the foot at time t of a tackle from a body at (px, pz) along (dx, dz); side +1 sweeps from the right, -1 from the
// left. A standing tackle extends toward the aim point and sweeps across the cone so that it passes through the aim
// point halfway through the active window; a poke jabs straight at it.
function footAt(kind, px, pz, dx, dz, side, t, tackling, aim, out){
  const rx = -dz, rz = dx, FR = TACKLE.FOOT_R;
  out.r = FR; out.y = FR;
  if (kind === 'slide'){
    const SL = TACKLE.slide, prof = slideProfile(tackling), u = clamp(t/prof.tStop, 0, 1);
    const lat = side*(SL.sweep/2)*(1 - 2*u);
    out.x = px + dx*SL.lead + rx*lat; out.z = pz + dz*SL.lead + rz*lat;
    out.active = t >= 0 && t <= prof.tStop; out.phase = t <= prof.tStop ? 'active' : t <= prof.tStop + SL.ground ? 'ground' : 'done';
    out.reach = SL.lead;
    return out;
  }
  const K = kind === 'poke' ? TACKLE.poke : TACKLE.stand, reach = K.reach + K.reachK*clamp(+tackling || 0, 0, 99);
  const far = clamp(aim, K.rest, reach);
  let ext, ang;
  if (t < K.wind){ ext = K.rest; ang = side*K.cone/2; out.active = false; out.phase = 'wind'; }
  else if (t <= K.wind + K.active){
    const u = (t - K.wind)/K.active;
    // out to the aim distance by mid-sweep, then on toward full reach (the follow-through)
    ext = u <= 0.5 ? K.rest + (far - K.rest)*sin(u/0.5*Math.PI/2) : far + (reach - far)*(u - 0.5)/0.5;
    ang = side*(K.cone/2)*(1 - 2*u);
    out.active = true; out.phase = 'active';
  } else {
    const u = clamp((t - K.wind - K.active)/0.25, 0, 1);
    ext = reach + (K.rest - reach)*u; ang = -side*K.cone/2; out.active = false; out.phase = u < 1 ? 'recover' : 'done';
  }
  const c = cos(ang), s = sin(ang);
  out.x = px + ext*(c*dx + s*rx); out.z = pz + ext*(c*dz + s*rz);
  out.reach = reach;
  return out;
}

// The tackling foot at time t (seconds since the tackle began) for kind 'stand' | 'poke' | 'slide' (1.5.3, 3.1.4): a
// sphere of radius 0.12 at ground level. target: {x, z} (the ball or the carrier at the start; the foot passes through
// it halfway through the active window when it is within reach) or {dx, dz} (a fixed direction, full reach). For a
// slide the body itself moves (slideProfile, slideDistance); the foot leads it by 0.9 m and sweeps 1.3 m across.
// Returns {foot: {x, y, z, r}} plus active, phase ('wind'|'active'|'recover'|'ground'|'done') and reach.
export function tackleSweep(tackler, kind, t, target){
  const m = posOf(tackler), d = tackleDir(tackler, target, TD), side = footOf(tackler) === 'L' ? -1 : 1;
  const tk = skillOf(tackler, null, 'tackling');
  const o = footAt(kind, m.x, m.z, d.x, d.z, side, t, tk, d.aim, {x: 0, y: 0, z: 0, r: 0, active: false, phase: '', reach: 0});
  return {foot: {x: o.x, y: o.y, z: o.z, r: o.r}, active: o.active, phase: o.phase, reach: o.reach};
}

const FT = {x: 0, y: 0, z: 0, r: 0, active: false, phase: '', reach: 0};
// What the tackle meets first (3.1.4): the foot of tackleSweep walked through its active window from sweep.t (time
// into the tackle now, default 0) at 240 Hz, the ball and the carrier carried on at their velocities, the tackler
// moving with his own (or along the slide). sweep = {kind, target, t}; ctx = {tackling, dribbling (the carrier's)}.
// Ball first gives 'won', or 'poke' when only its edge is met or a strong dribbler keeps a toe on it (chance
// clamp(0.1 + 0.005(dribbling - tackling), 0.03, 0.35)); the carrier's leg capsule first, or his legs within 0.08 s of
// a touch that only grazed the ball, gives 'foul' with severity clamp(0.25 + 0.06 closing + 0.3 fromBehind + 0.25
// slide, 0, 1) (3.2.9; closing is the tackler's speed toward the carrier at the contact); nothing gives 'miss'. impulse:
// the ball's new velocity for 'won' and 'poke', the carrier's knock for 'foul', null for 'miss'. Also returns tBall and
// tLeg (seconds into the tackle, -1 for none), fromBehind and closing.
export function tackleOutcome(tackler, carrier, ball, sweep, ctx, r){
  ctx = ctx || {}; sweep = sweep || {};
  const kind = sweep.kind || 'stand', t0 = Math.max(0, +sweep.t || 0);
  const tm = posOf(tackler), cm = posOf(carrier), P = ball.p || ball, BV = ball.v || {x: 0, y: 0, z: 0};
  const tk = clamp(skillOf(tackler, ctx, 'tackling'), 0, 99);
  const drib = clamp(ctx.dribbling != null ? +ctx.dribbling : skillOf(carrier, null, 'dribbling'), 0, 99);
  const d = tackleDir(tackler, sweep.target || {x: P.x, z: P.z}, {x: 0, z: 0, aim: Infinity}), side = footOf(tackler) === 'L' ? -1 : 1;
  const tv = velOf(tackler), cv = velOf(carrier);
  const prof = kind === 'slide' ? slideProfile(tk) : null;
  const K = kind === 'poke' ? TACKLE.poke : TACKLE.stand;
  const tEnd = kind === 'slide' ? prof.tStop : K.wind + K.active;
  const sc = carrier.scale || 1, legTop = TACKLE.LEG_TOP*sc + (+carrier.y || 0);
  const rb = TACKLE.FOOT_R + R, rl = TACKLE.FOOT_R + TACKLE.LEG_R*sc;
  const dt = 1/240;
  let tBall = -1, tLeg = -1, minBall = Infinity, fvx = 0, fvz = 0, closing = 0;
  let px0 = 0, pz0 = 0, have = false;
  for (let t = t0; t <= tEnd + 1e-9; t += dt){
    const tau = t - t0;
    let bx = tm.x, bz = tm.z;
    if (prof){ const s = slideDistance(prof, t) - slideDistance(prof, t0); bx += d.x*s; bz += d.z*s; }
    else { bx += tv.x*tau; bz += tv.z*tau; }
    footAt(kind, bx, bz, d.x, d.z, side, t, tk, d.aim, FT);
    const fx = FT.x, fz = FT.z, fy = FT.y;
    const vfx = have ? (fx - px0)/dt : 0, vfz = have ? (fz - pz0)/dt : 0;
    px0 = fx; pz0 = fz; have = true;
    if (!FT.active) continue;
    // the ball carried on (in the air it falls)
    const qx = P.x + BV.x*tau, qz = P.z + BV.z*tau, qy = Math.max(R, P.y + (+BV.y || 0)*tau - (P.y > R + 0.01 ? 0.5*G*tau*tau : 0));
    const db = hypot(qx - fx, qy - fy, qz - fz);
    if (db < minBall) minBall = db;
    if (tBall < 0 && db <= rb){ tBall = t; fvx = vfx; fvz = vfz; }
    // the carrier's legs; the tackler's body closing on him (for the severity)
    const cx = cm.x + cv.x*tau, cz = cm.z + cv.z*tau, dl = hypot(cx - fx, cz - fz);
    if (tLeg < 0 && fy <= legTop && dl <= rl){
      tLeg = t;
      const relx = (prof ? d.x*(prof.v0 - prof.decel*Math.min(t, prof.tStop)) : tv.x) - cv.x;
      const relz = (prof ? d.z*(prof.v0 - prof.decel*Math.min(t, prof.tStop)) : tv.z) - cv.z;
      const ux = (cx - fx)/(dl || 1), uz = (cz - fz)/(dl || 1);
      closing = Math.max(0, relx*ux + relz*uz);
    }
    if (tLeg >= 0 && (tBall < 0 || tLeg >= tBall)) break;            // the order is settled
    if (tBall >= 0 && t - tBall > TACKLE.NEAR_T) break;
  }
  // from behind: the tackler comes from the back half of the carrier's facing
  const cf = dirOf(yawOfAgent(carrier)), ax = tm.x - cm.x, az = tm.z - cm.z, al = hypot(ax, az) || 1;
  const fromBehind = sstep(-0.2, -0.7, (ax*cf.x + az*cf.z)/al);
  const out = {result: 'miss', severity: 0, impulse: null, tBall, tLeg, fromBehind, closing};
  const glancing = minBall > 0.17;
  const ballFirst = tBall >= 0 && (tLeg < 0 || tBall <= tLeg) && !(glancing && tLeg >= 0 && tLeg - tBall <= TACKLE.NEAR_T);
  if (ballFirst){
    const keep = clamp(0.1 + 0.005*(drib - tk), 0.03, 0.35);
    const poke = glancing || r() < keep;
    // the ball goes where the foot was sweeping, with a seeded spread
    let ux = fvx, uz = fvz, ul = hypot(ux, uz);
    if (ul < 0.5){ ux = d.x; uz = d.z; ul = 1; }
    const a = truncNormal(r, 0.35, 2.5), c = cos(a), s = sin(a);
    const kx = (ux*c - uz*s)/ul, kz = (ux*s + uz*c)/ul;
    const sp = poke ? 1.5 + 1.5*r() : 3 + 3*r() + (kind === 'slide' ? 2 : 0);
    out.result = poke ? 'poke' : 'won';
    out.impulse = {x: kx*sp, y: 0, z: kz*sp};
    return out;
  }
  if (tLeg >= 0){
    out.result = 'foul';
    out.severity = clamp(0.25 + 0.06*closing + 0.3*fromBehind + 0.25*(kind === 'slide' ? 1 : 0), 0, 1);
    const kx = cm.x - tm.x, kz = cm.z - tm.z, kl = hypot(kx, kz) || 1, mag = 1 + 0.15*closing;
    out.impulse = {x: kx/kl*mag, y: 0, z: kz/kl*mag};
  }
  return out;
}

/* ---------- headers ---------- */

// A header (1.5.3, 3.1.4): contact when the ball is within the head sphere (0.17 + 0.0015 heading) plus its radius of
// headPos, else null. Speed 0.4|vIn| + 6 + 0.06 heading (+3 off a running jump, ctx.running); direction from the
// intent: 'attack' along the look with 5 degrees down, 'pass' to intent.target, 'clear' (default) along the look yaw
// 20 degrees up; aim error sigma (1 - heading/110) x 6 degrees in yaw and in pitch. intent = {kind, look: {yaw, pitch}
// | dir: {x, y, z}, target}; ctx = {heading, vIn, running}. Returns {v, quality} plus dist and err.
export function headerContact(agent, ball, headPos, intent, ctx, r){
  intent = intent || {}; ctx = ctx || {};
  const P = ball.p || ball, heading = clamp(skillOf(agent, ctx, 'heading'), 0, 110);
  const rh = TOUCH.HEADER_R + TOUCH.HEADER_RK*heading;
  const dist = hypot(P.x - headPos.x, P.y - headPos.y, P.z - headPos.z);
  if (dist > rh + R) return null;
  const vIn = ctx.vIn == null ? (ball.v || {x: 0, y: 0, z: 0}) : ctx.vIn;
  const sIn = typeof vIn === 'number' ? Math.abs(vIn) : hypot(vIn.x || 0, vIn.y || 0, vIn.z || 0);
  const speed = 0.4*sIn + 6 + 0.06*heading + (ctx.running ? 3 : 0);
  let yaw, pitch;
  if (intent.look){ yaw = +intent.look.yaw || 0; pitch = +intent.look.pitch || 0; }
  else if (intent.dir){ const dd = intent.dir, h = hypot(dd.x || 0, dd.z || 0); yaw = yawOf(dd.x || 0, h > 1e-9 ? dd.z : -1); pitch = atan2(dd.y || 0, h); }
  else { yaw = yawOfAgent(agent); pitch = 0; }
  const kind = intent.kind || 'clear';
  if (kind === 'attack') pitch -= 5*DEG;
  else if (kind === 'pass' && intent.target){
    const tx = intent.target.x - P.x, tz = intent.target.z - P.z, D = hypot(tx, tz);
    yaw = yawOf(tx, D > 1e-9 ? tz : -1);
    // the low arc that lands there at this speed (drag-free; a header pass is short)
    const q = clamp(G*D/(speed*speed), 0, 1);
    pitch = 0.5*asin(q);
  } else if (kind === 'clear') pitch = Math.max(0, pitch) + 20*DEG;
  const sig = (1 - heading/110)*6*DEG;
  const ey = sig > 0 ? truncNormal(r, sig, 2.5) : 0, ep = sig > 0 ? truncNormal(r, sig, 2.5) : 0;
  yaw += ey; pitch += ep;
  const d = dirOf(yaw), c = cos(pitch);
  const err = hypot(ey, ep);
  const quality = clamp(0.5*(1 - dist/(rh + R)) + 0.5*(1 - err/(2.5*Math.max(sig, 1e-6))), 0, 1);
  return {v: {x: speed*c*d.x, y: speed*sin(pitch), z: speed*c*d.z}, quality, dist, err, speed};
}

/* ---------- unplanned contact ---------- */

// How a ball meeting a body is read (3.1.4): 'control' for the intended receiver or an agent with a receive or
// interception plan while the ball is slower than his control threshold (receive: 18 + 0.12 ctrl; interception by
// positioning: 8 + 0.12 interception, 1.5.3), 'block' for an agent in a block, tackle or jockey stance, 'deflect'
// otherwise. wanted: 'receive' | 'intercept' | 'block' | null, or {receiver, plan, stance}; the agent's own state
// ('tackle', 'slide', 'jockey') also counts as a blocking stance.
export function classifyContact(agent, ball, wanted){
  const V = ball.v || ball, sp = hypot(V.x || 0, V.y || 0, V.z || 0);
  const w = wanted && typeof wanted === 'object' ? wanted : {plan: wanted || null};
  const plan = w.receiver ? 'receive' : w.plan;
  const C = TOUCH.CONTROL;
  if (plan === 'receive'){
    const ctrl = skillOf(agent, null, 'ctrl');
    if (sp < C.receive[0] + C.receive[1]*ctrl) return 'control';
  } else if (plan === 'intercept'){
    const ic = skillOf(agent, null, 'interception');
    if (sp < C.intercept[0] + C.intercept[1]*ic) return 'control';
  }
  const st = w.stance || agent.state;
  if (st === 'block' || st === 'tackle' || st === 'slide' || st === 'jockey' || plan === 'block') return 'block';
  return 'deflect';
}
