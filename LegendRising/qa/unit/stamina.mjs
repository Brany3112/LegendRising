// qa/unit/stamina.mjs: js/life/stamina.js under plain node (and with the mover, for the speed factors).
// Owner: WP-0D, contract DESIGN 1.4.7; numbers 1.5.2; acceptance 2.2 WP-0D and the stamina rows of 4.1.
//
//   node qa/unit/stamina.mjs    exits 1 on any failed check; writes qa/out/unit-stamina.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {STAM, createStam, stamCap, stamSetCap, stamStep, stamAction, stamFactors, effortOf, effF, ksOf, FRESH,
  energyPerMatchMinute, matchIntensity, matchFatigue} from "../../js/life/stamina.js";
import {createMover, moverParams, moverStep, sprintSpeed} from "../../js/life/mover.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-stamina", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r2 = v => Math.round(v*100)/100;
const h = 1/60;

// a full sprint from 100 lasts 9.3 to 10.3 s (stamina 24), 10.5 to 11.7 s (50), 14.0 to 15.4 s (99)
for (const [stamina, lo, hi] of [[24, 9.3, 10.3], [50, 10.5, 11.7], [99, 14.0, 15.4]]){
  const st = createStam({stamina, energy: 100, fatigue: 0});
  let t = 0;
  while (st.B > 0 && t < 60){ stamStep(st, h, 'sprint', {stamina, eF: 1}); t += h; }
  check(st.B === 0 && t >= lo && t <= hi, `full sprint from 100 lasts ${lo} to ${hi} s at stamina ${stamina}`, r2(t));
}

// sprint speed factor 0.71 at B = 0, 0.89 at B = 20, 1.0 at B >= 35 (pace 50, eF 1): from the formula and from the
// mover's settled top speed
{
  const prm = moverParams({pace: 50, dribbling: 50}, "football"), fresh = sprintSpeed(prm, FRESH);
  for (const [B, want, tol] of [[0, 0.71, 0.02], [20, 0.89, 0.02], [35, 1, 1e-12], [60, 1, 1e-12], [100, 1, 1e-12]]){
    const f = stamFactors({B}, 1), ratio = sprintSpeed(prm, f)/fresh;
    const m = createMover({yaw: -Math.PI/2});
    for (let i = 0; i < 900; i++) moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, f, h);
    const live = m.speed/fresh;
    check(Math.abs(ratio - want) <= tol && Math.abs(live - want) <= tol, `sprint speed factor at B = ${B} is ${want}`, {formula: +ratio.toFixed(4), mover: +live.toFixed(4)});
  }
  // 4.1 tiredness: top speed at B = 0 is 69 to 73% of fresh; acceleration x0.75; aim sigma ratio 1.3 to 1.6 at
  // bF = 0, eF = 0.6; never zero speed or a disabled action
  const f0 = stamFactors({B: 0}, 1), fe = stamFactors({B: 0}, effF(0));
  const top0 = sprintSpeed(prm, f0)/fresh;
  check(top0 >= 0.69 && top0 <= 0.73 && f0.accel === 0.75 && fe.aim >= 1.3 && fe.aim <= 1.6, "tired: top speed 69 to 73%, acceleration x0.75, aim sigma 1.3 to 1.6",
    {top0: +top0.toFixed(3), accel: f0.accel, aim: +fe.aim.toFixed(3)});
  check(sprintSpeed(prm, fe) > prm.run*0.9 && fe.power > 0.8 && fe.turn >= 0.88 && fe.speed >= 0.45, "an empty, exhausted player still runs, shoots and turns", {sprint: +sprintSpeed(prm, fe).toFixed(2), power: +fe.power.toFixed(3)});
}

// the factors are smooth in B and never below their floors
{
  let smooth = true, floors = true, prev = null;
  for (let B = 0; B <= 100; B += 0.25){
    const f = stamFactors({B}, 0.6);
    if (f.speed < 0.45 || f.accel < 0.75 || f.turn < 0.88 || f.power < 0.81 - 1e-12 || f.aim > 1.6 || f.lean < 0.85) floors = false;
    if (prev && (Math.abs(f.speed - prev.speed) > 0.01 || Math.abs(f.accel - prev.accel) > 0.01)) smooth = false;
    prev = f;
  }
  check(floors && smooth, "factors are smooth in breath and keep their floors");
  check(FRESH.speed === 1 && FRESH.accel === 1 && FRESH.turn === 1 && FRESH.aim === 1 && FRESH.power === 1 && FRESH.touch === 0, "a fresh body loses nothing");
  // a per-agent object filled in place gives the same numbers as a new one
  const keep = {}, a = stamFactors({B: 12}, 0.7, keep), b = stamFactors({B: 12}, 0.7);
  check(a === keep && Object.keys(b).every(k => a[k] === b[k]), "stamFactors fills an object it is given, with the same numbers");
}

// 3 s sprints with 4 s walks never drop below 70 over 5 minutes: with the mover (a sprint from a walk, so the run-up
// counts as it would on the pitch) at stamina 24, 50 and 99, and as bare efforts at stamina 50 and 99
for (const stamina of [24, 50, 99]){
  const prm = moverParams({pace: 50}, "football"), m = createMover({yaw: -Math.PI/2});
  const st = createStam({stamina}), ctx = {stamina, eF: 1};
  let minB = st.B;
  for (let t = 0; t < 300; t += 7){
    for (let i = 0; i < 180; i++){ moverStep(m, {dx: 1, dz: 0, gait: 'sprint'}, prm, stamFactors(st, 1), h); stamStep(st, h, effortOf(m.gait, m.speed, prm.run), ctx); minB = Math.min(minB, st.B); }
    for (let i = 0; i < 240; i++){ moverStep(m, {dx: 1, dz: 0, gait: 'walk'}, prm, stamFactors(st, 1), h); stamStep(st, h, effortOf(m.gait, m.speed, prm.run), ctx); minB = Math.min(minB, st.B); }
  }
  check(minB >= 70, `3 s sprints with 4 s walks for 5 minutes stay above 70 (stamina ${stamina}, with the mover)`, r2(minB));
}
for (const stamina of [50, 99]){
  const st = createStam({stamina}), ctx = {stamina, eF: 1};
  let minB = st.B;
  for (let t = 0; t < 300; t += 7){
    for (let i = 0; i < 180; i++){ stamStep(st, h, 'sprint', ctx); minB = Math.min(minB, st.B); }
    for (let i = 0; i < 240; i++){ stamStep(st, h, 'walk', ctx); minB = Math.min(minB, st.B); }
  }
  check(minB >= 70, `3 s sprints with 4 s walks for 5 minutes stay above 70 (stamina ${stamina}, bare efforts)`, r2(minB));
}

// recovery: nothing for 0.5 s after the last drain, then it rises (within 0.6 s of release), at the 1.5.2 rates
{
  const st = createStam({stamina: 50}), ctx = {stamina: 50, eF: 1};
  for (let i = 0; i < 300; i++) stamStep(st, h, 'sprint', ctx);
  const B0 = st.B; let t = 0, rose = null;
  while (t < 2){ stamStep(st, h, 'stand', ctx); t += h; if (rose == null && st.B > B0) rose = t; }
  check(rose != null && rose > 0.5 - 1e-9 && rose <= 0.6, "breath starts to rise 0.5 s after a sprint and within 0.6 s", r2(rose));
  const s2 = createStam({stamina: 50}); s2.B = 40;
  for (let i = 0; i < 60; i++) stamStep(s2, h, 'stand', ctx);
  check(Math.abs(s2.B - 50) < 1e-6, "standing recovers 10 a second at stamina 50, energy full", r2(s2.B));
  const s3 = createStam({stamina: 99}); s3.B = 40;
  for (let i = 0; i < 60; i++) stamStep(s3, h, 'jog', {stamina: 99, eF: 0.6});
  check(Math.abs(s3.B - (40 + 4.5*(0.7 + 0.6*0.99)*(0.75 + 0.25*0.6))) < 1e-6, "jog recovery 4.5 times the stamina and energy terms", r2(s3.B));
  const s4 = createStam({stamina: 50}); s4.B = 50;
  for (let i = 0; i < 60; i++) stamStep(s4, h, 'run', ctx);
  check(Math.abs(s4.B - (50 - 1.2)) < 1e-6, "running over 5 m/s without sprinting drains 1.2 x ks a second", r2(s4.B));
  check(Math.abs(ksOf(24) - 1.13) < 1e-12 && ksOf(50) === 1 && Math.abs(ksOf(99) - 0.755) < 1e-12, "ks by stamina");
}

// cap: 86 at energy 40, 64 at energy 20, 81 at fatigue 80 (+-1); the pool never exceeds it
{
  const c40 = stamCap(40, 0), c20 = stamCap(20, 0), f80 = stamCap(100, 80);
  check(Math.abs(c40 - 86) <= 1 && Math.abs(c20 - 64) <= 1 && Math.abs(f80 - 81) <= 1 && stamCap(100, 0) === 100, "cap 86 at energy 40, 64 at energy 20, 81 at fatigue 80", [r2(c40), r2(c20), r2(f80)]);
  const st = createStam({stamina: 50, energy: 40});
  check(Math.abs(st.B - c40) < 1e-9 && st.cap === st.B, "a new pool starts full to its cap");
  for (let i = 0; i < 600; i++) stamStep(st, h, 'stand', {stamina: 50, eF: effF(40)});
  check(st.B <= st.cap, "recovery stops at the cap");
  stamSetCap(st, 20, 0);
  check(Math.abs(st.B - c20) < 1e-9, "a lower cap lowers the breath with it");
}

// actions, efforts, career energy and fatigue
{
  const st = createStam({stamina: 50});
  const costs = ['shot', 'slide', 'jump', 'tackle', 'pass'].map(k => stamAction(st, k));
  check(costs.join(",") === "3,6,3,2,0.5" && Math.abs(st.B - 85.5) < 1e-9 && st.recoverDelay === STAM.DELAY, "action costs shot 3, slide 6, jump 3, tackle 2, pass 0.5", costs);
  const e0 = createStam({stamina: 50}); e0.B = 1; stamAction(e0, 'slide');
  check(e0.B === 0, "an action never takes the breath below zero, and is never refused");
  check(effortOf('sprint', 6.0, 5.6) === 'sprint' && effortOf('sprint', 5.2, 5.6) === 'run' && effortOf('jog', 3, 5.6) === 'jog' &&
    effortOf('walk', 1.5, 5.6) === 'walk' && effortOf('stand', 0.2, 5.6) === 'stand' && effortOf('run', 5.4, 5.6) === 'run', "effort per step (3.1.6)");
  const typ = energyPerMatchMinute({staminaF: 1.03, meanSpeed: 2.2, sprintFrac: 0.05});
  check(typ >= 0.26 && typ <= 0.30, "a typical match minute costs 0.26 to 0.30 energy", r2(typ));
  check(matchFatigue(90, 0.5) === Math.round(8 + 24*1.0) && matchFatigue(0, 1) === 8 && matchFatigue(45, matchIntensity(0.56)) === Math.round(8 + 12*1.3),
    "match fatigue on return", [matchFatigue(90, 0.5), matchFatigue(45, 1)]);
  // sprintFrac follows the recent share of sprinting
  const s = createStam({stamina: 99});
  for (let i = 0; i < 3600; i++) stamStep(s, h, i % 10 < 2 ? 'sprint' : 'walk', {stamina: 99, eF: 1});
  check(Math.abs(s.sprintFrac - 0.2) < 0.03 && Math.abs(s.acc.sprint/s.acc.t - 0.2) < 1e-9, "sprintFrac and the totals track the share of time sprinting", r2(s.sprintFrac));
  let finite = true;
  const z = createStam({});
  for (let i = 0; i < 1000; i++){ stamStep(z, i % 3 ? h : 0, ['stand', 'walk', 'jog', 'run', 'sprint'][i % 5], {}); if (!Number.isFinite(z.B) || z.B < 0 || z.B > z.cap) finite = false; }
  check(finite, "defaults: no NaN, breath within [0, cap]");
}

// purity (DESIGN 1.2, P)
{
  const code = fs.readFileSync(path.join(ROOT, "js/life/stamina.js"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const bad = [/Math\.random/, /\bS\./, /\bMT\b/, /\bA\./, /\bwindow\./, /\bdocument\./, /\bTHREE\b/, /\bMath\.(?:sin|cos|tan|asin|acos|atan2?|exp|expm1|log(?:1p|2|10)?|pow|hypot|cbrt|sinh|cosh|tanh)\(/].filter(re => re.test(code)).map(String);
  // the only import allowed is detmath.js, the engine-independent maths every pure module shares (D6)
  const imports = [...code.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map(x => x[1]);
  check(!bad.length && imports.every(s => s === "./football/detmath.js"), "stamina.js is pure, imports only detmath.js and calls no engine-approximated Math function", {bad, imports});
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-stamina.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "stamina: pass" : "stamina: FAIL");
process.exit(res.ok ? 0 : 1);
