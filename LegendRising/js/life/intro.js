/* ============ LIFE: the first morning, on film ============
   Owner: WP-H (Stage 1); WP-H2 (Stage 2) for the apartment ball's physics in the kick. Contract: DESIGN 3.7.1 (the
   covered boot: a boot plan, the cine camera owner pushed before the first frame, revealAfterFrames, one cinematic
   clock), 3.7.2 (the order and every line of the four shots, creation and offers after the uncle's line, his last
   lines and his walk off), 3.7.7 (the old tour, the "How your days work" page and the camera-only training-centre
   tour are gone), 1.4.1 (bootPlan, revealAfterFrames), 1.4.2 (the camera owner cine), 3.8.1 (the ball through the
   window is a real thing: inv.js ballDrop).

   A new career opens on black and stays black until the city has been drawn from the camera that will show it
   (startLife covers the screen, this file's boot plan says where to start and from where to warm up, and the screen
   comes up only after two frames from the cinematic's own camera): no frame of the flat, the bed or the HUD is ever
   seen before the film. Then: over the city to your block while your uncle talks, in at your window, a ball from the
   street through the glass, down on the pavement in your own eyes with him. "Tell me about yourself": the creation
   screen and the three clubs (ui/main.js), and back in your eyes for his last lines before he walks off and the day
   is yours (firstday.js teaches it, step by step).

   Everything in the film runs on one clock (CLK), ticked by the cinematic's camera every frame it draws: the camera,
   the ball, the subtitles' typing and how long a line stays up, the fades. A slow machine shows the same film,
   slower; nothing gets out of step. Space, Enter or E finishes a line or moves on, Tab skips to the end. */
import {THREE, W, LH, mat} from "./build.js";
import {HOME, APT} from "./home.js";
import {pieceOf} from "./furniture.js";
import {human, animateHuman, lookFor} from "./human.js";
import * as INV from "./inv.js";
import {dropSpot} from "./core/hand.js";
import {FADE} from "./core/state.js";
import {bootPlan, revealAfterFrames} from "./core/modes.js";
import {fdInit, fdStart, fdZone, fdTick, goal, hint, OB} from "./firstday.js";

let H = null;
const G = () => (typeof S !== "undefined" ? S : null);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
const smooth = k => k <= 0 ? 0 : k >= 1 ? 1 : k*k*(3 - 2*k);
const UNCLE_NAME = "Uncle Nelu";
// where you stand on the pavement in front of your block, and where your uncle stands, facing you
const ENTR = {x:-9.5, z:5.3}, UNC = {x:-8.35, z:4.8};
const AERIAL = {pos:[76, 31, 36], look:[22, 6, 6]};
export function onboardInit(host){ H = host; fdInit(host); }

/* ---------- the cinematic clock ----------
   Advanced by the camera's frame (cineStep calls it every frame drawn while the cinematic owns the camera). The first
   ten frames after the screen comes up count at most 1/30 s each, so the hitch of the first frames costs nothing. */
const CLK = {t:0, clampN:0, timers:[]};
function clkAdvance(dt){
  let d = Math.max(0, dt || 0);
  if (CLK.clampN > 0){ CLK.clampN--; d = Math.min(d, 1/30); }
  CLK.t += d;
  if (CLK.timers.length) for (const w of CLK.timers.slice()) if (CLK.t >= w.at){ CLK.timers.splice(CLK.timers.indexOf(w), 1); w.fire(); }
  return d;
}
const RUN = {tok:0, skip:false};
class Skip extends Error {}
function wait(sec){
  const tok = RUN.tok;
  return new Promise((res, rej) => CLK.timers.push({at:CLK.t + sec, fire:() => (RUN.skip || tok !== RUN.tok) ? rej(new Skip()) : res()}));
}
// anything awaited inside the film goes through this, so Tab ends it at once
async function step(p){ const v = await p; if (RUN.skip) throw new Skip(); return v; }

/* ---------- the screen: bars, the line being said, the skip button, the fade ---------- */
function el(id, cls){
  let e = document.getElementById(id);
  if (!e){ e = document.createElement("div"); e.id = id; if (cls) e.className = cls; (document.getElementById("lifeRoot") || document.body).appendChild(e); }
  return e;
}
function uiOn(on){
  el("cineBars", "cine-bars").classList.toggle("on", on);
  const sk = el("cineSkip", "cine-skip");
  if (!sk.dataset.b){ sk.dataset.b = 1; sk.innerHTML = `<button type="button">Skip <kbd>Tab</kbd></button>`; sk.firstChild.addEventListener("click", e => { e.stopPropagation(); skipNow(); }); }
  sk.classList.toggle("on", on);
  if (!on) subOff();
}
// a line: typed in two characters every 26 ms of the film's clock, then held for its reading time
const SUB = {cur:null};
const holdOf = text => Math.max(1.6, text.split(/\s+/).length*.22 + 1);
function say(who, text, o = {}){
  const box = el("cineSub", "cine-sub");
  if (!box.dataset.b){ box.dataset.b = 1; box.addEventListener("click", () => advance()); }
  box.innerHTML = `${who ? `<b>${esc(who)}</b>` : ""}<p></p>`;
  box.classList.add("on"); box.classList.toggle("you", who === "You");
  if (SUB.cur && SUB.cur.res) SUB.cur.res();
  return new Promise(res => {
    SUB.cur = {text, t0:CLK.t, hold:o.hold != null ? o.hold : holdOf(text), typed:null, n:-1, p:box.querySelector("p"), res, keep:!!o.keep};
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) SUB.cur.t0 = -1e9;
  });
}
function subStep(){
  const c = SUB.cur; if (!c) return;
  const n = Math.min(c.text.length, Math.floor((CLK.t - c.t0)/.026)*2 + 2);
  if (n !== c.n){ c.n = n; c.p.textContent = c.text.slice(0, n); }
  if (n >= c.text.length && c.typed == null) c.typed = CLK.t;
  if (c.typed != null && CLK.t - c.typed >= c.hold) lineDone();
}
function lineDone(){
  const c = SUB.cur; if (!c) return;
  SUB.cur = null;
  if (!c.keep){ const b = document.getElementById("cineSub"); if (b) b.classList.remove("on"); }
  c.res();
}
// a click, Space, Enter or E: finish the line being typed, or go on to the next
function advance(){
  const c = SUB.cur; if (!c) return;
  if (c.typed == null){ c.t0 = -1e9; subStep(); return; }
  lineDone();
}
function subOff(){ const b = document.getElementById("cineSub"); if (b) b.classList.remove("on"); const c = SUB.cur; SUB.cur = null; if (c) c.res(); }
addEventListener("keydown", e => {
  if (!H || !H.cine.on || !INTRO.on || !document.body.classList.contains("life")) return;
  const k = e.key;
  if (k === " " || k === "Enter" || k.toLowerCase() === "e"){ e.preventDefault(); e.stopPropagation(); if (!e.repeat) advance(); }
  else if (k === "Tab"){ e.preventDefault(); e.stopPropagation(); if (!e.repeat) skipNow(); }
  else if (k === "Escape"){ e.preventDefault(); e.stopPropagation(); }
}, true);
// the cover over the world (#lifeFade), driven a frame at a time from the film's clock: no CSS transition
const FD = {from:1, to:1, t0:0, dur:0, res:null};
function fadeSet(v){
  const f = document.getElementById("lifeFade"); if (!f) return;
  f.style.transition = "none"; f.style.opacity = v.toFixed(3); FADE.v = v;
}
function fadeTo(v, dur){
  FD.from = FADE.v; FD.to = v; FD.t0 = CLK.t; FD.dur = Math.max(.001, dur);
  return new Promise(res => { FD.res = res; });
}
function fadeStep(){
  if (!FD.res && FD.t0 === null) return;
  if (FD.res == null) return;
  const k = smooth((CLK.t - FD.t0)/FD.dur);
  fadeSet(FD.from + (FD.to - FD.from)*k);
  if (k >= 1){ const r = FD.res; FD.res = null; r(); }
}

/* ---------- the camera of a shot (the cine owner's frame: core/cine.js cineStep calls it) ---------- */
const CAM = {pos:V(0, 0, 0), look:V(0, 0, -1), anim:null};
function camFrame(dt, cam){
  const d = clkAdvance(dt);
  const a = CAM.anim;
  if (a){
    a.t += d; const k = Math.min(1, a.t/a.dur), e = a.ease(k);
    if (a.curve){ a.curve.getPoint(e, CAM.pos); a.lookCurve.getPoint(e, CAM.look); }
    else { CAM.pos.lerpVectors(a.p0, a.p1, e); CAM.look.lerpVectors(a.l0, a.l1, e); }
    if (k >= 1){ CAM.anim = null; a.res(); }
  }
  kickStep(d);
  subStep(); fadeStep();
  cam.position.copy(CAM.pos); cam.lookAt(CAM.look);
}
function camSet(pos, look){ if (CAM.anim){ const a = CAM.anim; CAM.anim = null; a.res(); } CAM.pos.copy(pos); CAM.look.copy(look); }
function camTo(pos, look, dur, o = {}){
  if (CAM.anim){ const a = CAM.anim; CAM.anim = null; a.res(); }
  return new Promise(res => { CAM.anim = {t:0, dur:Math.max(.01, dur), ease:o.ease || ease, p0:CAM.pos.clone(), p1:pos.clone(), l0:CAM.look.clone(), l1:look.clone(), res}; });
}
function camPath(points, looks, dur, o = {}){
  if (CAM.anim){ const a = CAM.anim; CAM.anim = null; a.res(); }
  return new Promise(res => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal"), lookCurve = new THREE.CatmullRomCurve3(looks, false, "centripetal");
    CAM.anim = {t:0, dur, ease:o.ease || (t => t*t*(3 - 2*t)), curve, lookCurve, res};
  });
}
// a cut the camera cannot fly (through a wall): to black and back, on the film's clock
async function go(pos, look, dur = 1.5){
  const c = CAM.pos, d = pos.distanceTo(c), dir = pos.clone().sub(c).normalize();
  const clear = d < .05 || H.camCast(c.x, c.y, c.z, dir.x, dir.y, dir.z, d) >= d - .15;
  if (clear){ await step(camTo(pos, look, dur)); return; }
  await step(fadeTo(1, .32)); camSet(pos, look); await step(fadeTo(0, .32));
}

/* ---------- people in the shot ---------- */
let UNCLE = null;
function uncle(){
  if (UNCLE && UNCLE.g.parent) return UNCLE;
  const look = lookFor("customer", 9071);
  Object.assign(look, {age:54, beard:"beard", hair:"short", hairColor:0x8f8b85, receding:.4});
  look.outfit = {type:"jacket", shirt:0x3b3a36, inner:0xe9e6de, legwear:"trousers", trousers:0x2a2d33, shorts:0x2a2d33, socks:0x222326, shoes:0x2b2016, sole:0x1a1a1a};
  const h = human(look, {lod:false, track:false});
  // facing you
  const yaw = Math.atan2(-(ENTR.x - UNC.x), -(ENTR.z - UNC.z));
  h.g.position.set(UNC.x, .12, UNC.z); h.g.rotation.y = yaw + Math.PI;
  H.scene().add(h.g);
  UNCLE = h; h.walk = 0;
  W.anims.push(function uncleStep(dt){
    if (UNCLE !== h || !h.g.parent) return;
    if (h.walk > 0){
      // off down the street, on the pavement, out of your life until you call him
      // (along the pavement in front of the block, a step's width off the wall and clear of you)
      const p = h.g.position, tx = -30, tz = 4.0, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < .2 || (h.walkT = (h.walkT || 0) + dt) > 40){ H.scene().remove(h.g); h.dispose && h.dispose(); if (UNCLE === h) UNCLE = null; return; }
      const sp = Math.min(h.walk, (h.walkT || 0)*1.6);
      p.x += dx/d*sp*dt; p.z += dz/d*sp*dt;
      const want = Math.atan2(-dx, -dz) + Math.PI; let r = want - h.g.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r));
      h.g.rotation.y += r*(1 - Math.exp(-6*dt));
      animateHuman(h, dt, {mode:"move", speed:sp, look:0});
    } else animateHuman(h, dt, {mode:"idle", look:0});
  });
  return h;
}

/* ---------- your window, the glass, the ball ---------- */
function myWindow(){
  const h = G().home, A = APT[h.door], w = A.x1 - A.x0, x = A.x0 + w*.3, y = h.floor*LH + .9 + .725;
  return {x, y, z:h.door <= 2 ? 3.0 : -9.0, out:h.door <= 2 ? 1 : -1};
}
// where the ball comes to rest inside your flat: under the window it came through (home.js knows the spot)
function ballRestAt(){ if (HOME.ballRest) return HOME.ballRest(); const w = myWindow(), h = G().home; return {x:w.x + .35, y:h.floor*LH + .13, z:w.z - w.out*1.0}; }
function smash(fx = true){
  const h = G().home, P = HOME.pane;
  if (!h.win || h.win.state === "ok") h.win = {state:"broken", at:typeof absNow === "function" ? absNow() : 0};
  if (P) P.set("broken");
  if (!fx) return;
  // the glass: bits flying in and out of the frame, falling
  const w = myWindow(), sc = H.scene(), shard = mat({color:0xc9dbe6, transparent:true, opacity:.7, roughness:.05, side:THREE.DoubleSide, depthWrite:false});
  const bits = [];
  for (let i = 0; i < 22; i++){
    const g = new THREE.BufferGeometry(), s = .03 + Math.random()*.07;
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, s, Math.random()*s, 0, Math.random()*s*.6, s, 0], 3));
    const m = new THREE.Mesh(g, shard); m.position.set(w.x - .25 + Math.random()*.4, w.y - .3 + Math.random()*.6, w.z - w.out*.11);
    const v = V((Math.random() - .5)*2.2, Math.random()*1.6, (Math.random() < .35 ? 1 : -1)*w.out*(.6 + Math.random()*1.6));
    sc.add(m); bits.push({m, v, r:V(Math.random()*9, Math.random()*9, Math.random()*9), t:0});
  }
  W.anims.push(function glass(dt){
    for (const b of bits){ if (!b.m.parent) continue; b.t += dt; b.v.y -= 9.8*dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += b.r.x*dt; b.m.rotation.y += b.r.y*dt;
      if (b.t > 2.2 || b.m.position.y < 0){ sc.remove(b.m); b.m.geometry.dispose(); } }
  });
}
// the football from a kid's boot in the street: a long arc into the pane, and in onto the floor of your flat, where
// it is a real thing from then on (inv.js ballDrop: lying in your flat, to be picked up and moved)
const KICK = {on:null};
function kick(){
  const w = myWindow(), b = INV.itemMesh({id:"ball"}); H.scene().add(b);
  const p0 = V(15, .3, 12.4), p1 = V(w.x - .12, w.y - .1, w.z - w.out*.05), r = ballRestAt(), p2 = V(r.x, r.y, r.z);
  b.position.copy(p0);
  return new Promise(res => { KICK.on = {b, p0, p1, p2, t:0, hit:false, res, given:!!G().home.ballGiven}; });
}
function kickStep(d){
  const k = KICK.on; if (!k) return;
  k.t += d;
  if (!k.hit){
    const u = Math.min(1, k.t/1.05);
    k.b.position.lerpVectors(k.p0, k.p1, u); k.b.position.y += Math.sin(u*Math.PI)*3.2;
    k.b.rotation.x -= d*14; k.b.rotation.y += d*6;
    if (u >= 1){ k.hit = true; k.t = 0; smash(true); H.shake(.05, .3); k.res(); if (k.given){ H.scene().remove(k.b); KICK.on = null; } }
  } else {
    const u = Math.min(1, k.t/.55);
    k.b.position.lerpVectors(k.p1, k.p2, u); k.b.position.y += Math.sin(u*Math.PI)*.35*(1 - u);
    k.b.rotation.x -= d*8*(1 - u);
    if (u >= 1){ KICK.on = null; ballRest(k.b); }
  }
}
// the ball lies where it stopped: a drop in your flat (once: a career that has its ball keeps that one)
function ballRest(mesh = null){
  const h = G().home;
  if (KICK.on){ if (KICK.on.b.parent) KICK.on.b.parent.remove(KICK.on.b); KICK.on = null; mesh = null; }
  if (h.ballGiven){ if (mesh && mesh.parent) mesh.parent.remove(mesh); return; }
  const r = ballRestAt(), d = INV.ballDrop("home", r.x, r.y, r.z);
  if (d && H.zone() === "home") dropSpot(d, mesh || INV.itemMesh(d.item));
}

/* ---------- the film ---------- */
const INTRO = {on:false, shots:false, waiting:false};
export const introPose = () => ({x:ENTR.x, z:ENTR.z, y:.12, yaw:Math.atan2(-(UNC.x - ENTR.x), -(UNC.z - ENTR.z))});
// your eyes on the pavement, looking at your uncle's face
function povPose(){
  const e = .12 + (H.eye ? H.eye() : 1.62);
  return {pos:V(ENTR.x, e, ENTR.z), look:V(UNC.x, .12 + 1.6, UNC.z)};
}
function startCine(){
  H.cineBegin({frame:camFrame, me:"hide", meYaw:introPose().yaw});
  uiOn(true);
}
function endCine(){
  uiOn(false);
  H.cineEnd(); H.hudReset();             // (the field of view goes back with the camera's owner, core/camera.js)
}
// the shots' key camera poses, drawn once behind the cover before the film starts
function keyPoses(){
  const gp = glassPose(), sp = smashPose(), pov = povPose();
  return [{pos:V(...AERIAL.pos), look:V(...AERIAL.look)}, {pos:V(24, 12.5, 13.5), look:V(-4, 6, 3)}, {pos:gp.pos, look:gp.look}, sp, pov];
}
/* Everything a shot will show is uploaded now, behind the cover: one frame with nothing culled (every mesh's buffers
   on the GPU), then one from each key pose of the film. Without it the first frames of the flight are the ones that
   upload the city, and stall. (Programs and textures were compiled and uploaded by startLife's warm-up) */
function warmIntro(){
  const r = H.renderer(), sc = H.scene(), cam = H.cam(); if (!r || !sc || !cam) return;
  const off = [];
  sc.traverse(o => { if ((o.isMesh || o.isLine || o.isPoints) && o.frustumCulled){ o.frustumCulled = false; off.push(o); } });
  const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
  try {
    keyPoses().forEach((k, i) => {
      if (i === 1) for (const o of off) o.frustumCulled = true;
      cam.position.copy(k.pos); cam.lookAt(k.look); cam.updateMatrixWorld();
      r.render(sc, cam);
    });
  } catch(e){ console.error(e); }
  finally { for (const o of off) o.frustumCulled = true; cam.position.copy(p0); cam.quaternion.copy(q0); }
}
/* shot 2 looks in through whichever of your two windows is nearer the three things it is about: the mattress on the
   floor, the fridge, the bare flex with no bulb (furniture.js and home.js put them where they are; this finds them).
   The camera ends 10 cm off the glass, where the window's reveal still lets all three into the picture */
function roomThings(){
  const h = G().home, A = APT[h.door], base = h.floor*LH, pts = [];
  for (const k of ["bed", "fridge"]){ const q = pieceOf(k); if (q && isFinite(q.wx)) pts.push([q.wx, q.wz]); }
  const b = HOME.light && HOME.light.bulb; if (b) pts.push([b.position.x, b.position.z]);
  if (!pts.length) pts.push([(A.x0 + A.x1)/2, (A.wz + A.ext)/2]);
  return {x:pts.reduce((a, p) => a + p[0], 0)/pts.length, z:pts.reduce((a, p) => a + p[1], 0)/pts.length, base};
}
function viewWindow(){
  const h = G().home, A = APT[h.door], w = A.x1 - A.x0, t = roomThings(), m = myWindow();
  const x = [A.x0 + w*.3, A.x0 + w*.7].sort((a, b) => Math.abs(a - t.x) - Math.abs(b - t.x))[0];
  return {x, y:m.y, z:m.z, out:m.out, t};
}
function glassPose(){
  const v = viewWindow(), t = v.t;
  return {pos:V(v.x, t.base + 1.5, v.z + v.out*.1), from:V(v.x - (t.x - v.x)*.35, t.base + 2.1, v.z + v.out*3.2),
    win:V(v.x, v.y - .2, v.z), look:V(t.x, t.base + 1.1, t.z)};
}
/* shot 3: back out on the street, beside the window that breaks, the ball coming in from the road on the right */
function smashPose(){
  const w = myWindow(), v = viewWindow(), sg = Math.sign(v.x - w.x) || 1;
  return {pos:V(w.x + sg*1.3, w.y + .375, w.z + w.out*1.6), look:V(w.x - sg*.2, w.y - .225, w.z - w.out*.4)};
}
const needsCreation = () => { const s = G(); return !!(s && s.flags && s.flags.CharacterCreated === false); };
const signed = () => typeof myClub === "function" && !!myClub();

async function intro(){
  const s = G(); if (!s || !H) return;
  INTRO.on = true; INTRO.shots = true; INTRO.waiting = false;
  RUN.tok++; RUN.skip = false;
  s.onb = Object.assign(OB() || {}, {v:2, step:"intro"});
  // on the pavement in front of your block (the boot plan put you there; a replay puts you there now)
  if (H.zone() !== "home") H.enterZone("home", introPose(), {cam:{pos:AERIAL.pos, look:AERIAL.look}});
  else H.place(introPose());
  uncle();
  // the camera is the film's before anything is drawn (cine.js pushes the owner cine)
  startCine();
  camSet(V(...AERIAL.pos), V(...AERIAL.look));
  warmIntro();
  // black until two frames have been presented from this camera, then up over 1.4 s on the film's clock
  await revealAfterFrames(2);
  CLK.clampN = 10; FD.res = null; fadeSet(1);
  fadeTo(0, 1.4);
  const gp = glassPose(), sp = smashPose(), w = gp.win;
  try {
    // 1. over the far end of the street, down between the blocks, round to face your window from across the road
    const fly = camPath([V(...AERIAL.pos), V(50, 21, 23), V(24, 12.5, 13.5), V(w.x + 5.5, w.y + 1.6, w.z + (gp.from.z - w.z)*3), gp.from],
      [V(...AERIAL.look), V(6, 6, 6), V(-4, 6, 3), V(w.x + 1, w.y, w.z), w], 11);
    await step(wait(1.3));
    await step(say(UNCLE_NAME, "Hey, nephew. I always said you'd make it big one day, so here I am, helping."));
    await step(fly);
    // 2. in at the glass: the mattress, the rusty fridge, the bare flex with no bulb in it
    const push = camTo(gp.pos, gp.look, 2.5, {ease:t => 1 - Math.pow(1 - t, 2)});
    await step(say(UNCLE_NAME, "I've paid your first three months, rent and bills. It's small, but it's yours."));
    await step(push);
    // 3. cut to the street beside the other window; a kick from the road, out of the picture; the window goes; the
    // ball rolls in and stops
    camSet(sp.pos, sp.look);
    await step(wait(.3));
    await step(kick());
    await step(wait(.35));
    say("Voice from the street", "Sorry!", {hold:1.2});
    await step(wait(1.8));
    // 4. down on the pavement, in your own eyes, with your uncle
    const pov = povPose();
    await go(pov.pos, pov.look);
    await step(say("You", "Really peaceful neighbourhood."));
    await step(say(UNCLE_NAME, "It's got character. Now, the clubs will want to know who they're getting. Tell me about yourself."));
  } catch(e){ if (!(e instanceof Skip)) console.error(e); }
  RUN.skip = false;
  INTRO.shots = false;
  // whatever happened (watched, skipped, or something went wrong) the world ends up the same: the window broken, the
  // ball on your floor, you on the pavement looking at him
  smash(false); ballRest(); subOff();
  const pov = povPose(); camSet(pov.pos, pov.look);
  await fadeTo(1, .6);
  if (needsCreation() || !signed()){
    // the creation screen and the offers (ui/main.js): the world stops behind them, and comes back after you sign
    INTRO.waiting = true;
    if (typeof window.onbCreation === "function") window.onbCreation();
    return;
  }
  afterSign();
}

/* after you have signed: back in your eyes on the pavement, his last lines, and the day is yours */
async function afterSign(){
  const s = G(); if (!s || !H) return;
  INTRO.waiting = false; INTRO.on = true;
  RUN.tok++; RUN.skip = false;
  fadeSet(1);
  const lr = document.getElementById("lifeRoot"); if (lr) lr.style.display = "block";
  document.body.classList.add("life", "cine");
  if (window.resumeLife) window.resumeLife();
  // your own body from now on, the one you made (look.js bodyLook of S.player.look)
  if (window.lifeLookChanged) window.lifeLookChanged();
  if (H.zone() !== "home") H.enterZone("home", introPose()); else H.place(introPose());
  uncle();
  if (!H.cine.on) startCine(); else uiOn(true);
  const pov = povPose(); camSet(pov.pos, pov.look);
  await revealAfterFrames(2);
  CLK.clampN = 10; FD.res = null; fadeSet(1);
  fadeTo(0, .8);
  const h = s.home, c = typeof myClub === "function" ? myClub() : null, first = String(s.player.name || "").trim().split(/\s+/)[0] || "";
  const start = typeof SESSION === "object" ? SESSION.start : 600;
  try {
    await step(wait(.5));
    await step(say(UNCLE_NAME, `${c ? c.nm : "Your club"}. Good choice. They want you at the training centre at ${fmtTime(start)}.`));
    await step(say(UNCLE_NAME, `Your flat is ${h.apt}, on floor ${h.floor}. Go on up${first ? `, ${first}` : ""}. Call me if you need anything.`));
  } catch(e){ if (!(e instanceof Skip)) console.error(e); }
  RUN.skip = false;
  if (FD.res){ const r = FD.res; FD.res = null; fadeSet(0); r(); } else fadeSet(0);
  // he goes off down the street; the day is yours
  if (UNCLE) UNCLE.walk = 1.3;
  s.flags.FirstTimeIntroductionCompleted = true;
  s.onb = Object.assign(OB() || {}, {v:2, step:"H1"});
  INTRO.on = false;
  endCine();
  if (H.persist) H.persist(true);
  fdStart();
  H.relock();
}
// Tab: to the end of the film (a dark cut, never a camera move through the buildings)
function skipNow(){
  if (!INTRO.shots || RUN.skip) return;
  RUN.skip = true; subOff();
  for (const w of CLK.timers.splice(0)) w.fire();
  if (CAM.anim){ const a = CAM.anim; CAM.anim = null; a.res(); }
  if (KICK.on){ const k = KICK.on; KICK.on = null; if (!k.hit){ k.hit = true; smash(false); k.res(); } if (k.b.parent) k.b.parent.remove(k.b); }
  if (FD.res){ const r = FD.res; FD.res = null; r(); }
}
// the New Game is abandoned on the creation screen (back to the title): the film's state goes with it
function abort(){
  INTRO.on = INTRO.shots = INTRO.waiting = false;
  RUN.tok++; RUN.skip = false; CLK.timers.length = 0; KICK.on = null; FD.res = null;
  if (H && H.cine.on) H.cineEnd();
  uiOn(false); goal(null); hint(null);
  if (UNCLE && UNCLE.g.parent) UNCLE.g.parent.remove(UNCLE.g);
  UNCLE = null;
}

/* ---------- the world's calls (world.js) ---------- */
// the start of a life whose introduction has not been seen: the film, from black, nothing of the flat first
bootPlan(opts => {
  const s = G(); if (!s || !s.flags) return null;
  OB();
  if (s.flags.FirstTimeIntroductionCompleted) return null;
  return {zone:"home", at:introPose(), cover:true, cam:{pos:AERIAL.pos.slice(), look:AERIAL.look.slice()}};
});
// startLife, once the loop is running: true when the first day has taken over the start
export function onboardStart(){
  const s = G(); if (!s || !s.flags || !H) return false;
  OB();
  if (!s.flags.FirstTimeIntroductionCompleted){ intro(); return true; }
  fdStart();
  if (s.onb.step !== "done"){ if (H.mailNews) H.mailNews(); return true; }
  return false;
}
export function onboardZone(zone){
  if (!H) return;
  if (zone !== "home" && UNCLE) UNCLE = null;      // (the zone was rebuilt: he went with it)
  fdZone(zone);
}
export function onboardTick(dt){ if (H) fdTick(dt); }

window.lifeOnboard = {
  // ui/main.js: the creation screen and the offers are done (A.sign in a new career): back into the world
  afterSign:() => afterSign(),
  waiting:() => INTRO.waiting,
  abort:() => abort(),
  // for tests: play the film again, skip it, and what state the first day is in
  intro:() => intro(), skip:() => skipNow(), playing:() => INTRO.on,
  state:() => ({flags:Object.assign({}, (G() && G().flags) || {}), onb:JSON.parse(JSON.stringify((G() && G().onb) || {})), clock:CLK.t})
};
