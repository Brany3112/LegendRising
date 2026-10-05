/* ============ LIFE: your first day ============
   A new career's first morning, told once and kept (S.flags, saved the moment each part is done):
     1. FirstTimeIntroductionCompleted — the camera comes in over the city to your block while your uncle talks; a
        football from the street comes through your window (smashed for a day, then taped over with plastic: S.home.win);
        down behind you in third person for your room and floor, and into your own eyes.
     2. upstairs, a neighbour slams their door and the number falls off yours: hold the left button to pick it up,
        click your door to put it back (home.js: it falls off every time the door moves, and that is meant).
     3. ApartmentTutorialCompleted — inside, the camera shows you round the flat (you are not in the picture).
     4. GameplayTutorialCompleted — a page on how your days work, closed with OK; then a marker over the bus stop.
     5. TrainingCenterTutorialCompleted — at the training centre the camera goes round everything you can do there,
        then fades to black and hands you back.
   Leave in the middle of any of it and the part you were in starts again the next time; nothing is lost and nothing is
   shown twice. Every cinematic ends with the camera, the keys, the mouse and the HUD handed back (world.js cineEnd). */
import {bedTierNow} from "./furniture.js";
import {THREE, W, LH} from "./build.js";
import {HOME, APT} from "./home.js";
import {human, animateHuman, lookFor} from "./human.js";

let H = null;
const G = () => (typeof S !== "undefined" ? S : null);
const FL = () => (G() && G().flags) || {};
const OB = () => { const s = G(); if (!s.onb || typeof s.onb !== "object") s.onb = {stage:"intro"}; return s.onb; };
const save = () => H && H.persist(true);
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
export function onboardInit(host){ H = host; }

/* ---------- the screen: bars, the line being said, a card, a skip button, the objective ---------- */
function el(id, cls, parent){
  let e = document.getElementById(id);
  if (!e){ e = document.createElement("div"); e.id = id; if (cls) e.className = cls; (parent || document.getElementById("lifeRoot")).appendChild(e); }
  return e;
}
function uiOn(on){
  el("cineBars", "cine-bars").classList.toggle("on", on);
  const sk = el("cineSkip", "cine-skip");
  if (!sk.dataset.b){ sk.dataset.b = 1; sk.innerHTML = `<button type="button">Skip ▸▸ <kbd>Tab</kbd></button>`; sk.firstChild.addEventListener("click", e => { e.stopPropagation(); skipNow(); }); }
  sk.classList.toggle("on", on);
  if (!on){ subOff(); infoOff(); }
}
const SUB = {res:null, typing:0, full:"", done:false};
function say(who, text, o = {}){
  const box = el("cineSub", "cine-sub");
  if (!box.dataset.b){ box.dataset.b = 1; box.addEventListener("click", () => advance()); }
  box.innerHTML = `${who ? `<b>${esc(who)}</b>` : ""}<p></p>`;
  box.classList.add("on"); box.classList.toggle("you", who === "You" || (G() && who === G().player.name));
  const p = box.querySelector("p");
  clearInterval(SUB.typing); SUB.full = text; SUB.done = false;
  let n = 0;
  return new Promise(res => {
    SUB.res = res;
    const hold = o.hold != null ? o.hold : Math.max(1.6, text.split(/\s+/).length*.22 + 1);
    // the line stays up for its reading time, then goes (unless the next one follows straight on: o.keep)
    const finish = () => { clearInterval(SUB.typing); p.textContent = text; SUB.done = true; SUB.t = setTimeout(() => { if (SUB.res === res){ SUB.res = null; if (!o.keep) box.classList.remove("on"); res(); } }, hold*1000); };
    if (o.instant || matchMedia("(prefers-reduced-motion: reduce)").matches){ finish(); return; }
    SUB.finish = finish;
    SUB.typing = setInterval(() => { n += 2; p.textContent = text.slice(0, n); if (n >= text.length) finish(); }, 26);
  });
}
// a click, Space or Enter: finish the line being typed, or go on to the next
function advance(){
  if (!SUB.res) return;
  if (!SUB.done){ if (SUB.finish) SUB.finish(); return; }
  clearTimeout(SUB.t); const r = SUB.res; SUB.res = null; const b = document.getElementById("cineSub"); if (b) b.classList.remove("on"); r();
}
function subOff(){ const b = document.getElementById("cineSub"); if (b) b.classList.remove("on"); clearInterval(SUB.typing); clearTimeout(SUB.t); if (SUB.res){ const r = SUB.res; SUB.res = null; r(); } }
function info(title, rows, o = {}){
  const c = el("cineInfo", "cine-info");
  c.innerHTML = `${o.eyebrow ? `<span>${esc(o.eyebrow)}</span>` : ""}<h4>${esc(title)}</h4>${rows.map(([k, v]) => `<div class="ci-row"><em>${esc(k)}</em><p>${esc(v)}</p></div>`).join("")}`;
  c.classList.remove("on"); void c.offsetWidth; c.classList.add("on");
}
function infoOff(){ const c = document.getElementById("cineInfo"); if (c) c.classList.remove("on"); }
function bang(text){
  const b = el("cineBang", "cine-bang"); b.textContent = text; b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
}
// the objective line under the clock, with how far it is
const GOAL = {text:"", at:null, marker:null};
function goal(text, at){
  GOAL.text = text || ""; GOAL.at = at || null;
  const g = el("onbGoal", "onb-goal");
  if (!text){ g.classList.remove("on"); return; }
  g.innerHTML = `<i>◆</i><span>${esc(text)}</span><b></b>`; g.classList.add("on");
}
// a sticky how-to at the bottom of the screen (the left-button pick-up)
function hint(html){
  const h = el("onbHint", "onb-hint");
  if (!html){ h.classList.remove("on"); return; }
  h.innerHTML = html; h.classList.add("on");
}
addEventListener("keydown", e => {
  if (!H || !H.cine.on) return;
  const k = e.key;
  if (k === " " || k === "Enter" || k.toLowerCase() === "e"){ e.preventDefault(); e.stopPropagation(); if (!e.repeat) advance(); }
  else if (k === "Tab"){ e.preventDefault(); if (!e.repeat) skipNow(); }
  else if (k === "Escape"){ e.preventDefault(); e.stopPropagation(); }
}, true);

/* ---------- the camera of a shot ---------- */
const CAM = {pos:V(0, 0, 0), look:V(0, 0, -1), anim:null};
function camFrame(dt, cam){
  const a = CAM.anim;
  if (a){
    a.t += dt; const k = Math.min(1, a.t/a.dur), e = a.ease(k);
    if (a.curve){ a.curve.getPoint(e, CAM.pos); a.lookCurve.getPoint(e, CAM.look); }
    else { CAM.pos.lerpVectors(a.p0, a.p1, e); CAM.look.lerpVectors(a.l0, a.l1, e); }
    if (a.fov0 != null){ cam.fov = a.fov0 + (a.fov1 - a.fov0)*e; cam.updateProjectionMatrix(); }
    if (k >= 1){ CAM.anim = null; a.res(); }
  }
  cam.position.copy(CAM.pos); cam.lookAt(CAM.look);
}
function camSet(pos, look){ CAM.anim = null; CAM.pos.copy(pos); CAM.look.copy(look); }
function camTo(pos, look, dur, o = {}){
  return new Promise(res => { CAM.anim = {t:0, dur:Math.max(.01, dur), ease:o.ease || ease, p0:CAM.pos.clone(), p1:pos.clone(), l0:CAM.look.clone(), l1:look.clone(), res, fov0:o.fov != null ? H.cam().fov : null, fov1:o.fov}; });
}
function camPath(points, looks, dur, o = {}){
  return new Promise(res => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal"), lookCurve = new THREE.CatmullRomCurve3(looks, false, "centripetal");
    CAM.anim = {t:0, dur, ease:o.ease || (t => t*t*(3 - 2*t)), curve, lookCurve, res};
  });
}
// where your eyes are, and a point straight ahead of them
function eyePose(){
  const P = H.P, cp = Math.cos(P.pitch);
  const pos = V(P.x, P.eye, P.z), look = V(P.x - Math.sin(P.yaw)*cp*4, P.eye + Math.sin(P.pitch)*4, P.z - Math.cos(P.yaw)*cp*4);
  return {pos, look};
}
function startCine(me, meYaw){
  const c = H.cam(); c.updateMatrixWorld();
  const f = V(0, 0, -1).applyQuaternion(c.quaternion);
  camSet(c.position.clone(), c.position.clone().addScaledVector(f, 4));
  H.cineBegin({frame:camFrame, me, meYaw});
  uiOn(true);
}
function endCine(){
  uiOn(false); hint(null);
  const c = H.cam(); if (c){ c.fov = H.B.fov; c.updateProjectionMatrix(); }
  H.cineEnd(); H.hudReset();
}
// to your eyes and out of the shot, the HUD back
async function backToEyes(dur = 1.2){
  const {pos, look} = eyePose();
  H.cine.me = H.cine.me === "tp" ? "tp" : "hide";
  await camTo(pos, look, dur);
  endCine();
}
// a dip to black and back, for a cut the camera could not fly (through a wall)
function dark(on, ms = 320){
  const f = document.getElementById("lifeFade"); if (!f) return Promise.resolve();
  f.style.transition = `opacity ${ms}ms ease`; f.style.opacity = on ? "1" : "0";
  return wait(ms + 30);
}
const RUN = {tok:0, skip:false};
class Skip extends Error {}
function wait(ms){ const tok = RUN.tok; return new Promise((res, rej) => setTimeout(() => (RUN.skip || tok !== RUN.tok) ? rej(new Skip()) : res(), ms)); }
// anything awaited inside a sequence goes through this, so Skip ends it at once
async function step(p){ const v = await p; if (RUN.skip) throw new Skip(); return v; }
let SKIP_TO = null;
function skipNow(){ if (!H.cine.on || RUN.skip) return; RUN.skip = true; subOff(); if (CAM.anim){ const a = CAM.anim; CAM.anim = null; a.res(); } }
async function sequence(body, finish){
  RUN.tok++; RUN.skip = false;
  try { await body(); }
  catch(e){ if (!(e instanceof Skip)) console.error(e); }
  RUN.skip = false;
  const f = document.getElementById("lifeFade"); if (f && +f.style.opacity > 0){ f.style.transition = "opacity 300ms ease"; f.style.opacity = "0"; }
  try { finish(); } catch(e){ console.error(e); if (H.cine.on) endCine(); }
}

/* ---------- people in the shot ---------- */
let UNCLE = null;
function uncle(x, z, yaw){
  if (UNCLE && UNCLE.g.parent) return UNCLE;
  const look = lookFor("customer", 9071);
  Object.assign(look, {age:54, beard:"beard", hair:"short", hairColor:0x8f8b85, receding:.4});
  look.outfit = {type:"jacket", shirt:0x3b3a36, inner:0xe9e6de, legwear:"trousers", trousers:0x2a2d33, shorts:0x2a2d33, socks:0x222326, shoes:0x2b2016, sole:0x1a1a1a};
  const h = human(look, {lod:false, track:false});
  h.g.position.set(x, .12, z); h.g.rotation.y = yaw + Math.PI;
  H.scene().add(h.g);
  UNCLE = h; UNCLE.talk = 0;
  W.anims.push(dt => { if (UNCLE !== h) return; animateHuman(h, dt, {mode:"idle", look:0}); });
  return h;
}

/* ---------- 1. the city, the window, the room ---------- */
function myWindow(){
  const h = G().home, A = APT[h.door], w = A.x1 - A.x0, x = A.x0 + w*.3, y = h.floor*LH + .9 + .725;
  return {x, y, z:h.door <= 2 ? 3.0 : -9.0, out:h.door <= 2 ? 1 : -1};
}
const ENTR = {x:-9.5, z:5.3};
function smash(){
  const h = G().home, P = HOME.pane;
  h.win = {state:"broken", at:typeof absNow === "function" ? absNow() : 0};
  if (P) P.set("broken");
  H.shake(.05, .3);
  // the glass: bits flying in and out of the frame, falling
  const w = myWindow(), sc = H.scene(), mat = new THREE.MeshStandardMaterial({color:0xc9dbe6, transparent:true, opacity:.7, roughness:.05, side:THREE.DoubleSide, depthWrite:false});
  const bits = [];
  for (let i = 0; i < 22; i++){
    const g = new THREE.BufferGeometry(), s = .03 + Math.random()*.07;
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, s, Math.random()*s, 0, Math.random()*s*.6, s, 0], 3));
    const m = new THREE.Mesh(g, mat); m.position.set(w.x - .25 + Math.random()*.4, w.y - .3 + Math.random()*.6, w.z - w.out*.11);
    const v = V((Math.random() - .5)*2.2, Math.random()*1.6, (Math.random() < .35 ? 1 : -1)*w.out*(.6 + Math.random()*1.6));
    sc.add(m); bits.push({m, v, r:V(Math.random()*9, Math.random()*9, Math.random()*9), t:0});
  }
  W.anims.push(function glass(dt){
    for (const b of bits){ if (!b.m.parent) continue; b.t += dt; b.v.y -= 9.8*dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += b.r.x*dt; b.m.rotation.y += b.r.y*dt;
      if (b.t > 2.2 || b.m.position.y < 0){ sc.remove(b.m); b.m.geometry.dispose(); } }
  });
  save();
}
function footballMesh(){
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
  const c = cv.getContext("2d"); c.fillStyle = "#f4f4f0"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#22262c";
  for (const [x, y] of [[16, 14], [52, 30], [90, 12], [112, 44], [30, 50], [70, 54]]){ c.beginPath(); for (let k = 0; k < 5; k++){ const a = k/5*Math.PI*2; c.lineTo(x + Math.cos(a)*9, y + Math.sin(a)*9); } c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), new THREE.MeshStandardMaterial({map:t, roughness:.5}));
}
// the ball: from a kid's boot in the street, a long arc into the pane, and in onto the floor of your flat
function kick(){
  const w = myWindow(), sc = H.scene(), b = footballMesh(); sc.add(b);
  const p0 = V(15, .3, 12.4), p1 = V(w.x - .12, w.y - .1, w.z - w.out*.05), h = G().home, A = APT[h.door], base = h.floor*LH;
  const p2 = V(w.x + .35, base + .13, w.z - w.out*1.0);
  return new Promise(res => {
    let t = 0, hit = false;
    W.anims.push(function fly(dt){
      if (!b.parent) return;
      t += dt;
      if (!hit){
        const k = Math.min(1, t/1.05);
        b.position.lerpVectors(p0, p1, k); b.position.y += Math.sin(k*Math.PI)*3.2;
        b.rotation.x -= dt*14; b.rotation.y += dt*6;
        if (k >= 1){ hit = true; t = 0; smash(); res(); }
      } else {
        const k = Math.min(1, t/.55);
        b.position.lerpVectors(p1, p2, k); b.position.y += Math.sin(k*Math.PI)*.35*(1 - k);
        b.rotation.x -= dt*8*(1 - k);
      }
    });
  });
}
async function intro(){
  const s = G(), h = s.home, w = myWindow(), name = s.player.name.split(" ")[0];
  OB().stage = "intro";
  if (H.zone() !== "home") H.enterZone("home", "bed");
  H.place({x:ENTR.x, z:ENTR.z, y:.12, yaw:0});
  uncle(ENTR.x + 1.15, ENTR.z - .5, -Math.PI/2 - .35);
  // from black, high over the far end of the street
  const fade = document.getElementById("lifeFade"); if (fade){ fade.style.transition = "none"; fade.style.opacity = "1"; }
  startCine("tp", 0);
  camSet(V(76, 31, 36), V(22, 6, 6));
  await sequence(async () => {
    await step(wait(60));
    if (fade){ fade.style.transition = "opacity 1400ms ease"; fade.style.opacity = "0"; }
    // in over the far end of the street, down between the blocks, round to face your window from across the road
    const fly = camPath([V(76, 31, 36), V(50, 21, 23), V(24, 12.5, 13.5), V(w.x + 6, w.y + 1.2, 13.2), V(w.x + 2.2, w.y + .2, 12.6)],
      [V(22, 6, 6), V(6, 6, 6), V(-4, 6, 3), V(w.x + 1, w.y, w.z), V(w.x, w.y, w.z)], 11);
    await step(wait(1300));
    await step(say("Uncle Nelu", "Hey, nephew, I know you will get big, so I am here to help you.", {hold:1.4}));
    await step(fly);
    say("Uncle Nelu", "I paid your first 3 months of rent and utilities to a really nice...", {hold:9});
    await step(wait(2300));
    // a slow push towards the window as the ball comes in
    camTo(V(w.x + 1.6, w.y - .1, 10.8), V(w.x, w.y, w.z), 2.4, {ease:t => t});
    await step(kick());
    subOff();
    await step(wait(1100));
    await step(say("You", "Really peaceful neighborhood.", {hold:1.4}));
    // down to the street, behind you, in third person
    const P = H.P;
    await step(camTo(V(P.x + .55, P.eye + .35, P.z + 2.7), V(P.x - .1, P.eye - .05, P.z - 1.6), 2.2));
    await step(say("Uncle Nelu", `Your room number is ${h.apt} at floor ${h.floor}.`, {hold:1.6}));
    await step(say("Uncle Nelu", `Go on up, ${name}. I'll be here.`, {hold:1.0}));
  }, () => {
    // whatever happened (watched, skipped, or something went wrong) the world ends up the same
    if (!h.win || h.win.state === "ok") smash();
    s.flags.FirstTimeIntroductionCompleted = true; OB().stage = "door"; save();
    if (H.cine.on){ H.cine.me = "tp"; backToEyesNow(); }
    goal(`Go up to flat ${h.apt} · floor ${h.floor}`, doorPos());
    H.note(`Flat ${h.apt} is on floor ${h.floor}. The stairs are at the back of the lobby.`);
  });
}
function backToEyesNow(){ const {pos, look} = eyePose(); camTo(pos, look, 1.2).then(endCine); }
function doorPos(){ const h = G().home, A = APT[h.door]; return {x:A.door, y:h.floor*LH, z:A.wz - A.s*.6}; }

/* ---------- 2. the slam, the number on the floor ---------- */
function slam(){
  const o = OB(); o.slam = true; save();
  if (HOME.slam) HOME.slam();
  H.shake(.07, .4);
  bang("BANG!");
  H.note("Somebody across the corridor slams their door. Hard.");
  setTimeout(() => { if (HOME.plate) HOME.plate.fall({hard:true}); }, 260);
}
window.lifeOnb = ev => {
  const s = G(); if (!s || !s.flags) return;
  if (ev === "plateFell" && !s.flags.ApartmentTutorialCompleted && !OB().fixed){
    OB().stage = "plate"; save();
    hint(`<span class="oh-mouse click"></span><span><b>Left Click</b> to pick up an object.</span>`);
    goal(`Pick up your room number`, null);
  } else if (ev === "plateFixed" && !s.flags.ApartmentTutorialCompleted){
    OB().fixed = true; OB().stage = "enter"; save();
    hint(null); goal(`Go into your flat`, null);
    H.note("There. Good as new. (Doors in this block shut hard.)");
  }
};
function carryingHint(){
  const c = H.carrying();
  if (OB().stage === "plate" && c && c.id === "plate" && !OB().carryTold){
    OB().carryTold = true;
    hint(`<span class="oh-mouse click"></span><span>Aim at your door and <b>click</b> to put the number back.</span>`);
  }
}

/* ---------- 3. the flat ---------- */
// your flat: its box, and Zv(v), a point v metres in from the corridor wall (the bathroom is the first 2.25 m)
function flatBox(){
  const h = G().home, A = APT[h.door], base = h.floor*LH, z0 = Math.min(A.wz, A.ext), z1 = Math.max(A.wz, A.ext);
  return {A, base, x0:A.x0, x1:A.x1, z0, z1, s:A.s, Dp:Math.abs(A.ext - A.wz), Zv:v => A.wz + A.s*v};
}
function inFlat(){ const b = flatBox(), P = H.P; return P.x > b.x0 + .1 && P.x < b.x1 - .1 && P.z > b.z0 + .2 && P.z < b.z1 - .1 && Math.abs(P.feet - b.base) < .6; }
function spotAt(label){
  if (Array.isArray(label)){ for (const l of label){ const t = spotAt(l); if (t) return t; } return null; }
  const sp = H.spots().find(s => s.label === label || (typeof s.label === "string" && s.label.startsWith(label)));
  if (!sp) return null;
  try { const a = typeof sp.aim === "function" ? sp.aim() : sp.aim; if (a) return V((a[0][0] + a[1][0])/2, (a[0][1] + a[1][1])/2, (a[0][2] + a[1][2])/2); } catch(e){}
  return sp.x != null ? V(sp.x, sp.y || 1.2, sp.z) : null;
}
// a camera inside the room, d metres back from the target towards the middle of the room
function roomView(t, d = 1.9, up = .45){
  const b = flatBox(), c = V((b.x0 + b.x1)/2 + .4, b.base + 1.6, b.Zv(b.Dp*.62));
  const dir = V(c.x - t.x, 0, c.z - t.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
  const p = V(t.x + dir.x*d, Math.max(b.base + 1.35, Math.min(b.base + 2.3, t.y + up + .3)), t.z + dir.z*d);
  p.x = Math.max(b.x0 + .35, Math.min(b.x1 - .35, p.x));
  const v = Math.max(2.45, Math.min(b.Dp - .35, (p.z - b.A.wz)*b.s)); p.z = b.Zv(v);
  return p;
}
async function go(pos, look, dur = 1.5){
  const c = CAM.pos, d = pos.distanceTo(c), dir = pos.clone().sub(c).normalize();
  const clear = d < .05 || H.camCast(c.x, c.y, c.z, dir.x, dir.y, dir.z, d) >= d - .15;
  if (clear){ await step(camTo(pos, look, dur)); return; }
  await step(dark(true)); camSet(pos, look); await step(dark(false));
}
async function tour(){
  const s = G(), h = s.home, b = flatBox(), name = s.player.name.split(" ")[0];
  OB().stage = "tour"; save();
  goal(null); hint(null);
  startCine("hide");
  await sequence(async () => {
    const mid = V((b.x0 + b.x1)/2, b.base + 1.2, b.Zv(b.Dp*.75));
    const corner = V(b.x0 + (b.x1 - b.x0)*.75, b.base + 2.15, b.Zv(2.6));
    await go(corner, mid, 1.6);
    await step(say("Uncle Nelu", `So — here it is. Small, but it's yours. Let me show you around, ${name}.`));
    // what the flat has in it decides what he says about it: a new career's is the worst in the block
    const fx = h.fx || {}, has = id => (fx.furn || []).some(p => p.id === id), bedT = typeof bedTierNow === "function" ? bedTierNow() : 2;
    const fridgeT = (fx.furn || []).map(p => FURN[p.id]).filter(f => f && f.kind === "fridge").map(f => f.tier)[0] || 2;
    const stops = [
      [["Bed", "Mattress"], bedT <= 1 ? "Mattress" : "Bed", [["How", "Hold E for 2 seconds"], ["Gives", "You sleep through the entire day: exactly one day passes"], ["Tap E", "A two-hour nap — or, at night, sleep until 7:00 AM"],
        ...(bedT <= 1 ? [["Better", "A real bed sleeps better — the furniture store next door sells them"]] : [])],
        bedT <= 1 ? "Your bed. Well — a mattress. Hold E for 2 seconds on it to sleep through the entire day. A proper bed would do your legs more good." : "Hold E for 2 seconds to sleep through the entire day."],
      ["Fridge", "Fridge", [["How", "E to open it, E on what you want"], ["Gives", "Energy — some food takes fatigue away too"], ["Keeps", `This one keeps ${Math.round(FRIDGE_KEEP[fridgeT - 1]*100)}% of what food is worth — a better fridge keeps more`], ["Shared", "The fridge in the training centre's gym holds the same food: one stock, two fridges"]],
        fridgeT <= 1 ? "The fridge. It wheezes and it's half rust — food out of it does you half the good. Save up for a better one." : "Your fridge. Eat to keep your energy up — and the fridge in the training centre's gym has the same food in it."],
      ["Curtain", "The store", [["Where", "The Mini Market, on the corner of your street"], ["How", "Take what you want off the shelves, pay at the till"], ["Gives", "Food and drinks, put straight into your fridge at home"]],
        "The Mini Market's on the corner. Whatever you buy there goes straight into your fridge."],
      ["Fridge", "Phone · Foodies", [["How", "Tab for your phone, then Foodies"], ["Gives", "Food delivered to the table in your lobby — or to the shelf inside the gym door, if you order from the training centre"], ["Then", "Left click the bag to pick it up and carry it to a fridge: the food goes in when you get close"]],
        "No time to shop? Order on your phone. The courier leaves the bag on the table downstairs — carry it up to the fridge."],
      ...(has("laptop") ? [["Laptop", "Laptop", [["How", "E at the table"], ["Gives", "Your stats, your skills, your week and your career"]],
        "And the laptop: how you're doing, what's on this week."]]
        : [["Light switch", "No laptop yet", [["For now", "Your phone (Tab) and the hub (Q) have your stats, your week and your career"], ["Later", "The furniture store next to your block sells a laptop — and a table to put it on"]],
        "No table, no chair, no laptop. Your phone will have to do for now."]]),
      fx.bulb === false ? ["Light switch", "No bulb", [["Problem", "The light has no bulb in it"], ["Fix", "Buy a bulb at the furniture store next to your block (€3), bring it home and screw it in"], ["Costs", "Lights left on go on the electricity bill"]],
        "And there's no bulb in the light. The furniture store next door sells them — three euros. Get one before it gets dark."]
      : ["Light switch", "Lights", [["How", "E on the switch by the door"], ["Costs", "Lights left on go on the electricity bill"], ["Also", "The bath eases fatigue (30 min); the bathroom mirror changes your look — the barber across the road does new cuts"]],
        "Switch the light off when you go out. Electricity isn't free — that part's on you."]
    ];
    for (const [label, title, rows, line] of stops){
      const t = spotAt(label); if (!t) continue;
      const lookAt = label === "Curtain" ? V(t.x, t.y - .2, t.z + b.s*2) : t;
      await go(roomView(t, label === "Curtain" ? 1.5 : 1.9), lookAt, 1.5);
      info(title, rows, {eyebrow:"Your flat"});
      await step(say("Uncle Nelu", line));
      infoOff();
    }
    await go(corner, mid, 1.5);
    await step(say("Uncle Nelu", "There it is, have fun in the mansion, nephew. I believe in you.", {hold:2.2}));
  }, () => {
    s.flags.ApartmentTutorialCompleted = true; OB().stage = "guide"; save();
    if (H.cine.on){ const {pos, look} = eyePose(); camTo(pos, look, 1.2).then(() => { endCine(); guide(); }); }
    else guide();
  });
}

/* ---------- 4. how your days work ---------- */
function guide(){
  if (FL().GameplayTutorialCompleted) return busGoal();
  if (typeof lpShow !== "function"){ guideDone(); return; }
  const row = (ic, t, d) => `<div class="gd-row"><i>${ic}</i><div><b>${t}</b><p>${d}</p></div></div>`;
  lpShow("guide", `<div class="gd">${typeof lpHead === "function" ? lpHead("How your days work", "Your first day") : "<h3>How your days work</h3>"}
    <div class="gd-body">
      ${row("⚽", "Team training · 10:00 AM – 4:00 PM", "On training days (Monday to Friday, unless there's a game) the squad trains at the training centre. Be there on time and join the coach on the pitch: XP across your skills, Team Chemistry and the manager's trust. Turning up late or not at all costs you trust. The centre closes at 5:00 PM.")}
      ${row("🏟", "Matches", "Your fixtures are on your phone and on the club computer. On match day go to the training centre and walk out through the tunnel before kick-off.")}
      ${row("🎯", "Training on your own", "Any time the centre is open: skill drills on the pitch (30 min) and gym sets (45 min). Each one trains particular skills. It costs energy and adds fatigue.")}
      ${row("💼", "Work", `Your job — ${myJob().job.name} — is ${JOB_WHERE[jobState().id].how}. Clock in between 7:00 AM and 11:00 PM for a 2- or 4-hour shift: money and job XP, and better jobs as you go — further along the road, then out in ${PLACES.town}. It's JOB on the compass at the top of the screen.`)}
      ${row("🍽", "Food", "Eat from your fridge — at home or in the training centre's gym, it's the same food, and a better fridge keeps more of its goodness. Buy more at the Mini Market, or order Foodies on your phone: the bag is left on the delivery table in your lobby (or the shelf inside the gym door) — pick it up and carry it to a fridge.")}
      ${row("✋", "Your hands", "Left click picks things up. 1 and 2 put what's in your hand in a pocket (and take it out again); G drops it. Bigger things — a furniture box — you carry in both arms.")}
      ${row("🛏", "Rest", "Sleep at night to bring fatigue down; tap E on the bed for a nap, or hold E for 2 seconds to sleep a whole day. A bath or the ice bath helps too.")}
      <details class="gd-more"><summary>${row("👔", "Talk to the manager · the clubhouse", "Find him in his office at the training centre and open the hub (Q). Tap to see what you can talk about.")}</summary>
        <ul><li><b>Playing time</b> — ask why you're on the bench, or for more minutes.</li><li><b>Trust</b> — how much he believes in you, and what moves it: training, attendance, results.</li>
        <li><b>Team status</b> — where you stand in his plans: starter, rotation or impact sub.</li><li><b>Position</b> — ask to play somewhere else in his formation.</li>
        <li><b>Progression</b> — your contract, a pay rise, and what he expects of you next.</li></ul></details>
      ${row("📈", "Progression", "Training and games give XP to your skills and raise your overall. Good games grow your reputation — it opens bigger clubs, better deals, and the barber's own cuts.")}
    </div>
    <div class="gd-foot"><button class="btn" onclick="window.lifeGuideOK()">OK</button></div></div>`, {onClose:() => guideDone()});
}
window.lifeGuideOK = () => { if (typeof lpClose === "function") lpClose(); else guideDone(); };
function guideDone(){
  const s = G(); if (!s || s.flags.GameplayTutorialCompleted) return;
  s.flags.GameplayTutorialCompleted = true; OB().stage = "bus"; save();
  busGoal();
  H.relock();
}
// the stop you take the bus from, wherever you are
const BUS = {home:{x:3, y:.12, z:15.4}, town:{x:-12, y:.12, z:9.4}};
function busGoal(){
  if (FL().TrainingCenterTutorialCompleted || !FL().GameplayTutorialCompleted) return;
  if (H.zone() === "ground"){ if (!H.cine.on) centreTour(); return; }      // (already there)
  const at = BUS[H.zone()] || BUS.home;
  goal("Take the bus to reach your team's training center.", Object.assign({zone:H.zone()}, at));
  marker(at.x, 3.1, at.z);
}
// the objective, for the compass: where it is and which area it is in
window.lifeGoal = () => GOAL.text && GOAL.at ? GOAL.at : null;
// a lime diamond turning over the bus stop, bobbing
function marker(x, y, z){
  if (GOAL.marker && GOAL.marker.parent) return;
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({color:0xc8f060, transparent:true, opacity:.92, depthWrite:false});
  const d = new THREE.Mesh(new THREE.OctahedronGeometry(.28, 0), m); d.scale.set(.75, 1.25, .75); g.add(d);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .7, 32), new THREE.MeshBasicMaterial({color:0xc8f060, transparent:true, opacity:.5, side:THREE.DoubleSide, depthWrite:false}));
  ring.rotation.x = -Math.PI/2; ring.position.y = -y + .14; g.add(ring);
  g.position.set(x, y, z); g.renderOrder = 5; H.scene().add(g); GOAL.marker = g;
  let t = 0;
  W.anims.push(dt => { if (GOAL.marker !== g) return; t += dt; d.rotation.y += dt*1.6; d.position.y = Math.sin(t*2.2)*.12; ring.scale.setScalar(1 + .08*Math.sin(t*3)); });
}
function markerOff(){ if (GOAL.marker){ if (GOAL.marker.parent) GOAL.marker.parent.remove(GOAL.marker); GOAL.marker = null; } }

/* ---------- 5. the training centre ---------- */
function solidAt(x, y, z, m = .3){
  for (const b of H.solids()) if (!b.off && x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && y > b.y0 - m && y < b.y1 + m) return true;
  return false;
}
// a place to film t from: round it at a few distances, out of every wall, with a clear line to it
function bestView(t, pref = 0, rs = [3.4, 4.4, 2.6, 5.5], up = 1.5){
  let best = null, bs = -1e9;
  const outdoor = t.z < 2 || t.z > 17;                 // the pitch and the gate: higher, looking down past the clutter
  for (const r of rs) for (let i = 0; i < 16; i++){
    const a = pref + (i % 2 ? 1 : -1)*Math.ceil(i/2)*Math.PI/8, p = V(t.x + Math.sin(a)*r, t.y + up + (outdoor ? .9 : 0), t.z + Math.cos(a)*r);
    if (solidAt(p.x, p.y, p.z, .6)) continue;
    const d = p.distanceTo(t), dir = t.clone().sub(p).normalize();
    if (H.camCast(p.x, p.y, p.z, dir.x, dir.y, dir.z, d) < d - .4) continue;
    const sc = -Math.abs(Math.ceil(i/2))*.4 - Math.abs(r - 3.6)*.3;
    if (sc > bs){ bs = sc; best = p; }
  }
  return best || V(t.x, t.y + 3, t.z + 4);
}
async function centreTour(){
  const s = G();
  OB().stage = "centre"; save();
  goal(null); markerOff();
  startCine("hide");
  await sequence(async () => {
    camSet(V(-14, 16, 34), V(0, 0, -4));
    await step(dark(false, 500));
    await step(camTo(V(2, 12, 30), V(0, 0, -6), 3.2));
    await step(say("Assistant coach", `Welcome to the training centre, ${s.player.name.split(" ")[0]}. Let me show you where everything is.`));
    const stops = [
      ["Coach", 0, "Team training", [["What", "The day's session with the squad"], ["How", "Find the coach on the pitch and press E · 90 min"], ["Gives", "XP across your skills, Team Chemistry and the manager's trust"], ["When", "Training days, 10:00 AM – 4:00 PM"]],
        "Team training's out here with the coach. Don't be late — the manager notices."],
      ["Shooting accuracy", .4, "Skill drills", [["What", "Shooting, passing, heading and interception drills"], ["How", "Stand on a drill's marker and press E · 30 min"], ["Gives", "Shooting: accuracy + shot power · Passing: pass accuracy · Heading: heading + jumping · Interception: interception"], ["When", "Any time the centre is open"]],
        "The drills — one skill at a time, as often as your legs allow."],
      ["Squat rack", Math.PI*.8, "The gym", [["What", "Strength, jump, speed and endurance sets"], ["How", "E on a machine, then hit the timing"], ["Gives", "Power, jumping, pace and stamina XP"], ["Costs", "Energy, and it adds fatigue · 45 min a set"]],
        "The gym. Power, jumping, pace, stamina — pick your machine."],
      ["Fridge", Math.PI, "Fridge, drinks and water", [["Fridge", "The same food as your fridge at home — eat here, it comes off the same stock"], ["Vending machine", "Drinks and snacks, by card"], ["Water cooler", "A cup of water · −2 fatigue"]],
        "Your food's in the fridge here too. Same food as at home."],
      ["Bench", Math.PI, "Bench", [["How", "Sit down and press E"], ["Gives", "Lets the time pass — wait for training or for a game"]],
        "Early? Sit on the bench and let the clock run."],
      ["The manager", Math.PI*1.1, "The manager's office", [["What", "Talk to the manager"], ["How", "Walk up to him and open the hub (Q)"], ["Gives", "Playing time, trust, your place in the team, your position and your progression"], ["When", "Any day you're here"]],
        "The boss is in the clubhouse. Go and talk to him about your place in the side."],
      ["Club computer", Math.PI*1.2, "Clubhouse", [["Club computer", "Your stats, skills, schedule and career"], ["Ice bath", "20 min · cold, but it takes fatigue out of your legs"]],
        "Club computer, ice bath — look after yourself."],
      ["Bus stop", 0, "Bus home", [["How", "E at the bus stop · 40 min"], ["Gives", "Back to your street, your flat and your job"]],
        "And the bus home is out by the gate. That's it — the rest is up to you."]
    ];
    for (const [label, pref, title, rows, line] of stops){
      const t = spotAt(label); if (!t) continue;
      const p = bestView(t, pref);
      await go(p, t, 1.7);
      info(title, rows, {eyebrow:"Training centre"});
      await step(say("Assistant coach", line));
      infoOff();
    }
    await step(dark(true, 700));
  }, () => {
    s.flags.TrainingCenterTutorialCompleted = true; OB().stage = "done"; save();
    const f = document.getElementById("lifeFade");
    if (f){ f.style.transition = "none"; f.style.opacity = "1"; }
    if (H.cine.on) endCine();
    H.place((H.spawn && H.spawn("bus")) || {x:-13, z:22.5, y:0, yaw:Math.PI*.15});
    setTimeout(() => { if (f){ f.style.transition = "opacity 900ms ease"; f.style.opacity = "0"; } H.relock(); }, 120);
    H.note(`Training starts at 10:00 AM. Until then the gym and the drills are yours.`);
  });
}

/* ---------- the world's calls ---------- */
// startLife: true when the introduction has taken over the start of the day
export function onboardStart(){
  const s = G(); if (!s || !s.flags) return false;
  const f = s.flags;
  if (f.TrainingCenterTutorialCompleted) return false;
  if (!f.FirstTimeIntroductionCompleted){ setTimeout(() => intro(), 250); return true; }
  if (!f.ApartmentTutorialCompleted){
    const h = s.home, o = OB();
    // back to where that part starts: the street outside, or your own corridor
    if (o.fixed || o.slam){ const d = doorPos(); H.place({x:d.x, z:d.z - APT[h.door].s*.6, y:h.floor*LH + .02, yaw:APT[h.door].s > 0 ? Math.PI : 0}); }
    else H.place({x:ENTR.x, z:ENTR.z, y:.12, yaw:0});
    if (o.fixed) goal("Go into your flat", null);
    else if (o.slam && (h.plate === "floor" || h.plate === "carried")){ window.lifeOnb("plateFell"); }
    else goal(`Go up to flat ${h.apt} · floor ${h.floor}`, doorPos());
    return true;
  }
  if (!f.GameplayTutorialCompleted){ setTimeout(guide, 400); return true; }
  busGoal();
  return false;
}
export function onboardZone(zone){
  const s = G(); if (!s || !s.flags || !H) return;
  GOAL.marker = null;                       // (the zone was rebuilt: the old marker went with it)
  if (s.flags.TrainingCenterTutorialCompleted){ goal(null); return; }
  if (zone === "ground" && s.flags.GameplayTutorialCompleted){ goal(null); setTimeout(() => { if (H.zone() === "ground" && !FL().TrainingCenterTutorialCompleted && !H.cine.on) centreTour(); }, 40); }
  else if (zone === "home" && s.flags.GameplayTutorialCompleted) setTimeout(busGoal, 0);
}
let tickT = 0;
export function onboardTick(dt){
  const s = G(); if (!s || !s.flags || s.flags.TrainingCenterTutorialCompleted || !H || H.cine.on) return;
  // how far the objective is
  if (GOAL.at && GOAL.text && (tickT += dt) > .25){
    tickT = 0; const g = document.querySelector("#onbGoal b");
    if (g){ const d = Math.hypot(GOAL.at.x - H.P.x, GOAL.at.z - H.P.z); g.textContent = d > 3 ? `${Math.round(d)} m` : ""; }
  }
  if (!s.flags.FirstTimeIntroductionCompleted || s.flags.ApartmentTutorialCompleted || H.zone() !== "home") return;
  const o = OB(), h = s.home, d = doorPos();
  if (!o.slam && Math.abs(H.P.feet - h.floor*LH) < .7 && Math.hypot(H.P.x - d.x, H.P.z - d.z) < 3.4) slam();
  if (o.stage === "plate") carryingHint();
  if (o.fixed && inFlat()) tour();
}
window.lifeOnboard = {
  // for tests and for anyone who wants to see it again: run a part on its own
  intro:() => intro(), tour:() => tour(), guide:() => guide(), centre:() => centreTour(), skip:() => skipNow(),
  state:() => ({flags:Object.assign({}, FL()), onb:Object.assign({}, OB())})
};
