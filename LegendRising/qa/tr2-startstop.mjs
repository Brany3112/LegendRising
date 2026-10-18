// qa/tr2-startstop.mjs: starts, stops, turns and the backpedal (BUILD-PLAN P2-B acceptance, MV-11, MV-12, MV-13;
// TRAINING-SPEC 2: "stop/restart", "turning that differs standing vs sprinting", "no snapping"). Owner: P2-B (TR stage 2).
//
// Your own life body, first and third person, driven by the real keys (page.keyboard: W pressed and let go, V for the
// view), at body scales 0.92, 1.0 and 1.08, off the pitch (the LIFE profile):
//   MV-11 walk start (W from standing): 90% of the walk's target speed is reached no earlier than the first swing foot's
//     touchdown; the root goes <= 0.05 m before the first foot lifts; the acceleration stays <= 4 m/s2.
//   MV-11 walk stop (W let go after a steady walk): the root stops within one step (its distance from the release no
//     more than a step at that speed); the last footstep lands within 0.05 m of where the root stops (along the way it
//     was going); no footstep starts more than 0.35 s after the root has stopped; the braking stays <= 4 m/s2.
//   MV-12 third-person start (W from standing with the camera turned 90, 135 and 180 degrees from the body's facing):
//     no swing foot moves more than 0.05 m against the way of travel; the body faces the mover's yaw every frame and
//     turns no faster than the mover's own turn rate, and once it goes faster than 0.3 m/s it travels within 45
//     degrees of where it faces (no side steps or backward steps on the way round); no hip or thigh bone turns more
//     than 0.25 rad in a frame.
// A match body with intent (the real mover, FOOTBALL profile, as football/view.js drives one), scales 0.92, 1.0, 1.08:
//   turns of 90 and 180 degrees from standing, and at a jog (3.8 m/s) and a sprint (7.8 m/s): the pelvis turns at most
//     0.25 rad in a frame; the drawn pelvis heading stays within 0.15 rad of the mover's heading once the turn is run
//     (the mover's own path: its sprint turn is wider than its jog turn); planted drift <= 2 mm;
//   MV-13 backpedal at 1.5 and 2.5 m/s (the facing held): toe clearance >= 15 mm through every swing (once the foot is
//     off the ground, u 0.15, to u 0.95); the knee limiter on until touchdown (no knee change over 18 rad/s in a swing
//     frame, to u 1); planted drift <= 2 mm; speed within 5% of the command.
// A contact sheet of each case (qa/out/tr2-startstop-*.png).
//
//   QA_PORT=8841 node qa/tr2-startstop.mjs [--quick]   exits 1 on any failed check; writes qa/out/tr2-startstop.json
//   (--quick: scale 1.0 only)
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, report, OUT} from "./lib.mjs";
import {drive, metrics, wrap} from "./tr2-gaitlib.mjs";

const QUICK = process.argv.includes("--quick");
const SCALES = QUICK ? [1] : [.92, 1, 1.08];
const res = {name: "tr2-startstop", checks: [], ok: true, runs: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const savePng = (name, png) => { if (!png) return null; fs.mkdirSync(OUT, {recursive: true}); const f = path.join(OUT, name + ".png"); fs.writeFileSync(f, Buffer.from(png.split(",")[1], "base64")); return f; };

/* ---------- your life body, in the page: a recorder stepped frame by frame (the keys come from page.keyboard) ---------- */
async function lifeSetup(page, o){
  return page.evaluate(async o => {
    const L = window.__life, Hm = await import("./js/life/human.js"), Mv = await import("./js/life/core/move.js");
    // your height for this run (the body is made again from your look)
    if (S.player.look.height !== o.scale){ S.player.look.height = o.scale; window.lifeLookChanged(); }
    for (const k in L.keys) L.keys[k] = false;
    L.place({x: -33, z: 20, y: 0, yaw: o.yaw}); L.P.pitch = -.2;
    L.stepN(50);
    // (a placement starts the third-person camera afresh: it glides back out behind you)
    for (let i = 0; i < 12 && !!L.ME.tpShown !== !!o.tp; i++) L.stepN(20);
    if (!!L.ME.tpShown !== !!o.tp) return {needView: true};
    // the camera turned from where the body faces (third person: the keys go where the camera looks)
    if (o.camOff) L.P.yaw = o.yaw + o.camOff;
    L.stepN(2);
    const B = Hm.BONE, cam = L.cam, V = new (cam.position.constructor)(), Q0 = new (cam.quaternion.constructor)();
    const body = () => L.ME.tpShown ? L.ME.tp : L.ME.fp;
    const prevQ = body().bones.map(b => b.quaternion.clone());
    const sheet = document.createElement("canvas"), cw = 160, ch = 200, cols = 8, rows = 4; sheet.width = cw*cols; sheet.height = ch*rows;
    const gx = sheet.getContext("2d"); gx.fillStyle = "#222"; gx.fillRect(0, 0, sheet.width, sheet.height);
    const R = window.__ss = {rows: [], t: 0, B, V, Q0, prevQ, body, Mv, sheet, gx, shot: 0, every: o.every || 4, cw, ch, cols, max: cols*rows};
    R.rec = n => {
      for (let i = 0; i < n; i++){
        L.stepN(1); R.t += 1/60;
        const h = body(), G = h.gait, m = Mv.LOCO.m;
        h.g.updateMatrixWorld(true);
        const row = {t: +R.t.toFixed(4), x: +L.P.x.toFixed(5), z: +L.P.z.toFixed(5), v: +(m ? m.speed : 0).toFixed(4), tgt: m ? +m.target.toFixed(3) : 0,
          myaw: m ? +m.yaw.toFixed(5) : 0, mhead: m ? +m.heading.toFixed(5) : 0, byaw: +(h.g.rotation.y - Math.PI).toFixed(5), st: G ? G.state : "", sty: G ? G.style : "", legs: []};
        for (let s = 0; s < 2; s++){
          const f = G.feet[s]; V.set(0, 0, 0).applyMatrix4(h.bones[s ? B.ftR : B.ftL].matrixWorld);
          row.legs.push({d: f.down ? 1 : 0, fp: [+f.x.toFixed(5), +f.z.toFixed(5)], ank: [+V.x.toFixed(5), +V.y.toFixed(5), +V.z.toFixed(5)]});
        }
        let jb = 0, jw = -1;
        for (const b of [B.hips, B.thL, B.thR]){ const a = R.prevQ[b].angleTo(h.bones[b].quaternion); if (a > jb){ jb = a; jw = b; } }
        for (let b = 0; b < h.bones.length; b++) R.prevQ[b].copy(h.bones[b].quaternion);
        row.jump = +jb.toFixed(4); row.jumpB = jw;
        R.rows.push(row);
        if (R.rows.length % R.every === 0 && R.shot < R.max){
          // from the body's left and a little in front, at hip height
          const ren = L.renderer(), c2 = cam.clone(), yw = h.g.rotation.y, fx = Math.sin(yw), fz = Math.cos(yw), lx = Math.cos(yw), lz = -Math.sin(yw);
          const vis = [L.ME.fp && L.ME.fp.g.visible, L.ME.tp && L.ME.tp.g.visible]; h.g.visible = true;
          c2.position.set(L.P.x + (lx*.8 + fx*.6)*2.8, 1.0, L.P.z + (lz*.8 + fz*.6)*2.8); c2.lookAt(L.P.x, .8, L.P.z); c2.fov = 50; c2.aspect = R.cw/R.ch; c2.updateProjectionMatrix();
          ren.render(L.scene(), c2);
          if (L.ME.fp) L.ME.fp.g.visible = vis[0]; if (L.ME.tp) L.ME.tp.g.visible = vis[1];
          const cv = ren.domElement, col = R.shot % R.cols, rr = Math.floor(R.shot/R.cols), sw = Math.min(cv.width, cv.height*R.cw/R.ch), shh = sw*R.ch/R.cw;
          R.gx.drawImage(cv, (cv.width - sw)/2, (cv.height - shh)/2, sw, shh, col*R.cw, rr*R.ch, R.cw, R.ch);
          R.gx.fillStyle = "#fff"; R.gx.font = "12px sans-serif"; R.gx.fillText(`${R.t.toFixed(2)}s ${row.v.toFixed(1)} m/s ${row.st[0]}${row.sty[0]}`, col*R.cw + 4, rr*R.ch + 14);
          R.shot++;
        }
      }
      return R.rows.length;
    };
    return {ok: true, scale: body().scale};
  }, o);
}
const rec = (page, n) => page.evaluate(n => window.__ss.rec(n), n);
const take = page => page.evaluate(() => { const R = window.__ss; return {rows: R.rows, png: R.sheet.toDataURL("image/png")}; });
async function setView(page, tp){
  // (the career's cover lifted: third person waits while a fade is up, me.js forcedFP)
  // (and out in the open, where the third-person camera has room behind you)
  await page.evaluate(() => { const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } window.__life.FADE.v = 0; window.__life.FADE.boot = false;
    window.__life.place({x: -33, z: 20, y: 0, yaw: Math.PI/2}); window.__life.stepN(20); });
  for (let k = 0; k < 2; k++){
    const now = await page.evaluate(() => !!window.__life.ME.tpShown);
    if (now === tp) return;
    await page.keyboard.press("v");
    // (the camera glides out to its place behind you over a few tenths of a second)
    await page.evaluate(tp => { const L = window.__life; for (let i = 0; i < 12 && !!L.ME.tpShown !== tp; i++) L.stepN(20); }, tp);
  }
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const {page, close} = await launch({gfx: "low", seed: 1, w: 640, h: 480});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  /* ---------- MV-11: the life walk's start and stop, first and third person, by the keys ---------- */
  for (const tp of [false, true]) for (const scale of SCALES){
    await setView(page, tp);
    const key = `life ${tp ? "third" : "first"} person x${scale}`;
    const su = await lifeSetup(page, {tp, scale, yaw: Math.PI/2, every: 4});
    if (su.needView){ check(false, `${key}: the view`, su); continue; }
    await page.keyboard.down("w");
    await rec(page, 150);
    const rel = (await page.evaluate(() => window.__ss.rows.length));
    await page.keyboard.up("w");
    await rec(page, 90);
    const {rows: R, png} = await take(page);
    const sheet = savePng(`tr2-startstop-life-${tp ? "tp" : "fp"}-${scale}`, png);
    // the start
    const lift = R.findIndex((r, i) => i > 0 && r.legs.some((l, s) => R[i - 1].legs[s].d && !l.d));
    const liftSide = lift >= 0 ? R[lift].legs.findIndex((l, s) => R[lift - 1].legs[s].d && !l.d) : -1;
    const td = lift >= 0 ? R.findIndex((r, i) => i > lift && r.legs[liftSide].d) : -1;
    const tgt = Math.max(...R.slice(0, rel).map(r => r.tgt));
    const i90 = R.findIndex(r => r.v >= .9*tgt);
    const pre = lift >= 0 ? dist([R[lift].x, R[lift].z], [R[0].x, R[0].z]) : null;
    let accMax = 0, brkMax = 0;
    for (let i = 1; i < R.length; i++){ const a = (R[i].v - R[i - 1].v)*60; if (i < rel) accMax = Math.max(accMax, a); else brkMax = Math.max(brkMax, -a); }
    const st = {lift: lift >= 0 ? R[lift].t : null, touchdown: td >= 0 ? R[td].t : null, t90: i90 >= 0 ? R[i90].t : null, preLiftM: pre != null ? +pre.toFixed(4) : null, accMax: +accMax.toFixed(3), sheet};
    check(st.t90 != null && st.touchdown != null && st.t90 >= st.touchdown - 1e-6, `${key}: start, 90% of the walk's speed no earlier than the first swing foot's touchdown`, {t90: st.t90, touchdown: st.touchdown});
    check(pre != null && pre <= .05, `${key}: start, the root goes <= 0.05 m before the first foot lifts`, st.preLiftM);
    check(accMax <= 4 + 1e-6, `${key}: start, acceleration <= 4 m/s2`, st.accMax);
    // the stop
    const vRel = R[rel - 1].v, dir = [Math.cos(0), 0];
    const hx = -Math.sin(R[rel - 1].mhead), hz = -Math.cos(R[rel - 1].mhead);
    const iStop = R.findIndex((r, i) => i >= rel && r.v < .005);
    const stopAt = iStop >= 0 ? [R[iStop].x, R[iStop].z] : null;
    const travelled = stopAt ? dist(stopAt, [R[rel - 1].x, R[rel - 1].z]) : null;
    const stepM = .843*scale*vRel/1.7;
    // footsteps after the release: touchdowns and lift-offs
    const downs = [], ups = [];
    for (let i = rel; i < R.length; i++) for (let s = 0; s < 2; s++){
      if (!R[i - 1].legs[s].d && R[i].legs[s].d) downs.push({i, s});
      if (R[i - 1].legs[s].d && !R[i].legs[s].d) ups.push({i, s});
    }
    const last = downs[downs.length - 1];
    const lastAlong = last && stopAt ? (R[last.i].legs[last.s].ank[0] - stopAt[0])*hx + (R[last.i].legs[last.s].ank[2] - stopAt[1])*hz : null;
    const lateUp = iStop >= 0 ? ups.filter(u => R[u.i].t > R[iStop].t + .35).length : null;
    const so = {vRelease: vRel, stopAfter: iStop >= 0 ? +(R[iStop].t - R[rel - 1].t).toFixed(3) : null, travelledM: travelled != null ? +travelled.toFixed(3) : null, stepM: +stepM.toFixed(3),
      lastAlongM: lastAlong != null ? +lastAlong.toFixed(3) : null, lateLifts: lateUp, brakeMax: +brkMax.toFixed(3), steps: downs.length};
    void dir;
    check(travelled != null && travelled <= stepM, `${key}: stop, the root stops within one step`, {travelled: so.travelledM, step: so.stepM});
    check(lastAlong != null && Math.abs(lastAlong) <= .05, `${key}: stop, the last footstep lands within 0.05 m of where the root stops`, so.lastAlongM);
    check(lateUp === 0, `${key}: stop, no footstep starts more than 0.35 s after the root has stopped`, lateUp);
    check(brkMax <= 4 + 1e-6, `${key}: stop, braking <= 4 m/s2`, so.brakeMax);
    res.runs[key] = {start: st, stop: so};
  }
  /* ---------- MV-12: third-person starts away from the body's facing ---------- */
  await setView(page, true);
  for (const scale of SCALES) for (const deg of [90, 135, 180]){
    const key = `third person start at ${deg} degrees x${scale}`;
    const yaw = Math.PI/2, off = deg*Math.PI/180;
    const su = await lifeSetup(page, {tp: true, scale, yaw, camOff: off, every: 3});
    if (su.needView){ check(false, `${key}: the view`, su); continue; }
    await page.keyboard.down("w");
    await rec(page, 96);
    await page.keyboard.up("w");
    await rec(page, 20);
    const {rows: R, png} = await take(page);
    const sheet = savePng(`tr2-startstop-tp${deg}-${scale}`, png);
    // the way of travel: where the camera looks (the keys go there)
    const wx = -Math.sin(yaw + off), wz = -Math.cos(yaw + off);
    const lifts = [null, null], back = [];
    let yawErr = 0, rate = 0, offWay = 0, jump = 0, jumpB = -1;
    for (let i = 1; i < 96; i++){
      const r = R[i], p = R[i - 1];
      yawErr = Math.max(yawErr, Math.abs(wrap(r.byaw - r.myaw)));
      rate = Math.max(rate, Math.abs(wrap(r.byaw - p.byaw))*60);
      if (r.v > .3) offWay = Math.max(offWay, Math.abs(wrap(r.mhead - r.byaw)));
      if (r.jump > jump){ jump = r.jump; jumpB = r.jumpB; }
      for (let s = 0; s < 2; s++){
        if (p.legs[s].d && !r.legs[s].d) lifts[s] = p.legs[s].ank;
        if (!p.legs[s].d && r.legs[s].d && lifts[s]){ const a = r.legs[s].ank; back.push(+((a[0] - lifts[s][0])*wx + (a[2] - lifts[s][2])*wz).toFixed(3)); lifts[s] = null; }
      }
    }
    const worst = Math.min(0, ...back);
    res.runs[key] = {steps: back, yawErr: +yawErr.toFixed(4), rate: +rate.toFixed(2), offWayRad: +offWay.toFixed(3), jump, jumpB, sheet};
    check(worst >= -.05, `${key}: no swing foot moves more than 0.05 m against the way of travel`, {worst, steps: back});
    check(yawErr <= .01 && rate <= 12.5, `${key}: the body faces the mover's yaw, turning no faster than its turn rate (12 rad/s)`, {yawErr: +yawErr.toFixed(4), rate: +rate.toFixed(2)});
    check(offWay <= Math.PI/4, `${key}: under way it travels within 45 degrees of where it faces`, +offWay.toFixed(3));
    check(jump <= .25, `${key}: no hip or thigh bone turns more than 0.25 rad in a frame`, {jump, bone: jumpB});
  }
  await setView(page, false);
  /* ---------- turns: a match body with intent ---------- */
  for (const scale of SCALES) for (const [v0, gait, cap] of [[0, "jog", 3.8], [3.8, "jog", 3.8], [0, "sprint", 7.8], [7.8, "sprint", 7.8]]) for (const deg of [90, 180]){
    const key = `turn ${deg} degrees ${v0 ? "at" : "from standing to"} ${cap} m/s x${scale}`;
    const segs = v0 ? [{T: 1.6, dir: 0, gait, cap}, {T: 2.4, dir: deg, gait, cap}] : [{T: .4}, {T: 2.6, dir: deg, gait, cap}];
    const r = await drive(page, {hz: 60, scale, prof: "football", v0, segs, sheet: scale === 1 ? {every: 5, max: 32, camY: 3.2, dist: 5} : null, sheetName: scale === 1 ? `tr2-startstop-turn${deg}-${v0 ? "run" : "stand"}-${cap}` : null});
    const R = r.rows, i0 = R.findIndex(x => x.seg >= 1);
    let pel = 0, head = 0;
    for (let i = i0 + 1; i < R.length; i++){
      pel = Math.max(pel, Math.abs(wrap(R[i].hipYaw - R[i - 1].hipYaw)));
    }
    // (the drawn pelvis against the mover's heading once the turn is run: the last second, steady on the new way)
    for (let i = R.length - 60; i < R.length; i++) head = Math.max(head, Math.abs(wrap(R[i].hipYaw - (R[i].head))));
    const m = metrics(R, {t0: R[i0].t, t1: R[R.length - 1].t, scale: r.scale});
    res.runs[key] = {pelvisRate: +pel.toFixed(4), pelvisVsHeading: +head.toFixed(4), driftMm: m.driftMm, slipsMm: r.slips, sheet: r.sheetFile};
    check(pel <= .25, `${key}: the pelvis turns at most 0.25 rad in a frame`, +pel.toFixed(4));
    check(head <= .15, `${key}: the drawn pelvis heading within 0.15 rad of the mover's heading`, +head.toFixed(4));
    check(m.driftMm <= 2, `${key}: planted drift <= 2 mm`, {driftMm: m.driftMm, stances: m.stances});
  }
  /* ---------- MV-13: the backpedal ---------- */
  for (const scale of SCALES) for (const v of [1.5, 2.5]){
    const key = `backpedal ${v} m/s x${scale}`;
    const r = await drive(page, {hz: 60, scale, prof: "football", segs: [{T: 3.4, dir: 180, gait: "jog", cap: v, face: "start"}], sheet: scale === 1 ? {every: 3, max: 40} : null, sheetName: scale === 1 ? `tr2-startstop-back${v}` : null});
    const R = r.rows, t0 = 1.4;
    const m = metrics(R, {t0, t1: 3.4, scale: r.scale});
    let knee = 0, toe = Infinity;
    for (let i = 1; i < R.length; i++) if (R[i].t >= t0) for (let s = 0; s < 2; s++){
      const a = R[i - 1].legs[s], b = R[i].legs[s];
      if (!a.d && !b.d) knee = Math.max(knee, Math.abs(b.knee - a.knee));
      // (the toe tip's height from the moment the foot is off the ground, the sole's clearance ramped in by u 0.15
      // (gait.js swingAt), to u 0.95, where it comes down onto its footprint)
      if (!b.d && b.k === "phase" && b.u >= .15 && b.u < .95) toe = Math.min(toe, b.tip[1]*1000);
    }
    m.toeMm = +toe.toFixed(1);
    const W = R.filter(x => x.t >= t0), vMean = W.reduce((s, x) => s + x.v, 0)/W.length;
    res.runs[key] = {toeMm: m.toeMm, kneeSwing: +knee.toFixed(4), driftMm: m.driftMm, vMean: +vMean.toFixed(3), style: W[W.length >> 1].sty, sheet: r.sheetFile};
    check(W[W.length >> 1].sty === "back", `${key}: the gait steps backwards`, W[W.length >> 1].sty);
    check(m.toeMm >= 15, `${key}: toe clearance >= 15 mm through every swing`, m.toeMm);
    check(knee <= 18/60 + 1e-3, `${key}: the knee limiter holds to the touchdown (<= 18 rad/s in a swing frame)`, +knee.toFixed(4));
    check(m.driftMm <= 2, `${key}: planted drift <= 2 mm`, {driftMm: m.driftMm, stances: m.stances});
    check(Math.abs(vMean/v - 1) <= .05, `${key}: speed within 5% of the command`, +vMean.toFixed(3));
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-startstop", res);
await close();
process.exit(res.ok ? 0 : 1);
