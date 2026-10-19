// qa/bcs-integ.mjs: BCS (the better control system), the carry and the shot together (fc27/carry and fc27/shot merged on
// bcs/integ): a shot or a pass let go while carrying the ball in close control, and a fake while carrying.
//
//   The simulation (node, the att-carrier drill on a full pitch, the player's intents as control.js sets them, F taken
//   and the ball carried on along +x at a capped run of 2.4, 3.2 and 4.4 m/s):
//     BI-1 a shot or a pass let go on any step of a stride (24 releases a frame apart) is struck with no touch of his in
//          between: neither the carry's footfall touch (planned for that footfall: keepStep ends close control only
//          after the footfalls, and the touch played the ball out from under the strike) nor any other; close control
//          ends with the kick; never a whiff;
//     BI-2 the shot at 2.4 m/s, and standing with it at his toe, is a step-in (actions.js STEP_IN), struck 0.30 to 0.36 s
//          after it is let go; at 4.4 m/s (the ball rolling on faster than V_ROLL) the reach window's 0.10 to 0.18 s;
//     BI-3 a fake with a drag (A or S) while carrying at 2.4 to 4.4 m/s, W held on or let go for 0.8 s: close control
//          kept, and the carry's footfall touches start again within 1.25 s of the fake's end (2 or more in the 2 s
//          after it). ((BCS sole) changed on purpose from 1.0 s and 3: a drag now lets the ball go rolling the new way
//          and he runs after it (actions.js SOLE), the fake's end is when he has it again, and with W held the other
//          way he turns back with it before the footfalls carry it)
//   The drawn body (the training page stepped frozen, 60 Hz, third person; close control taken with W held, the left
//   button held 0.3 s and let go with W still held), walking with it (X: a step-in) and running with it (4.4 m/s, the
//   reach window):
//     BI-4 the shot's clip begins within a frame of its act; no touch of his between the release and the kick; the
//          kicking foot at the drawn ball at the contact (within 0.12 m of its surface, tr9-anim's); no bone turning
//          more than 0.35 rad in a frame outside 0.12 s either side of the contact;
//     BI-5 the step-in plants and swings: the support foot down and still 0.17 to 0.23 s before the contact (spec 4,
//          fc27-shot SH-1), the top of the backswing 0.07 to 0.13 s before it with the heel 0.35 to 0.65 m up.
//
//   node qa/bcs-integ.mjs [--sim]    exits 1 on any failed check; writes qa/out/bcs-integ.json (--sim: the simulation's
//                                    checks only)
import {simStep} from "../js/life/football/sim.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";
import {freeze, unfreeze} from "./lib.mjs";

const {res, check, done} = checker("bcs-integ");
const SIM_ONLY = process.argv.includes("--sim");
const r3 = v => v == null || !isFinite(v) ? v : Math.round(v*1000)/1000;
const inR = (v, a, b) => v != null && isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9;
const fwdOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});

/* ---------- the simulation ---------- */
// a fresh go on a full pitch: you at x = -40 facing +x with the ball at your feet, nobody else about (fc27-carry's)
function go(){
  const {setup, spec} = setupOf(drill("att-carrier"), 3, cfg => { cfg.pitch = "full"; });
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  me.foot = "R";
  for (const a of ms.agents) if (a !== me && !a.isGK){ a.onPitch = false; a.m.x = 200; a.m.z = 200; }
  me.m.x = -40; me.m.z = 0; me.m.yaw = me.m.heading = -Math.PI/2; me.m.vx = me.m.vz = me.m.speed = 0;
  const f = fwdOf(me.m.yaw);
  ms.ball.p.x = me.m.x + f.x*.35; ms.ball.p.z = me.m.z + f.z*.35; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  ms.poss.ctl = -1;
  return {ms, me};
}
function intent(me, on){
  const I = me.intent;
  I.dx = on ? 1 : 0; I.dz = 0; I.gait = "run"; I.speedCap = Infinity; I.strafe = false; I.knock = false;
  I.face = I.face || {x: 0, z: 0}; const f = on ? {x: 1, z: 0} : fwdOf(me.m.yaw); I.face.x = f.x; I.face.z = f.z;
}
// F at the start, carried on at cap m/s (W held; o.stopAt: no key from then on); at tRel the action let go. Returns
// his touches after it (before the kick, and after the act's end), the kick, the act as it began, how close control ended
function carryAndAct(o){
  const {ms, me} = go();
  me.takeT = ms.t; me.prm.run = o.cap;
  let rel = -1, actEnd = null;
  const out = {before: [], after: [], kick: null, act: null, ctlEnd: null};
  for (let k = 0; k < Math.round((o.tRel + (o.kind === "fake" ? 3.5 : 1.2))/H); k++){
    const keysOff = (o.stopAt != null && ms.t >= o.stopAt && rel < 0) || (o.letGo && rel >= 0 && ms.t - rel < .8);
    intent(me, !keysOff);
    if (rel < 0 && ms.t >= o.tRel - 1e-9){
      rel = ms.t; out.ctlAtRel = !!me.ctlOn;
      const f = fwdOf(me.m.yaw);
      me.intent.action = o.kind === "fake" ? {kind: "fake"} : {kind: o.kind, target: {x: me.m.x + f.x*20, y: .9, z: me.m.z + f.z*20}, recv: -1, power: .85,
        contact: 0, finesse: false, atGoal: true, speed: o.kind === "pass" ? 12 : undefined};
    }
    const e0 = ms.events.length;
    simStep(ms, H);
    if (rel < 0) continue;
    if (!out.act && me.act) out.act = {kind: me.act.kind, stepIn: !!me.act.stepIn, tc: r3(me.act.tc)};
    // (the fake's drag key, as control.js sets it a little after the fake)
    if (o.dir && me.act && me.act.kind === "fake" && !me.act.dir && ms.t - rel > .1){ me.act.dir = o.dir; me.act.dirT = me.act.t; }
    if (actEnd == null && !(me.act && !me.act.done)) actEnd = ms.t;
    for (let i = e0; i < ms.events.length; i++){
      const e = ms.events[i];
      if (e.agent !== me.id) continue;
      if (e.kind === "kick" && !out.kick) out.kick = {t: r3(ms.t - rel), whiff: !!e.whiff};
      if (e.kind === "touch"){
        const tr = {t: r3(ms.t - rel), carry: e.carry || null, fake: e.fake || null};
        if (o.kind !== "fake" && !out.kick) out.before.push(tr);
        else if (actEnd != null) out.after.push(Object.assign(tr, {sinceEnd: r3(ms.t - actEnd)}));
      }
    }
    if (me.ctlEnd && !out.ctlEnd) out.ctlEnd = me.ctlEnd;
  }
  out.ctlOn = !!me.ctlOn;
  return out;
}
{
  const B1 = [], B2 = [];
  for (const kind of ["shot", "pass"]) for (const cap of [2.4, 3.2, 4.4]){
    const R = [];
    for (let j = 0; j < 24; j++) R.push(carryAndAct({kind, cap, tRel: 2.5 + j*H}));
    B1.push({kind, cap, n: R.length, touched: R.filter(r => r.before.length).length, ctlKick: R.filter(r => r.ctlAtRel && r.ctlEnd === "kick").length,
      whiffs: R.filter(r => !r.kick || r.kick.whiff).length, stepIns: R.filter(r => r.act && r.act.stepIn).length,
      kickAt: [r3(Math.min(...R.map(r => r.kick ? r.kick.t : 9))), r3(Math.max(...R.map(r => r.kick ? r.kick.t : 9)))]});
    if (kind === "shot") B2.push(...R.map(r => ({cap, stepIn: !!(r.act && r.act.stepIn), t: r.kick ? r.kick.t : null})));
  }
  res.bi1 = B1;
  check(B1.every(b => b.touched === 0 && b.ctlKick === b.n && b.whiffs === 0),
    "BI-1 a shot or a pass let go on any step of a stride while carrying in close control is struck with no touch of his in between (close control ending with the kick, never a whiff)", B1);
  const stand = carryAndAct({kind: "shot", cap: 4.4, tRel: 3.5, stopAt: 2.0});
  const slow = B2.filter(r => r.cap === 2.4), fast = B2.filter(r => r.cap === 4.4);
  const s2 = {slow: [slow.filter(r => r.stepIn).length, slow.length, r3(Math.min(...slow.map(r => r.t))), r3(Math.max(...slow.map(r => r.t)))],
    fast: [fast.filter(r => !r.stepIn).length, fast.length, r3(Math.min(...fast.map(r => r.t))), r3(Math.max(...fast.map(r => r.t)))], stand: {act: stand.act, kick: stand.kick, before: stand.before}};
  res.bi2 = s2;
  check(slow.every(r => r.stepIn && inR(r.t, .30, .36)) && fast.every(r => !r.stepIn && inR(r.t, .10, .185)) && stand.act && stand.act.stepIn && stand.kick && inR(stand.kick.t, .30, .36) && !stand.before.length,
    "BI-2 carrying at 2.4 m/s or standing with it the shot is a step-in struck 0.30 to 0.36 s after it is let go; at 4.4 m/s the reach window's 0.10 to 0.18 s", s2);
  const B3 = [];
  for (const letGo of [false, true]) for (const cap of [2.4, 3.2, 4.4]) for (const dir of ["a", "s"]){
    const r = carryAndAct({kind: "fake", cap, dir, letGo, tRel: 2.5}), carry = r.after.filter(x => x.carry);
    B3.push({letGo, cap, dir, ctlOn: r.ctlOn, ctlEnd: r.ctlEnd, first: carry.length ? carry[0].sinceEnd : null, in2: carry.filter(x => x.sinceEnd <= 2).length});
  }
  res.bi3 = B3;
  check(B3.every(b => b.ctlOn && !b.ctlEnd && b.first != null && b.first <= 1.25 && b.in2 >= 2),
    "BI-3 a fake with a drag while carrying keeps close control, and the carry's footfall touches start again within 1.25 s of its end (2 or more in the 2 s after)", B3);
}

/* ---------- the drawn body ---------- */
if (!SIM_ONLY){
  const {trainLaunch, titleReady, clickReal} = await import("./tr4b-lib.mjs");
  const t = await trainLaunch({seed: 31});
  const page = t.page;
  const cases = {};
  try {
    // (into Training by its button, with long for the hub to come up on a loaded machine, fc27-shot's)
    await titleReady(page); await clickReal(page, ".ts-train");
    await page.waitForFunction(() => { const r = document.querySelector("#sheetRoot.open"); return !!r && r.dataset.kind === "trainhub" && !!window.__trainHub && window.__trainHub.hubOpen(); }, null, {timeout: 480000});
    await page.evaluate(() => window.__trainHub.closeHub());
    await page.evaluate(async () => {
      const Rn = window.__trainRun, L = window.__life, HM = await import("/js/life/human.js"), MV = await import("/js/life/moves.js");
      const C = await import("/js/life/football/control.js");
      C.saveSet({footCam: "third"});
      const build = (cfg, env) => { const hx = env.spec.hx, me = {slot: "ST", x: -hx + 8, z: 0, yaw: -Math.PI/2}; return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}}; };
      if (!Rn.scenario("qa-bcsi")) Rn.registerScenario({id: "qa-bcsi", category: "attacking", type: "qabcsi", name: "Carry and shoot test", desc: "A test scenario", build});
      const B = HM.BONE, Vec = L.cam.position.constructor, v1 = new Vec();
      const BN = ["hips", "ftL", "toL", "ftR", "toR"];
      const P3 = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
      // carried on in close control (o.walk: X held, a walk; else W alone at o.cap), the left button held o.charge frames
      // and let go, W held all through
      window.__bi = {run(o){
        const T = Rn.RUN.cur.T, ms = T.ms, V = T.V, me = ms.agents[ms.me], R = V.rec[me.id], CT = C.CTRL, P = L.P;
        ms.meAI = false; V.fpOn = false; me.foot = "R";
        P.yaw = me.m.yaw; P.pitch = -.1;
        if (o.cap) me.prm.run = o.cap;
        CT.walk = !!o.walk; CT.held.w = true;
        L.stepN(4); me.takeT = ms.t;
        for (let i = 0; i < (o.carry || 90); i++) L.stepN(1);
        const frames = [], ctl0 = !!me.ctlOn, v0 = +me.m.speed.toFixed(3);
        let prevQ = null, ev0 = ms.events.length, rel = -1;
        for (let j = 0; j < (o.charge || 18) + 50; j++){
          if (j === 0){ CT.lmb = true; CT.lmbT = 0; CT.queue.push({k: "ldown"}); }
          if (j === (o.charge || 18)){ CT.lmb = false; CT.queue.push({k: "lup", t: CT.lmbT}); rel = j; }
          L.stepN(1);
          L.scene().updateMatrixWorld(true);
          const h = R.h, fr = {j, t: +ms.t.toFixed(4), rel: rel >= 0, ev: []};
          for (let i = ev0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.agent !== me.id) continue; if (e.kind === "kick") fr.kick = {whiff: !!e.whiff}; if (e.kind === "touch") fr.ev.push(e.carry || e.how); }
          ev0 = ms.events.length;
          for (const nm of BN){ h.bones[B[nm]].getWorldPosition(v1); fr[nm] = P3(v1); }
          fr.laces = P3(MV.partPoint(h, "laces", "R"));
          fr.ball = P3(V.ball.mesh.position);
          const q = h.bones.map(x => x.quaternion.clone());
          if (prevQ){ let m = 0; for (let i = 0; i < q.length; i++) m = Math.max(m, q[i].angleTo(prevQ[i])); fr.turn = +m.toFixed(4); }
          prevQ = q;
          fr.clip = !!(h.mv && h.mv.key === "strike" && h.mode === "strike");
          fr.act = me.act ? {kind: me.act.kind, stepIn: !!me.act.stepIn, done: !!me.act.done} : null;
          fr.ctl = !!me.ctlOn;
          frames.push(fr);
        }
        CT.held.w = false; CT.walk = false;
        return {frames, ctl0, v0};
      }};
    });
    for (const [k, o] of Object.entries({walk: {walk: true}, run: {cap: 4.4}})){
      await page.evaluate(() => { const R = window.__trainRun; if (R.RUN.cur) R.stopScenario("restart"); return R.startScenario("qa-bcsi", {}); });
      await unfreeze(page);
      await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 300000});
      await freeze(page);
      cases[k] = await page.evaluate(o => window.__bi.run(o), o);
    }
  } catch(e){ check(false, "ran", String(e && e.stack || e)); }
  check(!t.errors.length, "zero console and page errors", t.errors.slice(0, 5));
  await t.close();
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(a[0], a[1], a[2]), hz = a => Math.hypot(a[0], a[2]);
  const M = {};
  for (const [k, c] of Object.entries(cases)){
    const F = c.frames, jr = F.findIndex(f => f.rel), jc = F.findIndex(f => f.kick && !f.kick.whiff);
    if (jc < 0){ M[k] = {err: "no kick", ctl0: c.ctl0, v0: c.v0}; continue; }
    const tOf = j => F[j].t - F[jc].t, fc = F[jc], bc = fc.ball;
    const jA = F.findIndex(f => f.act && f.act.kind === "kick"), jC = F.findIndex(f => f.clip);
    const touched = F.slice(jr, jc + 1).flatMap(f => f.ev);
    const nearest = Math.min(...["ftR", "toR"].map(n => len(sub(fc[n], bc)) - .11)), laces = len(sub(fc.laces, bc)) - .11;
    let turn = 0;
    for (let j = 1; j < F.length; j++) if (Math.abs(tOf(j)) >= .12 && F[j].turn != null) turn = Math.max(turn, F[j].turn);
    // the plant: the support (left) ankle down and still from then to the contact
    const aS = fc.ftL[1];
    let jp = jc;
    while (jp > 0 && F[jp - 1].ftL[1] <= aS + .02 && hz(sub(F[jp - 1].ftL, fc.ftL)) < .012) jp--;
    // the top of the backswing: the kicking ankle at its highest from the clip's start to the contact
    let jt = -1, yt = -1;
    for (let j = Math.max(0, jC); j < jc; j++) if (F[j].ftR[1] > yt){ yt = F[j].ftR[1]; jt = j; }
    M[k] = {ctl0: c.ctl0, v0: c.v0, stepIn: !!(fc.act && fc.act.stepIn), relToKick: r3(F[jc].t - F[jr].t + 1/60), gap: jA >= 0 && jC >= 0 ? jC - jA : null, touched,
      nearest: r3(nearest), laces: r3(laces), turn: r3(turn), plant: r3(tOf(jp)), top: jt >= 0 ? r3(tOf(jt)) : null, heel: r3(yt)};
  }
  res.drawn = M;
  console.log(JSON.stringify(M));
  const W = M.walk || {}, Rn = M.run || {};
  check(W.ctl0 && Rn.ctl0 && [W, Rn].every(m => m.gap != null && m.gap >= 0 && m.gap <= 1 && m.touched && !m.touched.length && m.nearest <= .12 && m.turn <= .35),
    "BI-4 in close control, walking and running with it: the shot's clip begins within a frame of its act, no touch of his between the release and the kick, the kicking foot at the drawn ball at the contact (0.12 m), no bone over 0.35 rad a frame away from it", M);
  check(W.stepIn && inR(W.relToKick, .30, .36) && inR(W.plant, -.23, -.17) && inR(W.top, -.13, -.07) && inR(W.heel, .35, .65),
    "BI-5 the step-in from close control plants and swings: the support foot down and still 0.17 to 0.23 s before the contact, the top of the backswing 0.07 to 0.13 s before it, the heel 0.35 to 0.65 m up", W);
}
process.exit(done() ? 0 : 1);
