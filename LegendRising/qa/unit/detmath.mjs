// qa/unit/detmath.mjs: js/life/football/detmath.js under plain node.
// Owner: WP-C (determinism rule D6; the Node versus Chromium event-log check of 2.3 WP-E).
//
// Checks accuracy against the engine's own Math functions (a few units in the last place), the special values, and a
// golden hash of the exact output bits for a fixed set of inputs: any engine that runs this file must reproduce it,
// which is the point of the module (the same hash is checked in Chromium by the WP-C browser probe).
//
//   node qa/unit/detmath.mjs    exits 1 on any failed check; writes qa/out/unit-detmath.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as D from "../../js/life/football/detmath.js";
import {mulberry32} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-detmath", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// the distance in units in the last place between two doubles
const F = new Float64Array(2), B = new BigInt64Array(F.buffer);
function ulps(a, b){
  if (a === b) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  F[0] = a; F[1] = b;
  let x = B[0], y = B[1];
  if (x < 0n) x = -0x8000000000000000n - x;
  if (y < 0n) y = -0x8000000000000000n - y;
  const d = x - y;
  return Number(d < 0n ? -d : d);
}

/* ---------- accuracy ---------- */
{
  const r = mulberry32(42);
  const cases = [
    ['sin', x => D.sin(x), x => Math.sin(x), () => (r() - 0.5)*80, 2],
    ['sin small', x => D.sin(x), x => Math.sin(x), () => (r() - 0.5)*1e-3, 2],
    ['cos', x => D.cos(x), x => Math.cos(x), () => (r() - 0.5)*80, 2],
    ['tan', x => D.tan(x), x => Math.tan(x), () => (r() - 0.5)*3, 4],
    ['exp', x => D.exp(x), x => Math.exp(x), () => (r() - 0.5)*60, 2],
    ['exp small', x => D.exp(x), x => Math.exp(x), () => (r() - 0.5)*0.01, 2],
    ['log', x => D.log(x), x => Math.log(x), () => Math.exp((r() - 0.5)*80), 2],
    ['log near 1', x => D.log(x), x => Math.log(x), () => 1 + (r() - 0.5)*0.02, 4],
    ['atan', x => D.atan(x), x => Math.atan(x), () => (r() - 0.5)*40, 4],
    ['atan near 1', x => D.atan(x), x => Math.atan(x), () => 1 + (r() - 0.5)*0.1, 4],
    ['asin', x => D.asin(x), x => Math.asin(x), () => (r() - 0.5)*1.999, 6],
    ['acos', x => D.acos(x), x => Math.acos(x), () => (r() - 0.5)*1.999, 6]
  ];
  for (const [name, f, g, gen, tol] of cases){
    let worst = 0, at = 0;
    for (let i = 0; i < 100000; i++){ const x = gen(), u = ulps(f(x), g(x)); if (u > worst){ worst = u; at = x; } }
    check(worst <= tol, `${name} within ${tol} ulp of Math.${name.split(' ')[0]}`, {worst, at});
  }
  // atan2 over all four quadrants
  let worst = 0;
  for (let i = 0; i < 100000; i++){ const y = (r() - 0.5)*20, x = (r() - 0.5)*20; worst = Math.max(worst, ulps(D.atan2(y, x), Math.atan2(y, x))); }
  check(worst <= 4, "atan2 within 4 ulp of Math.atan2 in every quadrant", worst);
  // pow: relative error (exp(y log x) loses a little as |y log x| grows)
  let rel = 0;
  for (let i = 0; i < 100000; i++){
    const x = r()*3, y = (r() - 0.5)*12, a = D.pow(x, y), b = Math.pow(x, y);
    if (b !== 0 && Number.isFinite(b)) rel = Math.max(rel, Math.abs(a/b - 1));
  }
  check(rel <= 1e-14, "pow within 1e-14 relative of Math.pow (x in 0..3, y in -6..6: exp(y log x) carries the error of y log x)", rel);
  let iw = 0;
  for (let i = 0; i < 20000; i++){ const x = (r() - 0.5)*4, n = Math.floor((r() - 0.5)*20); iw = Math.max(iw, Math.abs(D.pow(x, n)/Math.pow(x, n) - 1)); }
  check(iw <= 1e-14, "pow with integer exponents (negative bases too)", iw);
  let hw = 0;
  for (let i = 0; i < 100000; i++){ const a = (r() - 0.5)*200, b = (r() - 0.5)*200, c = (r() - 0.5)*200; hw = Math.max(hw, ulps(D.hypot(a, b, c), Math.hypot(a, b, c)), ulps(D.hypot(a, b), Math.hypot(a, b))); }
  check(hw <= 2, "hypot within 2 ulp of Math.hypot", hw);
}

/* ---------- special values ---------- */
{
  const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
  const pairs = [
    [D.exp(0), 1], [D.exp(-Infinity), 0], [D.exp(Infinity), Infinity], [D.exp(800), Infinity], [D.exp(-800), 0], [D.exp(NaN), NaN],
    [D.log(1), 0], [D.log(0), -Infinity], [D.log(-1), NaN], [D.log(Infinity), Infinity],
    [D.pow(2, 10), 1024], [D.pow(0, 2), 0], [D.pow(0, -1), Infinity], [D.pow(-2, 3), -8], [D.pow(-2, 0.5), NaN], [D.pow(5, 0), 1], [D.pow(NaN, 0), 1],
    [D.sin(0), 0], [D.cos(0), 1], [D.sin(NaN), NaN], [D.cos(Infinity), NaN],
    [D.atan(Infinity), Math.PI/2], [D.atan2(0, -1), Math.PI], [D.atan2(-0, -1), -Math.PI], [D.atan2(0, 1), 0], [D.atan2(1, 0), Math.PI/2], [D.atan2(-1, 0), -Math.PI/2],
    [D.asin(2), NaN], [D.acos(1), 0], [D.asin(1), Math.PI/2]
  ];
  const bad = pairs.map((p, i) => [i, p[0], p[1]]).filter(([, a, b]) => !same(a, b));
  check(bad.length === 0, "special values: zeros, infinities, NaN, the signs of zero, exact integer powers", bad);
  check(Math.abs(D.exp(D.log(7.25)) - 7.25) < 1e-14 && Math.abs(D.sin(1)**2 + D.cos(1)**2 - 1) < 1e-15 && Math.abs(D.tan(Math.PI/4) - 1) < 1e-15, "identities hold");
}

/* ---------- the same bits everywhere ---------- */
{
  // a fixed set of inputs through every function, hashed bit for bit
  const r = mulberry32(2026), f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let h = 2166136261;
  const mix = v => { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
  for (let i = 0; i < 5000; i++){
    const x = (r() - 0.5)*50, y = r()*4;
    mix(D.sin(x)); mix(D.cos(x)); mix(D.tan(x*0.05)); mix(D.exp(x*0.3)); mix(D.log(y + 1e-3)); mix(D.pow(y, x*0.1));
    mix(D.atan(x)); mix(D.atan2(x, y - 2)); mix(D.asin(r()*2 - 1)); mix(D.acos(r()*2 - 1)); mix(D.hypot(x, y, x - y));
  }
  const GOLDEN = 3546834849;     // recorded in Node 22 and confirmed in Chromium 141
  check((h >>> 0) === GOLDEN, "the output bits of a fixed input set match the recorded hash (any engine must reproduce it)", h >>> 0);
}

/* ---------- speed ---------- */
{
  const N = 300000;
  let s = 0, t0 = performance.now();
  for (let i = 0; i < N; i++) s += D.sin(i*0.001) + D.exp(-i*1e-5) + D.pow(0.5 + (i%100)*0.005, 1.2);
  const ns = (performance.now() - t0)/N/3*1e6;
  check(ns < 400 && Number.isFinite(s), "about the cost of a few dozen flops per call", +ns.toFixed(1) + " ns");
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-detmath.json"), JSON.stringify(res, null, 1));
console.log(`unit/detmath: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
