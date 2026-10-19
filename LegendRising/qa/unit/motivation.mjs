// qa/unit/motivation.mjs: the rules of Motivation, the warm-up's boost in effSkill and the coach's style, under plain
// node. Owner: WP-W2 (stage P2c). Contract: addendum A1.8 (the shared W1/W2 contract: S.player.motivation, motivation(),
// motivationAdd(delta, reason), motivationTiming(), warmBoost, coachStyle), DESIGN 1.4.19 (effSkill), 1.7 (migration).
//
// The classic scripts run in this process's own global scope (vm.runInThisContext) in the order index.html loads
// them, with the same small stand-ins for the page as qa/unit/daily.mjs, and a real career is made with newCareer.
//
//   node qa/unit/motivation.mjs      exits 1 on any failed check; writes qa/out/unit-motivation.json
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "qa", "out");
const EM = String.fromCharCode(0x2014);
const results = [];
function check(name, cond, detail = ""){ results.push({name, ok: !!cond, detail: cond ? "" : String(detail)}); if (!cond) console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
const eq = (name, got, want) => check(name, Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-6) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, want ${want} (within ${tol})`);

/* ---------- a page, as much of one as the classic scripts touch ---------- */
const store = new Map();
const classList = () => { const set = new Set(); return {add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), contains: c => set.has(c), toggle: (c, on) => { if (on === undefined) on = !set.has(c); if (on) set.add(c); else set.delete(c); return on; }}; };
const el = () => ({classList: classList(), style: {}, remove(){}, appendChild(){}, setAttribute(){}, querySelector: () => null, querySelectorAll: () => []});
const body = el(); body.classList.add("life");
Object.assign(globalThis, {
  window: globalThis, document: {body, createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, hidden: false},
  localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }},
  addEventListener(){}, requestAnimationFrame: () => 0, requestIdleCallback: undefined,
  setTimeout: (fn, ms) => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  socialEvent(){}, socialWeek(){}, LIFE: {zone: "home"}
});
try { Object.defineProperty(globalThis, "navigator", {value: {hardwareConcurrency: 4, deviceMemory: 8}, configurable: true}); } catch(e){}
let seed = 11;
Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
for (const f of ["js/data/clubs.js", "js/data/names.js", "js/data/game.js", "js/data/positions.js", "js/data/clothes.js", "js/util.js", "js/world.js",
  "js/career.js", "js/daily.js", "js/events.js"])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), {filename: f});
const run = src => vm.runInThisContext(src);
run(`var MT = null;`);
const why = () => run(`S.player.motivWhy ? S.player.motivWhy.t : ""`);
const said = new Set();
const m = () => run(`motivation()`);
const setM = v => run(`S.player.motivation = ${v}; S.player.motivRun = {loss:0, bench:0, told:0, band:""}; delete S.player.motivWhy;`);
const note = () => { const t = why(); if (t) said.add(t); return t; };

/* ---------- a career ---------- */
run(`newCareer({name:"Mo Tivated", number:8, pos:"CM", pref:"CM", foot:"Right", nat:"RO", alloc:Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts:30});`);
run(`joinClub(S.offerSet.list[0]); S.offerSet = null; for (const k in S.flags) S.flags[k] = true; S.onb = {v:2, step:"done", seen:{}}; S.life.att = freshAtt();`);
eq("a new career starts at 60", m(), 60);
eq("a new career has no reason line yet", run(`S.player.motivWhy === undefined`), true);
check("the panel line without a reason reads naturally", /^Nothing much/.test(run(`motivationWhy()`)), run(`motivationWhy()`));

/* ---------- coach styles: data on every club, fixed by the club's name ---------- */
const styles = run(`W.clubs.map(c => c.coachStyle)`);
check("every club has a coach style", styles.length > 50 && styles.every(s => ["attacking", "pressing", "technical"].includes(s)), styles.filter(s => !["attacking", "pressing", "technical"].includes(s)).slice(0, 5));
const counts = styles.reduce((o, s) => (o[s] = (o[s] || 0) + 1, o), {});
check("all three styles are common (each at least 20% of clubs)", Object.keys(counts).length === 3 && Object.values(counts).every(n => n >= styles.length*.2), counts);
eq("the style comes from the club's name (recomputed without the field)", run(`W.clubs.every(c => coachStyleOf({nm:c.nm}) === c.coachStyle)`), true);
eq("coachStyle() is your club's", run(`coachStyle()`), run(`myClub().coachStyle`));
eq("coachStyle(id) is that club's", run(`coachStyle(3)`), run(`W.clubs[3].coachStyle`));
eq("every coach focus raises real skills", run(`Object.values(COACH_STYLES).every(s => s.focus.length === 2 && s.focus.every(f => f.skills.every(k => SKILLS.some(([q]) => q === k))))`), true);
eq("the focus names of A1.8", run(`COACH_STYLE_IDS.map(id => COACH_STYLES[id].focus.map(f => f.name).join("/"))`), ["Finishing/Dribbling", "Stamina/Acceleration", "Passing/Ball Control"]);

/* ---------- migration (DESIGN 1.7): an older save starts at 60 and gets its coaches ---------- */
{
  const r = run(`(() => {
    const was = W.clubs.map(c => c.coachStyle);
    delete S.player.motivation; delete S.player.motivWhy; delete S.player.motivRun; for (const c of W.clubs) delete c.coachStyle;
    const old = deserial(serial()); resume(old);
    const a = {m: S.player.motivation, run: S.player.motivRun, same: W.clubs.every((c, i) => c.coachStyle === was[i])};
    S.player.motivation = 73.4; S.player.motivWhy = {t:"kept", d:1, day:3};
    resume(deserial(serial()));
    a.kept = S.player.motivation; a.keptWhy = S.player.motivWhy.t;
    S.player.motivation = "lots"; S.player.motivWhy = 5; resume(deserial(serial()));
    a.bad = S.player.motivation; a.badWhy = S.player.motivWhy === undefined;
    S.player.motivation = 140; resume(deserial(serial())); a.high = S.player.motivation;
    return a;
  })()`);
  eq("an old save without Motivation loads at 60", r.m, 60);
  eq("and with an empty run", r.run, {loss: 0, bench: 0, told: 0, band: ""});
  eq("an old world gets the same coaches back", r.same, true);
  eq("a saved Motivation survives a reload", [r.kept, r.keptWhy], [73.4, "kept"]);
  eq("a broken value is repaired to 60, a broken reason dropped", [r.bad, r.badWhy], [60, true]);
  eq("an out-of-range value is clamped", r.high, 100);
}

/* ---------- motivationAdd: clamped, with its reason ---------- */
setM(98);
near("motivationAdd returns what it really moved at the top", run(`motivationAdd(5, "Test up")`), 2);
eq("clamped at 100", m(), 100);
eq("the reason is kept with its delta", run(`[S.player.motivWhy.t, S.player.motivWhy.d]`), ["Test up", 5]);
setM(2);
near("motivationAdd returns what it really moved at the bottom", run(`motivationAdd(-5, "Test down")`), -2);
eq("clamped at 0", m(), 0);
setM(60);
run(`motivationAdd(.05, "tiny")`);
eq("a change too small to mention keeps no reason", run(`S.player.motivWhy === undefined`), true);
eq("labels", run(`[90, 70, 50, 35, 10].map(motivationLabel)`), ["Fired up", "Hungry", "Steady", "Flat", "Low"]);

/* ---------- what it does: timing, recovery, the boost's scale (exactly 1 at the default) ---------- */
const at = (v, fn) => { setM(v); return run(`${fn}()`); };
eq("motivationTiming is exactly 1 at 60", at(60, "motivationTiming"), 1);
near("motivationTiming 1.1 at 100", at(100, "motivationTiming"), 1.1);
near("motivationTiming 0.9 at 0 (the floor)", at(0, "motivationTiming"), .9);
check("motivationTiming stays within 0.9 and 1.1", [0, 13, 37, 60, 81, 100].every(v => { const t = at(v, "motivationTiming"); return t >= .9 - 1e-12 && t <= 1.1 + 1e-12; }));
eq("motivationRecovery is exactly 1 at 60", at(60, "motivationRecovery"), 1);
near("motivationRecovery 1.05 at 100", at(100, "motivationRecovery"), 1.05);
near("motivationRecovery 0.95 at 0 (the floor)", at(0, "motivationRecovery"), .95);
eq("motivationBoostScale is exactly 1 at 60", at(60, "motivationBoostScale"), 1);
near("motivationBoostScale 1.4 at 100", at(100, "motivationBoostScale"), 1.4);
near("motivationBoostScale 0.6 at 0", at(0, "motivationBoostScale"), .6);
{
  const base = run(`(1.6 - 1.15*effSkill("stamina")/100)*(S.staff.nutri ? .8 : 1)`);
  eq("staminaF at the default 60 is what it always was", at(60, "staminaF"), base);
  check("a motivated player's match minute costs a little less energy", at(100, "staminaF") < base && at(100, "staminaF") > base*.94, at(100, "staminaF"));
  check("a flat one's a little more", at(0, "staminaF") > base && at(0, "staminaF") < base*1.06, at(0, "staminaF"));
}

/* ---------- training attendance (daily.js settleAttendance) ---------- */
const trainWd = run(`[0, 1, 2, 3, 4].find(wd => trainingDay(wd))`);
check("a training day this week", trainWd != null);
const settle = (setup) => { run(`S.life.wd = ${trainWd}; S.life.att = freshAtt(); S.life.miss = []; S.life.early = {streak:0, log:[]}; ${setup}; settleAttendance();`); return note(); };
setM(60); settle(`Object.assign(S.life.att, {status:"ontime", min:300, pre:30, atStart:true, chem:0})`);
near("in early and the whole session: +2", m(), 62);
eq("its reason", why(), "In early and through the whole session. It shows.");
setM(60); settle(`Object.assign(S.life.att, {status:"ontime", min:300, pre:0, atStart:true, chem:0})`);
near("a full day's training: +1", m(), 61);
setM(60); settle(`Object.assign(S.life.att, {status:"ontime", min:300, pre:0, atStart:true, chem:.9})`);
near("and a good day with the lads: +0.5 more", m(), 61.5);
setM(60); settle(``);
near("skipped training: -4", m(), 56);
eq("its reason", why(), "You skipped training. That never feels good the day after.");
setM(60); settle(`Object.assign(S.life.att, {status:"late", min:100})`);
near("late: -1.5", m(), 58.5);
setM(60); settle(`S.life.miss = [{day:S.life.day, k:"late"}, {day:S.life.day, k:"late"}]`);
near("absent for the third time in a week: -4 and -1.5", m(), 54.5);
setM(60); settle(`S.life.att.excused = true`);
eq("an excused day (the first day's introduction) moves nothing", m(), 60);

/* ---------- sleep, naps and meals (daily.js sleepBy, consume) ---------- */
globalThis.LIFE.zone = "home";
// (a night here must not run into a match day's missed match or an unsettled training day: those have checks of their own)
run(`var __mm = missedMatches; missedMatches = () => {}; S.life.att.settled = true;`);
setM(60); run(`S.life.att.settled = true; S.life.min = 22*60 + 30; S.fatigue = 50; sleepNight(2); startNewDay();`); note();
near("a full night (drifted at midnight, then +1)", m(), 61);
eq("its reason", why(), "A proper night's sleep. You woke up ready to go.");
setM(70); run(`S.life.att.settled = true; S.life.min = 22*60 + 30; sleepNight(2); startNewDay();`);
near("the night's drift goes back towards 60 (4%), then +1", m(), 70 + (60 - 70)*.04 + 1);
setM(60); run(`S.life.att.settled = true; S.life.min = 4*60; sleepNight(2); startNewDay();`); note();
near("a short night (three hours): -2", m(), 58);
setM(60); run(`S.life.min = 13*60; S.fatigue = 60; nap(2);`); note();
near("a nap when tired: +0.4", m(), 60.4);
setM(60); run(`S.life.min = 13*60; S.fatigue = 10; nap(2);`);
eq("a nap when fresh: nothing", m(), 60);
setM(60); run(`startNewDay(); S.inv.meal = 5; S.life.min = 12*60; S.energy = 30; consume("meal"); S.energy = 30; consume("meal"); S.energy = 30; consume("meal");`); note();
near("a meal when hungry: +0.6, at most twice a day", m(), 61.2);
setM(60); run(`startNewDay(); S.energy = 80; S.inv.meal = 2; consume("meal");`);
eq("a meal on a full stomach: nothing", m(), 60);
setM(60); run(`startNewDay(); S.energy = 20; S.inv.drink = 2; consume("drink");`);
eq("an energy drink is not a meal", m(), 60);

run(`missedMatches = __mm;`);

/* ---------- matches (newsFromMatch through finaliseMatch) ---------- */
// a league match of your club's (a friendly is a look, not a result)
const f0 = run(`(() => { const me = meP(); for (let w = 0; w < CAL.W; w++){ const f = fixturesAt(w).find(f => f.kind === "L" && (f.h === me.club || f.a === me.club)); if (f) return JSON.stringify(f); } return "null"; })()`);
check("a league fixture of your club's", f0 !== "null");
const res = (us, them, rating) => `(() => { const f = JSON.parse(${JSON.stringify(f0)}); const me = meP(); const home = f.h === me.club;
  return {f, hg: home ? ${us} : ${them}, ag: home ? ${them} : ${us}, hG: [], aG: [], rt: ${rating == null ? "{}" : `{[S.meId]: ${rating}}`}, motm: -1}; })()`;
const play = (us, them, rating, key) => { run(`MT = {f: JSON.parse(${JSON.stringify(f0)})}; ${key ? `MT.f.key = ${JSON.stringify(key)};` : ""} newsFromMatch(${res(us, them, rating)}); MT = null;`); return note(); };
setM(60); play(2, 0, 7.8);
near("a win and a 7.8: +2 and +1.5", m(), 63.5);
eq("the reason is the bigger part", why(), "A win. The dressing room was buzzing afterwards.");
setM(60); run(`MT = {f: JSON.parse(${JSON.stringify(f0)})}; newsFromMatch(${res(2, 0, 7.8)}); newsFromMatch(${res(2, 0, 7.8)}); MT = null;`);
near("once per match, however often the result passes", m(), 63.5);
setM(60); play(2, 0, 7.8, "another-fixture");
eq("a fixture you were not at moves nothing", m(), 60);
setM(60); run(`MT = null; newsFromMatch(${res(0, 3, 6.5)});`);
eq("a match played without MT (while you were away) moves nothing", m(), 60);
setM(60); play(0, 1, 6.5); play(0, 1, 6.5); play(0, 2, 6.5);
near("three defeats in a row: -1, -1, then -2.5", m(), 55.5);
check("the third names the run", /^3 defeats on the bounce/.test(why()), why());
play(1, 1, 6.6);
eq("a draw ends the run", run(`S.player.motivRun.loss`), 0);
setM(60); play(1, 1, null); play(1, 1, null); play(1, 1, null);
near("on the bench: nothing the first time, then -1.5 and -2 (draws +0.3 each)", m(), 60 + .9 - 1.5 - 2);
check("the reason counts the run", /^3 games in a row without getting on/.test(why()), why());
play(1, 1, 6.4);
eq("getting on ends the bench run", run(`S.player.motivRun.bench`), 0);
setM(60); run(`meP().inj = 2`); play(1, 1, null); play(1, 1, null); run(`meP().inj = 0`);
near("injured, the bench does not count (draws only)", m(), 60.6);
setM(60); play(0, 0, 5.2);
near("a poor rating: -1, the draw +0.3", m(), 59.3);
setM(60); run(`motivationMissedMatch()`); note();
near("a missed match: -3", m(), 57);

/* ---------- the manager notices (a message when it drops low or climbs high, once a week at most) ---------- */
setM(40);
let msgs0 = run(`S.msgs.length`);
run(`motivationAdd(-8, "Test low")`);
eq("dropping under 35 brings a message from the club", run(`S.msgs.length`) - msgs0, 1);
check("from the club, with a natural line", run(`S.msgs[0].from === myClub().nm && MOTIV_TALK.low.includes(S.msgs[0].text)`), run(`S.msgs[0].text`));
run(`S.player.motivation = 40; motivationAdd(0, ""); motivationAdd(-8, "again")`);
eq("not twice in a week", run(`S.msgs.length`) - msgs0, 1);
run(`S.life.day += 8; motivationAdd(60, "Test high")`);
eq("climbing to 80 a week later: a message again", run(`S.msgs.length`) - msgs0, 2);
check("the high line", run(`MOTIV_TALK.high.includes(S.msgs[0].text)`), run(`S.msgs[0].text`));
const office = [90, 65, 40, 10].map(v => { setM(v); return run(`motivationManagerLine()`); });
eq("the office line changes with it", new Set(office).size, 4);

/* ---------- the warm-up's boost in effSkill (read-time, during the match it was set in) ---------- */
setM(60);
run(`S.skills.accuracy = 50; S.skills.power = 60; S.skills.passing = 55; S.skills.composure = 40; S.skills.dribbling = 98;`);
const sk = k => run(`effSkill(${JSON.stringify(k)})`);
eq("no match: no boost, no hit", [sk("accuracy"), sk("passing")], [50, 55]);
run(`MT = {f: {key: "wb-1"}, minute: 20, label: "20'", nerves: 0, tired: 0}; warmBoost.set({rating: "sharp", all: 3, focus: {finishing: 4}, untilMin: 30});`);
eq("active: all +3, and Finishing +4 on accuracy and power", [sk("accuracy"), sk("power"), sk("passing")], [57, 67, 58]);
eq("composure gets the boost too", sk("composure"), 43);
// (U28 part D: a boost takes the effective skill past 99, career.js SKILL_EFF_MAX; the match plays it at attrs.js playOf)
eq("a boost past 99 is kept (98 + 3)", sk("dribbling"), 101);
eq("effSkills carries it", run(`effSkills().accuracy`), 57);
eq("S.skills itself never changes", run(`[S.skills.accuracy, S.skills.power]`), [50, 60]);
const g = run(`warmBoost.get()`);
eq("get(): rating, focus as skills, active, minutes left", [g.rating, g.focus, g.active, g.left], ["sharp", {accuracy: 4, power: 4}, true, 10]);
run(`MT.nerves = .2`);
eq("on top of the nerves (read-time like them)", sk("passing"), Math.round(55*.8) + 3);
run(`MT.nerves = 0; MT.minute = 31`);
eq("over at untilMin", [sk("accuracy"), run(`warmBoost.get().active`)], [50, false]);
eq("extend() does nothing once it is over", run(`warmBoost.extend(10)`), false);
run(`MT.minute = 28`);
eq("extend() while active: ten more minutes, on fire", [run(`warmBoost.extend(10)`), run(`warmBoost.get().untilMin`), run(`warmBoost.get().onFire`)], [true, 40, true]);
run(`MT.minute = 39`);
eq("still on at 39 after the extension", sk("accuracy"), 57);
run(`MT = {f: {key: "wb-2"}, minute: 5, label: "5'", nerves: 0, tired: 0}`);
eq("another match: the old boost is not this one's", sk("accuracy"), 50);
run(`MT.label = "FT"; MT.f.key = "wb-1"; MT.minute = 20`);
eq("full time: off", sk("accuracy"), 50);
run(`MT = {f: {key: "wb-3"}, minute: 60, label: "60'"}; warmBoost.set({rating: "ready", all: 2, focus: {passing: 3, ballControl: 2}, untilMin: 72})`);
eq("a skill key and a coach focus id together", [sk("passing"), sk("dribbling"), sk("composure")], [55 + 2 + 3 + 2, 98 + 2 + 2, 40 + 2 + 2]);   // (U28 part D: past 99 with a boost)
run(`S.skills.passacc = 50; warmBoost.set({rating: "ready", all: 2, focus: {passing: 3, passacc: 3}, untilMin: 72})`);
eq("the Passing focus as skills (what the warm-up sends): each once, a skill key never read as a focus id", [sk("passing"), sk("passacc"), sk("accuracy")], [55 + 5, 50 + 5, 50 + 2]);
eq("rev() moves with set, extend and clear", run(`(() => { const a = warmBoost.rev(); warmBoost.extend(5); const b = warmBoost.rev(); warmBoost.set({all: 1, untilMin: 70}); const c = warmBoost.rev(); return [b - a, c - b]; })()`), [1, 1]);
run(`warmBoost.set({rating: "nonsense", all: 50, untilMin: 70})`);
eq("a bad rating reads as ready, the size is held to 20", [run(`warmBoost.get().rating`), run(`warmBoost.get().all`)], ["ready", 20]);
run(`warmBoost.clear()`);
eq("clear()", [run(`warmBoost.get()`), sk("passing")], [null, 55]);
run(`MT = null`);
eq("window.warmBoost is the same object", run(`window.warmBoost === warmBoost`), true);

/* ---------- a good dressing-room moment at half time ---------- */
setM(60);
eq("half time, the team ahead: up, with the dressing room's line", [run(`motivationHalfTime({lead: 1, rating: 6.5})`), run(`S.player.motivWhy.t`)], [0.8, "The dressing room was buzzing at half time."]);
setM(60);
eq("the gaffer singling you out counts for more, and is the line told", [run(`motivationHalfTime({lead: 0, rating: 7.8})`), run(`/singled you out/.test(S.player.motivWhy.t)`)], [0.7, true]);
setM(60);
eq("level or behind, nothing special: no change", [run(`motivationHalfTime({lead: -1, rating: null})`), run(`motivation()`)], [0, 60]);

/* ---------- the test stub ---------- */
eq("__motivation.set and get", run(`(__motivation.set(47, "stub"), [__motivation.get().m, __motivation.get().why.t])`), [47, "stub"]);

/* ---------- words ---------- */
for (const t of run(`[...MOTIV_TALK.low, ...MOTIV_TALK.high, ...[90, 65, 40, 10].map(v => (S.player.motivation = v, motivationManagerLine())), motivationWhy(),
  ...Object.values(COACH_STYLES).flatMap(s => [s.name, s.line, ...s.focus.map(f => f.name)])]`)) said.add(t);
check("no em dash in anything it says", [...said].every(t => !t.includes(EM)), [...said].filter(t => t.includes(EM)));
check("every reason line is a sentence", [...said].filter(t => t.length > 25).every(t => /[.!?]$/.test(t)), [...said].filter(t => t.length > 25 && !/[.!?]$/.test(t)));

const pass = results.filter(r => r.ok).length;
console.log(`unit/motivation: ${pass} of ${results.length} checks pass`);
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "unit-motivation.json"), JSON.stringify({pass, total: results.length, failed: results.filter(r => !r.ok)}, null, 1));
process.exit(pass === results.length ? 0 : 1);
