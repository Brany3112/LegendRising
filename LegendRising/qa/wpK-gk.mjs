// qa/wpK-gk.mjs: the goalkeeper's dives on the new keeper moves (DESIGN 2.4 WP-K acceptance, 3.5.8, QA 4.2 and 4.8).
// Owner: WP-K (Stage P2). Contracts 1.4.18 (gkmoves.js 'gkdive', 'gkready'), 1.4.14 (gkplan.js planDive, diveRoot,
// handsAt: the plan the brain and the body share), 3.5.6 (blends).
//
// 300 seeded shots on target are played on a shooting range of the real simulation (the shooter and the keeper alone,
// the full step; the same range as qa/unit/gk.mjs, which test:gk-shots will drive in the match). Each keeper dive is
// recorded as the simulation made it (its plan, the keeper's root every step, the re-read's steer, the ball) and then
// posed on a keeper body exactly as view.js will: the group where the simulation has the keeper, st = {mode: 'gkdive',
// plan, outcome, at: the dive's own time, steer}. Measured:
//   1. the keeper's root never moves faster than 6.5 m/s;
//   2. the dive never starts later than the plan: the body's take-off (EV.TAKEOFF) at the plan's load time;
//   3. the hands at the contact (the middle of each palm) within 2 cm of the plan's hand points (handsAt, steered) when
//      the plan is feasible (its reach) and the contact is at least 0.1 s after the dive's start (a reflex contact
//      sooner than that is posed as far as the arms get in the time, and counted apart);
//   4. save rates (the simulation's): accuracy-90 shots within 0.5 m of a post, above 1.5 m or below 0.5 m, saved less
//      than 35%; shots within 0.6 m of the keeper's body saved more than 80%;
//   5. the get-up takes 0.8 to 1.0 s, and the switch to gkready afterwards (blended over 0.25 s) moves no bone more
//      than 0.35 rad in a frame, and his feet are back on the grass (his ankles at their height in his ready stance).
//   Reported only: the largest bone turn in a frame anywhere in a dive (p50, p95, max).
//
//   QA_PORT=8769 node qa/wpK-gk.mjs [--n 300] [--sheets]   exits 1 on any failed check; writes qa/out/wpK-gk.json
//   (--sheets: contact sheets of a high, a mid, a low and a collapse dive from the front and the side, qa/out/wpK-gk-*.png)
import fs from "node:fs";
import path from "node:path";
import {openKit, savePng, OUT} from "./wpK-lib.mjs";
import {configFor} from "./harness.mjs";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {setCtl} from "../js/life/football/rules.js";
import {startKick} from "../js/life/football/actions.js";
import {createChain} from "../js/life/football/events.js";
import {BALL} from "../js/life/football/ball.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 300), SHEETS = process.argv.includes("--sheets");
const res = {name: "wpK-gk", n: N, checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const R = BALL.R;

/* ---------- the range (as qa/unit/gk.mjs) ---------- */
const put = (a, x, z, yaw = null) => {
  a.m.x = x; a.m.z = z; a.m.vx = 0; a.m.vz = 0; a.m.speed = 0;
  if (yaw != null){ a.m.yaw = yaw; a.m.heading = yaw; a.look.yaw = yaw; }
  a.x0 = x; a.z0 = z; a.body.x = x; a.body.z = z; a.tgt.x = x; a.tgt.z = z;
};
function range(seed = 2){
  const cfg = configFor(seed);
  cfg.meAI = false;
  const ms = createMatch(cfg);
  const me = ms.agents[ms.me], gk = ms.agents[ms.gks[1]];
  for (const a of ms.agents){ if (a.role !== 'player' || a === me || a === gk) continue; a.onPitch = false; put(a, 0, 80); }
  me.at = Object.assign({}, me.at, {accuracy: 90, power: 80, composure: 80});
  return {ms, me, gk};
}
function reset(rg, x, z, settle = 1.2){
  const {ms, me, gk} = rg;
  ms.phase = 'live'; ms.restart = null; ms.clock.running = true; ms.clock.sec = 60; ms.advantage = null; ms.pendingBook.length = 0;
  ms.offside.set.clear(); ms.offside.pending = null; ms.chain = createChain(); ms.kick = null;
  const yaw = Math.atan2(-(ms.spec.hx - x), -(0 - z));
  put(me, x + 0.65*Math.sin(yaw), z + 0.65*Math.cos(yaw), yaw);
  me.act = null; me.state = 'idle'; me.intent.dx = 0; me.intent.dz = 0; me.intent.action = null;
  const b = ms.ball;
  b.p.x = x; b.p.y = R; b.p.z = z; b.v.x = b.v.y = b.v.z = 0; if (b.w){ b.w.x = b.w.y = b.w.z = 0; } b.state = 'free'; b.grounded = true;
  put(gk, ms.spec.hx - 0.8, 0, Math.PI/2);
  gk.gk = null; gk.act = null; gk.plan = null; gk.y = 0; gk.roll = 0; gk.state = 'idle';
  setCtl(ms, me);
  for (let i = 0; i < Math.round(settle*60); i++) simStep(ms);
}
// one shot, recorded: the keeper's root every step from the kick, his dive (plan, start step, steer), the outcome
function shoot(rg, x, z, target, power){
  const {ms, me, gk} = rg;
  reset(rg, x, z);
  const n0 = ms.events.length;
  startKick(ms, me, {kind: 'shot', target, power, contact: 0});
  const rec = {steps: [], dive: null, onTarget: false, res: 'none', target, gk0: {x: gk.m.x, z: gk.m.z}};
  let out = null, n = 0, kicked = false;
  while (n++ < 60*5){
    simStep(ms);
    const g = gk.gk;
    if (!rec.dive && gk.act && gk.act.kind === 'dive' && gk.act.plan){
      const p = gk.act.plan;
      rec.dive = {step: rec.steps.length, plan: JSON.parse(JSON.stringify(p))};
    }
    rec.steps.push({x: gk.m.x, z: gk.m.z, yaw: gk.m.yaw, steer: g && g.steer ? {x: g.steer.x, y: g.steer.y, z: g.steer.z} : null, hands: g && g.hands ? g.hands.map(h => ({x: h.x, y: h.y, z: h.z})) : null,
      ball: {x: ms.ball.p.x, y: ms.ball.p.y, z: ms.ball.p.z}, state: g ? g.state : null});
    for (let i = n0; i < ms.events.length && !out; i++){
      const e = ms.events[i];
      if (e.kind === 'kick' && e.agent === me.id){ rec.onTarget = !!e.onTarget; kicked = true; }
      if (e.kind === 'save' && e.agent === gk.id) out = {res: 'saved', how: e.outcome};
      if (e.kind === 'goal' && !e.disallowed) out = {res: 'goal'};
      if (e.kind === 'out') out = {res: 'wide'};
    }
    // play on until the keeper is up again (or 4.5 s): the get-up is part of what is posed
    if (out && (!rec.dive || (g && (g.state === 'ready' || g.state === 'hold' || g.state === 'set' || g.state === 'shuffle' || g.state === 'reposition') && rec.steps.length > rec.dive.step + 30))) break;
  }
  rec.res = out ? out.res : 'none'; rec.how = out ? out.how : null; rec.kicked = kicked;
  return rec;
}

/* ---------- 1. the shots ---------- */
let seed = 0x5eed;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
const rg = range();
const recs = [], post = [], body = [];
let tries = 0;
while (recs.length < N && tries++ < N*4){
  const kind = recs.length % 3;          // 0: near a post, high or low; 1: at the body; 2: anywhere in the frame
  const x = 52.5 - (12 + 8*rnd()), z = (rnd()*2 - 1)*8;
  let target;
  if (kind === 0){ const side = rnd() < .5 ? 1 : -1, high = rnd() < .5; target = {x: 52.5, y: high ? 1.6 + .7*rnd() : .15 + .3*rnd(), z: side*(3.2 + .3*rnd())}; }
  else if (kind === 1){ target = {x: 52.5, y: .4 + 1.2*rnd(), z: (rnd()*2 - 1)*.5}; }
  else target = {x: 52.5, y: .2 + 2.0*rnd(), z: (rnd()*2 - 1)*3.2};
  const r = shoot(rg, x, z, target, .75 + .15*rnd());
  if (!r.onTarget) continue;
  r.kind = kind;
  recs.push(r);
}
// the save-rate categories, by where the shot was aimed against the keeper and the posts
const tally = list => { const s = list.filter(r => r.res === 'saved').length, g = list.filter(r => r.res === 'goal').length; return {n: list.length, saved: s, goals: g, rate: s + g ? s/(s + g) : 0}; };
for (const r of recs){
  const t = r.target, nearPost = 3.66 - Math.abs(t.z) <= .5 && (t.y > 1.5 || t.y < .5);
  if (nearPost) post.push(r);
  if (Math.abs(t.z - r.gk0.z) <= .6) body.push(r);
}
const P = tally(post), Bd = tally(body);
check(P.n >= 40 && P.rate < .35, "accuracy-90 shots within 0.5 m of a post (above 1.5 m or below 0.5 m): saved less than 35%", P);
check(Bd.n >= 40 && Bd.rate > .8, "shots within 0.6 m of the keeper's body: saved more than 80%", Bd);
const dives = recs.filter(r => r.dive && r.dive.plan.kind !== 'stand');
console.log(`shots on target ${recs.length}, dives ${dives.length}`);

/* ---------- 2. the bodies ---------- */
const K = await openKit();
try {
  const out = await K.page.evaluate(async (dives) => {
    const {H, GK, P} = K;
    const res = {jumps: [], rootMax: 0, takeoffLate: 0, handErr: [], handErrInf: [], handBall: [], getUp: [], blendJump: 0, diveJump: 0, diveJumpAt: null, feetY: 0, n: 0, errs: []};
    for (let i = 0; i < dives.length; i++){
      const r = dives[i], plan = r.dive.plan, s0 = r.dive.step;
      K.clear();
      const h = K.body("goalkeeper", 3 + (i % 7));
      const st0 = r.steps[Math.max(0, s0 - 1)];
      const place = s => { h.g.position.set(s.x, 0, s.z); h.g.rotation.y = s.yaw + Math.PI; };
      place(r.steps[Math.max(0, s0 - 20)]);
      for (let k = 0; k < 12; k++) H.animateHuman(h, 1/60, {mode: "gkready"});
      // (his ankles' height standing in his ready stance: what 'back on his feet' is measured against)
      h.g.updateMatrixWorld(true);
      const ankY = Math.max(...[H.BONE.ftL, H.BONE.ftR].map(b => h.bones[b].getWorldPosition(new K.THREE.Vector3()).y));
      for (let k = Math.max(0, s0 - 20); k < s0; k++){ place(r.steps[k]); H.animateHuman(h, 1/60, {mode: "gkready"}); }
      const TT = GK.gkDiveTimes(plan, {});
      let prevQ = K.boneQ(h), px = h.g.position.x, pz = h.g.position.z, took = null, ended = null, at = 0, maxJ = 0, jAt = null;
      const steps = Math.min(r.steps.length - s0, Math.ceil((TT.end + .1)*60));
      let measured = false;
      for (let k = 0; k < steps; k++){
        const s = r.steps[s0 + k];
        // the dive's own time runs from its start step (the simulation's diveT); split the frame at the contact
        const t1 = (k + 1)/60;
        const st = {mode: "gkdive", plan, outcome: r.res === 'saved' ? (r.how === 'catch' ? 'catch' : r.how === 'tip' ? 'tip' : 'parry') : 'miss', steer: s.steer};
        if (!measured && t1 >= plan.tc && at < plan.tc){
          const d1 = plan.tc - at;
          place(s);
          st.at = plan.tc;
          const ev0 = H.animateHuman(h, d1, st);
          if ((ev0.mask & 4) && took == null) took = ev0.t;
          // the palms against the plan's hand points at the contact (handsAt with the steer), and against the ball
          const hp = P.handsAt(plan, plan.tc, null, s.steer);
          const pl = K.M.partPoint(h, "handL"), pr = K.M.partPoint(h, "handR");
          const e = Math.max(Math.hypot(pl.x - hp[0].x, pl.y - hp[0].y, pl.z - hp[0].z), Math.hypot(pr.x - hp[1].x, pr.y - hp[1].y, pr.z - hp[1].z));
          // (feasible: the plan's own reach, and time for the hands to get there, a tenth of a second from the dive's
          // start; a reflex contact sooner than that is posed as far as the arms go in the time)
          const feas = plan.feasible && plan.tc >= .1;
          (feas ? res.handErr : res.handErrInf).push(e);
          if (!feas) res.quick = (res.quick || 0) + (plan.feasible ? 1 : 0);
          const hb = Math.min(Math.hypot(pl.x - plan.hit.x, pl.y - plan.hit.y, pl.z - plan.hit.z), Math.hypot(pr.x - plan.hit.x, pr.y - plan.hit.y, pr.z - plan.hit.z));
          if (feas) res.handBall.push(hb);
          measured = true;
          at = plan.tc;
          const st2 = Object.assign({}, st, {at: t1});
          const ev = H.animateHuman(h, t1 - plan.tc, st2);
          if (ev.mask & 4) took = took == null ? ev.t : took;
          at = t1;
          prevQ = K.boneQ(h);
        } else {
          place(s);
          st.at = t1;
          const ev = H.animateHuman(h, 1/60, st);
          if ((ev.mask & 4) && took == null) took = ev.t;
          if ((ev.mask & 64) && ended == null) ended = ev.t;
          at = t1;
          const j = K.boneJump(h, prevQ); if (j.m > maxJ){ maxJ = j.m; jAt = [+t1.toFixed(3), j.at]; }
          prevQ = K.boneQ(h);
        }
        const sp = Math.hypot(h.g.position.x - px, h.g.position.z - pz)*60; px = h.g.position.x; pz = h.g.position.z;
        if (k > 0) res.rootMax = Math.max(res.rootMax, sp);
      }
      if (took == null || took > plan.tLoad + .001) res.takeoffLate++;
      // the clip runs on past the simulation's own get-up when that is quicker: the rest of it, then gkready blended in
      let k2 = 0;
      while (ended == null && k2++ < 120){ const ev = H.animateHuman(h, 1/60, {mode: "gkdive", plan, at: (at += 1/60), outcome: "catch"}); if (ev.mask & 64) ended = ev.t; const j = K.boneJump(h, prevQ); if (j.m > maxJ){ maxJ = j.m; jAt = [+at.toFixed(3), j.at]; } prevQ = K.boneQ(h); }
      res.getUp.push(TT.up);
      if (ended != null) res.getUpMeasured = (res.getUpMeasured || []).concat([+(ended - TT.upAt).toFixed(3)]);
      let bj = 0;
      for (let k = 0; k < 24; k++){ H.animateHuman(h, 1/60, {mode: "gkready"}); const j = K.boneJump(h, prevQ); bj = Math.max(bj, j.m); prevQ = K.boneQ(h); }
      res.blendJump = Math.max(res.blendJump, bj);
      if (maxJ > res.diveJump){ res.diveJump = maxJ; res.diveJumpAt = [i, plan.kind, jAt]; }
      res.jumps.push(maxJ);
      // standing again: both soles on the grass
      h.g.updateMatrixWorld(true);
      for (const b of [H.BONE.ftL, H.BONE.ftR]){ const p = h.bones[b].getWorldPosition(new K.THREE.Vector3()); const e = Math.abs(p.y - ankY); res.feetY = Math.max(res.feetY, e); }
      res.n++;
    }
    K.clear();
    const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p*b.length))] : null; };
    return {n: res.n, rootMax: res.rootMax, takeoffLate: res.takeoffLate, handErrMax: Math.max(0, ...res.handErr), handErrP95: q(res.handErr, .95), handErrN: res.handErr.length,
      handErrInfMax: Math.max(0, ...res.handErrInf), handBallMax: Math.max(0, ...res.handBall), handBallP95: q(res.handBall, .95),
      getUpMin: Math.min(...res.getUp), getUpMax: Math.max(...res.getUp), getUpMeasured: [Math.min(...(res.getUpMeasured || [0])), Math.max(...(res.getUpMeasured || [0]))],
      blendJump: res.blendJump, diveJump: res.diveJump, diveJumpAt: res.diveJumpAt, feetY: res.feetY, quick: res.quick || 0, jumpP50: q(res.jumps, .5), jumpP95: q(res.jumps, .95)};
  }, dives);
  res.bodies = out;
  console.log(JSON.stringify(out));
  const r3 = v => Math.round(v*1000)/1000;
  check(out.n === dives.length && out.n > 100, "every recorded dive posed", {dives: dives.length, posed: out.n});
  check(out.rootMax <= 6.5, "the keeper's root never moves faster than 6.5 m/s", r3(out.rootMax));
  check(out.takeoffLate === 0, "the dive never starts later than the plan (EV.TAKEOFF at the plan's load)", {late: out.takeoffLate});
  check(out.handErrN > 0 && out.handErrMax < .02, "hand-to-plan error at the contact under 2 cm when feasible", {max_m: r3(out.handErrMax), p95: r3(out.handErrP95), n: out.handErrN});
  check(out.getUpMin >= .8 && out.getUpMax <= 1.0 && out.getUpMeasured[0] >= .8 - 1/60 && out.getUpMeasured[1] <= 1.0 + 1/60, "the get-up takes 0.8 to 1.0 s", {planned: [out.getUpMin, out.getUpMax], measured: out.getUpMeasured});
  check(out.blendJump <= .35, "into gkready over 0.25 s after the get-up: no bone turns more than 0.35 rad a frame", r3(out.blendJump));
  // (not a 2.4 band for the keeper: reported, not gated. The arms may turn faster than the strike's limit before a
  // contact so the hands are on the plan's points in time; see the note in gkmoves.js)
  console.log(`info the largest bone turn in a frame anywhere in a dive: ${JSON.stringify({max: r3(out.diveJump), p50: r3(out.jumpP50), p95: r3(out.jumpP95), at: out.diveJumpAt})}`);
  res.info = {diveJump: out.diveJump, jumpP50: out.jumpP50, jumpP95: out.jumpP95, at: out.diveJumpAt, quickContacts: out.quick};
  check(out.feetY <= .03, "back on his feet: both ankles at standing height", r3(out.feetY));
  if (SHEETS){
    const urls = await K.page.evaluate(async () => {
      const {H, P} = K, list = [];
      for (const [nm, hit] of [["high", {x: 0, y: 1.95, z: -2.7, t: .72}], ["mid", {x: 0, y: .8, z: 2.5, t: .58}], ["low", {x: 0, y: .2, z: -2.8, t: .62}], ["collapse", {x: 0, y: .15, z: .9, t: .42}], ["stand", {x: 0, y: 1.1, z: .35, t: .5}]]){
        K.clear();
        const h = K.body("goalkeeper", 4);
        const plan = P.planDive({x: 0, z: 0, y: 0, yaw: -Math.PI/2, scale: h.scale, at: {dive: 60}}, hit);
        K.ball.position.set(hit.x, hit.y, hit.z);
        h.g.position.set(0, 0, 0); h.g.rotation.y = -Math.PI/2 + Math.PI;
        for (let k = 0; k < 20; k++) H.animateHuman(h, 1/60, {mode: "gkready"});
        const views = ["front", "side"].map(v => [v, K.sheet(180, 230, 10)]);
        const TT = K.GK.gkDiveTimes(plan, {}), end = TT.end + .5;
        for (let f = 0; f < Math.round(end*60); f++){
          const t = f/60;
          if (t <= TT.end){ const R0 = P.diveRoot(plan, t); h.g.position.set(R0.x, 0, R0.z); H.animateHuman(h, 1/60, {mode: "gkdive", plan, at: t, outcome: "catch"}); }
          else H.animateHuman(h, 1/60, {mode: "gkready"});
          if (f % 4 === 0) for (const [v, S] of views) S.shot(K.view(h, v, {cx: 0, cz: hit.z/2, d: 7, ty: .8}), t.toFixed(2));
        }
        for (const [v, S] of views) list.push([nm + "-" + v, S.url()]);
      }
      return list;
    });
    for (const [nm, u] of urls) savePng(u, `wpK-gk-${nm}.png`);
  }
  if (K.errors.length) check(false, "no page errors", K.errors.slice(0, 5));
} finally {
  await K.close();
}
fs.writeFileSync(path.join(OUT, "wpK-gk.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "wpK-gk: all checks pass" : "wpK-gk: FAILED");
process.exit(res.ok ? 0 : 1);
