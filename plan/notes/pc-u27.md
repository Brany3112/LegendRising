# pc/u27: U27 and U28 on the PC

Branch `pc/u27`, from `origin/claude/awesome-babbage-o53g6x` at `49c0b68` (2026.10.18b, which has pc/u26 in it).

One commit per part:

| Part | Commit |
|---|---|
| A | `cf10dfc` |
| B | `9bb1a8b` |
| C | `e2f85fc` |
| D | `fd9f74c` |
| E | `43847c1` |
| G | `424436f` |
| F | `3b5a33a` |

## Part A: close control finished (U27)

- **F toggles close control** (`actions.js keepStep`, `ctlTouch`; `control.js` sets `me.takeT`).
  - F takes the ball when it is within 1.2 m, low, and nobody else's: a ball coming to you, a loose ball you reach
    first, or while sprinting. A press holds for 2 s while you get there.
  - In control the ball stays in front of you as you face, leaning the way you go, at the strong foot's side, at every
    pace. A sprint in control is 85 to 95% of yours, from Dribbling.
  - A turn is played with the side of the strong foot it needs. Turning left plays the ball's right side: the inside
    of a right foot, the outside of a left one. This corrects the earlier prompt, which had the sides backwards.
  - Close control ends on a kick, a tackle act, the ball lost, the ball out of reach, a knock-on (Shift twice) or a
    flick (part G).
- **Fixes found by the real-key test:**
  - A knock-on went 12 degrees off your way. The control's dribble bend toward the ball also bent the knock's
    direction; there is no bend in close control now.
  - A stride's touch straight after the knock played the ball again, so the strides wait 0.8 s.
  - Keys are read in lower case.
- **Cards** (`rules.js RULES.CARD`): yellow above 0.59, red above 0.96, tactical above 0.4 for xT > 0.15. The harness
  had 0.095 yellows a match; it is back in the 2 to 4 band. Fair challenges are still no card (`unit/touch`).
- **Harness n=1000 on part A:** 59 of 62. Failing:
  - W touches 28.4 (old);
  - CM defend share 0.352 against 0.342;
  - ST defensive actions 4.15 against 4.

## Part B: movement (`mover.js MOVE`, `control.js`)

- Acceleration +10% (a0 x1.1) and the jog, the run and the sprint 5% faster, for everyone.
- The Acceleration attribute counts for more: accelMul is 1.35 at 99 (was 1.18).
  - At Acceleration 90 you reach the jog, the run and full sprint in 0.48, 0.83 and 1.9 s, against 0.60, 1.05 and 2.38
    at 50.
  - Pace 99 covers 30 m in about 3.7 s.
- **The ladder:** at a jog going forward, it becomes a run after 0.6 s at Acceleration 50 and 0.3 s at 90. Shift is
  the full sprint, X the walk. There is no automatic run with a ball coming to you: met at a run, a pass went through
  your feet (uf2-feel).
- **Start response, measured with real keys in game time** (`u28-move`): you move and the first foot leaves the ground
  on the first frame, and reach a jog within 0.75 s.
- A start boost that would have made the jog in 0.5 s is not in: `timeToPoint`, the AI's prediction for every race
  to the ball, could not follow it exactly.
- `unit/mover` bands moved: 30 m for pace 50 is now 4.25 to 4.6 s (was 4.5 to 4.85), and for pace 99 3.5 to 3.85 s.

## Part C: stamina (`stamina.js`)

- The drain by Stamina, `ksOf`: 1.22 at 24, 1 at 50, 0.66 at 90, 0.58 at 99. A full sprint holds its speed 7.2 s at 50
  and 11.0 s at 90.
- Recovery is about 60% of what it was (stand 6, walk 5, jog 2.6 a second): from empty to a full sprint again in about
  11 s standing and 25 s jogging.
- **Measured before the change:** breath at the whistle was 91 to 93 for every Stamina, so nobody tired.
- **`unit/stamina`:**
  - a 3 s sprint every 30 s stays above 60 for 10 minutes;
  - 3 s sprints with only 4 s walks between run a player down, later the higher his Stamina.

## Part D: skills past 99

- **`career.js`:** `S.boosts = {source: {skill: points}}` (equipment, traits and perks write it; `skillBoost` sums it)
  and the warm-up's boost go on top of the player's own skill (99 at most), up to 125. `skillLabel` shows "88 +9" on
  the skills screen and the profile.
- **`attrs.js` `playOf`:** the match plays a skill as it is up to 99, then 0.4 of each point past it (125 plays as
  109.4). The effective numbers are kept on the record (`a.eff`).
- **The audit:** every `1 - skill/100` and `1 - skill/99` is floored at 0 (`brain`, `gkbrain`, `touch` twice,
  `strike`). `mover.js` reads skills up to 110.
- **`unit/skills99`:** at every level up to 125, every number is finite and better; a drill at 125 has no NaN.

## Part E: the shooting rework

- No kick type: the wheel and 1, 2, 3 change nothing and the corner is hidden. A lesson's contact still comes through
  `setKick`. The aim no longer sways.
- **The keys held in the last 0.25 s as a shot is let go** (`shotKeys`):
  - A or D curl it, by Technique;
  - with W, half the curl and 10% more power;
  - S is a fake; S+A or S+D a fake and a drag-back that way; S+W a nudge on and a drag back.
- Key times from an earlier go are ignored: its clock began again, and stale times made A count with D.
- **`actions.js FAKE`:** the swing stops short. The drag's touches are real soft rolls to a stop, from Ball Control,
  quicker with Agility, and close control is kept.
- **Tests:**
  - `u28-shot` 8/8: A and D bend the path opposite ways, 0.27 m over 18 m;
  - `u28-shotkeys` (real keys) 4/4;
  - `uf2-feel` and `unit/uf2feel` moved off the kick type.

## Part G: the flick and the chip (the wheel's button)

- **The input:** the middle button held charges a pure strength bar ("Strength"). Let go, the keys say the way: W a
  chip or flick on, S a rainbow over the head, A or D to the side, diagonals between, none a keepy-up. It works on
  the ball at your feet, or first time on a low ball coming (a sombrero).
- **`actions.js FLICK`:** a real lofted touch.
  - A light flick goes 0.7 m up and 1.5 m on; a full one 3.2 m and 12 m (more with Shot Power). The sombrero is steep.
  - The error comes from Ball Control, Technique, Dribbling, pressure, breath, the ball's speed and the weak side;
    a rare scuff for a poor touch.
  - The spin matches the contact. A flick ends close control.
- **The middle button now reaches the controls** in Training and the match. Before, only the left and right buttons
  were routed. Its auto-scroll is stopped.
- **Tests:**
  - `u28-flick` 6/6: a skilled player lands 0.8 m from the spot asked, a poor one 2.7 m; the sombrero clears a man
    1.8 m in front at 2.2 m;
  - `u28-flickfeel` (real middle button) 5/5: the drawn foot is at the ball at the clip's contact.

## Part F: real pitch sizes

- **`pitchspec.js PITCH_TYPES`:**
  - futsal 40 x 20, 5-a-side 37 x 27, 7-a-side 55 x 37 and 9-a-side 73 x 46, each with its own goal and marks;
  - eleven a side Compact 100 x 64, Standard 105 x 68, Wide 105 x 72 and Large 110 x 75.
  - `makePitch` takes a type's dims, and its boards follow the pitch.
- **`groundFor(club)`:** a size the club's league allows, the same every time. `bridge.js groundOf`: the home club's
  ground, Standard for a World Cup match.
  - The stadium is built round the ground: boards, stands and walking bounds.
  - "Pitch: 110 x 75 (Large ground)" is shown as the day begins.
- **Training:** a cage for each type, and the configuration offers them all.
- `qa/harness.mjs --pitch compact | wide | large`.
- **Tests:**
  - `u28-pitch` 8/8: a side spreads 39 m on Compact, 49 on Wide and 56 on Large;
  - `tr4-pitch` over all ten cages;
  - `unit/cagespec` 235/235.

## Shooting fix after the user's play-test (on top of part E)

The user found three problems. The curl from A and D didn't work, the fake didn't work as meant, and the reticle was
still on screen.

- **The reticle and the gestures are gone.**
  - `fphud.js` has no `.fp-ret` (the ring, its pulse and the curl glyph) and `fp.css` drops its rules.
  - `control.js gesture()` returns no gesture: a mouse sweep, lift or flick down through a release no longer curls,
    chips or dips a strike or a pass. The aim moved through a release had curled the ball against the keys.
- **The curl (after three more rounds with the user).**
  - The key is the side the ball goes out to: A sends it out to the left and it bends back to the right onto the aim,
    D out to the right and back. In `strike()`, `bend = -kc*amt`, and strike.js aims it off so it comes back.
  - It works on a tapped, placed shot too.
  - `rq.footPart` is `SHOT_KEYS.PART`, as in the real game: a right foot's outside for A (it bends right), its inside
    for D, mirrored for a left foot. `view.js` passes it as `c.part`, and `moves.js strikePath` turns the foot for it
    (outside: the toes turned in) on the plain shot's own swing.
  - **How much, by the Curve skill:** `curlSpin` is `CURL.MAX` (80 rad/s) times `(curve - 11)/88`, a straight line the
    user asked for: 55 half of 99's, 33 half of 55's (20, 40 and 80 rad/s).
    - `launchSpin`'s and `solveStrike`'s curl range is now -3 to 3 (the player's alone; the AI's finesse is still 1),
      so the AI and the harness are untouched.
    - In `u28-shot` (Accuracy 99), the ball goes out from the line to the target over 16 m: 0.43 m at 33, 0.84 at 55
      and 1.69 at 99.
  - **W with it** sets `rq.drive`: half the curl, at a straight shot's speed for the charge (no curler's 0.92 or its
    0.85 cap).
- **The shooting guide** (`img/curl-guide.png`, from `img/curl-guide.svg`): the curl drawn from the game's own ball
  paths, both feet, Curve 33, 55 and 99, and the keys.
  - `fphud.js GUIDE_HTML` is a closed `<details>` under the football settings card (the match pause card and the
    Settings sheet) and on the Training hub's home (`hub.js`).
  - `u28-shotkeys` checks it opens and its picture loads.
- **A and D don't move you while a shot is held or struck.** Sidestepping at 2 m/s through the swing carried the
  drawn foot 0.6 to 0.8 m past the ball. A step from a stand into the strike mis-planted it, a scuff at 0.55 of the speed, so W is held back
  twice.
  - W pressed while a shot is held from a stand (under 0.5 m/s) moves you only once held `SHOT_KEYS.T`.
  - A shot let go under 1.5 m/s (`CTRL.runShot`) is struck with no step on.
  - W held through the charge still runs you onto the ball. Freezing W for the whole charge stopped `uf2-ssg`'s bot
    reaching its shots (no goals).
- **The fake.**
  - S pressed while the shot is held (`controlInput`) drops the charge: the meter goes and letting go strikes nothing.
  - It queues `{kind: "fake"}`. A W, A, S or D pressed within `SHOT_KEYS.FAKE_WAIT` (0.55 s) sets `act.dir`.
  - `actions.js fakeStep` then plays the ball: A or D back to that side, S straight back (`FAKE.BACK_S`), W on
    `FAKE.PUSH`. The touch comes `FAKE.REACT` after the key, sooner with Agility.
  - The held-S-at-release fake is gone.
- **Keys:** `controlInput` already lower-cases letters. `u28-shotkeys` checks a capital A curls as a small one.
- **Tests:**
  - `u28-shot` 10/10, with the new fake and W+A at a full charge.
  - `u28-shotkeys` (real keys) 10/10: the curl both ways, the capital A, W+A and W+D, the foot part, the foot at the
    ball, the fake and its drags, no reticle.
  - The drawn foot is measured at its nearest to where the ball was struck. Read at the clip's contact event alone,
    it is a frame or two into the follow-through.
- **Open:**
  - `wpF-strike` (in no group) still reads the old reticle.

## Shot Accuracy, Shot Power and the flick's speed (the user's last asks)

These apply to every player, the AI too (`strike.js`).

- **Accuracy:** a shot's aim error is `accSigma(acc)`, `SHOT_ACC.K ((99 - acc)/44)^1.7095`.
  - That is none at 99 and past it, K (0.026 rad, 1.5 degrees) at 55, and twice that at 33.
  - It goes times the power term and `M`, the moment (over-hit, fatigue, pressure, foot, body, ball state, first time,
    finesse, scuff).
  - On top, `SHOT_ACC.SIT (M - 1)`: at 99 the shot is on the point unless the weak foot, pressure, balance or breath
    add a little.
  - Headers and passes are as they were.
- **Power:** a full shot is `shotVFull(power)`, straight lines through 33: 46.5 km/h, 55: 93 and 99: 134 (and 9 m/s
  at 0), 0.26 m/s a point past 99.
  - The speed is no longer drawn at random: `deviation` sets it by `cleanOf` (plant, scuff, breath), `SHOT_V.SPREAD`
    (2.3%) either side of the middle.
  - That gives 131 to 137 km/h at 99 and 91 to 95 at 55.
- **The flick:**
  - `FLICK_FULL` is 0.5 s (the bar fills twice as fast).
  - `FLICK.FAST` 1.4: a flick on, to the side or a rainbow crosses the ground 1.4 times quicker to the same spot, its
    arc 1.96 times lower. `FLICK.H1` goes 3.2 to 3.8, so a full one still tops out at 2.1 m.
  - The keepy-up and the sombrero keep their pop.
- **Tests:** `unit/strike` moved to the new scales (54/54), `u28-flick` 6/6, `u28-shot` 10/10.
  - The browser groups unit, lint, smoke, tr2, tr7 and uf2 pass (52 of 53; `uf2-feel`'s throw-in meter fails on origin
    too), as do `u28-shotkeys`, `u28-flickfeel`, `u27-control` and `u26-keep`.
- **Harness n=1000 on the final code: 58 of 62.**
  - Goals 2.87 (back inside 2.9), on target 8.5, save rate 0.71.
  - Failing:
    - W touches 28.7 (old);
    - ST touches 22.05 against 22;
    - ST defensive actions 4.14 against 4;
    - headers on target 4.04 against 4.

## Fixes from the final test run

- **A sprinting receiver lost the ball.** In `tr2b-receive`, a sprint into a 14 m/s pass at Ball Control 50 kept the
  ball 80% of the time, against 90%. A slightly wide first touch was outrun at the 5% faster sprint. `CN.DRIB_BEND`
  goes from 12 to 15 degrees.
- **A run was dropped under the ball.** In `tr6-receive`, the space touch rested 1.2 to 1.3 m ahead against 0.85 to
  0.9. Part E stopped the step up to a run while a pass comes. A player already running dropped back to a jog under the
  ball, and the touch ran away. Now there is no step up while it comes, but a run already started is kept (`CTRL.ran`).
- **A ball lying loose blocked the run.** In `u28-move`, a ball lying still nearby blocked the step up to a run: every
  free ball not his gives the human a receive plan. "Coming" is now a free ball rolling his way at 2 m/s or more.
- **`u27-feel` ran into the fence.** Its sprint, 5% quicker, now reaches the cage's end within its 150 frames, and the
  fence stopped the ball 3.2 m from the run-off. It now measures only more than 6 m from the end.
- **Tests moved to the new rules:**
  - `tr4-attrs`: the sprint speeds are 7.56 and 9.87 (part B's 5%).
  - `u21-camera`: the wheel shows and changes no kick type (part E).
  - `tr6-team`: a pass in the blocked-lane trial counts only if the lane is still blocked as it is played. With the
    quicker defenders, the one on the lane steps off to press in 2 of 20 runs, and the pass is then right. The crowding
    check skips a dead ball: the 1.78 s was three defenders standing round the ball after the drill's verdict.
- **Failing on origin too:**
  - `u21-camera`'s two camera ease checks (tpK 0.997 against 1);
  - `uf2-feel`'s throw-in meter;
  - `uf-aura`, which fails a different check on each run.

## Tests on this PC

- **Unit, lint, nodash, smoke, oldsave:** 35/35 after part F.
- **The new tests:**
  - `u27-control` 11/11, `u27-feel` 6/6, `u26-keep` 8/8;
  - `u28-move` 5/5;
  - `u28-shot` 8/8, `u28-shotkeys` 4/4;
  - `u28-flick` 6/6, `u28-flickfeel` 5/5;
  - `u28-pitch` 8/8, `tr4-pitch` pass.
- **The groups after the fixes:** tr2, tr2b, tr4, tr6, tr7, uf, uf2 and u21 pass, except:
  - `tr6-receive-anim`'s shield case (above);
  - the failures that also fail on origin (`u21-camera`'s ease, `uf2-feel`'s throw-in meter, flaky `uf-aura`).
- **Harness n=1000:**
  - part A: 59 of 62;
  - parts B to E (at `43847c1`): 57 of 62. Failing:
    - goals 2.94 against 2.9 (the quicker movement);
    - W touches 28.9 (old);
    - ST touches 22.3 against 22;
    - ST defensive actions 4.2 against 4;
    - headers on target 4.05 against 4.
  - Every new failure is just past its band. The CM defend share passes again.
- **uf2-feel:** its two throw-in meter checks fail on origin (`f7ffe6e`) as well.

## Open

- **Receiving while shielding (`tr6-receive-anim`, since part B):** the receive clip shows a thigh control where the
  simulation takes the ball with the foot, 0.3 m off. `view.js recvPart` puts the body at its current speed until the
  contact. With part B's stronger push, a shielding receiver is still speeding up, so the guess falls on the other side
  of the thigh/foot line. Every other receive case passes.

- **The AI's sprints:** about 14 a 23-minute match, in short bursts, so its breath ends near 91. Fewer means changing
  when the brain chooses to sprint, not stamina.
- **The stadium on other grounds:** only the boards, the stands' front and the walking bounds move with the size.
  Fixed props (the tunnel, the dressing rooms, the lamps) were not checked by eye on Compact and Large.
- **Running into a header:** the legs still trail behind as a player runs into it and after he lands (P9-A's
  clip-to-gait hand-over).
- **The flick's clips:** the rainbow and the heel use the strike's chip clip, so the foot meets the ball but the
  movement is not a true heel flick.
- **Measuring in the browser:** a headless browser draws slowly, and up to 4 game steps fall between two frames.
  Tests now measure in game time and at the clips' own events.
