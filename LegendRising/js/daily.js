"use strict";
/* ============ DAILY LIFE ============
   A season week is seven days you live one at a time. Sleeping takes you to the next morning, never further, and the
   season's week turns over in the night from Sunday to Monday.

   Everything that belongs to a day lives here: the clock, the meters you manage (energy, which is food, and fatigue),
   the team's training session and whether you turned up to it, Team Chemistry, the manager's trust, your personality,
   and what you did today for the summary before bed. The first-person world calls in here; nothing in here draws
   anything.

   Owner: WP-G (Stage 1). Contracts: DESIGN 1.4.19 (daily.js), 1.7 (save data), 1.8 (text helpers), 3.8 (life fixes).
   The public API, exactly as the first-day runner (WP-H) and the rest of the game call it:
     foodEffect(id, src) -> {it, base:{energy, hyd, fatigue}, mods:[{k, label, f, energyOnly}], energy, fatigue, hyd,
                             store, gain, keep, full, why}
         src: {keep, powerCut} from a fridge | a number (the keep alone, as older callers pass it) | undefined (fresh).
         energy, fatigue and hyd are what eating it now changes the meters by (clamped at 0 and 100), so a tooltip
         built from it prints the numbers the chip prints after consume(); full: the "You're full" refusal applies.
     consume(id, src) -> {ok:false, why} | {ok:true, gain, fat, hyd, item, mult, fx}: eats it, through foodEffect.
     sleepPlan(kind 'night'|'nap'|'day', tier, m = S.life.min) -> {kind, mins, hours, q, wake, fatigue, energy, rest,
                             mods, crossesMidnight}: the deltas sleepNight, nap and sleepFullDay apply, before they do.
     busMins(from, to) -> minutes on Line 14 (road works add ROADWORKS_DELAY on the routes that touch home).
     sessionHours(), centreHours(), lateAfter(), earlyBy(): the hours as words, from SESSION, CENTRE and EARLY.
     ownsStyle(part, v), grantStyle(part, v), styleState(part, v) -> "wearing" | "purchased" | "available" | "locked"
                             (part: "hair" | "beard" | "hairColor"; the store is S.player.owned).
     onboarding() -> true while the first day's introduction is unfinished (training attendance is excused).
     attendLeave(): you are leaving the training centre; before SESSION.late it undoes the arrival.
     homeMonth(s), homeMigrate(h): the billing month; the 1.7 migration of S.home (light, lightBy, lightMin).
     constants: EARLY, POWER_CUT_KEEP, WAKE, NOISY_SLEEP, ROADWORKS_DELAY, ATTEND, MISS_MATCH, SHIFT, ACT (with run).
   Trust only ever changes through trustAdd (DESIGN 1.3). */

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// team training: ten till four, the squad going home after it; the training centre itself is open six till five
// (on a match day, until the night is over)
const SESSION = {start:10*60, end:16*60, late:10*60 + 15};
const CENTRE = {open:6*60, close:17*60};
// turning up early: present from this many minutes before the start, and the whole session after, is worth a little
// more trust (the bonus grows with the days running, and comes at most weekCap times in any seven days)
const EARLY = {by:30, bonus:[.3, .45, .6], weekCap:3};
// what the manager makes of a training day (trust), and of a match you were not at
const ATTEND = {good:1.2, left:-1, late:-3, lateStayed:.5, absent:-6, absentChem:-1.5, habit:-2, minGood:150, minLateStay:240};
const MISS_MATCH = -10, MISS_MATCH_CHEM = -3;
// when you wake from a night's sleep, and the hours a day job takes shifts
const WAKE = 7*60;
const SHIFT = {open:7*60, close:23*60};
// a fridge with the power off keeps this much of what it would (shown as "Power outage" and its percent)
const POWER_CUT_KEEP = .7;
// a party in the block: a night at home takes this much of the fatigue off it would have
const NOISY_SLEEP = .8;
// road works on your street: every bus to or from home takes this much longer
const ROADWORKS_DELAY = 20;
function centreOpen(m){
  m = m == null ? S.life.min : m; const d = ((m % 1440) + 1440) % 1440;
  // a match day keeps it open into the night, before the game and after it (you come back out of the tunnel after
  // dark and walk to the bus yourself: 3.4.3)
  if (typeof todaysFixture === "function" && todaysFixture(true) && m < 24*60) return d >= CENTRE.open;
  return d >= CENTRE.open && d < CENTRE.close;
}
// the hours as the game says them (DESIGN 1.8): nobody types a time into a sentence
function sessionHours(){ return fmtRange(SESSION.start, SESSION.end); }
function centreHours(){ return fmtRange(CENTRE.open, CENTRE.close); }
function lateAfter(){ return fmtTime(SESSION.late); }
function earlyBy(){ return fmtTime(SESSION.start - EARLY.by); }
// when each kind of game is played inside its week: [weekday, kick-off minute]
const KICKOFF = {F:[5, 17*60], L:[5, 19*60], C:[2, 19*60], E:[1, 20*60], N:[4, 19*60 + 45], D:[5, 19*60]};
const TUNNEL_OPEN = 90;            // minutes before kick-off you can walk out
const MATCH_LEN = 115;             // kick-off to walking back out of the tunnel
// meters per game minute for each kind of time. e: energy burnt, f: fatigue gained (negative recovers),
// o: odour built up (sweat; a shower takes it all away), h: hydration lost (drinks put it back).
// run: jogging and sprinting about in the world (the clock passes it while you run)
const ACT = {idle:{e:.035, f:.012, o:.006, h:.024}, walk:{e:.04, f:.014, o:.012, h:.032}, run:{e:.05, f:.02, o:.02, h:.04}, bus:{e:.03, f:0, o:.008, h:.022},
  rest:{e:.03, f:-.06, o:.004, h:.02}, sleep:{e:0, f:0, o:.008, h:.014}, work:{e:.05, f:.03, o:.035, h:.04}, train:{e:.04, f:.02, o:.06, h:.07},
  match:{e:0, f:0, o:.12, h:.14}, shop:{e:.03, f:0, o:.008, h:.026}};
// Line 14: minutes from one stop to another (game.js BUS_ROUTES), and the road works on your street on top
function busMins(from, to){
  if (!from || !to || from === to) return 0;
  const base = num((BUS_ROUTES[from] || {})[to], BUS_ROUTES.home.ground);
  const works = (from === "home" || to === "home") && typeof lifeEventOn === "function" && lifeEventOn("roadworks");
  return base + (works ? ROADWORKS_DELAY : 0);
}

const pad2 = n => String(n).padStart(2, "0");
// the football world, for the first-person modules (which have a W of their own for the scene)
function gameWorld(){ return W; }
const num = (v, d) => (typeof v === "number" && isFinite(v)) ? v : d;
function lifeMode(){ return typeof document !== "undefined" && document.body.classList.contains("life"); }
function lifeZone(){ return (window.LIFE && window.LIFE.zone) || "home"; }
function absNow(){ return S.life.day*1440 + S.life.min; }
// 7:05 PM: the game speaks twelve-hour time everywhere
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
  // face shape: [key, label, min, max]; the character system works in steps of .06 either side of 1
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
/* every field present and in range; whatever is missing or broken comes from the seeded default. owned (the career's
   S.player.owned): a cut, a beard or a colour the career does not own falls back to the first one it does, so a
   look can never wear something that was not bought */
function lookSane(L, seed, owned){
  const d = lookDefault(seed == null ? "player" : seed), O = LOOK_OPT, o = L && typeof L === "object" ? L : {};
  const one = (v, list, dv) => list.some(e => e[0] === v) ? v : dv;
  const F = o.face && typeof o.face === "object" ? o.face : {};
  const out = {v:1, skin:lookCol(o.skin, d.skin), height:+clamp(num(o.height, d.height), O.height[0], O.height[1]).toFixed(3),
    build:one(o.build, O.build, d.build), hair:one(o.hair, O.hair.concat(LOOK_BARBER.hair), d.hair), hairColor:lookCol(o.hairColor, d.hairColor),
    beard:one(o.beard, O.beard.concat(LOOK_BARBER.beard), d.beard), eyes:lookCol(o.eyes, d.eyes),
    face:Object.fromEntries(O.face.map(([k, , a, b]) => [k, lookFaceStep(num(F[k], d.face[k]), a, b)])),
    top:one(o.top, O.top, d.top), topCol:lookCol(o.topCol, d.topCol), legs:one(o.legs, O.legs, d.legs), legCol:lookCol(o.legCol, d.legCol),
    shoeCol:lookCol(o.shoeCol, d.shoeCol)};
  if (owned && typeof owned === "object") for (const part of STYLE_PARTS){
    const list = Array.isArray(owned[part]) ? owned[part] : [];
    if (list.length && !list.some(v => styleEq(part, v, out[part]))) out[part] = part === "hairColor" ? lookCol(list[0], out[part]) : list[0];
  }
  return out;
}
function lookSeedOf(s){ return (s && (s.cid || (s.player && s.player.name))) || "player"; }

/* ---------- the cuts, beards and colours you own (DESIGN 3.7.3) ----------
   S.player.owned = {hair:[...], beard:[...], hairColor:[...]}. Creation gives you the cut and the colour you picked
   (and a clean shave, stubble and the beard you picked); the barber sells the rest. What you own you can put on at
   the mirror for nothing; what you do not, you cannot wear. */
const STYLE_PARTS = ["hair", "beard", "hairColor"];
const STYLE_FREE_BEARDS = ["", "stubble"];
const styleEq = (part, a, b) => part === "hairColor" ? lookCol(a, -1) === lookCol(b, -2) : a === b;
const styleUniq = list => list.filter((v, i) => list.indexOf(v) === i);
function styleOwned(){
  if (!S || !S.player) return null;
  const L = S.player.look || {}, o = S.player.owned;
  if (!o || typeof o !== "object"){
    // a career from before ownership: it owns exactly what it is wearing (DESIGN 1.7)
    S.player.owned = {hair:[L.hair].filter(v => v != null), beard:styleUniq([L.beard == null ? "" : L.beard].concat(STYLE_FREE_BEARDS)), hairColor:[L.hairColor].filter(v => v != null)};
    return S.player.owned;
  }
  for (const part of STYLE_PARTS) if (!Array.isArray(o[part])) o[part] = [];
  o.beard = styleUniq(o.beard.concat(STYLE_FREE_BEARDS));
  // never nothing: an empty list holds what you are wearing
  for (const part of ["hair", "hairColor"]) if (!o[part].length && L[part] != null) o[part].push(L[part]);
  return o;
}
function ownsStyle(part, v){
  if (part === "beard" && STYLE_FREE_BEARDS.includes(v)) return true;
  const o = styleOwned(); return !!o && Array.isArray(o[part]) && o[part].some(x => styleEq(part, x, v));
}
function grantStyle(part, v){
  const o = styleOwned(); if (!o || !STYLE_PARTS.includes(part) || v == null) return false;
  if (!ownsStyle(part, v)) o[part].push(part === "hairColor" ? lookCol(v, 0) : v);
  return true;
}
// what the barber says about a style: on your head now, yours already, for sale, or not for you yet (reputation)
function styleState(part, v){
  const L = (S && S.player && S.player.look) || {};
  if (styleEq(part, L[part], v)) return "wearing";
  if (ownsStyle(part, v)) return "purchased";
  const offer = typeof barberMenu === "function" ? barberMenu(part === "hairColor" ? "color" : part).find(o => styleEq(part, o.v, v)) : null;
  const rep = typeof barberRep === "function" ? barberRep() : 0;
  return offer && offer.rep > rep ? "locked" : "available";
}

/* ---------- making sure a save has everything, and nothing that reads "undefined" ---------- */
const TRAIT_KEYS = ["team", "conf", "dec", "risk"];
/* a training day's attendance: when you arrived, the session minutes you were there (min) and the minutes in the half
   hour before it (pre), whether you were there when it started, whether you have gone, the team session (sess, once
   a day), and whether the day is excused (the first day's introduction) */
function freshSess(){ return {blocks:0, mins:0, done:false, score:0}; }
function freshAtt(){ return {arrived:null, min:0, pre:0, atStart:false, gone:false, status:"", settled:false, chem:0, told:false, excused:onboarding(), sess:freshSess()}; }
// the first day's introduction is still running (DESIGN 3.7.4: attendance excused, no trust either way)
function onboarding(){
  if (typeof S === "undefined" || !S) return false;
  const o = S.onb, f = S.flags;
  // (a career whose training-centre chapters were added after its first day, S.onb.centre: those chapters run on the
  // day you next arrive there, and only that day counts as the first day's; firstday.js wakes them on arrival)
  if (o && typeof o === "object" && o.v === 2) return o.step !== "done" && !(o.centre && o.centreDay !== (S.life && S.life.day));
  if (!f || typeof f !== "object") return false;
  return f.CharacterCreated === false || !f.TrainingCenterTutorialCompleted;
}
function freshToday(){
  return {xp:0, xpBy:{}, jobXp:0, earned:0, spent:0, eaten:0, food:0, drinks:0, chem0:num(S.chem, 0), trust0:num(S.trust, 0),
    trainMin:0, workMin:0, sessions:0, media:0, start:S.life ? absNow() : 0};
}
// new skills arrive in older careers as something close to what the player already is, so the overall barely moves
const SKILL_SEED = {
  passacc: s => s.passing*.85 + s.accuracy*.15,
  interception: s => s.tackling*.8 + s.composure*.2,
  jumping: s => ((s.sprintSpeed != null ? s.sprintSpeed : s.pace) + s.stamina)/2,
  acceleration: s => s.pace,
  sprintSpeed: s => s.pace,
  heading: s => (s.power + s.tackling)/2
};
function dailyEnsure(){
  if (!S) return;
  const firstDay = !S.life;                         // a career from before days were lived one at a time
  S.skills = S.skills || {};
  for (const [k] of SKILLS){
    if (!(typeof S.skills[k] === "number" && isFinite(S.skills[k]))){
      const seed = SKILL_SEED[k];
      const base = {power:30, aero:30, curve:30, accuracy:30, passing:30, pace:30, acceleration:30, sprintSpeed:30, dribbling:30, stamina:30, composure:28, tackling:24};
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
  if (!S.life.att || typeof S.life.att !== "object") S.life.att = freshAtt();
  else {
    // a day from before early arrivals and the once-a-day session: the fields it lacks, as a fresh day has them
    const a = S.life.att, fa = freshAtt();
    for (const k of Object.keys(fa)) if (a[k] == null) a[k] = fa[k];
    if (!a.sess || typeof a.sess !== "object") a.sess = freshSess();
    for (const k of ["blocks", "mins", "score"]) a.sess[k] = num(a.sess[k], 0);
    a.sess.done = !!a.sess.done; a.pre = num(a.pre, 0); a.min = num(a.min, 0);
  }
  if (!Array.isArray(S.life.miss)) S.life.miss = [];
  S.life.view = S.life.view === "tp" ? "tp" : "fp";            // first or third person, as you last left it
  if (S.player){
    // (a career that has been created owns what it wears from the day ownership began, and wears only what it owns)
    const seed = lookSeedOf(S), made = !(S.flags && S.flags.CharacterCreated === false);
    if (made && !S.player.owned) S.player.look = lookSane(S.player.look, seed);
    S.player.look = lookSane(S.player.look, seed, made ? styleOwned() : null);
  }
  if (S.home) homeMigrate(S.home);
  S.energy = clamp(num(S.energy, 80), 0, 100);
  S.fatigue = clamp(num(S.fatigue, 12), 0, 100);
  S.odor = clamp(num(S.odor, 12), 0, 100);              // 0 fresh out of the shower, 100 nobody will stand next to you
  S.hyd = clamp(num(S.hyd, 82), 0, 100);                // 100 well watered, 0 parched
  S.chem = clamp(num(S.chem, 20), 0, 100);
  trustAdd(0);                                          // a stored trust that is not a number, or out of range, put right
  S.money = Math.round(num(S.money, 0));
  S.traits = Object.assign({team:50, conf:50, dec:50, risk:50}, S.traits || {});
  for (const k of TRAIT_KEYS) S.traits[k] = clamp(num(S.traits[k], 50), 0, 100);
  // the moves only some players have in them (addendum A1.5): the scissor and overhead kick, and the rabona
  if (typeof S.traits.acrobatic !== "boolean") S.traits.acrobatic = false;
  if (typeof S.traits.flair !== "boolean") S.traits.flair = false;
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
// the gym fridge keeps what the club's tier keeps (a power cut is your block's, never the club's)
function clubFridgeMult(){ return FRIDGE_KEEP[clubFacTier() - 1]; }

/* ---------- your flat's electricity (DESIGN 3.8.4) ----------
   A month is four of the season's weeks. The light is metered by the minute while it is on, a bulb is in it and the
   block has power, wherever you are (S.home.lightBy: minutes per month); each month's bill charges the month before,
   and nothing for the months your uncle paid. */
function homeMonth(s){ s = s || S; return num(s && s.year, 2026)*10 + Math.floor(num(s && s.week, 0)/4); }
function utilTick(step){
  const h = S.home; if (!h || !h.light || !h.fx || !h.fx.bulb) return;
  if (typeof lifeEventOn === "function" && lifeEventOn("power")) return;
  const by = h.lightBy || (h.lightBy = {}), m = homeMonth();
  by[m] = num(by[m], 0) + step;
}
// a flat from before: no light without a bulb, and the old meter (minutes since the last bill) put on the month the
// next bill charges, if that month is one you pay for (DESIGN 1.7)
function homeMigrate(h){
  if (!h || typeof h !== "object") return h;
  if (!h.lightBy || typeof h.lightBy !== "object") h.lightBy = {};
  if (h.fx && !h.fx.bulb) h.light = false;
  if (h.lightMin != null){
    const m = Math.round(num(h.billed, homeMonth())), mins = num(h.lightMin, 0);
    if (mins > 0 && m >= num(h.freeUntil, 0)) h.lightBy[m] = num(h.lightBy[m], 0) + mins;
    delete h.lightMin;
  }
  return h;
}
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
  if (trainingDay()) return `Training ${sessionHours()}`;
  return S.life.wd >= 5 ? "Rest day" : "No training today";
}

/* ---------- the two meters ---------- */
function needsTick(mins, act){
  const r = ACT[act] || ACT.idle;
  S.energy = clamp(S.energy - r.e*mins, 0, 100);
  S.odor = clamp(num(S.odor, 12) + (r.o || 0)*mins, 0, 100);
  S.hyd = clamp(num(S.hyd, 82) - (r.h || 0)*mins*(S.fatigue > 70 ? 1.15 : 1), 0, 100);
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
  // thirsty legs train badly too
  const h = num(S.hyd, 82), he = h >= 35 ? 1 : clamp(.7 + .3*h/35, .7, 1);
  return fe*ee*he;
}
function effLabel(){ const e = trainEff(); return e >= .95 ? "Fresh" : e >= .75 ? "Good" : e >= .5 ? "Tired" : "Exhausted"; }
// the cost of doing something hard. Pushing on when you are already spent costs half as much again.
function exert(fat, en){
  const heavy = S.fatigue > 70 ? 1.5 : 1;
  S.odor = clamp(num(S.odor, 12) + fat*.55, 0, 100);                // hard work is sweaty work
  S.hyd = clamp(num(S.hyd, 82) - fat*.45, 0, 100);
  S.fatigue = clamp(S.fatigue + fat*heavy*(S.staff && S.staff.fitCoach ? .85 : 1), 0, 100);
  S.energy = clamp(S.energy - en*(carTier() >= 2 ? .85 : 1)*(S.staff && S.staff.nutri ? .9 : 1), 0, 100);
}
function fatigueLabel(f){ f = num(f, S.fatigue); return f < 20 ? "Fresh" : f < 45 ? "A little tired" : f < 70 ? "Tired" : f < 85 ? "Exhausted" : "Running on empty"; }
function energyLabel(e){ e = num(e, S.energy); return e >= 75 ? "Well fed" : e >= 45 ? "Fine" : e >= 25 ? "Hungry" : "Starving"; }
function odorLabel(o){ o = num(o, S.odor); return o < 20 ? "Fresh" : o < 45 ? "Fine" : o < 60 ? "Sweaty" : o < 75 ? "Smelly" : "Stinking"; }
function hydLabel(h){ h = num(h, S.hyd); return h >= 70 ? "Hydrated" : h >= 45 ? "Fine" : h >= 25 ? "Thirsty" : "Parched"; }
// how much you smell decides who will deal with you: shops and the barber turn you away from SMELLY
const ODOR_SMELLY = 75, ODOR_SWEATY = 60;
// a wash: a shower takes the smell away, a bath the smell and some of the ache
function wash(kind){ S.odor = 0; if (kind === "bath") S.fatigue = clamp(S.fatigue - 10, 0, 100); }

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
    utilTick(step);
    attendTick(step);
    if (L.min >= 1440 - 1e-6){ L.min = 0; dayRollover(); }
    timeChecks();
  }
  L.min = clamp(L.min, 0, 1439.99);
}
function timeChecks(){
  const now = absNow();
  // Foodies orders arriving: a bag left at the delivery point it was sent to (the table in your lobby, or the one at
  // the training centre), waiting for you to carry it to a fridge
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

/* ---------- training attendance (DESIGN 3.8.8) ----------
   From the moment the centre opens, being there is noticed. Each step of the clock counts the minutes it overlaps:
   with the session (min) and with the half hour before it (pre); being there when it starts is atStart. Going home
   before SESSION.late undoes the arrival (attendLeave). At four, or in the night if you never came, the day settles:
   on time and there for most of it is good, and turning up early as well (pre >= EARLY.by) is worth a bonus that
   grows with the days running, at most EARLY.weekCap times in any seven days. Late, absent and leaving early cost
   what they always cost, and end a run of early days. The first day's introduction is excused: no trust either way. */
function attendTick(step){
  const a = S.life.att; if (!a || a.settled || !trainingDay()) return;
  const b = S.life.min, t0 = b - step;            // the stretch this step covered (a step never crosses midnight)
  if (lifeZone() === "ground" && !a.gone && b > CENTRE.open && t0 < SESSION.end){
    if (a.arrived == null) arriveForTraining();
    if (a.arrived != null){
      const over = (x0, x1) => Math.max(0, Math.min(b, x1) - Math.max(t0, x0));
      const ses = over(SESSION.start, SESSION.end);
      a.pre += over(SESSION.start - EARLY.by, SESSION.start);
      a.min += ses;
      if (t0 <= SESSION.start && b > SESSION.start) a.atStart = true;
      // being around the group all day is how a dressing room gets to know you
      if (ses > 0){
        const g = .9/60*(1 - S.chem/120)*(.8 + S.traits.team/250)*ses;
        S.chem = clamp(S.chem + g, 0, 100); a.chem += g;
      }
    }
  }
  if (b >= SESSION.end) settleAttendance();
}
// at the training centre (stepping off the bus, waking up there, walking back in): the arrival, if it is the first
function arriveForTraining(){
  const a = S.life.att; if (!a) return;
  a.gone = false;
  if (a.arrived != null || a.settled || !trainingDay()) return;
  const m = S.life.min; if (m >= SESSION.end || m < CENTRE.open) return;
  a.arrived = m;
  if (m <= SESSION.late){ a.status = "ontime"; return; }
  a.status = "late";
  if (a.excused) return;                          // (the first day: nobody minds)
  const d = trustAdd(ATTEND.late);
  S.life.miss.push({day:S.life.day, k:"late"});
  dailyEmit("late", {d, min:m});
}
// leaving the training centre: nothing more is counted until you are back, and before SESSION.late you were never here
function attendLeave(){
  const a = S.life.att; if (!a || a.settled) return;
  a.gone = true;
  if (a.arrived != null && S.life.min < SESSION.late){ a.arrived = null; a.status = ""; a.pre = 0; a.min = 0; a.atStart = false; }
}
// a run of early days (S.life.early: {streak, log:[days a bonus was paid]}), made the first time it is needed
function earlyState(){
  const L = S.life;
  if (!L.early || typeof L.early !== "object") L.early = {streak:0, log:[]};
  if (!Array.isArray(L.early.log)) L.early.log = [];
  L.early.streak = Math.max(0, Math.round(num(L.early.streak, 0)));
  return L.early;
}
// at four o'clock, or in the night if you never came: how did the day go in the manager's eyes. Emits "settled" with
// {d: the trust it moved, k: "good" | "goodEarly" | "early" (left early) | "late" | "lateStayed" | "absent" | "excused" (+ "+habit"),
//  bonus, streak, capped, chem}
function settleAttendance(){
  const a = S.life.att; if (!a || a.settled) return;
  a.settled = true;
  if (!trainingDay()) return;
  const day = S.life.day, E = earlyState();
  let d = 0, k = "", bonus = 0, capped = false, early = false;
  if (a.excused) k = "excused";
  else if (!a.status){ d = ATTEND.absent; k = "absent"; chemAdd(ATTEND.absentChem); S.life.miss.push({day, k:"absent"}); }
  else if (a.status === "ontime"){
    if (a.min >= ATTEND.minGood){
      d = ATTEND.good; k = "good";
      if (a.pre >= EARLY.by && a.atStart){
        early = true;
        E.log = E.log.filter(x => x > day - 7);
        if (E.log.length < EARLY.weekCap){ bonus = EARLY.bonus[Math.min(E.streak, EARLY.bonus.length - 1)]; d += bonus; E.log.push(day); k = "goodEarly"; }
        else capped = true;
      }
    } else { d = ATTEND.left; k = "early"; }
  }
  else if (a.status === "late"){ if (a.min >= ATTEND.minLateStay){ d = ATTEND.lateStayed; k = "lateStayed"; } else k = "late"; }
  // the same thing three times in a week stops being bad luck
  S.life.miss = S.life.miss.filter(x => x.day > day - 7);
  if (!a.excused && (k === "absent" || a.status === "late") && S.life.miss.length >= 3){ d += ATTEND.habit; k += "+habit"; }
  // a run of early days: on to the next, or over (anything but an early, full day ends it; the first day leaves it be)
  if (!a.excused) E.streak = early ? E.streak + 1 : 0;
  if (d) trustAdd(d);
  dailyEmit("settled", {d, k, bonus, streak:E.streak, capped, chem:a.chem});
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
    try { sum = seasonEnd(); } catch(e){ console.error("seasonEnd failed", e); sum = {pos:0, lg:EMPTY_CELL, report:[]}; }
    DAILY.seasonPending = sum;
    dailyEmit("season", sum);
  }
}
// a game that came and went without you
function missedMatches(dayEnded){
  if (typeof MT !== "undefined" && MT) return;
  // a match you were playing when the game was closed is not missed: it is played out when you come back (3.4.4)
  const live = S.life && S.life.inMatch && S.life.inMatch.fkey;
  for (const f of weekFixtures()){
    if (f.done || W.done[f.key] || (live && f.key === live)) continue;
    const s = fixtureSlot(f);
    if (s.wd !== S.life.wd) continue;
    if (!dayEnded && S.life.min < s.min + MATCH_LEN) continue;
    const me = meP(), excused = me.inj > 0 || (S.ban || 0) > 0;
    try { simFixture(f); } catch(e){ console.error(e); }
    if (!excused){
      trustAdd(MISS_MATCH); chemAdd(MISS_MATCH_CHEM);
      addNews("you", `${S.player.name} misses the match`, `${sideName(f, "h")} v ${sideName(f, "a")} went ahead without him. The manager wants an explanation.`, "me");
    }
    dailyEmit("missed", {f, excused});
  }
}

/* ---------- sleep (DESIGN 3.8.3) ----------
   One plan for each kind of sleep, worked out before you lie down: the bed's text reads it and the sleep applies it,
   so what the bed says is what happens. A night runs to WAKE; its quality is the hours over 7.5 (a short night counts
   for less); a tier's bed takes BED_REST off fatigue and gives BED_FED energy for a full night. A nap is two hours. A
   day is exactly twenty-four hours, to this time tomorrow: slept out, but a day without food leaves you hungry. Asleep,
   the meters do not move by the minute (ACT.sleep), and an energy drink wears off without the crash. */
function isNight(m){ m = num(m, S.life.min); return m >= 19*60 || m < 5*60; }
const NAP_MINS = 120;
function sleepPlan(kind, tier, m){
  m = num(m, S.life.min);
  const d = ((m % 1440) + 1440) % 1440, bt = clamp(Math.round(num(tier, 2)), 1, 6) - 1;
  const home = 1 + ((typeof energyMult === "function" ? energyMult() : 1) - 1)*.5;
  const mods = [];
  let mins, q = 1, rest, fed;
  if (kind === "night"){
    mins = d >= WAKE ? 1440 - d + WAKE : WAKE - d;
    q = clamp(mins/60/7.5, .35, 1.1);
    rest = BED_REST[bt]*q*home; fed = BED_FED[bt]*q;
  } else if (kind === "nap"){
    mins = NAP_MINS; rest = 6 + (bt + 1)*2; fed = -2;
  } else {
    kind = "day"; mins = 1440;
    rest = (BED_REST[bt] + 18)*home; fed = BED_FED[bt]*.6;
  }
  if (home > 1 && kind !== "nap") mods.push({k:"home", label:"Home comforts", f:home});
  // a party upstairs: a night at home does you less good
  const t0 = S.life.day*1440 + d;
  if (lifeZone() === "home" && typeof noisyDuring === "function" && noisyDuring(t0, t0 + mins)){ rest *= NOISY_SLEEP; mods.push({k:"noisy", label:"Noisy neighbours", f:NOISY_SLEEP}); }
  const f0 = num(S.fatigue, 0), e0 = num(S.energy, 0);
  return {kind, mins, hours:mins/60, q, wake:(d + mins) % 1440, rest, fed, mods, crossesMidnight:d + mins >= 1440,
    fatigue:clamp(f0 - rest, 0, 100) - f0, energy:clamp(e0 + fed, 0, 100) - e0};
}
// sleep by a plan: the clock through it, then what it said
function sleepBy(plan){
  S.boost = null;
  dailyPass(plan.mins, "sleep");
  S.fatigue = clamp(S.fatigue + plan.fatigue, 0, 100);
  S.energy = clamp(S.energy + plan.energy, 0, 100);
  return {mins:plan.mins, hours:plan.hours, fatigue:Math.round(plan.fatigue), energy:Math.round(plan.energy), plan};
}
// sleep until WAKE tomorrow (or this morning, if it is already past midnight). Returns what it did.
function sleepNight(tier){ return sleepBy(sleepPlan("night", tier)); }
// hold E on the bed: asleep for exactly one day
function sleepFullDay(tier){ return sleepBy(sleepPlan("day", tier)); }
function nap(tier){ return sleepBy(sleepPlan("nap", tier)); }
/* what a sleep of twenty-four hours from minute m would make you miss: training (if it is a training day you have
   not turned up to yet, or tomorrow's) and a match (kick-off inside it). For the bed's warning. */
function sleepMisses(m){
  m = num(m, S.life.min);
  const out = {training:false, match:null}, a = S.life.att, end = m + 1440;
  if (onboarding()) return out;
  // today: you have not turned up and the session is not over; tomorrow: you would wake too late to get there
  if (trainingDay() && a && !a.status && !a.settled && m < SESSION.end) out.training = true;
  if (!out.training && m + busMins("home", "ground") >= SESSION.end && trainingDay((S.life.wd + 1) % 7)) out.training = true;
  // a match whose tunnel closes (kick-off + 25) while you sleep
  for (const f of weekFixtures()){
    if (f.done) continue;
    const s = fixtureSlot(f), at = s.wd === S.life.wd ? s.min : s.wd === S.life.wd + 1 ? 1440 + s.min : null;
    if (at != null && at + 25 > m && at + 25 < end){ out.match = f; break; }
  }
  return out;
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

/* ---------- eating, drinking, buying (DESIGN 3.8.2) ----------
   One function says what a thing will do for you, and eating does exactly that: foodEffect. The fridge it comes out
   of keeps only so much of what food is worth (FRIDGE_KEEP: a beaten-up one half), a power cut takes that down again
   (POWER_CUT_KEEP), the old "Home" upgrades still add to the energy, and each energy drink today does less than the
   one before. Every modifier is a line of its own, so the tooltip shows the sum, not just the answer. */
const FULL_LINE = "You're full. Save it for later.";
function foodSrc(src){
  if (typeof src === "number") return {keep:src, powerCut:false};
  if (src && typeof src === "object") return {keep:num(src.keep, 1), powerCut:!!src.powerCut};
  return {keep:1, powerCut:false};
}
function foodEffect(id, src){
  const it = FOOD[id]; if (!it) return null;
  const {keep, powerCut} = foodSrc(src);
  const mods = [];
  if (Math.abs(keep - 1) > 1e-9) mods.push({k:"keep", label:"Fridge quality", f:clamp(keep, .1, 2)});
  if (powerCut) mods.push({k:"power", label:"Power outage", f:POWER_CUT_KEEP});
  const homeF = typeof energyMult === "function" ? energyMult() : 1;
  if (homeF > 1) mods.push({k:"home", label:"Home comforts", f:homeF, energyOnly:true});
  // a can lifts you, and then it lets you down: the second does less, the third less again
  const drinks = (S.today && S.today.drinks) || 0;
  if (it.kind === "energy" && drinks) mods.push({k:"drinks", label:`Energy drinks today (${drinks})`, f:Math.pow(.6, drinks), energyOnly:true});
  let fAll = 1, fEn = 1;
  for (const m of mods){ fEn *= m.f; if (!m.energyOnly) fAll *= m.f; }
  const base = {energy:it.energy || 0, hyd:it.hyd || 0, fatigue:it.fatigue || 0};
  const gain = base.energy*fEn;
  const fat = base.fatigue < 0 ? base.fatigue*fAll : base.fatigue;          // food never tires you less than it does
  const wet = base.hyd*clamp(fAll, .3, 1.2);
  const e0 = num(S.energy, 0), f0 = num(S.fatigue, 0), h0 = num(S.hyd, 82);
  const full = it.kind !== "recovery" && e0 >= 98 && !(base.fatigue < 0) && !(base.hyd > 0 && h0 < 95);
  return {it, base, mods, keep:fAll, gain, store:it.store, full, why:full ? FULL_LINE : "",
    energy:clamp(e0 + gain, 0, 100) - e0, fatigue:clamp(f0 + fat, 0, 100) - f0, hyd:clamp(h0 + wet, 0, 100) - h0};
}
// a modifier as the game shows it: "+10%", "−50%" (a real minus sign)
const modPct = f => fmtSigned(Math.round((f - 1)*100)) + "%";
// an amount as the chips and the tooltips both print it: whole numbers whole, anything else to one decimal
const fxAmt = v => { const r = Math.round(v*10)/10; return fmtSigned(r, Number.isInteger(r) ? 0 : 1); };
/* the tooltip for something in a fridge, from foodEffect: the name and how many, what it gives, one line per
   modifier, and what you get (DESIGN 3.8.2) */
function foodLines(id, n, src){
  const fx = foodEffect(id, src); if (!fx) return [];
  const out = [`${fx.it.name}${n > 1 ? ` ×${n}` : ""}`];
  if (fx.base.energy) out.push(`Energy ${fxAmt(fx.base.energy)}`);
  if (fx.base.hyd) out.push(`Hydration ${fxAmt(fx.base.hyd)}`);
  if (fx.base.fatigue) out.push(`Fatigue ${fxAmt(fx.base.fatigue)}`);
  for (const m of fx.mods) out.push(`${m.label}${m.k === "home" ? " (energy)" : ""} ${modPct(m.f)}`);
  if (fx.full){ out.push(FULL_LINE); return out; }
  const got = [];
  if (fx.base.energy) got.push(`Energy ${fxAmt(Math.round(fx.energy))}`);
  if (fx.base.hyd) got.push(`Hydration ${fxAmt(Math.round(fx.hyd))}`);
  if (fx.base.fatigue) got.push(`Fatigue ${fxAmt(fx.fatigue)}`);
  out.push(`You get: ${got.join(" · ")}`);
  if (fx.gain > fx.energy + .5) out.push(`Energy is at ${Math.round(S.energy)}, so you only gain ${fxAmt(Math.round(fx.energy))}`);
  return out;
}
// eat or drink one: what foodEffect says, nothing else. Returns it for the chip
function consume(id, src){
  const it = FOOD[id]; if (!it) return {ok:false, why:"Nothing like that here."};
  if (!(S.inv[id] > 0)) return {ok:false, why:`You have no ${it.name.toLowerCase()} left.`};
  const fx = foodEffect(id, src);
  if (fx.full) return {ok:false, why:fx.why, full:true, fx};
  S.inv[id]--;
  if (it.kind === "energy"){
    S.today.drinks = (S.today.drinks || 0) + 1;
    S.boost = {amt:(S.boost ? S.boost.amt : 0) + fx.gain, at:absNow() + 180};
  }
  S.energy = clamp(S.energy + fx.energy, 0, 100);
  S.fatigue = clamp(S.fatigue + fx.fatigue, 0, 100);
  S.hyd = clamp(num(S.hyd, 82) + fx.hyd, 0, 100);
  S.today.eaten++; S.today.food += fx.energy;
  dailyPass(it.mins, "idle");
  if (typeof save === "function") save();
  return {ok:true, gain:Math.round(fx.energy), fat:Math.round(fx.fatigue*10)/10, hyd:Math.round(fx.hyd), item:it, mult:fx.keep, fx};
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
/* Foodies: pay now, and some time later a courier leaves the bag at the delivery point you chose (where: "home", the
   table in your lobby, or "ground", the training centre; by default the one where you are). It is yours to carry to a
   fridge (either one: they hold the same food). With couriers running late in the area (the notice-board event
   "delivery"), every order takes FOODIES_LATE minutes longer on top. */
const FOODIES_ETA = [25, 75], FOODIES_LATE = [25, 60];
function foodiesLate(){ return typeof lifeEventOn === "function" && lifeEventOn("delivery"); }
function foodiesOrder(items, where){
  let total = FOODIES_FEE, n = 0;
  for (const [k, q] of Object.entries(items || {})) if (FOOD[k] && q > 0){ total += FOOD[k].foodies*q; n += q; }
  if (!n) return {ok:false, why:"Your basket is empty."};
  if (S.money < total) return {ok:false, why:"Not enough money."};
  spend(total);
  where = where === "ground" || where === "home" ? where : lifeZone() === "ground" ? "ground" : "home";
  const late = foodiesLate() ? ri(FOODIES_LATE[0], FOODIES_LATE[1]) : 0;
  const eta = absNow() + ri(FOODIES_ETA[0], FOODIES_ETA[1]) + late;
  const o = {id:Date.now().toString(36), items:Object.fromEntries(Object.entries(items).filter(([k, q]) => q > 0)), eta, where, total, late};
  S.orders.push(o);
  if (typeof save === "function") save();
  if (typeof window !== "undefined" && typeof window.lifeOnb === "function") window.lifeOnb("foodiesOrder", {ok:true, order:o});
  return {ok:true, order:o};
}
function nextOrder(){ return S.orders.slice().sort((a, b) => a.eta - b.eta)[0] || null; }

/* ---------- Team Chemistry, the manager, and who you are becoming ---------- */
function chemAdd(d){ S.chem = clamp(S.chem + d, 0, 100); return d; }
// the one way trust changes (and a stored value is sanitised: trustAdd(0)); never anything but a number in -30..80
function trustAdd(d){ S.trust = clamp(num(S.trust, 0) + num(d, 0), -30, 80); return d; }
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
  dribbling:"dribCoach", acceleration:"dribCoach", sprintSpeed:"fitCoach", stamina:"fitCoach", jumping:"fitCoach", composure:"psych"};
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
// plain chance all get a say: a trusted player can still be rested, a fringe one can still get a go.
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
// good dose of luck. High chemistry means more of the game, never the ball every few seconds.
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
function shiftOpen(m){ m = num(m, S.life.min); return m >= SHIFT.open && m < SHIFT.close; }
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
