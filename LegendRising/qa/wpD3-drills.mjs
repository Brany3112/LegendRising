// qa/wpD3-drills.mjs: the A1.7 training drills (DESIGN 2.7, the hook queue's "A1.7 training drills" row, deferred to
// P3; addendum A1.7 "shooting drills with corner targets and scoring, volley and header drills that raise the stats").
// Owner: WP-D3 (Stage P3a). Contracts 3.6.2 (the drills on the match simulation), 1.4.13 (cfg.mode), A1.5 (the timing
// ring of a volley), A1.7 (first-person striking).
//
// Pure checks first (trainspec.js, no browser): the corner targets are the four metre squares of the goal mouth as the
// shooter sees them, the flight's crossing point is read off the prediction, and the points and the XP quality follow
// the target. Then an input bot plays the finishing drill, the free kicks and the volley drill through control.js,
// the same input a person gives: it aims with the look at a corner and holds and lets go of the left button (the
// volley: it lets go as the timing ring closes). Each drill must decide every go with zero console or page errors:
//   - the corner targets are up in the goal while finishing and the free kicks run, and down after;
//   - every scored go is counted on the target it went through (a goal through a target is 3, any other goal 1, a save
//     in a target 1) and the drill's points are the sum; a goal in a corner gives the most XP;
//   - the volley drill's lob drops in front of you at volley height, the timing ring is offered, the volley is struck
//     before the ball lands, and the drill pays clean strike (aero) and accuracy XP;
//   - first-person screenshots of each drill: qa/out/wpD3-drill-<kind>-<n>.png.
//
//   QA_PORT=8831 node qa/wpD3-drills.mjs [shoot setpiece volley]     exits 1 on any failed check; qa/out/wpD3-drills.json
import {launch, career, freeze, snap, report, expect} from "./lib.mjs";
import * as TS from "../js/life/football/trainspec.js";

const kinds = process.argv.slice(2).filter(a => !a.startsWith("-"));
const KINDS = kinds.length ? kinds : ["shoot", "setpiece", "volley"];
const res = {checks: [], drills: [], errors: []};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.errors.push(`${name}: ${JSON.stringify(value)}`);
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

/* ---------- the pure part ---------- */
{
  const C = TS.cornerOf;
  check(C(2.0, 3.2, 1) === "tr" && C(2.0, -3.2, 1) === "tl" && C(.4, 3.2, 1) === "br" && C(.4, -3.2, 1) === "bl",
    "the four corners of the goal at +x, as the shooter facing it sees them", [C(2.0, 3.2, 1), C(2.0, -3.2, 1), C(.4, 3.2, 1), C(.4, -3.2, 1)]);
  check(C(2.0, -3.2, -1) === "tr" && C(.4, 3.2, -1) === "bl", "facing the goal at -x the sides swap", [C(2.0, -3.2, -1), C(.4, 3.2, -1)]);
  check(C(1.2, 3.2, 1) == null && C(2.0, 2.0, 1) == null && C(2.6, 3.2, 1) == null && C(2.0, 3.8, 1) == null,
    "the middle of the goal, a ball under the bar's height between the targets and anything outside the mouth score no target");
  // a flight along +x through (y 2.0, z 3.1) at the line
  const pred = new Float32Array(4*10);
  for (let k = 0; k < 10; k++){ pred[4*k] = 30 + k; pred[4*k + 1] = 2.0; pred[4*k + 2] = 3.1; pred[4*k + 3] = k/30; }
  const x = TS.crossAt(pred, 10, 1, 36);
  check(x && Math.abs(x.y - 2.0) < 1e-6 && Math.abs(x.z - 3.1) < 1e-6, "the crossing point read off the prediction", x);
  check(TS.crossAt(pred, 10, -1, 36) === null, "a flight away from a goal never crosses its line");
  const g = TS.targetScore({done: true, ok: true, why: "goal"}, "tr"), g1 = TS.targetScore({done: true, ok: true, why: "goal"}, null);
  const s1 = TS.targetScore({done: true, ok: true, why: "saved"}, "bl"), s0 = TS.targetScore({done: true, ok: true, why: "saved"}, null), w = TS.targetScore({done: true, ok: false, why: "wide"}, null);
  check(g.pts === 3 && g1.pts === 1 && s1.pts === 1 && s0.pts === 0 && w.pts === 0, "points: a corner goal 3, a goal 1, a save in a corner 1, the rest 0", [g.pts, g1.pts, s1.pts, s0.pts, w.pts]);
  check(g.q > g1.q && g1.q >= s1.q && s1.q > s0.q && s0.q > w.q, "the XP quality follows the target", [g.q, g1.q, s1.q, s0.q, w.q]);
  const ev = (o) => Object.assign({kind: "kick", agent: 1, intent: "shot", whiff: false, res: "goal", strike: .9}, o);
  const vA = TS.volleyTest([ev({})], 1, {air: true}), vB = TS.volleyTest([ev({})], 1, {air: false}), vW = TS.volleyTest([ev({res: "wide"})], 1, {air: true});
  check(vA.ok && !vB.ok && vB.why === "bounced" && !vW.ok && vA.q > vB.q, "a volley counts when it is struck before the ball lands and goes on target", [vA, vB.why, vW.why]);
  check(TS.DRILLS.volley && TS.DRILLS.volley.feed.kind === "loft" && TS.DRILLS.volley.xp.some(l => l[0] === "aero") && TS.DRILLS.shoot.targets && TS.DRILLS.setpiece.targets,
    "the volley drill is a station of its own with its XP; finishing and the free kicks are scored on the targets");
  const vs = TS.DRILLS.volley.spot, hs = TS.DRILLS.head.spot;
  check(Math.hypot(vs.x - hs.x, vs.z - hs.z) < 12 && TS.DRILLS.volley.dir === TS.DRILLS.head.dir, "the volley station is beside the heading one, at the same goal", {volley: vs, head: hs});
}

/* ---------- the drills played ---------- */
const {page, close} = await launch({gfx: "low", seed: 11});
try {
  await career(page, {zone: "ground", min: 11*60, pos: "ST"});
  await freeze(page);
  // a sharp finisher (the corners are a small target: a bot with a youth player's finishing would mostly miss them)
  await page.evaluate(() => { for (const k of ["accuracy", "power", "curve", "aero", "composure", "dribbling"]) if (k in S.skills) S.skills[k] = Math.max(S.skills[k], 92); });
  // the bot: one call a fixed step (window.__d3bot), the aim at a corner of the goal, the left button held and let go
  await page.evaluate(() => {
    window.__d3bot = kind => {
      const L = window.__life, TR = window.__train, T = TR.T;
      if (!T) return null;
      const ms = T.ms, me = T.me, b = ms.ball.p, inp = TR.input, C = TR.CTRL;
      const B = T.bot || (T.bot = {t: 0, lmb: 0, go: -1, n: 0, ringSeen: 0, winds: 0, snap: null, aims: 0});
      B.t += 1/60;
      const yawTo = (x, z) => Math.atan2(-(x - me.m.x), -(z - me.m.z));
      const end = ms.dirs[me.team], gx = end*ms.spec.hx;
      // the corner aimed at this go: top right, bottom left, top left, bottom right, then the middle (as the shooter sees it)
      const CN = [["t", 1], ["b", -1], ["t", -1], ["b", 1], ["m", 0]][B.aims % 5];
      const ty = CN[0] === "t" ? 2.0 : CN[0] === "b" ? .45 : 1.2, tz = CN[1]*3.0*end;
      const aimAt = () => { L.P.yaw = yawTo(gx, tz); const d = Math.hypot(gx - me.m.x, tz - me.m.z), eye = (me.y || 0) + 1.68*(me.scale || 1); L.P.pitch = Math.atan2(ty - eye, d); };
      const near = Math.hypot(b.x - me.m.x, b.z - me.m.z);
      const key = (k, on) => { if (!!C.held[k] !== on) inp({type: on ? "keydown" : "keyup", key: k}); };
      if (kind === "shoot" || kind === "setpiece"){
        const taker = ms.restart && ms.restart.taker === me.id;
        if (kind === "setpiece" && taker && near > 1.2){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = -.3; key("w", true); return null; }
        // the ball yours but a stride away (the first touch took it on): step up to it first
        if (kind === "shoot" && ms.poss.ctl === me.id && near > .75 && !B.lmb){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = -.4; key("w", true); return null; }
        key("w", false);
        // (a wind-up the ball has run away from is let go at its time all the same: a first-time strike when it is back)
        if (B.lmb && B.t - B.lmb > .42 && !(ms.poss.ctl === me.id || (taker && near < 1.4))){ inp({type: "up", button: 0}); B.lmb = 0; B.aims++; }
        if (ms.poss.ctl === me.id || (taker && near < 1.4)){
          aimAt();
          if (!B.lmb && (taker || Math.hypot(ms.ball.v.x, ms.ball.v.z) < 2.5)){ inp({type: "down", button: 0}); B.lmb = B.t; B.winds++; }
          else if (B.t - B.lmb > .42){ inp({type: "up", button: 0}); B.lmb = 0; B.aims++; }
          else if (B.t - B.lmb > .3 && !B.snapped){ B.snapped = true; return "windup"; }
        } else if (near < 8 && ms.ball.state === "free" && Math.hypot(ms.ball.v.x, ms.ball.v.z) > .5){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = -.35; B.snapped = false; }
        return null;
      }
      if (kind === "volley"){
        const R = C.ring;
        if (ms.ball.state === "free" && b.y > .3 && near < 14 && !R){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = Math.atan2(b.y - 1.68, Math.max(.5, near)); }
        if (R){
          B.ringSeen++;
          // eyes on the ball as it drops, then on the corner of the goal well before the release (a turn of the look
          // in the last few steps would be a gesture: a curl)
          if (R.tc > .44){ L.P.yaw = yawTo(b.x, b.z); L.P.pitch = Math.atan2(b.y - 1.68, Math.max(.5, near)); }
          else aimAt();
          if (!B.lmb && R.tc < .62){ inp({type: "down", button: 0}); B.lmb = B.t; B.winds++; }
          if (B.lmb && R.tc <= .2 + 1/120){ inp({type: "up", button: 0}); B.lmb = 0; B.aims++; }
          if (B.lmb && !B.snapped && R.tc < .56){ B.snapped = true; return "volley"; }
        } else if (B.lmb && B.t - B.lmb > 1.2){ inp({type: "up", button: 0}); B.lmb = 0; }
        if (!R && ms.ball.state !== "free") B.snapped = false;
        return null;
      }
      return null;
    };
  });
  for (const kind of KINDS){
    const r = await page.evaluate(async kind => {
      const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS[kind];
      const w = {x: D.spot.x, z: D.spot.z - 28};
      L.place({x: w.x, z: w.z, y: 0, yaw: D.dir > 0 ? -Math.PI/2 : Math.PI/2});
      L.stepN(20);
      const sp = L.spots.find(s => s.label === D.label);
      if (!sp) return {kind, error: "no spot " + D.label};
      L.use(sp);
      for (let i = 0; i < 400 && !(window.__train && window.__train.RUN.cur); i++) await new Promise(r => setTimeout(r, 25));
      if (!window.__train || !window.__train.RUN.cur) return {kind, error: "the drill did not start"};
      const G = (await import("./js/life/ground.js")).GROUND;
      const tg = G.targets && G.targets[D.dir];
      return {kind, started: true, targets: tg ? tg.visible : null};
    }, kind);
    if (r.error){ check(false, `${kind}: starts`, r.error); continue; }
    if (TS.DRILLS[kind].targets) check(r.targets === true, `${kind}: the corner targets are up in the goal`, r.targets);
    let done = null, shots = 0, snaps = new Set();
    for (let s = 0; s < 100*60/20 && !done; s++){
      const o = await page.evaluate(kind => {
        const L = window.__life, R = window.__train.RUN;
        let snapAt = null;
        for (let i = 0; i < 20; i++){
          if (!R.cur) return {over: true, last: R.last};
          const want = window.__d3bot(kind);
          L.stepN(1);
          // (from the second go on: the life HUD of the moment the drill began is still on the page through the first)
          if (want && window.__train.T && window.__train.T.results.length){ snapAt = want; break; }
        }
        if (!R.cur) return {over: true, last: R.last};
        const T = window.__train.T;
        return {snapAt, ring: T && T.bot ? T.bot.ringSeen : 0, winds: T && T.bot ? T.bot.winds : 0};
      }, kind);
      if (o.over){ done = o; break; }
      if (o.snapAt && shots < 3 && !snaps.has(o.snapAt + shots)){
        snaps.add(o.snapAt + shots);
        const st = await page.evaluate(() => ({mode: window.__life.modes.mode(), view: document.body.classList.contains("drillview"), T: !!window.__train.T}));
        if (process.env.D3DBG) console.log("snap", o.snapAt, JSON.stringify(st));
        // (two real frames of the browser, none of the game's: the page's HUD is painted as it is now)
        await page.evaluate(() => new Promise(r => { void document.body.offsetHeight; window.__qa.realRAF(() => window.__qa.realRAF(() => r())); }));
        await snap(page, `wpD3-drill-${kind}-${shots}`); shots++;
      }
    }
    const fin = done || await page.evaluate(() => { const R = window.__train.RUN; if (R.cur && R.cur.quit) R.cur.quit(); window.__life.stepN(10); return {over: true, last: R.last, quit: true}; });
    const last = fin.last || {};
    const after = await page.evaluate(async kind => {
      const D = (await import("./js/life/football/trainspec.js")).DRILLS[kind], G = (await import("./js/life/ground.js")).GROUND;
      const tg = G.targets && G.targets[D.dir];
      return {targets: tg ? tg.visible : null};
    }, kind);
    const row = {kind, done: last.done || 0, pts: last.pts, xp: last.xp || 0, results: last.results || [], quit: !!fin.quit, errors: page.errors.length};
    res.drills.push(row);
    console.log(`${kind}: ${row.done} goes ${JSON.stringify(row.results)} pts ${row.pts} xp ${Math.round(row.xp)}`);
    check(row.done === TS.DRILLS[kind].reps && !row.quit, `${kind}: every go is decided and the drill ends by itself`, {done: row.done, quit: row.quit});
    check(row.xp > 0, `${kind}: the drill pays its XP`, row.xp);
    if (TS.DRILLS[kind].targets){
      const sum = row.results.reduce((a, v) => a + (v.pts || 0), 0);
      const ok = row.results.every(v => v.why === "goal" ? v.pts === (v.corner ? 3 : 1) : v.why === "saved" ? v.pts === (v.corner ? 1 : 0) : v.pts === 0);
      check(ok && sum === row.pts, `${kind}: every go is scored on its target and the points add up`, {pts: row.pts, sum});
      check(row.results.some(v => v.corner), `${kind}: the bot's aimed shots go through the targets`, row.results.map(v => v.corner || v.why));
      check(after.targets === false, `${kind}: the targets come down after the drill`, after.targets);
    }
    if (kind === "volley"){
      check(row.results.filter(v => v.air).length >= 3, "volley: the lob is met in the air (struck before it lands)", row.results.map(v => v.air));
      check(row.results.some(v => v.ok), "volley: a volley on target", row.results.map(v => v.why));
    }
    await page.evaluate(() => window.__life.stepN(120));
  }
  check(page.errors.length === 0, "no console or page errors", page.errors.slice(0, 5));
} catch(e){ res.errors.push("wpD3-drills: " + (e && e.stack || e)); console.log(e); }
finally {
  report("wpD3-drills", res);
  await close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpD3-drills: pass");
