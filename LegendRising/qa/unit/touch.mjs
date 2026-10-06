// qa/unit/touch.mjs: js/life/football/touch.js under plain node.
// Owner: WP-C, contract DESIGN 1.4.12; numbers 1.5.3; behaviour 3.1.4 (fouls 3.2.9); acceptance 2.3 WP-C (first touch
// resting distances) and the touch items of QA 4.3 and 4.4.
//
//   node qa/unit/touch.mjs      exits 1 on any failed check; writes qa/out/unit-touch.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {TOUCH, TACKLE, reachEnvelope, firstTouch, dribbleTouch, dribbleCadence, tackleSweep, tackleOutcome, slideProfile,
  slideDistance, headerContact, classifyContact} from "../../js/life/football/touch.js";
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

// how far a touched ball rolls from where it was touched
function restAfter(ballPos, v, roll = 1.1){
  const b = createBall({x: ballPos.x, y: ballPos.y, z: ballPos.z, rollDecel: roll});
  ballKick(b, v, null, {});
  const w = createBallWorld({});
  for (let i = 0; i < 900; i++){ ballStep(b, w, H); if (b.grounded && b.v.x === 0 && b.v.z === 0) break; }
  return Math.hypot(b.p.x - ballPos.x, b.p.z - ballPos.z);
}

/* ---------- reach envelopes ---------- */
{
  const a = {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: 50}};
  const at = (x, y, z, ag = a) => reachEnvelope(ag, {p: {x, y, z}});
  check(at(-0.3, R, 0).part === 'sole' && at(-0.6, R, 0).part === 'foot' && at(-0.3, 0.8, 0).part === 'thigh' && at(-0.3, 1.2, 0).part === 'chest' && at(-0.3, 1.8, 0).part === 'head',
    "reach parts by height: sole, foot, thigh, chest, head");
  check(at(-0.95, R, 0) === null && at(-0.8, 0.8, 0) === null && at(-0.3, 1.45, 0) === null && at(-0.3, 2.3, 0) === null, "a ball outside every envelope stays loose (null)");
  const foot = d => reachEnvelope({x: 0, z: 0, yaw: FACE_MX, at: {dribbling: d}}, {p: {x: -0.95, y: R, z: 0}});
  check(foot(99) && foot(99).part === 'foot' && foot(30) === null, "the foot reaches 0.75 + 0.003 dribbling m (0.95 m at 99, not at 30)");
  check(at(-0.5, R, 0.3).side === 'L' && at(-0.5, R, -0.3).side === 'R', "facing -X the ball at +Z is on his left, at -Z on his right");
  const jumper = {x: 0, z: 0, yaw: FACE_MX, y: 0.5, at: {}};
  check(at(-0.3, 2.3, 0, jumper).part === 'head', "a jump lifts the head envelope with it");
  const tall = {x: 0, z: 0, yaw: FACE_MX, scale: 1.1, at: {}};
  check(at(-0.3, 1.45, 0, tall).part === 'chest' && at(-0.3, 1.45, 0) === null, "heights scale with the body (1.1: chest up to 1.54 m)");
}

/* ---------- first touch (1.5.3 expected) ---------- */
{
  const r = mulberry32(12);
  for (const [ctrl, lo, hi] of [[90, 0.3, 0.5], [50, 0.8, 1.3], [30, 1.3, 1.9]]){
    const agent = {x: 0, z: 0, yaw: FACE_MX, at: {ctrl}};
    const ball = {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}, rollDecel: 1.1};
    const ft = firstTouch(agent, ball, {dir: null}, {pressure01: 0, bF: 1}, r);
    const d = restAfter(ball.p, ft.v);
    check(d >= lo && d <= hi && ft.part === 'foot', `a 12 m/s ground pass cushioned standing by control ${ctrl} rests ${lo} to ${hi} m away`, {rest: r4(d), absorb: r4(ft.absorb)});
  }
  // the absorb terms
  const ab = (o, ctx = {}) => firstTouch(Object.assign({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 50}}, o), {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {dir: null}, Object.assign({bF: 1}, ctx), mulberry32(1)).absorb;
  const base = 0.05 + 0.13*Math.pow(0.5, 1.2) + 0.01*2;
  check(Math.abs(ab({}) - base) < 1e-12, "absorb = 0.05 + 0.13(1 - ctrl/100)^1.2 + 0.01 max(0, |vIn| - 10) + ...", r4(ab({})));
  check(Math.abs(ab({}, {pressure01: 1}) - base - 0.12) < 1e-12 && Math.abs(ab({}, {bF: 0}) - base - 0.08) < 1e-12, "  + 0.12 under full pressure, + 0.08 out of breath");
  const chest = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 50}}, {p: {x: -0.3, y: 1.2, z: 0}, v: {x: 12, y: -1, z: 0}}, {dir: null}, {bF: 1}, mulberry32(1));
  check(chest.part === 'chest' && Math.abs(chest.absorb - (0.05 + 0.13*Math.pow(0.5, 1.2) + 0.01*Math.max(0, Math.hypot(12, 1) - 10) + 0.08)) < 1e-12 && chest.bounce, "  + 0.08 on the chest, and the ball drops from there (bounce)", r4(chest.absorb));
  const hard = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 0}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 39, y: 0, z: 0}}, {dir: null}, {pressure01: 1, bF: 0}, mulberry32(1));
  check(hard.absorb === TOUCH.ABSORB_MAX && hard.heavy, "absorb is capped at 0.6; a touch that leaves the ball over 1.5 m is heavy");
  const soft = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 90}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {dir: null}, {bF: 1}, mulberry32(1));
  check(!soft.heavy && soft.quality > 0.8, "a good cushion is not heavy and scores high quality", r4(soft.quality));
  // a 9 m/s tapped pass is receivable by a control-50 receiver (QA 4.4)
  const recv = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 50}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 9, y: 0, z: 0}}, {dir: null}, {bF: 1}, mulberry32(4));
  const dr = restAfter({x: -0.5, y: R, z: 0}, recv.v);
  check(dr < 1.3, "a pass arriving at 9 m/s rests within 1.3 m of a control-50 receiver", r4(dr));
  // direction error: sigma (1 - ctrl/110) x 0.35 x |vIn|/15, truncated at 2.5
  const r2 = mulberry32(77), errs = [];
  for (let i = 0; i < 2000; i++) errs.push(firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 50}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 12, y: 0, z: 0}}, {dir: null}, {bF: 1}, r2).angErr);
  const sig = (1 - 50/110)*0.35*12/15;
  check(Math.abs(sd(errs)/(sig*truncSd(2.5)) - 1) < 0.06 && errs.every(e => Math.abs(e) <= 2.5*sig + 1e-12), "the first touch's direction error has sigma (1 - ctrl/110) 0.35 |vIn|/15, never beyond 2.5 sigma", {sd: r4(sd(errs)), sigma: r4(sig)});
  // a push along WASD: 1 to 3 m/s on top of the cushion
  const push = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 99}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 2, y: 0, z: 0}}, {dir: {x: 0, z: 1}, push: 1}, {bF: 1}, mulberry32(2));
  check(Math.abs(push.v.z - 3) < 0.05 && push.push === 3, "a full push adds 3 m/s along the WASD direction", r4(push.v.z));
  const push0 = firstTouch({x: 0, z: 0, yaw: FACE_MX, at: {ctrl: 99}}, {p: {x: -0.5, y: R, z: 0}, v: {x: 2, y: 0, z: 0}}, {dir: {x: 0, z: 1}, push: 0}, {bF: 1}, mulberry32(2));
  check(Math.abs(push0.v.z - 1) < 0.05, "  the lightest push adds 1 m/s", r4(push0.v.z));
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

/* ---------- tackles ---------- */
{
  const p = slideProfile(50);
  check(Math.abs(p.travel - 3.3) < 1e-12 && p.tStop <= 1.1 && Math.abs(slideDistance(p, 5) - 3.3) < 1e-9 && p.ground === 0.8, "a slide travels 2.8 + 0.01 tackling m at 6 m/s squared, within its 1.1 s commitment, then 0.8 s on the ground", {tStop: r4(p.tStop), v0: r4(p.v0)});
  // the standing sweep: inactive in the wind-up, active 0.25 s, through the aim point halfway, out to full reach
  const tk = {x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 60}};      // facing +X
  const tgt = {x: 0.8, z: 0};
  const at = t => tackleSweep(tk, 'stand', t, tgt);
  const mid = at(0.12 + 0.125), end = at(0.12 + 0.25), early = at(0.06);
  check(!early.active && early.phase === 'wind' && mid.active && Math.hypot(mid.foot.x - 0.8, mid.foot.z) < 1e-9, "a standing tackle winds up for 0.12 s, then its foot passes through the aimed point halfway through", {mid: [r4(mid.foot.x), r4(mid.foot.z)]});
  const reach = 1.05 + 0.003*60, endD = Math.hypot(end.foot.x, end.foot.z), endA = Math.atan2(Math.abs(end.foot.z), end.foot.x)/DEG;
  check(Math.abs(endD - reach) < 1e-9 && Math.abs(endA - 25) < 1e-6 && end.foot.r === 0.12, "  it sweeps a 50 degree cone out to 1.05 + 0.003 tackling m with a 0.12 m foot", {reach: r4(endD), angle: r4(endA)});
  check(at(0.5).phase === 'recover' || at(0.5).phase === 'done', "  then it recovers");
  const sl = tackleSweep({x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, 'slide', 0, {dx: 1, dz: 0});
  const sl2 = tackleSweep({x: 0, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, 'slide', p.tStop, {dx: 1, dz: 0});
  check(Math.abs(sl.foot.x - 0.9) < 1e-9 && Math.abs(Math.abs(sl.foot.z - sl2.foot.z) - 1.3) < 1e-9, "a slide's foot leads the body by 0.9 m and sweeps 1.3 m across");

  // outcomes by what the foot meets first
  const r = mulberry32(21);
  const carrier = {x: 0, z: 0, yaw: -FACE_MX, at: {dribbling: 50}};   // facing +X, away from a tackler at -X
  const front = {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: 50}};      // facing -X, toward him
  const won = tackleOutcome({x: -1.6, z: 0, yaw: -FACE_MX, at: {tackling: 70}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: -0.55, z: 0}}, {}, r);
  check(won.result === 'won' && won.tBall > 0 && Math.hypot(won.impulse.x, won.impulse.z) >= 3, "a block tackle through the ball in front of the carrier wins it", {result: won.result, tBall: r4(won.tBall)});
  const foul = tackleOutcome({x: -1.0, z: 0, yaw: -FACE_MX, vx: 3, vz: 0, at: {tackling: 60}}, carrier, {p: {x: 0.6, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: 0.6, z: 0}}, {}, r);
  const sev = Math.min(1, 0.25 + 0.06*foul.closing + 0.3*foul.fromBehind);
  check(foul.result === 'foul' && foul.tLeg >= 0 && Math.abs(foul.severity - sev) < 1e-9 && foul.fromBehind === 1 && foul.severity >= 0.55,
    "a tackle from behind through the carrier's legs to the ball is a foul with severity 0.25 + 0.06 closing + 0.3 from behind", {severity: r4(foul.severity), closing: r4(foul.closing)});
  // the slide's leading foot crosses z = 0 (his legs) as it reaches x = 0, and passes wide of the ball further on
  const slideFoul = tackleOutcome({x: -1.5, z: -0.53, yaw: -FACE_MX, at: {tackling: 50}}, carrier, {p: {x: 1.2, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'slide', target: {dx: 1, dz: 0}}, {}, r);
  const sevS = Math.min(1, 0.25 + 0.06*slideFoul.closing + 0.3*slideFoul.fromBehind + 0.25);
  check(slideFoul.result === 'foul' && Math.abs(slideFoul.severity - sevS) < 1e-9 && slideFoul.severity > 0.85, "a slide through the man from behind adds 0.25 to the severity", {severity: r4(slideFoul.severity), closing: r4(slideFoul.closing)});
  const miss = tackleOutcome({x: -4, z: 0, yaw: -FACE_MX, at: {tackling: 60}}, carrier, {p: {x: 0.6, y: R, z: 0}, v: {x: 0, y: 0, z: 0}},
    {kind: 'stand', target: {x: 0.6, z: 0}}, {}, r);
  check(miss.result === 'miss' && miss.impulse === null, "a tackle out of reach misses");
  // a slide that takes the ball cleanly
  const sw = tackleOutcome({x: -3, z: 0.6, yaw: -FACE_MX, at: {tackling: 80}}, {x: 0, z: 1.6, yaw: 0, at: {dribbling: 40}}, {p: {x: 0, y: R, z: 0.6}, v: {x: 0, y: 0, z: 0}},
    {kind: 'slide', target: {dx: 1, dz: 0}}, {}, r);
  check(sw.result === 'won' || sw.result === 'poke', "a slide that reaches the ball away from the man takes it", sw.result);
  // a strong dribbler keeps a toe on more of the clean tackles; the same seed gives the same outcome
  const rate = drib => {
    const rr = mulberry32(5); let p = 0;
    for (let i = 0; i < 400; i++){
      const o = tackleOutcome({x: -1.6, z: 0, yaw: -FACE_MX, at: {tackling: 50}}, {x: 0, z: 0, yaw: FACE_MX, at: {dribbling: drib}},
        {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, rr);
      if (o.result === 'poke') p++;
    }
    return p/400;
  };
  const lo = rate(20), hi = rate(95);
  check(hi > lo + 0.1 && Math.abs(lo - 0.03) < 0.03 && Math.abs(hi - 0.325) < 0.07, "a strong dribbler keeps a toe on it more often (poke chance 0.1 + 0.005(dribbling - tackling))", {drib20: lo, drib95: hi});
  const A = tackleOutcome({x: -1.6, z: 0, yaw: -FACE_MX, at: {tackling: 70}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, mulberry32(9));
  const B = tackleOutcome({x: -1.6, z: 0, yaw: -FACE_MX, at: {tackling: 70}}, front, {p: {x: -0.55, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind: 'stand', target: {x: -0.55, z: 0}}, {}, mulberry32(9));
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

/* ---------- unplanned contact ---------- */
{
  const ag = {x: 0, z: 0, at: {ctrl: 50, interception: 50}};
  const ball = s => ({v: {x: s, y: 0, z: 0}});
  check(classifyContact(ag, ball(12), 'receive') === 'control' && classifyContact(ag, ball(24.5), 'receive') === 'deflect', "the intended receiver controls a ball under 18 + 0.12 ctrl (24 m/s at 50)");
  check(classifyContact(ag, ball(13.9), 'intercept') === 'control' && classifyContact(ag, ball(14.1), 'intercept') === 'deflect', "interception by positioning: under 8 + 0.12 interception is controlled (14 m/s at 50)");
  check(classifyContact(Object.assign({state: 'jockey'}, ag), ball(20), null) === 'block' && classifyContact(ag, ball(20), {stance: 'tackle'}) === 'block' &&
    classifyContact(Object.assign({state: 'tackle'}, ag), ball(20), 'intercept') === 'block', "an agent in a block, tackle or jockey stance blocks a ball he cannot control");
  check(classifyContact(ag, ball(5), null) === 'deflect' && classifyContact(ag, ball(5), {receiver: true}) === 'control', "anyone else deflects it; {receiver: true} is the intended receiver");
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-touch.json"), JSON.stringify(res, null, 1));
console.log(`unit/touch: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
