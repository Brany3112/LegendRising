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
import {startDrill, startReps, startSession, drillWarmup} from "./drills.js";
import {human, animateHuman, BONE, VIEW} from "./human.js";
import {bodyLook} from "./look.js";

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
  water, work, bath, iceBath, warm:() => warm(), look:() => { if (typeof openLookEditor === "function") openLookEditor("mirror"); }};

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
  meDispose(); clearScene(); begin(scene);
  if (zone === "ground"){ resetHome(); spawns = buildGround(ctx); }
  else { GROUND.fridge = null; spawns = buildHome(ctx); }
  camGridBuild();
  meBuild();
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
  // a drill's rings, lamp and ball are only built when it starts: draw a set of them now, so none compiles mid-play
  const props = LIFE.zone === "ground" ? drillWarmup() : null;
  if (props){ props.visible = false; scene.add(props); }
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
  if (props){ scene.remove(props); props.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
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
const P = {x:0, z:0, feet:0, eye:1.62, eyeH:1.62, yaw:0, pitch:0, vx:0, vz:0, vy:0, drillY:0, bobY:0,
  speed:0, moveMode:"idle", stride:0, sprint:0};
let EYE = 1.62;                                       // your eye height: set from your body's height (meBuild)
const R = .26, REACH = 2.5;
const GAIT = {walk:4.0, run:6.0, sprint:7.6, back:.8, accel:26, brake:24, turn:24, sprintIn:1.1, sprintOut:2.5};
const keys = {};
let held = null, grab = null, lockLost = false;
const B = {amt:0, y:0, yv:0, x:0, xv:0, fov:74, fovSet:74};     // head bob springs and the field of view
const E = {g:0, a:0, av:0, b:0, bv:0};                          // the ground the eye rides on (g), and its offsets from it: slopes (a), steps (b)
function place(p){
  P.x = p.x; P.z = p.z; P.feet = p.y || 0; P.eye = P.feet + EYE; P.yaw = p.yaw || 0; P.pitch = 0;
  P.vx = P.vz = P.vy = 0; P.speed = 0; P.sprint = 0; P.moveMode = "idle";
  B.amt = B.y = B.yv = B.x = B.xv = 0; E.g = P.feet; E.a = E.av = E.b = E.bv = 0; tunnelGo = false; tunnelInfo = null;
  ME.yaw = P.yaw; ME.tw = 0; ME.look = 0;                // your body turns up facing the way you do
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
      if (nx < b.x0 || nx > b.x1){ nx = Math.max(b.x0, Math.min(b.x1, nx)); P.vx = 0; }
      P.x = nx;
    }
    if (dz){
      let nz = P.z + dz; const s = hits(P.x, nz);
      if (s){ nz = dz > 0 ? s.z0 - R - 1e-3 : s.z1 + R + 1e-3; if (hits(P.x, nz)) nz = P.z; P.vz = 0; dz = 0; }
      if (nz < b.z0 || nz > b.z1){ nz = Math.max(b.z0, Math.min(b.z1, nz)); P.vz = 0; }
      P.z = nz;
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
  const lk = locked(), canMove = !lk && (!DRILL || DRILL.allowMove);
  if (!lk) mouseFrame(); else MA.x.hold = MA.y.hold = 0;
  let f = 0, r = 0;
  if (canMove){
    f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len){ f /= len; r /= len; }
  const run = !!keys.shift && !!len && !DRILL;
  // a long frame (under 20 fps) is lived in equal slices of at most 1/20 s: the world keeps real time — a walk is
  // 4 m a second at any frame rate — and nothing (the springs, a drill's ball, a figure's animation) takes a step
  // longer than it was made for
  const n = Math.max(1, Math.ceil(dt/.05 - 1e-6)), h = dt/n;
  for (let i = 0; i < n; i++){
    body(h, f, r, len, run);
    for (const a of W.anims) a(h);
    if (DRILL && !lockLost) DRILL.update(h);
  }
  // a slightly wider view at a sprint, eased in and out
  const fovT = 74 + 4*P.sprint*P.sprint*(3 - 2*P.sprint);
  B.fov = Math.abs(fovT - B.fov) < .005 ? fovT : B.fov + (fovT - B.fov)*(1 - Math.exp(-5*dt));
  if (Math.abs(B.fov - B.fovSet) > .01 || (B.fov === fovT && B.fovSet !== fovT)){ B.fovSet = B.fov; cam.fov = B.fov; cam.updateProjectionMatrix(); }
  // the camera last, after anything (a drill) that moves or turns you: what the mouse did this frame is on screen this frame
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  viewStep(dt);
  meStep(dt);
  if (LIFE.zone === "ground") tunnel();
  held = DRILL ? null : (grab || target());
  hud(held);
}
// are you pressed up against something (a wall, the edge of the zone, a drill's box) on that side?
function touching(sx, sz){
  const b = DRILL && DRILL.moveBox ? DRILL.moveBox : W.bounds;
  if (sx > 0 ? P.x >= b.x1 - 1e-4 : sx < 0 && P.x <= b.x0 + 1e-4) return true;
  if (sz > 0 ? P.z >= b.z1 - 1e-4 : sz < 0 && P.z <= b.z0 + 1e-4) return true;
  stuck = null; stuck = hits(P.x, P.z);
  return !!hits(P.x + sx*.01, P.z + sz*.01);
}
// one slice of moving: speed, steering, walls, the ground under you, the eye height and the bob
function body(dt, f, r, len, run){
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
  let tx = (r*cos - f*sin)*sp, tz = (-r*sin - f*cos)*sp;
  // up against a wall, the part of where you want to go that is into it is taken out first (every solid is a box, so
  // that is one axis): you slide along it at what your push along it is worth — sp·sin of the angle — whatever the
  // frame rate, and the steering below never mistakes what the wall left of your velocity for the way you are going
  if (tx && touching(Math.sign(tx), 0)) tx = 0;
  if (tz && touching(0, Math.sign(tz))) tz = 0;
  const tl = Math.hypot(tx, tz), v0 = Math.hypot(P.vx, P.vz);
  let turned = false;
  if (tl > .05 && v0 > .05){
    const hv = Math.atan2(P.vz, P.vx);
    let d = Math.atan2(tz, tx) - hv; d -= Math.round(d/(2*Math.PI))*2*Math.PI;
    if (Math.abs(d) < 2.45){
      const a = hv + Math.max(-GAIT.turn*dt, Math.min(GAIT.turn*dt, d)), s1 = v0 + Math.max(-GAIT.brake*dt, Math.min(GAIT.accel*dt, tl - v0));
      P.vx = Math.cos(a)*s1; P.vz = Math.sin(a)*s1; turned = true;
    }
  }
  if (!turned){
    let dvx = tx - P.vx, dvz = tz - P.vz;
    const dl = Math.hypot(dvx, dvz), lim = (tl ? GAIT.accel : GAIT.brake)*dt;
    if (dl > lim){ dvx *= lim/dl; dvz *= lim/dl; }
    P.vx += dvx; P.vz += dvz;
  }
  if (!tl && Math.hypot(P.vx, P.vz) < .02) P.vx = P.vz = 0;
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
}
// tired legs and an empty stomach slow you down a little — gradually, never in a sudden step
function legs(){
  const s = G(); if (!s) return 1;
  return 1 - Math.min(.15, Math.max(0, (s.fatigue || 0) - 70)/200) - Math.min(1, Math.max(0, 15 - (s.energy || 0))/10)*.08;
}
/* ---------- your body ----------
   You are drawn by the same character system as everybody else (human.js), dressed from your look (S.player.look,
   see look.js): your own clothes at home and in the street, the club's training kit with your number at the ground.
   Two bodies are kept: the first-person one (no head — the body ends at the shoulders) and the whole you for third
   person; only one is ever shown. Both are animated every frame from what you actually did (P.speed, after walls).
   First person: the body faces where you look, and the camera sits a little in front of its neck — further forward
   as you look down, as a real head bends over, so you see your chest, legs and shoes and never the inside of a neck.
   Walking sideways the hips turn towards where you are going and the chest stays with the view (no feet sliding
   sideways); walking backwards the stride runs backwards. Its height follows the camera's own smoothed eye, so on a
   kerb or a stair landing the body can never rise into the view. */
const ME = {fp:null, tp:null, kind:"", scale:1, yaw:0, tw:0, back:false, dph:0, act:null, camT:0, dist:0, sh:0, up:.12, hold:0, yawV:0, lastYaw:0, short:0, px:0, pz:0, tpShown:false, look:0};
const TPV = {dist:2.65, sprint:.35, up:.12, side:.36, margin:.16, minShow:.62, inSpeed:8};    // the third-person camera
const meKind = () => LIFE.zone === "ground" ? "training" : "casual";
function meDispose(){ for (const k of ["fp", "tp"]) if (ME[k]){ ME[k].dispose(); ME[k] = null; } }
function meBuild(){
  meDispose();
  const s = G(); if (!s || !s.player || !scene) return;
  ME.kind = meKind();
  let look;
  try { look = bodyLook(s.player.look, ME.kind); } catch(e){ console.error(e); return; }
  ME.fp = human(look, {noHead:true, lod:false, track:true}); ME.fp.near.frustumCulled = false;
  ME.tp = human(look, {lod:false, track:true});
  ME.fp.g.name = "me-fp"; ME.tp.g.name = "me-tp";
  scene.add(ME.fp.g, ME.tp.g);
  ME.scale = ME.fp.scale;
  // the eyes of a 1.80 m body are at 1.68 (human.js): yours, at your height
  const eye = Math.round(1.68*ME.scale*1000)/1000, d = eye - EYE;
  EYE = P.eyeH = eye; P.eye += d;
  ME.yaw = P.yaw; ME.tw = 0; ME.back = false; ME.act = null;
  meStep(0);
}
const wrapA = a => a - Math.round(a/(2*Math.PI))*2*Math.PI;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
// the state a body walks with, from what you actually did (look: where the head turns)
const _gs = {mode:"idle", speed:0, look:0};
function gaitState(look){
  if (ME.act) return ME.act;
  _gs.mode = P.speed > .05 ? "move" : "idle"; _gs.speed = P.speed; _gs.look = look;
  return _gs;
}
/* a stride played backwards: the phase is stepped back by what it would have gone forward (human.js keeps it in h.ph).
   Your legs also run at exactly the speed you move (h.v): human.js eases a person's leg speed in at 7 m/s², right for
   someone it moves, but you speed up faster than that and the feet would skate over the ground for the first steps */
function animateDir(h, dt, st, back){
  if (st === _gs && typeof h.v === "number") h.v = P.speed;
  const p0 = h.ph;
  if (back && typeof p0 === "number") h.ph = ((p0 - 2*ME.dph) % 1 + 1) % 1;
  const p1 = h.ph;
  animateHuman(h, dt, st);
  if (typeof h.ph === "number"){ let d = h.ph - p1; if (d < 0) d += 1; ME.dph = d < .25 ? d : 0; }
}
function meStep(dt){
  if (!ME.fp || !ME.tp) return;
  const tp = ME.tpShown, s = ME.scale;
  ME.fp.g.visible = !tp && !(DRILL && DRILL.hideBody);
  ME.tp.g.visible = tp;
  const mv = Math.atan2(-P.vx, -P.vz), going = P.speed > .3 && (P.vx || P.vz);
  if (tp){
    // third person: the body turns to face the way you are going, quickly but never in one frame
    if (going){ const d = wrapA(mv - ME.yaw), k = d*(1 - Math.exp(-11*dt)); ME.yaw = wrapA(ME.yaw + clamp(k, -9*dt, 9*dt)); }
    // the head turns to where the camera looks, as far as a neck goes, and lets go when you look back at yourself
    const rel = wrapA(P.yaw - ME.yaw), lk = clamp(rel, -1.1, 1.1)*(1 - sstep(1.7, 2.3, Math.abs(rel)));
    ME.look += (lk - ME.look)*(1 - Math.exp(-6*dt));
    const h = ME.tp;
    h.g.position.set(P.x, P.feet, P.z); h.g.rotation.y = ME.yaw + Math.PI;
    animateDir(h, dt, gaitState(ME.look), false);
    feetIK(h);
    return;
  }
  ME.yaw = P.yaw;
  // first person: the hips towards where you are going, the chest with the view; backwards, the stride runs back
  let tw = 0, back = false;
  if (going && !ME.act){
    let rel = wrapA(mv - P.yaw);
    if (Math.abs(rel) > 1.75){ back = true; rel = wrapA(rel - Math.PI); }
    tw = clamp(rel, -1.5, 1.5);
  }
  if (back !== ME.back && P.speed > .3){ ME.back = back; } else if (P.speed <= .3) ME.back = false;
  ME.tw += (tw - ME.tw)*(1 - Math.exp(-10*dt));
  // the body stands where you stand (the camera is the head, ahead of the neck: see viewStep)
  const h = ME.fp, sin = Math.sin(P.yaw), cos = Math.cos(P.yaw), sb = ME.short || 0;
  h.g.position.set(P.x + sin*sb + ME.px, P.eye - EYE + P.drillY, P.z + cos*sb + ME.pz); h.g.rotation.y = P.yaw + Math.PI;
  animateDir(h, dt, gaitState(0), ME.back);
  const bn = h.bones;
  if (Math.abs(ME.tw) > 1e-3){ bn[BONE.hips].rotation.y += ME.tw; bn[BONE.spine].rotation.y -= ME.tw*.55; bn[BONE.chest].rotation.y -= ME.tw*.45; }
  if (!P.drillY) feetIK(h);
  // whatever the body is doing (a lean into a sprint, a kick, a header), the neck stays below and behind the eye:
  // the body gives way, the camera never ends up inside it
  h.g.updateMatrixWorld(true);
  bn[BONE.neck].getWorldPosition(_nk);
  const c = cam.position, over = _nk.y - (c.y - .15*s), ahead = (_nk.x - c.x)*-sin + (_nk.z - c.z)*-cos + .06*s;
  if (over > 0) h.g.position.y -= over;
  if (ahead > 0){ h.g.position.x += sin*ahead; h.g.position.z += cos*ahead; }
}
const _nk = new THREE.Vector3();
/* Feet on stairs and kerbs. The walk is made for flat ground and the body rides the ramp along the stair nosings, so
   a planted foot would hang over a tread and a stepping foot would sink into the next riser. After each frame's pose:
   the surface under every foot is found (camCast, straight down onto the real treads), the hips come down as far as the
   lowest planted foot needs to stand on its tread, and any foot still below the surface is lifted onto it with a
   two-bone IK in world space (the knee folds, the leg swings about the hip, the foot keeps its angle). */
const FK = {legs:[[BONE.thL, BONE.shL, BONE.ftL, BONE.toL], [BONE.thR, BONE.shR, BONE.ftR, BONE.toR]], c:[0, 0], w:[0, 0]};
const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _A = new THREE.Vector3(), _T = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _t2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function surfaceUnder(x, y, z){ const top = y + .45, d = camCast(x, top, z, 0, -1, 0, .95); return d < .95 ? top - d : null; }
function feetIK(h){
  if (!CG.tri) return;
  const bn = h.bones, s = h.scale, base = h.g.position.y;
  h.g.updateMatrixWorld(true);
  let drop = 0, any = false;
  for (let i = 0; i < 2; i++){
    const [, , f, o] = FK.legs[i];
    bn[f].getWorldPosition(_A); bn[o].getWorldPosition(_T);
    const sole = Math.min(_A.y - .085*s, _T.y - .02*s);
    const a = surfaceUnder(_A.x, _A.y, _A.z), b = surfaceUnder(_T.x, _T.y, _T.z);
    if (a == null && b == null){ FK.c[i] = 0; FK.w[i] = 0; continue; }
    const surf = Math.max(a == null ? -1e9 : a, b == null ? -1e9 : b);
    FK.c[i] = surf - sole; FK.w[i] = 1 - sstep(.03, .2, sole - base);       // how planted the pose has this foot
    if (Math.abs(FK.c[i]) > .004) any = true;
    if (FK.c[i] < 0) drop = Math.min(drop, FK.c[i]*FK.w[i]);
  }
  if (!any) return;
  drop = Math.max(drop, -.24*s);
  if (drop < -1e-4){ h.g.position.y += drop; h.g.updateMatrixWorld(true); }
  // (a foot the hips came down with may now be below its own surface too: that is lifted the same way)
  for (let i = 0; i < 2; i++){ const lift = Math.min(FK.c[i] - drop, .42*s); if (lift > .003) legLift(h, FK.legs[i], lift); }
}
function legLift(h, [t, k, f], lift){
  const bn = h.bones;
  bn[t].getWorldPosition(_H); bn[k].getWorldPosition(_K); bn[f].getWorldPosition(_A);
  const L1 = _H.distanceTo(_K), L2 = _K.distanceTo(_A); if (L1 < 1e-4 || L2 < 1e-4) return;
  _T.copy(_A); _T.y += lift;
  const d1 = Math.min(_H.distanceTo(_T), (L1 + L2)*.998);
  _u.subVectors(_K, _H).normalize(); _v.subVectors(_A, _K).normalize();
  const b0 = Math.acos(clamp(_u.dot(_v), -1, 1)), b1 = Math.acos(clamp((d1*d1 - L1*L1 - L2*L2)/(2*L1*L2), -1, 1));
  _n.crossVectors(_u, _v); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0).applyQuaternion(bn[t].getWorldQuaternion(_q1)); _n.normalize();
  bn[t].getWorldQuaternion(_qt); bn[k].getWorldQuaternion(_qs); bn[f].getWorldQuaternion(_qf); bn[t].parent.getWorldQuaternion(_qp);
  // the knee folds to the new reach...
  _q1.setFromAxisAngle(_n, b1 - b0);
  _v.subVectors(_A, _K).applyQuaternion(_q1); _t2.copy(_K).add(_v);           // where the ankle is now
  _qs.premultiply(_q1);
  // ...and the whole leg swings about the hip to put the ankle on the target
  _q2.setFromUnitVectors(_u.subVectors(_t2, _H).normalize(), _v.subVectors(_T, _H).normalize());
  _qt.premultiply(_q2); _qs.premultiply(_q2);
  bn[t].quaternion.copy(_qp.invert().multiply(_qt));
  bn[k].quaternion.copy(_q1.copy(_qt).invert().multiply(_qs));
  bn[f].quaternion.copy(_q2.copy(_qs).invert().multiply(_qf));
  bn[t].updateMatrixWorld(true);
}
window.lifeLookChanged = () => { if (scene && renderer) meBuild(); };

/* ---------- the camera: first person, or third person behind you ----------
   V switches between them (kept in the save, S.life.view). Third person orbits behind and above you over the right
   shoulder; the mouse turns it at once, exactly as in first person, and W A S D go the way it looks. Whatever is
   between you and the camera pulls it in at once — walls, doors, furniture, ceilings, stairs, glass — tested against
   the real drawn geometry of the place (camGrid) and the collision boxes (doors that open); it eases back out when
   the way is clear. Drills, panels, the bus and the tunnel are lived in first person; third person comes back after. */
const viewPref = () => { const s = G(); return s && s.life && s.life.view === "tp" ? "tp" : "fp"; };
const fadeOn = () => { const f = document.getElementById("lifeFade"); return !!(f && (f.dataset.tun || +f.style.opacity > .02)); };
const forcedFP = () => !!(DRILL || modal || busy || tutOn() || tunnelGo || fadeOn());
function toggleView(){
  const s = G(); if (!s || !s.life) return;
  s.life.view = viewPref() === "tp" ? "fp" : "tp"; persist();
  if (forcedFP()) note(s.life.view === "tp" ? "Third person comes back when you're done here." : "First person.");
}
const _cp = new THREE.Vector3(), _cd = new THREE.Vector3(), _cd2 = new THREE.Vector3(), _cv = new THREE.Vector3();
// how far the near plane's corners reach from the eye, and a little more: nothing may come nearer the camera than this
function camRadius(){ const t = Math.tan(cam.fov*Math.PI/360), a = cam.aspect || 1; return Math.max(.1, cam.near*Math.sqrt(1 + t*t*(1 + a*a)) + .025); }
/* the near plane is not a point: anything nearer the camera than r on any side (a wall, a door jamb's edge, the slope
   under a stair, a cabinet with no collision box) pushes it away — 26 short rays (the faces, edges and corners of a
   cube), the push along each axis the deepest one asks for, never through something on the other side; a second
   pass takes up what an oblique surface left */
const PUSH = (() => { const o = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++){ const L = Math.hypot(x, y, z); if (L) o.push([x/L, y/L, z/L]); }
  return o; })();
function camPush(v, r){
  let moved = 0;
  for (let pass = 0; pass < 2; pass++){
    let px = 0, nx = 0, py = 0, ny = 0, pz = 0, nz = 0;
    for (const [dx, dy, dz] of PUSH){
      const h = camCast(v.x, v.y, v.z, dx, dy, dz, r); if (h >= r) continue;
      const k = r - h;
      if (dx > 0) nx = Math.max(nx, k*dx); else if (dx < 0) px = Math.max(px, -k*dx);
      if (dy > 0) ny = Math.max(ny, k*dy); else if (dy < 0) py = Math.max(py, -k*dy);
      if (dz > 0) nz = Math.max(nz, k*dz); else if (dz < 0) pz = Math.max(pz, -k*dz);
    }
    const mx = px - nx, my = py - ny, mz = pz - nz, L = Math.hypot(mx, my, mz);
    if (L < 2e-3) break;
    const k = Math.max(0, Math.min(L, camCast(v.x, v.y, v.z, mx/L, my/L, mz/L, L + .03) - .03))/L;
    v.x += mx*k; v.y += my*k; v.z += mz*k; moved += L*k;
    if (k < 1) break;
  }
  return moved;
}
// can the camera at (x, y, z) see you — your head and your chest — from (hx, hz), or is a wall, a jamb or a door between?
function seesMe(x, y, z, hx = P.x, hz = P.z){
  for (const ty of [P.eye, P.eye - .5*ME.scale]){
    const dx = x - hx, dy = y - ty, dz = z - hz, D = Math.hypot(dx, dy, dz);
    if (D > .15 && camCast(hx, ty, hz, dx/D, dy/D, dz/D, D) < D - .1) return false;
  }
  return true;
}
function viewStep(dt){
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw), r = camRadius();
  /* first person: the eye, with the bob, a little ahead of your neck — further as you look well down, as a head bends
     over the chest (so you see your legs and shoes and never the inside of a neck) — and never nearer than r to
     anything in front of it: straight ahead and 40° to either side */
  const ahead0 = (.07 + .15*sstep(.75, 1.35, -P.pitch))*ME.scale;
  let ahead = ahead0;
  for (const a of [0, .7, -.7]){
    const ca = Math.cos(a), sa = Math.sin(a), dx = -sin*ca + cos*sa, dz = -cos*ca - sin*sa;
    ahead = Math.min(ahead, (camCast(P.x, P.eye, P.z, dx, 0, dz, ahead0*ca + r + .02) - r)/ca);
  }
  ahead = Math.max(0, ahead);
  ME.short = ahead0 - ahead;                                // a wall in the way: the body leans back from it instead
  _cv.set(P.x + cos*B.x - sin*ahead, P.eye + B.y + P.drillY + P.bobY - .035*sstep(.3, 1.2, -P.pitch), P.z - sin*B.x - cos*ahead);
  // anything else nearer than r (a jamb's edge beside you, a cabinet with no collision box) moves the eye — and the
  // body with it — the few centimetres it takes (only while the first-person view is the one you see)
  const fpEye = () => { const x0 = _cv.x, z0 = _cv.z; camPush(_cv, r); ME.px = _cv.x - x0; ME.pz = _cv.z - z0; };
  const want = viewPref() === "tp" && !forcedFP() ? 1 : 0;
  // a panel, the bus, a drill: straight into first person; V: a short glide either way
  if (!want && (modal || busy || DRILL || fadeOn())) ME.camT = 0;
  else ME.camT = want ? Math.min(1, ME.camT + dt/.38) : Math.max(0, ME.camT - dt/.28);
  const e = sstep(0, 1, ME.camT);
  if (e <= 0){ fpEye(); cam.position.copy(_cv); ME.tpShown = false; ME.dist = ME.sh = ME.hold = 0; ME.up = TPV.up; return; }
  if (e < 1 || !ME.tpShown) fpEye(); else ME.px = ME.pz = 0;
  const fx = _cv.x, fy = _cv.y, fz = _cv.z;
  /* third person: a pivot over your head and out over the right shoulder, the camera back from it along the view.
     The orbit's own pitch is limited so it neither digs into the floor nor goes over the top. */
  const fresh = !ME.tpShown;
  const hx = P.x, hz = P.z, rx = cos, rz = -sin;
  const po = clamp(P.pitch, -1.15, .75), cp = Math.cos(po);
  _cd.set(sin*cp, -Math.sin(po), cos*cp);                      // from the pivot towards the camera (behind the view)
  // and where it is swinging to as you turn (the last frames' turn, a moment ahead)
  const yv = fresh || !(dt > 0) ? 0 : wrapA(P.yaw - ME.lastYaw)/dt; ME.lastYaw = P.yaw;
  ME.yawV = fresh ? 0 : ME.yawV + (yv - ME.yawV)*(1 - Math.exp(-12*dt));
  const ya = P.yaw + clamp(ME.yawV*.16, -.6, .6);
  _cd2.set(Math.sin(ya)*cp, _cd.y, Math.cos(ya)*cp);
  const want0 = (TPV.dist + TPV.sprint*P.sprint)*e, sw = TPV.side*e;
  // where your head will be in a moment: what is coming (a doorway, a lintel, a jamb) is made room for before you get there
  let ax = hx, az = hz;
  const vl = Math.hypot(P.vx, P.vz);
  if (vl > .3){ const L = clamp(camCast(hx, P.eye, hz, P.vx/vl, 0, P.vz/vl, vl*.3 + .3) - .3, 0, vl*.3); ax += P.vx/vl*L; az += P.vz/vl*L; }
  // how far back the camera can go from a pivot at (x, z), s out over the shoulder, u above your eyes: the drawn
  // geometry and the doors, less a margin
  const reach = (x, z, s, u, c = _cd) => clamp(camCast(x + rx*s, P.eye + u, z + rz*s, c.x, c.y, c.z, want0 + TPV.margin) - TPV.margin, 0, want0);
  // its height: over your head — or lower, ducking under a door's lintel or a low ceiling, when the way back from
  // over your head is (or in a moment will be) blocked close behind you and a lower one is not
  let uG = TPV.up;
  { const ok = u => Math.min(reach(hx, hz, 0, u), reach(ax, az, 0, u));
    let best = ok(TPV.up);
    if (best < .75*want0) for (const u of [-.14, -.34]){ const v = ok(u); if (v > best + .3){ best = v; uG = u; } } }
  ME.up = fresh ? uG : ME.up + (uG - ME.up)*(1 - Math.exp(-(uG < ME.up ? 12 : 3)*dt));
  const hy = P.eye + ME.up;
  // the shoulder: as far out as the room beside the head allows — beside it now, where it is going, and back along
  // the camera's path, so a door recess or an alcove beside you does not throw the camera at the wall behind
  const room0 = camCast(hx, hy, hz, rx, 0, rz, sw + TPV.margin);
  const back = camCast(hx, hy, hz, _cd.x, _cd.y, _cd.z, want0);
  let room = Math.min(room0, camCast(ax, hy, az, rx, 0, rz, sw + TPV.margin));
  for (const k of [.5, 1]){ const t = back*k - r; if (t > .2) room = Math.min(room, camCast(hx + _cd.x*t, hy + _cd.y*t, hz + _cd.z*t, rx, 0, rz, sw + TPV.margin)); }
  const shMax = clamp(room0 - r, 0, sw);                       // the pivot itself never nearer a wall than the camera may be
  let shG = clamp(room - TPV.margin, 0, sw);
  /* it must also see you: a jamb or a wall between the camera and your head or chest (you in a doorway, it in the
     room behind) first brings it over your head, then closer in, until you are in view — in view now and also where
     you will be in a moment and where the camera is swinging to (so it starts moving in before you are cut off) if
     it can be, just now if not, your own eyes if nowhere */
  const moving = ax !== hx || az !== hz, turning = Math.abs(ME.yawV) > .3;
  const at = (s, d, ahead) => seesMe(hx + rx*s + _cd.x*d, hy + _cd.y*d, hz + rz*s + _cd.z*d)
    && (!ahead || !moving || seesMe(ax + rx*s + _cd.x*d, hy + _cd.y*d, az + rz*s + _cd.z*d, ax, az))
    && (!ahead || !turning || seesMe(hx + rx*s + _cd2.x*d, hy + _cd2.y*d, hz + rz*s + _cd2.z*d));
  let dG = reach(hx, hz, shG, ME.up);
  if (dG > 0 && !at(shG, dG, true)){
    const d0 = reach(hx, hz, 0, ME.up), C = [[shG, dG], [0, d0]];
    for (const f of [.88, .76, .64, .53, .43, .34, .26]) if (d0*f >= TPV.minShow) C.push([0, d0*f]);
    let pick = null;
    for (const ahead of [true, false]){ for (const c of C) if ((ahead || c !== C[0]) && at(c[0], c[1], ahead)){ pick = c; break; } if (pick) break; }
    if (pick && pick !== C[0]){ shG = pick[0]; dG = pick[1]; } else if (!pick){ shG = 0; dG = 0; }
  }
  // the shoulder eases both ways (quickly in, gently out), but never past what the room beside the head allows
  ME.sh = fresh ? shG : ME.sh + (shG - ME.sh)*(1 - Math.exp(-(shG < ME.sh ? 16 : 4.5)*dt));
  ME.sh = Math.min(ME.sh, shMax);
  /* the distance: anything in the camera's way pulls it in at once (it is never inside or behind a wall); a wall
     that will be behind it in a moment, or not seeing you, brings it in quickly but smoothly; it goes back out
     gently, and not until the way has stayed clear a moment */
  const hard = reach(hx, hz, ME.sh, ME.up);
  let d = Math.min(hard, dG, turning ? reach(hx, hz, ME.sh, ME.up, _cd2) : hard);
  if (moving) for (const k of [.35, .7, 1]) d = Math.min(d, reach(hx + (ax - hx)*k, hz + (az - hz)*k, ME.sh, ME.up));
  ME.hold = Math.max(0, ME.hold - dt);
  if (fresh){ ME.dist = d; ME.hold = .2; }
  else {
    if (hard < ME.dist){ ME.dist = hard; ME.hold = .2; }
    if (d < ME.dist - 1e-3){ ME.dist += Math.max((d - ME.dist)*(1 - Math.exp(-14*dt)), -TPV.inSpeed*dt); ME.hold = .2; }
    else if (!ME.hold) ME.dist += (d - ME.dist)*(1 - Math.exp(-4.5*dt));
  }
  const place = () => { _cp.set(hx + rx*ME.sh + _cd.x*ME.dist, hy + _cd.y*ME.dist, hz + rz*ME.sh + _cd.z*ME.dist); camPush(_cp, r); };
  place();
  // whatever the easing, it never stays where you are out of sight (a jamb swinging in as you turn): it goes straight
  // to the place found above that sees you
  if (!seesMe(_cp.x, _cp.y, _cp.z)){ ME.sh = Math.min(shG, shMax); ME.dist = dG; ME.hold = .2; place(); }
  // gliding between the eye and the orbit
  if (e < 1) _cp.set(fx + (_cp.x - fx)*e, fy + (_cp.y - fy)*e, fz + (_cp.z - fz)*e);
  // too close to the head to show it (backed into a corner, nowhere it can see you from): your own eyes, until there is room
  const away = Math.hypot(_cp.x - P.x, _cp.y - (P.eye + .05), _cp.z - P.z);
  const show = ME.tpShown ? away > TPV.minShow - .06 : away > TPV.minShow;
  if (!show && ME.tpShown){ fpEye(); }
  ME.tpShown = show;
  if (show) cam.position.copy(_cp); else cam.position.set(_cv.x, _cv.y, _cv.z);
}

/* the camera's collision: every triangle of the place's fixed geometry (the big batched meshes), sorted once into
   1 m cells when the place is built, and a ray walks the cells it passes through (Amanatides–Woo). Doors and other
   things that move are not in it: their collision boxes are tested instead. */
const CG = {tri:null, n:0, x0:0, y0:0, z0:0, nx:0, ny:0, nz:0, start:null, items:null, stamp:null, mark:0};
const CS = 1;
function camGridBuild(){
  CG.tri = CG.start = CG.items = CG.stamp = null; CG.n = 0;
  try {
    scene.updateMatrixWorld(true);
    const list = [];
    let n = 0;
    for (const o of scene.children){
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || (o.userData && o.userData.keep) || !o.geometry || !o.geometry.attributes.position) continue;
      const m = o.material;
      if (!m || Array.isArray(m) || m.isMeshBasicMaterial || m.isShaderMaterial || m.blending === THREE.AdditiveBlending) continue;
      const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count)/3 | 0; list.push(o);
    }
    const b = W.bounds;
    CG.x0 = b.x0 - 8; CG.z0 = b.z0 - 8; CG.y0 = -2;
    CG.nx = Math.ceil((b.x1 - b.x0 + 16)/CS); CG.nz = Math.ceil((b.z1 - b.z0 + 16)/CS); CG.ny = 44;
    const T = new Float32Array(n*9), v = new THREE.Vector3();
    let k = 0;
    for (const o of list){
      const g = o.geometry, pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count, M = o.matrixWorld, id = M.equals(_I4);
      for (let i = 0; i < cnt; i++){
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i); if (!id) v.applyMatrix4(M);
        T[k++] = v.x; T[k++] = v.y; T[k++] = v.z;
      }
    }
    CG.tri = T; CG.n = n;
    const NX = CG.nx, NY = CG.ny, NZ = CG.nz, cells = NX*NY*NZ, cnt = new Int32Array(cells + 1);
    const span = (i, f) => {
      const a = i*9;
      let x0 = Math.min(T[a], T[a + 3], T[a + 6]), x1 = Math.max(T[a], T[a + 3], T[a + 6]), y0 = Math.min(T[a + 1], T[a + 4], T[a + 7]), y1 = Math.max(T[a + 1], T[a + 4], T[a + 7]);
      let z0 = Math.min(T[a + 2], T[a + 5], T[a + 8]), z1 = Math.max(T[a + 2], T[a + 5], T[a + 8]);
      const cx0 = Math.max(0, Math.floor((x0 - CG.x0)/CS)), cx1 = Math.min(NX - 1, Math.floor((x1 - CG.x0)/CS));
      const cy0 = Math.max(0, Math.floor((y0 - CG.y0)/CS)), cy1 = Math.min(NY - 1, Math.floor((y1 - CG.y0)/CS));
      const cz0 = Math.max(0, Math.floor((z0 - CG.z0)/CS)), cz1 = Math.min(NZ - 1, Math.floor((z1 - CG.z0)/CS));
      for (let z = cz0; z <= cz1; z++) for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) f((z*NY + y)*NX + x);
    };
    for (let i = 0; i < n; i++) span(i, c => cnt[c + 1]++);
    for (let c = 0; c < cells; c++) cnt[c + 1] += cnt[c];
    const items = new Int32Array(cnt[cells]), fill = cnt.slice(0, cells);
    for (let i = 0; i < n; i++) span(i, c => { items[fill[c]++] = i; });
    CG.start = cnt; CG.items = items; CG.stamp = new Uint32Array(n); CG.mark = 0;
  } catch(e){ console.error(e); CG.tri = null; CG.n = 0; }
}
const _I4 = new THREE.Matrix4();
// the distance along a ray (unit direction) to the first thing it meets, up to len
function camCast(ox, oy, oz, dx, dy, dz, len){
  let best = len;
  // things that move (doors) and anything solid: the collision boxes
  const ix = 1/(dx || 1e-12), iy = 1/(dy || 1e-12), iz = 1/(dz || 1e-12);
  for (const s of W.solids){
    if (s.off) continue;
    if (ox > s.x0 && ox < s.x1 && oy > s.y0 && oy < s.y1 && oz > s.z0 && oz < s.z1) continue;
    let a = (s.x0 - ox)*ix, b = (s.x1 - ox)*ix, t0 = Math.min(a, b), t1 = Math.max(a, b);
    a = (s.y0 - oy)*iy; b = (s.y1 - oy)*iy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    a = (s.z0 - oz)*iz; b = (s.z1 - oz)*iz; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    if (t0 <= t1 && t1 > 0 && t0 >= 0 && t0 < best) best = t0;
  }
  if (!CG.tri) return best;
  // the drawn geometry: walk the cells along the ray
  const T = CG.tri, NX = CG.nx, NY = CG.ny, NZ = CG.nz, st = CG.start, it = CG.items, stamp = CG.stamp;
  if (++CG.mark > 4e9){ stamp.fill(0); CG.mark = 1; }
  const mark = CG.mark;
  let cx = Math.floor((ox - CG.x0)/CS), cy = Math.floor((oy - CG.y0)/CS), cz = Math.floor((oz - CG.z0)/CS);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(CS/(dx || 1e-12)), tdy = Math.abs(CS/(dy || 1e-12)), tdz = Math.abs(CS/(dz || 1e-12));
  const nb = (c, o, d, s0) => { const edge = s0 + (c + (d > 0 ? 1 : 0))*CS; return Math.abs(d) < 1e-12 ? Infinity : (edge - o)/d; };
  let tx = nb(cx, ox, dx, CG.x0), ty = nb(cy, oy, dy, CG.y0), tz = nb(cz, oz, dz, CG.z0), t = 0;
  for (let guard = 0; guard < 64 && t <= best; guard++){
    if (cx >= 0 && cx < NX && cy >= 0 && cy < NY && cz >= 0 && cz < NZ){
      const c = (cz*NY + cy)*NX + cx;
      for (let j = st[c], e = st[c + 1]; j < e; j++){
        const i = it[j]; if (stamp[i] === mark) continue; stamp[i] = mark;
        const a = i*9;
        // Möller–Trumbore, both faces
        const e1x = T[a + 3] - T[a], e1y = T[a + 4] - T[a + 1], e1z = T[a + 5] - T[a + 2], e2x = T[a + 6] - T[a], e2y = T[a + 7] - T[a + 1], e2z = T[a + 8] - T[a + 2];
        const px = dy*e2z - dz*e2y, py = dz*e2x - dx*e2z, pz = dx*e2y - dy*e2x, det = e1x*px + e1y*py + e1z*pz;
        if (Math.abs(det) < 1e-10) continue;
        const inv = 1/det, qx = ox - T[a], qy = oy - T[a + 1], qz = oz - T[a + 2], u = (qx*px + qy*py + qz*pz)*inv;
        if (u < 0 || u > 1) continue;
        const rx = qy*e1z - qz*e1y, ry = qz*e1x - qx*e1z, rz = qx*e1y - qy*e1x, w = (dx*rx + dy*ry + dz*rz)*inv;
        if (w < 0 || u + w > 1) continue;
        const h = (e2x*rx + e2y*ry + e2z*rz)*inv;
        if (h > 1e-4 && h < best) best = h;
      }
    }
    if (tx <= ty && tx <= tz){ t = tx; tx += tdx; cx += sx; } else if (ty <= tz){ t = ty; ty += tdy; cy += sy; } else { t = tz; tz += tdz; cz += sz; }
  }
  return best;
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
  // in third person you aim with the crosshair, but reach from where you stand: the ray starts level with your head
  if (ME.tpShown || ME.camT > 0){ const k = (P.x - _o.x)*_d.x + (P.eye - _o.y)*_d.y + (P.z - _o.z)*_d.z; if (k > 0) _o.addScaledVector(_d, k); }
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
  // your body in a drill: act({mode, t}) plays a move of human.js (kick, pass, trap, header) at that point; act(null) lets go
  act(st){ ME.act = st ? Object.assign(ME.act && ME.act !== st ? ME.act : {}, st) : null; }, actT:() => ME.act && typeof ME.act.t === "number" ? ME.act.t : 0,
  scale:() => ME.scale || 1,
  endDrill(){ DRILL = null; P.drillY = 0; P.bobY = 0; ME.act = null; }
};
function endDrillNow(){ if (DRILL && DRILL.input) DRILL.input("down", "escape"); DRILL = null; P.drillY = 0; P.bobY = 0; ME.act = null; }

/* ---------- loop and entry ---------- */
let last = 0, frames = 0, saveT = 0, keysT = 0, shadowT = 0;
/* Adaptive resolution with hysteresis: it steps down only after two slow seconds in a row, steps back up only
   after six good ones, and once a step up has had to be undone it stays down — the picture never pumps between two
   sizes (every change reallocates the canvas, which is itself a hitch). A new size is only ever applied at the top of
   a frame, before it is drawn: resizing the canvas clears it, and done after the render it would put one blank frame
   on screen.
   Slow means the frame's work is too much, not merely that frames come slowly: a browser that holds the page to
   30 fps (an energy saver, a low-power mode) would otherwise be "slow" for good and blur the picture on a GPU with
   nothing to do. So where the GPU can time itself (EXT_disjoint_timer_query_webgl2) each frame's cost is
   measured — the larger of the GPU's time drawing it and the main thread's time building it — and the resolution
   only drops when that cost is over 13 ms (no headroom for 60 fps), and may come back up when it is under 8 ms even
   at a capped 30. Where it can't, the frame rate is all there is to go on. */
const Q = {scale:1, acc:0, n:0, slow:0, good:0, t:0, upAt:-1e9, noUp:false, pending:false, cpu:0, work:-1};
const GT = {gl:null, ext:null, cur:null, wait:[], free:[], sum:0, n:0};
function gpuInit(){
  try {
    const gl = renderer.getContext(), ext = gl.createQuery && gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (ext){ GT.gl = gl; GT.ext = ext; }
  } catch(e){}
}
function gpuBegin(){
  if (!GT.ext || GT.cur || GT.wait.length > 3) return;
  GT.cur = GT.free.pop() || GT.gl.createQuery();
  GT.gl.beginQuery(GT.ext.TIME_ELAPSED_EXT, GT.cur);
}
function gpuEnd(){
  if (!GT.cur) return;
  const gl = GT.gl; gl.endQuery(GT.ext.TIME_ELAPSED_EXT); GT.wait.push(GT.cur); GT.cur = null;
  // results come back a frame or two later; a disjoint (the GPU was reset or throttled) spoils whatever is pending
  const bad = gl.getParameter(GT.ext.GPU_DISJOINT_EXT);
  while (GT.wait.length && gl.getQueryParameter(GT.wait[0], gl.QUERY_RESULT_AVAILABLE)){
    const q = GT.wait.shift();
    if (!bad){ GT.sum += gl.getQueryParameter(q, gl.QUERY_RESULT)/1e6; GT.n++; }
    GT.free.push(q);
  }
}
function quality(real, cpu){
  Q.acc += real; Q.n++; Q.t += real; Q.cpu += cpu;
  if (Q.acc < 1) return;
  const fps = Q.n/Q.acc, work = GT.n ? Math.max(Q.cpu/Q.n, GT.sum/GT.n) : -1;
  Q.work = work; Q.acc = Q.n = Q.cpu = GT.sum = GT.n = 0;
  Q.slow = fps < 45 && (work < 0 || work > 13) ? Q.slow + 1 : 0;
  Q.good = fps > 57 || (work >= 0 && work < 8) ? Q.good + 1 : 0;
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
  SKY.shade(renderer, real);
}
function loop(t){
  if (!LIFE.running) return;
  frames++;
  const t0 = performance.now(), real = Math.max(0, (t - last)/1000 || 0), dt = Math.min(.1, real); last = t;
  if (real > 0 && real < .5) MA.frame += (real*1000 - MA.frame)*.2;
  if (Q.pending) resize();
  step(dt, Math.min(real, .5));
  // the clock runs on its own, faster while you are on the move; it stops while a panel or the hub is up
  if (busy) stepBusy(Math.min(real, .1));
  else if (!modal && !DRILL && !tutOn() && document.pointerLockElement){ pass(Math.min(real, .1)*(moving ? TIME_RATE_MOVING : TIME_RATE), moving ? "walk" : "idle"); }
  skyStep(Math.min(real, .1));
  if (LIFE.zone === "home") homeTick();
  // something that throws a shadow has moved (a door swinging): redraw the sun's shadows, at most five times a second
  if (W.shadowDirty && (shadowT -= real) <= 0){ W.shadowDirty = false; shadowT = .2; renderer.shadowMap.needsUpdate = true; }
  gpuBegin(); renderer.render(scene, cam); gpuEnd();
  // people step out of YOUR way, wherever the camera is: drawing set VIEW to the camera (and the way it looks, fx/fz);
  // in third person that is 2.6 m behind you, so the position goes back to your own head. The camera's own position
  // stays readable as VIEW.cx/cy/cz for anyone who needs what the camera can see rather than where you are
  VIEW.cx = VIEW.x; VIEW.cy = VIEW.y; VIEW.cz = VIEW.z;
  VIEW.x = P.x; VIEW.y = P.eye; VIEW.z = P.z;
  if (real > 0 && real < .5) quality(real, performance.now() - t0);
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
  SKY = createSky(renderer); gpuInit();
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
/* Stray jumps. Ordinary (non-raw) pointer lock in some browsers now and then reports one event with a jump in it —
   the cursor warped back to the centre, a large count the wrong way in the middle of a turn. A real hand can be just as
   sudden (Chrome adds a whole frame's movement into one event, so a flick at a low frame rate is hundreds of counts at
   once), so size alone decides nothing and nothing the same way as you are turning, or from rest, is ever held back:
   it turns the view at once. Only an event that is large, far larger than the movement just before it, AND the
   other way to a turn in progress waits for one frame. If the next event goes on the way the turn was going, it was a
   jump and is dropped; if it goes the new way too (you really did snap back), both are applied; if no more comes on
   that axis, it is applied on the next frame. Raw input never jumps, and nothing in it is ever held. */
const MA = {x:{prev:0, hold:0, age:0}, y:{prev:0, hold:0, age:0}, t:0, frame:16};
function mouseAxis(a, m){
  let out = 0;
  if (a.hold && m){
    if (Math.sign(m) === Math.sign(a.hold)){ out += a.hold; a.prev = a.hold; }
    a.hold = 0;
  }
  if (!m) return out;
  if (!rawMouse && Math.abs(a.prev) >= 4 && Math.sign(m) !== Math.sign(a.prev) && Math.abs(m) > 250 && Math.abs(m) > 8*(Math.abs(a.prev) + 12)){ a.hold = m; a.age = 0; return out; }
  a.prev = m;
  return out + m;
}
// once a frame, before the camera is set: a held event that nothing contradicted is let through. A pause longer than
// a couple of frames is a hand at rest, and what comes after it is judged from rest
function mouseFrame(){
  if (performance.now() - MA.t > Math.max(60, 2.5*MA.frame)) MA.x.prev = MA.y.prev = 0;
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
    if (k === "v" && !e.repeat) toggleView();
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
  get busy(){ return busy; }, get rawMouse(){ return rawMouse; }, GT, MA, quality, GAIT, E, step:(dt) => step(dt, dt), warm, target, enterZone, place, dragBy, mailOpen, pass, ctx, use, renderer:() => renderer, scene:() => scene, sky:() => SKY,
  drillInput:(type, k) => DRILL && DRILL.input(type, k), stepBusy, ME, CG, camCast, toggleView, meBuild, viewStep};
