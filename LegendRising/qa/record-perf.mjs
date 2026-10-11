// qa/record-perf.mjs: the rendering baseline of the tree before the rework, as qa/perf-baseline.json.
// Owner: I0 (DESIGN 2.1; the views and the gate are DESIGN 3.9.8, the budgets 1.5.11). WP-A's qa/perf.mjs measures
// the same views and compares; WP-QA re-records the file at the end.
//
// For each view, on High and on Low (localStorage freyaFootball.gfx), in a fresh browser at 1280 x 720 with the RAF
// loop frozen (so the resolution governor never runs and Q.scale stays 1): a career at noon, the zone built, you
// placed at the view, WARM warm-up frames (30), then FRAMES measured frames (60). Each frame is one __life.stepN(1) (the world's
// frame with nothing drawn: movement, animation, clock, sky) and one renderer.render(scene, cam) followed by a
// one-pixel readPixels, which waits for the GPU: renderMs includes SwiftShader's raster work (a relative GPU figure;
// compare ratios only), submitMs is the render call alone (CPU). DESIGN 3.9.8 says gl.finish(); in Chromium that
// returns without waiting, so the read is used instead.
// Then, outside the timed frames: draw calls and triangles of the main pass alone (shadow map not redrawn), and of a
// frame that redraws the shadow map (the difference is the shadow pass), plus what the scene holds.
// animMs is W.anims (people, doors, cars) run once more per frame, timed on its own; castUs is 1000 camCast rays
// from the eye in a fan, timed, for the camera-collision cost. walk60 is the CPU cost of each frame of a 60 m run
// down your street on Low (see WALK).
//
//   node qa/record-perf.mjs              every view, High and Low, and the walk; writes qa/perf-baseline.json
//   node qa/record-perf.mjs --views street,yard --tiers low --out /tmp/x.json
//   node qa/record-perf.mjs --walk-only  only the 60 m walk (walk60), into the existing file
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {launch, career, freeze, ROOT, OUT} from "./lib.mjs";

export const FRAMES = 60, WARM = 30;
// the views of DESIGN 3.9.8 that exist in this tree: where you stand and look (pitch: up is positive)
export const VIEWS = [
  {name: "bedroom", zone: "home", at: "bed", pitch: -.08},
  {name: "lobby", zone: "home", at: {x: -9.5, z: -1, y: .12, yaw: Math.PI}, pitch: 0},
  {name: "street", zone: "home", at: {x: 3, z: 10, y: .12, yaw: Math.PI/2}, pitch: 0},
  {name: "park", zone: "home", at: {x: 24, z: 52.8, y: .12, yaw: Math.PI}, pitch: -.05},
  {name: "yard", zone: "ground", at: {x: 0, z: 22, y: 0, yaw: 0}, pitch: 0},
  {name: "pitch", zone: "ground", at: {x: 0, z: -1, y: 0, yaw: 0}, pitch: -.1},
  {name: "town-road", zone: "town", at: {x: 0, z: 4, y: .12, yaw: Math.PI/2}, pitch: 0}
];
const MISSING = ["stadium-kickoff", "corner-flag", "crowd-pan"];

function measureInPage({view, FRAMES, WARM}){
  const L = window.__life, R = L.renderer(), sc = L.scene(), cam = L.cam, gl = R.getContext(), P = L.P;
  for (const k in L.keys) L.keys[k] = false;
  S.life.min = 12*60;
  L.enterZone(view.zone, typeof view.at === "string" ? view.at : "bus");
  if (typeof view.at === "object") L.place(view.at);
  P.pitch = view.pitch || 0;
  // a one-pixel readPixels waits until everything drawn before it is done (Chromium's gl.finish() does not wait)
  const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const frame = () => { L.stepN(1); R.render(sc, cam); };
  for (let i = 0; i < WARM; i++) frame();
  sync();
  const step = [], rend = [], sub = [], anim = [];
  for (let i = 0; i < FRAMES; i++){
    let t = performance.now(); L.stepN(1); step.push(performance.now() - t);
    t = performance.now(); for (const a of L.W.anims) a(1/60); anim.push(performance.now() - t);
    t = performance.now(); R.render(sc, cam); const t1 = performance.now(); sync(); const t2 = performance.now();
    sub.push(t1 - t); rend.push(t2 - t);
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p*s.length))].toFixed(3); };
  // one frame without a shadow redraw, one with
  R.info.autoReset = true;
  R.shadowMap.needsUpdate = false; R.render(sc, cam);
  const main = {calls: R.info.render.calls, tris: R.info.render.triangles};
  R.shadowMap.needsUpdate = true; R.render(sc, cam);
  const all = {calls: R.info.render.calls, tris: R.info.render.triangles};
  let t = performance.now(); for (let i = 0; i < 1000; i++){ const a = i*2.399; L.camCast(P.x, P.eye, P.z, Math.cos(a), Math.sin(i*.7)*.4, Math.sin(a), 3); } const castUs = +(performance.now() - t).toFixed(3);
  let pointLights = 0, meshes = 0, visMeshes = 0, humans = 0, skinnedVis = 0;
  sc.traverse(o => {
    if (o.isPointLight && o.visible) pointLights++;
    if (!o.isMesh) return; meshes++;
    let v = true; for (let p = o; p; p = p.parent) if (!p.visible){ v = false; break; }
    if (v){ visMeshes++; if (o.isSkinnedMesh) skinnedVis++; }
    if (o.userData && o.userData.human) humans++;
  });
  return {zone: L.LIFE.zone, at: [P.x, P.feet, P.z, P.yaw, P.pitch].map(v => +v.toFixed(3)), gfxLow: !!(window.GFX && GFX.low),
    calls: main.calls, tris: main.tris, shadowCalls: all.calls - main.calls, shadowTris: all.tris - main.tris, shadowMapOn: R.shadowMap.enabled,
    renderMs: {median: q(rend, .5), p95: q(rend, .95)}, submitMs: {median: q(sub, .5), p95: q(sub, .95)}, stepMs: {median: q(step, .5), p95: q(step, .95)}, animMs: {median: q(anim, .5), p95: q(anim, .95)}, anims: L.W.anims.length,
    castUs, programs: R.info.programs.length, geometries: R.info.memory.geometries, textures: R.info.memory.textures,
    pointLights, meshes, visibleMeshes: visMeshes, skinnedVisible: skinnedVis, solids: L.W.solids.length,
    canvas: [R.domElement.width, R.domElement.height], pixelRatio: R.getPixelRatio()};
}

// the scripted 60 m walk of DESIGN 1.5.11 (CPU side): a run along the pavement of your street, past the blocks and
// across the junction, every frame one __life.stepN(1) timed on its own (movement, camera collision, people, clock, sky)
export const WALK = {zone: "home", from: {x: -27, z: 4.6, y: .12, yaw: -Math.PI/2}, metres: 60, maxFrames: 900};
function walkInPage(W_){
  const L = window.__life, P = L.P;
  for (const k in L.keys) L.keys[k] = false;
  S.life.min = 12*60;
  L.enterZone(W_.zone, W_.from); L.place(W_.from);
  L.stepN(30);
  const x0 = P.x, z0 = P.z, ms = [];
  L.keys.w = L.keys.shift = true;
  for (let i = 0; i < W_.maxFrames && Math.hypot(P.x - x0, P.z - z0) < W_.metres; i++){ const t = performance.now(); L.stepN(1); ms.push(performance.now() - t); }
  L.keys.w = L.keys.shift = false;
  const q = p => { const a = ms.slice().sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(p*a.length))].toFixed(3); };
  return {zone: W_.zone, from: W_.from, metres: +Math.hypot(P.x - x0, P.z - z0).toFixed(2), frames: ms.length, end: [P.x, P.z].map(v => +v.toFixed(2)),
    stepMs: {median: q(.5), p95: q(.95), p99: q(.99), max: +Math.max(...ms).toFixed(3), mean: +(ms.reduce((a, b) => a + b, 0)/ms.length).toFixed(3)}};
}
export async function measureWalk(tier = "low"){
  const {page, close} = await launch({gfx: tier, seed: 1});
  try {
    await freeze(page);
    await career(page, {zone: WALK.zone, min: 12*60, frames: 0});
    const r = await page.evaluate(walkInPage, WALK);
    if (page.errors.length) r.errors = page.errors.slice();
    return r;
  } finally { await close(); }
}

export async function measure(view, tier, {shots = true} = {}){
  const {page, close} = await launch({gfx: tier, seed: 1});
  try {
    await freeze(page);
    await career(page, {zone: view.zone, min: 12*60, frames: 0});
    const r = await page.evaluate(measureInPage, {view, FRAMES, WARM});
    // the view as measured, the canvas alone (a page screenshot waits on SwiftShader compositing the HUD)
    if (shots){
      const url = await page.evaluate(() => { const L = window.__life, R = L.renderer(); R.render(L.scene(), L.cam); return R.domElement.toDataURL("image/png"); });
      fs.mkdirSync(OUT, {recursive: true});
      fs.writeFileSync(path.join(OUT, `perf-${tier}-${view.name}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
    if (page.errors.length) r.errors = page.errors.slice();
    return r;
  } finally { await close(); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const views = opt("--views") ? VIEWS.filter(v => opt("--views").split(",").includes(v.name)) : VIEWS;
  const tiers = opt("--tiers") ? opt("--tiers").split(",") : ["high", "low"];
  const out = opt("--out") || path.join(ROOT, "qa", "perf-baseline.json");
  if (a.includes("--walk-only")){
    // add (or redo) the walk in an existing baseline file
    const doc = JSON.parse(fs.readFileSync(out, "utf8")), w = await measureWalk("low");
    doc.walk60 = Object.assign({tier: "low"}, w);
    fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
    console.log(`walk: ${w.metres} m in ${w.frames} frames, step ${w.stepMs.median} ms median, ${w.stepMs.p99} p99, ${w.stepMs.max} max${w.errors ? "\n  errors: " + w.errors.join("\n  ") : ""}`);
    process.exit(w.errors ? 1 : 0);
  }
  const doc = {about: "Rendering baseline of the tree before the rework (I0, DESIGN 2.1 and 3.9.8), recorded by qa/record-perf.mjs in headless Chromium on SwiftShader at 1280 x 720. Milliseconds are SwiftShader figures: compare ratios against this file, never absolute times. calls and tris are the main pass without a shadow redraw; shadowCalls and shadowTris are what a shadow-map redraw adds.",
    method: {viewport: [1280, 720], warm: WARM, frames: FRAMES, minute: 12*60, frame: "__life.stepN(1), then renderer.render(scene, cam) and a 1-pixel gl.readPixels that waits for the GPU (renderMs); submitMs is the render call alone", stats: "median and p95 over the measured frames"},
    views: VIEWS, missing: {views: MISSING, why: "this build has no stadium: matches are the 2D engine, which has no 3D scene"}, tiers: {}};
  let errs = 0;
  for (const tier of tiers){
    doc.tiers[tier] = {};
    for (const v of views){
      const t0 = Date.now(), r = await measure(v, tier);
      doc.tiers[tier][v.name] = r;
      if (r.errors) errs += r.errors.length;
      console.log(`${tier} ${v.name}: ${r.calls} calls, ${(r.tris/1000).toFixed(0)}k tris, shadow +${r.shadowCalls} calls, render ${r.renderMs.median} ms (submit ${r.submitMs.median}), step ${r.stepMs.median} ms, anim ${r.animMs.median} ms, ${r.pointLights} point lights (${((Date.now() - t0)/1000).toFixed(0)} s)${r.errors ? "\n  errors: " + r.errors.join("\n  ") : ""}`);
    }
  }
  const w = await measureWalk("low");
  doc.walk60 = Object.assign({tier: "low"}, w);
  if (w.errors) errs += w.errors.length;
  console.log(`walk: ${w.metres} m in ${w.frames} frames, step ${w.stepMs.median} ms median, ${w.stepMs.p99} p99, ${w.stepMs.max} max`);
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
  console.log("wrote", path.relative(ROOT, out));
  process.exit(errs ? 1 : 0);
}
