/* ============ Training Mode: the feeder ============
   Owner: P6-A (Training Mode Phase 6: Ball Receiving and First Touch). Contract: BUILD-PLAN P6-A work item 2 ("an AI
   passer playing real passes, or the coach feed, along configured trajectories. It never teleports the ball. It reads
   the same ball.launch config field that the runner applies today with an agent -1 kick. With a passer configured, the
   passer's own strike plays that launch from his foot instead"); TRAINING-SPEC 2 (ball physics: never teleport the
   ball), 4 (ball placement and trajectory: every setting changes the real configuration) and 5 (a configurable passer,
   direction, speed, height, ground, bouncing or aerial).

   A feed is plain data: where the ball lies (from, at rest: a dead ball nobody plays until it is fed), the kind of
   ball ('pass' along the ground, 'driven', 'cross', 'loft': config.js LAUNCH_KINDS, the contact each one is struck
   with as teams.js has it, unless contact says otherwise: -1 low, 0 normal, 1 high), its speed (or, for a pass along
   the grass, arrive: the speed it is to reach its target at, a weighted pass into space) and curl, and where it
   goes: a fixed target, or a point on a receiver (aim: {who, along, across, up, toward, short, dir}: metres along his
   run (his velocity, else dir, else his facing), across it, the height it gets to him at, metres in front of him
   toward the ball where that height is met, and how far short of him a bouncing ball pitches). The receiver's point is where he will be when
   the ball gets there (his velocity carried on, the flight time solved again until it settles), so a pass played to a
   man on the run meets his stride.
   When it is played: after wait.t seconds of the go, once the receiver moves at wait.v m/s or more (a run he was asked
   to make), and at the latest after wait.max seconds.
   How it is played:
   - The coach's feed (passer -1): a kick from outside the play, as the runner's activation launch is (ball.js
     ballKick, agent -1, logged as the coach's).
   - A passer (an agent of the simulation, a team-mate standing at the ball): his own kick (actions.js startKick, the
     one every player strikes with), his body's strike clip and all. A feed is a delivery drill, so his strike is the
     configured launch exactly: no deviation is drawn for it (the strike's three unit draws are zero) and its speed
     spread is none. What still shapes the flight is his own strike: his aero skill (the drag of his ball) and his
     curve skill, both of which the solve takes in, so the ball still lands on the configured target at the configured
     speed. plan() is that solve, the one the test compares the real flight with.
   Pure of the DOM and of the page: it runs under node (qa/tr6-receive.mjs) as in the browser. */
import {solveStrike} from "../football/strike.js";
import {ballKick, BALL, rollSpeedFor} from "../football/ball.js";
import {startKick, refreshPred} from "../football/actions.js";
import {logEv, chainKick} from "../football/events.js";
import {dirOf} from "../football/pitchspec.js";
import {sprintSpeed} from "../mover.js";
import {FRESH} from "../stamina.js";

const R = BALL.R;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// BACK, SIDE: where the passer stands from the ball (behind it on the line of the pass, to his support foot's side);
// CONTACT_EST: the seconds from the passer's start to his contact the receiver's point is worked out for; ITERS: the
// rounds of the flight time; WAIT: the default seconds before a feed, MAX the latest; RUN_TAU: how fast a runner
// closes on the speed he is asking for (seconds), for where he will be
export const FEEDER = Object.freeze({BACK:0.62, SIDE:0.12, CONTACT_EST:0.16, ITERS:4, WAIT:1.0, MAX:4.5, RUN_TAU:0.22});
// the contact each kind is struck with (teams.js: driven -1, a cross or a lofted ball 1, a pass 0)
export const CONTACT = Object.freeze({pass:0, driven:-1, cross:1, loft:1});
// the touch kind ball.js records and the action a passer strikes it as
const touchKind = k => k === "cross" || k === "loft" ? "cross" : "pass";

/* the launch of a feed to a target: solveStrike (the solver of teams.js and of every strike) from the spot, at the
   speed, with the kind's contact; the striker's aero and curve when a player strikes it (his flight), none for the
   coach. Returns {v, w, apex, tFlight, ok, speed, contact} */
export function launchOf(f, target, rollDecel, striker = null){
  const contact = f.contact != null ? f.contact : CONTACT[f.kind] != null ? CONTACT[f.kind] : 0;
  const at = striker && striker.at ? striker.at : null;
  // (a weighted pass, f.arrive: struck to reach its target at that speed along the grass, his ball's drag and all)
  const ground = contact <= 0 && target.y <= R + 0.05 && f.from.y <= R + 0.05;
  const speed = f.arrive > 0 && ground ? clamp(rollSpeedFor(Math.hypot(target.x - f.from.x, target.z - f.from.z), f.arrive, rollDecel, 1 - 0.0045*clamp(at ? +at.aero || 0 : 0, 0, 99)), 3, 32) : f.speed;
  const s = solveStrike({from:{x:f.from.x, y:f.from.y, z:f.from.z}, target:{x:target.x, y:target.y, z:target.z}, speed, contact,
    curl:f.curl || 0, foot:"R", kind:f.kind, rollDecel, curve:at ? at.curve : undefined, aero:at ? at.aero : 0});
  return {v:{x:s.v.x, y:s.v.y, z:s.v.z}, w:{x:s.w.x, y:s.w.y, z:s.w.z}, apex:s.apex, tFlight:s.tFlight, ok:s.ok, speed:Math.hypot(s.v.x, s.v.y, s.v.z), contact};
}

/* where a feed goes now: its fixed target, or the receiver's point when the ball gets there (his run carried on).
   who: the receiver's agent record (or a flat {x, z, vx, vz, yaw}); lead: seconds before the ball is struck */
export function targetOf(f, who, rollDecel, striker = null, lead = 0){
  if (!f.aim) return {x:f.target.x, y:f.target.y, z:f.target.z};
  const m = who.m || who, A = f.aim;
  const vx = +m.vx || 0, vz = +m.vz || 0, sp = Math.hypot(vx, vz);
  // his way: where he runs, else the way the drill says (aim.dir), else where he faces
  let ux, uz;
  if (sp > 0.8){ ux = vx/sp; uz = vz/sp; }
  else if (A.dir){ const l = Math.hypot(A.dir.x, A.dir.z) || 1; ux = A.dir.x/l; uz = A.dir.z/l; }
  else { const d = dirOf(+m.yaw || 0); ux = d.x; uz = d.z; }
  const y = Math.max(R, A.up != null ? +A.up : R);
  // how far his run takes him in tt seconds: from his speed now up to the speed he is asking his legs for (the mover's
  // target), on the mover's own acceleration curve (mover.js: a0 (1 - v/vmax)^0.8, s^0.2 falling at 0.2 k a second), so
  // a man still getting up to speed is met where he will be, not where his speed now says; with no mover's numbers, a
  // closing time of RUN_TAU
  const vt = Math.max(sp, +m.target || 0), ex = sp > 0.8 ? vx/sp : ux, ez = sp > 0.8 ? vz/sp : uz;
  const prm = who.prm, fac = who.fac || FRESH;
  const run = tt => {
    if (!(vt > sp + 0.05)) return sp*tt;
    if (!prm) return vt*tt - (vt - sp)*FEEDER.RUN_TAU*(1 - Math.exp(-tt/FEEDER.RUN_TAU));
    const vmax = Math.max(vt, sprintSpeed(prm, fac)), k = prm.a0*(fac.accel || 1)/vmax, s0 = Math.pow(Math.max(0, 1 - sp/vmax), 0.2);
    let d = 0, v = sp;
    const n = Math.max(1, Math.ceil(tt*60)), h = tt/n;
    for (let i = 1; i <= n; i++){
      const sg = Math.max(0, s0 - 0.2*k*i*h), v1 = Math.min(vt, vmax*(1 - Math.pow(sg, 5)));
      d += (v + v1)/2*h; v = v1;
    }
    return d;
  };
  let t = 1, tg = null;
  for (let i = 0; i < FEEDER.ITERS; i++){
    const tt = lead + t, dr = run(tt);
    let px = m.x + ex*dr + ux*(A.along || 0) - uz*(A.across || 0), pz = m.z + ez*dr + uz*(A.along || 0) + ux*(A.across || 0);
    // a ball in the air is aimed at its height where he meets it: toward metres in front of him, on the side it comes from
    if (A.toward > 0){
      const dx = f.from.x - px, dz = f.from.z - pz, dl = Math.hypot(dx, dz) || 1;
      px += dx/dl*A.toward; pz += dz/dl*A.toward;
    }
    // a bouncing ball pitches short of him, on the line it comes along
    if (A.short > 0){
      const dx = px - f.from.x, dz = pz - f.from.z, dl = Math.hypot(dx, dz) || 1;
      px -= dx/dl*A.short; pz -= dz/dl*A.short;
    }
    tg = {x:px, y:A.short > 0 ? R : y, z:pz};
    const L = launchOf(f, tg, rollDecel, striker);
    const tf = Number.isFinite(L.tFlight) ? L.tFlight : t;
    // (a bouncing ball reaches him a little after it pitches: the bounce's own time, about the flight's share)
    const tn = A.short > 0 ? tf + A.short/Math.max(4, 0.6*f.speed) : tf;
    if (Math.abs(tn - t) < 0.01){ t = tn; break; }
    t = tn;
  }
  return tg;
}

/* the feed's state for a go: {f, state: 'wait' | 'strike' | 'flight', t0, fedAt, plan, target, kick (the kick event),
   apex (the highest the ball has been since), passer, lastY}. Made at the first step of the go */
export function feedStart(f, ms){
  return {f, state:"wait", t0:ms.t, fedAt:-1, plan:null, target:null, kick:null, apex:-1, landed:false, passer:f.passer != null ? f.passer : -1};
}

// the passer to his spot behind the ball, facing along the pass (the setup puts him there; a restart puts him back)
export function passerSpot(from, target, foot = "R"){
  const dx = target.x - from.x, dz = target.z - from.z, l = Math.hypot(dx, dz) || 1, ux = dx/l, uz = dz/l;
  const sd = foot === "L" ? 1 : -1, rx = -uz, rz = ux;
  return {x:from.x - ux*FEEDER.BACK + rx*sd*FEEDER.SIDE, z:from.z - uz*FEEDER.BACK + rz*sd*FEEDER.SIDE, yaw:Math.atan2(-ux, -uz)};
}

/* one step of a feed, after the simulation's step: returns the state. recv: the receiver's agent id */
export function feedStep(ms, S, recv){
  if (!S) return null;
  const f = S.f, b = ms.ball, me = ms.agents[recv];
  if (S.state === "wait"){
    const t = ms.t - S.t0, sp = me ? me.m.speed : 0, W = f.wait || {};
    const due = t >= (W.t != null ? W.t : FEEDER.WAIT) && (!(W.v > 0) || sp >= W.v) || t >= (W.max != null ? W.max : FEEDER.MAX);
    if (!due || !me) return S;
    const pa = S.passer >= 0 ? ms.agents[S.passer] : null;
    // a passer who cannot strike now (on the ground, in the middle of something) leaves it to the coach
    const striker = pa && pa.onPitch && !pa.act ? pa : null;
    S.target = targetOf(f, me, b.rollDecel, striker, striker ? FEEDER.CONTACT_EST : 0);
    S.plan = launchOf(f, S.target, b.rollDecel, striker);
    if (striker){
      // his own strike, the configured launch exactly: no deviation drawn, no speed spread (see the header)
      startKick(ms, striker, {kind:touchKind(f.kind), target:S.target, speed:S.plan.speed, contact:S.plan.contact, curl:f.curl || 0, recv,
        weightSigma:0, noRecord:true, feed:true});
      if (striker.act){ striker.act.pre = false; striker.act.devZ = [0, 0, 0]; }
      S.state = "strike"; S.strikeAt = ms.t;
      return S;
    }
    coachKick(ms, S, recv);
    return S;
  }
  if (S.state === "strike"){
    const pa = ms.agents[S.passer];
    const ev = pa && pa.act && pa.act.kind === "kick" && pa.act.done ? pa.act.ev : null;
    if (ev && !ev.whiff){ S.kick = ev; S.fedAt = ev.t; S.state = "flight"; S.apex = b.p.y; S.lastY = b.p.y; }
    else if (ev && ev.whiff || !pa || !pa.act){ coachKick(ms, S, recv); }
    return S;
  }
  if (S.state === "flight" && !S.landed){
    // the highest the ball has been since it was struck, until it comes down or somebody plays it
    if (b.p.y > S.apex) S.apex = b.p.y;
    const touched = b.last.agent !== (S.passer >= 0 && S.kick && S.kick.agent === S.passer ? S.passer : -1);
    if (touched || (b.grounded && b.p.y <= R + 0.02 && ms.t - S.fedAt > 0.1)) S.landed = true;
  }
  return S;
}
// the coach's feed: the ball, at rest where it lies, kicked from outside the play (agent -1), as the runner's launch is
function coachKick(ms, S, recv){
  const b = ms.ball, f = S.f, me = ms.agents[recv], team = me ? me.team : 0;
  if (!S.plan || S.passer >= 0){ S.target = targetOf(f, me, b.rollDecel, null, 0); S.plan = launchOf(f, S.target, b.rollDecel, null); }
  const L = S.plan, kind = touchKind(f.kind);
  ballKick(b, L.v, L.w, {agent:-1, team, kind, t:ms.t});
  const ev = logEv(ms, "kick", team, -1, b.p.x, b.p.z, {intent:kind, recv, coach:true, noOffside:true, launch:f.kind, speed:Math.round(L.speed*100)/100});
  chainKick(ms, ev);
  ms.kick = {seq:(ms.kick ? ms.kick.seq : 0) + 1, ev, t:ms.t, team, agent:-1};
  refreshPred(ms);
  S.kick = ev; S.fedAt = ms.t; S.state = "flight"; S.apex = b.p.y; S.passer = -1;
}
