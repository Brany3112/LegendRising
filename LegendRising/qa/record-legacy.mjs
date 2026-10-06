// qa/record-legacy.mjs: ten seeded matches of the 2D engine played to full time, for qa/golden/legacy-finish.json.
// Owner: I0 (DESIGN 2.1). WP-E's bridge parity (matchRewards) reads the golden: fed the same counters it has to give
// the same rating, reputation, XP, trust and chemistry as finishMatch did.
//
// Each match is its own browser with Math.random seeded, the RAF loop frozen, and the career created at a fixed time.
// The career sleeps forward to the wanted fixture (the first one, a pre-season friendly, or the first league match),
// trust, chemistry and work rate are set, and the match is played by a simple bot through the engine's own functions
// (advance() for the clock, update(1/60) for every moment, the same calls the buttons, keys and pointer make), with
// nothing drawn. finishMatch is wrapped, not changed: the wrapper notes what it reads, what it returned and every
// random number it drew itself (the reputation swing and the composure roll), then calls the original.
//
//   node qa/record-legacy.mjs            play the ten matches twice, require identical results, write the golden
//   node qa/record-legacy.mjs --check    play them once and compare with the golden
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {launch, career, freeze, ROOT} from "./lib.mjs";

export const GOLDEN = path.join(ROOT, "qa", "golden", "legacy-finish.json");
// kind: "F" the next fixture, whatever it is (for a new career, a pre-season friendly), "L" the next league match
// skill: every skill set to this before kick-off (an established player, who scores now and then), or null as created
export const MATCHES = [
  {seed: 11, pos: "ST", trust: 20, chem: 10, wr: 2, kind: "F", skill: null},
  {seed: 12, pos: "CM", trust: 45, chem: 30, wr: 3, kind: "F", skill: null},
  {seed: 13, pos: "CB", trust: 0, chem: 5, wr: 2, kind: "L", skill: null},
  {seed: 14, pos: "LW", trust: 60, chem: 50, wr: 4, kind: "L", skill: 72},
  {seed: 15, pos: "CAM", trust: 30, chem: 20, wr: 1, kind: "F", skill: 68},
  {seed: 16, pos: "ST", trust: -10, chem: 0, wr: 2, kind: "L", skill: null},
  {seed: 17, pos: "RB", trust: 35, chem: 40, wr: 3, kind: "L", skill: 60},
  {seed: 18, pos: "CDM", trust: 50, chem: 60, wr: 2, kind: "F", skill: null},
  {seed: 19, pos: "RW", trust: 15, chem: 25, wr: 2, kind: "L", skill: 75},
  {seed: 20, pos: "ST", trust: 70, chem: 70, wr: 4, kind: "L", skill: 80}
];

// runs in the page, in one synchronous call
export function playInPage(cfg){
  const DT = 1/60, out = {cfg};
  // to the fixture
  let n = 0;
  for (; n < 60; n++){ const f = todaysFixture(); if (f && (cfg.kind === "F" || f.kind === cfg.kind)) break; S.life.min = 23*60; sleepNight(2); startNewDay(); }
  const f = todaysFixture();
  if (!f) throw new Error("no fixture found for " + JSON.stringify(cfg));
  S.life.min = fixtureSlot(f).min;
  if (cfg.trust != null) S.trust = cfg.trust;
  if (cfg.chem != null) S.chem = cfg.chem;
  if (cfg.wr != null) S.workrate = cfg.wr;
  if (cfg.skill != null){ for (const k in S.skills) S.skills[k] = cfg.skill; const me = meP(); me.ovr = overall(); }
  const me = meP();
  out.kickoff = {day: S.life.day, wd: S.life.wd, week: S.week, trust: S.trust, chem: S.chem, energy: S.energy, fatigue: S.fatigue, workrate: S.workrate,
    rep: me.rep, wrep: me.wrep, ovr: me.ovr, xp: S.xp, level: S.level, money: S.money, skills: Object.assign({}, S.skills), pos: S.player.pos, pref: S.player.pref};
  out.fixture = {key: f.key, kind: f.kind, comp: f.comp || null, lg: f.lg || null, cc: f.cc || null, h: f.h, a: f.a, w: f.w};
  startMatch(f);
  MT.running = false; clearTimeout(MT.timer);
  // finishMatch, observed
  const orig = window.finishMatch, origXP = window.addXP, origChem = window.chemAdd;
  window.finishMatch = function(){
    const me = meP(), k = S.contract || {};
    const pre = {trust: S.trust, chem: S.chem, rep: me.rep, wrep: me.wrep, xp: S.xp, xpF: S.xpF || 0, level: S.level, sp: S.sp, money: S.money, composure: S.skills.composure,
      skillsBase: !!S.skillsBase, pos: S.player.pos, nat: S.player.nat, workrate: S.workrate, styleMul: styleMul(), tier: repTier(MT.f),
      compRep: (typeof COMP_REP === "object" ? COMP_REP[repTier(MT.f)] || COMP_REP.L : null), clubRep: MT.f.kind === "N" ? 3000 : W.clubs[MT.usId].rep, clubCc: W.clubs[MT.usId].cc,
      contract: {bG: k.bG || 0, bA: k.bA || 0, bApp: k.bApp || 0, bW: k.bW || 0}, crowd: MT.stad.crowd};
    // the random numbers finishMatch drew itself, directly or through util.js rnd/ri/pick/gauss (the swing, the
    // composure roll), with the match.js line; draws counts every one, the world's results around the league included
    const rolls = [], base = Math.random; let draws = 0;
    Math.random = () => { const v = base(); draws++;
      const fr = (new Error().stack || "").split("\n").slice(2, 5), i = /at (rnd|ri|pick|gauss) /.test(fr[0]) ? (/at (rnd|ri|pick|gauss) /.test(fr[1]) ? 2 : 1) : 0;
      if (/at finishMatch /.test(fr[i] || "")) rolls.push({v, via: i ? fr[0].trim().split(" ")[1] : "Math.random", line: +((fr[i].match(/match\.js[^:]*:(\d+):/) || [])[1] || 0)});
      return v; };
    // what finishMatch's own formulas gave, read at the next call it makes after each (milestones and awards that
    // follow can move reputation and trust again: those are in the totals)
    const xps = [], chems = [], at = {};
    const origLadder = window.checkLadder;
    window.addXP = x => { xps.push(x); if (!at.xp) at.xp = {rep: me.rep, wrep: me.wrep}; return origXP(x); };
    window.checkLadder = function(){ if (!at.ladder) at.ladder = {trust: S.trust}; return origLadder.apply(this, arguments); };
    window.chemAdd = d => { chems.push(d); return origChem(d); };
    let r;
    try { r = orig.apply(this, arguments); }
    finally { Math.random = base; window.addXP = origXP; window.chemAdd = origChem; window.checkLadder = origLadder; }
    const lm = S.lastMatch || {};
    out.pre = pre;
    out.out = {rating: lm.rating, res: lm.res, score: lm.score, goals: lm.goals, assists: lm.assists, motm: !!lm.motm,
      rep: {formula: at.xp ? at.xp.rep - pre.rep : null, total: me.rep - pre.rep}, wrep: {formula: at.xp ? at.xp.wrep - pre.wrep : null, total: me.wrep - pre.wrep},
      xp: xps, trust: {formula: at.ladder ? at.ladder.trust - pre.trust : null, total: S.trust - pre.trust},
      chem: {formula: chems.reduce((a, b) => a + b, 0), total: S.chem - pre.chem}, bonus: S.money - pre.money, matchFatigue: A._matchFatigue,
      composureD: S.skills.composure - pre.composure, level: S.level, xpAfter: S.xp};
    out.rolls = rolls; out.draws = draws;
    return r;
  };
  // the bot: the same calls the cards' buttons, the keys and the pointer make
  const R = () => Math.random();
  let guard = 0, moments = 0, steps = 0;
  const stopClock = () => { if (MT){ clearTimeout(MT.timer); MT.running = false; } };
  const play = () => {
    moments++;
    let last = "", same = 0, wait = .8 + R()*.6, hold = 0;
    for (let i = 0; i < 20000 && M; i++){
      const ph = M.phase;
      if (ph === "dribble" && M.t > wait){ if (R() < .45) passNow(); else shootNow(); wait = 1e9; }
      else if (ph === "decide") chooseOption(Math.floor(R()*M.opt.opts.length));
      else if (ph === "aim" && M.phaseT > .35){
        // a pass: roughly the way it is lined up; a shot: for the corner the keeper is furthest from
        if (M.throwIn) M.aim.power = .4;
        else if (passMode()){ M.aim.power = .45 + R()*.3; M.aim.ang += (R() - .5)*.06; }
        else { const b = M.ball, side = M.gk.x < 34 ? 1 : -1; M.aim.ang = Math.atan2(-b.y, 34 + side*(1.2 + R()*1.2) - b.x); M.aim.power = .75 + R()*.15; }
        releaseAim();
      }
      else if (ph === "contact"){ const g = contactGeom(); strikeAt(g.x + (R() - .5)*g.R*.25, g.y + g.R*(R()*.17 - .05)); }
      else if (ph === "jockey" && M.att){ const s = worldToScreen(M.att.x, M.att.y, BR); inp.hx = s.x; inp.hy = s.y; }
      else if (ph === "steal" && M.winT > .12 + R()*.1){ const a = worldToScreen(M.p.x, M.p.y, BR), b = worldToScreen(M.ball.x, M.ball.y, BR); challenge(a.x, a.y, b.x, b.y); }
      else if (ph === "read" && M.ball){ const s = worldToScreen(M.ball.x + M.ball.vx*.5, M.ball.y + M.ball.vy*.5, BR); inp.hx = s.x; inp.hy = s.y; }
      else if (ph === "aerial"){ if (M.phaseT < M.drop - .45) inp.down = true; else if (!M.jumped){ inp.down = false; releaseJump(); } }
      if (!M) break;
      same = M.phase === last ? same + 1 : 0; last = M.phase;
      if (same > 1800 && M.phase !== "done"){ endMoment("lost", "The move breaks down."); same = 0; }
      updateChant(DT); update(DT); recFrame(); steps++;
    }
    inp.down = false; inp.hx = inp.hy = null;
    for (let i = 0; i < 20000 && REP; i++) stepReplay(DT);
  };
  while (guard++ < 2000 && MT && !MT.ftCard){
    if (advance()) continue;
    if (MT.ftCard) break;
    const t = MT.tl[MT.ti - 1];
    if (t && t.ht) continue;                                         // half time: straight into the second half
    const e = MT.events[MT.i];
    if (e && e.kind === "moment"){ A.playMoment(); stopClock(); play(); if (MT && !MT.ftCard){ A.contMoment(); stopClock(); } continue; }
  }
  window.finishMatch = orig;
  if (!MT || !MT.ftCard) throw new Error("the match did not reach full time: " + JSON.stringify(cfg));
  const ids = xi => xi.map(p => p.id), g = list => list.map(x => ({s: x.s, a: x.a}));
  out.mt = {home: MT.home, usId: MT.usId, themId: MT.themId, role: MT.role, onPitch: MT.onPitch, subOn: MT.subOn, subOff: MT.subOff,
    cameOn: MT.cameOn || 0, subbedOff: MT.subbedOff || 0, injuredOff: !!MT.injuredOff, sentOff: !!MT.sentOff, dream: !!MT.dream,
    score: MT.score.slice(), my: Object.assign({}, MT.my), stats: JSON.parse(JSON.stringify(MT.stats)), poss: MT.poss, ourR: MT.ourR, oppR: MT.oppR,
    nerves: MT.nerves, tired: MT.tired, stad: Object.assign({}, MT.stad), chemD: MT.chemD, extras: MT.extras, minute: MT.minute, label: MT.label,
    usGoals: g(MT.usGoals), themGoals: g(MT.themGoals), highlights: MT.highlights.map(h => ({min: h.min, kind: h.kind, icon: h.icon, text: h.text})),
    events: MT.events.map(e => ({min: e.min, kind: e.kind, type: e.type || null, extra: !!e.extra, chained: !!e.chained})), usXI: ids(MT.usXI), themXI: ids(MT.themXI)};
  out.played = {moments, steps};
  return out;
}

export async function playOne(cfg){
  const {page, close} = await launch({gfx: "low", seed: cfg.seed});
  try {
    await freeze(page);
    await career(page, {pos: cfg.pos, zone: "ground", frames: 0, name: "Legacy Test"});
    const r = await page.evaluate(playInPage, cfg);
    r.errors = page.errors.slice();
    return r;
  } finally { await close(); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--check")){
  // play every match once more and compare with the golden, value for value
  const g = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  let bad = 0;
  for (let i = 0; i < MATCHES.length; i++){
    const r = await playOne(MATCHES[i]), errs = r.errors; delete r.errors;
    const same = JSON.stringify(r) === JSON.stringify(g.matches[i]);
    if (!same || errs.length) bad++;
    console.log(`seed ${MATCHES[i].seed}: ${same ? "same as the golden" : "DIFFERS from the golden"}${errs.length ? ", errors: " + errs.join("; ") : ""}`);
  }
  process.exit(bad ? 1 : 0);
}
if (isMain && !process.argv.includes("--check")){
  const runs = [];
  for (let pass = 0; pass < 2; pass++){
    const list = [];
    for (const cfg of MATCHES){
      const t0 = Date.now(), r = await playOne(cfg);
      console.log(`pass ${pass + 1} seed ${cfg.seed} ${cfg.pos} ${r.fixture.kind}: ${r.mt.role}, ${r.out.score} (${r.out.res}), rating ${r.out.rating}, rep ${r.out.rep.formula}/${r.out.rep.total}, xp ${r.out.xp.map(x => x.toFixed(1))}, trust ${r.out.trust.formula}, chem ${r.out.chem.formula.toFixed(3)}, ${r.played.moments} moments, rolls ${r.rolls.map(x => x.line + ":" + x.v.toFixed(3))} (${((Date.now() - t0)/1000).toFixed(0)} s)${r.errors.length ? "\n  errors: " + r.errors.join("\n  ") : ""}`);
      list.push(r);
    }
    runs.push(list);
  }
  const strip = l => JSON.stringify(l.map(r => { const c = Object.assign({}, r); delete c.errors; return c; }));
  const same = strip(runs[0]) === strip(runs[1]), errs = runs.flat().reduce((a, r) => a + r.errors.length, 0);
  console.log(`two passes ${same ? "identical" : "DIFFER"}; ${errs} page errors`);
  if (!same || errs) process.exit(1);
  const doc = {about: "Ten 2D-engine matches played to full time on the tree before the rework (I0, DESIGN 2.1). For each: the config, the state at kick-off, the MT counters at full time (mt), what finishMatch read (pre), what it gave (out: rating; rep, wrep, trust and chem as formula, the finishMatch formula alone, and total, after the milestones and awards that follow; xp as passed to addXP; bonus; matchFatigue) and the random numbers it drew itself (rolls: v, via which helper, and the match.js line).",
    recorder: "qa/record-legacy.mjs", matches: runs[0].map(r => { delete r.errors; return r; })};
  fs.mkdirSync(path.dirname(GOLDEN), {recursive: true});
  fs.writeFileSync(GOLDEN, JSON.stringify(doc, null, 1) + "\n");
  console.log("wrote", path.relative(ROOT, GOLDEN));
}
