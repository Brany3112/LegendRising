// qa/uf-callpass.mjs: R, the call for the ball, always counts (USER-ISSUES U10: "sometimes the request for pass doesnt
// work"). Two parts.
//   1. In a real match in the browser (test:11v11, first person, the pointer locked by a real click), 50 presses of R
//      with page.keyboard, at varied moments of play (with and without the ball near, while sprinting with Shift held,
//      pressed again within a second): every one registers (control.js counts it, the simulation logs the call and
//      sets it on you, your arm goes up, the HUD says "Here!"), and when a team-mate has the ball he looks at his
//      options at once with you among them.
//   2. In the simulation (Node, seeded, the way R does it, brain.js callFor): open, onside and with a clear lane (the
//      carrier's pass model gives at least 0.7), the AI carrier passes to you within 2 s in at least 80% of runs
//      (BUILD-PLAN P6-B "me requesting a pass"); with the lane blocked (under 0.3) never; and you are among his options
//      in every decision he makes.
//   3. Your keeper with the ball (the browser, the same match, real presses of R): in his hands he looks at once with
//      you among his options and, you open, rolls or throws it to you; you out of his reach, he weighs you and holds on;
//      winding up a throw or a roll to another man, the call waits for that man (ms.call.wait), who hears it the moment
//      he has the ball and looks at once with you among his options.
// The root causes it guards: the call was sent on the key's release (a release lost to a cut or a reset sent nothing),
// a second press within 4 s was dropped without a word, and the carrier only weighed a call as a few per cent on a pass
// that was already nearly his best, on his own cadence, and not at all once the preference cap had tripped; and the
// keeper never heard a call at all (his distribution is his own, gkbrain.js), so a press while he held the ball for his
// throw or roll counted and raised your arm but nobody weighed it (the loop's intermittent misses, 2 runs in 6).
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U10; BUILD-PLAN P6-B ("me requesting a pass").
//
//   QA_PORT=8863 node qa/uf-callpass.mjs [--node-only]      exits 1 on any failed check
import {createMatch, simStep, REF, AR1, AR2} from "../js/life/football/sim.js";
import * as rules from "../js/life/football/rules.js";
import {attrsForAI} from "../js/life/football/attrs.js";
import {makePitch} from "../js/life/football/pitchspec.js";
import {refreshPred} from "../js/life/football/actions.js";
import {callFor, passModel} from "../js/life/football/brain.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("uf-callpass");
const NODE_ONLY = process.argv.includes("--node-only");

/* ---------- 2. the simulation: the carrier hears the call ---------- */
const rec = (pid, slot, pos, me = false, ovr = 65) => ({pid, name: slot + pid, number: pid % 90 + 1, slot, arch: slot === "GK" ? "GK" : pos, isGK: slot === "GK", isMe: me,
  at: attrsForAI({id: pid, ovr, pos}), energy: 100});
const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.set = null; };
// a carrier of ours in midfield (team 0 attacks +x), you ahead of him to one side, a second team-mate wide, three of
// theirs; blocked: one of theirs on your lane
function trial(seed, {call = true, blocked = false} = {}){
  const ms = createMatch({seed, mode: "drill", spec: makePitch(), teams: [{players: [rec(11, "CM", "CM"), rec(12, "ST", "ST", true), rec(13, "W", "W")]},
    {players: [rec(31, "GK", "GK"), rec(32, "CB", "DF"), rec(33, "CB", "DF"), rec(34, "CM", "CM")]}], me: {team: 0, slot: "ST"}, rules: {offside: false}, kickoffTeam: 0});
  ms.meAI = false;
  for (const id of [REF, AR1, AR2]) ms.agents[id].onPitch = false;
  ms.restart = null; ms.phase = "live"; ms.clock.running = true;
  const [pa, me, w, gk, d1, d2, cm] = ms.agents;
  const jit = ((seed*37) % 11)/10 - .5;
  put(pa, -6, 0, -Math.PI/2); put(me, -11, 12 + jit, -Math.PI/2); put(w, 9, -12, -Math.PI/2);
  put(gk, 50, 0, Math.PI/2); put(d1, 26, -6, Math.PI/2); put(d2, 26, 8 + jit, Math.PI/2); put(cm, 2, -7, Math.PI/2);
  if (blocked) put(cm, -8.4, 6 + jit*.4, Math.PI/2);
  const b = ms.ball; b.p.x = -5.4; b.p.z = 0; b.p.y = 0.11; b.state = "free"; rules.liveRoll(b); rules.setCtl(ms, pa); ms.cutStep = ms.step; refreshPred(ms);
  // the pass model of the plain pass to you as he sees it now
  const pm = passModel(ms, b.p, {x: me.m.x, z: me.m.z}, "pass", 14, me);
  const pOK = pm.pOK;
  let decisions = 0, withMe = 0;
  ms.onDecide = (a, opts) => { if (a !== pa) return; decisions++; if (opts.some(o => o.isMe)) withMe++; };
  if (call) callFor(ms, me, "here", null);
  let passed = false, other = false, t = 0;
  for (let k = 0; k < 120 && !passed && !other; k++){
    me.intent.dx = 0; me.intent.dz = 0;
    const n0 = ms.events.length;
    simStep(ms); t = ms.t;
    for (const e of ms.events.slice(n0)) if (e.kind === "kick" && e.agent === pa.id){ if (e.recv === me.id) passed = true; else other = true; }
  }
  return {pOK, passed, other, decisions, withMe, pending: !!pa.brain.pending};
}
{
  const open = {runs: 0, passed: 0, pOKmin: 1, decisions: 0, withMe: 0}, quiet = {runs: 0, passed: 0}, blocked = {runs: 0, passed: 0, pOKmax: 0};
  for (let s = 1; s <= 20; s++){
    const r = trial(s, {call: true});
    if (r.pOK >= .7){ open.runs++; if (r.passed) open.passed++; open.pOKmin = Math.min(open.pOKmin, +r.pOK.toFixed(2)); }
    open.decisions += r.decisions; open.withMe += r.withMe;
    const q = trial(s, {call: false});
    if (q.pOK >= .7){ quiet.runs++; if (q.passed) quiet.passed++; }
    const bl = trial(s, {call: true, blocked: true});
    if (bl.pOK < .3){ blocked.runs++; if (bl.passed) blocked.passed++; }
    blocked.pOKmax = Math.max(blocked.pOKmax, +bl.pOK.toFixed(2));
  }
  check(open.runs >= 15, "the open case is open (pass model at least 0.7) in most seeds", open);
  check(open.passed >= .8*open.runs, `called for, open, onside, a clear lane: the carrier passes to you within 2 s in ${open.passed} of ${open.runs} (at least 80%)`, open);
  check(open.withMe === open.decisions && open.decisions > 0, "you are among the carrier's options in every decision he makes", {decisions: open.decisions, withMe: open.withMe});
  check(blocked.runs >= 10 && blocked.passed === 0, `called for with the lane blocked (under 0.3): never passed (${blocked.passed} of ${blocked.runs})`, blocked);
  console.log(`  (the same open case without a call: passed to you in ${quiet.passed} of ${quiet.runs})`);
  check(quiet.passed < open.passed, "the call is what makes the difference (fewer passes to you without it)", {called: open.passed, quiet: quiet.passed});
}

/* ---------- 1. the browser: 50 real presses of R in a real match ---------- */
if (!NODE_ONLY){
  const {openFixture} = await import("./uf-lib.mjs");
  const T = await openFixture("test:11v11", {seed: 4});
  const {page} = T;
  try {
    check(!!T.lock, "the pointer locked by a real click", T.lock);
    const live = await T.until(() => window.__fp.state === "live" && window.__fp.FS.onPitch, 600);
    check(live >= 0, "a live match, you on the pitch", live);
    // the carrier's decisions seen from the page (the harness's own window on them)
    await page.evaluate(() => { const ms = window.__fp.ms; window.__dec = []; ms.onDecide = (a, opts) => { window.__dec.push({t: ms.t, a: a.id, team: a.team, me: opts.some(o => o.isMe)}); }; });
    const res = {presses: 0, registered: 0, logged: 0, simCall: 0, arm: 0, hud: 0, mateCarrier: 0, considered: 0, keeperWind: 0, keeperQueued: 0, sprinting: 0, quick: 0, misses: []};
    for (let i = 0; i < 50; i++){
      // play on a little: chase the ball with W (and Shift every third press), the look on it
      const sprint = i % 3 === 0, quick = i % 5 === 4;
      await page.evaluate(() => { const F = window.__fp, P = window.__life.P, b = F.ms.ball.p; P.yaw = Math.atan2(-(b.x - P.x), -(b.z - P.z)); P.pitch = -.15; });
      await page.keyboard.down("w"); if (sprint) await page.keyboard.down("Shift");
      await T.frames(quick ? 8 : 24 + (i*7) % 40);
      const before = await page.evaluate(() => { const F = window.__fp, ms = F.ms, me = F.me(); return {n: F.ctrl.call.n, ev: ms.events.filter(e => e.kind === "call" && e.agent === me.id).length, t: ms.t, ctl: ms.poss.ctl, ctlTeam: ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl].team : -1, cAct: ms.poss.ctl >= 0 && ms.agents[ms.poss.ctl].act ? ms.agents[ms.poss.ctl].act.kind : null, cd: ms.poss.ctl >= 0 ? Math.hypot(ms.agents[ms.poss.ctl].m.x - me.m.x, ms.agents[ms.poss.ctl].m.z - me.m.z) : 0, meTeam: me.team, meId: me.id, dec: window.__dec.length}; });
      await page.keyboard.press("r");
      res.presses++; if (sprint) res.sprinting++; if (quick) res.quick++;
      await T.frames(2);
      const after = await page.evaluate(([meId, dec0]) => {
        const F = window.__fp, ms = F.ms, me = ms.agents[meId], R = F.FS.V.rec[meId], line = document.querySelector(".fp-sline");
        return {n: F.ctrl.call.n, ev: ms.events.filter(e => e.kind === "call" && e.agent === meId).length, call: ms.call ? {agent: ms.call.agent, t: ms.call.t} : null, t: ms.t,
          lastCall: me.lastCall, upper: R && R.st && R.st.upper ? R.st.upper.g : null, line: line ? line.textContent : "", lineOn: line ? line.classList.contains("in") : false,
          dec: window.__dec.slice(dec0),
          // (what play was doing, for a miss: the phase, a restart, who holds the ball and what he is about)
          at: {phase: ms.phase, st: F.state, onPitch: !!F.FS.onPitch, enabled: F.ctrl.enabled !== false, restart: ms.restart ? ms.restart.kind : null, ball: ms.ball.state,
            holder: ms.ball.holder != null && ms.ball.holder >= 0 ? (ms.agents[ms.ball.holder].act ? ms.agents[ms.ball.holder].act.kind : "none") : null, queue: F.ctrl.queue.length}};
      }, [before.meId, before.dec]);
      const reg = after.n === before.n + 1, logged = after.ev === before.ev + 1, sim = !!after.call && after.call.agent === before.meId && after.t - after.call.t < .2;
      const arm = after.lastCall != null && after.t - after.lastCall < .2, hud = after.lineOn && /Here!/.test(after.line);
      if (reg) res.registered++; if (logged) res.logged++; if (sim) res.simCall++; if (arm) res.arm++; if (hud) res.hud++;
      if (!(reg && logged && sim && arm && hud) && res.misses.length < 5) res.misses.push({i, reg, logged, sim, arm, hud, line: after.line, at: after.at});
      // a team-mate on the ball: his next look comes at once, with you among his options
      // (one already striking the ball has played it: his pass is on its way, there is nothing left to weigh; and a
      // pass is an option from 4 to 52 m, brain.js PASS_MIN and PASS_MAX, to where you will be: 5 to 50 m here)
      // (your keeper winding up a throw or a roll: his choice is made as a kick being struck is; the call waits for the man
      // it goes to, part 3 below has it through to him)
      const winding = before.cAct === "gkthrow" || before.cAct === "gkroll";
      if (winding && before.ctlTeam === before.meTeam){
        res.keeperWind++;
        const q = await page.evaluate(([c, meId]) => { const ms = window.__fp.ms, a = ms.agents[c], C = ms.call, K = a.act;
          return {toMe: !!(K && K.recv === meId), wait: C ? C.wait : null, heard: C ? C.heard : null, recv: K ? K.recv : null, done: !!(K && K.done)}; }, [before.ctl, before.meId]);
        if (q.toMe || (q.recv != null && (q.wait === q.recv || q.heard === q.recv)) || q.done) res.keeperQueued++; else res.misses.push({i, keeper: q});
      }
      const striking = before.cAct === "kick" || winding || before.cd < 5 || before.cd > 50;
      if (before.ctl >= 0 && before.ctlTeam === before.meTeam && before.ctl !== before.meId && !striking){
        res.mateCarrier++;
        if (after.dec.some(d => d.a === before.ctl && d.me)) res.considered++;
        else {
          const later = await page.evaluate(([c, dec0, meId]) => {
            const F = window.__fp, ms = F.ms, a = ms.agents[c], me = ms.agents[meId];
            const why = {d: +Math.hypot(a.m.x - me.m.x, a.m.z - me.m.z).toFixed(1), act: a.act ? a.act.kind : null, pend: !!a.pendKick, gk: !!a.isGK, ball: ms.ball.state, ctl: ms.poss.ctl, drib: !!(a.drib && a.drib.commit > ms.t), pending: !!a.brain.pending, decs: window.__dec.slice(dec0).filter(d => d.a === c).length};
            // (his choice already made and it is you: the kick he is setting up is a pass to you)
            const toMe = () => !!(a.pendKick && a.pendKick.rq && a.pendKick.rq.recv === meId) || ms.events.some(e => e.kind === "kick" && e.agent === c && e.recv === meId && e.t > ms.t - 1);
            if (toMe()) return {ok: true, why};
            F.stepN(10);
            return {ok: window.__dec.slice(dec0).some(d => d.a === c && d.me) || toMe(), why};
          }, [before.ctl, before.dec, before.meId]);
          if (later.ok) res.considered++; else res.misses.push({i, carrier: later.why});
        }
      }
      if (sprint) await page.keyboard.up("Shift");
      await page.keyboard.up("w");
      if (i === 10) await T.snap("uf-callpass-press");
    }
    console.log("  ", JSON.stringify(res));
    check(res.registered === 50 && res.logged === 50 && res.simCall === 50, "50 real presses of R: every one registers (counted, logged, the call set on you)", {registered: res.registered, logged: res.logged, sim: res.simCall, misses: res.misses});
    check(res.arm === 50, "every press puts your arm up (the call on your agent, the raise the bodies show)", res.arm);
    check(res.hud === 50, "every press shows what you shouted under the crosshair", res.hud);
    check(res.sprinting >= 15 && res.quick >= 8, "presses made while sprinting and pressed again within a moment are among them", {sprinting: res.sprinting, quick: res.quick});
    check(res.mateCarrier === 0 || res.considered === res.mateCarrier, `with a team-mate on the ball (${res.mateCarrier} presses), he weighed passing to you right after each`, {mateCarrier: res.mateCarrier, considered: res.considered});
    check(res.keeperQueued === res.keeperWind, `with your keeper winding up a throw or a roll (${res.keeperWind} presses), the call waited for the man it goes to`, {keeperWind: res.keeperWind, queued: res.keeperQueued});

    /* ---------- 3. your keeper with the ball: real presses of R ---------- */
    // (the scene, set as play would leave it: your keeper with the ball in his hands 6 m off his line, their side up the
    // other end; you where the case puts you; the press itself is a real key press)
    await page.keyboard.up("w");
    await page.evaluate(() => {
      const F = window.__fp, ms = F.ms, me = F.me(), dir = ms.dirs[me.team], gx = -dir*ms.spec.hx;
      const put = (a, x, z) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.act = null; a.set = null; a.pendKick = null; a.drib = null; };
      window.__k = {
        gk: ms.agents.find(a => a.team === me.team && a.isGK && a.onPitch), dir, gx, put,
        // the keeper's ball: let go by whoever had it, then gathered in his hands (gkbrain.js gkCollect), held for holdT
        async hold(meAt, holdT, mates){
          const G = await import("./js/life/football/gkbrain.js");
          const gk = this.gk, b = ms.ball;
          ms.restart = null; ms.phase = "live"; ms.call = null;
          for (const o of ms.agents) if (o.onPitch && o.role === "player" && o.team !== me.team) put(o, dir*(22 + (o.id % 5)*4), ((o.id % 7) - 3)*8);
          for (const o of ms.agents) if (o.onPitch && o.role === "player" && o.team === me.team && o !== gk && o !== me) put(o, dir*(8 + (o.id % 4)*6), ((o.id % 7) - 3)*9);
          if (mates) mates(this);
          put(gk, gx + dir*6, 0); gk.m.yaw = gk.m.heading = dir > 0 ? -Math.PI/2 : Math.PI/2;
          put(me, gx + dir*meAt.x, meAt.z);
          if (b.holder != null && b.holder >= 0){ b.state = "free"; b.holder = -1; }
          b.p.x = gk.m.x + dir*.4; b.p.y = .3; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
          if (gk.gk){ gk.gk.state = "ready"; gk.gk.plan = null; gk.gk.claim = null; gk.gk.callT = null; }
          const ok = G.gkCollect(ms, gk);
          gk.gk.holdT = holdT;
          window.__dec = []; this.t0 = ms.t;
          return {ok, ctl: ms.poss.ctl === gk.id, state: gk.gk.state, d: +Math.hypot(me.m.x - gk.m.x, me.m.z - gk.m.z).toFixed(1)};
        },
        st(){ const gk = this.gk, K = gk.act, C = ms.call;
          return {state: gk.gk.state, act: K ? {kind: K.kind, recv: K.recv, done: !!K.done} : null, ctl: ms.poss.ctl, ball: ms.ball.state, t: ms.t,
            call: C ? {agent: C.agent, t: C.t, wait: C.wait, heard: C.heard} : null, n: F.ctrl.call.n,
            kicks: ms.events.filter(e => e.kind === "kick" && e.agent === gk.id && e.t >= this.t0).map(e => ({t: e.t, recv: e.recv, intent: e.intent})),
            dec: window.__dec.slice()};
        }
      };
    });
    const meId = await page.evaluate(() => window.__fp.me().id);
    const gkId = await page.evaluate(() => window.__k.gk.id);
    // 3a. you open, 16 m out to one side: a press in his hands; he looks at once and plays it to you
    const a0 = await page.evaluate(() => window.__k.hold({x: 20, z: 9}, 30));
    await T.frames(3);
    const a1 = await page.evaluate(() => window.__k.st());
    await page.keyboard.press("r");
    await T.frames(2);
    const a2 = await page.evaluate(() => window.__k.st());
    await T.frames(60);
    const a3 = await page.evaluate(() => window.__k.st());
    check(a0.ok && a0.ctl && a1.state === "hold" && a1.ball === "held" && !a1.act, "your keeper holds the ball (in his hands, his to play)", {a0, state: a1.state, ball: a1.ball});
    check(a2.n === a1.n + 1 && a2.call && a2.call.agent === meId, "a press of R while he holds it registers (counted, the call set on you)", {n: [a1.n, a2.n], call: a2.call});
    check(a2.dec.some(d => d.a === gkId && d.me), "he looks at once, with you among his options", a2.dec);
    check(a3.kicks.some(k => k.recv === meId), "you open: he rolls or throws it to you (he does not wait out his hold)", {act: a2.act, kicks: a3.kicks, state: a3.state});
    // 3b. you 45 m away (out of his reach): he weighs you and holds on; the call stands
    await page.evaluate(() => window.__k.hold({x: 52, z: 6}, 30));
    await T.frames(3);
    const b1 = await page.evaluate(() => window.__k.st());
    await page.keyboard.press("r");
    await T.frames(2);
    const b2 = await page.evaluate(() => window.__k.st());
    await T.frames(30);
    const b3 = await page.evaluate(() => window.__k.st());
    check(b2.n === b1.n + 1 && b2.call && b2.call.agent === meId, "out of his reach: the press registers", {n: [b1.n, b2.n], call: b2.call});
    check(b2.dec.some(d => d.a === gkId && d.me) && b3.state === "hold" && b3.ctl === gkId && !b3.kicks.length, "out of his reach: he weighs you at once and holds on", {dec: b2.dec, state: b3.state, kicks: b3.kicks});
    // 3c. winding up a roll or a throw to a centre-back: the call waits for him, and he hears it as he has the ball
    await page.evaluate(meId => window.__k.hold({x: 24, z: -14}, 0, k => {
      const ms = window.__fp.ms, me = ms.agents[meId];
      // (one centre-back open 14 m out; every other of yours up the pitch out of the keeper's reach)
      const cb = ms.agents.find(o => o.team === me.team && o.slot === "CB" && o.onPitch && o !== me);
      for (const o of ms.agents) if (o.onPitch && o.role === "player" && o.team === me.team && !o.isGK && o !== me && o !== cb) k.put(o, k.dir*(10 + (o.id % 4)*6), ((o.id % 7) - 3)*9);
      k.put(cb, k.gx + k.dir*16, 6); k.cb = cb.id;
    }), meId);
    const wind = await T.until(() => { const a = window.__k.gk.act; return !!(a && (a.kind === "gkroll" || a.kind === "gkthrow") && !a.done); }, 120);
    const c1 = await page.evaluate(() => Object.assign(window.__k.st(), {cb: window.__k.cb}));
    await page.keyboard.press("r");
    await T.frames(2);
    const c2 = await page.evaluate(() => window.__k.st());
    const got = await T.until(() => { const ms = window.__fp.ms; return ms.poss.ctl === window.__k.cb; }, 300);
    // (his look: as soon as the ball is settled at his feet, the receive's own touch done, and over the few steps a
    // carrier's options are weighed in, brain.js EVAL_SLICE)
    const look = got >= 0 ? await T.until(() => window.__dec.some(d => d.a === window.__k.cb && d.me), 90) : -1;
    const c3 = await page.evaluate(() => window.__k.st());
    const cbId = c1.cb;
    check(wind >= 0 && c1.act && c1.act.recv === cbId && c1.ball === "held", "he winds up a throw or a roll to a centre-back, the ball still in his hands", {wind, act: c1.act, ball: c1.ball, cb: cbId});
    check(c2.n === c1.n + 1 && c2.call && c2.call.agent === meId && c2.call.wait === cbId, "a press of R while he winds up registers, and waits for the man the ball goes to", {n: [c1.n, c2.n], call: c2.call});
    check(got >= 0 && c3.call && c3.call.heard === cbId && c3.dec.some(d => d.a === cbId && d.me), "the centre-back hears it as he has the ball: he looks at once, with you among his options", {got, look, call: c3.call, dec: c3.dec.filter(d => d.a === cbId)});
    check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the browser run finished", String(e.message)); }
  await T.close();
}
process.exit(done() ? 0 : 1);
