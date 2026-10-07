// qa/unit/daily.mjs: the life systems of daily.js, career.js and events.js (and rent.js's bills) under plain node.
// Owner: WP-G (DESIGN 2.3 WP-G acceptance; contracts 1.4.19, 1.7, 3.8).
//
// The classic scripts run in this process's own global scope (vm.runInThisContext), in the order index.html loads
// them, with small stand-ins for the page; js/life/rent.js is then imported as the ES module it is and sees the same
// globals, as it does in the browser. A real career is made with newCareer (the shell and the creation), so every
// check runs against the same state the game has.
//
//   node qa/unit/daily.mjs       exits 1 on any failed check; writes qa/out/unit-daily.json
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "qa", "out");
const EM = String.fromCharCode(0x2014), MINUS = String.fromCharCode(0x2212);
const results = [];
function check(name, cond, detail = ""){ results.push({name, ok: !!cond, detail: cond ? "" : String(detail)}); if (!cond) console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
const eq = (name, got, want) => check(name, Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-9) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, want ${want} (within ${tol})`);

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
// a seeded Math.random, so the career (and every roll) is the same each run
let seed = 7;
Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
for (const f of ["js/data/clubs.js", "js/data/names.js", "js/data/game.js", "js/data/positions.js", "js/data/clothes.js", "js/util.js", "js/world.js",
  "js/career.js", "js/daily.js", "js/events.js", "js/ui/barber.js"])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), {filename: f});
const run = src => vm.runInThisContext(src);
const rent = await import(path.join(ROOT, "js/life/rent.js"));
const zone = z => { globalThis.LIFE.zone = z; };

/* ---------- a career: the shell, then the creation (DESIGN 3.7.2, 1.4.19) ---------- */
run(`var CRT = {name:"Test Player", number:9, pos:"ST", pref:"ST", foot:"Right", nat:"RO", alloc:Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts:30};`);
run(`careerShell()`);
eq("careerShell: CharacterCreated is false", run(`S.flags.CharacterCreated`), false);
eq("careerShell: the clock starts on day 1 at 8:00 AM, a Monday", run(`[S.life.day, S.life.min, S.life.wd]`), [1, 480, 0]);
eq("careerShell: onboarding v2 at intro", run(`[S.onb.v, S.onb.step]`), [2, "intro"]);
eq("careerShell: no body for you yet (meId -1)", run(`S.meId`), -1);
store.clear();
eq("save() refuses while the career is not created", run(`save()`), false);
eq("saveNow() refuses while the career is not created", run(`saveNow()`), false);
eq("nothing was written to storage during the shell", store.size, 0);
check("careerShell made the flat (ensureHome)", run(`!!S.home && !!S.home.apt`));
eq("the flat has no letters before there is a name", run(`S.home.letters.length`), 0);
eq("a new flat starts with the light off", run(`S.home.light`), false);
run(`CRT.look = lookSane({hair:"curly", hairColor:LOOK_OPT.hairColor[3], beard:"beard"}, "seed-x")`);
run(`applyCreation(CRT)`);
eq("applyCreation: CharacterCreated", run(`S.flags.CharacterCreated`), true);
eq("applyCreation: owns exactly the chosen cut", run(`S.player.owned.hair`), ["curly"]);
eq("applyCreation: owns exactly the chosen colour", run(`S.player.owned.hairColor`), [run(`LOOK_OPT.hairColor[3]`)]);
eq("applyCreation: beards are the chosen one, a clean shave and stubble", run(`S.player.owned.beard.slice().sort()`), ["", "beard", "stubble"]);
check("applyCreation: a player in the world", run(`S.meId >= 0 && meP().me === true && meP().rep === 4`));
check("applyCreation: three start offers", run(`S.offerSet && S.offerSet.list.length === 3`));
eq("applyCreation: the uncle's and the landlord's letters", run(`S.home.letters.map(l => l.from)`), ["Uncle Nelu", "The landlord"]);
check("the uncle writes to you by name", run(`S.home.letters[0].text.includes("Test")`), run(`S.home.letters[0].text`));
check("letters have no em dash", !run(`S.home.letters.map(l => l.text + l.title).join(" ")`).includes(EM));
run(`saveNow()`);
check("a created career saves", store.size > 0);
run(`A_sign = i => { const o = S.offerSet.list[i]; S.offerSet = null; joinClub(o); }; A_sign(0)`);
check("signed: a club", run(`!!myClub()`));
// the rest of the checks run after the first day's introduction
run(`for (const k in S.flags) S.flags[k] = true; S.onb = {v:2, step:"done", seen:{}}; S.life.att = freshAtt();`);

/* ---------- styles (DESIGN 3.7.3) ---------- */
eq("styleState: what you wear", run(`styleState("hair", "curly")`), "wearing");
eq("styleState: a walk-in cut you have not bought", run(`styleState("hair", "fade")`), "available");
eq("styleState: a barber's cut beyond your reputation", run(`styleState("hair", "mohawk")`), "locked");
run(`grantStyle("hair", "fade")`);
eq("styleState: bought before", run(`styleState("hair", "fade")`), "purchased");
eq("lookSane with owned: an unowned cut falls back to an owned one", run(`lookSane(Object.assign({}, S.player.look, {hair:"afro"}), lookSeedOf(S), S.player.owned).hair`), "curly");
check("ownsStyle: a clean shave is always yours", run(`ownsStyle("beard", "")`));

/* ---------- busMins and the hours (DESIGN 1.8, 3.8.6) ---------- */
eq("busMins home to ground", run(`busMins("home", "ground")`), 40);
eq("busMins ground to town", run(`busMins("ground", "town")`), 100);
eq("hours: sessionHours", run(`sessionHours()`), "10:00 AM to 4:00 PM");
eq("hours: centreHours", run(`centreHours()`), "6:00 AM to 5:00 PM");
eq("hours: lateAfter", run(`lateAfter()`), "10:15 AM");
eq("hours: earlyBy", run(`earlyBy()`), "9:30 AM");
eq("ACT.run exists", run(`JSON.stringify(ACT.run)`), JSON.stringify({e:.05, f:.02, o:.02, h:.04}));
eq("WAKE", run(`WAKE`), 420);
eq("EARLY", run(`JSON.stringify(EARLY)`), JSON.stringify({by:30, bonus:[.3, .45, .6], weekCap:3}));
eq("POWER_CUT_KEEP", run(`POWER_CUT_KEEP`), .7);

/* ---------- the bed: sleepPlan predicts what the sleep does (DESIGN 3.8.3) ---------- */
const sleepCase = (label, m, kind, tier, setup = "") => {
  run(`S.life.min = ${m}; S.fatigue = 64; S.energy = 47; S.boost = null; ${setup}`);
  const plan = run(`sleepPlan(${JSON.stringify(kind)}, ${tier})`);
  const f0 = run(`S.fatigue`), e0 = run(`S.energy`), t0 = run(`absNow()`);
  const fn = kind === "night" ? "sleepNight" : kind === "nap" ? "nap" : "sleepFullDay";
  const r = run(`${fn}(${tier})`);
  near(`${label}: fatigue change is the plan's`, run(`S.fatigue`) - f0, plan.fatigue);
  near(`${label}: energy change is the plan's`, run(`S.energy`) - e0, plan.energy);
  eq(`${label}: minutes slept are the plan's`, run(`absNow()`) - t0, plan.mins);
  eq(`${label}: what it returns is the plan rounded`, [r.fatigue, r.energy], [Math.round(plan.fatigue), Math.round(plan.energy)]);
  run(`startNewDay()`);
  return plan;
};
zone("home");
for (const tier of [1, 6]){
  const p19 = sleepCase(`night from 19:00, tier ${tier}`, 19*60, "night", tier);
  eq(`night from 19:00 wakes at WAKE (tier ${tier})`, p19.wake, 420);
  sleepCase(`night from 23:30, tier ${tier}`, 23*60 + 30, "night", tier);
  const p2 = sleepCase(`night from 02:00, tier ${tier}`, 2*60, "night", tier);
  eq(`night from 02:00 is five hours (tier ${tier})`, p2.mins, 300);
  sleepCase(`nap at 13:00, tier ${tier}`, 13*60, "nap", tier);
  const pd = sleepCase(`hold at 21:40, tier ${tier}`, 21*60 + 40, "day", tier);
  eq(`hold at 21:40 sleeps exactly 24 hours (tier ${tier})`, pd.mins, 1440);
}
// a party upstairs tonight: the night does less, the plan says so, and the sleep agrees
run(`eventsEnsure(); S.events.active = [{id:"noisy", from:S.life.day, to:S.life.day, flat:"302"}]`);
const pn = sleepCase("noisy night at 23:00", 23*60, "night", 1);
check("noisy night: the plan carries Noisy neighbours", pn.mods.some(m => m.k === "noisy" && m.f === .8), JSON.stringify(pn.mods));
run(`S.events.active = []`);

/* ---------- food: the tooltip is what eating does (DESIGN 3.8.2) ---------- */
const foods = run(`Object.keys(FOOD)`);
const fridge = [["tier 1", "{keep:FRIDGE_KEEP[0], powerCut:false}"], ["tier 6", "{keep:FRIDGE_KEEP[5], powerCut:false}"], ["power cut, tier 1", "{keep:FRIDGE_KEEP[0], powerCut:true}"], ["fresh", "undefined"]];
for (const [src, js] of fridge) for (const id of foods){
  run(`S.inv[${JSON.stringify(id)}] = 3; S.energy = 40; S.fatigue = 50; S.hyd = 50; S.today.drinks = 0; S.boost = null;`);
  const fx = run(`foodEffect(${JSON.stringify(id)}, ${js})`);
  const lines = run(`foodLines(${JSON.stringify(id)}, 3, ${js})`);
  const r = run(`consume(${JSON.stringify(id)}, ${js})`);
  check(`${id} (${src}): eaten`, r.ok, r.why);
  if (!r.ok) continue;
  check(`${id} (${src}): energy chip equals the tooltip (+-0.5)`, Math.abs(r.gain - fx.energy) <= .5, `${r.gain} vs ${fx.energy}`);
  check(`${id} (${src}): fatigue chip equals the tooltip (+-0.5)`, Math.abs(r.fat - fx.fatigue) <= .5, `${r.fat} vs ${fx.fatigue}`);
  check(`${id} (${src}): hydration chip equals the tooltip (+-0.5)`, Math.abs(r.hyd - fx.hyd) <= .5, `${r.hyd} vs ${fx.hyd}`);
  const you = lines.find(l => l.startsWith("You get: ")) || "";
  if (fx.base.energy) check(`${id} (${src}): the tooltip's "You get" energy is the chip's`, you.includes(`Energy ${r.gain > 0 ? "+" : r.gain < 0 ? MINUS : ""}${Math.abs(r.gain)}`), `${you} / chip ${r.gain}`);
  if (src.startsWith("power")) check(`${id}: the power-cut line reads Power outage ${MINUS}30%`, lines.includes(`Power outage ${MINUS}30%`), lines.join(" | "));
  if (src === "tier 1") check(`${id}: the tier-1 line reads Fridge quality ${MINUS}50%`, lines.includes(`Fridge quality ${MINUS}50%`), lines.join(" | "));
  check(`${id} (${src}): no em dash in the tooltip`, !lines.join(" ").includes(EM));
}
// a second energy drink does less, and says so
run(`S.inv.drink = 3; S.energy = 30; S.today.drinks = 0; S.boost = null; consume("drink")`);
const fx2 = run(`foodEffect("drink", {keep:FRIDGE_KEEP[0], powerCut:false})`), l2 = run(`foodLines("drink", 2, {keep:FRIDGE_KEEP[0], powerCut:false})`);
check("second energy drink: the tooltip shows Energy drinks today (1)", l2.some(l => l.startsWith("Energy drinks today (1) " + MINUS + "40%")), l2.join(" | "));
const r2 = run(`consume("drink", {keep:FRIDGE_KEEP[0], powerCut:false})`);
check("second energy drink: chip equals the tooltip", Math.abs(r2.gain - fx2.energy) <= .5, `${r2.gain} vs ${fx2.energy}`);
// full: the refusal is the total line
run(`S.inv.sandwich = 2; S.energy = 99; S.hyd = 99`);
const lf = run(`foodLines("sandwich", 2, {keep:.5, powerCut:false})`);
eq("full: the refusal is the last line", lf[lf.length - 1], "You're full. Save it for later.");
eq("full: consume refuses with the same words", run(`consume("sandwich", .5).why`), "You're full. Save it for later.");

/* ---------- attendance and the early bonus (DESIGN 3.8.8) ---------- */
// a weekday with no fixture: the test career's fixture list is emptied for these days
run(`myFixtures = () => []; WFX = {wk:-1, club:-2, season:-1, list:[]};`);
const day = (wd, setup) => { run(`S.life.wd = ${wd}; S.life.att = freshAtt(); S.life.miss = [];`); };
const trust = () => run(`S.trust`);
const at = (m, z) => { const now = run(`S.life.min`); if (m > now) run(`dailyPass(${m - now}, "idle")`); if (z){ if (z === "ground"){ zone("ground"); run(`arriveForTraining()`); } else { run(`attendLeave()`); zone(z); } } };
const settle = () => { at(16*60); const a = run(`S.life.att`); return a; };
const startDay = wd => { run(`S.life.min = 6*60; S.life.wd = ${wd}; S.life.att = freshAtt(); startNewDay();`); zone("home"); };
let ev = [];
run(`dailyOn((t, d) => { if (t === "settled") globalThis.__settled = d; })`);
run(`S.trust = 20; S.life.early = {streak:0, log:[]}; S.life.miss = []`);
// arrive 9:20 and stay
startDay(0); at(9*60 + 20, "ground"); let t0 = trust(); settle();
near("arrive 9:20 and stay: +1.2 and +0.3", trust() - t0, 1.5, 1e-9);
eq("arrive 9:20 and stay: key goodEarly", globalThis.__settled.k, "goodEarly");
// a streak of three reaches +0.6
startDay(1); at(9*60 + 20, "ground"); t0 = trust(); settle(); near("second early day: +1.2 and +0.45", trust() - t0, 1.65);
startDay(2); at(9*60 + 15, "ground"); t0 = trust(); settle(); near("third early day: +1.2 and +0.6", trust() - t0, 1.8);
eq("third early day: streak 3", globalThis.__settled.streak, 3);
startDay(3); at(9*60 + 10, "ground"); t0 = trust(); settle(); near("a fourth early day in 7: no bonus", trust() - t0, 1.2);
check("a fourth early day in 7: capped", globalThis.__settled.capped === true);
// a 6:30 arrival is recorded
run(`S.life.early = {streak:0, log:[]}`);
startDay(4); at(6*60 + 30, "ground"); eq("a 6:30 arrival is recorded", run(`S.life.att.arrived`), 390); eq("a 6:30 arrival is on time", run(`S.life.att.status`), "ontime");
t0 = trust(); settle(); near("6:30 and stay: +1.2 and +0.3", trust() - t0, 1.5);
// 9:50: no bonus
run(`S.life.early = {streak:0, log:[]}`);
startDay(0); at(9*60 + 50, "ground"); t0 = trust(); settle(); near("9:50 gives no bonus", trust() - t0, 1.2); eq("9:50: key good", globalThis.__settled.k, "good");
// early, then leave at 11:00: -1 and the streak resets
startDay(1); at(9*60 + 20, "ground"); t0 = trust(); settle(); near("early again: +1.5 (streak 1)", trust() - t0, 1.5);
startDay(2); at(9*60 + 20, "ground"); at(11*60, "home"); t0 = trust(); settle(); near("early then leave at 11:00: -1", trust() - t0, -1); eq("left early: key early", globalThis.__settled.k, "early");
eq("left early: the streak resets", run(`S.life.early.streak`), 0);
// minutes are counted by overlap: 10:00 to 12:00 is 120
startDay(3); at(10*60, "ground"); at(12*60, "home"); eq("a.min for 10:00 to 12:00 is 120", run(`S.life.att.min`), 120);
settle();
// leaving before 10:15 undoes the arrival
startDay(4); at(9*60 + 20, "ground"); at(10*60 + 5, "home"); eq("leaving before 10:15 undoes the arrival", run(`S.life.att.arrived`), null);
t0 = trust(); settle(); near("then never back: absent", trust() - t0, -6);
// day one: excused, no trust either way
run(`S.onb = {v:2, step:"H3", seen:{}}`);
startDay(0); eq("day one: excused", run(`S.life.att.excused`), true);
at(11*60, "ground"); t0 = trust(); settle(); eq("day one: no trust change", trust() - t0, 0); eq("day one: key excused", globalThis.__settled.k, "excused");
run(`S.onb = {v:2, step:"done", seen:{}}`);

/* ---------- events with real mechanics (DESIGN 3.8.6) ---------- */
const evOn = (id, extra = "") => run(`S.events.active = [Object.assign({id:${JSON.stringify(id)}, from:S.life.day, to:S.life.day, alt:false}, ${extra || "{}"})]`);
eq("no lift event", run(`"lift" in LIFE_EVENTS`), false);
eq("the kinds", run(`Object.keys(LIFE_EVENTS).sort()`), ["blocked", "delivery", "noisy", "power", "roadworks", "shop", "thief", "water"]);
for (const id of run(`Object.keys(LIFE_EVENTS)`)){
  evOn(id, id === "noisy" ? `{flat:"302"}` : "");
  const t = run(`eventText(S.events.active[0]) + " " + eventSub(S.events.active[0]) + " " + eventFx(S.events.active[0])`);
  check(`${id}: a board line, a subline and what it means`, run(`!!eventText(S.events.active[0]) && !!eventSub(S.events.active[0]) && !!eventFx(S.events.active[0])`), t);
  check(`${id}: no em dash on the board`, !t.includes(EM), t);
}
evOn("roadworks"); eq("road works: +20 on routes touching home", run(`busMins("home", "ground")`), 60); eq("road works: not on ground to town", run(`busMins("ground", "town")`), 100);
evOn("delivery"); run(`S.money = 500; S.orders = []`);
const o1 = run(`foodiesOrder({fruit:1}, "home").order`); check("delivery: ETA 25 to 60 minutes longer", o1.late >= 25 && o1.late <= 60 && o1.eta - run(`absNow()`) >= 50, JSON.stringify(o1));
evOn("power"); const fxp = run(`foodEffect("sandwich", {keep:FRIDGE_KEEP[0], powerCut:!(!lifeEventOn("power"))})`); check("power: the fridge modifier", fxp.mods.some(m => m.k === "power" && m.f === .7));
evOn("water"); check("water: on from 8 AM", run(`lifeEventOn("water", S.life.day, 8*60)`) && !run(`lifeEventOn("water", S.life.day, 7*60)`) && !run(`lifeEventOn("water", S.life.day, 20*60)`));
evOn("noisy", `{flat:"302"}`); check("noisy: on at 23:00 and at 02:00 the next day", run(`lifeEventOn("noisy", S.life.day, 23*60) && lifeEventOn("noisy", S.life.day + 1, 2*60) && !lifeEventOn("noisy", S.life.day + 1, 4*60)`));
check("noisy: the party flat is never yours", run(`S.events.active[0].flat !== S.home.apt && noisyFlat() !== S.home.apt`));
check("noisy: survives midnight for the small hours", (() => { run(`eventsNewDay(S.life.day + 1)`); return run(`S.events.active.some(e => e.id === "noisy")`); })());
evOn("shop"); check("shop: on today", run(`lifeEventOn("shop")`));
// the nightly roll: fair (shuffled), never two that clash, at most two
run(`S.events.active = []`);
let clash = 0, over = 0, kinds = new Set();
for (let d = 10; d < 4010; d++){
  run(`(() => { const s = eventsNewDay(${d}); })()`);
  const a = run(`S.events.active.filter(e => e.from <= ${d} && e.to >= ${d}).map(e => e.id)`);
  a.forEach(k => kinds.add(k));
  if (a.length > 2) over++;
  if ((a.includes("noisy") && a.includes("power")) || (a.includes("water") && a.includes("power"))) clash++;
}
eq("nightly roll: never more than two at once", over, 0);
eq("nightly roll: never a clashing pair", clash, 0);
eq("nightly roll: every kind comes up", [...kinds].sort(), ["blocked", "delivery", "noisy", "power", "roadworks", "shop", "thief", "water"]);
check("quiet days: nothing on days 1 and 2", run(`eventsNewDay(1).length === 0 && eventsNewDay(2).length === 0`));
run(`S.events.active = []`);

/* ---------- electricity (DESIGN 3.8.4) ---------- */
const H = () => run(`S.home`);
run(`S.home.fx.bulb = false; S.home.light = true; S.home.lightBy = {};`);
run(`dailyPass(60, "idle")`);
eq("no bulb: nothing metered", run(`Object.values(S.home.lightBy).reduce((a, b) => a + b, 0)`), 0);
run(`S.home.fx.bulb = true; S.home.light = true; S.home.lightBy = {}; S.events.active = [{id:"power", from:S.life.day, to:S.life.day}]`);
run(`dailyPass(60, "idle")`);
eq("an outage: nothing metered", run(`Object.values(S.home.lightBy).reduce((a, b) => a + b, 0)`), 0);
run(`S.events.active = []; S.home.lightBy = {}; zone = "ground"`); zone("ground");
run(`dailyPass(90, "idle")`);
eq("a light left on while at the ground is metered", run(`S.home.lightBy[homeMonth()]`), 90);
zone("home");
// billing: free months bill nothing; then each month its own minutes
run(`(() => { const h = S.home, now = homeMonth(); h.freeUntil = now + 1; h.billed = now; h.bills = []; h.lightBy = {}; h.lightBy[now] = 120; })()`);
run(`S.week += 4`);       // into the next month: its bill charges this (free) month's light: nothing
rent.checkMail();
let bill = run(`S.home.bills[S.home.bills.length - 1]`);
eq("first bill after the free months: no electricity for a free month", bill.util, 0);
run(`(() => { const h = S.home, now = homeMonth(); h.lightBy[now] = 300; })()`);
run(`S.week += 4`);
run(`(() => { const h = S.home, now = homeMonth(); h.lightBy[now] = 600; })()`);
run(`S.week += 4`);
const nb = run(`S.home.bills.length`);
rent.checkMail();
const bs = run(`S.home.bills.slice(-2)`);
eq("a two-month catch-up bills two months", run(`S.home.bills.length`) - nb, 2);
eq("each month its own minutes: 300 then 600", bs.map(b => b.util), [run(`ELEC_BASE`) + Math.round(300/60*run(`ELEC_RATE`)), run(`ELEC_BASE`) + Math.round(600/60*run(`ELEC_RATE`))]);
run(`S.money = Math.round(S.home.bills.filter(b => !b.paid).sort((a, b) => a.m - b.m).slice(0, 2).reduce((t, b) => t + b.total, 0) + 1)`);
const plan = rent.payPlan(), m0 = run(`S.money`), paid = rent.payAll();
eq("the Pay button's amount is what payAll pays", paid, plan.total);
eq("payAll spends through spend()", m0 - run(`S.money`), paid);

/* ---------- migrations (DESIGN 1.7) ---------- */
run(`(() => { const h = S.home; h.lightMin = 75; delete h.lightBy; h.billed = homeMonth(); h.freeUntil = 0; homeMigrate(h); })()`);
eq("lightMin migrates to the month the next bill charges", run(`S.home.lightBy[S.home.billed]`), 75);
eq("lightMin is deleted", run(`"lightMin" in S.home`), false);
run(`S.home.fx.bulb = false; S.home.light = true; homeMigrate(S.home)`);
eq("no bulb: the light is off", run(`S.home.light`), false);
run(`delete S.player.owned; S.player.look.hair = "messy"; dailyEnsure()`);
eq("an old save owns what it wears", run(`S.player.owned.hair`), ["messy"]);
run(`S.awards = [{name:"Player of the Week ${EM} Liga 4"}]; S.news = [{title:"A ${EM} B", body:"One ${EM} two"}]; S.history = [{lg:"${EM}"}]; delete S.textV; textMigrate()`);
eq("text migration: awards", run(`S.awards[0].name`), "Player of the Week: Liga 4");
eq("text migration: news", run(`[S.news[0].title, S.news[0].body]`), ["A: B", "One. two"]);
eq("text migration: history placeholder", run(`S.history[0].lg`), run(`EMPTY_CELL`));
// effSkill: read-time modifiers, nothing written (DESIGN D8)
run(`MT = {nerves:.2, tired:.1}; S.skills.power = 60;`);
eq("effSkill applies the match's hit", run(`effSkill("power")`), 42);
eq("S.skills is untouched", run(`S.skills.power`), 60);
eq("composure is exempt", run(`effSkill("composure")`), run(`S.skills.composure`));
run(`MT = null`);
check("matchSkillsOn is gone", run(`typeof matchSkillsOn`) === "undefined");
near("energyFactor is smooth: 0.6 at empty", run(`(S.energy = 0, energyFactor())`), .6);
near("energyFactor: 1 from 60", run(`(S.energy = 60, energyFactor())`), 1);
near("energyFactor: halfway", run(`(S.energy = 30, energyFactor())`), .8);
// missedMatches skips the fixture being played when the game was closed
run(`(() => { const f = {key:"k1", kind:"L", h:meP().club, a:(meP().club + 1) % W.clubs.length, done:false}; myFixtures = () => [f]; WFX = {wk:-1, club:-2, season:-1, list:[]};
  S.life.wd = fixtureSlot(f).wd; S.life.min = fixtureSlot(f).min + MATCH_LEN + 5; S.life.inMatch = {v:1, fkey:"k1"}; globalThis.__sim = 0; simFixture = () => { globalThis.__sim++; }; })()`);
t0 = trust(); run(`missedMatches(true)`);
eq("missedMatches: no penalty for the interrupted match", trust() - t0, 0);
eq("missedMatches: it is not simulated over", run(`globalThis.__sim`), 0);
run(`delete S.life.inMatch; myFixtures = () => []; WFX = {wk:-1, club:-2, season:-1, list:[]};`);

/* ---------- trust only through trustAdd (lint gate over WP-G's files) ---------- */
{
  const {loadRules, runRule} = await import(path.join(ROOT, "qa/lint.mjs"));
  const cfg = loadRules(), rule = cfg.rules.find(r => r.id === "trust-writes");
  const mine = ["js/daily.js", "js/career.js", "js/events.js", "js/data/game.js", "js/ui/barber.js", "js/ui/panels.js", "js/ui/foodies.js"];
  const found = runRule(rule, cfg).found.filter(x => mine.includes(x.file) || x.file.startsWith("js/life/"));
  eq("no direct trust writes in WP-G's files", found.map(x => `${x.file}:${x.line}`), []);
}

const pass = results.filter(r => r.ok).length;
console.log(`unit/daily: ${pass} of ${results.length} checks pass`);
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "unit-daily.json"), JSON.stringify({pass, total: results.length, failed: results.filter(r => !r.ok)}, null, 1));
process.exit(pass === results.length ? 0 : 1);
