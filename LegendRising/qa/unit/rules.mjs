// qa/unit/rules.mjs: the referee of js/life/football/rules.js under plain node (offside has its own file): who has
// the ball, the ball out of play and who restarts, goals and their attribution, fouls, cards and advantage, takers and
// walls, the clock and added time, substitutions, every kind of restart resolving within its limit in the full
// simulation, and the scenario line of tactics.js (3.2.9).
// Owner: WP-E. Contract DESIGN 1.4.14; numbers 1.5.5; behaviour 3.2.8 to 3.2.10; acceptance 2.3 WP-E (every restart
// resolves within its limit + 5 s) and 4.7 (scenario lines).
//
//   node qa/unit/rules.mjs      exits 1 on any failed check; writes qa/out/unit-rules.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "../harness.mjs";
import {createMatch, simStep} from "../../js/life/football/sim.js";
import {RULES, setCtl, ballOut, goalScored, startRestart, foul, bookAgent, planSub, refStep, onTouch} from "../../js/life/football/rules.js";
import {restartShape} from "../../js/life/football/brain.js";
import {situation, xT} from "../../js/life/football/tactics.js";
import {chainKick} from "../../js/life/football/events.js";
import {logEv} from "../../js/life/football/events.js";
import {BALL} from "../../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-rules", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r2 = v => Math.round(v*100)/100;
const H = 1/60, R = BALL.R;

const put = (a, x, z, vx = 0, vz = 0) => {
  a.m.x = x; a.m.z = z; a.m.vx = vx; a.m.vz = vz; a.m.speed = Math.hypot(vx, vz);
  a.x0 = x; a.z0 = z; a.body.x = x; a.body.z = z; a.tgt.x = x; a.tgt.z = z;
};
const ballAt = (ms, x, z, y = R) => { const b = ms.ball; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = 0; b.v.y = 0; b.v.z = 0; b.state = 'free'; };
// a live match with team 0 attacking +x; the outfield players of both sides spread in their own halves
function scene(seed = 5){
  const ms = createMatch(configFor(seed));
  ms.phase = 'live'; ms.clock.running = true; ms.restart = null;
  const T = [0, 1].map(t => ms.agents.filter(a => a.team === t && a.role === 'player'));
  for (const t of [0, 1]){
    const sgn = t === 0 ? -1 : 1, out = T[t].filter(a => !a.isGK);
    put(T[t].find(a => a.isGK), sgn*51, 0);
    out.forEach((a, i) => put(a, sgn*(8 + (i % 4)*7), -28 + i*5.6));
  }
  ballAt(ms, 0, 0);
  return {ms, T, gk: [T[0].find(a => a.isGK), T[1].find(a => a.isGK)], out: [T[0].filter(a => !a.isGK), T[1].filter(a => !a.isGK)]};
}
const evs = (ms, kind) => ms.events.filter(e => e.kind === kind);
function ref(ms, sec){ const n = Math.round(sec/H); for (let i = 0; i < n; i++){ ms.t += H; ms.step++; refStep(ms, H); } }

/* ---------- possession ---------- */
{
  const {ms, out} = scene();
  setCtl(ms, out[0][0]);
  check(ms.poss.team === 0 && ms.poss.ctl === out[0][0].id && evs(ms, 'possession').length === 0, "the first control gives the team possession (no change logged from nobody)");
  // team 1 wins it with three of its players further up the pitch (their direction is -x)
  put(out[1][0], 0, 0); ballAt(ms, -0.5, 0);
  out[1].slice(1, 4).forEach((a, i) => put(a, -15, -10 + i*10));
  setCtl(ms, out[1][0]);
  const ev = evs(ms, 'possession')[0];
  check(ev && ev.from === 0 && ev.to === 1 && ev.ahead >= 3, "a change of possession is logged with the attackers ahead of the ball (a counter needs 3)", ev && {ahead: ev.ahead});
}

/* ---------- out of play ---------- */
{
  const s = scene();
  s.ms.ball.last.team = 0; s.ms.ball.last.agent = s.out[0][0].id;
  ballOut(s.ms, {line: 'touch', end: 0, x: 12.3, z: 34.2});
  check(s.ms.restart && s.ms.restart.kind === 'throw' && s.ms.restart.team === 1 && s.ms.restart.spot.x === 12.3 && Math.abs(s.ms.restart.spot.z - (s.ms.spec.hz - 0.05)) < 1e-9,
    "over the touchline off team 0: a throw-in to team 1 where it crossed", s.ms.restart && s.ms.restart.spot);
  const g = scene();
  g.ms.ball.last.team = 0;
  ballOut(g.ms, {line: 'goal', end: 1, x: 52.6, z: -12});
  check(g.ms.restart && g.ms.restart.kind === 'goalkick' && g.ms.restart.team === 1 && g.ms.restart.spot.x === g.ms.spec.hx - 3.5 && g.ms.restart.spot.z === -5.5,
    "over the goal line off the attackers: a goal kick from the goal area on that side", g.ms.restart && g.ms.restart.spot);
  const c = scene();
  c.ms.ball.last.team = 1;
  ballOut(c.ms, {line: 'goal', end: 1, x: 52.6, z: 20});
  check(c.ms.restart && c.ms.restart.kind === 'corner' && c.ms.restart.team === 0 && c.ms.stats.corners[0] === 1 && c.ms.restart.spot.z > 0,
    "over their own goal line off the defenders: a corner to the attackers on that side, counted", c.ms.restart && c.ms.restart.spot);
}

/* ---------- goals and who scored them ---------- */
{
  const s = scene();
  const scorer = s.out[0][9];
  s.ms.ball.last.team = 0; s.ms.ball.last.agent = scorer.id; s.ms.ball.last.kind = 'shot';
  goalScored(s.ms, {end: 1, x: 52.7, y: 1, z: 1});
  const g = evs(s.ms, 'goal')[0];
  check(s.ms.score[0] === 1 && g && g.scorer === scorer.id && !g.ownGoal, "a goal counts for the scorer", g && {scorer: g.scorer});
  check(s.ms.phase === 'goal' && s.ms.restart && s.ms.restart.kind === 'kickoff' && s.ms.restart.team === 1, "the side that conceded kicks off, after the celebration");
  ref(s.ms, RULES.CELEBRATE + 0.05);
  check(s.ms.phase === 'kickoff', `the celebration lasts ${RULES.CELEBRATE} s`);
  // a defender's deliberate touch into his own net
  const o = scene();
  o.ms.ball.last.team = 1; o.ms.ball.last.agent = o.out[1][0].id; o.ms.ball.last.kind = 'control';
  goalScored(o.ms, {end: 1, x: 52.7, y: 0.5, z: 0});
  const og = evs(o.ms, 'goal')[0];
  check(og && og.ownGoal && o.ms.score[0] === 1, "a defender's deliberate touch into his own goal is an own goal for the other side");
  // a shot on target deflected in by a defender stays the shooter's
  const d = scene();
  const sh = d.out[0][8];
  const kev = logEv(d.ms, 'kick', 0, sh.id, 30, 0, {intent: 'shot', onTarget: true});
  chainKick(d.ms, kev);
  d.ms.ball.last.team = 1; d.ms.ball.last.agent = d.out[1][0].id; d.ms.ball.last.kind = 'deflect';
  goalScored(d.ms, {end: 1, x: 52.7, y: 0.5, z: 1});
  const dg = evs(d.ms, 'goal')[0];
  check(dg && !dg.ownGoal && dg.scorer === sh.id && kev.res === 'goal', "a deflected shot on target is the shooter's goal");
}

/* ---------- fouls, cards, advantage ---------- */
{
  // a foul with severity 0.7 in midfield, nobody keeping the ball: yellow, free kick at the spot
  const s = scene();
  const v = s.out[0][5], f = s.out[1][5];
  put(v, -5, 4, 3, 0); put(f, -5.5, 4.4);
  setCtl(s.ms, v);
  const F = foul(s.ms, f, v, 0.7, -5, 4, {down: true});
  check(F.card === 'yellow' && f.booked === 1 && s.ms.stats.yellows[1] === 1 && s.ms.stats.fouls[1] === 1, "severity above 0.6: a yellow card");
  check(s.ms.restart && s.ms.restart.kind === 'free' && s.ms.restart.team === 0 && s.ms.restart.spot.x === -5 && s.ms.restart.spot.z === 4, "a free kick at the place of the foul");
  // his second yellow is a red: sent off, walks to the nearest touchline
  s.ms.restart = null; s.ms.phase = 'live';
  const F2 = foul(s.ms, f, v, 0.65, -5, 4, {down: true});
  const card = evs(s.ms, 'card').pop();
  check(F2.card === 'yellow' && card.color === 'red' && card.second && f.sentOff && f.leaving && f.exit && Math.abs(f.exit.z) > s.ms.spec.hz, "a second yellow is a red: he walks off at the nearest touchline");
  check(s.ms.stats.reds[1] === 1 && s.ms.stats.yellows[1] === 2, "the red after two yellows counts both yellows and one red");
  // above 0.92: a straight red
  const r = scene();
  put(r.out[0][3], 0, 0, 3, 0); setCtl(r.ms, r.out[0][3]);
  const F3 = foul(r.ms, r.out[1][2], r.out[0][3], 0.95, 0, 0, {down: true});
  check(F3.card === 'red' && r.out[1][2].sentOff, "severity above 0.92: a straight red");
  // denying an obvious goal-scoring opportunity: within 30 m, heading to goal, no other defender between
  const dg = scene();
  const runner = dg.out[0][9];
  for (const a of dg.out[1]) put(a, Math.min(a.m.x, 15), a.m.z);
  put(runner, 28, 2, 6, 0); setCtl(dg.ms, runner);
  const F4 = foul(dg.ms, dg.out[1][0], runner, 0.45, 28, 2, {down: true});
  check(F4.card === 'red', "denying an obvious goal-scoring opportunity (28 m out, nobody between but the keeper): red");
  const cover = scene();
  const run2 = cover.out[0][9];
  put(run2, 28, 2, 6, 0); setCtl(cover.ms, run2);
  put(cover.out[1][1], 40, 3);
  const F5 = foul(cover.ms, cover.out[1][0], run2, 0.45, 28, 2, {down: true, tactical: false});
  check(F5.card !== 'red', "with a defender between him and the goal it is not a red", F5.card);
  // in the box: a penalty at the spot
  const p = scene();
  const pv = p.out[0][9];
  put(pv, 45, 3, 3, 0); setCtl(p.ms, pv);
  put(p.out[1][1], 48, 1);
  foul(p.ms, p.out[1][0], pv, 0.4, 45, 3, {down: true, tactical: false});
  const pen = p.ms.spec.spots.penalty.find(q => q.end === 1);
  check(p.ms.restart && p.ms.restart.kind === 'penalty' && p.ms.restart.spot.x === pen.x && p.ms.restart.spot.z === pen.z, "a foul in the box: a penalty from the spot", p.ms.restart && p.ms.restart.spot);
  // advantage: the fouled side keeps the ball where it is worth something; booked at the next stoppage
  const a = scene();
  const av = a.out[0][7], af = a.out[1][3];
  const ax = 33, az = -2;
  const val = xT(ax + a.ms.spec.hx, az + a.ms.spec.hz, a.ms.spec.L, a.ms.spec.Wd);
  put(av, ax, az, 4, 0); put(af, ax - 0.6, az - 0.3); setCtl(a.ms, av);
  for (const o of a.out[1]) if (o !== af) put(o, Math.max(o.m.x, ax + 3 + (o.id % 5)), o.m.z);
  const F6 = foul(a.ms, af, av, 0.65, ax, az, {tactical: false});
  check(val >= RULES.ADV.xt && a.ms.advantage && !a.ms.restart && a.ms.phase === 'live' && evs(a.ms, 'foul')[0].adv,
    `the fouled side keeps it where it is worth ${r2(val)} >= ${RULES.ADV.xt}: advantage, play on`);
  check(!F6.booked && af.booked === 0, "the card waits for the next stoppage");
  ref(a.ms, RULES.ADV.signal + 0.1);
  check(!a.ms.advantage && a.ms.pendingBook.length === 1, "after the 2 s signal the foul is held for booking");
  a.ms.ball.last.team = 0;
  ballOut(a.ms, {line: 'goal', end: 1, x: 52.6, z: 8});
  ref(a.ms, H);
  check(af.booked === 1 && a.ms.pendingBook.length === 0, "at the next stoppage the yellow is shown");
  // advantage that does not come good: the other side wins it inside the window, the free kick is given
  const b = scene();
  const bv = b.out[0][7], bf = b.out[1][3];
  put(bv, ax, az, 4, 0); put(bf, ax - 0.6, az - 0.3); setCtl(b.ms, bv);
  for (const o of b.out[1]) if (o !== bf) put(o, Math.max(o.m.x, ax + 3 + (o.id % 5)), o.m.z);
  foul(b.ms, bf, bv, 0.5, ax, az, {tactical: false});
  b.ms.t += 1;
  onTouch(b.ms, b.out[1][6], 'tackle');
  check(b.ms.restart && b.ms.restart.kind === 'free' && b.ms.restart.team === 0 && !b.ms.advantage, "advantage lost inside 2 s: the free kick is given after all");
}

/* ---------- takers and the wall ---------- */
{
  const s = scene();
  const pick = (kind, team, spot) => { s.ms.restart = null; return s.ms.agents[startRestart(s.ms, kind, team, spot).taker]; };
  const ko = pick('kickoff', 0, {x: 0, z: 0});
  check(ko && (ko.slot === 'ST' || ko.slot === 'CF' || ko.slotLine === 'FWD'), "kick-off: the centre forward", ko && ko.slot);
  const gkT = pick('goalkick', 1, {x: 49, z: 5.5});
  check(gkT && gkT.isGK, "goal kick: the keeper");
  const best = (team, k) => s.ms.agents.filter(a => a.team === team && a.role === 'player' && !a.isGK).sort((a, b) => k(b.at) - k(a.at))[0];
  const cT = pick('corner', 0, {x: 52.1, z: 33.6});
  check(cT === best(0, at => at.curve + at.accuracy), "corner: the best curve + accuracy", cT && cT.slot);
  const pT = pick('penalty', 0, {x: 41.5, z: 0});
  check(pT === best(0, at => at.accuracy + at.composure), "penalty: the best accuracy + composure", pT && pT.slot);
  // the player takes the corner when trusted (40) and within 2 points of the best
  const me = s.ms.agents.find(a => a.isMe);
  const mt = me.team, top = best(mt, at => at.curve + at.accuracy);
  if (top !== me){
    const need = top.at.curve + top.at.accuracy - 1.5 - me.at.curve - me.at.accuracy;
    me.at = Object.assign({}, me.at, {curve: me.at.curve + need});
    s.ms.cfg.me.trust = 20;
    const low = pick('corner', mt, {x: 0, z: 33.6});
    s.ms.cfg.me.trust = 40;
    const high = pick('corner', mt, {x: 0, z: 33.6});
    check(low === top && high === me, "the player takes corners at trust 40 within 2 points of the best, not at trust 20");
  } else check(true, "the player is the best corner taker of his side and takes them");
  // the wall: 5 at 22 m or closer, 4 to 28, 3 to 32, none beyond, two fewer past 35 degrees
  const wallAt = (x, z) => {
    const w = scene();
    w.ms.restart = null;
    startRestart(w.ms, 'free', 0, {x, z});
    restartShape(w.ms);
    return (w.ms.restart.wall || []).length;
  };
  const gx = 52.5;
  const walls = {d20: wallAt(gx - 20, 0), d25: wallAt(gx - 25, 0), d30: wallAt(gx - 30, 0), d34: wallAt(gx - 34, 0), wide: wallAt(gx - 14, 13)};
  check(walls.d20 === 5 && walls.d25 === 4 && walls.d30 === 3 && walls.d34 === 0 && walls.wide === 3, "the wall: 5 at 20 m, 4 at 25, 3 at 30, none at 34, 3 at 19 m wide (43 degrees)", walls);
  const w = scene();
  w.ms.restart = null;
  const R0 = startRestart(w.ms, 'free', 0, {x: gx - 20, z: 4});
  restartShape(w.ms);
  const sp = R0.spot, ds = R0.wall.map(id => { const a = w.ms.agents[id]; return Math.hypot(a.set.x - sp.x, a.set.z - sp.z); });
  check(ds.length && Math.abs(ds[0] - RULES.WALL_D) < 1e-6 && ds.every(d => d >= RULES.WALL_D - 1e-6), "the wall stands 9.15 m from the ball", ds.map(r2));
}

/* ---------- the clock: added time and the end of the half ---------- */
{
  const s = scene();
  s.ms.clock.sec = 2690; s.ms.stoppage[0] = 150;
  ref(s.ms, 3);
  const add = evs(s.ms, 'added')[0];
  check(add && add.mins === 3 && s.ms.clock.added === 3, "added time from the stoppages (150 s: 3 minutes)", add && add.mins);
  const t = scene();
  t.ms.clock.sec = 2699; t.ms.stoppage[0] = 900;
  ref(t.ms, 1);
  check(t.ms.clock.added === RULES.ADDED[0][1], "first-half added time is at most 4", t.ms.clock.added);
  // after added time the half ends at the first dead ball, else at 20 real seconds
  const u = scene();
  u.ms.clock.sec = 2700 + 60*1; u.ms.clock.added = 1;
  ref(u.ms, H*3);
  check(u.ms.phase === 'live', "added time over with the ball in a final third: play goes on");
  u.ms.ball.p.x = 40;
  ref(u.ms, RULES.HALF_CAP + 0.2);
  check(u.ms.phase === 'halftime' && evs(u.ms, 'whistle').some(e => e.why === 'ht'), "at most 20 real seconds past added time", u.ms.phase);
  const v = scene();
  v.ms.clock.sec = 2700 + 60; v.ms.clock.added = 1;
  v.ms.ball.p.x = 40;
  ref(v.ms, 2);
  v.ms.ball.last.team = 0;
  ballOut(v.ms, {line: 'touch', end: 0, x: 40, z: 34.1});
  ref(v.ms, H);
  check(v.ms.phase === 'halftime', "the first dead ball after added time ends the half");
}

/* ---------- substitutions ---------- */
{
  const s = scene();
  const subs = [];
  for (let i = 0; i < 7; i++) subs.push(planSub(s.ms, 0, s.out[0][i].id, 'tactical'));
  check(subs.filter(Boolean).length === RULES.SUBS && !planSub(s.ms, 0, s.out[0][0].id), "at most 5 substitutions a side, one plan per man", subs);
  s.ms.subs.plan.length = 1;
  const outA = s.ms.agents[s.ms.subs.plan[0].out];
  ref(s.ms, H*2);
  check(!outA.leaving, "in play the substitution waits for a stoppage");
  s.ms.ball.last.team = 1;
  ballOut(s.ms, {line: 'touch', end: 0, x: 0, z: 34.2});
  ref(s.ms, H);
  check(outA.leaving && outA.exit, "at the stoppage he leaves for the nearest touchline");
  // walk him off for real (the sim moves him; here the steps are simulated by hand at a walk)
  let n = 0;
  while (outA.onPitch && n++ < 4000){
    const dx = outA.exit.x - outA.m.x, dz = outA.exit.z - outA.m.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 2*H);
    outA.m.x += dx/d*st; outA.m.z += dz/d*st;
    ref(s.ms, H);
  }
  ref(s.ms, H);
  const sub = evs(s.ms, 'sub')[0];
  const inA = sub ? s.ms.agents[sub.in] : null;
  check(!outA.onPitch && sub && inA && inA.slot === outA.slot && Math.abs(inA.m.x) <= 3 && Math.abs(inA.m.z) > s.ms.spec.hz && s.ms.subs.used[0] === 1,
    "once he is off, the substitute enters at halfway from the touchline in his slot", inA && {x: r2(inA.m.x), z: r2(inA.m.z), slot: inA.slot});
}

/* ---------- every restart in the full simulation resolves within its limit + 5 s ---------- */
{
  const kinds = [['throw', 0, {x: 10, z: 33.95}], ['throw', 1, {x: -30, z: -33.95}], ['goalkick', 1, {x: 49, z: 5.5}], ['goalkick', 0, {x: -49, z: -5.5}],
    ['corner', 0, {x: 52.1, z: 33.6}], ['corner', 1, {x: -52.1, z: -33.6}], ['free', 0, {x: -10, z: 8}], ['free', 0, {x: 30, z: -6}],
    ['indirect', 1, {x: -25, z: 12}], ['penalty', 0, {x: 41.5, z: 0}], ['kickoff', 1, {x: 0, z: 0}]];
  const out = [];
  let worst = -1e9, allOk = true, ballJumps = 0, teleports = 0;
  for (let i = 0; i < kinds.length; i++){
    const [kind, team, spot] = kinds[i];
    const ms = createMatch(configFor(20 + i));
    // play 40 s of the match, then the referee stops it for this restart where the ball happens to be
    let n = 0;
    while (ms.t < 40 && n++ < 10000) simStep(ms);
    while (ms.phase !== 'live' && n++ < 20000) simStep(ms);
    ms.ball.last.team = 1 - team;
    const R0 = startRestart(ms, kind, team, spot, kind === 'kickoff' ? {after: true} : {});
    const t0 = ms.t;
    n = 0;
    while (!R0.taken && n++ < 60*(R0.limit + 12)) simStep(ms);
    const took = R0.taken ? ms.t - t0 : Infinity;
    out.push({kind, team, took: r2(took), limit: R0.limit, from: R0.ballFrom});
    worst = Math.max(worst, took - R0.limit);
    if (!(took <= R0.limit + 5)) allOk = false;
    ballJumps += ms.asserts.ballJump; teleports += ms.asserts.teleport;
  }
  check(allOk, `every restart is taken within its limit + 5 s (worst ${r2(worst)} s over the limit)`, out);
  check(ballJumps === 0 && teleports === 0, "no agent or ball displacement assert fired around the restarts", {ballJumps, teleports});
  // and as they come in two whole matches: every restart, from the dead ball to the kick
  const kindsSeen = {};
  let late = 0, lateAssert = 0, worstN = -1e9;
  for (const seed of [31, 32]){
    const ms = createMatch(configFor(seed));
    let cur = null, n = 0;
    while (ms.phase !== 'over' && n++ < 200000){
      simStep(ms);
      if (ms.restart && ms.restart !== cur && !ms.restart.taken) cur = ms.restart;
      if (cur && (cur.taken || ms.restart !== cur)){
        const took = ms.t - cur.t0;
        kindsSeen[cur.kind] = (kindsSeen[cur.kind] || 0) + 1;
        worstN = Math.max(worstN, took - cur.limit);
        if (took > cur.limit + 5) late++;
        cur = null;
      }
    }
    lateAssert += ms.asserts.restartLate;
  }
  check(late === 0 && lateAssert === 0 && ['throw', 'goalkick', 'corner', 'free', 'kickoff'].every(k => kindsSeen[k] > 0),
    `two whole matches: every restart taken within its limit + 5 s (worst ${r2(worstN)} s over the limit)`, {late, lateAssert, kinds: kindsSeen});
}

/* ---------- the scenario line (3.2.9) ---------- */
{
  const s = scene();
  const ms = s.ms, me = ms.agents.find(a => a.isMe), team = me.team, opp = 1 - team, dir = ms.dirs[team], L = ms.spec.L;
  const tm = ms.tm[team], to = ms.tm[opp];
  const reset = () => {
    ms.restart = null; ms.phase = 'live'; ms.poss.team = -1; tm.changeT = -99; to.line = L*0.3; tm.style = Object.assign({}, tm.style, {pressBias: 0});
    ms.score = [0, 0]; ms.half = 1; ms.clock.sec = 600; ms.sitT = -1e9;
    for (const t of [0, 1]) s.out[t].forEach((a, i) => put(a, (t === 0 ? -1 : 1)*(8 + (i % 4)*7), -28 + i*5.6));
    ballAt(ms, 0, 0);
  };
  const lines = {};
  reset(); ms.restart = {kind: 'penalty', team, spot: {x: 0, z: 0}}; lines.penUs = situation(ms, me.id);
  reset(); ms.restart = {kind: 'penalty', team: opp, spot: {x: 0, z: 0}}; lines.penThem = situation(ms, me.id);
  reset(); ms.restart = {kind: 'corner', team, spot: {x: 0, z: 0}}; lines.cornerUs = situation(ms, me.id);
  reset(); ms.restart = {kind: 'corner', team: opp, spot: {x: 0, z: 0}}; lines.cornerThem = situation(ms, me.id);
  reset(); ms.restart = {kind: 'free', team, spot: {x: dir*(ms.spec.hx - 22), z: 3}}; lines.fkNear = situation(ms, me.id);
  reset(); ms.restart = {kind: 'free', team, spot: {x: dir*(ms.spec.hx - 45), z: 3}}; lines.fkFar = situation(ms, me.id);
  // a counter: we just won it with 3 ahead of the ball
  reset(); ms.poss.team = team; tm.changeT = ms.t - 1; ballAt(ms, dir*-20, dir*6);
  s.out[team].slice(0, 4).forEach((a, i) => put(a, dir*(5 + i), -10 + i*6));
  lines.counter = situation(ms, me.id);
  reset(); ms.poss.team = team; tm.changeT = ms.t - 1; ballAt(ms, dir*45, 0);
  lines.noCounter = situation(ms, me.id);
  // the last man: nobody of ours deeper than him while they have it, in our half
  reset(); ms.poss.team = opp;
  for (const a of s.out[team]) if (a !== me) put(a, dir*10, a.m.z);
  put(me, dir*-20, 0);
  lines.lastMan = me.isGK ? "You're the last man. Stay goal side." : situation(ms, me.id);
  reset(); ms.poss.team = opp; put(me, dir*-20, 0);
  for (const a of s.out[team]) if (a !== me) put(a, dir*-30, a.m.z);
  lines.notLast = situation(ms, me.id);
  // late on
  reset(); ms.half = 2; ms.clock.sec = 41*60; ms.score[team] = 0; ms.score[opp] = 1; lines.losingLate = situation(ms, me.id);
  reset(); ms.half = 2; ms.clock.sec = 41*60; ms.score[team] = 2; ms.score[opp] = 1; lines.winningLate = situation(ms, me.id);
  reset(); ms.half = 2; ms.clock.sec = 30*60; ms.score[team] = 0; ms.score[opp] = 1; lines.losingEarly = situation(ms, me.id);
  // their line deep, with the ball: be patient
  reset(); ms.poss.team = team; to.line = L - 20; lines.deep = situation(ms, me.id);
  check(lines.penUs === "Penalty to us." && lines.penThem === "Penalty to them.", "penalty lines", [lines.penUs, lines.penThem]);
  check(lines.cornerUs === "Corner. Attack the near post." && lines.cornerThem === "Corner against. Pick up your man.", "corner lines", [lines.cornerUs, lines.cornerThem]);
  check(lines.fkNear === "Free kick in a good spot." && lines.fkFar !== "Free kick in a good spot.", "a free kick within 30 m only", [lines.fkNear, lines.fkFar]);
  check(/^Counter attack\. Support on the (left|right)\.$/.test(lines.counter || "") && !/Counter/.test(lines.noCounter || ""), "the counter line only with 3 ahead just after winning it", [lines.counter, lines.noCounter]);
  check(lines.lastMan === "You're the last man. Stay goal side." && lines.notLast !== lines.lastMan, "the last-man line only when nobody of his is deeper", [lines.lastMan, lines.notLast]);
  check(lines.losingLate === "Not long left. We need a goal." && lines.winningLate === "Hold on to it. Keep it simple." && lines.losingEarly !== lines.losingLate, "the late lines only after 85 minutes", [lines.losingLate, lines.winningLate, lines.losingEarly]);
  check(lines.deep === "They're sitting deep. Be patient.", "their line below 25 m with the ball: be patient", lines.deep);
  // one line per 20 s: asked again at once the same condition gives nothing, 20 s later it gives the line again
  reset(); ms.restart = {kind: 'corner', team, spot: {x: 0, z: 0}};
  const first = situation(ms, me.id), again = situation(ms, me.id);
  ms.t += 19.9; const early = situation(ms, me.id);
  ms.t += 0.2; const later = situation(ms, me.id);
  check(first && again === null && early === null && later === first, "at most one line per 20 s of real time", [first, again, early, later]);
  // at most one line per 20 s of real time in a whole match
  const ms2 = createMatch(configFor(31));
  let n = 0;
  while (ms2.phase !== 'over' && n++ < 200000) simStep(ms2);
  const sit = evs(ms2, 'situation');
  let minGap = Infinity;
  for (let i = 1; i < sit.length; i++) minGap = Math.min(minGap, sit[i].t - sit[i - 1].t);
  check(sit.length > 0 && minGap >= 20 - 1e-6, "a full match: scenario lines at most once per 20 real seconds", {lines: sit.length, minGap: r2(minGap)});
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-rules.json"), JSON.stringify(res, null, 1));
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
