// qa/wpE-bridge.mjs: the match's side of the career in the real game (Chromium, the classic scripts loaded).
// Owner: WP-E. Contract DESIGN 1.4.16 (bridge), 1.4.19 (match.js), 3.4.3 to 3.4.6; acceptance 2.3 WP-E (bridge parity,
// determinism Node versus Chromium).
//
// 1. Parity: for each match of qa/golden/legacy-finish.json (ten 2D matches recorded before the rework), the career at
//    full time is rebuilt from what finishMatch read (pre) and the counters it had (mt); legacyRating and matchRewards
//    then have to give the recorded rating, reputation, world reputation, XP, trust and chemistry exactly, with the
//    random numbers finishMatch drew itself fed back in order.
// 2. The 3D match flow on a real career: matchSetup, bridge.matchConfig, createMatch, bridge.attach, a checkpoint, a
//    level-up during the match, bridge.finish; the world's record, MT, S.life.inMatch cleared, the cards' HTML.
// 3. quickMatch (the hub without the 3D world): the fixture is played out and the notice is given.
// 4. Determinism: the same configuration gives the same event-log hash in Node and in Chromium. While a module the
//    simulation runs through (mover.js, stamina.js, gaitcore.js, rng.js, pitchspec.js) still calls an engine-defined
//    Math function, a difference is reported as waiting for those hook requests (as qa/wpC-det.mjs does; since the P1a
//    integration none does, so the check is strict).
//
//   QA_PORT=8770 node qa/wpE-bridge.mjs [--parity N]     exits 1 on any failed check; writes qa/out/wpE-bridge.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, report, ROOT} from "./lib.mjs";

const argv = process.argv.slice(2);
const NPAR = argv.includes("--parity") ? +argv[argv.indexOf("--parity") + 1] : Infinity;
const res = {name: "wpE-bridge", checks: [], ok: true};
const check = (pass, name, value, wait = false) => {
  res.checks.push({name, pass: wait ? null : !!pass, waiting: wait || undefined, value});
  if (!wait && !pass) res.ok = false;
  console.log(`${wait ? "wait" : pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const EM = String.fromCharCode(0x2014);

/* ---------- 1. parity with the legacy finishMatch ---------- */

// runs in the page: the recorder's way to the fixture, the full-time state of the golden, then the formulas
function parityInPage(g){
  const cfg = g.cfg;
  for (let n = 0; n < 60; n++){ const f = todaysFixture(); if (f && (cfg.kind === "F" || f.kind === cfg.kind)) break; S.life.min = 23*60; sleepNight(2); startNewDay(); }
  const fx = todaysFixture();
  if (cfg.trust != null) S.trust = cfg.trust;
  if (cfg.chem != null) S.chem = cfg.chem;
  if (cfg.wr != null) S.workrate = cfg.wr;
  if (cfg.skill != null){ for (const k in S.skills) S.skills[k] = cfg.skill; meP().ovr = overall(); }
  const me = meP();
  const kickoff = {key: fx ? fx.key : null, trust: S.trust, chem: S.chem, ovr: me.ovr, level: S.level};
  // the fixture of the golden, and MT as the 2D match left it at full time (before finishMatch's own chemistry)
  const gf = g.fixture, f = Object.assign({}, fx && fx.key === gf.key ? fx : {}, gf);
  matchSetup(f);
  const mt = g.mt;
  for (const k of ["home", "usId", "themId", "role", "onPitch", "subOn", "subOff", "cameOn", "subbedOff", "injuredOff", "sentOff", "poss", "ourR", "oppR", "nerves", "tired", "extras"]) MT[k] = mt[k];
  MT.score = mt.score.slice(); MT.my = Object.assign({}, mt.my); MT.stats = JSON.parse(JSON.stringify(mt.stats)); MT.stad = Object.assign({}, mt.stad);
  MT.chemD = mt.chemD - g.out.chem.formula;
  MT.usGoals = mt.usGoals.map(x => ({s: x.s, a: x.a})); MT.themGoals = mt.themGoals.map(x => ({s: x.s, a: x.a}));
  MT.usXI = mt.usXI.map(id => W.players[id]).filter(Boolean); MT.themXI = mt.themXI.map(id => W.players[id]).filter(Boolean);
  delete MT.on;                                             // the 2D match's minutes (role, came on, went off)
  // the career as finishMatch read it
  const p = g.pre;
  S.trust = p.trust; S.chem = p.chem; S.xp = p.xp; S.xpF = p.xpF; S.level = p.level; S.sp = p.sp; S.money = p.money;
  S.skills.composure = p.composure; S.workrate = p.workrate; S.player.pos = p.pos; S.player.nat = p.nat;
  me.rep = p.rep; me.wrep = p.wrep;
  if (S.contract) Object.assign(S.contract, p.contract);
  if (W.clubs[mt.usId]){ W.clubs[mt.usId].rep = p.clubRep; W.clubs[mt.usId].cc = p.clubCc; }
  const was = {styleMul: window.styleMul, addXP: window.addXP, chemAdd: window.chemAdd, random: Math.random};
  window.styleMul = () => p.styleMul;
  const xps = [], chems = [];
  window.addXP = x => { xps.push(x); return was.addXP(x); };
  window.chemAdd = d => { chems.push(d); return was.chemAdd(d); };
  // the rolls: drawn by matchRewards itself (directly or through rnd, ri, pick or gauss) come from the golden, in order
  const queue = g.rolls.map(r => r.v), base = Math.random;
  let used = 0;
  Math.random = () => {
    const fr = (new Error().stack || "").split("\n").slice(2, 5);
    const i = /at (rnd|ri|pick|gauss) /.test(fr[0]) ? (/at (rnd|ri|pick|gauss) /.test(fr[1]) ? 2 : 1) : 0;
    if (/at matchRewards /.test(fr[i] || "") && queue.length){ used++; return queue.shift(); }
    return base();
  };
  let rating, R, err = null;
  try {
    rating = legacyRating(MT);
    R = matchRewards(MT, rating, {motm: g.out.motm ? S.meId : -1});
  } catch(e){ err = String(e && e.stack || e); }
  finally { Math.random = was.random; window.styleMul = was.styleMul; window.addXP = was.addXP; window.chemAdd = was.chemAdd; }
  return {kickoff, err, rating, repD: R && R.repD, wrepD: R && R.wrepD, xp: xps, trustD: R && R.trustD, chem: chems.reduce((a, b) => a + b, 0), used, rolls: g.rolls.length,
    level: S.level, xpAfter: S.xp};
}

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "golden", "legacy-finish.json"), "utf8"));
{
  const rows = [];
  let allSame = true;
  for (let i = 0; i < Math.min(NPAR, golden.matches.length); i++){
    const g = golden.matches[i];
    const {page, close} = await launch({gfx: "low", seed: g.cfg.seed});
    let r;
    try {
      await freeze(page);
      await career(page, {pos: g.cfg.pos, zone: "ground", frames: 0, name: "Legacy Test"});
      r = await page.evaluate(parityInPage, g);
      r.errors = page.errors.slice();
    } finally { await close(); }
    const o = g.out, near = (a, b) => Math.abs(a - b) < 1e-9;
    const same = !r.err && r.rating === o.rating && r.repD === o.rep.formula && r.wrepD === o.wrep.formula && r.xp.length === o.xp.length && r.xp.every((x, k) => near(x, o.xp[k]))
      && near(r.trustD, o.trust.formula) && near(r.chem, o.chem.formula) && r.used === r.rolls && r.level === o.level && r.xpAfter === o.xpAfter;
    if (!same || r.errors.length) allSame = false;
    rows.push({seed: g.cfg.seed, same, rating: [r.rating, o.rating], rep: [r.repD, o.rep.formula], wrep: [r.wrepD, o.wrep.formula], xp: [r.xp, o.xp], trust: [r.trustD, o.trust.formula],
      chem: [r.chem, o.chem.formula], rolls: [r.used, r.rolls], level: [r.level, o.level], err: r.err, errors: r.errors});
    console.log(`  seed ${g.cfg.seed}: ${same ? "same" : "DIFFERS"} rating ${r.rating}/${o.rating} rep ${r.repD}/${o.rep.formula} wrep ${r.wrepD}/${o.wrep.formula} xp ${r.xp}/${o.xp} trust ${r.trustD}/${o.trust.formula} chem ${r.chem}/${o.chem.formula}${r.err ? " ERROR " + r.err : ""}${r.errors.length ? " page errors: " + r.errors.join("; ") : ""}`);
  }
  check(allSame && rows.length > 0, `matchRewards and legacyRating reproduce rating, reputation, world reputation, XP, trust and chemistry of the ${rows.length} golden matches exactly`, rows.filter(x => !x.same));
}

/* ---------- 2 to 4. the 3D match flow, quickMatch, determinism ---------- */

// runs in the page: a whole match through the bridge on a real career
async function flowInPage(){
  const B = await import("./js/life/football/bridge.js"), Sim = await import("./js/life/football/sim.js"), Ev = await import("./js/life/football/events.js");
  const out = {};
  for (let n = 0; n < 60; n++){ const f = todaysFixture(); if (f && f.kind === "L") break; S.life.min = 23*60; sleepNight(2); startNewDay(); }
  const f = todaysFixture();
  out.fixture = f ? f.key : null;
  const skills0 = JSON.stringify(S.skills);
  matchSetup(f);
  MT.role = "starter"; MT.onPitch = true; MT.on = [[0, null]]; MT.subOn = 0; MT.subOff = 0;
  const cfg = B.matchConfig(f, MT, {});
  out.skillsUntouched = JSON.stringify(S.skills) === skills0;
  out.cfg = {seed: cfg.seed, me: cfg.me.team, sides: cfg.teams.map(t => t.players.length), half: cfg.halfRealSec};
  const ms = Sim.createMatch(Object.assign(cfg, {meAI: true, htAuto: true}));
  const off = B.attach(ms, Sim.on);
  Sim.runHeadless(ms, 20*60);
  out.mirror = {minute: MT.minute, score: MT.score.slice(), simScore: ms.score.slice(), home: MT.home};
  const rec = B.checkpoint(ms);
  out.checkpoint = rec ? Object.keys(rec) : null;
  out.persist = !!(S.life && S.life.inMatch && S.life.inMatch.fkey === f.key);
  // a level-up during the match: the career's own skill XP
  const pace0 = S.skills.pace;
  skillXP("pace", skillNeed("pace") + 1);
  out.levelled = S.skills.pace === pace0 + 1;
  Sim.runHeadless(ms);
  // an own goal is credited s = -1 (1.4.16 goalLists): career.js newsFromMatch skips it (the P1a hook), so full time
  // goes through whatever the score
  out.ownGoals = ms.events.filter(e => e.kind === "goal" && e.ownGoal && !e.disallowed).length;
  const fin = B.finish(ms);
  // and the news of a fixture that matters, with nothing but an own goal in it, says nothing about anyone
  try { const n0 = (S.news || []).length; newsFromMatch({f: Object.assign({}, f, {kind: "E"}), hg: 1, ag: 0, hG: [{s: -1, a: -1}], aG: [], rt: {}, motm: -1}); out.ogNews = {ok: true, added: (S.news || []).length - n0}; }
  catch(e){ out.ogNews = {ok: false, err: String(e)}; }
  off();
  out.afterFinish = {pace: S.skills.pace, want: pace0 + 1};
  out.done = !!W.done[f.key];
  out.inMatchCleared = !(S.life && "inMatch" in S.life);
  out.rating = fin.rating; out.R = fin.R ? {xp: fin.R.xp, trustD: fin.R.trustD, mins: fin.R.mins, fatigue: fin.R.fatigue} : null;
  out.mt = {label: MT.label, score: MT.score.slice(), stats: Object.keys(MT.stats || {}), on: MT.on, drain: MT.drainPerMin != null};
  const ft = ftCardHTML(MT, fin.R), ht = htCardHTML(MT, {rating: 6.4, drift: true, drinks: []});
  out.cards = {ft: ft.length, ht: ht.length, ftDash: ft.includes(String.fromCharCode(0x2014)), htDash: ht.includes(String.fromCharCode(0x2014)),
    htLine: /Sharpen up/.test(ht), drift: /drifting out of position/.test(ht)};
  // the resume of an interrupted match: rebuilt from the checkpoint and run to full time
  const ms2 = Sim.createMatch(Object.assign(B.matchConfig(f, MT, {resume: rec}), {meAI: true, htAuto: true}));
  out.resume = {seed: ms2.cfg.seed, want: (rec.seed + rec.step) >>> 0, score: ms2.score.slice(), recScore: rec.score.slice()};
  // quickMatch on the next fixture
  let g = null;
  for (let n = 0; n < 60 && !g; n++){ S.life.min = 23*60; sleepNight(2); startNewDay(); const x = todaysFixture(); if (x && !W.done[x.key]) g = x; }
  out.quick = null;
  if (g){
    const R = quickMatch(g);
    out.quick = {key: g.key, done: !!W.done[g.key], notice: R && R.notice, toast: document.body.innerText.includes("This match was played out for you")};
  }
  out.hashChromium = null;
  return out;
}
// runs in the page: the hash of a configuration's first 120 s
async function hashInPage(cfgJSON){
  const Sim = await import("./js/life/football/sim.js"), Ev = await import("./js/life/football/events.js"), PS = await import("./js/life/football/pitchspec.js");
  const cfg = JSON.parse(cfgJSON);
  cfg.spec = PS.makePitch({boards: true, roll: cfg.specRoll});
  const ms = Sim.createMatch(cfg);
  while (ms.t < 120) Sim.simStep(ms);
  return {hash: Ev.logHash(ms), n: ms.events.length};
}

{
  const {page, close} = await launch({gfx: "low", seed: 4242});
  let flow, hashC, cfgJSON;
  try {
    await freeze(page);
    await career(page, {pos: "CM", zone: "ground", frames: 0, name: "Bridge Test"});
    flow = await page.evaluate(flowInPage);
    // determinism: a configuration from the harness's club pairs, in Node and in Chromium
    const {configFor} = await import("./harness.mjs");
    const cfg = configFor(11);
    cfg.specRoll = cfg.spec.roll;
    const spec = cfg.spec; delete cfg.spec;
    cfgJSON = JSON.stringify(cfg); cfg.spec = spec;
    hashC = await page.evaluate(hashInPage, cfgJSON);
    flow.errors = page.errors.slice();
  } finally { await close(); }
  check(flow.skillsUntouched, "matchSetup and bridge.matchConfig leave S.skills as they were");
  check(flow.cfg && flow.cfg.sides.every(n => n === 11), "the configuration from a real fixture: two sides of eleven", flow.cfg);
  check(flow.mirror.minute >= 19 && flow.mirror.score.join() === (flow.mirror.home ? flow.mirror.simScore : flow.mirror.simScore.slice().reverse()).join(), "liveMirror keeps MT's minute and score with the simulation", flow.mirror);
  check(flow.checkpoint && flow.persist, "bridge.checkpoint writes S.life.inMatch for the fixture", flow.checkpoint);
  check(flow.levelled && flow.afterFinish.pace === flow.afterFinish.want, "a level-up during the match (skillXP) is still there after bridge.finish", flow.afterFinish);
  check(flow.done && flow.inMatchCleared && flow.mt.label === "FT" && flow.R && flow.R.xp > 0, "full time: the world has the result, the checkpoint is cleared, MT is at full time, matchRewards gave XP", {done: flow.done, cleared: flow.inMatchCleared, R: flow.R});
  check(flow.R && flow.R.mins === 90 && flow.R.fatigue >= 8 && flow.mt.drain, "the minutes from MT.on and the fatigue from the drain (1.5.2)", flow.R);
  check(flow.cards.ft > 200 && flow.cards.ht > 100 && !flow.cards.ftDash && !flow.cards.htDash && flow.cards.htLine && flow.cards.drift, "the full-time and half-time cards build without an em dash, with the manager's lines", flow.cards);
  check(flow.resume.seed === flow.resume.want && flow.resume.score.join() === flow.resume.recScore.join(), "the interrupted match rebuilds from its checkpoint (seed moved on, score kept)", flow.resume);
  check(flow.quick && flow.quick.done && flow.quick.notice === "This match was played out for you. Full matches need the 3D world: open the game from a web address in a browser with WebGL2.",
    "quickMatch plays the fixture out and gives the notice", flow.quick);
  check(flow.errors.length === 0, "no console or page errors", flow.errors);
  check(flow.ogNews && flow.ogNews.ok && flow.ogNews.added === 0, "an own goal (s = -1) passes through the news without a headline or an error (career.js newsFromMatch)", {ogNews: flow.ogNews, ownGoalsInThisMatch: flow.ownGoals});
  // Node's run of the same configuration
  const {createMatch, simStep} = await import("../js/life/football/sim.js");
  const {logHash} = await import("../js/life/football/events.js");
  const {makePitch} = await import("../js/life/football/pitchspec.js");
  const cfgN = JSON.parse(cfgJSON);
  cfgN.spec = makePitch({boards: true, roll: cfgN.specRoll});
  const msN = createMatch(cfgN);
  while (msN.t < 120) simStep(msN);
  const hashN = {hash: logHash(msN), n: msN.events.length};
  const same = hashN.hash === hashC.hash && hashN.n === hashC.n;
  const engineMath = ["js/life/mover.js", "js/life/stamina.js", "js/life/gaitcore.js", "js/life/football/rng.js", "js/life/football/pitchspec.js"]
    .filter(f => /Math\.(sin|cos|tan|exp|log|pow|atan|atan2|asin|acos|hypot|cbrt|expm1|log1p|sinh|cosh|tanh)\(/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  check(same, "the same configuration gives the same event-log hash in Node and in Chromium (120 s of play)", {node: hashN, chromium: hashC, engineMath}, !same && engineMath.length > 0);
}

report(res.name, res);
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass${res.checks.some(c => c.waiting) ? ", " + res.checks.filter(c => c.waiting).length + " waiting for hook requests" : ""}`);
process.exit(res.ok ? 0 : 1);
