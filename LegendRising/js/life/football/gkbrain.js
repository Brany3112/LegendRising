// js/life/football/gkbrain.js: the goalkeeper. Positioning on the ball-to-goal bisector at a distance off the line
// that grows with the ball's distance (a sweeper's position when it is far), the small error his positioning has, the
// shuffle and the reposition, getting set when a shot is coming, reading a shot (late, by his reaction time, with the
// spin misread and a lateral error, re-read at 55% of the flight), the dive planned by gkplan.js whose hands are real
// colliders of the ball, what the contact gives (a catch, a parry, a tip over, a punch), the ground, the get-up and
// the scramble, crosses he claims or punches, one-on-ones, penalties, and the distribution when he has it.
// Owner: WP-E. Contract DESIGN 1.4.14 (gkStep); numbers 1.5.4; behaviour 3.2.6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {ballPredict, ballHold, ballRelease, ballKick, BALL} from "./ball.js";
import {solveStrike} from "./strike.js";
import {gauss, truncNormal} from "./rng.js";
import {planDive, diveRoot, handsAt, GKP} from "./gkplan.js";
import {logEv, chainSave, chainControl, chainKick} from "./events.js";
import {setCtl, clearCtl, onTouch, onKick, restartTaken, holdAt} from "./rules.js";
import {steer, standStill, faceTo, startKick, passSpeedFor, refreshPred, loftSpeedFor} from "./actions.js";
import {passModel} from "./brain.js";
import {dirOf, yawOf} from "./pitchspec.js";
import {hypot, sin, cos, atan2} from "./detmath.js";
import {timeToPoint} from "../mover.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180, R = BALL.R;

// 1.5.4 numbers
export const GK = Object.freeze({
  OFF: [0.8, 0.06, 6, 0.6, 4.5], NEAR: 35, SWEEP: [18, 6, 22], SWEEP_BLEND: 15,
  POS_ERR: 0.5, POS_ERR_T: 2,
  SHUFFLE_V: 2.5, SHUFFLE_D: 1.5, REPOS_V: 5,
  SET_T: 0.15, SET_D: 25, SET_CONE: 40*DEG,
  REACT: [0.12, 0.30, 0.0015, 0.03], UNSET: 0.12, SCREEN: 0.08,
  SPIN: [0.4, 0.004], LAT: [0.2, 0.012, 18, 1.3], REREAD: 0.55, STEER: 0.35,
  CATCH_D: 0.22, CATCH_V: [13, 0.14], CATCH_EXT: 0.92,
  PARRY_E: 0.35, PARRY_V: [4, 7], PARRY_ERR: 25, PARRY_POST: [1.0, 0.5],
  TIP_Y: 2.0, TIP_UP: 5, PUNCH_V: [12, 16], PUNCH_N: 3, PUNCH_R: 2.5,
  GROUND: 0.45, GETUP: [0.9, 0.004], SCRAMBLE: 1.2,
  CLAIM_BOX: 2, CLAIM_V: 6, CLAIM_JUMP: 2.8, CLAIM_MARGIN: 0.1,
  ONE: [0.45, 2, 9], SPREAD: 2.5,
  PEN_COMMIT: 0.05, PEN_W: [0.4, 0.4, 0.2], PEN_FACE: 0.15,
  HOLD: [2, 5], THROW: [0.8, 30], ROLL: 0.85, PUNT: [45, 55],
  DIVE_T: 0.42           // a dive's own time from the power step to the hands at the ball; a longer flight is crossed on foot first
});

const COS_SET = cos(GK.SET_CONE);

// the keeper's own record (a.gk), made on first use
function gkRec(a){
  if (!a.gk) a.gk = {state: 'ready', t: 0, plan: null, errX: 0, errZ: 0, errT: -99, setT: -1, set: false, kickSeq: 0, read: null,
    hands: [{x: 0, y: 0, z: 0, r: 0.11, id: a.id, team: a.team, vx: 0, vy: 0, vz: 0}, {x: 0, y: 0, z: 0, r: 0.11, id: a.id, team: a.team, vx: 0, vy: 0, vz: 0}],
    handsOn: false, holdT: 0, steer: {x: 0, y: 0, z: 0}, noHands: false, claim: null, diveT: 0, pen: null};
  return a.gk;
}
const goalX = (ms, a) => -ms.dirs[a.team]*ms.spec.hx;
const at = a => a.at.gk || {reflex: 50, dive: 50, handling: 50, posit: 50, distrib: 50};

// the keeper's hands as ball colliders (ball.js hands()), only while a save is planned or he is holding it
export function gkHands(ms, a, out){
  const g = a.gk;
  if (!g || !g.handsOn) return;
  out.push(g.hands[0], g.hands[1]);
}

/* ---------- positioning ---------- */

function positionTarget(ms, a, out){
  const g = a.gk, A = at(a), dir = ms.dirs[a.team], gx = goalX(ms, a), b = ms.ball.p;
  const dBall = hypot(b.x - gx, b.z);
  // the positioning error, resampled every 2 s
  if (ms.t - g.errT >= GK.POS_ERR_T){ g.errT = ms.t; g.errZ = truncNormal(ms.r, GK.POS_ERR*(1 - A.posit/100), 2.5); }
  // on the line from the ball to the goal centre, off the line by 0.8 + 0.06 (d - 6), 0.6 to 4.5
  const off = clamp(GK.OFF[0] + GK.OFF[1]*(dBall - GK.OFF[2]), GK.OFF[3], GK.OFF[4]);
  const vx = b.x - gx, vz = b.z, vl = hypot(vx, vz) || 1;
  const nx = gx + vx/vl*off, nz = clamp(vz/vl*off + g.errZ, -3.4, 3.4);
  if (dBall < GK.NEAR){ out.x = nx; out.z = nz; return out; }
  // the sweeper: 18 m behind his line, 6 to 22 m off the goal line; he moves up to it over the next 15 m of the
  // ball's distance, so the ball coming back inside 35 m never finds him 20 m out with a sprint to make
  const tm = ms.tm[a.team];
  const u = clamp(tm.line - GK.SWEEP[0], GK.SWEEP[1], GK.SWEEP[2]);
  const sx = dir*(u - ms.spec.L/2), sz = clamp(b.z*0.15, -6, 6) + g.errZ;
  const k = clamp((dBall - GK.NEAR)/GK.SWEEP_BLEND, 0, 1);
  out.x = nx + (sx - nx)*k; out.z = nz + (sz - nz)*k;
  return out;
}

// is an opponent in a shooting stance within 25 m (the ball at his feet, facing the goal within 40 degrees)?
function shooterThreat(ms, a){
  const c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
  if (!c || c.team === a.team) return false;
  const gx = goalX(ms, a), m = c.m, d = hypot(gx - m.x, m.z);
  if (d > GK.SET_D) return false;
  const f = dirOf(m.yaw), tx = (gx - m.x)/d, tz = -m.z/d;
  return f.x*tx + f.z*tz > COS_SET;
}
// is the attacker through on goal (nobody of ours between him and the goal but the keeper)?
function oneOnOne(ms, a){
  const c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
  if (!c || c.team === a.team) return null;
  const gx = goalX(ms, a), m = c.m, d = hypot(gx - m.x, m.z);
  if (d > 22) return null;
  for (const o of ms.agents){
    if (o.team !== a.team || o === a || !o.onPitch) continue;
    const od = hypot(gx - o.m.x, o.m.z);
    if (od < d && hypot(o.m.x - m.x, o.m.z - m.z) < d) return null;
  }
  return {c, d};
}

/* ---------- reading a shot (3.2.6 step 3) ---------- */

const PR = new Float32Array(360);
// a kick by the other side: if its path crosses the goal plane within 1 m of the frame, react after the reaction time
function noticeKick(ms, a){
  const g = a.gk, K = ms.kick;
  if (!K || K.seq === g.kickSeq) return;
  g.kickSeq = K.seq; g.shift = null;
  if (K.team === a.team){ g.noHands = K.ev && K.ev.intent !== 'throw' && K.ev.intent !== 'header' && !K.ev.whiff; return; }
  g.noHands = false;
  const A = at(a), gx = goalX(ms, a), P = ms.pred, n = ms.predN;
  // where the predicted path crosses the goal plane
  let cross = null;
  for (let k = 1; k < n; k++){
    const x0 = P[4*(k - 1)], x1 = P[4*k];
    if ((x0 - gx)*(x1 - gx) <= 0 && x0 !== x1){
      const f = (gx - x0)/(x1 - x0), y = P[4*(k - 1) + 1] + f*(P[4*k + 1] - P[4*(k - 1) + 1]), z = P[4*(k - 1) + 2] + f*(P[4*k + 2] - P[4*(k - 1) + 2]);
      cross = {y, z, t: P[4*(k - 1) + 3] + f/30};
      break;
    }
  }
  const ev = K.ev, isCross = ev && (ev.intent === 'cross' || ev.intent === 'lob' || ev.intent === 'goalkick' || ev.intent === 'punt');
  if (cross && Math.abs(cross.z) < 3.66 + 1 && cross.y < 2.44 + 1 && !isCross){
    // screened: a body within 0.6 m of the sight line during the first 0.2 s
    const b = ms.ball.p;
    let screened = false;
    for (const o of ms.agents){
      if (o === a || !o.onPitch || o.role !== 'player') continue;
      const vx = a.m.x - b.x, vz = a.m.z - b.z, L2 = vx*vx + vz*vz || 1, t = ((o.m.x - b.x)*vx + (o.m.z - b.z)*vz)/L2;
      if (t > 0.1 && t < 0.9 && hypot(o.m.x - b.x - vx*t, o.m.z - b.z - vz*t) < 0.6){ screened = true; break; }
    }
    let react = Math.max(GK.REACT[0], GK.REACT[1] - GK.REACT[2]*A.reflex + GK.REACT[3]*gauss(ms.r));
    if (!g.set) react += GK.UNSET;
    if (screened) react += GK.SCREEN;
    g.read = {at: ms.t + react, kick: K.seq, tCross: cross.t, t0: ms.t, z: cross.z, y: cross.y, ev};
    if (g.state === 'ready' || g.state === 'set' || g.state === 'shuffle' || g.state === 'reposition' || g.state === 'advance' || g.state === 'spread') g.state = 'set';
  } else if (isCross || !cross){
    // a cross or a long ball: come for it if it drops in his area first (3.2.6, 1.5.4)
    considerClaim(ms, a);
  }
}

// the read, after the reaction: predict with the misread spin and a lateral error, plan the dive at his dive plane
function readShot(ms, a){
  const g = a.gk, A = at(a), b = ms.ball;
  g.read = null;
  if (b.state !== 'free') return;
  const v = hypot(b.v.x, b.v.y, b.v.z);
  const latErr = gauss(ms.r)*(GK.LAT[0] + GK.LAT[1]*Math.max(0, v - GK.LAT[2]))*(GK.LAT[3] - A.reflex/100);
  const hit = shotHit(ms, a, latErr);
  if (!hit) return;
  // a ball going wide by more than his reach: let it go
  if (Math.abs(hit.z - latErr) > 3.66 + 0.9 || hit.y > 2.44 + 0.6){ g.state = 'ready'; return; }
  // a long flight: he moves across on his feet first and dives (or stands) when the dive itself is all that is left
  if (hit.t > GK.DIVE_T + 0.1 && Math.abs(hit.z - a.m.z) > GKP.STAND){
    g.shift = {z: hit.z, t1: ms.t + hit.t, latErr};
    g.state = 'set';
    return;
  }
  planFrom(ms, a, hit, latErr);
}
// where his hands can meet the predicted path (with the spin misread and the lateral error): where it crosses his own
// dive plane (x = his x), else the goal line. {x, y, z, t} or null.
function shotHit(ms, a, latErr){
  const A = at(a), b = ms.ball;
  const spinMul = GK.SPIN[0] + GK.SPIN[1]*A.reflex;
  const n = ballPredict(b, ms.bw, PR, 60, 30, spinMul);
  const px = a.m.x, gx = goalX(ms, a);
  let hit = null;
  for (let k = 1; k < n; k++){
    const x0 = PR[4*(k - 1)], x1 = PR[4*k];
    if ((x0 - px)*(x1 - px) <= 0 && x0 !== x1){
      const f = (px - x0)/(x1 - x0);
      hit = {x: px, y: PR[4*(k - 1) + 1] + f*(PR[4*k + 1] - PR[4*(k - 1) + 1]), z: PR[4*(k - 1) + 2] + f*(PR[4*k + 2] - PR[4*(k - 1) + 2]),
        t: PR[4*(k - 1) + 3] + f/30};
      break;
    }
  }
  if (!hit){
    for (let k = 1; k < n; k++){
      const x0 = PR[4*(k - 1)], x1 = PR[4*k];
      if ((x0 - gx)*(x1 - gx) <= 0 && x0 !== x1){
        const f = (gx - x0)/(x1 - x0);
        hit = {x: gx + (px - gx)*0.3, y: PR[4*(k - 1) + 1] + f*(PR[4*k + 1] - PR[4*(k - 1) + 1]), z: PR[4*(k - 1) + 2] + f*(PR[4*k + 2] - PR[4*(k - 1) + 2]),
          t: PR[4*(k - 1) + 3] + f/30};
        break;
      }
    }
  }
  if (hit) hit.z += latErr;
  return hit;
}
// the dive (or the standing save) for a hit point
function planFrom(ms, a, hit, latErr){
  const g = a.gk, A = at(a);
  const plan = planDive({x: a.m.x, z: a.m.z, y: a.y || 0, yaw: a.m.yaw, scale: a.scale || 1, at: A}, hit);
  g.plan = plan; g.diveT = 0; g.state = plan.kind === 'stand' ? 'catch' : 'dive'; g.handsOn = true;
  g.steer.x = 0; g.steer.y = 0; g.steer.z = 0; g.reread = false; g.flight = hit.t; g.latErr = latErr; g.hitDone = false;
  a.act = {kind: 'dive', t: 0, tc: plan.tc, plan, dur: plan.land + GK.GROUND, done: false};
  a.state = 'gk';
}
// moving across before the dive: side-on toward where the ball will cross his line; the dive when its own time is left
function shiftStep(ms, a){
  const g = a.gk, S = g.shift, b = ms.ball, left = S.t1 - ms.t;
  if (b.state !== 'free' || left < -0.1){ g.shift = null; return false; }
  if (left <= GK.DIVE_T){
    g.shift = null;
    const hit = shotHit(ms, a, S.latErr);
    if (!hit || Math.abs(hit.z - S.latErr) > 3.66 + 0.9){ g.state = 'ready'; return false; }
    planFrom(ms, a, hit, S.latErr);
    diveStep(ms, a, 1/60);
    return true;
  }
  const face = faceTo(a, b.p.x, b.p.z, {x: 0, z: 0});
  steer(a, a.m.x, clamp(S.z, -3.9, 3.9), 'run', 0.05, face, GK.REPOS_V, true);
  g.handsOn = false;
  return true;
}

// the late re-read at 55% of the flight: the real path, hands steered toward it by up to 0.35 m
function reread(ms, a){
  const g = a.gk, plan = g.plan, b = ms.ball;
  if (!plan || g.reread || b.state !== 'free') return;
  if (g.diveT < GK.REREAD*plan.tc) return;
  g.reread = true;
  const P = ms.pred, n = ms.predN, px = plan.hand.x;
  for (let k = 1; k < n; k++){
    const x0 = P[4*(k - 1)], x1 = P[4*k];
    if ((x0 - px)*(x1 - px) <= 0 && x0 !== x1){
      const f = (px - x0)/(x1 - x0), y = P[4*(k - 1) + 1] + f*(P[4*k + 1] - P[4*(k - 1) + 1]), z = P[4*(k - 1) + 2] + f*(P[4*k + 2] - P[4*(k - 1) + 2]);
      const dy = y - plan.hand.y, dz = z - plan.hand.z, dl = hypot(dy, dz);
      const k2 = dl > GK.STEER ? GK.STEER/dl : 1;
      g.steer.y = dy*k2; g.steer.z = dz*k2;
      return;
    }
  }
}

/* ---------- contact: what the hands do (1.5.4) ---------- */

// The ball met a hand (ball.js 'body' event, part 'hand', id the keeper): catch, parry, tip or punch by the outcome
// table. The ball has already bounced off the hand; the outcome replaces that.
export function gkOnHand(ms, a, d){
  const g = gkRec(a), A = at(a), b = ms.ball;
  if (b.state !== 'free') return;
  const shot = ms.chain.shot && !ms.chain.shot.res && ms.chain.shot.team !== a.team ? ms.chain.shot : null;
  const vIn = d.vIn || b.v, rel = hypot(vIn.x - (a.m.vx || 0), vIn.y, vIn.z - (a.m.vz || 0));
  const h0 = g.hands[0], h1 = g.hands[1];
  const both = hypot(h0.x - b.p.x, h0.y - b.p.y, h0.z - b.p.z) < GK.CATCH_D + 0.12 && hypot(h1.x - b.p.x, h1.y - b.p.y, h1.z - b.p.z) < GK.CATCH_D + 0.12;
  const plan = g.plan;
  let ext = 0;
  if (plan){ const C = diveRoot(plan, g.diveT, {x: 0, y: 0, z: 0, roll: 0}); ext = hypot(b.p.x - C.x, b.p.y - (plan.C0.y + C.y), b.p.z - C.z)/(GKP.REACH*(a.scale || 1)); }
  // a crowd at a cross's drop point (3 or more bodies within 2.5 m of it): punched, never caught
  const crowded = g.claim ? countNear(ms, g.claim.x, g.claim.z, GK.PUNCH_R) >= GK.PUNCH_N : false;
  const cross = g.claim != null;
  let outcome;
  if (cross && crowded) outcome = 'punch';
  else if (both && rel < GK.CATCH_V[0] + GK.CATCH_V[1]*A.handling && ext < GK.CATCH_EXT) outcome = cross ? 'claim' : 'catch';
  else if (b.p.y > GK.TIP_Y && b.p.y < 2.44 + 0.5) outcome = 'tip';
  else outcome = cross ? 'punch' : 'parry';
  const gx = goalX(ms, a), dir = ms.dirs[a.team];
  if (outcome === 'catch' || outcome === 'claim'){
    holdAt(ms, a, false, 1/60);
    g.state = plan && plan.kind !== 'stand' ? 'ground' : 'hold'; g.t = 0; g.holdT = GK.HOLD[0] + (GK.HOLD[1] - GK.HOLD[0])*ms.r();
    setCtl(ms, a);
  } else if (outcome === 'tip'){
    // over the bar: what is left of the pace, and up
    const sp = hypot(vIn.x, vIn.z)*0.5;
    ballKick(b, {x: -dir*sp*0.4 + vIn.x*0.3, y: Math.abs(vIn.y)*0.3 + GK.TIP_UP, z: vIn.z*0.3}, null, {agent: a.id, team: a.team, kind: 'save', t: ms.t});
    clearCtl(ms);
  } else if (outcome === 'punch'){
    const sp = GK.PUNCH_V[0] + (GK.PUNCH_V[1] - GK.PUNCH_V[0])*ms.r();
    const ang = (ms.r() - 0.5)*70*DEG, base = dir > 0 ? 0 : Math.PI;
    const ux = cos(base + ang), uz = sin(base + ang);
    ballKick(b, {x: ux*sp, y: 3 + 2*ms.r(), z: uz*sp}, null, {agent: a.id, team: a.team, kind: 'save', t: ms.t});
    clearCtl(ms);
  } else {
    // parry: restitution 0.35 plus 4 to 7 m/s away from the goal centre, aimed with an error; a shot toward a post is
    // as often pushed round it (toward the goal line outside the post) as back out
    let vx = b.p.x - gx, vz = b.p.z;
    if (Math.abs(b.p.z) > GK.PARRY_POST[0] && ms.r() < GK.PARRY_POST[1]){ vx = -dir*0.35*Math.abs(vz); vz = Math.sign(vz)*Math.max(1, Math.abs(vz)); }
    const vl = hypot(vx, vz) || 1;
    const err = gauss(ms.r)*GK.PARRY_ERR*(1 - A.handling/120)*DEG, c = cos(err), s = sin(err);
    const ux = (vx*c - vz*s)/vl, uz = (vx*s + vz*c)/vl;
    const away = GK.PARRY_V[0] + (GK.PARRY_V[1] - GK.PARRY_V[0])*ms.r();
    const sp = hypot(vIn.x, vIn.y, vIn.z)*GK.PARRY_E;
    ballKick(b, {x: ux*(away + sp*0.5), y: 1 + ms.r()*2, z: uz*(away + sp*0.5)}, null, {agent: a.id, team: a.team, kind: 'save', t: ms.t});
    clearCtl(ms);
  }
  g.handsOn = outcome === 'catch' || outcome === 'claim';
  // one contact per save: the hands do not meet the same ball again on the way out
  g.hitDone = !g.handsOn;
  const onT = shot ? !!shot.onTarget : false;
  if (shot || cross) ms.stats.saves[a.team] += shot && onT ? 1 : 0;
  const sev = logEv(ms, 'save', a.team, a.id, b.p.x, b.p.z, {outcome, onTarget: shot ? onT : null, shot: shot ? shot.id : -1, y: Math.round(b.p.y*100)/100});
  chainSave(ms, a, outcome);
  if (outcome === 'catch' || outcome === 'claim') chainControl(ms, a, 'catch', sev);
  onTouch(ms, a, 'save', sev);
  g.claim = null;
  refreshPred(ms);
}
// a ball that hit the keeper's body in a dive (or standing): a block save
export function gkOnBody(ms, a, d){
  const shot = ms.chain.shot && !ms.chain.shot.res && ms.chain.shot.team !== a.team ? ms.chain.shot : null;
  if (!shot) return false;
  if (shot.onTarget) ms.stats.saves[a.team]++;
  ms.ball.last.kind = 'save';
  const sev = logEv(ms, 'save', a.team, a.id, ms.ball.p.x, ms.ball.p.z, {outcome: 'block', onTarget: !!shot.onTarget, shot: shot.id});
  chainSave(ms, a, 'block');
  onTouch(ms, a, 'save', sev);
  return true;
}
function countNear(ms, x, z, r){
  let n = 0;
  for (const o of ms.agents) if (o.onPitch && o.role === 'player' && !o.isGK && hypot(o.m.x - x, o.m.z - z) < r) n++;
  return n;
}

// a loose ball reaching the keeper in his box (actions.touchCheck): he gathers it in his hands when it is slow enough,
// smothers it on the ground, or parries what is too hot
export function gkCollect(ms, a){
  const g = gkRec(a), b = ms.ball, A = at(a);
  const sp = hypot(b.v.x, b.v.y, b.v.z);
  if (sp > GK.CATCH_V[0] + GK.CATCH_V[1]*A.handling) return false;
  const shot = ms.chain.shot && !ms.chain.shot.res && ms.chain.shot.team !== a.team ? ms.chain.shot : null;
  holdAt(ms, a, false, 1/60);
  setCtl(ms, a);
  g.state = 'hold'; g.t = 0; g.holdT = GK.HOLD[0] + (GK.HOLD[1] - GK.HOLD[0])*ms.r(); g.handsOn = false; g.claim = null;
  if (a.act && a.act.kind === 'dive'){ g.state = 'ground'; }
  if (shot){
    if (shot.onTarget) ms.stats.saves[a.team]++;
    const sev = logEv(ms, 'save', a.team, a.id, b.p.x, b.p.z, {outcome: 'catch', onTarget: !!shot.onTarget, shot: shot.id});
    chainSave(ms, a, 'catch');
    chainControl(ms, a, 'catch', sev);
  } else {
    const ev = logEv(ms, 'touch', a.team, a.id, b.p.x, b.p.z, {how: 'control', quality: 1, part: 'hands'});
    chainControl(ms, a, 'catch', ev);
  }
  onTouch(ms, a, 'save', null);
  refreshPred(ms);
  return true;
}

/* ---------- crosses (1.5.4) ---------- */

function considerClaim(ms, a){
  const g = a.gk, P = ms.pred, n = ms.predN, dir = ms.dirs[a.team];
  // where he meets it: the first point of its way down at the height of his hands (up to 2.4 m and a small jump),
  // inside the goal area + 2 m, that he reaches at 6 m/s before the ball is there
  const top = 2.4 + GK.CLAIM_JUMP*GK.CLAIM_JUMP/(2*9.81)*0.9;
  let drop = null, tk = 0;
  for (let k = 2; k < n; k++){
    const y0 = P[4*(k - 1) + 1], y1 = P[4*k + 1];
    if (!(y1 < y0) || y1 > top || y1 < 1.0) continue;
    const x = P[4*k], z = P[4*k + 2], t = P[4*k + 3], ex = -dir*x;
    if (!(ex >= ms.spec.hx - 5.5 - GK.CLAIM_BOX && Math.abs(z) <= 9.16 + GK.CLAIM_BOX)) continue;
    // his arrival: 6 m/s and a jump, and never sooner than his legs can take him (his hands reach 0.6 m ahead)
    const dk = hypot(x - a.m.x, z - a.m.z), dr = Math.max(0, dk - 0.6);
    const tt = Math.max(dk/GK.CLAIM_V + 0.15, dr > 0 ? timeToPoint(a.m, a.prm, a.fac, a.m.x + (x - a.m.x)*dr/dk, a.m.z + (z - a.m.z)*dr/dk, 0.15) : 0.15);
    if (tt > t + 0.05) continue;
    drop = {x, y: y1, z, t}; tk = tt;
    break;
  }
  if (!drop) return;
  // the first attacker's head there
  let ta = Infinity;
  for (const o of ms.agents){
    if (o.team === a.team || !o.onPitch || o.role !== 'player') continue;
    const t = timeToPoint(o.m, o.prm, o.fac, drop.x, drop.z, o.react);
    if (t < ta) ta = t;
  }
  if (tk + GK.CLAIM_MARGIN < ta){
    g.claim = {x: drop.x, z: drop.z, y: drop.y, t: drop.t, at: ms.t};
    g.state = 'claim'; g.handsOn = true; g.hitDone = false;
    g.plan = null;
  }
}

/* ---------- distribution (1.5.4) ---------- */

function distribute(ms, a){
  const g = a.gk, b = ms.ball, dir = ms.dirs[a.team], A = at(a);
  // throw to a full-back over 0.8 within 30 m; roll to a centre-back over 0.85; else a punt of 45 to 55 m
  let best = null, bv = 0, kind = 'punt';
  for (const o of ms.agents){
    if (o.team !== a.team || o === a || !o.onPitch || o.leaving) continue;
    const d = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
    if (d < 6 || d > GK.THROW[1]) continue;
    const fb = /^(LB|RB|LWB|RWB)$/.test(o.slot), cb = o.slot === 'CB';
    if (!fb && !cb) continue;
    const pm = passModel(ms, a.m, o.m, fb ? 'lob' : 'pass', fb ? 14 : passSpeedFor(d, 8), o);
    const need = fb ? GK.THROW[0] : GK.ROLL;
    if (pm.pOK > need && pm.pOK > bv){ bv = pm.pOK; best = o; kind = fb ? 'throw' : 'roll'; }
  }
  const from = {x: b.p.x, y: b.p.y, z: b.p.z};
  let ev;
  if (best && kind === 'roll'){
    const d = hypot(best.m.x - from.x, best.m.z - from.z), sp = passSpeedFor(d, 7);
    const dx = (best.m.x - from.x)/d, dz = (best.m.z - from.z)/d;
    // bowled from his hands: let go low and forward, it drops to the grass and rolls on (no jump of the ball)
    ballRelease(b, null, {x: dx*sp, y: -3.5, z: dz*sp}, null);
    ev = released(ms, a, 'roll', best.id, sp, d);
  } else if (best){
    const d = hypot(best.m.x - from.x, best.m.z - from.z);
    const L = solveStrike({from: {x: from.x, y: from.y, z: from.z}, target: {x: best.m.x, y: R, z: best.m.z}, speed: clamp(Math.sqrt(9.81*d)*1.05, 8, 20),
      contact: 0, curl: 0, foot: 'R', kind: 'throw', rollDecel: b.rollDecel});
    ballRelease(b, null, L.v, {x: 0, y: 0, z: 0});
    ev = released(ms, a, 'throw', best.id, hypot(L.v.x, L.v.y, L.v.z), d);
  } else {
    // the punt: drop it and volley it long toward the forwards
    const len = GK.PUNT[0] + (GK.PUNT[1] - GK.PUNT[0])*ms.r();
    let tz = 0, recv = -1, bvv = -Infinity;
    for (const o of ms.agents){
      if (o.team !== a.team || o === a || !o.onPitch) continue;
      const d = hypot(o.m.x - a.m.x, o.m.z - a.m.z);
      const v = -Math.abs(d - len) + 0.2*dir*o.m.x;
      if (v > bvv){ bvv = v; tz = o.m.z; recv = o.id; }
    }
    const tx = a.m.x + dir*len*0.95;
    // dropped from where his hands hold it (the volley meets it on the way down)
    ballRelease(b, null, {x: 0, y: 0, z: 0}, null);
    b.state = 'free';
    clearCtl(ms);
    startKick(ms, a, {kind: 'punt', target: {x: clamp(tx, -ms.spec.hx + 5, ms.spec.hx - 5), y: R, z: clamp(tz*0.8, -ms.spec.hz + 4, ms.spec.hz - 4)},
      recv, contact: 1, speed: loftSpeedFor(len)*1.02});
    a.act.tc = 0.22; a.act.adjust = false;
    g.state = 'distribute'; g.t = 0; g.handsOn = false;
    return;
  }
  g.state = 'ready'; g.handsOn = false;
  return ev;
}
function released(ms, a, intent, recv, sp, d){
  const b = ms.ball;
  b.last.agent = a.id; b.last.team = a.team; b.last.kind = intent; b.last.t = ms.t; b.pendN = 0;
  clearCtl(ms);
  refreshPred(ms);
  const ev = logEv(ms, 'kick', a.team, a.id, b.p.x, b.p.z, {intent, recv, speed: Math.round(sp*100)/100, contact: 0, dist: Math.round(d*10)/10});
  ms.stats.passes[a.team]++;
  chainKick(ms, ev);
  onKick(ms, ev);
  ms.kick = {seq: (ms.kick ? ms.kick.seq : 0) + 1, ev, t: ms.t, team: a.team, agent: a.id};
  return ev;
}

/* ---------- penalties (1.5.4) ---------- */

function penaltyStep(ms, a){
  const g = a.gk, R0 = ms.restart, gx = goalX(ms, a), dir = ms.dirs[a.team];
  steer(a, gx + dir*0.3, 0, 'walk', 0.1, {x: dir, z: 0});
  const tk = ms.agents[R0.taker];
  if (!tk || !tk.act || tk.act.kind !== 'kick' || g.pen) return;
  if (tk.act.t < tk.act.tc - GK.PEN_COMMIT) return;
  // the side: 40/40/20, plus 15% per 10 degrees of the shooter's body facing toward a side
  const f = dirOf(tk.m.yaw), facing = atan2(f.z, f.x*(-dir));
  const bias = clamp(GK.PEN_FACE*(Math.abs(facing)/(10*DEG)), 0, 0.4)*(facing >= 0 ? 1 : -1);
  let wl = GK.PEN_W[0] - bias*0.5, wr = GK.PEN_W[1] + bias*0.5;
  wl = Math.max(0.05, wl); wr = Math.max(0.05, wr);
  const r = ms.r()*(wl + wr + GK.PEN_W[2]);
  const side = r < wl ? -1 : r < wl + wr ? 1 : 0;
  // his left and right as he faces out: right = (-fz, fx) of his facing (dir, 0) = (0, dir)
  const z = side*dir*2.6, y = ms.r() < 0.6 ? 0.5 : 1.3;
  g.pen = side;
  const plan = planDive({x: a.m.x, z: a.m.z, y: 0, yaw: a.m.yaw, scale: a.scale || 1, at: at(a)}, {x: gx + dir*0.4, y, z, t: 0.47});
  g.plan = plan; g.diveT = 0; g.state = side === 0 ? 'catch' : 'dive'; g.handsOn = true; g.reread = true; g.hitDone = false;
  a.act = {kind: 'dive', t: 0, tc: plan.tc, plan, dur: plan.land + GK.GROUND, done: false};
}

/* ---------- the step ---------- */

// The keeper's step (1.4.14): states of 3.2.6. Moves him (through the mover, or along the dive's root curve) and keeps
// his hands for the ball world.
const PT = {x: 0, z: 0};
export function gkStep(ms, a, h){
  if (!a || !a.onPitch) return;
  const g = gkRec(a), A = at(a), b = ms.ball, dir = ms.dirs[a.team], gx = goalX(ms, a);
  g.t += h;
  if (ms.phase === 'restart' || ms.phase === 'kickoff' || ms.phase === 'goal'){
    const R0 = ms.restart;
    if (R0 && R0.kind === 'penalty' && R0.team !== a.team){ penaltyStep(ms, a); if (g.plan) diveStep(ms, a, h); return; }
    if (g.state === 'dive' || g.state === 'ground' || g.state === 'getUp'){ diveStep(ms, a, h); return; }
    if (R0 && R0.kind === 'goalkick' && R0.taker === a.id){ goalKickStep(ms, a); return; }
    // fetching the ball for a restart (out of his own net after a goal): the restart's procedure steers him
    if (R0 && R0.fetcher === a.id && a.set && (a.set.role === 'fetch' || a.set.role === 'serve')){ goalKickStep(ms, a); return; }
    if (b.state === 'held' && b.holder === a.id && !(R0 && R0.taker === a.id)){ ballRelease(b, null, {x: 0, y: 0, z: 0}, null); b.state = 'dead'; }
    g.state = 'ready'; g.handsOn = false; g.plan = null; g.read = null; g.claim = null; g.pen = null;
    const t = positionTarget(ms, a, PT);
    steer(a, t.x, t.z, 'jog', 0.3, faceTo(a, b.p.x, b.p.z, {x: 0, z: 0}));
    return;
  }
  if (ms.phase !== 'live'){ standStill(a); g.handsOn = false; return; }
  noticeKick(ms, a);
  if (g.read && ms.t >= g.read.at) readShot(ms, a);
  if (g.shift && shiftStep(ms, a)) return;
  switch (g.state){
    case 'dive': case 'catch': case 'ground': case 'getUp':
      diveStep(ms, a, h);
      return;
    case 'hold': {
      holdAt(ms, a, false, h);
      standStill(a, {x: dir, z: 0});
      if (ms.poss.ctl !== a.id) setCtl(ms, a);
      if (g.t >= g.holdT) distribute(ms, a);
      return;
    }
    case 'distribute':
      if (!a.act) g.state = 'ready';
      return;
    case 'claim': {
      const c = g.claim;
      if (!c || b.state !== 'free' || ms.t - c.at > c.t + 0.6){ g.state = 'ready'; g.claim = null; g.handsOn = false; break; }
      steer(a, c.x, c.z, 'sprint', 0.1, faceTo(a, b.p.x, b.p.z, {x: 0, z: 0}));
      // hands up toward the ball as it drops: reach 2.4 + a small jump
      const hy = clamp(b.p.y, 0.8, 2.75);
      const f = dirOf(a.m.yaw), rx = -f.z, rz = f.x;
      for (let i = 0; i < 2; i++){
        const H = g.hands[i], sd = i ? 1 : -1;
        const px = H.x, py = H.y, pz = H.z;
        H.x = a.m.x + f.x*0.35 + sd*0.045*rx; H.y = hy; H.z = a.m.z + f.z*0.35 + sd*0.045*rz;
        H.vx = (H.x - px)/h; H.vy = (H.y - py)/h; H.vz = (H.z - pz)/h;
      }
      g.handsOn = !g.hitDone && hypot(b.p.x - a.m.x, b.p.z - a.m.z) <= 2.5;
      return;
    }
  }
  // positioning, set, one-on-one, sweeping, collecting
  const one = oneOnOne(ms, a);
  const t = positionTarget(ms, a, PT);
  let gait = 'jog', stop = 0.15;
  if (one){
    const off = clamp(GK.ONE[0]*one.d, GK.ONE[1], GK.ONE[2]);
    const vx = one.c.m.x - gx, vz = one.c.m.z, vl = hypot(vx, vz) || 1;
    t.x = gx + vx/vl*off; t.z = vz/vl*off; gait = 'run';
    g.state = one.d < GK.SPREAD + 1 ? 'spread' : 'advance';
  }
  const threat = shooterThreat(ms, a);
  if (threat){ if (g.setT < 0) g.setT = ms.t; if (ms.t - g.setT >= GK.SET_T) g.set = true; }
  else { g.setT = -1; g.set = false; }
  const d = hypot(t.x - a.m.x, t.z - a.m.z);
  const face = faceTo(a, b.p.x, b.p.z, {x: 0, z: 0});
  if (!one){
    if (g.set && d < 0.6){ standStill(a, face); g.state = 'set'; }
    else if (d < GK.SHUFFLE_D){ steer(a, t.x, t.z, 'walk', stop, face, GK.SHUFFLE_V, true); g.state = 'shuffle'; }
    else { steer(a, t.x, t.z, 'run', stop, face, GK.REPOS_V); g.state = 'reposition'; }
  } else steer(a, t.x, t.z, gait, stop, face, 6);
  // a loose ball he gets to first: go and gather it (ballPlans gives him a chase plan in his box)
  if (a.plan && (a.plan.kind === 'chase' || a.plan.kind === 'intercept' || a.plan.kind === 'receive')){
    steer(a, a.plan.x, a.plan.z, 'sprint', 0.1, face);
  }
  g.handsOn = false;
}

// the dive in progress: the body along the plan's root curve, the hands toward the planned point (steered by the
// re-read), the ground, the get-up, the scramble
const DR = {x: 0, y: 0, z: 0, roll: 0};
function diveStep(ms, a, h){
  const g = a.gk, plan = g.plan, A = at(a);
  if (!plan){ g.state = 'ready'; a.act = null; return; }
  g.diveT += h;
  if (a.act && a.act.kind === 'dive') a.act.t = g.diveT;
  reread(ms, a);
  const r = diveRoot(plan, g.diveT, DR);
  // the root moves along the plan (never faster than the dive's own launch)
  const px = a.m.x, pz = a.m.z;
  a.m.x = r.x; a.m.z = r.z;
  a.m.vx = (r.x - px)/h; a.m.vz = (r.z - pz)/h; a.m.speed = hypot(a.m.vx, a.m.vz);
  a.y = plan.kind === 'stand' ? 0 : Math.max(-0.65, r.y);
  a.roll = r.roll;
  a.diveMoved = true;
  // the hands
  const hs = handsAt(plan, g.diveT, null, g.steer);
  for (let i = 0; i < 2; i++){
    const H = g.hands[i], ox = H.x, oy = H.y, oz = H.z;
    H.x = hs[i].x; H.y = hs[i].y; H.z = hs[i].z;
    H.vx = (H.x - ox)/h; H.vy = (H.y - oy)/h; H.vz = (H.z - oz)/h;
  }
  g.handsOn = !g.hitDone && g.state !== 'ground' && g.state !== 'getUp' && g.diveT < plan.tc + 0.35;
  if (ms.ball.state === 'held' && ms.ball.holder === a.id) holdAt(ms, a, false, h);
  const land = plan.kind === 'stand' ? plan.tc + 0.25 : plan.land + GKP.SLIDE;
  if (g.state === 'dive' || g.state === 'catch'){
    if (g.diveT >= land){ g.state = plan.kind === 'stand' ? (ms.ball.holder === a.id && ms.ball.state === 'held' ? 'hold' : 'ready') : 'ground'; g.t = 0; }
  } else if (g.state === 'ground'){
    if (g.t >= GK.GROUND){ g.state = 'getUp'; g.t = 0; }
    scramble(ms, a);
  } else if (g.state === 'getUp'){
    scramble(ms, a);
    if (g.t >= GK.GETUP[0] - GK.GETUP[1]*A.dive){
      a.y = 0; a.roll = 0; a.act = null; g.plan = null; g.handsOn = false;
      g.state = ms.ball.state === 'held' && ms.ball.holder === a.id ? 'hold' : 'ready';
      if (g.state === 'hold'){ g.t = 0; }
    }
  }
}
// on the ground or getting up: a loose ball within 1.2 m is his at 0.6 quality (a smother)
function scramble(ms, a){
  const b = ms.ball, g = a.gk;
  if (b.state !== 'free' || ms.poss.ctl >= 0) { if (b.state === 'held' && b.holder === a.id) holdAt(ms, a, false, 1/60); return; }
  const d = hypot(b.p.x - a.m.x, b.p.z - a.m.z);
  if (d < GK.SCRAMBLE && b.p.y < 1.0 && ms.r() < 0.6*0.25){
    gkCollect(ms, a);
    g.state = 'ground';
  }
}
// a goal kick: the keeper is the taker (rules.restartStep carries the ball to the spot), then kicks it
function goalKickStep(ms, a){
  const R0 = ms.restart, g = a.gk;
  g.handsOn = false; g.state = 'ready';
  if (a.set) steer(a, a.set.x, a.set.z, a.set.gait === 'run' || a.set.gait === 'sprint' ? a.set.gait : 'jog', a.set.stop != null ? a.set.stop : 0.3, a.set.face || null, a.set.speedCap != null ? a.set.speedCap : Infinity);
}
