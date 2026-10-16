// qa/tr3-hub.mjs: the title's Training button, its key path, the hub, a clean exit (BUILD-PLAN P3-B acceptance).
// Owner: P3-B (TR-3). Contract: TRAINING-SPEC 4 (a Training button matching the title; Training opens without
// starting or touching a career; a clear exit back to the main menu with full cleanup; the hub's seven categories) and
// 8 (nothing runs behind the hub; no leaks over repeated entries). Real input throughout (page.mouse, page.keyboard).
//
//   node qa/tr3-hub.mjs
import {career, report, expect} from "./lib.mjs";
import {trainLaunch, starts, v2Writes, trainWrites, careerSnapshot, careerDiff, trainKeysNow, titleReady, hubUp, hubState, enterByButton, exitByHub,
  trainState, clickReal, assertVisible, lockPointer, pressReal} from "./tr3b-lib.mjs";

const res = {title: null, click: null, keys: {}, tools: {}, cage: null, cats: [], frozen: null, exit: null, quit: null, cycles: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const CATS = ["Set Pieces", "Attacking", "Defending", "Ball Receiving and First Touch", "Match Scenarios", "Full Match", "Free Play"];

// Tab until the element is focused (real Tab presses); returns the number of presses, or -1
async function tabTo(page, sel, max = 20){
  for (let i = 1; i <= max; i++){
    await pressReal(page, "Tab");
    if (await page.evaluate(s => document.activeElement && document.activeElement.matches(s), sel)) return i;
  }
  return -1;
}

{
  // the title, a real click into Training, the hub's categories, Esc, keys in the cage, exit, then the title still
  // starts a career on a key
  const t = await trainLaunch({seed: 3});
  const {page} = t;
  try {
    await titleReady(page);
    res.title = await page.evaluate(() => {
      const b = document.querySelector(".ts-train"), p = document.querySelector(".ts-press"), cb = getComputedStyle(b), cp = getComputedStyle(p);
      const rb = b.getBoundingClientRect(), rp = p.getBoundingClientRect();
      return {text: b.textContent.trim(), keep: b.hasAttribute("data-keep"), fontB: cb.fontFamily, fontP: cp.fontFamily, sizeB: cb.fontSize, sizeP: cp.fontSize, upper: cb.textTransform,
        gap: rb.top - rp.bottom, centred: Math.abs((rb.left + rb.width/2) - (rp.left + rp.width/2))};
    });
    check(res.title.text === "Training" && res.title.keep, "the title has a Training button (data-keep)", res.title);
    check(res.title.fontB === res.title.fontP && res.title.sizeB === res.title.sizeP, "the Training button has the press line's font family and size", res.title);
    check(res.title.gap >= 0 && res.title.gap < 60 && res.title.centred < 4, "the Training button sits right under the press line", res.title);
    const before = await careerSnapshot(page);
    const v = await enterByButton(page);
    check(v.ok, "the Training button is visible and hit at its centre", v);
    res.click = Object.assign(await trainState(page), {starts: await starts(page), hub: await hubState(page)});
    check(res.click.S === null, "a real click enters Training with no career (S null)", res.click);
    check(res.click.starts.continue === 0 && res.click.starts.newGame === 0, "no career is started by the click", res.click.starts);
    check(res.click.hub.open && res.click.hub.h2 === "Training", "the hub is up on its categories", res.click.hub);
    // where you come in: the row of cones ahead of you (each within 50 degrees of where you look), so once the hub is
    // closed you see what opens it again
    res.spawnView = await page.evaluate(() => {
      const P = window.__life.P, f = {x: -Math.sin(P.yaw), z: -Math.cos(P.yaw)};
      return window.__trainCones.cones().map(c => { const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz) || 1; return Math.round(Math.acos(Math.max(-1, Math.min(1, (dx*f.x + dz*f.z)/d)))*180/Math.PI); });
    });
    check(res.spawnView.length === 7 && res.spawnView.every(a => a <= 50), "you come in facing the row of cones", res.spawnView);
    // each category opens (a real click), and Back comes back to the categories
    for (let i = 0; i < CATS.length; i++){
      const sel = `#sheetRoot .th-cat:nth-child(${i + 1})`;
      await clickReal(page, sel);
      await page.waitForFunction(n => ((document.querySelector("#sheetRoot .th h2") || {}).textContent || "") === n, CATS[i], {timeout: 10000}).catch(() => {});
      const open = await hubState(page);
      const dead = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot [data-th]")].filter(b => !["back"].includes(b.dataset.th)).length);
      await clickReal(page, '#sheetRoot [data-th="back"]');
      await page.waitForFunction(() => ((document.querySelector("#sheetRoot .th h2") || {}).textContent || "") === "Training", null, {timeout: 10000}).catch(() => {});
      const back = await hubState(page);
      const registered = await page.evaluate(i => window.__trainRun.scenariosOf(window.__trainRun.CATEGORIES[i].id).length, i);
      res.cats.push({name: CATS[i], opened: open.h2, buttons: dead, registered, back: back.h2});
    }
    check(res.cats.every(c => c.opened === c.name && c.back === "Training"), "each category opens and Back returns to the hub", res.cats);
    check(res.cats.every(c => c.buttons === 0 || c.registered > 0), "a category with nothing registered shows no buttons that do nothing", res.cats);
    // nothing runs behind the hub: 120 frames, no draw, no actor posed in full
    res.frozen = await page.evaluate(() => new Promise(r => {
      const L = window.__life, f0 = L.renderer().info.render.frame, s0 = L.sched.stats();
      let n = 0, tiers = [0, 0, 0, 0, 0];
      const tick = () => { const s = L.sched.stats(); for (let i = 0; i < 4; i++) tiers[i] += s.tiers[i]; if (++n < 120) window.__qa.realRAF(tick); else r({frames: L.renderer().info.render.frame - f0, presented: L.presented, tiers, actors: s0.counts.actors}); };
      window.__qa.realRAF(tick);
    }));
    check(res.frozen.frames === 0, "the hub up for 120 frames: nothing is drawn behind it", res.frozen);
    check(res.frozen.tiers.every(x => x === 0), "the hub up: no scheduler actor is animated (all state only)", res.frozen);
    // Esc closes the hub; then real keys in the cage never start the career
    await pressReal(page, "Escape");
    await page.waitForFunction(() => !(window.__trainHub && window.__trainHub.hubOpen()), null, {timeout: 10000});
    await lockPointer(page);
    await page.evaluate(() => { const n = document.getElementById("lifeNote"); if (n) n.textContent = ""; });
    for (const k of ["w", "e", "Space", "Enter", "a", "x", "b"]) await pressReal(page, k, {hold: 120});
    await page.waitForTimeout(300);
    res.cage = Object.assign(await trainState(page), {starts: await starts(page), writes: await trainWrites(page),
      note: await page.evaluate(() => (document.getElementById("lifeNote") || {}).textContent || "")});
    check(res.cage.S === null && res.cage.starts.continue === 0 && res.cage.starts.newGame === 0, "real W, E, Space and Enter in the cage start no career", res.cage);
    check(res.cage.zone === "cage" && res.cage.running, "the cage is up and running", res.cage);
    check(res.cage.mode === "trainsb" && !/flat|boxes/i.test(res.cage.note), "B in the cage says nothing about a flat (no career, no build mode)", res.cage);
    // between scenarios, the hub closed: a line says how to get it back, and Esc with the pointer free brings it back
    res.idle = await page.evaluate(() => { const e = document.getElementById("trainIdle"), q = e && e.getBoundingClientRect(); return {shown: !!e && !!q && q.width > 0 && q.bottom <= innerHeight, text: e ? e.textContent : ""}; });
    check(res.idle.shown && /Esc/.test(res.idle.text) && /cone/.test(res.idle.text), "with the hub closed, a line says how to get it back", res.idle);
    await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement, null, {timeout: 10000});
    await pressReal(page, "Escape");
    // (the sheet slides in on the next frame after the flag rises: wait for both)
    await page.waitForFunction(() => { const r = document.querySelector("#sheetRoot.open"); return !!r && r.dataset.kind === "trainhub" && window.__trainHub.hubOpen(); }, null, {timeout: 10000}).catch(() => {});
    res.reopen = Object.assign(await hubState(page), {idle: await page.evaluate(() => !!document.getElementById("trainIdle"))});
    check(res.reopen.open && res.reopen.h2 === "Training" && !res.reopen.idle, "Esc in the cage (the pointer free) opens the hub again", res.reopen);
    // out: the hub's Exit to title
    await exitByHub(page);
    await page.waitForTimeout(400);
    const after = await careerSnapshot(page);
    res.exit = Object.assign(await trainState(page), {diff: careerDiff(before, after), writes: await v2Writes(page), keys: await trainKeysNow(page),
      title: await page.evaluate(() => !!document.querySelector(".ts .ts-train"))});
    check(res.exit.classes.length === 0, "Exit to title leaves no mode-, fp- or drillview class", res.exit.classes);
    check(!res.exit.running, "Exit to title stops the world's loop", res.exit);
    check(res.exit.diff.length === 0 && res.exit.writes.length === 0, "the career keys were never written", res.exit);
    check(res.exit.keys.every(k => k === "freyaFootball.tipFS"), "the Training keys hold tipFS at most", res.exit.keys);
    check(res.exit.title, "the title is back", res.exit);
    // a real key on the title starts the career as before
    await titleReady(page);
    await page.mouse.move(5, 5);
    await pressReal(page, "k");
    await page.waitForTimeout(500);
    const s = await starts(page);
    res.exit.after = s;
    check(s.continue + s.newGame === 1, "after Exit, a key on the title starts the career as before", s);
  } catch(e){ res.errors.push("title/hub: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}

// the key path: Training by Tab and Enter, then by Tab and Space; full screen and Settings by Enter start no career
for (const key of ["Enter", "Space"]){
  const t = await trainLaunch({seed: 4});
  const {page} = t;
  try {
    await titleReady(page);
    const n = await tabTo(page, ".ts-train");
    await pressReal(page, key);
    await hubUp(page);
    const st = Object.assign(await trainState(page), {starts: await starts(page), tabs: n, writes: await v2Writes(page)});
    res.keys[key] = st;
    check(n > 0 && st.S === null && st.starts.continue === 0 && st.starts.newGame === 0 && !st.writes.length, `Tab to Training and ${key}: the hub, no career, no write`, st);
    await exitByHub(page);
  } catch(e){ res.errors.push(`keys ${key}: ` + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}
{
  const t = await trainLaunch({seed: 5});
  const {page} = t;
  try {
    await titleReady(page);
    await page.evaluate(() => { window.__qaFull = 0; const f = A.fullscreen; A.fullscreen = function(){ window.__qaFull++; return f.apply(this, arguments); }; });
    const nf = await tabTo(page, '.ts-tool[title="Full screen"]');
    await pressReal(page, "Enter");
    await page.waitForTimeout(300);
    const full = await page.evaluate(() => window.__qaFull);
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen());
    const ns = await tabTo(page, '.ts-tool[title="Settings"]');
    await pressReal(page, "Enter");
    await page.waitForFunction(() => { const r = document.querySelector("#sheetRoot"); return r && r.classList.contains("open") && r.dataset.kind === "settings0"; }, null, {timeout: 15000}).catch(() => {});
    const sheet = await hubState(page);
    res.tools = {nf, ns, full, sheet, starts: await starts(page)};
    check(nf > 0 && full === 1, "Enter on the full-screen button does its own action", res.tools);
    check(ns > 0 && sheet.open && sheet.kind === "settings0", "Enter on Settings opens the settings", res.tools);
    check(res.tools.starts.continue === 0 && res.tools.starts.newGame === 0, "neither starts a career", res.tools.starts);
  } catch(e){ res.errors.push("tools: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}

// Quit to title from a career stops the play clock
{
  const t = await trainLaunch({seed: 6});
  const {page} = t;
  try {
    await career(page, {zone: "home"});
    await page.evaluate(() => A.quit());
    await page.waitForFunction(() => !!document.querySelector(".ts"), null, {timeout: 30000});
    const a = await page.evaluate(() => S ? S.playMs : null);
    await page.waitForTimeout(10000);
    const b = await page.evaluate(() => S ? S.playMs : null);
    res.quit = {a, b};
    check(a === b, "Quit to title: S.playMs stays the same over 10 s on the title", res.quit);
  } catch(e){ res.errors.push("quit: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}

// 10 enter/exit cycles add no listener, no timer and no DOM node
{
  const t = await trainLaunch({seed: 7, count: true});
  const {page} = t;
  try {
    const counts = [];
    const measure = () => page.evaluate(() => ({listeners: window.__qaCount.listeners, intervals: window.__qaCount.intervals.size, timers: window.__qaCount.timers.size,
      nodes: document.getElementsByTagName("*").length, bodies: window.__life ? window.__life.ME && 0 : 0}));
    for (let i = 0; i < 11; i++){
      await enterByButton(page);
      await page.waitForTimeout(300);
      await exitByHub(page);
      await page.waitForTimeout(1200);        // (the sheet's own close timer, the title's entrance steps)
      await titleReady(page);
      await page.waitForTimeout(400);
      counts.push(await measure());
    }
    res.cycles = counts;
    const a = counts[0], b = counts[counts.length - 1];
    check(b.listeners - a.listeners === 0, "10 enter/exit cycles add 0 listeners", {first: a, last: b});
    check(b.intervals - a.intervals === 0 && b.timers - a.timers <= 0, "10 enter/exit cycles add 0 timers", {first: a, last: b});
    check(b.nodes - a.nodes === 0, "10 enter/exit cycles add 0 DOM nodes", {first: a, last: b});
    check(!(await v2Writes(page)).length, "no career write over the cycles", await v2Writes(page));
  } catch(e){ res.errors.push("cycles: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}

report("tr3-hub", res);
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr3-hub: pass");
