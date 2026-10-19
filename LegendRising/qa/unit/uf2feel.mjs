// qa/unit/uf2feel.mjs: the pure parts of UF2-A under plain node (USER-ISSUES Round 2, U17 to U19): touch.js's settle
// (the first touch killing the ball onto the preferred foot) and close control (the dribble below a sprint), and
// control.js's meter bands (the shot's sweet spot for a distance, a held pass's for its weight) and the kick types.
// Owner: UF2-A (stage UF2). Contract: plan/USER-ISSUES.md Round 2 (U17, U18, U19, U20).
//
//   node qa/unit/uf2feel.mjs      exits 1 on any failed check; writes qa/out/unit-uf2feel.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {firstTouch, dribbleTouch, SETTLE, CLOSE, ctrlLead} from "../../js/life/football/touch.js";
import {touchDist} from "../../js/life/football/zone.js";
import {BALL, createBall, createBallWorld, ballStep, ballKick} from "../../js/life/football/ball.js";
import {mulberry32} from "../../js/life/football/rng.js";
import {meterBand, shotGrade, passBand, METER, KICKS, CN, ASSISTS, CTRL, setKick, kickType, eyeAhead, eyeDrop, wheelStep, controlInput} from "../../js/life/football/control.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-uf2feel", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const H = 1/60, R = BALL.R, FACE_MX = Math.PI/2;      // yaw facing -X
// where a touched ball comes to rest from a standing body: [ahead (along -X), to his right (-Z side of -X is his right)]
function restOf(ballPos, v, roll = 1.1){
  const b = createBall({x: ballPos.x, y: ballPos.y, z: ballPos.z, rollDecel: roll});
  ballKick(b, v, null, {});
  const w = createBallWorld({});
  for (let i = 0; i < 900; i++){ ballStep(b, w, H); if (b.grounded && b.v.x === 0 && b.v.z === 0) break; }
  return {ahead: -b.p.x, right: -b.p.z, d: Math.hypot(b.p.x, b.p.z)};
}

/* ---------- the settle (U17) ---------- */
{
  const at = ctrl => ({ctrl, agility: 50, composure: 50, balance: 50});
  for (const [ctrl, speed] of [[70, 11], [45, 14], [30, 18]]){
    const agent = {x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(ctrl), foot: 'R'};
    const ball = {p: {x: -0.5, y: R, z: 0}, v: {x: speed, y: 0, z: 0}, rollDecel: 1.1};
    const push = firstTouch(agent, ball, {dir: null}, {pressure01: 0, bF: 1}, mulberry32(5));
    const set = firstTouch(agent, ball, {dir: null}, {pressure01: 0, bF: 1, settle: 1}, mulberry32(5));
    const a = restOf(ball.p, push.v), b = restOf(ball.p, set.v);
    const want = SETTLE.D + SETTLE.Q*(1 - set.q);
    check(set.settle === 1 && Math.abs(b.d - set.dist) < .1 && set.dist <= Math.min(touchDist(set.q), want)*1.12 + 1e-9 && b.d <= .75 && b.d < a.d,
      `control ${ctrl}, a ${speed} m/s pass: the settle rests it ${r3(b.d)} m out (within reach, 0.75 m at most), the push ${r3(a.d)} m`, {settle: r3(b.d), push: r3(a.d), q: r3(set.q)});
    // (to the foot's side on average over 40 seeds: a single touch's direction error can be as large as the offset)
    let side = 0;
    for (let k = 0; k < 40; k++) side += restOf(ball.p, firstTouch(agent, ball, {dir: null}, {pressure01: 0, bF: 1, settle: 1}, mulberry32(300 + k)).v).right/40;
    check(side > 0.02 && b.ahead > 0.2, `control ${ctrl}: the settle puts it ahead and to the right foot's side (a right-footer)`, {ahead: r3(b.ahead), right: r3(side)});
  }
  // a left-footer: to the left
  const L = firstTouch({x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(70), foot: 'L'}, {p: {x: -0.5, y: R, z: 0}, v: {x: 11, y: 0, z: 0}, rollDecel: 1.1}, {dir: null}, {pressure01: 0, bF: 1, settle: 1}, mulberry32(5));
  check(restOf({x: -0.5, y: R, z: 0}, L.v).right < -0.02, "a left-footer's settle goes to his left foot's side");
  // its errors are smaller: the spread of where it rests over 200 seeds
  const spread = settle => { const d = []; for (let i = 0; i < 200; i++){ const f = firstTouch({x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(40), foot: 'R'}, {p: {x: -0.5, y: R, z: 0}, v: {x: 15, y: 0, z: 0}}, {dir: null}, {pressure01: .5, bF: 1, settle}, mulberry32(100 + i)); d.push(f.dist); }
    const m = d.reduce((s, x) => s + x, 0)/d.length; return Math.sqrt(d.reduce((s, x) => s + (x - m)*(x - m), 0)/d.length); };
  const s0 = spread(0), s1 = spread(1);
  check(s1 < s0*.5, "the settle's length error is far smaller than a push touch's (a sigma 70% smaller, scaled by the shorter touch)", {push: r3(s0), settle: r3(s1)});
  // none asked, none given: the AI's touch is untouched (ctx.settle absent equals 0)
  const a0 = firstTouch({x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(60)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {dir: null}, {pressure01: 0, bF: 1}, mulberry32(9));
  const a1 = firstTouch({x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(60)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {dir: null}, {pressure01: 0, bF: 1, settle: 0}, mulberry32(9));
  check(a0.v.x === a1.v.x && a0.v.z === a1.v.z && a0.dist === a1.dist, "without a settle the touch is exactly as before (the AI never asks for one)");
}

/* ---------- close control (U17) ---------- */
{
  const ag = {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: 60, ctrl: 50}};
  const lead = (v, close, ctrl = 50) => dribbleTouch(Object.assign({}, ag, {at: {dribbling: 60, ctrl}}), {p: {x: -0.45, y: R, z: 0}}, {x: -1, z: 0}, v, {bF: 1, close, ctrl}, mulberry32(4)).lead;
  const jog = lead(4, 1), jogN = lead(4, 0), spr = lead(8, 0), cl40 = lead(4, 1, 40);
  check(jog < jogN && jog <= 1.0, "at a jog with close control the touch leads it about a metre at most, less than without", {close: r3(jog), normal: r3(jogN)});
  check(spr > jog + .6, "a sprint (no close control) pushes it much further", {sprint: r3(spr), jog: r3(jog)});
  check(Math.abs(jog/(CLOSE.L0 + CLOSE.LV*4) - Math.sqrt(ctrlLead(50))) < .2 && cl40 > jog, "Ball Control still counts under close control (a poorer touch a little longer)", {c50: r3(jog), c40: r3(cl40)});
  const d0 = dribbleTouch(ag, {p: {x: -0.45, y: R, z: 0}}, {x: -1, z: 0}, 4, {bF: 1}, mulberry32(4)), d1 = dribbleTouch(ag, {p: {x: -0.45, y: R, z: 0}}, {x: -1, z: 0}, 4, {bF: 1, close: 0}, mulberry32(4));
  check(d0.v.x === d1.v.x && d0.lead === d1.lead, "without close control the dribble is exactly as before (the AI never asks for it)");
}

/* ---------- the meter (U18, U19) and the kick types (U20) ---------- */
{
  const near = meterBand(10, 50, 1), far = meterBand(28, 50, 1), off = meterBand(28, 50, 0), tech = meterBand(28, 99, 0);
  check(near.c < far.c && far.hi <= METER.SHOT_MAX && near.lo >= .2, "the shot's sweet spot sits higher for a longer shot, always under the over-hit", {near, far});
  check(far.hi - far.lo > off.hi - off.lo + .1 && tech.hi - tech.lo > off.hi - off.lo, "the assists widen it (and so does Technique)", {on: r3(far.hi - far.lo), off: r3(off.hi - off.lo), tech: r3(tech.hi - tech.lo)});
  // in time: the charge p = 1 - (1 - t/0.85)^2 stays in the spot for at least 0.15 s with the assists on, 0.06 s off
  const tOf = p => CN.SHOT_FULL*(1 - Math.sqrt(1 - p));
  check(tOf(far.hi) - tOf(far.lo) >= .15 && tOf(off.hi) - tOf(off.lo) >= .06, "the window to let go in is readable: 0.15 s or more with the assists, 0.06 s or more without", {on: r3(tOf(far.hi) - tOf(far.lo)), off: r3(tOf(off.hi) - tOf(off.lo))});
  // the gold (perfect) spot in the middle of the sweet spot, smaller; off the spot a scuff, in it but off the gold good
  const g = b => shotGrade(b, far, {}).grade, mid = (far.lo + far.hi)/2;
  check(far.glo > far.lo && far.ghi < far.hi && Math.abs((far.glo + far.ghi)/2 - mid) < 1e-9 && far.ghi - far.glo < (far.hi - far.lo)/2,
    "the gold spot sits in the middle of the sweet spot and is smaller than half of it", {far});
  check(g(mid) === "perfect" && g((far.lo + far.glo)/2) === "good" && g((far.ghi + far.hi)/2) === "good" && g(far.lo - .02) === "scuff" && g(far.hi + .02) === "scuff",
    "a shot let go in the gold is perfect, in the sweet spot good, before or after it scuffed", {mid: g(mid), early: g(far.lo - .02), late: g(far.hi + .02)});
  const e1 = shotGrade(far.glo - .01, far, {}).e, e2 = shotGrade(far.lo + .001, far, {}).e, o = shotGrade(far.hi + .05, far, {});
  check(e1 < e2 && o.over && !shotGrade(far.lo - .05, far, {}).over, "the further from the gold the further off it goes; past the spot is over-hit, before it under-hit", {e1, e2});
  const pb1 = passBand(14, 25, 50, 1), pb0 = passBand(14, 25, 50, 0);
  check(Math.abs(pb1.c - pb0.c) < 1e-12 && pb1.hi - pb1.lo > pb0.hi - pb0.lo && pb1.lo < pb1.c && pb1.hi > pb1.c, "a held pass's spot is centred on the weight for its distance, wider with the assists", {on: pb1, off: pb0});
  check(KICKS.map(k => k.id).join() === "chip,curl,normal,placed,driven" && ASSISTS.join() === "on,low,off", "the kick types top to bottom and the assist levels", KICKS.map(k => k.label));
  // (U28 part E) no kick type to choose any more: the kick is Normal whatever was set, the contact a lesson's (setKick
  // still sets CTRL.contact), and the wheel moves nothing
  setKick("driven"); const d = {k: kickType().id, c: CTRL.contact}; setKick("chip"); const c = {k: kickType().id, c: CTRL.contact}; setKick("normal");
  check(d.k === "normal" && c.k === "normal" && d.c === -1 && c.c === 1 && CTRL.contact === 0, "the kick is always Normal; a lesson's contact still comes through setKick", {d, c});
  const k0 = CTRL.kick, c0 = CTRL.contact;
  for (const e of [{deltaY: 100, t: 1000}, {deltaY: -100, t: 1080}, {deltaY: 6, t: 2000}]) controlInput(Object.assign({type: "wheel"}, e));
  check(CTRL.kick === k0 && CTRL.contact === c0 && kickType().id === "normal", "scrolling the wheel changes nothing in football", {kick: CTRL.kick, contact: CTRL.contact});
  setKick("normal");
  check(eyeAhead(0, 1) < eyeAhead(-1.35, 1) && eyeAhead(-1.35, 1) <= .2 && eyeDrop(-1.3, 1) > eyeDrop(0, 1) && Math.abs(eyeAhead(-1.35, 1.1) - 1.1*eyeAhead(-1.35, 1)) < 1e-12,
    "the eye over the feet (U12): a little ahead of the neck, more and lower looking down, at most 0.2 of the height's scale, scaled with it", {level: eyeAhead(0, 1), down: eyeAhead(-1.35, 1)});
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-uf2feel.json"), JSON.stringify(res, null, 1));
console.log(`unit/uf2feel: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
