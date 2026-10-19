# P1 inspection: AI, goalkeeper, rules and attributes

Snapshot inspected: scratchpad/p1tree/LegendRising (committed HEAD export). Read-only; nothing under /home/user/LegendRising
touched. Probes (all under fp/p1/probe/): shield.mjs, gkme.mjs, smallsim.mjs (+ smallsim_dec.mjs), offedge.mjs, attrs.mjs,
swarm.mjs, one.mjs, nogoal.mjs, anchorcap.mjs, steal.mjs (Node, headless sim), gkslide.mjs (Playwright, port 8854, server
started in-process and closed; port confirmed free afterwards). Unit tests run: qa/unit/offside.mjs 42/42, gk.mjs 20/20,
laws.mjs 31/31, rules.mjs 56/56.

Paths below are relative to the snapshot root.

## 1. Architecture (what exists)

- One simulation: `js/life/football/sim.js` createMatch(cfg) / simStep(ms) at 60 Hz, step order tactics (5 Hz, team 0 even
  /team 1 odd: sim.js:304-306) -> restartStep -> brainStep -> gkStep x2 -> officials -> agentStep (actions, mover, stamina,
  gait) -> separate -> controlCheck/touchCheck -> ballStep -> refStep -> energy/judge (sim.js:290-410). Pure, seeded
  (`ms.r = mulberry32(cfg.seed)` sim.js:78; no Math.random in the football modules, only comments mention it).
- Agents (`agent.js:33-77`): record with mover, stamina, gait clock, attrs, intent, act, plan, task {press, mark, run}.
- Brains: `brain.js` (outfield), `gkbrain.js` + `gkplan.js` (keeper), `tactics.js` (shape, pressing, marking),
  `rules.js` (laws, offside, restarts, cards, subs), `actions.js` (kick/tackle/header/receive/touchCheck).
- Harness: `harness.js` runOne/measure/aggregate/BANDS (full 11v11 headless matches; the player as an AI stand-in via
  cfg.meAI). Two full matches (seeds 5, 6) re-run: teleport 0, ballJump 0, restartLate 0 (one.mjs).
- Training already runs partial simulations on the same engine: `training.js buildItem` (training.js:198-262) builds a
  cfg with 0..n mates/opps (+ optional keeper), calls createMatch, turns officials off, places every agent where its
  borrowed squad body stands (cut via ms.cutStep), puts the ball dead at a point and forces phase 'live'.

## 2. Outfield decision making (brain.js, tactics.js)

Working (verified by code + probes):
- Positioning by formation/role: anchors from SLOT_POS + formation, line/length/width with phase and ball, role modifiers
  (overlap, wingers wide, ST on last line, CAM between lines, CDM screen) tactics.js:84-154. Scales to small areas by L/105.
- One chaser per team for a loose ball (ballPlans brain.js:307-362; firstReach on shared prediction). Full-match probe
  (swarm.mjs, 2 halves): 1 planner per team in 46282 of 50290 loose-ball team-steps, 0 in the rest; 3 same-side bodies
  within 3 m of a loose ball only 101 times; no slow loose ball left unchased > 1.5 s; stationary-but-should-move
  agents 84 of 18200 agent-seconds (0.5%). No swarming.
- Pressing: one presser (press 1) + one cover (press 2), counter-press 3 s gives 2 pressers (tactics.js:168-205).
  Probe: carriers had 1 presser 27669 steps, 2 in 1211, 0 in 708.
- Marking: greedy DF/CM vs threats in own 62% (tactics.js:209-247). Forwards (slotLine FWD) never mark and only press in
  own half when the ball is within 0.5 s (tactics.js:198).
- Passing: every team-mate incl. the player (isMe) is an option; analytic lane model with receiver meet point, opponent
  reach, reaction, ctrl and pressure (passModel brain.js:113-214); lob fallback; perceived offside x0.1; through balls
  only to runners already moving or holding a run (brain.js:483-505); crosses from wide final third with zone race
  (brain.js:520-546); dribble 7 directions + take-on; long ball; clearances; safety out of play.
- Support: two nearest CM/CAM show in a pocket (supportSpot brain.js:941-979); runs in behind hold the line until the
  pass (brain.js:830-850, go at once when offside is off); box runs on a cross.
- Interceptions: opponent's firstReach beats the receiver -> 'intercept' plan; touchCheck controls under 8 + 0.12 x
  interception m/s, blocks above (actions.js:384-437).

Broken / partial:
- BROKEN: AI never shields. brain.js:631 reads `at.strength`, which no attribute builder sets (attrs.js has no strength)
  -> NaN -> `add()` drops the option (brain.js:449). Probe shield.mjs (3 first halves): 720 decisions met the shield
  condition (press > 0.5, nothing worth 0.6 of here), shield offered 0 times; `strength` present on 0 agents.
- BROKEN (user-facing): AI team-mates chase and take passes meant for the player. ballPlans skips the player
  (brain.js:323 `if (a.isMe && !ms.meAI) continue`), so recvR stays null (brain.js:342) and the best AI team-mate gets a
  'chase' plan for the player's pass (brain.js:350, 360). steal.mjs (pass from 20 m to a waiting player): a team-mate 2-3 m
  off the lane took it 20/20, 4 m 9/10, 6 m 3/10; he chased it in 40/40. The coach's feed in training (ballKick with
  agent -1, training.js:325) has no chain pass at all, so the same applies. Invisible to the harness (meAI puts the
  player in the candidates).
- PARTIAL: one-goal / partial areas. Brains always attack `dir*spec.hx` (shot option brain.js:451-459, planFirst,
  planHeader, crosses) and never read laws.goals / spec.area.ends (only rules.goalScored does, rules.js:236). nogoal.mjs:
  in a half area with one real goal, the side attacking the empty end shot at it 40 times in 40 trials.
- PARTIAL: anchors are capped at the opponents' line even with offside off (tactics.js:143 not gated by lawOf), and with
  fewer than 2 opponents lineOpp falls back to 0.7 L (tactics.js:120). anchorcap.mjs: only a keeper against, ST anchor
  u = 73.2 of 105 with offside on and off.
- OBSERVATION: shot-happy from range in small sims. TEMPO[2].shotBias = 1.9 (sim.js:47, copied into training cfgs,
  training.js:222). smallsim_dec.mjs: unpressured ST 30.5 m out, values shot 0.126 > dribble 0.107 > passes 0.059; across
  30 seeds of a 3v2+GK every go ended in a shot (30 shots, 1 pass, 1 through).

## 3. Goalkeeper (gkbrain.js, gkplan.js, view.js, gkmoves.js)

Brain (working, unit gk.mjs 20/20): states ready/set/shuffle/reposition/advance/spread/claim/dive/catch/ground/getUp/
hold/distribute; positioning on bisector with posit error (gkbrain.js:67-88); set within 0.15 s (gkbrain.js:588);
shot read with reaction (reflex), misread spin, lateral error, re-read at 55% (gkbrain.js:127-275); dive via planDive
shared with the animation (gkplan.js:42-121); contact outcomes catch/parry/tip/punch/block (gkbrain.js:285-360); ground
0.45 s, get-up 0.9 - 0.004 dive, scramble (gkbrain.js:607-659); claims (gkbrain.js:394-425); penalties (gkbrain.js:497-516);
distribution throw/roll/punt (gkbrain.js:430-495). No teleport: dive root via diveRoot with the no-teleport clamp in
separate(); asserts 0 in full matches and 90 small-sim goes.
Attributes read: reflex, dive, handling, posit. `distrib` is never read (distribution uses passModel thresholds).

Animation hooks (view.js:203-229):
- gkdive (dive/catch/ground/getUp, with plan, outcome, steer) WORKING (wpK-gk QA exists).
- gkset WORKING; gkready used for ready/shuffle/reposition/hold/claim when speed < 2.6.
- BROKEN: shuffle slides. gkslide.mjs (browser): gkready while the body moves sideways: both feet move at body speed
  every frame (0/79 planted at 1 and 2 m/s); the gait's own style 'shuffle' at 2 m/s plants (25 and 8 frames at 0 speed).
  gkready poses legs body-locally (gkmoves.js:59-75, registered without plant gkmoves.js:497).
- MISSING: gkcatch, gkcollect, gkpunch, gktip are registered (gkmoves.js:498-502) but nothing references them outside
  gkmoves.js. A claimed cross shows gkready/run while the sim's hands sit at up to 2.75 m (gkbrain.js:565); one-on-one
  spread and collections have no pose.
- BROKEN: throw and roll distribution never animate: gkbrain releases the ball directly (gkbrain.js:450, 456) without an
  act, so view.js's gkdistribute branches for 'roll' (needs act.kind 'kick', no such startKick exists) and 'throw'
  (view.js:215, only startThrow throw-ins make that act) are unreachable for keepers. Punts animate.

GK becoming the user's player:
- Creation cannot pick GK (POS in data/game.js:122-128 has DF/CM/AM/W/ST; assignTeamPos maps world GK to DF,
  positions.js:108). Lineup slot is teamPos; benchMe and roleSubs exclude keepers (sim.js:201, rules.js:1129-1130).
- BROKEN: shortHanded (red card or injury with no change left) puts "the nearest defender" in goal with no isMe check
  (rules.js:953-956). gkme.mjs: seed 2 with the player at LB: after a keeper red card the player's agent became isGK,
  ms.gks pointed at him, and one step later gkStep had overwritten his intent (dx 1 -> -0.22, dz 0.98), state
  'reposition'. gkStep runs for ms.gks without an isAI check (sim.js:309-310). Training (subs 0) reaches this through any
  keeper injury.

## 4. Offside (rules.js)

Working: snapshot at the contact of every kick except goal kicks/throws/corners (actions.js:292-297, rules.js:139-152),
second-last opponent incl. keeper with 0.25 m body point (rules.js:121-136); involvement on touch or challenge within
1.5 m; reset on a deliberate opponent touch/out; flag delay 0.35 + 0.4(1 - margin), whistle +0.25; borderline error from
ms.r; goal in the delay disallowed; indirect free kick at the involvement spot (rules.js:972-995). AI: perceived offside
with vision error, runners hold the line (brain.js:465-470, 836-838). Laws switchable (rules.js:69-85; training default off).
Notice: match only (controller.js:623, 631-635: "You were X m past the last defender when Y played it."). Training's
events() has no offside notice (training.js:530-556); only lesson L5 reads it (training.js:1051).
Partial:
- With fewer than two opponents the line becomes halfway (rules.js:131). offedge.mjs: keeper only, receiver 30 m out:
  offside, margin 16.75.
- The own-half exemption uses the area's own middle (rules.js:133). offedge.mjs: half area (36 m), attacker 6 m into
  the real opposition half beyond both defenders: onside (margin -11.75).
- Leaving players (walking off) still count for the line (no `leaving` filter, rules.js:126-129).

## 5. Attributes (attrs.js, career.js, data/game.js)

- Career skills (data/game.js:5-21), 15 keys, range 1..99 (daily.js:259-261): power, aero, curve, accuracy, passing,
  passacc, acceleration, sprintSpeed, dribbling, stamina, composure, tackling, interception, jumping, heading.
- Sim Attrs (attrs.js:16-17 SKILL_KEYS uses `pace` instead of the speed pair, plus SPEED_KEYS): power, aero, curve,
  accuracy, passing, passacc, pace, dribbling, stamina, composure, tackling, interception, jumping, heading,
  acceleration, sprintSpeed + derived (attrs.js:51-63): pace = mean(acc, sprint); ctrl = 0.65 dribbling + 0.2 composure +
  0.15 passing (+5 control boots), 1..99; passAcc = 0.65 passacc + 0.35 passing; agility = (acceleration + dribbling)/2;
  vision = 0.5 passing + 0.2 passacc + 0.3 composure; decision = 0.6 x mean(composure, passing) + 0.4 x read.
  Keeper: gk {reflex, dive, handling, posit, distrib} (AI 20..99), keeperOf() fallback (attrs.js:155-159).
- Player: attrsForPlayer(effSkills(), items, traits) (attrs.js:71-86); effSkill = S.skills less nerves/tired (max 45%,
  floor 5, composure exempt) plus warm-up boost (career.js:236-254). Without a career S.skills is absent and effSkill
  returns 0 (career.js:247) -> every attr clamps to 1: a career-free Training Mode must build the vector itself.
- AI from an average: attrsForAI({id, ovr, pos}) skill = clamp(round(ovr + PROFILE[arch][k] + 6 hashNoise(id, k)), 20, 99);
  keeper outfield ovr-10 (passing ovr-4, acceleration ovr), gk numbers ovr +-6 (attrs.js:92-119). Deterministic by id
  (hashStr), not by a session seed. attrs.mjs: mean skill equals ovr for 30..90 (ST@50 49.9, range 37..62); ovr 10 gives
  20 everywhere (floor), ovr 99 mean 97. levelled() and raised() shift a vector; LEVEL (sim.js:54) only applies if cfg.ovr.
- Missing vs TRAINING-SPEC 3: Strength, Balance, DefAwareness do not exist; BallControl = ctrl (derived), Agility derived.
  Tackles use only tackling vs dribbling (touch.js:293-298 via actions.js:513-518).

## 6. Spawning, removal, cleanup

- createMatch: up to 11 per team (sim.js:116), compact ids (team 0 then team 1), 'off' fillers to id 22, referee 22,
  ARs 23/24 (sim.js:134-139), subs appended (enterSub rules.js:1078-1093). Nothing is ever spliced; removal = onPitch false or
  walkOff -> leaving -> off. No id-range assumptions found (grep), small sims ran clean.
- View: viewInit builds one human() per non-'off' agent (view.js:62-95), including the referee and ARs even when they
  are off the pitch (training turns them off but they still get bodies); bodyFor lazily for subs (view.js:114);
  viewDispose removes SCHED actors and disposes bodies (view.js:408-416). No pooling: every training item / block /
  lesson rebuilds the bodies (training.js:376-433).
- Training borrows squad NPC bodies (teamSession.borrow/release, training.js:629-656) and hides them while the view draws
  the agents (training.js:244-253, handBack 435-443).

## 7. What a small training scenario needs (and what the sim supports)

Supported today (smallsim.mjs ran 90 goes of 3v2+GK, full and half areas, offside on/off, teleport 0, ballJump 0):
- Partial teams: any 0..11 per side, keeper optional (ms.gks[t] = -1 skips gkStep).
- Custom start positions: write a.m.x/z, a.x0/z0, yaw/heading, zero velocity, a.set = null, then ms.cutStep = ms.step.
- Custom possession: ball free at the carrier's feet (< 2.4 m, ACT.LOSE_CTL), liveRoll(ball), rules.setCtl(ms, a), then
  refreshPred(ms). (controller.js scenario() writes ms.poss directly, controller.js:1554-1600.)
- cfg: {seed, mode in MODES (rules.js:69, a new mode name must be added), spec, halfRealSec, tempo, teams[{players,
  bench}], me, rules {offside, restarts, goals, cards, subs, halfTime, stoppage}, kickoffTeam}; omit cfg.ovr.
- After createMatch: officials onPitch false, ms.restart = null, ms.phase = 'live' (createMatch always starts a kickoff,
  sim.js:161-169).
Gaps: areaPitch only knows the 72 x 48 training ground and keeps a goal only for full-width areas (trainspec.js:47-64),
so a 105 x 68 Full/Half cage or a narrow one-goal area needs its own spec builder; no "rebound off the cage" law (boards
exist as colliders via makePitch({boards}) pitchspec.js:69-110, but 'out' still fires and restarts); training host is
career-bound (acts.js:373-385); no reset/reposition helper (drill reps never reset positions); brains ignore missing goals;
AI shooting bias; pass stealing; no shield.
