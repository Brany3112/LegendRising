/* ============ LIFE core: the renderer and the picture's quality ============
   Owner: WP-0A moves it here, WP-A owns it from Stage 1. Contract: DESIGN 1.2 (quality.js), 1.4.4, 3.9.1, 3.9.6,
   2.3 WP-A.

   One graphics preset (GFX.P, util.js: Low, Medium or High) decides how the world is drawn, and this module puts a new
   one into effect (applyPreset, subscribed to gfxApply). A change is sorted by what it costs:
     in-frame        the pixel budget, fog and the far plane, the sky dome's segments and cloud octaves, draw and detail
                     distances, LOD and shirt-number distances, the scheduler's tiers, pedestrians, the crowd, texture
                     anisotropy and the scale big canvases are drawn at, the HUD's classes: all of it read at use time
                     or set here at once
     under the fade  the number of real point lights, shadows on or off and their kind, the class of every material,
                     the environment map: each of these compiles shaders, so the screen goes black first, the swap is
                     made, everything is compiled and drawn once out of sight (warmAsync), and the fade lifts
     a new renderer  only when antialiasing changes (it is fixed when a WebGL context is made): a new canvas and
                     renderer, the old one disposed and its context let go, the sky's reflection targets rebound and
                     the canvas's listeners moved over (onCanvas), then the under-the-fade steps
   A change that cannot be made now (a cinematic, a drill, a minigame, build mode, a live match or session) waits for
   a safe, quiet moment: standing still, a panel open, or the screen already covered.

   The picture's size is a pixel budget: ratio = clamp(sqrt(P.pixelBudget/(cssW*cssH)), 0.5, min(P.maxRatio, dpr)),
   times Q.scale, the adaptive factor. Adaptive quality degrades in a fixed order: the resolution (Q.scale down to
   P.qMin), then the crowd's density (Q.crowd), then the LOD distances (Q.lod); it never touches gameplay. It steps
   down after two slow seconds and back up after six good ones (a step up that had to be undone within 15 s locks
   it down until the next place: the picture never pumps), and every new place starts again from the top
   (resetForZone). Slow means the frame's work is too much, not merely that frames come slowly: where the GPU can
   time itself (EXT_disjoint_timer_query_webgl2) a frame's work is the larger of its GPU and main-thread time and only
   over 13 ms counts as slow; with no GPU time read in that second (no timer, or nothing drawn), a browser that holds
   the page to 30 fps (an energy saver) is recognised (28 to 31 fps with the main thread under 10 ms) and left alone. Under Auto, eight slow seconds in a row
   at the resolution floor step the tier down for the session (gfxStepDown, util.js), at the next safe moment, and
   frames 30 to 210 after the first place is built are measured once per computer: a median frame over 13 ms (or
   under 50 fps without the timer) moves Auto's choice one tier down for good (gfxDetect measured).
   A new size is only ever applied at the top of a frame, before it is drawn: resizing the canvas clears it.
   The screen is covered (isScreenCovered) under the opaque fade and while an opaque overlay says it is up
   (screenCover): nothing needs drawing then, and every body is state-only (sched.js). */
import {THREE, W, remat, rematCache, onBegin, rescaleTextures} from "../build.js";
import {RT, FLAGS, FADE, LIFE, P as ME_P} from "./state.js";
import {mode, modeFlags} from "./modes.js";
import {MINI} from "../mini.js";
import {SCHED} from "./sched.js";
import {unmergeAll, mergeAll} from "../chunks.js";

const gfx = () => (typeof GFX === "object" && GFX ? GFX : null);
const preset = () => { const G = gfx(); return (G && G.P) || null; };

export const Q = {scale:1, acc:0, n:0, slow:0, good:0, t:0, upAt:-1e9, noUp:false, pending:false, cpu:0, work:-1, fps:0, crowd:1, lod:1,
  capped:false, floorSlow:0};
export const GT = {gl:null, ext:null, cur:null, wait:[], free:[], sum:0, n:0, last:-1};
/* the renderer's state: P the preset in effect (applied in full), want the one asked for, pending a swap waiting for
   its moment, busy a swap under way; swaps and recreated count them (tests), log the last few (perf.js) */
export const RQ = {P:null, aa:null, want:null, reason:"", pending:false, busy:false, swaps:0, recreated:0, stepDown:false, log:[],
  canvasSubs:[], swapSubs:[], unsub:null, input:null, measure:{frame:0, cpu:[], gpu:0, gn:0, t:0, n:0, done:false}};

const shadowOn = P => !P || !!(P.shadow && (P.shadow.life || P.shadow.stadium));
const fadeCovered = () => FADE.v >= .98;
/* opaque overlays over the 3D view (a full-screen card, the hub) say so: screenCover(true, who) when they come up and
   screenCover(false, who) when they go (DESIGN 3.9.6) */
const COVERS = new Set();
export function screenCover(on, who = "overlay"){ if (on) COVERS.add(who); else COVERS.delete(who); }
const covered = () => fadeCovered() || COVERS.size > 0;
// the screen is covered by an opaque fade or overlay: nothing needs drawing, no shadows or reflections need baking
export function isScreenCovered(){ return covered(); }
// the actors are all state-only while the screen is covered or a minigame or the time-lapse card is up (sched.js)
SCHED.covered = () => covered() || !!MINI.on;

/* ---------- the renderer ---------- */
function makeRenderer(canvas, P){
  const aa = P ? !!P.antialias : true;
  const renderer = new THREE.WebGLRenderer({canvas, antialias:aa, powerPreference:"high-performance"});
  renderer.shadowMap.type = THREE.PCFShadowMap;           // PCF with a radius (sky.js): soft edges, no stair-stepping
  renderer.shadowMap.autoUpdate = false;                  // redrawn only when the shadow scheduler says so (sky.js SHADOW)
  renderer.shadowMap.enabled = shadowOn(P);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  gateShadows(renderer);
  RQ.aa = aa; RT.renderer = renderer;
  gpuInit();
  return renderer;
}
// the renderer, once, for the preset in force
export function createRenderer(canvas){
  const P = preset();
  const r = makeRenderer(canvas, P);
  RQ.P = RQ.want = P; RQ.input = canvas;
  if (!RQ.unsub && typeof gfxOn === "function") RQ.unsub = gfxOn(applyPreset);
  return r;
}
/* Every request to redraw the shadow map (renderer.shadowMap.needsUpdate = true, from anywhere: a door swinging, the
   zone warming up) goes through the one shadow scheduler (sky.js SHADOW): at most one redraw a frame, at most the
   preset's rate, none while the screen is covered, none at all on Low. three.js clears the flag after a redraw */
function gateShadows(renderer){
  const sm = renderer.shadowMap;
  let grant = false;
  Object.defineProperty(sm, "needsUpdate", {configurable:true, enumerable:true,
    get(){ return grant || !!(RT.SKY && RT.SKY.shadow && RT.SKY.shadow.granted()); },
    set(v){
      if (!v){ grant = false; if (RT.SKY && RT.SKY.shadow) RT.SKY.shadow.done(); return; }
      if (RT.SKY && RT.SKY.shadow) RT.SKY.shadow.request("direct");
      else grant = true;                                  // before the sky exists: as asked
    }});
}
/* A new renderer, for a change of antialiasing: a new canvas in the old one's place, the same tone mapping and shadow
   settings, the sky's reflection targets rebound, the old renderer disposed and its context let go. Whoever listens on
   the canvas moves over (onCanvas: world.js binds the click that takes the pointer). Until someone does, the old
   canvas is kept, invisible, above the new one, as the surface the pointer is locked to */
export function recreateRenderer(P = preset()){
  const old = RT.renderer; if (!old) return null;
  const oc = old.domElement, cv = document.createElement("canvas");
  cv.id = oc.id || "lifeCanvas"; cv.className = oc.className; cv.style.cssText = oc.style.cssText;
  oc.parentNode.insertBefore(cv, oc);
  const exposure = old.toneMappingExposure;
  const r = makeRenderer(cv, P);
  r.toneMappingExposure = exposure;
  if (RT.SKY && RT.SKY.rebind) RT.SKY.rebind(r);
  try { old.dispose(); old.forceContextLoss(); } catch(e){}
  if (RQ.canvasSubs.length){ oc.remove(); for (const fn of RQ.canvasSubs) try { fn(cv, oc); } catch(e){ console.error(e); } }
  else if (oc === RQ.input){
    // the canvas the world's listeners are bound to stays on top as the surface the pointer is locked to
    oc.id = "lifeCanvasInput";
    oc.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;opacity:0";
  } else oc.remove();
  RQ.recreated++;
  resize();
  return r;
}
// fn(newCanvas, oldCanvas) whenever the renderer is made again on a new canvas
export function onCanvas(fn){ RQ.canvasSubs.push(fn); return () => { const i = RQ.canvasSubs.indexOf(fn); if (i >= 0) RQ.canvasSubs.splice(i, 1); }; }
// fn(P, prevP) during a covered swap, after the world's materials and lights changed (human.js puts its bodies on the
// new material here, so they compile with everything else, out of sight)
export function onPresetSwap(fn){ RQ.swapSubs.push(fn); return () => { const i = RQ.swapSubs.indexOf(fn); if (i >= 0) RQ.swapSubs.splice(i, 1); }; }

/* ---------- the GPU's own clock ---------- */
function gpuInit(){
  GT.gl = GT.ext = GT.cur = null; GT.wait.length = GT.free.length = 0; GT.sum = GT.n = 0;
  try {
    const gl = RT.renderer.getContext(), ext = gl.createQuery && gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (ext){ GT.gl = gl; GT.ext = ext; }
  } catch(e){}
}
export function gpuBegin(){
  if (!GT.ext || GT.cur || GT.wait.length > 3) return;
  GT.cur = GT.free.pop() || GT.gl.createQuery();
  GT.gl.beginQuery(GT.ext.TIME_ELAPSED_EXT, GT.cur);
}
export function gpuEnd(){
  if (!GT.cur) return;
  const gl = GT.gl; gl.endQuery(GT.ext.TIME_ELAPSED_EXT); GT.wait.push(GT.cur); GT.cur = null;
  // results come back a frame or two later; a disjoint (the GPU was reset or throttled) spoils whatever is pending
  const bad = gl.getParameter(GT.ext.GPU_DISJOINT_EXT);
  while (GT.wait.length && gl.getQueryParameter(GT.wait[0], gl.QUERY_RESULT_AVAILABLE)){
    const q = GT.wait.shift();
    if (!bad){ const ms = gl.getQueryParameter(q, gl.QUERY_RESULT)/1e6; GT.sum += ms; GT.n++; GT.last = ms; const M = RQ.measure; if (M.frame >= 30 && !M.done){ M.gpu += ms; M.gn++; } }
    GT.free.push(q);
  }
}

/* ---------- adaptive quality ---------- */
const STEP_DOWN_AFTER = 8;
export function quality(real, cpu){
  measure(real, cpu);
  Q.acc += real; Q.n++; Q.t += real; Q.cpu += cpu;
  if (Q.acc < 1) return;
  const P = preset(), qMin = P ? P.qMin : .6;
  const fps = Q.n/Q.acc, cpuMs = Q.cpu/Q.n, work = GT.n ? Math.max(cpuMs, GT.sum/GT.n) : -1;
  Q.work = work; Q.fps = fps; Q.acc = Q.n = Q.cpu = GT.sum = GT.n = 0;
  // a browser holding the page to 30 fps with the work well within a frame: not slow, nothing to fix (with the GPU's
  // own clock read this second, the work itself says so)
  Q.capped = work < 0 && fps >= 28 && fps <= 31 && cpuMs < 10;
  const slow = fps < 45 && (work < 0 || work > 13) && !Q.capped;
  Q.slow = slow ? Q.slow + 1 : 0;
  Q.good = fps > 57 || (work >= 0 && work < 8) || Q.capped ? Q.good + 1 : 0;
  const atFloor = Q.scale <= qMin + 1e-6;
  Q.floorSlow = atFloor && slow ? Q.floorSlow + 1 : 0;
  if (Q.slow >= 2){
    if (Q.t - Q.upAt < 15) Q.noUp = true;
    // the resolution first, then the crowd's density, then the LOD distances
    if (!atFloor){ Q.scale = Math.max(qMin, +(Q.scale - .1).toFixed(2)); Q.pending = true; }
    else if (Q.crowd > .5) Q.crowd = +(Q.crowd - .25).toFixed(2);
    else if (Q.lod > .7) Q.lod = +(Q.lod - .15).toFixed(2);
    Q.slow = Q.good = 0;
  } else if (Q.good >= 6 && !Q.noUp){
    // back up in the reverse order
    if (Q.lod < 1) Q.lod = Math.min(1, +(Q.lod + .15).toFixed(2));
    else if (Q.crowd < 1) Q.crowd = Math.min(1, +(Q.crowd + .25).toFixed(2));
    else if (Q.scale < 1){ Q.scale = Math.min(1, +(Q.scale + .1).toFixed(2)); Q.pending = true; }
    Q.good = 0; Q.upAt = Q.t;
  }
  // under Auto, eight slow seconds in a row with the resolution at its floor: one tier down, at the next safe moment
  const G = gfx();
  if (Q.floorSlow >= STEP_DOWN_AFTER && G && G.mode === "auto" && G.tier !== "low"){ RQ.stepDown = true; Q.floorSlow = 0; }
}
// the factors the adaptive quality has applied beyond the resolution: crowd density and LOD distances (1 = as the
// preset says). human.js and crowd.js multiply their distances and counts by them
export function qualityScales(){ return {crowd:Q.crowd, lod:Q.lod, scale:Q.scale}; }
/* Auto's one measurement on this computer: frames 30 to 210 after the first place is built. Too slow for the tier it
   picked, it picks one lower for good (gfxDetect remembers it), and the world steps down at its next safe moment */
function measure(real, cpu){
  const M = RQ.measure, G = gfx();
  if (M.done || !G || G.mode !== "auto" || !G.detected || G.detected.measured || !W.zone){ if (!M.done && G && G.detected && G.detected.measured) M.done = true; return; }
  M.frame++;
  if (M.frame < 30) return;
  M.cpu.push(cpu); M.t += real; M.n++;
  if (M.frame < 210) return;
  M.done = true;
  const s = M.cpu.slice().sort((a, b) => a - b), med = s[s.length >> 1] || 0, gpu = M.gn ? M.gpu/M.gn : -1, fps = M.t > 0 ? M.n/M.t : 60;
  const work = gpu >= 0 ? Math.max(med, gpu) : -1;
  const capped = gpu < 0 && fps >= 28 && fps <= 31 && med < 10;
  const slow = work >= 0 ? work > 13 : fps < 50 && !capped;
  const tiers = ["low", "medium", "high"], base = G.detected.tier, bi = tiers.indexOf(base);
  const want = slow && bi > 0 ? tiers[bi - 1] : base;
  RQ.log.push({at:"measured", work:+work.toFixed(2), fps:+fps.toFixed(1), cpu:+med.toFixed(2), was:base, tier:want});
  if (typeof gfxDetect === "function") gfxDetect({measured:{tier:want, ms:+work.toFixed(2)}});
  if (want !== base && typeof gfxApply === "function") gfxApply("measured");
}
// a new place starts from full resolution and the preset's own distances
export function resetForZone(){
  Q.scale = 1; Q.slow = Q.good = Q.floorSlow = 0; Q.noUp = false; Q.crowd = Q.lod = 1; Q.upAt = -1e9; Q.pending = true;
}
onBegin(() => { resetForZone(); if (RT.SKY && RT.SKY.shadow) RT.SKY.shadow.zone(); });
// the pixel ratio the budget allows on this screen, times the adaptive factor
export function pixelRatio(){
  const P = preset(), w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  if (!P) return Math.min(1.5, dpr)*Q.scale;
  const r = Math.max(.5, Math.min(Math.min(P.maxRatio, dpr), Math.sqrt(P.pixelBudget/(w*h))));
  return r*Q.scale;
}
export function resize(){
  Q.pending = false;
  const w = innerWidth, h = innerHeight, renderer = RT.renderer, cam = RT.cam;
  if (!renderer) return;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  if (cam){ cam.aspect = w/h; cam.updateProjectionMatrix(); }
}

/* ---------- presets ---------- */
const J = o => JSON.stringify(o == null ? null : o);
// what of a change needs the screen covered (a shader recompiles), and whether the renderer must be made again
function heavy(a, b){
  if (!a || !b) return true;
  return !!a.antialias !== !!b.antialias || J(a.nReal) !== J(b.nReal) || J(a.shadow) !== J(b.shadow) || a.material !== b.material
    || J(a.standardKinds) !== J(b.standardKinds) || J(a.env) !== J(b.env) || !!a.skylineBasic !== !!b.skylineBasic;
}
const matChanged = (a, b) => !a || !b || a.material !== b.material || J(a.standardKinds) !== J(b.standardKinds) || !!a.skylineBasic !== !!b.skylineBasic;
// the in-frame part of a preset: everything that costs nothing to change
function inFrame(P){
  Q.pending = true;
  if (Q.scale < P.qMin) Q.scale = P.qMin;
  if (RT.SKY && RT.SKY.inFrame) RT.SKY.inFrame(P);
  rescaleTextures(P, RT.scene);
}
/* gfxOn subscriber: GFX.P changed to P (from prevP). The in-frame part at once; the rest under a fade, now or at the
   next safe moment */
export function applyPreset(P, prevP, reason){
  if (!P) return;
  RQ.want = P; RQ.reason = reason || "";
  if (!RT.renderer){ RQ.P = P; return; }
  inFrame(P);
  // (back to what is in effect before a waiting change was made: nothing is left to do under a fade)
  if (!heavy(RQ.P, P)){ if (!RQ.busy){ RQ.P = P; RQ.pending = false; } return; }
  RQ.pending = true;
  presetTick();
}
// when nothing may change under the player's feet: a cinematic, a drill, a minigame, build mode, a live match or session
function safe(){
  if (!LIFE.running) return true;
  const m = mode(), f = modeFlags();
  if (typeof f.gfxSafe === "function") return !!f.gfxSafe();
  if (f.gfxSafe === false) return false;
  if (m === "cine" || m === "drill" || m === "build" || m === "match" || m === "train") return false;
  return !FLAGS.drill && !FLAGS.busy && !MINI.on;
}
// and a moment the player will not mind: the screen already covered, a panel open, or standing still
const quiet = () => !LIFE.running || covered() || FLAGS.modal || !document.pointerLockElement || ME_P.speed < .1;
// every frame (a scheduler task, so a test stepping the world runs it too): a waiting change or step down, if now is the time
export function presetTick(){
  if (RQ.busy) return;
  if (RQ.stepDown && safe() && quiet()){ RQ.stepDown = false; if (typeof gfxStepDown === "function") gfxStepDown("slow"); return; }
  if (RQ.pending && safe() && quiet()){ RQ.pending = false; swap(); }
}
SCHED.task({id:"gfx", kind:"keep", run:presetTick});
const wait = ms => new Promise(r => setTimeout(r, ms));
const fadeEl = () => document.getElementById("lifeFade");
/* the covered swap: black, the change, everything compiled and drawn once, the fade lifted. Once the screen is black
   the change is made in one go (nothing else runs in between, so nothing can lift the cover halfway): if something
   lifted it while it was coming down (the first frames of a place revealing themselves), it is put back at once */
async function swap(){
  RQ.busy = true;
  const el = fadeEl(), shown = LIFE.running && el && !document.hidden;
  const own = !!shown && !(fadeCovered() && el.style.opacity === "1");
  try {
    if (own){ FADE.boot = false; el.style.transition = "opacity .2s ease"; el.style.opacity = "1"; el.dataset.gfx = "1"; FADE.v = 1; await wait(240); }
    if (shown && (el.style.opacity !== "1" || !fadeCovered())){ el.style.transition = "none"; el.style.opacity = "1"; el.dataset.gfx = "1"; FADE.v = 1; }
    swapNow(RQ.want);
  } catch(e){ console.error("graphics change failed", e); }
  if (el && el.dataset.gfx){ delete el.dataset.gfx; el.style.transition = "opacity .3s ease"; el.style.opacity = "0"; FADE.v = 0; }
  RQ.busy = false;
  if (RQ.want !== RQ.P && heavy(RQ.P, RQ.want)) RQ.pending = true;
}
function swapNow(P){
  const prev = RQ.P, t0 = performance.now();
  if (!!P.antialias !== RQ.aa) recreateRenderer(P);
  const renderer = RT.renderer;
  renderer.shadowMap.enabled = shadowOn(P);
  if (RT.SKY && RT.SKY.applyPreset) RT.SKY.applyPreset(P, renderer, RT.scene);
  // the merged parts carry materials of their own: unmerged, remade, merged again (chunks.js)
  if (matChanged(prev, P)){ unmergeAll(); rematerialize(RT.scene); mergeAll(); }
  for (const fn of RQ.swapSubs) try { fn(P, prev); } catch(e){ console.error(e); }
  RQ.P = P;
  // the reflections baked now, under the cover (their filter shaders compile with them), then everything else warmed
  if (RT.SKY && RT.SKY.refresh) RT.SKY.refresh(renderer, RT.scene, (LIFE.min/60) % 24, ME_P, true);
  warmNow();
  RQ.swaps++;
  RQ.log.push({at:"swap", from:prev && prev.tier, to:P.tier, ms:Math.round(performance.now() - t0), recreated:RQ.recreated});
  if (RQ.log.length > 20) RQ.log.shift();
}
/* every material in the scene made again for the preset in force (build.js remat, from userData.spec): each distinct
   material once, so what was shared stays shared, the old ones disposed. Materials another module remakes itself
   (userData.rematBy: human.js) and those without a spec are left alone. Also the camera's children (what is in your
   hands) and the cached moving-part materials no one is using right now */
export function rematerialize(scene = RT.scene){
  const map = new Map();
  const swapM = m => {
    if (!m || !m.userData || !m.userData.spec || m.userData.rematBy) return m;
    let n = map.get(m); if (!n){ n = remat(m); map.set(m, n); }
    return n;
  };
  const visit = o => { if (!o.material) return; o.material = Array.isArray(o.material) ? o.material.map(swapM) : swapM(o.material); };
  if (scene) scene.traverse(visit);
  if (RT.cam && RT.cam.parent !== scene) RT.cam.traverse(visit);
  rematCache(map);
  for (const [m, n] of map) if (n !== m) m.dispose();
  return map.size;
}
/* Shaders compiled, textures and bone textures uploaded, and one frame drawn out of sight with everything showing
   (including what is hidden for now) and the shadow pass, so nothing compiles the first time it comes into view:
   after a preset swap (and for whoever builds a scene: DESIGN 3.9.6). compileAsync lets the driver compile in parallel
   where it can; the drawn frame then waits for whatever is left */
export async function warmAsync(pose = null){
  const renderer = RT.renderer, scene = RT.scene, cam = RT.cam;
  if (!renderer || !scene || !cam) return;
  if (renderer.compileAsync){
    const hid = showAll(scene);
    let p = null;
    try { p = renderer.compileAsync(scene, cam); } finally { for (const o of hid) o.visible = false; }
    try { await p; } catch(e){}
    if (RT.renderer !== renderer) return;                   // made again meanwhile: whoever did warms the new one
  }
  warmNow(pose);
}
// everything hidden for now shown for a moment (and every skinned body given its bone texture); returns what to hide again
function showAll(scene){
  const hid = [];
  scene.traverse(o => { if (!o.visible){ hid.push(o); o.visible = true; } if (o.isSkinnedMesh && o.skeleton && !o.skeleton.boneTexture) o.skeleton.computeBoneTexture(); });
  return hid;
}
// the same at once: compiled (where compileAsync has not already), uploaded and drawn once with the shadow pass
export function warmNow(pose = null){
  const renderer = RT.renderer, scene = RT.scene, cam = RT.cam;
  if (!renderer || !scene || !cam) return;
  const hid = showAll(scene);
  try {
    renderer.compile(scene, cam);
    const seen = new Set(), init = t => { if (t && t.isTexture && !seen.has(t)){ seen.add(t); renderer.initTexture(t); } };
    scene.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) init(o.skeleton.boneTexture);
      if (o.material) for (const m of [].concat(o.material)) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap", "emissiveMap", "alphaMap"]) init(m[k]);
    });
    const was = [cam.position.clone(), cam.quaternion.clone()];
    if (pose && pose.pos && pose.look){ cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]); cam.lookAt(pose.look[0], pose.look[1], pose.look[2]); }
    if (RT.SKY && RT.SKY.shadow) RT.SKY.shadow.force();
    renderer.render(scene, cam);
    cam.position.copy(was[0]); cam.quaternion.copy(was[1]);
  } catch(e){ console.error(e); }
  finally { for (const o of hid) o.visible = false; }
  if (RT.SKY && RT.SKY.shadow) RT.SKY.shadow.request("warm");   // the real shadows, without what was hidden, next
}
// the preset in effect in the renderer (the one asked for may still be waiting for its moment)
export function presetInEffect(){ return RQ.P; }

// ?perf=1: the probes (perf.js), loaded only when asked for
try { if (typeof location === "object" && /[?&]perf=/.test(location.search)) import("../perf.js").catch(e => console.error(e)); } catch(e){}
