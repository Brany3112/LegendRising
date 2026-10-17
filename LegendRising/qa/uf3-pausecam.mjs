// qa/uf3-pausecam.mjs: the Training pause card's Camera section (Esc in Free Play): the football camera and its four
// sliders are there, change the settings live (real clicks and a real slider drag), and are kept on this device for
// every match and the career (freyaFootball.ctrl).
//   node qa/uf3-pausecam.mjs          exits 1 on any failed check
import {report} from "./lib.mjs";
import {trainLaunch, enterByButton, clickReal, lockPointer, frames, pressReal} from "./tr4b-lib.mjs";

const res = {checks: [], errors: []};
const check = (ok, what, detail) => { res.checks.push({ok: !!ok, what, detail}); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(detail)}`); };
const t = await trainLaunch({seed: 3});
const {page} = t;
page.on("pageerror", e => res.errors.push(String(e)));
try {
  await enterByButton(page);
  await clickReal(page, '#sheetRoot [data-th="cat"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot [data-th="start"][data-id="freeplay"]'), null, {timeout: 10000});
  await clickReal(page, '#sheetRoot [data-th="start"][data-id="freeplay"]');
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && R.cur.id === "freeplay" && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000});
  await lockPointer(page); await frames(page, 10);
  await pressReal(page, "Escape");
  await page.waitForFunction(() => !!document.querySelector('.fp-qcam'), null, {timeout: 10000});
  const shown = await page.evaluate(() => ({third: !!document.querySelector('.fp-qcam [data-q="cam:third"]'), first: !!document.querySelector('.fp-qcam [data-q="cam:first"]'),
    sliders: [...document.querySelectorAll('.fp-qcam [data-cam]')].map(e => e.dataset.cam)}));
  check(shown.third && shown.first && shown.sliders.join(",") === "tpDist,tpHeight,tpSide,tpShake", "Esc in Free Play shows the Camera section: third or first person and the four sliders", shown);
  // drag the distance slider with the real mouse to its right end
  const box = await page.evaluate(() => { const r = document.querySelector('.fp-qcam [data-cam="tpDist"]').getBoundingClientRect(); return {x: r.left, y: r.top + r.height/2, w: r.width}; });
  await page.mouse.move(box.x + box.w*.5, box.y); await page.mouse.down(); await page.mouse.move(box.x + box.w + 30, box.y, {steps: 8}); await page.mouse.up();
  await frames(page, 4);
  const after = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); return {dist: C.SET.tpDist, label: document.querySelector('.fp-qcam .fp-set-v[data-k="tpDist"]').textContent, stored: JSON.parse(localStorage.getItem("freyaFootball.ctrl") || "{}").tpDist}; });
  check(after.dist === 8 && after.stored === 8 && /8\.0 m/.test(after.label), "dragging the distance slider sets it live, shows it and keeps it on this device", after);
  // the camera itself moved back behind the card (the render goes on while paused)
  await clickReal(page, '.fp-qcam [data-q="cam:first"]');
  await frames(page, 4);
  const first = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); return {cam: C.SET.footCam, sliders: document.querySelectorAll('.fp-qcam [data-cam]').length}; });
  check(first.cam === "first" && first.sliders === 0, "First person from the card sets the football camera and hides the third-person sliders", first);
  await clickReal(page, '.fp-qcam [data-q="cam:third"]');
  await frames(page, 2);
  const back = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); C.saveSet({tpDist: 4}); return C.SET.footCam; });
  check(back === "third", "Third person from the card puts it back", back);
  check(!res.errors.length, "no page errors", res.errors);
} catch(e){ check(false, "the run", String(e && e.stack || e)); }
await t.close();
report("uf3-pausecam", res);
process.exit(res.checks.every(c => c.ok) ? 0 : 1);
