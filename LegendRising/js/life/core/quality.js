/* ============ LIFE core: the renderer and the picture's quality ============
   Owner: WP-0A moves it here, WP-A owns it from Stage 1 (presets, renderer recreation, the pixel budget).
   Contract: DESIGN 1.2 (quality.js), 1.4.4, 2.2 WP-0A.
   Adaptive resolution with hysteresis: it steps down only after two slow seconds in a row, steps back up only after
   six good ones, and once a step up has had to be undone it stays down: the picture never pumps between two sizes
   (every change reallocates the canvas, which is itself a hitch). A new size is only ever applied at the top of a
   frame, before it is drawn: resizing the canvas clears it, and done after the render it would put one blank frame on
   screen.
   Slow means the frame's work is too much, not merely that frames come slowly: a browser that holds the page to 30 fps
   (an energy saver, a low-power mode) would otherwise be "slow" for good and blur the picture on a GPU with nothing to
   do. So where the GPU can time itself (EXT_disjoint_timer_query_webgl2) each frame's cost is measured (the larger of
   the GPU's time drawing it and the main thread's time building it) and the resolution only drops when that cost is
   over 13 ms (no headroom for 60 fps), and may come back up when it is under 8 ms even at a capped 30. Where it
   can't, the frame rate is all there is to go on. */
import {THREE} from "../build.js";
import {RT} from "./state.js";

export const Q = {scale:1, acc:0, n:0, slow:0, good:0, t:0, upAt:-1e9, noUp:false, pending:false, cpu:0, work:-1};
export const GT = {gl:null, ext:null, cur:null, wait:[], free:[], sum:0, n:0};

// the renderer, once: shadows redrawn only when asked (sky.js and the world say when), ACES tone mapping
export function createRenderer(canvas){
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:"high-performance"});
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;      // PCF with a radius (sky.js): soft edges, no stair-stepping
  renderer.shadowMap.autoUpdate = false;                 // shadows are redrawn only when the sun or you have moved
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  RT.renderer = renderer;
  gpuInit();
  return renderer;
}
function gpuInit(){
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
    if (!bad){ GT.sum += gl.getQueryParameter(q, gl.QUERY_RESULT)/1e6; GT.n++; }
    GT.free.push(q);
  }
}
export function quality(real, cpu){
  Q.acc += real; Q.n++; Q.t += real; Q.cpu += cpu;
  if (Q.acc < 1) return;
  const fps = Q.n/Q.acc, work = GT.n ? Math.max(Q.cpu/Q.n, GT.sum/GT.n) : -1;
  Q.work = work; Q.acc = Q.n = Q.cpu = GT.sum = GT.n = 0;
  Q.slow = fps < 45 && (work < 0 || work > 13) ? Q.slow + 1 : 0;
  Q.good = fps > 57 || (work >= 0 && work < 8) ? Q.good + 1 : 0;
  if (Q.slow >= 2 && Q.scale > .6){
    if (Q.t - Q.upAt < 15) Q.noUp = true;
    Q.scale = Math.max(.6, +(Q.scale - .1).toFixed(2)); Q.slow = Q.good = 0; Q.pending = true;
  } else if (Q.good >= 6 && Q.scale < 1 && !Q.noUp){
    Q.scale = Math.min(1, +(Q.scale + .1).toFixed(2)); Q.good = 0; Q.upAt = Q.t; Q.pending = true;
  }
}
// the pixel ratio: at most 1.5 (Low then takes 0.85 of it); Medium is capped at its preset's maxRatio until
// applyPreset brings the whole pixel budget of DESIGN 1.4.4
export function resize(){
  Q.pending = false;
  const w = innerWidth, h = innerHeight, renderer = RT.renderer, cam = RT.cam;
  const G = typeof GFX !== "undefined" && GFX ? GFX : null, low = !!(G && G.low);
  const cap = low || !G || !G.P ? 1.5 : Math.min(1.5, G.P.maxRatio || 1.5);
  renderer.setPixelRatio(Math.min(cap, devicePixelRatio || 1)*Q.scale*(low ? .85 : 1));
  renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix();
}
