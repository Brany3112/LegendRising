// qa/wpF-recover.mjs: a match interrupted by a closed page is played out on the next load (DESIGN 2.4 WP-F acceptance,
// 3.4.4 checkpoints and crash recovery). Owner: WP-F (Stage P2).
//
// Play to minute 30, let a dead-ball checkpoint be written, close the page, reopen and Continue: the remainder runs
// headless; the final score is at least the checkpoint score for both sides; the player's minutes equal the checkpoint
// minute; no missed-match penalty; S.life.inMatch is cleared and the fixture is done.
//
//   QA_PORT=8770 node qa/wpF-recover.mjs        exits 1 on any failed check; writes qa/out/wpF-recover.json
import {openDay, checker} from "./wpF-lib.mjs";
import {BASE, freeze} from "./lib.mjs";

const {check, done} = checker("wpF-recover");
const T = await openDay({gfx: "low", role: "starter", before: 60});
let ok = false, page2 = null;
try {
  const s0 = await T.toKickoff();
  check(s0.state === "live", "a starter on the pitch at the kick-off", s0.state);
  // to minute 30 headless, then on to the next dead ball (live frames), where the checkpoint is written
  await T.page.evaluate(() => window.__fp.headless(1800));
  let ck = null;
  for (let i = 0; i < 2000 && !ck; i++){
    ck = await T.page.evaluate(() => {
      const L = window.__life, ms = window.__fp.ms;
      L.stepN(10);
      if (ms.phase === "restart" || ms.phase === "kickoff"){ const r = window.__fp.checkpoint(); return r ? {min: Math.floor(((r.half - 1)*2700 + r.sec)/60), score: r.score.slice(), saved: !!localStorage.getItem("freyaFootball.slot1") || Object.keys(localStorage).some(k => /slot/.test(k)), key: r.fkey} : null; }
      return null;
    });
  }
  check(!!ck && ck.min >= 30, "a dead-ball checkpoint after minute 30, saved", ck);
  const before = await T.page.evaluate(() => ({news: (S.news || []).length, inMatch: !!S.life.inMatch}));
  // the page closes; the same browser opens the game again and continues the career
  const ctx = T.page.context();
  page2 = await ctx.newPage();
  page2.errors = [];
  page2.on("pageerror", e => page2.errors.push("pageerror: " + e.message));
  page2.on("console", m => { if (m.type() === "error") page2.errors.push("console.error: " + m.text()); });
  await T.page.close();
  await page2.goto(BASE + "index.html");
  await page2.waitForFunction(() => typeof A === "object" && typeof window.startLife === "function" && !!window.__life, null, {timeout: 120000});
  await page2.evaluate(() => A.city(1));
  await page2.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page2);
  const pre = await page2.evaluate(() => ({inMatch: !!S.life.inMatch, sec: S.life.inMatch ? S.life.inMatch.sec : null}));
  check(pre.inMatch, "the save holds the match in progress", pre);
  // the first quiet second: the card, the rest played out headless, 12 ms a frame
  let res = null;
  for (let i = 0; i < 4000 && !res; i++){
    res = await page2.evaluate(() => {
      window.__life.stepN(4);
      const R = window.__fp.RECOVER;
      if (R.out && R.finish){ const o = R.out; R.finish(); return o; }
      return null;
    });
  }
  await page2.evaluate(() => window.__life.stepN(4));
  const after = await page2.evaluate(key => ({inMatch: !!S.life.inMatch, done: !!W.done[key], news: (S.news || []).map(n => n.title || "").filter(t => /misses the match/.test(t)).length,
    last: S.lastMatch || null, min: S.life.min}), ck && ck.key);
  check(!!res, "the remainder runs headless to full time", res);
  check(!!res && res.score[0] >= ck.score[0] && res.score[1] >= ck.score[1], "the final score is at least the checkpoint score for both sides", {checkpoint: ck && ck.score, final: res && res.score});
  check(!!res && res.mins === ck.min, "the player's minutes equal the checkpoint minute", {mins: res && res.mins, checkpoint: ck && ck.min});
  check(after.news === 0, "no missed-match penalty", after.news);
  check(!after.inMatch && after.done, "S.life.inMatch cleared and the fixture done", after);
  check(page2.errors.length === 0 && T.page.errors.length === 0, "zero console and page errors", page2.errors.concat(T.page.errors).slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
