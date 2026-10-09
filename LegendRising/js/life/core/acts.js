/* ============ LIFE core: what you do with your day ============
   Owner: WP-0A moves it here; WP-G owns it in Stage 1, WP-I in Stage 2. Contract: DESIGN 1.2 (acts.js), 1.4.1 (the
   mode drill, the clock), 2.2 WP-0A, 3.8 (life fixes: sleep by sleepPlan, eat by foodEffect, busMins, the notice-board
   events where they bite, attendance chips with the real numbers, the once-a-day session), 3.7.4 (lifeOnb events:
   eat, nap, parcelPut).
   The clock runs while you live in the world: slowly when you stand still, a little faster when you move, and in big
   steps when you sleep, work, train or wait. Everything about the day itself (the meters, the schedule, the dressing
   room) lives in daily.js; here is what you can do in it: sleep, eat, take the bus, wash, work, train, read your mail. */
import {W} from "../build.js";
import {homeRefresh, drawMail, refreshFridge, bedTier, drawNotices} from "../home.js";
import {refreshGymFridge} from "../ground.js";
import {checkMail, openMail} from "../rent.js";
import {parcelArrived, pointName, parcelText} from "../parcels.js";
import {startReps} from "../drills.js";
import {effSkills} from "../football/bridge.js";
import {attrsForPlayer} from "../football/attrs.js";
import {hashStr} from "../football/rng.js";
import {sessionRewards, SESSION_PLAN_MINS, SESSION_LAST} from "../football/trainspec.js";
import {speak, active as fdActive} from "../firstday.js";
import {runShift} from "../jobs.js";
import {MINI} from "../mini.js";
import {G, LIFE, P, ME, FLAGS, FADE, keys, sync} from "./state.js";
import {registerMode, enterMode, mode, modeFlags, persist} from "./modes.js";
import {camPush, camPop} from "./camera.js";
import {DRILL_VIEW} from "./me.js";
import {note, fade, clockText, signed, range, HUD} from "./hud.js";
import {TUN} from "./tunnel.js";

// the ride from home to the training centre, for anything that has no stop to ask about (daily.js busMins has the rest)
export const BUS_MIN = BUS_ROUTES.home.ground;
let H = null;            // world.js: {enterZone(zone, at), host (what a drill drives the world through)}
export function actsInit(host){ H = host; }
// a change in a meter or in trust as it is said: "+1.2", "−3"
const delta = x => signed(x, Number.isInteger(+(+x).toFixed(1)) ? 0 : 1);
const fadeEl = () => document.getElementById("lifeFade");
const letGo = () => { for (const k in keys) keys[k] = false; };
// the first day's steps hear about what you did (firstday.js; DESIGN 3.7.4)
const onb = (ev, data) => { if (typeof window.lifeOnb === "function") window.lifeOnb(ev, data); };

/* ---------- the clock ----------
   (the electricity is metered inside the day's own clock, daily.js utilTick, wherever you are) */
export function pass(mins, act = "idle"){
  const s = G(); if (!s || !(mins > 0)) return;
  const day0 = s.life.day;
  dailyPass(mins, act);
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
    if (LIFE.zone === d.where) parcelArrived();
    FEED.center("Foodies delivered", `${parcelText(d.items) || "Your order"} · waiting on ${pointName(d.where)} · carry it to a fridge`, {kind:"food", icon:"🍔"});
  } else if (type === "late") FEED.chip(`Late for training · Manager trust ${delta(d.d)}`, "bad");
  else if (type === "settled") settledChip(d);
  else if (type === "missed" && !d.excused) FEED.center("Match missed", `The team played without you · Manager trust ${delta(MISS_MATCH)}`, {kind:"bad", icon:"!"});
  else if (type === "newweek"){ if (d && d.income) FEED.center(`Week ${G().week + 1}`, `Your wage is in · ${eurFull(d.income)}${d.cost ? ` · staff −${eurFull(d.cost)}` : ""}`, {kind:"money", icon:"€"}); }
  else if (type === "crash") FEED.chip("The energy drink wears off", "bad");
  else if (type === "event"){
    const k = typeof LIFE_EVENTS === "object" ? LIFE_EVENTS[d.id] : null;
    if (k) setTimeout(() => FEED.center(k.feed, `${eventFx(d)} The notice is on the board in your lobby.`, {kind:"bad", icon:"!", ms:5200}), 1400);
    if (LIFE.zone === "home") drawNotices();
  }
}
/* the day at the training centre, settled at four (daily.js settleAttendance): a chip with the trust it really moved,
   for every way a day can go */
function settledChip(d){
  const k = d.k || "", habit = k.endsWith("+habit"), base = k.replace("+habit", ""), tail = habit ? " · that's three times this week" : "";
  const say = {absent:["Missed training", "bad"], good:["Full session", "good"], goodEarly:["Early and stayed all session", "good"], early:["Left training early", "bad"],
    lateStayed:["Late, but you stayed", ""], late:["Late for training", "bad"]}[base];
  if (!say) return;                                       // (excused: the first day, nothing moved)
  if (base === "late" && !d.d) return;                    // (the −3 was said when you walked in)
  FEED.chip(`${say[0]} · Manager trust ${delta(d.d)}${tail}`, habit ? "bad" : say[1]);
  if (base === "goodEarly"){
    const line = d.streak >= 3 ? "Early again. The manager has noticed you're reliable." : d.streak === 1 ? "The manager likes players who turn up early." : "";
    if (line) setTimeout(() => note(line), 900);
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

/* ---------- sleep (DESIGN 3.8.3) ----------
   Every number said about a sleep comes from daily.js sleepPlan, the plan the sleep itself applies. Tap E on the bed:
   by night, sleep until WAKE (the day summary first); by day, a two-hour nap. Hold E: exactly twenty-four hours. */
const HUNGRY = 40;
// lights out: the light in your flat goes off when you go to bed (it is metered while it is on)
function lightsOut(){
  const h = G().home;
  if (LIFE.zone !== "home" || !h || !h.light) return "";
  h.light = false;
  return "You switch the light off and get into bed. ";
}
export function sleep(){
  const s = G(); if (!s || FLAGS.busy) return;
  if (isNight()){ const plan = sleepPlan("night", bedTier()); openDaySummary(doSleep, `Sleep until ${clockText(plan.wake)} · Fatigue ${delta(Math.round(plan.fatigue))}`); return; }
  fade(() => {
    const r = nap(bedTier()); sync(); FLAGS.forceSky = true;
    note(`A two-hour nap · Fatigue ${delta(r.fatigue)} · it's ${clockText()}`);
    persist(true);
    onb("nap", {fatigue:r.fatigue, energy:r.energy});
  }, 1600);
}
function doSleep(){
  const lo = lightsOut();
  fade(() => {
    const r = sleepNight(bedTier());
    // thieves come in the night: whether they get in depends on your door
    const rob = LIFE.zone === "home" && typeof lifeTheft === "function" ? lifeTheft("night") : null;
    startNewDay(); sync(); FLAGS.forceSky = true;
    persist(true);
    if (rob) robbed(rob.lost);
    morning(r, lo); mailNews();
  }, 2000);
}
function morning(r, lo = ""){
  const f = todaysFixture();
  FEED.center(todayName(), f ? `Match day · ${oppName(f)} · ${clockText(fixtureSlot(f).min)}` : todayLine(), {kind:"day", icon:"☀", ms:3200});
  note(`${lo}${r.hours >= 7 ? "A full night's sleep" : `${Math.round(r.hours)} hours' sleep`} · Fatigue ${delta(r.fatigue)} · Energy ${delta(r.energy)}.${S.energy < HUNGRY ? " You wake up hungry. Eat breakfast." : ""}`);
}
/* a whole day asleep: hold E on the bed. Exactly 24 hours of the clock pass: not to the next morning, not a nap. The
   day changes on the way, so its summary comes first */
export function sleepDay(){
  const s = G(); if (!s || FLAGS.busy) return;
  const plan = sleepPlan("day", bedTier());
  openDaySummary(() => {
    const lo = lightsOut();
    fade(() => {
      const r = sleepFullDay(bedTier());
      const rob = LIFE.zone === "home" && typeof lifeTheft === "function" ? lifeTheft("night") : null;
      startNewDay(); sync(); FLAGS.forceSky = true; persist(true);
      if (rob) robbed(rob.lost);
      FEED.center(todayName(), `You slept the whole day · ${clockText()}`, {kind:"day", icon:"☾", ms:3200});
      note(`${lo}Twenty-four hours later. Fatigue ${delta(r.fatigue)} · Energy ${delta(r.energy)}.${S.energy < HUNGRY ? " You're hungry. Eat something." : ""}`);
      mailNews();
    }, 2200);
  }, `Sleep 24 hours, to ${clockText(plan.wake)} tomorrow · Fatigue ${delta(Math.round(plan.fatigue))}`);
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

/* ---------- food and water ----------
   src: where it came from (furniture.js, ground.js): {keep, powerCut} for a fridge, a bare number for older callers.
   The chip prints what consume() did, which is what foodEffect() said it would (the tooltip) */
export function eatChip(r){
  const fx = r.fx, bits = [];
  if (fx.base.energy) bits.push(`Energy ${delta(r.gain)}`);
  if (fx.base.hyd) bits.push(`Hydration ${delta(r.hyd)}`);
  if (fx.base.fatigue) bits.push(`Fatigue ${delta(r.fat)}`);
  return `${r.item.name} · ${bits.join(" · ")}`;
}
export function eat(id, src){
  const r = consume(id, src); sync();
  onb("eat", {id, ok:!!r.ok, full:!!r.full, why:r.why || ""});
  if (!r.ok) return note(r.why);
  refreshFridge(); refreshGymFridge();
  FEED.chip(eatChip(r), r.fx.keep < .75 ? "" : "good");
  persist();
}
window.lifeFridgeChanged = () => { refreshFridge(); refreshGymFridge(); };
// a Foodies bag carried up to a fridge (parcels.js parcelStep): the food is in the one stock both fridges share
export function parcelPut(it, f){
  refreshFridge(); refreshGymFridge();
  FEED.chip(`Put away · ${parcelText(it.items)}`, "good");
  note("Food put away. Both fridges share it. How much good it does you depends on the fridge you eat it from.");
  onb("parcelPut", {zone:LIFE.zone, items:it.items || {}, fridge:f ? f.name : ""});
  persist();
}
// the taps in your block are off while the water is (a notice-board event): not a drop at home
function noWater(){
  if (LIFE.zone !== "home" || typeof lifeEventOn !== "function" || !lifeEventOn("water")) return false;
  note(`No water until ${clockText(LIFE_EVENTS.water.to)}. The showers at the training centre still work.`);
  return true;
}
export function water(){
  if (noWater()) return;
  S.fatigue = clamp(S.fatigue - 2, 0, 100); S.energy = clamp(S.energy + 1, 0, 100); S.hyd = clamp(num(S.hyd, 82) + 14, 0, 100); pass(2);
  FEED.chip(`Cup of water · Hydration ${delta(14)} · Fatigue ${delta(-2)}`, "good");
}

/* ---------- the bus, Line 14 ----------
   You choose where to (panels.js openBus), the screen goes dark and the ride plays out on a card (the clock running
   through the minutes the route takes, game.js BUS_ROUTES), and you step off at the other end */
const STOP_NAME = {home:"Strada Teiului", ground:"Training Centre", town:PLACES.town};
export function bus(to){
  if (FLAGS.busy || !STOP_NAME[to] || to === LIFE.zone) return;
  const from = LIFE.zone, mins = busMins(from, to);
  // leaving the training centre: you are not there for what the clock counts any more (before a quarter past the
  // start, it is as if you never came)
  if (from === "ground") attendLeave();
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
    else if (LIFE.min < SESSION.start && !a.excused && SESSION.start - LIFE.min >= EARLY.by && SESSION.start - LIFE.min <= 2*EARLY.by)
      note(`You're here at ${clockText()}. Training starts at ${clockText(SESSION.start)}. Stay around until then and the manager will notice.`);
    else if (LIFE.min < SESSION.start) note(`You're here at ${clockText()}. Training starts at ${clockText(SESSION.start)}. The gym is open, or you can sit on the bench and wait.`);
    else if (LIFE.min < SESSION.end) note(a.status === "late" ? (a.excused ? `${clockText()}. Training started at ${clockText(SESSION.start)}, but you're new here, so nobody's counting. The squad's out on the pitch.` : `${clockText()}. Training started at ${clockText(SESSION.start)}. The manager saw you come in late.`) : `${clockText()}. Training's on and the squad is out on the pitch.`);
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
  if (noWater()) return;
  timeLapse(30, "rest", "Hot bath", () => { wash("bath"); FEED.chip(`Hot bath · clean · Fatigue ${delta(-10)}`, "good"); persist(); }, {icon:"🛁", dur:2});
}
// a quick shower: clean in ten minutes, at home or in the dressing room
export function shower(){
  if (noWater()) return;
  timeLapse(10, "rest", "Shower", () => { wash("shower"); FEED.chip("Showered · fresh", "good"); persist(); }, {icon:"🚿", dur:1.4});
}
export function iceBath(){
  timeLapse(20, "rest", "Ice bath", () => { S.fatigue = clamp(S.fatigue - 14, 0, 100); FEED.chip(`Ice bath · Fatigue ${delta(-14)}`, "good"); persist(); }, {icon:"🧊", dur:2});
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
  if (!shiftOpen()) return note(`Closed. Shifts run from ${range(SHIFT.open, SHIFT.close)}.`);
  if (num(S.odor, 0) >= ODOR_SMELLY && FACE_JOBS.includes(jobState().id)) return note(`The manager takes one sniff and steps back. "Not in front of the customers like that. Go home and have a shower."`);
  openShift();
}

/* ---------- training on your own, and the team session ----------
   The football (the drills on the pitch, the team session, the first day's lessons) is played on the match simulation
   in first person (football/training.js, DESIGN 3.6.2, 3.6.3): the same controls, ball and bodies as a match. It is
   loaded the first time it is needed, and it reaches the career only through the host below (DESIGN D5: no football
   file but bridge.js reads S). The gym's sets stay drills.js's (the mode drill). */
export function trainCheck(){
  if (S.energy < 8){ note("You're running on empty. Eat something before you train."); return false; }
  if (!centreOpen()){ note(`The training centre is closed. It is open from ${centreHours()}.`); return false; }
  if (S.fatigue > 80) FEED.chip("You're exhausted. This will count for little", "bad");
  return true;
}
const begin = D => { if (D) enterMode("drill", D); };
export function reps(kind){ if (!trainCheck() || mode() !== "life") return; begin(startReps(kind, H.host)); }
// what each position works on when the session has little to measure (being out there with the lads)
const SESSION_SKILLS = {ST:["accuracy", "power", "heading", "pace"], LW:["dribbling", "pace", "passacc", "accuracy"], RW:["dribbling", "pace", "passacc", "accuracy"],
  CAM:["passing", "passacc", "curve", "dribbling"], CM:["passing", "stamina", "interception", "tackling"], DF:["tackling", "interception", "heading", "passacc"],
  GK:["jumping", "passacc", "composure", "stamina"]};
const slotOf = () => (S.player && (S.player.teamPos || S.player.pref)) || "CM";
export const TRAIN_HOST = {
  // you, as the simulation needs you: your skills on the day (bridge.effSkills), boots, traits, foot, height
  me(){
    const p = S.player || {}, sk = effSkills();
    return {pid:S.meId != null ? S.meId : 0, name:p.name || "You", number:p.number || 9, slot:slotOf(), pos:p.pos || "CM",
      prefFoot:p.foot === "Left" || p.foot === "L" ? "Left" : p.foot === "Both" || p.foot === "B" ? "Both" : "Right", scale:ME.scale || 1,
      at:attrsForPlayer(sk, S.items || {}, S.traits || {}), energy:clamp(num(S.energy, 80), 0, 100), fatigue:clamp(num(S.fatigue, 0), 0, 100),
      items:S.items || null, traits:Object.assign({}, S.traits || {}), chem:num(S.chem, 0), trust:num(S.trust, 0),
      staminaF:typeof staminaF === "function" ? staminaF() : null, sessionSkills:SESSION_SKILLS[p.pos] || SESSION_SKILLS.CM};
  },
  // your club's squad (not you): who the borrowed bodies are, how good they are
  squad(){
    const c = typeof myClub === "function" ? myClub() : null;
    const list = c && typeof squadOf === "function" ? squadOf(c.id).filter(q => q && !q.me) : [];
    return list.map(q => ({pid:q.id, name:typeof pname === "function" ? pname(q) : "", number:q.no || 0, ovr:q.ovr || 55, pos:q.pos || "CM"}));
  },
  // the training kit, and the bibs the other half wear
  kits(){
    const c = typeof myClub === "function" ? myClub() : null, k = c && typeof kitOf === "function" ? kitOf(c.nm) : ["#2c66b8", "#ffffff"];
    return {home:[k[0], k[1]], away:["#d8ff3a", k[1]]};
  },
  seed:key => hashStr(`train|${S.cid != null ? S.cid : ""}|${S.life ? S.life.day : 0}|${LIFE.min}|${key}`),
  minute:() => LIFE.min,
  sessionEnd:() => SESSION.end,
  sessionOn:() => sessionOn(),
  sessionStartText:() => clockText(SESSION.start),
  xp:(k, amt) => trainXP(k, amt),
  exert:(f, e) => exert(f, e),
  trainMin(m){ S.today.trainMin = num(S.today.trainMin, 0) + m; },
  pass:mins => { if (mins > 0) pass(mins, "train"); },
  note:t => note(t),
  say(who, text){ if (firstDaySay(who, text)) return; note(`${who}: "${text}"`); },
  center:(title, sub) => FEED.center(title, sub, {kind:"drill", icon:"✓", ms:2600}),
  persist:() => persist(),
  attSess(){ const a = S.life.att; return a ? a.sess : null; },
  // a block of the team session played out (ok) or walked out of: the minutes count for attendance either way
  blockDone(mins, ok){
    const ss = S.life.att && S.life.att.sess; if (!ss) return;
    if (ok){ ss.blocks = Math.min(4, ss.blocks + 1); ss.mins += mins; }
    S.today.trainMin = num(S.today.trainMin, 0) + mins;
    exert(3*mins/22.5, 2.5*mins/22.5);
  },
  // the whole session done: its rewards, once a day (DESIGN 3.6.2 and 3.8.8: att.sess.done)
  sessionDone(score){
    const ss = S.life.att.sess;
    const r = sessionRewards(score, S.chem);
    ss.done = true; ss.score = score;
    chemAdd(r.chem); S.life.att.chem = num(S.life.att.chem, 0) + r.chem;
    trustAdd(r.trust);
    S.today.sessions = num(S.today.sessions, 0) + 1;
    persist(true);
    return r;
  },
  // the first day's lessons were the day's session: its rewards once, the rest of its time, the tutorial done
  lessonsDone(score, minsSpent){
    const ss = S.life.att && S.life.att.sess;
    if (ss && !ss.done){ ss.blocks = 4; ss.mins = Math.max(ss.mins, SESSION_PLAN_MINS); TRAIN_HOST.sessionDone(score); }
    const rest = Math.max(0, Math.min(SESSION_PLAN_MINS - minsSpent, SESSION.end - LIFE.min));
    if (rest > 0) pass(rest, "train");
    if (S.flags) S.flags.GameplayTutorialCompleted = true;
    if (S.onb && typeof S.onb === "object") S.onb.step = "done";
    persist(true);
  },
  onb:(ev, data) => onb(ev, data)
};
// the first day's dialogue box while the first day runs (firstday.js speak), else a line of note
function firstDaySay(who, text){ if (!fdActive()) return false; speak(who, text); return true; }
let TRAINING = null, RUN_MOD = null;
const RUNNING = () => !!(RUN_MOD && RUN_MOD.RUN.cur);
// football/training.js, loaded once (it brings the match's controls, bodies and HUD with it)
export function training(){
  if (!TRAINING) TRAINING = import("../football/training.js").then(T => { T.trainHost(TRAIN_HOST); RUN_MOD = T; return T; }).catch(e => { TRAINING = null; throw e; });
  return TRAINING;
}
export function drill(kind){
  if (!trainCheck() || mode() !== "life") return;
  training().then(T => { if (T.RUN.cur) return note("You're in the middle of something already."); T.startDrill(kind); }).catch(e => console.error(e));
}
/* the team session, once a day (DESIGN 3.8.8, 3.6.2: S.life.att.sess = {blocks, mins, done, score}): four blocks played
   on the simulation (training.js startSession); Esc keeps the blocks you finished and joining again carries on from
   the next one; a late start only runs the blocks that fit before SESSION.end, and with fewer than SESSION_LAST minutes
   left they are packing up. Its rewards come once, with the last block. Talking to the coach while it runs steps you
   out of it. */
export function session(){
  const a = S.life.att, ss = a && a.sess;
  if (TRAINING && RUNNING()) return training().then(T => { if (T.RUN.cur && T.RUN.cur.kind === "session" && T.RUN.cur.quit) T.RUN.cur.quit(); });
  if (ss && ss.done) return note("You've done today's session. The coach wants you fresh tomorrow.");
  if (!sessionOn()) return note("The session has finished for today.");
  const left = SESSION.end - LIFE.min;
  if (left < SESSION_LAST) return note(`The session's nearly over. Join them tomorrow at ${clockText(SESSION.start)}.`);
  if (S.energy < 10) return note("You're too hungry to keep up. Eat something first. There's food in the gym fridge.");
  if (mode() !== "life") return;
  training().then(T => T.startSession()).catch(e => console.error(e));
}
// the first day's lessons (WP-H2's G9 calls it): resolves true when they are done
export function startFirstTraining(){ return training().then(T => T.startFirstTraining()); }
window.lifeFirstTraining = startFirstTraining;

/* the mode drill: a gym set (drills.js), driven through the host world.js gives it (the
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
  parcelArrived();                                   // (a bag may have arrived while the hub was up: put there unseen)
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
    // the time now, and why it's shut: locking up right at closing, closed for the night, or not open yet
    const d = ((LIFE.min % 1440) + 1440) % 1440, justShut = d >= CENTRE.close && d - CENTRE.close < 15;
    FEED.center(justShut ? "The training centre is closing" : "The training centre is closed", justShut ? "Everyone out. The bus home is at the gate." : "The bus home is at the gate.", {kind:"day", icon:"🔒", ms:3600});
    // (each about as long as the one line it replaces: a phone held upright has room for two lines of note)
    note(justShut ? `It's ${clockText()} and they're locking up. The bus is waiting for you at the gate.`
      : d < CENTRE.open ? `It's ${clockText()} and it opens at ${clockText(CENTRE.open)}. The bus is waiting at the gate.`
      : `It's ${clockText()} and they locked up at ${clockText(CENTRE.close)}. The bus is waiting at the gate.`);
    return;
  }
  if (performance.now() - closing.t > 3800){ closing = null; bus("home"); }
}
