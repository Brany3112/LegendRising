// qa/tr2-keys.mjs: the keys a match must keep to itself, and the HUD's per-frame layout reads (browser, real keys).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-keys.mjs: ball-9 and INF-2, task #114;
// perf-5); TRAINING-SPEC section 2 (HUD minimal), DESIGN 1.6 (Tab is the overview in a match, Q does nothing).
//
//   - in a live match (pointer held): Tab held shows the overview and never the phone; Q opens nothing;
//   - perf-5: over 120 live frames the canvas size is read at most twice a frame (hud() once, its width and height):
//     proj() reads none;
//   - in life (the same career, the match left): Tab still brings the phone out and Q the hub, and both put away;
//   - with no career loaded (S null, the world walked without one, as Training Mode will be): Q opens nothing and does
//     not lock the keys (W still walks).
//
//   QA_PORT=8840 node qa/tr2-keys.mjs      exits 1 on any failed check; writes qa/out/tr2-keys.json
import {launch, career, freeze, unfreeze} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";
import {lockPointer, pressReal} from "./trlib.mjs";

const {check, done} = checker("tr2-keys");
const {page, close} = await launch({gfx: "low", seed: 2});
const phone = () => page.evaluate(() => ({mode: window.lifeMode ? window.lifeMode() : null, hand: typeof PH !== "undefined" && !!PH.open, hub: document.body.classList.contains("hub-out"),
  locked: window.lifeMoveLocked ? window.lifeMoveLocked() : null, tab: !!document.querySelector("#fpHud.fp-tab"), radarBig: !!document.querySelector("#fpHud .fp-radar.big"), state: window.__fp.state}));

try {
  await career(page, {zone: "ground", min: 12*60});
  await page.evaluate(() => window.__fp.enter("test:11v11", {}));
  await unfreeze(page); await page.waitForTimeout(1500);
  check(!!(await lockPointer(page)), "the pointer locked by a real click on the 3D view");
  await freeze(page);
  await page.evaluate(() => window.__life.stepN(30));

  // Tab held: the overview, never the phone
  await page.keyboard.down("Tab");
  await page.evaluate(() => window.__life.stepN(4));
  const t1 = await phone();
  await page.keyboard.up("Tab");
  await page.evaluate(() => window.__life.stepN(2));
  const t2 = await phone();
  check(t1.tab && t1.radarBig && !t1.hand && t1.mode === "street" && t1.state === "live", "a live match: Tab held shows the overview, not the phone", t1);
  check(!t2.tab && !t2.hand, "a live match: Tab let go puts the overview away", t2);
  // Q: nothing
  await pressReal(page, "q");
  await page.evaluate(() => window.__life.stepN(30));
  const q1 = await phone();
  check(!q1.hub && q1.mode === "street" && !q1.locked && q1.state === "live", "a live match: Q opens nothing (no hub, the keys not locked)", q1);

  // perf-5: the canvas size read at most twice a frame (hud's own read), proj() none
  const reads = await page.evaluate(() => {
    const W = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth"), Hh = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
    // (hud() reads the canvas's width and height once a frame: two reads; anything more is somebody else's, proj's included)
    let n = 0;
    const spy = d => ({configurable: true, get(){ n++; return d.get.call(this); }});
    Object.defineProperty(Element.prototype, "clientWidth", spy(W)); Object.defineProperty(Element.prototype, "clientHeight", spy(Hh));
    try { window.__life.stepN(120); } finally { Object.defineProperty(Element.prototype, "clientWidth", W); Object.defineProperty(Element.prototype, "clientHeight", Hh); }
    return {n, perFrame: n/120};
  });
  check(reads.perFrame <= 2, "perf-5: over 120 live frames the canvas size is read at most twice a frame (proj() reads none)", reads);

  // life: the match left, the phone and the hub are yours again
  await page.evaluate(() => window.__fp.exit());
  await unfreeze(page);
  await page.waitForTimeout(600);
  check(!!(await lockPointer(page)), "life: the pointer held again");
  await pressReal(page, "Tab"); await page.waitForTimeout(700);
  const l1 = await phone();
  await pressReal(page, "Tab"); await page.waitForTimeout(700);
  const l2 = await phone();
  check(l1.mode === "hand" && l1.hand, "life: Tab brings the phone out", l1);
  check(l2.mode === "street" && !l2.hand, "life: Tab puts it away", l2);
  await pressReal(page, "q"); await page.waitForTimeout(900);
  const l3 = await phone();
  await pressReal(page, "q"); await page.waitForTimeout(900);
  const l4 = await phone();
  check(l3.mode === "hub" && l3.hub, "life: Q brings the hub up", l3);
  check(l4.mode === "street" && !l4.hub && !l4.locked, "life: Q puts it away and the keys are yours", l4);

  // no career loaded (S null): Q opens nothing and locks nothing; W still walks
  await freeze(page);
  const n = await page.evaluate(() => { window.__savedS = S; S = null; return true; });
  await pressReal(page, "q");
  const s1 = await page.evaluate(() => ({mode: window.lifeMode(), locked: window.lifeMoveLocked(), hub: document.body.classList.contains("hub-out")}));
  await pressReal(page, "Tab");
  const s2 = await page.evaluate(() => ({mode: window.lifeMode(), locked: window.lifeMoveLocked(), focus: document.activeElement ? document.activeElement.tagName : null}));
  await page.evaluate(() => { S = window.__savedS; delete window.__savedS; });
  check(n && s1.mode === "street" && !s1.locked && !s1.hub, "no career loaded: Q opens nothing and does not lock the keys", s1);
  check(s2.mode === "street" && !s2.locked, "no career loaded: Tab opens nothing either", s2);
  // the keys still walk you (W held a moment)
  const w = await page.evaluate(() => ({x: window.__life.P.x, z: window.__life.P.z}));
  await page.keyboard.down("w"); await page.evaluate(() => window.__life.stepN(40)); await page.keyboard.up("w");
  const w2 = await page.evaluate(() => ({x: window.__life.P.x, z: window.__life.P.z}));
  check(Math.hypot(w2.x - w.x, w2.z - w.z) > .3, "and W still walks you after it", {moved: +Math.hypot(w2.x - w.x, w2.z - w.z).toFixed(2)});
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
await close();
process.exit(done() ? 0 : 1);
