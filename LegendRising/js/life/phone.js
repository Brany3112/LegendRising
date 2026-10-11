"use strict";
/* ============ LIFE: the phone ============
   Three places to be:
   · the street  — walking about in first person
   · in hand     — Tab pulls the game's own phone out of your pocket. The keypad phone works with the
                   arrow keys and you can keep walking; the smartphone frees the mouse and you stand still.
   · the hub     — Q (or the Hub item on the phone) brings the phone up to your face and it becomes the
                   full hub. The phone button bottom right puts it back in your pocket. */
(function(){
  let mode = "street", busy = false;
  const body = document.body;
  const life = () => body.classList.contains("life");
  const inMatch = () => body.classList.contains("in-match");
  const lp = () => document.getElementById("lifePhone");
  const handOpen = () => typeof PH !== "undefined" && PH.open;
  const smart = () => typeof S !== "undefined" && S && S.phone === "smart";
  const OPEN_MS = 560, CLOSE_MS = 520;

  window.lifeMode = () => mode === "hub" ? "hub" : handOpen() ? "hand" : "street";
  window.lifeHubOut = () => life() && mode === "hub";
  // the street stops moving you while you use the smartphone or the hub
  window.lifeMoveLocked = () => mode !== "street" || busy || (handOpen() && smart()) || !!(window.lifeModal && window.lifeModal());

  function hint(){
    const h = document.getElementById("lifeHandHint"); if (!h) return;
    const on = life() && handOpen() && mode === "street";
    body.classList.toggle("hand", on);
    if (on) h.textContent = smart() ? "Mouse to use the phone · Tab put it away · Q hub"
                                    : "Wheel or ↑ ↓ choose · click or Enter select · Esc back · Tab put it away · Q hub";
  }
  window.lifePhoneChanged = hint;            // the game's phone calls this when it opens or closes

  /* ---------- Tab: the phone in your hand ---------- */
  window.lifeHand = function(){
    if (!life() || busy || mode !== "street" || inMatch()) return;
    if (handOpen()){
      closePhone(); hint();
      if (window.lifeRelock) window.lifeRelock();
      return;
    }
    const r = document.getElementById("phoneRoot"); if (r) r.classList.remove("hidden");
    // the mouse is the phone's while it's out (the keypad phone too: wheel, click, Esc); the clock keeps running, and
    // with the keypad phone you can still walk
    if (document.exitPointerLock) document.exitPointerLock();
    if (window.lifeClearKeys && smart()) window.lifeClearKeys();
    openPhone(); hint();
  };

  /* ---------- Q: up to your face, and it becomes the hub ---------- */
  window.lifeHub = function(){
    if (!life() || busy || mode === "hub" || inMatch()) return;
    busy = true; mode = "hub";
    if (handOpen()) closePhone();
    hint();
    document.exitPointerLock && document.exitPointerLock();
    if (window.lifeClearKeys) window.lifeClearKeys();
    if (typeof closeSheet === "function") closeSheet();
    if (typeof renderHub === "function") renderHub();     // drawn before it moves, never while
    const p = lp(), sc = p.querySelector(".lp-screen");
    sc.scrollTop = 0;
    p.classList.add("show");
    void sc.offsetWidth;                                   // start from the pocket
    requestAnimationFrame(() => {
      p.classList.add("out"); body.classList.add("hub-out");
      setTimeout(() => {
        busy = false;
        if (mode === "hub" && window.stopLife) window.stopLife();   // the street freezes behind the hub
      }, OPEN_MS + 40);
    });
  };

  /* ---------- the phone button in the hub: back into your pocket ---------- */
  window.lifePutAway = function(){
    if (!life() || busy || mode !== "hub" || inMatch()) return;
    busy = true;
    if (typeof closeSheet === "function") closeSheet();
    if (window.resumeLife) window.resumeLife();            // the street is moving again behind the phone
    const p = lp();
    p.classList.add("going"); p.classList.remove("out");
    setTimeout(() => body.classList.remove("hub-out"), CLOSE_MS - 140);
    setTimeout(() => {
      const tab = document.getElementById("phoneTab");
      if (tab){ tab.classList.remove("catch"); void tab.offsetWidth; tab.classList.add("catch"); }
    }, CLOSE_MS - 200);
    setTimeout(() => {
      p.classList.remove("show", "going");
      mode = "street"; busy = false; hint();
      if (window.lifeRelock) window.lifeRelock();          // straight back to looking around
    }, CLOSE_MS + 20);
  };

  // the match hands back to the street with everything put away
  window.lifeReset = function(){
    mode = "street"; busy = false;
    const p = lp(); if (p) p.classList.remove("out", "show", "going");
    body.classList.remove("hub-out", "hand");
    if (handOpen()) closePhone();
  };

  /* ---------- keys ---------- */
  addEventListener("keydown", e => {
    if (!life() || inMatch()) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    // nothing comes up over a cinematic (intro.js): the camera is not yours until it hands it back
    if (window.lifeCine && window.lifeCine()){ if (k === "tab" || k === "q") e.preventDefault(); return; }
    if (k === "tab"){ e.preventDefault(); if (mode === "hub") return; window.lifeHand(); return; }
    if (k === "q"){ e.preventDefault(); mode === "hub" ? window.lifePutAway() : window.lifeHub(); return; }
    if (k === "escape" && mode === "hub"){
      const sh = document.getElementById("sheetRoot");
      if (sh && sh.classList.contains("open")) return;     // Esc closes the sheet first
      window.lifePutAway();
    }
  }, true);
})();
