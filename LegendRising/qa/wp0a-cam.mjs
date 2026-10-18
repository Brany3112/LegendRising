// qa/wp0a-cam.mjs: WP-0A acceptance for the camera owners and kicks.
// Owner: WP-0A (DESIGN 2.2 WP-0A acceptance; contract 1.4.2).
//
//   owners   a test owner at priority 50 controls the camera while pushed; camPop gives it back to life-fp with the
//            same pose as before (within 1e-6)
//   kicks    camKick({pitch: 1}) never turns the view more than 3 degrees and settles back; an offset never more than
//            6 cm per axis
//   modes    build mode owns the camera as build (its near plane and field of view) and gives back your eyes' near
//            plane and field of view; a gym set's shot is drill-view; a cinematic is cine; third person is life-tp
import {launch, career, freeze, report} from "./lib.mjs";

const checks = [];
const check = (name, ok, detail) => {
  checks.push({name, ok: !!ok, detail});
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`);
};

const {page, close} = await launch({gfx: "low", seed: 9});
try {
  await career(page, {zone: "home", at: "bed", min: 12*60});
  await freeze(page);

  const ow = await page.evaluate(() => {
    const L = __life, cam = L.cam, out = {};
    const pose = () => [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w];
    // let the eye's springs come to rest first: the pose given back must be the one a still player has
    L.stepN(300);
    let prev = pose(), still = 0;
    for (let i = 0; i < 300 && still < 5; i++){ L.stepN(1); const p = pose(); still = Math.max(...p.map((v, k) => Math.abs(v - prev[k]))) < 1e-12 ? still + 1 : 0; prev = p; }
    out.still = still;
    out.top0 = L.cam.top();
    const p0 = pose();
    L.camera.push({id:"qa-cam", priority:50, frame:(dt, c) => { c.position.set(1, 20, 3); c.lookAt(0, 0, 0); }});
    L.stepN(3);
    out.topPushed = L.cam.top();
    const p1 = pose();
    out.atTest = Math.hypot(p1[0] - 1, p1[1] - 20, p1[2] - 3);
    L.camera.pop("qa-cam");
    L.stepN(1);
    out.topPopped = L.cam.top();
    const p2 = pose();
    out.back = Math.max(...p2.map((v, i) => Math.abs(v - p0[i])));
    // kicks: the largest turn away from the still pose, and where it settles
    const q0 = cam.quaternion.clone(), ang = () => 2*Math.acos(Math.min(1, Math.abs(q0.dot(cam.quaternion))));
    L.camera.kick({pitch:1});
    let maxA = 0; for (let i = 0; i < 90; i++){ L.stepN(1); maxA = Math.max(maxA, ang()); }
    out.kickMaxDeg = maxA*180/Math.PI; out.kickEndDeg = ang()*180/Math.PI;
    L.camera.kick({yaw:-5, roll:2, pitch:-3});
    maxA = 0; for (let i = 0; i < 90; i++){ L.stepN(1); maxA = Math.max(maxA, ang()); }
    out.kick3MaxDeg = maxA*180/Math.PI;
    // an offset, measured in the camera's own frame
    const c0 = cam.position.clone();
    L.camera.kick({dy:1, dz:-1});
    let maxY = 0, maxZ = 0;
    for (let i = 0; i < 90; i++){
      L.stepN(1);
      const d = cam.position.clone().sub(c0).applyQuaternion(cam.quaternion.clone().invert());
      maxY = Math.max(maxY, Math.abs(d.y)); maxZ = Math.max(maxZ, Math.abs(d.z));
    }
    out.offY = maxY; out.offZ = maxZ; out.offEnd = cam.position.distanceTo(c0);
    out.kicks = Object.assign({}, L.cam.kicks);
    return out;
  });
  check("your eyes own the camera to begin with", ow.top0 === "life-fp", ow.top0);
  check("a test owner at priority 50 controls the camera while pushed", ow.topPushed === "qa-cam" && ow.atTest < 1e-9, {top: ow.topPushed, off: ow.atTest});
  check("camPop gives it back to life-fp with the same pose (1e-6)", ow.topPopped === "life-fp" && ow.back <= 1e-6, {top: ow.topPopped, err: ow.back});
  check("camKick({pitch: 1}) turns the view at most 3 degrees", ow.kickMaxDeg > 1 && ow.kickMaxDeg <= 3 + 1e-6, `${ow.kickMaxDeg.toFixed(4)} degrees`);
  check("a kick settles back", ow.kickEndDeg < 1e-3 && !ow.kicks.on, `${ow.kickEndDeg} degrees left`);
  check("kicks on three axes at once stay within 3 degrees on each", ow.kick3MaxDeg <= 3*Math.sqrt(3) + 1e-6, `${ow.kick3MaxDeg.toFixed(4)} degrees in all`);
  check("an offset kick stays within 6 cm on each axis and settles", ow.offY <= .06 + 1e-9 && ow.offZ <= .06 + 1e-9 && ow.offY > .03 && ow.offEnd < 1e-4, {dy: ow.offY, dz: ow.offZ, end: ow.offEnd});

  const md = await page.evaluate(() => {
    const L = __life, cam = L.cam, out = {};
    // build mode in your own flat
    L.enterZone("home", "bed"); L.stepN(2);
    L.buildEnter(); L.stepN(2);
    out.build = {mode:L.modes.mode(), top:L.cam.top(), near:cam.near, fov:cam.fov};
    L.buildExit(); L.stepN(1);
    out.afterBuild = {mode:L.modes.mode(), top:L.cam.top(), near:cam.near, fov:cam.fov, fovSet:L.B.fovSet};
    // a gym set's own shot
    S.energy = 90; S.fatigue = 10;
    L.enterZone("ground", "bus"); L.stepN(2);
    L.ctx.reps("squat"); L.stepN(5);
    out.set = {mode:L.modes.mode(), top:L.cam.top(), body:L.ME.tp && L.ME.tp.g.visible};
    L.keysDown(["Escape"]); L.keysUp(["Escape"]); L.stepN(1);
    out.afterSet = {mode:L.modes.mode(), top:L.cam.top()};
    // a cinematic's shot
    L.cineBegin({me:"hide", frame:(dt, c) => { c.position.set(0, 50, 0); c.lookAt(0, 0, -1); }}); L.stepN(2);
    out.cine = {mode:L.modes.mode(), top:L.cam.top(), y:cam.position.y};
    L.cineEnd(); L.stepN(1);
    out.afterCine = {mode:L.modes.mode(), top:L.cam.top()};
    // third person, out on the open pitch
    L.place({x:0, z:-15, y:0, yaw:0}); L.stepN(2);
    const v0 = S.life.view;
    S.life.view = "tp"; L.stepN(120);                             // (the glide out takes about a second)
    out.tp = {top:L.cam.top(), shown:L.ME.tpShown};
    S.life.view = "fp"; L.stepN(60);
    out.fp = {top:L.cam.top(), shown:L.ME.tpShown};
    S.life.view = v0;
    out.owners = L.camera.owners();
    return out;
  });
  check("build mode owns the camera as build, with its own near plane and field of view", md.build.mode === "build" && md.build.top === "build" && Math.abs(md.build.near - 3.65) < .02 && md.build.fov === 58, md.build);
  check("after build mode your eyes' near plane and field of view are back", md.afterBuild.mode === "life" && md.afterBuild.top === "life-fp" && md.afterBuild.near === .1 && md.afterBuild.fov === md.afterBuild.fovSet, md.afterBuild);
  check("a gym set's shot is drill-view, with your body in it", md.set.mode === "drill" && md.set.top === "drill-view" && md.set.body, md.set);
  check("leaving the set gives the camera back", md.afterSet.mode === "life" && md.afterSet.top === "life-fp", md.afterSet);
  check("a cinematic owns the camera as cine", md.cine.mode === "cine" && md.cine.top === "cine" && Math.abs(md.cine.y - 50) < 1e-9, md.cine);
  check("after the cinematic your eyes have it back", md.afterCine.mode === "life" && md.afterCine.top === "life-fp", md.afterCine);
  check("third person is the owner life-tp while it is shown", md.tp.top === "life-tp" && md.tp.shown && md.fp.top === "life-fp" && !md.fp.shown, {tp: md.tp, fp: md.fp});
  check("only your eyes are left on the stack", JSON.stringify(md.owners) === JSON.stringify(["life-fp"]), md.owners);
  check("no console or page errors", !page.errors.length, page.errors);
} catch(e){
  check("the script ran to the end", false, String(e && e.stack || e));
} finally {
  await close();
}
const ok = checks.every(c => c.ok);
report("wp0a-cam", {ok, checks});
console.log(ok ? "wp0a-cam: pass" : "wp0a-cam: FAIL");
process.exit(ok ? 0 : 1);
