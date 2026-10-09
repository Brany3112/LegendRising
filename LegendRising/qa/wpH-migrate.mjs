// qa/wpH-migrate.mjs: the first day's state from older saves (DESIGN 3.7.7 migration table, 1.7 S.onb).
// Owner: WP-H (Stage 1).
//
//   node qa/wpH-migrate.mjs          exits 1 on any failed check, console error or page error; writes qa/out/wpH-migrate.json
//
// Every recorded old save (qa/golden/oldsave-*.json) is read through resume() and the onboarding migration (main.js
// onbMigrate), and so is each row of the table built from a fresh career: all flags true or no flags at all (done),
// the intro not seen but signed (the film again, creation and offers skipped), the intro seen and the flat not (the
// steps by state, the old slam kept), the flat done the old way (look-only steps seen, the bulb, the post and the
// ball checked by state), the old training-centre stage. Run twice, the migration changes nothing more.
import fs from "node:fs";
import path from "node:path";
import {launch, report, ROOT, CAREER_AT} from "./lib.mjs";

const out = {checks: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 240) : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 5});
try {
  const DIR = path.join(ROOT, "qa", "golden");
  for (const f of fs.readdirSync(DIR).filter(f => /^oldsave-.+\.json$/.test(f)).sort()){
    const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const r = await page.evaluate(d => {
      const data = deserial(JSON.stringify(d.save));
      const old = {flags: data.flags ? Object.assign({}, data.flags) : null, onb: data.onb ? Object.assign({}, data.onb) : null};
      resume(data); onbMigrate();
      const once = JSON.stringify(S.onb); onbMigrate();
      return {old, onb: S.onb, flags: Object.assign({}, S.flags), again: JSON.stringify(S.onb) === once, tutDone: S.tutDone, replay: "replay" in S, excused: S.life && S.life.att ? S.life.att.excused : null};
    }, doc);
    const all = r.old.flags && Object.values(r.old.flags).every(Boolean);
    if (!r.old.flags || all) check(`${f}: every flag done means done`, r.onb.v === 2 && r.onb.step === "done" && r.again && r.tutDone && !r.replay, r);
    else if (r.old.flags.FirstTimeIntroductionCompleted && !r.old.flags.ApartmentTutorialCompleted)
      check(`${f}: intro seen, flat not: the steps by state from H1, the old slam kept`, r.onb.v === 2 && r.onb.step === "H1" && !!r.onb.seen.slam === !!(r.old.onb && r.old.onb.slam) && r.flags.GameplayTutorialCompleted === false && r.excused === true && r.again, r);
    else check(`${f}: migrated to v2`, r.onb.v === 2 && r.again, r);
  }
  // the rows of the table, on a fresh career
  const rows = await page.evaluate(now => {
    const real = Date.now; Date.now = () => now;
    try {
      careerShell({home: false});
      applyCreation({name: "Old Timer", number: 7, pos: "ST", pref: "ST", foot: "Left", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30});
      joinClub(S.offerSet.list[0]); S.offerSet = null;
    } finally { Date.now = real; }
    const base = JSON.stringify(S), run = (flags, onb) => { S = JSON.parse(base); W = S.W; S.flags = flags; if (onb === undefined) delete S.onb; else S.onb = onb; S.life.att = S.life.att || {}; resume(S); onbMigrate(); return {onb: S.onb, flags: Object.assign({}, S.flags), excused: S.life.att.excused}; };
    const F = (a, b, c, d) => ({CharacterCreated: true, FirstTimeIntroductionCompleted: a, ApartmentTutorialCompleted: b, GameplayTutorialCompleted: c, TrainingCenterTutorialCompleted: d});
    return {
      none: run(undefined, undefined),
      all: run(F(true, true, true, true), {stage: "done"}),
      introNot: run(F(false, false, false, false), {stage: "intro"}),
      flatNot: run(F(true, false, false, false), {stage: "plate", slam: true}),
      flatTour: run(F(true, false, false, false), {stage: "tour", slam: true, fixed: true}),
      flatDone: run(F(true, true, false, false), {stage: "bus", slam: true, fixed: true}),
      centre: run(F(true, true, true, false), {stage: "centre", slam: true, fixed: true}),
      gameplayOnly: run(F(true, true, true, false), {stage: "guide"})
    };
  }, CAREER_AT);
  check("no flags at all (a save from before them): done", rows.none.onb.step === "done" && rows.none.flags.ApartmentTutorialCompleted, rows.none);
  check("all five flags: done", rows.all.onb.step === "done", rows.all);
  check("intro not seen but signed: the film again", rows.introNot.onb.step === "intro" && rows.introNot.flags.CharacterCreated, rows.introNot);
  check("intro seen, flat not, slammed: H1 on by state, the slam kept (H7 seen)", rows.flatNot.onb.step === "H1" && rows.flatNot.onb.seen.slam && rows.flatNot.onb.seen.H7 && !rows.flatNot.onb.seen.H8, rows.flatNot);
  check("the old tour ran: H2, H12, H13 seen; the number back on: H8 and H10 too", ["H2", "H12", "H13", "H8", "H10"].every(k => rows.flatTour.onb.seen[k]), rows.flatTour);
  check("flat done the old way: look-only steps seen, the bulb (H3), the post (H11), the ball (H17) and H19 to H21 by state",
    ["H1", "H2", "H7", "H8", "H10", "H12", "H13", "H14", "H15", "H16", "H18"].every(k => rows.flatDone.onb.seen[k]) && !["H3", "H4", "H5", "H6", "H9", "H11", "H17", "H19", "H20", "H21"].some(k => rows.flatDone.onb.seen[k]), rows.flatDone);
  // (no home step comes back: step "done" turns the runner, the slow clock and the bus gate off; the training centre's
  // flag stays false, which is what the training centre's chapters G1 to G9 pick a career up by)
  check("old training-centre stage: the flat is done, no home step comes back, the training centre's chapters still to come",
    rows.centre.flags.ApartmentTutorialCompleted && rows.centre.onb.step === "done" && !rows.centre.flags.TrainingCenterTutorialCompleted
      && Array.from({length: 21}, (_, i) => "H" + (i + 1)).every(k => rows.centre.onb.seen[k]) && rows.centre.excused === true, rows.centre);
  check("GameplayTutorialCompleted is false unless every flag was true", !rows.centre.flags.GameplayTutorialCompleted && !rows.gameplayOnly.flags.GameplayTutorialCompleted, {centre: rows.centre.flags, g: rows.gameplayOnly.flags});
  check("the day a migrated onboarding is in is excused", rows.flatDone.excused === true && rows.flatNot.excused === true, {flatDone: rows.flatDone.excused, flatNot: rows.flatNot.excused});
} catch(e){ out.error = String(e && e.stack || e); console.log(out.error); }
finally {
  out.errors = page.errors.slice();
  out.ok = !out.error && !out.errors.length && out.checks.every(c => c.ok);
  if (out.errors.length) console.log("errors:\n  " + out.errors.join("\n  "));
  report("wpH-migrate", out);
  await close();
}
console.log(out.ok ? "wpH-migrate: pass" : "wpH-migrate: FAIL");
process.exit(out.ok ? 0 : 1);
