// qa/tr6-receive.mjs: Ball Receiving and First Touch under node, with input bots on the real controls.
// Owner: P6-A (Training Mode Phase 6). Contract: BUILD-PLAN P6-A acceptance "qa/tr6-receive.mjs" (Node with controlStep
// bots, about 40 variants x 5 seeds); TRAINING-SPEC 3 (control zone R, q, touch distance, the part from the real
// height) and 5 (every receiving variant).
//
// Each variant is a drill of receive.js (its configuration, sometimes with a change), played as the runner plays it
// (qa/tr6-lib.mjs: the setup, the feed of feeder.js, the judge) by a bot that presses keys and moves the mouse through
// control.js controlInput, the way the page hands it a player's input: it runs, looks, holds F for the foot, presses
// Space with F for a cushioned header, taps RMB or swings LMB for a first-time pass or shot, and after the touch does
// what the drill asks (turn, sprint, pass, cross, shoot).
//   1. control happens inside R: at every control touch the ball is inside the receiver's control radius (zone.js R for
//      the ball as it is then, or where it is later in that step, as actions.js envAhead takes it);
//   2. the touch rests at touchDist(q) +-0.3 m in the intended direction: the touch's way is the bot's own (its keys,
//      else its look) within 12 degrees, and the ball's farthest lead over him along it (its flight from the touch on
//      open grass, him running on as he was) is within 0.3 m of the touch distance, in at least 85% of the touches;
//   3. queued first-time passes and shots fire (a kick of the receiver's with no touch before it, in at least 80% of
//      their runs);
//   4. the body part follows the real height: every control's part is touch.js touchPart's for the ball's height and
//      side then and what he meant (F held: the foot), and inside its band (foot to 1.05 m, thigh 0.4 to 0.95, chest
//      0.75 to 1.4, scaled);
//   5. a cushioned header leaves the ball at 3 m/s or less (and the drill gets one);
//   6. pressure lowers q: the same drills with a defender on him against without, over the same seeds;
//   7. no NaN anywhere; every variant decided (no go runs out of time);
//   8. results logged per variant (qa/out/tr6-receive.json).
//
//   node qa/tr6-receive.mjs [filter]      exits 1 on any failed check
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as L from "./tr6-lib.mjs";
import * as RC from "../js/life/train/receive.js";
import * as CT from "../js/life/football/control.js";
import {P} from "../js/life/core/state.js";
import {predAt} from "../js/life/football/actions.js";
import {R as zoneR, touchDist} from "../js/life/football/zone.js";
import {touchPart, TOUCH} from "../js/life/football/touch.js";
import {yawOf, dirOf, wrapA} from "../js/life/football/pitchspec.js";
import {createBall, createBallWorld, ballStep, BALL} from "../js/life/football/ball.js";
import {presetSkills} from "../js/life/football/attrs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILTER = process.argv[2] || "";
const SEEDS = [1, 2, 3, 4, 5];
const H = L.H, G = 9.81, R = BALL.R;
const res = {name:"tr6-receive", checks:[], variants:{}, ok:true};
const check = (pass, name, value) => {
  res.checks.push({name, pass:!!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value).slice(0, 1500)}`);
};
const r3 = v => Math.round(v*1000)/1000;

/* ---------- the variants: the drills, and a few changed ---------- */
const V = [];
for (const d of RC.DRILLS) V.push({id:d.id.replace("receive-", ""), drill:d.id});
const ctrlMe = lvl => ({me:Object.assign(presetSkills(lvl), {height:1.8, prefFoot:"Right"})});
V.push({id:"feet-low", drill:"receive-feet", extra:ctrlMe("low")});
V.push({id:"feet-max", drill:"receive-feet", extra:ctrlMe("max")});
V.push({id:"pressure-none", drill:"receive-pressure", extra:{opps:false}, pairOf:"pressure"});
V.push({id:"shield-none", drill:"receive-shield", extra:{opps:false}, pairOf:"shield"});
V.push({id:"chest-moving", drill:"receive-chest", extra:{opts:{move:"jog", facing:"goal", from:"angleL"}}});
V.push({id:"thigh-side", drill:"receive-thigh", extra:{opts:{from:"left"}}});
V.push({id:"passer-ground", drill:"receive-feet", extra:{mates:true}});
V.push({id:"passer-cross", drill:"receive-chest", extra:{mates:true}});

/* ---------- the bot: real input through controlInput ---------- */
function bot(){
  const held = new Set();
  let lmb = false, rmb = false;
  const B = {
    keys(want){
      for (const k of [...held]) if (!want.includes(k)){ CT.controlInput({type:"keyup", key:k}); held.delete(k); }
      for (const k of want) if (!held.has(k)){ CT.controlInput({type:"keydown", key:k}); held.add(k); }
    },
    tap(k){ CT.controlInput({type:"keydown", key:k}); CT.controlInput({type:"keyup", key:k}); held.delete(k); },
    mouse(btn, down){
      if (btn === 0){ if (down === lmb) return; lmb = down; } else { if (down === rmb) return; rmb = down; }
      CT.controlInput({type:down ? "down" : "up", button:btn});
    },
    get lmb(){ return lmb; }, get rmb(){ return rmb; },
    release(){ B.keys([]); B.mouse(0, false); B.mouse(2, false); }
  };
  return B;
}
// the keys (of W A S D) that move along a world direction for a look yaw: the nearest of the eight
function keysFor(dx, dz, yaw){
  const l = Math.hypot(dx, dz); if (l < 1e-6) return [];
  const f = dirOf(yaw), rx = -f.z, rz = f.x;
  const fw = (dx*f.x + dz*f.z)/l, rt = (dx*rx + dz*rz)/l, k = [];
  if (fw > 0.38) k.push("w"); else if (fw < -0.38) k.push("s");
  if (rt > 0.38) k.push("d"); else if (rt < -0.38) k.push("a");
  return k;
}
const turnTo = (from, to, max) => from + Math.max(-max, Math.min(max, wrapA(to - from)));
// the ball's closest approach to a point within t seconds (the prediction): {t, x, z, y, d}
function meetOf(ms, px, pz, tMax = 2, vx = 0, vz = 0){
  const Q = {x:0, y:0, z:0};
  let best = null;
  for (let i = 1; i <= tMax*30; i++){
    const t = i/30; predAt(ms, t, Q);
    const d = Math.hypot(Q.x - px - vx*t, Q.z - pz - vz*t);
    if (!best || d < best.d) best = {t, x:Q.x, z:Q.z, y:Q.y, d};
  }
  return best;
}

/* one run of a variant: the bot plays it, the checks' readings are taken */
function run(v, seed){
  const extra = Object.assign({}, v.extra || {}, {seed});
  if (v.extra && v.extra.opts) extra.opts = v.extra.opts;
  const cfg = RC.drillConfig(v.drill, extra);
  const g = L.go(cfg), {ms, me, spec} = g;
  const B = bot();
  const st = {headed:false, firstDown:-1, lmbAt:-1, rmbAt:-1, then:0, crossSet:false};
  const out = {controls:[], heads:[], kicks:[], verdict:null, nan:false, intendedOk:null, lead:null};
  const goalYaw = () => yawOf(ms.dirs[me.team]*spec.hx - me.m.x, -me.m.z);
  let Gs = null, verdict = null, intended = null;
  const pre = {p:{x:0, y:0, z:0}, v:{x:0, y:0, z:0}};
  for (let i = 0; i < 60*14 && !verdict; i++){
    Gs = Gs || RC.goState(ms, cfg, spec);
    const P0 = Gs.P, o = P0.o, rcv = P0.receive, b = ms.ball;
    const fed = Gs.feed.state === "flight";
    const ctl = !!Gs.ctl;
    const keys = [];
    let look = P.yaw;
    if (!ctl){
      // before the touch
      if (o.move === "jog" || o.move === "sprint"){ look = yawOf(rcv.run.x, rcv.run.z); keys.push("w"); if (o.move === "sprint") keys.push("shift"); }
      else if (o.move === "side"){ look = P.yaw; keys.push(...keysFor(rcv.run.x, rcv.run.z, look)); }
      else if (fed){
        // standing (or turning): watch the ball come, step to where it will pass if it is off your line
        look = turnTo(P.yaw, yawOf(b.p.x - me.m.x, b.p.z - me.m.z), o.move === "turn" ? 6*H : 12*H);
        const m = meetOf(ms, me.m.x, me.m.z, 1.6);
        if (m && m.d > 0.45 && m.t > 0.15) keys.push(...keysFor(m.x - me.m.x, m.z - me.m.z, look));
      }
      // a defender behind you: take it away from him, across you
      if (fed && g.s.opps.length && !keys.length){
        const d = ms.agents.find(a => a.team !== me.team && a.role === "player" && !a.isGK);
        if (d){ const f = dirOf(look), side = (d.m.x - me.m.x)*(-f.z) + (d.m.z - me.m.z)*f.x; const m = meetOf(ms, me.m.x, me.m.z, 1.2); if (m && m.t < 0.5) keys.push(side > 0 ? "a" : "d"); }
      }
      if (rcv.want === "foot") keys.push("f");
      if (rcv.shield) keys.push("c");
      // a header: Space as the ball comes into head reach (F held: cushioned down; RMB held: on to the man)
      const Rz = CT.CTRL.resolve;
      if (fed && !st.headed && (rcv.want === "head" || rcv.then === "redirect") && Rz && Rz.kind === "header" && Rz.tc < 0.5){
        if (rcv.then === "redirect"){ const pa = ms.agents[Gs.passer]; if (pa) look = yawOf(pa.m.x - me.m.x, pa.m.z - me.m.z); B.mouse(2, true); }
        else keys.push("f");
        st.headed = true; st.headT = ms.t; st.space = true;
      }
      // a first-time pass back to the passer, or a first-time shot at goal: pressed as it comes
      if (fed && (rcv.then === "firstPass" || rcv.then === "firstShot")){
        const m = meetOf(ms, me.m.x, me.m.z, 1.5);
        if (rcv.then === "firstPass"){ const pa = ms.agents[Gs.passer]; if (pa) look = yawOf(pa.m.x - me.m.x, pa.m.z - me.m.z); if (m && m.t < 0.55 && st.rmbAt < 0){ B.mouse(2, true); st.rmbAt = ms.t; } }
        else { look = goalYaw(); P.pitch = -0.02; if (m && m.t < 0.8 && st.lmbAt < 0){ B.mouse(0, true); st.lmbAt = ms.t; } }
      }
      if (st.rmbAt >= 0 && ms.t - st.rmbAt > 0.05 && rcv.then !== "redirect") B.mouse(2, false);
      if (st.lmbAt >= 0 && ms.t - st.lmbAt > 0.3) B.mouse(0, false);
      if (st.headed && ms.t - st.headT > 0.6) B.mouse(2, false);
    } else {
      // after the touch: what the drill asks
      const tc = ms.t - Gs.ctlAt;
      if (rcv.then === "keep"){ if (o.move === "jog" || o.move === "sprint") keys.push("w"); }
      else if (rcv.then === "turn"){ look = turnTo(P.yaw, goalYaw(), 5*H); if (tc > 0.2) keys.push("w"); }
      else if (rcv.then === "sprint"){ look = turnTo(P.yaw, goalYaw(), 6*H); keys.push("w", "shift"); }
      else if (rcv.then === "pass" || rcv.then === "through" || rcv.then === "cross"){
        const pa = ms.agents[Gs.passer];
        if (rcv.then === "cross" && !st.crossSet){ B.tap("3"); st.crossSet = true; }
        if (pa) look = turnTo(P.yaw, yawOf(pa.m.x - me.m.x, pa.m.z - me.m.z), 8*H);
        if (tc > 0.6 && st.rmbAt < 0){ B.mouse(2, true); st.rmbAt = ms.t; }
        if (st.rmbAt >= 0 && ms.t - st.rmbAt > 0.06) B.mouse(2, false);
      } else if (rcv.then === "shoot"){
        look = turnTo(P.yaw, goalYaw(), 6*H); P.pitch = -0.02;
        if (tc > 0.5 && Math.abs(wrapA(P.yaw - goalYaw())) < 0.2 && st.lmbAt < 0){ B.mouse(0, true); st.lmbAt = ms.t; }
        if (st.lmbAt >= 0 && ms.t - st.lmbAt > 0.4) B.mouse(0, false);
      }
      if (rcv.shield) keys.push("c");
    }
    P.yaw = look;
    B.keys(keys);
    if (st.space){ B.tap(" "); st.space = false; }
    // the touch's way as the bot means it: its keys, else its look
    const mv = keys.filter(k => "wasd".includes(k));
    if (mv.length){ const f = (mv.includes("w") ? 1 : 0) - (mv.includes("s") ? 1 : 0), r = (mv.includes("d") ? 1 : 0) - (mv.includes("a") ? 1 : 0), l = Math.hypot(f, r) || 1, s = Math.sin(P.yaw), c = Math.cos(P.yaw); intended = {x:(r*c - f*s)/l, z:(-r*s - f*c)/l}; }
    else { const d = dirOf(P.yaw); intended = {x:d.x, z:d.z}; }
    // the ball before the step (the touch is taken on it), then the step
    const b0 = ms.ball; pre.p.x = b0.p.x; pre.p.y = b0.p.y; pre.p.z = b0.p.z; pre.v.x = b0.v.x; pre.v.y = b0.v.y; pre.v.z = b0.v.z;
    const nEv = ms.events.length, intendedNow = intended;
    L.step(g);
    for (let k = nEv; k < ms.events.length; k++){
      const e = ms.events[k];
      if (e.agent !== me.id) continue;
      if (e.kind === "touch" && e.how === "control"){
        // R: the ball as it was, or later in the step (envAhead's halves)
        let inR = false, Rv = 0, dv = 0, at = null;
        for (const f of [0, 0.5, 1]){
          const t = f*H, bp = {p:{x:pre.p.x + pre.v.x*t, y:pre.p.y + pre.v.y*t - (pre.p.y > R + 0.01 ? 0.5*G*t*t : 0), z:pre.p.z + pre.v.z*t}, v:pre.v};
          const r = zoneR(me, bp, ms), d = Math.hypot(bp.p.x - me.m.x, bp.p.z - me.m.z);
          if (d <= r + 1e-6){ inR = true; Rv = r; dv = d; at = bp; break; }
          if (!Rv){ Rv = r; dv = d; at = bp; }
        }
        const want = me.plan && me.plan.part || (rcv.want === "foot" ? "foot" : null);
        // the height where it was taken (as the engine takes it: now, or later in the step), and the part for it
        const y = at.p.y - (me.y || 0), sc = me.scale || 1;
        const expect = touchPart(me, at, rcv.want === "foot" ? "foot" : null);
        const band = e.part === "foot" ? y <= TOUCH.FOOT_AIR*sc + 0.02 : e.part === "thigh" ? y >= 0.38*sc && y <= 0.97*sc : e.part === "chest" ? y >= 0.73*sc && y <= 1.42*sc : false;
        // the touch's way against the bot's, and its lead (the ball flown from the touch, him running on)
        const ang = Math.acos(Math.max(-1, Math.min(1, (e.dx*intendedNow.x + e.dz*intendedNow.z)))) * 180/Math.PI;
        const lead = touchLead(ms.ball, me, e.dx, e.dz, spec);
        out.controls.push({t:r3(ms.t), part:e.part, expect:(expect === "head" ? "chest" : expect), band, y:r3(y), inR, R:r3(Rv), d:r3(dv), q:e.quality, td:e.td, lead:r3(lead), ang:r3(ang), heavy:e.heavy, want});
        void want;
      }
      if (e.kind === "kick"){
        const before = out.controls.length;
        out.kicks.push({intent:e.intent, speed:e.speed, firstTime:e.firstTime, afterControl:before > 0, t:r3(ms.t)});
        if (e.intent === "header") out.heads.push({speed:e.speed, cushion:rcv.want === "head"});
      }
    }
    verdict = RC.judge(ms, Gs);
    // no NaN anywhere
    for (const a of ms.agents){ if (!(Number.isFinite(a.m.x) && Number.isFinite(a.m.z) && Number.isFinite(a.m.yaw))) out.nan = true; }
    const bb = ms.ball; if (!(Number.isFinite(bb.p.x) && Number.isFinite(bb.p.y) && Number.isFinite(bb.p.z) && Number.isFinite(bb.v.x))) out.nan = true;
  }
  B.release();
  out.verdict = verdict;
  out.feed = Gs ? {plan:Gs.feed.plan ? {speed:r3(Gs.feed.plan.speed), apex:r3(Gs.feed.plan.apex)} : null, kick:Gs.feed.kick ? {agent:Gs.feed.kick.agent, speed:Gs.feed.kick.speed} : null, apex:r3(Gs.feed.apex)} : null;
  return out;
}
// the touch's own lead: the ball as the first touch left it, flown on the pitch (ball.js) while he runs on at his speed
// along the touch's way, its farthest lead over him (his later dribble touches do not cut it short)
function touchLead(ball, me, kx, kz, spec){
  const OPEN = createBallWorld({});
  const c = createBall({x:ball.p.x, y:ball.p.y, z:ball.p.z, rollDecel:ball.rollDecel});
  c.v.x = ball.v.x; c.v.y = ball.v.y; c.v.z = ball.v.z; c.state = "free"; c.grounded = ball.grounded;
  const vx = me.m.vx, vz = me.m.vz;
  // (the step has already moved the ball once since the touch: the lead is measured from the body as it was then)
  let peak = (c.p.x - me.m.x)*kx + (c.p.z - me.m.z)*kz;
  for (let i = 1; i <= 150; i++){
    ballStep(c, OPEN, H);
    const lead = (c.p.x - me.m.x - vx*i*H)*kx + (c.p.z - me.m.z - vz*i*H)*kz;
    if (lead > peak) peak = lead;
  }
  void spec;
  return peak;
}

/* ---------- the runs ---------- */
const all = [];
for (const v of V){
  if (FILTER && !v.id.includes(FILTER)) continue;
  const runs = SEEDS.map(s => run(v, s));
  const ctl = runs.flatMap(r => r.controls);
  const okN = runs.filter(r => r.verdict && r.verdict.ok).length;
  const qs = ctl.map(c => c.q).filter(Number.isFinite);
  res.variants[v.id] = {drill:v.drill, ok:`${okN}/${runs.length}`, verdicts:runs.map(r => r.verdict ? `${r.verdict.ok ? "ok" : "no"}:${r.verdict.why}` : "none"),
    parts:ctl.map(c => c.part), meanQ:qs.length ? r3(qs.reduce((a, b) => a + b, 0)/qs.length) : null, heads:runs.flatMap(r => r.heads.map(h => h.speed)),
    feed:runs[0].feed, firsts:runs.map(r => r.kicks.filter(k => !k.afterControl).map(k => k.intent).join("+"))};
  console.log(`  ${v.id.padEnd(16)} ${res.variants[v.id].ok} ${res.variants[v.id].verdicts.join(" ")} q=${res.variants[v.id].meanQ} parts=${[...new Set(res.variants[v.id].parts)].join("/")}`);
  all.push({v, runs});
}
const runsOf = id => (all.find(x => x.v.id === id) || {runs:[]}).runs;
const allCtl = all.flatMap(x => x.runs.flatMap(r => r.controls.map(c => Object.assign({id:x.v.id}, c))));

// 1. control inside R
const outR = allCtl.filter(c => !c.inR);
check(allCtl.length > 100 && !outR.length, "every control touch is taken with the ball inside the receiver's control radius R", {controls:allCtl.length, outside:outR.slice(0, 6)});
// 2. the touch rests at touchDist +-0.3 m in the intended direction (keep drills on the ground and in the air)
const keepIds = new Set(all.filter(x => RC.drillConfig(x.v.drill, x.v.extra || {}).opts.then === "keep").map(x => x.v.id));
const keepCtl = allCtl.filter(c => keepIds.has(c.id));
const wayOk = keepCtl.filter(c => c.ang <= 12), leadOk = keepCtl.filter(c => c.ang <= 12 && Math.abs(c.lead - c.td) <= 0.3);
check(keepCtl.length > 40 && wayOk.length >= 0.95*keepCtl.length && leadOk.length >= 0.85*keepCtl.length,
  "the touch goes the way the bot meant (its keys, else its look) and rests at touchDist(q) within 0.3 m (85% of the touches)",
  {touches:keepCtl.length, way:r3(wayOk.length/Math.max(1, keepCtl.length)), lead:r3(leadOk.length/Math.max(1, keepCtl.length)),
    worst:keepCtl.filter(c => !(c.ang <= 12 && Math.abs(c.lead - c.td) <= 0.3)).slice(0, 8).map(c => ({id:c.id, part:c.part, ang:c.ang, lead:c.lead, td:c.td}))});
// 3. queued first-time passes and shots fire
const firstRow = id => runsOf(id).map(r => r.kicks.find(k => !k.afterControl && k.firstTime !== false && (id === "firstpass" ? /pass|through|lob|cross/.test(k.intent) : k.intent === "shot")));
const fp = firstRow("firstpass"), fs2 = firstRow("firstshot");
check(fp.filter(Boolean).length >= 4 && fs2.filter(Boolean).length >= 4, "a first-time pass and a first-time shot queued as the ball comes are struck first time (4 of 5 runs each)",
  {pass:fp.map(k => k ? k.intent : null), shot:fs2.map(k => k ? k.intent : null)});
// 4. the body part follows the real height
const badPart = allCtl.filter(c => c.part !== c.expect || !c.band);
const partsSeen = new Set(allCtl.map(c => c.part));
check(!badPart.length && partsSeen.has("foot") && partsSeen.has("thigh") && partsSeen.has("chest"),
  "every control is made with the part the ball's real height and side give (foot, thigh, chest; the foot raised for a ball out to the side or when asked for)",
  {parts:[...partsSeen], bad:badPart.slice(0, 6)});
const footAir = runsOf("footair").flatMap(r => r.controls).filter(c => c.part === "foot" && c.y > 0.45);
check(footAir.length >= 3, "the raised foot controls an aerial ball above 0.45 m (foot control of an aerial ball)", footAir.map(c => c.y));
// 5. a cushioned header leaves the ball at 3 m/s or less
const cush = runsOf("headdown").flatMap(r => r.heads);
check(cush.length >= 4 && cush.every(h => h.speed <= 3.0), "a cushioned header (F + Space) leaves the ball at 3 m/s or less", cush.map(h => h.speed));
const headOn = runsOf("headon").flatMap(r => r.heads);
check(headOn.length >= 4 && headOn.every(h => h.speed > 3.0), "a header on (RMB + Space) is struck, not cushioned", headOn.map(h => h.speed));
// 6. pressure lowers q
const meanQ = id => { const q = runsOf(id).flatMap(r => r.controls.map(c => c.q)); return q.length ? q.reduce((a, b) => a + b, 0)/q.length : NaN; };
const pq = [["pressure", "pressure-none"], ["shield", "shield-none"]].map(([a, b]) => ({with:r3(meanQ(a)), without:r3(meanQ(b))}));
check(pq.every(p => p.with < p.without - 0.02), "a defender on him lowers the touch's q against the same drill without one", pq);
const ctrlQ = {low:r3(meanQ("feet-low")), avg:r3(meanQ("feet")), max:r3(meanQ("feet-max"))};
check(ctrlQ.low < ctrlQ.avg && ctrlQ.avg < ctrlQ.max, "q rises with his control attributes (low, average, max)", ctrlQ);
// 7. no NaN, every variant decided, and the feeds: the passer's own strike plays the planned launch
const nan = all.flatMap(x => x.runs.filter(r => r.nan).map(() => x.v.id));
const undecided = all.flatMap(x => x.runs.filter(r => !r.verdict).map(() => x.v.id));
check(!nan.length && !undecided.length, "no NaN anywhere, and every go is decided", {nan, undecided});
const feeds = all.flatMap(x => x.runs.map(r => Object.assign({id:x.v.id}, r.feed))).filter(f => f.kick);
const feedBad = feeds.filter(f => Math.abs(f.kick.speed - f.plan.speed) > 0.02*f.plan.speed || Math.abs(f.apex - f.plan.apex) > 0.05);
check(feeds.length >= all.length*4 && !feedBad.length, "every feed (the coach's and the passer's own strike) flies the planned launch: speed within 2%, apex within 5 cm",
  {feeds:feeds.length, bad:feedBad.slice(0, 6), passer:feeds.filter(f => f.kick.agent >= 0).length});
const okAll = all.map(x => ({id:x.v.id, ok:x.runs.filter(r => r.verdict && r.verdict.ok).length}));
res.summary = okAll;
const playable = okAll.filter(x => x.ok >= 1).length;
check(playable >= 0.85*okAll.length, "the bot completes most drills at least once (each drill can be done)", okAll.filter(x => x.ok === 0).map(x => x.id));

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive:true});
fs.writeFileSync(path.join(ROOT, "qa/out/tr6-receive.json"), JSON.stringify(res, null, 1));
console.log(`tr6-receive: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
