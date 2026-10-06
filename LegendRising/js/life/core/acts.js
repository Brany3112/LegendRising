/* ============ LIFE core: what you do with your day ============
   Owner: WP-0A moves it here; WP-G owns it in Stage 1, WP-I in Stage 2. Contract: DESIGN 1.2 (acts.js), 1.4.1 (the
   mode drill, the clock), 2.2 WP-0A.
   The clock runs while you live in the world: slowly when you stand still, a little faster when you move, and in big
   steps when you sleep, work, train or wait. Everything about the day itself (the meters, the schedule, the dressing
   room) lives in daily.js; here is what you can do in it: sleep, eat, take the bus, wash, work, train, read your mail. */
import {W} from "../build.js";
import {homeRefresh, drawMail, refreshFridge, bedTier, drawNotices} from "../home.js";
import {refreshGymFridge} from "../ground.js";
import {checkMail, openMail} from "../rent.js";
import {refreshParcels, pointName, parcelText} from "../parcels.js";
import {startDrill, startReps, startSession} from "../drills.js";
import {runShift} from "../jobs.js";
import {MINI} from "../mini.js";
import {G, LIFE, P, ME, FLAGS, FADE, keys, sync} from "./state.js";
import {registerMode, enterMode, mode, modeFlags, persist} from "./modes.js";
import {camPush, camPop} from "./camera.js";
import {DRILL_VIEW} from "./me.js";
import {note, fade, clockText, signed, range, HUD} from "./hud.js";
import {TUN} from "./tunnel.js";

export const BUS_MIN = 40;
let H = null;            // world.js: {enterZone(zone, at), host (what a drill drives the world through)}
export function actsInit(host){ H = host; }
// a change in a meter or in trust as it is said: "+1.2", "−3"
const delta = x => signed(x, Number.isInteger(+(+x).toFixed(1)) ? 0 : 1);
const fadeEl = () => document.getElementById("lifeFade");
const letGo = () => { for (const k in keys) keys[k] = false; };

/* ---------- the clock ---------- */
export function pass(mins, act = "idle"){
  const s = G(); if (!s || !(mins > 0)) return;
  const day0 = s.life.day;
  dailyPass(mins, act);
  if (s.home && s.home.light && LIFE.zone === "home") s.home.lightMin = (s.home.lightMin || 0) + mins;
  sync();
  if (s.life.day !== day0) FLAGS.forceSky = true;
  if (mins >= 5) HUD.ctxT = 0;                       // a jump in time: refresh the line under the clock straight away
}
window.lifePass = (m, act) => pass(m, act);

// news from the day as it happens
function onDaily(type, d){
  if (type === "delivered" && !LIFE.running) return;      // (resumeLife puts it on its table)
  if (!LIFE.running && type !== "season") return;
  if (type === "delivered"){
    // the bag is on its delivery point: on it now if you are in that place, waiting there if you are not
    if (LIFE.zone === d.where) refreshParcels();
    FEED.center("Foodies delivered", `${parcelText(d.items) || "Your order"} · waiting on ${pointName(d.where)} · carry it to a fridge`, {kind:"food", icon:"🍔"});
  } else if (type === "late") FEED.chip(`Late for training · Manager trust ${delta(d.d)}`, "bad");
  else if (type === "settled"){
    if (d.k.startsWith("absent")) FEED.chip(`Missed training · Manager trust ${delta(d.d)}`, "bad");
    else if (d.k === "good") FEED.chip(`Full session · Manager trust ${delta(d.d)}`, "good");
    else if (d.k === "early") FEED.chip(`Left training early · Manager trust ${delta(d.d)}`, "bad");
  } else if (type === "missed" && !d.excused) FEED.center("Match missed", `The team played without you · Manager trust ${delta(-10)}`, {kind:"bad", icon:"!"});
  else if (type === "newweek"){ if (d && d.income) FEED.center(`Week ${G().week + 1}`, `Your wage is in · ${eurFull(d.income)}${d.cost ? ` · staff −${eurFull(d.cost)}` : ""}`, {kind:"money", icon:"€"}); }
  else if (type === "crash") FEED.chip("The energy drink wears off", "bad");
  else if (type === "event"){
    const k = typeof LIFE_EVENTS === "object" ? LIFE_EVENTS[d.id] : null;
    if (k) setTimeout(() => FEED.center(k.feed, "A new notice is up on the board in your lobby", {kind:"bad", icon:"!", ms:4200}), 1400);
    if (LIFE.zone === "home") drawNotices();
  }
}
if (typeof dailyOn === "function") dailyOn(onDaily);

/* where you are, in words: for a courier who comes to find you. Every shop and workplace says where its floor is
   (W.places: b, the box it stands on, and at, the words) */
export function placeName(){
  const x = P.x, z = P.z;
  if (LIFE.zone === "ground"){
    if (x > 17.5 && z > 3 && z < 17) return "in the clubhouse";
    if (Math.abs(x) < 13.5 && z > 3.5 && z < 16.5) return "in the gym";
    return z < 2 ? "out on the training pitch" : "at the training centre";
  }
  if (LIFE.zone === "home" && x > -14 && x < 0 && z > -9 && z < 3) return P.feet > 2 ? "at your flat" : "in your block";
  const p = W.places.find(q => q.b && q.at && x > q.b.x0 && x < q.b.x1 && z > q.b.z0 && z < q.b.z1);
  if (p) return p.at;
  if (LIFE.zone === "town") return z > 11 ? `in ${PLACES.hood}, ${PLACES.town}` : `on Strada Mare, ${PLACES.town}`;
  return z < -6 && x > 30 ? "up Strada Morii" : z > 17 && x > 30 ? "down Bulevardul Gării" : "out on Strada Teiului";
}
window.lifePlace = placeName;

/* ---------- sleep ---------- */
export function sleep(){
  const s = G(); if (!s || FLAGS.busy) return;
  if (isNight()){ openDaySummary(doSleep); return; }
  fade(() => { const r = nap(bedTier()); sync(); FLAGS.forceSky = true; note(`A two-hour nap · fatigue ${delta(r.fatigue)} · it's ${clockText()}`); persist(true); }, 1600);
}
function doSleep(){
  fade(() => {
    const r = sleepNight(bedTier());
    // thieves come in the night: whether they get in depends on your door
    const rob = LIFE.zone === "home" && typeof lifeTheft === "function" ? lifeTheft("night") : null;
    startNewDay(); sync(); FLAGS.forceSky = true;
    persist(true);
    if (rob) robbed(rob.lost);
    morning(r); mailNews();
  }, 2000);
}
function morning(r){
  const f = todaysFixture();
  FEED.center(todayName(), f ? `Match day · ${oppName(f)} · ${clockText(fixtureSlot(f).min)}` : todayLine(), {kind:"day", icon:"☀", ms:3200});
  note(`${r.hours >= 7 ? "A full night's sleep" : `${Math.round(r.hours)} hours' sleep`} · fatigue ${delta(r.fatigue)} · ${S.energy < 40 ? "you wake up hungry, so have some breakfast." : "breakfast is in the fridge."}`);
}
/* a whole day asleep: hold E on the bed. Exactly 24 hours of the clock pass: not to the next morning, not a nap */
export function sleepDay(){
  const s = G(); if (!s || FLAGS.busy) return;
  fade(() => {
    const r = typeof sleepFullDay === "function" ? sleepFullDay(bedTier()) : null;
    const rob = LIFE.zone === "home" && typeof lifeTheft === "function" ? lifeTheft("night") : null;
    startNewDay(); sync(); FLAGS.forceSky = true; persist(true);
    if (rob) robbed(rob.lost);
    FEED.center(todayName(), `You slept the whole day · ${clockText()}`, {kind:"day", icon:"☾", ms:3200});
    if (r) note(`Twenty-four hours later. Fatigue ${delta(r.fatigue)} · you wake up starving.`);
    mailNews();
  }, 2200);
}
// thieves have been: the money's gone, and you are told so plainly
export function robbed(lost){
  setTimeout(() => {
    FEED.center("You were robbed.", lost > 0 ? `You lost ${eurFull(lost)}.` : "There was nothing worth taking.", {kind:"bad", icon:"!", ms:6000});
    note(lost > 0 ? `Somebody's been in your flat. Half your money's gone: ${eurFull(lost)}. A lock that works, locked, would have stopped them.` : "Somebody's been through your flat. Lucky there was nothing to take.");
  }, 600);
}
export function mailNews(){
  const n = checkMail();
  if (n){ drawMail(); setTimeout(() => note(`📬 ${n === 1 ? "A letter has" : n + " letters have"} arrived in your mailbox downstairs.`), 900); }
  return n;
}

/* ---------- food and water ---------- */
// mult: how much of its goodness the fridge it came out of has kept (furniture.js, ground.js)
export function eat(id, mult = 1){
  const r = consume(id, mult); sync();
  if (!r.ok) return note(r.why);
  refreshFridge(); refreshGymFridge();
  FEED.chip(`${r.item.name} · ${r.gain ? `+${r.gain} energy` : ""}${r.fat ? ` ${r.fat < 0 ? "−" : "+"}${Math.abs(r.fat)} fatigue` : ""}${mult < .999 ? ` · fridge keeps ${Math.round(mult*100)}%` : ""}`.trim(), mult < .75 ? "" : "good");
  persist();
}
window.lifeFridgeChanged = () => { refreshFridge(); refreshGymFridge(); };
export function water(){ S.fatigue = clamp(S.fatigue - 2, 0, 100); S.energy = clamp(S.energy + 1, 0, 100); S.hyd = clamp(num(S.hyd, 82) + 14, 0, 100); pass(2); FEED.chip("Cup of water · +14 hydration · −2 fatigue", "good"); }

/* ---------- the bus, Line 14 ----------
   You choose where to (panels.js openBus), the screen goes dark and the ride plays out on a card (the clock running
   through the minutes the route takes, game.js BUS_ROUTES), and you step off at the other end */
const STOP_NAME = {home:"Strada Teiului", ground:"Training Centre", town:PLACES.town};
export function bus(to){
  if (FLAGS.busy || !STOP_NAME[to] || to === LIFE.zone) return;
  const from = LIFE.zone, mins = (BUS_ROUTES[from] || {})[to] || BUS_MIN;
  const o = fadeEl();
  FLAGS.modal = true; letGo();
  FADE.boot = false;
  o.style.transition = "opacity .45s ease"; o.style.opacity = "1"; FADE.v = 1;
  setTimeout(() => {
    timeLapse(mins, "bus", "Line 14", () => {
      H.enterZone(to, "bus");
      arrive(from, to);
      persist(true);
      setTimeout(() => { o.style.transition = "opacity .55s ease"; o.style.opacity = "0"; FADE.v = 0; setTimeout(() => { const c = o.querySelector(".ride"); if (c && !FLAGS.busy) c.remove(); }, 600); }, 120);
    }, {icon:"🚌", dur:clamp(mins/60*1.7, 2.2, 3.6), ride:{from:STOP_NAME[from], to:STOP_NAME[to], mins}});
  }, 480);
}
window.lifeBus = to => bus(to);
// stepping off: what is going on where you have come to
function arrive(leaving, to){
  if (to === "ground"){
    arriveForTraining();
    const a = S.life.att, td = trainingDay(), f = todaysFixture();
    if (f) note(`${clockText()}. It's match day: kick-off is at ${clockText(fixtureSlot(f).min)}, and the tunnel opens at ${clockText(fixtureSlot(f).min - TUNNEL_OPEN)}.`);
    else if (!td) note(`${clockText()}. No team training today, so the gym and the drills are all yours.`);
    else if (LIFE.min < SESSION.start) note(`You're here at ${clockText()}. Training starts at ${clockText(SESSION.start)}. The gym is open, or you can sit on the bench and wait.`);
    else if (LIFE.min < SESSION.end) note(a.status === "late" ? `${clockText()}. Training started at ${clockText(SESSION.start)}. The manager saw you come in late.` : `${clockText()}. Training's on and the squad is out on the pitch.`);
    else note(`${clockText()}. The session finished at ${clockText(SESSION.end)}. The gym's open till ${clockText(CENTRE.close)}.`);
    return;
  }
  if (to === "town"){
    const w = JOB_WHERE[jobState().id], mine = w && w.zone === "town";
    note(`${PLACES.town}, ${clockText()}. This is Strada Mare. ${mine ? `${myJob().job.name} is along the road (JOB on the compass), ` : ""}Casa Nova is at the far end, and ${PLACES.hood}'s houses are down the side street.`);
    return;
  }
  note(`Home at ${clockText()}. Your block is across the road, and the Mini Market is on the corner.`);
  // what today's training did for you in the dressing room shows up once you're home
  const a = S.life.att;
  if (leaving === "ground" && a && a.chem > .1 && !a.told){
    a.told = true;
    setTimeout(() => FEED.center(`Team Chemistry +${a.chem.toFixed(1)}`, `From today with the squad · now ${Math.round(S.chem)} · ${chemLabel()}`, {kind:"chem", icon:"◆"}), 900);
  }
}

/* ---------- time passing on screen ----------
   A stretch of time passing on screen: the clock runs fast and you watch it. (o.ride: a bus ride, the card drawn on
   the black of the fade, from one stop to the other, the bus moving along) */
export function timeLapse(mins, act, label, done, o = {}){
  if (FLAGS.busy) return;
  let el = document.getElementById("lifeBusy");
  if (o.ride){
    const f = fadeEl(), old = f.querySelector(".ride"); if (old) old.remove();
    el = document.createElement("div"); el.className = "ride"; f.appendChild(el);
    el.innerHTML = `<div class="rd-line"><span class="rd-no">14</span><b class="lb-label"></b></div>
      <div class="rd-route"><span>${o.ride.from}</span><div class="rd-track lb-bar"><i></i><em>🚌</em></div><span>${o.ride.to}</span></div>
      <div class="rd-time"><span class="lb-time"></span><small>${o.ride.mins >= 60 ? `${Math.floor(o.ride.mins/60)} h ${o.ride.mins % 60 ? (o.ride.mins % 60) + " min" : ""}` : o.ride.mins + " min"}</small></div>`;
  }
  FLAGS.busy = {mins, done:0, act, label, cb:done, dur:o.dur || clamp(mins/60*1.4, 1.2, 3.6), t:0, tick:o.tick, el, ride:!!o.ride};
  FLAGS.modal = true; letGo();
  if (el && !o.ride){ el.innerHTML = `<div class="lb-card"><span class="lb-ico">${o.icon || "⏩"}</span><div><b class="lb-label"></b><span class="lb-time"></span></div><div class="lb-bar"><i></i></div></div>`; el.classList.add("on"); }
  if (el) paintBusy(FLAGS.busy, 0);
}
function paintBusy(b, k){
  const el = b.el; if (!el) return;
  const lab = typeof b.label === "function" ? b.label(k) : b.label;
  el.querySelector(".lb-label").textContent = lab; el.querySelector(".lb-time").textContent = clockText();
  el.querySelector(".lb-bar i").style.width = (k*100).toFixed(1) + "%";
  el.style.setProperty("--k", k.toFixed(3));
}
export function stepBusy(real){
  const b = FLAGS.busy; if (!b) return;
  b.t += real;
  const k = Math.min(1, b.t/b.dur), want = b.mins*k, d = want - b.done;
  if (d > 0){ pass(d, b.act); b.done = want; if (b.tick) b.tick(k, d); }
  paintBusy(b, k);
  if (k >= 1){
    FLAGS.busy = null; FLAGS.modal = false;
    if (b.el && !b.ride) b.el.classList.remove("on");
    if (b.cb) b.cb();
    if (window.lifeRelock) window.lifeRelock();
  }
}
window.lifeWaitFor = mins => timeLapse(mins, "rest", "Taking a breather", () => { note(`It's ${clockText()}. Fatigue ${Math.round(S.fatigue)} · Energy ${Math.round(S.energy)}.`); persist(); }, {icon:"☕"});
export function bath(){
  timeLapse(30, "rest", "Hot bath", () => { wash("bath"); FEED.chip("Hot bath · clean · −10 fatigue", "good"); persist(); }, {icon:"🛁", dur:2});
}
// a quick shower: clean in ten minutes, at home or in the dressing room
export function shower(){
  timeLapse(10, "rest", "Shower", () => { wash("shower"); FEED.chip("Showered · fresh", "good"); persist(); }, {icon:"🚿", dur:1.4});
}
export function iceBath(){
  timeLapse(20, "rest", "Ice bath", () => { S.fatigue = clamp(S.fatigue - 14, 0, 100); FEED.chip("Ice bath · −14 fatigue", "good"); persist(); }, {icon:"🧊", dur:2});
}

/* ---------- work ----------
   A shift at work: you do the job (jobs.js), task by task, the clock moving on as you go; the pay and the job XP come
   at the end, by how well (and how quickly) you worked */
window.lifeShift = plan => runShift(plan, {pass:m => pass(m, "work"), minute:() => LIFE.min, clock:() => clockText(), done:r => {
  sync();
  if (!r || !r.done){ note("You clock out again without doing anything. Nobody's impressed."); persist(); return; }
  shiftPay(Object.assign({}, plan, {hours:r.hours, pay:r.pay}));
  const b = {pct:jobState().xp/jobNeed(), rank:myJob().rank};
  const promo = r.xp ? shiftXp(r.xp) : null;
  if (r.xp) FEED.job(r.xp, b);
  FEED.chip(`Shift pay · +${eurFull(r.pay)}${r.tips ? ` (€${r.tips} tips)` : ""}`, "good");
  note(r.early ? `Clocked out early at ${clockText()} · ${r.done} of ${r.N} ${r.unit} · ${eurFull(r.pay)}.` : `Shift done at ${clockText()} · ${Math.round(r.q*100)}% · ${eurFull(r.pay)} earned.`);
  if (promo) setTimeout(() => { FEED.center(promo.newJob ? "New job" : "Promoted", promo.newJob ? `${promo.job.name} · ${jobWhereLine(promo.job.id)}` : `${promo.job.name} · ${promo.to.name}`, {kind:"level", icon:"★"}); promoBox(promo, r.pay); }, 500);
  persist(true);
}});
// jobs where you deal with customers will not have you on the floor smelling like a changing room
const FACE_JOBS = ["cafe", "store", "gym", "academy", "photo"];
export function work(){
  if (!shiftOpen()) return note("Closed. Shifts run from 7:00 AM to 11:00 PM.");
  if (num(S.odor, 0) >= ODOR_SMELLY && FACE_JOBS.includes(jobState().id)) return note(`The manager takes one sniff and steps back. "Not in front of the customers like that. Go home and have a shower."`);
  openShift();
}

/* ---------- training on your own, and the team session ---------- */
export function trainCheck(){
  if (S.energy < 8){ note("You're running on empty. Eat something before you train."); return false; }
  if (!centreOpen()){ note(`The training centre is closed. It's open from ${range(CENTRE.open, CENTRE.close)}.`); return false; }
  if (S.fatigue > 80) FEED.chip("You're exhausted. This will count for little", "bad");
  return true;
}
const begin = D => { if (D) enterMode("drill", D); };
export function drill(kind){ if (!trainCheck() || mode() === "drill") return; begin(startDrill(kind, H.host)); }
export function reps(kind){ if (!trainCheck() || mode() === "drill") return; begin(startReps(kind, H.host)); }
export function session(){
  if (!sessionOn()) return note("The session has finished for today.");
  if (S.energy < 10) return note("You're too hungry to keep up. Eat something first. There's food in the gym fridge.");
  if (mode() === "drill") return;
  begin(startSession(H.host));
}
/* the mode drill: a drill, a gym set or the team session (drills.js), driven through the host world.js gives it (the
   DRILL host contract) and kept as FLAGS.drill while it runs. Its update runs in every sub-step after your movement;
   its keys and the left button go to it; a set with its own shot (view) owns the camera as drill-view. Leaving it any
   other way than its own ending (a zone change, another mode) gives it up as Esc would */
const MOVE_KEYS = ["w", "a", "s", "d", "e", "shift", " "];
registerMode("drill", {
  enter(D){ FLAGS.drill = D; if (D.view) camPush(DRILL_VIEW); },
  exit(reason){
    const D = FLAGS.drill;
    if (reason !== "done" && D && D.input) D.input("down", "escape");
    FLAGS.drill = null; P.drillY = 0; P.bobY = 0; ME.act = null;
    camPop("drill-view");
  },
  slice(h){ const D = FLAGS.drill; if (D) D.update(h); },
  lockLook:() => !!(FLAGS.drill && FLAGS.drill.lockLook),
  input(ev){
    const D = FLAGS.drill; if (!D) return false;
    if (ev.type === "down"){ if (ev.button === 0 && ev.locked){ D.input("down", "mouse"); return true; } return false; }
    if (ev.type === "up"){ if (ev.button === 0 && ev.locked) D.input("up", "mouse"); return false; }
    if (ev.type === "keydown"){
      const k = ev.key;
      if (MOVE_KEYS.includes(k) && ev.prevent) ev.prevent();
      if ((k === "escape" || k === " " || k === "e") && !ev.repeat) D.input("down", k);
      keys[k === " " ? "space" : k] = true;
      return true;
    }
    if (ev.type === "keyup"){ if (ev.key === " ") D.input("up", " "); return false; }
    return false;
  },
  flags:{clock:"own", movement:"life", targeting:false, tunnel:false, closing:false, homeTick:true, compass:true, saves:"defer", tp:false, hud:"life", pauseOnUnlock:true, leaveOnZone:true}
});

/* ---------- mail and panels ---------- */
export function mail(){
  FLAGS.modal = true; letGo();
  document.exitPointerLock && document.exitPointerLock();
  openMail(() => { FLAGS.modal = false; drawMail(); if (window.lifeRelock) window.lifeRelock(); });
}
window.lifeModal = () => FLAGS.modal;
window.lifeModalSet = on => {
  FLAGS.modal = !!on;
  letGo(); FLAGS.grab = null;
  if (on){ document.exitPointerLock && document.exitPointerLock(); }
  else if (window.lifeRelock) setTimeout(() => window.lifeRelock(), 30);
};
// back from the hub or a panel: what may have changed meanwhile
export function lifeRefresh(){
  if (LIFE.zone === "home") homeRefresh(); else refreshGymFridge();
  refreshParcels();                                  // (a bag may have arrived while the hub was up)
}

/* ---------- five o'clock at the training centre ----------
   Any day but a match day they lock up, and you're sent home on the bus as soon as you're free (not in the middle of
   a drill, a shift or a panel). allowed: false while the mode in play holds it off (a drill, a cinematic) */
let closing = null;
export const closingReset = () => { closing = null; };
export function closingTime(allowed = modeFlags().closing){
  if (centreOpen()){ closing = null; return; }
  if (!allowed || FLAGS.busy || FLAGS.modal || MINI.on || TUN.go) return;
  if (!closing){
    closing = {t:performance.now()};
    FEED.center("The training centre is closing", "Everyone out. The bus home is at the gate.", {kind:"day", icon:"🔒", ms:3600});
    note(`It's ${clockText(CENTRE.close)} and they're locking up. The bus is waiting for you at the gate.`);
    return;
  }
  if (performance.now() - closing.t > 3800){ closing = null; bus("home"); }
}
