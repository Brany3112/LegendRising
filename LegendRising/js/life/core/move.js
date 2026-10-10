/* ============ LIFE core: how you move ============
   Owner: WP-0A moves it here, WP-B owns it from Stage 1. Contract: DESIGN 1.2 (move.js), 1.3 (life player movement:
   body() through moverStep), 1.4.6 and 1.4.7 (the mover and the stamina pool), 1.5.2 (the LIFE profile), 3.1.5, 3.1.6.
   Life movement: what the keys ask for goes through the one locomotion model every body uses (mover.js, LIFE profile):
   a 1.7 m/s walk, Shift to run at 5.2 m/s, and with Shift held going forward a sprint that builds over 1.1 s to
   6.4 + 0.024 pace. Acceleration falls off towards top speed, stopping is a firm brake, sideways and backwards are a
   little slower; the walls have the last word (the mover's collide answer is where you go). Sprinting costs breath
   from a short-term pool (stamina.js) shown by the breath arc beside the crosshair; tired legs (low breath, low energy,
   high fatigue) take the edge off the sprint. Then the ground under you, the eye height and its springs. The head bob
   rides your body's own pelvis and footfalls (me.js), not a clock of its own.
   ?loco=old (a development flag, removed before release by WP-L) puts back the movement this replaced. */
import {W} from "../build.js";
import {G, P, B, E, FLAGS, keys, spring} from "./state.js";
import {moveBy, touching} from "./collide.js";
import {hud} from "./hud.js";
import {createMover, moverParams, moverStep, sprintSpeed} from "../mover.js";
import {speedFx} from "../football/matchcam.js";
import {createStam, stamStep, stamFactors, stamSetCap, effortOf, effF} from "../stamina.js";

// the old controller's numbers (?loco=old); drill: how fast you move in a drill that lets you (the interception
// lane): a quick shuffle, as the drills were timed for
export const GAIT = {walk:2.0, run:6.0, sprint:7.6, back:.8, drill:4.0, bobFrom:4.0, accel:26, brake:24, turn:24, sprintIn:1.1, sprintOut:2.5};
const OLD = (() => { try { return new URLSearchParams(location.search).get("loco") === "old"; } catch(e){ return false; } })();

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

// tired legs and an empty stomach slow you down a little: gradually, never in a sudden step (the old controller only)
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

/* ---------- you, on the mover ----------
   LOCO.m: your mover (mirrors P; anything else that puts you somewhere, a placement, a cut, a drill, is taken over at
   the start of the next step), LOCO.st: your breath (never saved), LOCO.fac: what tiredness does this step (the
   mover and your body's lean read it), LOCO.want: the speed the keys ask for (your body's stop starts from it) */
export const LOCO = {m:null, prm:null, st:null, fac:{}, want:0, px:NaN, pz:NaN, capT:0, old:OLD,
  intent:{dx:0, dz:0, gait:"walk", face:{x:0, z:-1}, strafe:false, speedCap:Infinity}};
const skillOf = k => {
  const s = G();
  try { if (typeof effSkill === "function"){ const v = +effSkill(k); if (Number.isFinite(v)) return v; } } catch(e){}
  const v = s && s.skills ? +s.skills[k] : NaN;
  return Number.isFinite(v) ? v : 50;
};
// the world's answer to a move: moveBy (walls, doors, the zone's bounds, a drill's box) from where the mover is
const CR = {dx:0, dz:0};
function collide(m, dx, dz){
  P.x = m.x; P.z = m.z;
  moveBy(dx, dz);
  CR.dx = P.x - m.x; CR.dz = P.z - m.z;
  return CR;
}
export function locoReset(){ LOCO.m = null; LOCO.px = LOCO.pz = NaN; }
// one slice of moving: the mover, your breath, the ground under you and the eye height
export function body(dt, f, r, len, run){
  if (OLD) return bodyOld(dt, f, r, len, run);
  const s = G(), drill = FLAGS.drill;
  // the mover takes over where you are if something else moved you (a placement stops you dead)
  let m = LOCO.m;
  if (!m){ m = LOCO.m = createMover({x:P.x, z:P.z, yaw:P.yaw}); LOCO.px = P.x; LOCO.pz = P.z; }
  if (P.x !== LOCO.px || P.z !== LOCO.pz){
    m.x = P.x; m.z = P.z;
    if (!P.vx && !P.vz && !P.speed){ m.vx = m.vz = m.speed = 0; m.sprintB = 0; m.heading = m.yaw = P.yaw; }
  }
  // the profile for your skills; your breath and its cap from today's energy and fatigue (looked at once a second)
  // (the speed skills of addendum A1.1: sprint speed sets the top speeds, acceleration how steeply you get there)
  const spd = skillOf("sprintSpeed"), acc = skillOf("acceleration"), stamina = skillOf("stamina"), energy = s ? +s.energy || 0 : 100, fatigue = s ? +s.fatigue || 0 : 0;
  if (!LOCO.prm || LOCO.prm.pace !== Math.max(1, Math.min(99, spd)) || LOCO.prm.acceleration !== Math.max(1, Math.min(99, acc)))
    LOCO.prm = moverParams({sprintSpeed:spd, acceleration:acc, dribbling:skillOf("dribbling")}, "life");
  if (!LOCO.st) LOCO.st = createStam({stamina, energy, fatigue});
  if ((LOCO.capT -= dt) <= 0){ LOCO.capT = 1; stamSetCap(LOCO.st, energy, fatigue); }
  const eF = effF(energy), fac = stamFactors(LOCO.st, eF, LOCO.fac);
  // what the keys ask for, in the world: forward is where you look; Shift runs, and going forward it builds a sprint
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw), it = LOCO.intent;
  it.dx = len ? r*cos - f*sin : 0; it.dz = len ? -r*sin - f*cos : 0;
  it.gait = run ? (f > .5 ? "sprint" : "run") : drill ? "run" : "walk";
  it.speedCap = drill ? GAIT.drill : Infinity;
  it.face.x = -sin; it.face.z = -cos;
  const ox = P.x, oz = P.z;
  moverStep(m, it, LOCO.prm, fac, dt, collide);
  P.x = m.x; P.z = m.z; LOCO.px = P.x; LOCO.pz = P.z;
  P.vx = m.vx; P.vz = m.vz; P.speed = m.speed; P.sprint = m.sprintB;
  LOCO.want = len ? m.target : 0;
  // breath: a sprint drains it, running hard a little; it comes back walking or standing (and the arc shows it)
  stamStep(LOCO.st, dt, effortOf(m.gait, m.speed, LOCO.prm.run), {stamina, eF});
  if (hud.breath) hud.breath(LOCO.st.B, LOCO.st.cap);
  FLAGS.moving = P.speed > .5;
  P.moveMode = P.speed < .3 ? "idle" : m.gait === "sprint" && m.sprintB > .5 ? "sprint" : m.gait === "run" || m.gait === "sprint" ? "run" : "walk";
  const ax = dt > 0 ? (P.x - ox)/dt : 0, az = dt > 0 ? (P.z - oz)/dt : 0;
  feetAndEye(dt, ax, az);
}
/* stairs, kerbs and falling: the feet follow the ground exactly; the eye follows the feet through two critically
   damped springs, a stiff one that rounds off where a slope starts and ends, a softer one that soaks up the sudden
   part (a kerb, a step down, a landing). Neither has any momentum of its own, so the eye can never overshoot: it
   rises when you go up and only then, and it comes to rest exactly at eye height. */
function feetAndEye(dt, ax, az){
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
}

// the movement this replaced (?loco=old): its own speeds, steering and head bob
function bodyOld(dt, f, r, len, run){
  const drill = FLAGS.drill;
  // sprint builds while you hold Shift going forward at full running pace, and falls away as soon as you don't
  const fwd = run && f > .5;
  if (fwd && P.speed > GAIT.run*.85*legs()) P.sprint = Math.min(1, P.sprint + dt/GAIT.sprintIn);
  else P.sprint = Math.max(0, P.sprint - dt*GAIT.sprintOut);
  const sb = P.sprint*P.sprint*(3 - 2*P.sprint);
  let sp = (run ? GAIT.run + (GAIT.sprint - GAIT.run)*sb : drill ? GAIT.drill : GAIT.walk)*legs();
  if (f < 0) sp *= GAIT.back;
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let tx = (r*cos - f*sin)*sp, tz = (-r*sin - f*cos)*sp;
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
  const ax = dt > 0 ? (P.x - ox)/dt : 0, az = dt > 0 ? (P.z - oz)/dt : 0, actual = Math.hypot(ax, az);
  P.speed += (actual - P.speed)*(1 - Math.exp(-14*dt));
  if (P.speed < .01 && !actual) P.speed = 0;
  FLAGS.moving = P.speed > .5;
  P.moveMode = P.speed < .3 ? "idle" : P.sprint > .5 ? "sprint" : run && P.speed > GAIT.walk*1.08*legs() ? "run" : "walk";
  LOCO.want = len ? sp : 0;
  P.stride = (P.stride + actual*dt/Math.max(.9, P.speed/(1.4 + .25*P.speed))) % 1e4;
  feetAndEye(dt, ax, az);
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
// The widening is the match camera's own speed feel (matchcam.js speedFx, addendum A1.2): up to 5 degrees over the
// last 20% of your top speed, scaled by the "Camera motion and effects" setting. LIFE_FX also carries the breath's
// vignette for the life HUD.
export const LIFE_FX = {share:0, fov:0, lines:0, sway:0, vig:0, pulse:0, heavy:0, wind:0, top:0, topT:0, beat:0, desat:0};
const MOTION = {v:1, t:0};
function lifeMotion(dt){
  if ((MOTION.t -= dt) > 0) return MOTION.v;
  MOTION.t = 1;
  try { const o = JSON.parse(localStorage.getItem("freyaFootball.ctrl") || "{}"); MOTION.v = o && o.motion != null && Number.isFinite(+o.motion) ? +o.motion : 1; }
  catch(e){ MOTION.v = 1; }
  return MOTION.v;
}
// the breath's vignette over the life view (A1.3, the match HUD's own .fp-vig look): only while your own legs carry you
// in the life world (a match or a drill draws its own), made the first time it is needed
const VIG = {el:null, o:-1};
function lifeVig(v){
  if (!VIG.el){
    if (v <= .002 || typeof document === "undefined" || !document.body) return;
    const w = document.createElement("div");
    w.className = "lf-vig";
    w.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2";
    w.innerHTML = '<div class="fp-vig"></div>';
    document.body.appendChild(w);
    VIG.el = w.firstChild;
  }
  const o = Math.round(v*200)/200;
  if (o !== VIG.o){ VIG.o = o; VIG.el.style.opacity = o.toFixed(3); }
}
export function fovStep(dt, own = true){
  const top = LOCO.prm && !OLD ? sprintSpeed(LOCO.prm, LOCO.fac && LOCO.fac.speed != null ? LOCO.fac : undefined) : 0;
  const fx = speedFx(top > 0 ? P.speed/top : P.sprint, LOCO.st ? LOCO.st.B : 100, lifeMotion(dt), dt, LIFE_FX);
  lifeVig(own && !OLD ? fx.vig*(.75 + .25*fx.pulse) : 0);
  const fovT = 74 + fx.fov;
  B.fov = Math.abs(fovT - B.fov) < .005 ? fovT : B.fov + (fovT - B.fov)*(1 - Math.exp(-5*dt));
  if (Math.abs(B.fov - B.fovSet) > .01 || (B.fov === fovT && B.fovSet !== fovT)) B.fovSet = B.fov;
}
