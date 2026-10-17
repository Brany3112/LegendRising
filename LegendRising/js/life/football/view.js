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
   A replay (replay.js) hands this view snapshots instead of the live state: the same bodies, posed from the record.
   P2b-B (TR-2b, TRAINING-SPEC 3): the poses follow the simulation's contact. A tackle reaches with the foot on the
   ball's side to the contact point the simulation has (act.contact, else where the ball will be at the contact), as
   far as the simulation's reach (duel.js standReach, the poke's further); a slide runs at the act's own carried speed,
   along its own way, slowed by the grass; a receive starts when the ball comes inside the control radius (zone.js R)
   and uses the foot, the thigh or the chest by the ball's real height (zone.js part); a shielding body carries the
   shield's upper body (moves.js upper:shield).
   P3-B (TR-3, TRAINING-SPEC 4 and 8, BUILD-PLAN P3-B items 5 and 6): Training's drills hand in pooled bodies
   (o.bodyOf(agent) and o.fpBody, train/pool.js), which viewDispose gives back instead of destroying, so a restart
   never builds a body; o.officials === false draws no referee and no assistants (a drill has none on the grass); the
   ball is never drawn smaller than BALL_MIN_PX across, so it stays readable far off.
   UF-A (TR-3 user fixes, USER-ISSUES U6 and U10): a throw-in's ball is drawn in the taker's hands from the moment he
   holds it to the release (throwHeld, throwHold); a request for the ball raises the caller's hand and drops it again
   (handUp: agent.js raiseHand and the calls), in your own view too.
   P6-A (TR-6, TRAINING-SPEC 5, BUILD-PLAN P6-A): the first touch is found the way the simulation takes it (actions.js
   envAhead, step by step on the ball's prediction, inside zone.js R), so the receive clip starts on the simulation's own
   contact moment and point, with touch.js touchPart's part (the foot, the raised foot, the thigh, the chest); it is kept
   on that contact as it is worked out again, put on the simulation's own point once the touch is taken, and over at
   most 0.35 s after it. A ball on its way to a body a second or so off brings the upper body's 'ready' gesture. A strike
   at a dead ball begins on the walk-up, on the moment the simulation's window says, so the run-up is the clip's.
   UF2-A (stage UF2, USER-ISSUES U12 and U18): your body in your eyes ends its clips where they play (a clip of a strike,
   a tackle or a slide was kept after its act: your whole body is not drawn in first person, so its actor never saw the
   clip end), takes a slide from where it began and jumps with you, and stands at ease while the simulation is held
   (fpHeld). A ball into the net ripples it (netRipple: the nets' own mesh pushed back round the ball for a moment, and a
   ring spreading on the mesh where it went in) and, where nobody else plays the net's sound, it is heard; your clean
   strike (control.js, the meter's sweet spot) rings out over the kick. */
import {THREE} from "../build.js";
import {human, animateHuman, lookFor, EV, touch as gaitTouch} from "../human.js";
import {SCHED} from "../core/sched.js";
import {ballMesh} from "./pitchmesh.js";
import {STADIUM} from "./stadium.js";
import {predAt, ACT} from "./actions.js";
import {kindOf, windHold, windUpper, heldBall, handBall, HAND, RECV} from "../moves.js";
import "../gkmoves.js";
import {dirOf} from "./pitchspec.js";
import {R as zoneR, part as zonePart, playableFrom} from "./zone.js";
import {touchPart} from "./touch.js";
import {standReach, pokeReach, slideDecel} from "./duel.js";
import {raiseHand} from "./agent.js";
import {AUD} from "./audio.js";
import {overlayCovered} from "../core/quality.js";
import {neckFix} from "../core/me.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const H = 1/60;
const CELEB = ["armsUp", "fistPump", "runArmsOut", "kneeSlide"];

/* ---------- looks ---------- */
// the kits of a match: {home:[shirt, shorts], away:[...]} from the configuration's teams; keepers and officials in
// colours clear of both (clashFree through lookFor's avoid), or in the colours kitclash.js resolved for them (kits.gk,
// kits.ref: UF-B, USER-ISSUES U11) when the configuration carries them
export function matchLooks(ms, kits, meLook){
  const K = [kits.home || ["#2c66b8", "#ffffff"], kits.away || ["#c8463a", "#ffffff"]];
  const kitCols = [K[0][0], K[0][1], K[1][0], K[1][1]];
  const gk = [null, null];
  const gkX = t => kits.gk && kits.gk[t] ? {outfit:{shirt:kits.gk[t], socks:kits.gk[t]}} : {};
  const refX = kits.ref ? {kit:[kits.ref, "#16171a"], avoid:[]} : {};
  for (const t of [0, 1]){
    const id = ms.gks[t] >= 0 ? ms.gks[t] : t;
    const a = ms.agents[id] || {pid:t, number:1};
    const avoid = kitCols.concat(t === 1 && gk[0] ? [gk[0].outfit.shirt] : []);
    gk[t] = lookFor("goalkeeper", (a.pid > 0 ? a.pid : 3 + t) % 100000, Object.assign({kit:K[t], avoid, number:a.number || 1, sex:"m"}, gkX(t)));
  }
  const offAvoid = kitCols.concat([gk[0].outfit.shirt, gk[1].outfit.shirt]);
  const of = (a, p) => {
    if (a.role === "referee") return lookFor("referee", 22, Object.assign({avoid:offAvoid, sex:"m"}, refX));
    if (a.role === "ar") return lookFor("linesman", a.id, Object.assign({avoid:offAvoid, sex:"m"}, refX));
    if (a.isMe && meLook) return meLook;
    if (a.isGK || (p && p.isGK)) return lookFor("goalkeeper", ((a.pid > 0 ? a.pid : a.id) % 100000), Object.assign({kit:K[a.team], avoid:offAvoid.concat([gk[1 - a.team].outfit.shirt]), number:a.number || 1, sex:"m"}, gkX(a.team)));
    return lookFor("footballer", a.pid > 0 ? a.pid % 100000 : a.id + 1, {kit:K[a.team], number:a.number || 0, sex:"m"});
  };
  return {of, gk, K};
}
// every look a match will need, the substitutes' too (for prebuildHumans behind the travel card)
export function looksOf(ms, kits, meLook, o = {}){
  const L = matchLooks(ms, kits, meLook), out = [];
  for (const a of ms.agents) if (a.role !== "off" && !(o.officials === false && a.team === -1)) out.push(a.isGK && ms.gks[a.team] === a.id ? L.gk[a.team] : L.of(a));
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
    ox:o.frame ? +o.frame.cx || 0 : 0, oz:o.frame ? +o.frame.cz || 0 : 0, lookOf:typeof o.lookOf === "function" ? o.lookOf : null,
    // (P3-B) pooled bodies: bodyOf(agent) -> a human() body to use (given back by viewDispose), fpBody the rig in your
    // eyes; officials false: no bodies for the referee and the assistants
    bodyOf:typeof o.bodyOf === "function" ? o.bodyOf : null, fpBody:o.fpBody || null, officials:o.officials !== false};
  const b = ballMesh({shadow:true});
  b.mesh.matrixAutoUpdate = true;
  scene.add(b.mesh);
  V.ball = b;
  V.ballPrev = {x:ms.ball.p.x, y:ms.ball.p.y, z:ms.ball.p.z};
  for (const a of ms.agents) if (drawn(V, a)) bodyFor(V, a);
  return V;
}
// does this agent get a body: not an empty slot, and not an official where the officials are not drawn (a drill)
const drawn = (V, a) => a.role !== "off" && (V.officials || a.team !== -1);
// one agent's body, made the first time it is needed (a substitute coming on), or taken from the pool handed in
function bodyFor(V, a){
  let R = V.rec[a.id];
  if (R) return R;
  const ms = V.ms;
  const pooled = V.bodyOf ? V.bodyOf(a) : null;
  let h = pooled;
  if (!h){
    const own = V.lookOf ? V.lookOf(a) : null;
    const look = own || (a.isGK && ms.gks[a.team] === a.id ? V.L.gk[a.team] : V.L.of(a));
    h = human(look, {cast:true});
  }
  h.g.name = a.isMe ? "match-me" : "match-" + a.id;
  h.g.visible = true;
  V.scene.add(h.g);
  R = V.rec[a.id] = {a, h, pooled:!!pooled, st:{mode:"move", speed:0}, clip:null, actRef:null, kind:"", recv:null, cel:null, x:a.m.x, z:a.m.z, actor:null, hidden:false, wpos:{x:0, y:0, z:0}};
  R.actor = SCHED.actor({id:"match-" + a.id, kind:"match", r:1.1,
    pos:() => { const p = R.pos || (R.pos = {x:0, y:0, z:0}), w = R.wpos; w.x = p.x + V.ox; w.y = p.y; w.z = p.z + V.oz; return w; },
    active:() => !!(R.clip || (a.act && !a.act.done) || a.isMe || (a.gk && a.gk.plan) || throwHeld(ms, a)),
    anim:(dt, tier) => animAgent(V, R, dt, tier)});
  R.pos = {x:a.m.x, y:0, z:a.m.z};
  if (a.isMe) makeFP(V);
  return R;
}
// your first-person body (no head: the body ends at the shoulders), in the kit; also made by controller.js for a
// substitute off the pitch (the warm-up, A1.8), who has no agent yet: the same body is taken over when he goes on
export function makeFP(V){
  if (!V || V.fp || (!V.fpLook && !V.fpBody)) return;
  // (a pooled rig is the pool's: given back, not disposed, viewDispose)
  const h = V.fpBody || human(V.fpLook, {noHead:true, lod:false, track:true});
  V.fpPooled = h === V.fpBody;
  h.g.visible = true;
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
  if (!V.src) dribbleTouches(V, ms);
  for (const a of ms.agents){
    if (!drawn(V, a)) continue;
    const R = V.rec[a.id] || bodyFor(V, a);
    const S = V.src ? V.src.agents[a.id] : null;
    // before the kick-off (the dressing room, the walk-out) a body may be somewhere the controller walks it (pre)
    const Q = !S && V.pre ? V.pre[a.id] : null;
    R.pre = Q || null;
    const on = S ? S.on : Q ? !Q.hide : a.onPitch || a.leaving;
    // ((U21) in third person, matchcam.js V.tp, your whole body is drawn; through your eyes it is the first-person one)
    const hide = V.hideAll || !on || (a.isMe && V.fpOn && !V.tp && !V.src && !Q);
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
  ballReadable(V, bm, cam);
  spin(V, dt);
  spares(V, ms);
  // a throw-in's ball is drawn in the thrower's hands while he holds it (UF-A, U6: his body is posed before this, by
  // its actor, so the hands are the ones drawn this frame; your own, first person, fpPose does after the camera)
  const th = !V.src && ms.ball.state === "held" ? ms.agents[ms.ball.holder] : null, TR = th ? V.rec[th.id] : null;
  if (TR && !TR.hidden) throwBall(V, TR, th, ms, TR.h, dt, "thw");
  if (!V.src) gkBall(V, ms);
  // (UF2-A) the net when the ball goes in, and your clean strike heard
  netFrame(V, ms, dt);
  cleanFeel(V, ms);
}

/* ---------- the net and the clean strike (UF2-A, U18: a strike that feels rewarding) ---------- */
// RIP: how long the ripple lasts (s), how far round the ball the net gives (m), how far it is pushed at most (m), its
// wobble (rad/s); the ring spreading where the ball went in (its largest radius, m)
const RIP = Object.freeze({T:.9, R:1.2, A:.22, W:15, RING:1.1});
function netFrame(V, ms, dt){
  const b = V.src ? null : ms.ball;
  if (b){
    if (b.netHit && !V.netWas){
      const x = b.p.x + V.ox, y = b.p.y, z = b.p.z + V.oz;
      netRipple(V, x, y, z, b.v);
      // (heard where nobody else plays it: a match's controller does, a training item does not)
      const subs = ms.subsFn && ms.subsFn.net;
      if (!(subs && subs.length)) try { AUD.cue("net", {x, y, z}, .9); } catch(e){}
    }
    V.netWas = !!b.netHit;
  }
  rippleStep(V, dt);
}
// the nets' meshes in the world (pitchmesh.js names them "pitch-nets"; one merged into a batch is not there to move)
function netMeshes(V){
  if (V.nets && V.nets.length && V.nets.every(m => m.parent)) return V.nets;
  let root = V.scene; while (root && root.parent) root = root.parent;
  const out = [];
  if (root) root.traverse(o => { if (o.isMesh && o.name === "pitch-nets" && o.geometry && o.geometry.attributes.position) out.push(o); });
  return (V.nets = out);
}
const _rp = new THREE.Vector3(), _rv = new THREE.Vector3(), _rq = new THREE.Quaternion();
export function netRipple(V, x, y, z, v){
  if (!V || !V.scene) return null;
  const vl = Math.hypot(v.x, v.y, v.z) || 1;
  // the mesh the ball went into: its own vertices pushed back round the ball (its rest positions kept to put them back)
  let hit = null;
  for (const m of netMeshes(V)){
    m.updateMatrixWorld(true);
    _rp.set(x, y, z); m.worldToLocal(_rp);
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox.distanceToPoint(_rp) < .6){ hit = m; break; }
  }
  if (V.rip && V.rip.m){ V.rip.m.geometry.attributes.position.array.set(V.rip.base); V.rip.m.geometry.attributes.position.needsUpdate = true; }
  V.rip = null;
  if (hit){
    const pos = hit.geometry.attributes.position, base = hit.userData.netBase || (hit.userData.netBase = Float32Array.from(pos.array));
    _rv.set(v.x/vl, v.y/vl, v.z/vl); _rq.copy(hit.quaternion).invert(); _rv.applyQuaternion(_rq);
    V.rip = {m:hit, base, lx:_rp.x, ly:_rp.y, lz:_rp.z, dx:_rv.x, dy:_rv.y, dz:_rv.z, t:0, a:RIP.A*Math.min(1, .35 + vl/22)};
  }
  // the ring spreading on the net where it went in (facing the way the ball came)
  let ring = V.ripRing;
  if (!ring){
    ring = V.ripRing = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 40), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide}));
    ring.userData.noMerge = true; ring.renderOrder = 3; ring.name = "net-ripple";
    let root = V.scene; while (root && root.parent) root = root.parent;
    (root || V.scene).add(ring);
  }
  ring.position.set(x, y, z); _rv.set(x + v.x/vl, y + v.y/vl, z + v.z/vl); ring.lookAt(_rv);
  ring.visible = true; ring.scale.setScalar(.05); ring.userData.t = 0;
  return V.rip;
}
function rippleStep(V, dt){
  const R = V.rip;
  if (R){
    R.t += Math.max(0, dt || 0);
    const pos = R.m.geometry.attributes.position, a = pos.array, base = R.base, k = R.t/RIP.T;
    if (k >= 1 || !R.m.parent){ a.set(base); pos.needsUpdate = true; V.rip = null; }
    else {
      const env = (1 - k)*(1 - k), wave = Math.cos(R.t*RIP.W)*R.a*env, r2 = RIP.R*RIP.R;
      for (let i = 0; i < a.length; i += 3){
        const ex = base[i] - R.lx, ey = base[i + 1] - R.ly, ez = base[i + 2] - R.lz, d2 = ex*ex + ey*ey + ez*ez;
        if (d2 >= r2){ a[i] = base[i]; a[i + 1] = base[i + 1]; a[i + 2] = base[i + 2]; continue; }
        const w = (1 - d2/r2)*(1 - d2/r2)*wave;
        a[i] = base[i] + R.dx*w; a[i + 1] = base[i + 1] + R.dy*w*.4; a[i + 2] = base[i + 2] + R.dz*w;
      }
      pos.needsUpdate = true;
    }
  }
  const ring = V.ripRing;
  if (ring && ring.visible){
    const t = (ring.userData.t += Math.max(0, dt || 0)), k = Math.min(1, t/.55);
    ring.scale.setScalar(.05 + RIP.RING*k); ring.material.opacity = .55*(1 - k);
    if (k >= 1) ring.visible = false;
  }
}
// your clean strike (the meter's sweet spot, control.js): a bright ring on top of the kick the caller plays
function cleanFeel(V, ms){
  const K = !V.src && ms.kick;
  if (!K || K.ev === V.cleanEv) return;
  V.cleanEv = K.ev;
  const ev = K.ev;
  if (!ev || !ev.clean || K.agent !== V.me) return;
  try { AUD.cue("tick", {x:ev.x + V.ox, y:.3, z:ev.z + V.oz}, 1.8); AUD.cue("kick", {x:ev.x + V.ox, y:.2, z:ev.z + V.oz}, .45); } catch(e){}
}
/* the ball never smaller on screen than BALL_MIN_PX across (TRAINING-SPEC 2, "ball readable"): far off, a real ball
   (22 cm) is under 3 px at 40 m in a 720-pixel-high view; beyond the distance where it would be, it is drawn a little
   larger, just enough. Its position and the simulation are untouched (only the mesh's scale) */
export const BALL_MIN_PX = 3;
function ballReadable(V, bm, cam){
  let s = 1;
  if (cam && cam.isPerspectiveCamera){
    const hpx = V.viewH || (typeof innerHeight === "number" ? innerHeight : 720);
    const gx = bm.position.x + V.ox - cam.position.x, gy = bm.position.y - cam.position.y, gz = bm.position.z + V.oz - cam.position.z;
    const d = Math.hypot(gx, gy, gz), f = hpx/2/Math.tan(cam.fov*Math.PI/360);
    const px = 2*.11*f/Math.max(d, .01);
    if (px < BALL_MIN_PX) s = BALL_MIN_PX/px;
  }
  if (bm.scale.x !== s) bm.scale.setScalar(s);
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
    // (a plain loop: no closure made per cone every frame, P10-B perf-6)
    let has = false;
    for (const q of ms.spares) if (q.cone === i && q.state === "cone" && q.ball !== ms.ball){ has = true; break; }
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

/* ---------- (P9-A, MV-9) dribble touches by the drawn foot ----------
   Every dribble touch the simulation makes (a 'touch' event, how 'dribble') sends the drawn body's next swing (gait.js
   touch: the foot whose swing passes u = 0.7 soonest, within 0.5 s) through the ball where it will then be: the
   simulation's ball rolled on for the swing's time (its speed falling at the grass's roll). The drawn foot meets the
   drawn ball, and the legs keep their own clock. V.touchSpy keeps each one for qa/tr9-anim.mjs */
const _tb = {x:0, y:.11, z:0};
function dribbleTouches(V, ms){
  const E = ms.events;
  if (V.evTouch == null || V.evTouch > E.length) V.evTouch = E.length;
  for (let i = V.evTouch; i < E.length; i++){
    const e = E[i];
    if (e.kind !== "touch" || e.how !== "dribble" || e.agent < 0) continue;
    const R = V.rec[e.agent]; if (!R || !R.h || R.hidden) continue;
    const b = ms.ball, v = Math.hypot(b.v.x, b.v.z);
    _tb.x = b.p.x; _tb.z = b.p.z;
    const r = gaitTouch(R.h, {ball:_tb});
    if (r && v > .05){
      // where the ball will be at the drawn contact
      const t = r.tContact, roll = b.rollDecel || 1.1, go = Math.max(0, v*t - .5*roll*t*t), G = R.h.gait;
      for (const via of G.via) if (via && via.x === _tb.x && via.z === _tb.z){ via.x = b.p.x + b.v.x/v*go; via.z = b.p.z + b.v.z/v*go; }
    }
    if (V.touchSpy) V.touchSpy.push({t:ms.t, agent:e.agent, ok:!!r, tContact:r ? r.tContact : null});
  }
  V.evTouch = E.length;
}

/* ---------- one body's pose ---------- */
const PB = {x:0, y:0, z:0};
// (P10-B, perf-6) a clip's direction, ball and group points are written into objects the clip keeps (c._dir, c._ball,
// c._at), not made afresh every frame while it plays
const xz = (o, x, z) => { o.x = x; o.z = z; return o; };
const dirTo = (c, x, z) => xz(c._dir || (c._dir = {x:0, z:0}), x, z);
const yawDir = (c, yaw) => xz(c._dir || (c._dir = {x:0, z:0}), -Math.sin(yaw), -Math.cos(yaw));
function animAgent(V, R, dt, tier){
  const a = R.a, h = R.h, ms = V.ms;
  if (R.hidden && !(a.isMe && V.fp)){ if (dt > 0) animateHuman(h, dt, R.st, {tier:4}); return; }
  const S = V.src ? V.src.agents[a.id] : null, Q = R.pre;
  h.g.position.set(R.pos.x, 0, R.pos.z);
  h.g.rotation.y = (S ? S.yaw : Q ? Q.yaw : a.m.yaw) + Math.PI;
  const st = S ? replaySt(R, S) : Q ? preSt(R, Q) : liveSt(V, R, a, ms, dt);
  if (st.groupY != null) h.g.position.y = st.groupY;
  if (st.groupAt){ h.g.position.x = st.groupAt.x; h.g.position.z = st.groupAt.z; }
  rebase(h, R.base || (R.base = {x:0, z:0, at:false, ok:false}), !!st.groupAt);
  const ev = animateHuman(h, dt, st, {tier:R.hidden ? 4 : tier});
  // (a clip that has played to its end is not started again for the same act: a slide or a header is not replayed
  // while its act lingers, UF-A U7)
  if (R.clip && (ev.mask & EV.END)){ R.doneAct = R.clip.ref; R.clip = null; }
  R.lastEv = ev.mask;
}
/* ---------- the throw-in in the hands (UF-A, USER-ISSUES U6) ----------
   From the moment a throw-in's taker has the ball (rules.js holds it at his hands, overhead) until the release the
   simulation's ball is held still; his body holds it there in both hands (moves.js 'upper:holdBall', then the throw-in
   clip: overhead, back behind the head, through to the release) and the ball is drawn between his hands (moves.js
   heldBall), so it is never seen floating ahead of him or flying before his hands are on it. At the release the clip's
   hands are where the simulation lets it go, and from there the ball is the simulation's again */
function throwHeld(ms, a){
  const R0 = ms.restart, b = ms.ball;
  if (b.state !== "held" || b.holder !== a.id || a.isGK) return false;
  if (a.act && a.act.kind === "throw") return !a.act.done;
  return !!(R0 && R0.kind === "throw" && !R0.taken);
}
// the drawn ball in the hands of body h (key: the record's own weight, its body's or your first-person one's): from the
// simulation's ball onto the hands over THW_IN as they take it (the gesture reaching for it), in them from then
const THW_IN = .25, _hb = {x:0, y:0, z:0};
function throwBall(V, R, a, ms, h, dt, key){
  if (!throwHeld(ms, a)){ R[key] = 0; return; }
  R[key] = a.act ? 1 : Math.min(1, (R[key] || 0) + Math.max(0, dt || 0)/THW_IN);
  if (!heldBall(h, _hb)) return;
  const p = V.ball.mesh.position, w = R[key]*R[key]*(3 - 2*R[key]);
  p.set(p.x + (_hb.x - p.x)*w, p.y + (_hb.y - p.y)*w, p.z + (_hb.z - p.z)*w);
}
// the upper body of a throw-in's taker holding the ball before his throw: both hands on it where it is
// (the simulation's ball, between its last two steps as viewFrame draws it before it goes into the hands)
function throwHold(V, R, a, ms){
  if (a.act || !throwHeld(ms, a)) return null;
  const c = R.thold || (R.thold = {g:"holdBall", w:1, ball:{x:0, y:0, z:0}}), b = ms.ball.p, p0 = V.ballPrev, al = V.alpha;
  c.ball.x = p0.x + (b.x - p0.x)*al; c.ball.y = p0.y + (b.y - p0.y)*al; c.ball.z = p0.z + (b.z - p0.z)*al;
  return c;
}
/* the hand raised for the ball (UF-A, USER-ISSUES U10): every request for the pass raises the caller's hand and drops
   it again (moves.js 'upper:hand', HAND.END seconds). Every call goes through agent.js raiseHand (brain.js callFor and
   the AI's calls, actions.js 'call', the controller's handRaise below), so a.handUp alone says where the gesture is,
   and a second request while the hand is up keeps it up instead of starting it again from the bottom. fp: your own
   first-person body's version, the hand up in front of your view */
function handUp(R, a, ms, fp){
  const k = ms.t - (a.handUp != null ? a.handUp : -99);
  if (!(k >= 0 && k < HAND.END)) return null;
  const key = fp ? "handFP" : "hand", c = R[key] || (R[key] = {g:"hand", w:1, k:0, fp});
  c.k = k;
  return c;
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
    // (P9-A, GK-3) a throw or a roll from his hands (gkbrain.js's act, P9-B): the distribution clip, its release (the
    // clip's contact: gkmoves.js 0.55 of 0.9 s for a throw, 0.45 of 0.8 for a roll) counted down on the act's own
    // tRelease, so the hand lets go on the step the simulation does
    if (act && (act.kind === "gkthrow" || act.kind === "gkroll")){
      const c = clipFor(R, "gkdist", act);
      c.mode = "gkdistribute"; c.kind = act.kind === "gkthrow" ? "throw" : "roll"; c.dir = dirTo(c, act.target.x - a.m.x, act.target.z - a.m.z);
      c.power = act.kind === "gkthrow" ? .7 : .6; c.tc = act.done ? undefined : act.tRelease - (act.t + alpha*H);
      return c;
    }
    // (P9-A, GK-3) his hands without a dive: the claim of a high ball (gkcatch, high; gkpunch when he punched it), the
    // spread at a man's feet (gkcollect, smother), a ball gathered into his hands (gkcollect: a scoop off the grass, a
    // catch at the chest above the knees) and a tip over without a dive (gktip)
    const hc = gkHands(V, R, a, g, ms, alpha);
    if (hc) return hc;
    if (act && act.kind === "kick" && act.action && (act.action.kind === "punt" || act.action.kind === "roll") && !act.adjust){
      const c = clipFor(R, "gkdist", act);
      c.mode = "gkdistribute"; c.kind = act.action.kind === "punt" ? "punt" : "roll"; c.dir = act.action.target ? dirTo(c, act.action.target.x - a.m.x, act.action.target.z - a.m.z) : null; c.power = .8;
      return c;
    }
    if (act && act.kind === "throw"){
      const c = clipFor(R, "gkthrow", act);
      c.mode = "gkdistribute"; c.kind = "throw"; c.dir = dirTo(c, act.target.x - a.m.x, act.target.z - a.m.z); c.power = .7;
      return c;
    }
    // a dive the brain has finished with (he is up and ready) runs on to the clip's own end, then blends into the stance
    if (!act && R.clip && R.clip.mode === "gkdive"){ R.clip.at += dt; return R.clip; }
    if (!act && R.clip) return R.clip;
    if (g.state === "set"){ R.clip = null; const c = R.gset || (R.gset = {mode:"gkset"}); return c; }
    if (!act && a.m.speed < 2.6 && (g.state === "ready" || g.state === "shuffle" || g.state === "reposition" || g.state === "hold" || g.state === "claim")){
      R.clip = null;
      const c = R.gready || (R.gready = {mode:"gkready", focus:{x:0, z:0}, alert:0, g:"gkready", w:1});
      c.focus.x = ms.ball.p.x; c.focus.z = ms.ball.p.z; c.alert = g.state === "hold" ? 0 : .6;
      // (P2-B, GK-2 and MV-7: on the move, above about 0.3 m/s, his legs are the gait's, stepping sideways (the shuffle:
      // planted feet, no skating) or forwards and back as the way he goes asks, with the ready stance's upper body laid
      // over them (gkmoves.js "upper:gkready"); nearly still, the whole ready stance)
      R.gkMove = a.m.speed > (R.gkMove ? .2 : .3);
      if (R.gkMove){
        locoOf(loco, a); loco.upper = c;
        if (loco.style === undefined){ const off = Math.abs(Math.atan2(Math.sin(a.m.heading - a.m.yaw), Math.cos(a.m.heading - a.m.yaw))); if (off > .7 && off < 2.45) loco.style = "shuffle"; }
        return loco;
      }
      return c;
    }
  }
  if (!a.isGK){ const td = tiredSt(R, a); if (td) return td; }
  if (act && act !== R.actRef){ R.actRef = act; R.clip = null; }
  // your wind-up (A1.7): standing or walking, the strike clip held at its backswing (moves.js windHold), the same
  // clip in your eyes, from outside and in a replay; on the run the stride keeps the legs (windUpper, below). Let go
  // into a stride adjust (the ball out of reach), the same clip lets the leg down while you step to it; any other
  // action (the strike from the hold, a tackle, a header) takes over from the hold at once
  if (a.isMe){
    const adj = !!(act && act.kind === "kick" && act.adjust && !act.done);
    const w = windHold(act ? null : V.wind, a.m.speed, R.hold || (R.hold = {}), dt, !!act && !adj);
    if (w){ R.clip = w; return w; }
    if (R.clip === R.hold) R.clip = null;
  }
  if (act && act !== R.doneAct){
    switch (act.kind){
      case "kick": {
        // (the walk-up to a dead ball, P6-A: the last strides onto it are the strike's run-up, so the clip starts while
        // he is still walking up, on the contact his walk-up says, and is re-aimed on the simulation's own once he is
        // in the window; started only then, a strike from a walk-up had a tenth of a second for a run-up of a third)
        let walkTc = -1;
        if (act.adjust && !act.done){
          const b = ms.ball, dead = b.state === "dead" || (act.adjustMax || 0) > 1;
          // (he is in the window once the ball is ACT.REACH1 ahead; he comes onto it slowing to the speed the steer
          // allows there, and the strike is ACT.TC_MAX after that, the window's far edge)
          const f = dirOf(a.m.yaw), sc = a.scale || 1, ahead = (b.p.x - a.m.x)*f.x + (b.p.z - a.m.z)*f.z;
          const dl = ahead - ACT.REACH1*sc, vEdge = 1.5*Math.max(0, ACT.REACH1*sc - WALKUP.BACK) + .3;
          walkTc = dead ? Math.max(0, dl)/Math.max(WALKUP.V, .5*(a.m.speed + vEdge)) + ACT.TC_MAX + H : -1;
          if (!(walkTc >= 0 && walkTc <= WALKUP.LEAD)) break;
        }
        const rq = act.action || {};
        const c = clipFor(R, "strike", act);
        c.mode = "strike"; c.kind = strikeKind(rq); c.side = act.foot === "L" ? "L" : "R";
        c.power = rq.power != null ? rq.power : .6; c.curl = rq.finesse ? 1 : 0; c.lowHigh = rq.contact || 0;
        if (!act.done){
          const tcl = walkTc >= 0 ? walkTc : Math.max(0, act.tc - act.t - alpha*H);
          c.tc = tcl;
          predAt(ms, tcl, PB); c.ball = c.ball || {x:0, y:0, z:0}; c.ball.x = PB.x; c.ball.y = PB.y; c.ball.z = PB.z;
          const tg = rq.target; c.dir = tg ? dirTo(c, tg.x - PB.x, tg.z - PB.z) : yawDir(c, a.m.yaw);
        } else c.tc = 0;
        return c;
      }
      case "tackle": {
        const c = clipFor(R, "tackle", act);
        c.mode = "tackle"; c.kind = act.sub === "poke" ? "poke" : "stand";
        c.tc = Math.max(0, tackleTc(act) - act.t - alpha*H);
        // the foot goes to the contact: the simulation's point when it has one, else the ball where it will be at the
        // contact (followed until then: a carrier who touches it on is followed), on the ball's side of the body
        contactOf(ms, a, act, c.tc, c.target || (c.target = {x:0, y:0, z:0}));
        c.side = act.side === "L" || act.side === "R" ? act.side : sideOf(a, c.target);
        const tk = a.at ? a.at.tackling : 50;
        // (how far the foot may go from the body: the simulation's reach, metres from the body to the ball's centre)
        c.reach = act.reach > 0 ? act.reach : c.kind === "poke" ? pokeReach(tk) : standReach(tk);
        return c;
      }
      case "slide": {
        const c = clipFor(R, "slide", act);
        c.mode = "tackle"; c.kind = "slide";
        // the slide at its own carried speed, along its own way, slowed by the grass (the simulation's numbers)
        c.v0 = act.v0 > 0 ? act.v0 : act.prof ? act.prof.v0 : 5;
        c.decel = act.prof && act.prof.decel > 0 ? act.prof.decel : slideDecel();
        c.dir = act.dir || null; c.dur = act.dur > 0 ? act.dur : 1.9;
        c.tc = Math.max(0, tackleTc(act) - act.t - alpha*H);
        contactOf(ms, a, act, c.tc, c.target || (c.target = {x:0, y:0, z:0}));
        c.side = act.side === "L" || act.side === "R" ? act.side : sideOf(a, c.target);
        // the clip slides the body along its own curve from where the slide began: the group stays there
        c.groupAt = xz(c._at || (c._at = {x:0, z:0}), act.x0, act.z0);
        return c;
      }
      case "header": {
        const c = clipFor(R, "header", act);
        c.mode = "header"; c.take = act.dive ? "dive" : act.standing ? "stand" : "jump";
        c.jump = clamp((act.v0*act.v0/(2*9.81))/(.55*(a.scale || 1)), .1, 1.2);
        c.tc = Math.max(0, act.tc - act.t - alpha*H);
        predAt(ms, c.tc, PB); c.ball = c._ball || (c._ball = {x:0, y:0, z:0}); c.ball.x = PB.x; c.ball.y = PB.y; c.ball.z = PB.z;
        const tg = act.target; c.dir = tg ? dirTo(c, tg.x - a.m.x, tg.z - a.m.z) : yawDir(c, a.m.yaw);
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
  // a receive coming: the ball on its way into his reach within RECV_LEAD s, and it is his to take (P6-A, recvFor)
  if (!act && a.role === "player" && ms.ball.state === "free" && ms.poss.ctl !== a.id){
    const r = recvFor(V, R, a, ms);
    if (r) return r;
  }
  // a clip still finishing (its follow-through, the get-up after a slide; a receive once the touch is his, on the
  // simulation's own contact)
  if (R.clip && R.clip.mode !== "receive") return R.clip;
  if (R.clip && R.clip.mode === "receive" && ms.t < R.clip.until && !act){ const c = recvKeep(V, R, R.clip, a, ms); if (c) return c; }
  R.clip = null;
  // a celebration after a goal, for the scorer and the team-mates near him, while play is stopped for it
  if (ms.phase === "goal" && V.goalEv && a.team === V.goalEv.team && a.role === "player" && !a.isGK){
    const sc = ms.agents[V.goalEv.scorer];
    if (sc && (a === sc || Math.hypot(sc.m.x - a.m.x, sc.m.z - a.m.z) < 18)){
      const c = R.cel && R.cel.id === V.goalEv.id ? R.cel : (R.cel = {mode:"celebrate", id:V.goalEv.id, style:CELEB[(a.id + V.goalEv.id) % (a === sc ? 4 : 3)]});
      if (a.m.speed < 2.5) return c;
    }
  }
  locoOf(loco, a);
  // a call for the ball (the hand up and down again, UF-A U10), the assistant's flag (up and out); shielding the ball
  // (P2b-B): the shield's upper body, the arms out and back to feel the man behind, over whatever the legs do; a
  // throw-in's taker with the ball in his hands (UF-A U6)
  const hand = handUp(R, a, ms, false), hold = throwHold(V, R, a, ms);
  if (hold) loco.upper = hold;
  else if (shielding(a)) loco.upper = UP_SHIELD;
  else if (hand) loco.upper = hand;
  else if ((R.readyUp = readyFor(V, R, a, ms))) loco.upper = R.readyUp;
  else if (a.role === "ar" && V.flag && V.flag.agent === a.id && ms.t < V.flag.until) loco.upper = UP_FLAG;
  else if (a.isMe) loco.upper = windUpper(V.wind, a.m.speed, R.windUp || (R.windUp = {}));
  return loco;
}
const UP_FLAG = {g:"point", w:1}, UP_SHIELD = {g:"shield", w:1};
// a dead ball's walk-up (actions.js: he steers to his plant spot, BACK m behind the ball, slowing as he comes onto it,
// at no less than V m/s here, and strikes once in the window): the strike clip starts once that is under LEAD s away
const WALKUP = Object.freeze({BACK:.62, V:.5, LEAD:.55});
// is this body shielding the ball now: the engine's resolved shield (actions.js a.shield.on) when it has one, else its
// intent (the AI's or yours); never in the middle of an action
const shielding = a => !a.act && (a.shield ? !!a.shield.on : !!(a.intent && a.intent.shield));
// a tackle's or a slide's contact time (seconds into it): the simulation's act.tc, else its tEff
const tackleTc = act => act.tc != null ? act.tc : act.tEff != null ? act.tEff : .3;
// where the tackling foot meets the ball: act.contact (the simulation's), else the ball predicted at the contact
function contactOf(ms, a, act, tcl, out){
  const C = act.contact;
  if (C && C.x != null){ out.x = C.x; out.y = C.y != null ? C.y : .11; out.z = C.z; return out; }
  predAt(ms, tcl, PB); out.x = PB.x; out.y = PB.y; out.z = PB.z;
  return out;
}
// the side of the body a point is on ('R' or 'L', the strike clips' convention: control.js resolveAction)
function sideOf(a, p){ const f = dirOf(a.m.yaw); return (p.x - a.m.x)*-f.z + (p.z - a.m.z)*f.x >= 0 ? "R" : "L"; }
/* locomotion from the agent's mover (P2-B, MV-8): its speed; the speed it is asked for (st.intent: the mover's target,
   0 when nothing is asked of it: a stop starts from that, not from the legs guessing it from the slowing root); and a
   backpedal when it goes backwards with its facing held (st.style: the gait's backwards steps from the first frame,
   rather than once its smoothed heading has swung round) */
// (P9-A, MV-9) jockeying (the AI's pressMove stance, state 'jockey'; yours, the strafe your held jockey asks for) is the
// gait's jockey style: side-on lead and trail steps, the lead foot never crossing, up to 3.2 m/s. (MV-15) fatigue is
// 0 to 1 from the breath (fatigueOf), so the tired stance (moves.js 'tired', above 0.7) can be reached
export const fatigueOf = a => a.st ? clamp(1 - (a.st.B || 0)/60, 0, 1) : 0;
const jockeying = a => a.state === "jockey" || (a.isMe && !!a.intent && !!a.intent.strafe);
function locoOf(st, a){
  const m = a.m;
  st.mode = "move"; st.speed = m.speed;
  st.intent = m.target > 0 ? m.target : 0;
  // (the jockey's side-on steps only going sideways or back: going forward at the man, a jockeying body runs, as a
  // shuffle forward would drag its planted feet)
  const off = Math.abs(Math.atan2(Math.sin(m.heading - m.yaw), Math.cos(m.heading - m.yaw)));
  st.style = jockeying(a) && m.speed <= 3.4 && (off > .9 || m.speed < .3) ? "jockey"
    : m.speed > .3 && off > 2.1 ? "backpedal" : undefined;
  st.fatigue = fatigueOf(a);
  return st;
}
/* (P9-A, MV-15) tired: standing (under TIRED_V m/s) with fatigue above TIRED_ON, hands on the thighs (moves.js
   'tired'), until it falls below TIRED_OFF or he moves or acts. The same rule for every body: the AI's and yours */
const TIRED_ON = .7, TIRED_OFF = .7, TIRED_V = .3;
function tiredSt(R, a){
  const f = fatigueOf(a), on = !a.act && a.m.speed < TIRED_V && (R.tired ? f > TIRED_OFF - 1e-9 : f > TIRED_ON);
  if (!on){ if (R.tired){ if (R.clip === R.tired) R.clip = null; R.tired = null; } return null; }
  if (!R.tired) R.tired = {mode:"tired", key:"tired", id:++CLIP_N, ref:null};
  R.clip = R.tired;
  return R.tired;
}
/* (P9-A, GK-3) a keeper's hands without a dive. Each state shows its pose from the step it begins:
     claim   gkcatch (high, the ball where he meets it, the contact on the claim's own time), or gkpunch once the
             simulation logs his punch
     spread  gkcollect smother, down at the man's feet
     hold    (gathered, not from a dive or a claim) gkcollect scoop for a ball off the grass, gkcatch chest above it,
             for the clip's length from the step he gathered it
     a tip over the bar without a dive: gktip */
const GKC = {scoop:.75, chest:.6};
function gkHands(V, R, a, g, ms, alpha){
  const prev = R.gkPrev; R.gkPrev = g.state;
  const sv = V.saves.get(a.id), now = ms.t + alpha*H;
  if (g.state === "claim" && g.claim){
    const punched = sv && sv.outcome === "punch" && sv.t >= g.claim.at - 1e-6;
    const c = clipFor(R, punched ? "gkpunch" : "gkcatch", g.claim);
    c.mode = punched ? "gkpunch" : "gkcatch"; c.height = "high"; c.jump = 1; c.hands = 2;
    c.ball = xz(c._ball || (c._ball = {x:0, y:2.3, z:0}), g.claim.x, g.claim.z); c.ball.y = clamp(ms.ball.p.y, 1.6, 2.75);
    c.tc = punched ? undefined : g.claim.t - (now - g.claim.at);
    R.gkCol = null;
    return c;
  }
  if (sv && sv.outcome === "punch" && now - sv.t < .6 && !g.plan){
    const c = clipFor(R, "gkpunch", sv); c.mode = "gkpunch"; c.hands = 2; c.jump = 1; return c;
  }
  if (sv && sv.outcome === "tip" && now - sv.t < .7 && !g.plan){
    const c = clipFor(R, "gktip", sv); c.mode = "gktip"; return c;
  }
  if (g.state === "spread"){
    const c = clipFor(R, "gksmother", R.gkSpread || (R.gkSpread = {}));
    c.mode = "gkcollect"; c.style = "smother"; c.side = (a.id % 2) ? 1 : -1;
    return c;
  }
  if (R.gkSpread && g.state !== "spread") R.gkSpread = null;
  // gathered: the step his state turns to hold from anything but a dive or a claim
  if (g.state === "hold" && prev && prev !== "hold" && prev !== "dive" && prev !== "catch" && prev !== "ground" && prev !== "getUp" && prev !== "claim" && !g.plan){
    const b = ms.ball.p, low = b.y < .55;
    R.gkCol = {t0:now, low, ball:{x:b.x, y:b.y, z:b.z}};
  }
  const K = R.gkCol;
  if (K && g.state === "hold" && now - K.t0 < (K.low ? GKC.scoop : GKC.chest)){
    const c = clipFor(R, K.low ? "gkcollect" : "gkcatch", K);
    c.mode = K.low ? "gkcollect" : "gkcatch"; c.style = "scoop"; c.height = "chest"; c.ball = K.ball; c.tc = 0;
    return c;
  }
  if (K && g.state !== "hold") R.gkCol = null;
  return null;
}
// (P9-A, GK-3) a keeper's throw or roll: the ball drawn in his throwing hand (the right) while the act holds it, and for
// GK_BLEND s after the release from where the hand let it go onto the simulation's own (its release point is the
// simulation's hands, a little off the drawn hand's)
const GK_BLEND = .12, _gh = {x:0, y:0, z:0};
function gkBall(V, ms){
  const bm = V.ball.mesh;
  for (const id of ms.gks || []){
    const a = ms.agents[id], R = a ? V.rec[a.id] : null; if (!R || R.hidden) continue;
    const act = a.act;
    if (act && (act.kind === "gkthrow" || act.kind === "gkroll") && !act.done && ms.ball.state === "held" && ms.ball.holder === a.id){
      if (handBall(R.h, -1, _gh)){ bm.position.set(_gh.x, _gh.y, _gh.z); R.gkHand = {x:_gh.x, y:_gh.y, z:_gh.z, t:-1}; }
    } else if (R.gkHand){
      if (R.gkHand.t < 0) R.gkHand.t = ms.t;
      const k = (ms.t - R.gkHand.t)/GK_BLEND;
      if (k >= 1){ R.gkHand = null; continue; }
      const w = 1 - k*k*(3 - 2*k), p = bm.position, q = R.gkHand;
      p.set(p.x + (q.x - p.x)*w, p.y + (q.y - p.y)*w, p.z + (q.z - p.z)*w);
    }
  }
}
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
/* ---------- the first touch (P6-A: TRAINING-SPEC 5, never an animation where the ball is not) ----------
   recvFor: a first touch about to happen. The contact is found the way the simulation takes it (actions.js touchCheck
   and envAhead): step by step ahead, the ball where it will be at the start of each step (or at its end, or half way
   through it, in envAhead's order and with its LATER_MIN), his body where his run takes him by that step's end, inside his control radius (zone.js R for the ball as
   it will be then), never before the simulation lets him play it (zone.js playableFrom: a lost 50/50, his own touch a
   moment ago, a stagger), his body carried on at the pace it really went over the last step (a shove included). The
   first such step is the contact: its time and the ball's centre then are the clip's st.tc and st.ball. The clip starts when that contact is under RECV_LEAD s away and he is the one to take it; its part is
   touch.js touchPart's (the simulation's own rule: the foot, the raised foot for a ball in the air out to his side or
   when he asks for the foot, the thigh, the chest), on the side of his body the ball is on (his own foot for a ball
   straight at him). Up to the contact the clip is kept on the contact as it is worked out again every frame (a ball
   that changes course is followed; one that no longer comes to him takes the clip away again), and once the
   simulation has taken the touch (the ball's last touch his control) on the simulation's own point and moment.
   It is over at most RECV_HOLD s after the contact (moves.js ends it sooner), and he is never held in it. Before the
   clip, a ball coming to him within READY s is watched: the upper body's 'ready' gesture (moves.js). */
const RECV_LEAD = .45, RECV_HOLD = .35, READY = 1.3;
const RA = {m:{x:0, z:0, yaw:0, vx:0, vz:0, speed:0}, at:null, scale:1, fac:null, y:0, st:null, plan:null}, RBALL = {p:{x:0, y:0, z:0}, v:{x:0, y:0, z:0}};
const CS = {n:-1, t:0, x:0, y:0, z:0, d:0, r:0};
// (actions.js envAhead: the ball now, else where it is at the end of the step, else half way; one inside only at the
// end and still beyond LATER_MIN is left for the next step)
const HALF3 = [0, 1, .5], LATER_MIN = .45;
/* the ball's predicted path read from where the ball really is now: the path cache (actions.js refreshPred) may have
   been made before or after the ball's own step of the step it was made in, so its time 0 is the ball now or a step
   on; the offset (0, one step or two back) is the one whose point is the ball now (ms.pred at 30 Hz, read with
   actions.js predAt, which holds a time before the path's start to its first point) */
let PRED_OFF = 0;
function predSync(ms){
  const b = ms.ball.p;
  let best = Infinity;
  PRED_OFF = 0;
  for (let k = 0; k < 3; k++){
    predAt(ms, -k*H, PB);
    const d = Math.hypot(PB.x - b.x, PB.y - b.y, PB.z - b.z);
    if (d < best - 1e-6){ best = d; PRED_OFF = -k*H; }
  }
}
const predOn = (ms, t, out) => predAt(ms, t + PRED_OFF, out);
// the step (n, 0 = the next) the simulation will take the ball in, within tMax s, and the ball then; null for none
function contactStep(a, ms, tMax){
  const M = RA.m; RA.at = a.at; RA.scale = a.scale || 1; RA.fac = a.fac; RA.st = a.st; RA.y = 0; RA.plan = a.plan;
  M.yaw = a.m.yaw; M.vx = a.m.vx; M.vz = a.m.vz; M.speed = a.m.speed;
  const bv = ms.ball.v; RBALL.v.x = bv.x; RBALL.v.y = bv.y; RBALL.v.z = bv.z;
  const N = Math.ceil(tMax/H);
  // (no step before the simulation lets him play it: a lost 50/50, his own touch a moment ago, a stagger)
  const tFree = playableFrom(ms, a, H);
  if (!(tFree <= ms.t + N*H + 1e-9)) return null;
  const v = bodyV(a);
  predSync(ms);
  for (let n = Math.max(0, Math.ceil((tFree - ms.t)/H - 1e-6)); n <= N; n++){
    // (his body at the end of that step: the simulation moves him before it looks at the ball, at the pace he went
    // over the last step, a shove from the man on his back included)
    const tb = (n + 1)*H;
    M.x = a.m.x + v.x*tb; M.z = a.m.z + v.z*tb;
    for (const f of HALF3){
      predOn(ms, (n + f)*H, PB);
      RBALL.p.x = PB.x; RBALL.p.y = PB.y; RBALL.p.z = PB.z;
      if (zonePart(PB.y, RA.scale) === "head") continue;
      const d = Math.hypot(PB.x - M.x, PB.z - M.z), r = zoneR(RA, RBALL, ms);
      if (r > 0 && d <= r && f === 1 && d > LATER_MIN) break;
      if (r > 0 && d <= r){
        // (the touch is put on the ball as it is at the start of that step)
        if (f) predOn(ms, n*H, PB);
        CS.n = n; CS.t = n*H; CS.x = PB.x; CS.y = PB.y; CS.z = PB.z; CS.d = d; CS.r = r;
        return CS;
      }
    }
  }
  return null;
}
// the body's own pace over the simulation's last step (its mover's velocity, and the pushes of separation, which the
// mover's velocity does not carry: a defender leaning on his back moves him); the mover's for a jump in place (a
// restart's placement)
const BV = {x:0, z:0};
function bodyV(a){
  const m = a.m;
  BV.x = m.vx; BV.z = m.vz;
  if (a.x0 != null && isFinite(a.x0) && isFinite(a.z0)){
    const vx = (m.x - a.x0)/H, vz = (m.z - a.z0)/H;
    if (Math.hypot(vx, vz) < 12){ BV.x = vx; BV.z = vz; }
  }
  return BV;
}
// the drawn moment now, in the simulation's time: between the last two steps
const drawnT = (V, ms) => ms.t - H + V.alpha*H;
const mineFor = (a, ms) => { const p = a.plan; return a.isMe || (p && (p.kind === "receive" || p.kind === "chase" || p.kind === "intercept")) || (ms.kick && ms.kick.ev && ms.kick.ev.recv === a.id); };
function recvFor(V, R, a, ms){
  if (!mineFor(a, ms)) return null;
  const c0 = R.clip && R.clip.mode === "receive" ? R.clip : null;
  if (c0 && ms.t < c0.until) return recvKeep(V, R, c0, a, ms);
  // (the ball his already: a dribble, not a first touch; somebody else's: his to win off him, not to receive)
  if (ms.poss.ctl >= 0) return null;
  const k = contactStep(a, ms, RECV_LEAD);
  if (!k) return null;
  return recvStart(V, R, a, ms, k);
}
// the part the simulation will take the contact k with (touch.js touchPart, his body where his run has taken him by
// then) and the clip's own name for it: the foot's inside, the sole on a slow ball at the grass, the raised foot
const RP = {zpart:"", part:"", side:""};
function recvPart(a, ms, k){
  const v = bodyV(a);
  RA.m.x = a.m.x + v.x*(k.t + H); RA.m.z = a.m.z + v.z*(k.t + H);
  RBALL.p.x = k.x; RBALL.p.y = k.y; RBALL.p.z = k.z;
  const part0 = touchPart(RA, RBALL, a.plan && a.plan.part);
  const f = dirOf(a.m.yaw), lat = (k.x - RA.m.x)*-f.z + (k.z - RA.m.z)*f.x, sc = a.scale || 1;
  RP.zpart = part0;
  RP.part = part0 === "chest" ? "chest" : part0 === "thigh" ? "thigh" : k.y > .4*sc ? "air" : k.y < .16 && Math.hypot(ms.ball.v.x, ms.ball.v.z) < 3 ? "sole" : "inside";
  RP.side = Math.abs(lat) < .1 ? (a.foot === "L" ? "L" : "R") : lat >= 0 ? "R" : "L";
  return RP;
}
// a receive clip on the contact k (a new one: moves.js starts it afresh on its id). A contact nearer than the clip's
// own lead at RECV_PACE times its pace (a ball that has only just become his: a deflection, a tackle that ran loose
// to him) starts the clip part of the way in (st.skip, at most RECV_SKIP of the way to its contact moment): the
// anticipation is cut short, so the part still gets to the ball at the simulation's moment
const RECV_PACE = 1.2, RECV_SKIP = .6;
function recvStart(V, R, a, ms, k){
  const P = recvPart(a, ms, k);
  if (P.zpart === "head"){ R.clip = null; return null; }
  const push = a.plan && a.plan.push ? {x:a.plan.push.x, z:a.plan.push.z} : null;
  const tc = Math.max(0, ms.t + k.t - drawnT(V, ms)), ct = (RECV[P.part] || RECV.inside).contact;
  const skip = Math.min(RECV_SKIP*ct, Math.max(0, ct - RECV_PACE*tc)), v = bodyV(a);
  R.clip = {key:"receive", ref:ms.predSeq, id:++CLIP_N, mode:"receive", part:P.part, zpart:P.zpart, side:P.side, ball:{x:k.x, y:k.y, z:k.z}, tc, skip,
    dStart:k.d, rStart:k.r, ballV:{x:ms.ball.v.x, y:ms.ball.v.y, z:ms.ball.v.z}, cushion:.7, push, rootV:{x:v.x, z:v.z}, ballNow:{x:0, y:0, z:0},
    tSim:ms.t + k.t, t0:ms.t, reach:(ct - skip)/RECV_SLOW, until:ms.t + k.t + RECV_HOLD, lost:0, done:false};
  ballNow(V, ms, R.clip.ballNow);
  return R.clip;
}
// (a contact with another part, or one the clip can no longer get to in time, is another contact: the clip starts
// again on it. moves.js's clock runs a clip at RECV_SLOW (0.7) to 1.4 times its own pace, so a contact more than
// c.reach s after the clip began (what is left of the way to its contact moment over 0.7) would be posed early,
// where the ball is not yet; one sooner than the clip can get to at 1.4 times its pace would be posed late)
const RECV_SLOW = .7, RECV_FAST = 1.4;
// a receive under way: kept on the contact up to it (the simulation's own once it has taken the touch), the head on the ball
function recvKeep(V, R, c, a, ms){
  ballNow(V, ms, c.ballNow);
  if (c.done) return c;
  const L = ms.ball.last;
  if (L.agent === a.id && L.kind === "control" && L.t >= c.t0 - 1e-9){
    // the simulation has taken it: on its point, at its moment
    c.ball.x = L.x; c.ball.z = L.z; c.tSim = L.t; c.tc = Math.max(0, L.t - drawnT(V, ms)); c.done = true; c.until = Math.min(c.until, L.t + RECV_HOLD - H);
    return c;
  }
  // (somebody else played it since the clip began, or he did some other way (a block, a tackle): not his touch to pose)
  if (L.t >= c.t0 - 1e-9 && L.agent >= 0){ R.clip = null; return null; }
  const k = contactStep(a, ms, RECV_LEAD);
  if (!k){
    // (it no longer comes to him: twice running before the contact, the clip goes; and once its moment has gone by
    // without the simulation taking it (a step's grace), it goes too: never a touch posed where the ball is not)
    if (ms.t < c.tSim ? ++c.lost >= 2 : ms.t > c.tSim + 2*H + 1e-9){ R.clip = null; return null; }
    return c;
  }
  c.lost = 0;
  const P = recvPart(a, ms, k);
  if (P.zpart === "head"){ R.clip = null; return null; }
  if (P.zpart !== c.zpart || ms.t + k.t - c.t0 > c.reach) return recvStart(V, R, a, ms, k);
  const tc = Math.max(0, ms.t + k.t - drawnT(V, ms)), C = R.h && R.h.mv;
  if (C && C.key === "receive" && C.id === c.id && !C.contactDone && tc*RECV_FAST < C.contact - C.tau - .04 &&
    Math.min(RECV_SKIP*C.contact, C.contact - RECV_PACE*tc) > C.tau + .02) return recvStart(V, R, a, ms, k);
  const v = bodyV(a);
  c.ball.x = k.x; c.ball.y = k.y; c.ball.z = k.z; c.tSim = ms.t + k.t; c.tc = tc;
  c.until = c.tSim + RECV_HOLD; c.rootV.x = v.x; c.rootV.z = v.z;
  if (a.plan && a.plan.push){ c.push = c.push || {x:0, z:0}; c.push.x = a.plan.push.x; c.push.z = a.plan.push.z; }
  return c;
}
// the ball as it is drawn now (between its last two steps)
function ballNow(V, ms, out){
  const b = ms.ball.p, p0 = V.ballPrev, al = V.alpha;
  out.x = p0.x + (b.x - p0.x)*al; out.y = p0.y + (b.y - p0.y)*al; out.z = p0.z + (b.z - p0.z)*al;
  return out;
}
// a ball on its way to him, a second or so off (no clip yet): the upper body's 'ready' gesture, watching it in
const RB2 = {x:0, y:0, z:0};
function readyFor(V, R, a, ms){
  if (a.act || ms.ball.state !== "free" || ms.poss.ctl === a.id || a.isGK || !mineFor(a, ms)) return null;
  let near = false;
  for (let i = 1; i <= 12 && !near; i++){
    const t = i*READY/12;
    predAt(ms, t, RB2);
    if (Math.hypot(RB2.x - a.m.x - a.m.vx*t, RB2.z - a.m.z - a.m.vz*t) < 1.6) near = true;
  }
  if (!near) return null;
  const c = R.ready || (R.ready = {g:"ready", w:1, ball:{x:0, y:0, z:0}});
  ballNow(V, ms, c.ball);
  return c;
}

/* ---------- a body's group moved under its pose (UF2-A, U12) ----------
   A clip that carries the body from its own start (a slide: groupAt) is given up or taken on: the group moves from that
   start to where the agent is (or back) in one frame, so the last pose's hips (Q 80..82, in the group's own frame) and
   the group as it was drawn are moved by as much the other way, and the blend into the new pose starts from where the
   body really was drawn. Without it the blend carried the slide's whole travel: the body shot out ahead and slid back
   over a second. B: the body's own record of its group {x, z, at, ok}; at: a groupAt clip now */
function rebase(h, B, at){
  if (B.ok && B.at !== at && h.posed){
    const dx = B.x - h.g.position.x, dz = B.z - h.g.position.z, ry = h.g.rotation.y, c = Math.cos(ry), sn = Math.sin(ry), sc = h.scale || 1;
    const lx = (c*dx - sn*dz)/sc, lz = (sn*dx + c*dz)/sc;
    for (const Pq of [h.pose, h.posePrev]) if (Pq){ Pq[80] += lx; Pq[82] += lz; }
    // (and the group as it was drawn is the new one: the feet found from that pose stay where they were, human.js)
    if (h.drawn){ h.drawn[0] = h.g.position.x; h.drawn[2] = h.g.position.z; }
  }
  B.x = h.g.position.x; B.z = h.g.position.z; B.at = at; B.ok = true;
}

/* ---------- your first-person body (matchcam.js calls this after placing the eye) ---------- */
// (UF2-A, U12) is the simulation held: its clock has not moved for FP_HELD real seconds and no replay or walk-out is
// drawn (a pause card, the pointer let go; a slow-motion hit-stop still steps well inside that)
const FP_HELD = .25;
function fpHeld(V, ms, dt){
  if (!ms || V.src || V.pre){ V.fpStill = 0; V.fpT = ms ? ms.t : 0; return false; }
  if (ms.t !== V.fpT){ V.fpT = ms.t; V.fpStill = 0; return false; }
  V.fpStill = (V.fpStill || 0) + Math.max(0, dt || 0);
  return V.fpStill > FP_HELD;
}
const FPST = {mode:"move", speed:0, root:{x:0, z:0}, armsIn:0, fatigue:0, correct:null, intent:0, style:undefined};
// x, z: where you stand; yaw: where you look; dt; armsIn (0..1), correct (the neck fix); returns the pose's events
export function fpPose(V, x, z, yaw, dt, o = {}){
  // (the charge being wound up, control.js CTRL.wind: your body poses it from the next frame, liveSt)
  if (o.wind !== undefined) V.wind = o.wind;
  const h = V.fp; if (!h) return 0;
  // (P10-B, spec 8: under one of Training's own opaque sheets nothing is drawn, so your body is not posed)
  if (overlayCovered()) return 0;
  const ms = V.ms, a = ms.agents[V.me];
  h.g.visible = !!(V.fpOn && !V.tp && !V.src && !V.hideAll);
  if (!h.g.visible) return 0;
  const s = h.scale || 1, back = o.back || 0;
  // (UF2-A, USER-ISSUES U12) the body off the grass with you: your jump (the agent's own height, the eye's too) or the
  // clip's own lift, as your whole body has it (animAgent), so the eye and the legs under it stay one body
  h.g.position.set(x - dirOf(yaw).x*back, o.y != null ? o.y : a ? a.y || 0 : 0, z - dirOf(yaw).z*back); h.g.rotation.y = yaw + Math.PI;
  // (U12) held: the simulation has not moved for a moment (the pause card, a lost pointer) while nobody replays. You
  // stand where you are, at ease, rather than run on the spot or hang in the middle of a clip under a still camera
  const held = fpHeld(V, ms, dt);
  let st = FPST;
  if (a && !held){
    const R = V.rec[a.id];
    // a strike, a tackle, a header, a receive: the same clip as your whole body, seen from inside it
    const clip = R && R.clip && R.clip.mode !== "celebrate" ? R.clip : null;
    // (U12: the clip's own root, as your whole body has it, animAgent. A slide carries the body along its curve from
    // where it began: posed from where you are now it was carried that far again, and the legs lay out ahead of the
    // eye as if you were sitting back on the grass)
    if (clip){
      st = clip;
      if (clip.groupY != null) h.g.position.y = clip.groupY;
      if (clip.groupAt){ h.g.position.x = clip.groupAt.x; h.g.position.z = clip.groupAt.z; }
    }
  }
  if (st === FPST){
    if (a && !held) locoOf(FPST, a);
    else if (held){ FPST.mode = "move"; FPST.speed = 0; FPST.intent = 0; FPST.style = undefined; }
    else { FPST.speed = o.speed || 0; FPST.intent = FPST.speed; FPST.style = undefined; }
    // (the arms kept nearer the body as you look down at a run: matchcam.js hands in its share, V.fpArms, as me.js
    // does for the life body; a caller's own armsIn wins)
    // ((P9-A, MV-15) and the neck fix the life body has, me.js neckFix: if anything brings the neck up to the eye, the
    // body gives way in its own frame; a caller's own wins. V.fpSpy counts both, for qa/tr9-anim.mjs)
    FPST.root.x = x; FPST.root.z = z; FPST.armsIn = o.armsIn != null ? o.armsIn : V.fpArms || 0; FPST.correct = o.correct || neckFix;
    FPST.fatigue = a ? fatigueOf(a) : 0;
    const sp = V.fpSpy || (V.fpSpy = {calls:0, neck:0, arms:0});
    sp.calls++; if (FPST.correct === neckFix) sp.neck++; if (Number.isFinite(FPST.armsIn)) sp.arms++;
    // (shielding: your arms come out wide and back, at the edges of your view, P2b-B; the ball of your throw-in in your
    // hands, and your hand up in front of you as you ask for the ball, UF-A U6 and U10)
    const R = a ? V.rec[a.id] : null, hold = R ? throwHold(V, R, a, ms) : null, hand = R ? handUp(R, a, ms, true) : null;
    FPST.upper = hold || (a && shielding(a) ? UP_SHIELD : hand);
  }
  void s;
  V.fpHeldNow = held;
  // (U12) a clip that carries the body from its own start (a slide, groupAt) given up or taken on: the body's group
  // moves from that start to where you are (or back) in one frame, so the last pose's hips are moved by as much the other
  // way in the group's own frame, and the blend into the new pose starts from where the body really was drawn. Without
  // it the blend carried the slide's whole travel: the body shot out ahead of the eye and slid back over a second
  rebase(h, V.fpBase || (V.fpBase = {x:0, z:0, at:false, ok:false}), st !== FPST && !!st.groupAt);
  const mask = animateHuman(h, dt, st).mask;
  // ((P9-A, MV-15) the clip posed in your eyes this frame, for the camera's action springs: matchcam.js clipCam)
  V.fpClipNow = st === FPST ? null : st;
  // (U12) your clip ends where it plays: in your eyes. Your whole body is not drawn while you look through them (its
  // actor poses it at tier 4, which runs no clip and so never says it ended, animAgent), so the clip of a strike, a
  // tackle or a slide was kept after its act, and the body in your eyes stood frozen in its last pose (lying back
  // after a slide, the legs out ahead of you) until your next action
  if (a && st !== FPST && (mask & EV.END)){ const R = V.rec[a.id]; if (R && R.clip === st){ R.doneAct = R.clip.ref; R.clip = null; } }
  if (a && V.rec[a.id]) throwBall(V, V.rec[a.id], a, ms, h, dt, "thwFP");
  return mask;
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

// a request for the ball from the controller (UF-B's handRaise, every R press, taken as a call or not): the caller's
// hand goes up (agent.js raiseHand); the view draws it from a.handUp on his body and, with fp, in your own view
export function handRaise(V, id, o = {}){
  const ms = o.ms || (V && V.ms), a = ms && ms.agents ? ms.agents[id] : null;
  if (a) raiseHand(a, o.t != null ? o.t : ms.t);
}

export function viewDispose(V){
  if (!V) return;
  // (a pooled body goes back to its pool: out of the scene, kept whole, P3-B)
  for (const R of V.rec){ if (!R) continue; SCHED.remove(R.actor); if (R.pooled){ if (R.h.g.parent) R.h.g.parent.remove(R.h.g); R.h.g.visible = false; } else R.h.dispose(); }
  V.rec.length = 0;
  if (V.fp){ if (V.fpPooled){ if (V.fp.g.parent) V.fp.g.parent.remove(V.fp.g); V.fp.g.visible = false; } else V.fp.dispose(); V.fp = null; }
  // (each ball's geometry and material are its own, pitchmesh.js ballMesh: they go with the view, P2-B perf-2; the
  // blob under it is shared and stays)
  for (const b of [V.ball].concat(V.extra)) if (b){ if (b.mesh.parent) b.mesh.parent.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
  for (const k of ["ringSpot", "ringRecv", "ripRing"]) if (V[k]){ V[k].geometry.dispose(); V[k].material.dispose(); if (V[k].parent) V[k].parent.remove(V[k]); V[k] = null; }
  // (a net still rippling is put back as it was)
  if (V.rip && V.rip.m){ V.rip.m.geometry.attributes.position.array.set(V.rip.base); V.rip.m.geometry.attributes.position.needsUpdate = true; }
  V.rip = null; V.nets = null;
  V.extra.length = 0;
}
// a pose of the view's bodies for a replay frame (replay.js): src = {agents: [{x, z, y, yaw, speed, on, mode, st, cid}], ball}
export function viewSource(V, src){ V.src = src; }
