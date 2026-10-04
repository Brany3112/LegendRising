"use strict";
/* ============ UTIL ============ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd = (a,b) => a + Math.random()*(b-a);
const ri = (a,b) => Math.floor(rnd(a,b+1));
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function poisson(l){const L=Math.exp(-l);let k=0,p=1;do{k++;p*=Math.random();}while(p>L);return k-1;}
function ord(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
function wpick(items, w){ let t = 0; for (const x of items) t += w(x); let r = Math.random()*t; for (const x of items){ r -= w(x); if (r <= 0) return x; } return items[items.length-1]; }
const pad5 = n => String(Math.max(0, Math.round(n))).padStart(5, "0");
function fmt(n){ return Math.round(n).toLocaleString("en-GB"); }
function eur(n){
  n = Math.round(n); const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e6) return `${s}€${(a/1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${s}€${Math.round(a/1e3)}k`;
  return `${s}€${a.toLocaleString("en-GB")}`;
}
// the exact figure, for the one place money is the headline number rather than a chip
// always short, for tight columns where €42k must not sit next to €8,000
function eurK(n){
  n = Math.round(n); const a = Math.abs(n), sg = n < 0 ? "−" : "";
  if (a >= 1e6) return `${sg}€${(a/1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sg}€${Math.round(a/1e3)}k`;
  return `${sg}€${a}`;
}
function eurFull(n){ n = Math.round(n); return Math.abs(n) >= 1e7 ? eur(n) : `${n < 0 ? "−" : ""}€${fmt(Math.abs(n))}`; }
function toast(msg, kind){
  const t = document.createElement("div"); t.className = "toast" + (kind ? " " + kind : ""); t.textContent = msg;
  document.body.appendChild(t); requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 400); }, 2800);
}

/* ============ BADGES ============
   Every club and league gets its own badge, drawn from its name: the shape, the device inside it and the
   initials are all picked by a stable hash, so a club always looks the same. */
const BADGE_SHAPES = ["shield", "round", "crest", "pennant", "hex"];
function initialsOf(name){
  const skip = /^(FC|CF|CD|UD|SD|CS|CSM|ACS|AC|AS|US|SS|SC|SV|TSV|VfB|VfL|SpVgg|RC|AFC|Real|Atlético|Deportivo|Sporting|Racing|Unión|Union|Stade|Olympique|Virtus|Pro|Unione|Hansa|Fortuna|Eintracht|\d+)$/i;
  const all = String(name).split(/[\s·.]+/).filter(Boolean);
  const words = all.filter(w => !skip.test(w));
  const src = words.length ? words : all;
  const keep = t => t.replace(/[^A-Za-zÀ-ÿĂÂÎȘȚăâîșț]/g, "");
  let out = keep(src.map(w => w[0]).join("")).toUpperCase();
  if (out.length < 2){
    const longest = src.slice().sort((a, b) => b.length - a.length)[0] || String(name);
    out = keep(longest).slice(0, 2).toUpperCase();
  }
  return out.slice(0, 3);
}
function badgePath(shape){
  switch (shape){
    case "round":   return "M32 2a30 30 0 1 1 0 60a30 30 0 1 1 0-60z";
    case "crest":   return "M6 6h52v26c0 16-12 24-26 30C18 56 6 48 6 32z";
    case "pennant": return "M8 4h48v40L32 60 8 44z";
    case "hex":     return "M32 2 58 17v30L32 62 6 47V17z";
    default:        return "M7 5h50v28c0 15-11 24-25 30C18 57 7 48 7 33z";   // shield
  }
}
// the device inside the badge — a stripe, a chevron, a star and so on
function badgeDevice(kind, a, b){
  switch (kind){
    case 0: return `<rect x="26" y="4" width="12" height="56" fill="${b}" opacity=".85"/>`;
    case 1: return `<path d="M6 26h52v9H6z" fill="${b}" opacity=".85"/>`;
    case 2: return `<path d="M32 16 40 34 32 30 24 34z" fill="${b}"/><circle cx="32" cy="42" r="5" fill="${b}" opacity=".8"/>`;
    case 3: return `<path d="M8 8 32 34 56 8" stroke="${b}" stroke-width="8" fill="none" opacity=".85"/>`;
    case 4: return `<circle cx="32" cy="30" r="13" fill="none" stroke="${b}" stroke-width="5" opacity=".9"/>`;
    case 5: return `<path d="M32 14l4.2 8.8 9.8 1.3-7.2 6.7 1.9 9.6L32 35.8 23.3 40.4l1.9-9.6L18 24.1l9.8-1.3z" fill="${b}"/>`;
    default: return `<path d="M6 6h26v26H6zM32 32h26v26H32z" fill="${b}" opacity=".5"/>`;
  }
}
function badgeSVG(name, size, kind){
  const [a, b] = kitOf(name);
  const h = hash(name + "|" + (kind || "club"));
  const shape = BADGE_SHAPES[Math.floor(h*BADGE_SHAPES.length) % BADGE_SHAPES.length];
  const dev = Math.floor(h*97) % 7;
  const ini = initialsOf(name);
  const id = "bg" + Math.floor(h*1e9).toString(36);
  const fs = ini.length > 2 ? 19 : 24;
  return `<svg class="crest-svg" viewBox="0 0 64 68" width="${size || 26}" height="${Math.round((size || 26)*68/64)}" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${badgePath(shape)}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#000000" stop-opacity=".25"/></linearGradient></defs>
    <g clip-path="url(#${id})"><rect x="0" y="0" width="64" height="68" fill="${a}"/>${badgeDevice(dev, a, b)}<rect x="0" y="0" width="64" height="68" fill="url(#${id}g)"/></g>
    <path d="${badgePath(shape)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
    <text x="32" y="${shape === "pennant" ? 32 : 36}" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="${fs}"
      fill="#fff" stroke="rgba(0,0,0,.45)" stroke-width="3" paint-order="stroke">${esc(ini)}</text></svg>`;
}
function kitOf(name){ if (typeof KITS !== "undefined" && KITS[name]) return KITS[name]; const h = Math.floor(hash(name)*360); return [`hsl(${h}, 62%, 42%)`, `hsl(${(h+180)%360}, 55%, 92%)`]; }
function rgbOf(c){ const el = document.createElement("canvas").getContext ? null : null; void el;
  const m = /^#([0-9a-f]{6})$/i.exec(c); if (m){ const v = parseInt(m[1],16); return [(v>>16)/255, (v>>8&255)/255, (v&255)/255]; }
  const h = /hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/.exec(c); if (h){ const H = +h[1]/360, S_ = +h[2]/100, L = +h[3]/100;
    const q = L < .5 ? L*(1+S_) : L + S_ - L*S_, p = 2*L - q, f = t => { t = (t+1)%1; return t < 1/6 ? p+(q-p)*6*t : t < .5 ? q : t < 2/3 ? p+(q-p)*(2/3-t)*6 : p; };
    return [f(H+1/3), f(H), f(H-1/3)]; }
  return null;
}
function awayKit(homeName, oppName){
  const a = kitOf(homeName), b = kitOf(oppName), x = rgbOf(a[0]), y = rgbOf(b[0]);
  if (x && y && Math.hypot(x[0]-y[0], x[1]-y[1], x[2]-y[2]) < .38) return [b[1], b[0]];
  return b;
}
/* ============ IN-PLACE UPDATES ============
   Menus are re-drawn by patching the existing page instead of rebuilding it: only text, attributes and nodes that
   actually changed are touched. Same element = no replayed animation, no scroll jump, no flicker. */
function morph(el, html){
  const t = document.createElement("template"); t.innerHTML = html;
  patchKids(el, t.content);
}
function patchKids(a, b){
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++){
    const x = an[i], y = bn[i];
    if (!x){ a.appendChild(y); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName){ a.replaceChild(y, x); continue; }
    if (x.nodeType !== 1){ if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === "INPUT" || x.tagName === "TEXTAREA" || x.tagName === "SELECT"){
      if (x.tagName === "SELECT") patchKids(x, y);
      if (document.activeElement !== x && x.value !== y.value) x.value = y.value;
      continue;
    }
    patchKids(x, y);
  }
  for (let i = an.length - 1; i >= bn.length; i--) if (an[i].parentNode === a) a.removeChild(an[i]);
}
/* ============ GRAPHICS QUALITY ============
   Auto: weak machines (≤4 cores or ≤4 GB) start in Low, and a match that runs slow switches to Low by itself.
   Low = 1x canvas resolution, no background animations or glows, fewer particles. */
const GFX = {mode:(() => { try{ return localStorage.getItem("freyaFootball.gfx") || "auto"; }catch(e){ return "auto"; } })(), low:false, autoLow:false};
function gfxApply(){
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  GFX.low = GFX.mode === "low" || (GFX.mode === "auto" && (weak || GFX.autoLow));
  document.body.classList.toggle("low", GFX.low);
  if (typeof resize === "function") resize();
}
function setGfx(m){ GFX.mode = m; GFX.autoLow = false; try{ localStorage.setItem("freyaFootball.gfx", m); }catch(e){} gfxApply(); }
function gfxSeg(onclickFn){ return `<div class="seg">${[["auto","Auto"],["high","High"],["low","Low"]].map(([k,l]) => `<button aria-pressed="${GFX.mode === k}" onclick="${onclickFn}('${k}')">${l}</button>`).join("")}</div>${GFX.mode === "auto" ? `<div class="muted small">Currently: ${GFX.low ? "Low" : "High"}</div>` : ""}`; }

// golden star rating, halves allowed
function starsHTML(v){
  let h = "";
  for (let i = 1; i <= 5; i++) h += v >= i ? `<span class="st full">★</span>` : v >= i - .5 ? `<span class="st half">★</span>` : `<span class="st">★</span>`;
  return `<span class="starrow" title="${v} / 5">${h}</span>`;
}
