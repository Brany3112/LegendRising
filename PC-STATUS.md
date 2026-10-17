# PC status: U21 (camera by activity), branch `pc/u21`

**State: done for matches, Training and every drill; ready for the cloud to merge (last, after Phase 9).**
- **Base:** `origin/claude/awesome-babbage-o53g6x` at `4be72e2` (the plan commit that adds U21).
- **What works:** third person for football and first person for life. The shot meter, kick selector, pass assist and
  crosshair all work in third person.
- **What's open:** the substitute's pre-match warm-up on the touchline is still first person. See "Not done" below.

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
| `qa/u21-camera.mjs` (new, real input) | see below |
| `node qa/run.mjs uf2` | see below |
| football groups | see below |

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

- **The substitute's pre-match warm-up** (`warmup.js`, the exercises on the touchline strip) stays in first person.
  - Its exercises are framed for your own eyes and posed on the first-person body, which has no head.
  - Third person there needs your whole body posed through the exercises: a separate piece of work.
  - Everything from the moment you're on the pitch is third person.
- **Walking about the Training cage between drills** is life (first person) unless you have a life ball. Every drill,
  Free Play and Full Match is third person.
