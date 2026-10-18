// qa/wpD3-windup.mjs: the held backswing in the strike clip (DESIGN 2.7, the hook queue's "held-backswing state in the
// moves.js strike clip, and the charge passed to view.js fpPose" row, deferred to P3; addendum A1.7 "power is the
// visible wind-up: hold to draw the kicking leg back in view").
// Owner: WP-D3 (Stage P3a). Contracts 1.4.18 (moves.js, the 'strike' mode), 3.5.7 (strikes), 3.5.9 (first person, no
// automatic camera pitch: D22), 4.2 (no bone turns more than 0.35 rad between frames; planted feet never move).
//
// On bodies of the WP-K kit (a bare page, qa/wpK-lib.mjs), posed by human.js through moves.js exactly as view.js poses
// your agent (windHold gives the state, the strike clip holds it):
//   1. the charge filling over 0.85 s cocks the kicking leg: the knee comes up in front by more than 10 cm and the
//      boot is drawn back behind the knee by more than 10 cm, both sides, a shot more than a pass; held past full the
//      chest leans back; nothing fires while it is held (no contact, no end);
//   2. the support foot does not move while it is planted, and no bone turns more than 0.35 rad in a frame (60 Hz,
//      tier T0) from locomotion into the hold, through it and out of it into the strike;
//   3. let go: the strike is a clip of its own (a new id) from the held pose, its contact on the requested time within
//      1 ms, the striking face at the ball;
//   4. walking with it held, the support foot re-steps under the body and does not slide while it is down; above
//      WIND.V windHold gives nothing and windUpper the upper body's wind-up, on the stride's legs;
//   4b. let go without a strike (the charge dropped standing, dropped into a jog, held while speeding up past the
//      line, standing at tier T1) and the striking foot changing in the middle of it: no bone turns more than 0.35 rad
//      in a frame from the hold until locomotion has the legs again (the cocked leg is let down in the clip, never put
//      onto a footprint in one frame); standing, it is put down over several frames (the kicking foot moves no more
//      than 0.15 m in one, and the clip still has the body when it is down), and a change of foot puts one leg down
//      before the other comes up (no frame over 0.25 rad);
//   5. the in-game path (with view.js passing the charge, the hook this package asks for): your agent in a training
//      drill winding up is posed by the held clip in your eyes and in third person (skipped, and said so, while view.js
//      does not call windHold);
//   6. contact sheets of the wind-up from the side, the front, behind and through the eyes (qa/out/wpD3-windup-*.png),
//      and a third-person picture of it in game (qa/out/wpD3-windup-game-tp.png).
//
//   QA_PORT=8831 node qa/wpD3-windup.mjs        exits 1 on any failed check; writes qa/out/wpD3-windup.json
import fs from "node:fs";
import path from "node:path";
import {openKit, savePng, OUT} from "./wpK-lib.mjs";

const res = {name: "wpD3-windup", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const K = await openKit();
try {
  const r = await K.page.evaluate(async () => {
    const {H, M, THREE} = K;
    const dt = 1/60, out = {};
    const at = (h, i) => { h.g.updateMatrixWorld(true); return h.bones[i].getWorldPosition(new THREE.Vector3()); };
    // the boot's place along the facing relative to the knee (+ ahead), the knee's height
    const leg = (h, side) => {
      const kn = at(h, side === "L" ? H.BONE.shL : H.BONE.shR), ft = at(h, side === "L" ? H.BONE.ftL : H.BONE.ftR), ry = h.g.rotation.y;
      const fx = Math.sin(ry), fz = Math.cos(ry);
      return {back: (ft.x - kn.x)*fx + (ft.z - kn.z)*fz, kneeY: kn.y, kneeAhead: (kn.x - h.g.position.x)*fx + (kn.z - h.g.position.z)*fz};
    };
    const chest = h => { const c = at(h, H.BONE.head), hp = at(h, H.BONE.hips), ry = h.g.rotation.y; return (c.x - hp.x)*Math.sin(ry) + (c.z - hp.z)*Math.cos(ry); };
    K.clear();
    for (const side of ["R", "L"]) for (const kind of ["shot", "pass"]){
      const h = K.body("footballer", side === "R" ? 3 : 4);
      h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      for (let i = 0; i < 30; i++) H.animateHuman(h, dt, "idle");
      const l0 = leg(h, side), c0 = chest(h);
      const wind = {p: 0, over: 0, side, kind}, rec = {};
      let prevQ = K.boneQ(h), jump = 0, fired = 0, sup0 = null, supDrift = 0;
      const supB = side === "L" ? H.BONE.ftR : H.BONE.ftL;
      let full = null;
      for (let f = 0; f < 120; f++){
        const t = f*dt;
        wind.p = 1 - Math.pow(1 - Math.min(1, t/.85), 2); wind.over = Math.max(0, Math.min(1, (t - .85)/.6));
        const st = M.windHold(wind, 0, rec) || "idle";
        const e = H.animateHuman(h, dt, st, {tier: 0});
        M.moveEvents(h, st);
        if (e.mask & (8 | 64)) fired++;
        const j = K.boneJump(h, prevQ); if (j.m > jump) rec.jat = [f, j.at]; jump = Math.max(jump, j.m); prevQ = K.boneQ(h);
        const sp = at(h, supB);
        if (f > 12){ if (!sup0) sup0 = sp.clone(); supDrift = Math.max(supDrift, sp.distanceTo(sup0)); }
        if (f === 60) full = {leg: leg(h, side), chest: chest(h)};
      }
      const over = chest(h);
      // let go: a strike clip of its own, contact 0.15 s on, at a ball in front of the striking foot
      const s = side === "L" ? 1 : -1, ry = h.g.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
      const ball = {x: h.g.position.x + fx*.55 + fz*s*.12, y: .11, z: h.g.position.z + fz*.55 - fx*s*.12};
      const st2 = {mode: "strike", kind: kind === "pass" ? "side" : "instep", side, ball, dir: {x: fx, z: fz}, power: .8, tc: .15, id: "release-" + side + kind};
      const T0 = h.mv ? h.mv.lastT : 0;
      let got = null, T = 0, jumpS = 0, reach = null;
      while (T < .6){
        let d = dt;
        if (got == null && T < .15 - 1e-9 && T + d > .15) d = .15 - T;
        st2.tc = Math.max(0, .15 - (T + d));
        const e = H.animateHuman(h, d, st2, {tier: 0});
        M.moveEvents(h, st2);
        T += d;
        if ((e.mask & 8) && got == null){ got = T; const pt = M.partPoint(h, M.KINDS[st2.kind].part, side); reach = pt.distanceTo(new THREE.Vector3(ball.x, ball.y, ball.z)); }
        if (d === dt){ const j = K.boneJump(h, prevQ); if (j.m > jumpS) rec.jsat = [+T.toFixed(3), j.at]; jumpS = Math.max(jumpS, j.m); }
        prevQ = K.boneQ(h);
      }
      out[side + kind] = {l0, full: full.leg, kneeUp: full.leg.kneeY - l0.kneeY, back: full.leg.back, lean: full.chest - over, fired, jump, supDrift, contactAt: got, reach, jumpS, jat: rec.jat, jsat: rec.jsat};
      K.clear();
    }
    // walking with it held: the support foot re-steps under the body and never slides while down
    {
      const h = K.body("footballer", 5);
      let x = 0; h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      for (let i = 0; i < 30; i++) H.animateHuman(h, dt, "idle");
      // walking first (the gait's own steps), then the charge held on the walk
      for (let i = 0; i < 40; i++){ x += .9*dt*Math.min(1, i/15); h.g.position.x = x; H.animateHuman(h, dt, {mode: "move", speed: .9*Math.min(1, i/15)}, {tier: 0}); }
      const wind = {p: .8, over: 0, side: "R", kind: "shot"}, rec = {};
      let prevQ = K.boneQ(h), jump = 0, slide = 0, steps = 0, wasDown = true, down0 = null;
      for (let f = 0; f < 150; f++){
        x += .9*dt; h.g.position.x = x;
        const st = M.windHold(wind, .9, rec);
        H.animateHuman(h, dt, st, {tier: 0});
        const j = K.boneJump(h, prevQ); if (j.m > jump) rec.jat = [f, j.at, h.mv.data.step ? "step" : ""]; jump = Math.max(jump, j.m); prevQ = K.boneQ(h);
        const F = h.mv.feet[0], down = F.down;
        const p = at(h, H.BONE.ftL);
        // (from its first re-step on: the hand-over from the walk's own footing is the blend's)
        if (down && wasDown && down0 && steps) slide = Math.max(slide, Math.hypot(p.x - down0.x, p.z - down0.z));
        if (down && !wasDown) steps++;
        if (down && !wasDown || !down0) down0 = p.clone();
        if (!down) down0 = null;
        wasDown = down;
      }
      out.walk = {jump, slide, steps, gone: x, jat: rec.jat};
      const run = M.windHold(wind, 4, {}), up = M.windUpper(wind, 4, {});
      // the upper body on the run: posed over a jog without trouble
      let prevQ2 = K.boneQ(h), jumpR = 0;
      for (let f = 0; f < 60; f++){ x += 4*dt; h.g.position.x = x; H.animateHuman(h, dt, {mode: "move", speed: 4, upper: up}, {tier: 0}); const j = K.boneJump(h, prevQ2); if (f > 20) jumpR = Math.max(jumpR, j.m); prevQ2 = K.boneQ(h); }
      out.run = {hold: run, upper: up && {g: up.g, w: up.w}, layer: h.upper.w, jumpR};
      K.clear();
    }
    // let go without a strike: the hold, then the charge dropped (or the speed over the line with it held), until well
    // after locomotion has the legs again
    const exit = (speedAfter, tier, cancel) => {
      K.clear();
      const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      const loco = {mode: "move", speed: 0};
      for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier});
      const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {}, up = {};
      for (let f = 0; f < 60; f++){ wind.p = Math.min(1, f/50); H.animateHuman(h, dt, M.windHold(wind, 0, rec, dt) || loco, {tier}); }
      let x = 0, prevQ = K.boneQ(h), foot = at(h, H.BONE.ftR), jump = 0, jat = null, footMax = 0, held = 0;
      for (let f = 0; f < 40; f++){
        const v = speedAfter*Math.min(1, (f + 1)/6);
        x += v*dt; h.g.position.x = x;
        if (cancel) wind.p = 0;
        let st = M.windHold(wind, v, rec, dt);
        if (st) held++;
        else { loco.speed = v; loco.upper = M.windUpper(wind, v, up); st = loco; }
        H.animateHuman(h, dt, st, {tier});
        const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
        if (j.m > jump){ jump = j.m; jat = [f, j.at, st.mode]; }
        const fp = at(h, H.BONE.ftR); footMax = Math.max(footMax, fp.distanceTo(foot) - v*dt); foot = fp;
      }
      K.clear();
      return {jump: +jump.toFixed(3), jat, foot: +footMax.toFixed(3), held};
    };
    out.exits = {standing: exit(0, 0, true), intoJog: exit(2.5, 0, true), heldRun: exit(3.5, 0, false), standingT1: exit(0, 1, true)};
    // the striking foot changing in the middle of it (control.js footNow follows the ball across)
    {
      const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      for (let i = 0; i < 40; i++) H.animateHuman(h, dt, {mode: "move", speed: 0}, {tier: 0});
      const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {};
      const loco = {mode: "move", speed: 0};
      let prevQ = K.boneQ(h), jump = 0, jat = null, ids = new Set();
      for (let f = 0; f < 110; f++){
        wind.p = Math.min(1, f/50); if (f >= 50) wind.side = "L";
        const st = M.windHold(wind, 0, rec, dt) || loco; if (st.id) ids.add(st.id);
        H.animateHuman(h, dt, st, {tier: 0});
        const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
        if (f >= 50 && j.m > jump){ jump = j.m; jat = [f, j.at]; }
      }
      const kneeL = at(h, H.BONE.shL).y, kneeR = at(h, H.BONE.shR).y;
      out.swap = {jump: +jump.toFixed(3), jat, ids: ids.size, cocked: kneeL > kneeR + .1 ? "L" : kneeR > kneeL + .1 ? "R" : "-"};
      K.clear();
    }
    return out;
  });
  for (const k of ["Rshot", "Lshot", "Rpass", "Lpass"]){
    const v = r[k];
    console.log(k, JSON.stringify(v));
    check(v.kneeUp > .1 && v.back < -.1, `${k}: the charge cocks the kicking leg (the knee up in front, the boot drawn back behind it)`, {kneeUp: +v.kneeUp.toFixed(3), back: +v.back.toFixed(3)});
    check(v.fired === 0, `${k}: nothing fires while it is held`, v.fired);
    check(v.supDrift < .003, `${k}: the support foot stays where it is planted`, +v.supDrift.toFixed(4));
    check(v.jump <= .35 && v.jumpS <= .35, `${k}: no bone turns more than 0.35 rad in a frame, into the hold, through it and into the strike`, {hold: +v.jump.toFixed(3), strike: +v.jumpS.toFixed(3)});
    check(v.contactAt != null && Math.abs(v.contactAt - .15) <= .001, `${k}: let go, the strike's contact on its time`, v.contactAt);
    check(v.reach != null && v.reach <= .14, `${k}: the striking face at the ball at contact`, v.reach != null ? +v.reach.toFixed(3) : null);
  }
  check(r.Rshot.kneeUp > r.Rpass.kneeUp + .03, "a shot is wound up further than a pass", {shot: r.Rshot.kneeUp, pass: r.Rpass.kneeUp});
  check(r.Rshot.lean > .03 && r.Lshot.lean > .03, "held past full, the chest leans back (the head goes back over the hips)", [r.Rshot.lean, r.Lshot.lean]);
  check(r.walk.steps >= 2 && r.walk.slide < .01 && r.walk.jump <= .35, "walking with it held: the support foot re-steps and never slides while down", r.walk);
  check(r.run.hold === null && r.run.upper && r.run.upper.g === "windup" && r.run.layer > .5 && r.run.jumpR <= .35, "on the run: the stride keeps the legs, the wind-up is the upper body's", r.run);
  for (const [k, v] of Object.entries(r.exits)) check(v.jump <= .35 && v.held >= 1 && v.held < 40, `let go without a strike (${k}): the clip lets the leg down, no bone over 0.35 rad in a frame into locomotion`, v);
  for (const k of ["standing", "standingT1"]) check(r.exits[k].foot <= .15 && r.exits[k].held >= 10, `let go standing (${k}): the leg is put down over several frames, not stamped`, r.exits[k]);
  check(r.swap.jump <= .25 && r.swap.ids === 1 && r.swap.cocked === "L", "a change of striking foot mid-hold: one leg down, then the other up, in the same clip", r.swap);

  // ---- contact sheets: the wind-up filling and held, from the side, the front, behind and through the eyes
  const urls = await K.page.evaluate(async () => {
    const {H, M} = K; K.clear();
    const out = [];
    for (const view of ["side", "front", "back", "fp"]){
      const h = K.body("footballer", 5, {}, {fp: view === "fp"});
      h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      K.ball.position.set(.55, .11, -.12);
      for (let i = 0; i < 30; i++) H.animateHuman(h, 1/60, "idle");
      const S = K.sheet(200, view === "fp" ? 170 : 250, 8), wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {};
      for (let f = 0; f < 96; f++){
        const t = f/60; wind.p = 1 - Math.pow(1 - Math.min(1, t/.85), 2); wind.over = Math.max(0, Math.min(1, (t - .85)/.6));
        H.animateHuman(h, 1/60, M.windHold(wind, 0, rec) || "idle", {tier: 0});
        if (f % 12 === 11) S.shot(view === "fp" ? K.view(h, "fp", {pitch: 1.0}) : K.view(h, view), view === "fp" ? "" : `p ${wind.p.toFixed(2)}`);
      }
      out.push([view, S.url()]);
      K.clear();
    }
    return out;
  });
  for (const [view, u] of urls) savePng(u, `wpD3-windup-${view}.png`);
  if (K.errors.length) check(false, "no page errors", K.errors.slice(0, 5));
} finally {
  await K.close();
}

// ---- the in-game path (needs view.js to pass the charge on: the hook this package asks for)
{
  const {launch, career, freeze, snap} = await import("./lib.mjs");
  const {page, close} = await launch({gfx: "low", seed: 21});
  try {
    await career(page, {zone: "ground", min: 11*60, pos: "ST"});
    await freeze(page);
    const r = await page.evaluate(async () => {
      const V = await import("./js/life/football/view.js");
      const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS.shoot;
      L.place({x: D.spot.x, z: D.spot.z - 28, y: 0, yaw: -Math.PI/2}); L.stepN(20);
      L.use(L.spots.find(s => s.label === D.label));
      for (let i = 0; i < 400 && !(window.__train && window.__train.RUN.cur); i++) await new Promise(r => setTimeout(r, 25));
      const TR = window.__train;
      // to the first ball at your feet, controlled
      for (let i = 0; i < 2400; i++){
        L.stepN(1);
        const T = TR.T; if (!T) continue;
        if (T.ms.poss.ctl === T.me.id && Math.hypot(T.ms.ball.v.x, T.ms.ball.v.z) < 1 && T.me.m.speed < .5) break;
      }
      const T = TR.T; if (!T) return {error: "no drill"};
      L.P.pitch = -1.0;
      TR.input({type: "down", button: 0});
      L.stepN(50);
      const R = T.V.rec[T.ms.me], c = R && R.clip;
      const hooked = !!(c && c.hold != null);
      const fp = T.V.fp, mv = fp && fp.mv;
      const res = {hooked, clip: c ? {mode: c.mode, hold: c.hold} : null, fpHold: !!(mv && mv.key === "strike" && mv.data && mv.data.held), wind: TR.CTRL.wind.p};
      // third person: your whole body (hidden in your eyes) drawn and seen from beside and in front of you
      if (R){
        // (your whole body is posed in full only while it is to be seen: a replay's, here a test's)
        T.V.fpOn = false; L.stepN(3);
        res.tpHold = !!(R.h.mv && R.h.mv.key === "strike" && R.h.mv.data && R.h.mv.data.held);
        R.h.g.visible = true;
        const cam = L.cam, g = R.h.g, wp = g.getWorldPosition(new (await import("./vendor/three.module.js")).Vector3());
        window.__d3tp = {g, cam, pos: cam.position.clone(), rot: cam.rotation.clone(), fpVis: fp ? fp.g.visible : false};
        if (fp) fp.g.visible = false;
        cam.position.set(wp.x + 1.6, 1.25, wp.z + 2.6); cam.lookAt(wp.x, .8, wp.z); cam.updateMatrixWorld(true);
      }
      return res;
    });
    if (r.error) check(false, "in game: a drill with the ball at your feet", r.error);
    else if (!r.hooked) console.log("skip in game: view.js does not pose your agent with windHold yet (the hook this package asks for)", JSON.stringify(r));
    else {
      check(r.clip.mode === "strike" && r.clip.hold > .5 && r.fpHold && r.tpHold, "in game: winding up, your agent (third person) and the body in your eyes are posed by the held clip", r);
    }
    await snap(page, "wpD3-windup-game-tp");
    await page.evaluate(() => { const s = window.__d3tp; if (s){ s.cam.position.copy(s.pos); s.cam.rotation.copy(s.rot); } });
    if (page.errors.length) check(false, "in game: no console or page errors", page.errors.slice(0, 5));
  } finally { await close(); }
}
fs.writeFileSync(path.join(OUT, "wpD3-windup.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "wpD3-windup: all checks pass" : "wpD3-windup: FAILED");
process.exit(res.ok ? 0 : 1);
