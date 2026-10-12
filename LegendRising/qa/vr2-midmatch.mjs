// verifier probe: the old save taken in the middle of a 2D league match (qa/golden/oldsave-midmatch.json), loaded with
// the 3D world: what becomes of that fixture (still playable? played out? missed with a penalty?), skills restored.
import fs from "node:fs";
import path from "node:path";
import {launch, ROOT, freeze} from "./lib.mjs";
const name = process.argv[2] || "midmatch";
const GOLD = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "golden", `oldsave-${name}.json`), "utf8"));
const {page, close} = await launch({gfx: "low", seed: 5});
const r = {};
try {
  await page.evaluate(g => { localStorage.setItem(g.key, JSON.stringify(g.save)); localStorage.setItem(g.metaKey, JSON.stringify(g.meta)); }, GOLD);
  await page.reload();
  await page.waitForFunction(() => typeof A === "object" && typeof window.startLife === "function" && document.readyState === "complete", null, {timeout: 90000});
  r.saved = await page.evaluate(g => { const s = g.save.S; return {skills: s.skills, base: s.skillsBase, trust: s.trust, week: s.week}; }, GOLD);
  await page.evaluate(n => A.continue(n), GOLD.slot || 1);
  await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000}).catch(() => {});
  r.loaded = await page.evaluate(() => {
    const f = todaysFixture(), sl = f ? fixtureSlot(f) : null;
    return {screen: LAST_SCREEN, life: document.body.classList.contains("life"), zone: window.__life && window.__life.LIFE.zone, day: S.life.day, min: S.life.min, wd: S.life.wd, week: S.week,
      skills: S.skills, base: S.skillsBase || null, trust: S.trust, mt: typeof MT !== "undefined" && MT ? Object.keys(MT).slice(0, 6) : null,
      today: f ? {key: f.key, kind: f.kind, ko: sl.min, done: !!W.done[f.key]} : null, inMatch: S.life.inMatch || null, speed: S.speed};
  });
  // the tunnel's spot at the ground for this fixture, and what happens over the evening and the night
  r.tunnelOpen = await page.evaluate(() => { try { const f = todaysFixture(); return f ? {now: S.life.min, ko: fixtureSlot(f).min, open: S.life.min >= fixtureSlot(f).min - 90 && S.life.min <= fixtureSlot(f).min + 25} : null; } catch(e){ return String(e); } });
  const before = await page.evaluate(() => ({trust: S.trust, news: S.news.length, done: Object.keys(W.done).length, apps: S.careerMy.apps}));
  await page.evaluate(() => { S.life.min = 23*60; sleepNight(2); startNewDay(); });
  r.nextDay = await page.evaluate(b => ({trust: S.trust - b.trust, news: S.news.slice(0, Math.max(0, S.news.length - b.news) + 2).map(n => n.title || n.t || n.h).slice(0, 6), done: Object.keys(W.done).length - b.done, apps: S.careerMy.apps - b.apps, faults: S.faults || []}), before);
  r.errors = page.errors.slice(0, 6);
} catch(e){ r.exception = String(e && e.stack || e); }
console.log(JSON.stringify(r, null, 1));
await close();
