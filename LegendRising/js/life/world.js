/* ============ LIFE: the first-person world ============
   Your flat in a brick block, the street with the Mini Market and your job, the bus to the training
   ground, and the tunnel that hands you to the match. The clock runs while you live in it — slowly
   when you stand still, a little faster when you move, and in big steps when you sleep, work, train
   or wait. Everything about the day itself (the meters, the schedule, the dressing room) lives in
   daily.js; this file is the world you walk around and the screen you see it through. */
import {THREE, W, begin} from "./build.js";
import {buildHome, homeTick, homeRefresh, resetHome, HOME, drawMail, refreshFridge, bedTier} from "./home.js";
import {buildGround, refreshGymFridge, GROUND} from "./ground.js";
import {ensureHome, checkMail, openMail, closeMail, mailOpen} from "./rent.js";
import {createSky} from "./sky.js";
import {startDrill, startReps, startSession} from "./drills.js";

const G = () => (typeof S !== "undefined" ? S : null);
export const LIFE = {min:7*60, day:1, wd:0, zone:"home", running:false};
const BUS_MIN = 40;
const TIME_RATE = .5, TIME_RATE_MOVING = .85;       // game minutes per real second
const clockText = (m = LIFE.min) => fmtTime(m);
function sync(){ const s = G(); if (s && s.life){ LIFE.min = s.life.min; LIFE.day = s.life.day; LIFE.wd = s.life.wd; } }

/* ---------- renderer and the sky ---------- */
let scene, cam, renderer, SKY = null, raf = null, modal = false, busy = null, DRILL = null, skyT = 0, forceSky = true;
function lights(){ if (SKY) SKY.attach(scene); forceSky = true; }
const hour = () => (LIFE.min/60) % 24;

/* ---------- the clock ---------- */
function pass(mins, act = "idle"){
  const s = G(); if (!s || !(mins > 0)) return;
  const day0 = s.life.day;
  dailyPass(mins, act);
  if (s.home && s.home.light && LIFE.zone === "home") s.home.lightMin = (s.home.lightMin || 0) + mins;
  sync();
  if (s.life.day !== day0) forceSky = true;
  if (mins >= 5) hudCtxT = 0;                       // a jump in time: refresh the line under the clock straight away
}
/* Saving serialises the whole career (over a megabyte) and writes it in one go: 40–120 ms in which nothing can be
   drawn. So the world never saves while you are on the move. persist(true) is for when the screen is covered (a fade,
   the bus, sleep) — it saves there and then; persist() only marks the save as due, and the loop writes it at the next
   quiet moment: you standing still with the mouse at rest, a panel or the hub up, or the pointer released. */
let saveDue = false, saveDueT = 0, mouseT = 0;
function saveNowIf(){ saveDue = false; saveDueT = 0; const s = G(); if (!s) return; if (typeof saveNow === "function") saveNow(); else if (typeof save === "function") save(); }
const persist = (now) => { if (!G()) return; if (now) saveNowIf(); else saveDue = true; };
// while you are out walking about (pointer held, no panel up), every other save() — a drill finishing, the day's
// bookkeeping — waits for that moment too; anywhere else it is the ordinary save
const save0 = typeof save === "function" ? save : null;
if (save0) window.save = function(){
  if (LIFE.running && !modal && !busy && document.pointerLockElement && !document.body.classList.contains("in-match")){ saveDue = true; return true; }
  return save0.apply(this, arguments);
};
addEventListener("pagehide", () => { if (saveDue) saveNowIf(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && saveDue) saveNowIf(); });
window.lifePass = (m, act) => pass(m, act);
// news from the day as it happens
function onDaily(type, d){
  if (!LIFE.running && type !== "season") return;
  if (type === "delivered"){
    refreshFridge(); refreshGymFridge();
    FEED.center("Foodies delivered", `Your order is in ${d.where === "ground" ? "the gym fridge" : "your fridge at home"}`, {kind:"food", icon:"🍔"});
  } else if (type === "late") FEED.chip(`Late for training · Manager trust ${d.d}`, "bad");
  else if (type === "settled"){
    if (d.k.startsWith("absent")) FEED.chip(`Missed training · Manager trust ${Math.round(d.d)}`, "bad");
    else if (d.k === "good") FEED.chip("Full session · Manager trust +1", "good");
    else if (d.k === "early") FEED.chip("Left training early · Manager trust −1", "bad");
  } else if (type === "missed" && !d.excused) FEED.center("Match missed", "The team played without you · Manager trust −10", {kind:"bad", icon:"!"});
  else if (type === "newweek"){ if (d && d.income) FEED.center(`Week ${G().week + 1}`, `Your wage is in · ${eurFull(d.income)}${d.cost ? ` · staff −${eurFull(d.cost)}` : ""}`, {kind:"money", icon:"€"}); }
  else if (type === "crash") FEED.chip("The energy drink wears off", "bad");
}
if (typeof dailyOn === "function") dailyOn(onDaily);

/* ---------- what you can do ---------- */
function note(t){
  const n = document.getElementById("lifeNote"); if (!n) return;
  n.textContent = t; n.classList.remove("on"); void n.offsetWidth; n.classList.add("on");
  clearTimeout(note._t); note._t = setTimeout(() => n.classList.remove("on"), Math.max(3600, t.length*55));
}
window.lifeNote = note;
function fade(fn, ms = 620){
  const o = document.getElementById("lifeFade");
  o.style.transition = `opacity ${ms/2}ms ease`; o.style.opacity = "1";
  setTimeout(() => { fn(); o.style.opacity = "0"; }, ms/2 + 60);
}
function sleep(){
  const s = G(); if (!s || busy) return;
  if (isNight()){ openDaySummary(doSleep); return; }
  fade(() => { const r = nap(bedTier()); sync(); forceSky = true; note(`A two-hour nap · fatigue ${r.fatigue} · it's ${clockText()}`); persist(true); }, 1600);
}
function doSleep(){
  const s = G();
  fade(() => {
    const r = sleepNight(bedTier());
    startNewDay(); sync(); forceSky = true;
    persist(true);
    morning(r);
  }, 2000);
}
function morning(r){
  const f = todaysFixture();
  FEED.center(todayName(), f ? `Match day · ${oppName(f)} · ${clockText(fixtureSlot(f).min)}` : todayLine(), {kind:"day", icon:"☀", ms:3200});
  note(`${r.hours >= 7 ? "A full night's sleep" : `${Math.round(r.hours)} hours' sleep`} · fatigue ${r.fatigue <= 0 ? "−" + Math.abs(r.fatigue) : "+" + r.fatigue} · ${S.energy < 40 ? "you wake up hungry — eat breakfast." : "breakfast is in the fridge."}`);
}
function eat(id){
  const r = consume(id); sync();
  if (!r.ok) return note(r.why);
  refreshFridge(); refreshGymFridge();
  FEED.chip(`${r.item.name} · ${r.gain ? `+${r.gain} energy` : ""}${r.fat ? ` ${r.fat < 0 ? "−" : "+"}${Math.abs(r.fat)} fatigue` : ""}`.trim(), "good");
  persist();
}
window.lifeFridgeChanged = () => { refreshFridge(); refreshGymFridge(); };
function bus(to){
  if (busy) return;
  fade(() => {
    const leaving = LIFE.zone;
    pass(BUS_MIN, "bus");
    enterZone(to, "bus");
    if (to === "ground"){
      arriveForTraining();
      const a = S.life.att, td = trainingDay(), f = todaysFixture();
      if (f) note(`${clockText()}. Match day — kick-off ${clockText(fixtureSlot(f).min)}. The tunnel opens at ${clockText(fixtureSlot(f).min - TUNNEL_OPEN)}.`);
      else if (!td) note(`${clockText()}. No team training today — the gym and the drills are yours.`);
      else if (LIFE.min < SESSION.start) note(`You're here at ${clockText()}. Training starts at ${clockText(SESSION.start)} — the gym is open, or sit on the bench.`);
      else if (LIFE.min < SESSION.end) note(a.status === "late" ? `${clockText()}. Training started at ${clockText(SESSION.start)}. The manager saw you come in late.` : `${clockText()}. Training's on — the squad is out on the pitch.`);
      else note(`${clockText()}. The session finished at ${clockText(SESSION.end)}. The gym is still open.`);
    } else {
      note(`Home at ${clockText()}. Your block is across the road — the Mini Market is on the corner.`);
      // what today's training did for you in the dressing room shows up once you're home
      const a = S.life.att;
      if (leaving === "ground" && a && a.chem > .1 && !a.told){
        a.told = true;
        setTimeout(() => FEED.center(`Team Chemistry +${a.chem.toFixed(1)}`, `From today with the squad · now ${Math.round(S.chem)} · ${chemLabel()}`, {kind:"chem", icon:"◆"}), 900);
      }
    }
    persist(true);
  }, 1100);
}
// a stretch of time passing on screen: the clock runs fast and you watch it
function timeLapse(mins, act, label, done, o = {}){
  if (busy) return;
  const el = document.getElementById("lifeBusy");
  busy = {mins, done:0, act, label, cb:done, dur:o.dur || clamp(mins/60*1.4, 1.2, 3.6), t:0, tick:o.tick};
  modal = true; for (const k in keys) keys[k] = false;
  if (el){ el.innerHTML = `<div class="lb-card"><span class="lb-ico">${o.icon || "⏩"}</span><div><b class="lb-label"></b><span class="lb-time"></span></div><div class="lb-bar"><i></i></div></div>`; el.classList.add("on"); }
}
function stepBusy(real){
  const b = busy; if (!b) return;
  b.t += real;
  const k = Math.min(1, b.t/b.dur), want = b.mins*k, d = want - b.done;
  if (d > 0){ pass(d, b.act); b.done = want; if (b.tick) b.tick(k, d); }
  const el = document.getElementById("lifeBusy");
  if (el){
    const lab = typeof b.label === "function" ? b.label(k) : b.label;
    el.querySelector(".lb-label").textContent = lab; el.querySelector(".lb-time").textContent = clockText();
    el.querySelector(".lb-bar i").style.width = (k*100).toFixed(1) + "%";
  }
  if (k >= 1){
    busy = null; modal = false;
    if (el) el.classList.remove("on");
    if (b.cb) b.cb();
    if (window.lifeRelock) window.lifeRelock();
  }
}
window.lifeWaitFor = mins => timeLapse(mins, "rest", "Taking a breather", () => { note(`It's ${clockText()}. Fatigue ${Math.round(S.fatigue)} · Energy ${Math.round(S.energy)}.`); persist(); }, {icon:"☕"});
function bath(){
  timeLapse(30, "rest", "Hot bath", () => { S.fatigue = clamp(S.fatigue - 10, 0, 100); FEED.chip("Hot bath · −10 fatigue", "good"); persist(); }, {icon:"🛁", dur:2});
}
function iceBath(){
  timeLapse(20, "rest", "Ice bath", () => { S.fatigue = clamp(S.fatigue - 14, 0, 100); FEED.chip("Ice bath · −14 fatigue", "good"); persist(); }, {icon:"🧊", dur:2});
}
function water(){ S.fatigue = clamp(S.fatigue - 2, 0, 100); S.energy = clamp(S.energy + 1, 0, 100); pass(2); FEED.chip("Cup of water · −2 fatigue", "good"); }
// a shift at work: the clock runs, the job bar fills as you go, the pay comes at the end
window.lifeShift = plan => {
  const tasks = (JOB_TASKS[jobState().id] || ["Working"]);
  let given = 0, promo = null;
  const before = () => ({pct:jobState().xp/jobNeed(), rank:myJob().rank});
  timeLapse(plan.hours*60, "work", k => `On shift · ${tasks[Math.min(tasks.length - 1, Math.floor(k*tasks.length))]}`, () => {
    shiftPay(plan);
    if (promo){ setTimeout(() => { FEED.center("Promoted", `${promo.job.name} · ${promo.to.name}`, {kind:"level", icon:"★"}); promoBox(promo, plan.pay); if (window.lifeModalSet) {} }, 500); }
    note(`Shift done at ${clockText()} · ${eurFull(plan.pay)} earned.`);
    persist();
  }, {icon:myJob().job.icon, dur:plan.hours >= 4 ? 5.5 : 3.4, tick:(k) => {
    const want = Math.round(plan.xp*k), part = want - given;
    if (part >= Math.max(1, Math.round(plan.xp/8)) || (k >= 1 && part > 0)){
      const b = before(); given = want;
      const p = shiftXp(part); if (p) promo = p;
      FEED.job(part, b);
    }
  }});
};
function work(){
  if (!shiftOpen()) return note("Closed. Shifts run from 7:00 AM to 11:00 PM.");
  openShift();
}
function trainCheck(){
  if (S.energy < 8){ note("You're running on empty. Eat something before you train."); return false; }
  if (LIFE.min < 6*60 || LIFE.min >= 22*60){ note("The training ground is closed. It opens at 6:00 AM."); return false; }
  if (S.fatigue > 80) FEED.chip("Exhausted — this will count for little", "bad");
  return true;
}
function drill(kind){ if (!trainCheck() || DRILL) return; DRILL = startDrill(kind, host); }
function reps(kind){ if (!trainCheck() || DRILL) return; DRILL = startReps(kind, host); }
function session(){
  if (!sessionOn()) return note("The session has finished for today.");
  if (S.energy < 10) return note("You're too hungry to keep up. Eat first — there's food in the gym fridge.");
  if (DRILL) return;
  DRILL = startSession(host);
}
function toMatch(){
  const info = matchToday();
  if (!info.ok){ tunnelGo = false; return note(info.why); }
  stop();
  const o = document.getElementById("lifeFade");
  o.style.transition = "opacity .9s ease"; o.style.opacity = "1";
  setTimeout(() => {
    document.getElementById("lifeRoot").style.display = "none";
    LIFE.matchEnd = fixtureSlot(info.f).min + MATCH_LEN;
    try { if (typeof A === "object" && A.playFixture) A.playFixture(info.f); } catch(e){ console.error(e); }
    o.style.transition = "opacity .8s ease"; o.style.opacity = "0"; delete o.dataset.tun;
    // if no match started, never leave you staring at a black screen
    if (!document.body.classList.contains("in-match")){
      tunnelGo = false; resumeLife(); place({x:0, z:-21, y:0, yaw:Math.PI});
      note("The match couldn't start. Open the hub (Q) to see what's on.");
    }
  }, 950);
}
// back from the final whistle: out of the tunnel, a couple of hours later, with tired legs
window.lifeAfterMatch = (played) => {
  const s = G();
  const end = LIFE.matchEnd || 21*60;
  if (s.life.min < end) dailyPass(end - s.life.min, "match");
  if (played) S.fatigue = clamp(S.fatigue + played, 0, 100);
  sync(); LIFE.zone = "ground";
  if (window.startLife) window.startLife({zone:"ground", at:"tunnel", msg:`Full time. You walk back out of the tunnel — it's ${clockText()}. The bus home is by the gate.`});
};
function mail(){
  modal = true; for (const k in keys) keys[k] = false;
  document.exitPointerLock && document.exitPointerLock();
  openMail(() => { modal = false; drawMail(); if (window.lifeRelock) window.lifeRelock(); });
}
window.lifeModal = () => modal;
window.lifeModalSet = on => {
  modal = !!on;
  for (const k in keys) keys[k] = false; grab = null;
  if (on){ document.exitPointerLock && document.exitPointerLock(); }
  else if (window.lifeRelock) setTimeout(() => window.lifeRelock(), 30);
};
const ctx = {note, fade, pass, sleep, eat, bus, toMatch, openMail:mail, minute:() => LIFE.min,
  wait:where => openWait(where), reps, drill, session, computer:where => openComputer(where), shop:() => openShop("market"), vend:() => openShop("vend"),
  water, work, bath, iceBath, warm:() => warm()};

/* ---------- zones ---------- */
function clearScene(){
  scene.traverse(o => {
    if (o.userData && o.userData.keep) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material){ for (const m of [].concat(o.material)){ if (m.userData && m.userData.keep) continue; if (m.map && m.map.isCanvasTexture && !m.map.userData.per) m.map.dispose(); m.dispose(); } }
  });
  while (scene.children.length) scene.remove(scene.children[0]);
  lights();
}
let spawns = {};
function enterZone(zone, at){
  if (DRILL) endDrillNow();
  LIFE.zone = zone; W.zone = zone;
  clearScene(); begin(scene);
  if (zone === "ground"){ resetHome(); spawns = buildGround(ctx); }
  else { GROUND.fridge = null; spawns = buildHome(ctx); }
  renderer.shadowMap.needsUpdate = true;
  const p = typeof at === "object" && at ? at : spawns[at] || spawns[zone === "home" ? "bed" : "bus"];
  place(p);
  forceSky = true; skyStep(0);
  hudMeters.e = hudMeters.f = null;
  warm();
}
// Shaders are compiled and textures uploaded the first time something is drawn — which, with frustum culling,
// is the first time you turn to face it: a hitch exactly while you move the mouse. Do it all up front instead —
// including what is built but hidden for now (the squad before training, a drill's props), which would otherwise
// compile the moment it appears. compile() does not cover the shadow pass's own depth shaders or a skinned figure's
// bone texture, so one real frame is drawn here too, behind the fade, with everything showing. Exposed to the zones
// as ctx.warm() for anything they add later.
function warm(){
  const hid = [];
  try {
    scene.traverse(o => {
      if (!o.visible){ hid.push(o); o.visible = true; }
      if (o.isSkinnedMesh && o.skeleton && !o.skeleton.boneTexture) o.skeleton.computeBoneTexture();
    });
    renderer.compile(scene, cam);
    const seen = new Set(), init = t => { if (t && t.isTexture && !seen.has(t)){ seen.add(t); renderer.initTexture(t); } };
    scene.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) init(o.skeleton.boneTexture);
      if (o.material) for (const m of [].concat(o.material)) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap", "emissiveMap", "alphaMap"]) init(m[k]);
    });
    cam.position.set(P.x, P.eye, P.z); cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, cam);
  } catch(e){}
  for (const o of hid) o.visible = false;
  renderer.shadowMap.needsUpdate = true;                 // and the real shadows, without what is hidden, next frame
}

/* ---------- you ----------
   How you move. W A S D walk (4 m/s); hold Shift to run (6 m/s); keep Shift held while going forward and,
   once you are up to running pace, it builds into a sprint over about a second (7.6 m/s). Backwards and
   sideways never sprint. Speeding up and slowing down are acceleration-limited; the direction you move in
   follows the view almost at once (see step). The view itself is never smoothed: the mouse turns the camera
   in the frame it moved in. Only the camera's position is filtered — the head bob
   (a small, speed-scaled rise and fall once a step, a tiny sway once a stride, no roll) and the eye height,
   which follows the ground through a critically damped spring so kerbs and stair landings never snap.
   P.speed / P.moveMode / P.stride are the locomotion state a body or footsteps can read. */
const P = {x:0, z:0, feet:0, eye:1.62, yaw:0, pitch:0, vx:0, vz:0, vy:0, drillY:0, bobY:0,
  speed:0, moveMode:"idle", stride:0, sprint:0};
const EYE = 1.62, R = .26, REACH = 2.5;
const GAIT = {walk:4.0, run:6.0, sprint:7.6, back:.8, accel:26, brake:24, turn:24, sprintIn:1.1, sprintOut:2.5};
const keys = {};
let held = null, grab = null, lockLost = false;
const B = {amt:0, y:0, yv:0, x:0, xv:0, fov:74, fovSet:74};     // head bob springs and the field of view
const E = {g:0, a:0, av:0, b:0, bv:0};                          // the ground the eye rides on (g), and its offsets from it: slopes (a), steps (b)
function place(p){
  P.x = p.x; P.z = p.z; P.feet = p.y || 0; P.eye = P.feet + EYE; P.yaw = p.yaw || 0; P.pitch = 0;
  P.vx = P.vz = P.vy = 0; P.speed = 0; P.sprint = 0; P.moveMode = "idle";
  B.amt = B.y = B.yv = B.x = B.xv = 0; E.g = P.feet; E.a = E.av = E.b = E.bv = 0; tunnelGo = false; tunnelInfo = null;
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
  const b = DRILL && DRILL.moveBox ? DRILL.moveBox : W.bounds;
  // if something closed on you (a door), you may walk out of it rather than be pushed through it
  stuck = null; stuck = hits(P.x, P.z);
  // long frames are split so a sprint can never carry you through a thin wall
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz))/.12));
  dx /= n; dz /= n;
  for (let i = 0; i < n; i++){
    if (dx){
      let nx = P.x + dx; const s = hits(nx, P.z);
      if (s){ nx = dx > 0 ? s.x0 - R - 1e-3 : s.x1 + R + 1e-3; if (hits(nx, P.z)) nx = P.x; P.vx = 0; dx = 0; }
      P.x = Math.max(b.x0, Math.min(b.x1, nx));
    }
    if (dz){
      let nz = P.z + dz; const s = hits(P.x, nz);
      if (s){ nz = dz > 0 ? s.z0 - R - 1e-3 : s.z1 + R + 1e-3; if (hits(P.x, nz)) nz = P.z; P.vz = 0; dz = 0; }
      P.z = Math.max(b.z0, Math.min(b.z1, nz));
    }
  }
}
/* the highest thing under you that you could step onto. Also the ground your eye rides on (eg, with its slope
   egx/egz): the same, except that a flight's slope is carried on past its foot down to the floor in front of it.
   A stair ramp starts a whole riser up (it runs along the nosings), so the feet hop onto it — but the eye should
   already be on its way up as you reach the first step, as yours is, not get kicked up by the riser and lag. */
let eg = 0, egx = 0, egz = 0;
function groundAt(x, z, feet){
  let best = 0, gx = 0, gz = 0;
  for (const f of W.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.h <= feet + .5 && f.h > best){ best = f.h; gx = gz = 0; }
  for (const r of W.ramps){
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const c = r.axis === "z" ? z : x, u = (c - r.a0)/(r.a1 - r.a0), t = Math.max(0, Math.min(1, u));
    const h = r.h0 + (r.h1 - r.h0)*t;
    if (h <= feet + .5 && h > best){
      best = h;
      const k = u > 0 && u < 1 ? (r.h1 - r.h0)/(r.a1 - r.a0) : 0;
      gx = r.axis === "z" ? 0 : k; gz = r.axis === "z" ? k : 0;
    }
  }
  eg = best; egx = gx; egz = gz;
  for (const r of W.ramps){
    const ax = r.axis === "z", s = ax ? x : z;
    if (s < (ax ? r.x0 : r.z0) || s > (ax ? r.x1 : r.z1)) continue;
    const c = ax ? z : x, u = (c - r.a0)/(r.a1 - r.a0);
    if (r.h0 <= r.h1 ? u >= 0 : u <= 1) continue;                     // only beyond the low end
    const h = r.h0 + (r.h1 - r.h0)*u;
    if (h > eg && h >= Math.min(r.h0, r.h1) - .3 && h <= feet + .5){
      eg = h; const k = (r.h1 - r.h0)/(r.a1 - r.a0); egx = ax ? 0 : k; egz = ax ? k : 0;
    }
  }
  return best;
}
const tutOn = () => { const t = document.getElementById("tutRoot"); return !!(t && t.classList.contains("on")); };
const locked = () => !!(window.lifeMoveLocked && window.lifeMoveLocked()) || modal || tutOn();
// exact critically damped spring of x (and its rate v) towards 0 over dt: no overshoot from rest, no frame-rate dependence
function spring(o, kx, kv, w, dt){
  const x = o[kx], v = o[kv], e = Math.exp(-w*dt), k = (v + w*x)*dt;
  o[kx] = (x + k)*e; o[kv] = (v - w*k)*e;
}
let moving = false;
function step(dt, real){
  let f = 0, r = 0;
  const canMove = !locked() && (!DRILL || DRILL.allowMove);
  if (!locked()) mouseFrame(); else MA.x.hold = MA.y.hold = 0;
  if (canMove){
    f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len){ f /= len; r /= len; }
  const run = !!keys.shift && !!len && !DRILL;
  // sprint builds while you hold Shift going forward at full running pace, and falls away as soon as you don't
  const fwd = run && f > .5;
  if (fwd && P.speed > GAIT.run*.85*legs()) P.sprint = Math.min(1, P.sprint + dt/GAIT.sprintIn);
  else P.sprint = Math.max(0, P.sprint - dt*GAIT.sprintOut);
  const sb = P.sprint*P.sprint*(3 - 2*P.sprint);
  let sp = (run ? GAIT.run + (GAIT.sprint - GAIT.run)*sb : GAIT.walk)*legs();
  if (f < 0) sp *= GAIT.back;
  // world-space velocity towards where you want to go. While you hold a direction, the way you are moving swings
  // round onto it at once (a quarter turn in about 1/15 s) without losing speed, so you go where you look the moment
  // you turn; only the speed itself, and a reversal (over 140°: it brakes through a stop), are acceleration-limited.
  // With no key held you coast to a stop along the way you were going, whichever way you then look.
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  const tx = (r*cos - f*sin)*sp, tz = (-r*sin - f*cos)*sp, v0 = Math.hypot(P.vx, P.vz);
  let turned = false;
  if (len && v0 > .05){
    const hv = Math.atan2(P.vz, P.vx);
    let d = Math.atan2(tz, tx) - hv; d -= Math.round(d/(2*Math.PI))*2*Math.PI;
    if (Math.abs(d) < 2.45){
      const a = hv + Math.max(-GAIT.turn*dt, Math.min(GAIT.turn*dt, d)), s1 = v0 + Math.max(-GAIT.brake*dt, Math.min(GAIT.accel*dt, sp - v0));
      P.vx = Math.cos(a)*s1; P.vz = Math.sin(a)*s1; turned = true;
    }
  }
  if (!turned){
    let dvx = tx - P.vx, dvz = tz - P.vz;
    const dl = Math.hypot(dvx, dvz), lim = (len ? GAIT.accel : GAIT.brake)*dt;
    if (dl > lim){ dvx *= lim/dl; dvz *= lim/dl; }
    P.vx += dvx; P.vz += dvz;
  }
  if (!len && Math.hypot(P.vx, P.vz) < .02) P.vx = P.vz = 0;
  const ox = P.x, oz = P.z;
  if (P.vx || P.vz) moveBy(P.vx*dt, P.vz*dt);
  // what you actually did, after walls: this drives the bob, the stride and the clock
  const ax = dt > 0 ? (P.x - ox)/dt : 0, az = dt > 0 ? (P.z - oz)/dt : 0, actual = Math.hypot(ax, az);
  P.speed += (actual - P.speed)*(1 - Math.exp(-14*dt));
  if (P.speed < .01 && !actual) P.speed = 0;
  moving = P.speed > .5;
  P.moveMode = P.speed < .3 ? "idle" : P.sprint > .5 ? "sprint" : run && P.speed > GAIT.walk*1.08*legs() ? "run" : "walk";
  // a step is shorter at a walk and longer at a run, so the cadence goes from ~2.3 to ~3.3 steps a second
  P.stride = (P.stride + actual*dt/Math.max(.9, P.speed/(1.4 + .25*P.speed))) % 1e4;
  // stairs, kerbs and falling: the feet follow the ground exactly; the eye follows the feet through two critically
  // damped springs — a stiff one that rounds off where a slope starts and ends, a softer one that soaks up the
  // sudden part (a kerb, a step down, a landing). Neither has any momentum of its own, so the eye can never
  // overshoot: it rises when you go up and only then, and it comes to rest exactly at eye height.
  const g = groundAt(P.x, P.z, P.feet);
  let tv = egx*ax + egz*az;                                 // how fast the slope under the eye is lifting you
  if (g >= P.feet - .001){ P.feet = g; P.vy = 0; }
  else if (P.feet - g < .45 && P.vy === 0){ P.feet = g; }
  else { P.vy -= 22*dt; P.feet = Math.max(g, P.feet + P.vy*dt); tv = P.vy; if (P.feet === g) P.vy = 0; }
  const base = Math.max(P.feet, eg), df = base - E.g; E.g = base;
  let c = tv*dt; c = df*c > 0 ? Math.sign(df)*Math.min(Math.abs(c), Math.abs(df)) : 0;
  E.a -= c; E.b -= df - c;
  if (Math.abs(E.a) + Math.abs(E.b) > .9) E.a = E.av = E.b = E.bv = 0;     // a teleport, not a step
  spring(E, "a", "av", 40, dt); spring(E, "b", "bv", 16, dt);
  P.eye = base + EYE + E.a + E.b;
  // head bob: the target is a small sine once a step (and half that, sideways, once a stride); springs carry the camera to it
  const want = P.speed < .3 ? 0 : Math.min(.011, P.speed*.0028) + Math.max(0, P.speed - GAIT.walk)*.0034;
  B.amt += (want - B.amt)*(1 - Math.exp(-6*dt));
  if (B.amt < 1e-5 && !want) B.amt = 0;
  const ph = P.stride*Math.PI*2;
  B.y -= B.amt*Math.sin(ph); B.x -= B.amt*.45*Math.sin(ph/2);
  spring(B, "y", "yv", 30, dt); spring(B, "x", "xv", 30, dt);
  B.y += B.amt*Math.sin(ph); B.x += B.amt*.45*Math.sin(ph/2);
  if (!B.amt && Math.abs(B.y) + Math.abs(B.x) < 1e-5 && Math.abs(B.yv) + Math.abs(B.xv) < 1e-4) B.y = B.yv = B.x = B.xv = 0;
  // a slightly wider view at a sprint, eased in and out
  const fovT = 74 + 4*sb;
  B.fov = Math.abs(fovT - B.fov) < .005 ? fovT : B.fov + (fovT - B.fov)*(1 - Math.exp(-5*dt));
  if (Math.abs(B.fov - B.fovSet) > .01 || (B.fov === fovT && B.fovSet !== fovT)){ B.fovSet = B.fov; cam.fov = B.fov; cam.updateProjectionMatrix(); }
  for (const a of W.anims) a(dt);
  if (DRILL && !lockLost) DRILL.update(dt);
  // the camera last, after anything (a drill) that moves or turns you: what the mouse did this frame is on screen this frame
  cam.position.set(P.x + cos*B.x, P.eye + B.y + P.drillY + P.bobY, P.z - sin*B.x);
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  if (LIFE.zone === "ground") tunnel();
  held = DRILL ? null : (grab || target());
  hud(held);
}
// tired legs and an empty stomach slow you down a little — gradually, never in a sudden step
function legs(){
  const s = G(); if (!s) return 1;
  return 1 - Math.min(.15, Math.max(0, (s.fatigue || 0) - 70)/200) - Math.min(1, Math.max(0, 15 - (s.energy || 0))/10)*.08;
}
/* walking up to the tunnel: the match gets ready as you come, and starts when you reach it */
let tunnelInfo = null, tunnelGo = false, tunnelAge = 0;
// " · 2–1" for a game already played today, from the world's results
function playedScore(f){ const w = typeof gameWorld === "function" ? gameWorld() : null, d = w && w.done && w.done[f.key]; return d && d.hg != null ? ` · ${d.hg}–${d.ag}` : ""; }
function matchToday(){
  try {
    const me = meP(), f = todaysFixture();
    if (!f){
      const done = todaysFixture(true), n = nextFixture();
      if (done) return {ok:false, why:`Today's game is done${playedScore(done)}. ${n ? `Next: ${dayName(fixtureSlot(n).wd)} ${clockText(fixtureSlot(n).min)} vs ${oppName(n)}.` : "The bus home is by the gate."}`};
      return {ok:false, why:n ? `No match today. Next: ${dayName(fixtureSlot(n).wd)} ${clockText(fixtureSlot(n).min)} vs ${oppName(n)}.` : "No match today."};
    }
    const ko = fixtureSlot(f).min, label = `${sideName(f, "h")}  vs  ${sideName(f, "a")}`;
    if (me.inj > 0) return {ok:false, why:"You're injured — you'll watch this one from the stand.", label};
    if ((G().ban || 0) > 0) return {ok:false, why:`Suspended — ${G().ban} match${G().ban === 1 ? "" : "es"} to sit out.`, label};
    if (LIFE.min < ko - TUNNEL_OPEN) return {ok:false, why:`Kick-off is at ${clockText(ko)}. The tunnel opens at ${clockText(ko - TUNNEL_OPEN)}.`, label, early:true};
    if (LIFE.min > ko + 25) return {ok:false, why:"Too late — the game has kicked off without you.", label};
    return {ok:true, label, f};
  } catch(e){ return {ok:false, why:"No match today."}; }
}
function tunnel(){
  const bar = document.getElementById("lifeMatch"), fadeEl = document.getElementById("lifeFade");
  const d = Math.hypot(P.x, P.z + 27.2);
  if (d > 11 || tunnelGo || DRILL){ if (bar) bar.classList.remove("on"); if (!tunnelGo && fadeEl.dataset.tun){ fadeEl.style.opacity = "0"; delete fadeEl.dataset.tun; } tunnelInfo = null; return; }
  if (!tunnelInfo || ++tunnelAge > 45){ tunnelInfo = matchToday(); tunnelAge = 0; }
  bar.classList.add("on");
  bar.classList.toggle("off", !tunnelInfo.ok);
  bar.querySelector("b").textContent = tunnelInfo.label || (tunnelInfo.ok ? "" : "The tunnel is closed");
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
    if ((sp.aim && !sp.near) || (sp.when && !sp.when()) || sp.x == null) continue;
    if (Math.abs((sp.y || 1) - (P.feet + 1)) > 2.4) continue;
    const d = Math.hypot(sp.x - P.x, sp.z - P.z);
    if (d < sp.r && d < bd){ bd = d; best = sp; }
  }
  return best;
}

function use(sp){
  const p = document.getElementById("lifePrompt");
  if (p){ p.classList.remove("hit"); void p.offsetWidth; p.classList.add("hit"); }
  if (sp.kind === "drag"){ if (sp.toggle) sp.toggle(); return; }
  if (sp.run) sp.run();
}
/* ---------- the overlay ---------- */
let lastPrompt = null, hudCtxT = 0;
const hudMeters = {e:null, f:null};
function hud(near){
  const s = G(); if (!s) return;
  const c = document.getElementById("lifeClock");
  if (c){ const t = clockText(); if (c.textContent !== t) c.textContent = t; }
  const dn = document.getElementById("lifeDay");
  if (dn){ const t = todayName(); if (dn.textContent !== t) dn.textContent = t; }
  // one line of context under the clock, refreshed now and then
  if ((hudCtxT -= 1) <= 0){
    hudCtxT = 30;
    const cx = document.getElementById("lifeCtx");
    if (cx){
      const f = todaysFixture(), so = sessionOn();
      const t = f ? `Match · ${clockText(fixtureSlot(f).min)}` : so ? "Team training" : trainingDay() && LIFE.min < SESSION.start ? `Training ${clockText(SESSION.start)}` : "";
      if (cx.textContent !== t){ cx.textContent = t; cx.classList.toggle("on", !!t); cx.classList.toggle("match", !!f); }
    }
  }
  // the meters are only written when what they show has changed: no style work in a frame where nothing moved
  const ev = clamp(s.energy, 0, 100).toFixed(1), fv = clamp(s.fatigue, 0, 100).toFixed(1);
  if (ev !== hudMeters.e){ const en = document.getElementById("lifeEnergy"); if (en){ hudMeters.e = ev; en.style.width = ev + "%"; en.parentNode.parentNode.classList.toggle("low", s.energy < 25); } }
  if (fv !== hudMeters.f){ const fa = document.getElementById("lifeFatigue"); if (fa){ hudMeters.f = fv; fa.style.width = fv + "%"; fa.parentNode.parentNode.classList.toggle("low", s.fatigue > 75); } }
  FEED.moneySync();
  const p = document.getElementById("lifePrompt");
  if (!p) return;
  if (!near || modal || busy){ if (lastPrompt !== null){ p.classList.remove("on"); lastPrompt = null; } return; }
  if (lastPrompt !== near){ p.classList.remove("on"); void p.offsetWidth; lastPrompt = near; }
  p.classList.add("on");
  const lab = p.querySelector(".lp-label"), hin = p.querySelector(".lp-hint");
  if (lab.textContent !== near.label) lab.textContent = near.label;
  const hint = near.hint || "";
  if (hin.textContent !== hint) hin.textContent = hint;
  p.classList.toggle("drag", near.kind === "drag");
}
/* ---------- the host a drill drives the world through ---------- */
const host = {
  P, place:p => place(p), note, pass:(m, act) => pass(m, act),
  jump(h){ P.drillY = h; }, bob(y){ P.bobY = y; }, warm:() => warm(),
  endDrill(){ DRILL = null; P.drillY = 0; P.bobY = 0; }
};
function endDrillNow(){ if (DRILL && DRILL.input) DRILL.input("down", "escape"); DRILL = null; P.drillY = 0; P.bobY = 0; }

/* ---------- loop and entry ---------- */
let last = 0, frames = 0, saveT = 0, keysT = 0, shadowT = 0;
// Adaptive resolution with hysteresis: it steps down only after two slow seconds in a row, steps back up only
// after six smooth ones, and once a step up has had to be undone it stays down — the picture never pumps
// between two sizes (every change reallocates the canvas, which is itself a hitch). A new size is only ever applied
// at the top of a frame, before it is drawn: resizing the canvas clears it, and done after the render it would put
// one blank frame on screen.
const Q = {scale:1, acc:0, n:0, slow:0, good:0, t:0, upAt:-1e9, noUp:false, pending:false};
function quality(real){
  Q.acc += real; Q.n++; Q.t += real;
  if (Q.acc < 1) return;
  const fps = Q.n/Q.acc; Q.acc = 0; Q.n = 0;
  Q.slow = fps < 45 ? Q.slow + 1 : 0;
  Q.good = fps > 57 ? Q.good + 1 : 0;
  if (Q.slow >= 2 && Q.scale > .6){
    if (Q.t - Q.upAt < 15) Q.noUp = true;
    Q.scale = Math.max(.6, +(Q.scale - .1).toFixed(2)); Q.slow = Q.good = 0; Q.pending = true;
  } else if (Q.good >= 6 && Q.scale < 1 && !Q.noUp){
    Q.scale = Math.min(1, +(Q.scale + .1).toFixed(2)); Q.good = 0; Q.upAt = Q.t; Q.pending = true;
  }
}
function skyStep(real){
  if (!SKY) return;
  const h = hour();
  SKY.update(h, P, real);
  SKY.lights(real || .016, {x:P.x, y:P.eye, z:P.z});
  skyT -= real;
  if (skyT <= 0 || forceSky){ skyT = .5; SKY.refresh(renderer, scene, h, P, forceSky); forceSky = false; }
}
function loop(t){
  if (!LIFE.running) return;
  frames++;
  const real = Math.max(0, (t - last)/1000 || 0), dt = Math.min(.05, real); last = t;
  if (Q.pending) resize();
  step(dt, Math.min(real, .5));
  // the clock runs on its own, faster while you are on the move; it stops while a panel or the hub is up
  if (busy) stepBusy(Math.min(real, .1));
  else if (!modal && !DRILL && !tutOn() && document.pointerLockElement){ pass(Math.min(real, .1)*(moving ? TIME_RATE_MOVING : TIME_RATE), moving ? "walk" : "idle"); }
  skyStep(Math.min(real, .1));
  if (LIFE.zone === "home") homeTick();
  // something that throws a shadow has moved (a door swinging): redraw the sun's shadows, at most five times a second
  if (W.shadowDirty && (shadowT -= real) <= 0){ W.shadowDirty = false; shadowT = .2; renderer.shadowMap.needsUpdate = true; }
  renderer.render(scene, cam);
  if (real > 0 && real < .5) quality(real);
  // a save every 45 s or so, but only at a quiet moment (see persist); after two minutes of never stopping, anyway
  if ((saveT += real) > 45){ saveDue = true; saveT = 0; }
  if (saveDue){
    saveDueT += real;
    const still = !P.speed && !Object.keys(keys).some(k => keys[k]) && performance.now() - mouseT > 1200 && !grab;
    if (!busy && ((still && !DRILL) || modal || !document.pointerLockElement) || saveDueT > 120) saveNowIf();
  }
  keysT += real; if (keysT > 22) document.getElementById("lifeKeys").classList.add("faded");
  if (DAILY.seasonPending && !busy && !modal && !DRILL) seasonOver();
  raf = requestAnimationFrame(loop);
}
// the season ended in the night: the hub comes up with the end-of-season screen
function seasonOver(){
  const sum = DAILY.seasonPending; DAILY.seasonPending = null;
  if (window.lifeHub) window.lifeHub();
  setTimeout(() => { if (typeof screenSeasonEnd === "function") screenSeasonEnd(sum); }, 650);
}
function boot(){
  if (renderer) return;
  const cv = document.getElementById("lifeCanvas");
  renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true, powerPreference:"high-performance"});
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;                 // shadows are redrawn only when the sun or you have moved
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(74, 1, .05, 600);
  SKY = createSky(renderer);
  resize(); addEventListener("resize", () => { Q.pending = true; });
  bindInput(cv);
}
function mailNews(){
  const n = checkMail();
  if (n){ drawMail(); setTimeout(() => note(`📬 ${n === 1 ? "A letter has" : n + " letters have"} arrived in your mailbox downstairs.`), 900); }
  return n;
}
export function startLife(opts = {}){
  const s = G(); if (!s) return;
  ensureHome(); dailyEnsure(); sync();
  document.getElementById("lifeRoot").style.display = "block";
  boot();
  FEED.reset(); FEED.moneySync(true);
  const zone = opts.zone || "home";
  enterZone(zone, opts.at || (zone === "home" ? "bed" : "bus"));
  if (zone === "ground") arriveForTraining();
  LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop);
  keysT = 0; document.getElementById("lifeKeys").classList.remove("faded");
  const h = s.home, first = h.letters.some(l => !l.read) && LIFE.day === 1;
  const f = todaysFixture();
  note(opts.msg || (first ? `This is your flat, ${h.apt}. Your uncle paid the first three months — check your mailbox in the lobby.`
    : f ? `${todayName()}, ${clockText()}. Match day — kick-off at ${clockText(fixtureSlot(f).min)}.` : `${todayName()}, ${clockText()}. ${trainingDay() ? `Training is at ${clockText(SESSION.start)} — the bus takes ${BUS_MIN} minutes.` : todayLine() + "."}`));
  mailNews();
}
export function stop(){ if (saveDue) saveNowIf(); LIFE.running = false; if (raf) cancelAnimationFrame(raf); raf = null; grab = null; document.exitPointerLock && document.exitPointerLock(); }
export function resumeLife(){
  if (!document.body.classList.contains("life") || !renderer) return;
  if (LIFE.zone === "home") homeRefresh(); else refreshGymFridge();
  tunnelInfo = null; sync(); forceSky = true;
  mailNews();
  if (!LIFE.running){ document.getElementById("lifeRoot").style.display = "block"; LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
}
function resize(){
  Q.pending = false;
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)*Q.scale*(typeof GFX !== "undefined" && GFX.low ? .85 : 1));
  renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix();
}
// raw mouse counts where the browser allows it (no OS acceleration, and free of the stray jumps some browsers
// put in accelerated pointer-lock movement); anything else falls back to an ordinary lock
let rawMouse = false, freshLock = false;
function lock(cv){
  if (!LIFE.running || locked() || document.pointerLockElement === cv) return;
  const plain = () => { rawMouse = false; try { const q = cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch(e){} };
  try {
    const p = cv.requestPointerLock({unadjustedMovement:true});
    if (p && p.then) p.then(() => { rawMouse = true; }, plain); else rawMouse = false;
  } catch(e){ plain(); }
}
/* Stray jumps. Ordinary (non-raw) pointer lock in some browsers now and then reports one event with a jump in it
   (the cursor being warped back to the centre). Chrome also adds up a whole frame's movement into one event, so the
   first event of a real flick from rest looks just as sudden — size alone cannot tell them apart; what comes next
   can. So in non-raw input an event far bigger than the movement just before it is held back for one frame: the
   next event confirms it (same way, not tiny next to it: a hand slows down, it does not stop dead) and both turn
   the view; an event the other way, or a tiny one, shows it was a jump, and it is dropped; no event on that axis
   at all (a single quick flick, then stillness) and it is applied on the next frame. Raw input never jumps, and
   nothing in it is ever held. */
const MA = {x:{prev:0, hold:0, age:0}, y:{prev:0, hold:0, age:0}, t:0};
function mouseAxis(a, m){
  let out = 0;
  if (a.hold && m){
    if (Math.sign(m) === Math.sign(a.hold) && Math.abs(m) >= Math.abs(a.hold)/8){ out += a.hold; a.prev = a.hold; }
    a.hold = 0;
  }
  if (!m) return out;
  if (!rawMouse && Math.abs(m) > 250 && Math.abs(m) > 8*(Math.abs(a.prev) + 12)){ a.hold = m; a.age = 0; }
  else out += m;
  a.prev = m;
  return out;
}
// once a frame, before the camera is set: a held event that nothing contradicted is let through
function mouseFrame(){
  if (performance.now() - MA.t > 60) MA.x.prev = MA.y.prev = 0;          // a flick from rest is judged from rest
  let mx = 0, my = 0;
  if (MA.x.hold && ++MA.x.age >= 2){ mx = MA.x.hold; MA.x.hold = 0; }
  if (MA.y.hold && ++MA.y.age >= 2){ my = MA.y.hold; MA.y.hold = 0; }
  if (mx || my) look(mx, my);
}
function look(mx, my){
  if (grab){ dragBy(mx, my); return; }
  if (DRILL && DRILL.lockLook) return;
  P.yaw -= mx*.0021;
  P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - my*.0021));
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
  document.addEventListener("pointerlockchange", () => {
    const on = document.pointerLockElement === cv;
    lockLost = !on && !!DRILL;
    freshLock = on; MA.x.prev = MA.y.prev = MA.x.hold = MA.y.hold = 0;
    const dh = document.getElementById("lifeDrill"); if (dh) dh.classList.toggle("paused", lockLost);
  });
  addEventListener("mousedown", e => {
    if (e.button !== 0 || document.pointerLockElement !== cv) return;
    if (DRILL){ DRILL.input("down", "mouse"); return; }
    if (held && held.kind === "drag") grab = held;
  });
  addEventListener("mouseup", e => { if (e.button !== 0) return; grab = null; if (DRILL && document.pointerLockElement === cv) DRILL.input("up", "mouse"); });
  addEventListener("mousemove", e => {
    if (document.pointerLockElement !== cv || locked()) return;
    let mx = e.movementX || 0, my = e.movementY || 0;
    // the first event after the lock is taken can carry the jump of the cursor into the lock
    if (freshLock){ freshLock = false; if (Math.abs(mx) > 100 || Math.abs(my) > 100) return; }
    mouseT = MA.t = performance.now();
    mx = mouseAxis(MA.x, mx); my = mouseAxis(MA.y, my);
    // the view turns here, once per event, with no smoothing; step() puts it on the camera before this frame is drawn
    if (mx || my) look(mx, my);
  });
  addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing || !document.body.classList.contains("life") || document.body.classList.contains("in-match")) return;
    if (mailOpen()){ if (e.key === "Escape"){ e.preventDefault(); closeMail(); } return; }
    if (window.lifePanelOpen && window.lifePanelOpen()) return;
    if (window.lifeMode && window.lifeMode() === "hub") return;
    const k = e.key.toLowerCase();
    if (["w","a","s","d","e","shift"," "].includes(k)) e.preventDefault();
    if (DRILL){
      if (k === "escape" || k === " " || k === "e"){ if (!e.repeat) DRILL.input("down", k); }
      keys[k === " " ? "space" : k] = true;
      return;
    }
    keys[k === " " ? "space" : k] = true;
    if (k === "h" && !e.repeat){ const el = document.getElementById("lifeKeys"); el.classList.toggle("faded"); keysT = -999; }
    if (k === "e" && !e.repeat && !locked()){ const t = held || target(); if (t) use(t); }
  });
  addEventListener("keyup", e => {
    const k = e.key.toLowerCase(); keys[k === " " ? "space" : k] = false;
    if (DRILL && k === " ") DRILL.input("up", " ");
  });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; grab = null; });
}
window.LIFE = LIFE; window.startLife = startLife; window.stopLife = stop; window.resumeLife = resumeLife;
// handles for automated tests
window.__life = {P, keys, B, Q, W, HOME, LIFE, get spots(){ return W.spots; }, get solids(){ return W.solids; }, get bounds(){ return W.bounds; },
  get frames(){ return frames; }, get held(){ return held; }, get grab(){ return grab; }, set grab(v){ grab = v; }, get cam(){ return cam; }, get drill(){ return DRILL; },
  get busy(){ return busy; }, get rawMouse(){ return rawMouse; }, GAIT, E, step:(dt) => step(dt, dt), warm, target, enterZone, place, dragBy, mailOpen, pass, ctx, use, renderer:() => renderer, scene:() => scene, sky:() => SKY,
  drillInput:(type, k) => DRILL && DRILL.input(type, k), stepBusy};
