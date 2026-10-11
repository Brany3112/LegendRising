/* ============ Football: your hands on the match ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (control.js: CTRL, controlInput, controlStep), 1.6 (controls), 1.5.3
   (player actions), 3.1.7 (input to intent); addendum A1.1 (the small touch), A1.5 (the action resolver, timing ring,
   mirrored aim, acrobatic options gated by traits).

   What you press becomes what your agent wants, written into its intent before the AI runs in the same fixed step
   (sim.js 3.2.1): where you want to go (W A S D relative to where you look, Shift to sprint, X to walk), and an Action
   record on release (a shot, a pass, a through ball, a cross, a header, a tackle, a slide, a throw-in), the same record
   the AI makes, carried out by actions.js for anyone. Nothing here moves a body or the ball: the simulation does.
   Every timing (a charge, a held R, the release) is counted in simulation steps, so an input bot replays exactly.

   The keys are plain (no Ctrl, no Alt): a key pressed with a modifier does nothing, and every key of 1.6 has its
   browser default stopped while a match is on. The settings are this device's (localStorage freyaFootball.ctrl).

   First-person striking (addendum A1.7, WP-F2; it wins over D10's "the reticle never sways"): everything comes from
   what you see. The reticle sits on the point you look at (the goal mouth for a shot, the grass for a pass or a
   cross) and sways with your Finishing (Passing for a pass), Composure under pressure, your breath and the foot you
   would strike with; the strike goes where the reticle is at the release, then strike.js's deviation on top. Holding
   the button is the wind-up (the power; matchcam.js draws the leg back and fphud.js the arc round the reticle);
   held past full it trembles and you lean back (the ball rises). The strike lands on the plant of your support foot:
   released in your stride's rhythm it is clean, out of it the plant is forced (a wider window with Technique). How
   you move through the release shapes it: a sweep of the mouse curls it, a flick down dips it (topspin), a lift
   chips it, a tap is a placed side-foot, a full wind-up is power; looking low at the goal drives it low. Passes and
   crosses speak the same language. Each choice is a real launch parameter for actions.js and strike.js. */
import {P} from "../core/state.js";
import {dirOf, yawOf, wrapA} from "./pitchspec.js";
import {canStrike, predAt, VOLLEY, pressureOn, ACT as ACTN} from "./actions.js";
import {TOUCH} from "./touch.js";
import {stepLen} from "../gaitcore.js";
import {passModel, callFor} from "./brain.js";
import {restartReady, offsidePosition, RULES} from "./rules.js";
import {rollSpeedFor} from "./ball.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180;

/* ---------- this device's settings (1.6, 3.4.7, A1.2, A1.4) ---------- */
export const SET_KEY = "freyaFootball.ctrl";
export const SET_DEF = Object.freeze({sens:1.0, invertY:false, fov:78, speech:true, offsidePip:"auto", volume:.8, hints:true,
  motion:1, hudScale:1, hudOpacity:1, palette:"normal", radar:false, hide:{}});
function loadSet(){
  let o = {};
  try { o = JSON.parse(localStorage.getItem(SET_KEY) || "{}") || {}; } catch(e){ o = {}; }
  const s = Object.assign({}, SET_DEF, o);
  s.sens = clamp(+s.sens || 1, .4, 2.5); s.fov = clamp(+s.fov || 78, 70, 90); s.volume = clamp(s.volume == null ? .8 : +s.volume, 0, 1);
  s.motion = clamp(s.motion == null ? 1 : +s.motion, 0, 1); s.hudScale = clamp(+s.hudScale || 1, .75, 1.4); s.hudOpacity = clamp(s.hudOpacity == null ? 1 : +s.hudOpacity, .35, 1);
  if (!["auto", "on", "off"].includes(s.offsidePip)) s.offsidePip = "auto";
  if (!["normal", "cb"].includes(s.palette)) s.palette = "normal";
  s.hide = Object.assign({}, s.hide || {});
  return s;
}
export const SET = loadSet();
export function saveSet(patch = {}){
  Object.assign(SET, patch);
  const o = {}; for (const k of Object.keys(SET_DEF)) o[k] = SET[k];
  try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch(e){}
  for (const f of SET_SUBS) try { f(SET); } catch(e){ console.error(e); }
  return SET;
}
const SET_SUBS = new Set();
export const onSet = fn => { SET_SUBS.add(fn); return () => SET_SUBS.delete(fn); };

/* ---------- the feel of a strike (A1.7), the match's and training's alike ---------- */
// a shot wound up with at least BIG_XG of a chance eases the world to BIG_SCALE (released, it comes back over BIG_OUT s);
// your clean contact holds the world for a blink (HIT: [strike quality from, time-scale, seconds])
export const FEEL = Object.freeze({BIG_XG: .25, BIG_SCALE: .8, BIG_OUT: .15, HIT: Object.freeze([[.75, .15, .07], [.45, .4, .05]])});
// the hit-stop a kick event of yours earns, [from, time-scale, seconds], or null: a clean shot, cross or lob only
export function hitStopOf(ev){
  const q = ev.strike != null ? +ev.strike : null;
  if (q == null || ev.scuff || ev.whiff) return null;
  if (!(ev.intent === "shot" || ev.intent === "cross" || ev.intent === "lob")) return null;
  for (const h of FEEL.HIT) if (q >= h[0]) return h;
  return null;
}
// you winding up a shot with the ball yours in live play (the big chance's first test; the chance itself is the caller's)
export const windingShot = (ms, me) => { const ch = CTRL.charge; return !!(me && ch && ch.kind === "shot" && ms.poss.ctl === me.id && ms.phase === "live"); };

/* ---------- numbers (1.5.3) ---------- */
export const CN = Object.freeze({
  SHOT_FULL: .85, OVERHIT: .92, TAP: .18, PASS_FULL: .8, PASS_MIN: 4,
  CONE: 25*DEG, CONE_NEAR: 35*DEG, CONE_NEAR_D: 15, HYST: 6*DEG, THROUGH_D: 8,
  TACKLE_D: 1.6, SLIDE_V: 4, JOCKEY_V: 3.2, CALL_HOLD: .4, CALL_COOL: 4, DRIB_BEND: 12*DEG,
  SCAN_MAX: 110*DEG, SCAN_BACK: .15, HEAD_REACH: 2.1, ATTACK_LOOSE: 2.5,
  SMALL: .55,                 // the small touch: the next dribble touch at this share of its length (A1.1)
  RING: Object.freeze({W0: .07, W1: .16})   // the timing ring of a volley (A1.5): the sweet window in seconds, at volleying 0 and 99
});
/* ---------- first-person striking (A1.7) ----------
   SWAY: the reticle's sway amplitude (radians) is SW0 + SW1 (1 - finishing/100)^1.2, times (1 + PR pressure (1 -
   composure/120)), times (1 + BR (1 - bF)) for the breath, times WEAK for the weak foot (BOTH for a two-footed player),
   times CH[0] + CH[1] p while winding up (CH[0] + 0.1 at rest). Held past full (SHOT_FULL) the over-hold grows over
   OVER seconds: a tremble of TREMBLE radians at 8 to 11 Hz and a lean back of LEAN radians (the ball rises).
   GEST: a gesture is the look's turn over the last N steps up to the release: past MIN radians it counts, at FULL it
   is whole (a sweep across curls, a flick down dips, a lift chips); the aim is taken from before it began.
   RHY: the rhythm (the strike on the support foot's plant). Running above V m/s, a release whose contact can land
   on the next plant within the reach window (Act TC_MAX), or within LATE s after the last one, is in rhythm; out of
   it by more than W0 + W1 technique/99 seconds it is a forced plant (rhythm 1, strike.js's plant error).
   LOW_Y: a shot aimed under this height with Normal contact is driven low (Low contact). PLACED: a tapped shot's
   power. CHIP: a chip's share of the wind-up's power. LOFT: a pass looked at above the horizon is lofted. */
export const AIM = Object.freeze({SW0: .0035, SW1: .019, PR: .6, BR: .8, WEAK: 1.35, BOTH: 1.1, CH: Object.freeze([.45, .75]),
  OVER: .6, TREMBLE: .011, LEAN: .045, GEST_N: 9, GEST_MIN: 3*DEG, GEST_FULL: 11*DEG,
  RHY_V: 1.2, RHY_LATE: .06, RHY_W0: .07, RHY_W1: .15, LOW_Y: .6, PLACED: .5, CHIP: .72, LOFT: .02});
// the strike's Technique (A1.7: it widens the rhythm window): the Clean strike skill (aero), Curve and Ball Control
export const techniqueOf = at => clamp(.4*(at.aero || 0) + .3*(at.curve || 50) + .3*(at.ctrl || at.dribbling || 50), 0, 99);
// the keys this mode answers (1.6); every one has its default stopped in a match
export const KEYS = Object.freeze(["w", "a", "s", "d", "shift", "x", "c", "f", " ", "space", "r", "e", "tab", "escape", "h", "1", "2", "3", "q", "v", "g", "b"]);

/* ---------- the state (1.4.17) ----------
   ctx: what your buttons mean now; walk: the X toggle; scan: a shoulder check (C held: the look turns, the body keeps
   its way); charge: what is filling (a shot, a pass, a throw, a header's jump); contact: Low -1, Normal 0, High 1 (kept
   until changed); finesse: F held; target: the team-mate the pass cone has (agent), whether the crosshair makes it a
   through ball, and the point; call: your last call; uses: how often each hint has been acted on (they shorten) */
export const CTRL = {ctx:"free", walk:false, scan:null, charge:null, contact:0, finesse:false,
  target:{agent:-1, through:false, point:null}, call:{t:-99, kind:null}, uses:{},
  // additions: held keys, the buttons, what was released for the next step, the ring of a volley, the last action
  held:{}, lmb:false, rmb:false, lmbT:0, rmbT:0, rHeld:0, rDone:false, queue:[], ring:null, last:null, jockey:false, small:false,
  aim:{x:0, y:0, z:0, ok:false}, ground:{x:0, z:0}, resolve:null, ready:false, eHeld:0, enabled:true,
  // first-person striking (A1.7): the reticle where the strike goes (the look plus its sway: on, its point, the sway
  // in radians, the amplitude, the beat of your support foot's plant), the wind-up (power, over-hold, the striking
  // side), the look's turns per step (the gestures) and the look at the start of each step, and the last strike's shape
  ret:{on:false, x:0, y:0, z:0, ok:false, sy:0, sp:0, a:0, beat:0, kind:"shot"},
  wind:{p:0, over:0, side:"R", kind:null},
  gx:new Float64Array(16), gy:new Float64Array(16), hy:new Float64Array(16), hp:new Float64Array(16), gi:0, shape:null};

/* ---------- input (router events, and the bots' through __fp.input) ---------- */
// a key pressed with Ctrl, Alt or Meta held: set by controller.js's capture listener for the same browser event
export const MOD = {on:false};
// the event itself was pressed with Ctrl, Alt or Meta held (the guard's one test, D9)
export function modKey(ev){ if (ev.ctrlKey || ev.altKey || ev.metaKey) return true; return false; }
// a key event that is nobody's action: a modifier on it, or held for the browser event it came from (MOD)
export const modded = ev => modKey(ev) || ((ev.type === "keydown" || ev.type === "keyup") && MOD.on);
// ev = {type: 'keydown'|'keyup'|'down'|'up'|'move'|'wheel', key, button, dx, dy, deltaY, repeat, ctrlKey?, altKey?}
// returns true when the event was the match's
export function controlInput(ev){
  if (!ev) return false;
  // a press with a modifier is nobody's action; a release always lets go (a key let go while Ctrl was down must not
  // stay held), so the guard stops presses only
  const md = modded(ev);
  if (md && ev.type !== "keyup") return true;
  const k = ev.key === " " ? "space" : ev.key;
  switch (ev.type){
    case "keydown":
      if (ev.prevent) ev.prevent();
      if (ev.repeat) return true;
      CTRL.held[k] = true;
      if (k === "x") CTRL.walk = !CTRL.walk;
      else if (k === "1" || k === "2" || k === "3"){ CTRL.contact = +k - 2; use("contact"); }
      else if (k === "c") CTRL.queue.push({k:"scan"});
      else if (k === "f") CTRL.queue.push({k:"f"});
      else if (k === "space") CTRL.queue.push({k:"space"});
      else if (k === "r"){ CTRL.rHeld = 0; CTRL.rDone = false; }
      return true;
    case "keyup":
      if (ev.prevent) ev.prevent();
      if (k === "r" && CTRL.held.r && !CTRL.rDone && !md) CTRL.queue.push({k:"rtap"});
      if (k === "c") CTRL.queue.push({k:"unscan"});
      CTRL.held[k] = false;
      return true;
    case "down":
      if (ev.button === 0){ if (!CTRL.lmb){ CTRL.lmb = true; CTRL.lmbT = 0; CTRL.queue.push({k:"ldown"}); } }
      else if (ev.button === 2){ if (!CTRL.rmb){ CTRL.rmb = true; CTRL.rmbT = 0; CTRL.queue.push({k:"rdown"}); } }
      return true;
    case "up":
      if (ev.button === 0 && CTRL.lmb){ CTRL.lmb = false; CTRL.queue.push({k:"lup", t:CTRL.lmbT}); }
      else if (ev.button === 2 && CTRL.rmb){ CTRL.rmb = false; CTRL.queue.push({k:"rup", t:CTRL.rmbT}); }
      return true;
    case "wheel":
      CTRL.contact = clamp(CTRL.contact + (ev.deltaY > 0 ? -1 : 1), -1, 1); use("contact");
      return true;
    case "move": {
      const y0 = P.yaw, p0 = P.pitch;
      look(ev.dx || 0, ev.dy || 0);
      // the turn of the look this step, for the gestures through a release (A1.7): + to the right, + up
      CTRL.gx[CTRL.gi] -= wrapA(P.yaw - y0); CTRL.gy[CTRL.gi] += P.pitch - p0;
      return true;
    }
  }
  return false;
}
// the view turns per event, unsmoothed, at the sensitivity setting (1.5.9); a shoulder check holds the body's way
export function look(dx, dy){
  const k = .0021*SET.sens;
  P.yaw = wrapA(P.yaw - dx*k);
  if (CTRL.scan){ const d = wrapA(P.yaw - CTRL.scan.yaw0); if (Math.abs(d) > CN.SCAN_MAX) P.yaw = wrapA(CTRL.scan.yaw0 + Math.sign(d)*CN.SCAN_MAX); }
  P.pitch = clamp(P.pitch - (SET.invertY ? -dy : dy)*k, -1.35, 1.35);
}
// let go of everything (a cut, a pause, the end of play)
export function controlReset(){
  for (const k in CTRL.held) CTRL.held[k] = false;
  CTRL.lmb = CTRL.rmb = false; CTRL.queue.length = 0; CTRL.charge = null; CTRL.scan = null; CTRL.rHeld = 0; CTRL.jockey = false;
  CTRL.ring = null; CTRL.eHeld = 0; CTRL.acro = null; CTRL.lastShotT = null;
  CTRL.gx.fill(0); CTRL.gy.fill(0); CTRL.ret.on = false; CTRL.wind.p = CTRL.wind.over = 0; CTRL.wind.kind = null;
}
const use = k => { CTRL.uses[k] = (CTRL.uses[k] || 0) + 1; };
// the window lost the keyboard (Alt+Tab, a click outside): the key-ups never come, so everything held is let go here.
// A charge in progress is dropped without a strike (nobody released it), the shoulder check turns back
export function controlRelease(){
  for (const k in CTRL.held) CTRL.held[k] = false;
  if (CTRL.lmb || CTRL.rmb){ CTRL.lmb = CTRL.rmb = false; CTRL.charge = null; }
  if (CTRL.scan) CTRL.queue.push({k:"unscan"});
  CTRL.rHeld = 0; CTRL.rDone = true; CTRL.jockey = false; MOD.on = false;
}
if (typeof addEventListener === "function") addEventListener("blur", () => controlRelease());

/* ---------- where you look ---------- */
// the eye (matchcam's own numbers: 1.68 x scale, ahead of the neck) and the look direction
const EYE = {x:0, y:0, z:0}, LD = {x:0, y:0, z:-1};
function eyeOf(me, yaw = P.yaw, pitch = P.pitch){
  const s = me.scale || 1, ahead = (.07 + .15*sstep(.75, 1.35, -pitch))*s, sy = Math.sin(yaw), cy = Math.cos(yaw);
  EYE.x = me.m.x - sy*ahead; EYE.y = 1.68*s + (me.y || 0); EYE.z = me.m.z - cy*ahead;
  const c = Math.cos(pitch);
  LD.x = -sy*c; LD.y = Math.sin(pitch); LD.z = -cy*c;
}
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
// the point on the grass under the crosshair (60 m at most; looking up, 60 m ahead on the grass)
function groundPoint(out){
  let t = LD.y < -.01 ? (EYE.y - .11)/-LD.y : 60;
  t = Math.min(t, 60);
  out.x = EYE.x + LD.x*t; out.z = EYE.z + LD.z*t;
  if (LD.y >= -.01){ const h = Math.hypot(LD.x, LD.z) || 1; out.x = EYE.x + LD.x/h*t; out.z = EYE.z + LD.z/h*t; }
  return out;
}
// where a shot goes: the crosshair ray where it crosses the goal line of the end you attack (within 12 m of the middle,
// at most 5 m up); not facing that end, the point under the crosshair (a shot at the ground, a lofted ball over it)
function aimPoint(ms, me, out){
  const gx = ms.dirs[me.team]*ms.spec.hx;
  const t = Math.abs(LD.x) > 1e-4 ? (gx - EYE.x)/LD.x : -1;
  if (t > 0 && t < 90){
    const z = EYE.z + LD.z*t, y = EYE.y + LD.y*t;
    if (Math.abs(z) < 14 && y > -2){ out.x = gx; out.y = clamp(y, .12, 5); out.z = clamp(z, -12, 12); out.ok = true; return out; }
  }
  groundPoint(out); out.y = .11; out.ok = false;
  return out;
}

/* ---------- the reticle, the wind-up, the rhythm and the gestures (A1.7) ---------- */
// the foot a ball at your feet would be struck with now (actions.js canStrike's rule: the strong foot unless the ball
// is over 0.25 m to the weak side), without allocating
function footNow(ms, me){
  const pf = me.foot || "R", b = ms.ball, sy = Math.sin(me.m.yaw), cy = Math.cos(me.m.yaw);
  const lat = (b.p.x - me.m.x)*cy - (b.p.z - me.m.z)*sy;
  if (pf === "B") return lat >= 0 ? "R" : "L";
  if (pf === "R" && lat < -TOUCH.WEAK_SIDE) return "L";
  if (pf === "L" && lat > TOUCH.WEAK_SIDE) return "R";
  return pf;
}
// the reticle's sway amplitude (radians) for a shot or a pass now (AIM.SW0 to the wind-up's share)
export function swayAmp(ms, me, kind, p, charging){
  const at = me.at, pass = kind === "pass" || kind === "throw";
  const fin = pass ? (at.passacc != null ? at.passacc : at.passing != null ? at.passing : 50) : at.accuracy != null ? at.accuracy : 50;
  let a = AIM.SW0 + AIM.SW1*Math.pow(1 - clamp(fin, 0, 100)/100, 1.2);
  a *= 1 + AIM.PR*pressureOn(ms, me)*(1 - clamp(at.composure != null ? at.composure : 50, 0, 120)/120);
  a *= 1 + AIM.BR*(1 - (me.fac && me.fac.bF != null ? me.fac.bF : 1));
  if (me.foot === "B") a *= AIM.BOTH; else if (footNow(ms, me) !== (me.foot || "R")) a *= AIM.WEAK;
  return a*(charging ? AIM.CH[0] + AIM.CH[1]*clamp(p, 0, 1) : AIM.CH[0] + .1);
}
// the rhythm of a strike for the foot it is struck with (A1.7): running, the time to the next plant of the support
// foot and since the last one (gaitcore.js: the left foot is down at phi 0, the right at 0.5, phi advanced by the
// distance run); in rhythm when the contact can land on the next plant inside the reach window or just after the last
// one. Out by more than the window (wider with Technique): a forced plant, rhythm 1. tc: the contact on the plant
const RH = {on:false, tp:0, ts:0, rhythm:0, tc:null};
export function rhythmOf(me, foot){
  const v = me.m.speed, g = me.g;
  RH.on = false; RH.rhythm = 0; RH.tc = null; RH.tp = RH.ts = 0;
  if (!g || v < AIM.RHY_V) return RH;
  const stride = 2*stepLen(v, g.mode, me.scale || 1)/v, d = (((foot === "L" ? .5 : 0) - g.phi)%1 + 1)%1;
  RH.on = true; RH.tp = d*stride; RH.ts = (1 - d)*stride;
  const err = Math.min(Math.max(0, RH.tp - ACTN.TC_MAX), Math.max(0, RH.ts - AIM.RHY_LATE));
  RH.rhythm = clamp(err/(AIM.RHY_W0 + AIM.RHY_W1*techniqueOf(me.at)/99), 0, 1);
  if (RH.tp >= .1 && RH.tp <= ACTN.TC_MAX) RH.tc = RH.tp;
  return RH;
}
// the gesture through a release (the look's turn over the last AIM.GEST_N steps): a sweep across (x, + to the right),
// a lift or a flick down (y, + up); the look from before it began (yaw0, pitch0)
const GS = {x:0, y:0, yaw0:0, pitch0:0, curl:0, lift:false, dip:false, any:false};
function gesture(){
  let x = 0, y = 0;
  for (let i = 0; i < AIM.GEST_N; i++){ const k = (CTRL.gi - i + 16)%16; x += CTRL.gx[k]; y += CTRL.gy[k]; }
  const k0 = (CTRL.gi - AIM.GEST_N + 1 + 16)%16, ax = Math.abs(x), ay = Math.abs(y);
  GS.x = x; GS.y = y; GS.yaw0 = CTRL.hy[k0]; GS.pitch0 = CTRL.hp[k0];
  // (how much of a curl: a third at the threshold, all of it at GEST_FULL; its sign is the way the sweep went)
  GS.curl = ax >= AIM.GEST_MIN && ax >= .5*ay ? Math.sign(x)*(.35 + .65*clamp((ax - AIM.GEST_MIN)/(AIM.GEST_FULL - AIM.GEST_MIN), 0, 1)) : 0;
  GS.lift = y >= AIM.GEST_MIN && ay >= .5*ax; GS.dip = y <= -AIM.GEST_MIN && ay >= .5*ax;
  GS.any = !!GS.curl || GS.lift || GS.dip;
  return GS;
}
// one step of the reticle and the wind-up: the sway (smooth, from the match's own clock: an input bot replays it), the
// over-hold's tremble and lean, the point the strike would go to now, the beat of the support foot's plant
const RP = {x:0, y:0, z:0, ok:false};
function reticleStep(ms, me, ctx){
  const R = CTRL.ret, W = CTRL.wind, ch = CTRL.charge;
  const kind = ch ? (ch.kind === "shot" ? "shot" : "pass") : CTRL.aim.ok ? "shot" : "pass";
  const mine = ms.poss.ctl === me.id, R0 = ms.restart, taker = !!(R0 && !R0.taken && R0.taker === me.id);
  R.on = ctx !== "defend" && (!!ch || mine || taker || !!(CTRL.resolve && CTRL.resolve.kind !== "ground" && CTRL.resolve.kind !== "header" && CTRL.resolve.kind !== "divingHeader"));
  const held = ch ? ch.t : 0, full = kind === "shot" ? CN.SHOT_FULL : CN.PASS_FULL;
  W.over = ch && ch.kind !== "throw" ? clamp((held - full)/AIM.OVER, 0, 1) : 0;
  W.p = ch ? ch.p : 0; W.kind = ch ? ch.kind : null; W.side = footNow(ms, me);
  const t = ms.t, A = R.on ? swayAmp(ms, me, kind, W.p, !!ch) : 0;
  R.a = A; R.kind = kind;
  R.sy = A*(.62*Math.sin(1.7*t + .3) + .38*Math.sin(3.1*t + 1.9)) + AIM.TREMBLE*W.over*Math.sin(53*t);
  R.sp = A*.7*(.6*Math.sin(1.3*t + 2.2) + .4*Math.sin(2.7*t + .7)) + AIM.TREMBLE*W.over*Math.sin(67*t + 1) + AIM.LEAN*W.over;
  if (kind === "shot"){ eyeOf(me, P.yaw + R.sy, P.pitch + R.sp); aimPoint(ms, me, RP); eyeOf(me); R.x = RP.x; R.y = RP.y; R.z = RP.z; R.ok = RP.ok; }
  else {
    // a pass: the point it is weighted for (the pass cone's man, the through ball's lead), turned about the ball by the sway
    const tp = CTRL.target.point && CTRL.rmb ? CTRL.target.point : CTRL.ground, b = ms.ball.p;
    const dx = tp.x - b.x, dz = tp.z - b.z, c = Math.cos(R.sy), sn = Math.sin(R.sy);
    R.x = b.x + dx*c + dz*sn; R.z = b.z - dx*sn + dz*c; R.y = .11; R.ok = false;
  }
  // the beat: your support foot coming down (the reticle pulses with it, so the rhythm can be read off the screen)
  const rh = rhythmOf(me, W.side);
  R.beat = rh.on ? Math.max(0, 1 - rh.ts/.15) : 0;
}
// the next step's gesture bucket, and the look it starts from
function gestureStep(){
  const i = CTRL.gi = (CTRL.gi + 1)%16;
  CTRL.gx[i] = 0; CTRL.gy[i] = 0; CTRL.hy[i] = P.yaw; CTRL.hp[i] = P.pitch;
}

/* ---------- context (3.1.7) ---------- */
export function contextOf(ms, me){
  const R0 = ms.restart;
  if (R0 && !R0.taken && R0.taker === me.id) return "restart";
  const b = ms.ball;
  if (ms.poss.ctl === me.id) return "attack";
  if (b.state === "free" && Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) < CN.ATTACK_LOOSE) return "attack";
  if (ms.poss.team === me.team) return "attack";
  if (ms.poss.team === 1 - me.team) return "defend";
  return "free";
}

/* ---------- the pass cone (1.5.3) ---------- */
// the team-mate the crosshair points at: within 25 degrees of the look (35 within 15 m), the one nearest the middle,
// the current one kept unless another is 6 degrees better
function coneTarget(ms, me){
  const yaw = P.yaw;
  let best = -1, bs = Infinity, cur = Infinity;
  for (const o of ms.agents){
    if (o === me || o.team !== me.team || !o.onPitch || o.role !== "player" || o.leaving) continue;
    const dx = o.m.x - me.m.x, dz = o.m.z - me.m.z, d = Math.hypot(dx, dz);
    if (d < 2 || d > 70) continue;
    const ang = Math.abs(wrapA(yawOf(dx, dz) - yaw)), lim = d < CN.CONE_NEAR_D ? CN.CONE_NEAR : CN.CONE;
    if (ang > lim + (o.id === CTRL.target.agent ? CN.HYST : 0)) continue;
    const s = ang + d*.002;
    if (o.id === CTRL.target.agent) cur = s - CN.HYST;
    if (s < bs){ bs = s; best = o.id; }
  }
  if (CTRL.target.agent >= 0 && cur <= bs + 1e-9) best = CTRL.target.agent;
  return best;
}
// a through ball: the crosshair's point on the grass within 8 m of a team-mate's run (where he will be over the next
// 3 s, or his way to that point if he is standing) and ahead of him; the best of them, or -1
const GP = {x:0, z:0};
function throughTarget(ms, me){
  groundPoint(GP);
  const dir = ms.dirs[me.team];
  let best = -1, bd = CN.THROUGH_D;
  for (const o of ms.agents){
    if (o === me || o.team !== me.team || !o.onPitch || o.role !== "player" || o.isGK || o.leaving) continue;
    // ahead of him toward the goal he attacks
    if ((GP.x - o.m.x)*dir < 1) continue;
    const vx = o.m.vx, vz = o.m.vz, v = Math.hypot(vx, vz);
    let d;
    if (v > 1.5){
      const ex = o.m.x + vx*3, ez = o.m.z + vz*3, sx = ex - o.m.x, sz = ez - o.m.z, L2 = sx*sx + sz*sz;
      const u = clamp(((GP.x - o.m.x)*sx + (GP.z - o.m.z)*sz)/(L2 || 1), 0, 1.6);
      d = Math.hypot(o.m.x + sx*u - GP.x, o.m.z + sz*u - GP.z);
    } else {
      // standing: the point must be clearly ahead of him (3 m or more toward the goal), within 8 m across his way there;
      // a crosshair on his feet is a pass to his feet
      const ahead = (GP.x - o.m.x)*dir;
      d = ahead < 3 ? Infinity : Math.abs(GP.z - o.m.z) > 8 ? Infinity : Math.max(0, Math.hypot(GP.x - o.m.x, GP.z - o.m.z) - 12);
    }
    if (d < bd){ bd = d; best = o.id; }
  }
  return best;
}
// the lead point of a through ball (3.1.7): on the runner's way where his time there equals the ball's (5 fixed-point
// rounds), the ball arriving at 8 m/s
function leadPoint(ms, me, o, aimx, aimz, out){
  const b = ms.ball, roll = b.rollDecel || 1.1;
  const v = Math.hypot(o.m.vx, o.m.vz);
  // a team-mate standing still: the ball goes into the space under the crosshair, his to run onto
  if (v <= 1.5){ out.x = aimx; out.y = .11; out.z = aimz; return clampLead(b, out); }
  const ux = o.m.vx/v, uz = o.m.vz/v, sp = Math.max(v, o.prm.run);
  let tx = aimx, tz = aimz;
  for (let i = 0; i < 5; i++){
    const d = Math.hypot(tx - b.p.x, tz - b.p.z), v0 = rollSpeedFor(Math.max(1, d), 8, roll, 1 - .0045*clamp(me.at.aero || 0, 0, 99)), tb = Math.min(3, (v0 - 8)/roll + .25);
    // (damped: a runner as quick as the ball would chase the point off the pitch)
    tx = .5*tx + .5*(o.m.x + ux*sp*tb); tz = .5*tz + .5*(o.m.z + uz*sp*tb);
  }
  out.x = tx; out.y = .11; out.z = tz;
  return clampLead(b, out);
}
// a through ball's point is on the pitch and at most 45 m from the ball
function clampLead(b, out){
  const dx = out.x - b.p.x, dz = out.z - b.p.z, d = Math.hypot(dx, dz);
  if (d > 45){ out.x = b.p.x + dx/d*45; out.z = b.p.z + dz/d*45; }
  out.x = clamp(out.x, -52, 52); out.z = clamp(out.z, -33.5, 33.5);
  return out;
}
// where a pass to a team-mate is aimed: his feet where he will be when it gets there (3 rounds)
function passPoint(ms, me, o, out){
  const b = ms.ball;
  let tx = o.m.x, tz = o.m.z;
  for (let i = 0; i < 3; i++){
    const d = Math.hypot(tx - b.p.x, tz - b.p.z), t = d/11 + .15;
    tx = o.m.x + o.m.vx*t*.8; tz = o.m.z + o.m.vz*t*.8;
  }
  out.x = tx; out.y = .11; out.z = tz;
  return out;
}

/* ---------- the action resolver (A1.5) ----------
   What a strike becomes from where the ball will be met: its height, its side, how far, your facing against the goal
   and what you can do (traits): on the grass a shot or a pass as charged; a ball dropping at knee to waist height in
   front, a volley; to the side, a side volley; at head height, a header (a diving header when it is low and in front
   at a stretch). With the Acrobatic trait a ball over the hip with your back half to goal offers the scissor kick and,
   facing away from goal, the overhead kick; with Flair a ball on the weak side at the feet offers the rabona. Without
   the trait those are never offered. Returns {kind, part, tc, side, h, mirrored} or null when no ball is coming. */
export const RESOLVE = Object.freeze({VOLLEY: [.35, 1.15], HEAD: [1.45, 2.4], DIVE: [.45, 1.0], SIDE: .45, LOOK: .9, REACH: .9, REACH_HEAD: .5, DIVE_AHEAD: [1.0, 2.6]});
const RB = {x:0, y:0, z:0};
// (the records are scalars and the result is written into `out`, by default the one CTRL.resolve holds: nothing is
// allocated in a step)
const RES = {kind:"ground", tc:0, side:"R", h:0, x:0, y:0, z:0, mirrored:false, face:0};
const MP = {ok:false, t:0, x:0, y:0, z:0, ahead:0, lat:0, d:0}, MN = {ok:false, t:0, x:0, y:0, z:0, ahead:0, lat:0, d:0}, MD = {ok:false, t:0, x:0, y:0, z:0, ahead:0, lat:0, d:0};
const meet = (o, t, B, ahead, lat, d) => { o.ok = true; o.t = t; o.x = B.x; o.y = B.y; o.z = B.z; o.ahead = ahead; o.lat = lat; o.d = d; return o; };
const resOut = (out, kind, m, mirrored, face) => { out.kind = kind; out.tc = m.t; out.side = m.lat >= 0 ? "R" : "L"; out.h = m.y; out.x = m.x; out.y = m.y; out.z = m.z; out.mirrored = mirrored; out.face = face; return out; };
export function resolveAction(ms, me, traits = {}, out = RES){
  const b = ms.ball;
  if (b.state !== "free") return null;
  const B = RB;
  MP.ok = MN.ok = MD.ok = false;
  let gap = Infinity;
  const f = dirOf(me.m.yaw), v = me.m.speed;
  // the meeting point, measured from where your run takes you by then (your velocity carried on): the first moment the
  // ball is within reach (half a metre more for every second you have to adjust), else, running onto a low ball in
  // front, the stretch of a diving header, else the moment it passes closest
  for (let i = 1; i <= Math.round(RESOLVE.LOOK*30); i++){
    const t = i/30;
    predAt(ms, t, B);
    const px = me.m.x + me.m.vx*t, pz = me.m.z + me.m.vz*t;
    const dx = B.x - px, dz = B.z - pz, d = Math.hypot(dx, dz);
    const reachH = .5*t + (B.y >= RESOLVE.HEAD[0] ? RESOLVE.REACH_HEAD : RESOLVE.REACH);
    if (d > reachH + 1.6) continue;
    const ahead = dx*f.x + dz*f.z, lat = dx*-f.z + dz*f.x;
    if (!MD.ok && v > 2.5 && B.y >= RESOLVE.DIVE[0] && B.y <= RESOLVE.DIVE[1] && ahead >= RESOLVE.DIVE_AHEAD[0] && ahead <= RESOLVE.DIVE_AHEAD[1] &&
      Math.abs(lat) <= RESOLVE.SIDE) meet(MD, t, B, ahead, lat, d);
    if (!MP.ok && d - reachH < gap){ gap = d - reachH; meet(MN, t, B, ahead, lat, d); }
    if (!MP.ok && d <= reachH) meet(MP, t, B, ahead, lat, d);
    if (MP.ok && MD.ok) break;
  }
  const gx = ms.dirs[me.team]*ms.spec.hx, toGoal = yawOf(gx - me.m.x, -me.m.z), face = Math.abs(wrapA(toGoal - me.m.yaw))/DEG;
  // a low ball you can only reach by throwing yourself at it, going towards goal: the diving header
  if (MD.ok && face < 70 && (!MP.ok || MD.t < MP.t)) return resOut(out, "divingHeader", MD, false, face);
  const best = MP.ok ? MP : MN.ok ? MN : null;
  if (!best) return null;
  const hgt = best.y, sideways = Math.abs(best.lat) > RESOLVE.SIDE;
  const acro = !!(traits && (traits.acrobatic || traits.Acrobatic)), flair = !!(traits && (traits.flair || traits.Flair));
  let kind = "ground";
  if (hgt >= RESOLVE.HEAD[0] && hgt <= RESOLVE.HEAD[1] + (me.at.jumping || 50)*.008) kind = "header";
  else if (hgt >= RESOLVE.VOLLEY[0] && hgt <= RESOLVE.VOLLEY[1]){
    if (acro && face > 120 && hgt > .7) kind = "bicycle";
    else if (acro && face > 60 && sideways && hgt > .75) kind = "scissor";
    else kind = sideways ? "sidevolley" : "volley";
  } else if (hgt < RESOLVE.VOLLEY[0] && flair && ((me.foot === "R" && best.lat < -.2) || (me.foot === "L" && best.lat > .2))) kind = "rabona";
  // (a ball at the chest, nothing to strike, that drops in front of you as you run on: the diving header)
  if (kind === "ground" && hgt > RESOLVE.VOLLEY[1] && MD.ok && face < 70) return resOut(out, "divingHeader", MD, false, face);
  // an overhead kick is struck facing away: the aim is mirrored (A1.5), what you see behind you is where it goes
  return resOut(out, kind, best, kind === "bicycle", face);
}
// the overhead kick's aim, mirrored: the crosshair's bearing turned through half a turn about you, the same height
export function mirrorAim(me, aim, out){
  const dx = aim.x - me.m.x, dz = aim.z - me.m.z;
  out.x = me.m.x - dx; out.y = aim.y; out.z = me.m.z - dz;
  return out;
}

/* ---------- one step (before the AI, 3.2.1) ---------- */
const ACT = {x:0, y:0, z:0}, TGT = {x:0, y:0, z:0};
const CHG = {kind:"shot", t:0, p:0}, RNG = {kind:"volley", tc:0, w:0};
// opts = {traits, live: false while play is stopped for you (walk-out, a cut), restart: what the restart allows}
export function controlStep(ms, me, h, opts = {}){
  if (!me || !me.onPitch || !CTRL.enabled){ CTRL.queue.length = 0; CTRL.ret.on = false; CTRL.wind.p = 0; CTRL.wind.kind = null; return; }
  const I = me.intent;
  eyeOf(me);
  aimPoint(ms, me, CTRL.aim); groundPoint(CTRL.ground);
  const ctx = CTRL.ctx = contextOf(ms, me);
  CTRL.finesse = !!CTRL.held.f;
  CTRL.resolve = ctx === "attack" || ctx === "free" ? resolveAction(ms, me, opts.traits) : null;
  if (CTRL.lmb) CTRL.lmbT += h;
  if (CTRL.rmb) CTRL.rmbT += h;
  // R held: "In behind!" at 0.4 s
  if (CTRL.held.r && !CTRL.rDone){ CTRL.rHeld += h; if (CTRL.rHeld >= CN.CALL_HOLD){ CTRL.rDone = true; call(ms, me, "behind"); } }
  // the charge on show (the HUD's ring): a shot with LMB held, a pass with RMB held, in attack and at a restart
  const canBall = ctx !== "defend";
  // (one record each, filled in place: nothing is allocated in a step)
  if (CTRL.lmb && canBall){ const t = CTRL.lmbT; CTRL.charge = CHG; CHG.kind = "shot"; CHG.t = t; CHG.p = 1 - Math.pow(1 - Math.min(1, t/CN.SHOT_FULL), 2); }
  else if (CTRL.rmb && canBall){ const t = CTRL.rmbT; CTRL.charge = CHG; CHG.kind = isThrow(ms, me) ? "throw" : "pass"; CHG.t = t; CHG.p = Math.min(1, t/CN.PASS_FULL); }
  else CTRL.charge = null;
  // the pass target, while the pass button is down (and for the receiver ring)
  if (CTRL.rmb && canBall){
    const th = throughTarget(ms, me), cone = coneTarget(ms, me);
    CTRL.target.through = th >= 0 && th !== cone ? true : th >= 0 && th === cone;
    CTRL.target.agent = th >= 0 ? th : cone;
    if (th >= 0) CTRL.target.point = leadPoint(ms, me, ms.agents[th], CTRL.ground.x, CTRL.ground.z, CTRL.target.point || {x:0, y:0, z:0});
    else if (cone >= 0) CTRL.target.point = passPoint(ms, me, ms.agents[cone], CTRL.target.point || {x:0, y:0, z:0});
    else CTRL.target.point = null;
  } else if (!CTRL.rmb){ CTRL.target.through = false; }
  // the timing ring of a volley or an acrobatic strike (A1.5): it closes on the moment the ball will be met
  const R = CTRL.resolve;
  if (R && R.kind !== "ground" && R.kind !== "header" && R.kind !== "divingHeader"){
    CTRL.ring = RNG; RNG.kind = R.kind; RNG.tc = R.tc; RNG.w = CN.RING.W0 + (CN.RING.W1 - CN.RING.W0)*(me.at.dribbling || 50)/99;
  } else CTRL.ring = null;
  // the reticle and the wind-up (A1.7): what a release would strike now
  reticleStep(ms, me, ctx);

  // ---- the presses, in order
  while (CTRL.queue.length){
    const q = CTRL.queue.shift();
    switch (q.k){
      case "scan": CTRL.scan = {yaw0:P.yaw}; use("scan"); break;
      case "unscan": if (CTRL.scan){ CTRL.scanBack = {from:P.yaw, to:CTRL.scan.yaw0, t:0}; CTRL.scan = null; } break;
      case "rtap": call(ms, me, "here"); break;
      case "f":
        if (ctx === "defend" && me.m.speed > CN.SLIDE_V && !me.act){ I.action = {kind:"slide"}; use("slide"); CTRL.last = "slide"; }
        break;
      case "space": space(ms, me); break;
      case "ldown": if (ctx === "defend") tackle(ms, me); break;
      case "lup": if (ctx !== "defend") strike(ms, me, "shot", q.t, opts); break;
      case "rup": if (ctx !== "defend") strike(ms, me, isThrow(ms, me) ? "throw" : "pass", q.t, opts); break;
    }
  }

  // ---- where you go
  const bodyYaw = CTRL.scan ? CTRL.scan.yaw0 : P.yaw;
  const f = (CTRL.held.w ? 1 : 0) - (CTRL.held.s ? 1 : 0), r = (CTRL.held.d ? 1 : 0) - (CTRL.held.a ? 1 : 0);
  const len = Math.hypot(f, r), sin = Math.sin(bodyYaw), cos = Math.cos(bodyYaw);
  I.dx = len ? (r*cos - f*sin)/len : 0; I.dz = len ? (-r*sin - f*cos)/len : 0;
  I.face = I.face || {x:0, z:0}; I.face.x = -sin; I.face.z = -cos;
  I.strafe = false; I.speedCap = Infinity;
  const dball = Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z);
  I.gait = CTRL.walk ? "walk" : CTRL.held.shift ? "sprint" : "jog";
  if (ctx === "restart"){ I.gait = dball > 8 && !CTRL.walk ? "jog" : "walk"; }
  // jockeying (RMB held defending): side-on, at most 3.2 m/s, facing the man on the ball
  CTRL.jockey = ctx === "defend" && CTRL.rmb;
  if (CTRL.jockey){
    const c = ms.agents[ms.poss.ctl];
    if (c){ const dx = c.m.x - me.m.x, dz = c.m.z - me.m.z, d = Math.hypot(dx, dz) || 1; I.face.x = dx/d; I.face.z = dz/d; }
    I.speedCap = CN.JOCKEY_V; I.strafe = true; if (I.gait === "sprint") I.gait = "run";
    use("jockey");
  }
  // a header on its way (A1.5): the last steps to the meeting point are taken for you, so the brow is under the ball
  // when it comes (the resolver's point: the head is over the body); your keys take over again after
  const hd = me.act && me.act.kind === "header" && !me.act.dive && !me.act.done && !me.act.air ? CTRL.headMeet : null;
  if (hd){
    const dx = hd.x - me.m.x, dz = hd.z - me.m.z, d = Math.hypot(dx, dz), left = Math.max(.05, me.act.tc - me.act.t);
    if (d > .06){ I.dx = dx/d; I.dz = dz/d; I.gait = "run"; I.speedCap = Math.min(I.speedCap, d/left + .5); }
    else { I.dx = I.dz = 0; }
  }
  // the ball at your feet: the dribble's way and length (a small touch with F held and nothing charging, A1.1)
  CTRL.small = !!CTRL.held.f && !CTRL.charge && ctx === "attack";
  if (ms.poss.ctl === me.id){
    if (len){
      // setting off with it from (nearly) standing, the first stride plays it on (actions.js dribbleStep: start)
      const d = me.drib || (me.drib = {dx:0, dz:0, gait:"jog", speed:0, t:ms.t, commit:0, small:false, start:me.m.speed < 1.5});
      // (the speed the touch is weighed for: the gait you go at, so a touch from standing is not left under your feet)
      d.dx = I.dx; d.dz = I.dz; d.gait = I.gait; d.small = CTRL.small;
      // the run bends a little towards the ball (at most 12 degrees off the keys' way, only while it is in front), so a
      // touch that went a little wide is followed rather than run past: the ball stays yours until you choose otherwise
      const b = ms.ball, bx = b.p.x + b.v.x*.25 - me.m.x, bz = b.p.z + b.v.z*.25 - me.m.z, bl = Math.hypot(bx, bz);
      if (bl > .2 && (bx*I.dx + bz*I.dz)/bl > Math.cos(40*DEG)){
        const cross = I.dx*bz - I.dz*bx, ang = clamp(Math.asin(clamp(cross/bl, -1, 1)), -CN.DRIB_BEND, CN.DRIB_BEND);
        const c = Math.cos(ang), s = Math.sin(ang), nx = I.dx*c - I.dz*s, nz = I.dx*s + I.dz*c;
        I.dx = nx; I.dz = nz;
      }
      // (setting off from standing, the first touch is weighed for the first strides: 2 m/s)
      d.speed = d.start ? 2 : I.gait === "walk" ? me.prm.walk : I.gait === "sprint" ? .8*me.prm.sprint : me.prm.jog;
    } else if (me.drib) me.drib = null;
  }
  // a ball on its way to you: you take it (the first touch pushes it the way you are going), or a first-time strike
  // queued for its arrival
  if (ms.ball.state === "free" && ms.poss.ctl !== me.id){
    const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind:"receive", push:null, first:null, x:me.m.x, z:me.m.z});
    if (len){ p.push = p.push || {x:0, z:0}; p.push.x = I.dx; p.push.z = I.dz; } else p.push = null;
    if (p.first && ms.t - (p.firstT || 0) > 1.2) p.first = null;
  } else if (me.plan && me.plan.kind === "receive") me.plan = null;
  gestureStep();
}

// is this a throw-in you are taking, the ball in your hands
function isThrow(ms, me){ const R0 = ms.restart; return !!(R0 && !R0.taken && R0.taker === me.id && R0.kind === "throw"); }

// a call for the ball: "Here!" (tap, 4 s apart) or "In behind!" (held) to the point under the crosshair
function call(ms, me, how){
  if (how === "here" && ms.t - CTRL.call.t < CN.CALL_COOL) return;
  if (CTRL.ctx === "defend" && how === "behind") return;
  const pt = how === "behind" ? {x:CTRL.ground.x, z:CTRL.ground.z} : null;
  callFor(ms, me, how, pt);
  CTRL.call.t = ms.t; CTRL.call.kind = how;
  use("call");
}

// LMB defending: a standing tackle on the man on the ball within 1.6 m (else a lunge is pointless: the hint says so)
function tackle(ms, me){
  const c = ms.agents[ms.poss.ctl];
  if (!c || c.team === me.team || me.act) return;
  if (Math.hypot(c.m.x - me.m.x, c.m.z - me.m.z) > CN.TACKLE_D){ CTRL.last = "far"; return; }
  me.intent.action = {kind:"tackle", sub:"stand"};
  CTRL.last = "tackle"; use("tackle");
}

const RES_SPACE = {kind:"ground", tc:0, side:"R", h:0, x:0, y:0, z:0, mirrored:false, face:0};
// Space: a header when the ball comes into head reach (LMB held: at goal; RMB held: to the cone's man; neither: clear
// it), else a jump; a low ball in front at a stretch, a diving header (A1.5)
function space(ms, me){
  if (me.act) return;
  const R = resolveAction(ms, me, null, RES_SPACE), b = ms.ball;
  const H = R && (R.kind === "header" || R.kind === "divingHeader") ? R : null;
  const intent = CTRL.lmb ? "attack" : CTRL.rmb ? "pass" : "clear";
  let target = null;
  if (intent === "attack") target = {x:CTRL.aim.x, y:CTRL.aim.ok ? CTRL.aim.y : 1.2, z:CTRL.aim.z};
  else if (intent === "pass"){ const o = ms.agents[coneTarget(ms, me)]; if (o) target = passPoint(ms, me, o, {x:0, y:0, z:0}); }
  const tc = H ? clamp(H.tc, .12, .9) : .3;
  // (the jump sized to the ball: none for one at your head, a full leap for one above it)
  me.intent.action = {kind:"header", tc, intent, target, power:1, dive:!!(H && H.kind === "divingHeader"), ballY:H ? H.y : null};
  CTRL.headMeet = H && H.kind === "header" ? {x:H.x, z:H.z} : null;
  CTRL.last = H ? (H.kind === "divingHeader" ? "divingHeader" : "header") : "jump"; use("header");
  void b;
}

// LMB or RMB released (attack, a free ball, a restart): the strike, built here and carried out by actions.js
function strike(ms, me, what, held, opts){
  if (me.act && me.act.kind !== "header") return;
  const R0 = ms.restart, mine = R0 && !R0.taken && R0.taker === me.id;
  // a restart is yours to take only once it is ready (the ball placed, or in your hands for a throw)
  if (mine && !restartReady(ms)){ CTRL.last = "wait"; return; }
  if (R0 && !R0.taken && !mine) return;
  const at = me.at, b = ms.ball;
  if (what === "throw"){
    const vmax = 8 + .07*(at.passing || 50), d = Math.min(Math.hypot(CTRL.ground.x - b.p.x, CTRL.ground.z - b.p.z), 6 + vmax*vmax/9.81*.8*Math.min(1, held/CN.PASS_FULL + .25));
    const g = CTRL.ground, dd = Math.hypot(g.x - b.p.x, g.z - b.p.z) || 1;
    const tgt = {x:b.p.x + (g.x - b.p.x)/dd*d, y:.11, z:b.p.z + (g.z - b.p.z)/dd*d};
    me.intent.action = {kind:"throw", target:tgt, recv:CTRL.target.agent};
    CTRL.last = "throw"; use("throw"); return;
  }
  const Rz = CTRL.resolve, contact = CTRL.contact, fKey = !!CTRL.held.f;
  // the body shape through the release (A1.7): the gesture of the last few steps, and the aim from before it began
  const G = gesture(), Ret = CTRL.ret;
  if (G.any) use("shape");
  CTRL.gest = {x:G.x, y:G.y, curl:G.curl, lift:G.lift, dip:G.dip};
  if (what === "shot" && held >= CN.TAP) use("release");
  if (what === "shot"){
    // the charge: p = 1 - (1 - t/0.85)^2 (1.5.3); past 0.92 the over-hit is the solver's sigma (power above 0.92)
    let p = 1 - Math.pow(1 - Math.min(1, held/CN.SHOT_FULL), 2);
    const over = clamp((held - CN.SHOT_FULL)/AIM.OVER, 0, 1);
    // where it goes: the reticle (your look plus its sway); with a gesture, the look from before the sweep
    let tgt;
    if (G.any){ eyeOf(me, G.yaw0 + Ret.sy, G.pitch0 + Ret.sp); aimPoint(ms, me, RP); eyeOf(me); tgt = {x:RP.x, y:RP.y, z:RP.z}; }
    else tgt = {x:Ret.x, y:Ret.y, z:Ret.z};
    const toGoal = G.any ? RP.ok : Ret.ok;
    if (Rz && Rz.mirrored) tgt = mirrorAim(me, tgt, {x:0, y:0, z:0});
    // a lofted ball with contact High at a point on the grass: a cross or a chip, picking a zone in the box (3.1.7)
    let kind = "shot";
    if (!toGoal && (contact > 0 || G.lift)) kind = inBoxPoint(ms, me, tgt) ? "cross" : "lob";
    // the shape: a tap is a placed side-foot; a lift chips it, a flick down dips it (topspin), a sweep curls it; a
    // full wind-up is power; looked at low on goal with Normal contact it is driven low
    let shape = held < CN.TAP ? "placed" : p >= .97 ? "power" : "struck", ctc = contact, finesse = fKey, curl = null, bend = null, style = null, chip = false;
    if (shape === "placed"){ p = AIM.PLACED; finesse = true; curl = 0; style = "side"; }
    if (G.lift && kind === "shot"){ shape = "chip"; ctc = 1; chip = true; p *= AIM.CHIP; style = "chip"; }
    else if (G.dip){ shape = "dip"; ctc = -1; }
    else if (kind === "shot" && ctc === 0 && toGoal && tgt.y < AIM.LOW_Y && shape !== "placed"){ shape = shape === "power" ? "power low" : "low"; ctc = -1; }
    if (kind !== "shot"){ ctc = 1; shape = "lofted"; }
    if (G.curl){ finesse = true; bend = G.curl; shape = shape === "placed" || shape === "struck" || shape === "power" ? "curl" : shape + " curl"; }
    // held past full: you lean back and it rises (with the over-hit's sigma, strike.js)
    if (over > 0 && kind === "shot"){ const d = Math.hypot(tgt.x - b.p.x, tgt.z - b.p.z); tgt.y += over*(.6 + .05*d); shape += " over"; }
    const rq = {kind, target:tgt, recv:-1, power:clamp(p, .05, 1), contact:ctc, finesse, firstTime:ms.poss.ctl !== me.id, atGoal:toGoal, shape, over};
    if (curl != null) rq.curl = curl;
    if (bend != null) rq.bend = bend;
    if (chip) rq.chip = true;
    if (style) rq.style = style;
    if (kind === "cross" || kind === "lob"){ rq.speed = undefined; rq.power = undefined; rq.recv = nearestMate(ms, me, tgt); }
    if (Rz && Rz.kind !== "ground"){
      rq.style = Rz.kind; rq.timing = timingOf(Rz); rq.tc = Rz.tc; rq.meet = {x:Rz.x, y:Rz.y, z:Rz.z};
      // an acrobatic strike (the traits' scissor, overhead and rabona): the controller's slow motion and its shot (A1.5)
      if (ACRO.has(Rz.kind)) CTRL.acro = {style:Rz.kind, t:ms.t, tc:Rz.tc, x:Rz.x, y:Rz.y, z:Rz.z};
    }
    queueStrike(ms, me, rq);
    CTRL.last = kind; CTRL.shape = shape; use(kind === "shot" ? "shoot" : "cross");
    return;
  }
  // a pass: a tap is weighted for you (arrival 9 m/s), held it is charged with a sweet zone (1.5.3)
  const tgtId = CTRL.target.agent >= 0 ? CTRL.target.agent : coneTarget(ms, me);
  const o = ms.agents[tgtId];
  let tp = CTRL.target.point && o ? CTRL.target.point : null;
  if (!tp && o) tp = passPoint(ms, me, o, {x:0, y:0, z:0});
  if (!tp){ tp = {x:CTRL.ground.x, y:.11, z:CTRL.ground.z}; }
  // the reticle's sway turns the pass about the ball (A1.7): where it was pointing at the release
  if (Ret.sy){ const b0 = b.p, dx = tp.x - b0.x, dz = tp.z - b0.z, c = Math.cos(Ret.sy), sn = Math.sin(Ret.sy); tp = {x:b0.x + dx*c + dz*sn, y:.11, z:b0.z - dx*sn + dz*c}; }
  const d = Math.hypot(tp.x - b.p.x, tp.z - b.p.z), roll = b.rollDecel || 1.1;
  const vmax = 22 + .06*(at.passing || 50);
  const through = CTRL.target.through && o;
  // (the ball you strike carries your Clean strike: ball.js ballKick sets its drag to 1 - 0.0045 aero, so it rolls
  // further than a default ball, and the weight is worked out for that ball)
  const dm = 1 - .0045*clamp(at.aero || 0, 0, 99);
  const ideal = rollSpeedFor(Math.max(1, d), through ? 8 : 9, roll, dm);
  // a tap is weighted for you: its error is in what it arrives at, 9 m/s give or take with your Passing, held within 8
  // to 10 (1.5.3), not a share of the launch, which over 40 m would arrive anywhere
  const zA = Math.sqrt(-2*Math.log(Math.max(1e-9, ms.r())))*Math.cos(2*Math.PI*ms.r());
  const arrive = clamp((through ? 8 : 9) + zA*.6*(1 - (at.passing || 50)/120), through ? 7.5 : 8, through ? 9.5 : 10);
  let speed = rollSpeedFor(Math.max(1, d), arrive, roll, dm), charged = false, sweet = false;
  if (held >= CN.TAP){
    const c = Math.min(1, held/CN.PASS_FULL), cIdeal = clamp((ideal - CN.PASS_MIN)/(vmax - CN.PASS_MIN), 0, 1), w = .10 + .25*(at.passing || 50)/100;
    charged = true;
    if (Math.abs(c - cIdeal) <= w/2){ sweet = true; speed = ideal; }
    else speed = CN.PASS_MIN + (vmax - CN.PASS_MIN)*c;
  }
  // along the grass unless the lane is blocked (pOK under 0.6) or it needs more than you can give; then lofted. The
  // same language as a shot (A1.7): a lift through the release (or a look above the horizon) lofts it, a sweep curls it
  let kind = through ? "through" : "pass", ctc = contact, shape = charged ? (sweet ? "weighted" : "struck") : "tapped";
  const lift = G.lift || (ctc === 0 && P.pitch > AIM.LOFT && d > 12);
  if (ctc > 0 || lift){ kind = inBoxPoint(ms, me, tp) ? "cross" : "lob"; ctc = 1; if (lift) shape = "lofted"; }
  else if (o){
    const pm = passModel(ms, me, {x:tp.x, z:tp.z}, "pass", speed, o);
    if ((pm && pm.pOK < .6 && d > 12) || ideal > vmax){ kind = "lob"; ctc = 1; }
  }
  const finesse = fKey || !!G.curl;
  const rq = {kind, target:{x:tp.x, y:.11, z:tp.z}, recv:o ? o.id : -1, contact:ctc, finesse, charged, sweet, firstTime:ms.poss.ctl !== me.id, shape};
  if (G.curl){ rq.bend = G.curl; rq.shape = shape + " curl"; }
  if (kind === "pass" || kind === "through"){ rq.speed = clamp(speed, CN.PASS_MIN, vmax); if (!charged) rq.weightSigma = .004; }
  queueStrike(ms, me, rq);
  CTRL.last = kind; CTRL.shape = rq.shape; use(kind === "through" ? "through" : "pass");
}
const ACRO = new Set(["scissor", "bicycle", "rabona"]);
// the volley's timing from the ring (A1.5): 0 on the moment, 1 at the ring's edge or beyond; strike.js reads it as
// the plant error that widens the deviation
export const RING_T = .2;          // the moment the ring closes: this long before the ball is met (a volley's swing to contact)
function timingOf(R){ const w = CTRL.ring ? CTRL.ring.w : CN.RING.W1; return clamp(Math.max(0, Math.abs(R.tc - RING_T) - w/2)/w, 0, 1); }
// in front of you, in reach: now; on its way to you: a first-time strike when it arrives (touchCheck starts it)
function queueStrike(ms, me, rq){
  const b = ms.ball, cs = canStrike(me, b, rq.style);
  // (a strike in the air, the resolver's volley, starts now and waits for the ball itself: actions.js VOLLEY.WAIT)
  const air = !!rq.style && VOLLEY.STYLES.has(rq.style);
  const incoming = !air && b.state === "free" && ms.poss.ctl !== me.id && !cs.ok && Math.hypot(b.v.x, b.v.z) > 2 && approaching(ms, me);
  if (incoming){
    const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind:"receive", push:null, first:null});
    p.first = rq; p.firstT = ms.t;
    return;
  }
  // the rhythm (A1.7): the strike lands on your support foot's plant when that comes inside the reach window, and how
  // far out of your stride the release was is a forced plant (actions.js adds it to the plant error)
  // (a ball you still have to reach is struck after the stride adjust: the rhythm of the release is still yours)
  if (!air){
    const rh = rhythmOf(me, cs.foot);
    if (rh.on){ rq.rhythm = Math.round(rh.rhythm*1000)/1000; if (rh.tc != null && cs.ok) rq.tcWant = rh.tc; }
  }
  me.intent.action = rq;
}
function approaching(ms, me){
  const b = ms.ball, dx = me.m.x - b.p.x, dz = me.m.z - b.p.z, d = Math.hypot(dx, dz);
  return d < 25 && (dx*b.v.x + dz*b.v.z)/(d || 1) > 1;
}
function inBoxPoint(ms, me, p){ const end = ms.dirs[me.team]; return end*p.x > ms.spec.hx - 18 && Math.abs(p.z) < 22; }
function nearestMate(ms, me, p){
  let best = -1, bd = 12;
  for (const o of ms.agents){ if (o === me || o.team !== me.team || !o.onPitch || o.isGK) continue; const d = Math.hypot(o.m.x - p.x, o.m.z - p.z); if (d < bd){ bd = d; best = o.id; } }
  return best;
}

// the turn back from a shoulder check: over 0.15 s toward where the body was looking (per frame, from the camera)
export function scanStep(dt){
  const S = CTRL.scanBack; if (!S) return;
  S.t += dt;
  const k = clamp(S.t/CN.SCAN_BACK, 0, 1), e = k*k*(3 - 2*k);
  P.yaw = wrapA(S.from + wrapA(S.to - S.from)*e);
  if (k >= 1) CTRL.scanBack = null;
}
// the offside pip and line (1.5.10), for the match and the training pitch alike: relative to the second-last defender
// now. out.pip 'onside' | 'near' (within 0.5 m) | 'off' | null (not shown: the setting, a keeper, no offside in play);
// out.x the line across the pitch where it stands (null when there is no offside), for the Tab overview
export function offsideHud(ms, me, show, out){
  out.pip = null; out.x = null;
  if (!me || !me.onPitch || me.isGK || (ms.rules && !ms.rules.offside)) return out;
  const o = offsidePosition(ms, me, me.team), dir = ms.dirs[me.team], half = ms.spec.L/2;
  // (o.line is in the attacking frame with the defenders' body margin added; the ball's own line has none)
  const bu = dir*ms.ball.p.x + half;
  out.x = dir*(o.line - half - (o.line > bu + 1e-9 ? RULES.OFF.body : 0));
  if (show) out.pip = o.off ? "off" : o.margin > -.5 ? "near" : "onside";
  return out;
}
// the hints for this moment (1.5.10): up to three [key, verb], shortened to the key after 5 uses
export function hintsFor(ms, me){
  const out = [], ctx = CTRL.ctx, short = k => (CTRL.uses[k] || 0) >= 5;
  const add = (key, verb, k) => out.push({key, verb:short(k) ? "" : verb});
  if (!me || !me.onPitch) return out;
  if (ctx === "restart"){
    const R0 = ms.restart;
    if (R0 && R0.kind === "throw") add("RMB", restartReady(ms) ? "hold and release to throw" : "walk to the ball", "throw");
    else if (restartReady(ms)){ add("LMB", "shoot or cross", "shoot"); add("RMB", "pass", "pass"); }
    else add("W", "walk to the ball", "walk");
  } else if (ctx === "attack"){
    if (ms.poss.ctl === me.id){
      // (A1.7: the wind-up, the release on your plant, the shape through it)
      if (CTRL.charge && CTRL.charge.kind === "shot"){ add("LMB", "let go as your foot plants", "release"); add("Mouse", "sweep to curl, lift to chip", "shape"); }
      else if (CTRL.charge && CTRL.charge.kind === "pass"){ add("RMB", "let go for the weight", "pass"); add("Mouse", "sweep to curl, lift to loft", "shape"); }
      else { add("LMB", "hold to wind up, let go to shoot", "shoot"); add("RMB", "pass", "pass"); add("Mouse", "sweep through it to curl", "shape"); }
    }
    else if (CTRL.resolve && CTRL.resolve.kind === "header") add("Space", "head it", "header");
    else if (CTRL.resolve && CTRL.resolve.kind !== "ground") add("LMB", "volley it", "shoot");
    else { add("R", "call for it", "call"); add("Shift", "sprint", "sprint"); }
  } else if (ctx === "defend"){
    const c = ms.agents[ms.poss.ctl];
    if (c && Math.hypot(c.m.x - me.m.x, c.m.z - me.m.z) < CN.TACKLE_D + .6) add("LMB", "tackle", "tackle");
    add("RMB", "jockey", "jockey");
    if (me.m.speed > CN.SLIDE_V) add("F", "slide", "slide");
  } else { add("R", "call for it", "call"); add("Space", "jump", "header"); }
  return out.slice(0, 3);
}
