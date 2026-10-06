/* ============ LIFE core: the update scheduler ============
   Owner: WP-0A creates it, WP-A tunes it. Contract: DESIGN 1.4.3, 3.9.4, 2.3 WP-A.
   Everything that moves on its own goes through here: plain tasks (every frame, or at a rate with their phases spread),
   fixed-step tasks (an accumulator, a cap on steps a frame, the rest dropped so a slow frame slows the world rather
   than spiralling), and actors (people) given a tier each frame that says how much of their work runs.

   Tiers, worked out once a frame for every actor from the camera of the frame before (GFX.P gives the distances):
     T0  a match body in play or near the camera (kind 'match': active() or nearer than animNear), your own body (kind
         'me'), or anything whose active() says a contact is due: everything every frame
     T1  in view, nearer than animNear: everything every frame
     T2  in view, animNear to animMid: moves every frame, thinks at 10 Hz; posed in full every midDiv frames
     T3  in view, beyond animMid: moves every frame, thinks at 5 Hz; posed in full every farDiv frames
     T4  out of view (the camera's frustum widened by 2 m, or hidden behind a wall): thinks and moves at hiddenHz with
         the time it missed, state only; one blended catch-up pose when it comes back into view
     static (posed staff, seated customers): when() asked once a second; posed at staticHz while in view (T1 or T2),
         frozen otherwise
   The pose itself is human.js's business (animateHuman executes the tier it is handed, with its own budget of full
   poses a frame); the scheduler only says which tier. Match bodies are never thinned below T2 while they can be seen.
   A body is tested for being hidden behind something (one ray from the camera, the room's walls and drawn geometry)
   only while it is a T1 or T2 candidate and not active: at most 4 such rays a frame, round robin, each answer kept for
   half a second. While the screen is covered (a fade, a time-lapse card, a hands-on minigame) every actor is T4.
   The legacy W.anims closures (doors, curtains, and the people until they are actors) run as the task 'anims' in the
   world's sub-steps of at most 1/20 s, exactly as the world has always run them. */
import {W} from "../build.js";
import {FADE, FLAGS} from "./state.js";
import {camCast} from "./collide.js";

const TASKS = [], FIXED = [], ACTORS = [];
let frame = 0, rr = 0, now0 = 0;
const ST = {tiers:[0, 0, 0, 0, 0], statics:0, animMs:0, thinkMs:0, fixedMs:0, rays:0, tasks:{}};
// timing (stats()) only when asked for (?perf=1 sets SCHED.timing): a clock read costs more than most tasks
const now = () => SCHED.timing ? performance.now() : 0;
const stat = (id, ms) => { const s = ST.tasks[id] || (ST.tasks[id] = {ms:0, calls:0}); s.ms += ms; s.calls++; };
// the preset's numbers (GFX.P), read at use time
const DEF = {animNear:25, animMid:70, midDiv:2, farDiv:3, hiddenHz:10, staticHz:15};
const gp = k => { const P = typeof GFX === "object" && GFX && GFX.P; return P && P[k] != null ? P[k] : DEF[k]; };
const OCC_PER_FRAME = 4, OCC_KEEP = .5, MARGIN = 2;

/* the camera's frustum of the last frame, each plane pushed out by MARGIN metres: kept as plain numbers (no THREE
   needed) from the camera's projection and view matrices */
const FR = new Float64Array(24);
let frOk = false;
function frustumFrom(cam){
  frOk = false;
  if (!cam || !cam.projectionMatrix || !cam.matrixWorldInverse) return;
  if (cam.updateMatrixWorld) cam.updateMatrixWorld();      // where it was left last frame, drawn or not (a test stepping)
  const p = cam.projectionMatrix.elements, v = cam.matrixWorldInverse.elements, m = MAT;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){
    let s = 0; for (let k = 0; k < 4; k++) s += p[k*4 + r]*v[c*4 + k];
    m[c*4 + r] = s;
  }
  const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const planes = [[r3, r0, 1], [r3, r0, -1], [r3, r1, 1], [r3, r1, -1], [r3, r2, 1], [r3, r2, -1]];
  for (let i = 0; i < 6; i++){
    const [a, b, s] = planes[i], x = a[0] + s*b[0], y = a[1] + s*b[1], z = a[2] + s*b[2], w = a[3] + s*b[3], L = Math.hypot(x, y, z) || 1;
    FR[i*4] = x/L; FR[i*4 + 1] = y/L; FR[i*4 + 2] = z/L; FR[i*4 + 3] = w/L;
  }
  frOk = true;
}
const MAT = new Float64Array(16);
// is a sphere (centre, radius) inside the widened frustum?
function inView(x, y, z, r){
  if (!frOk) return true;
  for (let i = 0; i < 6; i++) if (FR[i*4]*x + FR[i*4 + 1]*y + FR[i*4 + 2]*z + FR[i*4 + 3] < -(r + MARGIN)) return false;
  return true;
}

export const SCHED = {
  timing:false,
  // () -> boolean: the screen is covered (quality.js sets it: a fade, a time-lapse card, a minigame), all actors T4
  covered:null,
  /* {id, hz = 0, stagger = true, when = null, run(dt), kind = 'zone', slice = false}: hz 0 runs every frame; a rate
     runs run(dt accumulated) that often, the phases of tasks at one rate spread over the period; when() false skips
     it (the time still accumulates). slice: run(h) in every sub-step of the world's frame instead (world.js step).
     kind 'keep' survives a zone change (clear) */
  task({id, hz = 0, stagger = true, when = null, run, kind = "zone", slice = false}){
    const h = {type:"task", id, hz, when, run, kind, slice, acc:0, t:0};
    if (hz > 0 && stagger){ const same = TASKS.filter(t => t.hz === hz).length; h.t = -((same*.37) % 1)/hz; }
    TASKS.push(h); return h;
  },
  // {id, hz = 60, maxSteps = 4, run(h), onDrop = null, kind = 'zone'}
  fixed({id, hz = 60, maxSteps = 4, run, onDrop = null, kind = "zone"}){
    const h = {type:"fixed", id, hz, step:1/hz, maxSteps, run, onDrop, kind, acc:0};
    FIXED.push(h); return h;
  },
  alpha(h){ return h && h.type === "fixed" ? Math.max(0, Math.min(1, h.acc/h.step)) : 0; },
  /* {id, pos() -> {x, y, z}, r = 1.1, kind: 'npc' | 'static' | 'match' | 'me', think?(dt), move?(dt), anim?(dt, tier),
     active?() -> boolean, when?() -> boolean (static: whether it is posed at all)} */
  actor(o){
    const i = ACTORS.length;
    const h = Object.assign({type:"actor", r:1.1, kind:"npc", tier:1, i, occ:false, occT:-1, thinkAcc:0, moveAcc:0, animAcc:0, whenT:0, whenOk:true,
      phase:((i*.37) % 1)}, o);
    h.thinkAcc = h.phase*.1; h.animAcc = h.phase/(gp("staticHz") || 15);
    ACTORS.push(h); return h;
  },
  remove(h){
    if (!h) return;
    const list = h.type === "task" ? TASKS : h.type === "fixed" ? FIXED : ACTORS;
    const i = list.indexOf(h); if (i >= 0) list.splice(i, 1);
  },
  // everything of this kind; with no kind, everything but kind 'keep' (a zone change)
  clear(kind = null){
    for (const list of [TASKS, FIXED, ACTORS]){
      for (let i = list.length - 1; i >= 0; i--){ const k = list[i].kind; if (kind ? k === kind : k !== "keep") list.splice(i, 1); }
    }
  },
  // the slice tasks, once per sub-step of the world's frame (world.js step)
  slice(h){
    for (const t of TASKS) if (t.slice && (!t.when || t.when())){
      if (!SCHED.timing){ t.run(h); continue; }
      const t0 = now(); t.run(h); stat(t.id, now() - t0);
    }
  },
  // once per frame. view = {cam, frustum, cx, cy, cz}: where the camera is (the actors' tiers)
  frame(real, view){
    frame++;
    const dt = Math.max(0, real || 0);
    for (const t of TASKS){
      if (t.slice) continue;
      if (t.hz > 0){
        t.acc += dt; t.t += dt;
        if (t.t < 1/t.hz) continue;
        t.t -= 1/t.hz; if (t.t > 1/t.hz) t.t = 0;
      } else t.acc = dt;
      if (t.when && !t.when()) continue;
      const t0 = now(); t.run(t.acc); t.acc = 0; if (SCHED.timing) stat(t.id, now() - t0);
    }
    let fixedMs = 0;
    for (const f of FIXED){
      f.acc += dt;
      const t0 = now();
      let n = 0;
      while (f.acc >= f.step - 1e-9 && n < f.maxSteps){ f.run(f.step); f.acc -= f.step; n++; }
      if (f.acc >= f.step){ const lost = f.acc - f.acc % f.step; f.acc -= lost; if (f.onDrop) f.onDrop(lost); }
      const ms = now() - t0; fixedMs += ms; if (SCHED.timing) stat(f.id, ms);
    }
    ST.fixedMs = fixedMs;
    actors(dt, view);
  },
  tierOf(h){ return h && h.type === "actor" ? h.tier : 0; },
  stats(){ return {tiers:ST.tiers.slice(), statics:ST.statics, animMs:ST.animMs, thinkMs:ST.thinkMs, fixedMs:ST.fixedMs, rays:ST.rays, tasks:Object.assign({}, ST.tasks), frames:frame,
    counts:{tasks:TASKS.length, fixed:FIXED.length, actors:ACTORS.length}}; }
};

// the tier of one actor this frame (see the top of the file)
function tierOf(a, cx, cy, cz, covered, near, mid){
  if (covered) return 4;
  if (a.kind === "me") return 0;
  const act = a.active ? !!a.active() : false;
  if (act && a.kind !== "static") return 0;
  const p = a.pos ? a.pos() : null;
  if (!p) return 1;
  const d = cx == null ? 0 : Math.hypot(p.x - cx, (p.y || 0) - cy, p.z - cz);
  if (a.kind === "match" && d < near) return 0;
  if (!inView(p.x, (p.y || 0) + 1, p.z, a.r)) return 4;
  let t = d < near ? 1 : d < mid ? 2 : 3;
  if (a.kind === "match" && t > 2) t = 2;
  return t;
}
function actors(dt, view){
  ST.tiers.fill(0); ST.statics = 0; ST.rays = 0;
  let thinkMs = 0, animMs = 0;
  if (!ACTORS.length){ ST.thinkMs = ST.animMs = 0; return; }
  const cam = view && view.cam, cx = view && view.cx != null ? view.cx : null, cy = view ? view.cy : 0, cz = view ? view.cz : 0;
  frustumFrom(cam);
  const covered = !!(FLAGS.busy || (SCHED.covered ? SCHED.covered() : FADE.v >= .98));
  const near = gp("animNear"), mid = gp("animMid"), hidHz = gp("hiddenHz"), stHz = gp("staticHz");
  now0 += dt;
  // the tiers, then the occlusion rays for the T1 and T2 candidates (round robin, cached)
  const n = ACTORS.length;
  for (let k = 0; k < n; k++){ const a = ACTORS[k]; a.tier = tierOf(a, cx, cy, cz, covered, near, mid); a.i = k; }
  if (!covered && cam && cx != null){
    let rays = 0;
    for (let k = 0; k < n && rays < OCC_PER_FRAME; k++){
      const a = ACTORS[(rr + k) % n];
      if ((a.tier !== 1 && a.tier !== 2) || a.kind === "match" || a.kind === "me") continue;
      if (now0 - a.occT < OCC_KEEP) continue;
      const p = a.pos(), tx = p.x, ty = (p.y || 0) + 1.2, tz = p.z, dx = tx - cx, dy = ty - cy, dz = tz - cz, L = Math.hypot(dx, dy, dz);
      a.occT = now0; rays++;
      a.occ = L > a.r + .5 && camCast(cx, cy, cz, dx/L, dy/L, dz/L, L - a.r) < L - a.r - .05;
    }
    rr = (rr + Math.max(1, rays)) % n; ST.rays = rays;
  }
  for (let k = 0; k < n; k++){
    const a = ACTORS[k];
    let tier = a.tier;
    if ((tier === 1 || tier === 2) && a.occ && a.kind !== "match") tier = a.tier = 4;
    if (a.kind === "static"){
      // asked once a second whether it is posed at all; posed at staticHz while in view, frozen otherwise
      ST.statics++;
      if ((a.whenT -= dt) <= 0){ a.whenT = 1; a.whenOk = a.when ? !!a.when() : true; }
      ST.tiers[tier]++;
      let t0 = now();
      if (a.think) a.think(dt);
      if (a.move) a.move(dt);
      thinkMs += now() - t0;
      a.animAcc += dt;
      if (a.anim && a.whenOk && tier >= 1 && tier <= 2 && a.animAcc >= 1/stHz){ t0 = now(); a.anim(a.animAcc, tier); animMs += now() - t0; a.animAcc = 0; }
      else if (tier === 0 && a.anim){ t0 = now(); a.anim(a.animAcc, 0); animMs += now() - t0; a.animAcc = 0; }
      continue;
    }
    ST.tiers[tier]++;
    let t0 = now();
    if (tier <= 1){
      if (a.think) a.think(dt + a.thinkAcc);
      if (a.move) a.move(dt + a.moveAcc);
      a.thinkAcc = a.moveAcc = 0;
    } else if (tier <= 3){
      // moves every frame; thinks at 10 Hz (T2) or 5 Hz (T3), phases spread, with the time since it last did
      a.thinkAcc += dt;
      const per = tier === 2 ? .1 : .2;
      if (a.think && a.thinkAcc >= per){ a.think(a.thinkAcc); a.thinkAcc = 0; }
      if (a.move) a.move(dt + a.moveAcc);
      a.moveAcc = 0;
    } else {
      // out of sight: thinks and moves at hiddenHz, with the time that has gone by
      a.thinkAcc += dt; a.moveAcc += dt;
      if (a.moveAcc >= 1/hidHz){ if (a.think) a.think(a.thinkAcc); if (a.move) a.move(a.moveAcc); a.thinkAcc = 0; a.moveAcc = 0; }
    }
    thinkMs += now() - t0;
    if (a.anim){
      t0 = now();
      if (tier < 4){ a.anim(dt + a.animAcc, tier); a.animAcc = 0; }
      else { a.animAcc += dt; if (a.animAcc >= 1/hidHz){ a.anim(a.animAcc, 4); a.animAcc = 0; } }
      animMs += now() - t0;
    }
  }
  ST.thinkMs = thinkMs; ST.animMs = animMs;
}

// the legacy closures (doors, curtains, the people's animation until they become actors): every sub-step, in the
// order they were pushed, exactly as world.js always ran them. build.js begin() empties W.anims on a zone change
SCHED.task({id:"anims", kind:"keep", slice:true, run:h => { for (const a of W.anims) a(h); }});
