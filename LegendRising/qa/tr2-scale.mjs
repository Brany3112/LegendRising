// qa/tr2-scale.mjs: in a career match every player is as tall in the simulation as his body is drawn, you too, and your
// eye does not jump when the match starts (browser, a career match day).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-scale.mjs: MV-10); TRAINING-SPEC section 2
// (camera: a believable eye level).
//
//   - each of the 22 agents' scale equals the scale of the body the view draws for him (human.js h.scale) within 0.001;
//     the substitutes on both benches carry their bodies' heights too (prebuilt looks);
//   - your agent's scale is your own look's height (the life body's, ME.scale);
//   - your eye (P.eye) on the last life frame before the match and on the first frame the match places you (the dressing
//     room) differ by 1 cm at most, and so do the last frame before the kick-off hand-over and the first one after it.
//   The harness's bands are checked apart (node qa/harness.mjs --n 200): its matches carry no scale, as before.
//
//   QA_PORT=8840 node qa/tr2-scale.mjs      exits 1 on any failed check; writes qa/out/tr2-scale.json
import {openDay, checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr2-scale");
const T = await openDay({gfx: "low", role: "starter", before: 60});
const {page} = T;
try {
  // every world frame's eye, state and mode from here on (the frames the day is lived in, drawn or not)
  await page.evaluate(() => {
    const L = window.__life, F = window.__fp, orig = L.stepN.bind(L);
    window.__eyes = [];
    L.stepN = (n, dt) => { let k = 0; for (; k < n; k++){ if (!orig(1, dt)) break; window.__eyes.push({eye: L.P.eye, st: F.state, mode: L.modes.mode()}); } return k; };
  });
  await T.step(20);
  const life = await page.evaluate(() => ({ME: window.__life.ME.scale, look: S.player.look && S.player.look.height}));
  const s0 = await T.toKickoff();
  check(s0.state === "live", "the kick-off, you at your place", s0.state);
  await T.step(30);
  const r = await page.evaluate(() => {
    const F = window.__fp, ms = F.ms, V = F.FS.V, out = [];
    for (const a of ms.agents){
      if (a.role !== "player" || !a.onPitch) continue;
      const R = V.rec[a.id], hs = R && R.h ? R.h.scale : null;
      out.push({id: a.id, isMe: a.isMe, gk: a.isGK, scale: a.scale, drawn: hs, d: hs == null ? 99 : Math.abs((a.scale || 1) - hs)});
    }
    const me = F.me(), meDrawn = V.fp ? V.fp.scale : null;
    const bench = [0, 1].flatMap(t => ms.bench[t].map(p => ({pid: p.pid, scale: p.scale || null})));
    return {agents: out, me: me ? {scale: me.scale, fp: meDrawn} : null, bench};
  });
  const bad = r.agents.filter(x => !(x.d <= 0.001));
  check(r.agents.length === 22 && !bad.length, "each of the 22 agents is as tall as his drawn body (within 0.001)", {n: r.agents.length, bad: bad.slice(0, 4), spread: [Math.min(...r.agents.map(x => x.scale)), Math.max(...r.agents.map(x => x.scale))]});
  check(r.agents.some(x => Math.abs(x.scale - 1) > .005), "the heights are the bodies' own (not all 1)", r.agents.map(x => +x.scale.toFixed(3)).slice(0, 8));
  check(r.bench.length > 0 && r.bench.every(p => p.scale > .8 && p.scale < 1.2), "the substitutes carry their heights too", r.bench.slice(0, 4));
  check(r.me && Math.abs(r.me.scale - life.ME) < 0.001 && Math.abs(r.me.fp - life.ME) < 0.001, "your agent's height is your own look's (the life body's)", {agent: r.me, life});
  const eyes = await page.evaluate(() => window.__eyes);
  const lastLife = [...eyes].reverse().find(e => e.mode === "life"), firstMatch = eyes.find(e => e.mode === "match" && e.st === "dressing");
  const iLive = eyes.findIndex(e => e.mode === "match" && e.st === "live"), beforeLive = iLive > 0 ? eyes[iLive - 1] : null, afterLive = iLive >= 0 ? eyes[iLive] : null;
  check(lastLife && firstMatch && Math.abs(lastLife.eye - firstMatch.eye) <= .01, "your eye on the last life frame and the first match frame (the dressing room) differ by 1 cm at most",
    {life: lastLife && +lastLife.eye.toFixed(4), match: firstMatch && +firstMatch.eye.toFixed(4)});
  check(beforeLive && afterLive && Math.abs(beforeLive.eye - afterLive.eye) <= .01, "your eye across the hand-over to your agent at the kick-off differs by 1 cm at most",
    {before: beforeLive && +beforeLive.eye.toFixed(4), after: afterLive && +afterLive.eye.toFixed(4), st: beforeLive && beforeLive.st});
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
await T.close();
process.exit(done() ? 0 : 1);
