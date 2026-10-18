// qa/tr4-reset.mjs: reset and replay, the configured ball at activation, the pause card and the quick menu.
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance "qa/tr4-reset.mjs"; TRAINING-SPEC 4 (Restart Current
// Scenario, Replay Last Scenario restoring the last setup and not the last attempt's end state, Return to
// Configuration, Return to Hub; resets restore positions, facing, possession, the ball, animations, AI states, stamina,
// flags, temporary effects, objects and listeners) and 8 (nothing grows over repeated resets). INF-9, INF-10, perf-7.
//
// A 3 v 3 with a keeper (qa-3v3, registered through the runner's API as a scenario module would) in the Half cage.
// Restarts are made with the real Backspace key and the pause card's buttons under pointer lock; the simulation is
// stepped by the test (lib.mjs freeze) so a digest is read at the exact step it is meant for.
//
//   node qa/tr4-reset.mjs
import {report, expect, freeze, unfreeze, snap} from "./lib.mjs";
import {cpuMs} from "./trlib.mjs";
import {trainLaunch, enterByButton, trainWrites, careerSnapshot, careerDiff, pressReal, clickReal, assertVisible, lockPointer, closeHubReal, registerTestScenarios, cardUp, cardState, frames} from "./tr4b-lib.mjs";

const res = {base: null, restarts: [], states: [], launch: [], identical: null, replay: null, esc: null, items: {}, config: null, backspace: null, growth: null, cpu: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

// what the page reads of a run (in the page: one string to eval)
const STATE = `(() => {
  const R = window.__trainRun, ms = R.RUN.ms, s = R.RUN.setup;
  if (!ms || !s) return null;
  const mine = ms.agents.filter(a => a.team === s.myTeam && a.role === "player"), theirs = ms.agents.filter(a => a.team === 1 - s.myTeam && a.role === "player");
  const places = [[s.me, ...s.mates], [...s.opps, ...(s.keeper ? [s.keeper] : [])]];
  let pos = 0, yaw = 0, plans = 0, acts = 0, st = 0;
  [mine, theirs].forEach((list, k) => list.forEach((a, i) => { const p = places[k][i]; if (!p) return;
    pos = Math.max(pos, Math.hypot(a.m.x - p.x, a.m.z - p.z)); yaw = Math.max(yaw, Math.abs(a.m.yaw - p.yaw));
    if (a.plan != null) plans++; if (a.act) acts++; if (a.st && Math.abs(a.st.B - a.st.cap) > 1e-9) st++; }));
  const b = ms.ball, sb = s.ball;
  return {pos, yaw, plans, acts, stamina: st, ballP: Math.hypot(b.p.x - sb.x, b.p.y - sb.y, b.p.z - sb.z), ballV: [b.v.x, b.v.y, b.v.z], ballW: [b.w.x, b.w.y, b.w.z], state: b.state,
    poss: {team: ms.poss.team, ctl: ms.poss.ctl}, t: ms.t, step: ms.step, digest: R.digest().hash, restarts: R.RUN.restarts};
})()`;
const runState = page => page.evaluate(STATE);
// where the reset state now differs from the one at activation (window.__qaS0), for the report
const digestDiff = page => page.evaluate(() => {
  const a = JSON.parse(window.__qaS0), b = window.__trainRun.digestState(), out = [];
  const walk = (x, y, p) => { if (out.length > 12 || JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === "object" && typeof y === "object"){ for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + "." + k); } else out.push(p + ": " + JSON.stringify(x) + " vs " + JSON.stringify(y)); };
  walk(a, JSON.parse(JSON.stringify(b)), ""); return out;
});

const t = await trainLaunch({seed: 4, count: true});
const {page} = t;
try {
  await enterByButton(page);
  await closeHubReal(page);
  await page.evaluate(async () => { const C = await import("/js/life/train/cage.js"); await C.cageEnter("half"); });
  await registerTestScenarios(page);
  const careerBefore = await careerSnapshot(page);
  await freeze(page);
  // what is there before any scenario: bodies, listeners, timers, the scheduler, the renderer, the merge
  const counts = () => page.evaluate(async () => {
    const H = await import("/js/life/human.js"), L = window.__life, C = window.__qaCount, m = L.renderer().info.memory;
    return {bodies: H.bodies().length, maxId: Math.max(...H.bodies().map(h => h.id)), listeners: C.listeners, timers: C.timers.size, intervals: C.intervals.size,
      sched: L.sched.stats().counts, geo: m.geometries, tex: m.textures, mg: {items: L.MG.items.size, still: L.MG.still.size, pages: L.MG.pages.size}};
  });
  const before = await counts();
  res.base = before;

  // ---------- the configured ball at activation: a pass, a driven ball, a cross and a loft ----------
  for (const L of [{kind: "pass", speed: 14, tx: 28, tz: 6}, {kind: "driven", speed: 22, tx: 34, tz: -4}, {kind: "cross", speed: 17, tx: 44, tz: 12, ty: .11}, {kind: "loft", speed: 13, tx: 30, tz: -14}]){
    const r = await page.evaluate(L => {
      const R = window.__trainRun, Lf = window.__life;
      const run60 = () => { const out = []; for (let i = 0; i < 60; i++){ Lf.stepN(1); const p = R.RUN.ms.ball.p; out.push([p.x, p.y, p.z]); } return out; };
      const ok = R.startScenario("qa-3v3", {launch: L, n: 2, m: 3});
      const want = window.__qaLaunch, ms = R.RUN.ms, b = ms.ball, s = R.RUN.setup.ball;
      const at = {p: [b.p.x, b.p.y, b.p.z], v: Math.hypot(b.v.x, b.v.y, b.v.z), jump: Math.hypot(b.p.x - s.x, b.p.y - s.y, b.p.z - s.z), kick: ms.events.filter(e => e.kind === "kick" && e.agent === -1).length};
      // the first step: the ball moves by its own velocity, nothing more
      const p0 = {x: b.p.x, y: b.p.y, z: b.p.z}, v0 = {x: b.v.x, y: b.v.y, z: b.v.z};
      Lf.stepN(1);
      const step1 = Math.hypot(b.p.x - (p0.x + v0.x/60), b.p.z - (p0.z + v0.z/60));
      // the apex of the flight (stepped until it has come down past its peak or 4 s)
      let apex = b.p.y;
      for (let i = 0; i < 240; i++){ Lf.stepN(1); apex = Math.max(apex, R.RUN.ms.ball.p.y); if (R.RUN.ms.ball.p.y < apex - .3 || (i > 30 && R.RUN.ms.ball.v.y <= 0 && R.RUN.ms.ball.p.y <= .12)) break; }
      // the first 60 steps: after a restart and after Replay Last, bit for bit
      R.restart(); const a1 = run60();
      R.restart(); const a2 = run60();
      R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub();
      R.replay(); const a3 = run60();
      R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub();
      const same = (x, y) => x.length === y.length && x.every((p, i) => p[0] === y[i][0] && p[1] === y[i][1] && p[2] === y[i][2]);
      return {kind: L.kind, ok, want: {speed: want.speed, apex: want.apex}, at, step1, apex, restartSame: same(a1, a2), replaySame: same(a1, a3)};
    }, L);
    res.launch.push(r);
  }
  for (const r of res.launch){
    check(r.ok && Math.abs(r.at.v - r.want.speed) <= .02*r.want.speed, `${r.kind}: the launch speed is within 2% of the configured speed`, r);
    // (a ground pass and a driven ball roll: the configured apex is the ball's own height)
    const wantApex = r.want.apex != null ? Math.max(r.want.apex, .11) : .11;
    check(Math.abs(r.apex - wantApex) <= .05, `${r.kind}: the apex is within 5 cm of the configured flight's`, {apex: r.apex, want: wantApex});
    check(r.at.jump <= .1 && r.step1 <= .1 && r.at.kick === 1, `${r.kind}: the ball leaves the placement with no jump (one kick from outside the play)`, r.at);
    check(r.restartSame && r.replaySame, `${r.kind}: Restart and Replay Last give the same first 60 ball steps, bit for bit`, r);
  }

  // ---------- 50 restarts with the real Backspace, from varied moments of play ----------
  const cfg = {launch: {kind: "pass", speed: 12, tx: 22, tz: 2}, n: 2, m: 3};
  await page.evaluate(cfg => { const R = window.__trainRun; R.startScenario("qa-3v3", cfg); window.__qaD0 = R.digest(); window.__qaS0 = JSON.stringify(R.digestState()); }, cfg);
  const d0 = await page.evaluate(() => window.__qaD0.hash);
  // the digest at the moment a reset is done (the runner tells its listeners at the end of every start and restart),
  // before any input that comes after it (the pointer taken back is input of the new go)
  await page.evaluate(async () => { const RM = await import("/js/life/train/runner.js"), R = window.__trainRun; window.__qaAtOff = RM.onRunner(() => { if (R.RUN.cur) window.__qaAt = R.digest().hash; }); });
  const lock = await lockPointer(page);
  check(!!lock, "the pointer is locked on the game (a real click)", lock);
  // the mid-play states a reset has to undo, each made with the engine's own calls (the actions' starts, the rules'
  // restart, a collision's stagger, a spare ball, a notice) or with real input (a wind-up held on the mouse, C held)
  const STATES = ["play", "tackle", "slide", "strike", "shield", "stagger", "restart", "extra", "notice"];
  for (let i = 0; i < 50; i++){
    const kind = STATES[i % STATES.length];
    if (kind === "strike") await page.mouse.down();
    if (kind === "shield") await page.keyboard.down("c");
    const made = await page.evaluate(async ({kind, i}) => {
      const R = window.__trainRun, Lf = window.__life, ms = () => R.RUN.ms;
      const A = await import("/js/life/football/actions.js"), RU = await import("/js/life/football/rules.js"), B = await import("/js/life/football/ball.js"), TH = await import("/js/life/train/thud.js");
      Lf.stepN(20 + (i*7) % 50);
      const m = ms(), me = m.agents[m.me], opp = m.agents.find(a => a.team !== me.team && a.role === "player" && !a.isGK);
      const out = {kind};
      if (kind === "tackle" || kind === "slide"){
        // the opponent gets to the ball and goes in for it
        opp.m.x = m.ball.p.x + .6; opp.m.z = m.ball.p.z; m.ball.v.x = m.ball.v.y = m.ball.v.z = 0; m.ball.p.y = .11; m.ball.state = "free"; m.poss.ctl = -1;
        A.refreshPred(m);
        const act = A.startAction(m, opp, {kind: kind === "slide" ? "slide" : "tackle"});
        Lf.stepN(kind === "slide" ? 14 : 5);
        out.act = opp.act ? opp.act.kind || opp.act.type || "act" : null;
      } else if (kind === "stagger"){
        // a heavy body check: the loser of the collision staggers (agent.js separate's rule, given here)
        opp.m.stagger = opp.prm.staggerT; me.m.stagger = me.prm.staggerT*.5;
        Lf.stepN(3);
        out.stagger = opp.m.stagger > 0;
      } else if (kind === "restart"){
        RU.startRestart(m, "throw", 1 - me.team, {x: m.ball.p.x, z: m.spec.hz});
        out.restart = !!m.restart;
        Lf.stepN(10);
      } else if (kind === "extra"){
        const e = B.createBall({x: me.m.x + 2, z: me.m.z + 1, rollDecel: m.spec.roll}); e.state = "free"; e.v.x = 3;
        m.spares.push({ball: e, cone: -1, state: "loose"});
        Lf.stepN(5);
        out.extra = m.spares.length;
      } else if (kind === "notice"){
        TH.thudNotice("Not this time", false);
        Lf.stepN(2);
        out.notice = !!TH.thudState().note;
      } else Lf.stepN(30);
      if (kind === "strike" || kind === "shield") Lf.stepN(20);
      out.t = ms().t; out.digest = R.digest().hash;
      return out;
    }, {kind, i});
    if (kind === "strike") made.charge = await page.evaluate(() => { const C = window.__fp ? window.__fp.CTRL : null; return C ? !!C.charge || C.lmb : null; });
    await pressReal(page, "Backspace");
    // (read before the held button or key is let go: letting go is input to the new go)
    const s = await runState(page);
    const diff = s.digest === d0 ? null : await digestDiff(page);
    if (kind === "strike") await page.mouse.up();
    if (kind === "shield") await page.keyboard.up("c");
    res.restarts.push(Object.assign({i, made, diff}, s));
    // play goes on after it, for real frames, so the next state starts from a real go
  }
  const RS = res.restarts;
  check(RS.every((r, i) => r.restarts === RS[0].restarts - RS[0].i + i), "every real Backspace restarted the scenario (50 restarts)", RS.map(r => r.restarts));
  check(RS.every(r => r.pos <= .001 && r.yaw <= 1e-9), "every restart: each agent at its setup place within 1 mm, facing its setup way", RS.map(r => [r.pos, r.yaw]));
  check(RS.every(r => r.ballP <= .001 && r.t === 0 && r.step === 0), "every restart: the ball at its placement, the clock at 0", RS.map(r => [r.ballP, r.t]));
  check(RS.every(r => r.plans === 0 && r.acts === 0 && r.stamina === 0), "every restart: AI plans and acts null, stamina full as the setup has it", RS.map(r => [r.plans, r.acts, r.stamina]));
  check(RS.every(r => JSON.stringify(r.poss) === JSON.stringify(RS[0].poss) && JSON.stringify(r.ballV) === JSON.stringify(RS[0].ballV)), "every restart: the same possession and the same launched ball", RS.map(r => [r.poss, r.ballV]));
  check(RS.every(r => r.digest === d0), "the full reset state (RUN.digest) after every restart equals the digest at activation", RS.filter(r => r.digest !== d0).map(r => ({i: r.i, kind: r.made.kind, diff: r.diff})));
  const madeOk = {tackle: RS.some(r => r.made.kind === "tackle" && r.made.act), slide: RS.some(r => r.made.kind === "slide" && r.made.act), stagger: RS.some(r => r.made.stagger),
    restart: RS.some(r => r.made.restart), extra: RS.some(r => r.made.extra > 1), notice: RS.some(r => r.made.notice)};
  res.states = madeOk;
  check(Object.values(madeOk).every(Boolean), "the restarts were made from mid-tackle, mid-slide, a stagger, a restart procedure, an extra ball and a notice", madeOk);

  // ---------- Esc: the pause card ----------
  await unfreeze(page);
  await frames(page, 10);
  await lockPointer(page);
  // (the renderer's memory counts what has been drawn: it is compared with a scenario on screen, here and at the end)
  const drawn0 = await counts();
  const tA = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  await frames(page, 20);
  const tB = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  await pressReal(page, "Escape");
  await cardUp(page);
  const v = await assertVisible(page, '#fpOverlay [data-q="resume"]');
  const c1 = await cardState(page);
  const t0 = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  await frames(page, 60);
  const t1 = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  res.esc = {played: tB - tA, visible: v, card: c1, still: t1 - t0};
  await snap(page, "tr4-reset-pause");
  check(tB > tA, "the scenario plays under pointer lock", res.esc);
  check(v.ok && c1.on && c1.quick, "a real Esc opens the pause card, visible above the cover", res.esc);
  check(c1.lock === null, "the pointer is free while the card is up", c1);
  check(t1 === t0, "the simulation does not advance over 60 frames with the card up", {t0, t1});
  check(["resume", "restart", "config", "hub"].every(k => c1.items.includes(k)), "the card lists Resume, Restart Current Scenario, Return to Configuration and Return to Hub", c1.items);
  check(c1.items.includes("replay"), "Replay Last Scenario is there once something was played before", c1.items);
  const labels = await page.evaluate(() => [...document.querySelectorAll("#fpOverlay [data-q]")].map(b => b.textContent.trim()));
  check(["Restart Current Scenario", "Replay Last Scenario", "Return to Configuration", "Return to Hub"].every(l => labels.includes(l)), "the items read as the spec names them", labels);
  // Resume: the pointer back on its click, play goes on
  await clickReal(page, '#fpOverlay [data-q="resume"]');
  await page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 10000}).catch(() => {});
  const r1 = await cardState(page), tr0 = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  await frames(page, 30);
  const tr1 = await page.evaluate(() => window.__trainRun.RUN.ms.t);
  res.items.resume = {card: r1, played: tr1 - tr0};
  check(!r1.on && !!r1.lock && tr1 > tr0, "Resume (a real click) takes the pointer back and play goes on", res.items.resume);
  // the pointer let go another way (document.exitPointerLock): the same card
  await page.evaluate(() => document.exitPointerLock());
  await cardUp(page);
  const c2 = await cardState(page);
  check(c2.on && c2.quick && c2.lock === null, "letting the pointer go (exitPointerLock) opens the same card", c2);

  // ---------- each item by a real click ----------
  // Restart Current Scenario
  await freeze(page);
  await page.evaluate(() => window.__life.stepN(30));
  await clickReal(page, '#fpOverlay [data-q="restart"]');
  await page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 10000}).catch(() => {});
  const sR = await runState(page), cR = await cardState(page), atR = await page.evaluate(() => window.__qaAt);
  res.items.restart = {digest: atR === d0, card: cR, t: sR.t, diff: sR.digest === d0 ? null : await digestDiff(page)};
  check(atR === d0 && sR.t === 0 && !cR.on && !!cR.lock, "Restart Current Scenario (a real click): the setup back exactly, the card gone, the pointer back", res.items.restart);
  // Backspace with the card up restarts too
  await page.evaluate(() => window.__life.stepN(25));
  await page.evaluate(() => document.exitPointerLock());
  await cardUp(page);
  await pressReal(page, "Backspace");
  const sB = await runState(page);
  check(sB.digest === d0, "Backspace on the card restarts too", sB);
  await page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 10000}).catch(() => {});

  // Return to Configuration: the scenario stopped, its bodies back in the pool, the configuration handed on
  await page.evaluate(() => { window.__qaCfg = null; window.__qaCfgH = e => { e.preventDefault(); window.__qaCfg = e.detail; }; addEventListener("train:configure", window.__qaCfgH); });
  await page.evaluate(() => document.exitPointerLock());
  await cardUp(page);
  const bodies0 = await page.evaluate(async () => (await import("/js/life/human.js")).bodies().length);
  await clickReal(page, '#fpOverlay [data-q="config"]');
  const rc = await page.evaluate(async cfg => {
    const R = window.__trainRun, H = await import("/js/life/human.js"), d = window.__qaCfg;
    removeEventListener("train:configure", window.__qaCfgH);
    const out = {cur: R.RUN.cur, inUse: R.poolStats().inUse, bodies: H.bodies().length, got: d ? {id: d.id, type: d.type, same: JSON.stringify(d.config) === JSON.stringify(cfg)} : null, mode: window.__life.modes.mode(), hub: window.__trainHub.hubOpen()};
    // Start from the configuration it was handed: the same setup snapshot
    out.start = R.startScenario(d.id, d.config);
    out.digest = R.digest().hash;
    return out;
  }, cfg);
  res.config = Object.assign(rc, {bodies0});
  check(rc.cur === null && rc.inUse === 0 && rc.bodies === bodies0 && rc.mode === "trainsb", "Return to Configuration (a real click): the scenario stops, every body back in the pool, nothing built", res.config);
  check(rc.got && rc.got.id === "qa-3v3" && rc.got.same && !rc.hub, "it hands the current configuration to the configuration sheet (train:configure)", rc.got);
  check(rc.start && rc.digest === d0, "Start with that configuration gives the same setup snapshot (digest)", rc);

  // Replay Last after a configuration change: the setup before the change
  const rp = await page.evaluate(async cfg => {
    const R = window.__trainRun;
    R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub();
    const prev = JSON.stringify(R.RUN.last.setup);
    // the configuration changed: one against one, a different seed
    R.startScenario("qa-3v3", Object.assign({}, cfg, {n: 0, m: 1, seed: 77}));
    return {prev, now: JSON.stringify(R.RUN.setup), nowDigest: R.digest().hash};
  }, cfg);
  await lockPointer(page);
  await page.evaluate(() => window.__life.stepN(40));
  await page.evaluate(() => document.exitPointerLock());
  await cardUp(page);
  await clickReal(page, '#fpOverlay [data-q="replay"]');
  await page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 10000}).catch(() => {});
  const rp2 = await page.evaluate(() => ({setup: JSON.stringify(window.__trainRun.RUN.setup), digest: window.__qaAt, last: JSON.stringify(window.__trainRun.RUN.last.setup), mates: window.__trainRun.RUN.setup.mates.length}));
  res.replay = {changed: rp.prev !== rp.now, restored: rp2.setup === rp.prev, digest: rp2.digest === d0, lastIsChanged: rp2.last === rp.now, mates: rp2.mates};
  check(res.replay.changed && res.replay.restored && res.replay.digest, "Replay Last Scenario (a real click) after a configuration change restores the setup before the change", res.replay);
  check(res.replay.lastIsChanged, "and the changed one becomes the last in its turn", res.replay);

  // Backspace with a text field focused does nothing: the presets' name field, the card waiting under the sheet
  await page.evaluate(() => window.__life.stepN(30));
  await unfreeze(page);
  await page.evaluate(() => { const R = window.__trainRun; window.__trainPresetUI.openPresets({type: "qa3v3", typeName: "Test", config: R.RUN.cur.config}); });
  await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open #tpName"), null, {timeout: 10000});
  await frames(page, 5);
  const bs = await page.evaluate(() => ({restarts: window.__trainRun.RUN.restarts, t: window.__trainRun.RUN.ms.t}));
  await clickReal(page, "#tpName");
  await page.keyboard.type("ab");
  await pressReal(page, "Backspace");
  const bs2 = await page.evaluate(() => ({restarts: window.__trainRun.RUN.restarts, t: window.__trainRun.RUN.ms.t, value: document.getElementById("tpName").value, focus: document.activeElement && document.activeElement.id, card: !!(window.__trainQuick.quickIsOpen())}));
  res.backspace = {before: bs, after: bs2};
  check(bs2.restarts === bs.restarts && bs2.t === bs.t && bs2.value === "a" && bs2.focus === "tpName", "Backspace in the preset name field edits the name and never restarts", res.backspace);
  await pressReal(page, "Escape");
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
  await cardUp(page);
  check((await cardState(page)).on, "the pause card comes up once the sheet has gone", await cardState(page));

  // Return to Hub: the scenario stops and the hub opens on its category
  await clickReal(page, '#fpOverlay [data-q="hub"]');
  await page.waitForFunction(() => window.__trainHub.hubOpen(), null, {timeout: 10000});
  const rh = await page.evaluate(() => ({cur: window.__trainRun.RUN.cur, cat: window.__trainHub.hubCategory(), inUse: window.__trainRun.poolStats().inUse, card: window.__trainQuick.quickIsOpen()}));
  res.items.hub = rh;
  check(rh.cur === null && rh.cat === "attacking" && rh.inUse === 0 && !rh.card, "Return to Hub (a real click): the scenario stops and the hub opens on its category", rh);
  await closeHubReal(page);

  // ---------- the reset's CPU time (ThreadTime), median of 15, with nothing else running (the page frozen) ----------
  await freeze(page);
  await page.evaluate(cfg => { window.__qaAtOff(); window.__trainRun.startScenario("qa-3v3", cfg); }, cfg);
  const cpu = [];
  for (let i = 0; i < 15; i++){
    await page.evaluate(() => window.__life.stepN(10));
    const {ms} = await cpuMs(page, () => page.evaluate(() => window.__trainRun.restart()));
    cpu.push(ms);
  }
  // (what a page.evaluate round trip costs the page by itself, taken off: the reset's own CPU is what is measured)
  const empty = [];
  for (let i = 0; i < 15; i++) empty.push((await cpuMs(page, () => page.evaluate(() => 1))).ms);
  cpu.sort((a, b) => a - b); empty.sort((a, b) => a - b);
  const load = (await import("node:os")).loadavg()[0];
  res.cpu = {median: cpu[7] - empty[7], raw: cpu[7], overhead: empty[7], all: cpu, load};
  check(res.cpu.median <= 4, "a reset costs at most 4 ms of main-thread CPU (median of 15, ThreadTime)", res.cpu);

  // ---------- nothing grew ----------
  await unfreeze(page);
  await page.evaluate(cfg => { const R = window.__trainRun; R.restart(); }, cfg);
  await frames(page, 20);
  const drawn1 = await counts();
  // another round of everything that makes or drops things (extra balls, restarts, a stop and a start), drawn
  await page.evaluate(async cfg => {
    const R = window.__trainRun, B = await import("/js/life/football/ball.js");
    for (let i = 0; i < 10; i++){
      const m = R.RUN.ms, e = B.createBall({x: m.ball.p.x + 2, z: m.ball.p.z, rollDecel: m.spec.roll}); e.state = "free"; m.spares.push({ball: e, cone: -1, state: "loose"});
      window.__life.stepN(15); R.restart();
    }
    R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub();
    R.startScenario("qa-3v3", cfg);
  }, cfg);
  await frames(page, 20);
  const drawn2 = await counts();
  await page.evaluate(() => { const R = window.__trainRun; R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
  await frames(page, 5);
  const after = await counts();
  res.growth = {before, after, drawn0, drawn1, drawn2};
  check(after.bodies === before.bodies && after.maxId === before.maxId, "bodies: +0 (no body built)", res.growth);
  check(after.listeners === before.listeners && after.intervals === before.intervals, "listeners and intervals: +0", res.growth);
  check(after.timers <= before.timers, "pending timers: +0", res.growth);
  check(JSON.stringify(after.sched) === JSON.stringify(before.sched), "scheduler counts: +0", res.growth);
  // (the first minutes of play draw a few things for the first time, which the view keeps: from then on nothing grows)
  check(drawn2.geo === drawn1.geo && drawn2.tex === drawn1.tex && drawn1.geo - drawn0.geo <= 4, "renderer.info geometries and textures: +0 over another round of restarts, extra balls, a stop and a start", res.growth);
  check(JSON.stringify(after.mg) === JSON.stringify(before.mg), "the merge (MG): +0", res.growth);
  check(!(await trainWrites(page)).length, "no career key written while Training ran", await trainWrites(page));
  const careerAfter = await careerSnapshot(page);
  check(careerDiff(careerBefore, careerAfter).length === 0, "the career keys are unchanged", careerDiff(careerBefore, careerAfter));
} catch(e){ res.errors.push("tr4-reset: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors.map(x => "page: " + x));
  report("tr4-reset", res);
  await t.close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr4-reset: pass");
