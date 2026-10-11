// qa/wpC-det.mjs: the ball, strike and touch models give the same bits in Node and in Chromium.
// Owner: WP-C (determinism rule D6; feeds the "same event-log hash in Node versus Chromium" acceptance of 2.3 WP-E).
//
// 1. detmath.js reproduces its recorded golden hash in Chromium (qa/unit/detmath.mjs checks it in Node).
// 2. A seeded scenario through every WP-C path (ballStep with moving bodies, boards and seeded spreads, ballPredict,
//    firstReach, planShot and the solver, firstTouch, tackleOutcome) hashes the same in Node and in Chromium.
//    Check 2 also runs through modules WP-C does not own (rng.js gauss, pitchspec.js dirOf, mover.js timeToPoint,
//    stamina.js); while any of them still calls an engine-approximated Math function it is reported as waiting for
//    those hook requests instead of passing (verified bit-identical on a copy with them applied).
//
//   QA_PORT=8769 node qa/wpC-det.mjs     exits 1 on any failed check; writes qa/out/wpC-det.json
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {ensureServer, ROOT} from "./serve.mjs";
import {PORT, BASE, ARGS, report} from "./lib.mjs";

const {chromium} = await import("/opt/node22/lib/node_modules/playwright/index.mjs");
const res = {name: "wpC-det", checks: [], ok: true};
const check = (pass, name, value, skip = false) => {
  res.checks.push({name, pass: skip ? null : !!pass, skipped: skip || undefined, value});
  if (!skip && !pass) res.ok = false;
  console.log(`${skip ? "wait" : pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// the scenario, run as-is in Node and in the page (it imports the modules from `base`)
async function scenario(base){
  const {createBall, createBallWorld, ballStep, ballKick, ballPredict, firstReach} = await import(base + "js/life/football/ball.js");
  const {planShot} = await import(base + "js/life/football/strike.js");
  const {firstTouch, tackleOutcome} = await import(base + "js/life/football/touch.js");
  const {makePitch} = await import(base + "js/life/football/pitchspec.js");
  const {mulberry32, hashStr} = await import(base + "js/life/football/rng.js");
  const D = await import(base + "js/life/football/detmath.js");
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let h = 2166136261;
  const mix = v => { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
  // detmath's golden set (as qa/unit/detmath.mjs)
  const rg = mulberry32(2026);
  let g = 2166136261;
  const gmix = v => { f64[0] = v; g = Math.imul(g ^ u32[0], 16777619); g = Math.imul(g ^ u32[1], 16777619); };
  for (let i = 0; i < 5000; i++){
    const x = (rg() - 0.5)*50, y = rg()*4;
    gmix(D.sin(x)); gmix(D.cos(x)); gmix(D.tan(x*0.05)); gmix(D.exp(x*0.3)); gmix(D.log(y + 1e-3)); gmix(D.pow(y, x*0.1));
    gmix(D.atan(x)); gmix(D.atan2(x, y - 2)); gmix(D.asin(rg()*2 - 1)); gmix(D.acos(rg()*2 - 1)); gmix(D.hypot(x, y, x - y));
  }
  // the WP-C paths
  const r = mulberry32(2026);
  const bodies = [];
  for (let i = 0; i < 22; i++) bodies.push({id: i, team: i%2, x: -50 + 100*r(), z: -30 + 60*r(), h: 1, vx: 0, vz: 0});
  const evs = [];
  const bw = createBallWorld({spec: makePitch({boards: true}), bodies: () => bodies, rng: mulberry32(7), onEvent: (t, d) => evs.push(t, d.t)});
  const b = createBall();
  const pred = new Float32Array(360);
  for (let k = 0; k < 60; k++){
    const p = planShot({from: b.p, target: {x: 52.4, y: 0.3 + 2*r(), z: -3 + 6*r()}, speed: 18 + 14*r(), contact: k%3 - 1, curl: r() - 0.5, foot: k%2 ? 'L' : 'R', kind: 'shot'},
      {kind: 'shot', power01: 0.6 + 0.4*r(), acc: 100*r(), bF: r(), eF: 0.6 + 0.4*r(), pressure01: r()}, r);
    ballKick(b, p.launch.v, p.launch.w, {agent: k%22, team: k%2, kind: 'shot', aero: 99*r(), t: bw.t, knuck: p.launch.knuck});
    for (let i = 0; i < 120; i++){
      for (const bd of bodies){ bd.vx = 6*D.sin(bw.t*0.7 + bd.id); bd.vz = 6*D.cos(bw.t*0.9 + bd.id); bd.x += bd.vx/60; bd.z += bd.vz/60; }
      ballStep(b, bw, 1/60);
      mix(b.p.x); mix(b.p.y); mix(b.p.z); mix(b.v.x); mix(b.w.y);
    }
    const n = ballPredict(b, bw, pred);
    const fr = firstReach(pred, n, {x: 0, z: 0, vx: 1, vz: 1, react: 0.2});
    if (fr) mix(fr.t);
    const ft = firstTouch({x: b.p.x + 0.5, z: b.p.z, yaw: 1, at: {ctrl: 60}}, b, {dir: {x: 1, z: 0}, push: 0.5}, {pressure01: 0.3, bF: 0.7}, r);
    mix(ft.v.x); mix(ft.v.z);
    const to = tackleOutcome({x: b.p.x - 1.2, z: b.p.z, yaw: -1.5, at: {tackling: 60}}, {x: b.p.x + 0.3, z: b.p.z, yaw: 1.5}, b, {kind: 'stand'}, {}, r);
    mix(to.severity); mix(to.tBall);
    if (Math.abs(b.p.x) > 52 || Math.abs(b.p.z) > 33){ b.p.x = 0; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0; b.inField = null; }
  }
  for (let i = 0; i < evs.length; i += 2){ mix(hashStr(evs[i])); mix(evs[i + 1]); }
  return {golden: g >>> 0, hash: h >>> 0, events: evs.length/2};
}

const GOLDEN = 3546834849;     // qa/unit/detmath.mjs
const node = await scenario(pathToFileURL(ROOT).href + "/");

const srv = await ensureServer(PORT);
const browser = await chromium.launch({args: ARGS});
let web = null;
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(BASE + "js/life/football/detmath.js");
  web = await page.evaluate(`(${scenario.toString()})(${JSON.stringify(BASE)})`);
  check(errs.length === 0, "the modules load in Chromium without errors", errs.slice(0, 3));
  res.chromium = browser.version();
} finally {
  await browser.close();
  if (srv.started) srv.server.close();
}
res.node = process.version;
check(node.golden === GOLDEN && web.golden === GOLDEN, "detmath gives its recorded bits in Node and in Chromium", {node: node.golden, chromium: web.golden});
check(node.events === web.events && node.events > 50, "the scenario raises the same events in both", {node: node.events, chromium: web.events});

// modules outside WP-C that the scenario runs through: still on engine Math?
const ENGINE = /\bMath\.(sin|cos|tan|exp|log|pow|atan2|atan|asin|acos|hypot|expm1|log1p|cbrt|sinh|cosh|tanh)\(/;
const deps = ["js/life/football/rng.js", "js/life/football/pitchspec.js", "js/life/mover.js", "js/life/stamina.js"];
const pending = deps.filter(f => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").some(l => ENGINE.test(l.replace(/\/\/.*$/, ""))));
const own = ["js/life/football/ball.js", "js/life/football/strike.js", "js/life/football/touch.js"];
check(!own.some(f => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").some(l => ENGINE.test(l.replace(/\/\/.*$/, "")))), "ball.js, strike.js and touch.js use no engine-approximated Math function");
if (pending.length) check(null, `bit-identical scenario hash in Node and Chromium (waiting for the detmath hook in ${pending.join(", ")})`, {node: node.hash, chromium: web.hash}, true);
else check(node.hash === web.hash, "the scenario's hash is bit-identical in Node and Chromium", {node: node.hash, chromium: web.hash});

report("wpC-det", res);
console.log(`wpC-det: ${res.checks.filter(c => c.pass).length} of ${res.checks.filter(c => !c.skipped).length} checks pass${pending.length ? ", 1 waiting for hooks" : ""}`);
process.exit(res.ok ? 0 : 1);
