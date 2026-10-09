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
   browser default stopped while a match is on. The settings are this device's (localStorage freyaFootball.ctrl). */
import {P} from "../core/state.js";
import {dirOf, yawOf, wrapA} from "./pitchspec.js";
import {canStrike, predAt} from "./actions.js";
import {passModel, callFor} from "./brain.js";
import {restartReady} from "./rules.js";
import {idealPassSpeed} from "./strike.js";

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

/* ---------- numbers (1.5.3) ---------- */
export const CN = Object.freeze({
  SHOT_FULL: .85, OVERHIT: .92, TAP: .18, PASS_FULL: .8, PASS_MIN: 4,
  CONE: 25*DEG, CONE_NEAR: 35*DEG, CONE_NEAR_D: 15, HYST: 6*DEG, THROUGH_D: 8,
  TACKLE_D: 1.6, SLIDE_V: 4, JOCKEY_V: 3.2, CALL_HOLD: .4, CALL_COOL: 4,
  SCAN_MAX: 110*DEG, SCAN_BACK: .15, HEAD_REACH: 2.1, ATTACK_LOOSE: 2.5,
  SMALL: .55,                 // the small touch: the next dribble touch at this share of its length (A1.1)
  RING: Object.freeze({W0: .07, W1: .16})   // the timing ring of a volley (A1.5): the sweet window in seconds, at volleying 0 and 99
});
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
  aim:{x:0, y:0, z:0, ok:false}, ground:{x:0, z:0}, resolve:null, ready:false, eHeld:0, enabled:true};

/* ---------- input (router events, and the bots' through __fp.input) ---------- */
// a key pressed with Ctrl, Alt or Meta held: set by controller.js's capture listener for the same browser event
export const MOD = {on:false};
// ev = {type: 'keydown'|'keyup'|'down'|'up'|'move'|'wheel', key, button, dx, dy, deltaY, repeat, ctrlKey?, altKey?}
// returns true when the event was the match's
export function controlInput(ev){
  if (!ev) return false;
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return true;
  if ((ev.type === "keydown" || ev.type === "keyup") && MOD.on) return true;
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
      if (k === "r" && CTRL.held.r && !CTRL.rDone) CTRL.queue.push({k:"rtap"});
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
    case "move":
      look(ev.dx || 0, ev.dy || 0);
      return true;
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
  CTRL.ring = null; CTRL.eHeld = 0;
}
const use = k => { CTRL.uses[k] = (CTRL.uses[k] || 0) + 1; };

/* ---------- where you look ---------- */
// the eye (matchcam's own numbers: 1.68 x scale, ahead of the neck) and the look direction
const EYE = {x:0, y:0, z:0}, LD = {x:0, y:0, z:-1};
function eyeOf(me){
  const s = me.scale || 1, ahead = (.07 + .15*sstep(.75, 1.35, -P.pitch))*s, f = dirOf(P.yaw);
  EYE.x = me.m.x + f.x*ahead; EYE.y = 1.68*s + (me.y || 0); EYE.z = me.m.z + f.z*ahead;
  const c = Math.cos(P.pitch);
  LD.x = -Math.sin(P.yaw)*c; LD.y = Math.sin(P.pitch); LD.z = -Math.cos(P.yaw)*c;
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
    } else d = Math.max(0, Math.hypot(GP.x - o.m.x, GP.z - o.m.z) - 6);
    if (d < bd){ bd = d; best = o.id; }
  }
  return best;
}
// the lead point of a through ball (3.1.7): on the runner's way where his time there equals the ball's (5 fixed-point
// rounds), the ball arriving at 8 m/s
function leadPoint(ms, me, o, aimx, aimz, out){
  const b = ms.ball, roll = b.rollDecel || 1.1;
  const v = Math.hypot(o.m.vx, o.m.vz);
  let ux, uz, sp;
  if (v > 1.5){ ux = o.m.vx/v; uz = o.m.vz/v; sp = Math.max(v, o.prm.run); }
  else { const dx = aimx - o.m.x, dz = aimz - o.m.z, d = Math.hypot(dx, dz) || 1; ux = dx/d; uz = dz/d; sp = o.prm.run; }
  let tx = aimx, tz = aimz;
  for (let i = 0; i < 5; i++){
    const d = Math.hypot(tx - b.p.x, tz - b.p.z), v0 = idealPassSpeed(Math.max(1, d), 8, roll), tb = (v0 - 8)/roll + .25;
    tx = o.m.x + ux*sp*tb; tz = o.m.z + uz*sp*tb;
  }
  out.x = tx; out.y = .11; out.z = tz;
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
export const RESOLVE = Object.freeze({VOLLEY: [.35, 1.15], HEAD: [1.45, 2.4], DIVE: [.45, 1.0], SIDE: .45, LOOK: .9});
export function resolveAction(ms, me, traits = {}){
  const b = ms.ball;
  if (b.state !== "free") return null;
  const B = {x:0, y:0, z:0};
  let best = null;
  const f = dirOf(me.m.yaw);
  for (let i = 1; i <= Math.round(RESOLVE.LOOK*30); i++){
    const t = i/30;
    predAt(ms, t, B);
    const dx = B.x - me.m.x, dz = B.z - me.m.z, d = Math.hypot(dx, dz);
    const reachH = me.m.speed*t*.6 + .9;
    if (d > reachH + 1.2) continue;
    const ahead = dx*f.x + dz*f.z, lat = dx*-f.z + dz*f.x, hgt = B.y;
    best = {t, x:B.x, y:B.y, z:B.z, ahead, lat, d};
    if (d < reachH) break;
  }
  if (!best) return null;
  const gx = ms.dirs[me.team]*ms.spec.hx, toGoal = yawOf(gx - me.m.x, -me.m.z), face = Math.abs(wrapA(toGoal - me.m.yaw))/DEG;
  const hgt = best.y, side = best.lat >= 0 ? "R" : "L", sideways = Math.abs(best.lat) > RESOLVE.SIDE;
  const acro = !!(traits && (traits.acrobatic || traits.Acrobatic)), flair = !!(traits && (traits.flair || traits.Flair));
  let kind = "ground";
  if (hgt >= RESOLVE.HEAD[0] && hgt <= RESOLVE.HEAD[1] + (me.at.jumping || 50)*.008) kind = "header";
  else if (hgt >= RESOLVE.DIVE[0] && hgt <= RESOLVE.DIVE[1] && best.ahead > 1.4 && !sideways && me.m.speed > 2.5 && face < 70) kind = "divingHeader";
  else if (hgt >= RESOLVE.VOLLEY[0] && hgt <= RESOLVE.VOLLEY[1]){
    if (acro && face > 120 && hgt > .7) kind = "bicycle";
    else if (acro && face > 60 && sideways && hgt > .75) kind = "scissor";
    else kind = sideways ? "sidevolley" : "volley";
  } else if (hgt < RESOLVE.VOLLEY[0] && flair && ((me.foot === "R" && best.lat < -.2) || (me.foot === "L" && best.lat > .2))) kind = "rabona";
  // an overhead kick is struck facing away: the aim is mirrored (A1.5), what you see behind you is where it goes
  return {kind, tc:best.t, side, h:hgt, x:best.x, y:best.y, z:best.z, mirrored:kind === "bicycle", face};
}
// the overhead kick's aim, mirrored: the crosshair's bearing turned through half a turn about you, the same height
export function mirrorAim(me, aim, out){
  const dx = aim.x - me.m.x, dz = aim.z - me.m.z;
  out.x = me.m.x - dx; out.y = aim.y; out.z = me.m.z - dz;
  return out;
}

/* ---------- one step (before the AI, 3.2.1) ---------- */
const ACT = {x:0, y:0, z:0}, TGT = {x:0, y:0, z:0};
// opts = {traits, live: false while play is stopped for you (walk-out, a cut), restart: what the restart allows}
export function controlStep(ms, me, h, opts = {}){
  if (!me || !me.onPitch || !CTRL.enabled){ CTRL.queue.length = 0; return; }
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
  if (CTRL.lmb && canBall){ const t = CTRL.lmbT; CTRL.charge = {kind:"shot", t, p:1 - Math.pow(1 - Math.min(1, t/CN.SHOT_FULL), 2)}; }
  else if (CTRL.rmb && canBall){ const t = CTRL.rmbT; CTRL.charge = {kind:isThrow(ms, me) ? "throw" : "pass", t, p:Math.min(1, t/CN.PASS_FULL)}; }
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
  CTRL.ring = R && R.kind !== "ground" && R.kind !== "header" && R.kind !== "divingHeader" ? {kind:R.kind, tc:R.tc, w:CN.RING.W0 + (CN.RING.W1 - CN.RING.W0)*(me.at.dribbling || 50)/99} : null;

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
  // the ball at your feet: the dribble's way and length (a small touch with F held and nothing charging, A1.1)
  CTRL.small = !!CTRL.held.f && !CTRL.charge && ctx === "attack";
  if (ms.poss.ctl === me.id){
    if (len){
      const d = me.drib || (me.drib = {dx:0, dz:0, gait:"jog", speed:0, t:ms.t, commit:0, small:false});
      d.dx = I.dx; d.dz = I.dz; d.gait = I.gait; d.speed = 0; d.small = CTRL.small;
    } else if (me.drib) me.drib = null;
  }
  // a ball on its way to you: you take it (the first touch pushes it the way you are going), or a first-time strike
  // queued for its arrival
  if (ms.ball.state === "free" && ms.poss.ctl !== me.id){
    const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind:"receive", push:null, first:null, x:me.m.x, z:me.m.z});
    if (len){ p.push = p.push || {x:0, z:0}; p.push.x = I.dx; p.push.z = I.dz; } else p.push = null;
    if (p.first && ms.t - (p.firstT || 0) > 1.2) p.first = null;
  } else if (me.plan && me.plan.kind === "receive") me.plan = null;
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

// Space: a header when the ball comes into head reach (LMB held: at goal; RMB held: to the cone's man; neither: clear
// it), else a jump; a low ball in front at a stretch, a diving header (A1.5)
function space(ms, me){
  if (me.act) return;
  const R = resolveAction(ms, me, null), b = ms.ball;
  const H = R && (R.kind === "header" || R.kind === "divingHeader") ? R : null;
  const intent = CTRL.lmb ? "attack" : CTRL.rmb ? "pass" : "clear";
  let target = null;
  if (intent === "attack") target = {x:CTRL.aim.x, y:CTRL.aim.ok ? CTRL.aim.y : 1.2, z:CTRL.aim.z};
  else if (intent === "pass"){ const o = ms.agents[coneTarget(ms, me)]; if (o) target = passPoint(ms, me, o, {x:0, y:0, z:0}); }
  const tc = H ? clamp(H.tc, .12, .9) : .3;
  me.intent.action = {kind:"header", tc, intent, target, power:1, dive:!!(H && H.kind === "divingHeader")};
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
  const Rz = CTRL.resolve, contact = CTRL.contact, finesse = !!CTRL.held.f;
  if (what === "shot"){
    // the charge: p = 1 - (1 - t/0.85)^2 (1.5.3); past 0.92 the over-hit is the solver's sigma (power above 0.92)
    const p = 1 - Math.pow(1 - Math.min(1, held/CN.SHOT_FULL), 2);
    let tgt = {x:CTRL.aim.x, y:CTRL.aim.y, z:CTRL.aim.z};
    if (Rz && Rz.mirrored) tgt = mirrorAim(me, tgt, {x:0, y:0, z:0});
    const toGoal = CTRL.aim.ok;
    // a lofted ball with contact High at a point on the grass: a cross or a chip, picking a zone in the box (3.1.7)
    let kind = "shot";
    if (!toGoal && contact > 0) kind = inBoxPoint(ms, me, tgt) ? "cross" : "lob";
    else if (!toGoal) kind = "shot";
    const rq = {kind, target:tgt, recv:-1, power:clamp(p, .05, 1), contact, finesse, firstTime:ms.poss.ctl !== me.id, atGoal:toGoal};
    if (kind === "cross" || kind === "lob"){ rq.speed = undefined; rq.power = undefined; rq.recv = nearestMate(ms, me, tgt); }
    if (Rz && Rz.kind !== "ground"){ rq.style = Rz.kind; rq.timing = timingOf(Rz); }
    queueStrike(ms, me, rq);
    CTRL.last = kind; use(kind === "shot" ? "shoot" : "cross");
    return;
  }
  // a pass: a tap is weighted for you (arrival 9 m/s), held it is charged with a sweet zone (1.5.3)
  const tgtId = CTRL.target.agent >= 0 ? CTRL.target.agent : coneTarget(ms, me);
  const o = ms.agents[tgtId];
  let tp = CTRL.target.point && o ? CTRL.target.point : null;
  if (!tp && o) tp = passPoint(ms, me, o, {x:0, y:0, z:0});
  if (!tp){ tp = {x:CTRL.ground.x, y:.11, z:CTRL.ground.z}; }
  const d = Math.hypot(tp.x - b.p.x, tp.z - b.p.z), roll = b.rollDecel || 1.1;
  const vmax = 22 + .06*(at.passing || 50);
  const through = CTRL.target.through && o;
  const ideal = idealPassSpeed(Math.max(1, d), through ? 8 : 9, roll);
  let speed = ideal, charged = false, sweet = false;
  if (held >= CN.TAP){
    const c = Math.min(1, held/CN.PASS_FULL), cIdeal = clamp((ideal - CN.PASS_MIN)/(vmax - CN.PASS_MIN), 0, 1), w = .10 + .25*(at.passing || 50)/100;
    charged = true;
    if (Math.abs(c - cIdeal) <= w/2){ sweet = true; speed = ideal; }
    else speed = CN.PASS_MIN + (vmax - CN.PASS_MIN)*c;
  }
  // along the grass unless the lane is blocked (pOK under 0.6) or it needs more than you can give; then lofted
  let kind = through ? "through" : "pass", ctc = contact;
  if (contact > 0) kind = inBoxPoint(ms, me, tp) ? "cross" : "lob";
  else if (o){
    const pm = passModel(ms, me, {x:tp.x, z:tp.z}, "pass", speed, o);
    if ((pm && pm.pOK < .6 && d > 12) || ideal > vmax){ kind = "lob"; ctc = 1; }
  }
  const rq = {kind, target:{x:tp.x, y:.11, z:tp.z}, recv:o ? o.id : -1, contact:ctc, finesse, charged, sweet, firstTime:ms.poss.ctl !== me.id};
  if (kind === "pass" || kind === "through") rq.speed = clamp(speed, CN.PASS_MIN, vmax);
  queueStrike(ms, me, rq);
  CTRL.last = kind; use(kind === "through" ? "through" : "pass");
}
// the volley's timing from the ring (A1.5): 0 on the moment, 1 at the ring's edge or beyond; strike.js reads it as
// the plant error that widens the deviation
export const RING_T = .2;          // the moment the ring closes: this long before the ball is met (a volley's swing to contact)
function timingOf(R){ const w = CTRL.ring ? CTRL.ring.w : CN.RING.W1; return clamp(Math.max(0, Math.abs(R.tc - RING_T) - w/2)/w, 0, 1); }
// in front of you, in reach: now; on its way to you: a first-time strike when it arrives (touchCheck starts it)
function queueStrike(ms, me, rq){
  const b = ms.ball, cs = canStrike(me, b);
  const incoming = b.state === "free" && ms.poss.ctl !== me.id && !cs.ok && Math.hypot(b.v.x, b.v.z) > 2 && approaching(ms, me);
  if (incoming){
    const p = me.plan && me.plan.kind === "receive" ? me.plan : (me.plan = {kind:"receive", push:null, first:null});
    p.first = rq; p.firstT = ms.t;
    return;
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
    if (ms.poss.ctl === me.id){ add("LMB", "shoot", "shoot"); add("RMB", "pass", "pass"); add("3", "lift it", "contact"); }
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
