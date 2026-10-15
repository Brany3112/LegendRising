// qa/tr4-attredit.mjs: the attribute editor (TRAINING-SPEC 4) in the browser, by real clicks and typing.
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN P4-A acceptance "qa/tr4-attredit.mjs"; G0 decisions (e) and
// (f); lead confirmation of the presets (35, 55, 75, 99).
//   1. my attributes and the keeper's: every one shown has its real name, its current value, min 1 and max 99;
//   2. a value typed and Enter changes the configuration, and at the next start my agent's (or the keeper's) attribute
//      is that value;
//   3. out of range or bad input (0, 120, "abc") shows the clamped value or keeps the old one, never NaN;
//   4. reset on one attribute restores its default and leaves the others alone;
//   5. Low, Average, High and Max set every value to 35, 55, 75 and 99;
//   6. the derived values follow an edit and cannot be edited;
//   7. the attackers' and defenders' averages: after the start each side's mean skill, less each player's role profile,
//      is the average set, within 1;
//   8. typing in a field never reaches the game: CTRL.contact unchanged, no admin or pause card, no game key held.
//
//   node qa/tr4-attredit.mjs      exits 1 on any failed check; writes qa/out/tr4-attredit.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainWrites} from "./tr3b-lib.mjs";
import {trainingWithScenarios, clickIn, typeIn, openSheetFor, startFromSheet, stopAndReset, pressReal} from "./tr4a-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr4-attredit", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const inp = p => `#trainCfg [data-ae-in="${p}"]`;
const cfgNow = page => page.evaluate(() => window.__trainConfigUI.configNow());
const shownVal = (page, p) => page.evaluate(s => (document.querySelector(s) || {}).value, inp(p));

const t = await trainingWithScenarios({seed: 11});
const {page} = t;
try {
  await openSheetFor(page, "attacking");

  /* ---------- 1. names, values, ranges ---------- */
  const rows = await page.evaluate(() => [...document.querySelectorAll("#trainCfg [data-ae-row]")].map(r => ({path: r.dataset.aeRow, name: r.querySelector(".ae-name").textContent.trim(),
    value: r.querySelector(".ae-in").value, min: r.querySelector(".ae-min").textContent, max: r.querySelector(".ae-max").textContent, label: r.querySelector(".ae-in").getAttribute("aria-label")})));
  const real = await page.evaluate(async () => {
    const A = await import("/js/life/train/attredit.js"), F = await import("/js/life/football/attrs.js");
    const names = {};
    for (const s of SKILLS) names["me." + s[0]] = s[1];
    for (const k of F.gkEditKeys()) names["gk." + k] = A.GK_NAMES[k];
    return {names, skills: F.EDIT_SKILLS.map(k => "me." + k), gk: F.gkEditKeys().map(k => "gk." + k)};
  });
  const cfg0 = await cfgNow(page);
  const val = (c, p) => { const [a, b] = p.split("."); return b ? c[a][b] : c[a]; };
  const meRows = rows.filter(r => r.path.startsWith("me.")), gkRows = rows.filter(r => r.path.startsWith("gk."));
  const bad1 = meRows.concat(gkRows).filter(r => r.name !== real.names[r.path] || +r.value !== val(cfg0, r.path) || r.min !== "1" || r.max !== "99" || !/1 to 99/.test(r.label));
  check(meRows.map(r => r.path).join() === real.skills.join() && gkRows.map(r => r.path).join() === real.gk.join() && bad1.length === 0,
    "my 15 attributes and the keeper's set: each with its real name, its current value, min 1 and max 99", {me: meRows.length, gk: gkRows.length, bad: bad1.slice(0, 3)});
  check(!rows.some(r => r.path === "gk.distrib"), "distribution is not offered while it changes nothing (GK_DISTRIB_LIVE false)");

  /* ---------- 8 (first half). the game's state before any typing ---------- */
  const game0 = await page.evaluate(async () => { const K = await import("/js/life/football/control.js"); return {contact: K.CTRL.contact, keys: Object.entries(window.__life.keys).filter(([, v]) => v).map(([k]) => k)}; });

  /* ---------- 2 and 3. typing ---------- */
  await typeIn(page, inp("me.passacc"), "83");
  await typeIn(page, inp("me.sprintSpeed"), "77");
  await typeIn(page, inp("gk.reflex"), "88");
  let c = await cfgNow(page);
  const typedOk = c.me.passacc === 83 && c.me.sprintSpeed === 77 && c.gk.reflex === 88 && await shownVal(page, "me.passacc") === "83";
  await typeIn(page, inp("me.curve"), "0");
  const v0 = {shown: await shownVal(page, "me.curve"), cfg: (await cfgNow(page)).me.curve};
  await typeIn(page, inp("me.curve"), "120");
  const v120 = {shown: await shownVal(page, "me.curve"), cfg: (await cfgNow(page)).me.curve};
  await typeIn(page, inp("me.curve"), "abc");
  const vabc = {shown: await shownVal(page, "me.curve"), cfg: (await cfgNow(page)).me.curve};
  await typeIn(page, inp("me.heading"), "");
  const vEmpty = {shown: await shownVal(page, "me.heading"), cfg: (await cfgNow(page)).me.heading};
  check(v0.shown === "1" && v0.cfg === 1 && v120.shown === "99" && v120.cfg === 99 && vabc.shown === "99" && vabc.cfg === 99 && vEmpty.cfg === cfg0.me.heading && !/NaN/.test(JSON.stringify(await cfgNow(page))),
    "0 shows 1, 120 shows 99, \"abc\" and an empty field keep the old value, never NaN", {v0, v120, vabc, vEmpty});

  /* ---------- 8. typing never reached the game ---------- */
  await typeIn(page, inp("me.stamina"), "2");
  await typeIn(page, inp("me.stamina"), "3");
  await typeIn(page, inp("me.stamina"), "1");
  const game1 = await page.evaluate(async () => {
    const K = await import("/js/life/football/control.js"), r = document.getElementById("sheetRoot");
    return {contact: K.CTRL.contact, keys: Object.entries(window.__life.keys).filter(([, v]) => v).map(([k]) => k), sheet: r && r.classList.contains("open") ? r.dataset.kind : null,
      admin: !!document.querySelector("#adminPanel:not([hidden]), .admin-panel.open, #trainAdmin.open"), pause: !!document.querySelector("#trainPause, .train-pause.open"), cfgOpen: window.__trainConfigUI.configOpen()};
  });
  check(game1.contact === game0.contact && game1.keys.length === 0 && !game1.sheet && !game1.admin && !game1.pause && game1.cfgOpen,
    "typing digits and letters in the fields never reaches the game: CTRL.contact unchanged, no key held, no admin, pause or other card", {game0, game1});

  /* ---------- 6. derived values ---------- */
  const der = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#trainCfg [data-ae-d]")].map(s => [s.dataset.aeD, +s.querySelector("b").textContent])));
  const d0 = await der();
  await typeIn(page, inp("me.dribbling"), "95");
  const d1 = await der();
  // a click on a derived value and some typing: nothing to edit there
  await clickIn(page, '#trainCfg [data-ae-d="ctrl"] b');
  await page.keyboard.type("12");
  const d2 = await der();
  const editable = await page.evaluate(() => [...document.querySelectorAll("#trainCfg .ae-derived *")].some(e => e.tagName === "INPUT" || e.tagName === "SELECT" || e.isContentEditable));
  check(d1.ctrl > d0.ctrl && d1.agility > d0.agility && d1.balance > d0.balance && JSON.stringify(d1) === JSON.stringify(d2) && !editable,
    "the derived values (ball control, agility, balance) follow an edit of dribbling and cannot be edited", {d0, d1, d2, editable});

  /* ---------- 4. reset one ---------- */
  c = await cfgNow(page);
  await clickIn(page, '#trainCfg [data-ae="reset"][data-k="me.passacc"]');
  const cR = await cfgNow(page), dflt = await page.evaluate(async () => (await import("/js/life/train/config.js")).defaults("attacking"));
  const others = Object.keys(c.me).filter(k => k !== "passacc").every(k => cR.me[k] === c.me[k]);
  check(cR.me.passacc === dflt.me.passacc && others && cR.gk.reflex === 88 && await shownVal(page, "me.passacc") === String(dflt.me.passacc),
    "reset on pass accuracy brings it back to its default and leaves the others alone", {was: c.me.passacc, now: cR.me.passacc, others});

  /* ---------- 5. presets ---------- */
  const pre = {};
  for (const [lvl, v] of [["low", 35], ["average", 55], ["high", 75], ["max", 99]]){
    await clickIn(page, `#trainCfg [data-ae="preset"][data-set="me"][data-level="${lvl}"]`);
    await clickIn(page, `#trainCfg [data-ae="preset"][data-set="gk"][data-level="${lvl}"]`);
    const cc = await cfgNow(page);
    const shown = await page.evaluate(() => [...document.querySelectorAll('#trainCfg [data-ae-in^="me."], #trainCfg [data-ae-in^="gk."]')].map(e => +e.value));
    pre[lvl] = Object.values(cc.me).every(x => x === v) && ["reflex", "dive", "handling", "posit"].every(k => cc.gk[k] === v) && shown.every(x => x === v);
  }
  check(Object.values(pre).every(Boolean), "Low, Average, High and Max set every value to 35, 55, 75 and 99", pre);

  /* ---------- 2 (second half). the values reach the agents at the start ---------- */
  await typeIn(page, inp("me.passacc"), "83");
  await typeIn(page, inp("me.sprintSpeed"), "77");
  await typeIn(page, inp("gk.reflex"), "88");
  await typeIn(page, inp("gk.posit"), "41");
  await startFromSheet(page);
  const at = await page.evaluate(() => { const ms = window.__trainRun.RUN.ms, me = ms.agents[ms.me], g = ms.agents[ms.gks[1 - me.team]];
    return {passacc: me.at.passacc, sprintSpeed: me.at.sprintSpeed, reflex: g && g.at.gk ? g.at.gk.reflex : null, posit: g && g.at.gk ? g.at.gk.posit : null, prmSprint: me.prm.sprint}; });
  check(typedOk && at.passacc === 83 && at.sprintSpeed === 77 && at.reflex === 88 && at.posit === 41, "typed values reach the agents at the start: my at.passacc and at.sprintSpeed, the keeper's at.gk.reflex and at.gk.posit", at);
  await stopAndReset(page, "attacking");

  /* ---------- 7. the averages ---------- */
  await openSheetFor(page, "attacking");
  await clickIn(page, '#trainCfg [data-cf="set"][data-k="attackers"][data-v="n:6"]');
  await clickIn(page, '#trainCfg [data-cf="set"][data-k="defenders"][data-v="n:6"]');
  await typeIn(page, inp("attAvg"), "80");
  await typeIn(page, inp("defAvg"), "30");
  const varLine = await page.evaluate(() => (document.querySelector("#trainCfg .ae-var") || {}).textContent || "");
  await startFromSheet(page);
  const avg = await page.evaluate(async () => {
    const F = await import("/js/life/football/attrs.js"), ms = window.__trainRun.RUN.ms, me = ms.agents[ms.me];
    const side = t => { const L = ms.agents.filter(a => a.role === "player" && a.team === t && !a.isMe && !a.isGK); let s = 0, n = 0;
      for (const a of L){ const P = F.PROFILE[a.arch === "AM" ? "AM" : a.arch] || F.PROFILE.CM; for (const k of F.SKILL_KEYS){ s += a.at[k] - P[k]; n++; } } return {n: L.length, mean: n ? s/n : NaN}; };
    return {att: side(me.team), def: side(1 - me.team)};
  });
  check(avg.att.n === 5 && avg.def.n === 6 && Math.abs(avg.att.mean - 80) <= 1 && Math.abs(avg.def.mean - 30) <= 1 && /Players vary by role, plus up to 6 either way/.test(varLine),
    "attackers' average 80 and defenders' 30: each side's mean skill less the role profiles is the average set, within 1; the sheet says how they vary", {avg, varLine});
  await stopAndReset(page, "attacking");

  const w = await trainWrites(page);
  check(w.length === 0, "nothing wrote the career while Training ran", w.slice(0, 3));
  check(t.errors.length === 0, "no console or page errors", t.errors.slice(0, 5));
} catch(e){
  check(false, "the run finished", String(e && e.stack || e));
} finally {
  fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
  fs.writeFileSync(path.join(ROOT, "qa/out/tr4-attredit.json"), JSON.stringify(res, null, 1));
  await t.browser.close();
}
console.log(res.ok ? "tr4-attredit: all checks passed" : "tr4-attredit: FAILED");
process.exit(res.ok ? 0 : 1);
