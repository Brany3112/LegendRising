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
   The one exception (P2b-B, TRAINING-SPEC 0 and 3): C held shields the ball, and in full screen with the keyboard
   locked (core/keylock.js) Ctrl shields too; only then does a press made with Ctrl held count, so you can turn, sprint
   and pass while you hold it. The shoulder check moved from C to V (held).

   First-person striking (addendum A1.7, WP-F2; it wins over D10's "the reticle never sways"): everything comes from
   what you see. The reticle sits on the point you look at (the goal mouth for a shot, the grass for a pass or a
   cross) and sways with your Finishing (Passing for a pass), Composure under pressure, your breath and the foot you
   would strike with; the strike goes where the reticle is at the release, then strike.js's deviation on top. Holding
   the button is the wind-up (the power; matchcam.js draws the leg back and fphud.js the arc round the reticle);
   held past full it trembles and you lean back (the ball rises). The strike lands on the plant of your support foot:
   released in your stride's rhythm it is clean, out of it the plant is forced (a wider window with Technique). How
   you move through the release shapes it: a sweep of the mouse curls it, a flick down dips it (topspin), a lift
   chips it, a tap is a placed side-foot, a full wind-up is power; looking low at the goal drives it low. Passes and
   crosses speak the same language. Each choice is a real launch parameter for actions.js and strike.js.

   UF2-A (stage UF2, USER-ISSUES U17 to U20: easier, readable, rewarding; assists on by default, a harder setting kept):
   - Assists (SET.assist: "on", "low" or "off", this device's setting; assistK 1, 0.5, 0). Everything below that helps
     you scales with it, and "off" plays as it did before.
   - The kick type (U20): Normal, Placed, Driven, Chip or Curl (KICKS), chosen with the mouse wheel or 1, 2, 3 (Driven,
     Normal, Chip: the old Low, Normal and High contact, CTRL.contact kept in step) before you strike; fphud.js shows it
     in a corner all the time. Each is a real launch: Placed a side-foot at a controlled pace, Driven low contact,
     Chip high contact (a chipped shot, a lofted pass), Curl the finesse. The gestures through a release still shape it.
   - One meter for a shot and a held pass (U18, U19: CTRL.meter, drawn by fphud.js near the crosshair): it fills while
     the button is held and marks the sweet spot, the power that suits the distance for a shot (meterBand) and the
     weight that suits it for a pass. Let go inside it and, with the assists, the strike is clean (rq.clean; off, the
     spot is the power or the weight to use and the stride still counts): your plant is forgiven
     (actions.js kickCtx) and it goes where you look, without the reticle's sway. Its width grows with the assists.
   - Passing (U19): a tap is weighted for the distance as before; the assists widen the pass cone to the team-mate
     nearest where you look and send it to him without the sway, and a placed pass is never lofted for you.
   - The first touch (U17): F held (or pressed in the last SETTLE_LATCH s) as the ball arrives kills it onto your
     preferred foot, within reach, the way you look (me.plan.settle; touch.js firstTouch ctx.settle). With assists on,
     a ball coming to you while you stand with no keys held is settled the same way. F never slides you into a ball
     that is coming to you first. Dribbling below a sprint keeps it close to your foot (me.drib.close, touch.js
     dribbleTouch): only a sprint pushes it on. */
import {P, ME} from "../core/state.js";
import {dirOf, yawOf, wrapA} from "./pitchspec.js";
import {canStrike, predAt, VOLLEY, pressureOn, ACT as ACTN} from "./actions.js";
import {TOUCH} from "./touch.js";
import {stepLen} from "../gaitcore.js";
import {passModel, callFor} from "./brain.js";
import {restartReady, offsidePosition, RULES} from "./rules.js";
import {rollSpeedFor} from "./ball.js";
import {standReach, slideReach} from "./duel.js";
import {TUNE} from "./tune.js";
import {arrivalOf, canPlay} from "./zone.js";
import {KEYLOCK, ctrlShields, tipFSDue} from "../core/keylock.js";
import {sprintSpeed} from "../mover.js";
import {raiseHand} from "./agent.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const DEG = Math.PI/180;

/* ---------- this device's settings (1.6, 3.4.7, A1.2, A1.4) ---------- */
export const SET_KEY = "freyaFootball.ctrl";
export const SET_DEF = Object.freeze({sens:1.0, invertY:false, fov:78, offsidePip:"auto", volume:.8, hints:true,
  motion:1, hudScale:1, hudOpacity:1, palette:"normal", radar:false, hide:{}, assist:"on", footCam:"third",
  tpDist:4, tpHeight:1.5, tpSide:0, tpShake:0});
// the third-person camera, yours to set: how far back (m), how high over your head (m), over which shoulder (m, minus
// is the left), and how much it shakes at a full sprint (0 none, 1 the most)
export const TP_SET = Object.freeze({tpDist:[2, 8], tpHeight:[.3, 3], tpSide:[-1.2, 1.2], tpShake:[0, 1]});
// (U21) the football camera: "third" (behind and above you, the default) or "first" (through your eyes)
export const FOOT_CAMS = Object.freeze(["third", "first"]);
function loadSet(){
  let o = {};
  try { o = JSON.parse(localStorage.getItem(SET_KEY) || "{}") || {}; } catch(e){ o = {}; }
  const s = Object.assign({}, SET_DEF, o);
  s.sens = clamp(+s.sens || 1, .4, 2.5); s.fov = clamp(+s.fov || 78, 70, 90); s.volume = clamp(s.volume == null ? .8 : +s.volume, 0, 1);
  s.motion = clamp(s.motion == null ? 1 : +s.motion, 0, 1); s.hudScale = clamp(+s.hudScale || 1, .75, 1.4); s.hudOpacity = clamp(s.hudOpacity == null ? 1 : +s.hudOpacity, .35, 1);
  if (!["auto", "on", "off"].includes(s.offsidePip)) s.offsidePip = "auto";
  if (!["normal", "cb"].includes(s.palette)) s.palette = "normal";
  if (!ASSISTS.includes(s.assist)) s.assist = "on";
  if (!FOOT_CAMS.includes(s.footCam)) s.footCam = "third";
  for (const [k, [lo, hi]] of Object.entries(TP_SET)){ const v = +s[k]; s[k] = Number.isFinite(v) ? clamp(v, lo, hi) : SET_DEF[k]; }
  s.hide = Object.assign({}, s.hide || {});
  return s;
}
// (UF2-A) the assist levels and how much each helps (0..1)
export const ASSISTS = Object.freeze(["on", "low", "off"]);
const ASSIST_K = Object.freeze({on:1, low:.5, off:0});
export const SET = loadSet();
// (U21) life reads the football camera through the shared state (me.js: the apartment ball), never this module
ME.footCam = SET.footCam;
// (U28 part E) the keys held in the last SHOT_KEYS.T s as a shot is let go shape it (control.js strike)
export const SHOT_KEYS = Object.freeze({T: .25, POWER: 1.1});
// (a time after the clock is a match or a go before this one: its clock began again from nothing)
const keyHeld = (t, k) => t - k >= 0 && t - k <= SHOT_KEYS.T;
export function shotKeys(ms){ const t = ms.t, K = CTRL.keyT; return {w: keyHeld(t, K.w), a: keyHeld(t, K.a), s: keyHeld(t, K.s), d: keyHeld(t, K.d)}; }
// (U28 part B) how long you go on forward at a jog before it is a run: 0.6 s at Acceleration 50, 0.3 at 90 (0.2 to 0.8)
export const runAfter = me => clamp(.6 - .3*(((me.at && me.at.acceleration) || 50) - 50)/40, .2, .8);
// (U26) two Shift presses this close together (seconds) are a knock-on
export const KNOCK_TAP = .3;
const nowS = () => (typeof performance === "object" && performance.now ? performance.now() : Date.now())/1000;
export const assistK = () => ASSIST_K[SET.assist] != null ? ASSIST_K[SET.assist] : 1;
export function saveSet(patch = {}){
  Object.assign(SET, patch);
  for (const [k, [lo, hi]] of Object.entries(TP_SET)) if (k in patch){ const v = +SET[k]; SET[k] = Number.isFinite(v) ? clamp(v, lo, hi) : SET_DEF[k]; }
  const o = {}; for (const k of Object.keys(SET_DEF)) o[k] = SET[k];
  try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch(e){}
  ME.footCam = SET.footCam;
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
  TACKLE_D: 1.6, SLIDE_V: 4, JOCKEY_V: 3.2, TACKLE_SLACK: .35, SLIDE_SLACK: .8, SHIELD_NEAR: 2.2, NOTE_T: 1.6, CALL_HOLD: .4, DRIB_BEND: 12*DEG,
  SCAN_MAX: 110*DEG, SCAN_BACK: .15, HEAD_REACH: 2.1, ATTACK_LOOSE: 2.5, RACE_T: 1.5,
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
  RHY_V: 1.2, RHY_LATE: .06, RHY_W0: .07, RHY_W1: .15, LOW_Y: .6, PLACED: .5, CHIP: .72, LOFT: .02,
  PLACED_MAX: .72, DRIVEN: 12});
/* ---------- the kick type and the meter (UF2-A, U18 to U20) ----------
   KICKS: the types the wheel goes through, top to bottom (a wheel turned down goes down the list, toward the lower
   strikes, as it lowered the contact before), each with the contact it strikes with. METER: the shot's sweet spot is
   centred on the power for the distance (SHOT_C0 at SHOT_D0 m to SHOT_C1 at SHOT_D1 m), SHOT_W wide with no assists
   and SHOT_WA wider with them, a little wider with Technique, always under the over-hit; a held pass's is the weight
   for the distance (the ideal launch speed's share of the range), PASS_W0 + PASS_W1 Passing/100 wide, PASS_WA times
   wider with the assists. GOLD: the perfect spot in the middle of a shot's sweet spot, this share of its width (at least
   GOLD_MIN). A shot let go outside the sweet spot is scuffed; in it but off the gold it is a good shot, a little off the
   aim (GOOD_DEG degrees at the gold's edge to GOOD_DEG + GOOD_DEG1 at the spot's); in the gold it is perfect, as true as
   your skills allow. A scuff is SCUFF_DEG + SCUFF_DEG1 degrees off (at least SCUFF_MIN m), skied when over-hit and weak
   along the grass when under-hit (SCUFF_P of the power). SETTLE_LATCH: a press of F this long before the ball arrives still settles it. CONE_A: how
   much wider the pass cone is with the assists (a share of it) */
export const KICKS = Object.freeze([
  Object.freeze({id:"chip", label:"Chip", contact:1}),
  Object.freeze({id:"curl", label:"Curl", contact:0}),
  Object.freeze({id:"normal", label:"Normal", contact:0}),
  Object.freeze({id:"placed", label:"Placed", contact:0}),
  Object.freeze({id:"driven", label:"Driven", contact:-1})
]);
const KICK_OF_CONTACT = {"-1":"driven", "0":"normal", "1":"chip"};
export const METER = Object.freeze({SHOT_C0:.55, SHOT_C1:.86, SHOT_D0:8, SHOT_D1:30, SHOT_W:.12, SHOT_WA:.14, TECH_W:.04, SHOT_MAX:.91,
  GOLD:.35, GOLD_MIN:.04, GOOD_DEG:1, GOOD_DEG1:1.5, SCUFF_DEG:5, SCUFF_DEG1:5, SCUFF_MIN:1.2, SCUFF_P:.75,
  PASS_W0:.10, PASS_W1:.25, PASS_WA:.6, SETTLE_LATCH:.5, CONE_A:.8});
// the shot's sweet band for a strike d metres to its target, a Technique (0..99) and an assist share (0..1): {lo, hi}
// in charge units (the power the meter fills with), and its gold (perfect) spot in the middle, {glo, ghi}. Pure: the
// unit tests check it
export function meterBand(d, tech = 50, ak = 1, out = {lo:0, hi:0, c:0, glo:0, ghi:0}){
  const k = clamp(((+d || 0) - METER.SHOT_D0)/(METER.SHOT_D1 - METER.SHOT_D0), 0, 1);
  const c = METER.SHOT_C0 + (METER.SHOT_C1 - METER.SHOT_C0)*k;
  const w = METER.SHOT_W + METER.SHOT_WA*clamp(ak, 0, 1) + METER.TECH_W*clamp(tech, 0, 99)/99;
  out.c = c; out.hi = Math.min(METER.SHOT_MAX, c + w/2); out.lo = Math.max(.2, out.hi - w);
  const m = (out.lo + out.hi)/2, g = Math.max(METER.GOLD_MIN, (out.hi - out.lo)*METER.GOLD)/2;
  out.glo = m - g; out.ghi = m + g;
  return out;
}
// how a shot let go at charge p sits on its band: {grade: "perfect" | "good" | "scuff", e: how far off, 0..1, over: past
// the spot}. Pure: the unit tests check it
export function shotGrade(p, band, out = {grade:"good", e:0, over:false}){
  out.over = p > band.hi;
  if (p >= band.glo && p <= band.ghi){ out.grade = "perfect"; out.e = 0; }
  else if (p >= band.lo && p <= band.hi){
    out.grade = "good";
    out.e = p < band.glo ? (band.glo - p)/Math.max(1e-6, band.glo - band.lo) : (p - band.ghi)/Math.max(1e-6, band.hi - band.ghi);
  } else { out.grade = "scuff"; out.e = clamp((p < band.lo ? band.lo - p : p - band.hi)/.15, 0, 1); }
  out.e = clamp(out.e, 0, 1);
  return out;
}
// a held pass's sweet band: the ideal launch speed's share of the range from PASS_MIN to vmax, its width with Passing
// (0..100) and the assists
export function passBand(ideal, vmax, passing = 50, ak = 1, out = {lo:0, hi:0, c:0}){
  const c = clamp((ideal - CN.PASS_MIN)/(vmax - CN.PASS_MIN), 0, 1);
  const w = (METER.PASS_W0 + METER.PASS_W1*clamp(passing, 0, 100)/100)*(1 + METER.PASS_WA*clamp(ak, 0, 1));
  out.c = c; out.lo = c - w/2; out.hi = c + w/2;
  return out;
}
// (U28 part E: there is no kick type to choose any more, the wheel and 1, 2, 3 are gone: a shot is shaped by the keys
// held as you let it go, shotKeys. A lesson's own Low or High contact still sets CTRL.contact, setKick)
export const kickType = () => KICKS[2];
// the kick type by its id; the contact follows it (1, 2, 3 and the lessons' Low and High contact)
export function setKick(id){
  const i = KICKS.findIndex(k => k.id === id);
  if (i < 0) return;
  CTRL.kick = i; CTRL.contact = KICKS[i].contact;
  use("contact");
}
// the strike's Technique (A1.7: it widens the rhythm window): the Clean strike skill (aero), Curve and Ball Control
export const techniqueOf = at => clamp(.4*(at.aero || 0) + .3*(at.curve || 50) + .3*(at.ctrl || at.dribbling || 50), 0, 99);
// the keys this mode answers (1.6); every one has its default stopped in a match
export const KEYS = Object.freeze(["w", "a", "s", "d", "shift", "x", "c", "f", " ", "space", "r", "e", "tab", "escape", "h", "1", "2", "3", "q", "v", "g", "b"]);

/* ---------- the state (1.4.17) ----------
   ctx: what your buttons mean now; walk: the X toggle; scan: a shoulder check (V held: the look turns, the body keeps
   its way); shield: C held (or Ctrl in a locked full screen) with the ball yours or about to be (P2b-B); note: a press
   that came to nothing, and why (the hint says it); tipFS: the one-time full-screen tip is due (fphud.js shows it);
   charge: what is filling (a shot, a pass, a throw, a header's jump); contact: Low -1, Normal 0, High 1 (kept
   until changed); finesse: F held; target: the team-mate the pass cone has (agent), whether the crosshair makes it a
   through ball, and the point; call: your last call; uses: how often each hint has been acted on (they shorten) */
export const CTRL = {keyT:{w:-1e9, a:-1e9, s:-1e9, d:-1e9}, shiftAt:-1e9, knockReq:false, ctx:"free", walk:false, scan:null, shield:false, note:null, tipFS:false, tipAsked:false, charge:null, contact:0, finesse:false,
  target:{agent:-1, through:false, point:null}, call:{t:-99, kind:null, seq:0, n:0}, uses:{},
  // additions: held keys, the buttons, what was released for the next step, the ring of a volley, the last action
  held:{}, lmb:false, rmb:false, lmbT:0, rmbT:0, rHeld:0, rDone:false, queue:[], ring:null, last:null, jockey:false, small:false,
  aim:{x:0, y:0, z:0, ok:false}, ground:{x:0, z:0}, resolve:null, ready:false, eHeld:0, enabled:true,
  // first-person striking (A1.7): the reticle where the strike goes (the look plus its sway: on, its point, the sway
  // in radians, the amplitude, the beat of your support foot's plant), the wind-up (power, over-hold, the striking
  // side), the look's turns per step (the gestures) and the look at the start of each step, and the last strike's shape
  ret:{on:false, x:0, y:0, z:0, ok:false, sy:0, sp:0, a:0, beat:0, kind:"shot"},
  wind:{p:0, over:0, side:"R", kind:null},
  gx:new Float64Array(16), gy:new Float64Array(16), hy:new Float64Array(16), hp:new Float64Array(16), gi:0, shape:null,
  // (UF2-A) the kick type (an index into KICKS, Normal to start); the meter (on while a shot
  // or a pass is held: kind, fill p, the sweet band lo..hi, whether the fill is in it); F's last press (the settle's
  // latch, in match seconds); the last strike's verdict on the meter (clean, at, kind) for the HUD's flash
  kick:2, meter:{on:false, kind:null, p:0, lo:0, hi:0, glo:-1, ghi:-1, sweet:false, gold:false}, fT:-99, clean:{seq:0, ok:false, kind:null, p:0, grade:null}};

/* ---------- input (router events, and the bots' through __fp.input) ---------- */
/* (U20) how far a wheel event moves the kick type: -1, 0 or 1. A notched mouse wheel sends one event a notch (about
   100 px, or 3 lines in line mode), and each notch is one step. A precision trackpad (or a free-spinning wheel) sends a
   stream of events a frame apart for one swipe, so those are added up and a swipe moves one step at most: a new swipe
   is a turn the other way or one after a pause of WHEEL.GAP ms. A scroll with no up or down in it (sideways) is no turn */
export const WHEEL = {NOTCH:50, FINE:30, STREAM:25, GAP:220, acc:0, t:-1e9, done:false, clean:false};
export function wheelStep(ev){
  const dy = (+ev.deltaY || 0)*(ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 600 : 1);
  if (!dy) return 0;
  const now = ev.t != null ? ev.t : typeof performance !== "undefined" ? performance.now() : 0, dir = dy > 0 ? 1 : -1;
  const gap = now - WHEEL.t;
  WHEEL.t = now;
  if (gap > WHEEL.GAP || dir !== Math.sign(WHEEL.acc)){ WHEEL.acc = 0; WHEEL.done = false; }
  WHEEL.acc += dy;
  // a notch on its own (not part of a stream): a step each
  // (a mouse turned fast sends its notches 10 ms apart: a clean notch, exactly 100 or 120 px or a whole number of them,
  // straight after another clean notch is a step too; a trackpad's stream never comes in such even bites)
  const clean = [100, 120].some(u => { const n = Math.abs(dy)/u; return n >= 1 && Math.abs(n - Math.round(n)) < .01; });
  const prevClean = WHEEL.clean; WHEEL.clean = clean;
  if (Math.abs(dy) >= WHEEL.NOTCH && (gap > WHEEL.STREAM || (clean && prevClean))){ WHEEL.done = true; return dir; }
  if (WHEEL.done || Math.abs(WHEEL.acc) < WHEEL.FINE) return 0;
  WHEEL.done = true;
  return dir;
}
// a key pressed with Ctrl, Alt or Meta held: set by controller.js's capture listener for the same browser event
export const MOD = {on:false};
// the event itself was pressed with Ctrl, Alt or Meta held (the guard's one test, D9). In full screen with the keyboard
// locked Ctrl is the shield key (core/keylock.js), so a press made while it is held is yours; Alt and Meta never are
export function modKey(ev){ if (ev.altKey || ev.metaKey || (ev.ctrlKey && !ctrlShields())) return true; return false; }
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
  // (U27: the key's name in lower case: with Shift held a letter comes as its capital, and F pressed while you sprint
  // must still take the ball, a held W must still be W)
  const k = ev.key === " " ? "space" : typeof ev.key === "string" && ev.key.length === 1 ? ev.key.toLowerCase() : ev.key === "Shift" ? "shift" : ev.key;
  switch (ev.type){
    case "keydown":
      if (ev.prevent) ev.prevent();
      if (ev.repeat) return true;
      CTRL.held[k] = true;
      if (k === "x") CTRL.walk = !CTRL.walk;
      else if (k === "v") CTRL.queue.push({k:"scan"});
      else if (k === "f") CTRL.queue.push({k:"f"});
      // (U26) Shift tapped twice within KNOCK_TAP s: the knock-on (actions.js knockOn)
      else if (k === "shift"){ const now = nowS(); if (now - CTRL.shiftAt < KNOCK_TAP){ CTRL.knockReq = true; CTRL.shiftAt = -1e9; } else CTRL.shiftAt = now; }
      else if (k === "space") CTRL.queue.push({k:"space"});
      // R: the call registers on the press itself (U10): "Here!" at once, every time; held on to 0.4 s it becomes "In
      // behind!" to the point under the crosshair. (It used to wait for the release, so a press whose key-up was
      // lost to a cut or a reset, or a second press within 4 s, did nothing at all)
      else if (k === "r"){ CTRL.rHeld = 0; CTRL.rDone = false; CTRL.queue.push({k:"rtap"}); }
      return true;
    case "keyup":
      if (ev.prevent) ev.prevent();
      if (k === "v") CTRL.queue.push({k:"unscan"});
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
      // (U28 part E: scrolling does nothing in football now; the wheel's button is the flick's, part G)
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
  CTRL.lmb = CTRL.rmb = false; CTRL.queue.length = 0; CTRL.charge = null; CTRL.scan = null; CTRL.rHeld = 0; CTRL.jockey = false; CTRL.shield = false; CTRL.note = null;
  CTRL.ring = null; CTRL.eHeld = 0; CTRL.acro = null; CTRL.lastShotT = null; CTRL.meter.on = false; CTRL.meter.kind = null; CTRL.fT = -99; WHEEL.acc = 0; WHEEL.t = -1e9;
  CTRL.gx.fill(0); CTRL.gy.fill(0); CTRL.ret.on = false; CTRL.wind.p = CTRL.wind.over = 0; CTRL.wind.kind = null;
  // (P4-B) the look's history per step and the aim points start again from where you look now (a reset is a cut)
  CTRL.gi = 0; CTRL.hy.fill(P.yaw); CTRL.hp.fill(P.pitch);
  CTRL.aim.x = CTRL.aim.y = CTRL.aim.z = 0; CTRL.aim.ok = false; CTRL.ground.x = CTRL.ground.z = 0; CTRL.ret.x = CTRL.ret.y = CTRL.ret.z = 0; CTRL.ret.ok = false;
}
const use = k => { CTRL.uses[k] = (CTRL.uses[k] || 0) + 1; };
// the window lost the keyboard (Alt+Tab, a click outside): the key-ups never come, so everything held is let go here.
// A charge in progress is dropped without a strike (nobody released it), the shoulder check turns back
export function controlRelease(){
  for (const k in CTRL.held) CTRL.held[k] = false;
  if (CTRL.lmb || CTRL.rmb){ CTRL.lmb = CTRL.rmb = false; CTRL.charge = null; }
  if (CTRL.scan) CTRL.queue.push({k:"unscan"});
  CTRL.rHeld = 0; CTRL.rDone = true; CTRL.jockey = false; CTRL.shield = false; MOD.on = false;
}
if (typeof addEventListener === "function") addEventListener("blur", () => controlRelease());

/* ---------- where you look ---------- */
// the eye (1.68 x scale over your feet, ahead of the neck) and the look direction. The eye's place over your feet is
// worked out here for the aim and for the camera alike (matchcam.js): AHEAD of the neck at a level look, AHEAD_DOWN
// more as you look down (the head tips forward), DROP lower (the neck bends), all times your height's scale. UF2-A
// (USER-ISSUES U12): a little less forward than it was (0.22 at a full look down), so the feet stay under the eye
export const EYE_AT = Object.freeze({AHEAD: .07, AHEAD_DOWN: .12, DROP: .05});
export const eyeAhead = (pitch, s = 1) => (EYE_AT.AHEAD + EYE_AT.AHEAD_DOWN*sstep(.75, 1.35, -pitch))*s;
export const eyeDrop = (pitch, s = 1) => EYE_AT.DROP*sstep(.3, 1.2, -pitch)*s;
const EYE = {x:0, y:0, z:0}, LD = {x:0, y:0, z:-1};
// (U21, U25) in third person the line you aim along starts at the camera (matchcam.js tpFrame writes where it is, in
// the pitch's own frame): its middle, the crosshair, is then exactly where a pass or a shot goes, whatever its tilt
export const TPR = {on:false, x:0, y:0, z:0, ox:0, oz:0};
function eyeOf(me, yaw = P.yaw, pitch = P.pitch){
  const s = me.scale || 1, ahead = eyeAhead(pitch, s), sy = Math.sin(yaw), cy = Math.cos(yaw);
  EYE.x = me.m.x - sy*ahead; EYE.y = 1.68*s + (me.y || 0) - eyeDrop(pitch, s); EYE.z = me.m.z - cy*ahead;
  if (TPR.on){ EYE.x = TPR.x - TPR.ox; EYE.y = TPR.y; EYE.z = TPR.z - TPR.oz; }
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
  RH.rhythm = clamp(err/((AIM.RHY_W0 + AIM.RHY_W1*techniqueOf(me.at)/99)*(typeof globalThis.motivationTiming === "function" ? globalThis.motivationTiming() : 1)), 0, 1);   // (Motivation widens the window a little, A1.8 WP-W2)
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
  // (U28 part E: the aim no longer sways: it is where you look, and an over-hit only leans it up. How true the strike
  // is comes from the skills in the solver, strike.js sigmaOf)
  R.a = 0; R.kind = kind;
  R.sy = 0;
  R.sp = AIM.LEAN*W.over;
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
// the meter (UF2-A): on while a shot or a pass is held, with the sweet band for the distance to what it is aimed at
// now; a throw-in held fills it too, as how far it will go (throwShare), with no band (a throw is not struck clean)
const MB = {lo:0, hi:0, c:0, glo:0, ghi:0}, SG = {grade:"good", e:0, over:false};
// how much of its reach a throw-in held this long (s) gets: a quarter for a flick, all of it at PASS_FULL less a quarter
const throwShare = held => Math.min(1, held/CN.PASS_FULL + .25);
function meterStep(ms, me){
  const M = CTRL.meter, ch = CTRL.charge, b = ms.ball.p;
  if (ch && ch.kind === "throw"){ M.on = true; M.kind = "throw"; M.p = throwShare(ch.t || 0); M.lo = M.hi = M.glo = M.ghi = -1; M.sweet = false; return M; }
  if (!ch || (ch.kind !== "shot" && ch.kind !== "pass")){ M.on = false; M.kind = ch ? ch.kind : null; M.p = ch ? ch.p : 0; M.sweet = false; return M; }
  M.on = true; M.kind = ch.kind; M.p = ch.p;
  if (ch.kind === "shot"){
    const tg = CTRL.aim.ok ? CTRL.aim : CTRL.ground;
    meterBand(Math.hypot(tg.x - b.x, tg.z - b.z), techniqueOf(me.at), assistK(), MB);
  } else {
    const tp = CTRL.target.point || CTRL.ground, w = passWeights(ms, me, Math.hypot(tp.x - b.x, tp.z - b.z), CTRL.target.through);
    passBand(w.ideal, w.vmax, me.at.passing, assistK(), MB);
    MB.glo = MB.ghi = -1;
  }
  M.lo = MB.lo; M.hi = MB.hi; M.glo = MB.glo; M.ghi = MB.ghi; M.gold = M.p >= MB.glo && M.p <= MB.ghi; M.sweet = M.p >= MB.lo && M.p <= MB.hi;
  return M;
}
// a pass's weights for a distance: the launch speed that arrives at 9 m/s (8 for a through ball) and the most you can
// give it (the same numbers the strike uses)
const PW = {ideal:0, vmax:0, roll:1.1, dm:1};
function passWeights(ms, me, d, through){
  const at = me.at, roll = ms.ball.rollDecel || 1.1, dm = 1 - .0045*clamp(at.aero || 0, 0, 99);
  PW.roll = roll; PW.dm = dm; PW.vmax = 22 + .06*(at.passing || 50);
  PW.ideal = rollSpeedFor(Math.max(1, d), through ? 8 : 9, roll, dm);
  return PW;
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
  // a loose ball near you is yours to play (DESIGN 3.1.7: "the loose ball within 2.5 m"); a ball an opponent has at his
  // feet is not loose, however near: that is defending, and LMB is the tackle. A loose ball that is not your side's,
  // with a man of theirs nearer it than you, is a 50/50 you are defending: LMB goes in on the ball (P2b-B item 1)
  if (b.state === "free" && ms.poss.ctl < 0){
    const d = Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z);
    // (a wind-up already going stays a strike)
    if (d < CN.ATTACK_LOOSE) return !CTRL.charge && ms.poss.team !== me.team && rivalNearer(ms, me, b, d) ? "defend" : "attack";
  }
  if (ms.poss.team === me.team) return "attack";
  if (ms.poss.team === 1 - me.team) return "defend";
  return "free";
}

// does a man of the other side get to the loose ball before you do? The race's own arrival times (zone.js arrivalOf:
// the ball inside his radius, along its path, with his acceleration and turn), not the straight distance: a man the
// ball is rolling away from is not first to it however near he stands. Level (both have it in reach now), the nearer.
// Only men within a few metres of it are asked (d: your distance to it)
function rivalNearer(ms, me, b, d){
  const mine = canPlay(ms, me) ? arrivalOf(ms, me, CN.RACE_T) : Infinity;
  for (const o of ms.agents){
    if (o.team === me.team || o.team < 0 || !o.onPitch || o.role !== "player") continue;
    const od = Math.hypot(o.m.x - b.p.x, o.m.z - b.p.z);
    if (od > d + 4 || !canPlay(ms, o)) continue;
    const t = arrivalOf(ms, o, mine < Infinity ? mine : CN.RACE_T);
    if (t < mine || t === mine && t < Infinity && od < d) return true;
  }
  return false;
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
    // ((UF2-A, U19) the assists widen it: the team-mate nearest where you look is found from further off the line)
    const ang = Math.abs(wrapA(yawOf(dx, dz) - yaw)), lim = (d < CN.CONE_NEAR_D ? CN.CONE_NEAR : CN.CONE)*(1 + METER.CONE_A*assistK());
    if (ang > lim + (o.id === CTRL.target.agent ? CN.HYST : 0)) continue;
    const s = ang + d*.002;
    if (o.id === CTRL.target.agent) cur = s - CN.HYST;
    if (s < bs){ bs = s; best = o.id; }
  }
  // (the current one only while he is still in the cone himself: with nobody in it, a pass went to the last man aimed at)
  if (CTRL.target.agent >= 0 && cur < Infinity && cur <= bs + 1e-9) best = CTRL.target.agent;
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
  if (!me || !me.onPitch || !CTRL.enabled){ CTRL.queue.length = 0; CTRL.ret.on = false; CTRL.wind.p = 0; CTRL.wind.kind = null; CTRL.shield = false; if (me) me.intent.shield = false; return; }
  const I = me.intent;
  eyeOf(me);
  aimPoint(ms, me, CTRL.aim); groundPoint(CTRL.ground);
  const ctx = CTRL.ctx = contextOf(ms, me);
  // (U28 part E) when each of W A S D was last held, for the shape of a shot let go (shotKeys)
  for (const k of "wasd") if (CTRL.held[k]) CTRL.keyT[k] = ms.t;
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
  // the meter (UF2-A, U18 and U19): what is filling, and its sweet spot for what you aim at now
  meterStep(ms, me);
  // the timing ring of a volley or an acrobatic strike (A1.5): it closes on the moment the ball will be met
  const R = CTRL.resolve;
  if (R && R.kind !== "ground" && R.kind !== "header" && R.kind !== "divingHeader"){
    CTRL.ring = RNG; RNG.kind = R.kind; RNG.tc = R.tc; RNG.w = (CN.RING.W0 + (CN.RING.W1 - CN.RING.W0)*(me.at.dribbling || 50)/99)*(typeof globalThis.motivationTiming === "function" ? globalThis.motivationTiming() : 1);   // (Motivation widens it a little, A1.8 WP-W2)
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
      // (U27) F takes the ball into close control (within actions.js TAKE.WIN s, once it is within reach and nobody
      // else's); defending, it is still the slide. In close control it does nothing more
      case "f": CTRL.fT = ms.t; if (ctx !== "defend" && ctx !== "restart" && !me.ctlOn){ me.takeT = ms.t; use("take"); } slide(ms, me, ctx); break;
      case "space": space(ms, me); break;
      case "ldown": if (ctx === "defend") tackle(ms, me); break;
      case "lup": if (ctx !== "defend") strike(ms, me, "shot", q.t, opts); break;
      case "rup": if (ctx !== "defend") strike(ms, me, isThrow(ms, me) ? "throw" : "pass", q.t, opts); break;
    }
  }

  // ---- the shield (P2b-B; TRAINING-SPEC 3): C held, or Ctrl in full screen with the keyboard locked, while the ball
  // is yours or about to be (loose and within reach of a stride or two, nobody on it). The intent is the engine's to
  // carry out for anyone (actions.js: the speed held down, the ball on the far foot, the body between it and the man)
  const shieldKey = !!CTRL.held.c || (KEYLOCK.ctrl && ctrlShields()), b0 = ms.ball;
  const soon = b0.state === "free" && ms.poss.ctl < 0 && Math.hypot(b0.p.x - me.m.x, b0.p.z - me.m.z) < CN.SHIELD_NEAR;
  const wasShield = CTRL.shield;
  I.shield = CTRL.shield = shieldKey && ctx !== "restart" && (ms.poss.ctl === me.id || soon);
  // (no sprint while shielding: the engine holds you to SH_SPEED of your jog, the legs go at that pace)
  const shieldGait = I.shield;
  if (CTRL.shield){
    // (a hint shortens after five uses: one use a shield, not one a step)
    if (!wasShield) use("shield");
    // (the first time you shield with C outside full screen: the one-time tip that Ctrl does it too in full screen)
    if (!CTRL.tipAsked){ CTRL.tipAsked = true; if (tipFSDue()) CTRL.tipFS = true; }
  }

  // ---- where you go
  const bodyYaw = CTRL.scan ? CTRL.scan.yaw0 : P.yaw;
  const f = (CTRL.held.w ? 1 : 0) - (CTRL.held.s ? 1 : 0), r = (CTRL.held.d ? 1 : 0) - (CTRL.held.a ? 1 : 0);
  const len = Math.hypot(f, r), sin = Math.sin(bodyYaw), cos = Math.cos(bodyYaw);
  I.dx = len ? (r*cos - f*sin)/len : 0; I.dz = len ? (-r*sin - f*cos)/len : 0;
  I.face = I.face || {x:0, z:0}; I.face.x = -sin; I.face.z = -cos;
  I.strafe = false; I.speedCap = Infinity;
  const dball = Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z);
  I.gait = CTRL.walk ? "walk" : CTRL.held.shift && !shieldGait ? "sprint" : "jog";
  // (U28 part B: the ladder walk, jog, run, sprint. Going on forward at a jog it becomes a run after RUN_AFTER s, sooner
  // the higher your Acceleration (0.6 s at 50, 0.3 at 90); Shift is the full sprint, X the walk)
  // (not with a ball on its way to you: met at a run, an 11 m/s pass went through your feet untouched)
  const coming = !!(me.plan && me.plan.kind === "receive" && ms.poss.ctl !== me.id);
  if (I.gait === "jog" && f > 0 && len && !coming){ CTRL.fwdT = (CTRL.fwdT || 0) + h; if (CTRL.fwdT >= runAfter(me)) I.gait = "run"; }
  else CTRL.fwdT = 0;
  if (ctx === "restart"){ I.gait = dball > 8 && !CTRL.walk ? "jog" : "walk"; }
  // (U27) close control (F took it, actions.js keepStep): a sprint with it is CTL_SPRINT of your sprint, from Dribbling
  // (0.85 at 50, 0.95 at 90). Shift tapped twice with the ball yours: knocked on to run onto (knockOn), and close control
  // ends; F takes it again
  if (me.ctlOn && I.gait === "sprint"){ const k = clamp(.85 + .1*((me.at.dribbling || 50) - 50)/40, .8, .97); I.speedCap = Math.min(I.speedCap, k*sprintSpeed(me.prm, me.fac)); }
  I.knock = (ms.poss.ctl === me.id || !!me.ctlOn) && ctx !== "restart" && CTRL.knockReq;
  CTRL.knockReq = false;
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
      // (UF2-A, U17) close control: below a sprint the touches keep it near your foot, as much as the assists say
      d.close = I.gait === "sprint" ? 0 : assistK();
      // the run bends a little towards the ball (at most 12 degrees off the keys' way, only while it is in front), so a
      // touch that went a little wide is followed rather than run past: the ball stays yours until you choose otherwise
      const b = ms.ball, bx = b.p.x + b.v.x*.25 - me.m.x, bz = b.p.z + b.v.z*.25 - me.m.z, bl = Math.hypot(bx, bz);
      // (U27: not in close control, where the touches keep it on your way: bent, a knock-on went 12 degrees off it)
      if (!me.ctlOn && bl > .2 && (bx*I.dx + bz*I.dz)/bl > Math.cos(40*DEG)){
        const cross = I.dx*bz - I.dz*bx, ang = clamp(Math.asin(clamp(cross/bl, -1, 1)), -CN.DRIB_BEND, CN.DRIB_BEND);
        const c = Math.cos(ang), s = Math.sin(ang), nx = I.dx*c - I.dz*s, nz = I.dx*s + I.dz*c;
        I.dx = nx; I.dz = nz;
      }
      // (setting off from standing, the first touch is weighed for the first strides: 2 m/s)
      d.speed = d.start ? 2 : I.gait === "walk" ? me.prm.walk : I.gait === "sprint" ? .8*me.prm.sprint : me.prm.jog;
      // (shielding, the touches are weighed for the shield's own pace, the engine's cap: a touch weighed for a sprint
      // would run away from a man held to a walk, P2b-B)
      if (I.shield) d.speed = Math.min(d.speed, (TUNE.SH_SPEED ? TUNE.SH_SPEED.value : .6)*me.prm.jog);
    } else if (me.drib) me.drib = null;
  }
  // a ball on its way to you: you take it (the first touch pushes it the way you mean to go), or a first-time strike
  // queued for its arrival. The way you mean (P6-A, TRAINING-SPEC 3 and 5: the touch in the receiver's own frame) is
  // the keys' (W A S D, relative to where you look), else where you look: standing still and looking down the line,
  // the touch goes down the line, not wherever your body happens to face. F held asks for the foot (touch.js
  // touchPart: the raised foot for a ball up to the waist that the thigh would take)
  if (ms.ball.state === "free" && ms.poss.ctl !== me.id){
    const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind:"receive", push:null, first:null, x:me.m.x, z:me.m.z});
    p.push = p.push || {x:0, z:0};
    if (len){ p.push.x = I.dx; p.push.z = I.dz; }
    else { p.push.x = -Math.sin(bodyYaw); p.push.z = -Math.cos(bodyYaw); }
    p.part = CTRL.held.f ? "foot" : null;
    // (UF2-A, U17) the settle: F held, or pressed a moment before the ball arrives, kills it onto your preferred foot
    // within reach, the way you look; with the assists, standing with no keys held does too
    const ak = assistK(), fOn = !!CTRL.held.f || ms.t - CTRL.fT < METER.SETTLE_LATCH;
    p.settle = fOn ? 1 : !len && me.m.speed < 1.5 ? ak : 0;
    if (p.first && ms.t - (p.firstT || 0) > 1.2) p.first = null;
  } else if (me.plan && me.plan.kind === "receive") me.plan = null;
  gestureStep();
}

// is this a throw-in you are taking, the ball in your hands
function isThrow(ms, me){ const R0 = ms.restart; return !!(R0 && !R0.taken && R0.taker === me.id && R0.kind === "throw"); }

// a call for the ball (U10): "Here!" on every press of R, or "In behind!" (held) to the point under the crosshair.
// Every press is a call the carrier hears (brain.js callFor: he weighs it at his very next look) and your arm goes up
// with it (CTRL.call.seq: the controller's hand raise). Defending, a held R stays the "Here!" it already was
CTRL.callHook = null;
/* (USER-ISSUES U26) where "In behind!" asks for the ball: ahead of your run, up the pitch. The way you run when it goes
   towards their goal (else straight up the pitch), never more than RUN_PT.ANG off straight at their goal line;
   RUN_PT.T s of your pace plus RUN_PT.ADD m ahead (RUN_PT.MIN to RUN_PT.MAX), kept RUN_PT.EDGE m inside the touchlines
   and their goal line. It was the point under the crosshair: a ball played sideways, or out of play */
export const RUN_PT = Object.freeze({ANG: 35*DEG, T: 1.6, ADD: 6, MIN: 8, MAX: 18, EDGE: 3, RUN_V: 1.5});
export function runPoint(ms, me, out){
  const dir = ms.dirs[me.team], vx = me.m.vx || 0, vz = me.m.vz || 0, v = Math.hypot(vx, vz);
  let ang = 0;
  if (v > RUN_PT.RUN_V && vx*dir > 0) ang = clamp(Math.atan2(vz, vx*dir), -RUN_PT.ANG, RUN_PT.ANG);
  const lead = clamp(v*RUN_PT.T + RUN_PT.ADD, RUN_PT.MIN, RUN_PT.MAX);
  out.x = me.m.x + dir*Math.cos(ang)*lead; out.z = me.m.z + Math.sin(ang)*lead;
  const hx = ms.spec.hx - RUN_PT.EDGE, hz = ms.spec.hz - RUN_PT.EDGE;
  out.x = clamp(out.x, -hx, hx); out.z = clamp(out.z, -hz, hz);
  return out;
}
function call(ms, me, how){
  raiseHand(me, ms.t);                      // (U10) the hand goes up on every press, taken as a call or not
  if (CTRL.ctx === "defend" && how === "behind") return;
  const pt = how === "behind" ? runPoint(ms, me, {x:0, z:0}) : null;
  callFor(ms, me, how, pt);
  CTRL.call.t = ms.t; CTRL.call.kind = how; CTRL.call.seq++; CTRL.call.n++;
  if (typeof CTRL.callHook === "function") CTRL.callHook(how);
  use("call");
}

// a press that could not become anything: the hint says why for a moment (hintsFor), rather than the press vanishing
function noteWhy(ms, k){ CTRL.last = k; CTRL.note = {k, t:ms.t}; }
// LMB defending: a standing tackle on the man on the ball within 1.6 m, or, with nobody on it, on the loose ball
// itself when it is within your standing reach (duel.js standReach) and a little; else the hint says it is too far
function tackle(ms, me){
  if (me.act){ noteWhy(ms, "busy"); return; }
  const c = ms.agents[ms.poss.ctl], b = ms.ball;
  if (c && c.team !== me.team){
    if (Math.hypot(c.m.x - me.m.x, c.m.z - me.m.z) > CN.TACKLE_D){ noteWhy(ms, "far"); return; }
    me.intent.action = {kind:"tackle", sub:"stand", target:c.id};
  } else if (!c && b.state === "free" && b.p.y < .5){
    if (Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) > standReach(me.at.tackling || 50) + CN.TACKLE_SLACK){ noteWhy(ms, "far"); return; }
    me.intent.action = {kind:"tackle", sub:"stand", target:"ball"};
  } else { noteWhy(ms, "far"); return; }
  CTRL.last = "tackle"; CTRL.note = null; use("tackle");
}
// F at a run: a slide at the man on the ball (defending), or at a loose ball you are racing someone for (a 50/50:
// nobody on it, an opponent nearer it than 3 m), within the slide's reach at your speed (duel.js slideReach). Too slow,
// too far or nothing to slide at while defending: the hint says so. Attacking, F is otherwise the finesse and the
// small touch (held), and a press of it means nothing on its own
function slide(ms, me, ctx){
  const c = ms.agents[ms.poss.ctl], b = ms.ball;
  const loose = !c && b.state === "free" && b.p.y < .4;
  // (a 50/50 is one a man of theirs gets to first: a ball coming to you first is yours to settle with F, UF2-A U17,
  // never a slide into it)
  const contest = loose && ms.agents.some(o => o.team !== me.team && o.team >= 0 && o.onPitch && o.role === "player" && Math.hypot(o.m.x - b.p.x, o.m.z - b.p.z) < 3) &&
    rivalNearer(ms, me, b, Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z));
  if (ctx !== "defend" && !(contest && !CTRL.charge)) return;
  // (down from a slide you are getting up; in any other move, a tackle, a strike or a header, you are finishing it)
  if (me.act){ noteWhy(ms, "busy"); if (me.act.kind === "slide") CTRL.note.slide = true; else CTRL.note.key = "F"; return; }
  if (me.m.speed <= CN.SLIDE_V){ noteWhy(ms, "slow"); return; }
  const reach = slideReach(me.m.speed, sprintSpeed(me.prm, me.fac)) + CN.SLIDE_SLACK, far = () => { noteWhy(ms, "far"); CTRL.note.slide = true; };
  if (c && c.team !== me.team){
    if (Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) > reach) return far();
    me.intent.action = {kind:"slide", target:c.id};
  } else if (loose){
    if (Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) > reach) return far();
    me.intent.action = {kind:"slide", target:"ball"};
  } else return far();
  use("slide"); CTRL.last = "slide"; CTRL.note = null;
}

const RES_SPACE = {kind:"ground", tc:0, side:"R", h:0, x:0, y:0, z:0, mirrored:false, face:0};
// Space: a header when the ball comes into head reach (LMB held: at goal; RMB held: to the cone's man; F held: cushioned
// down onto your feet, P6-A; none of them: clear it), else a jump; a low ball in front at a stretch, a diving header (A1.5)
function space(ms, me){
  if (me.act) return;
  const R = resolveAction(ms, me, null, RES_SPACE), b = ms.ball;
  const H = R && (R.kind === "header" || R.kind === "divingHeader") ? R : null;
  const intent = CTRL.lmb ? "attack" : CTRL.rmb ? "pass" : CTRL.held.f && !(H && H.kind === "divingHeader") ? "cushion" : "clear";
  let target = null;
  if (intent === "attack") target = {x:CTRL.aim.x, y:CTRL.aim.ok ? CTRL.aim.y : 1.2, z:CTRL.aim.z};
  else if (intent === "pass"){ const o = ms.agents[coneTarget(ms, me)]; if (o) target = passPoint(ms, me, o, {x:0, y:0, z:0}); }
  const tc = H ? clamp(H.tc, .12, .9) : .3;
  // (the jump sized to the ball: none for one at your head, a full leap for one above it)
  me.intent.action = {kind:"header", tc, intent, target, power:1, dive:!!(H && H.kind === "divingHeader"), ballY:H ? H.y : null};
  CTRL.headMeet = H && H.kind === "header" ? {x:H.x, z:H.z} : null;
  CTRL.last = H ? (H.kind === "divingHeader" ? "divingHeader" : "header") : "jump"; use(intent === "cushion" && H ? "cushion" : "header");
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
    const share = throwShare(held), vmax = 8 + .07*(at.passing || 50), d = Math.min(Math.hypot(CTRL.ground.x - b.p.x, CTRL.ground.z - b.p.z), 6 + vmax*vmax/9.81*.8*share);
    const g = CTRL.ground, dd = Math.hypot(g.x - b.p.x, g.z - b.p.z) || 1;
    const tgt = {x:b.p.x + (g.x - b.p.x)/dd*d, y:.11, z:b.p.z + (g.z - b.p.z)/dd*d};
    me.intent.action = {kind:"throw", target:tgt, recv:CTRL.target.agent};
    // (the meter holds a moment on how far it was thrown)
    CTRL.clean.seq++; CTRL.clean.ok = false; CTRL.clean.full = false; CTRL.clean.kind = "throw"; CTRL.clean.grade = null; CTRL.clean.p = share;
    CTRL.last = "throw"; use("throw"); return;
  }
  const Rz = CTRL.resolve, contact = CTRL.contact, fKey = !!CTRL.held.f;
  // (U28 part E) the keys held as the shot is let go: S a fake shot (with A or D a drag-back that way, with W a nudge on
  // and a drag back); A or D curl it that way, with W less curl and more power
  const K = shotKeys(ms);
  if (what === "shot" && K.s && !(Rz && Rz.kind !== "ground") && !mine && ms.poss.ctl === me.id){
    me.intent.action = {kind:"fake", drag:K.a && !K.d ? -1 : K.d && !K.a ? 1 : 0, nudge:K.w && K.a === K.d};
    CTRL.last = "fake"; use("fake"); return;
  }
  // (UF2-A, U18 to U20) the kick type you chose, and how much the assists help
  const KT = kickType().id, ak = assistK();
  // the body shape through the release (A1.7): the gesture of the last few steps, and the aim from before it began
  const G = gesture(), Ret = CTRL.ret;
  if (G.any) use("shape");
  CTRL.gest = {x:G.x, y:G.y, curl:G.curl, lift:G.lift, dip:G.dip};
  if (what === "shot" && held >= CN.TAP) use("release");
  if (what === "shot"){
    // the charge: p = 1 - (1 - t/0.85)^2 (1.5.3); past 0.92 the over-hit is the solver's sigma (power above 0.92)
    let p = 1 - Math.pow(1 - Math.min(1, held/CN.SHOT_FULL), 2);
    const over = clamp((held - CN.SHOT_FULL)/AIM.OVER, 0, 1);
    // the meter (UF2-A, U18): let go inside its sweet spot (the power for the distance you aim at) and it is clean: the
    // strike goes where you look, without the reticle's sway, and the plant is forgiven (actions.js kickCtx)
    eyeOf(me, G.any ? G.yaw0 : P.yaw, G.any ? G.pitch0 : P.pitch); aimPoint(ms, me, RP); eyeOf(me);
    const band = meterBand(Math.hypot(RP.x - b.p.x, RP.z - b.p.z), techniqueOf(at), ak, MB);
    const inSpot = held >= CN.TAP && p >= band.lo && p <= band.hi, clean = inSpot && ak > 0;
    // (the meter's grade: a held shot let go off the sweet spot is scuffed, in it a good shot a little off the aim, in its
    // gold middle a perfect one; a tap is a placed side-foot and is not graded)
    const grade = held >= CN.TAP ? shotGrade(p, band, SG).grade : null, gE = SG.e, gOver = SG.over;
    // where it goes: the reticle (your look plus its sway); with a gesture, the look from before the sweep
    let tgt;
    if (clean) tgt = {x:RP.x, y:RP.y, z:RP.z};
    else if (G.any){ eyeOf(me, G.yaw0 + Ret.sy, G.pitch0 + Ret.sp); aimPoint(ms, me, RP); eyeOf(me); tgt = {x:RP.x, y:RP.y, z:RP.z}; }
    else tgt = {x:Ret.x, y:Ret.y, z:Ret.z};
    const toGoal = clean || G.any ? RP.ok : Ret.ok;
    if (Rz && Rz.mirrored) tgt = mirrorAim(me, tgt, {x:0, y:0, z:0});
    // a lofted ball with contact High at a point on the grass: a cross or a chip, picking a zone in the box (3.1.7)
    let kind = "shot";
    if (!toGoal && (contact > 0 || G.lift)) kind = inBoxPoint(ms, me, tgt) ? "cross" : "lob";
    // the shape: a tap is a placed side-foot; a lift chips it, a flick down dips it (topspin), a sweep curls it; a
    // full wind-up is power; looked at low on goal with Normal contact it is driven low
    let shape = held < CN.TAP ? "placed" : p >= .97 ? "power" : "struck", ctc = contact, finesse = fKey, curl = null, bend = null, style = null, chip = false;
    if (shape === "placed"){ p = AIM.PLACED; finesse = true; curl = 0; style = "side"; }
    // the kick type (U20): Placed a side-foot at a controlled pace, Curl the finesse, Driven low contact, Chip a chip
    else if (KT === "placed"){ shape = "placed"; p = Math.min(p, AIM.PLACED_MAX); finesse = true; curl = 0; style = "side"; }
    if (KT === "curl" && !G.curl){ finesse = true; if (shape === "struck" || shape === "power") shape = "curl"; }
    if (KT === "driven" && kind === "shot" && shape !== "placed"){ ctc = -1; shape = shape === "power" ? "power driven" : "driven"; }
    if ((G.lift || KT === "chip") && kind === "shot"){ shape = "chip"; ctc = 1; chip = true; p *= AIM.CHIP; style = "chip"; }
    else if (G.dip){ shape = "dip"; ctc = -1; }
    else if (kind === "shot" && ctc === 0 && toGoal && tgt.y < AIM.LOW_Y && shape !== "placed" && KT !== "curl"){ shape = shape === "power" ? "power low" : "low"; ctc = -1; }
    if (kind !== "shot"){ ctc = 1; shape = "lofted"; }
    if (G.curl){ finesse = true; bend = G.curl; shape = shape === "placed" || shape === "struck" || shape === "power" ? "curl" : shape + " curl"; }
    // (U28 part E) A or D held as it is let go curls it that way, by your Technique (0.35 of a full curl at none, all of
    // it at 99, a little more past it); W with it: half the curl, SHOT_KEYS.POWER more power
    const kc = K.a !== K.d ? (K.d ? 1 : -1) : 0;
    if (kc && kind === "shot" && shape !== "placed" && !chip){
      const amt = (.35 + .65*clamp(techniqueOf(at)/99, 0, 1.1))*(K.w ? .5 : 1);
      finesse = true; bend = kc*amt; if (K.w) p = Math.min(1, p*SHOT_KEYS.POWER);
      shape = (shape === "placed" || shape === "struck" || shape === "power" ? "" : shape + " ") + (K.w ? "curl and power" : "curl");
      shape = shape.trim();
    }
    // held past full: you lean back and it rises (with the over-hit's sigma, strike.js)
    if (over > 0 && kind === "shot"){ const d = Math.hypot(tgt.x - b.p.x, tgt.z - b.p.z); tgt.y += over*(.6 + .05*d); shape += " over"; }
    // the grade moves the aim: a good shot a degree or two off it, a scuff well off it (skied over-hit, along the grass
    // under-hit); the way it goes off is the reticle's sway, or the step's parity when it is still
    let scuff = false;
    if (grade && grade !== "perfect" && kind === "shot"){
      const dx = tgt.x - b.p.x, dz = tgt.z - b.p.z, d = Math.max(1, Math.hypot(dx, dz)), sg = Math.sign(Ret.sy || 0) || ((ms.step || 0) & 1 ? 1 : -1);
      const deg = grade === "good" ? METER.GOOD_DEG + METER.GOOD_DEG1*gE : METER.SCUFF_DEG + METER.SCUFF_DEG1*gE;
      let off = d*Math.tan(deg*DEG);
      if (grade === "scuff"){
        off = Math.max(off, METER.SCUFF_MIN); scuff = true;
        if (gOver) tgt.y += 1.5 + .08*d;
        else { tgt.y = Math.min(tgt.y, .3); p *= METER.SCUFF_P; }
        shape += " scuffed";
      } else tgt.y = Math.max(.15, tgt.y + .35*off*(((ms.step || 0) >> 1) & 1 ? 1 : -1));
      tgt.x += sg*dz/d*off; tgt.z -= sg*dx/d*off;
    }
    const rq = {kind, target:tgt, recv:-1, power:clamp(p, .05, 1), contact:ctc, finesse, firstTime:ms.poss.ctl !== me.id, atGoal:toGoal, shape, over, kick:KT};
    // (with the assists the spot is a clean strike: the plant and the stride forgiven, actions.js; the harder setting keeps
    // the spot as the power for the distance and asks for the stride as well)
    if (clean){ rq.clean = true; rq.shape = shape = shape + " clean"; }
    if (grade && kind === "shot") rq.grade = grade;
    if (scuff) rq.scuff = true;
    CTRL.clean.seq++; CTRL.clean.ok = inSpot; CTRL.clean.full = clean; CTRL.clean.kind = "shot"; CTRL.clean.grade = kind === "shot" ? grade : null; CTRL.clean.p = held >= CN.TAP ? 1 - Math.pow(1 - Math.min(1, held/CN.SHOT_FULL), 2) : 0;
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
  // (the cone is wider with the assists, U19: the team-mate nearest where you look)
  const tgtId = CTRL.target.agent >= 0 ? CTRL.target.agent : coneTarget(ms, me);
  const o = ms.agents[tgtId];
  let tp = CTRL.target.point && o ? CTRL.target.point : null;
  if (!tp && o) tp = passPoint(ms, me, o, {x:0, y:0, z:0});
  if (!tp){ tp = {x:CTRL.ground.x, y:.11, z:CTRL.ground.z}; }
  // the reticle's sway turns the pass about the ball (A1.7): where it was pointing at the release. With the assists a
  // pass to a team-mate goes to him (U19: the aim assist), a share of the sway with them low
  const sy = o ? Ret.sy*(1 - ak) : Ret.sy;
  if (sy){ const b0 = b.p, dx = tp.x - b0.x, dz = tp.z - b0.z, c = Math.cos(sy), sn = Math.sin(sy); tp = {x:b0.x + dx*c + dz*sn, y:.11, z:b0.z - dx*sn + dz*c}; }
  const d = Math.hypot(tp.x - b.p.x, tp.z - b.p.z), roll = b.rollDecel || 1.1;
  const through = CTRL.target.through && o;
  // (the ball you strike carries your Clean strike: ball.js ballKick sets its drag to 1 - 0.0045 aero, so it rolls
  // further than a default ball, and the weight is worked out for that ball)
  const PWr = passWeights(ms, me, d, through), vmax = PWr.vmax, dm = PWr.dm;
  const ideal = PWr.ideal;
  // a tap is weighted for you: its error is in what it arrives at, 9 m/s give or take with your Passing, held within 8
  // to 10 (1.5.3), not a share of the launch, which over 40 m would arrive anywhere. A driven pass (U20) arrives zipped,
  // at DRIVEN m/s
  const zA = Math.sqrt(-2*Math.log(Math.max(1e-9, ms.r())))*Math.cos(2*Math.PI*ms.r());
  // (held within 7.5 to 9.5 for a through ball, as before the assists; a driven one within a metre a second of DRIVEN)
  const drv = KT === "driven", base = drv ? AIM.DRIVEN : through ? 8 : 9;
  const arrive = clamp(base + zA*.6*(1 - (at.passing || 50)/120)*(1 - .5*ak), through && !drv ? 7.5 : base - 1, through && !drv ? 9.5 : base + 1);
  let speed = rollSpeedFor(Math.max(1, d), arrive, roll, dm), charged = false, sweet = false;
  if (held >= CN.TAP){
    // the meter's sweet spot (U19: the same as a shot's meter shows, wider with the assists)
    const c = Math.min(1, held/CN.PASS_FULL), pb = passBand(ideal, vmax, at.passing, ak, MB);
    charged = true;
    if (c >= pb.lo && c <= pb.hi){ sweet = true; speed = KT === "driven" ? rollSpeedFor(Math.max(1, d), AIM.DRIVEN, roll, dm) : ideal; }
    else speed = CN.PASS_MIN + (vmax - CN.PASS_MIN)*c;
  }
  // along the grass unless the lane is blocked (pOK under 0.6) or it needs more than you can give; then lofted. The
  // same language as a shot (A1.7): a lift through the release (or a look above the horizon) lofts it, a sweep curls it
  let kind = through ? "through" : "pass", ctc = contact, shape = charged ? (sweet ? "weighted" : "struck") : "tapped";
  if (KT === "driven" && shape !== "struck") shape = "driven";
  else if (KT === "placed") shape = charged && !sweet ? "struck" : "placed";
  const lift = G.lift || (ctc === 0 && P.pitch > AIM.LOFT && d > 12);
  if (ctc > 0 || lift){ kind = inBoxPoint(ms, me, tp) ? "cross" : "lob"; ctc = 1; if (lift) shape = "lofted"; }
  // (a placed pass is never lofted for you, U20; the rest are when the lane is shut or it is too far to roll)
  else if (o && KT !== "placed"){
    const pm = passModel(ms, me, {x:tp.x, z:tp.z}, "pass", speed, o);
    if ((pm && pm.pOK < .6 && d > 12) || ideal > vmax){ kind = "lob"; ctc = 1; }
  }
  const finesse = fKey || !!G.curl || KT === "curl";
  if (KT === "curl" && !G.curl && shape !== "lofted") shape = shape + " curl";
  const rq = {kind, target:{x:tp.x, y:.11, z:tp.z}, recv:o ? o.id : -1, contact:ctc, finesse, charged, sweet, firstTime:ms.poss.ctl !== me.id, shape, kick:KT};
  // (a held pass let go in the meter's sweet spot is clean, as a shot is: the plant forgiven)
  if (sweet && ak > 0){ rq.clean = true; }
  CTRL.clean.seq++; CTRL.clean.ok = sweet; CTRL.clean.full = sweet && ak > 0; CTRL.clean.kind = "pass"; CTRL.clean.grade = null; CTRL.clean.p = charged ? Math.min(1, held/CN.PASS_FULL) : 0;
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
    // (a clean release in the meter's sweet spot, UF2-A U18: the stride is forgiven, the strike still lands on the plant)
    if (rh.on){ rq.rhythm = rq.clean ? 0 : Math.round(rh.rhythm*1000)/1000; if (rh.tc != null && cs.ok) rq.tcWant = rh.tc; }
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
// a press that came to nothing a moment ago (a tackle out of reach, a slide from a jog): why, on its key, first
const NOTES = {far:["LMB", "too far away to tackle"], slow:["F", "get up to speed to slide"], busy:["LMB", "not yet, you're still recovering"]};
const NOTES_SLIDE = {far:["F", "too far away to slide"], busy:["F", "not yet, you're still getting up"]};
export function hintsFor(ms, me){
  const out = [], ctx = CTRL.ctx, short = k => (CTRL.uses[k] || 0) >= 5;
  // (while a note stands on a key, that key shows only the note: never "too far away to tackle" and "tackle" at once)
  let noteKey = null;
  const add = (key, verb, k) => { if (key !== noteKey) out.push({key, verb:short(k) ? "" : verb}); };
  if (!me || !me.onPitch) return out;
  const N = CTRL.note;
  if (N && ms.t - N.t < CN.NOTE_T && ms.t >= N.t){
    const n = (N.slide ? NOTES_SLIDE[N.k] : null) || NOTES[N.k];
    if (n){ const key = N.key || n[0]; out.push({key, verb:n[1]}); noteKey = key; }
  } else if (N) CTRL.note = null;
  // a man close to you with the ball yours: the shield (C held, or Ctrl in a locked full screen)
  const pressed = ms.poss.ctl === me.id && ms.agents.some(o => o.team !== me.team && o.team >= 0 && o.onPitch && o.role === "player" && Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z) < 3);
  if (ctx === "restart"){
    const R0 = ms.restart;
    if (R0 && R0.kind === "throw") add("RMB", restartReady(ms) ? "hold and release to throw" : "walk to the ball", "throw");
    else if (restartReady(ms)){ add("LMB", "shoot or cross", "shoot"); add("RMB", "pass", "pass"); }
    else add("W", "walk to the ball", "walk");
  } else if (ctx === "attack"){
    if (ms.poss.ctl === me.id){
      // (A1.7: the wind-up, the release on your plant, the shape through it)
      // (U28 part E) the keys as you let go shape it
      if (CTRL.charge && CTRL.charge.kind === "shot"){ add("LMB", "let go on the gold for a perfect shot", "release"); add("A or D", "as you let go: curl it", "curl"); add("S", "as you let go: fake it (with A or D, drag it back)", "fake"); }
      else if (CTRL.charge && CTRL.charge.kind === "pass"){ add("RMB", "let go in the green for the weight", "pass"); add("Mouse", "sweep to curl, lift to loft", "shape"); }
      else if (CTRL.shield){ add("C", "hold to keep him off the ball", "shield"); add("RMB", "pass", "pass"); add("A D", "turn with it", "turn"); }
      else if (pressed){ add("C", "hold to shield", "shield"); add("RMB", "pass", "pass"); add("LMB", "hold to wind up, let go to shoot", "shoot"); }
      // (U27) in close control: Shift twice knocks it on; not in it, F takes it
      else if (me.ctlOn){ add("LMB", "hold to wind up, let go to shoot", "shoot"); add("RMB", "pass", "pass"); add("Shift Shift", "knock it on and run", "knock"); }
      else { add("LMB", "hold to wind up, let go to shoot", "shoot"); add("RMB", "pass", "pass"); add("F", "take control", "take"); }
    }
    else if (CTRL.resolve && CTRL.resolve.kind === "header"){ add("Space", "head it", "header"); add("F+Space", "cushion it down to your feet", "cushion"); }
    else if (CTRL.resolve && CTRL.resolve.kind !== "ground") add("LMB", "volley it", "shoot");
    else if (me.plan && me.plan.kind === "receive" && ms.ball.state === "free" && approaching(ms, me) && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) < 18){
      // (UF2-A, U17) a ball on its way to you: how to kill it dead
      add("F", "hold to stop it at your feet", "settle"); add("W A S D", "take it away", "touch"); add("RMB", "pass it first time", "pass");
    }
    // (U27) a loose ball by you: F takes it into close control
    else if (ms.ball.state === "free" && ms.poss.ctl < 0 && ms.ball.p.y < .5 && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) < 2.5){ add("F", "take control", "take"); add("Shift", "sprint", "sprint"); }
    else { add("R", "call for it", "call"); add("Shift", "sprint", "sprint"); add("V", "hold to look over your shoulder", "scan"); }
  } else if (ctx === "defend"){
    const c = ms.agents[ms.poss.ctl];
    const b = ms.ball;
    if (c && Math.hypot(c.m.x - me.m.x, c.m.z - me.m.z) < CN.TACKLE_D + .6) add("LMB", "tackle", "tackle");
    else if (!c && b.state === "free" && b.p.y < .5 && Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) < standReach(me.at.tackling || 50) + CN.TACKLE_SLACK + .6) add("LMB", "go in for the ball", "tackle");
    add("RMB", "jockey", "jockey");
    if (me.m.speed > CN.SLIDE_V) add("F", "slide", "slide");
  } else { add("R", "call for it", "call"); add("Space", "jump", "header"); add("V", "hold to look over your shoulder", "scan"); }
  return out.slice(0, 3);
}
