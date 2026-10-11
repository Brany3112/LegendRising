// qa/unit/offside.mjs: the offside law of js/life/football/rules.js under plain node, case by case (DESIGN 4.6): the
// position at the snapshot, involvement, the assistant's borderline error and his flag delay, the resets, the restarts
// that carry no offence, a goal inside the delay, and one real through ball played through the whole simulation.
// Owner: WP-E. Contract DESIGN 1.4.14 (offsidePosition, onKick, onTouch, refStep); numbers 1.5.7; behaviour 3.2.7;
// acceptance 2.3 WP-E ("offside unit cases of 4.6 pass").
//
//   node qa/unit/offside.mjs     exits 1 on any failed check; writes qa/out/unit-offside.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "../harness.mjs";
import {createMatch, simStep} from "../../js/life/football/sim.js";
import {RULES, offsidePosition, onKick, onTouch, refStep, goalScored, startRestart, setCtl, clearCtl} from "../../js/life/football/rules.js";
import {startKick, startThrow, actionStep} from "../../js/life/football/actions.js";
import {BALL} from "../../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-offside", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const H = 1/60, R = BALL.R;

/* ---------- a scene: team 0 attacks +x (first half), everyone placed by hand ---------- */

const put = (a, x, z) => {
  a.m.x = x; a.m.z = z; a.m.vx = 0; a.m.vz = 0; a.m.speed = 0;
  a.x0 = x; a.z0 = z; a.body.x = x; a.body.z = z; a.tgt.x = x; a.tgt.z = z;
};
const ballAt = (ms, x, z) => {
  const b = ms.ball;
  b.p.x = x; b.p.y = R; b.p.z = z; b.v.x = 0; b.v.y = 0; b.v.z = 0;
  b.state = 'free';
};
// defLine: x of the second-last defender (the keeper is the last, on his line); att: the attacker's x
function scene({seed = 3, defLine = 20, att = 20.5, attZ = -5, passerX = 0} = {}){
  const ms = createMatch(configFor(seed));
  ms.phase = 'live'; ms.clock.running = true; ms.restart = null;
  const T0 = ms.agents.filter(a => a.team === 0 && a.role === 'player'), T1 = ms.agents.filter(a => a.team === 1 && a.role === 'player');
  const gk1 = T1.find(a => a.isGK), out1 = T1.filter(a => !a.isGK);
  put(gk1, 51, 0);
  put(out1[0], defLine, 25);                                       // the second-last opponent, far across
  out1.slice(1).forEach((a, i) => put(a, defLine - 8 - (i % 3), -30 + i*6));
  const gk0 = T0.find(a => a.isGK), out0 = T0.filter(a => !a.isGK);
  put(gk0, -51, 0);
  const passer = out0[0], attacker = out0[1], mate = out0[2];
  put(passer, passerX, 0); put(attacker, att, attZ); put(mate, passerX + 6, -12);
  out0.slice(3).forEach((a, i) => put(a, -12, -28 + i*8));
  ballAt(ms, passerX + 0.65, 0);
  return {ms, passer, attacker, mate, def2: out1[0], gk1, out1};
}
const kick = (ms, passer, extra = {}) => { const ev = Object.assign({team: passer.team, agent: passer.id}, extra); onKick(ms, ev); return ev; };
// the referee alone, sec seconds (refStep reads ms.t, which simStep normally moves)
function ref(ms, sec){ const n = Math.round(sec/H); for (let i = 0; i < n; i++){ ms.t += H; ms.step++; refStep(ms, H); } }
const evs = (ms, kind) => ms.events.filter(e => e.kind === kind);

/* ---------- 0.5 m beyond at the kick, then plays the ball ---------- */
{
  const {ms, passer, attacker} = scene({att: 20.5});
  const pos = offsidePosition(ms, attacker, 0);
  check(pos.off && Math.abs(pos.margin - 0.5) < 1e-9, "0.5 m beyond the second-last defender: offside position, margin 0.5", {off: pos.off, margin: r3(pos.margin)});
  kick(ms, passer);
  check(ms.offside.set.has(attacker.id), "the snapshot at the kick holds him");
  // he runs on and plays it 4 m further up, 2 s later
  ms.t += 2; put(attacker, 24.5, -4);
  const tInv = ms.t;
  onTouch(ms, attacker, 'control');
  const P = ms.offside.pending;
  check(P && P.who === attacker.id && P.x === 24.5 && P.z === -4, "playing the ball is involvement: the call is pending at the position he played it", P && {x: P.x, z: P.z});
  const want = RULES.OFF.flag0 + RULES.OFF.flagK*(1 - 0.5);
  check(P && Math.abs(P.flagAt - tInv - want) < 1e-9 && Math.abs(P.whistleAt - P.flagAt - RULES.OFF.whistle) < 1e-9,
    "flag 0.35 + 0.4(1 - 0.5) = 0.55 s after involvement, whistle 0.25 s after the flag", P && {flag: r3(P.flagAt - tInv), whistle: r3(P.whistleAt - P.flagAt)});
  ref(ms, 1.0);
  const fl = evs(ms, 'flag')[0], off = evs(ms, 'offside')[0];
  check(fl && Math.abs(fl.t - tInv - want) <= H + 1e-9, "the flag goes up on time", fl && r3(fl.t - tInv));
  check(off && off.agent === attacker.id && off.team === 0 && ms.stats.offsides[0] === 1, "the whistle gives offside against him", off && {agent: off.agent});
  check(off && off.margin === 0.5 && off.passer === passer.id && off.passerName === passer.name, "the call carries the margin and the passer (the HUD line)", off && {margin: off.margin, passer: off.passerName});
  const R0 = ms.restart;
  check(R0 && R0.kind === 'indirect' && R0.team === 1 && R0.spot.x === 24.5 && R0.spot.z === -4 && R0.offender === attacker.id,
    "indirect free kick to the defenders at the involvement position", R0 && {kind: R0.kind, team: R0.team, x: R0.spot.x, z: R0.spot.z});
}

/* ---------- 0.5 m behind, exactly level ---------- */
{
  const s1 = scene({att: 19.5});
  const p1 = offsidePosition(s1.ms, s1.attacker, 0);
  kick(s1.ms, s1.passer);
  onTouch(s1.ms, s1.attacker, 'control');
  check(!p1.off && Math.abs(p1.margin + 0.5) < 1e-9 && !s1.ms.offside.pending, "0.5 m behind: onside, no call", {margin: r3(p1.margin)});
  const s2 = scene({att: 20});
  const p2 = offsidePosition(s2.ms, s2.attacker, 0);
  check(!p2.off && Math.abs(p2.margin) < 1e-9, "exactly level: onside (level is onside)", {off: p2.off, margin: r3(p2.margin)});
  // the keeper counts: with only the keeper back, the second-last opponent is the deepest outfield player, and with
  // the keeper up the pitch the keeper can be the second-last himself
  const s3 = scene({att: 30});
  put(s3.gk1, 25, 0); put(s3.def2, 45, 25);
  const p3 = offsidePosition(s3.ms, s3.attacker, 0);
  check(p3.off && Math.abs(p3.margin - 5) < 1e-9, "the keeper counts as an opponent (keeper up at 25, a defender back at 45: line at 25)", {margin: r3(p3.margin)});
}

/* ---------- the assistant at the margin: error rate and flag delay (2000 trials each) ---------- */
{
  const {ms, passer, attacker} = scene();
  const trial = m => {
    put(attacker, 20 + m, -5);
    ms.offside.pending = null;
    kick(ms, passer);
    const inSet = ms.offside.set.has(attacker.id);
    const t0 = ms.t;
    onTouch(ms, attacker, 'control');
    const P = ms.offside.pending;
    const out = {inSet, called: !!P, delay: P ? P.flagAt - t0 : null};
    ms.offside.pending = null; ms.offside.set.clear();
    ms.t += 1;
    return out;
  };
  for (const m of [0.05, -0.05, 0.15, -0.15]){
    let wrong = 0, delayOk = true, worst = 0;
    for (let i = 0; i < 2000; i++){
      const o = trial(m);
      if (o.called !== (m > 0)) wrong++;
      if (o.called){
        const want = RULES.OFF.flag0 + RULES.OFF.flagK*(1 - Math.min(1, Math.max(0, m)));
        worst = Math.max(worst, Math.abs(o.delay - want));
        if (Math.abs(o.delay - want) > 1e-9) delayOk = false;
      }
    }
    const rate = wrong/2000, want = 0.15*(1 - Math.abs(m)/0.2);
    check(Math.abs(rate - want) <= 0.03, `margin ${m >= 0 ? "+" : ""}${m}: the assistant errs at 0.15(1 - |m|/0.2) = ${r3(want)} within 3 points`, r3(rate));
    check(delayOk, `margin ${m >= 0 ? "+" : ""}${m}: every flag goes up 0.35 + 0.4(1 - m) s after involvement`, r3(worst));
  }
  for (const m of [0.3, -0.3]){
    let wrong = 0;
    for (let i = 0; i < 2000; i++){ const o = trial(m); if (o.called !== (m > 0)) wrong++; }
    check(wrong === 0, `margin ${m >= 0 ? "+" : ""}${m}: never wrong (2000 trials)`, wrong);
  }
}

/* ---------- own half, behind the ball ---------- */
{
  // the defenders pushed up into the attackers' half: an attacker beyond them but in his own half is onside
  const {ms, passer, attacker, def2, out1} = scene({att: -5, passerX: -20});
  put(def2, -15, 25); out1.slice(1).forEach((a, i) => put(a, -18, -30 + i*6));
  const p = offsidePosition(ms, attacker, 0);
  kick(ms, passer);
  onTouch(ms, attacker, 'control');
  check(!p.off && !ms.offside.set.has(attacker.id) && !ms.offside.pending, "in his own half, past the last outfield defender: onside", {margin: r3(p.margin)});
  // level with the halfway line counts as his own half
  put(attacker, -0.25, -5);
  check(!offsidePosition(ms, attacker, 0).off, "his body point exactly on the halfway line: onside");
  // behind the ball: the line is the ball when the ball is further forward than the second-last defender
  const s = scene({att: 24.5, passerX: 25});
  ballAt(s.ms, 25.5, 0);
  const q = offsidePosition(s.ms, s.attacker, 0);
  check(!q.off && q.margin < 0, "behind the ball (ball at 25.5, attacker's body point at 24.75): onside", {margin: r3(q.margin), line: r3(q.line - s.ms.spec.L/2)});
}

/* ---------- throw-ins, goal kicks and corners carry no offence ---------- */
{
  const {ms} = scene();
  const kinds = {};
  for (const k of ['throw', 'goalkick', 'corner', 'free', 'indirect', 'kickoff', 'penalty']){
    ms.restart = null;
    kinds[k] = startRestart(ms, k, 0, {x: 10, z: 10}).noOff;
  }
  check(kinds.throw && kinds.goalkick && kinds.corner && !kinds.free && !kinds.indirect && !kinds.kickoff && !kinds.penalty,
    "throw-ins, goal kicks and corners are marked no-offside; free kicks, kick-offs and penalties are not", kinds);
  // a real throw-in to a man 10 m beyond the line: the throw is logged without a snapshot
  const s = scene({att: 30});
  ms.restart = null;
  const R0 = startRestart(s.ms, 'throw', 0, {x: 20, z: 33.95});
  R0.taker = s.passer.id; R0.ready = true;
  put(s.passer, 20, 34.3);
  s.ms.ball.p.x = 20; s.ms.ball.p.y = 1.9; s.ms.ball.p.z = 33.95; s.ms.ball.state = 'held'; s.ms.ball.holder = s.passer.id;
  s.ms.phase = 'restart';
  startThrow(s.ms, s.passer, {x: 30, z: 20}, s.attacker.id);
  let ev = null;
  for (let i = 0; i < 120 && !ev; i++){ s.ms.t += H; s.ms.step++; actionStep(s.ms, s.passer, H); ev = evs(s.ms, 'kick').find(e => e.intent === 'throw'); }
  check(ev && ev.noOffside && ev.rk === 'throw' && s.ms.offside.set.size === 0, "a throw-in to a man beyond the line takes no snapshot", ev && {noOffside: ev.noOffside, snap: s.ms.offside.set.size});
  onTouch(s.ms, s.attacker, 'control');
  check(!s.ms.offside.pending, "he plays it: no offence from a throw-in");
  // a corner or a goal kick logged with noOffside clears an older snapshot and takes none
  const c = scene({att: 30});
  kick(c.ms, c.passer);
  const had = c.ms.offside.set.size;
  kick(c.ms, c.passer, {noOffside: true, rk: 'corner'});
  onTouch(c.ms, c.attacker, 'control');
  check(had === 1 && c.ms.offside.set.size === 0 && !c.ms.offside.pending, "a corner or goal kick takes no snapshot and ends the last one", {had});
}

/* ---------- passive player ---------- */
{
  const {ms, passer, attacker, mate, out1} = scene({att: 30, attZ: -20});
  kick(ms, passer);
  check(ms.offside.set.has(attacker.id), "the passive attacker is in the snapshot");
  // the ball goes to an onside team-mate, then an opponent plays it 10 m from the attacker
  ms.t += 1; ballAt(ms, mate.m.x, mate.m.z); onTouch(ms, mate, 'control');
  ms.t += 2; put(out1[2], 12, 0); ballAt(ms, 12.5, 0); onTouch(ms, out1[2], 'control');
  ref(ms, 2);
  check(!ms.offside.pending && evs(ms, 'offside').length === 0 && evs(ms, 'flag').length === 0, "beyond the line but never touching or challenging: no call");
  // an opponent plays at it with the offside attacker challenging within 1.5 m: involved
  const s = scene({att: 30, attZ: -20});
  kick(s.ms, s.passer);
  s.ms.t += 1.5; put(s.attacker, 33, -10); put(s.out1[1], 34, -9); ballAt(s.ms, 33.8, -9.6);
  onTouch(s.ms, s.out1[1], 'control');
  check(s.ms.offside.pending && s.ms.offside.pending.who === s.attacker.id, "challenging an opponent for the ball within 1.5 m is involvement");
}

/* ---------- crosses the line after the kick ---------- */
{
  const {ms, passer, attacker} = scene({att: 19.5});
  kick(ms, passer);
  ms.t += 1.5; put(attacker, 27, -5);
  check(offsidePosition(ms, attacker, 0).off, "he is past the line when the ball reaches him");
  onTouch(ms, attacker, 'control');
  ref(ms, 1.5);
  check(!ms.offside.pending && evs(ms, 'offside').length === 0, "onside at the kick, beyond the line at the touch: onside (the snapshot is at contact)");
}

/* ---------- resets: a deliberate opponent touch resets, a deflection or a save does not ---------- */
{
  const run = how => {
    const s = scene({att: 21, attZ: -20});
    kick(s.ms, s.passer);
    // an opponent plays the ball well away from the attacker
    const d = s.out1[3];
    s.ms.t += 1; put(d, 10, 5); ballAt(s.ms, 10.4, 5);
    onTouch(s.ms, how === 'save' ? s.gk1 : d, how);
    s.ms.t += 1; ballAt(s.ms, s.attacker.m.x + 0.5, s.attacker.m.z);
    onTouch(s.ms, s.attacker, 'control');
    return !!s.ms.offside.pending;
  };
  const deliberate = run('control'), tackle = run('tackle'), header = run('header');
  check(!deliberate && !tackle && !header, "a deliberate opponent touch (control, tackle, header) resets: no offence", {deliberate, tackle, header});
  const deflect = run('deflect'), save = run('save'), blockT = run('block');
  check(deflect && save && blockT, "a deflection, a block or a save does not reset: offside", {deflect, save, block: blockT});
  // the next kick by the attacking team takes a new snapshot; the ball going out ends it
  const s = scene({att: 21});
  kick(s.ms, s.passer);
  put(s.attacker, 15, -5);
  kick(s.ms, s.mate);
  check(!s.ms.offside.set.has(s.attacker.id), "the next kick by the attacking team takes a fresh snapshot (he had come back onside)");
}

/* ---------- a goal inside the flag delay ---------- */
{
  const {ms, passer, attacker} = scene({att: 21.5});
  kick(ms, passer);
  ms.t += 1.2; put(attacker, 40, -2);
  onTouch(ms, attacker, 'control');
  const P = ms.offside.pending;
  ms.t += 0.3;
  check(P && ms.t < P.flagAt, "the shot goes in before the flag", P && r3(P.flagAt - ms.t));
  goalScored(ms, {end: ms.dirs[0], x: ms.dirs[0]*(ms.spec.hx + 0.3), y: 1, z: 0, t: ms.t});
  const g = evs(ms, 'goal')[0];
  check(g && g.disallowed && ms.score[0] === 0 && evs(ms, 'offside').length === 1, "a goal inside the delay is disallowed and the offside given", g && {disallowed: g.disallowed, score: ms.score});
  check(ms.restart && ms.restart.kind === 'indirect' && ms.restart.team === 1 && ms.restart.spot.x === 40, "the restart is the indirect free kick at the involvement position");
}

/* ---------- one through ball through the whole simulation ---------- */
{
  const {ms, passer, attacker} = scene({att: 21, attZ: -6});
  // the passer faces +x with the ball at his feet and plays it into the attacker's run
  passer.m.yaw = -Math.PI/2; passer.look.yaw = passer.m.yaw;
  setCtl(ms, passer);
  ms.poss.team = 0;
  startKick(ms, passer, {kind: 'through', target: {x: 30, y: R, z: -6}, recv: attacker.id});
  let kickEv = null, off = null, steps = 0;
  while (steps++ < 60*12 && !off){
    simStep(ms);
    if (!kickEv) kickEv = ms.events.find(e => e.kind === 'kick' && e.agent === passer.id) || null;
    off = evs(ms, 'offside')[0] || null;
  }
  check(kickEv && kickEv.offSnap && kickEv.offSnap.includes(attacker.id) && kickEv.recvOff, "the real kick takes the snapshot with the receiver beyond the line", kickEv && {snap: kickEv.offSnap, recvOff: kickEv.recvOff});
  check(off && off.agent === attacker.id, "simStep: he plays it, the flag, the whistle", off && {agent: off.agent, t: r3(off.t - kickEv.t)});
  check(off && ms.restart && ms.restart.kind === 'indirect' && ms.restart.team === 1, "simStep: indirect free kick to the defenders", ms.restart && ms.restart.kind);
  clearCtl(ms);
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-offside.json"), JSON.stringify(res, null, 1));
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
