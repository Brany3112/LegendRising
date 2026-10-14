// qa/tr2b-realmatch.mjs: one whole first-person match played with real input, using the TR-2b controls: C held to
// shield the ball with a man on you, the left button to make a standing tackle on the man on the ball, F at a run to
// slide in, plus the shots and passes of tr2-realmatch. Owner: the integrator (TR-2b merge). BUILD-PLAN section 0 "QA
// conventions" (real input for acceptance), Phase 2b (P2b-A engine, P2b-B input and animation); TRAINING-SPEC 3.
//
// Everything the player does goes through page.keyboard and page.mouse with the pointer locked by a real click; aim is
// a write to P.yaw and P.pitch (what a mouse move does). The match runs on its fixed steps (__fp.stepN) with a world
// frame after every 10. The first shield, standing tackle and slide are each shot as the player sees them, a moment
// after the press, in qa/out/tr2b-realmatch/.
//
//   QA_PORT=8765 node qa/tr2b-realmatch.mjs     exits 1 on any failed check
import fs from "node:fs";
import path from "node:path";
import {openDay, checker, installBot} from "./wpF-lib.mjs";
import {freeze, unfreeze, OUT} from "./lib.mjs";
import {clickReal, assertVisible, lockPointer} from "./trlib.mjs";
const OUTDIR = path.join(OUT, "tr2b-realmatch");
fs.mkdirSync(OUTDIR, {recursive: true});
const {check, done} = checker("tr2b-realmatch");
const T = await openDay({gfx: "low", role: "starter", before: 60});
const {page} = T;
const held = new Set();
const key = async (k, down) => { if (down && !held.has(k)){ held.add(k); await page.keyboard.down(k); } else if (!down && held.has(k)){ held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
let lmb = 0;
const t0 = Date.now();
const SEL = {ht: '.fp-overlay.ht button[data-ht="go"]', ft: '.fp-overlay.ft button[data-ft="go"]'};
let ok = false;
try {
  await installBot(page);
  await T.toMatch();
  await page.waitForTimeout(1300);
  await T.untilState("dressing", 6000);
  await page.evaluate(() => { window.__fp.manager(); window.__fp.headOut(); });
  await T.uncover();
  await unfreeze(page); await page.waitForTimeout(600);
  const lk0 = await lockPointer(page); await freeze(page);
  console.log("lock in tunnel", lk0);
  // the walk-out: real W toward the spot, real E there
  for (let i = 0; i < 3000; i++){
    const r = await page.evaluate(() => {
      const F = window.__fp, sp = F.spot(), P = window.__life.P, st = F.state;
      if (st !== "walkout") return {st};
      let tx = sp ? sp.x : -10, tz = sp ? sp.z : -36.8;
      if (P.z < -40){ tx = P.x; tz = -38; }
      const dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
      if (d > .35) P.yaw = Math.atan2(-dx, -dz);
      return {st, d, sp: !!sp};
    });
    if (r.st !== "walkout") break;
    await key("w", r.d > .35);
    if (r.sp && r.d < 1.2){ await key("w", false); await page.keyboard.press("e"); }
    await page.evaluate(() => window.__bot.frame(2));
  }
  await releaseAll();
  let s = await T.st();
  for (let i = 0; i < 200 && s.state !== "live"; i++){ await page.evaluate(() => window.__bot.frame(5)); s = await T.st(); }
  check(s.state === "live", "kick-off reached, you on the pitch", s.state);
  await T.uncover();
  const lk = await lockPointer(page);
  check(!!lk, "pointer locked by a real click", lk);
  let halves = new Set(), cards = {ht: 0, ft: 0}, kicks = 0, restartN = 0, holdN = 0, last = null;
  // the TR-2b controls: shields held (and steps seen shielding), tackle and slide presses, and the acts they started
  const use = {shieldPress: 0, shieldOn: 0, tacklePress: 0, slidePress: 0, tackleAct: 0, slideAct: 0}, shot = {};
  let shieldN = 0, pressN = 0, prevAct = null, slideTry = 0, lastSlide = -99;
  // (shot from the page's own frames: let it draw for a moment, then hold it again)
  const snap = async (name) => { if (shot[name]) return; shot[name] = true; await unfreeze(page); await page.waitForTimeout(120); await page.screenshot({path: `${OUTDIR}/${name}.png`, timeout: 120000}); await freeze(page); console.log("  shot", name); };
  for (let it = 0; it < 40000; it++){
    const r = await page.evaluate(() => {
      const F = window.__fp, L = window.__life, ms = F.ms, P = L.P;
      if (document.querySelector(".fp-overlay.ht button[data-ht=go]")) return {card: "ht"};
      if (document.querySelector(".fp-overlay.ft button[data-ft=go]")){ window.__ftMy = typeof MT !== "undefined" && MT && MT.my ? {mins: MT.my.mins, touches: MT.my.touches} : null; return {card: "ft"}; }
      const mode = L.modes.mode();
      if (!ms || F.state !== "live"){
        // (why you are off the pitch, once: sent off, hurt, or taken off; logged for the record)
        const a = ms && ms.agents[ms.me], n = document.getElementById("lifeNote");
        const why = a ? {sentOff: !!a.sentOff, injured: !!a.injured, onPitch: !!a.onPitch,
          ev: ms.events.filter(e => e.agent === a.id && /card|foul|injur|sub|off/.test(e.kind)).slice(-4).map(e => ({kind: e.kind, min: e.min, card: e.card, why: e.why}))} : null;
        return {st: F.state, mode, half: ms ? ms.half : null, why, note: n ? n.textContent : ""};
      }
      const me = F.me();
      const o = {st: F.state, mode, half: ms.half, min: Math.floor((ms.half - 1)*45 + ms.clock.sec/60), score: ms.score.slice(), t: ms.t};
      if (!me || !me.onPitch) return o;
      const b = ms.ball.p, gx = ms.dirs[me.team]*ms.spec.hx, dg = Math.hypot(gx - me.m.x, me.m.z);
      const mine = ms.poss.ctl === me.id, myRestart = ms.restart && ms.restart.taker === me.id;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      // the nearest opponent to me, the man on the ball, and what my body is doing (for the shield and the tackles)
      let od = 1e9; for (const x of ms.agents){ if (x.team !== me.team && x.team >= 0 && x.onPitch){ const q = Math.hypot(x.m.x - me.m.x, x.m.z - me.m.z); if (q < od) od = q; } }
      const C = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
      o.od = od; o.cd = C && C.team !== me.team ? Math.hypot(C.m.x - me.m.x, C.m.z - me.m.z) : null; o.spd = me.m.speed; o.booked = !!me.booked;
      o.sh = !!(me.shield && me.shield.on) || !!me.intent.shield; o.shOn = !!(me.shield && me.shield.on); o.myAct = me.act ? me.act.kind : null;
      if (C && C.team !== me.team){ o.cx = C.m.x; o.cz = C.m.z; }
      if (myRestart){ P.yaw = Math.atan2(-(gx - b.x), -(-b.z)); P.pitch = -.25; o.act = "restart"; }
      else if (mine && od < 2.2 && dg >= 25){ P.yaw = Math.atan2(-(gx - P.x), -(0 - P.z)); P.pitch = -.2; o.act = "shield"; }
      else if (o.cd != null && o.cd < 6){ P.yaw = Math.atan2(-(C.m.x - P.x), -(C.m.z - P.z)); P.pitch = -.3; o.act = "press"; }
      else if (mine && dg < 25){ P.yaw = Math.atan2(-(gx - P.x), -(0 - P.z)); P.pitch = -.05; o.act = "shoot"; }
      else if (mine){ P.yaw = Math.atan2(-(gx - P.x)*.7, -(-P.z)); P.pitch = -.2; o.act = "pass"; }
      else { P.yaw = Math.atan2(-(b.x - P.x), -(b.z - P.z)); o.act = "chase"; o.d = d; }
      return o;
    });
    if (r.card){
      await releaseAll(); if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
      const c = r.card;
      const v = await assertVisible(page, SEL[c]);
      const lock = await page.evaluate(() => document.pointerLockElement ? document.pointerLockElement.id : null);
      await page.screenshot({path: `${OUTDIR}/${c === "ht" ? "halftime" : "fulltime"}-card.png`, timeout: 120000});
      check(v.ok && lock === null, `the ${c === "ht" ? "half-time" : "full-time"} card seen, pointer free`, {why: v.why, top: v.top, lock});
      await clickReal(page, SEL[c]);
      cards[c]++;
      await page.waitForTimeout(400);
      if (c === "ht"){ await page.evaluate(() => window.__bot.frame(3)); const l2 = await lockPointer(page); console.log("relock after half time", l2); }
      continue;
    }
    if (r.half != null) halves.add(r.half);
    if (r.why && !r.why.onPitch && !use.offWhy){ use.offWhy = {why: r.why, note: r.note}; console.log("  off the pitch:", JSON.stringify(use.offWhy)); }
    if (r.mode === "life" && cards.ft) break;
    if (r.myAct !== prevAct && (r.myAct === "tackle" || r.myAct === "slide")){
      use[r.myAct + "Act"]++;
      // a few steps into it, as the player sees it
      await page.evaluate(() => { window.__fp.stepN(8); window.__bot.frame(1); });
      await snap(r.myAct === "tackle" ? "tackle-standing" : "tackle-slide");
    }
    prevAct = r.myAct;
    // (the shield shot: the engine's shield on, the man on you within a stride, the ball yours)
    if (r.sh){ use.shieldOn++; if (r.shOn && r.od < 1.4 && r.act === "shield") await snap("shield"); }
    if (r.act !== "shield" && held.has("c")){ await key("c", false); }
    if (r.st === "live" && r.act){
      if (r.act === "shield"){
        // C held with the man on you: no sprint, the ball on your far side, W to keep walking it toward their goal
        if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
        await key("Shift", false);
        if (!held.has("c")){ await key("c", true); use.shieldPress++; shieldN = 0; }
        await key("w", true);
        // after a while shielding, play it on: the pass
        if (++shieldN > 40){ await key("c", false); await page.mouse.down({button: "right"}); await page.mouse.up({button: "right"}); kicks++; shieldN = 0; }
      } else if (r.act === "press"){
        if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
        // (sprint in: every other closing run is a slide, so he stays at a run until the slide's range)
        // (and every run once a few standing tackles have been made with no slide yet, so a match always gets its try)
        const slideRun = slideTry % 2 === 0 || (use.slideAct === 0 && use.tacklePress >= 4);
        await key("w", r.cd > .9); await key("Shift", r.cd > (slideRun ? 1.7 : 3));
        pressN++;
        // close enough: a standing tackle with the left button; at a run from a little further, a slide (F) now and
        // then (at most one each 4 s of match, so the match still has its standing tackles)
        // (once booked, he eases off the standing tackles as a player would, so a second yellow does not end his match
        // before a slide has had its chance; the slide is still tried until one is made)
        if (r.cd < 1.5 && !r.myAct && pressN % 3 === 0 && !r.booked){ await page.mouse.down({button: "left"}); await page.mouse.up({button: "left"}); use.tacklePress++; slideTry++; }
        else if (slideRun && !(r.booked && use.slideAct > 0) && r.cd < 3.0 && r.cd > 1.8 && r.spd > 4.5 && !r.myAct && r.t - lastSlide > 4){ await page.keyboard.press("f"); use.slidePress++; lastSlide = r.t; slideTry++; }
      } else if (r.act === "restart"){
        await key("w", false); if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; kicks++; }
        if (++restartN > 4){ await page.mouse.down({button: "right"}); await page.mouse.up({button: "right"}); restartN = 0; kicks++; }
      } else if (r.act === "shoot"){
        await key("w", true);
        if (!lmb){ await page.mouse.down({button: "left"}); lmb = 1; holdN = 0; }
        else if (++holdN > 3){ await page.mouse.up({button: "left"}); lmb = 0; kicks++; }
      } else if (r.act === "pass"){
        await page.mouse.down({button: "right"}); await page.mouse.up({button: "right"}); kicks++;
      } else {
        if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
        await key("w", r.d > .8); await key("Shift", r.d > 12);
      }
    } else await releaseAll();
    // (the match plays on while you watch it from the bench, sent off or taken off: the real-input bot chases every
    // ball and can collect a second yellow card, a way a real match goes too)
    const st = await page.evaluate(() => { const F = window.__fp; let n = 0; if (F.state === "live" || F.state === "bench") n = F.stepN(10); window.__bot.frame(1); return n; });
    if (it % 200 === 0) console.log(`  ${Math.round((Date.now() - t0)/1000)} s: ${r.st} half ${r.half} minute ${r.min} score ${r.score} kicks ${kicks}`);
    last = r;
  }
  const after = await page.evaluate(() => ({mode: window.__life.modes.mode(), zone: window.__life.LIFE.zone, inMatch: !!S.life.inMatch, last: S.lastMatch || null, my: window.__ftMy || null}));
  if (last && last.st === "bench") console.log("  (you watched the end of it from the bench)");
  await page.screenshot({path: `${OUTDIR}/after.png`, timeout: 120000});
  console.log("after", JSON.stringify(after));
  check(cards.ht === 1 && halves.has(2), "half time card clicked, second half played", {cards, halves: [...halves]});
  check(cards.ft === 1, "full-time card clicked", cards);
  check(kicks > 0, "real-input kicks", kicks);
  console.log("TR-2b controls", JSON.stringify(use));
  check(use.shieldPress > 0 && use.shieldOn > 0, "C held with a man on you shields the ball (the engine's shield on)", use);
  check(use.tacklePress > 0 && use.tackleAct > 0, "the left button near the man on the ball made a standing tackle", use);
  check(use.slidePress > 0 && use.slideAct > 0, "F pressed at a run, in reach, made a slide", use);
  check(after.mode === "life" && after.zone === "ground" && !after.inMatch && after.last, "back at the ground, match recorded", after);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
