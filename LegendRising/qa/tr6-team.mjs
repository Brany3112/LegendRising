// qa/tr6-team.mjs: the team scenarios in the simulation (Node, seeded): every Attacking, Defending and Match drill x 10
// seeds on the simulation the runner plays it on, the objectives, TAC-1 and OFF-3, and the player asking for the ball.
// Owner: P6-B (Training Mode Phase 6). Contract: BUILD-PLAN P6-B acceptance "qa/tr6-team.mjs"; TRAINING-SPEC 2 (offside
// respected by scenario generation and the AI's passing; no impossible passes) and 5 (Attacking, Defending, Match).
//
//   node qa/tr6-team.mjs [--seeds 10]           exits 1 on any failed check; writes qa/out/tr6-team.json
//
// What "planned" and "a chaser" mean here (BUILD-PLAN gives the checks, not the measures):
//   - a chaser is a man of a side with a plan to get to a loose ball (chase, intercept, receive or a header) who has not
//     yet left the ground for it: a man already in the air for a header is committed, and his team-mate going for
//     where it drops is the one chaser;
//   - three or more of one side within 3 m of the ball is "planned" in a drill that is about it (drill.crowd, none
//     today), and otherwise passes when it lasts no more than CROWD_T s (a tackle, a scramble for a loose ball).
import {cagePitch, goalsLawOf} from "../js/life/football/cagespec.js";
import {simStep} from "../js/life/football/sim.js";
import {goalCounts, offsidePosition, lawOf, RULES, setCtl, liveRoll} from "../js/life/football/rules.js";
import {teamShape, depthOf, TAC} from "../js/life/football/tactics.js";
import {callFor, passModel, decideOffBall, BRAIN} from "../js/life/football/brain.js";
import {refreshPred, steer} from "../js/life/football/actions.js";
import {passSpeedFor} from "../js/life/football/actions.js";
import {checker} from "./wpF-lib.mjs";
import {H, allDrills, drillConfig, buildTeam, matchOf, goState, runsStep, judgeStep, setupOf, playGo} from "./tr6-teamlib.mjs";
import {OBJECTIVES, JUDGE, holderTeam, drill} from "../js/life/train/scen-team.js";
import {validate, typeOf} from "../js/life/train/config.js";

const {check, done} = checker("tr6-team");
const argv = process.argv.slice(2), ai = argv.indexOf("--seeds");
const SEEDS = ai >= 0 ? +argv[ai + 1] : 10;
const CROWD_T = 1.5;
const r2 = v => Math.round(v*100)/100;

/* ---------- 0. every drill is there and set up as its category says ---------- */
const drills = allDrills();
const byType = t => drills.filter(d => d.type === t);
check(byType("attacking").length >= 11 && byType("defending").length >= 9 && byType("scenarios").length >= 26,
  "every drill of TRAINING-SPEC 5 is registered (Attacking 11, Defending 9, Match 26)", {attacking:byType("attacking").length, defending:byType("defending").length, scenarios:byType("scenarios").length});
{
  const bad = [];
  for (const d of drills){
    const c = drillConfig(d), v = validate(d.type, c);
    if (JSON.stringify(c) !== JSON.stringify(v) || c.opts.drill !== d.id || c.opts.objective !== d.objective) bad.push(d.id);
    const S = typeOf(d.type);
    for (const k of ["drill", "objective", "time", "lineD", "replay"]) if (!S.options[k]) bad.push(d.id + ":" + k);
  }
  check(!bad.length, "each drill's configuration is a valid configuration of its type, naming its drill and objective", bad);
}

/* ---------- 1. every drill x SEEDS: the AI in play ---------- */
const S = {goes:0, noGoalShots:[], chasers:[], crowd:[], passes:0, offPasses:[], offStarts:[], badTargets:[], nan:[], verdicts:{}, goalChecks:0, goalBad:[],
  meDecisions:0, meMissing:0};
for (const d of drills){
  for (let seed = 1; seed <= SEEDS; seed++){
    // offside played in every go of this sweep (a Match drill plays it already; for the others it is switched on)
    const over = c => { c.offside = true; };
    const {setup, spec} = setupOf(d, seed, over);
    // no attacker starts offside at activation (teams.js moves him back onto the line)
    {
      const {ms} = matchOf(setup, spec, "train");
      for (const a of ms.agents){
        if (a.team !== 0 || !a.onPitch || a.role !== "player" || a.isGK) continue;
        const p = offsidePosition(ms, a, 0);
        if (p.off) S.offStarts.push({d:d.id, seed, id:a.id, margin:r2(p.margin)});
      }
    }
    const fence = spec.cage ? spec.cage.fence : {hx:spec.hx + 3, hz:spec.hz + 3};
    const outside = t => !t || !Number.isFinite(t.x) || !Number.isFinite(t.z) || Math.abs(t.x) > fence.hx + 1e-6 || Math.abs(t.z) > fence.hz + 1e-6;
    let crowdRun = 0, crowdMax = 0, seen = 0;
    const r = playGo(d, seed, {meAI:true, over, max:40,
      onDecide:(a, opts, ch) => {
        if (ch && ch.target && outside(ch.target)) S.badTargets.push({d:d.id, seed, kind:ch.kind, t:ch.target});
      },
      onStep:(ms) => {
        const b = ms.ball;
        if (!Number.isFinite(b.p.x + b.p.y + b.p.z)) S.nan.push({d:d.id, seed, t:r2(ms.t)});
        // chasers of a loose ball
        if (ms.poss.ctl < 0 && b.state === "free"){
          for (const team of [0, 1]){
            const n = ms.agents.filter(a => a.team === team && a.plan && ["chase", "intercept", "receive", "header"].includes(a.plan.kind) && !(a.act && a.act.kind === "header")).length;
            if (n > 1) S.chasers.push({d:d.id, seed, t:r2(ms.t), team, n});
          }
        }
        // three or more of a side close to the ball
        let c3 = false;
        for (const team of [0, 1]){
          let n = 0;
          for (const a of ms.agents) if (a.team === team && a.onPitch && a.role === "player" && Math.hypot(a.m.x - b.p.x, a.m.z - b.p.z) < 3) n++;
          if (n >= 3) c3 = true;
        }
        crowdRun = c3 ? crowdRun + H : 0; crowdMax = Math.max(crowdMax, crowdRun);
        // first-time strikes and headers planned: their targets inside the cage
        for (const a of ms.agents){
          if (a.plan && a.plan.first && a.plan.first.target && outside(a.plan.first.target)) S.badTargets.push({d:d.id, seed, kind:"first:" + a.plan.first.kind, t:a.plan.first.target});
          if (a.plan && a.plan.hdr && a.plan.hdr.target && outside(a.plan.hdr.target)) S.badTargets.push({d:d.id, seed, kind:"header", t:a.plan.hdr.target});
        }
        // the kicks of this step
        const E = ms.events;
        for (let i = seen; i < E.length; i++){
          const e = E[i];
          if (e.kind !== "kick" || e.agent < 0) continue;
          const k = ms.agents[e.agent];
          // no shot (nor cross, nor header at goal) toward an end where no goal counts
          if ((e.intent === "shot" || e.intent === "cross" || e.intent === "header" && e.atGoal) && !goalCounts(ms, ms.dirs[k.team])) S.noGoalShots.push({d:d.id, seed, intent:e.intent, team:k.team});
          // a pass to a team-mate: never to one offside at the contact (the law's own snapshot, rules.js onKick)
          if ((e.intent === "pass" || e.intent === "through" || e.intent === "lob") && e.recv >= 0 && ms.agents[e.recv].team === k.team){
            S.passes++;
            const m = ms.offside.set.get(e.recv);
            if (lawOf(ms, "offside") && m != null && m > RULES.OFF.eps) S.offPasses.push({d:d.id, seed, intent:e.intent, margin:r2(m)});
          }
        }
        seen = E.length;
      }});
    S.goes++;
    if (crowdMax > CROWD_T && !d.crowd) S.crowd.push({d:d.id, seed, s:r2(crowdMax)});
    const v = r.verdict, why = v ? v.why : "none";
    S.verdicts[why] = (S.verdicts[why] || 0) + 1;
    // the verdicts agree with what happened
    const goals = r.ms.events.filter(e => e.kind === "goal" && !e.disallowed);
    const my = r.setup.myTeam;
    if (v){
      S.goalChecks++;
      if (v.why === "goal" && !goals.some(e => e.team === my)) S.goalBad.push({d:d.id, seed, why:v.why});
      if (v.why === "conceded" && !goals.some(e => e.team !== my)) S.goalBad.push({d:d.id, seed, why:v.why});
      if (v.why === "lost" && holderTeam(r.ms) !== 1 - my) S.goalBad.push({d:d.id, seed, why:v.why, holder:holderTeam(r.ms)});
      if ((v.why === "kept" || v.why === "clean" || v.why === "time") && Math.abs(v.t - r.setup.plan.time) > 0.05) S.goalBad.push({d:d.id, seed, why:v.why, t:v.t});
    }
  }
}
console.log(`  (${S.goes} goes; verdicts ${JSON.stringify(S.verdicts)}; ${S.passes} passes)`);
check(S.goes === drills.length*SEEDS && !S.nan.length, `every drill x ${SEEDS} seeds played through, no NaN`, {goes:S.goes, nan:S.nan.slice(0, 5)});
check(!S.noGoalShots.length, "no shot, cross or header at goal toward an end with no goal that counts", S.noGoalShots.slice(0, 8));
check(!S.chasers.length, "at most 1 chaser per team for a loose ball (a man already in the air for a header excepted)", {n:S.chasers.length, first:S.chasers.slice(0, 5)});
check(!S.crowd.length, `three or more of one side within 3 m of the ball never for more than ${CROWD_T} s unless the drill plans it`, S.crowd.slice(0, 8));
check(S.passes >= 100 && !S.offPasses.length, "with offside played, no pass to a receiver offside when it is struck", {passes:S.passes, offside:S.offPasses.slice(0, 8)});
check(!S.offStarts.length, "with offside played, no attacker starts offside at activation", S.offStarts.slice(0, 8));
check(!S.badTargets.length, "no kick, first-time strike or header aimed outside the cage", S.badTargets.slice(0, 8));
check(S.goalChecks > 0 && !S.goalBad.length, "every verdict agrees with the play (a goal for a goal, a loss with the ball theirs, a time verdict at the time)", {checked:S.goalChecks, bad:S.goalBad.slice(0, 8)});
// (AI-4) small games are not shot-happy any more: the share of goes of the attacking drills ending in a shot
{
  let goes = 0, withShot = 0;
  for (const d of byType("attacking").concat(byType("scenarios")).filter(d => d.objective === "score")) for (let seed = 1; seed <= 3; seed++){
    const r = playGo(d, seed, {meAI:true}); goes++;
    if (r.ms.events.some(e => e.kind === "kick" && e.intent === "shot" && e.agent >= 0 && r.ms.agents[e.agent].team === r.setup.myTeam)) withShot++;
  }
  check(withShot < goes*0.9, `AI-4: not every attacking go ends in a shot (${withShot} of ${goes})`, {goes, withShot});
}
// (AI-3) an objective with no goal in it (keep the ball): nobody shoots
{
  let shots = 0, goes = 0;
  for (const d of drills.filter(d => d.objective === "keep" || d.objective === "line")) for (let seed = 1; seed <= SEEDS; seed++){
    const r = playGo(d, seed, {meAI:true}); goes++;
    shots += r.ms.events.filter(e => e.kind === "kick" && (e.intent === "shot" || e.intent === "cross") && e.agent >= 0).length;
  }
  check(goes > 0 && shots === 0, "AI-3: with an objective that has no goal in it (keep it, get to the line) nobody shoots or crosses", {goes, shots});
}

/* ---------- 2. the objectives, on states made by hand ---------- */
{
  const fake = (o = {}) => Object.assign({t:0, events:[], ball:{state:"free", holder:-1, p:{x:0, y:0.11, z:0}}, poss:{ctl:-1, team:-1}, restart:null,
    agents:[{id:0, team:0, m:{x:0, z:0}}, {id:1, team:1, m:{x:5, z:0}}], dirs:[1, -1], spec:{hx:26.25}}, o);
  const run = (objective, time, script, lineD = 6, my = 0) => {
    const ms = fake(), J = goState(ms), plan = {objective, time, lineD};
    let v = null;
    for (let k = 0; k < 60*(time + 10) && !v; k++){ ms.t += H; script(ms, ms.t); v = judgeStep(J, ms, plan, my, H); }
    return v ? v.why : "none";
  };
  const own = (ms, team) => { ms.poss.ctl = team; ms.poss.team = team; };
  const loose = ms => { ms.poss.ctl = -1; ms.poss.team = -1; };
  const goal = (ms, team) => { ms.events.push({kind:"goal", team, t:ms.t}); };
  const cases = [
    ["score: my goal", run("score", 10, (ms, t) => { own(ms, 0); if (t > 2 && !ms.g){ ms.g = 1; goal(ms, 0); } }), "goal"],
    ["score: their goal", run("score", 10, (ms, t) => { if (t > 2 && !ms.g){ ms.g = 1; goal(ms, 1); } }), "conceded"],
    ["score: they hold it 0.6 s", run("score", 10, (ms, t) => { if (t > 1) own(ms, 1); }), "lost"],
    ["score: a touch of theirs in a scramble is no loss", run("score", 3, (ms, t) => { if (t > 1 && t < 1.4) own(ms, 1); else loose(ms); }), "time"],
    ["score: out of time", run("score", 4, ms => own(ms, 0)), "time"],
    ["score: a disallowed goal is no goal", run("score", 4, (ms, t) => { if (t > 1 && !ms.g){ ms.g = 1; ms.events.push({kind:"goal", team:0, disallowed:true, t}); } }), "time"],
    ["keep: kept for the time", run("keep", 5, ms => own(ms, 0)), "kept"],
    ["keep: lost", run("keep", 5, (ms, t) => own(ms, t > 2 ? 1 : 0)), "lost"],
    ["keep: the keeper's hands are theirs", run("keep", 5, (ms, t) => { if (t > 2){ ms.ball.state = "held"; ms.ball.holder = 1; loose(ms); } }), "lost"],
    ["keep: a restart of theirs is theirs", run("keep", 5, (ms, t) => { if (t > 2) ms.restart = {team:1, taken:false}; }), "lost"],
    ["line: reached", run("line", 10, (ms, t) => { own(ms, 0); ms.agents[0].m.x = Math.min(26, t*6); }), "line"],
    ["line: not reached", run("line", 4, (ms, t) => { own(ms, 0); ms.agents[0].m.x = 5; }), "time"],
    ["line: halfway of a full pitch", run("line", 10, (ms, t) => { own(ms, 0); ms.agents[0].m.x = -20 + t*5; }, 26.25), "line"],
    ["winback: won and carried forward", run("winback", 10, (ms, t) => { if (t < 2) own(ms, 1); else { own(ms, 0); ms.ball.p.x = (t - 2)*4; } }), "won"],
    ["winback: won and scored", run("winback", 10, (ms, t) => { if (t < 2) own(ms, 1); else { own(ms, 0); if (t > 3 && !ms.g){ ms.g = 1; goal(ms, 0); } } }), "goal"],
    ["winback: never won", run("winback", 5, ms => own(ms, 1)), "time"],
    ["winback: won, then nothing", run("winback", 5, (ms, t) => own(ms, t < 1 ? 1 : 0)), "slow"],
    ["winback: won and lost again", run("winback", 10, (ms, t) => own(ms, t < 1 || t > 3 ? 1 : 0)), "lost"],
    ["winback: they scored", run("winback", 10, (ms, t) => { own(ms, 1); if (t > 2 && !ms.g){ ms.g = 1; goal(ms, 1); } }), "conceded"],
    ["clean: held out", run("clean", 6, ms => own(ms, 0)), "clean"],
    ["clean: conceded", run("clean", 6, (ms, t) => { if (t > 2 && !ms.g){ ms.g = 1; goal(ms, 1); } }), "conceded"],
    ["the defending side's view (team 1): its goal", run("score", 6, (ms, t) => { own(ms, 1); if (t > 1 && !ms.g){ ms.g = 1; goal(ms, 1); } }, 6, 1), "goal"]
  ];
  const bad = cases.filter(c => c[1] !== c[2]).map(c => ({case:c[0], got:c[1], want:c[2]}));
  check(!bad.length, `objectives detected correctly on ${cases.length} hand-made plays`, bad);
}

/* ---------- 3. TAC-1 and OFF-3 (the anchorcap case: Attacking, a keeper and no defenders, Full cage) ---------- */
{
  const d = drill("att-keeper");
  const make = (offside, withDef = false) => {
    const {setup, spec} = setupOf(d, 1, c => { c.pitch = "full"; c.mates = true; c.attackers = 2; c.offside = offside; c.positions.me = {slot:"CM", dx:0, dz:0};
      c.positions.att[0] = {slot:"ST", dx:0, dz:0}; if (withDef){ c.opps = true; c.defenders = 1; } });
    const {ms} = matchOf(setup, spec, "train");
    const me = ms.agents[ms.me], st = ms.agents.find(a => a.team === 0 && !a.isMe && !a.isGK && a.role === "player");
    const gk = ms.agents.find(a => a.team === 1 && a.isGK), df = ms.agents.find(a => a.team === 1 && !a.isGK && a.role === "player");
    // the keeper out as a sweeper at u = 42.5 (x -10), the ball high up their half (u = 60): a cap there bites
    gk.m.x = -10; gk.m.z = 0;
    if (df){ df.m.x = -22.5; df.leaving = true; }
    const b = ms.ball; b.p.x = 7.5; b.p.z = 0; b.p.y = 0.11; b.state = "free"; liveRoll(b); me.m.x = 7; me.m.z = 0; st.m.x = 20; setCtl(ms, me); refreshPred(ms);
    for (const a of ms.agents) if (a.anchor) a.anchor.set = false;
    teamShape(ms, 0);
    return {ms, me, st, gk, df, tm:ms.tm[0]};
  };
  const L = 105, sL = 1;
  const free = (x, slot, tm) => {
    let u = tm.line + depthOf(slot)*tm.len;
    if (slot === "ST") u = Math.max(u, tm.lineOpp - TAC.ST_OFF*sL);
    return Math.min(Math.max(u, 3), L - 2);
  };
  const off = make(false), on = make(true), lv = make(true, true);
  const gkU = off.gk.m.x + 52.5;
  check(Math.abs(off.tm.lineOpp - gkU) < 1e-6 && Math.abs(on.tm.lineOpp - gkU) < 1e-6,
    "TAC-1: with one opponent (the keeper) his line is the line, not 0.7 L", {lineOpp:r2(on.tm.lineOpp), gkU:r2(gkU), was:0.7*L});
  const offOk = [off.me, off.st].every(a => Math.abs(a.anchor.u - free(a.m.x, a.slot, off.tm)) < 1e-6);
  check(offOk && off.me.anchor.u > gkU, "TAC-1: offside off, no attacker's anchor is capped by the opponents' line (each equals the uncapped value)",
    {cm:r2(off.me.anchor.u), cmFree:r2(free(0, "CM", off.tm)), st:r2(off.st.anchor.u), stFree:r2(free(0, "ST", off.tm)), lineOpp:r2(off.tm.lineOpp)});
  check(Math.abs(on.me.anchor.u - (gkU - 0.3)) < 1e-6 && on.st.anchor.u <= gkU - 0.3 + 1e-6,
    "TAC-1: offside on, the cap is the keeper's line minus 0.3 m", {cm:r2(on.me.anchor.u), st:r2(on.st.anchor.u), cap:r2(gkU - 0.3)});
  check(lv.df && Math.abs(lv.tm.lineOpp - gkU) < 1e-6 && Math.abs(lv.me.anchor.u - (gkU - 0.3)) < 1e-6,
    "OFF-3: a defender who is leaving does not move the cap", {lineOpp:r2(lv.tm.lineOpp), dfU:lv.df ? r2(lv.df.m.x + 52.5) : null, gkU:r2(gkU)});
}

/* ---------- 4. me asking for the ball (the player as a bot calling the way R does, brain.js callFor) ---------- */
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.set = null; a.task.run = null; };
/* one trial on the att-call drill's setup (Half cage): the carrier in midfield, me ahead of him to the right, their
   two defenders and the keeper; o.blocked: a defender on my lane; o.offside: I stand past their line with offside on;
   o.how 'here' or 'behind' (a run beating the line, the look point in behind) */
function callTrial(seed, o = {}){
  const d = drill("att-call");
  const {setup, spec} = setupOf(d, seed, c => { c.offside = !!o.offsideOn; });
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me], pa = ms.agents.find(a => a.team === 0 && !a.isMe && a.role === "player");
  const defs = ms.agents.filter(a => a.team === 1 && !a.isGK && a.role === "player");
  const jit = ((seed*37) % 11)/10 - .5;
  put(pa, -12, 0, -Math.PI/2);
  put(me, o.offside ? 14 : -2, 11 + jit, -Math.PI/2);
  put(defs[0], 6, -6, Math.PI/2); put(defs[1], 6, 4 + jit, Math.PI/2);
  if (o.blocked) put(defs[1], -7.5, 5.5 + jit*.4, Math.PI/2);
  if (o.how === "behind"){ put(me, -1.6, 10 + jit, -Math.PI/2); me.m.vx = 6; me.m.speed = 6; put(defs[0], 0, -8, Math.PI/2); put(defs[1], 0.5, 0, Math.PI/2); }
  const b = ms.ball; b.p.x = -11.4; b.p.z = 0; b.p.y = 0.11; b.state = "free"; liveRoll(b); setCtl(ms, pa); ms.cutStep = ms.step; refreshPred(ms);
  const point = o.how === "behind" ? {x:8, z:12 + jit} : null;
  // (read now: passModel answers in a scratch object that the carrier's own decisions in the steps below write over)
  const pOK = passModel(ms, b.p, o.how === "behind" ? point : {x:me.m.x, z:me.m.z}, o.how === "behind" ? "through" : "pass", o.how === "behind" ? passSpeedFor(Math.hypot(point.x - b.p.x, point.z - b.p.z), BRAIN.THROUGH_ARRIVE) : 14, me).pOK;
  let decisions = 0, withMe = 0;
  ms.onDecide = (a, opts) => { if (a !== pa) return; decisions++; if (opts.some(x => x.recv === me.id)) withMe++; };
  callFor(ms, me, o.how || "here", point);
  let passed = false, kind = null, other = false;
  for (let k = 0; k < 120 && !passed && !other; k++){
    if (o.how === "behind"){ me.intent.dx = 1; me.intent.dz = 0; me.intent.gait = "sprint"; } else { me.intent.dx = 0; me.intent.dz = 0; }
    const n0 = ms.events.length;
    simStep(ms, H);
    for (const e of ms.events.slice(n0)) if (e.kind === "kick" && e.agent === pa.id){ if (e.recv === me.id){ passed = true; kind = e.intent; } else other = true; }
  }
  return {pOK, passed, kind, decisions, withMe, offside:offsidePosition(ms, me, 0).off};
}
{
  const open = {runs:0, passed:0, decisions:0, withMe:0}, blocked = {runs:0, passed:0}, offs = {runs:0, passed:0}, behind = {runs:0, through:0};
  for (let s = 1; s <= 20; s++){
    const a = callTrial(s);
    if (a.pOK >= .7){ open.runs++; if (a.passed) open.passed++; }
    open.decisions += a.decisions; open.withMe += a.withMe;
    const bl = callTrial(s, {blocked:true});
    if (bl.pOK < .3){ blocked.runs++; if (bl.passed) blocked.passed++; }
    const of = callTrial(s, {offside:true, offsideOn:true});
    offs.runs++; if (of.passed) offs.passed++;
    const bh = callTrial(s, {how:"behind", offsideOn:true});
    if (bh.pOK >= .5){ behind.runs++; if (bh.passed && bh.kind === "through") behind.through++; }
  }
  check(open.runs >= 15 && open.passed >= .8*open.runs, `open, onside, a clear lane, called for: the AI carrier passes to me within 2 s in ${open.passed} of ${open.runs} (at least 80%)`, open);
  check(blocked.runs === 20 && blocked.passed === 0, `the lane blocked (pass model under 0.3): never passed (${blocked.passed} of ${blocked.runs})`, blocked);
  check(offs.passed === 0, `me offside with offside played: never passed (${offs.passed} of ${offs.runs})`, offs);
  check(behind.runs >= 10 && behind.through >= .6*behind.runs, `"In behind!" on an onside run that beats the line: a through ball in ${behind.through} of ${behind.runs} (at least 60% where one is on)`, behind);
  check(open.decisions > 0 && open.withMe === open.decisions, "sees the user: I am among the carrier's pass candidates in every decision of the call trials", {decisions:open.decisions, withMe:open.withMe});
}
// sees the user in the drills, and no forced passes: my share of the carrier's passes without a call, against an AI
// player's in my place, over the same seeds (the player a bot moving as the AI would, never calling)
{
  const ids = ["att-carrier", "att-call", "att-support", "m-wing-recv", "m-space", "m-pressure", "m-crossbox"];
  let dec = 0, missing = 0, noPass = 0, toMe = 0, all = 0, toAi = 0, allAi = 0;
  for (const id of ids){
    const d = drill(id);
    for (let seed = 1; seed <= 20; seed++){
      for (const aiMe of [false, true]){
        const {setup, spec} = setupOf(d, seed);
        const {ms} = matchOf(setup, spec, "train", {aiMe});
        ms.meAI = false;
        const mine = ms.agents.find(a => a.team === setup.myTeam && a.pid === 1);
        // (a pass to where I am going that would be under a metre long is never made, brain.js: "never from point-blank
        // range"; such a decision does not count. Nor does one with no pass option at all, a clearance or a dribble
        // under pressure: it says nothing about seeing me)
        const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const blank = a => { const m = mine.m, tx = cl(m.x + m.vx*0.35, -ms.spec.hx + 1, ms.spec.hx - 1), tz = cl(m.z + m.vz*0.35, -ms.spec.hz + 1, ms.spec.hz - 1); return Math.hypot(tx - a.m.x, tz - a.m.z) < 1; };
        if (!aiMe) ms.onDecide = (a, opts) => { if (a.team !== mine.team || blank(a)) return; if (!opts.some(x => x.recv >= 0)){ noPass++; return; } dec++; if (!opts.some(x => x.recv === mine.id)) missing++; };
        const J = goState(ms);
        for (let k = 0; k < 60*10; k++){
          if (!aiMe && k % 15 === 0){ const t = decideOffBall(ms, mine); mine.botT = t; }
          if (!aiMe){ const t = mine.botT; if (t) steer(mine, t.x, t.z, t.gait, t.stop, t.face); }
          const n0 = ms.events.length;
          simStep(ms, H);
          runsStep(J, ms, setup.plan, setup.myTeam);
          for (const e of ms.events.slice(n0)){
            if (e.kind !== "kick" || e.agent < 0 || e.agent === mine.id || !(e.intent === "pass" || e.intent === "through" || e.intent === "lob")) continue;
            if (ms.agents[e.agent].team !== mine.team) continue;
            if (aiMe){ allAi++; if (e.recv === mine.id) toAi++; } else { all++; if (e.recv === mine.id) toMe++; }
          }
        }
      }
    }
  }
  const shareMe = all ? toMe/all : 0, shareAi = allAi ? toAi/allAi : 0;
  check(dec > 50 && missing === 0, `sees the user: in all ${dec} decisions of a carrier of mine in the drills I am among his pass candidates`, {decisions:dec, missing, noPass});
  check(all > 30 && shareMe <= 1.5*shareAi, `no call, no forced passes: my share of the carrier's passes ${r2(shareMe)} is at most 1.5 x an AI player's in my place (${r2(shareAi)})`, {toMe, all, toAi, allAi});
}

/* ---------- 5. the carrier passes when a free team-mate is worth more (rate bands) ---------- */
{
  // the carrier lightly pressed in midfield; a free team-mate either well ahead in a far better spot (an xT advantage)
  // or the same distance square and behind (none). Band: with the advantage he plays it in at least 60% of seeds; without,
  // at most 40%, and at least 30 points less often
  const trial = (seed, adv) => {
    const d = drill("att-keeper-defs");
    const {setup, spec} = setupOf(d, seed, c => { c.offside = true; });
    const {ms} = matchOf(setup, spec, "train", {aiMe:true});
    const [pa, mate] = ms.agents.filter(a => a.team === 0 && a.role === "player");
    const defs = ms.agents.filter(a => a.team === 1 && !a.isGK && a.role === "player");
    const jit = ((seed*29) % 9)/10 - .4;
    put(pa, -8, 0, -Math.PI/2);
    if (adv) put(mate, 9, 7 + jit, -Math.PI/2); else put(mate, -20, 9 + jit, -Math.PI/2);
    put(defs[0], -4.5, -0.5, Math.PI/2); put(defs[1], 12, -9, Math.PI/2);
    const b = ms.ball; b.p.x = -7.4; b.p.z = 0; b.p.y = 0.11; b.state = "free"; liveRoll(b); setCtl(ms, pa); ms.cutStep = ms.step; refreshPred(ms);
    for (let k = 0; k < 120; k++){
      const n0 = ms.events.length; simStep(ms, H);
      for (const e of ms.events.slice(n0)) if (e.kind === "kick" && e.agent === pa.id) return e.recv === mate.id;
    }
    return false;
  };
  let a = 0, n = 0;
  for (let s = 1; s <= 20; s++){ if (trial(s, true)) a++; if (trial(s, false)) n++; }
  check(a >= 12 && n <= 8 && a - n >= 6, `the carrier passes to a free team-mate with an xT advantage in ${a} of 20 (band at least 12), to one without in ${n} of 20 (band at most 8)`, {advantage:a, none:n});
}

process.exit(done() ? 0 : 1);
