// qa/tr2b-anim.mjs: the control, shield and tackle animations follow the simulation's contact (BUILD-PLAN Phase 2b,
// P2b-B acceptance "tr2b-anim"; TRAINING-SPEC section 3: the tackling foot IK-guided to the real contact point, the
// receive animation by the real ball height, the shield's pose).
// Owner: P2b-B (TR-2b).
//
// In the real match (__fp.enter("test:stamina"), the real simulation, the bodies posed by view.js and moves.js as in
// play), with tackles and receives set up by script:
//   - standing tackles and pokes from the front and either side: at the clip's contact the tackling foot (its inside,
//     the toe for a poke) is within 0.12 m of the contact point (act.contact, the simulation's);
//   - the tackling leg is the one on the ball's side of the tackler (act.side, and the side the ball is on);
//   - a slide carries the act's own speed (the clip's v0 is the act's) and its foot is within 0.12 m of the contact too;
//   - receives at the foot, thigh and chest heights: the receive clip starts with the ball inside the control radius
//     (zone.js R, for the ball where it is met) and its part is the one zone.js part gives for the real height;
//   - a contact sheet of the shield pose (third person from three sides, and first person), the controls at each
//     height, the standing and sliding tackle (qa/out/tr2b-anim-*.png).
//
//   QA_PORT=8851 node qa/tr2b-anim.mjs        exits 1 on any failed check; writes qa/out/tr2b-anim.json
import {launch, career, freeze, snap} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr2b-anim");
const {page, close} = await launch({gfx: "low", seed: 7, w: 960, h: 600});
let ok = false;
const ONLY = process.env.ONLY || "";
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  await page.evaluate(async () => {
    const L = window.__life, F = window.__fp;
    const A = await import("./js/life/football/actions.js"), Z = await import("./js/life/football/zone.js"), MV = await import("./js/life/moves.js");
    const THREE = (await import("./vendor/three.module.js"));
    window.__t = {A, Z, MV, THREE,
      // (the cover the fixture comes up under is taken away at once: a covered screen poses nobody, sched.js T4)
      enter(name, o){ if (F.state) F.exit(); F.enter("test:" + name, o || {}); const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } L.FADE.v = 0; L.stepN(2); return F.ms; },
      put(a, x, z, yaw){ a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.target = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.onPitch = true; },
      ball(ms, x, z, vx = 0, vz = 0, y = .11, vy = 0){ const b = ms.ball; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = vx; b.v.y = vy; b.v.z = vz; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = y <= .12; A.refreshPred(ms); },
      // a third-person camera on a world point (the match camera puts itself back on the next frame)
      look(px, pz, ox, oy, oz, ty = .8){ const c = L.cam; c.position.set(px + ox, oy, pz + oz); c.lookAt(px, ty, pz); c.updateMatrixWorld(true); },
      draw(){ L.renderer().render(L.scene(), L.cam); },
      yawTo: (dx, dz) => Math.atan2(-dx, -dz)
    };
  });

  // ---- 1. standing tackles and pokes: the foot on the contact point, the leg on the ball's side
  if (!ONLY || ONLY.includes("tackle")){
    const T1 = await page.evaluate(one => {
      const T = window.__t, out = [];
      const cases = one ? [["stand", .35]] : [["stand", .1], ["stand", .35], ["stand", -.35], ["poke", -.1], ["poke", .3], ["stand", .55], ["poke", -.45], ["stand", -.5]];
      for (const [sub, lat] of cases){
        const ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
        const def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
        // you on the ball at (-10, 0) facing +x; the defender in front of you, a little to one side of the ball
        T.put(me, -10, 0, -Math.PI/2); T.ball(ms, -9.35, 0);
        ms.poss.ctl = me.id; ms.poss.team = me.team;
        T.put(def, -8.35, lat, Math.PI/2);
        def.brain.next = ms.t + 5;
        L.stepN(2);
        // (square on to you, facing -x: the ball is on his right when he stands to its +z side, on his left to its -z)
        def.m.yaw = def.m.heading = Math.PI/2; def.m.vx = def.m.vz = def.m.speed = 0;
        const act = T.A.startAction(ms, def, {kind: "tackle", sub, target: me.id});
        if (!act){ out.push({sub, lat, error: "no act"}); continue; }
        const V = F.FS.V, R = V.rec[def.id];
        let at = null, clipSide = null, n = 0;
        // the ball's side of the tackler as the tackle starts (his facing)
        const f = {x: -Math.sin(def.m.yaw), z: -Math.cos(def.m.yaw)}, b = ms.ball.p, latB = (b.x - def.m.x)*-f.z + (b.z - def.m.z)*f.x;
        while (n++ < 90){
          L.stepN(1);
          const C = R.h.mv;
          (window.__dbg = window.__dbg || []).push([n, JSON.stringify(T.MV.clipOf(R.h)), typeof R.h.mv, C && C.key, C && +C.tau.toFixed(2), C && C.contactDone, R.clip && R.clip.mode, def.act && def.act.kind, R.h.mode]);
          if (R.clip && R.clip.mode === "tackle") clipSide = R.clip.side;
          if (C && C.key === "tackle" && C.contactDone && !at){
            const part = sub === "poke" ? "toe" : "inside", side = R.clip ? R.clip.side : "R";
            const p = T.MV.partPoint(R.h, part, side), c = act.contact || R.clip.target;
            const rr = R.clip ? R.clip.reach : 1, cd = Math.hypot(c.x - R.h.g.position.x, c.z - R.h.g.position.z), aim = {x: R.h.g.position.x + (c.x - R.h.g.position.x)*Math.min(1, rr/(cd || 1)), z: R.h.g.position.z + (c.z - R.h.g.position.z)*Math.min(1, rr/(cd || 1))};
            at = {reachGap: +Math.hypot(p.x - aim.x, p.z - aim.z).toFixed(3), d: Math.hypot(p.x - c.x, p.y - (c.y != null ? c.y : .11), p.z - c.z), dh: Math.hypot(p.x - c.x, p.z - c.z), tau: C.tau, reachErr: C.reachErr, p: [p.x, p.y, p.z].map(v => +v.toFixed(3)), c: [c.x, c.y, c.z].map(v => +(+v || 0).toFixed(3))};
          }
          if (!def.act) break;
        }
        out.push({sub, lat, at, clipSide, actSide: act.side || null, ballSide: latB >= 0 ? "R" : "L", outcome: act.outcome || (act.out && act.out.result), reach: R.clip ? R.clip.reach : null});
      }
      return out;
    }, !!process.env.ONE);
    console.log(JSON.stringify(T1));
    for (const r of T1){
      // (a tackle that meets nothing has no contact: its point is only where it was aimed, past the reach; the foot then
      // goes as far as the reach allows toward it)
      if (r.outcome === "miss" && r.at && r.at.dh > .12){ check(r.at.reachGap != null && r.at.reachGap <= .12, `${r.sub} tackle, defender ${r.lat} m across (a miss): the foot goes out to the reach toward the aim`, r.at); continue; }
      check(r.at && r.at.d <= .12, `${r.sub} tackle, defender ${r.lat} m across: the tackling foot is within 0.12 m of the contact point at contact`, r.at);
      check(r.clipSide && r.clipSide === (r.actSide || r.ballSide), `${r.sub} tackle, defender ${r.lat} m across: the tackling leg is on the ball's side`, {clip: r.clipSide, act: r.actSide, ball: r.ballSide});
    }
  }
  // ---- 1b. slides: the clip runs at the act's own carried speed, and the tackling foot comes onto the contact
  if (!ONLY || ONLY.includes("slide")){
    const T2 = await page.evaluate(() => {
      const T = window.__t, out = [];
      for (const [run, lat] of [[6.5, .2], [5, -.2], [7.5, .3]]){
        const ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
        const def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
        T.put(me, -10, 0, -Math.PI/2); T.ball(ms, -9.35, 0);
        ms.poss.ctl = me.id; ms.poss.team = me.team;
        T.put(def, -9.35 + .38*run, lat, Math.PI/2); def.brain.next = ms.t + 5;
        L.stepN(1);
        def.m.yaw = def.m.heading = Math.PI/2; def.m.vx = -run; def.m.vz = 0; def.m.speed = run;
        const act = T.A.startAction(ms, def, {kind: "slide", target: me.id});
        if (!act){ out.push({run, error: "no act"}); continue; }
        const V = F.FS.V, R = V.rec[def.id];
        let at = null;
        for (let n = 0; n < 150 && def.act; n++){
          L.stepN(1);
          const C = R.h.mv;
          if (C && C.key === "tackle" && C.contactDone && !at && R.clip){
            const p = T.MV.partPoint(R.h, "laces", R.clip.side), c = act.contact || R.clip.target;
            const hp = T.MV.partPoint(R.h, "chest");
            at = {d: +Math.hypot(p.x - c.x, p.z - c.z).toFixed(3), y: +p.y.toFixed(3), foot: [p.x, p.z].map(v => +v.toFixed(2)), c: [c.x, c.z].map(v => +v.toFixed(2)), body: [def.m.x, def.m.z].map(v => +v.toFixed(2)), chest: [hp.x, hp.z].map(v => +v.toFixed(2)), tau: +C.tau.toFixed(2), t: +def.act.t.toFixed(2), tc: act.tc, side: R.clip.side};
          }
        }
        out.push({run, v0: act.v0, clipV0: R.clip ? R.clip.v0 : null, lastClip: R.h.mv && R.h.mv.key, outcome: act.outcome, at, dur: act.dur});
      }
      return out;
    });
    for (const r of T2){
      check(r.v0 > 0 && Math.abs((r.clipV0 || 0) - r.v0) < 1e-9, `slide at ${r.run} m/s: the clip runs at the act's own speed`, {act: r.v0, clip: r.clipV0});
      check(r.at && r.at.d <= .12, `slide at ${r.run} m/s (${r.outcome}): the tackling foot is within 0.12 m of the contact point at the contact`, r.at);
    }
    check(T2.length > 1 && T2[0].v0 > T2[1].v0, "a faster run-in gives a faster slide", T2.map(r => r.v0));
  }

  // ---- 2. receives at the foot, the thigh and the chest: the clip starts inside R, with the part for the real height
  if (!ONLY || ONLY.includes("receive")){
    const seen = new Set();
    for (const [want, y] of [["foot", .11], ["foot", .3], ["thigh", .65], ["thigh", .85], ["chest", 1.15], ["chest", 1.3]]){
      const r = await page.evaluate(([want, y, snapIt]) => {
        const T = window.__t, ms = T.enter("receive"), F = window.__fp, me = F.me(), L = window.__life;
        const mate = ms.agents[5];
        for (const a of ms.agents) if (a !== me && a.role === "player" && !a.isGK) a.onPitch = false;
        T.put(me, 0, 0, Math.PI/2); L.P.yaw = Math.PI/2; L.P.pitch = -.3;
        // the ball from 7 m, coming down to the height wanted as it reaches you (up and back to that height over its
        // flight: its own drag apart, the same height it left at)
        const D = 7, v = 9, t = D/v, vy = y > .2 ? .5*9.81*t : 0;
        T.ball(ms, -D, 0, v, 0, y, vy);
        ms.ball.last.agent = mate.id; ms.ball.last.team = me.team; ms.ball.last.t = ms.t; ms.poss.ctl = -1; ms.poss.team = me.team;
        const V = F.FS.V, R = V.rec[me.id];
        // (your whole body posed as it is seen from outside, for the contact sheet: a replay's view of you)
        if (snapIt){ V.fpOn = false; if (V.fp) V.fp.g.visible = false; }
        // (a clip left from the fixture's own set-up, the ball put at your feet on the centre spot, is not this one)
        if (R.clip && R.clip.mode === "receive") R.clip = null;
        let got = null;
        for (let n = 0; n < 120 && !got; n++){
          L.stepN(1);
          if (R.clip && R.clip.mode === "receive") got = {part: R.clip.part, zpart: R.clip.zpart, d: R.clip.dStart, r: R.clip.rStart, y: R.clip.ball.y, tc: R.clip.tc, zp: T.Z.part(R.clip.ball.y, me.scale || 1)};
        }
        return {want, y0: y, got};
      }, [want, y, y === .11 || y === .65 || y === 1.15]);
      const g = r.got;
      check(g && g.d <= g.r + 1e-9, `receive at ${r.y0} m: the clip starts with the ball inside the control radius`, g);
      const fits = g && (g.zp === "foot" ? g.part === "inside" || g.part === "sole" : g.part === g.zp);
      if (g) seen.add(g.zp);
      check(!!fits && g.zpart === g.zp, `receive at ${r.y0} m: the part (${g ? g.part : "none"}) is the one for the real height (${g ? g.zp : "?"} at ${g ? g.y.toFixed(2) : "?"} m)`, g);
      if (g && (r.y0 === .11 || r.y0 === .65 || r.y0 === 1.15)){
        // the control at this height, at the moment of the touch, from beside
        await page.evaluate(() => {
          const T = window.__t, F = window.__fp, L = window.__life, me = F.me(), V = F.FS.V, R = V.rec[me.id];
          // (to the touch: the ball at its nearest to you, the part on it)
          const b = F.ms.ball; let last = Infinity;
          for (let n = 0; n < 60; n++){ V.fpOn = false; L.stepN(1); const d = Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z); if (d > last + 1e-3 || F.ms.poss.ctl === me.id) break; last = d; }
          V.fpOn = false;
          R.h.g.visible = true; if (V.fp) V.fp.g.visible = false;
          const g = R.h.g.position; T.look(g.x, g.z, .5, 1.2, 3.0, .7); T.draw();
          return {fpOn: V.fpOn, hidden: R.hidden, vis: R.h.g.visible, mode: R.h.mode, g: [g.x, g.y, g.z], me: [me.m.x, me.m.z], inScene: !!R.h.g.parent, mv: R.h.mv && R.h.mv.key};
        }).then(d => console.log("recvsnap", JSON.stringify(d)));
        await snap(page, `tr2b-anim-receive-${g.zp}`);
      }
    }

    check(seen.has("foot") && seen.has("thigh") && seen.has("chest"), "receives were met with the foot, the thigh and the chest", [...seen]);
  }

  // ---- 3. the shield pose: you on the ball, a man behind you, C held (the real key path, the router's events)
  if (!ONLY || ONLY.includes("shield")){
    const r = await page.evaluate(() => {
      const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
      const def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
      T.put(me, -10, 0, -Math.PI/2); T.ball(ms, -9.4, 0); L.P.yaw = -Math.PI/2;
      ms.poss.ctl = me.id; ms.poss.team = me.team;
      // (he stays at your back, a little out of contact, while the pose is looked at: put there every frame)
      def.cool.tackle = ms.t + 99;
      F.input({type: "keydown", key: "c"});
      for (let i = 0; i < 40; i++){ T.put(def, me.m.x - 1.25, me.m.z + .1, -Math.PI/2); L.stepN(1); }
      window.__hold = () => T.put(def, me.m.x - 1.25, me.m.z + .1, -Math.PI/2);
      const V = F.FS.V, R = V.rec[me.id], fp = V.fp;
      const inEyes = {g: fp && fp.upper ? fp.upper.g : null, w: fp && fp.upper ? +fp.upper.w.toFixed(2) : 0};
      // (your whole body is posed in full only while it is to be seen: from outside, as a replay shows it)
      V.fpOn = false; for (let i = 0; i < 20; i++){ window.__hold(); L.stepN(1); }
      return {shield: !!me.intent.shield, upper: R.h.upper ? R.h.upper.g : null, w: R.h.upper ? +R.h.upper.w.toFixed(2) : 0, inEyes};
    });
    check(r.shield && r.upper === "shield" && r.w > .9, "holding C on the ball: your body takes the shield's pose (upper:shield)", r);
    check(r.inEyes.g === "shield" && r.inEyes.w > .9, "and the body in your eyes too", r.inEyes);
    for (const [nm, ox, oz] of [["side", .3, 3.0], ["back", 3.0, .2], ["front", -3.0, .4]]){
      await page.evaluate(([ox, oz]) => {
        const T = window.__t, F = window.__fp, L = window.__life, me = F.me(), V = F.FS.V, R = V.rec[me.id];
        V.fpOn = false; window.__hold(); L.stepN(1); R.h.g.visible = true; if (V.fp) V.fp.g.visible = false;
        const g = R.h.g.position; T.look(g.x, g.z, ox, 1.3, oz, .8); T.draw();
      }, [ox, oz]);
      await snap(page, `tr2b-anim-shield-${nm}`);
    }
    // in your eyes: looking down at the ball, the arms out at the edges of the view
    await page.evaluate(() => { const F = window.__fp, L = window.__life, V = F.FS.V; V.fpOn = true; L.P.pitch = -.6; for (let i = 0; i < 3; i++){ window.__hold(); L.stepN(1); } window.__t.draw(); });
    await snap(page, "tr2b-anim-shield-fp");
    await page.evaluate(() => window.__fp.input({type: "keyup", key: "c"}));
  }

  // ---- the contact sheets: a standing tackle, a poke and a slide at the contact, from the side and in front
  if (!ONLY || ONLY.includes("sheet")){
    for (const [sub, lat, run] of [["stand", .3, 0], ["poke", 0, 0], ["slide", .2, 6.5]]){
      const r = await page.evaluate(([sub, lat, run]) => {
        const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
        const def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
        T.put(me, -10, 0, -Math.PI/2); T.ball(ms, -9.35, 0);
        ms.poss.ctl = me.id; ms.poss.team = me.team;
        if (run){ T.put(def, -9.35 + .38*run, lat, Math.PI/2); def.m.vx = -run; def.m.speed = run; }
        else T.put(def, -8.4, lat, T.yawTo(-1, -lat*.5));
        def.brain.next = ms.t + 5;
        L.stepN(1);
        const act = T.A.startAction(ms, def, {kind: sub === "slide" ? "slide" : "tackle", sub, target: me.id});
        const V = F.FS.V, R = V.rec[def.id];
        for (let n = 0; n < 90; n++){ L.stepN(1); const C = R.h.mv; if (C && C.key === "tackle" && C.contactDone) break; }
        V.fpOn = false; R.h.g.visible = true; if (V.fp) V.fp.g.visible = false;
        const g = R.h.g.position;
        window.__sheet = {x: g.x, z: g.z};
        T.look(g.x, g.z, .2, 1.1, 3.2, .5); T.draw();
        return {act: !!act, x: g.x, z: g.z, mode: R.h.mode};
      }, [sub, lat, run]);
      await snap(page, `tr2b-anim-${sub}-side`);
      await page.evaluate(() => { const T = window.__t, s = window.__sheet; T.look(s.x, s.z, -3, 1.3, .4, .5); T.draw(); });
      await snap(page, `tr2b-anim-${sub}-front`);
      console.log("sheet", sub, JSON.stringify(r));
    }
  }
  // ---- the same in your own eyes: your standing tackle and your slide on a man on the ball, your chest control
  if (!ONLY || ONLY.includes("sheet")){
    for (const kind of ["stand", "slide"]){
      await page.evaluate(kind => {
        const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
        const c = ms.agents.find(a => a.team !== me.team && a.slot === "ST");
        // him on the ball at (-10, 0) facing -x; you coming at him from +x
        T.put(c, -10, 0, Math.PI/2); T.ball(ms, -10.6, .1);
        ms.poss.ctl = c.id; ms.poss.team = c.team; c.brain.next = ms.t + 9; c.cool.tackle = ms.t + 9;
        const run = kind === "slide" ? 6.5 : 0;
        T.put(me, kind === "slide" ? -10.6 + .38*run : -9.4, -.15, Math.PI/2); L.P.yaw = Math.PI/2; L.P.pitch = -.55;
        if (run){ me.m.vx = -run; me.m.speed = run; }
        L.stepN(1);
        T.A.startAction(ms, me, kind === "slide" ? {kind: "slide", target: c.id} : {kind: "tackle", sub: "stand", target: c.id});
        const V = F.FS.V, R = V.rec[me.id];
        for (let n = 0; n < 90; n++){ L.stepN(1); const C = V.fp && V.fp.mv; if (C && C.key === "tackle" && C.contactDone) break; }
        T.draw();
        return {fpOn: V.fpOn, hidden: R.hidden, vis: R.h.g.visible, owner: L.camera.top && L.camera.top(), cam: [L.cam.position.x, L.cam.position.y, L.cam.position.z].map(v => +v.toFixed(2)), me: [me.m.x, me.m.z].map(v => +v.toFixed(2)), fpVis: V.fp && V.fp.g.visible};
      }, kind).then(r => console.log("fp", kind, JSON.stringify(r)));
      await snap(page, `tr2b-anim-${kind}-fp`);
    }
    await page.evaluate(() => {
      const T = window.__t, ms = T.enter("receive"), F = window.__fp, me = F.me(), L = window.__life;
      for (const a of ms.agents) if (a !== me && a.role === "player" && !a.isGK) a.onPitch = false;
      T.put(me, 0, 0, Math.PI/2); L.P.yaw = Math.PI/2; L.P.pitch = -.25;
      const D = 7, v = 9, t = D/v; T.ball(ms, -D, 0, v, 0, 1.15, .5*9.81*t);
      const V = F.FS.V;
      for (let n = 0; n < 120; n++){ L.stepN(1); const C = V.fp && V.fp.mv; if (C && C.key === "receive" && C.contactDone) break; }
      T.draw();
    });
    await snap(page, "tr2b-anim-receive-chest-fp");
  }
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
