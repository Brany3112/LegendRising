/* ============ LIFE core: what you aim at, and what you carry ============
   Owner: WP-0A moves it here; WP-G owns it in Stage 1, WP-H2 in Stage 2. Contract: DESIGN 1.2 (hand.js), 1.4.1 (the
   targeting flag, the held item, throwing), 2.2 WP-0A (HOLD, HOLD_GRACE), 3.8.5 (hands-only things are carried in
   both arms), 3.7.4 (lifeOnb "throw").
   What you carry (inv.js): your hand and two pockets. A left click on something you can pick up (a spot of kind "pick":
   its pick() hands over the item) puts it in your hand, if your hand is free. With something in your hand, a left click
   on where it goes (a spot of kind "place" that takes it) puts it there. 1 / 2 pocket it, G throws it. What is in your
   hand is drawn in front of you, low and to the right (a big box: in both arms, in front), or in your right hand in
   third person. */
import {THREE, W} from "../build.js";
import * as INV from "../inv.js";
import {parcelStep} from "../parcels.js";
import {LIFE, P, B, ME, RT, FLAGS, keys} from "./state.js";
import {camCast, surfaceUnder} from "./collide.js";
import {locked, mode} from "./modes.js";
import {camTop} from "./camera.js";
import {note} from "./hud.js";
import {parcelPut} from "./acts.js";

const REACH = 2.5;
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export const takes = (sp, it) => !!it && (typeof sp.takes === "function" ? sp.takes(it) : Array.isArray(sp.takes) ? sp.takes.includes(it.id) : sp.takes === it.id);

/* ---------- what you are looking at ---------- */
function rayBox(o, d, a, b){
  let t0 = 0, t1 = REACH;
  for (let i = 0; i < 3; i++){
    const inv = 1/(d.getComponent(i) || 1e-9);
    let ta = (a[i] - o.getComponent(i))*inv, tb = (b[i] - o.getComponent(i))*inv;
    if (ta > tb){ const q = ta; ta = tb; tb = q; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
/* what you are looking at, within reach. Only what you can see: the ray stops at the first wall, floor, partition or
   closed door in the way (camCast: the drawn geometry and the collision boxes), so nothing is offered through a wall.
   A spot's own body may stand a little proud of its aim box (a fridge's handle, a bed's frame), so what the ray meets
   within SEE_SLACK in front of the box still counts as the spot itself. filter(spot): a mode that only offers some */
const SEE_SLACK = .12;
export function target(filter = null){
  if (locked()) return null;
  const cam = RT.cam;
  cam.updateMatrixWorld();
  cam.getWorldPosition(_o); cam.getWorldDirection(_d);
  // in third person you aim with the crosshair, but reach from where you stand: the ray starts level with your head
  if (ME.tpShown || ME.camT > 0){ const k = (P.x - _o.x)*_d.x + (P.eye - _o.y)*_d.y + (P.z - _o.z)*_d.z; if (k > 0) _o.addScaledVector(_d, k); }
  let best = null, bt = REACH, bbox = null;
  // small things win a near tie: something you can pick up, or the place what is in your hand goes, is what you mean
  // when it lies just in front of (or just behind the front of) something big, like a door
  const PRIO = .35;
  for (const sp of W.spots){
    if (!sp.aim || (sp.when && !sp.when()) || (filter && !filter(sp))) continue;
    if (sp.kind === "place" && !takes(sp, INV.hand())) continue;
    const box = typeof sp.aim === "function" ? sp.aim() : sp.aim;
    const t = rayBox(_o, _d, box[0], box[1]);
    if (t === Infinity) continue;
    const small = sp.kind === "pick" || sp.kind === "place", bestSmall = best && (best.kind === "pick" || best.kind === "place");
    if (small && !bestSmall ? t < bt + PRIO : !small && bestSmall ? t < bt - PRIO : t < bt){ bt = t; best = sp; bbox = box; }
  }
  // (anything further along the same ray is behind the same wall, so the nearest is the only one to check; the
  // collision box of the furniture the spot is part of, a fridge round its shelves, is not in the way of it)
  if (best && camCast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, bt, bbox) < bt - SEE_SLACK) best = null;
  if (best) return best;
  let bd = 1e9;
  for (const sp of W.spots){
    if ((sp.aim && !sp.near) || (sp.when && !sp.when()) || sp.x == null || (filter && !filter(sp))) continue;
    if (Math.abs((sp.y || 1) - (P.feet + 1)) > 2.4) continue;
    const d = Math.hypot(sp.x - P.x, sp.z - P.z);
    if (d < sp.r && d < bd && seesSpot(sp)){ bd = d; best = sp; }
  }
  return best;
}
// the proximity spots (a bench, the bus stop, a drill's marker): within their radius and not behind a wall: a line from
// your eyes to the spot, or to a point above it (the spot itself may sit inside the bench or the shelter), is clear
function seesSpot(sp){
  const sy = sp.y == null ? 1.2 : sp.y;
  for (const y of [sy, Math.max(sy, P.eye)]){
    const dx = sp.x - P.x, dy = y - P.eye, dz = sp.z - P.z, D = Math.hypot(dx, dy, dz);
    if (D < .3) return true;
    if (camCast(P.x, P.eye, P.z, dx/D, dy/D, dz/D, D) >= D - .6) return true;
  }
  return false;
}
export function use(sp){
  const p = document.getElementById("lifePrompt");
  if (p){ p.classList.remove("hit"); void p.offsetWidth; p.classList.add("hit"); }
  if (sp.kind === "drag"){ if (sp.toggle) sp.toggle(); return; }
  if (sp.run) sp.run();
}

/* ---------- holding E (a spot with long: {time, run, label}) ----------
   A tap of E still does what E always did; holding it fills the ring on the prompt and does the long thing when full.
   The ring starts filling after HOLD_GRACE; a release before HOLD_TAP is the tap */
export const HOLD = {sp:null, t:0, done:false};
export const HOLD_GRACE = .15, HOLD_TAP = .35;
export function holdStep(dt){
  const p = document.getElementById("lifePrompt");
  if (HOLD.sp){
    if (!keys.e || locked()) HOLD.sp = null;
    else {
      HOLD.t += dt;
      const k = Math.min(1, Math.max(0, (HOLD.t - HOLD_GRACE)/HOLD.sp.long.time));
      if (p){ p.style.setProperty("--hold", k.toFixed(3)); p.classList.toggle("holding", HOLD.t > HOLD_GRACE); }
      if (k >= 1){ const sp = HOLD.sp; HOLD.sp = null; HOLD.done = true; if (p) p.classList.remove("holding"); sp.long.run(); }
    }
  }
  if (!HOLD.sp && p && p.classList.contains("holding")) p.classList.remove("holding");
  handStep(dt);
  flyStep(dt);
  // a delivery bag on you, brought up to a fridge: the food goes in
  if (!locked()) parcelStep(P, parcelPut);
}

/* ---------- the thing in your hand ---------- */
const HELD = {it:null, mesh:null};
const _ch = new THREE.Vector3(), _cq = new THREE.Quaternion();
export function heldMeshDrop(){ if (HELD.mesh){ if (HELD.mesh.parent) HELD.mesh.parent.remove(HELD.mesh); HELD.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } HELD.mesh = null; HELD.it = null; }
function handStep(){
  const it = INV.hand();
  if (it !== HELD.it){ heldMeshDrop(); HELD.it = it; if (it){ HELD.mesh = INV.itemMesh(it); HELD.mesh.renderOrder = 5; RT.scene.add(HELD.mesh); } }
  const m = HELD.mesh; if (!m) return;
  const cam = RT.cam, d = INV.ITEMS[it.id] || {}, hold = d.hold || {pos:[.2, -.2, -.48], rot:[0, 0, 0]};
  // drawn only while the view is your own (not a cinematic, a gym set's shot, build mode or a match)
  const top = camTop();
  m.visible = top === "life-fp" || top === "life-tp";
  if (ME.tpShown && ME.tp && ME.tp.g.visible){
    // third person: in the right hand, or held out in front for a box
    const h = ME.tp;
    if (d.big || d.twoHands){ _ch.set(0, d.big ? 1.0 : 1.05, d.big ? .42 : .34).applyMatrix4(h.g.matrixWorld); m.position.copy(_ch); m.rotation.set(0, h.g.rotation.y, 0); }
    else { h.bones[11].getWorldPosition(_ch); m.position.copy(_ch); m.position.y -= .04; m.rotation.set(0, h.g.rotation.y, 0); }
    return;
  }
  cam.updateMatrixWorld(); _ch.set(hold.pos[0], hold.pos[1], hold.pos[2]).applyMatrix4(cam.matrixWorld);
  m.position.copy(_ch); cam.getWorldQuaternion(_cq); m.quaternion.copy(_cq);
  // a little sway with the head bob, so it is held rather than glued to the screen
  m.rotateX(hold.rot[0] + B.y*.6); m.rotateY(hold.rot[1]); m.rotateZ(hold.rot[2] + B.x*.4);
}
// a click with the left button on what you are looking at
export function clickUse(){
  const it = INV.hand(), held = FLAGS.held;
  if (held && held.kind === "pick"){
    if (it){ note(INV.pocketable(it) ? `Your hands are full. Press 1 or 2 to pocket the ${INV.itemName(it).toLowerCase()}, or G to put it down.` : `Your hands are full. Press G to put the ${INV.itemName(it).toLowerCase()} down first.`); return true; }
    const got = held.pick(); if (got){ INV.take(got); if (got.hint) note(got.hint); }
    return true;
  }
  if (held && held.kind === "place" && takes(held, it)){
    const from = HELD.mesh ? HELD.mesh.getWorldPosition(new THREE.Vector3()) : null;
    const used = INV.release(); held.place(used, from);
    return true;
  }
  return false;
}

/* ---------- G: throwing it ----------
   What is in your hand goes, tossed a little way in front of you: it flies, bounces off what it hits, rolls to a stop
   on the floor and stays there (S.drops), to be picked up again. Only in plain life */
const FLY = [];
export const flying = () => FLY;
export function throwHand(){
  const it = INV.hand(); if (!it || locked() || mode() !== "life") return;
  const d = INV.ITEMS[it.id] || {}, cam = RT.cam;
  INV.release();
  const m = INV.itemMesh(it); RT.scene.add(m);
  cam.updateMatrixWorld(); cam.getWorldDirection(_d);
  const from = HELD.mesh ? HELD.mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(P.x, P.eye - .3, P.z);
  // never start inside a wall: back along the line to your head if anything is in the way
  const dx = from.x - P.x, dy = from.y - P.eye, dz = from.z - P.z, dl = Math.hypot(dx, dy, dz) || 1;
  const free = camCast(P.x, P.eye, P.z, dx/dl, dy/dl, dz/dl, dl);
  if (free < dl) from.set(P.x + dx/dl*Math.max(0, free - .12), P.eye + dy/dl*Math.max(0, free - .12), P.z + dz/dl*Math.max(0, free - .12));
  m.position.copy(from);
  const sp = d.big ? 1.6 : 3.4, h = Math.hypot(_d.x, _d.z) || 1;
  const v = new THREE.Vector3(_d.x/h*sp*Math.max(.35, h) + P.vx*.5, (d.big ? 1.2 : 2.0) + _d.y*2, _d.z/h*sp*Math.max(.35, h) + P.vz*.5);
  FLY.push({it, m, v, spin:new THREE.Vector3((Math.random() - .5)*8, (Math.random() - .5)*6, (Math.random() - .5)*8), r:d.r || (d.big ? .3 : .06), zone:LIFE.zone, t:0, still:0});
  note(`${INV.itemName(it)} put down. Left click it to pick it back up.`);
  if (typeof window.lifeOnb === "function") window.lifeOnb("throw", {id:it.id, item:it});
}
const _fd = new THREE.Vector3();
function flyStep(dt){
  // (backwards, so one landing, which takes it off the list, never skips the next; no copy of the list every frame)
  for (let i = FLY.length - 1; i >= 0; i--){
    const f = FLY[i];
    f.t += dt;
    const v = f.v; v.y -= 9.8*dt;
    const sp = v.length();
    if (sp > 1e-4){
      _fd.copy(v).divideScalar(sp);
      const want = sp*dt, hit = camCast(f.m.position.x, f.m.position.y, f.m.position.z, _fd.x, _fd.y, _fd.z, want + f.r);
      if (hit < want + f.r){
        // which way did it hit: a floor (falling), or a wall (sideways)?
        const go = Math.max(0, hit - f.r);
        f.m.position.addScaledVector(_fd, go);
        if (_fd.y < -.6){ v.y = -v.y*.28; v.x *= .55; v.z *= .55; f.spin.multiplyScalar(.5); }
        else { v.x = -v.x*.35; v.z = -v.z*.35; if (v.y > 0) v.y *= .5; }
      } else f.m.position.addScaledVector(v, dt);
    }
    // the ground under it (a floor, a step, a stair) or, failing that, the zone's ground
    const g = surfaceUnder(f.m.position.x, f.m.position.y + .02, f.m.position.z);
    const floorY = g != null ? g : 0;
    if (f.m.position.y - f.r*.5 <= floorY && v.y <= 0){
      const fd = INV.ITEMS[f.it.id] || {};
      f.m.position.y = floorY + (fd.big ? 0 : fd.r ? fd.r : f.r*.5);          // (a ball rests on its own radius)
      if (Math.abs(v.y) > 1){ v.y = -v.y*.3; v.x *= .6; v.z *= .6; }
      else { v.y = 0; v.x *= Math.exp(-6*dt); v.z *= Math.exp(-6*dt); }
      f.spin.multiplyScalar(Math.exp(-5*dt));
    }
    f.m.rotation.x += f.spin.x*dt; f.m.rotation.y += f.spin.y*dt; f.m.rotation.z += f.spin.z*dt;
    f.still = Math.hypot(v.x, v.y, v.z) < .15 ? f.still + dt : 0;
    if (f.still > .25 || f.t > 6) flyLand(f);
  }
}
// at rest: lying where it stopped, flat on its side or its base, and it can be picked up
function flyLand(f){
  FLY.splice(FLY.indexOf(f), 1);
  // something from a shop, not paid for, thrown out of the shop: the staff come out for it
  const st = W.store, p = f.m.position;
  if (f.it.unpaid && st && !(p.x > st.x0 && p.x < st.x1 && p.z > st.z0 && p.z < st.z1)){
    RT.scene.remove(f.m); note(`Somebody from the shop comes out and takes the ${INV.itemName(f.it).toLowerCase()} back in. Pay for it first.`);
    return;
  }
  const big = INV.ITEMS[f.it.id] && INV.ITEMS[f.it.id].big;
  f.m.rotation.set(big ? 0 : (f.it.id === "paper" ? Math.PI/2 : 0), f.m.rotation.y, 0);
  const d = {zone:f.zone, x:+f.m.position.x.toFixed(3), y:+f.m.position.y.toFixed(3), z:+f.m.position.z.toFixed(3), ry:+f.m.rotation.y.toFixed(3), rx:+f.m.rotation.x.toFixed(3), item:f.it};
  INV.addDrop(d);
  dropSpot(d, f.m);
}
// a zone left while something is still in the air: it lands where it is
export function flyEnd(){ for (const f of FLY.slice()){ f.m.position.y = Math.max(0, f.m.position.y); flyLand(f); } }
export function dropSpot(d, m){
  m.position.set(d.x, d.y, d.z); m.rotation.set(d.rx || 0, d.ry || 0, 0);
  if (!m.parent) RT.scene.add(m);
  const bb = new THREE.Box3();
  W.spots.push({kind:"pick", drop:d, label:INV.itemName(d.item), get hint(){ return d.item.unpaid ? "Not paid for · left click to pick it up" : "Left click to pick it up"; },
    aim:() => { bb.setFromObject(m); bb.expandByScalar(.06); return [bb.min.toArray(), bb.max.toArray()]; },
    pick(){ W.spots = W.spots.filter(x => x.drop !== d); INV.removeDrop(d); if (m.parent) m.parent.remove(m); return d.item; }});
}
// the things lying about in this zone, put back where they were
export function spawnDrops(){ for (const d of INV.dropsOf(LIFE.zone)) dropSpot(d, INV.itemMesh(d.item)); }
