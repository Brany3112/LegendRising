// qa/bcs-controls.mjs: (BCS) the better control system, the user's asks of 2026-10-19: in third person W A S D are a
// way on the screen and the body turns to run it at any speed, smooth like the FC 27 clip; V is gone; close control is
// automatic; and in a big turn the legs never cross (the user's crossed-legs frames). plan/notes/bcs-controls.md.
//
// Node part (the simulation a drill plays on, scen-team.js matchOf, with the real controls: control.js controlStep with
// the keys held, as training.js fixedItem steps them):
//   - a pass received: after the first touch you are in close control, no key
//   - a tackle by an opponent (the ball his) ends it ('lost')
//   - your own pass or shot is never taken back into it (AUTO.OWN_T), even with the ball still in reach
//   - a ball an opponent or a team-mate has at his feet is never taken, however near
// Browser part (Training, real keys under a real pointer lock, third person, the look held, the world stepped by hand
// at 1/60 s a frame: game time):
//   - A held: the body faces screen-left within 0.4 s and reaches the jog, then the run; A with Shift: 95% of the sprint
//     going left; S: the full run towards the camera, facing it; W+D: the diagonal; the look (P.yaw) never moved by it
//   - A to D at a run: it plants and reverses, no frame turns the body faster than the face rate, the planted feet stay
//     planted (their contact point, as uf-turnlib measures it)
//   - the legs in a 150 to 180 degree turn from a run towards the camera (with and without the ball), a turn from a
//     stand and the A to D reversal: each planted foot within TWIST of the pelvis, the shins never closer than SHIN, the
//     left ankle always left of the right across the pelvis (SIDE), each knee over its own foot (KNEE)
//   - V does nothing (no shoulder check, the look as it was) and no hint lists V; no hint says F takes control
//   - first person: the body faces the view, A a strafe
//   - walking onto a loose ball: close control with no key; Shift twice ends it ('knock') and with Shift held you chase
//     out of it, letting go of Shift on the ball takes it back; the middle button ends it ('flick')
//   - no console or page error
//
//   QA_PORT=95xx node qa/bcs-controls.mjs          exits 1 on any failed check; writes qa/out/bcs-controls.json
import fs from "node:fs";
import path from "node:path";
import {OUT, freeze} from "./lib.mjs";
import {trainLaunch, lockPointer, frames, titleReady, clickReal, hubUp} from "./tr4b-lib.mjs";
import {simStep} from "../js/life/football/sim.js";
import {startKick, AUTO} from "../js/life/football/actions.js";
import {setCtl} from "../js/life/football/rules.js";
import * as CT from "../js/life/football/control.js";
import {P} from "../js/life/core/state.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";

const res = {errors: [], node: {}, browser: {}};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };
const r2 = v => Math.round(v*100)/100, r3 = v => Math.round(v*1000)/1000;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// the legs' bounds: a planted foot's yaw off the pelvis's (rad); the two shins' closest centre lines (m); the left ankle
// left of the right across the pelvis (m); a bent knee's way off its own foot's (rad)
const TWIST = 1.05, SHIN = .06, SIDE = .02, KNEE = .6, SKATE = 12;
// BCS_PART=legs (or move, v, fp, ctl) runs only that part of the browser checks, and no Node part (all of it by default)
const PART = process.env.BCS_PART || "all", part = name => PART === "all" || PART === name;
// the legs' frames, row by row, for each turn measured (qa/out/bcs-controls-legs.json)
const legRows = {};

/* ---------- Node: the automatic close control, by the rules ---------- */
if (PART === "all"){
  const fwdOf = me => ({x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)});
  const go = (o = {}) => {
    const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3);
    const {ms} = matchOf(setup, spec, "train");
    ms.meAI = false;
    const me = ms.agents[ms.me];
    for (const a of ms.agents) if (a !== me) a.hold = true;
    const f = fwdOf(me), along = o.along != null ? o.along : .35;
    ms.ball.p.x = me.m.x + f.x*along; ms.ball.p.z = me.m.z + f.z*along; ms.ball.p.y = .11;
    ms.ball.v.x = f.x*(o.roll || 0); ms.ball.v.z = f.z*(o.roll || 0); ms.ball.v.y = 0;
    if (o.loose) ms.poss.ctl = -1; else if (o.mine !== false) ms.poss.ctl = me.id;
    CT.controlReset(); CT.CTRL.enabled = true; CT.saveSet({footCam: "third"});
    // (the look along your facing, as a drill starts you)
    P.yaw = me.m.yaw; P.pitch = -.15;
    return {ms, me, f};
  };
  const keys = k => { for (const c of "wasd") CT.CTRL.held[c] = k.includes(c); CT.CTRL.held.shift = k.includes("S"); };
  const step = (ms, me, n, k = "", each = null) => { keys(k); for (let i = 0; i < n; i++){ CT.controlStep(ms, me, H, {traits: {}, live: true}); simStep(ms, H); if (each) each(i); } keys(""); };
  // a pass received: a team-mate's ball rolling to you at 8 m/s from 12 m
  {
    const {ms, me, f} = go({along: 12, roll: -8, loose: true});
    const mate = ms.agents.find(a => a.team === me.team && a !== me && a.role === "player");
    ms.ball.last.agent = mate ? mate.id : -1; ms.ball.last.team = me.team; ms.ball.last.kind = "pass"; ms.ball.last.t = ms.t;
    let touchT = null, onT = null;
    step(ms, me, 150, "", () => { if (touchT == null && ms.events.some(e => e.kind === "touch" && e.how === "control" && e.agent === me.id)) touchT = ms.t; if (onT == null && me.ctlOn) onT = ms.t; });
    res.node.pass = {touchT, onT, ctl: !!me.ctlOn};
    check(touchT != null && onT != null && onT >= touchT && onT - touchT <= .5 && me.ctlOn, "a pass received: your first touch, then close control with no key (within 0.5 s of the touch)", res.node.pass);
    void f;
  }
  // an opponent takes it: put on the ball, his
  {
    const {ms, me} = go();
    step(ms, me, 30, "w");
    const on0 = !!me.ctlOn, opp = ms.agents.find(o => o.team !== me.team && o.role === "player" && o.onPitch);
    opp.m.x = ms.ball.p.x; opp.m.z = ms.ball.p.z; setCtl(ms, opp);
    step(ms, me, 1, "w");
    res.node.lost = {on0, on: !!me.ctlOn, end: me.ctlEnd};
    check(on0 && !me.ctlOn && me.ctlEnd === "lost", "the ball taken by an opponent (a tackle, a poke) ends close control ('lost')", res.node.lost);
  }
  // your own pass and shot, struck soft so they are still in your reach after the strike: never taken back
  for (const kind of ["pass", "shot"]){
    const {ms, me, f} = go();
    step(ms, me, 30);
    const on0 = !!me.ctlOn;
    startKick(ms, me, {kind, target: {x: me.m.x + f.x*3, y: kind === "shot" ? .3 : .11, z: me.m.z + f.z*3}, power: .05, speed: 1.6});
    let back = false, near = 0;
    step(ms, me, Math.round(AUTO.OWN_T/H) - 2, "", () => { if (me.ctlOn) back = true; if (Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) <= AUTO.REACH) near++; });
    res.node["own" + kind] = {on0, back, nearFrames: near, end: me.ctlEnd, kicks: ms.events.filter(e => e.kind === "kick" && e.agent === me.id).length};
    check(on0 && !back && near > 0, `your own ${kind}, still within reach after it: never taken back into close control (AUTO.OWN_T ${AUTO.OWN_T} s)`, res.node["own" + kind]);
  }
  // a ball an opponent or a team-mate has at his feet, 0.9 m from you, your controls on: never taken
  for (const whose of ["opponent", "team-mate"]){
    const {ms, me, f} = go({along: .9, mine: false});
    const o = ms.agents.find(a => (whose === "opponent" ? a.team !== me.team : a.team === me.team && a !== me) && a.role === "player" && a.onPitch);
    o.m.x = ms.ball.p.x + f.x*.3; o.m.z = ms.ball.p.z + f.z*.3; o.m.yaw = me.m.yaw + Math.PI; setCtl(ms, o);
    // (you cannot win it off him here: the race and the duels are not what is tested, only that close control never
    // takes a ball the race has not given you)
    me.noTouch = ms.t + 99;
    let on = false;
    step(ms, me, 90, "", () => { if (me.ctlOn) on = true; ms.ball.v.x = ms.ball.v.z = 0; });
    res.node[whose] = {on, poss: ms.poss.ctl === o.id ? "his" : ms.poss.ctl};
    check(!on, `a ball ${whose === "opponent" ? "an opponent" : "a team-mate"} has at his feet, 0.9 m from you: never taken into close control`, res.node[whose]);
  }
  CT.controlReset();
}

/* ---------- the browser: real keys, the look held, the world stepped by hand ---------- */
const t = await trainLaunch({seed: 6, gfx: "low", w: 960, h: 600});
const page = t.page;
try {
  await titleReady(page); await clickReal(page, ".ts-train"); await hubUp(page);
  await frames(page, 20);
  await page.evaluate(async () => {
    const R = window.__trainRun, C = await import("/js/life/football/control.js"), Hm = await import("/js/life/human.js"), Mv = await import("/js/life/mover.js");
    const L = window.__life, B = Hm.BONE;
    const S = window.__bcs = {C, cfg: null, rows: null};
    // the scenario: you at (x, z) facing yaw; the ball at your feet ("feet"), loose ahead ("ahead": along m), or far off
    const build = (cfg, env) => {
      const c = S.cfg, hx = env.spec.hx, hz = env.spec.hz, me = {slot: "ST", x: c.x(hx, hz), z: c.z(hx, hz), yaw: c.yaw};
      const f = {x: -Math.sin(me.yaw), z: -Math.cos(me.yaw)};
      const ball = c.ball === "feet" ? {x: me.x + .45*f.x, y: .11, z: me.z + .45*f.z, free: true} : c.ball === "ahead" ? {x: me.x + c.along*f.x, y: .11, z: me.z + c.along*f.z, free: true}
        : {x: me.x > 0 ? me.x - 30 : me.x + 30, y: .11, z: me.z > 0 ? me.z - 25 : me.z + 25, free: true};
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball};
    };
    R.registerScenario({id: "qa-bcs", category: "attacking", type: "qabcs", name: "Controls", desc: "A test scenario", build});
    S.start = cfg => {
      S.cfg = {x: new Function("hx", "hz", "return " + cfg.x), z: new Function("hx", "hz", "return " + cfg.z), yaw: cfg.yaw, ball: cfg.ball, along: cfg.along || 3};
      C.saveSet({footCam: cfg.cam || "third"});
      if (R.RUN.cur) R.stopScenario("hub");
      if (window.__trainHub && window.__trainHub.hubOpen()) window.__trainHub.closeHub();
      R.startScenario("qa-bcs", {});
    };
    S.T = () => R.RUN.cur && R.RUN.cur.T;
    const V3 = new (L.cam.position.constructor)(), Q = new (L.cam.quaternion.constructor)();
    const wp = (h, b, o) => { h.bones[b].getWorldPosition(V3); o[0] = V3.x; o[1] = V3.y; o[2] = V3.z; return o; };
    const fwd = (h, b) => { h.bones[b].getWorldQuaternion(Q); V3.set(0, 0, 1).applyQuaternion(Q); return Math.atan2(V3.x, V3.z); };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const segD = (p1, q1, p2, q2) => {
      const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]], d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]], r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
      const dot = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
      const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a*e - b*b;
      let s = den > 1e-9 ? Math.min(1, Math.max(0, (b*f - c*e)/den)) : 0, tt = (b*s + f)/e;
      if (tt < 0){ tt = 0; s = Math.min(1, Math.max(0, -c/a)); } else if (tt > 1){ tt = 1; s = Math.min(1, Math.max(0, (b - c)/a)); }
      return Math.hypot(r[0] + d1[0]*s - d2[0]*tt, r[1] + d1[1]*s - d2[1]*tt, r[2] + d1[2]*s - d2[2]*tt);
    };
    const J = {hip: [[0, 0, 0], [0, 0, 0]], knee: [[0, 0, 0], [0, 0, 0]], ank: [[0, 0, 0], [0, 0, 0]], pel: [0, 0, 0], heel: [0, 0, 0], ball: [0, 0, 0], tip: [0, 0, 0]};
    const pt = (h, b, x, y, z) => { V3.set(x, y, z).applyMatrix4(h.bones[b].matrixWorld); return [V3.x, V3.z]; };
    // one frame's legs: the pelvis's yaw, each foot (planted, its twist off the pelvis, its ankle across the pelvis, its
    // knee's way off its own, the heel, the ball of the foot and the toe tip on the ground), the shins' closest
    S.legs = () => {
      const T = S.T(), h = T.V.rec[T.me.id].h, G = h.gait;
      h.g.updateMatrixWorld(true);
      const py = fwd(h, B.hips); wp(h, B.hips, J.pel);
      const lx = Math.cos(py), lz = -Math.sin(py), out = {pel: py, feet: [], n: G.n, slips: G.slips};
      for (let s = 0; s < 2; s++){
        wp(h, s ? B.thR : B.thL, J.hip[s]); wp(h, s ? B.shR : B.shL, J.knee[s]); wp(h, s ? B.ftR : B.ftL, J.ank[s]);
        const fy = fwd(h, s ? B.ftR : B.ftL), hp = J.hip[s], kn = J.knee[s], an = J.ank[s];
        const ax = an[0] - hp[0], ay = an[1] - hp[1], az = an[2] - hp[2], al2 = ax*ax + ay*ay + az*az || 1, kx = kn[0] - hp[0], ky = kn[1] - hp[1], kz = kn[2] - hp[2], u = (kx*ax + ky*ay + kz*az)/al2;
        const ox = kx - ax*u, oz = kz - az*u, ol = Math.hypot(ox, oz);
        out.feet.push({d: G.feet[s].down ? 1 : 0, fp: [G.feet[s].x, G.feet[s].z], fk: G.feet[s].sw ? G.feet[s].sw.kind : null, via: G.via[s] ? 1 : 0, tw: wrap(fy - py), lat: (an[0] - J.pel[0])*lx + (an[2] - J.pel[2])*lz, kn: ol > .04 ? wrap(Math.atan2(ox, oz) - fy) : null,
          heel: pt(h, s ? B.ftR : B.ftL, 0, -.085, -.078), ball: pt(h, s ? B.toR : B.toL, 0, -.025, 0), tip: pt(h, s ? B.toR : B.toL, 0, -.02, .07)});
      }
      out.shin = segD(J.knee[0], J.ank[0], J.knee[1], J.ank[1]);
      // (the gait's own: its pelvis yaw, the root, the body's yaw, each swing's landing; and the ankles drawn)
      out.g = {pel: G.pel, rx: G.rx, rz: G.rz, ry: h.g.rotation.y, st: G.state, sty: G.style, tg: G.feet.map(f => f.down || !f.sw ? null : [f.sw.x1, f.sw.z1, f.sw.u]), ank: J.ank.map(a => [a[0], a[2]]), hip: [J.pel[0], J.pel[2]]};
      out.side = out.feet[0].lat - out.feet[1].lat;
      return out;
    };
    S.st = () => { const T = S.T(), me = T.me, ms = T.ms, b = ms.ball, I = me.intent;
      return {t: ms.t, x: me.m.x, z: me.m.z, yaw: me.m.yaw, head: me.m.heading, v: me.m.speed, gait: I.gait, face: !!I.face, look: L.P.yaw, on: !!me.ctlOn, end: me.ctlEnd || null,
        chase: !!me.ctlChase, mine: ms.poss.ctl === me.id, d: Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z), by: b.p.y,
        jog: Mv.gaitSpeed(me.prm, me.fac, "jog"), run: Mv.gaitSpeed(me.prm, me.fac, "run"), sprint: Mv.sprintSpeed(me.prm, me.fac), faceRate: me.prm.faceRate, turnRate: me.prm.turnFirstRate || 0}; };
    // n frames of 1/60 s, a row each (the legs as asked)
    S.run = (n, legs) => { const rows = []; for (let i = 0; i < n; i++){ L.stepN(1, 1/60); const r = S.st(); if (legs) r.legs = S.legs(); rows.push(r); } return rows; };
    // (frames until the ball is his and at his feet, AUTO.REACH: a chase at a sprint plays it on with the strides, so "on
    // the ball" is a moment, not a stretch; at most maxN frames)
    S.runNear = (maxN, reach) => { const rows = []; for (let i = 0; i < maxN; i++){ L.stepN(1, 1/60); const r = S.st(); rows.push(r); if (r.d < reach && r.mine) break; } return rows; };
    S.hints = () => { const T = S.T(); return C.hintsFor(T.ms, T.me).map(x => x.key + " " + x.verb); };
  });
  const begin = async (cfg, look) => {
    await page.evaluate(cfg => window.__bcs.start(cfg), cfg);
    await page.waitForFunction(() => !!(window.__bcs.T() && window.__bcs.T().V), null, {timeout: 60000});
    await page.evaluate(look => { const P = window.__life.P; P.yaw = look; P.pitch = -.15; window.__life.stepN(20, 1/60); P.yaw = look; }, look);
  };
  const run = (n, legs = false) => page.evaluate(([n, legs]) => window.__bcs.run(n, legs), [n, legs]);
  const keys = async (down, up = []) => { for (const k of up) await page.keyboard.up(k); for (const k of down) await page.keyboard.down(k); };
  const LOOK = -Math.PI/2;                       // the look down the pitch at +x: W +x, S -x, A -z, D +z
  const YAW = {w: LOOK, s: LOOK + Math.PI, a: LOOK + Math.PI/2, d: LOOK - Math.PI/2, wd: LOOK - Math.PI/4};
  // the legs over rows: worst twist of a planted foot, closest shins, least side, worst knee, worst skate (mm) per stance
  // (key: the rows kept under it in legRows; skateAt: the foot and the rows of the stance that slid most)
  const legStats = (rows, key) => {
    let tw = 0, shin = 9, side = 9, kn = 0, knVia = 0, skate = 0, at = null;
    const S = [null, null];
    const h2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const end = (s, i) => { if (S[s].sum > skate){ skate = S[s].sum; at = {foot: s ? "right" : "left", rows: [S[s].i0, i]}; } S[s] = null; };
    rows.forEach((r, i) => {
      const L = r.legs; if (!L) return;
      shin = Math.min(shin, L.shin); side = Math.min(side, L.side);
      L.feet.forEach((f, s) => {
        if (f.d) tw = Math.max(tw, Math.abs(f.tw));
        if (f.kn != null) { if (f.via) knVia = Math.max(knVia, Math.abs(f.kn)); else kn = Math.max(kn, Math.abs(f.kn)); }
        if (f.d){ if (!S[s]) S[s] = {heel: f.heel, ball: f.ball, tip: f.tip, sum: 0, i0: i}; else { S[s].sum += Math.min(h2(S[s].heel, f.heel), h2(S[s].ball, f.ball), h2(S[s].tip, f.tip)); S[s].heel = f.heel; S[s].ball = f.ball; S[s].tip = f.tip; } }
        else if (S[s]) end(s, i - 1);
      });
    });
    for (let s = 0; s < 2; s++) if (S[s]) end(s, rows.length - 1);
    if (key) legRows[key] = rows.map(x => ({t: r3(x.t), v: r2(x.v), yaw: r3(x.yaw), legs: x.legs}));
    return {twist: r3(tw), shin: r3(shin), side: r3(side), knee: r3(kn), kneeTouch: r3(knVia), skateMm: r2(skate*1000), skateAt: at};
  };
  const legsOk = (name, m, side = SIDE) => check(m.twist <= TWIST && m.shin >= SHIN && m.side >= side && m.knee <= KNEE && m.skateMm <= SKATE,
    `${name}: the legs never cross (planted feet within ${TWIST} rad of the pelvis, shins ${SHIN} m apart or more, the left ankle left of the right by ${side} m or more, knees within ${KNEE} rad of their feet, planted feet slide ${SKATE} mm at most)`, m);

  await begin({x: "-hx + 30", z: "hz - 5", yaw: LOOK, ball: "far"}, LOOK);
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  await freeze(page);
  /* ---------- the ways, the ladder, the look untouched ---------- */
  if (part("move")){
    await keys(["a"]); const r = await run(150); await keys([], ["a"]);
    const faced = r.find(x => Math.abs(wrap(x.yaw - YAW.a)) < .15), s = r[r.length - 1];
    const jogAt = r.find(x => x.v >= .95*x.jog), runAt = r.find(x => x.v >= .95*x.run);
    res.browser.a = {facedAt: faced ? r2(faced.t - r[0].t + 1/60) : null, jogAt: jogAt ? r2(jogAt.t - r[0].t) : null, runAt: runAt ? r2(runAt.t - r[0].t) : null, v: r2(s.v), yaw: r2(s.yaw), look: r3(s.look), face: s.face};
    check(faced && faced.t - r[0].t + 1/60 <= .4, "A held from a stand: the body faces screen-left within 0.4 s", res.browser.a);
    check(jogAt && runAt && runAt.t > jogAt.t && Math.abs(wrap(s.yaw - YAW.a)) < .05 && s.gait === "run", "A held: the jog, then the run, going left (the ladder in every way)", res.browser.a);
    check(Math.abs(s.look - LOOK) < 1e-9 && !s.face, "A held: the look never moved by it, and the facing is free (no held face)", res.browser.a);
  }
  if (part("move")){
    await begin({x: "-hx + 30", z: "hz - 4", yaw: LOOK, ball: "far"}, LOOK);
    await keys(["a", "Shift"]); const r = await run(270); await keys([], ["Shift", "a"]);
    const vmax = Math.max(...r.map(x => x.v)), s = r[r.length - 1];
    res.browser.aShift = {vmax: r2(vmax), sprint: r2(s.sprint), yaw: r2(s.yaw), look: r3(s.look)};
    check(vmax >= .95*s.sprint && Math.abs(wrap(s.yaw - YAW.a)) < .05 && Math.abs(s.look - LOOK) < 1e-9, "A with Shift: at least 95% of the sprint going left, the look unchanged", res.browser.aShift);
  }
  if (part("move")){
    await begin({x: "-hx + 40", z: "0", yaw: LOOK, ball: "far"}, LOOK);
    await keys(["s"]); const r = await run(180); await keys([], ["s"]);
    const s = r[r.length - 1];
    res.browser.s = {v: r2(s.v), run: r2(s.run), yaw: r2(s.yaw), gait: s.gait};
    check(s.v >= .97*s.run && Math.abs(wrap(s.yaw - YAW.s)) < .05, "S held: the full run towards the camera, the body facing it", res.browser.s);
  }
  if (part("move")){
    await begin({x: "-hx + 30", z: "-hz + 12", yaw: LOOK, ball: "far"}, LOOK);
    await keys(["w", "d"]); const r = await run(120); await keys([], ["d", "w"]);
    const s = r[r.length - 1];
    res.browser.wd = {v: r2(s.v), yaw: r2(s.yaw), want: r2(YAW.wd)};
    check(s.v >= .95*s.run && Math.abs(wrap(s.yaw - YAW.wd)) < .05, "W+D: the diagonal, forward and right of the camera, at the run", res.browser.wd);
  }
  /* ---------- the legs on a straight run (the bounds' own baseline: no turn, the gait as it runs) ---------- */
  if (part("legs")){
    await begin({x: "-hx + 20", z: "0", yaw: LOOK, ball: "far"}, LOOK);
    await keys(["w"]); await run(90); const r = await run(90, true); await keys([], ["w"]);
    const m = legStats(r, "straight"); res.browser.straight = Object.assign(m, {v: r2(r[r.length - 1].v)});
    legsOk("a straight run (W held)", m);
  }
  /* ---------- A to D at a run: the reversal, and its legs ---------- */
  if (part("legs")){
    await begin({x: "-hx + 30", z: "hz - 4", yaw: LOOK, ball: "far"}, LOOK);
    await keys(["a"]); const r1 = await run(120, true); await keys(["d"], ["a"]); const r2_ = await run(150, true); await keys([], ["d"]);
    let rate = 0; for (let i = 1; i < r2_.length; i++) rate = Math.max(rate, Math.abs(wrap(r2_[i].yaw - r2_[i - 1].yaw))*60);
    const s = r2_[r2_.length - 1], vmin = Math.min(...r2_.map(x => x.v));
    res.browser.ad = {v0: r2(r1[r1.length - 1].v), vmin: r2(vmin), v: r2(s.v), yaw: r2(s.yaw), maxTurn: r2(rate), faceRate: s.faceRate, turnRate: s.turnRate};
    check(r1[r1.length - 1].v >= .95*s.run && vmin < .5*s.run && s.v >= .9*s.run && Math.abs(wrap(s.yaw - YAW.d)) < .05, "A then D at a run: it plants (slows below half the run) and goes the other way at the run", res.browser.ad);
    check(rate <= Math.max(s.faceRate, s.turnRate) + .05, "A then D: no frame turns the body faster than the face rate allows", res.browser.ad);
    const m = legStats(r2_, "ad"); res.browser.adLegs = m;
    legsOk("A then D at a run", m);
  }
  /* ---------- the user's turn: running at the camera, then back to goal and right (150 to 180 degrees) ---------- */
  if (part("legs")) for (const ball of ["feet", "far"]){
    await begin({x: "hx - 14", z: "-1", yaw: LOOK + Math.PI, ball}, LOOK);
    await keys(["s"]); await run(40, true); await keys(["w", "d"], ["s"]); const r = await run(90, true); await keys([], ["d", "w"]);
    const m = legStats(r, "turn-" + ball); res.browser["turn-" + ball] = Object.assign(m, {v: r2(r[r.length - 1].v), yaw: r2(r[r.length - 1].yaw)});
    legsOk(`running at the camera then W+D (a 135 to 180 degree turn), ${ball === "feet" ? "with the ball" : "without it"}`, m);
  }
  // from a stand facing the camera: W+D
  if (part("legs")){
    await begin({x: "hx - 14", z: "-1", yaw: LOOK + Math.PI, ball: "feet"}, LOOK);
    await run(10, true);
    await keys(["w", "d"]); const r = await run(90, true); await keys([], ["d", "w"]);
    const m = legStats(r, "standTurn"); res.browser.standTurn = Object.assign(m, {yaw: r2(r[r.length - 1].yaw)});
    // (on the spot the bound is that the feet never cross, 0: a third of a turn in 0.16 s (TURN_RATE 13) is one step,
    // and the stepping foot comes down level with the planted one for a frame; pushed further out it went back against
    // the way of travel in a life start, which tr2-startstop forbids)
    legsOk("a turn from a stand (facing the camera, then W+D)", m, 0);
    check(Math.abs(wrap(r[r.length - 1].yaw - YAW.wd)) < .1, "a turn from a stand: the body turns round to run the keys' way", res.browser.standTurn);
  }
  /* ---------- V: nothing; the hints ---------- */
  if (part("v")){
    await begin({x: "-hx + 30", z: "0", yaw: LOOK, ball: "feet"}, LOOK);
    const y0 = await page.evaluate(() => window.__life.P.yaw);
    await page.keyboard.down("v"); await run(20); await page.keyboard.up("v"); await run(20);
    const v = await page.evaluate(() => ({look: window.__life.P.yaw, scan: window.__bcs.C.CTRL.scan, life: document.body.className, hints: window.__bcs.hints()}));
    const hints = [v.hints];
    // and the hints elsewhere: a loose ball near, nothing near, defending
    hints.push(await page.evaluate(() => { const T = window.__bcs.T(); T.ms.poss.ctl = -1; T.me.ctlOn = false; T.ms.ball.p.x = T.me.m.x + 1.5; T.ms.ball.p.z = T.me.m.z; window.__bcs.C.contextOf(T.ms, T.me); return window.__bcs.hints(); }));
    res.browser.v = {dLook: v.look - y0, scan: v.scan === undefined ? "none" : v.scan, hints};
    check(v.look === y0 && v.scan === undefined, "V held and let go: nothing (no shoulder check), the look as it was", res.browser.v);
    check(hints.flat().every(h => !/^V /.test(h) && !/take control/.test(h) && !/shoulder/.test(h)), "no hint lists V or says F takes control", hints);
  }
  /* ---------- first person: the body faces the view ---------- */
  if (part("fp")){
    await begin({x: "-hx + 30", z: "hz - 5", yaw: LOOK, ball: "far", cam: "first"}, LOOK);
    await keys(["a"]); const r = await run(90); await keys([], ["a"]);
    const s = r[r.length - 1], off = Math.max(...r.map(x => Math.abs(wrap(x.yaw - LOOK))));
    res.browser.fp = {off: r3(off), v: r2(s.v), face: s.face, vmax: r2(Math.max(...r.map(x => x.v)))};
    check(off < .02 && s.face && res.browser.fp.vmax <= 4.05, "first person: A held is a strafe, the body facing the view (strafe cap 4.0 m/s)", res.browser.fp);
  }
  /* ---------- close control, automatic ---------- */
  if (part("ctl")){
    await begin({x: "-hx + 25", z: "0", yaw: LOOK, ball: "ahead", along: 3}, LOOK);
    await keys(["w"]); const r = await run(120); await keys([], ["w"]);
    const on = r.find(x => x.on);
    res.browser.walkOn = {onAt: on ? r2(on.t - r[0].t) : null, d: on ? r2(on.d) : null};
    const keeps = await page.evaluate(() => { const T = window.__bcs.T(); return T.ms.events.filter(e => e.kind === "touch" && e.keep && e.agent === T.me.id).length; });
    res.browser.walkOn.keeps = keeps;
    check(on && keeps >= 1, "walking onto a loose ball: in close control with no key, its touches on", res.browser.walkOn);
  }
  if (part("ctl")){
    await begin({x: "-hx + 20", z: "0", yaw: LOOK, ball: "feet"}, LOOK);
    // (up to a sprint with the ball first: the chase stays out of close control at a sprint, AUTO.RUN_K of the run or
    // more; below that, with the ball at his feet, he is in it again by the rules, Shift held or not)
    await keys(["w", "Shift"]); await run(90); await keys([], ["Shift"]);
    const on0 = (await run(1))[0].on;
    // (Shift twice back to back, then held: the knock-on and the chase at a sprint. A double tap is measured on the wall
    // clock, KNOCK_TAP s, and on a loaded machine the two real presses can land further apart than that: the game was
    // not asked for a knock then, so the taps are tried again, at most 4 times, before the chase is measured)
    let r = [], kn = null, tries = 0;
    while (!kn && tries < 4){
      tries++;
      await page.keyboard.press("Shift"); await page.keyboard.press("Shift"); await page.keyboard.down("Shift");
      r = await run(20);
      kn = r.find(x => x.end === "knock");
      // (the chase, two seconds at a sprint, then on until the ball is at his feet again: Shift let go there)
      if (kn) r = r.concat(await run(120), await page.evaluate(([n, reach]) => window.__bcs.runNear(n, reach), [180, AUTO.REACH]));
      else { await keys([], ["Shift"]); await run(10); }
    }
    // (the chase measured from the knock on)
    const rk = kn ? r.slice(r.indexOf(kn)) : r;
    const chase = rk.filter(x => x.chase), back = rk.some(x => x.on);
    const near = rk.filter(x => x.d < AUTO.REACH && x.mine).length;
    await keys([], ["Shift"]); const r2_ = await run(90); await keys([], ["w"]);
    const again = r2_.find(x => x.on);
    res.browser.knock = {on0, knock: !!kn, tries, chaseFrames: chase.length, nearFrames: near, backWhileShift: back, againAt: again ? r2(again.t - r2_[0].t) : null,
      atRelease: {d: r2(r2_[0].d), v: r2(r2_[0].v), mine: r2_[0].mine, chase: r2_[0].chase}, after: r2_.filter((x, i) => i % 15 === 0).map(x => ({d: r2(x.d), v: r2(x.v), mine: x.mine, chase: x.chase, gait: x.gait}))};
    check(on0 && kn && !back, "Shift twice: close control ends ('knock'), and while you chase with Shift held you stay out of it", res.browser.knock);
    check(near > 0 && again && again.t - r2_[0].t <= 1, "on the ball with Shift held, then letting go of Shift: in close control again", res.browser.knock);
  }
  if (part("ctl")){
    await begin({x: "-hx + 20", z: "0", yaw: LOOK, ball: "feet"}, LOOK);
    await run(40);
    const on0 = (await run(1))[0].on;
    await page.mouse.down({button: "middle"}); await run(8); await page.mouse.up({button: "middle"}); const r = await run(30);
    res.browser.flick = {on0, end: r[r.length - 1].end, flicks: await page.evaluate(() => { const T = window.__bcs.T(); return T.ms.events.filter(e => e.kind === "touch" && e.how === "flick").length; })};
    check(on0 && res.browser.flick.end === "flick" && res.browser.flick.flicks === 1, "the middle button: the flick ends close control ('flick')", res.browser.flick);
  }
  check(!t.errors.length && !page.errors.length, "no console or page error", (t.errors || page.errors || []).slice(0, 5));
} finally { await t.close(); }
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "bcs-controls.json"), JSON.stringify(res, null, 1));
fs.writeFileSync(path.join(OUT, "bcs-controls-legs.json"), JSON.stringify(legRows));
console.log(res.errors.length ? `bcs-controls: ${res.errors.length} failed` : "bcs-controls: all checks pass");
process.exit(res.errors.length ? 1 : 0);
