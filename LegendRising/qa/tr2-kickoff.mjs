// qa/tr2-kickoff.mjs: a kick-off that is yours never waits for ever (MF-3), in the browser, the real match day.
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-kickoff.mjs); TRAINING-SPEC section 2 (the
// half-time flow: "the second half never starts" had a second cause, the kick-off waiting on the player).
//
// test:11v11 with you the only striker and your side kicking off, the pointer held (a real click on the 3D view):
//   - nobody at the keys: "Take it." shows at 12 s (+-1), and at 25 s (+-1) a team-mate takes the kick-off and the
//     clock runs;
//   - the same after conceding (a goal scripted into your net: the kick-off after it is yours);
//   - a fresh match: a real right-button tap at 15 s, before the 25 s, takes the kick-off yourself.
//
//   QA_PORT=8840 node qa/tr2-kickoff.mjs      exits 1 on any failed check; writes qa/out/tr2-kickoff.json
import {launch, career, freeze, unfreeze} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";
import {lockPointer} from "./trlib.mjs";

const {check, done} = checker("tr2-kickoff");
const {page, close} = await launch({gfx: "low", seed: 4});

// world frames until the kick-off that is running now is taken (or 40 s); what the HUD said, and when (seconds from the
// restart's whistle, the match's own time)
const watchKickoff = (stopAt = null) => page.evaluate(stopAt => {
  const F = window.__fp, L = window.__life, ms = F.ms, R0 = ms.restart;
  const out = {taker0: R0 ? R0.taker : null, me: ms.me, takeIt: null, handed: null, clock: null, takenBy: null, stage0: R0 ? R0.stage : null};
  if (!R0) return out;
  // (only the notices of this kick-off: the cards already up are an earlier one's)
  for (const c of document.querySelectorAll("#fpHud .fp-card")) c.dataset.seen = "1";
  const cards = () => [...document.querySelectorAll("#fpHud .fp-card:not([data-seen])")].map(c => c.textContent).join(" | ");
  for (let i = 0; i < 60*40; i++){
    if (stopAt != null && ms.t - R0.t0 >= stopAt) break;
    L.stepN(1);
    const el = +(ms.t - R0.t0).toFixed(2), c = cards();
    if (out.takeIt == null && c.includes("Take it.")) out.takeIt = el;
    if (out.handed == null && c.includes("takes it instead")) out.handed = el;
    if (R0.taken && out.takenBy == null){ out.takenBy = R0.taker; out.takenAt = el; }
    if (out.clock == null && ms.clock.running && ms.phase === "live"){ out.clock = el; break; }
  }
  out.takerNow = R0.taker; out.stage = R0.stage;
  return out;
}, stopAt);

try {
  await career(page, {zone: "ground", min: 12*60});
  await page.evaluate(() => window.__fp.enter("test:11v11", {kickoffTeam: 0}));
  await unfreeze(page); await page.waitForTimeout(1500);
  check(!!(await lockPointer(page)), "the pointer locked by a real click on the 3D view");
  await freeze(page);
  const meSt = await page.evaluate(() => { const ms = window.__fp.ms, me = window.__fp.me(); return {slot: me.slot, sts: ms.agents.filter(a => a.team === me.team && (a.slot === "ST" || a.slot === "CF")).length, taker: ms.restart.taker === me.id}; });
  check(meSt.slot === "ST" && meSt.sts === 1 && meSt.taker, "you are your side's only striker and the kick-off is yours", meSt);

  // 1. nobody at the keys
  const a = await watchKickoff();
  check(a.takeIt != null && Math.abs(a.takeIt - 12) <= 1, "\"Take it.\" shows at 12 s", a.takeIt);
  check(a.handed != null && Math.abs(a.handed - 25) <= 1 && a.takenBy != null && a.takenBy !== a.me, "at 25 s a team-mate takes the kick-off", {handed: a.handed, takenBy: a.takenBy, me: a.me});
  check(a.clock != null && a.clock <= 25 + 8, "the clock runs once he has", a.clock);

  // 2. after conceding: a goal into your net, the kick-off after it is yours
  await page.evaluate(() => { for (let i = 0; i < 240; i++) window.__life.stepN(1); });
  const g = await page.evaluate(() => {
    const F = window.__fp, ms = F.ms, me = F.me(), t = me.team, dir = ms.dirs[1 - t], b = ms.ball, hx = ms.spec.hx;
    const gk = ms.agents[ms.gks[t]];
    gk.m.x = gk.x0 = dir*(hx - .5); gk.m.z = gk.z0 = -3.2; gk.m.vx = gk.m.vz = gk.m.speed = 0; gk.act = null; if (gk.gk){ gk.gk.state = "ready"; gk.gk.plan = null; }
    b.p.x = dir*(hx - .35); b.p.y = .6; b.p.z = 2.6; b.v.x = dir*16; b.v.y = 0; b.v.z = 0; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = false;
    const opp = ms.agents.find(o => o.team === 1 - t && o.slot === "ST");
    b.last.agent = opp ? opp.id : -1; b.last.team = 1 - t; ms.poss.ctl = -1; ms.cutStep = ms.step;
    const s0 = ms.score.slice();
    for (let i = 0; i < 30 && !(ms.restart && ms.restart.kind === "kickoff"); i++) window.__life.stepN(1);
    return {before: s0, after: ms.score.slice(), kickoff: !!(ms.restart && ms.restart.kind === "kickoff"), mine: !!(ms.restart && ms.restart.taker === me.id), team: ms.restart ? ms.restart.team : null, t};
  });
  check(g.kickoff && g.after[1 - g.t] === g.before[1 - g.t] + 1 && g.mine, "conceded: the kick-off after it is yours", g);
  const b = await watchKickoff();
  check(b.takeIt != null && Math.abs(b.takeIt - 12) <= 1, "after conceding: \"Take it.\" shows at 12 s", b.takeIt);
  check(b.handed != null && Math.abs(b.handed - 25) <= 1 && b.takenBy != null && b.takenBy !== b.me, "after conceding: at 25 s a team-mate takes it", {handed: b.handed, takenBy: b.takenBy, me: b.me});
  check(b.clock != null, "after conceding: the clock runs again", b.clock);

  // 3. a fresh match: you take it yourself with a real right-button tap at 15 s, under pointer lock
  await page.evaluate(() => window.__fp.exit());
  await page.evaluate(() => window.__fp.enter("test:11v11", {kickoffTeam: 0}));
  await unfreeze(page); await page.waitForTimeout(1500);
  const lk = await lockPointer(page);
  await freeze(page);
  const pre = await watchKickoff(15);
  check(!!lk && pre.takeIt != null && pre.handed == null, "a fresh match: the pointer held, \"Take it.\" shown, not yet handed on at 15 s", {lock: lk, pre});
  await page.mouse.down({button: "right"});
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__life.stepN(1); });
  await page.mouse.up({button: "right"});
  const c = await page.evaluate(() => {
    const F = window.__fp, ms = F.ms, me = F.me(), R0 = ms.restart;
    for (let i = 0; i < 180 && !(ms.phase === "live" && ms.clock.running); i++) window.__life.stepN(1);
    const k = ms.events.filter(e => e.kind === "kick" && e.agent === me.id);
    return {kicks: k.length, live: ms.phase === "live", t: R0 ? +(ms.t - R0.t0).toFixed(2) : null, takenBy: R0 && R0.taken ? R0.taker : null, me: me.id};
  });
  check(c.kicks >= 1 && c.takenBy === c.me && c.live && c.t < 25, "a real right-button tap before 25 s takes the kick-off yourself, and play goes live", c);
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
await close();
process.exit(done() ? 0 : 1);
