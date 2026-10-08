// qa/unit/util.mjs: the graphics presets and the text helpers of js/util.js, under plain node.
// Owner: WP-0B (DESIGN 1.4.4 graphics presets, 1.8 text helpers; acceptance in 2.2 WP-0B).
//
// js/util.js is a classic script, so it runs here in a node:vm context with small stand-ins for the page: a
// localStorage, a document whose body keeps a class list, a navigator, and a WebGL context that reports whatever
// graphics chip the test asks for. js/daily.js runs in the same context for fmtTime, as it does in the game.
//
//   node qa/unit/util.mjs        exits 1 on any failed check; writes qa/out/unit-util.json
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM = String.fromCharCode(0x2014), MINUS = String.fromCharCode(0x2212), EN = String.fromCharCode(0x2013);
const results = [];
function check(name, cond, detail = ""){ results.push({name, ok: !!cond, detail: cond ? "" : String(detail)}); if (!cond) console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
const eq = (name, got, want) => check(name, Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// a page, as much of one as util.js touches
function boot({stored = {}, cores = 8, mem = 8, gpu = "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)"} = {}){
  const store = new Map(Object.entries(stored));
  const page = {store, toasts: [], contexts: 0, lost: 0, gpu, classes: new Set(), resized: 0};
  const classList = set => ({
    toggle(c, on){ if (on === undefined) on = !set.has(c); if (on) set.add(c); else set.delete(c); return on; },
    add(...c){ c.forEach(x => set.add(x)); }, remove(...c){ c.forEach(x => set.delete(x)); }, contains: c => set.has(c)
  });
  const gl = {
    RENDERER: 0x1F01,
    getParameter(p){ return p === 0x1F01 ? "WebKit WebGL" : p === 0x9246 ? page.gpu : null; },
    getExtension(n){ return n === "WEBGL_debug_renderer_info" ? {UNMASKED_RENDERER_WEBGL: 0x9246} : n === "WEBGL_lose_context" ? {loseContext(){ page.lost++; }} : null; }
  };
  const element = () => ({classList: classList(new Set()), style: {}, remove(){}, getContext(){ page.contexts++; return page.gpu === null ? null : gl; }});
  const document = {
    body: {classList: classList(page.classes), appendChild(el){ if (el.className && /toast/.test(el.className)) page.toasts.push(el.textContent); }},
    createElement: element, querySelector: () => null, querySelectorAll: () => []
  };
  const ctx = vm.createContext({
    console, document, window: {}, navigator: {hardwareConcurrency: cores, deviceMemory: mem},
    localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }},
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    resize: () => { page.resized++; }
  });
  for (const f of ["js/util.js", "js/daily.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, {filename: f});
  page.run = src => vm.runInContext(src, ctx);
  page.nav = ctx.navigator;
  return page;
}

/* ---------- 1.8 text helpers ---------- */
{
  const p = boot();
  eq("fmtRange(600, 960)", p.run("fmtRange(600, 960)"), "10:00 AM to 4:00 PM");
  eq("fmtRange(360, 1020)", p.run("fmtRange(360, 1020)"), "6:00 AM to 5:00 PM");
  check("fmtRange never uses a dash", !new RegExp("[" + EN + EM + "-]").test(p.run("fmtRange(615, 1439)")), p.run("fmtRange(615, 1439)"));
  eq("fmtSigned(-3)", p.run("fmtSigned(-3)"), MINUS + "3");
  check("fmtSigned(-3) uses U+2212", p.run("fmtSigned(-3)").charCodeAt(0) === 0x2212);
  eq("fmtSigned(1.2, 1)", p.run("fmtSigned(1.2, 1)"), "+1.2");
  eq("fmtSigned(0)", p.run("fmtSigned(0)"), "0");
  eq("fmtSigned(-0.04, 1) rounds to nothing, no sign", p.run("fmtSigned(-0.04, 1)"), "0.0");
  eq("fmtSigned(2.46, 1)", p.run("fmtSigned(2.46, 1)"), "+2.5");
  eq("fmtSigned(-30)", p.run("fmtSigned(-30)"), MINUS + "30");
  eq("fmtSigned(NaN)", p.run("fmtSigned(NaN)"), "0");
  eq("fmtDur(150)", p.run("fmtDur(150)"), "2 hours 30 minutes");
  eq("fmtDur(45)", p.run("fmtDur(45)"), "45 minutes");
  eq("fmtDur(60)", p.run("fmtDur(60)"), "1 hour");
  eq("fmtDur(61)", p.run("fmtDur(61)"), "1 hour 1 minute");
  eq("fmtDur(1)", p.run("fmtDur(1)"), "1 minute");
  eq("fmtDur(0)", p.run("fmtDur(0)"), "0 minutes");
  eq("fmtDur(120)", p.run("fmtDur(120)"), "2 hours");
  eq("fmtDur(89.6) rounds", p.run("fmtDur(89.6)"), "1 hour 30 minutes");
  eq("EMPTY_CELL is an en dash", p.run("EMPTY_CELL"), EN);
  eq("SAVE_CODE_LABEL", p.run("SAVE_CODE_LABEL"), "Save game: copy code");
}

/* ---------- 1.4.4 preset table ---------- */
{
  const p = boot();
  const P = JSON.parse(p.run("JSON.stringify(GFX_PRESETS, (k, v) => v === Infinity ? 'Infinity' : v)"));
  eq("three tiers", Object.keys(P), ["low", "medium", "high"]);
  const shape = o => o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).sort().join(",") : typeof o;
  for (const k of Object.keys(P.high)) check(`every tier has ${k}`, ["low", "medium"].every(t => k in P[t]), k);
  check("the three tiers have the same fields", shape(P.low) === shape(P.medium) && shape(P.medium) === shape(P.high));
  const row = (f, lo, me, hi) => eq(`table: ${f}`, [f.split(".").reduce((o, k) => o == null ? undefined : o[k], P.low), f.split(".").reduce((o, k) => o == null ? undefined : o[k], P.medium), f.split(".").reduce((o, k) => o == null ? undefined : o[k], P.high)], [lo, me, hi]);
  row("antialias", false, true, true);
  row("pixelBudget", 0.92e6, 1.6e6, 3.7e6);
  row("maxRatio", 1.0, 1.25, 1.5);
  row("qMin", 0.8, 0.7, 0.6);
  row("shadow.life", null, {type: "pcf", size: 2048, half: 26, grid: 6, hz: 2}, {type: "pcf", size: 2048, half: 30, grid: 4, hz: 5});
  row("shadow.stadium.mode", undefined, "statics", "follow");
  row("nReal", {life: 2, stadium: 0}, {life: 4, stadium: 0}, {life: 8, stadium: 2});
  row("material", "lambert", "mixed", "standard");
  row("env", null, {size: 32, everyH: 1}, {size: 64, everyH: 0.15});
  row("skyOct", 0, 3, 5);
  row("dome", [16, 8], [24, 12], [32, 18]);
  row("fog.life.near", 35, 50, 50);
  row("fog.life.far", 150, 180, 180);
  row("fog.stadium", {near: 110, far: 240}, {near: 150, far: 380}, {near: 170, far: 450});
  row("camFarPad", 30, 40, 0);
  row("camFar", 0, 0, 600);
  row("drawPad", 20, 30, 0);
  row("drawDist", 0, 0, "Infinity");
  row("detailDist", 35, 60, 90);
  row("lod", {near: 8, back: 7, lod3: 30}, {near: 12, back: 11, lod3: 45}, {near: 15, back: 13.5, lod3: 60});
  row("shirtNumDist", 6, 8, 9.5);
  row("animNear", 12, 20, 25);
  row("animMid", 35, 50, 70);
  row("midDiv", 3, 2, 2);
  row("farDiv", 6, 4, 3);
  row("hiddenHz", 5, 8, 10);
  row("staticHz", 5, 10, 15);
  row("groundLiteBeyond", 10, 20, 30);
  row("peds", {home: 3, town: 3}, {home: 5, town: 4}, {home: 6, town: 5});
  row("crowd.count", 0, 4000, 8000);
  row("crowd.kind", "blocks", "billboards", "billboards");
  row("coverEvery", 0.25, 0.15, 0.1);
  row("hudBlur", "none", "modals", "full");
  row("anisotropy", 1, 2, 4);
  row("texScale", 0.5, 1, 1);
  row("haloMax", 120, "Infinity", "Infinity");
  check("presets are frozen all the way down", p.run("Object.isFrozen(GFX_PRESETS) && Object.isFrozen(GFX_PRESETS.medium) && Object.isFrozen(GFX_PRESETS.medium.lod) && Object.isFrozen(GFX_PRESETS.high.shadow.stadium) && Object.isFrozen(GFX_PRESETS.medium.standardKinds)"));
  eq("before any apply, P is High", p.run("GFX.P === GFX_PRESETS.high && gfxPreset() === GFX.P"), true);
}

/* ---------- gfxApply, gfxOn, setGfx for each tier ---------- */
{
  const p = boot();
  p.run(`var CALLS = []; var OFF = gfxOn((P, prevP, reason) => CALLS.push({P, prevP, reason}));`);
  check("gfxOn ignores a second registration of the same function", p.run("(() => { const f = GFX.subs[0]; gfxOn(f); return GFX.subs.length === 1; })()"));
  let prev = "high";
  for (const t of ["low", "medium", "high", "low"]){
    p.run(`CALLS.length = 0; setGfx(${JSON.stringify(t)});`);
    eq(`setGfx(${t}): GFX.mode`, p.run("GFX.mode"), t);
    eq(`setGfx(${t}): GFX.tier`, p.run("GFX.tier"), t);
    check(`setGfx(${t}): GFX.P is the ${t} preset`, p.run(`GFX.P === GFX_PRESETS.${t} && gfxPreset() === GFX_PRESETS.${t}`));
    eq(`setGfx(${t}): GFX.low`, p.run("GFX.low"), t === "low");
    eq(`setGfx(${t}): body classes`, [...p.classes].sort(), ["gfx-" + t, ...(t === "low" ? ["low"] : [])].sort());
    eq(`setGfx(${t}): one subscriber call`, p.run("CALLS.length"), 1);
    check(`setGfx(${t}): called with (P, prevP, reason)`, p.run(`CALLS[0].P === GFX_PRESETS.${t} && CALLS[0].prevP === GFX_PRESETS.${prev} && CALLS[0].reason === "user"`));
    eq(`setGfx(${t}): stored`, p.store.get("freyaFootball.gfx"), t);
    prev = t;
  }
  p.run(`CALLS.length = 0; gfxApply("zone");`);
  check("gfxApply passes its reason through", p.run(`CALLS.length === 1 && CALLS[0].reason === "zone" && CALLS[0].P === CALLS[0].prevP`));
  p.run(`CALLS.length = 0; gfxApply();`);
  check("gfxApply's reason defaults to user", p.run(`CALLS[0].reason === "user"`));
  check("gfxApply still resizes the 2D canvas while it exists", p.resized >= 6, p.resized);
  p.run(`OFF(); CALLS.length = 0; gfxApply("x");`);
  eq("the function gfxOn returns unsubscribes", p.run("CALLS.length"), 0);
  p.run(`var BOOM = gfxOn(() => { throw new Error("boom"); }); var AFTER = 0; gfxOn(() => AFTER++);`);
  const realErr = console.error; let logged = 0; console.error = () => { logged++; };
  try { p.run(`gfxApply("x")`); } finally { console.error = realErr; }
  check("a failing subscriber is reported and the others still run", logged === 1 && p.run("AFTER") === 1);
  p.run("BOOM()");
  p.run(`setGfx("ultra")`);
  eq("an unknown mode means Auto", p.run("GFX.mode"), "auto");
}

/* ---------- Auto: gfxDetect and its cache ---------- */
{
  const cases = [
    [{cores: 8, mem: 8, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)"}, "low"],
    [{cores: 8, mem: 8, gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)"}, "high"],
    [{cores: 4, mem: 8, gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)"}, "medium"],
    [{cores: 8, mem: 4, gpu: "NVIDIA GeForce GTX 980/PCIe/SSE2"}, "medium"],
    [{cores: 2, mem: 8, gpu: "Apple M2"}, "low"],
    [{cores: 8, mem: 8, gpu: "Some New GPU 9000"}, "medium"],
    [{cores: 8, mem: 8, gpu: null}, "medium"]
  ];
  for (const [o, want] of cases){
    const p = boot(o);
    p.run(`setGfx("auto")`);
    eq(`Auto with ${o.cores} cores, ${o.mem} GB, ${o.gpu}`, p.run("GFX.tier"), want);
    check(`  and GFX.low follows (${want})`, p.run("GFX.low") === (want === "low") && p.classes.has("gfx-" + want));
    if (o.gpu !== null) check(`  the throwaway WebGL context is released`, p.lost === 1, p.lost);
  }
  const p = boot({cores: 8, mem: 8});
  p.run(`setGfx("auto")`);
  const saved = JSON.parse(p.store.get("freyaFootball.gfxAuto") || "null");
  check("the detection is remembered", saved && saved.ver === 1 && saved.tier === "low" && saved.gpu.includes("UHD") && saved.measured === null, JSON.stringify(saved));
  const n = p.contexts;
  p.page = p.run(`gfxDetect(); gfxApply(); GFX.tier`);
  eq("a remembered detection opens no new WebGL context", p.contexts, n);
  p.nav.hardwareConcurrency = 16;
  p.gpu = "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)";
  p.run("gfxDetect()");
  check("new cores mean asking again", p.contexts === n + 1 && p.run("GFX.detected.tier") === "high", p.run("JSON.stringify(GFX.detected)"));
  p.run(`gfxDetect({measured: {tier: "medium", ms: 15.2}}); gfxApply("measured")`);
  check("a measurement decides the tier and is remembered", p.run("GFX.tier") === "medium" && JSON.parse(p.store.get("freyaFootball.gfxAuto")).measured.tier === "medium");
  p.run("GFX.autoLow = true; gfxApply()");
  eq("the 2D match's autoLow still means Low under Auto", p.run("GFX.tier"), "low");
  p.run(`setGfx("auto")`);
  eq("choosing again clears autoLow", p.run("GFX.tier"), "medium");
  eq("gfxStepDown under Auto goes one tier down", p.run(`gfxStepDown()`), "low");
  check("  and says so", p.toasts.length === 1 && p.toasts[0] === "Graphics lowered to Low to keep things smooth. You can change this in Settings.", JSON.stringify(p.toasts));
  eq("gfxStepDown on Low does nothing", p.run(`gfxStepDown()`), null);
  p.run(`setGfx("high")`);
  eq("gfxStepDown never overrides a tier the player chose", p.run(`gfxStepDown()`), null);
  eq("  and the choice stands", p.run("GFX.tier"), "high");
  const q = boot({stored: {"freyaFootball.gfx": "medium"}});
  eq("a stored Medium is read back", q.run("GFX.mode"), "medium");
  const r = boot({stored: {"freyaFootball.gfx": "ultra"}});
  eq("a stored unknown value reads as Auto", r.run("GFX.mode"), "auto");
}

/* ---------- graphics chip names and tiers ---------- */
{
  const p = boot();
  const tiers = {
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)": "low",
    "llvmpipe (LLVM 15.0.7, 256 bits)": "low",
    "Microsoft Basic Render Driver": "low",
    "ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)": "low",
    "Mesa Intel(R) UHD Graphics 620 (KBL GT2)": "low",
    "Mali-G78": "low",
    "Adreno (TM) 650": "low",
    "PowerVR Rogue GE8320": "low",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)": "medium",
    "ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)": "medium",
    "AMD Radeon(TM) Vega 8 Graphics": "medium",
    "Apple GPU": "medium",
    "Adreno (TM) 730": "medium",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)": "high",
    "NVIDIA GeForce GTX 1050/PCIe/SSE2": "high",
    "ANGLE (NVIDIA, NVIDIA Quadro P2000 Direct3D11 vs_5_0 ps_5_0, D3D11)": "high",
    "AMD Radeon Pro 5500M OpenGL Engine": "high",
    "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)": "high",
    "Something nobody has heard of": "medium",
    "": "medium"
  };
  for (const [gpu, want] of Object.entries(tiers)) eq(`chip tier: ${gpu || "(none)"}`, p.run(`gfxGpuTier(${JSON.stringify(gpu)})`), want);
  const names = {
    "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)": "Intel UHD Graphics 620",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)": "NVIDIA GeForce RTX 3060",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)": "Apple M1",
    "ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics OpenGL Engine, OpenGL 4.1)": "Intel Iris Plus Graphics",
    "NVIDIA GeForce GTX 980/PCIe/SSE2": "NVIDIA GeForce GTX 980",
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)": "SwiftShader, software",
    "Adreno (TM) 650": "Adreno 650",
    "Apple GPU": "Apple GPU",
    "": ""
  };
  for (const [gpu, want] of Object.entries(names)) eq(`chip name: ${gpu || "(none)"}`, p.run(`gfxGpuName(${JSON.stringify(gpu)})`), want);
}

/* ---------- the Settings segment ---------- */
{
  const p = boot();
  for (const m of ["auto", "low", "medium", "high"]){
    p.run(`setGfx(${JSON.stringify(m)})`);
    const html = p.run(`gfxSeg("A.gfx")`);
    const btns = [...html.matchAll(/<button aria-pressed="(true|false)" onclick="A\.gfx\('(\w+)'\)">([^<]+)<\/button>/g)];
    eq(`gfxSeg (${m}): four buttons, in order`, btns.map(b => b[3]), ["Auto", "Low", "Medium", "High"]);
    eq(`gfxSeg (${m}): the pressed one`, btns.filter(b => b[1] === "true").map(b => b[2]), [m]);
    check(`gfxSeg (${m}): no em dash`, !html.includes(EM));
    if (m === "auto"){
      check("gfxSeg under Auto names the tier and the chip", html.includes("Currently: Low (Intel UHD Graphics 620)"), html);
      // the line promises only what the game does today (the slow-match drop to Low); WP-A's runtime step down
      // brings back the 1.4.4 wording
      check("gfxSeg under Auto explains Auto", html.includes("Auto picks a level for this computer, and steps down by itself if the game keeps running slowly."));
    } else check(`gfxSeg (${m}): nothing under a chosen tier`, !html.includes("Currently"));
  }
}

/* ---------- no em dash in util.js at all ---------- */
check("js/util.js has no U+2014 anywhere", !fs.readFileSync(path.join(ROOT, "js/util.js"), "utf8").includes(EM));

const failed = results.filter(r => !r.ok);
fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-util.json"), JSON.stringify({ok: !failed.length, checks: results}, null, 1));
console.log(`unit/util: ${results.length - failed.length} of ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
