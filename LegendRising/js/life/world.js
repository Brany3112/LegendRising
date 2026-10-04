/* ============ LIFE: the first-person world ============
   Your flat in a brick block, a few streets you cannot leave, the bus to the training ground, a
   gym, and the tunnel that hands you to the top-down match. No people yet — this build is about
   whether walking around your life feels right. */
import {THREE, W, begin} from "./build.js";
import {buildHome, homeTick, homeRefresh, resetHome, HOME, drawMail, refreshFridge, bedTier} from "./home.js";
import {buildGround} from "./ground.js";
import {ensureHome, checkMail, openMail, closeMail, mailOpen} from "./rent.js";

const G = () => (typeof S !== "undefined" ? S : null);
export const LIFE = {min:7*60, day:1, zone:"home", trained:0, late:false, running:false};
const TRAIN_AT = 10*60, BUS_MIN = 40;
const clockText = (m = LIFE.min) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(Math.floor(m)%60).padStart(2,"0")}`;
const euro = n => "€" + Math.round(n).toLocaleString("en-GB");

/* ---------- renderer and the sky ---------- */
let scene, cam, renderer, sun, hemi, raf = null, modal = false;
function lights(){
  sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(30, 46, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .035;
  const s = sun.shadow.camera; s.left = -62; s.right = 62; s.top = 62; s.bottom = -62; s.far = 170;
  sun.target.position.set(4, 0, 6);
  scene.add(sun, sun.target);
  hemi = new THREE.HemisphereLight(0xc4dcff, 0x9a9184, 1.2);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xc8d8e8, 60, 170);
}
const DAY = new THREE.Color(0xbcd3ea), DUSK = new THREE.Color(0xe8a774), NIGHT = new THREE.Color(0x0c1424), _sky = new THREE.Color();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };
let lastSkyMin = -1;
function sky(){
  if (Math.abs(LIFE.min - lastSkyMin) < 1) return; lastSkyMin = LIFE.min;
  const h = (LIFE.min/60) % 24;
  const d = smooth(5.5, 8, h)*(1 - smooth(18.5, 21, h));
  const dusk = Math.max(0, 1 - Math.abs(h - 19.2)/1.6) + Math.max(0, 1 - Math.abs(h - 6.6)/1.2);
  _sky.copy(NIGHT).lerp(DAY, d).lerp(DUSK, Math.min(.5, dusk*.5));
  scene.background = _sky.clone(); scene.fog.color.copy(_sky);
  sun.intensity = .08 + 2.1*d; sun.color.setHex(dusk > .2 ? 0xffc28a : 0xfff0d8);
  hemi.intensity = .22 + 1.0*d;
  if (W.lit) W.lit.emissiveIntensity = (1 - d)*1.6;
}

/* ---------- the clock ---------- */
function pass(mins){
  LIFE.min += mins;
  while (LIFE.min >= 24*60){ LIFE.min -= 24*60; LIFE.day++; }
  const s = G();
  if (s && s.home && s.home.light) s.home.lightMin = (s.home.lightMin || 0) + mins;
  if (s){ s.life = s.life || {}; s.life.day = LIFE.day; s.life.min = LIFE.min; }
  if (LIFE.zone === "ground" && LIFE.min > TRAIN_AT + 15 && LIFE.min < 20*60 && !LIFE.late && !LIFE.trained){
    LIFE.late = true;
    if (s) s.trust = Math.max(-30, (s.trust || 0) - 4);
    note("You are late for training. The manager noticed.");
  }
}
const persist = () => { const s = G(); if (s && typeof save === "function"){ s.life = {day:LIFE.day, min:LIFE.min}; save(); } };

/* ---------- what you can do ---------- */
function sleep(){
  const s = G(); if (!s) return;
  const m = LIFE.min % 1440, night = m >= 19*60 || m < 5*60;
  const gain = Math.round([45, 60, 75][bedTier()]*(typeof energyMult === "function" ? energyMult() : 1));
  fade(() => {
    if (night){
      pass((7*60 - m + 1440) % 1440);
      s.energy = Math.min(100, s.energy + gain); LIFE.trained = 0; LIFE.late = false;
      note(`Day ${LIFE.day}. You slept until seven · +${gain} energy. Training is at ten.`);
    } else {
      pass(120); s.energy = Math.min(100, s.energy + 8);
      note(`A two-hour nap · +8 energy · ${clockText()}`);
    }
    persist();
  }, 1800);
}
function eat(id, name, gain){
  const s = G(); if (!s || !s.inv[id]) return;
  if (s.energy >= 99) return note("You are not hungry.");
  const g = Math.round(gain*(typeof energyMult === "function" ? energyMult() : 1));
  s.inv[id]--; s.energy = Math.min(100, s.energy + g); pass(10);
  refreshFridge(); persist();
  note(`${name} · +${g} energy`);
}
function bus(to){
  fade(() => {
    pass(BUS_MIN);
    enterZone(to, "bus");
    if (to === "ground"){
      const d = Math.round(TRAIN_AT - LIFE.min);
      const span = m => m >= 60 ? `${Math.floor(m/60)}h${m%60 ? " " + (m%60) + "m" : ""}` : `${m} minutes`;
      note(d > 0 ? `You get there at ${clockText()} — ${span(d)} before training. The bench will pass the time.`
         : LIFE.min < 20*60 ? `You get there at ${clockText()}. Training started ${span(-d)} ago.` : `${clockText()}. Everyone has gone home.`);
    } else note(`Home at ${clockText()}. Your block is across the road.`);
    persist();
  }, 1100);
}
function bench(){
  if (LIFE.min >= TRAIN_AT) return note("Training has already started.");
  fade(() => { pass(TRAIN_AT - LIFE.min); note("You sit it out. It is ten o'clock."); });
}
function train(name, skill){
  const s = G(); if (!s) return;
  const cost = 14;
  if (s.energy < cost) return note("Too tired to train. Eat something or sleep.");
  if (LIFE.min < TRAIN_AT - 60) return note(`Too early. The session is at ${clockText(TRAIN_AT)}.`);
  if (LIFE.min > 20*60) return note("The gym is closed for the night.");
  fade(() => {
    s.energy -= cost; LIFE.trained++;
    if (typeof skillXP === "function") skillXP(skill, LIFE.late ? 34 : 60);
    pass(90); persist();
    note(`${name}: ${skill} +${LIFE.late ? "34" : "60"} xp · −${cost} energy · ${clockText()}`);
  }, 700);
}
function toMatch(){
  const info = matchToday();
  if (!info.ok){ tunnelGo = false; return note(info.why); }
  stop();
  const o = document.getElementById("lifeFade");
  o.style.transition = "opacity .9s ease"; o.style.opacity = "1";
  setTimeout(() => {
    document.getElementById("lifeRoot").style.display = "none";
    try { if (typeof A === "object" && A.playMatch) A.playMatch(); } catch(e){ console.error(e); }
    o.style.transition = "opacity .8s ease"; o.style.opacity = "0"; delete o.dataset.tun;
    // if no match started, never leave you staring at a black screen
    if (!document.body.classList.contains("in-match")){
      tunnelGo = false; resumeLife(); place({x:0, z:-21, y:0, yaw:Math.PI});
      note("The match couldn't start. Open the hub (Q) to see what's on this week.");
    }
  }, 950);
}
function drink(id){
  const s = G(); if (!s || !s.inv[id]) return;
  if (s.energy >= 99) return note("You're full of energy already.");
  const g = Math.round((id === "max" ? 60 : 30)*(typeof energyMult === "function" ? energyMult() : 1));
  s.inv[id]--; s.energy = Math.min(100, s.energy + g); pass(2);
  refreshFridge(); persist();
  note(`${id === "max" ? "Energy-UP MAX" : "Energy-UP"} · +${g} energy`);
}
function mail(){
  modal = true; for (const k in keys) keys[k] = false;
  document.exitPointerLock && document.exitPointerLock();
  openMail(() => { modal = false; drawMail(); if (window.lifeRelock) window.lifeRelock(); });
}
window.lifeModal = () => modal;
const ctx = {note, fade, pass, sleep, eat, drink, bus, bench, train, toMatch, openMail:mail, minute:() => LIFE.min};

/* ---------- zones ---------- */
function clearScene(){
  scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){ for (const m of [].concat(o.material)){ if (m.map && m.map.isCanvasTexture && !m.map.userData.per) m.map.dispose(); m.dispose(); } }
  });
  while (scene.children.length) scene.remove(scene.children[0]);
  lights(); lastSkyMin = -1;
}
let spawns = {};
function enterZone(zone, at){
  LIFE.zone = zone;
  clearScene(); begin(scene);
  if (zone === "ground"){ resetHome(); spawns = buildGround(ctx); }
  else spawns = buildHome(ctx);
  renderer.shadowMap.needsUpdate = true;
  const p = typeof at === "object" && at ? at : spawns[at] || spawns[zone === "home" ? "bed" : "bus"];
  place(p);
  sky();
}

/* ---------- you ---------- */
const P = {x:0, z:0, feet:0, eye:1.62, yaw:0, pitch:0, vx:0, vz:0, vy:0};
const EYE = 1.62, R = .26, REACH = 2.5;
const keys = {};
let held = null, walked = 0, grab = null;
const B = {phase:0, amt:0, fov:74, roll:0, dist:0};
const L = {f:0, r:0};
function place(p){
  P.x = p.x; P.z = p.z; P.feet = p.y || 0; P.eye = P.feet + EYE; P.yaw = p.yaw || 0; P.pitch = 0;
  P.vx = P.vz = P.vy = 0; B.amt = 0; B.roll = 0; L.f = L.r = 0; tunnelGo = false; tunnelInfo = null;
}
function hits(x, z){
  const lo = P.feet + .42, hi = P.feet + 1.75;
  for (const s of W.solids){
    if (s.off || s.y1 <= lo || s.y0 >= hi || s === stuck) continue;
    if (x + R > s.x0 && x - R < s.x1 && z + R > s.z0 && z - R < s.z1) return s;
  }
  return null;
}
let stuck = null;
function moveBy(dx, dz){
  const b = W.bounds;
  // if something closed on you (a door), you may walk out of it rather than be pushed through it
  stuck = null; stuck = hits(P.x, P.z);
  if (dx){
    let nx = P.x + dx; const s = hits(nx, P.z);
    if (s){ nx = dx > 0 ? s.x0 - R - 1e-3 : s.x1 + R + 1e-3; if (hits(nx, P.z)) nx = P.x; P.vx = 0; }
    P.x = Math.max(b.x0, Math.min(b.x1, nx));
  }
  if (dz){
    let nz = P.z + dz; const s = hits(P.x, nz);
    if (s){ nz = dz > 0 ? s.z0 - R - 1e-3 : s.z1 + R + 1e-3; if (hits(P.x, nz)) nz = P.z; P.vz = 0; }
    P.z = Math.max(b.z0, Math.min(b.z1, nz));
  }
}
// the highest thing under you that you could step onto
function groundAt(x, z, feet){
  let best = 0;
  for (const f of W.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.h <= feet + .5 && f.h > best) best = f.h;
  for (const r of W.ramps){
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const c = r.axis === "z" ? z : x, t = Math.max(0, Math.min(1, (c - r.a0)/(r.a1 - r.a0)));
    const h = r.h0 + (r.h1 - r.h0)*t;
    if (h <= feet + .5 && h > best) best = h;
  }
  return best;
}
const locked = () => !!(window.lifeMoveLocked && window.lifeMoveLocked()) || modal;
function step(dt, real){
  let f = 0, r = 0;
  if (!locked()){
    f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len){ f /= len; r /= len; }
  const running = keys.shift && f > .3;
  let sp = running ? 6.6 : 4.0;
  if (f < 0) sp *= .8;
  // speed is smoothed relative to where you look, then turned into the world every frame —
  // so when you turn, you walk where you now face at once, with no sliding
  const k = 1 - Math.exp(-(len ? 14 : 16)*dt);
  L.f += (f*sp - L.f)*k; L.r += (r*sp - L.r)*k;
  if (Math.abs(L.f) < .01 && !f) L.f = 0; if (Math.abs(L.r) < .01 && !r) L.r = 0;
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  P.vx = L.r*cos - L.f*sin; P.vz = -L.r*sin - L.f*cos;
  const speed = Math.hypot(P.vx, P.vz);
  if (speed > .02){
    const ox = P.x, oz = P.z;
    moveBy(P.vx*dt, P.vz*dt);
    const moved = Math.hypot(P.x - ox, P.z - oz);
    walked += moved; B.dist += moved;
    if (walked > 3.2){ walked = 0; pass(.5); }
  }
  // stairs, kerbs and falling
  const g = groundAt(P.x, P.z, P.feet);
  if (g >= P.feet - .001){ P.feet = g; P.vy = 0; }
  else if (P.feet - g < .45 && P.vy === 0){ P.feet = g; }
  else { P.vy -= 22*dt; P.feet = Math.max(g, P.feet + P.vy*dt); if (P.feet === g) P.vy = 0; }
  P.eye += (P.feet + EYE - P.eye)*(1 - Math.exp(-14*dt));
  // head bob: a soft rise and fall once a step, a slight sway every two — driven by distance walked,
  // so it slows with you and settles back to level when you stop
  const realSpeed = dt > 0 ? Math.min(8, speed) : 0;
  B.amt += (Math.min(1, realSpeed/4.0) - B.amt)*(1 - Math.exp(-5*dt));
  B.phase = B.dist/(running ? 1.5 : 1.1)*Math.PI*2;
  const bobY = Math.sin(B.phase*2)*.022*B.amt*(running ? 1.35 : 1);
  const sway = Math.sin(B.phase)*.014*B.amt;
  B.fov += ((running && speed > 4.6 ? 78 : 74) - B.fov)*(1 - Math.exp(-4*dt));
  if (Math.abs(cam.fov - B.fov) > .01){ cam.fov = B.fov; cam.updateProjectionMatrix(); }
  cam.position.set(P.x + cos*sway, P.eye + bobY, P.z - sin*sway);
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  for (const a of W.anims) a(dt);
  if (LIFE.zone === "ground") tunnel();
  // what you are looking at
  held = grab || target();
  hud(held);
}
/* walking up to the tunnel: the match gets ready as you come, and starts when you reach it */
let tunnelInfo = null, tunnelGo = false, tunnelAge = 0;
function matchToday(){
  try {
    const {next, me} = hubState();
    if (!next) return {ok:false, why:"No match this week — open the hub (Q) and go to the next week."};
    if (me.inj > 0) return {ok:false, why:"You're injured — no match for you this week."};
    if ((G().ban || 0) > 0) return {ok:false, why:`Suspended — ${G().ban} match${G().ban === 1 ? "" : "es"} to sit out.`};
    return {ok:true, label:`${sideName(next, "h")}  vs  ${sideName(next, "a")}`};
  } catch(e){ return {ok:false, why:"No match today."}; }
}
function tunnel(){
  const bar = document.getElementById("lifeMatch"), fadeEl = document.getElementById("lifeFade");
  const d = Math.hypot(P.x, P.z + 27.2);
  if (d > 11 || tunnelGo){ if (bar) bar.classList.remove("on"); if (!tunnelGo && fadeEl.dataset.tun){ fadeEl.style.opacity = "0"; delete fadeEl.dataset.tun; } tunnelInfo = null; return; }
  if (!tunnelInfo || ++tunnelAge > 45){ tunnelInfo = matchToday(); tunnelAge = 0; }
  bar.classList.add("on");
  bar.classList.toggle("off", !tunnelInfo.ok);
  bar.querySelector("b").textContent = tunnelInfo.ok ? tunnelInfo.label : "The tunnel is closed";
  bar.querySelector("span").textContent = tunnelInfo.ok ? (d < 3 ? "Here we go…" : "Match day · walk into the tunnel") : tunnelInfo.why;
  const p = tunnelInfo.ok ? Math.max(0, Math.min(1, 1 - (d - .4)/10)) : 0;
  bar.querySelector("i").style.width = (p*100).toFixed(1) + "%";
  if (tunnelInfo.ok){
    fadeEl.style.transition = "none"; fadeEl.style.opacity = String(Math.max(0, (3.2 - d)/3.2)*.55); fadeEl.dataset.tun = "1";
    if (P.z < -26.75 && Math.abs(P.x) < 2.3){ tunnelGo = true; bar.classList.remove("on"); toMatch(); }
  }
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
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
function target(){
  if (locked()) return null;
  cam.updateMatrixWorld();
  cam.getWorldPosition(_o); cam.getWorldDirection(_d);
  let best = null, bt = REACH;
  for (const sp of W.spots){
    if (!sp.aim || (sp.when && !sp.when())) continue;
    const [a, b] = typeof sp.aim === "function" ? sp.aim() : sp.aim;
    const t = rayBox(_o, _d, a, b);
    if (t < bt){ bt = t; best = sp; }
  }
  if (best) return best;
  let bd = 1e9;
  for (const sp of W.spots){
    if ((sp.aim && !sp.near) || (sp.when && !sp.when())) continue;
    if (Math.abs((sp.y || 1) - (P.feet + 1)) > 2.4) continue;
    const d = Math.hypot(sp.x - P.x, sp.z - P.z);
    if (d < sp.r && d < bd){ bd = d; best = sp; }
  }
  return best;
}

function use(sp){
  const ring = document.querySelector("#lifePrompt .lp-ring");
  if (ring){ ring.classList.remove("hit"); void ring.offsetWidth; ring.classList.add("hit"); }
  if (sp.kind === "drag"){ if (sp.toggle) sp.toggle(); return; }
  if (sp.run) sp.run();
}
/* ---------- the overlay ---------- */
function hud(near){
  const c = document.getElementById("lifeClock");
  if (c) c.textContent = `Day ${LIFE.day} · ${clockText()}`;
  const s = G();
  const en = document.getElementById("lifeEnergy");
  if (en && s) en.style.width = Math.max(0, Math.min(100, s.energy)) + "%";
  const mo = document.getElementById("lifeMoney");
  if (mo && s){ const t = euro(s.money); if (mo.textContent !== t) mo.textContent = t; }
  const p = document.getElementById("lifePrompt");
  if (!p) return;
  if (!near || modal){ p.style.opacity = "0"; return; }
  p.style.opacity = "1";
  const lab = p.querySelector(".lp-label"), hin = p.querySelector(".lp-hint"), hold = p.querySelector(".lp-hold");
  if (lab.textContent !== near.label) lab.textContent = near.label;
  const hint = near.hint || "";
  if (hin.textContent !== hint) hin.textContent = hint;
  const how = near.kind === "drag" ? "Press E, or hold the mouse button and drag" : "Press E";
  if (hold.textContent !== how) hold.textContent = how;
  p.classList.toggle("drag", near.kind === "drag");
  p.querySelector(".lp-ring").style.setProperty("--p", near.kind === "drag" ? ((near.angle || 0)/1.65).toFixed(3) : "0");
}
function note(t){
  const n = document.getElementById("lifeNote");
  if (!n) return;
  n.textContent = t; n.classList.add("on");
  clearTimeout(note._t); note._t = setTimeout(() => n.classList.remove("on"), 3600);
}
window.lifeNote = note;
function fade(fn, ms = 620){
  const o = document.getElementById("lifeFade");
  o.style.transition = `opacity ${ms/2}ms ease`; o.style.opacity = "1";
  setTimeout(() => { fn(); o.style.opacity = "0"; }, ms/2 + 60);
}

/* ---------- loop and entry ---------- */
let last = 0, frames = 0, saveT = 0;
const Q = {scale:1, acc:0, n:0, good:0};
function quality(real){
  Q.acc += real; Q.n++;
  if (Q.acc < 1) return;
  const fps = Q.n/Q.acc; Q.acc = 0; Q.n = 0;
  if (fps < 52 && Q.scale > .6){ Q.scale = Math.max(.6, Q.scale - .1); Q.good = 0; resize(); }
  else if (fps > 59 && Q.scale < 1){ if (++Q.good >= 3){ Q.scale = Math.min(1, Q.scale + .1); Q.good = 0; resize(); } }
}
function loop(t){
  if (!LIFE.running) return;
  frames++;
  const real = Math.max(0, (t - last)/1000 || 0), dt = Math.min(.05, real); last = t;
  step(dt, Math.min(real, .5));
  sky();
  if (LIFE.zone === "home") homeTick();
  renderer.render(scene, cam);
  if (real > 0 && real < .5) quality(real);
  saveT += real; if (saveT > 60){ saveT = 0; persist(); }
  raf = requestAnimationFrame(loop);
}
function boot(){
  if (renderer) return;
  const cv = document.getElementById("lifeCanvas");
  renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true, powerPreference:"high-performance"});
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;                 // nothing big moves, so shadows are drawn once
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(74, 1, .05, 400);
  resize(); addEventListener("resize", resize);
  bindInput(cv);
}
function mailNews(){
  const n = checkMail();
  if (n){ drawMail(); setTimeout(() => note(`📬 ${n === 1 ? "A letter has" : n + " letters have"} arrived in your mailbox downstairs.`), 900); }
  return n;
}
export function startLife(opts = {}){
  const s = G(); if (!s) return;
  ensureHome();
  if (s.life){ LIFE.day = s.life.day || 1; LIFE.min = s.life.min == null ? 7*60 : s.life.min; }
  document.getElementById("lifeRoot").style.display = "block";
  boot();
  const zone = opts.zone || "home";
  enterZone(zone, opts.at || (zone === "home" ? "bed" : "bus"));
  LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop);
  const h = s.home, first = h.letters.some(l => !l.read) && LIFE.day === 1;
  note(opts.msg || (first ? `This is your flat, ${h.apt}. Your uncle paid the first three months — check your mailbox in the lobby.`
    : `Day ${LIFE.day} · ${clockText()}. Training is at ten — the bus takes ${BUS_MIN} minutes.`));
  mailNews();
}
export function stop(){ LIFE.running = false; if (raf) cancelAnimationFrame(raf); raf = null; grab = null; document.exitPointerLock && document.exitPointerLock(); }
export function resumeLife(){
  if (!document.body.classList.contains("life") || !renderer) return;
  if (LIFE.zone === "home") homeRefresh();
  tunnelInfo = null;
  mailNews();
  if (!LIFE.running){ document.getElementById("lifeRoot").style.display = "block"; LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
}
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)*Q.scale);
  renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix();
}
function lock(cv){
  if (!LIFE.running || locked() || document.pointerLockElement === cv) return;
  try {
    const p = cv.requestPointerLock({unadjustedMovement:true});
    if (p && p.catch) p.catch(() => { try { cv.requestPointerLock(); } catch(e){} });
  } catch(e){ try { cv.requestPointerLock(); } catch(e2){} }
}
const _e = new THREE.Vector3(), _h = new THREE.Vector3();
function dragBy(mx, my){
  // which way does the free edge of the door move on screen when it opens?
  const e = grab.edge(), h = grab.hinge();
  const rx = e.x - h.x, rz = e.z - h.z;
  _e.copy(e).project(cam);
  _h.set(e.x + grab.spin*rz*.05, e.y, e.z - grab.spin*rx*.05).project(cam);
  let sx = _h.x - _e.x, sy = _h.y - _e.y; const l = Math.hypot(sx, sy) || 1; sx /= l; sy /= l;
  const c = cam.position;
  const toward = Math.hypot(e.x + grab.spin*rz*.05 - c.x, e.z - grab.spin*rx*.05 - c.z) < Math.hypot(e.x - c.x, e.z - c.z) ? 1 : -1;
  grab.drag((mx*sx - my*sy)*.005 + my*toward*.0045);
}
function bindInput(cv){
  cv.addEventListener("click", () => lock(cv));
  window.lifeRelock = () => lock(cv);
  window.lifeClearKeys = () => { for (const k in keys) keys[k] = false; grab = null; };
  addEventListener("mousedown", e => {
    if (e.button !== 0 || document.pointerLockElement !== cv) return;
    if (held && held.kind === "drag") grab = held;
  });
  addEventListener("mouseup", e => { if (e.button === 0) grab = null; });
  addEventListener("mousemove", e => {
    if (document.pointerLockElement !== cv || locked()) return;
    const mx = e.movementX, my = e.movementY;
    if (Math.abs(mx) > 350 || Math.abs(my) > 350) return;
    if (grab){ dragBy(mx, my); return; }
    P.yaw -= mx*.0021;
    P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - my*.0021));
  });
  addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing || !document.body.classList.contains("life") || document.body.classList.contains("in-match")) return;
    if (mailOpen()){ if (e.key === "Escape"){ e.preventDefault(); closeMail(); } return; }
    if (window.lifeMode && window.lifeMode() === "hub") return;
    const k = e.key.toLowerCase();
    if (["w","a","s","d","e","shift"," "].includes(k)) e.preventDefault();
    keys[k === " " ? "space" : k] = true;
    if (k === "e" && !e.repeat && !locked()){ const t = held || target(); if (t) use(t); }
  });
  addEventListener("keyup", e => { const k = e.key.toLowerCase(); keys[k === " " ? "space" : k] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; grab = null; });
}
window.LIFE = LIFE; window.startLife = startLife; window.stopLife = stop; window.resumeLife = resumeLife;
// handles for automated tests
window.__life = {P, keys, B, Q, W, HOME, get spots(){ return W.spots; }, get solids(){ return W.solids; }, get bounds(){ return W.bounds; },
  get frames(){ return frames; }, get held(){ return held; }, get grab(){ return grab; }, set grab(v){ grab = v; }, get cam(){ return cam; },
  target, enterZone, place, dragBy, mailOpen, renderer:() => renderer};
