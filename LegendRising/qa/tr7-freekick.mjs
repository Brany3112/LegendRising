// qa/tr7-freekick.mjs: Training's free kicks (P7-A), in Node and then in the real page.
// Node (scen-freekick.js build and its go, on the simulation the runner plays it on: scen-team.js matchOf):
//   - a grid of ball places (16 to 35 m, -40 to 40 degrees) with no wall, a small and a large wall, wall distances 5
//     to 12 m and offsets across: the ball only where a free kick can be (outside the penalty area, inside the lines),
//     the wall's men where brain.js puts them, nobody inside the wall or on the ball, the defenders 9.15 m off, the
//     indicators (distance to goal, distance from ball) within 0.05 m of the distance worked out from the places;
//   - resizing the wall (0 to 6, on and off) leaves the ball where it is and repositions the wall on its line;
//   - the placement: Start is blocked before both confirms; after Confirm Ball Position, 20 wall changes (distance,
//     offset, size, presence, alignment; previews and confirms) leave the confirmed ball bit-identical, in the state
//     and in the setup a confirm plays;
//   - the second taker, each action over 5 seeds: pass (his pass to the main taker, then the main taker's strike),
//     decoy (he runs at least 5 m and never touches the ball before the main strike), short (the main taker's pass
//     to him, then his shot), carry (the main taker's pass to him, then he runs at least 3 m with it);
//   - a real strike goes over or round the wall, and the keeper reacts.
// Browser (Training by the title's button; stepped frozen):
//   - the free kick drills are in the hub's Set Pieces category; a start puts the placement card up, the simulation
//     held; Start is blocked (and says why) before both confirms; the live indicators read the computed distances;
//   - after Confirm Ball Position, 20 wall changes with confirms leave the real ball bit-identical;
//   - a wall of 6 (no other outfield defender, the keeper, me and a second taker): poolStats().inUse <= 14,
//     bodies().length 16 (the pool plus the sandbox's 2), no body built (human() never called: the body ids do not
//     move on) and no official's body;
//   - a preset saved from a placed free kick survives a reload and a load: the ball, the wall, its size and the
//     measurements the same;
//   - Start plays it: the go is taken; no console or page error; the career save is never written.
// Owner: P7-A (Training Mode Phase 7). Contract: BUILD-PLAN P7-A acceptance "qa/tr7-freekick.mjs".
//
//   node qa/tr7-freekick.mjs [--node]      exits 1 on any failed check (--node: the Node part only)
import {cagePitch} from "../js/life/football/cagespec.js";
import {simStep} from "../js/life/football/sim.js";
import {RULES} from "../js/life/football/rules.js";
import {AGENT} from "../js/life/football/agent.js";
import {wallSpots} from "../js/life/football/brain.js";
import {matchOf} from "../js/life/train/scen-team.js";
import * as F from "../js/life/train/scen-freekick.js";
import {defaults, validate} from "../js/life/train/config.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr7-freekick");
const H = 1/60, r = AGENT.SEP_R;
const hyp = (x, z) => Math.sqrt(x*x + z*z);
const cfgOf = (over = {}) => { const c = defaults("freekick"); for (const [k, v] of Object.entries(over)) if (k === "opts") Object.assign(c.opts, v); else c[k] = v; return validate("freekick", c); };
function play(cfg, seed, o = {}){
  const spec = cagePitch(cfg.pitch || "half"), c = Object.assign({}, cfg, {seed});
  const setup = F.build(c, {spec});
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = o.meAI !== false;
  const J = F.goState(ms);
  let v = null;
  while (ms.t < (o.max || 30)){
    simStep(ms, H); F.setStep(J, ms, setup);
    if (o.onStep) o.onStep(ms, J, setup);
    v = F.judge(J, ms, setup); if (v) break;
  }
  return {ms, J, v, setup, spec};
}

/* ---------- 1. the grid: ball places, walls, distances, offsets ---------- */
{
  const spec = cagePitch("half");
  const bad = {valid:[], ind:[], wall:[], inside:[], ball:[], def:[], sizes:[]};
  let n = 0;
  const walls = [{n:0}, {n:2}, {n:6}];
  for (let d = 16; d <= 35; d += 3) for (let a = -40; a <= 40; a += 10) for (const W of walls) for (const wd of [5, 7.5, 9.15, 12]) for (const off of [-2, 0, 2]){
    if (W.n === 0 && (wd !== 9.15 || off !== 0)) continue;
    const cfg = cfgOf({role:"taker", attackers:3, defenders:Math.min(3, 6 - W.n), wall:W.n, mates:true, opps:true, keeper:true,
      opts:{ballDist:d, ballAng:a, wallDist:wd, wallOff:off, wallOn:W.n > 0, second:"none"}});
    const s = F.build(cfg, {spec}), P = s.plan, b = s.ball;
    n++;
    const tag = {d, a, wall:W.n, wd, off};
    if (!F.validBall(spec, b)) bad.valid.push(tag);
    // the indicators against the distances worked out from the places
    const dg = hyp(spec.hx - b.x, b.z);
    const men = P.wallRefs.map(ref => F.placeOf(s, ref));
    const dw = men.length ? Math.min(...men.map(p => hyp(p.x - b.x, p.z - b.z))) : null;
    if (Math.abs(P.measure.ballGoal - dg) > 0.05 || (dw == null) !== (P.measure.wallBall == null) || dw != null && Math.abs(P.measure.wallBall - dw) > 0.05) bad.ind.push(Object.assign({dg, dw, m:P.measure}, tag));
    // the wall where brain.js puts it, the size asked for
    const want = wallSpots(b, spec.hx, P.wall, {hx:spec.hx, hz:spec.hz}).spots;
    if (men.length !== W.n || men.some((p, i) => Math.abs(p.x - want[i].x) > 0.002 || Math.abs(p.z - want[i].z) > 0.002)) bad.wall.push(tag);
    // nobody inside the wall (2r) or on the ball (half a metre and a shoulder); the defenders 9.15 m off; all in bounds
    const all = [s.me, ...s.mates, ...s.opps];
    for (const p of all){
      if (Math.abs(p.x) > spec.hx || Math.abs(p.z) > spec.hz) bad.inside.push(tag);
      if (hyp(p.x - b.x, p.z - b.z) < 0.5 + r) bad.ball.push(Object.assign({p:[p.x, p.z]}, tag));
      if (!men.includes(p)) for (const q of men) if (hyp(p.x - q.x, p.z - q.z) < 2*r) bad.wall.push(Object.assign({inside:true}, tag));
    }
    for (const p of s.opps) if (!men.includes(p) && hyp(p.x - b.x, p.z - b.z) < RULES.WALL_D) bad.def.push(tag);
  }
  check(!bad.valid.length, `the ball only where a free kick can be: outside the penalty area, inside the lines (${n} setups)`, bad.valid.slice(0, 3));
  check(!bad.ind.length, "the indicators (distance to goal, distance from ball) within 0.05 m of the distances worked out from the places", bad.ind.slice(0, 3));
  check(!bad.wall.length, "the wall: the size asked for, every man where brain.js wallSpots puts him, nobody else inside it", bad.wall.slice(0, 3));
  check(!bad.ball.length && !bad.inside.length, "nobody on the ball, nobody out of bounds", {ball:bad.ball.slice(0, 2), out:bad.inside.slice(0, 2)});
  check(!bad.def.length, "the free defenders start 9.15 m from the ball (the laws)", bad.def.slice(0, 3));
  // a ball asked for inside the penalty area goes to the nearest valid place on the same line, the reading with it
  const p = F.ballSpot(spec, 12, 0);
  check(p.moved && F.validBall(spec, p) && Math.abs(p.dist - F.goalDistance(spec, p)) < 0.05 && p.dist >= 16.5, "a place inside the penalty area is moved out of it, and the reading says where it really is", p);
}

/* ---------- 2. resizing: the ball stays, the wall stays on its line ---------- */
{
  const spec = cagePitch("half");
  const base = F.build(cfgOf({role:"taker", attackers:1, defenders:0, wall:6, opps:true, opts:{ballDist:23, ballAng:-12}}), {spec});
  const b0 = JSON.stringify(base.ball);
  let same = true, line = true;
  const six = wallSpots(base.ball, spec.hx, base.plan.wall, {hx:spec.hx, hz:spec.hz}).spots;
  for (const on of [true, false]) for (let k = 0; k <= 6; k++){
    const s = F.build(cfgOf({role:"taker", attackers:1, defenders:0, wall:k, opps:true, opts:{ballDist:23, ballAng:-12, wallOn:on}}), {spec});
    if (JSON.stringify(s.ball) !== b0) same = false;
    const men = s.plan.wallRefs.map(ref => F.placeOf(s, ref));
    if (men.length !== (on ? k : 0)) line = false;
    men.forEach((p, i) => { if (Math.abs(p.x - six[i].x) > 0.002 || Math.abs(p.z - six[i].z) > 0.002) line = false; });
  }
  check(same, "resizing the wall (0 to 6, on and off) never moves the ball", null);
  check(line, "size 0 or off removes it; resizing repositions it sensibly (the same line, its first men where they were)", null);
}

/* ---------- 3. the placement: confirms, Start, the wall never moving the ball ---------- */
{
  const spec = cagePitch("half"), cfg = cfgOf({role:"taker", attackers:2, defenders:0, wall:4, opps:true, mates:true});
  const S = F.placeState(cfg, spec);
  check(!F.canStart(S), "Start is blocked before anything is confirmed", null);
  F.previewBall(S, {dist:26.3, ang:-17});
  const m = F.measures(S), p = F.ballSpot(spec, 26.3, -17);
  check(Math.abs(m.ballGoal - F.goalDistance(spec, p)) < 0.05, "the live distance to goal follows the preview", {m:m.ballGoal, want:F.goalDistance(spec, p)});
  check(!F.previewWall(S, {dist:7}), "the wall cannot be placed before the ball is confirmed", null);
  F.confirmBall(S);
  check(!F.canStart(S), "Start is still blocked with only the ball confirmed", null);
  const bits0 = JSON.stringify(S.conf.ball), setupBits0 = JSON.stringify(F.build(F.applyPlace(cfg, S), {spec}).ball);
  check(!F.previewBall(S, {dist:30}) && JSON.stringify(S.conf.ball) === bits0, "the confirmed ball is not moved by its own sliders until Adjust Placement", null);
  const changes = [{dist:5}, {off:2.5}, {n:6}, {on:false}, {on:true}, {align:"centre"}, {dist:12}, {off:-3}, {n:0}, {n:3}, {dist:8.2}, {align:"post"}, {off:0.75}, {on:false}, {n:5}, {on:true}, {dist:10.6}, {off:-1.2}, {n:2}, {dist:9.15}];
  let same = true, setupSame = true, wallMoved = 0, confirms = 0;
  changes.forEach((w, i) => {
    const before = JSON.stringify(F.measures(S).wall);
    F.previewWall(S, w);
    if (JSON.stringify(F.measures(S).wall) !== before) wallMoved++;
    if (i % 2 === 1){ F.confirmWall(S); confirms++; }
    if (JSON.stringify(S.conf.ball) !== bits0) same = false;
    if (JSON.stringify(F.build(F.applyPlace(cfg, S), {spec}).ball) !== setupBits0) setupSame = false;
  });
  check(same && setupSame && wallMoved >= 18 && confirms === 10, "20 wall changes (distance, offset, size, presence, alignment; previews and 10 confirms) leave the confirmed ball bit-identical, in the state and in the setup it plays", {wallMoved, confirms});
  check(F.canStart(S), "with both confirmed, Start is allowed", null);
  F.previewWall(S, {dist:6});
  check(!F.canStart(S), "a change to the confirmed wall opens it again (Start blocked until it is confirmed again)", null);
  F.confirmWall(S); F.adjust(S);
  check(!F.canStart(S) && !S.ballOk && !S.wallOk, "Adjust Placement opens both again", null);
}

/* ---------- 4. the second taker, each action over 5 seeds (both takers the computer's, me in the box) ---------- */
{
  const res = {};
  for (const act of ["pass", "decoy", "short", "carry"]){
    res[act] = [];
    for (let seed = 1; seed <= 5; seed++){
      const cfg = cfgOf({role:"attacker", attackers:4, defenders:1, wall:3, mates:true, opps:true, keeper:true, opts:{second:act, strike:"shot", ballDist:24, ballAng:(seed - 3)*6}});
      // the second taker's path, and the carrier's run with the ball
      const trace = {path:0, last:null, runStart:null, runMax:0};
      const out = play(cfg, seed, {max:20, onStep:(ms, J) => {
        if (J.secId < 0) return;
        const a = ms.agents[J.secId];
        const strike = ms.events.find(e => e.kind === "kick" && e.intent === "shot");
        if (!strike){ if (trace.last) trace.path += hyp(a.m.x - trace.last.x, a.m.z - trace.last.z); trace.last = {x:a.m.x, z:a.m.z}; }
        if (ms.poss.ctl === a.id){ if (!trace.runStart) trace.runStart = {x:a.m.x, z:a.m.z}; trace.runMax = Math.max(trace.runMax, hyp(a.m.x - trace.runStart.x, a.m.z - trace.runStart.z)); }
      }});
      const {ms, J} = out, E = ms.events.filter(e => (e.kind === "kick" || e.kind === "touch") && e.agent >= 0);
      const tk = J.R0.fkMain != null ? J.R0.fkMain : J.tkId, sec = J.secId;
      const shot = E.find(e => e.kind === "kick" && e.intent === "shot");
      let ok = false, why = {};
      if (act === "pass"){
        const ps = E.find(e => e.kind === "kick" && e.agent === sec && e.recv === tk);
        ok = !!ps && !!shot && shot.agent === tk && shot.t > ps.t; why = {pass:!!ps, shot:shot && shot.agent, tk};
      } else if (act === "decoy"){
        const touched = E.some(e => e.agent === sec && (!shot || e.t < shot.t));
        ok = !!shot && shot.agent === tk && trace.path >= 5 && !touched; why = {path:+trace.path.toFixed(2), touched, shot:shot && shot.agent};
      } else if (act === "short"){
        const ps = E.find(e => e.kind === "kick" && e.agent === tk && e.recv === sec);
        ok = !!ps && !!shot && shot.agent === sec && shot.t > ps.t; why = {pass:!!ps, shot:shot && shot.agent, sec};
      } else {
        const ps = E.find(e => e.kind === "kick" && e.agent === tk && e.recv === sec);
        ok = !!ps && trace.runMax >= 3; why = {pass:!!ps, run:+trace.runMax.toFixed(2)};
      }
      res[act].push(Object.assign({seed, ok}, why));
    }
  }
  check(res.pass.every(x => x.ok), "pass: the second taker's pass to the main taker, then the main taker's strike (5 seeds)", res.pass);
  check(res.decoy.every(x => x.ok), "decoy: the second taker runs 5 m or more and never touches the ball before the main strike (5 seeds)", res.decoy);
  check(res.short.every(x => x.ok), "short: the main taker's pass to the second, then the second's shot (5 seeds)", res.short);
  check(res.carry.every(x => x.ok), "carry: the main taker's pass to the second, then he runs 3 m or more with it (5 seeds)", res.carry);
}

/* ---------- 5. a real strike over or round the wall, and the keeper reacts ---------- */
{
  const rows = [];
  for (let seed = 1; seed <= 12; seed++){
    const cfg = cfgOf({role:"taker", attackers:1, defenders:0, wall:4, opps:true, keeper:true, opts:{ballDist:21 + (seed % 4)*2, ballAng:(seed % 5 - 2)*7}});
    let cross = null, k0 = null, kMove = 0, kState = false;
    const out = play(cfg, seed, {max:12, onStep:(ms, J, setup) => {
      const gk = ms.agents.find(a => a.isGK);
      if (gk){ if (!k0 && J.strikeT != null) k0 = {x:gk.m.x, z:gk.m.z}; if (k0) kMove = Math.max(kMove, hyp(gk.m.x - k0.x, gk.m.z - k0.z)); if (gk.gk && gk.gk.state && gk.gk.state !== "set" && gk.gk.state !== "idle" && J.strikeT != null) kState = true; }
      // the ball crossing the wall's line (the plane through the men, on the goal side of the ball)
      if (J.strikeT != null && !cross && J.wallIds.length){
        const P = setup.plan, b = ms.ball.p, sp = P.spot, men = J.wallIds.map(id => ms.agents[id].m);
        const ux = (men[0].x - sp.x), uz = (men[0].z - sp.z), ul = hyp(ux, uz), along = ((b.x - sp.x)*ux + (b.z - sp.z)*uz)/ul;
        if (along >= ul){
          const px = -uz/ul, pz = ux/ul, offs = men.map(m => (m.x - sp.x)*px + (m.z - sp.z)*pz), o = (b.x - sp.x)*px + (b.z - sp.z)*pz;
          cross = {y:+b.y.toFixed(2), round:o < Math.min(...offs) - r || o > Math.max(...offs) + r};
        }
      }
    }});
    const save = out.ms.events.some(e => e.kind === "save");
    rows.push({seed, shot:out.J.strikeT != null, over:!!cross && (cross.y > 2.0 || cross.round), y:cross && cross.y, round:cross && cross.round, hit:out.J.wallHit, keeper:save || kMove > 0.3 || kState, goal:out.J.goal === 0, why:out.v && out.v.why});
  }
  const shots = rows.filter(x => x.shot), over = shots.filter(x => x.over), react = shots.filter(x => x.keeper);
  check(shots.length === rows.length && over.length >= 1, "a real strike goes over or round the wall (some over or round it, the rest blocked or under)", {over:over.length, shots:shots.length, rows:rows.slice(0, 6)});
  check(react.length >= Math.ceil(shots.length*0.75), "the keeper reacts to the strike (a save, a dive, or a move of 0.3 m or more)", {react:react.length, shots:shots.length});
}

/* ---------- 6. every drill plays, every role ---------- */
{
  const R = F.FREEKICKS.map(d => { const cfg = validate("freekick", Object.assign(defaults("freekick"), d.cfg, {opts:Object.assign(defaults("freekick").opts, d.cfg.opts)})); const o = play(cfg, 3, {max:40}); return {id:d.id, role:cfg.role, taken:o.J.taken, why:o.v && o.v.why}; });
  check(R.every(x => x.taken && x.why && x.why !== "slow"), "every free kick drill is taken and decided (all five roles, the computer standing in for me)", R);
}

if (!process.argv.includes("--node")) await browserPart();
process.exit(done() ? 0 : 1);

/* ---------- the real page ---------- */
async function browserPart(){
  const {freeze, unfreeze} = await import("./lib.mjs");
  const {trainLaunch, enterByButton, careerSnapshot, careerDiff, clickReal} = await import("./tr4b-lib.mjs");
  const t = await trainLaunch({seed:7});
  const page = t.page;
  // a real click on a control of the card, scrolled into view first as a user would
  const tap = async sel => { await page.evaluate(sel => { const e = document.querySelector(sel); if (e) e.scrollIntoView({block:"nearest"}); }, sel); return clickReal(page, sel); };
  const ready = () => page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout:120000});
  const HELP = () => {
    const Rn = window.__trainRun, C = window.__trainConfig, L = window.__life;
    window.__t7a = {
      cfg(over){ const c = C.defaults("freekick"); for (const [k, v] of Object.entries(over || {})) if (k === "opts") Object.assign(c.opts, v); else c[k] = v; return C.validate("freekick", c); },
      start(id, cfg){ if (Rn.RUN.cur) Rn.stopScenario("restart"); return Rn.startScenario(id, cfg); },
      step(n){ for (let i = 0; i < n; i++) L.stepN(1, 1/60); },
      ball(){ const b = Rn.RUN.T.ms.ball.p; return [b.x, b.y, b.z]; }
    };
  };
  try {
    const before = await careerSnapshot(page);
    await enterByButton(page);
    await page.evaluate(HELP);
    await page.evaluate(() => window.__trainHub.closeHub());
    const ids = await page.evaluate(() => window.__trainRun.scenariosOf("setpieces").map(s => s.id));
    check(F.FREEKICKS.every(d => ids.includes(d.id)), "the free kick drills are in the hub's Set Pieces category", ids);

    /* the placement card, the hold, Start blocked, the live indicators */
    const C1 = await page.evaluate(() => window.__t7a.cfg({role:"taker", attackers:2, defenders:1, wall:4, mates:true, opps:true, keeper:true, opts:{second:"none", ballDist:22, ballAng:-8}}));
    await page.evaluate(([c]) => window.__t7a.start("fk-direct", c), [C1]);
    await ready();
    await freeze(page);
    await page.evaluate(() => window.__t7a.step(3));
    const s0 = await page.evaluate(() => ({open:window.__fkPlace.open(), paused:window.__trainRun.RUN.paused, card:!!document.querySelector("#fkPlace .fkp"), t:window.__trainRun.RUN.T.ms.t}));
    await page.evaluate(() => window.__t7a.step(30));
    const s1 = await page.evaluate(() => ({t:window.__trainRun.RUN.T.ms.t, restart:!!window.__trainRun.RUN.T.ms.restart}));
    check(s0.open && s0.card && s0.paused && s1.t === s0.t && !s1.restart, "a start puts the placement card up with the simulation held and no restart begun", {s0, s1});
    await tap('#fkPlace [data-fkp="start"]');
    const blocked = await page.evaluate(() => ({open:window.__fkPlace.open(), note:(document.querySelector('#fkPlace [data-fkp-out="note"]') || {}).textContent, go:!!window.__trainRun.RUN.cur.fkGo}));
    check(blocked.open && !blocked.go && /Confirm/.test(blocked.note || ""), "Start Free Kick is blocked before both confirms, and says why", blocked);
    const reads = [];
    for (const [d, a] of [[16, 0], [18.5, -25], [21.4, 12], [24, 40], [27.7, -40], [30, 5], [33, -31], [35, 22]]){
      const r = await page.evaluate(([d, a]) => { window.__fkPlace.ball({dist:d, ang:a}); const M = window.__fkPlace.measures();
        return {shown:document.querySelector('#fkPlace [data-fkp-out="ballGoal"]').textContent, m:M.ballGoal, x:M.ball.x, z:M.ball.z}; }, [d, a]);
      const spec = cagePitch("half"), want = hyp(spec.hx - r.x, r.z);
      reads.push({d, a, shown:r.shown, want:+want.toFixed(3), ok:Math.abs(parseFloat(r.shown) - want) <= 0.05 + 1e-9});
    }
    check(reads.every(x => x.ok), "the live \"Distance to goal\" is within 0.05 m of the ball's distance to the middle of the goal line, as it moves", reads);
    const marks0 = await page.evaluate(() => window.__fkPlace.marks());
    check(marks0 === 1, "the ball's preview is marked on the grass", marks0);

    /* confirm the ball; 20 wall changes with confirms: the real ball bit-identical */
    await page.evaluate(() => window.__fkPlace.ball({dist:23.6, ang:-14}));
    await tap('#fkPlace [data-fkp="confirmBall"]');
    await ready();
    await page.evaluate(() => window.__t7a.step(2));
    const b0 = await page.evaluate(() => ({ball:window.__t7a.ball(), S:window.__fkPlace.state().conf.ball, open:window.__fkPlace.open(), ok:window.__fkPlace.state().ballOk}));
    check(b0.open && b0.ok && Math.abs(b0.ball[0] - b0.S.x) < 1e-9 && Math.abs(b0.ball[2] - b0.S.z) < 1e-9, "Confirm Ball Position puts the real ball there, the card still up for the wall", b0);
    const changes = [{dist:5}, {off:2.5}, {n:6}, {on:false}, {on:true}, {align:"centre"}, {dist:12}, {off:-3}, {n:0}, {n:3}, {dist:8.2}, {align:"post"}, {off:0.75}, {on:false}, {n:5}, {on:true}, {dist:10.6}, {off:-1.2}, {n:2}, {dist:9.15}];
    const wr = [];
    for (let i = 0; i < changes.length; i++){
      const w = changes[i];
      const r = await page.evaluate(([w]) => { window.__fkPlace.wall(w); const M = window.__fkPlace.measures(); return {shown:(document.querySelector('#fkPlace [data-fkp-out="wallBall"]') || {}).textContent, m:M.wallBall, spots:M.wall, ball:M.ball}; }, [w]);
      const dw = r.spots.length ? Math.min(...r.spots.map(q => hyp(q.x - r.ball.x, q.z - r.ball.z))) : null;
      const shownOk = dw == null ? /no wall/.test(r.shown) : Math.abs(parseFloat(r.shown) - dw) <= 0.05 + 1e-9;
      let real = null;
      if (i % 2 === 1){
        await tap('#fkPlace [data-fkp="confirmWall"]');
        await ready();
        await page.evaluate(() => window.__t7a.step(2));
        real = await page.evaluate(() => window.__t7a.ball());
      }
      wr.push({i, shownOk, shown:r.shown, dw, real, same:!real || JSON.stringify(real) === JSON.stringify(b0.ball)});
    }
    check(wr.every(x => x.shownOk), "the live \"Distance from ball\" is within 0.05 m of the wall's distance from the ball, through every change", wr.filter(x => !x.shownOk).slice(0, 3));
    check(wr.every(x => x.same), "after Confirm Ball Position, 20 wall changes (10 of them confirmed) leave the real ball bit-identical", wr.filter(x => !x.same).slice(0, 3));
    const wallNow = await page.evaluate(() => { const Rn = window.__trainRun, ms = Rn.RUN.T.ms, c = Rn.RUN.cur.config, P = Rn.RUN.setup.plan;
      const men = P.wallRefs.length, spots = window.__trainFK.wallOf(Rn.RUN.T.spec, Rn.RUN.setup.ball, P.wall).spots;
      return {theirs:ms.agents.filter(a => a.onPitch && a.role === "player" && a.team !== ms.agents[ms.me].team && !a.isGK).length, want:c.wall + c.defenders, wall:c.wall, men, spots:spots.length}; });
    check(wallNow.theirs === wallNow.want && wallNow.men === 2 && wallNow.spots === 2, "the confirmed wall stands on the pitch: its 2 men (the last size confirmed), with the free defenders the six still allows", wallNow);

    /* Start plays it */
    await tap('#fkPlace [data-fkp="start"]');
    const go = await page.evaluate(() => { const Rn = window.__trainRun; window.__t7a.step(60*4); return {open:window.__fkPlace.open(), go:!!Rn.RUN.cur.fkGo, paused:Rn.RUN.paused, restart:!!Rn.RUN.T.ms.restart, t:Rn.RUN.T.ms.t}; });
    check(!go.open && go.go && !go.paused && go.restart, "Start Free Kick takes the card down and the free kick is on (the restart waiting for my strike)", go);

    /* bodies with a wall of 6 */
    const B = await page.evaluate(async () => {
      const Hm = await import("/js/life/human.js"), Rn = window.__trainRun, L = window.__life;
      const max0 = Math.max(...Hm.bodies().map(h => h.id));
      const c = window.__t7a.cfg({role:"taker", attackers:2, defenders:0, wall:6, mates:true, opps:true, keeper:true, opts:{second:"pass"}});
      window.__t7a.start("fk-touch", c);
      return {max0, cfg:c};
    });
    await ready();
    const B2 = await page.evaluate(async ([max0]) => {
      const Hm = await import("/js/life/human.js"), Rn = window.__trainRun, L = window.__life;
      window.__t7a.step(3);
      let officials = 0; L.scene().traverse(o => { if (/^match-(22|23|24)$/.test(o.name)) officials++; });
      const ms = Rn.RUN.T.ms;
      return {inUse:Rn.poolStats().inUse, bodies:Hm.bodies().length, maxId:Math.max(...Hm.bodies().map(h => h.id)), max0, officials,
        agents:ms.agents.filter(a => a.onPitch).length, wall:ms.agents.filter(a => a.onPitch && a.role === "player" && a.team !== ms.agents[ms.me].team && !a.isGK).length};
    }, [B.max0]);
    check(B2.wall === 6 && B2.inUse <= 14, "a wall of 6 with the keeper, me and a second taker: poolStats().inUse at most 14", B2);
    check(B2.bodies === 16, "bodies().length is the drill value of 16 (the pool plus the sandbox's 2)", B2.bodies);
    check(B2.maxId === B2.max0, "no body is built for it (human() is never called: the body ids do not move on)", {max0:B2.max0, max:B2.maxId});
    check(B2.officials === 0, "no official's body", B2.officials);

    /* presets: a placed free kick saved, reloaded, loaded */
    await page.evaluate(() => window.__fkPlace.ball({dist:28.4, ang:21}));
    await tap('#fkPlace [data-fkp="confirmBall"]');
    await ready(); await page.evaluate(() => window.__t7a.step(2));
    await page.evaluate(() => window.__fkPlace.wall({n:5, dist:10.25, off:-1.5, align:"centre"}));
    await tap('#fkPlace [data-fkp="confirmWall"]');
    await ready(); await page.evaluate(() => window.__t7a.step(2));
    const placed = await page.evaluate(() => { const Rn = window.__trainRun, P = Rn.RUN.setup.plan; return {cfg:Rn.RUN.cur.config, ball:window.__t7a.ball(), measure:P.measure, wall:P.wall}; });
    await page.evaluate(() => window.__fkPlace.back());
    const bk = await page.evaluate(() => ({cfg:window.__trainConfigUI.configOpen(), run:!!window.__trainRun.RUN.cur, card:window.__fkPlace.open(), hub:window.__trainHub.hubOpen()}));
    check(bk.cfg && !bk.run && !bk.card, "Back to settings ends the placement and brings the configuration sheet back", bk);
    await page.evaluate(() => window.__trainConfigUI.closeConfig(true));
    await unfreeze(page);
    await page.evaluate(([c]) => window.__trainPresetUI.openPresets({type:"freekick", typeName:"Free kick", config:c, scenarioId:"fk-touch"}), [placed.cfg]);
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout:15000});
    await clickReal(page, "#tpName");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Wide wall of five", {delay:15});
    await clickReal(page, '#sheetRoot [data-tp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout:10000});
    await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
    await unfreeze(page);
    await page.reload();
    await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout:60000});
    await enterByButton(page);
    await page.evaluate(HELP);
    await page.evaluate(() => window.__trainHub.closeHub());
    await page.evaluate(() => window.__trainPresetUI.openPresets({type:"freekick", typeName:"Free kick", config:null, scenarioId:"fk-touch"}));
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout:15000});
    const rows = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({id:r.dataset.row, name:r.querySelector(".tp-name").textContent, meta:r.querySelector(".tp-meta").textContent})));
    const row = rows.find(x => x.name === "Wide wall of five");
    check(!!row, "after a reload the free kick preset is in the Load list, saying where the ball is", rows);
    if (row){
      await unfreeze(page);
      await clickReal(page, `#sheetRoot [data-row="${row.id}"] [data-tp="load"]`);
      await ready();
      await freeze(page);
      await page.evaluate(() => window.__t7a.step(2));
      const loaded = await page.evaluate(() => { const Rn = window.__trainRun, P = Rn.RUN.setup.plan; return {cfg:Rn.RUN.cur.config, ball:window.__t7a.ball(), measure:P.measure, wall:P.wall, open:window.__fkPlace.open()}; });
      const keys = ["ballDist", "ballAng", "wallDist", "wallOff", "wallAlign", "wallOn"];
      check(keys.every(k => loaded.cfg.opts[k] === placed.cfg.opts[k]) && loaded.cfg.wall === placed.cfg.wall && loaded.cfg.wall === 5, "the preset restores the placement: the ball's and the wall's places, its size", {placed:keys.map(k => placed.cfg.opts[k]), loaded:keys.map(k => loaded.cfg.opts[k]), wall:loaded.cfg.wall});
      check(JSON.stringify(loaded.ball) === JSON.stringify(placed.ball) && JSON.stringify(loaded.measure) === JSON.stringify(placed.measure) && JSON.stringify(loaded.wall) === JSON.stringify(placed.wall),
        "and the ball, the wall and the measurements are the same as when it was saved", {placed:placed.measure, loaded:loaded.measure});
      check(loaded.open, "a loaded free kick comes up on the placement card, its places ready to confirm", loaded.open);
    }
    const after = await careerSnapshot(page);
    const diff = careerDiff(before, after);
    check(!diff.length, "the career save is never written", diff.slice(0, 3));
  } catch(e){ check(false, "browser part ran", String(e && e.stack || e)); }
  check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
  await t.close();
}
