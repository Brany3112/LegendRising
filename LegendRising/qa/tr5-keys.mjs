// qa/tr5-keys.mjs: the training key layer (js/life/train/keys.js) by real keys.
// Owner: P5-A (Training Mode Phase 5). Contract: BUILD-PLAN P5-A acceptance "qa/tr5-keys.mjs" and the Phase 5 contract
// "P5-A emits the window event train:admin with {open}"; TRAINING-SPEC 0 (the admin panel on Numpad 1, event.code
// Numpad1 and not Digit1, plus Ctrl+Shift+1 on a laptop; never while typing; Training Mode only). INF-6, ball-12.
//
// The panel itself is P5-B's (admin.js listens for train:admin); this layer's word is the event, so the test listens
// for it the way the panel does.
//   - the Training HUD shows the admin hint (Numpad 1, or Ctrl+Shift+1) in every Training scenario (Free Play and a
//     scenario registered through the runner) and on the cage's idle line, and never outside Training (the title, a
//     career's life, a career match);
//   - Numpad1 toggles the panel (open, then closed), and CTRL.contact is unchanged;
//   - Digit1 alone sets Low contact and does not open it;
//   - Ctrl+Shift+1 opens it (and closes it);
//   - neither opens it with the preset name field focused;
//   - nothing opens it in a career's life or a career match (the same page, after Training was left);
//   - the career untouched (write spy).
//
//   node qa/tr5-keys.mjs          exits 1 on any failed check; writes qa/out/tr5-keys.json
import {report, career} from "./lib.mjs";
import {trainLaunch, enterByButton, exitByHub, trainWrites, clickReal, pressReal, lockPointer, closeHubReal, registerTestScenarios, frames, hubUp} from "./tr4b-lib.mjs";

const res = {steps: {}, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 400)}`); };

const t = await trainLaunch({seed: 7});
const {page} = t;
const pageErr = [];
page.on("pageerror", e => pageErr.push(String(e)));
page.on("console", m => { if (m.type() === "error") pageErr.push(m.text()); });

// every train:admin the window gets, from the start of the page (an init script: the panel's own listener would see
// exactly these)
// (the key layer's own events only: since Phase 5 is merged the panel answers each with its own {open, from:"admin"},
// which says it did open or close; that answer is checked as window.trainAdminOpen() below)
await t.context.addInitScript(() => { window.__adm = []; addEventListener("train:admin", e => { if (!e.detail || e.detail.from !== "admin") window.__adm.push(Object.assign({}, e.detail)); }); });
const panelOpen = () => page.evaluate(() => typeof window.trainAdminOpen === "function" ? !!window.trainAdminOpen() : null);
await page.reload();
await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
const adm = () => page.evaluate(() => window.__adm.length);
const contact = () => page.evaluate(async () => (await import("/js/life/football/control.js")).CTRL.contact);
const hintNow = () => page.evaluate(() => {
  const hud = document.getElementById("trainHud"), idle = document.getElementById("trainIdle"), txt = e => e ? e.textContent.replace(/\s+/g, " ") : "";
  const has = s => /Numpad 1/.test(s) && /Ctrl\+Shift\+1/.test(s);
  return {hud: has(txt(hud)), idle: has(txt(idle)), any: has(document.body.innerText || ""), hudOn: !!hud, idleOn: !!idle};
});
async function ctrlShift1(){
  await page.keyboard.down("Control"); await page.keyboard.down("Shift");
  await pressReal(page, "Digit1");
  await page.keyboard.up("Shift"); await page.keyboard.up("Control");
}

try {
  // ---------- the title: no hint ----------
  res.steps.title = await hintNow();
  check(!res.steps.title.any, "on the title there is no admin hint", res.steps.title);

  // ---------- into Training ----------
  await enterByButton(page);
  await closeHubReal(page);
  await frames(page, 4);
  res.steps.idle = await hintNow();
  check(res.steps.idle.idle, "in the cage between scenarios the idle line gives the admin keys", res.steps.idle);

  // ---------- Free Play: the hint, Numpad1, Digit1, Ctrl+Shift+1 ----------
  await page.evaluate(() => window.__trainRun.startScenario("freeplay", window.__trainHub.scenarioConfig("freeplay")));
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!document.getElementById("trainHud"); }, null, {timeout: 120000});
  check(!!(await lockPointer(page)), "the pointer is locked on the game", null);
  await frames(page, 6);
  res.steps.freeHint = await hintNow();
  check(res.steps.freeHint.hud, "Free Play: the Training HUD shows the admin hint (Numpad 1, or Ctrl+Shift+1)", res.steps.freeHint);

  const c0 = await contact(), a0 = await adm();
  await pressReal(page, "Numpad1");
  await frames(page, 2);
  const s1 = await page.evaluate(() => window.__adm.slice(-1)[0]), c1 = await contact(), p1 = await panelOpen();
  await pressReal(page, "Numpad1");
  await frames(page, 2);
  const s2 = await page.evaluate(() => window.__adm.slice(-1)[0]), c2 = await contact(), a2 = await adm(), p2 = await panelOpen();
  res.steps.numpad = {c0, c1, c2, s1, s2, n: a2 - a0, p1, p2};
  check(a2 - a0 === 2 && s1.open === true && s2.open === false && p1 !== false && p2 !== true, "Numpad1 toggles the admin panel: open, then closed (train:admin {open}, and the panel with it)", res.steps.numpad);
  check(c1 === c0 && c2 === c0, "Numpad1 leaves CTRL.contact as it was", res.steps.numpad);

  // Digit1 alone: Low contact, no panel
  await pressReal(page, "Digit3");
  const c3 = await contact(), a3 = await adm();
  await pressReal(page, "Digit1");
  await frames(page, 2);
  const c4 = await contact(), a4 = await adm();
  res.steps.digit1 = {before: c3, after: c4, events: a4 - a3};
  check(c3 === 1 && c4 === -1 && a4 === a3, "Digit1 alone sets Low contact and does not open the panel", res.steps.digit1);

  // Ctrl+Shift+1: open, then closed; the contact unchanged
  await ctrlShift1();
  await frames(page, 2);
  const s5 = await page.evaluate(() => window.__adm.slice(-1)[0]), a5 = await adm(), c5 = await contact();
  await ctrlShift1();
  await frames(page, 2);
  const s6 = await page.evaluate(() => window.__adm.slice(-1)[0]), a6 = await adm();
  const mod = await page.evaluate(async () => (await import("/js/life/football/control.js")).MOD.on);
  res.steps.ctrlShift = {s5, s6, events: a6 - a4, contact: c5, modAfter: mod};
  check(a5 - a4 === 1 && s5.open === true && a6 - a5 === 1 && s6.open === false && c5 === -1, "Ctrl+Shift+1 opens the panel (and again closes it), the contact unchanged", res.steps.ctrlShift);
  check(mod === false, "the modifier guard (MOD.on) is let go on the key-up as always", res.steps.ctrlShift);

  // ---------- a scenario registered through the runner: the hint there too ----------
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));
  await registerTestScenarios(page);
  await page.evaluate(() => window.__trainRun.startScenario("qa-3v3", {}));
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && R.cur.id === "qa-3v3" && !R.switching && !!document.getElementById("trainHud"); }, null, {timeout: 120000});
  await lockPointer(page);
  await frames(page, 4);
  res.steps.otherHint = await hintNow();
  const a7 = await adm();
  await pressReal(page, "Numpad1");
  await frames(page, 2);
  const s8 = await page.evaluate(() => window.__adm.slice(-1)[0]), a8 = await adm();
  await pressReal(page, "Numpad1");
  check(res.steps.otherHint.hud, "another Training scenario: the HUD shows the admin hint too", res.steps.otherHint);
  check(a8 - a7 === 1 && s8.open === true, "Numpad1 opens it in any Training scenario", {s8, n: a8 - a7});
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));

  // ---------- typing: the preset name field focused ----------
  await page.evaluate(() => window.__trainHub.openHub("freeplay"));
  await hubUp(page);
  await clickReal(page, '#sheetRoot [data-th="presets"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open #tpName"), null, {timeout: 15000});
  await clickReal(page, "#tpName");
  const a9 = await adm();
  await pressReal(page, "Numpad1");
  await ctrlShift1();
  await frames(page, 2);
  const a10 = await adm(), typed = await page.evaluate(() => ({value: document.getElementById("tpName").value, focus: document.activeElement && document.activeElement.id}));
  res.steps.typing = {events: a10 - a9, typed};
  check(a10 === a9 && typed.focus === "tpName", "with the preset name field focused neither Numpad1 nor Ctrl+Shift+1 opens the panel", res.steps.typing);
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
  const writes = await trainWrites(page);

  // ---------- out of Training: life and a career match ----------
  await page.evaluate(() => window.__trainHub.openHub());
  await exitByHub(page);
  const on = await page.evaluate(() => window.__trainKeys.on);
  check(on === false, "leaving Training takes the key layer off", {on});
  res.steps.titleAgain = await hintNow();
  await career(page, {zone: "ground", min: 12*60});
  await lockPointer(page);
  await frames(page, 4);
  const a11 = await adm(), c11 = await contact();
  await pressReal(page, "Numpad1");
  await ctrlShift1();
  await frames(page, 4);
  const a12 = await adm(), life = await hintNow();
  res.steps.life = {events: a12 - a11, hint: life, contact: [c11, await contact()]};
  check(a12 === a11 && !life.any && !life.hudOn && !life.idleOn, "in a career's life nothing opens it and there is no admin hint", res.steps.life);
  await page.evaluate(() => window.__fp.enter("test:11v11", {}));
  await page.waitForTimeout(1500);
  await lockPointer(page);
  await frames(page, 30);
  const a13 = await adm();
  await pressReal(page, "Numpad1");
  await ctrlShift1();
  await frames(page, 4);
  const a14 = await adm(), match = await hintNow();
  res.steps.match = {events: a14 - a13, hint: match, state: await page.evaluate(() => window.__fp.state)};
  check(a14 === a13 && !match.any, "in a career match nothing opens it and there is no admin hint", res.steps.match);
  await page.evaluate(() => window.__fp.exit());

  res.writes = writes;
  check(writes.length === 0, "the career save is never written while Training runs (write spy)", writes);
  check(pageErr.length === 0, "no console or page errors", pageErr);
} catch(e){
  res.errors.push("crash: " + (e && e.stack || e));
  console.log("FAIL crash", e);
} finally {
  await t.close();
}
res.ok = res.errors.length === 0;
report("tr5-keys", res);
console.log(res.ok ? "tr5-keys: pass" : `tr5-keys: ${res.errors.length} failed`);
process.exit(res.ok ? 0 : 1);
