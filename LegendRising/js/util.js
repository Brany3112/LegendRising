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
// the device inside the badge: a stripe, a chevron, a star and so on
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
   One setting with four choices: Auto, Low, Medium or High (DESIGN 1.4.4). The tier picks one preset from GFX_PRESETS,
   the table every 3D module reads at use time (GFX.P) or hears about through gfxOn. Auto picks the tier for this computer
   from the name of its graphics chip, its CPU cores and its memory (gfxDetect, worked out once and remembered);
   gfxStepDown is there for the 3D world's step down (WP-A) to take it one tier lower for the session when the game
   keeps running slowly, and a slow 2D match asks for Low (GFX.autoLow). gfxApply() resolves the tier, sets GFX.P, GFX.low and the body classes, then calls every
   subscriber with (P, prevP, reason).
   GFX.low (true on Low) is what the 2D match and some 3D readers still check. Until the world applies whole presets
   (quality.js applyPreset), the 3D readers already honour Medium where it is one line: materials (build.js mat: Lambert
   for plain, printed and glowing surfaces), the pixel ratio cap (quality.js resize), cloud octaves, reflection bakes,
   shadow redraws and the number of real point lights (sky.js). Graphics live in localStorage only, never in a save. */
const GFX_TIERS = ["low", "medium", "high"];
const GFX_LABEL = {auto:"Auto", low:"Low", medium:"Medium", high:"High"};
// Every field, per tier (DESIGN 1.4.4). Distances in metres, rates in Hz, times in seconds.
//   antialias               MSAA, fixed when the renderer is created (changing it recreates the renderer)
//   pixelBudget, maxRatio   render pixels: ratio = clamp(sqrt(pixelBudget/(cssW*cssH)), 0.5, min(maxRatio, dpr))*Q.scale
//   qMin                    the floor adaptive quality may lower Q.scale to
//   shadow.life/.stadium    null = no shadow map (blob shadows); otherwise the filter, map size, half extent, snap grid
//                           and the most redraws per second; in the stadium "statics" (drawn once per half) or "follow"
//                           (a box following the camera, humans casting)
//   nReal                   real point lights in the life zones and in the stadium
//   material                "lambert" everywhere, "mixed" (Lambert for plain and textured surfaces, Standard for the
//                           standardKinds) or "standard" everywhere; skylineBasic draws the far skyline unlit
//   env                     environment map: null, or a PMREM of `size`, baked on zone entry and every `everyH` game hours
//   skyOct, dome            cloud octaves (0: the gradient, sun, moon, stars and one cloud band) and dome segments
//   fog.life, fog.stadium   near and far; in the life zones near + envNear*env and far + envFar*env, env being the
//                           openness the sky already works out
//   camFar, camFarPad       camera far plane: camFar when set, otherwise fog far + camFarPad
//   drawDist, drawPad       draw distance: drawDist when set (Infinity: no limit), otherwise fog far + drawPad
//   detailDist              small static pieces are drawn within this distance
//   lod                     human LOD: full detail within near, from behind within back, the far mesh (LOD3) beyond lod3
//   shirtNumDist            shirt numbers are drawn within this distance
//   animNear, animMid       animation tiers by distance; midDiv and farDiv divide the update rate beyond them
//   hiddenHz, staticHz      update rates for bodies out of view and for idle ones
//   groundLiteBeyond        beyond this distance the second foot-grounding pass is skipped
//   peds                    pedestrians at home and in town
//   crowd                   "blocks": one textured quad strip per seating block (at most one draw per stand section);
//                           "billboards": that many instanced billboards plus strips
//   coverEvery              seconds between the camera's cover rays
//   hudBlur                 backdrop blur on the HUD: "none", "modals" or "full"
//   anisotropy, texScale    texture anisotropy; canvas textures wider than texScaleOver are drawn at texScale
//   mip                     how mipmapped textures are read from afar: "linear" (two levels blended) or "nearest" (one)
//   haloMax                 light halos are drawn within this distance (Infinity: always)
const GFX_PRESETS = (() => {
  const freeze = o => { if (o && typeof o === "object" && !Object.isFrozen(o)){ Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
  return freeze({
    low:{tier:"low", label:"Low", antialias:false, pixelBudget:0.92e6, maxRatio:1.0, qMin:0.8,
      shadow:{life:null, stadium:null}, nReal:{life:2, stadium:0},
      material:"lambert", standardKinds:[], skylineBasic:true, env:null, skyOct:0, dome:[16, 8],
      fog:{life:{near:35, far:150, envNear:0, envFar:0}, stadium:{near:110, far:240}},
      camFar:0, camFarPad:30, drawDist:0, drawPad:20, detailDist:35,
      lod:{near:8, back:7, lod3:30}, shirtNumDist:6, animNear:12, animMid:35, midDiv:3, farDiv:6, hiddenHz:5, staticHz:5,
      groundLiteBeyond:10, peds:{home:3, town:3}, crowd:{kind:"blocks", count:0, strips:false},
      coverEvery:0.25, hudBlur:"none", anisotropy:1, mip:"nearest", texScale:0.5, texScaleOver:1024, haloMax:120},
    medium:{tier:"medium", label:"Medium", antialias:true, pixelBudget:1.6e6, maxRatio:1.25, qMin:0.7,
      shadow:{life:{type:"pcf", size:2048, half:26, grid:6, hz:2}, stadium:{mode:"statics", type:"pcf", size:2048}},
      nReal:{life:4, stadium:0},
      material:"mixed", standardKinds:["gloss", "metal", "paint", "glass", "screen", "human"], skylineBasic:false,
      env:{size:32, everyH:1}, skyOct:3, dome:[24, 12],
      fog:{life:{near:50, far:180, envNear:50, envFar:130}, stadium:{near:150, far:380}},
      camFar:0, camFarPad:40, drawDist:0, drawPad:30, detailDist:60,
      lod:{near:12, back:11, lod3:45}, shirtNumDist:8, animNear:20, animMid:50, midDiv:2, farDiv:4, hiddenHz:8, staticHz:10,
      groundLiteBeyond:20, peds:{home:5, town:4}, crowd:{kind:"billboards", count:4000, strips:true},
      coverEvery:0.15, hudBlur:"modals", anisotropy:2, mip:"linear", texScale:1, texScaleOver:1024, haloMax:Infinity},
    high:{tier:"high", label:"High", antialias:true, pixelBudget:3.7e6, maxRatio:1.5, qMin:0.6,
      shadow:{life:{type:"pcf", size:2048, half:30, grid:4, hz:5}, stadium:{mode:"follow", type:"pcf", size:2048, box:60, humans:true, hz:15}},
      nReal:{life:8, stadium:2},
      material:"standard", standardKinds:[], skylineBasic:false, env:{size:64, everyH:0.15}, skyOct:5, dome:[32, 18],
      fog:{life:{near:50, far:180, envNear:50, envFar:130}, stadium:{near:170, far:450}},
      camFar:600, camFarPad:0, drawDist:Infinity, drawPad:0, detailDist:90,
      lod:{near:15, back:13.5, lod3:60}, shirtNumDist:9.5, animNear:25, animMid:70, midDiv:2, farDiv:3, hiddenHz:10, staticHz:15,
      groundLiteBeyond:30, peds:{home:6, town:5}, crowd:{kind:"billboards", count:8000, strips:true},
      coverEvery:0.1, hudBlur:"full", anisotropy:4, mip:"linear", texScale:1, texScaleOver:1024, haloMax:Infinity}
  });
})();
const GFX_KEY = "freyaFootball.gfx", GFX_AUTO_KEY = "freyaFootball.gfxAuto";
// mode: what the player chose. tier: what that resolves to. low: tier === "low" (what the older readers check).
// autoLow: the 2D match asked for Low because it ran slowly. drop: how many tiers Auto stepped down this session.
// detected: Auto's pick for this computer, {tier, base, gpu, ver, measured, cores, mem}.
const GFX = {mode:(() => { try{ const m = localStorage.getItem(GFX_KEY); return GFX_LABEL[m] ? m : "auto"; }catch(e){ return "auto"; } })(),
  tier:"high", low:false, autoLow:false, drop:0, P:GFX_PRESETS.high, subs:[], detected:null};
function gfxPreset(){ return GFX.P; }
// fn(P, prevP, reason) after every gfxApply; returns a function that unsubscribes it
function gfxOn(fn){
  if (typeof fn === "function" && !GFX.subs.includes(fn)) GFX.subs.push(fn);
  return () => { const i = GFX.subs.indexOf(fn); if (i >= 0) GFX.subs.splice(i, 1); };
}
// the tier the current choice means: the chosen one, or under Auto the detected one less any steps down this session
function gfxTier(){
  if (GFX.mode !== "auto") return GFX.mode;
  if (GFX.autoLow) return "low";
  const d = GFX.detected || gfxDetect();
  const i = GFX_TIERS.indexOf(d.tier);
  return GFX_TIERS[Math.max(0, (i < 0 ? 1 : i) - (GFX.drop | 0))];
}
function gfxApply(reason = "user"){
  const prevP = GFX.P;
  GFX.tier = gfxTier();
  GFX.P = GFX_PRESETS[GFX.tier];
  GFX.low = GFX.tier === "low";
  const b = document.body;
  if (b){ for (const t of GFX_TIERS) b.classList.toggle("gfx-" + t, t === GFX.tier); b.classList.toggle("low", GFX.low); }
  if (typeof resize === "function") resize();          // the 2D match canvas, while the 2D engine is still here
  for (const fn of GFX.subs.slice()){ try{ fn(GFX.P, prevP, reason); }catch(e){ console.error("graphics subscriber failed", e); } }
  return GFX.P;
}
function setGfx(m){
  GFX.mode = GFX_LABEL[m] ? m : "auto"; GFX.autoLow = false; GFX.drop = 0;
  try{ localStorage.setItem(GFX_KEY, GFX.mode); }catch(e){}
  gfxApply("user");
}
// Under Auto, one tier down for the rest of the session because the game kept running slowly, and says so. Returns the
// new tier, or null when the player chose a tier themselves or Auto is already on Low.
function gfxStepDown(reason = "slow"){
  if (GFX.mode !== "auto" || GFX.tier === "low") return null;
  GFX.drop = (GFX.drop | 0) + 1;
  gfxApply(reason);
  toast(`Graphics lowered to ${GFX_LABEL[GFX.tier]} to keep things smooth. You can change this in Settings.`, "gold");
  return GFX.tier;
}
// which tier a graphics chip suggests, from the renderer string WebGL reports (first match wins; unknown means Medium)
const GFX_GPU_TIERS = [
  [/swiftshader|llvmpipe|softpipe|software|basic render/i, "low"],
  [/apple m\d/i, "high"],
  [/geforce|\brtx\b|\bgtx\b|quadro|radeon\s*(?:\(tm\)\s*)?(?:rx|pro)\b|\barc\s*(?:\(tm\)\s*)?a[5-7]/i, "high"],
  [/iris|radeon\s*(?:\(tm\)\s*)?vega\s*[3-8]\b|radeon\s*(?:\(tm\)\s*)?graphics|apple gpu|adreno\s*(?:\(tm\)\s*)?7\d\d/i, "medium"],
  [/\bu?hd graphics|intel.*\bu?hd\b|mali|adreno\s*(?:\(tm\)\s*)?[3-6]\d\d|powervr/i, "low"]
];
function gfxGpuTier(gpu){
  for (const [re, t] of GFX_GPU_TIERS) if (re.test(gpu || "")) return t;
  return "medium";
}
// the renderer string, read from a throwaway WebGL context that is released straight away
function gfxGpu(){
  try{
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return "";
    let r = String(gl.getParameter(gl.RENDERER) || "");
    if (!r || /^(webkit|mozilla)\b|^webgl/i.test(r)){            // a masked name: ask for the real one
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) r = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || r);
    }
    const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    return r;
  }catch(e){ return ""; }
}
// a renderer string as a person would write it: "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11
// vs_5_0 ps_5_0, D3D11)" is "Intel UHD Graphics 620"
function gfxGpuName(gpu){
  let s = String(gpu || "").trim();
  if (!s) return "";
  if (/swiftshader/i.test(s)) return "SwiftShader, software";
  if (/llvmpipe|softpipe/i.test(s)) return "llvmpipe, software";
  const a = /^ANGLE \((.*)\)$/.exec(s);
  if (a){ const parts = a[1].split(/,\s+/); s = parts.length > 1 ? parts[1] : parts[0]; }
  s = s.replace(/ANGLE Metal Renderer:\s*/i, "").replace(/\((?:R|TM|C)\)/gi, "").replace(/\s*\(0x[0-9a-f]+\)/gi, "")
    .replace(/\s+Direct3D\S*.*$/i, "").replace(/\s+OpenGL (?:Engine|ES|\d).*$/i, "").replace(/\/PCIe.*$/i, "").replace(/\s+/g, " ").trim();
  return s.length > 48 ? s.slice(0, 47).trim() + "…" : s;
}
// Auto's pick for this computer: the chip's tier, at most Medium with 4 cores or 4 GB or fewer, Low with 2 cores or
// fewer. Worked out once and remembered in localStorage (asked again only if the cores or the memory change).
// opts.fresh asks again; opts.measured ({tier, ms}) records what the first measured seconds of play found, which then
// decides.
function gfxDetect(opts = {}){
  const cores = navigator.hardwareConcurrency || 0, mem = navigator.deviceMemory || 0;
  let d = null;
  if (!opts.fresh){
    try{ d = JSON.parse(localStorage.getItem(GFX_AUTO_KEY) || "null"); }catch(e){ d = null; }
    if (!d || d.ver !== 1 || !GFX_TIERS.includes(d.tier) || d.cores !== cores || d.mem !== mem) d = null;
  }
  if (!d){
    const gpu = gfxGpu();
    let i = GFX_TIERS.indexOf(gfxGpuTier(gpu));
    if (cores && cores <= 2) i = 0;
    else if ((cores && cores <= 4) || (mem && mem <= 4)) i = Math.min(i, 1);
    d = {tier:GFX_TIERS[i], base:GFX_TIERS[i], gpu, ver:1, measured:null, cores, mem};
  }
  if (opts.measured && GFX_TIERS.includes(opts.measured.tier)){
    d.measured = {tier:opts.measured.tier, ms:Number(opts.measured.ms) || 0};
    d.tier = opts.measured.tier;
  }
  GFX.detected = d;
  try{ localStorage.setItem(GFX_AUTO_KEY, JSON.stringify(d)); }catch(e){}
  return d;
}
// What the Settings line under Auto promises (DESIGN 1.4.4), and it must stay true: the 3D world steps down a tier by
// itself after 8 slow seconds at the lowest render scale (quality.js through gfxStepDown, with its toast), and a slow 2D
// match still asks for Low (GFX.autoLow) until that engine goes.
const GFX_AUTO_NOTE = "Auto picks a level for this computer, and steps down by itself if the game keeps running slowly.";
// the Graphics control for a settings screen; fnName is the handler each button calls with its mode
function gfxSeg(fnName){
  const btns = ["auto", ...GFX_TIERS].map(k => `<button aria-pressed="${GFX.mode === k}" onclick="${fnName}('${k}')">${GFX_LABEL[k]}</button>`).join("");
  if (GFX.mode !== "auto") return `<div class="seg">${btns}</div>`;
  const gpu = gfxGpuName(GFX.detected && GFX.detected.gpu);
  return `<div class="seg">${btns}</div><div class="muted small">Currently: ${GFX_LABEL[GFX.tier]}${gpu ? ` (${esc(gpu)})` : ""}</div>
    <div class="muted small">${GFX_AUTO_NOTE}</div>`;
}

/* ============ WORDS AND NUMBERS IN COPY ============
   Copy never spells out an hour, a duration or a signed amount by hand: it asks these, with the constant it describes,
   so the text always says what the game does (DESIGN 1.8). No em dash in anything a player reads. */
const EMPTY_CELL = "–";                      // an empty table cell (an en dash)
/* words saved or sent by older builds, which still carry the long dash (DESIGN 1.7, 3.10): a dash standing alone for
   "nothing" becomes EMPTY_CELL, and any other one, with the spaces round it, becomes rep: ": " in a name or a title,
   ". " between two sentences (the word after it then starts with a capital). The one rule for a career's own text
   (career.js textMigrate) and for board rows and account saves from other players (online.js boardRow) */
const EM_DASH = String.fromCharCode(0x2014);
const EM_SPACED = new RegExp(`\\s*${EM_DASH}\\s*(\\p{Ll})?`, "gu");
function undash(t, rep = ": "){
  if (typeof t !== "string" || t.indexOf(EM_DASH) < 0) return t;
  if (t.trim() === EM_DASH) return EMPTY_CELL;
  const cap = /[.!?]\s*$/.test(rep);
  const r = t.replace(EM_SPACED, (m, c) => rep + (c ? (cap ? c.toUpperCase() : c) : ""));
  return /\s$/.test(t) ? r : r.replace(/\s+$/, "");
}
const SAVE_CODE_LABEL = "Save game: copy code";
// 45 -> "45 minutes", 60 -> "1 hour", 150 -> "2 hours 30 minutes"
function fmtDur(mins){
  const m = Math.max(0, Math.round(Number(mins) || 0)), h = Math.floor(m/60), r = m % 60;
  const part = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!h) return part(r, "minute");
  return r ? `${part(h, "hour")} ${part(r, "minute")}` : part(h, "hour");
}
// minutes after midnight to "10:00 AM to 4:00 PM" (fmtTime, in daily.js, speaks twelve-hour time)
function fmtRange(a, b){ return `${fmtTime(a)} to ${fmtTime(b)}`; }
// 1.2 -> "+1.2", -3 -> "−3" (a real minus sign), 0 -> "0"; anything that rounds to nothing carries no sign
function fmtSigned(x, dp = 0){
  const v = Number(x);
  if (!Number.isFinite(v)) return (0).toFixed(dp);
  const s = Math.abs(v).toFixed(dp);
  return Number(s) === 0 ? s : (v < 0 ? "−" : "+") + s;
}

// golden star rating, halves allowed
function starsHTML(v){
  let h = "";
  for (let i = 1; i <= 5; i++) h += v >= i ? `<span class="st full">★</span>` : v >= i - .5 ? `<span class="st half">★</span>` : `<span class="st">★</span>`;
  return `<span class="starrow" title="${v} / 5">${h}</span>`;
}
