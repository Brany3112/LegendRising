// strike_trace.mjs: runs the game's own strike.js / control.js / actions.js on fixed cases and prints every number as
// the hex bits of the double; core_check_strike.cpp prints the same lines from the C++ port.
// Functions actions.js does not export (flickFly, flickLaunch, flickStep, knockOn, stepInOf, stepInSpot) are taken from
// its source text and run with stubs for the match bookkeeping they touch (event log, chains, rules).
// Usage: node strike_trace.mjs <worktree of bcs/integ>
import {readFileSync} from "node:fs";
const ROOT = process.argv[2] + "/LegendRising/js/life/football/";
const B = await import(ROOT + "ball.js");
const S = await import(ROOT + "strike.js");
const C = await import(ROOT + "control.js");
const A = await import(ROOT + "actions.js");
const D = await import(ROOT + "detmath.js");
const RNG = await import(ROOT + "rng.js");
const PS = await import(ROOT + "pitchspec.js");

const F = new Float64Array(1), U = new BigUint64Array(F.buffer);
const hex = x => { F[0] = x; return U[0].toString(16).padStart(16, "0"); };
const out = [];
const put = (name, x) => out.push(name + " " + hex(x));
const putV = (name, v) => { put(name + ".x", v.x); put(name + ".y", v.y); put(name + ".z", v.z); };

// a function of actions.js by its source text
const SRC = readFileSync(ROOT + "actions.js", "utf8");
function fnText(name){
  const i = SRC.indexOf("function " + name + "(");
  if (i < 0) throw new Error("no " + name);
  const j = SRC.indexOf("\n}\n", i);
  return SRC.slice(i, j + 2);
}
function build(name, deps){
  const keys = Object.keys(deps);
  return new Function(...keys, fnText(name) + "\nreturn " + name + ";")(...keys.map(k => deps[k]));
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const stub = () => {};
const FL_WORLD = B.createBallWorld({});
const flickFly = build("flickFly", {createBall: B.createBall, ballKick: B.ballKick, ballStep: B.ballStep, FL_WORLD, FL_H: 1/60});
const flickLaunch = build("flickLaunch", {flickFly, G: 9.81});
const flickStep = build("flickStep", {FLICK: A.FLICK, hypot: D.hypot, clamp, flickTop: A.flickTop, flickLaunch, ballKick: B.ballKick,
  logEv: () => ({}), touchSideOf: () => 'R', chainKeep: stub, onTouch: stub, refreshPred: stub});
const knockOn = build("knockOn", {KNOCK: A.KNOCK, BALL_R: 0.11, ballKick: B.ballKick, logEv: () => ({}), touchSideOf: () => 'R', chainKeep: stub,
  onTouch: stub, refreshPred: stub});
const stepInSpot = build("stepInSpot", {STEP_IN: A.STEP_IN, dirOf: PS.dirOf, hypot: D.hypot});
const stepInOf = build("stepInOf", {STEP_IN: A.STEP_IN, predAt: A.predAt, stepInSpot, dirOf: PS.dirOf, hypot: D.hypot, clamp, cos: D.cos,
  SI_B: {x: 0, y: 0, z: 0}});

const putL = (n, L) => { putV(n + ".v", L.v); putV(n + ".w", L.w); put(n + ".ok", L.ok ? 1 : 0); put(n + ".tFlight", L.tFlight); put(n + ".apex", L.apex);
  put(n + ".yaw", L.yaw); put(n + ".elev", L.elev); put(n + ".miss", L.miss); put(n + ".iters", L.iters); };

// 1. solveStrike
const P0 = {x: 0, y: 0.11, z: 0};
const reqs = [
  {from: P0, target: {x: 2, y: 1.2, z: -20}, speed: 26, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1},
  {from: P0, target: {x: -3, y: 0.4, z: -16}, speed: 28, contact: -1, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1, aero: 70},
  {from: P0, target: {x: 1, y: 2.2, z: -14}, speed: 15, contact: 1, curl: 0, foot: 'L', kind: 'chip', rollDecel: 1.1, curve: 80},
  {from: {x: 4, y: 0.11, z: 2}, target: {x: -2.5, y: 1.8, z: -22}, speed: 24, contact: 0, curl: 1.4, foot: 'R', kind: 'shot', rollDecel: 1.1, curve: 85, aero: 40},
  {from: P0, target: {x: 6, y: 0.11, z: -18}, speed: 14, contact: 0, curl: 0, foot: 'R', kind: 'pass', rollDecel: 1.1},
  {from: P0, target: {x: 0, y: 2, z: -60}, speed: 12, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1},
  {from: P0, target: {x: 0.01, y: 1, z: 0.02}, speed: 20, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1},
  {from: {x: 0, y: 0.6, z: 0}, target: {x: -4, y: 2.3, z: -25}, speed: 30, contact: 0, curl: -2.5, foot: 'L', kind: 'shot', rollDecel: 1.1, curve: 60},
];
reqs.forEach((r, i) => putL("solve" + i, S.solveStrike(r)));
// a warm start from a presolve of a nearby strike, run a flight at a time
reqs.forEach((r, i) => {
  if (i >= 6) return;
  const st = S.presolve(r);
  for (let k = 0; k < 40 && !st.done; k++){
    S.presolveStep(st, 1);
    put(`pre${i}.${k}.n`, st.n); put(`pre${i}.${k}.yaw`, st.yaw); put(`pre${i}.${k}.el`, st.el);
    if (st.J) st.J.forEach((j, q) => put(`pre${i}.${k}.J${q}`, j));
    if (k === 1){
      const w = S.presolveWarm(st);
      const r2 = Object.assign({}, r, {target: {x: r.target.x + 0.3, y: r.target.y + 0.1, z: r.target.z}});
      putL(`warm${i}`, S.solveStrike(r2, w));
    }
  }
  if (st.res) putL(`pre${i}.res`, st.res);
});

// 2. sigma, deviation, planShot
const ctxs = [
  {kind: 'shot', dist: 18, power01: 0.85, acc: 72, contact: 0, weakFoot: false, bodyAngleDeg: 20, plantErr: 0.05, ballState: 'rolling', pressure01: 0.3, composure: 60, bF: 0.9, eF: 0.95, finesse: false, firstTime: false, vIn: 0, power: 70},
  {kind: 'shot', dist: 25, power01: 0.97, acc: 40, contact: -1, weakFoot: true, bodyAngleDeg: 70, plantErr: 0.2, ballState: 'still', pressure01: 0.8, composure: 30, bF: 0.6, eF: 0.7, finesse: true, firstTime: true, vIn: 6, power: 50, scuff: true},
  {kind: 'chip', dist: 12, power01: 0.6, acc: 99, contact: 1, weakFoot: 'both', bodyAngleDeg: 0, plantErr: 0, ballState: 'bouncing', pressure01: 0, composure: 50, bF: 1, eF: 1, finesse: false, firstTime: false, vIn: 0, power: 80},
  {kind: 'pass', dist: 20, acc: 65, contact: 0, weakFoot: false, bodyAngleDeg: 10, plantErr: 0.1, ballState: 'still', pressure01: 0.5, composure: 70, bF: 1, eF: 1, firstTime: true, weightSigma: 0.04},
  {kind: 'header', dist: 10, acc: 55, contact: 0, pressure01: 0.2, composure: 50, bF: 0.8, eF: 1},
];
ctxs.forEach((c, i) => put(`sigma${i}`, S.sigmaOf(c)));
{
  const r = RNG.mulberry32(4242);
  ctxs.forEach((c, i) => { const d = S.deviation(c, r); put(`dev${i}.ex`, d.ex); put(`dev${i}.ey`, d.ey); put(`dev${i}.es`, d.es); });
  const plans = [[reqs[0], ctxs[0]], [reqs[1], ctxs[1]], [reqs[3], Object.assign({}, ctxs[0], {finesse: true})],
    [Object.assign({}, reqs[0], {speed: 30}), Object.assign({}, ctxs[0], {power01: 0.95, acc: 85})]];
  plans.forEach(([q, c], i) => {
    const pl = S.planShot(q, c, r);
    putL(`plan${i}`, pl.launch); putV(`plan${i}.aimed`, pl.aimed); put(`plan${i}.sigma`, pl.sigma); put(`plan${i}.quality`, pl.quality);
    put(`plan${i}.knuck`, pl.launch.knuck ? 1 : 0);
    if (pl.launch.knuck){ put(`plan${i}.kamp`, pl.launch.knuck.amp); put(`plan${i}.kfreq`, pl.launch.knuck.freq); put(`plan${i}.kphase`, pl.launch.knuck.phase); }
  });
  put("rng.after", r());
}
for (const p of [0, 20, 33, 44, 55, 77, 99, 110]){ put(`shotV(${p})`, S.shotVFull(p)); put(`accSigma(${p})`, S.accSigma(p)); }
put("shotSpeed", S.shotSpeed(77, 0.83, true, 0.97));
for (const d of [3, 12, 40]){ put(`passSpeed(${d})`, A.passSpeedFor(d, 9, 1.1)); put(`loft(${d})`, A.loftSpeedFor(d)); }

// 3. the meter
for (const d of [10, 20, 30]) for (const [tech, ak] of [[50, 1], [50, 0], [99, 0.5], [0, 1]]){
  const b = C.meterBand(d, tech, ak);
  for (const k of ["lo", "hi", "c", "glo", "ghi"]) put(`band(${d},${tech},${ak}).${k}`, b[k]);
}
{
  const band = C.meterBand(20, 50, 1);
  for (const p of [0.1, 0.5, 0.62, 0.66, 0.7, 0.75, 0.8, 0.86, 0.95]){ const g = C.shotGrade(p, band); out.push(`grade(${p}) ${g.grade}`); put(`grade(${p}).e`, g.e); put(`grade(${p}).over`, g.over ? 1 : 0); }
  const pb = C.passBand(14, 26, 70, 1); put("pass.lo", pb.lo); put("pass.hi", pb.hi); put("pass.c", pb.c);
}
for (const c of [0, 20, 33, 50, 55, 80, 99, 120, 200]){ put(`flickRate(${c})`, C.flickRate(c)); put(`flickFull(${c})`, C.flickFull({ctrl: c})); put(`curlSpin(${c})`, C.curlSpin(c)); }
put("tech", C.techniqueOf({aero: 60, curve: 0, ctrl: 77}));
for (const t of [0, 0.1, 0.18, 0.4, 0.85, 1.2]) put(`charge(${t})`, 1 - Math.pow(1 - Math.min(1, t/C.CN.SHOT_FULL), 2));
for (const [a, b] of [[3, 4], [0.1, 1e-3], [12.25, -7.5], [1e-8, 3e-9], [19.7, 0.33]]) put(`hypot(${a},${b})`, Math.hypot(a, b));

// 4. flick and knock-on
for (const s of [0, 20, 33, 55, 80, 99, 140]) put(`flickTop(${s})`, A.flickTop(s));
const flicks = [[0.8, 1, 0, 70, false], [0.5, 0, 0, 40, false], [1, -1, 0, 99, false], [0.6, 0, 1, 55, false], [0.9, 1, -1, 80, true], [0.3, 0, -1, 20, true]];
flicks.forEach(([p, fwd, side, str, first], i) => {
  const ball = B.createBall({x: 1.2, z: -3.4, rollDecel: 1.1});
  ball.p.y = i === 4 ? 0.3 : 0.11;
  const a = {m: {x: 1.2, z: -3.0, speed: 0.5}, scale: 1, intent: {speedCap: Infinity}, at: {strength: str}, foot: i === 5 ? 'L' : 'R', id: 1, team: 0};
  const ms = {ball, poss: {ctl: -1}, t: 0};
  const act = {t: first ? 0.1 : 0.25, tc: first ? -1 : 0.2, first, f: PS.dirOf(0.4), p, fwd, side, done: false};
  flickStep(ms, a, act, 1/60);
  putV(`flick${i}.v`, ball.v); putV(`flick${i}.w`, ball.w);
});
{
  const ball = B.createBall({x: 0, z: 0, rollDecel: 1.25});
  const a = {m: {speed: 5.1}, scale: 1.05, prm: {sprint: 8.4}, intent: {}, id: 1, team: 0};
  knockOn({ball, t: 0}, a, 0.6, -0.8);
  putV("knock.v", ball.v); putV("knock.w", ball.w);
}

// 5. the reach window and the step-in
{
  const cases = [
    {m: {x: 0, z: 0.5, yaw: 0, speed: 0, vx: 0, vz: 0}, bv: {x: 0, y: 0, z: 0}, tg: {x: 1, y: 1, z: -20}, foot: 'R'},
    {m: {x: -0.3, z: 0.9, yaw: 0.2, speed: 1.6, vx: -0.3, vz: -1.57}, bv: {x: -0.2, y: 0, z: -1.4}, tg: {x: -2, y: 0.8, z: -18}, foot: 'R'},
    {m: {x: 0.4, z: 0.7, yaw: -0.3, speed: 3.5, vx: 1.0, vz: -3.35}, bv: {x: 0.8, y: 0, z: -2.6}, tg: {x: 3, y: 1.5, z: -22}, foot: 'L'},
    {m: {x: 0.6, z: 0.2, yaw: 1.0, speed: 0.5, vx: -0.42, vz: -0.27}, bv: {x: 0, y: 0, z: 0}, tg: {x: 0, y: 1, z: -20}, foot: 'R'},
    {m: {x: 0, z: 0.5, yaw: 0, speed: 5, vx: 0, vz: -5}, bv: {x: 0, y: 0, z: -4.5}, tg: {x: 0, y: 1, z: -20}, foot: 'R'},
  ];
  cases.forEach((c, i) => {
    const ball = B.createBall({x: 0, z: 0, rollDecel: 1.1});
    B.ballKick(ball, c.bv, {x: 0, y: 0, z: 0}, {});
    const ms = {ball, bw: B.createBallWorld({}), pred: new Float32Array(360), predN: 0, predT: 0, t: 0, step: 0, restart: null};
    A.refreshPred(ms);
    ms.t = 1/60;
    const a = {m: c.m, scale: 1, foot: c.foot};
    const cs = A.canStrike(a, ball, undefined);
    put(`cs${i}.ok`, cs.ok ? 1 : 0); put(`cs${i}.tc`, cs.tc); out.push(`cs${i}.foot ${cs.foot}`); put(`cs${i}.ahead`, cs.ahead); put(`cs${i}.lat`, cs.lat);
    const si = stepInOf(ms, a, {kind: 'shot', target: c.tg}, cs);
    put(`si${i}`, si ? 1 : 0);
    if (si){ put(`si${i}.t`, si.t); put(`si${i}.x`, si.x); put(`si${i}.z`, si.z); put(`si${i}.fx`, si.fx); put(`si${i}.fz`, si.fz); }
  });
  for (const t of [0, 0.1, 0.2, 0.3, 0.45, 0.7, 1]) put(`root(${t})`, A.strikeRoot(t, 0.3));
}
console.log(out.join("\n"));
