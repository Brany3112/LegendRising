// qa/tr2b-tackle.mjs: the tackle of TRAINING-SPEC section 3 in the real engine (Node, seeded, 400 trials per cell).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance "qa/tr2b-tackle.mjs".
//
//   1. the win rate follows the T - C logistic within 5 points (three rating gaps, front, on time);
//   2. from behind a tackle wins less and gives more fouls;
//   3. a late tackle (|dt| 0.3 s) gives more fouls than one on time (|dt| <= 0.08 s);
//   4. a won tackle sends the ball away along the tackling foot (speed above 0, within 45 degrees of the foot's way),
//      and through the contact the ball never moves more than 0.1 m in one step (no teleport), in the real simulation;
//   5. a slide's distance grows with the approach speed (the real slide in actionStep), and the time he lies after it
//      follows his agility (duel.recovery);
//   6. the standing reach: for tackling 20, 50 and 90 a standing tackle meets the ball at standReach - 0.05 m and never
//      at standReach + 0.10 m; a poke reaches 0.10 m further;
//   7. a tackle on a shielder follows logistic((T - S)/8) x timing x angle within 5 points, not (T - C);
//   8. the player's own standing tackle (startAction from his controls) is timed by when he presses: in a real match,
//      presses at the man on the ball made whenever he is within 1.6 m are not on time by construction (the engine
//      does not aim his foot at where the ball will be), and a press once the ball is going away from him is late.
//
//   node qa/tr2b-tackle.mjs      exits 1 on any failed check; writes qa/out/tr2b-tackle.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {tackleOutcome, TACKLE} from "../js/life/football/touch.js";
import {ratings} from "../js/life/football/zone.js";
import {pTackleWin, standReach, pokeReach, recovery, logistic} from "../js/life/football/duel.js";
import {mulberry32} from "../js/life/football/rng.js";
import {BALL, ballKick} from "../js/life/football/ball.js";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {makePitch} from "../js/life/football/pitchspec.js";
import {startTackle, refreshPred} from "../js/life/football/actions.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2b-tackle", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const R = BALL.R, N = 1000;      // (the plan asks for at least 400 a cell; 1000 keeps the standard error near 1.6 points)
// facing: yaw 0 faces -Z; -PI/2 faces +X; PI/2 faces -X
const FX = -Math.PI/2, FMX = Math.PI/2;
// an attribute record whose tackle rating T and control rating C come out near the asked numbers
function atWith(o){ return Object.assign({ctrl: 50, agility: 50, composure: 50, tackling: 50, power: 50, jumping: 50, interception: 50, dribbling: 50}, o); }

// one cell: a stationary tackler at the origin facing +X, the ball 0.75 m ahead of him, the carrier 0.6 m beyond it
// facing him (front) or away (behind). Returns {won, fouls, ridden, p}
function cell(tAt, cAt, opt = {}){
  const r = mulberry32(opt.seed || 7);
  const tk = {x: 0, z: 0, yaw: FX, vx: 0, vz: 0, at: tAt};
  const ca = {x: 1.35, z: 0, yaw: opt.behind ? FX : FMX, vx: 0, vz: 0, at: cAt, shield: opt.shield ? {on: true} : null};
  const ball = {p: {x: 0.75, y: R, z: 0}, v: {x: 0, y: 0, z: 0}};
  let won = 0, fouls = 0, ridden = 0, p = 0, contact = 0;
  for (let i = 0; i < N; i++){
    const o = tackleOutcome(tk, ca, ball, {kind: 'stand', target: {x: 0.75, z: 0}}, {}, r);
    if (o.result === 'won' || o.result === 'poke') won++;
    if (o.result === 'foul') fouls++;
    if (o.ridden) ridden++;
    if (o.tBall >= 0) contact++;
    p = o.p;
  }
  return {won: won/N, fouls: fouls/N, ridden: ridden/N, p, contact: contact/N};
}

/* ---------- 1. the T - C logistic ---------- */
{
  const rows = [];
  let ok = true;
  for (const [tkl, ctl] of [[35, 70], [50, 50], [80, 40]]){
    const tAt = atWith({tackling: tkl}), cAt = atWith({ctrl: ctl, agility: ctl});
    const T = ratings(tAt).T, C = ratings(cAt).C, want = pTackleWin(T, C, 1, 1);
    const c = cell(tAt, cAt, {seed: tkl*7 + ctl});
    rows.push({gap: r3(T - C), want: r3(want), got: c.won, contact: c.contact});
    if (!(Math.abs(c.won - want) <= 0.05 && c.contact === 1)) ok = false;
  }
  check(ok, "the standing tackle wins at clamp(logistic((T - C)/8) x timing x angle) within 5 points (front, on time, ball first every time)", rows);
}

/* ---------- 2. from behind ---------- */
{
  const tAt = atWith({tackling: 70}), cAt = atWith({});
  const f = cell(tAt, cAt, {seed: 11}), b = cell(tAt, cAt, {seed: 11, behind: true});
  check(b.won < f.won - 0.1 && b.fouls > f.fouls + 0.1, "from behind: fewer won, more fouls", {front: f, behind: b});
}

/* ---------- 3. late against on time ---------- */
{
  // the ball rolls across in front of him at 0.8 m/s (toward the side his sweep ends on), 0.55 m out. On time: the
  // tackle is aimed where the ball will be at mid-sweep (the foot and the ball get to that point together). Late: it is
  // aimed where the ball was lateBy s before (the ball has gone by when the foot gets there). A carrier runs 1.4 m behind.
  const v = -0.8, X = 0.55, tMid = TACKLE.stand.wind + TACKLE.stand.active/2;
  const run = (lateBy, seed) => {
    const r = mulberry32(seed);
    const tk = {x: 0, z: 0, yaw: FX, vx: 0, vz: 0, at: atWith({tackling: 60})};
    const z0 = -v*tMid*0.5;                  // (the ball crosses his front during the sweep)
    const zMid = z0 + v*tMid, zc = zMid - v*lateBy;
    let fouls = 0, dts = [];
    for (let i = 0; i < N; i++){
      const ca = {x: X, z: z0 + 1.4, yaw: 0, vx: 0, vz: v, at: atWith({})};
      const o = tackleOutcome(tk, ca, {p: {x: X, y: R, z: z0}, v: {x: 0, y: 0, z: v}}, {kind: 'stand', target: {x: X, z: zc}}, {}, r);
      if (o.result === 'foul') fouls++;
      if (o.tBall >= 0) dts.push(o.dt);
    }
    const mdt = dts.reduce((s, x) => s + x, 0)/Math.max(1, dts.length);
    return {fouls: fouls/N, meanDt: r3(mdt), contacts: dts.length, lateBy};
  };
  // (the scenario whose measured lateness is nearest 0.3 s is the late one)
  const on = run(0, 5);
  let late = null;
  for (let k = 0.1; k <= 0.6; k += 0.05){ const x = run(k, 5); if (x.contacts > N/2 && (!late || Math.abs(x.meanDt - 0.3) < Math.abs(late.meanDt - 0.3))) late = x; }
  check(on.contacts > N/2 && Math.abs(on.meanDt) <= 0.08 && late && Math.abs(late.meanDt - 0.3) <= 0.06 && late.fouls > on.fouls + 0.1,
    "a late tackle (dt +0.3 s) gives more fouls than one on time (|dt| <= 0.08 s)", {on, late});

  // a carrier walking or jogging straight at him, the tackle aimed where the ball will be at mid-sweep (as the engine
  // aims it): on time (timing 1), and no late-tackle fouls from the front
  const rows = [];
  let ok = true;
  for (const vc of [0.5, 2, 3.5]){
    const r = mulberry32(31);
    const tk = {x: 0, z: 0, yaw: FX, vx: 0, vz: 0, at: atWith({tackling: 60})};
    const bx0 = 0.9 + vc*tMid, bxMid = 0.9;
    let fouls = 0, tim = 0, n = 0;
    for (let i = 0; i < N; i++){
      const ca = {x: bx0 + 0.45, z: 0, yaw: FMX, vx: -vc, vz: 0, at: atWith({})};
      const o = tackleOutcome(tk, ca, {p: {x: bx0, y: R, z: 0}, v: {x: -vc, y: 0, z: 0}}, {kind: 'stand', target: {x: bxMid, z: 0}}, {}, r);
      if (o.tBall < 0) continue;
      n++; tim += o.timing; if (o.result === 'foul') fouls++;
    }
    rows.push({v: vc, contacts: n, timing: r3(tim/Math.max(1, n)), fouls: r3(fouls/Math.max(1, n))});
    if (!(n > N/2 && tim/n >= 0.95 && fouls/n <= 0.02)) ok = false;
  }
  check(ok, "a carrier coming straight at him, the foot aimed at the ball's mid-sweep place: on time, no late fouls", rows);
}

/* ---------- 4. contact physics, in the real simulation ---------- */
const rec = (pid, slot, ovr = 60, extra = null) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : "CM", isGK: slot === "GK", isMe: false,
  at: Object.assign(attrsForAI({id: pid, ovr, pos: slot === "GK" ? "GK" : "CM"}), extra || {}), energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = yaw; a.set = null; a.plan = null; };
function drill(seed, extraT = null, extraC = null){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: [rec(101, "GK"), rec(102, "CM", 70, extraT)]}, {players: [rec(201, "GK"), rec(202, "CM", 50, extraC)]}],
    me: {team: 0, slot: "CM"}, rules: {offside: false}, kickoffTeam: 0});
  ms.phase = 'live'; ms.restart = null; ms.clock.running = true;
  for (const g of ms.agents.filter(a => a.isGK)) put(g, (g.team ? 1 : -1)*50, 0, 0);
  // the brains stay out of it: the two men do only what the test asks
  ms.cfg.noBrains = true;
  return ms;
}
const pin = ms => { for (const a of ms.agents) if (a.role === 'player'){ a.brain.next = 1e9; a.plan = null; } };
{
  let won = 0, ok = true, maxJump = 0, worst = 0;
  for (let s = 1; s <= 40; s++){
    const ms = drill(s);
    pin(ms);
    const T = ms.agents.find(a => a.team === 0 && !a.isGK), C = ms.agents.find(a => a.team === 1 && !a.isGK);
    put(T, 0, 0, FX); put(C, 1.35, 0, FMX);
    const b = ms.ball; b.state = 'free'; b.p.x = 0.75; b.p.y = R; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0;
    ms.poss.ctl = C.id; ms.poss.team = 1; refreshPred(ms);
    const act = startTackle(ms, T, 'stand', C, 0);
    if (act.out.result !== 'won' && act.out.result !== 'poke') continue;
    won++;
    const fd = act.out.footDir, imp = act.out.impulse, sp = Math.hypot(imp.x, imp.z);
    const ang = Math.acos(Math.max(-1, Math.min(1, (imp.x*fd.x + imp.z*fd.z)/(sp || 1))))*180/Math.PI;
    if (!(sp > 0 && ang <= 45)) ok = false;
    worst = Math.max(worst, ang);
    // through the contact: the ball's own step never jumps
    for (let i = 0; i < 40; i++){
      for (const a of [T, C]){ a.intent.dx = 0; a.intent.dz = 0; }
      const x0 = b.p.x, z0 = b.p.z;
      simStep(ms);
      const dj = Math.hypot(b.p.x - x0, b.p.z - z0);
      if (dj > maxJump) maxJump = dj;
    }
    if (ms.asserts.ballJump > 0) ok = false;
  }
  check(won >= 10 && ok && maxJump <= 0.1, "a won tackle sends the ball along the foot's way (within 45 degrees, speed above 0) and it never moves more than 0.1 m in a step",
    {won, worstAngle: r3(worst), maxStep: r3(maxJump)});
}

/* ---------- 5. the slide ---------- */
{
  const slide = (v, agility, seed = 3) => {
    const ms = drill(seed, {agility}); pin(ms);
    const T = ms.agents.find(a => a.team === 0 && !a.isGK), C = ms.agents.find(a => a.team === 1 && !a.isGK);
    put(T, 0, 0, FX); put(C, 30, 20, 0);
    T.m.vx = v; T.m.speed = v; T.m.heading = FX;
    const b = ms.ball; b.state = 'free'; b.p.x = 25; b.p.y = R; b.p.z = -20; b.v.x = b.v.y = b.v.z = 0;
    ms.poss.ctl = -1; refreshPred(ms);
    const act = startTackle(ms, T, 'slide', null, 0);
    const x0 = T.m.x;
    let t = 0, groundT = 0;
    while (T.act === act && t < 6){ T.intent.dx = 0; T.intent.dz = 0; simStep(ms); t += 1/60; if (T.state === 'ground') groundT += 1/60; }
    return {dist: r3(T.m.x - x0), lie: r3(groundT), rec: act.rec, missed: act.missed};
  };
  const s4 = slide(4, 60), s6 = slide(6, 60), s8 = slide(8, 60);
  check(s4.dist < s6.dist && s6.dist < s8.dist && s4.dist > 0.5, "the slide's distance grows with the approach speed (4, 6, 8 m/s)", {s4, s6, s8});
  const a30 = slide(6, 30), a90 = slide(6, 90);
  check(a30.lie > a90.lie + 0.2 && Math.abs(a30.rec - recovery(30, a30.missed)) < 1e-9 && Math.abs(a90.rec - recovery(90, a90.missed)) < 1e-9 && Math.abs(a30.lie - a30.rec) < 0.05,
    "the time he lies after a slide follows his agility: 0.45 + 0.6 (1 - agility/99) s (longer after a miss)", {agility30: a30, agility90: a90});
}

/* ---------- 6. the standing reach ---------- */
{
  const rows = [];
  let ok = true;
  for (const tkl of [20, 50, 90]){
    const meet = (kind, d) => {
      const r = mulberry32(3);
      const o = tackleOutcome({x: 0, z: 0, yaw: FX, vx: 0, vz: 0, at: atWith({tackling: tkl})}, {x: d + 0.9, z: 0, yaw: FMX, vx: 0, vz: 0, at: atWith({})},
        {p: {x: d, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}, {kind, target: {x: d, z: 0}}, {}, r);
      return o.tBall >= 0;
    };
    const sr = standReach(tkl), pr = pokeReach(tkl);
    const row = {tackling: tkl, reach: r3(sr), in: meet('stand', sr - 0.05), out: meet('stand', sr + 0.10), pokeIn: meet('poke', pr - 0.05), pokeOut: meet('poke', pr + 0.10)};
    rows.push(row);
    if (!(row.in && !row.out && row.pokeIn && !row.pokeOut && Math.abs(pr - sr - 0.10) < 1e-9)) ok = false;
  }
  check(ok, "a standing tackle meets the ball at standReach - 0.05 m and never at standReach + 0.10 m; the poke 0.10 m further (tackling 20, 50, 90)", rows);
}

/* ---------- 7. a tackle on a shielder ---------- */
{
  const rows = [];
  let ok = true;
  // (cells where S and C differ and neither formula is clamped, so each cell tells (T - S) from (T - C): a strong
  // shielder with poor control, a weak one with good control, and a strong one with average control)
  for (const [tkl, str, ctl] of [[40, 80, 30], [50, 35, 70], [70, 80, 50]]){
    const tAt = atWith({tackling: tkl}), cAt = atWith({power: str, jumping: str, ctrl: ctl});
    const T = ratings(tAt).T, rc = ratings(cAt), wantS = pTackleWin(T, rc.S, 1, 1), wantC = pTackleWin(T, rc.C, 1, 1);
    const c = cell(tAt, cAt, {seed: tkl + str, shield: true});
    rows.push({TminusS: r3(T - rc.S), TminusC: r3(T - rc.C), want: r3(wantS), notThis: r3(wantC), got: c.won});
    if (!(Math.abs(c.won - wantS) <= 0.05)) ok = false;
  }
  const sep = rows.every(r => Math.abs(r.want - r.notThis) > 0.15 && r.want > 0.05 && r.want < 0.92 && r.notThis > 0.05 && r.notThis < 0.92);
  check(ok && sep, "a tackle on a shielder wins at logistic((T - S)/8) x timing x angle within 5 points (not T - C)", rows);
}

/* ---------- 8. the player's own press is timed by him ---------- */
{
  const {configFor} = await import("./harness.mjs");
  const {startAction} = await import("../js/life/football/actions.js");
  // a man of the side without the ball, as the player (his controls' press: isMe, not the AI), presses at the man on it
  // now and then whenever he is within 1.6 m of him (the ball moving); what the tackle met and its timing are read off
  // the act. A press with the ball already going away from him should not be an on-time contact: late, or nothing met
  const r = mulberry32(99), rows = [];
  let awayN = 0, awayOnTime = 0;
  for (const seed of [1, 2, 3, 4]){
    const ms = createMatch(configFor(seed, {}));
    while (ms.phase !== 'over'){
      if (ms.phase === 'live' && ms.poss.ctl >= 0 && ms.ball.state === 'free' && Math.hypot(ms.ball.v.x, ms.ball.v.z) > 0.6){
        const c = ms.agents[ms.poss.ctl], b = ms.ball;
        for (const a of ms.agents){
          if (a.team === c.team || a.team < 0 || !a.onPitch || a.isGK || a.act || a.role !== 'player') continue;
          if (Math.hypot(c.m.x - a.m.x, c.m.z - a.m.z) > 1.6 || r() > 0.2) continue;
          // (the ball going away from him: its velocity against the way from him to it)
          const away = (b.p.x - a.m.x)*(b.v.x - (a.m.vx || 0)) + (b.p.z - a.m.z)*(b.v.z - (a.m.vz || 0)) > 0.3;
          const mA = ms.meAI, iM = a.isMe;
          ms.meAI = false; a.isMe = true;
          const act = startAction(ms, a, {kind: 'tackle', sub: 'stand', target: c.id});
          ms.meAI = mA; a.isMe = iM;
          if (act && act.out){
            const hit = act.out.tBall >= 0;
            if (away){ awayN++; if (hit && Math.abs(act.out.dt) <= 0.08) awayOnTime++; }
            if (hit) rows.push({dt: act.out.dt, timing: act.out.timing, away});
          }
          break;
        }
      }
      simStep(ms);
    }
  }
  const onTime = rows.filter(x => x.timing >= 0.999).length/Math.max(1, rows.length);
  check(rows.length >= 40 && onTime < 0.8 && awayN >= 20 && awayOnTime/awayN <= 0.2,
    "the player's own press is timed by him: under 80% of the contacts on time (it was every one), and a press with the ball going away from him is an on-time contact 20% of the time or less",
    {contacts: rows.length, onTimeShare: r3(onTime), meanAbsDt: r3(rows.reduce((s, x) => s + Math.abs(x.dt), 0)/Math.max(1, rows.length)), awayPresses: awayN, awayOnTimeShare: r3(awayOnTime/Math.max(1, awayN))});
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "tr2b-tackle.json"), JSON.stringify(res, null, 1));
console.log(`tr2b-tackle: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
