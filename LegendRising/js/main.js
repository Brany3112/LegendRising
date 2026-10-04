"use strict";
/* ============ BOOT ============ */
function fitPhone(){
  const h = $("#phoneHolder"); if (!h) return;
  const ph = h.querySelector(".phone"); if (!ph) return;
  const land = ph.classList.contains("land"), w = ph.classList.contains("keypad") ? 290 : land ? 840 : 380, ht = ph.classList.contains("keypad") ? 610 : land ? 470 : 790;
  const s = Math.min(1, (innerHeight - 24)/ht, (innerWidth - 16)/w);
  h.style.setProperty("--ps", s.toFixed(3)); h.style.setProperty("--pw", w*s + "px");
}
const _renderPhone = renderPhone; renderPhone = function(){ _renderPhone(); fitPhone(); };
const _renderSmart = renderSmart; renderSmart = function(a){ _renderSmart(a); fitPhone(); };
window.addEventListener("resize", fitPhone);
gfxApply();
mountPhone();
screenTitle();
