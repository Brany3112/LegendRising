/* ============ LIFE core: the update scheduler ============
   Owner: WP-0A creates it, WP-A tunes it. Contract: DESIGN 1.4.3, 3.9.4, 2.2 WP-0A.
   Everything that moves on its own goes through here: plain tasks (every frame, or at a rate with their phases spread),
   fixed-step tasks (an accumulator, a cap on steps a frame, the rest dropped so a slow frame slows the world rather
   than spiralling), and actors (people) given a tier each frame that says how much of their work runs.
   This is the Stage 0 scheduler: tiers T0 and T1 only (no visibility or distance thinning yet, WP-A adds those), and
   the legacy W.anims closures run as the task 'anims', inside the world's sub-steps of at most 1/20 s, exactly as the
   world has always run them. */
import {W} from "../build.js";

const TASKS = [], FIXED = [], ACTORS = [];
let frame = 0;
const ST = {tiers:[0, 0, 0, 0, 0], animMs:0, thinkMs:0, fixedMs:0, tasks:{}};
// timing (stats()) only when asked for (?perf=1 sets SCHED.timing): a clock read costs more than most tasks
const now = () => SCHED.timing ? performance.now() : 0;
const stat = (id, ms) => { const s = ST.tasks[id] || (ST.tasks[id] = {ms:0, calls:0}); s.ms += ms; s.calls++; };
const near = () => (typeof GFX === "object" && GFX && GFX.P && GFX.P.animNear) || 25;

export const SCHED = {
  timing:false,
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
  // {id, pos() -> {x, y, z}, r = 1.1, kind: 'npc' | 'static' | 'match', think?(dt), move?(dt), anim?(dt, tier), active?()}
  actor(o){
    const h = Object.assign({type:"actor", r:1.1, kind:"npc", tier:1, i:ACTORS.length}, o);
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
    ST.tiers.fill(0);
    let thinkMs = 0, animMs = 0;
    const cx = view && view.cx, cy = view && view.cy, cz = view && view.cz, lim = near();
    for (const a of ACTORS){
      // T0: a match body near the camera or in play; T1 everything else (Stage 0: nobody is thinned yet)
      let tier = 1;
      if (a.kind === "match"){
        const p = a.pos ? a.pos() : null, d = p && cx != null ? Math.hypot(p.x - cx, p.y - cy, p.z - cz) : 0;
        if ((a.active && a.active()) || d < lim) tier = 0;
      }
      a.tier = tier; ST.tiers[tier]++;
      let t0 = now();
      if (a.think) a.think(dt);
      if (a.move) a.move(dt);
      thinkMs += now() - t0; t0 = now();
      if (a.anim) a.anim(dt, tier);
      animMs += now() - t0;
    }
    ST.thinkMs = thinkMs; ST.animMs = animMs;
  },
  tierOf(h){ return h && h.type === "actor" ? h.tier : 0; },
  stats(){ return {tiers:ST.tiers.slice(), animMs:ST.animMs, thinkMs:ST.thinkMs, fixedMs:ST.fixedMs, tasks:Object.assign({}, ST.tasks), frames:frame,
    counts:{tasks:TASKS.length, fixed:FIXED.length, actors:ACTORS.length}}; }
};

// the legacy closures (doors, curtains, the people's animation until they become actors): every sub-step, in the
// order they were pushed, exactly as world.js always ran them. build.js begin() empties W.anims on a zone change
SCHED.task({id:"anims", kind:"keep", slice:true, run:h => { for (const a of W.anims) a(h); }});
