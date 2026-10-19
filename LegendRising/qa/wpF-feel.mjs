// qa/wpF-feel.mjs: the feel addendum (ADDENDUM A1.1 to A1.5) on the real modules and the real simulation.
// Owner: WP-F (Stage P2). Contracts DESIGN 1.4.16, 1.5.9, 1.5.10; addendum A1.1 (stats that drive movement), A1.2
// (speed you can feel), A1.3 (fatigue you can see), A1.5 (the action resolver, slow motion).
//
//   - Sprint Speed sets top speed: about 7.2 m/s at 40, about 9.4 m/s at 99; Acceleration sets the approach: 90% of
//     top speed in about 1.6 s at 90, about 3 s at 30; the old single pace (both at the same value) keeps the WP-0D
//     bands (0 to 95% of sprint speed at pace 50 in 2.3 to 2.7 s);
//   - Agility: a sharp cut costs less speed and the body turns faster with high agility;
//   - Ball Control: the dribble's touch runs further ahead at 40 than at 90 (about 1.4 m against 0.6 m);
//   - every agent of a match carries its own Acceleration, Sprint Speed, Agility and Ball Control, and they differ;
//   - speedFx: nothing under 80% of your own top speed but the sway, +5 degrees of view and the speed lines at 100%;
//     the vignette under 40 breath, its pulse under 20; a motion setting of 0 turns every speed effect off;
//   - slow motion: the same fixed steps, a third as many a real second; the match is the same match;
//   - the resolver: a ball dropping in front is volleyed, one to the side is side-volleyed, one at head height is
//     headed, a low ball in front at a stretch is met with a diving header: each ends in a real kick event, not a whiff.
//
//   QA_PORT=8770 node qa/wpF-feel.mjs        exits 1 on any failed check; writes qa/out/wpF-feel.json
import {launch, career, freeze} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpF-feel");
const {page, close} = await launch({gfx: "low", seed: 7});
let ok = false;
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);

  // ---- 1. the mover, from its own module (the one every agent and you run on)
  const M = await page.evaluate(async () => {
    const mv = await import("./js/life/mover.js"), {FRESH} = await import("./js/life/stamina.js");
    const run = (sk, secs = 6) => {
      const prm = mv.moverParams(sk, "football"), m = mv.createMover({x: 0, z: 0, yaw: -Math.PI/2});
      const it = {dx: 1, dz: 0, gait: "sprint", speedCap: Infinity, face: {x: 1, z: 0}};
      let t90 = null, t95 = null, top = 0;
      for (let i = 1; i <= secs*60; i++){
        mv.moverStep(m, it, prm, FRESH, 1/60);
        top = Math.max(top, m.speed);
      }
      const m2 = mv.createMover({x: 0, z: 0, yaw: -Math.PI/2});
      for (let i = 1; i <= secs*60; i++){
        mv.moverStep(m2, it, prm, FRESH, 1/60);
        if (t90 == null && m2.speed >= .9*top) t90 = i/60;
        if (t95 == null && m2.speed >= .95*top) t95 = i/60;
      }
      return {top, t90, t95, sprint: prm.sprint};
    };
    // a sharp cut: full speed along +x, then the way asked turns through 90 degrees; the lowest speed kept and the time
    // the facing takes to come round
    const cut = sk => {
      const prm = mv.moverParams(sk, "football"), m = mv.createMover({x: 0, z: 0, yaw: -Math.PI/2});
      const it = {dx: 1, dz: 0, gait: "run", speedCap: Infinity, face: null};
      for (let i = 0; i < 300; i++) mv.moverStep(m, it, prm, FRESH, 1/60);
      const v0 = m.speed; let vmin = v0, turned = null;
      it.dx = 0; it.dz = 1;
      for (let i = 1; i <= 120; i++){
        mv.moverStep(m, it, prm, FRESH, 1/60);
        vmin = Math.min(vmin, m.speed);
        if (turned == null && Math.abs(Math.atan2(Math.sin(m.yaw - Math.PI), Math.cos(m.yaw - Math.PI))) < .1) turned = i/60;
      }
      return {loss: 1 - vmin/v0, turned};
    };
    return {
      spr40: run({sprintSpeed: 40, acceleration: 50, agility: 50}), spr99: run({sprintSpeed: 99, acceleration: 50, agility: 50}),
      acc90: run({sprintSpeed: 70, acceleration: 90, agility: 50}), acc30: run({sprintSpeed: 70, acceleration: 30, agility: 50}),
      pace50: run({pace: 50, dribbling: 50}),
      ag90: cut({sprintSpeed: 70, acceleration: 70, agility: 90}), ag30: cut({sprintSpeed: 70, acceleration: 70, agility: 30})
    };
  });
  check(Math.abs(M.spr40.top - 7.2) <= .3 && Math.abs(M.spr99.top - 9.4) <= .3, "Sprint Speed sets top speed: about 7.2 m/s at 40, 9.4 m/s at 99",
    {at40: +M.spr40.top.toFixed(2), at99: +M.spr99.top.toFixed(2)});
  check(M.acc90.t90 >= 1.3 && M.acc90.t90 <= 1.9 && M.acc30.t90 >= 2.6 && M.acc30.t90 <= 3.4, "Acceleration: 90% of top speed in about 1.6 s at 90, about 3 s at 30",
    {at90: M.acc90.t90, at30: M.acc30.t90});
  check(M.pace50.t95 >= 2.3 && M.pace50.t95 <= 2.7, "the old single pace keeps the WP-0D band: 0 to 95% of sprint speed at pace 50 in 2.3 to 2.7 s", M.pace50.t95);
  check(M.ag90.loss < M.ag30.loss && M.ag90.loss >= .3 && M.ag30.loss <= .6 && M.ag90.turned < M.ag30.turned,
    "Agility: a sharp cut costs less speed and the body comes round sooner with high agility (in the 35 to 55% band)", M);

  await page.evaluate(() => {
    const L = window.__life, F = window.__fp;
    window.__t = {
      enter(name, o){ if (F.state) F.exit(); F.enter("test:" + name, o || {}); L.stepN(2); return F.ms; },
      key(k, down){ F.input({type: down ? "keydown" : "keyup", key: k}); },
      btn(b, down){ F.input({type: down ? "down" : "up", button: b}); },
      steps(n){ for (let i = 0; i < n; i++) L.stepN(1); }
    };
  });

  // ---- 2. Ball Control: the dribble touch's lead at 2 m/s from touch.js (the one touch model), and in the match the
  // ball runs further ahead of a jogging dribbler at 40 than at 90
  const D = await page.evaluate(async () => {
    const {dribbleTouch} = await import("./js/life/football/touch.js");
    let seed = 7; const r = () => (seed = (seed*1103515245 + 12345) % 2147483648)/2147483648;
    const lead = ctrl => {
      let s = 0;
      for (let i = 0; i < 40; i++){
        const ag = {m: {x: 0, z: 0, yaw: -Math.PI/2}, at: {dribbling: 70, ctrl}, foot: "R"};
        s += dribbleTouch(ag, {p: {x: .6, y: .11, z: 0}}, {x: 1, z: 0}, 2, {drib: 70, ctrl}, r).lead;
      }
      return s/40;
    };
    const T = window.__t, sim = {};
    for (const ctrl of [40, 90]){
      const ms = T.enter("dribble"), F = window.__fp, me = F.me(), L = window.__life;
      me.at.ctrl = ctrl;
      L.P.yaw = -Math.PI/2;
      T.key("w", true);
      T.steps(60);
      let sum = 0, n = 0;
      for (let i = 0; i < 360; i++){
        T.steps(1);
        const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)};
        sum += (ms.ball.p.x - me.m.x)*f.x + (ms.ball.p.z - me.m.z)*f.z; n++;
      }
      T.key("w", false);
      sim[ctrl] = {meanAhead: +(sum/n).toFixed(3), kept: ms.poss.ctl === me.id};
    }
    return {lead40: +lead(40).toFixed(3), lead90: +lead(90).toFixed(3), sim};
  });
  check(Math.abs(D.lead40 - 1.4) <= .25 && Math.abs(D.lead90 - .6) <= .2 && D.sim[40].meanAhead > D.sim[90].meanAhead + .2 && D.sim[90].kept,
    "Ball Control: the dribble's touch runs about 1.4 m ahead at 40 and about 0.6 m at 90 (at 2 m/s), and further ahead in the match at 40", D);

  // ---- 3. every agent its own movement stats
  const A = await page.evaluate(() => {
    const ms = window.__t.enter("receive"), keys = ["acceleration", "sprintSpeed", "agility", "ctrl"];
    const vals = Object.fromEntries(keys.map(k => [k, new Set(ms.agents.filter(a => a.role === "player").map(a => a.at[k]))]));
    const vmax = new Set(ms.agents.filter(a => a.role === "player").map(a => Math.round(a.prm.vmax*100)));
    return {distinct: Object.fromEntries(keys.map(k => [k, vals[k].size])), vmax: vmax.size, missing: keys.filter(k => [...vals[k]].some(v => !Number.isFinite(v)))};
  });
  check(A.missing.length === 0 && A.distinct.acceleration > 3 && A.distinct.sprintSpeed > 3 && A.distinct.agility > 3 && A.distinct.ctrl > 3 && A.vmax > 3,
    "every agent carries its own Acceleration, Sprint Speed, Agility and Ball Control, and they differ", A);

  // ---- 4. speed and breath you can feel: the one implementation
  const X = await page.evaluate(async () => {
    const {speedFx} = await import("./js/life/football/matchcam.js");
    const fx = sh => { const o = {share: sh, fov: 0, lines: 0, sway: 0, vig: 0, pulse: 0, heavy: 0, wind: 0, top: 0, topT: 0, beat: 0, desat: 0}; return speedFx(sh, 100, 1, 0, o); };
    const br = (B, k) => { const o = {share: 0, fov: 0, lines: 0, sway: 0, vig: 0, pulse: 0, heavy: 0, wind: 0, top: 0, topT: 0, beat: .25, desat: 0}; return speedFx(0, B, 1, k, o); };
    const off = {share: 1, fov: 0, lines: 0, sway: 0, vig: 0, pulse: 0, heavy: 0, wind: 0, top: 0, topT: 0, beat: 0, desat: 0}; speedFx(1, 100, 0, 0, off);
    const ramp = [.5, .7, .8, .85, .9, .95, 1].map(s => { const f = fx(s); return {s, fov: +f.fov.toFixed(2), lines: +f.lines.toFixed(2), sway: +f.sway.toFixed(2)}; });
    return {ramp, b50: br(50, 0).vig, b30: br(30, 0).vig, b10: br(10, 0), off: {fov: off.fov, lines: off.lines, sway: off.sway, wind: off.wind}};
  });
  const at = s => X.ramp.find(r => r.s === s);
  check(at(.7).fov === 0 && at(.8).fov === 0 && at(1).fov >= 4.5 && at(1).fov <= 5.5 && at(.9).fov > 0 && at(.9).fov < at(1).fov,
    "the view widens by about 5 degrees over the last 20% of your own top speed, ramping in", X.ramp);
  check(at(.85).lines === 0 && at(.95).lines > 0 && at(1).lines === 1 && at(.5).sway < at(1).sway, "speed lines above 85% of top speed, strongest at 100%; the sway rises with speed", X.ramp);
  check(X.b50 === 0 && X.b30 > 0 && X.b10.vig > X.b30 && X.b10.pulse > 0 && X.b10.desat > 0, "a soft vignette under 40 breath, darker, pulsing and a little grey under 20",
    {b50: X.b50, b30: X.b30, b10: {vig: X.b10.vig, pulse: X.b10.pulse, desat: X.b10.desat}});
  check(X.off.fov === 0 && X.off.lines === 0 && X.off.sway === 0 && X.off.wind === 0, "Camera motion and effects at 0% turns every speed effect off", X.off);

  // ---- 5. slow motion: the same steps, fewer a real second, the same match
  const SM = await page.evaluate(() => {
    const T = window.__t, F = window.__fp;
    const play = slow => {
      const ms = T.enter("receive", {seed: 5});
      startPass(ms);
      if (slow) F.FP.slowMo(.33, 1);
      const s0 = ms.step;
      T.steps(60);
      const perSec = ms.step - s0;
      while (ms.step < s0 + 150) T.steps(1);
      return {perSec, at: [ms.ball.p.x, ms.ball.p.y, ms.ball.p.z].map(v => +v.toFixed(6)), step: ms.step};
    };
    function startPass(ms){ ms.poss.ctl = ms.agents[5].id; }
    const a = play(false), b = play(true);
    return {normal: a, slow: b, same: a.step === b.step && a.at.join() === b.at.join()};
  });
  check(SM.slow.perSec >= 18 && SM.slow.perSec <= 22 && SM.normal.perSec === 60 && SM.same,
    "slow motion runs a third of the fixed steps a real second and plays the same match", SM);

  // ---- 6. the resolver, end to end: a ball dropping in front, to the side, at head height, low at a stretch
  const R = await page.evaluate(() => {
    const T = window.__t, F = window.__fp, L = window.__life, out = {};
    const g = 9.81;
    // a ball from (sx, sz) arriving at height h at (tx, tz) after T s (the drag makes it a little short: the resolver
    // reads the real prediction, so nothing is assumed)
    const lob = (ms, sx, sz, tx, tz, h, Tt) => {
      const b = ms.ball;
      b.p.x = sx; b.p.y = .5; b.p.z = sz;
      b.v.x = (tx - sx)/Tt*1.04; b.v.z = (tz - sz)/Tt*1.04; b.v.y = (h - .5 + g*Tt*Tt/2)/Tt;
      b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = false; b.holder = -1;
      ms.poss.ctl = -1; ms.poss.team = -1;
      ms.predAt = -1e9;                     // (the shared path is worked out again on the next step)
    };
    const setup = (seed, run = false) => {
      const ms = T.enter("stamina", {seed}), me = F.me();
      // (you alone with your own keeper: nobody to cut the ball out before it reaches you)
      for (const a of ms.agents) if (a !== me && a.role === "player") a.onPitch = a.isGK && a.team === me.team;
      const dir = ms.dirs[me.team], gx = dir*ms.spec.hx;
      me.m.x = me.x0 = gx - dir*(run ? 34 : 16); me.m.z = me.z0 = 0; me.m.vx = me.m.vz = me.m.speed = 0;
      L.P.yaw = me.m.yaw = me.m.heading = dir > 0 ? -Math.PI/2 : Math.PI/2;
      ms.ball.p.x = 0; ms.ball.p.z = 30; ms.ball.v.x = ms.ball.v.z = 0; ms.poss.ctl = -1;
      return {ms, me, dir};
    };
    const trial = (name, o) => {
      const {ms, me, dir} = setup(o.seed, !!o.run);
      if (o.run){ T.key("w", true); T.key("shift", false); T.steps(70); }
      const f = {x: dir, z: 0}, side = {x: 0, z: dir};
      const tx = me.m.x + f.x*(o.ahead + (o.run ? me.m.speed*o.T : 0)) + side.x*o.lat, tz = me.m.z + f.z*o.ahead + side.z*o.lat;
      lob(ms, tx - f.x*o.from - side.x*o.fromLat, tz - side.z*o.fromLat - f.z*o.from, tx, tz, o.h, o.T);
      const from = ms.events.length;
      // LMB is pressed as the strike is offered and let go as the ball arrives (the timing ring's moment); Space is
      // tapped as the header is offered
      let pressed = false, released = false, seen = new Set(), kind = null;
      const trace = [];
      for (let i = 0; i < 150; i++){
        T.steps(1);
        const Rz = F.ctrl.resolve;
        if (Rz) seen.add(Rz.kind);
        if (i % 3 === 0) trace.push([i, Rz && Rz.kind, Rz && +Rz.tc.toFixed(2), +ms.ball.p.y.toFixed(2), +Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z).toFixed(2), me.act && me.act.kind]);
        if (!pressed && Rz && Rz.kind === o.want && Rz.tc <= o.press){
          kind = Rz.kind; pressed = true;
          if (o.key){ T.key(o.key, true); T.key(o.key, false); released = true; }
          else T.btn(0, true);
          continue;
        }
        if (pressed && !released && (!Rz || Rz.tc <= o.release || Rz.kind !== o.want)){ T.btn(0, false); released = true; }
        if (released && ms.events.some(e => e.id >= from && e.kind === "kick" && e.agent === me.id)) break;
      }
      if (!released) T.btn(0, false);
      if (o.run) T.key("w", false);
      T.steps(10);
      const ev = ms.events.find(e => e.id >= from && e.kind === "kick" && e.agent === me.id);
      out[name] = {kind, seen: [...seen], ev: ev ? {intent: ev.intent, whiff: !!ev.whiff, speed: ev.speed, scuff: !!ev.scuff} : null, act: me.act ? me.act.kind : null, trace: ev && !ev.whiff ? undefined : trace, evs: ms.events.slice(from).map(e => [e.kind, e.agent, +e.t.toFixed(2), e.intent || e.how || ""]).slice(0, 12)};
    };
    trial("volley", {seed: 21, want: "volley", ahead: .7, lat: 0, h: .8, T: .9, from: -6, fromLat: -7, press: .55, release: .2});
    trial("sidevolley", {seed: 22, want: "sidevolley", ahead: .2, lat: .8, h: .75, T: .9, from: 0, fromLat: -12, press: .55, release: .2});
    trial("header", {seed: 23, want: "header", ahead: .3, lat: 0, h: 1.75, T: 1.0, from: -10, fromLat: 0, press: .6, key: "space"});
    trial("divingHeader", {seed: 24, want: "divingHeader", ahead: 1.8, lat: 0, h: .7, T: .8, from: -10, fromLat: -2, press: .5, key: "space", run: true});
    return out;
  });
  for (const k of ["volley", "sidevolley", "header", "divingHeader"]){
    const r = R[k];
    check(r.kind === k && r.ev && !r.ev.whiff && r.ev.speed > 3, `the resolver offers the ${k === "sidevolley" ? "side volley" : k === "divingHeader" ? "diving header" : k} and it ends in a real strike`, r);
  }
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
