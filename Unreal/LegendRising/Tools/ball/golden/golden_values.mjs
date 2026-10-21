// golden_values.mjs: computes the golden numbers of Source/LegendRising/Tests/LRBallTests.cpp by running the game's own
// JS (bcs/integ) in Node, and prints them as C++ constants (the test file's "GOLDEN" block). Every number is printed
// with 17 significant digits, which reads back as the very same double.
// Usage: node golden_values.mjs <worktree of bcs/integ>
import {readFileSync} from "node:fs";
const ROOT = process.argv[2] + "/LegendRising/js/life/football/";
const B = await import(ROOT + "ball.js");
const S = await import(ROOT + "strike.js");
const C = await import(ROOT + "control.js");
const A = await import(ROOT + "actions.js");
const D = await import(ROOT + "detmath.js");
const RNG = await import(ROOT + "rng.js");
const PS = await import(ROOT + "pitchspec.js");

const lines = [];
const num = x => Number.isFinite(x) ? x.toPrecision(17) : (x > 0 ? "INFINITY" : "-INFINITY");
const def = (name, x) => lines.push(`\tconstexpr double ${name} = ${num(x)};`);
const vec = (name, v) => { def(name + "X", v.x); def(name + "Y", v.y); def(name + "Z", v.z); };
const comment = s => lines.push(`\t// ${s}`);

// 1. a ball rolled at 8 m/s along the sim's -Z (Unreal's forward), after 1 s (60 steps of 1/60)
{
  const b = B.createBall({x: 0, z: 0, rollDecel: 1.1}), w = B.createBallWorld({});
  B.ballKick(b, {x: 0, y: 0, z: -8}, {x: 0, y: 0, z: 0}, {agent: 1, team: 0, kind: 'pass', t: 0});
  for (let i = 0; i < 60; i++) B.ballStep(b, w, 1/60);
  comment("ROLL: createBall({x: 0, z: 0, rollDecel: 1.1}), ballKick v (0, 0, -8), 60 steps of 1/60 s");
  vec("RollP", b.p); vec("RollV", b.v); vec("RollW", b.w); def("RollGrounded", b.grounded ? 1 : 0);
}
// 2. a struck, spun ball after 1 s in the air and on the ground
{
  const b = B.createBall({x: 1, z: -2, rollDecel: 1.3}), w = B.createBallWorld({});
  B.ballKick(b, {x: 3, y: 9, z: -25}, {x: 15, y: 20, z: -5}, {agent: 2, team: 1, kind: 'shot', aero: 60, t: 0});
  for (let i = 0; i < 60; i++) B.ballStep(b, w, 1/60);
  comment("FLIGHT: createBall({x: 1, z: -2, rollDecel: 1.3}), ballKick v (3, 9, -25) w (15, 20, -5) aero 60, 60 steps");
  vec("FlightP", b.p); vec("FlightV", b.v); vec("FlightW", b.w);
  for (let i = 0; i < 60; i++) B.ballStep(b, w, 1/60);
  comment("  ... and 60 steps more (it has bounced and is in the air again)");
  vec("Flight2P", b.p); vec("Flight2V", b.v); vec("Flight2W", b.w); def("Flight2Grounded", b.grounded ? 1 : 0);
}
// 3. solved shots
{
  const L = S.solveStrike({from: {x: 0, y: 0.11, z: 0}, target: {x: 2, y: 1.2, z: -20}, speed: 26, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1});
  comment("SOLVE: solveStrike from (0, 0.11, 0) to (2, 1.2, -20), 26 m/s, Normal contact, no curl, right foot");
  vec("SolveV", L.v); vec("SolveW", L.w); def("SolveYaw", L.yaw); def("SolveElev", L.elev); def("SolveTFlight", L.tFlight); def("SolveApex", L.apex);
  def("SolveMiss", L.miss); def("SolveOk", L.ok ? 1 : 0); def("SolveIters", L.iters);
  const L2 = S.solveStrike({from: {x: 4, y: 0.11, z: 2}, target: {x: -2.5, y: 1.8, z: -22}, speed: 24, contact: 0, curl: 1.4, foot: 'R', kind: 'shot', rollDecel: 1.1, curve: 85, aero: 40});
  comment("CURL: solveStrike from (4, 0.11, 2) to (-2.5, 1.8, -22), 24 m/s, curl 1.4, curve 85, aero 40");
  vec("CurlV", L2.v); vec("CurlW", L2.w); def("CurlMiss", L2.miss);
  const L3 = S.solveStrike({from: {x: 0, y: 0.11, z: 0}, target: {x: -3, y: 0.4, z: -16}, speed: 28, contact: -1, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1, aero: 70});
  comment("DRIVEN: solveStrike to (-3, 0.4, -16), 28 m/s, Low contact (at most 6 degrees: out of reach, ok false)");
  vec("DrivenV", L3.v); def("DrivenElev", L3.elev); def("DrivenOk", L3.ok ? 1 : 0);
  const r = RNG.mulberry32(7);
  const ctx = {kind: 'shot', dist: 18, power01: 0.85, acc: 72, contact: 0, weakFoot: false, bodyAngleDeg: 20, plantErr: 0.05, ballState: 'rolling', pressure01: 0.3, composure: 60, bF: 0.9, eF: 0.95, finesse: false, firstTime: false, vIn: 0, power: 70};
  const pl = S.planShot({from: {x: 0, y: 0.11, z: 0}, target: {x: 2, y: 1.2, z: -20}, speed: 30, contact: 0, curl: 0, foot: 'R', kind: 'shot', rollDecel: 1.1}, Object.assign({}, ctx, {power01: 0.95, acc: 85}), r);
  comment("PLAN: planShot of that shot at 30 m/s, power 0.95, accuracy 85, mulberry32(7): deviation, solve, knuckle");
  vec("PlanV", pl.launch.v); vec("PlanAimed", pl.aimed); def("PlanSigma", pl.sigma); def("PlanKnuck", pl.launch.knuck ? 1 : 0);
  if (pl.launch.knuck){ def("PlanKAmp", pl.launch.knuck.amp); def("PlanKFreq", pl.launch.knuck.freq); def("PlanKPhase", pl.launch.knuck.phase); }
  comment("SHOT SPEED: shotSpeed(power 77, p 0.83, strike boots, stamina 0.97)");
  def("ShotSpeed", S.shotSpeed(77, 0.83, true, 0.97));
}
// 4. the meter
{
  comment("METER: meterBand(d, Technique 50, assists on) at 10, 20, 30 m");
  for (const d of [10, 20, 30]){
    const b = C.meterBand(d, 50, 1);
    def(`Band${d}Lo`, b.lo); def(`Band${d}Hi`, b.hi); def(`Band${d}C`, b.c); def(`Band${d}GLo`, b.glo); def(`Band${d}GHi`, b.ghi);
  }
  comment("METER, assists off, Technique 99, at 20 m");
  { const b = C.meterBand(20, 99, 0); def("Band20OffLo", b.lo); def("Band20OffHi", b.hi); def("Band20OffGLo", b.glo); def("Band20OffGHi", b.ghi); }
  comment("GRADES at 20 m (assists on): p 0.5 scuff, 0.62 good, 0.72 perfect, 0.86 scuff (over)");
  const band = C.meterBand(20, 50, 1);
  for (const [n, p] of [["G050", 0.5], ["G062", 0.62], ["G072", 0.72], ["G086", 0.86]]){
    const g = C.shotGrade(p, band); def(n + "E", g.e); lines.push(`\tconstexpr int ${n}Grade = ${g.grade === "perfect" ? 0 : g.grade === "good" ? 1 : 2};`); def(n + "Over", g.over ? 1 : 0);
  }
  comment("FLICK BAR: flickFull (s) at Ball Control 33, 55, 99");
  for (const c of [33, 55, 99]) def(`FlickFull${c}`, C.flickFull({ctrl: c}));
}
// 5. the flick and the knock-on (actions.js internals, run from their source text)
{
  const SRC = readFileSync(ROOT + "actions.js", "utf8");
  const fnText = name => { const i = SRC.indexOf("function " + name + "("), j = SRC.indexOf("\n}\n", i); return SRC.slice(i, j + 2); };
  const build = (name, deps) => { const k = Object.keys(deps); return new Function(...k, fnText(name) + "\nreturn " + name + ";")(...k.map(q => deps[q])); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, stub = () => {};
  const flickFly = build("flickFly", {createBall: B.createBall, ballKick: B.ballKick, ballStep: B.ballStep, FL_WORLD: B.createBallWorld({}), FL_H: 1/60});
  const flickLaunch = build("flickLaunch", {flickFly, G: 9.81});
  const flickStep = build("flickStep", {FLICK: A.FLICK, hypot: D.hypot, clamp, flickTop: A.flickTop, flickLaunch, ballKick: B.ballKick,
    logEv: () => ({}), touchSideOf: () => 'R', chainKeep: stub, onTouch: stub, refreshPred: stub});
  const knockOn = build("knockOn", {KNOCK: A.KNOCK, BALL_R: 0.11, ballKick: B.ballKick, logEv: () => ({}), touchSideOf: () => 'R', chainKeep: stub, onTouch: stub, refreshPred: stub});
  const ball = B.createBall({x: 1.2, z: -3.4, rollDecel: 1.1});
  const a = {m: {x: 1.2, z: -3.0, speed: 0.5}, scale: 1, intent: {speedCap: Infinity}, at: {strength: 70}, foot: 'R', id: 1, team: 0};
  flickStep({ball, poss: {ctl: -1}, t: 0}, a, {t: 0.25, tc: 0.2, first: false, f: PS.dirOf(0.4), p: 0.8, fwd: 1, side: 0, done: false}, 1/60);
  comment("FLICK: ball (1.2, 0.11, -3.4), facing yaw 0.4, bar 0.8, W held (on), Strength 70: the launch");
  vec("FlickV", ball.v); vec("FlickW", ball.w);
  const kb = B.createBall({x: 0, z: 0, rollDecel: 1.25});
  knockOn({ball: kb, t: 0}, {m: {speed: 5.1}, scale: 1.05, prm: {sprint: 8.4}, intent: {}, id: 1, team: 0}, 0.6, -0.8);
  comment("KNOCK: rollDecel 1.25, scale 1.05, speed 5.1, sprint 8.4, along (0.6, -0.8)");
  vec("KnockV", kb.v); vec("KnockW", kb.w);
  // the step-in: a ball rolling 1.4 m/s toward the goal, the striker jogging onto it
  const stepInSpot = build("stepInSpot", {STEP_IN: A.STEP_IN, dirOf: PS.dirOf, hypot: D.hypot});
  const stepInOf = build("stepInOf", {STEP_IN: A.STEP_IN, predAt: A.predAt, stepInSpot, dirOf: PS.dirOf, hypot: D.hypot, clamp, cos: D.cos, SI_B: {x: 0, y: 0, z: 0}});
  const sb = B.createBall({x: 0, z: 0, rollDecel: 1.1});
  B.ballKick(sb, {x: -0.2, y: 0, z: -1.4}, {x: 0, y: 0, z: 0}, {});
  const ms = {ball: sb, bw: B.createBallWorld({}), pred: new Float32Array(360), predN: 0, predT: 0, t: 0, step: 0, restart: null};
  A.refreshPred(ms); ms.t = 1/60;
  const ag = {m: {x: -0.3, z: 0.9, yaw: 0.2, speed: 1.6, vx: -0.3, vz: -1.57}, scale: 1, foot: 'R'};
  const si = stepInOf(ms, ag, {kind: 'shot', target: {x: -2, y: 0.8, z: -18}}, A.canStrike(ag, sb, undefined));
  comment("STEP-IN: ball rolling (-0.2, 0, -1.4), body at (-0.3, 0.9) yaw 0.2 at 1.6 m/s, aim (-2, 0.8, -18): contact time and root spot");
  def("StepInT", si.t); def("StepInX", si.x); def("StepInZ", si.z);
}
console.log(lines.join("\n"));
