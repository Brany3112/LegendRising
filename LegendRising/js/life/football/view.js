/* ============ Football: the match as you see it ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (view.js: viewInit, viewFrame, viewDispose), 3.5.9 (match bodies),
   1.4.3 (SCHED decides the tier, animateHuman executes it), 1.4.18 (the football and keeper modes of moves.js and
   gkmoves.js); D14 (the spare balls on their cones).

   One human() body per agent where the simulation has it, drawn between its last two fixed steps (alpha), facing its
   mover's yaw, posed with the state the simulation is in: locomotion at its speed; a strike with its contact scheduled
   from the simulation's own contact step ((contact - now) in seconds, the clip slowing or hurrying to meet it); a
   receive, a header off the same jump, a tackle, a slide along the same curve, a throw-in; the keeper's ready stance,
   his split step and his dive from the very plan the keeper's brain dives by (gkplan.js), with the outcome the
   simulation gave it. The officials, the assistant's flag, celebrations after a goal. The ball where the simulation
   has it, spinning as it does; the spare balls on their cones while the simulation keeps them there.
   Your own body: the whole of you is the agent's body (hidden in your eyes, seen in a replay); in your eyes a headless
   first-person body with your face's skin and the kit, so looking down shows your legs, your boots and the ball.
   A replay (replay.js) hands this view snapshots instead of the live state: the same bodies, posed from the record. */
import {THREE} from "../build.js";
import {human, animateHuman, lookFor, EV} from "../human.js";
import {SCHED} from "../core/sched.js";
import {ballMesh} from "./pitchmesh.js";
import {STADIUM} from "./stadium.js";
import {predAt} from "./actions.js";
import {kindOf} from "../moves.js";
import "../gkmoves.js";
import {dirOf} from "./pitchspec.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const H = 1/60;
const CELEB = ["armsUp", "fistPump", "runArmsOut", "kneeSlide"];

/* ---------- looks ---------- */
// the kits of a match: {home:[shirt, shorts], away:[...]} from the configuration's teams; keepers and officials in
// colours clear of both (clashFree through lookFor's avoid)
export function matchLooks(ms, kits, meLook){
  const K = [kits.home || ["#2c66b8", "#ffffff"], kits.away || ["#c8463a", "#ffffff"]];
  const kitCols = [K[0][0], K[0][1], K[1][0], K[1][1]];
  const gk = [null, null];
  for (const t of [0, 1]){
    const id = ms.gks[t] >= 0 ? ms.gks[t] : t;
    const a = ms.agents[id] || {pid:t, number:1};
    const avoid = kitCols.concat(t === 1 && gk[0] ? [gk[0].outfit.shirt] : []);
    gk[t] = lookFor("goalkeeper", (a.pid > 0 ? a.pid : 3 + t) % 100000, {kit:K[t], avoid, number:a.number || 1, sex:"m"});
  }
  const offAvoid = kitCols.concat([gk[0].outfit.shirt, gk[1].outfit.shirt]);
  const of = (a, p) => {
    if (a.role === "referee") return lookFor("referee", 22, {avoid:offAvoid, sex:"m"});
    if (a.role === "ar") return lookFor("linesman", a.id, {avoid:offAvoid, sex:"m"});
    if (a.isMe && meLook) return meLook;
    if (a.isGK || (p && p.isGK)) return lookFor("goalkeeper", ((a.pid > 0 ? a.pid : a.id) % 100000), {kit:K[a.team], avoid:offAvoid.concat([gk[1 - a.team].outfit.shirt]), number:a.number || 1, sex:"m"});
    return lookFor("footballer", a.pid > 0 ? a.pid % 100000 : a.id + 1, {kit:K[a.team], number:a.number || 0, sex:"m"});
  };
  return {of, gk, K};
}
// every look a match will need, the substitutes' too (for prebuildHumans behind the travel card)
export function looksOf(ms, kits, meLook){
  const L = matchLooks(ms, kits, meLook), out = [];
  for (const a of ms.agents) if (a.role !== "off") out.push(a.isGK && ms.gks[a.team] === a.id ? L.gk[a.team] : L.of(a));
  for (const t of [0, 1]) for (const p of ms.bench[t]) out.push(L.of({team:t, pid:p.pid, id:p.pid, number:p.number, isMe:p.isMe, isGK:p.isGK, role:"player"}, p));
  return out;
}

/* ---------- the view ---------- */
export function viewInit(ms, scene, kits, o = {}){
  const L = matchLooks(ms, kits, o.meLook);
  const V = {ms, scene, L, rec:[], ball:null, extra:[], alpha:0, src:null, fpOn:true, me:-1, fp:null, fpLook:o.meFPLook || o.meLook || null,
    clipN:0, goals:[], saves:new Map(), celebUntil:0, flagUntil:[0, 0], t:0, hideAll:false, offs:[],
    // where the view's group sits in the world (a training item's frame: o.frame {cx, cz}; a match is at the origin),
    // so the scheduler's tiers go by real distance; lookOf(agent): a look of the agent's own (a borrowed squad body)
    ox:o.frame ? +o.frame.cx || 0 : 0, oz:o.frame ? +o.frame.cz || 0 : 0, lookOf:typeof o.lookOf === "function" ? o.lookOf : null};
  const b = ballMesh({shadow:true});
  b.mesh.matrixAutoUpdate = true;
  scene.add(b.mesh);
  V.ball = b;
  V.ballPrev = {x:ms.ball.p.x, y:ms.ball.p.y, z:ms.ball.p.z};
  for (const a of ms.agents) if (a.role !== "off") bodyFor(V, a);
  return V;
}
// one agent's body, made the first time it is needed (a substitute coming on)
function bodyFor(V, a){
  let R = V.rec[a.id];
  if (R) return R;
  const ms = V.ms;
  const own = V.lookOf ? V.lookOf(a) : null;
  const look = own || (a.isGK && ms.gks[a.team] === a.id ? V.L.gk[a.team] : V.L.of(a));
  const h = human(look, {cast:true});
  h.g.name = a.isMe ? "match-me" : "match-" + a.id;
  V.scene.add(h.g);
  R = V.rec[a.id] = {a, h, st:{mode:"move", speed:0}, clip:null, actRef:null, kind:"", recv:null, cel:null, x:a.m.x, z:a.m.z, actor:null, hidden:false, wpos:{x:0, y:0, z:0}};
  R.actor = SCHED.actor({id:"match-" + a.id, kind:"match", r:1.1,
    pos:() => { const p = R.pos || (R.pos = {x:0, y:0, z:0}), w = R.wpos; w.x = p.x + V.ox; w.y = p.y; w.z = p.z + V.oz; return w; },
    active:() => !!(R.clip || (a.act && !a.act.done) || a.isMe || (a.gk && a.gk.plan)),
    anim:(dt, tier) => animAgent(V, R, dt, tier)});
  R.pos = {x:a.m.x, y:0, z:a.m.z};
  if (a.isMe) makeFP(V, a);
  return R;
}
// your first-person body (no head: the body ends at the shoulders), in the kit
function makeFP(V, a){
  if (V.fp || !V.fpLook) return;
  const h = human(V.fpLook, {noHead:true, lod:false, track:true});
  h.near.frustumCulled = false;
  h.g.name = "match-fp";
  V.scene.add(h.g);
  V.fp = h;
}

/* ---------- each frame ----------
   alpha: how far between the last two fixed steps this frame is; dt: real seconds; cam: the camera (for the ball's
   view test of the cones' balls). The bodies themselves are posed by their SCHED actors (animAgent), at their tier. */
export function viewFrame(V, ms, alpha, dt, cam){
  V.alpha = alpha; V.t += dt;
  for (const a of ms.agents){
    if (a.role === "off") continue;
    const R = V.rec[a.id] || bodyFor(V, a);
    const S = V.src ? V.src.agents[a.id] : null;
    // before the kick-off (the dressing room, the walk-out) a body may be somewhere the controller walks it (pre)
    const Q = !S && V.pre ? V.pre[a.id] : null;
    R.pre = Q || null;
    const on = S ? S.on : Q ? !Q.hide : a.onPitch || a.leaving;
    const hide = V.hideAll || !on || (a.isMe && V.fpOn && !V.src && !Q);
    R.hidden = hide;
    R.h.g.visible = !hide;
    if (S){ R.pos.x = S.x; R.pos.z = S.z; R.pos.y = S.y || 0; }
    else if (Q){ R.pos.x = Q.x; R.pos.z = Q.z; R.pos.y = 0; }
    else {
      R.pos.x = a.x0 + (a.m.x - a.x0)*alpha; R.pos.z = a.z0 + (a.m.z - a.z0)*alpha;
      R.pos.y = a.y || 0;
    }
  }
  // the ball, between its last two steps (or in the referee's hands as he walks out with it: ballAt)
  const B = V.src ? V.src.ball : V.ballAt || ms.ball.p, bm = V.ball.mesh;
  if (V.src || V.ballAt) bm.position.set(B.x, B.y, B.z);
  else {
    const P0 = V.ballPrev;
    bm.position.set(P0.x + (B.x - P0.x)*alpha, P0.y + (B.y - P0.y)*alpha, P0.z + (B.z - P0.z)*alpha);
  }
  bm.visible = !V.hideAll && !(V.src ? V.src.ballHidden : false);
  spin(V, dt);
  spares(V, ms);
}
// before each fixed step: where the ball was (for the interpolation)
export function viewPreStep(V, ms){ const b = ms.ball.p; V.ballPrev.x = b.x; V.ballPrev.y = b.y; V.ballPrev.z = b.z; }
const _ax = new THREE.Vector3();
function spin(V, dt){
  const ms = V.ms, b = V.src ? null : ms.ball, bm = V.ball.mesh;
  if (!b || !(dt > 0)) return;
  const w = Math.hypot(b.w.x, b.w.y, b.w.z);
  if (w > 1e-3){ _ax.set(b.w.x/w, b.w.y/w, b.w.z/w); bm.rotateOnWorldAxis(_ax, w*dt); }
  else { const v = Math.hypot(b.v.x, b.v.z); if (v > .05 && b.p.y < .2){ _ax.set(b.v.z/v, 0, -b.v.x/v); bm.rotateOnWorldAxis(_ax, v/.11*dt); } }
}
// the spare balls: a cone shows its ball while the simulation keeps one there; a spare off its cone (the old match
// ball, one being carried for a restart) is drawn where the simulation has it
function spares(V, ms){
  const cones = STADIUM.cones || [];
  let extra = 0;
  for (let i = 0; i < cones.length; i++){
    const has = ms.spares.some(q => q.cone === i && q.state === "cone" && q.ball !== ms.ball);
    if (cones[i].put && cones[i].take){ if (has) cones[i].put(); else cones[i].take(); }
  }
  if (!V.src) for (const q of ms.spares){
    if (q.ball === ms.ball || q.state === "cone") continue;
    let m = V.extra[extra];
    if (!m){ m = V.extra[extra] = ballMesh({shadow:true}); V.scene.add(m.mesh); }
    m.mesh.visible = !V.hideAll; m.mesh.position.set(q.ball.p.x, q.ball.p.y, q.ball.p.z); extra++;
  }
  for (let i = extra; i < V.extra.length; i++) V.extra[i].mesh.visible = false;
}

/* ---------- one body's pose ---------- */
const PB = {x:0, y:0, z:0};
function animAgent(V, R, dt, tier){
  const a = R.a, h = R.h, ms = V.ms;
  if (R.hidden && !(a.isMe && V.fp)){ if (dt > 0) animateHuman(h, dt, R.st, {tier:4}); return; }
  const S = V.src ? V.src.agents[a.id] : null, Q = R.pre;
  h.g.position.set(R.pos.x, 0, R.pos.z);
  h.g.rotation.y = (S ? S.yaw : Q ? Q.yaw : a.m.yaw) + Math.PI;
  const st = S ? replaySt(R, S) : Q ? preSt(R, Q) : liveSt(V, R, a, ms, dt);
  if (st.groupY != null) h.g.position.y = st.groupY;
  if (st.groupAt){ h.g.position.x = st.groupAt.x; h.g.position.z = st.groupAt.z; }
  const ev = animateHuman(h, dt, st, {tier:R.hidden ? 4 : tier});
  if (R.clip && (ev.mask & EV.END)) R.clip = null;
  R.lastEv = ev.mask;
}
// the pose of a body the controller walks (the walk-out) or seats (the dressing room)
function preSt(R, Q){
  const st = R.pst || (R.pst = {mode:"move", speed:0});
  st.mode = Q.mode || "move"; st.speed = Q.speed || 0; st.groupY = null; st.groupAt = null; st.upper = null;
  R.clip = null;
  return st;
}
// the pose from a replay snapshot: locomotion at its speed, or the clip it was in
function replaySt(R, S){
  const st = R.rst || (R.rst = {mode:"move", speed:0});
  if (S.mode && S.mode !== "move"){ const c = Object.assign(R.rclip && R.rclip.id === S.cid ? R.rclip : {}, S.st, {id:S.cid}); R.rclip = c; return c; }
  st.mode = "move"; st.speed = S.speed; st.groupY = 0; st.groupAt = null;
  return st;
}
// the pose the simulation's state asks for now
function liveSt(V, R, a, ms, dt){
  const act = a.act, alpha = V.alpha, loco = R.st;
  loco.groupY = null; loco.groupAt = null; loco.upper = null;
  // the keeper's own states
  if (a.isGK && a.gk){
    const g = a.gk;
    if (g.plan && (g.state === "dive" || g.state === "ground" || g.state === "getUp" || g.state === "catch")){
      const c = clipFor(R, "gkdive", g.plan);
      c.mode = "gkdive"; c.plan = g.plan; c.at = g.diveT + alpha*H; c.steer = g.steer; c.outcome = outcomeOf(V, a, g); c.groupY = 0;
      return c;
    }
    if (act && act.kind === "kick" && act.action && (act.action.kind === "punt" || act.action.kind === "roll") && !act.adjust){
      const c = clipFor(R, "gkdist", act);
      c.mode = "gkdistribute"; c.kind = act.action.kind === "punt" ? "punt" : "roll"; c.dir = act.action.target ? {x:act.action.target.x - a.m.x, z:act.action.target.z - a.m.z} : null; c.power = .8;
      return c;
    }
    if (act && act.kind === "throw"){
      const c = clipFor(R, "gkthrow", act);
      c.mode = "gkdistribute"; c.kind = "throw"; c.dir = {x:act.target.x - a.m.x, z:act.target.z - a.m.z}; c.power = .7;
      return c;
    }
    // a dive the brain has finished with (he is up and ready) runs on to the clip's own end, then blends into the stance
    if (!act && R.clip && R.clip.mode === "gkdive"){ R.clip.at += dt; return R.clip; }
    if (!act && R.clip) return R.clip;
    if (g.state === "set"){ R.clip = null; const c = R.gset || (R.gset = {mode:"gkset"}); return c; }
    if (!act && a.m.speed < 2.6 && (g.state === "ready" || g.state === "shuffle" || g.state === "reposition" || g.state === "hold" || g.state === "claim")){
      R.clip = null;
      const c = R.gready || (R.gready = {mode:"gkready", focus:{x:0, z:0}, alert:0});
      c.focus.x = ms.ball.p.x; c.focus.z = ms.ball.p.z; c.alert = g.state === "hold" ? 0 : .6;
      return c;
    }
  }
  if (act && act !== R.actRef){ R.actRef = act; R.clip = null; }
  if (act){
    switch (act.kind){
      case "kick": {
        if (act.adjust && !act.done) break;
        const rq = act.action || {};
        const c = clipFor(R, "strike", act);
        c.mode = "strike"; c.kind = strikeKind(rq); c.side = act.foot === "L" ? "L" : "R";
        c.power = rq.power != null ? rq.power : .6; c.curl = rq.finesse ? 1 : 0; c.lowHigh = rq.contact || 0;
        if (!act.done){
          const tcl = Math.max(0, act.tc - act.t - alpha*H);
          c.tc = tcl;
          predAt(ms, tcl, PB); c.ball = c.ball || {x:0, y:0, z:0}; c.ball.x = PB.x; c.ball.y = PB.y; c.ball.z = PB.z;
          const tg = rq.target; c.dir = tg ? {x:tg.x - PB.x, z:tg.z - PB.z} : dirOf(a.m.yaw);
        } else c.tc = 0;
        return c;
      }
      case "tackle": {
        const c = clipFor(R, "tackle", act);
        c.mode = "tackle"; c.kind = act.sub === "poke" ? "poke" : "stand"; c.side = "R";
        c.target = c.target || {x:ms.ball.p.x, z:ms.ball.p.z}; c.tc = Math.max(0, act.tEff - act.t - alpha*H);
        return c;
      }
      case "slide": {
        const c = clipFor(R, "slide", act);
        c.mode = "tackle"; c.kind = "slide"; c.side = "R"; c.v0 = act.prof ? act.prof.v0 : 5; c.tc = Math.max(0, act.tEff - act.t);
        // the clip slides the body along its own curve from where the slide began: the group stays there
        c.groupAt = {x:act.x0, z:act.z0};
        return c;
      }
      case "header": {
        const c = clipFor(R, "header", act);
        c.mode = "header"; c.take = act.dive ? "dive" : act.standing ? "stand" : "jump";
        c.jump = clamp((act.v0*act.v0/(2*9.81))/(.55*(a.scale || 1)), .1, 1.2);
        c.tc = Math.max(0, act.tc - act.t - alpha*H);
        predAt(ms, c.tc, PB); c.ball = {x:PB.x, y:PB.y, z:PB.z};
        const tg = act.target; c.dir = tg ? {x:tg.x - a.m.x, z:tg.z - a.m.z} : dirOf(a.m.yaw);
        c.groupY = act.dive ? 0 : (a.y || 0);
        return c;
      }
      case "throw": {
        const c = clipFor(R, "throwin", act);
        c.mode = "throwin"; c.run = false; c.tc = Math.max(0, act.tc - act.t - alpha*H);
        return c;
      }
    }
  }
  // a receive coming: the ball on its way into his reach within 0.35 s, and it is his to take
  if (!act && a.role === "player" && ms.ball.state === "free" && ms.poss.ctl !== a.id){
    const r = recvFor(V, R, a, ms);
    if (r) return r;
  }
  // a clip still finishing (its follow-through, the get-up after a slide)
  if (R.clip && R.clip.mode !== "receive") return R.clip;
  if (R.clip && R.clip.mode === "receive" && ms.t < R.clip.until) return R.clip;
  R.clip = null;
  // a celebration after a goal, for the scorer and the team-mates near him, while play is stopped for it
  if (ms.phase === "goal" && V.goalEv && a.team === V.goalEv.team && a.role === "player" && !a.isGK){
    const sc = ms.agents[V.goalEv.scorer];
    if (sc && (a === sc || Math.hypot(sc.m.x - a.m.x, sc.m.z - a.m.z) < 18)){
      const c = R.cel && R.cel.id === V.goalEv.id ? R.cel : (R.cel = {mode:"celebrate", id:V.goalEv.id, style:CELEB[(a.id + V.goalEv.id) % (a === sc ? 4 : 3)]});
      if (a.m.speed < 2.5) return c;
    }
  }
  loco.mode = "move"; loco.speed = a.m.speed;
  loco.fatigue = a.st ? clamp(1 - (a.st.B || 0)/60, 0, 1)*.6 : 0;
  // a call for the ball (the arm up), the assistant's flag (up and out)
  if (a.lastCall != null && ms.t - a.lastCall < .9) loco.upper = UP_CALL;
  else if (a.role === "ar" && V.flag && V.flag.agent === a.id && ms.t < V.flag.until) loco.upper = UP_FLAG;
  return loco;
}
const UP_CALL = {g:"call", w:1}, UP_FLAG = {g:"point", w:1};
// a clip's state object, one per action (a new action, a new clip: st.id)
function clipFor(R, key, ref){
  if (R.clip && R.clip.ref === ref && R.clip.key === key) return R.clip;
  R.clip = {key, ref, id:++CLIP_N};
  return R.clip;
}
let CLIP_N = 0;
function strikeKind(rq){
  if (rq.style && rq.style !== "ground" && rq.style !== "header" && rq.style !== "divingHeader") return kindOf(rq.style);
  switch (rq.kind){
    case "shot": return rq.contact > 0 && rq.finesse ? "chip" : "instep";
    case "pass": case "through": return "side";
    case "cross": case "clear": case "goalkick": return "lofted";
    case "lob": return "chip";
    default: return kindOf(rq.kind);
  }
}
// the outcome of a dive, from what the simulation logged for this keeper since the dive began
function outcomeOf(V, a, g){
  const s = V.saves.get(a.id);
  if (s && s.t >= V.ms.t - g.diveT - 1e-6) return s.outcome === "catch" || s.outcome === "claim" ? "catch" : s.outcome === "tip" ? "tip" : "parry";
  if (g.diveT < g.plan.tc) return "catch";
  return "miss";
}
// a first touch about to happen: the ball comes within reach in under 0.35 s and he is the one to take it
function recvFor(V, R, a, ms){
  const p = a.plan, mine = a.isMe || (p && (p.kind === "receive" || p.kind === "chase" || p.kind === "intercept")) || (ms.kick && ms.kick.ev && ms.kick.ev.recv === a.id);
  if (!mine) return null;
  if (R.clip && R.clip.mode === "receive" && ms.t < R.clip.until) return R.clip;
  for (let i = 1; i <= 10; i++){
    const t = i*.035;
    predAt(ms, t, PB);
    const d = Math.hypot(PB.x - a.m.x - a.m.vx*t, PB.z - a.m.z - a.m.vz*t);
    if (d < .75 && PB.y < 1.5){
      const f = dirOf(a.m.yaw), lat = (PB.x - a.m.x)*-f.z + (PB.z - a.m.z)*f.x;
      const part = PB.y > .95 ? "chest" : PB.y > .45 ? "thigh" : PB.y < .16 && Math.hypot(ms.ball.v.x, ms.ball.v.z) < 3 ? "sole" : "inside";
      R.clip = {key:"receive", ref:ms.predSeq, id:++CLIP_N, mode:"receive", part, side:lat >= 0 ? "R" : "L", ball:{x:PB.x, y:PB.y, z:PB.z}, tc:t,
        ballV:{x:ms.ball.v.x, y:ms.ball.v.y, z:ms.ball.v.z}, cushion:.7, until:ms.t + t + .35};
      return R.clip;
    }
  }
  return null;
}

/* ---------- your first-person body (matchcam.js calls this after placing the eye) ---------- */
const FPST = {mode:"move", speed:0, root:{x:0, z:0}, armsIn:0, fatigue:0, correct:null};
// x, z: where you stand; yaw: where you look; dt; armsIn (0..1), correct (the neck fix); returns the pose's events
export function fpPose(V, x, z, yaw, dt, o = {}){
  const h = V.fp; if (!h) return 0;
  const ms = V.ms, a = ms.agents[V.me];
  h.g.visible = !!(V.fpOn && !V.src && !V.hideAll);
  if (!h.g.visible) return 0;
  const s = h.scale || 1, back = o.back || 0;
  h.g.position.set(x - dirOf(yaw).x*back, o.y || 0, z - dirOf(yaw).z*back); h.g.rotation.y = yaw + Math.PI;
  let st = FPST;
  if (a){
    const R = V.rec[a.id];
    // a strike, a tackle, a header, a receive: the same clip as your whole body, seen from inside it
    const clip = R && R.clip && R.clip.mode !== "celebrate" ? R.clip : null;
    if (clip) st = clip;
  }
  if (st === FPST){
    FPST.speed = a ? a.m.speed : o.speed || 0; FPST.root.x = x; FPST.root.z = z; FPST.armsIn = o.armsIn || 0; FPST.correct = o.correct || null;
    FPST.fatigue = a && a.st ? clamp(1 - a.st.B/60, 0, 1)*.6 : 0;
  }
  void s;
  return animateHuman(h, dt, st).mask;
}

/* ---------- events the view keeps an eye on (controller.js wires them) ---------- */
export function viewEvent(V, ev){
  if (ev.kind === "save"){ V.saves.set(ev.agent, {t:ev.t, outcome:ev.outcome}); }
  else if (ev.kind === "goal" && !ev.disallowed){ V.goalEv = ev; }
  else if (ev.kind === "flag"){
    // the assistant on that half raises his flag until the whistle (half a second after it, at most 2 s)
    const ms = V.ms, half = ev.x < 0 ? -1 : 1, ar = ms.agents.find(o => o.role === "ar" && (o.id === 23 ? -1 : 1) === half);
    if (ar) V.flag = {agent:ar.id, until:ms.t + 1.6};
  }
}

// the bodies the controller places before the kick-off: pre[agentId] = {x, z, yaw, speed, mode, hide} (null: the
// simulation's own); V.ballAt {x, y, z} puts the ball in the referee's hands
export function viewPre(V, pre){ if (V) V.pre = pre || null; }
// a faint ring on the grass (your place for the kick-off, 3.4.1 step 5): at {x, z}, or null to take it away
export function viewRing(V, p){ ring(V, "ringSpot", p, .55, .08, 0xffffff, .28); }
// the receiver ring (1.5.10): under the team-mate a pass is aimed at, or under the point a pass to you will be met
export function viewRecv(V, p){ ring(V, "ringRecv", p, .7, .05, 0xc8f060, .55); }
function ring(V, key, p, r, w, color, op){
  if (!V) return;
  let m = V[key];
  if (!p){ if (m) m.visible = false; return; }
  if (!m){
    m = V[key] = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 40), new THREE.MeshBasicMaterial({color, transparent:true, opacity:op, depthWrite:false}));
    m.rotation.x = -Math.PI/2; m.renderOrder = 2; m.userData.noMerge = true;
    V.scene.add(m);
  }
  m.visible = true; m.position.set(p.x, .025, p.z);
}

export function viewDispose(V){
  if (!V) return;
  for (const R of V.rec){ if (!R) continue; SCHED.remove(R.actor); R.h.dispose(); }
  V.rec.length = 0;
  if (V.fp){ V.fp.dispose(); V.fp = null; }
  for (const b of [V.ball].concat(V.extra)) if (b && b.mesh.parent) b.mesh.parent.remove(b.mesh);
  for (const k of ["ringSpot", "ringRecv"]) if (V[k]){ V[k].geometry.dispose(); V[k].material.dispose(); if (V[k].parent) V[k].parent.remove(V[k]); V[k] = null; }
  V.extra.length = 0;
}
// a pose of the view's bodies for a replay frame (replay.js): src = {agents: [{x, z, y, yaw, speed, on, mode, st, cid}], ball}
export function viewSource(V, src){ V.src = src; }
