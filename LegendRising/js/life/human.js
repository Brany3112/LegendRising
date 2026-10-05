/* ============ LIFE: humans ============
   Everybody you meet — team-mates, the coach, the manager, the woman behind the till — and your own body.
   Each person is ONE skinned mesh: a faceted, vertex-coloured low-poly body (lathed elliptical rings for the
   torso and limbs, a shaped head with a face, hair with a real silhouette, clothes that are part of the body's
   own surface rather than painted on) bound to a 20-bone rig, drawn with one shared material. Bodies are
   cached by shape, so team-mates with the same build/kit cut/hair share the same buffers and only carry their
   own colours. A far LOD (about a thousand triangles, the face reduced to a few flat shapes) takes over at distance, and a single instanced
   blob under everyone grounds them without redrawing the sun's shadow map.

   ---- the API ----
   lookFor(role, seed, extras) → look            a believable, seeded person for a role:
       "footballer" "goalkeeper" "coach" "manager" "shopkeeper" "barista" "customer" "office" "courier" "gym" "pedestrian"
       "physio" "kitman" "receptionist" "clerk" "dispatcher" "photographer" "editor"
       extras are merged over the result (outfit fields merge into outfit); also extras.kit = [shirt, shorts], extras.number
       (club staff — coach, physio, kit man — take the club's colours from extras.kit). The manager is always an older man
       in a dark suit or long coat, with a tie and glasses: the one face at the club you know from across the room.
   look = {
     sex:"m"|"f", age, skin (hex), height (≈.92–1.08, scales the whole body), build:"slim"|"average"|"athletic"|"stocky"|"muscular",
     hair:"short"|"fade"|"buzz"|"curly"|"afro"|"long"|"ponytail"|"bun"|"braids"|"cornrows"|"dreads"|"messy"|"bald"|"horseshoe"
       |"undercut"|"slick"|"spiky"|"mohawk" (the barber's), hairColor (hex), beard:""|"stubble"|"beard"|"goatee"|"full", eyes (iris hex), receding (0..1),
     face:{jaw, nose, brow, eyes}  (each ≈ .9–1.12, eyes = spacing),
     outfit:{type:"kit"|"training"|"gk"|"tracksuit"|"casual"|"polo"|"hoodie"|"jacket"|"suit"|"coat"|"apron"|"office",
             shirt, trim, shorts, trousers, socks, sockTrim, shoes, sole, stripe, number, numCol, bib (colour or false),
             glove, inner, tie (colour or false), apron (colour), apronCut:"bib"|"waist", belt,
             sleeves:"short"|"long", collar:"crew"|"v"|"polo"|"shirt"|"zip"|"hood"|"lapel"|"open",
             legwear:"kitshorts"|"shorts"|"trousers"|"jeans"|"trackpants", footwear:"boots"|"trainers"|"dress"},
     props:["clipboard", "glasses"], seed }
   human(look, {cast, lod, track}) → h        h.g is a Group with the feet at its origin, facing +z. Add it anywhere.
       h.dispose() frees it (done for you when the place is rebuilt). cast:true lets it throw a real sun shadow
       (only for people who stand still — the sun's shadow map is not redrawn every frame).
   animateHuman(h, dt, state)     state is a mode string or {mode, speed, t, ...}; changes of mode are blended (.3 s,
       up to .8 s when the body has far to go, e.g. getting up off the grass; state.blend overrides).
       Every pose is then put on the ground: nothing of the body goes below the floor, a foot that would dip under
       is lifted by IK, and people lying down (tackle, dive) are lowered until they rest on it.
       "idle" (breathing, weight shift, looking about; {arms:"hips"|"behind"|"folded"})
       "move" {speed: m/s} — walk → jog → run → sprint from one speed value; stride length and cadence follow
              the speed so the planted foot stays put (also "walk" "jog" "run" "sprint" as presets). The legs'
              speed follows the one asked for at up to 7 m/s², and standing ↔ moving fades over ~.3 s, so a
              caller that starts or stops a person dead still gets a first step, not a snap.
       "kick" "pass" "trap" {t:0..1, amp}  — the ball leaves/meets the foot at t = CONTACT[mode]
       "header" {t}  "tackle" {t}  "dive" {t, dir:±1}  "gkready"  "celebrate"  "stretch" (cycles four stretches)
       "sit" {seat:.45}  — SEAT CONTRACT: put the group on the floor under the middle of the seat, facing the way
              the person looks; seat = seat-top height in world metres (chairs .45–.48, benches .42–.45), whatever
              the person's height: the backside rests on it. Feet land ~.45 m ahead; the hands lie on the thighs.
       "typing" {seat:.47, desk:.74, reach:.4, keys} (sitting, hands on a desk in front; heights and reach in world metres;
              keys:false — no keyboard: the hands rest flat on the table top, still: a café table, a book)
       "counter" {counter:1.0, reach:.34, lean, work} (standing, both palms flat on a counter top that high, reach ahead of
              the feet, a hip's width apart, elbows soft; the body leans in as far as it must but no more than ~12° (lean:
              radians overrides it; a top below hip height allows a little more); work:true — busy at it, wiping, moving things)
       Hands that rest on something lie flat on it (palm within ~1 cm of the top, whatever the height).
       "clipboard" (the coach: board in the left hand, writing now and then, watching)
       Any state may carry look:yaw to turn the head.
   playerRig(look, {firstPerson:true}) → h     your own body for first person: no head, hair or neck — the body
       stops at the shoulders in a low dome of shirt — same art style, same rig and animateHuman(); not tracked
       for LOD/blobs (one mesh, always near). The eyes of a 1.80 m body are at 1.68 (scale the rig by EYE/1.68),
       and the camera wants to sit ~.1 m in front of the neck (z ≈ +.1 in the rig's frame): looking down you then
       see the top of your chest and your arms, not the inside of a neck (further forward, ~.2, shows the feet too). h.bones[BONE.haR] etc. are the bones (BONE maps names → index) if a held
       object or a camera needs to follow a hand or the chest.
   CONTACT = {kick, pass, trap, header}: the t at which foot (or head) meets the ball.
   VIEW = {x, y, z, fx, fz, scene}: where the camera (you, in first person) was at the last frame drawn, and the way it
       looked (flat) — people use it to come and go only where you aren't looking.
   you() → {x, z, here, n}: where you are now (the fresher of VIEW and your own body as last posed) — people use it to
       get out of your way and never to step into you.
   Budget: ~3.2k triangles near / ~1k far, ONE draw call per person (+1 for the shirt number within 9.5 m),
   one more for all the blobs together. Bodies switch to the far LOD beyond 15 m.
*/
import {THREE, W} from "./build.js";

/* ---------- small maths ---------- */
const TAU = Math.PI*2, D2R = Math.PI/180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a)*t;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
// eased keyframes: [[t, v], ...]
function kf(t, K){
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) return lerp(K[i-1][1], K[i][1], sstep(K[i-1][0], K[i][0], t));
  return K[K.length - 1][1];
}
export function rng(seed){
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
}
const wpick = (r, list) => { let tot = 0; for (const e of list) tot += e[1]; let x = r()*tot; for (const e of list){ if ((x -= e[1]) <= 0) return e[0]; } return list[list.length - 1][0]; };
const hash3 = (a, b, c) => { let h = Math.imul((a | 0) ^ Math.imul(b | 0, 0x27d4eb2d) ^ Math.imul(c | 0, 0x165667b1), 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return (h >>> 0)/4294967296; };
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const hex = c => c == null || c === false ? null : typeof c === "number" ? c : new THREE.Color().setStyle(String(c)).getHex();
function mixHex(a, b, t){ const A = new THREE.Color(a), B = new THREE.Color(b); return A.lerp(B, t).getHex(); }
function shadeHex(a, f){ const c = new THREE.Color(a); c.r *= f; c.g *= f; c.b *= f; return c.getHex(); }

/* ---------- the rig ---------- */
const BN = ["root", "hips", "spine", "chest", "neck", "head", "uaL", "faL", "haL", "uaR", "faR", "haR", "thL", "shL", "ftL", "toL", "thR", "shR", "ftR", "toR"];
const PAR = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 3, 9, 10, 1, 12, 13, 14, 1, 16, 17, 18];
export const BONE = Object.fromEntries(BN.map((n, i) => [n, i]));
const B = BONE;
const ARM = s => s > 0 ? [6, 7, 8] : [9, 10, 11], LEG = s => s > 0 ? [12, 13, 14, 15] : [16, 17, 18, 19];
const NP = 63;                                     // pose: 20 bones × 3 rotations + the hips' offset

const BUILDS = {
  slim:     {sh:.95, ch:.92, wa:.9,  hp:.94, arm:.87, leg:.9,  belly:0,  mus:0,  nk:.94},
  average:  {sh:1,   ch:1,   wa:1,   hp:1,   arm:1,   leg:1,   belly:.3, mus:.2, nk:1},
  athletic: {sh:1.05, ch:1.05, wa:.95, hp:.98, arm:1.06, leg:1.06, belly:0, mus:.6, nk:1.04},
  stocky:   {sh:1.04, ch:1.1, wa:1.18, hp:1.08, arm:1.1, leg:1.1, belly:1,  mus:.2, nk:1.1},
  muscular: {sh:1.09, ch:1.12, wa:1.0, hp:1.0, arm:1.16, leg:1.12, belly:0, mus:1,  nk:1.1}
};
// body measurements for a 1.80 m frame; height is a uniform scale on top
function dims(look){
  const b = BUILDS[look.build] || BUILDS.average, f = look.sex === "f", old = Math.round(sstep(45, 78, look.age || 25)*4)/4;
  // the head is a little over 1/7.3 of the height (a touch larger than life, the way stylised figures read best), its
  // crown at the full height, so a bigger head brings the chin down and shortens the neck rather than adding height.
  // A woman's smaller head sits a little lower on a slimmer (not thinner-than-life) neck, with the shoulders a touch
  // higher: the same short neck as a man's, not a long stalk
  const hs = (f ? .955 : 1)*1.055, drop = f ? .024 : 0;
  return {f, old, hs, hipY:.93, kneeY:.5, ankY:.085, hipX:f ? .087 : .09, hipsY:.96, spineY:1.08, chestY:1.26, neckY:1.5, headY:1.62,
    shY:f ? 1.432 : 1.435, shX:(f ? .166 : .18)*b.sh, elbowL:.285, foreL:.245,
    sh:b.sh*(f ? .9 : 1), ch:b.ch*(f ? .9 : 1), wa:b.wa*(f ? .86 : 1) + old*.05, hp:b.hp*(f ? 1.09 : 1), arm:b.arm*(f ? .86 : 1), leg:b.leg*(f ? 1.02 : 1),
    belly:b.belly*(f ? .3 : 1) + old*.5, mus:b.mus*(f ? .3 : 1), bust:f ? 1 : 0, nk:b.nk*(f ? .92 : 1),
    hc:[0, 1.80 - .117*hs - drop, .012]};
}
function restPos(D){
  const P = [];
  P[B.root] = [0, 0, 0]; P[B.hips] = [0, D.hipsY, 0]; P[B.spine] = [0, D.spineY, .004]; P[B.chest] = [0, D.chestY, 0];
  P[B.neck] = [0, D.neckY, -.012]; P[B.head] = [0, D.headY, -.004];
  for (const s of [1, -1]){
    const [u, f, h] = ARM(s), x = s*D.shX;
    P[u] = [x, D.shY, -.005]; P[f] = [x, D.shY - D.elbowL, -.005]; P[h] = [x, D.shY - D.elbowL - D.foreL, -.005];
    const [t, k, a, o] = LEG(s), lx = s*D.hipX;
    P[t] = [lx, D.hipY, 0]; P[k] = [lx, D.kneeY, 0]; P[a] = [lx, D.ankY, 0]; P[o] = [lx, .025, .11];
  }
  return P;
}

/* ---------- palette slots: every vertex knows which colour of the person it is ---------- */
const SLOTS = ["skin", "lips", "hair", "brow", "white", "iris", "top", "trim", "bottom", "btrim", "socks", "strim", "shoe", "sole", "stripe", "bib",
  "glove", "gtrim", "inner", "tie", "prop", "paper", "num", "stubble", "fade", "lash", "lace", "apron", "metal", "belt", "dark"];
const S = Object.fromEntries(SLOTS.map((n, i) => [n, i]));
const ROUGH = {skin:.62, lips:.5, hair:.74, brow:.8, white:.3, iris:.22, shoe:.48, sole:.7, stripe:.45, glove:.62, gtrim:.6, prop:.55, paper:.9,
  metal:.32, lash:.6, stubble:.8, fade:.8, tie:.55, belt:.5, num:.8};

/* ---------- geometry: every triangle has its own corners (faceted), a slot, a shade, and up to two bone weights ---------- */
const wt = (b0, w0 = 1, b1 = b0, w1 = 0) => { const s = w0 + w1 || 1; return [b0, w0/s, b1, w1/s]; };
function wmix(a, b, t){
  const m = new Map(), add = (bn, w) => { if (w > 1e-5) m.set(bn, (m.get(bn) || 0) + w); };
  add(a[0], a[1]*(1 - t)); add(a[2], a[3]*(1 - t)); add(b[0], b[1]*t); add(b[2], b[3]*t);
  const e = [...m].sort((p, q) => q[1] - p[1]);
  return e.length > 1 ? wt(e[0][0], e[0][1], e[1][0], e[1][1]) : wt(e[0][0]);
}
class Geo {
  constructor(){ this.p = []; this.sl = []; this.sh = []; this.bi = []; this.bw = []; this.tn = []; this.fn = null; this.hit = null; }
  tri(a, b, c, slot, sa = 1, sb = sa, sc = sa, out = null){
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    if (nx*nx + ny*ny + nz*nz < 1e-15) return;
    if (out && nx*out[0] + ny*out[1] + nz*out[2] < 0){ const t = b; b = c; c = t; const q = sb; sb = sc; sc = q; }
    this.tn.push(this.fn);                                 // a decal's facet normal (null: its own)
    for (const [v, s] of [[a, sa], [b, sb], [c, sc]]){
      this.p.push(v[0], v[1], v[2]); this.sl.push(slot); this.sh.push(s);
      const w = v[3] || ROOTW; this.bi.push(w[0], w[2], 0, 0); this.bw.push(w[1], w[3], 0, 0);
    }
    if (this.hit) this.hit.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  quad(a, b, c, d, slot, sh = 1, out = null){ this.tri(a, b, c, slot, sh, sh, sh, out); this.tri(a, c, d, slot, sh, sh, sh, out); }
}
const ROOTW = wt(0);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const addv = (a, b, k = 1) => [a[0] + b[0]*k, a[1] + b[1]*k, a[2] + b[2]*k];

// a ring of points round c in the plane of U and V; prof(a) gives the offsets along U and V (angle 0 points along V)
function ring(c, U, V, prof, n, w, extra){
  const v = [];
  for (let k = 0; k < n; k++){
    const a = k/n*TAU, [u, q] = prof(a), ww = typeof w === "function" ? w(a, u, q) : w;
    v.push([c[0] + U[0]*u + V[0]*q, c[1] + U[1]*u + V[1]*q, c[2] + U[2]*u + V[2]*q, ww]);
  }
  return Object.assign({v, c}, extra);
}
const ell = (rx, rf, rb = rf) => a => { const s = Math.sin(a), c = Math.cos(a); return [s*rx, c*(c > 0 ? rf : rb)]; };
/* stitch rings into a tube. The faces all wind the same way round the sheet (decided once from a long band),
   so hems and ledges where the surface folds back on itself still face the right way. ring.s is the slot of
   the band that ends at that ring. */
function loft(G, R, o = {}){
  const n = R[0].v.length, closed = !o.open;
  let flip = false, found = false;
  if (o.out) { const a = R[0].v[0], b = R[0].v[1], c = R[1].v[1]; flip = dot(cross(sub(b, a), sub(c, a)), o.out) < 0; found = true; }
  for (let i = 0; i < R.length - 1 && !found; i++) for (let k = 0; k < n - 1 && !found; k++){
    const a = R[i].v[k], b = R[i].v[k + 1], c = R[i + 1].v[k + 1], nn = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...nn) < 1e-7 || Math.abs(R[i].c[1] - R[i + 1].c[1]) + Math.hypot(R[i].c[0] - R[i + 1].c[0], R[i].c[2] - R[i + 1].c[2]) < 1e-3) continue;
    const ax = [(R[i].c[0] + R[i + 1].c[0])/2, (R[i].c[1] + R[i + 1].c[1])/2, (R[i].c[2] + R[i + 1].c[2])/2];
    const m = sub([(a[0] + b[0] + c[0])/3, (a[1] + b[1] + c[1])/3, (a[2] + b[2] + c[2])/3], ax);
    if (o.radial === "xz") m[1] = 0;
    if (Math.hypot(...m) < 1e-4) continue;
    flip = dot(nn, m) < 0; found = true;
  }
  if (o.inside) flip = !flip;
  for (let i = 0; i < R.length - 1; i++){
    const A = R[i], Bq = R[i + 1];
    for (let k = 0; k < (closed ? n : n - 1); k++){
      const k1 = (k + 1) % n, s = o.sf ? o.sf(i, k, Bq) : Bq.s;
      if (s == null || s < 0) continue;
      const p0 = A.v[k], p1 = A.v[k1], p2 = Bq.v[k1], p3 = Bq.v[k], sa = A.sh == null ? 1 : A.sh, sb = Bq.sh == null ? 1 : Bq.sh;
      if (!flip){ G.tri(p0, p1, p2, s, sa, sa, sb); G.tri(p0, p2, p3, s, sa, sb, sb); }
      else { G.tri(p0, p2, p1, s, sa, sb, sa); G.tri(p0, p3, p2, s, sa, sb, sb); }
    }
  }
}
function cap(G, R, apex, slot, sh = 1, sa = sh){
  const n = R.v.length, out = sub(apex, R.c);
  for (let k = 0; k < n; k++) G.tri(R.v[k], R.v[(k + 1) % n], apex, slot, sh, sh, sa, out);
}
// join two closed loops with different numbers of points (both round an upright axis at cx, cz) into one band
function zip(G, A, Bl, cx, cz, slot, sh = 1){
  const ang = p => { const a = Math.atan2(p[0] - cx, p[2] - cz); return a < 0 ? a + TAU : a; };
  const sa = A.map(p => [ang(p), p]).sort((p, q) => p[0] - q[0]), sb = Bl.map(p => [ang(p), p]).sort((p, q) => p[0] - q[0]);
  const na = sa.length, nb = sb.length, out = (a, b, c) => [(a[0] + b[0] + c[0])/3 - cx, 0, (a[2] + b[2] + c[2])/3 - cz];
  let i = 0, j = 0;
  while (i < na || j < nb){
    const an = i < na ? (i + 1 < na ? sa[i + 1][0] : sa[0][0] + TAU) : Infinity, bn = j < nb ? (j + 1 < nb ? sb[j + 1][0] : sb[0][0] + TAU) : Infinity;
    const A0 = sa[i % na][1], B0 = sb[j % nb][1];
    if (an <= bn){ const A1 = sa[(i + 1) % na][1]; G.tri(A0, A1, B0, slot, sh, sh, sh, out(A0, A1, B0)); i++; }
    else { const B1 = sb[(j + 1) % nb][1]; G.tri(A0, B1, B0, slot, sh, sh, sh, out(A0, B1, B0)); j++; }
  }
}
// a box (props): centre, three half-axes
function boxG(G, c, ax, ay, az, slot, w, sh = 1){
  const P = (i, j, k) => [c[0] + ax[0]*i + ay[0]*j + az[0]*k, c[1] + ax[1]*i + ay[1]*j + az[1]*k, c[2] + ax[2]*i + ay[2]*j + az[2]*k, w];
  const faces = [[ax, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [ax.map(v => -v), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [ay, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [ay.map(v => -v), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [az.map(v => -v), [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
  for (const [o, q] of faces){ const v = q.map(p => P(...p)); G.quad(v[0], v[1], v[2], v[3], slot, sh, o); }
}
// a tube along a path of points with radii (hair tails, locks, braids)
function tube(G, pts, radii, n, ws, slot, sh = 1, tipCap = true){
  const R = [];
  for (let i = 0; i < pts.length; i++){
    const t = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let U = norm(cross(t, [0, 0, 1])); if (Math.hypot(...cross(t, [0, 0, 1])) < .2) U = norm(cross(t, [1, 0, 0]));
    const V = cross(U, t), r = radii[i];
    R.push(ring(pts[i], U, V, a => [Math.sin(a)*r, Math.cos(a)*r], n, ws[i], {s:slot, sh}));
  }
  loft(G, R);
  if (tipCap){ const L = R[R.length - 1], d = norm(sub(pts[pts.length - 1], pts[pts.length - 2])); cap(G, L, [...addv(L.c, d, radii[radii.length - 1]*.8), ws[ws.length - 1]], slot, sh); }
  return R;
}
// interpolate a list of stations {y, rx, rf, rb, x, z, w} at height y
function at(st, y){
  for (let i = 0; i < st.length - 1; i++){
    const a = st[i], b = st[i + 1], lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    if (y >= lo - 1e-9 && y <= hi + 1e-9){
      const t = hi - lo < 1e-9 ? 0 : (y - a.y)/(b.y - a.y);
      return {y, rx:lerp(a.rx, b.rx, t), rf:lerp(a.rf, b.rf, t), rb:lerp(a.rb, b.rb, t), x:lerp(a.x, b.x, t), z:lerp(a.z, b.z, t), w:wmix(a.w, b.w, t)};
    }
  }
  return st[y > st[0].y === st[st.length - 1].y > st[0].y ? st.length - 1 : 0];
}
/* a vertical tube dressed in layers. Each layer {lo, hi, slot, off, fl, pad, sf} covers a span of height;
   later layers sit outside earlier ones. Where one layer gives way to another the surface steps in or out
   (a hem, a cuff, a collar), with the underside shaded. fl flares a layer's lower edge. */
function dressed(G, st, layers, n, o = {}){
  const asc = st[st.length - 1].y > st[0].y, lo = Math.min(st[0].y, st[st.length - 1].y), hi = Math.max(st[0].y, st[st.length - 1].y);
  const skin = {slot:o.skin == null ? S.skin : o.skin, off:0};
  const cuts = new Set(st.map(s => s.y));
  for (const L of layers){ if (L.lo > lo + 1e-6 && L.lo < hi - 1e-6) cuts.add(L.lo); if (L.hi > lo + 1e-6 && L.hi < hi - 1e-6) cuts.add(L.hi); }
  const ys = [...cuts].sort((a, b) => asc ? a - b : b - a);
  const layerAt = y => { let r = skin; for (const L of layers) if (y > L.lo && y < L.hi) r = L; return r; };
  const offAt = (L, y) => L.off + (L.fl && Math.abs(y - L.lo) < 1e-6 ? L.fl : 0);
  const prof = o.prof || ((b, off, pad) => ell(b.rx + off, b.rf + off + pad, b.rb + off));
  const mk = (y, off, L, slot, sh) => {
    const b = at(st, y), pad = L && L.pad && y > L.pad[0] && y < L.pad[1] ? L.pad[2]*Math.sin((y - L.pad[0])/(L.pad[1] - L.pad[0])*Math.PI) : 0;
    const r = ring([b.x, y, b.z], [1, 0, 0], [0, 0, 1], prof(b, off, pad), n, b.w, {s:slot, sh, y, L});
    if (o.fit) for (const p of r.v) o.fit(p, y);
    return r;
  };
  const R = [];
  for (let j = 0; j < ys.length; j++){
    const y = ys[j], Lp = j ? layerAt((ys[j - 1] + y)/2) : null, Ln = j < ys.length - 1 ? layerAt((y + ys[j + 1])/2) : null;
    const op = Lp ? offAt(Lp, y) : 0, on = Ln ? offAt(Ln, y) : 0;
    if (Lp && Ln && Math.abs(op - on) > 1e-5){
      const outer = op > on ? Lp : Ln;
      R.push(mk(y, op, Lp, Lp.slot, op > on ? 1 : .62));
      R.push(mk(y, on, outer, outer.slot, on > op ? 1 : .62));
    } else { const L = Lp || Ln; R.push(mk(y, Lp ? op : on, L, L.slot, 1)); }
  }
  loft(G, R, {sf:(i, k, r) => r.L && r.L.sf ? r.L.sf(k, n, r.y, r.s) : r.s});
  return R;
}
// ray against a triangle list (Möller–Trumbore): the nearest hit distance or -1
let RAYI = -1;                                            // the triangle the last ray() hit
function ray(T, o, d){
  let best = -1; RAYI = -1;
  for (let i = 0; i < T.length; i += 9){
    const e1x = T[i + 3] - T[i], e1y = T[i + 4] - T[i + 1], e1z = T[i + 5] - T[i + 2], e2x = T[i + 6] - T[i], e2y = T[i + 7] - T[i + 1], e2z = T[i + 8] - T[i + 2];
    const px = d[1]*e2z - d[2]*e2y, py = d[2]*e2x - d[0]*e2z, pz = d[0]*e2y - d[1]*e2x, det = e1x*px + e1y*py + e1z*pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1/det, tx = o[0] - T[i], ty = o[1] - T[i + 1], tz = o[2] - T[i + 2], u = (tx*px + ty*py + tz*pz)*inv;
    if (u < 0 || u > 1) continue;
    const qx = ty*e1z - tz*e1y, qy = tz*e1x - tx*e1z, qz = tx*e1y - ty*e1x, v = (d[0]*qx + d[1]*qy + d[2]*qz)*inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x*qx + e2y*qy + e2z*qz)*inv;
    if (t > 0 && (best < 0 || t < best)){ best = t; RAYI = i/9; }
  }
  return best;
}
/* a flat shape laid onto a surface along z: side +1 from the front, -1 from behind. Each piece of the shape is
   clipped to the facets under it, so it lies exactly on them and takes their own flat shading (no seams or
   saw-teeth of its own), then is lifted a little off them. A piece hidden behind a nearer facet is dropped. */
function clip2(poly, a, b, c){
  const ccw = (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]) > 0, E = ccw ? [a, b, c] : [a, c, b];
  for (let e = 0; e < 3 && poly.length > 2; e++){
    const p = E[e], q = E[(e + 1) % 3], side = v => (q[0] - p[0])*(v[1] - p[1]) - (q[1] - p[1])*(v[0] - p[0]), out = [];
    for (let i = 0; i < poly.length; i++){
      const u = poly[i], v = poly[(i + 1) % poly.length], su = side(u), sv = side(v);
      if (su >= 0) out.push(u);
      if ((su >= 0) !== (sv >= 0)){ const t = su/(su - sv); out.push([u[0] + (v[0] - u[0])*t, u[1] + (v[1] - u[1])*t]); }
    }
    poly = out;
  }
  return poly;
}
function decal(G, hit, tris, side, lift, slot, wf, sh = 1){
  const nf = hit.length/9;
  for (const t of tris){
    const x0 = Math.min(t[0][0], t[1][0], t[2][0]), x1 = Math.max(t[0][0], t[1][0], t[2][0]), y0 = Math.min(t[0][1], t[1][1], t[2][1]), y1 = Math.max(t[0][1], t[1][1], t[2][1]);
    for (let f = 0; f < nf; f++){
      const i = f*9, ax = hit[i], ay = hit[i + 1], az = hit[i + 2], bx = hit[i + 3], by = hit[i + 4], bz = hit[i + 5], cx = hit[i + 6], cy = hit[i + 7], cz = hit[i + 8];
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(ay, by, cy) < y0 || Math.min(ay, by, cy) > y1) continue;
      const n = cross([bx - ax, by - ay, bz - az], [cx - ax, cy - ay, cz - az]), nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-12 || n[2]*side < .05*nl) continue;                        // only facets that face this way
      const P = clip2([t[0], t[1], t[2]], [ax, ay], [bx, by], [cx, cy]);
      if (P.length < 3) continue;
      let mx = 0, my = 0; for (const p of P){ mx += p[0]/P.length; my += p[1]/P.length; }
      const zOf = (x, y) => az - (n[0]*(x - ax) + n[1]*(y - ay))/n[2];
      const th = ray(hit, [mx, my, side*2], [0, 0, -side]);
      if (th > 0 && RAYI !== f && side*((side*2 - side*th) - zOf(mx, my)) > .002) continue;
      const u = [n[0]/nl, n[1]/nl, n[2]/nl]; if (u[2]*side < 0){ u[0] = -u[0]; u[1] = -u[1]; u[2] = -u[2]; }
      // lifted straight toward the viewer, so pieces on neighbouring facets still meet along the crease between them
      const V = P.map(([x, y]) => [x, y, zOf(x, y) + side*lift, wf(y, x)]);
      G.fn = u;
      for (let k = 1; k < V.length - 1; k++) G.tri(V[0], V[k], V[k + 1], slot, sh, sh, sh, [0, 0, side]);
      G.fn = null;
    }
  }
}
// a polygon in the plane as a fan, and a polyline as a ribbon of quads with filled joints
const fan = pts => { const c = pts.reduce((s, p) => [s[0] + p[0]/pts.length, s[1] + p[1]/pts.length], [0, 0]); return pts.map((p, i) => [c, p, pts[(i + 1) % pts.length]]); };
function stroke(pts, w){
  const T = [];
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy/l*w/2, ny = dx/l*w/2;
    const p = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
    T.push([p[0], p[1], p[2]], [p[0], p[2], p[3]]);
    if (i){ const r = w*.5; T.push(...fan([0, 1, 2, 3, 4, 5].map(k => [a[0] + Math.cos(k/6*TAU)*r, a[1] + Math.sin(k/6*TAU)*r]))); }
  }
  return T;
}

/* ---------- the outfit, resolved into garment pieces ---------- */
function garb(o = {}){
  const t = o.type || "casual";
  const g = {top:"tee", sleeves:"short", collar:"crew", legwear:"jeans", footwear:"trainers", legs:"", tuck:false, belt:false, gloves:false,
    bib:!!o.bib, apron:"", tie:false, coat:false, hood:false, zip:false, crest:false, placket:false, number:o.number | 0};
  const set = x => Object.assign(g, x);
  if (t === "kit" || t === "training") set({top:"kit", collar:t === "kit" ? "v" : "crew", legwear:"kitshorts", footwear:"boots", legs:"socks", crest:t === "kit"});
  else if (t === "gk") set({top:"kit", sleeves:"long", collar:"crew", legwear:"kitshorts", footwear:"boots", legs:"socks", gloves:true, crest:true});
  else if (t === "tracksuit") set({top:"track", sleeves:"long", collar:"zip", legwear:"trackpants", zip:true, crest:true});
  else if (t === "hoodie") set({top:"hoodie", sleeves:"long", collar:"hood", hood:true});
  else if (t === "jacket") set({top:"jacket", sleeves:"long", collar:"open"});
  else if (t === "suit") set({top:"suit", sleeves:"long", collar:"lapel", legwear:"trousers", footwear:"dress", tie:o.tie !== false});
  else if (t === "coat") set({top:"suit", sleeves:"long", collar:"lapel", legwear:"trousers", footwear:"dress", coat:true, tie:!!o.tie});
  else if (t === "apron") set({collar:o.collar || "crew", apron:o.apronCut || "bib", legwear:"trousers"});
  else if (t === "office") set({top:"shirt", sleeves:"long", collar:"shirt", legwear:"trousers", footwear:"dress", tuck:true, belt:true, tie:!!o.tie, placket:true});
  else if (t === "polo") set({collar:"polo"});
  for (const k of ["sleeves", "collar", "legwear", "footwear"]) if (o[k]) g[k] = o[k];
  if (o.tie != null && t !== "suit") g.tie = !!o.tie;
  if (g.legwear === "shorts" && !g.legs) g.legs = "ankle";
  if (g.collar === "polo" || g.collar === "shirt") g.placket = true;
  return g;
}

/* ---------- the head: a deformed sphere (cranium, forehead, cheekbones, jaw, chin) ---------- */
function headFn(D, F){
  const hc = D.hc, hs = D.hs, jaw = F.jaw || 1, chin = F.chin || 1;
  return (lat, lon, off = 0) => {
    const cl = Math.cos(lat), x0 = cl*Math.sin(lon), y = Math.sin(lat), z0 = cl*Math.cos(lon);
    let rx = .079, ry = y > 0 ? .117 : .118, rzF = .097, rzB = .103, xm = 1, zs = 0;
    if (y < 0){
      const t = -y;
      xm *= 1 - Math.pow(t, 1.9)*(.34 - .26*(jaw - 1));                 // the jaw narrows to the chin (its angle wide enough to frame the neck)
      rzB *= 1 - .5*t*t;                                                // the skull tucks into the neck behind
      zs += .036*Math.pow(t, 1.5)*chin*sstep(-.25, .55, z0);            // the chin comes forward
    } else {
      xm *= 1 + .05*y*sstep(.2, -.6, z0);                              // a fuller crown behind
      if (y > .35) rzF *= 1 - .1*(y - .35);                             // the forehead slopes back
    }
    if (y < .2 && y > -.55) xm *= 1 + .05*Math.sin((y + .55)/.75*Math.PI)*sstep(.1, .7, z0);   // cheekbones
    const px = x0*rx*xm, py = y*ry, pz = z0*(z0 > 0 ? rzF : rzB) + zs;
    let ox = 0, oy = 0, oz = 0;
    if (off){ const nn = norm([px/(rx*rx), py/(ry*ry), (pz - zs)/((z0 > 0 ? rzF : rzB)**2) + (y < 0 ? -.2 : 0)]); ox = nn[0]*off; oy = nn[1]*off; oz = nn[2]*off; }
    return [hc[0] + (px + ox)*hs, hc[1] + (py + oy)*hs, hc[2] + (pz + oz)*hs];
  };
}
const HEADW = wt(B.head);

/* ---------- building a body ---------- */
function build(look, det, noHead){
  const D = dims(look), g = garb(look.outfit), G = new Geo(), F = look.face || {};
  const near = det > 0, n = near ? 10 : 6, nl = near ? 8 : 5;
  const topOff = {kit:.01, tee:.008, shirt:.008, track:.014, hoodie:.02, jacket:.022, suit:.016}[g.top] || .01;
  const botOff = {kitshorts:.011, shorts:.011, trousers:.009, jeans:.008, trackpants:.012}[g.legwear] || .01;
  const shorts = g.legwear === "kitshorts" || g.legwear === "shorts";
  D.thighCloth = shorts ? botOff + .016 : botOff + .002;          // how far the cloth stands off the top of the thigh
  const jacketish = g.top === "jacket" || g.top === "suit";
  /* torso: pelvis → waist → chest → shoulders → neck */
  const {hp, wa, ch, sh, belly, bust, mus, nk} = D;
  const H = B.hips, SP = B.spine, C = B.chest, N = B.neck, HD = B.head;
  const ts = (y, rx, rf, rb, z, w) => ({y, rx, rf, rb, x:0, z, w});
  let tst = [
    ts(.83, .163*hp, .07, .084, 0, wt(H)),                  // the seat: from here the cloth splits into the two legs
    ts(.89, .176*hp, .096, .107, 0, wt(H)),
    ts(.94, .17*hp, .097, .108, 0, wt(H)),
    ts(1.0, .157*(hp + wa)/2, .094 + belly*.008, .1, .003, wt(H, .6, SP, .4)),
    ts(1.07, .146*wa, .093 + belly*.022, .09, .006, wt(SP)),
    ts(1.14, .147*(wa*.6 + ch*.4), .095 + belly*.022, .088, .006, wt(SP, .7, C, .3)),
    ts(1.22, .157*ch, .101 + belly*.01 + bust*.01, .09, .004, wt(SP, .25, C, .75)),
    ts(1.30, .166*ch, .107 + mus*.008 + bust*.024, .098, 0, wt(C)),
    ts(1.37, .172*(ch + sh)/2, .102 + mus*.006 + bust*.01, .102, -.004, wt(C)),
    ts(1.425, .17*sh, .088, .092, -.008, wt(C)),
    ts(1.465, .14*sh, .074, .08, -.012, wt(C)),
    ts(1.505, .088*nk, .066, .074, -.01, wt(C, .6, N, .4)),          // the trapezius rising well up into a neck of real thickness
    ts(1.54, .068*nk, .061*nk, .068*nk, -.006, wt(N)),
    ts(1.6, .058*nk, .053*nk, .058*nk, -.002, wt(N, .7, HD, .3)),
    ts(1.645, .05, .044, .05, .002, wt(HD, .7, N, .3))
  ];
  if (!near) tst = tst.filter(s => [.83, .94, 1.07, 1.22, 1.37, 1.425, 1.465, 1.505, 1.6, 1.645].includes(s.y));
  if (noHead) tst = tst.filter(s => s.y <= 1.425);
  const TL = [];                                             // torso layers, inside → out
  const bottomSlot = S.bottom;
  TL.push({lo:.7, hi:g.tuck ? 1.04 : 1.02, slot:bottomSlot, off:botOff});
  if (g.belt || g.tuck) TL.push({lo:1.0, hi:1.035, slot:S.belt, off:botOff + .004});
  const hem = {kit:.955, tee:.93, shirt:1.035, track:.96, hoodie:.9, jacket:.88, suit:.86}[g.top] || .94;
  if (g.top === "hoodie" || g.top === "track") TL.push({lo:hem, hi:hem + .04, slot:S.trim, off:topOff - .002});
  TL.push({lo:g.top === "hoodie" || g.top === "track" ? hem + .04 : hem, hi:1.505, slot:S.top, off:topOff, fl:g.tuck || g.top === "hoodie" || g.top === "track" ? 0 : .006});
  if (g.apron) TL.push({lo:1.065, hi:1.09, slot:S.apron, off:topOff + .006});
  if (g.bib) TL.push({lo:.93, hi:1.46, slot:S.bib, off:topOff + .008, fl:.004, sf:(k, nn, y, s) => (y > 1.3 && Math.abs(Math.sin((k + .5)/nn*TAU)) > .8) ? S.top : s});
  // collars
  if (g.collar === "crew" || g.collar === "v") TL.push({lo:1.49, hi:1.515, slot:S.trim, off:topOff + .004});
  else if (g.collar === "zip") TL.push({lo:1.49, hi:1.56, slot:S.top, off:topOff + .006});
  else if (g.collar === "lapel") TL.push({lo:1.505, hi:1.537, slot:S.inner, off:.009, fl:topOff - .009});   // a shirt collar standing up round the neck, flush with the jacket at its foot
  else if (g.collar === "open") TL.push({lo:1.49, hi:1.51, slot:S.inner, off:topOff + .002});
  else if (g.collar === "polo" || g.collar === "shirt") TL.push({lo:1.49, hi:1.505, slot:S.top, off:topOff + .002});
  else if (g.collar === "hood") TL.push({lo:1.49, hi:1.51, slot:S.top, off:topOff + .004});
  // a thick top (jacket, hoodie, track top) carries its shoulder seam out over the top of the arm, so the sleeve
  // hangs from the end of the shoulder instead of sitting on it like a pad
  const seam = topOff > .012 && g.top !== "suit" ? .024 : 0, seamAt = y => sstep(1.37, 1.43, y)*(1 - sstep(1.45, 1.485, y));
  const torsoProf = (b, off, pad) => a => { const s = Math.sin(a), c = Math.cos(a), us = Math.sign(s)*Math.pow(Math.abs(s), .86), vc = Math.sign(c)*Math.pow(Math.abs(c), .92);
    const ex = seam && off > topOff - .001 ? seam*Math.pow(Math.abs(s), 3)*seamAt(b.y) : 0;
    return [us*(b.rx + off + ex), vc*(c > 0 ? b.rf + off + pad : b.rb + off)]; };
  G.hit = [];
  const TR = dressed(G, tst, TL, n, {prof:torsoProf});
  const torsoHit = G.hit; G.hit = null;
  const CROTCH = [[0, .8, .062, wt(H)], [0, .8, -.068, wt(H)]];        // the seam under the seat, front and back
  // first person: the body stops at the shoulders, a low dome of shirt you look down past
  if (noHead) cap(G, TR[TR.length - 1], [0, 1.44, -.01, wt(C)], S.top, .9);
  const wTorso = y => at(tst, clamp(y, tst[0].y, tst[tst.length - 1].y)).w;

  /* arms */
  for (const s of [1, -1]){
    const [U, Fa, Hd] = ARM(s), x = s*D.shX, y0 = D.shY, a = D.arm, eY = y0 - D.elbowL, wY = eY - D.foreL;
    const st = (y, rx, rf, rb, dx, w, dz = 0) => ({y, rx, rf, rb, x:x + s*dx, z:-.005 + dz, w});
    let ast = [
      st(y0 + .016, .018, .022, .021, -.018, wt(C, .55, U, .45)),
      st(y0 + .006, .031*a, .037*a, .035*a, -.011, wt(C, .4, U, .6)),
      st(y0 - .014, .043*a, .047*a, .045*a, -.003, wt(U, .85, C, .15)),
      st(y0 - .05, .05*a, .049*a, .048*a, .003, wt(U)),
      st(y0 - .12, (.045 + .004*mus)*a, (.049 + .006*mus)*a, .046*a, .004, wt(U)),
      st(y0 - .2, .041*a, .042*a, .043*a, .002, wt(U)),
      st(eY + .03, .037*a, .036*a, .038*a, 0, wt(U, .85, Fa, .15)),
      st(eY, .036*a, .035*a, .04*a, 0, wt(U, .5, Fa, .5)),
      st(eY - .03, .039*a, .038*a, .04*a, 0, wt(Fa, .85, U, .15)),
      st(eY - .08, .04*a, .039*a, .038*a, 0, wt(Fa)),
      st(eY - .16, .031*a, .032*a, .031*a, 0, wt(Fa)),
      st(wY + .02, .025, .029, .027, 0, wt(Fa)),
      st(wY, .023, .03, .028, 0, wt(Fa, .5, Hd, .5)),
      st(wY - .03, .021, .036, .03, -.002, wt(Hd), .002),
      st(wY - .075, .019, .043, .037, -.004, wt(Hd), .004),
      st(wY - .115, .0165, .04, .034, -.008, wt(Hd), .004),
      st(wY - .143, .015, .034, .029, -.012, wt(Hd), .003),
      st(wY - .16, .0125, .025, .021, -.014, wt(Hd), .002)
    ];
    if (!near) ast = ast.filter((q, i) => [0, 2, 4, 6, 7, 9, 11, 12, 14, 17].includes(i));
    const AL = [];
    const sleeveEnd = g.sleeves === "long" ? wY + .012 : y0 - (g.top === "kit" ? .135 : .15);
    AL.push({lo:sleeveEnd, hi:y0 + .1, slot:S.top, off:topOff - .003, fl:g.sleeves === "long" ? .002 : .005});
    if (g.top === "kit" || g.top === "track" || g.top === "hoodie") AL.push({lo:sleeveEnd, hi:sleeveEnd + (g.sleeves === "long" ? .035 : .018), slot:S.trim, off:topOff - .002, fl:g.sleeves === "long" ? 0 : .005});
    if (g.top === "track" && near) AL.push({lo:sleeveEnd + .04, hi:y0 + .02, slot:S.top, off:topOff, sf:(k, nn, y, sl) => k === (s > 0 ? Math.round(nn/4) - 1 : nn - Math.round(nn/4)) ? S.trim : sl});
    if (jacketish && g.sleeves === "long") AL.push({lo:wY - .002, hi:wY + .012, slot:S.inner, off:.006});
    if (g.gloves) { AL.push({lo:wY - .2, hi:wY + .005, slot:S.glove, off:.009}); AL.push({lo:wY - .01, hi:wY + .03, slot:S.gtrim, off:.013}); }
    // the sleeve hugs the shoulder rather than standing off it like a pad (and a tailored shoulder sits square)
    const capK = g.top === "suit" ? y => 1 - .75*sstep(y0 - .06, y0 + .006, y)
      : topOff > .012 ? y => 1 - .88*sstep(y0 - .15, y0 - .01, y) : y => 1 - .6*sstep(y0 - .06, y0 + .006, y);
    // and a thick sleeve falls straight from the shoulder over the deltoid: no ball at the top of the arm
    const hull = topOff > .012 && g.top !== "suit" ? (.05 + .004*mus)*a : 0, hullAt = y => sstep(y0 + .03, y0 - .03, y)*(1 - sstep(y0 - .1, y0 - .16, y));
    const AR = dressed(G, ast, AL, nl, {prof:(b, off, pad) => { const o2 = off*capK(b.y);
      if (hull && off > .005){ const rxo = Math.max(b.rx, lerp(b.rx, hull, hullAt(b.y))) + o2, rx = b.rx + o2;
        return q => { const sn = Math.sin(q), cs = Math.cos(q); return [sn*(sn*s > 0 ? rxo : rx), cs*(cs > 0 ? b.rf + o2 + pad : b.rb + o2)]; }; }
      return ell(b.rx + o2, b.rf + o2 + pad, b.rb + o2); }});
    const last = ast[ast.length - 1], tipY = wY - .168, gl = g.gloves ? .009 : 0;
    cap(G, AR[0], [x - s*.024, y0 + .022, -.005, wt(C, .6, U, .4)], S.top);
    // fingertips: a blunt, rounded end rather than a point
    cap(G, AR[AR.length - 1], [last.x - s*.002, tipY - gl*.6, last.z + .002, wt(Hd)], g.gloves ? S.glove : S.skin, .95);
    // the thumb: a short tapered digit rooted in the heel of the hand, lying forward along the palm side
    if (near){
      const P = [[x - s*.006, wY - .02, .006], [x - s*.011, wY - .045, .026], [x - s*.015, wY - .068, .034], [x - s*.017, wY - .086, .035]];
      tube(G, P, [.0135 + gl, .0125 + gl, .0105 + gl, .0085 + gl], 6, P.map(() => wt(Hd)), g.gloves ? S.glove : S.skin, .95);
    }
  }

  /* legs */
  for (const s of [1, -1]){
    const [TH, SH, FT] = LEG(s), x = s*D.hipX, l = D.leg;
    const st = (y, rx, rf, rb, dx, dz, w) => ({y, rx:rx*l, rf:rf*l, rb:rb*l, x:x + s*dx, z:dz, w});
    let lst = [
      st(.8, .079, .08, .086, -.005, -.002, wt(TH, .65, H, .35)),
      st(.74, .073, .078, .075, 0, .004, wt(TH)),
      st(.62, .061, .066, .061, -.004, .004, wt(TH)),
      st(.545, .052, .058, .052, -.006, .004, wt(TH, .85, SH, .15)),
      st(.5, .05, .056, .05, -.006, .004, wt(TH, .5, SH, .5)),
      st(.46, .048, .052, .055, -.006, 0, wt(SH, .85, TH, .15)),
      st(.38, .05, .047, .067, -.004, -.004, wt(SH)),
      st(.28, .043, .043, .055, -.002, -.004, wt(SH)),
      st(.18, .033, .036, .04, 0, -.002, wt(SH)),
      st(.11, .029, .033, .033, 0, 0, wt(SH, .7, FT, .3)),
      st(.06, .03, .036, .034, 0, .006, wt(FT, .7, SH, .3))
    ];
    if (!near) lst = lst.filter((q, i) => [0, 1, 2, 4, 6, 8, 10].includes(i));
    const LL = [];
    if (g.legs === "socks"){
      LL.push({lo:.04, hi:.47, slot:S.socks, off:.006, pad:[.17, .43, near ? .012 : .008]});
      LL.push({lo:.425, hi:.47, slot:S.strim, off:.008});
    } else if (g.legs === "ankle") LL.push({lo:.04, hi:.11, slot:S.socks, off:.004});
    if (shorts){
      const end = g.legwear === "kitshorts" ? .7 : .6;
      // a hem that stands only a little off the thigh: sitting, the thigh points at you and a loose hem reads as a flared tube
      LL.push({lo:end, hi:1.1, slot:S.bottom, off:botOff, fl:.004});
    } else {
      const tp = g.legwear === "trackpants", jn = g.legwear === "jeans";
      LL.push({lo:.05, hi:1.1, slot:S.bottom, off:botOff, fl:tp ? 0 : .004, sf:(tp || jn) && near ? (k, nn, y, sl) => (y < 1.0 && k === (s > 0 ? Math.round(nn/4) - 1 : nn - Math.round(nn/4))) ? (tp ? S.trim : S.btrim) : sl : null});
      if (tp) LL.push({lo:.05, hi:.09, slot:S.trim, off:botOff - .003});
    }
    // trousers fall straight from the knee rather than following the calf
    const prof = shorts ? null : (b, off, pad) => { const below = b.y < .5, rx = below ? Math.max(b.rx + off, .052*l) : b.rx + off, rf = below ? Math.max(b.rf + off, .056*l) : b.rf + off, rb = below ? Math.max(b.rb + off, .058*l) : b.rb + off; return ell(rx, rf + pad, rb); };
    const LR = dressed(G, lst, LL, nl, prof ? {prof:(b, off, pad) => off > .001 ? prof(b, off, pad) : ell(b.rx + off, b.rf + off + pad, b.rb + off)} : {});
    // the seat of the shorts/trousers: this side of the hip ring, down the crotch seam, joined to the top of the leg
    // (one continuous surface, like a pair of trousers — no tube poking through another)
    const half = [], hn = TR[0].v.length;
    for (let k = 0; k <= hn/2; k++) half.push(TR[0].v[s > 0 ? k : (hn/2 + k) % hn]);
    half.push(...CROTCH);
    zip(G, half, LR[0].v, x, 0, S.bottom);
    shoe(G, D, s, g, near);
  }

  /* bits of clothing that stand off the body */
  if (near && (g.collar === "polo" || g.collar === "shirt")){
    // a turned-down collar, open at the front
    const R = [[1.495, .0, 1], [1.53, -.004, 1], [1.528, .01, .9], [1.5, .024, .8]].map(([y, d, sh]) => {
      const b = at(tst, Math.min(y, 1.505)); return ring([0, y, b.z], [1, 0, 0], [0, 0, 1], ell(b.rx*.82 + topOff + .006 + d, b.rf*.92 + topOff + .006 + d, b.rb*.92 + topOff + .006 + d), 10, wTorso(y), {s:S.top, sh});
    });
    loft(G, R, {sf:(i, k, r) => (k === 0 || k === 9) ? -1 : r.s, radial:"xz"});
    loft(G, R, {sf:(i, k, r) => (k === 0 || k === 9) ? -1 : r.s, radial:"xz", inside:true});
  }
  if (g.hood){
    const pts = [], rs = [], ws = [];
    for (let i = 0; i <= 6; i++){ const a = (-110 + i*220/6)*D2R; pts.push([Math.sin(a)*.1, 1.5 + .01*Math.cos(a), -Math.cos(a)*.085 - .02]); rs.push(i === 0 || i === 6 ? .02 : .036 + .01*Math.cos(a)); ws.push(wt(C, .7, N, .3)); }
    tube(G, pts, rs, near ? 6 : 4, ws, S.top, .9);
  }
  if (g.apron){
    /* one sheet of cloth tied at the waist (a bib apron's bib carries on up the chest). It lies on the CLOTHED body
       (torsoHit is the outside of the shirt, hem flare and all), clear of it by a few mm measured across the
       neighbouring points too, so the cloth never dips under a curve of the shirt; from the tie down each column only
       ever comes forward (it rides over the hips and the belly and hangs straight off them, never pulled back in
       under them), and below the seat the columns straighten into one sheet in front of the thighs. The skirt is one
       width from the tie to the hem (no step where the body widens), never wider than the waist it is tied round. */
    const bib = g.apron === "bib", TIE = 1.075, top = bib ? 1.38 : TIE, bot = bib ? .6 : .62, cols = near ? 6 : 3, SEAT = .85;
    const halfAt = y => { let x = 0; while (x < .3 && ray(torsoHit, [x + .004, y, 2], [0, 0, -1]) > 0) x += .004; return x; };
    const surf = (x, y) => { let z = -1; for (const d of [-.01, 0, .01]){ const t = ray(torsoHit, [x + d, y, 2], [0, 0, -1]); if (t > 0) z = Math.max(z, 2 - t); } return z < 0 ? null : z + .007; };
    const skirtW = Math.min(bib ? .15 : .165, halfAt(TIE) - .012, halfAt(TIE - .03) - .012), bibW = y => lerp(.11, skirtW, sstep(1.36, TIE + .02, y));
    // the heights of the rows: close together where the cloth meets the body's curves, wider apart where it hangs free
    const ys = [];
    if (bib) for (let y = top; y > TIE + 1e-6; y -= near ? .06 : .1) ys.push(y);
    for (let y = TIE; y > SEAT - 1e-6; y -= near ? .022 : .045) ys.push(y);
    for (const y of near ? [.8, .74, .67, bot] : [.74, bot]) ys.push(y);
    const zRun = new Array(cols + 1).fill(-1), Rf = [], Rb = [];
    let sheet = -1;
    for (const y of ys){
      const vf = [], vb = [], skirt = y <= TIE + 1e-6, hw = skirt ? skirtW*(1 + Math.max(0, SEAT - y)*.3) : bibW(y);
      const zs = [];
      for (let c = 0; c <= cols; c++){
        const xx = lerp(-1, 1, c/cols)*hw;
        let z = y >= SEAT - 1e-6 ? surf(Math.min(Math.abs(xx), skirtW), y) : null;
        if (skirt){ if (z != null) zRun[c] = Math.max(zRun[c], z); z = zRun[c] > 0 ? zRun[c] : z; }
        zs.push(z ?? .12);
      }
      if (y >= SEAT - 1e-6) sheet = Math.max(sheet, ...zs);
      const k = sstep(SEAT + .03, SEAT - .12, y);
      for (let c = 0; c <= cols; c++){
        const xx = lerp(-1, 1, c/cols)*hw, side = xx >= 0 ? 1 : -1;
        const z = lerp(zs[c], sheet, k) + Math.max(0, SEAT - y)*.06;
        // the part in front of a thigh goes with that thigh (a stride or sitting down never pushes the leg through it)
        const lw = sstep(.95, .7, y)*(.4 + .5*Math.min(1, Math.abs(xx)/.07));
        const ww = y >= .95 ? wTorso(y) : wt(B.hips, 1 - lw, LEG(side)[0], lw);
        vf.push([xx, y, z, ww]); vb.push([xx, y, z - .003, ww]);
      }
      Rf.push({v:vf, c:[0, y, 0], s:S.apron, sh:1}); Rb.push({v:vb, c:[0, y, 0], s:S.apron, sh:.6});
    }
    loft(G, Rf, {open:true, out:[0, 0, 1]}); loft(G, Rb, {open:true, out:[0, 0, -1]});
    if (g.apron === "bib"){
      decal(G, torsoHit, [...stroke([[-.095, 1.375], [-.06, 1.5]], .022), ...stroke([[.095, 1.375], [.06, 1.5]], .022)], 1, .006, S.apron, wTorso);
      const R = [1.495, 1.52].map(y => { const b = at(tst, y); return ring([0, y, b.z], [1, 0, 0], [0, 0, 1], ell(b.rx + .012, b.rf + .012, b.rb + .012), 10, wTorso(y), {s:S.apron}); });
      loft(G, R, {sf:(i, k, r) => (k < 2 || k > 7) ? -1 : r.s, radial:"xz"});
    }
  }
  if (g.coat){
    const R = [];
    for (const [y, fl] of [[.9, 0], [.82, .012], [.74, .03]]){
      const b = at(tst, Math.max(y, .835)), off = topOff + .004 + fl;
      const w = a => { const sd = Math.sin(a) >= 0 ? 1 : -1, k = (1 - y)*2.2*(.4 + .4*Math.abs(Math.cos(a))); return y > .89 ? wt(B.hips) : wt(B.hips, 1 - k, LEG(sd)[0], k); };
      R.push(ring([0, y, b.z], [1, 0, 0], [0, 0, 1], ell(Math.max(b.rx, .16*hp) + off, Math.max(b.rf, .1) + off, Math.max(b.rb, .11) + off), n, w, {s:S.top}));
    }
    R.unshift(ring([0, .95, 0], [1, 0, 0], [0, 0, 1], ell(.162*hp + topOff + .002, .096 + topOff + .002, .108 + topOff + .002), n, wt(B.hips), {s:S.top}));
    loft(G, R, {sf:(i, k, r) => k === 0 || k === n - 1 ? -1 : r.s});                    // open down the front: the trousers show between its edges
  }
  /* things printed or sewn on the front and back. The ones that make big blocks of colour (an open front, a V neck,
     a tie, lapels) go on the far body too, so nothing changes colour when it takes over; the small ones only up close */
  if (g.collar === "v" && !noHead){
    decal(G, torsoHit, [[[-.045, 1.505], [.045, 1.505], [0, 1.43]]], 1, .004, S.skin, wTorso);
    decal(G, torsoHit, [...stroke([[-.05, 1.51], [0, 1.425], [.05, 1.51]], .014)], 1, .005, S.trim, wTorso);
  }
  if (g.tie && !jacketish) decal(G, torsoHit, [...fan([[-.009, 1.495], [.009, 1.495], [.006, 1.47], [-.006, 1.47]]), ...fan([[-.008, 1.47], [.008, 1.47], [.02, 1.19], [0, 1.165], [-.02, 1.19]])], 1, .006, S.tie, wTorso);
  if (jacketish){
    const vb = g.top === "suit" ? 1.24 : .9;
    // the open front in two halves split down the middle, where the chest has a crease
    decal(G, torsoHit, [[[-.075, 1.5], [0, 1.5], [0, vb]], [[0, 1.5], [.075, 1.5], [0, vb]]], 1, .004, S.inner, wTorso);
    if (g.tie) decal(G, torsoHit, [...fan([[-.009, 1.495], [.009, 1.495], [.006, 1.47], [-.006, 1.47]]), ...fan([[-.008, 1.47], [.008, 1.47], [.018, 1.27], [0, 1.25], [-.018, 1.27]])], 1, .0055, S.tie, wTorso);
    decal(G, torsoHit, [...stroke([[-.085, 1.5], [-.012, vb + .02]], .022), ...stroke([[.085, 1.5], [.012, vb + .02]], .022)], 1, .006, S.top, wTorso, .82);
    if (g.top === "suit" && near) for (const y of [1.2, 1.1]) decal(G, torsoHit, fan([0, 1, 2, 3, 4].map(k => [Math.cos(k/5*TAU)*.007, y + Math.sin(k/5*TAU)*.007])), 1, .005, S.dark, wTorso);
  }
  // (the crest on the far body too: a patch of colour that would otherwise blink out at the switch)
  if (g.crest) decal(G, torsoHit, fan([[.06, 1.385], [.09, 1.385], [.09, 1.36], [.075, 1.345], [.06, 1.36]]), 1, near ? .004 : .007, S.trim, wTorso);
  if (near){
    if (g.zip) decal(G, torsoHit, stroke([[0, 1.5], [0, hem + .05]], .007), 1, .004, S.trim, wTorso);
    if (g.placket){ const bot = g.collar === "polo" ? 1.38 : g.tuck ? 1.05 : 1.0; decal(G, torsoHit, stroke([[0, 1.5], [0, bot]], .016), 1, .003, S.trim, wTorso);
      for (let y = 1.46; y > bot + .02; y -= .075) decal(G, torsoHit, fan([0, 1, 2, 3, 4].map(k => [Math.cos(k/5*TAU)*.0045, y + Math.sin(k/5*TAU)*.0045])), 1, .0045, S.dark, wTorso); }
    if (g.hood){
      decal(G, torsoHit, [...stroke([[-.03, 1.49], [-.032, 1.37]], .007), ...stroke([[.03, 1.49], [.032, 1.37]], .007)], 1, .005, S.trim, wTorso);
      decal(G, torsoHit, fan([[-.1, 1.15], [.1, 1.15], [.115, 1.0], [-.115, 1.0]]), 1, .005, S.top, wTorso, .8);
    }
    if (g.belt || g.tuck) decal(G, torsoHit, fan([[-.016, 1.03], [.016, 1.03], [.016, 1.005], [-.016, 1.005]]), 1, .006, S.metal, wTorso);
  }
  /* props */
  if ((look.props || []).includes("clipboard")){
    const s = 1, [, , Hd] = ARM(s), hx = s*D.shX, hy = D.shY - D.elbowL - D.foreL;
    const T = norm([0, -.45, 1]), X = [1, 0, 0], N = cross(X, T);   // board plane in the hand's own frame (rest pose)
    const c = [hx - s*.1, hy - .06, -.005 + .09], hw = wt(Hd);
    boxG(G, c, [.115, 0, 0], T.map(v => v*.155), N.map(v => v*.006), S.prop, hw);
    boxG(G, addv(c, N, -.007), [.1, 0, 0], T.map(v => v*.135), N.map(v => v*.0015), S.paper, hw);
    boxG(G, addv(addv(c, T, .14), N, -.008), [.03, 0, 0], T.map(v => v*.012), N.map(v => v*.004), S.metal, hw);
  }
  /* the head */
  let headHit = null;
  if (!noHead){
    const hf = headFn(D, F);
    const lats = (near ? [-90, -74, -57, -41, -27, -13, 0, 14, 30, 48, 68, 90] : [-90, -52, -18, 18, 55, 90]).map(v => v*D2R), nh = near ? 14 : 8;
    const stub = look.beard === "stubble";
    G.hit = [];
    const HR = lats.map((lat, i) => {
      const v = []; for (let k = 0; k < nh; k++) v.push([...hf(lat, k/nh*TAU), HEADW]);
      return {v, c:[D.hc[0], hf(lat, 0)[1], D.hc[2]], s:S.skin, lat};
    });
    loft(G, HR, {sf:(i, k, r) => {
      if (!stub) return S.skin;
      const lat = (HR[i].lat + r.lat)/2/D2R, lon = Math.abs(wrap((k + .5)/nh*TAU))/D2R;
      return lon < 112 && (lat < -24 || (lon > 55 && lat < -8)) ? S.stubble : S.skin; }});
    headHit = G.hit; G.hit = null;
    face(G, D, F, look, headHit, hf, !near);              // (the far body too, plainer: no face popping on and off)
    const specs = near && (look.props || []).includes("glasses");
    if (specs) G.hit = [];
    hair(G, D, F, look, hf, near);
    if (specs){ const hairHit = G.hit; G.hit = null; glasses(G, D, F, headHit, headHit.concat(hairHit)); }
    if (look.beard === "beard" || look.beard === "goatee" || look.beard === "full") beard(G, D, hf, near, look.beard);
  }
  return {G, torsoHit, D, hem};
}

/* shoes: a lofted last with a sole you can see, a toe, a heel, a stripe — and studs on football boots */
function shoe(G, D, s, g, near){
  const [, , FT, TO] = LEG(s), lx = s*D.hipX, type = g.footwear, boot = type === "boots", dress = type === "dress";
  const sole = boot ? .011 : dress ? .012 : .024, lift = boot ? .008 : 0, Wm = boot ? .94 : dress ? .96 : 1.06, Lm = dress ? 1.05 : 1;
  // [z, half width, height]: a heel counter and an instep that rise to the ankle collar, tapering down to a low toe
  const sta = [[-.074, .027, .05], [-.062, .036, .066], [-.032, .041, .074], [.018, .044, .07], [.065, .046, .054], [.11, .045, .038], [.152, .039, .027], [.186, .027, .018]];
  const S0 = near ? sta : [sta[0], sta[2], sta[4], sta[6], sta[7]];
  const prof = (w, h) => near
    ? [[0, h], [.62*w, .86*h], [.95*w, .45*h], [w, .1*h], [1.03*w, 0], [1.03*w, -sole], [-1.03*w, -sole], [-1.03*w, 0], [-w, .1*h], [-.95*w, .45*h], [-.62*w, .86*h]]
    : [[0, h], [w, .5*h], [1.03*w, -sole], [-1.03*w, -sole], [-w, .5*h]];
  const R = S0.map(([z, w, h]) => {
    const zz = z*Lm, ww = z > .09 ? (z > .14 ? wt(TO) : wt(FT, .5, TO, .5)) : wt(FT);
    const pts = prof(w*Wm, h), c = [lx - s*.004*(z > .1 ? 1 : 0), lift + sole, zz];
    return {v:pts.map(([u, v]) => [c[0] + u, c[1] + v, c[2], ww]), c, s:S.shoe, z};
  });
  const nP = R[0].v.length, outerK = near ? (s > 0 ? 2 : 8) : (s > 0 ? 1 : 3);
  const soleK = near ? [4, 5, 6] : [2];
  loft(G, R, {sf:(i, k, r) => {
    if (soleK.includes(k)) return S.sole;
    const z = (R[i].z + r.z)/2;
    if (near && (k === outerK || (boot && k === (s > 0 ? 1 : 9))) && z > -.05 && z < .1 && !dress) return S.stripe;
    if (near && !boot && !dress && (k === 0 || k === nP - 1) && z > -.01 && z < .08) return S.lace;
    return S.shoe; }});
  const back = R[0], front = R[R.length - 1];
  cap(G, back, [back.c[0], back.c[1] + .012, back.c[2] - .008, wt(FT)], S.shoe, .85);
  cap(G, front, [front.c[0], front.c[1] - .002, front.c[2] + .012, wt(TO)], S.shoe);
  if (boot && near){
    // six screw-in studs under the sole
    for (const [sx, sz, b] of [[.02, .135, TO], [-.02, .135, TO], [0, .175, TO], [.022, .06, FT], [-.022, .06, FT], [.016, -.05, FT], [-.016, -.05, FT]]){
      const c = [lx + sx, lift/2, sz], w = wt(b), a = .006, bb = .0035;
      const T = [[-a, lift, -a], [a, lift, -a], [a, lift, a], [-a, lift, a]].map(p => [c[0] + p[0], p[1], c[2] + p[2], w]);
      const Bt = [[-bb, 0, -bb], [bb, 0, -bb], [bb, 0, bb], [-bb, 0, bb]].map(p => [c[0] + p[0], p[1], c[2] + p[2], w]);
      for (let k = 0; k < 4; k++){ const k1 = (k + 1) % 4, mid = [(T[k][0] + T[k1][0])/2 - c[0], 0, (T[k][2] + T[k1][2])/2 - c[2]]; G.quad(T[k], T[k1], Bt[k1], Bt[k], S.sole, .8, mid); }
      G.quad(Bt[0], Bt[1], Bt[2], Bt[3], S.sole, .7, [0, -1, 0]);
    }
  }
}

/* the face: eyes (whites, irises, a lid line), brows, a nose, a mouth, ears — cast onto the faceted head. lite: the far
   body's (a few triangles each, no lid line), so the face reads the same from 13 m as from 16 */
function face(G, D, F, look, hit, hf, lite = false){
  const hc = D.hc, hs = D.hs, es = .031*(F.eyes || 1), nose = F.nose || 1, brow = F.brow || 1;
  const onF = (x, y, lift) => { const o = [hc[0] + x*hs, hc[1] + y*hs, 2], t = ray(hit, o, [0, 0, -1]); return t < 0 ? null : [o[0], o[1], 2 - t + lift, HEADW]; };
  const poly = (pts, lift, slot, sh = 1, out = [0, 0, 1]) => { const P = pts.map(p => onF(p[0], p[1], lift)); if (P.some(p => !p)) return; const c = P.reduce((s, p) => [s[0] + p[0]/P.length, s[1] + p[1]/P.length, s[2] + p[2]/P.length], [0, 0, 0]); c.push(HEADW);
    for (let i = 0; i < P.length; i++) G.tri(c, P[i], P[(i + 1) % P.length], slot, sh, sh, sh, out); };
  const beardLift = look.beard === "full" ? .013 : look.beard === "beard" || look.beard === "goatee" ? .008 : 0;
  for (const s of [1, -1]){
    const ex = s*es, ey = .004;
    const white = [], iris = [], lid = [];
    const nw = lite ? 6 : 8, ni = lite ? 5 : 7;
    for (let k = 0; k < nw; k++){ const a = k/nw*TAU; white.push([ex + Math.cos(a)*.0125, ey + Math.sin(a)*.0068 + s*Math.cos(a)*.0008]); }
    for (let k = 0; k < ni; k++){ const a = k/ni*TAU; iris.push([ex - s*.0006 + Math.cos(a)*.006, ey - .0004 + Math.sin(a)*.006]); }
    // (the far head's facets are coarser: everything on it stands a little further off them)
    const lf = lite ? 2.2 : 1;
    poly(white, .0014*lf, S.white);
    poly(iris, .0026*lf, S.iris);
    if (!lite){
      for (let k = 0; k <= 4; k++){ const a = (20 + k*35)*D2R; lid.push([ex + Math.cos(a)*.0128, ey + Math.sin(a)*.0074 + s*Math.cos(a)*.0008]); }
      const lidTri = stroke(lid, .0028); for (const [a, b, c] of lidTri){ const A = onF(a[0], a[1], .003), Bq = onF(b[0], b[1], .003), Cq = onF(c[0], c[1], .003); if (A && Bq && Cq) G.tri(A, Bq, Cq, S.lash, 1, 1, 1, [0, 0, 1]); }
    }
    // brow
    const by = .03 + (brow - 1)*.004, bw = .006*brow*(lite ? 1.15 : 1);
    const bpts = lite ? [[ex - s*.013, by - .001], [ex + s*.016, by]] : [[ex - s*.013, by - .002], [ex + s*.001, by + .0035], [ex + s*.016, by - .0015]];
    for (const [a, b, c] of stroke(bpts, bw)){ const A = onF(a[0], a[1], .003), Bq = onF(b[0], b[1], .003), Cq = onF(c[0], c[1], .003); if (A && Bq && Cq) G.tri(A, Bq, Cq, S.brow, 1, 1, 1, [0, 0, 1]); }
    // ear: a flattened shell standing off the side of the head
    const ey2 = .006, ez = -.006, side = [hc[0] + s*.2, hc[1] + ey2*hs, hc[2] + ez*hs], t = ray(hit, side, [-s, 0, 0]);
    if (t > 0){
      const sx = side[0] - s*t, R = [];
      for (const [dx, ry, rz, sh] of [[-.006, .026, .016, .9], [.007, .027, .016, .9], [.011, .022, .012, .8]])
        R.push(ring([sx + s*dx*hs, side[1] + .002, side[2] - .004], [0, 0, 1], [0, 1, 0], a => [Math.sin(a)*rz*hs, Math.cos(a)*ry*hs], 6, HEADW, {s:S.skin, sh}));
      loft(G, R);
      cap(G, R[2], [sx + s*.013*hs, side[1] + .002, side[2] - .006, HEADW], S.skin, .78);
    }
  }
  // nose: a little faceted wedge
  const nl = .022*nose, nw = .015*Math.sqrt(nose);
  const Bn = onF(0, .004, .001), T = onF(0, -.04, 0), L = onF(-nw, -.046, .002), Rn = onF(nw, -.046, .002), Cb = onF(0, -.05, .002);
  if (Bn && T && L && Rn && Cb){
    T[2] += nl; Cb[2] += nl*.35;
    G.tri(Bn, L, T, S.skin, 1, .92, 1, [-.6, 0, 1]); G.tri(Bn, T, Rn, S.skin, 1, 1, .92, [.6, 0, 1]);
    G.tri(L, Cb, T, S.skin, .8, .72, .9, [-.3, -1, .4]); G.tri(T, Cb, Rn, S.skin, .9, .72, .8, [.3, -1, .4]);
  }
  // mouth: a lip line with a softer lower lip
  const mw = .02, my = -.071, ml = lite ? .0035 : 0;
  const up = [[-mw, my + .0015], [-mw*.45, my + .0005], [0, my + .0018], [mw*.45, my + .0005], [mw, my + .0015]];
  for (const [a, b, c] of stroke(up, .0045)){ const A = onF(a[0], a[1], .002 + beardLift + ml), Bq = onF(b[0], b[1], .002 + beardLift + ml), Cq = onF(c[0], c[1], .002 + beardLift + ml); if (A && Bq && Cq) G.tri(A, Bq, Cq, S.lips, 1, 1, 1, [0, 0, 1]); }
  poly([[-mw*.7, my - .003], [0, my - .0065], [mw*.7, my - .003], [0, my - .0018]], .0018 + beardLift + ml, S.lips, 1.1);
}

/* glasses: two softly squared rims in one plane a little in front of the eyes, a bridge over the nose, and arms that
   run back over the temples — over the hair where it covers them — to rest on the root of each ear and tuck down
   behind it. outer: the head and the hair (the arms lie on whichever is outermost) */
function glasses(G, D, F, hit, outer){
  const hc = D.hc, hs = D.hs, es = .031*(F.eyes || 1);
  const onF = (x, y) => { const t = ray(hit, [hc[0] + x*hs, hc[1] + y*hs, 2], [0, 0, -1]); return t < 0 ? null : 2 - t; };
  const sideAt = (s, y, z) => { const t = ray(outer, [hc[0] + s*.3, y, z], [-s, 0, 0]); return t < 0 ? null : hc[0] + s*.3 - s*t; };
  const gy = .005, hw = .0235, hh = .0145, lw = .0034, rim = [];
  for (const s of [1, -1]) for (let k = 0; k <= 14; k++){ const a = k/14*TAU, c = Math.cos(a), q = Math.sin(a);
    rim.push([s*es + Math.sign(c)*Math.pow(Math.abs(c), .55)*hw, gy + Math.sign(q)*Math.pow(Math.abs(q), .55)*hh, s]); }
  let zp = -1; for (const [x, y] of [...rim, [0, gy + .006]]){ const q = onF(x, y); if (q != null) zp = Math.max(zp, q); }
  if (zp < 0) return;
  zp += .006;
  const P3 = ([x, y]) => [hc[0] + x*hs, hc[1] + y*hs, zp, HEADW];
  const flat = (tris, z = zp, n = 1) => { for (const [a, b, c] of tris){ const A = P3(a), Bq = P3(b), Cq = P3(c); A[2] = Bq[2] = Cq[2] = z; G.tri(A, Bq, Cq, S.dark, 1, 1, 1, [0, 0, n]); } };
  for (const s of [1, -1]){
    const loop = rim.filter(p => p[2] === s).map(p => [p[0], p[1]]);
    flat(stroke(loop, lw)); flat(stroke(loop, lw), zp - .0025, -1);      // a rim with a back to it
    // where the ear joins the head (as face() puts it): the arm comes to rest on top of that root
    const ey = hc[1] + .008*hs, ez = hc[2] - .006*hs - .004, eTop = ey + .02*hs;
    const P = [], W_ = [], R_ = [];
    const ax0 = s*(es + hw)*hs + hc[0], ay0 = hc[1] + (gy + hh*.55)*hs, az0 = zp - .004;
    // from the hinge at the rim's outer edge, level back along the temple, easing down onto the ear, then a short tip
    // tucked down behind it, hidden between the ear and the head
    for (const f of [0, .3, .6, .85, 1]){
      const z = lerp(az0, ez + .004, f), y = lerp(ay0, eTop, sstep(.35, 1, f));
      const xs = sideAt(s, y, z), x = f === 0 ? s*Math.max(Math.abs(ax0), xs == null ? 0 : Math.abs(xs) + .003) : xs == null ? ax0 : xs + s*.003;
      P.push([x, y, z]); W_.push(HEADW); R_.push(.0022);
    }
    { const xs = sideAt(s, eTop - .012, ez - .014); P.push([xs == null ? P[P.length - 1][0] : xs + s*.0015, eTop - .012, ez - .014]); W_.push(HEADW); R_.push(.0018); }
    tube(G, P, R_, 4, W_, S.dark, 1);
  }
  flat(stroke([[-(es - hw*.95), gy + .004], [0, gy + .0085], [es - hw*.95, gy + .004]], lw));
}

/* hair: a shell over the scalp out to a hairline, with each style's own thickness, plus whatever hangs */
const HAIRLINE = [[0, 40], [35, 31], [55, 20], [70, -14], [80, -16], [92, 6], [104, 8], [118, -12], [150, -32], [180, -38]];
const HAIRLINE_F = [[0, 42], [35, 32], [60, 14], [80, -4], [100, -6], [130, -22], [180, -30]];
function hairline(lonDeg, rc, fem){
  const T = fem ? HAIRLINE_F : HAIRLINE, x = Math.abs(lonDeg);
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]){
    const t = (x - T[i - 1][0])/(T[i][0] - T[i - 1][0]); let v = lerp(T[i - 1][1], T[i][1], t);
    if (x < 65) v += rc*(38 - x*.35)*(1 - x/80);                 // a receding hairline lifts the front and temples
    return v;
  }
  return T[T.length - 1][1];
}
function hair(G, D, F, look, hf, near){
  const st = look.hair || "short", rc = look.receding || 0, fem = look.sex === "f";
  if (st === "bald") return;
  const nh = near ? 14 : 8, rows = near ? 6 : 3, hs = D.hs, hc = D.hc;
  const bump = (r, j, k = 1) => (hash3(r*31 + 7, j*17 + 3, hashStr(st)) - .5)*2*k;
  const longish = st === "long";
  let latTop = () => 90;
  if (st === "horseshoe") latTop = lon => Math.abs(lon) < 70 ? -999 : lerp(18, 36, sstep(70, 160, Math.abs(lon)));
  const edgeOf = lon => {
    let e = hairline(lon, rc, fem);
    if (st === "afro") e -= 4;
    if (longish && Math.abs(lon) > 75) e = Math.min(e, -6);
    return e;
  };
  const thick = (t, lon, r, j) => {
    const al = Math.abs(lon), front = al < 40;
    switch (st){
      case "buzz": return .0028;
      case "fade": return t < .45 ? .017 + .003*bump(r, j) : lerp(.017, .0025, sstep(.45, .62, t));
      case "curly": return t > .97 ? .008 : .024 + .012*bump(r, j);
      case "afro": return t > .97 ? .016 : .066 - .02*t*t - .014*sstep(.6, .95, t) + .004*bump(r, j);
      case "messy": return t > .97 ? (front ? .012 : .005) : .014 + .011*Math.abs(bump(r, j));
      case "ponytail": case "bun": return t > .97 ? .004 : .008;
      case "braids": case "cornrows": return .0025;
      case "dreads": return t > .97 ? .007 : .016 + .005*bump(r, j);
      case "long": return t > .97 ? (front ? .006 : .005) : .014 - .004*t;
      case "horseshoe": return t > .97 ? .003 : .008;
      // the barber's cuts: long on top and taken right down at the sides; swept back flat; tufted; a crest front to back
      case "undercut": return t < .5 ? (t > .38 ? .012 : .026 + (front ? .009 : 0) + .003*bump(r, j)) : .0026;
      case "slick": return t > .97 ? (front ? .007 : .004) : .012 + (front && t > .55 ? .005 : 0) - .003*t;
      case "spiky": return t > .97 ? (front ? .01 : .004) : .016 + .02*Math.abs(bump(r, j)) + (front ? .004 : 0);
      case "mohawk": { const side = t*Math.abs(Math.sin(lon*D2R)); return side < .2 ? .034 - .05*side + .006*bump(r, j) : .0024; }
      default: return t > .97 ? (front ? .009 : .004) : lerp(.017, .009, t) + (front && t > .6 ? .004 : 0);
    }
  };
  const fade = st === "fade", big = st === "afro" || st === "curly";      // big hair: its lower sides are lifted a little too
  // the shell, crown to hairline
  const R = [];
  for (let r = 0; r <= rows; r++){
    const t = r/rows, v = [];
    for (let j = 0; j < nh; j++){
      const lon = j/nh*360 > 180 ? j/nh*360 - 360 : j/nh*360, top = latTop(lon), e = edgeOf(lon);
      if (top < e){ v.push(null); continue; }
      const lat = lerp(top, e, Math.pow(t, .9));
      v.push([...hf(lat*D2R, lon*D2R, .0035 + thick(t, lon, r, j)), HEADW]);
    }
    R.push({v, c:hc, s:fade && t > .6 ? S.fade : S.hair, sh:1, t});
  }
  const ok = (i, k) => R[i].v[k] && R[i].v[(k + 1) % nh] && R[i + 1].v[k] && R[i + 1].v[(k + 1) % nh];
  // a hairline the scalp shows up to: stitch rows, skipping holes (a horseshoe has none on top)
  for (let i = 0; i < rows; i++) for (let k = 0; k < nh; k++){
    if (!ok(i, k)) continue;
    const a = R[i].v[k], b = R[i].v[(k + 1) % nh], c = R[i + 1].v[(k + 1) % nh], d = R[i + 1].v[k];
    const m = [(a[0] + c[0])/2 - hc[0], (a[1] + c[1])/2 - hc[1], (a[2] + c[2])/2 - hc[2]], s = R[i + 1].s, f = under(a, b, c, m)*(big ? 1 + .2*R[i + 1].t : 1);
    G.tri(a, b, c, s, f, f, f, m); G.tri(a, c, d, s, f, f, f, m);
  }
  // the edge folds back down into the scalp so the hair has thickness, not a paper edge (lit like hair, not a dark band)
  const edges = [rows]; if (st === "horseshoe") edges.push(0);
  for (const r of edges) for (let j = 0; j < nh; j++){
    const a = R[r].v[j], b = R[r].v[(j + 1) % nh]; if (!a || !b) continue;
    const lonA = j/nh*360, lonB = (j + 1)/nh*360, la = r ? edgeOf(wrap(lonA*D2R)/D2R) : latTop(wrap(lonA*D2R)/D2R), lb = r ? edgeOf(wrap(lonB*D2R)/D2R) : latTop(wrap(lonB*D2R)/D2R);
    // chamfered: the fold meets the scalp a little beyond the hairline, so it faces out like the hair rather than down into shadow
    const ch = r ? -4.5 : 4.5, A2 = [...hf((la + ch)*D2R, lonA*D2R, -.001), HEADW], B2 = [...hf((lb + ch)*D2R, lonB*D2R, -.001), HEADW];
    const inner = r ? R[r - 1].v[j] : R[1].v[j]; if (!inner) continue;
    const out = sub(a, inner);
    G.quad(a, b, B2, A2, R[r].s, .9*under(a, b, B2, out), out);
  }
  const lowW = (y) => y > hc[1] - .1 ? HEADW : wt(B.head, .55, B.chest, .45);
  if (longish){
    // a curtain falling behind the shoulders, double sided
    const len = fem ? .3 : .19, Rr = [], Ri = [];
    const cols = []; for (let j = 0; j < nh; j++){ const lon = j/nh*360; if (lon >= 75 && lon <= 285) cols.push(j); }
    const drop = near ? [0, .3, .6, 1] : [0, 1];
    for (const f of drop){
      const vo = [], vi = [];
      for (const j of cols){
        const p = R[rows].v[j]; if (!p) continue;
        const lon = j/nh*TAU, out = [Math.sin(lon), 0, Math.cos(lon)];
        const y = p[1] - f*len, spread = f*.018, back = -f*.035;
        const q = [p[0] + out[0]*spread, y, p[2] + out[2]*spread + back + (f > 0 ? -.006 : 0)];
        vo.push([...q, lowW(y)]); vi.push([q[0] - out[0]*.005, q[1], q[2] - out[2]*.005, lowW(y)]);
      }
      Rr.push({v:vo, c:[hc[0], p0y(R, rows) - f*len, hc[2] + .01], s:S.hair, sh:1 - f*.15}); Ri.push({v:vi, c:[hc[0], p0y(R, rows) - f*len, hc[2] + .01], s:S.hair, sh:.55});
    }
    loft(G, Rr, {open:true, radial:"xz"}); loft(G, Ri, {open:true, radial:"xz", inside:true});
  }
  if (st === "ponytail"){
    const P = [[0, .045, -.1], [0, -.005, -.135], [0, -.08, -.15], [0, -.16, -.14], [0, -.22, -.12]].map(p => [hc[0] + p[0]*hs, hc[1] + p[1]*hs, hc[2] + p[2]*hs]);
    tube(G, P, [.026, .03, .027, .02, .01], near ? 6 : 4, P.map(p => lowW(p[1])), S.hair, .95);
    tube(G, [P[0], addv(P[0], norm(sub(P[1], P[0])), .012)], [.029, .029], near ? 6 : 4, [HEADW, HEADW], S.dark, 1, false);
  }
  if (st === "bun"){
    const c = [hc[0], hc[1] + .06*hs, hc[2] - .085*hs], Rr = [];
    for (const la of [-60, -20, 20, 60]){ const y = Math.sin(la*D2R)*.03, r = Math.cos(la*D2R)*.036; Rr.push(ring([c[0], c[1] + y, c[2] - y*.4], [1, 0, 0], [0, 0, 1], a => [Math.sin(a)*r, Math.cos(a)*r], near ? 7 : 5, HEADW, {s:S.hair, sh:.95})); }
    loft(G, Rr); cap(G, Rr[0], [c[0], c[1] - .034, c[2] + .014, HEADW], S.hair, .8); cap(G, Rr[3], [c[0], c[1] + .036, c[2] - .014, HEADW], S.hair);
  }
  if ((st === "braids" || st === "cornrows") && near){
    // cornrows running back over the scalp, and a few braids hanging behind
    for (const ph of [-.6, -.36, -.12, .12, .36, .6]){
      const P = [];
      for (let i = 0; i <= 8; i++){ const ps = (38 + i*(205 - 38)/8)*D2R, d = [0, Math.sin(ps), Math.cos(ps)], c = Math.cos(ph), s = Math.sin(ph);
        const dd = [d[0]*c - d[1]*s, d[0]*s + d[1]*c, d[2]], lat = Math.asin(clamp(dd[1], -1, 1)), lon = Math.atan2(dd[0], dd[2]); P.push(hf(lat, lon, .0065)); }
      const hang = st === "braids" && Math.abs(ph) < .4;
      if (hang){ const e = P[P.length - 1]; P.push([e[0], e[1] - .06, e[2] - .012], [e[0], e[1] - .13, e[2] - .01]); }
      tube(G, P, P.map((p, i) => i > 8 ? .0065 : .0058), 4, P.map(p => lowW(p[1])), S.hair, .9, hang);
    }
  }
  if (st === "dreads"){
    const cnt = near ? 13 : 6;
    for (let i = 0; i < cnt; i++){
      const lon = (62 + i*(236/(cnt - 1)))*D2R, la = (edgeOf(lon/D2R) + 6)*D2R, p0 = hf(la, lon, .012), out = [Math.sin(lon), 0, Math.cos(lon)], L = .15 + .08*hash3(i, 3, 9);
      const P = [p0, [p0[0] + out[0]*.012, p0[1] - L*.45, p0[2] + out[2]*.012 - .01], [p0[0] + out[0]*.02, p0[1] - L, p0[2] + out[2]*.02 - .018]];
      tube(G, P, [.012, .011, .008], near ? 4 : 3, P.map(p => lowW(p[1])), S.hair, .9);
    }
  }
}
/* hair that faces the ground (the underside of an afro, the fold at a hairline) gets only the dim ground light and
   would read as a black rim round the face whatever the colour: it is lifted as if lit by light bouncing off the
   face and shoulders */
function under(a, b, c, out){
  let n = cross(sub(b, a), sub(c, a)); if (dot(n, out) < 0) n = n.map(v => -v);
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return 1 + 2.6*Math.max(0, -n[1]/l);
}
const p0y = (R, rows) => { let y = 0, n = 0; for (const p of R[rows].v) if (p){ y += p[1]; n++; } return n ? y/n : 0; };
// a short beard over the jaw and chin, with the moustache; the mouth is lifted above it
const BEARDLINE = [[0, -27], [16, -29], [30, -38], [52, -31], [72, -12], [100, -2]];
// kind: "beard" (short, ear to ear), "full" (thicker and lower), "goatee" (the chin and the moustache only)
function beard(G, D, hf, near, kind = "beard"){
  const cols = near ? 12 : 6, rows = near ? 4 : 2, R = [], span = kind === "goatee" ? 30 : 100, deep = kind === "full" ? .0115 : .0065;
  const top = lon => { const x = Math.abs(lon); for (let i = 1; i < BEARDLINE.length; i++) if (x <= BEARDLINE[i][0]) return lerp(BEARDLINE[i - 1][1], BEARDLINE[i][1], (x - BEARDLINE[i - 1][0])/(BEARDLINE[i][0] - BEARDLINE[i - 1][0])); return -2; };
  // down over the jaw to just under it (not round under the chin to the throat, where it would only be seen in shadow)
  const bot = lon => lerp(kind === "full" ? -74 : -68, kind === "full" ? -54 : -50, Math.abs(lon)/100);
  for (let r = 0; r <= rows; r++){
    const t = r/rows, v = [];
    for (let j = 0; j <= cols; j++){ const lon = -span + j*2*span/cols, lat = lerp(top(lon), bot(lon), Math.pow(t, .8));
      v.push([...hf(lat*D2R, lon*D2R, r === 0 ? .0018 : deep + .002*t), HEADW]); }
    R.push({v, sh:r === 0 ? .95 : 1 + .12*t});
  }
  for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++){
    const a = R[i].v[k], b = R[i].v[k + 1], c = R[i + 1].v[k + 1], d = R[i + 1].v[k], m = sub([(a[0] + c[0])/2, (a[1] + c[1])/2, (a[2] + c[2])/2], D.hc);
    G.tri(a, b, c, S.hair, R[i].sh, R[i].sh, 1, m); G.tri(a, c, d, S.hair, R[i].sh, 1, 1, m);
  }
  // the lower edge tucks back into the skin, chamfered like the hairline
  for (let k = 0; k < cols; k++){
    const l0 = -span + k*2*span/cols, l1 = l0 + 2*span/cols, a = R[rows].v[k], b = R[rows].v[k + 1];
    const A2 = [...hf((bot(l0) - 5)*D2R, l0*D2R, -.001), HEADW], B2 = [...hf((bot(l1) - 5)*D2R, l1*D2R, -.001), HEADW];
    G.quad(a, b, B2, A2, S.hair, 1.1, sub(a, R[rows - 1].v[k]));
  }
}

/* ---------- caching: bodies by shape, colours per person ---------- */
const SHAPES = new Map();
function shapeKey(look, det, noHead){
  const g = garb(look.outfit), F = look.face || {}, q = v => Math.round(((v || 1) - 1)/.06);
  return [det, noHead ? 1 : 0, look.sex, look.build, look.hair, look.beard || "", Math.round((look.receding || 0)*4), q(F.jaw), q(F.nose), q(F.brow), q(F.eyes), q(F.chin),
    g.top, g.sleeves, g.collar, g.legwear, g.footwear, g.legs, g.tuck, g.belt, g.gloves, g.bib, g.apron, g.tie, g.coat, g.hood, g.zip, g.crest, g.placket,
    (look.props || []).join("+"), Math.round(sstep(45, 78, look.age || 25)*4)].join("|");
}
function shape(look, det, noHead){
  const key = shapeKey(look, det, noHead);
  let sp = SHAPES.get(key);
  if (sp) return sp;
  const {G, torsoHit, D} = build(look, det, noHead), n = G.sl.length;
  const pos = new Float32Array(G.p), nor = new Float32Array(n*3);
  for (let i = 0; i < n; i += 3){
    const a = i*3, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
    const [nx, ny, nz] = G.tn[i/3] || norm([uy*vz - uz*vy, uz*vx - ux*vz, ux*vy - uy*vx]);
    for (let k = 0; k < 3; k++){ nor[a + k*3] = nx; nor[a + k*3 + 1] = ny; nor[a + k*3 + 2] = nz; }
  }
  const g = garb(look.outfit), rough = new Uint8Array(n);
  for (let i = 0; i < n; i++){ const nm = SLOTS[G.sl[i]]; let r = ROUGH[nm] == null ? .92 : ROUGH[nm]; if (nm === "shoe" && g.footwear === "dress") r = .3; if (nm === "shoe" && g.footwear === "trainers") r = .7; rough[i] = Math.round(r*255); }
  sp = {key, n, D, torsoHit, slot:new Uint8Array(G.sl), shade:new Float32Array(G.sh), attr:{
    position:new THREE.BufferAttribute(pos, 3), normal:new THREE.BufferAttribute(nor, 3),
    skinIndex:new THREE.Uint8BufferAttribute(G.bi, 4), skinWeight:new THREE.BufferAttribute(new Float32Array(G.bw), 4),
    rough:new THREE.BufferAttribute(rough, 1, true)}, nums:new Map()};
  SHAPES.set(key, sp);
  return sp;
}
const SHARED = ["position", "normal", "skinIndex", "skinWeight", "rough"];
const _c = new THREE.Color();
function colours(sp, pal){
  const n = sp.n, a = new Uint16Array(n*3);
  for (let i = 0; i < n; i++){ const s = sp.slot[i]*3, f = sp.shade[i]*65535; a[i*3] = Math.min(65535, pal[s]*f); a[i*3 + 1] = Math.min(65535, pal[s + 1]*f); a[i*3 + 2] = Math.min(65535, pal[s + 2]*f); }
  return new THREE.BufferAttribute(a, 3, true);
}
const SPORTY = new Set(["kit", "training", "gk", "tracksuit"]);
function palette(look){
  const o = look.outfit || {}, skin = hex(look.skin) ?? 0xd9a882, hair = hex(look.hairColor) ?? 0x2e2018;
  const top = hex(o.shirt) ?? 0x2c66b8, legs = (garb(o).legwear === "kitshorts" || garb(o).legwear === "shorts") ? (hex(o.shorts) ?? hex(o.trousers)) : (hex(o.trousers) ?? hex(o.shorts));
  const bottom = legs ?? 0x2f3540, lum = new THREE.Color(top), L = .3*lum.r + .59*lum.g + .11*lum.b;
  const C = {skin, hair, lips:mixHex(shadeHex(skin, .82), 0x9a4a46, .3), brow:shadeHex(hair, .8), white:0xeeeae2, iris:hex(look.eyes) ?? 0x3a2618,
    // a kit's or a tracksuit's trim stands out; an ordinary top's collar ribbing and cuffs are its own colour, a shade off
    top, trim:hex(o.trim) ?? (SPORTY.has(o.type) ? (L > .6 ? shadeHex(top, .55) : mixHex(top, 0xffffff, .75)) : L < .025 ? mixHex(top, 0xffffff, .06) : shadeHex(top, .78)), bottom, btrim:hex(o.btrim) ?? shadeHex(bottom, .7),
    socks:hex(o.socks) ?? top, strim:hex(o.sockTrim) ?? hex(o.trim) ?? 0xf2f2f0, shoe:hex(o.shoes) ?? 0x18191c, sole:hex(o.sole) ?? (garb(o).footwear === "trainers" ? 0xeeeeea : 0x2a2a2a),
    stripe:hex(o.stripe) ?? 0xf2f2f0, bib:hex(o.bib) ?? 0xd8ff3a, glove:hex(o.glove) ?? 0xe8e8e2, gtrim:hex(o.gloveTrim) ?? 0x1c1c22, inner:hex(o.inner) ?? 0xf2f2ee,
    tie:hex(o.tie) ?? 0x7a1f2b, prop:0x5b4330, paper:0xf2f0e8, num:hex(o.numCol) ?? (L > .55 ? 0x1b1d22 : 0xf4f4f0), stubble:mixHex(skin, hair, .32), fade:mixHex(skin, hair, .62),
    lash:mixHex(hair, 0x0b0908, .6), lace:hex(o.lace) ?? 0xf0f0ec, apron:hex(o.apron) ?? 0x3b2a20, metal:0xb9bec4, belt:hex(o.belt) ?? 0x2a1e16, dark:0x17181b};
  const pal = new Float32Array(SLOTS.length*3);
  SLOTS.forEach((nm, i) => { _c.setHex(C[nm] ?? 0xff00ff); pal[i*3] = _c.r; pal[i*3 + 1] = _c.g; pal[i*3 + 2] = _c.b; });
  return pal;
}

/* ---------- the shared material: matte cloth, soft skin, glossier boots — roughness rides on each vertex ---------- */
let MAT = null, MATLOW = null;
const lowGfx = () => typeof GFX !== "undefined" && GFX.low;
export function humanMaterial(){
  if (lowGfx()){ if (!MATLOW){ MATLOW = new THREE.MeshLambertMaterial({vertexColors:true, flatShading:true}); MATLOW.userData.keep = true; } return MATLOW; }
  if (!MAT){
    MAT = new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:1, metalness:0, envMapIntensity:.5});
    MAT.userData.keep = true;
    MAT.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float rough;\nvarying float vRough;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRough = rough;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vRough;").replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRough;");
    };
    MAT.customProgramCacheKey = () => "human-rough-1";
  }
  return MAT;
}

/* ---------- shirt numbers: stroked digits cast onto the back, one tiny extra mesh seen only up close ---------- */
const arcP = (cx, cy, rx, ry, a0, a1, n = 10) => { const p = []; for (let i = 0; i <= n; i++){ const a = (a0 + (a1 - a0)*i/n)*D2R; p.push([cx + Math.cos(a)*rx, cy + Math.sin(a)*ry]); } return p; };
const DIGITS = {
  0: [arcP(.5, .5, .4, .46, 90, 450, 16)],
  1: [[[.2, .78], [.56, 1], [.56, 0]]],
  2: [[...arcP(.5, .7, .4, .3, 165, -25, 9), [.06, 0], [.96, 0]]],
  3: [arcP(.48, .74, .37, .26, 155, -90, 8), arcP(.48, .27, .43, .27, 90, -160, 9)],
  4: [[[.72, 0], [.72, 1], [.04, .3], [.98, .3]]],
  5: [[[.9, 1], [.2, 1], [.13, .56], ...arcP(.5, .33, .43, .33, 125, -160, 9)]],
  6: [[...arcP(.58, .58, .4, .42, 75, 180, 6), ...arcP(.5, .3, .42, .3, 180, 540, 14)]],
  7: [[[.04, 1], [.96, 1], [.36, 0]]],
  8: [arcP(.5, .76, .34, .24, -90, 270, 14), arcP(.5, .28, .42, .28, 90, 450, 14)],
  9: [[...arcP(.5, .7, .42, .3, 0, 360, 14), ...arcP(.42, .42, .5, .42, 0, -100, 6)]]
};
function numberMesh(sp, num, pal, chestY){
  const k = num + "|" + Array.from(pal.slice(S.num*3, S.num*3 + 3)).join(",");
  let geo = sp.nums.get(k);
  if (!geo){
    const G = new Geo(), str = String(num).slice(0, 2), h = .19, w = h*.6, gap = .03, total = str.length*w + (str.length - 1)*gap, cy = 1.155;
    const tris = [];
    [...str].forEach((ch, i) => { const x0 = -total/2 + i*(w + gap);
      for (const line of DIGITS[ch] || []) for (const t of stroke(line.map(([u, v]) => [x0 + u*w, cy + v*h]), .026)) tris.push(t.map(p => [-p[0], p[1]])); });
    decal(G, sp.torsoHit, tris, -1, .006, S.num, () => wt(B.chest));
    const n = G.sl.length, pos = new Float32Array(G.p), col = new Uint16Array(n*3), rough = new Uint8Array(n).fill(200);
    for (let i = 0; i < n; i++){ pos[i*3 + 1] -= chestY; for (let c = 0; c < 3; c++) col[i*3 + c] = pal[S.num*3 + c]*65535; }
    geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3, true)); geo.setAttribute("rough", new THREE.BufferAttribute(rough, 1, true));
    const nor = new Float32Array(n*3); for (let i = 0; i < n; i++){ const f = G.tn[Math.floor(i/3)] || [0, 0, -1]; nor.set(f, i*3); }
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.computeBoundingSphere();
    sp.nums.set(k, geo);
  }
  const m = new THREE.Mesh(geo, humanMaterial()); m.userData.keep = true; m.receiveShadow = true;
  return m;
}

/* ---------- people ---------- */
const LIVE = new Set();
const IDENT = new THREE.Matrix4();
function normLook(look){
  const L = Object.assign({sex:"m", age:26, skin:0xd9a882, height:1, build:"average", hair:"short", hairColor:0x2e2018, beard:"", eyes:0x3a2618, receding:0, face:{}, props:[], seed:1}, look);
  L.outfit = Object.assign({type:"casual"}, look.outfit || {});
  // face, age and hairline are snapped to a few steps, so people who look alike share one cached body
  const F = Object.assign({jaw:1, nose:1, brow:1, eyes:1, chin:1}, look.face || {}), q = v => Math.round(((+v || 1) - 1)/.06)*.06 + 1;
  L.face = {jaw:q(F.jaw), nose:q(F.nose), brow:q(F.brow), eyes:q(F.eyes), chin:q(F.chin)};
  L.receding = Math.round(clamp(+L.receding || 0, 0, 1)*4)/4;
  return L;
}
export function human(look = {}, opts = {}){
  look = normLook(look);
  const noHead = !!opts.noHead, spN = shape(look, 1, noHead), spF = opts.lod === false ? null : shape(look, 0, noHead), D = spN.D;
  const g = new THREE.Group(); g.name = "person";
  const rest = restPos(D), bones = rest.map((r, i) => { const b = new THREE.Bone(); b.name = BN[i]; return b; });
  bones.forEach((b, i) => { const p = PAR[i], r = rest[i], pr = p < 0 ? [0, 0, 0] : rest[p]; b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]); if (p >= 0) bones[p].add(b); });
  g.add(bones[0]);
  const skel = new THREE.Skeleton(bones, rest.map(r => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2])));
  const pal = palette(look);
  const mk = sp => {
    const geo = new THREE.BufferGeometry();
    for (const k of SHARED) geo.setAttribute(k, sp.attr[k]);
    geo.setAttribute("color", colours(sp, pal));
    const m = new THREE.SkinnedMesh(geo, humanMaterial());
    m.bind(skel, IDENT);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 2.1);
    m.userData.keep = true; m.receiveShadow = true; m.castShadow = !!opts.cast;
    g.add(m); return m;
  };
  const near = mk(spN), far = spF ? mk(spF) : null;
  if (far) far.visible = false;
  const og = garb(look.outfit);
  let num = null;
  if (og.number && !og.bib && !noHead){ num = numberMesh(spN, og.number, pal, D.chestY); bones[B.chest].add(num); }
  const r = rng((look.seed | 0) + 77);
  const h = {g, look, D, bones, skel, near, far, num, isHuman:true, pose:new Float32Array(NP), from:new Float32Array(NP), tgt:new Float32Array(NP),
    rest:rest.map((p, i) => { const q = PAR[i] < 0 ? [0, 0, 0] : rest[PAR[i]]; return new THREE.Vector3(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }),
    bw:1, mode:"", at:0, t:r()*100, ph:r(), v:0, turn:0, ry0:null, mw:0, gw:0, lod:1, seed:r(), stance:.01 + r()*.03, fz:(r() - .5)*.08, arm:r(), gen:W.ticks, scale:look.height || 1};
  g.scale.setScalar(h.scale); g.userData.human = h;
  h.dispose = () => {
    LIVE.delete(h);
    for (const m of [near, far]) if (m){ for (const k of SHARED) m.geometry.deleteAttribute(k); m.geometry.dispose(); }
    skel.dispose();
    if (g.parent) g.parent.remove(g);
  };
  if (opts.track !== false){ LIVE.add(h); hook(W.scene); }
  animateHuman(h, 0, "idle"); h.bw = 1;
  return h;
}
// your own body, for first person: no head, no hair; arms, hands, legs and feet in the same style
export function playerRig(look = {}, o = {}){
  const h = human(look, {noHead:o.firstPerson !== false, lod:false, track:false, cast:!!o.cast});
  h.near.frustumCulled = false;
  return h;
}

/* ---------- once a frame, before drawing: near or far body, numbers up close, and the blobs underfoot ---------- */
// where the camera (in first person: you) was at the last frame drawn, so people can step out of your way
// (x is read through an accessor so that every time anyone sets it — drawing, world.js after drawing, putting you somewhere
// — is counted: you() below then knows whether VIEW or your own body is the fresher word on where you are)
let FIX = 0, NOTE = 0;
const _VX = {x:0};
export const VIEW = {get x(){ return _VX.x; }, set x(v){ _VX.x = v; FIX++; }, y:-99, z:0, fx:0, fz:-1, scene:null};   // fx, fz: the way the camera looks, flat
/* you(): where you are now, as best anyone can tell — {x, z, here (you are in the place being stepped), n (changes with
   every new fix)}. VIEW is set after each frame is drawn, but the world is also stepped without drawing: a long frame
   lived in slices, a test driving it step by step. Your own body (world.js poses it, named "me-fp" or "me-tp", where
   you stand once a step, after everyone else has moved) is noted as it is posed; whichever of the two was set last is
   the answer. (In first person the body may stand a few cm back from where you are, leaning off a wall.) */
const YOU = {x:0, z:0, scene:null, fix:-1}, HERE = {x:0, z:0, here:false, n:0};
function noteYou(h){
  let o = h.g; while (o.parent) o = o.parent;
  YOU.scene = o.isScene ? o : null; YOU.x = h.g.position.x; YOU.z = h.g.position.z; YOU.fix = FIX; NOTE++;
}
export function you(){
  const rig = !!YOU.scene && YOU.fix === FIX;
  HERE.x = rig ? YOU.x : VIEW.x; HERE.z = rig ? YOU.z : VIEW.z; HERE.n = FIX + NOTE;
  HERE.here = !!W.scene && (rig ? YOU.scene === W.scene : VIEW.scene === W.scene || YOU.scene === W.scene);
  return HERE;
}
/* onFirstView(fn): fn(VIEW) runs once, just before the first frame of the place being built now is drawn — VIEW then
   holds where the camera is for that frame (the first moment anyone knows where you arrived), so whatever stands in
   your face can be moved before anybody sees it */
const FIRST = {gen:null, fns:[]};
export function onFirstView(fn){ if (FIRST.gen !== W.ticks){ FIRST.gen = W.ticks; FIRST.fns = []; } FIRST.fns.push(fn); hook(W.scene); }
let BLOBS = null;
const _cam = new THREE.Vector3(), _mx = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3();
function blobs(){
  if (BLOBS) return BLOBS;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,.62)"); gr.addColorStop(.55, "rgba(0,0,0,.34)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.userData.per = 1;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI/2);
  const m = new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, opacity:.55, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  m.userData.keep = true;
  BLOBS = new THREE.InstancedMesh(geo, m, 96); BLOBS.frustumCulled = false; BLOBS.renderOrder = 1; BLOBS.userData.keep = true; BLOBS.count = 0;
  return BLOBS;
}
function hook(scene){
  if (!scene || scene.userData.humans) return;
  scene.userData.humans = true;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function(renderer, sc, camera, rt){
    prev.call(this, renderer, sc, camera, rt);
    camera.getWorldPosition(_cam); VIEW.x = _cam.x; VIEW.y = _cam.y; VIEW.z = _cam.z; VIEW.scene = sc;
    { const e = camera.matrixWorld.elements, l = Math.hypot(e[8], e[10]) || 1; VIEW.fx = -e[8]/l; VIEW.fz = -e[10]/l; }
    if (FIRST.gen === W.ticks && FIRST.fns.length){ const fns = FIRST.fns; FIRST.fns = []; for (const fn of fns) try { fn(VIEW); } catch(err){ console.error(err); } }
    let n = 0;
    const bl = blobs();
    for (const h of LIVE){
      // where is it: in this scene, and shown?
      let o = h.g, vis = true;
      while (o.parent){ if (!o.visible) vis = false; o = o.parent; }
      if (o !== sc){ if (h.gen !== W.ticks) h.dispose(); continue; }
      if (!vis || !h.g.visible) continue;
      const e = h.g.matrixWorld.elements, d = Math.hypot(e[12] - _cam.x, e[13] - _cam.y, e[14] - _cam.z);
      if (h.far){ if (h.lod && d > 15) h.lod = 0; else if (!h.lod && d < 13.5) h.lod = 1; h.near.visible = !!h.lod; h.far.visible = !h.lod; }
      if (h.num) h.num.visible = !!h.lod && d < 9.5;
      if (n < bl.instanceMatrix.count){
        const hb = h.bones[B.hips].matrixWorld.elements, s = .5*h.scale*(1 + Math.max(0, h.pose[61])*.2);
        _ps.set(hb[12], e[13] + .012, hb[14]); _sc.set(s*1.05, 1, s*1.3); _q0.setFromAxisAngle(_up, Math.atan2(e[8], e[10]));
        bl.setMatrixAt(n++, _mx.compose(_ps, _q0, _sc));
      }
    }
    bl.count = n;
    if (n){ if (bl.parent !== sc) sc.add(bl); bl.instanceMatrix.needsUpdate = true; }
  };
}
const _up = new THREE.Vector3(0, 1, 0);

/* ---------- animation ---------- */
export const CONTACT = {kick:.42, pass:.44, trap:.42, header:.5};
const PRESET = {walk:1.4, jog:3.2, run:5, sprint:7.6};
const _A = new Float32Array(NP), _B = new Float32Array(NP);
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _V = new THREE.Vector3(), _P = new THREE.Vector3(), _ONE = new THREE.Vector3(1, 1, 1);
const R3 = (T, b, x, y = 0, z = 0) => { T[b*3] = x; T[b*3 + 1] = y; T[b*3 + 2] = z; };
// the body-space matrix of a bone under pose T (rest rotations are all identity)
function frameOf(h, T, b, out){
  const chain = []; for (let i = b; i > 0; i = PAR[i]) chain.unshift(i);
  out.identity();
  for (const i of chain){
    _P.copy(h.rest[i]); if (i === B.hips){ _P.x += T[60]; _P.y += T[61]; _P.z += T[62]; }
    _E.set(T[i*3], T[i*3 + 1], T[i*3 + 2], "XYZ"); _Q.setFromEuler(_E);
    out.multiply(_M2.compose(_P, _Q, _ONE));
  }
  return out;
}
// how far a two-bone limb reaches for a target d away: exact until nearly straight, then easing into full stretch
// (a hard clamp snaps the knee straight the frame the target slips out of reach)
function softReach(d, L1, L2){
  const mx = L1 + L2 - 1e-4, mn = Math.abs(L1 - L2) + .02, ls = .985*mx;
  return d < mn ? mn : d <= ls ? d : ls + (mx - ls)*(1 - Math.exp(-(d - ls)/(mx - ls)));
}
// two-bone IK in the parent's frame: the limb hangs along -y at rest; bend = +1 (knee, shin folds back) or -1 (elbow)
function twoBone(T, b0, b1, v, L1, L2, bend){
  let d = v.length(); const dc = softReach(d, L1, L2); if (d < 1e-6){ v.set(0, -1, 0); d = 1; } v.multiplyScalar(dc/d); d = dc;
  const k = Math.acos(clamp((d*d - L1*L1 - L2*L2)/(2*L1*L2), -1, 1)), a = -(L1 + L2*Math.cos(k)), bb = bend*-L2*Math.sin(k);
  const phi = Math.asin(clamp(v.x/(-a), -1, 1)), p = a*Math.cos(phi);
  const th = wrap(Math.atan2(v.z, v.y) - Math.atan2(bb, p));
  T[b0*3] = th; T[b0*3 + 1] = 0; T[b0*3 + 2] = phi; T[b1*3] = bend*k;
  return th;
}
function legIK(h, T, s, x, y, z, pitch = 0, toe = 0){
  const [th, sh, ft, to] = LEG(s), D = h.D;
  frameOf(h, T, B.hips, _M).invert();
  _V.set(x, y, z).applyMatrix4(_M).sub(h.rest[th]);
  const t = twoBone(T, th, sh, _V, D.hipY - D.kneeY, D.kneeY - D.ankY, 1);
  R3(T, ft, pitch - t - T[sh*3] - T[B.hips*3]); R3(T, to, toe);
}
/* arm IK with an elbow pole: the wrist goes to (x, y, z) in body space, the elbow swings toward pole (in the
   chest's frame, given for the left arm and mirrored for the right), and the forearm folds about its own x.
   The default pole keeps the elbows back and a little out, so forearms come forward past the ribs, not through them. */
const _Wv = new THREE.Vector3(), _Ev = new THREE.Vector3(), _Xa = new THREE.Vector3(), _Ya = new THREE.Vector3(), _Za = new THREE.Vector3(), _Pv = new THREE.Vector3();
const POLE = [.3, -.25, -1];
function armIK(h, T, s, x, y, z, twist = 0, wrist = 0, pole = POLE){
  const [ua, fa, hd] = ARM(s), D = h.D, L1 = D.elbowL, L2 = D.foreL;
  frameOf(h, T, B.chest, _M).invert();
  _Wv.set(x, y, z).applyMatrix4(_M).sub(h.rest[ua]);
  let d = _Wv.length(); if (d < 1e-6){ _Wv.set(0, -1, 0); d = 1; }
  const dc = softReach(d, L1, L2); _Wv.multiplyScalar(dc/d); d = dc;
  const u = _Ya.copy(_Wv).divideScalar(d);
  _Pv.set(s*pole[0], pole[1], pole[2]); _Pv.addScaledVector(u, -_Pv.dot(u));
  if (_Pv.lengthSq() < 1e-8) _Pv.set(0, 0, -1).addScaledVector(u, -u.z);
  _Pv.normalize();
  const ca = clamp((L1*L1 + d*d - L2*L2)/(2*L1*d), -1, 1);
  _Ev.copy(u).multiplyScalar(ca*L1).addScaledVector(_Pv, Math.sqrt(1 - ca*ca)*L1);             // the elbow
  // the upper arm's frame: -y down the bone, +z the way the forearm folds
  _Ya.copy(_Ev).normalize().negate();
  _Za.copy(_Wv).sub(_Ev); _Za.addScaledVector(_Ya, -_Za.dot(_Ya));
  if (_Za.lengthSq() < 1e-8) _Za.copy(_Pv).negate().addScaledVector(_Ya, _Pv.dot(_Ya));
  _Za.normalize(); _Xa.crossVectors(_Ya, _Za);
  _Q.setFromRotationMatrix(_M2.makeBasis(_Xa, _Ya, _Za)); _E.setFromQuaternion(_Q, "XYZ");
  R3(T, ua, _E.x, _E.y, _E.z);
  const k = Math.PI - Math.acos(clamp((L1*L1 + L2*L2 - d*d)/(2*L1*L2), -1, 1));
  R3(T, fa, -k, twist, 0); R3(T, hd, wrist);
}
/* a hand laid flat on something: the wrist goes to (x, y, z) in body space, then the hand turns so the fingers
   point along dir and the palm lies on the surface whose up is up. The part of that turn about the forearm's own
   axis is done by the forearm (the way a real forearm turns the palm over), only the rest at the wrist. The wrist
   joint sits PALM above the surface when the hand lies flat. */
const PALM = .029, _UPV = new THREE.Vector3(0, 1, 0), _Fm = new THREE.Matrix4(), _Fx = new THREE.Vector3(), _Fy = new THREE.Vector3(), _Fz = new THREE.Vector3();
const _Qh = new THREE.Quaternion(), _Qf = new THREE.Quaternion(), _Qy = new THREE.Quaternion();
function plantHand(h, T, s, x, y, z, dir, up = _UPV, pole = POLE, follow = .5){
  armIK(h, T, s, x, y, z, 0, 0, pole);
  const fa = ARM(s)[1], hd = ARM(s)[2];
  // the fingers point partly the way the forearm comes in, so the wrist isn't bent hard sideways
  const e = frameOf(h, T, fa, _Fm).elements;
  _Fx.set(-e[4], -e[5], -e[6]).addScaledVector(up, (e[4]*up.x + e[5]*up.y + e[6]*up.z)).normalize();
  _Fy.copy(dir).normalize().lerp(_Fx, follow).negate().normalize();     // the hand's -y runs along the fingers
  _Fx.copy(up).multiplyScalar(s); _Fx.addScaledVector(_Fy, -_Fx.dot(_Fy)).normalize();   // its palm side (-s·x) faces down onto the surface
  _Fz.crossVectors(_Fx, _Fy);
  _Qh.setFromRotationMatrix(_Fm.makeBasis(_Fx, _Fy, _Fz));
  _Qf.setFromRotationMatrix(frameOf(h, T, fa, _Fm)).invert().multiply(_Qh);
  const tw = clamp(wrap(2*Math.atan2(_Qf.y, _Qf.w)), -1.9, 1.9);
  T[fa*3 + 1] = tw; _Qf.premultiply(_Qy.setFromAxisAngle(_UPV, -tw));
  _E.setFromQuaternion(_Qf, "XYZ"); R3(T, hd, _E.x, _E.y, _E.z);
}
// bend forward from the hips (hips, spine and chest share it, the head stays level, the seat goes back for balance) until
// the shoulders are near enough to reach (x, y, z) with the elbows a little bent; the feet stay where they stood
function leanTo(h, T, x, y, z, feet, straight = .9, most = 1.3){
  const D = h.D, base = [T[B.hips*3], T[B.spine*3], T[B.chest*3], T[B.neck*3], T[B.head*3], T[62]], reach = straight*(D.elbowL + D.foreL);
  const set = a => { T[B.hips*3] = base[0] + a*.35; T[B.spine*3] = base[1] + a*.45; T[B.chest*3] = base[2] + a*.2; T[B.neck*3] = base[3] - a*.32; T[B.head*3] = base[4] - a*.26; T[62] = base[5] - a*.13; };
  const gap = a => { set(a); return _V.setFromMatrixPosition(frameOf(h, T, B.uaL, _Ms)).distanceTo(_P.set(x, y, z)); };
  let lo = 0, hi = most;
  if (gap(0) > reach){ for (let i = 0; i < 7; i++){ const m = (lo + hi)/2; if (gap(m) > reach) lo = m; else hi = m; } set(hi); }
  else set(0);
  feet();
}
/* ---- keeping people on the ground ----
   After every pose: nothing of the body goes below the floor (the hips rise to clear it), a foot that would dip
   under is lifted by IK keeping its angle, and people lying down (a slide, a keeper's dive) are lowered until
   they rest on it. Points are [bone, x, y, z (in the bone's own frame), radius]. */
const FK = Array.from({length:20}, () => new THREE.Matrix4());
function fk(h, T){
  FK[0].identity();
  for (let i = 1; i < 20; i++){
    _P.copy(h.rest[i]); if (i === B.hips){ _P.x += T[60]; _P.y += T[61]; _P.z += T[62]; }
    _E.set(T[i*3], T[i*3 + 1], T[i*3 + 2], "XYZ"); _Q.setFromEuler(_E);
    FK[i].multiplyMatrices(FK[PAR[i]], _M2.compose(_P, _Q, _ONE));
  }
  return FK;
}
const BODYPTS = [[B.hips, .09, -.1, -.06, .07], [B.hips, -.09, -.1, -.06, .07], [B.hips, 0, -.11, .05, .06], [B.spine, 0, 0, 0, .1], [B.spine, .15, -.03, 0, .05], [B.spine, -.15, -.03, 0, .05],
  [B.chest, 0, .04, 0, .1], [B.chest, .16, .05, 0, .06], [B.chest, -.16, .05, 0, .06], [B.head, 0, .06, .01, .11]];
for (const s of [1, -1]){
  const [ua, fa, hd] = ARM(s), [th, sh] = LEG(s);
  BODYPTS.push([fa, 0, 0, 0, .04], [hd, 0, -.08, .01, .03], [th, 0, -.22, 0, .07], [sh, 0, 0, .01, .05], [sh, 0, -.2, 0, .045]);
}
const FOOTPTS = [[0, 0, -.085, -.078], [0, .028, -.083, -.062], [0, -.028, -.083, -.062], [0, .045, -.085, .085], [0, -.045, -.085, .085], [1, 0, -.025, .08], [1, .032, -.025, .05], [1, -.032, -.025, .05]];
const _G = new THREE.Vector3(), _Qw = new THREE.Quaternion(), _Qs = new THREE.Quaternion();
const lowY = (F, b, x, y, z) => _G.set(x, y, z).applyMatrix4(F[b]).y;
function footLow(F, s){ const [, , ft, to] = LEG(s); let m = 1e9; for (const [k, x, y, z] of FOOTPTS) m = Math.min(m, lowY(F, k ? to : ft, x, y, z)); return m; }
/* raise a foot by dy, keeping the way it points and the way the knee points. The knee opens just enough for the
   new hip–ankle distance, then the thigh turns by the smallest rotation that brings the ankle up — so a leg folded
   out sideways (a slide, a dive) stays folded the same way and is only nudged, never re-solved into a new pose. */
const _Qt = new THREE.Quaternion(), _Qk = new THREE.Quaternion(), _Qd = new THREE.Quaternion(), _Va = new THREE.Vector3(), _Vk = new THREE.Vector3();
function liftFoot(h, P, F, s, dy){
  const [th, sh, ft] = LEG(s), D = h.D, L1 = D.hipY - D.kneeY, L2 = D.kneeY - D.ankY;
  _Qw.setFromRotationMatrix(F[ft]);
  _M.copy(F[B.hips]).invert();
  _Pv.setFromMatrixPosition(F[ft]); _Pv.y += dy; _Pv.applyMatrix4(_M).sub(h.rest[th]);            // where the ankle must go, from the hip
  const k0 = P[sh*3], d = softReach(_Pv.length(), L1, L2), k1 = (k0 < 0 ? -1 : 1)*Math.acos(clamp((d*d - L1*L1 - L2*L2)/(2*L1*L2), -1, 1));
  P[sh*3] = k1;
  _Qk.setFromEuler(_E.set(P[sh*3], P[sh*3 + 1], P[sh*3 + 2], "XYZ"));
  _Va.set(0, -L2, 0).applyQuaternion(_Qk); _Va.y -= L1;                                              // the ankle in the thigh's frame
  _Qt.setFromEuler(_E.set(P[th*3], P[th*3 + 1], P[th*3 + 2], "XYZ"));
  _Va.applyQuaternion(_Qt).normalize();
  _Qd.setFromUnitVectors(_Va, _Vk.copy(_Pv).normalize());
  _Qt.premultiply(_Qd); _E.setFromQuaternion(_Qt, "XYZ"); R3(P, th, _E.x, _E.y, _E.z);
  // the ankle turned back to the foot's old angle
  _Qs.setFromRotationMatrix(F[B.hips]).multiply(_Qt).multiply(_Qk);
  _E.setFromQuaternion(_Qs.invert().multiply(_Qw), "XYZ"); R3(P, ft, _E.x, _E.y, _E.z);
}
function ground(h, P, rest){
  let F = fk(h, P), lo = 1e9;
  for (const [b, x, y, z, r] of BODYPTS) lo = Math.min(lo, lowY(F, b, x, y, z) - r - .008);
  let lift = lo < 0 ? -lo : 0;
  if (rest > 0){ const m = Math.min(lo, footLow(F, 1), footLow(F, -1)); if (m > 0) lift = -m*rest; }
  if (Math.abs(lift) > 1e-4){ P[61] += lift; F = fk(h, P); }
  for (const s of [1, -1]){ const m = footLow(F, s); if (m < -.002) liftFoot(h, P, F, s, -m); }
}
function idle(h, T, st){
  const t = h.t, D = h.D, sd = h.seed*10, old = D.old;
  const w = Math.sin(t*.42 + sd)*.8 + Math.sin(t*.17 + sd*2)*.2, br = Math.sin(t*1.5 + sd);
  T[60] = .014*w; T[61] = -.004 + .0025*br - old*.01; T[62] = 0;
  R3(T, B.hips, .0, .04*Math.sin(t*.13 + sd), -.022*w);
  R3(T, B.spine, .02 + old*.06 + .006*br, -.02*Math.sin(t*.13 + sd), .012*w);
  R3(T, B.chest, .01 - .01*br + old*.04, 0, .01*w);
  const look = st.look != null ? st.look : .3*Math.sin(t*.11 + sd*3) + .2*Math.sin(t*.29 + sd);
  R3(T, B.neck, -.02 - old*.05, look*.45, 0); R3(T, B.head, .03*Math.sin(t*.23 + sd), look*.55, .02*Math.sin(t*.19));
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s);
    R3(T, ua, .04 + .02*Math.sin(t*.5 + s + sd) - .03*h.arm, 0, s*(.11 + .02*h.arm)); R3(T, fa, -.16 - .06*h.arm, -s*.2, 0); R3(T, hd, .08, 0, -s*.04);
  }
  for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + h.stance), D.ankY, s*h.fz, 0);
  const arms = st.arms;
  if (arms === "hips") for (const s of [1, -1]) armIK(h, T, s, s*.205, 1.0, .02, -s*.6, -.3, [1, -.2, -.25]);
  // hands clasped on the small of the back, elbows out behind
  else if (arms === "behind") for (const s of [1, -1]) armIK(h, T, s, s*.045, 1.02, -.17 - .012*D.belly, -s*1.3, .25, [.8, -.2, -.6]);
  // arms crossed: each forearm lies across the chest and the hand tucks in by the other elbow
  else if (arms === "folded"){
    const z = .17 + .01*(D.belly + D.bust);
    // wrists just past the middle, so each hand lies over the other arm's biceps
    armIK(h, T, 1, -.025, 1.165, z + .035, -1.45, 0, [1, -.6, -.15]); armIK(h, T, -1, .025, 1.205, z + .005, 1.45, 0, [1, -.6, -.15]);
  }
}
// walking to sprinting. The stance foot pivots heel → flat → ball and moves back at exactly ground speed.
function gait(v){
  const R = sstep(1.9, 3.1, v);
  // stride frequency (strides a second) and, running, a foot on the ground for .8–1 m of travel (a short contact
  // as the pace rises), so the planted foot never has to reach further than a leg can without the hips dropping
  const tab = [[0, .55], [1.4, .92], [2.2, 1.06], [3, 1.3], [5, 1.45], [7.5, 1.8], [10, 2.0]];
  let f = tab[tab.length - 1][1]; for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]){ f = lerp(tab[i - 1][1], tab[i][1], (v - tab[i - 1][0])/(tab[i][0] - tab[i - 1][0])); break; }
  const Lc = lerp(.8, 1.0, sstep(3, 8, v));
  return {R, f, duty:lerp(.61, clamp(Lc*f/Math.max(v, .5), .22, .45), R), lift:lerp(.075 + .01*v, Math.min(.5, .1 + .055*v), R)};
}
function stancePose(u, zc, R){
  const pw = u < .12 ? -.28*(1 - u/.12) : u < .55 ? 0 : .78*Math.pow((u - .55)/.45, 1.6);
  const pr = u < .45 ? .02 : 1.0*Math.pow((u - .45)/.55, 1.4);
  const ps = lerp(pw, pr, R);
  if (ps < 0) return [zc + .085*Math.sin(ps) + .05*Math.cos(ps), .085*Math.cos(ps) - .05*Math.sin(ps), ps, 0];
  return [zc + .16 + .085*Math.sin(ps) - .11*Math.cos(ps), .085*Math.cos(ps) + .11*Math.sin(ps), ps, -ps];
}
function loco(h, T, st, dt){
  const D = h.D, v = h.v/h.scale, G = gait(v), R = G.R, duty = G.duty;
  h.ph = (h.ph + G.f*dt) % 1;
  const L = v/G.f, Ds = L*duty, zc0 = lerp(Ds/2 - .04, .38*Ds - .05, R);
  const pL = h.ph, yaw = lerp(.1, .15, R)*Math.min(1, v/1.2), cL = Math.cos(TAU*pL), mid = Math.cos(TAU*2*(pL - duty/2));
  // turning (h.turn, rad/s, from how the body's group turns): a planted foot stays where it was put on the ground while
  // the body turns over it — in the body's own frame it swings round the other way, through its contact (and the swing
  // carries it from where it left the ground to where the turned body will put it down)
  // (a turn faster than a planted foot can sensibly pivot through, ±20° a contact, is left to the stride itself)
  const Tst = duty/G.f, om = clamp(h.turn || 0, -.7/Tst, .7/Tst);
  // pelvis: swings with the legs, drops onto the swing side, bobs (up at mid-stance walking, down running)
  let dy = lerp(-.012 + .012*mid, -.035 - .006*Math.min(v, 8) - .022*mid, R);
  const feet = [];
  for (const s of [1, -1]){
    const p = s > 0 ? pL : (pL + .5) % 1;
    let x = s*(D.hipX - .004 - .022*R), z, y, pitch, toe;
    if (p < duty){ [z, y, pitch, toe] = stancePose(p/duty, zc0 - p/duty*Ds, R); }
    else {
      const u = (p - duty)/(1 - duty), A = stancePose(1, zc0 - Ds, R), Bp = stancePose(0, zc0, R);
      // the foot leaves and meets the ground moving back as fast as the ground goes by (a Hermite with the stance
      // speed at both ends): it carries on back after toe-off and paws back into the landing, so it never skids
      // (gentler at toe-off, where the foot is leaving the ground anyway)
      const m = -Ds*(1 - duty)/duty*lerp(.25, 1, R), u2 = u*u, u3 = u2*u;
      z = (2*u3 - 3*u2 + 1)*A[0] + (u3 - 2*u2 + u)*m*.4 + (3*u2 - 2*u3)*Bp[0] + (u3 - u2)*m*lerp(1, .55, R);
      y = lerp(A[1], Bp[1], u) + G.lift*lerp(Math.sin(Math.PI*u), Math.sin(Math.PI*(1 - Math.pow(1 - u, 1.4))), R);   // running: up early, set down softly
      pitch = lerp(A[2], Bp[2], sstep(0, 1, u)) + lerp(-.18, .35, R)*Math.sin(Math.PI*u);
      toe = lerp(-A[2], 0, sstep(0, .4, u));                         // carries on from toe-off: no flick
    }
    if (om){
      // where the straight-line stride puts the foot τ s from mid-stance, moved to where the same spot on the ground is
      // for a body going round the bend (stance); the swing carries the difference from lift-off to landing
      const tAt = q => (q - .5)*Tst;
      if (p < duty) [x, z] = turnFix(x, z, tAt(p/duty), v, om);
      else {
        const u = (p - duty)/(1 - duty), A = stancePose(1, zc0 - Ds, R), Bp = stancePose(0, zc0, R);
        const a = turnFix(x, A[0], tAt(1), v, om), b = turnFix(x, Bp[0], tAt(0), v, om), k = sstep(0, 1, u);
        x += lerp(a[0] - x, b[0] - x, k); z += lerp(a[1] - A[0], b[1] - Bp[0], k);
      }
    }
    // how much this foot holds the hips down: fully while planted, easing out after toe-off and back in before landing
    const hold = p < duty ? 1 : (u => Math.max(1 - sstep(0, .35, u), sstep(.55, 1, u)))((p - duty)/(1 - duty));
    feet.push([x, y, z, pitch, toe, hold]);
  }
  // keep a planted foot reachable: the hips sink rather than the foot sliding (a foot high in the air may fall short)
  const Lm = (D.hipY - D.ankY)*.995;
  let sink = 0;
  for (const [x, y, z, , , hold] of feet){ if (hold <= 0) continue; const hx = x*.98, hz = 0, dh = Math.hypot(x - hx, z - hz); const maxY = y + Math.sqrt(Math.max(0, Lm*Lm - dh*dh)) - D.hipY; if (dy > maxY) sink = Math.max(sink, (dy - maxY)*hold); }
  dy -= sink;
  T[60] = .012*(1 - R)*Math.cos(TAU*(pL - duty/2)); T[61] = dy; T[62] = 0;
  R3(T, B.hips, .04*R, -yaw*cL, .035*(1 - R)*Math.cos(TAU*(pL - duty/2)));
  const lean = .03 + .09*R + .05*sstep(4.5, 8, v);
  R3(T, B.spine, lean, yaw*.5*cL, 0); R3(T, B.chest, .02*R - .01, yaw*.8*cL, 0);
  R3(T, B.neck, -lean*.5, -yaw*.6*cL, 0); R3(T, B.head, -lean*.25 - .02, -yaw*.35*cL, 0);
  for (let i = 0; i < 2; i++){ const s = i ? -1 : 1, f = feet[i]; legIK(h, T, s, f[0], f[1], f[2], f[3], f[4]); }
  // arms swing against the legs; elbows fold as the pace rises
  const A = lerp(.22 + .14*Math.min(1, v/1.4), Math.min(1.05, .55 + .07*(v - 3)), R), e0 = lerp(.22, 1.3 + .12*sstep(5, 8, v), R);
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s), p = s > 0 ? pL : (pL + .5) % 1, c = Math.cos(TAU*p);
    R3(T, ua, A*c - .08*R, -s*.1*R*c, s*(.1 + .05*R));
    R3(T, fa, -(e0 + .25*R*(1 - c)/2 + .1*(1 - R)*(1 - c)/2), -s*(.25 + .2*R), 0);
    R3(T, hd, lerp(.1, -.05, R), 0, 0);
  }
}
/* a spot on the ground at (x, z) in the body's frame τ s from mid-stance as the straight-line stride has it (the body
   gone v·τ straight on), for a body turning at om rad/s instead: the body has gone round an arc and turned with it */
function turnFix(x, z, tau, v, om){
  const a = om*tau, X = x, Z = z + v*tau, k = Math.abs(a) < 1e-6 ? 1 : Math.sin(a)/a, kc = Math.abs(a) < 1e-6 ? a/2 : (1 - Math.cos(a))/a;
  const dX = X - v*tau*kc, dZ = Z - v*tau*k, c = Math.cos(a), sn = Math.sin(a);
  return [dX*c - dZ*sn, dX*sn + dZ*c];
}
// standing ↔ moving: the stride fades in and out over a third of a second, whatever the speed asks for,
// and a first step starts from the foot that is already under the body (no frame-one jump into mid-stride)
function moveMode(h, T, st, dt){
  idle(h, _A, st);
  const go = h.v > .06 || (st.speed || 0) > .06;
  if (go && h.mw < .02) h.ph = gait(Math.max(h.v, .3)/h.scale).duty*.5;
  h.mw += ((go ? 1 : 0) - h.mw)*(1 - Math.exp(-7*dt));
  const m = sstep(0, 1, h.mw);
  if (m < 1e-3){ T.set(_A); return; }
  loco(h, _B, st, dt);
  for (let i = 0; i < NP; i++) T[i] = lerp(_A[i], _B[i], m);
}
// ---- actions ----
function stand(h, T, st){ idle(h, T, Object.assign({}, st, {look:0})); }
function kickLike(h, T, st, kind){
  const t = st.t != null ? st.t : Math.min(1, h.at/(kind === "kick" ? .9 : .75)), D = h.D, amp = st.amp || 1, s = -1;   // right foot
  stand(h, T, st);
  const big = kind === "kick", tr = kind === "trap";
  const [th, sh, ft, to] = LEG(s);
  const thighX = tr ? kf(t, [[0, 0], [.3, -.32], [.55, -.35], [1, 0]])
    : big ? kf(t, [[0, 0], [.3, .7], [.42, -.75], [.55, -1.2], [.75, -.6], [1, 0]]) : kf(t, [[0, 0], [.3, .45*amp], [.44, -.5*amp], [.6, -.75*amp], [1, 0]]);
  const knee = tr ? kf(t, [[0, .1], [.3, .5], [.55, .45], [1, .05]])
    : big ? kf(t, [[0, .15], [.3, 1.85], [.42, .25], [.55, .1], [.8, .5], [1, .1]]) : kf(t, [[0, .15], [.3, 1.05], [.44, .3], [.6, .2], [1, .1]]);
  const rot = big ? 0 : kf(t, [[0, 0], [.2, -.75], [.7, -.75], [1, 0]]);
  T[60] = kf(t, [[0, 0], [.35, .03], [.6, .02], [1, 0]]); T[61] = big ? kf(t, [[0, -.01], [.35, -.07], [.6, -.04], [1, -.005]]) : kf(t, [[0, -.008], [.3, -.03], [.7, -.03], [1, -.008]]);
  R3(T, B.hips, 0, big ? kf(t, [[0, 0], [.3, .25], [.55, -.25], [1, 0]]) : .1*Math.sin(t*Math.PI), big ? kf(t, [[0, 0], [.4, .12], [1, 0]]) : kf(t, [[0, 0], [.3, .05], [.7, .05], [1, 0]]));
  legIK(h, T, 1, D.hipX + .05, D.ankY, kind === "kick" ? -.08 : -.02, 0);
  // the kicking foot starts and finishes planted beside the other; in between the leg swings freely
  legIK(h, T, -1, -(D.hipX + .02), D.ankY, .0, 0);
  const plant = [th, sh, ft, to].map(b => [T[b*3], T[b*3 + 1], T[b*3 + 2]]);
  const pitch = big ? kf(t, [[0, 0], [.25, .55], [.85, .55], [1, 0]]) : tr ? kf(t, [[0, 0], [.25, -.2], [.8, -.2], [1, 0]]) : kf(t, [[0, 0], [.25, -.12], [.8, -.12], [1, 0]]);
  R3(T, th, thighX, rot, big ? -.05 : 0); R3(T, sh, knee); R3(T, ft, pitch); R3(T, to, 0);
  const w = Math.max(1 - sstep(0, .18, t), sstep(.82, 1, t));
  if (w > 0) [th, sh, ft, to].forEach((b, i) => { for (let c = 0; c < 3; c++) T[b*3 + c] = lerp(T[b*3 + c], plant[i][c], w); });
  R3(T, B.spine, big ? kf(t, [[0, .05], [.3, .18], [.45, -.08], [.6, -.18], [1, .03]]) : kf(t, [[0, .05], [.4, .2], [1, .05]]), 0, big ? kf(t, [[0, 0], [.42, .15], [1, 0]]) : .06); R3(T, B.chest, .02);
  R3(T, B.neck, .1, 0, 0); R3(T, B.head, .2, 0, 0);
  const ao = big ? kf(t, [[0, .2], [.3, 1.0], [.6, 1.15], [1, .2]]) : kf(t, [[0, .2], [.4, .55], [1, .2]]);
  R3(T, ARM(1)[0], big ? -.5 : -.2, 0, ao); R3(T, ARM(-1)[0], big ? kf(t, [[0, .1], [.42, .6], [1, .1]]) : .25, 0, -ao*.7); R3(T, ARM(1)[1], -.4, 0, 0); R3(T, ARM(-1)[1], -.4, 0, 0);
}
function header(h, T, st){
  const t = st.t != null ? st.t : Math.min(1, h.at/1.1), D = h.D;
  const up = kf(t, [[0, 0], [.2, -.16], [.3, .1], [.48, .42], [.62, .3], [.75, -.12], [.9, -.04], [1, 0]]);
  T[61] = up; T[60] = 0; T[62] = 0;
  R3(T, B.hips, kf(t, [[0, 0], [.2, .2], [.4, -.1], [.5, .1], [1, 0]]), 0, 0);
  R3(T, B.spine, kf(t, [[0, .05], [.2, .35], [.42, -.3], [.52, .35], [.7, .15], [1, .03]]));
  R3(T, B.chest, kf(t, [[0, 0], [.42, -.15], [.52, .2], [1, 0]]));
  R3(T, B.neck, kf(t, [[0, 0], [.42, -.3], [.52, .35], [1, 0]])); R3(T, B.head, kf(t, [[0, 0], [.42, -.2], [.52, .2], [1, 0]]));
  const fy = Math.max(0, up - .02)*kf(t, [[0, 0], [.3, .8], [.6, .8], [.8, 0], [1, 0]]);
  for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .02), D.ankY + fy + (t > .3 && t < .7 ? .12*Math.sin((t - .3)/.4*Math.PI) : 0), s > 0 ? .03 : -.06, t > .25 && t < .75 ? .5 : 0);
  for (const s of [1, -1]){ const [ua, fa] = ARM(s); R3(T, ua, kf(t, [[0, .1], [.2, .7], [.42, -1.6], [.55, -.9], [1, .05]]), 0, s*kf(t, [[0, .12], [.42, .7], [.6, .5], [1, .12]])); R3(T, fa, kf(t, [[0, -.2], [.42, -.9], [1, -.2]])); }
}
function tackle(h, T, st){
  const t = st.t != null ? st.t : Math.min(1, h.at/1.2), k = kf(t, [[0, 0], [.18, 1], [.8, 1], [1, .9]]);
  // down on the grass, leaning back on the left hip (the ground pass sets him onto it)
  T[61] = -.7*k; T[62] = .05*k; T[60] = .03*k; h.gw = sstep(.3, .9, k);
  R3(T, B.hips, -.5*k, .2*k, -.35*k);
  R3(T, B.spine, .14*k, -.15*k, .2*k); R3(T, B.chest, .06*k, -.1*k, .1*k); R3(T, B.neck, .15*k, 0, .1*k); R3(T, B.head, .2*k, 0, .05*k);
  const [tR, sR, fR, oR] = LEG(-1), [tL, sL, fL, oL] = LEG(1);
  // the sliding leg straight out along the grass, studs to the ball
  R3(T, tR, lerp(0, -1.1, k), 0, lerp(0, .06, k)); R3(T, sR, lerp(.1, .12, k)); R3(T, fR, lerp(0, -.25, k)); R3(T, oR, 0);
  // the trailing leg turned out at the hip so the knee folds sideways: the shin tucks across under the other one
  R3(T, tL, lerp(0, -1.15, k), lerp(0, 1.45, k), 0); R3(T, sL, lerp(.1, 1.95, k)); R3(T, fL, lerp(0, .35, k)); R3(T, oL, 0);
  R3(T, ARM(1)[0], lerp(.05, .55, k), 0, lerp(.1, .55, k)); R3(T, ARM(1)[1], lerp(-.15, -.2, k)); R3(T, ARM(1)[2], -.4*k);              // a hand back to the grass
  R3(T, ARM(-1)[0], lerp(.05, -1.25, k), 0, lerp(-.1, -.55, k)); R3(T, ARM(-1)[1], lerp(-.15, -.6, k));                                   // the other up for balance
}
function gkReady(h, T, st){
  const D = h.D, t = h.t, b = Math.sin(t*6.5)*.012;
  T[61] = -.13 + b; T[60] = 0; T[62] = 0;
  R3(T, B.hips, .2, 0, 0); R3(T, B.spine, .22); R3(T, B.chest, .08); R3(T, B.neck, -.25); R3(T, B.head, -.15);
  for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .1), D.ankY + Math.max(0, b)*.5, .02, .1);
  for (const s of [1, -1]) armIK(h, T, s, s*.3, 1.02, .34, s*1.25, -.5);
}
function dive(h, T, st){
  const t = st.t != null ? st.t : Math.min(1, h.at/1.3), dir = st.dir || 1, D = h.D;
  const air = kf(t, [[0, 0], [.18, 0], [.45, 1], [.62, .65], [.75, .25], [1, .22]]), side = kf(t, [[0, 0], [.15, -.05], [.55, 1], [1, 1.05]]), roll = kf(t, [[0, 0], [.15, .05], [.5, 1.3], [.75, 1.45], [1, 1.45]]);
  T[60] = dir*1.05*side; T[61] = -.12*(1 - side) + .3*air - .52*sstep(.55, .8, t); T[62] = .05*side; h.gw = sstep(.58, .82, t);   // lands and lies on his side
  R3(T, B.hips, .1, 0, -dir*roll);
  R3(T, B.spine, .1*(1 - side), 0, -dir*.15*side); R3(T, B.chest, 0, dir*.15*side, -dir*.1*side); R3(T, B.neck, 0, 0, dir*.25*side); R3(T, B.head, -.1*side, 0, dir*.2*side);
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s), lead = s === dir;
    R3(T, ua, lerp(-.7, lead ? -2.7 : -2.9, side), 0, s*lerp(.35, lead ? .15 : -.1, side)); R3(T, fa, lerp(-.7, -.15, side), s*1.2, 0); R3(T, hd, -.3);
    const [th, sh, ft, to] = LEG(s);
    R3(T, th, lerp(-.15, lead ? -.35 : .15, side), 0, s*lerp(.05, lead ? .25 : .05, side)); R3(T, sh, lerp(.6, lead ? .9 : .25, side)); R3(T, ft, .3); R3(T, to, 0);
  }
  if (t < .15) for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .1), D.ankY, .02, .1);
}
function celebrate(h, T, st){
  const t = h.at, D = h.D, hop = Math.abs(Math.sin(t*5.2)), up = .08*hop;
  T[61] = -.05 + up; T[60] = 0; T[62] = 0;
  R3(T, B.hips, -.05); R3(T, B.spine, -.15); R3(T, B.chest, -.1); R3(T, B.neck, -.15); R3(T, B.head, -.2, .2*Math.sin(t*1.3), 0);
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s), pump = s > 0 ? Math.sin(t*5.2) : Math.sin(t*5.2 + 1);
    R3(T, ua, -2.75 + .15*pump, 0, s*.38); R3(T, fa, -.35 - .45*Math.max(0, pump), 0, 0); R3(T, hd, -.2);
    legIK(h, T, s, s*(D.hipX + .05), D.ankY + Math.max(0, up - .03)*1.2, 0, .1);
  }
}
const _Ms = new THREE.Matrix4(), _Hv = new THREE.Vector3(), _Dv = new THREE.Vector3(), _Uv = new THREE.Vector3();
const STRETCHES = [
  (h, T) => {                                                                       // quad: heel to the backside, held there
    const D = h.D; T[61] = -.015; R3(T, B.spine, .07, 0, -.05); R3(T, B.chest, .02, 0, -.04); legIK(h, T, 1, D.hipX - .02, D.ankY, 0, 0);
    const [th, sh, ft] = LEG(-1); R3(T, th, .12, 0, -.03); R3(T, sh, 2.5); R3(T, ft, .8);
    // the right hand round the top of the raised foot (the wrist just behind the instep, the fingers over it), the left
    // arm out to the side for balance
    frameOf(h, T, ft, _Ms); _Hv.set(0, .085, .045).applyMatrix4(_Ms);
    armIK(h, T, -1, _Hv.x, _Hv.y, _Hv.z, .6, .35, [.35, .1, -1]);
    R3(T, ARM(1)[0], -.22, 0, .62); R3(T, ARM(1)[1], -.35); R3(T, ARM(1)[2], 0, 0, .15);
  },
  (h, T) => {                                                                       // hamstring: heel out, fold forward
    const D = h.D; T[61] = -.12; R3(T, B.hips, .35); R3(T, B.spine, .45); R3(T, B.chest, .15); R3(T, B.neck, -.3);
    legIK(h, T, 1, D.hipX + .02, D.ankY, -.12, 0); legIK(h, T, -1, -D.hipX, D.ankY + .03, .42, -.55);
    // both hands slide down the front of the straight leg's shin (never through the knees)
    frameOf(h, T, LEG(-1)[1], _Ms);
    for (const s of [1, -1]){ _Hv.set(s*.04, -.12, .085).applyMatrix4(_Ms); armIK(h, T, s, _Hv.x, _Hv.y, _Hv.z, -s*.4, -.25, [.9, .3, -.3]); }
  },
  (h, T) => {                                                                       // reach overhead and lean
    const D = h.D, k = Math.sin(h.at*.9); T[60] = -.02*k; R3(T, B.spine, 0, 0, .22*k); R3(T, B.chest, 0, 0, .18*k);
    for (const s of [1, -1]){ legIK(h, T, s, s*(D.hipX + .07), D.ankY, 0, 0); R3(T, ARM(s)[0], -2.85, 0, s*.15); R3(T, ARM(s)[1], -.25); }
  },
  (h, T) => {                                                                       // lunge, hands on hips
    const D = h.D; T[61] = -.2; T[62] = .05; R3(T, B.spine, -.04);
    legIK(h, T, -1, -D.hipX - .01, D.ankY, .5, 0); legIK(h, T, 1, D.hipX + .01, D.ankY + .05, -.48, .7, -.7);
    for (const s of [1, -1]) armIK(h, T, s, s*.205, 1.0, .02, -s*.6, -.3, [1, -.2, -.25]);
  }
];
function stretch(h, T, st){
  idle(h, T, Object.assign({}, st, {look:0}));
  const per = 6, i = Math.floor(h.at/per) % STRETCHES.length, f = h.at % per;
  const a = _A; a.set(T); STRETCHES[(i + STRETCHES.length - 1) % STRETCHES.length](h, a);
  const b = _B; b.set(T); STRETCHES[i](h, b);
  const w = h.at < per ? 1 : sstep(0, 1.1, f);
  for (let k = 0; k < NP; k++) T[k] = lerp(a[k], b[k], w);
}
const SIT_HIPS = .162;                 // hip joint above the seat top when the backside rests on it
function sit(h, T, st, typing){
  // contacts are world heights; the body is scaled by its height, so they're brought into the body's own units
  const D = h.D, sc = h.scale || 1, seat = (st.seat != null ? st.seat : typing ? .47 : .45)/sc, t = h.t;
  T[61] = seat + SIT_HIPS - D.hipsY; T[62] = 0; T[60] = 0;
  R3(T, B.hips, -.12); R3(T, B.spine, typing ? .2 : .1 + .01*Math.sin(t*1.5)); R3(T, B.chest, .04);
  R3(T, B.neck, typing ? .05 : -.05, typing ? 0 : .25*Math.sin(t*.12), 0); R3(T, B.head, typing ? .1 : .02);
  for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .03), D.ankY, .46 + (s > 0 ? .02 : -.02), 0);
  if (typing){
    const desk = (st.desk || .74)/sc, reach = (st.reach || .4)/sc;
    // on a keyboard (its keys a little over the desk, the fingers tapping), or with keys:false simply resting flat on the table
    const kb = st.keys === false ? 0 : .017;
    for (const s of [1, -1]){ const tap = kb ? .007*Math.max(0, Math.sin(t*(17 + s*3))) : 0; plantHand(h, T, s, s*.15, desk + PALM + kb + tap, reach, _Dv.set(-s*.3, -.08, 1), _UPV, [.5, -.2, -.8]); }
  } else for (const s of [1, -1]){
    // hands resting on the thighs, fingers toward the knees: the wrist over the top of the thigh, wherever the leg lies
    const th = LEG(s)[0], L1 = D.hipY - D.kneeY, f = .5, top = lerp(.078, .066, clamp((f*L1 - .19)/.12, 0, 1))*D.leg + .004 + (D.thighCloth || .01) + PALM;
    frameOf(h, T, th, _Ms);
    _Hv.set(0, -f*L1, top).applyMatrix4(_Ms);
    const e = _Ms.elements;
    plantHand(h, T, s, _Hv.x, _Hv.y, _Hv.z, _Dv.set(-e[4] - s*.18, -e[5], -e[6]), _Uv.set(e[8], e[9], e[10]), [.5, -.3, -.8]);
  }
}
/* standing at a counter (or leaning on a desk), both hands flat on the top, a hip's width apart, the elbows soft. The
   body leans in only as far as it must, and never more than ~12° (st.lean, radians, overrides; a desk or counter below
   hip height lets it lean a little further, as you would to put your hands on a low table). A top too far off for that
   is met as near as the arms reach. st.work: busy at it (the barista) — one hand wiping in small circles, then the
   other moving something along the top, now and then both still, head down over the work */
function counter(h, T, st){
  idle(h, T, st);
  const D = h.D, sc = h.scale || 1, top = (st.counter || 1.0)/sc, wy = top + PALM + .003, reach = (st.reach || .34)/sc, wx = D.hipX + .07;
  T[60] *= .3; T[B.spine*3] += .03; T[B.spine*3 + 1] *= .5; T[B.neck*3 + 1] *= .5; T[B.head*3 + 1] *= .5;
  const most = st.lean != null ? st.lean : .16 + Math.max(0, .95 - top)*2.4;
  leanTo(h, T, wx, wy, reach, () => { for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + h.stance), D.ankY, s*h.fz, 0); }, .95, most);
  let wk = 0;
  for (const s of [1, -1]){
    let x = s*wx, z = reach;
    if (st.work){
      // a 9 s round: the right hand wipes (0–4 s), both rest (4–5.5 s), the left hand slides a cup across and back (5.5–8 s)
      const c = (h.t + h.seed*9) % 9, wipe = sstep(0, .4, c)*(1 - sstep(3.6, 4, c)), slide = sstep(5.5, 5.9, c)*(1 - sstep(7.6, 8, c));
      if (s < 0 && wipe > 0){ const a = h.t*5.2; x += Math.cos(a)*.045*wipe; z += Math.sin(a)*.035*wipe - .02*wipe; }
      if (s > 0 && slide > 0){ const k = Math.sin((c - 5.5)/2.5*Math.PI); x -= .08*k*slide; z += .05*k*slide; }
      wk = Math.max(wk, wipe, slide);
    }
    // out of reach even leaning in: the hand comes back along the top as far as the (nearly straight) arm needs
    _V.setFromMatrixPosition(frameOf(h, T, ARM(s)[0], _Ms));
    const L = .97*(D.elbowL + D.foreL), dx = x - _V.x, dy = wy - _V.y, room = L*L - dx*dx - dy*dy;
    if (room > 0) z = Math.min(z, _V.z + Math.sqrt(room));
    plantHand(h, T, s, x, wy, z, _Dv.set(-s*.28, 0, 1), _UPV, [.45, -.15, -.9]);
  }
  // eyes on the work (more so while busy)
  T[B.neck*3] += .1 + .12*wk; T[B.head*3] += .08 + .1*wk;
}
function clipboard(h, T, st){
  idle(h, T, st);
  const t = h.t, write = sstep(.2, .6, Math.sin(t*.35 + h.seed*6)), [ua, fa, hd] = ARM(-1);
  R3(T, ARM(1)[0], -.18, 0, .1); R3(T, ARM(1)[1], -1.45, 0, 0); R3(T, ARM(1)[2], 0, 0, 0);      // the board, held in the left hand
  if (write > .01){
    const keep = [ua, fa, hd].flatMap(b => [T[b*3], T[b*3 + 1], T[b*3 + 2]]);
    armIK(h, T, -1, .03 + .02*Math.sin(t*3), 1.2 + .012*Math.sin(t*5), .3, 1.2, -.2);                // and now and then, a note
    [ua, fa, hd].forEach((b, i) => { for (let c = 0; c < 3; c++) T[b*3 + c] = lerp(keep[i*3 + c], T[b*3 + c], write); });
  }
  const look = lerp(.35*Math.sin(t*.13 + h.seed*4), .1, write);
  R3(T, B.neck, lerp(-.02, .25, write), look*.5, 0); R3(T, B.head, lerp(0, .2, write), look*.5, 0);
}
/* ---- the gym (drills.js drives these; st.k is how far into the movement, st.wob a shake, st.q how clean) ---- */
const _Gm = new THREE.Matrix4(), _Gv = new THREE.Vector3();
// back squat: a bar across the upper back, hands just outside the shoulders, hips back and down, chest up
function squatPose(h, T, st){
  stand(h, T, st);
  const D = h.D, k = clamp(st.k || 0, 0, 1.1), wob = st.wob || 0, t = h.t;
  const drop = (D.hipY - D.ankY)*.46*k;
  T[61] = -drop; T[62] = -.1*k; T[60] = wob*.025*Math.sin(t*23);
  R3(T, B.hips, .62*k, 0, wob*.05*Math.sin(t*19)); R3(T, B.spine, .12*k - .04 + wob*.06*Math.sin(t*17)); R3(T, B.chest, -.06*k);
  R3(T, B.neck, -.5*k - .05, 0, 0); R3(T, B.head, -.12*k + .05, 0, 0);
  for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .1), D.ankY, .02, 0, 0);
  frameOf(h, T, B.chest, _Gm);
  for (const s of [1, -1]){ _Gv.set(s*.36, .2 + wob*.01*Math.sin(t*29), -.075).applyMatrix4(_Gm); armIK(h, T, s, _Gv.x, _Gv.y, _Gv.z, 0, .2, [.35, -1, -.25]); }
}
// a dumbbell curl, one arm at a time (st.side), the elbow pinned at the ribs; sloppy reps swing the body into it
function curlPose(h, T, st){
  stand(h, T, Object.assign({}, st, {look:0}));
  const k = clamp(st.k || 0, 0, 1), side = st.side || 1, sw = st.sway || 0;
  R3(T, B.spine, .03 - sw*.18*Math.sin(k*Math.PI)); R3(T, B.chest, -sw*.08*Math.sin(k*Math.PI)); R3(T, B.neck, .08, 0, 0);
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s), on = s === side, kk = on ? k : 0;
    R3(T, ua, .06 - .25*kk - sw*.3*Math.sin(kk*Math.PI), 0, s*.1);
    R3(T, fa, -(.2 + 2.15*kk), -s*.55, 0); R3(T, hd, -.15*kk, 0, 0);
  }
}
// a box jump: load (arms back, hips down), drive up, tuck, land soft on the box, stand tall. The group is lifted and
// carried forward by the drill; this is the shape of the body through it. st.fail: clips the edge and steps back down
/* the box jump, the whole rep: load, jump, land and stand tall on the box, step back down off it and walk back to the
   mark for the next one (st.t: 0–1 through the rep, st.box: the box's height in metres, st.fail: the box was clipped).
   Where the body stands is plyoPath(), which the set moves the body's group along; the feet, once down, are planted
   where the path put them and step from there, so nothing slides and nothing is put back in place in one frame */
const PLYO = {
  jump:[.48, .44],                                                         // the share of the rep the jump itself takes
  up:[[[0, 0], [.204, 0], [.276, 1.15], [.36, 1], [.5, 1], [.55, .92], [.6, .5], [.66, 0]], [[0, 0], [.198, 0], [.264, .28], [.341, 0]]],
  fwd:[[[0, 0], [.204, 0], [.33, .85], [.5, .85], [.56, .8], [.66, .48], [.95, 0]], [[0, 0], [.198, 0], [.275, .24], [.36, .2], [.52, .2], [.86, 0]]],
  // each foot once it is put down for real: where it starts (forward, up in boxes), then its steps [t0, t1, fwd, up, lift]
  feet:[{L:[.85, 1, [[.6, .7, .45, 0, .1], [.84, .94, 0, 0, .06]]], R:[.85, 1, [[.5, .6, .32, 0, .14], [.72, .82, 0, 0, .06]]]},
        {L:[.2, 0, [[.7, .82, 0, 0, .06]]], R:[.2, 0, [[.56, .68, 0, 0, .06]]]}]
};
export function plyoPath(t, fail){
  const i = fail ? 1 : 0;
  return {up:kf(t, PLYO.up[i]), fwd:kf(t, PLYO.fwd[i]), jump:PLYO.jump[i]};
}
function plyoFoot(spec, t){
  let [f, u] = spec, lift = 0;
  for (const [t0, t1, f1, u1, l] of spec[2]){
    if (t >= t1){ f = f1; u = u1; continue; }
    if (t > t0){ const k = sstep(t0, t1, t); lift = l*Math.sin(Math.PI*k); f += (f1 - f)*k; u += (u1 - u)*k; }
    break;
  }
  return [f, u, lift];
}
function plyoPose(h, T, st){
  const D = h.D, t = clamp(st.t || 0, 0, 1), fail = !!st.fail, P = plyoPath(t, fail), sc = h.scale || 1, box = st.box || .6;
  if (t < P.jump || t <= 0){
    // the jump itself: down into a crouch with the arms back, up with a tuck, down onto the box and stand tall
    stand(h, T, Object.assign({}, st, {look:0}));
    const tj = clamp(t/P.jump, 0, 1);
    const crouch = kf(tj, [[0, 0], [.22, 1], [.34, .2], [.45, 0], [.62, fail ? .2 : .9], [.78, fail ? .6 : .25], [1, 0]]);
    const tuck = fail ? kf(tj, [[0, 0], [.36, 0], [.48, .35], [.6, 0]]) : kf(tj, [[0, 0], [.36, 0], [.46, 1], [.58, .3], [.64, 0]]);
    const drop = (D.hipY - D.ankY)*.34*crouch;
    T[61] = -drop + .02*tuck; T[62] = -.06*crouch;
    R3(T, B.hips, .5*crouch + .25*tuck); R3(T, B.spine, .2*crouch + .1*tuck + (fail ? .2*sstep(.5, .7, tj)*(1 - sstep(.85, 1, tj)) : 0)); R3(T, B.chest, .05);
    R3(T, B.neck, -.35*crouch, 0, 0); R3(T, B.head, -.1*crouch, 0, 0);
    for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + .06), D.ankY + .3*tuck, .03 + .1*tuck, .2*tuck, 0);
    const sw = kf(tj, [[0, 0], [.22, .9], [.38, -2.2], [.5, -1.6], [.66, -.6], [1, .05]]);
    for (const s of [1, -1]){ const [ua, fa] = ARM(s); R3(T, ua, sw + (fail ? .5*Math.sin(h.t*14)*sstep(.5, .6, tj)*(1 - sstep(.8, .95, tj)) : 0), 0, s*(.12 + (fail ? .5 : 0)*sstep(.5, .65, tj)*(1 - sstep(.85, 1, tj)))); R3(T, fa, -.3 - .4*crouch); }
    return;
  }
  // back down and back to the mark: the feet step, the body follows them down and back
  idle(h, T, {look:0});
  const F = PLYO.feet[fail ? 1 : 0], lean = kf(t, fail ? [[P.jump, .05], [.6, .12], [1, 0]] : [[P.jump, 0], [.52, .22], [.62, .3], [.72, .12], [1, 0]]);
  R3(T, B.hips, .1*lean); R3(T, B.spine, .12 + .3*lean); R3(T, B.chest, .04); R3(T, B.neck, -.3*lean - .06); R3(T, B.head, -.15*lean);
  T[60] = 0; T[62] = -.04*lean;
  for (const s of [1, -1]){
    const [f, u, lift] = plyoFoot(s > 0 ? F.L : F.R, t);
    legIK(h, T, s, s*(D.hipX + .06), ((u - P.up)*box + lift)/sc + D.ankY, (f - P.fwd)/sc + .03, -.3*lift/.14, 0);
    const [ua, fa] = ARM(s); R3(T, ua, -.35*lean + .05, 0, s*(.14 + .1*lean)); R3(T, fa, -.35 - .3*lean);
  }
}
// on the bike: sat on the saddle, leant onto the bars, the feet going round on the pedals. st.ph is the crank angle of
// the left pedal from the top, increasing forward: over the top the foot goes towards the bars, at the bottom it comes
// back — the way a bike is pedalled. The bike's own cranks (props.js) are turned to the same angle
function bikePose(h, T, st){
  const D = h.D, sc = h.scale || 1;
  sit(h, T, {seat:(st.seat || .86)}, false);
  R3(T, B.hips, -.05); R3(T, B.spine, .42 + .03*Math.sin((st.ph || 0)*2)); R3(T, B.chest, .1); R3(T, B.neck, -.42); R3(T, B.head, -.1);
  const a = st.ph || 0, r = (st.crankR || .16)/sc, cy = (st.crankY || .36)/sc, cz = (st.crankZ || .16)/sc;
  for (const s of [1, -1]){
    const p = a + (s > 0 ? 0 : Math.PI);
    // the ball of the foot on the pedal, the ankle a little above and behind it; the toes dip as the foot comes round the
    // bottom and lift over the top (ankling)
    legIK(h, T, s, s*(D.hipX + .04), cy + r*Math.cos(p) + D.ankY*.75, cz + r*Math.sin(p) - .07/sc, -.12 - .14*Math.sin(p - .6), 0);
  }
  for (const s of [1, -1]) armIK(h, T, s, s*.22, (st.barY || 1.05)/sc, (st.barZ || .55)/sc, 0, 0, [.3, -.6, -.8]);
}
const MODES = {
  idle:(h, T, st) => idle(h, T, st), move:moveMode, stand, squat:squatPose, curl:curlPose, plyo:plyoPose, bike:bikePose,
  kick:(h, T, st) => kickLike(h, T, st, "kick"), pass:(h, T, st) => kickLike(h, T, st, "pass"), trap:(h, T, st) => kickLike(h, T, st, "trap"),
  header, tackle, dive, gkready:gkReady, celebrate, stretch, sit:(h, T, st) => sit(h, T, st, false), typing:(h, T, st) => sit(h, T, st, true), counter, clipboard
};
// how far apart two poses are: the largest turn of the hips, spine or a limb's root, or the hips' shift (×2 per metre)
const GAPB = [B.hips, B.spine, B.chest, B.uaL, B.uaR, B.thL, B.thR, B.shL, B.shR];
function poseGap(A, T){
  let m = 0;
  for (const b of GAPB) for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(T[b*3 + c] - A[b*3 + c]));
  return Math.max(m, 2*Math.hypot(T[60] - A[60], T[61] - A[61], T[62] - A[62]));
}
const _st = {mode:"idle"}, ACCEL = 7;
const toward = (v, target, dt) => Math.abs(target - v) < .02 ? target : v + clamp((target - v)*(1 - Math.exp(-10*dt)), -ACCEL*dt, ACCEL*dt);
export function animateHuman(h, dt, state = "idle"){
  let st = state;
  // your own body, posed where you stand: note where that is (see you())
  // (named after it is made, so asked every time: a body is posed while it is being made)
  const nm = h.g.name;
  if (nm === "me-fp" || nm === "me-tp") noteYou(h);
  if (typeof st === "string"){ _st.mode = st; _st.speed = PRESET[st]; st = _st; for (const k of ["t", "look", "arms", "dir", "seat", "desk", "counter", "reach", "amp", "keys"]) delete _st[k]; }
  let mode = st.mode || "idle";
  // the speed the legs are animated at follows the one asked for, but a body can only speed up or slow down so fast
  if (PRESET[mode] != null){ h.v = toward(h.v, st.speed != null ? st.speed : PRESET[mode], dt); mode = "move"; }
  else if (mode === "move") h.v = toward(h.v, st.speed || 0, dt);
  else if (mode === "idle"){ h.v = toward(h.v, 0, dt); mode = "move"; }
  if (!MODES[mode]) mode = "move";
  if (mode !== h.mode){ h.from.set(h.pose); h.bw = 0; h.mode = mode; h.at = 0; h.bdur = 0; }
  h.at += dt; h.t += dt;
  // how fast the body is being turned (its group's yaw, frame to frame; a jump is a placement, not a turn)
  if (dt > 0){
    const ry = h.g.rotation.y;
    if (h.ry0 != null){ const d = wrap(ry - h.ry0); h.turn += ((Math.abs(d) < .5 ? clamp(d/dt, -4, 4) : 0) - h.turn)*(1 - Math.exp(-15*dt)); }
    h.ry0 = ry;
  }
  const T = h.tgt; T.fill(0); h.gw = 0;
  MODES[mode](h, T, st, dt);
  // a change of mode is blended over .3 s, longer when the body has further to go (getting up off the grass)
  if (!h.bdur) h.bdur = st.blend || clamp(.3 + .28*(poseGap(h.from, T) - 1.1), .3, .8);
  h.bw = Math.min(1, h.bw + dt/h.bdur);
  const e = sstep(0, 1, h.bw), P = h.pose;
  for (let i = 0; i < NP; i++) P[i] = e >= 1 ? T[i] : lerp(h.from[i], T[i], e);
  ground(h, P, h.gw*e);
  const bn = h.bones;
  for (let i = 1; i < 20; i++) bn[i].rotation.set(P[i*3], P[i*3 + 1], P[i*3 + 2]);
  const hp = bn[B.hips].position, r = h.rest[B.hips]; hp.set(r.x + P[60], r.y + P[61], r.z + P[62]);
}

/* ---------- looks: seeded, believable people for each role ---------- */
const SKINS = [0xf3d3bb, 0xeac2a4, 0xdcab88, 0xc9926a, 0xb07a55, 0x8f5d3f, 0x6c4531, 0x4e3226];
const HC = {black:0x15110e, dark:0x2b1d15, brown:0x4a3122, light:0x7a5537, blond:0xb08b58, ginger:0x8f4628, grey:0x8f8b85, white:0xcdcac4};
const IRIS = {brown:0x3b2516, dark:0x22160f, hazel:0x5f4a28, green:0x4c6a3e, blue:0x4a6f95};
const ROLES = {
  footballer:{age:[18, 33], fem:0, builds:[["athletic", .45], ["slim", .2], ["average", .2], ["muscular", .1], ["stocky", .05]]},
  goalkeeper:{age:[19, 35], fem:0, tall:.03, builds:[["athletic", .5], ["average", .25], ["slim", .1], ["muscular", .15]]},
  coach:{age:[36, 62], fem:.1, builds:[["average", .4], ["stocky", .35], ["athletic", .15], ["slim", .1]]},
  manager:{age:[54, 66], fem:0, builds:[["average", .5], ["stocky", .35], ["slim", .15]]},
  shopkeeper:{age:[19, 62], fem:.55, builds:[["average", .45], ["stocky", .25], ["slim", .3]]},
  barista:{age:[18, 34], fem:.55, builds:[["slim", .45], ["average", .45], ["athletic", .1]]},
  customer:{age:[16, 80], skew:1.6, fem:.5, builds:[["slim", .25], ["average", .4], ["stocky", .25], ["athletic", .1]]},
  office:{age:[23, 60], fem:.45, builds:[["slim", .3], ["average", .45], ["stocky", .2], ["athletic", .05]]},
  courier:{age:[19, 45], fem:.25, builds:[["slim", .35], ["average", .35], ["athletic", .3]]},
  gym:{age:[20, 40], fem:.4, builds:[["athletic", .5], ["muscular", .25], ["slim", .15], ["average", .1]]},
  physio:{age:[27, 52], fem:.45, builds:[["athletic", .4], ["average", .4], ["slim", .2]]},
  kitman:{age:[46, 66], fem:0, builds:[["stocky", .5], ["average", .4], ["slim", .1]]},
  receptionist:{age:[21, 55], fem:.6, builds:[["slim", .35], ["average", .5], ["stocky", .15]]},
  clerk:{age:[18, 50], fem:.5, builds:[["slim", .35], ["average", .45], ["stocky", .2]]},
  dispatcher:{age:[26, 55], fem:.3, builds:[["average", .45], ["stocky", .35], ["slim", .2]]},
  photographer:{age:[24, 48], fem:.45, builds:[["slim", .45], ["average", .45], ["athletic", .1]]},
  editor:{age:[21, 38], fem:.4, builds:[["slim", .5], ["average", .4], ["stocky", .1]]}
};
ROLES.pedestrian = ROLES.customer;
const CASUAL = {tee:[0xf2f0ea, 0x1f2125, 0x8a8f96, 0x24324a, 0x5a6b3e, 0x6e2a2f, 0xc9a23e, 0x7fa7c9, 0xc4683a, 0x3d6f6a],
  jeans:[0x2c3e5c, 0x23293a, 0x50698f, 0x1c1d21], trousers:[0x34383f, 0xa89a78, 0x24304a, 0x1c1d21, 0x6b6e72, 0x5a4a38],
  hoodie:[0x8a8f96, 0x1f2125, 0x24324a, 0x38513a, 0x8e2b2b, 0xc8b89a, 0x4a3b5e], jacket:[0x1f2125, 0x4a5236, 0x24304a, 0x8a6a48, 0x5b3b2a],
  shoes:[0xf0f0ec, 0x1c1d21, 0x7d8188, 0x8a6a48, 0x2b3a5a]};
const BOOTS = [[0x15161a, 0xf2f2f0], [0xf2f2f0, 0x15161a], [0xd8ff3a, 0x15161a], [0xf06a1e, 0x15161a], [0x2a64d8, 0xf2f2f0], [0xd32f3a, 0xf2f2f0], [0x15161a, 0xd8ff3a]];
export function lookFor(role = "pedestrian", seed = 1, x = {}){
  const R = ROLES[role] || ROLES.customer, r = rng(hashStr(role) ^ Math.imul(seed | 0, 2654435761));
  const pick = a => a[Math.floor(r()*a.length) % a.length], rr = (a, b) => a + (b - a)*r();
  const sex = x.sex || (r() < R.fem ? "f" : "m"), f = sex === "f";
  const age = x.age || Math.round(R.age[0] + (R.age[1] - R.age[0])*Math.pow(r(), R.skew || 1)), old = sstep(40, 75, age);   // skew > 1: mostly the younger end
  // a given skin tone still steers hair and eyes: find the nearest of the eight
  const lumOf = c => { const k = new THREE.Color(hex(c)); return .3*k.r + .59*k.g + .11*k.b; };
  const tone = x.skin != null ? SKINS.reduce((bi, c, i) => Math.abs(lumOf(c) - lumOf(x.skin)) < Math.abs(lumOf(SKINS[bi]) - lumOf(x.skin)) ? i : bi, 0) : Math.floor(r()*SKINS.length);
  const skin = x.skin != null ? hex(x.skin) : SKINS[tone], dark = tone >= 5, mid = tone >= 3 && tone < 5;
  let hairColor = HC[wpick(r, dark ? [["black", .8], ["dark", .2]] : mid ? [["black", .5], ["dark", .4], ["brown", .1]] : [["black", .12], ["dark", .3], ["brown", .26], ["light", .15], ["blond", .13], ["ginger", .04]])];
  if (r() < old*1.1) hairColor = old > .6 && r() < .5 ? HC.white : HC.grey;
  else if (age > 38 && r() < .4) hairColor = mixHex(hairColor, HC.grey, .3 + .3*r());
  const styles = f ? (dark ? [["braids", .25], ["afro", .15], ["ponytail", .25], ["bun", .2], ["curly", .1], ["short", .05]] : [["long", .38], ["ponytail", .3], ["bun", .17], ["short", .08], ["curly", .07]])
    : dark ? [["buzz", .2], ["fade", .24], ["short", .08], ["afro", .1], ["curly", .12], ["braids", .05], ["cornrows", .06], ["dreads", .1], ["bald", .05]]
    : [["short", .32], ["fade", .2], ["buzz", .12], ["messy", .14], ["curly", .08], ["long", .05], ["bald", .04], ["dreads", .02], ["ponytail", .03]];
  let hair = wpick(r, styles), receding = 0;
  if (!f && age > 32 && r() < (age - 30)/40){ receding = Math.min(1, (age - 30)/30*r() + .2); if (age > 50 && r() < .4) hair = r() < .5 ? "horseshoe" : "bald"; else if (!["short", "buzz", "fade", "messy"].includes(hair)) hair = "short"; }
  const beard = f ? "" : wpick(r, [["", .55 - old*.1], ["stubble", .3], ["beard", .15 + old*.15]]);
  const eyes = IRIS[tone <= 2 ? wpick(r, [["brown", .45], ["hazel", .15], ["blue", .28], ["green", .12]]) : wpick(r, [["brown", .55], ["dark", .45]])];
  const build = x.build || wpick(r, R.builds);
  const height = x.height || +(f ? rr(.9, .97) : rr(.95, 1.06) + (R.tall || 0)).toFixed(3);
  const face = {jaw:f ? rr(.9, 1) : rr(.94, 1.12), nose:f ? rr(.84, 1) : rr(.9, 1.16), brow:f ? rr(.8, .95) : rr(.9, 1.2), eyes:rr(.95, 1.05), chin:rr(.88, 1.12)};
  const mute = c => mixHex(c, 0x7c7a76, old*.45);
  const kit = x.kit || ["#2c66b8", "#ffffff"];
  let outfit, props = [];
  if (role === "footballer"){
    const [bc, bs] = pick(BOOTS);
    outfit = {type:x.training ? "training" : "kit", shirt:kit[0], shorts:kit[1], socks:kit[2] || kit[0], sockTrim:kit[1], trim:kit[1], number:x.number || 0, bib:x.bib || false, shoes:bc, stripe:bs, sole:bc === 0xf2f2f0 ? 0xd8d8d4 : 0x24262a};
  } else if (role === "goalkeeper"){
    const team = new THREE.Color(hex(kit[0])), opts = [0x2f9e44, 0xf2c230, 0xf07a1a, 0x24262b, 0x7a3fb0, 0x1fa2c4].filter(c => { const k = new THREE.Color(c); return Math.abs(k.r - team.r) + Math.abs(k.g - team.g) + Math.abs(k.b - team.b) > .5; });
    const c = pick(opts), [bc, bs] = pick(BOOTS);
    outfit = {type:"gk", shirt:c, trim:0x1c1d21, shorts:0x1c1d21, socks:c, sockTrim:0x1c1d21, number:x.number || 1, glove:pick([0xf2f2ee, 0xd8ff3a, 0xf06a1e]), gloveTrim:0x1c1d21, shoes:bc, stripe:bs};
  } else if (role === "coach"){
    const club = hex(kit[0]);
    outfit = {type:"tracksuit", shirt:mixHex(club, 0x10141c, .55), trousers:mixHex(club, 0x10141c, .7), trim:mixHex(club, 0xffffff, .2), shoes:pick([0x1c1d21, 0xf0f0ec])};
    props = ["clipboard"];
  } else if (role === "manager"){
    // the one man at the club you know from across the room: an older face, a dark suit or a long coat, a tie, glasses
    const coat = r() < .5;
    outfit = {type:coat ? "coat" : "suit", shirt:pick(coat ? [0x2a2c30, 0x1d2430, 0x4a3b2e] : [0x1d2430, 0x2a2c30, 0x33373d]), trousers:pick([0x23262b, 0x1d2430, 0x2b2e33]), inner:pick([0xf2f2ee, 0xc9d8ea, 0xe9e4da]),
      tie:pick([0x7a1f2b, 0x1d2a4a, 0x5a2a5a, 0x8a6a2a]), shoes:pick([0x15161a, 0x3b2618])};
    props = ["glasses"];
  } else if (role === "shopkeeper" || role === "barista"){
    const ba = role === "barista";
    outfit = {type:"apron", apronCut:ba ? "bib" : "waist", collar:ba ? "crew" : (r() < .5 ? "polo" : "crew"), shirt:ba ? pick([0x1f2125, 0xf2f0ea, 0x6b6e72]) : pick([0xf2f0ea, 0x2f7d4a, 0x24324a, 0x8a8f96]),
      apron:ba ? pick([0x3b2a20, 0x1f2125, 0x4a5236]) : pick([0x2f7d4a, 0x24324a, 0x8e2b2b]), trousers:pick(CASUAL.trousers.slice(0, 4)), shoes:pick([0x1c1d21, 0xf0f0ec])};
  } else if (role === "office"){
    outfit = {type:"office", shirt:pick([0xf2f2ee, 0xc9d8ea, 0xe8dfe8, 0xdfe8d8, 0x9fb7d4]), trousers:pick([0x23262b, 0x24304a, 0x4a4d52, 0xa89a78]), tie:r() < .3 ? pick([0x7a1f2b, 0x1d2a4a]) : false,
      shoes:pick([0x15161a, 0x3b2618]), belt:0x231a14};
    if (r() < .3) outfit.sleeves = "short";
  } else if (role === "courier"){
    outfit = {type:"polo", shirt:0x1b6f9a, trim:0xf2c230, legwear:r() < .5 ? "shorts" : "trackpants", shorts:0x23262b, trousers:0x23262b, socks:0x1c1d21, shoes:pick([0x1c1d21, 0xf0f0ec])};
  } else if (role === "gym"){
    // the sports centre's staff polo, shorts or track trousers
    const tp = r() < .45;
    outfit = {type:"polo", shirt:pick([0x2f4a6a, 0x1f2125, 0x2c66b8]), trim:0xc8f060, legwear:tp ? "trackpants" : "shorts", shorts:pick([0x1f2125, 0x24304a]), trousers:0x1f2125, socks:0xf2f2ee, shoes:pick([0xf0f0ec, 0x1c1d21])};
  } else if (role === "physio" || role === "kitman"){
    // club staff: a polo (the physio) or a training top (the kit man) in the club's dark colour, track trousers
    const club = mixHex(hex(kit[0]), 0x10141c, .55), ph = role === "physio";
    outfit = ph ? {type:"polo", shirt:club, trim:mixHex(hex(kit[0]), 0xffffff, .25), legwear:"trackpants", trousers:0x1d2027, shoes:pick([0xf0f0ec, 0x1c1d21])}
      : {type:"tracksuit", shirt:club, trousers:mixHex(hex(kit[0]), 0x10141c, .72), trim:mixHex(hex(kit[0]), 0xffffff, .2), shoes:0x1c1d21};
  } else if (role === "receptionist"){
    outfit = {type:"office", shirt:pick([0xf2f2ee, 0xc9d8ea, 0xe8dfe8]), trousers:pick([0x23262b, 0x24304a]), shoes:0x15161a, belt:0x231a14};
  } else if (role === "clerk"){
    // the store's own polo and a dark waist apron
    outfit = {type:"apron", apronCut:"waist", collar:"polo", shirt:pick([0x8a2d2d, 0x6e2a2f]), apron:0x23262b, trousers:pick([0x23262b, 0x34383f]), shoes:0x1c1d21};
  } else if (role === "dispatcher"){
    outfit = {type:"polo", sleeves:"long", shirt:0x1b6f9a, trim:0xf2c230, legwear:"trousers", trousers:pick([0x3a3f46, 0x23262b]), shoes:0x1c1d21};
  } else if (role === "photographer"){
    outfit = {type:r() < .5 ? "jacket" : "casual", shirt:pick([0x1f2125, 0x2a2c30, 0x3d3a36]), inner:pick([0x1f2125, 0x8a8f96, 0xf2f0ea]), legwear:"jeans", trousers:pick(CASUAL.jeans), shoes:pick([0x1c1d21, 0x8a6a48])};
  } else if (role === "editor"){
    outfit = {type:"hoodie", shirt:pick([0x24324a, 0x38513a, 0x4a3b5e, 0x1f2125]), legwear:"jeans", trousers:pick(CASUAL.jeans), shoes:pick([0xf0f0ec, 0x1c1d21])};
    if (r() < .5) props = ["glasses"];
  } else {
    const kind = wpick(r, [["casual", .4], ["polo", .15], ["hoodie", .22], ["jacket", .23 + old*.2]]);
    const legwear = wpick(r, [["jeans", .5], ["trousers", .35 + old*.3], ["shorts", .15 - old*.12]]);
    outfit = {type:kind, shirt:mute(pick(kind === "hoodie" ? CASUAL.hoodie : kind === "jacket" ? CASUAL.jacket : CASUAL.tee)), inner:mute(pick(CASUAL.tee)), legwear,
      trousers:mute(pick(legwear === "jeans" ? CASUAL.jeans : CASUAL.trousers)), shorts:mute(pick(CASUAL.trousers)), socks:0xf2f2ee, shoes:mute(pick(CASUAL.shoes))};
    if (kind === "jacket" && old > .5 && r() < .6) outfit.footwear = "dress";
  }
  const look = {role, sex, age, skin, height, build, hair, hairColor, beard, eyes, receding, face, outfit, props, seed:seed | 0};
  for (const k in x) if (!["kit", "number", "bib", "training", "outfit"].includes(k)) look[k] = x[k];
  if (x.outfit) look.outfit = Object.assign(look.outfit, x.outfit);
  return look;
}
