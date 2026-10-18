/* ============ LIFE core: the shared state ============
   Owner: WP-0A (frozen after Stage 0). Contract: DESIGN 1.2 (core seams, state.js), 2.2 WP-0A.
   Everything more than one core module writes lives here, as properties of objects: an exported `let` cannot be
   reassigned by the modules that import it, an object's fields can. Plain data (and the spring every smoothed value
   rides on) with no imports, so every core module can depend on this one without a cycle. */

// the career (classic S) when there is one
export const G = () => (typeof S !== "undefined" ? S : null);
// exact critically damped spring of o[kx] (and its rate o[kv]) towards 0 over dt: no overshoot from rest, no frame-rate
// dependence. The eye height, the head bob and the camera's kicks all ride on it
export function spring(o, kx, kv, w, dt){
  const x = o[kx], v = o[kv], e = Math.exp(-w*dt), k = (v + w*x)*dt;
  o[kx] = (x + k)*e; o[kv] = (v - w*k)*e;
}

// where the world is: the clock as last read from S.life, the zone you are in, and whether the loop is running
export const LIFE = {min:7*60, day:1, wd:0, zone:"home", running:false};
// the clock read again from the career, after anything that moved it
export function sync(){ const s = G(); if (s && s.life){ LIFE.min = s.life.min; LIFE.day = s.life.day; LIFE.wd = s.life.wd; } }

/* you. How you move: W A S D walk (2 m/s, a real walk: the body's gait only starts to break into a run above
   1.9 m/s); hold Shift to run (6 m/s); keep Shift held while going forward and, once you are up to running pace, it
   builds into a sprint over about a second (7.6 m/s). Backwards and sideways never sprint. Speeding up and slowing
   down are acceleration-limited; the direction you move in follows the view almost at once (move.js body). The view
   itself is never smoothed: the mouse turns the camera in the frame it moved in. Only the camera's position is
   filtered: the head bob (a small, speed-scaled rise and fall once a step, a tiny sway once a stride, no roll) and the
   eye height, which follows the ground through a critically damped spring so kerbs and stair landings never snap.
   eyeH is your eye height over your feet (set from your body's height, me.js meBuild).
   P.speed / P.moveMode / P.stride are the locomotion state a body or footsteps can read. */
export const P = {x:0, z:0, feet:0, eye:1.62, eyeH:1.62, yaw:0, pitch:0, vx:0, vz:0, vy:0, drillY:0, bobY:0,
  speed:0, moveMode:"idle", stride:0, sprint:0};
// the keys held down, by lower-case key name ("space" for the space bar)
export const keys = {};
// head bob springs and the field of view
export const B = {amt:0, y:0, yv:0, x:0, xv:0, fov:74, fovSet:74};
// the ground the eye rides on (g), and its offsets from it: slopes (a), steps (b)
export const E = {g:0, a:0, av:0, b:0, bv:0};
// your two bodies and the third-person camera's state (me.js)
export const ME = {fp:null, tp:null, kind:"", scale:1, yaw:0, tw:0, back:false, dph:0, act:null, camT:0, dist:0, sh:0, up:.12, hold:0, yawV:0, lastYaw:0, short:0, px:0, pz:0, tpShown:false, look:0, near:0, nearT:0, fadeMat:null, op:1};
// the renderer, the scene, the camera and the sky (world.js boot)
export const RT = {scene:null, cam:null, renderer:null, SKY:null};
/* the world's runtime switches:
   modal  a panel, the mail or a time-lapse card has the screen (the keys are let go, the pointer is free)
   busy   the time-lapse card running (acts.js timeLapse), or null
   drill  the drill or gym set running under the mode "drill" (the DRILL host contract of drills.js), or null
   lockLost  the pointer was let go while a mode that pauses on it was running
   moving    you are on the move (P.speed above half a metre a second): the passive clock runs a little faster
   forceSky  the sky and its lights are recomputed in full next frame
   held   what you are aiming at this frame (a spot), grab: a door being dragged */
export const FLAGS = {modal:false, busy:null, drill:null, lockLost:false, moving:false, forceSky:true, held:null, grab:null, skipDraw:false};
// the black cover over the world (#lifeFade): v, its opacity as the fade helpers last set it; boot, true while it is
// the cover startLife put up before the first frames (modes.js revealAfterFrames)
export const FADE = {v:0, boot:false};
