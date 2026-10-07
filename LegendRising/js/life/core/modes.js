/* ============ LIFE core: modes, zones, input, the boot cover, saving ============
   Owner: WP-0A (frozen after Stage 0). Contract: DESIGN 1.4.1 (modes, zones, input), 1.7 (save gating), 3.7.1 (covered
   boot), 2.2 WP-0A.
   A mode is a way of living a frame that is not plain walking about: a drill, a cinematic, build mode, later the match
   and first-person training. Exactly one runs at a time ("life" when none). What the world does in it (the passive
   clock, aiming at spots, the tunnel, closing time, saving, third person, the life HUD) is read from its flags, never
   from which mode it is. */
import {LIFE, FLAGS, FADE, G} from "./state.js";
import {MINI} from "../mini.js";

/* ---------- modes ---------- */
// what plain life allows; a mode's flags are these with its own on top
const LIFE_FLAGS = Object.freeze({clock:"life", movement:"life", targeting:true, tunnel:true, closing:true, homeTick:true,
  compass:true, saves:"life", tp:true, hud:"life", pauseOnUnlock:false, leaveOnZone:true});
const MODES = {};
const CUR = {name:"life", arg:null};
/* spec = {enter(arg), exit(reason), step?(dt, real), fixed?(h), input?(ev) -> consumed, flags}, and two optional
   fields of this implementation: slice?(h), lived in every sub-step of the frame right after your own movement and
   the 'anims' task (the order the world has always lived a frame in); lockLook?() -> true while the mouse must not
   turn the view. flags.leaveOnZone (default true): a zone change ends the mode. */
export function registerMode(name, spec){
  if (!name || name === "life") throw new Error("a mode needs a name other than life");
  spec.flags = Object.assign({}, LIFE_FLAGS, spec.flags || {});
  MODES[name] = spec;
  return spec;
}
// exits the current mode first (unless it is life), then enters this one and marks the page with body.mode-<name>
export function enterMode(name, arg){
  const spec = MODES[name]; if (!spec) throw new Error(`no mode called ${name}`);
  if (CUR.name !== "life") exitMode("switch");
  CUR.name = name; CUR.arg = arg === undefined ? null : arg;
  document.body.classList.add(`mode-${name}`);
  if (spec.enter) spec.enter(arg);
}
// back to life. The mode is already over when its exit() runs, so anything exit() sets off that asks to leave the mode
// again (a drill told to stop, calling its host's endDrill) finds it gone and does nothing twice
export function exitMode(reason = "done"){
  const name = CUR.name; if (name === "life") return;
  const spec = MODES[name];
  CUR.name = "life"; CUR.arg = null;
  document.body.classList.remove(`mode-${name}`);
  if (spec && spec.exit) spec.exit(reason);
}
export const mode = () => CUR.name;
export const modeArg = () => CUR.arg;
export const modeFlags = () => CUR.name === "life" ? LIFE_FLAGS : MODES[CUR.name].flags;
const spec = () => CUR.name === "life" ? null : MODES[CUR.name];
export function modeStep(dt, real){ const s = spec(); if (s && s.step) s.step(dt, real); }
export function modeSlice(h){ const s = spec(); if (s && s.slice) s.slice(h); }
export function modeLookLocked(){ const s = spec(); return !!(s && s.lockLook && s.lockLook()); }

/* ---------- zones ---------- */
// spec = {build(ctx, opts) -> spawns, tick?(dt), leave?()}: world.js enterZone(name, at, opts) builds through it
const ZONES = {};
export function registerZone(name, z){ ZONES[name] = z; return z; }
export const zoneSpec = name => ZONES[name] || null;

/* ---------- input ----------
   ev = {type: 'keydown'|'keyup'|'down'|'up'|'move'|'wheel'|'lock', key, code, button, dx, dy, deltaY, repeat, locked},
   plus prevent() (the browser's default action for it). Handlers pushed here are tried newest first, then the
   running mode's input(ev), then the life handler; the first that returns true has consumed it. */
const HANDLERS = [];
export function pushInput(fn){ popInput(fn); HANDLERS.push(fn); }
export function popInput(fn){ const i = HANDLERS.lastIndexOf(fn); if (i >= 0) HANDLERS.splice(i, 1); }
export function routeInput(ev, life){
  for (let i = HANDLERS.length - 1; i >= 0; i--) if (HANDLERS[i](ev)) return true;
  const s = spec(); if (s && s.input && s.input(ev)) return true;
  return life ? !!life(ev) : false;
}

/* ---------- is your control taken away? ----------
   (a panel, the phone or the hub, the old tutorial card, a mode that locks movement, a hands-on minigame) */
// (the tutorial layer's element is looked up once and kept while it is in the page, not found again every frame)
let TUT_EL = null;
export const tutOn = () => { const t = TUT_EL && TUT_EL.isConnected ? TUT_EL : (TUT_EL = document.getElementById("tutRoot")); return !!(t && t.classList.contains("on")); };
export const locked = () => !!(window.lifeMoveLocked && window.lifeMoveLocked()) || FLAGS.modal || tutOn() || modeFlags().movement === "locked" || !!MINI.on;

/* ---------- the passive clock's rate ---------- */
const CLOCK = {scale:null};
// fn() -> a multiplier on the passive life clock (firstday.js slows the first morning down); null puts it back
export function setClockScale(fn){ CLOCK.scale = typeof fn === "function" ? fn : null; }
export function clockScale(){
  if (!CLOCK.scale) return 1;
  const k = +CLOCK.scale();
  return Number.isFinite(k) && k >= 0 ? k : 1;
}

/* ---------- the first day's listener ---------- */
// world.js tells it what you aim at ('aim') and where you are ('zone'); the first-day steps listen through window.lifeOnb
export function onbEmit(ev, data){ if (typeof window.lifeOnb === "function") window.lifeOnb(ev, data); }

/* ---------- the boot cover ----------
   startLife puts the screen behind black before the world is shown and lifts it only once frames have been drawn, so
   no half-built or wrong first frame is ever seen. A boot plan (firstday.js) can take over the start: where you are,
   that the cover stays until it lifts it itself, and the camera the first frames are drawn from. */
let PLAN = null;
// fn(opts) -> {zone, at, cover: true, cam: {pos:[x, y, z], look:[x, y, z]}} | null
export function bootPlan(fn){ PLAN = typeof fn === "function" ? fn : null; }
export function bootPlanFor(opts){ return PLAN ? PLAN(opts) || null : null; }
let FE = null;
const fadeEl = () => (FE && FE.isConnected ? FE : (FE = document.getElementById("lifeFade")));
export function coverScreen(){
  const o = fadeEl(); if (o){ o.style.transition = "none"; o.style.opacity = "1"; }
  FADE.v = 1;
}
// the boot cover: as coverScreen, and remembered as startLife's own, so that only its own reveal lifts it
export function bootCover(){ coverScreen(); FADE.boot = true; }
// someone else took the cover over (the introduction fading in, a bus fade): it is theirs to lift now
export function bootCoverCheck(){ if (FADE.boot){ const o = fadeEl(); if (o && o.style.opacity !== "1") FADE.boot = false; } }
export function liftBootCover(ms = 500){
  if (!FADE.boot) return false;
  FADE.boot = false; FADE.v = 0;
  const o = fadeEl(); if (o){ o.style.transition = `opacity ${ms}ms ease`; o.style.opacity = "0"; }
  return true;
}
// resolves once n frames have been presented by the camera owner on top when they were drawn (counting again from
// the start if the owner changes) and ready() is true. Until then the screen stays covered
const WAIT = [];
export function revealAfterFrames(n = 2, ready = () => true){
  coverScreen();
  return new Promise(res => WAIT.push({n, ready, res, owner:undefined, count:0}));
}
// world.js, after every frame it draws
export function framePresented(owner){
  if (!WAIT.length) return;
  for (const w of WAIT.slice()){
    if (w.owner !== owner){ w.owner = owner; w.count = 0; }
    if (++w.count >= w.n && w.ready()){ WAIT.splice(WAIT.indexOf(w), 1); w.res(owner); }
  }
}

/* ---------- saving ----------
   Saving serialises the whole career (over a megabyte) and writes it in one go: 40 to 120 ms in which nothing can be
   drawn. So the world never saves while you are on the move. persist(true) is for when the screen is covered (a fade,
   the bus, sleep): it saves there and then; persist() only marks the save as due, and the loop writes it at the next
   quiet moment: you standing still with the mouse at rest, a panel or the hub up, or the pointer released. A mode with
   saves 'defer' (a drill, the match) holds every save until it calls persistNow() at a safe moment, or ends. */
export const SAVE = {due:false, dueT:0, t:0};
export function saveNowIf(){
  SAVE.due = false; SAVE.dueT = 0;
  if (!G()) return;
  if (typeof saveNow === "function") saveNow(); else if (typeof save === "function") save();
}
export const persist = now => { if (!G()) return; if (now) saveNowIf(); else SAVE.due = true; };
// a save now, whatever the mode defers (the screen is covered, the ball is dead)
export function persistNow(){ saveNowIf(); }
// while you are out walking about (pointer held, no panel up), every other save() (a drill finishing, the day's
// bookkeeping) waits for that moment too; in a mode that defers saves it always waits; anywhere else it is the
// ordinary save
const save0 = typeof save === "function" ? save : null;
if (save0) window.save = function(){
  const sv = modeFlags().saves;
  if (LIFE.running && (sv === "defer" || (sv === "life" && !FLAGS.modal && !FLAGS.busy && document.pointerLockElement && !document.body.classList.contains("in-match")))){ SAVE.due = true; return true; }
  return save0.apply(this, arguments);
};
addEventListener("pagehide", () => { if (SAVE.due) saveNowIf(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && SAVE.due) saveNowIf(); });
