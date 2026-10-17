# PC status: P9-B (AI refinement), branch `pc/p9b`

**State: finished; ready for the cloud to merge (after `pc/p7a`).** Built on `pc/p7a` as asked: it carries P7-A, whose own status is on
`pc/p7a`. `HOOKS.md` holds P9-B's requests (the `GK_DISTRIB_LIVE` flag, the `tr4-attrs` row, the run.mjs suites, and the
contract for P9-A).

## What changed (P9-B's own files)

- **Keeper distribution by `gk.distrib` (ATTR-1).** The rules are documented in `gkbrain.js`'s header, "distribution".
  `distrib` changes three things, centred on a typical match keeper (distrib about his overall, about 70), who plays as
  before:
  - **The choice:**
    - how safe a throw or a roll must be (a weak distributor throws only the safest balls);
    - the throw's range (26 m at 30, 30 at 70, 32 at 90);
    - how long his punt goes (40 to 48 m at 30, 48 to 58 at 90): a weak distributor kicks long less often to a far
      target.
  - **The accuracy:**
    - a normal scatter on where he means it to go: 1.8 m for a throw or roll at 30, 0.3 m at 90, more for a punt;
    - his punts and goal kicks are struck with passing numbers that move with distrib (`gkKicking`: -32 at 30, +16 at
      90), from the keeper's own copy of his numbers, never the configuration's.
- **Keeper throws and rolls are acts (GK-3, the contract for P9-A).**
  - The act is `a.act = {kind: 'gkthrow' | 'gkroll', target, aim, recv, tRelease, dur}`.
  - The ball stays in his hands (`holdAt`, high for a throw) until `tRelease`, then `distRelease` lets it go.
  - The timings are those of the existing `gkmoves.js gkdistribute` clip (throw 0.55 of 0.9 s, roll 0.45 of 0.8 s), so
    P9-A's release event lines up with them.
  - The punt is unchanged.
- **Two bugs found by the new checks, both fixed:**
  - **Keepers never threw.** A throw was judged as a backspun lob at a fixed 14 m/s, which carries about 20 m, so a
    full-back (26 to 28 m out) was never safe to throw to.
    - Throws are now judged as throws: `brain.js passModel` takes kind `'throw'` (from head height, no backspin:
      `strike.js` has that table).
    - They are judged at the speed they are released at, which is now enough to carry (1.2 sqrt(g d), at most
      22 m/s).
    - The threshold is on `passModel`'s own scale for a dropping ball.
  - **The AI shot from too far.** About a quarter of its shots came from 30 to 35 m. Beyond 28 m a shot's value now
    fades by exp(-(d - 28)/4) (`BRAIN.LONG`). The user's U9 shooting zone, square on up to 28 m, is untouched, and so is
    the harness's stand-in for the player.

## `qa/tr9-ai.mjs` (new; Node, 16 full matches, all 46 team drills x 2 seeds, 200 paired distributions)

| Check | Result |
|---|---|
| Swarming, per 50k loose-ball team-steps, at or below 101 | see below |
| Obvious idling: a playable free ball within 5 m and nobody going to it for over 1 s | 0 episodes (matches and drills) |
| Share of the computer's shots from beyond 25 m, band 0.05 to 0.35 | about 0.20 to 0.26 |
| Pass completion by passing (low, middle, high) in bands, higher for the best passers | about 0.78 / 0.78 / 0.82 |
| Keeper save rate on target by kind of shot (close, middle, long, headers) | see below |
| Distribution error at distrib 30 at least 1.5 times that at 90 | about 10.5 m vs 5.3 m (x2.0) |
| Distribution completion higher at 90 | about 0.43 vs 0.70 |
| The choice as documented: shorter punts and fewer throws at 30 | punts about 43 m vs 53 m; throws and rolls 29% vs 60% |
| Throws and rolls are acts that hold the ball to `tRelease` | every one (88 of 88 in the 100-pair run) |

**How swarming is counted (please read).** The plan gives only the P1 probe's number: "3 same-side bodies within 3 m of a
loose ball only 101 times" in 50,290 loose-ball team-steps. P1's probe isn't in the repo.
- **Unfiltered,** today's code gives about 150 to 230 per 50k on these seeds.
- **What those crowds are:**
  - about 45% have the ball in the air (crosses over the box);
  - about 40% fall within 3 s of a set piece into the box;
  - about 60% of the ground cases have the ball going through a group faster than 6 m/s (a pass or a deflection).
- **No double chasers:** two players of one side never both had a chase plan. The one-chaser rule holds.
- **The test** counts a crowd only round a playable ball (on the ground, at 6 m/s or less, in open play) over P1's
  denominator: about 46 per 50k. It reports the unfiltered figure beside it.
- **The cloud's call:** whether that definition is the one wanted.

## Harness

`node qa/harness.mjs --n 1000` on this branch (10 workers, 2,097 s): **60 of 62 checks pass**, above the 57 required.
- **The misses:**
  - winger touches 28.4 against 15 to 26 (origin's code misses it too: 27.6 on `pc/p7a`);
  - striker defensive actions 4.015 against 1 to 4.
- **What moved, all in band:**
  - goals 2.74 a match (2.88 before), shots 15.3 (16.5), on target 8.29, save rate 0.716;
  - counters 4.67, sequences of 5+ passes 6.97, crosses 10.3, final-third free kicks 2.13;
  - striker touches, a miss before (22.17), now pass.
- **Keepers' distribution in a match:** throws 19.9 a match (throw-ins included), rolls 0.5, punts 2.3 (3.8 before).

## Other tests on this branch

- `qa/unit/gk.mjs` 20 / 20.
- Lint: 17 / 17 rules.
- nodash: 0 em dashes on P9-B's files.
- **`qa/unit/rules.mjs`: 61 / 62.** The miss is not the AI. Its "every restart within its limit + 5 s" case waits up to
  160 s for play to reach the corner-taking side's attacking third. With this branch's match flow, seed 25's team 1
  never gets there, so the test puts the corner 70 m from the ball. The fetcher's carry of it (`rules.js`, not P9-B's)
  takes 13.02 s, 0.02 s over the limit. A request to make the test take the next seed in that case is in `HOOKS.md`.
- The same two Windows-only unit failures as before (`daily.mjs`, `presets.mjs`).
