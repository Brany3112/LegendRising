"use strict";
/* ============ THINGS THAT HAPPEN ============
   One place for everything that comes along on its own and changes a day: thieves about, the power off in your block,
   a car parked across your front door. Each is rolled in the night as a new day starts (rarely: most days nothing
   happens), lasts a day or a few, is put up on the notice board in your lobby (life/notice: drawn from here) and
   announced when it starts, and goes away by itself. New kinds slot in by adding to LIFE_EVENTS — a water cut, a
   broken lift, a noisy neighbour, a shop shut for the day, a road closed, a street lamp out, a delivery running late.

   S.events = {active:[{id, from, to, alt}], away:{t, far} | null, robbed:{day, lost} | null, log:[...]} */
const LIFE_EVENTS = {
  thief:{chance:.07, days:[2, 3], board:"WARNING: THIEVES HAVE BEEN REPORTED IN THE AREA.",
    sub:"Several flats in the street have been broken into. Lock your door — a proper lock — and don't leave it open.", feed:"Thieves reported in the area", kind:"bad"},
  power:{chance:.05, days:[1, 1], board:"NOTICE: THERE WILL BE NO ELECTRICITY TODAY DUE TO MAINTENANCE.", alt:"NOTICE: THERE WILL BE NO ELECTRICITY TODAY DUE TO ELECTRICAL PROBLEMS.",
    sub:"No lights or sockets in the block until midnight. Fridges are off too: food in them won't keep as well.", feed:"No electricity in your block today", kind:"bad"},
  blocked:{chance:.07, days:[1, 1], from:7*60, to:19*60, board:"NOTICE: A CAR IS PARKED ACROSS THE FRONT DOOR.",
    sub:"The owner has been called. Until it's moved (by 7 PM), climb in and out through the lobby window — hold E at it.", feed:"A car is blocking your front door", kind:"bad"}
};
// a career's first two days are its own: nothing is rolled until the third
const EVENT_QUIET_DAYS = 2;
function eventsEnsure(){
  if (!S) return null;
  if (!S.events || typeof S.events !== "object") S.events = {active:[], away:null, robbed:null, log:[]};
  const E = S.events;
  if (!Array.isArray(E.active)) E.active = [];
  if (!Array.isArray(E.log)) E.log = [];
  return E;
}
/* is it on? today (and, for a kind with hours, now) — at minute m of day d, the clock's own by default */
function lifeEventOn(id, d, m){
  if (typeof S === "undefined" || !S || !S.life) return false;
  const E = eventsEnsure(); d = d == null ? S.life.day : d; m = m == null ? S.life.min : m;
  const ev = E.active.find(e => e.id === id && d >= e.from && d <= e.to); if (!ev) return false;
  const k = LIFE_EVENTS[id];
  if (k && k.from != null && (m < k.from || m >= k.to)) return false;
  return true;
}
function lifeEventsToday(){ const E = eventsEnsure(), d = S.life.day; return E.active.filter(e => d >= e.from && d <= e.to); }
// the night's roll: old ones end, maybe a new one starts. Returns what started.
function eventsNewDay(day){
  const E = eventsEnsure(); if (!E) return [];
  E.active = E.active.filter(e => e.to >= day);
  if (day <= EVENT_QUIET_DAYS) return [];
  const started = [];
  for (const [id, k] of Object.entries(LIFE_EVENTS)){
    if (E.active.some(e => e.id === id)) continue;
    if (E.active.length + started.length >= 2) break;                // two things at once is plenty
    if (Math.random() >= k.chance) continue;
    const len = k.days[0] + Math.floor(Math.random()*(k.days[1] - k.days[0] + 1));
    const ev = {id, from:day, to:day + len - 1, alt:!!(k.alt && Math.random() < .5)};
    if (id === "thief") ev.hit = false;
    started.push(ev);
  }
  E.active.push(...started);
  for (const ev of started){ E.log.push({id:ev.id, day}); if (E.log.length > 40) E.log.shift(); dailyEmit("event", ev); }
  return started;
}
function eventText(ev){ const k = LIFE_EVENTS[ev.id]; return ev.alt && k.alt ? k.alt : k.board; }
if (typeof dailyOn === "function") dailyOn((type, d) => { if (type === "newday") eventsNewDay(d.day); });

/* ---------- thieves ----------
   While thieves are about, your flat is at risk whenever you are not in it with the door shut and locked:
     · at home, the door left open:                              70%
     · out but nearby (work, the shops, the street), no lock:    70%
     · in another town or at the training centre, no lock:       40%
     · the new lock fitted and locked:                            5%   (it is never nothing)
   (and asleep at home with the door shut but not locked: 40%). The roll comes when you sleep, and when you come back
   to the flat after being out of it for a while. They take half the money you have. Once a warning's thieves have
   been through your flat, they don't come back for more. */
function theftOdds(where){
  const fx = S.home && S.home.fx; if (!fx) return 0;
  const lockedNew = fx.lock === "new" && fx.locked;
  if (fx.doorOpen) return .7;
  if (lockedNew) return .05;
  return where === "home" ? .4 : where === "far" ? .4 : .7;
}
function lifeTheft(mode){
  const E = eventsEnsure(); if (!E) return null;
  if (!lifeEventOn("thief")){ if (mode === "return") E.away = null; return null; }
  const ev = E.active.find(e => e.id === "thief" && S.life.day >= e.from && S.life.day <= e.to); if (!ev || ev.hit) return null;
  let p;
  if (mode === "night") p = theftOdds("home");
  else {
    const a = E.away; E.away = null;
    if (!a || absNow() - a.t < 90) return null;
    p = theftOdds(a.far ? "far" : "near");
  }
  if (Math.random() >= p) return null;
  ev.hit = true;
  const lost = Math.max(0, Math.floor(num(S.money, 0)*.5));
  S.money = Math.round(num(S.money, 0) - lost);
  E.robbed = {day:S.life.day, lost};
  if (typeof save === "function") save();
  return {lost};
}
// leaving the flat (and how far you have gone): the clock for the "while you were out" roll starts
function lifeAway(far){ const E = eventsEnsure(); if (!E) return; if (!E.away) E.away = {t:absNow(), far:!!far}; else if (far) E.away.far = true; }
