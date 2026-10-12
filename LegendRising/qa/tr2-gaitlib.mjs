// qa/tr2-gaitlib.mjs: the measuring kit the P2-B movement checks share (tr2-gait, tr2-startstop, tr2-stop,
// tr2-clipexit, tr2-gkshuffle). Owner: P2-B (TR stage 2). Contract: BUILD-PLAN P2-B acceptance; TRAINING-SPEC 2
// (movement: walk, jog, sprint, starts, stops, turns, lateral; no foot sliding, no snapping).
//
// drive(page, o) runs one body in the page on the real mover (mover.js, the LIFE or FOOTBALL profile) and the real
// animation (human.js and gait.js), the way core/me.js and football/view.js drive theirs, and returns one row a frame
// with what the checks read: the root, the gait's state, each foot (planted or in the air, its swing progress, the
// knee's bend, the heel, the ball of the foot and the toe tip in the world, its footprint), the hips' height and turn
// against the body, and the biggest turn of any bone in that frame. metrics(rows, o) turns the rows into the numbers
// the plan's tables name. sheet(page, ...) draws a contact sheet.
//
// Script segments for drive(): [{T (seconds), dir (degrees from the body's starting facing, + to its left), gait,
// cap (m/s), face: "start" | "dir" | null (the facing held: where the body faced at the start, or along dir), stop}]
// A segment with no dir is no input at all (a stop).
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {stepLen} from "../js/life/gaitcore.js";

/* ---------- in the page ---------- */
// (self-contained: page.evaluate sends its source)
async function pageDrive(o){
  const H = await import("./js/life/human.js"), Mv = await import("./js/life/mover.js"), St = await import("./js/life/stamina.js");
  await import("./js/life/moves.js");
  const L = window.__life, scene = L.scene(), cam = L.cam, ren = L.renderer();
  if (L.ME.fp) L.ME.fp.g.visible = false; if (L.ME.tp) L.ME.tp.g.visible = false;
  const B = H.BONE, V = new (cam.position.constructor)(), Q0 = new (cam.quaternion.constructor)();
  const look = H.lookFor(o.role || "footballer", o.seed || 11, {kit:["#c0392b", "#ffffff"], number:8, training:true, height:o.scale || 1});
  const h = H.human(look); scene.add(h.g);
  const dt = 1/o.hz, prof = o.prof || "football";
  const prm = Mv.moverParams({sprintSpeed:o.pace || 50, acceleration:o.pace || 50, dribbling:50}, prof);
  const fac = St.stamFactors(St.createStam({stamina:60}), 1, {});
  const yaw0 = o.yaw0 != null ? o.yaw0 : Math.PI/2;
  const m = Mv.createMover({x:o.x0 != null ? o.x0 : -30, z:o.z0 != null ? o.z0 : -12, yaw:yaw0});
  if (o.v0){ m.speed = o.v0; m.heading = yaw0; m.vx = -Math.sin(yaw0)*o.v0; m.vz = -Math.cos(yaw0)*o.v0; }
  const place = () => { h.g.position.set(m.x, 0, m.z); h.g.rotation.y = m.yaw + Math.PI; };
  place();
  for (let k = 0; k < 30; k++){ H.ANIM.frame++; H.ANIM.fpu = 0; H.animateHuman(h, 1/60, {mode:"idle", look:0}); }
  const it = {dx:0, dz:0, gait:"walk", face:null, strafe:false, speedCap:Infinity};
  const face = {x:0, z:0};
  const st = {mode:"move", speed:0, intent:undefined, root:{x:0, z:0}, fac, style:undefined, look:0};
  const rows = [], prevQ = h.bones.map(b => b.quaternion.clone());
  const segs = o.segs;
  let t = 0, si = 0, segT = 0;
  const dirW = deg => { const a = yaw0 + deg*Math.PI/180; return {x:-Math.sin(a), z:-Math.cos(a), yaw:a}; };
  const pt = (bone, x, y, z) => V.set(x, y, z).applyMatrix4(h.bones[bone].matrixWorld);
  // sheets: a canvas of small pictures every `every` frames, from the side (or from the eye, looking down)
  const sh = o.sheet || null, grid = sh ? document.createElement("canvas") : null;
  const cw = 160, ch = sh && sh.fp ? 150 : 220, cols = 8;
  let gx = null, shot = 0, nShots = 0;
  if (grid){
    let total = 0; for (const s of segs) total += s.T;
    nShots = Math.min(sh.max || 48, Math.ceil(total/dt/sh.every));
    grid.width = cw*cols; grid.height = ch*Math.ceil(nShots/cols); gx = grid.getContext("2d"); gx.fillStyle = "#222"; gx.fillRect(0, 0, grid.width, grid.height);
  }
  const N = segs.reduce((s, g) => s + Math.round(g.T/dt), 0);
  for (let i = 0; i < N; i++){
    while (si < segs.length && segT >= segs[si].T - 1e-9){ si++; segT = 0; }
    const g = segs[Math.min(si, segs.length - 1)];
    // the wish and the facing
    if (g.dir != null){
      const d = dirW(g.dir); it.dx = d.x; it.dz = d.z;
    } else { it.dx = 0; it.dz = 0; }
    it.gait = g.gait || "walk"; it.speedCap = g.cap != null ? g.cap : Infinity; it.strafe = false;
    if (g.face === "start"){ face.x = -Math.sin(yaw0); face.z = -Math.cos(yaw0); it.face = face; }
    else if (g.face != null && typeof g.face === "number"){ const d = dirW(g.face); face.x = d.x; face.z = d.z; it.face = face; }
    else it.face = null;
    const x0 = m.x, z0 = m.z;
    Mv.moverStep(m, it, prm, fac, dt, null);
    place();
    st.speed = m.speed; st.root.x = m.x; st.root.z = m.z;
    st.intent = o.intent === false ? undefined : (g.dir != null ? m.target : 0);
    st.style = g.style || o.style || undefined;
    if (o.mode){ st.mode = o.mode; Object.assign(st, o.modeSt || {}); }
    H.ANIM.frame++; H.ANIM.fpu = 0;
    const ev = H.animateHuman(h, dt, st);
    h.g.updateMatrixWorld(true);
    const G = h.gait;
    const row = {t:+t.toFixed(4), v:+m.speed.toFixed(4), tgt:+m.target.toFixed(3), x:+m.x.toFixed(5), z:+m.z.toFixed(5), yaw:+(m.yaw + Math.PI).toFixed(5), head:+(m.heading + Math.PI).toFixed(5),
      seg:si, st:G ? G.state : "", mode:G ? G.mode : "", sty:G ? G.style : "", fall:(ev.mask & H.EV.FOOTFALL) ? (ev.side || "?") : "", gn:G ? G.n : 0, legs:[]};
    for (let s = 0; s < 2; s++){
      const f = G.feet[s], ft = s ? B.ftR : B.ftL, to = s ? B.toR : B.toL, shn = s ? B.shR : B.shL;
      const q = h.bones[shn].quaternion, knee = 2*Math.acos(Math.min(1, Math.abs(q.w)));
      const heel = pt(ft, 0, -.085, -.078).clone(), ball = pt(to, 0, -.025, 0).clone(), tip = pt(to, 0, -.02, .07).clone(), ank = pt(ft, 0, 0, 0).clone();
      row.legs.push({d:f.down ? 1 : 0, k:f.sw ? f.sw.kind : "", u:f.sw ? +f.sw.u.toFixed(4) : -1, knee:+knee.toFixed(5), roll:+f.roll.toFixed(4),
        heel:[+heel.x.toFixed(5), +heel.y.toFixed(5), +heel.z.toFixed(5)], ball:[+ball.x.toFixed(5), +ball.y.toFixed(5), +ball.z.toFixed(5)],
        tip:[+tip.x.toFixed(5), +tip.y.toFixed(5), +tip.z.toFixed(5)], ank:[+ank.x.toFixed(5), +ank.y.toFixed(5), +ank.z.toFixed(5)],
        fp:[+f.x.toFixed(5), +f.z.toFixed(5)], need:+(f.need || 0).toFixed(4), spare:f.spare == null ? null : +f.spare.toFixed(4)});
    }
    const hp = h.bones[B.hips].getWorldPosition(V);
    row.hipY = +hp.y.toFixed(5);
    h.bones[B.hips].getWorldQuaternion(Q0); V.set(0, 0, 1).applyQuaternion(Q0);
    const hy = Math.atan2(V.x, V.z), by = h.g.rotation.y;
    row.hipYaw = +hy.toFixed(5);
    row.twist = +Math.atan2(Math.sin(hy - by), Math.cos(hy - by)).toFixed(5);
    let jb = 0, jw = -1, jl = 0;
    for (let b = 1; b < 20; b++){ const a = prevQ[b].angleTo(h.bones[b].quaternion); if (a > jb){ jb = a; jw = b; } if ((b === 1 || b >= 12) && a > jl) jl = a; prevQ[b].copy(h.bones[b].quaternion); }
    row.jump = +jb.toFixed(4); row.jumpB = jw; row.jumpLeg = +jl.toFixed(4);
    row.thigh = [h.bones[B.thL].quaternion.toArray().map(v => +v.toFixed(5)), h.bones[B.thR].quaternion.toArray().map(v => +v.toFixed(5))];
    rows.push(row);
    if (gx && i % sh.every === 0 && shot < nShots){
      const yw = h.g.rotation.y, fx = Math.sin(yw), fz = Math.cos(yw);
      if (sh.fp){ cam.position.set(m.x + fx*.07*h.scale, 1.68*h.scale, m.z + fz*.07*h.scale); cam.rotation.set(-(sh.pitch || 1.0), yw + Math.PI, 0, "YXZ"); }
      else {
        // from the body's side (its left), at hip height, looking at it
        const side = sh.side || 1, lx = Math.cos(yw)*side, lz = -Math.sin(yw)*side, ang = sh.ang || 0;
        const cx = lx*Math.cos(ang) + fx*Math.sin(ang), cz = lz*Math.cos(ang) + fz*Math.sin(ang);
        cam.position.set(m.x + cx*(sh.dist || 2.6), sh.camY || .9, m.z + cz*(sh.dist || 2.6)); cam.lookAt(m.x, .8, m.z);
      }
      cam.fov = 50; cam.aspect = cw/ch; cam.updateProjectionMatrix();
      ren.render(scene, cam);
      const cv = ren.domElement, col = shot % cols, r = Math.floor(shot/cols), sw = Math.min(cv.width, cv.height*cw/ch), shh = sw*ch/cw;
      gx.drawImage(cv, (cv.width - sw)/2, (cv.height - shh)/2, sw, shh, col*cw, r*ch, cw, ch);
      gx.fillStyle = "#fff"; gx.font = "12px sans-serif"; gx.fillText(`${t.toFixed(2)}s ${m.speed.toFixed(1)} m/s ${G.state[0]}${G.style[0]}`, col*cw + 4, r*ch + 14);
      shot++;
    }
    t += dt; segT += dt;
  }
  const res = {rows, scale:h.scale, slips:+(h.gait.slips*1000).toFixed(2), png:grid ? grid.toDataURL("image/png") : null};
  scene.remove(h.g); h.dispose();
  return res;
}

export async function drive(page, o){
  const r = await page.evaluate(pageDrive, o);
  if (r.png && o.sheetName){ fs.mkdirSync(OUT, {recursive: true}); const f = path.join(OUT, o.sheetName + ".png"); fs.writeFileSync(f, Buffer.from(r.png.split(",")[1], "base64")); r.sheetFile = f; }
  delete r.png;
  return r;
}

/* ---------- the numbers ---------- */
// the table's step (gaitcore.stepLen, the clock every body and the simulation step by) for a speed, mode and body
// scale: walking never beyond the leg's reach (WALK_REACH x scale)
export const tableStep = (v, mode, sc) => stepLen(v, mode, sc);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// the roll past which a planted foot turns on the tips of its toes (gait.js TIP_R)
export const TIP_R = .9;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/* metrics over the rows from t0 to t1 (seconds; the steady part of a run): everything the P2-B tables read.
   kneeLift: the largest knee change in a frame on a lift-off frame and the one after it (rad); ballRise: how far the
   ball of the foot rises on the lift-off frame (mm); hipAcc: the largest change of the hips' vertical speed in a frame
   (mm a frame); pinned: the share of frames with the hips within 1 mm of their top; flight: frames with both feet in the
   air while walking; lr: the left and right touchdown intervals' difference over their mean; cadence against the table;
   drift: how far a planted foot's contact point (the heel while rolled back on it, else the ball) moves in a stance
   (mm); heel: the lowest the heel comes in a swing before u 0.95 (mm); toe: the lowest the toe tip comes in a swing
   before u 0.95 (mm); jump: the biggest bone turn in a frame (rad); jumpLeg: the hips' and legs' */
export function metrics(rows, {t0 = 0, t1 = Infinity, scale = 1, hz = 60} = {}){
  const R = rows.filter(r => r.t >= t0 - 1e-9 && r.t <= t1 + 1e-9);
  const out = {frames: R.length};
  if (R.length < 3) return out;
  let kneeLift = 0, kneeAll = 0, ballRise = 0, lifts = 0, flight = 0, heel = Infinity, toe = Infinity, jump = 0, jumpLeg = 0, jumpAt = null;
  const drift = [], stance = [null, null];
  for (let i = 1; i < R.length; i++){
    const a = R[i - 1], b = R[i];
    if (b.jump > jump){ jump = b.jump; jumpAt = [b.t, b.jumpB]; }
    jumpLeg = Math.max(jumpLeg, b.jumpLeg);
    for (let s = 0; s < 2; s++){
      const la = a.legs[s], lb = b.legs[s];
      kneeAll = Math.max(kneeAll, Math.abs(lb.knee - la.knee));
      if (la.d && !lb.d){
        lifts++;
        ballRise = Math.max(ballRise, (lb.ball[1] - la.ball[1])*1000);
        // (at lift-off: the frame the foot leaves the ground and the next one. A sprinting knee then folds on towards
        // the seat at up to KNEE_RATE, 18 rad/s, as a real one does: that is the swing, not the lift-off)
        for (let k = i; k < Math.min(R.length, i + 2); k++) kneeLift = Math.max(kneeLift, Math.abs(R[k].legs[s].knee - R[k - 1].legs[s].knee));
      }
      if (!lb.d && lb.k === "phase" && lb.u < .95){ heel = Math.min(heel, lb.heel[1]*1000); toe = Math.min(toe, lb.tip[1]*1000); }
      // stances: the contact point's travel while planted (from the first frame it is down)
      if (lb.d){
        let S0 = stance[s];
        if (!S0) S0 = stance[s] = {heel: null, ball: null, tip: null, max: 0, t: b.t};
        // (the contact point: the heel rolled back on it, the ball of the foot flat or rolled up onto it, the tips of
        // the toes once the foot rolls on over them, gait.js TIP_R)
        if (lb.roll > 0) S0.heel = null; else if (!S0.heel) S0.heel = lb.heel;
        if (lb.roll < 0 || lb.roll > TIP_R) S0.ball = null; else if (!S0.ball) S0.ball = lb.ball;
        if (lb.roll <= TIP_R) S0.tip = null; else if (!S0.tip) S0.tip = lb.tip;
        const ref = lb.roll < 0 ? S0.heel : lb.roll > TIP_R ? S0.tip : S0.ball, now = lb.roll < 0 ? lb.heel : lb.roll > TIP_R ? lb.tip : lb.ball;
        if (ref) S0.max = Math.max(S0.max, hyp(ref, now));
      } else if (stance[s]){ drift.push(stance[s].max*1000); stance[s] = null; }
    }
    if (b.mode === "W" && b.st === "CYCLE" && !b.legs[0].d && !b.legs[1].d) flight++;
  }
  for (const s of stance) if (s) drift.push(s.max*1000);
  // the hips
  let hipAcc = 0, top = -Infinity;
  for (const r of R) top = Math.max(top, r.hipY);
  for (let i = 1; i < R.length - 1; i++) hipAcc = Math.max(hipAcc, Math.abs(R[i + 1].hipY - 2*R[i].hipY + R[i - 1].hipY)*1000);
  const pinned = R.filter(r => r.hipY >= top - .001).length/R.length;
  // touchdowns: the footfall rows of the clock (phase swings landing)
  const falls = R.filter(r => r.fall === "L" || r.fall === "R").map(r => ({s: r.fall, t: r.t}));
  const LR = [], RL = [];
  for (let i = 1; i < falls.length; i++){ const d = falls[i].t - falls[i - 1].t; if (falls[i - 1].s === "L" && falls[i].s === "R") LR.push(d); else if (falls[i - 1].s === "R" && falls[i].s === "L") RL.push(d); }
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0)/a.length : NaN;
  const mLR = mean(LR), mRL = mean(RL);
  out.lr = +(Math.abs(mLR - mRL)/((mLR + mRL)/2)).toFixed(4);
  const vMean = mean(R.map(r => r.v)), mode = R[R.length >> 1].mode;
  const span = falls.length > 1 ? falls[falls.length - 1].t - falls[0].t : NaN;
  out.cadence = +((falls.length - 1)/span).toFixed(3);
  out.cadTable = +(vMean/tableStep(vMean, mode, scale)).toFixed(3);
  out.cadErr = +(out.cadence/out.cadTable - 1).toFixed(4);
  out.v = +vMean.toFixed(3); out.mode = mode;
  out.kneeLift = +kneeLift.toFixed(4); out.kneeAll = +kneeAll.toFixed(4); out.ballRiseMm = +ballRise.toFixed(2); out.lifts = lifts;
  out.hipAccMm = +hipAcc.toFixed(2); out.pinned = +pinned.toFixed(3); out.flight = flight;
  out.driftMm = +Math.max(0, ...drift).toFixed(2); out.stances = drift.length;
  out.heelMm = heel === Infinity ? null : +heel.toFixed(1); out.toeMm = toe === Infinity ? null : +toe.toFixed(1);
  out.jump = +jump.toFixed(4); out.jumpAt = jumpAt; out.jumpLeg = +jumpLeg.toFixed(4);
  out.falls = falls.length; out.LR = +mLR.toFixed(4); out.RL = +mRL.toFixed(4);
  void hz; void wrap;
  return out;
}
export {wrap};
