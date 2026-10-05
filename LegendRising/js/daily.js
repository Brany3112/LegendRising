"use strict";
/* ============ DAILY LIFE ============
   A season week is seven days you live one at a time. Sleeping takes you to the next morning — never
   further — and the season's week turns over in the night from Sunday to Monday.

   Everything that belongs to a day lives here: the clock, the two meters you manage (energy, which is
   food, and fatigue), the team's training session and whether you turned up to it, Team Chemistry,
   the manager's trust, your personality, and what you did today for the summary before bed.
   The first-person world calls in here; nothing in here draws anything. */

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SESSION = {start:10*60, end:17*60, late:10*60 + 15};
// when each kind of game is played inside its week: [weekday, kick-off minute]
const KICKOFF = {F:[5, 17*60], L:[5, 19*60], C:[2, 19*60], E:[1, 20*60], N:[4, 19*60 + 45], D:[5, 19*60]};
const TUNNEL_OPEN = 90;            // minutes before kick-off you can walk out
const MATCH_LEN = 115;             // kick-off to walking back out of the tunnel
// meters per game minute for each kind of time. e: energy burnt, f: fatigue gained (negative recovers)
const ACT = {idle:{e:.035, f:.012}, walk:{e:.04, f:.014}, bus:{e:.03, f:0}, rest:{e:.03, f:-.06},
  sleep:{e:0, f:0}, work:{e:.05, f:.03}, train:{e:.04, f:.02}, match:{e:0, f:0}, shop:{e:.03, f:0}};

const pad2 = n => String(n).padStart(2, "0");
// the football world, for the first-person modules (which have a W of their own for the scene)
function gameWorld(){ return W; }
const num = (v, d) => (typeof v === "number" && isFinite(v)) ? v : d;
function lifeMode(){ return typeof document !== "undefined" && document.body.classList.contains("life"); }
function lifeZone(){ return (window.LIFE && window.LIFE.zone) || "home"; }
function absNow(){ return S.life.day*1440 + S.life.min; }
// 7:05 PM — the game speaks twelve-hour time everywhere
function fmtTime(m){
  m = Math.floor(((num(m, 0) % 1440) + 1440) % 1440);
  const h = Math.floor(m/60), mm = m % 60, h12 = h % 12 || 12;
  return `${h12}:${pad2(mm)} ${h < 12 ? "AM" : "PM"}`;
}
function dayName(wd){ return DOW[((num(wd, 0) % 7) + 7) % 7]; }
function todayName(){ return dayName(S.life.wd); }

/* ---------- how you look: S.player.look ----------
   Your body in the 3D world is drawn by the same character system as everyone else (js/life/human.js); this is the
   part of it that is yours to choose and that the save keeps. Colours are stored as numbers (0xRRGGBB). Kit colours
   are not here: they come from your club. Every field is checked by lookSane(), so a save can never hand the world
   a look with a hole in it. */
const LOOK_OPT = {
  skin:[0xf3d3bb, 0xeac2a4, 0xdcab88, 0xc9926a, 0xb07a55, 0x8f5d3f, 0x6c4531, 0x4e3226],
  hair:[["short", "Short"], ["fade", "Fade"], ["buzz", "Buzz cut"], ["messy", "Messy"], ["curly", "Curly"], ["afro", "Afro"], ["long", "Long"],
    ["ponytail", "Ponytail"], ["bun", "Bun"], ["braids", "Braids"], ["cornrows", "Cornrows"], ["dreads", "Dreads"], ["bald", "Shaved"]],
  hairColor:[0x15110e, 0x2b1d15, 0x4a3122, 0x7a5537, 0xb08b58, 0x8f4628, 0x8f8b85, 0xcdcac4],
  beard:[["", "Clean-shaven"], ["stubble", "Stubble"], ["beard", "Beard"]],
  build:[["slim", "Slim"], ["average", "Average"], ["athletic", "Athletic"], ["stocky", "Stocky"], ["muscular", "Muscular"]],
  eyes:[0x3b2516, 0x22160f, 0x5f4a28, 0x4c6a3e, 0x4a6f95],
  top:[["casual", "T-shirt"], ["polo", "Polo"], ["hoodie", "Hoodie"], ["jacket", "Jacket"]],
  legs:[["jeans", "Jeans"], ["trousers", "Chinos"], ["trackpants", "Joggers"], ["shorts", "Shorts"]],
  topCol:[0xf2f0ea, 0x1f2125, 0x8a8f96, 0x24324a, 0x2c66b8, 0x5a6b3e, 0x6e2a2f, 0xc9a23e, 0x7fa7c9, 0xc4683a, 0x3d6f6a, 0x4a3b5e],
  legCol:[0x2c3e5c, 0x23293a, 0x50698f, 0x1c1d21, 0x34383f, 0xa89a78, 0x6b6e72, 0x5a4a38],
  shoeCol:[0xf0f0ec, 0x1c1d21, 0x7d8188, 0x8a6a48, 0x2b3a5a, 0xd32f3a],
  // face shape: [key, label, min, max] — the character system works in steps of .06 either side of 1
  face:[["jaw", "Jaw", .88, 1.12], ["chin", "Chin", .88, 1.12], ["nose", "Nose", .88, 1.12], ["brow", "Brow", .88, 1.18], ["eyes", "Eye spacing", .94, 1.06]],
  height:[.93, 1.07]                                        // × 1.80 m: 1.67 – 1.93 m
};
/* what only the barber does (barber.js in the life world): cuts, beards and dyes that are not on the creation screen.
   A look may carry them; lookSane keeps them. */
const LOOK_BARBER = {
  hair:[["undercut", "Undercut"], ["slick", "Slicked back"], ["spiky", "Spiky"], ["mohawk", "Mohawk"]],
  beard:[["goatee", "Goatee"], ["full", "Full beard"]],
  hairColor:[[0xd8b860, "Bleached blonde"], [0xe6dcc4, "Platinum"], [0xa4302a, "Fire red"], [0x2d4f9e, "Electric blue"]]
};
// a tiny seeded random for classic scripts (the same sequence for the same seed)
function lookRng(seed){
  let s = 2166136261; const t = String(seed); for (let i = 0; i < t.length; i++) s = Math.imul(s ^ t.charCodeAt(i), 16777619);
  s >>>= 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0)/4294967296; };
}
const lookFaceStep = (v, a, b) => clamp(Math.round((num(v, 1) - 1)/.06)*.06 + 1, a, b);
// a believable young footballer, the same one every time for the same seed
function lookDefault(seed){
  const r = lookRng(seed), pick = a => a[Math.floor(r()*a.length) % a.length], O = LOOK_OPT;
  const wp = list => { let tot = 0; for (const e of list) tot += e[1]; let x = r()*tot; for (const e of list){ if ((x -= e[1]) <= 0) return e[0]; } return list[0][0]; };
  const tone = Math.floor(r()*O.skin.length), dark = tone >= 5, mid = tone >= 3 && tone < 5;
  const hc = dark ? wp([[0, .8], [1, .2]]) : mid ? wp([[0, .5], [1, .4], [2, .1]]) : wp([[0, .14], [1, .32], [2, .28], [3, .14], [4, .1], [5, .02]]);
  const hair = dark ? wp([["buzz", .2], ["fade", .26], ["short", .1], ["afro", .1], ["curly", .12], ["braids", .06], ["cornrows", .06], ["dreads", .1]])
    : wp([["short", .32], ["fade", .22], ["buzz", .12], ["messy", .16], ["curly", .1], ["long", .04], ["ponytail", .04]]);
  const top = wp([["casual", .5], ["hoodie", .25], ["polo", .15], ["jacket", .1]]), legs = wp([["jeans", .45], ["trackpants", .3], ["trousers", .15], ["shorts", .1]]);
  const fs = (a, b) => lookFaceStep(a + (b - a)*r(), a, b);
  return {v:1, skin:O.skin[tone], height:+(.95 + r()*.09).toFixed(3), build:wp([["athletic", .5], ["slim", .22], ["average", .2], ["muscular", .08]]),
    hair, hairColor:O.hairColor[hc], beard:wp([["", .7], ["stubble", .26], ["beard", .04]]), eyes:tone <= 2 ? pick(O.eyes) : pick(O.eyes.slice(0, 2)),
    face:{jaw:fs(.94, 1.12), chin:fs(.88, 1.12), nose:fs(.88, 1.12), brow:fs(.94, 1.12), eyes:fs(.94, 1.06)},
    top, topCol:pick(O.topCol), legs, legCol:pick(legs === "jeans" ? O.legCol.slice(0, 4) : O.legCol), shoeCol:pick(O.shoeCol)};
}
// a colour as a number, from a number or a "#rrggbb" string; anything else is the fallback
function lookCol(v, d){
  if (typeof v === "number" && isFinite(v) && v >= 0 && v <= 0xffffff) return Math.round(v);
  if (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v.trim())) return parseInt(v.trim().replace("#", ""), 16);
  return d;
}
// every field present and in range; whatever is missing or broken comes from the seeded default
function lookSane(L, seed){
  const d = lookDefault(seed == null ? "player" : seed), O = LOOK_OPT, o = L && typeof L === "object" ? L : {};
  const one = (v, list, dv) => list.some(e => e[0] === v) ? v : dv;
  const F = o.face && typeof o.face === "object" ? o.face : {};
  return {v:1, skin:lookCol(o.skin, d.skin), height:+clamp(num(o.height, d.height), O.height[0], O.height[1]).toFixed(3),
    build:one(o.build, O.build, d.build), hair:one(o.hair, O.hair.concat(LOOK_BARBER.hair), d.hair), hairColor:lookCol(o.hairColor, d.hairColor),
    beard:one(o.beard, O.beard.concat(LOOK_BARBER.beard), d.beard), eyes:lookCol(o.eyes, d.eyes),
    face:Object.fromEntries(O.face.map(([k, , a, b]) => [k, lookFaceStep(num(F[k], d.face[k]), a, b)])),
    top:one(o.top, O.top, d.top), topCol:lookCol(o.topCol, d.topCol), legs:one(o.legs, O.legs, d.legs), legCol:lookCol(o.legCol, d.legCol),
    shoeCol:lookCol(o.shoeCol, d.shoeCol)};
}
function lookSeedOf(s){ return (s && (s.cid || (s.player && s.player.name))) || "player"; }

/* ---------- making sure a save has everything, and nothing that reads "undefined" ---------- */
const TRAIT_KEYS = ["team", "conf", "dec", "risk"];
function freshAtt(){ return {arrived:null, min:0, status:"", settled:false, chem:0, told:false}; }
function freshToday(){
  return {xp:0, xpBy:{}, jobXp:0, earned:0, spent:0, eaten:0, food:0, drinks:0, chem0:num(S.chem, 0), trust0:num(S.trust, 0),
    trainMin:0, workMin:0, sessions:0, media:0, start:S.life ? absNow() : 0};
}
// new skills arrive in older careers as something close to what the player already is, so the overall barely moves
const SKILL_SEED = {
  passacc: s => s.passing*.85 + s.accuracy*.15,
  interception: s => s.tackling*.8 + s.composure*.2,
  jumping: s => (s.pace + s.stamina)/2,
  heading: s => (s.power + s.tackling)/2
};
function dailyEnsure(){
  if (!S) return;
  const firstDay = !S.life;                         // a career from before days were lived one at a time
  S.skills = S.skills || {};
  for (const [k] of SKILLS){
    if (!(typeof S.skills[k] === "number" && isFinite(S.skills[k]))){
      const seed = SKILL_SEED[k];
      const base = {power:30, aero:30, curve:30, accuracy:30, passing:30, pace:30, dribbling:30, stamina:30, composure:28, tackling:24};
      const s = Object.assign({}, base, S.skills);
      for (const q of Object.keys(base)) if (!(typeof s[q] === "number" && isFinite(s[q]))) s[q] = base[q];
      S.skills[k] = clamp(Math.round(seed ? seed(s) : 24), 5, 99);
    }
    S.skills[k] = clamp(Math.round(S.skills[k]), 1, 99);
  }
  S.skillXp = S.skillXp || {};
  for (const [k] of SKILLS) S.skillXp[k] = num(S.skillXp[k], 0);
  S.life = Object.assign({day:1, min:7*60}, S.life || {});
  S.life.day = Math.max(1, Math.round(num(S.life.day, 1)));
  S.life.min = clamp(num(S.life.min, 7*60), 0, 1439.99);
  if (!(typeof S.life.wd === "number" && isFinite(S.life.wd))) S.life.wd = (S.life.day - 1) % 7;
  if (!S.life.att) S.life.att = freshAtt();
  if (!Array.isArray(S.life.miss)) S.life.miss = [];
  S.life.view = S.life.view === "tp" ? "tp" : "fp";            // first or third person, as you last left it
  if (S.player) S.player.look = lookSane(S.player.look, lookSeedOf(S));
  S.energy = clamp(num(S.energy, 80), 0, 100);
  S.fatigue = clamp(num(S.fatigue, 12), 0, 100);
  S.chem = clamp(num(S.chem, 20), 0, 100);
  S.trust = clamp(num(S.trust, 0), -30, 80);
  S.money = Math.round(num(S.money, 0));
  S.traits = Object.assign({team:50, conf:50, dec:50, risk:50}, S.traits || {});
  for (const k of TRAIT_KEYS) S.traits[k] = clamp(num(S.traits[k], 50), 0, 100);
  S.inv = S.inv || {};
  for (const k of Object.keys(FOOD)) S.inv[k] = Math.max(0, Math.round(num(S.inv[k], 0)));
  // food did not exist before then: a few things in the fridge so the first morning is not an empty one
  if (firstDay && !Object.keys(FOOD).some(k => FOOD[k].kind === "food" && S.inv[k] > 0))
    Object.assign(S.inv, {sandwich:S.inv.sandwich + 2, meal:S.inv.meal + 1, fruit:S.inv.fruit + 2, water:S.inv.water + 2});
  if (!Array.isArray(S.orders)) S.orders = [];
  if (!Array.isArray(S.parcels)) S.parcels = [];
  if (!S.today || typeof S.today !== "object") S.today = freshToday();
  const ft = freshToday();
  for (const k of Object.keys(ft)) if (S.today[k] == null || (typeof ft[k] === "number" && !isFinite(S.today[k]))) S.today[k] = ft[k];
  S.apps = S.apps || [];
  if (!S.apps.includes("foodies")) S.apps.push("foodies");
  // day-job experience is counted in points now, not in shifts
  if (S.job && !S.job.v2){ S.job.xp = Math.round(num(S.job.xp, 0)*JOB_XP_PER_SHIFT); S.job.v2 = true; }
  if (S.job) S.job.xp = Math.max(0, Math.round(num(S.job.xp, 0)));
}

/* ---------- the club's training centre: what your club can afford ----------
   1 (a Liga 4 club's shed: worn pitch, rusty weights, a fridge on its last legs) to 6 (an elite academy). It follows the
   club's standing, so a move up the leagues is a move into better facilities. */
const FAC_NAME = ["Extremely poor", "Poor", "Basic", "Good", "Very good", "Elite"];
function clubFacTier(c){
  try {
    c = c || (typeof myClub === "function" ? myClub() : null);
    if (!c) return 1;
    const r = num(c.rep, 0);
    return r < 250 ? 1 : r < 700 ? 2 : r < 1500 ? 3 : r < 3500 ? 4 : r < 6000 ? 5 : 6;
  } catch(e){ return 1; }
}
function clubFridgeMult(){ return FRIDGE_KEEP[clubFacTier() - 1]*(typeof lifeEventOn === "function" && lifeEventOn("power") && lifeZone() === "home" ? .7 : 1); }
// how much a gym rep is worth on equipment of this tier
const GYM_XP = [.6, .75, .9, 1, 1.15, 1.3];

/* ---------- the schedule: when the team trains and when you play ---------- */
function fixtureSlot(f){ const k = KICKOFF[f && f.kind] || KICKOFF.L; return {wd:k[0], min:k[1]}; }
// this week's games for you, worked out once a week rather than every frame
let WFX = {wk:-1, club:-2, season:-1, list:[]};
function weekFixtures(){
  try {
    if (typeof myClub !== "function" || !myClub()) return [];
    const me = meP();
    if (WFX.wk !== S.week || WFX.club !== me.club || WFX.season !== W.season || WFX.S !== S) WFX = {wk:S.week, club:me.club, season:W.season, S, list:myFixtures()};
    for (const f of WFX.list) f.done = !!W.done[f.key];
    return WFX.list;
  } catch(e){ return []; }
}
function todaysFixture(includeDone){
  return weekFixtures().find(f => (includeDone || !f.done) && fixtureSlot(f).wd === S.life.wd) || null;
}
function nextFixture(){
  const wd = S.life.wd;
  return weekFixtures().filter(f => !f.done && fixtureSlot(f).wd >= wd).sort((a, b) => fixtureSlot(a).wd - fixtureSlot(b).wd)[0] || null;
}
function trainingDay(wd){
  if (wd == null) wd = S.life.wd;
  if (typeof myClub !== "function" || !myClub() || wd >= 5) return false;
  return !weekFixtures().some(f => fixtureSlot(f).wd === wd);
}
function sessionOn(m){ return trainingDay() && (m == null ? S.life.min : m) >= SESSION.start && (m == null ? S.life.min : m) < SESSION.end; }
function oppName(f){ const me = meP(), home = f.kind === "N" ? f.h === me.nat : f.h === me.club; return sideName(f, home ? "a" : "h"); }
// one line for "today", the way the computer and the HUD describe it
function todayLine(){
  const f = todaysFixture(true);
  if (f){ const s = fixtureSlot(f); return f.done ? `Match played · ${W.done[f.key] ? `${W.done[f.key].hg}–${W.done[f.key].ag}` : ""}` : `Match day · ${fmtTime(s.min)}`; }
  if (trainingDay()) return `Training ${fmtTime(SESSION.start)} – ${fmtTime(SESSION.end)}`;
  return S.life.wd >= 5 ? "Rest day" : "No training today";
}

/* ---------- the two meters ---------- */
function needsTick(mins, act){
  const r = ACT[act] || ACT.idle;
  S.energy = clamp(S.energy - r.e*mins, 0, 100);
  let f = r.f*mins;
  // still up in the small hours: the body notices
  if (act !== "sleep" && S.life.min >= 60 && S.life.min < 6*60) f += .05*mins;
  S.fatigue = clamp(S.fatigue + f, 0, 100);
}
// how much a training rep is worth right now. Fresh and fed: all of it. Exhausted or starving: a fraction.
function trainEff(){
  const f = S.fatigue, e = S.energy;
  const fe = f <= 45 ? 1 : clamp(1 - (f - 45)/70, .25, 1);
  const ee = e >= 40 ? 1 : clamp(.4 + e/66, .4, 1);
  return fe*ee;
}
function effLabel(){ const e = trainEff(); return e >= .95 ? "Fresh" : e >= .75 ? "Good" : e >= .5 ? "Tired" : "Exhausted"; }
// the cost of doing something hard. Pushing on when you are already spent costs half as much again.
function exert(fat, en){
  const heavy = S.fatigue > 70 ? 1.5 : 1;
  S.fatigue = clamp(S.fatigue + fat*heavy*(S.staff && S.staff.fitCoach ? .85 : 1), 0, 100);
  S.energy = clamp(S.energy - en*(carTier() >= 2 ? .85 : 1)*(S.staff && S.staff.nutri ? .9 : 1), 0, 100);
}
function fatigueLabel(f){ f = num(f, S.fatigue); return f < 20 ? "Fresh" : f < 45 ? "A little tired" : f < 70 ? "Tired" : f < 85 ? "Exhausted" : "Running on empty"; }
function energyLabel(e){ e = num(e, S.energy); return e >= 75 ? "Well fed" : e >= 45 ? "Fine" : e >= 25 ? "Hungry" : "Starving"; }

/* ---------- the clock ---------- */
const DAILY = {listeners:[], seasonPending:null};
function dailyOn(fn){ DAILY.listeners.push(fn); }
function dailyEmit(type, data){ for (const fn of DAILY.listeners) try { fn(type, data); } catch(e){ console.error(e); } }
function dailyPass(mins, act){
  if (!S || !S.life || !(mins > 0)) return;
  const L = S.life;
  let left = mins;
  while (left > 1e-6){
    const toMid = 1440 - L.min;
    const step = Math.min(left, toMid, 10);
    L.min += step; left -= step;
    needsTick(step, act);
    attendTick(step);
    if (L.min >= 1440 - 1e-6){ L.min = 0; dayRollover(); }
    timeChecks();
  }
  L.min = clamp(L.min, 0, 1439.99);
}
function timeChecks(){
  const now = absNow();
  // Foodies orders arriving: a bag left at the delivery point it was sent to — the table in your lobby, or the shelf by
  // the gym door at the training centre — waiting for you to carry it to a fridge
  for (const o of S.orders.slice()) if (now >= o.eta){
    S.orders = S.orders.filter(x => x !== o);
    const at = o.where === "ground" ? "ground" : "home";
    (S.parcels || (S.parcels = [])).push({id:o.id, items:o.items || {}, at, t:now});
    dailyEmit("delivered", Object.assign({}, o, {where:at}));
  }
  // an energy drink wearing off
  if (S.boost && now >= S.boost.at){
    const crash = Math.round(S.boost.amt*.45);
    S.energy = clamp(S.energy - crash, 0, 100); S.fatigue = clamp(S.fatigue + 5, 0, 100);
    S.boost = null;
    dailyEmit("crash", {crash});
  }
  missedMatches(false);
}

/* ---------- training attendance ---------- */
function attendTick(step){
  const a = S.life.att; if (!a || a.settled || !trainingDay()) return;
  const m = S.life.min;
  if (lifeZone() === "ground" && m >= SESSION.start - 120 && m < SESSION.end){
    if (a.arrived == null) arriveForTraining();
    if (m >= SESSION.start){
      a.min += step;
      // being around the group all day is how a dressing room gets to know you
      const rate = .9/60*(1 - S.chem/120)*(.8 + S.traits.team/250);
      const g = rate*step;
      S.chem = clamp(S.chem + g, 0, 100); a.chem += g;
    }
  }
  if (m >= SESSION.end) settleAttendance();
}
function arriveForTraining(){
  const a = S.life.att; if (!a || a.arrived != null || a.settled || !trainingDay()) return;
  const m = S.life.min; if (m >= SESSION.end || m < SESSION.start - 180) return;
  a.arrived = m;
  if (m <= SESSION.late) a.status = "ontime";
  else {
    a.status = "late";
    const d = -3; trustAdd(d);
    S.life.miss.push({day:S.life.day, k:"late"});
    dailyEmit("late", {d, min:m});
  }
}
// at five o'clock, or in the night if you never came: how did the day go in the manager's eyes
function settleAttendance(){
  const a = S.life.att; if (!a || a.settled) return;
  a.settled = true;
  if (!trainingDay()) return;
  let d = 0, k = "";
  if (!a.status){ d = -6; k = "absent"; S.chem = clamp(S.chem - 1.5, 0, 100); S.life.miss.push({day:S.life.day, k:"absent"}); }
  else if (a.status === "ontime"){ if (a.min >= 150){ d = 1.2; k = "good"; } else { d = -1; k = "early"; } }
  else if (a.status === "late" && a.min >= 240){ d = .5; k = "lateStayed"; }
  // the same thing three times in a week stops being bad luck
  S.life.miss = S.life.miss.filter(x => x.day > S.life.day - 7);
  if ((k === "absent" || a.status === "late") && S.life.miss.length >= 3){ d -= 2; k += "+habit"; }
  if (d) trustAdd(d);
  dailyEmit("settled", {d, k, chem:a.chem});
}

/* ---------- days and weeks ---------- */
function dayRollover(){
  const L = S.life;
  if (!L.att.settled) settleAttendance();
  missedMatches(true);
  L.day++; L.wd = (L.wd + 1) % 7;
  L.att = freshAtt();
  dailyEmit("newday", {day:L.day, wd:L.wd});
  if (L.wd === 0) weekRollover();
}
function weekRollover(){
  let r = null;
  try { r = endWeek(); }
  catch(e){
    console.error("endWeek failed", e);
    S.faults = (S.faults || []).concat([{gw:gw(), wk:S.week, at:"endWeek", m:String(e && e.message || e).slice(0, 160)}]).slice(-20);
    S.week++;
  }
  if (r && r.income) { S.today.earned += r.income; }
  dailyEmit("newweek", r || {});
  if (r && r.seasonOver){
    let sum = null;
    try { sum = seasonEnd(); } catch(e){ console.error("seasonEnd failed", e); sum = {pos:0, lg:"—", report:[]}; }
    DAILY.seasonPending = sum;
    dailyEmit("season", sum);
  }
}
// a game that came and went without you
function missedMatches(dayEnded){
  if (typeof MT !== "undefined" && MT) return;
  for (const f of weekFixtures()){
    if (f.done || W.done[f.key]) continue;
    const s = fixtureSlot(f);
    if (s.wd !== S.life.wd) continue;
    if (!dayEnded && S.life.min < s.min + MATCH_LEN) continue;
    const me = meP(), excused = me.inj > 0 || (S.ban || 0) > 0;
    try { simFixture(f); } catch(e){ console.error(e); }
    if (!excused){
      trustAdd(-10); S.chem = clamp(S.chem - 3, 0, 100);
      addNews("you", `${S.player.name} misses the match`, `${sideName(f, "h")} v ${sideName(f, "a")} went ahead without him. The manager wants an explanation.`, "me");
    }
    dailyEmit("missed", {f, excused});
  }
}

/* ---------- sleep ---------- */
function isNight(m){ m = num(m, S.life.min); return m >= 19*60 || m < 5*60; }
// sleep until seven tomorrow (or this morning, if it is already past midnight). Returns what it did.
function sleepNight(tier){
  const L = S.life, m = L.min;
  const mins = m >= 7*60 ? (1440 - m) + 7*60 : 7*60 - m;
  const f0 = S.fatigue, e0 = S.energy;
  dailyPass(mins, "sleep");
  const hours = mins/60, q = clamp(hours/7.5, .35, 1.1);
  const mult = 1 + ((typeof energyMult === "function" ? energyMult() : 1) - 1)*.5;
  const bt = clamp(Math.round(num(tier, 2)), 1, 6) - 1;
  S.fatigue = clamp(S.fatigue - BED_REST[bt]*q*mult, 0, 100);
  S.energy = clamp(S.energy + BED_FED[bt]*q, 0, 100);
  S.boost = null;
  return {mins, hours, fatigue:Math.round(S.fatigue - f0), energy:Math.round(S.energy - e0)};
}
/* hold E on the bed: asleep for exactly one day — the clock moves on 24 hours, to this time tomorrow. Slept out, but a
   day without food leaves you hungry */
function sleepFullDay(tier){
  const f0 = S.fatigue, e0 = S.energy;
  dailyPass(1440, "sleep");
  const mult = 1 + ((typeof energyMult === "function" ? energyMult() : 1) - 1)*.5;
  const bt = clamp(Math.round(num(tier, 2)), 1, 6) - 1;
  S.fatigue = clamp(S.fatigue - (BED_REST[bt] + 18)*mult, 0, 100);
  S.energy = clamp(S.energy + BED_FED[bt]*.6, 0, 100);
  S.boost = null;
  return {mins:1440, hours:24, fatigue:Math.round(S.fatigue - f0), energy:Math.round(S.energy - e0)};
}
function nap(tier){
  const f0 = S.fatigue;
  dailyPass(120, "sleep");
  S.fatigue = clamp(S.fatigue - (6 + clamp(Math.round(num(tier, 2)), 1, 6)*2), 0, 100);
  S.energy = clamp(S.energy - 2, 0, 100);
  return {fatigue:Math.round(S.fatigue - f0)};
}
// what today looked like, for the card before bed
function daySummary(){
  const t = S.today;
  const best = Object.entries(t.xpBy || {}).sort((a, b) => b[1] - a[1])[0];
  return {xp:Math.round(t.xp), best:best ? {k:best[0], n:Math.round(best[1])} : null, jobXp:Math.round(t.jobXp),
    earned:Math.round(t.earned), spent:Math.round(t.spent), eaten:t.eaten, food:Math.round(t.food),
    energy:Math.round(S.energy), fatigue:Math.round(S.fatigue),
    chem:Math.round((S.chem - t.chem0)*10)/10, trust:Math.round((S.trust - t.trust0)*10)/10,
    trainMin:Math.round(t.trainMin), workMin:Math.round(t.workMin)};
}
function startNewDay(){ S.today = freshToday(); }

/* ---------- eating, drinking, buying ---------- */
/* mult: how much of its goodness the food still has — the fridge it came out of keeps only so much (furniture.js:
   a beaten-up one half). It scales what it gives you, never what it costs you */
function consume(id, mult = 1){
  const it = FOOD[id]; if (!it) return {ok:false, why:"Nothing like that here."};
  if (!(S.inv[id] > 0)) return {ok:false, why:`You have no ${it.name.toLowerCase()} left.`};
  if (it.kind !== "recovery" && S.energy >= 98 && !(it.fatigue < 0)) return {ok:false, why:"You're full — save it for later."};
  S.inv[id]--;
  mult = clamp(num(mult, 1), .1, 2);
  let gain = it.energy*(typeof energyMult === "function" ? energyMult() : 1)*mult;
  if (it.kind === "energy"){
    // a can lifts you, and then it lets you down. The second one does less, the third less again.
    const n = S.today.drinks || 0; gain *= Math.pow(.6, n); S.today.drinks = n + 1;
    S.boost = {amt:(S.boost ? S.boost.amt : 0) + gain, at:absNow() + 180};
  }
  const e0 = S.energy;
  S.energy = clamp(S.energy + gain, 0, 100);
  const fat = (it.fatigue || 0) < 0 ? it.fatigue*mult : (it.fatigue || 0);
  S.fatigue = clamp(S.fatigue + fat, 0, 100);
  S.today.eaten++; S.today.food += S.energy - e0;
  if (typeof drinkTo === "function") drinkTo(it, mult);
  dailyPass(it.mins, "idle");
  if (typeof save === "function") save();
  return {ok:true, gain:Math.round(S.energy - e0), fat:Math.round(fat*10)/10, item:it, mult};
}
function spend(n){ n = Math.round(n); if (S.money < n) return false; S.money -= n; S.today.spent += n; return true; }
function earn(n){ n = Math.round(n); S.money += n; S.today.earned += n; }
function buyFood(id, qty){
  const it = FOOD[id]; qty = qty || 1; if (!it) return false;
  if (!spend(it.store*qty)) return false;
  S.inv[id] = (S.inv[id] || 0) + qty;
  if (typeof save === "function") save();
  return true;
}
function invCount(kind){ return Object.entries(FOOD).filter(([k, it]) => !kind || it.kind === kind).reduce((a, [k]) => a + (S.inv[k] || 0), 0); }
// Foodies: pay now, and some time later a courier leaves the bag at a delivery point: the table in your lobby, or the
// shelf by the gym door if you ordered from the training centre. It is yours to carry to a fridge (either one: they
// hold the same food)
function foodiesOrder(items){
  let total = FOODIES_FEE, n = 0;
  for (const [k, q] of Object.entries(items)) if (FOOD[k] && q > 0){ total += FOOD[k].foodies*q; n += q; }
  if (!n) return {ok:false, why:"Your basket is empty."};
  if (S.money < total) return {ok:false, why:"Not enough money."};
  spend(total);
  const where = lifeZone() === "ground" ? "ground" : "home";
  const eta = absNow() + ri(25, 75);
  const o = {id:Date.now().toString(36), items:Object.fromEntries(Object.entries(items).filter(([k, q]) => q > 0)), eta, where, total};
  S.orders.push(o);
  if (typeof save === "function") save();
  return {ok:true, order:o};
}
function nextOrder(){ return S.orders.slice().sort((a, b) => a.eta - b.eta)[0] || null; }

/* ---------- Team Chemistry, the manager, and who you are becoming ---------- */
function chemAdd(d){ S.chem = clamp(S.chem + d, 0, 100); return d; }
function trustAdd(d){ S.trust = clamp(S.trust + d, -30, 80); return d; }
// slow to move, slower still at the extremes: nobody's character changes in one afternoon
function trait(k, d){
  const v = num(S.traits[k], 50);
  const room = d > 0 ? (100 - v)/50 : v/50;
  S.traits[k] = clamp(v + d*clamp(room, .15, 1.2), 0, 100);
}
function chemLabel(c){ c = num(c, S.chem); return c >= 80 ? "Inseparable" : c >= 60 ? "Trusted by the group" : c >= 40 ? "Settling in" : c >= 20 ? "Finding your feet" : "New face"; }
function traitLabel(k, v){
  v = num(v, S.traits[k]);
  if (k === "team") return v >= 72 ? "Team-first" : v >= 58 ? "Unselfish" : v <= 18 ? "Egotistical" : v <= 32 ? "Selfish" : "Balanced";
  if (k === "conf") return v >= 70 ? "Confident" : v >= 58 ? "Self-assured" : v <= 30 ? "Hesitant" : v <= 42 ? "Unsure" : "Steady";
  if (k === "dec") return v >= 70 ? "Reads the game" : v >= 58 ? "Sensible" : v <= 30 ? "Rash" : v <= 42 ? "Erratic" : "Average";
  if (k === "risk") return v >= 70 ? "Risk-taker" : v >= 58 ? "Bold" : v <= 30 ? "Responsible" : v <= 42 ? "Careful" : "Measured";
  return "";
}
const TRAIT_NAME = {team:"Teamwork", conf:"Confidence", dec:"Decision making", risk:"Risk-taking"};
// what the manager is likely to do with you, in words
function roleOutlook(){
  const t = S.trust;
  return t >= 45 ? "Nailed-on starter" : t >= 25 ? "Likely to start" : t >= 8 ? "In and out of the side" : t >= -8 ? "Mostly on the bench" : "Out of the picture";
}

/* ---------- training: experience for a skill, scaled by how fit you are for it ---------- */
const COACH_FOR = {power:"shootCoach", aero:"shootCoach", curve:"shootCoach", accuracy:"shootCoach", passing:"passCoach", passacc:"passCoach",
  dribbling:"dribCoach", pace:"dribCoach", stamina:"fitCoach", jumping:"fitCoach", composure:"psych"};
function trainXP(k, amt, o){
  o = o || {};
  if (!(k in S.skills)) return 0;
  const coach = COACH_FOR[k] && S.staff && S.staff[COACH_FOR[k]] ? 1.5 : 1;
  const mult = (S.staff && S.staff.trainer ? 1.5 : 1)*coach*(o.raw ? 1 : trainEff());
  const x = Math.max(1, Math.round(amt*mult));
  const before = {v:S.skills[k], xp:S.skillXp[k] || 0, need:skillNeed(k)};
  skillXP(k, x);
  S.today.xp += x; S.today.xpBy[k] = (S.today.xpBy[k] || 0) + x;
  if (typeof FEED === "object" && !o.quiet) FEED.skill(k, x, before);
  addXP(x*.3);
  return x;
}

/* ---------- match day: who plays, and how much of the game comes your way ---------- */
// The manager picks the side. Trust matters most, but form, the dressing room, how fresh you look and
// plain chance all get a say — a trusted player can still be rested, a fringe one can still get a go.
function selectRole(f){
  if (f && f.kind === "N") return "rotation";
  const me = meP(), c = myClub();
  const line = c ? lineup(c.id).filter(p => !p.me && p.pos !== "GK") : [];
  const avg = line.length ? line.reduce((a, p) => a + p.ovr, 0)/line.length : me.ovr;
  let s = S.trust/80*.55 + (recentAvg() - 6.3)*.14 + S.chem/100*.12 + (me.ovr - avg)/22
    - (S.fatigue > 60 ? (S.fatigue - 60)/160 : 0) + gauss()*.16;
  if (S.contract && S.contract.role === "starter") s += .12;
  if (f && f.kind === "F") s += .1;                 // pre-season: everybody gets minutes
  return s > .42 ? "starter" : s > .2 ? "rotation" : s > -.08 ? "sub" : "cameo";
}
// how many times the ball finds you. Chemistry, the gap between the sides, the minutes you get and a
// good dose of luck — high chemistry means more of the game, never the ball every few seconds.
function involvement(role, ourR, oppR){
  const mins = {starter:1, rotation:.78, sub:.36, cameo:.12}[role] || .5;
  const chemF = .8 + S.chem/100*.38;
  const qual = 1 + clamp((ourR - oppR)/30, -.18, .18);
  const fit = S.fatigue > 70 ? .86 : 1;
  const luck = Math.exp(gauss()*.3);
  return clamp(Math.round(5.2*mins*chemF*qual*fit*luck), 1, 7);
}
// fatigue shows up on the pitch: legs go sooner and the touches get heavier
function fatigueDrain(){ return 1 + num(S.fatigue, 0)/160; }
function fatigueSkillHit(){ return Math.max(0, num(S.fatigue, 0) - 55)/300; }

/* ---------- the day job: a shift at the place you work ---------- */
function shiftOpen(m){ m = num(m, S.life.min); return m >= 7*60 && m < 23*60; }
// what a shift of this length will give you, worked out before you start so the card can count up to it
function shiftPlan(hours){
  const eff = clamp(.55 + trainEff()*.45, .55, 1);           // a tired worker still gets paid, but learns less
  const pay = Math.max(1, Math.round(jobPay()*hours/4));
  const xp = jobIsTop() ? 0 : Math.max(1, Math.round(JOB_XP_PER_SHIFT/4*hours*eff*rnd(.92, 1.08)));
  return {hours, pay, xp, eff, before:myJob()};
}
// part of the shift's experience, added as you work so the bar fills while you watch. Returns a promotion if one came.
function shiftXp(part){
  const js = jobState();
  if (jobIsTop() || !(part > 0)) return null;
  js.xp += part; S.today.jobXp += part;
  return js.xp >= jobNeed() ? jobMove(1) : null;
}
// clocking off: the pay, and what the shift took out of you
function shiftPay(plan){
  const js = jobState();
  exert(2.5*plan.hours, 1.5*plan.hours);
  earn(plan.pay); js.shifts = (js.shifts || 0) + 1;
  S.today.workMin += plan.hours*60;
  if (typeof save === "function") save();
}
