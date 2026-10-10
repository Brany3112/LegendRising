// qa/wpF-match.mjs: offside, the bench, half time and late arrival (DESIGN 2.4 WP-F acceptance; 1.5.7, 3.4.1 to 3.4.3).
// Owner: WP-F (Stage P2).
//   - test:offside-0.5: the flag goes up after 0.35 to 0.75 s, the whistle 0.25 s later, the notice names the margin
//     and the passer, and play restarts with an indirect free kick at the offender's position at involvement;
//   - bench: as a substitute, live watch at 1x, 2x and 4x; holding E skips to the call with at most 13 ms of simulation
//     work per frame; the player enters at the planned minute from the fourth official's position;
//   - half time: choosing water decrements S.inv.water by 1 through consume(); nothing is gained without an item;
//   - late arrival at kick-off minus 10: trustAdd(-3) once, role demoted to substitute; arrival after kick-off: the
//     elapsed minutes simulated headless behind the travel card.
//
//   QA_PORT=8770 node qa/wpF-match.mjs [--only offside,bench,halftime,late]    writes qa/out/wpF-match.json
import {launch, career, freeze} from "./lib.mjs";
import {openDay, checker} from "./wpF-lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg("--only", "offside,bench,halftime,late").split(",");
const {check, done} = checker("wpF-match");
let ok = true;
const errs = [];

/* ---------- offside ---------- */
if (ONLY.includes("offside")) try {
  const {page, close} = await launch({gfx: "low", seed: 7});
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  const r = await page.evaluate(() => {
    const F = window.__fp, L = window.__life;
    F.enter("test:offside-0.5");
    const ms = F.ms, me = F.me(), info = F.testInfo();
    let touch = null, flag = null, off = null, at = null;
    for (let i = 0; i < 600 && !off; i++){
      L.stepN(1);
      if (!touch){ const e = ms.events.find(e => e.kind === "touch" && e.agent === me.id); if (e){ touch = e; at = {x: me.m.x, z: me.m.z}; } }
      if (!flag) flag = ms.events.find(e => e.kind === "flag") || null;
      off = ms.events.find(e => e.kind === "offside") || null;
    }
    L.stepN(2);
    const cards = Array.from(document.querySelectorAll(".fp-card")).map(n => n.textContent);
    const R0 = ms.restart;
    return {touch: touch && {t: touch.t, x: touch.x, z: touch.z}, at, flag: flag && {t: flag.t, margin: flag.margin}, off: off && {t: off.t, margin: off.margin, passer: off.passerName}, cards,
      restart: R0 && {kind: R0.kind, team: R0.team, x: R0.spot.x, z: R0.spot.z}, meTeam: me.team, passer: ms.agents[info.mate].name, margin: info.margin};
  });
  const dFlag = r.flag && r.touch ? r.flag.t - r.touch.t : null, dWh = r.off && r.flag ? r.off.t - r.flag.t : null;
  check(dFlag != null && dFlag >= .35 && dFlag <= .75, "offside 0.5 m: the flag goes up 0.35 to 0.75 s after the involvement", {dFlag, flag: r.flag});
  check(dWh != null && Math.abs(dWh - .25) < .02, "the whistle 0.25 s after the flag", dWh);
  const card = r.cards.find(t => /Offside/.test(t)) || "";
  check(/0\.5 m/.test(card) && card.includes(r.passer), "the notice names the margin and the passer", card);
  check(!!r.restart && r.restart.kind === "indirect" && r.restart.team !== r.meTeam && r.at && Math.hypot(r.restart.x - r.touch.x, r.restart.z - r.touch.z) < 1.0,
    "play restarts with an indirect free kick at the offender's position at involvement", {restart: r.restart, touch: r.touch});
  if (page.errors.length) errs.push(...page.errors);
  await close();
} catch (e){ ok = false; console.log("FAILED offside", e.stack || e.message); check(false, "offside ran", String(e.message)); }

/* ---------- the bench ---------- */
if (ONLY.includes("bench")) try {
  const T = await openDay({gfx: "low", role: "sub", before: 60});
  const s = await T.toKickoff({sit: true});
  const plan = await T.page.evaluate(() => ({role: MT.role, subOn: MT.subOn, state: window.__fp.state, seated: window.__fp.FS.seated}));
  check(s.state === "bench" && plan.seated && (plan.role === "sub" || plan.role === "cameo"), "a substitute walks out to the dugout and sits on the bench", plan);
  // live watch at 1x, 2x and 4x: steps a frame
  const rates = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, out = {};
    for (const [k, rate] of [["1", 1], ["2", 2], ["3", 4]]){
      F.input({type: "keydown", key: k}); F.input({type: "keyup", key: k});
      L.stepN(3);
      const n = []; for (let i = 0; i < 30; i++){ L.stepN(1); n.push(F.FS.stepsLast); }
      out[rate] = {ff: F.FS.ffRate, mean: n.reduce((a, b) => a + b, 0)/n.length};
    }
    F.input({type: "keydown", key: "1"});
    return out;
  });
  check(rates[1].mean === 1 && rates[2].mean === 2 && rates[4].mean === 4, "watching from the bench at 1x, 2x and 4x (steps a frame)", rates);
  // hold E: the skip to the call under a card, at most 13 ms of simulation work a frame
  const sk = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms;
    F.input({type: "keydown", key: "e"});
    const ms0 = [], card = [];
    for (let i = 0; i < 20000 && !(F.FS.called && !F.FS.skipping); i++){
      L.stepN(1);
      if (F.FS.skipping || F.FS.skipMs){ if (F.FS.skipMs) ms0.push(F.FS.skipMs); F.FS.skipMs = 0; }
      if (i % 200 === 0){ const o = document.querySelector(".fp-overlay.on .fp-skip"); if (o) card.push(o.textContent); }
      if (ms.phase === "over") break;
    }
    F.input({type: "keyup", key: "e"});
    return {frames: ms0.length, max: Math.max(...ms0), called: F.FS.called, callUp: ms.callUp, min: Math.floor(((ms.half - 1)*2700 + ms.clock.sec)/60), state: F.state, card: card.slice(0, 2), P: [window.__life.P.x, window.__life.P.z]};
  });
  check(sk.frames > 10 && sk.max <= 13, "holding E skips to the call with at most 13 ms of simulation work a frame", {frames: sk.frames, maxMs: +sk.max.toFixed(2)});
  check(sk.called && sk.card.length > 0 && /\d+'/.test(sk.card[0]), "the skip runs under a card with the live score and minute", sk.card[0]);
  // the change at the next stoppage: on from beside the fourth official
  const on = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms;
    const P0 = {x: L.P.x, z: L.P.z};
    let ev = null;
    for (let i = 0; i < 20000 && !ev; i++){ L.stepN(1); ev = ms.events.find(e => e.kind === "sub" && ms.agents[e.in] && ms.agents[e.in].isMe) || null; if (ms.phase === "over") break; }
    L.stepN(2);
    const me = F.me();
    return {ev: ev && {min: ev.min != null ? ev.min : null, t: ev.t}, minute: Math.floor(((ms.half - 1)*2700 + ms.clock.sec)/60), subOn: ms.cfg.roleTimes.subOn, P0, start: me && me.onT && me.on.length ? {x: me.m.x, z: me.m.z} : null, state: F.state, entry: ms.cfg.me.team === 0 ? -2.5 : 2.5, hz: ms.spec.hz};
  });
  check(!!on.ev && on.state === "live" && on.minute >= on.subOn, "the player comes on at the planned minute (at the next stoppage)", on);
  check(Math.hypot(on.P0.x - on.entry, on.P0.z + on.hz + .9) < 1.2, "from the fourth official's position", {P: on.P0, entry: [on.entry, -(on.hz + .9)]});
  if (T.page.errors.length) errs.push(...T.page.errors);
  await T.close();
} catch (e){ ok = false; console.log("FAILED bench", e.stack || e.message); check(false, "bench ran", String(e.message)); }

/* ---------- half time ---------- */
if (ONLY.includes("halftime")) try {
  const T = await openDay({gfx: "low", role: "starter", before: 60});
  await T.toKickoff();
  const r = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms;
    S.inv.water = 2;
    F.headless(2699);
    for (let i = 0; i < 6000 && !(F.state === "halftime" && document.querySelector(".fp-overlay.ht")); i++) L.stepN(1);
    const card = document.querySelector(".fp-overlay.ht");
    const btn = card && card.querySelector('[data-drink="water"]');
    const w0 = S.inv.water, e0 = S.energy;
    if (btn) btn.click();
    const w1 = S.inv.water, e1 = S.energy;
    S.inv.water = 0;
    // with none left: the button pressed again gives nothing (consume refuses), and the card drawn again has it disabled
    const e2 = S.energy, h2 = S.hyd;
    const b1 = document.querySelector('.fp-overlay.ht [data-drink="water"]');
    if (b1) b1.click();
    const card2 = document.querySelector(".fp-overlay.ht"), b2 = card2 && card2.querySelector('[data-drink="water"]');
    const disabled = !!(b2 && b2.disabled);
    const rr = consume("water");
    return {state: F.state, card: !!card, btn: !!btn, w0, w1, e0, e1, disabled, refused: rr && rr.ok === false, e3: S.energy, e2, h3: S.hyd, h2};
  });
  check(r.card && r.btn, "half time: the dressing-room card with the drinks you have", r);
  check(r.w0 === 2 && r.w1 === 1, "choosing water decrements S.inv.water by 1 through consume()", {before: r.w0, after: r.w1});
  check(r.disabled && r.refused && r.e3 === r.e2 && r.h3 === r.h2, "nothing is gained without an item", r);
  if (T.page.errors.length) errs.push(...T.page.errors);
  await T.close();
} catch (e){ ok = false; console.log("FAILED halftime", e.stack || e.message); check(false, "half time ran", String(e.message)); }

/* ---------- late arrival ---------- */
if (ONLY.includes("late")) try {
  for (const [label, arriveRel] of [["at kick-off minus 10", -10], ["after kick-off", 10]]){
    const T = await openDay({gfx: "low", role: "starter", before: 60});
    // the clock set so you arrive arriveRel minutes from the kick-off (15 minutes to a home game, 45 away)
    const info = await T.page.evaluate(rel => {
      const f = todaysFixture(), ko = fixtureSlot(f).min, me = meP(), home = f.h === me.club, trav = home ? 15 : 45;
      S.life.min = ko + rel - trav; window.__life.pass(.01);
      return {ko, trav, trust: S.trust, home};
    }, arriveRel);
    if (arriveRel > 0 && info.trav === 45 && arriveRel + 45 > 25){
      // (an away match: the tunnel closes 25 minutes after the kick-off, so the latest arrival is 20 minutes in... still after it)
    }
    await T.toMatch();
    await T.page.waitForTimeout(1300);
    const st = arriveRel < 0 ? await T.untilState("dressing", 6000) : await T.untilState("bench", 20000, 60);
    const r = await T.page.evaluate(() => ({trust: S.trust, role: MT && MT.role, late: MT && MT.late, state: window.__fp.state, min: window.__fp.ms ? Math.floor(((window.__fp.ms.half - 1)*2700 + window.__fp.ms.clock.sec)/60) : null}));
    check(Math.abs(r.trust - (info.trust - 3)) < 1e-9 && r.late && (r.role === "sub" || r.role === "cameo"), `late ${label}: trustAdd(-3) once, the role demoted to substitute`, {trustBefore: info.trust, after: r.trust, role: r.role});
    if (arriveRel > 0) check(st.state === "bench" && r.min >= arriveRel, "arrival after kick-off: the elapsed minutes played out headless behind the travel card, then the bench", {state: st.state, minute: r.min});
    if (T.page.errors.length) errs.push(...T.page.errors);
    await T.close();
  }
} catch (e){ ok = false; console.log("FAILED late", e.stack || e.message); check(false, "late arrival ran", String(e.message)); }

check(errs.length === 0, "zero console and page errors", errs.slice(0, 5));
process.exit(done() && ok ? 0 : 1);
