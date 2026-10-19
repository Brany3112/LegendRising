// qa/fc27-shot.mjs: the shot as the FC 27 clip has it (plan/notes/fc27-spec.md section 4, its acceptance checks 6.1,
// 6.2 SH-1 to SH-8 and the shot rows of 6.4).
//
//   The simulation (node, a drill's match stepped by hand, actions.js STEP_IN):
//     SI-1 a shot at a slow ball a step away (still, or rolling 0.5 to 1.5 m/s, the body standing or walking up at
//       2.5 m/s or less; or a ball at his feet as he jogs with it, slower or faster than he is; or aimed 57 or 75
//       degrees off his facing) is a step-in: struck 0.30 to 0.35 s after it is asked (no late start when there is
//       time), its root at its place by the contact (a clean strike, a plant error of 6 cm at most), still going on
//       after it, turned to the aim by the contact (within 0.2 rad), the turn spread over the step;
//     SI-2 a ball too fast or too far, a body too fast, a ball in the air, a pass, a ball coming at him fast or an aim
//       behind him is not, as it is asked: the reach window's 0.10 to 0.18 s (or the stride adjust) as before (a far
//       ball's adjust may step in once it is near);
//     SH-8 full power (Shot Power 55 and 75): the ball leaves at 22 to 32 m/s, 5 to 12 degrees up, for a target 0.9 m up
//       10 m away (the clip's: into the net 0.5 to 1.2 m up).
//   The drawn body (the training page stepped frozen, 60 Hz, every body posed every step; your body in third person),
//   for a shot from a stand at a still ball, one walked up to a ball rolling away, a left-footer's at a ball rolling
//   away, one aimed 75 degrees to the left of his facing, all asked by the simulation's own action, one charged with the
//   ball at his feet as he sets off with W held and let go (the review's preview: W held all through, as a player
//   does), and one let go from a held wind-up standing (the left button held 0.6 s and let go), times relative to the
//   frame the kick is drawn in:
//     the release: the shot's clip begins within a frame of its act (nothing else drawn between: no stride adjust run
//       first, no leg held cocked), the contact 0.30 to 0.36 s after the shot is asked or let go; the body turned to
//       the aim by the contact (within 0.2 rad), never faster than 0.2 rad a frame;
//     SH-1 the plant foot down 0.17 to 0.23 s before the contact; from a stand the kicking foot's toe off the grass 0.13
//       to 0.20 s before (on the move reported: the trailing foot leaves as the body leaves it); the top of the backswing 0.07 to 0.13 s before, the heel (ankle) 0.35 to 0.65 m up (and the knee's bend
//       there, reported: the clip's 100 to 120 degrees);
//     SH-2 the plant foot at the contact 0.28 to 0.45 m to the support side of the ball's centre, 0 to 0.2 m behind it;
//     SH-3 at the contact the laces within 0.05 m of the ball's surface, the ankle pitched toes down 0.6 rad or more;
//     SH-4 the follow-through's top 0.75 to 1.05 m up, 0.08 to 0.16 s after the contact, the foot going on at least
//       0.05 m to the support side after it (from the root: the leg's own sweep);
//     SH-5 the kicking foot down 0.32 to 0.44 s after the contact; the plant foot down (its toe on the grass, not
//       sliding) until at least 0.2 s after it; any flight (the plant foot's toe up before the kicking foot is down) 0.13 s
//       or less;
//     SH-6 the support arm out 1.3 rad or more from the trunk's down from the top of the backswing to the contact;
//     SH-7 the clip not begun late, the plant step drawn (the support foot carried 0.15 m or more onto the plant);
//     the body (5.7): the trunk leaning 0.15 to 0.3 rad to the support side at the top (the clip's about 0.2), 0.15 or
//       less at the contact, pitched 0.5 to 0.7 rad forward within 0.15 s of the kicking foot's landing;
//     and fluid: the kicking foot at the drawn ball at the contact (within 0.12 m of its surface, tr9-anim's), no bone
//     turning more than 0.35 rad in a frame outside 0.12 s either side of the contact (the clip's entry and exit
//     included), the plant foot not sliding while it is down (10 mm); the held wind-up's: the support foot hops onto its
//     plant, the cocked leg's full swing (its top 0.07 to 0.13 s before the contact, the heel 0.35 to 0.65 m up, the
//     follow-through's top 0.75 to 1.05 m up at 0.08 to 0.16 s), the foot at the ball, landed in time.
//   6.4: the walked-up shot drawn from the clip's camera (9 m behind, 3.8 m up, 25 degrees down, 9:16, 50 degrees
//     high) at 30 fps over the clip's window, next to the clip's frames f246 to f266 when they are on this machine
//     (FC27_FRAMES, default the scratchpad's fc27/full): qa/out/fc27-shot-sbs.png (by eye; not asserted).
//
//   node qa/fc27-shot.mjs          exits 1 on any failed check; writes qa/out/fc27-shot.json (FC27_SIM=0 or FC27_DRAW=0
//                                  leaves out the simulation's or the drawn body's checks, FC27_CASES=stand,walk the cases)
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {simStep} from "../js/life/football/sim.js";
import {STEP_IN, refreshPred} from "../js/life/football/actions.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {OUT} from "./lib.mjs";
import {trainLaunch, enterByButton} from "./tr4b-lib.mjs";
import {freeze, unfreeze} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("fc27-shot");
const r3 = v => v == null || !isFinite(v) ? v : Math.round(v*1000)/1000;
const inR = (v, a, b) => v != null && isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;

/* ---------- the simulation ---------- (FC27_SIM=0 skips it, while working on the drawing) */
// a shot asked of you on a drill's simulation: the ball `ahead` m in front and `side` m to your right, rolling vb m/s
// on along your way; you going at v m/s that way. Returns the act, the kick and your speeds through it
function simShot(o){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  for (const a of ms.agents) if (a !== me) a.hold = true;
  if (o.at) Object.assign(me.at, o.at);
  me.foot = o.foot || "R";
  const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}, rt = {x: -f.z, z: f.x}, b = ms.ball;
  b.p.x = me.m.x + f.x*o.ahead + rt.x*(o.side || 0); b.p.z = me.m.z + f.z*o.ahead + rt.z*(o.side || 0); b.p.y = o.y || .11;
  b.v.x = f.x*(o.vb || 0); b.v.z = f.z*(o.vb || 0); b.v.y = 0; b.sleep = false;
  const v = o.v || 0;
  me.m.speed = v; me.m.vx = f.x*v; me.m.vz = f.z*v; me.m.heading = me.m.yaw;
  ms.poss.ctl = me.id; refreshPred(ms);
  // (o.aim: the target that far to his left of his facing)
  const am = o.aim || 0, ad = {x: f.x*Math.cos(am) + f.z*Math.sin(am), z: f.z*Math.cos(am) - f.x*Math.sin(am)};
  const tgt = {x: me.m.x + ad.x*(o.dist || 10), y: o.ty != null ? o.ty : .9, z: me.m.z + ad.z*(o.dist || 10)};
  const aimYaw = Math.atan2(-ad.x, -ad.z), wr = a => Math.atan2(Math.sin(a), Math.cos(a));
  me.intent.action = {kind: o.kind || "shot", target: tgt, recv: -1, power: o.p || .85, contact: 0, finesse: false, atGoal: true, shape: "test", speed: o.kind === "pass" ? 12 : undefined};
  const out = {act: null, kick: null, speeds: [], t0: ms.t, yawRate: 0};
  for (let k = 0; k < 70; k++){
    // (the approach: on his way at a walk or a jog, as your keys ask it, no cap)
    const I = me.intent; I.dx = v > 0 ? f.x : 0; I.dz = v > 0 ? f.z : 0; I.gait = v > 1.6 ? "jog" : "walk"; I.speedCap = Infinity;
    const t0 = ms.t, y0 = me.m.yaw;
    simStep(ms, H);
    if (!out.kick) out.yawRate = Math.max(out.yawRate, Math.abs(wr(me.m.yaw - y0)));
    // (as it is asked: a far ball's stride adjust may turn into a step-in once the ball is in a step's reach)
    if (me.act && !out.act){ out.act = me.act; out.at0 = {stepIn: !!me.act.stepIn, adjust: !!me.act.adjust, tc: me.act.tc}; }
    out.speeds.push(me.m.speed);
    const e = !out.kick && ms.events.find(x => x.kind === "kick" && x.agent === me.id);
    if (e) out.kick = {t: t0 - out.t0, v: e.speed, el: Math.atan2(b.v.y, Math.hypot(b.v.x, b.v.z))*180/Math.PI, strike: e.strike, k, yawErr: Math.abs(wr(me.m.yaw - aimYaw))};
  }
  const a = out.act;
  const a0 = out.at0 || {};
  return {o, stepIn: !!a0.stepIn, tc: a0.tc != null ? a0.tc : null, adjust: a ? !!a0.adjust : null, later: !!(a && a.stepIn), kick: out.kick, err: a && a.stepIn ? a.stepIn.err : null,
    vC: a && a.stepIn ? a.stepIn.vC : null, vAfter: out.kick ? out.speeds[Math.min(out.speeds.length - 1, out.kick.k + 12)] : null, yawRate: out.yawRate};
}
if (process.env.FC27_SIM !== "0"){
  // (and the review's: running with the ball at his feet, it slower than he is or faster; aimed 75 degrees off his facing,
  // standing and on the move)
  const IN = [{ahead: .4, side: .1}, {ahead: .6, side: .1}, {ahead: .8, side: -.2}, {ahead: .7, side: .2, vb: .5},
    {ahead: .8, side: 0, vb: 1, v: 1.5}, {ahead: .6, side: .1, vb: 1.5, v: 2.5}, {ahead: 1.0, side: .1, vb: .5, v: 2.0}, {ahead: .6, side: -.1, foot: "L"},
    {ahead: .3, side: .1, vb: 1.2, v: 2.4}, {ahead: .25, side: .1, vb: 2.7, v: 2.6}, {ahead: .35, side: .1, vb: 3.0, v: 3.8}, {ahead: .6, side: .1, aim: 1.3},
    {ahead: .5, side: .1, vb: 1.5, v: 2.2, aim: -1.0}];
  const R1 = IN.map(simShot);
  const s = R1.map(r => ({o: r.o, stepIn: r.stepIn, tc: r3(r.tc), kickAt: r.kick ? r3(r.kick.t) : null, err: r3(r.err), strike: r.kick ? r.kick.strike : null, vC: r3(r.vC), vAfter: r3(r.vAfter)}));
  check(R1.every(r => r.stepIn && inR(r.tc, .30, .35) && r.kick && Math.abs(r.kick.t - r.tc) <= H + 1e-6 + 1e-9),
    "SI-1 a shot at a slow ball a step away is a step-in, struck 0.30 to 0.35 s after it is asked (at the act's own time)", s);
  check(R1.every(r => r.err <= .06 && r.kick && r.kick.strike >= .8),
    "SI-1 the root is at its place by the contact (a plant error of 0.06 m at most) and the strike is clean (0.8 or more)", s.map(x => [x.err, x.strike]));
  check(R1.filter(r => r.vC > 1.2).every(r => r.vAfter >= .6*r.vC), "SI-1 a body that stepped in at speed runs on after the contact (0.2 s on, at least 60% of its speed)", s.map(x => [x.vC, x.vAfter]));
  check(R1.every(r => r.kick && r.kick.yawErr <= .2 && r.yawRate <= .2), "SI-1 he turns to the aim through the step (within 0.2 rad of it at the contact), the turn spread over it (0.2 rad a step at most: 12 rad/s, the clip's spin)",
    R1.map(r => ({o: r.o, yawErr: r.kick && r3(r.kick.yawErr), yawRate: r3(r.yawRate)})));
  const OUTS = [{ahead: .6, side: .1, vb: 3}, {ahead: .6, side: .1, v: 5.2, vb: 5.0}, {ahead: 1.6, side: 0}, {ahead: .6, side: .1, y: .6}, {ahead: .6, side: .1, kind: "pass"},
    {ahead: 1.2, side: .1, vb: -1.2, v: 1.5}, {ahead: .6, side: .1, aim: 2.6}, {ahead: .35, side: .1, vb: 3.8, v: 4.0}];
  const R2 = OUTS.map(simShot);
  check(R2.every(r => !r.stepIn && (r.adjust || r.tc <= .18 + 1e-9)), "SI-2 a fast ball, a fast body, a ball out of a step's reach, a ball in the air, a pass, a ball coming at him fast or an aim behind him is not a step-in (the window's 0.10 to 0.18 s, or the stride adjust)",
    R2.map(r => ({o: r.o, stepIn: r.stepIn, tc: r3(r.tc), adjust: r.adjust, later: r.later})));
  const P8 = [55, 75].map(pw => simShot({ahead: .6, side: .1, p: .97, at: {power: pw}, dist: 10, ty: .9}));
  check(P8.every(r => r.kick && inR(r.kick.v, 22, 32) && inR(r.kick.el, 5, 12)), "SH-8 a full-power shot (Shot Power 55 and 75) leaves at 22 to 32 m/s, 5 to 12 degrees up (10 m out, 0.9 m up)",
    P8.map(r => ({v: r.kick && r.kick.v, el: r.kick && r3(r.kick.el)})));
}

/* ---------- the drawn body ---------- (FC27_DRAW=0 skips it) */
if (process.env.FC27_DRAW === "0") process.exit(done() ? 0 : 1);
const FR = process.env.FC27_FRAMES || "/tmp/claude-0/-home-user-LegendRising/d7981b91-2350-5c6d-acea-ac57541f3685/scratchpad/fc27/full";
const t = await trainLaunch({seed: 27});
const page = t.page;
const ready = async () => { await unfreeze(page); await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000}); await freeze(page); };
const cases = {};
try {
  await enterByButton(page);
  await page.evaluate(() => window.__trainHub.closeHub());
  await page.evaluate(async () => {
    const Rn = window.__trainRun, L = window.__life, HM = await import("/js/life/human.js"), MV = await import("/js/life/moves.js");
    const C = await import("/js/life/football/control.js"), AC = await import("/js/life/football/actions.js"), RU = await import("/js/life/football/rules.js");
    C.saveSet({footCam: "third"});
    const build = (cfg, env) => { const hx = env.spec.hx, me = {slot: "ST", x: -hx + 12, z: 0, yaw: -Math.PI/2}; return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + 8, y: .11, z: 0, free: true}}; };
    if (!Rn.scenario("qa-fc27s")) Rn.registerScenario({id: "qa-fc27s", category: "attacking", type: "qafc27s", name: "Shot test", desc: "A test scenario", build});
    const B = HM.BONE, Vec = L.cam.position.constructor, Qn = L.cam.quaternion.constructor;
    const v1 = new Vec(), v2 = new Vec(), q1 = new Qn();
    const BN = ["hips", "chest", "uaL", "faL", "uaR", "faR", "thL", "shL", "ftL", "toL", "thR", "shR", "ftR", "toR"];
    const P3 = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
    // one shot: the approach (standing, or walking up with W and X held), then the ball put where it is asked and the
    // shot asked of the simulation (or, o.hold, the left button held and let go), and the frames drawn after it
    window.__f27 = {Rn, L, run(o){
      const T = Rn.RUN.cur.T, ms = T.ms, V = T.V, me = ms.agents[ms.me], R = V.rec[me.id], CT = C.CTRL, P = L.P, b = ms.ball;
      ms.meAI = false; V.fpOn = false; me.foot = o.foot || "R";
      P.yaw = me.m.yaw; P.pitch = -.1;
      const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}, rt = {x: -f.z, z: f.x};
      const park = () => { b.p.x = me.m.x + f.x*8; b.p.z = me.m.z + f.z*8; b.p.y = .11; b.v.x = b.v.y = b.v.z = 0; b.state = "free"; b.sleep = false; };
      // (o.vbRel: the ball rolling that much faster than he goes, a ball at his feet as he runs with it)
      const place = () => { const vb = o.vbRel != null ? Math.max(0, me.m.speed + o.vbRel) : o.vb || 0;
        b.p.x = me.m.x + f.x*o.ahead + rt.x*o.side; b.p.z = me.m.z + f.z*o.ahead + rt.z*o.side; b.p.y = .11; b.v.x = f.x*vb; b.v.z = f.z*vb; b.v.y = 0; b.state = "free"; b.sleep = false; AC.refreshPred(ms); };
      park(); AC.refreshPred(ms);
      // (o.jog: W alone, the run's own pace, not the walk; o.keep: W kept held through the shot, as a player running
      // with the ball does)
      CT.walk = !!o.v && !o.jog; CT.held.w = !!o.v;
      for (let i = 0; i < 120; i++){ if (o.v ? i > 20 && me.m.speed >= o.v - .1 : i >= 40) break; L.stepN(1); park(); AC.refreshPred(ms); }
      if (!o.keep){ CT.held.w = false; CT.walk = false; }
      place(); RU.setCtl(ms, me);
      const frames = [], E0 = ms.events.length;
      let prevQ = null, shots = [];
      // (o.aim: the target turned that far from his facing, to his left: he aims one way and faces another)
      const am = o.aim || 0, lf = {x: f.z, z: -f.x}, ad = {x: f.x*Math.cos(am) + lf.x*Math.sin(am), z: f.z*Math.cos(am) + lf.z*Math.sin(am)};
      const tgt = {x: me.m.x + ad.x*10, y: .9, z: me.m.z + ad.z*10};
      let rel = null;
      if (o.hold){
        // (the left button held o.charge frames, the ball kept where it is asked, at his feet as he goes, then let go)
        // (o.wCharge: W pressed with it, from a stand: he sets off with the ball as he charges, a jog's pace by the release)
        if (o.wCharge){ CT.held.w = true; CT.walk = false; }
        CT.lmb = true; CT.lmbT = 0; CT.queue.push({k: "ldown"});
        for (let i = 0; i < (o.charge || 36); i++){ L.stepN(1); place(); }
        CT.lmb = false; CT.queue.push({k: "lup", t: CT.lmbT});
        rel = {v: +me.m.speed.toFixed(3), held: !!R.h.heldAt || R.h.mode === "strike"};
      } else AC.startAction(ms, me, {kind: "shot", target: tgt, recv: -1, power: .85, contact: 0, finesse: false, atGoal: true, shape: "test"});
      const aimYaw = Math.atan2(-ad.x, -ad.z);
      const cam = new L.cam.constructor(50, 16/9, .1, 400);
      for (let j = 0; j < (o.n || 66); j++){
        const pre = {x: b.p.x, y: b.p.y, z: b.p.z}, n0 = ms.events.length;
        L.stepN(1);
        L.scene().updateMatrixWorld(true);
        const h = R.h, fr = {j, t: +ms.t.toFixed(4), pre: [pre.x, pre.y, pre.z]};
        for (let i = n0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.kind === "kick" && e.agent === me.id) fr.kick = {speed: e.speed, whiff: !!e.whiff}; }
        for (const nm of BN){ h.bones[B[nm]].getWorldPosition(v1); fr[nm] = P3(v1); }
        // the feet's forward (toes) and the chest's down, in the world
        for (const nm of ["ftL", "ftR"]){ h.bones[B[nm]].getWorldQuaternion(q1); v2.set(0, 0, 1).applyQuaternion(q1); fr[nm + "F"] = P3(v2); }
        h.bones[B.chest].getWorldQuaternion(q1); v2.set(0, -1, 0).applyQuaternion(q1); fr.chestD = P3(v2);
        fr.laces = P3(MV.partPoint(h, "laces", o.foot || "R"));
        fr.ball = P3(V.ball.mesh.position); fr.root = P3(h.g.position); fr.v = +me.m.speed.toFixed(3); fr.yaw = +me.m.yaw.toFixed(4); fr.ry = +h.g.rotation.y.toFixed(4);
        // the largest turn of any bone from the frame before (its own local turn)
        const q = h.bones.map(x => x.quaternion.clone());
        if (prevQ){ let m = 0, at = -1; for (let i = 0; i < q.length; i++){ const a = q[i].angleTo(prevQ[i]); if (a > m){ m = a; at = i; } } fr.turn = +m.toFixed(4); fr.turnAt = at; }
        prevQ = q;
        const mv = h.mv;
        fr.mode = h.mode; fr.ev = h.ev ? h.ev.mask : 0;
        if (mv && mv.key === "strike") fr.clip = {tau: +mv.tau.toFixed(4), contact: mv.contact, late: isFinite(mv.late) ? +mv.late.toFixed(3) : null, pre: +(mv.pre || 0).toFixed(3), fromHold: !!mv.fromHold, hop: !!mv.hop, id: mv.id, kDown: !!(mv.data && mv.data.kDown)};
        fr.act = me.act ? {tc: me.act.tc, t: +me.act.t.toFixed(4), stepIn: !!me.act.stepIn, kind: me.act.kind} : null;
        // (6.4: the clip's camera, behind him on his way, every other frame)
        if (o.shots && j % 2 === 0){
          const r = h.g.position;
          cam.position.set(r.x - f.x*9, 3.8, r.z - f.z*9);
          const pc = 25*Math.PI/180; cam.lookAt(cam.position.x + f.x*Math.cos(pc), cam.position.y - Math.sin(pc), cam.position.z + f.z*Math.cos(pc));
          cam.updateMatrixWorld(true);
          const ren = L.renderer(); ren.render(L.scene(), cam);
          const src = ren.domElement, H0 = src.height, W0 = Math.round(H0*9/16), c2 = document.createElement("canvas"); c2.width = 270; c2.height = 480;
          c2.getContext("2d").drawImage(src, Math.round((src.width - W0)/2), 0, W0, H0, 0, 0, 270, 480);
          shots.push({j, url: c2.toDataURL("image/jpeg", .85)});
        }
        frames.push(fr);
      }
      CT.held.w = false; CT.walk = false;
      return {frames, shots, hx: me.scale || 1, E: ms.events.length - E0, aimYaw, rel};
    }};
  });
  await page.evaluate(() => window.__trainRun.startScenario("qa-fc27s", {}));
  await ready();
  // (the walk-up is played again last for 6.4's pictures, so the drawing for them cannot touch the measured ones)
  const CASES = {
    stand: {ahead: .6, side: .1},
    walk: {ahead: .8, side: .05, vb: 1.0, v: 1.5},
    left: {ahead: .9, side: -.1, vb: .5, foot: "L"},
    hold: {ahead: .5, side: .1, hold: true},
    // (the review's: a shot charged running with the ball at his feet and let go, W held all through; and one aimed 75
    // degrees to his left of where he faces)
    dribble: {ahead: .3, side: .1, vbRel: -1.2, v: .6, jog: true, keep: true, hold: true, charge: 18},
    turn: {ahead: .6, side: .1, aim: 1.3},
    pics: {ahead: .8, side: .05, vb: 1.0, v: 1.5, shots: true}
  };
  // (FC27_PICS=dribble: 6.4's pictures of another case, to look at it; the walk-up's by default)
  if (process.env.FC27_PICS && CASES[process.env.FC27_PICS]) CASES.pics = Object.assign({}, CASES[process.env.FC27_PICS], {shots: true});
  // (FC27_CASES=stand,walk: those alone, while working on them)
  const only = (process.env.FC27_CASES || "").split(",").filter(Boolean);
  for (const [k, o] of Object.entries(CASES)){
    if (only.length && !only.includes(k)) continue;
    await page.evaluate(() => { const R = window.__trainRun; R.stopScenario("restart"); return R.startScenario("qa-fc27s", {}); });
    await ready();
    cases[k] = await page.evaluate(o => window.__f27.run(o), o);
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
check(!t.errors.length, "zero console and page errors", t.errors.slice(0, 5));
await t.close();
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "fc27-shot-raw.json"), JSON.stringify(Object.fromEntries(Object.entries(cases).map(([k, c]) => [k, c.frames]))));

/* ---------- the drawn body's measures ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const hz = a => Math.hypot(a[0], a[2]);
function measure(name, c, foot){
  const F = c.frames, K = foot === "L" ? "L" : "R", S = K === "L" ? "R" : "L";
  const jc = F.findIndex(f => f.kick && !f.kick.whiff);
  if (jc < 0) return {name, err: "no kick"};
  // (times in the game's own: a clean contact's hit-stop holds the world, and the bodies with it, for a few frames)
  const tOf = j => j >= 0 && j < F.length ? F[j].t - F[jc].t : null;
  const ank = (f, s) => f["ft" + s], toe = (f, s) => f["to" + s];
  const minA = s => Math.min(...F.map(f => ank(f, s)[1])), minT = s => Math.min(...F.map(f => toe(f, s)[1]));
  const fc = F[jc], bc = fc.ball;
  // (the grass: the planted support foot's ankle and toe at the contact; the kicking foot's own as it stood (its lowest
  // after the contact, where it lands); a foot driven into the grass for a frame would set them too low)
  const aS = ank(fc, S)[1], oS = toe(fc, S)[1], aK = aS, oK = oS;
  // the strike's way: the drawn ball's over the frames after the contact
  let ja = jc + 1;
  while (ja < F.length - 1 && hz(sub(F[ja].ball, bc)) < .3) ja++;
  const bl = F[ja].ball, aim0 = [bl[0] - bc[0], 0, bl[2] - bc[2]], al = hz(aim0) || 1, aim = [aim0[0]/al, 0, aim0[2]/al];
  // the support side: the left of the way (aim.z, -aim.x) for a right foot
  const ss = K === "R" ? 1 : -1, sup = [aim[2]*ss, 0, -aim[0]*ss];
  // the plant: the support foot down (ankle at the grass) and still from then to the contact
  let jp = jc;
  while (jp > 0 && ank(F[jp - 1], S)[1] <= aS + .02 && hz(sub(ank(F[jp - 1], S), ank(fc, S))) < .012) jp--;
  const j0 = F.findIndex(f => f.clip);
  const stepLen = j0 >= 0 ? hz(sub(ank(F[jp], S), ank(F[j0], S))) : 0;
  // the kicking foot's toe-off: its toe up from then to the contact (none when it was in the air as the shot began)
  let jt = jc;
  while (jt > 0 && toe(F[jt - 1], K)[1] > oK + .03) jt--;
  // (only for a foot standing as the clip began, the clip's own kDown: one in its stride's swing then has no toe-off)
  const toeOff = j0 >= 0 && F[jc].clip && F[jc].clip.kDown && jt > 0 && toe(F[jt - 1], K)[1] <= oK + .03 ? tOf(jt) : null;
  // the top of the backswing: the kicking ankle at its highest between the toe-off (or the clip's start) and the contact
  let jtop = -1, ytop = -1;
  for (let j = Math.max(jt, j0 >= 0 ? j0 : 0); j < jc; j++) if (ank(F[j], K)[1] > ytop){ ytop = ank(F[j], K)[1]; jtop = j; }
  const knee = j => { const f = F[j], u = sub(f["th" + K], f["sh" + K]), w = sub(f["ft" + K], f["sh" + K]); return 180 - Math.acos(Math.max(-1, Math.min(1, dot(u, w)/(len(u)*len(w)))))*180/Math.PI; };
  // SH-2: the plant at the contact
  const pv = sub(ank(fc, S), bc), lat = dot(pv, sup), behind = -dot(pv, aim);
  // SH-3: the laces and the ankle's pitch at the contact
  const laces = len(sub(fc.laces, bc)) - .11, fwd = fc["ft" + K + "F"], pitch = Math.asin(Math.max(-1, Math.min(1, -fwd[1])));
  const nearest = Math.min(...["ft" + K, "to" + K].map(n => len(sub(fc[n], bc)) - .11));
  // SH-4: the follow-through's top and the sweep after it
  let jft = -1, yft = -1;
  for (let j = jc + 1; j < Math.min(F.length, jc + Math.round(.3/H)); j++) if (ank(F[j], K)[1] > yft){ yft = ank(F[j], K)[1]; jft = j; }
  let jl = -1;
  for (let j = jft + 1; j < F.length; j++) if (ank(F[j], K)[1] <= aK + .02){ jl = j; break; }
  let sweep = 0;
  // (the sweep is the leg's own, from the root: a body still carried sideways after the contact carries the foot too)
  for (let j = jft + 1; j <= (jl > 0 ? jl : F.length - 1); j++) sweep = Math.max(sweep, dot(sub(sub(ank(F[j], K), F[j].root), sub(ank(F[jft], K), F[jft].root)), sup));
  // SH-5: the plant foot down to +0.2 s (its toe on the grass, not sliding), its toe-off, the flight
  let downTo = null;
  for (let j = jc; j < F.length; j++){ const up = toe(F[j], S)[1] > oS + .02 || hz(sub(toe(F[j], S), toe(fc, S))) > .012; if (up){ downTo = tOf(j); break; } }
  if (downTo == null) downTo = tOf(F.length - 1);
  let jso = -1;
  for (let j = jc; j < F.length; j++) if (toe(F[j], S)[1] > oS + .03){ jso = j; break; }
  const flight = jso >= 0 && jl >= 0 && jso < jl ? tOf(jl) - tOf(jso) : 0;
  // SH-6: the support arm from the top to the contact (the upper arm against the trunk's down)
  let arm = 9;
  for (let j = Math.max(0, jtop); j <= jc; j++){ const f = F[j], u = sub(f["fa" + S], f["ua" + S]); arm = Math.min(arm, Math.acos(Math.max(-1, Math.min(1, dot(u, f.chestD)/len(u))))); }
  // fluid: the largest bone turn in a frame away from the contact; the plant's slide while it is down
  let turn = 0, turnAt = null;
  for (let j = 1; j < F.length; j++){ const f = F[j]; if (Math.abs(tOf(j)) < .12 || f.turn == null) continue; if (f.turn > turn){ turn = f.turn; turnAt = {t: r3(tOf(j)), bone: f.turnAt, mode: f.mode, tau: f.clip ? f.clip.tau : null}; } }
  let slide = 0;
  // (from the frame after it lands: the landing frame itself is still settling onto its point, a few millimetres)
  const jp1 = Math.min(jc, jp + 1);
  for (let j = jp1; j < F.length && tOf(j) <= .2; j++) slide = Math.max(slide, hz(sub(toe(F[j], S), toe(F[jp1], S))));
  // the body (5.7): the trunk's lean to the support side and its pitch forward along the way (the chest's up)
  const trunk = j => { const u = F[j].chestD.map(x => -x); return {fw: Math.atan2(dot(u, aim), u[1]), lat: Math.atan2(dot(u, sup), u[1])}; };
  const leanTop = jtop >= 0 ? trunk(jtop).lat : null, leanC = trunk(jc).lat;
  let pitchLand = -9;
  for (let j = Math.max(jl, jc); jl >= 0 && j < F.length && tOf(j) <= tOf(jl) + .15; j++) pitchLand = Math.max(pitchLand, trunk(j).fw);
  // the release: the act from the frame it starts, the clip from the frame it does, the contact after the act's start;
  // the body's facing at the contact against the aim (c.aimYaw) and its fastest turn in a frame before it
  const jA = F.findIndex(f => f.act && f.act.kind === "kick"), jC = F.findIndex(f => f.clip);
  const relC = jA >= 0 ? F[jc].t - F[jA].t + H : null;
  const wr = a => Math.atan2(Math.sin(a), Math.cos(a));
  const yawErr = c.aimYaw != null ? Math.abs(wr(F[jc].yaw - c.aimYaw)) : null;
  // the lunge: the hips' lowest from the clip's start to the contact under their highest in the case
  const hipTop = Math.max(...F.map(f => f.hips[1])), hipDip = hipTop - Math.min(...F.slice(Math.max(0, jC), jc + 1).map(f => f.hips[1]));
  let yawRate = 0;
  for (let j = Math.max(1, jA); j <= jc; j++) yawRate = Math.max(yawRate, Math.abs(wr(F[j].ry - F[j - 1].ry)));
  const clip = fc.clip || {};
  return {name, gap: jA >= 0 && jC >= 0 ? jC - jA : null, actAt: jA, relC: r3(relC), yawErr: r3(yawErr), yawRate: r3(yawRate), hipDip: r3(hipDip), vRel: c.rel ? c.rel.v : null, plant: r3(tOf(jp)), toeOff: r3(toeOff), top: r3(tOf(jtop)), heel: r3(ytop), knee: jtop >= 0 ? Math.round(knee(jtop)) : null, stepLen: r3(stepLen),
    lat: r3(lat), behind: r3(behind), laces: r3(laces), pitch: r3(pitch), nearest: r3(nearest), ftTop: r3(yft), ftAt: r3(tOf(jft)), sweep: r3(sweep),
    land: jl >= 0 ? r3(tOf(jl)) : null, plantDownTo: r3(downTo), flight: r3(flight), arm: r3(arm), leanTop: r3(leanTop), leanC: r3(leanC),
    pitchLand: jl >= 0 ? r3(pitchLand) : null, turn: r3(turn), turnAt, slide: r3(slide),
    late: clip.late, pre: clip.pre, fromHold: clip.fromHold, hop: clip.hop, stepIn: fc.act ? fc.act.stepIn : null, tc: fc.act ? fc.act.tc : null, jc, n: F.length};
}
const M = {};
for (const [k, c] of Object.entries(cases)) if (k !== "pics") M[k] = measure(k, c, k === "left" ? "L" : "R");
console.log(JSON.stringify(M, null, 1));
// (FC27_CASES: the cases asked for alone)
const ASKED = ["stand", "walk", "left", "dribble", "turn"].filter(k => !process.env.FC27_CASES || process.env.FC27_CASES.split(",").includes(k));
const SH = ASKED.map(k => M[k]).filter(Boolean);
const ok = SH.length === ASKED.length && SH.length > 0 && SH.every(m => !m.err);
const pick = (...ks) => SH.map(m => Object.fromEntries([["case", m.name], ...ks.map(k => [k, m[k]])]));
check(ok, "the shots (a stand, a walk-up at a rolling ball, a left-footer's, one charged running with the ball at his feet and let go, one aimed 75 degrees off his facing) are struck and drawn", Object.values(M).map(m => m.err || m.name));
check(ok && [...SH, M.hold].filter(Boolean).every(m => m.gap != null && m.gap <= 1 && inR(m.relC, .30, .36)), "the clip begins with the shot's act (within a frame of it: nothing else drawn between the release and the step-in) and the contact comes 0.30 to 0.36 s after the shot is asked or let go",
  [...SH, M.hold].filter(Boolean).map(m => ({case: m.name, gap: m.gap, actAt: m.actAt, relC: m.relC, vRel: m.vRel})));
check(ok && [...SH, M.hold].filter(Boolean).every(m => m.hipDip <= .25), "the plant's lunge, not a duck: the hips at most 0.25 m under their height in the case from the release to the contact (a metre's plant step and the clip's dip of about 0.07 on a lowered stance)",
  [...SH, M.hold].filter(Boolean).map(m => ({case: m.name, hipDip: m.hipDip})));
check(ok && SH.every(m => m.yawErr <= .2 && m.yawRate <= .2), "turned to the aim by the contact (within 0.2 rad), never faster than 0.2 rad a frame (12 rad/s, the clip's spin) on the way",
  pick("yawErr", "yawRate"));
check(ok && SH.every(m => m.stepIn && m.late == null), "SH-7 each is a step-in and its clip is not begun late", pick("stepIn", "tc", "late", "pre"));
check(ok && SH.every(m => m.stepLen >= .15), "SH-7 the plant step is drawn: the support foot carried 0.15 m or more onto the plant", pick("stepLen"));
check(ok && SH.every(m => inR(m.plant, -.23, -.17)), "SH-1 the plant foot comes down 0.17 to 0.23 s before the contact", pick("plant"));
// (from a stand; on the move, walked or run up, the trailing foot leaves as the body leaves it behind, rolled right up
// onto its toes, moves.js SHOT.PEEL: earlier, reported)
const STOOD = SH.filter(m => m.name === "stand" || m.name === "left" || m.name === "turn");
check(ok && STOOD.every(m => inR(m.toeOff, -.20, -.13)), "SH-1 from a stand, the kicking foot's toe leaves the grass 0.13 to 0.20 s before the contact (walked or run up, reported: the trailing foot leaves as the body leaves it)", pick("toeOff"));
check(ok && SH.every(m => inR(m.top, -.13, -.07) && inR(m.heel, .35, .65)), "SH-1 the top of the backswing 0.07 to 0.13 s before the contact, the heel 0.35 to 0.65 m up", pick("top", "heel", "knee"));
check(ok && SH.every(m => inR(m.lat, .28, .45) && inR(m.behind, 0, .2)), "SH-2 the plant foot at the contact 0.28 to 0.45 m to the support side of the ball's centre and 0 to 0.2 m behind it", pick("lat", "behind"));
check(ok && SH.every(m => m.laces <= .05 && m.pitch >= .6), "SH-3 at the contact the laces within 0.05 m of the ball's surface, the ankle pitched 0.6 rad or more toes down", pick("laces", "pitch"));
check(ok && SH.every(m => inR(m.ftTop, .75, 1.05) && inR(m.ftAt, .08, .16) && m.sweep >= .05), "SH-4 the follow-through's top 0.75 to 1.05 m up at 0.08 to 0.16 s, the foot on 0.05 m or more to the support side after it", pick("ftTop", "ftAt", "sweep"));
check(ok && SH.every(m => inR(m.land, .32, .44) && m.plantDownTo >= .2 - 1e-9 && m.flight <= .13 + 1e-9), "SH-5 the kicking foot down 0.32 to 0.44 s after the contact, the plant foot down until 0.2 s or later, any flight 0.13 s or less", pick("land", "plantDownTo", "flight"));
check(ok && SH.every(m => m.arm >= 1.3), "SH-6 the support arm 1.3 rad or more out from the trunk from the top of the backswing to the contact", pick("arm"));
check(ok && SH.every(m => inR(m.leanTop, .15, .3) && m.leanC <= .15 && inR(m.pitchLand, .5, .7)), "the body: the trunk leaning 0.15 to 0.3 rad to the support side at the top of the backswing (the clip's about 0.2), 0.15 or less at the contact, pitched 0.5 to 0.7 rad forward once landed (5.7)",
  pick("leanTop", "leanC", "pitchLand"));
check(ok && SH.every(m => m.nearest <= .12), "the kicking foot at the drawn ball at the contact (within 0.12 m of its surface)", pick("nearest"));
check(ok && SH.every(m => m.turn <= .35), "no bone turns more than 0.35 rad in a frame outside 0.12 s either side of the contact (the clip's entry and exit included)", pick("turn", "turnAt"));
check(ok && SH.every(m => m.slide <= .01), "the plant foot does not slide while it is down (10 mm)", pick("slide"));
const Hd = M.hold;
if (!process.env.FC27_CASES || process.env.FC27_CASES.split(",").includes("hold")) check(Hd && !Hd.err && Hd.fromHold && Hd.hop && Hd.stepLen >= .1 && Hd.nearest <= .12 && inR(Hd.land, .32, .44) && Hd.turn <= .35 &&
  inR(Hd.top, -.13, -.07) && inR(Hd.heel, .35, .65) && inR(Hd.ftTop, .75, 1.05) && inR(Hd.ftAt, .08, .16),
  "a shot let go from a held wind-up (the left button held 0.6 s): the support foot hops onto its plant, the cocked leg's full swing (the top of the backswing 0.07 to 0.13 s before the contact, the heel 0.35 to 0.65 m up, the follow-through's top 0.75 to 1.05 m up at 0.08 to 0.16 s), the foot meets the ball, down in time, no bone over 0.35 rad in a frame", Hd);

/* ---------- 6.4: the walked-up shot beside the clip's frames ---------- */
try {
  const W = cases.pics, dir = path.join(OUT, "fc27-shot-frames"), MW = W ? measure("pics", W, "R") : null;
  if (W && W.shots && W.shots.length && MW && !MW.err){
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    // the game's frame nearest each clip frame f246 to f266 (the contact f252.75: the drawn contact frame is f253)
    const jc = MW.jc, list = [];
    for (let fN = 246; fN <= 266; fN++){
      const j = jc + Math.round((fN - 253)*2);
      const s = W.shots.reduce((b, x) => Math.abs(x.j - j) < Math.abs(b.j - j) ? x : b, W.shots[0]);
      const g = path.join(dir, `g${fN}.jpg`); fs.writeFileSync(g, Buffer.from(s.url.split(",")[1], "base64")); list.push([fN, g]);
    }
    const args = ["-v", "error", "-y"], inputs = [];
    for (const [fN, g] of list){ inputs.push(g); if (fs.existsSync(path.join(FR, `f${fN}.png`))) inputs.push(path.join(FR, `f${fN}.png`)); }
    const clip = fs.existsSync(path.join(FR, "f250.png"));
    for (const x of inputs) args.push("-i", x);
    const n = list.length, parts = [];
    for (let i = 0; i < n; i++){
      const gi = clip ? 2*i : i;
      parts.push(`[${gi}:v]scale=180:320,drawtext=text='${list[i][0]}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6[g${i}]`);
      if (clip) parts.push(`[${gi + 1}:v]scale=180:320[c${i}]`);
    }
    const row = p => Array.from({length: n}, (_, i) => `[${p}${i}]`).join("");
    parts.push(`${row("g")}hstack=inputs=${n}[G]`);
    if (clip){ parts.push(`${row("c")}hstack=inputs=${n}[Cc]`); parts.push(`[Cc][G]vstack=inputs=2[out]`); }
    const outF = path.join(OUT, "fc27-shot-sbs.png");
    execFileSync("ffmpeg", [...args, "-filter_complex", parts.join(";"), "-map", clip ? "[out]" : "[G]", "-frames:v", "1", outF]);
    console.log(`6.4: ${outF}${clip ? " (the clip's f246 to f266 above, the game below)" : " (the game alone: the clip's frames are not on this machine)"}`);
  }
} catch(e){ console.log("6.4: the side-by-side could not be made: " + String(e.message || e).slice(0, 300)); }
process.exit(done() ? 0 : 1);
