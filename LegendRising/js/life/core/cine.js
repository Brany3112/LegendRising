/* ============ LIFE core: cinematics ============
   Owner: WP-0A (frozen after Stage 0). Contract: DESIGN 1.2 (cine.js), 1.4.1 (the mode cine), 1.4.2 (the camera owner
   cine), 2.2 WP-0A.
   While one runs (intro.js), the camera is driven and you are not: nothing you press moves you or uses anything, the
   clock stands still and the HUD steps aside. frame(dt, cam) puts the camera where the shot wants it; me: "hide" (no
   body), "tp" (your body stands where you are, facing meYaw, seen like anyone else) or "fp" (the first-person body,
   for a shot that ends in your eyes). */
import {animateHuman} from "../human.js";
import {P, B, ME, RT, FLAGS, keys} from "./state.js";
import {registerMode, enterMode, exitMode, mode} from "./modes.js";
import {camPush, camPop} from "./camera.js";
import {meFade, sstep} from "./me.js";
import {HOLD} from "./hand.js";
import {hudReset} from "./hud.js";

export const CINE = {on:false, frame:null, me:"hide", meYaw:0, walk:0, shake:0, shakeT:0};
const OWNER = {id:"cine", priority:90, frame:dt => cineStep(dt), fov:() => B.fovSet, near:.1};
registerMode("cine", {
  enter(){ camPush(OWNER); },
  exit(){ camPop("cine"); if (CINE.on) cineEnd(); },
  flags:{clock:"frozen", movement:"locked", targeting:false, tunnel:false, closing:false, homeTick:true, compass:false, saves:"normal", tp:true, hud:"none", pauseOnUnlock:false, leaveOnZone:false}
});
export function cineBegin(o = {}){
  CINE.on = true; CINE.frame = o.frame || null; CINE.me = o.me || "hide"; CINE.meYaw = o.meYaw != null ? o.meYaw : P.yaw; CINE.walk = 0;
  for (const k in keys) keys[k] = false; FLAGS.grab = null; HOLD.sp = null;
  P.vx = P.vz = 0; P.speed = 0; P.sprint = 0;
  document.body.classList.add("cine");
  if (mode() !== "cine") enterMode("cine");          // (a shot cut straight into the next keeps the mode it is in)
}
export function cineEnd(){
  if (!CINE.on) return;
  CINE.on = false; CINE.frame = null; CINE.shake = 0;
  for (const k in keys) keys[k] = false;
  ME.camT = 0; ME.tpShown = false; ME.near = ME.nearT = 0; ME.yaw = P.yaw;
  if (ME.tp) meFade(1);
  document.body.classList.remove("cine");
  hudReset();
  if (mode() === "cine") exitMode("done");
}
window.lifeCine = () => CINE.on;
// the camera of a cinematic, and the body it may show
export function cineStep(dt){
  const cam = RT.cam;
  if (CINE.frame) CINE.frame(dt, cam);
  if (CINE.shakeT > 0){ CINE.shakeT -= dt; const a = CINE.shake*Math.max(0, CINE.shakeT)/.35; cam.position.x += (Math.random() - .5)*a; cam.position.y += (Math.random() - .5)*a; }
  if (!ME.fp || !ME.tp) return;
  ME.fp.g.visible = false;
  ME.tp.g.visible = CINE.me === "tp";
  if (CINE.me === "tp"){
    const h = ME.tp; ME.yaw = CINE.meYaw;
    h.g.position.set(P.x, P.feet, P.z); h.g.rotation.y = ME.yaw + Math.PI;
    animateHuman(h, dt, CINE.walk > 0 ? {mode:"move", speed:CINE.walk, look:0} : {mode:"idle", look:0});   // (its feet find the floor themselves: meBuild gave it groundAt)
    const c = cam.position; meFade(sstep(.3, .56, Math.hypot(c.x - P.x, c.y - P.eye - .05, c.z - P.z)/ME.scale));
  }
}
export function shake(a = .06, t = .35){ CINE.shake = a; CINE.shakeT = t; }
