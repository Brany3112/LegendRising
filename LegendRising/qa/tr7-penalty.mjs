// qa/tr7-penalty.mjs: penalties in Training Mode. Node part: the setup and the go on the simulation the runner plays it on
// (seeded); browser part (qa/tr7-browser.mjs): retry restoring the setup (the runner's digest) and the preset round trip.
// Owner: P7-B (Training Mode Phase 7). Contract: BUILD-PLAN P7-B acceptance "qa/tr7-penalty.mjs"; TRAINING-SPEC 5 (Penalties).
//
// What the checks measure:
//   - "the keeper's attributes change the save rate": the same penalties (the computer's taker, SAVE_SEEDS seeds) against
//     a keeper of 20 and of 99 in every keeping attribute: the good one saves at least SAVE_GAP more;
//   - "rebounds stay live": a save that is not held (a parry, a tip) leaves the ball in play, never a whistle at the
//     save: it either flies on out or in by itself, or play stays live at least LIVE_T s and somebody plays it again;
//     and at least two such rebounds are played again;
//   - "the empty goal works": with the keeper off there is no keeper on the pitch, the restart says so (opt.noKeeper),
//     and nothing stops a penalty: every go is a goal, a miss (out) or off the woodwork, never a save.
//
//   node qa/tr7-penalty.mjs [--seeds 12] [--node]     exits 1 on any failed check; writes qa/out/tr7-penalty.json
import {checker} from "./wpF-lib.mjs";
import {cfgOf, playSet} from "./tr7-lib.mjs";
import {typeOf} from "../js/life/train/config.js";

const {check, done} = checker("tr7-penalty");
const argv = process.argv.slice(2), si = argv.indexOf("--seeds");
const SEEDS = si >= 0 ? +argv[si + 1] : 12;
const SAVE_SEEDS = 60, SAVE_GAP = 5, LIVE_T = 0.3;
const ROLES = ["taker", "attacker", "defender"];
const r2 = v => Math.round(v*100)/100;

check(JSON.stringify(typeOf("penalty").roles) === JSON.stringify(ROLES), "the penalty type offers I take it, a team-mate takes it (I follow in), they take it (I defend)", typeOf("penalty").roles);

// my own penalty, as the controls make it: a placed shot low into a corner (the side by the seed), once it is mine
const shotBot = (ms, me) => {
  const R0 = ms.restart;
  if (!R0 || R0.taken || R0.taker !== me.id || !R0.ready || me.act || me.intent.action) return;
  const gx = ms.dirs[R0.team]*ms.spec.hx, side = ms.seed % 2 ? 1 : -1;
  me.intent.action = {kind:"shot", target:{x:gx, y:0.45, z:side*2.7}, power:0.85, contact:0, pen:true};
};

/* ---------- 1. every role, every seed ---------- */
{
  const bad = [], tally = {};
  for (const role of ROLES) for (let seed = 1; seed <= SEEDS; seed++){
    const r = playSet("penalty", cfgOf("penalty", {role}), seed, {meAI:role !== "taker", bot:shotBot});
    const tk = r.J.tkId >= 0 ? r.ms.agents[r.J.tkId] : null;
    const takerOk = role === "taker" ? tk && tk.isMe : tk && !tk.isMe;
    if (!r.v || !r.J.taken || !takerOk) bad.push({role, seed, v:r.v && r.v.why, taken:r.J.taken, takerOk});
    const k = role + ":" + (r.v ? r.v.why : "none"); tally[k] = (tally[k] || 0) + 1;
  }
  check(!bad.length, `every role (${ROLES.join(", ")}) x ${SEEDS} seeds: the right man takes it (me, or the computer's), it is taken and the go is decided`, {bad:bad.slice(0, 5), tally});
}

/* ---------- 2. the empty goal ---------- */
{
  const bad = [];
  let goals = 0, n = 0;
  for (let seed = 1; seed <= SEEDS; seed++){
    let r0 = null;
    const r = playSet("penalty", cfgOf("penalty", {role:"attacker", keeper:false}), seed, {onStep:ms => { if (!r0 && ms.restart) r0 = {noKeeper:ms.restart.noKeeper}; }});
    const gks = r.ms.agents.filter(a => a.isGK && a.onPitch);
    if (gks.length || !r0 || !r0.noKeeper) bad.push({seed, gks:gks.length, r0});
    n++; if (r.v && r.v.goal) goals++;
    const wood = r.ms.events.some(e => e.kind === "woodwork");
    if (!r.v || r.J.saved || !(r.v.goal || r.J.out || wood)) bad.push({seed, why:r.v && r.v.why, saved:r.J.saved});
  }
  check(!bad.length && goals >= n/2, "the empty goal: no keeper on the pitch, the restart says so, and every penalty is a goal, a miss or off the woodwork, never a save", {bad, goals, n});
}

/* ---------- 3. the keeper's attributes change the save rate; 4. rebounds stay live ---------- */
{
  const rate = {}, live = {parries:0, ok:0, played:0, bad:[]};
  for (const lvl of [20, 99]){
    const gk = {reflex:lvl, dive:lvl, handling:lvl, posit:lvl, distrib:50};
    let saves = 0;
    for (let seed = 1; seed <= SAVE_SEEDS; seed++){
      let saveT = null, liveT = 0, after = null;
      const r = playSet("penalty", cfgOf("penalty", {role:"attacker", gk, attAvg:60, opts:{time:6}}), seed, {onStep:(ms, J) => {
        if (saveT == null && J.saved && !J.held) saveT = ms.t;
        if (saveT != null && ms.phase === "live") liveT += 1/60;
        if (saveT != null && !after && ms.events.some(e => e.t > saveT + 1e-6 && (e.kind === "touch" || e.kind === "kick" || e.kind === "goal" || e.kind === "out"))) after = true;
      }});
      if (r.J.saved) saves++;
      if (saveT != null){
        live.parries++;
        const byItself = (r.J.out || r.J.goal != null) && liveT < LIVE_T, played = liveT >= LIVE_T && !!after;
        if (byItself || played) live.ok++; else live.bad.push({lvl, seed, liveT:r2(liveT), why:r.v && r.v.why});
        if (played) live.played++;
      }
    }
    rate[lvl] = saves;
  }
  check(rate[99] >= rate[20] + SAVE_GAP, `the keeper's attributes change the save rate: ${SAVE_SEEDS} penalties each, a keeper of 99 saves at least ${SAVE_GAP} more than one of 20`, rate);
  check(live.played >= 2 && live.ok === live.parries, `rebounds stay live: after a save he does not hold there is no whistle: the ball flies out or in by itself, or play goes on (at least ${LIVE_T} s) and it is played again`, live);
}

/* ---------- 5. the same setup and seed play the same penalty (what a retry restores) ---------- */
{
  const a = playSet("penalty", cfgOf("penalty", {role:"attacker"}), 7), b = playSet("penalty", cfgOf("penalty", {role:"attacker"}), 7);
  const sig = r => JSON.stringify(r.ms.events.map(e => [e.kind, e.agent, r2(e.t)]));
  check(sig(a) === sig(b), "the same setup and seed play the same penalty, event for event", a.ms.events.length);
}

let ok = done();
if (!argv.includes("--node")){
  const {browserPart} = await import("./tr7-browser.mjs");
  ok = (await browserPart("penalty")) && ok;
}
process.exit(ok ? 0 : 1);
