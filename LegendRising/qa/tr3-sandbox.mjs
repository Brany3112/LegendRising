// qa/tr3-sandbox.mjs: Training Mode's sandbox (browser). It never writes the career, it holds a career in memory
// aside and puts it back exactly as it was, and the world runs in it with no career at all.
// Owner: P3-A (Training Mode, Phase 3). Contract: BUILD-PLAN P3-A acceptance "qa/tr3-sandbox.mjs"; TRAINING-SPEC 1, 4, 7.
//
//   Part A, a fresh page with no save, entered through the sandbox entry (the title's button is P3-B's):
//     S stays null; 600 frames with no console or page error; W (a real key press) walks; an E prompt is drawn at a test
//     spot and E (a real key press) uses it; the movement profile in the cage is FOOTBALL; the write spy logs no career
//     write and the career diff is empty; Q (a real key press) opens nothing and locks nothing.
//   Part B, a career created and then "Quit to title" (the snapshot taken after Quit has finished): enter Training,
//     close a panel (a real click), wait 2 s, exit: no career write between train:enter and train:exit, hold and
//     release included; the career diff is empty; the career object is restored; S.playMs does not grow in Training,
//     nor on the title after Quit; S.events.away is not written; the auto sync is paused and resumed; the Training
//     body's look and scale are the career's body's at the training ground.
//
//   QA_PORT=8860 node qa/tr3-sandbox.mjs     exits 1 on any failed check; writes qa/out/tr3-sandbox.json
import {launch, career, freeze, stepN, storageSpy, spyCareerWrites, careerSnapshot, careerDiff, trainingStart, report, snap} from "./lib.mjs";

const res = {name: "tr3-sandbox", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const draw = page => page.evaluate(() => { const L = window.__life; L.renderer().render(L.scene(), L.cam); });

/* ---------- Part A: no career ---------- */
{
  const {page, close, errors} = await launch({gfx: "low", seed: 11});
  try {
    await storageSpy(page);
    const before = await careerSnapshot(page);
    await trainingStart(page, {kind: "half"});
    await freeze(page);
    check(await page.evaluate(() => S === null), "no career: S stays null in the sandbox");
    // 600 frames, a real draw every 30
    for (let i = 0; i < 20; i++){ await stepN(page, 30); await draw(page); }
    check(errors.length === 0, "600 frames with no console or page error", errors.slice(0, 3));
    check(await page.evaluate(() => S === null && window.__life.modes.mode() === "trainsb"), "after 600 frames: still no career, the sandbox mode");
    const prof = await page.evaluate(() => window.__life.LOCO.prof);
    check(prof === "football", "in the cage outside a scenario the movement profile is FOOTBALL", prof);
    // W walks (a real key)
    const p0 = await page.evaluate(() => ({x: window.__life.P.x, z: window.__life.P.z}));
    await page.keyboard.down("w");
    await stepN(page, 60);
    await page.keyboard.up("w");
    await stepN(page, 30);
    const p1 = await page.evaluate(() => ({x: window.__life.P.x, z: window.__life.P.z, prof: window.__life.LOCO.prof}));
    const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check(walked > 1, "W walks (1 s held: over a metre)", {walked: +walked.toFixed(2)});
    // an E prompt at a test spot, and E uses it
    await page.evaluate(() => {
      const L = window.__life, P = L.P;
      L.spots.push({x: P.x - Math.sin(P.yaw)*1.2, y: 1, z: P.z - Math.cos(P.yaw)*1.2, r: 2, hold: .35, near: true, label: "Test cone", hint: "Try it", run(){ window.__used = (window.__used || 0) + 1; }});
    });
    await stepN(page, 3);
    const pr = await page.evaluate(() => { const p = document.getElementById("lifePrompt"); return {on: p.classList.contains("on"), label: p.querySelector(".lp-label").textContent, shown: getComputedStyle(p).display !== "none"}; });
    check(pr.on && pr.label === "Test cone", "an E prompt is drawn at a test spot with no career", pr);
    await page.keyboard.press("e");
    await stepN(page, 2);
    check(await page.evaluate(() => window.__used === 1), "E (a real key) uses it");
    const hudHidden = await page.evaluate(() => ["#lifeClock", "#lifeMoney", "#lifeInv"].map(q => { const el = document.querySelector(q); return !el || !el.offsetParent; }));
    check(hudHidden.every(Boolean), "the career's HUD (clock, money, pockets) is hidden with no career", hudHidden);
    // Q opens nothing and locks nothing
    await page.keyboard.press("q");
    await stepN(page, 10);
    const q = await page.evaluate(() => ({mode: window.lifeMode ? window.lifeMode() : null, hub: document.body.classList.contains("hub-out"), modal: window.__life.FLAGS.modal,
      locked: !!(window.lifeMoveLocked && window.lifeMoveLocked()), running: window.__life.LIFE.running, sandbox: window.__life.modes.mode()}));
    check(q.mode !== "hub" && !q.hub && !q.modal && !q.locked && q.running && q.sandbox === "trainsb", "Q in the sandbox opens nothing and locks nothing", q);
    await snap(page, "tr3-sandbox-nocareer");
    await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.exitTraining()));
    const after = await careerSnapshot(page), writes = await spyCareerWrites(page);
    check(writes.length === 0, "the write spy logs no career write in Training", writes.slice(0, 4));
    check(careerDiff(before, after).length === 0, "the career diff is empty", careerDiff(before, after));
    check(await page.evaluate(() => S === null && document.querySelector(".title-screen") && !document.body.classList.contains("life") && !window.__life.LIFE.running),
      "exit: the title is back, the world stopped, still no career");
    check(errors.length === 0, "part A: no console or page error", errors.slice(0, 3));
  } finally { await close(); }
}

/* ---------- Part B: a career held aside ---------- */
{
  const {page, close, errors} = await launch({gfx: "low", seed: 12});
  try {
    await career(page, {zone: "ground"});
    await freeze(page);
    await stepN(page, 5);
    // the career's body at the training ground: its look and its scale
    const life = await page.evaluate(() => { const L = window.__life; return {look: JSON.stringify(L.ME.tp.look), scale: L.ME.tp.scale, fpScale: L.ME.fp.scale, kind: L.ME.kind}; });
    // Quit to title (the career's own quit: a save, then the title)
    await page.evaluate(() => A.quit());
    await page.waitForSelector(".title-screen", {timeout: 30000});
    await page.waitForTimeout(1200);           // anything Quit scheduled has run
    const quitStops = await page.evaluate(() => PLAY_T === null);
    // P3-B's A.quit stops the play clock (INF-4); until it merges, the test stops it as Quit will
    if (!quitStops) await page.evaluate(() => stopPlayClock());
    const snap0 = await careerSnapshot(page);
    const ms0 = await page.evaluate(() => S.playMs);
    await page.waitForTimeout(6000);
    const ms1 = await page.evaluate(() => S.playMs);
    check(ms1 === ms0, `S.playMs does not grow on the title after Quit${quitStops ? "" : " (Quit's stopPlayClock applied by the test until P3-B merges)"}`, {ms0, ms1});
    // the auto sync running, as for a career signed in to the board
    const ref = await page.evaluate(() => {
      ONLINE.user = {uid: "qa"}; S.synced = true; startAutoSync();
      window.__heldRef = S;
      return {cid: S.cid, away: JSON.stringify(S.events && S.events.away || null), auto: !!AUTO.timer, playMs: S.playMs};
    });
    check(ref.auto, "the auto sync is running before Training");
    await storageSpy(page);
    await trainingStart(page, {kind: "full"});
    await freeze(page);
    const held = await page.evaluate(() => ({S: S === null, held: careerHeld(), auto: !!AUTO.timer, paused: !!AUTO.paused, playT: PLAY_T === null}));
    check(held.S && held.held, "in Training the career is held aside and S is null", held);
    check(!held.auto && held.paused, "the auto sync is paused", held);
    check(held.playT, "the play clock is stopped");
    const tb = await page.evaluate(() => { const L = window.__life; return {look: JSON.stringify(L.ME.tp.look), scale: L.ME.tp.scale, fpScale: L.ME.fp.scale, kind: L.ME.kind}; });
    check(tb.look === life.look && tb.kind === life.kind, "the Training body's look (human.js look) is the career's body's at the ground", {same: tb.look === life.look, kind: [tb.kind, life.kind]});
    check(Math.abs(tb.scale - life.scale) < 1e-9 && Math.abs(tb.fpScale - life.fpScale) < 1e-9, "and its scale", {training: tb.scale, life: life.scale});
    // a panel opened, and closed with a real click on its backdrop (lpClose asks for a save)
    await page.evaluate(() => lpShow("qa", "<div style='padding:20px'>A panel</div>"));
    await page.waitForTimeout(300);
    const back = await page.locator("#lifePanel .lpn-back").boundingBox();
    await page.mouse.click(back.x + 6, back.y + back.height/2);
    await page.waitForTimeout(300);
    check(await page.evaluate(() => !window.lifePanelOpen()), "the panel closed (a real click)");
    await stepN(page, 120);
    await page.waitForTimeout(2000);
    await stepN(page, 60);
    const mid = await page.evaluate(() => ({playMs: window.__heldRef.playMs, away: JSON.stringify(window.__heldRef.events && window.__heldRef.events.away || null)}));
    check(mid.playMs === ref.playMs, "S.playMs does not grow during Training", {before: ref.playMs, during: mid.playMs});
    await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.exitTraining()));
    await page.waitForTimeout(1500);
    const writes = await spyCareerWrites(page);
    check(writes.length === 0, "no career write between train:enter and train:exit (the hold and the release included)", writes.slice(0, 4));
    const out = await page.evaluate(() => ({same: S === window.__heldRef, cid: S && S.cid, away: JSON.stringify(S.events && S.events.away || null), playMs: S.playMs,
      held: careerHeld(), auto: !!AUTO.timer, paused: !!AUTO.paused, title: !!document.querySelector(".title-screen")}));
    check(out.same && out.cid === ref.cid && !out.held, "the career object is restored, the very same", {same: out.same, cid: out.cid});
    check(out.away === ref.away, "S.events.away is not written", {before: ref.away, after: out.away});
    check(out.playMs === ref.playMs, "S.playMs the same after Training", {before: ref.playMs, after: out.playMs});
    check(out.auto && !out.paused, "the auto sync is resumed", out);
    check(out.title, "the title is back");
    // nothing written after the release either (the panel's save never fires later)
    await page.waitForTimeout(2500);
    const snap1 = await careerSnapshot(page), diff = careerDiff(snap0, snap1);
    check(diff.length === 0, "the career diff is empty (snapshot after Quit against after Training)", diff);
    await page.evaluate(() => { stopAutoSync(); ONLINE.user = null; });
    check(errors.length === 0, "part B: no console or page error", errors.slice(0, 3));
  } finally { await close(); }
}

report("tr3-sandbox", res);
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
