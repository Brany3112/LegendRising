# P1 inspection: performance for low-end hardware (Legend Rising snapshot, HEAD 6b2de3b)

Read-only inspection of `scratchpad/p1tree/LegendRising`. Spec: `fp/TRAINING-SPEC.md` section 8 (training cages with up
to 12 NPCs plus GK, repeated resets, no leaks, nothing inactive running, stable 60 FPS on Low where the hardware allows).
Probes in this folder (all run against the snapshot, QA_PORT 8857, headless Chromium on SwiftShader at 1280 x 720, a
4-core Xeon container): `simcost.mjs` (node), `leak.mjs`, `leak2.mjs`, `cycles.mjs`, `snapdiff.mjs`, `mgstill.mjs`,
`frame.mjs` (Low, Medium, High), `prof.mjs` (CPU and allocation sampling over CDP), `tasks.mjs`, `tris.mjs`,
`bodies.mjs`. Raw outputs: `leak.json`, `leak2.json`, `cycles.json`, `snapdiff.json`, `frame-*.json`, `prof-*.json`,
`tasks.json`.

Caveats on every number below:
- SwiftShader GPU milliseconds are a relative proxy only; they say nothing about a real GPU. Real hardware was not tested.
- CPU milliseconds are this container's Xeon; DESIGN 3.9.4 assumes about 3x on a weak laptop.
- Non-isolated pages have a 0.1 ms `performance.now()` grain; where it mattered I timed blocks of frames.
- Allocation rates depend on JIT warm-up: numbers are given after 2400 warm frames unless noted.
- The Training Mode cage does not exist yet (no "cage", "Numpad1", training hub in js/). The closest live analogues are
  `__fp.enter("test:11v11", {tier: 0, crowd: 0})` (25 bodies on a bare stadium pitch, no crowd) and the existing
  ground drills (`training.js`, 5 to 9 bodies).

## 1. What exists and the budgets it encodes

| Piece | File:line | Status |
|---|---|---|
| Presets Low/Medium/High (one table) | js/util.js:176-207 | working. Low: no MSAA, pixelBudget 0.92e6, qMin 0.8, no shadow map, 2 point lights life / 0 stadium, Lambert, LOD near/back/lod3 8/7/30 m, animNear/animMid 12/35 m, midDiv 3, farDiv 6, hiddenHz 5, staticHz 5, groundLiteBeyond 10, crowd blocks |
| Full-pose budget per frame | js/life/human.js:1384 | working: 12 Low / 18 Medium / 24 High (fallback; no `animBudget` field in the presets) |
| Scheduler tiers T0..T4, static, occlusion rays (4/frame, kept 0.5 s), covered => all T4 | js/life/core/sched.js:147-235 | working (verified by probe: tiers [6.35, 0, 9, 0, 9.65] in a live 11v11 on Low) |
| Match bodies never below T2 while visible | sched.js:155-158 | working |
| SCHED.fixed (DESIGN 1.4.3) | sched.js:83-86 | exists but unused (FIXED count 0 in every state probed). The match runs its own accumulator, controller.js:509-517 (max 4 steps, rest dropped); training its own per world sub-step, training.js:446-458 (TRAIN.MAX_STEPS 4 per 0.05 s slice). SCHED.stats().fixedMs never sees the simulation |
| World frame: 1/20 s slices, frame capped at 0.25 s | js/life/world.js:176-252 | working |
| Adaptive quality (resolution, then crowd, then LOD; Auto steps a tier down after 8 slow s at the floor) | js/life/core/quality.js:157-190 | code read only; not exercised (frozen probes never call quality()) |
| Render skip while the screen is covered (DESIGN 3.9.6) | quality.js:57-63 defines screenCover/isScreenCovered | partial: SCHED and sky shadow/env bakes honour the fade (sky.js:203, 398), but world.js:236-237 draws every frame regardless; `screenCover()` and `isScreenCovered()` are called by nobody outside quality.js |
| Hub/title stop the 3D loop | js/life/phone.js:49-66, js/ui/main.js:321 | working (stopLife after the hub slides out) |
| `?perf=1` probes | js/life/perf.js | working; gives calls, tris, render/step/sched/sky ms, tiers, rays |
| qa/perf.mjs gate | qa/perf.mjs:51-56 | working for life views only (bedroom..town-road). No stadium, match, training or body-count view |
| qa/perf-baseline.json (2026.10.11c) | qa/perf-baseline.json | partial: life views only, stadium views listed as "missing"; its `animMs` is W.anims closures run again (qa/record-perf.mjs:16,56), not people's animation; `gfxLow` is always false because it reads `window.GFX` and GFX is a classic-script const (record-perf.mjs:76) |

Baseline (SwiftShader) Low numbers that matter for a pitch: `pitch` view 26 calls, 14.6k tris, step 1.4 ms median,
render submit 2.9 ms; `yard` 44 calls, 37.6k tris. Medium/High pitch: 32/30 calls, 40k/38k tris, render 3.8x/6.3x Low.

## 2. Measured costs at Low / Medium / High (test:11v11, 25 bodies, FP view from your agent)

`frame.mjs`, frozen loop, each frame = `__life.stepN(1)` then render then a 1 px readPixels.
"cage" = stadium tier 0 without crowd; "stadium" = tier 2 with a 9000 crowd.

| Preset / variant | step ms med (p95) | anim ms med | render submit ms med | SwiftShader GPU ms med | calls | tris | full poses / frame |
|---|---|---|---|---|---|---|---|
| Low cage | 3.5-3.6 (5.5-7.3) | 1.4-1.5 | 3.6-3.9 | 100-110 | 33 | 35.8k | 7-11 (budget 12) |
| Low stadium | 2.0 (3.5) | 0.7 | 2.9 | 138 | 37 | 43.8k | 11 |
| Medium cage | 4.5 (10.5) | 2.0 | 5.2 | 404 | 33 | 47.5k | 15 (budget 18) |
| Medium stadium | 3.2 (5.6) | 1.1 | 4.3 | 818 | 37 | 67.4k | 16 |
| High cage | 4.0 (5.6) | 1.7 | 5.5 | 781 | 33 | 52.8k | 17 (budget 24) |
| High stadium | 3.5 (21.1) | 1.3 | 5.6 | 1224 | 37 | 76.5k | 19 |

(Order effects: the first variant of each run is less JIT-warm; Medium/High had 10 frames only.) Shadow map on for
Medium/High (stadium statics once per half on Medium, humans cast at 15 Hz on High), off on Low. Draw calls are far
under the 1.5.11 stadium budget (70) on every preset.

After 2400 warm frames (`prof.mjs`, Low cage, render included): 5.86 ms wall per frame (step + render submit), of which
the step alone is 2.46 ms (no-draw run). Against DESIGN 1.5.11 (stadium live play on Low <= 4.0 ms CPU on the reference
Xeon) this is about 45% over; the render submit (about 3.4 ms) is the larger half.

Simulation alone (node, `simcost.mjs`, optimised code, 3 plays x 3600 steps, best per step):

| Config | agents | mean ms/step | p99 | max | alloc bytes/step | createMatch ms |
|---|---|---|---|---|---|---|
| 11v11 match (+ref, 2 ARs) | 22 | 0.057 | 0.33 | 0.83-0.89 | 650-900 | 40-50 (first; includes lazy tables) |
| 6v6+GK drill config | 13 | 0.013-0.022 | 0.13 | 0.79-0.88 | 700-1500 | 1.5-3.5 |
| 3v3+GK drill config | 7 | 0.007-0.009 | 0.012-0.016 | 0.07-0.15 | 1200 | 1.0 |

The cage-like configs I built idle after the first ball leaves play (drill laws, restarts off, no feed script), so
their cost is a lower bound; the 11v11 figure is the upper bound per agent (about 2.6 us per agent per step). 200 resets
(createMatch + 1 s of play) cost 2.9-3.5 ms each and left 0.4-0.5 MB of heap (lazy caches, not growing per reset).

Bodies (`tris.mjs`): footballer near 3020 tris non-indexed (9060 verts, 408 KB shared attributes + 54 KB own colours),
far 1186, LOD3 224, shirt number 294 (a second draw within 6 m on Low), 20 bones. One draw call per visible body
(+1 for the number), blobs are one InstancedMesh (96 slots) for everyone. A body whose shape is not cached takes
18-30 ms to build (`tris.mjs` buildMs); 13 cached-shape bodies take 6.5-11 ms to make and 0.3-1.9 ms to dispose
(`bodies.mjs`), with renderer counts stable over 10 rebuilds (geometries 54, textures 116).

Synthetic bodies (`frame.mjs` synthetic, jogging, in view, Low): full pose 14-19 us per body, T2 average 8-10 us per
body; 13 bodies 0.25 ms (T0) / 0.14 ms (T2); 25 bodies 0.42 / 0.25 ms; 40 bodies 0.58 / 0.33 ms. Each body +1 draw
call (29 -> 42 -> 54 -> 69). The match path costs 2 to 4 times more per body (0.7-1.5 ms for 25: view.js liveSt,
receive prediction recvFor with up to 10 predAt calls per eligible body per frame, clips, IK).

## 3. Hot paths per frame (Low, 25 bodies, after warm-up, `prof-draw-warm.json`, ms per frame)

Render side (three.js): updateMatrixWorld 0.39 (whole graph every frame: 739 objects, 166 with matrixAutoUpdate,
about 560 are bones of 28 bodies, hidden ones included), projectObject 0.30, multiplyMatrices 0.20 (skeleton
boneMatrices), texSubImage2D 0.15 (bone textures re-uploaded for every visible skinned mesh every frame, posed or
not), setProgram 0.12, chunks.js occlusion occFrame/occFace/occSort 0.26 together, getTextureCacheKey 0.08.
Game side: controller.js `proj` 0.19-0.32 (reads canvas clientWidth/clientHeight on every call, controller.js:727-735,
after the HUD has written styles: forced layout; training.js:479 already caches HS.w/HS.h once a frame), fphud hudFrame
0.07-0.12, animateHuman 0.10-0.19, writeBones 0.08-0.10, gait (gaitStep, gaitLegs, cycleStep, planLanding, swingAt)
about 0.33 in all, view.js animAgent/liveSt 0.10, simStep 0.05-0.06, brain 0.07-0.18, GC 0.09 (0.14-0.27 before warm-up).
`(program)` (native, incl. GL command submission and style/layout) 1.4 ms.

Scheduler tasks per frame (`tasks.json`): 'anims' 0.04-0.14, 'merge' 0.04-0.20 (chunks.js:696-702 polls every merged
item's matrix and material every frame even when nothing moves), 'chunks' 4 Hz, 'gfx', 'anim-frame', 'fp-match',
'fp-resume', 'balls', and once training.js is loaded 'train-coach' (kind keep, every frame forever, 0.001-0.004 ms).

## 4. Per-frame allocations

Browser, Low, 25 bodies, render included, after 2400 warm frames: about 157 KB per frame (9 MB/s at 60 FPS); 92 KB per
frame without rendering after 420 frames; 356 KB per frame before warm-up. Top sites (bytes/frame): iterator `next`
14k, rig.js solveLeg 8.7k, gait.js gaitLegs 5.5k / gaitPose 4.9k / cycleStep 3.1k, three setValueM4 5.2k /
updateTexture 4.9k / getTextureCacheKey + join 7k (bone textures), mover.js moverStep 4.6k / timeToPointQ 3.1k,
chunks.js occSort/occFrame/byNear 9.4k, view.js recvFor 3.6k / liveSt 2k, sched.js tierOf 2.6k (+ frustumFrom
allocates `row()` arrays and a `planes` array of arrays every frame, sched.js:52-54), human.js scene.onBeforeRender 2.3k.
Most of this is doubles boxed into tagged fields and short arrays, not big objects. Explicit per-frame object literals:
view.js:217, 247, 269-270 (c.dir / c.ball made every frame during a kick, header or throw), view.js:157 (a closure per
cone per frame in spares()). DESIGN 3.9.6 says the simulation, ball and touch code allocate nothing per step: in node
(optimised) simStep allocates 0.65-1.5 KB per step, so it is close to but not at zero.

## 5. What runs or is kept when it is not needed

- The frame is drawn under an opaque fade or cover (world.js:236-237; quality.js:57-61 screenCover never called).
- updateMatrixWorld walks hidden subtrees and the bones of out-of-view (T4) bodies every frame (three default).
- Bone textures upload every frame for every visible skinned mesh, also on frames a T3 body is not posed.
- In a drill at the ground, the life squad (13 SCHED actors) and the coach keep thinking and moving at hiddenHz;
  the scene keeps its 593-741 objects; the 'merge' poll keeps running.
- 'train-coach' runs every frame in every zone after training.js is first loaded (training.js:139).

## 6. Leaks across zone changes, match restarts and drill resets

Verified with probes:

1. BatchedMesh internal textures are never disposed (renderer.info.memory.textures +102 per home<->ground round trip,
   +32 to +36 per stadium rebuild / match restart; `leak.json`, `cycles.json`). Root cause: chunks.js:67 makes one
   THREE.BatchedMesh per material key per zone; world.js clearScene (75-84) disposes `o.geometry` and `o.material` only,
   never `o.dispose()`, and resetChunks (chunks.js:37-42) does not dispose them either. BatchedMesh keeps
   `_matricesTexture`, `_indirectTexture` (and `_colorsTexture`), disposed only by BatchedMesh.dispose()
   (vendor/three.core.js:27781-27799). `leak2.json` lists the orphans: 57 small DataTextures from one home visit, 51
   from one ground visit, 37 per stadium build. JS heap did not grow with it (the objects become collectable), so the
   GPU memory goes when GC runs, but the renderer's counters drift and any leak gate on renderer.info is blind.
2. The match ball (and spare balls) leak per view: view.js:69 / 163 call ballMesh(), which clones the ball geometry and
   makes a new Lambert material each time (pitchmesh.js:410); viewDispose (view.js:408-413) only removes the mesh from
   its parent. On top, chunks.js keeps every mesh it ever scanned that did not stay still in MG.still (chunks.js:688),
   pruned only by resetMerge on a zone change (chunks.js:467). `mgstill.mjs`: 1 old ball held per drill cycle (6 after 6
   cycles), `snapdiff.json`: per drill cycle +0.7 Mesh, +0.7 SphereGeometry, +0.7 MeshLambertMaterial, +2.1 buffer
   attributes, about 7 KB of ArrayBuffer data retained; `cycles.json`: heap after forced GC +0.1 MB per drill
   start/quit over 15 cycles (22.67 -> 24.13 MB). The cloned geometry is never disposed, so three's binding-state cache
   (keyed by geometry.id) keeps its VAO and attributes even after the zone change.
3. Not leaking (verified): window/document listeners (net 0 over 4 match restarts and 4 zone round trips; training's
   RMB listeners are added and removed per enter/exit, training.js:364-371 read), pending intervals and timeouts (0),
   SCHED tasks/fixed/actors back to baseline after every drill quit and match exit, human bodies (bodies() count back
   to 15 at the ground; human dispose frees geometry and skeleton, 10 rebuilds of 13 bodies left geometries/textures
   unchanged), DOM node count (816 at the ground, 792 after match exit, stable), camera owners back to 1, programs stable.
4. Unbounded by design: the human SHAPES cache (human.js:974) keeps one shape (about 0.4 MB near + far + LOD3) per
   distinct look key forever. A cage that makes new random looks per reset would grow it; a fixed seeded pool does not.

## 7. How many animated humans Low can afford

Reference Xeon CPU per frame, Low (from sections 2-3): scene base (cage-like pitch, your FP body, HUD) about 0.6 ms
step + 2.5-3 ms submit; each match body about 30-60 us of view + animation and roughly 40-60 us of render-side work
(matrix walk, bone upload, draw), so about 0.1 ms per body all in. With DESIGN's 4.0 ms reference budget (12 ms on a
weak laptop at 3x, leaving room inside 16.7 ms) that is roughly 13-16 bodies at full rate, and 25 only with the T2
throttling (measured 5.9 ms for 25: over budget). GPU-side the bodies are cheap on Low (13 near bodies = 39k tris, 13
draws). This is an estimate from the container, not a real-hardware measurement; Intel UHD 620 acceptance (DESIGN 4.10)
is still unverified.

## 8. Recommended budgets for the training cage (up to 6 v 6 plus an AI keeper, plus you: 13 agents, 14 bodies)

Low at 1280 x 720, measured with the frozen-step method of frame.mjs on the reference container unless stated:
- Draw calls <= 45 (pitch and lines 4-6, goals and nets 2-4, the whole cage fence as 1-2 instanced or batched draws,
  cones instanced 1, 14 bodies, at most 4 shirt numbers, ball + blobs 2, sky 1); triangles <= 80k; 0 point lights;
  no shadow map (blobs). Medium: humans do not cast (statics only). High: humans cast at <= 15 Hz.
- CPU: world step <= 2.0 ms p95; simulation <= 0.15 ms per 60 Hz step (13 agents, AI included; measured 0.01-0.06);
  animation <= 0.6 ms with at most 12 full poses a frame (participants as kind 'match', T0 only for the ball-involved
  and the near ones); HUD <= 0.2 ms with zero forced layouts (cache canvas size once per frame as training.js does);
  render submit <= 2.5 ms; total <= 4.5 ms median and <= 6 ms p95. Real hardware: UHD 620 holds 60 FPS with GPU work
  <= 12 ms (needs a manual run).
- Allocation: <= 16 KB per frame steady state after warm-up (about 1 MB/s) and 0 new objects per simulation step.
- Reset (restart, replay last, reset half): <= 4 ms on the main thread with pooled bodies (reuse the 14 human()
  bodies, re-place and re-colour them; rebuilding them costs 7-11 ms here, about 25-30 ms on a weak laptop), the
  simulation state reset in place or a new createMatch (1.5-3.5 ms); never build an uncached shape during play
  (18-30 ms each): prebuildHumans under the fade on entry. A configuration change that needs new looks happens under
  the fade.
- Repeated resets: after 50 resets and 10 enter/exit cycles, renderer.info geometries, textures and programs equal to
  the value after the first cycle (+0), SCHED counts equal, window/document listener count +0, pending timers 0, DOM
  node count +0, bodies() +0, MG.still/MG.items entries for objects outside the scene 0, heap after forced GC within
  +1 MB of the first cycle (today: +0.1 MB per drill cycle, +0.3-0.8 MB per match restart with GC noise).
- Inactive: the hub/config screen stops the loop (as lifeHub does) or calls screenCover so nothing is drawn; no life
  NPCs, coach or 'merge' polling in the cage scene; static cage parts with matrixAutoUpdate off.

Fixes this implies (for the build phase, not done here): dispose BatchedMesh in clearScene/resetChunks; dispose the
ball's cloned geometry and material in viewDispose (or share one geometry and material); prune MG.still/MG.items of
objects no longer in the scene (or never scan userData.keep/transient meshes); skip render under cover; cache the
canvas size in controller.js proj; remove the per-frame literals in view.js liveSt and spares; add a cage view and a
body-count gate to qa/perf.mjs and the baseline; fix record-perf.mjs gfxLow and record people's animation.
