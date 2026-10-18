// qa/tr4-play.mjs: one Training session played the player's way, end to end, with screenshots (the TR-4 integration
// check). Into Training by the title's button; the hub; a scenario's configuration sheet; an attribute typed in; the
// pitch changed; the setup saved as a preset from the sheet's Presets button; Start (the HUD names the preset); a
// restart with Backspace; Esc and the pause card's Return to Configuration (the sheet comes back with the setup that
// was playing); another pitch started; Replay Last brings the preset's pitch back; then the hub's own Presets button
// loads the preset and starts it.
// Owner: the TR-4 integrator. Contract: BUILD-PLAN Phase 4 (P4-A and P4-B acceptance, joined up), section 0 QA
// conventions (real input).
//
//   node qa/tr4-play.mjs      exits 1 on any failed check; screenshots in qa/out/tr4-play-*.png
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {snap} from "./lib.mjs";
import {trainWrites, lockPointer, settle, assertVisible} from "./tr3b-lib.mjs";
import {cardUp, frames} from "./tr4b-lib.mjs";
import {trainingWithScenarios, clickIn, typeIn, openSheetFor, startFromSheet, pressReal, clickReal, hubUp} from "./tr4a-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr4-play", checks: [], shots: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value !== undefined ? ": " + JSON.stringify(value) : ""}`);
};
const shot = async (page, n) => { res.shots.push(await snap(page, "tr4-play-" + n)); };
const set = (k, v) => `#trainCfg [data-cf="set"][data-k="${k}"][data-v="s:${v}"]`;
const running = page => page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching; }, null, {timeout: 120000});
const now = page => page.evaluate(() => {
  const R = window.__trainRun, run = R.RUN.cur, el = document.querySelector(".thud-preset");
  return {id: run && run.id, pitch: run && run.config && run.config.pitch, kind: run && run.kind, preset: el ? el.textContent : null};
});

const t = await trainingWithScenarios({seed: 12});
const page = t.page;
try {
  await hubUp(page);
  await shot(page, "1-hub");

  /* ---------- configure: an attribute and the pitch ---------- */
  await openSheetFor(page, "attacking");
  const attr = await page.evaluate(() => { const e = document.querySelector('#trainCfg [data-ae-in^="me."]'); return e && e.dataset.aeIn; });
  check(!!attr, "the sheet shows my attributes", attr);
  await typeIn(page, `#trainCfg [data-ae-in="${attr}"]`, "88");
  await clickIn(page, set("pitch", "half"));
  const cfg1 = await page.evaluate(() => window.__trainConfigUI.configNow());
  const v1 = attr.split(".").reduce((o, k) => o && o[k], cfg1);
  check(v1 === 88 && cfg1.pitch === "half", "the typed attribute and the pitch are in the configuration", {v: v1, pitch: cfg1.pitch});
  await shot(page, "2-config");

  /* ---------- a preset from the sheet ---------- */
  await clickIn(page, '#trainCfg [data-cf="presets"]');
  await page.waitForFunction(() => window.__trainPresetUI.presetsOpen() && !!document.querySelector("#sheetRoot.open #tpName"), null, {timeout: 15000});
  await typeIn(page, "#tpName", "Half pitch two v two", {enter: false});
  await clickIn(page, '#sheetRoot [data-tp="save"]');
  await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length === 1, null, {timeout: 10000});
  const meta = await page.evaluate(() => document.querySelector("#sheetRoot .tp-meta").textContent);
  check(/Half/.test(meta) && /\d v \d/.test(meta), "the Load list row says the counts and the pitch", meta);
  await shot(page, "3-presets");
  await clickIn(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => window.__trainConfigUI.configOpen() && !window.__trainPresetUI.presetsOpen(), null, {timeout: 15000});
  const cfg2 = await page.evaluate(() => window.__trainConfigUI.configNow());
  check(JSON.stringify(cfg2) === JSON.stringify(cfg1), "Done brings the sheet back with the same setup", null);

  /* ---------- play it ---------- */
  await startFromSheet(page);
  await running(page);
  await frames(page, 20);
  const p1 = await now(page);
  check(p1.id === "qa-attacking" && p1.pitch === "half", "it plays on the half pitch", p1);
  check(/Half pitch two v two/.test(p1.preset || ""), "the Training HUD names the preset", p1.preset);
  const myAt = await page.evaluate(k => { const T = window.__trainRun.RUN.cur.T, me = T.ms.agents[T.ms.me]; return k.split(".").slice(1).reduce((o, x) => o && o[x], me.at); }, attr);
  check(myAt === 88, "my agent has the typed attribute", myAt);
  check(p1.kind === "half", "the cage is the half pitch", p1.kind);
  await shot(page, "4-playing-half");

  /* ---------- restart with Backspace ---------- */
  const lock = await lockPointer(page);
  check(!!lock, "the pointer locks on the game", lock);
  // the digest at the moment each reset is done (the runner tells its listeners at the end of every start and restart)
  await page.evaluate(async () => { const RM = await import("/js/life/train/runner.js"), R = window.__trainRun; window.__qaD = []; window.__qaOff = RM.onRunner(() => { if (R.RUN.cur) window.__qaD.push(R.digest().hash); }); });
  await page.evaluate(() => window.__trainRun.restart());
  await frames(page, 2);
  const d0 = await page.evaluate(() => window.__qaD[window.__qaD.length - 1]);
  for (let i = 0; i < 3; i++){ await page.keyboard.down("KeyW"); await frames(page, 30); await page.keyboard.up("KeyW"); }
  await pressReal(page, "Backspace");
  await frames(page, 2);
  const dAfter = await page.evaluate(() => { window.__qaOff(); return window.__qaD[window.__qaD.length - 1]; });
  const nD = await page.evaluate(() => window.__qaD.length);
  check(!!d0 && nD >= 2 && dAfter === d0, "Backspace after running about restarts to the same state", {d0, dAfter, nD});

  /* ---------- the pause card, Return to Configuration ---------- */
  await pressReal(page, "Escape");
  await cardUp(page);
  await settle(page, '#fpOverlay [data-q="config"]');
  const vis = await assertVisible(page, '#fpOverlay [data-q="config"]');
  check(vis && vis.ok, "the pause card's Return to Configuration is drawn and visible", vis && vis.why);
  await shot(page, "5-pause");
  await clickReal(page, '#fpOverlay [data-q="config"]');
  await page.waitForFunction(() => window.__trainConfigUI.configOpen(), null, {timeout: 15000});
  const cfg3 = await page.evaluate(() => window.__trainConfigUI.configNow());
  check(!!cfg3 && cfg3.pitch === "half" && JSON.stringify(cfg3) === JSON.stringify(cfg1), "Return to Configuration opens the sheet with the setup that was playing", cfg3 && cfg3.pitch);
  await clickIn(page, set("pitch", "full"));
  await startFromSheet(page);
  await running(page);
  await frames(page, 20);
  const p2 = await now(page);
  check(p2.pitch === "full", "the full pitch plays after the change", p2);
  check(!/Half pitch two v two/.test(p2.preset || ""), "a changed setup is no longer named after the preset", p2.preset);
  await shot(page, "6-playing-full");

  /* ---------- Replay Last ---------- */
  await lockPointer(page);
  await pressReal(page, "Escape");
  await cardUp(page);
  await clickReal(page, '#fpOverlay [data-q="replay"]');
  await running(page);
  await frames(page, 20);
  const p3 = await now(page);
  check(p3.pitch === "half", "Replay Last plays the half pitch setup again", p3);
  await shot(page, "7-replay");

  /* ---------- the hub's Presets button ---------- */
  await lockPointer(page);
  await pressReal(page, "Escape");
  await cardUp(page);
  await clickReal(page, '#fpOverlay [data-q="hub"]');
  await hubUp(page);
  await clickIn(page, '#sheetRoot [data-th="presets"][data-id="qa-attacking"]');
  await page.waitForFunction(() => window.__trainPresetUI.presetsOpen() && !!document.querySelector('#sheetRoot.open [data-tp="load"]'), null, {timeout: 15000});
  await clickIn(page, '#sheetRoot [data-tp="load"]');
  await running(page);
  await frames(page, 20);
  const p4 = await now(page);
  check(p4.pitch === "half" && /Half pitch two v two/.test(p4.preset || ""), "Load from the hub starts the preset, named on the HUD", p4);
  await shot(page, "8-loaded");

  const w = await trainWrites(page);
  check(w.length === 0, "nothing wrote the career", w.slice(0, 3));
  check(t.errors.length === 0, "no console or page errors", t.errors.slice(0, 5));
} catch(e){
  check(false, "the session finished", String(e && e.stack || e));
  try { await shot(page, "x-failure"); } catch(e2){}
} finally {
  fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
  fs.writeFileSync(path.join(ROOT, "qa/out/tr4-play.json"), JSON.stringify(res, null, 1));
  await t.browser.close();
}
console.log(res.ok ? "tr4-play: all checks passed" : "tr4-play: FAILED");
process.exit(res.ok ? 0 : 1);
