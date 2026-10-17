/* ============ Training Mode: the body pool ============
   Owner: P3-B (TR-3, Training Mode Phase 3). Contract: BUILD-PLAN Phase 3 "Contracts (P3-B stubs them)", pool.js
   (takeBodies, returnBodies, poolStats, POOL_DRILL) and P3-B work item 5; TRAINING-SPEC 0 (up to 6 against 6 plus an
   AI keeper, G0 decision h: me counted in my side's 6) and 8 (no rebuilds on reset, nothing accumulating). perf-7.

   Every body a drill can need is built once, when Training is entered (under its entry fade), and never again while
   it lasts: a scenario takes the bodies it needs and gives them back when it stops or starts again, so human() is
   never called during play. A body's kit is baked into it when it is built (human.js: the colours are a vertex
   attribute, the number its own mesh), so the pool is grouped by kit and a body keeps its kit for good:
     me      1  you, in your own look (sandbox.js trainLook) and my side's training bib
     fp      1  the rig in your eyes (view.js makeFP: no head)
     A       5  my side's team-mates, in my side's bib
     B       6  the other side, in theirs
     keeper  1  the AI keeper, in colours clear of both bibs
   POOL_DRILL = 14 in all. Training's own walking body (core/me.js, me-fp and me-tp) is not the pool's, so in Training
   bodies().length = poolStats().size + 2, whatever plays.
   A body not in use is out of the scene. human.js disposes a tracked body that is in no scene once a new place has
   been built, so on every new place (onBegin) the pool's bodies are marked as of the new place; they are given back
   to it whole. Leaving Training disposes them all (runner.js, on train:exit, once its scenario has stopped).

   P4-B (Training Mode Phase 4, BUILD-PLAN P4-B work item 4; TRAINING-SPEC 4, resets restore animations; perf-7): a
   body's animation state is its own data (human.js: the mode and clip, the upper-body layer, the inertialisation and
   leg blend buffers, the IK locks, the gait clock, phase and feet). The state each body has the moment it is built is
   kept (FRESH), and every body a scenario takes is put back to it, so a restart or a new scenario starts every pooled
   body exactly as it was built, nothing carried over from the last go, and nothing is built. bodyData(h) is that
   state as plain data (the runner's digest hashes it).

   P5-A (Training Mode Phase 5): replaceMe(look), your two bodies built again for a new height, under the fade.

   P8-A (Training Mode Phase 8, BUILD-PLAN P8-A "The pool for 11 v 11"; TRAINING-SPEC 0 and 5): a Full Match needs a body
   for every agent that is not 'off' (22 players, the referee and his 2 assistants), one for each substitute, and the rig
   in your eyes. matchBodies(ms, myTeam) grows the pool to that (poolEnsure: only what is missing is built, the drill
   bodies are used first) under the entry's cover, and hands the view its bodyOf(agent): you; my side's outfield players
   in my bib (A); theirs in theirs (B); a keeper's kit for each side (KA mine, the drill keeper and KB theirs); the
   officials in theirs (OFF). poolTrim() takes it back to the 14 drill bodies (Return to Hub, under the fade). */
import {onBegin, W} from "../build.js";
import {human, lookFor} from "../human.js";
import {FADE} from "../core/state.js";
import {revealAfterFrames} from "../core/modes.js";

export const POOL_DRILL = 14;
export const POOL_GROUPS = Object.freeze({me:1, fp:1, A:5, B:6, keeper:1});
// the two training bibs: [shirt, shorts]
export const KITS = Object.freeze({mine:Object.freeze(["#2c66b8", "#ffffff"]), theirs:Object.freeze(["#d8ff3a", "#1c2430"])});

const POOL = {me:null, fp:null, A:[], B:[], keeper:null, KA:[], KB:[], OFF:[], used:new Set(), meKey:"", meLook:null, built:false};

/* ---------- a body's own state, as built ----------
   What is a body's own data: everything on the human() record but its meshes, bones and look (made once and kept),
   its functions, and what the place or the pool set (gen, ast). Typed arrays, arrays and plain objects are data; any
   other object (three.js) is a reference that stays as it is */
const KEEP = new Set(["g", "look", "D", "bones", "skel", "near", "far", "lod3m", "num", "dispose", "rest", "restA", "id", "isHuman", "gen", "scale", "noHead", "ast"]);
const FRESH = new WeakMap();
const isData = v => v === null || typeof v !== "object" || ArrayBuffer.isView(v) || Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null;
function dataOf(v){
  if (v === null || typeof v !== "object") return typeof v === "function" ? undefined : v;
  if (ArrayBuffer.isView(v)) return v.slice();
  if (Array.isArray(v)) return v.map(x => { const c = dataOf(x); return c === undefined ? null : c; });
  if (!isData(v)) return v;
  const o = {};
  for (const k of Object.keys(v)){ const c = dataOf(v[k]); if (c !== undefined) o[k] = c; }
  return o;
}
// the body's own data now, a deep copy (references to three.js objects kept as references)
function snapshot(h){
  const o = {};
  for (const k of Object.keys(h)){ if (KEEP.has(k)) continue; const c = dataOf(h[k]); if (c !== undefined) o[k] = c; }
  return o;
}
// put a plain object (or array) back to a snapshot in place: typed arrays filled, what is not in it taken away
function restoreInto(t, s, top = false){
  for (const k of Object.keys(t)) if (!(top && KEEP.has(k)) && !(k in s) && isData(t[k]) && typeof t[k] !== "function") delete t[k];
  for (const k of Object.keys(s)){
    const v = s[k], cur = t[k];
    if (ArrayBuffer.isView(v) && ArrayBuffer.isView(cur) && cur.length === v.length && cur.constructor === v.constructor) cur.set(v);
    else if (v && typeof v === "object" && !ArrayBuffer.isView(v) && isData(v) && cur && typeof cur === "object" && isData(cur) && !ArrayBuffer.isView(cur) && Array.isArray(v) === Array.isArray(cur)){
      if (Array.isArray(cur)) cur.length = v.length;
      restoreInto(cur, v);
    }
    else t[k] = dataOf(v);
  }
}
function keepFresh(h){ FRESH.set(h, snapshot(h)); return h; }
// a pooled body back to the state it was built in (its meshes and bones untouched: the next pose rewrites them)
export function bodyFresh(h){
  const s = FRESH.get(h); if (!s) return false;
  restoreInto(h, s, true);
  // the meshes shown as the LOD level now stands (back to the built one, 1: full detail): human.js only switches them
  // when the level it works out differs from h.lod, so a body last shown far off would otherwise keep its far mesh
  // close up
  const lv = h.lod;
  if (h.near) h.near.visible = lv === 1;
  if (h.far) h.far.visible = lv === 0;
  if (h.lod3m) h.lod3m.visible = lv === -1;
  if (h.num) h.num.visible = lv === 1;
  return true;
}
// a body's own animation state as plain data (tests, the runner's digest): typed arrays as arrays, references as a tag
export function bodyData(h){
  const plain = v => {
    if (v === null || typeof v !== "object") return typeof v === "number" ? (Number.isFinite(v) ? Math.round(v*1e6)/1e6 : String(v)) : typeof v === "function" ? undefined : v;
    if (ArrayBuffer.isView(v)) return Array.from(v, x => Number.isFinite(x) ? Math.round(x*1e6)/1e6 : String(x));
    if (Array.isArray(v)) return v.map(x => { const c = plain(x); return c === undefined ? null : c; });
    if (!isData(v)) return "#ref";
    const o = {}; for (const k of Object.keys(v).sort()){ const c = plain(v[k]); if (c !== undefined) o[k] = c; } return o;
  };
  const o = {};
  for (const k of Object.keys(h).sort()){ if (KEEP.has(k)) continue; const c = plain(h[k]); if (c !== undefined) o[k] = c; }
  return o;
}
const all = () => [POOL.me, POOL.fp, ...POOL.A, ...POOL.B, POOL.keeper, ...POOL.KA, ...POOL.KB, ...POOL.OFF].filter(Boolean);
const park = h => { if (h.g.parent) h.g.parent.remove(h.g); h.g.visible = false; h.ast = {mode:"idle"}; };

/* builds whatever is missing (all of it the first time). meLook: your body's look (a human.js look, in my side's bib).
   A different look of yours than last time rebuilds only your two bodies. Returns the number of bodies built */
export function poolBuild(meLook){
  let n = 0;
  const key = JSON.stringify(meLook || null);
  if (POOL.meKey !== key || !POOL.me){
    for (const h of [POOL.me, POOL.fp]) if (h){ POOL.used.delete(h); h.dispose(); }
    POOL.me = keepFresh(human(meLook || {}, {cast:true})); park(POOL.me);
    POOL.fp = keepFresh(human(meLook || {}, {noHead:true, lod:false, track:true})); park(POOL.fp);
    POOL.meKey = key; POOL.meLook = meLook || null; n += 2;
  }
  const kitCols = [...KITS.mine, ...KITS.theirs];
  // fixed seeds: the same faces every time
  while (POOL.A.length < POOL_GROUPS.A){ const i = POOL.A.length, h = keepFresh(human(lookFor("footballer", 9101 + i, {kit:KITS.mine, number:2 + i, sex:"m"}), {cast:true})); park(h); POOL.A.push(h); n++; }
  while (POOL.B.length < POOL_GROUPS.B){ const i = POOL.B.length, h = keepFresh(human(lookFor("footballer", 9201 + i, {kit:KITS.theirs, number:2 + i, sex:"m"}), {cast:true})); park(h); POOL.B.push(h); n++; }
  if (!POOL.keeper){ POOL.keeper = keepFresh(human(lookFor("goalkeeper", 9301, {kit:KITS.theirs, avoid:kitCols, number:1, sex:"m"}), {cast:true})); park(POOL.keeper); n++; }
  POOL.built = true;
  return n;
}
export const poolMeLook = () => POOL.meLook;

/* (P5-A, Training Mode Phase 5, BUILD-PLAN P5-A work item 4 and the Phase 5 contract "pool.js replaceMe"; TRAINING-SPEC
   4, the admin panel's height through the whole-body scale) your two pooled bodies (you, and the rig in your eyes) built
   again from a new look, under the fade: the black cover is put up at once, before the build, and lifted two drawn
   frames after it, so the frame that builds them (18 to 30 ms a body, perf.md) is never seen. A body's height is baked
   into it when it is built (human.js scale), so a new height needs new bodies; nothing else of the pool changes, and the
   old two are disposed. Returns the number of bodies built (0 when the look is the one they already have, or when the
   pool is not built). The caller takes them again (runner.js restart and play take every body afresh). */
export function replaceMe(look){
  if (!POOL.built) return 0;
  if (JSON.stringify(look || null) === POOL.meKey && POOL.me) return 0;
  const o = typeof document !== "undefined" ? document.getElementById("lifeFade") : null;
  // (already covered, by a pitch change's fade or the entry's: that cover is its owner's to lift)
  const covered = !o || FADE.v >= 1 || o.style.opacity === "1";
  const reveal = covered ? null : revealAfterFrames(2);
  const n = poolBuild(look);
  if (reveal) reveal.then(() => { if (FADE.boot) return; o.style.transition = "opacity 200ms ease"; o.style.opacity = "0"; FADE.v = 0; });
  return n;
}
// (the drill's groups whole: a pool grown for a Full Match is ready for a drill too, which takes the first of each)
export const poolReady = () => POOL.built && !!POOL.me && !!POOL.fp && !!POOL.keeper && POOL.A.length >= POOL_GROUPS.A && POOL.B.length >= POOL_GROUPS.B;

/* the bodies a scenario needs: {mine: team-mates (0..5), theirs: opponents (0..6), keeper: true|false}, and always
   you and your rig, each put back to the state it was built in. Returns {me, fp, mine: [], theirs: [], keeper} or null
   when the pool has not been built or holds too few (a setup over the limits) */
export function takeBodies({mine = 0, theirs = 0, keeper = false} = {}){
  if (!poolReady()) return null;
  if (mine > POOL.A.length || theirs > POOL.B.length) return null;
  returnBodies();
  const out = {me:POOL.me, fp:POOL.fp, mine:POOL.A.slice(0, mine), theirs:POOL.B.slice(0, theirs), keeper:keeper ? POOL.keeper : null};
  for (const h of [out.me, out.fp, ...out.mine, ...out.theirs, out.keeper]) if (h){ bodyFresh(h); POOL.used.add(h); h.gen = W.ticks; }
  return out;
}
// every body back: out of the scene, hidden, free for the next scenario
export function returnBodies(){
  for (const h of POOL.used) park(h);
  POOL.used.clear();
}
export function poolStats(){
  return {size:all().length, inUse:POOL.used.size, byKit:{me:POOL.me ? 1 : 0, fp:POOL.fp ? 1 : 0, A:POOL.A.length, B:POOL.B.length, keeper:POOL.keeper ? 1 : 0,
    KA:POOL.KA.length, KB:POOL.KB.length, OFF:POOL.OFF.length}};
}

/* ---------- Full Match (P8-A) ---------- */
const OFF_N = 3;
const kitCols = () => [...KITS.mine, ...KITS.theirs];
// builds what is missing for counts {A, B, KA, KB, OFF} (KB: their keepers beyond the drill keeper). Returns the number built
export function poolEnsure(n){
  let k = 0;
  const avoid = kitCols();
  while (POOL.A.length < (n.A || 0)){ const i = POOL.A.length; const h = keepFresh(human(lookFor("footballer", 9101 + i, {kit:KITS.mine, number:2 + i, sex:"m"}), {cast:true})); park(h); POOL.A.push(h); k++; }
  while (POOL.B.length < (n.B || 0)){ const i = POOL.B.length; const h = keepFresh(human(lookFor("footballer", 9201 + i, {kit:KITS.theirs, number:2 + i, sex:"m"}), {cast:true})); park(h); POOL.B.push(h); k++; }
  while (POOL.KA.length < (n.KA || 0)){ const i = POOL.KA.length; const h = keepFresh(human(lookFor("goalkeeper", 9311 + i, {kit:KITS.mine, avoid, number:1 + i*12, sex:"m"}), {cast:true})); park(h); POOL.KA.push(h); k++; }
  while (POOL.KB.length < (n.KB || 0)){ const i = POOL.KB.length; const h = keepFresh(human(lookFor("goalkeeper", 9321 + i, {kit:KITS.theirs, avoid, number:13 + i, sex:"m"}), {cast:true})); park(h); POOL.KB.push(h); k++; }
  while (POOL.OFF.length < (n.OFF || 0)){ const i = POOL.OFF.length; const h = keepFresh(human(i === 0 ? lookFor("referee", 22, {avoid, sex:"m"}) : lookFor("linesman", 40 + i, {avoid, sex:"m"}), {cast:true})); park(h); POOL.OFF.push(h); k++; }
  return k;
}
/* the bodies of a match: what it needs counted from it (everyone on the pitch, both benches, the officials), the pool
   grown to that, every body put back to its built state. myTeam: my side (my bib). Returns {bodyOf(agent), fp}, or null
   when the pool has not been built (the view then builds its own) */
export function matchBodies(ms, myTeam = 0){
  if (!poolReady()) return null;
  const n = {A:0, B:0, KA:0, KB:0, OFF:0};
  for (const a of ms.agents){
    if (a.role === "off") continue;
    if (a.team < 0){ n.OFF++; continue; }
    if (a.isMe) continue;
    if (a.isGK) a.team === myTeam ? n.KA++ : n.KB++;
    else a.team === myTeam ? n.A++ : n.B++;
  }
  for (const t of [0, 1]) for (const p of ms.bench[t]){
    if (p.isMe) continue;
    if (p.isGK) t === myTeam ? n.KA++ : n.KB++;
    else t === myTeam ? n.A++ : n.B++;
  }
  // (their first keeper is the drill keeper)
  poolEnsure({A:n.A, B:n.B, KA:n.KA, KB:Math.max(0, n.KB - 1), OFF:Math.min(OFF_N, n.OFF)});
  returnBodies();
  const free = {A:POOL.A.slice(), B:POOL.B.slice(), KA:POOL.KA.slice(), KB:[POOL.keeper, ...POOL.KB], OFF:POOL.OFF.slice()};
  const take = h => { if (!h) return null; bodyFresh(h); POOL.used.add(h); h.gen = W.ticks; return h; };
  const byId = new Map();
  take(POOL.me); take(POOL.fp);
  const bodyOf = a => {
    if (byId.has(a.id)) return byId.get(a.id);
    let h = null;
    if (a.isMe) h = POOL.me;
    else if (a.team < 0) h = take(free.OFF.shift());
    else if (a.isGK) h = take((a.team === myTeam ? free.KA : free.KB).shift());
    else h = take((a.team === myTeam ? free.A : free.B).shift());
    byId.set(a.id, h);
    return h;
  };
  return {bodyOf, fp:POOL.fp};
}
// back to the drill's 14 (Return to Hub from a Full Match, under the fade): the match's extra bodies disposed
export function poolTrim(){
  returnBodies();
  const extra = [...POOL.A.splice(POOL_GROUPS.A), ...POOL.B.splice(POOL_GROUPS.B), ...POOL.KA.splice(0), ...POOL.KB.splice(0), ...POOL.OFF.splice(0)];
  for (const h of extra) h.dispose();
  return extra.length;
}
// is this body one of the pool's (tests: every drawn body of a drill is)
export const pooled = h => all().includes(h);
// every body disposed (Training left)
export function poolDispose(){
  for (const h of all()) h.dispose();
  POOL.me = POOL.fp = POOL.keeper = null; POOL.A.length = 0; POOL.B.length = 0; POOL.KA.length = 0; POOL.KB.length = 0; POOL.OFF.length = 0; POOL.used.clear(); POOL.meKey = ""; POOL.meLook = null; POOL.built = false;
}

// a new place: the pool's bodies belong to it (human.js would otherwise dispose a body left out of the old scene)
onBegin(() => { for (const h of all()) h.gen = W.ticks; });
