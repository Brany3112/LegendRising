// js/life/football/actions.js: everything a body does to the ball, for any agent. The player's controls (control.js)
// and the AI (brain.js, gkbrain.js) both produce the same Action records; this module carries them out: strikes with
// their contact scheduled inside the reach window (a stride adjust when the ball is not there yet, a scuff when it never
// comes, never a silent cancel), the first touch, dribble touches on the footfalls of the gait clock, standing tackles,
// pokes and slides decided by what the sweeping foot meets first, headers off a real jump, throw-ins, blocks, and the
// steering that turns a target into the mover's intent. Each touch is a real kick of the one ball (ball.js) and an
// entry in the log (events.js).
// Owner: WP-E. Contract DESIGN 1.4.14 (Action, actionStep, canStrike); numbers 1.5.3; behaviour 3.1.7.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {ballKick, ballPredict, ballRelease, ballHold, BALL} from "./ball.js";
import {planShot, solveStrike, idealPassSpeed, shotSpeed} from "./strike.js";
import {reachEnvelope, firstTouch, dribbleTouch, dribbleCadence, tackleOutcome, slideProfile, slideDistance, headerContact,
  classifyContact, TOUCH, TACKLE} from "./touch.js";
import {stamAction} from "../stamina.js";
import {logEv, chainKick, chainControl, chainKeep, chainTouch} from "./events.js";
import {onKick, onTouch, setCtl, clearCtl, foul, restartTaken} from "./rules.js";
import {xgAt, decisionRecord} from "./judge.js";
import {jumpHeight} from "./agent.js";
import {jumpRoot} from "./gkplan.js";
import {dirOf, yawOf, wrapA} from "./pitchspec.js";
import {sin, cos, hypot, atan2} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180, R = BALL.R, G = 9.81;

// 1.5.3 and 3.1.7 numbers
export const ACT = Object.freeze({
  SAFETY: [16, 2.2, 15, 0.6],     // a clearing header for safety: within 16 m of his goal line, an attacker within 2.2 m
                                  // or the ball faster than 15 m/s, taken 60% of the time
  REACH0: 0.45, REACH1: 0.90, REACH_LAT: 0.5,   // the ball's place for a strike: 0.45 to 0.90 m ahead, within 0.5 m across
  TC_MAX: 0.18, ADJUST: 0.35, SCUFF_D: 1.3,     // contact within 0.18 s; a stride adjust of at most 0.35 s; a scuff up to 1.3 m
  FOLLOW: 0.28,                                 // follow-through after contact
  GHOST: 0.3,                                   // the kicker cannot play his own kick again this soon
  LOSE_CTL: 2.4,                                // control is lost when the ball is this far from the controller
  HEADER_LOAD: 0.18, HEADER_RECOVER: 0.25,
  THROW_DUR: 1.0, THROW_REL: 0.62, THROW_Y: 2.0,
  BLOCK_GLANCE: 0.7, BLOCK_BACK: [0.25, 0.45],     // most blocks glance on (turned), the rest come back off the shin at this share
  BLOCK_KEEP: [0.5, 0.85],                     // a leg block keeps this share of the ball's speed
  BLOCK_TURN: [45, 70], BLOCK_LOOP: 4,         // degrees a glance and a square block turn it, at most; a glance loops up to 4 m/s
  SETTLE: [0.12, 0.25, 1.0],                   // the first decision after a reception: pressed, a heavy touch, settled on it
});

/* ---------- the shared ball path cache (1.5.6) ---------- */

// refresh ms.pred: 90 samples at 30 Hz of the live ball (ball.js ballPredict, no bodies)
export function refreshPred(ms){
  ms.predN = ballPredict(ms.ball, ms.bw, ms.pred, 90, 30);
  ms.predAt = ms.step; ms.predT = ms.t;
  ms.predSeq = (ms.predSeq || 0) + 1;
  return ms.predN;
}
// the predicted ball at time t from now (interpolated), out {x, y, z}
export function predAt(ms, t, out){
  const P = ms.pred, n = ms.predN, dt0 = ms.t - ms.predT;
  const tt = t + dt0, k = clamp(tt*30, 0, n - 1.001), i = Math.floor(k), f = k - i, o = 4*i;
  if (n <= 0){ out.x = ms.ball.p.x; out.y = ms.ball.p.y; out.z = ms.ball.p.z; return out; }
  if (i >= n - 1){ out.x = P[4*(n - 1)]; out.y = P[4*(n - 1) + 1]; out.z = P[4*(n - 1) + 2]; return out; }
  out.x = P[o] + (P[o + 4] - P[o])*f; out.y = P[o + 1] + (P[o + 5] - P[o + 1])*f; out.z = P[o + 2] + (P[o + 6] - P[o + 2])*f;
  return out;
}

/* ---------- steering ---------- */

// Turn a target into the mover's intent: run (at a gait) toward (tx, tz), slowing so that the brakes stop him at it
// (within `stop` metres he stands), facing `face` ({x, z} direction) when given. cap: a speed cap. Returns the distance.
export function steer(a, tx, tz, gait = 'jog', stop = 0.3, face = null, cap = Infinity, strafe = false){
  const m = a.m, I = a.intent, dx = tx - m.x, dz = tz - m.z, d = hypot(dx, dz);
  I.face = face; I.strafe = strafe; I.gait = gait;
  if (d <= stop){ I.dx = 0; I.dz = 0; I.speedCap = cap; return d; }
  I.dx = dx/d; I.dz = dz/d;
  I.speedCap = Math.min(cap, Math.sqrt(2*6.5*Math.max(0, d - stop*0.5)) + 0.15);
  return d;
}
export function standStill(a, face = null){ const I = a.intent; I.dx = 0; I.dz = 0; I.face = face; I.speedCap = Infinity; I.strafe = false; }
// the facing toward a point, as an intent face
export function faceTo(a, x, z, out = {x: 0, z: 0}){
  const dx = x - a.m.x, dz = z - a.m.z, d = hypot(dx, dz) || 1;
  out.x = dx/d; out.z = dz/d;
  return out;
}

/* ---------- strikes (3.1.7) ---------- */

// the foot a ball on this side is struck with: the strong foot unless it is over 0.25 m to the weak side
function footFor(a, lat){
  const pf = a.foot || 'R';
  if (pf === 'B') return lat >= 0 ? 'R' : 'L';
  if (pf === 'R' && lat < -TOUCH.WEAK_SIDE) return 'L';
  if (pf === 'L' && lat > TOUCH.WEAK_SIDE) return 'R';
  return pf;
}
// where the ball is relative to the body: ahead along the facing, across (+ to his right), and the distance
const RB = {ahead: 0, lat: 0, dist: 0};
function relBall(a, b, out = RB){
  const m = a.m, f = dirOf(m.yaw), dx = b.p.x - m.x, dz = b.p.z - m.z;
  out.ahead = dx*f.x + dz*f.z; out.lat = dx*(-f.z) + dz*f.x; out.dist = hypot(dx, dz);
  return out;
}

// The reach window for release-to-contact (1.4.14, 1.5.3): the ball 0.45 to 0.90 m ahead on the kicking side and within
// 0.5 m across, low: contact on the next swing, at most 0.18 s later. Returns {ok, side, tc} plus foot and the geometry.
export function canStrike(a, ball){
  const r = relBall(a, ball, {ahead: 0, lat: 0, dist: 0});
  const foot = footFor(a, r.lat), side = foot === 'R' ? 1 : -1;
  const s = a.scale || 1;
  const low = ball.p.y - (a.y || 0) < 0.6*s;
  const ok = low && r.ahead >= ACT.REACH0*0.6 && r.ahead <= ACT.REACH1*s && Math.abs(r.lat) <= ACT.REACH_LAT;
  // the next swing: sooner when the ball is well placed, a little later at the edge of the window
  const tc = ok ? clamp(0.11 + 0.07*Math.abs(r.ahead - 0.65)/0.25, 0.10, ACT.TC_MAX) : ACT.TC_MAX;
  return {ok, side, tc, foot, ahead: r.ahead, lat: r.lat, dist: r.dist};
}

// Begin a kick (shot, pass, through ball, cross, lob, clear, goal kick, punt). action = {kind, target: {x, y, z}, recv,
// power (0..1 for shots, the speed in m/s for passes when speed is given), speed, contact, finesse, firstTime}.
// Contact comes at the scheduled step: within 0.18 s with the ball in reach, else after a stride adjust of up to
// 0.35 s, then a scuff if it is still not there.
export function startKick(ms, a, action){
  const cs = canStrike(a, ms.ball);
  // a dead ball (a set piece) is walked up to: the run-up has no 0.35 s limit, only a generous one
  const dead = ms.ball.state === 'dead' || ms.restart && ms.restart.taker === a.id;
  a.act = {kind: 'kick', action, t: 0, tc: cs.ok ? cs.tc : ACT.ADJUST + ACT.TC_MAX, adjust: !cs.ok, dur: (cs.ok ? cs.tc : ACT.ADJUST) + ACT.FOLLOW,
    foot: cs.foot, side: cs.side, done: false, plan: null, startStep: ms.step, contactStep: -1, adjustMax: dead ? 3.0 : ACT.ADJUST};
  a.state = 'strike'; a.stateT = 0;
  if (a.drib) a.drib = null;
  return a.act;
}

// the speed of a ground pass for an arrival speed (auto weight: 9 m/s, clamped 8 to 10)
export function passSpeedFor(d, arrive = 9, roll = 1.1){ return idealPassSpeed(Math.max(1, d), clamp(arrive, 6, 10), roll); }

// a lofted ball's speed for a distance: enough that a launch of about 25 to 35 degrees with backspin carries it
export function loftSpeedFor(d){ return clamp(Math.sqrt(12.5*Math.max(4, d))*(1 + 0.005*d), 9, 30); }

const BS = {x: 0, y: 0, z: 0};
// the contact itself: plan the launch with the ball as it is now (touch the one ball through ballKick), log the kick
function strikeContact(ms, a, act, scuff){
  const b = ms.ball, rq = act.action, at = a.at, fac = a.fac || {};
  const r = relBall(a, b, {ahead: 0, lat: 0, dist: 0});
  if (r.dist > ACT.SCUFF_D || b.p.y - (a.y || 0) > 1.0 || b.state === 'held' && b.holder !== a.id){
    // the ball is gone: an air kick, still a kick in the log (never a silent cancel)
    const ev = logEv(ms, 'kick', a.team, a.id, a.m.x, a.m.z, {intent: rq.kind, recv: rq.recv != null ? rq.recv : -1, whiff: true, speed: 0});
    act.done = true; act.ev = ev;
    return ev;
  }
  const foot = footFor(a, r.lat), weak = a.foot === 'B' ? 'both' : foot !== (a.foot || 'R');
  const tgt = rq.target || {x: a.m.x + dirOf(a.m.yaw).x*20, y: R, z: a.m.z + dirOf(a.m.yaw).z*20};
  let tx = tgt.x, ty = tgt.y != null ? tgt.y : R, tz = tgt.z;
  const kind = rq.kind;
  const isShot = kind === 'shot';
  // the scuff (1.5.3): aim lerped 25% toward the goal centre or the receiver's feet
  if (scuff){
    if (isShot){ const gx = ms.dirs[a.team]*ms.spec.hx; tx += (gx - tx)*0.25; tz += (0 - tz)*0.25; ty += (1.0 - ty)*0.25; }
    else if (rq.recv >= 0 && ms.agents[rq.recv]){ const q = ms.agents[rq.recv].m; tx += (q.x - tx)*0.25; tz += (q.z - tz)*0.25; }
  }
  const dist = hypot(tx - b.p.x, tz - b.p.z);
  const kdir = yawOf(tx - b.p.x, tz - b.p.z);
  const bodyAngleDeg = Math.abs(wrapA(kdir - a.m.yaw))/DEG;
  const plantErr = clamp(Math.abs(r.ahead - 0.65) - 0.15, 0, 0.4) + (scuff ? 0.2 : 0);
  const sp = hypot(b.v.x, b.v.y, b.v.z);
  const air = b.p.y > R + 0.05;
  const ballState = !air ? (sp < 0.4 ? 'still' : 'rolling') : (b.v.y < 0 && b.p.y > 0.35 ? 'volley' : 'bouncing');
  const first = !(ms.poss.ctl === a.id) || !!rq.firstTime;
  const pr = pressureOn(ms, a);
  const contact = rq.contact != null ? rq.contact : 0;
  let speed, ctxKind, acc;
  if (isShot){
    const p = clamp(rq.power != null ? rq.power : 0.85, 0.05, 1);
    speed = shotSpeed(at.power, p, !!at.strikeBoots, fac.power != null ? fac.power : 1)*(rq.finesse ? 0.92 : 1);
    if (rq.finesse) speed = Math.min(speed, shotSpeed(at.power, 0.85, !!at.strikeBoots, fac.power != null ? fac.power : 1));
    ctxKind = contact > 0 && rq.chip ? 'chip' : 'shot'; acc = at.accuracy;
  } else {
    speed = rq.speed != null ? rq.speed : kind === 'pass' || kind === 'through' || kind === 'roll' ? passSpeedFor(dist, 9, b.rollDecel) : loftSpeedFor(dist);
    speed *= fac.power != null ? 0.95 + 0.05*fac.power : 1;
    ctxKind = kind === 'clear' || kind === 'goalkick' || kind === 'punt' ? 'clear' : kind; acc = at.passAcc;
  }
  if (scuff) speed *= 0.55;
  const req = {from: {x: b.p.x, y: b.p.y, z: b.p.z}, target: {x: tx, y: ty, z: tz}, speed, contact, curl: rq.finesse ? (rq.curl != null ? rq.curl : 1) : (rq.curl || 0),
    foot, kind: ctxKind === 'chip' ? 'chip' : ctxKind, rollDecel: b.rollDecel, curve: at.curve, aero: at.aero};
  const ctx = {kind: ctxKind, dist, power01: isShot ? clamp(rq.power != null ? rq.power : 0.85, 0, 1) : 0.6, acc, contact, weakFoot: weak,
    bodyAngleDeg, plantErr, ballState, pressure01: pr, composure: at.composure, bF: fac.bF != null ? fac.bF : 1, eF: fac.eF != null ? fac.eF : 1,
    finesse: !!rq.finesse, firstTime: first && sp > 1, vIn: first ? sp : 0, power: at.power, scuff: !!scuff,
    weightSigma: isShot ? undefined : rq.charged ? (rq.sweet ? 0.02 : 0.0) : (1 - at.passing/120)*0.12};
  // the player's decision, recorded with his options as they were at the strike (judged later: 3.2.11)
  if (a.isMe && !rq.noRecord && (isShot || kind === 'pass' || kind === 'through' || kind === 'cross' || kind === 'lob')){
    const rec = decisionRecord(ms, a, {choice: isShot ? 'shoot' : kind === 'cross' ? 'cross' : 'pass', recv: rq.recv != null ? rq.recv : -1,
      setPiece: ms.restart && ms.restart.taker === a.id ? (ms.restart.kind === 'penalty' ? 'penalty' : ms.restart.kind === 'free' ? 'freekick' : null) : null});
    logEv(ms, 'decision', a.team, a.id, b.p.x, b.p.z, {rec});
  }
  const plan = planShot(req, ctx, ms.r);
  const L = plan.launch;
  ballKick(b, L.v, L.w, {agent: a.id, team: a.team, kind: isShot ? 'shot' : kind, aero: at.aero, t: ms.t, knuck: L.knuck});
  stamAction(a.st, isShot ? 'shot' : 'pass');
  if (ms.poss.ctl === a.id) clearCtl(ms);
  a.drib = null;
  refreshPred(ms);
  const extra = {intent: kind === 'roll' ? 'roll' : kind, recv: rq.recv != null ? rq.recv : -1, speed: Math.round(hypot(L.v.x, L.v.y, L.v.z)*100)/100,
    contact, finesse: !!rq.finesse, firstTime: ctx.firstTime, dist: Math.round(dist*10)/10, scuff: !!scuff, curl: req.curl,
    tx: Math.round(tx*100)/100, ty: Math.round(ty*100)/100, tz: Math.round(tz*100)/100};
  if (isShot || rq.atGoal){
    extra.xg = Math.round(xgAt(ms, a.team, b.p.x, b.p.z)*1000)/1000;
    extra.onTarget = predOnTarget(ms, a.team);
    extra.sigma = Math.round(plan.sigma*1e4)/1e4;
    if (isShot) ms.stats.shots[a.team]++;
  } else if (kind !== 'clear') ms.stats.passes[a.team]++;
  if (rq.pOK != null) extra.pOK = Math.round(rq.pOK*100)/100;
  if (rq.fk) extra.fk = true;
  if (rq.pen) extra.pen = true;
  // the target in the team frame, and how far forward the kick sends it
  const dirT = ms.dirs[a.team];
  extra.tu = Math.round((dirT*tx + ms.spec.hx)*100)/100; extra.tw = Math.round((dirT*tz + ms.spec.hz)*100)/100;
  extra.gain = Math.round((extra.tu - (dirT*b.p.x + ms.spec.hx))*100)/100;
  const restart = ms.restart && ms.restart.taker === a.id && !ms.restart.taken ? ms.restart : null;
  if (restart && restart.noOff) extra.noOffside = true;
  const ev = logEv(ms, 'kick', a.team, a.id, b.p.x, b.p.z, extra);
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onTouch(ms, a, 'kick', ev);
  onKick(ms, ev);
  // was the intended receiver beyond the line at the contact (the AI's through balls are checked on this)
  if (ev.recv >= 0 && ms.offside.set.has(ev.recv) && ms.offside.set.get(ev.recv) > 0.01) ev.recvOff = true;
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
  act.done = true; act.ev = ev; act.contactStep = ms.step;
  return ev;
}
// is the predicted path inside the frame at the goal line (before any save or block)? Interpolated on ms.pred.
function predOnTarget(ms, team){
  const P = ms.pred, n = ms.predN, dir = ms.dirs[team], gx = dir*(ms.spec.hx + R), mh = 3.66 - 0.0, top = 2.44;
  for (let k = 1; k < n; k++){
    const x0 = P[4*(k - 1)], x1 = P[4*k];
    if ((x0 - gx)*dir < 0 && (x1 - gx)*dir >= 0){
      const f = (gx - x0)/(x1 - x0 || 1e-9), y = P[4*(k - 1) + 1] + f*(P[4*k + 1] - P[4*(k - 1) + 1]), z = P[4*(k - 1) + 2] + f*(P[4*k + 2] - P[4*(k - 1) + 2]);
      return Math.abs(z) < mh && y < top;
    }
  }
  return false;
}
// pressure on an agent: the nearest opponent's closeness, 0 at 3 m or more, 1 at contact
export function pressureOn(ms, a){
  let d = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || o.team < 0 || !o.onPitch) continue;
    const dd = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (dd < d) d = dd;
  }
  return clamp(1 - (d - 0.6)/2.4, 0, 1);
}

/* ---------- receiving, interceptions and blocks (3.1.4, 3.1.7) ---------- */

// The first touch: the ball in the agent's envelope and he wants it (the intended receiver, a chaser, an interceptor,
// or a defender in its path with nothing queued). push: the WASD direction (player) or the AI's next direction.
export function receive(ms, a, push = null, pushK = 0.5){
  const b = ms.ball, fac = a.fac || {};
  const vIn = hypot(b.v.x, b.v.y, b.v.z);
  const ft = firstTouch(a, b, {dir: push, push: pushK}, {ctrl: a.at.ctrl, pressure01: pressureOn(ms, a), bF: fac.bF != null ? fac.bF : 1,
    rollDecel: b.rollDecel}, ms.r);
  ballKick(b, ft.v, null, {agent: a.id, team: a.team, kind: 'control', aero: 0, t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'control', quality: Math.round(ft.quality*100)/100, heavy: ft.heavy,
    part: ft.part, vIn: Math.round(vIn*10)/10});
  chainControl(ms, a, 'control', ev);
  onTouch(ms, a, 'control', ev);
  setCtl(ms, a);
  a.plan = null; a.drib = null; a.ctlT = ms.t;
  // he looks up once it is under control: at once under pressure, after a heavy touch a little later, unpressed he settles it
  const prs = pressureOn(ms, a);
  a.brain.next = ms.t + (prs > 0.5 ? ACT.SETTLE[0] : ft.heavy ? ACT.SETTLE[1] : ACT.SETTLE[2]);
  a.brain.pending = false;
  refreshPred(ms);
  return ev;
}
// a leg block of a ball too fast to control: it keeps a quarter to a half of its pace, turned off the leg
export function block(ms, a){
  const b = ms.ball, r = ms.r;
  // a glancing touch sends it on, turned (often wide of where it was going); a square one sends it back off the shin
  const glance = r() < ACT.BLOCK_GLANCE;
  const k = glance ? ACT.BLOCK_KEEP[0] + (ACT.BLOCK_KEEP[1] - ACT.BLOCK_KEEP[0])*r() : -(ACT.BLOCK_BACK[0] + (ACT.BLOCK_BACK[1] - ACT.BLOCK_BACK[0])*r());
  // a glance turns it hard (off the side of the boot or the shin, often looping up), a square block less
  const spread = glance ? ACT.BLOCK_TURN[0] : ACT.BLOCK_TURN[1];
  const ang = (r() - 0.5)*2*spread*DEG, c = cos(ang), s = sin(ang);
  const vx = b.v.x*k, vz = b.v.z*k;
  ballKick(b, {x: vx*c - vz*s, y: Math.max(0, b.v.y*k) + (glance ? ACT.BLOCK_LOOP*r() : 0.6*r()), z: vx*s + vz*c}, null, {agent: a.id, team: a.team, kind: 'block', t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'block', quality: 0});
  chainTouch(ms, a, 'block', ev);
  onTouch(ms, a, 'block', ev);
  clearCtl(ms);
  refreshPred(ms);
  return ev;
}
// a ball that hit a body (ball.js 'body' event, not a keeper's hands): a deflection or a block in the log
export function bodyContact(ms, a, part){
  const how = classifyContact(a, ms.ball, a.state === 'jockey' || a.state === 'tackle' || a.state === 'slide' ? {stance: a.state} : null) === 'block' ? 'block' : 'deflect';
  const b = ms.ball;
  b.last.kind = 'deflect';
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how, part, quality: 0});
  chainTouch(ms, a, how, ev);
  onTouch(ms, a, 'deflect', ev);
  if (ms.poss.ctl >= 0 && ms.poss.ctl !== a.id) clearCtl(ms);
  return ev;
}

// Every step before the ball moves: does the ball enter somebody's reach who will play it? The intended receiver and
// a chaser control it (or play the first-time action they planned); a defender in its path with nothing queued
// controls it under 8 + 0.12 interception m/s and blocks it above; a team-mate with nothing queued takes it when he is
// the nearest. The controller's own dribble touches come from his footfalls (dribbleFoot), not from here.
export function touchCheck(ms){
  const b = ms.ball;
  if (b.state !== 'free' || ms.phase !== 'live') return false;
  // a ball under somebody's control is only taken off him by a tackle
  if (ms.poss.ctl >= 0) return false;
  const sp = hypot(b.v.x, b.v.y, b.v.z);
  let best = null, bd = Infinity;
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== 'player' || a.leaving) continue;
    if (a.id === ms.poss.ctl) continue;
    const m = a.m, dx = b.p.x - m.x, dz = b.p.z - m.z;
    if (dx > 1.6 || dx < -1.6 || dz > 1.6 || dz < -1.6) continue;
    if (a.id === b.last.agent && ms.t - b.last.t < ACT.GHOST) continue;
    if (a.act && (a.act.kind === 'kick' && !a.act.done || a.act.kind === 'header' || a.act.kind === 'tackle' || a.act.kind === 'slide' || a.act.kind === 'throw')) continue;
    if (a.isGK && a.gk && (a.gk.state === 'dive' || a.gk.state === 'hold')) continue;
    if (a.m.stagger > 0.2 || a.state === 'ground' || ms.t < (a.noTouch || 0)) continue;
    const env = reachEnvelope(a, b);
    if (!env || env.part === 'head') continue;
    const d = env.dist;
    if (d < bd){ bd = d; best = a; }
  }
  if (!best) return false;
  const a = best, plan = a.plan;
  const wantsIt = plan && (plan.kind === 'receive' || plan.kind === 'chase' || plan.kind === 'intercept');
  const lastTeam = b.last.team;
  // a first-time action planned on arrival
  if (wantsIt && plan.first && plan.first.kind){
    const cs = canStrike(a, b);
    if (cs.ok || bd < 0.9){
      a.plan = null;
      startKick(ms, a, plan.first);
      a.act.tc = Math.min(a.act.tc, 0.05); a.act.adjust = false;
      return true;
    }
  }
  if (a.isGK && a.gk && inOwnBox(ms, a) && !a.gk.noHands && b.p.y < 2.2 && !(lastTeam === a.team && b.last.kind !== 'deflect' && b.last.kind !== 'block')){
    // a keeper in his box gathers it in his hands (gkbrain decides the hold)
    if (ms.gkCollect){ ms.gkCollect(ms, a); return true; }
  }
  const opp = lastTeam >= 0 && lastTeam !== a.team;
  if (opp){
    // interception by positioning (1.5.3): controlled under 8 + 0.12 interception, blocked above
    const cls = classifyContact(a, b, wantsIt ? 'intercept' : 'intercept');
    if (cls === 'control' || wantsIt && sp < 8 + 0.12*a.at.interception + 4){ receive(ms, a, a.plan && a.plan.push, 0.45); return true; }
    block(ms, a);
    return true;
  }
  // own side: the receiver, a chaser, or the nearest team-mate with nothing queued
  const cls = classifyContact(a, b, 'receive');
  if (cls === 'control'){ receive(ms, a, a.plan && a.plan.push, 0.5); return true; }
  if (wantsIt){ block(ms, a); return true; }
  return false;
}
function inOwnBox(ms, a){
  const dir = ms.dirs[a.team], ex = -dir*a.m.x;
  return ex >= ms.spec.hx - 16.5 && Math.abs(a.m.z) <= 20.16;
}

/* ---------- dribbling (3.1.4) ---------- */

// On a footfall of the controller: a dribble touch when the cadence says so (every stride under 3 m/s, every second
// stride to 6, every third above) and the ball is within 0.9 m and 50 degrees ahead, along a.drib.dir.
export function dribbleFoot(ms, a, side){
  const b = ms.ball;
  if (ms.poss.ctl !== a.id || b.state !== 'free' || !a.drib) return false;
  const v = a.m.speed;
  if (side === touchSideOf(a)) a.strides++;
  const every = dribbleCadence(v);
  if (a.strides < every && v > 0.6) return false;
  const r = relBall(a, b, {ahead: 0, lat: 0, dist: 0});
  if (r.dist > TOUCH.DRIB_REACH || r.ahead < r.dist*cos(TOUCH.DRIB_CONE) || b.p.y > 0.5) return false;
  a.strides = 0;
  const d = a.drib, fac = a.fac || {};
  const dt = dribbleTouch(a, b, {x: d.dx, z: d.dz}, Math.max(v, d.speed || v), {drib: a.at.dribbling, bF: fac.bF != null ? fac.bF : 1,
    walk: v < 2.0, rollDecel: b.rollDecel}, ms.r);
  ballKick(b, dt.v, null, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1});
  chainKeep(ms, a);
  onTouch(ms, a, 'dribble', ev);
  refreshPred(ms);
  return true;
}
function touchSideOf(a){ return a.foot === 'L' ? 'L' : 'R'; }

// a stationary or slow controller with the ball at his feet but not ahead keeps it there: a small touch back under
// him on a footfall (the sole), so a turn with the ball is a real turn of the ball
export function nudge(ms, a, dx, dz, k = 1.4){
  const b = ms.ball;
  ballKick(b, {x: dx*k, y: 0, z: dz*k}, null, {agent: a.id, team: a.team, kind: 'dribble', t: ms.t});
  logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'dribble', quality: 1});
  chainKeep(ms, a);
  refreshPred(ms);
}

/* ---------- tackles (3.1.4, 3.2.9) ---------- */

// Begin a tackle on the carrier: 'stand' (wind-up 0.12 s, active 0.25 s), 'poke' or 'slide' (committed 1.1 s, 0.8 s on
// the ground). What the sweep meets first is decided at the start from the positions and velocities (touch.js), with
// the AI's timing error (sigma 0.12 (1 - tackling/110) s) moving where it aims; it is applied when it happens.
export function startTackle(ms, a, kind, carrier, timingErr = 0){
  const b = ms.ball;
  const aimT = Math.max(0, timingErr);
  const target = {x: b.p.x + b.v.x*aimT, z: b.p.z + b.v.z*aimT};
  if (timingErr < 0){ target.x += b.v.x*timingErr*0.5; target.z += b.v.z*timingErr*0.5; }
  const out = tackleOutcome(a, carrier, b, {kind, target, t: 0}, {tackling: a.at.tackling, dribbling: carrier.at.dribbling}, ms.r);
  const K = kind === 'slide' ? null : kind === 'poke' ? TACKLE.poke : TACKLE.stand;
  const prof = kind === 'slide' ? slideProfile(a.at.tackling) : null;
  const tEff = out.result === 'foul' ? out.tLeg : out.result === 'miss' ? (K ? K.wind + K.active : prof.tStop) : out.tBall;
  const dur = kind === 'slide' ? prof.commit + prof.ground : (K.wind + K.active + 0.25);
  const dx = target.x - a.m.x, dz = target.z - a.m.z, dl = hypot(dx, dz) || 1;
  a.act = {kind: kind === 'slide' ? 'slide' : 'tackle', sub: kind, t: 0, dur, tEff: Math.max(0.02, tEff), out, on: carrier.id, done: false,
    dir: {x: dx/dl, z: dz/dl}, x0: a.m.x, z0: a.m.z, prof, tc: Math.max(0.02, tEff)};
  a.state = kind === 'slide' ? 'slide' : 'tackle'; a.stateT = 0;
  stamAction(a.st, kind === 'slide' ? 'slide' : 'tackle');
  a.cool.tackle = ms.t + dur + 0.4;
  return a.act;
}
function tackleApply(ms, a, act){
  act.done = true;
  const b = ms.ball, out = act.out, c = ms.agents[act.on];
  let result = out.result;
  // the carrier may have touched the ball on since the tackle began: a ball no longer where the sweep goes is missed
  if ((result === 'won' || result === 'poke') && hypot(b.p.x - a.m.x, b.p.z - a.m.z) > (act.sub === 'slide' ? 2.2 : 1.5)) result = 'miss';
  if (result === 'foul' && (!c || hypot(c.m.x - a.m.x, c.m.z - a.m.z) > 2.2)) result = 'miss';
  const ev = logEv(ms, 'tackle', a.team, a.id, a.m.x, a.m.z, {on: act.on, result, won: result === 'won', type: act.sub});
  if (result === 'won' || result === 'poke'){
    ballKick(b, out.impulse, null, {agent: a.id, team: a.team, kind: 'tackle', t: ms.t});
    const tev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'tackle', quality: result === 'won' ? 1 : 0.4});
    chainTouch(ms, a, 'tackle', tev);
    onTouch(ms, a, 'tackle', tev);
    clearCtl(ms);
    if (c){ c.drib = null; c.brain.next = ms.t + 0.15; c.noTouch = ms.t + 0.4; }
    refreshPred(ms);
  } else if (result === 'foul' && c){
    if (out.impulse){ c.m.vx += out.impulse.x; c.m.vz += out.impulse.z; }
    c.m.stagger = c.prm.staggerT;
    foul(ms, a, c, out.severity, c.m.x, c.m.z, {slide: act.sub === 'slide', down: out.severity > 0.5});
  }
  return ev;
}

/* ---------- headers (1.5.3, 3.1.7) ---------- */

// Plan a header: take off so that the head meets the ball at tContact (seconds from now) near its apex. intent: 'attack'
// (toward goal, 5 degrees down), 'pass' (to target), 'clear'. charge 0..1.
export function startHeader(ms, a, tContact, intent, target = null, charge = 1){
  const v0 = (0.8 + 0.2*clamp(charge, 0, 1))*(2.6 + 0.012*a.at.jumping);
  const tApex = v0/G, tJump = Math.max(0, tContact - Math.max(0.05, tApex - 0.05));
  a.act = {kind: 'header', t: 0, jumpAt: Math.max(ACT.HEADER_LOAD*0.5, tJump), v0, tc: tContact, intent, target, done: false, air: false,
    dur: Math.max(tContact, tJump) + 2*tApex + ACT.HEADER_RECOVER, standing: false};
  a.state = 'jump'; a.stateT = 0;
  stamAction(a.st, 'jump');
  a.cool.header = ms.t + 1.2;
  return a.act;
}
// the head's centre now
function headOf(a, out){ out.x = a.m.x; out.z = a.m.z; out.y = (a.y || 0) + 1.66*(a.scale || 1) + 0.06; return out; }
const HP = {x: 0, y: 0, z: 0};
function headerTry(ms, a, act){
  const b = ms.ball;
  if (b.state !== 'free') return false;
  const h = headOf(a, HP);
  const look = {yaw: a.m.yaw, pitch: 0};
  const dirTeam = ms.dirs[a.team];
  if (act.intent === 'attack'){
    const gx = dirTeam*ms.spec.hx, tz = act.target ? act.target.z : 0;
    look.yaw = yawOf(gx - b.p.x, tz - b.p.z);
    const d = hypot(gx - b.p.x, tz - b.p.z);
    look.pitch = atan2((act.target ? act.target.y : 1.0) - b.p.y, d);
  } else if (act.intent === 'clear'){
    look.yaw = yawOf(dirTeam, (b.p.z >= 0 ? 0.4 : -0.4));
    // near his own goal with an attacker on him (or a ball whipped across fast), safety first: out toward the corner
    // flag, behind or into touch, rather than back into the middle
    const ogx = -dirTeam*ms.spec.hx, near = Math.abs(ogx - b.p.x) < ACT.SAFETY[0];
    let pressed = false;
    for (const o of ms.agents){ if (o.team !== a.team && o.team >= 0 && o.onPitch && hypot(o.m.x - a.m.x, o.m.z - a.m.z) < ACT.SAFETY[1]){ pressed = true; break; } }
    const fast = hypot(b.v.x, b.v.z) > ACT.SAFETY[2];
    if (near && (pressed || fast) && ms.r() < ACT.SAFETY[3]){
      const side = b.p.z >= 0 ? 1 : -1;
      look.yaw = yawOf(ogx - b.p.x, side*ms.spec.hz - b.p.z);
    }
  }
  const res = headerContact(a, b, h, {kind: act.intent, look: act.intent === 'pass' ? null : look, target: act.target}, {heading: a.at.heading,
    vIn: b.v, running: a.m.speed > 3}, ms.r);
  if (!res) return false;
  ballKick(b, res.v, null, {agent: a.id, team: a.team, kind: 'header', t: ms.t});
  act.done = true;
  if (ms.poss.ctl >= 0) clearCtl(ms);
  refreshPred(ms);
  const atGoal = act.intent === 'attack';
  const extra = {intent: 'header', recv: act.recv != null ? act.recv : -1, speed: Math.round(res.speed*100)/100, contact: 0, firstTime: true,
    dist: Math.round(hypot(dirTeam*ms.spec.hx - b.p.x, b.p.z)*10)/10, atGoal, quality: Math.round(res.quality*100)/100};
  if (atGoal){
    extra.xg = Math.round(0.6*xgAt(ms, a.team, b.p.x, b.p.z)*1000)/1000;
    extra.onTarget = predOnTarget(ms, a.team);
    ms.stats.shots[a.team]++;
  }
  const restart = ms.restart && ms.restart.taker === a.id ? ms.restart : null;
  const ev = logEv(ms, 'kick', a.team, a.id, b.p.x, b.p.z, extra);
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onTouch(ms, a, 'header', ev);
  onKick(ms, ev);
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
  // an aerial duel: anyone else in the air for it lost it
  for (const o of ms.agents){
    if (o === a || !o.onPitch || !o.act || o.act.kind !== 'header' || o.act.done || o.team === a.team) continue;
    if (hypot(o.m.x - a.m.x, o.m.z - a.m.z) < 2.5){
      o.act.done = true;
      logEv(ms, 'aerial', a.team, a.id, b.p.x, b.p.z, {winner: a.id, loser: o.id});
    }
  }
  return true;
}

/* ---------- throw-ins ---------- */

// the throw: from 2.0 m at up to 8 + 0.07 passing m/s, released at 0.62 s of a 1.0 s clip
export function startThrow(ms, a, target, recv = -1){
  a.act = {kind: 'throw', t: 0, dur: ACT.THROW_DUR, tc: ACT.THROW_REL, target, recv, done: false};
  a.state = 'throw'; a.stateT = 0;
  return a.act;
}
function throwRelease(ms, a, act){
  const b = ms.ball, tg = act.target;
  const vmax = 8 + 0.07*a.at.passing;
  const from = {x: b.p.x, y: Math.max(1.6, b.p.y), z: b.p.z};
  const d = hypot(tg.x - from.x, tg.z - from.z);
  const sp = clamp(Math.sqrt(9.81*Math.max(2, d)/0.9396926207859083)*0.92, 5, vmax);
  const L = solveStrike({from, target: {x: tg.x, y: R, z: tg.z}, speed: sp, contact: 0, curl: 0, foot: 'R', kind: 'throw', rollDecel: b.rollDecel});
  ballRelease(b, from, L.v, {x: 0, y: 0, z: 0});
  b.last.agent = a.id; b.last.team = a.team; b.last.kind = 'throw'; b.last.t = ms.t;
  b.pendN = 0;
  act.done = true;
  refreshPred(ms);
  const restart = ms.restart && ms.restart.taker === a.id ? ms.restart : null;
  const ev = logEv(ms, 'kick', a.team, a.id, from.x, from.z, {intent: 'throw', recv: act.recv, speed: Math.round(sp*100)/100, contact: 0,
    dist: Math.round(d*10)/10, noOffside: true});
  ms.stats.passes[a.team]++;
  if (restart) restartTaken(ms, ev);
  chainKick(ms, ev);
  onKick(ms, ev);
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
}

/* ---------- the action step (3.2.1 step 4) ---------- */

// Carry the agent's action forward one step: contacts at their scheduled step, the jump and the slide on their root
// curves, the recovery after. A player's queued Action (intent.action, from control.js) starts here.
export function actionStep(ms, a, h){
  const I = a.intent;
  if (I.action && !a.act){ startAction(ms, a, I.action); I.action = null; }
  const act = a.act;
  if (!act){ if (a.state !== 'idle' && a.state !== 'run' && a.state !== 'jockey' && a.state !== 'shield') a.state = a.m.speed > 0.3 ? 'run' : 'idle'; return; }
  act.t += h;
  switch (act.kind){
    case 'kick': {
      if (!act.done){
        const b = ms.ball;
        if (act.adjust){
          // the stride adjust: steer to the plant spot behind the ball; strike the moment it is in the window
          const cs = canStrike(a, b);
          if (cs.ok){ act.adjust = false; act.tc = act.t + cs.tc; act.dur = act.tc + ACT.FOLLOW; }
          else if (act.t >= (act.adjustMax || ACT.ADJUST)){ strikeContact(ms, a, act, true); act.dur = act.t + ACT.FOLLOW; break; }
          else {
            const tg = act.action.target || {x: b.p.x, z: b.p.z};
            const kx = tg.x - b.p.x, kz = tg.z - b.p.z, kl = hypot(kx, kz) || 1;
            // the plant: behind the ball on the line of the kick, a little to the support foot's side
            const sd = act.foot === 'L' ? 1 : -1, rx = -kz/kl, rz = kx/kl;
            const px = b.p.x - kx/kl*0.62 + rx*sd*0.12, pz = b.p.z - kz/kl*0.62 + rz*sd*0.12;
            // at a dead ball, slowing as he comes onto the spot (1.5 m/s a metre away), so he settles on it rather than
            // circling it; a moving ball is chased at full stride
            const cap = act.adjustMax > 1 ? Math.max(0.6, 1.5*hypot(px - a.m.x, pz - a.m.z) + 0.3) : Infinity;
            steer(a, px, pz, act.adjustMax > 1 ? 'jog' : 'run', 0.04, {x: kx/kl, z: kz/kl}, cap);
          }
        }
        if (!act.adjust && !act.done){
          const tg = act.action.target;
          if (tg){ const f = faceTo(a, tg.x, tg.z, {x: 0, z: 0}); I.face = f; }
          I.speedCap = Math.min(I.speedCap, Math.max(1.5, a.m.speed*0.97));
          if (act.t >= act.tc - 1e-9) strikeContact(ms, a, act, false);
        }
      } else I.speedCap = Math.min(I.speedCap, 2.5);
      if (act.done && act.t >= act.dur){ a.act = null; a.state = 'idle'; }
      break;
    }
    case 'tackle': {
      I.speedCap = Math.min(I.speedCap, 2.5);
      if (!act.done && act.t >= act.tEff) tackleApply(ms, a, act);
      if (act.t >= act.dur){ if (!act.done) tackleApply(ms, a, act); a.act = null; a.state = 'idle'; }
      break;
    }
    case 'slide': {
      // the body slides along the tackle's line (slideRoot's curve), then lies 0.8 s, then gets up
      const p = act.prof, s = slideDistance(p, act.t), sPrev = slideDistance(p, Math.max(0, act.t - h));
      const step = s - sPrev;
      a.m.x += act.dir.x*step; a.m.z += act.dir.z*step;
      a.m.vx = act.dir.x*Math.max(0, p.v0 - p.decel*act.t); a.m.vz = act.dir.z*Math.max(0, p.v0 - p.decel*act.t);
      a.m.speed = hypot(a.m.vx, a.m.vz);
      a.slideMoved = true;
      if (!act.done && act.t >= act.tEff) tackleApply(ms, a, act);
      a.state = act.t < p.tStop ? 'slide' : 'ground';
      if (act.t >= act.dur){ a.act = null; a.state = 'idle'; a.m.speed = 0; a.m.vx = 0; a.m.vz = 0; }
      break;
    }
    case 'header': {
      if (act.t >= act.jumpAt && !act.air && !act.landed){ act.air = true; act.t0 = act.t; }
      if (act.air){
        const J = jumpRoot({v0: act.v0}, act.t - act.t0, {y: 0});
        a.y = J.y; a.vy = J.vy || 0;
        if (!J.air && act.t - act.t0 > 0.05){ act.air = false; act.landed = true; a.y = 0; a.vy = 0; }
      }
      if (!act.done && (act.air || act.t >= act.jumpAt - 0.02)) headerTry(ms, a, act);
      I.speedCap = Math.min(I.speedCap, act.air ? a.m.speed : 4);
      if (act.t >= act.dur || act.landed && act.done && act.t > act.tc + 0.3 || act.landed && act.t > act.tc + 0.6){ a.act = null; a.y = 0; a.vy = 0; a.state = 'idle'; }
      break;
    }
    case 'throw': {
      standStill(a, faceTo(a, act.target.x, act.target.z, {x: 0, z: 0}));
      if (!act.done && act.t >= act.tc) throwRelease(ms, a, act);
      if (act.t >= act.dur){ a.act = null; a.state = 'idle'; }
      break;
    }
    default:
      if (act.t >= (act.dur || 0)) a.act = null;
  }
}

// start an Action record (1.4.14) for an agent: the player's controls and the AI land here
export function startAction(ms, a, rq){
  switch (rq.kind){
    case 'shot': case 'pass': case 'through': case 'cross': case 'lob': case 'clear': case 'goalkick': case 'punt': case 'roll':
      return startKick(ms, a, rq);
    case 'tackle': { const c = ms.agents[ms.poss.ctl]; if (c && c.team !== a.team) return startTackle(ms, a, rq.sub || 'stand', c, 0); return null; }
    case 'slide': { const c = ms.agents[ms.poss.ctl] || null; if (c && c.team !== a.team) return startTackle(ms, a, 'slide', c, 0); return null; }
    case 'header': return startHeader(ms, a, rq.tc != null ? rq.tc : 0.3, rq.intent || 'clear', rq.target, rq.power != null ? rq.power : 1);
    case 'throw': return startThrow(ms, a, rq.target, rq.recv != null ? rq.recv : -1);
    case 'call':
      logEv(ms, 'call', a.team, a.id, a.m.x, a.m.z, {how: rq.how || 'here', px: rq.target ? rq.target.x : null, pz: rq.target ? rq.target.z : null});
      a.lastCall = ms.t; a.calls++;
      return null;
    default: return null;
  }
}

// the ball held by a body follows the hands (keeper, a restart taker); a free ball near a controller that has run
// away from him is no longer under his control
export function controlCheck(ms){
  const c = ms.poss.ctl;
  if (c < 0) return;
  const a = ms.agents[c], b = ms.ball;
  if (!a || !a.onPitch){ clearCtl(ms); return; }
  if (b.state === 'held') return;
  const d = hypot(b.p.x - a.m.x, b.p.z - a.m.z);
  if (d > ACT.LOSE_CTL || b.p.y > 1.8){ clearCtl(ms); a.drib = null; }
}

export {ballHold};
