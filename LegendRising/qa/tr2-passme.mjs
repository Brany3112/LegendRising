// qa/tr2-passme.mjs: passes meant for the player stay his (Node, the real simulation, seeded).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-passme.mjs: AI-2, the plan wipe of ball-1,
// ball-10); TRAINING-SPEC section 2 (passing: the AI never takes a pass meant for you; offside respected by the AI's
// passing).
//
//   1. AI-2: a team-mate's pass to you from 20 m, a second team-mate 6 m short of you and 2.5 m or 5 m off the lane: he
//      never goes for it (no 'chase' plan) in 8 seeds each, and you control it in at least 7 of 8. A team-mate standing
//      on the lane of a slow, under-hit pass, 14 m short of you, does go for it (clearly first).
//   2. ball-1: a first-time strike you queued on the pass (control.js plan.first) is still on your plan at the step you
//      first meet the ball, and is the strike you play there (a kick, not a control touch), in 12 of 12 runs (6 seeds,
//      with and without control.js's own plan kept).
//   3. ball-10: your "In behind!" call is offered to the carrier as a through ball when you stand 0.5 m onside, in 20 of
//      20 seeds, and never when you stand 0.5 m past the second-last defender (0 of 20), for a passer who reads the line
//      well (vision 96). For a typical passer (vision 50, his read of the line off by about 0.35 m, brain.js offErr) the
//      call is offered for a run 0.5 m onside in at least 32 of 40 seeds and for one 0.5 m off in at most 8 of 40, and
//      never for a run 1.5 m off (0 of 20).
//
//   node qa/tr2-passme.mjs      exits 1 on any failed check; writes qa/out/tr2-passme.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMatch, simStep, REF, AR1, AR2} from "../js/life/football/sim.js";
import * as rules from "../js/life/football/rules.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {makePitch} from "../js/life/football/pitchspec.js";
import {startAction, refreshPred} from "../js/life/football/actions.js";
import {decideCarrier, callFor} from "../js/life/football/brain.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2-passme", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const rec = (pid, slot, pos, me = false, ovr = 65, extra = null) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : "CM", isGK: slot === "GK", isMe: me,
  at: Object.assign(attrsForAI({id: pid, ovr, pos}), extra || {}), energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.set = null; };
function drill(seed, mine, theirs = [], rulesOf = {offside: false}){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: mine}, {players: theirs}], me: {team: 0, slot: "CM"}, rules: rulesOf, kickoffTeam: 0});
  ms.meAI = false;
  for (const id of [REF, AR1, AR2]) ms.agents[id].onPitch = false;
  ms.restart = null; ms.phase = "live"; ms.clock.running = true;
  return ms;
}

/* ---------- 1. AI-2: team-mates leave a pass to you alone ---------- */
function stealTrial(seed, mate, speedCut = null){
  const ms = drill(seed, [rec(11, "CM", "CM"), rec(12, "CM", "CM", true), rec(13, "CM", "CM")]);
  const [pa, me, mt] = ms.agents;
  put(pa, -20, 0, Math.PI/2); put(me, 0, 0, -Math.PI/2); put(mt, mate.x, mate.z, -Math.PI/2);
  const b = ms.ball; b.p.x = -19.4; b.p.z = 0; b.p.y = 0.11; b.state = "free"; rules.liveRoll(b);
  rules.setCtl(ms, pa); ms.cutStep = ms.step; refreshPred(ms);
  startAction(ms, pa, {kind: "pass", target: {x: 0, y: 0.11, z: 0}, recv: me.id, contact: 0, speed: speedCut || undefined});
  let chased = false, ctl = null;
  for (let k = 0; k < 420 && ctl == null; k++){
    me.intent.dx = 0; me.intent.dz = 0;
    simStep(ms);
    if (mt.plan && mt.plan.kind === "chase") chased = true;
    if (ms.poss.ctl >= 0 && ms.poss.ctl !== pa.id) ctl = ms.poss.ctl === me.id ? "player" : ms.poss.ctl === mt.id ? "mate" : "other";
  }
  return {chased, ctl};
}
for (const [lbl, at] of [["2.5 m off the lane", {x: -6, z: 2.5}], ["5 m off the lane", {x: -6, z: 5}]]){
  const t = {chased: 0, player: 0, mate: 0, other: 0, none: 0};
  for (let s = 1; s <= 8; s++){ const r = stealTrial(s, at); if (r.chased) t.chased++; t[r.ctl || "none"]++; }
  check(t.chased === 0, `a pass to you, a team-mate 6 m short and ${lbl}: he never goes for it (0 of 8)`, t);
  check(t.player >= 7, `a pass to you, a team-mate 6 m short and ${lbl}: you control it in at least 7 of 8`, t);
}
{
  // an under-hit pass, slow from the boot, through a team-mate standing on its lane 6 m from the passer: he meets it a
  // good second before you could, so he is clearly first and goes for it
  const t = {chased: 0, player: 0, mate: 0, other: 0, none: 0};
  for (let s = 1; s <= 8; s++){ const r = stealTrial(s, {x: -14, z: 0.8}, 5.2); if (r.chased) t.chased++; t[r.ctl || "none"]++; }
  check(t.chased >= 6, "an under-hit pass through a team-mate on its lane, 14 m short of you: he goes for it (clearly first, at least 6 of 8)", t);
}

/* ---------- 2. ball-1: a queued first-time strike survives to the contact ---------- */
{
  let kept = 0, runs = 0, kicked = 0;
  const lost = [];
  for (const keepPlan of [true, false]) for (let seed = 1; seed <= 6; seed++){
    const ms = drill(seed, [rec(11, "CM", "CM"), rec(12, "CM", "CM", true)]);
    const [pa, me] = ms.agents;
    put(pa, 10, 0, -Math.PI/2); put(me, 30, 0, -Math.PI/2);
    const b = ms.ball; b.p.x = 10.6; b.p.z = 0; b.p.y = 0.11; b.state = "free"; rules.liveRoll(b); rules.setCtl(ms, pa); ms.cutStep = ms.step; refreshPred(ms);
    startAction(ms, pa, {kind: "pass", target: {x: 30, y: 0.11, z: 0}, recv: me.id, contact: 0});
    let queued = false, contact = null, firstAtContact = false;
    for (let k = 0; k < 300 && contact == null; k++){
      me.intent.dx = 0; me.intent.dz = 0;
      const loose = ms.ball.state === "free" && ms.poss.ctl !== me.id && ms.poss.ctl !== pa.id;
      // (as control.js does each step: your 'receive' plan, made when the ball is loose and not yours)
      if (keepPlan && loose && !(me.plan && me.plan.kind === "receive")) me.plan = {kind: "receive", push: null, first: null, x: me.m.x, z: me.m.z};
      if (loose && !queued && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) < 14){
        const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind: "receive", push: null, first: null});
        p.first = {kind: "shot", target: {x: 52.5, y: 0.5, z: 0}, power: 0.8, contact: 0, firstTime: true}; p.firstT = ms.t; queued = true;
      }
      const had = !!(me.plan && me.plan.first);
      const n0 = ms.events.length;
      simStep(ms);
      const touched = ms.events.slice(n0).some(e => e.agent === me.id && (e.kind === "touch" || e.kind === "kick")) || ms.poss.ctl === me.id || (me.act && me.act.kind === "kick");
      if (queued && touched){ contact = k; firstAtContact = had; if (me.act && me.act.kind === "kick") kicked++; }
      else if (queued && !(me.plan && me.plan.first) && contact == null){ lost.push({seed, keepPlan, k, t: +ms.t.toFixed(2)}); break; }
    }
    runs++;
    if (contact != null && firstAtContact) kept++;
  }
  check(kept === runs && runs === 12, "a first-time strike queued on a pass to you is still on your plan when you meet the ball (12 of 12)", {kept, runs, kicked, lost});
  check(kicked === runs && runs === 12, "and it is the strike you play when you meet the ball, not a control touch (12 of 12)", {kicked, runs});
}

/* ---------- 3. ball-10: "In behind!" only when the passer sees you onside ---------- */
function behindOffered(seed, margin, vision = 96){
  // team 0 attacks +x: a carrier in the middle, you up front, two defenders on a line at x 20 (the second-last
  // opponent), their keeper behind them
  const passer = rec(21, "CM", "CM", false, 70, {vision});
  const ms = drill(seed, [passer, rec(22, "ST", "ST", true)], [rec(31, "GK", "GK"), rec(32, "CB", "DF"), rec(33, "CB", "DF")], {offside: true});
  const [pa, me, gk, d1, d2] = ms.agents;
  put(pa, 5, 0, -Math.PI/2); put(gk, 50, 0, Math.PI/2); put(d1, 20, -9, Math.PI/2); put(d2, 20, 9, Math.PI/2);
  put(me, 20 + margin, 2, -Math.PI/2);
  const b = ms.ball; b.p.x = 5.6; b.p.z = 0; b.p.y = 0.11; b.state = "free"; rules.liveRoll(b); rules.setCtl(ms, pa); refreshPred(ms);
  callFor(ms, me, "behind", {x: 34, z: 6});
  let offered = false;
  ms.onDecide = (a, opts) => { if (a === pa && opts.some(o => o.call)) offered = true; };
  decideCarrier(ms, pa);
  return offered;
}
{
  let on = 0, off = 0;
  for (let s = 1; s <= 20; s++){ if (behindOffered(s, -0.5)) on++; if (behindOffered(s, 0.5)) off++; }
  check(on === 20, `"In behind!" with your run 0.5 m onside: offered to the carrier (${on} of 20)`, on);
  check(off === 0, `"In behind!" with your run 0.5 m past the second-last defender: never offered (${off} of 20)`, off);
}
{
  // a typical passer (vision 50): he misreads a tight line now and then, as the plan's perceived line means, but not a
  // clear one
  let on = 0, off = 0, far = 0;
  for (let s = 1; s <= 40; s++){ if (behindOffered(s, -0.5, 50)) on++; if (behindOffered(s, 0.5, 50)) off++; }
  for (let s = 1; s <= 20; s++) if (behindOffered(s, 1.5, 50)) far++;
  check(on >= 32 && off <= 8, `a typical passer (vision 50): "In behind!" 0.5 m onside offered in ${on} of 40, 0.5 m off in ${off} of 40`, {on, off});
  check(far === 0, `a typical passer (vision 50): a run 1.5 m past the second-last defender is never offered (${far} of 20)`, far);
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/tr2-passme.json"), JSON.stringify(res, null, 1));
console.log(`tr2-passme: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
