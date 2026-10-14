// qa/tr3-play.mjs: the integrator's play-through for the TR-3+U merge, with real input. One career match from the
// bench (the coach's call, the warm-up strides with real Shift presses on the footfalls, the call to come on, the walk
// to the fourth official with W, on at the stoppage), then live play with R pressed for the ball and a throw-in
// watched; then one Training Mode cage session from the title's Training button (hub, Esc, walk with W, a cone's E
// prompt and its category, Exit to title). Screenshots go to qa/out/tr3-play/.
// Owner: the integrator (stage TR-3+U). Contract: BUILD-PLAN section 0 "QA conventions" (real input: page.keyboard,
// page.mouse, the pointer locked by a real click; aim is a write to P.yaw and P.pitch, what a mouse move does).
//
//   QA_PORT=8765 node qa/tr3-play.mjs      exits 1 on any failed check
import fs from "node:fs";
import path from "node:path";
import {openFixture, checker} from "./uf-lib.mjs";
import {launch, freeze, unfreeze, OUT, storageSpy, spyCareerWrites, trainingStart} from "./lib.mjs";

const DIR = path.join(OUT, "tr3-play");
fs.mkdirSync(DIR, {recursive: true});
const {check, done} = checker("tr3-play");
let ok = true;
const snapTo = async (T, name) => {
  const f = await T.snap(name);
  const to = path.join(DIR, name + ".png"); fs.renameSync(f, to); return to;
};

/* ---------- the career match ---------- */
{
  const T = await openFixture("test:bench", {startMin: 2, subOn: 26, callAt: 3, seed: 5, warmSet: ["strides"]}, {seed: 5});
  const {page} = T;
  try {
    check(!!T.lock, "match: the pointer locked by a real click", T.lock);
    const called = await T.until(() => window.__fp.warm.S.phase === "call" && window.__fp.warm.S.coach && window.__fp.warm.S.coach.arrived, 60*60*3);
    check(called >= 0, "match: the assistant coach came over to call you for the warm-up", called);
    await snapTo(T, "1-coach-call");
    await T.key("e", 2);
    // the strides: a real Shift on every footfall the gait makes
    let taps = 0, frames = 0, shot = false;
    for (; frames < 60*60*6; frames++){
      const s = await page.evaluate(() => {
        const W = window.__fp.warm.S, X = W.X, f = X && X.falls && X.falls.length ? X.falls[X.falls.length - 1] : null;
        return {phase: W.phase, sub: W.sub, id: X ? X.id : null, fresh: !!(f && !f.done && X.t - f.t < .04 && f !== window.__lastFall), score: W.scores ? W.scores.slice() : null,
          mark: (() => { if (f) window.__lastFallC = f; return 0; })()};
      });
      if (s.phase === "done" || s.phase === "outro" || s.phase === "idle" && frames > 600) break;
      if (s.phase === "drill" && s.sub === "go" && s.id === "strides" && s.fresh){
        await page.evaluate(() => { window.__lastFall = window.__lastFallC; });
        await page.keyboard.press("Shift"); taps++;
        if (!shot && taps === 6){ shot = true; await snapTo(T, "2-warmup-strides"); }
      }
      await T.frames(1);
    }
    const W = await page.evaluate(() => ({phase: window.__fp.warm.S.phase, scores: window.__fp.warm.S.scores}));
    check(taps > 0 && (W.phase === "done" || W.phase === "outro" || W.phase === "idle"), "match: the strides warm-up played with real Shift presses to its end", {taps, frames, W});
    // the call to come on, the walk to the fourth official with W
    const on = await T.until(() => window.__fp.state === "entering", 60*60*30);
    check(on >= 0, "match: called on", on);
    const look = (x, z) => page.evaluate(([x, z]) => { const P = window.__life.P; P.yaw = Math.atan2(-(x - P.x), -(z - P.z)); P.pitch = -.08; }, [x, z]);
    let e = await page.evaluate(() => window.__fp.entrySpot());
    await look(e.x, e.z); await T.frames(3);
    await snapTo(T, "3-called-fourth-official");
    await page.keyboard.down("w");
    let at = false;
    for (let i = 0; i < 500 && !at; i++){ await look(e.x, e.z); await T.frames(4); at = await page.evaluate(() => !!window.__fp.FS.atFourth); }
    await page.keyboard.up("w");
    check(at, "match: walked to the fourth official with W", at);
    const onPitch = await T.until(() => window.__fp.FS.onPitch, 60*120);
    check(onPitch >= 0, "match: on the pitch from beside him at the stoppage", onPitch);
    // live: R for the ball whenever a team-mate has it, every 3 s at most; then a throw-in watched
    const r0 = await page.evaluate(() => ({called: window.__fp.ms.pref.called || 0, calls: window.__fp.ms.pref.calls}));
    let presses = 0, handSeen = 0, lastPress = -99, throwShot = false, throwSeen = 0, held = 0;
    for (let i = 0; i < 60*60*4 && !(throwShot && presses >= 12); i += 6){
      const s = await page.evaluate(() => {
        const F = window.__fp, ms = F.ms, me = ms.agents[ms.me], c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null, R0 = ms.restart;
        const tk = R0 && R0.kind === "throw" && R0.taker >= 0 ? ms.agents[R0.taker] : null;
        return {t: ms.t, mateOn: !!(c && c !== me && c.team === me.team), hand: ms.t - (me.handUp != null ? me.handUp : -99), live: F.state === "live",
          throwHeld: !!(tk && ms.ball.state === "held" && (R0.stage === "wait" || R0.stage === "carry")), tk: tk ? {x: tk.m.x, z: tk.m.z} : null};
      });
      if (s.live && s.mateOn && s.t - lastPress > 3){ await page.keyboard.press("r"); presses++; lastPress = s.t;
        await T.frames(8); const h = await page.evaluate(() => { const ms = window.__fp.ms, me = ms.agents[ms.me]; return ms.t - me.handUp; });
        if (h >= 0 && h < .6) handSeen++;
        if (presses === 1) await snapTo(T, "4-request-pass-hand");
      }
      if (s.throwHeld && s.tk){ throwSeen++; if (!throwShot && throwSeen > 3){ await look(s.tk.x, s.tk.z); await T.frames(2); await snapTo(T, "5-throw-in"); throwShot = true; } }
      await T.frames(6);
    }
    const r1 = await page.evaluate(() => ({called: window.__fp.ms.pref.called || 0, calls: window.__fp.ms.pref.calls}));
    check(presses > 0 && handSeen === presses, "match: every real R press raised your hand", {presses, handSeen});
    check(r1.calls - r0.calls >= presses, "match: every R press registered as a call", {presses, r0, r1});
    console.log(`  passes received because you called: ${r1.called - r0.called} of ${presses} presses`);
    check(throwShot, "match: a throw-in watched with the ball in the taker's hands", throwSeen);
    await snapTo(T, "6-live");
    check(page.errors.length === 0, "match: zero console and page errors", page.errors.slice(0, 5));
  } catch (err){ console.log("FAILED", err.stack || err.message); check(false, "match: the run finished", String(err.message)); ok = false; }
  await T.close();
}

/* ---------- a Training Mode cage session ---------- */
{
  const {page, close} = await launch({gfx: "low", seed: 3, w: 1280, h: 720});
  try {
    await storageSpy(page);
    const r = await trainingStart(page, {kind: "full"});
    check(r.via === "button", "training: entered with a real click on the title's Training button", r);
    const shot = async name => { await unfreeze(page); await page.waitForTimeout(400); const f = path.join(DIR, name + ".png"); await page.screenshot({path: f, timeout: 180000}); console.log("  shot", path.relative(process.cwd(), f)); };
    await shot("7-cage");
    // walk with W to the nearest cone and read its prompt; E opens its category in the hub
    const cone = await page.evaluate(async () => {
      const P = window.__life.P;
      let best = null; for (const c of window.__trainCones.cones()){ const d = Math.hypot(c.x - P.x, c.z - P.z); if (!best || d < best.d) best = {k: c.cat, x: c.x, z: c.z, d}; }
      return best;
    });
    await freeze(page);
    await page.mouse.click(640, 360);
    await page.keyboard.down("w");
    let near = false;
    for (let i = 0; i < 400 && !near; i++){
      await page.evaluate(([x, z]) => { const P = window.__life.P; P.yaw = Math.atan2(-(x - P.x), -(z - P.z)); P.pitch = -.15; }, [cone.x, cone.z]);
      await page.evaluate(() => window.__life.stepN(3));
      near = await page.evaluate(([x, z]) => Math.hypot(window.__life.P.x - x, window.__life.P.z - z) < 1.3, [cone.x, cone.z]);
    }
    await page.keyboard.up("w");
    await page.evaluate(() => window.__life.stepN(4));
    const prompt = await page.evaluate(() => { const p = document.getElementById("lifePrompt"); return p && p.classList.contains("on") ? p.textContent.trim() : ""; });
    check(near && prompt.length > 0, "training: walked to a cone with W, its E prompt shown", {cone, prompt});
    await shot("8-cone-prompt");
    await freeze(page);
    await page.keyboard.press("e");
    await page.evaluate(() => window.__life.stepN(4));
    const hub = await page.evaluate(() => ({open: window.__trainHub.hubOpen(), cat: window.__trainHub.hubCategory()}));
    check(hub.open && hub.cat === cone.k, "training: E at the cone opens its category", {hub, cone: cone.k});
    await shot("9-hub-category");
    const spy = await spyCareerWrites(page);
    check(spy.length === 0, "training: no career key written", spy.slice(0, 5));
    check(page.errors.length === 0, "training: zero console and page errors", page.errors.slice(0, 5));
  } catch (err){ console.log("FAILED", err.stack || err.message); check(false, "training: the run finished", String(err.message)); ok = false; }
  await close();
}
process.exit(done() && ok ? 0 : 1);
