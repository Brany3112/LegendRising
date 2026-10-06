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

// 4.1: sprint to stop with no input (8 m/s) in 3.9 to 4.8 m, no instant stop
{
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  const x0 = m.x; let t = 0, maxDecel = 0;
  while (m.speed > 0 && t < 5){ const v = m.speed; moverStep(m, {dx: 0, dz: 0}, prm, FRESH, H); t += H; maxDecel = Math.max(maxDecel, (v - m.speed)/H); }
  check(m.x - x0 >= 3.9 && m.x - x0 <= 4.8 && t > 1 && maxDecel <= 7.5 + 1e-9, "sprint to stop with no input: 3.9 to 4.8 m, braking at most 7.5 m/s squared", {dist: r3(m.x - x0), t: r3(t)});
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
  const cap = at(1, 0, 'sprint', null); const cm = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(cm, {dx: 1, dz: 0, gait: 'sprint', speedCap: 4.4}, prm, FRESH, H);
  check(Math.abs(cm.speed - 4.4) < 1e-6 && cap.speed > 4.4, "speedCap caps the target", r3(cm.speed));
  const half = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(half, {dx: 0.5, dz: 0, gait: 'jog'}, prm, FRESH, H);
  check(Math.abs(half.speed - prm.jog/2) < 1e-6, "|d| below 1 is a throttle", r3(half.speed));
}

// stagger: speed capped at 2.0 for 0.35 s after a lost shoulder duel, then it recovers
{
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: EAST});
  for (let i = 0; i < 600; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H);
  m.stagger = prm.staggerT;
  let t = 0, min = m.speed, smooth = true, prev = m.speed;
  while (t < 1.5){ moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, FRESH, H); t += H; min = Math.min(min, m.speed); if (Math.abs(m.speed - prev) > 2*prm.plant*H + 1e-9) smooth = false; prev = m.speed; }
  check(min < 2.5 && m.stagger === 0 && m.speed > min + 1 && smooth, "a stagger knocks the speed down towards 2.0 m/s without a jump, then the run resumes", {min: r3(min), after: r3(m.speed)});
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
    const wall = r() < 0.3 ? (mm, dx, dz) => ({dx: mm.x + dx > 3 ? Math.min(dx, 3 - mm.x) : dx, dz: dz*0.5}) : null;
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
