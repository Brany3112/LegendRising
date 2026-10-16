/* ============ Training Mode: Free Play ============
   Owner: P5-A (Training Mode Phase 5: Free Play, the training key layer, the runner's admin API, the player's height
   and foot). Contract: BUILD-PLAN P5-A work item 1 and the Phase 5 contract "Freeplay exports spawnBall(o)";
   TRAINING-SPEC 4 ("Free Play: no objectives; Q spawns or resets ONE ball in front of the player (facing, sensible
   distance, valid height, never inside the body); optional practice opponents"; presets for Free Play settings).

   One scenario of the runner (registerScenario 'freeplay', category Free Play), played on the match's own simulation
   like every other: you start where you stand, looking the way you look, with the ball at your feet. There is no
   objective: nothing is judged, nothing is counted, it never ends by itself.
   - Q (keys.js routes it here) spawns or resets the ONE ball (spawnBall): the same ball, moved, so there is never a
     second one and nothing is built. It goes in front of you along your body's facing, 1.0 to 1.4 m out (further the
     faster you move, so a sprint does not run straight over it) scaled by your height; on the grass (y the ball's
     radius) with no velocity, unless the Free Play settings give it a height or a speed toward you; never inside a body
     (agent.js capsules), a goal frame or the fence: it is pushed to the nearest point that is free. Whoever had it lets
     go of it, and play restarts at once if it had stopped.
   - Practice opponents, 0 to 6, with their average and a behaviour: they stand still and watch the ball, jockey you
     (no tackles) or press (tackles and shield challenges). The behaviour is the AI's (brain.js drillMove, the training
     mode only); they spawn in a fan a few metres in front of you, facing you. An optional AI keeper.
   - The settings are config type 'free' (config.js registers it, so it is there under node too), so Free Play has
     presets like every scenario.
   spawnBall(o) is also what the admin panel's Ball section calls (o: {y, v} to override the settings' height and
   speed; the panel only offers config.js FREE_SPAWN.HEIGHTS and SPEEDS, spawnBall clamps whatever it gets to
   FREE.Y_MAX and V_MAX). */
import {registerScenario, RUN, placeBall, ballPlaced} from "./runner.js";
import {BEHAVE_NAMES, FREE_SPAWN} from "./config.js";
import {setupFromConfig} from "./teams.js";
import {P} from "../core/state.js";
import {BALL, ballKick} from "../football/ball.js";
import {capsules} from "../football/agent.js";
import {lawOf} from "../football/rules.js";
import {logEv, chainKick} from "../football/events.js";

const R = BALL.R;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const num = (v, d) => v != null && v !== "" && Number.isFinite(+v) ? +v : d;

export const FREEPLAY_ID = "freeplay";
// the Q ball: D m in front (from D[0] standing to D[1] at SPRINT_V m/s and over), times your height's scale; the
// highest it may be put (Y_MAX) and the fastest it may come at you (V_MAX); how far from the fence and from a body it
// stays (GAP); the fan the practice opponents spawn in (FAN: metres in front, radians between two of them)
export const FREE = Object.freeze({D:Object.freeze([1.0, 1.4]), SPRINT_V:7, Y_MAX:FREE_SPAWN.Y_MAX, V_MAX:FREE_SPAWN.V_MAX, GAP:0.04, FAN:Object.freeze([7, 0.42])});
// how many times Q has put the ball down (tests)
const FP = {spawns:0, last:null};

/* ---------- where the Q ball goes ----------
   spawnPoint(ms, me, spec, y, laws) -> {x, y, z, d, pushed}: pitch-local. In front of the body's facing at the distance
   for its speed and scale, then pushed out of anything solid: the bodies' capsules, the goal frames and nets, the
   fence and its roof (a stopping law keeps it inside the lines instead, so it is not out the moment it lands). */
export function spawnDist(speed, scale){
  const k = clamp((speed || 0)/FREE.SPRINT_V, 0, 1);
  return (FREE.D[0] + (FREE.D[1] - FREE.D[0])*k)*(scale || 1);
}
// the capsule radius of a body at the height y (agent.js capsules: legs, torso, head), 0 when the ball is above it
function capR(a, y){
  const C = capsules(a);
  let r = 0;
  if (y - R < C.legs.y1 && y + R > C.legs.y0) r = Math.max(r, C.legs.r);
  if (y - R < C.torso.y1 && y + R > C.torso.y0) r = Math.max(r, C.torso.r);
  if (Math.abs(y - C.head.y) < C.head.r + R) r = Math.max(r, C.head.r);
  return r;
}
export function spawnPoint(ms, me, spec, y, out = "rebound"){
  const yaw = me.m.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const d = spawnDist(me.m.speed, me.scale);
  const F = spec.cage ? spec.cage.fence : {hx:spec.hx + 2, hz:spec.hz + 2, h:20};
  const box = out === "stop" ? {hx:spec.hx - R - FREE.GAP, hz:spec.hz - R - FREE.GAP} : {hx:F.hx - R - FREE.GAP, hz:F.hz - R - FREE.GAP};
  const py = Math.min(clamp(y, R, FREE.Y_MAX), (F.h || 20) - R - FREE.GAP);
  // the goals: the frame and the net as one solid box behind each goal line (posts, bar, net)
  const goalBox = g => { const gx = Math.abs(g.postX), gz = g.mouthHalf + 0.06; return {s:g.end, x0:gx - R - FREE.GAP, x1:gx + 2.0 + R + FREE.GAP, z:gz + R + FREE.GAP, top:2.5 + R}; };
  const goals = (spec.goals || []).map(goalBox);
  const inGoal = (q, G) => q.y < G.top && G.s*q.x > G.x0 && G.s*q.x < G.x1 && Math.abs(q.z) < G.z;
  const bodies = ms.agents.filter(a => a.onPitch && a.role === "player");
  const inBody = (q, a) => { const r = capR(a, q.y); return r > 0 && Math.hypot(q.x - a.m.x, q.z - a.m.z) < r + R + FREE.GAP; };
  const free = q => Math.abs(q.x) <= box.hx && Math.abs(q.z) <= box.hz && !goals.some(G => inGoal(q, G)) && !bodies.some(a => inBody(q, a));
  const p0 = {x:me.m.x + fx*d, y:py, z:me.m.z + fz*d};
  if (free(p0)) return Object.assign(p0, {d, pushed:false});
  // pushed out: first straight out of whatever it is in (the fence back inside, a goal by its nearest face, a body away
  // from its axis), a few rounds; then, if that lands it in something else, the nearest free point of a ring of points
  // round where it was meant to go
  const q = {x:p0.x, y:py, z:p0.z};
  for (let it = 0; it < 6 && !free(q); it++){
    q.x = clamp(q.x, -box.hx, box.hx); q.z = clamp(q.z, -box.hz, box.hz);
    for (const G of goals) if (inGoal(q, G)){
      const ax = G.s*q.x, front = ax - G.x0, side = G.z - Math.abs(q.z), rear = G.x1 - ax, m = Math.min(front, side, rear);
      if (m === front) q.x = G.s*G.x0; else if (m === side) q.z = (q.z < 0 ? -1 : 1)*G.z; else q.x = G.s*G.x1;
    }
    for (const a of bodies) if (inBody(q, a)){
      const dx = q.x - a.m.x, dz = q.z - a.m.z, dd = Math.hypot(dx, dz), need = capR(a, q.y) + R + FREE.GAP + 1e-3;
      const ux = dd > 1e-6 ? dx/dd : fx, uz = dd > 1e-6 ? dz/dd : fz;
      q.x = a.m.x + ux*need; q.z = a.m.z + uz*need;
    }
  }
  let best = free(q) ? q : null, bd = best ? Math.hypot(q.x - p0.x, q.z - p0.z) : Infinity;
  for (let ring = 1; ring <= 12; ring++){
    const rr = 0.15*ring;
    for (let k = 0; k < 16; k++){
      const t = k/16*2*Math.PI, c = {x:p0.x + Math.cos(t)*rr, y:py, z:p0.z + Math.sin(t)*rr};
      if (rr < bd && free(c)){ best = c; bd = rr; }
    }
    if (best && bd <= rr) break;
  }
  const p = best || {x:clamp(p0.x, -box.hx, box.hx), y:py, z:clamp(p0.z, -box.hz, box.hz)};
  return {x:p.x, y:py, z:p.z, d, pushed:true};
}

/* ---------- Q: the one ball, spawned or reset ----------
   o: {y, v} (the admin panel's Ball section; else the Free Play settings). Returns the new place {x, y, z} (pitch-local)
   or null when Free Play is not what plays. The ball is the simulation's own (ms.ball): moved, stopped, let go by
   whoever had it, its net contact and dead-ball roll cleared, its prediction made again; the view is told it was put
   there (no streak from where it was). A speed sends it toward you as a kick from outside the play (the coach feed's
   way, ball.js ballKick). */
export function spawnBall(o = {}){
  const run = RUN.cur;
  if (!run || run.id !== FREEPLAY_ID || !run.T || !run.T.ms) return null;
  const T = run.T, ms = T.ms, me = T.me, spec = T.spec;
  const opts = (run.config && run.config.opts) || {};
  const y = clamp(num(o && o.y, num(opts.spawnY, R)), R, FREE.Y_MAX), v = clamp(num(o && o.v, num(opts.spawnV, 0)), 0, FREE.V_MAX);
  const law = lawOf(ms, "out") === "stop" ? "stop" : "rebound";
  const p = spawnPoint(ms, me, spec, y, law);
  // (nobody has it any more, at rest there, play going on from here: the runner's placeBall, as the admin's reset)
  const b = placeBall(ms, p, true);
  if (v > 0){
    const ux = me.m.x - p.x, uz = me.m.z - p.z, ul = Math.hypot(ux, uz) || 1;
    ballKick(b, {x:ux/ul*v, y:0, z:uz/ul*v}, null, {agent:-1, team:me.team, kind:"pass", t:ms.t});
    const ev = logEv(ms, "kick", me.team, -1, b.p.x, b.p.z, {intent:"pass", recv:me.id, coach:true, noOffside:true, launch:"pass", speed:Math.round(v*100)/100});
    chainKick(ms, ev);
    ms.kick = {seq:(ms.kick ? ms.kick.seq : 0) + 1, ev, t:ms.t, team:me.team, agent:-1};
  }
  ballPlaced(ms);
  FP.spawns++;
  // (what the tests read: where it went, where you were and how you faced and moved, and every body there then)
  FP.last = {x:p.x, y:p.y, z:p.z, d:p.d, pushed:p.pushed, v, me:{x:me.m.x, z:me.m.z, yaw:me.m.yaw, speed:me.m.speed, scale:me.scale || 1},
    bodies:ms.agents.filter(a => a.onPitch && a.role === "player").map(a => ({id:a.id, x:a.m.x, z:a.m.z, y:a.y || 0, scale:a.scale || 1}))};
  return {x:p.x, y:p.y, z:p.z, d:p.d, pushed:p.pushed};
}
// is Free Play what plays now (keys.js routes Q only then)
export const freePlaying = () => !!(RUN.cur && RUN.cur.id === FREEPLAY_ID && RUN.cur.T);

/* ---------- the scenario ---------- */
function build(config, env){
  const spec = env.spec, s = setupFromConfig("free", config, {spec});
  const F = spec.frame || {cx:0, cz:0}, B = spec.runoff || {hx:spec.hx + 2, hz:spec.hz + 2};
  // you, where you stand, looking the way you look (the runner puts you there; nothing moves you)
  s.me.x = clamp(P.x - F.cx, -B.hx, B.hx); s.me.z = clamp(P.z - F.cz, -B.hz, B.hz); s.me.yaw = P.yaw;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  // the ball at your feet: where Q would put it standing still
  const opts = config.opts || {};
  const sc = s.me.scale || 1, d = spawnDist(0, sc), y = clamp(num(opts.spawnY, R), R, FREE.Y_MAX);
  const sp = clamp(num(opts.spawnV, 0), 0, FREE.V_MAX);
  s.ball = Object.assign({}, s.ball, {x:s.me.x + fx*d, y, z:s.me.z + fz*d, vx:-fx*sp, vy:0, vz:-fz*sp, wx:0, wy:0, wz:0, free:true, kind:sp > 0 ? "pass" : null});
  // the practice opponents: a fan in front of you, facing you, each with the behaviour set
  const n = s.opps.length, behave = BEHAVE_NAMES[opts.behave] ? opts.behave : "jockey";
  s.opps.forEach((p, i) => {
    const a = P.yaw + (i - (n - 1)/2)*FREE.FAN[1], dist = FREE.FAN[0] + (i % 2)*1.5;
    p.x = s.me.x - Math.sin(a)*dist; p.z = s.me.z - Math.cos(a)*dist;
    p.yaw = Math.atan2(p.x - s.me.x, p.z - s.me.z);
    p.drill = {behave};
  });
  s.role = "Free Play";
  s.poss = {team:s.myTeam, who:"me", i:-1};
  return s;
}
registerScenario({id:FREEPLAY_ID, category:"freeplay", type:"free", name:"Free Play",
  desc:"No objectives. Press Q for a ball in front of you, and add practice opponents if you want some company.",
  build,
  ui:(T, run) => {
    const o = (run && run.config && run.config.opts) || {}, s = RUN.setup;
    return {role:"No objectives", keys:[{key:"Q", text:"a ball in front of you"}],
      lines:s && s.opps.length ? [`Opponents: ${(BEHAVE_NAMES[o.behave] || BEHAVE_NAMES.jockey).toLowerCase()}`] : null};
  }});

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainFree = {spawnBall, spawnPoint, spawnDist, freePlaying, FREE, FREEPLAY_ID, get spawns(){ return FP.spawns; }, get last(){ return FP.last; }};
