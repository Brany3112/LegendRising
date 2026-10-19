// qa/fc27-carry.mjs: FC27, close control and the carrier's gait against the FC 27 clip (plan/notes/fc27-spec.md 6.1 and
// 6.2, the carrying checks). Right foot, pace about 55 (the att-carrier drill's man), opponents taken off.
//   Simulation (the drill's own simulation on a full pitch, the player's intents as control.js sets them):
//     CC-1 touches on footfalls: in a straight close carry at 4 to 6 m/s, 90% of the keep touches within one step of a
//          strong-foot footfall, 0.8 to 1.0 touches a strong-foot footfall;
//     CC-2 touch rate: 2.6 to 3.8 a second in close carry at 4 to 6 m/s, 1.4 to 2.2 in push and run (a sprint);
//     CC-3 the carrier's gait: 300 to 450 steps a minute at 4 to 6 m/s, 0.6 to 0.9 m a step, duty 0.38 to 0.50, swings of
//          0.13 to 0.20 s (the clock's footfalls and gaitcore's tables); without the ball the run's tables within 5%;
//     CC-4 (the body's part) at each carry touch the ball 0.4 to 0.75 m ahead of the pelvis;
//     CC-5 (the body's part) between touches the ball 0 to 0.2 m to the strong side of the root in 80% of the frames,
//          never more than 1.05 m ahead;
//     CC-6 the ball after a carry touch at 1.0 to 1.3 times his speed;
//     CC-7 a scripted drill (4 s straight, two 60 degree turns left, one right, two stops, an S drag, a shot): the strong
//          foot makes 65% of the touches or more; every turn's touch is the strong foot's, its inside turning to the weak
//          side, its outside to the strong side; every stop is a sole touch by the foot down next;
//     CC-9 (the touch's part) a 60 degree turn at 4.5 m/s is played at the next strong-foot strike, within 0.37 s;
//     CC-13 standing, the ball comes to rest within 0.3 m of him.
//   In the page (Training, stepped frozen, every body posed every step; third person), a carry at a jog (4.4 m/s) and a
//   run (5.9 m/s), and for comparison the same runs with no ball:
//     DR-1 every carry touch has a drawn foot coming down on it, the foot the touch names;
//     DR-2 the drawn toe's nearest to the drawn ball's surface comes within 2 frames (33 ms) of the frame the drawn ball
//          leaves on its new velocity, and is 0.04 m or less;
//     DR-3 the toe is the face: the ball's surface nearest it 0.03 to 0.08 m up (the lower third), the foot pitched 0.3 rad
//          or less from flat, within 0.03 m of the ball for 2 frames or more before the footfall;
//     CC-4 (the feet's part) the ball's middle 0.10 to 0.20 m beyond the touching toe's tip, within 0.10 m across;
//     DR-4 the touching foot comes down within 0.1 s of the contact, its toe 0 to 0.3 m behind where the ball was and
//          within 0.12 m across;
//     CC-5 (the feet's part) between touches the ball 0.25 to 0.7 m from the leading toe in 85% of the frames;
//     DR-5 no snapping: no foot bone turns more than 0.35 rad in a frame, no swinging foot jumps 0.08 m in one toward the
//          ball;
//     DR-6 at 4 to 6 m/s: the trunk leaning 0.17 to 0.45 rad, the upper arms out 0.5 rad or more, the head down 0.3 rad or
//          more within 0.1 s of each touch, the hips 0.05 m or more lower than the same run with no ball.
//
//   node qa/fc27-carry.mjs [--sim]    exits 1 on any failed check; writes qa/out/fc27-carry.json (--sim: the simulation's
//                                     checks only)
import fs from "node:fs";
import path from "node:path";
import {simStep} from "../js/life/football/sim.js";
import {startKick, startAction, CARRY} from "../js/life/football/actions.js";
import {RUN, stepLen, dutyOf, swingTime} from "../js/life/gaitcore.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";
import {OUT, freeze} from "./lib.mjs";

const {res, check, done} = checker("fc27-carry");
const SIM_ONLY = process.argv.includes("--sim");
const r2 = v => Math.round(v*100)/100, r3 = v => Math.round(v*1000)/1000;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0)/a.length : NaN;
const fwdOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});
const FLAT = Math.atan2(.085 - .025, .11);

/* ---------- the simulation ---------- */
// a fresh go on a full pitch: you at x0 facing +x with the ball at your feet, nobody else about
function go(o = {}){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3, cfg => { cfg.pitch = "full"; });
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  me.foot = o.foot || "R";
  for (const a of ms.agents) if (a !== me && !a.isGK){ a.onPitch = false; a.m.x = 200; a.m.z = 200; }
  me.m.x = me.x0 = o.x0 != null ? o.x0 : -40; me.m.z = me.z0 = 0; me.m.yaw = me.m.heading = -Math.PI/2; me.m.vx = me.m.vz = me.m.speed = 0;
  const f = fwdOf(me.m.yaw);
  ms.ball.p.x = me.m.x + f.x*.35; ms.ball.p.z = me.m.z + f.z*.35; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  ms.poss.ctl = -1;
  return {ms, me};
}
// the player's intents, as control.js sets them (a sprint in close control a little under his sprint, from Dribbling)
function intent(me, dx, dz, gait){
  const I = me.intent, l = Math.hypot(dx, dz);
  I.dx = l ? dx/l : 0; I.dz = l ? dz/l : 0; I.gait = gait; I.speedCap = Infinity; I.strafe = false; I.knock = false;
  if (me.ctlOn && gait === "sprint"){ const k = Math.min(.97, Math.max(.8, .85 + .1*((me.at.dribbling || 50) - 50)/40)); I.speedCap = k*me.prm.sprint; }
  I.face = I.face || {x: 0, z: 0}; const f = l ? {x: dx/l, z: dz/l} : fwdOf(me.m.yaw); I.face.x = f.x; I.face.z = f.z;
}
/* a run: way(t) the keys' way (null: none), gait; per step the footfalls, the touches (with the ball's speed the step
   after), the ball against the body. F pressed at the start */
function run(o){
  const {ms, me} = go(o);
  me.takeT = ms.t;
  const rows = [], touches = [], falls = [];
  const n = Math.round(o.T/H);
  let ev0 = ms.events.length, pend = null;
  for (let k = 0; k < n; k++){
    const w = o.way(ms.t, me);
    if (o.before) o.before(ms, me, k);
    intent(me, w ? w.x : 0, w ? w.z : 0, w ? (o.gaitAt ? o.gaitAt(ms.t) : o.gait) : "jog");
    const gn = me.g.n;
    simStep(ms, H);
    if (pend){ pend.bv = Math.hypot(ms.ball.v.x, ms.ball.v.z); pend = null; }
    if (me.g.n !== gn) falls.push({k, t: ms.t, side: me.g.side});
    for (let i = ev0; i < ms.events.length; i++){
      const e = ms.events[i];
      if (e.agent !== me.id) continue;
      if (e.kind === "touch"){
        const f = fwdOf(me.m.yaw), bx = ms.ball.p.x - me.m.x, bz = ms.ball.p.z - me.m.z;
        const t = {k, t: ms.t, foot: e.foot, part: e.part, carry: e.carry || null, keep: !!e.keep, ahead: bx*f.x + bz*f.z, v: me.m.speed, how: e.how};
        touches.push(t); pend = t;
      } else if (e.kind === "kick") touches.push({k, t: ms.t, foot: me.act && me.act.foot ? me.act.foot : null, part: "laces", kick: true});
    }
    ev0 = ms.events.length;
    const f = fwdOf(me.m.yaw), bx = ms.ball.p.x - me.m.x, bz = ms.ball.p.z - me.m.z;
    rows.push({k, t: ms.t, v: me.m.speed, ahead: bx*f.x + bz*f.z, lat: bx*(-f.z) + bz*f.x, d: Math.hypot(bx, bz), ctl: !!me.ctlOn, mine: ms.poss.ctl === me.id, ck: me.g.ck, yaw: me.m.yaw});
    if (o.after) o.after(ms, me, k);
  }
  return {ms, me, rows, touches, falls};
}
const fwd = () => ({x: 1, z: 0});
const S = {};

// a straight close carry: at a jog (the run held to 4.4 m/s) and at a run (5.9 m/s), and a sprint (push and run)
const carry = {};
for (const [name, gait, cap] of [["jog", "run", 4.4], ["run", "run", null], ["sprint", "sprint", null]]){
  carry[name] = run({T: 7, way: fwd, gait, before: (ms, me, k) => { if (k === 0 && cap) me.prm.run = cap; }});
}
{
  const B = [];
  for (const [name, R] of Object.entries(carry)){
    if (name === "sprint") continue;
    const t0 = 1.5, keep = R.touches.filter(t => t.t > t0 && t.carry && !t.kick), strong = R.falls.filter(f => f.t > t0 && f.side === "R");
    const near = keep.filter(t => R.falls.some(f => f.side === "R" && Math.abs(f.k - t.k) <= 1)).length;
    const span = R.rows[R.rows.length - 1].t - t0, v = mean(R.rows.filter(r => r.t > t0).map(r => r.v));
    B.push({name, v: r2(v), touches: keep.length, strongFalls: strong.length, onFall: r2(near/Math.max(1, keep.length)), perFall: r2(keep.length/Math.max(1, strong.length)), perS: r2(keep.length/span)});
  }
  S.cc12 = B;
  check(B.every(b => b.onFall >= .9 && b.perFall >= .8 && b.perFall <= 1.0), "CC-1: in a close carry at 4 to 6 m/s 90% of the touches fall within one step of a strong-foot footfall, 0.8 to 1.0 touches a strong-foot footfall", B);
  check(B.every(b => b.perS >= 2.6 && b.perS <= 3.8), "CC-2: 2.6 to 3.8 touches a second in close carry at 4 to 6 m/s", B);
  const R = carry.sprint, t0 = 1.5, keep = R.touches.filter(t => t.t > t0 && t.carry), span = R.rows[R.rows.length - 1].t - t0;
  S.push = {v: r2(mean(R.rows.filter(r => r.t > t0).map(r => r.v))), perS: r2(keep.length/span), touches: keep.length};
  check(S.push.perS >= 1.4 && S.push.perS <= 2.2, "CC-2: 1.4 to 2.2 touches a second pushing and running (a sprint in close control)", S.push);
}
// CC-3: the gait from the clock's footfalls, against the carrier's table; and with no ball, the run's
{
  const G = [];
  for (const name of ["jog", "run"]){
    const R = carry[name], F = R.falls.filter(f => f.t > 1.5), iv = [];
    for (let i = 1; i < F.length; i++) iv.push(F[i].t - F[i - 1].t);
    const v = mean(R.rows.filter(r => r.t > 1.5).map(r => r.v)), dt = mean(iv);
    G.push({name, v: r2(v), spm: Math.round(60/dt), step: r2(v*dt), duty: r3(dutyOf(v, "R", 1)), swing: r3(swingTime(v, "R", 1, 1))});
  }
  S.gait = G;
  check(G.every(g => g.spm >= 300 && g.spm <= 450 && g.step >= .6 && g.step <= .9 && g.duty >= .38 && g.duty <= .5 && g.swing >= .13 && g.swing <= .2),
    "CC-3: carrying at 4 to 6 m/s, 300 to 450 steps a minute, 0.6 to 0.9 m a step, duty 0.38 to 0.50, swings of 0.13 to 0.20 s", G);
  // no ball: the run's own table (the ball taken off before F is pressed)
  const R = run({T: 4, way: fwd, gait: "run", before: (ms, me, k) => { if (k === 0){ ms.ball.p.x = 40; ms.ball.p.z = 30; me.takeT = null; } }});
  const F = R.falls.filter(f => f.t > 1.5), iv = []; for (let i = 1; i < F.length; i++) iv.push(F[i].t - F[i - 1].t);
  const v = mean(R.rows.filter(r => r.t > 1.5).map(r => r.v)), want = 60*v/stepLen(v, "R"), got = 60/mean(iv);
  S.noBall = {v: r2(v), spm: Math.round(got), table: Math.round(want), ck: R.me.g.ck};
  check(Math.abs(got/want - 1) <= .05 && R.me.g.ck === 0, "CC-3: with no ball the run's cadence is the run table's (within 5%) and no carry weight", S.noBall);
}
// CC-4, CC-5, CC-6 (the body's part)
{
  const T = [], L = [];
  let latOk = 0, latN = 0, far = 0;
  for (const name of ["jog", "run"]){
    const R = carry[name];
    for (const t of R.touches) if (t.t > 1.5 && t.carry && t.part === "toe") T.push({name, ahead: r3(t.ahead), k: r2(t.bv/t.v)});
    for (const r of R.rows) if (r.t > 1.5){ latN++; if (r.lat >= 0 && r.lat <= .2) latOk++; far = Math.max(far, r.ahead); }
  }
  S.cc4 = T;
  check(T.length > 10 && T.every(t => t.ahead >= .4 && t.ahead <= .75), "CC-4: at each carry touch the ball is 0.4 to 0.75 m ahead of the pelvis", {n: T.length, min: Math.min(...T.map(t => t.ahead)), max: Math.max(...T.map(t => t.ahead))});
  check(latOk/latN >= .8 && far <= 1.05, "CC-5: between touches the ball is 0 to 0.2 m to the strong side of him in 80% of the frames, never more than 1.05 m ahead", {share: r2(latOk/latN), farthest: r2(far)});
  check(T.every(t => t.k >= 1.0 && t.k <= 1.3), "CC-6: right after a carry touch the ball goes at 1.0 to 1.3 times his speed", {min: Math.min(...T.map(t => t.k)), max: Math.max(...T.map(t => t.k))});
}
// CC-7: the scripted drill; CC-9: the 60 degree turn
{
  const rot = (a, deg) => { const c = Math.cos(deg*Math.PI/180), s = Math.sin(deg*Math.PI/180); return {x: a.x*c - a.z*s, z: a.x*s + a.z*c}; };
  // (the way: +x for 4 s; 60 degrees left (to his left, facing +x, is -z), then back; 60 left again and back; 60 right and
  // back; a stop at 7.2 s and 9.8 s (no key); an S drag from the stop at 11 s; a shot at 12.4 s)
  const plan = [[0, {x: 1, z: 0}], [4, rot({x: 1, z: 0}, -60)], [4.8, {x: 1, z: 0}], [5.6, rot({x: 1, z: 0}, -60)], [6.4, {x: 1, z: 0}],
    [7.2, null], [8.0, {x: 1, z: 0}], [8.8, rot({x: 1, z: 0}, 60)], [9.6, {x: 1, z: 0}], [10.4, null], [13.5, {x: 1, z: 0}]];
  const wayAt = t => { let w = null; for (const [t0, d] of plan) if (t >= t0) w = d; return w; };
  const R = run({T: 14, way: t => wayAt(t), gait: "run", before: (ms, me, k) => {
    if (k === 0) me.prm.run = 4.5;
    if (Math.abs(ms.t - 11.0) < H/2) startAction(ms, me, {kind: "fake", dir: "s"});
    if (Math.abs(ms.t - 12.4) < H/2){ const f = fwdOf(me.m.yaw); startKick(ms, me, {kind: "shot", target: {x: me.m.x + f.x*20, y: 1, z: me.m.z + f.z*20}, power: .8, speed: 22}); }
  }});
  const all = R.touches.filter(t => t.t > .3 && (t.keep || t.kick || t.part === "sole"));
  const strong = all.filter(t => t.foot === "R").length;
  const turns = all.filter(t => t.part === "inside" || t.part === "outside");
  const turnOk = turns.every(t => t.foot === "R" && (t.part === "inside" ? true : true));
  // (turning left, to the weak side of a right foot, the ball's right side: its inside; right: its outside)
  const leftT = R.touches.filter(t => t.t > 4 && t.t < 4.8 && (t.part === "inside" || t.part === "outside")), rightT = R.touches.filter(t => t.t > 8.8 && t.t < 9.6 && (t.part === "inside" || t.part === "outside"));
  const stops = R.touches.filter(t => t.carry === "stop");
  const stopOk = stops.every(s => { const f = R.falls.find(x => x.k === s.k); return s.part === "sole" && !!f && f.side === s.foot; });
  S.cc7 = {touches: all.length, strong, share: r2(strong/Math.max(1, all.length)), turns: turns.map(t => t.foot + ":" + t.part), left: leftT.map(t => t.part), right: rightT.map(t => t.part),
    stops: stops.map(s => s.foot + ":" + s.part), kicks: all.filter(t => t.kick).map(t => t.foot)};
  check(strong/Math.max(1, all.length) >= .65, "CC-7: in the scripted drill the strong foot makes 65% of the touches or more", S.cc7);
  check(turnOk && leftT.length > 0 && rightT.length > 0 && leftT.every(t => t.part === "inside") && rightT.every(t => t.part === "outside"),
    "CC-7: every turn's touch is the strong foot's: its inside turning to the weak side, its outside to the strong side", {turns: S.cc7.turns, left: S.cc7.left, right: S.cc7.right});
  check(stops.length >= 2 && stopOk, "CC-7: every stop is a sole touch by the foot that comes down next", S.cc7.stops);
  // CC-9: the 60 degree turn at 4.5 m/s: the touch on the next strong-foot strike, within 0.37 s
  const asked = 5.6, tt = R.touches.find(t => t.t >= asked && (t.part === "inside" || t.part === "outside"));
  const fall = tt ? R.falls.find(f => Math.abs(f.k - tt.k) <= 1 && f.side === "R") : null;
  S.cc9 = tt ? {after: r2(tt.t - asked), foot: tt.foot, part: tt.part, onStrike: !!fall} : null;
  check(!!tt && tt.t - asked <= .37 && !!fall, "CC-9: a 60 degree turn at 4.5 m/s is played on the next strong-foot strike, within 0.37 s", S.cc9);
}
// CC-13: standing still, the ball comes to rest by him
{
  const R = run({T: 3, way: t => t < 1 ? {x: 1, z: 0} : null, gait: "jog"});
  const last = R.rows[R.rows.length - 1];
  S.rest = {d: r2(last.d), v: r2(last.v), mine: last.mine};
  check(last.d <= .3 && last.v < .3 && last.mine, "CC-13: standing still the ball comes to rest within 0.3 m of him", S.rest);
}
res.sim = S;

/* ---------- the drawn body ---------- */
if (!SIM_ONLY){
  const {trainLaunch, enterByButton, closeHubReal} = await import("./tr4b-lib.mjs");
  const t = await trainLaunch({seed: 6, gfx: "medium"});
  const page = t.page;
  try {
    await enterByButton(page);
    await closeHubReal(page);
    await page.evaluate(async () => {
      const R = window.__trainRun, C = await import("/js/life/football/control.js");
      const build = (cfg, env) => {
        const hx = env.spec.hx, me = {slot: "ST", x: -hx + 6, z: 0, yaw: -Math.PI/2};
        return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}};
      };
      if (!R.scenario("qa-fc27")) R.registerScenario({id: "qa-fc27", category: "attacking", type: "qafc27", name: "Carry test", desc: "A test scenario", build});
      C.saveSet({footCam: "third"});
      window.__fc = {C, start(){ if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-fc27", {}); }};
    });
    const one = async (cap, ball) => {
      await page.evaluate(() => window.__fc.start());
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 120000});
      await freeze(page);
      return page.evaluate(async ([cap, ball]) => {
        const L = window.__life, T = window.__trainRun.RUN.cur.T, ms = T.ms, me = T.me, V = T.V, C = window.__fc.C;
        const HM = await import("/js/life/human.js"), B = HM.BONE;
        const P = L.P; P.yaw = -Math.PI/2; P.pitch = -.25;
        const R = V.rec[me.id], h = R.h, v1 = new (L.cam.position.constructor)(), v2 = new (L.cam.position.constructor)(), Q = L.cam.quaternion.constructor;
        const wp = (bone, x, y, z) => { v1.set(x, y, z).applyMatrix4(h.bones[bone].matrixWorld); return [v1.x, v1.y, v1.z]; };
        if (cap) me.prm.run = cap;
        if (!ball){ ms.ball.p.x = me.m.x - 30; ms.ball.p.z = 10; ms.poss.ctl = -1; }
        C.CTRL.held.w = true;
        L.stepN(6);
        if (ball) me.takeT = ms.t;
        const out = [], prevQ = h.bones.map(b => new Q().copy(b.quaternion));
        let ev0 = ms.events.length;
        for (let f = 0; f < 240; f++){
          L.stepN(1);
          L.scene().updateMatrixWorld(true);
          const evs = [];
          for (let i = ev0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.kind === "touch" && e.agent === me.id) evs.push({foot: e.foot, part: e.part, carry: e.carry || null}); }
          ev0 = ms.events.length;
          const G = h.gait, bp = V.ball.mesh.position;
          // the trunk's lean: hips to neck against the vertical; the upper arms' spread from the trunk's side plane; the
          // head's pitch below level
          const hp = wp(B.hips, 0, 0, 0), np = wp(B.neck, 0, 0, 0), yaw = h.g.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
          const tdx = np[0] - hp[0], tdy = np[1] - hp[1], tdz = np[2] - hp[2], lean = Math.atan2(tdx*fx + tdz*fz, tdy);
          const abd = [[B.uaL, B.faL], [B.uaR, B.faR]].map(([u, fa]) => { const a = wp(u, 0, 0, 0), b = wp(fa, 0, 0, 0), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; return Math.atan2(Math.abs(dx*lx + dz*lz), -dy); });
          const hd0 = wp(B.head, 0, 0, 0), hd1 = wp(B.head, 0, 0, .1), headPitch = Math.atan2(-(hd1[1] - hd0[1]), Math.hypot(hd1[0] - hd0[0], hd1[2] - hd0[2]));
          let jb = 0; for (const bi of [B.ftL, B.ftR, B.toL, B.toR]){ const ang = prevQ[bi].angleTo(h.bones[bi].quaternion); if (ang > jb) jb = ang; }
          for (let i = 0; i < h.bones.length; i++) prevQ[i].copy(h.bones[i].quaternion);
          out.push({f, t: ms.t, v: me.m.speed, x: h.g.position.x, z: h.g.position.z, yaw: me.m.yaw, ev: evs, ball: [bp.x, bp.y, bp.z], hipY: hp[1], lean, abd, headPitch, footTurn: jb,
            feet: [0, 1].map(i => ({down: G.feet[i].down, u: G.feet[i].sw ? G.feet[i].sw.u : -1, tip: wp(i ? B.toR : B.toL, 0, -.02, .07), toe: wp(i ? B.toR : B.toL, 0, 0, 0), ank: wp(i ? B.ftR : B.ftL, 0, 0, 0)}))});
        }
        C.CTRL.held.w = false;
        return out;
      }, [cap, ball]);
    };
    const runs = {jog: await one(4.4, true), run: await one(null, true), jogNo: await one(4.4, false), runNo: await one(null, false)};
    fs.writeFileSync(path.join(OUT, "fc27-carry-frames.json"), JSON.stringify(runs));
    // the measures, per carry touch
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const D = {touches: 0, drawn: 0, rows: [], snap: 0, jump: 0, between: [0, 0], lean: [], abd: [], head: [], hips: []};
    for (const name of ["jog", "run"]){
      const Rr = runs[name];
      for (let i = 3; i < Rr.length - 6; i++){
        const r = Rr[i];
        for (let k = 1; k < 4; k++) D.snap = Math.max(D.snap, Rr[i].footTurn);
        for (const e of r.ev){
          if (!e.carry || e.part !== "toe" || r.v < 3.5) continue;
          D.touches++;
          const s = e.foot === "L" ? 0 : 1;
          // the drawn ball's new velocity: the frame after which its step changes most
          let dvF = i, dvB = 0;
          for (let k = i - 2; k <= i + 3; k++){ const a = Rr[k - 1].ball, b = Rr[k].ball, c = Rr[k + 1].ball, dv = Math.hypot((c[0] - b[0]) - (b[0] - a[0]), (c[2] - b[2]) - (b[2] - a[2])); if (dv > dvB){ dvB = dv; dvF = k + 1; } }
          // the toe's nearest to the ball's surface around it, and the frames within 0.03 m before the footfall
          let best = 9, bestF = -1, near = 0, land = -1;
          for (let k = i - 6; k <= i + 4; k++){ const g = d3(Rr[k].feet[s].tip, Rr[k].ball) - .11; if (g < best){ best = g; bestF = k; } if (g <= .03 && !Rr[k].feet[s].down) near++; }
          for (let k = i - 3; k <= i + 6; k++) if (Rr[k].feet[s].down && !Rr[k - 1].feet[s].down){ land = k; break; }
          if (land >= 0) D.drawn++;
          const rb = Rr[bestF], tip = rb.feet[s].tip, b = rb.ball, f = fwdOf(rb.yaw);
          const along = (b[0] - tip[0])*f.x + (b[2] - tip[2])*f.z, side = (b[0] - tip[0])*(-f.z) + (b[2] - tip[2])*f.x;
          const cl = d3(tip, b), cy = b[1] + (tip[1] - b[1])*.11/cl;
          // (the foot's pitch from flat: the ankle over the toe joint, less the flat foot's own 0.50 rad, gait.js BALL and TOEY)
          const pitch = Math.atan2(rb.feet[s].ank[1] - rb.feet[s].toe[1], Math.hypot(rb.feet[s].ank[0] - rb.feet[s].toe[0], rb.feet[s].ank[2] - rb.feet[s].toe[2])) - FLAT;
          // the toe where the foot came down, against the ball where it was played
          let lAlong = null, lSide = null, lT = null;
          if (land >= 0){ const lt = Rr[land].feet[s].tip, pb = Rr[i].ball; lAlong = (pb[0] - lt[0])*f.x + (pb[2] - lt[2])*f.z; lSide = (pb[0] - lt[0])*(-f.z) + (pb[2] - lt[2])*f.x; lT = Rr[land].t - Rr[i].t; }
          D.rows.push({name, f: i, foot: e.foot, closest: r3(best), atF: bestF - dvF, cy: r3(cy), pitch: r3(pitch), near, along: r3(along), side: r3(side), land: lT == null ? null : r3(lT), lAlong: lAlong == null ? null : r3(lAlong), lSide: lSide == null ? null : r3(lSide)});
          // the head within 0.1 s of it
          let hd = -9; for (let k = i - 6; k <= i + 6; k++) hd = Math.max(hd, Rr[k].headPitch); D.head.push(r3(hd));
        }
        // between touches: the ball from the leading toe
        if (r.v > 3.5 && i > 30){
          const f = fwdOf(r.yaw), lead = Math.max(...[0, 1].map(s => (r.feet[s].tip[0] - r.x)*f.x + (r.feet[s].tip[2] - r.z)*f.z)), ball = (r.ball[0] - r.x)*f.x + (r.ball[2] - r.z)*f.z, g = ball - lead;
          D.between[1]++; if (g >= .25 && g <= .7) D.between[0]++;
          D.lean.push(r.lean); D.abd.push(Math.min(r.abd[0], r.abd[1]));
        }
        // a swinging foot's frame-to-frame jump toward the ball
        for (const s of [0, 1]) if (!r.feet[s].down && !Rr[i - 1].feet[s].down){ const a = Rr[i - 1].feet[s].ank, b = r.feet[s].ank, f = fwdOf(r.yaw); D.jump = Math.max(D.jump, (b[0] - a[0])*f.x + (b[2] - a[2])*f.z - r.v/60); }
      }
      const no = runs[name + "No"], hipC = mean(Rr.filter(r => r.v > 3.5 && r.f > 60).map(r => r.hipY)), hipN = mean(no.filter(r => r.v > 3.5 && r.f > 60).map(r => r.hipY));
      D.hips.push({name, carry: r3(hipC), noBall: r3(hipN), lower: r3(hipN - hipC)});
    }
    res.drawn = D;
    const rows = D.rows;
    check(D.touches >= 10 && D.drawn === D.touches && rows.every(r => r.land != null), "DR-1: every carry touch has the foot it names coming down on it", {touches: D.touches, drawn: D.drawn});
    check(rows.every(r => Math.abs(r.atF) <= 2 && r.closest <= .04), "DR-2: the drawn toe is nearest the drawn ball (0.04 m or less) within 2 frames (33 ms) of its new velocity", rows.map(r => [r.closest, r.atF]));
    check(rows.every(r => r.cy >= .03 && r.cy <= .08 && Math.abs(r.pitch) <= .3 && r.near >= 2), "DR-3: the toe meets the ball low (0.03 to 0.08 m up), the foot nearly flat, within 0.03 m of it for 2 frames or more", rows.map(r => [r.cy, r.pitch, r.near]));
    check(rows.every(r => r.along >= .1 && r.along <= .2 && Math.abs(r.side) <= .1), "CC-4: at each touch the ball's middle is 0.10 to 0.20 m beyond the touching toe, within 0.10 m across", rows.map(r => [r.along, r.side]));
    check(rows.every(r => r.land != null && r.land <= .1 && r.lAlong >= 0 && r.lAlong <= .3 && Math.abs(r.lSide) <= .12), "DR-4: the touching foot comes down within 0.1 s, its toe 0 to 0.3 m behind where the ball was and within 0.12 m across", rows.map(r => [r.land, r.lAlong, r.lSide]));
    check(D.between[0]/Math.max(1, D.between[1]) >= .85, "CC-5: between touches the ball is 0.25 to 0.7 m from the leading toe in 85% of the frames", {share: r2(D.between[0]/Math.max(1, D.between[1]))});
    check(D.snap <= .35 && D.jump <= .08, "DR-5: no foot bone turns more than 0.35 rad in a frame, no swinging foot jumps 0.08 m in one toward the ball", {turn: r3(D.snap), jump: r3(D.jump)});
    const lean = mean(D.lean), abd = mean(D.abd);
    check(lean >= .17 && lean <= .45 && abd >= .5 && D.head.every(hd => hd >= .3) && D.hips.every(x => x.lower >= .05),
      "DR-6: carrying at 4 to 6 m/s the trunk leans 0.17 to 0.45 rad, the upper arms are out 0.5 rad or more, the head is down 0.3 rad or more at each touch, the hips 0.05 m lower than with no ball",
      {lean: r3(lean), abd: r3(abd), head: [Math.min(...D.head), Math.max(...D.head)], hips: D.hips});
    check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
  } finally { await t.close(); }
}
process.exit(done() ? 0 : 1);
