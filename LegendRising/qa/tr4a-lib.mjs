// qa/tr4a-lib.mjs: helpers the Phase 4 configuration tests of P4-A share (tr4-config, tr4-attredit): into Training by
// the title's button, a test scenario of every configuration type registered the way a scenario module registers one
// (its build is teams.js setupFromConfig), the configuration sheet opened from the hub by real clicks, and real clicks
// and typing inside the sheet (the sheet scrolls, so a row is brought into view first and then hit where it is drawn).
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN section 0 "QA conventions" (real input, visibility).
import {trainLaunch, enterByButton, clickReal, pressReal, hubUp, settle} from "./tr3b-lib.mjs";

export {trainLaunch, enterByButton, clickReal, pressReal, hubUp};
// the test scenarios: one per configuration type, in its category
export const QA_SCENARIOS = Object.freeze({attacking: "attacking", defending: "defending", receiving: "receiving", scenarios: "scenarios",
  setpieces: "setpieces", freekick: "setpieces", freeplay: "freeplay", fullmatch: "fullmatch"});

// a page in Training with the hub up and the test scenarios registered
export async function trainingWithScenarios(o = {}){
  const t = await trainLaunch(Object.assign({seed: 9}, o));
  t.errors = [];
  t.page.on("pageerror", e => t.errors.push("page: " + e.message));
  t.page.on("console", m => { if (m.type() === "error") t.errors.push("console: " + m.text()); });
  await enterByButton(t.page);
  await t.page.evaluate(async list => {
    const TM = await import("/js/life/train/teams.js");
    for (const [type, cat] of Object.entries(list)){
      window.__trainRun.registerScenario({id: "qa-" + type, category: cat, type, name: "Test " + type, desc: "A test scenario of type " + type,
        build: type === "fullmatch" ? () => ({}) : (cfg, env) => TM.setupFromConfig(type, cfg, env)});
    }
  }, QA_SCENARIOS);
  return t;
}

// the element brought into view in the sheet, checked to be what is drawn at its centre, then pressed for real
export async function clickIn(page, sel){
  let ok = "";
  for (let i = 0; i < 6 && ok !== "ok"; i++){
    if (i) await page.waitForTimeout(250);
    await settle(page, sel);
    ok = await hitTest(page, sel);
  }
  if (ok !== "ok") throw new Error(`clickIn ${sel}: ${ok}`);
  return clickReal(page, sel, {hold: 30});
}
async function hitTest(page, sel){
  return page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return "missing";
    el.scrollIntoView({block: "center", inline: "nearest"});
    const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return top && (top === el || el.contains(top)) ? "ok" : "covered by " + (top ? top.tagName + "." + top.className : "nothing");
  }, sel);
}
// a value typed into a field: a real click on it, everything in it selected, the text typed, Enter
export async function typeIn(page, sel, text, {enter = true} = {}){
  await clickIn(page, sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type(String(text), {delay: 15});
  if (enter) await pressReal(page, "Enter");
}

// the configuration sheet of a test scenario from the hub, by real clicks (the hub opened first if it is not up)
export async function openSheetFor(page, type){
  const up = await page.evaluate(() => window.__trainHub.hubOpen());
  if (!up) await page.evaluate(() => window.__trainHub.openHub());
  await hubUp(page);
  const cat = QA_SCENARIOS[type];
  const onCat = await page.evaluate(() => window.__trainHub.hubCategory());
  if (onCat !== cat){
    if (onCat) await clickIn(page, '#sheetRoot [data-th="back"]');
    await page.waitForFunction(() => !window.__trainHub.hubCategory(), null, {timeout: 10000});
    await clickIn(page, `#sheetRoot [data-th="cat"][data-id="${cat}"]`);
    await page.waitForFunction(c => window.__trainHub.hubCategory() === c, cat, {timeout: 10000});
  }
  await clickIn(page, `#sheetRoot [data-th="config"][data-id="qa-${type}"]`);
  await page.waitForFunction(() => window.__trainConfigUI && window.__trainConfigUI.configOpen() && !!document.querySelector("#trainCfg .tcfg"), null, {timeout: 10000});
}
// Start on the sheet: resolves once the scenario plays
export async function startFromSheet(page){
  await clickIn(page, '#trainCfg [data-cf="start"]');
  await page.waitForFunction(() => !!window.__trainRun.RUN.cur && !window.__trainConfigUI.configOpen(), null, {timeout: 20000});
}
// the scenario stopped (between cases) and its configuration back to the defaults
export async function stopAndReset(page, type){
  await page.evaluate(t => { window.__trainRun.stopScenario("config"); window.__trainHub.setScenarioConfig("qa-" + t, null); }, type);
}
// what the sheet shows: its field rows and the editor's sections and rows
export const sheetRows = page => page.evaluate(() => ({
  rows: [...document.querySelectorAll("#trainCfg [data-cf-row]")].map(e => e.dataset.cfRow),
  sections: [...document.querySelectorAll("#trainCfg [data-ae-sec]")].map(e => e.dataset.aeSec),
  attrs: [...document.querySelectorAll("#trainCfg [data-ae-row]")].map(e => e.dataset.aeRow),
  preview: (document.querySelector("#trainCfg [data-cf-preview]") || {}).textContent || ""
}));
