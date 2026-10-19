// qa/tr8-fullmatch.mjs: Full Match in Training Mode, played the player's way (browser).
// Owner: P8-B (Training Mode Phase 8). Contract: BUILD-PLAN P8-B acceptance "qa/tr8-fullmatch.mjs"; TRAINING-SPEC 0 (the
// keeper always the computer's) and 5 (Full Match: the real match system, from the kick-off or from the bench, team and
// role through the configuration, Reset Match, Reset Current Half, Restart from Kickoff, Return to Hub; never the career).
//
// Part A, a fresh page with no career:
//   1. the hub's Full Match category lists the kick-off and the bench entries; Start (a real click) plays the real
//      match on the Full cage, its dugouts registered as the cage's bench;
//   2. from the kick-off: half time and full time played through by real clicks on their cards; Continue goes back to
//      the hub (the pool back at 14, bodies() at 16, the window's listeners +0);
//   3. from the bench: the call-up, the walk to the fourth official, on at a stoppage; exactly one of me, the man
//      replaced off (subbedOff), control and camera mine (FP state, the view's me), no duplicate body;
//   4. real lines and restarts: a ball driven over the touchline is out and a throw-in at the line; over the goal line a
//      goal kick or a corner as the last touch says; the fence never sends it back (play stops);
//   5. the keeper: the role picker's and the position picker's DOM offer no keeper; for every start my agent is not a
//      keeper; a bench start never swaps me for the keeper; with my keeper sent off (scripted) I am never put in goal;
//   6. presets: a named 'fullmatch' preset (position LW, averages 70 and 55, 5-minute halves, the bench at 60'), saved
//      by real typing and clicks, reloaded, loaded by a real click: the configuration identical, and the match starts
//      with those values;
//   7. the quick menu (the match's pause card, up as the pointer goes) and the admin panel's Scenario and Match section:
//      Reset Current Half, Reset Match and Restart from Kickoff, each by real click (the two resets after their
//      confirmation), with tr8-reset's results;
//   8. the career untouched: no freyaFootball.v2 write, the career diff empty; 0 console and page errors.
// Part B, a career quit to the title: Full Match from the kick-off, my body in the created character's look; 0 errors.
//
//   QA_PORT=8882 node qa/tr8-fullmatch.mjs        exits 1 on any failed check; writes qa/out/tr8-fullmatch.json
import {freeze, unfreeze, launch, career, trainingStart} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, v2Writes, careerSnapshot, careerDiff, clickReal, pressReal} from "./tr4b-lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr8-fullmatch");

const listenersInit = () => {
  const live = window.__listeners = new Map();
  const key = (t, type, o) => [t === window ? "window" : "document", type, (typeof o === "boolean" ? o : !!(o && o.capture)) ? "c" : "b"].join(":");
  for (const T of [Window.prototype, Document.prototype]){
    const a = T.addEventListener, r = T.removeEventListener;
    T.addEventListener = function(type, fn, o){ const k = key(this, type, o); let s = live.get(k); if (!s) live.set(k, s = new Set()); s.add(fn); return a.apply(this, arguments); };
    T.removeEventListener = function(type, fn, o){ const s = live.get(key(this, type, o)); if (s) s.delete(fn); return r.apply(this, arguments); };
  }
};
const HELPERS = async () => {
  const Pool = await import("/js/life/train/pool.js"), Hu = await import("/js/life/human.js"), Sim = await import("/js/life/football/sim.js"), St = await import("/js/life/core/state.js");
  const Stad = await import("/js/life/football/stadium.js"), Cg = await import("/js/life/train/cage.js");
  const L = window.__life, F = window.__fp, C = window.__trainConfig;
  window.__t8b = {Pool, Hu, Sim, St, Stad, Cg,
    step(n){ for (let i = 0; i < n; i++) L.stepN(1, 1/60); },
    until(pred, max = 6000){ let i = 0; for (; i < max && !pred(); i++) L.stepN(1, 1/60); return i < max; },
    cfg(o = {}){ const c = C.defaults("fullmatch"); for (const [k, v] of Object.entries(o)) if (k === "opts") Object.assign(c.opts, v); else c[k] = v; return C.validate("fullmatch", c); },
    listeners(){ let n = 0; for (const s of window.__listeners.values()) n += s.size; return n; },
    // the pointer let go, as the world marks it (world.js: the lock lost while a match plays), and a frame stepped
    letGo(){ if (document.pointerLockElement) document.exitPointerLock(); F.FS.lockUsed = true; St.FLAGS.lockLost = true; L.stepN(1, 1/60); },
    // and back, as a click on the canvas would give it
    takeBack(){ St.FLAGS.lockLost = false; L.stepN(2, 1/60); },
    canon(ms){
      const seen = new Map();
      const walk = (v, at) => {
        if (v === null || v === undefined) return null; if (typeof v === "function") return "#fn";
        if (typeof v === "number") return Number.isFinite(v) ? v : String(v); if (typeof v !== "object") return v;
        if (seen.has(v)) return "#ref:" + seen.get(v); seen.set(v, at);
        if (ArrayBuffer.isView(v)) return Array.from(v);
        if (v instanceof Map) return {m: [...v].map(([k, x], i) => [walk(k, at + "k" + i), walk(x, at + "v" + i)])};
        if (v instanceof Set) return {s: [...v].map((x, i) => walk(x, at + "s" + i))};
        if (Array.isArray(v)) return v.map((x, i) => walk(x, at + "/" + i));
        const o = {}; for (const k of Object.keys(v).sort()) o[k] = walk(v[k], at + "." + k); return o;
      };
      const o = {}; for (const k of Object.keys(ms).sort()) if (!Sim.HALF_KEEP.includes(k)) o[k] = walk(ms[k], k);
      return JSON.stringify(o);
    }
  };
};
const fresh = page => page.evaluate(HELPERS);
// a card's button pressed for real once it is up (the page frozen around it: nothing redraws it under the click)
async function press(page, sel){
  await page.waitForFunction(s => !!document.querySelector(s), sel, {timeout: 15000});
  await clickReal(page, sel);
}
async function playThroughHT(page){
  const ok = await page.evaluate(() => window.__t8b.until(() => FP.state === "halftime" && window.__fp.FS.htCard, 60*360));
  if (!ok) return false;
  await press(page, 'button[data-ht="go"]');
  return page.evaluate(() => FP.state !== "halftime" && FP.ms.half === 2);
}

/* ================= Part A: a fresh page, no career ================= */
{
  const t = await trainLaunch({seed: 7});
  const page = t.page;
  await t.context.addInitScript(listenersInit);
  await page.reload();
  await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
  try {
    const careerBefore = await careerSnapshot(page);
    await enterByButton(page);
    await fresh(page);
    const l0 = await page.evaluate(() => window.__t8b.listeners());

    /* ---------- 1. the hub's entries; Start by a real click ---------- */
    await page.evaluate(() => window.__trainHub.openHub("fullmatch"));
    await page.waitForFunction(() => document.querySelectorAll('#sheetRoot [data-th="start"]').length >= 2, null, {timeout: 15000});
    const rows = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .th-sc b")].map(b => b.textContent));
    check(rows.includes("Full Match from the kick-off") && rows.includes("Full Match from the bench"), "the hub's Full Match category lists the kick-off and the bench entries", rows);
    // (shorter halves for the test: the configuration's own option, set as the sheet would)
    await page.evaluate(() => window.__trainHub.setScenarioConfig("fm-kickoff", window.__t8b.cfg({opts: {start: "kickoff", half: 3}})));
    await clickReal(page, '#sheetRoot [data-th="start"][data-id="fm-kickoff"]');
    await page.waitForFunction(() => window.FP.state === "live", null, {timeout: 120000});
    await freeze(page);
    const e1 = await page.evaluate(() => { const X = window.__t8b; X.step(3); const ms = FP.ms, me = ms.agents[ms.me];
      return {cage: X.Cg.CAGE.kind, zone: FP.training.zone, real: window.__fp.FS.real, hx: ms.spec.hx, out: ms.rules.out, half: ms.cfg.halfRealSec, me: {slot: me.slot, isGK: me.isGK},
        bench: X.Stad.benchOf("cage").seats().length, pool: X.Pool.poolStats().size, bodies: X.Hu.bodies().length}; });
    check(e1.cage === "full" && e1.zone === "cage" && !e1.real && e1.hx === 52.5 && e1.out === "stop", "Start plays the real match on the Full cage, real lines (out stops play), no career", e1);
    check(e1.bench === 12 && e1.bodies === e1.pool + 2, "the Full cage's dugouts are the cage's bench (6 seats a side); every body is the pool's", e1);

    /* ---------- 4. real lines and restarts ---------- */
    const lines = await page.evaluate(() => {
      const X = window.__t8b, ms = FP.ms, b = ms.ball;
      const drive = (x, z, vx, vz, lastTeam) => {
        ms.restart = null; ms.phase = "live"; ms.clock.running = true; ms.poss.ctl = -1;
        for (const a of ms.agents){ a.plan = null; a.act = null; }
        b.state = "free"; b.holder = -1; b.p.x = x; b.p.y = .11; b.p.z = z; b.v.x = vx; b.v.y = 0; b.v.z = vz; b.w.x = b.w.y = b.w.z = 0;
        b.last.team = lastTeam; b.last.agent = ms.agents.find(a => a.team === lastTeam && a.onPitch && !a.isGK).id;
        const ev0 = ms.events.length;
        let back = false, maxOut = 0;
        for (let i = 0; i < 120 && !ms.restart; i++){ X.step(1); maxOut = Math.max(maxOut, Math.abs(b.p.z) - ms.spec.hz, Math.abs(b.p.x) - ms.spec.hx); if (Math.abs(b.p.z) < ms.spec.hz - 1 && Math.abs(vz) > 0 && i > 30) back = true; }
        const out = ms.events.slice(ev0).find(e => e.kind === "out");
        return {out: out ? out.line : null, restart: ms.restart ? {kind: ms.restart.kind, team: ms.restart.team, x: +ms.restart.spot.x.toFixed(2), z: +ms.restart.spot.z.toFixed(2)} : null, back, phase: ms.phase};
      };
      const hz = ms.spec.hz, hx = ms.spec.hx;
      const touch = drive(5, hz - 3, 0, 14, 0);
      // over their goal line, wide of the posts: my side last (goal kick to them) and their side last (corner to me)
      const gk = drive(hx - 3, 12, 14, 0, 0);
      const ck = drive(hx - 3, 12, 14, 0, 1);
      return {touch, gk, ck, hz, dirs: ms.dirs.slice()};
    });
    check(lines.touch.out === "touch" && lines.touch.restart && lines.touch.restart.kind === "throw" && Math.abs(Math.abs(lines.touch.restart.z) - lines.hz) < .1 && !lines.touch.back,
      "a ball driven over the touchline is out: a throw-in at the line, never sent back by the fence", lines.touch);
    check(lines.gk.restart && lines.gk.restart.kind === "goalkick" && lines.ck.restart && lines.ck.restart.kind === "corner" && lines.gk.out === "goal" && lines.ck.out === "goal",
      "over the goal line: a goal kick (the attackers last) or a corner (the defenders last)", {gk: lines.gk, ck: lines.ck});

    /* ---------- 7a. the quick menu: the match's pause card, the three resets by real clicks ---------- */
    const pre = await page.evaluate(() => { const X = window.__t8b; FP.resetMatch(); X.step(600); X.letGo(); return {card: [...document.querySelectorAll("[data-q]")].map(b => b.dataset.q), t: FP.ms.t}; });
    check(["resume", "fm-half", "fm-match", "fm-kickoff", "fm-hub"].every(q => pre.card.includes(q)) && !pre.card.includes("restart"), "the pointer let go: the match's pause card, with Reset Current Half, Reset Match, Restart from Kickoff and Return to Hub", pre.card);
    await press(page, '[data-q="fm-match"]');
    const ask = await page.evaluate(() => ({q: [...document.querySelectorAll("[data-q]")].map(b => b.dataset.q), t: FP.ms.t}));
    await press(page, '[data-q="yes"]');
    const rm = await page.evaluate(() => { const ms = FP.ms; return {clock: ms.clock.sec, half: ms.half, score: ms.score.slice(), state: FP.state}; });
    check(ask.q.includes("yes") && ask.q.includes("cancel") && ask.t === pre.t && rm.clock === 0 && rm.half === 1 && rm.score.join("-") === "0-0" && rm.state === "live",
      "Reset Match from the card: asked first (Yes, Cancel), then the match from its kick-off", {ask, rm});
    const half = await page.evaluate(() => { const X = window.__t8b; X.takeBack(); X.step(400); const at = X.canon(Object.assign(Object.create(null), X.Sim.halfStart(FP.ms).data)); X.letGo(); window.__t8bAt = at; return true; });
    await press(page, '[data-q="fm-half"]'); await press(page, '[data-q="yes"]');
    const rh = await page.evaluate(() => ({same: window.__t8b.canon(FP.ms) === window.__t8bAt, state: FP.state}));
    check(half && rh.same && rh.state === "live", "Reset Current Half from the card (after its confirmation): the state of the half's start", rh);
    await page.evaluate(() => { const X = window.__t8b; X.takeBack(); X.step(300); FP.ms.score = [2, 1]; X.letGo(); window.__t8bK = {sec: FP.ms.clock.sec, score: FP.ms.score.slice()}; });
    await press(page, '[data-q="fm-kickoff"]');
    const rk = await page.evaluate(() => ({phase: FP.ms.phase, kind: FP.ms.restart && FP.ms.restart.kind, sec: FP.ms.clock.sec, before: window.__t8bK, score: FP.ms.score.slice()}));
    check(rk.phase === "kickoff" && rk.kind === "kickoff" && rk.sec === rk.before.sec && rk.score.join("-") === "2-1", "Restart from Kickoff from the card (no confirmation): a kick-off, the clock and the score kept", rk);

    /* ---------- 7b. the admin panel's Scenario and Match section ---------- */
    await page.evaluate(() => { window.__t8b.takeBack(); window.__t8b.step(200); });
    const adm = async (id, confirm) => {
      await page.evaluate(() => window.__trainKeys.adminToggle(true));
      await page.waitForFunction(() => !!document.querySelector('[data-ad="sec"][data-v="scenario"]'), null, {timeout: 10000});
      await clickReal(page, '[data-ad="sec"][data-v="scenario"]');
      await press(page, `[data-ad="qitem"][data-v="${id}"]`);
      if (confirm) await press(page, `[data-ad="qyes"][data-v="${id}"]`);
      return page.evaluate(() => ({clock: FP.ms.clock.sec, half: FP.ms.half, score: FP.ms.score.slice(), phase: FP.ms.phase, state: FP.state}));
    };
    await page.evaluate(() => { FP.ms.score = [1, 0]; });
    const a1 = await adm("fm-kickoff", false);
    await page.evaluate(() => window.__t8b.step(200));
    const a2 = await adm("fm-match", true);
    await page.evaluate(() => { const X = window.__t8b; X.step(300); window.__t8bAt = X.canon(Object.assign(Object.create(null), X.Sim.halfStart(FP.ms).data)); });
    const a3 = await adm("fm-half", true);
    const a3same = await page.evaluate(() => window.__t8b.canon(FP.ms) === window.__t8bAt);
    check(a1.phase === "kickoff" && a1.score.join("-") === "1-0", "the admin panel's Restart from Kickoff: a kick-off, the score kept", a1);
    check(a2.clock === 0 && a2.score.join("-") === "0-0" && a2.half === 1, "the admin panel's Reset Match, after its confirmation", a2);
    check(a3same && a3.state === "live", "the admin panel's Reset Current Half, after its confirmation: the state of the half's start", {a3, same: a3same});

    /* ---------- 2. from the kick-off: half time and full time by real clicks; Continue: the hub ---------- */
    await page.evaluate(() => FP.resetMatch());
    const ht = await playThroughHT(page);
    const ft = await page.evaluate(() => window.__t8b.until(() => FP.state === "fulltime" && window.__fp.FS.ftCard, 60*360));
    if (ft) await press(page, 'button[data-ft="go"]');
    await page.evaluate(() => window.__t8b.step(5));
    const back = await page.evaluate(() => ({state: FP.state, hub: window.__trainHub.hubOpen(), cat: window.__trainHub.hubCategory(), pool: window.__t8b.Pool.poolStats().size, bodies: window.__t8b.Hu.bodies().length, listeners: window.__t8b.listeners()}));
    check(ht && ft, "from the kick-off: half time and full time played through by real clicks on their cards", {ht, ft});
    check(!back.state && back.hub && back.cat === "fullmatch" && back.pool === 14 && back.bodies === 16, "Continue: back to the hub on Full Match, the pool back at 14 and bodies() at 16", back);
    check(back.listeners === l0, "the window's and document's listeners +0", {before: l0, after: back.listeners});

    /* ---------- 3 and 5. from the bench; the keeper ---------- */
    await page.evaluate(() => window.__trainHub.closeHub());
    const bench = await page.evaluate(() => {
      const X = window.__t8b, F = window.__fp, L = window.__life;
      window.__trainFull.startFullMatch(X.cfg({opts: {start: "bench", subMin: 46, half: 3}}));
      X.step(5);
      const ms = FP.ms, mine = () => ms.agents.filter(a => a.isMe).length + ms.bench.flat().filter(p => p.isMe && !p.used).length;
      const at0 = {state: FP.state, seated: F.FS.seated, me: ms.me};
      // to the second half (its card's button pressed as the page's own click: stepped frozen)
      X.until(() => FP.state === "halftime" && F.FS.htCard, 60*360);
      const go = document.querySelector('button[data-ht="go"]'); if (go) go.click();
      const called = X.until(() => F.FS.called, 60*240);
      const out = ms.callUp ? ms.agents[ms.callUp.out] : null;
      // the walk to the fourth official: to where a substitute steps on beside him (controller.js entrySpot, the halfway
      // line on the bench side), within reach of the fourth official the cage's bench provider puts there
      const fo = X.Stad.benchOf("cage").fourthOfficial(ms.spec), t0 = 0, ex = (t0 === 0 ? -1 : 1)*2.5, ez = -(ms.spec.hz + .9);
      L.P.x = ex; L.P.z = ez; if (F.FS.own){ F.FS.own.x = L.P.x; F.FS.own.z = L.P.z; }
      void fo;
      X.step(10);
      const atFourth = F.FS.atFourth;
      // a stoppage: the ball over the touchline
      if (ms.phase === "live"){ const b = ms.ball; b.state = "free"; b.holder = -1; ms.poss.ctl = -1; b.p.x = 20; b.p.y = .3; b.p.z = ms.spec.hz - 1; b.v.x = 0; b.v.y = 0; b.v.z = 8; }
      const on = X.until(() => F.FS.onPitch, 60*90);
      const me = ms.me >= 0 ? ms.agents[ms.me] : null;
      const drawn = F.FS.V.rec.filter(R => R && R.h && R.h.g && R.h.g.parent && R.a.isMe).length;
      return {at0, called, atFourth, on, mine: mine(), outOff: out ? {gk: out.isGK, subbedOff: !!out.subbedOff, onPitch: out.onPitch} : null, me: me ? {isGK: me.isGK, onPitch: me.onPitch} : null,
        state: FP.state, viewMe: F.FS.V.me === ms.me, drawn};
    });
    check(bench.at0.state === "bench" && bench.at0.seated && bench.at0.me < 0, "from the bench: seated in the cage's dugout, not on the pitch", bench.at0);
    check(bench.called && bench.atFourth && bench.on, "the call-up, the walk to the fourth official, on at a stoppage", bench);
    check(bench.mine === 1 && bench.outOff && bench.outOff.subbedOff && !bench.outOff.onPitch && bench.me && bench.me.onPitch, "exactly one of me; the man replaced leaves (subbedOff)", bench);
    check(bench.state === "live" && bench.viewMe && bench.drawn <= 1, "control and camera handed over, no duplicate body", bench);
    check(bench.outOff && !bench.outOff.gk && bench.me && !bench.me.isGK, "a bench start never swaps me for the keeper", bench);
    const gk = await page.evaluate(() => {
      const X = window.__t8b, ms = FP.ms, me = ms.agents[ms.me], k = ms.agents[ms.gks[me.team]];
      // my keeper sent off (scripted, as rules.js sendOff does it): someone goes in goal, never me
      k.sentOff = true; k.onPitch = false;
      X.step(600);
      const now = ms.agents[ms.me];
      return {meGK: !!now.isGK, gkIsMe: ms.gks[me.team] === ms.me};
    });
    check(!gk.meGK && !gk.gkIsMe, "with my keeper sent off, I am never put in goal", gk);
    await page.evaluate(() => window.__trainFull.backToHub());
    const picker = await page.evaluate(() => {
      window.__trainHub.configureScenario("fm-kickoff");
      const r = document.getElementById("sheetRoot"), txt = r ? r.innerText : "";
      const roleVals = r ? [...r.querySelectorAll('[data-k="role"] [data-v], [data-f="role"] [data-v], [data-cf="role"] button')].map(b => b.dataset.v || b.textContent) : [];
      const opts = r ? [...r.querySelectorAll("select option, [data-v]")].map(o => (o.value || o.dataset.v || "").toString()) : [];
      return {gkOpt: opts.includes("GK"), keeperRole: /\bGoalkeeper\b/.test(roleVals.join(" ")), roles: window.__trainConfig.typeOf("fullmatch").roles, len: txt.length};
    });
    check(!picker.gkOpt && !picker.keeperRole && !picker.roles.includes("keeper") && picker.len > 0, "the role and position pickers offer no keeper", picker);
    const starts = await page.evaluate(() => {
      const out = [];
      for (const start of ["kickoff", "bench"]) for (const slot of ["", "LW", "CB", "ST"]){
        const cfg = window.__trainFull.matchConfigOf(window.__t8b.cfg({opts: {start, slot}}));
        const me = cfg.teams[0].players.find(p => p.isMe);
        out.push({start, slot, meSlot: me && me.slot, gk: !!(me && me.isGK)});
      }
      return out;
    });
    check(starts.every(s => s.meSlot && !s.gk && s.meSlot !== "GK"), "for every start and position my agent is never the keeper", starts);
    await page.evaluate(() => { if (window.__trainConfigUI && window.__trainConfigUI.configOpen()) window.__trainConfigUI.closeConfig(); });

    /* ---------- 6. presets ---------- */
    const C1 = await page.evaluate(() => window.__t8b.cfg({attAvg: 70, defAvg: 55, opts: {slot: "LW", start: "bench", subMin: 60, half: 5}}));
    await unfreeze(page);
    // (the pointer free, as it is with a sheet up: a click on a sheet under a held pointer goes to the 3D view)
    await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
    // (the configuration sheet the picker check opened, and the hub, both gone first: one sheet at a time)
    await page.evaluate(() => { if (window.__trainConfigUI && window.__trainConfigUI.configOpen()) window.__trainConfigUI.closeConfig(); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); const r = document.getElementById("sheetRoot"); if (r && r.classList.contains("open") && typeof closeSheet === "function") closeSheet(); });
    await page.waitForFunction(() => { const r = document.getElementById("sheetRoot"); return !r || !r.classList.contains("open"); }, null, {timeout: 10000});
    await page.waitForTimeout(400);
    await page.evaluate(([c]) => window.__trainPresetUI.openPresets({type: "fullmatch", typeName: "Full Match", config: c, scenarioId: "fm-bench"}), [C1]);
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout: 15000});
    await clickReal(page, "#tpName");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Left wing off the bench", {delay: 15});
    await clickReal(page, '#sheetRoot [data-tp="save"]');
    await page.waitForTimeout(600);
    console.log("  presets sheet after Save:", JSON.stringify(await page.evaluate(() => ({rows: document.querySelectorAll("#sheetRoot .tp-row").length, kind: (document.getElementById("sheetRoot") || {}).dataset.kind,
      msg: [...document.querySelectorAll("#sheetRoot [role=status]")].map(e => e.textContent).join(" | "), name: (document.getElementById("tpName") || {}).value, lock: !!document.pointerLockElement,
      active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), fm: !!FP.state,
      top: (() => { const i = document.getElementById("tpName"); if (!i) return null; const r = i.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return e && [e.outerHTML.slice(0, 160), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), innerWidth, innerHeight]; })(),
      ov: [...document.querySelectorAll(".fp-overlay")].map(o => o.className + ":" + getComputedStyle(o).display), q: window.__trainQuick.quickIsOpen(), mc: window.__trainQuick.matchCardOpen()}))));
    await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout: 10000});
    await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
    await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
    await page.reload();
    await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
    await enterByButton(page);
    await fresh(page);
    await page.evaluate(() => window.__trainHub.openHub("fullmatch"));
    await page.waitForFunction(() => !!document.querySelector('#sheetRoot [data-th="presets"][data-id="fm-bench"]'), null, {timeout: 15000});
    await clickReal(page, '#sheetRoot [data-th="presets"][data-id="fm-bench"]');
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout: 15000});
    const prow = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({id: r.dataset.row, name: r.querySelector(".tp-name").textContent})).find(r => r.name === "Left wing off the bench"));
    check(!!prow, "after a reload the Full Match preset is in the Load list", prow);
    if (prow){
      await clickReal(page, `#sheetRoot [data-row="${prow.id}"] [data-tp="load"]`);
      await page.waitForFunction(() => !!window.FP.state, null, {timeout: 120000});
      await freeze(page);
      const got = await page.evaluate(([c]) => {
        window.__t8b.step(3);
        const ms = FP.ms, cfg = ms.cfg, me = cfg.teams[0].players.concat(cfg.teams[0].bench).find(p => p.isMe);
        const saved = window.__trainHub.scenarioConfig("fm-bench");
        return {same: JSON.stringify(saved) === JSON.stringify(c), slot: me && me.slot, half: cfg.halfRealSec, start: FP.training.start, subOn: cfg.roleTimes && cfg.roleTimes.subOn,
          ovr: [cfg.teams[0].players.filter(p => !p.isMe && !p.isGK)[0].ovr, cfg.teams[1].players.filter(p => !p.isGK)[0].ovr], state: FP.state};
      }, [C1]);
      check(got.same && got.slot === "LW" && got.half === 300 && got.start === "bench" && got.subOn === 60 && got.ovr[0] === 70 && got.ovr[1] === 55 && got.state === "bench",
        "Load starts the match with the saved values: LW, averages 70 and 55, 5-minute halves, on the bench until 60'", got);
      await page.evaluate(() => window.__trainFull.backToHub());
      await unfreeze(page);
    }

    /* ---------- 8. the career ---------- */
    check(!(await trainWrites(page)).length && !(await v2Writes(page)).length, "the write spy logs no freyaFootball.v2 write", await v2Writes(page));
    check(careerDiff(careerBefore, await careerSnapshot(page)).length === 0, "the career diff is empty");
  } catch(e){ check(false, "part A ran", String(e && e.stack || e)); }
  check(!page.errors.length, "part A: zero console and page errors", page.errors.slice(0, 5));
  await t.close();
}

/* ================= Part B: a career quit to the title ================= */
{
  const {page, close} = await launch({gfx: "low", seed: 12});
  try {
    await career(page, {zone: "ground"});
    const look = await page.evaluate(() => JSON.parse(JSON.stringify(S.player.look)));
    await page.evaluate(() => A.quit());
    await page.waitForSelector(".title-screen", {timeout: 30000});
    await page.waitForTimeout(1200);
    await trainingStart(page, {kind: "full"});
    await fresh(page);
    await page.evaluate(() => window.__trainFull.startFullMatch(window.__t8b.cfg({opts: {start: "kickoff", half: 3}})));
    await page.waitForFunction(() => window.FP.state === "live", null, {timeout: 120000});
    const body = await page.evaluate(() => JSON.parse(JSON.stringify(window.__fp.FS.meLook || {})));
    const keys = ["hair", "hairCol", "skin", "beard", "build", "height"].filter(k => look[k] !== undefined);
    const diff = keys.filter(k => JSON.stringify(look[k]) !== JSON.stringify(body[k]));
    check(keys.length >= 3 && !diff.length, "with a career quit to the title, my body in the Full Match wears the created character's look", {keys, diff, look: keys.map(k => [k, look[k], body[k]])});
    await page.evaluate(() => window.__trainFull.backToHub());
  } catch(e){ check(false, "part B ran", String(e && e.stack || e)); }
  check(!page.errors.length, "part B: zero console and page errors", page.errors.slice(0, 5));
  await close();
}

process.exit(done() ? 0 : 1);
