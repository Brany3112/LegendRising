// qa/record-oldsaves.mjs: saves from the release before the rework, as qa/golden/oldsave-*.json, for qa/oldsave.mjs.
// Owner: I0 (DESIGN 2.1; the migrations they exercise are DESIGN 1.7).
//
// Every fixture is what the game itself wrote to localStorage (saveNow), taken from a seeded run of the real code:
//   oldsave-onboarding  a new career saved in the middle of the old first-day introduction: the intro cinematic has
//                       played for real (the window is smashed), S.onb is on the old stage "door", the later flags false
//   oldsave-fresh       the same career once the old onboarding and the dream are behind it, as the game marks each
//                       step (the number plate back on the door, every flag true, stage "done", S.tutDone), slept into
//                       its second morning
//   oldsave-midseason   a career three matches in (played through the 2D engine by qa/record-legacy.mjs's bot), with a
//                       Player of the Week award (weekAwards, the game's own), its news, a Foodies order delivered to
//                       each delivery point (lobby and gym shelf) and one still on its way
//   oldsave-replay      that career with a Foodies bag in a pocket (picked up and pocketed through inv.js) and the
//                       dream being replayed from the menu (S.replay set, S.tutDone false)
//   oldsave-midmatch    a career one friendly in, saved in the middle of its next 2D match (at half time; S.skillsBase
//                       holds his skills while the nerves take some off, the fixture not played yet). Added by WP-L.
//   oldsave-dream       a new career saved in the middle of the dream on its first night (every skill 99, S.skillsBase
//                       holding the real ones, S.tutDone false). Added by WP-L.
//
// These are saves of the release before the rework, so this recorder drives the game as it was then (the 2D match,
// the dream, qa/record-legacy.mjs's bot). Since Stage 3 (WP-L) that code is gone from the tree: run the recorder in
// a copy of the I0 commit (c7d4760, "I0 baselines") with this file copied over its own, and copy the fixtures back:
//   git archive c7d4760 LegendRising | tar -x -C /tmp/i0 && cp qa/record-oldsaves.mjs /tmp/i0/LegendRising/qa/
//   (cd /tmp/i0/LegendRising && node qa/record-oldsaves.mjs [onboarding|midseason|midmatch|dream])
//
// File shape: {about, has, build, slot, key, metaKey, meta, save}. `save` is the parsed slot string, {S, P2} as
// career.js serial() writes it (JSON.stringify(save) gives back what the game reads); `meta` is the slot's card on the
// title screen; `has` summarises what the fixture holds.
//
//   node qa/record-oldsaves.mjs
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {launch, career, freeze, ROOT} from "./lib.mjs";
import {playInPage} from "./record-legacy.mjs";

export const DIR = path.join(ROOT, "qa", "golden");

// the slot exactly as saveNow left it
async function capture(page, about){
  return page.evaluate(about => {
    saveNow();
    const key = slotKey(SLOT), mk = metaKey(SLOT);
    return {about, build: window.FF_BUILD, slot: SLOT, key, metaKey: mk, meta: JSON.parse(localStorage.getItem(mk) || "null"), save: JSON.parse(localStorage.getItem(key))};
  }, about);
}
function write(name, doc){
  const f = path.join(DIR, `oldsave-${name}.json`);
  fs.mkdirSync(DIR, {recursive: true});
  fs.writeFileSync(f, JSON.stringify(doc) + "\n");
  console.log(`wrote ${path.relative(ROOT, f)} (${(fs.statSync(f).size/1024).toFixed(0)} KB)`);
}
const has = save => { const s = save.S || save; return {week: s.week, day: s.life && s.life.day, flags: s.flags, onb: s.onb, tutDone: s.tutDone, replay: s.replay === undefined ? "absent" : s.replay,
  awards: (s.awards || []).map(a => a.name), news: (s.news || []).length, orders: (s.orders || []).map(o => o.where), parcels: (s.parcels || []).map(p => p.at),
  carry: s.carry || null, apps: s.careerMy && s.careerMy.apps, home: s.home && {apt: s.home.apt, win: s.home.win, plate: s.home.plate, lightMin: s.home.lightMin}}; };

async function onboardingAndFresh(){
  const {page, close} = await launch({gfx: "low", seed: 31});
  try {
    // a new career walks into the city and the introduction starts by itself (the RAF loop runs: it is a cinematic)
    await career(page, {zone: "home", at: "bed", onb: "new", name: "Old Save", min: 7*60, frames: 2});
    await page.waitForFunction(() => S.flags.FirstTimeIntroductionCompleted === true && S.onb.stage === "door", null, {timeout: 240000, polling: 500});
    await page.waitForTimeout(1500);
    const a = await capture(page, "A new career saved in the middle of the old first-day introduction (stage door): the intro cinematic played for real.");
    a.has = has(a.save);
    write("onboarding", a);
    // the rest of the old onboarding and the dream, marked as each of those steps marks itself (intro.js 300, 386,
    // 417, 502; tutorial.js 104; home.js 781 for the plate back on the door), then the first night's sleep
    await page.evaluate(() => {
      const o = S.onb; o.slam = true; o.fixed = true; S.home.plate = "door";
      S.flags.ApartmentTutorialCompleted = true; S.flags.GameplayTutorialCompleted = true; S.flags.TrainingCenterTutorialCompleted = true; o.stage = "done";
      S.tutDone = true;
      S.life.min = 23*60; sleepNight(2); startNewDay();
      window.__life.enterZone("home", "bed");
    });
    const b = await capture(page, "A career just past the old onboarding and the dream, on its second morning (built from the onboarding fixture's run).");
    b.has = has(b.save);
    write("fresh", b);
    if (page.errors.length) throw new Error(page.errors.join("\n"));
  } finally { await close(); }
}

async function midseasonAndReplay(){
  const {page, close} = await launch({gfx: "low", seed: 41});
  try {
    await freeze(page);
    await career(page, {zone: "home", at: "bed", pos: "CAM", name: "Old Save", frames: 0});
    const plan = [{kind: "F", trust: 40, chem: 30, wr: 3, skill: 66}, {kind: "L"}, {kind: "L"}];
    for (const cfg of plan){
      const r = await page.evaluate(playInPage, cfg);
      console.log(`  match ${r.fixture.kind} week ${r.kickoff.week}: ${r.mt.role}, ${r.out.score}, rating ${r.out.rating}`);
      await page.evaluate(() => A.leaveMatch());
      await page.evaluate(() => { S.life.min = 23*60; sleepNight(2); startNewDay(); });
    }
    await page.evaluate(() => {
      // Player of the Week, through the game's own weekly awards: the best line of the week in your division is yours
      W.wkb = {[myLg()]: {id: S.meId, s: 9, g: 2, a: 1, r: 8.7}};
      weekAwards(gw());
      if (typeof closeConfirm === "function") closeConfirm();
      // Foodies: one order from the training centre, one from home, both delivered; a third still on its way
      S.money = Math.max(S.money, 400);
      S.life.min = 9*60;
      window.__life.enterZone("ground", "bus"); foodiesOrder({sandwich: 2, water: 2});
      window.__life.enterZone("home", "bed"); foodiesOrder({meal: 1, fruit: 2});
      dailyPass(80, "idle");
      foodiesOrder({pasta: 1, drink: 1});
      window.__life.refreshParcels();
    });
    const m = await capture(page, "A career three matches into its first season, with a Player of the Week award, news, a Foodies bag waiting at each delivery point and an order on its way.");
    m.has = has(m.save);
    if (!m.has.awards.length || m.has.parcels.length < 2 || !m.has.orders.length) throw new Error("midseason fixture is missing something: " + JSON.stringify(m.has));
    write("midseason", m);
    await page.evaluate(() => {
      // the bag in the lobby: picked up (a left click on it) and put in the first pocket (key 1)
      const L = window.__life, sp = L.spots.find(s => s.parcel);
      if (!sp) throw new Error("no bag in the lobby");
      const got = sp.pick(); L.INV.take(got); L.INV.swap(0);
      // Menu, then Replay the dream tutorial
      A.replayDream();
    });
    await page.waitForTimeout(1000);
    const r = await capture(page, "The midseason career with a Foodies bag in a pocket, saved while the dream is being replayed from the menu (S.replay set).");
    r.has = has(r.save);
    if (!r.has.replay || r.has.replay === "absent" || !(r.has.carry && r.has.carry.slots.some(x => x && x.id === "bag"))) throw new Error("replay fixture is missing something: " + JSON.stringify(r.has));
    write("replay", r);
    if (page.errors.length) throw new Error(page.errors.join("\n"));
  } finally { await close(); }
}

async function midmatch(){
  const {page, close} = await launch({gfx: "low", seed: 43});
  try {
    await freeze(page);
    await career(page, {zone: "home", at: "bed", pos: "ST", name: "Old Save", frames: 0});
    // one friendly played to full time first, so the career has a record
    const r = await page.evaluate(playInPage, {kind: "F", trust: 30, chem: 20, wr: 2});
    console.log(`  match ${r.fixture.kind}: ${r.out.score}, rating ${r.out.rating}`);
    await page.evaluate(() => A.leaveMatch());
    await page.evaluate(() => { S.life.min = 23*60; sleepNight(2); startNewDay(); });
    // the next fixture: kicked off through the 2D engine and its clock run until it stops (a moment of his, or half
    // time), then saved as the game's own save does
    const info = await page.evaluate(() => {
      for (let n = 0; n < 60; n++){ const f = todaysFixture(); if (f) break; S.life.min = 23*60; sleepNight(2); startNewDay(); }
      const f = todaysFixture(); if (!f) throw new Error("no fixture");
      S.life.min = fixtureSlot(f).min;
      S.trust = 40; S.workrate = 3;
      startMatch(f);
      MT.running = false; clearTimeout(MT.timer);
      let k = 0; while (k++ < 400 && advance()){}
      const e = MT.events[MT.i];
      if (e && e.kind === "moment") A.playMoment();
      return {key: f.key, kind: f.kind, label: MT.label, score: MT.score.slice(), skillsBase: !!S.skillsBase};
    });
    console.log("  mid-match:", JSON.stringify(info));
    const m = await capture(page, `A career saved in the middle of a 2D league match, at ${info.label === "HT" ? "half time" : info.label} (${info.score.join("-")}): S.skillsBase holds his skills while the crowd nerves take some off, and the fixture is not played yet.`);
    m.has = has(m.save);
    if (!m.save.S.skillsBase) throw new Error("midmatch fixture has no skillsBase");
    write("midmatch", m);
    if (page.errors.length) throw new Error(page.errors.join("\n"));
  } finally { await close(); }
}

async function dream(){
  const {page, close} = await launch({gfx: "low", seed: 47});
  try {
    await freeze(page);
    await career(page, {zone: "home", at: "bed", pos: "CM", name: "Old Save", frames: 0});
    // the first night of a new career: the world steps aside for the dream (world.js sleep: !tutDone and lifeDream),
    // its cards are passed and the dream match kicks off (every skill 99, S.skillsBase kept)
    await page.evaluate(() => { S.tutDone = false; S.replay = null; window.lifeDream(); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { TUT.steps = []; tutClose(); startDream(); });
    await page.waitForTimeout(600);
    const d = await capture(page, "A new career saved in the middle of the dream on its first night, after the old first-day introduction (every skill 99 for the dream, S.skillsBase holding the real ones, S.tutDone false).");
    d.has = has(d.save);
    if (!d.save.S.skillsBase || d.save.S.tutDone !== false) throw new Error("dream fixture is missing something");
    write("dream", d);
    if (page.errors.length) throw new Error(page.errors.join("\n"));
  } finally { await close(); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const only = process.argv[2];
  if (!only || only === "onboarding") await onboardingAndFresh();
  if (!only || only === "midseason") await midseasonAndReplay();
  if (!only || only === "midmatch") await midmatch();
  if (!only || only === "dream") await dream();
}
