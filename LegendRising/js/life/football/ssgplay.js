/* ============ Football: the small-sided game's restart after a goal ============
   Owner: UF2-B (user fix round 2). Contract: USER-ISSUES.md Round 2 U16 (after a goal play restarts quickly and
   cleanly: a short kick-off from the conceding side, players jog back to shape, nobody stands frozen; under about 6 s
   of dead time); trainspec.js SSG holds the numbers.

   The match's own kick-off (rules.js startRestart: the taker's walk to the ball, brain.js restartShape sending
   everyone into his own half at a jog, the taker's short pass in decideRestart), made quick for a training game: the
   goal stands for SSG.CELEB s instead of the match's RULES.CELEBRATE, a fresh ball is put on the centre spot at once
   (newBall: the caller's, training.js takeBall, a ball out of the coach's bag; the one in the net stays there), the
   conceding side's outfield man nearest the spot takes it (trainspec.js koTaker: never the player, so nobody waits on
   you), and it is taken SSG.KO_LIMIT s after the goal once he is at the ball, however far the others still have to
   go: they carry on into their shape as play goes on. A kick-off that has still not been taken SSG.DEAD_MAX + 3 s
   after the goal is not waited on: play goes on from the ball where it is.

   No THREE, no DOM: the Node tests (qa/uf2-ssg-sim.mjs) run it on the simulation as training.js does.
     ssgGoalStep(ms, st, newBall) after every simStep: st is the item's record ({ko, koLog}: the restart under way,
       and one {team, taker, goalAt, takenAt, score} a goal); returns the team that scored when a goal was just
       given, else -1
     koPending(ms, st): a kick-off after a goal is still to be taken (the training game keeps that restart: it clears
       every other one) */
import {startRestart, RULES} from "./rules.js";
import {refreshPred} from "./actions.js";
import {SSG, koTaker} from "./trainspec.js";

const r2 = v => Math.round(v*100)/100;
export function koPending(ms, st){ const R0 = ms.restart; return !!(st && st.ko && !st.ko.done && R0 && R0.kind === "kickoff" && !R0.taken); }

export function ssgGoalStep(ms, st, newBall){
  let scored = -1;
  if (ms.phase === "goal" && (!st.ko || st.ko.goalT !== ms.goalT)) scored = kickoffAfterGoal(ms, st, newBall);
  const k = st.ko;
  if (!k || k.done) return scored;
  if (!koPending(ms, st)){
    k.done = true; k.takenAt = ms.t;
    const L = st.koLog[st.koLog.length - 1]; if (L) L.takenAt = r2(ms.t);
    return scored;
  }
  if (ms.t - k.t0 > SSG.DEAD_MAX + 3){
    ms.restart = null; ms.phase = "live";
    for (const a of ms.agents){ a.set = null; a.wall = false; }
    if (ms.ball.state === "dead") ms.ball.state = "free";
    refreshPred(ms);
    k.done = true; k.takenAt = ms.t; k.forced = true;
    const L = st.koLog[st.koLog.length - 1]; if (L){ L.takenAt = r2(ms.t); L.forced = true; }
  }
  return scored;
}

function kickoffAfterGoal(ms, st, newBall){
  const R0 = ms.restart, ev = ms.goalEv;
  const scored = ev ? ev.team : R0 ? 1 - R0.team : -1;
  const team = R0 && R0.kind === "kickoff" ? R0.team : 1 - scored;
  if (newBall) newBall(0, 0);
  const R1 = startRestart(ms, "kickoff", team, {x: 0, z: 0}, {after: true});
  R1.limit = SSG.KO_LIMIT;
  const tk = koTaker(ms.agents.map(a => ({id: a.id, team: a.team, isGK: a.isGK, isMe: !!a.isMe, onPitch: a.onPitch && a.role === "player" && !a.leaving,
    x: a.m.x, z: a.m.z})), team);
  if (tk >= 0){ R1.taker = tk; R1.fetcher = tk; }
  // the goal stands for a moment (the match's celebration is RULES.CELEBRATE s; a training game's is shorter)
  ms.phase = "goal"; ms.goalT = ms.t - Math.max(0, RULES.CELEBRATE - SSG.CELEB);
  st.ko = {t0: ms.t, team, taker: R1.taker, goalT: ms.goalT, done: false, takenAt: null};
  (st.koLog || (st.koLog = [])).push({team, taker: R1.taker, goalAt: r2(ms.t), takenAt: null, score: ms.score.slice()});
  return scored;
}
