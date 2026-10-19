// qa/bcs-sole.mjs: BCS (the better control system), the sole moves against the FC 27 clip (plan/notes/fc27-spec.md 3.4 to
// 3.6, 5.6 and the sole rows of 6.1 and 6.2; plan/notes/bcs-sole.md): the sole stop, the drags (the fake's A, D and S)
// and the double sole roll (the Z key). Right foot unless named, pace about 55 (the att-carrier drill's man), nobody else.
//   The simulation (node, the drill's own simulation on a full pitch, the player's intents as control.js sets them; F
//   taken and the ball carried along +x):
//     SS-1 the sole stop: the keys let go in close control at 2.4, 3.2, 4.4 and 5.9 m/s, on six points of a stride
//          each: the next foot down (either side, both seen; one already landing within SOLE.NEXT_MIN of the keys is let
//          land) comes down with its sole on the ball, on its own footfall, within 0.2 s of the keys at 4 m/s or more (a
//          frame's rounding; 0.25 s slower, where a step is longer); the ball at 0.5 m/s or less within 2
//          frames of the contact; the sole on it 0.1 to 0.23 s (3 to 7 of the clip's frames); the body at 0.5 m/s or
//          less 0.27 to 0.33 s after the contact; the ball left at rest by him; close control kept;
//     SS-2 the A and D drags, from a stand and carrying at 2.4 and 4.4 m/s: the sole of the foot on that side, on the
//          ball 0.17 to 0.23 s, let go rolling 3.5 to 4.5 m/s back and out to that side (DRAG_DIR, within 0.2 rad at
//          Ball Control 90); he turns and runs after it and has it again (close control kept, the ball within reach as
//          the run after it ends);
//     SS-3 the S drag: from a stand the strong sole pulls it 0.25 to 0.4 m back under him in 0.17 to 0.23 s and lets it
//          go 3 to 4 m/s on that way (within 0.25 rad of straight back); from a run (3 m/s or more at the contact) about
//          0.7 m back against his body (0.55 to 0.85) at 3 to 3.5 m/s against him (2.75 to 4.25 here);
//     SS-4 the double sole roll, from a stand and at 2.4 m/s, a right foot and a left: the strong sole first, on the ball
//          0.1 to 0.16 s, rolling it 0.25 to 0.45 m across to the weak side at 1.5 to 3.5 m/s (the clip's 0.3 to 0.4 at
//          about 2); the weak sole next, within 0.12 s of it letting go, 0.1 to 0.16 s, rolling it back (let go going
//          back, against the way he faced, at 0.5 to 3 m/s); half a turn to the strong side (170 to 190 degrees) in 0.25 s
//          or less; the strong foot pushes it out the way he came (within 0.25 rad) at 4 to 5 m/s; close control kept.
//   The drawn body (Training, stepped frozen, every body posed every step at 60 Hz; third person; the moves by the real
//   controls: W let go, LMB held then S then A, D or S, Z):
//     DS-1 every sole contact: the touching foot's sole on the top of the drawn ball (within 0.03 m) for 0.1 to 0.25 s
//          in a row, over the contact;
//     DS-2 every drag and roll contact: the other foot down and still (0.01 m or less) through it, the pivot;
//     DS-3 a wide base: the ankles 0.45 m or more apart at the middle of every drag and roll contact;
//     DS-4 the legs never cross (the user's "broken footing ... the legs cross and go through each other"): from the
//          request to 0.2 s after the move each ankle at least 0.05 m to its own side of the other across the hip joints,
//          the shins never within 0.06 m;
//     DS-5 the stop: the drawn ball at 0.5 m/s or less within 2 frames of the sole meeting it; the body at 0.5 m/s or
//          less 0.27 to 0.33 s after; the ball at rest within 0.25 m of a foot (its ankle or toe, across the grass);
//     DS-6 no snapping: no foot bone turns more than 0.35 rad in a frame through the moves;
//     DS-7 Z with the ball at your feet is the double sole roll: half a turn and the push out the way you came.
//
//   node qa/bcs-sole.mjs [--sim]    exits 1 on any failed check; writes qa/out/bcs-sole.json (--sim: the simulation's
//                                   checks only)
import fs from "node:fs";
import path from "node:path";
import {simStep} from "../js/life/football/sim.js";
import {SOLE} from "../js/life/football/actions.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";
import {OUT, freeze} from "./lib.mjs";

const {res, check, done} = checker("bcs-sole");
const SIM_ONLY = process.argv.includes("--sim");
const r2 = v => v == null || !isFinite(v) ? v : Math.round(v*100)/100, r3 = v => v == null || !isFinite(v) ? v : Math.round(v*1000)/1000;
const inR = (v, a, b) => v != null && isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;
const fwdOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});
const ang = (ax, az, bx, bz) => Math.acos(Math.max(-1, Math.min(1, (ax*bx + az*bz)/((Math.hypot(ax, az)*Math.hypot(bx, bz)) || 1))));

/* ---------- the simulation ---------- */
// a fresh go on a full pitch: you at x = -40 facing +x with the ball at your feet, nobody else about (fc27-carry's)
function go(o = {}){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3, cfg => { cfg.pitch = "full"; });
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  me.foot = o.foot || "R";
  if (o.attrs) Object.assign(me.at, o.attrs);
  for (const a of ms.agents) if (a !== me && !a.isGK){ a.onPitch = false; a.m.x = 200; a.m.z = 200; }
  me.m.x = -40; me.m.z = 0; me.m.yaw = me.m.heading = -Math.PI/2; me.m.vx = me.m.vz = me.m.speed = 0;
  const f = fwdOf(me.m.yaw);
  ms.ball.p.x = me.m.x + f.x*.35; ms.ball.p.z = me.m.z + f.z*.35; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  ms.poss.ctl = -1;
  return {ms, me};
}
// the player's intents, as control.js sets them
function intent(me, on){
  const I = me.intent;
  I.dx = on ? 1 : 0; I.dz = 0; I.gait = "run"; I.speedCap = Infinity; I.strafe = false; I.knock = false;
  I.face = I.face || {x: 0, z: 0}; const f = on ? {x: 1, z: 0} : fwdOf(me.m.yaw); I.face.x = f.x; I.face.z = f.z;
}
/* a go: F at the start, carried on along +x at cap (none: standing with it) for tAt s, then the request;
   per step after it the touches (sole contacts with the ball and the body then), the footfalls, the body's speed, the
   ball's, the act. o.req(ms, me): the request; o.stop: the keys let go with it; o.keep: held on through it */
function trial(o){
  const {ms, me} = go(o);
  me.takeT = ms.t; if (o.cap) me.prm.run = o.cap;
  const rows = [], touches = [], falls = [];
  let ev0 = ms.events.length, t0 = null;
  const T = Math.round((o.tAt + (o.after || 2))/H);
  for (let k = 0; k < T; k++){
    const req = t0 == null && ms.t >= o.tAt - 1e-9;
    intent(me, o.cap ? (t0 == null || o.keep) && !req && !(o.stop && t0 != null) : false);
    if (req){ t0 = ms.t; o.req(ms, me); if (o.stop) intent(me, false); }
    const gn = me.g.n;
    simStep(ms, H);
    if (o.dir && me.act && me.act.kind === "fake" && !me.act.dir && me.act.t >= .1){ me.act.dir = o.dir; me.act.dirT = me.act.t; }
    if (me.g.n !== gn) falls.push({k, t: ms.t, side: me.g.side});
    const f = fwdOf(me.m.yaw), b = ms.ball;
    for (let i = ev0; i < ms.events.length; i++){
      const e = ms.events[i];
      if (e.agent !== me.id || e.kind !== "touch" || t0 == null) continue;
      touches.push({k, t: ms.t, foot: e.foot, part: e.part, sole: e.sole || null, carry: e.carry || null, fake: e.fake || null, push: !!e.push, hold: e.hold,
        bx: b.p.x, bz: b.p.z, mx: me.m.x, mz: me.m.z, fx: f.x, fz: f.z, v: me.m.speed});
    }
    ev0 = ms.events.length;
    if (t0 != null) rows.push({k, t: ms.t, v: me.m.speed, bv: Math.hypot(b.v.x, b.v.z), bvx: b.v.x, bvz: b.v.z, bx: b.p.x, bz: b.p.z, mx: me.m.x, mz: me.m.z, yaw: me.m.yaw,
      act: me.act ? me.act.kind + (me.act.move ? ":" + me.act.move : "") : null, ctl: !!me.ctlOn, mine: ms.poss.ctl === me.id});
  }
  return {ms, me, rows, touches, falls, t0};
}
// the first step at or after time t (rows)
const rowAt = (R, t) => R.rows.find(r => r.t >= t - 1e-9) || R.rows[R.rows.length - 1];
// where a contact let the ball go: the first step its speed is up from the hold (the sole's let-go), else its end
function release(R, c){
  const i0 = R.rows.findIndex(r => r.t >= c.t - 1e-9);
  for (let i = i0 + 1; i < R.rows.length; i++){ const r = R.rows[i], p = R.rows[i - 1]; if (r.t - c.t >= c.hold - 1e-6) return {row: r, prev: p, dt: r.t - c.t}; }
  return null;
}
const S = {};
// SS-1: the sole stop
{
  const T = [];
  for (const cap of [2.4, 3.2, 4.4, 5.9]) for (let j = 0; j < 6; j++){
    const R = trial({cap, tAt: 2.5 + j*.05, stop: true, after: 1.4, req: () => {}});
    const c = R.touches.find(x => x.part === "sole" && x.sole === "stop");
    if (!c){ T.push({cap, j, none: true}); continue; }
    const fall = R.falls.find(x => x.k === c.k);
    const after = c.t - R.t0;
    // (no other foot came down between the keys and it, but for one already landing within NEXT_MIN of the step that
    // saw them let go)
    const between = R.falls.filter(x => x.t > R.t0 + SOLE.NEXT_MIN + H + 1e-6 && x.t < c.t - 1e-9).map(x => r3(x.t - R.t0));
    const slow = R.rows.find(r => r.t >= c.t - 1e-9 && r.bv <= .5), body = R.rows.find(r => r.t >= c.t - 1e-9 && r.v <= .5), end = R.rows[R.rows.length - 1];
    const f = fwdOf(end.yaw), bx = end.bx - end.mx, bz = end.bz - end.mz;
    T.push({cap, j, foot: c.foot, fall: fall ? fall.side : null, after: r3(after), between, ballSlow: slow ? r3(slow.t - c.t) : null, hold: c.hold, body: body ? r3(body.t - c.t) : null,
      rest: [r2(bx*f.x + bz*f.z), r2(bx*-f.z + bz*f.x)], restV: r2(end.bv), ctl: end.ctl, mine: end.mine, vC: r2(c.v)});
  }
  S.stop = T;
  const feet = new Set(T.map(x => x.foot));
  check(T.every(x => !x.none && x.fall === x.foot && !x.between.length && (x.cap < 4 ? x.after <= .25 : x.after <= .2 + H + .001)) && feet.has("L") && feet.has("R"),
    "SS-1 the sole stop: the next foot down (either side, both seen; not one landing within SOLE.NEXT_MIN of the keys) comes down with its sole on the ball on its own footfall, within 0.2 s of the keys at 4 m/s or more (a frame's rounding), 0.25 s slower",
    T.map(x => [x.cap, x.j, x.foot, x.fall, x.after, x.between]));
  check(T.every(x => inR(x.ballSlow, 0, 2*H) && inR(x.hold, .1, .23)), "SS-1 the ball at 0.5 m/s or less within 2 frames of the contact, the sole on it 0.1 to 0.23 s", T.map(x => [x.cap, x.ballSlow, x.hold]));
  check(T.every(x => inR(x.body, .27, .33)), "SS-1 the body at 0.5 m/s or less 0.27 to 0.33 s after the contact", T.map(x => [x.cap, x.vC, x.body]));
  check(T.every(x => x.restV < .1 && inR(x.rest[0], -.1, .45) && Math.abs(x.rest[1]) <= .25 && x.ctl && x.mine), "SS-1 the ball left at rest by him (within 0.45 m ahead, 0.25 m across), close control kept",
    T.map(x => [x.cap, x.rest, x.restV, x.ctl]));
}
// SS-2, SS-3: the drags
{
  const D = [];
  for (const dir of ["a", "d", "s"]) for (const cap of [0, 2.4, 4.4]){
    const R = trial({cap, tAt: 2.5, keep: true, dir, after: 2.5, attrs: {ctrl: 90}, req: (ms, me) => { me.intent.action = {kind: "fake"}; }});
    const c = R.touches.find(x => x.part === "sole" && x.fake);
    if (!c){ D.push({dir, cap, none: true}); continue; }
    const rl = release(R, c), r0 = rowAt(R, c.t), f = {x: c.fx, z: c.fz}, rx = -f.z, rz = f.x;
    const v = rl ? Math.hypot(rl.row.bvx, rl.row.bvz) : null;
    // (the way it is let go against the way the key asks: back, and out to that side by DRAG_DIR)
    const [ac, bk] = SOLE.DRAG_DIR, sd = dir === "a" ? -1 : 1;
    const wx = dir === "s" ? -f.x : -f.x*bk + sd*rx*ac, wz = dir === "s" ? -f.z : -f.z*bk + sd*rz*ac;
    const off = rl ? ang(rl.row.bvx, rl.row.bvz, wx, wz) : null;
    // (how far back against him it went over the contact, and at what speed against him)
    // ((the ball at the step it is let go in: its path's end, moved on that step at the speed it leaves at, which is its
    // path's own there)
    const a0 = (r0.bx - r0.mx)*f.x + (r0.bz - r0.mz)*f.z, a1 = rl ? (rl.row.bx - rl.row.mx)*f.x + (rl.row.bz - rl.row.mz)*f.z : null;
    const moved = rl ? Math.hypot(rl.row.bx - r0.bx, rl.row.bz - r0.bz) : null;
    // (the run after it: the act's end, and the ball against him then)
    const iEnd = R.rows.findIndex(r => r.t > c.t + .25 && !r.act), e = iEnd >= 0 ? R.rows[iEnd] : null;
    D.push({dir, cap, foot: c.foot, fake: c.fake, hold: c.hold, v: r2(v), off: r3(off), rel: rl ? r3(a0 - a1) : null, relV: rl ? r2((a0 - a1)/c.hold) : null, moved: r3(moved), vC: r2(r0.v),
      end: e ? r2(e.t - c.t) : null, dEnd: e ? r2(Math.hypot(e.bx - e.mx, e.bz - e.mz)) : null, ctl: R.rows[R.rows.length - 1].ctl, mine: R.rows[R.rows.length - 1].mine});
  }
  S.drag = D;
  const AD = D.filter(x => x.dir !== "s"), SB = D.filter(x => x.dir === "s");
  check(AD.every(x => !x.none && x.foot === (x.dir === "a" ? "L" : "R") && inR(x.hold, .17, .23) && inR(x.v, 3.5, 4.5) && x.off <= .2),
    "SS-2 A and D: the sole of the foot on that side on the ball 0.17 to 0.23 s, let go rolling 3.5 to 4.5 m/s back and out to that side (within 0.2 rad)", AD.map(x => [x.dir, x.cap, x.foot, x.hold, x.v, x.off]));
  check(D.every(x => !x.none && x.ctl && x.mine && x.end != null && x.dEnd <= 1.25), "SS-2 after a drag he runs after it and has it again: close control kept, the ball within reach as the run after it ends",
    D.map(x => [x.dir, x.cap, x.end, x.dEnd, x.ctl]));
  const st = SB.find(x => x.cap === 0), run = SB.filter(x => x.vC >= 3);
  check(st && !st.none && st.foot === "R" && inR(st.hold, .17, .23) && inR(st.rel, .25, .4) && inR(st.v, 3, 4) && st.off <= .25,
    "SS-3 the S drag from a stand: the strong sole pulls it 0.25 to 0.4 m back under him in 0.17 to 0.23 s, let go 3 to 4 m/s straight back", st);
  check(run.length > 0 && run.every(x => inR(x.rel, .55, .85) && inR(x.relV, 2.75, 4.25)), "SS-3 the S drag from a run: about 0.7 m back against his body (0.55 to 0.85) at about 3 to 3.5 m/s against him", SB);
}
// SS-4: the double sole roll
{
  const Q = [];
  for (const foot of ["R", "L"]) for (const cap of [0, 2.4]){
    const R = trial({cap, foot, tAt: 2.5, after: 2.2, req: (ms, me) => { me.intent.action = {kind: "soleroll"}; }});
    const so = R.touches.filter(x => x.sole === "roll"), c1 = so.find(x => x.part === "sole"), c2 = so.filter(x => x.part === "sole")[1], p = so.find(x => x.push);
    if (!c1 || !c2 || !p){ Q.push({foot, cap, none: true, so: so.map(x => x.foot + x.part)}); continue; }
    const weak = foot === "R" ? "L" : "R", f = {x: c1.fx, z: c1.fz}, rx = -f.z, rz = f.x, sg = foot === "R" ? 1 : -1;
    const r1 = release(R, c1), r2_ = release(R, c2);
    const across = r1 ? -sg*((r1.row.bx - c1.bx)*rx + (r1.row.bz - c1.bz)*rz) : null, mean1 = r1 ? Math.hypot(r1.row.bx - c1.bx, r1.row.bz - c1.bz)/c1.hold : null;
    const back2 = r2_ ? -(r2_.row.bvx*f.x + r2_.row.bvz*f.z) : null;
    // (the half turn: the facing from the weak sole's let-go on)
    const yA = rowAt(R, c2.t + c2.hold).yaw;
    let turnT = null, turn = 0;
    for (const r of R.rows){ if (r.t < c2.t + c2.hold - 1e-9) continue; const d = Math.abs(Math.atan2(Math.sin(r.yaw - yA), Math.cos(r.yaw - yA))); if (d > Math.abs(turn)) turn = d; if (turnT == null && d > Math.PI - .17) turnT = r.t - (c2.t + c2.hold); }
    const pr = R.rows.find(r => r.t > p.t + 1e-9), pv = pr ? Math.hypot(pr.bvx, pr.bvz) : null, poff = pr ? ang(pr.bvx, pr.bvz, -f.x, -f.z) : null;
    const end = R.rows[R.rows.length - 1];
    Q.push({foot, cap, c1: [c1.foot, c1.hold], c2: [c2.foot, c2.hold, r3(c2.t - (c1.t + c1.hold))], across: r3(across), mean1: r2(mean1), back2: r2(back2), turn: r2(turn*180/Math.PI), turnT: r3(turnT),
      push: [p.foot, r2(pv), r3(poff)], ctl: end.ctl, mine: end.mine, weak});
  }
  S.roll = Q;
  check(Q.every(x => !x.none && x.c1[0] === x.foot && inR(x.c1[1], .1, .16) && inR(x.across, .25, .45) && inR(x.mean1, 1.5, 3.5)),
    "SS-4 the double sole roll: the strong sole first, on the ball 0.1 to 0.16 s, rolling it 0.25 to 0.45 m across to the weak side at 1.5 to 3.5 m/s", Q);
  check(Q.every(x => !x.none && x.c2[0] === x.weak && inR(x.c2[1], .1, .16) && inR(x.c2[2], 0, .12) && inR(x.back2, .5, 3)),
    "SS-4 then the weak sole, within 0.12 s of the first letting go, 0.1 to 0.16 s on it, rolling it back (let go going back at 0.5 to 3 m/s)", Q.map(x => [x.foot, x.cap, x.c2, x.back2]));
  check(Q.every(x => !x.none && inR(x.turn, 170, 190) && inR(x.turnT, 0, .25) && x.push[0] === x.foot && inR(x.push[1], 4, 5) && x.push[2] <= .25 && x.ctl && x.mine),
    "SS-4 then half a turn to the strong side in 0.25 s or less, and the strong foot pushes it out the way he came at 4 to 5 m/s; close control kept", Q.map(x => [x.foot, x.cap, x.turn, x.turnT, x.push, x.ctl]));
}
res.sim = S;

/* ---------- the drawn body ---------- */
if (!SIM_ONLY){
  const {trainLaunch, enterByButton, closeHubReal} = await import("./tr4b-lib.mjs");
  const t = await trainLaunch({seed: 6, gfx: "medium"});
  const page = t.page;
  const cases = {};
  try {
    await enterByButton(page);
    await closeHubReal(page);
    await page.evaluate(async () => {
      const R = window.__trainRun, C = await import("/js/life/football/control.js"), MV = await import("/js/life/moves.js"), HM = await import("/js/life/human.js");
      const build = (cfg, env) => {
        const hx = env.spec.hx, me = {slot: "ST", x: -hx + 6, z: 0, yaw: -Math.PI/2};
        return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}};
      };
      if (!R.scenario("qa-bcss")) R.registerScenario({id: "qa-bcss", category: "attacking", type: "qabcss", name: "Sole test", desc: "A test scenario", build});
      C.saveSet({footCam: "third"});
      const key = (type, k) => C.controlInput({type, key: k});
      window.__bs = {C, start(){ if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-bcss", {}); },
        // o: {cap (run held to it; none: standing), carry (steps before the move), move: 'stop' | 'a' | 'd' | 's' | 'roll', foot, n (steps after)}
        run(o){
          const L = window.__life, T = window.__trainRun.RUN.cur.T, ms = T.ms, me = T.me, V = T.V, CT = C.CTRL;
          const B = HM.BONE, P = L.P; P.yaw = -Math.PI/2; P.pitch = -.25;
          const h = V.rec[me.id].h, v1 = new (L.cam.position.constructor)(), Q = L.cam.quaternion.constructor;
          const wp = bone => { v1.set(0, 0, 0).applyMatrix4(h.bones[bone].matrixWorld); return [+v1.x.toFixed(4), +v1.y.toFixed(4), +v1.z.toFixed(4)]; };
          const P3 = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
          ms.meAI = false; me.foot = o.foot || "R";
          if (o.cap){ me.prm.run = o.cap; me.prm.jog = Math.min(me.prm.jog, o.cap); }
          CT.held.w = !!o.cap;
          L.stepN(6); me.takeT = ms.t;
          for (let i = 0; i < (o.carry || 60); i++) L.stepN(1);
          const FB = [B.ftL, B.ftR, B.toL, B.toR], prevQ = FB.map(bi => h.bones[bi].getWorldQuaternion(new Q())), qw = new Q(), out = [];
          let ev0 = ms.events.length;
          // the move by the real controls
          const seq = o.move === "stop" ? [[0, () => { CT.held.w = false; key("keyup", "w"); }]]
            : o.move === "roll" ? [[0, () => { key("keydown", "z"); }], [1, () => key("keyup", "z")]]
            : [[0, () => C.controlInput({type: "down", button: 0})], [8, () => key("keydown", "s")], [9, () => key("keyup", "s")], [14, () => key("keydown", o.move)], [15, () => key("keyup", o.move)]];
          for (let f = 0; f < (o.n || 90); f++){
            for (const [at, fn] of seq) if (at === f) fn();
            if (f === 16 && o.move !== "stop" && o.move !== "roll") C.controlInput({type: "up", button: 0});
            if (f === 2 && o.cap && o.move !== "stop") { /* (W held on through a fake and a roll) */ }
            L.stepN(1);
            L.scene().updateMatrixWorld(true);
            const evs = [];
            for (let i = ev0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.agent === me.id && e.kind === "touch") evs.push({foot: e.foot, part: e.part, sole: e.sole || null, fake: e.fake || null, push: !!e.push}); }
            ev0 = ms.events.length;
            let jb = 0; FB.forEach((bi, j) => { h.bones[bi].getWorldQuaternion(qw); const a = prevQ[j].angleTo(qw); if (a > jb) jb = a; prevQ[j].copy(qw); });
            const A = me.act, segs = A && A.segs ? A.segs.map(g => ({side: g.side, t0: +g.t0.toFixed(4), t1: +g.t1.toFixed(4), on: !!g.on, off: !!g.off})) : null;
            const mvF = h.mv && h.mode === "sole" && h.mv.feet ? h.mv.feet.map(x => !!x.down) : null, gF = h.gait && h.gait.feet ? h.gait.feet.map(x => !!x.down) : null;
            out.push({f, t: +ms.t.toFixed(4), v: +me.m.speed.toFixed(3), yaw: +me.m.yaw.toFixed(4), root: [h.g.position.x, h.g.position.z], mode: h.mode, act: A ? {kind: A.kind, move: A.move || null, t: +A.t.toFixed(4), dir: A.dir || null, segs} : null, ev: evs,
              ball: P3(V.ball.mesh.position), hip: [wp(B.thL), wp(B.thR)], knee: [wp(B.shL), wp(B.shR)], ank: [wp(B.ftL), wp(B.ftR)], toe: [wp(B.toL), wp(B.toR)],
              sole: [P3(MV.partPoint(h, "sole", "L")), P3(MV.partPoint(h, "sole", "R"))], down: mvF || gF, turn: +jb.toFixed(4), ctl: !!me.ctlOn});
          }
          CT.held.w = false; key("keyup", "w");
          return out;
        }};
    });
    const one = async o => {
      await page.evaluate(() => window.__bs.start());
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 300000});
      await freeze(page);
      return page.evaluate(o => window.__bs.run(o), o);
    };
    const plan = {stopA: {cap: 4.4, carry: 80, move: "stop", n: 70}, stopB: {cap: 4.4, carry: 85, move: "stop", n: 70}, stopC: {cap: 3.2, carry: 82, move: "stop", n: 70},
      dragA: {move: "a", n: 70}, dragD: {move: "d", n: 70}, dragS: {move: "s", n: 70}, dragRunD: {cap: 4.4, carry: 80, move: "d", n: 70},
      roll: {move: "roll", n: 80}, rollL: {move: "roll", foot: "L", n: 80}, rollRun: {cap: 3.0, carry: 80, move: "roll", n: 80}};
    for (const [k, o] of Object.entries(plan)) cases[k] = await one(o);
    fs.writeFileSync(path.join(OUT, "bcs-sole-frames.json"), JSON.stringify(cases));
  } catch(e){ check(false, "ran", String(e && e.stack || e)); }
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
  await t.close();
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const segD = (p1, q1, p2, q2) => {
    const d1 = [0, 1, 2].map(i => q1[i] - p1[i]), dd2 = [0, 1, 2].map(i => q2[i] - p2[i]), r = [0, 1, 2].map(i => p1[i] - p2[i]);
    const dot = (x, y) => x[0]*y[0] + x[1]*y[1] + x[2]*y[2];
    const a = dot(d1, d1), e = dot(dd2, dd2), f = dot(dd2, r), c = dot(d1, r), b = dot(d1, dd2), den = a*e - b*b;
    let sv = den > 1e-9 ? Math.min(1, Math.max(0, (b*f - c*e)/den)) : 0, tv = (b*sv + f)/e;
    if (tv < 0){ tv = 0; sv = Math.min(1, Math.max(0, -c/a)); } else if (tv > 1){ tv = 1; sv = Math.min(1, Math.max(0, (b - c)/a)); }
    return Math.hypot(...[0, 1, 2].map(i => p1[i] + d1[i]*sv - p2[i] - dd2[i]*tv));
  };
  const M = {};
  for (const [k, F] of Object.entries(cases)){
    if (!Array.isArray(F) || !F.length){ M[k] = {err: "no frames"}; continue; }
    const m = M[k] = {contacts: [], sep: 9, shin: 9, snap: 0};
    // the contacts: each sole touch, its foot, its frames (the act's seg times)
    let lastAct = null;
    for (let i = 0; i < F.length; i++){
      const r = F[i]; if (r.act) lastAct = r;
      for (const e of r.ev){
        if (e.part !== "sole") continue;
        const s = e.foot === "L" ? 0 : 1, o = 1 - s;
        // (the seg it is: the one with this foot just landed)
        const g = r.act && r.act.segs ? r.act.segs.find(x => x.side === e.foot && x.on && !x.off) : null;
        const hold = g ? g.t1 - g.t0 : .15;
        // the sole on the drawn ball's top: the longest run of frames within 0.03 m around it
        let best = 0, run = 0, near = [];
        for (let j = Math.max(0, i - 8); j < Math.min(F.length, i + Math.round(hold*60) + 10); j++){
          const top = [F[j].ball[0], F[j].ball[1] + .11, F[j].ball[2]], dd = d3(F[j].sole[s], top);
          near.push(+dd.toFixed(3));
          if (dd <= .03){ run++; if (run > best) best = run; } else run = 0;
        }
        // the other foot through it: down, and how far it moved
        let pivDown = true, pivMove = 0; const a0 = F[i].ank[o];
        for (let j = i; j < Math.min(F.length, i + Math.round(hold*60)); j++){ if (F[j].down && !F[j].down[o]) pivDown = false; pivMove = Math.max(pivMove, d2(F[j].ank[o], a0)); }
        const mid = F[Math.min(F.length - 1, i + Math.round(hold*30))], base = d2(mid.ank[0], mid.ank[1]);
        m.contacts.push({f: i, foot: e.foot, kind: e.sole, run: r3(best/60), pivDown, pivMove: r3(pivMove), base: r3(base), near: near.slice(0, 24)});
      }
    }
    // the legs: from the request (frame 0) to 0.2 s past the move's last act frame
    const last = F.reduce((a, r, i) => r.act ? i : a, 0), upto = Math.min(F.length, last + 13);
    for (let i = 0; i < upto; i++){
      const r = F[i], lx = r.hip[0][0] - r.hip[1][0], lz = r.hip[0][2] - r.hip[1][2], ll = Math.hypot(lx, lz) || 1;
      const sp = ((r.ank[0][0] - r.ank[1][0])*lx + (r.ank[0][2] - r.ank[1][2])*lz)/ll;
      if (sp < m.sep){ m.sep = sp; m.sepF = i; }
      const sh = segD(r.knee[0], r.ank[0], r.knee[1], r.ank[1]); if (sh < m.shin){ m.shin = sh; m.shinF = i; }
      if (i > 0) m.snap = Math.max(m.snap, r.turn);
    }
    m.sep = r3(m.sep); m.shin = r3(m.shin); m.snap = r3(m.snap);
    // the stop: the drawn ball's speed after the contact, the body's, where the ball rests
    if (k.startsWith("stop") && m.contacts.length){
      const i = m.contacts[0].f;
      let slow = null; for (let j = i; j < F.length - 1; j++){ const v = d2(F[j + 1].ball, F[j].ball)*60; if (v <= .5){ slow = j - i; break; } }
      let body = null; for (let j = i; j < F.length; j++) if (F[j].v <= .5){ body = r3((j - i)/60); break; }
      const e = F[F.length - 1], rest = Math.min(...[0, 1].flatMap(s => [d2(e.ank[s], e.ball), d2(e.toe[s], e.ball)]));
      Object.assign(m, {ballSlowF: slow, body, rest: r3(rest)});
    }
    if (k.startsWith("roll")){
      const y0 = F[0].yaw, ye = F[F.length - 1].yaw;
      m.turn = r2(Math.abs(Math.atan2(Math.sin(ye - y0), Math.cos(ye - y0)))*180/Math.PI);
      m.push = F.some(r => r.ev.some(e => e.push));
      m.act = F.some(r => r.act && r.act.move === "roll");
    }
  }
  res.drawn = M;
  console.log(JSON.stringify(M, (k, v) => k === "near" ? undefined : v));
  const all = Object.values(M), C = all.flatMap(m => m.contacts || []);
  check(C.length >= 14 && C.every(c => inR(c.run, .1, .25)), "DS-1 every sole contact: the touching foot's sole on the top of the drawn ball (within 0.03 m) for 0.1 to 0.25 s in a row", C.map(c => [c.foot, c.kind, c.run]));
  // (the drags' and the rolls' contacts: a sole stop after a drag's run, its keys let go, is the stop's)
  const DR = C.filter(c => c.kind !== "stop");
  check(DR.length >= 10 && DR.every(c => c.pivDown && c.pivMove <= .01), "DS-2 every drag and roll contact: the other foot down and still through it (0.01 m or less), the pivot", DR.map(c => [c.foot, c.kind, c.pivDown, c.pivMove]));
  check(DR.every(c => c.base >= .45), "DS-3 a wide base: the ankles 0.45 m or more apart at the middle of every drag and roll contact", DR.map(c => [c.foot, c.kind, c.base]));
  check(all.every(m => m.sep >= .05 && m.shin >= .06), "DS-4 the legs never cross: each ankle 0.05 m or more to its own side of the other across the hip joints, the shins never within 0.06 m",
    Object.fromEntries(Object.entries(M).map(([k, m]) => [k, [m.sep, m.sepF, m.shin, m.shinF]])));
  const ST = Object.entries(M).filter(([k]) => k.startsWith("stop")).map(([k, m]) => ({k, ballSlowF: m.ballSlowF, body: m.body, rest: m.rest}));
  check(ST.length === 3 && ST.every(x => inR(x.ballSlowF, 0, 2) && inR(x.body, .27, .33) && x.rest <= .25),
    "DS-5 the stop: the drawn ball at 0.5 m/s or less within 2 frames of the sole meeting it, the body at 0.5 m/s or less 0.27 to 0.33 s after, the ball at rest within 0.25 m of a foot", ST);
  check(all.every(m => m.snap <= .35), "DS-6 no foot bone turns more than 0.35 rad in a frame through the moves", Object.fromEntries(Object.entries(M).map(([k, m]) => [k, m.snap])));
  const RL = Object.entries(M).filter(([k]) => k.startsWith("roll")).map(([k, m]) => ({k, act: m.act, push: m.push, turn: m.turn}));
  check(RL.length === 3 && RL.every(x => x.act && x.push && inR(x.turn, 150, 210)), "DS-7 Z with the ball at your feet is the double sole roll: half a turn, the push out the way you came", RL);
}
process.exit(done() ? 0 : 1);
