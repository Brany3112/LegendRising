// qa/wpB-life.mjs: walking about the life world on the new locomotion (DESIGN 2.3 WP-B, 1.5.2, 3.5.3, 3.5.9).
// Owner: WP-B (Stage 1). Contracts 1.4.6 (mover, LIFE profile), 1.4.18 (gait.js), 3.5.9 (first person: stairs and
// kerbs through h.groundAt and the reach resolution).
//
// In the game, with the keys, the way a player does it (the scripts of qa/record-traj.mjs: they steer towards
// waypoints, so the same script still walks the same route after a change to movement):
//   1. stairs: down a flight of the block's stairs and back up it. No point of either foot (heel, ball, toe) is ever
//      more than 2 cm below the surface it is over, and your height only ever goes one way on a flight;
//   2. a flat door: out of your flat's door into the corridor, your height steady within 1 cm and no foot below the
//      floor;
//   3. the training ground: the squad's lap runners slip their planted feet at most 3 cm in total over 30 s;
//   4. 600 steps of random input (keys, sprint, turning) on the training ground and in the block: you are never inside
//      anything solid.
//
//   QA_PORT=8771 node qa/wpB-life.mjs        exits 1 on any failed check; writes qa/out/wpB-life.json
import {launch, career, freeze, report} from "./lib.mjs";

const res = {name: "wpB-life", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// a scripted walk in the page (segments as qa/record-traj.mjs), measuring every step. Returns the measurements
async function walk(page, cfg){
  return page.evaluate(async cfg => {
    const C = await import("./js/life/core/collide.js"), H = await import("./js/life/human.js");
    const L = window.__life, P = L.P, keys = L.keys, DT = 1/60;
    const wrap = a => { a = (a + Math.PI) % (2*Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };
    const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
    const key = (type, k) => dispatchEvent(new KeyboardEvent(type, {key: k, bubbles: true}));
    for (const k in keys) keys[k] = false;
    S.life.min = cfg.minute; window.__qa.seed(cfg.rseed || 7);
    L.enterZone(cfg.zone, cfg.at);
    const look = (yawT, pitchT) => {
      if (yawT != null) P.yaw += Math.max(-6*DT, Math.min(6*DT, wrap(yawT - P.yaw)));
      if (pitchT != null) P.pitch += Math.max(-2*DT, Math.min(2*DT, pitchT - P.pitch));
    };
    const fp = () => L.ME.fp, B = H.BONE, V = new (L.cam.position.constructor)();
    const pts = [[0, -.085, -.078, B.ftL], [0, -.025, 0, B.toL], [0, -.02, .07, B.toL], [0, -.085, -.078, B.ftR], [0, -.025, 0, B.toR], [0, -.02, .07, B.toR]];
    const segs = cfg.segs, out = {segs:[]};
    let si = 0, ss = 0, release = null, cur = null;
    for (let k = 0; k < (cfg.steps || 2400) && si < segs.length; k++){
      if (release){ key("keyup", release); release = null; }
      keys.w = keys.a = keys.s = keys.d = keys.shift = false;
      const g = segs[si];
      if (ss === 0){ cur = {name:g.name || null, frames:0, feet:[], below:0, belowAt:null, back:0, backAt:null, y0:P.feet, y1:P.feet, yMin:P.feet, yMax:P.feet}; if (g.name) out.segs.push(cur); }
      let done = false;
      if (g.go){
        const dx = g.go[0] - P.x, dz = g.go[1] - P.z, d = Math.hypot(dx, dz);
        if (d < (g.tol || .3) || ss >= (g.max || 240)) done = true;
        else { const want = yawOf(dx, dz); look(want, g.pitch != null ? g.pitch : null); keys.w = Math.abs(wrap(want - P.yaw)) < .6; keys.shift = !!g.run; }
      } else if (g.face){
        const want = yawOf(g.face[0] - P.x, g.face[1] - P.z);
        if (Math.abs(wrap(want - P.yaw)) < .01 || ss >= (g.max || 60)) done = true; else look(want, null);
      } else if (g.tap){ key("keydown", g.tap); release = g.tap; done = true; }
      else if (g.wait != null){ if (ss >= g.wait) done = true; }
      const yPrev = P.feet;
      L.step(DT);                        // (the frame qa/record-traj.mjs steps)
      ss++;
      if (cur && g.name){
        cur.frames++; cur.y1 = P.feet; cur.yMin = Math.min(cur.yMin, P.feet); cur.yMax = Math.max(cur.yMax, P.feet);
        // a flight goes one way: up (dir 1) or down (-1); a millimetre's noise allowed
        if (g.dir && (P.feet - yPrev)*g.dir < -.001){ cur.back++; if (!cur.backAt) cur.backAt = [k, +(P.feet - yPrev).toFixed(4)]; }
        // every point of both feet against the surface under it
        const h = fp(); h.g.updateMatrixWorld(true);
        for (const [x, y, z, b] of pts){
          V.set(x, y, z).applyMatrix4(h.bones[b].matrixWorld);
          const s = C.surfaceUnder(V.x, V.y + .3, V.z);
          if (s == null) continue;
          const under = s - V.y;
          if (under > cur.below){ cur.below = under; cur.belowAt = [k, b, +V.x.toFixed(2), +V.z.toFixed(2), +s.toFixed(3), +P.feet.toFixed(3), h.gait.state, h.mode, "gA" + !!h.groundAt, h.g.name,
            ...h.gait.feet.map(f => f.down ? `D y${f.y.toFixed(3)} r${f.roll.toFixed(2)} @${f.x.toFixed(2)},${f.z.toFixed(2)}` : `S ${f.sw.kind} u${f.sw.u.toFixed(2)} y1 ${f.sw.y1.toFixed(3)} gy ${f.sw.gy.toFixed(3)}`)]; }
        }
      }
      if (done){ (out.ends = out.ends || []).push([si, k, +P.x.toFixed(2), +P.feet.toFixed(2), +P.z.toFixed(2)]); si++; ss = 0; }
    }
    for (const k in keys) keys[k] = false;
    out.done = si >= segs.length; out.at = [P.x, P.feet, P.z].map(v => +v.toFixed(3));
    return out;
  }, cfg);
}

const {page, close} = await launch({gfx: "low", seed: 1});
try {
  // (as qa/record-traj.mjs: the page frozen before the career, so nothing runs but the steps the script takes)
  await freeze(page);
  await career(page, {zone: "home", min: 12*60, frames: 0});
  // 1 and 2: the flat door and the stairs (the block of qa/record-traj.mjs: career seed 1 lives in flat 304)
  const home = await walk(page, {zone: "home", at: "bed", minute: 12*60, rseed: 101, segs: [
    {go: [-1.5, -5.15], tol: .2, max: 240},
    {face: [-1.5, -3.0], max: 60}, {tap: "e"}, {wait: 36},
    {go: [-1.5, -3.15], tol: .25, max: 180, name: "door"},
    {go: [-8.8, -3.15], run: true, tol: .4, max: 150},
    {go: [-10.75, -3.7], tol: .25, max: 120},
    {go: [-10.75, -7.55], tol: .25, max: 240, pitch: -.35, name: "down", dir: -1},
    {wait: 30},
    {go: [-10.75, -3.7], tol: .25, max: 240, pitch: .1, name: "up", dir: 1},
    {wait: 30}
  ]});
  const seg = n => home.segs.find(s => s.name === n) || {};
  const door = seg("door"), down = seg("down"), up = seg("up");
  check(home.done, "the block: the scripted walk got through", {at: home.at, ends: home.ends, apt: await page.evaluate(() => S.home && S.home.apt)});
  check(door.frames > 0 && door.yMax - door.yMin <= .01 && door.below <= .02, "a flat door: height steady within 1 cm, no foot below the floor",
    {rangeCm: +((door.yMax - door.yMin)*100).toFixed(2), belowCm: +(door.below*100).toFixed(2), at: door.belowAt});
  for (const [n, s] of [["down", down], ["up", up]]){
    const climb = s.y1 - s.y0;
    check(s.frames > 0 && Math.abs(climb) > 1 && s.back === 0, `stairs ${n}: a flight, your height only ever going ${n}`, {climbM: +climb.toFixed(2), against: s.back, first: s.backAt});
    check(s.frames > 0 && s.below <= .02, `stairs ${n}: no foot more than 2 cm below the step`, {belowCm: +(s.below*100).toFixed(2), at: s.belowAt});
  }
  // 4 (in the block): random input
  const rnd = async (zone, at, minute) => page.evaluate(({zone, at, minute}) => {
    const L = window.__life, P = L.P, keys = L.keys;
    for (const k in keys) keys[k] = false;
    S.life.min = minute; window.__qa.seed(4242);
    L.enterZone(zone, at);
    let r = 99991; const rand = () => (r = (r*16807) % 2147483647)/2147483647;
    const inside = () => {
      for (const q of L.W.solids){
        if (q.off || q.y1 <= P.feet + .05 || q.y0 >= P.feet + 1.7) continue;
        if (P.x > q.x0 + .01 && P.x < q.x1 - .01 && P.z > q.z0 + .01 && P.z < q.z1 - .01) return [+P.x.toFixed(2), +P.z.toFixed(2), q.x0, q.x1, q.z0, q.z1];
      }
      return null;
    };
    let bad = 0, first = null, moved = 0, px = P.x, pz = P.z;
    for (let k = 0; k < 600; k++){
      if (k % 20 === 0){ keys.w = rand() < .6; keys.s = !keys.w && rand() < .3; keys.a = rand() < .25; keys.d = !keys.a && rand() < .25; keys.shift = rand() < .5; }
      P.yaw += (rand() - .5)*.3;
      L.stepN(1);
      moved += Math.hypot(P.x - px, P.z - pz); px = P.x; pz = P.z;
      const i = inside(); if (i){ bad++; if (!first) first = [k, ...i]; }
    }
    for (const k in keys) keys[k] = false;
    return {bad, first, movedM: +moved.toFixed(1)};
  }, {zone, at, minute});
  const rHome = await rnd("home", {x: -9.5, z: -1, y: .12, yaw: Math.PI}, 12*60);
  check(rHome.bad === 0 && rHome.movedM > 5, "600 random steps in the block's lobby: never inside a solid", rHome);
  // 3: the lap runners on the training ground, then 4 there too
  const lap = await page.evaluate(async () => {
    const H = await import("./js/life/human.js");
    const L = window.__life;
    for (const k in L.keys) L.keys[k] = false;
    S.life.min = 10*60 + 30; window.__qa.seed(5);
    L.enterZone("ground", {x: 0, z: 22, y: 0, yaw: 0});
    const run = L.W.runners || [];
    const s0 = run.map(ac => ac.P.gait ? ac.P.gait.slips : 0);
    let n0 = run.map(ac => ac.P.gait ? ac.P.gait.n : 0);
    for (let k = 0; k < 1800; k++) L.stepN(1);
    void H;
    return {runners: run.length, slipsMm: run.map((ac, i) => +(((ac.P.gait ? ac.P.gait.slips : 0) - s0[i])*1000).toFixed(1)),
      steps: run.map((ac, i) => (ac.P.gait ? ac.P.gait.n : 0) - n0[i])};
  });
  check(lap.runners > 0 && lap.steps.every(n => n > 20) && lap.slipsMm.every(v => v <= 30), "the training ground's lap runners: at most 3 cm of slip each over 30 s", lap);
  const rGround = await rnd("ground", {x: 0, z: -1, y: 0, yaw: 0}, 10*60 + 30);
  check(rGround.bad === 0 && rGround.movedM > 5, "600 random steps on the training ground: never inside a solid", rGround);
  res.home = home;
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("wpB-life", res);
await close();
process.exit(res.ok ? 0 : 1);
