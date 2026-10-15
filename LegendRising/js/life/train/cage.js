/* ============ Training Mode: the cage ============
   Owner: P3-A (Training Mode, Phase 3: sandbox world and cages). Contract: BUILD-PLAN Phase 3 "Contracts (P3-A stubs
   them)", cage.js (cageEnter, CAGE, the train:cage event); TRAINING-SPEC 0 and 4 (cage pitches, not stadiums: Full
   105 x 68, Half or One goal, fenced so the ball comes back off it; the same world units and pitch geometry as a
   match; a low-poly cage fence).

   The zone 'cage' (core/modes.js registerZone): a real pitch cut to the kind's area (cagespec.js cagePitch, the spec the
   ball, the rules and the runner use), drawn from the kind's draw spec (pitchmesh.js buildPitchMesh with o.draw: the
   whole pitch's markings clipped into the area, flags only at the real corners, the grass to the fence), the fence and
   its roof as one mesh with the posts and rails in the place's batches (props.js wireCage), and plain ground outside
   it. No life NPCs, no coach, no merge polling of its own, no career anything. The sky is the stadium's (its fog for
   a whole pitch in view, and the shadow box round the cage).

   CAGE = {kind, spec, drawSpec, bounds, anchors: {category: [{x, z, face}]}, goalEnds, fence, pitch}: what is built now
   (world coordinates for bounds and anchors). After every build the window gets the event 'train:cage' with
   {kind}; cones.js (P3-B) puts its cones at the new anchors when it hears it.
   cageEnter(kind) -> a promise of CAGE: the screen goes black, the cage of that kind is built in place of this one
   (the zone entered again: its meshes, colliders and spots are disposed with the old scene first), and the screen
   comes back after two drawn frames. */
import {W, box, finishBatches} from "../build.js";
import {wireCage} from "../props.js";
import {registerZone, revealAfterFrames, cancelReveal} from "../core/modes.js";
import {RT, FADE} from "../core/state.js";
import {buildPitchMesh} from "../football/pitchmesh.js";
import {cagePitch, cageDraw, cageAnchors, cageSpawn, cageWorldBox, cageKind, CAGES} from "../football/cagespec.js";
import {enterZone} from "../world.js";

export const CAGE = {kind:null, spec:null, drawSpec:null, bounds:null, anchors:{}, goalEnds:[], fence:null, pitch:null};

function buildCage(ctx, opts){
  const kind = cageKind(opts && opts.kind);
  const spec = cagePitch(kind), draw = cageDraw(kind), B = cageWorldBox(kind);
  // the walker's world ends at the fence (its solids); the bounds are the fence's box and a little
  W.bounds = {x0:B.x0 - 2, x1:B.x1 + 2, z0:B.z0 - 2, z1:B.z1 + 2};
  // the ground everything stands on, a little under the grass, out to the fog
  box(-320, -.3, -320, 320, -.03, 320, 0xffffff, {tex:"grass", ao:false, jit:0});
  const pitch = buildPitchMesh(spec, {tier:2, worn:.35, stripes:12, cones:false, draw});
  // nothing here is merged into atlas pages: the cage is a handful of meshes drawn as they are (no merge polling)
  W.noMerge = true;
  const fence = wireCage(B.x0, B.z0, B.x1, B.z1, B.h);
  finishBatches();
  const SKY = RT.SKY;
  if (SKY && SKY.setContext) SKY.setContext("stadium", {box:{x0:B.x0 - 1, x1:B.x1 + 1, y0:0, y1:B.h, z0:B.z0 - 1, z1:B.z1 + 1}});
  Object.assign(CAGE, {kind, spec, drawSpec:draw, bounds:{x0:B.x0, x1:B.x1, z0:B.z0, z1:B.z1, h:B.h}, anchors:cageAnchors(kind),
    goalEnds:spec.area.ends.slice(), fence, pitch, name:CAGES[kind].name});
  // after the build: whoever places things by the cage (cones.js) does it now, before the place is warmed and drawn
  try { window.dispatchEvent(new CustomEvent("train:cage", {detail:{kind}})); } catch(e){ console.error(e); }
  const sp = cageSpawn(kind);
  // the warm-up (world.js enterZone warms from opts.cam after the build): from high over the +Z side, the whole cage in
  // view, so every mesh of it is on the GPU before the reveal whichever way you then turn (you come in facing the
  // cones, with the goals off to the sides)
  if (opts && !opts.cam){
    const cx = (B.x0 + B.x1)/2, cz = (B.z0 + B.z1)/2, far = Math.max(B.x1 - B.x0, B.z1 - B.z0);
    opts.cam = {pos:[cx, 0.35*far, B.z1 + 0.6*far], look:[cx, 0, cz]};
  }
  return {bus:sp, centre:{x:spec.frame.cx, y:0, z:spec.frame.cz, yaw:0}};
}

registerZone("cage", {
  build:(ctx, opts) => buildCage(ctx, opts || {}),
  leave(){
    W.noMerge = false;
    const SKY = RT.SKY;
    if (SKY && SKY.setContext) SKY.setContext("life");
    Object.assign(CAGE, {kind:null, spec:null, drawSpec:null, bounds:null, anchors:{}, goalEnds:[], fence:null, pitch:null});
  }
});

// the cage of another kind, under a fade (the one case where the spec allows rebuilding the place: a pitch change).
// Leaving Training while it is switching (train:exit) gives the switch up: nothing more is built, the cover is lifted
// at once and the promise resolves to null
let SWITCH = null;
export function cageEnter(kind){
  const k = cageKind(kind), o = document.getElementById("lifeFade");
  if (SWITCH) SWITCH.cancel();
  const sw = SWITCH = {off:false, reveal:null, cancel:null};
  return new Promise(res => {
    const done = v => { if (SWITCH === sw) SWITCH = null; res(v); };
    sw.cancel = () => {
      if (sw.off) return;
      sw.off = true;
      if (sw.reveal) cancelReveal(sw.reveal);
      if (o){ o.style.transition = "none"; o.style.opacity = "0"; }
      FADE.v = 0;
      done(null);
    };
    FADE.boot = false;
    if (o){ o.style.transition = "opacity 250ms ease"; o.style.opacity = "1"; }
    FADE.v = 1;
    setTimeout(() => {
      if (sw.off) return;
      try { enterZone("cage", "bus", {kind:k}); } catch(e){ console.error(e); }
      if (sw.off) return;
      sw.reveal = revealAfterFrames(2);
      sw.reveal.then(() => {
        if (sw.off) return;
        if (o){ o.style.transition = "opacity 300ms ease"; o.style.opacity = "0"; }
        FADE.v = 0;
        done(CAGE);
      });
    }, 280);
  });
}
// a switch still under way when Training is left
export const cageSwitching = () => !!SWITCH;
if (typeof addEventListener === "function") addEventListener("train:exit", () => { if (SWITCH) SWITCH.cancel(); });
