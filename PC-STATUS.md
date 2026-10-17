# PC status: P7-B (Corners, throw-ins and penalties), branch `pc/p7b`

**State: not finished.** The engine work and the scenarios are in. The hub hooks, the acceptance scripts and the browser
checks are not done. Base: `6c5db89` (UF2 integration, with the user's fix round).

## Done

- **Phase 7 contract (`rules.js`)**, commit `561cc03`: `startRestart(ms, kind, team, spot, opt)` keeps `opt.taker` (a
  valid man of that side takes it), `opt.second`, `opt.secondAction`, `opt.side`, `opt.noKeeper`, `opt.wallSpec` and
  `opt.plan` on the restart as plain data. With `opt.hold`, an AI taker's restart is never ready by itself (`R0.set` says
  everyone is in place) and the scenario gives the go. A match passes none of them, so match behaviour is unchanged
  (`qa/unit/rules.mjs` and `laws.mjs` pass).
- **`js/life/train/setpiece.js` (new, pure):**
  - config types `corner`, `throw` and `penalty` (presets are kept apart by type, and the Load list has its own line);
  - a setup for every spec role:
    - corners: taker, attacker in the box, designated receiver, support on the edge, defender;
    - throw-ins: thrower, receiver, run down the line, mark the receiver, second ball;
    - penalties: taker, follow in for the rebound, defend the rebound;
  - corners can be taken at either flag, and at either goal on the full pitch;
  - the ball is dead on the real spot. The corner ball is 0.57 m from the corner, inside the arc;
  - the real restart starts with the Phase 7 options;
  - while the ball is dead, everyone holds a set-piece spot, and a man-marker stays goal side of his man;
  - the AI taker delivers to the designated man:
    - corners: a cross at head height, or low for a volley one time in three; or a short corner;
    - throw-ins: a throw to the man's feet, or into the space ahead of his run;
  - the attackers make their runs as the ball is struck;
  - the judge reads the simulation's own events: goals, saves, keeper claims, out of play, fouls, possession;
  - each go records headers, volleys, clearances, second balls and saves;
  - corners have an instant replay through the runner.
- **Config types guarantee the people a role needs.** If a configuration is short of them, they are added with a note
  (`fitConfig`, `NEEDS`).
- **`scen-corner.js`, `scen-throw.js` and `scen-penalty.js` (new):** 15 drills in Set Pieces: 6 corner drills, 5 throw-in
  drills and 4 penalty drills, including the empty-goal penalty.
- **`actions.js`:** a throw aimed at a height goes on a flatter line, about 20 degrees, so the receiver can control it.
  The old lob's speed made the solver pick a high arc that only a header could meet. AI and player throws without a
  height are unchanged.
- **`qa/tr7-lib.mjs` (new):** the Node harness. It plays a set piece on `matchOf` with the runner's own `setStep` and
  `judge`.
- **PC test setup:** `qa/lib.mjs`, `qa/wpC-det.mjs` and `qa/wpK-lib.mjs` try the Linux Playwright path first, then the
  global package. On Windows they use the real GPU. Linux behaviour is unchanged.

## Not done (next steps)

1. **Hooks:** apply `HOOKS.md` (the importmap entries and the `index.js` imports). Until then the drills don't show in the hub.
2. **Acceptance scripts:** `qa/tr7-corner.mjs`, `qa/tr7-throw.mjs` and `qa/tr7-penalty.mjs` are not written yet.
   `qa/tr7-lib.mjs` is ready for the Node parts. The browser parts (presets surviving a reload with an equal
   `RUN.digest()`, the corner replay, the ball within 0.15 m of the hands at release) need writing too. Model the hands
   check on `qa/uf-throwin.mjs`.
3. **Corner delivery accuracy:** not tuned or verified. In a 10-seed Node probe the AI's cross often did not reach the
   designated receiver: its median closest approach was 4.5 to 7.6 m, depending on the role. The acceptance check
   "deliveries go toward the designated receiver" needs this looked at. Check the target used in `deliver()` (the run's
   zone point) against where the receiver actually is at the kick.
4. **Keeper attributes vs penalty save rate:** not measured yet. If the rate doesn't move enough, `gkbrain.js penaltyStep`
   (owned by P7-B) could let a better keeper read the side more often.
5. **The throw-in clip:** UF-A already aligned it, so `view.js` and `moves.js` were not touched. The tr7-throw hands
   check is what confirms it.
6. **Never seen played in the browser.** Nothing has been tried in the game yet.

## Tests run on this PC

- `node qa/run.mjs unit lint smoke`, on the base before P7-B: 28 of 30 pass.
  - `qa/unit/daily.mjs` and `qa/unit/presets.mjs` fail on Windows only (`ERR_UNSUPPORTED_ESM_URL_SCHEME`: they import an
    absolute `d:` path). It's a test-harness problem on Windows, not a game failure.
  - After the `rules.js` change, `qa/unit/rules.mjs` passed in that same run. The full suite was **not** re-run after the
    later changes.
- Node probes of every role over 10 to 20 seeds: no crashes and every go reaches a verdict.
  - penalties: 85 to 90% scored;
  - throw to a receiver's feet: kept in 9 of 10 (16 of 20 in the earlier run);
  - corners: headers, clearances, saves and second balls seen; volleys rare (1 in 20).
- `node qa/nodash.mjs` over every file written or changed: 0.
- No browser test has been run for P7-B.

## Notes

- Node on this PC is v26.3.0, not 22. Everything above ran fine on it.
- The repository-local git identity is set to `Claude <noreply@anthropic.com>`, to match the cloud's commits.
