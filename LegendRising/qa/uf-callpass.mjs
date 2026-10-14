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
// The root causes it guards: the call was sent on the key's release (a release lost to a cut or a reset sent nothing),
// a second press within 4 s was dropped without a word, and the carrier only weighed a call as a few per cent on a pass
// that was already nearly his best, on his own cadence, and not at all once the preference cap had tripped.
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
    const res = {presses: 0, registered: 0, logged: 0, simCall: 0, arm: 0, hud: 0, mateCarrier: 0, considered: 0, sprinting: 0, quick: 0, misses: []};
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
          dec: window.__dec.slice(dec0)};
      }, [before.meId, before.dec]);
      const reg = after.n === before.n + 1, logged = after.ev === before.ev + 1, sim = !!after.call && after.call.agent === before.meId && after.t - after.call.t < .2;
      const arm = after.lastCall != null && after.t - after.lastCall < .2, hud = after.lineOn && /Here!/.test(after.line);
      if (reg) res.registered++; if (logged) res.logged++; if (sim) res.simCall++; if (arm) res.arm++; if (hud) res.hud++;
      if (!(reg && logged && sim && arm && hud) && res.misses.length < 5) res.misses.push({i, reg, logged, sim, arm, hud, line: after.line});
      // a team-mate on the ball: his next look comes at once, with you among his options
      // (one already striking the ball has played it: his pass is on its way, there is nothing left to weigh; and a
      // pass is an option from 4 to 52 m, brain.js PASS_MIN and PASS_MAX, to where you will be: 5 to 50 m here)
      const striking = before.cAct === "kick" || before.cd < 5 || before.cd > 50;
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
    check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the browser run finished", String(e.message)); }
  await T.close();
}
process.exit(done() ? 0 : 1);
