/* ============ LIFE: performance probes (only with ?perf=1 or ?perf=probe) ============
   Owner: WP-A (DESIGN 1.2 perf.js, 1.4.20 window.__perf, 3.9.7, 3.9.8).
   Loaded by quality.js only when the page's address asks for it; nothing here runs in normal play.
   PERF times every frame of the world: the whole frame (the requestAnimationFrame callback), the render call (and, in
   probe mode, the GPU's work: a one-pixel readPixels after it waits for everything drawn; Chromium's gl.finish() does
   not wait), the scheduler's frame (SCHED.frame: people, tasks, fixed steps) and the sky (update, lights, refresh,
   shade). The renderer's counters are reset by hand once a frame, so the shadow pass's draw calls are counted with the
   frame that drew it. It also counts the collision rays cast (SG.ray, which every camCast goes through) and the boxes
   they tested, and reads the scheduler's tiers.
     window.__perf.snapshot(frames = 300) -> Promise of {frames, ms:{frame, render, step, sched, sky}: {median, p95, p99,
       max}, calls, tris, shadowCalls, shadowFrames, programs, geometries, textures, tiers, raysPerFrame, testsPerRay,
       pointLights, canvas, preset}
     window.__perf.views       the named views: {zone, at, pitch}
     window.__perf.setView(n)  you placed at that view (the zone entered first if needed)
     window.__perf.overdraw({w, h, order}) -> {overdraw, covered}: how many times a pixel of the view is shaded (1.5.11)
   Probe page (3.9.8): index.html?perf=probe&zone=<zone>&view=<view>&gfx=<tier>&t=12:00 starts a test career at that
   time in that zone, at that view, warms up for 30 frames and 60 more, records 300 frames (each one world frame
   stepped by hand, drawn and waited for) and leaves the result in window.__perfResult (&warm= and &frames= change the
   counts: SwiftShader draws High slowly). */
import {RT, FADE} from "./core/state.js";
import {SCHED} from "./core/sched.js";
import {SG, SGSTAT} from "./core/collide.js";
import {Q, RQ} from "./core/quality.js";
import {CH, MG, OC, opaqueSort} from "./chunks.js";
import {THREE} from "./build.js";

const qs = new URLSearchParams(location.search);
const MODE = qs.get("perf") || "1", PROBE = MODE === "probe";
const REC = {on:false, frames:[], left:0, done:null, frozen:false};
const F = {t0:0, render:0, sched:0, sky:0, rays0:0, tests0:0, shadow0:0, calls:0, tris:0, shadowFrame:false, occMs:0, occCulled:0, occTris:0};
const now = () => performance.now();
SCHED.timing = !PROBE;                  // (the probe page times whole frames only: a clock read per task would weigh on them)

// the views of DESIGN 3.9.8 that exist in the life zones (the stadium's are added by its zone: __perf.views[name] = ...)
export const VIEWS = {
  bedroom:{zone:"home", at:"bed", pitch:-.08},
  lobby:{zone:"home", at:{x:-9.5, z:-1, y:.12, yaw:Math.PI}, pitch:0},
  street:{zone:"home", at:{x:3, z:10, y:.12, yaw:Math.PI/2}, pitch:0},
  park:{zone:"home", at:{x:24, z:52.8, y:.12, yaw:Math.PI}, pitch:-.05},
  yard:{zone:"ground", at:{x:0, z:22, y:0, yaw:0}, pitch:0},
  pitch:{zone:"ground", at:{x:0, z:-1, y:0, yaw:0}, pitch:-.1},
  "town-road":{zone:"town", at:{x:0, z:4, y:.12, yaw:Math.PI/2}, pitch:0}
};

/* ---------- the wrappers ---------- */
let wrapped = null;
function wrapRenderer(){
  const r = RT.renderer;
  if (!r || wrapped === r) return;
  wrapped = r;
  r.info.autoReset = false;
  const raw = r.render.bind(r), gl = r.getContext(), px = new Uint8Array(4);
  r.render = (scene, cam) => {
    const t = now(), sh = RT.SKY && RT.SKY.shadow ? RT.SKY.shadow.count : 0;
    raw(scene, cam);
    if (PROBE) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    F.render += now() - t;
    F.calls = r.info.render.calls; F.tris = r.info.render.triangles;
    if (OC.cam === cam){ F.occMs = OC.ms; F.occCulled = OC.culled; F.occTris = OC.culledTris; }
    if (RT.SKY && RT.SKY.shadow && RT.SKY.shadow.count !== sh) F.shadowFrame = true;
  };
}
function wrapSky(){
  const s = RT.SKY; if (!s || s.__perf) return;
  s.__perf = true;
  for (const k of ["update", "lights", "refresh", "shade"]){ const f = s[k].bind(s); s[k] = (...a) => { const t = now(); try { return f(...a); } finally { F.sky += now() - t; } }; }
}
{
  const f = SCHED.frame.bind(SCHED);
  SCHED.frame = (...a) => { const t = now(); try { return f(...a); } finally { F.sched += now() - t; } };
}
// every frame of the page: the frame begins when its requestAnimationFrame callback starts
const rafRaw = window.requestAnimationFrame.bind(window);
// (probe mode stops the page's own loop once the probe steps the world by hand: REC.frozen)
window.requestAnimationFrame = cb => rafRaw(ts => { if (REC.frozen) return; begin(); try { cb(ts); } finally { end(); } });
function begin(){
  wrapRenderer(); wrapSky();
  F.t0 = now(); F.render = F.sched = F.sky = 0; F.shadowFrame = false;
  F.rays0 = SGSTAT.rays; F.tests0 = SGSTAT.tests;
  if (RT.renderer) RT.renderer.info.reset();
}
function end(){
  if (!REC.on) return;
  const frame = now() - F.t0, rays = SGSTAT.rays - F.rays0, tests = SGSTAT.tests - F.tests0;
  REC.frames.push({frame, render:F.render, sched:F.sched, sky:F.sky, step:frame - F.render, calls:F.calls, tris:F.tris, shadow:F.shadowFrame, rays, tests, tiers:SCHED.stats().tiers,
    occMs:F.occMs, occCulled:F.occCulled, occTris:F.occTris});
  if (--REC.left <= 0){ REC.on = false; const d = REC.done; REC.done = null; if (d) d(summary(REC.frames)); }
}
// one frame of the world by hand (probe mode and tests): the same bookkeeping as a real frame
function handFrame(L){ begin(); L.stepN(1); if (RT.renderer) RT.renderer.render(RT.scene, RT.cam); end(); }
// between frames stepped by hand the page gets its turn (a test polling it, its timers): SwiftShader takes seconds over
// one frame on High, and a probe that never yielded would hold the page for minutes
const yieldPage = () => new Promise(r => setTimeout(r, 0));

/* ---------- the numbers ---------- */
const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p*s.length))].toFixed(3); };
const stat = a => ({median:q(a, .5), p95:q(a, .95), p99:q(a, .99), max:+Math.max(0, ...a).toFixed(3)});
function summary(fr){
  const r = RT.renderer, main = fr.filter(f => !f.shadow), sh = fr.filter(f => f.shadow);
  const callsMain = q(main.map(f => f.calls), .5), trisMain = q(main.map(f => f.tris), .5);
  const rays = fr.reduce((s, f) => s + f.rays, 0), tests = fr.reduce((s, f) => s + f.tests, 0);
  const tiers = [0, 0, 0, 0, 0]; for (const f of fr) for (let i = 0; i < 5; i++) tiers[i] += f.tiers[i]/fr.length;
  let pointLights = 0; if (RT.scene) RT.scene.traverse(o => { if (o.isPointLight) pointLights++; });
  const P = typeof GFX === "object" && GFX ? GFX.P : null;
  return {frames:fr.length, ms:{frame:stat(fr.map(f => f.frame)), render:stat(fr.map(f => f.render)), step:stat(fr.map(f => f.step)), sched:stat(fr.map(f => f.sched)), sky:stat(fr.map(f => f.sky))},
    calls:callsMain, tris:trisMain, shadowCalls:sh.length ? q(sh.map(f => f.calls), .5) - callsMain : 0, shadowFrames:sh.length,
    programs:r ? r.info.programs.length : 0, geometries:r ? r.info.memory.geometries : 0, textures:r ? r.info.memory.textures : 0,
    tiers:tiers.map(t => +t.toFixed(2)), raysPerFrame:+(rays/fr.length).toFixed(2), testsPerRay:rays ? +(tests/rays).toFixed(2) : 0,
    pointLights, shadowMap:!!(r && r.shadowMap.enabled), antialias:!!(r && r.getContextAttributes().antialias), canvas:r ? [r.domElement.width, r.domElement.height] : null,
    pixelRatio:r ? +r.getPixelRatio().toFixed(3) : 0, Q:{scale:Q.scale, crowd:Q.crowd, lod:Q.lod}, preset:P ? P.tier : null, swaps:RQ.swaps,
    chunks:{meshes:CH.meshes.length, instances:CH.instances, verts:CH.verts, bytes:CH.bytes, multiDraw:CH.multiDraw}, merged:{items:MG.items.size, pages:MG.pages.size, evicted:MG.evicted},
    occlusion:{faces:OC.n, ms:stat(fr.map(f => f.occMs)), instances:q(fr.map(f => f.occCulled), .5), tris:q(fr.map(f => f.occTris), .5)},
    solids:{moved:SG.audit().length}};
}
// record the next n frames of the page's own loop (or, frozen, frames stepped by hand)
function snapshot(frames = 300, {hand = false} = {}){
  return new Promise(res => {
    REC.frames = []; REC.left = frames; REC.on = true; REC.done = res;
    if (hand) (async () => { const L = window.__life; for (let i = 0; i < frames && REC.on; i++){ handFrame(L); await yieldPage(); } })();
  });
}
function setView(name){
  const v = VIEWS[name], L = window.__life; if (!v || !L) return false;
  for (const k in L.keys) L.keys[k] = false;
  if (L.LIFE.zone !== v.zone || typeof v.at === "string") L.enterZone(v.zone, typeof v.at === "string" ? v.at : "bus");
  if (typeof v.at === "object") L.place(v.at);
  L.P.pitch = v.pitch || 0;
  return true;
}
/* Overdraw (DESIGN 1.5.11: at most 2.0 in the bedroom and the lobby on Low, 3.9.2): the view drawn once more as it is
   drawn (the same order, the depth test on), into a w x h float target, every fragment that passes the depth test
   adding 1/64 to its pixel; the background and the fog left out. The mean over the pixels is how many times a pixel
   is shaded, covered the share of pixels drawn at all. order "material" draws it in three.js's own order (by material,
   then depth) instead of the batches' (chunks.js opaqueSort), for comparison */
function overdraw({w = 640, h = 360, order = "batches"} = {}){
  const r = RT.renderer, sc = RT.scene, cam = RT.cam; if (!r || !sc || !cam) return null;
  const rt = new THREE.WebGLRenderTarget(w, h, {type:THREE.HalfFloatType, depthBuffer:true});
  const m = new THREE.MeshBasicMaterial({blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor,
    depthTest:true, depthWrite:true});
  m.color.setScalar(1/64);
  const bg = sc.background, ov = sc.overrideMaterial, fog = sc.fog, prevRT = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
  const px = new Uint16Array(w*h*4);
  try {
    if (order === "material") r.setOpaqueSort(null);
    sc.background = null; sc.overrideMaterial = m; sc.fog = null;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  } finally {
    sc.background = bg; sc.overrideMaterial = ov; sc.fog = fog;
    r.setRenderTarget(prevRT); r.setClearColor(cc, ca); r.setOpaqueSort(opaqueSort);
    rt.dispose(); m.dispose();
  }
  const f16 = b => { const e = (b >> 10) & 0x1f, f = b & 0x3ff; return e === 0 ? Math.pow(2, -14)*(f/1024) : Math.pow(2, e - 15)*(1 + f/1024); };
  let sum = 0, cov = 0;
  for (let i = 0; i < w*h; i++){ const n = Math.round(f16(px[i*4])*64); sum += n; if (n) cov++; }
  return {overdraw:+(sum/(w*h)).toFixed(2), covered:+(cov/(w*h)).toFixed(3)};
}
window.__perf = {snapshot, views:VIEWS, setView, overdraw, handFrame:() => handFrame(window.__life), mode:MODE};

/* ---------- the probe page ---------- */
async function probe(){
  const zone = qs.get("zone") || "home", view = qs.get("view") || "bedroom", gfx = qs.get("gfx"), t = qs.get("t") || "12:00", frames = +(qs.get("frames") || 300), warm = +(qs.get("warm") || 90);
  const [hh, mm] = t.split(":").map(Number), min = (hh || 0)*60 + (mm || 0);
  const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 50); k(); });
  await wait(() => typeof window.startLife === "function" && typeof newCareer === "function" && window.__life);
  if (gfx && typeof setGfx === "function" && GFX.mode !== gfx) setGfx(gfx);
  /* a test career standing in the world (the same steps as qa/lib.mjs career()), made at the same fixed moment
     (qa/lib.mjs CAREER_AT): the career's id is the time it was made, and the id seeds the street (where the cars stand,
     what is on the shelves), so every probe of a view measures the same place */
  const realNow = Date.now; Date.now = () => Date.UTC(2026, 9, 5, 8, 0, 0);
  try {
    CR = {name:"Test Player", number:9, pos:"ST", pref:"ST", foot:"Right", nat:"RO", alloc:Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts:30};
    newCareer(CR);
    for (const k in S.flags) S.flags[k] = true; S.tutDone = true; S.onb = {stage:"done"};
    document.body.classList.add("life");
    A.sign(0);
  } finally { Date.now = realNow; }
  // (the play-time clock took its first reading at that moment: started afresh)
  if (typeof startPlayClock === "function"){ clearInterval(PLAY_T); PLAY_T = null; startPlayClock(); }
  S.life.min = min;
  const v = VIEWS[view] || {zone, at:"bus", pitch:0};
  window.startLife({zone:v.zone || zone});
  const L = window.__life;
  // the page's own loop stops: every frame from here is stepped, drawn and waited for by hand; the cover the world
  // starts under is lifted at once (a frozen loop never presents the frames that would lift it)
  REC.frozen = true;
  FADE.boot = false; FADE.v = 0;
  const fe = document.getElementById("lifeFade"); if (fe){ fe.style.transition = "none"; fe.style.opacity = "0"; }
  setView(view);
  for (let i = 0; i < warm; i++){ handFrame(L); await yieldPage(); }
  const res = await snapshot(frames, {hand:true});
  res.view = view; res.zone = L.LIFE.zone; res.minute = S.life.min;
  window.__perfResult = res;
}
if (PROBE) probe().catch(e => { console.error(e); window.__perfResult = {error:String(e && e.stack || e)}; });
