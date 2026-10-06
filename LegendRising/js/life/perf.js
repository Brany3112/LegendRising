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
   Probe page (3.9.8): index.html?perf=probe&zone=<zone>&view=<view>&gfx=<tier>&t=12:00 starts a test career at that
   time in that zone, at that view, warms up for 30 frames and 60 more, records 300 frames (each one world frame
   stepped by hand, drawn and waited for) and leaves the result in window.__perfResult. */
import {RT, FADE} from "./core/state.js";
import {SCHED} from "./core/sched.js";
import {SG, SGSTAT} from "./core/collide.js";
import {Q, RQ} from "./core/quality.js";
import {CH, MG} from "./chunks.js";

const qs = new URLSearchParams(location.search);
const MODE = qs.get("perf") || "1", PROBE = MODE === "probe";
const REC = {on:false, frames:[], left:0, done:null, frozen:false};
const F = {t0:0, render:0, sched:0, sky:0, rays0:0, tests0:0, shadow0:0, calls:0, tris:0, shadowFrame:false};
const now = () => performance.now();
SCHED.timing = true;

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
  REC.frames.push({frame, render:F.render, sched:F.sched, sky:F.sky, step:frame - F.render, calls:F.calls, tris:F.tris, shadow:F.shadowFrame, rays, tests, tiers:SCHED.stats().tiers});
  if (--REC.left <= 0){ REC.on = false; const d = REC.done; REC.done = null; if (d) d(summary(REC.frames)); }
}
// one frame of the world by hand (probe mode and tests): the same bookkeeping as a real frame
function handFrame(L){ begin(); L.stepN(1); if (RT.renderer) RT.renderer.render(RT.scene, RT.cam); end(); }

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
    solids:{moved:SG.audit().length}};
}
// record the next n frames of the page's own loop (or, frozen, frames stepped by hand)
function snapshot(frames = 300, {hand = false} = {}){
  return new Promise(res => {
    REC.frames = []; REC.left = frames; REC.on = true; REC.done = res;
    if (hand){ const L = window.__life; for (let i = 0; i < frames && REC.on; i++) handFrame(L); }
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
window.__perf = {snapshot, views:VIEWS, setView, handFrame:() => handFrame(window.__life), mode:MODE};

/* ---------- the probe page ---------- */
async function probe(){
  const zone = qs.get("zone") || "home", view = qs.get("view") || "bedroom", gfx = qs.get("gfx"), t = qs.get("t") || "12:00", frames = +(qs.get("frames") || 300);
  const [hh, mm] = t.split(":").map(Number), min = (hh || 0)*60 + (mm || 0);
  const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 50); k(); });
  await wait(() => typeof window.startLife === "function" && typeof newCareer === "function" && window.__life);
  if (gfx && typeof setGfx === "function" && GFX.mode !== gfx) setGfx(gfx);
  // a test career standing in the world (the same steps as qa/lib.mjs career())
  CR = {name:"Probe Player", number:9, pos:"ST", pref:"ST", foot:"Right", nat:"RO", alloc:Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts:30};
  newCareer(CR);
  for (const k in S.flags) S.flags[k] = true; S.tutDone = true; S.onb = {stage:"done"};
  document.body.classList.add("life");
  A.sign(0);
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
  for (let i = 0; i < 90; i++) handFrame(L);
  const res = await snapshot(frames, {hand:true});
  res.view = view; res.zone = L.LIFE.zone; res.minute = S.life.min;
  window.__perfResult = res;
}
if (PROBE) probe().catch(e => { console.error(e); window.__perfResult = {error:String(e && e.stack || e)}; });
