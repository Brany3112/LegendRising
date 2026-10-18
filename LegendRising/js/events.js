"use strict";
/* ============ THINGS THAT HAPPEN ============
   One place for everything that comes along on its own and changes a day in your block: thieves about, the power off,
   a car parked across your front door, the water off, a party upstairs, the Mini Market shut, road works on your
   street, couriers running late. Each is rolled in the night as a new day starts (rarely: most days nothing happens),
   lasts a day or a few, is put up on the notice board in your lobby and announced when it starts, and goes away by
   itself. Every one of them does something real (DESIGN 3.8.6): the rule is next to it here, and the code that keeps
   it is where it bites (the fridge, the bed, the bath, the bus, the shop, Foodies).

   Owner: WP-G (Stage 1). Contract: DESIGN 3.8.6 (notice-board events with real mechanics), 1.3 (one event manager).
   API: LIFE_EVENTS; lifeEventOn(id, d, m) (hours may wrap past midnight); lifeEventsToday(); eventsNewDay(day);
     eventText(ev) (the board line); eventSub(ev) (the line under it); eventFx(ev) (what it means for you, in words);
     noisyTonight(m), noisyDuring(a, b) (absolute minutes); lifeTheft(mode); lifeAway(far).
   The block has stairs and no lift (home.js builds none), so there is no lift event: a notice about one would be a
   promise the game cannot keep.

   S.events = {active:[{id, from, to, alt, flat?}], away:{t, far} | null, robbed:{day, lost} | null, log:[...]} */
const hShort = m => { const h = Math.floor(m/60) % 24, h12 = h % 12 || 12, mm = m % 60; return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
const LIFE_EVENTS = {
  thief:{chance:.06, days:[2, 3], board:"WARNING: THIEVES HAVE BEEN REPORTED IN THE AREA.",
    sub:"Several flats in the street have been broken into. Fit a proper lock and keep it locked.", feed:"Thieves reported in the area", kind:"bad",
    fx:() => "While they're about, a flat that isn't locked with a proper lock can be broken into, and they take half the cash you have."},
  power:{chance:.04, days:[1, 1], board:"NOTICE: THERE WILL BE NO ELECTRICITY TODAY DUE TO MAINTENANCE.", alt:"NOTICE: THERE WILL BE NO ELECTRICITY TODAY DUE TO ELECTRICAL PROBLEMS.",
    sub:"No lights or sockets in the block until midnight. The fridges are off, so food in them is worth less.", feed:"No electricity in your block today", kind:"bad",
    fx:() => `No lights at home today. Food from your fridge does you less good (Power outage ${fmtSigned(Math.round((POWER_CUT_KEEP - 1)*100))}%), and no electricity goes on the bill.`},
  blocked:{chance:.05, days:[1, 1], from:7*60, to:19*60, board:"NOTICE: A CAR IS PARKED ACROSS THE FRONT DOOR.",
    sub:`The owner has been called. Until it's moved, by ${fmtTime(19*60)}, climb in and out through the lobby window. Hold E at it.`, feed:"A car is blocking your front door", kind:"bad",
    fx:k => `The front door is blocked from ${fmtTime(k.from)} until ${fmtTime(k.to)}. Use the lobby window instead: hold E at it.`},
  water:{chance:.04, days:[1, 1], from:8*60, to:20*60, board:`NOTICE: NO WATER IN THE BLOCK TODAY, ${hShort(8*60)} TO ${hShort(20*60)}. PIPE REPAIRS.`,
    sub:"The taps are off while they fix a pipe in the basement.", feed:"No water in your block today", kind:"bad",
    fx:k => `No bath, shower or tap water at home from ${fmtTime(k.from)} to ${fmtTime(k.to)}. The showers at the training centre still work.`},
  noisy:{chance:.06, days:[1, 1], from:22*60, to:3*60, board:ev => `TO THE TENANTS OF FLAT ${ev.flat || "302"}: PLEASE KEEP THE NOISE DOWN TONIGHT.`,
    sub:"There's a party upstairs tonight. Earplugs are not provided.", feed:"A party in your block tonight", kind:"bad",
    fx:k => `A night in your own bed takes less fatigue off (Noisy neighbours ${fmtSigned(Math.round((NOISY_SLEEP - 1)*100))}%) from ${fmtTime(k.from)} to ${fmtTime(k.to)}.`},
  shop:{chance:.04, days:[1, 1], board:"MINI MARKET CLOSED TODAY FOR STOCKTAKING.",
    sub:"Back to normal tomorrow. Foodies still delivers.", feed:"The Mini Market is closed today", kind:"bad",
    fx:() => "You can't buy food at the Mini Market today. Order on Foodies instead."},
  roadworks:{chance:.05, days:[1, 2], board:"ROAD WORKS ON STRADA TEIULUI. LINE 14 IS DIVERTED.",
    sub:`Allow ${ROADWORKS_DELAY} minutes extra for the bus.`, feed:"Road works on your street", kind:"bad",
    fx:() => `Every bus to or from your street takes ${ROADWORKS_DELAY} minutes longer.`},
  delivery:{chance:.05, days:[1, 1], board:"FOODIES: COURIERS ARE RUNNING LATE IN THIS AREA TODAY.",
    sub:"Orders are taking up to an hour longer than usual.", feed:"Foodies is running late today", kind:"bad",
    fx:() => `Foodies orders take ${FOODIES_LATE[0]} to ${FOODIES_LATE[1]} minutes longer than usual today.`}
};
// two things that make no sense together are never rolled together (no water and no power: one notice is enough)
const EVENT_CLASH = [["noisy", "power"], ["water", "power"]];
// a career's first two days are its own: nothing is rolled until the third
const EVENT_QUIET_DAYS = 2;
// at most this many at once
const EVENT_MAX = 2;
function eventsEnsure(){
  if (typeof S === "undefined" || !S) return null;
  if (!S.events || typeof S.events !== "object") S.events = {active:[], away:null, robbed:null, log:[]};
  const E = S.events;
  if (!Array.isArray(E.active)) E.active = [];
  if (!Array.isArray(E.log)) E.log = [];
  E.active = E.active.filter(e => e && LIFE_EVENTS[e.id]);      // (a kind this build no longer has, or never had)
  return E;
}
const eventWraps = k => !!k && k.from != null && k.from > k.to;
// the event of this kind that covers day d, if any
function eventOnDay(id, d){ const E = eventsEnsure(); return E ? E.active.find(e => e.id === id && d >= e.from && d <= e.to) || null : null; }
/* is it on? today (and, for a kind with hours, now): at minute m of day d, the clock's own by default. A kind whose
   hours run past midnight (the party, 22:00 to 03:00) is on in the small hours if it was on the day before */
function lifeEventOn(id, d, m){
  if (typeof S === "undefined" || !S || !S.life) return false;
  d = d == null ? S.life.day : d; m = m == null ? S.life.min : m;
  const k = LIFE_EVENTS[id]; if (!k) return false;
  if (k.from == null) return !!eventOnDay(id, d);
  if (!eventWraps(k)) return !!eventOnDay(id, d) && m >= k.from && m < k.to;
  return (!!eventOnDay(id, d) && m >= k.from) || (!!eventOnDay(id, d - 1) && m < k.to);
}
// the notices on the board now: today's, and last night's party until it is over
function lifeEventsToday(){
  const E = eventsEnsure(); if (!E) return [];
  const d = S.life.day, m = S.life.min;
  return E.active.filter(e => (d >= e.from && d <= e.to) || (eventWraps(LIFE_EVENTS[e.id]) && d - 1 >= e.from && d - 1 <= e.to && m < LIFE_EVENTS[e.id].to));
}
/* the party: is there one the night you would sleep through from minute m (before five in the morning, last night's),
   and does one fall inside the stretch of absolute minutes [a, b) */
function noisyTonight(m, d){
  if (typeof S === "undefined" || !S || !S.life) return false;
  m = m == null ? S.life.min : m; d = d == null ? S.life.day : d;
  return !!eventOnDay("noisy", m < 5*60 ? d - 1 : d);
}
function noisyDuring(a, b){
  const k = LIFE_EVENTS.noisy;
  for (let night = Math.floor(a/1440) - 1; night <= Math.floor(b/1440); night++){
    if (!eventOnDay("noisy", night)) continue;
    const s = night*1440 + k.from, e = (night + 1)*1440 + k.to;
    if (s < b && e > a) return true;
  }
  return false;
}
// the night's roll: old ones end, maybe new ones start, at most EVENT_MAX at once. Returns what started.
function eventsNewDay(day){
  const E = eventsEnsure(); if (!E) return [];
  E.active = E.active.filter(e => e.to >= day - (eventWraps(LIFE_EVENTS[e.id]) ? 1 : 0));
  if (day <= EVENT_QUIET_DAYS) return [];
  const started = [], on = () => E.active.filter(e => e.to >= day).concat(started);
  // every kind gets the same chance of being looked at first: the order is shuffled each night
  const ids = Object.keys(LIFE_EVENTS);
  for (let i = ids.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  for (const id of ids){
    const k = LIFE_EVENTS[id], now = on();
    if (now.length >= EVENT_MAX) break;
    if (now.some(e => e.id === id)) continue;
    if (EVENT_CLASH.some(([a, b]) => (a === id && now.some(e => e.id === b)) || (b === id && now.some(e => e.id === a)))) continue;
    if (Math.random() >= k.chance) continue;
    const len = k.days[0] + Math.floor(Math.random()*(k.days[1] - k.days[0] + 1));
    const ev = {id, from:day, to:day + len - 1, alt:!!(k.alt && Math.random() < .5)};
    if (id === "thief") ev.hit = false;
    if (id === "noisy") ev.flat = noisyFlat();
    started.push(ev);
  }
  E.active.push(...started);
  for (const ev of started){ E.log.push({id:ev.id, day}); if (E.log.length > 40) E.log.shift(); dailyEmit("event", ev); }
  return started;
}
// the flat with the party: upstairs from yours (the top floor's own corridor if you live on it), never yours
function noisyFlat(){
  const h = S.home || {}, f = Math.max(1, Math.round(num(h.floor, 1))), dr = Math.max(1, Math.round(num(h.door, 1)));
  return f < 3 ? `${f + 1}0${dr}` : `${f}0${dr % 4 + 1}`;
}
const evText = (v, ev) => typeof v === "function" ? v(ev) : v;
function eventText(ev){ const k = LIFE_EVENTS[ev.id]; if (!k) return ""; return ev.alt && k.alt ? k.alt : evText(k.board, ev); }
function eventSub(ev){ const k = LIFE_EVENTS[ev.id]; return k ? evText(k.sub, ev) : ""; }
function eventFx(ev){ const k = LIFE_EVENTS[ev.id]; return k && k.fx ? k.fx(k, ev) : ""; }
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
