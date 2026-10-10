/* ============ LIFE: your first day, one step at a time ============
   Owner: WP-H (Stage 1); WP-H2 (Stage 2) adds the training centre's chapters. Contract: DESIGN 3.7.4 (the step
   runner), 3.7.5 (the home steps H1 to H21, every line), 3.7.6 (the training centre's steps G1 to G9, every line, the
   postponement and the early arrival after day one), 3.7.7 (the onboarding state, S.onb = {v:2, step, seen}), 3.6.3
   (G9 is the first-person lessons of football/training.js startFirstTraining), 1.4.1 (setClockScale; the 'aim' and
   'zone' events world.js sends through onbEmit), 1.7, 3.8.4, 3.8.6.

   The first day is taught by doing: no card to read and close, no tour you watch. Each step is a thing you do in the
   world (buy a bulb, put it on the belt, pay at the reader, screw it in, read your post), and the step is over when
   the world says it is: done() reads real state (the bulb in the light, the letters read, the bag ordered, the ball
   moved) or, for a step that is only looking at something, S.onb.seen. The current step is the first one not done,
   so a reload carries on exactly where you were and nothing is handed out twice; S.onb.step only remembers it for the
   HUD. A step done once stays done (seen[id]), so a room number that falls off the door again later does not take
   you back to a lesson you have had.

   What you are told comes three ways: your own thoughts and your uncle on a hands-free call, typed in under the
   objective and gone after their reading time (they never take a key, and wait while a panel is open); a short how-to
   with the keys in it, above your pockets; and the objective under the compass, with how far it is. Every number in a line comes from the constant it describes.

   At the training centre the assistant coach meets you at the gate and walks you round: the pitch, the lads, the
   gym, the delivery counter and the gym fridge, the dressing room, the manager. He is the same person who plays the
   balls in for the drills (ground.js GROUND.assist), lent to the first day while he shows you round and walking a
   real route between the buildings (through doorways, opening the gym door), and back at his post on the touchline
   for your first training: the lessons run on the match's own controls (training.js), and their end is the end of
   the first day.

   Day one also runs slower (setClockScale: ONB_RATE of the usual passive clock while a step before the lessons is
   current: at home, and at the training centre), counts as excused at the training centre (daily.js onboarding()),
   will not let you sleep the day away, and keeps the bus to training shut until the ride would get you there for the
   start. A tour of the centre not finished by POSTPONE_AT carries on the next day, still excused. */
import {THREE, W, LH, textTex, label} from "./build.js";
import {HOME, APT} from "./home.js";
import {GROUND, PITCH} from "./ground.js";
import * as DRILLS from "./drills.js";
import {STORE} from "./store.js";
import {pieceOf, BED_HOLD} from "./furniture.js";
import * as INV from "./inv.js";
import {LIFE, P, FLAGS} from "./core/state.js";
import {setClockScale, persist} from "./core/modes.js";
import {camKick} from "./core/camera.js";
import {AUD} from "./football/audio.js";

// the passive clock on day one, as a share of its usual rate: six to ten game minutes a real minute
export const ONB_RATE = .2;
const G = () => (typeof S !== "undefined" ? S : null);
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
const smooth = k => k <= 0 ? 0 : k >= 1 ? 1 : k*k*(3 - 2*k);
const wrapA = a => { a = (a + Math.PI) % (2*Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };
const kbd = k => `<kbd>${esc(k)}</kbd>`;
let H = null;

/* ---------- the state: S.onb = {v:2, step, seen:{}} ---------- */
export function OB(){
  const s = G(); if (!s) return null;
  if ((!s.onb || s.onb.v !== 2) && typeof window.onbMigrate === "function") window.onbMigrate();
  if (!s.onb || typeof s.onb !== "object") s.onb = {v:2, step:"done", seen:{}};
  if (!s.onb.seen || typeof s.onb.seen !== "object") s.onb.seen = {};
  reopenCentre(s);
  return s.onb;
}
/* a career whose flat chapter an earlier build finished and stopped at (step "done" with the flat's flag, before the
   training centre's chapters existed): those chapters pick it up, behind every home step (DESIGN 3.7.7, ui/main.js) */
function reopenCentre(s){
  const o = s.onb, f = s.flags;
  if (o.step !== "done" || o.centre || !f || !f.FirstTimeIntroductionCompleted || !f.ApartmentTutorialCompleted || f.TrainingCenterTutorialCompleted || f.GameplayTutorialCompleted) return;
  o.centre = true;
  for (const st of STEPS) if (st.zone === "home" && !o.seen[st.id]) o.seen[st.id] = "skipped";
  o.step = "G1";
  if (s.life && s.life.att && typeof s.life.att === "object" && !s.life.att.settled) s.life.att.excused = true;
}
const seen = k => { const o = OB(); return !!(o && o.seen[k]); };
function mark(k, v = true){ const o = OB(); if (!o || o.seen[k]) return false; o.seen[k] = v; persist(); RUN.dirty = true; return true; }
// the home steps are running: the introduction is over and the first day is not
export function active(){
  const s = G(), o = s && s.onb;
  // (and for the moment the first training ends: its last word is still the first day's, RUN.closing)
  return !!(o && o.v === 2 && (o.step !== "done" || RUN.closing) && o.step !== "intro" && s.flags && s.flags.FirstTimeIntroductionCompleted);
}

/* ---------- on screen ---------- */
function el(id, cls){
  let e = document.getElementById(id);
  if (!e){ e = document.createElement("div"); e.id = id; e.className = cls; (document.getElementById("lifeRoot") || document.body).appendChild(e); }
  return e;
}
// the objective under the compass, with how far it is (at: {x, z, y?, zone, outdoor})
export const GOAL = {text:"", at:null, marker:null, shown:""};
export function goal(text, at = null){
  GOAL.at = at || null;
  const g = el("onbGoal", "onb-goal");
  if (!text){ GOAL.text = ""; GOAL.shown = ""; g.classList.remove("on"); return; }
  if (text !== GOAL.shown){ GOAL.shown = text; g.innerHTML = `<i>◆</i><span>${esc(text)}</span><b></b>`; }
  GOAL.text = text;
  g.classList.add("on");
}
// for the compass: where the objective is, and in which area
window.lifeGoal = () => GOAL.text && GOAL.at ? GOAL.at : null;
// a how-to with the keys in it, at the bottom of the screen; it stays until another replaces it or ms runs out
const HINT = {html:"", t:0, base:"", top:0, mode:"", lift:"", pEl:null, nEl:null, pKey:""};
// what a step's tick shows: it waits while a timed how-to from the step before is still up
function tip(html){ if (HINT.t > 0 && html !== HINT.html) return; hint(html); }
export function hint(html, ms = 0){
  const h = el("onbHint", "onb-hint");
  if (!html){ HINT.html = ""; h.classList.remove("on"); return; }
  if (html !== HINT.html){ HINT.html = html; h.innerHTML = html; HINT.base = ""; }
  HINT.t = ms ? ms/1000 : 0;
  h.classList.add("on");
}
// the how-to sits above the pockets, and above a narrative note there when one is up. When the use prompt grows down
// to it (a fridge item's numbers, the bed's plan), it steps aside to the left edge, level with the prompt, so both
// read; a screen too narrow for that (a phone, a tablet held upright) puts it just under the prompt instead. Its own
// place is measured once per how-to, screen size and note, and the prompt only when it changes (shown, hidden or its
// text), so a frame that also writes to the page (a line typing in, the distance) is not made to lay the page out
// again just to find nothing has moved
const SIDE_ROOM = 240;     // the narrowest the stepped-aside how-to may be: onb.css .side is min(360px, 50vw - 252px)
const COMPACT_H = 520, COMPACT_W = 620;   // a phone on its side: onb.css @media (max-height:520px) and (min-width:621px)
function hintMode(h, mode){
  h.classList.toggle("side", mode === "side"); h.classList.toggle("under", mode === "under");
  h.style.bottom = mode ? "" : HINT.lift;
  h.style.top = "";
}
function hintPlace(){
  const h = document.getElementById("onbHint");
  if (!h || !HINT.html || !h.classList.contains("on")) return;
  if (!HINT.pEl || !HINT.pEl.isConnected) HINT.pEl = document.querySelector("#lifeRoot .lf-prompt");
  if (!HINT.nEl || !HINT.nEl.isConnected) HINT.nEl = document.getElementById("lifeNote");
  const p = HINT.pEl, n = HINT.nEl, nOn = !!(n && n.classList.contains("on"));
  const base = `${HINT.html}|${innerWidth}x${innerHeight}|${nOn ? n.textContent : ""}`;
  // a phone on its side: the how-to has the right side under the need bars to itself (onb.css), clear of the prompt
  // and the note in the middle, so it stays there
  if (innerHeight <= COMPACT_H && innerWidth > COMPACT_W){
    if (HINT.base !== base || HINT.mode){ HINT.base = base; HINT.mode = ""; HINT.lift = ""; HINT.pKey = ""; hintMode(h, ""); }
    return;
  }
  const pOn = !!(p && p.classList.contains("on")), pKey = pOn ? p.textContent : "";
  if (base === HINT.base && pKey === HINT.pKey) return;
  // offsetTop and offsetHeight are the laid-out place, before the fade-in slide, so a card still arriving reads right.
  // With the transition held off while it is measured, stepping back to its own place and out again in one frame
  // never shows as a slide
  const was = h.style.transition; h.style.transition = "none";
  if (base !== HINT.base){
    HINT.base = base; HINT.lift = ""; HINT.mode = ""; hintMode(h, "");
    if (nOn && n.offsetTop > h.offsetTop && h.offsetTop + h.offsetHeight + 8 > n.offsetTop){
      HINT.lift = Math.round(h.offsetParent.clientHeight - n.offsetTop + 8) + "px"; h.style.bottom = HINT.lift;
    }
    HINT.top = h.offsetTop - 10;
  }
  HINT.pKey = pKey;
  let mode = "";
  if (pOn && p.offsetHeight > 0 && p.offsetTop + p.offsetHeight > HINT.top) mode = innerWidth/2 - 252 >= SIDE_ROOM ? "side" : "under";
  if (mode !== HINT.mode || mode === "under"){ HINT.mode = mode; hintMode(h, mode); }
  if (mode === "under") h.style.top = hintUnder(h, p) + "px";
  void h.offsetTop; h.style.transition = was;
}
// where the how-to goes on a narrow screen while the use prompt reaches down to it: under the prompt if it fits above
// the pockets, else over the crosshair if it fits under the objective and the line being said, else wherever it
// covers the least
function hintUnder(h, p){
  const hh = h.offsetHeight, H = h.offsetParent ? h.offsetParent.clientHeight : innerHeight;
  const inv = document.getElementById("lifeInv"), floor = (inv && inv.offsetHeight ? inv.offsetTop : H - 90) - 26;
  let ceil = 0;
  for (const id of ["onbGoal", "onbSay"]){ const e = document.getElementById(id); if (e && e.classList.contains("on")) ceil = Math.max(ceil, e.offsetTop + e.offsetHeight + 8); }
  const below = Math.round(p.offsetTop + p.offsetHeight + 10), above = Math.round(H/2 - 26 - hh);
  if (below + hh <= floor) return below;
  if (above >= ceil) return above;
  return below + hh - floor <= ceil - above ? below : above;
}
// a line being said sits under the objective: when the objective wraps onto more lines than its place allows (a long
// one on a narrow screen), the line moves down with it. Measured only when the objective or the screen changes
const SAYPOS = {key:""};
function sayPlace(){
  const b = document.getElementById("onbSay"); if (!b) return;
  const g = document.getElementById("onbGoal"), gOn = !!(g && g.classList.contains("on"));
  const key = `${gOn ? GOAL.shown : ""}|${innerWidth}x${innerHeight}`;
  if (key === SAYPOS.key) return;
  SAYPOS.key = key; b.style.top = "";
  if (!gOn) return;
  const under = g.offsetTop + g.offsetHeight + 8;
  if (under > b.offsetTop) b.style.top = under + "px";
}
// a ring that pulses round a part of the HUD (an inventory cell, the compass)
export function focus(sel){ RUN.focus = sel || null; }
// (the ringed parts are looked up again only when the ring moves, or one of them has been redrawn by its HUD)
function focusStep(){
  const want = RUN.focus && !(document.body.classList.contains("cine")) ? RUN.focus : null;
  if (want !== RUN.focused){
    for (const e of document.querySelectorAll(".onb-focus")) e.classList.remove("onb-focus");
    RUN.focused = want; RUN.focusEls = null;
  }
  if (!want) return;
  const els = RUN.focusEls;
  if (els && els.length && els.every(e => e.isConnected && e.classList.contains("onb-focus"))) return;
  RUN.focusEls = Array.from(document.querySelectorAll(want));
  for (const e of RUN.focusEls) e.classList.add("onb-focus");
}
// a diamond turning over an outdoor objective more than 25 m away
function markerSet(at){
  const want = !!(at && at.outdoor && (at.zone || "home") === LIFE.zone && Math.hypot(at.x - P.x, at.z - P.z) > 25 && H && H.scene());
  if (!want){ markerOff(); return; }
  const m = GOAL.marker;
  if (m && m.parent && m.userData.x === at.x && m.userData.z === at.z) return;
  markerOff();
  const g = new THREE.Group(), y = (at.y || 0) + 3.1, mt = new THREE.MeshBasicMaterial({color:0xc8f060, transparent:true, opacity:.92, depthWrite:false});
  const d = new THREE.Mesh(new THREE.OctahedronGeometry(.28, 0), mt); d.scale.set(.75, 1.25, .75); g.add(d);
  g.position.set(at.x, y, at.z); g.renderOrder = 5; g.userData = {x:at.x, z:at.z, d, t:0};
  H.scene().add(g); GOAL.marker = g;
}
function markerOff(){ const m = GOAL.marker; if (m){ if (m.parent) m.parent.remove(m); m.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } GOAL.marker = null; }
function markerStep(dt){ const m = GOAL.marker; if (!m || !m.parent) return; const u = m.userData; u.t += dt; u.d.rotation.y += dt*1.6; u.d.position.y = Math.sin(u.t*2.2)*.12; }

/* ---------- lines said while you play ----------
   "You" are your own thoughts; your uncle is on a hands-free call. Typed in two characters every 26 ms of the play
   clock, held for their reading time, then gone; the next waits its turn. They never take a key. The play clock
   stands still with the world's (a panel, the mailbox, a hands-on job, the hub), so nothing is said to a closed eye */
const PLAY = {t:0};
const SAY = {q:[], cur:null, gap:0};
const UNCLE = "Uncle Nelu";
const PHONE_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 1.2 6.4 4.3 5 5.7a8.6 8.6 0 0 0 5.3 5.3l1.4-1.4 3.1 1.8-.7 2.6c-.2.6-.7.9-1.3.8C6.6 14.1 1.9 9.4 1.2 3.2c-.1-.6.2-1.1.8-1.3z"/></svg>`;
// (SAID: every line in the order it was given, for the tests of DESIGN 4.9 "every line appears verbatim")
const SAID = [];
export function speak(who, text){ SAY.q.push({who, text}); SAID.push({who, text}); if (SAID.length > 200) SAID.shift(); }
const holdOf = text => Math.max(1.6, text.split(/\s+/).length*.22 + 1);
function sayStep(dt, held){
  const box = el("onbSay", "onb-say");
  // a panel, the mailbox or a job over the world: the line waits behind it, and the next does not start
  box.classList.toggle("held", !!held);
  if (held && !SAY.cur) return;
  if (SAY.cur){
    const c = SAY.cur, k = PLAY.t - c.t0, n = Math.min(c.text.length, Math.floor(k/.026)*2 + 2);
    if (n !== c.n){ c.n = n; c.p.textContent = c.text.slice(0, n); }
    if (n >= c.text.length && k >= c.text.length/2*.026 + c.hold){ box.classList.remove("on"); SAY.cur = null; SAY.gap = .35; }
    return;
  }
  if ((SAY.gap -= dt) > 0 || !SAY.q.length) return;
  const l = SAY.q.shift(), you = l.who === "You", call = l.who === UNCLE;
  box.className = "onb-say" + (you ? " you" : "") + (call ? " call" : "");
  box.innerHTML = `<b>${call ? PHONE_SVG : ""}${esc(you ? "You" : l.who)}</b><p></p>`;
  void box.offsetWidth; box.classList.add("on");
  SAY.cur = {text:l.text, t0:PLAY.t, hold:holdOf(l.text), n:-1, p:box.querySelector("p")};
}
export const saying = () => !!(SAY.cur || SAY.q.length);
function sayClear(){ SAY.q.length = 0; SAY.cur = null; const b = document.getElementById("onbSay"); if (b) b.classList.remove("on"); }
// the world's clock is stopped: a panel, the mailbox, a timed job, a hands-on job, the hub, the old card layer
function paused(){
  return !!(FLAGS.modal || FLAGS.busy || (window.lifeHubOut && window.lifeHubOut()) || (window.lifePanelOpen && window.lifePanelOpen()) || document.body.classList.contains("mini"));
}

/* ---------- where things are ---------- */
const home = () => G().home;
const fx = () => (home() && home().fx) || {};
const flatDoor = () => { const h = home(), A = APT[h.door]; return {x:A.door, y:h.floor*LH, z:A.wz - A.s*.6, zone:"home"}; };
function nearDoor(r){ const d = flatDoor(); return LIFE.zone === "home" && Math.abs(P.feet - d.y) < .7 && Math.hypot(P.x - d.x, P.z - d.z) < r; }
export function inFlat(){
  if (LIFE.zone !== "home" || !home()) return false;
  const h = home(), A = APT[h.door], base = h.floor*LH, z0 = Math.min(A.wz, A.ext), z1 = Math.max(A.wz, A.ext);
  return P.x > A.x0 + .1 && P.x < A.x1 - .1 && P.z > z0 + .2 && P.z < z1 - .1 && Math.abs(P.feet - base) < .6;
}
const inStore = () => { const b = STORE.b; return LIFE.zone === "home" && P.x > b.x0 && P.x < b.x1 && P.z > b.z0 && P.z < b.z1 - .05 && P.feet < 1; };
const onYou = id => INV.onYou(id);
const carried = () => { const c = INV.carry(); return [c.hand, ...c.slots]; };
const paidBulbOnYou = () => carried().some(it => it && it.id === "bulb" && !it.unpaid);
// the football lying at home (a drop of the item "ball")
const ballDrop = () => INV.dropsOf("home").find(d => d.item && d.item.id === "ball") || null;
// the shops and the workplace on your street (home.js and units.js fill W.places as the zone is built)
function place(kind, name){ return W.places.find(p => p.kind === kind && (!name || p.name === name || p.job === name)) || null; }
const busStop = () => place("bus") || {x:3, z:15.2};
const SHELF = {x:-16.55, z:-1.3}, READER = {x:-20.05, z:.1}, TABLE = {x:-12.3, y:.6, z:2.45, x0:-13.05, x1:-11.55, z0:2.2, z1:2.7};
// is the view turned to within a angle of a point (and no further than d)?
function facing(x, y, z, ang, d = 30){
  const dx = x - P.x, dz = z - P.z, dist = Math.hypot(dx, dz); if (dist > d) return false;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(y - P.eye, Math.max(.1, dist));
  return Math.abs(wrapA(yaw - P.yaw)) < ang && Math.abs(pitch - P.pitch) < ang*1.6;
}
const bulbPrice = () => (typeof HARDWARE === "object" && HARDWARE.bulb ? HARDWARE.bulb.price : 3);
const euro = n => typeof eur === "function" ? eur(n) : "€" + n;
const time = m => typeof fmtTime === "function" ? fmtTime(m) : String(m);
const SESS = () => (typeof SESSION === "object" && SESSION ? SESSION : {start:600, end:960});
const busToTraining = from => typeof busMins === "function" ? busMins(from, "ground") : 40;
// when the bus from here gets you to training for the start (9:20 from your street)
export const busGateAt = (from = "home") => SESS().start - busToTraining(from);
// is there team training today? (a weekend or a match day has none, so no gate and nothing about being on time)
const trainingToday = () => typeof trainingDay === "function" ? !!trainingDay() : true;
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/* ---------- the steps (DESIGN 3.7.5) ----------
   {id, zone, objective(), at(), start(), tick(dt), done(), end(), skip()}: start() when it becomes the step you are on,
   tick() every frame while it is (and you are in its zone), end() once, when it is done while it is the current one */
const STEPS = [
  {id:"H1", zone:"home",
    objective:() => `Go up to flat ${home().apt}, floor ${home().floor}`, at:() => flatDoor(),
    done:() => inFlat() || nearDoor(3.4)},

  // (looked at from anywhere in the room: the view turned on it, not only within arm's reach)
  {id:"H2", zone:"home", objective:() => "Have a look around your flat",
    start(){ RUN.h2 = 0; },
    tick(dt){
      if (!inFlat()) return;
      RUN.h2 += dt;
      const l = RUN.aim.label || "", h = home(), A = APT[h.door], base = h.floor*LH, bed = pieceOf("bed"), fr = pieceOf("fridge");
      const at = (q, y) => q && facing(q.wx, base + y, q.wz, .22, 7);
      const win = [.3, .7].some(k => facing(A.x0 + (A.x1 - A.x0)*k, base + 1.6, A.ext, .2, 7)) || l === "Curtain" || l === "Football";
      if ((at(bed, .25) || l === "Mattress" || l === "Bed") && mark("lookBed") && bed && bed.f.tier === 1) speak("You", "A mattress on the floor. Home sweet home.");
      else if ((at(fr, .8) || l === "Fridge" || l === "Freezer") && mark("lookFridge")) speak("You", "That fridge has seen better days.");
      else if (win && mark("lookWindow")) speak("You", "And a ball through my window. Great start.");
      if (RUN.h2 > 40) mark("H2");
    },
    done:() => ["lookBed", "lookFridge", "lookWindow"].filter(seen).length >= 2},

  {id:"H3", zone:"home", objective:() => "Turn on the light",
    done:() => seen("switchNoBulb") || !!fx().bulb,
    end(){
      if (fx().bulb) return;
      speak("You", "Looks like the light doesn't even have a bulb.");
      speak(UNCLE, `The furniture shop next to your block sells them. They're ${euro(bulbPrice())}. Go grab one.`);
    }},

  {id:"H4", zone:"home", objective:() => "Buy a light bulb at Mobila Bună",
    at:() => ({x:-17.95, z:STORE.b.z1 + .6, zone:"home", outdoor:true}),
    done:() => inStore() || onYou("bulb") || !!fx().bulb},

  {id:"H5", zone:"home", objective:() => "Find the bulbs and take one", at:() => ({x:SHELF.x, z:SHELF.z, zone:"home"}),
    done:() => seen("tookBulb") || onYou("bulb") || !!fx().bulb,
    end(){
      if (fx().bulb) return;
      hint(`<span>Things you pick up go in your hand.</span>`, 6000); focus(`#lifeInv .iv-cell[data-k="hand"]`); RUN.unfocusT = 6;
      speak(UNCLE, "Take it to the till. Put it on the belt, then pay at the card reader.");
    }},

  {id:"H6", zone:"home", objective:() => "Pay for the bulb", at:() => ({x:READER.x, z:READER.z, zone:"home"}),
    tick(){
      if (!inStore()) return tip(null);
      if (seen("paid") || paidBulbOnYou()) tip(null);
      else if (seen("belt")) tip(`<span>Wait for the beep, then press ${kbd("E")} on the card reader.</span>`);
      else if (INV.hand() && INV.hand().id === "bulb") tip(`<span class="oh-mouse click"></span><span>Click the belt to put it down.</span>`);
    },
    done:() => paidBulbOnYou() || !!fx().bulb,
    end(){ hint(null); }},

  {id:"H7", zone:"home", objective:() => "Take the bulb home", at:() => flatDoor(),
    tick(){ if (!seen("slam") && onYou("bulb") && nearDoor(3.4)) slam(); },
    done:() => seen("slam") && (seen("plateFell") || home().plate !== "door") || (!!fx().bulb && seen("slam"))},

  {id:"H8", zone:"home", objective:() => "Pick up the room number",
    at:() => { const h = home(); return h.plateAt ? {x:h.plateAt.x, z:h.plateAt.z, zone:"home"} : null; },
    tick(){
      const c = INV.carry(), hd = c.hand && c.hand.id, s0 = c.slots[0] && c.slots[0].id, s1 = c.slots[1] && c.slots[1].id;
      const bulbIn = s0 === "bulb" ? 0 : s1 === "bulb" ? 1 : -1;
      if (hd === "bulb" && s0 !== "plate" && s1 !== "plate"){
        tip(`<span>Your hands only carry one thing at a time. The two slots at the bottom are your pockets. Press ${kbd("1")}.</span>`);
        focus(`#lifeInv .iv-cell[data-k="0"]`);
      } else if (bulbIn >= 0 && !hd && s0 !== "plate" && s1 !== "plate"){
        tip(`<span class="oh-mouse click"></span><span>Now pick up the room number.</span>`); focus(null);
      } else if (bulbIn >= 0 && hd === "plate"){
        const free = bulbIn === 0 ? 2 : 1;
        tip(`<span>Press ${kbd(String(free))} to pocket it too. You can put it back on your door on the way out.</span>`);
        focus(`#lifeInv .iv-cell[data-k="${free - 1}"]`);
      } else if (bulbIn >= 0 && !hd && (s0 === "plate" || s1 === "plate")){
        tip(`<span>Press ${kbd(String(bulbIn + 1))} to take the bulb back out.</span>`);
        focus(`#lifeInv .iv-cell[data-k="${bulbIn}"]`);
      }
    },
    // the bulb back in your hand with the number in a pocket; or the bulb already up in the light (the moment for
    // the pockets has gone by: the next step has you put the number back from wherever it is)
    done:() => { const c = INV.carry(); return (c.hand && c.hand.id === "bulb" && c.slots.some(it => it && it.id === "plate")) || !!fx().bulb; },
    end(){ hint(null); focus(null); }},

  {id:"H9", zone:"home", objective:() => "Put the bulb in the light",
    start(){ speak(UNCLE, "Put the bulb into the empty socket, then follow the prompt to screw it in."); },
    done:() => !!fx().bulb,
    end(){
      speak("You", "The light works. Not exactly luxury, but at least you can see.");
      speak(UNCLE, "Switch it off when you go out. Lights left on end up on the bill.");
    }},

  {id:"H10", zone:"home", objective:() => "Put the room number back on your door", at:() => flatDoor(),
    tick(){
      if (inFlat()){ tip(null); return; }
      const c = INV.carry(), i = c.slots.findIndex(it => it && it.id === "plate");
      if (c.hand && c.hand.id === "plate") tip(`<span class="oh-mouse click"></span><span>Aim at your door and click to put the room number back.</span>`);
      else if (i >= 0) tip(`<span>Press ${kbd(String(i + 1))} to take the room number out, then aim at your door and click to put it back.</span>`);
      else if (home().plate === "floor") tip(`<span class="oh-mouse click"></span><span>Pick up the room number, then aim at your door and click to put it back.</span>`);
    },
    done:() => seen("plateFixed") || (seen("slam") && home().plate === "door" && !onYou("plate")),
    end(){ hint(null); }},

  {id:"H11", zone:"home", objective:() => "Check your mailbox in the lobby", at:() => ({x:-6.4, z:-.4, y:.27, zone:"home"}),
    start(){ speak(UNCLE, "Before you head anywhere, check the mailbox. You never know what the landlord left in there."); },
    done:() => { const h = home(); return seen("mail") || (h.letters.length > 0 && h.letters.every(l => l.read)); },
    end(){ speak("You", "Rent and electricity are covered for three months. After that the bill comes here, so keep an eye on it."); }},

  {id:"H12", zone:"home", objective:() => "Read the notice board", at:() => ({x:-6.5, z:1.7, y:.27, zone:"home"}),
    start(){ speak(UNCLE, "Check the board before you head out. The building usually posts anything important there."); },
    done:() => seen("board"),
    end(){
      const quiet = !(typeof lifeEventsToday === "function" && lifeEventsToday().length);
      speak("You", quiet ? "Quiet today. When something's up in the building, this is where you'll hear about it first."
        : "So that's where the notices go. When something's up in the building, this is where you'll hear about it first.");
    }},

  {id:"H13", zone:"home", objective:() => "See where deliveries go", at:() => ({x:TABLE.x, z:TABLE.z, y:.27, zone:"home"}),
    start(){ RUN.h13 = 0; speak(UNCLE, "Couriers leave your food on that table. Pick the bag up and carry it to a fridge, and the food goes in."); },
    tick(dt){
      const near = Math.abs(P.feet - .27) < .6 && Math.hypot(Math.max(TABLE.x0 - P.x, 0, P.x - TABLE.x1), Math.max(TABLE.z0 - P.z, 0, P.z - TABLE.z1)) < 2;
      RUN.h13 = facing(TABLE.x, TABLE.y + .3, TABLE.z, .2, 8) && Math.abs(P.feet - .27) < .6 ? RUN.h13 + dt : 0;
      if (near || RUN.h13 >= 1) mark("H13");
    },
    done:() => false},

  {id:"H14", zone:"home", objective:() => "Go back up and open your fridge",
    at:() => { const q = pieceOf("fridge"); return q && q.front ? {x:q.front.x, z:q.front.z, y:q.front.y, zone:"home"} : null; },
    tick(){
      if (seen("fridgeOpen") && !seen("ate")) tip(`<span>Look at the food.</span>`);
      // an empty fridge has nothing to look at: opening it is the lesson then
      if (seen("fridgeOpen") && typeof invCount === "function" && invCount() === 0) mark("ate");
    },
    done:() => seen("fridgeOpen") && seen("ate"),
    end(){ hint(null); speak(UNCLE, "Better fridges keep more of what food is worth. Same food at the training centre, by the way. One stock, two fridges."); }},

  {id:"H15", zone:"home", objective:() => "Have a look at your bed",
    start(){ RUN.h15 = 0; },
    tick(dt){
      const l = RUN.aim.label;
      const on = (l === "Mattress" || l === "Bed") && FLAGS.held && FLAGS.held.label === l;
      if (on && !RUN.h15told){ RUN.h15told = true; hint(bedLines(), 16000); }
      RUN.h15 = on ? RUN.h15 + dt : 0;
      if (RUN.h15 >= 1.5) mark("bedLooked");
    },
    done:() => seen("bedLooked") || seen("nap")},

  {id:"H16", zone:"home",
    objective:() => seen("phone") ? "Order lunch to the training centre" : "Take your phone out",
    tick(){
      if (!seen("phone")) tip(`<span>Press ${kbd("Tab")} to take your phone out.</span>`);
      if (!seen("phone") && typeof PH === "object" && PH && PH.open){
        mark("phone"); hint(null);
        if (typeof fdSetWhere === "function") fdSetWhere("ground");          // the lunch goes where you will be
        speak(UNCLE, "Messages, your stats, and Foodies are all in here. Order some lunch and have it sent to the training centre.");
      }
    },
    done:() => seen("ordered") || (seen("phone") && ((G().orders || []).length > 0 || (G().parcels || []).length > 0)),
    end(){ hint(null); }},

  {id:"H17", zone:"home", objective:() => "Move the ball out of the way",
    at:() => { const d = ballDrop(); return d ? {x:d.x, z:d.z, y:d.y, zone:"home"} : null; },
    // a career that has never had the ball (its flat has none): nothing to move. (A ball in the air, thrown, is still one)
    skip:() => !home().ballGiven && !ballDrop() && !onYou("ball"),
    start(){ ball0(); speak(UNCLE, "And get that ball off the floor before you trip over it."); },
    tick(){
      ball0();
      if (onYou("ball")) tip(`<span>${kbd("G")} puts it down. Find it a spot out of the way.</span>`);
      else tip(`<span class="oh-mouse click"></span><span>The ball takes both hands, so it won't fit in a pocket. Left click to pick it up.</span>`);
    },
    done:() => { const d = ballDrop(), b0 = OB().seen.ball0; return !!(d && b0 && !onYou("ball") && (b0.held || Math.hypot(d.x - b0.x, d.z - b0.z) >= 1)); },
    // (the ball is a live ball of ball.js, core/hand.js: walking into it really does push it along, DESIGN 3.8.1)
    end(){ hint(null); speak("You", "There. You can pick it up and move it any time. Walk into it and you'll push it along."); }},

  {id:"H18", zone:"home", objective:() => "Have a look around your street",
    tick(){
      if (P.feet > 1) return;
      const near = p => p && Math.hypot(p.x - P.x, p.z - P.z) < 8;
      if (near(place("shop", "Mini Market")) && mark("pMarket")) speak("You", "Whatever you buy here goes straight into your fridge.");
      if (near(place("barber")) && mark("pBarber")) speak("You", "The barber. New cuts cost money, but once you've paid for one it's yours.");
      const job = typeof jobState === "function" ? jobState().id : "cafe", sh = typeof SHIFT === "object" ? SHIFT : {open:420, close:1380};
      if (near(place("job", job)) && mark("pWork")) speak("You", `That's where you work. Shifts run from ${time(sh.open)} to ${time(sh.close)}.`);
    },
    done:() => ["pMarket", "pBarber", "pWork"].filter(seen).length >= 2},

  {id:"H19", zone:"home", objective:() => "Face the bus stop on your compass",
    start(){
      RUN.h19 = 0; focus("#lifeCompass");
      speak(UNCLE, "See that compass at the top? It'll point you toward places nearby.");
      speak(UNCLE, "Only places around your current neighbourhood show up.");
    },
    tick(dt){
      const b = busStop(), yaw = Math.atan2(-(b.x - P.x), -(b.z - P.z));
      RUN.h19 = Math.abs(wrapA(yaw - P.yaw)) < 10*Math.PI/180 ? RUN.h19 + dt : 0;
      if (RUN.h19 >= .5) mark("compass");
    },
    done:() => seen("compass"),
    end(){ focus(null); }},

  {id:"H20", zone:"home", objective:() => "Walk to the bus stop", at:() => { const b = busStop(); return {x:b.x, z:b.z, zone:"home", outdoor:true}; },
    start(){ speak(UNCLE, `Line 14 goes to the training centre and to Dumbrava. The ride to training takes ${busToTraining("home")} minutes.`); },
    done:() => seen("busPanel")},

  // (from any stop: Line 14 runs to the training centre from Dumbrava too, so away from home the objective stays the same)
  {id:"H21", zone:"home", anyZone:true, objective:() => "Take the bus to the training centre", at:() => { const b = busStop(); return {x:b.x, z:b.z, zone:"home", outdoor:true}; },
    start(){ if (trainingToday() && LIFE.min < busGateAt("home")) speak("You", "Too early. Grab something from the Mini Market, or sit down and wait."); },
    tick(){
      if (!trainingToday()) return;
      const m = LIFE.min, gate = busGateAt("home"), st = SESS().start;
      if (m >= gate && m < st && mark("gateSaid")) speak(UNCLE, `Training starts at ${time(st)}. You can head over now.`);
      if (m >= st && mark("lateSaid")) speak(UNCLE, `It's ${time(Math.floor(m))}. You're running late, but it's your first day. Head over now.`);
    },
    done:() => seen("H21")},

  /* ---------- the training centre (DESIGN 3.7.6): the assistant coach walks you round ---------- */
  {id:"G1", zone:"ground", objective:() => "Meet the assistant coach at the gate", at:() => guideAt(),
    start(){ guideTo("gate"); },
    tick(){ const g = guideAt(); if (g && Math.hypot(g.x - P.x, g.z - P.z) < 3 && P.feet < 1) mark("metCoach"); },
    done:() => seen("metCoach"),
    end(){ speak(ASSIST, `You must be ${firstName()}. Welcome. Walk with me, I'll show you round before the lads finish.`); }},

  {id:"G2", zone:"ground", objective:() => "Walk out to the training pitch", at:() => ({x:G_NODE.pitch[0], z:G_NODE.pitch[1], zone:"ground", outdoor:true}),
    start(){ guideTo("pitch"); },
    tick(){ if (onPitch()) mark("onPitch"); },
    done:() => seen("onPitch"),
    end(){ speak(ASSIST, `Team training is out here, ${hours()}, Monday to Friday unless there's a game.`); }},

  // (a day with no session on, or none left: nobody out there to meet)
  {id:"G3", zone:"ground", objective:() => "Say hello to the lads", at:() => { const m = nearestMate(); return m ? {x:m.x, z:m.z, zone:"ground", outdoor:true} : null; },
    skip:() => !squadOut(),
    start(){ guideTo("pitch"); },
    tick(){ const m = nearestMate(); if (m && m.d < 4) mark("metLads"); },
    done:() => seen("metLads"),
    end(){ speak(mateName(), "You're the new one? Welcome. Don't let the coach catch you walking."); }},

  {id:"G4", zone:"ground", objective:() => "Have a look in the gym", at:() => ({x:G_NODE.gymDoor[0], z:G_NODE.gymDoor[1], zone:"ground", outdoor:true}),
    start(){ guideTo("gymIn"); },
    tick(){ if (inGym()) mark("inGym"); },
    done:() => seen("inGym"),
    end(){ speak(ASSIST, `Weights, bikes, sprint lane. Each set takes ${setMins()} minutes and trains a couple of skills.`); }},

  // your lunch on the staff counter in the clubhouse (or on its way there); with nothing ordered to the centre, no step
  {id:"G5", zone:"ground",
    objective:() => { const o = groundOrder(); return !groundBag() && o ? `Your order arrives at about ${time(o.eta % 1440)}` : "Your lunch is at the delivery counter in the clubhouse"; },
    at:() => ({x:COUNTER.x, z:COUNTER.z, zone:"ground"}),
    skip:() => !groundBag() && !groundOrder() && !INV.bagsOnYou().length,
    start(){ guideTo("counter"); },
    tick(){
      if (!seen("counterSaid") && groundBag() && Math.hypot(P.x - COUNTER.x, P.z - COUNTER.z) < 2.6 && P.feet < 1){
        mark("counterSaid"); speak(ASSIST, "Deliveries come to this counter. Take the bag to the gym fridge and the food goes in.");
      }
    },
    done:() => { const h = INV.hand(); return !!(h && h.id === "bag"); }},

  // the bag carried up to the gym fridge (the food goes in, acts.js parcelPut), then the fridge opened to see it there
  {id:"G6", zone:"ground", objective:() => seen("gymPut") ? "Open the gym fridge" : "Put it in the gym fridge", at:() => gymFridgeAt(),
    skip:() => OB().seen.G5 === "skipped" && !INV.bagsOnYou().length,
    start(){ guideTo("fridge"); },
    tick(){ if (seen("gymPut") && GROUND.fridge && GROUND.fridge.open && GROUND.fridge.open()) mark("gymFridgeOpen"); },
    done:() => seen("gymPut") && seen("gymFridgeOpen"),
    end(){ speak(ASSIST, "Same food as your fridge at home. It all comes off one stock."); }},

  {id:"G7", zone:"ground", objective:() => "Find the dressing room", at:() => ({x:G_NODE.dress[0], z:G_NODE.dress[1], zone:"ground"}),
    start(){ guideTo("dress"); },
    tick(){ if (inDressing()) mark("inDressing"); },
    done:() => seen("inDressing"),
    end(){ speak(ASSIST, "This is the dressing room. Your locker's the one with your number on it."); }},

  // E on the manager at his desk: what he notices, said, and then shown once on a card (the trust it moves, from
  // the constants daily.js settles the day with)
  {id:"G8", zone:"ground", objective:() => "See the manager in his office", at:() => ({x:26.6, z:15.2, zone:"ground"}),
    start(){ guideTo("offDoor"); },
    done:() => seen("manager") && !!(G().flags && G().flags.TrainingCenterTutorialCompleted)},

  // your first training: the lessons on the match's own controls (training.js startFirstTraining, DESIGN 3.6.3)
  {id:"G9", zone:"ground", objective:() => "Join the coach on the pitch", at:() => { const c = lessonCoach(); return {x:c.x, z:c.z, zone:"ground", outdoor:true}; },
    start(){ guideHome(); },
    tick(){
      if (RUN.lessons || !G().flags) return;
      const c = lessonCoach();
      if (Math.hypot(P.x - c.x, P.z - c.z) < 2.6 && P.feet < 1 && !FLAGS.modal) startLessons();
    },
    done:() => !!(G().flags && G().flags.GameplayTutorialCompleted)}
];
export const STEP_IDS = STEPS.map(s => s.id);
// where the ball was when H17 asked you to move it: the spot it lay on, or, in your hands at that moment, "held" (it
// is moved once it is put down anywhere). Read while the step is current, so a ball carried when the step began, or
// a reload in the middle, still has a start to measure from
function ball0(){
  const o = OB(); if (!o || o.seen.ball0) return;
  const d = ballDrop();
  if (d) o.seen.ball0 = {x:d.x, z:d.z};
  else if (onYou("ball")) o.seen.ball0 = {held:true};
  else return;
  persist();
}

// the bed's lines on day one, from the plan the bed itself sleeps by (daily.js sleepPlan)
function bedLines(){
  const q = pieceOf("bed"), tier = q && q.f ? q.f.tier : 1, wake = typeof WAKE === "number" ? WAKE : 420;
  // a full night: seven and a half hours, the length a night's quality is reckoned from (daily.js sleepPlan)
  const nap = sleepPlan("nap", tier), night = sleepPlan("night", tier, wake - 7.5*60 + 1440), hold = BED_HOLD;
  return `<div class="oh-lines"><span>Tap ${kbd("E")} for a two-hour nap. It takes ${Math.round(nap.rest)} fatigue off.</span>
    <span>After ${time(19*60)}, a tap means sleep until ${time(wake)}. A full night here takes about ${Math.round(night.rest)} fatigue off and gives you back ${Math.round(night.fed)} energy. A better bed does more.</span>
    <span>Hold ${kbd("E")} for about ${NUM[hold] || hold} seconds to sleep through a whole day. Exactly 24 hours pass.</span>
    <span>The day changes at midnight.</span></div>`;
}

/* ---------- the training centre: where things are, who is there ---------- */
const ASSIST = "Assistant coach", MANAGER = "Manager", COACH = "Coach";
// a tour of the centre not done by then carries on tomorrow (DESIGN 3.7.6)
export const POSTPONE_AT = 15*60 + 30;
const firstName = () => String((G().player && G().player.name) || "").trim().split(/\s+/)[0] || "mate";
const hours = () => typeof sessionHours === "function" ? sessionHours() : `${time(SESS().start)} to ${time(SESS().end)}`;
// a gym set's length: drills.js passes this much of the clock for one (its SET_MINS when it names it)
const setMins = () => +DRILLS.SET_MINS > 0 ? +DRILLS.SET_MINS : 45;
const onPitch = () => LIFE.zone === "ground" && P.feet < 1 && P.x > PITCH.x0 && P.x < PITCH.x1 && P.z > PITCH.z0 && P.z < PITCH.z1;
const inGym = () => LIFE.zone === "ground" && P.feet < 1.2 && P.x > -13 && P.x < 13 && P.z > 4 && P.z < 16;
// the dressing room: the clubhouse's ground floor behind the lobby wall (x 22.5), on the south side of the office wall (z 10.5)
const inDressing = () => LIFE.zone === "ground" && P.feet < 1.2 && P.x > 22.6 && P.x < 29.75 && P.z > 3.25 && P.z < 10.4;
// the staff delivery counter in the clubhouse lobby (ground.js deliveryCounter): where you stand at it
const COUNTER = {x:19.25, z:6.0};
const groundOrder = () => (G().orders || []).filter(o => o.where === "ground").sort((a, b) => a.eta - b.eta)[0] || null;
const groundBag = () => (G().parcels || []).some(p => p.at === "ground");
function gymFridgeAt(){ const f = (W.fridges || []).find(q => /gym/.test(q.name || "")); return f ? {x:f.x, z:f.z, zone:"ground"} : {x:G_NODE.fridge[0], z:G_NODE.fridge[1], zone:"ground"}; }
// the squad out on the pitch (npc.js teamSession): its players' bodies, while the session is on and they are still out
function squadBodies(){
  const T = GROUND.session; if (!T || T.left || !T.actors || !T.root || !T.root.visible) return [];
  const out = [];
  for (const ac of T.actors) for (const h of ac.kind === "pair" ? ac.P : [ac.P]) if (h && h.g && h.g.visible) out.push(h.g.position);
  return out;
}
const squadOut = () => LIFE.zone === "ground" && typeof sessionOn === "function" && sessionOn() && squadBodies().length > 0;
function nearestMate(){
  let best = null;
  for (const p of squadBodies()){ const d = Math.hypot(p.x - P.x, p.z - P.z); if (!best || d < best.d) best = {x:p.x, z:p.z, d}; }
  return best;
}
// a teammate's first name, from your club's squad (the same one every time)
function mateName(){
  try {
    const c = typeof myClub === "function" ? myClub() : null, sq = c && typeof squadOf === "function" ? squadOf(c.id) : [];
    const p = sq.filter(q => q && !q.me && q.pos !== "GK").sort((a, b) => a.id - b.id)[0];
    if (p && typeof pname === "function") return pname(p).split(" ")[0];
  } catch(e){}
  return "Teammate";
}
// who runs your first training: the coach with the squad while the session is on, else his assistant at his post
function lessonCoach(){
  const T = GROUND.session, on = typeof sessionOn === "function" && sessionOn() && T && !T.left && T.coach;
  if (on) return {x:T.coach.g.position.x, z:T.coach.g.position.z, who:COACH};
  const A = GROUND.assist; return A ? {x:A.x, z:A.z, who:ASSIST} : {x:14.5, z:-2.9, who:ASSIST};
}

/* ---------- the assistant coach, walking you round ----------
   He walks a real route between the buildings: a small graph of points on the paths, through the doorways (he opens
   the gym's door if it is shut), from the gate to wherever the step you are on is. He keeps a few steps ahead, waits
   for you when you fall behind, never walks into you, and turns to you when he is there */
const G_NODE = {
  gate:[-12.6, 19.2], yardW:[-7.5, 18.4], gymDoor:[0, 17.6], gymIn:[0, 13.6], fridge:[10.6, 14.2],
  yardM:[5.6, 18.5], yardE:[12.6, 18.7], walkN:[15.3, 17.0], walkS:[15.3, 1.2], pitch:[11, -6.5], post:[14.5, -2.9],
  clubOut:[16.0, 10.1], clubIn:[19.5, 10.1], counter:[20.1, 7.4], drDoor:[21.7, 9.0], dress:[23.8, 9.0],
  offDoor:[21.7, 12.1], office:[23.9, 12.1]
};
const G_EDGE = [["gate", "yardW"], ["yardW", "gymDoor"], ["gymDoor", "gymIn"], ["gymIn", "fridge"], ["gymDoor", "yardM"], ["yardM", "yardE"],
  ["yardE", "walkN"], ["walkN", "walkS"], ["walkS", "pitch"], ["walkS", "post"], ["pitch", "post"], ["walkN", "clubOut"], ["walkS", "clubOut"],
  ["clubOut", "clubIn"], ["clubIn", "counter"], ["clubIn", "drDoor"], ["drDoor", "dress"], ["clubIn", "offDoor"], ["drDoor", "offDoor"], ["offDoor", "office"]];
const GUIDE = {h:null, at:"gate", path:[], to:null, v:0, home:false, done:false, yaw:0};
const GUIDE_V = 1.35, GUIDE_WAIT = 6.5, GUIDE_GAP = 1.1;
function routeTo(from, to){
  if (from === to) return [];
  const prev = {[from]:null}, q = [from];
  while (q.length){
    const n = q.shift(); if (n === to) break;
    for (const [a, b] of G_EDGE){ const m = a === n ? b : b === n ? a : null; if (m && !(m in prev)){ prev[m] = n; q.push(m); } }
  }
  if (!(to in prev)) return [];
  const path = []; for (let n = to; n !== from; n = prev[n]) path.unshift(n);
  return path;
}
// lent to the first day (the same body as at his post): put at the gate when you arrive with the tour to do
function guideTake(){
  const A = GROUND.assist; if (!A || !A.h || !A.h.g) return null;
  if (GUIDE.h !== A.h){
    GUIDE.h = A.h; if (A.lend) A.lend();
    const [x, z] = G_NODE.gate; A.h.g.position.set(x, 0, z); A.h.g.rotation.y = 0; GUIDE.yaw = 0;
    GUIDE.at = "gate"; GUIDE.path = []; GUIDE.v = 0; GUIDE.home = false; GUIDE.done = false;
    A.h.ast = {mode:"idle"};
  }
  return GUIDE.h;
}
function guideTo(node){
  if (LIFE.zone !== "ground" || GUIDE.done || !guideTake()) return;
  if (GUIDE.to === node) return;
  GUIDE.to = node; GUIDE.home = false;
  // (on the way to a point already: from there)
  const from = GUIDE.path.length ? GUIDE.path[0] : GUIDE.at;
  GUIDE.path = GUIDE.path.length ? [GUIDE.path[0], ...routeTo(GUIDE.path[0], node)] : routeTo(from, node);
}
// the tour is over: back to his post on the touchline, and his own again once he is there
function guideHome(){
  if (LIFE.zone !== "ground" || !GUIDE.h || GUIDE.done) return;
  guideTo("post"); GUIDE.home = true;
}
export function guideAt(){ const h = GUIDE.h; return h && h.g && LIFE.zone === "ground" ? {x:h.g.position.x, z:h.g.position.z, zone:"ground", outdoor:true} : null; }
function guideStep(dt){
  const h = GUIDE.h; if (!h || !h.g || GUIDE.done) return;
  // a drill or the lessons have him now (training.js lends him too): leave him to them
  if (window.__train && window.__train.RUN && window.__train.RUN.cur){ GUIDE.done = true; return; }
  const g = h.g.position, you = Math.hypot(P.x - g.x, P.z - g.z);
  let want = 0, face = null;
  if (GUIDE.path.length){
    const [tx, tz] = G_NODE[GUIDE.path[0]], dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    // he waits for you when you fall behind (not when you have gone on ahead, nor on his way home), and never walks
    // into you
    const end = G_NODE[GUIDE.path[GUIDE.path.length - 1]], behind = Math.hypot(P.x - end[0], P.z - end[1]) > Math.hypot(g.x - end[0], g.z - end[1]);
    // (standing in his way, close: he steps round you, out to the side away from you, rather than stopping for good)
    const ahead = you < GUIDE_GAP && ((P.x - g.x)*dx + (P.z - g.z)*dz) > 0;
    if (GUIDE.home || you < GUIDE_WAIT || !behind) want = ahead ? GUIDE_V*.6 : GUIDE_V;
    if (GUIDE.path[0] === "gymIn") gymDoorOpen(g);
    if (d < .15){ GUIDE.at = GUIDE.path.shift(); }
    else {
      GUIDE.v += Math.max(-3*dt, Math.min(2*dt, want - GUIDE.v));
      let ux = dx/d, uz = dz/d;
      if (ahead){
        const sx = -uz, sz = ux, side = (P.x - g.x)*sx + (P.z - g.z)*sz > 0 ? -1 : 1;
        ux += sx*side*1.4; uz += sz*side*1.4; const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
      }
      const step = Math.min(GUIDE.v*dt, d); g.x += ux*step; g.z += uz*step;
      if (GUIDE.v > .05) face = Math.atan2(ux, uz);
    }
  } else {
    GUIDE.v = Math.max(0, GUIDE.v - 3*dt);
    if (GUIDE.home && GROUND.assist){
      // at his post: facing the pitch as he always stands, and his own again
      const A = GROUND.assist; h.g.rotation.y = A.ry; h.ast = {mode:"idle"};
      if (A.giveBack) A.giveBack();
      GUIDE.done = true; GUIDE.h = null; return;
    }
    face = Math.atan2(P.x - g.x, P.z - g.z);
  }
  if (face != null){ const r = wrapA(face - h.g.rotation.y); h.g.rotation.y += r*(1 - Math.exp(-6*dt)); }
  h.ast = GUIDE.v > .05 ? {mode:"move", speed:GUIDE.v} : {mode:"idle"};
}
// the gym's door, opened for you as he gets to it
function gymDoorOpen(g){
  if (Math.hypot(g.x - G_NODE.gymDoor[0], g.z - G_NODE.gymDoor[1]) > 1.6) return;
  const d = W.spots.find(sp => sp.kind === "drag" && sp.label === "Gym door");
  if (d && d.angle != null && d.angle < .5 && d.toggle) d.toggle();
}

/* ---------- the manager (G8): E on him, what he notices, and the card that shows it ---------- */
const sgn = (x, dp = 1) => typeof fmtSigned === "function" ? fmtSigned(x, dp) : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(dp).replace(/\.0$/, "");
function managerTalk(){
  if (seen("manager")) return;
  mark("manager");
  const st = SESS().start;
  speak(MANAGER, `Training's at ${time(st)}. Be on time and I notice. Be here early and I notice that too.`);
  speak(MANAGER, "Miss it, and I notice that most of all.");
  G().flags.TrainingCenterTutorialCompleted = true;
  persist();
  // the card, once the lines have been said
  RUN.cardDue = true;
}
// what the manager notices, from daily.js's own numbers (ATTEND, EARLY, MISS_MATCH)
export function noticesCard(){
  const A = typeof ATTEND === "object" ? ATTEND : {good:1.2, late:-3, absent:-6}, E = typeof EARLY === "object" ? EARLY : {bonus:[.3, .45, .6], weekCap:3};
  const miss = typeof MISS_MATCH === "number" ? MISS_MATCH : -10, lo = Math.min(...E.bonus), hi = Math.max(...E.bonus);
  const times = NUM[E.weekCap] || E.weekCap;
  return [["A full session", sgn(A.good)], ["In early as well", `${sgn(lo)} to ${sgn(hi)}, up to ${times} times a week`],
    ["Late", sgn(A.late, 0)], ["Missing training", sgn(A.absent, 0)], ["Missing a match", sgn(miss, 0)]];
}
function showCard(){
  if (seen("card")) return;
  if (typeof lpShow !== "function"){ mark("card"); return; }
  const rows = noticesCard().map(([k, v]) => `<div class="onb-card-row"><span>${esc(k)}</span><b${/^−/.test(v) ? ` class="bad"` : ""}>${esc(v)}</b></div>`).join("");
  const head = typeof lpHead === "function" ? lpHead("What the manager notices", "His office") : "<h3>What the manager notices</h3>";
  lpShow("onbcard", `<div class="onb-card">${head}<p class="onb-card-sub">Manager trust, as he settles each day</p><div class="onb-card-list">${rows}</div>
    <p class="onb-card-foot">And how you play: your match ratings and the decisions you make on the pitch.</p>
    <div class="nb-foot"><button class="btn" onclick="lpClose()">Got it</button></div></div>`, {onClose:() => mark("card")});
}
// a spot of the first day's in front of the world's own: the manager while G8 is on, the coach until your lessons
function tourSpots(){
  if (LIFE.zone !== "ground") return;
  const boss = W.spots.find(sp => sp.label === "The manager" && !sp.onb);
  if (boss) W.spots.unshift({onb:true, aim:boss.aim, x:boss.x, z:boss.z, label:"The manager", hint:"Talk to him", hold:.2,
    when:() => (!boss.when || boss.when()) && RUN.cur && RUN.cur.id === "G8" && !seen("manager"), run:() => managerTalk()});
  W.spots.unshift({onb:true, x:-6, y:1.2, z:-5.4, r:2.4, near:true, label:COACH,
    when:() => active() && !(G().flags && G().flags.GameplayTutorialCompleted) && typeof sessionOn === "function" && sessionOn(),
    get hint(){ return RUN.cur && RUN.cur.id === "G9" ? "Your first training" : "After you've had a look round"; },
    run:() => { if (RUN.cur && RUN.cur.id === "G9") startLessons(); else speak(COACH, "Get yourself shown round first. I'll see you out here after."); }});
}
// your locker in the dressing room: the middle one on the south wall, your number on its name card (props.js lockers)
function lockerPlate(){
  if (LIFE.zone !== "ground") return;
  const p = G().player || {}, num = p.number != null ? String(p.number) : "", sur = String(p.name || "").trim().split(/\s+/).slice(-1)[0] || "";
  if (!num) return;
  const tex = textTex(256, 112, g => {
    g.fillStyle = "#f2efe6"; g.fillRect(0, 0, 256, 112);
    g.fillStyle = "#1c2c4a"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 84px "Barlow Condensed", sans-serif`; g.fillText(num, 58, 60);
    g.font = `800 40px "Barlow Condensed", sans-serif`; g.fillText(sur.toUpperCase().slice(0, 9), 172, 60, 150);
  });
  label(tex, 26.2, 1.755, 3.5 + .253 + .011, .16, .07, 0, {rough:.6});
}
// your first training: the lessons, on the match's controls; their end is the end of the first day
function startLessons(){
  if (RUN.lessons || PLAY.t < RUN.lessonAt || typeof window.lifeFirstTraining !== "function") return;
  RUN.lessons = true;
  // (cut short, or refused because something else is running: not asked again for a few seconds)
  const over = () => { RUN.lessons = false; RUN.lessonAt = PLAY.t + 3; RUN.dirty = true; };
  window.lifeFirstTraining().then(over).catch(e => { over(); console.error(e); });
}

/* ---------- the runner ---------- */
const RUN = {cur:undefined, dirty:true, aim:{label:null}, focus:null, focused:null, focusEls:null, unfocusT:0, goalT:0, h2:0, h13:0, h15:0, h15told:false, h19:0, started:new Set(),
  cardDue:false, lessons:false, lessonAt:0, closing:false};
function stepDone(st){
  const o = OB(); if (!o) return true;
  if (o.seen[st.id]) return true;
  if (st.skip && st.skip()){ o.seen[st.id] = "skipped"; return true; }
  let d = false; try { d = !!st.done(); } catch(e){ console.error(e); }
  if (d){ o.seen[st.id] = true; persist(); }
  return d;
}
function current(){ for (const st of STEPS) if (!stepDone(st)) return st; return null; }
export function currentId(){ return active() ? (current() || {id:null}).id : null; }
function enter(st){
  const prev = RUN.cur; RUN.cur = st;
  // (a timed how-to, the bed's lines, stays up to be read to the end; the step before's own how-to goes)
  if (!(HINT.t > 0)) hint(null);
  focus(null); RUN.unfocusT = 0;
  // the step that ends says its piece before the next starts; a step's own start is said once a session
  if (prev && prev.end && OB().seen[prev.id] === true) try { prev.end(); } catch(e){ console.error(e); }
  const o = OB();
  o.step = st ? st.id : o.step;
  if (!st){ finishHome(); return; }
  if (st.start && !RUN.started.has(st.id)){ RUN.started.add(st.id); try { st.start(); } catch(e){ console.error(e); } }
  showGoal();
}
function showGoal(){
  const st = RUN.cur; if (!st || RUN.lessons){ goal(null); return; }
  if (st.zone === "ground" && postponed()){ goal(`Back at the training centre tomorrow, ${time(SESS().start)}`, null); return; }
  if (st.zone !== LIFE.zone){
    // a step to do somewhere else: the ride there (DESIGN 3.7.4). A home step that ends on the bus to training (H21)
    // is the ride to the training centre wherever you are
    goal(st.anyZone ? st.objective() : st.zone === "home" ? "Take the bus back to Strada Teiului" : "Take the bus to the training centre", null);
    return;
  }
  goal(st.objective(), st.at ? st.at() : null);
}
/* every step is behind you: the first training is done (training.js and acts.js lessonsDone set the flag and the
   step), and the first day with it. Whatever is left on screen goes */
function finishHome(){
  const s = G(), o = OB(); if (!s || !o) return;
  s.flags.ApartmentTutorialCompleted = true;
  if (s.flags.GameplayTutorialCompleted) s.flags.TrainingCenterTutorialCompleted = true;
  o.step = "done";
  goal(null); hint(null); focus(null); markerOff();
  persist(true);
}

/* ---------- what the world tells the first day (window.lifeOnb, and world.js onbEmit) ---------- */
export function onEvent(ev, d = {}){
  const s = G(); if (!s || !s.flags) return;
  if (ev === "aim"){ RUN.aim = {label:d.label || null}; return; }
  if (ev === "zone" && d.zone === "ground" && !active()){ earlyWord(); return; }
  if (!active()) return;
  switch (ev){
    case "switch": if (!d.bulb) mark("switchNoBulb"); break;
    case "take": if (d.id === "bulb" && d.item && d.item.unpaid) mark("tookBulb"); break;
    case "belt": mark("belt"); break;
    case "paid": mark("paid"); break;
    case "plateFell": if (seen("slam")) mark("plateFell"); break;
    case "plateFixed": if (seen("slam")) mark("plateFixed"); break;
    case "mail": mark("mail"); break;
    case "board": mark("board"); break;
    case "fridge": if (d.zone !== "ground") mark("fridgeOpen"); else if (seen("gymPut")) mark("gymFridgeOpen"); break;
    case "eat": if (seen("fridgeOpen") && (d.ok || d.full)) mark("ate"); break;
    case "nap": mark("nap"); break;
    case "foodiesOrder": if (d.ok) mark("ordered"); break;
    case "openBus": if (d.from === "home") mark("busPanel"); break;
    // the bus to the training centre pulls away: the flat's chapter is done from here (DESIGN 3.7.5 H21)
    case "busGo": if (d.to === "ground") s.flags.ApartmentTutorialCompleted = true; break;
    case "zone": if (d.zone === "ground") arrivedAtGround(); break;
    // the bag carried up to the gym fridge: the food is in (acts.js parcelPut)
    case "parcelPut": if (d.zone === "ground") mark("gymPut"); break;
    // the last lesson is over: the coach's last word, which comes after the first day has been marked done, is still
    // said in the first day's own box (active() holds while RUN.closing)
    case "lesson": if (d.ok != null && typeof d.n === "number" && d.n >= 6) RUN.closing = true; break;
    case "trainingDone": RUN.closing = true; RUN.dirty = true; break;
  }
  RUN.dirty = true;
}
window.lifeOnb = (ev, data) => onEvent(ev, data || {});
// off the bus at the training centre: the home chapter is behind you, whatever of it is left
function arrivedAtGround(){
  const o = OB();
  for (const st of STEPS) if (st.zone === "home" && !o.seen[st.id]) o.seen[st.id] = st.id === "H21" ? true : "skipped";
  RUN.cur = undefined; RUN.dirty = true;
}

/* ---------- the neighbour's door, and the number off yours (H7) ---------- */
function slam(){
  mark("slam");
  if (HOME.slam) HOME.slam();
  try { AUD.init(); const d = flatDoor(); AUD.cue("board", {x:d.x, y:d.y + 1.2, z:d.z - 1.2}, 2); } catch(e){}
  camKick({pitch:.012, roll:.01, dy:.012, w:26});
  const b = el("cineBang", "cine-bang"); b.textContent = "BANG!"; b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  later(.26, () => { if (HOME.plate) HOME.plate.fall({hard:true}); });
  later(.7, () => speak("You", "Somebody across the hall really hates doors."));
  persist();
}
// something a moment from now, on the play clock (it waits with the world while a panel is up)
const LATER = [];
function later(sec, fn){ LATER.push({at:PLAY.t + sec, fn}); }
function laterStep(){
  for (let i = LATER.length - 1; i >= 0; i--) if (PLAY.t >= LATER[i].at){ const f = LATER[i].fn; LATER.splice(i, 1); try { f(); } catch(e){ console.error(e); } }
}

/* ---------- day one's rules ---------- */
// holding E on the bed (a whole day asleep) is not for today
export function refuse(what){
  if (what === "sleepDay" && active()) return "Not today. The club expects you.";
  return null;
}
// the training-centre bus before the ride would get you there for the start: shut, with when it opens
export function busGate(from, to){
  if (to !== "ground" || !active() || !trainingToday()) return null;
  const gate = busGateAt(from);
  return LIFE.min < gate ? `From ${time(gate)} today. The club wants you there at ${time(SESS().start)}.` : null;
}
// ui/panels.js openBus asks it for every option of the Line 14 panel and draws a gated one disabled with this line
window.lifeBusGate = busGate;
// a step before your first training is under way is the one you are on, and you are where it is (or on your way to
// it from home on the first day): the slow clock. Not once the tour is put off until tomorrow, nor in the lessons
// (they keep their own rate)
export function slow(){
  if (!active() || !RUN.cur || RUN.lessons || postponed()) return false;
  return RUN.cur.zone === "home" || LIFE.zone === "ground";
}
// the tour of the centre is put off until tomorrow (S.onb.post: the day it was put off)
const postponed = () => { const o = OB(); return !!(o && o.post != null && G().life && G().life.day <= o.post); };
function postponeCheck(){
  const o = OB(), st = RUN.cur;
  if (!st || st.zone !== "ground" || st.id === "G9" || postponed()) return;
  if (o.post != null){ delete o.post; persist(); }
  if (LIFE.zone !== "ground" || LIFE.min < POSTPONE_AT || RUN.lessons) return;
  o.post = G().life.day; persist();
  speak(COACH, `Let's pick this up tomorrow at ${time(SESS().start)}.`);
  guideHome(); RUN.dirty = true;
}
/* after the first day: in 30 to 60 minutes before training starts, and the coach has seen you (acts.js arrive prints
   the time; trust comes at four if you stay, daily.js settleAttendance) */
function earlyWord(){
  const s = G(), a = s && s.life && s.life.att, E = typeof EARLY === "object" ? EARLY : {by:30};
  if (!a || a.excused || !trainingToday() || (typeof todaysFixture === "function" && todaysFixture())) return;
  const left = SESS().start - s.life.min;
  if (left >= E.by && left <= 2*E.by) speak(COACH, "In early. Good.");
}

/* ---------- what intro.js calls ---------- */
export function fdInit(host){ H = host; setClockScale(() => slow() ? ONB_RATE : 1); }
// the world has started (or you are back in it): pick up the step you are on
export function fdStart(){
  OB(); RUN.cur = undefined; RUN.dirty = true; RUN.h15told = false; sayClear();
  if (!active()){ goal(null); hint(null); return; }
}
export function fdZone(zone){
  OB();
  GOAL.marker = null; RUN.cur = undefined; RUN.dirty = true; hint(null);
  // (the place was rebuilt: the assistant coach is a new body, at his post, until the tour takes him again)
  GUIDE.h = null; GUIDE.to = null; GUIDE.path = []; GUIDE.done = false; GUIDE.home = false;
  RUN.started.delete("G1"); for (const id of ["G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"]) RUN.started.delete(id);
  if ((zone || LIFE.zone) === "ground"){
    lockerPlate();
    if (active()) tourSpots();
  }
}
export function fdTick(dt){
  const s = G(); if (!s || !s.flags || !H) return;
  if (!active()){
    if (RUN.cur !== null && RUN.cur !== undefined){ RUN.cur = null; goal(null); hint(null); focus(null); markerOff(); }
    // (a word said after the first day, the coach's when you are in early, still has its box)
    if (SAY.cur || SAY.q.length){ if (!paused()) PLAY.t += dt; sayStep(paused() ? 0 : dt, paused()); sayPlace(); }
    focusStep(); return;
  }
  if (H.cine && H.cine.on){ focusStep(); return; }
  if (!paused()) PLAY.t += dt;
  laterStep();
  sayStep(paused() ? 0 : dt, paused());
  // the first training's last word said: the first day is over
  if (RUN.closing && OB().step === "done" && !saying()){ RUN.closing = false; return; }
  const cur = current();
  if (cur !== RUN.cur){ enter(cur); if (!cur) return; }
  if (cur && cur.zone === LIFE.zone && cur.tick && !paused() && !postponed()) try { cur.tick(dt); } catch(e){ console.error(e); }
  if (LIFE.zone === "ground" && !paused()){ guideStep(dt); postponeCheck(); }
  // the manager's card, once his lines have been said
  if (RUN.cardDue && !saying() && !paused()){ RUN.cardDue = false; showCard(); }
  if (HINT.t > 0 && (HINT.t -= dt) <= 0) hint(null);
  if (RUN.unfocusT > 0 && (RUN.unfocusT -= dt) <= 0) focus(null);
  if ((RUN.goalT -= dt) <= 0){
    RUN.goalT = .25; showGoal();
    const g = document.querySelector("#onbGoal b");
    if (g){ const at = GOAL.at, d = at && (at.zone || "home") === LIFE.zone ? Math.hypot(at.x - P.x, at.z - P.z) : 0; g.textContent = d > 3 ? `${Math.round(d)} m` : ""; }
    markerSet(GOAL.at);
  }
  markerStep(dt);
  focusStep();
  hintPlace();
  sayPlace();
}
// for tests and the HUD
export const FD = {active, slow, refuse, busGate, busGateAt, currentId, STEP_IDS, onEvent, goal:() => GOAL.text, hint:() => HINT.html, saying, inFlat, said:() => SAID.slice(),
  guide:() => ({at:GUIDE.at, to:GUIDE.to, path:GUIDE.path.slice(), done:GUIDE.done, pos:guideAt()}), postponed, noticesCard, POSTPONE_AT, NODES:G_NODE,
  lessons:() => RUN.lessons};
window.lifeFirstDay = FD;
