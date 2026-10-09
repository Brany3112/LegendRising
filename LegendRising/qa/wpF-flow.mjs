// qa/wpF-flow.mjs: the match day from the training ground's tunnel back out of it (DESIGN 2.4 WP-F acceptance, 3.4.1
// to 3.4.3). Owner: WP-F (Stage P2).
//
// A career at the ground at kick-off minus 60 walks into the tunnel; the travel card, the dressing room, the walk-out
// and the kick-off follow, a bot at the keys walking to its place. Checked:
//   - the player's displacement per frame never exceeds vmax*dt + 0.01 except while FADE.v >= 0.98;
//   - the camera owner is match-fp during live play; no life-tp view and no visible 2D match DOM;
//   - __fp.headless(5400) completes the match with zero console errors, MT.my populated, finaliseMatch applied (the
//     league table updated, the fixture marked done), the life clock at kick-off + 115 minutes (MATCH_LEN), and
//     control back at the ground tunnel.
//
//   QA_PORT=8770 node qa/wpF-flow.mjs [--gfx low]      exits 1 on any failed check; writes qa/out/wpF-flow.json
import {openDay, installBot, checker} from "./wpF-lib.mjs";
import {snap} from "./lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GFX = arg("--gfx", "low"), SHOTS = process.argv.includes("--shots");
const {check, done} = checker("wpF-flow");
const T = await openDay({gfx: GFX, role: "starter", before: 60});
const {page} = T;
let ok = false;
try {
  await installBot(page);
  const before = await page.evaluate(({lg, h}) => { const t = W.leagues[lg] && W.leagues[lg].tab; const row = t ? (Array.isArray(t) ? null : t[h]) : null; return {played: row ? row[0] : null, done: Object.keys(W.done).length, trust: S.trust}; }, T.info);
  // into the tunnel: the life world's own walk (W toward the tunnel's mouth), then the match day
  await page.evaluate(() => { window.__life.keysDown(["w"]); });
  await page.evaluate(() => { const L = window.__life; L.P.yaw = 0; });
  for (let i = 0; i < 400; i++){
    const s = await page.evaluate(() => { window.__life.stepN(2); return {go: window.__fp.state, z: window.__life.P.z}; });
    if (s.go) break;
  }
  await page.evaluate(() => window.__life.keysUp(["w"]));
  // the 950 ms fade into the tunnel runs on a real timer
  await page.waitForTimeout(1300);
  let s = await T.untilState("dressing", 4000);
  check(s.state === "dressing" && s.zone === "stadium", "the travel card, then the dressing room in the stadium", {state: s.state, zone: s.zone, min: s.min});
  check(s.min >= T.info.ko - 60 + 14 && s.min <= T.info.ko - 60 + 20, "the travel card passed the life clock (15 minutes to a home game, 45 away)", {min: s.min, ko: T.info.ko});
  await T.uncover();
  if (SHOTS) await T.draw(2), await snap(page, `wpF-flow-dressing-${GFX}`);
  // the manager's word, then the door
  await page.evaluate(() => { window.__fp.manager(); window.__fp.headOut(); });
  s = await T.st();
  check(s.state === "walkout", "the door: the walk-out", s.state);
  check(s.min === T.info.ko - 5, "heading out passes the clock to kick-off minus 5", {min: s.min, want: T.info.ko - 5});
  // the bot: out of the tunnel and to its place, then E
  let live = false;
  for (let i = 0; i < 2400 && !live; i++){
    await page.evaluate(() => {
      const F = window.__fp, sp = F.spot(), P = window.__life.P;
      let tx = sp ? sp.x : 0, tz = sp ? sp.z : -20;
      if (P.z < -40) { tx = P.x; tz = -38; }          // straight out of the corridor first
      const d = window.__bot.toward(tx, tz, .35);
      if (d < 1.2) F.input({type: "keydown", key: "e"}), F.input({type: "keyup", key: "e"}), F.ready();
      window.__bot.frame(1);
    });
    if (i % 30 === 0){ s = await T.st(); live = s.state === "live"; }
  }
  s = await T.st();
  check(s.state === "live", "everyone set and you at your place: the kick-off", s.state);
  await T.uncover();
  if (SHOTS) await T.draw(1), await snap(page, `wpF-flow-kickoff-${GFX}`);
  // some live play with the bot following the ball
  for (let i = 0; i < 600; i++){
    await page.evaluate(() => { const b = window.__fp.ball().p; window.__bot.toward(b.x, b.z, 1.2); window.__bot.frame(1); });
  }
  await page.evaluate(() => { window.__fp.input({type: "keyup", key: "w"}); });
  const R = await page.evaluate(() => {
    const rec = window.__bot.rec;
    let worst = -1, at = -1, bad = 0;
    rec.forEach((r, i) => { if (r.fade >= .98) return; const ex = r.dx - (r.vmax/60 + .01); if (ex > worst){ worst = ex; at = i; } if (ex > 0) bad++; });
    const liveRec = rec.filter(r => r.state === "live");
    return {frames: rec.length, worst, at, bad, atRec: rec[at], liveFrames: liveRec.length, liveTop: [...new Set(liveRec.map(r => r.top))], tp: rec.some(r => r.owners.includes("life-tp")),
      inMatch: rec.some(r => r.inMatch), dom2d: !!document.querySelector(".match-screen, #pitch")};
  });
  check(R.bad === 0, "the player's displacement per frame never exceeds vmax*dt + 0.01 outside a fade", {frames: R.frames, worstExcess: +R.worst.toFixed(4), bad: R.bad, at: R.atRec});
  check(R.liveFrames > 100 && R.liveTop.length === 1 && R.liveTop[0] === "match-fp", "the camera owner during live play is match-fp", R.liveTop);
  check(!R.tp && !R.inMatch && !R.dom2d, "no life-tp view and no 2D match DOM", {tp: R.tp, inMatch: R.inMatch, dom2d: R.dom2d});
  // the rest of the match, headless, then back out of the tunnel
  const h = await page.evaluate(() => window.__fp.headless(5400));
  await page.waitForTimeout(300);
  await T.step(4);
  const after = await page.evaluate(({lg, h, key}) => {
    const t = W.leagues[lg] && W.leagues[lg].tab; const row = t ? (Array.isArray(t) ? null : t[h]) : null;
    const L = window.__life;
    return {played: row ? row[0] : null, doneKey: !!W.done[key], done: Object.keys(W.done).length, min: S.life.min, zone: L.LIFE.zone, mode: L.modes.mode(), state: window.__fp.state,
      P: [L.P.x, L.P.z], inMatch: !!S.life.inMatch, last: S.lastMatch || null, top: L.camera.top()};
  }, T.info);
  check(h && h.phase === "over", "__fp.headless(5400) completes the match", h && {phase: h.phase, score: h.score});
  check(!!(h && h.my && h.my.mins > 0 && h.my.touches >= 0 && "goals" in h.my), "MT.my populated", h && h.my && {mins: h.my.mins, touches: h.my.touches, goals: h.my.goals});
  check(after.doneKey && (before.played == null || after.played === before.played + 1), "finaliseMatch applied: the fixture done, the league table updated", {before: before.played, after: after.played, done: after.doneKey});
  check(after.min === T.info.ko + 115, "the life clock at kick-off + 115 minutes", {min: after.min, want: T.info.ko + 115});
  check(after.zone === "ground" && after.mode === "life" && !after.state && Math.hypot(after.P[0], after.P[1] + 21) < 8 && after.top === "life-fp", "control back at the ground tunnel", after);
  check(!after.inMatch && !!after.last, "S.life.inMatch cleared, the match on the record", {inMatch: after.inMatch, last: after.last});
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
