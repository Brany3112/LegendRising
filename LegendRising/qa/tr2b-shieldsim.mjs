// qa/tr2b-shieldsim.mjs: the shield of TRAINING-SPEC section 3 in the real simulation (Node, simStep, seeded).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance
// "qa/tr2b-shieldsim.mjs" and the Gate G0 reading of the shield challenge and of fatigue.
//
// The shielder is the player's agent (no brain drives him) with intent.shield set and the ball under his control; the
// defender is driven by the test (a scripted act keeps the brain off him) through the real mover, separation, the
// shield step (actions.js), the challenges and the pushing (sim.js) and the stamina model.
//   1. shielding against a defender with D - S = +20 costs more breath a second than against D - S = -20, by
//      stamina.js shieldRate's factor; not shielding costs nothing for the shield;
//   2. pressing from behind on a shielder for 3 s gives more fouls than from the side, and more after 3 s than after 1 s;
//   3. shield challenges (400 engagements a cell, equal breath): the defender wins at pShieldLoss within 5 points at
//      D - S of -20, 0, +20 from behind and from the side; from behind he wins less than from the side by the 0.6 to 1.0
//      ratio (within 0.08 where no clamp applies); at -60 and +60 the rates sit at the clamps 0.05 and 0.90 (within 0.02);
//      at D = S a shielder at breath 0.2 loses more often than one at breath 1.0, by fatigueFactor (within 5 points);
//      exactly one roll per engagement (none inside CHAL_GAP); a won challenge leaves the ball loose, with no jump above
//      0.1 m in a step.
//
//   node qa/tr2b-shieldsim.mjs      exits 1 on any failed check; writes qa/out/tr2b-shieldsim.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {makePitch} from "../js/life/football/pitchspec.js";
import {refreshPred} from "../js/life/football/actions.js";
import {ratings} from "../js/life/football/zone.js";
import {pShieldLoss, shieldAngle, fatigueFactor} from "../js/life/football/duel.js";
import {shieldRate} from "../js/life/stamina.js";
import {TUNE, tuneSet, tuneReset} from "../js/life/football/tune.js";
import {BALL} from "../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2b-shieldsim", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const R = BALL.R, H = 1/60, N = 400;

// a record whose shield rating S (or challenge rating D) is exactly v: every stat that feeds it at v
const flat = (id, v) => Object.assign(attrsForAI({id, ovr: 50, pos: 'CM'}), {ctrl: v, strength: v, balance: v, tackling: v, defAware: v, agility: 50, composure: 50});
const rec = (pid, slot, at, me = false) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : "CM", isGK: slot === "GK", isMe: me, at, energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = yaw; a.set = null; a.plan = null; };
// facing -X: yaw PI/2 (dirOf(yaw) = (-sin, -cos))
const dirOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});

function setup(seed, S, D){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: [rec(101, "GK", attrsForAI({id: 101, ovr: 50, pos: 'GK'})), rec(102, "CM", flat(102, S), true)]},
    {players: [rec(201, "GK", attrsForAI({id: 201, ovr: 50, pos: 'GK'})), rec(202, "CM", flat(202, D))]}], me: {team: 0, slot: "CM"}, rules: {offside: false}, kickoffTeam: 0});
  ms.phase = 'live'; ms.restart = null; ms.clock.running = true;
  for (const g of ms.agents.filter(a => a.isGK)) put(g, (g.team ? 1 : -1)*50, 0, 0);
  const me = ms.agents[ms.me], o = ms.agents.find(a => a.team === 1 && !a.isGK);
  put(me, 0, 0, Math.PI/2);
  me.intent.shield = true;
  const b = ms.ball; b.state = 'free'; b.p.x = -0.55; b.p.y = R; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0;
  b.last.agent = me.id; b.last.team = me.team; b.last.kind = 'dribble'; b.last.t = ms.t;
  ms.poss.ctl = me.id; ms.poss.team = me.team; ms.poss.agent = me.id;
  // the defender is the test's: a scripted act keeps the brain off him, his intent is set each step
  o.act = {kind: 'script', t: 0, dur: 1e9};
  refreshPred(ms);
  return {ms, me, o};
}
const stand = a => { a.intent.dx = 0; a.intent.dz = 0; a.intent.speedCap = Infinity; };
const toward = (a, x, z, v) => { const dx = x - a.m.x, dz = z - a.m.z, d = Math.hypot(dx, dz) || 1; a.intent.dx = dx/d; a.intent.dz = dz/d; a.intent.gait = 'run'; a.intent.speedCap = v; a.intent.face = null; };

/* ---------- 1. the breath ---------- */
{
  const cost = (gap, shield) => {
    const {ms, me, o} = setup(5, 50, 50 + gap);
    me.intent.shield = shield;
    put(o, 1.5, 0, -Math.PI/2);          // 1.5 m from him: within SH_NEAR, out of contact
    tuneSet('CHAL_V', 99);               // (no challenge in this one)
    for (let i = 0; i < 300; i++){ stand(me); stand(o); simStep(ms); }
    tuneReset();
    const A = me.st.acc;
    return {perSec: A.shieldT ? A.shield/A.shieldT : 0, t: A.shieldT || 0, ctl: ms.poss.ctl === me.id};
  };
  const hi = cost(20, true), lo = cost(-20, true), none = cost(20, false);
  const want = shieldRate(20)/shieldRate(-20), got = hi.perSec/lo.perSec;
  check(hi.t > 4.9 && lo.t > 4.9 && Math.abs(got - want) < 0.02*want && hi.perSec > lo.perSec, "shielding against D - S = +20 costs more breath a second than against -20, by stamina.js's factor",
    {plus20: r3(hi.perSec), minus20: r3(lo.perSec), ratio: r3(got), want: r3(want)});
  check(none.t === 0 && none.perSec === 0, "not shielding adds no shield cost", none);
}

/* ---------- 2. pushing from behind ---------- */
{
  const fouls = (secs, side, n = N) => {
    let f = 0, fb = 0;
    for (let s = 1; s <= n; s++){
      const {ms, me, o} = setup(1000 + s, 50, 50);
      tuneSet('CHAL_V', 99);
      put(o, 0.75, 0, Math.PI/2);         // behind him (he faces -X), in contact, leaning on him
      const steps = Math.round(secs/H);
      let fouled = false;
      for (let i = 0; i < steps && !fouled; i++){
        stand(me);
        if (side){
          // he keeps to the shielder's side as the shielder turns his back on him
          const f0 = dirOf(me.m.yaw), rx = -f0.z, rz = f0.x;
          toward(o, me.m.x + rx*0.75, me.m.z + rz*0.75, 6);
        } else {
          const f0 = dirOf(me.m.yaw);
          toward(o, me.m.x - f0.x*0.75, me.m.z - f0.z*0.75, 3);
        }
        const from = ms.events.length;
        simStep(ms);
        if (ms.events.slice(from).some(e => e.kind === 'foul')) fouled = true;
        if (o.pushT > 0) fb++;
      }
      tuneReset();
      if (fouled) f++;
    }
    return f/n;
  };
  const b1 = fouls(1, false), b3 = fouls(3, false), s3 = fouls(3, true);
  check(b3 > s3 + 0.15 && b3 > b1 + 0.15, "pressing from behind for 3 s gives more fouls than from the side, and more after 3 s than after 1 s", {behind1s: b1, behind3s: b3, side3s: s3});
}

/* ---------- 3. the challenges ---------- */
// one engagement: the defender comes in at the side (or from behind) at 2 m/s toward the ball's side of him, already at
// the edge of contact range (so the shielder has not yet turned his back on him), then leans on him for dur s (by
// default just under CHAL_GAP: one engagement). Returns {won, rolls, jump, loose, times (of each roll)}
function engage(seed, S, D, side, breath = null, dur = TUNE.CHAL_GAP.value - 0.05){
  const {ms, me, o} = setup(seed, S, D);
  tuneSet('PUSH_RATE', 0);              // (the pushing is item 2's)
  if (breath != null){ me.st.B = breath; me.st.cap = Math.max(me.st.cap, breath); }
  // the defender: behind (the shielder faces -X, so behind is +X) or at his side (+Z is his right... either side)
  const R0 = TUNE.CHAL_R.value;
  if (side) put(o, 0, R0 - 0.01, Math.PI); else put(o, R0 - 0.01, 0, Math.PI/2);
  // the ball on his far side from the defender already, so the shield's own touch does not move it
  const ux = me.m.x - o.m.x, uz = me.m.z - o.m.z, ul = Math.hypot(ux, uz);
  ms.ball.p.x = me.m.x + ux/ul*TUNE.SH_BALL.value; ms.ball.p.z = me.m.z + uz/ul*TUNE.SH_BALL.value;
  me.shield = {on: true, by: o.id, since: ms.t, S: 0, D: 0, touchT: ms.t};
  { const bx = ms.ball.p.x - o.m.x, bz = ms.ball.p.z - o.m.z, bl = Math.hypot(bx, bz); o.m.vx = 2*bx/bl; o.m.vz = 2*bz/bl; o.m.speed = 2; o.m.heading = Math.atan2(-bx, -bz); }
  refreshPred(ms);
  let rolls = 0, won = null, jump = 0, loose = null;
  const from = ms.events.length, times = [];
  for (let i = 0; i < Math.round(dur/H); i++){
    stand(me);
    toward(o, ms.ball.p.x, ms.ball.p.z, 2.0);
    const bx = ms.ball.p.x, bz = ms.ball.p.z, n0 = ms.events.length;
    simStep(ms);
    for (let k = n0; k < ms.events.length; k++){
      const e = ms.events[k];
      if (e.kind !== 'shieldChal') continue;
      rolls++; times.push(e.t);
      if (won == null){ won = e.won; if (e.won) loose = ms.poss.ctl !== me.id; }
    }
    if (won) jump = Math.max(jump, Math.hypot(ms.ball.p.x - bx, ms.ball.p.z - bz));
    if (ms.phase !== 'live') break;
  }
  tuneReset();
  const ev = ms.events.slice(from).find(e => e.kind === 'shieldChal');
  return {won, rolls, jump, loose, times, p: ev ? ev.p : null, angle: ev ? ev.angle : null, fatigue: ev ? ev.fatigue : null};
}
function cellOf(S, D, side, breath = null, base = 0){
  let w = 0, n = 0, bad = 0, maxJump = 0, notLoose = 0, p = null, angle = null, fat = null;
  for (let s = 1; s <= N; s++){
    const e = engage(base + s, S, D, side, breath);
    if (e.won == null){ bad++; continue; }
    n++; if (e.won){ w++; if (!e.loose) notLoose++; maxJump = Math.max(maxJump, e.jump); }
    if (e.rolls !== 1) bad++;
    p = e.p; angle = e.angle; fat = e.fatigue;
  }
  return {rate: n ? w/n : null, n, bad, maxJump: r3(maxJump), notLoose, p, angle, fatigue: fat};
}
{
  const rows = [];
  let ok = true, oneRoll = true, jumps = 0, notLoose = 0;
  const rates = {};
  for (const gap of [-20, 0, 20]){
    for (const side of [false, true]){
      const S = 50, D = 50 + gap;
      const c = cellOf(S, D, side, null, 2000 + (gap + 20)*10 + (side ? 1 : 0)*5000);
      const want = pShieldLoss(S, D, side ? shieldAngle(Math.PI/2) : shieldAngle(Math.PI), 1);
      rows.push({gap, from: side ? 'side' : 'behind', want: r3(want), got: c.rate, n: c.n, angle: c.angle});
      rates[gap + (side ? 's' : 'b')] = {rate: c.rate, want};
      if (!(c.rate != null && Math.abs(c.rate - want) <= 0.05 && c.n === N)) ok = false;
      if (c.bad) oneRoll = false;
      jumps = Math.max(jumps, c.maxJump); notLoose += c.notLoose;
    }
  }
  check(ok, "the defender wins a shield challenge at pShieldLoss(S, D, angle, fatigue) within 5 points (D - S -20, 0, +20; behind and side)", rows);
  const ratios = [-20, 0, 20].map(g => ({gap: g, ratio: r3(rates[g + 'b'].rate/rates[g + 's'].rate), clamped: rates[g + 's'].want >= 0.9 - 1e-9 || rates[g + 'b'].want <= 0.05 + 1e-9}));
  check(ratios.every(r => r.clamped || Math.abs(r.ratio - 0.6) <= 0.08) && ratios.every(r => rates[r.gap + 'b'].rate < rates[r.gap + 's'].rate),
    "from behind he wins less than from the side, by the 0.6 to 1.0 ratio (within 0.08 where no clamp applies)", ratios);
  const lo = cellOf(80, 20, true, null, 9000), hi = cellOf(20, 80, true, null, 9500);
  check(Math.abs(lo.rate - 0.05) <= 0.02 && Math.abs(hi.rate - 0.90) <= 0.02, "at D - S = -60 and +60 the rates sit at the clamps 0.05 and 0.90 (within 0.02)", {minus60: lo.rate, plus60: hi.rate});
  // breath: 0.2 against 1.0 (bF = sstep(0, 35, B): B 10.06 gives 0.2)
  const tired = cellOf(50, 50, true, 10.06, 11000), fresh = cellOf(50, 50, true, 100, 11000);
  const wantT = pShieldLoss(50, 50, 1, fatigueFactor(1, 0.2)), wantF = pShieldLoss(50, 50, 1, 1);
  check(tired.rate > fresh.rate && Math.abs(tired.rate - wantT) <= 0.05 && Math.abs(fresh.rate - wantF) <= 0.05, "at D = S a shielder at breath 0.2 loses more often than one at breath 1.0, by fatigueFactor",
    {tired: tired.rate, wantTired: r3(wantT), fresh: fresh.rate, wantFresh: r3(wantF), fatigue: tired.fatigue});
  check(oneRoll && lo.bad === 0 && hi.bad === 0, "exactly one roll per engagement (none inside CHAL_GAP)");
  // a challenger who loses and stays leaning on him rolls again once CHAL_GAP has passed (G0: contact breaks OR the gap
  // passes), never sooner: 3 s glued at contact, a defender who all but always loses (D - S = -60)
  {
    let minGap = Infinity, rolls = 0, runs = 0;
    for (let s = 1; s <= 40; s++){
      const e = engage(13000 + s, 80, 20, true, null, 3);
      if (e.won !== false) continue;
      runs++; rolls += e.rolls;
      for (let k = 1; k < e.times.length; k++) minGap = Math.min(minGap, e.times[k] - e.times[k - 1]);
    }
    const per = runs ? rolls/runs : 0;
    check(runs > 20 && per >= 2.5 && minGap >= TUNE.CHAL_GAP.value - 1e-6, "glued at contact after a lost roll he rolls again each CHAL_GAP, never sooner", {runs, rollsPer3s: r3(per), minGap: r3(minGap)});
  }
  check(notLoose === 0 && jumps <= 0.1, "a won challenge leaves the ball loose, with no jump above 0.1 m in a step", {notLoose, maxStep: jumps});
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "tr2b-shieldsim.json"), JSON.stringify(res, null, 1));
console.log(`tr2b-shieldsim: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
