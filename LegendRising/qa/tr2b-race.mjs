// qa/tr2b-race.mjs: first to the ball and the 50/50 (TRAINING-SPEC section 3) in the real simulation (Node, seeded).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance "qa/tr2b-race.mjs"
// (ball-2, ball-3).
//
// 10 seeds of 11 v 11 (the harness's own match configurations, every player the AI's):
//   1. when the first arrival of one side (zone.arrivals) is more than 0.15 s ahead of the other side's, that side plays
//      the ball next at least 95% of the time (sampled as the first arrival is under 0.12 s away, the man going for it);
//   2. duels happen only inside the window (every 'duel' event's gap is at most DUEL_WIN);
//   3. "locked" steps: 0. A step is locked when an opponent who could play the ball (zone.canPlay) is nearer it than its
//      controller, with it inside his control radius R, as the step decides who plays the ball (the men where their
//      movement took them, the ball where the last step left it: the moment the engine looks), and in the step nobody
//      played it (no 50/50, no lapse of control, no tackle, no change of control, and he has had no roll at it in this
//      engagement; a man off the ball at either end of the step, his timers not yet run down or a tackle begun, is not
//      counted). Both distances are the radius's own (to the ball's centre, from where each man plays it); a man with a
//      body of the other side standing on the line to the ball cannot play it through him (that is a tackle or a shield
//      challenge) and is not counted.
//      The baseline is the verifier's lockSteps (fp/p1/verify-ball/v3-match.mjs: 693 and 1058 a match on seeds 7 and 8,
//      with the old fixed foot reach); the inspector's looser count (an opponent nearer with the ball in the old 360
//      degree foot envelope, 888 and 1335) must fall too;
//   4. no NaN anywhere.
// And the 50/50 itself, 400 duels a cell: two men level with a slow ball between them, their X = S + C apart by 0, 15 and
// 30: the winner rate follows duel.p5050 within 5 points, and the higher rating wins more.
//
//   node qa/tr2b-race.mjs      exits 1 on any failed check; writes qa/out/tr2b-race.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "./harness.mjs";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {arrivals, canPlay, ratings, GHOST_T} from "../js/life/football/zone.js";
import {reachEnvelope} from "../js/life/football/touch.js";
import {p5050} from "../js/life/football/duel.js";
import {TUNE} from "../js/life/football/tune.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {makePitch} from "../js/life/football/pitchspec.js";
import {refreshPred, touchCheck} from "../js/life/football/actions.js";
import {BALL} from "../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2b-race", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r3 = v => Math.round(v*1000)/1000;
const R = BALL.R;
const RACE_T = +(process.env.RACE_T || 0.12);
const SEEDS = (process.env.RACE_SEEDS || "1,2,3,4,5,6,7,8,9,10").split(",").map(Number);

// the old fixed foot envelope (before P2b-A: 0.75 + 0.003 dribbling, 360 degrees, a ball under 0.6 m), for the
// inspector's looser count
const oldFoot = (o, b) => b.p.y < 0.6 && Math.hypot(b.p.x - o.m.x, b.p.z - o.m.z) <= 0.75 + 0.003*(o.at.dribbling || 50);

// a body of the other side on the line from a to the ball, in its middle stretch (within 0.3 m of it)
function blockedOf(ms, a, b){
  const lx = b.p.x - a.m.x, lz = b.p.z - a.m.z, L2 = lx*lx + lz*lz;
  if (L2 < 0.09) return false;
  for (const x of ms.agents){
    if (x.team === a.team || x.team < 0 || !x.onPitch || x.role !== 'player') continue;
    const ex = x.m.x - a.m.x, ez = x.m.z - a.m.z;
    if (ex*ex + ez*ez > L2) continue;
    const t = (ex*lx + ez*lz)/L2;
    if (t <= 0.15 || t >= 0.9) continue;
    const px = lx*t - ex, pz = lz*t - ez;
    if (px*px + pz*pz < 0.09) return true;
  }
  return false;
}
// the radius as the engine reads it: now, or where the ball will be half way through the step or at its end (a ball
// coming into a man's radius in this step is his to play now)
const BA = {p: {x: 0, y: 0, z: 0}, v: null};
function envOf(a, b){
  const e = reachEnvelope(a, b);
  if (e && e.part !== 'head') return e;
  for (const f of [1, 0.5]){
    const t = f/60;
    BA.p.x = b.p.x + b.v.x*t; BA.p.y = b.p.y + b.v.y*t - 4.905*t*t; BA.p.z = b.p.z + b.v.z*t; BA.v = b.v;
    const e2 = reachEnvelope(a, BA);
    if (e2 && e2.part !== 'head') return e2;
  }
  return e;
}
// the opponents of the controller who have the ball inside their radius and are nearer it than he is
// (t: the time the engine decided at, the step's start: ms.t moves on only at the end of simStep)
function nearerInR(ms, could, t){
  const c = ms.poss.ctl, b = ms.ball, out = [];
  if (c < 0 || b.state !== 'free' || ms.phase !== 'live') return out;
  const C = ms.agents[c], eC = envOf(C, b), dC = eC && eC.part !== 'head' ? eC.dist : Math.hypot(b.p.x - C.m.x, b.p.z - C.m.z);
  for (const o of ms.agents){
    if (o.team === C.team || o.team < 0 || !canPlay(ms, o) || could && !could.has(o.id)) continue;
    const L = b.last;
    if (o.id === L.agent && t - L.t < GHOST_T && L.kind !== 'dribble' && L.kind !== 'control') continue;
    const e = envOf(o, b);
    if (!e || e.part === 'head' || e.dist >= dC || blockedOf(ms, o, b)) continue;
    out.push(o.id);
  }
  return out;
}

const per = [];
let nan = 0, samples = 0, firstWins = 0, gapsBad = 0, duels = 0;
for (const seed of SEEDS){
  const ms = createMatch(configFor(seed, {}));
  let locked = 0, loose = 0, pend = null, seen = 0;
  const v3 = {steps: 0, why: {}, pend: [], unplayed: 0};
  while (ms.phase !== 'over'){
    const ctl0 = ms.poss.ctl, bp0 = {x: ms.ball.p.x, y: ms.ball.p.y, z: ms.ball.p.z}, st0 = ms.ball.state, t0 = ms.t, bv0 = {x: ms.ball.v.x, y: ms.ball.v.y, z: ms.ball.v.z};
    // who could play it as the step began (the timers that keep a man off the ball run down only after the ball's turn,
    // and a tackle begun in the step is his go at it)
    const could = new Set();
    if (ctl0 >= 0) for (const o of ms.agents) if (o.team >= 0 && canPlay(ms, o)) could.add(o.id);
    // the inspector's looser count, as ball.md measured it (before the step)
    if (ctl0 >= 0 && ms.ball.state === 'free' && ms.phase === 'live'){
      const C = ms.agents[ctl0], b = ms.ball, dC = Math.hypot(b.p.x - C.m.x, b.p.z - C.m.z);
      for (const o of ms.agents){ if (o.team !== C.team && o.team >= 0 && o.onPitch && o.role === 'player' && !o.act && oldFoot(o, b) && Math.hypot(b.p.x - o.m.x, b.p.z - o.m.z) < dC){ loose++; break; } }
    }
    // the race: a low loose ball whose first arrival is imminent (under 0.12 s) and going for it (the AI's ball plan: a man
    // the brain sends elsewhere is not in the race): note the two sides' first arrivals (a keeper's
    // hands and a header are contests of their own, gkbrain.js and the header: not sampled)
    if (!pend && ms.poss.ctl < 0 && ms.ball.state === "free" && ms.phase === "live" && ms.ball.p.y < 0.6){
      const L = arrivals(ms);
      if (L.length && L[0].t < RACE_T){
        const a0 = L[0], o0 = L.find(e => e.team !== a0.team);
        const gap = o0 ? o0.t - a0.t : Infinity;
        const goes = id => { const P = ms.agents[id].plan; return !!P && (P.kind === "receive" || P.kind === "chase" || P.kind === "intercept"); };
        const going = goes(a0.id) && (!o0 || goes(o0.id));
        if (going && gap > TUNE.DUEL_WIN.value + 1e-9 && !ms.agents[a0.id].isGK && !(o0 && ms.agents[o0.id].isGK)){ const A0 = ms.agents[a0.id]; pend = {team: a0.team, gap, t: ms.t, who: a0.id, t0: a0.t, plan: A0.plan && A0.plan.kind, gk: A0.isGK, lk: ms.ball.last.kind, lt: ms.ball.last.team, opp: o0 ? o0.t : null, bv: Math.hypot(ms.ball.v.x, ms.ball.v.z), by: ms.ball.p.y}; }
      }
    }
    // the verifier's v3 lockSteps, as fp/p1/verify-ball/v3-match.mjs counts it (before the step: an opponent not in an
    // action with the ball in his radius at foot height, nearer it than the controller), with why he did not play it
    let v3o = null, engineSeen = null;
    if (ms.phase === 'live' && ms.ball.state === 'free' && ctl0 >= 0){
      const C = ms.agents[ctl0], b = ms.ball, dc = Math.hypot(b.p.x - C.m.x, b.p.z - C.m.z);
      for (const o of ms.agents){
        if (!o.onPitch || o.role !== 'player' || o.team === C.team || o.team < 0 || o.act) continue;
        const e = reachEnvelope(o, b);
        if (e && (e.part === 'foot' || e.part === 'sole') && e.dist < dc){ v3o = o; break; }
      }
    }
    const n0 = ms.events.length;
    simStep(ms);
    const evs = ms.events.slice(n0);
    // who played it next
    if (pend){
      const t = evs.find(e => (e.kind === 'touch' && e.how !== 'deflect' && !e.body) || e.kind === 'kick' || e.kind === 'tackle' || e.kind === 'save' || e.kind === 'catch');
      if (t){ samples++; if (t.team === pend.team) firstWins++; else if (process.env.RACE_DEBUG) console.log("miss", JSON.stringify(pend), t.kind, t.how || t.intent, t.agent, t.team); pend = null; }
      else if (ms.t - pend.t > 3 || ms.phase !== 'live' || ms.poss.ctl >= 0 && ms.agents[ms.poss.ctl].team >= 0 && (samples++, ms.agents[ms.poss.ctl].team === pend.team ? firstWins++ : 0, true)) pend = null;
    }
    // a locked step: nearer and in reach as the engine looked (the men moved, the ball not yet), nobody played it, and he
    // has had no roll at it
    if (ctl0 >= 0 && ms.poss.ctl === ctl0 && st0 === 'free'){
      const played = evs.some(e => e.kind === 'duel' || e.kind === 'tackle' || e.kind === 'shieldChal' || e.kind === 'touch' && e.agent !== ctl0);
      // (the ball as the engine saw it: where it was before its own step, and how fast: the look-ahead reads its velocity,
      // which is the step's start value unless the controller's own dribble touch in the men's turn set a new one, as
      // near the one the ball ends the step with as one step of drag makes it)
      const touched = evs.some(e => e.kind === 'touch' && e.agent === ctl0);
      const b = ms.ball, bx = b.p.x, by = b.p.y, bz = b.p.z, vx = b.v.x, vy = b.v.y, vz = b.v.z;
      b.p.x = bp0.x; b.p.y = bp0.y; b.p.z = bp0.z;
      if (!touched){ b.v.x = bv0.x; b.v.y = bv0.y; b.v.z = bv0.z; }
      const seen = played ? [] : nearerInR(ms, could, t0);
      engineSeen = seen;
      b.p.x = bx; b.p.y = by; b.p.z = bz; b.v.x = vx; b.v.y = vy; b.v.z = vz;
      if (!played && seen.some(id => !(ms.agents[id].duelOn === ctl0 && t0 - ms.agents[id].duelT < TUNE.CHAL_GAP.value))){
        locked++;
        if (process.env.RACE_DEBUG){ const C = ms.agents[ctl0], b = ms.ball; const id = seen[0], o = ms.agents[id]; console.log("locked", seed, ms.t.toFixed(2), "C", ctl0, Math.hypot(b.p.x - C.m.x, b.p.z - C.m.z).toFixed(2), JSON.stringify(reachEnvelope(C, b)), "o", id, Math.hypot(b.p.x - o.m.x, b.p.z - o.m.z).toFixed(2), JSON.stringify(reachEnvelope(o, b)), "duelOn", o.duelOn, (ms.t - o.duelT).toFixed(2), "b", b.p.y.toFixed(2), Math.hypot(b.v.x, b.v.z).toFixed(1), "evs", evs.map(e => e.kind).join(",")); }
      }
    }
    if (v3o){
      v3.steps++;
      const o = v3o, C = ms.agents[ctl0];
      // the reason, in the engine's own terms: a contest he has just lost or had his roll in (G0: one roll for each
      // engagement; the loser of a 50/50 or a tackle cannot touch it for DUEL_LOCK), a body that cannot play (down,
      // staggered, getting up), a body of the other side on the line, or the engine's look a step on from the probe's
      // (the men move before the ball is decided: he plays it in this step or the next)
      let why;
      if (t0 < (o.noTouch || 0)) why = 'lostContest';
      else if (o.duelOn === ctl0 && t0 - o.duelT < TUNE.CHAL_GAP.value || o.chalOn === ctl0 && t0 - o.chalRoll < TUNE.CHAL_GAP.value) why = 'rolledThisEngagement';
      else if (!canPlay(ms, o) || t0 < (o.recoverT || 0)) why = 'cannotPlay';
      else if (blockedOf(ms, o, ms.ball)) why = 'bodyOnLine';
      else if (engineSeen && !engineSeen.includes(o.id)) why = 'notNearerOrBlockedAtEngineLook';
      else why = 'pending';
      v3.why[why] = (v3.why[why] || 0) + 1;
      if (why === 'pending') v3.pend.push({id: o.id, t: t0, n: 2, ctl: ctl0});
    }
    // a pending one must be played by him (or the ball be his side's, or loose) within the next two steps
    for (let i = v3.pend.length - 1; i >= 0; i--){
      const P = v3.pend[i];
      if (evs.some(e => e.agent === P.id && (e.kind === 'touch' || e.kind === 'duel' || e.kind === 'tackle' || e.kind === 'shieldChal' || e.kind === 'kick')) || ms.poss.ctl !== P.ctl){ v3.pend.splice(i, 1); continue; }
      if (--P.n <= 0){
        v3.unplayed++; v3.pend.splice(i, 1);
        if (process.env.RACE_DEBUG){ const o = ms.agents[P.id], C = ms.agents[P.ctl], b = ms.ball, e = reachEnvelope(o, b), eC = reachEnvelope(C, b);
          console.log("v3 unplayed", seed, P.t.toFixed(2), "o", P.id, "d", Math.hypot(b.p.x - o.m.x, b.p.z - o.m.z).toFixed(2), e && e.R.toFixed(2), "C", P.ctl, Math.hypot(b.p.x - C.m.x, b.p.z - C.m.z).toFixed(2), eC && eC.R.toFixed(2), "shield", !!(C.shield && C.shield.on), "act", C.act && C.act.kind, "oact", o.act && o.act.kind, "duelOn", o.duelOn, "chalOn", o.chalOn, "by", b.p.y.toFixed(2), "bv", Math.hypot(b.v.x, b.v.z).toFixed(1), "last", b.last.kind, b.last.agent); }
      }
    }
    for (const a of ms.agents) if (a.onPitch && !(Number.isFinite(a.m.x) && Number.isFinite(a.m.z))) nan++;
    if (!(Number.isFinite(ms.ball.p.x) && Number.isFinite(ms.ball.p.y) && Number.isFinite(ms.ball.p.z))) nan++;
    for (; seen < ms.events.length; seen++){
      const e = ms.events[seen];
      if (e.kind === 'duel'){ duels++; if (!(e.gap <= TUNE.DUEL_WIN.value + 1e-9)) gapsBad++; }
    }
  }
  per.push({seed, locked, inspector: loose, duels: ms.events.filter(e => e.kind === 'duel').length, v3: v3.steps, v3why: v3.why, v3unplayed: v3.unplayed});
}
check(samples >= 200 && firstWins/samples >= 0.95, "with the first arrival more than 0.15 s ahead of the other side's, that side plays it next (95% or more)", {samples, share: r3(firstWins/samples)});
check(duels > 0 && gapsBad === 0, "50/50s happen only inside the window (every duel's arrival gap is at most 0.15 s)", {duels, outside: gapsBad});
check(per.every(p => p.locked === 0), "no locked steps (an opponent nearer the ball with it in his radius who cannot play it): 0 in every match", per.map(p => ({seed: p.seed, locked: p.locked})));
// the verifier's own v3 metric: reported in full, with the reason for each step; every step must have one of the engine's
// reasons (a contest just lost or rolled, a body that cannot play, a body on the line, not nearer or blocked once the men
// have moved, where the engine looks) or be played by him within the next two steps (the probe looks before the men
// move, the engine after)
console.log("  v3 lockSteps (the verifier's metric, before the step): " + JSON.stringify(per.map(p => ({seed: p.seed, v3: p.v3, why: p.v3why}))));
check(per.every(p => p.v3unplayed === 0), "the verifier's v3 locked steps: each one is a contest he has just lost or rolled in, a body that cannot play, a body on the line, or played by him within two steps", per.map(p => ({seed: p.seed, v3: p.v3, unexplained: p.v3unplayed})));
const s7 = per.find(p => p.seed === 7), s8 = per.find(p => p.seed === 8);
if (s7 && s8) check(s7.inspector < 888 && s8.inspector < 1335, "the inspector's looser count falls (seed 7 under 888, seed 8 under 1335)", {seed7: s7.inspector, seed8: s8.inspector});
check(nan === 0, "no NaN anywhere", {nan});

/* ---------- the 50/50 itself ---------- */
// two men level with a slow ball rolling between them; S, C (and so X = S + C) set flat: every stat they read at v
const flat = (id, v) => Object.assign(attrsForAI({id, ovr: 50, pos: 'CM'}), {ctrl: v, strength: v, balance: v, agility: v, composure: 50});
const rec = (pid, slot, at) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : "CM", isGK: slot === "GK", isMe: false, at, energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = yaw; a.set = null; a.plan = null; };
function duelOnce(seed, vA, vB){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: [rec(101, "GK", attrsForAI({id: 101, ovr: 50, pos: 'GK'})), rec(102, "CM", flat(102, vA))]},
    {players: [rec(201, "GK", attrsForAI({id: 201, ovr: 50, pos: 'GK'})), rec(202, "CM", flat(202, vB))]}], me: {team: 0, slot: "CM"}, rules: {offside: false}, kickoffTeam: 0});
  ms.phase = 'live'; ms.restart = null;
  for (const g of ms.agents.filter(a => a.isGK)) put(g, (g.team ? 1 : -1)*50, 0, 0);
  const A = ms.agents.find(a => a.team === 0 && !a.isGK), B = ms.agents.find(a => a.team === 1 && !a.isGK);
  put(A, 0, -0.75, Math.PI); put(B, 0, 0.75, 0);
  // (they stand and wait for it: a scripted act keeps the brains from running them into each other)
  A.act = {kind: 'script', t: 0, dur: 1e9}; B.act = {kind: 'script', t: 0, dur: 1e9};
  const b = ms.ball; b.state = 'free'; b.p.x = -3; b.p.y = R; b.p.z = 0; b.v.x = 3; b.v.y = 0; b.v.z = 0;
  b.last.agent = -1; b.last.team = -1; b.last.kind = 'pass'; b.last.t = -9;
  ms.poss.ctl = -1; refreshPred(ms);
  const from = ms.events.length;
  for (let i = 0; i < 120; i++){
    for (const a of [A, B]){ a.intent.dx = 0; a.intent.dz = 0; a.plan = {kind: 'chase', x: 0, z: 0, t: 0, y: R, at: 0, first: null, push: null}; a.brain.next = 1e9; }
    touchCheck(ms);
    const d = ms.events.slice(from).find(e => e.kind === 'duel');
    if (d) return {won: d.won === A.id, xa: ratings(A.at).S + ratings(A.at).C, xb: ratings(B.at).S + ratings(B.at).C};
    simStep(ms);
  }
  return null;
}
{
  const rows = [];
  let ok = true;
  for (const [gap, base] of [[0, 50], [15, 50], [30, 50]]){
    const vA = base + gap/4, vB = base - gap/4;
    let w = 0, n = 0, xa = 0, xb = 0;
    for (let s = 1; s <= 400; s++){ const d = duelOnce(7000 + gap*1000 + s, vA, vB); if (!d) continue; n++; if (d.won) w++; xa = d.xa; xb = d.xb; }
    const want = p5050(xa, xb, 1, 1);
    rows.push({gapX: r3(xa - xb), n, rateA: r3(w/n), want: r3(want)});
    if (!(n === 400 && Math.abs(w/n - want) <= 0.05)) ok = false;
  }
  check(ok, "the 50/50 is won at p5050(XA, XB) within 5 points, 400 duels at X gaps of 0, +15 and +30", rows);
  check(rows[1].rateA > 0.5 && rows[2].rateA > rows[1].rateA - 0.03, "the side with the higher control rating wins more", rows.map(r => r.rateA));
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "tr2b-race.json"), JSON.stringify(Object.assign(res, {per}), null, 1));
console.log(`tr2b-race: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
