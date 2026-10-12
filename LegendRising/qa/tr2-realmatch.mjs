// qa/tr2-realmatch.mjs: one whole first-person match played with real input, from the walk-out to back at the
// ground. Owner: the integrator (TR-2 merge). BUILD-PLAN section 0 "QA conventions" (real input for acceptance) and
// P2-A (the half-time and full-time cards as a player meets them); TRAINING-SPEC section 2 (half time in real use).
//
// The walk-out and the whole match go through page.keyboard (W, Shift, E) and page.mouse (the left button held and let
// go to shoot, the right button tapped to pass and to take a restart of yours) with the pointer locked by a real click.
// Aim is a write to P.yaw and P.pitch, which is what a mouse move does (world.js look()). The talk with the manager in
// the dressing room is the one scripted step (__fp.manager and headOut). The match runs on its own fixed steps
// (__fp.stepN) with a whole world frame after every 10, as int-fullmatch does. At each card: assertVisible on its
// button, the pointer let go, a screenshot of the screen as the player sees it, and a real click.
//
//   QA_PORT=8765 node qa/tr2-realmatch.mjs     exits 1 on any failed check; screenshots in qa/out/tr2-realmatch/
import fs from "node:fs";
import path from "node:path";
import {openDay, checker, installBot} from "./wpF-lib.mjs";
import {freeze, unfreeze, OUT} from "./lib.mjs";
import {clickReal, assertVisible, lockPointer} from "./trlib.mjs";
const OUTDIR = path.join(OUT, "tr2-realmatch");
fs.mkdirSync(OUTDIR, {recursive: true});
const {check, done} = checker("tr2-realmatch");
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
  for (let it = 0; it < 40000; it++){
    const r = await page.evaluate(() => {
      const F = window.__fp, L = window.__life, ms = F.ms, P = L.P;
      if (document.querySelector(".fp-overlay.ht button[data-ht=go]")) return {card: "ht"};
      if (document.querySelector(".fp-overlay.ft button[data-ft=go]")){ window.__ftMy = typeof MT !== "undefined" && MT && MT.my ? {mins: MT.my.mins, touches: MT.my.touches} : null; return {card: "ft"}; }
      const mode = L.modes.mode();
      if (!ms || F.state !== "live") return {st: F.state, mode, half: ms ? ms.half : null};
      const me = F.me();
      const o = {st: F.state, mode, half: ms.half, min: Math.floor((ms.half - 1)*45 + ms.clock.sec/60), score: ms.score.slice()};
      if (!me || !me.onPitch) return o;
      const b = ms.ball.p, gx = ms.dirs[me.team]*ms.spec.hx, dg = Math.hypot(gx - me.m.x, me.m.z);
      const mine = ms.poss.ctl === me.id, myRestart = ms.restart && ms.restart.taker === me.id;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if (myRestart){ P.yaw = Math.atan2(-(gx - b.x), -(-b.z)); P.pitch = -.25; o.act = "restart"; }
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
    if (r.mode === "life" && cards.ft) break;
    if (r.st === "live" && r.act){
      if (r.act === "restart"){
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
  check(after.mode === "life" && after.zone === "ground" && !after.inMatch && after.last, "back at the ground, match recorded", after);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
