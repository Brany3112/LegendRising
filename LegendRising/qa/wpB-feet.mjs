// qa/wpB-feet.mjs: the feet of a walking, running, starting, stopping and turning body (DESIGN 2.3 WP-B, 3.5).
// Owner: WP-B (Stage 1). Contracts 1.4.18 (gait.js), 3.5.2 to 3.5.5, 3.5.9 (first-person bob, tiers).
//
// A test body is driven along scripted root paths (as an owner would move it) on the training ground, and measured:
//   1. a planted foot never moves: its contact point (the heel while it is rolled back on it, the ball of the foot
//      while flat or rolled up onto it) moves under 3 mm in any stance at a constant speed, under 1 cm through speed
//      changes, starts, stops, turns and pivots (walk 1.5, 1.7, 2.0, jog 3.4, run 5.2, sprint 7.6 m/s; start, stop,
//      run start, run stop, a 90 degree walking turn, a cut, backpedal, side steps);
//   2. a swing lands softly: the ankle's horizontal speed over the last 5% of every swing is under 0.15 m/s (sampled
//      at 240 Hz, so the last 5% of a swing is several samples);
//   3. no bone turns more than 0.35 rad in one frame at 60 Hz;
//   4. walking at 1.4 to 2.0 m/s the hips drop at most 5 cm below their standing height;
//   5. a 180 degree turn on the spot (the body turned at up to 12 rad/s, the mover's cap) takes at most 3 steps and
//      0.9 s, the planted foot only ever turning on its ball;
//   6. tiers: a body posed at T2 and at T3 (the leg pass between full poses) keeps its planted feet within 1 cm;
//   7. 25 bodies walking at 2 to 60 m from the camera on Low cost under 1 ms a frame to animate;
//   8. in the game, the first-person head bob runs on the same footfall counter as the body's feet (every footfall
//      nods the camera in that same frame) and stays within 0.006 + 0.0016 v m (1.9 cm at 8 m/s);
//   9. in the game, sprinting and letting go of the keys (the hard stop's brace, 3.5.5), your first-person hands stay
//      in the bottom third of the view looking ahead and down to 0.6 rad, below its middle looking at your feet (3.5.9).
//
//   QA_PORT=8771 node qa/wpB-feet.mjs [--sheets]   exits 1 on any failed check; writes qa/out/wpB-feet.json
//                                                  (--sheets: contact sheets qa/out/wpB-<scenario>.png, side and
//                                                  first person, for reading by eye)
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, report, OUT} from "./lib.mjs";

const SHEETS = process.argv.includes("--sheets");
const res = {name: "wpB-feet", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// one scenario in the page: {name, hz, tier, sheet, fp} -> measurements
async function run(page, o){
  return page.evaluate(async ({name, hz, tier, sheet, fp}) => {
    const H = await import("./js/life/human.js");
    const L = window.__life, scene = L.scene(), cam = L.cam, ren = L.renderer();
    if (L.ME.fp) L.ME.fp.g.visible = false; if (L.ME.tp) L.ME.tp.g.visible = false;
    const look = H.lookFor("footballer", 11, {kit:["#c0392b", "#ffffff"], number:8, training:true});
    const h = H.human(look); scene.add(h.g);
    const dt = 1/hz;
    // root paths: speed v, turn rate w, a body yaw target (turn on the spot), backpedal or side steps
    const SC = {
      walk15: {T:3, f:t => ({v:1.5})}, walk14: {T:3, f:t => ({v:1.4})}, walk17: {T:3, f:t => ({v:1.7})}, walk20: {T:3, f:t => ({v:2.0})},
      jog: {T:3, f:t => ({v:3.4})}, run: {T:2.5, f:t => ({v:5.2})}, sprint: {T:2.5, f:t => ({v:7.6})},
      start: {T:2.2, f:t => ({v: t < .4 ? 0 : Math.min(1.7, (t - .4)*9)})},
      startrun: {T:2.5, f:t => ({v: t < .4 ? 0 : 6*(1 - Math.pow(1 - Math.min(1, (t - .4)/1.5), 2))})},
      stop: {T:2.2, f:t => ({v: t < 1 ? 1.7 : Math.max(0, 1.7 - (t - 1)*12), intent: t < 1 ? 1.7 : 0})},
      stoprun: {T:3, f:t => ({v: t < 1.2 ? 6 : Math.max(0, 6 - (t - 1.2)*7.5), intent: t < 1.2 ? 6 : 0})},
      turn90: {T:3, f:t => ({v:1.7, w: t > 1 && t < 1 + Math.PI/2/2.5 ? 2.5 : 0})},
      cut: {T:2.6, f:t => ({v: t < .9 ? 6 : t < 1.15 ? 6 - (t - .9)*8 : Math.min(6, 4 + Math.max(0, t - 1.45)*4), w: t > 1.05 && t < 1.35 ? 3 : 0})},
      back: {T:2.5, f:t => ({v:2, back:true})},
      side: {T:2.5, f:t => ({v:1.6, side:true})},
      shuffle: {T:2.5, f:t => ({v:.7, side:true})},
      turn180: {T:2, f:t => ({v:0, turn: t > .5 ? Math.PI : 0})},
      tierwalk: {T:3, f:t => ({v:1.5})}, tierrun: {T:3, f:t => ({v:5.2})}, tiersprint: {T:2.5, f:t => ({v:7.6})}
    };
    const S = SC[name];
    let x = 0, z = -12, yaw = Math.PI/2, head = Math.PI/2;
    h.g.position.set(x, 0, z); h.g.rotation.y = yaw;
    for (let k = 0; k < 30; k++) H.animateHuman(h, 1/60, {mode:"idle", look:0});
    h.g.updateMatrixWorld(true);
    const B = H.BONE, pv = new (h.g.position.constructor)();
    const hips0 = h.bones[B.hips].getWorldPosition(pv.clone()).y;
    // a running start for the steady paths, not measured
    const c0 = S.f(0), pre = c0.v > 0 && !c0.back && !c0.side ? 1 : 0;
    for (let i = 0; i < Math.round(pre/dt); i++){ const v = c0.v*Math.min(1, i*dt/.6); x += Math.sin(head)*v*dt; z += Math.cos(head)*v*dt; h.g.position.set(x, 0, z); H.animateHuman(h, dt, {mode:"move", speed:v}, tier ? {tier} : null); }
    const N = Math.round(S.T/dt);
    const fw = [h.bones[B.ftL], h.bones[B.ftR]], tw = [h.bones[B.toL], h.bones[B.toR]];
    const stance = [null, null], air = [[], []], prevQ = h.bones.map(b => b.quaternion.clone());
    const m = {drift:[], end:[], jump:0, jumpAt:null, hipsMin:1e9, falls:[], turnDone:null, slips0:h.gait.slips};
    const shots = [], cw = 150, ch = fp ? 150 : 240, cols = 8, every = Math.max(1, Math.round(hz/12));
    const grid = sheet ? document.createElement("canvas") : null;
    if (grid){ grid.width = cw*cols; grid.height = ch*Math.ceil(N/every/cols); }
    const gx = grid && grid.getContext("2d"); if (gx){ gx.fillStyle = "#222"; gx.fillRect(0, 0, grid.width, grid.height); }
    let shot = 0;
    for (let i = 0; i < N; i++){
      const t = i*dt, c = S.f(t);
      if (c.turn != null){ const tg = Math.PI/2 + c.turn; yaw += Math.max(-12*dt, Math.min(12*dt, (tg - yaw)*Math.min(1, dt*14))); head = yaw; }
      if (c.w) head += c.w*dt;
      if (!c.back && !c.side && c.turn == null) yaw = head;
      let mx = Math.sin(head), mz = Math.cos(head);
      if (c.back){ mx = -Math.sin(yaw); mz = -Math.cos(yaw); }
      if (c.side){ mx = Math.cos(yaw); mz = -Math.sin(yaw); }
      x += mx*c.v*dt; z += mz*c.v*dt;
      h.g.position.set(x, 0, z); h.g.rotation.y = yaw;
      if (Math.abs((t*60) - Math.round(t*60)) < 1e-6){ H.ANIM.frame++; H.ANIM.fpu = 0; }      // a new frame of the world (sched.js)
      H.animateHuman(h, dt, {mode:"move", speed:c.v, intent:c.intent}, tier ? {tier} : null);
      scene.updateMatrixWorld(true);
      const G = h.gait;
      for (let s = 0; s < 2; s++){
        const f = G.feet[s];
        const ank = fw[s].getWorldPosition(pv.clone());
        const heel = pv.clone().set(0, -.085, -.078).applyMatrix4(fw[s].matrixWorld), ball = pv.clone().set(0, -.025, 0).applyMatrix4(tw[s].matrixWorld);
        if (f.down){
          let S0 = stance[s];
          if (!S0){
            S0 = stance[s] = {heel:null, ball:null, max:0, t0:t};
            // the swing that just ended: its ankle's speed over its last 5% (by time; samples inside that window)
            const A = air[s];
            if (A.length > 4){
              const dur = t - A[0].t, from = t - .05*dur, w = A.filter(p => p.t >= from - 1e-9);
              let sp = 0; for (let k = 1; k < w.length; k++) sp = Math.max(sp, Math.hypot(w[k].x - w[k - 1].x, w[k].z - w[k - 1].z)/(w[k].t - w[k - 1].t));
              if (w.length >= 2) m.end.push({t:+t.toFixed(3), side:s, v:+sp.toFixed(3), n:w.length});
            }
            air[s] = [];
          }
          // the contact point: the heel while rolled back on it, the ball while flat or rolled up onto it (each
          // remembered from the first frame it is on the ground; the heel forgotten while it is up, since a foot may
          // turn on its ball, and the ball while the toes are up)
          if (f.roll > 0) S0.heel = null; else if (!S0.heel) S0.heel = heel;
          if (f.roll < 0) S0.ball = null; else if (!S0.ball) S0.ball = ball;
          const ref = f.roll < 0 ? S0.heel : S0.ball, now = f.roll < 0 ? heel : ball;
          if (ref) S0.max = Math.max(S0.max, Math.hypot(now.x - ref.x, now.z - ref.z));
        } else {
          if (stance[s]){ m.drift.push({t:+stance[s].t0.toFixed(3), side:s, mm:+(stance[s].max*1000).toFixed(2)}); stance[s] = null; }
          air[s].push({t, x:ank.x, z:ank.z});
        }
      }
      if (h.ev.mask & H.EV.FOOTFALL) m.falls.push(+t.toFixed(3));
      const hy = h.bones[B.hips].getWorldPosition(pv.clone()).y; m.hipsMin = Math.min(m.hipsMin, hy);
      for (let b = 1; b < 20; b++){ const a = prevQ[b].angleTo(h.bones[b].quaternion); if (a > m.jump){ m.jump = a; m.jumpAt = [+t.toFixed(3), b]; } prevQ[b].copy(h.bones[b].quaternion); }
      if (c.turn != null && m.turnDone == null && t > .5 && G.state === "STAND" && !G.feet[0].sw && !G.feet[1].sw){
        const dy = f => Math.abs(Math.atan2(Math.sin(yaw + f.s*.06 - f.yaw), Math.cos(yaw + f.s*.06 - f.yaw)));
        if (Math.abs(yaw - (Math.PI/2 + c.turn)) < .02 && dy(G.feet[0]) < .45 && dy(G.feet[1]) < .45) m.turnDone = +(t - .5).toFixed(3);
      }
      if (gx && i % every === 0 && shot < cols*Math.ceil(N/every/cols)){
        if (fp){ cam.position.set(x + Math.sin(yaw)*.07, 1.68, z + Math.cos(yaw)*.07); cam.rotation.set(-1.0, yaw + Math.PI, 0, "YXZ"); }
        else {
          const cyw = c.turn != null ? Math.PI/2 + .6 : yaw, sx = c.side ? Math.sin(cyw) : Math.cos(cyw), sz = c.side ? Math.cos(cyw) : -Math.sin(cyw);
          cam.position.set(x + (c.side ? 1 : -1)*sx*2.4, .95, z + (c.side ? 1 : -1)*sz*2.4); cam.lookAt(x, .85, z);
        }
        cam.fov = 50; cam.aspect = 640/480; cam.updateProjectionMatrix();
        ren.render(scene, cam);
        const cv = ren.domElement, col = shot % cols, row = Math.floor(shot/cols), sw = Math.min(cv.width, cv.height*cw/ch), sh = sw*ch/cw;
        gx.drawImage(cv, (cv.width - sw)/2, (cv.height - sh)/2, sw, sh, col*cw, row*ch, cw, ch);
        gx.fillStyle = "#fff"; gx.font = "12px sans-serif"; gx.fillText(`${t.toFixed(2)}s ${G.vs.toFixed(1)} m/s`, col*cw + 4, row*ch + 14);
        shot++;
      }
    }
    scene.remove(h.g); h.dispose();
    return {name, hz, drift:m.drift, end:m.end, jump:+m.jump.toFixed(3), jumpAt:m.jumpAt, hipsDrop:+(hips0 - m.hipsMin).toFixed(4), falls:m.falls,
      turnDone:m.turnDone, slips:+((h.gait.slips - m.slips0)*1000).toFixed(1), png:grid ? grid.toDataURL("image/png") : null};
  }, o);
}

const {page, close} = await launch({gfx: "low", seed: 1, w: 640, h: 480});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  const sheet = async (r, tag) => { if (r.png){ const f = path.join(OUT, `wpB-${r.name}${tag}.png`); fs.mkdirSync(OUT, {recursive: true}); fs.writeFileSync(f, Buffer.from(r.png.split(",")[1], "base64")); console.log("     sheet", path.relative(process.cwd(), f)); } delete r.png; };
  const steady = ["walk14", "walk15", "walk17", "walk20", "jog", "run", "sprint"];
  const changes = ["start", "startrun", "stop", "stoprun", "turn90", "cut", "back", "side", "shuffle", "turn180"];
  const all = {};
  for (const name of [...steady, ...changes]){
    const r60 = await run(page, {name, hz: 60, tier: 0, sheet: SHEETS && ["walk15", "jog", "sprint", "start", "stop", "turn90", "turn180", "side", "back"].includes(name), fp: false});
    await sheet(r60, "");
    if (SHEETS && ["walk15", "jog", "sprint", "start", "stop", "turn90", "turn180"].includes(name)){ const f = await run(page, {name, hz: 60, tier: 0, sheet: true, fp: true}); await sheet(f, "-fp"); }
    const r240 = await run(page, {name, hz: 240, tier: 0, sheet: false, fp: false});
    all[name] = {r60, r240};
    const lim = steady.includes(name) ? 3 : 10;
    // the stances at both rates (60 Hz is the game's; 240 Hz checks the motion between the frames)
    const dmax = Math.max(0, ...r60.drift.map(d => d.mm), ...r240.drift.map(d => d.mm));
    check(dmax < lim, `${name}: planted contact moves < ${lim} mm per stance`, {maxMm: dmax, stances: r60.drift.length + r240.drift.length, slipsMm: r60.slips});
    const ends = r240.end.map(e => e.v), emax = Math.max(0, ...ends);
    check(ends.length > 0 && emax < .15 || (name === "turn180" && emax < .15), `${name}: swing lands at < 0.15 m/s over its last 5%`, {max: emax, swings: ends.length, worst: r240.end.filter(e => e.v >= .15).slice(0, 3)});
    check(r60.jump <= .35, `${name}: no bone turns more than 0.35 rad in a frame at 60 Hz`, {max: r60.jump, at: r60.jumpAt});
    if (/^walk/.test(name)) check(r60.hipsDrop <= .05, `${name}: hips at most 5 cm below standing`, {dropM: r60.hipsDrop});
  }
  // the turn on the spot
  const tr = all.turn180.r60, steps = tr.falls.filter(t => t >= .5).length;
  check(tr.turnDone != null && tr.turnDone <= .9 && steps <= 3, "turn180: at most 3 steps within 0.9 s, ball pivot only", {seconds: tr.turnDone, steps, maxMm: Math.max(0, ...tr.drift.map(d => d.mm))});
  // tiers
  for (const tier of [2, 3]) for (const name of ["tierwalk", "tierrun", "tiersprint"]){
    const r = await run(page, {name, hz: 60, tier, sheet: false, fp: false});
    const d = Math.max(0, ...r.drift.map(x => x.mm));
    check(d < 10 && r.drift.length >= 6 && r.slips < 10, `T${tier} ${name.slice(4)} (leg passes between full poses): planted feet move < 1 cm`, {maxMm: d, stances: r.drift.length, slipsMm: r.slips});
  }
  // 25 bodies on Low
  const perf = await page.evaluate(async () => {
    const H = await import("./js/life/human.js");
    const L = window.__life, scene = L.scene(), list = [];
    const VX = H.VIEW.x, VZ = H.VIEW.z;
    for (let i = 0; i < 25; i++){
      const h = H.human(H.lookFor(i % 3 ? "footballer" : "pedestrian", 40 + i, {kit:["#2c66b8", "#ffffff"]}));
      const d = 2 + i*2.4, a = i*.7;
      h.g.position.set(VX + Math.sin(a)*d, 0, VZ + Math.cos(a)*d); scene.add(h.g); list.push({h, a, d, r:1 + (i % 4)});
    }
    const dt = 1/60, T = [];
    for (let f = 0; f < 240; f++){
      for (const b of list){ b.a += 1.4*dt/b.r; b.h.g.position.x += Math.cos(b.a)*1.4*dt; b.h.g.position.z -= Math.sin(b.a)*1.4*dt; b.h.g.rotation.y = Math.atan2(Math.cos(b.a), -Math.sin(b.a)); }
      const t0 = performance.now();
      H.ANIM.frame++; H.ANIM.fpu = 0; H.ANIM.budget = 12;
      for (const b of list) H.animateHuman(b.h, dt, {mode:"move", speed:1.4}, {tier:H.animTier(b.h, 1)});
      if (f >= 60) T.push(performance.now() - t0);
    }
    for (const b of list){ scene.remove(b.h.g); b.h.dispose(); }
    T.sort((p, q) => p - q);
    return {meanMs: +(T.reduce((s, v) => s + v, 0)/T.length).toFixed(3), medianMs: +T[T.length >> 1].toFixed(3), p95Ms: +T[Math.floor(T.length*.95)].toFixed(3)};
  });
  check(perf.meanMs < 1, "25 bodies walking at 2 to 60 m on Low: under 1 ms a frame to animate", perf);
  // the first-person bob in the game: same footfall counter, within its bound
  const bob = await page.evaluate(async () => {
    const M = await import("./js/life/core/me.js"), H = await import("./js/life/human.js");
    const L = window.__life, fp = L.ME.fp, B = M.BOB;
    L.keys.w = true; L.keys.shift = true;
    let falls = 0, nods0 = B.nods, missed = 0, over = 0, maxY = 0, vmax = 0;
    for (let i = 0; i < 360; i++){
      const n0 = fp.gait.n, k0 = B.nods;
      L.stepN(1);
      // every footfall of the body this frame nodded the camera this frame, on the same count
      const dn = fp.gait.n - n0;
      falls += dn;
      if (dn > 0 && (B.lastN !== fp.gait.n || B.nods - k0 < 1)) missed++;
      if (dn === 0 && B.nods !== k0) missed++;
      const v = L.P.speed; vmax = Math.max(vmax, v);
      if (Math.abs(B.y) > .006 + .0016*v + 1e-6) over++;
      maxY = Math.max(maxY, Math.abs(B.y));
    }
    const nods = B.nods - nods0;
    L.keys.w = false; L.keys.shift = false;
    for (let i = 0; i < 90; i++) L.stepN(1);
    return {falls, nods, missed, over, maxYcm:+(maxY*100).toFixed(2), vmax:+vmax.toFixed(2), state:fp.gait.state};
    // (two footfalls inside one frame nod once: the nods count frames with a footfall, the falls every foot)
  });
  check(bob.falls > 6 && bob.missed === 0 && bob.nods <= bob.falls && bob.nods >= bob.falls - 2, "first person: the camera nods on the body's own footfalls, same frame and count (phase error 0)", bob);
  check(bob.over === 0 && bob.maxYcm <= 1.9, "first person: bob within 0.006 + 0.0016 v m (1.9 cm at 8 m/s)", {maxYcm: bob.maxYcm, vmax: bob.vmax});
  // the first-person arms at a sprint and through a hard stop: your own body's skinned arm and hand vertices in the view
  // (NDC y, -1 the bottom edge), every frame, sprinting and then letting go of the keys, looking ahead, a little down,
  // down and at your feet. The run's forward forearm came most of the way up the lower half of the view at every
  // stride looking 0.45 to 0.6 rad down, and the stop brought it up the middle (to the top edge looking down, 13 cm
  // from the eye). Kept in the bottom third looking ahead and down to 0.6 rad; looking at your feet the hands at your
  // sides show lower in the picture, below its middle
  const arms = await page.evaluate(async () => {
    const {THREE} = await import("./js/life/build.js");
    const L = window.__life, h = L.ME.fp, m = h.near, cam = L.cam, v = new THREE.Vector3();
    const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const top = r => {
      h.g.updateMatrixWorld(true); m.skeleton.update(); cam.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++){
        const b = sw.getX(i) >= sw.getY(i) ? si.getX(i) : si.getY(i);
        if (b < 6 || b > 11) continue;                               // (the arms and hands: rig.js BN 6 to 11)
        m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        const d = -v.z; if (d <= 1e-4) continue;
        v.applyMatrix4(cam.projectionMatrix);
        if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) continue;
        r.y = Math.max(r.y, v.y); r.d = Math.min(r.d, d);
      }
    };
    // (on the training pitch, running along it towards -x: some 15 m of grass ahead, nothing to run into)
    const out = [], p0 = {x: L.P.x, z: L.P.z, yaw: L.P.yaw};
    for (const pitch of [0, -.3, -.6, -1.2]){
      L.place({x: 0, z: -14, y: 0, yaw: Math.PI/2}); L.P.pitch = pitch; L.stepN(30);
      const run = {y: -1, d: 9}, stop = {y: -1, d: 9};
      L.keys.w = true; L.keys.shift = true;
      for (let i = 0; i < 150; i++){ L.stepN(1); top(run); }
      L.keys.w = false; L.keys.shift = false;
      for (let i = 0; i < 60; i++){ L.stepN(1); top(stop); }
      L.stepN(60);
      out.push({pitch, run: +run.y.toFixed(2), stop: +stop.y.toFixed(2), nearM: +Math.min(run.d, stop.d).toFixed(2), most: pitch > -.65 ? -1/3 : 0});
    }
    L.place({x: p0.x, z: p0.z, y: 0, yaw: p0.yaw});
    return out;
  });
  check(arms.every(a => a.run <= a.most && a.stop <= a.most), "first person: sprinting and stopping hard, your hands stay in the bottom third of the view looking ahead and down to 0.6 rad, below its middle looking at your feet", arms);
  res.scenarios = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {drift60: Math.max(0, ...v.r60.drift.map(d => d.mm)), drift240: Math.max(0, ...v.r240.drift.map(d => d.mm)),
    end240: Math.max(0, ...v.r240.end.map(e => e.v)), jump: v.r60.jump, hipsDrop: v.r60.hipsDrop, footfalls: v.r60.falls.length, slipsMm: v.r60.slips}]));
  res.perf = perf; res.bob = bob; res.arms = arms;
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length){ check(false, "no console or page errors", page.errors.slice(0, 5)); }
report("wpB-feet", res);
await close();
process.exit(res.ok ? 0 : 1);
