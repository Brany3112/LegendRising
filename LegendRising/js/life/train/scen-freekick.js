/* ============ Training Mode: free kicks ============
   Owner: P7-A (Training Mode Phase 7: free kicks build mode and set-piece AI). Contract: BUILD-PLAN P7-A work items 1
   to 6 and the Phase 7 contract (rules.js startRestart opt.taker, opt.second, opt.secondAction, opt.wallSpec, opt.plan;
   brain.js wallSpots, the wall's and the second taker's parts); TRAINING-SPEC 0 (up to 6 v 6 plus an AI keeper, the
   wall in the defenders' six: G0 d and h), 1 (one engine: the real restart, the real strike, the real keeper), 4
   (configure, place, confirm, start; every setting real, presets by type) and 5 (Free kicks).

   The configuration type 'freekick' (config.js registers it with the wall field; this module adds its options). Step 1
   is the configuration sheet: the participants, the wall's size (0 to 6, in the defenders' six) and whether it is up,
   the second taker and what he does, the keeper and the attributes. Steps 2 to 4 are the placement (fkplace.js, in the
   world): the ball at a distance and an angle from the goal, only where a free kick can be (outside the penalty area,
   inside the lines), then the wall (its distance from the ball, its offset across, its alignment and size), each
   confirmed in turn, then Start. The placement is kept in the configuration's options (opts.ballDist, ballAng,
   wallDist, wallOff, wallAlign, wallOn and the wall field), so a preset keeps it and a retry plays it again.

   My role says what I do:
     taker     I take it (the second taker, when there is one, plays his part with me)
     receiver  I am the second taker: I touch it to him (pass), run over it (decoy), or take his short one and shoot
               (short) or run with it (carry)
     attacker  the computer's taker goes for goal or crosses it; I attack the box for the rebound or the cross
     support   as the attacker, from the edge of the box
     defender  their free kick: I am one of the free defenders, or one of the wall (opts.meWall)
   The keeper is always the computer's.

   build(config, env) gives the runner's setup (everyone on his spot, the ball dead on the spot) and its plan (plain
   data the snapshot keeps). A go (goState, setStep, judge) is the real restart: rules.js startRestart with the wall
   (wallSpec: brain.js places it, its men the ones the setup put there) and the second taker; brain.js plays the
   computer's part; from the strike on it is ordinary play on the one engine.

   The placement's own state (placeState, previewBall, confirmBall, previewWall, confirmWall, adjust, canStart,
   measures, applyPlace) is plain data too: fkplace.js draws it, qa/tr7-freekick.mjs checks it under node.

   Pure: no DOM, no globals, no Math.random; Node runs it. fkplace.js registers the scenarios with the runner. */
import {registerType, validate, counts, allowed, ROLE_NAMES} from "./config.js";
import {setupFromConfig} from "./teams.js";
import {describe} from "./presets.js";
import {goalsLawOf} from "../football/cagespec.js";
import {startRestart, RULES} from "../football/rules.js";
import {TEMPO} from "../football/sim.js";
import {atan2} from "../football/detmath.js";
import {wallSpots, restartShape, WALL_SPEC, FK_ACTIONS} from "../football/brain.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = 0.11;
const r3 = v => Math.round(v*1000)/1000;
const r2 = v => Math.round(v*100)/100;
const faceTo = (dx, dz) => atan2(-dx, -dz);
const hyp = (x, z) => Math.sqrt(x*x + z*z);

/* ---------- the limits of a placement ----------
   The ball: DMIN to DMAX m from the middle of the goal line, up to AMAX degrees either side (+ toward +z, the
   attackers' right), never inside the penalty area (its front 16.5 m out, its sides 20.16 m across, MARGIN more for
   the ball and the line) and EDGE m inside the touchlines and the far line. The wall: WDMIN to WDMAX m from the ball,
   WOFF m either side, 0 to 6 men. */
export const FK = Object.freeze({DMIN:16, DMAX:40, AMAX:60, BOX_D:16.5, BOX_W:20.16, MARGIN:0.4, EDGE:1, WDMIN:5, WDMAX:12, WOFF:3,
  BALL0:22, ANG0:0, WD0:9.15, TAKER_BACK:1.6, CLEAR:5});
export const SECOND_NAMES = Object.freeze({none:"No second taker", pass:"He touches it to the taker", decoy:"He runs over it (a decoy)",
  short:"The taker plays it short to him, he shoots", carry:"The taker plays it to him, he runs with it"});
export const STRIKE_NAMES = Object.freeze({shot:"Goal", cross:"A cross into the box", auto:"Whatever's on"});
export const ALIGN_NAMES = Object.freeze({post:"Covers the near post", centre:"Square to the middle of the goal"});
const AFTER = 6, SET_MAX = 30;

registerType("freekick", {
  labels:{defenders:"Free defenders", wall:"Defenders in the wall"},
  options:{
    wallOn:{kind:"bool", label:"Wall", help:"Off takes the wall away and keeps its size for when it's back.", def:true},
    second:{kind:"enum", label:"Second taker", help:"A team-mate at the ball with the taker, and what he does.",
      values:Object.entries(SECOND_NAMES).map(([v, label]) => ({v, label})), def:"none", when:c => c.role !== "defender" || !!c.opps},
    strike:{kind:"enum", label:"The taker goes for", values:Object.entries(STRIKE_NAMES).map(([v, label]) => ({v, label})), def:"shot",
      when:c => c.role !== "taker"},
    meWall:{kind:"bool", label:"You stand in the wall", help:"Off, you're one of the free defenders.", def:false, when:c => c.role === "defender" && c.wall > 0},
    time:{kind:"int", label:"Seconds of play after it's taken", help:"How long the go runs on from the moment it's taken.", min:3, max:20, step:1, def:AFTER},
    replay:{kind:"bool", label:"Instant replay of a goal", def:true},
    // the placement (the build mode sets these; the sheet never shows them)
    ballDist:{kind:"num", label:"Distance to goal", min:FK.DMIN, max:FK.DMAX, step:0.1, def:FK.BALL0, when:() => false},
    ballAng:{kind:"num", label:"Angle", min:-FK.AMAX, max:FK.AMAX, step:1, def:FK.ANG0, when:() => false},
    wallDist:{kind:"num", label:"Wall distance from the ball", min:FK.WDMIN, max:FK.WDMAX, step:0.05, def:FK.WD0, when:() => false},
    wallOff:{kind:"num", label:"Wall offset across", min:-FK.WOFF, max:FK.WOFF, step:0.05, def:0, when:() => false},
    wallAlign:{kind:"enum", label:"Wall alignment", values:Object.entries(ALIGN_NAMES).map(([v, label]) => ({v, label})), def:"post", when:() => false}
  }});

const angWord = a => Math.abs(a) < 0.5 ? "straight on" : `${Math.round(Math.abs(a))} degrees ${a > 0 ? "right" : "left"}`;
describe("freekick", c => `${c.role === "taker" ? "You take it" : c.role === "receiver" ? "You're the second taker" : c.role === "defender" ? "They take it" : "A team-mate takes it"}, ${r2(c.opts.ballDist).toFixed(1)} m ${angWord(c.opts.ballAng)}, ${c.opts.wallOn && c.wall ? `wall of ${c.wall}` : "no wall"}`);

/* ---------- the placement's geometry (the goal attacked at +x: the line x = spec.hx, its middle at z = 0) ---------- */
const inBox = (spec, x, z) => spec.hx - x < FK.BOX_D + FK.MARGIN && Math.abs(z) < FK.BOX_W + FK.MARGIN;
/* ballSpot(spec, dist, ang) -> {x, z, dist, ang, moved}: the ball at dist m and ang degrees from the middle of the goal
   line, moved to the nearest valid place along the same line when that is inside the penalty area (out past its front
   or its side), and kept inside the lines; dist and ang are then what it really is */
export function ballSpot(spec, dist, ang){
  const gx = spec.hx;
  let d = clamp(+dist || FK.BALL0, FK.DMIN, FK.DMAX), a = clamp(+ang || 0, -FK.AMAX, FK.AMAX)*Math.PI/180;
  const c = Math.cos(a), s = Math.sin(a);
  let x = gx - d*c, z = d*s, moved = false;
  if (inBox(spec, x, z)){
    // out of the area along the line from the goal: past its front or past its side, whichever comes first
    const ex = (FK.BOX_D + FK.MARGIN + 0.02)/Math.max(1e-6, c), es = Math.abs(s) > 1e-6 ? (FK.BOX_W + FK.MARGIN + 0.02)/Math.abs(s) : Infinity;
    d = Math.min(ex, es); x = gx - d*c; z = d*s; moved = true;
  }
  const hz = spec.hz - FK.EDGE, x0 = -spec.hx + FK.EDGE;
  if (Math.abs(z) > hz){ z = Math.sign(z)*hz; moved = true; }
  if (x < x0){ x = x0; moved = true; }
  if (inBox(spec, x, z)){ x = gx - FK.BOX_D - FK.MARGIN - 0.02; moved = true; }
  x = r3(x); z = r3(z);
  return {x, z, dist:r3(hyp(gx - x, z)), ang:r2(Math.atan2(z, gx - x)*180/Math.PI), moved};
}
export const validBall = (spec, p) => !inBox(spec, p.x, p.z) && Math.abs(p.z) <= spec.hz - FK.EDGE + 1e-9 && p.x >= -spec.hx + FK.EDGE - 1e-9 && p.x < spec.hx;
// the ground-plane distance from the ball to the middle of the goal line (the HUD's "Distance to goal")
export const goalDistance = (spec, p) => hyp(spec.hx - p.x, p.z);
// the wall's spec as brain.js takes it
export const wallSpecOf = w => ({n:w.on === false ? 0 : clamp(Math.round(+w.n || 0), 0, WALL_SPEC.N), on:w.on !== false, dist:clamp(+w.dist || FK.WD0, FK.WDMIN, FK.WDMAX),
  off:clamp(+w.off || 0, -FK.WOFF, FK.WOFF), align:w.align === "centre" ? "centre" : "post"});
// where its men stand for a ball at p
export const wallOf = (spec, p, w) => wallSpots(p, spec.hx, wallSpecOf(w), {hx:spec.hx, hz:spec.hz});
// the wall's distance from the ball: to its nearest man (as the laws measure it); null with no wall
export function wallDistance(p, spots){
  if (!spots || !spots.length) return null;
  let m = Infinity;
  for (const q of spots){ const d = hyp(q.x - p.x, q.z - p.z); if (d < m) m = d; }
  return m;
}

/* ---------- the placement (build mode) ----------
   placeState(config, spec) -> the state of steps 2 to 4 for a configuration: the ball and the wall as the options have
   them (the preview), nothing confirmed. A confirmed position is a copy taken at the confirm: nothing a later preview
   does reaches it */
export function placeState(config, spec){
  const c = validate("freekick", config), o = c.opts;
  return {spec, ball:{dist:o.ballDist, ang:o.ballAng}, wall:{n:c.wall, on:!!o.wallOn, dist:o.wallDist, off:o.wallOff, align:o.wallAlign},
    maxWall:Math.max(...allowed("freekick", c, "wall")), ballOk:false, wallOk:false, conf:{ball:null, wall:null}, go:false};
}
// the ball's preview moved (only while it is not confirmed). Returns whether it was taken
export function previewBall(S, b){
  if (S.ballOk) return false;
  if (b.dist != null) S.ball.dist = clamp(+b.dist, FK.DMIN, FK.DMAX);
  if (b.ang != null) S.ball.ang = clamp(+b.ang, -FK.AMAX, FK.AMAX);
  return true;
}
export function confirmBall(S){
  if (S.ballOk) return false;
  const p = ballSpot(S.spec, S.ball.dist, S.ball.ang);
  S.ball.dist = p.dist; S.ball.ang = p.ang;
  S.conf.ball = {x:p.x, z:p.z, dist:p.dist, ang:p.ang};
  S.ballOk = true;
  // (the wall stands where it is from the ball: confirmed again for the ball's new place)
  S.wallOk = false; S.conf.wall = null;
  return true;
}
// the wall's preview changed (only once the ball is confirmed; a change to a confirmed wall opens it again, the ball
// staying confirmed). The ball is never touched
export function previewWall(S, w){
  if (!S.ballOk) return false;
  if (S.wallOk){ S.wallOk = false; S.conf.wall = null; }
  if (w.n != null) S.wall.n = clamp(Math.round(+w.n), 0, S.maxWall);
  if (w.on != null) S.wall.on = !!w.on;
  if (w.dist != null) S.wall.dist = clamp(+w.dist, FK.WDMIN, FK.WDMAX);
  if (w.off != null) S.wall.off = clamp(+w.off, -FK.WOFF, FK.WOFF);
  if (w.align != null) S.wall.align = w.align === "centre" ? "centre" : "post";
  return true;
}
export function confirmWall(S){
  if (!S.ballOk || S.wallOk) return false;
  S.conf.wall = Object.assign({}, S.wall);
  S.wallOk = true;
  return true;
}
// Adjust Placement: both open again, the previews where they were
export function adjust(S){ S.ballOk = false; S.wallOk = false; S.conf.ball = null; S.conf.wall = null; S.go = false; return true; }
export const canStart = S => !!(S && S.ballOk && S.wallOk);
// the live indicators: the preview ball's distance to goal, the preview wall's from the ball (the confirmed ball once
// there is one), and both as placed
export function measures(S){
  const p = S.ballOk ? S.conf.ball : ballSpot(S.spec, S.ball.dist, S.ball.ang);
  const W = wallOf(S.spec, p, S.wall);
  return {ball:{x:p.x, z:p.z}, ballGoal:r2(goalDistance(S.spec, p)), wall:W.spots, wallBall:W.spots.length ? r2(wallDistance(p, W.spots)) : null, valid:validBall(S.spec, p)};
}
// the configuration with the placement in it (what a confirm hands the runner, and what a preset keeps)
export function applyPlace(config, S){
  const c = JSON.parse(JSON.stringify(config));
  c.opts = Object.assign({}, c.opts, {ballDist:S.ball.dist, ballAng:S.ball.ang, wallDist:S.wall.dist, wallOff:S.wall.off, wallAlign:S.wall.align, wallOn:S.wall.on});
  c.wall = S.wall.n;
  return validate("freekick", c);
}

/* ---------- the setup ---------- */
// the people a role needs on the side that takes it (me counted when I attack); the second taker one more
export function fitConfig(config, notes = null){
  const c = validate("freekick", config);
  const meAtt = c.role !== "defender";
  if (c.role === "receiver" && c.opts.second === "none"){ c.opts.second = "short"; if (notes) notes.push("You're the second taker, so the taker plays it short to you."); }
  const sec = c.opts.second !== "none" ? 1 : 0;
  const need = (c.role === "taker" ? 1 : 2) + (c.role === "receiver" ? 0 : sec) - (meAtt ? 0 : 1);
  const att = Math.max(1, need);
  if (c.attackers < att || (meAtt ? att > 1 && !c.mates : !c.opps)){
    c.attackers = Math.max(c.attackers, att);
    if (meAtt && att > 1) c.mates = true;
    if (!meAtt) c.opps = true;
    if (notes) notes.push(meAtt ? `This needs ${att} on your side, so team-mates are on.` : `This needs ${att} of them to take it, so opponents are on.`);
  }
  return validate("freekick", c);
}
// who a place is in the plan: {team: 'mine' | 'theirs', i} (i -1: me)
const refOf = (S, p) => p === S.me ? {team:"mine", i:-1} : S.mates.includes(p) ? {team:"mine", i:S.mates.indexOf(p)} : {team:"theirs", i:S.opps.indexOf(p)};
/* build(config, env) -> the runner's setup. The goal attacked is always +x (team 0 attacks it: the side that takes it
   is team 0). env.spec: the cage's pitch */
export function build(config, env = {}){
  if (!env.spec) throw new Error("freekick build: the cage's pitch spec is needed (env.spec)");
  const notes = [];
  const c = fitConfig(config, notes), o = c.opts, spec = env.spec;
  // (the wall down: its men are not on the pitch at all; the size is kept in the configuration)
  const cb = o.wallOn ? c : Object.assign({}, c, {wall:0});
  const s0 = setupFromConfig("freekick", cb, {spec, seed:env.seed});
  const n = counts("freekick", cb), meAtt = c.role !== "defender";
  const S = {me:Object.assign({}, s0.me), mates:s0.mates.map(p => Object.assign({}, p)), opps:s0.opps.map(p => Object.assign({}, p))};
  const att = meAtt ? [S.me, ...S.mates] : S.opps, def = meAtt ? S.opps : [S.me, ...S.mates];
  // the wall: the last n.wall of the defending side's computer players (teams.js puts them last), me among them
  // when I stand in it (in the first man's place, he a free defender in mine)
  const defNpc = meAtt ? S.opps : S.mates;
  let wall = n.wall > 0 ? defNpc.slice(defNpc.length - n.wall) : [];
  if (!meAtt && o.meWall && wall.length){ const w0 = wall[0]; wall = [S.me, ...wall.slice(1)]; w0.x = S.me.x; w0.z = S.me.z; }
  // the takers: me or the side's first; the second taker me (receiver) or the next
  const npcAtt = att.filter(p => p !== S.me);
  const taker = c.role === "taker" ? S.me : npcAtt[0] || null;
  const action = FK_ACTIONS.includes(o.second) ? o.second : null;
  const second = action ? (c.role === "receiver" ? S.me : npcAtt.find(p => p !== taker) || null) : null;
  const P = {kind:"free", attTeam:0, role:c.role, strike:c.role === "taker" ? null : o.strike, action:second ? action : null,
    taker:taker ? refOf(S, taker) : null, second:second ? refOf(S, second) : null, wallRefs:wall.map(p => refOf(S, p)),
    wall:wallSpecOf({n:wall.length, on:o.wallOn, dist:o.wallDist, off:o.wallOff, align:o.wallAlign}),
    base:[], time:o.time, replay:!!o.replay, meWall:!meAtt && !!o.meWall && wall.includes(S.me), spot:null, measure:null};
  // everyone else's configured spot, kept for the layout
  for (const p of [S.me, ...S.mates, ...S.opps]) if (p !== taker && p !== second && !wall.includes(p)) P.base.push({ref:refOf(S, p), x:p.x, z:p.z});
  const setup = {myTeam:s0.myTeam, role:c.role === "receiver" ? "Second taker" : ROLE_NAMES[c.role] || "Player", seed:s0.seed,
    laws:{out:"stop", offside:false, goals:goalsLawOf(spec), restarts:true},
    me:S.me, mates:S.mates, opps:S.opps, keeper:s0.keeper ? Object.assign({}, s0.keeper, {side:meAtt ? "theirs" : "mine"}) : null,
    ball:{x:0, y:R, z:0, vx:0, vy:0, vz:0, wx:0, wy:0, wz:0, free:false}, poss:null, notes:[...notes, ...(s0.notes || [])],
    tempo:Object.assign({}, TEMPO[2], {shotBias:1}), plan:P, config:c};
  layout(setup, spec, {dist:o.ballDist, ang:o.ballAng});
  return setup;
}
// a place of the setup by its plan reference
export function placeOf(setup, ref){
  if (!ref) return null;
  if (ref.team === "mine") return ref.i < 0 ? setup.me : setup.mates[ref.i] || null;
  return setup.opps[ref.i] || null;
}
/* layout(setup, spec, ball) puts everyone of a setup on his spot for a ball at {dist, ang}: the ball on its spot, the
   taker behind it on the line to goal, the second taker where his part has him (brain.js secondShape's spots), the
   wall where brain.js wallSpots has it, the keeper on his line, and everyone else on his configured spot kept clear of
   the ball (the defenders 9.15 m from it, by the laws), of the takers and of the wall. Returns the setup */
export function layout(setup, spec, ball){
  const P = setup.plan, gx = spec.hx;
  const b = ballSpot(spec, ball.dist, ball.ang);
  P.spot = {x:b.x, z:b.z};
  setup.ball.x = b.x; setup.ball.z = b.z; setup.ball.y = R;
  const vx = gx - b.x, vz = -b.z, vl = hyp(vx, vz) || 1, ux = vx/vl, uz = vz/vl;
  let px = -uz, pz = ux; if (pz*(b.z > 0 ? -1 : 1) < 0){ px = -px; pz = -pz; }
  const yawGoal = r3(faceTo(ux, uz));
  const put = (p, x, z, yaw) => { if (!p) return; p.x = r3(clamp(x, -spec.hx + 0.4, spec.hx - 0.4)); p.z = r3(clamp(z, -spec.hz + 0.4, spec.hz - 0.4)); p.yaw = yaw != null ? yaw : r3(faceTo(b.x - p.x, b.z - p.z)); };
  const tk = placeOf(setup, P.taker), sec = placeOf(setup, P.second);
  const busy = [];
  if (P.action === "pass"){
    put(sec, b.x - ux*0.9, b.z - uz*0.9, yawGoal);
    put(tk, b.x - ux*1.2 + px*2.6, b.z - uz*1.2 + pz*2.6, yawGoal);
  } else {
    put(tk, b.x - ux*FK.TAKER_BACK, b.z - uz*FK.TAKER_BACK, yawGoal);
    if (P.action === "decoy") put(sec, b.x - ux*2.2 - px*1.6, b.z - uz*2.2 - pz*1.6, yawGoal);
    else if (sec) put(sec, b.x + px*5 - ux*0.5, b.z + pz*5 - uz*0.5, yawGoal);
  }
  if (tk) busy.push(tk); if (sec) busy.push(sec);
  // the wall (brain.js's own spots, so the restart finds it where it stands)
  const W = wallSpots(b, gx, P.wall, {hx:spec.hx, hz:spec.hz}), wyaw = r3(faceTo(W.face.x, W.face.z));
  P.wallRefs.forEach((ref, i) => { const p = placeOf(setup, ref), q = W.spots[i]; if (p && q){ p.x = r3(q.x); p.z = r3(q.z); p.yaw = wyaw; } });
  const wallPts = P.wallRefs.map(ref => placeOf(setup, ref)).filter(Boolean);
  // everyone else: his configured spot, clear of the ball, the takers and the wall
  const defTeam = "theirs", meAtt = P.role !== "defender";
  const keep = 0.85;
  for (const e of P.base){
    const p = placeOf(setup, e.ref); if (!p) continue;
    let x = e.x, z = e.z;
    const isDef = meAtt ? e.ref.team === defTeam : e.ref.team === "mine";
    // the laws' 9.15 m for the defenders; the attackers out of the routine's way (FK.CLEAR m from the ball and the
    // takers: a short ball between the two takers is theirs)
    const minB = isDef ? RULES.WALL_D + 0.3 : FK.CLEAR;
    let dx = x - b.x, dz = z - b.z, d = hyp(dx, dz);
    if (d < minB){ if (d < 1e-6){ dx = ux; dz = uz; d = 1; } x = b.x + dx/d*minB; z = b.z + dz/d*minB; }
    for (let pass = 0; pass < 3; pass++){
      for (const q of wallPts){
        const ex = x - q.x, ez = z - q.z, e2 = hyp(ex, ez);
        if (e2 >= keep) continue;
        // goal side of the man in the way (an attacker on the line, a defender behind the wall)
        x = q.x + ux*keep; z = q.z + uz*keep;
      }
      for (const q of busy){
        const ex = x - q.x, ez = z - q.z, e2 = hyp(ex, ez), k = isDef ? keep : FK.CLEAR;
        if (e2 >= k) continue;
        // on toward goal, past the routine
        x = q.x + ux*k; z = q.z + uz*k;
      }
    }
    put(p, x, z);
  }
  if (setup.keeper){ setup.keeper.x = r3(gx - 0.6); setup.keeper.z = r3(clamp(b.z*0.12, -1.5, 1.5)); setup.keeper.yaw = r3(faceTo(b.x - setup.keeper.x, b.z - setup.keeper.z)); }
  P.measure = {ballGoal:r2(goalDistance(spec, b)), wallBall:W.spots.length ? r2(wallDistance(b, W.spots)) : null};
  return setup;
}

/* ---------- the agents of a setup ----------
   matchOf (scen-team.js) makes team t's player agents in the setup's order: my side me, then the team-mates; theirs the
   opponents; the keeper last on his side */
export function agentOf(ms, setup, ref){
  if (!ref) return null;
  if (ref.team === "mine" && ref.i < 0) return ms.agents[ms.me] || null;
  const team = ref.team === "mine" ? setup.myTeam : 1 - setup.myTeam;
  const list = ms.agents.filter(a => a.team === team && a.role === "player" && !a.isGK && !(ref.team === "mine" && a.isMe));
  return list[ref.i] || null;
}

/* ---------- a go ----------
   goState(ms) -> a fresh record for one go (a restart makes a new simulation, so a new record) */
export function goState(ms){
  return {t0:ms.t, started:false, taken:false, takenT:null, evAt:0, strikeT:null, striker:-1, tags:[], first:null, goal:null, goalT:null,
    saved:false, held:false, out:null, outTeam:-1, verdict:null, myCtlT:0, oppCtlT:0, wallHit:false, spots:null, wallIds:[], tkId:-1, secId:-1, R0:null};
}
// setStep(J, ms, setup) after every fixed step: the restart at the first; until it is taken, everyone not in the wall
// nor taking it holds his spot; then the record of what happens
export function setStep(J, ms, setup){
  const P = setup.plan; if (!P) return;
  if (!J.started){ startGo(J, ms, setup); return; }
  const R0 = J.R0;
  if (!J.taken){
    if (ms.restart !== R0 || R0.taken){ J.taken = true; J.takenT = ms.t; }
    else holdShape(J, ms);
  }
  if (J.taken) watch(J, ms, setup);
}
function startGo(J, ms, setup){
  const P = setup.plan;
  J.started = true;
  const tk = agentOf(ms, setup, P.taker), sec = agentOf(ms, setup, P.second);
  const ids = P.wallRefs.map(r => agentOf(ms, setup, r)).filter(Boolean).map(a => a.id);
  const wallSpec = Object.assign({}, P.wall, {ids, n:ids.length});
  J.R0 = startRestart(ms, "free", P.attTeam, {x:P.spot.x, z:P.spot.z}, {taker:tk ? tk.id : null, second:sec ? sec.id : null,
    secondAction:sec ? P.action : null, wallSpec, plan:{strike:P.strike || null}});
  J.tkId = tk ? tk.id : -1; J.secId = sec ? sec.id : -1; J.wallIds = ids;
  J.evAt = ms.events.length;
  // the brain's shape at once (the wall, the takers), then everyone else on the spot the setup gave him
  restartShape(ms); J.R0.shapeStep = ms.step;
  J.spots = ms.agents.filter(a => a.role === "player" && a.onPitch && !a.isGK && !ids.includes(a.id) && a.id !== J.tkId && a.id !== J.secId)
    .map(a => ({id:a.id, x:a.m.x, z:a.m.z}));
  holdShape(J, ms);
}
// the free men hold their spots facing the ball (brain.js's restart shape is held off while the scenario sets them:
// R0.shapeStep); the wall and the takers are the brain's
function holdShape(J, ms){
  const R0 = J.R0, b = ms.ball;
  R0.shapeStep = ms.step;
  for (const sp of J.spots){
    const a = ms.agents[sp.id];
    if (!a || a.isMe && !ms.meAI || a.act) continue;
    a.set = {x:sp.x, z:sp.z, role:"set", gait:"jog", stop:0.25, face:{x:b.p.x - sp.x, z:b.p.z - sp.z}};
  }
}
const tag = (J, k) => { if (!J.tags.includes(k)) J.tags.push(k); };
// after it is taken: the strike, the wall, the keeper, the goal, and who has it
function watch(J, ms, setup){
  const P = setup.plan, E = ms.events, b = ms.ball;
  for (let i = J.evAt; i < E.length; i++){
    const e = E[i];
    if (e.kind === "goal" && !e.disallowed && J.goal == null){ J.goal = e.team; J.goalT = e.t; }
    else if (e.kind === "save"){ J.saved = true; if (e.outcome === "catch") J.held = true; tag(J, "save"); }
    else if (e.kind === "kick" || e.kind === "touch"){
      if (e.agent < 0) continue;
      if (e.kind === "kick" && e.intent === "shot" && J.strikeT == null){ J.strikeT = e.t; J.striker = e.agent; tag(J, "shot"); }
      if (J.strikeT != null && e.t > J.strikeT && J.wallIds.includes(e.agent) && !J.first){ J.wallHit = true; tag(J, "wall"); }
      if (J.strikeT != null && e.t > J.strikeT && !J.first) J.first = {agent:e.agent, kind:e.kind, t:e.t};
    }
  }
  J.evAt = E.length;
  if (ms.restart && ms.restart !== J.R0 && J.goal == null && !J.out){ J.out = ms.restart.kind; J.outTeam = ms.restart.team; }
  const h = 1/60, ctl = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : b.state === "held" && b.holder >= 0 ? ms.agents[b.holder] : null;
  const team = ctl ? ctl.team : -1;
  // (the side that takes it may keep it a while in a two-man routine: only the other side's control counts against it)
  J.myCtlT = team === setup.myTeam ? J.myCtlT + h : 0;
  J.oppCtlT = team === 1 - setup.myTeam ? J.oppCtlT + h : 0;
  if (b.state === "held" && ctl && ctl.isGK) J.held = true;
}
/* judge(J, ms, setup) -> null while the go is on, else {done: true, ok, why, text, goal, goalT, tags, t, replay} */
export function judge(J, ms, setup){
  if (J.verdict) return J.verdict;
  const P = setup.plan; if (!P || !J.started) return null;
  const myAtt = setup.myTeam === P.attTeam, el = ms.t - J.t0;
  const end = (ok, why, text) => (J.verdict = {done:true, ok, why, text, goal:J.goal != null, goalT:J.goal != null ? J.goalT : ms.t, tags:J.tags.slice(), t:r2(el),
    replay:!!P.replay && J.goal != null});
  if (!J.taken) return el > SET_MAX ? end(false, "slow", "It never got taken.") : null;
  const after = ms.t - J.takenT, T = P.time || AFTER;
  if (J.goal != null){
    const ours = J.goal === P.attTeam;
    if (myAtt) return end(ours, ours ? "goal" : "conceded", ours ? (J.strikeT != null && J.first == null ? "Goal! Straight in from the free kick." : "Goal!") : "They scored on the break.");
    return end(!ours, ours ? "conceded" : "goal", ours ? "They scored from it." : "You scored on the break!");
  }
  if (J.out && (J.out === "free" || J.out === "indirect" || J.out === "penalty")){
    const ours = J.outTeam === setup.myTeam;
    return end(ours, "foul", ours ? "Fouled. Free kick to you." : "Foul. Free kick to them.");
  }
  if (J.held) return end(!myAtt, "keeper", myAtt ? "The keeper holds it." : "Your keeper holds it.");
  if (J.out) return end(!myAtt, "out", myAtt ? (J.saved ? "Saved, and out it goes." : J.wallHit ? "Off the wall and out." : J.strikeT != null ? "Off target." : "Out of play.")
    : J.saved ? "Saved, and out it goes." : J.wallHit ? "Blocked by the wall and out." : "Off target. Well defended.");
  if (J.oppCtlT >= 0.8) return end(!myAtt, "lost", myAtt ? (J.wallHit ? "Blocked by the wall, and they have it." : "They cleared it.") : "Cleared. Well defended.");
  if (after >= T) return end(!myAtt, "time", myAtt ? (J.wallHit ? "Blocked by the wall." : J.saved ? "Saved." : "No goal from it.") : "No goal. Well defended.");
  return null;
}

/* what the Training HUD says: the free kick, what to do, the placement's measurements, and the keys */
export function uiOf(setup){
  const P = setup && setup.plan; if (!P) return {lines:[], keys:null};
  const M = P.measure || {};
  const L = [];
  let keys = null;
  const where = `${(M.ballGoal || 0).toFixed(1)} m out${M.wallBall != null ? `, the wall ${M.wallBall.toFixed(1)} m from the ball` : ", no wall"}.`;
  if (P.role === "taker"){
    L.push(P.action === "pass" ? "Free kick. He touches it to you: hit it as it comes." : P.action === "decoy" ? "Free kick. Let him run over it, then hit it." : P.action ? "Free kick. Play it to him." : "Free kick. Over the wall or round it.");
    keys = [{key:"LMB", text:"hold and let go to shoot"}, {key:"RMB", text:"pass"}];
  } else if (P.role === "receiver"){
    L.push(P.action === "pass" ? "You're at the ball with him. Touch it to him for the shot." : P.action === "decoy" ? "Run over the ball and on past it. Don't touch it." : P.action === "carry" ? "He plays it to you. Take it and run with it." : "He plays it short to you. Hit it first time.");
    keys = P.action === "pass" ? [{key:"RMB", text:"pass"}] : P.action === "decoy" ? null : [{key:"LMB", text:"shoot"}];
  } else if (P.role === "attacker") L.push("A team-mate takes it. Get on the end of anything that comes off the wall or the keeper.");
  else if (P.role === "support") L.push("A team-mate takes it. Wait on the edge of the box for anything that drops.");
  else L.push(P.meWall ? "Their free kick. You're in the wall: stand your ground." : "Their free kick. Pick up a man and clear it.");
  L.push(where);
  return {lines:L, keys};
}

/* ---------- a free kick as one of the runner's scenarios ----------
   scenarioOf(d) -> what runner.js registerScenario takes, for a drill d = {id, name, desc, cfg} (fkplace.js registers
   it, with the placement in front of it). Its go's record lives with its simulation */
const GO = new WeakMap();
export function goOf(ms){
  let J = GO.get(ms);
  if (!J){ J = goState(ms); GO.set(ms, J); }
  return J;
}
export function scenarioOf(d){
  return {id:d.id, category:"setpieces", type:"freekick", name:d.name, desc:d.desc, config:validate("freekick", d.cfg),
    build:(config, env) => build(config, env),
    step:(T, run) => { if (run && run.setup) setStep(goOf(T.ms), T.ms, run.setup); },
    judge:(T, run) => run && run.setup ? judge(goOf(T.ms), T.ms, run.setup) : null,
    ui:(T, run) => uiOf(run && run.setup)};
}

/* ---------- the drills ---------- */
export const FREEKICKS = Object.freeze([
  {id:"fk-direct", name:"Free kicks: over the wall",
    desc:"Your free kick, 22 metres out, with a wall of four and the keeper. Bend it over or round them.",
    cfg:{role:"taker", attackers:1, defenders:0, wall:4, mates:false, opps:true, keeper:true, opts:{ballDist:22, ballAng:-8, wallDist:9.15, wallAlign:"post"}}},
  {id:"fk-range", name:"Free kicks: from distance",
    desc:"Thirty metres out, a wall of five. Hit it hard and keep it down.",
    cfg:{role:"taker", attackers:1, defenders:0, wall:5, mates:false, opps:true, keeper:true, opts:{ballDist:30, ballAng:4}}},
  {id:"fk-wide", name:"Free kicks: the wide angle",
    desc:"Out on the right, a wall of three. Go for the far corner or cross it.",
    cfg:{role:"taker", attackers:3, defenders:2, wall:3, mates:true, opps:true, keeper:true, opts:{ballDist:24, ballAng:38}}},
  {id:"fk-touch", name:"Free kicks: touched to you",
    desc:"A team-mate rolls it across to you. Hit it as it comes.",
    cfg:{role:"taker", attackers:2, defenders:0, wall:4, mates:true, opps:true, keeper:true, opts:{second:"pass", ballDist:24, ballAng:0}}},
  {id:"fk-decoy", name:"Free kicks: the decoy",
    desc:"He runs over the ball first. Hit it once he's past it, while the keeper's still guessing.",
    cfg:{role:"taker", attackers:2, defenders:0, wall:4, mates:true, opps:true, keeper:true, opts:{second:"decoy", ballDist:23, ballAng:-6}}},
  {id:"fk-short", name:"Free kicks: the short one",
    desc:"You're the second taker. He plays it short to you: hit it first time.",
    cfg:{role:"receiver", attackers:2, defenders:1, wall:4, mates:true, opps:true, keeper:true, opts:{second:"short", ballDist:25, ballAng:10}}},
  {id:"fk-carry", name:"Free kicks: take it on",
    desc:"He plays it to you. Take it past the wall and go at goal.",
    cfg:{role:"receiver", attackers:2, defenders:1, wall:3, mates:true, opps:true, keeper:true, opts:{second:"carry", ballDist:28, ballAng:-14}}},
  {id:"fk-box", name:"Free kicks: attack the cross",
    desc:"A team-mate crosses it in from wide. Find a yard and get on the end of it.",
    cfg:{role:"attacker", attackers:4, defenders:2, wall:2, mates:true, opps:true, keeper:true, opts:{strike:"cross", ballDist:30, ballAng:-42}}},
  {id:"fk-wall", name:"Free kicks: stand in the wall",
    desc:"Their free kick. You're in the wall with three others. Don't flinch.",
    cfg:{role:"defender", attackers:1, defenders:1, wall:4, mates:true, opps:true, keeper:true, opts:{meWall:true, strike:"shot", ballDist:21, ballAng:6}}},
  {id:"fk-defend", name:"Free kicks: defend it",
    desc:"Their free kick from wide. Pick up a man and clear the cross.",
    cfg:{role:"defender", attackers:4, defenders:3, wall:2, mates:true, opps:true, keeper:true, opts:{strike:"cross", ballDist:28, ballAng:40}}}
].map(d => Object.freeze(d)));

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainFK = {FK, FREEKICKS, build, layout, ballSpot, validBall, goalDistance, wallOf, wallDistance, wallSpecOf, placeState, previewBall,
  confirmBall, previewWall, confirmWall, adjust, canStart, measures, applyPlace, goState, goOf, setStep, judge, uiOf, agentOf, placeOf, fitConfig};
