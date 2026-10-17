// qa/uf2-ssg-sim.mjs: the small-sided games on the simulation, headless (Node, seeded). Owner: UF2-B (user fix round
// 2). Contract: USER-ISSUES.md Round 2 U14 (each side attacks its own opponent's goal only, no AI shoots at its own
// goal) and U16 (after a goal a short kick-off from the conceding side, everyone moving back to shape, nobody frozen,
// under about 6 s of dead time).
//
// Each game is built as training.js buildItem builds it (the whole training pitch, trainspec.js areaPitch; four a
// side counting the keepers: the squad's keeper in the bibs' goal, one of your team-mates in yours (mateSlots 'GK');
// the training laws: no offside, no set pieces, both goals count) and played
// the way the mode train plays it: every restart but the kick-off after a goal cleared at once, the kick-off run by
// ssgplay.js (the module training.js calls), a dead ball replaced by a new one (the coach's, played to the player here
// as a ball at his feet). The player is the AI's stand-in (meAI). Over SEEDS seeds of Lesson 6 (120 s) and of the
// session's small-sided block (180 s):
//   - every shot and every header at goal by either side is aimed at the end that side attacks (its kick's target,
//     and where its flight crosses a goal line), and none of either side's kicks of any kind is on its way into the
//     mouth of its own goal (its target there; a deflection's own goal is not a kick of his);
//   - each goal is followed by a kick-off from the centre spot by the side that conceded, taken within SSG.DEAD_MAX
//     seconds of the goal, by an AI outfield man (never the player);
//   - in that time nobody of either side stands frozen: every AI outfield man either moves (more than 1 m) or is
//     already at his kick-off place (within 2.5 m of it);
//   - the games are fair (USER-ISSUES Round 2, Overall: rewarding, not tedious): your side wins at least as many as it
//     loses (a goal with nobody in it, as when the only keeper played for the bibs, lost most of them).
//
//   node qa/uf2-ssg-sim.mjs [--seeds 8]       exits 1 on any failed check; writes qa/out/uf2-ssg-sim.json
import {createMatch, simStep, REF, AR1, AR2, TEMPO} from "../js/life/football/sim.js";
import * as TS from "../js/life/football/trainspec.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {refreshPred} from "../js/life/football/actions.js";
import {createBall} from "../js/life/football/ball.js";
import {ssgGoalStep, koPending} from "../js/life/football/ssgplay.js";
import {checker} from "./wpF-lib.mjs";

const {check, done, res} = checker("uf2-ssg-sim");
const argv = process.argv.slice(2), ai = argv.indexOf("--seeds");
const SEEDS = ai >= 0 ? +argv[ai + 1] : 8;
const H = 1/60, R = 0.11, HW = 3.66;
const r2 = v => Math.round(v*100)/100;

const POS_OF = {GK: "GK", CB: "DF", CM: "CM", ST: "ST", LW: "LW"};
const ARCH = {GK: "GK", DF: "DF", CM: "CM", LW: "W", ST: "ST"};
const rec = (pid, slot, me = false) => ({pid, name: "P" + pid, number: pid % 30, slot, arch: ARCH[POS_OF[slot]], isGK: slot === "GK", isMe: me, scale: 1,
  at: attrsForAI({id: pid, ovr: 58 + (pid*7) % 12, pos: POS_OF[slot]}), energy: 100, fatigue: 0, prefFoot: "Right"});

// one small-sided game as training.js builds and plays it; returns what the checks need
function play(item, seed){
  const spec = TS.areaPitch(item.area, 3);
  const myTeam = item.dir < 0 ? 1 : 0, oppTeam = 1 - myTeam;
  const teams = [{name: "A", players: [], bench: []}, {name: "B", players: [], bench: []}];
  let pid = 10;
  teams[myTeam].players.push(rec(1, "CM", true));
  for (const s of item.mateSlots) teams[myTeam].players.push(rec(pid++, s));
  for (const s of item.oppSlots) teams[oppTeam].players.push(rec(pid++, s));
  if (item.keeper) teams[oppTeam].players.push(rec(pid++, "GK"));
  const rules = {goals: TS.goalsLaw(spec), offside: !!item.offside, restarts: false, cards: false, subs: 0, halfTime: false, stoppage: false};
  const ms = createMatch({seed, mode: item.mode, spec, halfRealSec: 1e6, tempo: Object.assign({}, TEMPO[2]), teams,
    me: {team: myTeam, slot: "CM", prefFoot: "Right"}, rules, kickoffTeam: myTeam, htAuto: true, meAI: true});
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  ms.restart = null; ms.phase = "live"; for (const a of ms.agents) a.set = null;
  const me = ms.agents[ms.me];
  ms.ball.state = "free"; ms.ball.p.x = me.m.x; ms.ball.p.z = me.m.z + 1; ms.ball.p.y = R; refreshPred(ms);
  // a fresh ball (training.js takeBall: the old one left loose where it is)
  const newBall = (x, z, dead = true) => {
    const old = ms.ball, fresh = createBall({x, z, rollDecel: old.rollDecel});
    fresh.state = dead ? "dead" : "free";
    const j = ms.spares.findIndex(q => q.ball === old);
    if (j >= 0) ms.spares[j].state = "loose";
    if (old.state !== "held") old.state = "dead";
    ms.spares.push({ball: fresh, cone: -1, state: "live"});
    ms.ball = fresh; ms.ballSwap = ms.step;
    refreshPred(ms);
  };
  const st = {ko: null, koLog: []};
  const out = {shots: [], wrongShots: [], ownMouth: [], rollOn: [], goals: [], kos: [], frozen: [], meTaker: 0, seed};
  let ev0 = 0, deadT = 0, watch = null;
  const steps = Math.round(item.real/H);
  for (let i = 0; i < steps; i++){
    simStep(ms, H);
    ssgGoalStep(ms, st, (x, z) => newBall(x, z, true));
    if ((ms.restart || ms.phase !== "live") && !koPending(ms, st)){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; a.wall = false; } }
    // the coach's new ball: a dead ball (out of play, or never kicked off) with no kick-off waiting
    if (!koPending(ms, st) && ms.ball.state === "dead"){ deadT += H; if (deadT > 1.5){ deadT = 0; newBall(me.m.x, me.m.z + 1, false); } } else deadT = 0;
    for (; ev0 < ms.events.length; ev0++){
      const e = ms.events[ev0];
      if (e.kind === "kick" && e.agent >= 0){
        const att = ms.dirs[e.team], own = -att;
        const atGoal = e.intent === "shot" || e.intent === "header" && e.atGoal;
        const cOwn = TS.crossAt(ms.pred, ms.predN, own, spec.hx, R), cAtt = TS.crossAt(ms.pred, ms.predN, att, spec.hx, R);
        if (atGoal){
          const aimOk = e.tx != null ? Math.sign(e.tx) === att : !cOwn || Math.abs(cOwn.z) > HW + 1;
          out.shots.push({t: r2(e.t), team: e.team, agent: e.agent, intent: e.intent, tx: e.tx, x: r2(e.x), aimOk, crossAtt: !!cAtt});
          if (!aimOk) out.wrongShots.push(out.shots[out.shots.length - 1]);
        }
        // a kick aimed into the mouth of his own goal (its target there); a back pass to a team-mate whose path would
        // run on into it if he missed it is a pass to him, counted on its own (rollOn) and not a failure
        const aimedOwn = e.tx != null && own*e.tx > spec.hx - 1.5 && Math.abs(e.tz || 0) < HW + .5;
        if (aimedOwn) out.ownMouth.push({t: r2(e.t), team: e.team, agent: e.agent, intent: e.intent, x: r2(e.x), z: r2(e.z), tx: e.tx, tz: e.tz});
        else if (cOwn && Math.abs(cOwn.z) < HW && cOwn.y < 2.44) out.rollOn.push({t: r2(e.t), team: e.team, intent: e.intent, recv: e.recv});
      }
      if (e.kind === "goal" && !e.disallowed) out.goals.push({t: r2(e.t), team: e.team, x: r2(e.x)});
    }
    // the dead time after a goal: who moves
    const k = st.ko;
    if (k && !k.done && (!watch || watch.t0 !== k.t0)) watch = {t0: k.t0, from: new Map(ms.agents.filter(a => a.onPitch && a.role === "player" && !a.isGK && !a.isMe).map(a => [a.id, {x: a.m.x, z: a.m.z, d: 0, px: a.m.x, pz: a.m.z}]))};
    if (watch && k && k.t0 === watch.t0){
      for (const [id, w] of watch.from){ const a = ms.agents[id]; w.d += Math.hypot(a.m.x - w.px, a.m.z - w.pz); w.px = a.m.x; w.pz = a.m.z; w.set = a.set ? {x: a.set.x, z: a.set.z} : w.set; }
      if (k.done){
        for (const [id, w] of watch.from){
          const a = ms.agents[id], near = w.set ? Math.hypot(a.m.x - w.set.x, a.m.z - w.set.z) < 2.5 : false;
          if (w.d < 1 && !near) out.frozen.push({goalAt: r2(k.t0), agent: id, team: a.team, moved: r2(w.d)});
        }
        watch = null;
      }
    }
  }
  for (const L of st.koLog){
    const tk = ms.agents[L.taker];
    if (tk && tk.isMe) out.meTaker++;
    // (a goal in the game's last seconds: the time is up before the kick-off, which is never taken)
    if (L.takenAt == null && L.goalAt > item.real - TS.SSG.DEAD_MAX) continue;
    out.kos.push(Object.assign({}, L, {dead: L.takenAt != null ? r2(L.takenAt - L.goalAt) : null}));
  }
  out.score = ms.score.slice();
  return out;
}

const lesson = TS.LESSONS.find(L => L.kind === "ssg"), block = TS.BLOCKS.find(B => B.kind === "ssg");
const games = [];
for (const [name, item] of [["lesson 6", lesson], ["session block", block]]){
  for (let s = 0; s < SEEDS; s++){
    const g = play(item, 9001 + 37*s + (name === "lesson 6" ? 0 : 5000));
    g.name = name; games.push(g);
  }
}
const all = k => games.flatMap(g => g[k].map(x => Object.assign({game: g.name, seed: g.seed}, x)));
const shots = all("shots"), wrong = all("wrongShots"), ownMouth = all("ownMouth"), goals = all("goals"), kos = all("kos"), frozen = all("frozen");
res.summary = {games: games.length, shots: shots.length, byTeam: [0, 1].map(t => shots.filter(q => q.team === t).length), goals: goals.length,
  scores: games.map(g => `${g.name} ${g.seed}: ${g.score.join("-")}`), kickoffs: kos.length, dead: kos.map(k => k.dead)};
console.log(JSON.stringify(res.summary));
check(shots.length >= 2*SEEDS && res.summary.byTeam.every(n => n > 0), "both sides shoot in the small-sided games (enough shots to judge)", res.summary.byTeam);
check(!wrong.length, "every shot and header at goal by either side is aimed at the end that side attacks", wrong.slice(0, 5));
check(!ownMouth.length, "no kick by either side is aimed into the mouth of its own goal", {aimed: ownMouth.slice(0, 5), passesThatWouldRollOn: all("rollOn").length});
check(goals.length >= SEEDS, "goals are scored, so the restart after a goal is exercised", goals.length);
const late = games.reduce((n, g) => n + g.goals.filter(q => q.t > (g.name === "lesson 6" ? lesson.real : block.real) - TS.SSG.DEAD_MAX).length, 0);
check(kos.length >= goals.length - late && kos.length <= goals.length, "every goal is followed by a kick-off (but one in the last seconds of a game)", {goals: goals.length, kickoffs: kos.length, late});
const conceded = kos.every(k => { const g = goals.find(q => q.game === k.game && q.seed === k.seed && Math.abs(q.t - k.goalAt) < .05); return g && k.team === 1 - g.team; });
check(conceded, "the kick-off is the conceding side's", kos.slice(0, 4).map(k => ({ko: k.team, at: k.goalAt})));
const slow = kos.filter(k => k.dead == null || k.dead > TS.SSG.DEAD_MAX || k.forced);
check(!slow.length, `every kick-off after a goal is taken within ${TS.SSG.DEAD_MAX} s of the goal`, {slow: slow.slice(0, 4), max: Math.max(...kos.map(k => k.dead || 99))});
check(games.every(g => !g.meTaker), "the player never has to take the kick-off himself (an AI team-mate takes it)", games.map(g => g.meTaker));
check(!frozen.length, "nobody stands frozen while the kick-off is set up (each AI outfield man moves or is already in place)", frozen.slice(0, 6));
const tally = games.reduce((o, g) => { const a = g.score[0], b = g.score[1]; o[a > b ? "won" : a < b ? "lost" : "drawn"]++; o.for += a; o.against += b; return o; }, {won: 0, drawn: 0, lost: 0, for: 0, against: 0});
res.tally = tally;
check(tally.won >= tally.lost, "the games are fair: your side wins at least as many as it loses (both goals have a keeper)", tally);
process.exit(done() ? 0 : 1);
