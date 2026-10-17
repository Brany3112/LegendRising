// qa/tr9-ai.mjs: the AI across Training's team drills and full 11 v 11 matches (P9-B, TRAINING-SPEC 6 AI; BUILD-PLAN
// P9-B acceptance). Node, headless, seeded:
//   - swarming: three or more of one side's outfield players within 3 m of a playable loose ball (on the ground, below
//     1 m, at 6 m/s or less) in open play (not the 3 s after a set piece, whose plan crowds the box), per 50k loose-ball
//     team-steps, at or below the P1 baseline (101: plan/notes/ai.md, swarm probe); the unfiltered count (any loose
//     ball) is reported beside it;
//   - obvious idling: a free ball on the grass within 5 m of an outfield player, slow enough to be played, and nobody
//     going to it (moving toward it, or at it) for more than 1 s: none;
//   - the share of the computer's shots from beyond 25 m in its band;
//   - pass completion in the bands of the passer's passing (low, middle, high), rising with it;
//   - the keeper's save percentage in its band for each kind of shot on target (close, middle, long, headers);
//   - keeper distribution (ATTR-1, GK-3), 200 seeded distributions each at distrib 30 and 90, all else equal: the
//     mean landing error from where he meant it at least 1.5 times larger at 30; completion higher at 90; the choice
//     as gkbrain.js's header documents it (a weak distributor kicks long less often to a far target, throws less); the
//     throws and rolls are acts (gkthrow, gkroll) holding the ball to their tRelease.
//
//   node qa/tr9-ai.mjs [--matches 16] [--dist 200] [--seeds 2]     exits 1 on any failed check; writes qa/out/tr9-ai.json
import {createMatch, simStep} from "../js/life/football/sim.js";
import {clearCtl} from "../js/life/football/rules.js";
import {gkCollect} from "../js/life/football/gkbrain.js";
import {configFor} from "./harness.mjs";
import {checker} from "./wpF-lib.mjs";
import {allDrills, playGo} from "./tr6-teamlib.mjs";

const {check, done} = checker("tr9-ai");
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : +argv[i + 1]; };
const MATCHES = arg("matches", 16), NDIST = arg("dist", 200), SEEDS = arg("seeds", 2);
const H = 1/60;
const hyp = (x, z) => Math.sqrt(x*x + z*z);
const r3 = v => Math.round(v*1000)/1000;

/* ---------- the bands ---------- */
export const AI_BANDS = Object.freeze({
  swarm: 101,                                   // per 50k loose-ball team-steps (P1 baseline)
  idle: 0,
  // share of the computer's shots from beyond 25 m (the player's stand-in, meAI, shoots as the player does and is left
  // out): long shots as real football has them, plus the game's own shooting zone square on up to 28 m (U9, brain.js SIGHT)
  longShots: [0.05, 0.35],
  pass: {low:[0.62, 0.86], mid:[0.70, 0.90], high:[0.76, 0.94]},   // completion by the passer's passing: < 60, 60 to 74, 75 and up
  // the keeper's save rate on target: < 12 m, 12 to 20, beyond 20, headers (real football's close-range rate is about a
  // quarter to two fifths; a band of the run's few tens of close shots has to allow its own error, about 0.08)
  saves: {close:[0.20, 0.65], mid:[0.50, 0.88], long:[0.70, 0.99], header:[0.40, 0.92]}
});

/* ---------- the per-step monitors ---------- */
function monitor(){
  return {loose:0, swarm:0, idleEp:0, idleT:new Float64Array(2), idleAt:[], steps:0};
}
function watchStep(ms, M){
  M.steps++;
  if (ms.phase !== "live") { M.idleT[0] = 0; return; }
  const b = ms.ball;
  const loose = ms.poss.ctl < 0 && b.state === "free";
  if (ms.restart) M.restartT = ms.t;
  // per loose-ball team-step (P1's denominator): a crowd of three of one side within 3 m. Counted (swarm) only round a
  // ball that can be played, on the ground (below 1 m) at 6 m/s or less, in open play: a cross passing over heads, a
  // ball running through a group (a pass, a deflection), and the 3 s after a set piece into a box its plan crowds are
  // not swarming. Every crowd is also counted unfiltered (anySwarm), and reported beside it
  if (loose){
    const playable = b.p.y < 1.0 && hyp(b.v.x, b.v.z) <= 6 && !(M.restartT != null && ms.t - M.restartT < 3);
    for (const team of [0, 1]){
      M.loose++;
      let n = 0;
      for (const a of ms.agents) if (a.team === team && a.onPitch && a.role === "player" && !a.isGK && hyp(a.m.x - b.p.x, a.m.z - b.p.z) < 3) n++;
      if (n >= 3){ M.anySwarm = (M.anySwarm || 0) + 1; if (playable) M.swarm++; }
    }
  }
  // obvious idle: a free ball on the grass, slow enough to play, someone within 5 m, nobody going to it
  const sp = hyp(b.v.x, b.v.z);
  let near = false, going = false;
  if (loose && b.p.y < 0.5 && sp < 4 && Math.abs(b.p.x) < ms.spec.hx && Math.abs(b.p.z) < ms.spec.hz){
    for (const a of ms.agents){
      if (!a.onPitch || a.role !== "player" || a.isGK || a.leaving) continue;
      const dx = b.p.x - a.m.x, dz = b.p.z - a.m.z, d = hyp(dx, dz);
      if (d < 5) near = true;
      if (d < 0.8 || d < 30 && (a.m.vx*dx + a.m.vz*dz)/(d || 1) > 0.5 || a.plan && (a.plan.kind === "chase" || a.plan.kind === "intercept" || a.plan.kind === "receive")) going = true;
    }
  }
  if (near && !going){
    M.idleT[0] += H;
    if (M.idleT[0] > 1 && !M.idleT[1]){ M.idleEp++; M.idleT[1] = 1; if (M.idleAt.length < 5) M.idleAt.push({t:r3(ms.t), x:r3(b.p.x), z:r3(b.p.z)}); }
  } else { M.idleT[0] = 0; M.idleT[1] = 0; }
}
// what a finished game says: its shots (distance, kind, result) and passes (the passer's passing, the result)
function harvest(ms, S){
  for (const e of ms.events){
    if (e.kind !== "kick" || e.agent < 0) continue;
    const a = ms.agents[e.agent]; if (!a) continue;
    // (in the team's own frame: the ends change at half time)
    const d = e.u != null ? hyp(ms.spec.L - e.u, e.z) : hyp(ms.dirs[e.team]*ms.spec.hx - e.x, e.z);
    if (e.intent === "shot" || e.intent === "header" && e.atGoal){
      if (!a.isMe){ S.shots++; if (d > 25) S.long++; }
      if (e.res === "goal" || e.res === "saved"){
        const k = e.intent === "header" ? "header" : d < 12 ? "close" : d <= 20 ? "mid" : "long";
        S.sv[k][1]++; if (e.res === "saved") S.sv[k][0]++;
      }
    } else if (["pass", "through", "lob", "cross"].includes(e.intent) && !a.isGK && e.res){
      const p = a.at.passing, k = p < 60 ? "low" : p < 75 ? "mid" : "high";
      S.pass[k][1]++; if (e.res === "ok") S.pass[k][0]++;
    }
  }
}
const newStats = () => ({shots:0, long:0, sv:{close:[0, 0], mid:[0, 0], long:[0, 0], header:[0, 0]}, pass:{low:[0, 0], mid:[0, 0], high:[0, 0]}});

/* ---------- 1. full matches ---------- */
const M11 = monitor(), S11 = newStats();
const t0 = Date.now();
for (let i = 0; i < MATCHES; i++){
  const ms = createMatch(configFor(1 + i));
  let n = 0;
  while (ms.phase !== "over" && n < 200000){ simStep(ms); watchStep(ms, M11); n++; }
  harvest(ms, S11);
}
const per50k = M => M.loose ? r3(M.swarm*50000/M.loose) : 0;
const share = ([a, b]) => b ? r3(a/b) : null;
const out = {matches:MATCHES, sec:Math.round((Date.now() - t0)/1000), swarm:per50k(M11), loose:M11.loose, swarmAny:M11.loose ? r3((M11.anySwarm || 0)*50000/M11.loose) : 0, idle:M11.idleEp, idleAt:M11.idleAt,
  longShots:share([S11.long, S11.shots]), shots:S11.shots, pass:Object.fromEntries(Object.entries(S11.pass).map(([k, v]) => [k, {rate:share(v), n:v[1]}])),
  saves:Object.fromEntries(Object.entries(S11.sv).map(([k, v]) => [k, {rate:share(v), n:v[1]}]))};
check(out.swarm <= AI_BANDS.swarm, `11 v 11: swarming at or below the baseline (${AI_BANDS.swarm} per 50k loose-ball team-steps)`, {swarm:out.swarm, loose:out.loose, unfiltered:out.swarmAny, matches:MATCHES});
check(out.idle === AI_BANDS.idle, "11 v 11: no obvious idling (a playable free ball within 5 m and nobody going to it for over 1 s)", {episodes:out.idle, at:out.idleAt});
check(out.longShots >= AI_BANDS.longShots[0] && out.longShots <= AI_BANDS.longShots[1], `11 v 11: the share of shots from beyond 25 m in [${AI_BANDS.longShots}]`, {share:out.longShots, shots:out.shots});
const passOk = Object.entries(AI_BANDS.pass).every(([k, b]) => out.pass[k].rate != null && out.pass[k].rate >= b[0] && out.pass[k].rate <= b[1]) && out.pass.high.rate > out.pass.low.rate;
check(passOk, "11 v 11: pass completion in the bands of the passer's passing, higher for the better passers", out.pass);
const saveOk = Object.entries(AI_BANDS.saves).every(([k, b]) => out.saves[k].n < 10 || out.saves[k].rate >= b[0] && out.saves[k].rate <= b[1]);
check(saveOk, "11 v 11: the keeper's save percentage in its band for each kind of shot on target", out.saves);

/* ---------- 2. Training's team drills ---------- */
{
  const M = monitor(), S = newStats();
  let goes = 0;
  for (const d of allDrills()){
    for (let seed = 1; seed <= SEEDS; seed++){
      const r = playGo(d, seed, {meAI:true, onStep:ms => watchStep(ms, M)});
      harvest(r.ms, S); goes++;
    }
  }
  const tr = {goes, swarm:per50k(M), loose:M.loose, idle:M.idleEp, idleAt:M.idleAt};
  out.training = tr;
  check(tr.swarm <= AI_BANDS.swarm, `Training's team drills (${goes} goes): swarming at or below the baseline`, tr);
  check(tr.idle === 0, "Training's team drills: no obvious idling", {episodes:tr.idle, at:tr.idleAt});
}

/* ---------- 3. keeper distribution: distrib 30 against 90 ---------- */
// a match a few seconds in, the ball put in team 0's keeper's hands (gkbrain.js gkCollect: his hold, then his
// distribution), played on until what he did is decided
function distOne(seed, distrib){
  const cfg = configFor(5000 + seed);
  const gkP = cfg.teams[0].players.find(p => p.isGK);
  gkP.at = Object.assign({}, gkP.at, {gk:Object.assign({}, gkP.at.gk, {distrib})});
  const ms = createMatch(cfg);
  while (ms.t < 6 && ms.phase !== "over") simStep(ms);
  const gk = ms.agents.find(a => a.team === 0 && a.isGK && a.onPitch);
  clearCtl(ms); ms.restart = null; ms.phase = "live";
  for (const a of ms.agents){ a.set = null; a.wall = false; if (a.act && a.act.kind === "kick") a.act = null; a.pendKick = null; a.drib = null; }
  const b = ms.ball;
  b.p.x = gk.m.x + ms.dirs[0]*0.4; b.p.y = 1.0; b.p.z = gk.m.z; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
  gkCollect(ms, gk);
  // (his own hold, 2 to 5 s: his team spreads for him in it)
  const R = {kind:null, aim:null, land:null, err:null, ok:null, act:null, held:true, heldUntil:null, len:null};
  let ev = null, closest = Infinity;
  for (let n = 0; n < 60*14 && ms.phase !== "over"; n++){
    simStep(ms);
    const act = gk.act;
    if (act && (act.kind === "gkthrow" || act.kind === "gkroll") && !R.act){ R.act = {kind:act.kind, tRelease:act.tRelease, target:act.target}; }
    if (R.act && !ev && act && act.kind === R.act.kind && !act.done){
      // the ball in his hands until the release
      if (!(b.state === "held" && b.holder === gk.id)) R.held = false;
    }
    if (!ev){
      ev = ms.events.slice(-4).find(e => e.kind === "kick" && e.agent === gk.id) || null;
      if (ev){ R.kind = ev.intent; R.aim = gk.gk.distAim ? {x:gk.gk.distAim.x, z:gk.gk.distAim.z} : null; R.len = gk.gk.distAim ? hyp(gk.gk.distAim.x - gk.m.x, gk.gk.distAim.z - gk.m.z) : null;
        if (R.act) R.heldUntil = r3(ms.t); }
      continue;
    }
    // where it came down (a throw, a punt: its first bounce, or where it was first met, a header or a touch before it
    // landed), or how near it rolled to where he meant it (until someone played it)
    if (R.aim){
      const met = !R.met && ms.events.some((e, i) => i > ev.id && e.agent >= 0 && e.agent !== gk.id && (e.kind === "kick" || e.kind === "touch" || e.kind === "header"));
      if (met) R.met = true;
      if (R.kind === "roll"){ if (!R.met || met){ const d = hyp(b.p.x - R.aim.x, b.p.z - R.aim.z); if (d < closest) closest = d; } }
      else if (!R.land && (met || b.p.y <= 0.14 && b.v.y <= 0 && ms.t - ev.t > 0.2)) R.land = {x:b.p.x, z:b.p.z};
    }
    if (ev.res && (R.kind === "roll" ? ms.t - ev.t > 2.5 : R.land)) break;
  }
  if (R.aim) R.err = R.kind === "roll" ? closest : R.land ? hyp(R.land.x - R.aim.x, R.land.z - R.aim.z) : null;
  R.ok = ev ? ev.res === "ok" : null;
  return R;
}
{
  const runs = {30:[], 90:[]};
  for (let s = 1; s <= NDIST; s++) for (const D of [30, 90]) runs[D].push(distOne(s, D));
  const sum = D => {
    const L = runs[D], errs = L.filter(r => r.err != null).map(r => r.err), kinds = {};
    for (const r of L) if (r.kind) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    const punts = L.filter(r => r.kind === "punt" && r.len != null);
    return {n:L.length, decided:L.filter(r => r.kind).length, meanErr:errs.length ? r3(errs.reduce((a, v) => a + v, 0)/errs.length) : null, nErr:errs.length,
      completion:r3(L.filter(r => r.ok).length/Math.max(1, L.filter(r => r.ok != null).length)), kinds,
      puntLen:punts.length ? r3(punts.reduce((a, r) => a + r.len, 0)/punts.length) : null,
      acts:L.filter(r => r.act).length, heldOk:L.filter(r => r.act && r.held).length};
  };
  const lo = sum(30), hi = sum(90);
  out.distribution = {d30:lo, d90:hi};
  check(lo.decided >= NDIST*0.95 && hi.decided >= NDIST*0.95, `keeper distribution: ${NDIST} seeded distributions each at distrib 30 and 90 are played`, {d30:lo.decided, d90:hi.decided});
  check(lo.meanErr != null && hi.meanErr != null && lo.meanErr >= 1.5*hi.meanErr, "the mean landing error from where he meant it is at least 1.5 times larger at distrib 30", {d30:lo.meanErr, d90:hi.meanErr, ratio:hi.meanErr ? r3(lo.meanErr/hi.meanErr) : null});
  check(hi.completion > lo.completion, "completion to a team-mate is higher at distrib 90", {d30:lo.completion, d90:hi.completion});
  const throwShare = s => ((s.kinds.throw || 0) + (s.kinds.roll || 0))/Math.max(1, s.decided);
  check(lo.puntLen != null && hi.puntLen != null && lo.puntLen < hi.puntLen && throwShare(lo) <= throwShare(hi),
    "the choice changes with distrib as gkbrain.js documents: a weak distributor kicks shorter (less often to a far target) and throws and rolls no more often", {puntLen:[lo.puntLen, hi.puntLen], throwShare:[r3(throwShare(lo)), r3(throwShare(hi))], kinds:[lo.kinds, hi.kinds]});
  const acts = lo.acts + hi.acts, held = lo.heldOk + hi.heldOk;
  check(acts >= 10 && held === acts, "throws and rolls are acts (gkthrow, gkroll) and the ball stays in his hands until their tRelease", {acts, held});
}

import("node:fs").then(fs => { try { fs.mkdirSync("qa/out", {recursive:true}); fs.writeFileSync("qa/out/tr9-ai.json", JSON.stringify(out, null, 1)); } catch(e){ /* the report is optional */ } });
console.log(JSON.stringify(out).slice(0, 1500));
process.exit(done() ? 0 : 1);
