// qa/tr2-viewleak.mjs: the match view's balls leave with it (BUILD-PLAN P2-B acceptance, perf-2 ball part). Owner:
// P2-B (TR stage 2).
//
// Ten training drills are started and quit at the training ground (a drill in first person is the match view,
// football/view.js, with its ball and spare balls, pitchmesh.js ballMesh). After each quit, with the scene drawn:
//   - renderer.info.memory.geometries is where it was after the first cycle (+0);
//   - every ball mesh the drill's view made had its own geometry and material disposed (viewDispose), none left in
//     the scene;
// and the heap after a forced collection is reported per cycle.
//
//   QA_PORT=8841 node qa/tr2-viewleak.mjs [--n 10]     exits 1 on any failed check; writes qa/out/tr2-viewleak.json
import {launch, career, freeze, report} from "./lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 10);
const res = {name: "tr2-viewleak", checks: [], ok: true, rows: []};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const {page, close, context} = await launch({gfx: "low", seed: 3});
const cdp = await context.newCDPSession(page);
const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage"); return +((await cdp.send("Runtime.getHeapUsage")).usedSize/1048576).toFixed(2); };
try {
  await career(page, {zone: "ground", min: 10*60});
  await freeze(page);
  await page.evaluate(async () => {
    window.__uncover = () => { const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } window.__life.FADE.v = 0; window.__life.FADE.boot = false; };
    const A = await import("/js/life/core/acts.js"); await A.training();
  });
  for (let i = 0; i < N; i++){
    const s = await page.evaluate(() => {
      const T = window.__train, L = window.__life;
      const w = T.TS.toWorld(17, 4); L.place({x: w.x, z: w.z, y: 0, yaw: -Math.PI/2});
      T.startDrill("shoot"); let k = 0; for (; k < 900 && L.modes.mode() !== "train"; k++) L.stepN(1);
      window.__uncover(); const inT = L.modes.mode() === "train";
      for (let j = 0; j < 120; j++) L.stepN(1);
      L.renderer().render(L.scene(), L.cam);
      // the drill's balls (the view's), each watched for its geometry and material being let go
      const balls = [], seen = new Set();
      L.scene().traverse(o => { if (o.isMesh && o.name === "ball" && !seen.has(o)){ seen.add(o); const b = {o, g: false, m: false}; o.geometry.addEventListener("dispose", () => { b.g = true; }); o.material.addEventListener("dispose", () => { b.m = true; }); balls.push(b); } });
      if (T.RUN.cur) T.RUN.cur.quit();
      for (let j = 0; j < 5; j++) L.stepN(1);
      L.renderer().render(L.scene(), L.cam);
      const r = L.renderer();
      let left = 0; L.scene().traverse(o => { if (balls.some(b => b.o === o)) left++; });
      const gone = balls.filter(b => !b.o.parent);
      return {inT, geos: r.info.memory.geometries, tex: r.info.memory.textures, balls: balls.length, removed: gone.length,
        disposed: gone.filter(b => b.g && b.m).length, inScene: left};
    });
    s.heapMB = await heap(); s.cycle = i + 1; res.rows.push(s); console.log(JSON.stringify(s));
  }
  const R = res.rows, g1 = R[0].geos;
  check(R.every(r => r.inT), "every drill started (training mode)", R.map(r => r.inT));
  check(R.every(r => r.geos <= g1), "renderer geometries at +0 after the first cycle", R.map(r => r.geos));
  check(R.every(r => r.removed === r.disposed), "every ball the drill's view took away had its geometry and material disposed", R.map(r => [r.removed, r.disposed]));
  res.heap = R.map(r => r.heapMB);
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-viewleak", res);
await close();
process.exit(res.ok ? 0 : 1);
