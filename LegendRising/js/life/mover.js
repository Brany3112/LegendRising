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
// Directions use the yaw convention of DESIGN 1.1 (yaw 0 faces -Z): yawOf and wrapA from pitchspec.js (and dirOf's
// formula, written out where a step would otherwise allocate). Trigonometry, powers and lengths come from detmath.js, so
// a step gives the same bits in Node and in every browser (D6).

import {yawOf, wrapA} from "./football/pitchspec.js";
import {sin, cos, atan2, pow, hypot, exp, log} from "./football/detmath.js";
import {FRESH} from "./stamina.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const DEG = Math.PI/180;
const skill = v => clamp(v == null || !Number.isFinite(+v) ? 50 : +v, 1, 99);

// below this speed the velocity has no direction worth keeping: the heading takes the wish direction at once
const SNAP_V = 0.05;

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
// spec's runoff ({hx: L/2 + 5, hz: Wd/2 + 4}); a move that would leave them stops at the edge. It answers in one
// object it keeps reusing, so read the result before the next call. (moverStep clamps prm.bounds itself, without it.)
export function boundsCollide(hx, hz){
  const r = {dx: 0, dz: 0};
  return (m, dx, dz) => { r.dx = clamp(m.x + dx, -hx, hx) - m.x; r.dz = clamp(m.z + dz, -hz, hz) - m.z; return r; };
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
// fac = stamFactors(...) or null for a fresh body. collide(m, dx, dz) -> {dx, dz} applies world collision and has the
// last word on where the body goes: a shortened move, a slide along a wall or a push out of an obstacle all move the
// body exactly as it says (the velocity keeps only what is the body's own running: along a wall, what the wish's push
// along it is worth; never faster than before, never back the way it was pushed). With no collide, prm.bounds
// ({hx, hz}) clamps to an open pitch. Nothing is allocated per step.
export function moverStep(m, intent, prm, fac, h, collide = null){
  if (!(h > 0)) return m;
  fac = fac || FRESH;
  const it = intent || {};
  let dx = +it.dx || 0, dz = +it.dz || 0;
  const dl = hypot(dx, dz), has = dl > 1e-3;
  if (has){ dx /= dl; dz /= dl; }
  const thr = has ? Math.min(1, dl) : 0;
  const v0 = m.speed;
  const wishYaw = has ? yawOf(dx, dz) : m.heading;
  const held = !!(it.face || it.strafe);          // facing is held (look, jockey, keeper), not following the heading

  // 1. target speed from the gait, the stamina factors, the facing caps and the caller's cap. The facing caps (the
  // sprint cone, backpedal and strafe) are measured against a held facing: a body that faces where it runs turns to
  // its wish at the turn rate, and the angle on the way round is the cut rule's to price (step 2), not twice over
  let gait = has ? (it.gait || (prm.profile === "life" ? 'walk' : 'jog')) : 'stand';
  const alpha = has && held ? Math.abs(wrapA(wishYaw - m.yaw)) : 0;  // wish direction against the held facing
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
  // 6. stagger (the caller sets m.stagger = prm.staggerT after a lost shoulder duel): the speed is capped at
  // staggerCap (2.0 m/s) for staggerT (0.35 s), from the first step of it. The lost duel is the impact that takes the
  // speed (D21: the simulation sets the timing); the stumble on the body is the animation's 'stagger' state, which
  // blends into it, and the heading is kept so the body carries on the way it was going
  let staggered = false;
  if (m.stagger > 0){ vt = Math.min(vt, prm.staggerCap); staggered = true; m.stagger = m.stagger - h > 1e-9 ? m.stagger - h : 0; }
  const vFree = vt;                               // the target before the cut rule: what a slide along a wall is worth

  // 2. the cut rule: a heading error over 35 degrees above 3 m/s plants and costs speed (target x max(0.3, cos));
  // below that, a wish to go back the way you came first stops you (a pivot), then you go
  const theta = has && v0 > SNAP_V ? Math.abs(wrapA(wishYaw - m.heading)) : 0;
  let planting = false;
  m.cut = 0;
  if (has && v0 > prm.cutMin && theta > prm.cutAngle){
    vt *= Math.max(prm.cutFloor, cos(theta)); planting = true; m.cut = theta;
  } else if (has && theta > Math.PI/2){
    vt = 0; planting = true;
  }

  // 3. longitudinal: accelerate with a0*(1 - v/vmax)^0.8*accel up to the target (1.5.2), vmax being the top speed
  // the body has now (the sprint after the stamina factors, prm.vmax when fresh). A walk or a jog is reached briskly,
  // where the drive is still strong, and the curve flattens only towards a full sprint. Integrated exactly over the
  // step (s = 1 - v/vmax, s(t)^0.2 = s0^0.2 - 0.2 k t, k = a0*accel/vmax), so the run does not depend on the step
  // length. Or brake at a constant rate (1.5.2): prm.brake (7.5, life 12) with no input or a slower gait, prm.plant
  // (9, life 12) for cuts and reversals, so a stop takes v/rate seconds over v^2/(2 rate) metres, which is what the
  // animation's stop planner (3.5.5) works out from the same numbers. A stagger caps the speed outright.
  let v = v0;
  m.plant = 0;
  if (v < vt){
    const vmax = Math.max(vt, sprintSpeed(prm, fac)), k = prm.a0*fac.accel/vmax;
    const s0 = 1 - v/vmax, sg = Math.max(0, pow(s0, 0.2) - 0.2*k*h);
    v = Math.min(vt, vmax*(1 - pow(sg, 5)));
  } else if (v > vt){
    const rate = planting ? prm.plant : prm.brake;
    v = staggered && v > prm.staggerCap ? prm.staggerCap : Math.max(vt, v - rate*h);
    if (planting) m.plant = rate;
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

  // 5. body facing: the held facing when given, else the heading while moving; never faster than faceRate
  let faceYaw = null;
  if (it.face && (it.face.x || it.face.z)) faceYaw = yawOf(it.face.x, it.face.z);
  else if (!it.strafe && v > SNAP_V) faceYaw = m.heading;
  if (faceYaw != null){
    const e = wrapA(faceYaw - m.yaw), lim = prm.faceRate*h;
    m.yaw = wrapA(m.yaw + clamp(e, -lim, lim));
  }

  // 7. integrate, then the world (or the run-off bounds) has its say: the body never goes anywhere collide did not
  // answer. When the answer takes away part of the run (a wall, an edge, a push back), the velocity after it follows
  // the slide, the part of the answer across what was taken away, at what the wish's push along that slide is worth
  // (the target times the cosine between the wish and the slide, as body() in core/move.js slides today) or, if
  // faster, what was left of the run's own momentum along it, braking at prm.brake: never faster than before, never
  // back the way it was pushed, and the same however the body came to the wall. The move along the slide is that
  // speed's worth (a prefix of the answer's slide), so the body slides as fast as it says it does at any frame rate.
  // An answer that takes nothing from the run (a shove to the side, a push further along) is applied as it is and
  // leaves the velocity alone.
  const ux = -sin(m.heading), uz = -cos(m.heading);       // dirOf(m.heading), inline
  const want = v*h;
  let mx = ux*want, mz = uz*want, vx = ux*v, vz = uz*v;
  if (want > 0){
    let rx = mx, rz = mz;
    if (collide){
      const r = collide(m, mx, mz);
      if (r){ rx = +r.dx; rz = +r.dz; if (!Number.isFinite(rx) || !Number.isFinite(rz)){ rx = mx; rz = mz; } }
    } else if (prm.bounds){
      rx = clamp(m.x + mx, -prm.bounds.hx, prm.bounds.hx) - m.x;
      rz = clamp(m.z + mz, -prm.bounds.hz, prm.bounds.hz) - m.z;
    }
    const qx = mx - rx, qz = mz - rz, ql = hypot(qx, qz);    // what the world took away from the move
    if (ql > 1e-12 && qx*ux + qz*uz > 1e-9*want){
      const nx = qx/ql, nz = qz/ql, rn = rx*nx + rz*nz;
      const tx = rx - rn*nx, tz = rz - rn*nz, tl = hypot(tx, tz);
      let k = 0;
      if (tl > 1e-9*want){
        const sx = tx/tl, sz = tz/tl;
        const drive = has ? vFree*Math.max(0, dx*sx + dz*sz) : 0;
        const carry = Math.min(v*Math.max(0, ux*sx + uz*sz), v0 - prm.brake*h);
        k = Math.min(v, Math.max(drive, carry));
        vx = sx*k; vz = sz*k;
        if (k > 1e-9) m.heading = yawOf(sx, sz);
        // along the slide the body goes as far as it runs this step (k*h), never further than the answer; the part
        // of the answer across it (the gap closed, a push out) stands in full
        const go = Math.min(tl, k*h);
        rx = rn*nx + sx*go; rz = rn*nz + sz*go;
      }
      if (!(k > 0)){ k = 0; vx = 0; vz = 0; }
      v = k;
    }
    mx = rx; mz = rz;
  }
  m.turnRate = wrapA(m.heading - h0)/h;
  m.x += mx; m.z += mz;
  m.vx = vx; m.vz = vz;
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
  const ddx = tx - m.x, ddz = tz - m.z, D0 = hypot(ddx, ddz);
  if (D0 < 1e-6) return react;
  const vs = sprintSpeed(prm, fac), k = prm.a0*fac.accel/vs, aLat = prm.aLat*fac.turn;
  let v = Math.min(m.speed, vs), t = react, D = D0;
  const th = v > SNAP_V ? Math.abs(wrapA(yawOf(ddx, ddz) - m.heading)) : 0;
  if (th > 1e-6){
    // a local frame: the heading along +x, the point at angle th to the left (the right is the mirror image)
    const Tx = D0*cos(th), Ty = D0*sin(th);
    let px = 0, py = 0, hd = 0;
    if (v > prm.cutMin && th > prm.cutAngle){
      // a plant (the cut rule): braking at the plant rate while the heading swings at aLat/v, so the error left at
      // speed u is th + (aLat/plant)*ln(u/v); the plant ends where u meets the cut target vs*max(floor, cos error)
      // (a body that faces where it runs keeps its sprint target through the turn: moverStep step 1)
      const c = aLat/prm.plant;
      const left = u => Math.max(0, th + c*log(u/v));
      const want = u => { const e = left(u); return e <= prm.cutAngle ? Infinity : vs*Math.max(prm.cutFloor, cos(e)); };
      let lo = 0, hi = v;
      if (want(v) >= v) lo = v;
      else for (let i = 0; i < 20; i++){ const mid = (lo + hi)/2; if (mid > want(mid)) hi = mid; else lo = mid; }
      const v1 = Math.max(lo, 0.05), tp = (v - v1)/prm.plant, turned = th - left(v1), s = (v + v1)/2*tp;
      t += tp; px = s*cos(turned/2); py = s*sin(turned/2); hd = turned; v = v1;
      // out of the plant below the cut speed with the point still more than a quarter turn away: moverStep brakes
      // on at the plant rate (a reversal) while the heading keeps swinging at aLat/u, until the error is back to a
      // quarter turn at u2 = v*exp((pi/2 - e)/c); if that is all but standing, it stops and sets off afresh
      const e2 = wrapA(atan2(Ty - py, Tx - px) - hd);
      if (v <= prm.cutMin && e2 > Math.PI/2){
        const u2 = v*exp((Math.PI/2 - e2)/c);
        if (u2 > 0.5){
          const tp2 = (v - u2)/prm.plant, sw = e2 - Math.PI/2, s2 = (v + u2)/2*tp2;
          t += tp2; px += s2*cos(hd + sw/2); py += s2*sin(hd + sw/2); hd += sw; v = u2;
        } else {
          const s2 = v*v/(2*prm.plant);
          t += v/prm.plant; px += s2*cos(hd); py += s2*sin(hd); v = 0;
        }
      }
    } else if (th > Math.PI/2){
      // a slow reversal: stop, then go (from standing the heading takes the new line at once)
      const s = v*v/(2*prm.plant);
      t += v/prm.plant; px = s; v = 0;
    }
    if (v > SNAP_V){
      // a curve for what is left of the error: an arc of radius v/w at w = min(wMax, aLat/v)
      const e = Math.max(0, wrapA(atan2(Ty - py, Tx - px) - hd));
      const w = Math.min(prm.wMax, aLat/Math.max(v, 0.5)), r = v/w;
      t += e/w;
      px += r*(sin(hd + e) - sin(hd)); py += r*(cos(hd) - cos(hd + e));
    }
    D = hypot(Tx - px, Ty - py);
  }
  if (D <= 0) return t;
  v = clamp(v, 0, vs);
  // closed form from speed v towards vs: s = 1 - v/vs, sigma = s^0.2, x(t) = vs*(t - (sigma^6 - (sigma - 0.2kt)^6)/(1.2k))
  const sig = pow(1 - v/vs, 0.2), Tr = sig/(0.2*k);
  const xAt = tt => vs*(tt - (pow(sig, 6) - pow(Math.max(0, sig - 0.2*k*tt), 6))/(1.2*k));
  const xr = xAt(Tr);
  if (D >= xr) return t + Tr + (D - xr)/vs;
  // bisection on the monotonic run-up (24 halvings: far below a frame)
  let lo = 0, hi = Tr;
  for (let i = 0; i < 24; i++){ const mid = (lo + hi)/2; if (xAt(mid) < D) lo = mid; else hi = mid; }
  return t + (lo + hi)/2;
}

// What the animation and the camera need from the last step: speed, how fast the heading turned (rad/s, + is to
// the left in yaw terms) and the longitudinal acceleration (m/s squared)
// (out: an object to fill instead of a new one, for per-frame callers)
export function gaitHint(m, out = {}){
  out.v = m.speed; out.turnRate = m.turnRate || 0; out.accel = m.acc || 0;
  return out;
}
