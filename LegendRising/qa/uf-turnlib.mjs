// qa/uf-turnlib.mjs: the measuring kit of the turning checks (qa/uf-turn.mjs) and the animation contact sheets.
// Owner: UF-A (TR stage 3, user fixes). Contract: USER-ISSUES U1 (turning by the whole body: the feet step round, the
// pelvis follows the feet, the chest leads the pelvis by at most about 0.7 rad; no foot sliding) and U7 (the AI's
// clips at the player's quality).
//
// turn(page, o) runs one body in the page the way the game drives it and returns one row a frame:
//   o.kind "ai": a footballer on the real mover (FOOTBALL profile), drawn facing the mover's yaw as football/view.js
//              draws every match body;
//          "tp": your third-person body on the LIFE profile, facing the mover's yaw (core/me.js, the turnFirst start);
//          "fp": your first-person body (headless, core/me.js and football/view.js fpPose): its group faces where you
//              look, and the look is scripted like a mouse turning it;
//   o.segs [{T, dir (degrees, the wish, from the body's starting facing, + to its left; null: no input), gait, cap,
//            face (degrees: the facing held, the mover turning to it; null: free), look (fp: degrees to turn the view
//            to over this segment, at lookRate rad/s)}]
// Each row: the group's yaw (where the owner faces the body), the hips' and the chest's yaw in the world (each bone's
// forward, flattened), each foot (planted or not, its heel and the ball of the foot in the world), the footfall count.
// metrics(rows, t0, t1) gives what U1 asks for: the chest against the pelvis (the cap), the pelvis against the feet,
// each planted foot's skate (the contact point it stands on: a foot turning about its heel or its ball is not
// sliding), the steps taken and the angle turned.
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";

async function pageTurn(o){
  const H = await import("./js/life/human.js"), Mv = await import("./js/life/mover.js"), St = await import("./js/life/stamina.js");
  await import("./js/life/moves.js"); await import("./js/life/gkmoves.js");
  const L = window.__life, scene = L.scene(), cam = L.cam, ren = L.renderer();
  if (L.ME.fp) L.ME.fp.g.visible = false; if (L.ME.tp) L.ME.tp.g.visible = false;
  const B = H.BONE, V = new (cam.position.constructor)(), Q0 = new (cam.quaternion.constructor)();
  const look = H.lookFor("footballer", o.seed || 11, {kit:["#c0392b", "#ffffff"], number:8, training:true, height:o.scale || 1});
  const h = o.kind === "fp" ? H.human(look, {noHead:true, lod:false, track:true}) : H.human(look);
  scene.add(h.g);
  const dt = 1/(o.hz || 60), prof = o.kind === "tp" ? "life" : "football";
  const prm = Mv.moverParams({sprintSpeed:50, acceleration:50, dribbling:50}, prof);
  const fac = St.stamFactors(St.createStam({stamina:60}), 1, {});
  const yaw0 = Math.PI/2;
  const m = Mv.createMover({x:o.x0 != null ? o.x0 : -20, z:o.z0 != null ? o.z0 : -12, yaw:yaw0});
  if (o.v0){ m.speed = o.v0; m.heading = yaw0; m.vx = -Math.sin(yaw0)*o.v0; m.vz = -Math.cos(yaw0)*o.v0; }
  let lookYaw = yaw0;
  const groupYaw = () => (o.kind === "fp" ? lookYaw : m.yaw) + Math.PI;
  const place = () => { h.g.position.set(m.x, 0, m.z); h.g.rotation.y = groupYaw(); };
  place();
  const st = {mode:"move", speed:0, intent:0, root:{x:0, z:0}, fac, look:0};
  for (let k = 0; k < 40; k++){ H.ANIM.frame++; H.ANIM.fpu = 0; st.root.x = m.x; st.root.z = m.z; H.animateHuman(h, dt, st); }
  const it = {dx:0, dz:0, gait:"walk", face:null, strafe:false, speedCap:Infinity}, face = {x:0, z:0};
  const rows = [];
  const fwdYaw = b => { h.bones[b].getWorldQuaternion(Q0); V.set(0, 0, 1).applyQuaternion(Q0); return Math.atan2(V.x, V.z); };
  const pt = (bone, x, y, z) => { const p = V.set(x, y, z).applyMatrix4(h.bones[bone].matrixWorld); return [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)]; };
  const sh = o.sheet || null, grid = sh ? document.createElement("canvas") : null, cw = sh && sh.cw || 180, ch = sh && sh.ch || 200, cols = sh && sh.cols || 8;
  let gx = null, shot = 0, nShots = 0;
  const N = o.segs.reduce((s, g) => s + Math.round(g.T/dt), 0);
  if (grid){ nShots = Math.min(sh.max || 40, Math.ceil(N/sh.every)); grid.width = cw*cols; grid.height = ch*Math.ceil(nShots/cols); gx = grid.getContext("2d"); gx.fillStyle = "#222"; gx.fillRect(0, 0, grid.width, grid.height); }
  let si = 0, segT = 0, t = 0, look0 = lookYaw, lookTo = lookYaw;
  for (let i = 0; i < N; i++){
    while (si < o.segs.length && segT >= o.segs[si].T - 1e-9){ si++; segT = 0; look0 = lookYaw; }
    const g = o.segs[Math.min(si, o.segs.length - 1)];
    if (segT === 0 && g.look != null){ look0 = lookYaw; lookTo = yaw0 + g.look*Math.PI/180; }
    // the view (fp): turned towards lookTo at lookRate, like a mouse moving at a steady speed
    if (o.kind === "fp" && g.look != null){ const d = lookTo - lookYaw, s = (g.lookRate || 6)*dt; lookYaw += Math.abs(d) <= s ? d : Math.sign(d)*s; }
    // the wish: from the body's starting facing (ai, tp) or, first person, from where you look (the keys go that way)
    if (g.dir != null){
      const a = (o.kind === "fp" ? lookYaw : yaw0) + (g.dir + (g.spin ? g.spin*segT : 0))*Math.PI/180;
      it.dx = -Math.sin(a); it.dz = -Math.cos(a);
    } else { it.dx = 0; it.dz = 0; }
    it.gait = g.gait || "walk"; it.speedCap = g.cap != null ? g.cap : Infinity;
    if (o.kind === "fp"){ face.x = -Math.sin(lookYaw); face.z = -Math.cos(lookYaw); it.face = face; }
    else if (g.face != null){ const a = yaw0 + (g.face + (g.faceSpin ? g.faceSpin*segT : 0))*Math.PI/180; face.x = -Math.sin(a); face.z = -Math.cos(a); it.face = face; }
    else it.face = null;
    Mv.moverStep(m, it, prm, fac, dt, null);
    place();
    st.speed = m.speed; st.intent = g.dir != null ? m.target : 0; st.root.x = m.x; st.root.z = m.z;
    st.style = m.speed > .3 && Math.abs(Math.atan2(Math.sin(m.heading - m.yaw), Math.cos(m.heading - m.yaw))) > 2.1 && o.kind !== "tp" ? "backpedal" : undefined;
    H.ANIM.frame++; H.ANIM.fpu = 0;
    const ev = H.animateHuman(h, dt, st);
    h.g.updateMatrixWorld(true);
    const G = h.gait;
    const row = {t:+t.toFixed(4), seg:si, v:+m.speed.toFixed(3), gy:+h.g.rotation.y.toFixed(5), hy:+fwdYaw(B.hips).toFixed(5), cy:+fwdYaw(B.chest).toFixed(5),
      gn:G.n, st:G.state, fall:(ev.mask & H.EV.FOOTFALL) ? 1 : 0, slips:+(G.slips*1000).toFixed(2), legs:[]};
    for (let s = 0; s < 2; s++){
      const f = G.feet[s], ft = s ? B.ftR : B.ftL, to = s ? B.toR : B.toL;
      row.legs.push({d:f.down ? 1 : 0, yaw:+f.yaw.toFixed(4), heel:pt(ft, 0, -.085, -.078), ball:pt(to, 0, -.025, 0), tip:pt(to, 0, -.02, .07)});
    }
    rows.push(row);
    if (gx && i % sh.every === 0 && shot < nShots){
      // (from a fixed place in the world (the body's starting front, turned by sh.ang), or following the body (sh.follow))
      const yw = (sh.follow ? h.g.rotation.y : yaw0 + Math.PI) + (sh.ang || 0), fx = Math.sin(yw), fz = Math.cos(yw);
      cam.position.set(m.x + fx*(sh.dist || 3.2), sh.camY || 2.3, m.z + fz*(sh.dist || 3.2)); cam.lookAt(m.x, .7, m.z);
      cam.fov = 50; cam.aspect = cw/ch; cam.updateProjectionMatrix();
      ren.render(scene, cam);
      const cv = ren.domElement, col = shot % cols, r = Math.floor(shot/cols), sw = Math.min(cv.width, cv.height*cw/ch), shh = sw*ch/cw;
      gx.drawImage(cv, (cv.width - sw)/2, (cv.height - shh)/2, sw, shh, col*cw, r*ch, cw, ch);
      gx.fillStyle = "#fff"; gx.font = "12px sans-serif";
      const cp = Math.atan2(Math.sin(row.cy - row.hy), Math.cos(row.cy - row.hy));
      gx.fillText(`${t.toFixed(2)}s ${(o.label || "")} ${m.speed.toFixed(1)}m/s`, col*cw + 4, r*ch + 14);
      gx.fillText(`chest-pelvis ${cp.toFixed(2)} steps ${G.n}`, col*cw + 4, r*ch + 28);
      shot++;
    }
    t += dt; segT += dt;
  }
  const res = {rows, png:grid ? grid.toDataURL("image/png") : null};
  scene.remove(h.g); h.dispose();
  return res;
}

export async function turn(page, o){
  const r = await page.evaluate(pageTurn, o);
  if (r.png && o.sheetName){ fs.mkdirSync(OUT, {recursive: true}); const f = path.join(OUT, o.sheetName + ".png"); fs.writeFileSync(f, Buffer.from(r.png.split(",")[1], "base64")); r.sheetFile = f; }
  delete r.png;
  return r;
}

export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const hyp2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/* the numbers over rows t0..t1: cap (the largest |chest - pelvis| yaw), legs (the largest |pelvis - planted feet| yaw:
   how far the legs are twisted under the hips), skateMm (per stance, frame by frame the smallest of the heel's, the
   ball's and the toe tip's travel on the ground, summed: the foot's contact point; the largest over every stance), steps (footfalls), turned (degrees the group
   turned), lag (the pelvis's last yaw against the group's) */
export function metrics(rows, t0 = 0, t1 = Infinity){
  const R = rows.filter(r => r.t >= t0 - 1e-9 && r.t <= t1 + 1e-9);
  let cap = 0, legs = 0, turned = 0, skate = 0, stances = 0;
  const S = [null, null];
  for (let i = 0; i < R.length; i++){
    const r = R[i];
    cap = Math.max(cap, Math.abs(wrap(r.cy - r.hy)));
    if (i) turned += Math.abs(wrap(r.gy - R[i - 1].gy));
    const down = r.legs.filter(l => l.d);
    if (down.length){
      let sx = 0, sz = 0; for (const l of down){ sx += Math.sin(l.yaw); sz += Math.cos(l.yaw); }
      legs = Math.max(legs, Math.abs(wrap(r.hy - Math.atan2(sx, sz))));
    }
    for (let s = 0; s < 2; s++){
      const l = r.legs[s];
      // (a frame's skate: the smallest of the heel's, the ball's and the toe tip's travel over the ground in that frame,
      // so a foot turning about the point it stands on is not sliding; summed over the stance)
      if (l.d){
        if (!S[s]) S[s] = {heel:l.heel, ball:l.ball, tip:l.tip, sum:0};
        else { S[s].sum += Math.min(hyp2(S[s].heel, l.heel), hyp2(S[s].ball, l.ball), hyp2(S[s].tip, l.tip)); S[s].heel = l.heel; S[s].ball = l.ball; S[s].tip = l.tip; }
      } else if (S[s]){ skate = Math.max(skate, S[s].sum); stances++; S[s] = null; }
    }
  }
  for (const s of S) if (s){ skate = Math.max(skate, s.sum); stances++; }
  const last = R[R.length - 1];
  return {cap:+cap.toFixed(3), legs:+legs.toFixed(3), skateMm:+(skate*1000).toFixed(1), stances, steps:R.length ? last.gn - R[0].gn : 0,
    turned:+(turned*180/Math.PI).toFixed(1), lag:last ? +Math.abs(wrap(last.hy - last.gy)).toFixed(3) : 0, slipsMm:last ? last.slips : 0};
}
