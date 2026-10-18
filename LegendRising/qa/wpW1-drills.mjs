// qa/wpW1-drills.mjs: the warm-up's exercises (addendum A1.8), each played through the real input path by a bot that
// plays it well, badly, or not at all.
// Owner: WP-W1 (Stage P2c). Contracts: addendum A1.8; DESIGN 1.4.18 (the poses through human.js registerMode on the
// shared rig), 1.4.10 (the ball), 1.4.20 (window.__fp).
//
//   - every exercise of the pool is scored by its input: played well it scores high (Good and Perfect reps, a streak),
//     played badly it scores lower, left alone it scores nothing;
//   - each one is 8 to 15 s, with its own real first-person animation following the input (the body's pose changes
//     with what you do: the lunge's depth, the swinging leg, the knee's circle, the sway, the knees, the touch on the
//     ball, the pass), not an overlay; the fitness coach is there;
//   - clear pops (Good, Perfect, Streak x5), a sound per rep;
//   - Tab held finishes the whole warm-up at an average result;
//   - screenshots of every exercise through your own eyes (qa/out/wpW1/ex-<id>.png) and from outside (side-<id>.png).
//
//   QA_PORT=8810 node qa/wpW1-drills.mjs [--no-shots] [--only=id,id]
import {openBench, checker} from "./wpW1-lib.mjs";

const SHOTS = !process.argv.includes("--no-shots");
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const {check, done} = checker("wpW1-drills");
const T = await openBench();
const {page} = T;
let ok = false;
// one exercise alone, played at a level: its score, its reps, what the body did
async function play(id, level, shot = false){
  await page.evaluate(l => { window.__wbot.level = l; window.__wbot.last = {}; }, level);
  await T.enter({startMin: 2, callAt: 2, subOn: 18, warmSet: [id]});
  await T.until(`window.__fp.warm.S.wantE`, 3000, 15);
  await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); });
  await T.until(`window.__fp.warm.S.phase === "drill" && window.__fp.warm.S.sub === "go"`, 3000, 15);
  // through the set: the body's pose sampled (its mode and a few bones), the pops seen, the sounds asked for
  await page.evaluate(() => {
    const V = window.__fp.FS.V, h = V && V.fp, rec = window.__wrec = {modes: {}, poses: [], pops: new Set(), cues: 0, dur: window.__fp.warm.S.X.dur};
    const ob = new MutationObserver(() => { for (const n of document.querySelectorAll("#fpHud .fp-pop b")) rec.pops.add(n.textContent.replace(/\..*$/, "").replace(/x\d+/, "xN")); });
    ob.observe(document.querySelector("#fpHud .fp-pops"), {childList: true, subtree: true});
    rec.ob = ob;
  });
  let shotDone = false;
  for (let i = 0; i < 60; i++){
    const st = await page.evaluate(() => {
      const W = window.__fp.warm.S, V = window.__fp.FS.V, h = W.body || (V && V.fp), rec = window.__wrec;   // (the body the set poses: your whole one in third person, U21)
      if (h){ rec.modes[h.mode] = (rec.modes[h.mode] || 0) + 1; const q = Array.from(h.pose.slice(48, 80)).map(v => +v.toFixed(3)); rec.poses.push(q.join(",")); }
      return {phase: W.phase, sub: W.sub, t: W.X ? W.X.t : 0};
    });
    if (st.phase !== "drill" || st.sub !== "go") break;
    if (shot && !shotDone && st.t > 4.2){ shotDone = true; await T.snap("ex-" + id); await T.side("side-" + id); }
    await T.step(20);
  }
  await T.until(`window.__fp.warm.S.phase === "done"`, 1200, 20);
  return page.evaluate(() => {
    const W = window.__fp.warm.S, rec = window.__wrec; rec.ob.disconnect();
    const distinct = new Set(rec.poses).size;
    return {score: W.scores[0], result: W.result, modes: rec.modes, distinct, pops: [...rec.pops], dur: rec.dur, fit: !!W.fit};
  });
}
try {
  const ids = ONLY.length ? ONLY : await page.evaluate(() => Object.keys(window.__fp.warm.POOL));
  for (const id of ids){
    const good = await play(id, "good", SHOTS), bad = await play(id, "bad"), none = await play(id, "none");
    console.log(id, JSON.stringify({good: good.score, bad: bad.score, none: none.score, modes: good.modes, distinct: good.distinct, pops: good.pops}));
    check(good.dur >= 8 && good.dur <= 15, `${id}: lasts 8 to 15 s`, good.dur);
    check(good.score >= .6, `${id}: played well, it scores well`, good.score);
    check(bad.score < good.score - .1, `${id}: played badly, it scores lower`, {good: good.score, bad: bad.score});
    // (the balance can drift through the middle on its own now and then: little, never much)
    check(none.score <= .25 && none.score < good.score - .4, `${id}: left alone, it scores little or nothing`, none.score);
    check(good.pops.includes("Perfect") || good.pops.includes("Good"), `${id}: the pops (Good, Perfect)`, good.pops);
    const myModes = Object.keys(good.modes);
    check(myModes.length > 0 && good.distinct > 8, `${id}: your own body is posed through it, the pose changing with the input`, {modes: good.modes, distinct: good.distinct});
    check(good.fit, `${id}: the fitness coach is there`, good.fit);
  }
  // a streak pops "Streak x5" (the strides played well run a long one)
  const st = await play(ids.includes("knees") ? "knees" : ids[0], "good");
  check(st.pops.includes("Streak xN"), "a streak of five pops Streak x5", st.pops);
  // Tab held: the rest of the warm-up done at an average result
  await page.evaluate(() => { window.__wbot.level = "none"; });
  await T.enter({startMin: 2, callAt: 2, subOn: 18, warmSet: null});
  await T.until(`window.__fp.warm.S.wantE`, 3000, 15);
  await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); });
  await T.until(`window.__fp.warm.S.phase === "drill" && window.__fp.warm.S.sub === "go"`, 3000, 15);
  await page.evaluate(() => window.__fp.input({type: "keydown", key: "tab"}));
  const ring = [];
  for (let i = 0; i < 9; i++){ await T.step(8); ring.push(await page.evaluate(() => ({phase: window.__fp.warm.S.phase, tab: +window.__fp.warm.S.tab.toFixed(2), radar: document.querySelector("#fpHud").classList.contains("fp-tab")}))); }
  await page.evaluate(() => window.__fp.input({type: "keyup", key: "tab"}));
  await T.step(4);
  const tb = await page.evaluate(() => { const W = window.__fp.warm.S; return {phase: W.phase, result: W.result, log: window.__fp.warm.testPort().log.filter(l => l[0] === "set")}; });
  check(ring.some(r => r.tab > .3) && ring.every(r => !r.radar), "Tab held fills its ring (the overview stays shut)", ring);
  check(tb.phase === "done" && tb.result && tb.result.auto && Math.abs(tb.result.q - .55) < .06 && tb.result.rating === "ready", "Tab held finishes the warm-up at an average result (Ready)", tb.result);
  check(tb.log.length === 1 && tb.log[0][1].rating === "ready" && tb.log[0][1].all >= 1, "and its boost is set", tb.log);
  check(page.errors.length === 0, "no console or page errors", page.errors.slice(0, 5));
  ok = done();
} catch(e){ console.error(e); check(false, "ran to the end", String(e && e.stack || e)); ok = done(); }
await T.close();
process.exit(ok ? 0 : 1);
