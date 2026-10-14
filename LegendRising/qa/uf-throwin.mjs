// qa/uf-throwin.mjs: the AI's throw-in, in order: the ball picked up and held overhead in both hands, the wind-up, the
// release, and the ball leaving the hands at the release frame (USER-ISSUES U6; TRAINING-SPEC 5 "throw animation,
// release, trajectory ... no teleport").
// Owner: UF-A (TR stage 3, user fixes).
//
// In the real match (__fp.enter("test:11v11"), the real simulation and rules, the bodies posed by football/view.js and
// moves.js as in play) a throw-in is given to the away side and played out by the AI. Every frame from the whistle to a
// second after the throw, with the taker's body posed every frame (the camera on him):
//   - from the moment the taker has the ball (rules.js holds it at his hands) the ball is drawn in his hands: once
//     they have taken it (THW_IN), its centre is within 0.06 m of the middle of his two hands and each hand within
//     0.22 m of it, every frame up to the release;
//   - the drawn ball never jumps: at most 0.25 m a frame while it is held, the release frame included;
//   - when the throw starts the ball is already overhead (its centre at least 1.75 m up, x scale);
//   - the wind-up: before the release the ball goes back behind the head (behind the head bone, in the body's frame);
//   - the release is one frame: the clip's release event (EV.RELEASE) and the simulation's release (the act done, the
//     ball free) in the same frame or one apart, and from the next frames the ball moves away from the hands (more
//     than 0.15 m from them three frames on);
//   - a contact sheet of the throw from the side (qa/out/uf-throwin.png).
//
//   QA_PORT=8862 node qa/uf-throwin.mjs        exits 1 on any failed check; writes qa/out/uf-throwin.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("uf-throwin");
const {page, close} = await launch({gfx: "low", seed: 5, w: 960, h: 600});
let ok = false;
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  const out = await page.evaluate(async () => {
    const L = window.__life, F = window.__fp, H = await import("./js/life/human.js"), Ru = await import("./js/life/football/rules.js");
    if (F.state) F.exit();
    F.enter("test:11v11", {});
    const fade = document.getElementById("lifeFade"); if (fade){ fade.style.transition = "none"; fade.style.opacity = "0"; } L.FADE.v = 0;
    L.stepN(2);
    const ms = F.ms, me = F.me(), spec = ms.spec, side = 1;
    // (the kick-off called off: play is live, then the ball goes out for the away side's throw)
    ms.restart = null; ms.phase = "live"; ms.clock.running = true;
    const spot = {x: 6, z: side*spec.hz};
    // you well out of the way, looking at the throw from the pitch
    me.m.x = me.x0 = -2; me.m.z = me.z0 = side*(spec.hz - 13); me.m.vx = me.m.vz = me.m.speed = 0;
    ms.ball.state = "dead";
    Ru.startRestart(ms, "throw", 1, spot);
    const rows = [], V = F.FS.V, cam = L.cam, scene = L.scene(), ren = L.renderer();
    const Vec = cam.position.constructor, q = new (cam.quaternion.constructor)(), v1 = new Vec(), v2 = new Vec(), v3 = new Vec();
    const bodyOf = id => H.bodies().find(b => b.g.name === "match-" + id);
    // a contact sheet: the throw from the side, every 3rd frame from shortly before it starts
    const cw = 200, ch = 220, cols = 8, rowsN = 7, grid = document.createElement("canvas"); grid.width = cw*cols; grid.height = ch*rowsN;
    const gx = grid.getContext("2d"); gx.fillStyle = "#222"; gx.fillRect(0, 0, grid.width, grid.height);
    let shot = 0, t0 = -1, after = -1;
    for (let i = 0; i < 60*40; i++){
      // the camera on the taker (he is posed in full every frame: the scheduler's T0/T1 for what the camera looks at)
      const R0 = ms.restart, tk = R0 && R0.taker >= 0 ? ms.agents[ms.ball.state === "held" && ms.ball.holder >= 0 ? ms.ball.holder : R0.taker] : null;
      if (tk){ const dx = tk.m.x - me.m.x, dz = tk.m.z - me.m.z; L.P.yaw = Math.atan2(-dx, -dz); L.P.pitch = -.05; }
      L.stepN(1);
      const a = tk || (rows.length ? ms.agents[rows[rows.length - 1].tk] : null);
      if (!a) continue;
      const h = bodyOf(a.id); if (!h) continue;
      scene.updateMatrixWorld(true);
      const bp = V.ball.mesh.position, hl = h.bones[H.BONE.haL].getWorldPosition(v1), hr = h.bones[H.BONE.haR].getWorldPosition(v2);
      const mid = {x: (hl.x + hr.x)/2, y: (hl.y + hr.y)/2, z: (hl.z + hr.z)/2};
      // the ball in the body's frame (behind the head: its z against the head bone's, along the body's facing)
      const head = h.bones[H.BONE.head].getWorldPosition(v3), ry = h.g.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
      const R = V.rec[a.id], act = a.act && a.act.kind === "throw" ? a.act : null;
      const row = {i, t: +ms.t.toFixed(4), tk: a.id, stage: R0 ? R0.stage : "-", taken: R0 ? !!R0.taken : true, bs: ms.ball.state, holder: ms.ball.holder,
        act: act ? {t: +act.t.toFixed(4), done: act.done} : null, rel: R && R.lastEv & H.EV.RELEASE ? 1 : 0, thw: R ? R.thw || 0 : 0,
        ball: [+bp.x.toFixed(4), +bp.y.toFixed(4), +bp.z.toFixed(4)], dMid: +Math.hypot(bp.x - mid.x, bp.y - mid.y, bp.z - mid.z).toFixed(4),
        dL: +Math.hypot(bp.x - hl.x, bp.y - hl.y, bp.z - hl.z).toFixed(4), dR: +Math.hypot(bp.x - hr.x, bp.y - hr.y, bp.z - hr.z).toFixed(4),
        behind: +((bp.x - head.x)*fx + (bp.z - head.z)*fz).toFixed(4), sc: a.scale || 1, clip: h.mv ? h.mv.key : h.mode};
      rows.push(row);
      if (act && t0 < 0) t0 = i;
      // (the pick-up and the carry every 12th frame, the throw every 3rd, a little of what comes after)
      const holding = ms.ball.state === "held" && ms.ball.holder === a.id && !act;
      const every = t0 < 0 ? 12 : 3;
      if ((holding || t0 >= 0) && i % every === 0 && shot < cols*rowsN && (after < 0 || i < after + 12)){
        cam.position.set(a.m.x - fz*0 + Math.cos(ry)*3.2 + fx*1.2, 1.6, a.m.z - Math.sin(ry)*3.2 + fz*1.2); cam.lookAt(a.m.x, 1.3, a.m.z);
        cam.fov = 55; cam.aspect = cw/ch; cam.updateProjectionMatrix(); ren.render(scene, cam);
        const cv = ren.domElement, col = shot % cols, r = Math.floor(shot/cols), sw = Math.min(cv.width, cv.height*cw/ch), shh = sw*ch/cw;
        gx.drawImage(cv, (cv.width - sw)/2, (cv.height - shh)/2, sw, shh, col*cw, r*ch, cw, ch);
        const what = act ? `throw ${act.t.toFixed(2)}s${row.rel ? " RELEASE" : ""}${act.done ? " (ball gone)" : ""}` : holding ? `${R0 ? R0.stage : ""}: ball in hands` : "after the throw";
        gx.fillStyle = "#fff"; gx.font = "12px sans-serif"; gx.fillText(what, col*cw + 4, r*ch + 14);
        shot++;
      }
      if (R0 && R0.taken && after < 0) after = i;
      if (after >= 0 && i > after + 60) break;
    }
    return {rows, png: grid.toDataURL("image/png"), spot};
  });
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, "uf-throwin.png"), Buffer.from(out.png.split(",")[1], "base64"));
  console.log("     sheet qa/out/uf-throwin.png");
  const rows = out.rows;
  fs.writeFileSync(path.join(OUT, "uf-throwin-rows.json"), JSON.stringify(rows));
  const held = rows.filter(r => r.bs === "held" && r.holder === r.tk && !r.taken);
  const firm = held.filter(r => r.thw >= 1);
  const worst = firm.reduce((m, r) => Math.max(m, r.dMid), 0), worstHand = firm.reduce((m, r) => Math.max(m, r.dL, r.dR), 0);
  check(held.length > 30 && firm.length > 20, "the taker held the ball before and during the throw", {held: held.length, inHands: firm.length});
  check(worst <= .06 && worstHand <= .22, "while held, the ball is in both hands (centre within 0.06 m of their middle, each hand within 0.22 m)", {worstMid: +worst.toFixed(3), worstHand: +worstHand.toFixed(3)});
  // no jump of the drawn ball while it is held, nor at the release
  let jump = 0, jumpAt = null;
  for (let k = 1; k < rows.length; k++){
    const a = rows[k - 1], b = rows[k];
    const heldNow = a.bs === "held" && a.holder === a.tk || (b.act && a.act && !a.act.done);
    if (!heldNow) continue;
    const d = Math.hypot(b.ball[0] - a.ball[0], b.ball[1] - a.ball[1], b.ball[2] - a.ball[2]);
    if (d > jump){ jump = d; jumpAt = b.i; }
  }
  check(jump <= .25, "the drawn ball never jumps while held or at the release (<= 0.25 m a frame)", {jump: +jump.toFixed(3), at: jumpAt});
  const actRows = rows.filter(r => r.act);
  const first = actRows[0];
  check(!!first && first.ball[1] >= 1.75*first.sc, "the throw starts with the ball overhead in his hands", first ? {y: first.ball[1], dMid: first.dMid} : null);
  const pre = actRows.filter(r => !r.act.done);
  const back = pre.reduce((m, r) => Math.min(m, r.behind), 9);
  check(back < 0, "the wind-up takes the ball back behind his head before the release", {mostBehindM: back});
  const relClip = rows.findIndex(r => r.rel), relSim = rows.findIndex(r => r.act && r.act.done);
  check(relClip >= 0 && relSim >= 0 && Math.abs(relClip - relSim) <= 1, "the clip's release and the simulation's release are the same frame (or one apart)", {clip: relClip, sim: relSim});
  check(pre.length > 0 && pre.every(r => r.dMid <= .06), "the ball stays in both hands up to the release frame", {frames: pre.length, worst: Math.max(0, ...pre.map(r => r.dMid))});
  const r3 = relSim >= 0 ? rows[relSim + 3] : null;
  check(!!r3 && r3.dMid > .15, "after the release the ball leaves the hands", r3 ? {dMid3: r3.dMid, bs: r3.bs} : null);
  ok = true;
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
const pass = done() && ok;
await close();
process.exit(pass ? 0 : 1);
