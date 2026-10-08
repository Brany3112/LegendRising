// qa/perf.mjs: the rendering budgets of DESIGN 1.5.11 and the regression gate of 3.9.8, through the probe page.
// Owner: WP-A (DESIGN 1.2 qa/perf.mjs, 2.3 WP-A acceptance, 3.9.8, 4.10).
//
// For each view and tier, in a fresh browser at 1280 x 720: index.html?perf=probe&zone=..&view=..&gfx=..&t=12:00
// (js/life/perf.js): a test career at noon (made at qa/lib.mjs CAREER_AT, so the street is the same in every run), you
// at the view, warm-up frames, then measured frames, each one world
// frame stepped by hand, drawn and waited for (a one-pixel readPixels: Chromium's gl.finish() does not wait).
// Checked against qa/perf-baseline.json (I0, the tree before the rework) as ratios, never as absolute milliseconds:
//   Low     draw calls and triangles within the 1.5.11 budget of the view (+5%), no shadow pass, 2 real point lights;
//           render ms at most 50% of the Low baseline and at most 35% of the High baseline of the same view;
//           1000 collision rays (camCast, a fan from the eye) reported against the baseline's time
//   High    the lobby within 90 draw calls and 120k triangles
// SwiftShader's raster time swings with the machine's load: SwiftShader draws on every core, so another job on the
// same CPUs can double a view's render ms (measured here: one view 0.25 of its baseline on a quiet machine and 0.52
// with three busy workers alongside). So the render ratios against the recorded baseline are printed as notes, and
// the render acceptance is gated by qa/wpA-ab.mjs, which draws this tree and the I0 tree side by side in one browser,
// every view, where the load weighs on both alike. --gate-render gates them here too (a quiet machine). The CPU per
// frame (the 3.9.8 gate: at most 10% over the baseline) swings the same way against a figure recorded on another day
// (measured: town-road 1.31 and 1.15 of its recorded baseline in two runs, while wpA-ab had the same view's world step
// at 0.67 of the I0 tree's side by side), so it is a note here too, gated side by side in wpA-ab ('a world step costs
// at most 10% over the base tree's'), and here only with --gate-time or --gate-render. Calls, triangles, lights and
// shadows always count; --report gates no time ratio whatever else is asked.
//
//   QA_PORT=8772 node qa/perf.mjs                        every life view on Low, the lobby on High
//   node qa/perf.mjs --views bedroom,street --tiers low --frames 40 --warm 20
//   node qa/perf.mjs --gate-render                       the render and CPU ratios gated as well (a quiet machine)
//   node qa/perf.mjs --gate-time                         the CPU ratio gated as well
//   node qa/perf.mjs --report                            no time ratio gated
//
// Writes qa/out/perf.json.
import fs from "node:fs";
import path from "node:path";
import {launch, report, ROOT} from "./lib.mjs";

const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "perf-baseline.json"), "utf8"));
const VIEWS = opt("--views", "bedroom,lobby,street,park,yard,pitch,town-road").split(",");
const TIERS = opt("--tiers", "low,high").split(",");
const GATE_RENDER = !a.includes("--report") && a.includes("--gate-render"), GATE_TIME = GATE_RENDER || (!a.includes("--report") && a.includes("--gate-time"));
// 1.5.11, Low at 1280 x 720 (the life views; the stadium's are WP-D's)
const BUDGET = {
  bedroom: {calls: 60, tris: 60e3}, lobby: {calls: 60, tris: 60e3},
  street: {calls: 80, tris: 110e3}, park: {calls: 80, tris: 110e3},
  yard: {calls: 85, tris: 100e3}, pitch: {calls: 85, tris: 100e3},
  "town-road": {calls: 75, tris: 110e3}
};
const ZONE = {bedroom: "home", lobby: "home", street: "home", park: "home", yard: "ground", pitch: "ground", "town-road": "town"};
const out = {gateTime: GATE_TIME, gateRender: GATE_RENDER, results: {}, checks: [], ok: true};
const check = (name, ok, detail, soft = false) => {
  out.checks.push({name, ok: !!ok, soft, detail});
  if (!ok && !soft) out.ok = false;
  console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`);
};

async function probe(view, tier){
  const frames = +opt("--frames", tier === "high" ? 12 : 40), warm = +opt("--warm", tier === "high" ? 6 : 20);
  const {page, close, errors} = await launch({gfx: tier, seed: 1, query: `perf=probe&zone=${ZONE[view]}&view=${view}&gfx=${tier}&t=12:00&frames=${frames}&warm=${warm}`});
  try {
    await page.waitForFunction(() => window.__perfResult, null, {timeout: 30*60*1000, polling: 1000});
    const r = await page.evaluate(async () => {
      const res = window.__perfResult;
      // the baseline's collision measure: 1000 rays from the eye in a fan, 3 m each (the best of five runs: one run
      // of a few milliseconds is at the mercy of the garbage collector and the other jobs on the machine)
      const C = await import("./js/life/core/collide.js"), L = __life, P = L.P;
      let best = Infinity;
      for (let r = 0; r < 5; r++){
        const t = performance.now();
        for (let i = 0; i < 1000; i++){ const k = i*2.399; C.camCast(P.x, P.eye, P.z, Math.cos(k), Math.sin(i*.7)*.4, Math.sin(k), 3); }
        best = Math.min(best, performance.now() - t);
      }
      res.castUs = +best.toFixed(3);
      return res;
    });
    r.errors = errors.slice(0, 5);
    return r;
  } finally { await close(); }
}

for (const tier of TIERS){
  out.results[tier] = {};
  for (const view of (tier === "high" && !a.includes("--views") ? ["lobby"] : VIEWS)){
    const t0 = Date.now();
    let r;
    try { r = await probe(view, tier); }
    catch(e){ r = {error: String(e && e.message || e)}; }
    out.results[tier][view] = r;
    const bl = BASE.tiers.low[view], bh = BASE.tiers.high[view];
    if (r.error){ check(`${tier} ${view}: probe ran`, false, r.error); continue; }
    console.log(`${tier} ${view}: ${r.calls} calls, ${(r.tris/1000).toFixed(0)}k tris, render ${r.ms.render.median} ms, step ${r.ms.step.median} ms, rays ${r.raysPerFrame}/frame x ${r.testsPerRay} boxes, ${r.pointLights} point lights (${Math.round((Date.now() - t0)/1000)} s)`);
    check(`${tier} ${view}: no errors`, !r.errors.length, r.errors);
    if (tier === "low"){
      const b = BUDGET[view];
      if (b){
        check(`low ${view}: draw calls within ${b.calls} (+5%)`, r.calls <= b.calls*1.05, r.calls);
        check(`low ${view}: triangles within ${b.tris/1000}k (+5%)`, r.tris <= b.tris*1.05, r.tris);
      }
      check(`low ${view}: no shadow pass, shadow map off`, r.shadowCalls === 0 && !r.shadowMap, {shadowCalls: r.shadowCalls, shadowMap: r.shadowMap});
      check(`low ${view}: 2 real point lights`, r.pointLights === 2, r.pointLights);
      if (bl && bh){
        const rl = +(r.ms.render.median/bl.renderMs.median).toFixed(3), rh = +(r.ms.render.median/bh.renderMs.median).toFixed(3);
        check(`low ${view}: render at most 50% of the Low baseline`, rl <= .5, {ratio: rl, ms: r.ms.render.median, baseline: bl.renderMs.median}, !GATE_RENDER);
        check(`low ${view}: render at most 35% of the High baseline`, rh <= .35, {ratio: rh, baseline: bh.renderMs.median}, !GATE_RENDER);
        const rc = +(r.castUs/bl.castUs).toFixed(3);
        // (the gate for the camera rays is the 60 m walk, side by side with the base tree: qa/wpA-ab.mjs)
        check(`low ${view}: 1000 collision rays from the view's eye against the baseline`, true, {ratio: rc, us: r.castUs, baseline: bl.castUs}, true);
        const rs = +(r.ms.step.median/bl.stepMs.median).toFixed(3);
        check(`low ${view}: CPU per frame (step) not over the baseline by more than 10%`, rs <= 1.1, {ratio: rs, ms: r.ms.step.median, baseline: bl.stepMs.median}, !GATE_TIME);
      }
    }
    if (tier === "high" && view === "lobby"){
      check("high lobby: within 90 draw calls", r.calls <= 90, r.calls);
      check("high lobby: within 120k triangles", r.tris <= 120e3, r.tris);
    }
  }
}
report("perf", out);
console.log(out.ok ? "perf: pass" : "perf: FAIL");
process.exit(out.ok ? 0 : 1);
