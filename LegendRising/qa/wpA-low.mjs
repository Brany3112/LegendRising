// qa/wpA-low.mjs: WP-A acceptance for what Low is, in the world.
// Owner: WP-A (DESIGN 2.3 WP-A acceptance, 1.4.4, 1.5.11, 3.9.3, 4.10).
//
//   Low        renderer.shadowMap.enabled is false; the real point-light pool is 2; lamp pools and halos are not drawn
//              at noon (visible false) and are at night; the sky is drawn last (renderOrder above every other object)
//   walking    20 m along your street at noon: no shadow redraw at all; the scripted 60 m walk (qa/record-perf.mjs WALK):
//              no frame over 25 ms (p99), and at most 12 collision rays in any frame out in the open, with at most 30
//              boxes tested per ray in every frame (not only on average); indoors (the bedroom and the lobby, walking,
//              turning, backing into corners and along the walls) at most 35 rays and 30 boxes a ray in any frame
//   memory     heap growth under 10 MB over home, ground, town and home again (garbage collected before each reading)
//   High       the shadow scheduler: walking 20 m redraws the shadows at most as often as the preset allows (5 a second)
//
//   QA_PORT=8772 node qa/wpA-low.mjs        writes qa/out/wpA-low.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {checks: [], ok: true};
const check = (name, ok, detail, soft = false) => { out.checks.push({name, ok: !!ok, soft, detail}); if (!ok && !soft) out.ok = false; console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

async function world(gfx, w = 1280, h = 720){
  const L = await launch({gfx, seed: 2, query: "perf=1", w, h});
  await career(L.page, {zone: "home", min: 12*60});
  await freeze(L.page);
  await L.page.evaluate(() => { __life.FADE.v = 0; __life.FADE.boot = false; });
  return L;
}
// a walk along your street, n metres, sprinting: frames, shadow redraws, rays and boxes tested per frame
const walkIn = (n) => (async (n) => {
  const L = __life, P = L.P, C = await import("./js/life/core/collide.js"), sky = L.sky();
  for (const k in L.keys) L.keys[k] = false;
  S.life.min = 12*60; L.LIFE.min = 12*60;
  L.enterZone("home", {x: -27, z: 4.6, y: .12, yaw: -Math.PI/2}); L.place({x: -27, z: 4.6, y: .12, yaw: -Math.PI/2});
  const R = L.renderer();
  for (let i = 0; i < 30; i++){ L.stepN(1); R.render(L.scene(), L.cam); }
  const x0 = P.x, sh0 = sky.shadow.count, ms = [], rays = [], tests = [];
  L.keys.w = L.keys.shift = true;
  for (let i = 0; i < 1200 && Math.abs(P.x - x0) < n; i++){
    const r0 = C.SGSTAT.rays, t0 = C.SGSTAT.tests, t = performance.now();
    L.stepN(1);
    ms.push(performance.now() - t); rays.push(C.SGSTAT.rays - r0); tests.push(C.SGSTAT.tests - t0);
    R.render(L.scene(), L.cam);
  }
  L.keys.w = L.keys.shift = false;
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p*s.length))].toFixed(3); };
  const sumR = rays.reduce((a, b) => a + b, 0), sumT = tests.reduce((a, b) => a + b, 0);
  return {metres: +Math.abs(P.x - x0).toFixed(1), frames: ms.length, shadowRedraws: sky.shadow.count - sh0, stepMs: {median: q(ms, .5), p99: q(ms, .99), max: +Math.max(...ms).toFixed(2)},
    raysPerFrame: {median: q(rays, .5), p95: q(rays, .95), max: Math.max(...rays), over12: rays.filter(n => n > 12).length}, testsPerRay: +(sumT/Math.max(1, sumR)).toFixed(2), maxTestsPerRay: Math.max(...rays.map((r, i) => r ? tests[i]/r : 0)).toFixed(1)};
});

{
  const {page, close, errors} = await world("low");
  try {
    const facts = await page.evaluate(() => {
      const L = __life, R = L.renderer(), sc = L.scene(), sky = L.sky();
      L.stepN(10); R.render(sc, L.cam);
      let pools = null, halos = null, maxOrder = -Infinity;
      sc.traverse(o => { if (o.isInstancedMesh && o.material && o.material.blending === 2){ if (o.renderOrder === 2) pools = o.visible; if (o.renderOrder === 3) halos = o.visible; } if (o !== sky.dome && o.renderOrder > maxOrder) maxOrder = o.renderOrder; });
      const noon = {pools, halos};
      S.life.min = 23*60; L.LIFE.min = 23*60; L.stepN(3); R.render(sc, L.cam);
      sc.traverse(o => { if (o.isInstancedMesh && o.material && o.material.blending === 2){ if (o.renderOrder === 2) pools = o.visible; if (o.renderOrder === 3) halos = o.visible; } });
      S.life.min = 12*60; L.LIFE.min = 12*60; L.stepN(3);
      return {shadowMap: R.shadowMap.enabled, pool: sky.pool.length, noon, night: {pools, halos}, skyOrder: sky.dome.renderOrder, maxOrder, aa: R.getContextAttributes().antialias, ratio: R.getPixelRatio()};
    });
    check("low: no shadow map", facts.shadowMap === false, facts.shadowMap);
    check("low: real point-light pool of 2", facts.pool === 2, facts.pool);
    check("low: lamp pools and halos not drawn at noon", facts.noon.pools === false && facts.noon.halos === false, facts.noon);
    check("low: lamp pools and halos drawn at night", facts.night.pools === true && facts.night.halos === true, facts.night);
    check("the sky is drawn last of everything solid", facts.skyOrder > facts.maxOrder, {sky: facts.skyOrder, highestOther: facts.maxOrder});
    check("low: no antialiasing, the pixel budget at 1280 x 720 is ratio 1", !facts.aa && Math.abs(facts.ratio - 1) < .01, {aa: facts.aa, ratio: facts.ratio});
    const w20 = await page.evaluate(walkIn(20), 20);
    check("low: no shadow redraw while walking 20 m", w20.shadowRedraws === 0, w20);
    const w60 = await page.evaluate(walkIn(60), 60);
    out.walk60 = w60;
    check("low: the 60 m walk has no frame over 25 ms (p99)", w60.stepMs.p99 <= 25, w60.stepMs);
    check("low: at most 12 collision rays a frame in the open (every frame of the walk)", w60.raysPerFrame.max <= 12, w60.raysPerFrame);
    check("low: at most 30 boxes tested per ray, in every frame of the walk", w60.testsPerRay <= 30 && +w60.maxTestsPerRay <= 30, {mean: w60.testsPerRay, worstFrame: w60.maxTestsPerRay});
    // indoors: walking and turning in the bedroom, along and into the lobby's walls, backing into corners (1.5.11)
    const inside = await page.evaluate(async () => {
      const C = await import("./js/life/core/collide.js"), L = __life, ST = C.SGSTAT, out = {};
      const walk = (name, at, steps, plan) => {
        L.enterZone("home", typeof at === "string" ? at : "bus"); if (typeof at === "object") L.place(at);
        for (let i = 0; i < 30; i++) L.stepN(1);
        let maxR = 0, maxT = 0, rays = 0, tests = 0;
        for (let i = 0; i < steps; i++){
          const k = plan(i);
          for (const kk of ["w", "a", "s", "d", "shift"]) L.keys[kk] = !!k[kk];
          if (k.yaw != null) L.P.yaw += k.yaw;
          if (k.pitch != null) L.P.pitch = k.pitch;
          const r0 = ST.rays, t0 = ST.tests;
          L.stepN(1);
          const dr = ST.rays - r0, dt = ST.tests - t0;
          rays += dr; tests += dt; if (dr > maxR) maxR = dr; if (dr) maxT = Math.max(maxT, dt/dr);
        }
        for (const kk of ["w", "a", "s", "d", "shift"]) L.keys[kk] = false;
        out[name] = {maxRays: maxR, testsPerRay: rays ? +(tests/rays).toFixed(2) : 0, maxTestsPerRay: +maxT.toFixed(1)};
      };
      walk("bedroom-turn", "bed", 240, i => ({yaw: .05, pitch: Math.sin(i/20)*.4}));
      walk("bedroom-walk", "bed", 300, i => ({w: true, yaw: i % 60 < 30 ? .04 : -.04}));
      walk("bedroom-corner", "bed", 400, i => ({s: true, a: i % 100 < 50, d: i % 100 >= 50, yaw: .05, pitch: Math.sin(i/25)*.8}));
      walk("lobby", {x: -9.5, z: -1, y: .12, yaw: Math.PI}, 300, i => ({w: i % 90 < 70, a: i % 120 > 100, yaw: .03}));
      walk("lobby-wallhug", {x: -9.5, z: -1, y: .12, yaw: Math.PI/2}, 400, i => ({w: i % 120 < 90, d: true, yaw: i % 80 < 40 ? .03 : -.03, pitch: Math.sin(i/30)*.6}));
      walk("stairs-area", {x: -9.5, z: -1, y: .12, yaw: 0}, 300, i => ({w: true, shift: i > 150, yaw: i % 100 < 50 ? .05 : -.05}));
      return out;
    });
    out.inside = inside;
    const worst = Object.values(inside).reduce((m, x) => ({rays: Math.max(m.rays, x.maxRays), tests: Math.max(m.tests, x.maxTestsPerRay)}), {rays: 0, tests: 0});
    check("low indoors: at most 35 collision rays in any frame", worst.rays <= 35, inside);
    check("low indoors: at most 30 boxes tested per ray in any frame", worst.tests <= 30, worst);
    // memory over three zone changes
    const cdp = await page.context().newCDPSession(page);
    const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Runtime.getHeapUsage")).usedSize; };
    await page.evaluate(() => { const L = __life; L.enterZone("home", "bed"); L.stepN(30); });
    const h0 = await heap();
    for (const z of ["ground", "town", "home"]) await page.evaluate(z => { const L = __life; L.enterZone(z, z === "home" ? "bed" : "bus"); L.stepN(30); L.renderer().render(L.scene(), L.cam); }, z);
    const h1 = await heap();
    out.heap = {before: h0, after: h1, growthMB: +((h1 - h0)/1048576).toFixed(2)};
    check("heap growth under 10 MB over home, ground, town, home", h1 - h0 < 10*1048576, out.heap);
    check("low: no errors", errors.length === 0, errors.slice(0, 5));
  } finally { await close(); }
}
{
  // (a small window: the scheduler does not care how big the picture is, and SwiftShader draws High slowly)
  const {page, close, errors} = await world("high", 320, 180);
  try {
    const w = await page.evaluate(walkIn(20), 20);
    const secs = w.frames/60;
    check("high: shadow redraws while walking stay within the preset's 5 a second", w.shadowRedraws <= Math.ceil(secs*5) + 2, {redraws: w.shadowRedraws, seconds: +secs.toFixed(1)});
    check("high: no errors", errors.length === 0, errors.slice(0, 5));
  } finally { await close(); }
}
report("wpA-low", out);
console.log(out.ok ? "wpA-low: pass" : "wpA-low: FAIL");
expect(out.ok, "wpA-low failed");
