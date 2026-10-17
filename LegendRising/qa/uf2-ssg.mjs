// qa/uf2-ssg.mjs: the small-sided game played for real (browser, real input). Owner: UF2-B (user fix round 2).
// Contract: USER-ISSUES.md Round 2 U13 (a small scoreboard always visible: the sides by name and colour, the score, the
// time left), U14 (each side attacks its own opponent's goal: no AI shoots at its own goal), U15 (the two sides in
// clearly different kits, the same all game, your own side obvious) and U16 (after a goal a short kick-off from the
// conceding side, everyone moving back, nobody frozen, under about 6 s of dead time); TRAINING-SPEC 2 (HUD minimal).
//
// A career at the training ground in the session's hours plays career Lesson 6 (the first day's four against four,
// started at that lesson: training.js startFirstTraining from 5), then the daily session's small-sided block (its
// third block: startSession from 2), then Lesson 6 again (a later minute, so another seed). Each is played by a bot at
// the keys: page.keyboard (W toward the ball or the goal, Shift to close a loose ball down) and page.mouse (the left
// button held and let go to shoot near goal, the right button to pass when a man is on it), with the pointer locked by
// a real click on the view. Aim is a write to P.yaw and P.pitch, which is what a mouse move does (world.js look()), as
// in qa/tr2-realmatch.mjs. The world is stepped by hand (__life.stepN) with real frames drawn for the screenshots.
// Checked in every game:
//   - the scoreboard is up from the start to the end, on screen and not covered (by the need bars, the money or the drill
//     card), and shows "You" and "Bibs", the simulation's score for each side and the time left (within a second); a
//     goal's card comes down clear of the drill card; no team-mate runs into you as he takes his place (before the ball is
//     played);
//   - the kits: your side's shirts are the club's, the other side's are the bibs, the two at least KIT_SUM_MIN apart
//     (CIEDE2000), a keeper in each goal, each keeper clear of both; and every body wears the same shirt from the first
//     second to the last,
//     through every goal and kick-off;
//   - every shot by an AI player is aimed at the end his side attacks, and every goal went into the end its scorers
//     attack (an own goal is reported, not failed: the ball can go in off anyone);
//   - at least one goal is scored or conceded in the three games, and after every goal: a kick-off from the centre spot
//     by the side that conceded, taken within SSG.DEAD_MAX s, with no AI outfield man frozen meanwhile;
//   - no console or page errors.
// Screenshots in qa/out/uf2-ssg/: each game's start (the scoreboard and the two sides), a moment after a goal, and the
// bibs up close.
//
//   QA_PORT=8901 node qa/uf2-ssg.mjs [--games 3] [--only i] [--w 390 --h 844]     exits 1 on any failed check (--only
//   plays just game i of the list; screenshots of another size than 1280x720 are named with it)
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
import {lockPointer, pointerLocked} from "./trlib.mjs";
import {checker} from "./wpF-lib.mjs";
import {deltaE, KIT_SUM_MIN, GK_MIN} from "../js/life/football/kitclash.js";
import {SSG} from "../js/life/football/trainspec.js";

const OUTDIR = path.join(OUT, "uf2-ssg");
fs.mkdirSync(OUTDIR, {recursive: true});
const {check, done, res} = checker("uf2-ssg");
const argv = process.argv.slice(2), gi = argv.indexOf("--games"), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : d; };
const VW = arg("--w", 1280), VH = arg("--h", 720), SIZE = `${VW}x${VH}`;
const GAMES = [{kind: "lesson", name: "Lesson 6"}, {kind: "session", name: "session small-sided block"}, {kind: "lesson", name: "Lesson 6 again"}].slice(0, gi >= 0 ? +argv[gi + 1] : 3).filter((g, i) => argv.indexOf("--only") < 0 || i === arg("--only", 0));
const hex = c => typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c).toLowerCase();
const STEP = 12;

const {page, close, errors} = await launch({gfx: "low", seed: 11, w: VW, h: VH});
const shot = async name => {
  await page.evaluate(() => { const L = window.__life; if (L && L.renderer() && L.LIFE.running) L.renderer().render(L.scene(), L.cam); });
  await page.screenshot({path: path.join(OUTDIR, (SIZE === "1280x720" ? "" : SIZE + "-") + name + ".png"), timeout: 180000});
};
// what the bot does at the keys: the keys it holds now, the buttons
const held = new Set();
const key = async (k, down) => { if (down && !held.has(k)){ held.add(k); await page.keyboard.down(k); } else if (!down && held.has(k)){ held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
let lmb = 0, lmbN = 0;

/* in the page: the watcher (window.__uf2w) that measures what the checks need every slice, and the bot's view of the
   play. Returns {state, ...} */
const WATCH = () => {
  const TR = window.__train, L = window.__life, W = window.__uf2w;
  const run = TR && TR.RUN.cur, T = TR && TR.T;
  if (!run && !T) return {state: "over"};
  if (!T){
    // the walk over: we are where we would have walked to (the middle of the pitch), the squad jogs over
    if (run.state === "walk"){
      const GP = TR.TS.GP, w = {x: GP.cx - 6, z: GP.cz + 2};
      if (Math.hypot(L.P.x - w.x, L.P.z - w.z) > 1.5) L.place({x: w.x, z: w.z, y: 0, yaw: -Math.PI/2});
    }
    return {state: "walk", item: run.item && run.item.kind};
  }
  const ms = T.ms, me = T.me, V = T.V;
  if (!W.T || W.T !== T){
    // a new game: what everyone wears now
    W.T = T; W.shirts = {}; W.board = []; W.shots = []; W.goals = []; W.kos = []; W.frozen = []; W.ev = 0; W.watch = null; W.kitsSeen = 0; W.koSeen = 0; W.lookChanges = [];
  }
  const shirtOf = a => { const R = V && V.rec[a.id]; return R && R.h && R.h.look && R.h.look.outfit ? String(R.h.look.outfit.shirt).toLowerCase() : null; };
  const kits = T.kits;
  // the kits, read from the bodies drawn
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== "player" || a.isMe) continue;
    const s = shirtOf(a); if (!s) continue;
    if (W.shirts[a.id] == null) W.shirts[a.id] = {s, team: a.team, gk: !!a.isGK};
    else if (W.shirts[a.id].s !== s) W.lookChanges.push({id: a.id, was: W.shirts[a.id].s, now: s, t: ms.t});
  }
  // the scoreboard against the simulation
  const B = TR.ssgState(), left = T.board && T.board.real != null ? T.board.real - T.t : null;
  const el = document.getElementById("ssgBoard"), r = el && el.getBoundingClientRect();
  const cs = el && getComputedStyle(el);
  // what could cover it: the life HUD's money and need bars (top right) and the drill card; and a goal's card against
  // the drill card (each only while it is shown)
  const shownRect = q => { const n = document.querySelector(q); if (!n) return null; const c = getComputedStyle(n); if (c.display === "none" || c.visibility === "hidden" || +c.opacity < .2) return null; const x = n.getBoundingClientRect(); return x.width > 2 && x.height > 2 ? x : null; };
  const hit = (a, b) => !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const covers = [["needs", "#lifeRoot .hud-needs"], ["money", "#lifeRoot .hud-money"], ["drill card", "#lifeDrill.on .dr-card"]].filter(([, q]) => hit(r, shownRect(q))).map(([n]) => n);
  const card = [...document.querySelectorAll("#fpHud .fp-cards .fp-card.in")].map(n => n.getBoundingClientRect()).find(x => x.height > 2);
  const drc = shownRect("#lifeDrill.on .dr-card");
  W.board.push({t: Math.round(T.t*10)/10, shown: !!B.shown, score: B.score, want: [ms.score[T.myTeam], ms.score[1 - T.myTeam]], time: B.time, left: left == null ? null : Math.max(0, Math.ceil(left)),
    names: [B.mine, B.theirs], inView: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 40,
    vis: !!cs && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > .5, covers,
    cardOver: card && drc && hit(card, drc) ? {card: [Math.round(card.top), Math.round(card.bottom)], drill: [Math.round(drc.top), Math.round(drc.bottom)]} : null});
  // the nearest team-mate to you while the squad takes its places, before anybody has played the ball (he jogs to his
  // place: never into you). (Once the ball is in play, two of a side closing down the same man is football)
  if (T.t < 5 && !(ms.ball.last && ms.ball.last.agent >= 0)){
    let dm = Infinity, who = null;
    for (const o of ms.agents) if (o.onPitch && o.team === me.team && o !== me && o.role === "player"){ const d = Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z); if (d < dm){ dm = d; who = o; } }
    if (W.nearMate == null || dm < W.nearMate){
      W.nearMate = dm;
      const r1 = v => Math.round(v*100)/100;
      W.nearAt = who ? {t: r1(T.t), slot: who.slot, gk: !!who.isGK, him: [r1(who.m.x), r1(who.m.z)], speed: r1(who.m.speed), me: [r1(me.m.x), r1(me.m.z)], ball: [r1(ms.ball.p.x), r1(ms.ball.p.z)], ctl: ms.poss.ctl, restart: ms.restart ? ms.restart.kind : null,
        plan: who.plan ? who.plan.kind : null, act: who.act ? who.act.kind : null, last: ms.ball.last ? {agent: ms.ball.last.agent, kind: ms.ball.last.kind, t: r1(ms.ball.last.t)} : null,
        pass: ms.chain && ms.chain.pass ? {recv: ms.chain.pass.recv, res: ms.chain.pass.res || null} : null, bstate: ms.ball.state} : null;
    }
  }
  // the events: shots, goals, kick-offs
  for (; W.ev < ms.events.length; W.ev++){
    const e = ms.events[W.ev];
    if (e.kind === "kick" && e.agent >= 0 && !(ms.agents[e.agent] || {}).isMe && (e.intent === "shot" || e.intent === "header" && e.atGoal)){
      W.shots.push({t: Math.round(e.t*10)/10, team: e.team, intent: e.intent, tx: e.tx, att: ms.dirs[e.team], ok: e.tx == null ? null : Math.sign(e.tx) === ms.dirs[e.team]});
    }
    if (e.kind === "goal" && !e.disallowed) W.goals.push({t: Math.round(e.t*100)/100, team: e.team, end: Math.sign(e.x), att: ms.dirs[e.team], ownGoal: !!e.ownGoal, mine: e.team === T.myTeam});
    if (e.kind === "restart" && e.rk === "kickoff") W.kos.push({t: Math.round(e.t*100)/100, team: e.team, x: Math.round(e.x*100)/100, z: Math.round(e.z*100)/100, taker: e.taker, me: e.taker === me.id});
  }
  // nobody frozen while a kick-off is set up: how far each AI outfield man goes from the goal to the kick
  const k = T.ko;
  if (k && !k.done){
    if (!W.watch || W.watch.t0 !== k.t0) W.watch = {t0: k.t0, m: new Map(ms.agents.filter(a => a.onPitch && a.role === "player" && !a.isGK && !a.isMe).map(a => [a.id, {d: 0, x: a.m.x, z: a.m.z}]))};
    for (const [id, w] of W.watch.m){ const a = ms.agents[id]; w.d += Math.hypot(a.m.x - w.x, a.m.z - w.z); w.x = a.m.x; w.z = a.m.z; if (a.set) w.set = {x: a.set.x, z: a.set.z}; }
  } else if (W.watch){
    for (const [id, w] of W.watch.m){ const a = ms.agents[id]; const near = w.set ? Math.hypot(a.m.x - w.set.x, a.m.z - w.set.z) < 2.5 : false; if (w.d < 1 && !near) W.frozen.push({goal: W.watch.t0, id, team: a.team, moved: w.d}); }
    W.watch = null;
  }
  // the bot's view: where to look and what to do
  const b = ms.ball.p, have = ms.poss.ctl === me.id, gx = ms.dirs[me.team]*ms.spec.hx;
  const yawTo = (x, z) => Math.atan2(-(x - me.m.x), -(z - me.m.z));
  const near = Math.hypot(b.x - me.m.x, b.z - me.m.z), dGoal = Math.hypot(gx - me.m.x, me.m.z);
  let act = "idle";
  const live = ms.phase === "live" && !T.feed;
  if (have && dGoal < 20){ L.P.yaw = yawTo(gx, 0); L.P.pitch = .04; act = "shoot"; }
  else if (have){
    let press = false; for (const o of ms.agents) if (o.team !== me.team && o.onPitch && !o.isGK && Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z) < 3) press = true;
    if (press){
      const mates = ms.agents.filter(o => o.team === me.team && o !== me && o.onPitch && !o.isGK).sort((p, q) => ms.dirs[me.team]*(q.m.x - p.m.x));
      const to = mates[0];
      if (to){ L.P.yaw = yawTo(to.m.x, to.m.z); L.P.pitch = -.15; act = "pass"; }
      else { L.P.yaw = yawTo(gx, 0); act = "dribble"; }
    } else { L.P.yaw = yawTo(gx, 0); L.P.pitch = -.1; act = "dribble"; }
  } else if (live && (ms.ball.state === "free" || ms.poss.ctl >= 0)){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = -.15; act = near > 8 ? "sprint" : "chase"; }
  return {state: "play", t: T.t, act, item: T.item.kind, score: ms.score.slice(), myTeam: T.myTeam, phase: ms.phase, kos: (T.koLog || []).length};
};

// a game, from its start to the board coming down
async function playGame(g, gIdx){
  const out = {name: g.name};
  await page.evaluate(async ({kind}) => {
    const A = await import("./js/life/core/acts.js");
    const T = await A.training();
    window.__uf2w = {};
    window.__uf2done = null;
    if (kind === "lesson") T.startFirstTraining(A.TRAIN_HOST, {from: 5}).then(ok => { window.__uf2done = ok; });
    else T.startSession(A.TRAIN_HOST, {from: 2});
  }, {kind: g.kind});
  let started = false, shotStart = false, shotGoal = false, shotBibs = false, guard = 0, lastKos = 0, sawSsg = false;
  for (;;){
    if (++guard > 4000){ out.timeout = true; break; }
    const v = await page.evaluate(WATCH);
    if (v.state === "over") break;
    if (v.state === "walk"){
      // a session's next block (finishing) is not this test's: once the small-sided game is over, step out of it
      if (sawSsg && v.item !== "ssg"){ await page.evaluate(() => { const r = window.__train.RUN.cur; if (r && r.quit) r.quit(); }); continue; }
      await page.evaluate(() => window.__life.stepN(30));
      continue;
    }
    if (v.item !== "ssg"){ await page.evaluate(() => window.__life.stepN(30)); continue; }
    sawSsg = true;
    if (!started){
      started = true;
      // the pointer held by a real click on the view, as a player does (the lessons pause without it, the session ends)
      out.lock = await pointerLocked(page) || await lockPointer(page);
    }
    // the bot at the keys
    const a = v.act;
    await key("w", a === "chase" || a === "sprint" || a === "dribble");
    await key("Shift", a === "sprint");
    if (a === "shoot"){
      if (!lmb){ await page.mouse.down({button: "left"}); lmb = 1; lmbN = 0; }
      else if (++lmbN >= 2){ await page.mouse.up({button: "left"}); lmb = 0; }
    } else if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
    if (a === "pass"){ await page.mouse.down({button: "right"}); await page.mouse.up({button: "right"}); }
    // the pictures
    if (!shotStart && v.t > 2.5){ shotStart = true; await shot(`${gIdx}-${g.kind}-start`); }
    if (!shotGoal && v.kos > lastKos){ await page.evaluate(n => window.__life.stepN(n), 40); shotGoal = true; await shot(`${gIdx}-${g.kind}-after-goal`); }
    lastKos = v.kos;
    if (!shotBibs && v.t > 20){
      shotBibs = true;
      await page.evaluate(() => {
        const T = window.__train.T, ms = T.ms, me = T.me, L = window.__life;
        const o = ms.agents.filter(a => a.team !== me.team && a.onPitch && !a.isGK).sort((p, q) => Math.hypot(p.m.x - me.m.x, p.m.z - me.m.z) - Math.hypot(q.m.x - me.m.x, q.m.z - me.m.z))[0];
        if (o){ L.P.yaw = Math.atan2(-(o.m.x - me.m.x), -(o.m.z - me.m.z)); L.P.pitch = -.05; }
      });
      await page.evaluate(() => window.__life.stepN(2));
      await shot(`${gIdx}-${g.kind}-bibs`);
    }
    await page.evaluate(n => window.__life.stepN(n), STEP);
  }
  await releaseAll(); if (lmb){ await page.mouse.up({button: "left"}); lmb = 0; }
  const W = await page.evaluate(() => {
    const W = window.__uf2w, T = W.T;
    return {board: W.board, nearMate: W.nearMate, nearAt: W.nearAt, shots: W.shots, goals: W.goals, kos: W.kos, frozen: W.frozen, lookChanges: W.lookChanges, shirts: W.shirts,
      kits: T ? T.kits : null, myTeam: T ? T.myTeam : 0, koLog: T ? T.koLog || [] : [], end: T ? T.ssgEnd || null : null, real: T && T.board ? T.board.real : null, tEnd: T ? T.t : 0};
  });
  return Object.assign(out, W);
}

const games = [];
try {
  await career(page, {zone: "ground", min: 10*60 + 40, pos: "ST"});
  await freeze(page);
  await page.evaluate(() => window.__life.stepN(30));
  for (let i = 0; i < GAMES.length; i++){
    const g = await playGame(GAMES[i], i);
    games.push(g);
    const N = g.name, sum = {lock: g.lock, timeout: !!g.timeout, goals: g.goals.length, shots: g.shots.length, kos: g.koLog, end: g.end, samples: g.board.length};
    console.log(N, JSON.stringify(sum));
    res[N] = sum;
    // the scoreboard
    const B = g.board;
    check(B.length > 100 && B.every(s => s.shown && s.inView && s.vis), `${N}: the scoreboard is up and on screen all game`, {samples: B.length, off: B.filter(s => !(s.shown && s.inView && s.vis)).slice(0, 3)});
    const covered = B.filter(s => s.covers && s.covers.length);
    check(!covered.length, `${N}: nothing of the HUD covers the scoreboard (the need bars, the money, the drill card) at ${SIZE}`, covered.slice(0, 3).map(s => ({t: s.t, by: s.covers})));
    const cardOver = B.filter(s => s.cardOver);
    check(!cardOver.length, `${N}: a goal's card comes down clear of the drill card at ${SIZE}`, cardOver.slice(0, 3).map(s => Object.assign({t: s.t}, s.cardOver)));
    check(g.nearMate == null || g.nearMate > 1.2, `${N}: no team-mate runs into you as the squad takes its places (nearest ${g.nearMate == null ? "none" : g.nearMate.toFixed(2)} m)`, {d: g.nearMate, at: g.nearAt});
    check(B.every(s => s.names[0] === "You" && s.names[1] === "Bibs"), `${N}: it names the sides: You and Bibs`, B[0] && B[0].names);
    const badScore = B.filter(s => s.score[0] !== s.want[0] || s.score[1] !== s.want[1]);
    check(!badScore.length, `${N}: its score is the simulation's, yours first`, badScore.slice(0, 3));
    const toSec = s => { const m = /^(\d+):(\d\d)$/.exec(s || ""); return m ? 60*+m[1] + +m[2] : null; };
    const badTime = B.filter(s => s.left != null && (toSec(s.time) == null || Math.abs(toSec(s.time) - s.left) > 1));
    check(!badTime.length && B.some(s => s.left >= (g.real || 120) - 3) && B.some(s => s.left <= 5), `${N}: it counts the time left down (m:ss) from the start to the end`, {bad: badTime.slice(0, 3), first: B[0] && B[0].time, last: B[B.length - 1] && B[B.length - 1].time});
    // the kits
    const K = g.kits, mine = g.myTeam === 0 ? K.home : K.away, theirs = g.myTeam === 0 ? K.away : K.home;
    const sh = Object.values(g.shirts), mates = sh.filter(s => s.team === g.myTeam && !s.gk), opps = sh.filter(s => s.team !== g.myTeam && !s.gk), gks = sh.filter(s => s.gk);
    check(mates.length >= 2 && mates.every(s => hex(s.s) === hex(mine[0])), `${N}: your team-mates wear the club's shirt`, {club: mine[0], mates: mates.map(s => s.s)});
    check(opps.length >= 3 && opps.every(s => hex(s.s) === hex(theirs[0])), `${N}: the other side all wear the bibs`, {bib: theirs[0], opps: opps.map(s => s.s)});
    check(gks.length === 2 && gks.some(s => s.team === g.myTeam) && gks.some(s => s.team !== g.myTeam), `${N}: both goals have a keeper (four a side, keepers in)`, gks.map(s => ({team: s.team, s: s.s})));
    const d = deltaE(mine[0], theirs[0]);
    check(d >= KIT_SUM_MIN, `${N}: the two sides' colours are clearly apart (CIEDE2000 ${Math.round(d)} >= ${KIT_SUM_MIN})`, {mine: mine[0], theirs: theirs[0]});
    check(gks.every(s => deltaE(s.s, mine[0]) >= GK_MIN && deltaE(s.s, theirs[0]) >= GK_MIN), `${N}: the keeper stands out from both sides`, gks.map(s => s.s));
    check(!g.lookChanges.length, `${N}: nobody changes kit all game (through every goal and kick-off)`, g.lookChanges.slice(0, 3));
    // the AI's goal
    const wrong = g.shots.filter(s => s.ok === false);
    check(!wrong.length, `${N}: every AI shot is aimed at the end its side attacks`, {shots: g.shots.length, wrong});
    const wrongGoal = g.goals.filter(q => q.end !== q.att);
    check(!wrongGoal.length, `${N}: every goal went in at the end its scorers attack`, {goals: g.goals, ownGoals: g.goals.filter(q => q.ownGoal).length});
    // the restart after each goal
    const due = g.koLog.filter(k => k.takenAt != null || k.goalAt < (g.real || 120) - SSG.DEAD_MAX);
    const slow = due.filter(k => k.takenAt == null || k.takenAt - k.goalAt > SSG.DEAD_MAX);
    check(!slow.length, `${N}: every kick-off after a goal is taken within ${SSG.DEAD_MAX} s`, {kos: g.koLog.map(k => ({team: k.team, dead: k.takenAt != null ? Math.round((k.takenAt - k.goalAt)*100)/100 : null}))});
    const koOk = g.kos.every(k => Math.abs(k.x) < .6 && Math.abs(k.z) < .6 && !k.me) && g.kos.length === due.filter(k => k.takenAt != null).length;
    const concedes = due.filter(k => k.takenAt != null).every((k, i) => { const goal = g.goals.find(q => Math.abs(q.t - k.goalAt) < .05); return goal && k.team === 1 - goal.team; });
    check(koOk && concedes, `${N}: each is a kick-off from the centre spot by the side that conceded, by an AI man`, {kos: g.kos, goals: g.goals.map(q => ({t: q.t, team: q.team}))});
    check(!g.frozen.length, `${N}: nobody stands frozen while it is set up`, g.frozen.slice(0, 4));
    check(!!g.end && /^(Won|Lost|Drew) \d+-\d+$/.test(g.end.line), `${N}: the game ends with the score on the result card`, g.end);
  }
  const goals = games.reduce((n, g) => n + g.goals.length, 0);
  check(goals >= 1, "goals were scored or conceded in the games played, so the restart after a goal was seen", goals);
  check(!errors.length, "no console or page errors", errors.slice(0, 5));
} catch(e){
  console.error(e);
  check(false, "the run finished", String(e && e.stack || e));
} finally {
  await close();
}
process.exit(done() ? 0 : 1);
