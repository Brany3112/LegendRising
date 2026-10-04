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
const persist = () => { const s = G(); if (s && typeof save === "function") save(); };
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
  fade(() => { const r = nap(bedTier()); sync(); forceSky = true; note(`A two-hour nap · fatigue ${r.fatigue} · it's ${clockText()}`); persist(); }, 1600);
}
function doSleep(){
  const s = G();
  fade(() => {
    const r = sleepNight(bedTier());
    startNewDay(); sync(); forceSky = true;
    if (HOME.curtains) {}
    persist();
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
    persist();
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
  water, work, bath, iceBath};

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
}

/* ---------- you ---------- */
const P = {x:0, z:0, feet:0, eye:1.62, yaw:0, pitch:0, vx:0, vz:0, vy:0, drillY:0, bobY:0};
const EYE = 1.62, R = .26, REACH = 2.5;
const keys = {};
let held = null, grab = null, lockLost = false;
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
  const b = DRILL && DRILL.moveBox ? DRILL.moveBox : W.bounds;
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
const tutOn = () => { const t = document.getElementById("tutRoot"); return !!(t && t.classList.contains("on")); };
const locked = () => !!(window.lifeMoveLocked && window.lifeMoveLocked()) || modal || tutOn();
let moving = false;
function step(dt, real){
  let f = 0, r = 0;
  const canMove = !locked() && (!DRILL || DRILL.allowMove);
  if (canMove){
    f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }
  const len = Math.hypot(f, r);
  if (len){ f /= len; r /= len; }
  const running = keys.shift && f > .3 && !DRILL;
  // tired legs and an empty stomach slow you down a little
  const legs = 1 - Math.max(0, (S.fatigue || 0) - 70)/200 - (S.energy < 15 ? .08 : 0);
  let sp = (running ? 6.6 : 4.0)*legs;
  if (f < 0) sp *= .8;
  const k = 1 - Math.exp(-(len ? 14 : 16)*dt);
  L.f += (f*sp - L.f)*k; L.r += (r*sp - L.r)*k;
  if (Math.abs(L.f) < .01 && !f) L.f = 0; if (Math.abs(L.r) < .01 && !r) L.r = 0;
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  P.vx = L.r*cos - L.f*sin; P.vz = -L.r*sin - L.f*cos;
  const speed = Math.hypot(P.vx, P.vz);
  moving = speed > .5;
  if (speed > .02){
    const ox = P.x, oz = P.z;
    moveBy(P.vx*dt, P.vz*dt);
    B.dist += Math.hypot(P.x - ox, P.z - oz);
  }
  // stairs, kerbs and falling
  const g = groundAt(P.x, P.z, P.feet);
  if (g >= P.feet - .001){ P.feet = g; P.vy = 0; }
  else if (P.feet - g < .45 && P.vy === 0){ P.feet = g; }
  else { P.vy -= 22*dt; P.feet = Math.max(g, P.feet + P.vy*dt); if (P.feet === g) P.vy = 0; }
  P.eye += (P.feet + EYE - P.eye)*(1 - Math.exp(-14*dt));
  // head bob: a soft rise and fall once a step, a slight sway every two
  const realSpeed = dt > 0 ? Math.min(8, speed) : 0;
  B.amt += (Math.min(1, realSpeed/4.0) - B.amt)*(1 - Math.exp(-5*dt));
  B.phase = B.dist/(running ? 1.5 : 1.1)*Math.PI*2;
  const bobY = Math.sin(B.phase*2)*.022*B.amt*(running ? 1.35 : 1);
  const sway = Math.sin(B.phase)*.014*B.amt;
  B.fov += ((running && speed > 4.6 ? 78 : 74) - B.fov)*(1 - Math.exp(-4*dt));
  if (Math.abs(cam.fov - B.fov) > .01){ cam.fov = B.fov; cam.updateProjectionMatrix(); }
  cam.position.set(P.x + cos*sway, P.eye + bobY + P.drillY + P.bobY, P.z - sin*sway);
  cam.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  for (const a of W.anims) a(dt);
  if (DRILL && !lockLost) DRILL.update(dt);
  if (LIFE.zone === "ground") tunnel();
  held = DRILL ? null : (grab || target());
  hud(held);
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
  const en = document.getElementById("lifeEnergy"), fa = document.getElementById("lifeFatigue");
  if (en){ en.style.width = clamp(s.energy, 0, 100).toFixed(1) + "%"; en.parentNode.parentNode.classList.toggle("low", s.energy < 25); }
  if (fa){ fa.style.width = clamp(s.fatigue, 0, 100).toFixed(1) + "%"; fa.parentNode.parentNode.classList.toggle("low", s.fatigue > 75); }
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
  jump(h){ P.drillY = h; }, bob(y){ P.bobY = y; },
  endDrill(){ DRILL = null; P.drillY = 0; P.bobY = 0; }
};
function endDrillNow(){ if (DRILL && DRILL.input) DRILL.input("down", "escape"); DRILL = null; P.drillY = 0; P.bobY = 0; }

/* ---------- loop and entry ---------- */
let last = 0, frames = 0, saveT = 0, keysT = 0;
const Q = {scale:1, acc:0, n:0, good:0};
function quality(real){
  Q.acc += real; Q.n++;
  if (Q.acc < 1) return;
  const fps = Q.n/Q.acc; Q.acc = 0; Q.n = 0;
  if (fps < 50 && Q.scale > .6){ Q.scale = Math.max(.6, Q.scale - .1); Q.good = 0; resize(); }
  else if (fps > 58 && Q.scale < 1){ if (++Q.good >= 3){ Q.scale = Math.min(1, Q.scale + .1); Q.good = 0; resize(); } }
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
  step(dt, Math.min(real, .5));
  // the clock runs on its own, faster while you are on the move; it stops while a panel or the hub is up
  if (busy) stepBusy(Math.min(real, .1));
  else if (!modal && !DRILL && !tutOn() && document.pointerLockElement){ pass(Math.min(real, .1)*(moving ? TIME_RATE_MOVING : TIME_RATE), moving ? "walk" : "idle"); }
  skyStep(Math.min(real, .1));
  if (LIFE.zone === "home") homeTick();
  renderer.render(scene, cam);
  if (real > 0 && real < .5) quality(real);
  saveT += real; if (saveT > 45){ saveT = 0; persist(); }
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
export function stop(){ LIFE.running = false; if (raf) cancelAnimationFrame(raf); raf = null; grab = null; document.exitPointerLock && document.exitPointerLock(); }
export function resumeLife(){
  if (!document.body.classList.contains("life") || !renderer) return;
  if (LIFE.zone === "home") homeRefresh(); else refreshGymFridge();
  tunnelInfo = null; sync(); forceSky = true;
  mailNews();
  if (!LIFE.running){ document.getElementById("lifeRoot").style.display = "block"; LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
}
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)*Q.scale*(typeof GFX !== "undefined" && GFX.low ? .85 : 1));
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
  document.addEventListener("pointerlockchange", () => {
    const on = document.pointerLockElement === cv;
    lockLost = !on && !!DRILL;
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
  get busy(){ return busy; }, target, enterZone, place, dragBy, mailOpen, pass, ctx, use, renderer:() => renderer, scene:() => scene, sky:() => SKY,
  drillInput:(type, k) => DRILL && DRILL.input(type, k), stepBusy};
