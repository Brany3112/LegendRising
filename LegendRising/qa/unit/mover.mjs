// qa/unit/mover.mjs: js/life/mover.js under plain node.
// Owner: WP-0D, contract DESIGN 1.4.6; numbers 1.5.2; behaviour 3.1.5; acceptance 2.2 WP-0D and the movement rows of 4.1.
//
//   node qa/unit/mover.mjs      exits 1 on any failed check; writes qa/out/unit-mover.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMover, moverParams, moverStep, timeToPoint, gaitHint, sprintSpeed, gaitSpeed, boundsCollide} from "../../js/life/mover.js";
import {FRESH, stamFactors} from "../../js/life/stamina.js";
import {mulberry32} from "../../js/life/football/rng.js";
import {dirOf, wrapA} from "../../js/life/football/pitchspec.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-mover", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const H = 1/60, EAST = -Math.PI/2;      // yaw facing +X

// a straight sprint from standing: time to 95% of top speed, to 10 m and to 30 m (crossings interpolated in the step)
function sprintRun(pace, h = H){
  const prm = moverParams({pace, dribbling: 50}, "football"), m = createMover({yaw: EAST});
  let t = 0, t95 = null, t10 = null, t30 = null;
  while (t < 8){
    const x0 = m.x, v0 = m.speed;
    moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, h); t += h;
    if (t95 == null && m.speed >= 0.95*prm.sprint) t95 = t - h*(m.speed - 0.95*prm.sprint)/Math.max(1e-9, m.speed - v0);
    if (t10 == null && m.x >= 10) t10 = t - h*(m.x - 10)/(m.x - x0);
    if (t30 == null && m.x >= 30) t30 = t - h*(m.x - 30)/(m.x - x0);
  }
  return {prm, t95, t10, t30, top: m.speed};
}

// pace 50: 95% of top speed in 2.3 to 2.7 s, 10 m in 2.0 to 2.25 s, 30 m in 4.5 to 4.85 s; pace 99: 30 m in 3.95 to 4.3 s
{
  const a = sprintRun(50), b = sprintRun(99);
  check(a.t95 >= 2.3 && a.t95 <= 2.7, "pace 50: 95% of top speed in 2.3 to 2.7 s", r3(a.t95));
  check(a.t10 >= 2.0 && a.t10 <= 2.25, "pace 50: 10 m in 2.0 to 2.25 s", r3(a.t10));
  check(a.t30 >= 4.5 && a.t30 <= 4.85, "pace 50: 30 m in 4.5 to 4.85 s", r3(a.t30));
  check(b.t30 >= 3.95 && b.t30 <= 4.3, "pace 99: 30 m in 3.95 to 4.3 s", r3(b.t30));
  // the same run at other frame rates gives the same times (the acceleration is integrated exactly per step)
  const c = sprintRun(50, 1/30), d = sprintRun(50, 1/144);
  check(Math.abs(c.t30 - a.t30) < 0.02 && Math.abs(d.t30 - a.t30) < 0.02 && Math.abs(c.t10 - a.t10) < 0.02, "the run does not depend on the step length", [r3(c.t30), r3(a.t30), r3(d.t30)]);
}

// top speeds within 2% of 1.5.2 (walk, jog, run, sprint at pace 50 and 99; grip boots x1.03)
{
  let ok = true; const got = {};
  for (const pace of [50, 99]){
    const prm = moverParams({pace}, "football");
    const want = {walk: 1.5, jog: 3.4 + 0.008*pace, run: 5.0 + 0.012*pace, sprint: 6.6 + 0.028*pace};
    for (const gait of ['walk', 'jog', 'run', 'sprint']){
      const m = createMover({yaw: EAST});
      for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait}, prm, FRESH, H);
      got[`${gait}${pace}`] = r3(m.speed);
      if (Math.abs(m.speed/want[gait] - 1) > 0.02) ok = false;
    }
  }
  check(ok, "walk, jog, run and sprint top speeds within 2% at pace 50 and 99", got);
  const g = moverParams({pace: 50}, "football", {grip: true});
  check(Math.abs(g.sprint - 8.0*1.03) < 1e-9 && g.vmax === g.sprint, "grip boots: sprint x1.03", g.sprint);
}

// a 90 degree cut at sprint loses 35 to 55% of speed and is back to 95% within 2.6 s
function cut(pace, deg = 90){
  const prm = moverParams({pace, dribbling: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  const v0 = m.speed, a = EAST + deg*Math.PI/180, d = dirOf(a);
  let vmin = v0, t = 0, back = null, cutSeen = 0;
  while (t < 5){
    moverStep(m, {dx: d.x, dz: d.z, gait: 'sprint'}, prm, FRESH, H); t += H;
    if (m.cut > 0) cutSeen++;
    if (m.speed < vmin) vmin = m.speed;
    else if (back == null && vmin < 0.9*v0 && m.speed >= 0.95*v0) back = t;
  }
  return {v0, vmin, loss: 1 - vmin/v0, back, cutSeen, endDir: wrapA(m.heading - a)};
}
{
  const c = cut(50);
  check(c.loss >= 0.35 && c.loss <= 0.55, "pace 50: a 90 degree cut at sprint loses 35 to 55% of speed", r3(c.loss));
  check(c.back != null && c.back <= 2.6, "pace 50: back to 95% of the sprint within 2.6 s of the cut", r3(c.back));
  check(c.cutSeen > 0 && Math.abs(c.endDir) < 1e-6, "the cut plants (m.cut set) and ends on the new line");
  const small = cut(50, 25);
  check(small.loss < 0.08, "a 25 degree change of line at sprint costs little speed (no plant)", r3(small.loss));
}

// 1.5.2 and 3.1.5 step 3: every gait accelerates with a0*(1 - v/vmax)^0.8, vmax the top speed, up to its own target.
// Walk, jog and run are reached where the drive is still strong; only the sprint flattens out towards its end. From
// rest the closed form gives t(v) = (1 - (1 - v/vmax)^0.2)/(0.2 a0/vmax): the stepped mover matches it within a step.
{
  const rows = [], want = [];
  let ok = true;
  for (const [profile, gait] of [["football", "walk"], ["football", "jog"], ["football", "run"], ["football", "sprint"], ["life", "walk"], ["life", "run"]]){
    const prm = moverParams({pace: 50, dribbling: 50}, profile), m = createMover({yaw: EAST});
    const vt = gaitSpeed(prm, FRESH, gait), vmax = prm.vmax, k = prm.a0/vmax;
    const tForm = (1 - Math.pow(1 - 0.95*vt/vmax, 0.2))/(0.2*k);
    let t = 0;
    while (m.speed < 0.95*vt - 1e-12 && t < 10){ moverStep(m, {dx: 1, dz: 0, gait}, prm, FRESH, H); t += H; }
    // the stepped time is the first whole step at or past the formula's time
    if (!(t >= tForm - 1e-9 && t <= tForm + H + 1e-9)) ok = false;
    rows.push(`${profile} ${gait} ${r3(t)}`); want.push(r3(tForm));
    // and it gets all the way to the target in finite time (s^0.2 reaches 0 at 5/k seconds from rest, 5.5 s for a
    // pace-50 sprint; a walk, jog or run gets there well before)
    for (let i = 0; i < 400; i++) moverStep(m, {dx: 1, dz: 0, gait}, prm, FRESH, H);
    if (Math.abs(m.speed - vt) > 1e-9) ok = false;
  }
  check(ok, "every gait accelerates by a0*(1 - v/vmax)^0.8 up to its target (time to 95%, stepped vs formula)", {stepped: rows, formula: want});
  // pace 50: a jog from standing is at 3.8 m/s in about 0.6 s, a walk in about 0.2 s
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  let t = 0; while (m.speed < 0.95*prm.jog && t < 5){ moverStep(m, {dx: 1, dz: 0, gait: 'jog'}, prm, FRESH, H); t += H; }
  check(t > 0.5 && t < 0.75, "pace 50: 95% of the jog in 0.5 to 0.75 s", r3(t));
  // tired: the factor slows the drive and the top speed it aims at; a walk is still reached
  const tired = stamFactors({B: 0}, 0.6), m2 = createMover({yaw: EAST});
  let t2 = 0; while (m2.speed < 0.95*prm.jog && t2 < 5){ moverStep(m2, {dx: 1, dz: 0, gait: 'jog'}, prm, tired, H); t2 += H; }
  check(t2 > t && t2 < 2*t, "a tired body reaches the jog more slowly, but reaches it", r3(t2));
}

// 4.1: sprint to stop with no input (8 m/s) in 3.9 to 4.8 m, no instant stop
{
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  const x0 = m.x; let t = 0, maxDecel = 0;
  while (m.speed > 0 && t < 5){ const v = m.speed; moverStep(m, {dx: 0, dz: 0}, prm, FRESH, H); t += H; maxDecel = Math.max(maxDecel, (v - m.speed)/H); }
  check(m.x - x0 >= 3.9 && m.x - x0 <= 4.8 && t > 1 && maxDecel <= 7.5 + 1e-9, "sprint to stop with no input: 3.9 to 4.8 m, braking at most 7.5 m/s squared", {dist: r3(m.x - x0), t: r3(t)});
}

// 1.5.2 and 3.1.5 step 3: braking is a constant rate, 7.5 (football) and 12 (life) m/s squared, to a standstill:
// every gait stops in v/rate seconds (to the step) over v^2/(2 rate) metres, which is what the animation's stop
// planner (3.5.5) predicts from the same numbers. No slow tail at the end of a stop.
{
  const rows = [];
  let ok = true;
  for (const [profile, gait] of [["football", "sprint"], ["football", "jog"], ["football", "walk"], ["life", "walk"], ["life", "run"]]){
    const prm = moverParams({pace: 50}, profile), m = createMover({yaw: EAST});
    for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait}, prm, FRESH, H);
    const v0 = m.speed, x0 = m.x, tWant = v0/prm.brake, dWant = v0*v0/(2*prm.brake);
    let t = 0, steady = true;
    while (m.speed > 0 && t < 5){
      const v = m.speed;
      moverStep(m, {dx: 0, dz: 0}, prm, FRESH, H); t += H;
      if (m.speed > 0 && Math.abs((v - m.speed) - prm.brake*H) > 1e-9) steady = false;
    }
    const d = m.x - x0;
    if (!steady || t < tWant - 1e-9 || t > tWant + H + 1e-9 || Math.abs(d - dWant) > v0*H) ok = false;
    rows.push(`${profile} ${gait} ${r3(v0)} m/s: ${r3(t)} s (${r3(tWant)}), ${r3(d)} m (${r3(dWant)})`);
  }
  check(ok, "every gait brakes at the 1.5.2 rate to a standstill: v/rate seconds, v^2/(2 rate) metres", rows);
}

// 4.1: full-speed turn radius (pace 50) 7.5 to 9.5 m; a standing player turns quickly
{
  const prm = moverParams({pace: 50, dribbling: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  for (let i = 0; i < 120; i++){ const d = dirOf(m.heading + 0.5); moverStep(m, {dx: d.x, dz: d.z, gait: 'sprint'}, prm, FRESH, H); }
  const radius = m.speed/Math.abs(m.turnRate);
  check(radius >= 7.5 && radius <= 9.5 && m.speed > 7.9, "sprint turn radius 7.5 to 9.5 m (pace 50)", {radius: r3(radius), v: r3(m.speed)});
  // standing still, a wish straight behind: the body moves off the new way at once, never backwards along the old one
  const s = createMover({yaw: EAST});
  let wrong = 0;
  for (let i = 0; i < 30; i++){ moverStep(s, {dx: -1, dz: 0, gait: 'jog'}, prm, FRESH, H); if (s.x > 1e-9) wrong++; }
  check(wrong === 0 && s.x < -0.1, "from standing, a 180 degree wish moves off the new way straight away", r3(s.x));
  let tFace = 0; const s2 = createMover({yaw: EAST});
  while (Math.abs(wrapA(s2.yaw - Math.PI/2)) > 1e-6 && tFace < 2){ moverStep(s2, {dx: -1, dz: 0, gait: 'walk'}, prm, FRESH, H); tFace += H; }
  check(tFace <= 0.3, "a standing body turns round at up to 12 rad/s", r3(tFace));
  // a reversal while jogging stops first, then goes: no backwards drift through the turn
  const j = createMover({yaw: EAST});
  for (let i = 0; i < 300; i++) moverStep(j, {dx: 1, dz: 0, gait: 'jog'}, prm, FRESH, H);
  const xs = []; for (let i = 0; i < 120; i++){ moverStep(j, {dx: -1, dz: 0, gait: 'jog'}, prm, FRESH, H); xs.push(j.x); }
  const peak = Math.max(...xs), peakAt = xs.indexOf(peak);
  check(peakAt < 40 && j.vx < -1, "a reversal at a jog plants, stops and goes back", {overrun: r3(peak - xs[0]), steps: peakAt});
}

// backpedal and strafe caps while the facing is held; sprint only inside the cone
{
  const prm = moverParams({pace: 70}, "football");
  const at = (dx, dz, gait, face) => { const m = createMover({yaw: EAST}); for (let i = 0; i < 600; i++) moverStep(m, {dx, dz, gait, face}, prm, FRESH, H); return m; };
  const back = at(-1, 0, 'sprint', {x: 1, z: 0}), side = at(0, 1, 'sprint', {x: 1, z: 0}), diag = at(Math.SQRT1_2, Math.SQRT1_2, 'sprint', {x: 1, z: 0});
  check(Math.abs(back.speed - 3.2) < 1e-6 && Math.abs(back.yaw - EAST) < 1e-9, "backpedal capped at 3.2 m/s facing forward", r3(back.speed));
  check(Math.abs(side.speed - 4.0) < 1e-6, "strafe capped at 4.0 m/s", r3(side.speed));
  check(Math.abs(diag.speed - prm.run) < 1e-6 && diag.gait === 'run', "45 degrees off the facing is outside the 35 degree sprint cone: run", r3(diag.speed));
  const free = at(-1, 0, 'sprint', null);
  check(Math.abs(free.speed - prm.sprint) < 1e-6 && Math.abs(wrapA(free.yaw - Math.PI/2)) < 1e-9, "without a held facing the body turns and sprints", r3(free.speed));
  // the sprint cone and the backpedal and strafe caps are measured against a held facing; a body that faces where
  // it runs keeps its sprint through a turn, and the cut rule prices the angle
  const turning = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(turning, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  moverStep(turning, {dx: 0, dz: 1, gait: 'sprint'}, prm, FRESH, H);
  check(turning.gait === 'sprint' && turning.cut > 0 && Math.abs(turning.target - prm.sprint*prm.cutFloor) < 1e-9, "a free-facing 90 degree cut keeps the sprint as its base, times the cut factor", {gait: turning.gait, target: r3(turning.target)});
  const cap = at(1, 0, 'sprint', null); const cm = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(cm, {dx: 1, dz: 0, gait: 'sprint', speedCap: 4.4}, prm, FRESH, H);
  check(Math.abs(cm.speed - 4.4) < 1e-6 && cap.speed > 4.4, "speedCap caps the target", r3(cm.speed));
  const half = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(half, {dx: 0.5, dz: 0, gait: 'jog'}, prm, FRESH, H);
  check(Math.abs(half.speed - prm.jog/2) < 1e-6, "|d| below 1 is a throttle", r3(half.speed));
}

// stagger (1.5.2, 3.1.5 step 6): the speed is capped at 2.0 m/s for 0.35 s after a lost shoulder duel, from the
// first step of it, on the line the body was running; then the run resumes at the normal acceleration
{
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  const v0 = m.speed, x0 = m.x, hd0 = m.heading;
  m.stagger = prm.staggerT;
  let t = 0, maxIn = 0, steps = 0, line = true;
  while (m.stagger > 0 && t < 2){ moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H); t += H; steps++; maxIn = Math.max(maxIn, m.speed); if (Math.abs(wrapA(m.heading - hd0)) > 1e-9) line = false; }
  const dist = m.x - x0;
  check(v0 > 7.9 && maxIn <= prm.staggerCap + 1e-9 && Math.abs(t - prm.staggerT) < H/2 && dist <= prm.staggerCap*prm.staggerT + 1e-9 && line,
    "a stagger caps the speed at 2.0 m/s for 0.35 s from its first step, on the same line", {from: r3(v0), max: r3(maxIn), steps, metres: r3(dist)});
  let smooth = true, prev = m.speed;
  for (let i = 0; i < 90; i++){ moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H); if (m.speed - prev > prm.a0*H + 1e-9 || m.speed < prev - 1e-12) smooth = false; prev = m.speed; }
  check(m.stagger === 0 && m.speed > prm.staggerCap + 2 && smooth, "after the stagger the run picks up again at the normal acceleration", r3(m.speed));
  // a stagger from a walk changes nothing: the cap is a cap, not a shove
  const w = createMover({yaw: EAST});
  for (let i = 0; i < 300; i++) moverStep(w, {dx: 1, dz: 0, gait: 'walk'}, prm, FRESH, H);
  const vw = w.speed; w.stagger = prm.staggerT;
  moverStep(w, {dx: 1, dz: 0, gait: 'walk'}, prm, FRESH, H);
  check(Math.abs(w.speed - vw) < 1e-12, "a stagger below 2.0 m/s leaves the speed alone", r3(w.speed));
}

// never |v| > vmax + 1e-9 and never a step longer than vmax*h + 1e-3: random intents, profiles, factors, frame times,
// walls and pitch bounds
{
  const r = mulberry32(2026);
  let maxV = 0, maxD = 0, worstV = -Infinity, worstD = -Infinity, nan = false, steps = 0;
  for (let run = 0; run < 400; run++){
    const profile = r() < 0.7 ? "football" : "life";
    const prm = moverParams({pace: 1 + r()*98, dribbling: 1 + r()*98}, profile, {grip: r() < 0.3});
    if (r() < 0.3) prm.bounds = {hx: 57.5, hz: 38};
    const m = createMover({x: (r() - 0.5)*100, z: (r() - 0.5)*60, yaw: (r() - 0.5)*6});
    // a wall at x = 3 for bodies coming from its west side, and a floor that halves the z part of every move
    const wall = r() < 0.3 ? (mm, dx, dz) => ({dx: mm.x <= 3 && mm.x + dx > 3 ? 3 - mm.x : dx, dz: dz*0.5}) : null;
    const st = {B: r()*100};
    let intent = {dx: 0, dz: 0, gait: 'jog'};
    for (let i = 0; i < 600; i++){
      if (r() < 0.04){
        const a = r()*Math.PI*2, l = r() < 0.15 ? 0 : r() < 0.8 ? 1 : r();
        intent = {dx: Math.sin(a)*l, dz: Math.cos(a)*l, gait: ['walk', 'jog', 'run', 'sprint'][Math.floor(r()*4)],
          face: r() < 0.3 ? {x: r() - 0.5, z: r() - 0.5} : null, strafe: r() < 0.1, speedCap: r() < 0.1 ? r()*6 : Infinity};
      }
      if (r() < 0.01) m.stagger = prm.staggerT;
      const h = r() < 0.2 ? 1/30 : r() < 0.5 ? 1/144 : H;
      const x0 = m.x, z0 = m.z;
      moverStep(m, intent, prm, stamFactors(st, 0.6 + 0.4*r()), h, wall);
      const v = Math.hypot(m.vx, m.vz), dd = Math.hypot(m.x - x0, m.z - z0);
      worstV = Math.max(worstV, v - prm.vmax, m.speed - prm.vmax);
      worstD = Math.max(worstD, dd - (prm.vmax*h + 1e-3));
      maxV = Math.max(maxV, v); maxD = Math.max(maxD, dd);
      if (![m.x, m.z, m.vx, m.vz, m.speed, m.yaw, m.heading].every(Number.isFinite)) nan = true;
      if (prm.bounds && (Math.abs(m.x) > prm.bounds.hx + 1e-9 || Math.abs(m.z) > prm.bounds.hz + 1e-9)) nan = true;
      steps++;
    }
  }
  check(worstV <= 1e-9, `never |v| > vmax + 1e-9 (${steps} random steps)`, {worst: worstV});
  check(worstD <= 0, `never a displacement above vmax*h + 1e-3 per step (${steps} random steps)`, {worst: worstD});
  check(!nan, "every value finite and inside the bounds when bounds are set");
}

// pitch bounds through prm.bounds or boundsCollide; a wall takes the blocked velocity away
{
  const prm = moverParams({pace: 50}, "football"); prm.bounds = {hx: 57.5, hz: 38};
  const m = createMover({x: 55, yaw: EAST});
  for (let i = 0; i < 120; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  check(m.x === 57.5 && m.speed < 0.5, "run-off bounds stop a body at the edge", {x: m.x, v: r3(m.speed)});
  const p2 = moverParams({pace: 50}, "football"), m2 = createMover({x: 0, yaw: EAST}), wall = boundsCollide(2, 50);
  for (let i = 0; i < 120; i++) moverStep(m2, {dx: 1, dz: 0, gait: 'jog'}, p2, FRESH, H, wall);
  check(m2.x === 2 && m2.speed < 0.2, "a collide function stops a body at a wall", {x: m2.x, v: r3(m2.speed)});
}

// the world has the last word (3.1.5 step 7): whatever collide answers is where the body goes. A slide of the same
// length along a wall redirects the run, a push-out moves the body out and leaves it no speed back the way it came,
// and nothing the world does makes the body faster than it was running.
{
  const prm = moverParams({pace: 50}, "football");
  const jogN = () => { const m = createMover({yaw: 0}); for (let i = 0; i < 120; i++) moverStep(m, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H); return m; };
  const a = jogN(), x0 = a.x, z0 = a.z, v0 = a.speed;
  moverStep(a, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H, (mm, dx, dz) => ({dx: Math.hypot(dx, dz), dz: 0}));
  check(Math.abs(a.z - z0) < 1e-12 && Math.abs(a.x - x0 - v0*H) < 1e-9 && a.speed <= v0 + 1e-9,
    "an equal-length deflection from collide is where the body goes, and the run is never faster for it", {dx: r3(a.x - x0), dz: r3(a.z - z0), v: r3(a.speed)});
  const b = jogN(), z1 = b.z;
  moverStep(b, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H, () => ({dx: 0, dz: 0.2}));
  check(Math.abs(b.z - z1 - 0.2) < 1e-12 && b.speed < 1e-9 && b.vx === 0 && Math.abs(b.vz) < 1e-12,
    "a push-out longer than the move puts the body where collide says, with no speed back the way it came", {dz: r3(b.z - z1), v: r3(b.speed)});
  const c = jogN(), z2 = c.z, x2 = c.x, vc = c.speed, hc = c.heading;
  moverStep(c, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H, (mm, dx, dz) => ({dx: 0.3, dz}));
  check(Math.abs(c.x - x2 - 0.3) < 1e-12 && Math.abs(c.z - z2 + vc*H) < 1e-12 && Math.abs(c.speed - vc) < 1e-12 && c.heading === hc,
    "a sideways shove is applied in full and leaves the run as it was (it took nothing from it)", {dx: r3(c.x - x2), v: r3(c.speed)});
  const d = jogN(), z3 = d.z;
  moverStep(d, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H, () => null);
  check(d.z < z3 && Math.abs(d.speed - prm.jog) < 1e-6, "collide answering null lets the move through", r3(d.z - z3));
  const e = jogN(), z4 = e.z;
  moverStep(e, {dx: 0, dz: -1, gait: 'jog'}, prm, FRESH, H, () => ({dx: NaN, dz: Infinity}));
  check(e.z < z4 && [e.x, e.z, e.vx, e.vz, e.speed].every(Number.isFinite), "a non-finite answer from collide is ignored, not applied");
  // boundsCollide reuses one result object; prm.bounds is clamped inline with no closure
  const bc = boundsCollide(5, 5), m = createMover({x: 4.9});
  check(bc(m, 1, 0) === bc(m, 0, 1) && bc(m, 1, 0).dx === 5 - 4.9, "boundsCollide answers in one reused object");
}

// Sliding along a wall (3.1.5 step 7, as body() in core/move.js slides today): pushed into a wall at an angle, the
// body slides along it at what the push along it is worth (the gait speed times the cosine between the wish and the
// wall line), the same whether it ran into the wall or started against it; at a walk or a jog, for both profiles
{
  const wallAt1 = (mm, dx, dz) => ({dx: Math.min(dx, Math.max(0, 1 - mm.x)), dz});    // a wall at x = 1
  const rows = [];
  let ok = true;
  for (const [profile, gait] of [["life", "walk"], ["football", "walk"], ["football", "jog"], ["life", "run"]]){
    const prm = moverParams({pace: 50}, profile), vg = gaitSpeed(prm, FRESH, gait);
    for (const ang of [30, 45, 70, 85]){
      const a = ang*Math.PI/180, dx = Math.sin(a), dz = -Math.cos(a);    // ang degrees off the wall line, into it
      const got = [];
      for (const start of [2, 0]){
        const m = createMover({x: 1 - start, z: 0, yaw: EAST});
        let z0 = 0;
        for (let i = 0; i < 300; i++){ moverStep(m, {dx, dz, gait}, prm, FRESH, H, wallAt1); if (i === 179) z0 = m.z; }
        got.push({v: m.speed, slid: (z0 - m.z)/2, x: m.x});
      }
      const want = vg*Math.cos(a);
      for (const g of got) if (Math.abs(g.v - want) > 0.02*vg || Math.abs(g.slid - want) > 0.02*vg || g.x > 1 + 1e-12) ok = false;
      if (Math.abs(got[0].v - got[1].v) > 1e-6) ok = false;
      rows.push(`${profile} ${gait} ${ang}: ${r3(got[0].v)} / ${r3(got[1].v)} (${r3(want)})`);
    }
  }
  check(ok, "a wall slide goes at the push's worth along the wall, whichever way the body came to it", rows);
  // and at any frame rate
  const fr = [];
  for (const h of [1/30, 1/60, 1/144]){
    const prm = moverParams({pace: 50}, "life"), a = 60*Math.PI/180, m = createMover({x: -1, yaw: EAST});
    for (let t = 0; t < 4; t += h) moverStep(m, {dx: Math.sin(a), dz: -Math.cos(a), gait: 'walk'}, prm, FRESH, h, wallAt1);
    const z0 = m.z; let t1 = 0;
    for (; t1 < 1 - 1e-9; t1 += h) moverStep(m, {dx: Math.sin(a), dz: -Math.cos(a), gait: 'walk'}, prm, FRESH, h, wallAt1);
    fr.push((z0 - m.z)/t1);
  }
  check(Math.max(...fr) - Math.min(...fr) < 1e-6 && Math.abs(fr[0] - 1.7*0.5) < 1e-6, "the slide is the same at 30, 60 and 144 frames a second", fr.map(r3));
  // straight into the wall: no slide at all
  const prm = moverParams({pace: 50}, "life"), m = createMover({x: 0, yaw: EAST});
  for (let i = 0; i < 300; i++) moverStep(m, {dx: 1, dz: 0, gait: 'run'}, prm, FRESH, H, wallAt1);
  check(m.x === 1 && m.speed < 1e-9 && Math.abs(m.z) < 1e-12, "straight into a wall: stopped against it, no slide", {x: m.x, v: r3(m.speed)});
  // coasting into a wall at an angle with no input: the run's own momentum along it carries on and brakes at 7.5
  const fp = moverParams({pace: 50}, "football"), k = createMover({x: 0.9, yaw: EAST});
  const a45 = dirOf(EAST + Math.PI/4);
  for (let i = 0; i < 300; i++){ moverStep(k, {dx: a45.x, dz: a45.z, gait: 'jog'}, fp, FRESH, H); if (k.x > 0.9) k.x = 0.9; }
  k.x = 0.99;
  const vj = k.speed;
  moverStep(k, {dx: 0, dz: 0}, fp, FRESH, H, wallAt1);            // the coast reaches the wall in this step
  const v1 = k.speed;
  moverStep(k, {dx: 0, dz: 0}, fp, FRESH, H, wallAt1);
  check(Math.abs(v1 - (vj - fp.brake*H)*Math.SQRT1_2) < 1e-6 && Math.abs(k.speed - (v1 - fp.brake*H)) < 1e-9 && Math.abs(k.vx) < 1e-12,
    "coasting into a wall keeps the momentum along it, braking at the 1.5.2 rate", {before: r3(vj), along: r3(v1), next: r3(k.speed)});
  // the run-off bounds of an open pitch slide the same way: a sprint at 45 degrees into the touchline runs along it
  const bp = moverParams({pace: 50}, "football"); bp.bounds = {hx: 57.5, hz: 38};
  const e = createMover({x: 0, z: 36, yaw: EAST}), d45 = dirOf(EAST - Math.PI/4);
  for (let i = 0; i < 600; i++) moverStep(e, {dx: d45.x, dz: d45.z, gait: 'sprint'}, bp, FRESH, H);
  check(e.z === 38 && Math.abs(e.speed - bp.sprint*Math.SQRT1_2) < 0.02*bp.sprint, "a run into the pitch bounds at 45 degrees slides along them at the push's worth", {z: e.z, v: r3(e.speed)});
}

// LIFE profile: Shift runs at 5.2 m/s, sprint builds over 1.1 s of Shift forward once at running pace
{
  const prm = moverParams({pace: 50}, "life");
  const fwd = {x: 1, z: 0};
  const m = createMover({yaw: EAST});
  let t = 0, tRun = null, tSprint = null, tBuild = null;
  for (let i = 0; i < 300; i++){
    moverStep(m, {dx: 1, dz: 0, gait: 'sprint', face: fwd}, prm, FRESH, H); t += H;
    if (tBuild == null && m.sprintB > 0) tBuild = t;
    if (tSprint == null && m.sprintB >= 1) tSprint = t;
    if (tRun == null && m.speed >= 0.99*prm.run) tRun = t;
  }
  check(Math.abs(prm.walk - 1.7) < 1e-12 && Math.abs(prm.run - 5.2) < 1e-12 && Math.abs(prm.sprint - 7.6) < 1e-12, "life: walk 1.7, run 5.2, sprint 6.4 + 0.024 pace");
  check(tBuild != null && Math.abs(tSprint - tBuild - 1.1) < 2*H && Math.abs(m.speed - prm.sprint) < 1e-6, "life: the sprint builds over 1.1 s of Shift forward at running pace", {build: r3(tBuild), full: r3(tSprint), v: r3(m.speed)});
  const run = createMover({yaw: EAST});
  for (let i = 0; i < 300; i++) moverStep(run, {dx: 1, dz: 0, gait: 'run', face: fwd}, prm, FRESH, H);
  check(Math.abs(run.speed - 5.2) < 1e-6, "life: Shift run settles at 5.2 m/s", r3(run.speed));
  const back = createMover({yaw: EAST});
  for (let i = 0; i < 300; i++) moverStep(back, {dx: -1, dz: 0, gait: 'sprint', face: fwd}, prm, FRESH, H);
  check(Math.abs(back.speed - 0.8*5.2) < 1e-6 && back.sprintB === 0, "life: backwards at 0.8 of the target, never a sprint", r3(back.speed));
  const walk = createMover({yaw: EAST});
  let tw = 0; while (walk.speed < 0.95*1.7 && tw < 3){ moverStep(walk, {dx: 1, dz: 0, gait: 'walk', face: fwd}, prm, FRESH, H); tw += H; }
  check(tw > 0.1 && tw < 0.6, "life: a walk is up to speed in a fraction of a second, not instantly", r3(tw));
}

// timeToPoint agrees with stepping the mover
{
  const prm = moverParams({pace: 50, dribbling: 50}, "football");
  const errs = [];
  // step the mover at the point until it gets there (closest approach, interpolated inside the last step)
  const simTo = (m, tx, tz) => {
    let t = 0, dPrev = Infinity;
    while (t < 20){
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d < 0.02) return t;
      if (d > dPrev && dPrev < 0.5) return t - H;
      dPrev = d;
      const px = m.x, pz = m.z;
      moverStep(m, {dx: dx/d, dz: dz/d, gait: 'sprint'}, prm, FRESH, H); t += H;
      const sx = m.x - px, sz = m.z - pz, sl = Math.hypot(sx, sz);
      if (sl > 0 && sl >= d && (dx*sx + dz*sz)/sl > d*0.99) return t - H + H*d/sl;
    }
    return t;
  };
  // straight runs from rest
  for (const D of [5, 10, 20, 30, 45]){
    const est = timeToPoint(createMover({yaw: EAST}), prm, FRESH, D, 0), sim = simTo(createMover({yaw: EAST}), D, 0);
    errs.push(Math.abs(est - sim)/sim);
  }
  const straightErr = Math.max(...errs);
  check(straightErr < 0.01, "timeToPoint within 1% of the mover on straight runs from rest", r3(straightErr));
  // turning runs while moving (sprinting 8 m/s, or at 5 and 6.7 m/s): points ahead, to the side and behind
  const turnErr = [];
  for (const [steps, tx, tz] of [[400, 15, 15], [400, 0, 20], [400, -10, 5], [400, 25, -10], [400, 10, 4], [400, 30, 30],
    [60, 5, 5], [100, 0, 8], [400, -20, 0], [100, -6, 0]]){
    const mk = () => { const m = createMover({yaw: EAST}); for (let i = 0; i < steps; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H); return m; };
    const a = mk(), b = mk();
    const est = timeToPoint(a, prm, FRESH, a.x + tx, a.z + tz), sim = simTo(b, b.x + tx, b.z + tz);
    turnErr.push(Math.abs(est - sim)/sim);
  }
  check(Math.max(...turnErr) < 0.12, "timeToPoint within 12% of the mover on turning runs at speed", turnErr.map(r3));
  const tired = timeToPoint(createMover({yaw: EAST}), prm, stamFactors({B: 0}, 0.6), 30, 0);
  check(tired > timeToPoint(createMover({yaw: EAST}), prm, FRESH, 30, 0) + 0.5, "a tired body is slower to the same point", r3(tired));
  check(timeToPoint(createMover({yaw: EAST}), prm, FRESH, 0, 0, 0.2) === 0.2, "already there: just the reaction time");
}

// gaitHint and the step record
{
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  moverStep(m, {dx: 1, dz: 0, gait: 'jog'}, prm, FRESH, H);
  const g = gaitHint(m);
  check(g.v === m.speed && g.accel > 0 && g.turnRate === 0 && m.gait === 'jog', "gaitHint reports speed, turn rate and acceleration", g);
  const out = {};
  check(gaitHint(m, out) === out && out.v === m.speed, "gaitHint fills an object it is given");
  check(gaitSpeed(prm, FRESH, 'stand') === 0 && sprintSpeed(prm, FRESH) === prm.sprint, "gait speeds");
}

// purity (DESIGN 1.2, P): only relative imports of other pure modules
{
  const code = fs.readFileSync(path.join(ROOT, "js/life/mover.js"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const bad = [/Math\.random/, /\bS\./, /\bMT\b/, /\bA\./, /\bwindow\./, /\bdocument\./, /\bTHREE\b/].filter(re => re.test(code)).map(String);
  const imports = [...code.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map(x => x[1]);
  const okImports = imports.every(s => s === "./football/pitchspec.js" || s === "./stamina.js");
  check(!bad.length && okImports, "mover.js is pure and imports only pure modules", {bad, imports});
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-mover.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "mover: pass" : "mover: FAIL");
process.exit(res.ok ? 0 : 1);
