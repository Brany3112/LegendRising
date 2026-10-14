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
   to it whole. Leaving Training disposes them all (runner.js, on train:exit, once its scenario has stopped). */
import {onBegin, W} from "../build.js";
import {human, lookFor} from "../human.js";

export const POOL_DRILL = 14;
export const POOL_GROUPS = Object.freeze({me:1, fp:1, A:5, B:6, keeper:1});
// the two training bibs: [shirt, shorts]
export const KITS = Object.freeze({mine:Object.freeze(["#2c66b8", "#ffffff"]), theirs:Object.freeze(["#d8ff3a", "#1c2430"])});

const POOL = {me:null, fp:null, A:[], B:[], keeper:null, used:new Set(), meKey:"", meLook:null, built:false};
const all = () => [POOL.me, POOL.fp, ...POOL.A, ...POOL.B, POOL.keeper].filter(Boolean);
const park = h => { if (h.g.parent) h.g.parent.remove(h.g); h.g.visible = false; h.ast = {mode:"idle"}; };

/* builds whatever is missing (all of it the first time). meLook: your body's look (a human.js look, in my side's bib).
   A different look of yours than last time rebuilds only your two bodies. Returns the number of bodies built */
export function poolBuild(meLook){
  let n = 0;
  const key = JSON.stringify(meLook || null);
  if (POOL.meKey !== key || !POOL.me){
    for (const h of [POOL.me, POOL.fp]) if (h){ POOL.used.delete(h); h.dispose(); }
    POOL.me = human(meLook || {}, {cast:true}); park(POOL.me);
    POOL.fp = human(meLook || {}, {noHead:true, lod:false, track:true}); park(POOL.fp);
    POOL.meKey = key; POOL.meLook = meLook || null; n += 2;
  }
  const kitCols = [...KITS.mine, ...KITS.theirs];
  // fixed seeds: the same faces every time
  while (POOL.A.length < POOL_GROUPS.A){ const i = POOL.A.length, h = human(lookFor("footballer", 9101 + i, {kit:KITS.mine, number:2 + i, sex:"m"}), {cast:true}); park(h); POOL.A.push(h); n++; }
  while (POOL.B.length < POOL_GROUPS.B){ const i = POOL.B.length, h = human(lookFor("footballer", 9201 + i, {kit:KITS.theirs, number:2 + i, sex:"m"}), {cast:true}); park(h); POOL.B.push(h); n++; }
  if (!POOL.keeper){ POOL.keeper = human(lookFor("goalkeeper", 9301, {kit:KITS.theirs, avoid:kitCols, number:1, sex:"m"}), {cast:true}); park(POOL.keeper); n++; }
  POOL.built = true;
  return n;
}
export const poolMeLook = () => POOL.meLook;
export const poolReady = () => POOL.built && all().length === POOL_DRILL;

/* the bodies a scenario needs: {mine: team-mates (0..5), theirs: opponents (0..6), keeper: true|false}, and always
   you and your rig. Returns {me, fp, mine: [], theirs: [], keeper} or null when the pool has not been built or holds
   too few (a setup over the limits) */
export function takeBodies({mine = 0, theirs = 0, keeper = false} = {}){
  if (!poolReady()) return null;
  if (mine > POOL.A.length || theirs > POOL.B.length) return null;
  returnBodies();
  const out = {me:POOL.me, fp:POOL.fp, mine:POOL.A.slice(0, mine), theirs:POOL.B.slice(0, theirs), keeper:keeper ? POOL.keeper : null};
  for (const h of [out.me, out.fp, ...out.mine, ...out.theirs, out.keeper]) if (h){ POOL.used.add(h); h.gen = W.ticks; }
  return out;
}
// every body back: out of the scene, hidden, free for the next scenario
export function returnBodies(){
  for (const h of POOL.used) park(h);
  POOL.used.clear();
}
export function poolStats(){
  return {size:all().length, inUse:POOL.used.size, byKit:{me:POOL.me ? 1 : 0, fp:POOL.fp ? 1 : 0, A:POOL.A.length, B:POOL.B.length, keeper:POOL.keeper ? 1 : 0}};
}
// is this body one of the pool's (tests: every drawn body of a drill is)
export const pooled = h => all().includes(h);
// every body disposed (Training left)
export function poolDispose(){
  for (const h of all()) h.dispose();
  POOL.me = POOL.fp = POOL.keeper = null; POOL.A.length = 0; POOL.B.length = 0; POOL.used.clear(); POOL.meKey = ""; POOL.meLook = null; POOL.built = false;
}

// a new place: the pool's bodies belong to it (human.js would otherwise dispose a body left out of the old scene)
onBegin(() => { for (const h of all()) h.gen = W.ticks; });
