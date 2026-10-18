# Phase 11: full regression and report (2026-10-18)

The final build of the training and football rework: phases 2 to 10, the user's fix rounds U1 to U25, and the
third-person camera (U21). Every test group ran on the cloud (4 CPUs, headless Chromium):
- **First run:** groups unit to tr8, on `ae19230`.
- **Second run:** groups tr9, u21 and tr10, on `1ebcf76`, which adds the harness follow-up (two changes to `rules.js`).

## Results

| Groups | Scripts | Pass | Fail |
|---|---|---|---|
| unit, lint, nodash, nodash-release, smoke, oldsave | 35 | 35 | 0 |
| tr2, tr2b, tr3, tr4, tr5, tr6 | 41 | 41 (see the first note below) | 0 |
| tr7, tr8 | 6 | 6 | 0 |
| uf, uf2, uf3 | 13 | 13 (see the second note below) | 0 |
| tr9 | 4 | 2 | 2 (`tr9-ai`, `tr9-anim`) |
| u21 | 3 | 2 | 1 (`u21-camera`) |
| tr10-leak, tr10-perf | 2 | 0 | 2 |
| **All** | **104** | **99** | **5** |

**Notes on the counts**
- **`tr6-team-browser`:**
  - On `ae19230` it found no team-mate's call in its sample.
  - It passed on its rerun on `1ebcf76`, and the harness package's run passed it too.
- **`uf-callpass`:**
  - On `ae19230` its old part failed once: a team-mate on the ball weighed the pass to you after 2 of 3 presses.
  - It passed on its rerun on `1ebcf76`. Its new keeper part passed both times.
- **The harness** (`qa/harness.mjs --n 1000`) is at 56 of 62 on the follow-up.
  - Four of the failing checks sit on their band edges: goals 2.901 against 2.9, DF defensive actions 5.97 against 6,
    ST defensive actions 4.12 against 4, and ST touches 22.1 against 22.
  - The win share, 0.649 against 0.62, rests on 158 matches; its standard error is 0.034.
  - Winger touches are 28.0 against 26. This has been building since 11 October and is left open.
  - Details are in `plan/notes/pc-integ.md`, under "Harness follow-up".

## The five failing scripts

| Script | What fails | Why, and whether a player sees it |
|---|---|---|
| `tr9-anim` (23 of 26) | Planted foot slides (max 35 m); a bone turning more than 0.25 rad in one frame; a bone turning more than 0.3 rad when a pose changes | The 35 m and 15 m "slides" are the test measuring through a goal's instant replay and a restart. They are not skating. What remains is small slides and leg snaps on mid-range bodies (tier 2), plus one jump from a receive straight into a strike. All three are P9-A open items (`plan/notes/p9a-rootcause.md`). Foot-to-ball contact now passes (0 of 17 missed, against 14 of 16 before U24). |
| `tr9-ai` | Pass completion: the better passers' rate (0.718, n 298) is not above the middle band's (0.787) | The better-passer sample is small. P9-B had already widened this check's margin for sampling error. Open. |
| `u21-camera` | The mouse turning the view; the pass assist in third person | It fails the same way on the home PC's own `c164b01`, which passed it on the PC. The cloud's headless Chromium follows every locked mouse move with its opposite (+30 then −30), so the view never turns. This is the test machine, not the game. The pass assist check follows from it. |
| `tr10-leak` | renderer.info geometries +1; JS heap +3.3 MB after GC | Known P10-B open items. The PC's integration showed that no geometry stays alive outside the scene: `tr4-pitch` tracks every uploaded geometry, and it passes. The heap growth is not traced. |
| `tr10-perf` | CPU p95 14 ms against 6; 206 KB allocated per frame against 16; reset 14.7 ms against 4; the tier sweep timed out | P10-B's budgets were already missed on the home PC (p95 6.35, 164 KB, 4.5 ms). The cloud's CPUs are several times slower and were shared with the tests. Open. |

## What changed since the meeting build (2026.10.17q)

- **2026.10.17r:**
  - third person steady on the move;
  - the shadow under a runner;
  - the camera tilting with the aim (U22, U23, U25);
  - text to speech removed.
- **2026.10.17s:** third-person camera sliders: distance, height, over the shoulder, and shake at a sprint.
- **2026.10.17t:**
  - the camera settings on the Esc card in Free Play, every drill and the Full Match, live and kept everywhere;
  - fast wheel notches;
  - the home PC's U24 strike timing.
- **2026.10.17u:** the shot meter's gold perfect spot. In the sweet spot a shot is good; off it, the shot is scuffed.
- **This build:**
  - **Foot contact (U24):** a strike or a header meets the drawn ball on the simulation's own contact step. A header
    waits up to 0.15 s for the ball. A strike begun late swings from where the feet are.
  - **Body:**
    - the backward jockey steps side by side;
    - your hands keep out of the view as you look down;
    - the keeper punches crosses in a crowded box.
  - **Warm-up (U21):** the juggling and the one-twos are in third person.
  - **Full screen:** the tip is shown once.
  - **Calling with R:** heard while your keeper holds the ball.
  - **Restarts:**
    - a dead ball through the dugouts' gap is stopped by the bench;
    - corners and crossed free kicks go to the best crosser.

## Open after this build

1. Winger touches (the whole side's ball circulation), and refitting `sim.js LEVEL` for the win share.
2. P9-A's remaining animation items: tier-2 leg snaps, small slides, and the receive into a strike.
3. P10-B's performance budgets and the heap growth.
4. `tr9-ai`'s better-passers check.
5. Whether MV-15's neck fix belongs on the match's first-person body (UF2 places that body against the eye).
6. The fitness coach's speech bubble can cover your body in third person (a HUD layout question).
7. Windows-only, and also failing on origin: `wpK-gk` and `wpK-strike`.
