/* ============ LIFE core: who owns the camera ============
   Owner: WP-0A (frozen after Stage 0). Contract: DESIGN 1.4.2, 1.3 (single owners), 2.2 WP-0A.
   One owner a frame: the highest priority entry on the stack places the camera (its frame(dt, cam)). Everyone else
   adds to it only through camKick, a small impulse into a critically damped spring, never by writing the camera.
   Owners: life-fp 10, life-tp 11, drill-view 30, match-fp 40, match-bench 41, build 60, cine 90, replay 95.
   P.yaw / P.pitch stay the only look state: the camera starts every frame turned to them, an owner may then place and
   turn it as its shot needs, and the kicks go on top without ever being written back. */
import {P, RT, spring} from "./state.js";

const STACK = [];
/* e = {id, priority, frame(dt, cam), fov?, near?}: fov and near are numbers or functions read every frame, applied when
   the owner changes or the value does (so an owner that animates the field of view itself is not fought every frame) */
export function camPush(e){
  if (!e || !e.id || typeof e.frame !== "function") throw new Error("camPush needs {id, priority, frame}");
  camPop(e.id);
  if (typeof e.priority !== "number") e.priority = 0;
  STACK.push(e);
  STACK.sort((a, b) => a.priority - b.priority);        // stable: of equal priorities the last pushed is on top
}
export function camPop(id){ const i = STACK.findIndex(e => e.id === id); if (i >= 0) STACK.splice(i, 1); }
export function camTop(){ return STACK.length ? STACK[STACK.length - 1].id : null; }
export const camOwners = () => STACK.map(e => e.id);

/* ---------- kicks ----------
   An impulse into a critically damped spring of stiffness w, sized so the offset it makes peaks at what was asked for
   (from rest, a kick of velocity v peaks at v/(e w)). Angles in radians, offsets in metres along the view's own up
   (dy) and back (dz); every offset is held within 3 degrees and 6 cm */
export const KICK = {p:0, pv:0, y:0, yv:0, r:0, rv:0, dy:0, dyv:0, dz:0, dzv:0, w:30, on:false};
const MAX_A = 3*Math.PI/180, MAX_D = .06;
export function camKick({pitch = 0, yaw = 0, roll = 0, dy = 0, dz = 0, w = 30} = {}){
  const k = Math.E*w;
  KICK.w = w;
  KICK.pv += pitch*k; KICK.yv += yaw*k; KICK.rv += roll*k; KICK.dyv += dy*k; KICK.dzv += dz*k;
  KICK.on = true;
}
const lim = (o, kx, kv, m) => { if (o[kx] > m){ o[kx] = m; if (o[kv] > 0) o[kv] = 0; } else if (o[kx] < -m){ o[kx] = -m; if (o[kv] < 0) o[kv] = 0; } };
function kickStep(dt, cam){
  if (!KICK.on) return;
  const w = KICK.w;
  spring(KICK, "p", "pv", w, dt); spring(KICK, "y", "yv", w, dt); spring(KICK, "r", "rv", w, dt);
  spring(KICK, "dy", "dyv", w, dt); spring(KICK, "dz", "dzv", w, dt);
  lim(KICK, "p", "pv", MAX_A); lim(KICK, "y", "yv", MAX_A); lim(KICK, "r", "rv", MAX_A);
  lim(KICK, "dy", "dyv", MAX_D); lim(KICK, "dz", "dzv", MAX_D);
  const off = Math.abs(KICK.p) + Math.abs(KICK.y) + Math.abs(KICK.r) + Math.abs(KICK.dy) + Math.abs(KICK.dz);
  const vel = Math.abs(KICK.pv) + Math.abs(KICK.yv) + Math.abs(KICK.rv) + Math.abs(KICK.dyv) + Math.abs(KICK.dzv);
  if (off < 1e-6 && vel < 1e-5){ KICK.p = KICK.pv = KICK.y = KICK.yv = KICK.r = KICK.rv = KICK.dy = KICK.dyv = KICK.dz = KICK.dzv = 0; KICK.on = false; return; }
  // about the camera's own axes, after its owner has placed it
  cam.rotateY(KICK.y); cam.rotateX(KICK.p); cam.rotateZ(KICK.r);
  if (KICK.dy) cam.translateY(KICK.dy);
  if (KICK.dz) cam.translateZ(KICK.dz);
}

/* ---------- once a frame (world.js step) ---------- */
const APPLIED = {owner:null, fov:null, near:null};
const val = v => typeof v === "function" ? v() : v;
export function camApply(dt){
  const cam = RT.cam, top = STACK[STACK.length - 1];
  if (!cam || !top) return;
  const fresh = APPLIED.owner !== top; APPLIED.owner = top;
  const fov = val(top.fov), near = val(top.near);
  let proj = false;
  if (fov != null && (fresh || fov !== APPLIED.fov) && cam.fov !== fov){ cam.fov = fov; proj = true; }
  if (near != null && (fresh || near !== APPLIED.near) && cam.near !== near){ cam.near = near; proj = true; }
  APPLIED.fov = fov; APPLIED.near = near;
  if (proj) cam.updateProjectionMatrix();
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  top.frame(dt, cam);
  kickStep(dt, cam);
}
