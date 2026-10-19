// qa/wpW1-call.mjs: the warm-up's call (addendum A1.8) on the real bench, the real match and the real input path.
// Owner: WP-W1 (Stage P2c). Contracts: addendum A1.8; DESIGN 1.4.20 (window.__fp), 3.4.2 (the bench).
//
//   - the call's minute: 10 to 15 match minutes before the planned change (sub 56 to 68, cameo 78 to 84), never in the
//     last minutes of the first half; the coach comes over when the clock gets there;
//   - the coach: walks over from the dugout, crouches in front of you on the seat, says a line, E to stand (the hint);
//   - E: the view rises off the seat (the eye from the bench's 1.18 m to standing height), you jog to the strip
//     behind the touchline, the set starts; the match keeps running all the while;
//   - 3 exercises when the call comes late, up to 5 when there is time;
//   - ignored: the coach gives up, you go on cold with no boost, a small trust cost (trustAdd through the port);
//   - E held on the seat (the skip to your call) stops at the coach's call;
//   - set randomness: sets differ between matches, and never the same set two matches running (the drawn rule and
//     the remembered last set);
//   - screenshots: the coach's call through your eyes, the view rising.
//
//   QA_PORT=8810 node qa/wpW1-call.mjs [--no-shots]      exits 1 on any failed check; writes qa/out/wpW1-call.json
import {openBench, checker} from "./wpW1-lib.mjs";

const SHOTS = !process.argv.includes("--no-shots");
const {check, done} = checker("wpW1-call");
const T = await openBench();
const {page} = T;
let ok = false;
try {
  // 1. the call's minute: the pure rule over many draws
  const cm = await page.evaluate(() => {
    const W = window.__fp.warm, out = {bad: [], n: 0, lo: 99, hi: -99, ht: 0};
    let s = 1; const r = () => { s = (s*16807) % 2147483647; return s/2147483647; };
    for (const subOn of [56, 58, 60, 62, 64, 66, 68, 78, 80, 82, 84]) for (let i = 0; i < 40; i++){
      const c = W.callMinute(subOn, r), d = subOn - c; out.n++;
      out.lo = Math.min(out.lo, d); out.hi = Math.max(out.hi, d);
      if (d < 10 || d > 15) out.bad.push([subOn, c]);
      if (c > 40 && c < 46) out.ht++;
    }
    return out;
  });
  check(cm.bad.length === 0 && cm.lo >= 10 && cm.hi <= 15, "the call comes 10 to 15 match minutes before the planned change", {n: cm.n, lo: cm.lo, hi: cm.hi});
  check(cm.ht === 0, "never in the first half's last minutes (moved to the second half)", cm.ht);
  // a change at 47 to 55: a call 10 to 15 minutes before would come in the first half's last minutes, so it comes at
  // the second half's first minute (late, a shorter set)
  const cm2 = await page.evaluate(() => {
    const W = window.__fp.warm, out = [];
    let s = 7; const r = () => { s = (s*16807) % 2147483647; return s/2147483647; };
    for (const subOn of [47, 50, 52, 55]) for (let i = 0; i < 20; i++){ const c = W.callMinute(subOn, r); if (c > 37 && c < 46 || c >= subOn) out.push([subOn, c]); }
    return out;
  });
  check(cm2.length === 0, "a change just after half time: the call waits for the second half, never in the last minutes of the first", cm2);
  const counts = await page.evaluate(() => { const W = window.__fp.warm; return [40, 66, 80, 100, 133, 200].map(s => [s, W.exerciseCount(s)]); });
  check(counts[0][1] === 3 && counts[1][1] === 3 && counts[4][1] === 5 && counts[5][1] === 5 && counts.every(c => c[1] >= 3 && c[1] <= 5), "3 exercises when the call comes late, up to 5 with time (real seconds left -> count)", counts);

  // 2. the call on the bench: the clock at minute 2, the call planned at 4, the change at 17
  await T.enter({startMin: 2, callAt: 4, subOn: 17});
  const s0 = await T.st();
  check(s0.state === "bench" && s0.seated && s0.phase === "wait", "seated on the bench, the warm-up waiting for its minute", s0);
  await T.until(`window.__fp.warm.S.phase !== "wait"`, 3000, 15);
  const s1 = await T.st();
  check(s1.phase === "call" && s1.min === 4, "the coach's call comes at its minute", {phase: s1.phase, min: s1.min});
  const c1 = await page.evaluate(() => { const k = window.__fp.warm.S.coach; return k ? {x: k.pos.x, z: k.pos.z} : null; });
  check(!!c1 && Math.abs(c1.x) > 13, "the assistant coach starts out at the dugout's far end", c1);
  await T.until(`window.__fp.warm.S.wantE`, 1500, 10);
  await T.step(80);
  const cc = await page.evaluate(() => {
    const W = window.__fp.warm.S, k = W.coach, P = window.__life.P, say = document.querySelector("#fpHud .fp-say"), hints = document.querySelector("#fpHud .fp-hints");
    return {mode: k && k.h ? k.h.mode : null, d: k ? Math.hypot(k.pos.x - P.x, k.pos.z - P.z) : 99, say: say ? say.textContent : "", hints: hints ? hints.textContent : "", seated: window.__fp.FS.seated};
  });
  check(cc.mode === "wu:crouch" && cc.d < 1.6, "he crouches in front of you on the seat", cc);
  check(/coach:/.test(cc.say) && /going on|you're on|get warm/i.test(cc.say) && !/\u2014/.test(cc.say), "and says a natural line (no dash)", cc.say);
  check(/E\s*stand up/i.test(cc.hints), "the hint: E to stand", cc.hints);
  if (SHOTS) await T.snap("call");
  // E: the view rises, you jog to the strip, the set starts; the clock runs on
  const eye0 = await page.evaluate(() => window.__life.cam.position.y);
  await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); });
  const rise = [];
  for (let i = 0; i < 8; i++){ await T.step(6); rise.push(await page.evaluate(() => +window.__life.cam.position.y.toFixed(3))); }
  const s2 = await T.st();
  check(!s2.seated && (s2.phase === "rise" || s2.phase === "jog"), "E stands you up", {phase: s2.phase, seated: s2.seated});
  check(eye0 < 1.3 && rise[rise.length - 1] > 1.55 && rise.slice(1).every((y, i) => y >= rise[i] - .02), "the view rises off the seat (smoothly)", {eye0, rise});
  if (SHOTS) await T.snap("rise");
  const min0 = s2.min;
  await T.until(`window.__fp.warm.S.phase === "drill"`, 1500, 20);
  const s3 = await T.st();
  check(s3.phase === "drill" && s3.P[0] < -17 && s3.P[0] > -29 && Math.abs(s3.P[1] + 35.85) < 1.6, "you jog to the warm-up strip behind the touchline", s3.P);
  check(s3.set && s3.set.length === 5, "five exercises with time to spare (13 minutes before the change)", s3.set);
  const run = await page.evaluate(() => ({live: window.__fp.ms.phase, running: window.__fp.ms.clock.running}));
  await T.step(600);
  const s4 = await T.st();
  check(s4.min > min0 && run.running, "the match keeps running while you warm up (the live clock)", {from: min0, to: s4.min, phase: run.live});
  const bug = await page.evaluate(() => document.querySelector("#fpHud .fp-min").textContent);
  check(/\d+'/.test(bug), "the scorebug's clock stays on screen", bug);

  // 3. a late call: 3 exercises
  await T.enter({startMin: 2, callAt: 3, subOn: 8, warmSet: null});
  await T.until(`window.__fp.warm.S.wantE`, 3000, 15);
  await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); });
  await T.until(`window.__fp.warm.S.phase === "drill"`, 1500, 20);
  const late = await T.st();
  check(late.set && late.set.length === 3, "a late call (5 minutes before the change): 3 exercises", late.set);
  const lateLine = await page.evaluate(() => window.__fp.warm.S.callLine);
  check(!/\u2014/.test(lateLine), "the late line reads naturally", lateLine);

  // 4. ignored: no E. The coach gives up, cold, no boost, the trust cost through the port
  await T.enter({startMin: 2, callAt: 3, subOn: 16});
  await T.until(`window.__fp.warm.S.wantE`, 3000, 15);
  const wait = await page.evaluate(() => window.__fp.warm.WU.WAIT_E);
  await T.step(Math.ceil((wait + 1)*60));
  const ig = await page.evaluate(() => {
    const F = window.__fp, W = F.warm, port = W.testPort(), rec = F.ms.bench[0].find(p => p.isMe);
    return {phase: W.S.phase, log: port.log, boost: port.warmBoost.get(), atBase: !!rec.atBase, seated: F.FS.seated, say: document.querySelector("#fpHud .fp-say").textContent};
  });
  check(ig.phase === "ignored", "left waiting, the coach gives up on you", ig.phase);
  check(ig.log.some(l => l[0] === "trust" && l[1] < 0 && l[1] >= -2), "a small trust cost (trustAdd)", ig.log.filter(l => l[0] === "trust"));
  check(ig.boost && ig.boost.rating === "cold" && ig.boost.all === 0 && !ig.atBase, "you go on cold: no boost on your numbers", ig.boost);
  check(ig.seated, "you stay on the bench", ig.seated);

  // 5. the skip to your call (E held on the seat) stops at the coach's call
  await T.enter({startMin: 2, callAt: 9, subOn: 22});
  await page.evaluate(() => window.__fp.skipToCall());
  for (let i = 0; i < 400; i++){ const sk = await page.evaluate(() => !!window.__fp.FS.skipping); if (!sk) break; await T.step(5); }
  await T.step(4);
  const sk = await page.evaluate(() => { const F = window.__fp, ms = F.ms; return {min: (ms.half - 1)*45 + Math.floor(ms.clock.sec/60) + 1, phase: F.warm.S.phase, callUp: !!ms.callUp, skipping: !!F.FS.skipping, seated: F.FS.seated}; });
  check(!sk.skipping && sk.min >= 9 && sk.min <= 10 && !sk.callUp && (sk.phase === "call" || sk.phase === "wait"), "the skip to your call stops at the coach's call", sk);

  // 6. set randomness and no repeat two matches running
  const sets = await page.evaluate(() => {
    const W = window.__fp.warm, out = {distinct: new Set(), repeats: 0, n: 0};
    const rng = seed => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; };
    let last = null;
    for (let i = 0; i < 300; i++){
      const n = 3 + (i % 3), set = W.pickSet(rng(1000 + i), n, last);
      out.n++; out.distinct.add(set.slice().sort().join(","));
      if (last && set.length === last.length && set.every(id => last.includes(id))) out.repeats++;
      if (set.length !== n || new Set(set).size !== n || !set.every(id => W.POOL[id])) out.bad = set;
      last = set;
    }
    // the same draw with the same last set comes out different from it: a pool of 9, sets of 5
    let same = 0; const L5 = W.pickSet(rng(7), 5, null);
    for (let i = 0; i < 200; i++){ const s = W.pickSet(rng(7), 5, L5); if (s.slice().sort().join() === L5.slice().sort().join()) same++; }
    return {distinct: out.distinct.size, repeats: out.repeats, n: out.n, bad: out.bad || null, same, pool: Object.keys(W.POOL).length};
  });
  check(sets.pool >= 8, "a pool of at least 8 exercises", sets.pool);
  check(sets.distinct > 60 && !sets.bad, "sets drawn per match vary", {distinct: sets.distinct, of: sets.n});
  check(sets.repeats === 0 && sets.same === 0, "never the same set two matches running", {repeats: sets.repeats, sameDraw: sets.same});
  // in the page, through the set remembered from the last match (the same seed both times: only the memory differs)
  const m1 = await (async () => { await T.enter({startMin: 2, callAt: 2, subOn: 16, warmLast: "memory", seed: 9}); await T.until(`window.__fp.warm.S.wantE`, 3000, 15); await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); }); await T.until(`window.__fp.warm.S.set`, 1500, 15); return (await T.st()).set; })();
  const m2 = await (async () => { await T.enter({startMin: 2, callAt: 2, subOn: 16, warmLast: "memory", seed: 9}); await T.until(`window.__fp.warm.S.wantE`, 3000, 15); await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); }); await T.until(`window.__fp.warm.S.set`, 1500, 15); return (await T.st()).set; })();
  check(m1 && m2 && m1.slice().sort().join() !== m2.slice().sort().join(), "two matches running on the same seed: a different set the second time", {m1, m2});

  check(page.errors.length === 0, "no console or page errors", page.errors.slice(0, 5));
  ok = done();
} catch(e){ console.error(e); check(false, "ran to the end", String(e && e.stack || e)); ok = done(); }
await T.close();
process.exit(ok ? 0 : 1);
