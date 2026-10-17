// qa/tr10-perf.mjs: Training's cage within the low-end budgets (perf.md section 8), measured on this machine.
// Owner: P10-B (Training Mode Phase 10: performance). Contract: BUILD-PLAN P10-B acceptance "qa/tr10-perf.mjs";
// TRAINING-SPEC 8 (profile first; up to 12 NPCs plus a keeper; nothing inactive running; stable 60 FPS on Low where the
// hardware allows, never promised beyond it).
//
// Node part:
//   - the simulation of the largest drill the configuration allows (6 v 6 with me among the 12 outfield players, plus a
//     keeper: 13 agents, G0 decision h) at most 0.15 ms a 60 Hz step, and the 14-agent stress case (12 outfield NPCs, a
//     keeper and me: spec 8's literal "12 NPCs plus GK") too.
// Browser part (Low, 1280 x 720, the page's frames stepped and drawn by hand: lib.mjs freeze and perf.js handFrame):
//   - that drill in the Half cage: <= 45 draw calls, <= 80k triangles, 0 point lights, no shadow map;
//   - main-thread CPU (CDP ThreadTime, the perf-3 correction: never wall time) for a frame's step and submit: median <=
//     4.5 ms, p95 <= 6 ms;
//   - at most 12 full poses a frame (human.js ANIM.fpu);
//   - at most 16 KB allocated a frame after the warm-up (CDP sampling heap profiler, objects collected included);
//   - a reset (the runner's restart) at most 4 ms of main-thread CPU;
//   - shadows by preset: Low no shadow map, the humans on blob shadows; Medium the map holds statics only (no human mesh
//     casts); High the shadow pass at most 15 times a second over 300 frames;
//   - nothing inactive running: with the hub, the configuration sheet and the preset sheet each up for 300 of the page's
//     own frames, renderer.info.render.frame does not advance, no actor is posed, no simulation step runs, and the
//     main thread's CPU is at most 0.5 ms a frame;
//   - Full Match in the cage (11 v 11, report only, no 60 FPS gate): its calls, triangles and ThreadTime per frame,
//     against the drill's budgets and perf.md's reference (the 25-body test match: 3.0 to 3.1 ms ThreadTime a frame).
//
//   QA_PORT=8882 node qa/tr10-perf.mjs [--node]       exits 1 on any failed check; writes qa/out/tr10-perf.json
import {checker} from "./wpF-lib.mjs";
import {launch, freeze, unfreeze, trainingStart} from "./lib.mjs";
import {cagePitch} from "../js/life/football/cagespec.js";
import {simStep} from "../js/life/football/sim.js";
import {matchOf, buildTeam, drill, drillConfig} from "../js/life/train/scen-team.js";
import "../js/life/train/scen-attack.js";

const {check, done, res} = checker("tr10-perf");
const argv = process.argv.slice(2);
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p*s.length))].toFixed(3) : NaN; };

/* ---------- Node: the simulation per step ---------- */
{
  const d = drill("att-am"), cfg = drillConfig(d);
  Object.assign(cfg, {attackers: 6, defenders: 6, mates: true, opps: true, keeper: true});
  const spec = cagePitch(cfg.pitch);
  const setup = buildTeam(d, cfg, {spec});
  const time = (s, n = 1800) => {
    const {ms} = matchOf(s, spec, "train");
    ms.meAI = true;
    for (let i = 0; i < 600; i++) simStep(ms);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) simStep(ms);
    return {agents: ms.agents.filter(a => a.role === "player").length, ms: +(Number(process.hrtime.bigint() - t0)/1e6/n).toFixed(4)};
  };
  // (one run first that is not counted: the code compiled and optimised, as it is a minute into a session; then the best
  // of three, as a benchmark takes it: another job on the machine only ever adds to a run's time)
  time(setup, 3600);
  const best = s => [0, 1, 2].map(() => time(s, 3600)).reduce((a, b) => b.ms < a.ms ? b : a);
  const a13 = best(setup);
  // 14 agents: a sixth team-mate beyond the configuration's limit (spec 8 read literally: 12 NPCs plus a keeper, and me)
  const s14 = JSON.parse(JSON.stringify(setup));
  s14.mates.push(Object.assign({}, s14.mates[0], {x: s14.mates[0].x - 6, z: -s14.mates[0].z}));
  const a14 = best(s14);
  check(a13.agents === 13 && a13.ms <= 0.15, "the largest drill's simulation (13 agents: 6 v 6 with me, and a keeper) at most 0.15 ms a step", a13);
  check(a14.agents === 14 && a14.ms <= 0.15, "the 14-agent stress case (12 outfield NPCs, a keeper and me) at most 0.15 ms a step", a14);
}
if (argv.includes("--node")) process.exit(done() ? 0 : 1);

/* ---------- the browser ---------- */
const {page, context, close} = await launch({gfx: "low", seed: 7, w: 1280, h: 720, query: "perf=1"});
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const thread = async () => { const m = await cdp.send("Performance.getMetrics"); const r = m.metrics.find(x => x.name === "ThreadTime"); return r ? r.value*1000 : NaN; };
// main-thread CPU of fn (ms)
const cpu = async fn => { const a = await thread(); await fn(); return (await thread()) - a; };
try {
  await trainingStart(page, {kind: "half"});
  // the largest drill: 6 v 6 with me, and the keeper (att-am with the counts at their limits)
  const started = await page.evaluate(() => {
    const R = window.__trainRun, c = JSON.parse(JSON.stringify(R.scenario("att-am").config));
    Object.assign(c, {attackers: 6, defenders: 6, mates: true, opps: true, keeper: true, pitch: "half"});
    return R.startScenario("att-am", c);
  });
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 60000});
  await freeze(page);
  const agents = await page.evaluate(() => { const R = window.__trainRun; R.setPaused(false); return R.RUN.ms.agents.filter(a => a.role === "player").length; });
  check(started && agents === 13, "the largest drill plays: 13 agents in the Half cage", {started, agents});
  // warm-up: frames drawn by hand
  await page.evaluate(async () => { for (let i = 0; i < 180; i++) window.__perf.handFrame(); });

  /* draw calls, triangles, lights, shadows; poses */
  const snap = await page.evaluate(async () => {
    const H = await import("/js/life/human.js"), poses = [];
    const r = await new Promise(res => {
      const P = window.__perf; let n = 0;
      const tick = () => { P.handFrame(); poses.push(H.ANIM.fpu); if (++n < 300) tick(); };
      P.snapshot(300).then(res); tick();
    });
    return {calls: r.calls, tris: r.tris, pointLights: r.pointLights, shadowMap: r.shadowMap, preset: r.preset, canvas: r.canvas, poses: {max: Math.max(...poses), median: poses.slice().sort((a, b) => a - b)[150]}, frame: r.ms.frame};
  });
  check(snap.calls <= 45 && snap.tris <= 80000, "Low, 1280 x 720: at most 45 draw calls and 80k triangles", {calls: snap.calls, tris: snap.tris, canvas: snap.canvas});
  check(snap.pointLights === 0 && !snap.shadowMap && snap.preset === "low", "0 point lights, no shadow map (Low)", snap);
  check(snap.poses.max <= 12, "at most 12 full poses a frame", snap.poses);

  /* main-thread CPU per frame (ThreadTime), step and submit */
  const per = [];
  for (let i = 0; i < 240; i++) per.push(await cpu(() => page.evaluate(() => window.__perf.handFrame())));
  // (the bare cost of a CDP round trip with an empty evaluate, taken off each frame's figure)
  const bare = [];
  for (let i = 0; i < 60; i++) bare.push(await cpu(() => page.evaluate(() => 0)));
  const b0 = q(bare, .5), net = per.map(v => Math.max(0, v - b0));
  const cpuFr = {median: q(net, .5), p95: q(net, .95), bare: b0, raw: {median: q(per, .5), p95: q(per, .95)}};
  check(cpuFr.median <= 4.5 && cpuFr.p95 <= 6, "main-thread CPU (ThreadTime) for a frame's step and submit: median at most 4.5 ms, p95 at most 6 ms", cpuFr);

  /* allocations per frame after the warm-up (the sampling heap profiler, objects already collected counted too) */
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.startSampling", {samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true});
  const AF = 240;
  await page.evaluate(n => { for (let i = 0; i < n; i++) window.__perf.handFrame(); }, AF);
  const prof = await cdp.send("HeapProfiler.stopSampling");
  let bytes = 0; const top = new Map();
  const walk = n => { bytes += n.selfSize; if (n.selfSize){ const k = `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url || "").split("/").pop().split("?")[0]}:${n.callFrame.lineNumber + 1}`; top.set(k, (top.get(k) || 0) + n.selfSize); } for (const c of n.children || []) walk(c); };
  walk(prof.profile.head);
  const kbFrame = +(bytes/AF/1024).toFixed(2);
  const sites = [...top].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, +(v/AF/1024).toFixed(2)]);
  check(kbFrame <= 16, "at most 16 KB allocated a frame after the warm-up", {kbFrame, top: sites});

  /* a reset */
  const resets = [];
  for (let i = 0; i < 10; i++){
    await page.evaluate(() => { for (let k = 0; k < 30; k++) window.__perf.handFrame(); });
    resets.push(await cpu(() => page.evaluate(() => { window.__trainRun.restart(); window.__trainRun.setPaused(false); })));
  }
  const reset = {median: q(resets, .5), max: +Math.max(...resets).toFixed(3), net: +(q(resets, .5) - b0).toFixed(3)};
  check(reset.net <= 4, "a reset (the runner's restart, pooled bodies) at most 4 ms of main-thread CPU", reset);

  /* shadows by preset. A heavy change of preset (the shadows) is made by the quality module at a safe moment, never in
     the middle of a drill (quality.js safe): the drill is stopped, the preset changed and applied on the page's own
     frames, the drill started again, then stepped by hand */
  await page.evaluate(async () => { window.__Qm = await import("/js/life/core/quality.js"); });
  const sh = {};
  const setTier = async tier => {
    await page.evaluate(() => { const R = window.__trainRun; if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
    await unfreeze(page);
    await page.evaluate(tier => setGfx(tier), tier);
    await page.waitForFunction(() => window.__Qm.RQ.P === GFX.P && !window.__Qm.RQ.busy && !window.__Qm.RQ.pending, null, {timeout: 60000, polling: 200});
    await page.waitForTimeout(400);
    await page.evaluate(() => { const R = window.__trainRun, c = JSON.parse(JSON.stringify(R.scenario("att-am").config));
      Object.assign(c, {attackers: 6, defenders: 6, mates: true, opps: true, keeper: true, pitch: "half"}); R.startScenario("att-am", c); });
    await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 60000});
    await freeze(page);
    await page.evaluate(() => window.__trainRun.setPaused(false));
  };
  for (const tier of ["low", "medium", "high"]){
    await setTier(tier);
    sh[tier] = await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) window.__perf.handFrame();
      const R = window.__life.renderer(), sc = window.__life.scene();
      let humansCast = 0, staticsCast = 0, skinned = 0, blobs = 0;
      sc.traverse(o => {
        if (o.isInstancedMesh && o.userData.keep && o.material && o.material.transparent && o.material.depthWrite === false && o.renderOrder === 1) blobs = Math.max(blobs, o.count);
        if (!o.visible) return;
        if (o.isSkinnedMesh){ skinned++; if (o.castShadow) humansCast++; } else if (o.isMesh && o.castShadow) staticsCast++;
      });
      const r = await new Promise(res => { const P = window.__perf; let n = 0; const tick = () => { P.handFrame(); if (++n < 300) tick(); }; P.snapshot(300).then(res); tick(); });
      return {map: R.shadowMap.enabled, humansCast, staticsCast, skinned, blobs, shadowFrames: r.shadowFrames, preset: r.preset, applied: window.__Qm.RQ.P.tier};
    });
  }
  await setTier("low");
  check(!sh.low.map && sh.low.blobs >= 13, "Low: no shadow map; the humans on blob shadows (one under each of the drill's bodies)", sh.low);
  check(sh.medium.map && sh.medium.humansCast === 0 && sh.medium.staticsCast > 0, "Medium: the shadow map holds statics only (no human mesh casts)", sh.medium);
  // (300 frames stepped at 60 Hz are 5 s: 15 a second is 75 passes)
  check(sh.high.map && sh.high.humansCast > 0 && sh.high.shadowFrames <= 75, "High: the humans cast, their shadow pass at most 15 times a second (75 in 300 frames)", sh.high);

  /* nothing inactive running: the hub, the configuration sheet and the preset sheet over a playing drill */
  await unfreeze(page);
  const idle = {};
  for (const sheet of ["hub", "config", "presets"]){
    await page.evaluate(sheet => {
      const H = window.__trainHub;
      if (sheet === "hub") H.openHub("attacking");
      else if (sheet === "config") H.configureScenario("att-am");
      else window.__trainPresetUI.openPresets({type: "attacking", typeName: "Attacking", config: H.scenarioConfig("att-am"), scenarioId: "att-am"});
    }, sheet);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(async () => { const H = await import("/js/life/human.js"), R = window.__life.renderer(), T = window.__trainRun.RUN.ms;
      return {frame: R.info.render.frame, fpu: H.ANIM.stats.fpu, step: T ? T.step : -1, frames: window.__life.frames}; });
    const t = await cpu(() => page.waitForTimeout(5000));
    const after = await page.evaluate(async () => { const H = await import("/js/life/human.js"), R = window.__life.renderer(), T = window.__trainRun.RUN.ms;
      return {frame: R.info.render.frame, fpu: H.ANIM.stats.fpu, step: T ? T.step : -1, frames: window.__life.frames}; });
    idle[sheet] = {drawn: after.frame - before.frame, posed: after.fpu - before.fpu, steps: after.step - before.step, cpuPerFrame: +(t/300).toFixed(3), loopFrames: after.frames - before.frames};
    await page.evaluate(sheet => {
      if (sheet === "hub") window.__trainHub.closeHub(false);
      else if (sheet === "config") window.__trainConfigUI.closeConfig(false);
      else window.__trainPresetUI.closePresets ? window.__trainPresetUI.closePresets() : (typeof closeSheet === "function" && closeSheet());
    }, sheet);
    await page.waitForTimeout(800);
  }
  check(Object.values(idle).every(v => v.drawn === 0 && v.posed === 0 && v.steps === 0), "with the hub, the configuration sheet or the preset sheet up (300 frames each): nothing drawn, no actor posed, no simulation step", idle);
  check(Object.values(idle).every(v => v.cpuPerFrame <= 0.5), "and the main thread's CPU at most 0.5 ms a frame", idle);

  /* Full Match in the cage: a report against the budgets (no 60 FPS gate for 11 v 11) */
  await page.evaluate(() => { const R = window.__trainRun; if (R.RUN.cur) R.stopScenario("quit"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
  await page.evaluate(() => window.__trainFull.startFullMatch(window.__trainConfig.defaults("fullmatch")));
  await page.waitForFunction(() => window.FP.state === "live", null, {timeout: 120000});
  await freeze(page);
  await page.evaluate(() => { for (let i = 0; i < 180; i++) window.__perf.handFrame(); });
  const fmSnap = await page.evaluate(async () => { const H = await import("/js/life/human.js"), poses = [];
    const r = await new Promise(res => { const P = window.__perf; let n = 0; const tick = () => { P.handFrame(); poses.push(H.ANIM.fpu); if (++n < 300) tick(); }; P.snapshot(300).then(res); tick(); });
    return {calls: r.calls, tris: r.tris, posesMax: Math.max(...poses), bodies: H.bodies().length}; });
  const fmPer = [];
  for (let i = 0; i < 180; i++) fmPer.push(await cpu(() => page.evaluate(() => window.__perf.handFrame())));
  const fm = Object.assign(fmSnap, {cpuMedian: +(q(fmPer, .5) - b0).toFixed(3), cpuP95: +(q(fmPer, .95) - b0).toFixed(3), reference: "perf.md / frame2.json: 3.0 to 3.1 ms ThreadTime a frame for the 25-body test match on the reference container"});
  res.fullMatch = fm;
  console.log("  Full Match in the cage (report):", JSON.stringify(fm));
  check(Number.isFinite(fm.cpuMedian), "Full Match in the cage measured (report only; no 60 FPS gate for 11 v 11)", fm);
  await page.evaluate(() => window.__trainFull.backToHub());
} catch(e){ check(false, "the browser part ran", String(e && e.stack || e)); }
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
await close();
process.exit(done() ? 0 : 1);
