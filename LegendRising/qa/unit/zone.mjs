// qa/unit/zone.mjs: js/life/football/zone.js under plain node (with the real mover, ball prediction and simulation).
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN P2b-A acceptance "qa/unit/zone.mjs";
// formulas TRAINING-SPEC section 3 (control zone and touch, first to the ball).
//
//   node qa/unit/zone.mjs      exits 1 on any failed check; writes qa/out/unit-zone.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ratings, fSpeed, fHeight, fAngle, fFatigue, radius, R as zoneR, part, q, touchDist, arrivals, arrivalOf, canPlay} from "../../js/life/football/zone.js";
import {TUNE} from "../../js/life/football/tune.js";
import {createMatch, simStep} from "../../js/life/football/sim.js";
import {attrsForAI} from "../../js/life/football/attrs.js";
import {makePitch} from "../../js/life/football/pitchspec.js";
import {refreshPred, touchCheck} from "../../js/life/football/actions.js";
import {BALL} from "../../js/life/football/ball.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-zone", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r4 = v => Math.round(v*1e4)/1e4;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = BALL.R;

/* ---------- c and vc ---------- */
// an example player: ctrl 70, agility 60, composure 55, balance 50 (given), so c = (38.5 + 12 + 8.25 + 5)/99
const at = {ctrl: 70, agility: 60, composure: 55, balance: 50, strength: 60, tackling: 40, defAware: 45};
const rt = ratings(at);
const c = (0.55*70 + 0.20*60 + 0.15*55 + 0.10*50)/99;
check(near(rt.c, c, 1e-12) && near(rt.vc, 8 + 10*c, 1e-12), "c = (0.55 BallControl + 0.20 Agility + 0.15 Composure + 0.10 Balance)/99, vc = 8 + 10 c", {c: r4(rt.c), vc: r4(rt.vc)});

/* ---------- the factors ---------- */
check(fSpeed(10, 14) === 1 && near(fSpeed(22, 14), 1/(1 + 8/8)) && near(fSpeed(18, 14), 1/1.5), "fSpeed = 1/(1 + max(0, v - vc)/8)", [fSpeed(10, 14), r4(fSpeed(18, 14)), r4(fSpeed(22, 14))]);
check(fHeight(0.11) === 1 && fHeight(0.4) === 1 && near(fHeight(1.4), 0.6) && near(fHeight(0.9), 0.8) && fHeight(1.45) === 0, "fHeight: 1 below 0.4 m, easing to 0.6 at 1.4 m, a header above", [fHeight(0.11), r4(fHeight(0.9)), r4(fHeight(1.4)), fHeight(1.45)]);
check(fHeight(1.5, 1.1) > 0 && fHeight(0.42, 1.1) === 1, "fHeight scales with the body's height");
check(near(fAngle(1), 1.0) && near(fAngle(0), 0.7) && near(fAngle(-1), 0.4) && near(fAngle(-0.5), 0.55), "fAngle = max(0.4, 0.7 + 0.3 cos(angle to facing))", [fAngle(1), fAngle(0), r4(fAngle(-0.5)), fAngle(-1)]);
check(near(fFatigue(1), 1) && near(fFatigue(0), 0.85) && near(fFatigue(0.5), 0.925), "fFatigue = 0.85 + 0.15 breath");
const Rw = 0.9*(0.6 + 0.8*c);
check(near(radius(c, 10, rt.vc, R, 1, 1, 1), Rw, 1e-12) && near(radius(c, 22, rt.vc, 0.9, 1, -1, 0), Rw*fSpeed(22, rt.vc)*0.8*0.4*0.85, 1e-12),
  "R = 0.9 (0.6 + 0.8 c) fSpeed fHeight fAngle fFatigue", {front: r4(Rw), behindFastHighTired: r4(radius(c, 22, rt.vc, 0.9, 1, -1, 0))});
// on an agent: facing -X (yaw pi/2), a ball 0.5 m ahead and 0.5 m behind
const ag = {m: {x: 0, z: 0, yaw: Math.PI/2, vx: 0, vz: 0}, at, scale: 1, y: 0, fac: {bF: 1}};
const Rahead = zoneR(ag, {p: {x: -0.5, y: R, z: 0}, v: {x: 0, y: 0, z: 0}}), Rbehind = zoneR(ag, {p: {x: 0.5, y: R, z: 0}, v: {x: 0, y: 0, z: 0}});
check(near(Rahead, Rw, 1e-9) && near(Rbehind, Rw*0.4, 1e-9), "the radius of a body: full ahead, 0.4 of it behind him", [r4(Rahead), r4(Rbehind)]);
// receiving on the move: the ball's speed is taken against his
const run = {m: {x: 0, z: 0, yaw: Math.PI/2, vx: -7, vz: 0}, at, scale: 1, y: 0, fac: {bF: 1}};
check(near(zoneR(run, {p: {x: -0.5, y: R, z: 0}, v: {x: -20, y: 0, z: 0}}), Rw*fSpeed(13, rt.vc), 1e-9), "v is the ball's speed relative to his body (20 m/s past a man running at 7 is 13)");

/* ---------- parts ---------- */
check(part(R) === 'foot' && part(0.39) === 'foot' && part(0.6) === 'thigh' && part(1.2) === 'chest' && part(1.4) === 'chest' && part(1.45) === 'head',
  "the part from the real ball height: foot under 0.4 m, thigh, chest to 1.4 m, head above");

/* ---------- q and the touch distance ---------- */
{
  const want = (cc, v, p, b) => clamp(1.2*cc - 0.04*Math.max(0, v - (8 + 10*cc)) - 0.2*p - 0.1*(1 - b), 0, 1);
  const pts = [[c, 10, 0, 1], [c, 20, 0, 1], [c, 12, 1, 1], [c, 12, 0.5, 0.2], [0.3, 25, 1, 0]];
  const got = pts.map(([cc, v, p, b]) => q(cc, v, p, b));
  check(pts.every(([cc, v, p, b], i) => near(got[i], want(cc, v, p, b), 1e-12)), "q = clamp(1.2 c - 0.04 max(0, v - vc) - 0.2 pressure - 0.1 (1 - breath), 0, 1)", got.map(r4));
  check(near(q(at, 10, 0, 1), want(c, 10, 0, 1), 1e-12), "q from an attribute record");
  check(near(touchDist(1), 0.6) && near(touchDist(0), 1.4) && near(touchDist(0.5), 1.0), "touch distance = 0.6 + 0.8 (1 - q) m");
  check(touchDist(q(c, 20, 0, 1)) > touchDist(q(c, 10, 0, 1)), "a harder ball gives a lower q and a longer touch");
}

/* ---------- the race ---------- */
// a drill: a ball rolling along x toward three players at different distances; their arrivals come in order
const rec = (pid, slot, me = false, ovr = 60) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : "CM", isGK: slot === "GK", isMe: me,
  at: attrsForAI({id: pid, ovr, pos: slot === "GK" ? "GK" : "CM"}), energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = yaw; a.set = null; a.plan = null; };
function drill(seed){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: [rec(101, "GK"), rec(102, "CM"), rec(103, "CM")]}, {players: [rec(201, "GK"), rec(202, "CM"), rec(203, "CM")]}],
    me: {team: 0, slot: "CM"}, rules: {offside: false}, kickoffTeam: 0});
  ms.phase = 'live'; ms.restart = null;
  return ms;
}
{
  const ms = drill(3);
  const A = ms.agents.filter(a => a.role === 'player' && !a.isGK);
  for (const g of ms.agents.filter(a => a.isGK)) put(g, (g.team ? 1 : -1)*50, 0, 0);
  put(A[0], 6, 0, Math.PI/2); put(A[1], 12, 3, Math.PI/2); put(A[2], 4, -6, 0); put(A[3], 25, 0, 0);
  const b = ms.ball; b.state = 'free'; b.p.x = 0; b.p.y = R; b.p.z = 0; b.v.x = 6; b.v.y = 0; b.v.z = 0;
  ms.poss.ctl = -1; refreshPred(ms);
  const L = arrivals(ms);
  const ts = L.map(e => e.t);
  check(L.length >= 3 && ts.every((t, i) => i === 0 || t >= ts[i - 1]) && L[0].id === A[0].id, "arrivals are sorted earliest first; the man on the ball's line is first",
    L.map(e => ({id: e.id, t: r4(e.t)})));
  const self = L.map(e => arrivalOf(ms, ms.agents[e.id]));
  check(L.every((e, i) => near(self[i], e.t, 1e-9)), "arrivals agree with each player's arrivalOf");
  // a ball already inside his radius: arrival 0
  b.p.x = 5.4; b.v.x = 0; refreshPred(ms); ms.zone.step = -1;
  check(arrivalOf(ms, A[0]) === 0 && arrivals(ms, {fresh: true})[0].t === 0, "a ball inside his radius now arrives at 0");
}
// the duel window: two opponents at the same distance from a ball rolling between them duel for it; set 0.2 s
// apart (more than DUEL_WIN) the first takes it without one
function race(seed, dz2){
  const ms = drill(seed);
  const A = ms.agents.filter(a => a.role === 'player' && !a.isGK);
  for (const g of ms.agents.filter(a => a.isGK)) put(g, (g.team ? 1 : -1)*50, 0, 0);
  // home man at z = -d1, away man at z = +d2, both facing the ball's line; the ball rolls slowly along x through x = 0
  put(A[0], 0, -0.95, Math.PI); put(A[2], 0, dz2, 0);
  put(A[1], -30, 20, 0); put(A[3], 30, 20, 0);
  const b = ms.ball; b.state = 'free'; b.p.x = -3; b.p.y = R; b.p.z = 0; b.v.x = 3; b.v.y = 0; b.v.z = 0;
  b.last.agent = -1; b.last.team = -1; b.last.kind = 'pass'; b.last.t = -9;
  ms.poss.ctl = -1; refreshPred(ms);
  for (const a of A){ a.plan = {kind: 'chase', x: 0, z: 0, t: 0, y: R, at: 0, first: null, push: null}; }
  const from = ms.events.length;
  let who = -1;
  for (let i = 0; i < 120 && who < 0; i++){
    for (const a of A){ a.intent.dx = 0; a.intent.dz = 0; a.plan = a.plan || {kind: 'chase', x: 0, z: 0, t: 0, y: R, at: 0, first: null, push: null}; }
    touchCheck(ms);
    const ev = ms.events.slice(from).find(e => e.kind === 'touch');
    if (ev) who = ev.agent;
    if (who < 0) simStep(ms);
  }
  const duel = ms.events.slice(from).find(e => e.kind === 'duel');
  return {who, duel: !!duel, gap: duel ? duel.gap : null};
}
{
  let duels = 0, n = 0, gaps = [];
  for (let s = 1; s <= 8; s++){ const r = race(s, 0.95); n++; if (r.duel){ duels++; gaps.push(r.gap); } }
  check(duels === n && gaps.every(g => g <= TUNE.DUEL_WIN.value + 1e-9), "two men level with the ball's line duel for it, every time", {duels, n, gaps});
  let none = 0, firstWins = 0;
  for (let s = 1; s <= 8; s++){ const r = race(s, 2.4); if (!r.duel) none++; if (r.who >= 0 && r.who === 1) firstWins++; }
  check(none === 8, "a man 1.45 m further from it (more than 0.15 s) gives no duel", {none});
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-zone.json"), JSON.stringify(res, null, 1));
console.log(`unit/zone: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
