// qa/wpL-layout.mjs: the drill's HUD at phone, small and desktop sizes: the drill card, a drill's result, a centre
// notice that came with it (a level up from the same shot) and a note, all up at once, never on top of each other or
// of the clock, the need bars, the money and the compass. Owner: WP-L (Stage P3, css/style.css; P3a fix round 2).
//
// For each size: a career at the training ground at 11:00, the finishing drill started (the card up while the squad and
// the keeper walk over: the compass steps aside, a centre notice keeps clear of the card), then in the drill's own view
// a result, a centre notice and a note together. The rectangles of every HUD piece are read from the page; two that
// overlap by more than 4 px both ways fail. (The aim's power ring in the middle of the screen is left out: it is the
// crosshair, and a note on a short landscape screen has always sat across it.)
//
//   QA_PORT=8765 node qa/wpL-layout.mjs [390x844,800x600,844x390,1280x720]   exits 1 on any overlap; writes qa/out/wpL-layout.json
import {launch, career, snap} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpL-layout");
const sizes = (process.argv[2] || "390x844,800x600,844x390,1280x720").split(",").map(s => s.split("x").map(Number));
// the rectangles of the HUD pieces on screen (null for one not shown) and every pair that overlaps
const measure = () => {
  const R = sel => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < .05) return null; const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || b.right < 0 || b.bottom < 0) return null; return {x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height)}; };
  const items = {card: R("#lifeDrill.on .dr-card"), result: R("#lifeDrill .dr-result.show"), center: R("#lifeCenter .lfc"), note: R("#lifeNote.on"), needs: R(".hud-needs"), money: R("#lifeMoney"),
    clock: R(".hud-tl"), compass: R("#lifeCompass"), prompt: R("#lifePrompt.on"), fphints: R("#fpHud .fp-hints")};
  const ov = [], keys = Object.keys(items).filter(k => items[k]);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++){
    const a = items[keys[i]], b = items[keys[j]];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 4 && iy > 4) ov.push(`${keys[i]} x ${keys[j]} (${ix}x${iy})`);
  }
  return {items, ov};
};
let ok = true;
for (const [w, h] of sizes){
  const {page, close} = await launch({gfx: "low", seed: 11, w, h});
  try {
    await career(page, {zone: "ground", min: 11*60, pos: "ST"});
    // the finishing drill: its card is up at once, while the squad and the keeper walk over
    await page.evaluate(async () => {
      const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS.shoot;
      L.place({x: D.spot.x, z: D.spot.z - 28, y: 0, yaw: -Math.PI/2}); L.stepN(20);
      L.use(L.spots.find(s => s.label === D.label));
      for (let i = 0; i < 400 && !(window.__train && window.__train.T); i++) await new Promise(r => setTimeout(r, 25));
    });
    // (FEED shows one centre notice at a time: each is waited for until it is in, and the next one until the
    // screen is clear of it)
    const shown = () => page.waitForFunction(() => !!document.querySelector("#lifeCenter .lfc.in:not(.out)"), null, {timeout: 8000}).then(() => page.waitForTimeout(600)).catch(() => {});
    await page.evaluate(() => FEED.center("Level up", "Accuracy 31"));
    await shown();
    const pre = await page.evaluate(measure);
    check(!!pre.items.card && !pre.items.compass, `${w}x${h}, the drill's card up before its view: the compass steps aside`, {card: pre.items.card, compass: pre.items.compass});
    check(!pre.ov.length, `${w}x${h}, before the drill's view: nothing on top of anything else`, pre.ov);
    // in the drill's own view: a result, a centre notice from the same shot and a note, all at once
    const dv = await page.evaluate(async () => {
      for (let i = 0; i < 2400 && !document.body.classList.contains("drillview"); i++) await new Promise(r => setTimeout(r, 25));
      return document.body.classList.contains("drillview");
    });
    check(dv, `${w}x${h}: the drill's view starts`, dv);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector("#lifeCenter .lfc"), null, {timeout: 15000}).catch(() => {});
    await page.evaluate(async () => {
      const Dm = await import("./js/life/drills.js");
      Dm.hudResult("Top corner!", "+3 points", true);
      FEED.center("Level up", "Finishing 42");
      window.lifeNote("The coach wants you back on the ball. Take it to the spot and go again.");
    });
    await shown();
    const r = await page.evaluate(measure);
    check(r.items.card && r.items.result && r.items.center && r.items.note, `${w}x${h}, in the drill's view: the card, the result, the notice and the note all showing`, Object.keys(r.items).filter(k => r.items[k]));
    check(!r.ov.length, `${w}x${h}, in the drill's view: nothing on top of anything else`, r.ov.length ? {ov: r.ov, items: r.items} : []);
    await snap(page, `wpL-layout-${w}x${h}`);
    check(!page.errors.length, `${w}x${h}: no console or page errors`, page.errors.slice(0, 3));
  } catch(e){ ok = false; check(false, `${w}x${h}: the run finished`, String(e && e.message || e)); }
  finally { await close(); }
}
process.exit(done() && ok ? 0 : 1);
