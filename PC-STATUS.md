# PC status: P10-A (First day), branch `pc/p10a`

**State: finished; ready for the cloud to merge.** Base: `origin/claude/awesome-babbage-o53g6x` at `6c5db89`, plus the
PC's Playwright import fix (cherry-picked from `pc/p7b`, commit `7a2166f`).

## What changed (only P10-A's own files)

- **FD-1** (`firstday.js`): with the fridge door open, H14's hint is "Look at the food, then eat or drink something (E)."
- **FD-2** (`firstday.js`, `furniture.js`), the bed tells the truth about sleep:
  - H15's nap line gives the fatigue and the energy cost from `sleepPlan('nap')`: "It takes 8 fatigue off and costs 2
    energy";
  - the night line gives the real window, found from `isNight` itself: "Between 7:00 PM and 5:00 AM";
  - on day one, the hold line says it isn't for today: "Holding E sleeps through a whole day, exactly 24 hours, but not
    today. The club expects you.";
  - the bed's own prompt on day one says "Hold E: not today. The club expects you.", with the hold label "not today",
    instead of offering 24 hours' sleep it would then refuse. `furniture.js` hears the refusal through `setBedRefuse`,
    which `firstday.js` sets from `refuse('sleepDay')`;
  - once the first day is done, everything reads as before, so wpG-life's exact 24-hour line still passes.
- **FD-3** (`firstday.js`): after paying, H6's objective is "Pick up your bulb at the end of the counter", and the marker
  points at the bulb's actual drop on the counter.
- **FD-6** (`daily.js`): energy is shown as applied, to one decimal when it isn't whole: "Energy +3.5", never a rounded
  "+4". This holds in the fridge tooltip's "You get" line, its "you only gain" line, and the eat chip (`consume()`
  returns one decimal). An optional matching change to the hub's drink toast is in `HOOKS.md`.
- **FD-4: not done.** No G0 answer chose the literal 30 to 60 minute window, so the default holds ("present from 9:30").
- **FD-5: not done.** It's gated to P11-F. The intro and the boot path weren't touched.
- **Tests:**
  - `qa/wpH-day.mjs` has new checks for FD-1, for all three FD-2 lines (computed from `sleepPlan`, `isNight` and `WAKE`),
    for the day-one bed prompt, and for FD-3 (the objective text, and the marker within 5 cm of the bulb's drop);
  - `qa/wpG-fridge.mjs` has new FD-6 checks: for every food in every case, the tooltip's and the chip's energy are equal,
    with one decimal when they're part points, and at least one such case exists;
  - `qa/unit/daily.mjs` now imports by file URL, so it runs on Windows too; Linux is unchanged.

## Tests run on this PC (Windows, Node 26.3.0, real GPU)

| Test | Result |
|---|---|
| `qa/wpH-day.mjs` | pass (with the new FD-1, FD-2, FD-3 checks) |
| `qa/wpG-fridge.mjs` | 221 of 221 |
| `qa/wpG-life.mjs` | 52 of 52 (exact bed lines incl. the 24-hour one, barber states, session lines) |
| `qa/wpH2-centre.mjs`, full run (not `--quick`), G9 lessons included | pass |
| `qa/wpH-boot.mjs` | pass |
| `qa/wpI-delivery.mjs` | pass |
| `qa/wpH2-ball.mjs` | pass |
| `qa/oldsave.mjs` | pass |
| `node qa/run.mjs unit lint smoke` | 29 of 30 |
| `qa/nodash.mjs` on the changed game files | 0 |

- In the unit/lint/smoke run, `qa/unit/daily.mjs` passes (429 of 429).
- The one failure is `qa/unit/presets.mjs`. It isn't P10-A's file, and it fails only on Windows: it imports a bare `d:`
  path.
- The 14 beats of TRAINING-SPEC section 7 are re-verified by `wpH-day` (bulb, mailbox, board, fridge, bed, pockets,
  phone, ball, compass, bus), `wpH2-centre` (10:00 rule, early word, manager card, the bag to the gym fridge),
  `wpI-delivery` (the delivery area), `wpG-life` (barber states, bed) and `wpH-boot` (creation, the same character).

## Manual checklist for the user (these can't be automated faithfully)

1. **Screw in the bulb with the mouse.** On day one, put the bulb in the light fitting and screw it in by moving the
   mouse in clockwise circles (not Space). It should turn and finish, and the light should come on.
2. **Esc under pointer lock.** In the flat and at the training centre, press Esc while playing. The pointer is
   released, and the game neither breaks nor skips a step.
3. **Walk the real routes.** The tests teleport between legs. Walk them yourself: flat to the furniture shop and back,
   up to floor 3, to the bus stop, and in the training centre from the lobby's delivery counter to the gym fridge. Look
   for anything that blocks you.
4. **Buy at the barber.** At Fade & Co., buy a style you don't own. The money goes, the card says PURCHASED or WEARING,
   and the mirror at home then offers it.
5. **Check the new texts by eye** on day one:
   - the fridge hint with the door open;
   - the bed's three lines;
   - the bed's own prompt saying "Hold E: not today.";
   - after paying, "Pick up your bulb at the end of the counter" with the marker on the counter.
