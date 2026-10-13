// js/life/football/touch.js: the body meeting the ball. Which part of a player can reach it, the first touch (how much
// of the incoming pace the control kills and where the rest goes), the dribble touch on a footfall, the tackle's foot
// sweep and what it meets first, the header, and how an unplanned contact is read (control, deflection or block).
// Owner: WP-C (ball, strike and touch models), then P2b-A (TRAINING-SPEC section 3: the control radius R of zone.js is
// the reach, the first touch is the spec's q and touch distance in the receiver's own frame, the tackle's reach, its
// win chance with timing and angle, the slide's carried momentum and friction). Contract DESIGN 1.4.12 and BUILD-PLAN
// Phase 2b; numbers 1.5.3 and tune.js; behaviour 3.1.4 (fouls 3.2.9).
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
import {sin, cos, atan2, atan, asin, acos, hypot} from "./detmath.js";
import {TUNE} from "./tune.js";
import {ratings, radius, part as partOf, geom, q as qOf, touchDist, breathOf} from "./zone.js";
import {pTackleWin, timingFactor, angleFactor, pTackleFoul, standReach, pokeReach, slideReach, slideDecel} from "./duel.js";

const DEG = Math.PI/180;
const {R, KD, G} = BALL;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

// 1.5.3 and 3.1.4 numbers in one place. (The reach of a touch is the control radius R of zone.js; FOOT_Y is the
// highest ball a dribble touch plays.)
export const TOUCH = Object.freeze({
  FOOT_Y: 0.6,
  HEAD: 0.55, HEAD_Y: [1.4, 2.1],                 // head: from the top of the body's control (1.4 m) to 2.1 m (plus the jump)
  BODY_POP: {chest: 0.6, thigh: 0.3},             // the ball drops off the chest and the thigh at this upward speed
  HEAVY: 1.5,                                     // metres: a dribble touch's heavy test (dribbleTouch)
  DRIB_REACH: 0.9, DRIB_CONE: 50*DEG, WEAK_SIDE: 0.25,
  SMALL: 0.55, HEAVY_K: 1.12, TOUCH_AT: 0.45, // the small touch's share of the lead; a touch this much longer than the norm (poor Ball
                                            // Control, at a run) pops off the grass (A1.1)
  CADENCE: [[3, 1], [6, 2], [Infinity, 3]],       // every stride under 3 m/s, every 2nd to 6, every 3rd above
  HEADER_R: 0.17, HEADER_RK: 0.0015,
  LEN_ERR: 0.15                                   // a first touch's length error: 15% x (1 - q) (sigma)
});

// the tackles of 1.5.3 and spec 3: standing (wind-up 0.12 s, active 0.25 s, the reach of duel.standReach to the ball's
// centre in a 50 degree cone), a toe poke (a shorter, straight jab reaching POKE_DR further) and the slide (from the
// approach speed, slowed by grass friction mu g, the foot leading the body by 0.9 m and sweeping 1.3 m across while it
// is within duel.slideReach of where it began; then the body slides on to a stop and gets up after duel.recovery)
export const TACKLE = Object.freeze({
  FOOT_R: 0.12, LEG_R: 0.16, LEG_TOP: 0.85, NEAR_T: 0.08,
  stand: {wind: 0.12, active: 0.25, cone: 50*DEG, rest: 0.35},
  poke: {wind: 0.08, active: 0.18, cone: 0, rest: 0.3},
  slide: {sweep: 1.3, lead: 0.9, ground: 0.8},
  IMP: {k: 0.6, add: 1.5, min: 2.0, max: 5.9, spread: 0.2, poke: [1.5, 3]}   // a won tackle's ball: 0.6 x the foot's speed
                                                                             // + 1.5 m/s (2 to 5.9), a 0.2 rad spread
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
// the agent's attribute record with any ctx skill over it (tests pass flat agents with ctx skills)
function atOf(a, ctx){
  if (!ctx || ctx.ctrl == null) return a && a.at || {};
  return Object.assign({}, a && a.at || {}, {ctrl: +ctx.ctrl});
}

/* ---------- reach ---------- */

// Which part of the agent can play the ball now (spec 3), or null: a ball outside his control radius R stays loose.
// R = 0.9 (0.6 + 0.8 c) fSpeed fHeight fAngle fFatigue (zone.js), so the facing matters (a ball behind him is played
// only much closer) and so does the ball's speed against his. The part comes from the ball's real height: under 0.4 m
// the foot, then the thigh, the chest to 1.4 m; above that only the head (a header's own envelope, 0.55 m, up to
// 2.1 m plus the jump). Heights scale with the agent's height and are measured from his root (y, raised by a jump).
// side is the side of his body the ball is on; dist the horizontal distance from his centre; R the radius used.
// opt (optional): {breath} (else the agent's own), {angle: false} leaves the facing out, {speed: false} the ball's speed
// (a leg stretched to block a ball too fast to control).
const GE = {dist: 0, y: 0, cosA: 1, side: 'R', vrel: 0}, RTT = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
export function reachEnvelope(agent, ball, opt){
  const g = geom(agent, ball, GE), sc = agent.scale || 1;
  const pt = partOf(g.y, sc);
  if (pt === 'head'){
    if (g.dist <= TOUCH.HEAD && g.y >= TOUCH.HEAD_Y[0]*sc && g.y <= TOUCH.HEAD_Y[1]*sc) return {part: 'head', side: g.side, dist: g.dist, R: TOUCH.HEAD};
    return null;
  }
  const rt = ratings(agent.at, RTT);
  const breath = opt && opt.breath != null ? opt.breath : breathOf(agent);
  const r = radius(rt.c, opt && opt.speed === false ? 0 : g.vrel, rt.vc, g.y, sc, opt && opt.angle === false ? 1 : g.cosA, breath);
  if (g.dist <= r) return {part: pt, side: g.side, dist: g.dist, R: r};
  return null;
}

/* ---------- first touch ---------- */

// the gap a ball rolling from u0 opens on a runner at a steady v before he catches up with it (its farthest lead),
// under the ground roll of ball.js: the ball's lead grows while it is faster than him
function maxGap(u0, v, rd){
  if (u0 <= v) return 0;
  const k = KD, c = Math.sqrt(rd*k), A = Math.sqrt(k/rd);
  const tStar = (atan(u0*A) - atan(v*A))/c;          // when the ball has slowed to his speed
  const xb = rollDistance(u0, v, rd);
  return xb - v*tStar;
}
// the kick speed whose lead over a runner at v peaks at gap metres (bisection on the monotonic gap)
function speedForGap(gap, v, rd){
  if (!(gap > 0)) return v;
  let lo = v, hi = v + 2 + Math.sqrt(2*(rd + KD*(v + 6)*(v + 6))*gap)*2;
  while (maxGap(hi, v, rd) < gap && hi < 40) hi *= 1.5;
  for (let i = 0; i < 40; i++){ const mid = (lo + hi)/2; if (maxGap(mid, v, rd) < gap) lo = mid; else hi = mid; }
  return Math.min(BALL.VMAX, (lo + hi)/2);
}

// The first touch (spec 3), in the receiver's own frame. intent = {dir: {x, z} | null, push: 0..1}; ctx = {ctrl,
// pressure01, bF, rollDecel, q}. The quality q = clamp(1.2 c - 0.04 max(0, v - vc) - 0.2 pressure - 0.1 (1 - breath),
// 0, 1) (zone.q) with v the ball's speed relative to his body; the touch leaves the ball touchDist(q) = 0.6 + 0.8 (1 - q)
// metres ahead of him along the way he means to go (intent.dir: the keys or the AI's plan; else his facing), carried at
// his running speed along it (and with his sideways speed, so it stays in front of him): the kick is the one whose lead
// over him, running on, peaks at that distance (from where the ball is now). A poorer touch is longer (with a length
// error of 15% (1 - q)) and wider (the direction error sigma (1 - ctrl/110) 0.35 v/15 rad, truncated at 2.5 sigma).
// The part is the real ball height's (foot, thigh, chest; a ball off the chest or thigh drops from there). heavy: q
// under TUNE.HEAVY_Q. Returns {v, quality (q), heavy, bounce, part, q, dist (the touch distance), angErr, push, vRel}.
export function firstTouch(agent, ball, intent, ctx, r){
  intent = intent || {}; ctx = ctx || {};
  const T = TOUCH, B = ball.v ? ball : {v: {x: 0, y: 0, z: 0}, p: ball};
  const m = posOf(agent), pv = velOf(agent);
  const vIn = ctx.vIn == null ? B.v : ctx.vIn;
  let vix, viy, viz;
  if (typeof vIn === 'number'){ const hv = hypot(B.v.x, B.v.z) || 1; vix = vIn*B.v.x/hv; viy = 0; viz = vIn*B.v.z/hv; }
  else { vix = +vIn.x || 0; viy = +vIn.y || 0; viz = +vIn.z || 0; }
  const vRel = hypot(vix - pv.x, viy, viz - pv.z);
  const at = atOf(agent, ctx);
  const ctrl = clamp(at.ctrl != null ? +at.ctrl : 50, 0, 100);
  const press = clamp(+ctx.pressure01 || 0, 0, 1), bF = ctx.bF != null ? clamp(+ctx.bF, 0, 1) : 1;
  const qq = ctx.q != null ? clamp(+ctx.q, 0, 1) : qOf(at, vRel, press, bF);
  const P = ball.p || ball, sc = agent.scale || 1;
  const y = P.y - (+agent.y || 0);
  const pt = partOf(y, sc), part = pt === 'head' ? 'chest' : pt;
  // the way: the keys or the plan, else the facing
  let dx = intent.dir ? +intent.dir.x || 0 : 0, dz = intent.dir ? +intent.dir.z || 0 : 0;
  const dl = hypot(dx, dz);
  if (dl > 1e-6){ dx /= dl; dz /= dl; } else { const f = dirOf(yawOfAgent(agent)); dx = f.x; dz = f.z; }
  // his speed along the way and across it
  const along = Math.max(0, pv.x*dx + pv.z*dz), crossX = pv.x - (pv.x*dx + pv.z*dz)*dx, crossZ = pv.z - (pv.x*dx + pv.z*dz)*dz;
  const rd = ctx.rollDecel != null ? +ctx.rollDecel : (ball.rollDecel || 1.1);
  const lenErr = truncNormal(r, T.LEN_ERR*(1 - qq), 2.5);
  const L = touchDist(qq)*Math.max(0.5, 1 + lenErr);
  const ahead0 = (P.x - m.x)*dx + (P.z - m.z)*dz;
  // met further out than the touch distance: a man standing (or barely moving) cushions it back toward him to rest at
  // it; a man on the run cannot pull it in closer than where he met it, so it is carried on with him from there
  const u0 = L - ahead0 >= 0 ? speedForGap(L - ahead0, along, rd) : along < 0.5 ? -Math.sqrt(2*rd*(ahead0 - L)) : along;
  const sig = (1 - ctrl/110)*0.35*vRel/15;
  const angErr = sig > 0 ? truncNormal(r, sig, 2.5) : 0;
  const c = cos(angErr), s = sin(angErr);
  const kx = dx*c - dz*s, kz = dx*s + dz*c;
  const vy = T.BODY_POP[part] || 0;
  const airborne = P.y > R + 0.05;
  const heavy = qq < TUNE.HEAVY_Q.value;
  const pushK = clamp(intent.push != null ? +intent.push : 0.5, 0, 1);
  return {v: {x: kx*u0 + crossX, y: vy, z: kz*u0 + crossZ}, quality: qq, q: qq, heavy, bounce: airborne || vy > 0, part, dist: L, angErr,
    push: dl > 1e-6 ? pushK : 0, vRel, dir: {x: dx, z: dz}, ahead0};
}

/* ---------- dribbling ---------- */

// how many strides a dribbler at speed v takes between touches (1.5.3 cadence)
export function dribbleCadence(v){
  for (const [vmax, every] of TOUCH.CADENCE) if (v < vmax) return every;
  return 3;
}

// A dribble touch on a touch-foot footfall (1.5.3, 3.1.4): the ball is kicked along dir so that its lead over the
// dribbler, running on at `speed`, peaks at 0.6 + 0.22 v metres (x0.5 walking), with the angle error sigma
// (1 - drib/110)(0.06 + 0.10 v/8)(1 + 0.5(1 - bF)) and the length error sigma 15%(1 - drib/100)(1 + 0.5(1 - bF)).
// ctx = {drib, bF, walk, rollDecel, ctrl, small}. Returns {v, lead} plus foot (the strong foot unless the ball is more
// than 0.25 m to the weak side), angErr and the touch's own reach test (ok: the ball within 0.9 m and 50 degrees ahead).
// Ball Control (addendum A1.1, WP-F): the lead is scaled by ctrlLead(ctrl), 1 at 65, so a dribble at 2 m/s pushes the
// ball about 0.6 m ahead at ctrl 90 and 1.4 m at 40 (sprinting lengthens it, as the 0.22 v term does); a small touch
// (ctx.small, the player's held modifier) plays it at 0.55 of that; a heavy touch (Ball Control under about 57, at a run) pops a little
// off the grass, so the ball is seen to get away.
export function dribbleTouch(agent, ball, dir, speed, ctx, r){
  ctx = ctx || {};
  const T = TOUCH, m = posOf(agent), P = ball.p || ball;
  const v = Math.max(0, +speed || 0), drib = clamp(skillOf(agent, ctx, 'drib', 'dribbling'), 0, 100);
  const bF = ctx.bF != null ? clamp(+ctx.bF, 0, 1) : 1, tired = 1 + 0.5*(1 - bF);
  const rd = ctx.rollDecel != null ? +ctx.rollDecel : (ball.rollDecel || 1.1);
  let dx = dir ? +dir.x || 0 : 0, dz = dir ? +dir.z || 0 : 0;
  const dl = hypot(dx, dz);
  if (dl < 1e-6){ const f = dirOf(yawOfAgent(agent)); dx = f.x; dz = f.z; } else { dx /= dl; dz /= dl; }
  const ctrl = ctx.ctrl != null ? +ctx.ctrl : agent && agent.at && agent.at.ctrl != null ? +agent.at.ctrl : 65;
  const lead0 = (0.6 + 0.22*v)*(ctx.walk ? 0.5 : 1)*ctrlLead(ctrl)*(ctx.small ? T.SMALL : 1);
  const angErr = truncNormal(r, (1 - drib/110)*(0.06 + 0.10*v/8)*tired, 2.5);
  const lead = Math.max(0.1, lead0*(1 + truncNormal(r, 0.15*(1 - drib/100)*tired, 2.5)));
  // the kick speed whose lead peaks at `lead` (bisection on the monotonic gap); a ball touched from further ahead than
  // the usual touch spot (TOUCH_AT: an early touch on a ball he is closing on, WP-F) needs that much less gap, so the
  // ball never runs further ahead than the lead from the spot
  const f0 = dirOf(yawOfAgent(agent)), ahead0 = (P.x - m.x)*f0.x + (P.z - m.z)*f0.z;
  const gap = Math.max(0.1, lead - Math.max(0, ahead0 - T.TOUCH_AT));
  let lo = v, hi = v + 2 + Math.sqrt(2*(rd + KD*(v + 6)*(v + 6))*gap)*2;
  while (maxGap(hi, v, rd) < gap && hi < 40) hi *= 1.5;
  for (let i = 0; i < 40; i++){ const mid = (lo + hi)/2; if (maxGap(mid, v, rd) < gap) lo = mid; else hi = mid; }
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
  const kc = ctrlLead(ctrl), pop = kc > T.HEAVY_K && v > 2.5 && !ctx.small ? Math.min(1.4, 0.3 + 2*(kc - T.HEAVY_K)) : 0;
  return {v: {x: u0*kx, y: pop, z: u0*kz}, lead, foot, angErr, ok, speed: u0, heavy: pop > 0};
}
// the share of the dribble's lead Ball Control gives (A1.1): 0.6 at 90, 1 at 65, 1.4 at 40, held within 0.5 and 1.6
export const ctrlLead = ctrl => clamp(1 - 0.016*((ctrl == null || !Number.isFinite(+ctrl) ? 65 : +ctrl) - 65), 0.5, 1.6);

/* ---------- tackles ---------- */

// The slide (spec 3): it starts at the approach speed v0 (its momentum carried, never less than a lunge's 2 m/s) and
// the grass slows it at mu g, so the body travels v0^2/(2 mu g) m and stops at tStop; the foot leads it by 0.9 m and can
// win the ball while it is within reach = 1.6 + 0.9 v0/vTop m of where the slide began (tActive). Then he gets up
// (ground: duel.recovery from his agility, longer after a miss, set by the caller; 0.8 s by default).
// slideProfile(v0, vTop): v0 the speed he goes into it at, vTop his top speed (both default to a 7.5 m/s sprint).
export function slideProfile(v0In = 7.5, vTop = 7.5){
  const top = Math.max(0.1, +vTop || 7.5), v0 = Math.max(2, +v0In || 0);
  const decel = slideDecel(), tStop = v0/decel, travel = v0*v0/(2*decel);
  const reach = slideReach(v0, top), lead = TACKLE.slide.lead;
  // the time the leading foot passes the reach: body travel = reach - lead
  const sAct = Math.max(0, reach - lead);
  const tActive = sAct >= travel ? tStop : (v0 - Math.sqrt(Math.max(0, v0*v0 - 2*decel*sAct)))/decel;
  return {travel, v0, tStop, tActive: Math.max(0.05, tActive), reach, decel, ground: TACKLE.slide.ground, commit: tStop};
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

// the reach of the foot's centre for a standing tackle or a poke: the spec's reach is to the ball's centre, so the foot
// (radius 0.12) meets a ball (radius 0.11) at the reach when its centre is that much short of it
const footReach = (kind, tackling) => (kind === 'poke' ? pokeReach(tackling) : standReach(tackling)) - (TACKLE.FOOT_R + R);

const TD = {x: 0, z: 0, aim: Infinity};
// the foot at time t of a tackle from a body at (px, pz) along (dx, dz); side +1 sweeps from the right, -1 from the
// left. A standing tackle extends toward the aim point and sweeps across the cone so that it passes through the aim
// point halfway through the active window; a poke jabs straight at it. A slide's foot leads the body (prof).
function footAt(kind, px, pz, dx, dz, side, t, tackling, aim, out, prof){
  const rx = -dz, rz = dx, FR = TACKLE.FOOT_R;
  out.r = FR; out.y = FR;
  if (kind === 'slide'){
    const SL = TACKLE.slide, p = prof || slideProfile(), u = clamp(t/p.tActive, 0, 1);
    const lat = side*(SL.sweep/2)*(1 - 2*u);
    out.x = px + dx*SL.lead + rx*lat; out.z = pz + dz*SL.lead + rz*lat;
    out.active = t >= 0 && t <= p.tActive; out.phase = t <= p.tStop ? (t <= p.tActive ? 'active' : 'slide') : t <= p.tStop + SL.ground ? 'ground' : 'done';
    out.reach = p.reach;
    return out;
  }
  const K = kind === 'poke' ? TACKLE.poke : TACKLE.stand, reach = footReach(kind, tackling);
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
  out.reach = reach + TACKLE.FOOT_R + R;
  return out;
}

// The tackling foot at time t (seconds since the tackle began) for kind 'stand' | 'poke' | 'slide' (1.5.3, spec 3): a
// sphere of radius 0.12 at ground level. target: {x, z} (the ball or the carrier at the start; the foot passes through
// it halfway through the active window when it is within reach) or {dx, dz} (a fixed direction, full reach). For a
// slide the body itself moves (slideProfile, slideDistance; prof, or a slide at top speed); the foot leads it by 0.9 m
// and sweeps 1.3 m across. Returns {foot: {x, y, z, r}} plus active, phase and reach (to the ball's centre).
export function tackleSweep(tackler, kind, t, target, prof){
  const m = posOf(tackler), d = tackleDir(tackler, target, TD), side = footOf(tackler) === 'L' ? -1 : 1;
  const tk = skillOf(tackler, null, 'tackling');
  const o = footAt(kind, m.x, m.z, d.x, d.z, side, t, tk, d.aim, {x: 0, y: 0, z: 0, r: 0, active: false, phase: '', reach: 0}, prof);
  return {foot: {x: o.x, y: o.y, z: o.z, r: o.r}, active: o.active, phase: o.phase, reach: o.reach};
}

const FT = {x: 0, y: 0, z: 0, r: 0, active: false, phase: '', reach: 0};
const RTA = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}, RTC = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
// What the tackle meets first and whether it wins (1.5.3, 3.1.4, spec 3): the foot of tackleSweep walked through its
// active window from sweep.t (time into the tackle now, default 0) at 240 Hz, the ball and the carrier carried on at
// their velocities, the tackler moving with his own (or along the slide, sweep.prof). sweep = {kind, target, t, prof};
// ctx = {tackling (the tackler's), shield (the carrier shields: his S replaces C)}.
// - The carrier's leg capsule first, or his legs within 0.08 s of a touch that only grazed the ball: 'foul' (severity
//   clamp(0.25 + 0.06 closing + 0.3 fromBehind + 0.25 slide, 0, 1), 3.2.9). The leg-first geometry is kept as it was.
// - The ball first: a late or from-behind tackle may go through the man (p = TF_BEHIND fromBehind + TF_LATE lateness:
//   'foul'); otherwise it wins with p = clamp(logistic((T - C)/8) x timing x angle, 0.05, 0.92) (duel.pTackleWin): 'won'
//   ('poke' when only the edge of the ball was met), else the carrier rides it ('miss', ridden). timing is the foot's
//   contact against the ball's closest approach to the point the sweep is aimed through (dt, + late, - early; 1 within
//   0.08 s, 0.3 from 0.3 s; only late raises the foul chance); angle is from the
//   carrier's facing (front 1.0, side 0.9, behind 0.5).
// - Nothing met: 'miss'.
// A loose ball (carrier null) has no legs and no rating against it: a ball-first tackle takes it.
// impulse: the ball's new velocity for 'won' and 'poke' (along the foot's own way at contact, from its speed: 0.6 x foot
// speed + 1.5 m/s, 2 to 5.9, a 0.2 rad spread), the carrier's knock for 'foul', null otherwise. Also returns tBall and
// tLeg (seconds into the tackle, -1 for none), fromBehind, closing, dt (the timing error), p (the win chance), timing
// and angle.
export function tackleOutcome(tackler, carrier, ball, sweep, ctx, r){
  ctx = ctx || {}; sweep = sweep || {};
  const kind = sweep.kind || 'stand', t0 = Math.max(0, +sweep.t || 0);
  const tm = posOf(tackler), cm = carrier ? posOf(carrier) : null, P = ball.p || ball, BV = ball.v || {x: 0, y: 0, z: 0};
  const tk = clamp(skillOf(tackler, ctx, 'tackling'), 0, 99);
  const tv = velOf(tackler), cv = carrier ? velOf(carrier) : {x: 0, z: 0};
  // a standing tackle or a poke aims from where his body will be as the foot comes through (he is still moving), so
  // the foot passes through the aimed point at mid-sweep
  const tg = sweep.target || {x: P.x, z: P.z}, Kd = kind === 'poke' ? TACKLE.poke : TACKLE.stand, tMid = Kd.wind + Kd.active/2;
  const from = kind !== 'slide' && tg.x != null ? {x: tm.x + tv.x*tMid, z: tm.z + tv.z*tMid, yaw: yawOfAgent(tackler)} : tackler;
  const d = tackleDir(from, tg, {x: 0, z: 0, aim: Infinity}), side = footOf(tackler) === 'L' ? -1 : 1;
  const prof = kind === 'slide' ? (sweep.prof || slideProfile(hypot(tv.x, tv.z), sweep.vTop || 7.5)) : null;
  const K = kind === 'poke' ? TACKLE.poke : TACKLE.stand;
  const tEnd = kind === 'slide' ? prof.tActive : K.wind + K.active;
  const sc = carrier ? carrier.scale || 1 : 1, legTop = TACKLE.LEG_TOP*sc + (carrier ? +carrier.y || 0 : 0);
  const rb = TACKLE.FOOT_R + R, rl = TACKLE.FOOT_R + TACKLE.LEG_R*sc;
  const dt = 1/240;
  let tBall = -1, tLeg = -1, minBall = Infinity, fvx = 0, fvz = 0, closing = 0, contact = null;
  let px0 = 0, pz0 = 0, have = false;
  // the point the foot is aimed through: where it is at the middle of its active window (the sweep's aim)
  // (a standing tackle or a poke aimed at a point: that point; a slide, or one aimed along a way: the foot at mid-sweep)
  const tAim = kind === 'slide' ? prof.tActive*0.5 : K.wind + K.active/2;
  let ax = NaN, az = NaN;
  if (kind !== 'slide' && tg.x != null){ ax = tg.x; az = tg.z; }
  for (let t = t0; t <= tEnd + 1e-9; t += dt){
    const tau = t - t0;
    let bx = tm.x, bz = tm.z;
    if (prof){ const s = slideDistance(prof, t) - slideDistance(prof, t0); bx += d.x*s; bz += d.z*s; }
    else { bx += tv.x*tau; bz += tv.z*tau; }
    footAt(kind, bx, bz, d.x, d.z, side, t, tk, d.aim, FT, prof);
    const fx = FT.x, fz = FT.z, fy = FT.y;
    if (ax !== ax && t >= tAim - 1e-9){ ax = fx; az = fz; }
    const vfx = have ? (fx - px0)/dt : 0, vfz = have ? (fz - pz0)/dt : 0;
    px0 = fx; pz0 = fz; have = true;
    if (!FT.active) continue;
    // the ball carried on (in the air it falls)
    const qx = P.x + BV.x*tau, qz = P.z + BV.z*tau, qy = Math.max(R, P.y + (+BV.y || 0)*tau - (P.y > R + 0.01 ? 0.5*G*tau*tau : 0));
    const db = hypot(qx - fx, qy - fy, qz - fz);
    if (db < minBall) minBall = db;
    if (tBall < 0 && db <= rb){ tBall = t; if (!contact) contact = {x: fx, y: fy, z: fz}; fvx = vfx; fvz = vfz; if (prof){ const vb = Math.max(0, prof.v0 - prof.decel*t); fvx += d.x*vb; fvz += d.z*vb; } else { fvx += tv.x; fvz += tv.z; } }
    // the carrier's legs; the tackler's body closing on him (for the severity)
    if (cm){
      const cx = cm.x + cv.x*tau, cz = cm.z + cv.z*tau, dl = hypot(cx - fx, cz - fz);
      if (tLeg < 0 && fy <= legTop && dl <= rl){
        tLeg = t;
        if (!contact) contact = {x: fx, y: fy, z: fz};
        const relx = (prof ? d.x*(prof.v0 - prof.decel*Math.min(t, prof.tStop)) : tv.x) - cv.x;
        const relz = (prof ? d.z*(prof.v0 - prof.decel*Math.min(t, prof.tStop)) : tv.z) - cv.z;
        const ux = (cx - fx)/(dl || 1), uz = (cz - fz)/(dl || 1);
        closing = Math.max(0, relx*ux + relz*uz);
      }
    }
    if (tLeg >= 0 && (tBall < 0 || tLeg >= tBall)) break;            // the order is settled
    if (tBall >= 0 && t - tBall > TACKLE.NEAR_T) break;
  }
  // from behind: the tackler comes from the back half of the carrier's facing; the angle from his facing
  let fromBehind = 0, rel = 0;
  if (cm){
    const cf = dirOf(yawOfAgent(carrier)), ax = tm.x - cm.x, az = tm.z - cm.z, al = hypot(ax, az) || 1;
    const cosr = clamp((ax*cf.x + az*cf.z)/al, -1, 1);
    fromBehind = sstep(-0.2, -0.7, cosr); rel = acos(cosr);
  }
  // the timing (spec 3: "the foot reaches the ball within +-0.08 s of its closest point"): when the foot comes through
  // the point the sweep is aimed at (its place at mid-sweep) against when the ball is closest to that point. A tackle
  // aimed where the ball will be as the foot comes through is on time, whatever the ball's speed (a carrier walking onto
  // the foot included); one aimed where the ball was is late (dt > 0: the ball had gone by), one aimed where it has yet
  // to get to is early (dt < 0). Only a tackle that meets the ball has a timing; a ball that is not moving is on time.
  let dtT = 0;
  if (tBall >= 0){
    let tA = tAim - t0;
    if (ax !== ax || t0 > tAim){ ax = contact.x; az = contact.z; tA = tBall - t0; }      // (begun past mid-sweep: the contact itself)
    const vb2 = BV.x*BV.x + BV.z*BV.z;
    if (vb2 > 0.09){
      const tStar = clamp(((ax - P.x)*BV.x + (az - P.z)*BV.z)/vb2, -2, 2);   // (from now; before now: it was already late)
      dtT = tA - tStar;
    }
  }
  const timing = timingFactor(dtT), angle = cm ? angleFactor(rel) : 1;
  let p = 1;
  if (carrier){
    const rt = ratings(tackler.at || {tackling: tk}, RTA), rc = ratings(carrier.at, RTC);
    const shield = ctx.shield != null ? !!ctx.shield : !!(carrier.shield && carrier.shield.on);
    p = pTackleWin(rt.T, shield ? rc.S : rc.C, timing, angle);
  }
  const fl = hypot(fvx, fvz);
  const out = {result: 'miss', severity: 0, impulse: null, tBall, tLeg, fromBehind, closing, dt: dtT, timing, angle, p, ridden: false, contact,
    footDir: fl > 1e-6 ? {x: fvx/fl, z: fvz/fl} : {x: d.x, z: d.z}};
  const glancing = minBall > 0.17;
  const ballFirst = tBall >= 0 && (tLeg < 0 || tBall <= tLeg) && !(glancing && tLeg >= 0 && tLeg - tBall <= TACKLE.NEAR_T);
  if (ballFirst){
    // late or from behind: through the man as well as the ball
    if (cm && r() < pTackleFoul(fromBehind, dtT)){
      out.result = 'foul'; out.late = true;
      out.severity = clamp(0.25 + 0.06*closing + 0.3*fromBehind + 0.25*(kind === 'slide' ? 1 : 0), 0, 1);
      const kx = cm.x - tm.x, kz = cm.z - tm.z, kl = hypot(kx, kz) || 1, mag = 1 + 0.15*closing;
      out.impulse = {x: kx/kl*mag, y: 0, z: kz/kl*mag};
      return out;
    }
    if (r() < p){
      // the ball goes where the foot was going, at a speed from the foot's
      const I = TACKLE.IMP;
      let ux = fvx, uz = fvz, ul = hypot(ux, uz);
      const fs = ul;
      if (ul < 0.5){ ux = d.x; uz = d.z; ul = 1; }
      const a = truncNormal(r, I.spread, 2.5), c = cos(a), s = sin(a);
      const kx = (ux*c - uz*s)/ul, kz = (ux*s + uz*c)/ul;
      const sp = glancing ? I.poke[0] + (I.poke[1] - I.poke[0])*r() : clamp(I.k*fs + I.add, I.min, I.max);
      out.result = glancing ? 'poke' : 'won';
      out.impulse = {x: kx*sp, y: 0, z: kz*sp};
      return out;
    }
    out.ridden = true;
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

// How a ball meeting a body is read (3.1.4, spec 3): 'control' for the intended receiver or an agent with a receive or
// interception plan while the ball (its speed against his body) is slow enough for him: a receiver up to RECV_DV over his
// comfortable speed vc = 8 + 10 c, an interception up to vc (INT_DV more for a player going for it, wanted.going); 'block'
// for an agent in a block, tackle or jockey stance; 'deflect' otherwise. wanted: 'receive' | 'intercept' | 'block' |
// null, or {receiver, plan, stance, going}; the agent's own state ('tackle', 'slide', 'jockey') also counts as a
// blocking stance.
const RTK = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}, GK0 = {dist: 0, y: 0, cosA: 1, side: 'R', vrel: 0};
export function classifyContact(agent, ball, wanted){
  const V = ball.v || ball;
  const sp = ball.v && (agent.m || agent.vx != null) ? geom(agent, ball, GK0).vrel : hypot(V.x || 0, V.y || 0, V.z || 0);
  const w = wanted && typeof wanted === 'object' ? wanted : {plan: wanted || null};
  const plan = w.receiver ? 'receive' : w.plan;
  const vc = ratings(agent.at, RTK).vc;
  if (plan === 'receive'){
    if (sp < vc + TUNE.RECV_DV.value) return 'control';
  } else if (plan === 'intercept'){
    if (sp < vc + (w.going ? TUNE.INT_DV.value : 0)) return 'control';
  }
  const st = w.stance || agent.state;
  if (st === 'block' || st === 'tackle' || st === 'slide' || st === 'jockey' || plan === 'block') return 'block';
  return 'deflect';
}
