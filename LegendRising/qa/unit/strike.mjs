// qa/unit/strike.mjs: js/life/football/strike.js under plain node.
// Owner: WP-C, contract DESIGN 1.4.11; numbers 1.5.1 and 1.5.3; behaviour 3.1.3; acceptance 2.3 WP-C (curl, flight
// time, deviation bands, contact elevations, fatigue and weak foot ratios, the solver's accuracy and its refusals).
//
//   node qa/unit/strike.mjs     exits 1 on any failed check; writes qa/out/unit-strike.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {STRIKE, solveStrike, deviation, sigmaOf, planShot, flightTime, idealPassSpeed, launchSpin, shotSpeed} from "../../js/life/football/strike.js";
import {BALL, createBall, createBallWorld, ballStep, ballKick, ballFlyTo} from "../../js/life/football/ball.js";
import {makePitch, dirOf, yawOf} from "../../js/life/football/pitchspec.js";
import {mulberry32, truncSd} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-strike", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r4 = v => Math.round(v*1e4)/1e4;
const DEG = Math.PI/180, H = 1/60, R = BALL.R;
const sd = a => { const m = a.reduce((s, x) => s + x, 0)/a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m)*(x - m), 0)/(a.length - 1)); };
const mean = a => a.reduce((s, x) => s + x, 0)/a.length;
const from0 = {x: 0, y: R, z: 0};

// where a launch actually crosses the vertical plane x = X (an independent flight on open ground)
function crossAt(launch, X, rollDecel = 1.1, aero = 0){
  const b = createBall();
  ballKick(b, launch.v, launch.w, {aero});
  b.rollDecel = rollDecel;
  return ballFlyTo(b, null, X, 0, 1, 0, 6, {});
}

/* ---------- curl (1.5.1 expected) ---------- */
{
  // a 25 m/s shot with 40 rad/s of sidespin (curve 88: 18 + 0.25*88 = 40) solved to cross 25 m at 1.5 m
  for (const [curve, spin, lo, hi] of [[88, 40, 2.6, 3.4], [48, 30, 1.9, 2.6]]){
    const s = solveStrike({from: from0, target: {x: 25, y: 1.5, z: 0}, speed: 25, contact: 0, curl: 1, foot: 'R', kind: 'shot', curve});
    const bend = Math.abs(25*s.v.z/s.v.x);
    const c = crossAt(s, 25);
    check(Math.abs(s.w.y - spin) < 1e-9 && s.ok && bend >= lo && bend <= hi, `a 25 m/s shot with ${spin} rad/s sidespin solved to cross 25 m at 1.5 m bends ${lo} to ${hi} m`, {bend: r4(bend), miss: r4(Math.hypot(c.z, c.y - 1.5))});
  }
  // a right foot's inside curl goes right to left: launched to the right of the target, finishing on it
  const s = solveStrike({from: from0, target: {x: 25, y: 1.5, z: 0}, speed: 25, contact: 0, curl: 1, foot: 'R', kind: 'shot', curve: 88});
  const c = crossAt(s, 25);
  check(s.v.z > 0 && Math.abs(c.z) < 0.05 && s.w.y > 0, "a right-footed curler starts right of the target (facing +X, right is +Z) and bends back onto it", {launchZ: r4(s.v.z), crossZ: r4(c.z)});
  const l = solveStrike({from: from0, target: {x: 25, y: 1.5, z: 0}, speed: 25, contact: 0, curl: 1, foot: 'L', kind: 'shot', curve: 88});
  check(l.v.z < 0 && l.w.y < 0, "a left foot's inside curl is the mirror image");
}

/* ---------- flight time (1.5.1 expected) ---------- */
{
  const s = solveStrike({from: from0, target: {x: 18, y: 1.2, z: 0}, speed: 26, contact: 0, curl: 0, foot: 'R', kind: 'shot'});
  const c = crossAt(s, 18);
  check(s.ok && c.t >= 0.76 && c.t <= 0.86 && Math.abs(c.t - s.tFlight) < 1e-9, "a 26 m/s shot to a point 18 m away at 1.2 m height arrives in 0.76 to 0.86 s", r4(c.t));
  const ft = flightTime('shot', 18, 26);
  check(Math.abs(ft - c.t)/c.t < 0.05, "flightTime('shot') agrees with the flight within 5%", {table: r4(ft), flight: r4(c.t)});
}

/* ---------- the solver ---------- */
{
  // reachable targets made by flying random launches and taking a point on the way up (or on the ground for rolls):
  // whatever the solver returns must land within 0.05 m of the target in at most 4 updates
  const r = mulberry32(99);
  let n = 0, okN = 0, worst = 0, maxIt = 0;
  const bad = [];
  for (let i = 0; i < 520; i++){
    const contact = i%5 === 0 ? -1 : i%5 === 1 || i%5 === 2 ? 0 : 1;
    const curl = i%3 === 0 ? 0 : -1 + 2*r(), foot = r() < 0.5 ? 'L' : 'R', curve = 99*r();
    const sp = contact > 0 ? 12 + 16*r() : 14 + 20*r();
    const el = contact < 0 ? (-1 + 7*r())*DEG : contact > 0 ? (15 + 20*r())*DEG : (1 + 25*r())*DEG;
    const roll = i%7 === 0 && contact <= 0;
    const yaw = 2*Math.PI*r(), d = dirOf(yaw), f = {x: -30 + 60*r(), y: R, z: -20 + 40*r()};
    const e = roll ? 0 : el;
    const b = createBall(f);
    const w = launchSpin(d.x, d.z, contact, roll ? 0 : curl, foot, curve);
    ballKick(b, {x: sp*Math.cos(e)*d.x, y: sp*Math.sin(e), z: sp*Math.cos(e)*d.z}, roll ? null : w, {});
    const fw = createBallWorld({});
    // the path up to the apex (or along the ground), one point taken at random
    const pts = [];
    for (let k = 0; k < 240; k++){
      ballStep(b, fw, H);
      if (!roll && (b.v.y <= 0 || b.grounded)) break;
      if (roll && b.v.x === 0 && b.v.z === 0) break;
      const dist = Math.hypot(b.p.x - f.x, b.p.z - f.z);
      if (dist > 6) pts.push({x: b.p.x, y: b.p.y, z: b.p.z});
    }
    if (!pts.length) continue;
    const tg = pts[Math.floor(r()*pts.length)];
    const s = solveStrike({from: f, target: tg, speed: sp, contact, curl: roll ? 0 : curl, foot, kind: roll ? 'pass' : 'shot', curve, rollDecel: 1.1});
    n++;
    // check the returned launch with an independent flight to the target's plane
    const ax = tg.x - f.x, az = tg.z - f.z, al = Math.hypot(ax, az);
    const fb = createBall(f); ballKick(fb, s.v, s.w, {});
    const o = ballFlyTo(fb, null, tg.x, tg.z, ax/al, az/al, 6, {});
    const miss = o.hit ? Math.hypot(o.x - tg.x, o.y - tg.y, o.z - tg.z) : Infinity;
    worst = Math.max(worst, miss); maxIt = Math.max(maxIt, s.iters);
    if (s.ok && miss <= 0.05 && s.iters <= 4) okN++;
    else if (bad.length < 5) bad.push({i, contact, sp: r4(sp), el: r4(el/DEG), curl: r4(curl), miss: r4(miss), it: s.iters, ok: s.ok});
  }
  check(n >= 350 && okN === n, "solveStrike hits reachable targets within 0.05 m in 4 updates or fewer (rolls, Low, Normal, High, curl)", {n, okN, worst: r4(worst), maxIt, bad});

  // unreachable ones are refused, with the closest launch at the requested speed
  const cases = [
    [{from: from0, target: {x: 60, y: 1, z: 0}, speed: 15, contact: 0, curl: 0, foot: 'R', kind: 'pass'}, "60 m at 15 m/s (falls short)"],
    [{from: from0, target: {x: 18, y: 2.0, z: 0}, speed: 26, contact: -1, curl: 0, foot: 'R', kind: 'shot'}, "Low contact at a 2 m high target (more than 6 degrees needed)"],
    [{from: from0, target: {x: 45, y: R, z: 0}, speed: 26, contact: 1, curl: 0, foot: 'R', kind: 'cross'}, "a cross to 45 m at 26 m/s (about 44 m is its longest)"],
    [{from: from0, target: {x: 18, y: 0.5, z: 0}, speed: 30, contact: 1, curl: 0, foot: 'R', kind: 'chip'}, "High contact at a low target (under 14 degrees needed)"],
    [{from: from0, target: {x: 30, y: R, z: 0}, speed: 5, contact: 0, curl: 0, foot: 'R', kind: 'pass'}, "a ground pass at 5 m/s to 30 m (stops short)"]
  ];
  for (const [req, label] of cases){
    const s = solveStrike(req), sp = Math.hypot(s.v.x, s.v.y, s.v.z);
    check(!s.ok && Math.abs(sp - req.speed) < 1e-9 && Number.isFinite(s.v.x), `refused: ${label}`, {ok: s.ok, elev: r4(s.elev/DEG)});
  }
  const low = solveStrike(cases[1][0]), high = solveStrike(cases[3][0]);
  const far = solveStrike(cases[2][0]), farB = createBall(from0);
  ballKick(farB, far.v, far.w, {});
  let land = 0;
  const fw = createBallWorld({onEvent: (type, d) => { if (type === 'bounce' && !land) land = d.x; }});
  for (let k = 0; k < 400 && !land; k++) ballStep(farB, fw, H);
  check(land > 42, "  the closest launch for a target out of range is the long one: it lands near its longest range", {elev: r4(far.elev/DEG), lands: r4(land)});
  check(Math.abs(low.elev - 6*DEG) < 1e-9 && Math.abs(high.elev - 14*DEG) < 1e-9, "  Low stops at 6 degrees and High at 14: the ball stays low or flies over by physics", [r4(low.elev/DEG), r4(high.elev/DEG)]);
  // and Low stays under 1.5 m at 11 m
  const lo11 = solveStrike({from: from0, target: {x: 11, y: 2.4, z: 0}, speed: 30, contact: -1, curl: 0, foot: 'R', kind: 'shot'});
  const c11 = crossAt(lo11, 11);
  check(c11.hit && c11.y < 1.5, "a Low shot aimed high is still under 1.5 m at 11 m", r4(c11.y));
}

/* ---------- deviation (1.5.3 expected at 18 m) ---------- */
const baseCtx = {kind: 'shot', dist: 18, power01: 0.8, contact: 0, weakFoot: false, bodyAngleDeg: 0, plantErr: 0, ballState: 'still',
  pressure01: 0, composure: 50, bF: 1, eF: 1, finesse: false, firstTime: false, vIn: 0, power: 60};
const req18 = {from: from0, target: {x: 18, y: 1.2, z: 0}, speed: shotSpeed(60, 0.8), contact: 0, curl: 0, foot: 'R', kind: 'shot'};
function sample(ctx, seed, N = 2000, fly = false){
  const r = mulberry32(seed), ex = [], ey = [], el = [], cz = [], cy = [];
  const req = Object.assign({}, req18, {contact: ctx.contact});
  let beyond = 0, notOk = 0;
  for (let i = 0; i < N; i++){
    const p = planShot(req, ctx, r);
    ex.push(p.aimed.z - req18.target.z); ey.push(p.aimed.y - req18.target.y); el.push(p.launch.elev);
    const s = sigmaOf(Object.assign({}, ctx, {dist: 18}))*18, kv = ctx.contact > 0 ? 1.2 : 0.8;
    if (Math.abs(p.dev.ex) > 2.5*s + 1e-9 || Math.abs(p.dev.ey) > 2.5*s*kv + 1e-9) beyond++;
    if (fly){
      const c = crossAt(p.launch, 18);
      if (!c.hit) notOk++; else { cz.push(c.z); cy.push(c.y); }
    }
  }
  return {ex, ey, el, cz, cy, beyond, notOk};
}
{
  for (const [acc, lo, hi] of [[90, 0.18, 0.24], [50, 0.55, 0.66], [20, 0.88, 1.02]]){
    const S = sample(Object.assign({}, baseCtx, {acc}), 1000 + acc, 2000, true);
    const sAim = sd(S.ex), sBall = sd(S.cz);
    check(sAim >= lo && sAim <= hi && sBall >= lo && sBall <= hi, `accuracy ${acc}: lateral sigma at 18 m within ${lo} to ${hi} m (aim point and real ball)`, {aim: r4(sAim), ball: r4(sBall), nominal: r4(sigmaOf(Object.assign({}, baseCtx, {acc}))*18)});
    check(S.beyond === 0, `  no sample beyond 2.5 sigma (accuracy ${acc})`, S.beyond);
  }
  const S30 = sample(Object.assign({}, baseCtx, {acc: 30}), 30, 2000, true);
  const cz = mean(S30.cz), cy = mean(S30.cy) - 1.2;
  check(Math.hypot(cz, cy) <= 0.5 && S30.notOk === 0, "accuracy 30: the centroid of where the balls go is within 0.5 m of the aim", {dz: r4(cz), dy: r4(cy)});
  // Low versus High contact: mean launch elevation differs by at least 6 degrees
  const SL = sample(Object.assign({}, baseCtx, {acc: 60, contact: -1}), 7, 500), SH = sample(Object.assign({}, baseCtx, {acc: 60, contact: 1}), 7, 500);
  const dEl = (mean(SH.el) - mean(SL.el))/DEG;
  check(dEl >= 6, "contact Low versus High: mean launch elevation differs by at least 6 degrees", r4(dEl));
  // fatigue and the weak foot, paired on the same seed
  const fresh = sample(Object.assign({}, baseCtx, {acc: 50}), 77, 2000), tired = sample(Object.assign({}, baseCtx, {acc: 50, bF: 0, eF: 0.6}), 77, 2000);
  const weak = sample(Object.assign({}, baseCtx, {acc: 50, weakFoot: true}), 77, 2000), both = sample(Object.assign({}, baseCtx, {acc: 50, weakFoot: 'both'}), 77, 2000);
  const rt = sd(tired.ex)/sd(fresh.ex), rw = sd(weak.ex)/sd(fresh.ex), rb = sd(both.ex)/sd(fresh.ex);
  check(rt >= 1.3 && rt <= 1.6, "a tired striker (bF 0, eF 0.6) against fresh: sigma ratio 1.3 to 1.6", r4(rt));
  check(rw >= 1.3 && rw <= 1.4, "the weak foot against the strong: sigma ratio 1.3 to 1.4", r4(rw));
  check(Math.abs(rb - 1.1) < 0.02, "  a two-footed player's other foot: 1.1", r4(rb));
  // the other terms move the spread the way 1.5.3 says
  const sOf = o => sigmaOf(Object.assign({}, baseCtx, {acc: 50}, o));
  const s0 = sOf({});
  check(Math.abs(sOf({power01: 1})/s0 - (0.6 + 0.8)*(1 + 3*0.08)/(0.6 + 0.8*0.64)) < 1e-9, "over-hitting past 0.92 adds 1 + 3(p - 0.92) on top of the power term");
  check(Math.abs(sOf({pressure01: 1, composure: 0})/s0 - 1.4) < 1e-9 && Math.abs(sOf({pressure01: 1, composure: 150})/s0 - 1) < 1e-9, "pressure: 1 + 0.4 pressure (1 - composure/150)");
  check(Math.abs(sOf({ballState: 'volley'})/s0 - 1.5) < 1e-9 && Math.abs(sOf({ballState: 'bouncing'})/s0 - 1.25) < 1e-9 && Math.abs(sOf({ballState: 'rolling'})/s0 - 1.1) < 1e-9, "ball state: rolling 1.1, bouncing 1.25, volley 1.5");
  check(Math.abs(sOf({plantErr: 0.3})/s0 - 2.5) < 1e-9 && Math.abs(sOf({bodyAngleDeg: 90})/s0 - 1.6) < 1e-9, "body: 1 + 1.5|plantErr|/0.3 + max(0, angle - 45)/45 x 0.6");
  check(Math.abs(sOf({firstTime: true, vIn: 15})/s0 - 1.5) < 1e-9 && Math.abs(sOf({finesse: true})/s0 - 0.85) < 1e-9, "first time 1 + |vIn|/30, finesse x0.85");
  // passes
  const pass = acc => sigmaOf({kind: 'pass', acc, bF: 1, eF: 1});
  check(Math.abs(pass(50) - (0.006 + 0.05*Math.pow(0.5, 1.4))) < 1e-12 && Math.abs(sigmaOf({kind: 'pass', acc: 50, firstTime: true})/pass(50) - 1.3) < 1e-9, "pass deviation (0.006 + 0.05(1 - pacc/100)^1.4), x1.3 first time");
  check(pass(30)/pass(90) >= 3, "a bad passer's lateral error is at least 3 times an accurate one's (4.4)", r4(pass(30)/pass(90)));
  // speed spread: 4%(1 - power/150), truncated
  const r = mulberry32(5), es = [];
  for (let i = 0; i < 2000; i++) es.push(deviation(Object.assign({}, baseCtx, {acc: 50, power: 60}), r).es);
  const want = 0.04*(1 - 60/150)*truncSd(2.5);
  check(Math.abs(sd(es) - want)/want < 0.08 && es.every(e => Math.abs(e - 1) <= 2.5*0.04*(1 - 60/150) + 1e-12), "shot speed spread 4%(1 - power/150), never beyond 2.5 sigma", {sd: r4(sd(es)), want: r4(want)});
}

/* ---------- aiming top right with poor accuracy (brief 8, QA 4.3) ---------- */
{
  const spec = makePitch();
  const from = {x: 34.5, y: R, z: 0}, target = {x: 52.44, y: 2.15, z: 3.3};
  const r = mulberry32(31);
  const tally = {goal: 0, wide: 0, high: 0, lower: 0, central: 0, frame: 0};
  let maxNorm = 0;
  for (let i = 0; i < 400; i++){
    const req = {from, target, speed: shotSpeed(70, 0.8), contact: 0, curl: 0, foot: 'R', kind: 'shot'};
    const p = planShot(req, Object.assign({}, baseCtx, {acc: 30, dist: 18}), r);
    const s = p.sigma*18;
    maxNorm = Math.max(maxNorm, Math.abs(p.dev.ex)/s, Math.abs(p.dev.ey)/(0.8*s));
    if (p.aimed.y < target.y - 0.1) tally.lower++;
    if (p.aimed.z < target.z - 0.3) tally.central++;
    const evs = [];
    const bw = createBallWorld({spec, onEvent: (t, d) => evs.push([t, d])});
    const b = createBall(from);
    ballKick(b, p.launch.v, p.launch.w, {knuck: p.launch.knuck});
    for (let k = 0; k < 120; k++) ballStep(b, bw, H);
    if (evs.some(e => e[0] === 'post' || e[0] === 'bar')) tally.frame++;
    const g = evs.find(e => e[0] === 'goal' || e[0] === 'out');
    if (g && g[0] === 'goal') tally.goal++;
    else if (g && g[1].y >= 2.44) tally.high++;
    else if (g) tally.wide++;
  }
  check(tally.goal > 0 && tally.wide > 0 && tally.high > 0 && tally.lower > 0 && tally.central > 0 && tally.frame > 0 && maxNorm <= 2.5 + 1e-9,
    "aiming top right at accuracy 30: goals, wide, high, lower, more central and woodwork, all within 2.5 sigma of the aim", Object.assign({maxSigma: r4(maxNorm)}, tally));
}

/* ---------- knuckle, determinism ---------- */
{
  const req = {from: from0, target: {x: 25, y: 1.5, z: 0}, speed: 30, contact: 0, curl: 0, foot: 'R', kind: 'shot'};
  const ctx = Object.assign({}, baseCtx, {acc: 70, power01: 0.95, dist: 25});
  const p = planShot(req, ctx, mulberry32(3));
  const k = p.launch.knuck;
  check(k && k.amp >= 1.2*0.95 - 1e-9 && k.amp <= 2.6*0.95 + 1e-9 && k.freq >= 5 && k.freq <= 9, "a hard, spinless, Normal-contact shot over 24 m/s at power over 0.72 knuckles: amplitude U(1.2, 2.6) x p, frequency U(5, 9)", k);
  check(planShot(req, Object.assign({}, ctx, {finesse: true}), mulberry32(3)).launch.knuck === null, "  not with finesse");
  check(planShot(Object.assign({}, req, {contact: 1}), Object.assign({}, ctx, {contact: 1}), mulberry32(3)).launch.knuck === null, "  not with High contact");
  check(planShot(Object.assign({}, req, {speed: 20}), ctx, mulberry32(3)).launch.knuck === null, "  not under 24 m/s");
  check(planShot(req, Object.assign({}, ctx, {power01: 0.6}), mulberry32(3)).launch.knuck === null, "  not at power 0.72 or less");
  const a = planShot(req, ctx, mulberry32(9)), b = planShot(req, ctx, mulberry32(9));
  check(JSON.stringify(a) === JSON.stringify(b), "the same seed plans the same shot");
}

/* ---------- AI closed forms ---------- */
{
  // idealPassSpeed: the pass arrives at the requested speed
  let worst = 0;
  for (const d of [8, 15, 25, 40]) for (const roll of [1.1, 1.4]){
    const v0 = idealPassSpeed(d, 9, roll);
    const b = createBall({rollDecel: roll}); ballKick(b, {x: v0, y: 0, z: 0}, null, {});
    const w = createBallWorld({});
    let px = 0, pv = v0;
    while (b.p.x < d){ px = b.p.x; pv = b.v.x; ballStep(b, w, H); }
    const v = pv + (b.v.x - pv)*(d - px)/(b.p.x - px);
    worst = Math.max(worst, Math.abs(v - 9));
  }
  check(worst <= 0.25, "idealPassSpeed: the pass arrives at 9 m/s (8 to 40 m, rolls 1.1 and 1.4)", r4(worst));
  // ground flight time against the integrator
  const b = createBall(); ballKick(b, {x: 12, y: 0, z: 0}, null, {});
  const w = createBallWorld({});
  let t = 0; while (b.p.x < 20){ ballStep(b, w, H); t += H; }
  const ft = flightTime('pass', 20, 12);
  check(Math.abs(ft - t) < 0.03, "flightTime('pass') is the ground roll's own time", {table: r4(ft), sim: r4(t)});
  check(flightTime('pass', 80, 10) === Infinity && flightTime('cross', 200, 15) === Infinity, "out of range is Infinity");
  // lofted: a High-contact ball solved to land 30 m away takes the table's time
  for (const [d, v] of [[30, 20], [20, 16], [40, 26]]){
    const s = solveStrike({from: from0, target: {x: d, y: R, z: 0}, speed: v, contact: 1, curl: 0, foot: 'R', kind: 'cross'});
    const tt = flightTime('cross', d, v);
    check(s.ok && Math.abs(tt - s.tFlight)/s.tFlight < 0.05, `flightTime('cross', ${d}, ${v}) agrees with the solved flight within 5%`, {table: r4(tt), flight: r4(s.tFlight)});
  }
  const th = flightTime('throw', 15, 14);
  check(th > 0.8 && th < 2.0, "a throw-in's flight from 2 m is tabulated too", r4(th));
}

/* ---------- small things ---------- */
{
  check(Math.abs(shotSpeed(50, 1) - 26.5) < 1e-9 && Math.abs(shotSpeed(99, 1) - 34.83) < 1e-9, "shot speed (18 + 0.17 power) p: power 50 26.5 m/s, 99 34.8 m/s");
  const w = launchSpin(1, 0, 1, 0, 'R'), wl = launchSpin(1, 0, -1, 0, 'R');
  check(w.z === 20 && wl.z === -15 && w.y === 0, "High contact is 20 rad/s of backspin, Low 15 of topspin (about the right-hand axis of travel)");
  const s = solveStrike({from: {x: 0, y: R, z: 0}, target: {x: 0.01, y: R, z: 0}, speed: 5, contact: 0, curl: 0, foot: 'R', kind: 'pass'});
  check(s.ok && Number.isFinite(s.v.x), "a target at the ball's own spot returns a finite launch");
  check(Object.isFrozen(STRIKE), "STRIKE is frozen");
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-strike.json"), JSON.stringify(res, null, 1));
console.log(`unit/strike: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
