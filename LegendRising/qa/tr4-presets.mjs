// qa/tr4-presets.mjs: the presets sheet by real clicks and typing.
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance "qa/tr4-presets.mjs"; TRAINING-SPEC 4 (Save with a name,
// Load from a list with enough information, Edit and overwrite with confirmation, Save as new, Delete with
// confirmation; kept across sessions, separated by type, the setup only) and 1 (the career is never written).
//
// The sheet is opened through presetui.js openPresets (the configuration sheet's Presets button is P4-A's, which calls
// the same function); everything in it is pressed and typed for real. Configurations are made by P4-A's config.js
// validate, so what is stored is what the configuration sheet would hand in.
//
//   node qa/tr4-presets.mjs
import {report, expect, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, v2Writes, careerSnapshot, careerDiff, clickReal, assertVisible, pressReal, closeHubReal, registerTestScenarios, trainKeysNow} from "./tr4b-lib.mjs";

const res = {saved: null, reload: null, overwrite: null, saveAs: null, list: null, del: null, keys: null, typing: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const TYPE = "qa3v3", TNAME = "Test three against three";

// a configuration as the configuration sheet hands it in (config.js validate), with these fields
// (integrator) team-mates and opponents on, so the counts set are the counts played (config.js counts(): a side switched
// off has nobody but you on it, and the Load list says what will be on the pitch)
const cfgOf = (page, o) => page.evaluate(async ([t, o]) => { const C = await import("/js/life/train/config.js"); return C.validate(t, Object.assign(C.defaults(t), {mates: true, opps: true}, o)); }, [TYPE, o]);
const open = (page, config, extra = {}) => page.evaluate(([t, n, c, x]) => window.__trainPresetUI.openPresets(Object.assign({type: t, typeName: n, config: c, scenarioId: "qa-3v3"}, x)), [TYPE, TNAME, config, extra]);
const sheetUp = page => page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout: 15000});
const stored = page => page.evaluate(k => { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }, "freyaFootball.trainPresets");
const rows = page => page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({id: r.dataset.row, name: r.querySelector(".tp-name").textContent, meta: r.querySelector(".tp-meta").textContent})));
async function typeInto(page, sel, text){
  await clickReal(page, sel);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text, {delay: 15});
}
const confirmUp = page => page.waitForFunction(() => { const r = document.getElementById("tutRoot"); return !!r && r.classList.contains("on") && !!r.querySelector(".confirm #cfYes"); }, null, {timeout: 10000});
const confirmGone = page => page.waitForFunction(() => { const r = document.getElementById("tutRoot"); return !r || !r.classList.contains("on"); }, null, {timeout: 10000});
async function into(page){
  await enterByButton(page);
  await closeHubReal(page);
  await registerTestScenarios(page);
}

let t = await trainLaunch({seed: 5});
let {page} = t;
try {
  await into(page);
  const careerBefore = await careerSnapshot(page);
  // ---------- Save, with a name, by real typing ----------
  const C1 = await cfgOf(page, {attackers: 3, defenders: 2, keeper: true, pitch: "half"});
  await open(page, C1);
  await sheetUp(page);
  const vis = await assertVisible(page, '#sheetRoot [data-tp="save"]');
  check(vis.ok, "the presets sheet is up and its Save button visible", vis);
  // typing "1" in the name field reaches nobody but the field
  const k0 = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); return {contact: C.CTRL.contact, mode: window.__life.modes.mode(), hub: window.__trainHub.hubOpen(), run: !!window.__trainRun.RUN.cur}; });
  await clickReal(page, "#tpName");
  await page.keyboard.type("1");
  const k1 = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); return {contact: C.CTRL.contact, mode: window.__life.modes.mode(), hub: window.__trainHub.hubOpen(), run: !!window.__trainRun.RUN.cur, value: document.getElementById("tpName").value, sheet: window.__trainPresetUI.presetsOpen(), quick: !!(window.__trainQuick && window.__trainQuick.quickIsOpen())}; });
  res.typing = {k0, k1};
  check(k1.value === "1" && k1.contact === k0.contact && k1.mode === k0.mode && !k1.hub && !k1.run && k1.sheet && !k1.quick, "typing 1 in the name field changes neither the contact nor anything else", res.typing);
  await typeInto(page, "#tpName", "Wing drill");
  await clickReal(page, '#sheetRoot [data-tp="save"]');
  await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length === 1, null, {timeout: 10000});
  const r1 = await rows(page), s1 = await stored(page);
  res.saved = {rows: r1, stored: s1 && s1.byType[TYPE] && s1.byType[TYPE].map(r => r.name)};
  check(r1.length === 1 && r1[0].name === "Wing drill" && s1.byType[TYPE][0].name === "Wing drill", "Save (real typing and click) keeps a named preset", res.saved);
  check(JSON.stringify(s1.byType[TYPE][0].config) === JSON.stringify(C1), "what is stored is the configuration only, as handed in", null);
  await snap(page, "tr4-presets-sheet");
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});

  // ---------- a reload of the page, then Load: the same configuration, and the Training HUD names it ----------
  await page.reload();
  await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
  await into(page);
  await open(page, null);
  await sheetUp(page);
  const r2 = await rows(page);
  await clickReal(page, `#sheetRoot [data-row="${r2[0].id}"] [data-tp="load"]`);
  await page.waitForFunction(() => !!window.__trainRun.RUN.cur, null, {timeout: 60000});
  await page.waitForFunction(() => !!document.getElementById("trainHud"), null, {timeout: 10000});
  const ld = await page.evaluate(() => ({config: window.__trainRun.RUN.cur.config, preset: window.__trainRun.RUN.cur.preset, hud: document.getElementById("trainHud").textContent.replace(/\s+/g, " ")}));
  res.reload = {rows: r2, preset: ld.preset, hud: ld.hud, same: JSON.stringify(ld.config) === JSON.stringify(C1)};
  check(r2.length === 1 && r2[0].name === "Wing drill", "after a reload the preset is still there", r2);
  check(res.reload.same, "Load starts the scenario with exactly the saved configuration", res.reload);
  check(/Preset: Wing drill/.test(ld.hud) && ld.preset && ld.preset.name === "Wing drill", "the Training HUD shows the preset's name", ld.hud);
  await snap(page, "tr4-presets-loaded");
  await page.evaluate(() => { window.__trainRun.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });

  // ---------- Overwrite asks first; No keeps it ----------
  const C2 = await cfgOf(page, {attackers: 4, defenders: 3, keeper: false, pitch: "half"});
  await open(page, C2);
  await sheetUp(page);
  const id1 = (await rows(page))[0].id;
  const before = JSON.stringify((await stored(page)).byType[TYPE].find(r => r.id === id1));
  await clickReal(page, `#sheetRoot [data-row="${id1}"] [data-tp="over"]`);
  await confirmUp(page);
  const cv = await assertVisible(page, "#cfYes");
  await clickReal(page, "#tutRoot .confirm .btn.ghost");
  await confirmGone(page);
  const afterNo = JSON.stringify((await stored(page)).byType[TYPE].find(r => r.id === id1));
  await clickReal(page, `#sheetRoot [data-row="${id1}"] [data-tp="over"]`);
  await confirmUp(page);
  await clickReal(page, "#cfYes");
  await confirmGone(page);
  const afterYes = (await stored(page)).byType[TYPE].find(r => r.id === id1);
  res.overwrite = {asked: cv.ok, keptOnNo: afterNo === before, changed: JSON.stringify(afterYes.config) === JSON.stringify(C2), name: afterYes.name, updated: [JSON.parse(before).updated, afterYes.updated]};
  check(cv.ok && res.overwrite.keptOnNo, "Overwrite asks first, and No keeps the old preset exactly", res.overwrite);
  check(res.overwrite.changed && afterYes.name === "Wing drill" && afterYes.updated > JSON.parse(before).updated, "Yes replaces its configuration with the one you have, keeping its name", res.overwrite);

  // ---------- Save as new, by real click and typing ----------
  const C3 = await cfgOf(page, {attackers: 2, defenders: 1, keeper: true, pitch: "full"});
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
  await open(page, C3);
  await sheetUp(page);
  const src0 = JSON.stringify((await stored(page)).byType[TYPE].find(r => r.id === id1));
  await clickReal(page, `#sheetRoot [data-row="${id1}"] [data-tp="as"]`);
  await page.waitForFunction(() => !!document.getElementById("tpAsName"), null, {timeout: 10000});
  await typeInto(page, "#tpAsName", "Wing drill two");
  await clickReal(page, `#sheetRoot [data-tp="ascopy"]`);
  await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length === 2, null, {timeout: 10000});
  const st3 = (await stored(page)).byType[TYPE], src1 = JSON.stringify(st3.find(r => r.id === id1)), cp = st3.find(r => r.id !== id1);
  const loads = await page.evaluate(([a, b]) => ({a: window.__trainPresets.load(a).config, b: window.__trainPresets.load(b).config}), [id1, cp.id]);
  res.saveAs = {copy: cp && {name: cp.name, id: cp.id}, srcSame: src0 === src1, own: JSON.stringify(loads.a) === JSON.stringify(C2) && JSON.stringify(loads.b) === JSON.stringify(C3)};
  check(cp && cp.name === "Wing drill two" && cp.id !== id1, "Save as new makes a second preset with the new name", res.saveAs);
  check(res.saveAs.srcSame, "the original's configuration and updated time are unchanged", res.saveAs);
  check(res.saveAs.own, "loading each gives its own configuration", res.saveAs);

  // ---------- the Load list: three presets of different counts, keeper and pitch ----------
  for (const [name, o] of [["Two v one full", {attackers: 2, defenders: 1, keeper: false, pitch: "full"}], ["Five v four goal", {attackers: 5, defenders: 4, keeper: true, pitch: "onegoal"}], ["One v one half", {attackers: 1, defenders: 1, keeper: false, pitch: "half", mates: false}]]){
    const c = await cfgOf(page, o);
    await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
    await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
    await open(page, c);
    await sheetUp(page);
    await typeInto(page, "#tpName", name);
    await pressReal(page, "Enter");
    await page.waitForFunction(n => [...document.querySelectorAll("#sheetRoot .tp-name")].some(e => e.textContent === n), name, {timeout: 10000});
  }
  const shown = await rows(page), st4 = (await stored(page)).byType[TYPE];
  const expectText = await page.evaluate(([list, tn]) => list.map(r => {
    const c = r.config, pn = {full: "Full", half: "Half", onegoal: "One goal"}[c.pitch];
    return {id: r.id, name: r.name, updated: r.updated, meta: [tn, `${c.attackers} v ${c.defenders + (c.wall | 0)}`, c.keeper ? "Keeper on" : "Keeper off", pn, `Updated ${window.__trainPresetUI.whenText(r.updated)}`].join(" · ")};
  }).sort((a, b) => b.updated - a.updated), [st4, TNAME]);
  res.list = {shown, expectText};
  check(shown.length === 5 && shown.every((r, i) => r.id === expectText[i].id), "the list is newest first", shown.map(r => r.name));
  check(shown.every((r, i) => r.name === expectText[i].name && r.meta === expectText[i].meta), "each row shows the name, the type, the counts (3 v 2), keeper on or off, the pitch and the updated time, as stored", res.list);
  const metas = Object.fromEntries(shown.map(r => [r.name, r.meta]));
  check(/ 2 v 1 · Keeper off · Full · /.test(metas["Two v one full"]) && / 5 v 4 · Keeper on · One goal · /.test(metas["Five v four goal"]) && / 1 v 1 · Keeper off · Half · /.test(metas["One v one half"]), "the three new rows read their own counts, keeper and pitch", metas);

  // ---------- Delete asks first ----------
  const gone = shown.find(r => r.name === "One v one half").id;
  await clickReal(page, `#sheetRoot [data-row="${gone}"] [data-tp="del"]`);
  await confirmUp(page);
  await clickReal(page, "#tutRoot .confirm .btn.ghost");
  await confirmGone(page);
  const keptOnNo = (await stored(page)).byType[TYPE].some(r => r.id === gone);
  await clickReal(page, `#sheetRoot [data-row="${gone}"] [data-tp="del"]`);
  await confirmUp(page);
  await clickReal(page, "#cfYes");
  await confirmGone(page);
  await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length === 4, null, {timeout: 10000});
  const st5 = (await stored(page)).byType[TYPE];
  res.del = {keptOnNo, removed: !st5.some(r => r.id === gone), left: st5.length};
  check(keptOnNo && res.del.removed && st5.length === 4, "Delete asks first (No keeps it), Yes takes it away", res.del);
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});

  // ---------- the storage: Training's own key holds exactly the presets; the career untouched ----------
  const keys = await trainKeysNow(page), all = await stored(page);
  const names = Object.entries(all.byType).flatMap(([ty, l]) => l.map(r => ty + ":" + r.name)).sort();
  res.keys = {keys, names, v: all.v};
  check(keys.includes("freyaFootball.trainPresets") && names.join("|") === ["Five v four goal", "Two v one full", "Wing drill", "Wing drill two"].map(n => TYPE + ":" + n).sort().join("|"), "freyaFootball.trainPresets holds exactly the saved presets", res.keys);
  check(Object.values(all.byType).every(l => l.every(r => Object.keys(r).sort().join() === "config,created,id,name,updated")), "each holds the setup only (id, name, created, updated, config)", null);
  check(!(await trainWrites(page)).length && !(await v2Writes(page)).length, "the write spy logs no freyaFootball.v2 write", await v2Writes(page));
  const careerAfter = await careerSnapshot(page);
  check(careerDiff(careerBefore, careerAfter).length === 0, "the career diff is empty", careerDiff(careerBefore, careerAfter));
} catch(e){ res.errors.push("tr4-presets: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors.map(x => "page: " + x));
  report("tr4-presets", res);
  await t.close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr4-presets: pass");
