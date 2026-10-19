/* ============ Training Mode: the category cones ============
   Owner: P3-B (TR-3, Training Mode Phase 3). Contract: BUILD-PLAN P3-B work item 3; TRAINING-SPEC 4 (physical cones
   around the pitch per category, opened through the existing interaction system at sensible distances, at fixed
   places, one scenario at a time).

   A tall cone for each category at the cage's fixed anchors (cage.js CAGE.anchors, one list per category, P3-A),
   each a proximity spot of the world's own interaction system (build.js spot, core/hand.js targeting: the E prompt
   inside 1.6 m, and E opens that category in the hub). While a scenario plays, the other cones say to end or reset it
   first. When the cage is built again (another pitch: event train:cage) the cones and their spots are put at the new
   kind's anchors; the old spots went with the old place (build.js begin), so none is ever doubled. */
import {THREE, W, spot, mat} from "../build.js";
import {note} from "../core/hud.js";
import {coneMesh} from "../football/training.js";
import {CAGE} from "./cage.js";
import {CATEGORIES, RUN} from "./runner.js";
import {openHub} from "./hub.js";

// each category's colour: the seven cones are one instanced mesh (one draw call, so the cage stays within its draw-call
// budget on Low, BUILD-PLAN P3-A acceptance), each instance in its category's colour; the geometry is the drills' cone
// (training.js coneMesh) and the material is kept (a new place never disposes it)
const COLOURS = {setpieces:0xf2c230, attacking:0xe8452c, defending:0x2f7de1, receiving:0x3fbf6a, scenarios:0xa25be0, fullmatch:0xf07a1a, freeplay:0xe8e8e8};
let MAT = null;
const matOf = () => { if (!MAT){ MAT = mat({color:0xffffff, roughness:.6}); MAT.userData.keep = true; } return MAT; };
export const CONE_R = 1.6, CONE_SCALE = 3;
const CONES = {mesh:null, at:[], spots:[], kind:null};
const M4 = new THREE.Matrix4(), COL = new THREE.Color();

// what a cone does when you press E at it
function use(cat){
  const c = CATEGORIES.find(x => x.id === cat.id);
  if (RUN.cur && RUN.cur.sc.category !== cat.id){ note("End or reset this one first."); return; }
  openHub(c ? c.id : null);
}
// the cones out at the cage's anchors now (any old ones taken away first)
export function placeCones(){
  clearCones();
  if (!CAGE || !CAGE.anchors || !W.scene) return 0;
  for (const c of CATEGORIES) for (const a of CAGE.anchors[c.id] || []) CONES.at.push({cat:c, x:a.x, z:a.z});
  if (!CONES.at.length) return 0;
  const g = coneMesh(1).geometry, m = new THREE.InstancedMesh(g, matOf(), CONES.at.length);
  m.name = "train-cones"; m.userData.keep = true; m.userData.noMerge = true; m.castShadow = false;
  CONES.at.forEach((p, i) => {
    M4.makeScale(CONE_SCALE, CONE_SCALE, CONE_SCALE).setPosition(p.x, 0, p.z); m.setMatrixAt(i, M4);
    m.setColorAt(i, COL.setHex(COLOURS[p.cat.id] || 0xf07a1a));
    const sp = spot({x:p.x, z:p.z, y:.6, r:CONE_R, near:true, train:true, cat:p.cat.id, label:p.cat.name, hint:"See what you can practise here", run:() => use(p.cat)});
    CONES.spots.push(sp);
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere(); m.matrixAutoUpdate = false; m.updateMatrix();
  W.scene.add(m);
  CONES.mesh = m; CONES.kind = CAGE.kind;
  return CONES.at.length;
}
export function clearCones(){
  // (the instance buffers are this mesh's own: freed with it; the geometry and the material are shared and kept)
  if (CONES.mesh){ if (CONES.mesh.parent) CONES.mesh.parent.remove(CONES.mesh); CONES.mesh.dispose(); CONES.mesh = null; }
  for (const sp of CONES.spots){ const i = W.spots.indexOf(sp); if (i >= 0) W.spots.splice(i, 1); }
  CONES.at.length = 0; CONES.spots.length = 0; CONES.kind = null;
}
export const cones = () => CONES.at.map(p => ({cat:p.cat.id, x:p.x, z:p.z}));

if (typeof addEventListener === "function"){
  // every build of the cage (the first one too): the cones at the new kind's anchors
  addEventListener("train:cage", () => placeCones());
  addEventListener("train:exit", () => clearCones());
}
if (typeof window !== "undefined") window.__trainCones = {placeCones, clearCones, cones, get spots(){ return CONES.spots.slice(); }, CONE_R};
