// qa/oldsave.mjs: the old-save round trip. A save from the release before the rework loads, migrates, plays a day,
// saves and loads again, and what no migration and no day is meant to touch stays exactly as it was.
// Owner: WP-0B (DESIGN 4.11 "Old-save round trip", 1.7 save data and migrations, 2.0 definition of done).
//
// For each qa/golden/oldsave-*.json (recorded by I0 with qa/record-oldsaves.mjs, from the real game):
//   1. the save is put in localStorage as that release left it and the page is opened again: the title screen shows
//      its career card, and Continue (clicked for real) loads it, which runs every migration of resume() (1.7);
//   2. the world presents frames, with no console error and no page error;
//   3. a day is played: a night's sleep into the next morning, the way the game's own day does it (the career saved in
//      the middle of the first-day introduction instead keeps playing its introduction for a while);
//   4. the game saves (saveNow) and the page is opened again: the save read back through resume() gives the very state
//      that was saved, field for field (resume is idempotent), and Continue brings the world up again;
//   5. at every step the untouched fields hash the same as in the old save: who you are, your skills, your record, your
//      club and the world's clubs and leagues, exactly; your awards, history, trophies, ratings, milestones, purchases
//      and the world's results only ever grow. Text the 1.7 migration rewrites (a spaced em dash in an award name
//      becoming ": ", a lone dash in the history becoming EMPTY_CELL) compares equal either way.
//
//   node qa/oldsave.mjs [fixture]     exits 1 on any failure; writes qa/out/oldsave.json
import fs from "node:fs";
import path from "node:path";
import {launch, report, ROOT} from "./lib.mjs";

const DIR = path.join(ROOT, "qa", "golden");
const only = process.argv[2];
const FIX = fs.readdirSync(DIR).filter(f => /^oldsave-.+\.json$/.test(f)).sort().map(f => f.slice(8, -5)).filter(n => !only || n === only);
if (!FIX.length){ console.log(`oldsave: no fixture ${only ? `"${only}"` : ""} in qa/golden`); process.exit(1); }

// The fields no migration and no ordinary day may change. Runs in node on the old save and in the page on the live
// state, so it is one self-contained function. exact: must be equal; grows: may only gain entries.
function stable(S){
  const pick = (o, ks) => { const r = {}; if (o) for (const k of ks) if (o[k] !== undefined) r[k] = o[k]; return r; };
  const D = String.fromCharCode(0x2014), N = String.fromCharCode(0x2013);
  // the 1.7 text migration: a spaced em dash becomes ": " in names and titles, a lone dash placeholder EMPTY_CELL
  const name = s => typeof s === "string" ? s.split(" " + D + " ").join(": ") : s;
  const cell = s => s === D || s === N ? "(empty)" : s;
  const W = S.W || {};
  // the A1.1 migration (career.js resume): an old Pace becomes Acceleration and Sprint Speed, nudged by position
  const skills = Object.assign({}, S.skills || {});
  if (skills.pace != null && skills.acceleration == null){
    const pl = S.player || {}, slot = pl.slot || pl.teamPos || "", full = /^(LB|RB|LWB|RWB)$/.test(slot);
    const n = pl.pos === "W" || full ? 1 : pl.pos === "ST" || (pl.pos === "DF" && !full) ? -1 : 0, c = v => Math.max(1, Math.min(99, v));
    skills.acceleration = c(Math.round(skills.pace + 3*n)); skills.sprintSpeed = c(Math.round(skills.pace - 3*n)); delete skills.pace;
  }
  return {
    exact: {
      v: S.v, cid: S.cid, startSeason: S.startSeason, owner: S.owner,
      player: pick(S.player, ["name", "number", "pos", "pref", "teamPos", "foot", "nat", "age", "look"]),
      skills, seasonMy: S.seasonMy, careerMy: S.careerMy, cards: S.cards, ban: S.ban, lastMatch: S.lastMatch,
      meId: S.meId, rivalId: S.rivalId, speed: S.speed, contract: pick(S.contract, ["club", "wage", "years", "role"]),
      wardrobe: S.wardrobe, items: S.items, staff: S.staff, phone: S.phone, apps: S.apps,
      world: {season: W.season, clubs: (W.clubs || []).map(c => c.nm), leagues: Object.keys(W.leagues || {}).sort().map(k => [k, W.leagues[k].nm])}
    },
    grows: {
      awards: (S.awards || []).map(a => Object.assign({}, a, {name: name(a.name)})),
      history: (S.history || []).map(h => Object.assign({}, h, {lg: cell(h.lg)})),
      trophies: S.trophies || [], ratings: S.ratings || [], miles: S.miles || {}, purchases: S.purchases || [],
      done: W.done || {}
    }
  };
}
// every path where b differs from a; with grows, b may add entries (array items at the end, object keys)
function diffs(a, b, p = "", grows = false, out = []){
  if (out.length >= 25 || Object.is(a, b)) return out;
  const show = v => { const s = JSON.stringify(v); return s === undefined ? "undefined" : s.length > 80 ? s.slice(0, 77) + "..." : s; };
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)){ out.push(`${p || "."}: ${show(a)} -> ${show(b)}`); return out; }
  if (Array.isArray(a)){
    if (grows ? b.length < a.length : b.length !== a.length) out.push(`${p}: ${a.length} items -> ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffs(a[i], b[i], `${p}[${i}]`, grows, out);
    return out;
  }
  for (const k of Object.keys(a)) if (!(k in b)) out.push(`${p}.${k}: gone`); else diffs(a[k], b[k], `${p}.${k}`, grows, out);
  if (!grows) for (const k of Object.keys(b)) if (!(k in a)) out.push(`${p}.${k}: new`);
  return out;
}
// a short hash of a value, for the report (FNV-1a over its JSON)
function hash(v){ const s = JSON.stringify(v); let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

const ready = () => typeof newCareer === "function" && typeof window.startLife === "function" && !!window.__life;
const inWorld = n => document.body.classList.contains("life") && window.__life && window.__life.LIFE.running && window.__life.presented >= n;
const out = {fixtures: [], ok: false};

for (const name of FIX){
  const t0 = Date.now(), doc = JSON.parse(fs.readFileSync(path.join(DIR, `oldsave-${name}.json`), "utf8"));
  const base = stable(doc.save.S), r = {fixture: name, about: doc.about, build: doc.build, checks: [], hashes: {}, errors: []};
  const check = (what, list) => { r.checks.push({what, ok: !list.length, diffs: list}); console.log(`  ${list.length ? "FAIL" : "ok  "} ${what}${list.length ? "\n         " + list.join("\n         ") : ""}`); };
  const compare = (when, P) => { check(`${when}: untouched fields as in the old save`, [...diffs(base.exact, P.exact), ...diffs(base.grows, P.grows, "", true)]); r.hashes[when] = hash(P.exact); };
  console.log(`oldsave ${name}: ${doc.about}`);
  r.hashes.old = hash(base.exact);
  const {page, close} = await launch({gfx: "low", seed: 7});
  try {
    // 1. the old save in storage, the title screen, Continue
    await page.evaluate(d => { localStorage.setItem(d.key, JSON.stringify(d.save)); localStorage.setItem(d.metaKey, JSON.stringify(d.meta)); }, doc);
    await page.reload();
    await page.waitForFunction(ready, null, {timeout: 60000});
    const card = await page.locator(".slot-main .slot-name").first().textContent({timeout: 30000});
    check("the title screen shows the career", card && card.includes(doc.meta.name) ? [] : [`card reads ${JSON.stringify(card)}`]);
    await page.locator(".slot-main").first().click();
    await page.waitForFunction(inWorld, 3, {timeout: 180000});
    const loaded = await page.evaluate(`(${stable})(S)`);
    compare("loaded", loaded);
    const day0 = await page.evaluate(() => ({day: S.life.day, zone: window.__life.LIFE.zone}));
    // 2 and 3. the world runs, then a day
    if (name === "onboarding"){
      const n = await page.evaluate(() => window.__life.presented);
      await page.waitForFunction(inWorld, n + 30, {timeout: 180000});
    } else {
      await page.evaluate(() => { S.life.min = 23*60; sleepNight(2); startNewDay(); window.__life.enterZone("home", "bed"); });
      const n = await page.evaluate(() => window.__life.presented);
      await page.waitForFunction(inWorld, n + 10, {timeout: 180000});
    }
    const played = await page.evaluate(`(${stable})(S)`);
    const day1 = await page.evaluate(() => ({day: S.life.day, zone: window.__life.LIFE.zone}));
    if (name !== "onboarding") check("a day went by", day1.day === day0.day + 1 ? [] : [`day ${day0.day} -> ${day1.day}`]);
    compare(name === "onboarding" ? "after playing on" : "after a day", played);
    // 4. saved and read back
    const saved = await page.evaluate(() => { saveNow(); return localStorage.getItem(slotKey(SLOT)); });
    await page.reload();
    await page.waitForFunction(ready, null, {timeout: 60000});
    const back = await page.evaluate(() => { const d = load(); resume(d); return serial(); });
    check("the save reads back into the state that was saved", diffs(JSON.parse(saved), JSON.parse(back)));
    r.hashes.saved = hash(JSON.parse(saved).S); r.hashes.reread = hash(JSON.parse(back).S);
    await page.locator(".slot-main").first().click();
    await page.waitForFunction(inWorld, 3, {timeout: 180000});
    const again = await page.evaluate(`(${stable})(S)`);
    compare("loaded again", again);
    const day2 = await page.evaluate(() => ({day: S.life.day, min: S.life.min, zone: window.__life.LIFE.zone}));
    check("the world comes back on the saved day", day2.day === day1.day ? [] : [`day ${day1.day} -> ${day2.day}`]);
    r.days = [day0, day1, day2];
  } catch(e){ r.errors.push("oldsave: " + (e && e.stack || e)); }
  finally {
    r.errors.push(...page.errors);
    r.ok = !r.errors.length && r.checks.every(c => c.ok);
    r.ms = Date.now() - t0;
    out.fixtures.push(r);
    await close();
  }
  if (r.errors.length) console.log("  errors:\n    " + r.errors.join("\n    "));
  console.log(`oldsave ${name}: ${r.ok ? "pass" : "FAIL"} in ${(r.ms/1000).toFixed(1)} s (untouched fields ${Object.entries(r.hashes).filter(([k]) => !["saved", "reread"].includes(k)).map(([k, v]) => `${k} ${v}`).join(", ")})`);
}
out.ok = out.fixtures.every(f => f.ok);
report("oldsave", out);
console.log(out.ok ? "oldsave: pass" : "oldsave: FAIL");
process.exit(out.ok ? 0 : 1);
