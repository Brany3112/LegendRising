// qa/wpA-quality.mjs: WP-A acceptance for the adaptive quality and Auto's step down (core/quality.js).
// Owner: WP-A (DESIGN 1.4.4, 3.9.1, 2.3 WP-A).
//
// quality(real, cpuMs) is fed made-up seconds of frames (no GPU timer in SwiftShader, so the frame rate decides):
//   order        two slow seconds lower the resolution (Q.scale) by 0.1 down to the preset's qMin; at the floor the
//                crowd's density (Q.crowd) and then the LOD distances (Q.lod) step down; good seconds bring them back
//                in the reverse order
//   30 fps cap   28 to 31 fps with the main thread under 10 ms is a browser holding the page to 30: nothing degrades
//   zone         a new place starts again at full resolution
//   step down    under Auto, eight slow seconds in a row at the resolution floor take the tier one lower for the
//                session (gfxStepDown, its toast), applied at the next safe moment; a chosen tier is never changed
//   pixels       the pixel ratio is the preset's pixel budget over the window, capped by maxRatio (1280 x 720)
//
//   QA_PORT=8772 node qa/wpA-quality.mjs        writes qa/out/wpA-quality.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {checks: [], ok: true};
const check = (name, ok, detail) => { out.checks.push({name, ok: !!ok, detail}); if (!ok) out.ok = false; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

const {page, close, errors} = await launch({gfx: "medium", seed: 6});
try {
  await career(page, {zone: "home", min: 12*60});
  await freeze(page);
  const r = await page.evaluate(async () => {
    const q = await import("./js/life/core/quality.js"), L = __life, Q = q.Q, res = {};
    // a change of tier with a new renderer is made under a fade, a quarter of a second later: let it finish
    const settle = async () => { for (let i = 0; i < 200 && (q.RQ.busy || q.RQ.pending); i++){ L.stepN(1); await new Promise(r => setTimeout(r, 50)); } return !q.RQ.busy && !q.RQ.pending; };
    // a second of frames at fps with this much main-thread work each
    const second = (fps, cpu) => { for (let i = 0; i < fps; i++) q.quality(1/fps, cpu); };
    q.resetForZone();
    const trace = [];
    for (let s = 0; s < 16; s++){ second(20, 30); trace.push([Q.scale, Q.crowd, Q.lod]); }
    res.down = trace;
    res.floor = {scale: Q.scale, crowd: Q.crowd, lod: Q.lod, qMin: GFX.P.qMin};
    const up = [];
    for (let s = 0; s < 60; s++){ second(60, 3); up.push([Q.scale, Q.crowd, Q.lod]); }
    res.up = up.filter((v, i) => i % 6 === 5);
    res.top = {scale: Q.scale, crowd: Q.crowd, lod: Q.lod};
    q.resetForZone();
    for (let s = 0; s < 6; s++) second(30, 4);
    res.capped = {scale: Q.scale, capped: Q.capped};
    q.resetForZone();
    for (let s = 0; s < 4; s++) second(20, 30);
    const before = Q.scale;
    L.enterZone("home", "bed");
    res.zone = {before, after: Q.scale};
    // pixels: the budget over the window
    res.ratio = {medium: q.pixelRatio()};
    // Auto: the tier steps down after 8 slow seconds at the floor; a chosen tier never does
    setGfx("medium");
    q.resetForZone(); for (let s = 0; s < 20; s++) second(20, 30);
    res.chosen = {tier: GFX.tier, stepDown: q.RQ.stepDown};
    GFX.detected = {tier: "high", base: "high", gpu: "test", ver: 1, measured: {tier: "high", ms: 5}, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0};
    setGfx("auto");
    const t0 = GFX.tier, settled = await settle();
    q.resetForZone(); for (let s = 0; s < 20; s++) second(20, 30);
    const asked = q.RQ.stepDown;
    L.stepN(2);                                    // the scheduler's task applies it at a safe, quiet moment
    res.auto = {from: t0, settled, asked, to: GFX.tier, toast: [...document.querySelectorAll(".toast")].map(t => t.textContent).find(t => /Graphics/.test(t)) || null};
    res.auto.after = await settle();
    return res;
  });
  out.result = r;
  const d = r.down;
  check("slow seconds lower the resolution first, by 0.1 every two seconds, to qMin", d[1][0] === .9 && d[3][0] === .8 && r.floor.scale === r.floor.qMin, d.slice(0, 6));
  check("at the floor, the crowd's density and then the LOD distances step down", r.floor.crowd < 1 && r.floor.lod < 1, r.floor);
  check("good seconds bring everything back, the LOD first", r.top.scale === 1 && r.top.crowd === 1 && r.top.lod === 1, {top: r.top, path: r.up});
  check("a browser capped at 30 fps with little work is left alone", r.capped.scale === 1 && r.capped.capped, r.capped);
  check("a new place starts again at full resolution", r.zone.before < 1 && r.zone.after === 1, r.zone);
  check("Medium at 1280 x 720: the pixel ratio is its cap (budget 1.6 MP > 0.92 MP)", Math.abs(r.ratio.medium - 1) < 1e-6, r.ratio);
  check("a chosen tier never steps down by itself", r.chosen.tier === "medium" && !r.chosen.stepDown, r.chosen);
  check("Auto steps one tier down after 8 slow seconds at the floor, with its toast", r.auto.from === "high" && r.auto.asked && r.auto.to === "medium" && /Graphics lowered to Medium/.test(r.auto.toast || ""), r.auto);
  check("no errors", errors.length === 0, errors.slice(0, 5));
} finally { await close(); }
report("wpA-quality", out);
console.log(out.ok ? "wpA-quality: pass" : "wpA-quality: FAIL");
expect(out.ok, "wpA-quality failed");
