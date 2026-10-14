/* ============ Training Mode: the entry module ============
   Owner: P3-B creates it in Phase 3 (TR-3); the integrator owns it from Phase 4. Contract: BUILD-PLAN section 0 "How
   Training modules are loaded" and P3-B work item 11; TRAINING-SPEC 4 (a Training button that opens the training
   environment without starting or touching a career).

   The one way into Training: the title's Training button (js/ui/main.js A.training) loads this module with a dynamic
   import, so a career never loads any Training code. It imports every js/life/train/ module (each runs its own
   registrations and listeners on import) and gives the title enterTraining: the sandbox and its cage (sandbox.js and
   cage.js, P3-A), then the hub. The body pool is built when Training is entered, under its entry fade (train:enter),
   so no body is ever built while you play. qa/unit/trainentry.mjs fails if a module of js/life/train/ is not
   imported here. */
import {enterTraining as enterSandbox, exitTraining, inTraining, trainLook} from "./sandbox.js";
import "./cage.js";
import "./runner.js";
import {poolBuild, KITS} from "./pool.js";
import {openHub} from "./hub.js";
import "./cones.js";
import "./thud.js";
import {bodyLook} from "../look.js";

// your body in a drill: your own look (the held career's, or the default one) in my side's training bib
export function meBodyLook(){
  const L = trainLook();
  if (L && L.outfit) return L;
  try { return bodyLook(L || {}, "training", {kit:KITS.mine, number:9, seed:7}); } catch(e){ console.error(e); return L || {}; }
}
if (typeof addEventListener === "function") addEventListener("train:enter", () => { try { poolBuild(meBodyLook()); } catch(e){ console.error(e); } });

// into Training: the sandbox in a cage of this kind ('full', 'half' or 'onegoal'), then the hub
export async function enterTraining(o = {}){
  await enterSandbox(o);
  openHub();
}
export {exitTraining, inTraining};
