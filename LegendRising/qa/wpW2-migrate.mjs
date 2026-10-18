// qa/wpW2-migrate.mjs: Motivation and the coach styles in older saves (addendum A1.8; DESIGN 1.7 migration chain).
// Owner: WP-W2 (stage P2c).
//
//   node qa/wpW2-migrate.mjs        exits 1 on any failed check, console error or page error; writes qa/out/wpW2-migrate.json
//
// Every recorded old save (qa/golden/oldsave-*.json) is read in the page through resume(): Motivation starts at 60 with
// an empty run and no reason, every club has a coach style and it is the one its name gives, and resume run again
// changes nothing. A career's Motivation, its reason and the styles then go through saveNow, load and resume unchanged.
import fs from "node:fs";
import path from "node:path";
import {launch, report, ROOT, career} from "./lib.mjs";

const out = {checks: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 240) : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 3});
try {
  const DIR = path.join(ROOT, "qa", "golden");
  for (const f of fs.readdirSync(DIR).filter(f => /^oldsave-.+\.json$/.test(f)).sort()){
    const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const r = await page.evaluate(d => {
      const data = deserial(JSON.stringify(d.save));
      const had = {m: data.player ? data.player.motivation : undefined, styled: data.W.clubs.filter(c => c && c.coachStyle).length};
      resume(data);
      const first = {m: S.player.motivation, why: S.player.motivWhy === undefined, run: Object.assign({}, S.player.motivRun),
        styles: W.clubs.map(c => c.coachStyle), byName: W.clubs.every(c => coachStyleOf({nm: c.nm}) === c.coachStyle)};
      const snap = JSON.stringify({m: S.player.motivation, run: S.player.motivRun, st: first.styles});
      resume(S);
      return {had, first, again: JSON.stringify({m: S.player.motivation, run: S.player.motivRun, st: W.clubs.map(c => c.coachStyle)}) === snap,
        timing: motivationTiming(), rec: motivationRecovery(), mine: S.meId >= 0 && myClub() ? coachStyle() : "none"};
    }, doc);
    check(`${f}: had no Motivation and no coach styles`, r.had.m === undefined && r.had.styled === 0, r.had);
    check(`${f}: Motivation 60, no reason yet, an empty run`, r.first.m === 60 && r.first.why && r.first.run.loss === 0 && r.first.run.bench === 0, r.first);
    check(`${f}: every club has a coach style, the one its name gives`, r.first.styles.every(s => ["attacking", "pressing", "technical"].includes(s)) && r.first.byName, r.first.styles.slice(0, 6));
    check(`${f}: resume again changes nothing`, r.again);
    check(`${f}: at 60 the timing and recovery multipliers are exactly 1`, r.timing === 1 && r.rec === 1, {timing: r.timing, rec: r.rec});
    check(`${f}: your club's style reads back`, r.mine === "none" || ["attacking", "pressing", "technical"].includes(r.mine), r.mine);
  }
  // a career's Motivation through a real save and load
  await career(page, {zone: "ground", frames: 2});
  const rt = await page.evaluate(() => {
    motivationAdd(9.5, "A test reason that should come back.");
    S.player.motivRun.loss = 2; S.player.motivRun.bench = 1;
    const before = {m: S.player.motivation, why: S.player.motivWhy, run: Object.assign({}, S.player.motivRun), styles: W.clubs.map(c => c.coachStyle)};
    saveNow();
    resume(load());
    return {before, after: {m: S.player.motivation, why: S.player.motivWhy, run: Object.assign({}, S.player.motivRun), styles: W.clubs.map(c => c.coachStyle)}};
  });
  check("a new career starts at 60 (and the reason moved it to 69.5)", rt.before.m === 69.5, rt.before.m);
  check("Motivation, its reason and its runs survive a save and load", JSON.stringify(rt.before) === JSON.stringify(rt.after), {before: rt.before.why, after: rt.after.why});
} catch(e){ out.error = String(e && e.stack || e); console.log(out.error); }
finally {
  out.errors = page.errors.slice();
  out.ok = !out.error && !out.errors.length && out.checks.every(c => c.ok);
  if (out.errors.length) console.log("errors:\n  " + out.errors.join("\n  "));
  report("wpW2-migrate", out);
  await close();
}
console.log(out.ok ? "wpW2-migrate: pass" : "wpW2-migrate: FAIL");
process.exit(out.ok ? 0 : 1);
