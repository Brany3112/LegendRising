# P9-A: what was found for each animation item, and why

BUILD-PLAN P9-A asks for the root cause of each item, recorded as one of:
- asset;
- playback speed;
- controller conflict;
- priority;
- transition;
- root motion;
- scaling;
- contact point;
- physics;
- an AI interrupt;
- a stuck state.

`qa/tr9-sheets.mjs` checks that every item below has a **Cause** from that list, a **Fix**, and a **Check**: the test
line that holds it.

## MV-9 jockey
- **Cause:** controller conflict.
  - The gait has had a jockey style since P2-B (`gait.js`: `st.style` `'jockey'` is the shuffle with the jockey's lower,
    side-on posture), but nothing asked for it.
  - The match view's locomotion state (`view.js locoOf`) passed only `'backpedal'` or nothing.
  - So a jockeying body (the AI's pressMove stance, state `'jockey'`; yours, the strafe your held jockey asks for) ran
    forward twisted.
- **Fix:** `view.js locoOf` passes `style: 'jockey'` for a body in state `'jockey'`, or for yours when your intent
  strafes, up to 3.4 m/s.
- **Check:** `tr9-anim` "MV-9 jockey" (style share, no crossover, feet apart, planted drift).

## MV-9 dribble touches
- **Cause:** contact point.
  - `gait.js touch()` (a swing routed through the ball) was never called.
  - The simulation plays its dribble touches on its own gait clock (`sim.js` footfalls, `actions.js dribbleFoot`), apart
    from the drawn body's footfalls.
  - So the ball moved on with no foot near it.
- **Fix:** `view.js dribbleTouches` watches the simulation's dribble touch events. For each, it sends the drawn body's
  next swing (the foot whose swing passes u = 0.7 soonest) through where the ball will be at that moment (the ball
  rolled on at its speed for the swing's time).
- **Check:** `tr9-anim` "MV-9 dribble touches" (asked for the same frame; the toe within 0.15 m of the drawn ball).

## MV-14 strike root
- **Cause:** root motion.
  - `moves.js strikeRoot` (the root's speed through a strike, 0.55 of the approach at contact, 0.40 just after) was
    written for the mover and never applied.
  - The striker kept up to 97% of his speed a step until contact, and 2.5 m/s after, under a clip whose planted foot
    stays put: 23 to 66 mm of skate a strike (the movement notes, section 3).
- **Fix:** `actions.js` caps the striker's speed by the same curve (a pure copy, `strikeRoot`, since the simulation can't
  load the drawing code), from the speed he came in at, never under 0.3 m/s.
- **Check:** `tr9-anim` generic, "a planted foot slides at most 10 mm"; `tr2-startstop`.

## MV-15 the first-person body (neck and arms)
- **Cause:** controller conflict.
  - The life body gets the neck fix (`me.js neckFix`: the body gives way in its own frame before the neck reaches the
    eye) and the arms-in.
  - The match's and Training's first-person body (`view.js fpPose`, called by `controller.js` and `training.js`) got no
    `correct` at all.
- **Fix:** `me.js` exports `neckFix`. `fpPose` uses it unless the caller hands its own, and always passes the arms-in
  (`matchcam.js` `V.fpArms`). `V.fpSpy` counts both.
- **Check:** `tr9-anim` "MV-15: fpPose gets the neck fix and the arms-in every frame"; "no joint within 0.12 m in front of
  the camera".

## MV-15 camAction
- **Cause:** priority.
  - The camera's action springs for a backswing, a slide, a chest receive and a landing were defined (`matchcam.js`
    ACTS), but only strike, pass, header and fouled were ever asked for (`controller.js`, `training.js`, from the
    simulation's events).
- **Fix:** `matchcam.js clipCam` asks for them on the first-person clip's own moments:
  - backswing: a strike's PLANT;
  - slide: a slide's LAND;
  - chest: a chest receive's CONTACT;
  - land: a header's LAND.

  Each fires once per clip. `view.js` keeps the clip posed in your eyes (`V.fpClipNow`).
- **Check:** `tr9-anim` "MV-15 camAction" (one of each kind, the roll within 2 degrees).

## MV-15 tired
- **Cause:** scaling.
  - The match bodies' fatigue was `(1 - B/60) x 0.6`, so it never went over 0.6, while the tired stance (`moves.js
    'tired'`, hands on the thighs) is for fatigue over 0.7.
  - Nothing asked for that stance anyway.
- **Fix:** `view.js fatigueOf` maps fatigue to 0..1 from the breath. `tiredSt` puts any standing body (under 0.3 m/s,
  no act) into the stance above 0.7 and out of it below 0.7. It covers yours and the AI's alike; the keeper keeps his own
  stance.
- **Check:** `tr9-anim` "MV-15 tired".

## GK-3 keeper hands (claim, collect, spread, punch, tip)
- **Cause:** priority.
  - `gkmoves.js` registers `gkcatch`, `gkcollect`, `gkpunch` and `gktip`, but `view.js` asked only for dives, the set
    stance, the ready stance and distribution.
  - So a claim, a gather or a punch showed the ready stance.
- **Fix:** `view.js gkHands` maps each state:
  - claim to `gkcatch` (high, on the claim's own time), or `gkpunch` once he punched;
  - spread to `gkcollect` smother;
  - a gather into his hands (`hold` not from a dive or a claim) to `gkcollect` scoop off the grass, `gkcatch` chest above
    it;
  - a tip over without a dive to `gktip`.
- **Check:** `tr9-gkanim` "each claim, collect, spread and punch state shows its pose within 2 frames".

## GK-3 keeper distribution (throw, roll)
- **Cause:** an AI interrupt.
  - The clip (`gkmoves.js gkdistribute`: throw 0.9 s releasing at 0.55, roll 0.8 s at 0.45) existed, but the keeper's
    brain let the ball go the step it decided.
  - No act held it to a release the clip could meet.
- **Fix:** with P9-B's acts (`gkthrow`, `gkroll`, `tRelease` at the clip's own release):
  - `view.js` plays the clip on the act's clock (its contact counted down to `tRelease`);
  - `gkBall` draws the ball in his throwing hand (`moves.js handBall`) until the release, then eases it onto the
    simulation's over 0.12 s.
- **Check:** `tr9-anim` "GK-3: the drawn ball stays within 0.15 m of his releasing hand until tRelease"; `tr9-gkanim` "his throw and his roll each played at least 10 times across seeds".

## Transitions (get-up, stagger, landing, blocking, jumping, heading)
- **Cause:** transition.
  - Measured by `tr9-anim`'s generic checks over bots in every category.
  - **Level of detail:** most of the large one-frame bone changes are far bodies, posed less often than every frame (the
    scheduler's tiers). One update then carries several frames' turn. That is a cost decision, not a snap, and the check
    spreads it over the frames since the last pose.
  - **The open finding:** what remains is a clip handing back to the gait, for example the first gait pose after a
    receive or a strike.
    - The clip's end pose and the gait's first pose differ by up to 1.6 rad at a leg bone.
    - The legs' own IK runs after the blend (the movement notes, section 3).
    - So the blend into locomotion doesn't cover the legs.
- **Fix:** not made in this package. It needs `human.js`'s locomotion blend to take the legs' IK into the
  inertialisation. The numbers and cases are in `PC-STATUS.md`.
- **Check:** `tr9-anim` "no bone turns more than 0.3 rad in the frame a pose changes".

## Contact point (strikes)
- **Cause:** contact point.
  - **Measured:** at the frame of the kick event, the kicking foot's toe or ankle is often 0.12 to 0.6 m from the drawn
    ball.
  - **Why:** the strike clip's contact is timed by its own clock (`moves.js` contact, rate-adjusted toward the
    simulation's tc). A strike started from a stride adjust or a first-time ball reaches its contact a frame or more off
    the simulation's, and the leg is still on its way.
- **Fix:** not made in this package. It needs the strike clip's contact pinned to the simulation's contact step (the
  clock's `tcAt` from the act's own `tc`, as the keeper's distribution now is).
- **Check:** `tr9-anim` "at contact the kicking foot (a header: the head) is within 0.12 m of the drawn ball".
