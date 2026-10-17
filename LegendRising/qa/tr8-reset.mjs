// qa/tr8-reset.mjs: Training's Full Match entry and its three resets, in the real page with no career (browser).
// Owner: P8-A (Training Mode Phase 8). Contract: BUILD-PLAN P8-A acceptance "qa/tr8-reset.mjs"; TRAINING-SPEC 5 (Full
// Match: Reset Match, Reset Current Half, Restart from Kickoff; resets restore clock, half, score, ball, possession,
// positions, control, AI, events, flags, stamina, objects and timers; nothing stale; never the career).
//
// A fresh page, no career; into Training by the title's button; the Full cage; FP.enterTraining with a training host made
// here the way P8-B's fullmatch.js makes it (the pool's bodies, the bibs, no career call) and a short half (60 s of real
// time) so the halves can be played through. The page is stepped frozen (lib.mjs freeze, __life.stepN) except where real
// clicks are pressed; the career's host (controller.js fpHost, tunnel.js) has every function wrapped with a counter.
//   1. entry and pool: the pool holds 25 + the substitutes + 1 bodies, plus the fourth official (a body the plan's count
//      leaves out: he stands by the halfway line for a change), bodies() that plus the sandbox's 2;
//   2. Reset Match after a goal: clock 0, half 1, 0-0, the events of a new match, the kick-off places of a new match
//      (1 mm), its restart (possession), control on me, no AI plan, no flag, fresh stamina, no extra ball; the pool the
//      same after 3 Reset Match;
//   3. Reset Current Half in the second half after goals (the half reached through the half-time card by a real click):
//      the whole state equals the half-start snapshot;
//   4. Reset Current Half after a bench call-up (a bench start, called on and on the pitch in the second half): roleDone,
//      callUp and every bench used flag as the half began, exactly one of me, back on the bench seat with its camera,
//      no stale called/atFourth/seated, and a second call-up through the fourth official works;
//   5. Restart from Kickoff in the second half at 2-1: clock (one step), half and score kept, both teams on the kick-off
//      places (1 mm), the half's kicking-off side on the ball, plans and chain cleared, stamina kept;
//   6. after each kind of reset, through half time by real clicks (Esc pressed on the card) and, at the end, full time;
//   7. 20 cycles of the three resets: window and document listeners, timers, the scheduler's tasks and actors and
//      renderer.info grow by 0;
//   8. Return to Hub: the pool back at 14, bodies() at 16, renderer.info geometries back at the hub's;
//   9. no career call, the career diff empty, no freyaFootball.v2 write, no checkpoint; 0 console and page errors.
//
//   QA_PORT=8881 node qa/tr8-reset.mjs        exits 1 on any failed check; writes qa/out/tr8-reset.json
import {freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, v2Writes, careerSnapshot, careerDiff, clickReal, pressReal} from "./tr4b-lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr8-reset");
const r3 = v => Math.round(v*1000)/1000;

// live listeners on window and document, and pending timers, counted from the page's first script on
const counters = () => {
  const live = window.__listeners = new Map();
  const key = (t, type, o) => [t === window ? "window" : "document", type, (typeof o === "boolean" ? o : !!(o && o.capture)) ? "c" : "b"].join(":");
  for (const T of [Window.prototype, Document.prototype]){
    const a = T.addEventListener, r = T.removeEventListener;
    T.addEventListener = function(type, fn, o){ const k = key(this, type, o); let s = live.get(k); if (!s) live.set(k, s = new Set()); s.add(fn); return a.apply(this, arguments); };
    T.removeEventListener = function(type, fn, o){ const s = live.get(key(this, type, o)); if (s) s.delete(fn); return r.apply(this, arguments); };
  }
  const T = window.__timers = new Set(), st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = function(fn, ms, ...x){ const id = st(function(){ T.delete(id); return typeof fn === "function" ? fn.apply(this, arguments) : undefined; }, ms, ...x); T.add(id); return id; };
  window.clearTimeout = id => { T.delete(id); return ct(id); };
  window.setInterval = function(...x){ const id = si(...x); T.add("i" + id); return id; };
  window.clearInterval = id => { T.delete("i" + id); return ci(id); };
};

// the page's helpers: the cfg, the training host, the career host's spy, the stepping and the readings
const HELPERS = async () => {
  const Cg = await import("/js/life/train/cage.js"), Tm = await import("/js/life/train/teams.js"), Pool = await import("/js/life/train/pool.js");
  const Sim = await import("/js/life/football/sim.js"), Hu = await import("/js/life/human.js"), At = await import("/js/life/football/attrs.js");
  const L = window.__life, F = window.__fp, C = window.__trainConfig;
  const X = window.__t8 = {Cg, Tm, Pool, Sim, Hu, hostCalls: [], career: {}, ended: [],
    // the Full Match cfg (teams.js), a short half, and a bench of five a side (P8-B adds its own bench)
    cfg(){
      const c = Tm.cfgFromConfig("fullmatch", C.defaults("fullmatch")).cfg;
      c.halfRealSec = 60;
      for (const t of [0, 1]) c.teams[t].bench = ["GK", "CB", "CM", "LW", "ST"].map((slot, i) => ({pid: 70000 + t*100 + i, name: `Sub ${t}${i}`, number: 12 + i, slot,
        arch: slot === "GK" ? "GK" : slot === "CB" ? "DF" : slot === "CM" ? "CM" : slot === "ST" ? "ST" : "W", isGK: slot === "GK", scale: 1, energy: 100,
        at: At.attrsForAI({id: 70000 + t*100 + i, ovr: 55, pos: slot === "GK" ? "GK" : slot === "CB" ? "DF" : slot}, {training: true})}));
      return c;
    },
    host(){
      const rec = n => (...a) => { X.hostCalls.push(n); };
      return {look: () => Pool.poolMeLook(), kits: () => ({home: Pool.KITS.mine, away: Pool.KITS.theirs}), bodies: ms => Pool.matchBodies(ms, 0),
        kickoff: rec("kickoff"), now: () => 0, note: rec("note"), relock: rec("relock"), speed: () => 2, setSpeed: rec("setSpeed"), ended: why => X.ended.push(why)};
    },
    spyCareer(){
      const H = F.careerHost(); if (!H) return 0;
      let n = 0;
      for (const k of Object.keys(H)) if (typeof H[k] === "function" && !H[k].__spied){ const f = H[k]; H[k] = function(){ X.career[k] = (X.career[k] || 0) + 1; return f.apply(this, arguments); }; H[k].__spied = true; n++; }
      return n;
    },
    enter(start = "kickoff", o = {}){ return FP.enterTraining(X.cfg(), Object.assign({zone: "cage", kind: "full", start, host: X.host()}, o)); },
    step(n){ for (let i = 0; i < n; i++) L.stepN(1, 1/60); },
    // on until a condition (frames at most)
    until(pred, max = 6000){ let i = 0; for (; i < max && !pred(); i++) L.stepN(1, 1/60); return i < max; },
    // a goal for a side: the ball put in front of the other side's goal and struck in (the simulation scores it)
    goal(team){
      const ms = FP.ms, b = ms.ball, end = ms.dirs[team];
      ms.restart = null; ms.phase = "live"; ms.clock.running = true; ms.poss.ctl = -1;
      for (const a of ms.agents){ a.plan = null; a.act = null; if (a.isGK){ a.m.x = -ms.dirs[a.team]*(ms.spec.hx - 1); a.m.z = 8; } }
      b.state = "free"; b.holder = -1; b.p.x = end*(ms.spec.hx - 4); b.p.y = .4; b.p.z = 0; b.v.x = end*18; b.v.y = .5; b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
      const s0 = ms.score[team];
      X.until(() => ms.score[team] > s0, 300);
      return ms.score[team] > s0;
    },
    // the whole match state as text, the match object's own fields left out (sim.js HALF_KEEP), for equality
    canon(ms, skip = []){
      const seen = new Map();
      const walk = (v, at) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "function") return "#fn";
        if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
        if (typeof v !== "object") return v;
        if (seen.has(v)) return "#ref:" + seen.get(v);
        seen.set(v, at);
        if (ArrayBuffer.isView(v)) return Array.from(v);
        if (v instanceof Map) return {m: [...v].map(([k, x], i) => [walk(k, at + "k" + i), walk(x, at + "v" + i)])};
        if (v instanceof Set) return {s: [...v].map((x, i) => walk(x, at + "s" + i))};
        if (Array.isArray(v)) return v.map((x, i) => walk(x, at + "/" + i));
        const o = {}; for (const k of Object.keys(v).sort()) o[k] = walk(v[k], at + "." + k); return o;
      };
      const o = {};
      for (const k of Object.keys(ms).sort()) if (!Sim.HALF_KEEP.includes(k) && !skip.includes(k)) o[k] = walk(ms[k], k);
      return JSON.stringify(o);
    },
    flags(){ const S = F.FS; return {htCard: !!S.htCard, ftCard: !!S.ftCard, skipping: !!S.skipping, called: !!S.called, atFourth: !!S.atFourth, seated: !!S.seated, goalEv: !!S.goalEv, ckGoal: !!S.ckGoal, ckNow: !!S.ckNow, evq: S.evq.length, replay: !!S.replayQ}; },
    leaks(){
      let ls = 0; for (const s of window.__listeners.values()) ls += s.size;
      const st = L.sched ? (typeof L.sched.stats === "function" ? L.sched.stats() : null) : null;
      const R = typeof L.renderer === "function" ? L.renderer() : L.renderer, info = R && R.info ? R.info.memory : {};
      return {listeners: ls, timers: window.__timers.size, sched: st ? st.counts : null, geometries: info.geometries, textures: info.textures};
    }
  };
  return X.spyCareer();
};

const t = await trainLaunch({seed: 7});
const page = t.page;
await t.context.addInitScript(counters);
await page.reload();
await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
try {
  const careerBefore = await careerSnapshot(page);
  await enterByButton(page);
  const spied = await page.evaluate(HELPERS);
  check(spied > 3, "the career's host is registered and every one of its functions is spied on", spied);
  await page.evaluate(async () => { window.__trainHub.closeHub(); await window.__t8.Cg.cageEnter("full"); });
  await page.waitForFunction(() => window.__t8.Cg.CAGE.kind === "full", null, {timeout: 60000});
  await freeze(page);
  const hub = await page.evaluate(() => { window.__t8.step(10); return Object.assign(window.__t8.leaks(), {pool: window.__t8.Pool.poolStats().size, bodies: window.__t8.Hu.bodies().length}); });

  /* ---------- 1. entry and the pool ---------- */
  const e1 = await page.evaluate(() => { const X = window.__t8, ok = X.enter("kickoff"); X.step(5);
    const ms = FP.ms, subs = ms.bench[0].length + ms.bench[1].length;
    return {ok, state: FP.state, training: FP.training, subs, pool: X.Pool.poolStats(), bodies: X.Hu.bodies().length, me: ms.me, onPitch: window.__fp.FS.onPitch, real: window.__fp.FS.real}; });
  check(e1.ok && e1.state === "live" && e1.onPitch && !e1.real && e1.training && e1.training.zone === "cage", "FP.enterTraining from the kick-off: playing, on the pitch, no career (FS.real false)", e1);
  check(e1.pool.size === 25 + e1.subs + 1 + 1 && e1.bodies === e1.pool.size + 2, `the pool holds 25 + the ${e1.subs} substitutes + 1 bodies and the fourth official, bodies() that plus the sandbox's 2 (nothing built outside it)`, {size: e1.pool.size, bodies: e1.bodies, byKit: e1.pool.byKit});

  /* ---------- 2. Reset Match ---------- */
  const r2 = await page.evaluate(() => {
    const X = window.__t8, F = window.__fp;
    X.step(300); const scored = X.goal(0); X.step(120);
    const before = {score: FP.ms.score.slice(), t: FP.ms.t, events: FP.ms.events.length};
    FP.resetMatch();
    const ms = FP.ms, fresh = X.Sim.createMatch(ms.cfg);
    const far = ms.agents.filter((a, i) => { const b = fresh.agents[i]; return !b || Math.hypot(a.m.x - b.m.x, a.m.z - b.m.z) > .001; }).map(a => a.id);
    const stam = ms.agents.every((a, i) => JSON.stringify(a.st) === JSON.stringify(fresh.agents[i].st));
    const loose = ms.spares.filter(s => s.state === "loose").length;
    return {scored, before, clock: ms.clock.sec, half: ms.half, score: ms.score.slice(), events: ms.events.length, freshEvents: fresh.events.length, far,
      restart: ms.restart && {kind: ms.restart.kind, team: ms.restart.team}, freshRestart: fresh.restart && {kind: fresh.restart.kind, team: fresh.restart.team},
      control: {state: FP.state, onPitch: F.FS.onPitch, me: ms.me}, plans: ms.agents.filter(a => a.plan).length, flags: X.flags(), stam, loose, spares: ms.spares.length, freshSpares: fresh.spares.length};
  });
  check(r2.scored && r2.before.score[0] === 1, "a goal before the reset (the simulation scores it)", r2.before);
  check(r2.clock === 0 && r2.half === 1 && r2.score.join("-") === "0-0" && r2.events === r2.freshEvents, "after Reset Match: clock 0, half 1, 0-0, the events of a new match", r2);
  check(!r2.far.length && JSON.stringify(r2.restart) === JSON.stringify(r2.freshRestart), "the kick-off places of a new match (1 mm) and its kick-off for the same side", {far: r2.far, restart: r2.restart});
  check(r2.control.state === "live" && r2.control.onPitch && r2.control.me >= 0, "control on me", r2.control);
  check(!r2.plans && Object.values(r2.flags).every(v => !v), "no AI plan and no flag left", {plans: r2.plans, flags: r2.flags});
  check(r2.stam && !r2.loose && r2.spares === r2.freshSpares, "stamina fresh and no extra ball", {stam: r2.stam, loose: r2.loose});
  const p3 = await page.evaluate(() => { const X = window.__t8, out = []; for (let i = 0; i < 3; i++){ X.step(60); FP.resetMatch(); out.push([X.Pool.poolStats().size, X.Hu.bodies().length]); } return out; });
  check(p3.every(([s, b]) => s === e1.pool.size && b === e1.bodies), "the pool and bodies() the same after 3 Reset Match", p3);

  /* ---------- 3. Reset Current Half in the second half after goals ---------- */
  // to half time, the card, its button pressed for real (Esc on the card first), the second half, two goals
  const toHT = async () => {
    // (a half of 60 s, its added time, and a kick-off of mine waited on for up to 25 s)
    const ok = await page.evaluate(() => window.__t8.until(() => FP.state === "halftime" && window.__fp.FS.htCard, 60*150));
    if (!ok) return false;
    await unfreeze(page);
    await page.waitForFunction(() => !!document.querySelector('.fp-overlay.on button[data-ht="go"]') || !!document.querySelector('#fpOverlay.on button[data-ht="go"]') || !!document.querySelector('button[data-ht="go"]'), null, {timeout: 15000});
    await pressReal(page, "Escape");
    await clickReal(page, 'button[data-ht="go"]');
    await page.waitForFunction(() => FP.state !== "halftime", null, {timeout: 15000});
    await freeze(page);
    return true;
  };
  await page.evaluate(() => { FP.resetMatch(); });
  const ht1 = await toHT();
  const r3s = await page.evaluate(() => {
    const X = window.__t8;
    const ms0 = FP.ms, snap = X.Sim.halfStart(ms0);
    const at = X.canon(Object.assign(Object.create(null), snap.data));
    X.step(120); const g1 = X.goal(0); X.step(60); const g2 = X.goal(1); X.step(60);
    const score = FP.ms.score.slice();
    FP.resetHalf();
    const now = X.canon(FP.ms);
    return {half: snap.half, g: [g1, g2], score, same: now === at, len: [now.length, at.length], state: FP.state, onPitch: window.__fp.FS.onPitch, scoreAfter: FP.ms.score.slice()};
  });
  check(ht1 && r3s.half === 2 && r3s.g[0] && r3s.g[1], "the second half reached through the half-time card (a real click), two goals in it", {ht1, g: r3s.g, score: r3s.score});
  check(r3s.same && r3s.state === "live" && r3s.onPitch, "Reset Current Half: the whole state equals the half-start snapshot, control on me", r3s);

  /* ---------- 4. Reset Current Half after a bench call-up ---------- */
  await page.evaluate(() => FP.exit());
  const r4 = await page.evaluate(() => { const X = window.__t8; X.enter("bench", {subOn: 47}); X.step(5); return {state: FP.state, seated: window.__fp.FS.seated, me: FP.ms.me}; });
  check(r4.state === "bench" && r4.seated && r4.me < 0, "a bench start: on the bench seat, not on the pitch", r4);
  const ht2 = await toHT();
  // the second half's snapshot, then the call-up, the walk to the fourth official, on at a stoppage
  const callUp = async () => page.evaluate(() => {
    const X = window.__t8, F = window.__fp, L = window.__life;
    const called = X.until(() => F.FS.called, 60*120);
    const fo = F.FS.V ? null : null; void fo;
    // to the fourth official (his spot: the bench provider's), as a player walks there
    const ms = FP.ms, z = -(ms.spec.hz + 1.45);
    if (called){ L.P.x = 0.4; L.P.z = z + .5; if (F.FS.own){ F.FS.own.x = L.P.x; F.FS.own.z = L.P.z; } }
    X.step(10);
    // a stoppage: the ball over the touchline (again while play goes on: a player can meet it before the line)
    let on = false;
    for (let k = 0; k < 6 && !on; k++){
      if (called && !F.FS.onPitch){ const b = ms.ball; if (ms.phase === "live"){ b.state = "free"; b.holder = -1; ms.poss.ctl = -1; b.p.x = 5; b.p.y = .3; b.p.z = ms.spec.hz - .3; b.v.x = 0; b.v.y = 0; b.v.z = 8; } }
      on = X.until(() => F.FS.onPitch, 60*15);
    }
    return {called, on, atFourth: F.FS.atFourth, roleDone: JSON.stringify(ms.roleDone), isMe: ms.agents.filter(a => a.isMe).length};
  });
  const snap4 = await page.evaluate(() => { const s = window.__t8.Sim.halfStart(FP.ms); return {half: s.half, roleDone: JSON.stringify(s.data.roleDone), callUp: JSON.stringify(s.data.callUp), used: JSON.stringify(s.data.bench.map(b => b.map(p => !!p.used)))}; });
  const c1 = await callUp();
  check(ht2 && snap4.half === 2 && c1.called && c1.on, "called up in the second half, by the fourth official, and on at a stoppage", {ht2, c1});
  const r4b = await page.evaluate(() => {
    const X = window.__t8, F = window.__fp, ms0 = FP.ms;
    FP.resetHalf();
    const ms = FP.ms, mine = ms.agents.filter(a => a.isMe).length + ms.bench.flat().filter(p => p.isMe).length;
    return {roleDone: JSON.stringify(ms.roleDone), callUp: JSON.stringify(ms.callUp), used: JSON.stringify(ms.bench.map(b => b.map(p => !!p.used))), mine,
      state: FP.state, seated: F.FS.seated, benchCam: !!F.FS.benchSeat, called: F.FS.called, atFourth: F.FS.atFourth, onPitch: F.FS.onPitch, me: ms.me};
  });
  check(r4b.roleDone === snap4.roleDone && r4b.callUp === snap4.callUp && r4b.used === snap4.used, "after the call-up, Reset Current Half: roleDone, callUp and every bench used flag as the half began", {snap4, now: r4b});
  check(r4b.mine === 1, "exactly one of me (on the pitch or on the bench)", r4b.mine);
  check(r4b.state === "bench" && r4b.seated && r4b.benchCam && !r4b.onPitch && !r4b.called && !r4b.atFourth, "control back where the half began: on the bench seat with its camera, no stale called or atFourth", r4b);
  const c2 = await callUp();
  check(c2.called && c2.on && c2.isMe === 1, "a second call-up in the replayed half works through the fourth official", c2);

  /* ---------- 5. Restart from Kickoff in the second half at 2-1 ---------- */
  await page.evaluate(() => { FP.exit(); window.__t8.enter("kickoff"); window.__t8.step(30); });
  const ht3 = await toHT();
  const r5 = await page.evaluate(() => {
    const X = window.__t8, F = window.__fp;
    X.step(30);
    const ms = FP.ms; ms.score = [2, 1]; ms.stats.goals = [2, 1];
    X.step(400);
    const before = {sec: ms.clock.sec, half: ms.half, score: ms.score.slice(), st: ms.agents.map(a => JSON.stringify(a.st)), rate: ms.clock.rate};
    FP.restartKickoff();
    const after = {sec: ms.clock.sec, half: ms.half, score: ms.score.slice()};
    // the kick-off places: placeForKickoff again moves nobody
    const pos = ms.agents.map(a => [a.m.x, a.m.z]);
    X.Sim.placeForKickoff(ms);
    const moved = ms.agents.filter((a, i) => Math.hypot(a.m.x - pos[i][0], a.m.z - pos[i][1]) > .001).map(a => a.id);
    const ko = ms.half === 1 ? ms.koFirst : 1 - ms.koFirst;
    return {before: {sec: before.sec, half: before.half, score: before.score}, after, step: 1/60*before.rate, moved, restart: ms.restart && {kind: ms.restart.kind, team: ms.restart.team}, ko,
      plans: ms.agents.filter(a => a.plan || a.act).length, chain: JSON.stringify(ms.chain).length, stam: ms.agents.every((a, i) => JSON.stringify(a.st) === before.st[i]), state: FP.state};
  });
  check(ht3 && r5.before.half === 2 && Math.abs(r5.after.sec - r5.before.sec) <= r5.step + 1e-6 && r5.after.half === 2 && r5.after.score.join("-") === "2-1",
    "Restart from Kickoff at 2-1 in the second half: clock (within a step), half and score kept", r5);
  check(!r5.moved.length && r5.restart && r5.restart.kind === "kickoff" && r5.restart.team === r5.ko, "both teams on the kick-off places (1 mm), the side that kicked off the half on the ball", {moved: r5.moved, restart: r5.restart, ko: r5.ko});
  check(!r5.plans && r5.stam, "the AI's plans and acts cleared, the chain new, stamina kept", {plans: r5.plans, stam: r5.stam});

  /* ---------- 6. after each kind of reset, through half time by real clicks; then full time ---------- */
  // (each reset made in the first half, a minute in, so that half time is what comes next)
  const thru = [];
  for (const kind of ["resetMatch", "resetHalf", "restartKickoff"]){
    await page.evaluate(k => { FP.resetMatch(); window.__t8.step(60*20); FP[k](); window.__t8.step(10); }, kind);
    const ok = await toHT();
    thru.push({kind, ok, half: await page.evaluate(() => FP.ms.half)});
  }
  check(thru.every(r => r.ok), "after each kind of reset, half time played through by real clicks (Esc on the card first)", thru);
  const ft = await page.evaluate(() => window.__t8.until(() => FP.state === "fulltime" && window.__fp.FS.ftCard, 60*150));
  let ftOk = false;
  if (ft){
    await unfreeze(page);
    await page.waitForFunction(() => !!document.querySelector('button[data-ft="go"]'), null, {timeout: 15000});
    await clickReal(page, 'button[data-ft="go"]');
    await page.waitForFunction(() => !FP.state, null, {timeout: 15000});
    ftOk = await page.evaluate(() => window.__t8.ended.includes("fulltime"));
    await freeze(page);
  }
  check(ft && ftOk, "on to full time, its Continue pressed for real: the match ends and the training host hears it (ended)", {ft, ftOk});

  /* ---------- 7. 20 cycles of the resets: nothing grows ---------- */
  // (each reading once the page's own short timers, a fade or a card's removal, have had 4 s of real time to run out)
  const cyc = await page.evaluate(async () => {
    const X = window.__t8, settle = () => new Promise(r => setTimeout(r, 4000));
    X.enter("kickoff"); X.step(30);
    const cycle = () => { FP.resetMatch(); X.step(20); FP.resetHalf(); X.step(20); FP.restartKickoff(); X.step(20); };
    cycle(); X.step(30); await settle();
    const a = X.leaks();
    for (let i = 0; i < 20; i++) cycle();
    X.step(30); await settle();
    return {a, b: X.leaks()};
  });
  const grew = Object.keys(cyc.a).filter(k => JSON.stringify(cyc.a[k]) !== JSON.stringify(cyc.b[k]));
  check(!grew.length, "20 cycles of Reset Match, Reset Current Half and Restart from Kickoff: listeners, timers, the scheduler's tasks and actors, renderer.info geometries and textures +0", {grew, a: cyc.a, b: cyc.b});

  /* ---------- 8. Return to Hub ---------- */
  // (the hub's figure as a Full Match leaves it: the 14 drill bodies drawn once are on the GPU from then on, a body
  // parked and never drawn is not; so the hub's is taken after a first Full Match and its trim, and the second must
  // come back to it: the 23 bodies trimmed are given back, every time)
  const backTo = () => page.evaluate(async () => { const X = window.__t8; FP.exit(); const n = X.Pool.poolTrim(); X.step(30); await new Promise(r => setTimeout(r, 1000)); X.step(5);
    return Object.assign(X.leaks(), {trimmed: n, pool: X.Pool.poolStats().size, bodies: X.Hu.bodies().length}); });
  const back1 = await backTo();
  await page.evaluate(() => { const X = window.__t8; X.enter("kickoff"); X.step(120); FP.resetMatch(); X.step(60); });
  const back = await backTo();
  check(back1.pool === 14 && back1.bodies === 16 && back.pool === 14 && back.bodies === 16, "Return to Hub: the pool back at 14, bodies() at 16", {back1, back});
  check(back.geometries === back1.geometries && back.textures === back1.textures && back.trimmed === back1.trimmed, "renderer.info geometries and textures back at the hub's after a second Full Match", {first: back1, second: back});
  void hub;
  await unfreeze(page);

  /* ---------- 9. the career ---------- */
  const career = await page.evaluate(() => ({calls: window.__t8.career, host: window.__t8.hostCalls.length}));
  check(!Object.keys(career.calls).length, "the career's host is never called", career.calls);
  check(!(await trainWrites(page)).length && !(await v2Writes(page)).length, "the write spy logs no freyaFootball.v2 write (no checkpoint)", await v2Writes(page));
  check(careerDiff(careerBefore, await careerSnapshot(page)).length === 0, "the career diff is empty");
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
const ok = done();
await t.close();
process.exit(ok ? 0 : 1);
