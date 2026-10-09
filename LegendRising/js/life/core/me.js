/* ============ LIFE core: your body and the life camera ============
   Owner: WP-0A moves it here, WP-B owns it from Stage 1. Contract: DESIGN 1.2 (me.js), 1.4.2 (camera owners life-fp,
   life-tp, drill-view), 1.5.9 (the bob and the footfall nod), 3.5.9 (first person), 2.2 WP-0A.

   Your body. You are drawn by the same character system as everybody else (human.js), dressed from your look
   (S.player.look, see look.js): your own clothes at home and in the street, the club's training kit with your number at
   the ground. Two bodies are kept: the first-person one (no head: the body ends at the shoulders) and the whole you for
   third person; only one is ever shown, the other keeps its footing unseen (its gait runs, nothing is posed). The legs
   step under you from what you actually did (where the mover put you, after walls): feet planted where they land,
   starting, stopping and turning on the spot in real steps (gait.js). First person: the body faces where you look, and
   the camera sits a little in front of its neck (further forward as you look down, as a real head bends over), so you
   see your chest, legs and shoes and never the inside of a neck. Walking sideways the hips turn towards where you are
   going (up to 0.8 rad) and the feet side-step; walking backwards they step back: looking down shows real steps. If
   anything brings the neck up to the eye (leaning back from a wall, a lean into a sprint), the body gives way in its
   own frame before its legs are solved, so the feet stay where they stand. Its height follows the camera's own
   smoothed eye, so on a kerb or a stair landing the body can never rise into the view; the feet find the treads and
   kerbs under them (one ray a footfall).
   The head bob rides the first-person body's own pelvis (DESIGN 1.5.9: its rise and fall against its mean, scaled down,
   at most 0.6 cm plus 1.6 mm per m/s; a sideways sway of at most 6 mm; no roll) and each footfall of that body gives a
   small nod: the camera and the legs keep one clock.

   The camera: first person, or third person behind you. V switches between them (kept in the save, S.life.view). Third
   person orbits behind and above you over the right shoulder; the mouse turns it at once, exactly as in first person,
   and W A S D go the way it looks. Whatever is between you and the camera pulls it in at once (walls, doors, furniture,
   ceilings, stairs, glass), tested against the real drawn geometry of the place (collide.js) and the collision boxes
   (doors that open); it eases back out when the way is clear. Drills, panels, the bus and the tunnel are lived in
   first person; third person comes back after. */
import {THREE} from "../build.js";
import {human, animateHuman, BONE, EV, onHumanRemat} from "../human.js";
import {fkQ, newFK, lerp} from "../rig.js";
import {bodyLook} from "../look.js";
import {G, LIFE, P, B, ME, RT, FLAGS, FADE} from "./state.js";
import {camCast, camClear, camClearance, surfaceUnder, CG, SG} from "./collide.js";
import {GR, LOCO} from "./move.js";
import {modeFlags, tutOn, persist} from "./modes.js";
import {camPush, camPop, camKick} from "./camera.js";
import {TUN} from "./tunnel.js";
import {note} from "./hud.js";

// the third-person camera: how far back (and more at a sprint), over the head, out over the shoulder, kept from walls;
// how near it may come and still show you; how high it cranes; how fast it may come in (unless it must) and go out;
// the glide into your eyes when there is no room
const TPV = {dist:2.65, sprint:.35, up:.12, side:.36, margin:.16, minShow:.62, crane:.5, inSpeed:15, outSpeed:3.2, glide:.25};
const meKind = () => LIFE.zone === "ground" ? "training" : "casual";
export const wrapA = a => a - Math.round(a/(2*Math.PI))*2*Math.PI;
export const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const D2R = Math.PI/180;

/* ---------- the bodies ---------- */
export function meDispose(){
  for (const k of ["fp", "tp"]) if (ME[k]){ ME[k].dispose(); ME[k] = null; }
  if (ME.fadeMat){ ME.fadeMat.dispose(); ME.fadeMat = null; }
}
// the third-person body's own copy of the people's material, able to fade (alpha hashing: a dither, no sorting)
function meFadeMat(h, base = h.near.material){
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile; if (base.customProgramCacheKey) m.customProgramCacheKey = base.customProgramCacheKey;
  m.alphaHash = true; m.userData = {keep:true};
  if (ME.fadeMat && ME.fadeMat !== m) ME.fadeMat.dispose();
  h.near.material = m; if (h.num) h.num.material = m;        // (the shirt number fades with the shirt)
  ME.fadeMat = m; m.opacity = ME.op == null ? 1 : ME.op;
}
// a change of graphics preset made the people's material again: the fading copy is made again from the new one
onHumanRemat(base => { if (ME.tp && ME.fadeMat) meFadeMat(ME.tp, base); });
export function meFade(op){
  const h = ME.tp, m = ME.fadeMat; if (!h || !m) return;
  if (Math.abs(op - ME.op) > 1e-3 || (op === 1 && ME.op !== 1)){ ME.op = op; m.opacity = op; }
  h.near.visible = op > .02;
}
// the floor under one of your footsteps: a stair's tread, a kerb, the floor (one ray down from just above your feet)
// (looked for from 0.9 m above your feet down to 0.5 m below them: a stair going up a metre ahead is still found,
// and the flight above your head never is)
const feetGround = (x, z) => surfaceUnder(x, P.feet + .45, z);
export function meBuild(){
  meDispose();
  const s = G(); if (!s || !s.player || !RT.scene) return;
  ME.kind = meKind();
  let look;
  try { look = bodyLook(s.player.look, ME.kind); } catch(e){ console.error(e); return; }
  ME.fp = human(look, {noHead:true, lod:false, track:true}); ME.fp.near.frustumCulled = false;
  ME.tp = human(look, {lod:false, track:true});
  ME.fp.g.name = "me-fp"; ME.tp.g.name = "me-tp";
  ME.fp.groundAt = ME.tp.groundAt = feetGround;
  ME.op = 1; meFadeMat(ME.tp);
  RT.scene.add(ME.fp.g, ME.tp.g);
  ME.scale = ME.fp.scale;
  // the eyes of a 1.80 m body are at 1.68 (human.js): yours, at your height
  const eye = Math.round(1.68*ME.scale*1000)/1000, d = eye - P.eyeH;
  P.eyeH = eye; P.eye += d;
  ME.yaw = P.yaw; ME.tw = 0; ME.back = false; ME.act = null;
  BOB.mean = null; BOB.x = BOB.y = 0;
  meStep(0);
}
window.lifeLookChanged = () => { if (RT.scene && RT.renderer) meBuild(); };

// the state a body walks with, from what you actually did (look: where the head turns). root: where you really are
// (the first-person body's group carries the camera's small offsets; its feet must not be dragged by them)
const _gs = {mode:"move", speed:0, intent:0, look:0, root:{x:0, z:0}, fac:null, armsIn:0, correct:null};
function gaitState(look, armsIn = 0, correct = null){
  if (ME.act) return ME.act;
  _gs.speed = P.speed; _gs.intent = LOCO.want; _gs.look = look; _gs.root.x = P.x; _gs.root.z = P.z; _gs.fac = LOCO.fac;
  _gs.armsIn = armsIn; _gs.correct = correct;
  return _gs;
}
/* the neck below and behind the eye whatever the body is doing (a lean into a sprint, a kick, a header): the body gives
   way in its own frame (down, back) before its legs are solved, so the camera never ends up inside it and the feet
   stay where they are */
const _nfk = newFK();
function neckFix(h, Q){
  fkQ(h, Q, _nfk, 5);
  const s = h.scale, g = h.g, ry = g.rotation.y, c = Math.cos(ry), sn = Math.sin(ry), o = BONE.neck*7, cam = RT.cam.position;
  const nx = _nfk[o], ny = _nfk[o + 1], nz = _nfk[o + 2];
  const over = g.position.y + ny*s - (cam.y - .15*s);
  if (over > 0) Q[81] -= over/s;
  const wx = g.position.x + (nx*c + nz*sn)*s, wz = g.position.z + (-nx*sn + nz*c)*s;
  const ahead = (wx - cam.x)*-Math.sin(P.yaw) + (wz - cam.z)*-Math.cos(P.yaw) + .06*s;
  if (ahead > 0) Q[82] -= ahead/s;
}
/* the head bob (DESIGN 1.5.9) from the first-person body's pelvis: its height against its running mean, scaled by
   lerp(0.45, 0.32, R) and held within 0.006 + 0.0016 v metres; its sideways sway times 0.35 within 6 mm; and on each
   of that body's footfalls a nod of 0.15 degrees times min(1, v/8) (a kick into the camera's spring, stiffness 30).
   Both fade out below 0.5 m/s: standing, the eye is still (an idle body shifting its weight does not move the view) */
export const BOB = {mean:null, x:0, y:0, nods:0, lastN:-1};
function bobStep(h, dt){
  const Gt = h.gait;
  if (!Gt || LOCO.old){ BOB.x = BOB.y = 0; return; }
  const s = h.scale, v = P.speed, dy = Gt.hipDy*s, mv = sstep(.05, .5, v);
  if (BOB.mean == null) BOB.mean = dy;
  BOB.mean += (dy - BOB.mean)*(1 - Math.exp(-2.5*dt));
  const k = lerp(.45, .32, Gt.R), A = .006 + .0016*v;
  BOB.y = clamp(k*(dy - BOB.mean), -A, A)*mv;
  BOB.x = clamp(-.35*Gt.hipLat*s, -.006, .006)*mv;
  if (h.ev.mask & EV.FOOTFALL){ BOB.nods++; BOB.lastN = Gt.n; if (v > .3) camKick({pitch:-.15*D2R*Math.min(1, v/8), w:30}); }
}
const _nk = new THREE.Vector3();
export function meStep(dt){
  if (!ME.fp || !ME.tp) return;
  const tp = ME.tpShown, s = ME.scale, cam = RT.cam;
  ME.fp.g.visible = !tp && !(FLAGS.drill && FLAGS.drill.hideBody);
  ME.tp.g.visible = tp;
  const mv = Math.atan2(-P.vx, -P.vz), going = P.speed > .3 && (P.vx || P.vz);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw), sb = ME.short || 0;
  const fp = ME.fp, tb = ME.tp;
  // the first-person body stands where you stand (the camera is the head, ahead of the neck: see viewStep)
  fp.g.position.set(P.x + sin*sb + ME.px, P.eye - P.eyeH + P.drillY, P.z + cos*sb + ME.pz); fp.g.rotation.y = P.yaw + Math.PI;
  if (tp){
    // third person: the body turns to face the way you are going, quickly but never in one frame
    if (going){ const d = wrapA(mv - ME.yaw), k = d*(1 - Math.exp(-11*dt)); ME.yaw = wrapA(ME.yaw + clamp(k, -9*dt, 9*dt)); }
    // the head turns to where the camera looks, as far as a neck goes, and lets go when you look back at yourself
    const rel = wrapA(P.yaw - ME.yaw), lk = clamp(rel, -1.1, 1.1)*(1 - sstep(1.7, 2.3, Math.abs(rel)));
    ME.look += (lk - ME.look)*(1 - Math.exp(-6*dt));
    tb.g.position.set(P.x, P.feet, P.z); tb.g.rotation.y = ME.yaw + Math.PI;
    animateHuman(tb, dt, gaitState(ME.look));
    animateHuman(fp, dt, gaitState(0), {tier:4});
    if (!LOCO.old){ BOB.x = BOB.y = 0; B.x = B.y = 0; }
    // the camera gliding in to your eyes (no room behind you, or V) passes through where your head and shoulders are:
    // the body fades out (dithered, so nothing needs sorting) as it comes within half a metre, and is gone before the
    // view could fill with the back of your head or the inside of your collar
    const c = cam.position, op = sstep(.3, .56, Math.hypot(c.x - P.x, c.y - P.eye - .05, c.z - P.z)/s);
    meFade(op);
    return;
  }
  ME.yaw = P.yaw;
  /* looking down at a run (a sprint, a flight of stairs taken at pace), the arm swinging forward would come up the
     middle of the view as a long stiff forearm: the arms are kept lower and nearer the body (less forward swing, the
     shoulders back and a little out) so the hands stay in the bottom of the picture. First person only: the body
     others see (third person) runs as it always does.
     How much they are kept in follows what brings the hands up the view (DESIGN 3.5.9):
     · the gait's own run, not your speed (the gait as the last frame left it: all of it eases). Let go of the keys at
       a sprint and your speed falls away at once while the arms still swing at the run (R, mvA) for half a second;
     · how far you look down. The run's forward hand comes up to about 0.6 rad (34 degrees) under the eye's level, and
       the view's lower edge is half its field (37 degrees) under its middle: the hand is in the picture as soon as you
       look down at all, and above its lower third from about 0.3 rad down. So from 0.1 rad down, fully by 0.6 (kept
       in from 0.45 to 1.0, it came most of the way up the lower half of the view at every stride looking 0.45 to 0.6
       rad down);
     · braking, whatever the pitch: the body leans back (the deceleration's lean, full at 3.3 m/s/s, then the hard
       stop's brace, gait.js and DESIGN 3.5.5: arms forward, the spine back), which swings the run's arms up the view.
       The forward hand came up the middle of the view looking ahead and to its top edge looking down, a hand's breadth
       from the eye. The brace stays in the hips, the lean and the planted step */
  const Gt = fp.gait, run = Gt ? (Gt.R || 0)*(Gt.mvA || 0) : 0;
  const brakes = Gt ? Math.max(sstep(0, 3.3, -(Gt.acc || 0)), Gt.brakeW || 0) : 0;
  const armK = ME.act ? 0 : run*Math.max(sstep(.1, .6, -P.pitch), brakes);
  animateHuman(fp, dt, gaitState(0, armK, neckFix));
  if (!LOCO.old){
    // the camera was placed with last frame's bob: this frame's (the same clock as the feet just drawn)
    const by = B.y, bx = B.x;
    bobStep(fp, dt); B.x = BOB.x; B.y = BOB.y;
    cam.position.x += cos*(B.x - bx); cam.position.y += B.y - by; cam.position.z -= sin*(B.x - bx);
  }
  // the third-person body keeps its footing unseen
  tb.g.position.set(P.x, P.feet, P.z); tb.g.rotation.y = ME.yaw + Math.PI;
  animateHuman(tb, dt, gaitState(0), {tier:4});
  void _nk;
}


/* ---------- first or third person ---------- */
const viewPref = () => { const s = G(); return s && s.life && s.life.view === "tp" ? "tp" : "fp"; };
// a fade is up (the tunnel darkening, a cut to black); the cover startLife puts up before the first frames is not one:
// what is behind it is your normal view, waiting to be shown
export const fadeOn = () => { const f = document.getElementById("lifeFade"); return !!(f && (f.dataset.tun || (+f.style.opacity > .02 && !FADE.boot))); };
// third person waits: the mode does not allow it (a drill), a panel or a card is up, the walk into the tunnel, a fade
export const forcedFP = () => !!(!modeFlags().tp || FLAGS.modal || FLAGS.busy || tutOn() || TUN.go || fadeOn());
export function toggleView(){
  const s = G(); if (!s || !s.life) return;
  s.life.view = viewPref() === "tp" ? "fp" : "tp"; persist();
  if (forcedFP()) note(s.life.view === "tp" ? "Third person comes back when you're done here." : "First person.");
}
const _cp = new THREE.Vector3(), _cd = new THREE.Vector3(), _cd2 = new THREE.Vector3(), _cd3 = new THREE.Vector3(), _cv = new THREE.Vector3();
// how far the near plane's corners reach from the eye, and a little more: nothing may come nearer the camera than this
function camRadius(){ const cam = RT.cam, t = Math.tan(cam.fov*Math.PI/360), a = cam.aspect || 1; return Math.max(.1, cam.near*Math.sqrt(1 + t*t*(1 + a*a)) + .025); }
/* the near plane is not a point: anything nearer the camera than r on any side (a wall, a door jamb's edge, the slope
   under a stair, a cabinet with no collision box) pushes it away: the push along each axis the deepest of them asks
   for (collide.js camClearance, from the nearest points of the boxes and drawn triangles within r themselves), never
   through something on the other side (one ray along the push); a second pass takes up what an oblique surface left.
   (It was 26 short rays a pass, the faces, edges and corners of a cube: up to 54 rays a frame walking along a wall or
   a rail, against the 12 in the open and 35 indoors of DESIGN 1.5.11; now at most 2.) */
const PV = new Float64Array(3);
/* The push is skipped where nothing is within r of the eye (camClear, DESIGN 3.9.5), and repeated from the last answer
   while the eye stands where it stood then and nothing that moves (a door's leaf, a person, a car) is near it */
const NPC = {x:NaN, y:NaN, z:NaN, r:NaN, rev:-1, tri:null, ox:0, oy:0, oz:0, moved:0};
const PUSH_REACH = .35;
function dynNear(x, y, z, R){
  for (const s of SG.dyn) if (!s.off && x > s.x0 - R && x < s.x1 + R && z > s.z0 - R && z < s.z1 + R && y > s.y0 - R && y < s.y1 + R) return true;
  return false;
}
function nearPush(v, r){
  if (camClear(v.x, v.y, v.z, r)) return 0;
  if (v.x === NPC.x && v.y === NPC.y && v.z === NPC.z && r === NPC.r && NPC.rev === SG.rev && NPC.tri === CG.tri && !dynNear(v.x, v.y, v.z, r + PUSH_REACH)){
    v.x = NPC.ox; v.y = NPC.oy; v.z = NPC.oz; return NPC.moved;
  }
  const x0 = v.x, y0 = v.y, z0 = v.z;
  let moved = 0;
  for (let pass = 0; pass < 2; pass++){
    camClearance(v.x, v.y, v.z, r, PV);
    const mx = PV[0], my = PV[1], mz = PV[2], L = Math.hypot(mx, my, mz);
    if (L < 2e-3) break;
    const k = Math.max(0, Math.min(L, camCast(v.x, v.y, v.z, mx/L, my/L, mz/L, L + .03) - .03))/L;
    v.x += mx*k; v.y += my*k; v.z += mz*k; moved += L*k;
    if (k < 1) break;
  }
  NPC.x = x0; NPC.y = y0; NPC.z = z0; NPC.r = r; NPC.rev = SG.rev; NPC.tri = CG.tri; NPC.ox = v.x; NPC.oy = v.y; NPC.oz = v.z; NPC.moved = moved;
  return moved;
}
// can the camera at (x, y, z) see you (your head and your chest) from (hx, hz), or is a wall, a jamb or a door between?
function seesMe(x, y, z, hx = P.x, hz = P.z){
  for (let i = 0; i < 2; i++){
    const ty = i ? P.eye - .5*ME.scale : P.eye, dx = x - hx, dy = y - ty, dz = z - hz, D = Math.hypot(dx, dy, dz);
    if (D > .15 && camCast(hx, ty, hz, dx/D, dy/D, dz/D, D) < D - .1) return false;
  }
  return true;
}
/* the view's helpers work from one frame record (TPF), not from closures made every frame (DESIGN 3.9.6) */
const AHEAD_A = [0, .7, -.7], UP_LOW = [-.14, -.34], BACK_K = [.5, 1], WALK_K = [.35, .7, 1], CLOSER = [.88, .76, .64, .53, .43, .34, .26];
const TPF = {hx:0, hz:0, rx:0, rz:0, ax:0, az:0, hy:0, rise:0, want0:0, moving:false, turning:false};
// the first-person eye: anything nearer than r (a jamb's edge beside you, a cabinet with no collision box) moves it, and
// the body with it, the few centimetres it takes
function fpEye(r){ const x0 = _cv.x, z0 = _cv.z; nearPush(_cv, r); ME.px = _cv.x - x0; ME.pz = _cv.z - z0; }
// how far back the camera can go from a pivot at (x, z), s out over the shoulder, u above your eyes: the drawn geometry
// and the doors, less a margin
function reach(x, z, s, u, c = _cd){ return clamp(camCast(x + TPF.rx*s, P.eye + u, z + TPF.rz*s, c.x, c.y, c.z, TPF.want0 + TPV.margin) - TPV.margin, 0, TPF.want0); }
// the room behind a pivot u above your eyes, now and where your head will be in a moment
function reachUp(u){ return Math.min(reach(TPF.hx, TPF.hz, 0, u), reach(TPF.ax, TPF.az, 0, u + TPF.rise)); }
// does the camera s over the shoulder and d back see you: now, and (ahead) where you will be in a moment and where the
// camera is swinging to
function seesAt(s, d, ahead){
  const hx = TPF.hx, hz = TPF.hz, hy = TPF.hy, rx = TPF.rx, rz = TPF.rz;
  return seesMe(hx + rx*s + _cd.x*d, hy + _cd.y*d, hz + rz*s + _cd.z*d)
    && (!ahead || !TPF.moving || seesMe(TPF.ax + rx*s + _cd.x*d, hy + _cd.y*d, TPF.az + rz*s + _cd.z*d, TPF.ax, TPF.az))
    && (!ahead || !TPF.turning || seesMe(hx + rx*s + _cd2.x*d, hy + _cd2.y*d, hz + rz*s + _cd2.z*d));
}
// the third-person camera where ME.sh and ME.dist put it, kept r from anything
function placeCam(r){ _cp.set(TPF.hx + TPF.rx*ME.sh + _cd.x*ME.dist, TPF.hy + _cd.y*ME.dist, TPF.hz + TPF.rz*ME.sh + _cd.z*ME.dist); nearPush(_cp, r); }
export function viewStep(dt){
  const cam = RT.cam, sin = Math.sin(P.yaw), cos = Math.cos(P.yaw), r = camRadius();
  /* first person: the eye, with the bob, a little ahead of your neck (further as you look well down, as a head bends
     over the chest, so you see your legs and shoes and never the inside of a neck) and never nearer than r to anything
     in front of it: straight ahead and 40 degrees to either side */
  const ahead0 = (.07 + .15*sstep(.75, 1.35, -P.pitch))*ME.scale;
  let ahead = ahead0;
  // (three rays, none longer than ahead0 + r + 2 cm: with nothing that near the eye none of them can meet anything)
  if (!camClear(P.x, P.eye, P.z, ahead0 + r + .02)) for (let i = 0; i < 3; i++){
    const a = AHEAD_A[i], ca = Math.cos(a), sa = Math.sin(a), dx = -sin*ca + cos*sa, dz = -cos*ca - sin*sa;
    ahead = Math.min(ahead, (camCast(P.x, P.eye, P.z, dx, 0, dz, ahead0*ca + r + .02) - r)/ca);
  }
  ahead = Math.max(0, ahead);
  ME.short = ahead0 - ahead;                                // a wall in the way: the body leans back from it instead
  _cv.set(P.x + cos*B.x - sin*ahead, P.eye + B.y + P.drillY + P.bobY - .035*sstep(.3, 1.2, -P.pitch), P.z - sin*B.x - cos*ahead);
  // anything else nearer than r moves the eye (fpEye: only while the first-person view is the one you see, or blended in)
  const want = viewPref() === "tp" && !forcedFP() ? 1 : 0;
  // a panel, the bus, a drill: straight into first person; V: a short glide either way
  if (!want && (FLAGS.modal || FLAGS.busy || !modeFlags().tp || fadeOn())) ME.camT = 0;
  else ME.camT = want ? Math.min(1, ME.camT + dt/.38) : Math.max(0, ME.camT - dt/.28);
  const e = sstep(0, 1, ME.camT);
  if (e <= 0){ fpEye(r); cam.position.copy(_cv); ME.tpShown = false; ME.dist = ME.sh = ME.hold = ME.near = ME.nearT = 0; ME.up = TPV.up; return; }
  const blendFP = e < 1 || ME.near > 0 || !ME.tpShown;
  if (blendFP) fpEye(r); else ME.px = ME.pz = 0;
  const fx = _cv.x, fy = _cv.y, fz = _cv.z;
  /* third person: a pivot over your head and out over the right shoulder, the camera back from it along the view. The
     orbit's own pitch is limited so it neither digs into the floor nor goes over the top. */
  const fresh = !ME.tpShown && !ME.near;
  const hx = P.x, hz = P.z, rx = cos, rz = -sin;
  const po = clamp(P.pitch, -1.15, .75), cp = Math.cos(po);
  _cd.set(sin*cp, -Math.sin(po), cos*cp);                      // from the pivot towards the camera (behind the view)
  // and where it is swinging to as you turn (the last frames' turn, a moment ahead)
  const yv = fresh || !(dt > 0) ? 0 : wrapA(P.yaw - ME.lastYaw)/dt; ME.lastYaw = P.yaw;
  ME.yawV = fresh ? 0 : ME.yawV + (yv - ME.yawV)*(1 - Math.exp(-18*dt));
  const yl = clamp(ME.yawV*.2, -.9, .9), ya = P.yaw + yl, yh = P.yaw + yl/2;
  _cd2.set(Math.sin(ya)*cp, _cd.y, Math.cos(ya)*cp);
  _cd3.set(Math.sin(yh)*cp, _cd.y, Math.cos(yh)*cp);         // (and halfway there: a jamb can be between the two)
  const want0 = (TPV.dist + TPV.sprint*P.sprint)*e, sw = TPV.side*e;
  // where your head will be in a moment: what is coming (a doorway, a lintel, a jamb) is made room for before you get there
  let ax = hx, az = hz;
  const vl = Math.hypot(P.vx, P.vz);
  if (vl > .3){ const L = clamp(camCast(hx, P.eye, hz, P.vx/vl, 0, P.vz/vl, vl*.3 + .3) - .3, 0, vl*.3); ax += P.vx/vl*L; az += P.vz/vl*L; }
  // and how much higher (or lower) it will be by then, on a flight of stairs: the flight overhead comes down to meet it
  const rise = clamp(GR.egx*(ax - hx) + GR.egz*(az - hz), -.6, .6);
  TPF.hx = hx; TPF.hz = hz; TPF.rx = rx; TPF.rz = rz; TPF.ax = ax; TPF.az = az; TPF.rise = rise; TPF.want0 = want0;
  /* its height: over your head, or lower, ducking under a door's lintel or a low ceiling, when the way back from over
     your head is (or in a moment will be) blocked close behind you and a lower one is not; or higher, craned up over
     your head, when what is close behind you is low (a counter, a bed, a bench) and the room above lets it */
  let uG = TPV.up;
  { let best = reachUp(TPV.up);
    if (best < .75*want0) for (let i = 0; i < UP_LOW.length; i++){ const u = UP_LOW[i], v = reachUp(u); if (v > best + .3){ best = v; uG = u; } }
    if (best < TPV.minShow + .45){
      const head = camCast(hx, P.eye, hz, 0, 1, 0, TPV.crane + TPV.margin + r) - TPV.margin - r;
      for (let i = 0; i < 2; i++){ const u = i ? TPV.crane : TPV.crane*.6; if (u <= head){ const v = reachUp(u); if (v > best + .3){ best = v; uG = u; } } }
    } }
  ME.up = fresh ? uG : ME.up + (uG - ME.up)*(1 - Math.exp(-(uG < ME.up ? 12 : 5)*dt));
  // never higher than the room over your head allows right now (a lintel coming over as you walk under it)
  if (ME.up > TPV.up){ const head = camCast(hx, P.eye, hz, 0, 1, 0, ME.up + r + .05) - r - .05; if (head < ME.up) ME.up = Math.max(TPV.up, head); }
  const hy = P.eye + ME.up;
  TPF.hy = hy;
  // the shoulder: as far out as the room beside the head allows (beside it now, where it is going, and back along the
  // camera's path), so a door recess or an alcove beside you does not throw the camera at the wall behind
  const room0 = camCast(hx, hy, hz, rx, 0, rz, sw + TPV.margin);
  const back = camCast(hx, hy, hz, _cd.x, _cd.y, _cd.z, want0);
  let room = Math.min(room0, camCast(ax, hy, az, rx, 0, rz, sw + TPV.margin));
  for (let i = 0; i < BACK_K.length; i++){ const t = back*BACK_K[i] - r; if (t > .2) room = Math.min(room, camCast(hx + _cd.x*t, hy + _cd.y*t, hz + _cd.z*t, rx, 0, rz, sw + TPV.margin)); }
  const shMax = clamp(room0 - r, 0, sw);                       // the pivot itself never nearer a wall than the camera may be
  let shG = clamp(room - TPV.margin, 0, sw);
  /* it must also see you: a jamb or a wall between the camera and your head or chest (you in a doorway, it in the room
     behind) first brings it over your head, then closer in, until you are in view: in view now and also where you will
     be in a moment and where the camera is swinging to (so it starts moving in before you are cut off) if it can be,
     just now if not, your own eyes if nowhere */
  const moving = ax !== hx || az !== hz, turning = Math.abs(ME.yawV) > .3;
  TPF.moving = moving; TPF.turning = turning;
  let dG = reach(hx, hz, shG, ME.up);
  if (dG > 0 && !seesAt(shG, dG, true)){
    // the candidates, in order: over your head at the full distance, then closer in (no nearer than TPV.minShow); each
    // seeing you now and in a moment if one does, else now (the one just tried, out over the shoulder, did not)
    const d0 = reach(hx, hz, 0, ME.up);
    let found = false;
    for (let pass = 0; pass < 2 && !found; pass++){
      for (let i = -1; i < CLOSER.length; i++){
        const d = i < 0 ? d0 : d0*CLOSER[i];
        if (i >= 0 && d < TPV.minShow) break;
        if (seesAt(0, d, pass === 0)){ shG = 0; dG = d; found = true; break; }
      }
    }
    if (!found){ shG = 0; dG = 0; }
  }
  // the shoulder eases both ways (quickly in, gently out), but never past what the room beside the head allows
  ME.sh = fresh ? shG : ME.sh + (shG - ME.sh)*(1 - Math.exp(-(shG < ME.sh ? 16 : 4.5)*dt));
  ME.sh = Math.min(ME.sh, shMax);
  /* the distance. Only what would put the camera into something (its near plane through a wall, a jamb, a door) pulls
     it in at once (it is never inside or behind a wall). Anything else that asks it in (the margin kept from a wall, a
     wall that will be behind it in a moment as you turn or walk, not seeing you) brings it in over three or four frames,
     at most TPV.inSpeed; it goes back out gently, never faster than TPV.outSpeed, and not until the way has stayed
     clear a moment */
  const hardRaw = clamp(camCast(hx + rx*ME.sh, hy, hz + rz*ME.sh, _cd.x, _cd.y, _cd.z, want0 + r) - r, 0, want0);
  const hard = reach(hx, hz, ME.sh, ME.up);
  let d = Math.min(hard, dG);
  if (turning) d = Math.min(d, reach(hx, hz, ME.sh, ME.up, _cd2), reach(hx, hz, ME.sh, ME.up, _cd3));
  if (moving) for (let i = 0; i < WALK_K.length; i++){ const k = WALK_K[i]; d = Math.min(d, reach(hx + (ax - hx)*k, hz + (az - hz)*k, ME.sh, ME.up + rise*k)); }
  ME.hold = Math.max(0, ME.hold - dt);
  if (fresh){ ME.dist = d; ME.hold = .2; }
  else {
    if (hardRaw < ME.dist){ ME.dist = hardRaw; ME.hold = .2; }
    if (d < ME.dist - 1e-3){ ME.dist += Math.max((d - ME.dist)*(1 - Math.exp(-24*dt)), -TPV.inSpeed*dt); ME.hold = .2; }
    else if (!ME.hold) ME.dist += Math.min((d - ME.dist)*(1 - Math.exp(-4.5*dt)), TPV.outSpeed*dt);
  }
  placeCam(r);
  // whatever the easing, it never stays where you are out of sight (a jamb swinging in as you turn): it comes in to the
  // place found above that sees you, only ever in, never jumping out
  if (!seesMe(_cp.x, _cp.y, _cp.z) && dG < ME.dist){ ME.sh = Math.min(ME.sh, shG, shMax); ME.dist = dG; ME.hold = .2; placeCam(r); }
  /* no room to show you from (your back to a wall, nowhere it can see you from): the camera does not cut to your eyes,
     it glides into them over a quarter of a second, your body fading out as it passes (meStep), and glides back out
     the same way once there has been room behind you for a moment. Only once it is all the way in is it first person. */
  const away = Math.hypot(_cp.x - P.x, _cp.y - (P.eye + .05), _cp.z - P.z);
  const cramped = away < TPV.minShow || d < TPV.minShow - .05;
  if (cramped){ ME.nearT = .35; }
  else if (d > TPV.minShow + .3) ME.nearT = Math.max(0, ME.nearT - dt);
  const nearWant = ME.nearT > 0;
  if (fresh && nearWant) ME.near = 1;
  else ME.near = clamp(ME.near + (nearWant ? dt : -dt)/TPV.glide, 0, 1);
  // all the way in, it waits at the near end, so that when it comes back out it starts from there, not from wherever
  // the room behind you would have let it be meanwhile
  if (ME.near >= 1) ME.dist = Math.min(ME.dist, TPV.minShow + .1);
  if (!blendFP && ME.near > 0) fpEye(r);
  // gliding between the eye and the orbit (V, and no room), along a line kept clear of whatever is beside it
  const k = e*(1 - sstep(0, 1, ME.near));
  if (k < 1 && k > 0){
    _cp.set(fx + (_cp.x - fx)*k, fy + (_cp.y - fy)*k, fz + (_cp.z - fz)*k);
    const lx = _cp.x - fx, ly = _cp.y - fy, lz = _cp.z - fz, L = Math.hypot(lx, ly, lz);
    if (L > 1e-3){ const t = Math.max(0, Math.min(L, camCast(fx, fy, fz, lx/L, ly/L, lz/L, L + r) - r)); if (t < L) _cp.set(fx + lx/L*t, fy + ly/L*t, fz + lz/L*t); }
    nearPush(_cp, r);
  }
  // (decided by k itself, not by ME.near: within a hair of 1 the eased blend already rounds to the eye)
  ME.tpShown = k > 0;
  cam.position.copy(ME.tpShown ? _cp : _cv);
}

/* a gym set, seen from beside you: the set frames the shot (drill.view(dt, cam)) and says what your body is doing
   (drill.pose(dt): an animateHuman state, plus where the body stands (x, y, z, yaw) when it is not where you do). The
   body stands on the set's own level (a box, a deck); asked to run where it stands (the treadmill), the belt runs
   under its feet at the speed asked for */
const DV = {x:NaN, z:NaN};
export function drillViewStep(dt){
  const D = FLAGS.drill, cam = RT.cam;
  D.view(dt, cam);
  if (!document.body.classList.contains("drillview")){ document.body.classList.add("drillview"); const off = () => { if (!FLAGS.drill || !FLAGS.drill.view) document.body.classList.remove("drillview"); else requestAnimationFrame(off); }; requestAnimationFrame(off); }
  const h = ME.tp, st = D.pose(dt) || {mode:"idle"};
  ME.fp.g.visible = false; h.g.visible = true; meFade(1);
  h.g.position.set(st.x != null ? st.x : P.x, st.y != null ? st.y : P.feet, st.z != null ? st.z : P.z);
  ME.yaw = st.yaw != null ? st.yaw : P.yaw; h.g.rotation.y = ME.yaw + Math.PI;
  const px = h.g.position.x, pz = h.g.position.z, moved = Number.isFinite(DV.x) ? Math.hypot(px - DV.x, pz - DV.z) : 0;
  DV.x = px; DV.z = pz;
  if (st.mode === "move" && st.speed > .3 && dt > 0 && moved < .25*st.speed*dt) st.belt = st.speed;
  const ga = h.groundAt; h.groundAt = null;
  animateHuman(h, dt, st);
  h.groundAt = ga;
  h.g.updateMatrixWorld(true);
  if (D.props) D.props(h);
}

/* ---------- the camera owners ----------
   life-fp: your eyes, or the third-person orbit while it is gliding or shown, under the id life-tp (the same frame:
   viewStep blends the two). drill-view: a gym set's own shot (pushed by the mode drill when the set has one). */
const lifeFrame = dt => { viewStep(dt); meStep(dt); syncTP(); };
const fovNow = () => B.fovSet;
const FP_OWNER = {id:"life-fp", priority:10, frame:lifeFrame, fov:fovNow, near:.1};
const TP_OWNER = {id:"life-tp", priority:11, frame:lifeFrame, fov:fovNow, near:.1};
let tpOn = false;
function syncTP(){ const want = ME.tpShown || ME.camT > 0; if (want !== tpOn){ tpOn = want; if (want) camPush(TP_OWNER); else camPop("life-tp"); } }
export function meCamInit(){ camPush(FP_OWNER); }
// the drill-view owner: a gym set's shot when there is a body to show in it, your own eyes otherwise
export const DRILL_VIEW = {id:"drill-view", priority:30, fov:fovNow, near:.1, frame:dt => { if (ME.tp) drillViewStep(dt); else lifeFrame(dt); }};
