// qa/wpW2-effskill.mjs: the warm-up's boost in effSkill with a boost active and not, in a real match; the Motivation
// multipliers where the match reads them; and the match's result moving Motivation (addendum A1.8).
// Owner: WP-W2 (stage P2c).
//
//   QA_PORT=8811 node qa/wpW2-effskill.mjs     exits 1 on any failed check, console error or page error;
//                                             writes qa/out/wpW2-effskill.json
//
// A career at the ground walks out for a league match as a starter (wpF-lib openDay, toKickoff). Live, with MT the
// match's own mirror: no boost first (effSkill as the nerves and tired legs leave it), then warmBoost.set for twelve
// match minutes: every skill up by `all`, the focus on top, through career.js effSkills, the bridge's effSkills and the
// attributes built from them (Ball Control and Agility follow); S.skills never changes. Played on headless past
// untilMin, the boost is off and effSkill is back where it was. Motivation: the strike's rhythm window (control.js
// rhythmOf) is wider at 100 and narrower at 0 than at 60, where it is exactly as before; staminaF likewise. Full time:
// the result and the rating move Motivation once, with a reason the panel can show.
import {openDay, checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpW2-effskill");
const T = await openDay({gfx: "low", role: "starter", before: 60});
const {page} = T;
let ok = false;
try {
  const s = await T.toKickoff();
  check(s.state === "live", "a starter at the kick-off", s.state);
  const live = await page.evaluate(async () => {
    const bridge = await import("./js/life/football/bridge.js"), attrs = await import("./js/life/football/attrs.js");
    const at = () => attrs.attrsForPlayer(bridge.effSkills(), S.items || {}, S.traits || {});
    const skills0 = JSON.stringify(S.skills);
    warmBoost.clear();
    const off = {pass: effSkill("passing"), drib: effSkill("dribbling"), acc: effSkill("acceleration"), comp: effSkill("composure"), b: bridge.effSkills().passing, at: at(), hit: skillHit()};
    const until = MT.minute + 12;
    const set = warmBoost.set({rating: "sharp", all: 3, focus: {ballControl: 2}, untilMin: until});
    const on = {pass: effSkill("passing"), drib: effSkill("dribbling"), acc: effSkill("acceleration"), comp: effSkill("composure"), b: bridge.effSkills().passing, at: at(), g: warmBoost.get()};
    return {off, on, set, until, key: MT.f.key, minute: MT.minute, same: JSON.stringify(S.skills) === skills0};
  });
  check(live.set && live.set.fkey === live.key && live.set.active, "warmBoost.set during the match: tied to this fixture and active", {fkey: live.set && live.set.fkey, key: live.key, minute: live.minute});
  const cap = v => Math.min(99, v);
  check(live.on.acc === cap(live.off.acc + 3) && live.on.pass === cap(live.off.pass + 5) && live.on.drib === cap(live.off.drib + 5) && live.on.comp === cap(live.off.comp + 5),
    "active: all +3, the Ball Control focus +2 on dribbling, composure and passing", {off: live.off, on: live.on});
  check(live.on.b === live.on.pass && live.off.b === live.off.pass, "the bridge's effSkills is career.js effSkill, boosted the same", {off: live.off.b, on: live.on.b});
  check(live.on.at.ctrl > live.off.at.ctrl + 4 && live.on.at.agility > live.off.at.agility + 2.9, "the attributes built from it follow (Ball Control, Agility)",
    {ctrl: [live.off.at.ctrl, live.on.at.ctrl], agility: [live.off.at.agility, live.on.at.agility]});
  check(live.same, "S.skills is never written");
  check(live.on.g.left === 12 && live.on.g.rating === "sharp" && !live.on.g.onFire, "get(): twelve minutes left, sharp, not on fire yet", live.on.g);
  // on, headless, to five minutes before it ends: still on; then past it: off
  const mid = await page.evaluate(u => { window.__fp.headless((u - 5)*60); return {minute: MT.minute, pass: effSkill("passing"), g: warmBoost.get()}; }, live.until);
  const midWant = await page.evaluate(() => Math.min(99, Math.max(5, Math.round(S.skills.passing*(1 - skillHit()))) + 5));
  check(mid.g.active && mid.pass === midWant, "five minutes before untilMin: still on (on top of the day's hit as it is now)", {mid, want: midWant});
  const ext = await page.evaluate(() => ({ok: warmBoost.extend(10), g: warmBoost.get()}));
  check(ext.ok && ext.g.onFire && ext.g.untilMin === live.until + 10, "a goal or an assist while it is on: extend(10), on fire", ext.g);
  const after = await page.evaluate(u => { window.__fp.headless((u + 11)*60); return {minute: MT.minute, pass: effSkill("passing"), drib: effSkill("dribbling"), g: warmBoost.get(), hit: skillHit()}; }, live.until);
  check(!after.g.active && after.minute > live.until + 10, "past untilMin: off", {minute: after.minute, until: after.g.untilMin});
  const back = await page.evaluate(() => ({pass: effSkill("passing"), want: Math.max(5, Math.round(S.skills.passing*(1 - skillHit())))}));
  check(back.pass === back.want, "effSkill is back to the skill less the day's hit", back);
  check(await page.evaluate(() => warmBoost.extend(10)) === false, "extend() after it is over does nothing");

  // Motivation where the match reads it: control.js rhythmOf (the strike's rhythm window) and staminaF
  const mot = await page.evaluate(async () => {
    const CT = await import("./js/life/football/control.js");
    const me = {m: {speed: 6}, g: {mode: "run", phi: .3}, at: {aero: 40, curve: 40, ctrl: 40, dribbling: 40, passing: 40, composure: 40}, scale: 1};
    const at = v => { S.player.motivation = v; const r = CT.rhythmOf(me, "R"); return {rhythm: r.rhythm, on: r.on, timing: motivationTiming(), stam: staminaF()}; };
    const res = {m60: at(60), m100: at(100), m0: at(0)};
    S.player.motivation = 60;
    return res;
  });
  check(mot.m60.on && mot.m60.rhythm > 0 && mot.m60.rhythm < 1, "a strike out of rhythm (the window is being measured)", mot.m60);
  check(Math.abs(mot.m100.rhythm - mot.m60.rhythm/1.1) < 1e-9 && Math.abs(mot.m0.rhythm - mot.m60.rhythm/.9) < 1e-9 && mot.m60.timing === 1,
    "Motivation 100 widens the rhythm window by 10%, 0 narrows it by 10%, 60 leaves it as it was", mot);
  check(mot.m100.stam < mot.m60.stam && mot.m0.stam > mot.m60.stam, "staminaF: a little less energy a minute when motivated, a little more when flat", {m0: mot.m0.stam, m60: mot.m60.stam, m100: mot.m100.stam});

  // full time: the result and the rating move Motivation, once, with a reason
  const ft = await page.evaluate(() => {
    S.player.motivation = 60; delete S.player.motivWhy; S.player.motivRun = {loss: 0, bench: 0, told: 0, band: ""};
    const h = window.__fp.headless(5400);
    return {h: {phase: h.phase, score: h.score, rating: h.rating}, m: S.player.motivation, why: S.player.motivWhy || null, run: S.player.motivRun, mt: typeof MT !== "undefined" && MT ? MT.minute : null};
  });
  check(ft.h.phase === "over", "the match played out to full time", ft.h);
  const [us, them] = ft.h.score ? (T.info.h === T.info.club ? ft.h.score : ft.h.score.slice().reverse()) : [0, 0];
  const want = (us > them ? 2 : us === them ? .3 : -1) + (ft.h.rating >= 7.5 ? 1.5 : ft.h.rating >= 7 ? .7 : ft.h.rating < 5.8 ? -1 : 0);
  check(Math.abs(ft.m - (60 + want)) < 1e-6, "Motivation moved by the result and the rating", {m: ft.m, want: 60 + want, us, them, rating: ft.h.rating});
  check(ft.why && typeof ft.why.t === "string" && ft.why.t.length > 10 && !ft.why.t.includes(String.fromCharCode(0x2014)), "with a reason line for the panel", ft.why);
  check(ft.run.bench === 0 && ft.run.loss === (us < them ? 1 : 0), "the runs: off the bench, the losing run as the result says", ft.run);
  ok = true;
} catch(e){ check(false, "no exception", String(e && e.stack || e)); }
finally {
  const errs = page.errors.slice();
  check(!errs.length, "no console or page errors", errs.slice(0, 5));
  const all = done();
  await T.close();
  console.log(all && ok ? "wpW2-effskill: pass" : "wpW2-effskill: FAIL");
  process.exit(all && ok ? 0 : 1);
}
