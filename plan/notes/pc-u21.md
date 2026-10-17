# pc/u21: the PC's status (moved here at integration; U21 has no hook requests)

## PC-STATUS.md

### PC status: U21 (camera by activity), branch `pc/u21`

**State: done for matches, Training and every drill; ready for the cloud to merge (last, after Phase 9).**
- **Base:** `origin/claude/awesome-babbage-o53g6x` at `4be72e2` (the plan commit that adds U21).
- **What works:** third person for football and first person for life. The shot meter, kick selector, pass assist and
  crosshair all work in third person.
- **The warm-up:** its ball exercises are third person too (see "The warm-up" at the end).

U21 isn't a package, so it touches files several packages own. They are listed below; there is no `HOOKS.md` because
nothing is left for anyone else to apply.

## What changed

- **Third person for football** (`js/life/football/matchcam.js`, `tpFrame`). The football camera (`match-fp`), which
  career matches, Training's drills, Free Play, Full Match, lessons and the team session all use, is now behind you.
  - **Placement:** about 4 m back and 1.8 m above your head (`TP.BACK`, `TP.UP`).
  - **What it looks at:** your aim point, where the line you aim along (from your eyes, `P.yaw`/`P.pitch`) meets the
    pitch, at most 40 m out (30 m ahead when you look level or up).
  - **The crosshair:** it's in the screen's middle, so it sits on the aim point on the pitch. Looking level, the camera
    looks slightly down past you.
  - **The aim is unchanged.** Shots, passes, the meter, the kick selector and the pass assist work exactly as in first
    person, and the shot goes where you aim.
  - **Mouse:** it turns with the mouse as the aim does.
  - **No clipping:** whatever is between your head and the camera (the cage's fence, a goal, a wall, a stand) pulls it
    in (`core/collide.js camCast`, 0.3 m margin). It never drops under 0.45 m.
  - **Smooth switch:** at the start of every football activity it eases from your eyes to behind you (and back when the
    setting changes) over about a second, with no cut.
  - **Bodies:** your whole body is drawn; the first-person body is hidden (`view.js` `V.tp`).
  - **Unchanged:** the bench keeps its seat camera, and replays and the cinematic shot are their own camera owners.
- **The end of an activity** (`js/life/core/camera.js`, `HANDOVER`). When the camera passes between the football camera
  and life's (first person, life's third person, a drill's view), it eases from where it was over 0.45 s. Replays,
  cut-scenes and build mode keep their cuts.
- **The setting** (`control.js` `SET.footCam`, `fphud.js` settings row). "Football camera: Third person (default) /
  First person", on the pause card's and the Settings sheet's match settings and saved on the device. First person is the
  old view, unchanged.
- **Life** (`core/me.js`, `core/hand.js`). Life stays first person. While you have the apartment ball (in your hands,
  or a live one within 2.5 m of your feet, and for 3 s after a kick while it's within 9 m), life's own third-person
  camera goes behind you. It comes back to first person once you no longer have it. The football camera setting at
  First person turns this off too. V still toggles life's view as before.

## Tests (this PC)

| Test | Result |
|---|---|
| `qa/u21-camera.mjs` (new, real input) | all checks pass |
| `node qa/run.mjs uf2` | 3 / 3 (`uf2-feel`, `uf2-ssg-sim`, `uf2-ssg`) |
| `node qa/run.mjs unit lint nodash smoke uf tr2 tr2b tr3 tr6` | 67 of 71 after the fixes below |

**The 4 that still fail fail the same way on origin's code** (run on `pc/p9b`, whose camera and UI code are origin's):
- `qa/unit/daily.mjs` and `qa/unit/presets.mjs`: a bare `d:` import on Windows;
- `qa/nodash.mjs`: its I0 baseline isn't rebuilt on this PC (the git worktree and tar step); U21's files have no dash;
- `uf-aura`: "looking at an opponent: he is not lit";
- `tr2b-shield`: "the tip does not show a second time" (the full-screen tip card).

**Suites that checked first person** now set the Football camera to First person for their run:
- `uf2-feel` (U12: the first-person body under the eye);
- `uf-anim` (your first-person body drawn);
- `uf-aura` (the aura seen through your eyes);
- `tr3-runner` (the eye's owner, its height, the ball's size at 40 m).

They pass as they did.

**The ease is capped at 7 m/s** (`TP.SPEED`): under 0.15 m in a 60 Hz frame, so tr3-runner's "the camera never moves
more than 0.15 m in a frame outside a cut" holds in third person too. `u21-camera` measures the speed over the real
frames' own times.

`qa/u21-camera.mjs` checks, with real mouse input (the pointer locked by a real click):
- **The start eases into third person:** no frame moves more than 1 m of the 4.4 m way (a cut is the whole way at
  once), and no frame turns more than 20 degrees.
- **The camera's place:** about 4 m back and 1.8 m above your head, and it looks slightly down when you look level.
- **The aim point:** the screen's middle is the aim point on the pitch.
- **Bodies:** your whole body is drawn and the first-person one isn't.
- **The mouse (real movement)** turns it with the aim.
- **The wheel (real)** changes the kick type.
- **LMB held (real)** fills the meter on screen, and letting go strikes the shot along the aim.
- **An RMB tap (real)** well off a team-mate goes to him with the assist on.
- **The fence:** with your back to it, the camera is pulled in and stays inside.
- **The setting:** First person and back again, both eased.
- **Life:** first person; behind you with the ball; first person again after.
- **No** console or page error.

The life part sets `ME.footBall` directly. `hand.js` works it out every step from your hands and the live balls, and the
test doesn't place a real ball in a flat.

`uf2-feel` now plays with the Football camera on First person: its U12 checks are of the first-person body under the eye.
The meter, kick type and pass assist in third person are `u21-camera`'s.

## Not done

- **The substitute's pre-match warm-up** (`warmup.js`): done after the integration, see "The warm-up" below.
- **Walking about the Training cage between drills** is life (first person) unless you have a life ball. Every drill,
  Free Play and Full Match is third person.

## The warm-up (after the integration)

- **The rule applied:** third person where your body plays a ball. The juggling and the one-twos (`POOL` `ball: true`)
  are seen from behind you when the Football camera is Third person; the stretches, the strides and the walk to the
  strip have no ball and stay first person (their timing is read off your own legs as you look down at them).
- **Your whole body** (`warmup.js warmMe`): made the first time it is drawn, posed through the set by the same
  `warmPose`, shown from the moment the camera is half way behind you; the first-person body is hidden meanwhile.
- **The camera** (`matchcam.js tpFrame`, the controller's `SRC.off`): eased out through the exercise's intro and back
  once the ball is put away, never a cut. The look is framed for it (`tpView`): a little down and turned off the way you
  face toward the pitch, so the camera looks past your shoulder at the ball (straight behind you, your back hid it).
- **Test:** `qa/u21-warmup.mjs` (in `run.mjs u21`), real E, real clicks.
