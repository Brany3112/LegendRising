// qa/tr4-config.mjs: the configuration sheet in the browser, by real clicks and typing. Each type shows only its
// relevant rows, and each setting changes what is really spawned when the scenario starts.
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN P4-A acceptance "qa/tr4-config.mjs"; TRAINING-SPEC 0 (6 v 6
// plus a keeper, me counted, G0 h), 4 (shared configuration, only relevant settings, every setting real) and 8 (nothing
// runs behind the sheet).
//
//   setting                          checked at activation
//   attackers and defenders counts   the spawned outfield bodies and agents per side, me included on my side
//   my role                          my agent's slot and role, and the camera on that agent
//   initial possession               ms.poss team and controller
//   team-mates off / opponents off   no agents on that side apart from me (and the keeper when on)
//   AI keeper on / off               ms.gks[t] present or absent, his body present or absent
//   starting positions               each agent at slot plus offset within 1 mm
//   ball placement                   the ball at the configured point within 1 mm
//   out of play: rebound / stop      a ball driven at the fence comes back with no out event / stops with out and a restart
// While the sheet is open, renderer.info.render.frame does not advance. The career is never written meanwhile.
//
//   node qa/tr4-config.mjs      exits 1 on any failed check; writes qa/out/tr4-config.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {freeze, unfreeze} from "./lib.mjs";
import {trainWrites} from "./tr3b-lib.mjs";
import {trainingWithScenarios, clickIn, typeIn, openSheetFor, startFromSheet, stopAndReset, sheetRows, QA_SCENARIOS} from "./tr4a-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr4-config", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const set = (k, v) => `#trainCfg [data-cf="set"][data-k="${k}"][data-v="${typeof v === "boolean" ? "b:" + v : typeof v === "number" ? "n:" + v : "s:" + v}"]`;

// who is on the pitch now (the scenario just started, nothing stepped)
// (also taken by the runner's own notice the moment a scenario starts, before its first step: window.__qaAtStart)
const SNAP = () => {
  const R = window.__trainRun, ms = R.RUN.ms, T = R.RUN.T, me = ms.agents[ms.me];
  const players = ms.agents.filter(a => a.role === "player" && a.onPitch);
  const side = t => ({agents: players.filter(a => a.team === t && !a.isGK).length, bodies: players.filter(a => a.team === t && !a.isGK && T.bodyOf(a)).length,
    keeper: ms.gks[t] >= 0 && !!ms.agents[ms.gks[t]] && ms.agents[ms.gks[t]].onPitch, keeperBody: ms.gks[t] >= 0 ? !!T.bodyOf(ms.agents[ms.gks[t]]) : false});
  return {myTeam: me.team, mine: side(me.team), theirs: side(1 - me.team), meSlot: me.slot, role: R.RUN.setup.role, meIsGK: me.isGK, viewMe: T.V ? T.V.me === ms.me : null,
    cam: {x: window.__life.P.x - T.F.cx, z: window.__life.P.z - T.F.cz}, mePos: {x: me.m.x, z: me.m.z},
    ball: {x: ms.ball.p.x, y: ms.ball.p.y, z: ms.ball.p.z},
    agents: players.map(a => ({id: a.id, team: a.team, gk: a.isGK, me: a.isMe, x: a.m.x, z: a.m.z, slot: a.slot})), step: ms.step};
};
const spawned = page => page.evaluate(() => window.__qaSnap());
const atStart = page => page.evaluate(() => window.__qaAtStart);

const t = await trainingWithScenarios({seed: 9});
const {page} = t;
try {
  await page.evaluate(async src => {
    window.__qaSnap = (0, eval)("(" + src + ")");
    const Rn = await import("/js/life/train/runner.js");
    let had = null;
    Rn.onRunner(() => { const cur = Rn.RUN.cur; if (cur && cur !== had){ had = cur; window.__qaAtStart = window.__qaSnap(); } else if (!cur) had = null; });
  }, SNAP.toString());
  /* ---------- each type shows only its relevant rows ---------- */
  const rel = {};
  for (const type of Object.keys(QA_SCENARIOS)){
    await openSheetFor(page, type);
    const shown = await sheetRows(page);
    const want = await page.evaluate(async ty => { const C = await import("/js/life/train/config.js"); return C.relevant(ty, C.defaults(ty)); }, type);
    const wantRows = want.filter(k => !["me", "gk", "attAvg", "defAvg"].includes(k));
    const wantSecs = [want.some(k => k === "attAvg" || k === "defAvg") ? "npc" : null, want.includes("me") ? "me" : null, want.includes("gk") ? "gk" : null].filter(Boolean);
    const avg = ["attAvg", "defAvg"].filter(k => want.includes(k));
    const ok = shown.rows.join() === wantRows.join() && shown.sections.join() === wantSecs.join() && avg.every(k => shown.attrs.includes(k)) && ["attAvg", "defAvg"].filter(k => !want.includes(k)).every(k => !shown.attrs.includes(k));
    rel[type] = {ok, shown: shown.rows.join(","), want: wantRows.join(",")};
    // back to the hub with the sheet's own button
    await clickIn(page, '#trainCfg .tcfg-foot [data-cf="back"]');
    await page.waitForFunction(() => !window.__trainConfigUI.configOpen() && window.__trainHub.hubOpen(), null, {timeout: 10000});
  }
  check(Object.values(rel).every(r => r.ok), "each type's sheet shows exactly its relevant rows (config.js relevant)", rel);
  // a choice changes what is relevant at once: opponents off takes their count and their average away
  await openSheetFor(page, "attacking");
  await clickIn(page, set("opps", false));
  const off = await sheetRows(page);
  check(!off.rows.includes("defenders") && !off.attrs.includes("defAvg") && /2 v 0/.test(off.preview), "turning opponents off takes their count and average off the sheet, and the preview follows", off);
  await clickIn(page, set("opps", true));

  /* ---------- nothing is drawn behind the sheet ---------- */
  const fr = await page.evaluate(() => new Promise(r => { const R = window.__life.renderer(), f0 = R.info.render.frame; setTimeout(() => r({f0, f1: R.info.render.frame}), 1200); }));
  check(fr.f0 === fr.f1, "while the sheet is open, renderer.info.render.frame does not advance", fr);
  const pointer = await page.evaluate(() => ({locked: !!document.pointerLockElement, z: getComputedStyle(document.getElementById("trainCfg")).zIndex}));
  check(!pointer.locked, "the pointer is free while the sheet is up", pointer);

  /* ---------- counts ---------- */
  await clickIn(page, set("attackers", 4));
  await clickIn(page, set("defenders", 3));
  const pv = await sheetRows(page);
  await startFromSheet(page);
  await freeze(page);
  let s = await atStart(page);
  check(s.mine.agents === 4 && s.mine.bodies === 4 && s.theirs.agents === 3 && s.theirs.bodies === 3 && s.theirs.keeper && /4 v 3 plus a keeper/.test(pv.preview),
    "4 attackers (me among them) and 3 defenders: that many agents and bodies a side, and the preview said so", {mine: s.mine, theirs: s.theirs, preview: pv.preview});
  await unfreeze(page);
  await stopAndReset(page, "attacking");

  /* ---------- my role ---------- */
  await openSheetFor(page, "attacking");
  await clickIn(page, set("role", "receiver"));
  await startFromSheet(page);
  await page.waitForTimeout(400);
  await freeze(page);
  s = await spawned(page);
  const camD = Math.hypot(s.cam.x - s.mePos.x, s.cam.z - s.mePos.z);
  check(s.meSlot === "CAM" && s.role === "Receiver" && !s.meIsGK && s.viewMe && camD < 1.0, "my role: Receiver puts me in his slot (CAM), with the camera on my agent", {slot: s.meSlot, role: s.role, camD});
  await unfreeze(page);
  await stopAndReset(page, "attacking");

  /* ---------- initial possession ---------- */
  const poss = {};
  for (const who of ["me", "mates", "opps"]){
    await openSheetFor(page, "attacking");
    await clickIn(page, set("possession", who));
    await startFromSheet(page);
    await freeze(page);
    poss[who] = await page.evaluate(() => { const L = window.__life, R = window.__trainRun; L.FLAGS.lockLost = false; L.stepN(20); const ms = R.RUN.ms, c = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
      return {team: ms.poss.team, ctl: ms.poss.ctl, me: ms.me, myTeam: ms.agents[ms.me].team, ctlTeam: c ? c.team : null}; });
    await unfreeze(page);
    await stopAndReset(page, "attacking");
  }
  check(poss.me.ctl === poss.me.me && poss.mates.ctlTeam === poss.mates.myTeam && poss.mates.ctl !== poss.mates.me && poss.opps.ctlTeam === 1 - poss.opps.myTeam && poss.opps.team === poss.opps.ctlTeam,
    "initial possession: me, a team-mate or an opponent controls the ball (ms.poss team and controller)", poss);

  /* ---------- team-mates off, opponents off, the keeper ---------- */
  await openSheetFor(page, "attacking");
  await clickIn(page, set("mates", false));
  await clickIn(page, set("keeper", false));
  await startFromSheet(page);
  const noMates = await spawned(page);
  await stopAndReset(page, "attacking");
  await openSheetFor(page, "attacking");
  await clickIn(page, set("opps", false));
  await startFromSheet(page);
  const noOpps = await spawned(page);
  await stopAndReset(page, "attacking");
  check(noMates.mine.agents === 1 && noMates.theirs.agents === 2, "team-mates off: nobody on my side but me", {mine: noMates.mine, theirs: noMates.theirs});
  check(noOpps.theirs.agents === 0 && noOpps.theirs.keeper && noOpps.mine.agents === 2, "opponents off: nobody on theirs but the keeper (he is on)", {mine: noOpps.mine, theirs: noOpps.theirs});
  check(!noMates.theirs.keeper && !noMates.theirs.keeperBody && noOpps.theirs.keeper && noOpps.theirs.keeperBody, "the AI keeper off: no keeper agent and no keeper body; on: both",
    {off: [noMates.theirs.keeper, noMates.theirs.keeperBody], on: [noOpps.theirs.keeper, noOpps.theirs.keeperBody]});

  /* ---------- starting positions and the ball's placement ---------- */
  await openSheetFor(page, "attacking");
  await typeIn(page, '#trainCfg [data-cf-in="positions.me.dx"]', "2");
  await typeIn(page, '#trainCfg [data-cf-in="positions.me.dz"]', "-3");
  await typeIn(page, '#trainCfg [data-cf-in="positions.att.0.dx"]', "-4.5");
  await typeIn(page, '#trainCfg [data-cf-in="positions.def.1.dz"]', "2.25");
  await clickIn(page, '#trainCfg [data-cf-in="positions.def.0.slot"]');
  await page.selectOption('#trainCfg [data-cf-in="positions.def.0.slot"]', "CDM");
  await clickIn(page, set("ball.mode", "placed"));
  await typeIn(page, '#trainCfg [data-cf-in="ball.at.x"]', "3");
  await typeIn(page, '#trainCfg [data-cf-in="ball.at.z"]', "4.5");
  const typed = await page.evaluate(() => window.__trainConfigUI.configNow());
  await startFromSheet(page);
  await freeze(page);
  s = await atStart(page);
  const exp = await page.evaluate(async ({cfg}) => {
    const TM = await import("/js/life/train/teams.js"), C = await import("/js/life/train/cage.js");
    const one = c => TM.setupFromConfig("attacking", c, {spec: C.CAGE.spec});
    const zero = JSON.parse(JSON.stringify(cfg)); zero.positions.me.dx = 0; zero.positions.me.dz = 0; zero.positions.att[0].dx = 0; zero.positions.def[1].dz = 0;
    return {set: one(cfg), zero: one(zero)};
  }, {cfg: typed});
  const list = [exp.set.me, ...exp.set.mates], their = exp.set.opps.concat(exp.set.keeper ? [exp.set.keeper] : []);
  const mineA = s.agents.filter(a => a.team === s.myTeam), theirA = s.agents.filter(a => a.team !== s.myTeam);
  let posErr = 0;
  mineA.forEach((a, i) => { posErr = Math.max(posErr, Math.hypot(a.x - list[i].x, a.z - list[i].z)); });
  theirA.forEach((a, i) => { posErr = Math.max(posErr, Math.hypot(a.x - their[i].x, a.z - their[i].z)); });
  const dMe = {dx: exp.set.me.x - exp.zero.me.x, dz: exp.set.me.z - exp.zero.me.z}, dMate = exp.set.mates[0].x - exp.zero.mates[0].x, dOpp = exp.set.opps[1].z - exp.zero.opps[1].z;
  check(posErr <= 0.001 && Math.abs(dMe.dx - 2) <= 0.001 && Math.abs(dMe.dz + 3) <= 0.001 && Math.abs(dMate + 4.5) <= 0.001 && Math.abs(dOpp - 2.25) <= 0.001 && theirA[0].slot === "CDM",
    "starting positions: every agent at his slot plus the typed offset, within 1 mm", {posErr, dMe, dMate, dOpp, slot: theirA[0].slot});
  check(Math.abs(s.ball.x - 3) <= 0.001 && Math.abs(s.ball.z - 4.5) <= 0.001 && Math.abs(s.ball.y - 0.11) <= 0.001, "the ball at the configured point, within 1 mm", s.ball);
  await unfreeze(page);
  await stopAndReset(page, "attacking");

  /* ---------- out of play: rebound or stop ---------- */
  const outs = {};
  for (const how of ["rebound", "stop"]){
    await openSheetFor(page, "attacking");
    await clickIn(page, set("opps", false));
    await clickIn(page, set("mates", false));
    await clickIn(page, set("keeper", false));
    await clickIn(page, set("out", how));
    await startFromSheet(page);
    await freeze(page);
    outs[how] = await page.evaluate(() => {
      const L = window.__life, R = window.__trainRun, ms = R.RUN.ms, b = ms.ball, me = ms.agents[ms.me];
      L.FLAGS.lockLost = false;
      // the ball driven at the side fence from 6 m off my right, nobody near it
      b.p.x = me.m.x - 8; b.p.y = 0.11; b.p.z = ms.spec.hz - 6; b.v.x = 0; b.v.y = 0; b.v.z = 16; b.state = "free";
      const e0 = ms.events.length; let back = false, maxZ = -1e9;
      for (let k = 0; k < 150; k++){ L.stepN(1); maxZ = Math.max(maxZ, b.p.z); if (b.v.z < -0.5) back = true; }
      const evs = ms.events.slice(e0);
      return {out: evs.some(e => e.kind === "out"), restart: !!ms.restart, phase: ms.phase, back, maxZ: Math.round(maxZ*100)/100, hz: ms.spec.hz, laws: ms.rules.out};
    });
    await unfreeze(page);
    await stopAndReset(page, "attacking");
  }
  check(!outs.rebound.out && outs.rebound.back && !outs.rebound.restart && outs.rebound.maxZ > outs.rebound.hz, "out of play rebound: the ball comes back off the fence, no out event", outs.rebound);
  check(outs.stop.out && outs.stop.restart, "out of play stop: the ball going over the line is out, and a restart is set", outs.stop);

  /* ---------- an offside start is moved, and the sheet says who ---------- */
  await openSheetFor(page, "scenarios");
  await typeIn(page, '#trainCfg [data-cf-in="positions.att.0.dx"]', "30");
  const offNote = await page.evaluate(() => (document.querySelector("#trainCfg [data-cf-notes]") || {}).textContent || "");
  await startFromSheet(page);
  const offAt = await atStart(page);
  const offExp = await page.evaluate(async () => {
    const TM = await import("/js/life/train/teams.js"), C = await import("/js/life/train/cage.js");
    const s = TM.setupFromConfig("scenarios", window.__trainHub.scenarioConfig("qa-scenarios"), {spec: C.CAGE.spec}), B = 0.25;
    const defs = s.opps.concat(s.keeper ? [s.keeper] : []).map(p => p.x + B).sort((a, b) => b - a);
    return {mateX: s.mates[0].x, line: Math.max(defs[1], s.ball.x) - B};
  });
  const mateAt = offAt.agents.filter(a => a.team === offAt.myTeam && !a.me)[0];
  check(/team-mate at LW started offside/.test(offNote) && Math.abs(mateAt.x - offExp.mateX) <= 0.001 && Math.abs(mateAt.x - offExp.line) < 0.05,
    "offside on: a team-mate placed 30 m forward starts on the line, and the sheet says which one moved", {note: offNote, x: mateAt.x, line: offExp.line});
  await stopAndReset(page, "scenarios");

  /* ---------- the career ---------- */
  const w = await trainWrites(page);
  check(w.length === 0, "nothing wrote the career while Training ran", w.slice(0, 3));
  check(t.errors.length === 0, "no console or page errors", t.errors.slice(0, 5));
} catch(e){
  check(false, "the run finished", String(e && e.stack || e));
} finally {
  fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
  fs.writeFileSync(path.join(ROOT, "qa/out/tr4-config.json"), JSON.stringify(res, null, 1));
  await t.browser.close();
}
console.log(res.ok ? "tr4-config: all checks passed" : "tr4-config: FAILED");
process.exit(res.ok ? 0 : 1);
