/* ============ Training Mode: the training key layer ============
   Owner: P5-A (Training Mode Phase 5). Contract: BUILD-PLAN P5-A work item 2 and the Phase 5 contract "P5-A emits the
   window event train:admin with {open}"; TRAINING-SPEC 0 ("Admin panel: Numpad 1 (event.code Numpad1, distinct from
   Digit1) plus laptop shortcut Ctrl+Shift+1. Never opens while typing; Training Mode only") and 4 (Free Play's Q).
   Inspection issues INF-6 (the admin key could not be told apart) and ball-12 (Numpad 1 read as "1").

   One window keydown listener in the capture phase, there only while Training is on (installed on train:enter, taken
   off on train:exit), so nothing here runs in a career, a match or life.
   - Listener order is not relied on. life/phone.js and football/controller.js put their capture listeners on the window
     long before Training starts, so they hear a key first, but neither stops it going on: the controller's capture
     only notes the modifiers (MOD.on, cleared again on the key-up as always) and phone.js does nothing in Training's
     modes. The game's own routing is world.js's bubble-phase listener, so a key this layer takes in the capture phase
     never reaches it.
   - The admin panel: e.code 'Numpad1' (whatever NumLock says), or Ctrl + Shift + e.code 'Digit1' on a keyboard with no
     number pad. Never while an input, a text area, a select or anything editable has the focus (the preset name, a
     typed attribute). On a match: preventDefault and stopImmediatePropagation, so routing never sees a "1" (the
     contact stays as it was), and the window gets 'train:admin' {open} with the panel's new state: open when it was
     closed, closed when it was open. The panel (admin.js, P5-B) listens for the event; this module never imports it.
     The state the toggle starts from is the panel's own when it says (window.trainAdminOpen()), else the last one
     either side sent (a 'train:admin' the panel fires when it closes itself counts too).
   - Q while Free Play plays (and is not paused under its card): the one ball in front of you (freeplay.js spawnBall),
     the key kept from routing. Anywhere else Q goes on as before. */
import {spawnBall, freePlaying} from "./freeplay.js";
import {RUN} from "./runner.js";

const K = {on:false, open:false, sent:0, q:0};
// (typing: a field that takes text. A slider, a box to tick or a button with the focus is not typing: the admin panel's
// height slider keeps the focus after a drag and Numpad 1 must still close the panel)
const TEXT_IN = new Set(["", "text", "number", "search", "email", "password", "tel", "url"]);
const typing = t => !!t && ((t.tagName === "INPUT" && TEXT_IN.has(String(t.getAttribute("type") || "").toLowerCase())) || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
// is this key event the admin panel's key
export const isAdminKey = e => !!e && (e.code === "Numpad1" || (e.code === "Digit1" && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey));
export const adminOpen = () => typeof window.trainAdminOpen === "function" ? !!window.trainAdminOpen() : K.open;

// the panel opened or closed: the event with its new state
export function adminToggle(open = !adminOpen()){
  K.open = !!open; K.sent++;
  dispatchEvent(new CustomEvent("train:admin", {detail:{open:K.open, from:"keys"}}));
  return K.open;
}

function onKey(e){
  if (!K.on || typing(e.target) || typing(document.activeElement)) return;
  if (isAdminKey(e)){
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) adminToggle();
    return;
  }
  if (e.code === "KeyQ" && !e.ctrlKey && !e.altKey && !e.metaKey && freePlaying() && !RUN.paused){
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat && spawnBall()) K.q++;
  }
}
// the panel's own word on its state (it closed itself: its close button, Esc)
function heard(e){ const d = e.detail || {}; if (d.from !== "keys") K.open = !!d.open; }

function install(){
  if (K.on) return;
  K.on = true; K.open = false;
  addEventListener("keydown", onKey, true);
  addEventListener("train:admin", heard);
}
function remove(){
  if (!K.on) return;
  // (the panel does not outlive Training)
  if (adminOpen()) adminToggle(false);
  K.on = false;
  removeEventListener("keydown", onKey, true);
  removeEventListener("train:admin", heard);
}
if (typeof addEventListener === "function"){
  addEventListener("train:enter", install);
  addEventListener("train:exit", remove);
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainKeys = {isAdminKey, adminOpen, adminToggle, get on(){ return K.on; }, get sent(){ return K.sent; }, get q(){ return K.q; }};
