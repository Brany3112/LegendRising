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
import {enterTraining as enterSandbox, exitTraining, inTraining} from "./sandbox.js";
import "./cage.js";
import "./runner.js";
import {poolBuild, KITS} from "./pool.js";
import {openHub} from "./hub.js";
import "./cones.js";
import "./thud.js";
import "./config.js";
import "./configui.js";
import "./attredit.js";
import "./teams.js";
import "./presets.js";
import "./presetui.js";
import "./quick.js";
import "./freeplay.js";
import "./keys.js";
import "./admin.js";
import "./feeder.js";
import "./receive.js";
import "./scen-receive.js";
import "./scen-team.js";
import "./scen-attack.js";
import "./scen-defend.js";
import "./scen-match.js";
import "./setpiece.js";
import "./scen-corner.js";
import "./scen-throw.js";
import "./scen-penalty.js";
import "./scen-freekick.js";
import "./fkplace.js";
import {bodyLook} from "../look.js";
import {sandboxLook, dressOpts} from "../core/me.js";

// your body in a drill: your own look (the held career's, or the default one) in my side's training bib, dressed as the
// body you walk the cage in (core/me.js meBuild: the held career's seed from its cid, its age and its number), so it is
// the same person in a drill, in the cage and in the career (TRAINING-SPEC 7)
export function meBodyLook(){
  const t = sandboxLook(), L = t.look;
  if (L && L.outfit) return L;
  const o = Object.assign({number:9, seed:7}, dressOpts(t.dress), {kit:KITS.mine});
  try { return bodyLook(L || {}, "training", o); } catch(e){ console.error(e); return L || {}; }
}
if (typeof addEventListener === "function") addEventListener("train:enter", () => { try { poolBuild(meBodyLook()); } catch(e){ console.error(e); } });

// into Training: the sandbox in a cage of this kind ('full', 'half' or 'onegoal'), then the hub
export async function enterTraining(o = {}){
  await enterSandbox(o);
  openHub();
}
export {exitTraining, inTraining};
