/* ============ Training Mode: the category cones ============
   Owner: P3-B (TR-3, Training Mode Phase 3). Contract: BUILD-PLAN P3-B work item 3; TRAINING-SPEC 4 (physical cones
   around the pitch per category, opened through the existing interaction system at sensible distances, at fixed
   places, one scenario at a time).

   A tall cone for each category at the cage's fixed anchors (cage.js CAGE.anchors, one list per category, P3-A),
   each a proximity spot of the world's own interaction system (build.js spot, core/hand.js targeting: the E prompt
   inside 1.6 m, and E opens that category in the hub). While a scenario plays, the other cones say to end or reset it
   first. When the cage is built again (another pitch: event train:cage) the cones and their spots are put at the new
   kind's anchors; the old spots went with the old place (build.js begin), so none is ever doubled. */
import {W, spot, mat} from "../build.js";
import {note} from "../core/hud.js";
import {coneMesh} from "../football/training.js";
import {CAGE} from "./cage.js";
import {CATEGORIES, RUN} from "./runner.js";
import {openHub} from "./hub.js";

// each category's colour (kept materials: a new place never disposes them)
const COLOURS = {setpieces:0xf2c230, attacking:0xe8452c, defending:0x2f7de1, receiving:0x3fbf6a, scenarios:0xa25be0, fullmatch:0xf07a1a, freeplay:0xe8e8e8};
const MATS = {};
const matOf = id => { if (!MATS[id]){ MATS[id] = mat({color:COLOURS[id] || 0xf07a1a, roughness:.6}); MATS[id].userData.keep = true; } return MATS[id]; };
export const CONE_R = 1.6, CONE_SCALE = 3;
const CONES = {list:[], spots:[], kind:null};

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
  for (const c of CATEGORIES){
    for (const a of CAGE.anchors[c.id] || []){
      const m = coneMesh(CONE_SCALE, matOf(c.id));
      m.name = "train-cone-" + c.id;
      m.position.set(a.x, 0, a.z); m.updateMatrix(); m.matrixAutoUpdate = false;
      W.scene.add(m);
      CONES.list.push(m);
      const sp = spot({x:a.x, z:a.z, y:.6, r:CONE_R, near:true, train:true, cat:c.id, label:c.name, hint:"See what you can practise here", run:() => use(c)});
      CONES.spots.push(sp);
    }
  }
  CONES.kind = CAGE.kind;
  return CONES.list.length;
}
export function clearCones(){
  for (const m of CONES.list) if (m.parent) m.parent.remove(m);
  for (const sp of CONES.spots){ const i = W.spots.indexOf(sp); if (i >= 0) W.spots.splice(i, 1); }
  CONES.list.length = 0; CONES.spots.length = 0; CONES.kind = null;
}
export const cones = () => CONES.list.map((m, i) => ({cat:CONES.spots[i] ? CONES.spots[i].cat : null, x:m.position.x, z:m.position.z}));

if (typeof addEventListener === "function"){
  // every build of the cage (the first one too): the cones at the new kind's anchors
  addEventListener("train:cage", () => placeCones());
  addEventListener("train:exit", () => clearCones());
}
if (typeof window !== "undefined") window.__trainCones = {placeCones, clearCones, cones, get spots(){ return CONES.spots.slice(); }, CONE_R};
