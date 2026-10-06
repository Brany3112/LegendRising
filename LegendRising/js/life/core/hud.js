/* ============ LIFE core: the overlay ============
   Owner: WP-0A (frozen after Stage 0; its strings: WP-T2). Contract: DESIGN 1.2 (hud.js), 1.8 (text helpers), 2.2
   WP-0A (the multi-line prompt, the breath arc).
   The clock and the day, the line under them, the four meters, the prompt for what you are aiming at (with as many
   lines as the spot has to say), the short notes at the bottom of the screen, the cuts to black, and the breath arc
   by the crosshair. */
import {G, LIFE, FLAGS, FADE} from "./state.js";

/* ---------- words for numbers and times ---------- */
export const clockText = (m = LIFE.min) => fmtTime(m);
// "+1.2", a real minus sign for "−3", "0" (util.js fmtSigned)
export const signed = (x, dp = 0) => fmtSigned(x, dp);
// "10:00 AM to 4:00 PM" (util.js fmtRange)
export const range = (a, b) => fmtRange(a, b);

/* ---------- notes and fades ---------- */
export function note(t){
  const n = document.getElementById("lifeNote"); if (!n) return;
  n.textContent = t; n.classList.remove("on"); void n.offsetWidth; n.classList.add("on");
  clearTimeout(note._t); note._t = setTimeout(() => n.classList.remove("on"), Math.max(3600, t.length*55));
}
// a cut through black: the screen goes dark over half of ms, fn() runs behind it, and it comes back
export function fade(fn, ms = 620){
  const o = document.getElementById("lifeFade");
  FADE.boot = false;
  o.style.transition = `opacity ${ms/2}ms ease`; o.style.opacity = "1"; FADE.v = 1;
  setTimeout(() => { fn(); o.style.opacity = "0"; FADE.v = 0; }, ms/2 + 60);
}
/* a note that waits until nothing else is talking: no honour or milestone card open or queued, and no toast on screen
   for a moment (held toasts come one after another with a short gap between them). It gives up after two minutes, or
   if you've left the world or the zone it was about */
let noteLaterT = 0;
export function noteWhenClear(t){
  clearTimeout(noteLaterT);
  const zone = LIFE.zone, t0 = performance.now(); let quiet = 0;
  const busyNow = () => { const r = document.getElementById("tutRoot");
    return !!((r && r.classList.contains("on")) || (typeof HONOUR_QUEUE === "object" && HONOUR_QUEUE.length) || document.querySelector(".toast")); };
  const tick = () => {
    if (!LIFE.running || LIFE.zone !== zone || performance.now() - t0 > 120000) return;
    quiet = busyNow() ? 0 : quiet + 1;
    if (quiet >= 4) return note(t);
    noteLaterT = setTimeout(tick, 250);
  };
  noteLaterT = setTimeout(tick, 250);
}

/* ---------- the HUD ---------- */
// lastPrompt: the spot the prompt shows; ctxT: frames until the line under the clock is looked at again; meters: what
// each meter shows, so it is only written when that changes
export const HUD = {lastPrompt:null, ctxT:0, ctxText:null, ctxClr:0, lines:"", meters:{e:null, f:null, h:null, o:null}};
export function hudReset({prompt = true, ctx = true, meters = true} = {}){
  if (prompt) HUD.lastPrompt = null;
  if (ctx) HUD.ctxT = 0;
  if (meters) HUD.meters.e = HUD.meters.f = HUD.meters.h = HUD.meters.o = null;
}
function meter(k, id, v, low, word){
  const t = Math.round(clamp(v, 0, 100)) + "";
  if (t === HUD.meters[k]) return;
  const el = document.getElementById(id); if (!el) return;
  HUD.meters[k] = t; el.style.width = t + "%";
  const row = el.closest(".need"); if (row){ row.classList.toggle("low", low); const b = row.querySelector("b"); if (b) b.textContent = t; row.title = word; const w = row.querySelector("em"); if (w) w.textContent = word; }
}
// the lines a spot has beyond its label and hint (spot.lines, an array of strings, often a getter), under the hint
function promptLines(p, near){
  const raw = near.lines;
  if (!raw && !HUD.lines) return;                            // (nothing to show, nothing shown: the usual case, for free)
  const ls = Array.isArray(raw) ? raw.filter(x => x != null && x !== "").map(String) : [];
  const key = ls.join("\n");
  let el = p.querySelector(".lp-lines");
  if (!el){
    if (!ls.length) return;
    el = document.createElement("div"); el.className = "lp-lines";
    const hin = p.querySelector(".lp-hint"); if (hin) hin.after(el); else p.appendChild(el);
  }
  if (key === HUD.lines && el.childElementCount === ls.length && !el.hidden === !!ls.length) return;
  HUD.lines = key;
  el.textContent = "";
  for (const l of ls){ const s = document.createElement("span"); s.textContent = l; el.appendChild(s); }
  el.hidden = !ls.length;
}
export function hud(near){
  const s = G(); if (!s) return;
  const c = document.getElementById("lifeClock");
  if (c){ const t = clockText(); if (c.textContent !== t) c.textContent = t; }
  const dn = document.getElementById("lifeDay");
  if (dn){ const t = todayName(); if (dn.textContent !== t) dn.textContent = t; }
  // one line of context under the clock, refreshed now and then
  if ((HUD.ctxT -= 1) <= 0){
    HUD.ctxT = 30;
    const cx = document.getElementById("lifeCtx");
    if (cx){
      const f = todaysFixture(), so = sessionOn();
      const t = f ? `Match · ${clockText(fixtureSlot(f).min)}` : so ? "Team training" : trainingDay() && LIFE.min < SESSION.start ? `Training ${clockText(SESSION.start)}` : "";
      if (t !== HUD.ctxText){
        HUD.ctxText = t; clearTimeout(HUD.ctxClr);
        if (t){ cx.textContent = t; cx.classList.add("on"); cx.classList.toggle("match", !!f); }
        else {
          // the pill fades out with its words still in it; they go once it has gone (an empty pill never shows). Its
          // opacity is read back until it is out (a slow frame can hold a fade up), for four seconds at most
          cx.classList.remove("on");
          const t0 = performance.now();
          const clr = () => {
            if (HUD.ctxText) return;
            let op = 0; try { op = +getComputedStyle(cx).opacity || 0; } catch(e){}
            if (op > .02 && performance.now() - t0 < 4000){ HUD.ctxClr = setTimeout(clr, 120); return; }
            cx.textContent = ""; cx.classList.remove("match");
          };
          HUD.ctxClr = setTimeout(clr, 120);
        }
      }
    }
  }
  // the meters are only written when what they show has changed: no style work in a frame where nothing moved
  meter("e", "lifeEnergy", s.energy, s.energy < 25, energyLabel(s.energy));
  meter("h", "lifeHyd", num(s.hyd, 82), num(s.hyd, 82) < 25, hydLabel(num(s.hyd, 82)));
  meter("f", "lifeFatigue", s.fatigue, s.fatigue > 75, fatigueLabel(s.fatigue));
  meter("o", "lifeHyg", 100 - num(s.odor, 0), num(s.odor, 0) >= ODOR_SMELLY, odorLabel(num(s.odor, 0)));
  FEED.moneySync();
  const p = document.getElementById("lifePrompt");
  if (!p) return;
  if (!near || FLAGS.modal || FLAGS.busy){ if (HUD.lastPrompt !== null){ p.classList.remove("on"); HUD.lastPrompt = null; } return; }
  if (HUD.lastPrompt !== near){ p.classList.remove("on"); void p.offsetWidth; HUD.lastPrompt = near; }
  p.classList.add("on");
  const lab = p.querySelector(".lp-label"), hin = p.querySelector(".lp-hint");
  if (lab.textContent !== near.label) lab.textContent = near.label;
  const hint = (near.hint || "") + (near.long ? ` · hold E: ${near.long.label}` : "");
  if (hin.textContent !== hint) hin.textContent = hint;
  promptLines(p, near);
  p.classList.toggle("drag", near.kind === "drag");
  p.classList.toggle("mouse", near.kind === "pick" || near.kind === "place");
}

/* ---------- the breath arc ----------
   hud.breath(b, cap): short-term breath b (0 to 100) and how much of it you can have right now (cap), as a ring beside
   the crosshair: the bright arc is your breath, the faint one what you could get back. It shows only while you are
   short of breath, and fades out at full. */
const BR = {el:null, arc:null, cap:null, b:-1, c:-1, on:false};
const RING = 2*Math.PI*13;
function breathEl(){
  const root = document.getElementById("lifeRoot"); if (!root) return null;
  const el = document.createElement("div");
  el.className = "lf-breath"; el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:absolute;left:50%;top:50%;width:32px;height:32px;margin:-16px 0 0 22px;pointer-events:none;opacity:0;transition:opacity .35s ease;z-index:3";
  el.innerHTML = `<svg viewBox="0 0 32 32" width="32" height="32" style="transform:rotate(-90deg)">
    <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3"/>
    <circle class="br-cap" cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3" stroke-dasharray="0 ${RING}"/>
    <circle class="br-arc" cx="16" cy="16" r="13" fill="none" stroke="#c8f060" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 ${RING}"/></svg>`;
  root.appendChild(el);
  BR.el = el; BR.arc = el.querySelector(".br-arc"); BR.cap = el.querySelector(".br-cap");
  return el;
}
hud.breath = function(b, cap = 100){
  b = clamp(+b || 0, 0, 100); cap = clamp(cap == null ? 100 : +cap, 0, 100);
  const show = b < cap - .5;
  if (!BR.el){ if (!show) return; if (!breathEl()) return; }
  if (show !== BR.on){ BR.on = show; BR.el.style.opacity = show ? "1" : "0"; }
  if (!show) return;
  const bb = Math.round(b*2)/2, cc = Math.round(cap*2)/2;
  if (bb !== BR.b){ BR.b = bb; BR.arc.setAttribute("stroke-dasharray", `${(RING*bb/100).toFixed(2)} ${RING}`); BR.arc.setAttribute("stroke", bb < 20 ? "#ff8a5c" : "#c8f060"); }
  if (cc !== BR.c){ BR.c = cc; BR.cap.setAttribute("stroke-dasharray", `${(RING*cc/100).toFixed(2)} ${RING}`); }
};
