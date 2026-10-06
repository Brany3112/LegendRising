// js/life/mover.js: the one locomotion model. Every moving body (the player in the life world, the player and every
// agent in a match or a training session) goes through moverStep: walk, jog, run and sprint targets, acceleration
// that falls off towards top speed, braking, planted cuts that cost speed, a turn rate that drops as speed rises,
// backpedal and strafe caps, stagger, and the stamina factors on top.
// Owner: WP-0D (pure foundations), then WP-B. Contract DESIGN 1.4.6; numbers 1.5.2; behaviour 3.1.5.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness. World collision comes in as a
// function; stamina comes in as stamFactors() (stamina.js).
//
//   const m = createMover({x, z, yaw});
//   const prm = moverParams({pace: 62, dribbling: 55}, "football", {grip: true});
//   moverStep(m, {dx, dz, gait: "jog"}, prm, stamFactors(st, eF), 1/60);
//
// Directions use the yaw convention of DESIGN 1.1 (yaw 0 faces -Z): dirOf, yawOf and wrapA from pitchspec.js.

import {dirOf, yawOf, wrapA} from "./football/pitchspec.js";
import {FRESH} from "./stamina.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const DEG = Math.PI/180;
const skill = v => clamp(v == null || !Number.isFinite(+v) ? 50 : +v, 1, 99);

// below this speed the velocity has no direction worth keeping: the heading takes the wish direction at once
const SNAP_V = 0.05;
// the soft end of braking: deceleration eases off over the last SOFT_V m/s above the target, so a stop settles
// instead of halting dead (the rate never drops under SOFT_MIN of the full brake)
const SOFT_V = 1.25, SOFT_MIN = 0.12;

// a body at rest
export function createMover({x = 0, z = 0, yaw = 0} = {}){
  return {x, z, vx: 0, vz: 0, speed: 0, yaw /* body facing */, heading: yaw /* velocity direction */, cut: 0, plant: 0,
    stagger: 0,
    // additions to the 1.4.6 shape: what the last step did, for gaitHint, stamina and the animation
    gait: 'stand', acc: 0, turnRate: 0, sprintB: 0, target: 0};
}

// The numbers of a profile for a set of skills (1..99; missing ones count as 50) and items ({grip}).
// FOOTBALL: walk 1.5 (toggle), jog 3.4 + 0.008 pace (default), run 5.0 + 0.012 pace (AI), sprint 6.6 + 0.028 pace
// (x1.03 grip boots), backpedal 3.2 and strafe 4.0 caps, a0 6.0 + 0.025 pace, brake 7.5, plant 9.0,
// aLat 6.5 + 0.02 agility (agility = (pace + dribbling)/2), turn rate at most 9 rad/s, sprint cone 35 degrees.
// LIFE: walk 1.7, run 5.2 (Shift), sprint 6.4 + 0.024 pace building over 1.1 s of Shift forward, backpedal and strafe
// at 0.8 of the target, a0 9, brake and plant 12, aLat 14, turn rate at most 12, sprint with forward input over 0.5.
// LIFE has no jog: a jog intent runs.
export function moverParams(skills = {}, profile = "football", items = {}){
  const pace = skill(skills && skills.pace), drib = skill(skills && skills.dribbling), agility = (pace + drib)/2;
  const grip = !!(items && items.grip);
  if (profile === "life"){
    const run = 5.2, sprint = 6.4 + 0.024*pace;
    return {profile: "life", pace, agility,
      walk: 1.7, jog: run, run, sprint, vmax: sprint,
      back: Infinity, strafe: Infinity, backMul: 0.8, strafeMul: 0.8,
      a0: 9.0, brake: 12, plant: 12, aLat: 14, wMax: 12,
      sprintCone: 60*DEG, sprintBuild: 1.1, sprintFade: 2.5,
      cutAngle: 35*DEG, cutMin: 3.0, cutFloor: 0.3,
      faceRate: 12, staggerCap: 2.0, staggerT: 0.35, bounds: null};
  }
  const sprint = (6.6 + 0.028*pace)*(grip ? 1.03 : 1);
  return {profile: "football", pace, agility,
    walk: 1.5, jog: 3.4 + 0.008*pace, run: 5.0 + 0.012*pace, sprint, vmax: sprint,
    back: 3.2, strafe: 4.0, backMul: 1, strafeMul: 1,
    a0: 6.0 + 0.025*pace, brake: 7.5, plant: 9.0, aLat: 6.5 + 0.02*agility, wMax: 9,
    sprintCone: 35*DEG, sprintBuild: 0, sprintFade: 0,
    cutAngle: 35*DEG, cutMin: 3.0, cutFloor: 0.3,
    faceRate: 12, staggerCap: 2.0, staggerT: 0.35, bounds: null};
}

// a collide function for an open pitch: the run-off bounds |x| <= hx, |z| <= hz (pitch-local metres). Pass the
// spec's runoff ({hx: L/2 + 5, hz: Wd/2 + 4}); a move that would leave them stops at the edge.
export function boundsCollide(hx, hz){
  return (m, dx, dz) => ({dx: clamp(m.x + dx, -hx, hx) - m.x, dz: clamp(m.z + dz, -hz, hz) - m.z});
}

// Speeds after tiredness (fac from stamFactors): the sprint keeps (0.45 + 0.55 bF) of its margin over the jog, times
// (0.92 + 0.08 eF); no other gait is ever faster than the tired sprint. Life's sprint builds with m.sprintB.
export function sprintSpeed(prm, fac = FRESH){
  return (prm.jog + (prm.sprint - prm.jog)*fac.speed)*fac.eSpeed;
}
export function gaitSpeed(prm, fac, gait){
  const top = sprintSpeed(prm, fac || FRESH);
  switch (gait){
    case 'walk': return Math.min(prm.walk, top);
    case 'jog': return Math.min(prm.jog, top);
    case 'run': return Math.min(prm.run, top);
    case 'sprint': return top;
    default: return 0;
  }
}

// One step of h seconds (3.1.5). intent = {dx, dz (world wish direction, |d| <= 1, its length is the throttle),
// gait: 'walk' | 'jog' | 'run' | 'sprint', face: null | {x, z}, strafe: false, speedCap: Infinity}.
// fac = stamFactors(...) or null for a fresh body. collide(m, dx, dz) -> {dx, dz} applies world collision; with none,
// prm.bounds ({hx, hz}) clamps to an open pitch when set.
export function moverStep(m, intent, prm, fac, h, collide = null){
  if (!(h > 0)) return m;
  fac = fac || FRESH;
  const it = intent || {};
  let dx = +it.dx || 0, dz = +it.dz || 0;
  const dl = Math.hypot(dx, dz), has = dl > 1e-3;
  if (has){ dx /= dl; dz /= dl; }
  const thr = has ? Math.min(1, dl) : 0;
  const v0 = m.speed;
  const wishYaw = has ? yawOf(dx, dz) : m.heading;
  const held = !!(it.face || it.strafe);          // facing is held (look, jockey, keeper), not following the heading

  // 1. target speed from the gait, the stamina factors, the facing caps and the caller's cap
  let gait = has ? (it.gait || (prm.profile === "life" ? 'walk' : 'jog')) : 'stand';
  const alpha = has ? Math.abs(wrapA(wishYaw - m.yaw)) : 0;          // wish direction against the body facing
  if (gait === 'sprint' && alpha > prm.sprintCone) gait = 'run';
  if (prm.sprintBuild > 0){
    // life: the sprint builds over sprintBuild seconds of Shift forward at running pace, and fades when let go
    const building = gait === 'sprint' && v0 > 0.85*gaitSpeed(prm, fac, 'run');
    m.sprintB = building ? Math.min(1, m.sprintB + h/prm.sprintBuild) : Math.max(0, m.sprintB - h*prm.sprintFade);
  } else m.sprintB = gait === 'sprint' ? 1 : 0;
  let vt;
  if (gait === 'sprint' && prm.sprintBuild > 0){
    const run = gaitSpeed(prm, fac, 'run');
    vt = run + (sprintSpeed(prm, fac) - run)*sstep(0, 1, m.sprintB);
  } else vt = gaitSpeed(prm, fac, gait);
  vt *= thr;
  if (has && held){
    if (alpha > 120*DEG) vt = Math.min(vt*prm.backMul, prm.back);
    else if (alpha > 60*DEG) vt = Math.min(vt*prm.strafeMul, prm.strafe);
  }
  if (it.speedCap != null && it.speedCap < vt) vt = Math.max(0, it.speedCap);
  // 6. stagger (the caller sets m.stagger = prm.staggerT after a lost shoulder duel): the speed is capped at 2.0 m/s
  // while it lasts, and the body brakes towards that at twice the plant rate (a stumble, not a snap)
  let staggered = false;
  if (m.stagger > 0){ vt = Math.min(vt, prm.staggerCap); staggered = true; m.stagger = Math.max(0, m.stagger - h); }

  // 2. the cut rule: a heading error over 35 degrees above 3 m/s plants and costs speed (target x max(0.3, cos));
  // below that, a wish to go back the way you came first stops you (a pivot), then you go
  const theta = has && v0 > SNAP_V ? Math.abs(wrapA(wishYaw - m.heading)) : 0;
  let planting = false;
  m.cut = 0;
  if (has && v0 > prm.cutMin && theta > prm.cutAngle){
    vt *= Math.max(prm.cutFloor, Math.cos(theta)); planting = true; m.cut = theta;
  } else if (has && theta > Math.PI/2){
    vt = 0; planting = true;
  }

  // 3. longitudinal: accelerate with a0*(1 - v/vt)^0.8 (integrated exactly over the step, so the result does not
  // depend on the step length), or brake: 7.5 with no input, the plant rate for cuts and reversals, harder in a stagger
  let v = v0;
  m.plant = 0;
  if (v < vt){
    const k = prm.a0*fac.accel/vt;                 // a0/vmax in the closed form s(t) = (s0^0.2 - 0.2 k t)^5, s = 1 - v/vt
    const s0 = 1 - v/vt, sg = Math.max(0, Math.pow(s0, 0.2) - 0.2*k*h);
    v = vt*(1 - Math.pow(sg, 5));
  } else if (v > vt){
    const rate = staggered ? 2*prm.plant : planting ? prm.plant : prm.brake;
    const soft = clamp((v - vt)/SOFT_V, SOFT_MIN, 1);
    v = Math.max(vt, v - rate*soft*h);
    m.plant = planting || staggered ? rate : 0;
  }

  // 4. lateral: the heading turns towards the wish at w = min(wMax, aLat*turn/max(v, 0.5)) (a lateral acceleration of
  // aLat at speed: about 8.5 m of radius at a pace-50 sprint); from (almost) standing it takes the wish at once
  const h0 = m.heading;
  if (has){
    if (v0 <= SNAP_V) m.heading = wishYaw;
    else {
      const w = Math.min(prm.wMax, prm.aLat*fac.turn/Math.max(v, 0.5));
      const e = wrapA(wishYaw - m.heading), lim = w*h;
      m.heading = wrapA(m.heading + clamp(e, -lim, lim));
    }
  }
  m.turnRate = wrapA(m.heading - h0)/h;

  // 5. body facing: the held facing when given, else the heading while moving; never faster than faceRate
  let faceYaw = null;
  if (it.face && (it.face.x || it.face.z)) faceYaw = yawOf(it.face.x, it.face.z);
  else if (!it.strafe && v > SNAP_V) faceYaw = m.heading;
  if (faceYaw != null){
    const e = wrapA(faceYaw - m.yaw), lim = prm.faceRate*h;
    m.yaw = wrapA(m.yaw + clamp(e, -lim, lim));
  }

  // 7. integrate, then the world (or the run-off bounds) has its say; a blocked move loses the blocked velocity
  const d = dirOf(m.heading);
  let mx = d.x*v*h, mz = d.z*v*h;
  const col = collide || (prm.bounds ? boundsCollide(prm.bounds.hx, prm.bounds.hz) : null);
  let blocked = false;
  if (col && (mx || mz)){
    const r = col(m, mx, mz) || {dx: mx, dz: mz};
    const want = Math.hypot(mx, mz), got = Math.hypot(r.dx, r.dz);
    if (got < want - 1e-9){
      blocked = true;
      mx = r.dx; mz = r.dz;
      v = Math.min(v, got/h);
      if (got > 1e-9) m.heading = yawOf(mx, mz);
    }
  }
  m.x += mx; m.z += mz;
  if (blocked){ m.vx = mx/h; m.vz = mz/h; }
  else { m.vx = d.x*v; m.vz = d.z*v; }
  m.acc = (v - v0)/h;
  m.speed = v;
  m.target = vt;
  m.gait = v > SNAP_V || has ? gait : 'stand';
  return m;
}

// Seconds to reach (tx, tz) from the mover's present state: a reaction delay, the swing of the velocity onto the
// point (a plant at speed, a stop for a slow reversal, or a curve at the turn rate moverStep allows), then the
// closed-form run-up to the sprint speed the factors allow. An estimate for AI and interception (it never steps the
// mover): within 1% of moverStep on straight runs, and close on turning ones (qa/unit/mover.mjs).
export function timeToPoint(m, prm, fac, tx, tz, react = 0){
  fac = fac || FRESH;
  const ddx = tx - m.x, ddz = tz - m.z, D0 = Math.hypot(ddx, ddz);
  if (D0 < 1e-6) return react;
  const vs = sprintSpeed(prm, fac), k = prm.a0*fac.accel/vs, aLat = prm.aLat*fac.turn;
  let v = Math.min(m.speed, vs), t = react, D = D0;
  const th = v > SNAP_V ? Math.abs(wrapA(yawOf(ddx, ddz) - m.heading)) : 0;
  if (th > 1e-6){
    // a local frame: the heading along +x, the point at angle th to the left (the right is the mirror image)
    const Tx = D0*Math.cos(th), Ty = D0*Math.sin(th);
    let px = 0, py = 0, hd = 0;
    if (v > prm.cutMin && th > prm.cutAngle){
      // a plant (the cut rule): braking at the plant rate while the heading swings at aLat/v, so the error left at
      // speed u is th + (aLat/plant)*ln(u/v); the plant ends where u meets the cut target run*max(floor, cos error)
      const run = gaitSpeed(prm, fac, 'run'), c = aLat/prm.plant;
      const left = u => Math.max(0, th + c*Math.log(u/v));
      const want = u => { const e = left(u); return e <= prm.cutAngle ? Infinity : run*Math.max(prm.cutFloor, Math.cos(e)); };
      let lo = 0, hi = v;
      if (want(v) >= v) lo = v;
      else for (let i = 0; i < 20; i++){ const mid = (lo + hi)/2; if (mid > want(mid)) hi = mid; else lo = mid; }
      const v1 = Math.max(lo, 0.05), tp = (v - v1)/prm.plant, turned = th - left(v1), s = (v + v1)/2*tp;
      t += tp; px = s*Math.cos(turned/2); py = s*Math.sin(turned/2); hd = turned; v = v1;
    } else if (th > Math.PI/2){
      // a slow reversal: stop, then go (from standing the heading takes the new line at once)
      const s = v*v/(2*prm.plant);
      t += v/prm.plant; px = s; v = 0;
    }
    if (v > SNAP_V){
      // a curve for what is left of the error: an arc of radius v/w at w = min(wMax, aLat/v)
      const e = Math.max(0, wrapA(Math.atan2(Ty - py, Tx - px) - hd));
      const w = Math.min(prm.wMax, aLat/Math.max(v, 0.5)), r = v/w;
      t += e/w;
      px += r*(Math.sin(hd + e) - Math.sin(hd)); py += r*(Math.cos(hd) - Math.cos(hd + e));
    }
    D = Math.hypot(Tx - px, Ty - py);
  }
  if (D <= 0) return t;
  v = clamp(v, 0, vs);
  // closed form from speed v towards vs: s = 1 - v/vs, sigma = s^0.2, x(t) = vs*(t - (sigma^6 - (sigma - 0.2kt)^6)/(1.2k))
  const sig = Math.pow(1 - v/vs, 0.2), Tr = sig/(0.2*k);
  const xAt = tt => vs*(tt - (Math.pow(sig, 6) - Math.pow(Math.max(0, sig - 0.2*k*tt), 6))/(1.2*k));
  const xr = xAt(Tr);
  if (D >= xr) return t + Tr + (D - xr)/vs;
  // bisection on the monotonic run-up (24 halvings: far below a frame)
  let lo = 0, hi = Tr;
  for (let i = 0; i < 24; i++){ const mid = (lo + hi)/2; if (xAt(mid) < D) lo = mid; else hi = mid; }
  return t + (lo + hi)/2;
}

// What the animation and the camera need from the last step: speed, how fast the heading turned (rad/s, + is to
// the left in yaw terms) and the longitudinal acceleration (m/s squared)
export function gaitHint(m){ return {v: m.speed, turnRate: m.turnRate || 0, accel: m.acc || 0}; }
