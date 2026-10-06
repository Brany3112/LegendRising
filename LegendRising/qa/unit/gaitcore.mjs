// qa/unit/gaitcore.mjs: js/life/gaitcore.js under plain node.
// Owner: WP-0D, contract DESIGN 1.4.8; numbers 3.5.2; acceptance 2.2 WP-0D (footfalls, walk/run switching, step length).
//
//   node qa/unit/gaitcore.mjs   exits 1 on any failed check; writes qa/out/unit-gaitcore.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {WALK, RUN, WALK_REACH, createGait, gaitMode, gaitModeStep, stepLen, cadence, dutyOf, strideTime, swingTime, gaitShape,
  phaseAdvance, swingProgress, MAX_STRIDES} from "../../js/life/gaitcore.js";
import {mulberry32} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-gaitcore", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// footfalls alternate L, R exactly at phase 0 and 0.5: walk and run at constant speed with uneven step lengths
for (const [v, mode, scale] of [[1.4, 'W', 1], [5.5, 'R', 1], [7.6, 'R', 1.08], [0.8, 'W', 0.93]]){
  const g = createGait(), r = mulberry32(7), step = stepLen(v, mode, scale);
  let dist = 0, alt = true, exact = true, last = g.side, count = 0, phaseOk = true;
  for (let i = 0; i < 3000; i++){
    const h = (0.5 + r())/60, d = v*h;          // frame times from 1/120 to 1/40 s
    const before = g.phi;
    const ev = phaseAdvance(g, d, v, mode, scale);
    for (const e of ev){
      count++;
      if (e.side === last) alt = false;
      last = e.side;
      // where the touchdown happened: an exact multiple of one step from the start
      const at = dist + e.at*d, k = Math.round(at/step);
      if (!near(at, k*step, 1e-9*Math.max(1, at))) exact = false;
      if ((k % 2 === 1) !== (e.side === 'R')) exact = false;
      // and the phase there is 0 (left) or 0.5 (right)
      let ph = before + e.at*d/(2*step); ph -= Math.floor(ph + 1e-12);
      if (!near(ph, e.side === 'L' ? 0 : 0.5, 1e-9)) phaseOk = false;
    }
    dist += d;
  }
  const expected = Math.floor(dist/step + 1e-9);
  check(alt && exact && phaseOk && count === expected && g.n === count,
    `${mode} at ${v} m/s (scale ${scale}): footfalls alternate L, R at exactly phase 0 and 0.5`, {count, expected, alt, exact, phaseOk});
}
{
  // a big step crossing several footfalls reports each, in order, at the right fraction
  const g = createGait(), step = stepLen(5.5, 'R');
  const ev = phaseAdvance(g, 3.5*step, 5.5, 'R');
  check(ev.length === 3 && ev.map(e => e.side).join("") === "RLR" && ev.every((e, i) => near(e.at, (i + 1)/3.5)), "one long advance reports every footfall crossed", ev);
  check(near(g.phi, 0.75), "phase after 3.5 steps is 0.75", g.phi);
  // backwards runs it back, still alternating
  const b = createGait({phi: 0.3}), seq = [];
  for (let i = 0; i < 40; i++) for (const e of phaseAdvance(b, -0.2, 3.0, 'R')) seq.push(e.side);
  let altB = seq.length > 3; for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) altB = false;
  check(altB && seq[0] === 'L', "backwards the phase runs back and footfalls still alternate", seq.join(""));
  check(phaseAdvance(createGait(), 0, 3, 'R').length === 0, "no distance, no footfall");
  // a body pushing into a wall (no distance) does not run on the spot
  const w = createGait({phi: 0.2});
  for (let i = 0; i < 100; i++) phaseAdvance(w, 0, 6, 'R');
  check(w.phi === 0.2 && w.n === 0, "phase is driven by distance, not by speed alone");
  // a jump is not a walk: non-finite input and moves over MAX_STRIDES strides change nothing and report nothing
  const j = createGait({phi: 0.2}), J = [];
  for (const [d, v, sc] of [[Infinity, 3, 1], [-Infinity, 3, 1], [NaN, 3, 1], [1e5, 3, 1], [-1e5, 3, 1], [1, NaN, 1], [1, 3, 0], [1, 3, NaN]]){
    const ev = phaseAdvance(j, d, v, 'R', sc); J.push(ev.length);
  }
  check(J.every(n => n === 0) && j.phi === 0.2 && j.n === 0, "Infinity, NaN, a 100 km jump or a zero scale: no footfalls, phase kept", J);
  const big = createGait(), bs = stepLen(9, 'R'), evb = phaseAdvance(big, 2*bs*MAX_STRIDES, 9, 'R');
  check(evb.length === 2*MAX_STRIDES && near(big.phi, 0), "a move of exactly MAX_STRIDES strides still walks: every footfall reported", evb.length);
}

// walk to run only after 0.15 s above 2.30 m/s; back to walk only below 2.00
{
  const h = 1/60, g = createGait();
  let t = 0, switchedAt = null;
  for (let i = 0; i < 30; i++){ t += h; if (gaitModeStep(g, 2.31, h) === 'R' && switchedAt == null) switchedAt = t; }
  check(switchedAt != null && near(switchedAt, 0.15, 1e-9), "W to R after 0.15 s above 2.30 m/s", switchedAt);
  const g2 = createGait(); let flick = false;
  for (let i = 0; i < 200; i++){ const v = i % 8 < 7 ? 2.35 : 2.2; if (gaitModeStep(g2, v, h) === 'R') flick = true; }
  check(!flick, "dipping to 2.20 every 0.13 s resets the timer: no switch to running");
  const g3 = createGait(); for (let i = 0; i < 300; i++) gaitModeStep(g3, 2.30, h);
  check(g3.mode === 'W', "exactly 2.30 m/s never starts a run");
  const g4 = {mode: 'R', held: 0};
  const hold = [2.29, 2.1, 2.0, 2.01].map(v => gaitModeStep(g4, v, h));
  check(hold.join("") === "RRRR" && gaitModeStep(g4, 1.99, h) === 'W', "R stays R down to 2.00 and drops to W below it", hold);
  check(gaitMode('W', 5, 0.149) === 'W' && gaitMode('W', 5, 0.15) === 'R' && gaitMode('R', 2.0, 0) === 'R' && gaitMode('R', 1.999, 1) === 'W', "gaitMode thresholds");
}

// step length: 1.875 m x scale at 5.5 m/s; the tables' cadence; the walking reach limit
{
  let ok = true;
  for (const s of [1, 0.9, 1.1, 1.05]) ok = ok && near(stepLen(5.5, 'R', s), 1.875*s, 1e-12);
  check(ok, "step length at 5.5 m/s is 1.875 m x scale", [stepLen(5.5, 'R', 1), stepLen(5.5, 'R', 1.1)]);
  let cadOk = true;
  for (const [v, spm, step] of RUN) cadOk = cadOk && Math.abs(cadence(v, 'R')*60/spm - 1) < 0.005 && near(stepLen(v, 'R'), step);
  for (const [v, spm, step] of WALK) if (step <= WALK_REACH) cadOk = cadOk && Math.abs(cadence(v, 'W')*60/spm - 1) < 0.005 && near(stepLen(v, 'W'), step);
  check(cadOk, "table rows: cadence v/step matches steps per minute within 0.5%");
  check(near(stepLen(2.3, 'W'), WALK_REACH) && near(stepLen(2.3, 'W', 1, Infinity), 1.03) && cadence(2.3, 'W') > cadence(2.0, 'W'),
    "a fast walk keeps the reach-limited step (0.92 m) and raises the cadence", {step: stepLen(2.3, 'W'), cad: +cadence(2.3, 'W').toFixed(3)});
  let mono = true, prev = 0;
  for (let v = 0.5; v <= 9; v += 0.05){ const s = stepLen(v, v > 2.3 ? 'R' : 'W'); if (s < prev - 1e-12) mono = false; prev = s; }
  check(mono, "step length never shrinks as speed rises");
  check(near(dutyOf(5.5, 'R'), 0.243) && near(dutyOf(1.4, 'W'), 0.61), "duty from the tables");
  const sh = gaitShape(2.4, 'R'), sh9 = gaitShape(9, 'R'), w = gaitShape(1.4, 'W');
  check(near(sh.contact, 0.78, 0.005) && near(sh9.contact, 1.0, 0.005) && near(sh.lift, 0.14) && near(sh9.lift, 0.5) && near(w.hipDrop, 0.04),
    "run contact 0.78 to 1.00 m, swing lift 0.14 to 0.50 m, walk hip drop budget 0.040 at 1.4 m/s", {c: sh.contact, c9: sh9.contact});
  const st = swingTime(5.5, 'R');
  check(st >= 0.22 && st <= 0.45 && near(strideTime(5.5, 'R'), 2*1.875/5.5), "swing time within 0.22 to 0.45 s", st);
}

// swing progress: null in stance, 0 at lift-off to 1 at touchdown
{
  const duty = 0.3, g = createGait();
  const at = phi => { g.phi = phi; return [swingProgress(g, 'L', duty), swingProgress(g, 'R', duty)]; };
  const a = at(0.1), b = at(0.3), c = at(0.65), d = at(0.95);
  check(a[0] === null && near(a[1], (0.6 - 0.3)/0.7), "left in stance just after its touchdown; right in swing", a);
  check(near(b[0], 0) && near(b[1], (0.8 - 0.3)/0.7), "left lifts off at phi = duty", b);
  check(near(c[0], (0.65 - 0.3)/0.7) && c[1] === null, "right in stance after 0.5", c);
  check(near(d[0], 0.65/0.7) && near(d[1], (0.45 - 0.3)/0.7), "both feet: left near touchdown, right in early swing", d);
  // walking: double support (both feet down) right after each touchdown
  const gw = createGait({phi: 0.02});
  check(swingProgress(gw, 'L', 0.61) === null && swingProgress(gw, 'R', 0.61) === null, "walking has double support after a touchdown");
}

// purity (DESIGN 1.2, P)
{
  const code = fs.readFileSync(path.join(ROOT, "js/life/gaitcore.js"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const bad = [/Math\.random/, /\bS\./, /\bMT\b/, /\bA\./, /\bwindow\./, /\bdocument\./, /\bTHREE\b/, /^\s*import\b/m].filter(re => re.test(code)).map(String);
  check(!bad.length, "gaitcore.js is pure", bad);
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-gaitcore.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "gaitcore: pass" : "gaitcore: FAIL");
process.exit(res.ok ? 0 : 1);
