// qa/tr4-attrs.mjs: every attribute the Training editor shows changes real behaviour in the real simulation (Node,
// simStep, seeded). The matches are made from Training configurations by teams.js cfgFromConfig, the same way the
// runner plays them (its places, its ball), and are played by the one engine (sim.js, actions.js, the mover, the
// keeper's brain).
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN P4-A acceptance "qa/tr4-attrs.mjs"; TRAINING-SPEC 4 (changes
// affect real behaviour; every setting real) and section 1 (no decorative setting).
//
//   setting                              expected change
//   Pass accuracy 20 vs 95               my passes' lateral error differs by at least 2x
//   Sprint speed 40 vs 99                my top speed about 7.2 vs 9.4 m/s, within 0.2
//   Defenders' average 30 vs 90          their tackles' success rate differs
//   Keeper reflexes and diving 30 vs 90  his save rate differs
//   Keeper handling 30 vs 90             the share of catchable shots he spills or parries differs
//   Keeper positioning 30 vs 90          his mean distance from the ideal set position at the moment of the shot differs
//   Keeper distribution 30 vs 90         distribution error and completion differ (P9-B wired it: the row from qa/tr9-ai.mjs)
// Every keeper attribute the editor shows (attrs.js gkEditKeys) has a row.
//
//   node qa/tr4-attrs.mjs      exits 1 on any failed check; writes qa/out/tr4-attrs.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMatch, simStep, REF, AR1, AR2} from "../js/life/football/sim.js";
import {refreshPred, startAction, steer} from "../js/life/football/actions.js";
import {GK} from "../js/life/football/gkbrain.js";
import {BALL} from "../js/life/football/ball.js";
import {gkEditKeys, presetSkills} from "../js/life/football/attrs.js";
import {mulberry32} from "../js/life/football/rng.js";
import * as C from "../js/life/train/config.js";
import {cfgFromConfig} from "../js/life/train/teams.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr4-attrs", checks: [], ok: true, rows: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const R = BALL.R, H = 1/60, r3 = v => Math.round(v*1000)/1000;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0)/a.length : NaN;

// a match from a Training configuration, set up as the runner sets one up: everyone at his place, the ball as placed,
// play on from the first step, no officials
function matchOf(type, cfg, seed, {meAI = false} = {}){
  const c = C.validate(type, cfg), r = cfgFromConfig(type, c, seed);
  const ms = createMatch(Object.assign({}, r.cfg, {meAI}));
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  for (const t of [0, 1]) for (const p of r.cfg.teams[t].players){
    const a = ms.agents.find(x => x.team === t && x.pid === p.pid);
    a.m.x = a.x0 = p.place.x; a.m.z = a.z0 = p.place.z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = p.place.yaw; a.set = null;
  }
  const b = ms.ball, bi = r.ballInit;
  b.p.x = bi.p.x; b.p.y = bi.p.y; b.p.z = bi.p.z; b.v.x = bi.v.x; b.v.y = bi.v.y; b.v.z = bi.v.z; b.w.x = bi.w.x; b.w.y = bi.w.y; b.w.z = bi.w.z;
  b.state = "free";
  ms.restart = null; ms.phase = "live"; ms.clock.running = true; ms.cutStep = ms.step;
  refreshPred(ms);
  return {ms, r, c, me: ms.agents[ms.me]};
}
const step = (ms, n = 1) => { for (let i = 0; i < n; i++) simStep(ms, H); };
// the ball at my feet, mine
function giveBall(ms, a, ahead = 0.5){
  const b = ms.ball, fx = -Math.sin(a.m.yaw), fz = -Math.cos(a.m.yaw);
  b.p.x = a.m.x + fx*ahead; b.p.y = R; b.p.z = a.m.z + fz*ahead; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0; b.state = "free";
  b.last.agent = a.id; b.last.team = a.team; b.last.kind = "dribble"; b.last.t = ms.t;
  ms.poss.ctl = a.id; ms.poss.team = a.team; ms.poss.agent = a.id;
  refreshPred(ms);
}
const faceYaw = (dx, dz) => Math.atan2(-dx, -dz);
const kicked = (ms, from) => ms.events.slice(from).find(e => e.kind === "kick" && !e.whiff);

/* ---------- 1. pass accuracy 20 vs 95: my passes' lateral error ---------- */
function passError(passacc){
  const errs = [];
  for (let s = 1; s <= 60; s++){
    const me0 = Object.assign(presetSkills("average"), {passacc});
    const {ms, me} = matchOf("freeplay", {pitch: "full", mates: false, opps: false, keeper: false, me: me0}, s);
    me.m.x = -20; me.m.z = 0; me.m.yaw = me.m.heading = faceYaw(1, 0);
    giveBall(ms, me);
    const e0 = ms.events.length, T = {x: 5, y: R, z: 0}, D = T.x - me.m.x;
    startAction(ms, me, {kind: "pass", target: T});
    let k = 0, prev = null, err = null;
    for (; k < 400 && err == null; k++){
      const b = ms.ball, p = {x: b.p.x, z: b.p.z};
      if (prev && kicked(ms, e0) && p.x >= T.x){ const f = (T.x - prev.x)/((p.x - prev.x) || 1); err = Math.abs(prev.z + (p.z - prev.z)*f); }
      prev = p;
      step(ms);
    }
    if (err != null) errs.push(err/D);
  }
  return errs;
}
{
  const lo = passError(20), hi = passError(95);
  const mLo = mean(lo), mHi = mean(hi);
  res.rows.pass = {n: [lo.length, hi.length], meanLateralPerMetre: [r3(mLo), r3(mHi)], ratio: r3(mLo/mHi)};
  check(lo.length >= 50 && hi.length >= 50 && mLo >= 2*mHi, `Pass accuracy 20 vs 95: the lateral error of my passes differs by ${r3(mLo/mHi)}x (at least 2x)`, res.rows.pass);
}

/* ---------- 2. sprint speed 40 vs 99: my top speed ---------- */
function topSpeed(sprintSpeed){
  const {ms, me} = matchOf("freeplay", {pitch: "full", mates: false, opps: false, keeper: false, me: Object.assign(presetSkills("average"), {sprintSpeed, acceleration: 80})}, 3);
  me.m.x = -45; me.m.z = 0; me.m.yaw = me.m.heading = faceYaw(1, 0);
  ms.ball.p.x = -50; ms.ball.p.z = 30;
  let vmax = 0;
  for (let k = 0; k < 60*7; k++){ steer(me, 60, 0, "sprint", 0); step(ms); vmax = Math.max(vmax, me.m.speed); }
  return vmax;
}
{
  const v40 = topSpeed(40), v99 = topSpeed(99);
  res.rows.sprint = {v40: r3(v40), v99: r3(v99)};
  check(Math.abs(v40 - 7.2) <= 0.2 && Math.abs(v99 - 9.4) <= 0.2, `Sprint speed 40 vs 99: my top speed ${r3(v40)} vs ${r3(v99)} m/s (7.2 and 9.4, within 0.2)`, res.rows.sprint);
}

/* ---------- 3. defenders' average 30 vs 90: their tackles ---------- */
function tackles(defAvg){
  let won = 0, all = 0;
  for (let s = 1; s <= 60; s++){
    const {ms} = matchOf("attacking", {pitch: "half", role: "attacker", mates: true, opps: true, keeper: false, attackers: 3, defenders: 3, attAvg: 60, defAvg, possession: "me"}, s, {meAI: true});
    const e0 = ms.events.length;
    step(ms, 60*45);
    for (const e of ms.events.slice(e0)) if (e.kind === "tackle" && e.team === 1 && e.type !== "duel"){ all++; if (e.won) won++; }
  }
  return {won, all, rate: all ? won/all : NaN};
}
{
  const lo = tackles(30), hi = tackles(90);
  res.rows.tackle = {lo, hi};
  check(lo.all >= 20 && hi.all >= 20 && hi.rate - lo.rate >= 0.15, `Defenders' average 30 vs 90: their tackles win ${r3(lo.rate)} vs ${r3(hi.rate)} of the time`, res.rows.tackle);
}

/* ---------- 4 to 6. the keeper: shots from 14 to 20 m ---------- */
// one shot at the keeper of the +x goal (the Half cage); returns {goal, save, outcome, posErr}
function shot(gk, s, aim, dr = [14, 20]){
  const rr = mulberry32(1000 + s);
  const {ms, me} = matchOf("attacking", {pitch: "half", role: "attacker", mates: false, opps: false, keeper: true, gk, me: Object.assign(presetSkills("high"), {accuracy: 80, power: 70})}, s);
  const g = ms.agents[ms.gks[1]], gx = ms.spec.hx;
  const d = dr[0] + (dr[1] - dr[0])*rr(), z = (rr() - 0.5)*16;
  me.m.x = gx - d; me.m.z = z; me.m.yaw = me.m.heading = faceYaw(gx - me.m.x, -z);
  giveBall(ms, me);
  // he has a moment to get set, then the shot
  step(ms, 90);
  const target = aim(rr);
  const e0 = ms.events.length;
  startAction(ms, me, {kind: "shot", target: {x: gx, y: target.y, z: target.z}, power: target.p});
  let posErr = null;
  for (let k = 0; k < 60*4; k++){
    step(ms);
    if (posErr == null && kicked(ms, e0)){
      // the ideal set position (gkbrain positionTarget with no error): on the line from the ball to the goal centre
      const b = ms.ball.p, vx = b.x - gx, vz = b.z, vl = Math.hypot(vx, vz) || 1, dB = Math.hypot(vx, vz);
      const off = Math.min(Math.max(GK.OFF[0] + GK.OFF[1]*(dB - GK.OFF[2]), GK.OFF[3]), GK.OFF[4]);
      posErr = Math.hypot(g.m.x - (gx + vx/vl*off), g.m.z - Math.min(Math.max(vz/vl*off, -3.4), 3.4));
    }
    if (ms.events.slice(e0).some(e => e.kind === "goal" || e.kind === "out")) break;
  }
  const evs = ms.events.slice(e0), sv = evs.find(e => e.kind === "save");
  return {goal: evs.some(e => e.kind === "goal" && !e.disallowed), save: !!sv, outcome: sv ? sv.outcome : null, posErr};
}
const corners = rr => ({z: (rr() < 0.5 ? -1 : 1)*(1.6 + 1.6*rr()), y: 0.3 + 1.6*rr(), p: 0.75 + 0.15*rr()});
const atHim = rr => ({z: (rr() - 0.5)*1.2, y: 0.6 + 0.9*rr(), p: 0.55 + 0.25*rr()});
const keeper = (o) => Object.assign({reflex: 60, dive: 60, handling: 60, posit: 60, distrib: 55}, o);
const N = 60;
{
  const run = gk => { const out = []; for (let s = 1; s <= N; s++) out.push(shot(gk, s, corners)); return out; };
  const lo = run(keeper({reflex: 30, dive: 30})), hi = run(keeper({reflex: 90, dive: 90}));
  const rate = L => { const onT = L.filter(x => x.goal || x.save); return onT.length ? onT.filter(x => x.save).length/onT.length : NaN; };
  res.rows.saves = {lo: {saves: lo.filter(x => x.save).length, goals: lo.filter(x => x.goal).length, rate: r3(rate(lo))}, hi: {saves: hi.filter(x => x.save).length, goals: hi.filter(x => x.goal).length, rate: r3(rate(hi))}};
  check(rate(hi) - rate(lo) >= 0.15, `Keeper reflexes and diving 30 vs 90: he saves ${r3(rate(lo))} vs ${r3(rate(hi))} of the shots on target`, res.rows.saves);
}
{
  const run = gk => { const out = []; for (let s = 1; s <= N; s++) out.push(shot(gk, 500 + s, atHim)); return out; };
  const lo = run(keeper({handling: 30})), hi = run(keeper({handling: 90}));
  const spill = L => { const sv = L.filter(x => x.outcome === "catch" || x.outcome === "parry"); return sv.length ? sv.filter(x => x.outcome === "parry").length/sv.length : NaN; };
  res.rows.handling = {lo: {saves: lo.filter(x => x.save).length, spilled: r3(spill(lo))}, hi: {saves: hi.filter(x => x.save).length, spilled: r3(spill(hi))},
    outcomes: [...new Set(lo.concat(hi).map(x => x.outcome).filter(Boolean))]};
  check(lo.filter(x => x.save).length >= 20 && spill(lo) - spill(hi) >= 0.15, `Keeper handling 30 vs 90: he spills or parries ${r3(spill(lo))} vs ${r3(spill(hi))} of the catchable shots he gets both hands to (caught or parried)`, res.rows.handling);
}
{
  const run = gk => { const out = []; for (let s = 1; s <= N; s++) out.push(shot(gk, 900 + s, corners, [23, 30])); return out.map(x => x.posErr).filter(v => v != null); };
  const lo = run(keeper({posit: 30})), hi = run(keeper({posit: 90}));
  res.rows.posit = {n: [lo.length, hi.length], meanFromIdeal: [r3(mean(lo)), r3(mean(hi))]};
  check(lo.length >= 50 && hi.length >= 50 && mean(lo) >= 1.5*mean(hi), `Keeper positioning 30 vs 90: at the shot he stands ${r3(mean(lo))} vs ${r3(mean(hi))} m from the ideal set position`, res.rows.posit);
}
/* ---------- 7. keeper distribution 30 vs 90 (P9-B hook; the measurement of qa/tr9-ai.mjs section 3) ----------
   A match a few seconds in, the ball put in team 0's keeper's hands (gkbrain.js gkCollect) and his own hold, then what he
   does with it: the landing error from where he meant it (gk.distAim: the first bounce, or where it was first met, or
   for a roll how near it came) and whether a team-mate had it next (ev.res 'ok'). Seeded, paired at 30 and 90 */
{
  const {configFor} = await import("./harness.mjs");
  const {gkCollect} = await import("../js/life/football/gkbrain.js");
  const {clearCtl} = await import("../js/life/football/rules.js");
  const one = (seed, distrib) => {
    const cfg = configFor(7000 + seed), gkP = cfg.teams[0].players.find(p => p.isGK);
    gkP.at = Object.assign({}, gkP.at, {gk: Object.assign({}, gkP.at.gk, {distrib})});
    const ms = createMatch(cfg);
    while (ms.t < 6 && ms.phase !== "over") simStep(ms);
    const gk = ms.agents.find(a => a.team === 0 && a.isGK && a.onPitch);
    clearCtl(ms); ms.restart = null; ms.phase = "live";
    for (const a of ms.agents){ a.set = null; a.wall = false; if (a.act && a.act.kind === "kick") a.act = null; a.pendKick = null; a.drib = null; }
    const b = ms.ball; b.p.x = gk.m.x + ms.dirs[0]*0.4; b.p.y = 1.0; b.p.z = gk.m.z; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
    gkCollect(ms, gk);
    let ev = null, aim = null, kind = null, land = null, met = false, closest = Infinity;
    for (let n = 0; n < 60*14 && ms.phase !== "over"; n++){
      simStep(ms);
      if (!ev){ ev = ms.events.slice(-4).find(e => e.kind === "kick" && e.agent === gk.id) || null; if (ev){ kind = ev.intent; aim = gk.gk.distAim ? {x: gk.gk.distAim.x, z: gk.gk.distAim.z} : null; } continue; }
      if (aim){
        const m2 = !met && ms.events.some((e, i) => i > ev.id && e.agent >= 0 && e.agent !== gk.id && (e.kind === "kick" || e.kind === "touch" || e.kind === "header"));
        if (m2) met = true;
        if (kind === "roll"){ const d = Math.hypot(b.p.x - aim.x, b.p.z - aim.z); if (d < closest) closest = d; }
        else if (!land && (m2 || b.p.y <= 0.14 && b.v.y <= 0 && ms.t - ev.t > 0.2)) land = {x: b.p.x, z: b.p.z};
      }
      if (ev.res && (kind === "roll" ? ms.t - ev.t > 2.5 : land)) break;
    }
    const err = !aim ? null : kind === "roll" ? closest : land ? Math.hypot(land.x - aim.x, land.z - aim.z) : null;
    return {err, ok: ev ? ev.res === "ok" : null};
  };
  const N2 = 60, lo = [], hi = [];
  for (let s = 1; s <= N2; s++){ lo.push(one(s, 30)); hi.push(one(s, 90)); }
  const mErr = L => mean(L.filter(x => x.err != null).map(x => x.err)), comp = L => L.filter(x => x.ok).length/Math.max(1, L.filter(x => x.ok != null).length);
  res.rows.distrib = {n: N2, meanErr: [r3(mErr(lo)), r3(mErr(hi))], completion: [r3(comp(lo)), r3(comp(hi))]};
  check(mErr(lo) >= 1.5*mErr(hi) && comp(hi) > comp(lo), `Keeper distribution 30 vs 90: distribution error ${r3(mErr(lo))} vs ${r3(mErr(hi))} m and completion ${r3(comp(lo))} vs ${r3(comp(hi))} differ`, res.rows.distrib);
}
// every keeper attribute the editor shows has its row above
const rowsFor = {reflex: "saves", dive: "saves", handling: "handling", posit: "posit", distrib: "distrib"};
check(gkEditKeys().every(k => res.rows[rowsFor[k]]), "every keeper attribute the editor shows has a behaviour row", gkEditKeys());

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/tr4-attrs.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "tr4-attrs: all checks passed" : "tr4-attrs: FAILED");
process.exit(res.ok ? 0 : 1);
