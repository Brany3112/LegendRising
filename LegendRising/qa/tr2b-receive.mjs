// qa/tr2b-receive.mjs: receiving on the move (ball-1) with the real controls (Node: control.js controlStep with the keys
// held, then simStep, as controller.js oneStep does without the renderer; every other player kept far away).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance "qa/tr2b-receive.mjs";
// TRAINING-SPEC section 3 (control zone and touch: the ball left touchDist(q) ahead, the touch in the receiver's frame).
//
// Runs: the player sprinting (W + Shift), jogging (W) or moving sideways (D), a pass along his way from behind him or
// from in front of him at 12 and 14 m/s; ball control 40, 50 and 90; 20 seeds each (720 runs).
//   1. control is kept for at least 2 s in at least 90% of the runs at ball control 50 or more (each cell);
//   2. the touch leaves the ball ahead of him at touchDist(q) within 0.3 m (its farthest lead over him as he runs on, the
//      ball flown from the touch on open grass: his later dribble touches do not cut it short);
//   3. a lower q gives a longer touch (the touch distance falls as q rises, binned);
//   no NaN anywhere.
//
//   node qa/tr2b-receive.mjs      exits 1 on any failed check; writes qa/out/tr2b-receive.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "./harness.mjs";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {refreshPred} from "../js/life/football/actions.js";
import * as CT from "../js/life/football/control.js";
import {P} from "../js/life/core/state.js";
import {touchDist} from "../js/life/football/zone.js";
import {createBall, createBallWorld, ballStep} from "../js/life/football/ball.js";

// the touch's own lead: the ball as the first touch left it, flown on open grass (ball.js) while he runs on at his speed
// along the touch's way, its farthest lead over him (his later dribble touches do not cut it short)
const OPEN = createBallWorld({});
function touchLead(ball, me, kx, kz){
  const c = createBall({x: ball.p.x, y: ball.p.y, z: ball.p.z, rollDecel: ball.rollDecel});
  c.v.x = ball.v.x; c.v.y = ball.v.y; c.v.z = ball.v.z; c.state = 'free'; c.grounded = ball.grounded;
  const vx = me.m.vx, vz = me.m.vz;
  let peak = (c.p.x - me.m.x)*kx + (c.p.z - me.m.z)*kz;
  for (let i = 1; i <= 150; i++){
    ballStep(c, OPEN, H);
    const lead = (c.p.x - me.m.x - vx*i*H)*kx + (c.p.z - me.m.z - vz*i*H)*kz;
    if (lead > peak) peak = lead;
  }
  return peak;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2b-receive", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const H = 1/60;

const MOVES = {sprint: {keys: ['w', 'shift'], dir: {x: 1, z: 0}}, jog: {keys: ['w'], dir: {x: 1, z: 0}}, lateral: {keys: ['d'], dir: null}};
function run(seed, move, from, speed, ctrl){
  const cfg = configFor(11, {}); cfg.meAI = false; cfg.seed = seed;
  const ms = createMatch(cfg); ms.meAI = false;
  const me = ms.agents[ms.me];
  me.at.ctrl = ctrl;
  const pin = [];
  for (const a of ms.agents){ if (a === me || a.role !== 'player') continue; pin.push([a, -45 + (a.id % 11), a.team ? 30 : -30]); }
  const pinAll = () => { for (const [a, x, z] of pin){ a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.plan = null; } };
  pinAll();
  ms.phase = 'live'; ms.restart = null; ms.clock.running = true;
  me.m.x = me.x0 = -30; me.m.z = me.z0 = 0; me.m.yaw = me.m.heading = -Math.PI/2; me.m.vx = me.m.vz = me.m.speed = 0;
  const b = ms.ball; b.state = 'free'; b.p.x = 45; b.p.y = 0.11; b.p.z = 30; b.v.x = b.v.y = b.v.z = 0;
  ms.poss.ctl = -1; ms.poss.team = me.team;
  CT.controlReset(); CT.CTRL.enabled = true;
  for (const k of MOVES[move].keys) CT.CTRL.held[k] = true;
  P.yaw = -Math.PI/2; P.pitch = -0.2;            // looking along +x
  refreshPred(ms);
  for (let i = 0; i < Math.round(2.5/H); i++){ b.p.x = 45; b.p.z = 30; b.v.x = b.v.z = 0; CT.controlStep(ms, me, H, {traits: {}}); simStep(ms, H); pinAll(); }
  // his way: where he is going now
  const sp = Math.hypot(me.m.vx, me.m.vz) || 1, ux = me.m.vx/sp, uz = me.m.vz/sp;
  const mate = ms.agents.find(a => a.team === me.team && a !== me && !a.isGK);
  // the pass: on his line, behind him coming on, or 12 m ahead coming at him
  // (from behind it starts 3 m back: a pass played from further behind a man sprinting at 8 m/s never reaches him)
  const d0 = from === 'behind' ? -3 : 12, sgn = from === 'behind' ? 1 : -1;
  b.state = 'free'; b.p.x = me.m.x + ux*d0; b.p.y = 0.11; b.p.z = me.m.z + uz*d0; b.v.x = sgn*ux*speed; b.v.y = 0; b.v.z = sgn*uz*speed;
  if (b.w){ b.w.x = b.w.y = b.w.z = 0; }
  b.last.agent = mate.id; b.last.team = me.team; b.last.kind = 'pass'; b.last.t = ms.t - 1;
  ms.poss.ctl = -1; ms.poss.team = me.team;
  refreshPred(ms);
  const from0 = ms.events.length;
  let ctlAt = -1, lostAt = -1, ev = null, peak = -9, nan = false;
  for (let i = 0; i < Math.round(4.0/H); i++){
    CT.controlStep(ms, me, H, {traits: {}});
    const n0 = ms.events.length;
    simStep(ms, H); pinAll();
    if (![b.p.x, b.p.y, b.p.z, b.v.x, b.v.z, me.m.x, me.m.z].every(Number.isFinite)) nan = true;
    for (let k = n0; k < ms.events.length; k++){
      const e = ms.events[k];
      if (e.kind !== 'touch' || e.agent !== me.id) continue;
      if (!ev && e.how === 'control'){ ev = e; peak = touchLead(b, me, ev.dx, ev.dz); }
    }
    const mine = ms.poss.ctl === me.id;
    if (ctlAt < 0 && mine) ctlAt = i;
    if (ctlAt >= 0 && lostAt < 0 && !mine) lostAt = i;
  }
  for (const k of MOVES[move].keys) CT.CTRL.held[k] = false;
  const kept = ctlAt >= 0 ? ((lostAt < 0 ? Math.round(4.0/H) : lostAt) - ctlAt)*H : 0;
  return {ctlAt, kept, q: ev ? ev.quality : null, td: ev ? ev.td : null, a0: ev ? ev.a0 : null, peak, nan, part: ev ? ev.part : null};
}

const cells = [];
let all = 0, nan = 0;
const pairs = [];
for (const move of ['sprint', 'jog', 'lateral']) for (const from of ['behind', 'front']) for (const speed of [12, 14]) for (const ctrl of [40, 50, 90]){
  let kept = 0, n = 0, tdOk = 0, tdN = 0, worst = 0;
  for (let s = 1; s <= 20; s++){
    const r = run(1000*ctrl + 100*speed + s + (from === 'front' ? 50 : 0) + (move === 'jog' ? 7 : move === 'lateral' ? 13 : 0), move, from, speed, ctrl);
    n++; all++;
    if (process.env.RCV_DEBUG && s <= 3) console.log(move, from, speed, ctrl, JSON.stringify({q: r.q, td: r.td, peak: r3(r.peak), kept: r3(r.kept), part: r.part}));
    if (r.nan) nan++;
    if (r.kept >= 2) kept++;
    if (r.td != null && r.peak > -9){
      tdN++;
      // (met further out than its touch distance on the run, the ball is carried on from where he met it: actions/touch.js)
      const want = r.a0 != null && r.a0 > r.td ? r.a0 : r.td, err = Math.abs(r.peak - want);
      if (err <= 0.3) tdOk++;
      worst = Math.max(worst, err);
      pairs.push([r.q, r.peak]);
    }
  }
  cells.push({move, from, speed, ctrl, kept: kept/n, touch: tdN ? tdOk/tdN : null, worstTouchErr: r3(worst), n});
}
const bad = cells.filter(c => c.ctrl >= 50 && c.kept < 0.9);
check(bad.length === 0, "control is kept for at least 2 s in at least 90% of the runs at ball control 50 or more (every cell)", bad.length ? bad : cells.filter(c => c.ctrl >= 50).map(c => `${c.move}/${c.from}/${c.speed}/${c.ctrl}: ${c.kept}`));
console.log("  ctrl 40 (reported): " + cells.filter(c => c.ctrl === 40).map(c => `${c.move}/${c.from}/${c.speed}: ${c.kept}`).join(", "));
const tdAll = cells.reduce((s, c) => s + (c.touch != null ? c.touch*c.n : 0), 0)/cells.reduce((s, c) => s + c.n, 0);
check(tdAll >= 0.9 && cells.every(c => c.ctrl < 50 || c.touch == null || c.touch >= 0.75), "the touch leaves the ball ahead of him at touchDist(q) within 0.3 m (90% of all runs; 75% of every cell at ball control 50 or more, the wider touches of 40 reported)",
  {share: r3(tdAll), worstCells: cells.filter(c => c.touch != null && c.touch < 0.9).map(c => `${c.move}/${c.from}/${c.speed}/${c.ctrl}: ${r3(c.touch)}`)});
// monotonic: the touch's measured length in q bins
{
  const bins = [[0, 0.35], [0.35, 0.55], [0.55, 0.75], [0.75, 1.01]].map(([lo, hi]) => {
    const xs = pairs.filter(([qq]) => qq >= lo && qq < hi).map(p => p[1]);
    return {q: `${lo}-${Math.min(1, hi)}`, n: xs.length, meanTouch: xs.length ? r3(xs.reduce((s, x) => s + x, 0)/xs.length) : null, want: r3(touchDist((lo + Math.min(1, hi))/2))};
  }).filter(b => b.n >= 10);
  const mono = bins.every((b, i) => i === 0 || b.meanTouch < bins[i - 1].meanTouch);
  check(bins.length >= 3 && mono, "a lower q gives a longer touch (the touch's length falls as q rises)", bins);
}
check(nan === 0, "no NaN anywhere", {runs: all, nan});

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "tr2b-receive.json"), JSON.stringify(Object.assign(res, {cells}), null, 1));
console.log(`tr2b-receive: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
