// verifier probe: the drill card, a drill result, a centre notice and a note all up at once during a first-person
// drill, at phone, small and desktop sizes (style.css fix round claims for max-width 900 / 640 and max-height 560):
// the rectangles of every HUD piece, and which of them overlap.
import {launch, career, snap} from "./lib.mjs";
const sizes = (process.argv[2] || "390x844,800x600,844x390,1280x720").split(",").map(s => s.split("x").map(Number));
const all = {};
for (const [w, h] of sizes){
  const {page, close} = await launch({gfx: "low", seed: 11, w, h});
  try {
    await career(page, {zone: "ground", min: 11*60, pos: "ST"});
    const st = await page.evaluate(async () => {
      const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS.shoot;
      L.place({x: D.spot.x, z: D.spot.z - 28, y: 0, yaw: -Math.PI/2}); L.stepN(20);
      L.use(L.spots.find(s => s.label === D.label));
      for (let i = 0; i < 400 && !(window.__train && window.__train.T); i++) await new Promise(r => setTimeout(r, 25));
      return {T: !!(window.__train && window.__train.T), drillview: document.body.classList.contains("drillview")};
    });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      const Dm = await import("./js/life/drills.js");
      Dm.hudResult("Top corner!", "+3 points", true);
      FEED.center("Level up", "Accuracy 31");
      window.lifeNote("The coach wants you back on the ball. Take it to the spot and go again.");
    });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const R = sel => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < .05) return null; const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null; return {x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height)}; };
      const items = {card: R("#lifeDrill .dr-card"), result: R("#lifeDrill .dr-result.show"), center: R("#lifeCenter .lfc"), note: R("#lifeNote.on"), needs: R(".hud-needs"), money: R("#lifeMoney"),
        clock: R(".hud-tl"), compass: R("#lifeCompass"), inv: R("#lifeInv"), prompt: R("#lifePrompt.on"), fphints: R("#fpHud .fp-hints"), fpPower: R("#fpHud .fp-arc")};
      const ov = [];
      const keys = Object.keys(items).filter(k => items[k]);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++){
        const a = items[keys[i]], b = items[keys[j]];
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 4 && iy > 4) ov.push(`${keys[i]}x${keys[j]} (${ix}x${iy})`);
      }
      return {items, ov, drillview: document.body.classList.contains("drillview"), vw: innerWidth, vh: innerHeight};
    });
    all[`${w}x${h}`] = Object.assign({start: st}, r);
    console.log(`${w}x${h}`, JSON.stringify(st), "overlaps:", r.ov.join(", ") || "none");
    console.log("   ", JSON.stringify(r.items));
    await snap(page, `vr2-layout-${w}x${h}`);
    if (page.errors.length) console.log("   errors", page.errors.slice(0, 3));
  } catch(e){ console.log(`${w}x${h} exception`, e.message); }
  finally { await close(); }
}
