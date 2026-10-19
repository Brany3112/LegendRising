# Match flow and match state: inspection notes (P1, read-only)

Snapshot: scratchpad/p1tree/LegendRising (HEAD export). Paths below are relative to it. Probes, logs and screenshots
are in scratchpad/fp/p1/ (probe-ht.mjs, probe-click.mjs, probe-ko.mjs; probe-*.log; *.png). Port 8851, servers
in-process (closed by each run).

## 1. The path a player takes (as built)

- Start. Tunnel at the training ground: tunnel() / toMatch() (js/life/core/tunnel.js:49-89) -> FP.enter(f)
  (controller.js:174). From the hub: playFixture (js/ui/main.js:904-929) -> FP.enter(f), or quickMatch when there is no
  3D world (main.js:931, match.js:258). FP.enter -> HOST.setup = matchSetup (match.js:31) -> travel card (timeLapse) ->
  arrived() (controller.js:194): build() enters the stadium zone, matchConfig (bridge.js:125) with cfg.htAuto = false
  (controller.js:201), startMatch (controller.js:229) creates the sim, listeners, view, camera, HUD, first checkpoint.
- Late arrival: state "lateRun", skipFrame headless to the arrival minute; half time inside it is passed straight
  through with secondHalf (controller.js:956), then bench (controller.js:971-977).
- Dressing room -> headOut -> walkout (controller.js:271-349) -> koGate (385-401) -> handover (404-413) -> state "live".
  A substitute ends the walk-out in state "bench" (controller.js:436-439).
- Kick-off: sim phase "kickoff", restart stage "wait" (sim.js:164-166, 174-196; rules.js:784-814). The clock only runs
  once phase is "live" (sim.js:379).
- Clock: refStep (rules.js:1159-1169) adds stoppage at 45:00 (RULES.ADDED), the half ends after added time at the first
  dead ball, a change of possession in the middle third, or 20 s (rules.js:1185-1191, endHalf 1222-1240): phase
  "halftime", whistle "ht".
- Controller sees phase "halftime": live() (controller.js:529) or bench() (controller.js:858) -> startHalftime
  (1126-1131): state "halftime", controlReset.
- halftime() (1132-1148): sim NOT stepped (clock and ms.t frozen: verified), 2 s (DAY.HT_WALK), then coverScreen()
  (1140), checkpoint (1141), motivation (1142), showHalftimeCard (1143, card built at 1155-1174 into the HUD overlay).
  Auto "Second half" after 60 s of real time (DAY.HT_CARD, 1145-1146), counted only while halftime() runs.
- secondHalfGo (1175-1192): overlay cleared, sim secondHalf (sim.js:502-514: half 2, ends swapped, clock 0, kickoff
  by 1 - koFirst, bodies on spots), state = onPitch ? "live" : "bench", skip resumed if one was cut by half time
  (1188), HOST.relock() (1190), revealAfterFrames(2) lifts the cover (1191).
- Full time: phase "fulltime" -> startFulltime (1195-1199) -> fulltime() steps to "over", 2 s, coverScreen, settle()
  = bridge.finish (bridge.js:274-349: ratings, finaliseMatch, matchRewards, S.life.inMatch cleared), card (1223-1244).
  "Continue" -> leave() (1257-1266) -> teardown + exitMode + HOST.leave (tunnel.js:137-143) -> lifeAfterMatch
  (tunnel.js:175-186). No auto-continue at full time.
- Bench: bench() (832-860) runs live() or skipFrame(); E tap stands, E held 0.8 s skips (benchHold 1375-1381,
  startSkip 918-922, skipFrame 932-987); call-up from rules roleSubs (rules.js:1121-1153) -> state "entering"; the sub
  event -> onCameOn (899-915) -> handover, state "live"; the replaced AI walks off (rules.js subStep 1023-1063).
- Checkpoints: entry (256), half-time card (1141), dead balls / kick-off after a goal / substitutions (maybeCheckpoint
  1300-1308). Recovery: recoverCheck (1444-1490) plays the rest headless with htAuto true.

## 2. THE HALF-TIME BUG (confirmed in the browser)

Root cause: the half-time card is drawn under the black cover, and the pointer is still locked, so a real player can
neither see nor click it; pressing Esc then freezes half time for good.

1. Card invisible. halftime() calls coverScreen() (controller.js:1140; modes.js:102-105 sets #lifeFade opacity 1) and
   then puts the card in #fpHud's overlay (fphud.js:53 host = #lifeRoot; hudOverlay 174-180). #lifeRoot is a fixed
   stacking context at z-index 40 (css/style.css:864); #lifeFade is fixed at z-index 90, a body-level sibling
   (style.css:1041, index.html:50). Nothing lifts the cover until secondHalfGo. Probe: fade opacity 1 with the card
   up in every run; screenshots ht-pitch-card.png, ht-bench-card.png, ht-benchskip-card.png are solid black. Control:
   ht-pitch-2nd-kickoff.png shows the same card rendering normally once the cover was at 0 (lifted there only by
   probe-only stale reveal promises).
2. Clicks never reach it. The match keeps the pointer locked (relocked after the travel card, acts.js:315; the player
   needs the lock to look around) and nothing at half time releases it (no exitPointerLock in js/life/football). Under
   pointer lock every mouse event targets the canvas. Probe (probe-click career, real page.mouse.click on the button's
   centre): pointerLockElement = lifeCanvas, all pointer/mouse/click events targeted #lifeCanvas, state stayed
   "halftime". Same in probe-ht pitch, bench and benchskip ("REAL CLICK DID NOT REGISTER"). The click instead goes
   through world.js:434-438 into the match input as a "ldown/lup" (see 4.c). Control: in a test fixture with no lock,
   the same real click works (probe-click test: state "live").
3. Esc kills the only exit. The only way out is the 60 s auto-advance, counted in halftime(), which runs from the
   mode step. Esc releases the pointer -> pointerlockchange sets FLAGS.lockLost because match mode has
   pauseOnUnlock: true (world.js:426-428, controller.js:113) -> world.js:187/191 skip the mode step -> htCardT stops.
   The pause card is not shown in state "halftime" (controller.js:1414 only live/bench/entering), the screen stays
   black, and a click lands on the invisible full-screen .fp-overlay.ht (pointer-events:auto, css/fp.css:164), never
   on the canvas, so the canvas click-to-relock (world.js:423) never fires. Result: half time never ends unless the
   player happens to click the invisible "Second half" button (centre of the screen). probe-unlock.log (career,
   starter): card up with pointer held; a real click on the button's spot queued ["ldown","lup"] and changed nothing;
   pointer released (exitPointerLock = Esc) -> lockLost true; 70 s of frames later htCardT still 0.1, state
   "halftime"; real clicks at (640,300), (200,150), (1100,650) hit the invisible overlay, no relock, still half time;
   only a click exactly on the invisible button went on (state live, relocked).
   Same for a substitute on the bench (the card is the same).
4. Related half-time and full-time defects:
   a. Full-time card has the same cover (fulltime() coverScreen 1211 then card; probe: fade 1 with the ft card up,
      ft-pitch-card.png black) and no auto-continue. Its "Continue" button sat at y=973 in a 720 px viewport inside
      the scrolling .fp-box (max-height 88vh, fp.css:167), and the match's capture listener preventDefaults every
      wheel event (controller.js:144), so the box cannot be wheel-scrolled. probe-unlock.log: ft card box 596 px,
      content 962 px, Continue at y 899-942 of a 720 px viewport; mouse wheel over the box with the pointer released:
      scrollTop stayed 0. Tab focus is also captured (KEYSET, controller.js:125,133). Only a scrollbar drag remains.
   b. The bench skip card and the late-arrival card (showSkip 923-927) are also under the cover: the "live score and
      minute" card is never seen (fade 1 with "card dim" up in benchskip log). Not a stall: the skip ends by itself.
   c. Clicks made while the card is up (pointer locked) are queued into CTRL.queue (world.js:434-444 ->
      controlInput control.js:159-164) and secondHalfGo does not call controlReset, so they are replayed on the first
      second-half step (controlStep drains the queue, control.js:521-536: "ldown" tackles when defending).
   d. Hints during the card keep showing live-play hints ("R call for it", "Shift sprint": hud() uses liveMe(),
      controller.js:738-747); seen in ht-pitch-2nd-kickoff.png.
   e. A player in state "entering" (called, walking to the fourth official) comes back from half time as "bench"
      (secondHalfGo 1186 only knows live/bench); FS.called stays true, so the entering hints/notes are lost and E does
      nothing (input 1353). He still comes on via the sub event. Code reading, not probed.
   f. FS.goalEv / FS.ckGoal / FS.ckNow are never reset (only set at 624/649 and consumed at 1305-1314; not in
      startMatch 232 or teardown 1281-1282). A goal that ends the first half (goal after added time -> dead ball ->
      endHalf) leaves goalEv set while ms.t is frozen through half time, so its replay can play at the second-half
      kick-off; a goal that ends a match can leak into the next match (or a training reset). Code reading only.

What works at half time (verified): the clock and ms.t do not move during the walk-off or the card; secondHalf sets
half 2, clock 0, ends swapped (dirs [1,-1] -> [-1,1]), kickoff by the other side (1 - koFirst); a substitute stays seated
with the bench camera (camTop match-bench); a skip cut by half time resumes automatically after the card
(skipResume "call" -> skipping "call" again, probe-benchskip.log); no page errors in any run.

## 3. Kick-off that never completes (confirmed)

When the player is his side's kick-off taker (pickTaker kickoff: first ST/CF, rules.js:358-359), restartStep's wait
stage marks it ready and waits for him (rules.js:794-797). The 25 s fallback asks pickTaker again, which returns the same
player, so nothing changes. The "Take it." line at 12 s in the comment (rules.js:793) is not implemented anywhere (grep).
Probe (probe-ko.log, test:11v11, you the only ST, Rivals kick off the first half so you kick off the second): restart
stage "wait", ready true, taker = you, clock stopped, at 5, 15, 30 and 45 s. Only the HUD hint "LMB shoot or cross /
RMB pass" and glyph "LMB / RMB" are shown. A tapped RMB took it and play went live. In a career the first-half kick-off
team is random (sim.js:161; matchConfig sets no kickoffTeam), so an ST player has this on one of the two halves and after
every goal his side concedes. After a goal the stages fetch/serve/collect/carry also wait on the player (no fallback
for isMe in collect/carry, rules.js:727-765). This is a second way for "the second half never starts".

## 4. Bench and substitution (verified in probe-bench / probe-benchskip)

Starting on the bench (role sub): sim benchMe (sim.js:199-212) puts the bench man in his slot, ms.me = -1; seated
bench camera; E held skips (to the coach's warm-up call or the call-up); call-up -> sub event -> onCameOn -> handover.
After coming on: one agent with isMe, 11 on the pitch for the team, the replaced AI (id 10) off the pitch with
subbedOff true, CTRL enabled, camera match-fp, state live. Partial: the player enters from wherever he stands within
the run-off (onCameOn clamps P, controller.js:903-906): with no input he went on from the dugout (P -10.2, -36.6), not
from the fourth official's spot; subStep only waits for the outgoing man (rules.js:1036-1048).

## 5. Per-match timers and listeners

Removed in teardown (controller.js:1267-1284): FS.offs (sim on('*'), 5 ball-sound subs, bridge.attach when real,
onSet), camera owners (camDispose), HUD DOM (hudDispose), view SCHED actors and meshes (viewDispose), warm-up actors
(warmDispose), replay skip, controlReset. Module-level, once per page: capture listeners (controller.js:151-156),
SCHED "fp-match" (1410-1416), control.js blur. Per recovery: SCHED "fp-recover", removed at its end (1466).
Not removed by the controller: AUD.init (the stadium zone exit disposes audio, stadium.js:998); revealAfterFrames
promises cannot be cancelled (one pending at teardown or reset lifts the cover later); fphud card timeouts
(short-lived DOM removals); FS.goalEv/ckGoal/ckNow (see 2.4.f). The replay buffer is reset by recInit at the next
match. CTRL.enabled is never set false anywhere (grep), ms.meAI is restored after __fp.headless.

## 6. What a Full Match training mode can reuse, and what is missing

Reusable:
- testConfig (controller.js:1496-1520) builds a complete 11v11 cfg with no career: seeded attrsForAI sides by ovr,
  your slot, attribute overrides (o.me), traits, staminaF, kickoffTeam, a 5-man bench, roleTimes.subOn for a bench
  start, htAuto false. Reached through FP.enter("test:11v11" | "test:bench", o) (enterTest 1521-1541, enterBench
  1544-1552). FS.real false keeps it off the career: no checkpoint (writeCheckpoint returns, 1294), no settle/finish
  (1217), no HOST.leave (1265), warm-up on localPort (1027), no motivation (1152), no drinks on the card (1160).
- createMatch options: halfRealSec / clockRate (sim.js:75-76), rules via lawsOf (rules.js:74-84: halfTime, stoppage,
  subs, offside, cards, restarts, goals), htAuto/htWait (sim.js:326-329), kickoffTeam, benchSide, visible.
- secondHalf(ms) (sim.js:502) for "start the second half from its kick-off" once (it flips ends every call).
- The whole half-time / full-time / bench / substitution flow of the controller (after the cover and pointer fixes).
- runHeadless (sim.js:627) and matchSec/minuteOf/onSec for clocks and fast-forward.
Missing:
- Any in-place reset. No resetMatch, no reset to the start of a half, no snapshot. Today the only reset is
  FP.exit()+FP.enter() which tears everything down and re-enters the stadium zone (build -> enterZone), a full
  environment reload. placeForKickoff (sim.js:174) is private.
- Reset Current Half needs a half-start snapshot (score, goal list, stats, events cut, the agents on the pitch incl.
  subs made and sent-off men, energy and stamina, subs used/plan, roleDone/callUp, bench used flags, offside, advantage,
  pending bookings, chain, judge queue) and a restore; ms.agents only grows (subs push agents), so a restore must
  rebuild ms (createMatch from cfg) rather than patch it. The crash-recovery resume (cfg.resume, applyResume
  sim.js:219-246) rebuilds at a half and second with a score but forces the player off, so it cannot be used as is.
- Controller state to clear on any reset: FS.htCard/htCardT, skipping/skipResume, called/atFourth/seated, goalEv/
  ckGoal/ckNow, evq, replay (recInit), CTRL (controlReset), warm-up, pending reveals.
- Separate team averages and goalkeeper attributes (testConfig uses one o.ovr for both sides), a cage pitch zone
  (enterTest always builds the stadium zone), team/role selection UI.
- Training uses the "train" mode with its own loop (training.js:375-470); the Full Match would run in controller's
  "match" mode; the two modes do not share a reset or lifecycle.

## 7. Why the QA suite never caught it

qa/int-fullmatch.mjs:37-38 and qa/wpF-match.mjs:167-180 press the cards with element.click() (a DOM click), which
ignores both the cover and the pointer lock; wpF-shots.mjs snaps the half-time screenshot but nothing checks it is not
black. The cover/card stacking dates from the WP-F commit cfe1694 (git log -S"coverScreen();" on controller.js).

## 8. Probes run (all on port 8851, SwiftShader, headless Chromium)

- probe-ht.mjs pitch (career starter): kick-off -> __fp.headless(2640) (stand-in plays you) -> live frames to the
  whistle -> card -> real mouse click -> 35 s -> full time. 116 s, no page errors.
- probe-ht.mjs bench / benchskip (career sub): half time from the seat and from an E-held skip, card, (element.click
  fallback after the real click failed), second half, skip to the call, coming on. 107 s / 80 s, no page errors.
- probe-click.mjs test / career: event trace of a real click on the card with and without pointer lock.
- probe-ko.mjs ko (test:11v11) and unlock (career): the kick-off wait, the Esc stall, the full-time card scroll.
Not verified in the browser: the full-time "Continue" -> lifeAfterMatch path by a real click (blocked by the same
defects), 2.4.e (entering at half time), 2.4.f (stale goal replay), Reset paths (they do not exist).
