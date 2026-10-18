// qa/uf-turn.mjs: turning is done by the whole body (USER-ISSUES U1, U7; TRAINING-SPEC 2 "turning that differs
// standing vs sprinting ... no foot sliding, no snapping rotations").
// Owner: UF-A (TR stage 3, user fixes).
//
// Your first-person body (the view turned like a mouse turns it), your third-person body (LIFE profile, facing where it
// goes) and an AI footballer (FOOTBALL profile, the mover's facing, as football/view.js draws every match body) turn
// 90, 180 and 360 degrees standing and while running. For every run:
//   - the chest leads the pelvis by at most CAP rad (about 0.7: never a torso turret);
//   - the pelvis follows the feet: it is never more than LEGS rad from the planted feet (the legs are not wrung round
//     under a body that has turned on still feet);
//   - every planted foot stays planted: its contact point (the heel, the ball of the foot or the tips of the toes, the
//     one it turns about) moves at most 10 mm while it is down;
//   - at least one step for every 70 degrees turned;
//   - standing, once the turn is done the pelvis faces where the body faces again (within 0.25 rad).
// Contact sheets of each standing turn and of the running 180s: qa/out/uf-turn-*.png.
//
//   QA_PORT=8862 node qa/uf-turn.mjs [--sheets]     exits 1 on any failed check; writes qa/out/uf-turn.json
import {launch, career, freeze, report} from "./lib.mjs";
import {turn, metrics} from "./uf-turnlib.mjs";

const SHEETS = process.argv.includes("--sheets");
const ONLY = process.env.ONLY || "";
const CAP = .75, LEGS = 1.0, SKATE = 10;
const res = {name: "uf-turn", checks: [], ok: true, runs: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// [name, kind, segs, v0, standing]
const quarterTurns = n => Array.from({length: n}, (_, i) => ({T: .45, dir: 90*(i + 1), gait: "walk", cap: .9}));
const CASES = [
  ["ai-stand-90", "ai", [{T: .3}, {T: 2.0, face: 90}], 0, true],
  ["ai-stand-180", "ai", [{T: .3}, {T: 2.4, face: 179}], 0, true],
  ["ai-stand-360", "ai", [{T: .3}, {T: 1.2, face: 0, faceSpin: 300}, {T: 2.0, face: 360}], 0, true],
  ["fp-stand-90", "fp", [{T: .3}, {T: 2.0, look: 90, lookRate: 6}], 0, true],
  ["fp-stand-180", "fp", [{T: .3}, {T: 2.4, look: 180, lookRate: 6}], 0, true],
  ["fp-stand-360", "fp", [{T: .3}, {T: 3.0, look: 360, lookRate: 6}], 0, true],
  ["tp-stand-90", "tp", [{T: .3}, {T: .5, dir: 90, gait: "walk", cap: .9}, {T: 1.6}], 0, true],
  ["tp-stand-180", "tp", [{T: .3}, {T: .6, dir: 179, gait: "walk", cap: .9}, {T: 1.6}], 0, true],
  ["tp-stand-360", "tp", [{T: .3}, ...quarterTurns(4), {T: 1.6}], 0, true],
  ["ai-run-90", "ai", [{T: .6, dir: 0, gait: "run"}, {T: 1.8, dir: 90, gait: "run"}], 5, false],
  ["ai-run-180", "ai", [{T: .6, dir: 0, gait: "run"}, {T: 2.2, dir: 180, gait: "run"}], 5, false],
  ["ai-run-360", "ai", [{T: .6, dir: 0, gait: "run"}, {T: 3.0, dir: 0, spin: 120, gait: "run"}], 5, false],
  ["fp-run-90", "fp", [{T: .6, dir: 0, gait: "run"}, {T: 1.8, dir: 0, gait: "run", look: 90, lookRate: 3}], 5, false],
  ["fp-run-180", "fp", [{T: .6, dir: 0, gait: "run"}, {T: 2.2, dir: 0, gait: "run", look: 180, lookRate: 3}], 5, false],
  ["fp-run-360", "fp", [{T: .6, dir: 0, gait: "run"}, {T: 3.0, dir: 0, gait: "run", look: 360, lookRate: 3}], 5, false],
  ["tp-run-90", "tp", [{T: .6, dir: 0, gait: "run"}, {T: 1.8, dir: 90, gait: "run"}], 5, false],
  ["tp-run-180", "tp", [{T: .6, dir: 0, gait: "run"}, {T: 2.2, dir: 180, gait: "run"}], 5, false],
  ["tp-run-360", "tp", [{T: .6, dir: 0, gait: "run"}, {T: 3.0, dir: 0, spin: 120, gait: "run"}], 5, false]
];

const {page, close} = await launch({gfx: "low", seed: 1, w: 640, h: 480});
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  for (const [name, kind, segs, v0, standing] of CASES){
    if (ONLY && !name.includes(ONLY)) continue;
    const sheet = SHEETS && (standing || name.includes("180")) ? {every: 6, max: 40, ang: .6} : null;
    const r = await turn(page, {kind, segs, v0, label: name, sheet, sheetName: sheet ? "uf-turn-" + name : null});
    const t0 = segs[0].T - .05, T = segs.reduce((s, g) => s + g.T, 0);
    const m = metrics(r.rows, standing ? 0 : t0, T);
    res.runs[name] = m;
    if (r.sheetFile) console.log("     sheet", r.sheetFile);
    console.log(`info ${name}: ${JSON.stringify(m)}`);
    check(m.cap <= CAP, `${name}: the chest leads the pelvis by at most ${CAP} rad`, m.cap);
    check(m.legs <= LEGS, `${name}: the pelvis stays within ${LEGS} rad of the planted feet`, m.legs);
    check(m.skateMm <= SKATE, `${name}: planted feet stay planted (skate <= ${SKATE} mm)`, {skateMm: m.skateMm, stances: m.stances});
    const need = Math.max(1, Math.round(m.turned/70));
    check(m.steps >= need, `${name}: at least one step per 70 degrees turned`, {steps: m.steps, turned: m.turned, need});
    if (standing) check(m.lag <= .25, `${name}: the pelvis faces where the body faces once the turn is done`, m.lag);
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("uf-turn", res);
await close();
process.exit(res.ok ? 0 : 1);
