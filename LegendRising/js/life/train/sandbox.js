/* ============ Training Mode: the sandbox ============
   Owner: P3-A (Training Mode, Phase 3: sandbox world and cages). Contract: BUILD-PLAN Phase 3 "Contracts (P3-A stubs
   them)", sandbox.js (enterTraining, exitTraining, inTraining, trainLook, the train:enter and train:exit events);
   TRAINING-SPEC 1 (Training is a sandbox: it never writes the career save, money, trust or progression, and cleans up
   on exit), 4 (Training opens without starting or touching a career, with a clear exit back to the main menu) and 7
   (the same created character everywhere).

   enterTraining({kind}) -> a promise, resolved once the cage is on screen:
     the career, if one is in memory (after "Quit to title" S is still the career), is held aside (career.js
     holdCareer: no save is made, S is null, the play clock and the cloud's auto sync stop); the world starts with no
     career (world.js startSandbox) in the cage of that kind (cage.js); the mode 'trainsb' runs: the clock frozen at
     an afternoon hour, no compass, no closing time, no flat, no tunnel, saves deferred (and there is nothing to save),
     aiming only at the cage's own spots (the cones), the zone kept on a pitch change, paused while the pointer is
     free. The window gets 'train:enter' {kind}.
   exitTraining() -> the window gets 'train:exit' first (the scenario runner stops its own scenario on it), then the
     mode ends, the world stops and its scene is taken down (world.js stopSandbox), the career is put back exactly as
     it was (releaseCareer) and the title comes back. Every path out, an error included, puts the career back.
   inTraining() -> true between the two.
   trainLook() -> the look Training's body has: the held career's (with what dresses it), or the default look.
   This module never imports a P3-B module and never writes anything of the career (lint train-no-career-writes). */
import {registerMode, enterMode, exitMode, mode} from "../core/modes.js";
import {LIFE, FLAGS} from "../core/state.js";
import {W} from "../build.js";
import {startSandbox, stopSandbox} from "../world.js";
import {sandboxLook} from "../core/me.js";
import {CAGE, cageEnter} from "./cage.js";

export {CAGE, cageEnter};
// the hour the sandbox's frozen clock shows: a clear afternoon on the pitch
const TRAIN_HOUR = 15*60;
const ST = {on:false, kind:null, entering:null, prevMin:null};

registerMode("trainsb", {
  enter(){}, exit(){},
  flags:{clock:"frozen", movement:"life", targeting:sp => !!sp && W.zone === "cage", tunnel:false, closing:false, homeTick:false,
    compass:false, saves:"defer", tp:true, hud:"life", pauseOnUnlock:true, leaveOnZone:false}
});

const fire = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, {detail})); } catch(e){ console.error(e); } };
const hold = () => typeof holdCareer === "function" ? holdCareer() : false;
const release = () => { if (typeof releaseCareer === "function") releaseCareer(); };

export const inTraining = () => ST.on;
export function trainLook(){ return sandboxLook().look; }

export function enterTraining({kind = "full"} = {}){
  if (ST.on) return ST.entering || Promise.resolve(CAGE);
  ST.on = true; ST.kind = kind;
  try {
    hold();
    ST.prevMin = LIFE.min;
    LIFE.min = TRAIN_HOUR;
    document.body.classList.add("life");
    fire("train:enter", {kind});
    // the mode first, so the very first frame is already lived by its flags (no compass, no closing time)
    enterMode("trainsb");
    ST.entering = startSandbox({zone:"cage", kind, at:"bus"});
    FLAGS.forceSky = true;
  } catch(e){
    console.error(e);
    // nothing half-made is left behind: the world stopped, the career back
    ST.entering = null;
    exitTraining({title:true});
    return Promise.reject(e);
  }
  return ST.entering.then(() => { ST.entering = null; return CAGE; });
}

export function exitTraining({title = true} = {}){
  if (!ST.on) return false;
  fire("train:exit", {kind:CAGE.kind || ST.kind});
  try {
    if (mode() === "trainsb") exitMode("done");
    stopSandbox();
  } catch(e){ console.error(e); }
  finally {
    release();
    if (ST.prevMin != null) LIFE.min = ST.prevMin;
    ST.on = false; ST.kind = null; ST.entering = null; ST.prevMin = null;
  }
  if (title && typeof screenTitle === "function") screenTitle();
  return true;
}
