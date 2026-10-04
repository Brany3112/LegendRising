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
  S.energy = clamp(num(S.energy, 80), 0, 100);
  S.fatigue = clamp(num(S.fatigue, 12), 0, 100);
  S.chem = clamp(num(S.chem, 20), 0, 100);
  S.trust = clamp(num(S.trust, 0), -30, 80);
  S.money = Math.round(num(S.money, 0));
  S.traits = Object.assign({team:50, conf:50, dec:50, risk:50}, S.traits || {});
  for (const k of TRAIT_KEYS) S.traits[k] = clamp(num(S.traits[k], 50), 0, 100);
  S.inv = S.inv || {};
  for (const k of Object.keys(FOOD)) S.inv[k] = Math.max(0, Math.round(num(S.inv[k], 0)));
  if (!Array.isArray(S.orders)) S.orders = [];
  if (!S.today || typeof S.today !== "object") S.today = freshToday();
  const ft = freshToday();
  for (const k of Object.keys(ft)) if (S.today[k] == null || (typeof ft[k] === "number" && !isFinite(S.today[k]))) S.today[k] = ft[k];
  S.apps = S.apps || [];
  if (!S.apps.includes("foodies")) S.apps.push("foodies");
  // day-job experience is counted in points now, not in shifts
  if (S.job && !S.job.v2){ S.job.xp = Math.round(num(S.job.xp, 0)*JOB_XP_PER_SHIFT); S.job.v2 = true; }
  if (S.job) S.job.xp = Math.max(0, Math.round(num(S.job.xp, 0)));
}

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
  // Foodies orders arriving
  for (const o of S.orders.slice()) if (now >= o.eta){
    S.orders = S.orders.filter(x => x !== o);
    for (const [k, n] of Object.entries(o.items || {})) if (FOOD[k]) S.inv[k] = (S.inv[k] || 0) + n;
    dailyEmit("delivered", o);
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
  S.fatigue = clamp(S.fatigue - [52, 60, 68][tier || 0]*q*mult, 0, 100);
  S.energy = clamp(S.energy + (10 + (tier || 0)*4)*q, 0, 100);
  S.boost = null;
  return {mins, hours, fatigue:Math.round(S.fatigue - f0), energy:Math.round(S.energy - e0)};
}
function nap(tier){
  const f0 = S.fatigue;
  dailyPass(120, "sleep");
  S.fatigue = clamp(S.fatigue - (10 + (tier || 0)*2), 0, 100);
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
function consume(id){
  const it = FOOD[id]; if (!it) return {ok:false, why:"Nothing like that here."};
  if (!(S.inv[id] > 0)) return {ok:false, why:`You have no ${it.name.toLowerCase()} left.`};
  if (it.kind !== "recovery" && S.energy >= 98 && !(it.fatigue < 0)) return {ok:false, why:"You're full — save it for later."};
  S.inv[id]--;
  let gain = it.energy*(typeof energyMult === "function" ? energyMult() : 1);
  if (it.kind === "energy"){
    // a can lifts you, and then it lets you down. The second one does less, the third less again.
    const n = S.today.drinks || 0; gain *= Math.pow(.6, n); S.today.drinks = n + 1;
    S.boost = {amt:(S.boost ? S.boost.amt : 0) + gain, at:absNow() + 180};
  }
  const e0 = S.energy;
  S.energy = clamp(S.energy + gain, 0, 100);
  S.fatigue = clamp(S.fatigue + (it.fatigue || 0), 0, 100);
  S.today.eaten++; S.today.food += S.energy - e0;
  dailyPass(it.mins, "idle");
  if (typeof save === "function") save();
  return {ok:true, gain:Math.round(S.energy - e0), fat:it.fatigue || 0, item:it};
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
// Foodies: pay now, it turns up later wherever you are
function foodiesOrder(items){
  let total = FOODIES_FEE, n = 0;
  for (const [k, q] of Object.entries(items)) if (FOOD[k] && q > 0){ total += FOOD[k].foodies*q; n += q; }
  if (!n) return {ok:false, why:"Your basket is empty."};
  if (S.money < total) return {ok:false, why:"Not enough money."};
  spend(total);
  const where = lifeZone() === "ground" ? "ground" : "home";
  const eta = absNow() + (where === "ground" ? ri(45, 70) : ri(30, 50));
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
