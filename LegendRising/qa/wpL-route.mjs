// qa/wpL-route.mjs: every way into a match reaches the first-person match, and nothing opens the retired 2D screen.
// Owner: WP-L (Stage P3). Contract DESIGN 3.4.6 (routing without the 2D engine), 2.5 WP-L acceptance, D17, D18.
//
//   1. The game: no js/engine, none of the 2D match's names (startMatch, finishMatch, renderMatchScreen, the
//      A.kickOff / A.leaveMatch / A.workrate buttons) left in the page.
//   2. The hub with the 3D world available but not running (the "Play match" button): the world starts at the
//      ground's tunnel and the match day begins (FP state travel, then the dressing room in the stadium).
//   3. A.playFixture from inside the world: straight into the first-person match day.
//   4. No 3D world (WebGL 2 missing): "Play match" plays the fixture out for him (quickMatch); its full-time card says
//      so, the world has the result, MT is let go, Continue goes back to the hub; New Game says the build has to be
//      served over http(s).
//   Zero console and page errors throughout.
//
//   QA_PORT=8830 node qa/wpL-route.mjs        exits 1 on any failed check; writes qa/out/wpL-route.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, ROOT} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpL-route");
const NOTE = "This match was played out for you. Full matches need the 3D world: open the game from a web address in a browser with WebGL2.";

// a career on the morning of a league match day, an hour before kick-off, the manager starting him
async function matchDay(page){
  await career(page, {zone: "ground", min: 9*60});
  return page.evaluate(() => {
    let n = 0; while (!(todaysFixture() && todaysFixture().kind === "L") && n++ < 28){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    S.trust = 100; S.chem = 80; S.fatigue = 0; S.energy = 100;
    window.selectRole = () => "starter";
    const f = todaysFixture(), ko = fixtureSlot(f).min;
    S.life.min = ko - 60;
    return {key: f.key, ko};
  });
}
// the hub on its own, as without the world: the world stopped, the page out of it, the hub drawn
const toHub = page => page.evaluate(() => {
  window.stopLife();
  document.body.classList.remove("life", "cine", "hand", "hub-out");
  document.getElementById("lifeRoot").style.display = "none";
  renderHub();
});
const state = page => page.evaluate(() => ({fp: window.FP && window.FP.state, zone: window.__life && window.__life.LIFE.zone, life: document.body.classList.contains("life"),
  dom2d: !!document.querySelector(".match-screen, canvas[id=pitch]"), mt: typeof MT !== "undefined" && !!MT}));

/* ---------- 1. the 2D engine is gone ---------- */
{
  check(!fs.existsSync(path.join(ROOT, "js", "engine")), "js/engine is deleted");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check(!/js\/engine\//.test(html) && !/ui\/tutorial\.js/.test(html), "index.html loads no 2D engine script and no tutorial.js");
}

/* ---------- 2 and 3. with the 3D world ---------- */
{
  const {page, close} = await launch({gfx: "low", seed: 11});
  try {
    const gone = await page.evaluate(() => ({names: ["startMatch", "finishMatch", "renderMatchScreen", "startMoment", "matchSkillsOn", "startDream", "legacyRating", "resize"].filter(n => typeof window[n] !== "undefined"),
      buttons: ["kickOff", "resumeMatch", "playMoment", "contMoment", "leaveMatch", "workrate", "speed", "skipAhead", "playHighlight", "passNow", "shootNow"].filter(k => k in A)}));
    check(!gone.names.length && !gone.buttons.length, "none of the 2D match's functions or buttons is left in the page", gone);
    const fx = await matchDay(page);
    await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
    await toHub(page);
    const btn = await page.evaluate(() => { const b = [...document.querySelectorAll("#app button")].find(x => /Play match/.test(x.textContent)); return b ? b.getAttribute("onclick") : null; });
    check(btn === "A.playMatch()", "the hub without the world running shows the Play match button", btn);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#app button")].find(x => /Play match/.test(x.textContent)); b.click(); });
    let s = await state(page);
    check(s.life && s.fp === "travel" && !s.dom2d, "Play match from the hub: the world starts and the match day begins (the travel card)", s);
    await freeze(page);
    for (let i = 0; i < 120 && s.fp !== "dressing"; i++){ await page.evaluate(() => window.__life.stepN(30)); s = await state(page); }
    check(s.fp === "dressing" && s.zone === "stadium" && !s.dom2d, "then the dressing room in the stadium, with no 2D screen", s);
    const mtKey = await page.evaluate(() => MT && MT.f && MT.f.key);
    check(mtKey === fx.key, "the match day is the hub's fixture", {mt: mtKey, want: fx.key});
    // out again, then in through A.playFixture from the world itself
    await page.evaluate(() => { window.FP.exit(); });
    const back = await page.evaluate(() => ({fp: window.FP.state, again: !!A.playFixture(todaysFixture())}));
    s = await state(page);
    check(back.again && s.fp === "travel" && !s.dom2d, "A.playFixture from inside the world: straight into the first-person match day", Object.assign(back, s));
    const played = await page.evaluate(() => { const f = todaysFixture(); return !!A.playFixture(f); });
    check(!played, "a second A.playFixture while a match day is on does nothing", played);
    check(page.errors.length === 0, "no console or page errors (with the world)", page.errors);
  } finally { await close(); }
}

/* ---------- 4. without the 3D world ---------- */
{
  const {page, close} = await launch({gfx: "low", seed: 12});
  try {
    const fx = await matchDay(page);
    await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
    await toHub(page);
    // a browser without WebGL 2, as the routing sees one
    await page.evaluate(() => { window.WebGL2RenderingContext = undefined; renderHub(); });
    const before = await page.evaluate(k => ({done: !!W.done[k], apps: S.careerMy.apps}), fx.key);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#app button")].find(x => /Play match/.test(x.textContent)); b.click(); });
    await page.waitForTimeout(400);
    const r = await page.evaluate(k => ({card: !!document.querySelector(".ft-card"), note: (document.querySelector(".ft-card") || {}).textContent || "", done: !!W.done[k], mt: MT === null,
      fp: window.FP ? window.FP.state : null, life: document.body.classList.contains("life"), apps: S.careerMy.apps, dom2d: !!document.querySelector(".match-screen")}), fx.key);
    check(r.card && r.note.includes(NOTE), "no 3D world: the match is played out for him and the full-time card says so", {card: r.card, note: r.note.slice(-160)});
    check(!before.done && r.done && r.mt && !r.fp && !r.life && !r.dom2d, "the world has the result, MT is let go, no match mode and no 2D screen", r);
    await page.evaluate(() => { const b = [...document.querySelectorAll(".ft-card button")].find(x => /Continue/.test(x.textContent)); b.click(); });
    const hub = await page.evaluate(() => ({screen: LAST_SCREEN, hub: !!document.querySelector(".hub")}));
    check(hub.screen === "hub" && hub.hub, "Continue goes back to the hub", hub);
    // New Game without a 3D world
    await page.evaluate(() => A.newGame(2));
    const ng = await page.evaluate(() => ({text: document.getElementById("app").textContent, screen: LAST_SCREEN}));
    check(ng.screen === "noworld" && ng.text.includes("This build has to be served over http(s) to play."), "New Game without a 3D world says the build has to be served over http(s)", ng.screen);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#app button")].find(x => /Back/.test(x.textContent)); b.click(); });
    const t = await page.evaluate(() => LAST_SCREEN);
    check(t === "title", "its Back button returns to the title screen", t);
    check(page.errors.length === 0, "no console or page errors (without the world)", page.errors);
  } finally { await close(); }
}

process.exit(done() ? 0 : 1);
