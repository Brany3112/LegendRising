// qa/unit/duel.mjs: js/life/football/duel.js (and zone.ratings) under plain node.
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance "qa/unit/duel.mjs";
// formulas TRAINING-SPEC section 3 (shield, tackle) and the Gate G0 lead readings (fatigue factor, the 50/50 with
// X = S + C, the shield challenge).
//
//   node qa/unit/duel.mjs      exits 1 on any failed check; writes qa/out/unit-duel.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {logistic, pShieldLoss, shieldAngle, fatigueFactor, fF, p5050, pTackleWin, timingFactor, angleFactor, standReach, pokeReach,
  slideReach, slideStep, slideTravel, slideTime, recovery, pTackleFoul, lateness} from "../../js/life/football/duel.js";
import {ratings} from "../../js/life/football/zone.js";
import {attrsForAI, attrsForPlayer} from "../../js/life/football/attrs.js";
import {TUNE, tuneSet, tuneReset, tuneGet, TUNE_KEYS} from "../../js/life/football/tune.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-duel", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r4 = v => Math.round(v*1e4)/1e4;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const L = x => 1/(1 + Math.exp(-x/8));
const PI = Math.PI;

/* ---------- logistic shapes and clamps ---------- */
{
  check(near(logistic(0), 0.5) && near(logistic(8), L(8)) && near(logistic(-16), L(-16), 1e-12), "logistic(x) = 1/(1 + exp(-x/8))");
  // shield: clamp(logistic((D - S)/8) x angle x fatigue, 0.05, 0.90)
  const pts = [[50, 50, 1, 1], [40, 70, 1, 1], [70, 40, 0.6, 1], [55, 60, 0.8, 1.1], [30, 90, 1, 1.18]];
  let ok = true; const vals = [];
  for (const [S, D, ang, fat] of pts){ const want = clamp(L(D - S)*ang*fat, 0.05, 0.90), got = pShieldLoss(S, D, ang, fat); vals.push(r4(got)); if (!near(got, want, 1e-9)) ok = false; }
  check(ok, "pShieldLoss = clamp(logistic((D - S)/8) x angle x fatigue, 0.05, 0.90) at 5 sample points", vals);
  check(pShieldLoss(10, 99) === 0.90 && pShieldLoss(99, 10) === 0.05, "the shield's clamps: 0.90 and 0.05");
  check(p5050(99, 10) === 0.90 && p5050(10, 99) === 0.05, "the 50/50's clamps: 0.90 and 0.05");
  check(pTackleWin(99, 10) === 0.92 && pTackleWin(10, 99) === 0.05, "the tackle's clamps: 0.92 and 0.05");
  let rises = true, prev = -1;
  for (let g = -30; g <= 30; g += 5){ const p = p5050(100 + g, 100); if (!(p > prev || p === prev && (p === 0.05 || p === 0.90))) rises = false; prev = p; }
  check(rises && p5050(115, 100) > p5050(100, 100), "p5050 rises with XA - XB (flat only at its clamps)");
  let sym = true;
  for (const [a, b] of [[100, 100], [110, 95], [90, 105], [130, 118]]) if (!near(p5050(a, b) + p5050(b, a), 1, 1e-12)) sym = false;
  check(sym, "p5050 is symmetric: p(A, B) + p(B, A) = 1 inside the clamps");
  check(near(p5050(100, 100), 0.5) && near(p5050(115, 100), L(15)) && near(p5050(130, 100), 0.90), "p5050 at X gaps 0, +15, +30 (0.5, logistic(15/8), the 0.90 clamp)", [r4(p5050(100, 100)), r4(p5050(115, 100)), r4(p5050(130, 100))]);
  check(near(pTackleWin(60, 50, 0.7, 0.9), clamp(L(10)*0.7*0.9, 0.05, 0.92)), "pTackleWin = clamp(logistic((T - C)/8) x timing x angle, 0.05, 0.92)");
}

/* ---------- ratings ---------- */
{
  const sets = [attrsForAI({id: 1, ovr: 50, pos: 'CM'}), attrsForAI({id: 2, ovr: 80, pos: 'DF'}), attrsForAI({id: 3, ovr: 35, pos: 'W'}),
    attrsForPlayer({power: 70, jumping: 40, dribbling: 60, composure: 55, passing: 50, tackling: 30, interception: 45, pace: 65}),
    attrsForAI({id: 9, ovr: 90, pos: 'ST'})];
  let ok = true; const out = [];
  for (const a of sets){
    const r = ratings(a);
    const str = 0.75*a.power + 0.25*a.jumping, bal = 0.4*a.agility + 0.3*a.ctrl + 0.3*a.power, def = 0.6*a.interception + 0.25*a.composure + 0.15*a.tackling;
    const c = (0.55*a.ctrl + 0.20*a.agility + 0.15*a.composure + 0.10*bal)/99;
    const S = 0.45*str + 0.35*a.ctrl + 0.20*bal, D = 0.45*a.tackling + 0.30*str + 0.25*def;
    const T = 0.50*a.tackling + 0.25*str + 0.25*def, C = 0.50*a.ctrl + 0.30*a.agility + 0.20*bal;
    if (!(near(a.strength, str, 1e-9) && near(a.balance, bal, 1e-9) && near(a.defAware, def, 1e-9))) ok = false;
    if (!(near(r.c, c, 1e-12) && near(r.vc, 8 + 10*c, 1e-12) && near(r.S, S, 1e-9) && near(r.D, D, 1e-9) && near(r.T, T, 1e-9) && near(r.C, C, 1e-9))) ok = false;
    out.push({S: r4(r.S), D: r4(r.D), T: r4(r.T), C: r4(r.C), c: r4(r.c)});
  }
  check(ok, "ratings: S, D, T, C (and c, vc) equal the spec formulas at 5 attribute sets, with Strength, Balance and DefAwareness derived", out);
  const bare = ratings({ctrl: 60, agility: 50, composure: 50, tackling: 40, power: 50, jumping: 50, interception: 50});
  check(Number.isFinite(bare.S) && Number.isFinite(bare.D) && Number.isFinite(bare.T), "a record without the derived stats still rates (worked out on the fly)");
}

/* ---------- timing, angle, foul ---------- */
{
  check(timingFactor(0) === 1 && timingFactor(0.08) === 1 && timingFactor(-0.08) === 1, "timing 1 within +-0.08 s");
  check(near(timingFactor(0.3), 0.3) && near(timingFactor(-0.3), 0.3) && near(timingFactor(0.6), 0.3), "timing 0.3 at +-0.3 s (and beyond)");
  check(near(timingFactor(0.19), 1 - 0.7*(0.11/0.22)), "timing falls linearly between", r4(timingFactor(0.19)));
  check(angleFactor(0) === 1.0 && near(angleFactor(PI/2), 0.9) && near(angleFactor(PI), 0.5), "tackle angle: front 1.0, side 0.9, behind 0.5");
  check(near(shieldAngle(PI), 0.6) && near(shieldAngle(PI/2), 1.0) && near(shieldAngle(3*PI/4), 0.8), "shield angle: behind 0.6, side 1.0 (0.8 between)");
  check(lateness(0.05) === 0 && near(lateness(0.3), 1) && pTackleFoul(1, 0.3) > pTackleFoul(0, 0) && pTackleFoul(0, 0) === 0, "late or from behind raises the tackle's foul chance");
}

/* ---------- fatigue (G0) ---------- */
{
  check(fatigueFactor(0.7, 0.7) === 1 && fatigueFactor(1, 1) === 1, "fatigueFactor(b, b) = 1");
  check(near(fatigueFactor(1, 0), 1/0.85) && near(fatigueFactor(0, 1), 0.85), "a spent holder against a fresh challenger 1.18, the other way 0.85", [r4(fatigueFactor(1, 0)), r4(fatigueFactor(0, 1))]);
  check(near(fF(0.5), 0.925), "fF(b) = 0.85 + 0.15 b");
}

/* ---------- reach, slide, recovery ---------- */
{
  check(near(standReach(1), 0.9525, 1e-4) && near(standReach(50), 1.0763, 1e-4) && near(standReach(99), 1.20, 1e-4), "standReach(1) = 0.9525, (50) = 1.0763, (99) = 1.20",
    [r4(standReach(1)), r4(standReach(50)), r4(standReach(99))]);
  check(near(pokeReach(50) - standReach(50), 0.10), "the poke reaches 0.10 m further");
  check(near(slideReach(0, 8), 1.6) && near(slideReach(8, 8), 2.5) && near(slideReach(4, 8), 2.05) && near(slideReach(12, 8), 2.5), "slideReach = 1.6 + 0.9 v/vTop (v capped at vTop)");
  // the slide's friction: mu 0.55 x g
  const st = {x: 0, z: 0, vx: 6, vz: 0};
  let d = 0, t = 0;
  while (st.vx > 0 && t < 5){ d += slideStep(st, 1/60); t += 1/60; }
  check(near(d, slideTravel(6), 1e-9) && near(slideTravel(6), 36/(2*0.55*9.81), 1e-12) && Math.abs(t - slideTime(6)) < 1/60 + 1e-9, "a slide from 6 m/s travels v^2/(2 mu g) on grass (mu 0.55)", {d: r4(d), want: r4(slideTravel(6))});
  check(slideTravel(7) > slideTravel(5) && slideTravel(5) > slideTravel(3), "slide distance grows with the approach speed");
  check(near(recovery(99), 0.45) && near(recovery(0), 1.05) && near(recovery(50), 0.45 + 0.6*(49/99)) && recovery(50, true) > recovery(50), "recovery = 0.45 + 0.6 (1 - agility/99) s, longer after a miss");
}

/* ---------- tunables ---------- */
{
  const before = tuneGet('DUEL_K');
  check(tuneSet('DUEL_K', 16) === 16 && near(p5050(108, 100), 1/(1 + Math.exp(-0.5))), "the engine reads a tunable at call time (DUEL_K 16)");
  check(tuneSet('DUEL_K', 999) === TUNE.DUEL_K.max && tuneSet('NOPE', 1) === undefined, "tuneSet clamps to the range and ignores unknown keys");
  tuneReset();
  check(tuneGet('DUEL_K') === before && TUNE_KEYS.every(k => TUNE[k].value === TUNE[k].def && TUNE[k].min <= TUNE[k].def && TUNE[k].def <= TUNE[k].max && typeof TUNE[k].label === 'string'),
    "tuneReset restores every default; every entry has {value, def, min, max, label} with def in range", TUNE_KEYS.length);
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-duel.json"), JSON.stringify(res, null, 1));
console.log(`unit/duel: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
