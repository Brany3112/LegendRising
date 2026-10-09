// qa/unit/laws.mjs: the laws a match is played to (js/life/football/rules.js LAWS, lawsOf, cfg.mode and cfg.rules)
// under plain node: every law switched off on its own does what rules.js says it does, in the referee and in the
// brains (no offside line held or feared without offside, no wall or set-piece line-up at a kick-in), and an injured
// man with no change left walks off and is not replaced (3.2.9).
// Owner: WP-E. Contract DESIGN 1.4.13 (cfg.mode, cfg.rules), 1.4.14; behaviour 3.2.7 to 3.2.9, 3.6.2 (the partial
// simulations of training play with these laws).
//
//   node qa/unit/laws.mjs      exits 1 on any failed check; writes qa/out/unit-laws.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "../harness.mjs";
import {createMatch, simStep} from "../../js/life/football/sim.js";
import {RULES, LAWS, MODES, lawsOf, setCtl, ballOut, goalScored, startRestart, foul, refStep, onKick, onTouch, offsidePosition, planSub} from "../../js/life/football/rules.js";
import {restartShape} from "../../js/life/football/brain.js";
import {BALL} from "../../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-laws", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const H = 1/60, R = BALL.R;

const put = (a, x, z, vx = 0, vz = 0) => {
  a.m.x = x; a.m.z = z; a.m.vx = vx; a.m.vz = vz; a.m.speed = Math.hypot(vx, vz);
  a.x0 = x; a.z0 = z; a.body.x = x; a.body.z = z; a.tgt.x = x; a.tgt.z = z;
};
const ballAt = (ms, x, z, y = R) => { const b = ms.ball; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = 0; b.v.y = 0; b.v.z = 0; b.state = 'free'; };
// a match of the given mode and laws, live, team 0 attacking +x, the outfield players spread in their own halves
function scene({mode = 'match', rules = null, seed = 5} = {}){
  const cfg = configFor(seed);
  cfg.mode = mode; cfg.rules = rules == null ? (mode === 'match' ? cfg.rules : {}) : rules;
  const ms = createMatch(cfg);
  ms.phase = 'live'; ms.clock.running = true; ms.restart = null;
  const T = [0, 1].map(t => ms.agents.filter(a => a.team === t && a.role === 'player'));
  for (const t of [0, 1]){
    const sgn = t === 0 ? -1 : 1, out = T[t].filter(a => !a.isGK);
    put(T[t].find(a => a.isGK), sgn*51, 0);
    out.forEach((a, i) => put(a, sgn*(8 + (i % 4)*7), -28 + i*5.6));
  }
  ballAt(ms, 0, 0);
  return {ms, gk: [T[0].find(a => a.isGK), T[1].find(a => a.isGK)], out: [T[0].filter(a => !a.isGK), T[1].filter(a => !a.isGK)]};
}
const evs = (ms, kind) => ms.events.filter(e => e.kind === kind);
function ref(ms, sec){ const n = Math.round(sec/H); for (let i = 0; i < n; i++){ ms.t += H; ms.step++; refStep(ms, H); } }
// walk a body off by hand (the brains move him in a real match), the referee stepping
function walkOut(ms, a){ let n = 0; while (a.onPitch && n++ < 4000){ const dx = a.exit.x - a.m.x, dz = a.exit.z - a.m.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 2*H); a.m.x += dx/d*st; a.m.z += dz/d*st; ref(ms, H); } ref(ms, H); }

/* ---------- lawsOf: the modes' defaults and the overrides ---------- */
{
  const m = lawsOf({}), t = lawsOf({mode: 'ssg'}), o = lawsOf({mode: 'rondo', rules: {offside: true, subs: 3.4, goals: 7, restarts: 0}});
  check(m.mode === 'match' && Object.keys(LAWS.match).every(k => m[k] === LAWS.match[k]), "no mode: a match, every law played, five changes", m);
  check(MODES.filter(x => x !== 'match').every(x => { const l = lawsOf({mode: x}); return Object.keys(LAWS.training).every(k => l[k] === LAWS.training[k]); }),
    "every training mode: no offside, cards, changes, half time or added time; set pieces and both goals", t);
  check(o.offside === true && o.subs === 3 && o.goals === 2 && o.restarts === false && o.cards === false, "a block's own rules override its mode's (whole changes, at most 2 goals)", o);
  let threw = false; try { lawsOf({mode: 'futsal'}); } catch(e){ threw = true; }
  check(threw, "an unknown mode is an error");
  check(Object.isFrozen(m), "the laws are frozen at kick-off");
}

/* ---------- offside off: no snapshot, no flag; and the brains know it ---------- */
{
  const s = scene({mode: 'ssg'});
  const ms = s.ms, passer = s.out[0][0], att = s.out[0][1];
  put(s.out[1][0], 20, 25); s.out[1].slice(1).forEach((a, i) => put(a, 12 - (i % 3), -30 + i*6));
  put(passer, 0, 0); put(att, 24, -5); ballAt(ms, 0.65, 0);
  check(offsidePosition(ms, att, 0).off, "the attacker stands in an offside position (the question is still answered: the HUD's pip)");
  onKick(ms, {team: 0, agent: passer.id});
  ms.t += 1.5; onTouch(ms, att, 'control');
  ref(ms, 1.5);
  check(ms.offside.set.size === 0 && !ms.offside.pending && evs(ms, 'offside').length === 0 && evs(ms, 'flag').length === 0, "offside off: no snapshot at the kick, no flag, no whistle");
  // two minutes of 11 v 11 training play: how often a pass goes to a man beyond the line, with the law and without it
  const beyond = mode => {
    const cfg = configFor(41); cfg.mode = mode; cfg.rules = mode === 'match' ? cfg.rules : {};
    const m2 = createMatch(cfg);
    let seen = 0, kicks = 0, offs = 0, runsHeld = 0, runs = 0;
    for (let i = 0; i < 60*240 && m2.phase !== 'over'; i++){
      const n0 = m2.events.length;
      simStep(m2);
      for (let k = n0; k < m2.events.length; k++){
        const e = m2.events[k];
        if (e.kind === 'offside') offs++;
        if (e.kind !== 'kick' || e.whiff || !(e.recv >= 0) || e.rk) continue;
        const r = m2.agents[e.recv]; if (!r || r.team !== e.team) continue;
        kicks++; if (offsidePosition(m2, r, e.team).off) seen++;
      }
      for (const a of m2.agents) if (a.task && a.task.run && a.task.run.until > m2.t){ runs++; if (!a.task.run.go) runsHeld++; }
    }
    return {kicks, beyond: seen, offs, runs, runsHeld};
  };
  const on = beyond('match'), off = beyond('ssg');
  check(off.offs === 0 && off.beyond > on.beyond, "offside off: passes go to men beyond the line (nobody is offside), with it they seldom do", {on, off});
  check(off.runsHeld === 0 && (on.runs === 0 || on.runsHeld > 0), "offside off: a run in behind goes at once, it does not hold the line", {on: on.runsHeld, off: off.runsHeld});
}

/* ---------- cards off ---------- */
{
  const s = scene({mode: 'ssg'});
  const v = s.out[0][5], f = s.out[1][5];
  put(v, -5, 4, 3, 0); put(f, -5.5, 4.4); setCtl(s.ms, v);
  const F = foul(s.ms, f, v, 0.97, -5, 4, {down: true});
  check(F && F.card === null && !f.sentOff && f.booked === 0 && s.ms.stats.fouls[1] === 1 && evs(s.ms, 'card').length === 0, "cards off: the foul is given, nobody is booked or sent off");
}

/* ---------- restarts off: kick-ins, no wall, no penalty ---------- */
{
  const s = scene({mode: 'ssg', rules: {restarts: false}});
  s.ms.ball.last.team = 0;
  ballOut(s.ms, {line: 'touch', end: 0, x: 12.3, z: 34.2});
  const R1 = s.ms.restart;
  check(R1 && R1.kind === 'indirect' && R1.kickIn && Math.abs(R1.spot.z) <= s.ms.spec.hz - 0.5 + 1e-9, "restarts off: a ball over the touchline is a kick-in from inside the field", R1 && {kind: R1.kind, spot: R1.spot});
  // a foul 20 m out in front of goal: a kick-in, no wall
  const w = scene({mode: 'ssg', rules: {restarts: false}});
  const v = w.out[0][9], f = w.out[1][0];
  put(v, 32, 2, 3, 0); put(f, 31.5, 2.3); setCtl(w.ms, v);
  for (const o of w.out[1]) if (o !== f) put(o, Math.max(o.m.x, 36), o.m.z);
  foul(w.ms, f, v, 0.4, 32, 2, {down: true, tactical: false});
  restartShape(w.ms);
  const R2 = w.ms.restart;
  check(R2 && R2.kind === 'indirect' && R2.kickIn && (R2.wall || []).length === 0 && w.ms.agents.every(a => !a.wall), "restarts off: a foul 20 m out is a kick-in with no wall", R2 && {kind: R2.kind, wall: R2.wall});
  check(w.ms.agents.filter(a => a.set && (a.set.role === 'box' || a.set.role === 'line')).length === 0, "restarts off: nobody lines up for it as for a free kick");
  // with set pieces the same foul has its wall
  const w2 = scene({mode: 'match'});
  const v2 = w2.out[0][9], f2 = w2.out[1][0];
  put(v2, 32, 2, 3, 0); put(f2, 31.5, 2.3); setCtl(w2.ms, v2);
  for (const o of w2.out[1]) if (o !== f2) put(o, Math.max(o.m.x, 36), o.m.z);
  foul(w2.ms, f2, v2, 0.4, 32, 2, {down: true, tactical: false});
  restartShape(w2.ms);
  check(w2.ms.restart && w2.ms.restart.kind === 'free' && (w2.ms.restart.wall || []).length > 0, "a match: the same foul is a free kick with a wall", w2.ms.restart && w2.ms.restart.wall);
  // a foul in the box: no penalty
  const p = scene({mode: 'ssg', rules: {restarts: false}});
  const pv = p.out[0][9]; put(pv, 45, 3, 3, 0); setCtl(p.ms, pv); put(p.out[1][1], 48, 1);
  foul(p.ms, p.out[1][0], pv, 0.4, 45, 3, {down: true, tactical: false});
  check(p.ms.restart && p.ms.restart.kind === 'indirect' && p.ms.restart.kickIn && evs(p.ms, 'whistle').every(e => e.rk !== 'penalty'), "restarts off: a foul in the box is a kick-in, never a penalty", p.ms.restart && p.ms.restart.kind);
  // a kick-off stays a kick-off
  const k = scene({mode: 'ssg', rules: {restarts: false}});
  k.ms.ball.last.team = 0; k.ms.ball.last.agent = k.out[0][9].id; k.ms.ball.last.kind = 'shot';
  goalScored(k.ms, {end: 1, x: 52.7, y: 1, z: 1});
  check(k.ms.restart && k.ms.restart.kind === 'kickoff' && !k.ms.restart.kickIn, "restarts off: after a goal it is still a kick-off");
}

/* ---------- goals: 1 counts only the goal at the +x end ---------- */
{
  const s = scene({mode: 'ssg', rules: {goals: 1}});
  s.ms.ball.last.team = 1; s.ms.ball.last.agent = s.out[1][9].id; s.ms.ball.last.kind = 'shot';
  goalScored(s.ms, {end: -1, x: -52.7, y: 1, z: 1});
  check(s.ms.score[0] === 0 && s.ms.score[1] === 0 && evs(s.ms, 'goal').length === 0 && s.ms.restart && s.ms.restart.kind !== 'kickoff', "goals 1: a ball into the -x goal is out over the goal line, no goal", s.ms.restart && s.ms.restart.kind);
  const t = scene({mode: 'ssg', rules: {goals: 1}});
  t.ms.ball.last.team = 0; t.ms.ball.last.agent = t.out[0][9].id; t.ms.ball.last.kind = 'shot';
  goalScored(t.ms, {end: 1, x: 52.7, y: 1, z: 1});
  check(t.ms.score[0] === 1, "goals 1: the +x goal counts");
}

/* ---------- half time and added time ---------- */
{
  const s = scene({mode: 'ssg', rules: {stoppage: false}});
  s.ms.clock.sec = 2690; s.ms.stoppage[0] = 300;
  ref(s.ms, 3);
  check(s.ms.clock.added === 0, "stoppage off: no added time, however long the stoppages", s.ms.clock.added);
  s.ms.ball.last.team = 0;
  ballOut(s.ms, {line: 'touch', end: 0, x: 40, z: 34.1});
  ref(s.ms, H*2);
  check(s.ms.phase === 'fulltime' && evs(s.ms, 'whistle').some(e => e.why === 'ft') && !evs(s.ms, 'whistle').some(e => e.why === 'ht'), "half time off: the end of the first half is full time", s.ms.phase);
  const m = scene({mode: 'match'});
  m.ms.clock.sec = 2700 + 60; m.ms.clock.added = 1; m.ms.ball.p.x = 40;
  ref(m.ms, 2); m.ms.ball.last.team = 0;
  ballOut(m.ms, {line: 'touch', end: 0, x: 40, z: 34.1});
  ref(m.ms, H);
  check(m.ms.phase === 'halftime', "a match: the end of the first half is half time");
}

/* ---------- an injured man with no change left walks off and is not replaced (3.2.9) ---------- */
{
  const injureNow = (ms, f, v, x, z) => {
    // the referee's injury roll comes up: severity above CARD.injury with the match's next draw forced under CARD.injuryP
    const r0 = ms.r; let first = true; ms.r = () => { if (first){ first = false; return 0; } return r0(); };
    const F = foul(ms, f, v, 0.9, x, z, {down: true, tactical: false});
    ms.r = r0;
    return F;
  };
  for (const [name, mode, rules, used] of [["training (no changes)", 'ssg', {}, null], ["a match with all five changes made", 'match', null, [5, 5]]]){
    const s = scene({mode, rules});
    const ms = s.ms;
    if (used) ms.subs.used = used.slice();
    const v = s.out[0][4], f = s.out[1][4];
    put(v, -10, 6, 3, 0); put(f, -10.5, 6.4); setCtl(ms, v);
    const slot = v.slot, n0 = ms.agents.length, fwds = s.out[0].filter(a => a.slotLine === 'FWD' && a !== v);
    injureNow(ms, f, v, -10, 6);
    check(v.injured && evs(ms, 'injury').length === 1, `${name}: the foul injures him`);
    ref(ms, H);
    check(v.leaving && v.exit && Math.abs(v.exit.z) > ms.spec.hz, `${name}: he walks off at the nearest touchline at once`, {leaving: v.leaving, exit: v.exit});
    walkOut(ms, v);
    ref(ms, 1);
    check(!v.onPitch && evs(ms, 'sub').length === 0 && ms.agents.length === n0, `${name}: he is off and nobody comes on for him`, {onPitch: v.onPitch, subs: evs(ms, 'sub').length});
    const moved = fwds.filter(a => a.slot === slot);
    check(v.slotLine === 'FWD' || moved.length === 1, `${name}: a forward drops into his place in the shape`, {slot, by: moved.map(a => a.id)});
  }
  // with a change left the injured man is replaced as before
  const s = scene({mode: 'match'});
  const v = s.out[0][4], f = s.out[1][4];
  put(v, -10, 6, 3, 0); put(f, -10.5, 6.4); setCtl(s.ms, v);
  const r0 = s.ms.r; let first = true; s.ms.r = () => { if (first){ first = false; return 0; } return r0(); };
  foul(s.ms, f, v, 0.9, -10, 6, {down: true, tactical: false}); s.ms.r = r0;
  ref(s.ms, H); walkOut(s.ms, v); ref(s.ms, H);
  const sub = evs(s.ms, 'sub')[0];
  check(sub && sub.out === v.id && s.ms.subs.used[0] === 1, "a change left: a substitute comes on for the injured man", sub && {out: sub.out, in: sub.in});
  // and a planned change never takes the place an injury has already used
  check(!planSub(s.ms, 0, s.out[0][6].id, 'tactical') || s.ms.subs.used[0] + s.ms.subs.plan.length <= RULES.SUBS, "changes stay within five a side");
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-laws.json"), JSON.stringify(res, null, 1));
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
