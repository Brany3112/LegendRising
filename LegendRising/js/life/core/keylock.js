/* ============ Ctrl as a second shield key, in full screen only ============
   Owner: P2b-B (TR-2b, Phase 2b). Contract: BUILD-PLAN Phase 2b, P2b-B "New files" (KEYLOCK, ctrlShields, the one-time
   full-screen tip); TRAINING-SPEC section 0 (shield key: C held; Ctrl too in full screen with keyboard lock).

   Outside full screen the browser keeps Ctrl's shortcuts for itself (Ctrl+W closes the tab, and no page can stop it),
   so Ctrl is never a game key there and the football modules ignore any key pressed with it (D9). In full screen,
   Chromium's navigator.keyboard.lock() hands those shortcuts to the page: then, and only then, Ctrl shields the ball as
   C does, and the D9 guard lets presses made with Ctrl held through (control.js modKey, controller.js capture).

   This module lives outside js/life/football on purpose: it is the one place that reads the Ctrl key itself (lint rule
   football-no-modifier-keys). It tracks:
     KEYLOCK.fs      the page is in full screen
     KEYLOCK.locked  navigator.keyboard.lock() has been granted for this full screen
     KEYLOCK.ctrl    a Ctrl key (ControlLeft or ControlRight, by e.code) is held down now
   ctrlShields() is KEYLOCK.fs && KEYLOCK.locked: whether Ctrl is a game key right now.
   The tip suggesting full screen is shown once per device (localStorage freyaFootball.tipFS, never the career save). */

export const KEYLOCK = {fs:false, locked:false, ctrl:false};
export const TIP_FS_KEY = "freyaFootball.tipFS";

// Ctrl is a game key (it shields) only in full screen with the keyboard locked
export const ctrlShields = () => KEYLOCK.fs && KEYLOCK.locked;

// (a request still out when full screen ends must not leave the lock on: each full screen has its own number)
let SEQ = 0;
function fsElement(){ return typeof document !== "undefined" ? document.fullscreenElement || document.webkitFullscreenElement || null : null; }
function kb(){ return typeof navigator !== "undefined" && navigator.keyboard && typeof navigator.keyboard.lock === "function" ? navigator.keyboard : null; }

// read the full-screen state and lock or release the keyboard to match it
export function keylockSync(){
  const fs = !!fsElement();
  if (fs === KEYLOCK.fs) return KEYLOCK;
  KEYLOCK.fs = fs;
  const k = kb(), n = ++SEQ;
  if (fs){
    KEYLOCK.locked = false;
    if (k){
      // (no key list: every key, Ctrl+W and Ctrl+T included, comes to the page while the page is full screen)
      let p = null;
      try { p = k.lock(); } catch(e){ p = null; }
      if (p && typeof p.then === "function") p.then(() => { if (n === SEQ && KEYLOCK.fs) KEYLOCK.locked = true; }, () => { if (n === SEQ) KEYLOCK.locked = false; });
    }
  } else {
    KEYLOCK.locked = false;
    // (a Ctrl held as the full screen ended is let go: outside it Ctrl is the browser's again)
    KEYLOCK.ctrl = false;
    if (k && typeof k.unlock === "function"){ try { k.unlock(); } catch(e){} }
  }
  return KEYLOCK;
}

// the one-time tip: due while it has never been shown on this device and the page is not already in full screen
export function tipFSDue(){
  if (KEYLOCK.fs) return false;
  try { return localStorage.getItem(TIP_FS_KEY) !== "1"; } catch(e){ return false; }
}
export function tipFSShown(){ try { localStorage.setItem(TIP_FS_KEY, "1"); } catch(e){} }

// Ctrl down and up, by its code (a Ctrl let go while the window had no focus never sends its keyup: blur lets go)
function onKey(e){
  const c = e.code;
  if (c === "ControlLeft" || c === "ControlRight") KEYLOCK.ctrl = e.type === "keydown";
  else if (KEYLOCK.ctrl && e.ctrlKey === false) KEYLOCK.ctrl = false;
}
if (typeof addEventListener === "function"){
  addEventListener("keydown", onKey, true);
  addEventListener("keyup", onKey, true);
  addEventListener("blur", () => { KEYLOCK.ctrl = false; });
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function"){
  document.addEventListener("fullscreenchange", keylockSync);
  document.addEventListener("webkitfullscreenchange", keylockSync);
  keylockSync();
}
