/* ============ LIFE: the compass ============
   A strip across the top of the screen: the eight points going by as you turn, and markers for the places that
   matter — HOME, JOB, the BUS STATION, the SHOP, the FURNITURE STORE, the GYM, the BARBER, the TRAINING CENTER — at
   the bearing they lie at, with how far. Only places in the area you are in (W.places, which every zone fills as it
   is built); a marker fades in as it comes round into view and out as it leaves, fades back when you are right at
   it, and is gone while you are inside the place. Your job is JOB wherever it is: in another area, the bus station
   carries it. North is −z. */
import {W} from "./build.js";

const SPAN = 150;                                  // degrees across the strip, edge to edge
const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const LABEL = {home:"HOME", job:"JOB", bus:"BUS STATION", shop:"SHOP", furniture:"FURNITURE STORE", gym:"GYM", barber:"BARBER",
  train:"TRAINING CENTER", club:"CLUBHOUSE", goal:"OBJECTIVE"};
const SVG = p => `<svg viewBox="0 0 16 16" aria-hidden="true">${p}</svg>`;
const ICON = {
  home:SVG('<path d="M8 1.6 1.4 7.4h2v6.8h3.8V10h1.6v4.2h3.8V7.4h2z"/>'),
  job:SVG('<path d="M6 2.4h4a1 1 0 0 1 1 1V5h3a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3V3.4a1 1 0 0 1 1-1zM6.6 5h2.8V3.8H6.6z"/>'),
  bus:SVG('<path d="M3.4 1.6h9.2a1.6 1.6 0 0 1 1.6 1.6v9.4h-.9v1.6h-2v-1.6H4.7v1.6h-2v-1.6h-.9V3.2a1.6 1.6 0 0 1 1.6-1.6zM3.3 3.6v4h9.4v-4zm.9 6.2a.95.95 0 1 0 0 .01zm7.6 0a.95.95 0 1 0 0 .01z"/>'),
  shop:SVG('<path d="M1 2h2.2l.5 1.6h10.8l-1.6 5.6H5.2l.4 1.4h7.8v1.4H4.6L2.2 3.4H1zm4.4 11.2a1.2 1.2 0 1 0 0 .01zm6.4 0a1.2 1.2 0 1 0 0 .01z"/>'),
  furniture:SVG('<path d="M3 5.4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2V7a1.8 1.8 0 0 1 2 1.8v3.6h-1.4v1.4h-1.4v-1.4H3.8v1.4H2.4v-1.4H1V8.8A1.8 1.8 0 0 1 3 7zm1.6 4h6.8V8.8a1.8 1.8 0 0 1 .2-.8H4.4a1.8 1.8 0 0 1 .2.8z"/>'),
  gym:SVG('<path d="M1 6.6h1.2V5h2v6H2.2V9.4H1zm4.2-2.2h1.6v2.8h2.4V4.4h1.6v7.2H9.2V8.8H6.8v2.8H5.2zm6.6.6h2v1.6H15v2.8h-1.2V11h-2z"/>'),
  barber:SVG('<path d="M4.2 1.6a2.6 2.6 0 1 1-1.2 4.9l1.8 1.5-1.8 1.5a2.6 2.6 0 1 1 1.4 1.3L6 9.3l7.6 5.3 1-1L8 8l6.6-5.6-1-1L6 6.7 4.4 5.4A2.6 2.6 0 0 1 4.2 1.6zm0 1.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm0 7.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>'),
  train:SVG('<path d="M8 1.2a6.8 6.8 0 1 1 0 13.6A6.8 6.8 0 0 1 8 1.2zm0 3.1-2.2 1.6.8 2.6h2.8l.8-2.6zM3.4 6.6l-.9 2.6 1.6 2.2 1.4-.5-.1-2.6zm9.2 0L10.4 8.3l-.1 2.6 1.4.5 1.6-2.2z"/>'),
  club:SVG('<path d="M2 14V6.4L8 2l6 4.4V14h-4.4V9.6H6.4V14z"/>'),
  goal:SVG('<path d="M8 1 13.6 8 8 15 2.4 8z"/>')
};
let root = null, strip = null, layer = null, H = null, W0 = 0, pxDeg = 3.4, list = [], listT = 0;
const marks = new Map();                           // key → {el, a, row, x, txt}
const wrap = d => ((d + 540) % 360) - 180;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };

export function compassInit(h){
  H = h; root = document.getElementById("lifeCompass"); if (!root) return;
  strip = root.querySelector(".cp-strip"); layer = root.querySelector(".cp-marks");
  // the dial: ticks every 15°, the eight points, three turns long so it can slide either way
  let html = "";
  for (let d = -360; d <= 720; d += 15){
    const n = ((d % 360) + 360) % 360, pt = n % 45 === 0 ? POINTS[n/45] : null;
    html += pt ? `<span class="cp-pt${pt.length === 1 ? " main" : ""}" data-d="${d + 360}">${pt}</span>` : `<i class="cp-tk${n % 45 === 0 ? "" : " min"}" data-d="${d + 360}"></i>`;
  }
  strip.innerHTML = html;
  measure(); addEventListener("resize", measure);
}
// the strip's width in pixels decides how many to a degree; the dial is laid out in degrees and scaled to match
function measure(){
  if (!root) return;
  W0 = root.clientWidth || 520; pxDeg = W0/SPAN;
  for (const el of strip.children) el.style.left = (+el.dataset.d*pxDeg).toFixed(1) + "px";
}
// a new area: its markers are new ones, and fade in from nothing
export function compassReset(){
  for (const m of marks.values()) m.el.remove();
  marks.clear(); list = []; listT = 0;
}
// what to show, here and now: looked at again twice a second (your job can change; so can the objective)
function wanted(){
  const zone = H.zone(), job = typeof jobState === "function" ? jobState().id : null, jw = job && typeof JOB_WHERE === "object" ? JOB_WHERE[job] : null;
  const away = jw && jw.zone !== zone, out = [];
  for (const p of W.places){
    if (p.kind === "job"){ if (p.job === job) out.push({key:"job", kind:"job", x:p.x, z:p.z, b:p.b, sub:p.name}); continue; }
    if (!LABEL[p.kind]) continue;
    out.push({key:p.kind + ":" + p.name, kind:p.kind, x:p.x, z:p.z, b:p.b, sub:p.kind === "bus" && away ? `JOB · ${jw.zone === "town" ? PLACES.town : PLACES.city}` : p.name});
  }
  const g = typeof window.lifeGoal === "function" ? window.lifeGoal() : null;
  if (g && (g.zone || "home") === zone) out.push({key:"goal", kind:"goal", x:g.x, z:g.z, sub:""});
  return out;
}
export function compassStep(dt, P){
  if (!root || !H) return;
  // the dial turns with you: your bearing, clockwise from north (−z)
  const b = ((-P.yaw*180/Math.PI) % 360 + 360) % 360;
  strip.style.transform = `translateX(${(W0/2 - (b + 360)*pxDeg).toFixed(1)}px)`;
  if ((listT -= dt) <= 0){ listT = .5; list = wanted(); }
  const seen = new Set(), row0 = [];
  for (const q of list){
    seen.add(q.key);
    let m = marks.get(q.key);
    if (!m){
      const el = document.createElement("div"); el.className = `cp-mk k-${q.kind}`;
      el.innerHTML = `<i>${ICON[q.kind] || ICON.goal}</i><b>${LABEL[q.kind]}</b><span></span>`;
      layer.appendChild(el); m = {el, a:0, row:0, txt:"", sub:null}; marks.set(q.key, m);
    }
    const dx = q.x - P.x, dz = q.z - P.z, dist = Math.hypot(dx, dz);
    const rel = wrap(Math.atan2(dx, -dz)*180/Math.PI - b);
    const inside = q.b && P.x > q.b.x0 && P.x < q.b.x1 && P.z > q.b.z0 && P.z < q.b.z1;
    // in view (eased out over the strip's last 20°), dimmed when you are right there, gone when you are inside
    const want = inside ? 0 : (1 - smooth(SPAN/2 - 22, SPAN/2 - 4, Math.abs(rel)))*(dist < 6 ? .35 + .65*smooth(2, 6, dist) : 1);
    m.a += (want - m.a)*Math.min(1, dt*5);
    m.x = W0/2 + Math.max(-SPAN/2, Math.min(SPAN/2, rel))*pxDeg; m.dist = dist;
    const txt = dist < 1000 ? `${Math.round(dist)} m` : `${(dist/1000).toFixed(1)} km`;
    if (txt !== m.txt){ m.txt = txt; m.el.lastChild.textContent = txt; }
    if (q.sub !== m.sub){ m.sub = q.sub; m.el.title = q.sub || ""; m.el.classList.toggle("sub", !!q.sub && q.kind === "bus" && q.sub.startsWith("JOB")); }
    if (m.a > .02) row0.push(m);
  }
  for (const [k, m] of marks){ if (!seen.has(k)){ m.a += (0 - m.a)*Math.min(1, dt*5); if (m.a < .02){ m.el.remove(); marks.delete(k); continue; } row0.push(m); } }
  // markers that would sit on top of each other: the nearer one keeps the top row, the other drops a row
  row0.sort((a, c) => a.dist - c.dist);
  const placed = [];
  for (const m of row0){
    let row = 0;
    while (row < 2 && placed.some(o => o.row === row && Math.abs(o.x - m.x) < 64)) row++;
    m.row = row; placed.push(m);
  }
  for (const m of marks.values()){
    const vis = m.a > .02;
    m.el.style.opacity = vis ? m.a.toFixed(3) : "0";
    if (vis) m.el.style.transform = `translate(${(m.x).toFixed(1)}px, ${m.row*30}px) translateX(-50%)`;
  }
}
