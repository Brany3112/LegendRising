"use strict";
/* ============ ODOMETER ============
   A rolling number, like a car's trip meter. Lower digits spin faster than higher ones because each
   column is driven by the value itself (units = v mod 10, tens = v/10 mod 10, and so on), so the
   whole thing rolls continuously instead of snapping from one number to the next. */

const ODO_D = 5;                       // digits shown, matching the reputation counters in the top bar
function odoHTML(value, delta, label){
  const v = Math.max(0, Math.round(value)), dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const cols = Array.from({length:ODO_D}, (_, i) =>
    `<span class="odo-col"><span class="odo-strip${i === ODO_D-1 ? " units" : " snap"}" style="--d:${Math.floor(v/Math.pow(10, ODO_D-1-i))%10}">${
      "01234567890".split("").map(n => `<i>${n}</i>`).join("")}</span></span>`).join("");
  return `<div class="odo ${dir}" data-to="${v}" data-delta="${Math.round(delta)}">
    <span class="odo-k">${esc(label)}</span>
    <span class="odo-n">${cols}</span>
    <span class="odo-delta">${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(Math.round(delta)) || 0}</span>
  </div>`;
}
// rolls every odometer inside `root` from its starting value up (or down) to its final one
function odoRun(root, ms){
  const list = (root || document).querySelectorAll(".odo:not([data-done])");
  for (const el of list){
    el.dataset.done = "1";
    const to = +el.dataset.to || 0, delta = +el.dataset.delta || 0, from = Math.max(0, to - delta);
    const strips = el.querySelectorAll(".odo-strip");
    const dur = ms || (600 + Math.min(900, Math.abs(delta)*26));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to){ odoSet(strips, to); el.classList.add("settled"); continue; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0)/dur);
      const e = 1 - Math.pow(1 - k, 3);                 // ease out: quick off the mark, gentle stop
      odoSet(strips, from + (to - from)*e);
      if (k < 1) requestAnimationFrame(step);
      else { odoSet(strips, to); el.classList.add("settled"); }
    };
    requestAnimationFrame(step);
  }
}
function odoSet(strips, v){
  v = Math.max(0, v);
  strips.forEach((s, i) => {
    const place = Math.pow(10, ODO_D - 1 - i);
    // the units column rolls continuously; the ones above it step from digit to digit and glide
    // there via CSS, so at rest every column sits exactly on its number
    const d = i === ODO_D - 1 ? v%10 : Math.floor(v/place)%10;
    s.style.setProperty("--d", i === ODO_D - 1 ? d.toFixed(3) : String(d));
  });
}
