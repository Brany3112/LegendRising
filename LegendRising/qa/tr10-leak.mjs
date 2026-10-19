// qa/tr10-leak.mjs: nothing piles up over Training's resets and visits (browser).
// Owner: P10-B (Training Mode Phase 10: performance). Contract: BUILD-PLAN P10-B acceptance "qa/tr10-leak.mjs"; perf.md
// section 8 (repeated resets); TRAINING-SPEC 8 (no leaks, no accumulating loops or listeners over repeated resets).
//
// The largest drill (6 v 6 with me, and a keeper) in the Half cage, Low:
//   - 50 resets (the runner's restart: a new simulation, the same pooled bodies), with play between them;
//   - then 10 Training enter/exit cycles (each: into Training by the module, the drill started and reset 3 times, out
//     to the title);
// against the reading after the first cycle: renderer.info geometries, textures and programs +0; the scheduler's tasks,
// fixed tasks and actors +0; window and document listeners +0; DOM nodes +0; pending timers 0 (once the page's own short
// ones have run out); bodies() +0; merge entries (chunks.js MG) for objects outside the scene 0; the JS heap after a
// forced GC within +1 MB.
//
//   QA_PORT=8882 node qa/tr10-leak.mjs        exits 1 on any failed check; writes qa/out/tr10-leak.json
import {checker} from "./wpF-lib.mjs";
import {launch, freeze, unfreeze} from "./lib.mjs";

const {check, done} = checker("tr10-leak");
const counters = () => {
  const live = window.__listeners = new Map();
  const key = (t, type, o) => [t === window ? "window" : "document", type, (typeof o === "boolean" ? o : !!(o && o.capture)) ? "c" : "b"].join(":");
  for (const T of [Window.prototype, Document.prototype]){
    const a = T.addEventListener, r = T.removeEventListener;
    T.addEventListener = function(type, fn, o){ const k = key(this, type, o); let s = live.get(k); if (!s) live.set(k, s = new Set()); s.add(fn); return a.apply(this, arguments); };
    T.removeEventListener = function(type, fn, o){ const s = live.get(key(this, type, o)); if (s) s.delete(fn); return r.apply(this, arguments); };
  }
  const T = window.__timers = new Set(), st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = function(fn, ms, ...x){ const id = st(function(){ T.delete(id); return typeof fn === "function" ? fn.apply(this, arguments) : undefined; }, ms, ...x); T.add(id); return id; };
  window.clearTimeout = id => { T.delete(id); return ct(id); };
  window.setInterval = function(...x){ const id = si(...x); T.add("i" + id); return id; };
  window.clearInterval = id => { T.delete("i" + id); return ci(id); };
};
const {page, context, close} = await launch({gfx: "low", seed: 7, w: 1280, h: 720});
await context.addInitScript(counters);
await page.reload();
await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
const cdp = await context.newCDPSession(page);
await cdp.send("HeapProfiler.enable");
const gcHeap = async () => { await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage"); const h = await cdp.send("Runtime.getHeapUsage"); return h.usedSize; };

const DRILL = async () => {
  const R = window.__trainRun, c = JSON.parse(JSON.stringify(R.scenario("att-am").config));
  Object.assign(c, {attackers: 6, defenders: 6, mates: true, opps: true, keeper: true, pitch: "half"});
  return R.startScenario("att-am", c);
};
const reading = () => page.evaluate(async () => {
  const L = window.__life, R = L.renderer(), H = await import("/js/life/human.js"), Ch = await import("/js/life/chunks.js"), Sc = await import("/js/life/core/sched.js");
  let ls = 0; for (const s of window.__listeners.values()) ls += s.size;
  const inScene = o => { for (let p = o; p; p = p.parent) if (p === L.scene()) return true; return false; };
  let out = 0; for (const o of Ch.MG.still.keys()) if (!inScene(o)) out++; for (const it of Ch.MG.items.values()) if (!inScene(it.o)) out++;
  return {geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs ? R.info.programs.length : 0,
    sched: Sc.SCHED.stats().counts, listeners: ls, dom: document.getElementsByTagName("*").length, timers: window.__timers.size, bodies: H.bodies().length, mgOut: out};
});
try {
  const enter = async () => {
    await unfreeze(page);
    await page.evaluate(async () => { const m = await import("/js/life/train/index.js"); await m.enterTraining({kind: "half"}); window.__trainHub.closeHub(); });
    await page.waitForFunction(() => window.__life.LIFE.zone === "cage", null, {timeout: 60000});
    await page.evaluate(DRILL);
    await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 60000});
    await page.evaluate(() => window.__trainRun.setPaused(false));
  };
  const leave = async () => {
    await unfreeze(page);
    await page.evaluate(async () => { const m = await import("/js/life/train/index.js"); m.exitTraining(); });
    await page.waitForFunction(() => !!document.querySelector(".title-screen"), null, {timeout: 60000});
    await page.waitForTimeout(1500);
  };
  const resets = n => page.evaluate(n => { const R = window.__trainRun, L = window.__life; for (let i = 0; i < n; i++){ for (let k = 0; k < 20; k++) L.stepN(1); R.restart(); R.setPaused(false); } for (let k = 0; k < 20; k++) L.stepN(1); }, n);

  // the first cycle: in, a few resets, out; the reading after it (and its heap)
  await enter(); await resets(3); await leave();
  await page.waitForTimeout(4000);
  const a = await reading(), heap0 = await gcHeap();

  // 50 resets in one visit
  await enter();
  await freeze(page);
  const in0 = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  await resets(50);
  const in1 = await page.evaluate(() => ({geometries: window.__life.renderer().info.memory.geometries, bodies: null}));
  await leave();
  // 10 enter/exit cycles
  for (let i = 0; i < 10; i++){ await enter(); await freeze(page); await resets(3); await leave(); }
  await page.waitForTimeout(4000);
  const b = await reading(), heap1 = await gcHeap();
  const grew = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  check(in1.geometries === in0, "50 resets in one visit: renderer.info geometries +0", {before: in0, after: in1.geometries});
  check(!grew.filter(k => k !== "timers").length, "after 50 resets and 10 enter/exit cycles: renderer.info, the scheduler, listeners, DOM, bodies() and merge entries +0", {grew, first: a, last: b});
  check(b.timers === 0, "no timer left pending", {timers: b.timers});
  check(b.mgOut === 0, "no merge entry for an object outside the scene", b.mgOut);
  const dMB = +((heap1 - heap0)/1048576).toFixed(2);
  check(dMB <= 1, "the JS heap after a forced GC within +1 MB of the first cycle's", {first: +(heap0/1048576).toFixed(2), last: +(heap1/1048576).toFixed(2), dMB});
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
await close();
process.exit(done() ? 0 : 1);
