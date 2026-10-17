// js/life/football/brain.js: what every outfield footballer decides. Who goes for a loose ball, a pass or a high ball
// (the shared prediction and firstReach), what the man on the ball does with it (shoot, pass, play a runner in, cross,
// dribble, shield, clear: scored on the value surface and chosen by a softmax), where everyone else goes (the shape,
// support, runs in behind that hold the line until the pass, pressing, covering, marking), and the set pieces (spots,
// the wall, the taker's choice). The player's involvement comes from his anchor and from a small, capped, logged
// preference of his team-mates for him when he is a good onside option; there is no director.
// Owner: WP-E. Contract DESIGN 1.4.14 (brainStep, decideCarrier, decideOffBall, passModel, playerPreference); behaviour
// 3.2.3 to 3.2.5, 3.2.8 (set pieces); cadence 1.5.6; preference 3.2.4.
// P2b-B (TR-2b, TRAINING-SPEC section 3): the shield is valued with the shield formula (S against the presser's D,
// duel.js pShieldLoss) and carried out (intent.shield, the back to the presser); the presser answers a shield with a
// shield challenge or a tackle (pShieldLoss against pTackleWin); tackles reach duel.js standReach; loose balls and 50/50s
// are challenged; the pass model's defender reach is the control zone's R and the receiver's control its q (zone.js).
// P5-A (Training Mode Phase 5, BUILD-PLAN P5-A work item 1b; TRAINING-SPEC 4, Free Play's optional practice opponents):
// a practice opponent's behaviour (a.drill: stand, jockey or press), read only in the training mode (drillMove).
// P6-B (Training Mode Phase 6, BUILD-PLAN P6-B work items 3, 4 and 6; TRAINING-SPEC 2 and 5): AI-3, nobody shoots,
// crosses, takes a first-time shot or heads at goal toward an end with no goal that counts (rules.js goalCounts: a
// cage's end with no goal standing, laws.goals) or when the scenario's objective has no goal in it (AI-4, tempo.shotBias
// 0); in a cage whose ball comes back off the fence nobody puts it out of play for safety, and no clearance is aimed
// past the lines; the player is among the carrier's pass candidates in every decision while he is on the pitch (at
// any distance: a pass he cannot reach is valued as the pass model says, never forced).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random (choices draw from ms.r).

import {firstReach, rollTime, rollTimeQ, RQT, BALL} from "./ball.js";
import {flightTime} from "./strike.js";
import {gauss} from "./rng.js";
import {timeToPointQ, TT, sprintSpeed} from "../mover.js";
import {xT, SLOT_POS, teamToPitch, depthOf} from "./tactics.js";
import {xgAt, xgGeo} from "./judge.js";
import {offsidePosition, halfwayU, RULES, lawOf, goalCounts} from "./rules.js";
import {logEv} from "./events.js";
import {decisionRecord} from "./judge.js";
import {steer, standStill, faceTo, startKick, startTackle, startHeader, startThrow, passSpeedFor, loftSpeedFor, pressureOn,
  canStrike, nudge, predAt, startAction} from "./actions.js";
import {jumpHeight, raiseHand} from "./agent.js";
import {exp, hypot, sin, cos, atan2, pow} from "./detmath.js";
import {R as zoneR, q as zoneQ, ratings, breathOf} from "./zone.js";
import {pShieldLoss, pTackleWin, shieldAngle, angleFactor, fatigueFactor, standReach, slideReach} from "./duel.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180, R = BALL.R;
const sigmoid = x => 1/(1 + exp(-x));

// 1.5.6, 3.2.3 to 3.2.5 numbers
export const BRAIN = Object.freeze({
  HEAVY: 4,                  // heavy evaluations a step at most
  CLEAR_FIRST: [3.0, 0.6, 32, 24, 12, 2.0],  // a loose ball in his own box with an opponent within 3 m: cleared first
                                     // time 60% of the time, 32 m upfield toward the near touchline at 24 m/s; within 12 m
                                     // of his goal line with the man within 2 m, out toward the corner flag
  CARE: [0.4, 0.5, 0.2],     // tackle rate on a yellow card, as the last man, and for a forward (he harries, he rarely dives in)
  SLIDE_CLOSE: 5.5,          // a slide only below this closing speed (m/s)
  // The harness's stand-in for the player (meAI: the player as an AI-driven agent, 2.3 WP-E), by his archetype, as a
  // player in that position plays: how much more readily than the AI he shoots (a shooter also tries from up to ME_RANGE
  // m), takes his man on (and drives at goal in their half, ME_DRIVE), goes in for a tackle (back: how much more readily
  // still in his own half, where a forward who has tracked back goes in, while up the pitch he only harries); how long
  // (s) he goes without being in the play before he comes to show for it (a winger holds the width longest); how much
  // higher (m) he plays with his side on the ball in their half (a forward getting into the box), and how much deeper
  // with it in his own half (a ten coming short for it). 1, Infinity or 0: as the AI does. At set pieces he takes the
  // place the AI would give him (restartShape); the winger's throw-ins are counted apart from the oracle comparison
  // instead (harness.js involvementShares, DESIGN 3.2.12), and he takes a throw-in when he is his side's nearest man
  // within 10 m, as the player does (rules.js pickTaker, 3.2.8). Everywhere else he is the AI: the same presser choice,
  // the same takers. The table is fitted on calibration seeds (qa/harness.mjs --from 20001, 30001, 40001), never on
  // the acceptance run's 1 to 1000. (TR-2b fix round 2 refit on seeds 50001 to 51300: ST tackle 1.3 to 1.0 and seek 8
  // to 12, W up 8 to 13, AM tackle 1 to 0.9, CM shoot 1.3 to 1.6 and up 2 to 3, DF tackle 1 to 1.2, after the
  // possession rework moved the forwards' defensive actions and touches up and the defenders' down)
  ME: {
    ST: {shoot: 2.5, dribble: 1.2, tackle: 1.0, back: 3, seek: 12, up: 5, drop: 2},
    W: {shoot: 3.6, dribble: 1, tackle: 1, back: 1, seek: 60, up: 13, drop: 0},
    AM: {shoot: 6.8, dribble: 1.8, tackle: 0.9, back: 1, seek: 3, up: 4, drop: 8},
    CM: {shoot: 1.6, dribble: 1.2, tackle: 6.5, back: 1, seek: 2, up: 3, drop: 0},
    DF: {shoot: 1, dribble: 1, tackle: 1.2, back: 1, seek: 12, up: 0, drop: 0}
  },
  ME_RANGE: 36, ME_DRIVE: 0.6,
  TAKE_ON: 3.0,              // a dribble at a man within this distance in front is a take-on: a burst past him
  TAKE_ON_T: 1.2,            // seconds he commits to it
  GK_SPACE: 6,               // metres the other side keeps from a keeper with the ball in his hands
  EVAL_SLICE: 3,             // slices of a carrier's evaluation (a team-mate's passes, the crosses) a step
  OFFBALL_EVERY: 15,         // off-ball targets: agent i when step % 15 == i % 15 (4 Hz)
  PLAN_EVERY: 6,             // ball plans (who goes for it) at least every 6 steps while it is loose
  CARRIER0: 0.35, CARRIER_K: 0.002, PRESSED: 0.6,
  TEMP: 0.35,                // softmax temperature 0.35 (1 - decision/120)
  LANE_N: 8,                 // samples along a ground pass
  RECV_CTRL: [0.31, 0.7, 0, 0.2, 1], LOFT_CTRL: 0.72, LOB_MIN: 24,   // (P2b-B) receiver control = 0.31 + 0.7 q (zone.js q, his
                             // pressure and breath in it), within 0.2 and 1
  PASS_MIN: 4, PASS_MAX: 52,
  THROUGH_ARRIVE: 8, THROUGH_ITERS: 5,
  DRIB_DIRS: 7, DRIB_LEN: 6, DRIB_K: 0.9,
  HOLD_K: 0.6, SHIELD_ENG: 1.3,   // (P2b-B) challenges a presser gets in on a shield held to the next decision, at pressure 1
  CLEAR: [26, 0.4, 0.72],     // a clearance: within 26 m of his goal line, pressed above 0.4, worth 0.72 of keeping it there
  SAFETY: [22, 0.4, 6, 0.005],   // out of play for safety: within 22 m of his goal line, pressed, 6 m off the middle; a corner costs 0.005
  POSS: 0.012,               // the worth of having the ball, anywhere (added to xT on both sides of a decision)
  CROSS_T: 0.1, CROSS_V: 1.3, CROSS_ZONE: [40, 30, 10, 14],   // a wide final-third position's crossing threat: from L - 40 over 30 m, |w - mid| from 10 over 14 m
  CROSS_RUN: 0.5,            // a runner counts for a cross zone he reaches within the flight plus this
  CROSS_FROM: [28, 22],      // a cross is on within 28 m of the goal line and 22 m of the touchline (TR-2b refit: 24, 20)
  CROSS_DEEP: 0.3,           // a cross from 28 m off the goal line is worth this share of one from 10 m or nearer (was 0.2)
  LONG: [0.5, 0.4, 30, 55],  // a long ball: from his own half, pressed beyond this, to the most advanced man 30 to 55 m away
  PREF_CAP: [-0.10, 0.25], PREF_GATE: 0.75, PREF_SHARE: 0.25, PREF_WIN: 600,
  CALL_T: 2.5, CALL_COOL: 4, CALL_HALF: 20,
  // (U10) the player's call heard by the carrier: a pass to him that is on (its pOK from CALL_ON[0], fully from CALL_ON[1])
  // gains CALL_ADD of the best option's worth while the call stands; never to a man seen offside, never a pass that is not on
  CALL_ON: [0.5, 0.7], CALL_ADD: 0.2,
  // (P6-B) a pass to the player on his call from outside the usual range is never made from closer than CALL_MIN m
  // (to where it is played, or to where he stands now): from a yard away a pass reads as no pass at all. He is still
  // among the options (the carrier sees him), the call just cannot pull that one
  CALL_MIN: 3,
  // (U9) where a shot is worth taking from: square on to goal (within SIGHT[0] m of the long axis, SIGHT[1] to SIGHT[2] m
  // out) the shot is worth SIGHT[3] more than the bare xG says (the whole goal to aim at, the keeper unsighted through
  // the bodies in front); from a wide angle beyond SIGHT[4] m out (more than SIGHT[0] m off the axis) SIGHT[5] of it
  SIGHT: [11, 12, 28, 1.1, 22, 0.55],
  // (U9) holding the shape in possession, an attacker or a midfielder with a man within SPACE[0] m of his place in it
  // finds space: up to SPACE[1] m off his place, away from that man, never offside (TR-3+U fix round 2: 3 m, not 5, the
  // shape kept tighter; at 5 m goals per match and the striker's touches went above their harness bands)
  SPACE: [4, 3],
  ME_FIRST: 1.0,             // (P2-A, AI-2) a pass to the player is left to him unless a team-mate gets to it this many s sooner
  PRESS_STOP: 1.6, JOCKEY_V: 3.2, TACKLE_D: 1.6, SLIDE_V: 4,
  TACKLE_RATE: [2.5, 0.5, 0.16],  // per second: a ball out of his feet, a shielded one, and the factor from behind (TR-2b refit: 0.12)
  SLIDE_RATE: 0.55,              // per second, chasing a ball out in front of the carrier
  // (P2b-B) a shielding carrier: within CHAL_NEAR m the presser picks a shield challenge or a tackle (by pShieldLoss
  // against pTackleWin), keeps the choice CHAL_KEEP s, and leans in for a challenge at CHAL_V m/s toward the ball's side.
  // A loose ball or a 50/50 an opponent is about to take (within LOOSE_OPP m of it, nearer than him): a standing
  // challenge on the ball at LOOSE_RATE a second within his reach, a slide at SLIDE_RATE at speed within its reach
  CHAL_NEAR: 2.6, CHAL_KEEP: 1.0, CHAL_V: 2.4, LOOSE_OPP: 1.0, LOOSE_RATE: 1.0,
  COVER: 7, MARK: 1.8, MARK_LOOSE: 3.5, ZONE_PULL: 0.55,
  // (P5-A) a practice opponent who jockeys keeps DRILL_JOCKEY[0] to [1] m off the man on the ball: goal side of where
  // the man will be in [5] s, [4] m further off him than the ball is (so it does not come into his reach), at least [2]
  // m and under [1], and [7] m more until he is moving with him; he backs off at the man's own speed, or the ball's,
  // plus [3] m/s (never under JOCKEY_V), and against a man coming faster than [6] m/s he turns and runs
  DRILL_JOCKEY: [1.5, 3.5, 2.4, 1.0, 1.3, 0.25, 2.6, 1.5],
  RUN_HOLD: 0.3, RUN_DEPTH: [7, 16],
  ENGAGED: 3.0,              // an opponent this close to where a pass leaves is already on the ball: no reaction time
  SUPPORT: [2, 32, [9, 14], 16, 7, 0.12, 0.1]   // showing for the ball: the 2 central midfielders nearest the carrier,
                             // within 32 m of him, at 9 or 14 m from him, within 16 m of the anchor; team-mates within
                             // 7 m crowd a spot; per metre to run, per metre forward
});

/* ---------- small helpers ---------- */

const ctlAgent = ms => ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
// the furthest a man of the side can stand and be onside (team frame u): the opponents' line, or nowhere when the
// offside law is not played (a training block, rules.js LAWS)
const onsideU = (ms, tm) => lawOf(ms, 'offside') ? tm.lineOpp : Infinity;
const isAI = (ms, a) => !a.isMe || ms.meAI;
const uOf = (ms, team, x) => ms.dirs[team]*x + ms.spec.L/2;
const wOf = (ms, team, z) => ms.dirs[team]*z + ms.spec.Wd/2;
const PT = {x: 0, z: 0};
// (P6-B, AI-3 and AI-4) is there a goal worth going for at the end this team attacks: a goal that counts there
// (rules.js goalCounts: laws.goals and the ends a cage's area has) and an objective with a goal in it (a scenario's
// tempo.shotBias 0: keep the ball, reach a line). In a match both are always so
export const goalOn = (ms, team) => goalCounts(ms, ms.dirs[team]) && !(ms.cfg.tempo && ms.cfg.tempo.shotBias === 0);
// (P6-B) a ball that comes back off a cage's fence: putting it out of play wins nothing
const rebound = ms => lawOf(ms, 'out') === 'rebound';

// the team-frame value of a pitch point for a team (3.2.3)
export function valueAt(ms, team, x, z){ return xT(uOf(ms, team, x), wOf(ms, team, z), ms.spec.L, ms.spec.Wd); }

// The pass model (1.4.14, 3.2.3): analytic, no solveStrike. A ground pass is sampled at 8 points along the lane; a
// lofted one only at its landing zone. margin = the smallest (an opponent's time to reach the point, with his reaction,
// minus the ball's time there); pOK = sigmoid((margin - 0.05)/0.12) x the receiver's control. Returns {pOK, tArrive,
// intercepts (the opponent who gets nearest), margin, x, z (where it is lost)}.
const PM = {pOK: 0, tArrive: 0, intercepts: -1, margin: 0, x: 0, z: 0, recvCtrl: 1};
export function passModel(ms, from, to, kind, v0, recv = null, out = PM){
  const dx = to.x - from.x, dz = to.z - from.z, d = hypot(dx, dz) || 1e-6, ux = dx/d, uz = dz/d;
  const ground = kind === 'pass' || kind === 'through' || kind === 'roll';
  const roll = ms.ball.rollDecel;
  const passer = ms.agents[ms.poss.ctl] || null, team = passer ? passer.team : (recv ? recv.team : 0);
  // the time until the strike: the swing with the ball in the window, a stride adjust first when it is not. Everyone
  // keeps moving meanwhile (a man pressing him closes in), so every arrival is raced against the ball's time plus it.
  let tw = 0;
  if (passer && ms.ball.state === 'free'){ const cs = canStrike(passer, ms.ball); tw = cs.ok ? cs.tc : 0.35; }
  const tArrive0 = ground ? rollTime(v0, d, roll) : flightTime(kind === 'cross' ? 'cross' : 'lob', d, v0, roll);
  const tArrive = tArrive0 + tw;
  out.tArrive = Number.isFinite(tArrive) ? tArrive : 99;
  let margin = 9, who = -1, mx = to.x, mz = to.z;
  const N = ground ? BRAIN.LANE_N : 1;
  // where the receiver meets it: he comes to the ball (ballPlans gives him the first point of the path he can reach),
  // so the lane ends at the first sample he gets to before the ball does; beyond it nobody can cut it out, and at it an
  // opponent has to beat him there (a pass to a man's feet is his unless somebody is in between)
  let sMeet = d, tMeet = -1;
  if (recv && ground){
    const rr = recv.react + 0.05;
    for (let k = N; k >= 1; k--){
      const s = d*k/N;
      RQT[0] = v0; RQT[1] = s; RQT[2] = roll; RQT[3] = 1; rollTimeQ();
      const tb = RQT[0] + tw;
      // his time there from how he is moving now (the mover's estimate, with his reaction), to within 0.6 m of it
      const px = from.x + ux*s, pz = from.z + uz*s, dr = hypot(px - recv.m.x, pz - recv.m.z);
      // (timeToPoint's register form: nothing boxed in the pass model's loops, 3.9.6)
      let tr = rr;
      if (!(dr <= 0.6)){ TT[0] = recv.m.x + (px - recv.m.x)*(1 - 0.6/dr); TT[1] = recv.m.z + (pz - recv.m.z)*(1 - 0.6/dr); TT[2] = rr; timeToPointQ(recv.m, recv.prm, recv.fac); tr = TT[0]; }
      if (k === N) tMeet = tr;                 // late to it: the ball waits for him there
      if (!Number.isFinite(tb)) continue;
      if (tr > tb) break;
      sMeet = s; tMeet = tr;
    }
  } else if (recv){
    // a lofted ball: whoever is first under it where it comes down (or to it after the bounce) has it
    const dr = hypot(to.x - recv.m.x, to.z - recv.m.z);
    tMeet = recv.react;
    if (!(dr <= 0.6)){ TT[0] = recv.m.x + (to.x - recv.m.x)*(1 - 0.6/dr); TT[1] = recv.m.z + (to.z - recv.m.z)*(1 - 0.6/dr); TT[2] = recv.react; timeToPointQ(recv.m, recv.prm, recv.fac); tMeet = TT[0]; }
  }
  for (const o of ms.agents){
    if (o.team === team || o.team < 0 || !o.onPitch || o.role !== 'player' || o.leaving) continue;
    const om = o.m, react = o.react;
    // the nearest the lane comes to him, a quick bound: if he cannot get within reach of the lane in time, skip him
    const qx = om.x - from.x, qz = om.z - from.z, along = clamp(qx*ux + qz*uz, 0, d), px = qx - along*ux, pz = qz - along*uz;
    const off = hypot(px, pz);
    const vTop = sprintSpeed(o.prm, o.fac);
    if (off - 1.2 > vTop*(out.tArrive + 0.3)) continue;
    // his reach: the control zone's R (zone.js, TRAINING-SPEC 3: his control, the ball's speed and height as it comes
    // past him at the lane's nearest point, his facing to it, his breath), a keeper's dive; a ball passing inside it is
    // his with no reaction at all (actions.touchCheck takes it the step it gets there)
    const reach = o.isGK ? 1.6 : laneReach(ms, o, from, ux, uz, along, v0, ground, roll);
    // a man already on the passer (within ENGAGED m of where the ball leaves) is moving to it: no reaction time for
    // the first metres of its way
    const engaged = hypot(om.x - from.x, om.z - from.z) < BRAIN.ENGAGED;
    for (let k = -3; k <= N; k++){
      // three samples close to the passer (a man pressing him gets a foot to anything played through him: a lofted ball
      // rises through his legs and body there too), then 8 along a ground pass; a lofted ball, then, where it comes down
      // through head height (3 m short, 0.25 s early) and where it lands
      const near = k < 0;
      const s = near ? (ground ? 0.5 : 0.6)*(k + 4) : !ground ? (k === 0 ? d - 3 : d) : k === 0 ? -1 : d*k/N;
      if (!near && !ground && k > 1) break;
      if (ground && k > 0 && k < N && s < 2) continue;
      if (s > d || s < 0.5) continue;
      const tb = near && !ground ? s/Math.max(1, 0.87*v0) + tw : ground ? (RQT[0] = v0, RQT[1] = s, RQT[2] = roll, RQT[3] = 1, rollTimeQ(), RQT[0]) + tw : k === 0 ? Math.max(0.1 + tw, out.tArrive - 0.25) : out.tArrive;
      if (!Number.isFinite(tb)) break;
      if (s > sMeet + 1e-6) break;
      const x = from.x + ux*s, z = from.z + uz*s;
      const atMeet = tMeet >= 0 && s >= sMeet - 1e-6 && (ground || k === 1);
      if (atMeet && hypot(x - om.x, z - om.z) > hypot(x - recv.m.x, z - recv.m.z) + 0.3) continue;
      const dd = Math.max(0, hypot(x - om.x, z - om.z) - reach);
      const rk = near && engaged ? 0 : react;
      // a lower bound first (top speed from his present speed), the full estimate only when it could matter
      const lb = rk + dd/vTop, tRef = atMeet ? Math.min(tb, tMeet) : tb;
      if (lb - tRef > margin || lb - tRef > 0.7) continue;
      let tt = 0;
      if (!(dd <= 0)){ TT[0] = om.x + (x - om.x)*(dd/(dd + reach)); TT[1] = om.z + (z - om.z)*(dd/(dd + reach)); TT[2] = rk; timeToPointQ(om, o.prm, o.fac); tt = TT[0]; }
      // a lofted ball over him: he cannot play it until it drops (the landing zone only); where the receiver meets
      // it, he has to get there before the receiver
      const mg = atMeet ? tt - tMeet : tt - tb;
      if (mg < margin){ margin = mg; who = o.id; mx = x; mz = z; }
    }
  }
  out.margin = margin; out.intercepts = who; out.x = mx; out.z = mz;
  let rc = 1;
  if (recv){
    const pr = pressureOn(ms, recv);
    const C = BRAIN.RECV_CTRL;
    // his touch quality on it (zone.js q: his control rating, the ball's speed on arrival over his comfortable speed vc,
    // the pressure on him and his breath), the same q the first touch is played with
    const vEnd = ground ? Math.max(0, v0 - 1.1*tArrive0) : v0*0.7;
    const qq = zoneQ(recv, vEnd, pr, breathOf(recv));
    rc = clamp(C[0] + C[1]*qq - C[2]*pr, C[3], C[4]);
    if (ms.onRecv) ms.onRecv(recv, qq, rc, ground);
    // a dropping ball is harder to bring down than one along the grass, and one he cannot get under bounces on
    if (!ground){ rc *= BRAIN.LOFT_CTRL; if (tMeet > tArrive + 0.4) rc *= 0.75; }
    if (!Number.isFinite(tArrive)) rc = 0;
  }
  out.recvCtrl = rc;
  out.pLane = sigmoid((margin - 0.05)/0.12);
  out.pOK = out.pLane*rc;
  return out;
}

// an opponent's reach at a pass's lane (P2b-B): the control zone's R for the ball as it comes past him, at the lane's
// point nearest him (along), with the height and speed it has there (a ground pass rolling, a lofted one coming down)
const LB = {p: {x: 0, y: 0, z: 0}, v: {x: 0, y: 0, z: 0}};
function laneReach(ms, o, from, ux, uz, along, v0, ground, roll){
  let v = v0*0.7;
  if (ground){ RQT[0] = v0; RQT[1] = Math.max(0.01, along); RQT[2] = roll; RQT[3] = 1; rollTimeQ(); const t = RQT[0]; v = Number.isFinite(t) ? Math.max(0, v0 - roll*t) : 0; }
  LB.p.x = from.x + ux*along; LB.p.y = R; LB.p.z = from.z + uz*along;
  LB.v.x = ux*v; LB.v.y = 0; LB.v.z = uz*v;
  const r = zoneR(o, LB, ms);
  if (ms.onReach) ms.onReach(o, LB, r);
  return r;
}
// the angle (radians, 0 to PI) between a man's facing and the way to a point: 0 in front of him, PI behind
function relAngle(a, x, z){
  const f = a.m.yaw, fx = -sin(f), fz = -cos(f), dx = x - a.m.x, dz = z - a.m.z;
  return Math.abs(atan2(fx*dz - fz*dx, fx*dx + fz*dz));
}

// The value of a pass (3.2.3): pOK x xT(arrival) - (1 - pOK) x 0.6 x xT for the opponents where it is lost. Lost in the
// lane (an interception) is a turnover where it is cut out; lost at the receiver's feet (a poor touch, pOK's control
// part) usually stays a contest at the arrival point, so it costs half as much. Both sides' values carry the worth of
// simply having the ball (BRAIN.POSS, see poss below).
export function passValue(ms, team, pm, ax, az){
  const L = ms.spec.L, Wd = ms.spec.Wd;
  const ua = uOf(ms, team, ax), wa = wOf(ms, team, az);
  const lostLane = 1 - pm.pLane, lostCtl = Math.max(0, pm.pLane - pm.pOK);
  return pm.pOK*poss(ua, wa, L, Wd) - lostLane*lose(L - uOf(ms, team, pm.x), Wd - wOf(ms, team, pm.z), L, Wd, 1)
    - lostCtl*lose(L - ua, Wd - wa, L, Wd, 0.5);
}
// The worth of having the ball at (u, w) of the team frame: the value surface xT plus a constant for possession itself,
// plus the threat of a cross from the wide channels of the final third. xT alone is nearly flat outside shooting range
// (0.8 x the 0.01 floor of the xG formula), which made a 50% long ball worth more than keeping the ball, and it has
// nothing for the wings (a narrow angle on goal), which kept every attack in the middle; real teams value both.
export const poss = (u, w, L, Wd) => xT(u, w, L, Wd) + BRAIN.POSS
  + BRAIN.CROSS_T*clamp((u - (L - BRAIN.CROSS_ZONE[0]))/BRAIN.CROSS_ZONE[1], 0, 1)*clamp((Math.abs(w - Wd/2) - BRAIN.CROSS_ZONE[2])/BRAIN.CROSS_ZONE[3], 0, 1);
// what losing it at (u, w) of the opponents' frame costs: 0.6 x their surface plus their possession (k: the share of
// a clean turnover, 0.5 for a ball that is only contested)
const lose = (u, w, L, Wd, k) => k*(0.6*xT(u, w, L, Wd) + BRAIN.POSS);

// The player's preference (3.2.4): a team-mate likes the pass to him a little more when the chemistry and trust are
// good and when he has just called for it; applied only when his pass is worth at least 0.75 of the best and he is
// onside as perceived. Capped -0.10..+0.25, and clamped to nothing while preference decides more than 25% of the passes
// he receives over 10 minutes of match time. Returns the factor (1 when it does not apply).
export function playerPreference(ms, carrier, V, best){
  const me = ms.me >= 0 ? ms.agents[ms.me] : null, cfg = ms.cfg.me;
  if (!me || !cfg || carrier.team !== me.team || carrier === me || ms.cfg.prefOff) return 1;
  if (!(best > 0) || V < BRAIN.PREF_GATE*best) return 1;
  if (ms.pref.capped) return 1;
  const chem = cfg.chem != null ? cfg.chem : 50, trust = cfg.trust != null ? cfg.trust : 20;
  const c = ms.call && ms.call.agent === me.id && ms.t - ms.call.t < BRAIN.CALL_T ? ms.call.k : 0;
  const p = clamp((chem - 50)/250 + (trust - 20)/400 + c*0.15*(0.6 + 0.4*chem/100), BRAIN.PREF_CAP[0], BRAIN.PREF_CAP[1]);
  return 1 + p;
}
// The player's call (R, U10) as the carrier weighs it: while it stands (CALL_T), a pass to him that is on (pOK at least
// CALL_ON[0], fully at CALL_ON[1]) and not to a man he sees offside gains CALL_ADD of the best option's worth. Additive,
// so a pass that is worth little is still worth little against a clear chance (he still shoots when he should), and a
// pass that is not on gains nothing (no forced, impossible pass). The preference cap (prefCapUpdate) is about the
// unasked bias of chemistry and trust; a call is the player asking, so it is heard every time
export function callPull(ms, carrier, o, best){
  const me = ms.me >= 0 ? ms.agents[ms.me] : null;
  if (!me || !o || o.recv !== me.id || o.off || carrier.team !== me.team || carrier === me) return 0;
  if (!(ms.call && ms.call.agent === me.id && ms.t - ms.call.t < BRAIN.CALL_T)) return 0;
  const pOK = o.pOK != null ? o.pOK : 0, k = clamp((pOK - BRAIN.CALL_ON[0])/(BRAIN.CALL_ON[1] - BRAIN.CALL_ON[0]), 0, 1);
  return k > 0 ? k*(ms.call.k || 1)*BRAIN.CALL_ADD*Math.max(Math.abs(best), BRAIN.POSS) : 0;
}
// the rolling cap: decided/received over the last 10 match minutes
function prefCapUpdate(ms){
  const P = ms.pref, win = BRAIN.PREF_WIN/ms.clock.rate;      // 10 match minutes in sim seconds
  const t0 = ms.t - win;
  while (P.log.length && P.log[0].t < t0) P.log.shift();
  let dec = 0, rec = 0;
  for (const e of P.log){ if (e.k === 'd') dec++; else rec++; }
  const was = P.capped;
  P.capped = rec >= 4 && dec/rec > BRAIN.PREF_SHARE;
  if (P.capped && !was) P.capEvents++;
}

/* ---------- who goes for the ball (3.2.5 interceptions, 3.1.2) ---------- */

const FR = {m: null, prm: null, fac: null, react: 0, reachY: 0.6, reach: 0.6};
// tMax: only a reach sooner than this matters (the path is searched that far; null means later than that)
function reachOf(ms, a, reachY, react = a.react, tMax = Infinity){
  FR.m = a.m; FR.prm = a.prm; FR.fac = a.fac; FR.react = react; FR.reachY = reachY; FR.reach = a.isGK ? 1.2 : 0.6;
  const nMax = tMax < Infinity ? Math.min(ms.predN, Math.ceil(tMax*30) + 2) : ms.predN;
  const fr = firstReach(ms.pred, nMax, FR);
  if (fr || ms.predN <= 0 || nMax < ms.predN) return fr;
  // beyond the path's 3 s horizon: the ball rests (or still rolls) at its last sample, and he gets there when he can
  const n = ms.predN, o = 4*(n - 1), P = ms.pred;
  if (!(P[o + 1] <= reachY)) return null;
  const x = P[o], z = P[o + 2], d = hypot(x - a.m.x, z - a.m.z), r = FR.reach;
  let t = react;
  if (!(d <= r)){ TT[0] = a.m.x + (x - a.m.x)*(1 - r/d); TT[1] = a.m.z + (z - a.m.z)*(1 - r/d); TT[2] = react; timeToPointQ(a.m, a.prm, a.fac); t = TT[0]; }
  return {t: Math.max(P[o + 3], t), x, y: P[o + 1], z};
}

// A lower bound of reachOf's time, cheap: the time of the sample before the first one no run of his could be at
// sooner (firstReach's own early-out, without asking timeToPoint), or beyond the horizon the last sample's.
// (tMin(d), the fastest run to d, and the length are written out: a closure a call and a boxed number a sample were
// garbage every step a ball is loose, 3.9.6)
function reachLB(ms, a, reachY, react){
  const P = ms.pred, n = ms.predN, m = a.m, prm = a.prm, fac = a.fac;
  if (n <= 0) return 0;
  const vTop = Math.max(0.1, sprintSpeed(prm, fac || undefined)), v0 = Math.min(m.speed || 0, vTop);
  const a0 = Math.max(0.1, prm.a0*(fac && fac.accel != null ? fac.accel : 1)), t1 = (vTop - v0)/a0, d1 = (v0 + vTop)*0.5*t1;
  const reach = a.isGK ? 1.2 : 0.6;
  for (let k = 0; k < n; k++){
    const o = 4*k;
    if (!(P[o + 1] <= reachY)) continue;
    const ex = P[o] - m.x, ez = P[o + 2] - m.z, d = Math.max(0, Math.sqrt(ex*ex + ez*ez) - reach);
    if (P[o + 3] >= react + (d <= d1 ? (Math.sqrt(v0*v0 + 2*a0*d) - v0)/a0 : t1 + (d - d1)/vTop) - 1e-9) return k > 0 ? P[o - 1] : 0;
  }
  const o = 4*(n - 1);
  if (!(P[o + 1] <= reachY)) return Infinity;
  const ex = P[o] - m.x, ez = P[o + 2] - m.z, d = Math.max(0, Math.sqrt(ex*ex + ez*ez) - reach);
  return Math.max(P[o + 3], react + (d <= d1 ? (Math.sqrt(v0*v0 + 2*a0*d) - v0)/a0 : t1 + (d - d1)/vTop));
}

// Assign one side's ball plans: the intended receiver goes to meet his pass; whoever gets to a loose ball first goes
// for it (an opponent who beats the receiver to it intercepts); a high ball is headed by the first head to it. The
// two sides are planned on consecutive steps (brainStep). Only the candidates whose lower bound could still win are
// worked out exactly (nearest first): the plans are the same as working out all eleven. The path cache may be a few
// steps old: its times run from ms.predT, so everyone's reaction carries that age and the plan's times are from now.
const CAND = [];
function ballPlans(ms, team){
  const b = ms.ball, ctl = ms.poss.ctl;
  // whoever was already going for it has reacted: his new estimate carries no second reaction time. (The player's own
  // plan is his: control.js keeps his 'receive' and the first-time strike queued on it, plan.first, to the contact;
  // P2-A, ball-1)
  for (const a of ms.agents){
    if (a.team !== team || a.isMe && !ms.meAI) continue;
    a.wasOn = false;
    if (a.plan && (a.plan.kind === 'chase' || a.plan.kind === 'receive' || a.plan.kind === 'intercept')){ a.wasOn = true; a.plan = null; }
  }
  if (ctl >= 0 || b.state !== 'free' || ms.phase !== 'live') return;
  const age = Math.max(0, ms.t - ms.predT);
  const pass = ms.chain.pass && !ms.chain.pass.res ? ms.chain.pass : null;
  const recv = pass && pass.recv >= 0 ? ms.agents[pass.recv] : null;
  const best = [null, null], bestT = [Infinity, Infinity], bestR = [null, null];
  const heads = [null, null], headT = [Infinity, Infinity], headR = [null, null];
  let recvR = null;
  CAND.length = 0;
  for (const a of ms.agents){
    if (a.team !== team) continue;
    if (!a.onPitch || a.role !== 'player' || a.leaving || a.sentOff || a.state === 'ground') continue;
    if (a.isGK && a.gk && a.gk.state !== 'ready' && a.gk.state !== 'set' && a.gk.state !== 'sweep') continue;
    if (a.isMe && !ms.meAI) continue;
    if (a.id === b.last.agent && ms.t - b.last.t < 0.3 && b.last.kind !== 'control') continue;
    const s = a.scale || 1, hy = 2.05*s + jumpHeight(a.at.jumping);
    CAND.push({a, lb: reachLB(ms, a, 1.45*s, (a.wasOn ? 0 : a.react) + age), hlb: a.isGK ? Infinity : reachLB(ms, a, hy, a.react + age), hy});
  }
  CAND.sort((p, q) => p.lb - q.lb || p.a.id - q.a.id);
  // the highest the ball gets on its path: a header reach can only be taken above head height (hr.y > 1.35 x scale,
  // and a reach is at or between samples), so a ball that stays below it is not searched for heads at all
  let maxY = -Infinity;
  for (let k = 0; k < ms.predN; k++){ const y = ms.pred[4*k + 1]; if (y > maxY) maxY = y; }
  for (const c of CAND){
    const a = c.a, tm = a.team, s = a.scale || 1;
    // can he still matter: first to it (or the receiver within 0.4 s of the first), or a header before both
    const needFoot = a === recv || c.lb <= bestT[tm];
    const needHead = c.hlb < headT[tm] + 1e-9 && c.hlb < bestT[tm] + 0.3;
    if (!needFoot && !needHead) continue;
    // the path is searched only as far as a reach could still matter (the best so far; the receiver 0.45 s past it)
    const fr = reachOf(ms, a, 1.45*s, (a.wasOn ? 0 : a.react) + age, bestT[tm] + (a === recv ? 0.45 : 1e-6));
    if (fr && (fr.t < bestT[tm] || fr.t === bestT[tm] && best[tm] && a.id < best[tm].id)){ bestT[tm] = fr.t; best[tm] = a; bestR[tm] = fr; }
    if (a === recv) recvR = fr;
    // a header: the ball is up and first reachable with the head
    if (needHead && !a.isGK && maxY > 1.35*s && (!fr || fr.y > 1.3 || fr.t > 0.8)){
      const hr = reachOf(ms, a, c.hy, a.react + age, Math.min(headT[tm], bestT[tm] + 0.3));
      if (hr && hr.y > 1.35*s && (!fr || hr.t < fr.t - 0.15) && (hr.t < headT[tm] || hr.t === headT[tm] && heads[tm] && a.id < heads[tm].id)){ headT[tm] = hr.t; heads[tm] = a; headR[tm] = hr; }
    }
  }
  // the receiver: his own pass, unless a team-mate is much nearer to it
  let who = best[team], fr = bestR[team];
  if (recv && recv.team === team && recvR && (!who || recvR.t <= bestT[team] + 0.4)){ who = recv; fr = recvR; }
  // a pass to the player (P2-A, AI-2): it is his to play, so his team-mates leave it to him (no chase, no header) while
  // he can get to it on its way, unless one of them is clearly first, by ME_FIRST s or more. He gets no plan: his reach
  // is worked out as the AI's would be (the receiver's own search, from where he is), only to know whether it is his
  if (recv && recv.isMe && !ms.meAI && recv.team === team && recv.onPitch && !recv.sentOff){
    const s = recv.scale || 1, mr = reachOf(ms, recv, 1.45*s, recv.react + age, Infinity);
    const mates = Math.min(bestT[team], headT[team]);
    if (mr && !(mates + BRAIN.ME_FIRST < mr.t)){ standDown(ms, team, null); return; }
  }
  const hd = heads[team];
  if (hd && headR[team] && (!fr || headR[team].t + 0.1 < fr.t)){
    const hr = headR[team];
    standDown(ms, team, hd);
    planHeader(ms, hd, {t: Math.max(0, hr.t - age), x: hr.x, y: hr.y, z: hr.z});
    return;
  }
  if (!who || !fr) return;
  if (who.isMe && !ms.meAI) return;
  const kind = recv === who ? 'receive' : (recv && recv.team !== team ? 'intercept' : 'chase');
  standDown(ms, team, who);
  who.plan = {kind, x: fr.x, z: fr.z, t: Math.max(0, fr.t - age), y: fr.y, at: ms.t, first: null, push: null};
  planFirst(ms, who);
}

// (P6-B) one man of a side goes for a loose ball: when the side's plan now sends someone else (or leaves it to the
// player), a team-mate still running to meet it with his head from an earlier plan stands down, unless he has already
// left the ground for it. (A header plan used to outlive the plan that replaced it: two of a side went for one ball.)
// Training Mode's scenarios only: the 11-a-side calibration (the harness bands) was fitted with it as it was
function standDown(ms, team, keep){
  if (ms.mode !== 'train') return;
  for (const a of ms.agents) if (a.team === team && a !== keep && a.plan && a.plan.kind === 'header' && !a.act) a.plan = null;
}
// a header plan: run to the spot, jump to meet it near the apex; at the attackers' end a header at goal, at the
// defenders' a clearance, otherwise a header pass
function planHeader(ms, a, hr){
  if (a.act || ms.t < (a.cool.header || 0)) return;
  a.plan = {kind: 'header', x: hr.x, z: hr.z, t: hr.t, y: hr.y, at: ms.t};
  const dir = ms.dirs[a.team], gx = dir*ms.spec.hx;
  const dGoal = hypot(gx - hr.x, hr.z), ownEnd = dir*hr.x < -ms.spec.hx + 22;
  let intent = 'pass', target = null;
  if (dGoal < 16 && goalOn(ms, a.team)){ intent = 'attack'; target = {x: gx, y: 0.6 + ms.r()*1.4, z: (ms.r() - 0.5)*5.4}; }
  else if (ownEnd) intent = 'clear';
  else {
    // a header on to the best placed team-mate within 20 m
    let best = null, bv = -1;
    for (const o of ms.agents){
      if (o.team !== a.team || o === a || !o.onPitch || o.isGK) continue;
      const d = hypot(o.m.x - hr.x, o.m.z - hr.z);
      if (d < 4 || d > 20) continue;
      const v = valueAt(ms, a.team, o.m.x, o.m.z) - 0.002*d;
      if (v > bv){ bv = v; best = o; }
    }
    if (best) target = {x: best.m.x, z: best.m.z}; else intent = 'clear';
  }
  a.plan.hdr = {intent, target};
}

// what a receiver or chaser does on arrival: at goal in the box, a first-time shot; else he controls it, pushing it
// into the space away from his nearest opponent and toward their goal
function planFirst(ms, a){
  const p = a.plan, dir = ms.dirs[a.team], gx = dir*ms.spec.hx;
  const dGoal = hypot(gx - p.x, p.z);
  // (P7-A) a free kick's part: the man the routine plays it to strikes it first time, or takes it on into space
  if (a.fkNext && ms.restart !== a.fkNext.R0 && a.plan.kind === 'receive'){
    if (a.fkNext.kind === 'shoot' && p.y < 0.9){
      const tz = (ms.r() < 0.5 ? -1 : 1)*(3.66 - 0.5);
      p.first = {kind: 'shot', target: {x: gx, y: 0.5 + ms.r()*0.9, z: tz}, power: 0.88, contact: 0, firstTime: true};
      a.fkNext = null;
      return;
    }
    if (a.fkNext.kind === 'carry'){ p.push = {x: dir, z: 0}; return; }
  }
  if (dGoal < 13 && p.y < 0.9 && a.plan.kind !== 'intercept' && goalOn(ms, a.team)){
    const xg = xgAt(ms, a.team, p.x, p.z);
    if (xg > 0.11 && ms.r() < 0.55 + xg){
      const tz = (ms.r() < 0.5 ? -1 : 1)*(3.66 - 0.55);
      p.first = {kind: 'shot', target: {x: gx, y: 0.4 + ms.r()*0.6, z: tz}, power: 0.82, contact: 0, firstTime: true};
      return;
    }
  }
  // the push: forward (toward their goal), away from the nearest opponent
  let ox = 0, oz = 0, nd = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch) continue;
    const d = hypot(o.m.x - p.x, o.m.z - p.z);
    if (d < nd){ nd = d; ox = o.m.x; oz = o.m.z; }
  }
  // in his own box with a man on him: no time to bring it down, it is cleared first time, high and wide
  const own = -dir*p.x > ms.spec.hx - 18 && Math.abs(p.z) < 22;
  if (own && !a.isGK && p.kind !== 'receive' && nd < BRAIN.CLEAR_FIRST[0] && ms.r() < BRAIN.CLEAR_FIRST[1]){
    const sz = p.z >= 0 ? 1 : -1, ogx = -dir*ms.spec.hx;
    // close to his own goal line with the man right on him: safety first, out toward the corner flag (a corner or a
    // throw costs less than a chance); further out, high and wide up the pitch
    const deep = Math.abs(ogx - p.x) < BRAIN.CLEAR_FIRST[4] && nd < BRAIN.CLEAR_FIRST[5];
    // (P6-B) a cage's fence gives the ball back: no aiming it out of play there, and in Training Mode never past the
    // far lines (a cage's pitch is short; a match keeps its calibrated clearance)
    const fx = p.x + dir*BRAIN.CLEAR_FIRST[2];
    const target = deep && !rebound(ms) ? {x: ogx - dir*2, y: R, z: sz*(ms.spec.hz + 4)}
      : {x: ms.mode === 'train' ? clamp(fx, -ms.spec.hx + 2, ms.spec.hx - 2) : fx, y: R, z: sz*Math.max(2, ms.spec.hz - 5)};
    p.first = {kind: 'clear', target, contact: 1, speed: BRAIN.CLEAR_FIRST[3], firstTime: true};
    return;
  }
  let px = dir, pz = 0;
  if (nd < 6){ const ax = p.x - ox, az = p.z - oz, al = hypot(ax, az) || 1; px += 1.2*ax/al; pz += 1.2*az/al; }
  const pl = hypot(px, pz) || 1;
  p.push = {x: px/pl, z: pz/pl};
}

/* ---------- the carrier (3.2.3) ---------- */

// The options of the man on the ball and their values; picks one by the softmax (with the preference applied, and
// counted when it changed the choice). Returns an Action, or a movement choice {kind: 'dribble'|'hold'|'shield', dir}.
export function decideCarrier(ms, a){
  const g = carrierOptions(ms, a);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
// The carrier's evaluation as a sequence of slices (a generator): it yields after each team-mate's passes and after the
// crosses, so brainStep can spread one decision over a few steps (BRAIN.EVAL_SLICE slices a step) within the step
// budget; decideCarrier runs it through at once.
function* carrierOptions(ms, a){
  const team = a.team, dir = ms.dirs[team], L = ms.spec.L, Wd = ms.spec.Wd, m = a.m, at = a.at;
  const tm = ms.tm[team], tempo = ms.cfg.tempo || {}, style = tm.style || {};
  const u = uOf(ms, team, m.x), w = wOf(ms, team, m.z);
  const here = poss(u, w, L, Wd);
  const press = pressureOn(ms, a);
  // the lanes start where the ball is (at his feet, a stride ahead of his body), not at his body
  const bp = ms.ball.p, org = ms.ball.state === 'free' && hypot(bp.x - m.x, bp.z - m.z) < 1.5 ? bp : m;
  const opts = [];
  const add = (o) => { if (Number.isFinite(o.V)) opts.push(o); };
  // 1. a shot
  const gx = dir*ms.spec.hx, dGoal = hypot(gx - m.x, m.z);
  // the harness's stand-in for the player (meAI, a forward or a ten) shoots when he can, as a player chasing his own
  // chances does
  const meT = a.isMe && ms.meAI ? BRAIN.ME[a.arch] : null, meShot = !!meT && meT.shoot > 1;
  const goal = goalOn(ms, team);
  if (goal && dGoal < (meShot ? BRAIN.ME_RANGE : 34)){
    const xg = xgAt(ms, team, m.x, m.z);
    const bias = (a.arch === 'DF' || a.arch === 'CM' ? 0.85 : 1)*(tempo.shotBias || 1)*(tm.lateShot || 1)*(meShot ? meT.shoot : 1);
    // (U9) square on, from the edge of the box and the D, a shot is the thing to do; from a wide angle at range it is not
    const lat = Math.abs(m.z), S9 = BRAIN.SIGHT;
    const sight = lat <= S9[0] && dGoal >= S9[1] && dGoal <= S9[2] ? S9[3] : lat > S9[0] && dGoal > S9[4] ? S9[5] : 1;
    const V = xg*(0.6 + 0.6*at.accuracy/100)*bias*sight;
    add({kind: 'shot', V, xg});
  }
  // 2. passes, through balls and crosses to every team-mate
  let bestPass = 0;
  const directMul = (tempo.directness || 1.25) + (style.directness || 0.5) - 0.5 + (tm.lateDirect || 0);
  const vision = at.vision;
  const offErr = 0.6*(1 - vision/120), offOn = lawOf(ms, 'offside');
  // the player's "In behind!" call (below) is seen against the same perceived line as any run (P2-A, ball-10)
  const caller = ms.call && ms.call.how === 'behind' && ms.t - ms.call.t < BRAIN.CALL_T && ms.call.point ? ms.call.agent : -1;
  let callerOff = false;
  for (const o of ms.agents){
    if (o.team !== team || o === a || !o.onPitch || o.role !== 'player' || o.leaving || o.sentOff) continue;
    const om = o.m;
    if (o.isGK && !(u < L*0.3 && press > 0.4)) continue;
    // perceived offside: the receiver's margin seen with an error (nobody is offside when the law is not played)
    // ((P6-B) past the real halfway line, the law's own: a cage's area is only part of the pitch, and the middle of a
    // Half cage is not halfway; on a whole pitch the two are the same)
    const seenOff = offOn && offsidePosition(ms, o, team).margin + offErr*gauss(ms.r) > RULES.OFF.eps && uOf(ms, team, om.x) > halfwayU(ms.spec, dir);
    if (o.id === caller) callerOff = seenOff;
    // a pass to his feet (a little ahead of where he is going)
    const tx = clamp(om.x + om.vx*0.35, -ms.spec.hx + 1, ms.spec.hx - 1), tz = clamp(om.z + om.vz*0.35, -ms.spec.hz + 1, ms.spec.hz - 1);
    const d = hypot(tx - m.x, tz - m.z);
    // (P6-B) the player himself is weighed at any distance (he sees the user: a pass to him is always one of the
    // options, valued by the same pass model); the AI stand-in of the harness keeps the AI's own range. Out of the
    // range any team-mate is passed to (closer than PASS_MIN, further than PASS_MAX) it is made only when he calls
    // for it (onCall: the softmax leaves it out otherwise), so he is never given a ball an AI player in his place
    // would not get, and never from point-blank range (near: CALL_MIN)
    const meOpt = o.isMe && !ms.meAI, inRange = d >= BRAIN.PASS_MIN && d <= BRAIN.PASS_MAX;
    if (inRange || meOpt && d >= 1){
      const v0 = passSpeedFor(d, 9, ms.ball.rollDecel);
      let pm = passModel(ms, org, {x: tx, z: tz}, 'pass', v0, o);
      let kind = 'pass', pOK = pm.pOK, spd = v0;
      let V0 = passValue(ms, team, pm, tx, tz);
      if (pm.pOK < 0.6 && d > BRAIN.LOB_MIN){
        const vL = loftSpeedFor(d), pl = passModel(ms, org, {x: tx, z: tz}, 'lob', vL, o, {pOK: 0, tArrive: 0, intercepts: -1, margin: 0, x: 0, z: 0, recvCtrl: 1, pLane: 0});
        const VL = passValue(ms, team, pl, tx, tz);
        if (VL > V0){ kind = 'lob'; pOK = pl.pOK; spd = vL; V0 = VL; }
      }
      const ua = uOf(ms, team, tx);
      let V = V0;
      if (ua - u > 15) V *= directMul;
      // perceived offside: x0.1, and the free kick it gives away is a turnover where he stands
      if (seenOff) V = (V > 0 ? V*0.1 : V) - lose(L - uOf(ms, team, om.x), Wd - wOf(ms, team, om.z), L, Wd, 1);
      add({kind, V, recv: o.id, target: {x: tx, y: R, z: tz}, speed: kind === 'pass' ? undefined : spd, contact: kind === 'lob' ? 1 : 0, off: seenOff, pOK, isMe: o.isMe, onCall: !inRange,
        near: !inRange && (d < BRAIN.CALL_MIN || hypot(om.x - m.x, om.z - m.z) < BRAIN.CALL_MIN)});
      if (V > bestPass && inRange) bestPass = V;
    }
    // a through ball to a runner already on his way, or into the space a runner holding the line is about to attack
    const fwd = dir*om.vx, run = o.task.run, holding = !!run && !run.go && ms.t < run.until;
    if ((fwd > 3 && om.speed > 3.5 || holding) && !seenOff){
      let t = 1.0, px = om.x, pz = om.z;
      if (holding){ px = run.x; pz = run.z; }
      else for (let i = 0; i < BRAIN.THROUGH_ITERS; i++){
        px = om.x + om.vx*t; pz = om.z + om.vz*t;
        const dd = hypot(px - m.x, pz - m.z);
        t = flightTime('through', dd, passSpeedFor(dd, BRAIN.THROUGH_ARRIVE, ms.ball.rollDecel), ms.ball.rollDecel);
        if (!Number.isFinite(t)) break;
      }
      px = clamp(px, -ms.spec.hx + 2, ms.spec.hx - 2); pz = clamp(pz, -ms.spec.hz + 1.5, ms.spec.hz - 1.5);
      const dd = hypot(px - m.x, pz - m.z);
      if (Number.isFinite(t) && dd > 8 && dd < 45){
        const v0 = passSpeedFor(dd, BRAIN.THROUGH_ARRIVE, ms.ball.rollDecel);
        const pm = passModel(ms, org, {x: px, z: pz}, 'through', v0, o);
        const ua = uOf(ms, team, px);
        let V = passValue(ms, team, pm, px, pz);
        if (ua - u > 15) V *= directMul;
        add({kind: 'through', V, recv: o.id, target: {x: px, y: R, z: pz}, pOK: pm.pOK, isMe: o.isMe});
        if (V > bestPass) bestPass = V;
      }
    }
    yield;
  }
  // the player's own "In behind!" call: the look ground point as a through-ball option. Never to a caller the passer
  // sees offside as it is played (the law judges where he is at the pass, not where he will be met), as for any run
  if (caller >= 0 && !callerOff){
    const me = ms.agents[caller];
    if (me && me.team === team && me !== a){
      const P = ms.call.point, dd = hypot(P.x - m.x, P.z - m.z);
      if (dd > 6 && dd < 45){
        const v0 = passSpeedFor(dd, BRAIN.THROUGH_ARRIVE, ms.ball.rollDecel);
        const pm = passModel(ms, org, P, 'through', v0, me);
        const V = passValue(ms, team, pm, P.x, P.z);
        add({kind: 'through', V, recv: me.id, target: {x: P.x, y: R, z: P.z}, pOK: pm.pOK, isMe: true, call: true});
      }
    }
  }
  // 3. a cross from wide in the final third
  if (goal && u > L - BRAIN.CROSS_FROM[0] && Math.abs(m.z) > ms.spec.hz - BRAIN.CROSS_FROM[1] && dGoal > 9){
    const side = m.z > 0 ? 1 : -1;
    const zones = [[gx - dir*5.5, side*2.5, 'near'], [gx - dir*11, 0, 'spot'], [gx - dir*6, -side*4, 'far']];
    for (const [zx, zz, nm] of zones){
      // who of ours gets there by the time the cross does (attackers wait onside and attack it as it is struck), and
      // how many of theirs are there first
      const dd = hypot(zx - m.x, zz - m.z), tf = flightTime('cross', dd, loftSpeedFor(dd), ms.ball.rollDecel);
      let ours = 0, theirs = 0;
      for (const o of ms.agents){
        if (!o.onPitch || o.role !== 'player' || o.isGK || o === a) continue;
        const d = hypot(o.m.x - zx, o.m.z - zz);
        if (d > 18) continue;
        TT[0] = zx; TT[1] = zz; TT[2] = o.react; timeToPointQ(o.m, o.prm, o.fac);
        const t = TT[0];
        if (o.team === team){ if (t <= tf + BRAIN.CROSS_RUN) ours++; }
        else if (t <= tf) theirs++;
      }
      if (!ours) continue;
      const q = BRAIN.CROSS_V*xgGeo(dir*(gx - zx), dir*zz)*clamp(0.5 + 0.25*ours - 0.12*theirs, 0.1, 1);
      // a cross from near the byline (pulled back across the face of goal) is worth more than one from deep, where
      // the keeper and the defenders see it coming: a winger with room goes on toward the line first
      const depth = BRAIN.CROSS_DEEP + (1 - BRAIN.CROSS_DEEP)*clamp((u - (L - BRAIN.CROSS_FROM[0]))/(BRAIN.CROSS_FROM[0] - 10), 0, 1);
      const V = q*depth*clamp(0.55 + 0.45*at.passAcc/100, 0, 1);
      add({kind: 'cross', V, recv: -1, target: {x: zx, y: 1.6, z: zz}, contact: 1, speed: loftSpeedFor(dd), zone: nm});
    }
    yield;
  }
  // 4. dribble: 7 directions, the best one is the option (the direction is a sub-choice, so seven near-equal lines
  // do not crowd the passes out of the softmax); losing it costs what the opponents would make of it here, and the
  // carry takes time the defence uses (DRIB_K)
  const drib = at.dribbling;
  const loseHere = lose(L - u, Wd - w, L, Wd, 1);
  let bestDrib = null;
  for (let i = 0; i < BRAIN.DRIB_DIRS; i++){
    const ang = (-90 + 30*i)*DEG;
    const ddx = dir*cos(ang), ddz = sin(ang)*dir;
    const px = m.x + ddx*BRAIN.DRIB_LEN, pz = m.z + ddz*BRAIN.DRIB_LEN;
    if (Math.abs(px) > ms.spec.hx - 1.5 || Math.abs(pz) > ms.spec.hz - 1.5) continue;
    let space = 30, tk = 50;
    for (const o of ms.agents){
      if (o.team === team || o.team < 0 || !o.onPitch) continue;
      const d = Math.min(hypot(o.m.x - px, o.m.z - pz), hypot(o.m.x - (m.x + ddx*2.5), o.m.z - (m.z + ddz*2.5)));
      if (d < space){ space = d; tk = o.at.tackling; }
    }
    const pBeat = sigmoid((drib - tk)/12 + (space - 2)/1.5);
    let V = BRAIN.DRIB_K*(pBeat*poss(uOf(ms, team, px), wOf(ms, team, pz), L, Wd) - (1 - pBeat)*loseHere);
    if (meT && meT.dribble > 1 && V > 0){
      V *= meT.dribble;
      // in their half he drives at goal: the line toward it is the one he likes
      if (u > L/2){ const gl = hypot(gx - m.x, m.z) || 1, c = (ddx*(gx - m.x) + ddz*(0 - m.z))/gl; if (c > 0) V *= 1 + BRAIN.ME_DRIVE*c; }
    }
    if (!bestDrib || V > bestDrib.V) bestDrib = {kind: 'dribble', V, dir: {x: ddx, z: ddz}, space, pBeat};
  }
  // a take-on: a forward line (within 60 degrees of straight at goal) past a man close in front of him (within 50
  // degrees of it): he bursts by him rather than carrying it into him
  if (bestDrib && bestDrib.dir.x*dir >= 0.5){
    for (const o of ms.agents){
      if (o.team === team || o.team < 0 || !o.onPitch || o.isGK) continue;
      const ox = o.m.x - m.x, oz = o.m.z - m.z, od = hypot(ox, oz);
      if (od > BRAIN.TAKE_ON || ox*dir < 0.3) continue;
      const along = (ox*bestDrib.dir.x + oz*bestDrib.dir.z)/(od || 1);
      if (along > 0.64){ bestDrib.takeOn = true; break; }
    }
  }
  if (bestDrib) add(bestDrib);
  // 4b. a long ball: pressed in his own half, he can always hit it long to his most advanced man (contested where it
  // comes down, so a lost one is only half a turnover, and far from his own goal)
  if (u < L*BRAIN.LONG[0] && press > BRAIN.LONG[1]){
    const fwd = forwardTarget(ms, a, BRAIN.LONG[2], BRAIN.LONG[3]), o = fwd.id >= 0 ? ms.agents[fwd.id] : null;
    if (o){
      const tx = clamp(o.m.x + dir*2, -ms.spec.hx + 3, ms.spec.hx - 3), tz = clamp(o.m.z, -ms.spec.hz + 2, ms.spec.hz - 2);
      const dd = hypot(tx - m.x, tz - m.z);
      if (dd > BRAIN.LOB_MIN){
        const vL = loftSpeedFor(dd), pm = passModel(ms, org, {x: tx, z: tz}, 'lob', vL, o, LBM);
        const ua = uOf(ms, team, tx), wa = wOf(ms, team, tz);
        const V = pm.pOK*poss(ua, wa, L, Wd) - (1 - pm.pOK)*lose(L - ua, Wd - wa, L, Wd, 0.5);
        add({kind: 'lob', V, recv: o.id, target: {x: tx, y: R, z: tz}, speed: vL, contact: 1, pOK: pm.pOK, isMe: o.isMe, long: true});
      }
    }
  }
  // 5. a clearance from around his own box under pressure: up the pitch toward the touchline on his side
  if (u < BRAIN.CLEAR[0] && press > BRAIN.CLEAR[1]){
    // (up to 50 m short of their goal line; P6-B: on a pitch shorter than that, a cage's, no further back than halfway)
    const tx = dir*Math.max(ms.spec.hx - 50, 0), tz = (m.z >= 0 ? 1 : -1)*Math.max(2, ms.spec.hz - 10);
    add({kind: 'clear', V: here*BRAIN.CLEAR[2] + 0.004, target: {x: tx, y: R, z: tz}, contact: 1, speed: 26});
  }
  // 5b. safety: pinned in a wide spot near his own goal line with a man on him, he puts it out of play (a corner or a
  // throw costs less than losing it there)
  if (u < BRAIN.SAFETY[0] && press > BRAIN.SAFETY[1] && Math.abs(m.z) > BRAIN.SAFETY[2] && !rebound(ms)){
    const sz = m.z >= 0 ? 1 : -1, byline = u < 9;
    const tx = byline ? -dir*(ms.spec.hx + 3) : m.x + dir*5, tz = byline ? m.z + sz*3 : sz*(ms.spec.hz + 4);
    add({kind: 'clear', V: -BRAIN.SAFETY[3]*(byline ? 1 : 0.4), target: {x: tx, y: R, z: tz}, contact: 0, speed: 15});
  }
  // 6. hold or shield when nothing is worth 0.6 of where he is
  let vmax = 0;
  for (const o of opts) if (o.V > vmax && !o.onCall) vmax = o.V;
  if (vmax < BRAIN.HOLD_K*here){
    // holding it costs nothing unpressed; shielding it under pressure is worth what keeping it is, less the chance he
    // is robbed where he stands: the man on him wins a challenge with the shield formula (TRAINING-SPEC 3, duel.js
    // pShieldLoss: his D against this carrier's S, from behind once the carrier has turned his back to him, their
    // breath), and he gets SHIELD_ENG x the pressure challenges in while the shield is held (P2b-B; ball-4 and AI-1:
    // it read a Strength nobody had)
    if (press > 0.5){
      const op = nearestOpp(ms, a);
      const pL = op ? pShieldLoss(ratings(at, RT1).S, ratings(op.at, RT2).D, shieldAngle(Math.PI), fatigueFactor(breathOf(op), breathOf(a))) : 0;
      const pLose = 1 - pow(1 - pL, BRAIN.SHIELD_ENG*press);
      add({kind: 'shield', V: here*BRAIN.HOLD_K*(1 - pLose) - pLose*loseHere, pLose});
    } else add({kind: 'hold', V: here*BRAIN.HOLD_K});
  }
  if (ms.deadBall){ for (let i = opts.length - 1; i >= 0; i--) if (opts[i].kind === 'dribble' || opts[i].kind === 'hold' || opts[i].kind === 'shield') opts.splice(i, 1); }
  if (!opts.length) return {kind: 'hold'};
  // the softmax, with and without the preference (same draw)
  const T = BRAIN.TEMP*(1 - clamp(at.decision, 0, 119)/120);
  let best = -Infinity;
  for (const o of opts) if (o.V > best && !o.onCall) best = o.V;
  // (Vb: with the bias of chemistry and trust only; Vp: with the player's call heard as well, U10)
  for (const o of opts){
    const toMe = o.isMe && (o.kind === 'pass' || o.kind === 'through' || o.kind === 'lob') && !o.off;
    o.Vb = toMe ? o.V*playerPreference(ms, a, o.V, best) : o.V;
    o.Vp = toMe ? o.Vb + callPull(ms, a, o, best) : o.Vb;
  }
  const draw = ms.r();
  // (an onCall option, a pass to the player out of the usual range, takes part only while his call pulls it: Vp; and
  // never from point-blank range: near)
  const live = (o, key) => !o.onCall || key === 'Vp' && o.Vp > o.Vb && !o.near;
  const pick = (key) => {
    let top = -Infinity, last = null;
    for (const o of opts) if (live(o, key) && o[key] > top) top = o[key];
    const base = Math.max(1e-4, Math.abs(top));
    let sum = 0;
    for (const o of opts){ o.w = live(o, key) ? exp(clamp((o[key] - top)/(base*T), -30, 0)) : 0; sum += o.w; if (o.w > 0) last = o; }
    let acc = draw*sum;
    for (const o of opts){ if (!o.w) continue; acc -= o.w; if (acc <= 0) return o; }
    return last || {kind: 'hold'};
  };
  const chosen = pick('Vp');
  // the QA harness's window on decisions (qa/harness.mjs --decisions); nothing in the game sets it
  if (ms.onDecide) ms.onDecide(a, opts, chosen, u, here, press);
  if (ms.me >= 0 && a.team === ms.agents[ms.me].team){
    // a pass to the player that the values alone would not have made: by the bias (decided, the capped share of
    // 3.2.4), or because he called for it (called: his own doing, counted apart, U10)
    const plain = pick('V');
    if (plain !== chosen && chosen.isMe){
      if (pick('Vb') === chosen){ ms.pref.decided++; ms.pref.log.push({t: ms.t, k: 'd'}); }
      else ms.pref.called = (ms.pref.called || 0) + 1;
    }
  }
  return chosen;
}

// (rating records filled in place: nothing allocated in a step)
const RT1 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0}, RT2 = {c: 0, vc: 0, S: 0, D: 0, T: 0, C: 0};
// the nearest opponent on the pitch to a man (an outfield player or a keeper), or null
function nearestOpp(ms, a){
  let best = null, bd = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch || o.role !== 'player') continue;
    const d = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}

// carry out the carrier's choice
function carrierAct(ms, a, o){
  const dir = ms.dirs[a.team], gx = dir*ms.spec.hx, r = ms.r, at = a.at;
  a.lastChoice = o.kind;
  a.pendKick = null;
  // the shield is his choice until the next one (carrierMove and actions.js carry it out)
  a.intent.shield = o.kind === 'shield';
  const startKick = kickWhenReady;
  switch (o.kind){
    case 'shot': {
      // the corner the keeper covers least, low more often than high; power by distance; a curler from range
      const gk = ms.agents[ms.gks[1 - a.team]];
      const gz = gk ? gk.m.z : 0, mh = 3.66 - (0.35 + 0.35*(1 - at.accuracy/100));
      let side = (0 - gz) >= 0 ? 1 : -1;
      if (r() < 0.3) side = -side;
      const tz = side*mh, high = r() < 0.3, ty = high ? 1.55 + r()*0.5 : 0.3 + r()*0.45;
      const dGoal = hypot(gx - a.m.x, a.m.z);
      const finesse = dGoal > 15 && dGoal < 28 && at.curve > 55 && r() < 0.35;
      const power = clamp(dGoal < 12 ? 0.72 + 0.15*r() : 0.82 + 0.13*r(), 0.5, 0.97);
      startKick(ms, a, {kind: 'shot', target: {x: gx, y: ty, z: tz}, power, contact: high ? 0 : (r() < 0.3 ? -1 : 0), finesse, curl: finesse ? 1 : 0});
      return;
    }
    case 'pass': case 'lob': case 'through': {
      const kind = o.kind === 'lob' ? 'lob' : o.kind;
      const recv = ms.agents[o.recv];
      startKick(ms, a, {kind, target: o.target, recv: o.recv, speed: o.speed, contact: o.contact || 0, pOK: o.pOK});
      return;
    }
    case 'cross':
      startKick(ms, a, {kind: 'cross', target: o.target, recv: -1, speed: o.speed, contact: 1, curl: 0.4});
      return;
    case 'clear':
      startKick(ms, a, {kind: 'clear', target: o.target, recv: -1, speed: o.speed, contact: 1});
      return;
    case 'dribble': {
      const space = o.space || 10;
      const gait = o.takeOn && o.pBeat > 0.45 ? 'sprint' : space > 6 ? 'run' : 'jog';
      // a take-on is a knock past him and a burst: the touches are played for a sprint from the first one
      a.drib = {dx: o.dir.x, dz: o.dir.z, gait, speed: gait === 'sprint' ? 0.6*a.prm.sprint : 0, t: ms.t, commit: gait === 'sprint' ? ms.t + BRAIN.TAKE_ON_T : 0};
      return;
    }
    default:
      a.drib = null; a.hold = o.kind;
  }
}

// A kick the AI has chosen: struck now when the ball is in the strike window (or dead, for a set piece: the run-up
// is the approach), else the carrier first works the ball into the window (up to 0.7 s), then strikes
function kickWhenReady(ms, a, rq){
  const b = ms.ball;
  if (b.state !== 'free' || canStrike(a, b).ok) return realStart(ms, a, rq);
  a.pendKick = {rq, until: ms.t + 1.0};
  a.drib = null;
  return null;
}
const realStart = (ms, a, rq) => {
  a.pendKick = null;
  // (P6-B) Training Mode: a pass to a man who would be offside when it is struck is thought again, never played
  if (offAtStrike(ms, a, rq)){ a.brain.next = ms.t; a.brain.pending = true; a.drib = null; return null; }
  return startKick(ms, a, rq);
};
/* (P6-B, TRAINING-SPEC 2: offside respected by the AI's passing; BUILD-PLAN P6-B "no pass to an offside receiver") In
   Training Mode's scenarios the passer has a last look as he strikes it: where his man is against the real line (the
   law's own test, rules.js offsidePosition) and where his run takes him over the strike's wind-up (STRIKE_T s). The
   choice itself still reads the line as he perceives it (with an error by his vision), so he can pick the pass and
   then hold it; in a match he can also get it wrong, as players and assistants do (the harness's offside bands) */
const STRIKE_T = 0.25;
function offAtStrike(ms, a, rq){
  if (ms.mode !== 'train' || !lawOf(ms, 'offside') || rq.recv == null || rq.recv < 0) return false;
  if (rq.kind !== 'pass' && rq.kind !== 'through' && rq.kind !== 'lob') return false;
  const o = ms.agents[rq.recv];
  if (!o || o.team !== a.team || o === a) return false;
  // where he and their line will be at the contact: his run carries him on, and a line stepping up carries it to him
  // (TR-6 integration: the line moving over the wind-up was missed, and a defence stepping out at 3.4 m/s caught a
  // receiver who had been 0.14 m onside when the strike began)
  const p = offsidePosition(ms, o, a.team), fwd = Math.max(0, ms.dirs[a.team]*o.m.vx);
  return p.margin + fwd*STRIKE_T > -0.05 || lineAheadMargin(ms, o, a.team, STRIKE_T) > -0.05;
}
// the offside margin of o (rules.js offsidePosition's own test) with every player and the ball carried on at his
// present velocity for T s; nothing allocated
function lineAheadMargin(ms, o, team, T){
  const dir = ms.dirs[team], L = ms.spec.L, B = RULES.OFF.body, uh = halfwayU(ms.spec, dir);
  const ua = dir*(o.m.x + o.m.vx*T) + L/2 + B;
  if (ua <= uh + 0.06) return -1;
  let o1 = -1e9, o2 = -1e9;
  for (const d of ms.agents){
    if (d.team !== 1 - team || !d.onPitch || d.role !== 'player' || d.leaving || d.sentOff) continue;
    const u = dir*(d.m.x + d.m.vx*T) + L/2 + B;
    if (u > o1){ o2 = o1; o1 = u; } else if (u > o2) o2 = u;
  }
  const b = ms.ball, bu = dir*(b.p.x + b.v.x*T) + L/2;
  return ua - Math.max(o2 > -1e8 ? o2 : o1 > -1e8 ? o1 : uh, bu);
}
const PMC = {pOK: 0, tArrive: 0, intercepts: -1, margin: 0, x: 0, z: 0, recvCtrl: 1, pLane: 0};
const LBM = {pOK: 0, tArrive: 0, intercepts: -1, margin: 0, x: 0, z: 0, recvCtrl: 1, pLane: 0};
// the pending kick: into the window, then the strike; out of time, the decision is made again
function pendingKick(ms, a){
  const P = a.pendKick, b = ms.ball;
  if (canStrike(a, b).ok){
    // the picture has moved while he set it up: a pass whose lane has closed is thought again (once)
    const rq = P.rq, recv = rq.recv != null && rq.recv >= 0 ? ms.agents[rq.recv] : null;
    if (recv && rq.pOK != null && !P.checked && (rq.kind === 'pass' || rq.kind === 'through' || rq.kind === 'lob')){
      P.checked = true;
      const kind = rq.kind === 'lob' ? 'lob' : rq.kind;
      const v0 = rq.speed != null ? rq.speed : passSpeedFor(hypot(rq.target.x - b.p.x, rq.target.z - b.p.z), kind === 'through' ? BRAIN.THROUGH_ARRIVE : 9, b.rollDecel);
      const pm = passModel(ms, b.p, rq.target, kind, v0, recv, PMC);
      if (pm.pOK < Math.max(0.45, rq.pOK - 0.12)){ a.pendKick = null; a.brain.next = ms.t; a.brain.pending = true; return; }
    }
    realStart(ms, a, rq); return;
  }
  if (ms.t > P.until){
    a.pendKick = null;
    // a shot in the box is struck anyway (a stride adjust, a scuff at worst); anything else is thought again
    const dir = ms.dirs[a.team], dGoal = hypot(dir*ms.spec.hx - a.m.x, a.m.z);
    if (P.rq.kind === 'shot' && dGoal < 18) startKick(ms, a, P.rq);
    else { a.brain.next = ms.t; a.brain.pending = true; }
    return;
  }
  const tg = P.rq.target || {x: b.p.x + ms.dirs[a.team], z: b.p.z};
  const kx = tg.x - b.p.x, kz = tg.z - b.p.z, kl = hypot(kx, kz) || 1;
  const sd = (a.foot === 'L') ? 1 : -1, rx = -kz/kl, rz = kx/kl;
  steer(a, b.p.x - kx/kl*0.62 + rx*sd*0.12, b.p.z - kz/kl*0.62 + rz*sd*0.12, 'run', 0.04, {x: kx/kl, z: kz/kl}, Math.max(2.5, hypot(b.v.x, b.v.z) + 2));
}

// the carrier's movement between decisions: run through the ball along the dribble line without overrunning it, or
// stand on it (shielding with the body between the ball and the nearest opponent)
function carrierMove(ms, a){
  const b = ms.ball, m = a.m;
  if (a.act) return;
  if (a.pendKick){ pendingKick(ms, a); return; }
  if (b.state === 'held'){ standStill(a); return; }
  const bx = b.p.x - m.x, bz = b.p.z - m.z, bd = hypot(bx, bz);
  const d = a.drib;
  if (d){
    const along = bx*d.dx + bz*d.dz, across = -bx*d.dz + bz*d.dx;
    const bAlong = b.v.x*d.dx + b.v.z*d.dz;
    if (along > 0.25 && Math.abs(across) < 0.45){
      const cap = along < 0.6 ? Math.max(bAlong, 1.2) + 0.4 : Infinity;
      steer(a, b.p.x + d.dx*0.4, b.p.z + d.dz*0.4, d.gait, 0.05, null, cap);
    } else {
      // get behind the ball for the line
      steer(a, b.p.x - d.dx*0.55, b.p.z - d.dz*0.55, bd > 1.5 ? 'run' : 'jog', 0.08, {x: d.dx, z: d.dz}, bd < 1.0 ? 2.2 : Infinity);
      // a ball at his feet that is not ahead: roll it on to the line with the sole, once
      if (bd < 0.55 && m.speed < 1.0 && ms.t - (a.nudgeT || -9) > 0.8 && b.p.y < 0.3){ a.nudgeT = ms.t; nudge(ms, a, d.dx, d.dz, 1.6); }
    }
    return;
  }
  // holding or shielding: stand at the ball, body between it and the nearest opponent (state 'shield' with a man within
  // 3 m: the engine's shield stance, actions.js shieldStep). The shield he chose under pressure is also his intent
  // (P2b-B): the presser answers it with a shield challenge or a tackle (pressMove)
  let ox = 0, oz = 0, od = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch) continue;
    const dd = hypot(o.m.x - b.p.x, o.m.z - b.p.z);
    if (dd < od){ od = dd; ox = o.m.x; oz = o.m.z; }
  }
  a.intent.shield = a.hold === 'shield';
  // a ball his touch left out of his reach is anyone's nearer it (P2b-A, ball-3: no stickiness), so he goes to it at a
  // jog and only settles to a walk once it is at his feet
  const far = bd > 0.8, gait = far ? 'jog' : 'walk';
  if (od < 3){
    const ux = b.p.x - ox, uz = b.p.z - oz, ul = hypot(ux, uz) || 1;
    a.state = 'shield';
    steer(a, b.p.x - ux/ul*0.45, b.p.z - uz/ul*0.45, gait, 0.12, {x: ux/ul, z: uz/ul}, far ? 4.0 : 2.0);
  } else {
    const dir = ms.dirs[a.team];
    steer(a, b.p.x - dir*0.5, b.p.z, gait, 0.15, {x: dir, z: 0}, far ? 4.0 : 2.5);
  }
}

/* ---------- off the ball (3.2.5) ---------- */

// Where an outfield player without the ball goes (1.4.14): his anchor, adjusted by the job: support for the carrier,
// a run in behind that holds the line until the pass, the box when a cross is on, pressing, covering, marking.
export function decideOffBall(ms, a){
  const team = a.team, dir = ms.dirs[team], L = ms.spec.L, Wd = ms.spec.Wd, m = a.m;
  const tm = ms.tm[team];
  // the harness's stand-in for the player (BRAIN.ME): a forward, his side on the ball in their half, plays higher than his
  // place in the shape, up to the defenders' line (getting forward for his chances); a ten, with it in his own half,
  // comes short for it (not behind the ball)
  const meT = a.isMe && ms.meAI ? BRAIN.ME[a.arch] : null;
  let ancU = a.anchor.u;
  if (meT && ms.poss.team === team){
    const bu = uOf(ms, team, ms.ball.p.x);
    if (meT.up > 0 && bu > L/2) ancU = Math.max(ancU, Math.min(ancU + meT.up, onsideU(ms, tm) - 1));
    else if (meT.drop > 0 && bu <= L/2) ancU = Math.max(bu + 4, ancU - meT.drop);
  }
  const anc = teamToPitch(ms, team, ancU, a.anchor.w, {x: 0, z: 0});
  const out = {x: anc.x, z: anc.z, gait: 'jog', face: null, stop: 0.6};
  const b = ms.ball.p, carrier = ctlAgent(ms);
  const dAnc = hypot(anc.x - m.x, anc.z - m.z);
  out.gait = dAnc > 14 ? 'run' : dAnc > 4 ? 'jog' : 'walk';
  if (tm.phase === 'transition' && dAnc > 8) out.gait = 'run';
  // a man standing offside gets back onside before anything else (unless he is on a run): with the ball, so that he
  // can be played in; without it, so that a header or a block that falls to him is not given against him
  const myU = uOf(ms, team, m.x);
  if (!(ms.poss.team === team && a.task.run) && myU > onsideU(ms, tm) - 0.2 && myU > halfwayU(ms.spec, dir) && a.task.press !== 1){
    const p = teamToPitch(ms, team, tm.lineOpp - 1.2, wOf(ms, team, m.z), {x: 0, z: 0});
    out.x = p.x; out.z = clamp(anc.z, -ms.spec.hz + 1, ms.spec.hz - 1)*0.4 + p.z*0.6; out.gait = 'run'; out.stop = 0.4;
    return out;
  }
  if (ms.poss.team === team){
    if (carrier && carrier.team === team){
      const cu = uOf(ms, team, carrier.m.x), au = uOf(ms, team, m.x);
      // a run in behind (ST, W, AM; CM sometimes): conditions of 3.2.5
      const runner = a.arch === 'ST' || a.arch === 'W' || a.arch === 'AM' || a.arch === 'CM' && a.slot !== 'CDM';
      const run = a.task.run;
      if (run && ms.t < run.until){
        if (run.go){ out.x = run.x; out.z = run.z; out.gait = 'sprint'; out.stop = 0.5; }
        else {
          // he holds just onside of the real line (the second-last defender or the ball) until the pass is struck
          const line = offsidePosition(ms, a, team).line - RULES.OFF.body - BRAIN.RUN_HOLD;
          const hold = teamToPitch(ms, team, Math.min(au + 1, line), wOf(ms, team, run.z), {x: 0, z: 0});
          out.x = hold.x; out.z = hold.z; out.gait = 'jog'; out.stop = 0.4;
        }
        return out;
      } else if (run) a.task.run = null;
      if (runner && !a.task.run && carrier !== a){
        const cf = dirOf2(carrier.m.yaw), facing = cf.x*dir > 0.3;
        const unpressed = pressureOn(ms, carrier) < 0.3;
        const had = ms.t - ms.poss.since > 0.4;
        const lineDef = defenderOnLine(ms, team, a);
        const paceAdv = !lineDef || a.at.pace >= lineDef.at.pace - 4;
        const near = au > tm.lineOpp - 12 && au < tm.lineOpp + 1;
        const chance = a.arch === 'CM' ? 0.08 : a.arch === 'AM' ? 0.2 : 0.35;
        if (facing && unpressed && had && carrier.at.passing >= 50 && paceAdv && near && ms.r() < chance){
          const depth = BRAIN.RUN_DEPTH[0] + (BRAIN.RUN_DEPTH[1] - BRAIN.RUN_DEPTH[0])*ms.r();
          const tw = clamp(wOf(ms, team, m.z) + (ms.r() - 0.5)*10, 4, Wd - 4);
          const t = teamToPitch(ms, team, Math.min(L - 4, tm.lineOpp + depth), tw, {x: 0, z: 0});
          // (with no offside law there is no line to hold: he goes at once)
          a.task.run = {x: t.x, z: t.z, until: ms.t + 4.5, go: !lawOf(ms, 'offside')};
          return decideOffBall(ms, a);
        }
      }
      // the box when a cross is on: the near post, the penalty spot or the far post channel, held onside at the
      // defenders' line until the cross is struck (then the ball plans send the first head to it)
      if (cu > L - BRAIN.CROSS_FROM[0] && Math.abs(carrier.m.z) > ms.spec.hz - BRAIN.CROSS_FROM[1] && (a.arch === 'ST' || a.arch === 'W' && Math.abs(m.z - carrier.m.z) > 15 || a.arch === 'AM' || a.arch === 'CM' && a.slot !== 'CDM' && a.id % 2 === 0)){
        const gx = dir*ms.spec.hx, side = carrier.m.z > 0 ? 1 : -1;
        const slot = (a.id*7 + Math.floor(ms.t/6)) % 3;
        const z = [side*2.5, 0, -side*4][slot];
        const zu = Math.min(L - [6, 11, 7][slot], onsideU(ms, tm) - 0.6);
        const p = teamToPitch(ms, team, zu, wOf(ms, team, z), PT);
        out.x = p.x; out.z = p.z; out.gait = 'run'; out.stop = 0.6;
        return out;
      }
      // showing for the ball (3.2.5 support, the triangle with the carrier): the central midfielders nearest the carrier
      // offer themselves in a pocket at an angle from him, in space and with a clear lane, within reach of their place
      // in the shape (a holding midfielder drops off to take it from his defenders)
      if (carrier !== a && (a.slotLine === 'CM' || a.slotLine === 'CAM') && supportRank(ms, a, carrier) < BRAIN.SUPPORT[0]
        && supportSpot(ms, a, carrier, anc, out)) return out;
      // the harness's stand-in for the player, a long spell without the ball: he comes to show for it, as a player does
      if (carrier !== a && meT && ms.t - (a.invT || 0) > meT.seek && supportSpot(ms, a, carrier, anc, out)) return out;
      // (U9) free space: an attacker or a midfielder whose place in the shape has a man standing on it moves off him,
      // a few metres away within reach of that place (the shape held, the space found)
      if (carrier !== a && a.slotLine !== 'DF' && !a.isGK) spaceFrom(ms, a, out);
      // support: within 25 m of the carrier, open a lane if it is blocked
      const dc = hypot(carrier.m.x - m.x, carrier.m.z - m.z);
      if (dc < 25 && carrier !== a){
        const lane = laneBlocker(ms, team, carrier.m.x, carrier.m.z, out.x, out.z);
        if (lane){
          const lx = out.x - carrier.m.x, lz = out.z - carrier.m.z, ll = hypot(lx, lz) || 1;
          const nx = -lz/ll, nz = lx/ll, sgn = ((lane.m.x - carrier.m.x)*nx + (lane.m.z - carrier.m.z)*nz) > 0 ? -1 : 1;
          out.x += nx*sgn*4; out.z += nz*sgn*4;
        }
        // stay onside
        const ou = uOf(ms, team, out.x);
        if (ou > onsideU(ms, tm) - 0.3){ const p = teamToPitch(ms, team, tm.lineOpp - 0.5, wOf(ms, team, out.z), PT); out.x = p.x; out.z = p.z; }
      }
    }
    out.x = clamp(out.x, -ms.spec.hx + 1, ms.spec.hx - 1); out.z = clamp(out.z, -ms.spec.hz + 1, ms.spec.hz - 1);
    return out;
  }
  // out of possession: press, cover, mark, or hold the shape
  a.task.run = null;
  if (carrier && carrier.team !== team){
    const cm = carrier.m;
    if (a.task.press === 2){
      // cover: 6 to 8 m behind the presser on the line to our goal
      const ogx = -dir*ms.spec.hx, vx = ogx - cm.x, vz = -cm.z, vl = hypot(vx, vz) || 1;
      out.x = cm.x + vx/vl*BRAIN.COVER; out.z = cm.z + vz/vl*BRAIN.COVER; out.gait = 'run'; out.stop = 0.8;
      return out;
    }
  }
  if (a.task.mark >= 0){
    const o = ms.agents[a.task.mark];
    if (o && o.onPitch){
      const ogx = -dir*ms.spec.hx, vx = ogx - o.m.x, vz = -o.m.z, vl = hypot(vx, vz) || 1;
      // goal side of his man, a little toward the ball: tight near his own box, in midfield a zone between his place
      // in the shape and the man (so the lanes around them stay open to a good pass)
      const bx = b.x - o.m.x, bz = b.z - o.m.z, bl = hypot(bx, bz) || 1;
      if (a.task.markTight){
        out.x = o.m.x + vx/vl*BRAIN.MARK + bx/bl*0.6; out.z = o.m.z + vz/vl*BRAIN.MARK + bz/bl*0.6;
      } else {
        const mx = o.m.x + vx/vl*BRAIN.MARK_LOOSE + bx/bl*1.0, mz = o.m.z + vz/vl*BRAIN.MARK_LOOSE + bz/bl*1.0;
        out.x = anc.x + (mx - anc.x)*BRAIN.ZONE_PULL; out.z = anc.z + (mz - anc.z)*BRAIN.ZONE_PULL;
      }
      // never behind his own line by more than the shape allows
      const au = uOf(ms, team, out.x);
      if (au < tm.line - 6){ const p = teamToPitch(ms, team, tm.line - 6, wOf(ms, team, out.z), PT); out.x = p.x; out.z = p.z; }
      const dd = hypot(out.x - m.x, out.z - m.z);
      out.gait = dd > 6 ? 'run' : 'jog'; out.stop = 0.5;
      out.face = {x: (b.x - m.x)/(hypot(b.x - m.x, b.z - m.z) || 1), z: (b.z - m.z)/(hypot(b.x - m.x, b.z - m.z) || 1)};
      return out;
    }
  }
  out.x = clamp(out.x, -ms.spec.hx + 1, ms.spec.hx - 1); out.z = clamp(out.z, -ms.spec.hz + 1, ms.spec.hz - 1);
  return out;
}
const dirOf2 = yaw => ({x: -sin(yaw), z: -cos(yaw)});
// how many central midfielders of his side are nearer the carrier than he is (ties by id)
function supportRank(ms, a, c){
  const d0 = hypot(c.m.x - a.m.x, c.m.z - a.m.z);
  let n = 0;
  for (const o of ms.agents){
    if (o === a || o === c || o.team !== a.team || !o.onPitch || o.leaving || (o.slotLine !== 'CM' && o.slotLine !== 'CAM')) continue;
    if (o.task.run && ms.t < o.task.run.until) continue;
    const d = hypot(c.m.x - o.m.x, c.m.z - o.m.z);
    if (d < d0 || d === d0 && o.id < a.id) n++;
  }
  return n;
}
// The pocket a supporting midfielder shows in: around the carrier at SUPPORT[2] metres, every 35 degrees from straight
// ahead to behind square, within SUPPORT[3] m of his anchor, onside; scored by the space around it (the nearest
// opponent), the lane to it from the carrier, how far he has to go, how far forward it is, and team-mates already there.
// Writes out (x, z, gait, stop, face) and returns true, or false when he is too far from the carrier.
const SUP_ANG = [0, 35, -35, 70, -70, 105, -105].map(d => d*DEG);
// (U9) the nearest opponent to his target spot; within SPACE[0] m of it, the spot moves away from him by what is
// missing, up to SPACE[1] m, and back onside if that took it beyond the line. In place on out
function spaceFrom(ms, a, out){
  let near = null, nd = BRAIN.SPACE[0];
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch || o.isGK || o.role !== 'player') continue;
    const d = hypot(o.m.x - out.x, o.m.z - out.z);
    if (d < nd){ nd = d; near = o; }
  }
  if (!near) return;
  const dx = out.x - near.m.x, dz = out.z - near.m.z, dl = hypot(dx, dz) || 1, k = Math.min(BRAIN.SPACE[1], BRAIN.SPACE[0] - nd + 1);
  // (sideways and forward rather than back toward his own goal: the space a pass can find)
  const dir = ms.dirs[a.team];
  let ux = dx/dl, uz = dz/dl;
  if (ux*dir < 0){ ux = 0; uz = uz >= 0 ? 1 : -1; }
  out.x = clamp(out.x + ux*k, -ms.spec.hx + 1, ms.spec.hx - 1); out.z = clamp(out.z + uz*k, -ms.spec.hz + 1, ms.spec.hz - 1);
  const tm = ms.tm[a.team], ou = uOf(ms, a.team, out.x);
  if (ou > onsideU(ms, tm) - 0.3){ const p = teamToPitch(ms, a.team, onsideU(ms, tm) - 0.5, wOf(ms, a.team, out.z), PT); out.x = p.x; out.z = p.z; }
}
function supportSpot(ms, a, c, anc, out){
  const team = a.team, dir = ms.dirs[team], tm = ms.tm[team], hx = ms.spec.hx, hz = ms.spec.hz, S0 = BRAIN.SUPPORT;
  const cm = c.m;
  if (hypot(cm.x - a.m.x, cm.z - a.m.z) > S0[1]) return false;
  const cu = uOf(ms, team, cm.x);
  let best = -Infinity, bx = 0, bz = 0;
  for (const dist of S0[2]){
    for (const ang of SUP_ANG){
      const x = cm.x + dir*cos(ang)*dist, z = cm.z + dir*sin(ang)*dist;
      if (Math.abs(x) > hx - 2 || Math.abs(z) > hz - 2) continue;
      if (hypot(x - anc.x, z - anc.z) > S0[3]) continue;
      const u = uOf(ms, team, x);
      if (u > onsideU(ms, tm) - 0.5) continue;
      let space = 9, lane = 4;
      const vx = x - cm.x, vz = z - cm.z, l2 = vx*vx + vz*vz || 1;
      for (const o of ms.agents){
        if (o.team === team || o.team < 0 || !o.onPitch) continue;
        const ds = hypot(o.m.x - x, o.m.z - z);
        if (ds < space) space = ds;
        const t = clamp(((o.m.x - cm.x)*vx + (o.m.z - cm.z)*vz)/l2, 0.1, 0.9);
        const dl = hypot(o.m.x - cm.x - vx*t, o.m.z - cm.z - vz*t);
        if (dl < lane) lane = dl;
      }
      let crowd = 0;
      for (const o of ms.agents){
        if (o.team !== team || o === a || o === c || !o.onPitch) continue;
        const p = o.isMe && !ms.meAI || !o.tgtSet ? o.m : o.tgt;
        if (hypot(p.x - x, p.z - z) < S0[4]) crowd++;
      }
      const v = Math.min(space, 8) + 0.8*lane - S0[5]*hypot(x - a.m.x, z - a.m.z) + S0[6]*(u - cu) - 3*crowd;
      if (v > best){ best = v; bx = x; bz = z; }
    }
  }
  if (best === -Infinity) return false;
  const d = hypot(bx - a.m.x, bz - a.m.z), fd = hypot(cm.x - bx, cm.z - bz) || 1;
  out.x = bx; out.z = bz; out.gait = d > 10 ? 'run' : 'jog'; out.stop = 0.8;
  out.face = {x: (cm.x - bx)/fd, z: (cm.z - bz)/fd};
  return true;
}
// the opponent nearest the lane from (x0, z0) to (x1, z1), within 1.5 m of it
function laneBlocker(ms, team, x0, z0, x1, z1){
  const vx = x1 - x0, vz = z1 - z0, L2 = vx*vx + vz*vz || 1;
  let best = null, bd = 1.5;
  for (const o of ms.agents){
    if (o.team === team || o.team < 0 || !o.onPitch) continue;
    const t = ((o.m.x - x0)*vx + (o.m.z - z0)*vz)/L2;
    if (t <= 0.05 || t >= 0.95) continue;
    const d = hypot(o.m.x - x0 - vx*t, o.m.z - z0 - vz*t);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}
// the defender holding the line nearest an attacker's lane
function defenderOnLine(ms, team, a){
  let best = null, bd = Infinity;
  for (const o of ms.agents){
    if (o.team === team || o.team < 0 || !o.onPitch || o.isGK) continue;
    const d = Math.abs(o.m.z - a.m.z) + 0.3*Math.abs(o.m.x - a.m.x);
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}

// the presser's approach to 1.6 m on the goal side, then the jockey, and the tackle when the ball is exposed
// is he the last of his side between the carrier and the goal (the keeper apart)?
function lastMan(ms, a, carrier){
  const dir = ms.dirs[a.team], gx = -dir*ms.spec.hx, dc = Math.abs(gx - carrier.m.x);
  for (const o of ms.agents){
    if (o.team !== a.team || o === a || !o.onPitch || o.isGK || o.leaving) continue;
    if (Math.abs(gx - o.m.x) < dc) return false;
  }
  return true;
}
function pressMove(ms, a, carrier){
  const dir = ms.dirs[a.team], cm = carrier.m, m = a.m, b = ms.ball;
  const ogx = -dir*ms.spec.hx, vx = ogx - cm.x, vz = -cm.z, vl = hypot(vx, vz) || 1;
  const stand = BRAIN.PRESS_STOP;
  const tx = cm.x + vx/vl*stand, tz = cm.z + vz/vl*stand;
  const dc = hypot(cm.x - m.x, cm.z - m.z);
  const face = faceTo(a, b.p.x, b.p.z, a.faceV);
  if (dc > 3.5){ steer(a, tx, tz, dc > 8 ? 'sprint' : 'run', 0.3, null); a.state = 'run'; }
  else { steer(a, tx, tz, 'run', 0.15, face, BRAIN.JOCKEY_V, true); a.state = 'jockey'; }
  // a shielding carrier (P2b-B, TRAINING-SPEC 3): he decides, once for a while, between a shield challenge (leaning in
  // to the ball's side of him, which sim.js resolves with pShieldLoss) and a tackle (pTackleWin with the carrier's
  // shield rating S in place of his control), weighed by the two chances from where he stands
  const shielded = !!(carrier.intent && carrier.intent.shield) && dc < BRAIN.CHAL_NEAR;
  if (shielded && !a.act){
    let P = a.press;
    if (!P || P.on !== carrier.id || ms.t > P.until){
      const rc = ratings(carrier.at, RT1), ra = ratings(a.at, RT2), rel = relAngle(carrier, m.x, m.z);
      const pS = pShieldLoss(rc.S, ra.D, shieldAngle(rel), fatigueFactor(breathOf(a), breathOf(carrier)));
      const pT = pTackleWin(ra.T, rc.S, 1, angleFactor(rel));
      P = a.press = {on: carrier.id, until: ms.t + BRAIN.CHAL_KEEP, kind: ms.r()*(pS + pT) < pS ? 'challenge' : 'tackle', pS, pT};
      if (ms.onPress) ms.onPress(a, carrier, {choice: P.kind, pS, pT});
    }
    if (P.kind === 'challenge'){
      // into him on the ball's side: toward the ball past his hip, at a lean (the contact is the simulation's)
      const bx = b.p.x - cm.x, bz = b.p.z - cm.z, bl = hypot(bx, bz) || 1;
      steer(a, cm.x + bx/bl*0.35, cm.z + bz/bl*0.35, 'run', 0.02, faceTo(a, b.p.x, b.p.z, a.faceV), BRAIN.CHAL_V);
      a.state = 'jockey';
      return;
    }
  } else if (a.press && a.press.on === carrier.id && !shielded) a.press = null;
  // the tackle: the ball out of the carrier's feet, within his standing reach (TRAINING-SPEC 3, duel.js standReach)
  if (a.act || ms.t < (a.cool.tackle || 0)) return;
  const db = hypot(b.p.x - m.x, b.p.z - m.z), cbd = hypot(b.p.x - cm.x, b.p.z - cm.z);
  const reach = standReach(a.at.tackling);
  if (db < reach + 0.15 && dc < BRAIN.TACKLE_D + 0.4 && b.p.y < 0.5){
    // exposure: how far the ball is from the carrier's feet compared with from the tackler's. A jockeying defender
    // goes in at a rate per second: often for a ball out of the carrier's feet, rarely when it is shielded, and hardly
    // ever from behind him (that is how fouls are given away)
    const exposed = cbd > 0.45 || db < cbd + 0.25;
    const behind = (cm.x - m.x)*(-sin(cm.yaw)) + (cm.z - m.z)*(-cos(cm.yaw)) > 0.4;
    // a man on a yellow card goes in less, and so does the last man before the keeper (he jockeys instead)
    const care = (a.booked ? BRAIN.CARE[0] : 1)*(lastMan(ms, a, carrier) ? BRAIN.CARE[1] : 1)*(a.slotLine === 'FWD' ? BRAIN.CARE[2] : 1);
    const meT = a.isMe && ms.meAI ? BRAIN.ME[a.arch] : null;
    const pref = meT ? meT.tackle*(dir*m.x < 0 ? meT.back : 1) : 1;
    const rate = (exposed ? BRAIN.TACKLE_RATE[0] : BRAIN.TACKLE_RATE[1])*(behind ? BRAIN.TACKLE_RATE[2] : 1)*(0.6 + a.at.tackling/100)*care*pref;
    if (ms.r() < rate/60){
      const err = 0.12*(1 - a.at.tackling/110)*gauss(ms.r);
      const kind = db > reach - 0.05 && !behind ? 'poke' : 'stand';
      if (ms.onTackle) ms.onTackle(a, carrier, {reach, kind, shielded});
      startTackle(ms, a, kind, carrier, err);
      return;
    }
  }
  // the slide: chasing at speed with the ball out in front of the carrier
  if (m.speed > BRAIN.SLIDE_V && db < 3.0 && db > 1.2 && cbd > 0.7 && b.p.y < 0.4){
    const toBall = ((b.p.x - m.x)*m.vx + (b.p.z - m.z)*m.vz)/(db*m.speed || 1);
    // hardly ever from behind the carrier (a slide through the man is a red card)
    const behind = (cm.x - m.x)*(-sin(cm.yaw)) + (cm.z - m.z)*(-cos(cm.yaw)) > 0.4;
    // and never at a closing speed that makes it reckless, nor on a yellow card
    const closing = m.speed - ((cm.x - m.x)*cm.vx + (cm.z - m.z)*cm.vz)/(dc || 1);
    if (toBall > 0.85 && !a.booked && closing < BRAIN.SLIDE_CLOSE && ms.r() < BRAIN.SLIDE_RATE*(behind ? BRAIN.TACKLE_RATE[2] : 1)/60){
      const err = 0.12*(1 - a.at.tackling/110)*gauss(ms.r);
      startTackle(ms, a, 'slide', carrier, err);
    }
  }
}

/* A practice opponent (P5-A, Training Mode Phase 5, BUILD-PLAN P5-A work item 1b; TRAINING-SPEC 4, Free Play's
   practice opponents with a behaviour). a.drill = {behave, x, z} is put on him by Training's runner from the setup (his
   spawn point with it); only the training mode reads it, so no career or harness agent is ever affected.
     stand   holds his spawn point and turns to face the ball: no press, no tackle and no challenge;
     jockey  contains the man on the ball (with the ball loose, the man of the other side nearest it): DRILL_JOCKEY m off
             him, goal side, facing him, in pressMove's own jockey stance (strafing, state 'jockey'), with the tackle
             and the shield challenge left out;
     press   today's pressMove on the man on the ball, tackles and shield challenges and all; a loose ball he goes for
             as anyone does (false: the rest of brainStep decides).
   Returns true when it has decided his step. */
function drillMove(ms, a, c){
  const d = a.drill, b = ms.ball.p, m = a.m;
  if (d.behave === 'press'){
    if (c && c.team !== a.team){ pressMove(ms, a, c); return true; }
    return false;
  }
  a.plan = null; a.press = null;
  if (a.intent.shield) a.intent.shield = false;
  let ref = c && c.team !== a.team ? c : null;
  if (d.behave === 'jockey' && !ref){
    let best = Infinity;
    for (const o of ms.agents){
      if (o.team === a.team || o.team < 0 || !o.onPitch || o.role !== 'player' || o.isGK) continue;
      const dd = hypot(o.m.x - b.x, o.m.z - b.z);
      if (dd < best){ best = dd; ref = o; }
    }
  }
  if (d.behave !== 'jockey' || !ref){
    // stand (and a jockey with nobody to jockey): on his spot, turned to the ball
    steer(a, d.x, d.z, 'jog', 0.2, faceTo(a, b.x, b.z, a.faceV));
    a.state = m.speed > 0.3 ? 'run' : 'idle';
    return true;
  }
  // the spot: on the line from the ball to his own goal, far enough off the ball that it is never in his reach (the
  // engine would give him a ball inside his control radius, and that is a challenge he must not make) and within
  // DRILL_JOCKEY of the man
  // (from where the man will be in a moment, so that he backs off at the man's pace and does not wait to be reached)
  // (until he is moving with the man, a little further off: turning to go with him costs him ground)
  const J = BRAIN.DRILL_JOCKEY, rm = ref.m, ogx = -ms.dirs[a.team]*ms.spec.hx;
  const px = rm.x + rm.vx*J[5], pz = rm.z + rm.vz*J[5];
  const vx = ogx - px, vz = -pz, vl = hypot(vx, vz) || 1, ux = vx/vl, uz = vz/vl;
  const withHim = m.vx*rm.vx + m.vz*rm.vz >= (rm.speed - 1)*rm.speed;
  const off = clamp(hypot(b.x - rm.x, b.z - rm.z) + J[4], J[2], J[1] - 0.2) + (withHim ? 0 : J[7]);
  const tx = px + ux*off, tz = pz + uz*off;
  const dc = hypot(rm.x - m.x, rm.z - m.z), face = faceTo(a, rm.x, rm.z, a.faceV);
  const bv = ms.ball.v, cap = Math.max(BRAIN.JOCKEY_V, rm.speed + J[3], hypot(bv.x, bv.z) + J[3]);
  // goal side of him already and near the spot: the jockey stance at his pace; else get there first
  const goalSide = hypot(ogx - m.x, -m.z) < hypot(ogx - rm.x, -rm.z);
  // (a man coming at him faster than a body backs off sideways on: he turns and runs with him, still goal side)
  if (dc > J[1] + 1.5 || !goalSide || rm.speed > J[6]){ steer(a, tx, tz, dc > 8 || rm.speed > J[6] + 1.5 ? 'sprint' : 'run', 0.2, dc < J[1] && rm.speed <= J[6] ? face : null); a.state = 'run'; }
  else { steer(a, tx, tz, 'run', 0.1, face, cap, true); a.state = 'jockey'; }
  return true;
}

// A loose ball or a 50/50 (P2b-B, TRAINING-SPEC 3): nobody has it and an opponent is about to (within LOOSE_OPP m of
// it and nearer it than this man). Within his standing reach he goes in on the ball itself; at speed, with the ball in
// front and within the slide's reach for his speed, he may slide for it. The challenge is the engine's (actions.js
// startAction with target 'ball', resolved by the duel)
function looseChallenge(ms, a){
  const b = ms.ball, m = a.m;
  if (a.act || ms.poss.ctl >= 0 || b.state !== 'free' || b.p.y > 0.5 || ms.t < (a.cool.tackle || 0)) return;
  const db = hypot(b.p.x - m.x, b.p.z - m.z);
  const sReach = m.speed > BRAIN.SLIDE_V ? slideReach(m.speed, a.prm.sprint) : 0, reach = standReach(a.at.tackling);
  if (db > Math.max(reach + 0.1, sReach)) return;
  let opp = null, od = BRAIN.LOOSE_OPP;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch || o.role !== 'player' || o.isGK) continue;
    const d = hypot(o.m.x - b.p.x, o.m.z - b.p.z);
    if (d < od && d < db){ od = d; opp = o; }
  }
  if (!opp) return;
  let kind = null;
  if (db <= reach + 0.1){ if (ms.r() < BRAIN.LOOSE_RATE/60) kind = 'tackle'; }
  else if (sReach > 0 && !a.booked){
    const toBall = ((b.p.x - m.x)*m.vx + (b.p.z - m.z)*m.vz)/(db*m.speed || 1);
    if (toBall > 0.85 && ms.r() < BRAIN.SLIDE_RATE/60) kind = 'slide';
  }
  if (!kind) return;
  if (kind === 'tackle' && ms.onTackle) ms.onTackle(a, opp, {reach, kind: 'stand', loose: true});
  const act = startAction(ms, a, kind === 'slide' ? {kind: 'slide', target: 'ball'} : {kind: 'tackle', sub: 'stand', target: 'ball'});
  if (act && ms.onLoose) ms.onLoose(a, kind, opp);
}

/* ---------- set pieces (3.2.8) ---------- */

// Every agent's spot for the restart (a.set): kick-off halves; throw-in options; a goal kick spread with the opponents
// outside the box; a corner with near post, far post, spot and edge runners, two staying back, defenders goal side and
// 9.15 m away; a free kick with the wall; a penalty with everyone outside the box and arc behind the ball.
export function restartShape(ms){
  const R0 = ms.restart;
  if (!R0) return;
  const L = ms.spec.L, Wd = ms.spec.Wd, hx = ms.spec.hx, hz = ms.spec.hz, sp = R0.spot, att = R0.team, def = 1 - att;
  const dirA = ms.dirs[att], gxA = dirA*hx;
  const shift = (a, x, z, role, face) => { a.set = {x: clamp(x, -hx - 3, hx + 3), z: clamp(z, -hz - 2, hz + 2), role, face: face || null, gait: 'jog', stop: 0.4}; };
  const tk = ms.agents[R0.taker];
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== 'player' || a.leaving) continue;
    if (a === tk && R0.stage !== 'wait' && R0.stage !== 'go') continue;
    // the man fetching the ball, serving it or putting it on the spot is busy with it
    if (a.id === R0.fetcher && (R0.stage === 'fetch' || R0.stage === 'serve') || a.id === R0.carrier) continue;
    const team = a.team, dir = ms.dirs[team];
    const anc = teamToPitch(ms, team, a.anchor.u, a.anchor.w, {x: 0, z: 0});
    if (a.isGK && !(R0.kind === 'goalkick' && a === tk)){ a.set = null; continue; }
    switch (R0.kind){
      case 'kickoff': {
        // own half, opponents outside the circle
        const p = SLOT_POS[a.slot] || SLOT_POS.CM;
        const u = clamp(p.y/100*(L/2)*0.9 + 8, 8, L/2 - 1.2), w = (a.baseX != null ? a.baseX : p.x)/100*Wd;
        const q = teamToPitch(ms, team, u, w, {x: 0, z: 0});
        if (team !== att && hypot(q.x, q.z) < 9.4){ const k = 9.6/(hypot(q.x, q.z) || 1); q.x *= k; q.z *= k; }
        if (team === att && a !== tk && (a.slotLine === 'FWD') && !a.koMate && !Object.values(ms.koMate || {}).includes(a.id)){
          ms.koMate = ms.koMate || {}; ms.koMate[team] = a.id;
        }
        if (team === att && ms.koMate && ms.koMate[team] === a.id){ q.x = -dir*1.2; q.z = 2.5; }
        if (Math.sign(q.x) === dir && Math.abs(q.x) > 0.01) q.x = -dir*0.5;
        shift(a, q.x, q.z, 'ko', {x: dir, z: 0});
        if (a === tk) shift(a, -dir*0.45, 0, 'taker', {x: dir, z: 0});
        break;
      }
      case 'throw': {
        if (a === tk){ const fz = sp.z > 0 ? -1 : 1; shift(a, sp.x, sp.z + fz*0.05, 'taker', {x: 0, z: fz}); break; }
        // options near the throw on the attacking side, the rest hold shape shifted toward it
        const dx = anc.x - sp.x, dz = anc.z - sp.z, d = hypot(dx, dz);
        if (team === att && d < 26){ const k = clamp(12/(d || 1), 0.4, 1); shift(a, sp.x + dx*k, sp.z + dz*k, 'option'); }
        else shift(a, anc.x, anc.z*0.85 + sp.z*0.15, 'shape');
        break;
      }
      case 'goalkick': {
        if (a === tk){ shift(a, sp.x - (sp.x > 0 ? 1 : -1)*0.9, sp.z, 'taker'); break; }
        if (team === att){
          // spread wide and deep to give the keeper options
          const p = SLOT_POS[a.slot] || SLOT_POS.CM;
          const u = clamp(8 + depthOf(a.slot)*(L*0.62), 8, L*0.75), w = (a.baseX != null ? a.baseX : p.x)/100*Wd;
          const q = teamToPitch(ms, team, u, w, {x: 0, z: 0});
          shift(a, q.x, q.z, 'shape');
        } else {
          const q = {x: anc.x, z: anc.z};
          // outside the box until it is kicked
          const bx = -dir*(hx - 16.8);
          if (dir*q.x < dir*bx && Math.abs(q.z) < 20.5) q.x = bx;
          shift(a, q.x, q.z, 'shape');
        }
        break;
      }
      case 'corner': {
        const side = sp.z > 0 ? 1 : -1;
        if (a === tk){ shift(a, sp.x + (sp.x > 0 ? 0.9 : -0.9)*0.7, sp.z + side*0.9, 'taker'); break; }
        if (team === att){
          const k = (a.cornerRole != null ? a.cornerRole : (a.cornerRole = cornerSlot(ms, a)));
          const spots = [[5.5, side*2.5, 'near'], [7, -side*3.8, 'far'], [11, 0, 'spot'], [17.5, side*-2, 'edge'], [6, 0, 'six']];
          if (k < spots.length){ const s = spots[k]; shift(a, gxA - dirA*s[0], s[1], s[2]); }
          else { const q = teamToPitch(ms, team, L*0.5, Wd/2 + (k % 2 ? 10 : -10), {x: 0, z: 0}); shift(a, q.x, q.z, 'back'); }
        } else if (a.id === outletOf(ms, R0, def)){
          // the defending side's outlet stays up on halfway for the ball out (the counter)
          const q = teamToPitch(ms, team, L*0.5 - 1, Wd/2 - side*dirA*8, {x: 0, z: 0});
          shift(a, q.x, q.z, 'outlet');
        } else {
          // defenders: the near post, goal side of attackers in the box, outside 9.15 m of the ball
          const mark = nearestAttacker(ms, a, att);
          if (mark && hypot(mark.set ? mark.set.x : mark.m.x, mark.set ? mark.set.z : mark.m.z) < 60){
            const mx = mark.set ? mark.set.x : mark.m.x, mz = mark.set ? mark.set.z : mark.m.z;
            shift(a, mx + dirA*0.9, mz*0.92, 'mark');
          } else shift(a, gxA - dirA*(4 + (a.id % 3)*3), (a.id % 2 ? 1 : -1)*3, 'zone');
          if (hypot(a.set.x - sp.x, a.set.z - sp.z) < 9.4){ const ux = a.set.x - sp.x, uz = a.set.z - sp.z, ul = hypot(ux, uz) || 1; a.set.x = sp.x + ux/ul*9.5; a.set.z = sp.z + uz/ul*9.5; }
        }
        break;
      }
      case 'free': case 'indirect': {
        const dGoal = hypot(gxA - sp.x, sp.z);
        if (a === tk){ const kx = gxA - sp.x, kz = 0 - sp.z, kl = hypot(kx, kz) || 1; shift(a, sp.x - kx/kl*1.6, sp.z - kz/kl*1.6, 'taker'); break; }
        if (team === def && a.wall){ break; }
        if (dGoal < 40 && dirA*sp.x > 0 && !R0.kickIn){
          // in range (not a kick-in, which is taken as play goes on): the defence holds a line 11 to 18 m out (deeper
          // for a nearer kick), the attackers line up on it, onside, and attack the ball when it is struck; two of the
          // attackers' defenders stay back
          const lineD = clamp(0.5*dGoal, 11, 18), lx = gxA - dirA*lineD;
          const k = a.fkRole != null ? a.fkRole : (a.fkRole = fkSlot(ms, a, team === att));
          if (team === att){
            if (k < 6){ shift(a, lx - dirA*0.6, clamp(sp.z*0.3 + (k - 2.5)*3.6, -16, 16), 'box'); }
            else { const q = teamToPitch(ms, team, L*0.5 - 4, Wd/2 + (k % 2 ? 9 : -9), {x: 0, z: 0}); shift(a, q.x, q.z, 'back'); }
          } else {
            if (k < 7){ shift(a, lx, clamp(sp.z*0.3 + (k - 3)*3.2, -16, 16), 'line'); }
            else shift(a, anc.x, anc.z, 'shape');
          }
        } else shift(a, anc.x, anc.z, 'shape');
        if (team === def && hypot(a.set.x - sp.x, a.set.z - sp.z) < 9.4){ const ux = a.set.x - sp.x, uz = a.set.z - sp.z, ul = hypot(ux, uz) || 1; a.set.x = sp.x + ux/ul*9.6; a.set.z = sp.z + uz/ul*9.6; }
        break;
      }
      case 'penalty': {
        if (a === tk){ shift(a, sp.x - dirA*1.8, sp.z, 'taker', {x: dirA, z: 0}); break; }
        // outside the box and the arc, behind the ball
        const k = a.id % 8;
        const x = gxA - dirA*(17.5 + (k % 3)*1.5), z = (k - 3.5)*3.2;
        shift(a, x, z, 'pen');
        break;
      }
      default: shift(a, anc.x, anc.z, 'shape');
    }
  }
  // the wall for a free kick in range (3.2.8): 5 at 22 m or closer, 4 to 28 m, 3 to 32 m, minus 2 at a wide angle;
  // 9.15 m from the ball on the line to the near post plus 0.6 m, 0.62 m apart
  // (P7-A) Training's free kick hands the wall in (R0.wallSpec): its size, distance, offset and alignment, and who
  // stands in it; the second taker (R0.second) has his spot and his part
  if ((R0.kind === 'free' || R0.kind === 'indirect') && R0.wallSpec && !R0.kickIn){
    specWall(ms, R0, sp, gxA, def);
    if (R0.second >= 0) secondShape(ms, R0, sp, gxA);
    return;
  }
  if ((R0.kind === 'free' || R0.kind === 'indirect') && R0.second >= 0 && !R0.kickIn) secondShape(ms, R0, sp, gxA);
  if ((R0.kind === 'free' || R0.kind === 'indirect') && !R0.wallSet && !R0.kickIn){
    R0.wallSet = true;
    const dGoal = hypot(gxA - sp.x, sp.z);
    let n = dGoal <= 22 ? 5 : dGoal <= 28 ? 4 : dGoal <= 32 ? 3 : 0;
    // more than 35 degrees off the line to the goal centre: two fewer
    const angle = Math.abs(sp.z)/Math.max(1, Math.abs(gxA - sp.x));
    if (angle > 0.7) n = Math.max(0, n - 2);
    if (n > 0){
      const post = {x: gxA, z: sp.z > 0 ? 3.66 + 0.6 : -3.66 - 0.6};
      const vx = post.x - sp.x, vz = post.z - sp.z, vl = hypot(vx, vz) || 1, ux = vx/vl, uz = vz/vl;
      const cx = sp.x + ux*RULES.WALL_D, cz = sp.z + uz*RULES.WALL_D;
      // across the line, pointing in toward the goal centre: the wall runs from the near post inward
      let px = -uz, pz = ux;
      if (pz*(0 - post.z) < 0){ px = -px; pz = -pz; }
      const cands = ms.agents.filter(o => o.team === def && o.onPitch && !o.isGK && !o.leaving).sort((p, q) => hypot(p.m.x - cx, p.m.z - cz) - hypot(q.m.x - cx, q.m.z - cz) || p.id - q.id).slice(0, n);
      cands.forEach((o, i) => {
        const off = i*RULES.WALL_GAP;
        o.wall = true; o.set = {x: cx + px*off, z: cz + pz*off, role: 'wall', face: {x: -ux, z: -uz}, gait: 'jog', stop: 0.2};
      });
      R0.wall = cands.map(o => o.id);
    }
  }
}
/* ---------- (P7-A) the wall as Training configures it, the second taker, the corner plan ----------
   wallSpots(sp, gx, spec, bounds) -> {spots: [{x, z}], face: {x, z}, dist, ux, uz, px, pz}: where a wall of spec.n
   (0 to 6) stands for a free kick from sp at the goal on the line x = gx. spec = {n, on (false: no wall), dist (m from
   the ball, 9.15 by the laws), off (m across, + toward the goal's middle), align: 'post' (the line to just outside the
   near post, the wall running inward from it) | 'centre' (the line to the goal's middle, the wall centred on it)}.
   bounds {hx, hz} keeps every man inside the lines. The men stand WALL_GAP apart (more than two shoulder radii, so
   they never overlap), at least WALL_BALL plus a shoulder from the ball. Pure: qa/unit/fkwall.mjs runs it. */
export const WALL_SPEC = Object.freeze({N: 6, D0: 9.15, DMIN: 3, DMAX: 20, OFF: 6, BALL: 0.5, ALIGN: Object.freeze(['post', 'centre'])});
const SEP = 0.30;
export function wallSpots(sp, gx, spec, bounds){
  const s = spec || {}, n = s.on === false ? 0 : clamp(Math.round(+s.n || 0), 0, WALL_SPEC.N);
  const dist = clamp(Number.isFinite(+s.dist) && s.dist !== null ? +s.dist : WALL_SPEC.D0, WALL_SPEC.DMIN, WALL_SPEC.DMAX);
  const off = clamp(+s.off || 0, -WALL_SPEC.OFF, WALL_SPEC.OFF), align = s.align === 'centre' ? 'centre' : 'post';
  const side = sp.z > 0 ? 1 : sp.z < 0 ? -1 : 1, mouth = 3.66;
  const tz = align === 'post' ? side*(mouth + RULES.WALL_POST) : 0;
  const vx = gx - sp.x, vz = tz - sp.z, vl = hypot(vx, vz) || 1, ux = vx/vl, uz = vz/vl;
  // across the line, pointing in toward the goal's middle (for a ball dead in the middle, toward -z)
  let px = -uz, pz = ux;
  const inward = Math.abs(sp.z) > 1e-9 ? -side : -1;
  if (pz*inward < 0){ px = -px; pz = -pz; }
  const spots = [];
  for (let i = 0; i < n; i++){
    const k = (align === 'post' ? i : i - (n - 1)/2)*RULES.WALL_GAP + off;
    spots.push({x: sp.x + ux*dist + px*k, z: sp.z + uz*dist + pz*k});
  }
  // inside the lines and clear of the ball, the wall always moved as one (its spacing and its line kept): into the
  // lines along the pitch's axes; then, when a man is nearer the ball than WALL_BALL plus his shoulder (a ball hard
  // by a line), across, away from the ball, a step at a time
  const minB = WALL_SPEC.BALL + SEP;
  const into = () => {
    if (!bounds || !spots.length) return;
    const mx = bounds.hx - SEP, mz = bounds.hz - SEP;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of spots){ if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
    const dx = x1 > mx ? mx - x1 : x0 < -mx ? -mx - x0 : 0, dz = z1 > mz ? mz - z1 : z0 < -mz ? -mz - z0 : 0;
    if (dx || dz) for (const q of spots){ q.x += dx; q.z += dz; }
  };
  const near = () => { for (const q of spots) if (hypot(q.x - sp.x, q.z - sp.z) < minB) return true; return false; };
  into();
  if (near()){
    // away from the ball across the line (toward the goal's middle when the wall's middle is level with the ball)
    let cx = 0, cz = 0; for (const q of spots){ cx += q.x; cz += q.z; }
    const along = ((cx/spots.length - sp.x)*px + (cz/spots.length - sp.z)*pz);
    const sx = (along >= 0 ? 1 : -1)*px, sz = (along >= 0 ? 1 : -1)*pz;
    for (let k = 0; k < 400 && near(); k++){
      for (const q of spots){ q.x += sx*0.05; q.z += sz*0.05; }
      // (a line in the way: the other way along it)
      if (bounds && spots.some(q => Math.abs(q.x) > bounds.hx - SEP || Math.abs(q.z) > bounds.hz - SEP)){
        for (const q of spots){ q.x -= sx*0.05; q.z -= sz*0.05; }
        for (let j = 0; j < 400 && near(); j++) for (const q of spots){ q.x -= sx*0.05; q.z -= sz*0.05; }
        break;
      }
    }
    into();
  }
  return {spots, face: {x: -ux, z: -uz}, dist, ux, uz, px, pz, n};
}
// the wall of a Training free kick: R0.wallSpec's size and place, its men the ones it names (spec.ids, the
// defending side's) and then the nearest; the others kept clear of it and of the ball
function specWall(ms, R0, sp, gx, def){
  const S = R0.wallSpec, W = wallSpots(sp, gx, S, {hx: ms.spec.hx, hz: ms.spec.hz});
  if (!R0.wallSet){
    R0.wallSet = true;
    const ok = o => o && o.team === def && o.onPitch && !o.isGK && !o.leaving && o.role === 'player';
    const ids = Array.isArray(S.ids) ? S.ids.filter(id => ok(ms.agents[id])) : [];
    if (ids.length < W.n){
      const rest = ms.agents.filter(o => ok(o) && !ids.includes(o.id) && !o.isMe).sort((p, q) => hypot(p.m.x - W.spots[0].x, p.m.z - W.spots[0].z) - hypot(q.m.x - W.spots[0].x, q.m.z - W.spots[0].z) || p.id - q.id);
      for (const o of rest){ if (ids.length >= W.n) break; ids.push(o.id); }
    }
    R0.wall = ids.slice(0, W.spots.length);
    R0.wallSpots = W.spots.slice(0, R0.wall.length);
  }
  R0.wall.forEach((id, i) => {
    const o = ms.agents[id], q = R0.wallSpots[i];
    if (!o || !q) return;
    o.wall = true;
    if (!o.isMe || ms.meAI) o.set = {x: q.x, z: q.z, role: 'wall', face: W.face, gait: 'jog', stop: 0.12};
  });
  // nobody else inside the wall, nor on the ball (the taker and the second taker apart)
  const keep = 2*SEP + 0.25;
  for (const a of ms.agents){
    if (!a.set || a.wall || !a.onPitch || a.isGK || a.id === R0.taker || a.id === R0.second) continue;
    for (let pass = 0; pass < 2; pass++){
      for (const q of R0.wallSpots){
        const ex = a.set.x - q.x, ez = a.set.z - q.z, e = hypot(ex, ez);
        if (e >= keep) continue;
        // to the goal's side of the wall (an attacker on the line, a defender behind it)
        a.set.x = q.x + W.ux*keep*(e > 1e-6 && ex*W.ux + ez*W.uz < 0 ? -1 : 1); a.set.z = q.z + W.uz*keep*(e > 1e-6 && ex*W.ux + ez*W.uz < 0 ? -1 : 1);
      }
    }
    const bx = a.set.x - sp.x, bz = a.set.z - sp.z, bd = hypot(bx, bz), minB = a.team === def ? RULES.WALL_D : WALL_SPEC.BALL + SEP + 0.4;
    if (bd < minB && a.team === def){ const k = (minB + 0.3)/(bd || 1); a.set.x = sp.x + bx*k; a.set.z = sp.z + bz*k; }
    else if (bd < minB){ const k = minB/(bd || 1); a.set.x = sp.x + bx*k; a.set.z = sp.z + bz*k; }
  }
}
/* the second taker of a free kick (R0.second, R0.secondAction), once when the restart is first shaped:
     'pass'   he plays it to the main taker, who strikes it (the restart is his: R0.taker becomes him, R0.fkMain the
              main taker)
     'decoy'  he runs over the ball (RULES-free: a dead ball is never touched) and on past it; the main taker strikes
     'short'  the main taker plays it to him, and he shoots
     'carry'  the main taker plays it to him, and he runs with it
   and his spot: at the ball's side (pass, decoy) or a few metres wide of it (short, carry). a.fkNext is what the man
   who gets it does with it (planFirst and brainStep's carrier), for FK_NEXT s after the restart is taken */
export const FK_ACTIONS = Object.freeze(['pass', 'decoy', 'short', 'carry']);
const FK_NEXT = 4;
function secondShape(ms, R0, sp, gx){
  if (!R0.fkInit){
    R0.fkInit = true;
    const tk = ms.agents[R0.taker], sec = ms.agents[R0.second], act = R0.secondAction;
    const ok = o => o && o.team === R0.team && o.onPitch && !o.isGK && !o.leaving && o.role === 'player';
    if (!ok(tk) || !ok(sec) || tk === sec || !FK_ACTIONS.includes(act)){ R0.second = -1; return; }
    R0.fkMain = tk.id;
    if (act === 'pass'){ R0.taker = sec.id; R0.fkPasser = sec.id; fkNext(ms, tk, 'shoot', R0); }
    else if (act === 'short') fkNext(ms, sec, 'shoot', R0);
    else if (act === 'carry') fkNext(ms, sec, 'carry', R0);
  }
  if (R0.second < 0) return;
  const main = ms.agents[R0.fkMain], sec = ms.agents[R0.second], act = R0.secondAction;
  const vx = gx - sp.x, vz = -sp.z, vl = hypot(vx, vz) || 1, ux = vx/vl, uz = vz/vl;
  // across, toward the goal's middle
  let px = -uz, pz = ux; if (pz*(sp.z > 0 ? -1 : 1) < 0){ px = -px; pz = -pz; }
  const face = {x: ux, z: uz};
  const put = (a, x, z, role, gait = 'jog') => { if (a && (!a.isMe || ms.meAI)) a.set = {x: clamp(x, -ms.spec.hx + 0.4, ms.spec.hx - 0.4), z: clamp(z, -ms.spec.hz + 0.4, ms.spec.hz - 0.4), role, face, gait, stop: 0.15}; };
  if (act === 'pass'){
    // the passer behind the ball; the main taker back and across, to strike it as it comes to him
    if (R0.stage !== 'wait' && R0.stage !== 'go') put(sec, sp.x - ux*0.9, sp.z - uz*0.9, 'taker');
    put(main, sp.x - ux*1.2 + px*2.6, sp.z - uz*1.2 + pz*2.6, 'fkmain');
  } else if (act === 'decoy'){
    // beside the main taker, then (R0.decoyGo) over the ball, a shoulder wide of it, and on 5 m past it
    if (R0.decoyGo) put(sec, sp.x + ux*5.5 - px*0.75, sp.z + uz*5.5 - pz*0.75, 'decoy', 'sprint');
    else put(sec, sp.x - ux*2.2 - px*1.6, sp.z - uz*2.2 - pz*1.6, 'fksecond');
  } else {
    // wide of the ball, level with it, for the short one
    put(sec, sp.x + px*5 - ux*0.5, sp.z + pz*5 - uz*0.5, 'fksecond');
  }
}
function fkNext(ms, a, kind, R0){ a.fkNext = {kind, R0, until: -1}; ms.fkPend = (ms.fkPend || 0) + 1; }
// the set-piece parts end FK_NEXT s after the restart is taken (or with any other restart)
function fkExpire(ms){
  let left = 0;
  for (const a of ms.agents){
    const f = a.fkNext; if (!f) continue;
    if (ms.restart === f.R0){ left++; continue; }
    if (f.until < 0) f.until = ms.t + FK_NEXT;
    if (ms.t > f.until || ms.restart){ a.fkNext = null; continue; }
    left++;
  }
  ms.fkPend = left;
}
const fkLive = (ms, a, kind) => !!(a.fkNext && a.fkNext.kind === kind && ms.restart !== a.fkNext.R0 && ms.phase === 'live');

/* cornerPlan(ms, R0, spec) -> {recv, marking}: a corner's designated receiver and marking scheme (the Phase 7
   contract, for P7-B's corners). spec = {recv: agent id or -1, marking: 'zonal' | 'man' | 'mixed', zone}: the
   receiver asked for when he is one of the side's outfield players on the pitch (and not the taker), else the side's
   best in the air in the box (heading and jumping, as cornerSlot ranks them); the marking asked for, else man to man.
   Pure, no random draw: a match never calls it */
export const MARKINGS = Object.freeze(['zonal', 'man', 'mixed']);
export function cornerPlan(ms, R0, spec = {}){
  if (!ms || !R0) return null;
  const team = R0.team, ok = o => o && o.team === team && o.onPitch && !o.isGK && !o.leaving && o.role === 'player' && o.id !== R0.taker;
  let recv = spec && spec.recv != null && spec.recv >= 0 && ok(ms.agents[spec.recv]) ? spec.recv : -1;
  if (recv < 0){
    let best = null;
    for (const o of ms.agents) if (ok(o) && (!best || o.at.heading + o.at.jumping > best.at.heading + best.at.jumping || o.at.heading + o.at.jumping === best.at.heading + best.at.jumping && o.id < best.id)) best = o;
    recv = best ? best.id : -1;
  }
  const marking = spec && MARKINGS.includes(spec.marking) ? spec.marking : 'man';
  return {recv, marking};
}

// a free kick in range: the order players take their places on the line (the best in the air first; for the defence,
// the defenders first), the rest stay back or keep their shape
function fkSlot(ms, a, attacking){
  const team = a.team, R0 = ms.restart, list = ms.agents.filter(o => o.team === team && o.onPitch && !o.isGK && !o.leaving && o.id !== R0.taker && !o.wall)
    .sort((p, q) => attacking ? (q.at.heading + q.at.jumping) - (p.at.heading + p.at.jumping) || p.id - q.id
      : (p.slotLine === 'DF' ? 0 : 1) - (q.slotLine === 'DF' ? 0 : 1) || (q.at.heading - p.at.heading) || p.id - q.id);
  return list.indexOf(a);
}
// the man a side defending a corner leaves up front: its quickest wide forward, else its quickest forward (once per
// restart; the centre forward helps in the box)
function outletOf(ms, R0, team){
  if (R0.outlet == null){
    let best = null;
    const wide = o => /^(LW|RW|LM|RM)$/.test(o.slot) ? 1 : 0;
    for (const o of ms.agents){
      if (o.team !== team || !o.onPitch || o.isGK || o.leaving || o.slotLine !== 'FWD') continue;
      if (!best || wide(o) > wide(best) || wide(o) === wide(best) && (o.at.pace > best.at.pace || o.at.pace === best.at.pace && o.id < best.id)) best = o;
    }
    R0.outlet = best ? best.id : -1;
  }
  return R0.outlet;
}
function cornerSlot(ms, a){
  // the tallest and best in the air go near and far; the rest fill the spot, the edge and back
  const team = a.team, list = ms.agents.filter(o => o.team === team && o.onPitch && !o.isGK && o.id !== ms.restart.taker)
    .sort((p, q) => (q.at.heading + q.at.jumping) - (p.at.heading + p.at.jumping) || p.id - q.id);
  return list.indexOf(a);
}
function nearestAttacker(ms, a, att){
  let best = null, bd = Infinity;
  for (const o of ms.agents){
    if (o.team !== att || !o.onPitch || o.isGK) continue;
    if (o.marker != null && o.marker !== a.id) continue;
    const x = o.set ? o.set.x : o.m.x, z = o.set ? o.set.z : o.m.z;
    const d = hypot(x - a.m.x, z - a.m.z);
    if (d < bd){ bd = d; best = o; }
  }
  if (best) best.marker = a.id;
  return best;
}

// The taker's choice once the restart is ready (3.2.8): kick-off short; throw to the best option within 25 m; goal
// kick short when it is safe, else long; corner into a zone (or short); free kick at goal in range, a cross from a wide
// angle, otherwise a pass; penalty to a side.
function decideRestart(ms, a){
  const R0 = ms.restart, team = a.team, dir = ms.dirs[team], gx = dir*ms.spec.hx, r = ms.r;
  const b = ms.ball;
  switch (R0.kind){
    case 'kickoff': {
      const mate = ms.agents[(ms.koMate || {})[team]] || nearestMate(ms, a, 4, 20, -1);
      if (mate){ startKick(ms, a, {kind: 'pass', target: {x: mate.m.x, y: R, z: mate.m.z}, recv: mate.id, contact: 0}); return; }
      startKick(ms, a, {kind: 'pass', target: {x: -dir*12, y: R, z: 4}, recv: -1, contact: 0});
      return;
    }
    case 'throw': {
      let best = null, bv = -Infinity;
      for (const o of ms.agents){
        if (o.team !== team || o === a || !o.onPitch || o.isGK) continue;
        const d = hypot(o.m.x - b.p.x, o.m.z - b.p.z);
        if (d < 3 || d > 24) continue;
        const pm = passModel(ms, b.p, o.m, 'lob', 12, o);
        const v = pm.pOK*valueAt(ms, team, o.m.x, o.m.z) + 0.02*pm.pOK - 0.0008*d;
        if (v > bv){ bv = v; best = o; }
      }
      const tg = best ? {x: best.m.x + best.m.vx*0.5, z: best.m.z + best.m.vz*0.5} : {x: b.p.x + dir*10, z: b.p.z*0.7};
      startThrow(ms, a, tg, best ? best.id : -1);
      return;
    }
    case 'goalkick': {
      // short to a centre-back or full-back when the pass is safe, else long toward the forwards
      let best = null, bv = 0.86;
      for (const o of ms.agents){
        if (o.team !== team || o === a || !o.onPitch || o.slotLine !== 'DF') continue;
        const d = hypot(o.m.x - b.p.x, o.m.z - b.p.z);
        if (d > 32 || d < 6) continue;
        const pm = passModel(ms, b.p, o.m, 'pass', passSpeedFor(d, 9), o);
        if (pm.pOK > bv){ bv = pm.pOK; best = o; }
      }
      if (best && r() < 0.6){ startKick(ms, a, {kind: 'pass', target: {x: best.m.x, y: R, z: best.m.z}, recv: best.id, contact: 0}); return; }
      const fwd = forwardTarget(ms, a, 40, 58);
      startKick(ms, a, {kind: 'goalkick', target: {x: fwd.x, y: R, z: fwd.z}, recv: fwd.id, contact: 1, speed: loftSpeedFor(hypot(fwd.x - b.p.x, fwd.z - b.p.z))*1.04});
      return;
    }
    case 'corner': {
      if (!goalOn(ms, team) || r() < 0.12){ const m = nearestMate(ms, a, 3, 14, -1); if (m){ startKick(ms, a, {kind: 'pass', target: {x: m.m.x, y: R, z: m.m.z}, recv: m.id, contact: 0}); return; } }
      const side = b.p.z > 0 ? 1 : -1, k = r();
      const zone = k < 0.4 ? [5.5, side*2.5] : k < 0.65 ? [11, 0] : [6.5, -side*3.8];
      const tx = gx - dir*zone[0], tz = zone[1];
      const d = hypot(tx - b.p.x, tz - b.p.z);
      startKick(ms, a, {kind: 'cross', target: {x: tx, y: 1.7, z: tz}, recv: -1, contact: 1, speed: loftSpeedFor(d)*1.06, curl: 0.6});
      return;
    }
    case 'free': case 'indirect': {
      const dGoal = hypot(gx - b.p.x, b.p.z), angle = Math.abs(b.p.z)/Math.max(1, Math.abs(gx - b.p.x));
      const goal = goalOn(ms, team);
      // (P7-A) Training's free kick: the second taker's routine, and what the configuration asks the taker to play
      if (R0.second >= 0 && fkRoutine(ms, a, R0)) return;
      const want = R0.plan && R0.plan.strike;
      if (want === 'shot' || want === 'cross'){
        if (want === 'shot'){ fkShot(ms, a, R0); return; }
        const tx = gx - dir*(7 + r()*5), tz = (r() - 0.5)*8;
        startKick(ms, a, {kind: 'cross', target: {x: tx, y: 1.7, z: tz}, recv: -1, contact: 1, speed: loftSpeedFor(hypot(tx - b.p.x, tz - b.p.z))*1.05});
        return;
      }
      if (goal && R0.kind === 'free' && dGoal < 30 && angle < 0.8 && r() < 0.75){
        const side = b.p.z > 0 ? -1 : 1, tz = side*(3.66 - 0.5), ty = 1.6 + r()*0.6;
        startKick(ms, a, {kind: 'shot', target: {x: gx, y: ty, z: tz}, power: 0.84, contact: 0, finesse: true, curl: 1, fk: true});
        return;
      }
      if (goal && dGoal < 42 && Math.abs(b.p.z) > 8 && r() < 0.7){
        const tx = gx - dir*(7 + r()*5), tz = (r() - 0.5)*8;
        startKick(ms, a, {kind: 'cross', target: {x: tx, y: 1.7, z: tz}, recv: -1, contact: 1, speed: loftSpeedFor(hypot(tx - b.p.x, tz - b.p.z))*1.05});
        return;
      }
      const o = decideCarrierFrom(ms, a);
      if (o){ carrierAct(ms, a, o); if (!a.act && !a.pendKick) longBall(ms, a); return; }
      longBall(ms, a);
      return;
    }
    case 'penalty': {
      const side = r() < 0.5 ? -1 : 1, tz = side*(3.66 - 0.32 - 0.55*r()), ty = r() < 0.65 ? 0.35 + r()*0.5 : 1.4 + r()*0.7;
      if (r() < 0.12){ startKick(ms, a, {kind: 'shot', target: {x: gx, y: 1.0, z: 0}, power: 0.8, contact: 0, pen: true}); return; }
      startKick(ms, a, {kind: 'shot', target: {x: gx, y: ty, z: tz}, power: 0.88, contact: 0, pen: true});
      a.penSide = side;
      return;
    }
    default: {
      const o = decideCarrierFrom(ms, a);
      if (o) carrierAct(ms, a, o);
    }
  }
}
// (P7-A) a free kick at goal: over the wall to the far side of it, or round it, with curl (the match's own strike)
function fkShot(ms, a, R0){
  const b = ms.ball, r = ms.r, gx = ms.dirs[a.team]*ms.spec.hx;
  const side = b.p.z > 0 ? -1 : b.p.z < 0 ? 1 : (r() < 0.5 ? -1 : 1), tz = side*(3.66 - 0.45 - 0.25*r()), ty = 1.5 + r()*0.7;
  startKick(ms, a, {kind: 'shot', target: {x: gx, y: ty, z: tz}, power: 0.84, contact: 0, finesse: true, curl: 1, fk: true});
}
// the taker's part in a two-man free kick (secondShape). true when it is handled this step: a kick started, or the
// main taker waiting on the decoy (nothing is struck yet)
function fkRoutine(ms, a, R0){
  const act = R0.secondAction, b = ms.ball, main = ms.agents[R0.fkMain], sec = ms.agents[R0.second];
  if (!main || !sec) return false;
  const lead = (o, k) => { const gx = ms.dirs[o.team]*ms.spec.hx, vx = gx - o.m.x, vz = -o.m.z, vl = hypot(vx, vz) || 1; return {x: o.m.x + vx/vl*k, y: R, z: o.m.z + vz/vl*k}; };
  if (act === 'pass'){
    // the passer (the restart's taker now) rolls it into the main taker's path
    const tg = lead(main, 0.9), d = hypot(tg.x - b.p.x, tg.z - b.p.z);
    startKick(ms, a, {kind: 'pass', target: tg, recv: main.id, contact: 0, speed: passSpeedFor(d, 6)});
    return true;
  }
  if (act === 'short' || act === 'carry'){
    const tg = lead(sec, act === 'carry' ? 1.5 : 0.6), d = hypot(tg.x - b.p.x, tg.z - b.p.z);
    startKick(ms, a, {kind: 'pass', target: tg, recv: sec.id, contact: 0, speed: passSpeedFor(d, act === 'carry' ? 7 : 6)});
    return true;
  }
  if (act === 'decoy'){
    if (!R0.decoyGo){ R0.decoyGo = true; R0.decoyT = ms.t; restartShape(ms); R0.shapeStep = ms.step; R0.fkWait = true; return true; }
    if (!decoyPast(ms, R0, sec) && ms.t - R0.decoyT < 2.6){ R0.fkWait = true; return true; }
    R0.fkWait = false;
    fkShot(ms, a, R0);
    return true;
  }
  return false;
}
// the decoy is past the ball: a metre beyond it on the way to goal
function decoyPast(ms, R0, sec){
  const sp = R0.spot, gx = ms.dirs[R0.team]*ms.spec.hx, vx = gx - sp.x, vz = -sp.z, vl = hypot(vx, vz) || 1;
  return ((sec.m.x - sp.x)*vx + (sec.m.z - sp.z)*vz)/vl > 1.0;
}
// a carrier's decision from a dead ball (free kicks far out): only kicks count, the best of them
function decideCarrierFrom(ms, a){
  const prev = ms.poss.ctl;
  ms.poss.ctl = a.id;
  ms.deadBall = true;
  const o = decideCarrier(ms, a);
  ms.deadBall = false;
  ms.poss.ctl = prev;
  return o && (o.kind === 'dribble' || o.kind === 'hold' || o.kind === 'shield') ? null : o;
}
// nothing better from a dead ball: a long ball to the most advanced team-mate in range
function longBall(ms, a){
  const fwd = forwardTarget(ms, a, 25, 50), b = ms.ball;
  startKick(ms, a, {kind: 'lob', target: {x: fwd.x, y: R, z: fwd.z}, recv: fwd.id, contact: 1, speed: loftSpeedFor(hypot(fwd.x - b.p.x, fwd.z - b.p.z))});
}
function nearestMate(ms, a, dmin, dmax, side){
  let best = null, bd = Infinity;
  for (const o of ms.agents){
    if (o.team !== a.team || o === a || !o.onPitch || o.isGK) continue;
    const d = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (d < dmin || d > dmax) continue;
    if (d < bd){ bd = d; best = o; }
  }
  return best;
}
// a long ball's target: the most advanced forward or midfielder between dmin and dmax away
function forwardTarget(ms, a, dmin, dmax){
  const dir = ms.dirs[a.team];
  let best = null, bv = -Infinity;
  for (const o of ms.agents){
    if (o.team !== a.team || o === a || !o.onPitch || o.isGK) continue;
    const d = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (d < dmin*0.7 || d > dmax*1.15) continue;
    const v = dir*o.m.x - 0.3*Math.abs(d - (dmin + dmax)/2);
    if (v > bv){ bv = v; best = o; }
  }
  if (best) return {x: best.m.x, z: best.m.z, id: best.id};
  return {x: a.m.x + dir*(dmin + dmax)/2, z: a.m.z*0.5, id: -1};
}

/* ---------- the step (3.2.1 step 3) ---------- */

// Every agent's decisions for this step: ball plans when the prediction changed, the carrier's decision on its cadence
// (at most 4 heavy evaluations a step, carriers first), off-ball targets at 4 Hz (agent i when step % 15 == i % 15),
// pressing and tackles, calls, set pieces; then each AI agent's intent is steered toward its target.
export function brainStep(ms, h){
  let heavy = BRAIN.HEAVY - (ms.heavyUsed || 0);
  ms.heavyUsed = 0;
  if (ms.fkPend) fkExpire(ms);
  const phase = ms.phase;
  if (phase === 'restart' || phase === 'kickoff' || phase === 'goal'){
    setPieceStep(ms, h);
    return;
  }
  if (phase !== 'live'){
    for (const a of ms.agents) if (a.onPitch && a.role === 'player' && isAI(ms, a) && !a.isGK) standStill(a);
    return;
  }
  // who goes for the ball: both sides when the path changes (or every PLAN_EVERY steps), one side a step
  if (ms.poss.ctl < 0 && ms.ball.state === 'free'){
    if (ms.planSeq !== ms.predSeq || ms.step - ms.planStep >= BRAIN.PLAN_EVERY){
      ms.planSeq = ms.predSeq; ms.planStep = ms.step;
      ms.planDue = 3; ms.planFirst = 1 - (ms.planFirst || 0);
    }
    if (ms.planDue){
      const team = ms.planDue === 3 ? ms.planFirst : ms.planDue === 1 ? 0 : 1;
      ms.planDue &= ~(1 << team);
      ballPlans(ms, team);
    }
  } else ms.planDue = 0;
  if (ms.poss.ctl >= 0) for (const a of ms.agents) if (a.plan && a.plan.kind !== 'header') a.plan = null;
  prefCapUpdate(ms);
  // the carrier: his evaluation runs over a few steps (a slice of team-mates a step); a carrier who lost the ball,
  // or is already kicking, drops it
  const c = ctlAgent(ms);
  let E = ms.carrierEval;
  if (E && (!c || E.agent !== c.id || c.act || c.pendKick || ms.ball.state !== 'free')) E = ms.carrierEval = null;
  // (P7-A) a free kick's part, for the man who has it under control: the shot, or a run with it of a few metres
  if (c && isAI(ms, c) && !c.isGK && c.fkNext && !c.act && !c.pendKick && ms.ball.state === 'free'){
    if (fkLive(ms, c, 'shoot')){ c.fkNext = null; E = ms.carrierEval = null; carrierAct(ms, c, {kind: 'shot'}); }
    else if (fkLive(ms, c, 'carry')){
      c.fkNext = null; E = ms.carrierEval = null;
      const vx = ms.dirs[c.team]*ms.spec.hx - c.m.x, vz = -c.m.z, vl = hypot(vx, vz) || 1;
      carrierAct(ms, c, {kind: 'dribble', dir: {x: vx/vl, z: vz/vl}, space: 10});
      if (c.drib) c.drib.commit = ms.t + 1.4;
    }
  }
  if (c && isAI(ms, c) && !c.isGK){
    // (a take-on under way is seen through: he does not stop to think again until he is past his man or has lost it)
    const due = (ms.t >= c.brain.next || c.brain.pending) && !c.pendKick && !(c.drib && c.drib.commit > ms.t);
    if (!E && due && !c.act && heavy > 0 && ms.ball.state === 'free'){
      c.brain.pending = false;
      const press = pressureOn(ms, c);
      const cad = (BRAIN.CARRIER0 - BRAIN.CARRIER_K*c.at.vision)*(press > 0.5 ? BRAIN.PRESSED : 1);
      c.brain.next = ms.t + Math.max(0.12, cad);
      E = ms.carrierEval = {agent: c.id, gen: carrierOptions(ms, c)};
    }
    if (E && heavy > 0){
      heavy--;
      let r = null;
      for (let i = 0; i < BRAIN.EVAL_SLICE; i++){ r = E.gen.next(); if (r.done) break; }
      if (r && r.done){
        ms.carrierEval = null;
        c.hold = null;
        carrierAct(ms, c, r.value);
      }
    }
  }
  // the player as the carrier: his team-mates call for it when they are among his best options (the HUD and audio)
  if (c && c.isMe && ms.step % 30 === 3) mateCalls(ms, c);
  // the AI player calling for the ball (harness: the player as an AI agent behaves like one who uses R)
  if (ms.meAI && ms.me >= 0 && ms.step % 20 === 11) aiMeCall(ms);
  if (ms.meAI && ms.me >= 0) meInvolved(ms);
  // a keeper with the ball in his hands is left alone to release it: nobody of theirs stands within 6 m of him
  const gkHold = c && c.isGK && ms.ball.state === 'held' && ms.ball.holder === c.id ? c : null;
  // everyone else
  const n = ms.agents.length;
  for (let i = 0; i < n; i++){
    const a = ms.agents[i];
    if (!a.onPitch || a.role !== 'player' || a.isGK || !isAI(ms, a)) continue;
    // (a shield is the carrier's: the ball gone, so is the shield)
    if (a !== c && a.intent.shield) a.intent.shield = false;
    if (a.leaving){ steer(a, a.exit.x, a.exit.z, 'jog', 0.1); continue; }
    if (gkHold && a.team !== gkHold.team){
      const dx = a.m.x - gkHold.m.x, dz = a.m.z - gkHold.m.z, d = hypot(dx, dz);
      if (d < BRAIN.GK_SPACE){
        const k = (BRAIN.GK_SPACE + 1)/(d || 1), gx = ms.dirs[gkHold.team];
        steer(a, gkHold.m.x + (d > 0.1 ? dx*k : gx*(BRAIN.GK_SPACE + 1)), gkHold.m.z + (d > 0.1 ? dz*k : 0), 'run', 0.3, null);
        a.state = 'run';
        continue;
      }
    }
    if (a.act && a.act.kind !== 'header') continue;
    if (a === c){ carrierMove(ms, a); continue; }
    // (P5-A) a practice opponent of Training's Free Play: his behaviour, in the training mode only
    if (a.drill && ms.mode === 'train' && drillMove(ms, a, c)) continue;
    // a runner holding the line goes the moment the pass to him is struck
    const run = a.task.run;
    // ((P6-B) in Training Mode, at the moment it is struck, not as the passer shapes to strike it: a run that starts with
    // the wind-up can carry him past the line before the contact, which is when the law looks)
    if (run && !run.go && c && c.team === a.team && c.act && c.act.kind === 'kick' && c.act.action && c.act.action.recv === a.id && (ms.mode !== 'train' || c.act.ev)){ run.go = true; a.tgtSet = false; }
    const p = a.plan;
    if (p && (p.kind === 'receive' || p.kind === 'chase' || p.kind === 'intercept')){
      // to the reach point, in time (a sprint when the margin is thin), facing the ball
      const b = ms.ball.p, face = faceTo(a, b.x, b.z, a.faceV);
      const d = hypot(p.x - a.m.x, p.z - a.m.z), tLeft = Math.max(0.05, p.t - (ms.t - p.at));
      const need = d/tLeft;
      const gait = need > a.prm.run*0.9 || p.kind !== 'receive' && d > 3 ? 'sprint' : need > a.prm.jog*0.8 ? 'run' : 'jog';
      steer(a, p.x, p.z, gait, 0.2, d < 3 ? face : null);
      a.state = 'run';
      if (p.kind !== 'receive') looseChallenge(ms, a);
      continue;
    }
    if (p && p.kind === 'header'){
      const tLeft = p.t - (ms.t - p.at);
      steer(a, p.x, p.z, 'sprint', 0.15);
      if (!a.act && tLeft < 0.75 && tLeft > 0.12){
        const hd = p.hdr || {intent: 'clear'};
        startHeader(ms, a, tLeft, hd.intent, hd.target, 1, false, p.y != null ? p.y : null);   // (U7) the leap sized to the ball, as the player's is
        a.act.recv = -1;
      }
      if (tLeft < -0.2) a.plan = null;
      continue;
    }
    // the presser (never a keeper holding the ball)
    if (a.task.press === 1 && c && c.team !== a.team && ms.phase === 'live' && !gkHold){ pressMove(ms, a, c); continue; }
    if (a.state === 'jockey') a.state = 'idle';
    // off-ball targets at 4 Hz
    if ((ms.step % BRAIN.OFFBALL_EVERY) === (a.id % BRAIN.OFFBALL_EVERY) || !a.tgtSet){
      const t = decideOffBall(ms, a);
      a.tgt.x = t.x; a.tgt.z = t.z; a.tgt.gait = t.gait; a.tgt.face = t.face; a.tgt.stop = t.stop; a.tgtSet = true;
    }
    const T = a.tgt;
    // never into the ball's way when a team-mate has it at his feet: hold the target
    let gait = T.gait;
    if ((a.st.B < 25) && gait === 'sprint') gait = 'run';
    const face = T.face || (hypot(T.x - a.m.x, T.z - a.m.z) < 2 ? faceTo(a, ms.ball.p.x, ms.ball.p.z, a.faceV) : null);
    steer(a, T.x, T.z, gait, T.stop, face);
    a.state = a.m.speed > 0.3 ? 'run' : 'idle';
  }
}

// set pieces: everyone to his spot, the taker through the restart's stages, and his choice when it is ready
function setPieceStep(ms, h){
  const R0 = ms.restart;
  if (R0 && (ms.step - (R0.shapeStep || -99) >= 15)){ restartShape(ms); R0.shapeStep = ms.step; }
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== 'player' || a.isGK || !isAI(ms, a)) continue;
    if (a.leaving){ steer(a, a.exit.x, a.exit.z, 'jog', 0.1); continue; }
    if (a.act) continue;
    const s = a.set;
    if (!s){ standStill(a); continue; }
    const d = hypot(s.x - a.m.x, s.z - a.m.z);
    // the taker sprints to a far spot, and to any but the last few metres once the restart is past its limit (a corner
    // taker picked for his delivery may have the length of the pitch to come)
    const hurry = s.role === 'taker' && (d > RULES.SPRINT_D || d > 6 && !!R0 && ms.t - R0.t0 > R0.limit);
    const gait = s.gait === 'sprint' || hurry ? 'sprint' : s.gait === 'run' || d > 6 ? 'run' : s.gait === 'walk' ? 'walk' : 'jog';
    const face = s.face || (d < 1.5 ? faceTo(a, ms.ball.p.x, ms.ball.p.z, a.faceV) : null);
    steer(a, s.x, s.z, gait, s.stop != null ? s.stop : 0.3, face, s.speedCap != null ? s.speedCap : Infinity);
  }
  if (R0 && R0.ready && !R0.taken){
    const tk = ms.agents[R0.taker];
    if (tk && isAI(ms, tk) && !tk.act){
      if (tk.isGK && R0.kind !== 'goalkick') return;
      R0.fkWait = false;
      decideRestart(ms, tk);
      // free kick: the wall jumps at the kick, each with probability 0.6 ((P7-A) at a strike, not at a two-man
      // routine's pass nor while the main taker waits on his decoy)
      const routine = R0.second >= 0 || !!R0.wallSpec;
      if (R0.kind === 'free' && (!routine || !R0.fkWait && tk.act && tk.act.action && tk.act.action.kind === 'shot'))
        for (const id of R0.wall){ const w = ms.agents[id]; if (w && !w.act && !(w.isMe && !ms.meAI) && ms.r() < RULES.WALL_JUMP) startHeader(ms, w, 0.35, 'clear', null, 0); }
    }
    // (P7-A) my own free kick with a decoy: he goes a moment after it is ready, so my run-up follows his
    else if (tk && !isAI(ms, tk) && R0.second >= 0 && R0.secondAction === 'decoy' && !R0.decoyGo){
      if (R0.readyAt == null) R0.readyAt = ms.t;
      if (ms.t - R0.readyAt >= 1.2){ R0.decoyGo = true; R0.decoyT = ms.t; restartShape(ms); R0.shapeStep = ms.step; }
    }
  }
}

// the player's team-mates calling for the ball when he has it: the two best options above 0.6 of the best
function mateCalls(ms, me){
  const opts = [];
  for (const o of ms.agents){
    if (o.team !== me.team || o === me || !o.onPitch || o.isGK) continue;
    const d = hypot(o.m.x - me.m.x, o.m.z - me.m.z);
    if (d < 5 || d > 40) continue;
    const pm = passModel(ms, me.m, o.m, 'pass', passSpeedFor(d, 9), o);
    opts.push({o, V: pm.pOK*valueAt(ms, o.team, o.m.x, o.m.z)});
  }
  if (!opts.length) return;
  opts.sort((p, q) => q.V - p.V || p.o.id - q.o.id);
  const best = opts[0].V;
  for (const x of opts.slice(0, 2)){
    if (x.V < 0.6*best || ms.t - (x.o.lastCall || -99) < BRAIN.CALL_COOL) continue;
    x.o.lastCall = ms.t; raiseHand(x.o, ms.t);
    logEv(ms, 'call', x.o.team, x.o.id, x.o.m.x, x.o.m.z, {how: 'here', to: me.id});
  }
}
// the AI-driven player (the harness's stand-in for the player): when he was last in the play (a touch, a kick, a tackle,
// a challenge, a pass to him), so that he comes looking for the ball after a long spell without it, as a player does
function meInvolved(ms){
  const me = ms.agents[ms.me], E = ms.events;
  for (let i = ms.meInvSeen || 0; i < E.length; i++){
    const e = E[i];
    if (e.agent === me.id && (e.kind === 'touch' || e.kind === 'kick' || e.kind === 'tackle' || e.kind === 'challenge') || e.kind === 'kick' && e.recv === me.id) me.invT = e.t;
  }
  ms.meInvSeen = E.length;
}
// the AI-driven player calls "Here!" when he is open and a good option, with the R tap's cooldown and halving
function aiMeCall(ms){
  const me = ms.agents[ms.me], c = ctlAgent(ms);
  if (!me || !me.onPitch || !c || c.team !== me.team || c === me) return;
  if (ms.t - (me.lastCall || -99) < BRAIN.CALL_COOL) return;
  const d = hypot(c.m.x - me.m.x, c.m.z - me.m.z);
  if (d < 6 || d > 35) return;
  if (pressureOn(ms, me) > 0.2) return;
  const vm = valueAt(ms, me.team, me.m.x, me.m.z), vc = valueAt(ms, me.team, c.m.x, c.m.z);
  if (vm < vc*0.9) return;
  if (lawOf(ms, 'offside') && offsidePosition(ms, me, me.team).off) return;
  callFor(ms, me, 'here', null);
}
// a call for the ball (the player's R, or the AI player's): the preference for 2.5 s, half within 20 s of the last
export function callFor(ms, a, how = 'here', point = null){
  const k = ms.t - (a.lastCall || -99) < BRAIN.CALL_HALF ? 0.5 : 1;
  a.lastCall = ms.t; a.calls++; raiseHand(a, ms.t);
  ms.call = {agent: a.id, t: ms.t, k, how, point};
  ms.pref.calls++;
  // (U10) the man on the ball hears it now: his next look at his options comes at once, not on his own cadence
  const c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
  // (a kick he has chosen and is still working the ball into his stride for, to somebody else, is thought again, as a
  // pass whose lane closed is: pendingKick; one already being struck is not. At most once in CALL_T s for the same
  // caller: a call is heard, never a veto, so pressing R over and over cannot keep calling off his pass to another man)
  if (c && c !== a && c.team === a.team && c.brain){
    if (c.pendKick && !c.act && c.pendKick.rq && c.pendKick.rq.recv !== a.id && ms.t - (a.callCut ?? -99) >= BRAIN.CALL_T){
      c.pendKick = null; a.callCut = ms.t;
    }
    c.brain.pending = true;
  }
  logEv(ms, 'call', a.team, a.id, a.m.x, a.m.z, {how, px: point ? point.x : null, pz: point ? point.z : null});
}
