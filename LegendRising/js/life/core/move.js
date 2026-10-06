/* ============ LIFE core: how you move ============
   Owner: WP-0A moves it here, WP-B owns it from Stage 1 (moverStep with the LIFE profile). Contract: DESIGN 1.2
   (move.js), 1.3 (life player movement), 2.2 WP-0A.
   Life movement: what the keys ask for, turned into speed and steering, walls, the ground under you, the eye height
   and the head bob. See state.js P for how a walk, a run and a sprint feel. */
import {W} from "../build.js";
import {G, P, B, E, FLAGS, keys, spring} from "./state.js";
import {moveBy, touching} from "./collide.js";

// drill: how fast you move in a drill that lets you (the interception lane): a quick shuffle, as the drills were timed for
// bobFrom: the pace above which the head bob grows with a run's longer, harder strides
export const GAIT = {walk:2.0, run:6.0, sprint:7.6, back:.8, drill:4.0, bobFrom:4.0, accel:26, brake:24, turn:24, sprintIn:1.1, sprintOut:2.5};

/* the highest thing under you that you could step onto. Also the ground your eye rides on (GR.eg, with its slope
   GR.egx / GR.egz): the same, except that a flight's slope is carried on past its foot down to the floor in front of
   it. A stair ramp starts a whole riser up (it runs along the nosings), so the feet hop onto it, but the eye should
   already be on its way up as you reach the first step, as yours is, not get kicked up by the riser and lag. */
export const GR = {eg:0, egx:0, egz:0};
export function groundAt(x, z, feet){
  let best = 0, gx = 0, gz = 0;
  for (const f of W.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.h <= feet + .5 && f.h > best){ best = f.h; gx = gz = 0; }
  for (const r of W.ramps){
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const c = r.axis === "z" ? z : x, u = (c - r.a0)/(r.a1 - r.a0), t = Math.max(0, Math.min(1, u));
    const h = r.h0 + (r.h1 - r.h0)*t;
    if (h <= feet + .5 && h > best){
      best = h;
      const k = u > 0 && u < 1 ? (r.h1 - r.h0)/(r.a1 - r.a0) : 0;
      gx = r.axis === "z" ? 0 : k; gz = r.axis === "z" ? k : 0;
    }
  }
  GR.eg = best; GR.egx = gx; GR.egz = gz;
  for (const r of W.ramps){
    const ax = r.axis === "z", s = ax ? x : z;
    if (s < (ax ? r.x0 : r.z0) || s > (ax ? r.x1 : r.z1)) continue;
    const c = ax ? z : x, u = (c - r.a0)/(r.a1 - r.a0);
    if (r.h0 <= r.h1 ? u >= 0 : u <= 1) continue;                     // only beyond the low end
    const h = r.h0 + (r.h1 - r.h0)*u;
    if (h > GR.eg && h >= Math.min(r.h0, r.h1) - .3 && h <= feet + .5){
      GR.eg = h; const k = (r.h1 - r.h0)/(r.a1 - r.a0); GR.egx = ax ? 0 : k; GR.egz = ax ? k : 0;
    }
  }
  return best;
}

// tired legs and an empty stomach slow you down a little: gradually, never in a sudden step
export function legs(){
  const s = G(); if (!s) return 1;
  return 1 - Math.min(.15, Math.max(0, (s.fatigue || 0) - 70)/200) - Math.min(1, Math.max(0, 15 - (s.energy || 0))/10)*.08;
}

// what the keys ask for this frame: forward (f) and right (r) as a direction of length len (0 or 1), and whether you
// run (Shift). lk: your control is taken away. A drill that keeps you on its spot takes the keys too; nobody runs in one
const IN = {f:0, r:0, len:0, run:false};
export function moveInput(lk){
  const D = FLAGS.drill, canMove = !lk && (!D || D.allowMove);
  let f = 0, r = 0;
  if (canMove){
    f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len){ f /= len; r /= len; }
  IN.f = f; IN.r = r; IN.len = len; IN.run = !!keys.shift && !!len && !D;
  return IN;
}
// one slice of moving: speed, steering, walls, the ground under you, the eye height and the bob
export function body(dt, f, r, len, run){
  const drill = FLAGS.drill;
  // sprint builds while you hold Shift going forward at full running pace, and falls away as soon as you don't
  const fwd = run && f > .5;
  if (fwd && P.speed > GAIT.run*.85*legs()) P.sprint = Math.min(1, P.sprint + dt/GAIT.sprintIn);
  else P.sprint = Math.max(0, P.sprint - dt*GAIT.sprintOut);
  const sb = P.sprint*P.sprint*(3 - 2*P.sprint);
  let sp = (run ? GAIT.run + (GAIT.sprint - GAIT.run)*sb : drill ? GAIT.drill : GAIT.walk)*legs();
  if (f < 0) sp *= GAIT.back;
  /* world-space velocity towards where you want to go. While you hold a direction, the way you are moving swings round
     onto it at once (a quarter turn in about 1/15 s) without losing speed, so you go where you look the moment you
     turn; only the speed itself, and a reversal (over 140 degrees: it brakes through a stop), are acceleration-limited.
     With no key held you coast to a stop along the way you were going, whichever way you then look. */
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let tx = (r*cos - f*sin)*sp, tz = (-r*sin - f*cos)*sp;
  // up against a wall, the part of where you want to go that is into it is taken out first (every solid is a box, so
  // that is one axis): you slide along it at what your push along it is worth (sp times the sine of the angle) whatever
  // the frame rate, and the steering below never mistakes what the wall left of your velocity for the way you are going
  if (tx && touching(Math.sign(tx), 0)) tx = 0;
  if (tz && touching(0, Math.sign(tz))) tz = 0;
  const tl = Math.hypot(tx, tz), v0 = Math.hypot(P.vx, P.vz);
  let turned = false;
  if (tl > .05 && v0 > .05){
    const hv = Math.atan2(P.vz, P.vx);
    let d = Math.atan2(tz, tx) - hv; d -= Math.round(d/(2*Math.PI))*2*Math.PI;
    if (Math.abs(d) < 2.45){
      const a = hv + Math.max(-GAIT.turn*dt, Math.min(GAIT.turn*dt, d)), s1 = v0 + Math.max(-GAIT.brake*dt, Math.min(GAIT.accel*dt, tl - v0));
      P.vx = Math.cos(a)*s1; P.vz = Math.sin(a)*s1; turned = true;
    }
  }
  if (!turned){
    let dvx = tx - P.vx, dvz = tz - P.vz;
    const dl = Math.hypot(dvx, dvz), lim = (tl ? GAIT.accel : GAIT.brake)*dt;
    if (dl > lim){ dvx *= lim/dl; dvz *= lim/dl; }
    P.vx += dvx; P.vz += dvz;
  }
  if (!tl && Math.hypot(P.vx, P.vz) < .02) P.vx = P.vz = 0;
  const ox = P.x, oz = P.z;
  if (P.vx || P.vz) moveBy(P.vx*dt, P.vz*dt);
  // what you actually did, after walls: this drives the bob, the stride and the clock
  const ax = dt > 0 ? (P.x - ox)/dt : 0, az = dt > 0 ? (P.z - oz)/dt : 0, actual = Math.hypot(ax, az);
  P.speed += (actual - P.speed)*(1 - Math.exp(-14*dt));
  if (P.speed < .01 && !actual) P.speed = 0;
  FLAGS.moving = P.speed > .5;
  P.moveMode = P.speed < .3 ? "idle" : P.sprint > .5 ? "sprint" : run && P.speed > GAIT.walk*1.08*legs() ? "run" : "walk";
  // a step is shorter at a walk and longer at a run, so the cadence goes from about 2.3 to about 3.3 steps a second
  P.stride = (P.stride + actual*dt/Math.max(.9, P.speed/(1.4 + .25*P.speed))) % 1e4;
  /* stairs, kerbs and falling: the feet follow the ground exactly; the eye follows the feet through two critically
     damped springs, a stiff one that rounds off where a slope starts and ends, a softer one that soaks up the sudden
     part (a kerb, a step down, a landing). Neither has any momentum of its own, so the eye can never overshoot: it
     rises when you go up and only then, and it comes to rest exactly at eye height. */
  const g = groundAt(P.x, P.z, P.feet);
  let tv = GR.egx*ax + GR.egz*az;                           // how fast the slope under the eye is lifting you
  if (g >= P.feet - .001){ P.feet = g; P.vy = 0; }
  else if (P.feet - g < .45 && P.vy === 0){ P.feet = g; }
  else { P.vy -= 22*dt; P.feet = Math.max(g, P.feet + P.vy*dt); tv = P.vy; if (P.feet === g) P.vy = 0; }
  const base = Math.max(P.feet, GR.eg), df = base - E.g; E.g = base;
  let c = tv*dt; c = df*c > 0 ? Math.sign(df)*Math.min(Math.abs(c), Math.abs(df)) : 0;
  E.a -= c; E.b -= df - c;
  if (Math.abs(E.a) + Math.abs(E.b) > .9) E.a = E.av = E.b = E.bv = 0;     // a teleport, not a step
  spring(E, "a", "av", 40, dt); spring(E, "b", "bv", 16, dt);
  P.eye = base + P.eyeH + E.a + E.b;
  // head bob: the target is a small sine once a step (and half that, sideways, once a stride); springs carry the camera to it
  const want = P.speed < .3 ? 0 : Math.min(.011, P.speed*.0028) + Math.max(0, P.speed - GAIT.bobFrom)*.0034;
  B.amt += (want - B.amt)*(1 - Math.exp(-6*dt));
  if (B.amt < 1e-5 && !want) B.amt = 0;
  const ph = P.stride*Math.PI*2;
  B.y -= B.amt*Math.sin(ph); B.x -= B.amt*.45*Math.sin(ph/2);
  spring(B, "y", "yv", 30, dt); spring(B, "x", "xv", 30, dt);
  B.y += B.amt*Math.sin(ph); B.x += B.amt*.45*Math.sin(ph/2);
  if (!B.amt && Math.abs(B.y) + Math.abs(B.x) < 1e-5 && Math.abs(B.yv) + Math.abs(B.xv) < 1e-4) B.y = B.yv = B.x = B.xv = 0;
}

// a slightly wider view at a sprint, eased in and out; the camera takes it up (B.fovSet) only when it has moved enough
// to matter, so the projection is not rebuilt every frame
export function fovStep(dt){
  const fovT = 74 + 4*P.sprint*P.sprint*(3 - 2*P.sprint);
  B.fov = Math.abs(fovT - B.fov) < .005 ? fovT : B.fov + (fovT - B.fov)*(1 - Math.exp(-5*dt));
  if (Math.abs(B.fov - B.fovSet) > .01 || (B.fov === fovT && B.fovSet !== fovT)) B.fovSet = B.fov;
}
