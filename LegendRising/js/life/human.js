/* ============ LIFE: humans ============
   Owner: WP-B (Stage 1). Contract: DESIGN 1.2 (human.js), 1.4.18 (animation API), 3.5 (the animation overhaul), 3.9.6
   (bodies: LOD3, prebuildHumans), 3.9.1 (the material on a preset change).
   Everybody you meet (team-mates, the coach, the manager, the woman behind the till) and your own body.
   Each person is ONE skinned mesh: a faceted, vertex-coloured low-poly body (lathed elliptical rings for the
   torso and limbs, a shaped head with a face, hair with a real silhouette, clothes that are part of the body's
   own surface rather than painted on) bound to a 20-bone rig (rig.js), drawn with one shared material. Bodies are
   cached by shape, so team-mates with the same build/kit cut/hair share the same buffers and only carry their
   own colours. A far body (about a thousand triangles, the face reduced to a few flat shapes, shared between people
   of the same build and kit whatever their faces) takes over at distance, and beyond that a LOD3 body of about 200
   indexed triangles; a single instanced blob under everyone grounds them without redrawing the sun's shadow map.

   ---- the API ----
   lookFor(role, seed, extras) -> look            a believable, seeded person for a role:
       "footballer" "goalkeeper" "coach" "manager" "shopkeeper" "barista" "customer" "office" "courier" "gym" "pedestrian"
       "physio" "kitman" "receptionist" "clerk" "dispatcher" "photographer" "editor" "referee" "linesman"
       extras are merged over the result (outfit fields merge into outfit); also extras.kit = [shirt, shorts], extras.number
       (club staff: coach, physio, kit man, take the club's colours from extras.kit). The manager is always an older man
       in a dark suit or long coat, with a tie and glasses: the one face at the club you know from across the room.
   look = {
     sex:"m"|"f", age, skin (hex), height (about .92 to 1.08, scales the whole body), build:"slim"|"average"|"athletic"|"stocky"|"muscular",
     hair:"short"|"fade"|"buzz"|"curly"|"afro"|"long"|"ponytail"|"bun"|"braids"|"cornrows"|"dreads"|"messy"|"bald"|"horseshoe"
       |"undercut"|"slick"|"spiky"|"mohawk" (the barber's), hairColor (hex), beard:""|"stubble"|"beard"|"goatee"|"full", eyes (iris hex), receding (0..1),
     face:{jaw, nose, brow, eyes}  (each about .9 to 1.12, eyes = spacing),
     outfit:{type:"kit"|"training"|"gk"|"tracksuit"|"casual"|"polo"|"hoodie"|"jacket"|"suit"|"coat"|"apron"|"office",
             shirt, trim, shorts, trousers, socks, sockTrim, shoes, sole, stripe, number, numCol, bib (colour or false),
             glove, inner, tie (colour or false), apron (colour), apronCut:"bib"|"waist", belt,
             sleeves:"short"|"long", collar:"crew"|"v"|"polo"|"shirt"|"zip"|"hood"|"lapel"|"open",
             legwear:"kitshorts"|"shorts"|"trousers"|"jeans"|"trackpants", footwear:"boots"|"trainers"|"dress"},
     props:["clipboard", "glasses"], seed }
   human(look, {cast, lod, track}) -> h        h.g is a Group with the feet at its origin, facing +z. Add it anywhere.
       h.dispose() frees it (done for you when the place is rebuilt). cast:true lets it throw a real sun shadow
       (only for people who stand still: the sun's shadow map is not redrawn every frame). h.groundAt(x, z, y) may be
       set to find the floor under a footstep (your own body does: stairs and kerbs); otherwise the feet stand on the
       level of the group's origin.
   animateHuman(h, dt, state, {tier}) -> h.ev    state is a mode string or {mode, speed, ...}; see the pipeline below.
       "idle" (breathing, weight shift, looking about; {arms:"hips"|"behind"|"folded"})
       "move" {speed: m/s} (also "walk" "jog" "run" "sprint" as presets): the body is moved by its owner; the legs
              measure that motion and step under it (gait.js): feet planted where they land, starts, stops, turns on
              the spot and cuts as real footsteps. state.root {x, z}: where the body really is when its group carries a
              cosmetic offset; state.intent: the speed the owner wants (a stop starts from it); state.style:
              "normal" | "shuffle" | "backpedal" | "jockey"; state.phase: an outside gait clock (the match simulation)
       "kick" "pass" "trap" {t:0..1, amp}: the ball leaves/meets the foot at t = CONTACT[mode]
       "header" {t}  "tackle" {t}  "dive" {t, dir:+1 or -1}  "gkready"  "celebrate"  "stretch" (cycles four stretches)
       "sit" {seat:.45}: SEAT CONTRACT: put the group on the floor under the middle of the seat, facing the way
              the person looks; seat = seat-top height in world metres (chairs .45 to .48, benches .42 to .45), whatever
              the person's height: the backside rests on it. Feet land about .45 m ahead; the hands lie on the thighs.
       "typing" {seat:.47, desk:.74, reach:.4, keys} (sitting, hands on a desk in front; heights and reach in world metres;
              keys:false: no keyboard, the hands rest flat on the table top, still: a cafe table, a book)
       "counter" {counter:1.0, reach:.34, lean, work} (standing, both palms flat on a counter top that high, reach ahead of
              the feet, a hip's width apart, elbows soft; the body leans in as far as it must but no more than about 12
              degrees (lean: radians overrides it; a top below hip height allows a little more); work:true: busy at it,
              wiping, moving things)
       Hands that rest on something lie flat on it (palm within about 1 cm of the top, whatever the height).
       "clipboard" (the coach: board in the left hand, writing now and then, watching)
       Any state may carry look:yaw to turn the head, upper:{g, w} for a gesture over the rest, blend (seconds).
       A change of mode is blended by inertialisation (default 0.2 s, longer for a body with far to go).
   registerMode(name, fn(h, Te, st, dt)) a new pose by name (WP-K); EV the event bits of h.ev; footEvents(h) the
       footfalls of the last call; prebuildHumans(looks) builds bodies ahead of need (PREBUILD: its last run's
       slices); clashFree(colour, avoid) a kit colour that stands apart from others (lookFor's keeper and referee take
       extras.avoid, both teams' shirts); animTier(h, tier) the tier to draw a person at (the scheduler's, or T4 while
       the body is not shown; npc.js actor()); ANIM the full poses of this frame and the budget; bodies() every
       body made (tests); footstep(h, side, x, z, yaw), touch(h, {ball}), gaitPlace(h) from gait.js.
   playerRig(look, {firstPerson:true}) -> h     your own body for first person: no head, hair or neck (the body
       stops at the shoulders in a low dome of shirt), same art style, same rig and animateHuman(); not tracked
       for LOD/blobs (one mesh, always near). The eyes of a 1.80 m body are at 1.68 (scale the rig by EYE/1.68),
       and the camera wants to sit about .1 m in front of the neck (z about +.1 in the rig's frame): looking down you
       then see the top of your chest and your arms, not the inside of a neck (further forward, about .2, shows the
       feet too). h.bones[BONE.haR] etc. are the bones (BONE maps names to index) if a held object or a camera needs
       to follow a hand or the chest.
   CONTACT = {kick, pass, trap, header}: the t at which foot (or head) meets the ball.
   VIEW = {x, y, z, fx, fz, scene}: where the camera (you, in first person) was at the last frame drawn, and the way it
       looked (flat): people use it to come and go only where you aren't looking.
   you() -> {x, z, here, n}: where you are now (the fresher of VIEW and your own body as last posed): people use it to
       get out of your way and never to step into you.
   Budget: about 3.2k triangles near, 1k far, 200 at LOD3, ONE draw call per person (+1 for the shirt number up
   close), one more for all the blobs together. LOD distances, shirt numbers and the animation tiers follow GFX.P.
*/
import {THREE, W, lambertFor} from "./build.js";
import {SCHED} from "./core/sched.js";
import {qualityScales} from "./core/quality.js";
import {TAU, D2R, clamp, lerp, sstep, wrap, kf, BN, PAR, BONE, B, ARM, LEG, NP, NQ, dims, restPos, restOffsets, R3, frameOf, legIK, armIK, plantHand, leanTo, PALM, UPV as _UPV,
  eulerToQ, qEuler, qMul, qRot, qLog, qExp, qAngle, fkQ, newFK, solveLeg, ground, writeBones, LEGW} from "./rig.js";
import {EV, gaitInit, gaitStep, gaitPose, gaitLegs, gaitPlace, footstep, touch} from "./gait.js";
export {BONE, footstep, touch, gaitPlace};

/* ---------- small maths ---------- */

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
/* a body's geometry, in stages (a generator: prebuildHumans spreads the stages over idle moments; shape() runs it
   through at once) */
function* buildSteps(look, det, noHead){
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

  yield;
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
    if (s > 0) yield;                                    // (each arm a stage of its own: prebuildHumans keeps its slices short)
  }

  yield;
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
    // (one continuous surface, like a pair of trousers: no tube poking through another)
    const half = [], hn = TR[0].v.length;
    for (let k = 0; k <= hn/2; k++) half.push(TR[0].v[s > 0 ? k : (hn/2 + k) % hn]);
    half.push(...CROTCH);
    zip(G, half, LR[0].v, x, 0, S.bottom);
    shoe(G, D, s, g, near);
    if (s > 0) yield;                                    // (each leg a stage of its own)
  }

  yield;
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
  yield;
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
    yield;
    yield* face(G, D, F, look, headHit, hf, !near);       // (the far body too, plainer: no face popping on and off)
    const specs = near && (look.props || []).includes("glasses");
    if (specs) G.hit = [];
    yield;
    hair(G, D, F, look, hf, near);
    if (specs){ const hairHit = G.hit; G.hit = null; glasses(G, D, F, headHit, headHit.concat(hairHit)); }
    if (look.beard === "beard" || look.beard === "goatee" || look.beard === "full"){ yield; beard(G, D, hf, near, look.beard); }
  }
  return {G, torsoHit, D, hem};
}

/* shoes: a lofted last with a sole you can see, a toe, a heel, a stripe, and studs on football boots */
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

/* the face: eyes (whites, irises, a lid line), brows, a nose, a mouth, ears, cast onto the faceted head. lite: the far
   body's (a few triangles each, no lid line), so the face reads the same from 13 m as from 16 */
// (a generator: each side's eye, brow and ear is a stage of the build, every point of them found on the head by a ray)
function* face(G, D, F, look, hit, hf, lite = false){
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
    yield;
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
   run back over the temples (over the hair where it covers them) to rest on the root of each ear and tuck down
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
// the far body is shared by everyone of the same build and kit: its face is the plain one and it has no beard
const FARFACE = {jaw:1, nose:1, brow:1, eyes:1, chin:1};
const farLook = look => Object.assign({}, look, {face:FARFACE, beard:""});
function shapeKey(look, det, noHead){
  const g = garb(look.outfit);
  if (det < 0) return [det, look.sex, look.build, look.hair === "bald" || look.hair === "buzz" ? "b" : "h", g.sleeves, g.legwear, g.legs, g.gloves, g.top === "kit" ? 1 : 0, Math.round(sstep(45, 78, look.age || 25)*4)].join("|");
  const F = look.face || {}, q = v => Math.round(((v || 1) - 1)/.06);
  return [det, noHead ? 1 : 0, look.sex, look.build, look.hair, look.beard || "", Math.round((look.receding || 0)*4), q(F.jaw), q(F.nose), q(F.brow), q(F.eyes), q(F.chin),
    g.top, g.sleeves, g.collar, g.legwear, g.footwear, g.legs, g.tuck, g.belt, g.gloves, g.bib, g.apron, g.tie, g.coat, g.hood, g.zip, g.crest, g.placket,
    (look.props || []).join("+"), Math.round(sstep(45, 78, look.age || 25)*4)].join("|");
}
// det 1 near, 0 far, -1 LOD3. A generator: it yields between the stages of the build
function* shapeSteps(look, det, noHead){
  const key = shapeKey(look, det, noHead);
  let sp = SHAPES.get(key);
  if (sp) return sp;
  if (det < 0){ sp = lod3Shape(look, key); SHAPES.set(key, sp); return sp; }
  const it = buildSteps(look, det, noHead);
  let r; while (!(r = it.next()).done) yield;
  yield;                                                 // (the packing below is a stage of its own)
  const {G, torsoHit, D} = r.value, n = G.sl.length;
  const pos = new Float32Array(G.p), nor = new Float32Array(n*3);
  // (the faces' normals, a few thousand vertices a stage, worked out in place)
  for (let i = 0; i < n; i += 3){
    if (i && i % 4500 === 0) yield;
    const a = i*3, t = G.tn[i/3];
    let nx, ny, nz;
    if (t){ nx = t[0]; ny = t[1]; nz = t[2]; }
    else {
      const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
      nx = uy*vz - uz*vy; ny = uz*vx - ux*vz; nz = ux*vy - uy*vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    for (let k = 0; k < 3; k++){ nor[a + k*3] = nx; nor[a + k*3 + 1] = ny; nor[a + k*3 + 2] = nz; }
  }
  yield;
  const g = garb(look.outfit), rough = new Uint8Array(n);
  for (let i = 0; i < n; i++){ const nm = SLOTS[G.sl[i]]; let rr = ROUGH[nm] == null ? .92 : ROUGH[nm]; if (nm === "shoe" && g.footwear === "dress") rr = .3; if (nm === "shoe" && g.footwear === "trainers") rr = .7; rough[i] = Math.round(rr*255); }
  sp = {key, n, D, torsoHit, slot:new Uint8Array(G.sl), shade:new Float32Array(G.sh), attr:{
    position:new THREE.BufferAttribute(pos, 3), normal:new THREE.BufferAttribute(nor, 3),
    skinIndex:new THREE.Uint8BufferAttribute(G.bi, 4), skinWeight:new THREE.BufferAttribute(new Float32Array(G.bw), 4),
    rough:new THREE.BufferAttribute(rough, 1, true)}, nums:new Map()};
  SHAPES.set(key, sp);
  return sp;
}
function shape(look, det, noHead){
  if (det === 0) look = farLook(look);
  const it = shapeSteps(look, det, noHead);
  let r; while (!(r = it.next()).done);
  return r.value;
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


/* ---------- the shared material: matte cloth, soft skin, glossier boots; roughness rides on each vertex ----------
   One material per class, shared by every body. Which class a preset uses (Lambert or Standard) follows build.js
   lambertFor("human"): Low is Lambert, Medium and High physical. A change of preset puts every body on the new one at
   once (gfxOn below): human.js re-materialises its own (userData.rematBy "human.js"; quality.js leaves these alone). */
let MAT = null, MATLOW = null;
const lowFor = () => lambertFor("human");
export function humanMaterial(low = lowFor()){
  if (low){ if (!MATLOW){ MATLOW = new THREE.MeshLambertMaterial({vertexColors:true, flatShading:true}); MATLOW.userData.keep = true; MATLOW.userData.rematBy = "human.js"; } return MATLOW; }
  if (!MAT){
    MAT = new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:1, metalness:0, envMapIntensity:.5});
    MAT.userData.keep = true; MAT.userData.rematBy = "human.js";
    MAT.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float rough;\nvarying float vRough;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRough = rough;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vRough;").replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRough;");
    };
    MAT.customProgramCacheKey = () => "human-rough-1";
  }
  return MAT;
}
const isHumanMat = m => m === MAT || m === MATLOW;
const MAT_SUBS = new Set();
// fn() after the bodies changed material (me.js remakes its fading copy)
export function onHumanRemat(fn){ MAT_SUBS.add(fn); return () => MAT_SUBS.delete(fn); }
// every body (and every shirt number) onto the material the preset in force asks for
export function rematHumans(){
  const m = humanMaterial();
  for (const h of ALL){
    for (const k of ["near", "far", "lod3m", "num"]){ const x = h[k]; if (x && isHumanMat(x.material) && x.material !== m) x.material = m; }
  }
  for (const fn of MAT_SUBS) try { fn(m); } catch(e){ console.error(e); }
  return m;
}
if (typeof gfxOn === "function") gfxOn(() => rematHumans());


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
const LIVE = new Set(), ALL = new Set();
const IDENT = new THREE.Matrix4();
let HID = 0;
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
  const sp3 = opts.lod === false || noHead ? null : shape(look, -1, false);
  const g = new THREE.Group(); g.name = "person";
  const rest = restPos(D), bones = rest.map((r, i) => { const b = new THREE.Bone(); b.name = BN[i]; return b; });
  bones.forEach((b, i) => { const p = PAR[i], r = rest[i], pr = p < 0 ? [0, 0, 0] : rest[p]; b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]); if (p >= 0) bones[p].add(b); });
  // bones are posed by animateHuman, which updates their matrices itself (rig.js writeBones)
  for (const b of bones){ b.updateMatrix(); b.matrixAutoUpdate = false; }
  g.add(bones[0]);
  const skel = new THREE.Skeleton(bones, rest.map(r => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2])));
  const pal = palette(look);
  const mk = sp => {
    const geo = new THREE.BufferGeometry();
    for (const k of SHARED) geo.setAttribute(k, sp.attr[k]);
    if (sp.index) geo.setIndex(sp.index);
    geo.setAttribute("color", colours(sp, pal));
    const m = new THREE.SkinnedMesh(geo, humanMaterial());
    m.bind(skel, IDENT);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 2.1);
    m.userData.keep = true; m.receiveShadow = true; m.castShadow = !!opts.cast;
    g.add(m); return m;
  };
  const near = mk(spN), far = spF ? mk(spF) : null, lod3m = sp3 ? mk(sp3) : null;
  if (far) far.visible = false;
  if (lod3m){ lod3m.visible = false; lod3m.castShadow = false; }
  const og = garb(look.outfit);
  let num = null;
  if (og.number && !og.bib && !noHead){ num = numberMesh(spN, og.number, pal, D.chestY); bones[B.chest].add(num); }
  const r = rng((look.seed | 0) + 77);
  const RO = restOffsets(rest);
  const h = {g, look, D, bones, skel, near, far, lod3m, num, isHuman:true, id:++HID,
    pose:new Float32Array(NQ), posePrev:new Float32Array(NQ), te:new Float32Array(NP), tq:new Float32Array(NQ), base:new Float32Array(3), baseOk:false,
    lpSame:false, lpAt:new Float64Array(3),
    rest:RO.V, restA:RO.A, inz:{on:false, t:0, w:1, x:new Float64Array(63), v:new Float64Array(63)}, upper:{w:0, g:null, st:null},
    ev:{mask:0, at:0, side:null, reachErr:0, impact:0}, locks:[null, null], feetTmp:[null, null],
    bw:1, mode:"", at:0, t:r()*100, acc:0, accL:0, dtPrev:0, posed:0, sinceF:0, hid:false, gw:0, lod:1, seed:r(),
    stance:.01 + r()*.03, fz:(r() - .5)*.08, arm:r(), gen:W.ticks, scale:look.height || 1, stag:HID % 6, groundAt:null};
  h.sinceF = h.stag;
  for (let i = 0; i < 20; i++) h.pose[i*4 + 3] = h.posePrev[i*4 + 3] = 1;
  g.scale.setScalar(h.scale); g.userData.human = h;
  gaitInit(h);
  h.dispose = () => {
    LIVE.delete(h); ALL.delete(h);
    for (const m of [near, far, lod3m]) if (m){ for (const k of SHARED) m.geometry.deleteAttribute(k); m.geometry.setIndex(null); m.geometry.dispose(); }
    skel.dispose();
    if (g.parent) g.parent.remove(g);
  };
  ALL.add(h);
  if (opts.track !== false){ LIVE.add(h); hook(W.scene); }
  animateHuman(h, 0, "idle"); h.bw = 1;
  return h;
}
// every body made and not yet disposed (tests: where people are, how they were posed)
export function bodies(){ return [...ALL]; }
// your own body, for first person: no head, no hair; arms, hands, legs and feet in the same style
export function playerRig(look = {}, o = {}){
  const h = human(look, {noHead:o.firstPerson !== false, lod:false, track:false, cast:!!o.cast});
  h.near.frustumCulled = false;
  return h;
}


/* ---------- the furthest body (LOD3): about 200 triangles, indexed, on the same skeleton ----------
   Beyond GFX.P.lod.lod3 (30 m on Low) a person is a few pixels tall: a torso, a head with its hair on top, limbs as
   four-sided tubes bent at the joints, shoes as boxes, in the person's own colours. Indexed (each band shares its
   corners), so it costs a fifth of the far body's vertices. */
function lod3Build(look){
  const D = dims(look), g = garb(look.outfit), P = [], SL = [], SH = [], BI = [], BW = [], IX = [];
  const vert = (x, y, z, w, slot, sh = 1) => { P.push(x, y, z); SL.push(slot); SH.push(sh); BI.push(w[0], w[2], 0, 0); BW.push(w[1], w[3], 0, 0); return SL.length - 1; };
  // a band between two rings (each [cx, cy, cz, rx, rz, w]), n sides, one slot; caps optional
  const band = (a, b, n, slot, sh = 1, capA = false, capB = false) => {
    const ra = [], rb = [];
    for (let k = 0; k < n; k++){
      const t = (k + .5)/n*TAU, c = Math.cos(t), s = Math.sin(t);
      ra.push(vert(a[0] + s*a[3], a[1], a[2] + c*a[4], a[5], slot, sh)); rb.push(vert(b[0] + s*b[3], b[1], b[2] + c*b[4], b[5], slot, sh));
    }
    const up = b[1] > a[1];
    for (let k = 0; k < n; k++){
      const k1 = (k + 1) % n;
      if (up) IX.push(ra[k], ra[k1], rb[k1], ra[k], rb[k1], rb[k]); else IX.push(ra[k], rb[k1], ra[k1], ra[k], rb[k], rb[k1]);
    }
    const cap = (r, c, down) => { const m = vert(c[0], c[1], c[2], c[5], slot, sh*.9); for (let k = 0; k < n; k++){ const k1 = (k + 1) % n; if (down) IX.push(m, r[k1], r[k]); else IX.push(m, r[k], r[k1]); } };
    if (capA) cap(ra, a, up); if (capB) cap(rb, b, !up);
  };
  // a limb along y through rings that may each sit at their own x and z
  const H = B.hips, SP = B.spine, C = B.chest, N = B.neck, HD = B.head;
  const shorts = g.legwear === "kitshorts" || g.legwear === "shorts", socks = g.legs === "socks";
  const topS = S.top, botS = S.bottom;
  // torso: the seat, the waist, the chest, the shoulders, the neck
  const R = (y, rx, rz, w, z = 0) => [0, y, z, rx, rz, w];
  band(R(.83, .15*D.hp, .085, wt(H)), R(.97, .16*D.hp, .1, wt(H, .6, SP, .4)), 6, botS, .9, true);
  band(R(.97, .16*D.hp, .1, wt(H, .6, SP, .4)), R(1.2, .15*D.ch, .1 + D.belly*.01, wt(SP, .5, C, .5)), 6, topS);
  band(R(1.2, .15*D.ch, .1 + D.belly*.01, wt(SP, .5, C, .5)), R(1.43, .17*D.sh, .085, wt(C)), 6, topS);
  band(R(1.43, .17*D.sh, .085, wt(C)), R(1.5, .055, .055, wt(C, .5, N, .5)), 6, topS, 1);
  // the head: the face and the hair over it
  const bald = look.hair === "bald" || look.hair === "buzz";
  band(R(1.5, .055, .055, wt(C, .5, N, .5)), R(1.6, .08*D.hs, .09*D.hs, wt(HD), .01), 6, S.skin);
  band(R(1.6, .08*D.hs, .09*D.hs, wt(HD), .01), R(1.71, .085*D.hs, .095*D.hs, wt(HD), .005), 6, S.skin);
  band(R(1.71, .085*D.hs, .095*D.hs, wt(HD), .005), R(1.795, .03, .035, wt(HD), -.005), 6, bald ? S.skin : S.hair, 1, false, true);
  // arms: the shoulder, the elbow, the wrist, the fingertips
  for (const s of [1, -1]){
    const [U, Fa, Hd] = ARM(s), x = s*D.shX, y0 = D.shY, eY = y0 - D.elbowL, wY = eY - D.foreL, a = D.arm;
    const r = (y, rr, w) => [x, y, -.005, rr*a, rr*a, w];
    const longS = g.sleeves === "long";
    band(r(y0, .05, wt(C, .5, U, .5)), r(eY, .04, wt(U, .5, Fa, .5)), 4, longS || g.top !== "kit" ? topS : topS);
    band(r(eY, .04, wt(U, .5, Fa, .5)), r(wY, .03, wt(Fa, .5, Hd, .5)), 4, longS ? topS : S.skin);
    band(r(wY, .03, wt(Fa, .5, Hd, .5)), r(wY - .15, .02, wt(Hd)), 4, g.gloves ? S.glove : S.skin, 1, false, true);
  }
  // legs: the hip, the hem, the knee, the ankle; the shoe a box on the foot
  for (const s of [1, -1]){
    const [T0, SH0, FT, TO] = LEG(s), x = s*D.hipX, l = D.leg;
    const r = (y, rr, w) => [x, y, 0, rr*l, rr*l, w];
    const hem = shorts ? (g.legwear === "kitshorts" ? .7 : .6) : .1;
    band(r(D.hipY, .08, wt(H, .5, T0, .5)), r(Math.max(hem, .52), .065, wt(T0)), 4, botS);
    if (shorts) band(r(hem, .062, wt(T0)), r(D.kneeY, .05, wt(T0, .5, SH0, .5)), 4, S.skin);
    else band(r(.52, .062, wt(T0)), r(D.kneeY, .052, wt(T0, .5, SH0, .5)), 4, botS);
    band(r(D.kneeY, .05, wt(T0, .5, SH0, .5)), r(.1, .035, wt(SH0, .7, FT, .3)), 4, socks ? S.socks : shorts ? S.skin : botS);
    // the shoe: heel to toe, the front corners on the toe bone
    const z0 = -.08, z1 = .19, hw = .045, y1 = .1;
    const cs = [[-hw, 0, z0, wt(FT)], [hw, 0, z0, wt(FT)], [hw, 0, z1, wt(TO)], [-hw, 0, z1, wt(TO)], [-hw, y1, z0, wt(FT)], [hw, y1, z0, wt(FT)], [hw, .04, z1, wt(TO)], [-hw, .04, z1, wt(TO)]]
      .map(([dx, y, z, w]) => vert(x + dx, y, z, w, S.shoe, .85));
    for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) IX.push(cs[a], cs[c], cs[b], cs[a], cs[d], cs[c]);
  }
  return {P, SL, SH, BI, BW, IX, D};
}
function lod3Shape(look, key){
  const L = lod3Build(look), n = L.SL.length;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(L.P), 3), index = new THREE.BufferAttribute(n < 65535 ? new Uint16Array(L.IX) : new Uint32Array(L.IX), 1);
  geo.setAttribute("position", pos); geo.setIndex(index); geo.computeVertexNormals();
  const rough = new Uint8Array(n).fill(Math.round(.9*255));
  return {key, n, D:L.D, torsoHit:null, slot:new Uint8Array(L.SL), shade:new Float32Array(L.SH), index, tris:L.IX.length/3, attr:{
    position:pos, normal:geo.getAttribute("normal"), skinIndex:new THREE.Uint8BufferAttribute(L.BI, 4), skinWeight:new THREE.BufferAttribute(new Float32Array(L.BW), 4),
    rough:new THREE.BufferAttribute(rough, 1, true)}, nums:new Map()};
}


/* ---------- once a frame, before drawing: near or far body, numbers up close, and the blobs underfoot ---------- */
// where the camera (in first person: you) was at the last frame drawn, so people can step out of your way
// (x is read through an accessor so that every time anyone sets it (drawing, world.js after drawing, putting you somewhere
// is counted): you() below then knows whether VIEW or your own body is the fresher word on where you are)
let FIX = 0, NOTE = 0;
const _VX = {x:0};
export const VIEW = {get x(){ return _VX.x; }, set x(v){ _VX.x = v; FIX++; }, y:-99, z:0, fx:0, fz:-1, scene:null};   // fx, fz: the way the camera looks, flat
/* you(): where you are now, as best anyone can tell: {x, z, here (you are in the place being stepped), n (changes with
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
/* onFirstView(fn): fn(VIEW) runs once, just before the first frame of the place being built now is drawn; VIEW then
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
const LOD_DEF = {near:15, back:13.5, lod3:60};
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
    // the preset's distances (DESIGN 1.4.4): full detail within lod.near (back to it under lod.back), the far body beyond,
    // LOD3 beyond lod.lod3 (back under 2 m less); shirt numbers within shirtNumDist. Adaptive quality's last step (3.9.1,
    // quality.js Q.lod) draws them all a little nearer
    const GP = typeof GFX === "object" && GFX && GFX.P, L0 = GP && GP.lod ? GP.lod : LOD_DEF, ql = qualityScales().lod;
    const Ld = ql === 1 ? L0 : (_ld.near = L0.near*ql, _ld.back = L0.back*ql, _ld.lod3 = L0.lod3*ql, _ld), numD = (GP && GP.shirtNumDist || 9.5)*ql;
    for (const h of LIVE){
      // where is it: in this scene, and shown?
      let o = h.g, vis = true;
      while (o.parent){ if (!o.visible) vis = false; o = o.parent; }
      if (o !== sc){ if (h.gen !== W.ticks) h.dispose(); continue; }
      if (!vis || !h.g.visible) continue;
      const e = h.g.matrixWorld.elements, d = Math.hypot(e[12] - _cam.x, e[13] - _cam.y, e[14] - _cam.z);
      if (h.far){
        let lv = h.lod;
        if (d < Ld.back) lv = 1;
        else if (d > Ld.near) lv = h.lod3m && (d > Ld.lod3 || (lv === -1 && d > Ld.lod3 - 2)) ? -1 : 0;
        else if (lv !== 1) lv = 0;
        if (lv !== h.lod){ h.lod = lv; h.near.visible = lv === 1; h.far.visible = lv === 0; if (h.lod3m) h.lod3m.visible = lv === -1; }
      }
      if (h.num) h.num.visible = h.lod === 1 && d < numD;
      if (n < bl.instanceMatrix.count){
        const hb = h.bones[B.hips].matrixWorld.elements, s = .5*h.scale*(1 + Math.max(0, h.pose[81])*.2);
        _ps.set(hb[12], e[13] + .012, hb[14]); _sc.set(s*1.05, 1, s*1.3); _q0.setFromAxisAngle(_up, Math.atan2(e[8], e[10]));
        bl.setMatrixAt(n++, _mx.compose(_ps, _q0, _sc));
      }
    }
    bl.count = n;
    if (n){ if (bl.parent !== sc) sc.add(bl); bl.instanceMatrix.needsUpdate = true; }
  };
}
const _up = new THREE.Vector3(0, 1, 0);
const _ld = {near:0, back:0, lod3:0};

/* ---------- animation ----------
   animateHuman(h, dt, state, {tier}) runs one pipeline for every body (DESIGN 3.5.6):
     1. the gait (gait.js gaitStep): the root's motion measured, the clock, footprints locked and swings planned. It runs
        on every call at every tier: it is the body's state, and it is cheap;
     2. the base layer: the mode's pose (locomotion's upper body, a life pose, a clip), written in Euler (Te) and turned
        into quaternions once;
     3. inertialisation instead of cross-fades: on a change of mode the difference between what was drawn and the new
        pose (each bone's rotation as an axis-angle offset, the hips' shift) and how fast it was changing decay together
        as x(t) = (x0 + (v0 + w x0) t) e^(-w t), w = 4.74/blendDur: exact for any dt, so a body posed every third frame
        blends exactly like one posed every frame, and an interrupted transition never pops;
     4. the upper-body layer (st.upper: a gesture over whatever the legs do, a masked slerp);
     5. constraints after all blending: the hips' height and the legs onto the footprints (locomotion), planted feet
        held where they stood (clips that declare plant channels), the floor (ground) for low-body clips;
     6. the bones, written as quaternions (their matrices updated only when posed).
   Tiers (DESIGN 3.5.9; SCHED decides, this executes): T0 and T1 a full pose update every call; T2 one every GFX.P.midDiv
   frames and a leg pass (the gait, two leg solves and the hips' height) on the others; T3 one every farDiv frames and
   the leg pass at half rate; T4 the state only, then one catch-up pose blended over 0.15 s when seen again. At most
   ANIM.budget full updates a frame (24 on High, 12 on Low); T2 and T3 bodies over it wait, T0 never does. */
export {EV};
export const CONTACT = {kick:.42, pass:.44, trap:.42, header:.5};
const PRESET = {walk:1.4, jog:3.2, run:5, sprint:7.6};
const _A = new Float32Array(NP), _B = new Float32Array(NP);
const _V = new THREE.Vector3(), _P = new THREE.Vector3();
const _FK = newFK();
export const ANIM = {frame:0, fpu:0, budget:24, hi:0, hiLast:0, byTier:[0, 0, 0, 0, 0], stats:{fpu:0, lp:0, so:0}};
const budgetOf = () => { const P = typeof GFX === "object" && GFX && GFX.P; const t = P && P.tier; return P && P.animBudget ? P.animBudget : t === "low" ? 12 : t === "medium" ? 18 : 24; };
// a new frame of the world (the scheduler's tasks run before its actors): the full-pose budget starts again
// (hi: the T0 and T1 full poses so far this frame; hiLast: last frame's, the room the cheaper tiers leave for them)
SCHED.task({id:"anim-frame", kind:"keep", run(){ ANIM.frame++; ANIM.hiLast = ANIM.hi; ANIM.hi = 0; ANIM.fpu = 0; ANIM.byTier.fill(0); ANIM.budget = budgetOf(); }});
// tests (DESIGN 1.4.20): with trace on, every call logs the body's feet and footfalls
const ANIM_LOG = typeof window === "object" ? (window.__anim = window.__anim || {trace:false, log:[]}) : {trace:false, log:[]};

// (look0: a look to hold instead of st.look, so the poses that stand still need no copy of st a frame: 3.9.6)
function idle(h, T, st, legs = true, look0 = null){
  const t = h.t, D = h.D, sd = h.seed*10, old = D.old;
  const w = Math.sin(t*.42 + sd)*.8 + Math.sin(t*.17 + sd*2)*.2, br = Math.sin(t*1.5 + sd);
  T[60] = .014*w; T[61] = -.004 + .0025*br - old*.01; T[62] = 0;
  R3(T, B.hips, .0, .04*Math.sin(t*.13 + sd), -.022*w);
  R3(T, B.spine, .02 + old*.06 + .006*br, -.02*Math.sin(t*.13 + sd), .012*w);
  R3(T, B.chest, .01 - .01*br + old*.04, 0, .01*w);
  const look = look0 != null ? look0 : st.look != null ? st.look : .3*Math.sin(t*.11 + sd*3) + .2*Math.sin(t*.29 + sd);
  R3(T, B.neck, -.02 - old*.05, look*.45, 0); R3(T, B.head, .03*Math.sin(t*.23 + sd), look*.55, .02*Math.sin(t*.19));
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s);
    R3(T, ua, .04 + .02*Math.sin(t*.5 + s + sd) - .03*h.arm, 0, s*(.11 + .02*h.arm)); R3(T, fa, -.16 - .06*h.arm, -s*.2, 0); R3(T, hd, .08, 0, -s*.04);
  }
  if (legs) for (const s of [1, -1]) legIK(h, T, s, s*(D.hipX + h.stance), D.ankY, s*h.fz, 0);
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
/* standing, walking, running: the gait's upper body on the move, the idle's (breathing, a shift of weight, a look
   about, the arms held as asked) as the body comes to a stand. The legs come from the footprints (gaitLegs) */
const IDLE_MIX = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 60, 62];
function loco(h, T, st, dt = 0){
  const G = h.gait;
  gaitPose(h, T, st, st.fac || null, dt);
  // standing still or moving: eased (a body that stops hard settles its arms and back over a few tenths of a second)
  const s0 = 1 - sstep(.1, .9, G.vs/h.scale);
  G.still = G.still == null || !(dt > 0) ? s0 : G.still + (s0 - G.still)*(1 - Math.exp(-(s0 > G.still ? 6 : 10)*dt));
  const still = G.still;
  if (still > 1e-3){
    idle(h, _A, st, false);
    for (const k of IDLE_MIX) T[k] = lerp(T[k], _A[k], still);
    T[61] = (_A[61] + .004)*still;
  } else T[61] = 0;
  if (st.look != null && still < 1){ const k = 1 - still; T[B.neck*3 + 1] += st.look*.45*k; T[B.head*3 + 1] += st.look*.55*k; }
}
const LOCO = new Set(["idle", "move", "stand"]);
const _stand = {};
function standLoco(h, T, st, dt){ Object.assign(_stand, st); _stand.look = 0; loco(h, T, _stand, dt); }
// ---- actions ----
function stand(h, T, st){ idle(h, T, st, true, 0); }
/* a kick, a pass or a first touch (the right foot). Its keyframes are tables made once (a pass's thigh swing is scaled by
   st.amp: the keyframes are linear in it), and it starts from the idle's upper body only: both legs are solved below
   anyway, so the idle's own leg solve (two IKs and the hips' frame each) was work thrown away every pose */
const KF = Object.freeze({
  thighTrap:[[0, 0], [.3, -.32], [.55, -.35], [1, 0]], thighKick:[[0, 0], [.3, .7], [.42, -.75], [.55, -1.2], [.75, -.6], [1, 0]],
  thighPass:[[0, 0], [.3, .45], [.44, -.5], [.6, -.75], [1, 0]],
  kneeTrap:[[0, .1], [.3, .5], [.55, .45], [1, .05]], kneeKick:[[0, .15], [.3, 1.85], [.42, .25], [.55, .1], [.8, .5], [1, .1]],
  kneePass:[[0, .15], [.3, 1.05], [.44, .3], [.6, .2], [1, .1]], rot:[[0, 0], [.2, -.75], [.7, -.75], [1, 0]],
  hipX:[[0, 0], [.35, .03], [.6, .02], [1, 0]], hipYKick:[[0, -.01], [.35, -.07], [.6, -.04], [1, -.005]], hipY:[[0, -.008], [.3, -.03], [.7, -.03], [1, -.008]],
  hipsYawKick:[[0, 0], [.3, .25], [.55, -.25], [1, 0]], hipsRollKick:[[0, 0], [.4, .12], [1, 0]], hipsRoll:[[0, 0], [.3, .05], [.7, .05], [1, 0]],
  pitchKick:[[0, 0], [.25, .55], [.85, .55], [1, 0]], pitchTrap:[[0, 0], [.25, -.2], [.8, -.2], [1, 0]], pitch:[[0, 0], [.25, -.12], [.8, -.12], [1, 0]],
  spineKick:[[0, .05], [.3, .18], [.45, -.08], [.6, -.18], [1, .03]], spine:[[0, .05], [.4, .2], [1, .05]], spineRollKick:[[0, 0], [.42, .15], [1, 0]],
  armKick:[[0, .2], [.3, 1.0], [.6, 1.15], [1, .2]], arm:[[0, .2], [.4, .55], [1, .2]], armBackKick:[[0, .1], [.42, .6], [1, .1]]
});
const _plant = new Float64Array(12);
function kickLike(h, T, st, kind){
  const t = st.t != null ? st.t : Math.min(1, h.at/(kind === "kick" ? .9 : .75)), D = h.D, amp = st.amp || 1, s = -1;   // right foot
  idle(h, T, st, false, 0);
  const big = kind === "kick", tr = kind === "trap";
  const LG = LEG(s), th = LG[0], sh = LG[1], ft = LG[2], to = LG[3];
  const thighX = tr ? kf(t, KF.thighTrap) : big ? kf(t, KF.thighKick) : amp*kf(t, KF.thighPass);
  const knee = tr ? kf(t, KF.kneeTrap) : big ? kf(t, KF.kneeKick) : kf(t, KF.kneePass);
  const rot = big ? 0 : kf(t, KF.rot);
  T[60] = kf(t, KF.hipX); T[61] = big ? kf(t, KF.hipYKick) : kf(t, KF.hipY);
  R3(T, B.hips, 0, big ? kf(t, KF.hipsYawKick) : .1*Math.sin(t*Math.PI), big ? kf(t, KF.hipsRollKick) : kf(t, KF.hipsRoll));
  legIK(h, T, 1, D.hipX + .05, D.ankY, kind === "kick" ? -.08 : -.02, 0);
  // the kicking foot starts and finishes planted beside the other; in between the leg swings freely
  legIK(h, T, -1, -(D.hipX + .02), D.ankY, .0, 0);
  for (let i = 0; i < 4; i++){ const b = LG[i]; _plant[i*3] = T[b*3]; _plant[i*3 + 1] = T[b*3 + 1]; _plant[i*3 + 2] = T[b*3 + 2]; }
  const pitch = big ? kf(t, KF.pitchKick) : tr ? kf(t, KF.pitchTrap) : kf(t, KF.pitch);
  R3(T, th, thighX, rot, big ? -.05 : 0); R3(T, sh, knee); R3(T, ft, pitch); R3(T, to, 0);
  const w = Math.max(1 - sstep(0, .18, t), sstep(.82, 1, t));
  if (w > 0) for (let i = 0; i < 4; i++){ const b = LG[i]; for (let c = 0; c < 3; c++) T[b*3 + c] = lerp(T[b*3 + c], _plant[i*3 + c], w); }
  R3(T, B.spine, big ? kf(t, KF.spineKick) : kf(t, KF.spine), 0, big ? kf(t, KF.spineRollKick) : .06); R3(T, B.chest, .02);
  R3(T, B.neck, .1, 0, 0); R3(T, B.head, .2, 0, 0);
  const ao = big ? kf(t, KF.armKick) : kf(t, KF.arm);
  R3(T, ARM(1)[0], big ? -.5 : -.2, 0, ao); R3(T, ARM(-1)[0], big ? kf(t, KF.armBackKick) : .25, 0, -ao*.7); R3(T, ARM(1)[1], -.4, 0, 0); R3(T, ARM(-1)[1], -.4, 0, 0);
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
  idle(h, T, st, true, 0);
  const per = 6, i = Math.floor(h.at/per) % STRETCHES.length, f = h.at % per;
  const w = h.at < per ? 1 : sstep(0, 1.1, f);
  // held (5 s of every 6): only the stretch being held is worked out; over the second into the next, both, blended
  if (w >= 1){ STRETCHES[i](h, T); return; }
  const a = _A; a.set(T); STRETCHES[(i + STRETCHES.length - 1) % STRETCHES.length](h, a);
  const b = _B; b.set(T); STRETCHES[i](h, b);
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
   is met as near as the arms reach. st.work: busy at it (the barista): one hand wiping in small circles, then the
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
const _keep = new Float64Array(9);
function clipboard(h, T, st){
  idle(h, T, st);
  const t = h.t, write = sstep(.2, .6, Math.sin(t*.35 + h.seed*6));
  R3(T, ARM(1)[0], -.18, 0, .1); R3(T, ARM(1)[1], -1.45, 0, 0); R3(T, ARM(1)[2], 0, 0, 0);      // the board, held in the left hand
  if (write > .01){
    const keep = _keep, arm = ARM(-1);
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) keep[i*3 + c] = T[arm[i]*3 + c];
    armIK(h, T, -1, .03 + .02*Math.sin(t*3), 1.2 + .012*Math.sin(t*5), .3, 1.2, -.2);                // and now and then, a note
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++){ const k = arm[i]*3 + c; T[k] = lerp(keep[i*3 + c], T[k], write); }
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
  stand(h, T, st);
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
    stand(h, T, st);
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
// back, the way a bike is pedalled. The bike's own cranks (props.js) are turned to the same angle
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
  idle:loco, move:loco, stand:standLoco, squat:squatPose, curl:curlPose, plyo:plyoPose, bike:bikePose,
  kick:(h, T, st) => kickLike(h, T, st, "kick"), pass:(h, T, st) => kickLike(h, T, st, "pass"), trap:(h, T, st) => kickLike(h, T, st, "trap"),
  header, tackle, dive, gkready:gkReady, celebrate, stretch, sit:(h, T, st) => sit(h, T, st, false), typing:(h, T, st) => sit(h, T, st, true), counter, clipboard
};
MODES.kick.plant = (h, st, o) => clipPlant(h, st, o, .9); MODES.pass.plant = (h, st, o) => clipPlant(h, st, o, .75); MODES.trap.plant = (h, st, o) => clipPlant(h, st, o, .75);
// the clips that take the body low (a squat, a slide, a dive, a crouch): the only ones the floor pass runs for on Low
// (DESIGN 3.5.9); upright clips keep their feet on the floor by their own legs
for (const k of ["squat", "curl", "plyo", "bike", "header", "tackle", "dive", "gkready", "stretch", "celebrate"]) MODES[k].low = true;
const lowPreset = () => { const P = typeof GFX === "object" && GFX && GFX.P; return !!(P && P.tier === "low"); };
MODES.kick.blend = .1; MODES.pass.blend = .1; MODES.trap.blend = .15; MODES.header.blend = .12; MODES.celebrate.blend = .3; MODES.dive.blend = .06;
function clipPlant(h, st, out, dur){ const t = st.t != null ? st.t : Math.min(1, h.at/dur); out[0] = 1; out[1] = Math.max(1 - sstep(0, .18, t), sstep(.82, 1, t)); return out; }
/* registerMode(name, fn(h, Te, st, dt)): a pose any caller may then ask for by name (WP-K's football and keeper moves).
   fn writes the base pose in Euler; it may carry .blend (seconds into it), .plant(h, st, out) -> out[0], out[1] how
   planted the left and right feet are (0..1: held where they stood), .ground (false: no floor pass; true: always one),
   .low (a clip that takes the body low: its floor pass runs on Low too, where upright clips skip it), and it may set bits
   of h.ev (EV) with h.ev.at, the time inside dt they happened. A name "upper:<g>" is a gesture for st.upper. */
export function registerMode(name, fn, o = {}){
  if (!name || typeof fn !== "function") throw new Error("registerMode needs a name and a pose function");
  if (o.blend != null) fn.blend = o.blend;
  if (o.plant) fn.plant = o.plant;
  if (o.ground != null) fn.ground = o.ground;
  if (o.low != null) fn.low = o.low;
  MODES[name] = fn;
  return fn;
}
// how far apart two quaternion poses are: the largest turn of the hips, spine or a limb's root, or the hips' shift (x2 a metre)
const GAPB = [B.hips, B.spine, B.chest, B.uaL, B.uaR, B.thL, B.thR, B.shL, B.shR];
function poseGap(A, Q){
  let m = 0;
  for (const b of GAPB) m = Math.max(m, qAngle(A, b*4, Q, b*4));
  return Math.max(m, 2*Math.hypot(Q[80] - A[80], Q[81] - A[81], Q[82] - A[82]));
}

/* ---------- inertialisation ---------- */
const _ql = new Float64Array(8), _qc = new Float64Array(4);
// the offset that takes Q's bone i to the drawn pose D's: its rotation vector into out at o (log of D * conj(Q))
function offsetOf(Dp, Q, i, out, o){
  _qc[0] = -Q[i*4]; _qc[1] = -Q[i*4 + 1]; _qc[2] = -Q[i*4 + 2]; _qc[3] = Q[i*4 + 3];
  qMul(Dp, i*4, _qc, 0, _ql, 0); qLog(_ql, 0, out, o);
}
function inertiaStart(h, Q, dur, still = false){
  const I = h.inz, Dp = h.pose, Pp = h.posePrev, dtp = h.dtPrev;
  I.w = 4.74/Math.max(.02, dur); I.t = 0; I.on = true;
  const vel = !still && dtp > 1e-4 && h.posed > 1;
  for (let i = 1; i < 20; i++){
    offsetOf(Dp, Q, i, I.x, i*3);
    if (vel){
      offsetOf(Pp, Q, i, _ql, 4);
      let vx = (I.x[i*3] - _ql[4])/dtp, vy = (I.x[i*3 + 1] - _ql[5])/dtp, vz = (I.x[i*3 + 2] - _ql[6])/dtp;
      const vl = Math.hypot(vx, vy, vz); if (vl > 20){ vx *= 20/vl; vy *= 20/vl; vz *= 20/vl; }
      I.v[i*3] = vx; I.v[i*3 + 1] = vy; I.v[i*3 + 2] = vz;
    } else I.v[i*3] = I.v[i*3 + 1] = I.v[i*3 + 2] = 0;
  }
  for (let c = 0; c < 3; c++){
    I.x[60 + c] = Dp[80 + c] - Q[80 + c];
    I.v[60 + c] = vel ? clamp(((Dp[80 + c] - Q[80 + c]) - (Pp[80 + c] - Q[80 + c]))/dtp, -4, 4) : 0;
  }
}
function inertiaApply(h, Q, dt){
  const I = h.inz; if (!I.on) return 0;
  I.t += dt;
  const w = I.w, t = I.t, e = Math.exp(-w*t), a = (1 + w*t)*e, b = t*e;
  if (a < 2e-3){ I.on = false; return 0; }
  for (let i = 1; i < 20; i++){
    const o = i*3, x = I.x[o]*a + I.v[o]*b, y = I.x[o + 1]*a + I.v[o + 1]*b, z = I.x[o + 2]*a + I.v[o + 2]*b;
    if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-7) continue;
    qExp(x, y, z, _ql, 0); qMul(_ql, 0, Q, i*4, Q, i*4);
  }
  for (let c = 0; c < 3; c++) Q[80 + c] += I.x[60 + c]*a + I.v[60 + c]*b;
  return a;
}

/* ---------- the upper-body layer: a gesture over whatever the legs do (st.upper = {g, dir, w}) ----------
   The gesture is a registered mode "upper:<g>"; it is laid over the base pose bone by bone, the spine 0.3 of the way,
   the chest 0.7, the neck, head and arms all the way, times w. It comes on over 0.18 s and goes over 0.25 s. */
const UPMASK = [[B.spine, .3], [B.chest, .7], [B.neck, 1], [B.head, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1]];
const _up4 = new Float64Array(4);
function upperLayer(h, Q, st, dt){
  const U = h.upper, want = st.upper && MODES["upper:" + st.upper.g] ? st.upper : null;
  if (want){ U.g = want.g; U.st = want; }
  U.w = clamp(U.w + (want ? dt/.18 : -dt/.25), 0, 1);
  if (U.w <= 0 || !U.g) return;
  const w = sstep(0, 1, U.w)*(U.st && U.st.w != null ? U.st.w : 1);
  _B.fill(0); MODES["upper:" + U.g](h, _B, U.st || {}, dt);
  for (const [b, m] of UPMASK){
    qEuler(_up4, 0, _B[b*3], _B[b*3 + 1], _B[b*3 + 2]);
    slerpInto(Q, b*4, _up4, w*m);
  }
}
function slerpInto(Q, o, R, t){
  let ax = Q[o], ay = Q[o + 1], az = Q[o + 2], aw = Q[o + 3], bx = R[0], by = R[1], bz = R[2], bw = R[3];
  let d = ax*bx + ay*by + az*bz + aw*bw;
  if (d < 0){ bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  let k0 = 1 - t, k1 = t;
  if (d < .9995){ const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin((1 - t)*th)/s; k1 = Math.sin(t*th)/s; }
  const x = ax*k0 + bx*k1, y = ay*k0 + by*k1, z = az*k0 + bz*k1, ww = aw*k0 + bw*k1, l = Math.hypot(x, y, z, ww) || 1;
  Q[o] = x/l; Q[o + 1] = y/l; Q[o + 2] = z/l; Q[o + 3] = ww/l;
}

/* ---------- planted feet in clips ----------
   A clip that declares plant channels keeps those feet where they stood when it began (world points), whatever its own
   legs say, in proportion to how planted it says they are: a blend into or out of it never slides them. */
const _pw = [0, 0], _fq = new Float64Array(4);
function drawnAnkles(h, Q, out){
  fkQ(h, Q, _FK);
  const g = h.g, ry = g.rotation.y, c = Math.cos(ry), s = Math.sin(ry), sc = h.scale;
  for (let i = 0; i < 2; i++){
    const ft = LEG(i ? -1 : 1)[2], o = ft*7, x = _FK[o], y = _FK[o + 1], z = _FK[o + 2];
    qRot(_FK, o + 3, 0, 0, 1, _ql, 0);
    const p = out[i] || (out[i] = {});
    p.x = g.position.x + (x*c + z*s)*sc; p.z = g.position.z + (-x*s + z*c)*sc; p.y = g.position.y + y*sc;
    p.yaw = ry + Math.atan2(_ql[0], _ql[2]);
  }
  return out;
}
function plantLegs(h, Q, w){
  const g = h.g, ry = g.rotation.y, c = Math.cos(ry), s = Math.sin(ry), sc = h.scale;
  fkQ(h, Q, _FK);
  for (let i = 0; i < 2; i++){
    if (!(w[i] > 1e-3)) continue;
    const L = h.locks[i]; if (!L) continue;
    const ft = LEG(i ? -1 : 1)[2], o = ft*7;
    const ox = (L.x - g.position.x)/sc, oz = (L.z - g.position.z)/sc;
    const tx = ox*c - oz*s, tz = ox*s + oz*c, ty = (L.y - g.position.y)/sc;
    _fq[0] = _FK[o + 3]; _fq[1] = _FK[o + 4]; _fq[2] = _FK[o + 5]; _fq[3] = _FK[o + 6];
    const toe = Q[LEG(i ? -1 : 1)[3]*4], tw = 2*Math.atan2(toe, Q[LEG(i ? -1 : 1)[3]*4 + 3]);
    solveLeg(h, Q, _FK, i ? -1 : 1, lerp(_FK[o], tx, w[i]), lerp(_FK[o + 1], ty, w[i]), lerp(_FK[o + 2], tz, w[i]), _fq, 0, tw);
  }
}

/* ---------- the pipeline ---------- */
const _st = {mode:"idle"};
const STR = ["t", "look", "arms", "dir", "seat", "desk", "counter", "reach", "amp", "keys", "upper", "root", "intent", "belt", "phase", "shift", "fac", "style", "correct", "armsIn", "blend", "fatigue"];
const FPU = 1, LP = 2, NONE = 0;
export function animateHuman(h, dt, state = "idle", o = null){
  let st = state;
  // your own body, posed where you stand: note where that is (see you())
  // (named after it is made, so asked every time: a body is posed while it is being made)
  const nm = h.g.name;
  if (nm === "me-fp" || nm === "me-tp") noteYou(h);
  if (typeof st === "string"){ _st.mode = st; _st.speed = PRESET[st]; st = _st; for (const k of STR) if (k in _st) delete _st[k]; }
  else if (PRESET[st.mode] != null && st.speed == null){ _st.mode = "move"; for (const k in st) _st[k] = st[k]; _st.speed = PRESET[st.mode]; st = _st; }
  let mode = st.mode || "idle";
  if (PRESET[mode] != null) mode = "move";
  if (!MODES[mode]) mode = "move";
  dt = dt > 0 ? Math.min(dt, .5) : 0;
  const tier = o && o.tier ? o.tier : 0, fam = LOCO.has(mode), fn = MODES[mode];
  h.ev.mask = 0; h.ev.at = 0; h.ev.side = null;
  // a change of mode: what it starts from
  const key = fam ? "loco" : mode;
  if (key !== h.mode){
    const wasLoco = h.mode === "loco";
    if (h.posed){
      if (fam && !wasLoco) gaitPlace(h, drawnAnkles(h, h.pose, h.feetTmp));   // back on its feet from a clip: they stay where they are
      if (!fam && fn.plant) drawnAnkles(h, h.pose, h.locks);
    }
    h.blendNext = h.posed ? (st.blend || fn.blend || -1) : 0;
    h.mode = key; h.at = 0; h.lpSame = false;
  }
  h.at += dt; h.t += dt; h.acc += dt; h.accL += dt;
  if (fam){
    if (h.gait) h.gait.lod = tier;
    const G = gaitStep(h, dt, st);
    h.ev.mask |= G.ev.mask; if (G.ev.side){ h.ev.side = G.ev.side; h.ev.at = G.ev.at; }
  }
  if (ANIM_LOG.trace) traceLog(h);
  if (tier >= 4){ h.hid = true; ANIM.stats.so++; return h.ev; }
  h.sinceF++;
  // what this call does at this tier
  let kind = FPU;
  if (tier === 2 || tier === 3){
    // due every div frames (the longest waiting first when the budget is spent: it stays due), else the leg pass
    const P = typeof GFX === "object" && GFX && GFX.P, div = tier === 2 ? (P && P.midDiv) || 2 : (P && P.farDiv) || 3;
    const due = h.hid || h.sinceF >= div;
    // (the budget counts the T0 and T1 poses still to come this frame: as many as last frame's, and one more in case a
    // body came nearer)
    if (!due || ANIM.fpu + Math.max(0, ANIM.hiLast + 1 - ANIM.hi) >= ANIM.budget) kind = tier === 2 || ((ANIM.frame + h.stag) & 1) === 0 ? LP : NONE;
  }
  if (!h.posed) kind = FPU;
  // a frame the body is not posed at all (T3's other frames): it is drawn where it was last posed, so its planted feet
  // do not ride along with the group the owner has already moved on (the group transform at the leg pass's rate)
  if (kind === NONE){ h.g.matrixAutoUpdate = false; ANIM.stats.so++; return h.ev; }
  if (!h.g.matrixAutoUpdate){ h.g.matrixAutoUpdate = true; h.g.updateMatrix(); }
  if (kind === LP){
    // the leg pass: the hips and the legs onto the footprints over the last full pose's upper body
    if (fam && h.baseOk){
      const G = h.gait, g = h.g, gx = g.position.x, gz = g.position.z, gr = g.rotation.y;
      // standing still on both feet, where the last leg pass changed nothing: this one would give the same legs again
      // (a settled body at mid range between its full poses: the stretchers' and passers' team-mates standing by)
      if (h.lpSame && G.state === "STAND" && !G.feet[0].sw && !G.feet[1].sw && !G.ev.mask && gx === h.lpAt[0] && gz === h.lpAt[1] && gr === h.lpAt[2]){
        h.accL = 0; ANIM.stats.lp++;
        return h.ev;
      }
      const Q = h.tq; Q.set(h.pose); Q[80] = h.base[0]; Q[81] = h.base[1]; Q[82] = h.base[2];
      gaitLegs(h, Q, _FK, h.accL, true); h.accL = 0;
      writeBones(h, Q, LEGW);
      let same = Math.abs(h.pose[80] - Q[80]) + Math.abs(h.pose[81] - Q[81]) + Math.abs(h.pose[82] - Q[82]) < 1e-7;
      for (const b of LEGW) for (let c = 0; c < 4; c++){ const k = b*4 + c; if (same && Math.abs(h.pose[k] - Q[k]) > 1e-7) same = false; h.pose[k] = Q[k]; }
      h.pose[80] = Q[80]; h.pose[81] = Q[81]; h.pose[82] = Q[82];
      h.lpSame = same; h.lpAt[0] = gx; h.lpAt[1] = gz; h.lpAt[2] = gr;
    }
    ANIM.stats.lp++;
    return h.ev;
  }
  // a full pose update
  ANIM.fpu++; ANIM.stats.fpu++; ANIM.byTier[tier]++; if (tier <= 1) ANIM.hi++;
  h.lpSame = false;
  const Te = h.te, Q = h.tq, adt = h.acc;
  Te.fill(0); h.gw = 0;
  fn(h, Te, st, adt);
  eulerToQ(Te, Q);
  h.base[0] = Q[80]; h.base[1] = Q[81]; h.base[2] = Q[82]; h.baseOk = fam;
  // inertialisation: into a new mode (st.blend or the mode's own time, longer the further the body has to go), or a
  // catch-up for a body seen again after it was hidden
  if (h.blendNext){
    const gap = poseGap(h.pose, Q), dur = h.blendNext > 0 ? h.blendNext : gap < .6 ? .2 : clamp(.3 + .28*(gap - 1.1), .3, .8);
    inertiaStart(h, Q, dur);
    h.blendNext = 0;
  } else if (h.hid) inertiaStart(h, Q, .15, true);
  h.hid = false;
  const left = inertiaApply(h, Q, adt);
  if (st.upper || h.upper.w > 0) upperLayer(h, Q, st, adt);
  if (st.shift){ Q[80] += st.shift.x || 0; Q[81] += st.shift.y || 0; Q[82] += st.shift.z || 0; }
  // a body-space correction worked out from this pose (your first-person body keeping its neck below the eye)
  if (st.correct) st.correct(h, Q);
  // the constraints, after all blending
  if (fam){ gaitLegs(h, Q, _FK, h.accL); h.accL = 0; }
  else {
    if (fn.plant){ fn.plant(h, st, _pw); plantLegs(h, Q, _pw); }
    if (fn.ground !== false && (fn.low || fn.ground === true || !lowPreset())) ground(h, Q, _FK, h.gw*(1 - left));
  }
  writeBones(h, Q);
  h.posePrev.set(h.pose); h.pose.set(Q); h.dtPrev = adt; h.acc = 0; h.posed++; h.sinceF = 0;
  return h.ev;
}
// the footfalls of the last call: [{side: 'L' | 'R', t (seconds into it), x, z}]
export function footEvents(h){ return h.gait ? h.gait.falls : []; }
/* animTier(h, tier): the tier to draw a person at, given the one the scheduler handed out (DESIGN 3.5.9 and the
   conflict register: SCHED decides the tier once a frame, by distance on this preset, the camera's frustum and what is
   in the way; this only executes it), and T4 (state only) while the body is not shown at all */
export function animTier(h, tier = 1){
  if (tier === 0) return 0;
  for (let o = h.g; o; o = o.parent) if (!o.visible) return 4;
  if (!h.g.parent) return 4;
  return tier;
}
function traceLog(h){
  const G = h.gait, L = ANIM_LOG.log;
  if (L.length > 20000) L.splice(0, 5000);
  L.push({id:h.id, t:+h.t.toFixed(4), mode:h.mode, ev:h.ev.mask, state:G ? G.state : null, feet:G ? G.feet.map(f => [f.down ? 1 : 0, +f.x.toFixed(4), +f.z.toFixed(4)]) : null});
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
  editor:{age:[21, 38], fem:.4, builds:[["slim", .5], ["average", .4], ["stocky", .1]]},
  // match officials: fit, in a plain kit of their own (clashFree picks its colour against both teams)
  referee:{age:[28, 45], fem:0, builds:[["athletic", .55], ["slim", .3], ["average", .15]]},
  linesman:{age:[27, 46], fem:0, builds:[["athletic", .45], ["slim", .35], ["average", .2]]}
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
    // a keeper's colour of their own, clear of their team's shirts (and of both teams' in a match: x.avoid)
    const c = clashFree(pick([0x2f9e44, 0xf2c230, 0xf07a1a, 0x24262b, 0x7a3fb0, 0x1fa2c4]), x.avoid || [kit[0], kit[1]]), [bc, bs] = pick(BOOTS);
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
  } else if (role === "referee" || role === "linesman"){
    // the officials' kit: one colour from collar to socks (x.kit[0], black by default), dark shorts, black boots, no number
    // (and clear of both teams' shirts when the match's kits are given: x.avoid)
    const c = clashFree(hex(kit[0] && x.kit ? kit[0] : 0x1c1d21), x.avoid || []), dark = mixHex(c, 0x0c0d10, .6);
    outfit = {type:"kit", shirt:c, trim:mixHex(c, 0xffffff, .55), shorts:x.kit && kit[1] ? hex(kit[1]) : 0x16171a, socks:c, sockTrim:dark, number:0, shoes:0x15161a, stripe:0x15161a, sole:0x24262a};
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

/* ---------- kit colours that never clash ----------
   clashFree(colour, avoid) -> colour: colour itself when it is at least 120 apart (RGB, 0..255) from every colour in
   avoid, else the first of the keepers' and officials' usual colours that is, else the corner of the RGB cube that
   stands furthest from them (two colours closer than 120 to the same corner cannot both be near another, so with up to
   seven to avoid there is always one). Colours are numbers or any CSS colour (the clubs' hsl() kits). */
const CLASH_MIN = 120;
const CLASH_PREF = [0x1c1d21, 0xf2d53c, 0x2f9e44, 0xf07a1a, 0x7a3fb0, 0x1fa2c4, 0xe84393, 0xd02b2b, 0x8a8f96, 0xf2f2ee,
  0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x00ffff, 0xff00ff, 0xffff00];
const rgb8 = c => { const v = hex(c) ?? 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export function clashFree(color, avoid = []){
  const av = (avoid || []).filter(c => c != null && c !== false).map(rgb8);
  const far = c => { const p = rgb8(c); let m = Infinity; for (const a of av) m = Math.min(m, Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2])); return m; };
  if (color != null && far(color) >= CLASH_MIN) return hex(color);
  let best = CLASH_PREF[0], bd = -1;
  for (const c of CLASH_PREF){ const d = far(c); if (d >= CLASH_MIN) return c; if (d > bd){ bd = d; best = c; } }
  return best;
}

/* ---------- building bodies before they are needed (DESIGN 3.9.6) ----------
   prebuildHumans(looks, {budgetMs = 3}) -> Promise: the near, far and LOD3 shapes of each look, built in idle slices
   (each slice does at least one stage, and starts another only while one as long as the longest so far still fits in
   budgetMs), so a squad or a stadium's 22 players come in without a hitch. A shape is built in stages (body, arms,
   legs, clothes, head, face, hair, beard, packing), so no slice takes much more than its budget. The shape cache
   outlives the place: a body built once is never built again. Resolves with how many shapes were built; PREBUILD
   holds the last run's slices, the longest one, and the longest single stage (stageMs, stageAt: [job, detail, stage]). */
const idleSlice = fn => typeof requestIdleCallback === "function" ? requestIdleCallback(fn, {timeout:250}) : setTimeout(fn, 16);
// the last run's slices (tests: the longest one, how many there were, the longest stage and where it was)
export const PREBUILD = {slices:0, maxMs:0, built:0, stageMs:0, stageAt:null};
export function prebuildHumans(looks, {budgetMs = 3} = {}){
  const jobs = [];
  for (const l of looks || []) if (l){ const L = normLook(l); jobs.push([L, 1], [L, 0], [L, -1]); }
  let i = 0, built = 0, gen = null, est = 0;
  PREBUILD.slices = 0; PREBUILD.maxMs = 0; PREBUILD.built = 0; PREBUILD.stageMs = 0; PREBUILD.stageAt = null;
  let stage = 0;
  return new Promise(resolve => {
    const slice = () => {
      const t0 = performance.now();
      PREBUILD.slices++;
      let worked = false;
      while (i < jobs.length){
        // (a stage is not started unless one as long as the longest so far still fits in the slice)
        if (worked && performance.now() - t0 + est >= budgetMs) break;
        if (!gen){
          const [L, det] = jobs[i], look = det === 0 ? farLook(L) : L;
          if (SHAPES.has(shapeKey(look, det, false))){ i++; continue; }
          gen = shapeSteps(look, det, false); stage = 0;
        }
        worked = true;
        const s0 = performance.now(), ji = i;
        if (gen.next().done){ gen = null; i++; built++; }
        const ms = performance.now() - s0;
        est = Math.max(est, ms);
        if (ms > PREBUILD.stageMs){ PREBUILD.stageMs = ms; PREBUILD.stageAt = [ji, jobs[ji][1], stage]; }
        stage++;
      }
      PREBUILD.maxMs = Math.max(PREBUILD.maxMs, performance.now() - t0); PREBUILD.built = built;
      if (i >= jobs.length) resolve(built); else idleSlice(slice);
    };
    idleSlice(slice);
  });
}

