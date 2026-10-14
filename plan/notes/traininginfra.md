# P1 inspection: Training Mode infrastructure (read-only)

Snapshot: scratchpad/p1tree/LegendRising (committed HEAD, build 2026.10.11c). Spec: fp/TRAINING-SPEC.md (wins over DESIGN.md / ADDENDUM-feel.md).
All paths below are relative to the snapshot root. "Verified" = settled by a probe run (scripts in fp/p1/), otherwise "by reading".

Probes run (QA_PORT=8855, in-process server of qa/lib.mjs, closed with the browser):
- fp/p1/cageball.mjs (plain node, pure modules): pitchspec boards as cage fences against ball.js.
- fp/p1/probe-world.mjs: startLife with no career, career state after A.quit, key routing (Numpad1, Ctrl+Shift+1, Q in a non-life mode).
- fp/p1/probe-nos.mjs: enterZone("stadium"/"ground") and frames with S = null after the renderer exists.
- fp/p1/probe-sandbox.mjs: frames with S = null under a sandbox-like mode (clock frozen, compass off, closing off).
No file under the snapshot or /home/user/LegendRising was modified; the career slot in the probe browser was unchanged by the S = null experiments (checked).

## 1. Title screen and menus (js/ui/main.js)

- screenTitle() js/ui/main.js:319-350: no menu buttons. "Click anywhere or press any key to start" (.ts-press) plus a tools row
  (.ts-tools: full screen, Settings = openSheet('settings0'), Delete save) and the cloud corner. Any key or click starts:
  titleIntro start handler js/ui/main.js:369-378 calls A.continue(1) if a slot exists else A.newGame(1). It ignores pointerdown on
  `[data-keep], button, a, input, .cloud-corner` and does nothing while `#sheetRoot.open` or `#tutRoot.on`.
  => A Training button must be a `<button>` (or carry data-keep) so a click does not start the career; while a Training sheet is open
  keys are already ignored. Style reference: .ts-tool/.ts-del css/style.css:1728-1734 (small glass buttons); there is no large
  title-style menu button to copy. qa/lib.mjs titleStart() and qa/smoke.mjs, oldsave.mjs, wpH-boot.mjs, wpH-day.mjs, wpH2-ball.mjs,
  wpH2-centre.mjs click `.ts-press`: a new button must not cover it.
- Sheets: openSheet(kind) js/ui/main.js:717-833 is one if/else chain writing into #sheetRoot; refresh in place via morph when the same
  kind is open; closeSheet/refreshSheet :834-835. Kind "train" is TAKEN by the old 2D career training (A.train :1203-1212 uses the
  classic global TRAIN of js/data/game.js:218). Kind "settings0" is the title's settings (no S needed). Many kinds read S directly.
  A new kind (e.g. "practice") is a new branch; or a module can write its own markup into #sheetRoot.
- Confirmations: confirmBox(title, text, onYes) js/ui/main.js:33-40 (#tutRoot card, "Cancel" / "Yes, do it") - reusable for
  "overwrite preset?" / "delete preset?". While #tutRoot is on, core/modes.js locked() is true (movement locked) - fine.
- In-world panels: lpShow/lpClose js/ui/panels.js:11-30 (#lifePanel, Esc to close, lifeModalSet -> FLAGS.modal frees the pointer).
  lpClose() calls save() unless silent (panels.js:27) - harmless with S null, but with the career S in memory it schedules a career save.
- Settings rows pattern: fphud.js settingsHTML js/life/football/fphud.js:542-572 (seg buttons and range inputs calling window.fpSet(k, v),
  values from control.js SET). Good template for a scenario config sheet; it is device settings only.
- Career admin panel js/ui/admin.js (password 197501, adNum/adSel/adQuick helpers, adminSet writes S directly, exempt from the
  trust/inv lint rules). Its field helpers can be copied for look, but its setters write the career: not reusable for Training admin.
- Full screen: A.fullscreen js/ui/main.js:1296-1300 (requestFullscreen only). MISSING: navigator.keyboard.lock anywhere in js/ (grep).
- A.quit js/ui/main.js:1295 = saveNow(); closeSheet(); closePhone(); screenTitle(). It does NOT clear S, stop the play clock or the
  cloud auto sync. VERIFIED (probe-world): after A.quit, S is still the career object, PLAY_T is still running and S.playMs grew by
  6072 ms during 6.5 s on the title screen.

## 2. Starting the 3D world without a career

- startLife js/life/world.js:283-307 starts with `const s = G(); if (!s) return;` (:284). VERIFIED: at the title S === null and
  window.startLife({zone:"ground"}) returns undefined, LIFE.running stays false, #lifeRoot stays hidden.
- boot() (renderer, scene, camera, sky, input binding, compass, me camera) js/life/world.js:266-279 is module-private; startLife is the
  only caller. A sandbox needs a new exported entry (or boot exported).
- startLife also runs career-only work: ensureHome(), dailyEnsure(), sync(), bootPlanFor (first-day plan, may cover the screen and pick
  the zone), FEED.reset/moneySync, INV.render, arriveForTraining() for ground, onboardStart(), todaysFixture() notes, mailNews().
- enterZone js/life/world.js:85-114 career touches: lifeAway(true) for every zone but home (:96 -> js/events.js:167 writes
  S.events.away; VERIFIED it is set after entering ground), spawnDrops() (:104 -> js/life/core/hand.js:265 -> INV.dropsOf
  js/life/inv.js:135 `G().drops` throws when S is null; VERIFIED TypeError "reading 'drops'" for stadium), meBuild (core/me.js:76
  returns without S.player: no first-person body; VERIFIED fpBody false), onboardZone + onbEmit("zone") (first-day listeners;
  firstday.js:884 returns without S).
- Per-frame career reads (world.js tick :213-256): passive clock pass() only when flags.clock === "life" (acts.js:43 dailyPass),
  compassStep when flags.compass (VERIFIED throws with S null: compass.js:73 -> jobState career.js:589), the ground zone's tick
  closingTime -> centreOpen (VERIFIED throws: daily.js:52), seasonOver/DAILY.seasonPending, saves every 45 s (saveNowIf returns without S).
  hud() js/life/core/hud.js:83-84 returns at once without S: the E prompt (#lifePrompt) for spots is never drawn in a career-free world
  (E itself still works through world.js lifeInput).
- VERIFIED (probe-sandbox): with the renderer up, a registered mode with {clock:"frozen", compass:false, closing:false, homeTick:false,
  tunnel:false, targeting:false, saves:"defer", hud:"none"}, S = null and the stadium zone built, 120 frames stepped with no error and
  W moved the player (P.z -0.69 in 30 frames). So S === null is workable once: boot is reachable, spawnDrops/dropsOf is guarded (or the
  zone skips drops), the mode turns compass/closing/clock off, the prompt drawing is split from the career meters, and a body is
  supplied (view.js fp body from a default look: look.js bodyLook works with G() null :22-34; daily.js lookDefault(seed) :135).
- Alternative "fake S" route is dangerous: saveNow (career.js:140) writes whatever S is to slotKey(SLOT) unless saveGated()
  (S.flags.CharacterCreated === false, career.js:135). The S === null route keeps every existing save path inert (save/saveNow/persist
  all return without S: career.js:137-140, core/modes.js:139-144).
- Exit back to the title: screenTitle() js/ui/main.js:319-325 calls stopLife + lifeReset, removes body.life, hides #lifeRoot, but does
  not exitMode, nor remove body classes mode-<name>, drillview, fp-match. stop() world.js:309 calls saveNowIf if SAVE.due (inert
  without S). The scene stays in memory until the next enterZone clears it (clearScene world.js:75-83 disposes geometry/materials).

## 3. Zone registry and a new cage zone (core/modes.js, world.js, stadium.js, pitchspec.js, pitchmesh.js)

- registerZone(name, {build(ctx, opts) -> spawns, tick?(dt), leave?()}) js/life/core/modes.js:52-56. enterZone throws for an unregistered
  name (world.js:89); the module must be imported first (stadium.js registers itself on import; controller.js imports it statically via
  core/tunnel.js). Every js/life/**/*.js module needs an importmap entry in index.html (lint rule importmap-complete).
- Model to copy: stadium zone js/life/football/stadium.js:877-1001 (makePitch -> buildPitchMesh -> props -> spot()s -> finishBatches();
  SKY.setContext("stadium", {box}); AUD.init; leave() undoes all of it). Zone build must set W.bounds itself: begin() (build.js:996-1006)
  resets solids/floors/spots/anims/lights but NOT W.bounds, so the previous zone's bounds would leak.
- enterZone needs a named spawn: `spawns[at] || spawns[zone === "home" ? "bed" : "bus"]` world.js:107 -> place(undefined) throws if
  neither exists; return a "bus" key or always pass `at`.
- Sky context only "life" or "stadium" (sky.js:514-516). Low preset fog: life near 35/far 150, stadium 110/240 (util.js:176-206):
  a 105 x 68 cage under "life" fog would haze the far end on Low; "stadium" also gives the whole-ground shadow box.
- Zone-name special cases to know: move.js:110 FOOTBALL movement profile only when LIFE.zone === "ground" and on that pitch (a cage zone
  walks with the LIFE profile outside a sim mode); me.js:44 training kit only in "ground"; world.js:124 drill props warmed only in
  "ground"; acts.js:92-100 place names; firstday.js several `zone === "ground"`.
- Pitch geometry: makePitch({L, Wd, cx, cz, roll, boards}) pitchspec.js:126-216 gives lines, goals, posts/bars/nets colliders, spots,
  areas, spareCones, runoff = hx+5 / hz+4. Full cage = makePitch() 105 x 68. Half / one-goal: trainspec.areaPitch js/life/football/
  trainspec.js:55-72 already makes a sub-area a pitch of its own, keeps only real goal ends and sets spec.area; goalsLaw :74-77 feeds
  laws.goals (rules.js:89 goalCounts: 1 = only the +x goal). BUT areaPitch is hard-wired to the training ground (GP = PITCHES.ground,
  72 x 48 at cz -28, GROUND_RUN) and its "real end" test requires full width: it needs generalising to a base pitch {L, Wd, cx, cz}.
- Drawing a half pitch: buildPitchMesh(spec, o) pitchmesh.js:360-399 draws spec.lines, spec.spots, spec.goals and corner flags at all four
  +-hx/+-hz corners unconditionally (framesMesh pitchmesh.js:271-281), grass symmetric about the frame (grassMesh :169+). An area spec
  of L = 52.5 would draw a complete small pitch (two boxes, halfway line, circle) in the half: a separate draw spec is needed whose
  lines are the full pitch's lines translated into the area frame and clipped (linesMesh :211-251 handles seg and arc a0..a1, so a half
  centre circle is expressible), goals filtered to the real end, flags only at the real corners.
- Player collision: buildPitchMesh adds post/net/flag solids (o.solids); fences for the walker via props.js wireFence(x0,z0,x1,z1,h)
  js/life/props.js:517-527 (posts, alpha-tested mesh, top rail, one solid box). Inside a sim mode the movers are clamped to
  spec.runoff instead (sim.js:154, mover bounds), so runoff must equal the fence's inside less a body radius.

## 4. Cage rebound physics (ball.js)

- Fences can reuse the existing advertising-board colliders: makePitch boards {hx, hz, h, e, gaps:[]} -> vertical planes with per-plane
  restitution (pitchspec.js:79-118); createBallWorld turns each into a board plus a rounded top-edge capsule (ball.js:161-165);
  boardsHitQ ball.js:625-644 (any plane normal; bounded by the plane's box, passes above y1). VERIFIED (cageball.mjs, fence 56 x 37 m,
  e 0.6): a 20 m/s ground ball rebounds (max |z| 36.871 vs 36.89 inside face, ends moving back), a hard ball into a corner stays
  inside (max |x| 55.887, |z| 36.867).
- Over the top: a lofted ball (vy 14) clears a 4 m fence (VERIFIED escaped, max y 8.13). A horizontal plane appended to
  spec.colliders.boards ({n:[0,-1,0], d:-h, bounds, e}) works as a roof (boardOf only needs n, d, bounds, e; ball.js:217-220), but
  with fence 4 m and roof 6 m the ball still escaped through the gap; with fence height = roof height (6 m) it stayed inside
  (VERIFIED). So: fence planes as tall as the roof, or a roof at the fence top. pitchspec's plane() helper is not exported.
- Out of play: the ball still emits 'out' (and 'goal') when it crosses goalX/touchZ (ball.js:822-837) before reaching a fence beyond
  the lines (VERIFIED events touch, out, board, bounce). rules.js ballOut :210-230 then starts a throw/corner/goal kick; with
  laws.restarts false it becomes an indirect kick-in (rules.js:290-296). There is NO law for "play on, rebound": training.js fixedItem
  :464-468 papers over it for drills by clearing ms.restart/phase every step, but startRestart has already set ball.state 'dead' and the
  dead-roll (rules.js:92, 302-303). The spec's "out of play = rebound or stop" setting needs a real law (e.g. laws.out:'rebound'|'stop')
  in rules.lawsOf (rules.js:74-84; MODES list :69 is closed, a new mode name must be added there).
- AI blindness: ballPredict uses predWorld which strips boards (ball.js:856-865, "no boards"); refreshPred (actions.js:54-59) feeds
  firstReach/brains. VERIFIED: prediction of the rebounding ball runs to |z| 70.11 through the fence. In rebound mode the AI would chase
  balls outside the cage until the real bounce. rules.js restOf :478-499 clamps rolling rest points to the runoff (partial awareness).

## 5. Existing training.js / trainspec.js: structure and what is reusable

- training.js (1123 lines) = mode "train" (registerMode :375-433: flags clock own, movement own, targeting false, saves defer,
  pauseOnUnlock true, leaveOnZone true) over a partial simulation built by buildItem :198-266 (createMatch with cfg.mode, cfg.rules,
  teams of player records, me record; officials off; agents placed where bodies stand; ball placed dead).
  Pipeline per frame: sliceItem (fixed 60 Hz steps, MAX_STEPS 4) -> fixedItem (viewPreStep, feedStep, script.pre, controlStep, simStep,
  script.post) -> frameItem (P mirrors your agent, HUD, script.frame, feel slow-mo, HOST.pass clock, events -> audio/camera/HUD).
  Scripts: drillScript :688-783, blockScript :872-889, lessonScript :960-1074 as {pre, post, frame} objects; verdicts from trainspec
  tests (shotTest, volleyTest, headerTest, passTest, interceptTest, duelTest, receiveTest, callerTest, moveStage, shapeOk; corner targets
  crossAt/cornerOf/targetScore) - pure, take ms.events slices: reusable for scenario objectives.
- Reusable as is: the mode pipeline (view.js viewInit/viewFrame/viewDispose, matchcam camInit/camDispose, fphud hudInit/hudFrame/
  hudDispose, control.js controlInput/controlStep/controlReset, inputOn/inputOff incl. the right-button listeners), takeBall :272-288
  (fresh ball from a bag, old one left as a loose spare), coachFeed/feedStep :290-330 (a real strike through solveStrike + ballKick:
  usable as the "passer/feeder" for receiving scenarios), ballDead :567-573, slotSpot (trainspec.js), TEMPO/attrsForAI.
- Career-bound (not reusable without a new host): HOST (single module-level `let HOST`, training.js:72-73, set ONCE by acts.js training()
  :450 with TRAIN_HOST acts.js:373-447, which reads S.player/skills/energy/fatigue/traits, squadOf(myClub), seeds from S.cid/day/min,
  pays XP (trainXP), passes the life clock, exert, trust/chem through sessionDone). GROUND coupling: coach = GROUND.assist, squad =
  GROUND.session.borrow/release/lookOf, GROUND.tier, GROUND.targets; areaPitch/toWorld/conesFor use the ground frame GP (cz -28).
  Drill/session/lesson ends pay out (drillEnd :805-817 exert/trainMin/xp/persist).
- Cleanup that exists: onBegin hook training.js:1113-1118 clears RUN/COACH/CONES/MARK on any zone build; mode exit :396-418 disposes
  view, camera, HUD, input, group. Persistent scheduler task "train-coach" (kind keep, :139) runs every frame for the session's life.
- Resets today = a new createMatch + viewInit per go/item (viewDispose disposes every human, view.js:408-416): a "Restart scenario" that
  rebuilds sim and bodies each time costs human construction per reset; reusing ms/V and repositioning would be cheaper.

## 6. Interaction spots and cones

- spot(o) js/life/build.js:798-802 pushes into W.spots (cleared on each zone build). Two kinds: aim spots (o.aim box, ray within 2.5 m
  REACH) and proximity spots (o.near true, radius o.r, line of sight checked) - target() js/life/core/hand.js:55-85; use() :98-103
  runs o.run; o.long {time, run, label} for hold-E (holdStep :108-122); o.when() hides; o.kind pick/place/drag special.
- Mode filter: flags.targeting true/false or a function(spot) (controller.js:112 example `s => !!(s && s.stadium)`); world.js:196-197.
- Station pattern to copy: ground.js drillStations :213-228 = drillBoard + marker() prop + spot({x, z, y:.6, r:1.6, near:true, label,
  hint, run}) per drill; drill cones in training.js conesFor :157-174 (ConeGeometry, keep-flagged material, added to W.scene).
- The E prompt is drawn by hud() which needs S (see section 2).

## 7. Input routing and keys

- world.js keydown listener :456-466 ignores typing targets, needs body.life, skips while mail/life panel/hub; routes
  {type, key (lower case), code, repeat, locked, t, prevent} - NO ctrlKey/shiftKey/altKey. VERIFIED: a router handler sees Numpad1 as
  {key:"1", code:"Numpad1"} and Ctrl+Shift+1 as {key:"!", code:"Digit1"} with ctrlKey/shiftKey absent. So the Ctrl+Shift+1 admin
  shortcut cannot be detected through routeInput; Numpad1 is distinguishable only by code.
- Key "1" is already taken: control.js:146 (contact Low in train/match) and world.js lifeInput INV.swap(0) in life. An admin handler on
  code "Numpad1" must consume the event before controlInput.
- Lint rule football-no-modifier-keys (qa/lint-rules.json:72, active) forbids ctrlKey/altKey/metaKey in js/life/football/** except a
  `if (...ctrlKey...) return` guard: the Ctrl+Shift+1 handler and the Ctrl-shield (full screen + keyboard lock) must live outside
  js/life/football or the rule must be amended. control.js modKey/MOD :126-130 and controller.js capture :126-152 make any modified key
  "nobody's action" in train/match (D9).
- C is currently the shoulder scan (control.js:147, :155; DESIGN 1.6 "C hold: shoulder scan"); the spec moves shield to C: rebinding scan
  is needed.
- Q and Tab: js/life/phone.js:100-115 capture listener on window opens the phone (Tab) or the hub (Q) whenever body.life, with no mode
  check (only cinematics). VERIFIED with a registered non-life mode: Q switched lifeMode() to "hub" and showed the phone. DESIGN 1.6
  says Q/Tab are disabled in train/match, but nothing implements it. Free Play's Q (spawn ball) needs this guard; with S null the hub
  would render renderHub without a career (try/catch at ui/main.js:494) and stopLife after 600 ms.

## 8. Persistence (localStorage, saveNow, cloud, gating)

- Keys in use: freyaFootball.v2 (legacy single save), freyaFootball.v2.slot<n>, .meta<n>, freyaFootball.v2.one (career.js:7-71);
  freyaFootball.gfx and .gfxAuto (util.js:208); freyaFootball.ctrl (control.js:38 SET, audio.js:21, move.js:178);
  freyaFootball.warmLast (controller.js:995). VERIFIED title-time keys: gfx, v2.one; after a career: + v2.slot1, v2.meta1.
- Save path: save() debounced 800 ms -> saveNow() writes serial(S) to slotKey(SLOT) + writeMeta (career.js:135-141); gated while
  S.flags.CharacterCreated === false. core/modes.js wraps window.save :151-155 (defer while moving or in a 'defer' mode) and saves on
  pagehide/visibility (:156-157); career.js also on pagehide if a save is pending (:138-139). The world loop marks a save due every 45 s
  (world.js:246) and writes it at a quiet moment unless flags.saves === "defer".
- Cloud: online.js startAutoSync :321-324 (every AUTO_SYNC_MS = 300000, :295) -> autoSyncTick :297-320: if signed in and S.synced and
  no MT, saveNow() then syncUp(). Only slot keys are uploaded (online.js:131, 197, 263, 394), so a separate presets key stays on the
  device and never reaches the cloud or the save code (A.saveGame -> makeCode from the save).
- Presets: nothing exists. Best existing pattern for a validated device store: control.js loadSet/saveSet :37-62 (defaults object,
  JSON.parse in try/catch, clamp numbers, whitelist enums, write only known keys, subscribers). A presets store would use its own key
  (e.g. freyaFootball.trainPresets) with a version and per-scenario-type buckets, validated on read with unknown fields dropped and
  missing ones defaulted; never inside S.

## 9. quality.js and rendering

- One renderer for the session (createRenderer quality.js:80; recreated only when antialias changes :105-124). Presets GFX.P from
  util.js:176-206 (Low/Medium/High), applied via gfxApply subscribers; preset swaps that compile shaders wait for a safe moment and
  cover the screen. Adaptive Q.scale per zone (resetForZone :215). warmNow (:357) compiles before reveal; enterZone calls warm().
- Shadows/fog/lights choose "life" or "stadium" by sky context (sky.js:173, 248, 348, 514).
- revealAfterFrames / bootCover / liftBootCover (core/modes.js:96-130) give the covered start a sandbox can reuse.

## 10. QA harness for training tests

- qa/run.mjs runs suites by name (unit, lint, nodash, smoke, integrity, any qa/<name>.mjs); qa/lib.mjs launch() (seeded Math.random,
  gfx in localStorage, freeze/stepN via __qa RAF interception, external requests stubbed), career() ALWAYS creates and saves a career
  (newCareer + A.sign + startLife; VERIFIED slot1 written), freeze/unfreeze/stepN/snap/report/titleStart/expect.
- Test hooks: window.__life (world.js:514+: stepN, keysDown/keysUp, modes.register/enterMode/pushInput, enterZone, place, spots, use,
  sched, camera...), window.__train (training.js:1122: RUN, COACH, startDrill, input, CTRL, TS), window.__fp (controller.js:1634-1675:
  enter("test:<name>"), exit, stepN, headless, input, events, harness.runOne).
- controller.js already has a career-free match path for tests: enterTest/testConfig controller.js:1496-1541 (FS.real false: no bridge
  attach, no checkpoints, no life clock) but it enters the stadium zone via build() :215-222 and runs inside a career world (startLife).
  No Reset Match / Reset Current Half exists (grep).
- Missing for training tests: a lib helper that enters Training without a career, and a localStorage snapshot/diff assertion that the
  career keys (v2.*) are byte-identical before and after.

## 11. Global state that can leak between a Training session and a career

Career -> Training (and Training writing into the career if S is the career object):
1. S survives A.quit (VERIFIED). PLAY_T keeps adding to S.playMs (VERIFIED) and autoSync keeps calling saveNow when signed in: anything
   Training changes in that S is persisted.
2. enterZone(non-home) -> lifeAway -> S.events.away (VERIFIED for ground; by reading for any non-home zone, world.js:96).
3. fp-resume keep task (core/tunnel.js:168-172): with S.life.inMatch set, LIFE.running and mode "life", it plays out the interrupted
   career match and writes the result (by reading). A sandbox walking in mode "life" with the career S in memory would trigger it.
4. onboardTick (world.js:202) and lifeOnb events run the first day's step runner on any frame when the career's first day is active
   (by reading, firstday.js:884-914).
5. Life keys in mode "life": V writes S.life.view and persist() (me.js:207-210), 1/2/G pockets and INV.changed -> save() (inv.js:139),
   B build mode, F door lock; lpClose -> save().
6. training.js single HOST: a sandbox host set with trainHost() stays in place for the career's drills (acts.js only sets it on the
   first import, :450). RUN/COACH/CONES/MARK/INP/RMB/HS are module singletons (cleared by onBegin and mode exit).
7. Shared life state: LIFE.min/day/zone (sync() rereads from S only), P, ME, FLAGS (modal, drill, lockLost, busy), keys, HOLD,
   SAVE.due, FADE, phone.js mode, CTRL (control.js), FS (controller.js), GROUND/STADIUM module objects, W.bounds (not reset by begin).
8. Body classes: life, mode-<name>, drillview, fp-match, hub-out, hand, cine; screenTitle only removes "life".
9. Life HUD hiding is per-mode CSS (css/fp.css:29-34 only for body.mode-match); a sandbox mode needs its own rules or the clock,
   money and needs (stale without S) stay on screen.
10. Device settings (freyaFootball.ctrl) are shared on purpose.
Training -> career: none today (there is no Training Mode), but every item above is a path to watch.

## 12. Summary of gaps (missing) for the build

- Title Training entry; a career-free boot entry (startLife needs S, boot private); dropsOf guard; prompt drawing without S; default body.
- Cage zone (registerZone + generalised areaPitch + half-pitch draw spec + fences + roof + runoff); importmap entry.
- A real "out of play: rebound | stop" law; prediction aware of fences.
- Sandbox HOST for training.js and a scenario runner decoupled from GROUND (coach, squad borrow, ground frame).
- Admin key handling outside js/life/football (lint), Numpad1 via code, Ctrl+Shift+1 via a window listener (router drops modifiers),
  keyboard lock in full screen; Q/Tab guard in phone.js; C rebinding from scan to shield.
- Presets store (own key, versioned, validated); Reset Match / Reset Current Half; QA helper for career-free entry + storage diff.
- Not inspected here (other areas): halftime flow, animation, AI quality, first-day beats, the apartment flash (left alone per the user).
