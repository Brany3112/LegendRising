// qa/wpI-delivery.mjs: a Foodies order delivered to the training centre (DESIGN 2.4 WP-I acceptance, 3.8.7: "the
// ground Foodies order appears on the clubhouse counter while it is out of view; the compass shows DELIVERIES, then
// FRIDGE while you carry it; the food enters S.inv within 1.15 m of the gym fridge").
// The world runs on its own loop here (the courier's check uses what the camera really sees). A bag arrives while you
// stand looking at the staff counter: it must not be there until you turn away. Then it is picked up, carried, and
// put in at the gym fridge. Screenshots: qa/out/wpI-delivery-*.png.
// Owner: WP-I (Stage P2).
//
//   node qa/wpI-delivery.mjs
import {launch, career, snap, report, expect} from "./lib.mjs";

const res = {steps:{}, errors:[]};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); };
const {page, close} = await launch({gfx:"low", seed:21});
const wait = ms => page.waitForTimeout(ms);
const bagOut = () => page.evaluate(() => window.__life.spots.some(s => s.label === "Foodies bag"));
const kinds = () => page.evaluate(() => { const L = window.__life; for (let i = 0; i < 30; i++) L.compassStep(.1); return [...document.querySelectorAll("#lifeCompass .cp-mk")].map(e => [...e.classList].find(c => c.startsWith("k-"))); });
try {
  await career(page, {zone:"ground", min:11*60, pos:"CM"});
  // in the clubhouse lobby, four metres from the counter and looking at it
  const C = {x:18.55, z:6.0}, at = {x:17.0, z:9.8};
  const face = (x, z) => Math.atan2(-(x - at.x), -(z - at.z));
  await page.evaluate(([at, yaw]) => { const L = window.__life; S.parcels = []; L.refreshParcels(); L.place({x:at.x, z:at.z, y:0, yaw}); L.P.pitch = -.15; }, [at, face(C.x, C.z)]);
  await wait(800);
  // the courier comes while you look at the counter
  await page.evaluate(async () => {
    const M = await import("./js/life/parcels.js");
    S.parcels.push({id:"qa-ground", items:{fruit:2}, at:"ground", t:0});
    M.parcelArrived();
  });
  await wait(1600);
  res.steps.whileLooking = await bagOut();
  await snap(page, "wpI-delivery-0-looking");
  check(!res.steps.whileLooking, "the bag does not appear while the counter is in view", res.steps.whileLooking);
  // you turn away: it is there when you look again
  await page.evaluate(yaw => { window.__life.P.yaw = yaw; }, face(C.x, C.z) + Math.PI);
  await wait(1400);
  res.steps.afterTurn = await bagOut();
  check(res.steps.afterTurn, "the bag is on the counter once you looked away", res.steps.afterTurn);
  res.steps.compassWaiting = await kinds();
  check(res.steps.compassWaiting.includes("k-deliv") && !res.steps.compassWaiting.includes("k-fridge"), "compass: DELIVERIES while it waits", res.steps.compassWaiting);
  await page.evaluate(yaw => { window.__life.P.yaw = yaw; }, face(C.x, C.z));
  await wait(600);
  await snap(page, "wpI-delivery-1-counter");
  // picked up (the left click on it): in your hands
  res.steps.picked = await page.evaluate(() => {
    const L = window.__life, sp = L.spots.find(s => s.label === "Foodies bag");
    const it = sp.pick(); L.INV.take(it);
    return {hand:L.INV.hand() && L.INV.hand().id, parcels:S.parcels.length};
  });
  check(res.steps.picked.hand === "bag" && res.steps.picked.parcels === 0, "the bag picked up", res.steps.picked);
  res.steps.compassCarrying = await kinds();
  check(res.steps.compassCarrying.includes("k-fridge") && !res.steps.compassCarrying.includes("k-deliv"), "compass: FRIDGE while you carry it", res.steps.compassCarrying);
  // to the gym fridge: not yet at 1.3 m, in at 1.1 m
  const f = await page.evaluate(() => window.__life.W.fridges.find(q => q.name === "the gym fridge"));
  const before = await page.evaluate(() => S.inv.fruit || 0);
  const standAt = d => page.evaluate(([f, d]) => {
    const L = window.__life, ux = 0, uz = 1;                  // (any side: the distance is what counts)
    const best = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => ({x:f.x + x*d, z:f.z + z*d})).find(p => !L.solids.some(q => !q.off && p.x > q.x0 - .3 && p.x < q.x1 + .3 && p.z > q.z0 - .3 && p.z < q.z1 + .3)) || {x:f.x + ux*d, z:f.z + uz*d};
    L.place({x:best.x, z:best.z, y:0, yaw:Math.atan2(-(f.x - best.x), -(f.z - best.z))});
    return best;
  }, [f, d]);
  await standAt(1.3); await wait(500);
  res.steps.far = await page.evaluate(() => ({fruit:S.inv.fruit || 0, hand:window.__life.INV.hand() && window.__life.INV.hand().id, d:Math.hypot(window.__life.P.x - window.__life.W.fridges[0].x, window.__life.P.z - window.__life.W.fridges[0].z)}));
  check(res.steps.far.fruit === before && res.steps.far.hand === "bag", "not in yet at 1.3 m", res.steps.far);
  await standAt(1.1); await wait(500);
  res.steps.near = await page.evaluate(() => ({fruit:S.inv.fruit || 0, hand:window.__life.INV.hand() ? window.__life.INV.hand().id : null}));
  await snap(page, "wpI-delivery-2-fridge");
  check(res.steps.near.fruit === before + 2 && !res.steps.near.hand, "the food goes in at 1.1 m", {before, ...res.steps.near});
  res.steps.compassAfter = await kinds();
  check(!res.steps.compassAfter.includes("k-fridge") && !res.steps.compassAfter.includes("k-deliv"), "compass: neither once it is in", res.steps.compassAfter);
  console.log(JSON.stringify(res.steps));
} catch(e){ res.errors.push("wpI-delivery: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors);
  report("wpI-delivery", res);
  await close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpI-delivery: pass");
