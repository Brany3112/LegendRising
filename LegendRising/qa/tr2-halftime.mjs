// qa/tr2-halftime.mjs: half time and full time played as a player plays them (the user's top reported bug: the match
// froze at half time). Every card is pressed with the real mouse at the button's on-screen box while the game holds
// the pointer (a real click on the 3D view took it), and every check of a card is a visibility check (the topmost
// element at the button's centre is the button, the black cover is not over it, its pixels are not black).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-halftime.mjs; MF-1 to MF-8, MF-11);
// TRAINING-SPEC section 2 (half time traced in real use, fixed at the cause, verified repeatedly).
//
// Scenarios (all by default, or the ones named on the command line):
//   test      test:11v11 three times in one page (1280x720, 1024x600, 1280x720): a goal on the half-time whistle that
//             never replays (MF-8), Esc in the walk-off and at the card (MF-2), the card's 60 s running out with nobody
//             at the mouse, a match that ended on a goal followed by a fresh one, full time's Continue (MF-4)
//   starter   a career starter: the half-time card, then the full-time card with the wheel and Tab at 1280x720 and
//             1024x600, and Continue back to the training ground
//   bench     a career substitute seated on the bench (1024x600)
//   skip      a career substitute skipping with E held into half time: the skip's score card is seen (MF-6)
//   entering  test:bench: called up and walking to the fourth official at the whistle, still so after the break, and on
//             at the fourth official (MF-7, MF-9)
//
//   QA_PORT=8840 node qa/tr2-halftime.mjs [test starter bench skip entering]
//   exits 1 on any failed check; writes qa/out/tr2-halftime.json
import {launch, career, freeze, unfreeze} from "./lib.mjs";
import {openDay, checker} from "./wpF-lib.mjs";
import {clickReal, assertVisible, lockPointer, pointerLocked, pressReal, boxOf} from "./trlib.mjs";

const want = process.argv.slice(2).filter(a => !a.startsWith("-"));
const RUN = n => !want.length || want.includes(n);
const {check, done} = checker("tr2-halftime");
const t0 = Date.now();
const log = (...a) => console.log(`  [${((Date.now() - t0)/1000).toFixed(0)} s]`, ...a);
const HT = '.fp-overlay.ht button[data-ht="go"]', FT = '.fp-overlay.ft button[data-ft="go"]';
const LIVE_HINTS = ["call for it", "sprint", "shoot", "pass"];

// the match day as the page sees it
const ST = page => page.evaluate(() => {
  const F = window.__fp, ms = F.ms, FS = F.FS, L = window.__life;
  return {state: F.state, mode: L.modes.mode(), phase: ms && ms.phase, half: ms && ms.half, dirs: ms && ms.dirs.slice(), sec: ms ? Math.round(ms.clock.sec) : null,
    onPitch: FS.onPitch, seated: !!FS.seated, called: !!FS.called, skipping: FS.skipping ? FS.skipping.kind : null, htCard: !!FS.htCard, htCardT: FS.htCardT,
    lock: document.pointerLockElement ? document.pointerLockElement.id || "?" : null, lockLost: L.FLAGS.lockLost, queue: F.ctrl.queue.length,
    goalEv: FS.goalEv, ckGoal: FS.ckGoal, ckNow: FS.ckNow, fade: +getComputedStyle(document.getElementById("lifeFade")).opacity,
    hints: (document.querySelector(".fp-hints") || {}).textContent || "", overlay: (document.getElementById("fpOverlay") || {}).className || ""};
});
// world frames in the page until a condition holds (a function's source, evaluated there), at most max frames
const framesUntil = (page, cond, max = 20000, per = 60) => page.evaluate(([c, max, per]) => {
  const f = new Function("return (" + c + ")")();
  for (let i = 0; i < max; i++){ if (f()) return i; window.__life.stepN(1); }
  return f() ? max : -1;
}, [cond.toString(), max, per]);
const frames = (page, n) => page.evaluate(n => window.__life.stepN(n), n);
const realFrames = async (page, ms) => { await unfreeze(page); await page.waitForTimeout(ms); await freeze(page); };
const liveHints = s => LIVE_HINTS.filter(w => s.hints.toLowerCase().includes(w));

// the card's checks: the button seen and hittable, the pointer free, no live-play hint over it
async function atCard(page, sel, tag){
  const v = await assertVisible(page, sel);
  check(v.ok, `${tag}: the button passes assertVisible`, v.ok ? {top: v.top, fade: v.fade, lit: v.lum && +v.lum.lit.toFixed(2)} : v);
  const s = await ST(page);
  check(s.lock === null, `${tag}: the pointer is let go (pointerLockElement null)`, s.lock);
  check(!liveHints(s).length, `${tag}: no live-play hints while the card is up (MF-11)`, s.hints);
  return {v, s};
}
// the half-time card's button clicked for real: the state moves on within 1 s, the second half, the ends changed
async function clickSecondHalf(page, tag, wantState){
  const before = await ST(page);
  // (a real click on the card's dim backdrop first: it must not reach the match, MF-5)
  const bx = await boxOf(page, ".fp-overlay.ht .fp-box");
  if (bx) await page.mouse.click(Math.max(8, bx.left - 30), Math.max(8, bx.top - 20));
  const c0 = Date.now();
  await clickReal(page, HT);
  let s = await ST(page);
  while (s.state === "halftime" && Date.now() - c0 < 1000){ await page.waitForTimeout(50); s = await ST(page); }
  const took = Date.now() - c0;
  check(s.state === wantState && took <= 1000, `${tag}: a real click on Second half moves the state to ${wantState} within 1 s`, {state: s.state, ms: took});
  check(s.half === 2 && s.dirs[0] === -before.dirs[0], `${tag}: the second half, ends changed`, {half: s.half, dirs: s.dirs, before: before.dirs});
  check(s.queue === 0, `${tag}: CTRL.queue is empty at the kick-off`, s.queue);
  return s;
}
// a goal for your side struck into the net now (a ball just short of the line, flying in): a scripted goal
const scriptGoal = page => page.evaluate(() => {
  const F = window.__fp, ms = F.ms, me = F.me(), t = me ? me.team : 0, dir = ms.dirs[t], b = ms.ball, hx = ms.spec.hx;
  // (their keeper stepped aside to the far post, so nothing stops it)
  const gk = ms.gks[1 - t] >= 0 ? ms.agents[ms.gks[1 - t]] : null;
  if (gk){ gk.m.x = gk.x0 = dir*(hx - .5); gk.m.z = gk.z0 = -3.2; gk.m.vx = gk.m.vz = gk.m.speed = 0; gk.act = null; if (gk.gk){ gk.gk.state = "ready"; gk.gk.plan = null; } }
  b.p.x = dir*(hx - .35); b.p.y = .6; b.p.z = 2.6; b.v.x = dir*16; b.v.y = 0; b.v.z = 0; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = false;
  b.last.agent = me ? me.id : -1; b.last.team = t; ms.poss.ctl = -1; ms.cutStep = ms.step;
  return ms.score.slice();
});
// play on into a half's added time with the ball live, then the clock on to the end of the added time: a goal now is the
// half's last moment (its dead ball ends the half, rules.js refStep)
const toWhistleWindow = async page => {
  const n = await framesUntil(page, () => { const ms = window.__fp.ms, C = ms.clock; return C.addedSet && ms.phase === "live"; }, 30000);
  await page.evaluate(() => { const C = window.__fp.ms.clock; C.sec = Math.max(C.sec, 2700 + C.added*60); });
  return n;
};

/* ---------- test:11v11, three times in one page ---------- */
async function testRuns(){
  const {page, close} = await launch({gfx: "low", seed: 3});
  try {
    await career(page, {zone: "ground", min: 12*60});
    for (let it = 1; it <= 3; it++){
      const small = it === 2, tag = `test:11v11 #${it} ${small ? "1024x600" : "1280x720"}`;
      await page.setViewportSize(small ? {width: 1024, height: 600} : {width: 1280, height: 720});
      await page.evaluate(() => window.__fp.enter("test:11v11", {}));
      const s0 = await ST(page);
      if (it > 1) check(s0.goalEv == null && s0.ckGoal == null && s0.ckNow == null, `${tag}: a match after one that ended on a goal starts with goalEv, ckGoal and ckNow null (MF-8)`, s0);
      await realFrames(page, 1500);
      const lk = await lockPointer(page);
      check(!!lk, `${tag}: the pointer locked by a real click on the 3D view`, lk);
      await freeze(page);
      await page.evaluate(() => window.__fp.headless(2690));
      if (it === 1){
        // a goal on the half-time whistle (MF-8): the added time run out, your side scores, the half ends at that dead ball
        await toWhistleWindow(page);
        const sc = await scriptGoal(page);
        await framesUntil(page, () => window.__fp.state === "halftime", 600);
        const g = await page.evaluate(() => ({goals: window.__fp.ms.score.slice(), ev: !!window.__fp.FS.goalEv, st: window.__fp.state}));
        check(g.st === "halftime" && g.goals[0] + g.goals[1] > sc[0] + sc[1] && g.ev, `${tag}: a goal on the half-time whistle (scripted), its replay pending (FS.goalEv set)`, g);
      } else await framesUntil(page, () => window.__fp.state === "halftime", 20000);
      if (it === 1){
        // Esc in the walk-off, the pointer still held: half time is not play, nothing pauses (MF-2)
        await page.keyboard.press("Escape");
        if (await pointerLocked(page)) await page.evaluate(() => document.exitPointerLock());
        await page.waitForTimeout(100);
        const e = await ST(page);
        check(e.lock === null && !e.lockLost, `${tag}: Esc in the walk-off lets the pointer go and pauses nothing (FLAGS.lockLost false)`, {lock: e.lock, lockLost: e.lockLost});
      }
      const nUp = await framesUntil(page, () => !!document.querySelector('.fp-overlay.ht button[data-ht="go"]'), 600);
      check(nUp >= 0, `${tag}: the half-time card comes up after the walk-off`, nUp);
      await atCard(page, HT, tag);
      if (it === 2){
        // Esc at the card: the button stays seen and hittable, and its 60 s still run out
        await page.keyboard.press("Escape");
        await frames(page, 30);
        await atCard(page, HT, `${tag} after Esc`);
        const a = await ST(page);
        await frames(page, 61*60);
        const b = await ST(page);
        check(b.state === "live" && b.half === 2, `${tag}: after Esc the card's 60 s of frames still run out: the second half`, {htCardT0: a.htCardT, state: b.state, half: b.half});
        // nobody clicked: the pointer is taken back if the browser allows it, else the match waits on the pause card
        // (the lock asked back is waited for DAY.RELOCK s of real time)
        await page.waitForTimeout(900); await frames(page, 60);
        const p = await ST(page);
        const paused = /pause/.test(p.overlay);
        check(!!p.lock || paused && p.lockLost, `${tag}: with nobody at the mouse the match holds the pointer or waits on the pause card`, {lock: p.lock, overlay: p.overlay, lockLost: p.lockLost});
        if (!p.lock){
          const t1 = await ST(page); await frames(page, 30); const t2 = await ST(page);
          check(t2.sec === t1.sec, `${tag}: paused, the clock stands still`, {before: t1.sec, after: t2.sec});
          const lk2 = await lockPointer(page);
          await frames(page, 2);
          const q = await ST(page);
          check(!!lk2 && !q.lockLost && !/pause/.test(q.overlay), `${tag}: a real click on the 3D view takes the pointer back and play goes on`, {lock: lk2, lockLost: q.lockLost, overlay: q.overlay});
        }
      } else {
        const s = await clickSecondHalf(page, tag, "live");
        await realFrames(page, 600);
        const r = await ST(page);
        check(!!r.lock, `${tag}: the click took the pointer back`, r.lock);
        if (it === 1){
          check(s.goalEv == null && s.ckGoal == null && s.ckNow == null, `${tag}: FS.goalEv, ckGoal and ckNow are null after secondHalfGo (MF-8)`, {goalEv: s.goalEv, ckGoal: s.ckGoal, ckNow: s.ckNow});
          // the first 5 s of the second half: no goal card, no replay
          const seen = await page.evaluate(() => { let card = 0, replay = 0; for (let i = 0; i < 300; i++){ window.__life.stepN(1); if (document.querySelector(".fp-card.fp-k-goal")) card++; if (window.__fp.FS.replayQ) replay++; } return {card, replay}; });
          check(!seen.card && !seen.replay, `${tag}: no goal card and no replay in the first 5 s of the second half`, seen);
        }
      }
      // full time (the first match ends on a goal: the next one must start clean)
      await page.evaluate(() => window.__fp.headless(5330));
      if (it === 1){ await toWhistleWindow(page); await scriptGoal(page); }
      const nFt = await framesUntil(page, () => !!document.querySelector('.fp-overlay.ft button[data-ft="go"]'), 30000);
      check(nFt >= 0, `${tag}: the full-time card comes up`, nFt);
      await atCard(page, FT, `${tag} full time`);
      // Tab reaches Continue (the page's own focus, let through while the card is up)
      let focused = false;
      for (let k = 0; k < 4 && !focused; k++){ await pressReal(page, "Tab"); focused = await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ft="go"]')); }
      check(focused, `${tag} full time: Tab moves the focus to Continue`, focused);
      await clickReal(page, FT);
      await unfreeze(page);
      await page.waitForFunction(() => window.__fp.state === null && window.__life.modes.mode() === "life", null, {timeout: 60000});
      await page.waitForTimeout(800);
      await freeze(page);
      const l = await page.evaluate(() => ({mode: window.__life.modes.mode(), state: window.__fp.state, overlay: !!document.getElementById("fpOverlay")}));
      check(l.mode === "life" && l.state === null && !l.overlay, `${tag}: a real click on Continue leaves the match (the card gone)`, l);
    }
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, "test:11v11 runs finished", String(e.message)); }
  check(page.errors.length === 0, "test:11v11 runs: zero console and page errors", page.errors.slice(0, 5));
  await close();
}

/* ---------- a career match day ---------- */
async function careerDay(kind){
  const small = kind === "bench", tag = `career ${kind}${small ? " 1024x600" : ""}`;
  const T = await openDay({gfx: "low", role: kind === "starter" ? "starter" : "sub", before: 60, w: small ? 1024 : 1280, h: small ? 600 : 720});
  const {page} = T;
  try {
    const s0 = await T.toKickoff({sit: true});
    log(tag, "kick-off", s0.state);
    check(s0.state === (kind === "starter" ? "live" : "bench"), `${tag}: the kick-off (${kind === "starter" ? "on the pitch" : "seated on the bench"})`, s0.state);
    await T.uncover();
    await realFrames(page, 800);
    const lk = await lockPointer(page);
    check(!!lk, `${tag}: the pointer locked by a real click on the 3D view`, lk);
    await freeze(page);
    if (kind === "skip"){
      // E held on the bench at 30': the skip to your call runs into half time; its score card is seen (MF-6)
      await page.evaluate(() => window.__fp.headless(1800));
      await page.keyboard.down("e"); await frames(page, 70); await page.keyboard.up("e");
      const s = await ST(page);
      check(!!s.skipping, `${tag}: E held on the bench (real keyboard) starts the skip`, s.skipping);
      let seen = null;
      for (let i = 0; i < 400 && (await ST(page)).state !== "halftime"; i++){
        await frames(page, 4);
        if (!seen && await page.evaluate(() => !!document.querySelector(".fp-overlay.on .fp-skip"))){ const v = await assertVisible(page, ".fp-overlay.on .fp-skip"); if (v.ok) seen = v; }
      }
      check(!!seen, `${tag}: the skip's live score and minute card passes assertVisible during the skip (MF-6)`, seen ? {top: seen.top, lit: +seen.lum.lit.toFixed(2)} : null);
    } else {
      await page.evaluate(() => window.__fp.headless(2640));
    }
    await framesUntil(page, () => window.__fp.state === "halftime", 30000);
    const nUp = await framesUntil(page, () => !!document.querySelector('.fp-overlay.ht button[data-ht="go"]'), 600);
    check(nUp >= 0, `${tag}: the half-time card comes up`, nUp);
    await atCard(page, HT, tag);
    const s = await clickSecondHalf(page, tag, kind === "starter" ? "live" : "bench");
    if (kind === "bench") check(s.seated, `${tag}: still seated on the bench in the second half`, s.seated);
    if (kind === "skip") check(s.skipping === "call", `${tag}: the skip cut by half time carries on to your call`, s.skipping);
    await realFrames(page, 600);
    check(!!(await pointerLocked(page)), `${tag}: the click took the pointer back`, await pointerLocked(page));
    if (kind === "starter"){
      // full time: the card's Continue inside the viewport at both sizes, the wheel scrolls a long card, Tab reaches it
      await page.evaluate(() => window.__fp.headless(5340));
      const nFt = await framesUntil(page, () => !!document.querySelector('.fp-overlay.ft button[data-ft="go"]'), 30000);
      check(nFt >= 0, `${tag}: the full-time card comes up`, nFt);
      for (const vp of [{width: 1280, height: 720}, {width: 1024, height: 600}]){
        await page.setViewportSize(vp);
        await page.waitForTimeout(150);
        await atCard(page, FT, `${tag} full time ${vp.width}x${vp.height}`);
        const body = await boxOf(page, ".fp-overlay.ft .fp-box-body");
        const over = await page.evaluate(() => { const b = document.querySelector(".fp-overlay.ft .fp-box-body"); return b ? {sh: b.scrollHeight, ch: b.clientHeight, top: b.scrollTop} : null; });
        if (over && over.sh > over.ch + 2){
          await page.evaluate(() => { document.querySelector(".fp-overlay.ft .fp-box-body").scrollTop = 0; });
          await page.mouse.move(body.x, body.y); await page.mouse.wheel(0, 400); await page.waitForTimeout(250);
          const top = await page.evaluate(() => document.querySelector(".fp-overlay.ft .fp-box-body").scrollTop);
          check(top > 0, `${tag} full time ${vp.width}x${vp.height}: the wheel scrolls the card`, {scrollTop: top, content: over.sh, box: over.ch});
        } else check(true, `${tag} full time ${vp.width}x${vp.height}: the card fits without scrolling`, over);
      }
      await page.mouse.move(5, 5);
      let focused = false;
      for (let k = 0; k < 4 && !focused; k++){ await pressReal(page, "Tab"); focused = await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ft="go"]')); }
      check(focused, `${tag} full time: Tab moves the focus to Continue`, focused);
      await clickReal(page, FT);
      await unfreeze(page);
      await page.waitForFunction(() => window.__fp.state === null && window.__life.modes.mode() === "life" && window.__life.LIFE.running, null, {timeout: 90000});
      const l = await page.evaluate(() => ({mode: window.__life.modes.mode(), zone: window.__life.LIFE.zone, inMatch: !!(S.life && S.life.inMatch)}));
      check(l.mode === "life" && l.zone === "ground" && !l.inMatch, `${tag}: a real click on Continue reaches the leave path (back at the training ground)`, l);
    }
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, `${tag}: the run finished`, String(e.message)); }
  check(page.errors.length === 0, `${tag}: zero console and page errors`, page.errors.slice(0, 5));
  await T.close();
}

/* ---------- called up at the whistle (MF-7, MF-9) ---------- */
async function enteringRun(){
  const tag = "test:bench entering";
  const {page, close} = await launch({gfx: "low", seed: 5});
  try {
    await career(page, {zone: "ground", min: 12*60});
    await page.evaluate(() => window.__fp.enter("test:bench", {startMin: 43, subOn: 44, callAt: 30}));
    await realFrames(page, 1500);
    const lk = await lockPointer(page);
    check(!!lk, `${tag}: the pointer locked by a real click on the 3D view`, lk);
    await freeze(page);
    // the call at 44': you are up and on your way (state entering)
    const n = await framesUntil(page, () => window.__fp.state === "entering", 30000);
    check(n >= 0, `${tag}: called up at 44' (state entering)`, n);
    // the match to the whistle (the simulation's own steps; your walk to the fourth official has not begun)
    await page.evaluate(() => { const F = window.__fp; for (let i = 0; i < 60*60*6 && F.ms.phase !== "halftime"; i++) F.stepN(1); });
    await framesUntil(page, () => window.__fp.state === "halftime", 600);
    const h = await page.evaluate(() => ({prev: window.__fp.FS.prevState, subs: window.__fp.ms.events.filter(e => e.kind === "sub").length}));
    check(h.prev === "entering" && h.subs === 0, `${tag}: at the whistle you are still walking to the fourth official (no change made without you)`, h);
    await framesUntil(page, () => !!document.querySelector('.fp-overlay.ht button[data-ht="go"]'), 600);
    await atCard(page, HT, tag);
    const s = await clickSecondHalf(page, tag, "entering");
    await frames(page, 12);
    const s2 = await ST(page);
    check(s2.state === "entering" && s2.called && /fourth official/.test(s2.hints), `${tag}: after the break still entering, FS.called true, the entering hint shown (MF-7)`, {state: s2.state, called: s2.called, hints: s2.hints});
    // nobody at the keys: after a while you head over by yourself, and go on at the fourth official
    const on = await framesUntil(page, () => window.__fp.FS.onPitch, 60*90);
    const e = await page.evaluate(() => { const F = window.__fp, me = F.me(), sp = F.entrySpot(), sub = F.ms.events.filter(x => x.kind === "sub").pop(); return {onPitch: F.FS.onPitch, me: me ? [+me.m.x.toFixed(2), +me.m.z.toFixed(2)] : null, spot: sp, at: sub ? [sub.x, sub.z] : null}; });
    const d = e.me && e.spot ? Math.hypot(e.me[0] - e.spot.x, e.me[1] - e.spot.z) : 99;
    check(on >= 0 && e.onPitch && d < 1.6, `${tag}: you come on at the fourth official (within 1.6 m of the entry spot)`, Object.assign(e, {d: +d.toFixed(2)}));
  } catch (err){ console.log("FAILED", err.stack || err.message); check(false, `${tag}: the run finished`, String(err.message)); }
  check(page.errors.length === 0, `${tag}: zero console and page errors`, page.errors.slice(0, 5));
  await close();
}

if (RUN("test")){ log("test:11v11 x3"); await testRuns(); }
if (RUN("entering")){ log("test:bench entering"); await enteringRun(); }
if (RUN("starter")){ log("career starter"); await careerDay("starter"); }
if (RUN("bench")){ log("career bench"); await careerDay("bench"); }
if (RUN("skip")){ log("career bench skip"); await careerDay("skip"); }
log("done");
process.exit(done() ? 0 : 1);
