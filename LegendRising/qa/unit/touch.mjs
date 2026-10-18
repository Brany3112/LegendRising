// qa/unit/touch.mjs: js/life/football/touch.js under plain node.
// Owner: WP-C, then P2b-A (TRAINING-SPEC section 3: the control radius R as the reach, the first touch's q and touch
// distance in the receiver's frame, the standing reach, the T - C logistic, the slide on its own momentum). Contract
// DESIGN 1.4.12 and BUILD-PLAN Phase 2b; numbers 1.5.3 and tune.js; behaviour 3.1.4 (fouls 3.2.9).
//
//   node qa/unit/touch.mjs      exits 1 on any failed check; writes qa/out/unit-touch.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {TOUCH, TACKLE, reachEnvelope, firstTouch, dribbleTouch, dribbleCadence, tackleSweep, tackleOutcome, slideProfile,
  slideDistance, headerContact, classifyContact} from "../../js/life/football/touch.js";
import {q as qOf, touchDist} from "../../js/life/football/zone.js";
import {standReach} from "../../js/life/football/duel.js";
import {BALL, createBall, createBallWorld, ballStep, ballKick} from "../../js/life/football/ball.js";
import {dirOf} from "../../js/life/football/pitchspec.js";
import {mulberry32, truncSd} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-touch", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r4 = v => Math.round(v*1e4)/1e4;
const DEG = Math.PI/180, H = 1/60, R = BALL.R;
const sd = a => { const m = a.reduce((s, x) => s + x, 0)/a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m)*(x - m), 0)/(a.length - 1)); };
const FACE_MX = Math.PI/2;    // yaw facing -X (dirOf(pi/2) = (-1, 0))

// where a touched ball comes to rest, measured ahead of a standing body (its distance from him)
function restAt(ballPos, v, body, roll = 1.1){
  const b = createBall({x: ballPos.x, y: ballPos.y, z: ballPos.z, rollDecel: roll});
  ballKick(b, v, null, {});
  const w = createBallWorld({});
  for (let i = 0; i < 900; i++){ ballStep(b, w, H); if (b.grounded && b.v.x === 0 && b.v.z === 0) break; }
  return Math.hypot(b.p.x - body.x, b.p.z - body.z);
}
// the farthest lead a touched ball gets over a body running on at its velocity along dir
function leadAfter(ballPos, v, body, dir, roll = 1.1){
  const b = createBall({x: ballPos.x, y: ballPos.y, z: ballPos.z, rollDecel: roll});
  ballKick(b, v, null, {});
  const w = createBallWorld({});
  let lead = -9;
  for (let i = 1; i < 300; i++){
    ballStep(b, w, H);
    const l = (b.p.x - body.x - body.vx*i*H)*dir.x + (b.p.z - body.z - body.vz*i*H)*dir.z;
    if (l > lead) lead = l;
  }
  return lead;
}
// how far a touched ball rolls from where it was touched
function restAfter(ballPos, v, roll = 1.1){
  const b = createBall({x: ballPos.x, y: ballPos.y, z: ballPos.z, rollDecel: roll});
  ballKick(b, v, null, {});
  const w = createBallWorld({});
  for (let i = 0; i < 900; i++){ ballStep(b, w, H); if (b.grounded && b.v.x === 0 && b.v.z === 0) break; }
  return Math.hypot(b.p.x - ballPos.x, b.p.z - ballPos.z);
}

/* ---------- reach: the control radius R of spec 3 (zone.js) ---------- */
{
  const at = {ctrl: 50, agility: 50, composure: 50, balance: 50};
  const a = {x: 0, z: 0, yaw: FACE_MX, at};
  const at_ = (x, y, z, ag = a, v) => reachEnvelope(ag, {p: {x, y, z}, v: v || {x: 0, y: 0, z: 0}});
  const c = (0.55*50 + 0.2*50 + 0.15*50 + 0.1*50)/99, Rw = 0.9*(0.6 + 0.8*c);
  check(at_(-0.3, R, 0).part === 'foot' && at_(-0.3, 0.7, 0).part === 'thigh' && at_(-0.3, 1.2, 0).part === 'chest' && at_(-0.3, 1.8, 0).part === 'head',
    "the part from the real ball height: foot under 0.4 m, thigh, chest to 1.4 m, a header above");
  check(at_(-(Rw - 0.01), R, 0) && !at_(-(Rw + 0.01), R, 0) && Math.abs(at_(-0.5, R, 0).R - Rw) < 1e-9, "a ball ahead is in reach up to R = 0.9 (0.6 + 0.8 c)", r4(Rw));
  check(at_(0.4*Rw - 0.01, R, 0) && !at_(0.4*Rw + 0.02, R, 0), "facing matters: a ball behind him only within 0.4 R (no longer 'foot' at a metre)", r4(0.4*Rw));
  check(at_(-0.3, 2.3, 0) === null && at_(-1.0, 0.8, 0) === null, "a ball outside every envelope stays loose (null): over the head, beyond the thigh's reach");
  check(at_(-0.95, R, 0) === null, "a ball beyond R stays loose (null)");
  const fast = at_(-(Rw - 0.05), R, 0, a, {x: 24, y: 0, z: 0});
  check(fast === null, "a fast ball shrinks the radius (fSpeed: 24 m/s against vc ~13)");
  const jumper = {x: 0, z: 0, yaw: FACE_MX, y: 0.5, at};
  check(at_(-0.3, 2.3, 0, jumper).part === 'head', "a jump lifts the head envelope with it");
  const tall = {x: 0, z: 0, yaw: FACE_MX, scale: 1.1, at};
  check(at_(-0.3, 1.5, 0, tall).part === 'chest' && at_(-0.3, 1.5, 0).part === 'head', "heights scale with the body (1.1: chest up to 1.54 m)");
  check(at_(-0.5, R, 0.3).side === 'L' && at_(-0.5, R, -0.3).side === 'R', "facing -X the ball at +Z is on his left, at -Z on his right");
}

/* ---------- first touch (spec 3: q and the touch distance, in the receiver's frame) ---------- */
{
  const at = ctrl => ({ctrl, agility: 50, composure: 50, balance: 50});
  // standing, a 12 m/s pass from the front met 0.5 m out: the ball rests touchDist(q) in front of him
  for (const ctrl of [90, 50, 30]){
    const agent = {x: 0, z: 0, yaw: FACE_MX, vx: 0, vz: 0, at: at(ctrl)};
    const ball = {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}, rollDecel: 1.1};
    const ft = firstTouch(agent, ball, {dir: null}, {pressure01: 0, bF: 1}, mulberry32(12));
    const wantQ = qOf(at(ctrl), 12, 0, 1), d = restAt(ball.p, ft.v, agent);
    check(Math.abs(ft.q - wantQ) < 1e-12 && Math.abs(ft.dist/touchDist(ft.q) - 1) <= 0.15*2.5*(1 - ft.q) + 1e-9 && Math.abs(d - ft.dist) < 0.08 && ft.part === 'foot',
      `a 12 m/s pass met standing by control ${ctrl}: q from zone.q, the ball rests touchDist(q) ahead`, {q: r4(ft.q), touch: r4(ft.dist), rest: r4(d)});
  }
  // q falls with pressure and breath, and with the ball's speed over vc; a lower q is a longer touch
  const q0 = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {}, {pressure01: 0, bF: 1}, mulberry32(1)).q;
  const qp = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {}, {pressure01: 1, bF: 1}, mulberry32(1)).q;
  const qb = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {}, {pressure01: 0, bF: 0}, mulberry32(1)).q;
  const qv = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 24, y: 0, z: 0}}, {}, {pressure01: 0, bF: 1}, mulberry32(1)).q;
  check(Math.abs(q0 - qp - 0.2) < 1e-9 && Math.abs(q0 - qb - 0.1) < 1e-9 && qv < q0, "q: -0.2 under full pressure, -0.1 out of breath, -0.04 a m/s over vc", [r4(q0), r4(qp), r4(qb), r4(qv)]);
  // the speed is the ball's against him: the same pass met on the run is easier
  const run = {x: 0, z: 0, yaw: -FACE_MX, vx: 7, vz: 0, at: at(50)};
  const fr = firstTouch(run, {p: {x: 0.4, y: R, z: 0}, v: {x: 14, y: 0, z: 0}}, {dir: {x: 1, z: 0}}, {bF: 1}, mulberry32(3));
  check(Math.abs(fr.vRel - 7) < 1e-9 && fr.q === qOf(at(50), 7, 0, 1), "a pass from behind at 14 m/s to a man running at 7: q from the 7 m/s it closes at", {vRel: fr.vRel, q: r4(fr.q)});
  // receiving on the move: the ball is carried at his speed, its lead over him peaking at the touch distance
  const lead = leadAfter({x: 0.4, y: R, z: 0}, fr.v, {x: 0, z: 0, vx: 7, vz: 0}, {x: 1, z: 0});
  check(fr.v.x > 7 && Math.abs(lead - fr.dist) < 0.08, "a man running at 7 m/s: the touch is carried at his speed and leads him by touchDist(q)", {vx: r4(fr.v.x), lead: r4(lead), touch: r4(fr.dist)});
  // the way: the keys (intent.dir), else his facing
  const side = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(99)}, {p: {x: -0.4, y: R, z: 0}, v: {x: 3, y: 0, z: 0}}, {dir: {x: 0, z: 1}}, {bF: 1}, mulberry32(2));
  check(side.v.z > 0.5 && Math.abs(side.v.x) < 0.3*side.v.z, "the touch goes the way he means (the keys)", {vx: r4(side.v.x), vz: r4(side.v.z)});
  // the chest and the thigh: the ball drops off them
  const chest = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.3, y: 1.2, z: 0}, v: {x: 10, y: -1, z: 0}}, {}, {bF: 1}, mulberry32(1));
  const thigh = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.3, y: 0.7, z: 0}, v: {x: 10, y: -1, z: 0}}, {}, {bF: 1}, mulberry32(1));
  check(chest.part === 'chest' && chest.bounce && chest.v.y > 0 && thigh.part === 'thigh' && thigh.v.y > 0, "on the chest or the thigh the ball drops from there");
  const heavy = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(10)}, {p: {x: -0.4, y: R, z: 0}, v: {x: 30, y: 0, z: 0}}, {}, {pressure01: 1, bF: 0}, mulberry32(1));
  check(heavy.heavy && heavy.q === 0, "q under 0.3 is a heavy touch (0 here)", r4(heavy.q));
  // direction error: sigma (1 - ctrl/110) x 0.35 x vRel/15, truncated at 2.5
  const r2 = mulberry32(77), errs = [];
  for (let i = 0; i < 2000; i++) errs.push(firstTouch({x: 0, z: 0, yaw: FACE_MX, at: at(50)}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {}, {bF: 1}, r2).angErr);
  const sig = (1 - 50/110)*0.35*12/15;
  check(Math.abs(sd(errs)/(sig*truncSd(2.5)) - 1) < 0.06 && errs.every(e => Math.abs(e) <= 2.5*sig + 1e-12), "the first touch's direction error has sigma (1 - ctrl/110) 0.35 vRel/15, never beyond 2.5 sigma", {sd: r4(sd(errs)), sigma: r4(sig)});
}

/* ---------- dribbling ---------- */
{
  check(dribbleCadence(2) === 1 && dribbleCadence(4.5) === 2 && dribbleCadence(7) === 3, "dribble cadence: every stride under 3 m/s, every 2nd to 6, every 3rd above");
  // the lead is the farthest the ball gets ahead of a dribbler running on at his speed
  for (const [v, walk] of [[2, false], [6, false], [8, false], [1.5, true]]){
    const ag = {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: 100}};
    const ball = {p: {x: -0.4, y: R, z: 0}, rollDecel: 1.1};
    const dt = dribbleTouch(ag, ball, {x: -1, z: 0}, v, {bF: 1, walk}, mulberry32(3));
    const want = (0.6 + 0.22*v)*(walk ? 0.5 : 1);
    // fly the ball and a runner along the ball's own direction; the gap's growth is the lead
    const ux = dt.v.x/dt.speed, uz = dt.v.z/dt.speed;
    const b = createBall({x: ball.p.x, z: ball.p.z}); ballKick(b, dt.v, null, {});
    const w = createBallWorld({});
    let runner = 0, start = 0, gap = 0;
    for (let i = 0; i < 400; i++){
      ballStep(b, w, H); runner += v*H;
      const prog = (b.p.x - ball.p.x)*ux + (b.p.z - ball.p.z)*uz;
      gap = Math.max(gap, prog - runner);
    }
    check(Math.abs(dt.lead - want) < 1e-9 && Math.abs(gap - dt.lead)/dt.lead < 0.03, `dribbling at ${v} m/s${walk ? " (walking)" : ""}: the ball's lead peaks at 0.6 + 0.22 v${walk ? " x0.5" : ""} m`, {lead: r4(dt.lead), flown: r4(gap)});
  }
  // the spreads: angle (1 - drib/110)(0.06 + 0.10 v/8)(1 + 0.5(1 - bF)), length 15%(1 - drib/100)(1 + 0.5(1 - bF))
  const spreads = (drib, v, bF, seed) => {
    const r = mulberry32(seed), a = [], l = [];
    const want = 0.6 + 0.22*v;
    for (let i = 0; i < 2000; i++){
      const t = dribbleTouch({x: 0, z: 0, yaw: FACE_MX, at: {dribbling: drib}}, {p: {x: -0.4, y: R, z: 0}}, {x: -1, z: 0}, v, {bF}, r);
      a.push(t.angErr); l.push(t.lead/want - 1);
    }
    return {a: sd(a), l: sd(l)};
  };
  const s1 = spreads(50, 6, 1, 8), s2 = spreads(50, 6, 0, 8);
  const wantA = (1 - 50/110)*(0.06 + 0.10*6/8)*truncSd(2.5), wantL = 0.15*0.5*truncSd(2.5);
  check(Math.abs(s1.a/wantA - 1) < 0.06 && Math.abs(s1.l/wantL - 1) < 0.06, "dribble touch errors: angle and length spreads of 1.5.3 (dribbling 50, 6 m/s)", {angle: r4(s1.a), length: r4(s1.l)});
  check(Math.abs(s2.a/s1.a - 1.5) < 0.02 && Math.abs(s2.l/s1.l - 1.5) < 0.02, "  out of breath (bF 0) both grow by half", {angle: r4(s2.a/s1.a), length: r4(s2.l/s1.l)});
  // the foot: strong unless the ball is over 0.25 m to the weak side; the reach test of the touch
  const footFor = (lat, foot = 'Right') => dribbleTouch({x: 0, z: 0, yaw: FACE_MX, foot, at: {dribbling: 60}}, {p: {x: -0.5, y: R, z: lat}}, {x: -1, z: 0}, 4, {}, mulberry32(1)).foot;
  // facing -X, right is -Z (right of d = (-dz, dx) = (0, -1))
  check(footFor(-0.1) === 'R' && footFor(0.2) === 'R' && footFor(0.3) === 'L' && footFor(-0.3, 'Left') === 'R' && footFor(0.1, 'Left') === 'L', "the strong foot plays it unless the ball is over 0.25 m to the weak side");
  const okAt = (x, z) => dribbleTouch({x: 0, z: 0, yaw: FACE_MX, at: {}}, {p: {x, y: R, z}}, {x: -1, z: 0}, 4, {}, mulberry32(1)).ok;
  check(okAt(-0.8, 0) && !okAt(-1.0, 0) && !okAt(0.5, 0) && !okAt(-0.3, -0.5), "a dribble touch needs the ball within 0.9 m and 50 degrees ahead");
}

/* ---------- tackles (spec 3: reach, the T - C logistic, timing, angle, the slide) ---------- */
{
  const p = slideProfile(6, 8);
  check(Math.abs(p.v0 - 6) < 1e-12 && Math.abs(p.travel - 36/(2*0.55*9.81)) < 1e-9 && Math.abs(p.reach - (1.6 + 0.9*6/8)) < 1e-12 && Math.abs(slideDistance(p, 9) - p.travel) < 1e-9,
    "a slide carries its run-in (6 m/s), slows on grass friction (mu 0.55) and reaches 1.6 + 0.9 v/vTop", {travel: r4(p.travel), reach: r4(p.reach), tActive: r4(p.tActive)});
  check(slideProfile(8, 8).travel > slideProfile(5, 8).travel && slideProfile(1, 8).v0 === 2, "a faster run-in slides further; a slide is at least a 2 m/s lunge");
  // the standing sweep: inactive in the wind-up, active 0.25 s, through the aim point halfway, out to the reach
  const tk = {x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 60}};      // facing +X
  const tgt = {x: 0.6, z: 0};
  const at = t => tackleSweep(tk, 'stand', t, tgt);
  const mid = at(0.12 + 0.125), end = at(0.12 + 0.25), early = at(0.06);
  check(!early.active && early.phase === 'wind' && mid.active && Math.hypot(mid.foot.x - 0.6, mid.foot.z) < 1e-9, "a standing tackle winds up for 0.12 s, then its foot passes through the aimed point halfway through", {mid: [r4(mid.foot.x), r4(mid.foot.z)]});
  const reach = standReach(60), endD = Math.hypot(end.foot.x, end.foot.z), endA = Math.atan2(Math.abs(end.foot.z), end.foot.x)/DEG;
  check(Math.abs(endD + TACKLE.FOOT_R + R - reach) < 1e-9 && Math.abs(endA - 25) < 1e-6 && end.foot.r === 0.12 && Math.abs(end.reach - reach) < 1e-9,
    "  it sweeps a 50 degree cone out to the reach 0.95 + 0.25 tackling/99 m (to the ball's centre) with a 0.12 m foot", {reach: r4(reach), foot: r4(endD), angle: r4(endA)});
  check(at(0.5).phase === 'recover' || at(0.5).phase === 'done', "  then it recovers");
  const sp = slideProfile(7.5, 7.5);
  const sl = tackleSweep({x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, 'slide', 0, {dx: 1, dz: 0}, sp);
  const sl2 = tackleSweep({x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, 'slide', sp.tActive, {dx: 1, dz: 0}, sp);
  check(Math.abs(sl.foot.x - 0.9) < 1e-9 && Math.abs(Math.abs(sl.foot.z - sl2.foot.z) - 1.3) < 1e-9, "a slide's foot leads the body by 0.9 m and sweeps 1.3 m across while it is in reach");

  const r = mulberry32(21);
  const carrier = {x: 0, z: 0, yaw: -FACE_MX, at: {dribbling: 50, ctrl: 50, agility: 50}};   // facing +X, away from a tackler at -X
  const front = {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: 50, ctrl: 50, agility: 50}};      // facing -X, toward him
  const won = tackleOutcome({x: -1.25, z: 0, yaw: -FACE_MX, at: {tackling: 99, power: 99, interception: 99}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: -0.55, z: 0}}, {}, mulberry32(3));
  check(won.tBall > 0 && won.timing === 1 && won.angle === 1 && won.p > 0.8 && (won.result === 'won' || won.ridden), "a block tackle through the ball in front of the carrier meets it first, on time, from the front", {result: won.result, p: r4(won.p)});
  const foul = tackleOutcome({x: -1.0, z: 0, yaw: -FACE_MX, vx: 3, vz: 0, at: {tackling: 60}}, carrier, {p: {x: 0.6, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: 0.6, z: 0}}, {}, r);
  const sev = Math.min(1, 0.25 + 0.06*foul.closing + 0.3*foul.fromBehind);
  check(foul.result === 'foul' && foul.tLeg >= 0 && Math.abs(foul.severity - sev) < 1e-9 && foul.fromBehind === 1 && foul.severity >= 0.55,
    "a tackle from behind through the carrier's legs to the ball is a foul with severity 0.25 + 0.06 closing + 0.3 from behind (the leg-first geometry kept)", {severity: r4(foul.severity), closing: r4(foul.closing)});
  const miss = tackleOutcome({x: -4, z: 0, yaw: -FACE_MX, at: {tackling: 60}}, carrier, {p: {x: 0.6, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: 0.6, z: 0}}, {}, r);
  check(miss.result === 'miss' && miss.impulse === null && miss.tBall < 0, "a tackle out of reach misses");
  // a loose ball (no carrier): ball first takes it
  const loose = tackleOutcome({x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, null, {p: {x: 0.6, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: 0.6, z: 0}}, {}, mulberry32(5));
  check(loose.result === 'won' || loose.result === 'poke', "a tackle on a loose ball takes it when the foot gets there", loose.result);
  // the win roll: the T - C logistic times timing and angle
  const rate = (tAt, cAt) => {
    const rr = mulberry32(5); let w = 0, pp = 0;
    for (let i = 0; i < 2000; i++){
      const o = tackleOutcome({x: -1.25, z: 0, yaw: -FACE_MX, at: tAt}, {x: 0, z: 0, yaw: FACE_MX, at: cAt},
        {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, rr);
      if (o.result === 'won' || o.result === 'poke') w++;
      pp = o.p;
    }
    return {rate: w/2000, p: pp};
  };
  const strong = rate({tackling: 90, power: 80, interception: 80}, {ctrl: 40, agility: 40}), weak = rate({tackling: 30, power: 40, interception: 40}, {ctrl: 85, agility: 85});
  check(Math.abs(strong.rate - strong.p) < 0.03 && Math.abs(weak.rate - weak.p) < 0.03 && strong.rate > weak.rate + 0.4, "the tackle wins at pTackleWin(T, C, timing, angle) (a strong tackler against a poor dribbler, and the other way)",
    {strong, weak});
  const A = tackleOutcome({x: -1.25, z: 0, yaw: -FACE_MX, at: {tackling: 70}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, mulberry32(9));
  const B = tackleOutcome({x: -1.25, z: 0, yaw: -FACE_MX, at: {tackling: 70}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, mulberry32(9));
  check(JSON.stringify(A) === JSON.stringify(B), "the same seed gives the same tackle");
}

/* ---------- headers ---------- */
{
  const ag = {x: 0, z: 0, yaw: 0, at: {heading: 70}};           // facing -Z
  const head = {x: 0, y: 1.85, z: 0};
  const rh = 0.17 + 0.0015*70;
  check(headerContact(ag, {p: {x: 0, y: 1.85 + rh + R + 0.01, z: 0}, v: {x: 0, y: -3, z: 0}}, head, {kind: 'clear'}, {}, mulberry32(1)) === null &&
    headerContact(ag, {p: {x: 0, y: 1.85 + rh + R - 0.01, z: 0}, v: {x: 0, y: -3, z: 0}}, head, {kind: 'clear'}, {}, mulberry32(1)) !== null,
    "a header needs the ball within 0.17 + 0.0015 heading of the head plus its radius");
  const ball = {p: {x: 0, y: 1.9, z: 0}, v: {x: 0, y: -2, z: 9}};
  const h1 = headerContact(ag, ball, head, {kind: 'attack', look: {yaw: 0, pitch: 0}}, {}, mulberry32(1));
  const want = 0.4*Math.hypot(2, 9) + 6 + 0.06*70;
  check(Math.abs(h1.speed - want) < 1e-9 && Math.abs(Math.hypot(h1.v.x, h1.v.y, h1.v.z) - want) < 1e-9, "header speed 0.4|vIn| + 6 + 0.06 heading", r4(h1.speed));
  const h2 = headerContact(ag, ball, head, {kind: 'attack', look: {yaw: 0, pitch: 0}}, {running: true}, mulberry32(1));
  check(Math.abs(h2.speed - want - 3) < 1e-9, "  + 3 off a running jump");
  // directions and their spread
  const pit = (kind, seed, extra = {}) => {
    const r = mulberry32(seed), a = [];
    for (let i = 0; i < 2000; i++){ const h = headerContact(ag, ball, head, Object.assign({kind, look: {yaw: 0, pitch: 0}}, extra), {}, r); a.push(Math.atan2(h.v.y, Math.hypot(h.v.x, h.v.z))); }
    return a;
  };
  const att = pit('attack', 3), clr = pit('clear', 3);
  const mean = a => a.reduce((s, x) => s + x, 0)/a.length;
  const sig = (1 - 70/110)*6*DEG;
  check(Math.abs(mean(att) + 5*DEG) < 0.005 && Math.abs(mean(clr) - 20*DEG) < 0.005, "an attacking header goes 5 degrees down the look, a clearance 20 degrees up", {attack: r4(mean(att)/DEG), clear: r4(mean(clr)/DEG)});
  check(Math.abs(sd(att)/(sig*truncSd(2.5)) - 1) < 0.06, "the header's aim error has sigma (1 - heading/110) x 6 degrees", {sd: r4(sd(att)/DEG), sigma: r4(sig/DEG)});
  const hp = headerContact(ag, ball, head, {kind: 'pass', target: {x: 6, z: -6}}, {heading: 110}, mulberry32(1));
  const yawTo = Math.atan2(hp.v.z, hp.v.x), want2 = Math.atan2(-6, 6);
  check(Math.abs(yawTo - want2) < 1e-9 && hp.v.y > 0, "a header pass goes toward its target (heading 110: no error)", r4(yawTo/DEG));
}

/* ---------- unplanned contact (thresholds from vc) ---------- */
{
  const at = {ctrl: 50, agility: 50, composure: 50, balance: 50, interception: 50};
  const vc = 8 + 10*(0.55*50 + 0.2*50 + 0.15*50 + 0.1*50)/99;
  const ag = {x: 0, z: 0, at};
  const ball = s => ({v: {x: s, y: 0, z: 0}});
  check(classifyContact(ag, ball(vc + 9.9), 'receive') === 'control' && classifyContact(ag, ball(vc + 10.1), 'receive') === 'deflect', "the intended receiver controls a ball under vc + 10 m/s", r4(vc));
  check(classifyContact(ag, ball(vc - 0.1), 'intercept') === 'control' && classifyContact(ag, ball(vc + 0.1), 'intercept') === 'deflect' &&
    classifyContact(ag, ball(vc + 3.9), {plan: 'intercept', going: true}) === 'control', "interception by positioning: under vc is controlled (4 m/s more when he was going for it)");
  check(classifyContact(Object.assign({state: 'jockey'}, ag), ball(20), null) === 'block' && classifyContact(ag, ball(20), {stance: 'tackle'}) === 'block' &&
    classifyContact(Object.assign({state: 'tackle'}, ag), ball(20), 'intercept') === 'block', "an agent in a block, tackle or jockey stance blocks a ball he cannot control");
  check(classifyContact(ag, ball(5), null) === 'deflect' && classifyContact(ag, ball(5), {receiver: true}) === 'control', "anyone else deflects it; {receiver: true} is the intended receiver");
  const run = {m: {x: 0, z: 0, vx: 8, vz: 0, yaw: 0}, at};
  check(classifyContact(run, {p: {x: 0.5, y: R, z: 0}, v: {x: vc + 5, y: 0, z: 0}}, 'intercept') === 'control', "the speed read is the ball's against his body (a man running with it)");
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-touch.json"), JSON.stringify(res, null, 1));
console.log(`unit/touch: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
