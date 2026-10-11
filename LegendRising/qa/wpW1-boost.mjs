// qa/wpW1-boost.mjs: the warm-up's reward (addendum A1.8): the rating, the boost through the warmBoost contract, the
// boost on your agent for your first minutes on, 10 more after a goal or an assist ("On fire"), the Warm mark.
// Owner: WP-W1 (Stage P2c). Contracts: addendum A1.8 and the P2c contract with WP-W2 (window.motivation(),
// window.warmBoost {set, get, clear, extend}; the stand-in port in the test fixtures); DESIGN 1.4.20.
//
//   - rating to boost: Sharp, Ready, Cold from the warm-up's score; all stats +1 to +4 scaled by the result and by
//     motivation; a focus picked by the coach's style (attacking: Finishing or Dribbling; pressing: Stamina or
//     Acceleration; technical: Passing or Ball Control); 10 to 15 minutes;
//   - the boost goes onto the numbers your agent is made from when you go on, and comes off when its minutes are up
//     (your plain numbers back, nothing kept);
//   - a goal of yours while it lasts: extend(10) and the On fire mark;
//   - the Warm mark on the HUD: the boost and its minutes left, fading as they run down.
//
//   QA_PORT=8810 node qa/wpW1-boost.mjs [--no-shots]
import {openBench, checker} from "./wpW1-lib.mjs";

const SHOTS = !process.argv.includes("--no-shots");
const {check, done} = checker("wpW1-boost");
const T = await openBench();
const {page} = T;
let ok = false;
try {
  // 1. the mapping: score and motivation to the boost
  const map = await page.evaluate(() => {
    const W = window.__fp.warm, r0 = () => .3, r1 = () => .7, out = {rows: [], bad: []};
    for (const q of [0, .2, .42, .55, .72, .85, 1]) for (const mot of [0, 30, 60, 100]){
      const b = W.boostFor(q, mot, "attacking", r0);
      out.rows.push([q, mot, b.rating, b.all, b.mins, JSON.stringify(b.focus)]);
      if (b.all < 1 || b.all > 4 || b.mins < 10 || b.mins > 15) out.bad.push([q, mot, b]);
    }
    const mono = [0, .3, .6, .9].every(q => W.boostFor(q, 20, "pressing", r0).all <= W.boostFor(q, 95, "pressing", r0).all)
      && [0, 30, 60, 100].every(m => W.boostFor(.2, m, "technical", r0).all <= W.boostFor(.95, m, "technical", r0).all);
    const rating = [[.9, "sharp"], [.72, "sharp"], [.6, "ready"], [.42, "ready"], [.3, "cold"]].map(([q, want]) => W.boostFor(q, 60, "attacking", r0).rating === want);
    const styles = {};
    for (const st of ["attacking", "pressing", "technical"]) styles[st] = [W.boostFor(.8, 60, st, r0).focusName, W.boostFor(.8, 60, st, r1).focusName];
    const top = W.boostFor(1, 100, "attacking", r0), low = W.boostFor(.15, 0, "attacking", r0);
    return {bad: out.bad, mono, rating, styles, top: [top.rating, top.all, top.mins], low: [low.rating, low.all, low.mins], rows: out.rows};
  });
  check(map.bad.length === 0, "all stats +1 to +4, for 10 to 15 minutes, whatever the score and motivation", map.bad);
  check(map.mono, "bigger with a better warm-up and with more motivation", map.mono);
  check(map.rating.every(Boolean), "the rating: Sharp from 0.72, Ready from 0.42, Cold below", map.rating);
  check(map.top[0] === "sharp" && map.top[1] === 4 && map.top[2] === 15 && map.low[0] === "cold" && map.low[1] === 1 && map.low[2] <= 11, "a perfect, motivated warm-up gives +4 for 15 minutes; a poor one +1 for about 10", {top: map.top, low: map.low});
  check(JSON.stringify(map.styles) === JSON.stringify({attacking: ["Finishing", "Dribbling"], pressing: ["Stamina", "Acceleration"], technical: ["Passing", "Ball Control"]}), "the focus follows the coach's style", map.styles);
  const ba = await page.evaluate(() => {
    const W = window.__fp.warm, at = {power: 50, aero: 50, curve: 50, accuracy: 50, passing: 60, passacc: 55, pace: 60, acceleration: 62, sprintSpeed: 58, dribbling: 57, stamina: 50, composure: 52, tackling: 40, interception: 45, jumping: 50, heading: 48};
    const a0 = W.boostedAttrs(at, {all: 0, focus: {}}), b = W.boostedAttrs(at, {all: 3, focus: {stamina: 4, ctrl: 2}});
    return {d: {passing: b.passing - at.passing, stamina: b.stamina - at.stamina, accel: b.acceleration - at.acceleration, ctrl: +(b.ctrl - a0.ctrl).toFixed(2)}, same: at.passing === 60};
  });
  check(ba.d.passing === 3 && ba.d.stamina === 7 && ba.d.accel === 3 && ba.d.ctrl > 2 && ba.same, "the boost's numbers: every skill up by all, the focus on top, the derived ones worked out again (a new record)", ba.d);

  // 2. a whole run: the call, a quick warm-up (Tab), the call to go on, on with the boost, a goal, the boost off
  await T.enter({startMin: 2, callAt: 2, subOn: 6, style: "pressing", warmSet: ["knees", "quad", "hips"]});
  await T.until(`window.__fp.warm.S.wantE`, 3000, 15);
  await page.evaluate(() => { window.__fp.input({type: "keydown", key: "e"}); window.__fp.input({type: "keyup", key: "e"}); });
  await T.until(`window.__fp.warm.S.phase === "drill" && window.__fp.warm.S.sub === "go"`, 3000, 15);
  await page.evaluate(() => { window.__wbot.level = "good"; });
  await T.step(400);
  await page.evaluate(() => window.__fp.input({type: "keydown", key: "tab"}));
  await T.step(70);
  await page.evaluate(() => window.__fp.input({type: "keyup", key: "tab"}));
  await T.step(12);
  const w = await page.evaluate(() => {
    const F = window.__fp, W = F.warm, rec = F.ms.bench[0].find(p => p.isMe), b = W.port().warmBoost.get(), mark = document.querySelector("#fpHud .fp-warm");
    return {phase: W.S.phase, result: W.S.result, boost: b, hasBase: !!rec.atBase, dPass: rec.atBase ? rec.at.passing - rec.atBase.passing : null, dFocus: rec.atBase ? Object.keys(b.focus).map(k => [k, rec.at[k] - rec.atBase[k]]) : null,
      mark: mark ? {on: mark.classList.contains("on"), text: mark.textContent} : null};
  });
  check(w.phase === "done" && w.result && w.result.auto, "the warm-up done (the first set played, the rest finished with Tab)", w.result);
  check(w.boost && w.boost.all >= 1 && ["sharp", "ready", "cold"].includes(w.boost.rating) && (w.boost.focusName === "Stamina" || w.boost.focusName === "Acceleration"), "warmBoost.set with the rating, all, and a pressing coach's focus", w.boost);
  check(w.hasBase && w.dPass === w.boost.all && w.dFocus.every(([k, d]) => d === w.boost.all + w.boost.focus[k]), "the boost on the numbers your agent will be made from", {dPass: w.dPass, dFocus: w.dFocus});
  check(w.mark && w.mark.on && /Warm \+\d/.test(w.mark.text), "the Warm mark shows, waiting for you to go on", w.mark);
  // to the call (the change at 6), then by the fourth official until the change is made
  await T.until(`!!window.__fp.ms.callUp`, 9000, 60);
  await T.step(30);
  const back = await page.evaluate(() => ({state: window.__fp.state, say: document.querySelector("#fpHud .fp-say").textContent}));
  check(back.state === "entering" && /coach:/.test(back.say), "the coach calls you over when it is time to go on", back);
  await page.evaluate(() => { const L = window.__life, F = window.__fp.FS; L.P.x = -2.5; L.P.z = -34.9; if (F.own){ F.own.x = -2.5; F.own.z = -34.9; } });
  await T.until(`window.__fp.FS.onPitch`, 24000, 60);
  const on = await page.evaluate(() => {
    const F = window.__fp, ms = F.ms, me = F.me(), b = F.warm.port().warmBoost.get(), L = F.warm.boostLive();
    const min = (ms.half - 1)*45 + Math.floor(ms.clock.sec/60) + 1;
    return {on: F.FS.onPitch, min, until: b && b.untilMin, mins: b && b.mins, dPass: me && L ? me.at.passing - L.atBase.passing : null, all: b && b.all, live: !!L,
      vmax: me ? me.prm.vmax : null, a0: L ? L.atBase.acceleration : null, a1: me ? me.at.acceleration : null};
  });
  check(on.on && on.live && on.dPass === on.all, "on the pitch with the boost on your agent's numbers", on);
  // (read a moment after the change: the clock may have turned a minute since)
  check(on.until - on.mins >= on.min - 1 && on.until - on.mins <= on.min, "it lasts its minutes from when you go on", {min: on.min, mins: on.mins, until: on.until});
  await T.step(12);
  const mk = await page.evaluate(() => { const m = document.querySelector("#fpHud .fp-warm"); return {on: m.classList.contains("on"), text: m.textContent, op: +m.style.opacity}; });
  check(mk.on && /Warm \+\d/.test(mk.text) && /\d+'/.test(mk.text), "the Warm mark: the boost and the minutes left", mk);
  if (SHOTS) await T.snap("warm-mark");
  // a goal of yours while it lasts
  await page.evaluate(() => { const F = window.__fp, me = F.me(), ms = F.ms; F.FS.evq.push({kind: "goal", id: 99999, t: ms.t, team: me.team, scorer: me.id, assister: -1, x: 52, z: 0}); });
  await T.step(14);
  const fire = await page.evaluate(() => { const F = window.__fp, b = F.warm.port().warmBoost.get(), m = document.querySelector("#fpHud .fp-warm"); return {until: b.untilMin, fire: b.onFire, text: m.textContent, cls: m.className, log: F.warm.testPort().log.filter(l => l[0] === "extend")}; });
  check(fire.until === on.until + 10 && fire.fire && fire.log.length === 1 && fire.log[0][1] === 10, "a goal while it lasts: extend(10), on fire", fire);
  check(/On fire/.test(fire.text) && /fire/.test(fire.cls), "the On fire mark", fire.text);
  if (SHOTS) await T.snap("on-fire");
  // the time is up: the plain numbers back
  await page.evaluate(u => { const ms = window.__fp.ms; ms.clock.sec = (u - 1 - (ms.half - 1)*45)*60 + 2; }, fire.until);
  await T.step(6);
  const off = await page.evaluate(() => {
    const F = window.__fp, me = F.me(), b = F.warm.port().warmBoost.get(), m = document.querySelector("#fpHud .fp-warm"), rec = F.ms.bench[0].find(p => p.isMe);
    return {live: !!F.warm.boostLive(), boost: b, pass: me.at.passing, base: rec.atBase.passing, accel: me.at.acceleration, baseAcc: rec.atBase.acceleration, mark: m.classList.contains("on")};
  });
  check(!off.live && off.boost === null && off.pass === off.base && off.accel === off.baseAcc, "its minutes up, the boost comes off (your own numbers, the boost cleared)", off);
  check(!off.mark, "and the Warm mark goes", off.mark);
  check(page.errors.length === 0, "no console or page errors", page.errors.slice(0, 5));
  ok = done();
} catch(e){ console.error(e); check(false, "ran to the end", String(e && e.stack || e)); ok = done(); }
await T.close();
process.exit(ok ? 0 : 1);
