# Build plan: Training Mode and football rework, phases 2 to 11

Source of truth: `fp/TRAINING-SPEC.md` (wins over DESIGN.md and ADDENDUM-feel.md). Inspection evidence: `fp/p1/*.md`
(matchflow, movement, ball, ai, traininginfra, firstday, perf) and the probes beside them. User-facing summary:
`fp/p1/GAP-REPORT.md`. Issue IDs below (MF-, MV-, ball-, AI-, GK-, OFF-, TAC-, ATTR-, SIM-, INF-, FD-, perf-) are the
inspection's IDs, with the skeptic's corrections applied (see section 13).

User instruction relayed verbatim to this plan: "Confirm and fix the flash apartment only at the end if i tell you".
The apartment flash (FD-5) is therefore a gated package, P11-F. It does not run unless the user asks after the final report.

**Revision of 2026-10-12.** This revision closes 32 gaps found in a review of the plan against the spec and the code:
- vague owners and missing work: the Ctrl guard, the pause card, pitch switching, the 11v11 pool, the career-free match host, the runner's admin API, lateral steps, the AI plug points, the throw clip, and the bed text;
- missing acceptance checks;
- plan contradictions: the Phase 7 merge order and the storage invariant;
- contract mismatches: `startAction`, and the missing D rating.

New issue IDs are in section 13: MF-11, MV-16, ball-13, and INF-10 to INF-13. New user decisions are G0 (d) to (g).

**Revision r4 of 2026-10-12.** A second review found 28 more gaps. This revision closes them; everything else is unchanged.
- **Contradictions fixed:**
  - perf-4 no longer skips drawing under the black fade. That would have deadlocked every reveal and changed the boot and intro path, which the user gated. It now skips only under Training's own full-screen sheets, and never while a reveal is pending (P3-A).
  - The drill body pool is now sized and counted consistently: the officials get no bodies in drills, the pool is grouped by kit, and `bodies()` counts include the sandbox body (P3-B).
  - The title key path for the Training button (P3-B).
  - The reset-half snapshot list (P8-A).
  - Smaller corrections: the perf figures (P10-B), the keys.js listener order (P5-A), the tr2b-race baseline (P2b-A), intro.js removed from P11-F, and `qa/run.mjs` handed to P11-A.
- **Missing owners or work:**
  - the shield challenge formula and the standing tackle reach (P2b-A);
  - a loader for every Training module (`js/life/train/index.js`);
  - the configured ball trajectory before the feeder exists (P4-A, P4-B);
  - admin height and preferred foot (P5-A owns config.js and teams.js in Phase 5);
  - kit colours without a human.js recolour (P3-B);
  - Free Play opponent behaviours (P5-A owns brain.js in Phase 5);
  - players leaving the pitch still holding the offside line (new issue OFF-3: P3-A and P6-B);
  - the shadow-by-preset item is now a check (P10-B).
- **Missing acceptance checks added:** admin scenario actions, the attribute editor UI, presets (Save as new, the Load list, a round trip for every type), the player asking for a pass, TAC-1, MV-11/12/13, keeper distribution, the P9-A animation states, the full reset state, and the coach feed going to the player.
- **One new user decision:** G0 (h), whether "me" counts inside the 6 v 6.

---

## 0. Ground rules for every package

**Base and worktrees**
- Repository `/home/user/LegendRising`. The game root is `LegendRising/` inside it. All paths below are relative to the game root.
- Base for Phase 2: commit 6b2de3b (build 2026.10.11c) plus whatever Gate G0 decides.
- Each phase branches from the merged result of the previous phase.
- Every package works in its own git worktree, branch `tr/p<phase>-<id>`, for example `tr/p2-a`.
- At most two packages run at a time.

**File ownership**
- A package edits only the files it owns in its phase. Reading is unrestricted.
- Within a phase, ownership is disjoint, so merges have no conflicts.
- New files are owned by the package that creates them.
- Anything else is a hook request, which is at most 20 lines (CSS hooks at most 60). It goes either to the owning package or to the integrator, who applies it at the phase merge.
- To run its own tests before the merge, a package may apply its own hook lines in a local commit labelled `[hook]`. It drops that commit before hand-over, and the integrator applies the hook queue at the merge.

**Integrator files (every phase)**

Only the integrator (the lead) edits these. Packages ask for exact lines in their hook request list.
- `index.html`: importmap entry for every new `js/life/**` module (lint `importmap-complete`), `<link>` for new CSS, and the version stamp.
- `qa/lint-rules.json`: additions to the `pure` list, new rules, and the `merged` list.
- `qa/run.mjs`: NAMED suite groups, until Phase 11. P11-A owns it in Phase 11.
- `qa/full.mjs`, until Phase 11. P11-A owns it in Phase 11.
- `js/life/train/index.js`, the Training entry module, from Phase 4 on. P3-B creates it in Phase 3. See "How Training modules are loaded" below.

**How Training modules are loaded**
- Today the only module entry is `js/life/world.js` (index.html:183). An importmap entry only maps a URL for cache busting; it loads nothing.
- `js/life/train/index.js` is the one Training entry. It statically imports every `js/life/train/*.js` module, so that each one runs its registrations: `registerScenario`, `registerType`, listeners. It also exports `enterTraining`.
- The title's Training button (js/ui/main.js, a classic script) loads it with a dynamic `import('../life/train/index.js')`. Classic scripts may use dynamic imports, and the importmap maps the URL to the same module instances that world.js uses. A career boot therefore never loads Training code.
- Career code never statically imports a `js/life/train/` module. Training passes callbacks in through the host instead. For example, the pause card is `host.pause`, which training.js calls (P4-B).
- Every package that adds a Training module lists the line `import './<module>.js';` in its hook requests to the integrator.
- `qa/unit/trainentry.mjs` (P3-B) fails when a `js/life/train/*.js` file other than `index.js` is not imported by `index.js`. It runs in `node qa/run.mjs unit`, so a module without a loader cannot merge.

**Where new modules live**
- Training Mode modules go in `js/life/train/`. This keeps them outside `js/life/football/**`, so the admin shortcut and the Ctrl listener do not trip lint rule `football-no-modifier-keys`.
- New engine maths goes in `js/life/football/` as pure modules: no THREE, no DOM, no globals, detmath only, no Math.random. Each one is added to the lint `pure` list.

**Definition of done for every package**
1. Its acceptance scripts pass.
2. `node qa/run.mjs unit lint smoke` passes with 0 console and 0 page errors.
3. `node qa/nodash.mjs <owned files>` reports 0.
4. `node qa/oldsave.mjs` passes.
5. Every new module has a header naming its owner package and the spec section it implements.
6. Player-facing text uses no em dashes and natural wording.
7. Any package that runs Training checks that the career save is untouched, with the two helpers from P3-A (`qa/lib.mjs`):
   - **write spy** (`storageSpy`): no `setItem`, `removeItem` or `clear` touches a `freyaFootball.v2` key (`v2`, `v2.slot<n>`, `v2.meta<n>`, `v2.one`) between the `train:enter` and `train:exit` events;
   - **career diff** (`careerSnapshot`/`careerDiff`, over the `freyaFootball.v2` keys only): empty between a snapshot taken after "Quit to title" has finished (or on a page with no career) and a snapshot taken after Training exits.

   The Training keys (`freyaFootball.trainPresets`, `freyaFootball.tipFS`) and the device settings (`freyaFootball.ctrl`, `gfx`, `gfxAuto`, `warmLast`) are not career keys. A test that writes them checks them on their own (`trainKeys`), never through the career diff.
   Why the diff starts after Quit: `saveNow()` rewrites `v2.slot<n>` and `v2.meta<n>`, and the meta carries `at: Date.now()` (career.js:37-39, 140), so a snapshot taken before Quit can never match.

**QA conventions** (lessons from the half-time bug)
- Each agent sets its own `QA_PORT`: package A uses 8881 and package B 8882. A server you start, you stop by its PID.
- **Real input for acceptance.** Cards, buttons and keys are pressed with `page.mouse` at the element's on-screen box, or with `page.keyboard`. Do this under pointer lock where the game holds the pointer. `element.click()` is not acceptance evidence.
- **Visibility checks.** Each test asserts that the target is visible: `document.elementFromPoint` at the button centre is the button, `#lifeFade` is not opaque above it, and the screenshot region has non-black pixels.
- **Timing.**
  - Simulation costs are measured in Node.
  - Browser CPU is measured with CDP `Performance.getMetrics` ThreadTime, not wall time. On SwiftShader, wall time includes waiting on the GPU process (perf-3 correction).
  - Anything else is compared as ratios against a baseline.
- Sim-level checks run in Node over `js/life/football/*.js` with seeded configs, so they are deterministic.

**Engineering rules**
- Fix root causes. No fake mechanics: no "force second half" button, no delay to hide a bug, no decorative setting.
- One engine: training uses `sim.js`, `ball.js`, `touch.js`, `strike.js`, `actions.js`, `brain.js`, `gkbrain.js`, `rules.js`, `mover.js`, `stamina.js`, `moves.js`, `human.js`, `view.js`, `control.js` and `controller.js`, never copies of them. The integrator adds lint rule `train-no-engine-copies` in Phase 3 to enforce this.

**Contracts are frozen at phase start**

When two packages in a phase share an API, the owner pushes a stub with the final signatures in its first commit, and the other package codes against it. Each phase lists its contracts.

The stub only protects the tree when the owner merges first. ES-module imports are linked when the page loads, so importing a missing export fails the whole page. Two rules follow:
- A package that merges first never statically imports a module or export that only the later package creates. It listens for an event instead. For example, sandbox.js (P3-A) fires `train:exit` and runner.js (P3-B) listens for it; sandbox.js does not import runner.js.
- When each package consumes the other's API (Phase 7), the integrator merges both stub commits into the phase base on day one, before either package's main work, and both packages rebase on it.

**Integrator merge checklist (every phase)**
0. On day one, merge any stub commit the phase calls for (Phase 7).
1. Merge in the stated order.
2. Apply the hook queue.
3. Add importmap entries and CSS links, and, from Phase 4 on, the `js/life/train/index.js` import lines from the hook requests. `qa/unit/trainentry.mjs` must pass.
4. Update the lint `pure` list and the `merged` list.
5. Run `node qa/run.mjs integrity unit smoke`, both packages' acceptance scripts, and the regression list named in the phase.
6. Re-record goldens only after review.
7. Commit with the session attribution lines.

## Gate G0 (before Phase 2, about 2 h, lead)

1. **The live repo has uncommitted work** from P3a fix round 2 (task #113, the shot wind-up and side swap):
   - modified: `js/life/football/view.js`, `js/life/gait.js`, `js/life/human.js`, `js/life/moves.js`;
   - untracked: `qa/p3f2-*.mjs` and `qa/vr2-*.mjs`.

   P2-B rewrites the same gait, human and view code. Finish and commit that work, or stash it, and record the new base hash. Note: this work still uses the stale `G.rootX` that MV-6 fixes.
2. **Fold pending task #114** (phone keys in match) into P2-A. It is the same defect as ball-9 and INF-2.
3. **Decisions to get from the user** (see the GAP-REPORT section "Decisions we need from you"):
   - (a) the new shoulder-check key: default V hold;
   - (b) early arrival: keep "present from 9:30" or pay only for 30 to 60 minutes early;
   - (c) the meaning of Restart from Kickoff: default is keep clock and score and re-line both teams for a kick-off in the current half, taken by the side that kicked off that half;
   - (d) the free-kick wall: default is that wall players count toward the defending side's 6 outfield players (spec 0's 6v6 limit). With a wall of 6 there are no other outfield defenders. The alternative (a wall of up to 6 on top of 6 defenders) breaks the 6v6 limit and the 14-body pool;
   - (e) "reuse effSkill" (spec 1): `effSkill` returns 0 without a career (career.js:246-247), so a career-free Training cannot use it. Default:
     - with a career loaded, "my attributes" start from `effSkills()` (career.js:254), snapshotted just before the career is held aside. Outside a match that is `S.skills` plus any warm-up bonus;
     - without a career, they start from the editor values;
     - either way the vector goes through the same `attrsForPlayer` and `derive` chain (attrs.js:71-86).

     This departs from the letter of the spec, so it needs the user's OK;
   - (f) NPC variation (spec 4, "modest reproducible variation"): `attrsForAI` adds the role profile (`PROFILE[arch][k]`) and then ±6 of seeded noise (attrs.js:88-112). At average 50 the inspection measured skills from 37 to 62, about ±13 (ai.md:130-132). Default: keep the role profiles, since a centre-back tackles better than a striker in the real system. The config sheet then says "Players vary by role, plus up to 6 either way". The alternative is to flatten training NPCs to ±6 noise only;
   - (g) the created character on a fresh page: when the page has a saved career but none is loaded (S null at the title), Training shows the default look. The alternative is to read the last-used slot's look read-only, which parses a save of about 1 MB.
   - (h) does "me" count inside "up to 6 attackers vs 6 defenders" (spec 0)? Default: yes. The player is one of his side's outfield players: my side's count includes me, and validation keeps it at least 1. This matches the spec's own wording: "1v1", "2v1" and "me alone" (spec 5) count the player.
     - A drill then has at most 12 outfield players, me included, plus one optional AI keeper: **13 agents, 11 outfield NPCs plus the keeper.**
     - The alternative reads spec 8's "up to 12 NPCs plus GK" literally: 6 NPCs a side plus me, so 14 agents. The performance gate covers both readings (P10-B runs a 14-agent stress case in Node), so only what the user can configure changes.

   Packages use the defaults if no answer has arrived by the time they start.
4. **Lead confirmations** (no user input needed; the lead confirms them at G0):
   - the Strength, Balance and DefAwareness coefficients (P2b-A item 1);
   - the 50/50 duel reading of spec 3, "the same with each player's control rating added". Default: each side's duel rating is X = S + C (shield rating plus control rating, both 1 to 99), and p(A wins) = clamp(1/(1+exp(-(X_A - X_B)/k)) × angle × fatigue, 0.05, 0.90), where k is the tunable `DUEL_K` (default 8);
   - **the meaning of "fatigue"** in the shield and 50/50 formulas, which spec 3 does not define. Default: fatigue = fF(breath of the challenger) / fF(breath of the player holding or shielding the ball), where fF(b) = 0.85 + 0.15 b is the control zone's own fFatigue. Equal breath gives 1.0. A spent shielder (breath 0) against a fresh defender gives 1.18, and a spent defender against a fresh shielder gives 0.85. In a 50/50 nobody holds the ball, so A's factor is fF(breath of A) / fF(breath of B);
   - **which event the shield formula resolves** (spec 3 gives two formulas that can apply to a shielder). Default:
     - A **shield challenge** is an opponent's attempt to take the ball off a shielding carrier without a tackle. He is within contact range (`TUNE.CHAL_R`, default 0.8 m centre to centre) and closes toward the ball's side of the carrier at `TUNE.CHAL_V` (default 0.5 m/s) or more. The AI presser does this in `pressMove`; the player does it by walking into the shielder toward the ball.
     - Each engagement is resolved once, with p(defender wins) = `duel.pShieldLoss(S, D, angle, fatigue)` = clamp(1/(1+exp(-(D - S)/8)) × angle × fatigue, 0.05, 0.90). Angle is measured from the shielder's facing: behind 0.6, side 1.0, interpolated between. The challenger must break contact, or wait `TUNE.CHAL_GAP` (default 0.8 s), before the next challenge.
     - A won challenge pokes the ball loose by contact physics: an impulse from the challenger's foot toward his side, with no position jump. The race then decides who gets it.
     - A standing or sliding **tackle** on a shielder is still a tackle. It uses the tackle formula with S in place of C (spec 3), with the tackle's own timing and angle tables (front 1.0, side 0.9, behind 0.5; clamp 0.92);
   - the quick-menu restart key: Backspace;
   - the Low, Average, High and Max attribute preset values: 35, 55, 75 and 99.

---

## Phase 2: Foundations, including the half-time fix

Goal: the match flow can never freeze; passes to the player stay his; the keeper is never the player; the walk is clean, with no snap, notch, flight phase, limp or busy legs; clip exits are smooth; the keeper shuffle stays planted; no per-view ball leak.

Merge order: P2-A, then P2-B. There is no shared file and no contract between them.

### P2-A: Match flow, kick-offs, keeper safety and key leaks (about 13 h)

**Owns (existing files)**
- `js/life/football/controller.js`, `js/life/football/fphud.js`, `css/fp.css`
- `js/life/football/rules.js`, `js/life/football/sim.js`, `js/life/football/bridge.js`, `js/life/football/brain.js`
- `js/life/phone.js`
- `qa/int-fullmatch.mjs`, `qa/wpF-match.mjs`, `qa/wpF-lib.mjs`, `qa/unit/rules.mjs`, `qa/unit/sim.mjs`

**New files**
- `qa/trlib.mjs`: real-input helpers shared by every later test:
  - `clickReal(page, selector)`: box centre, then `page.mouse`;
  - `assertVisible(page, selector)`: elementFromPoint, fade opacity and pixel luminance;
  - `pressReal`;
  - `cpuMs(page, fn)`: CDP ThreadTime.
- `qa/tr2-halftime.mjs`, `qa/tr2-kickoff.mjs`, `qa/tr2-keys.mjs`, `qa/tr2-scale.mjs` (browser)
- `qa/tr2-passme.mjs`, `qa/tr2-gkme.mjs` (Node)

**Reuse**
- The existing halftime and fulltime flow: `startHalftime`, `halftime`, `showHalftimeCard`, `secondHalfGo` and `fulltime` in controller.js.
- The SCHED task `fp-match` (controller.js:1410).
- `hudNotice`, `controlReset`, `coverScreen` and `revealAfterFrames`.
- From rules.js: `pickTaker`, `restartStep`, `subStep`, `roleSubs` and `shortHanded`.
- From brain.js: `ballPlans`.
- The probe scripts in `fp/p1/` (probe-ht, probe-click, probe-ko, verify-mf, vsteal, vgkme, vfirst) as test seeds.

**Work**
1. **MF-1, MF-4, MF-6: cards above the cover.**
   - Render the half-time, full-time and skip cards above `#lifeFade`. Either host the overlay at body level with a z-index above 90 and its own dim layer, or lift the cover before showing a card. Pick one and use it for all three cards.
   - Call `document.exitPointerLock()` whenever a card that needs the mouse appears. Relock on Second half or Continue: the click is the user gesture.
   - Let the wheel and Tab through while such an overlay is up (controller.js:125-144).
   - Put the card's action buttons in a footer that does not scroll and stays visible at 1280x720 and 1024x600 (fp.css `.fp-box`).
2. **MF-2: the card timer must not depend on the mode step.**
   - Count the half-time card timer in the SCHED `fp-match` task, or exempt the halftime and fulltime states from `pauseOnUnlock`.
   - The visible button is the exit. Do not add any "force" control.
3. **MF-5:** call `controlReset()` in `secondHalfGo`, and do not route pointer down/up to the match while a card is up.
4. **MF-7:** restore `FS.prevState`, including `entering`, after half time.
5. **MF-8:** clear `FS.goalEv`, `ckGoal` and `ckNow` in `startMatch` and `teardown`, and expose a `clearMatchFlags()` that P8-A reuses.
5b. **MF-11: card hints** (matchflow.md 2.4.d). While the half-time, full-time or skip card is up, the HUD shows no live-play hints. Today `hud()` keeps building hints from `liveMe()` (controller.js:738-747), so "R call for it" and "Shift sprint" stay on screen over the card. While a card is up, `hud()` shows only the card's own hint, or none.
6. **MF-3: the kick-off waits.**
   - In the `restartStep` wait stage, emit a "Take it." notice event at 12 s.
   - At 25 s, hand the kick-off to the nearest team-mate, excluding `isMe`.
   - Add the same `isMe` fallback to the collect and carry stages.
   - Show the notice through controller `hudNotice`.
7. **MF-9:** hold the change until the incoming player reaches the fourth official's spot, with a timeout that walks him there (rules.js `subStep`, controller.js `onCameOn`).
8. **GK-1: the player in goal.**
   - Exclude `isMe` from the emergency-keeper choice (rules.js:951-955).
   - Guard `gkStep` with `!a.isMe || ms.meAI` (sim.js:338-339).
9. **AI-2, plus the plan-wipe correction to ball-1** (brain.js:310, 323, 342-360):
   - When `chain.pass.recv` is the human player, give his team no AI chase plan unless an AI mate is clearly first by a margin, or the ball will pass beyond the player.
   - Never null the player's own `receive` plan or `plan.first`. A queued first-time strike must survive to contact.
   - Coach feeds "to me" become chain passes with `recv = me` in P3-B: training.js is not owned here.
10. **ball-10:** add the perceived-offside test to the player's "In behind!" call option (brain.js:518-529).
11. **MV-10: height in matches.**
    - Add `scale` to the bridge.js `sideTeam` player and bench records: the player's `S.player.look.height`; AI players take the same `lookFor` seed that view.js uses.
    - Use `me.scale` consistently for `P.eye` before and during the match (controller.js:488, 493, 574).
12. **ball-9 and INF-2 (task #114): phone keys.**
    - `phone.js` returns early for Q and Tab in modes `match`, `train` and the training sandbox. In those modes Tab stays the overview.
    - With `S` null, it never sets mode `hub`. This removes the soft lock.
13. **perf-5:** `proj()` uses the cached `HUDS.w` and `HUDS.h` (controller.js:727-735).
14. **QA debt:** `int-fullmatch.mjs` and `wpF-match.mjs` press cards with `clickReal` under pointer lock and assert visibility.

**Hook requests:** none.

**Acceptance**
- **`qa/tr2-halftime.mjs`** (browser, real mouse, pointer locked).

  Run it for a career starter, a career bench sub, a bench sub skipping with E held, and `test:11v11`. At the half-time card:
  - the "Second half" button passes `assertVisible`;
  - `pointerLockElement` is null;
  - a real click moves the state to live or bench within 1 s, with half 2 and the ends swapped;
  - `CTRL.queue` is empty at the kick-off.

  Then:
  - **Esc at the card:** the button is still clickable, or the card advances after 60 s of real frames.
  - **Full time:** Continue is fully inside the viewport at 1280x720 and 1024x600, and a real click reaches the leave path. The wheel scrolls the box, and Tab moves focus to Continue.
  - **Repeat:** the whole flow runs 3 times in one page.
  - **MF-11:** while the card is up, before and after Esc, `.fp-hints` contains none of the live-play hints ("call for it", "sprint", "shoot", "pass").
  - **MF-6:** in the career bench run, skipping with E held, the live score and minute card passes `assertVisible` at least once during the skip.
  - **MF-7:** a called substitute walking to the fourth official at the whistle (state `entering`) is still `entering` after a real click on Second half, with `FS.called` true and the entering hint shown, and comes on at the fourth official.
  - **MF-8:** a scripted goal on the half-time whistle never replays. `FS.goalEv`, `ckGoal` and `ckNow` are null after `secondHalfGo`, and no goal card shows in the first 5 s of the second half. A match started after a match that ended on a goal also starts with them null.
- **`qa/tr2-scale.mjs`** (browser, career match, MV-10):
  - each of the 22 agents' `scale` equals the scale of its drawn body (`h.scale`) within 0.001;
  - the player's `P.eye` on the last life frame before the match switch and on the first match frame differ by ≤ 1 cm;
  - harness bands are unchanged (run alongside `harness.mjs`).
- **perf-5** (in `qa/tr2-keys.mjs`): with a getter spy on `Element.prototype.clientWidth` and `clientHeight` during 120 live frames, there are at most 2 reads per frame (the one in `hud()`), so `proj()` itself reads none.
- **`qa/tr2-kickoff.mjs`** (`test:11v11`, the player is the only ST and his side kicks off):
  - "Take it." shows at 12 s ±1;
  - at 25 s ±1 a team-mate takes it and the clock runs;
  - the same happens after conceding;
  - an RMB tap before 25 s still takes it.
- **`qa/tr2-passme.mjs`** (Node, 8 seeds for each vsteal geometry):
  - with a mate 2.5 m or 5 m off the lane, the mate chases in 0 of 8 runs unless he is clearly first, and the player receives in at least 7 of 8;
  - a queued first-time strike survives to contact in 12 of 12 runs.
- **`qa/tr2-gkme.mjs`** (Node, 30 seeds, keeper sent off): the player is never `isGK`, `ms.gks` never points at him, and his intent is never overwritten.
- **ball-10** (in `qa/tr2-passme.mjs`): with the player's run in behind placed 0.5 m past the perceived line, the "In behind!" call option is never offered (0 of 20 seeds). With the run 0.5 m onside it is offered.
- **`qa/tr2-keys.mjs`:**
  - in a live match, Tab shows the overview and never the phone, and Q does nothing;
  - in life, Q and Tab still open the hub and phone;
  - with `S` null, Q does not lock the keys.
- **`qa/unit/rules.mjs`** additions: the kick-off fallback excludes `isMe`, and the sub enters at the fourth official.
- **Regression:** `wpF-flow`, `wpF-recover`, `wpW1-call`, `wpW1-boost`, `int-fullmatch`, `wpF-match`, and `node qa/harness.mjs --n 200`, whose bands must be unchanged.

**Risks**
- The overlay z-order also matters for the pause card and the warm-up minigame; check both.
- Pointer lock in headless Chromium: the probes show it works.
- The bridge scale changes header and reach geometry in career matches; check the harness bands.
- brain.js changes must stay neutral when `meAI` is set, because the harness uses `meAI`.

### P2-B: Walk rework, lateral steps, clip exits, bob, intent to the gait, keeper shuffle, view ball leak (about 19 h)

**Owns (existing files)**
- `js/life/gait.js`, `js/life/gaitcore.js`, `js/life/human.js`, `js/life/rig.js`, `js/life/mover.js`
- `js/life/core/me.js`, `js/life/core/move.js`
- `js/life/football/matchcam.js`, `js/life/football/view.js`, `js/life/football/pitchmesh.js`, `js/life/gkmoves.js`
- `qa/wpB-feet.mjs`, `qa/wpB-life.mjs`, `qa/unit/gaitcore.mjs`, `qa/unit/mover.mjs`

**New files**
- `qa/tr2-gait.mjs`, `qa/tr2-clipexit.mjs`, `qa/tr2-stop.mjs`, `qa/tr2-startstop.mjs`, `qa/tr2-gkshuffle.mjs`, `qa/tr2-viewleak.mjs`

**Reuse**
- Footprint locks, phase from distance, the start, stop and pivot steps, `inertiaApply`, and the gait `shuffle` and `jockey` styles. The verifier showed these plant the keeper's feet.
- The probes `fp/p1/probe-walktrace.mjs`, `probe-cam.mjs`, `probe-clipexit.mjs` and `vmv/vprobe.mjs`.

**Work**
1. **MV-1 to MV-5, done together** (the skeptic showed they interact):
   - **Swing start.** The swing leg starts from its actual stance knee angle and eases to the hold length (gait.js:861, 870). Ramping `cw` alone still leaves a 0.17 rad straighten and a 13 mm pop.
   - **Hip height.** Filter it with a critically damped spring in both directions, or use a designed pelvis curve with reach as a soft constraint (gait.js:855-856). The bob reads the smoothed pelvis (me.js:127-134, matchcam.js:177-183), with no running-mean sawtooth.
   - **Walk mode.** Enforce minimum double support: hold lift-off until the other foot has landed, or cap the walk step at the reach span (gait.js:594).
   - **Then the swing time.** Only after that, raise `TSW_MAX` (about 0.55) or derive it from the table and scale it with body height (gait.js:48, 599). Raising it alone makes the flight phase worse.
   - **Time floor.** The floor never advances the shared clock for one late swing (gait.js:561-568).
2. **MV-13:**
   - keep the heel-height floor until u 0.95;
   - keep the knee limiter on until touchdown;
   - give the backpedal swing a toe-up profile.
3. **MV-11:** walk-specific acceleration and braking in the LIFE profile (about 3 to 4 m/s²), or let the stop planner set the deceleration so that the last footstep lands where the root stops (mover.js:66-73).
4. **MV-12:** in third person, rate-limit the mover heading from standing, or take a pivot step first. Pass the third-person body yaw as the mover face (me.js:151, move.js:129).
5. **MV-6: clip exits.**
   - `gaitPlace` uses the current root and resets `vx`, `vz` and `vRaw0` (gait.js:105).
   - Inertialise the leg bones after IK on a mode change (about 0.2 s), so the legs no longer snap after `inertiaApply` (human.js:1900-1982).
   - This covers both branches: travel under 1.5 m and over 1.5 m.
6. **MV-8: intent to the gait.**
   - `liveSt` and `FPST` pass `st.intent`, taken from the agent mover target and 0 when there is no intent (view.js:298, 371).
   - Pass `st.style` for backpedal. Jockey and shield come later, in P2b-B and P9-A.
7. **GK-2 and MV-7: keeper shuffle.**
   - Above about 0.3 m/s, drive the keeper's legs with the gait in style `shuffle`, and keep `gkready` as an upper-body layer (view.js:224-229, gkmoves.js:59-75).
   - Keep the static `gkready` pose only when he is nearly still.
8. **perf-2 (ball part):** use one shared ball geometry and material in `pitchmesh.js` `ballMesh`, or dispose them in `viewDispose` (view.js:413). Pruning `MG.still` is P3-A's job.
9. **MV-16: sideways in first person** (movement.md 2.9).
   - Today, at 0.8 m/s or more sideways (`SHUF_MAX` 0.9 body units, gait.js:65 and 431) there are no side steps. The hips twist up to 1.1 rad (gait.js:434) and the legs walk diagonally.
   - DESIGN 3.5.9 asks for at most 0.8 rad of twist plus a shuffle.
   - Work: side steps (the `shuffle` style) up to about 2 m/s, then a crossover step, with the twist capped at 0.8 rad. This is the lateral movement in spec section 2; the jockey style stays with P9-A.

**Hook requests:** none. Golden trajectories are re-recorded by the integrator after review.

**Acceptance**
- **`qa/tr2-gait.mjs`** (browser): a real body on the real mover at 60 Hz and 30 Hz; body scales 0.92, 1.0 and 1.08; walk at 1.0 and 1.7, jog at 3.8, sprint at 7.8 m/s. At 60 Hz:

  | Check | Limit |
  |---|---|
  | Knee change at lift-off | ≤ 0.12 rad per frame (≤ 0.2 at 30 Hz) |
  | Ball-of-foot rise on the lift-off frame | ≤ 12 mm |
  | Hip vertical velocity change | ≤ 4 mm per frame |
  | Hips pinned at the top | under 40% of frames |
  | Walk mode | no frame with both feet airborne |
  | Left/right touchdown intervals | within 3% |
  | Cadence | within 5% of the table at the body's scale |
  | Planted drift | ≤ 2 mm |
  | Heel clearance | ≥ 15 mm until u 0.95 |
  | Camera bob while walking | ≤ 2 mm per frame, no one-frame rebound > 2 mm |

  Lateral (MV-16), first person, sideways at 1.0, 2.0 and 3.0 m/s:
  - hip twist ≤ 0.8 rad;
  - at 1.0 and 2.0 m/s, each swing foot travels within 35° of the body's sideways axis;
  - planted drift ≤ 2 mm;
  - the feet never pass through each other (at least 0.08 m apart);
  - a contact sheet at each speed.
- **`qa/tr2-clipexit.mjs`:** strike, pass, header and tackle clips, with root travel of 0, 1.0 and 2.0 m. On the first locomotion frame:
  - `G.v` is within 20% of the root speed;
  - no leg bone changes by more than 0.25 rad in a frame;
  - the planted foot moves ≤ 10 mm.
- **`qa/tr2-stop.mjs`** (match bodies with intent):
  - STOP within 0.2 s of release;
  - STAND ≤ 0.35 s after the root stops;
  - the hard-stop plant fires from a release above 4 m/s.
- **`qa/tr2-startstop.mjs`** (browser, real keys; the life body in first and third person, and a match body with intent; body scales 0.92, 1.0 and 1.08). This covers spec 2's "stop/restart", "turning that differs standing vs sprinting" and "no snapping", and the MV-11, MV-12 and MV-13 work:
  - **MV-11, life walk start:** from standing, a W press reaches 90% of the walk target speed no earlier than the first swing foot's touchdown. The root travels ≤ 0.05 m before the first foot lifts, and acceleration stays ≤ 4 m/s².
  - **MV-11, life walk stop:** after the release, the root stops within one step. The last footstep lands within 0.05 m of where the root stops, no footstep starts more than 0.35 s after the root has stopped, and braking stays ≤ 4 m/s².
  - **MV-12, third-person start:** from standing, a W press at 90, 135 and 180 degrees from the body's facing:
    - no swing foot moves more than 0.05 m against the direction of travel (no backward steps);
    - body yaw follows the mover heading within the rate limit chosen in work item 4, or after the pivot step;
    - no hip or thigh bone changes by more than 0.25 rad in one frame (no thigh pop).
  - **Turns:** 90 and 180 degree turns from standing, at a jog (3.8 m/s) and at a sprint (7.8 m/s):
    - the pelvis yaw changes by at most 0.25 rad per frame;
    - the body follows the mover's path, whose sprint turn is wider than its jog turn (mover behaviour, verified working). The drawn pelvis heading stays within 0.15 rad of the mover heading;
    - planted drift ≤ 2 mm.
  - **MV-13, backpedal:** at 1.5 and 2.5 m/s:
    - toe clearance ≥ 15 mm through every swing (the toe-up profile);
    - the knee limiter is on until touchdown;
    - planted drift ≤ 2 mm;
    - speed within ±5% of the command.

    The heel-clearance row of `tr2-gait` covers forward walking.
  - A contact sheet of each case.
- **`qa/tr2-gkshuffle.mjs`:** at 0.5, 1.5 and 2.4 m/s, a planted foot in at least 40% of frames, and per-foot skate ≤ 10 mm while planted.
- **`qa/tr2-viewleak.mjs`:** 10 drill start/quit cycles leave `renderer.info.memory.geometries` at +0 after the first.
- **Tightened gate:** `qa/wpB-feet.mjs` uses 0.12 rad per frame at lift-off and still passes.
- **Regression:** `wpB-life`, `wpB-npc`, the unit tests for gaitcore, mover and stamina, `wpK-gk`, `wpK-strike`, `wpF-feel` and `wpI-look`.

**Risks**
- gait.js is the most delicate file in the game, and every NPC in life changes how it walks. Contact sheets are needed for review.
- Leg inertialisation adds animation cost; stay inside the full-pose budget (human.js:1384).
- The goldens must be re-recorded.
- Gate G0 must be resolved first.

---

## Phase 2b: Control zone, first-to-ball, shield on C, tackle formula

Goal: implement TRAINING-SPEC section 3 in the shared engine for matches and training.
- A race to the ball with a 0.15 s duel.
- The control radius R, touch quality q and touch distance.
- Receiving on the move works.
- The possession lock is gone.
- Shield on C (Ctrl in full screen with keyboard lock).
- The tackle and slide logistics, with timing, angle and recovery.
- The AI shields and challenges loose balls.
- Animations driven by the real contact point.

Merge order: P2b-A, then P2b-B.

**Contracts (P2b-A stubs them on day one)**
- `zone.js`, all pure:
  - `ratings(at)` returns `{c, vc, S, D, T, C}`, each from the spec section 3 formula:
    - `S` = 0.45 Strength + 0.35 BallControl + 0.20 Balance (shield);
    - `D` = 0.45 Tackling + 0.30 Strength + 0.25 DefAwareness (the defender against a shield);
    - `T` = 0.50 Tackling + 0.25 Strength + 0.25 DefAwareness (tackle);
    - `C` = 0.50 BallControl + 0.30 Agility + 0.20 Balance (control against a tackle);
  - `R(a, ball, ms)` returns metres;
  - `part(y)` returns `foot`, `thigh`, `chest` or `head`;
  - `q(a, v, pressure, breath)`;
  - `touchDist(q)`;
  - `arrivals(ms)` returns a sorted list `[{id, t}]`.
- `duel.js`, all pure:
  - `pShieldLoss(S, D, angle, fatigue)`: p(defender wins a shield challenge), the spec 3 shield formula. The engine uses it to resolve a real challenge (P2b-A item 7a, in sim.js); brain.js also uses it to value options;
  - `shieldAngle(rel)`: behind 0.6, side 1.0, interpolated by the angle from the shielder's facing;
  - `fatigueFactor(bChallenger, bHolder)`: fF(bChallenger)/fF(bHolder), with fF(b) = 0.85 + 0.15 b (G0 lead confirmation);
  - `p5050(XA, XB, angle, fatigue)`, where X = S + C for each player (the G0 lead confirmation), clamped to 0.05 to 0.90;
  - `pTackleWin(T, C, timing, angle)`;
  - `timingFactor(dt)`, `angleFactor(rel)`;
  - `standReach(tackling)`: 0.95 + 0.25 × tackling/99 m (spec 3). The poke reaches `standReach + TUNE.POKE_DR` (default 0.10 m, today's poke-to-stand offset at touch.js:46-47);
  - `slideReach(v, vTop)`;
  - `slideStep(state, h)`, using mu 0.55;
  - `recovery(agility, missed)`.
- `tune.js`: `TUNE` holds every section 3 constant as `{value, def, min, max, label}`, plus `tuneSet(k, v)`, `tuneReset()` and `tuneGet(k)`. The engine reads it at call time.
- Agent fields:
  - `a.intent.shield`: boolean, written by control.js for the player and by brain.js for the AI;
  - `a.chal`: the open shield challenge `{by, t}`, written by sim.js, so that each engagement is resolved once;
  - `a.shield`: the resolved state, written by actions.js;
  - `a.recoverT`.
- Act data for `tackle` and `slide`: `{contact:{x,y,z}, tc, side:'L'|'R', outcome, v0}`.
- `startAction(ms, a, rq)` keeps its real signature (actions.js:829): `rq.kind` is `'tackle'` or `'slide'`, `rq.sub` is the tackle style, and the new `rq.target` is an agent id or `'ball'`. With `'ball'` it starts a challenge on the predicted ball instead of returning null when nobody controls it (actions.js:833-834 today require `ms.poss.ctl` to be an opponent).

### P2b-A: Engine maths and possession (about 19 h)

**Owns (existing files)**
- `js/life/football/touch.js`, `js/life/football/actions.js`, `js/life/football/attrs.js`, `js/life/football/agent.js`
- `js/life/football/sim.js`, `js/life/football/ball.js`, `js/life/football/harness.js`
- `js/life/stamina.js`
- `qa/harness.mjs`, `qa/unit/touch.mjs`, `qa/unit/sim.mjs`, `qa/unit/stamina.mjs`

**New files**
- `js/life/football/tune.js`, `js/life/football/zone.js`, `js/life/football/duel.js`: all pure; integrator adds them to the lint `pure` list.
- `qa/unit/zone.mjs`, `qa/unit/duel.mjs`
- `qa/tr2b-race.mjs`, `qa/tr2b-receive.mjs`, `qa/tr2b-tackle.mjs`, `qa/tr2b-shieldsim.mjs`

**Reuse**
- ball.js `ballPredict` (873) and `firstReach` (908).
- The mover's `timeToPointQ`.
- touch.js `reachEnvelope` as the plug point for R, plus `firstTouch` and `tackleOutcome`. Keep the leg-first foul geometry.
- actions.js `touchCheck`, `receive`, `controlCheck` and `startAction`.
  - Integrator note (TR-2 fix round 1, commit 49bdcaf): `touchCheck` has a guarded early return in its first-time branch (`a.isMe && !ms.meAI`, the ball still closing on him): the player's own first-time strike waits for the ball instead of turning into a control touch. It was an approved cross-package edit in Phase 2. P2b-A's race and control-zone rework keeps or replaces it, and `qa/tr2-passme.mjs` ("a strike, not a control touch") must stay green.
- `pressureOn`, the sim.js `chargeFouls`, and `stamAction`.
- The verifier probes `fp/p1/verify-ball/v1-receive.mjs`, `v3-match.mjs` and `v4-tackle.mjs`.

**Work**
1. **Attributes** (ball-4, ATTR-1):
   - Add derived `strength`, `balance` and `defAware` in attrs.js `derive()`. `levelled()` and `raised()` re-derive them.
   - Document the mapping in the attrs.js header. Proposed mapping:

     | Spec stat | Real attribute |
     |---|---|
     | BallControl | `ctrl` |
     | Agility | `agility` |
     | Composure | `composure` |
     | Tackling | `tackling` |
     | Strength | 0.75 power + 0.25 jumping |
     | Balance | 0.4 agility + 0.3 ctrl + 0.3 power |
     | DefAwareness | 0.6 interception + 0.25 composure + 0.15 tackling |

     The coefficients are tunables; the lead confirms them.
2. **tune.js** holds every constant of spec section 3 with defaults. They are runtime only and never saved in `S`.
3. **zone.js**:
   - c, vc, R with fSpeed, fHeight, fAngle and fFatigue; q; touch distance; all exactly as written in the spec.
   - Arrival time for every nearby player, the player included, to the predicted path, using his mover (acceleration, top speed, turn).
   - The earliest arrival wins. Arrivals within 0.15 s go to a 50/50 duel, `duel.p5050` with each side's X = S + C, resolved with the seeded `ms.r`.
4. **touch.js**:
   - `reachEnvelope` becomes R. Facing matters: the ball behind is no longer "foot".
   - `firstTouch` works in the receiver's frame. The ball ends at `touchDist(q)` ahead along the intended direction (the WASD or plan direction, else the heading), carried at running speed.
   - The body part is chosen from the real ball height: under 0.4 m foot, up to 1.4 m thigh or chest, above that header.
   - `classifyContact` and the interception thresholds follow R and vc.
   - `tackleOutcome` multiplies the ball-first result by `pTackleWin`. C is replaced by S while shielding.
   - **Standing reach (spec 3):** `TACKLE.stand.reach` and `reachK` (touch.js:46, today 1.05 + 0.003 tackling) are replaced by `duel.standReach(tackling)` = 0.95 + 0.25 × tackling/99 m. The poke follows at `standReach + TUNE.POKE_DR`. Both constants are in `TUNE`. brain.js's own copy (brain.js:1026) is P2b-B's to replace.
   - `slideProfile` starts from the approach velocity, decelerates by friction and reaches 1.6 + 0.9 v/vTop. (ball-6, ball-7, MV-14 slide part)
5. **actions.js**:
   - **Race and control.** `touchCheck` uses the race and the duel (ball-2). Control lapses when the ball leaves the controller's R, so a heavy touch can be contested (ball-3, removing the 2.4 m stickiness at actions.js:388).
   - **Receiving.** `receive` passes agility, composure, balance, breath and pressure into q (ball-1).
   - **Shield intent:**
     - speed cap at 0.6 x jog;
     - the ball on the far foot (dribble and nudge targets);
     - the body between the defender and the ball.
   - **Slide.** It carries the run-in velocity and decelerates by friction. Recovery is 0.45 + 0.6(1 - agility/99) s, longer after a miss (ball-7).
   - **Loose balls.** A tackle or slide aimed at the predicted ball, resolved by the duel (ball-8).
6. **stamina.js:** a breath cost for shielding, scaled by how much stronger the defender is: an extra cost only when D > S, growing with D - S, through `stamAction`. The constants are in `TUNE`.
7. **sim.js:** persistent pushing from behind on a shielder raises the foul chance (`chargeFouls`, 588-605). The chance grows with the time in contact from behind; from the side there is no extra chance.
7a. **sim.js, shield challenges** (spec 3, the G0 reading). Today nothing resolves a challenge on a shielder: `pShieldLoss` was only planned for brain.js's option values.
   - Beside `chargeFouls`, detect an engagement on every shielding carrier (`a.shield`): an opponent within `TUNE.CHAL_R`, closing toward the ball's side at `TUNE.CHAL_V` or more.
   - Resolve it once with `pShieldLoss(S, D, shieldAngle(rel), fatigueFactor(bD, bS))` and the seeded `ms.r`. Record it in `a.chal`, and allow no new roll for that pair until contact breaks or `TUNE.CHAL_GAP` passes.
   - A defender win clears control and gives the ball a contact impulse from the challenger's foot toward his side (ball.js `ballKick` with the challenger as the touching agent, no position change). The race then decides who gets it.
   - A loss leaves the carrier in control. The breath cost of item 6 applies either way.
7b. **touch.js, the tackle result:** a won tackle moves the ball by the contact impulse from the tackling foot's direction and speed, with no position jump. A late tackle (timing beyond ±0.08 s) and a tackle from behind raise the foul chance.
8. **Calibration:** `node qa/harness.mjs --n 1000` bands. Any band change is listed for the lead with its cause.

**Hook requests:** none expected. P2b-B's work is through contracts.

**Acceptance**
- **`qa/unit/zone.mjs`:** values at spec example points (c, vc, each f factor, q, touch distance), arrival ordering, and the duel window at 0.15 s.
- **`qa/unit/duel.mjs`:**
  - logistic shapes, with clamps at 0.05/0.90 for the shield and the 50/50, and 0.05/0.92 for the tackle;
  - `p5050` is symmetric (p(A, B) + p(B, A) = 1 at equal angle and fatigue, inside the clamps) and rises with X_A - X_B;
  - `ratings` returns S, D, T and C equal to the spec formulas at 5 sample attribute sets;
  - timing gives 1 at ±0.08 s and 0.3 at ±0.3 s;
  - angle factors: front 1.0, side 0.9, behind 0.5 for the tackle; behind 0.6 and side 1.0 for the shield;
  - slide reach and recovery formulas;
  - `standReach(1)` = 0.9525, `standReach(50)` ≈ 1.0763 and `standReach(99)` = 1.20 (±1e-4);
  - `pShieldLoss` equals clamp(logistic((D - S)/8) × angle × fatigue, 0.05, 0.90) at 5 sample points. `shieldAngle` gives 0.6 behind and 1.0 at the side, and `fatigueFactor(b, b)` = 1.
- **`qa/tr2b-race.mjs`** (Node, 10 seeds of 11v11):
  - when the arrival gap is above 0.15 s the earliest wins at least 95% of the time;
  - duels happen only inside the window;
  - inside the window, over 400 duels per cell at X gaps of 0, +15 and +30, the winner rate follows `p5050` within ±5%, and the side with the higher control rating wins more;
  - "locked" steps, where an opponent nearer the ball with it inside his R cannot play it: 0. The baseline is the verifier's `lockSteps` metric of `fp/p1/verify-ball/v3-match.mjs`: 693 and 1058 per match (`verify-ball/v3-seed7.out:13`, `v3-seed8.out:12`). ball.md:35-37 reports 888 and 1335 from the inspector's own p2b runs, which count an opponent nearer the ball with it inside his foot envelope, a looser test. The gate is 0 on the v3 metric, and the inspector's count must fall too;
  - no NaN anywhere.
- **`qa/tr2b-receive.mjs`** (Node with the real `controlStep`, W plus Shift held; passes from behind and from the front at 12 and 14 m/s; sprint, jog and lateral; ctrl 40, 50 and 90; 20 seeds each):
  - control is kept for at least 2 s in at least 90% of runs at ctrl 50 or more;
  - the ball rests ahead at `touchDist` ±0.3 m;
  - a lower q gives a longer touch (monotonic).
- **`qa/tr2b-tackle.mjs`** (Node, 400 trials per cell):
  - the win rate follows the T-C logistic within ±5%;
  - tackles from behind win less and give more fouls;
  - a late tackle (|dt| 0.3 s) gives more fouls than one on time (|dt| ≤ 0.08 s);
  - a won tackle leaves the ball moving away from the tackling foot (speed above 0, direction within 45° of the foot's direction), and the ball never moves more than 0.1 m in one step through contact (no teleport);
  - slide distance grows with approach speed;
  - recovery follows agility;
  - **standing reach:** for tackling 20, 50 and 90, a standing tackle can win the ball at `standReach - 0.05` m and never at `standReach + 0.10` m (the geometric cut-off), and the poke reaches 0.10 m further;
  - **a tackle on a shielder** follows logistic((T - S)/8) × timing × tackle angle within ±5%, not (T - C).
- **`qa/tr2b-shieldsim.mjs`** (Node, real `simStep`, 400 trials per cell):
  - shielding against a defender with D - S = +20 costs more breath per second than against D - S = -20, by the factor `stamina.js` defines. Not shielding adds no shield cost;
  - pressing from behind on a shielder for 3 s gives more fouls than from the side, and more after 3 s than after 1 s;
  - **shield challenges** (400 engagements per cell, equal breath, D - S of -20, 0 and +20, from behind and from the side):
    - the defender wins at `pShieldLoss` within ±5%;
    - from behind he wins less than from the side, by the 0.6 to 1.0 ratio (±0.08 where no clamp applies);
    - at D - S = -60 and +60 the rates sit at the 0.05 and 0.90 clamps (±0.02);
    - at D = S, a shielder at breath 0.2 loses more often than one at breath 1.0, by `fatigueFactor` (±5%);
    - there is exactly one roll per engagement (none inside `CHAL_GAP`);
    - a won challenge leaves the ball loose with no jump above 0.1 m in a step.
- **Harness:** n=1000 bands pass, or the lead approves each change.
- **Unit:** ball, touch, strike, sim and stamina all pass.

**Risks**
- Calibration drift in goals, possession and tackles per match.
- Determinism: detmath only, lint `pure-det-math`.
- Per-step cost of the arrival times: only nearby candidates, with predictions cached per step. Budget ≤ 0.15 ms per step for 13 agents and ≤ 0.08 ms average for 22.

### P2b-B: Shield input, AI use, and control, shield and tackle animation (about 14 h)

**Owns (existing files)**
- `js/life/football/control.js`, `js/life/football/brain.js`, `js/life/football/view.js`, `js/life/moves.js`, `js/life/football/fphud.js`
- `js/life/football/controller.js` and `js/life/football/training.js`, for the modifier guard only (work item 1b)
- `qa/wpF-controls.mjs`

**New files**
- `js/life/core/keylock.js`. It sits outside `js/life/football`, so the lint rule allows it to read Ctrl. It handles:
  - full-screen detection;
  - `navigator.keyboard.lock()` when in full screen, released on exit;
  - a window-capture listener tracking Ctrl down/up by `e.code` `ControlLeft`/`ControlRight`;
  - an exported `KEYLOCK = {fs, locked, ctrl}` and `ctrlShields()`, which is `KEYLOCK.fs && KEYLOCK.locked`;
  - a one-time tip suggesting full screen, stored in localStorage `freyaFootball.tipFS`, never in `S`.
- `qa/tr2b-shield.mjs`, `qa/tr2b-anim.mjs`, `qa/tr2b-ai.mjs`

**Reuse**
- brain.js `carrierOptions` (shield option at 624-633), `carrierMove` stance (771-783), `pressMove` (1014-1061) and `ballPlans`.
- moves.js `upShield` (1576, registered at 1623), the tackle clip (1376-1410) and the receive clip (1184-1250).
- view.js `liveSt` (251-262, 301-306, 331-347).

**Work**
1. **control.js:**
   - Holding C while in or about to be in control sets `intent.shield`.
   - The shoulder scan moves to the G0 key: V hold by default. Update its hints.
   - Ctrl shields only while `KEYLOCK.fs && KEYLOCK.locked`. For the shield, control.js reads `KEYLOCK.ctrl`. The only `ctrlKey` reads in football code stay the guard lines of item 1b.
   - LMB in defend and F, near a loose ball, become a tackle or slide at `'ball'`. If no action is possible, show a hint instead of silently swallowing the press.
1b. **The modifier guard (D9) must let Ctrl through while it shields.**
   - Today a press made while Ctrl, Alt or Meta is held is dropped, on purpose, so that browser shortcuts never become actions:
     - controller.js:129 (mode `train`) and controller.js:135-136 (mode `match`) set `MOD.on`;
     - control.js:138 returns before handling any press while `modded(ev)` holds;
     - training.js:348 routes modded presses the same way.
   - So while Ctrl is held to shield, every new press (A or D to turn, Shift, Space, R) is swallowed. A Node probe confirmed this (`fp/p1/gapfix/modguard.mjs`): with `MOD.on`, D, Shift, Space, R and C are all dropped, and the same presses without it register.
   - Fix: only while `KEYLOCK.fs && KEYLOCK.locked`, Ctrl no longer counts as a modifier. Alt and Meta still do, and outside that state the guard is unchanged.
   - The new conditions stay on single guard lines, `if (ev.altKey || ev.metaKey || (ev.ctrlKey && !ctrlShields())) return ...`. This keeps lint rule `football-no-modifier-keys` satisfied (its `allowLine` accepts an `if (...ctrlKey...) return` line). `ctrlShields()` comes from `core/keylock.js`.
   - Where: `modKey` (control.js:128) and the match branch of the capture listener (controller.js:136). The train branch (controller.js:129) and training.js:348 follow automatically, because both use `modKey` and `modded`.
2. **brain.js:**
   - The shield option is valued with S against D through `duel.pShieldLoss`. This fixes AI-1 and ball-4, which were NaN.
   - Choosing shield sets `intent.shield` (today it behaves like hold).
   - The carrier's stance puts his back to the presser.
   - The presser reacts to a shield. He chooses between a shield challenge (closing to contact toward the ball's side, resolved by sim.js, P2b-A item 7a) and a tackle, by comparing `pShieldLoss(S, D, …)` with `pTackleWin(T, S, …)`.
   - AI tackle triggers use the new standing reach and timing. brain.js:1026 (`1.05 + 0.003*a.at.tackling`) becomes `duel.standReach(a.at.tackling)`.
   - The AI challenges loose balls and 50/50s, and slides only with approach speed.
   - **The AI's pass and receive models follow R and q** (ball.md section 8 plug points):
     - `passModel` reach (brain.js:165, today `TOUCH.FOOT + TOUCH.FOOT_K*dribbling`) becomes `zone.R` for each defender at the predicted ball height and speed;
     - receiver control (brain.js:196-210, today `RECV_CTRL` with the `18 + 0.12*ctrl` speed limit) uses `zone.q` and `vc` for the receiver, with his pressure and breath.
     - ball.md:189 cites brain.js:226-234 for receiver control. In the snapshot that code is at brain.js:196-210 (verified by reading).
3. **view.js:**
   - The shield upper layer and stance.
   - The tackle side comes from the ball's side, and the foot is IK'd to `act.contact` at `act.tc` (MV-14 tackle part, ball-11).
   - The receive clip triggers at `zone.R`, with the part chosen by the real height.
   - The slide clip uses the act's carried speed.
4. **moves.js:** the tackle reach clamp follows the sim reach instead of 1.0/1.15, and the receive clip's height bands are aligned.
5. **fphud.js:** shield and scan hints, and the full-screen tip.

**Hook requests**
- To the integrator: importmap entry for `js/life/core/keylock.js`.
- To P10-A (later): firstday and lesson text that mentions the C shoulder check. Grep `trainspec.js` LESSONS and `firstday.js`; if found, the text change goes to the owner of that file in Phase 3 (P3-B owns trainspec.js).

**Acceptance**
- **`qa/tr2b-shield.mjs`** (browser, trusted keys):
  - holding C in control sets `intent.shield`, keeps speed ≤ 0.6 x jog and puts the ball on the far side of the defender; releasing it ends the shield;
  - C no longer scans, and V hold scans;
  - Ctrl outside full screen does nothing, and Ctrl+D outside full screen is still dropped (D9 unchanged);
  - with a stubbed `navigator.keyboard`, full screen plus lock makes Ctrl shield;
  - **moving while Ctrl shields** (stubbed lock, in a match and in a career drill in mode `train`): with Ctrl held, real presses of D and A turn and move the player, Shift sets the sprint key, and Space and R register in `CTRL.held` or `CTRL.queue`. Alt+D and Meta+D are still dropped;
  - the tip shows once.
- **`qa/tr2b-anim.mjs`** (browser, scripted tackles and receives):
  - the tackling foot is within 0.12 m of the contact point at contact;
  - the tackle side matches the ball's side;
  - the receive clip starts inside R and uses foot, thigh or chest according to the real height;
  - a contact sheet of the shield pose is produced.
- **`qa/tr2b-ai.mjs`** (Node, 3 matches):
  - shield is offered more than 0 times and chosen in at least 10% of pressed decisions;
  - AI loose-ball challenges occur;
  - over 200 sampled pass candidates, the defender reach `passModel` uses equals `zone.R` within 1e-9, and `recvCtrl` rises with the receiver's `zone.q`;
  - over 200 sampled AI tackle triggers, the reach used equals `duel.standReach(tackling)` within 1e-9;
  - pressers facing a shielder make both shield challenges and tackles, and over the 3 matches more than 0 challenges are resolved through sim.js's challenge path;
  - harness bands are unchanged.
- **Lint:** `football-no-modifier-keys` still passes with the new guard lines.
- **Regression:** `wpF-controls`, `wpF-strike`, `wpK-strike`, `wpI-drills` and `wpD3-drills`.

**Risks**
- Changing the scan key changes visible controls: update every hint and lesson text.
- `navigator.keyboard.lock` is Chromium-only and cannot be tested headless for real; the stubbed check plus a manual check stand in for it.
- The contract must not drift during the phase.

---

## Phase 3: Training base, cages, sandbox, hub and cones

Goal:
- A Training button on the title opens a career-free sandbox in a fenced cage (Full, Half or One-goal).
- The ball rebounds off the fence, or stops for a restart, depending on a law setting.
- There is a hub with seven categories, plus cones at fixed spots, and a generic scenario runner with pooled bodies.
- Exiting returns to a clean title.
- The career save is never touched.

Merge order: P3-A, then P3-B.

**Contracts (P3-A stubs them)**
- `sandbox.js`:
  - `enterTraining({kind})` returns a promise;
  - `exitTraining()`;
  - `inTraining()`;
  - `trainLook()`: the held career's look when a career is held, else the default look (spec 7, "the same created character everywhere");
  - events `train:enter` and `train:exit`. sandbox.js never imports a P3-B module: the runner stops itself on `train:exit`.
- `cage.js`:
  - `cageEnter(kind)` returns a promise. Under the fade, it disposes the previous cage's meshes, colliders and spots and builds the new kind. Re-entering zone `cage` through `enterZone` is acceptable if that is the simplest correct route. The pooled bodies and the player survive it, and `renderer.info` returns to that kind's first value (`tr4-pitch`). A pitch change is the one case where the spec's "no full environment reload unless truly needed" allows a rebuild;
  - `CAGE = {kind, spec, drawSpec, bounds, anchors: {category: [{x, z, face}]}, goalEnds}`;
  - event `train:cage` with `{kind}` after every build. cones.js re-places its cones from the new `CAGE.anchors` when it fires.
- `career.js` (classic script, globals):
  - `holdCareer()` and `releaseCareer()`;
  - `heldLook()` and `heldSkills()`: frozen copies taken at the hold, or null;
  - `heldFoot()`: the held career's preferred foot (`S.player.foot`, as bridge.js `footOf` reads it at bridge.js:92), or null. P5-A uses it as the default foot;
  - `stopPlayClock()`.
- `cagespec.js`, pure:
  - `cagePitch(kind)` returns a spec with `colliders.boards` (fence and roof planes) and `area`;
  - `cageDraw(kind)` returns the draw spec;
  - `areaPitchOf(base, area)`.

**Contracts (P3-B stubs them)**
- `runner.js`:
  - `registerScenario({id, category, name, desc, type, build, step, judge, ui})`;
  - `startScenario(id, config)`, `restart()`, `stopScenario()`;
  - `RUN = {cur, setup, ms}`.
- `pool.js`:
  - `takeBodies({me, mine, theirs, keeper})` returns pooled bodies by kit group, and `returnBodies()` gives them back;
  - `poolStats()` returns `{size, inUse, byKit}`;
  - `POOL_DRILL` = 14 (see work item 5).
- `index.js`: the Training entry module (section 0, "How Training modules are loaded"). It exports `enterTraining` and imports every Training module.

### P3-A: Sandbox world and cages (about 18 h)

**Owns (existing files)**
- `js/life/world.js`, `js/life/chunks.js`, `js/life/inv.js`, `js/life/props.js`
- `js/life/core/hand.js`, `js/life/core/hud.js`, `js/life/core/me.js`, `js/life/core/move.js`
- `js/life/core/modes.js` and `js/life/core/quality.js`, for one new read-only export each (work item 2). Nothing else in them changes in Phase 3.
- `js/career.js`, `js/online.js`
- `js/life/football/pitchspec.js`, `js/life/football/pitchmesh.js`, `js/life/football/ball.js`, `js/life/football/rules.js`
- `qa/lib.mjs`, `qa/unit/pitchspec.mjs`, `qa/unit/ball.mjs`, `qa/unit/laws.mjs`, `qa/unit/offside.mjs`

**New files**
- `js/life/train/sandbox.js`, `js/life/train/cage.js`
- `js/life/football/cagespec.js`: pure; the integrator adds it to the pure list.
- `qa/unit/cagespec.mjs`, `qa/tr3-sandbox.mjs`, `qa/tr3-cage.mjs`, `qa/tr3-leak.mjs`

**Reuse**
- world.js `boot`, `enterZone` and `registerZone`/`registerMode` (core/modes.js).
- stadium.js as the zone template: `makePitch`, `buildPitchMesh`, spots, `finishBatches` and `SKY.setContext('stadium')`.
- props.js `wireFence` (517-527), the pitchspec boards (verified to contain the ball), and `screenCover`/`isScreenCovered` (quality.js:57-63).
- look.js `bodyLook` with daily `lookDefault`.
- The probes `fp/p1/probe-sandbox.mjs`, `cageball.mjs`, `vperf/texleak.mjs` and `vperf/ballleak2.mjs`.

**Work**
1. **INF-1: world.js sandbox entry.**
   - Export `startSandbox({zone:'cage', kind, at})`. It calls `boot()` and `enterZone`, and skips `ensureHome`, `dailyEnsure`, `bootPlan`, `onboardStart` and `mailNews`.
   - Export `stopSandbox()`.
2. **perf-4, limited to Training's own full-screen sheets.**
   - **Why not the fade.** `isScreenCovered()` is true whenever `FADE.v >= .98` (quality.js:54, 59-61). `revealAfterFrames()` sets `FADE.v = 1` through `coverScreen()` (modes.js:101-105, 119-122) and resolves only after `framePresented()`, which world.js calls only after a real render (world.js:237). So skipping the render under the fade would deadlock every reveal:
     - the boot (world.js:298);
     - the intro (intro.js:354, 414);
     - `secondHalfGo` and the other match reveals (controller.js:283, 348, 976, 985, 1191);
     - the test entries (controller.js:1539, 1550).
     The inspection notes also rely on drawing under the cover (firstday.md:97-98, matchflow.md:30, traininginfra.md:196). Changing it would also change the boot and intro reveal, which is the apartment-flash area the user asked to leave until the very end.
   - **Work.** modes.js exports `revealPending()` (true while `WAIT` is not empty) and quality.js exports `overlayCovered()` (true while `COVERS.size > 0`, that is while some `screenCover(true, who)` is up). The world.js tick skips `RT.renderer.render` only while `overlayCovered() && !revealPending()`. The next frame after the overlay goes draws as usual.
   - **Nothing changes off Training.** Nothing in the snapshot calls `screenCover` today (grep: only its definition at quality.js:58). The only callers will be the Training sheets: hub, config and presets (P3-B, P4-A, P4-B). The fade path, and so the boot, the intro, the bus and tunnel fades and the match cards, behaves exactly as on the base.
   - The fade part of perf-4 (not drawing behind a black fade) is not done. It is offered to the user inside the gated P11-F, with the same exemption for a pending reveal.
3. **perf-1:** `clearScene` calls `dispose()` on every BatchedMesh not marked `userData.keep`, including the merged pages from chunks.js:621.
4. **chunks.js:**
   - `resetChunks` disposes `CH.meshes`;
   - `MG.still` and `MG.items` are pruned of objects no longer in the scene (perf-2, the retention part).
5. **Null-`S` guards:**
   - `inv.js` `dropsOf` and `core/hand.js` `spawnDrops` handle `S` null;
   - `core/hud.js` draws spot prompts without `S`, with the career meters hidden;
   - `core/me.js` builds the body from `trainLook()` when `S` is null (me.js:82 reads `s.player.look` today).
6. **INF-4: holding the career aside, with no career write.**
   - `holdCareer()`, in career.js:
     - flushes only a save that is already pending (`if (SAVE_T) saveNow()`). It never makes a fresh save. "Quit to title" has already saved (`A.quit`, js/ui/main.js:1295), so nothing is left to write;
     - snapshots `heldLook()` (a frozen copy of `S.player.look`), `heldSkills()` (`effSkills()`, career.js:254; G0 decision e) and `heldFoot()` (`S.player.foot`);
     - keeps the reference, sets `S = null`, and stops `PLAY_T` (career.js:74-79).
   - While a career is held, `save()` and `saveNow()` return false, so a panel closing in Training (`lpClose` calls `save()`, traininginfra.md) cannot schedule a write that fires after release.
   - `releaseCareer()` restores `S` and the auto sync state. It does not restart the play clock: the title is not play time. Continue starts it again (js/ui/main.js:974 `startPlayClock`).
   - `stopPlayClock()` is exported. P3-B's `A.quit` calls it, so the counter no longer runs on the title (INF-4, verified: +6072 ms in 6.5 s on the title, traininginfra.md:36-38).
   - In online.js, pause and resume auto sync (`stopAutoSync`/`startAutoSync`) around the hold.
6b. **The same created character** (spec 7). The sandbox body (core/me.js), the pooled "me" body and the Full Match training host all take `trainLook()`. With a career held, Training shows the created character at his own height. Without one, it uses the default look (G0 decision g covers a fresh page with saves but nothing loaded).
6c. **Movement profile in the cage** (core/move.js). The FOOTBALL profile applies only in zone `ground` on the pitch (move.js:110), so walking in the cage outside a scenario would use the LIFE profile. Make it apply inside the cage fence too, and give the cage the training kit (me.js:44 `meKind`, today `ground` only).
7. **sandbox.js:**
   - Registers mode `trainsb` with clock frozen, compass off, closing off, homeTick off, tunnel off, saves deferred, targeting limited to training spots, `leaveOnZone` false and `pauseOnUnlock`.
   - Implements `enterTraining`/`exitTraining`, adding and removing the body class `mode-trainsb`.
   - Never emits `lifeOnb`.
   - On exit: fires `train:exit` (the runner stops its own scenario), stops the zone and the loop, releases the career, and returns to the title.
8. **cagespec.js:**
   - Full (105 x 68), Half (one goal) and One-goal small area, all over `makePitch` in the real pitch frame, with the goals law per kind.
   - Fence planes as tall as the roof (the verifier showed a lower fence leaks), a roof plane, and run-off ending at the fence.
   - A generalised `areaPitchOf`, fixing SIM-1, which was hard-wired to the 72x48 ground.
   - The draw spec clips the full pitch's lines into the area and puts flags only at real corners (INF-7).
9. **pitchspec.js:** export the `plane()` helper. **pitchmesh.js:** build from a draw spec, with clipped lines and arcs and flags only at real corners.
10. **cage.js:** `registerZone('cage')`.
    - Sets its own `W.bounds`, its spawns (`bus` plus named), sky context `stadium`, and a low-poly fence made from `wireFence`, instanced or batched into 1 or 2 draws.
    - Static parts use `matrixAutoUpdate = false`.
    - Exports cone anchors per category at fixed positions, for each kind, and fires `train:cage` after each build.
    - Has no life NPCs, no coach and no merge polling.
11. **rules.js:**
    - Add `laws.out`, either `'rebound'` or `'stop'`. On rebound, ignore `out`, and ignore `goal` at an end with no goal, so play continues (INF-3).
    - Add `MODES += 'train'`.
    - OFF-1: use the real halfway line from `spec.area`. With fewer than two opponents, use the last defender, keeper included, and document the rule.
    - **OFF-3:** a player walking off (`leaving`; also sent off or injured on his way out) no longer holds the offside line. Today `offsidePosition` filters only `onPitch` and the role (rules.js:126), while `walkOff` keeps `onPitch` true until the exit (rules.js:934, 1054-1056). This matters for Full Match substitutions and injuries (spec 2, offside). tactics.js's `lineOpp` has the same gap (tactics.js:115); P6-B fixes it in Phase 6.
12. **ball.js:** `predWorld` keeps the fences and roof when `laws.out` is rebound (INF-3: the prediction leaked through the fence).
13. **qa/lib.mjs:**
    - `trainingStart(page, {kind})`: a clean page, then a real click on the title Training button (after P3-B merges; before that, a fallback that runs `import('/js/life/train/sandbox.js').then(m => m.enterTraining({kind}))` in the page);
    - `careerSnapshot(page)` and `careerDiff(a, b)` over the `freyaFootball.v2` keys only (`v2`, `v2.slot<n>`, `v2.meta<n>`, `v2.one`);
    - `trainKeys(page)` over `freyaFootball.trainPresets` and `freyaFootball.tipFS`;
    - `storageSpy(page)`: an init script that wraps `Storage.prototype.setItem`, `removeItem` and `clear` and logs the key, the time and whether Training was active (between `train:enter` and `train:exit`);
    - DoD 7 uses these.

**Hook requests**
- To the integrator: importmap entries for `js/life/train/sandbox.js`, `js/life/train/cage.js` and `js/life/football/cagespec.js`; the pure list gets `cagespec.js`.
- Two new lint rules:
  - `train-no-career-writes`: in `js/life/train/**`, no `saveNow`, `persist`, `trustAdd`, `S.` assignment or `lifeOnb`;
  - `train-no-engine-copies`: in `js/life/train/**`, no definitions of `ballStep`, `simStep`, `createMatch` or `firstTouch`.

**Acceptance**
- **`qa/tr3-sandbox.mjs`.** From a fresh page with no save, enter Training (fallback entry):
  - `S` stays null;
  - 600 frames run with no console or page errors;
  - W walks;
  - an E prompt is drawn at a test spot;
  - the write spy logs no `freyaFootball.v2` write, and the career diff is empty;
  - in the cage outside a scenario, the movement profile is FOOTBALL (`LOCO.prof === "football"`).

  With a career created and then "Quit to title" (the career snapshot is taken after Quit finishes), enter Training, close a panel, wait 2 s and exit:
  - the write spy logs no `freyaFootball.v2` write between `train:enter` and `train:exit`, including the hold and the release;
  - the career diff is empty;
  - the career object is restored;
  - `S.playMs` does not grow during Training, and does not grow on the title after Quit;
  - `S.events.away` is not written;
  - auto sync is paused and resumed;
  - the Training body's look key (human.js look key) and scale equal those of the career's body in life.

  Q in the sandbox opens nothing and locks nothing.
- **`qa/tr3-cage.mjs`** (Node and browser), for each kind:
  - rolling, lofted and driven corner shots stay inside;
  - rebound mode emits no `out`, and stop mode emits `out` and a restart;
  - the prediction never leaves the cage;
  - the One-goal cage has exactly one goal, with clipped markings;
  - the cage costs ≤ 12 draw calls on Low.
- **`qa/unit/cagespec.mjs`:** sizes, a fence height at least the roof height, inward-facing normals and goal ends.
- **`qa/tr3-leak.mjs`:**
  - 10 home/ground round trips and 10 cage enter/exits bring `renderer.info` textures and geometries back to baseline (+0);
  - `MG` entries outside the scene: 0;
  - **perf-4:**
    - with `screenCover(true, 'test')` up and no reveal pending, `renderer.info.render.frame` does not advance over 120 frames. It advances again on the first frame after `screenCover(false, 'test')`;
    - a `revealAfterFrames(2)` started while that overlay is up still resolves within 3 frames;
    - with no overlay, a `revealAfterFrames(2)` under a full fade (`FADE.v` 1) resolves after exactly 2 drawn frames, as on the base.
- **The boot and the intro are unchanged** (the user's gate on the apartment flash). `qa/wpH-boot.mjs` passes. The screencast `fp/p1/fd-boot.mjs` shows the same sequence as on the base (title, black, the film, no frame of the flat), and `git diff` shows no change to intro.js or to the `startLife` reveal lines (world.js:290-300).
- **Unit laws and offside:** the new law and the edge cases. **OFF-3:** a defender who is `leaving` (walking off, `onPitch` still true) past the line no longer keeps an attacker onside, and once he is off nothing changes.
- **Regression:** `smoke` (all zones), `wpA-*`, `wpH-boot`, `wpH-day`, `wpI-layout`, `oldsave`.

**Risks**
- world.js and career.js are hot files.
- The career must be restored on every exit path, including errors. "Quit to title" has already saved, and the hold flushes any pending save, so a page unload during Training loses nothing.
- Disposing BatchedMesh must skip `keep` meshes.
- The cost of drawing the fence.

### P3-B: Title button, hub, cones, scenario runner and body pool (about 20 h)

**Owns (existing files)**
- `js/ui/main.js`, `css/style.css`
- `js/life/football/training.js`, `js/life/football/trainspec.js`, `js/life/football/view.js`
- `js/life/core/acts.js`
- `qa/wpI-drills.mjs`, `qa/wpI-session.mjs`, `qa/wpI-lessons.mjs`

**New files**
- `css/train.css`
- `js/life/train/index.js` (the Training entry; integrator-owned from Phase 4), `js/life/train/hub.js`, `js/life/train/cones.js`, `js/life/train/runner.js`, `js/life/train/pool.js`, `js/life/train/thud.js`
- `qa/tr3-hub.mjs`, `qa/tr3-cones.mjs`, `qa/tr3-runner.mjs`, `qa/unit/trainentry.mjs`

**Reuse**
- The training.js pipeline: `buildItem`, `sliceItem`, `fixedItem`, `frameItem` and its events; `takeBall`, `coachFeed`/`feedStep` (a real strike), `ballDead`, `inputOn`/`inputOff`, and `conesFor` for the cone mesh.
- trainspec verdict tests, and `slotSpot`.
- view.js `viewInit`/`viewDispose`.
- From js/ui/main.js: `openSheet`, `confirmBox` and the `screenTitle` and `titleIntro` handling.
- build.js `spot()`, core/hand.js targeting, and fphud `settingsHTML` rows.
- human.js `prebuildHumans` (2165).
- SCHED `fixed` (sched.js:83-86).

**Work**
1. **main.js:**
   - A Training button on the title, matching the `.ts-press` style family. Mark it `data-keep`, so that `titleIntro` does not start a career from its click.
   - **The key path.** `data-keep` only exempts `pointerdown` (js/ui/main.js:372). The `titleIntro` start handler is a window capture `keydown` listener that ignores keys only while `#sheetRoot.open` or `#tutRoot.on` (main.js:370). So today Enter or Space on a focused title button runs `A.continue`/`A.newGame` (main.js:375) before the button's own click. That already affects the full-screen and Settings buttons (found by reading; not probed). Two changes:
     - the handler ignores a `keydown` whose target is inside `[data-keep], button, a, input, .cloud-corner`, as it already does for `pointerdown`;
     - `titleIntro` keeps its `off` function at module level as `TITLE_OFF`. The Training button calls it before entering Training, because the sandbox does not change `LAST_SCREEN`: the title root stays in the document under the 3D view. Without this, the first W or E in the cage, with no sheet open, would start the career. Exit to title re-renders the title (`screenTitle`), which installs the listener again.
   - It loads Training with `import('../life/train/index.js')` and calls `enterTraining`.
   - Add a new `openSheet` kind `trainhub`; `train` is already taken by the old 2D sheet.
   - `screenTitle` runs `exitMode` and removes the `mode-*`, `drillview` and `fp-match` classes (INF-8).
   - `A.quit` (js/ui/main.js:1295) also calls `stopPlayClock()` from P3-A (INF-4).
2. **hub.js:**
   - The seven categories, in spec order: Set Pieces, Attacking, Defending, Ball Receiving and First Touch, Match Scenarios, Full Match, Free Play.
   - Each category shows its registered scenarios with a name, a short description, Configure, Start, Reset and Back to hub. It reads them from the runner's registry (`registerScenario`), so a later scenario module needs only its index.js line, never a hub.js edit.
   - A category with nothing registered yet shows its description only, with no dead buttons.
   - Keep it simple, not a dashboard.
   - **Nothing runs behind it** (spec 8; perf.md:182-183): while the hub sheet is open it calls `screenCover(true, 'trainhub')` (quality.js:58), so the world tick skips the render (P3-A perf-4). No scenario runs, because one runs only after Start. It calls `screenCover(false, 'trainhub')` when it closes. configui (P4-A) and presetui (P4-B) do the same.
3. **cones.js:**
   - Cones at the fixed `CAGE.anchors`. Each `spot({near:true, r:1.6, label, hint, run})` opens its category.
   - One scenario at a time: while one runs, the other cones answer "End or reset this one first."
   - On `train:cage`, it removes its spots and meshes and re-places them at the new `CAGE.anchors` (spec 0: the pitch kind can change between scenarios).
4. **runner.js** (INF-5):
   - A generic lifecycle: configure, prepare, spawn or reuse, position, place the ball, activate, play, reset or complete, clean up.
   - Uses `createMatch` with `mode 'train'` and laws from the config, including `out`.
   - One `SCHED.fixed` task for the simulation (perf-8). Train-mode input, camera and HUD wiring are taken from training.js.
   - No zone reload between scenarios.
   - Stops its scenario on `train:exit` (sandbox.js does not import runner.js).
5. **pool.js: one pool size, and counts that agree.**
   - **The agents.** A drill has at most 13 agents (G0 decision h): me, up to 11 outfield NPCs (at most 5 on my side and 6 on the other), and one optional keeper. P4-A's validation enforces this.
   - **No recolouring.** human.js has no recolour API. Kit colours are baked into a per-body vertex colour attribute when the body is built (human.js:1146-1151, with `colours(sp, pal)` private), and the shirt number is a separate mesh (human.js:1162). So bodies are built per kit and keep it:
     - kit A (my side's training bib) for me and up to 5 team-mates;
     - kit B (the other side's bib) for up to 6 opponents;
     - one keeper kit.
     Nothing needs a human.js change, and no hook request is needed.
   - **The pool (`POOL_DRILL` = 14).** 1 body for me (from `trainLook()`), 5 in kit A, 6 in kit B, 1 keeper, and 1 first-person rig for me (the view's `V.fp`, view.js:99-104). All are prebuilt from a fixed seeded look list under the entry fade, so `human()` is never called during play. Bodies are taken and returned on reset (perf-7).
6. **view.js:**
   - `viewInit` accepts pooled bodies (`o.bodyOf(a)`, and `o.fpBody` for the first-person rig), and `viewDispose` returns them instead of destroying them.
   - **No official bodies in drills.** Today `viewInit`, `viewFrame` and `looksOf` build a body for every agent whose role is not `off` (view.js:56, 74, 113-114). sim.js always creates the referee and both assistants (sim.js:134-139), and training only sets them `onPitch = false` (training.js:227), so every drill builds 3 bodies nobody sees (ai.md:142-143). With `o.officials === false`, the three functions skip agents with `team === -1`. The runner passes it for every drill; P8-A's Full Match does not.
   - **The counts.** `bodies()` counts every human ever built and not disposed (human.js:1186-1189), including the sandbox's own walking body: `me-fp` and `me-tp`, rebuilt on every `enterZone` (core/me.js:83-84, world.js:105). So in Training:
     - `bodies().length` = `poolStats().size` + 2;
     - in drills that is 16, whatever the scenario;
     - tests compare against these numbers, not against 14.
7. **thud.js:**
   - Shows the scenario, role, counts, keeper on/off, preset name, the restart/replay/config hints, the admin hint, the Q hint (Free Play only) and short notices. A hint shows only once its feature exists: the admin hint from Phase 5, the Q hint with Free Play. No hint points at nothing.
   - Sits at the screen edges, and moves any element that would overlap the projected ball.
   - Small: at 1280x720, thud plus the match HUD cover at most 10% of the viewport, not counting the Tab overview, the pause card and sheets.
8. **training.js:**
   - The host is passed per run instead of the module-global `HOST`; career drills keep working as one client.
   - Export the reusable pieces for the runner.
   - Coach feeds "to me" become chain passes with `recv = me` (the AI-2 follow-up). Today the feed is `ballKick` with agent -1 and no chain pass (training.js:324), so P2-A's rule cannot see that the ball is the player's, and the nearest AI mate chases it (ai.md:52-56).
   - The `train-coach` SCHED task runs only while a run exists (perf-9, coach part).
9. **acts.js:** passes `TRAIN_HOST` per run.
10. **trainspec.js:** no behaviour change; it only exports what the runner needs. It also takes the scan-key text hook from P2b-B, if any.
11. **index.js:** the Training entry. It imports sandbox.js and cage.js (P3-A) and hub.js, cones.js, runner.js, pool.js and thud.js, and re-exports `enterTraining`. P3-B merges after P3-A, so these static imports never point at a missing module. **`qa/unit/trainentry.mjs`** checks that every `js/life/train/*.js` file is imported by index.js.

**Hook requests**
- To the integrator: importmap entries for `index.js`, `hub.js`, `cones.js`, `runner.js`, `pool.js` and `thud.js`, and a `<link>` for `css/train.css`.
- To P3-A: none beyond the contract.

**Acceptance**
- **`qa/tr3-hub.mjs`:**
  - the title shows Training beside the press prompt, with the same font family and computed size scale;
  - a real click enters the hub with no career; the write spy logs no `freyaFootball.v2` write;
  - **the key path:** focus the Training button with real Tab presses, then press Enter, and in a second run Space. Each opens the hub. `A.continue` and `A.newGame` are never called (spy), `S` stays null, and the write spy logs nothing. The same holds for the full-screen and Settings buttons: Enter does their own action and starts no career;
  - **no career from the cage:** after the hub closes, real W, E, Space and Enter presses in the cage never call `A.continue` or `A.newGame`, and `S` stays null. After Exit to title, a real key press on the title starts the career as before (the `lib.titleStart` path);
  - each category opens, and Back works;
  - while the hub is open for 120 frames, `renderer.info.render.frame` does not advance and no SCHED actor animates;
  - Exit to title leaves no `mode-*` or `fp-*` classes, the loop stopped, and an empty career diff. The Training keys may hold `tipFS` and nothing else;
  - "Quit to title" from a career stops the play clock: `S.playMs` stays the same over 10 s on the title;
  - 10 enter/exit cycles add 0 listeners, 0 timers and 0 DOM nodes.
- **`qa/tr3-cones.mjs`:**
  - a key-driven bot walks to each cone; the prompt appears inside the radius and not beyond it;
  - E opens that category;
  - cone positions are identical across reloads;
  - a second cone refuses while a scenario runs;
  - after `cageEnter` to each other kind, every cone sits at that kind's `CAGE.anchors` (±1 cm), and the spot count is unchanged (no duplicate spots).
- **`qa/tr3-runner.mjs`** (a test scenario, 2v2 plus keeper in the Half cage, then the largest drill: 6v6 including me, plus a keeper), over 30 start/reset cycles:
  - `bodies().length` equals `poolStats().size + 2`, which is 16, before, during and after every scenario;
  - `human()` is never called after the entry fade (spy);
  - no body is built for the referee or the assistants (no `match-22`, `match-23` or `match-24` group in the scene);
  - in the 6v6, every agent's drawn body comes from the pool, and `poolStats().inUse` is 14;
  - SCHED counts stay constant;
  - `renderer.info` is +0 after the first cycle;
  - the setup state is restored exactly: positions ±1 mm, facing, ball position and velocity;
  - a single fixed task drives the simulation.

  Training UI, camera and HUD (spec 2 and 4), over 600 frames of the same scenario with the ball played through every screen region:
  - thud shows the scenario name, my role, the counts, keeper on/off, the preset slot ("No preset" until Phase 4; the name is checked in tr4-presets), and the restart, replay and config hints. The admin and Q hints are checked in tr5-keys and tr5-freeplay, once those features exist;
  - **never covers the ball:** whenever the ball's projected centre is on screen, `document.elementFromPoint` there is the canvas;
  - thud plus the match HUD cover at most 10% of a 1280x720 viewport;
  - **ball readable:** the ball's projected diameter is at least 3 px at 40 m;
  - **camera:** the camera owner is always `match-fp` (or `match-cine` for a replay), never a top-down view. The eye height is 1.68 × the body's scale (±1 cm). The camera never moves more than 0.15 m in one frame outside a cut.
- **Coach feed to me (AI-2 follow-up; new checks in `qa/wpI-session.mjs`, which P3-B owns).** The coach exists only at the training ground (the cage has none), so this runs in a career team drill. With the coach feeding the player and an AI team-mate 2.5 m and 5 m off the feed's lane (the vsteal geometries), over 8 seeds each:
  - the feed is a chain pass whose `recv` is the player's agent;
  - the mate gets no chase plan for it unless he is clearly first by P2-A's margin;
  - the player receives it in at least 7 of 8.
  Today the mate takes it (ai.md:52-56).
- **Career regression:** `wpI-drills`, `wpI-session`, `wpI-lessons`, `wpH2-centre` (full run), `wpH2-lessonbot`, `wpD3-drills` and `wpH-day`.
- **`qa/unit/trainentry.mjs`** passes, and the title's `smoke`, `oldsave`, `wpH-boot` and `wpH-day` runs (which click `.ts-press`) still start the career.

**Risks**
- The training.js refactor can break career drills and the first-day lessons. G9 uses `window.lifeFirstTraining` and `__train.RUN.cur`.
- The title-screen key handling.
- The view.js pooling API.

---

## Phase 4: Configuration, attribute editors, presets, reset and replay

Merge order: P4-A, then P4-B.

**Contracts (P4-A stubs them)**
- `config.js`:
  - `registerType(type, schema)`, `defaults(type)`, `validate(type, obj)`, `relevant(type, obj)` and `VERSION`;
  - the shared schema;
  - scenario modules register their own options, so later phases never edit config.js for that.
- `teams.js`: `cfgFromConfig(type, config, seed)`, which returns a `createMatch` cfg plus `ballInit = {p, v, w}`: the configured ball placement, and the launch resolved from the configured trajectory (zero velocity when there is none).

**Contracts (P4-B stubs them)**
- `presets.js`: `list(type)`, `save(type, name, config)`, `overwrite(id, config)`, `saveAs(...)`, `remove(id)` and `load(id)`.
- `quick.js`: `addItem({id, label, run, group})` and `quickOpen()`/`quickClose()`. Phase 8 adds the Full Match items through `addItem`.

### P4-A: Configuration and attributes (about 16 h)

**Owns (existing files)**
- `js/life/football/attrs.js`
- `js/life/train/hub.js`
- `css/train.css`

**New files**
- `js/life/train/config.js`, `js/life/train/configui.js`, `js/life/train/attredit.js`, `js/life/train/teams.js`
- `qa/unit/trainconfig.mjs`, `qa/unit/attrs.mjs`, `qa/tr4-config.mjs`, `qa/tr4-attrs.mjs`, `qa/tr4-attredit.mjs`

**Reuse**
- attrs.js `attrsForPlayer`, `attrsForAI`, `derive`, `SKILL_KEYS`, and the career skill list from js/data/game.js:5-21 (names and the 1 to 99 range).
- The keeper set `{reflex, dive, handling, posit, distrib}`.
- control.js `loadSet` as the validation pattern, and fphud `settingsHTML` rows.

**Work**
1. **config.js shared schema:**
   - my role; initial possession;
   - taker, receiver, attacker, defender and support roles;
   - attackers 0 to 6 and defenders 0 to 6, counted as outfield players with me included on my side (G0 decision h): my side's count is at least 1. Team-mates on/off; opponents on/off;
   - AI keeper on/off;
   - starting positions: formation slot plus offset per participant;
   - my attributes, attacker average, defender average, and separate keeper attributes;
   - ball placement and trajectory: `ball.at {x, y, z}` and `ball.launch {kind: 'pass' | 'driven' | 'cross' | 'loft', target {x, y, z}, speed, curl}` or none;
   - out of play (rebound or stop) and pitch (full, half or one-goal);
   - scenario options.

   Also:
   - Relevance rules: show only relevant settings.
   - The keeper is never a selectable role.
   - A hard limit of 6v6 plus a keeper: at most 13 agents, me included (G0 decision h). Free-kick wall players count toward the defending side's 6 (G0 decision d): validation clamps `wall + defenders` to 6 and says so.
   - Validation applies defaults, clamps values, checks allowed values and drops unknown keys.
   - A type may fix the pitch (Full Match is always `full`). Otherwise the pitch row is relevant, and the runner switches the cage (P4-B).
2. **configui.js:** the configuration sheet, built from rows, showing only relevant fields, with a live count preview. While it is open it calls `screenCover(true, 'trainconfig')`, as the hub does.
3. **attredit.js:**
   - The 15 real skills with their real names and 1 to 99 ranges, plus the keeper set. `distrib` is listed only while `GK_DISTRIB_LIVE` is true. It is false until P9-B wires `gk.distrib` into distribution (ATTR-1: today it changes nothing, so showing it would be a decorative setting). P9-B's hook request to the integrator flips it.
   - Derived values (pace, ctrl, agility, strength, balance, defAware) are shown read-only.
   - Shows current value and min/max, and supports individual edit, reset, and the Low, Average, High and Max presets (35, 55, 75, 99; the lead confirms).
   - NPC averages.
4. **attrs.js** (ATTR-1):
   - `attrsForTraining(skills)` takes raw values with no `effSkill`, which returns 0 without a career. The default vector is `heldSkills()` when a career is held, else the editor's Average preset (G0 decision e).
   - `attrsForAI` gets its pid from the preset seed. The variation is the role profile plus ±6 of seeded noise (G0 decision f). At average 50 that spans about 37 to 62, not ±6 (ai.md:130-132). The config sheet says so in plain words.
   - The floor goes down to the editor's range.
5. **teams.js:**
   - Turns a config into a `createMatch` cfg: teams, slots, positions, scale, attributes, keeper, the player's role and the laws.
   - Resolves the ball: `ballInit.p` from `ball.at`. When `ball.launch` is set, `ballInit.v` and `w` come from strike.js `solveStrike` (pure, strike.js:117; the solver the coach feed uses, training.js:321), from the placement toward the target at the configured speed and kind. It is pure, with no ball moved here. The runner applies it at activation (P4-B), and Phase 6's feeder strikes the same launch from a passer's foot.
   - Starting positions are validated as onside when offside is on. An offside start is moved onside to the line, and the sheet says which player moved.
6. **hub.js:** Configure opens configui; Start calls `startScenario(id, config)`.

**Hook requests**
- To P4-B: none.
- To the integrator: importmap entries for the four new modules, and the four lines `import './config.js';`, `import './configui.js';`, `import './attredit.js';` and `import './teams.js';` in `js/life/train/index.js`.

**Acceptance**
- **`qa/unit/trainconfig.mjs`:**
  - every field validates and clamps;
  - garbage, partial and old input give safe defaults;
  - the keeper is never a role;
  - the relevance table is correct for each type;
  - **no decorative setting** (spec 1 and 4, "every setting changes the real configuration"). For every registered type and every field, changing the field from its default to another allowed value changes the `cfgFromConfig` output or the scenario's `build()` output (a deep diff is not empty). This runs again over every type registered in later phases (P11-A);
  - **onside starts** (spec 2): over 200 seeded configs with offside on, no attacker starts beyond the second-last defender (keeper included) or the halfway line of `spec.area`. A config that places one offside comes back with him on the line and a note;
  - wall plus defenders above 6 is clamped to 6;
  - more than 13 agents (me included, G0 decision h) is never produced, and my side's count is never below 1;
  - **the ball launch:** for 20 seeded launches (each kind, 8 to 25 m), `ballInit` has its launch speed within ±2% of the configured speed. Its apex, by `ballPredict` from `ballInit`, is within ±5 cm of the apex for the configured kind and target, and with no launch `v` is zero.
- **`qa/unit/attrs.mjs`:**
  - derived values recompute;
  - preset values are correct;
  - the same seed gives the same values and a different seed gives different ones;
  - the mean equals the average ±1;
  - per player and skill, |value - (average + `PROFILE[arch][k]`)| ≤ 6 before the clamps, and the measured range at average 50 is recorded in the log;
  - with a held career, the default "my attributes" equal `heldSkills()`.
- **`qa/tr4-attrs.mjs`** (Node sim). This proves each setting changes real behaviour:

  | Setting | Expected change |
  |---|---|
  | Pass accuracy 20 vs 95 | lateral pass error differs by at least 2x |
  | Sprint Speed 40 vs 99 | top speed about 7.2 vs 9.4 m/s, ±0.2 |
  | Defender average 30 vs 90 | tackle success differs |
  | Keeper reflex and dive 30 vs 90 | save rate differs |
  | Keeper handling 30 vs 90 | the share of catchable shots that are spilled or parried differs |
  | Keeper positioning 30 vs 90 | the mean distance from the ideal set position (gkplan) at the moment of the shot differs |

  Every keeper attribute the editor shows must have a row here. `distrib` gets its row when P9-B wires it (tr9-ai). Until then it is not shown (work item 3). This closes the gap that the "no decorative setting" unit check compares cfg output only, so it cannot catch an attribute the engine ignores.
- **`qa/tr4-config.mjs`** (browser, real clicks). Each type shows only its relevant rows, and each setting below changes what is really spawned:

  | Setting | Checked at activation |
  |---|---|
  | Attackers and defenders counts | the spawned outfield bodies and agents per side, me included on my side (G0 decision h) |
  | My role | my agent's slot and role in `ms`, and the camera on that agent |
  | Initial possession | `ms.poss` team and controller |
  | Team-mates off / opponents off | 0 agents on that side apart from me (and the keeper when on) |
  | AI keeper on / off | `ms.gks[t]` present / absent, the keeper body present / absent |
  | Starting positions | each agent at slot + offset ±1 mm |
  | Ball placement | the ball at the configured point ±1 mm |
  | Out of play: rebound / stop | a ball driven at the fence rebounds with no `out` event / stops with `out` and a restart |

  While the sheet is open, `renderer.info.render.frame` does not advance.

  The ball trajectory is checked at activation by P4-B (`tr4-reset`), because the runner applies it, and at the feeder by P6-A.
- **`qa/tr4-attredit.mjs`** (browser, real clicks and typing; spec 4's attribute editor):
  - for my attributes and the keeper set, every shown attribute has its real name, its current value, and min 1 and max 99;
  - typing a value and pressing Enter changes the config, and at the next activation `ms.agents[me].at[k]` (or `at.gk[k]`) equals it;
  - out-of-range or bad input (0, 120, "abc") shows the clamped value or keeps the old one, never NaN;
  - reset on one attribute restores its default and leaves the others alone;
  - the Low, Average, High and Max buttons set every value to 35, 55, 75 and 99;
  - the derived values (pace, ctrl, agility, strength, balance, defAware) update read-only after an edit and cannot be edited;
  - the attacker and defender averages: after activation, each side's mean skill equals the set average ±1 plus the profiles;
  - typing in a field never reaches the game: `CTRL.contact` is unchanged and no admin or pause card opens.

### P4-B: Presets, quick menu and pause card, reset and replay, pitch switching (about 19 h)

**Owns (existing files):** `js/life/train/runner.js`, `js/life/train/thud.js`, `js/life/train/pool.js`, `js/life/football/training.js`.

**New files**
- `js/life/train/presets.js`, `js/life/train/presetui.js`, `js/life/train/quick.js`
- `qa/unit/presets.mjs`, `qa/tr4-presets.mjs`, `qa/tr4-reset.mjs`, `qa/tr4-pitch.mjs`

**Reuse:** `confirmBox`, the `loadSet` pattern, and `config.validate` (read-only import).

**Work**
1. **presets.js:**
   - localStorage key `freyaFootball.trainPresets`, holding `{v, byType: {type: [{id, name, created, updated, config}]}}`.
   - Stores configuration only, never runtime state.
   - Versioned migration, validation through `config.validate`, and a size cap.
   - Never in `S`, and not cloud-synced (INF-9).
2. **presetui.js:**
   - Save (named).
   - Load: a list showing name, type, counts, keeper, pitch and updated time.
   - Edit and overwrite, with confirmation.
   - Save as new.
   - Delete, with confirmation.
3. **quick.js and the pause card** (no pause card exists today):
   - Today, in train mode, Esc calls `quit()` on keydown (training.js:345), and losing the pointer also calls `quit()` (training.js:354). Only the lessons pause, through the `#lifeDrill.paused` class (world.js:431). The runner reuses that input wiring.
   - **training.js:** when the run's host has a `pause` callback (the Training host passes `pause: quickOpen`), Esc and pointer loss call it instead of quitting. training.js never imports quick.js (section 0: career code never imports a Training module). Career drills and lessons have no `pause` and keep today's behaviour, checked by the wpI regressions.
   - **The pause card:**
     - it is drawn above `#lifeFade` with the pointer released (the P2-A card pattern);
     - the simulation is paused while it is up (the runner's fixed task does not step);
     - Resume relocks the pointer on its click (the user gesture);
     - it lists Restart Current Scenario, Replay Last Scenario, Return to Configuration and Return to Hub;
     - it has slots for Phase 8's Reset Current Half and Reset Match, labelled distinctly.
   - **Shortcut:** Backspace restarts the current scenario (G0 lead confirmation). It is ignored while a text field has focus.
4. **runner.js:**
   - **The configured ball at activation.** The runner places the ball at `ballInit.p` (P4-A teams.js). When the config has a launch, it plays it at activation through ball.js `ballKick(b, v, w, {agent: -1, kind})`, "the one way a player changes the ball's velocity" (training.js:22). So the trajectory is real ball physics, not a placed path. This is the setup's initial ball state, as "ball position, velocity and spin" below. Phase 6's feeder replaces the agent -1 kick with a passer's real strike on the same launch.
   - A setup snapshot at activation: the config plus the resolved spawn (positions, facing, ball position, velocity and spin, possession, seeds).
   - **Restart** restores the current setup.
   - **Replay Last** restores the last setup, not the end state of the last attempt, even after config edits.
   - A reset restores:
     - animations (inertia cleared);
     - AI state (plans, acts, brain timers);
     - stamina, per config;
     - flags and temporary effects;
     - objects (extra balls);
     - listeners (the `sim.on` handles).

     It does this without rebuilding bodies (perf-7).
   - **`RUN.digest()`** returns a stable hash of the full reset state, so that a test can check all of it rather than a sample:
     - per agent: position, velocity, facing, `act`, `state` and `stateT`, `plan`, `intent` (including `shield`), `cooldown`, `recoverT`, `shield`, `chal`, stagger and ground state, stamina pool, and the gait clock and phase;
     - per drawn body: the clip, the upper layers, and the inertialisation and IK blend buffers;
     - the ball: position, velocity, spin, state and controller, and the extra balls;
     - the match: `poss`, `chain`, `call`, the restart state, the judge queue, `ms.t`, the rng state and the `sim.on` handle count;
     - the runner's own flags and timers (notices, objectives, the replay buffer).
     Fields that are meant to differ (the real clock, the attempt counter) are listed in the module header and left out.
5. **thud.js:** shows the preset name and the quick-menu hints ("Esc pause menu", "Backspace restart").
6. **Pitch switching** (spec 0, "the user picks Full / Half / One-goal"):
   - `startScenario(id, config)` compares `config.pitch` with `CAGE.kind`. When they differ, it awaits `cageEnter(config.pitch)` under the fade before spawning. cones.js follows through `train:cage` (P3-B).
   - Bodies stay in the pool and are not rebuilt.
   - A type with a fixed pitch (Full Match) always switches to its own kind.
   - Return to Hub does not switch back. The cage stays as the last scenario left it.
7. **presetui.js** calls `screenCover(true, 'trainpreset')` while open.

**Hook requests**
- To P4-A: CSS lines for presetui and quick in `css/train.css`.
- To the integrator: importmap entries, and `import './presets.js';`, `import './presetui.js';` and `import './quick.js';` in `js/life/train/index.js`.

**Acceptance**
- **`qa/unit/presets.mjs`:**
  - round trip;
  - corrupted JSON;
  - an old version;
  - missing fields;
  - unknown keys dropped;
  - separation by type;
  - delete and overwrite;
  - **save as new** (`saveAs`) makes a second record with a new id, the new name and fresh `created`/`updated`, and leaves the source record byte-identical;
  - `list(type)` returns, for each record, the fields the Load list shows: name, type, counts (`3v2`), keeper on/off, pitch and updated time.
- **`qa/tr4-presets.mjs`** (browser, real clicks and typing):
  - save a named preset, reload the page, load it: the config is identical, and thud shows the preset's name;
  - overwrite asks first, and No keeps the old preset;
  - **Save as new** by real click and typing makes a second preset with the new name. The original's config and `updated` time are unchanged, and loading each gives its own config;
  - **the Load list:** for 3 presets of different counts, keeper and pitch, each row shows the name, the type, the counts ("3 v 2"), keeper on or off, the pitch (Full, Half or One goal) and the updated time. The text matches the stored record, and the list is newest first;
  - delete asks first;
  - `trainKeys` shows `freyaFootball.trainPresets` holding exactly the saved presets; the career diff is empty and the write spy logs no `freyaFootball.v2` write;
  - typing "1" in the name field changes neither the contact nor anything else.
- **`qa/tr4-reset.mjs`** (3v3 plus keeper, 50 restarts, real keys and clicks under pointer lock):
  - every restart equals the setup snapshot: positions ±1 mm, facing, ball state, possession, AI plans null, stamina per config;
  - **the full reset state:** restarts are made from varied mid-play states: mid-tackle, mid-slide on the ground, mid-strike, while shielding, during a stagger and recovery, during a restart procedure, with an extra ball spawned, and with a notice showing. After each, `RUN.digest()` equals the digest taken at activation. This covers animations (clip, upper layers and inertia buffers cleared), AI states, flags, temporary effects, objects and listeners (spec 4);
  - **the configured ball trajectory:** for a pass, a driven ball, a cross and a loft, the first ball's launch speed is within ±2% and its apex within ±5 cm of the configured values. The ball leaves the placement with no jump (≤ 0.1 m in the kick step). Restart and Replay Last give the same first 60 ball steps, bit-identical;
  - Replay Last after a config change restores the previous setup;
  - **Esc:** a real Esc opens the pause card. It passes `assertVisible`, `pointerLockElement` is null, and `ms.t` does not advance over 60 frames. Resume relocks and play continues. `document.exitPointerLock()` opens the same card;
  - each pause-card item works by real click;
  - **Return to Configuration** opens the sheet with the current config. The scenario is stopped (`RUN.cur` null) and bodies return to the pool (`bodies()` +0). Start from the sheet gives the same setup snapshot;
  - **Backspace** (real key) restarts, and equals the snapshot. Backspace with the preset name field focused does nothing;
  - bodies, listeners, timers, SCHED, `renderer.info` and `MG` all grow by 0;
  - reset CPU (ThreadTime) is ≤ 4 ms median.
- **`qa/tr4-pitch.mjs`** (browser, real clicks): set the pitch to Full, Half and One-goal in turn and Start each:
  - `CAGE.kind` matches the config, and the goal count matches the kind;
  - cones sit at the new anchors;
  - `bodies()` is unchanged;
  - after 3 round trips, `renderer.info` geometries and textures are back at each kind's first value;
  - the career diff is empty.
- **Career regression** (training.js changed): `wpI-drills`, `wpI-session`, `wpI-lessons`, `wpH2-lessonbot` and `wpD3-drills`. Esc still quits a career drill, and the lessons still pause.

---

## Phase 5: Free Play and the admin panel

Merge order: P5-A, then P5-B.

**Contracts**
- P5-A emits the window event `train:admin` with `{open}`.
- P5-B's `admin.js` listens for it and exports `adminOpen()`, `adminClose()` and `adminSection(id)`.
- P5-B's `tune.js` UI binds to `TUNE` from P2b-A.
- Freeplay exports `spawnBall(o)` for the admin's Ball section, where `o` holds the spawn height and speed options.
- **runner.js (P5-A stubs it on day one), for admin changes:**
  - `applyLive(fn)` runs `fn(ms)` between two simulation steps. Use it for changes that are safe mid-play: attribute values, stamina, tunables, the keeper's attributes;
  - `queueChange({key, label, apply(config)})` holds a change until the next safe state (a restart, replay, reset or new start) and applies it to the config before the spawn. A later change with the same key replaces the earlier one;
  - `RUN.pending` lists the queued changes, and thud shows each `label` as a note ("Applies on restart: 4 defenders").
- **pool.js (P5-A):** `replaceMe(look)` swaps the player's pooled body for one built from a new look, under the fade.
- **config.js and teams.js (P5-A stubs them on day one):** the shared schema gains `me.height` (metres, in the range the look editor allows) and `me.prefFoot` (`Right`, `Left` or `Both`). teams.js maps them to the player record's `scale` and `prefFoot` (the cfg fields `createAgent` reads: agent.js:39-40, sim.js:120-121). P5-B's admin writes them; it never edits config.js or teams.js.

### P5-A: Free Play, the training key layer, the runner's admin API, and the player's height and foot (about 12 h)

**Owns (existing files):** `js/life/train/hub.js`, `js/life/train/runner.js`, `js/life/train/thud.js`, `js/life/train/config.js`, `js/life/train/teams.js`, `js/life/train/pool.js`, `js/life/core/me.js`, `js/life/football/brain.js` (the practice-opponent behaviours only, work item 1b).

**New files:** `js/life/train/freeplay.js`, `js/life/train/keys.js`, `qa/tr5-freeplay.mjs`, `qa/tr5-keys.mjs`.

**Reuse:** the runner, the pool, `takeBall`, the agent capsules (agent.js:79-90) and the cage bounds.

**Work**
1. **freeplay.js:** registers Free Play, with no objectives.
   - Q spawns or resets ONE ball:
     - in front, along the body's facing, 1.0 to 1.4 m scaled by height;
     - on the ground at `y` equal to the ball's radius, with zero velocity;
     - never inside a body capsule or the fence; it is pushed to the nearest valid point;
     - the old ball is removed.
   - Optional practice opponents: 0 to 6, with attributes and a behaviour (stand, jockey or press).
   - Settings are registered as config type `free`, so Free Play gets presets like every scenario (spec 4).
1b. **brain.js: the practice-opponent behaviours.** They are AI decisions, so they live in brain.js, the one AI. freeplay.js sets `a.drill = {behave}` on each practice opponent, and brain.js's defending branch reads it, only when `ms.mode === 'train'`:
   - **stand:** hold the spawn point as the anchor and turn to face the ball. No press, no tackle and no challenge;
   - **jockey:** contain. He keeps 1.5 to 3.5 m from the carrier, goal-side, and faces him (`pressMove`'s own jockey stance at `BRAIN.PRESS_STOP`, state `jockey`, brain.js:1014-1022, with the tackle and challenge triggers off). The jockey gait style comes later in P9-A (MV-9);
   - **press:** today's `pressMove`, with tackles and shield challenges.

   No other agent is affected, and career and harness behaviour does not change.
2. **keys.js** (INF-6, ball-12): a window-capture listener installed while Training is active.
   - **Listener order is not relied on.** keys.js cannot come before the other capture listeners: life/phone.js adds its capture `keydown` listener as a classic script (phone.js:100), and controller.js adds its own when the module is imported (controller.js:151-152), both long before Training starts. It does not need to. Neither of them stops propagation: the controller's `capture` only sets `MOD.on` and stops a key's default (controller.js:126-137), and phone.js returns after Tab and Q (phone.js:100-115, and P2-A makes it return early in the training modes). The game's own key routing is world.js's bubble-phase `keydown` listener (world.js:456). So keys.js, in the capture phase, always sees the key before routing does.
   - It opens the admin panel on `e.code === 'Numpad1'`, or on Ctrl + Shift + `e.code === 'Digit1'`.
   - It ignores the key while an input, textarea, select or contenteditable has focus.
   - On a match it calls `preventDefault` and `stopImmediatePropagation`. Routing then never sees the key as "1", so the contact stays unchanged. `MOD.on`, which the controller's capture set for Ctrl+Shift+1, is cleared on the key-up as today.
   - It routes Q to Free Play.
3. **runner.js:** `applyLive`, `queueChange` and `RUN.pending`, per the contract.
4. **Height at the next safe state.** A live height change would grow the capsules into nearby bodies, and the drawn body must be rebuilt (18-30 ms for a new shape, perf.md), so height is queued:
   - at the next restart, under the fade, the runner sets `cfg.me` scale from the new height (through teams.js);
   - `pool.replaceMe(look)` rebuilds the player's body;
   - `core/me.js` rebuilds the sandbox body (`meDispose`, then build from the new look), so the eye (me.js:89-91) and the walking body match outside a scenario too;
   - in a scenario, the eye follows `a.scale` (training.js:503 reads it every frame). view.js needs no change, because the runner rebinds the view at restart with the new look.
5. **config.js and teams.js: the player's height and preferred foot** (the admin's Player section and the `player` preset depend on them).
   - config.js adds `me.height` and `me.prefFoot` to the shared schema, relevant for every type.
     - Defaults: `trainLook().height`, and `heldFoot()` (P3-A), else `Right`.
     - Validation: height clamped to the look editor's range; the foot one of `Right`, `Left` or `Both`.
   - teams.js maps `me.height` to the player record's `scale` (the look's height to scale rule that view.js and bridge.js already use) and to the pooled body's look, and maps `me.prefFoot` to `prefFoot`. `createAgent` turns that into `a.foot` (agent.js:40).

**Hook requests**
- To P5-B: CSS for the Free Play hints.
- To the integrator: importmap entries, and `import './freeplay.js';` and `import './keys.js';` in `js/life/train/index.js`.

**Acceptance**
- **`qa/tr5-freeplay.mjs`.** 30 Q presses at random facings, while walking, while sprinting, and near the fence and the goal:
  - exactly one ball every time;
  - the ball is in front within ±15° of facing and inside the distance range;
  - `y` equals the radius;
  - no capsule overlap, and the ball is inside the fence;
  - geometries grow by 0.

  Practice opponents spawn and despawn cleanly, and no objective UI shows. thud shows the Q hint here, and no other scenario shows it.

  **Opponent behaviours** (10 seeds each, the player dribbling past at 2 to 4 m with a bot):
  - **stand:** the opponent's root stays within 0.5 m of its spawn over 10 s, it faces the ball (within 30 degrees, 90% of frames), and it makes no tackle or challenge;
  - **jockey:** it stays 1.5 to 3.5 m from me and goal-side in at least 85% of frames, and makes no tackle or challenge;
  - **press:** it closes to 1.5 m within 3 s and makes at least one tackle or shield challenge within 10 s;
  - with the behaviour code in place, `node qa/harness.mjs --n 200` bands are unchanged (gated on `ms.mode === 'train'`).

  **Height and foot in the config:** `cfgFromConfig` with `me.height` 1.70 and 1.95 gives the player record the scale the look rule gives (±0.001), and `me.prefFoot` Left gives `a.foot === 'L'` after `createAgent`. With a held career the defaults equal its height and foot.

  Free Play presets: save a named `free` preset (2 opponents, press, opponent average 70, spawn height 0.5 m), reload, and load it. The config is identical, the opponents spawn with those settings, and Q spawns at the saved height.
- **`qa/tr5-keys.mjs`:**
  - thud shows the admin hint (Numpad 1, or Ctrl+Shift+1) in every Training scenario, and never outside Training;
  - Numpad1 toggles the admin panel, and `CTRL.contact` is unchanged;
  - Digit1 alone sets Low contact and does not open it;
  - Ctrl+Shift+1 opens it;
  - neither opens it with the preset name field focused;
  - nothing opens it in a career match or in life.

### P5-B: Admin panel (about 13 h)

**Owns (existing files)**
- `css/train.css`
- `js/life/stamina.js`
- `js/life/football/agent.js`, `js/life/football/sim.js`, `js/life/football/tune.js`
- `js/life/train/presets.js`

**New files:** `js/life/train/admin.js`, `qa/tr5-admin.mjs`.

**Reuse**
- attredit, presets and quick, as read-only APIs.
- The per-agent stamina pool `a.st` (agent.js:43).
- The scale chain: `a.scale` and the capsules (agent.js:79-90), `P.eye` (controller.js:574), the header point (actions.js:611), and the gait clock scale.

**Work: the panel's sections, per spec section 4**
- **Player:**
  - attributes, through attredit, applied live (`applyLive`);
  - height through the whole-body scale: `look.height`, `a.scale`, capsules, reach, the header point, eye height and gait, all kept consistent. It writes `config.me.height` (P5-A's schema field) through `queueChange`, and P5-A applies it at the next restart, with the note "Height applies on restart";
  - **physical traits**, defined as the real fields that change play: the preferred foot (`config.me.prefFoot`, Right, Left or Both). teams.js (P5-A) maps it to the player record's `prefFoot`, which `createAgent` turns into `a.foot` (agent.js:40), read by touch.js:70 and the strike side. It applies live through `applyLive` (an action already under way keeps the side its act stored) and is written to the config, so restarts keep it. Body build (`look.build`) changes only how the body is drawn, so it is not offered (no decorative settings);
  - reset;
  - player presets, as presets type `player`, holding the attributes, `me.height` and `me.prefFoot`. admin.js registers the type through `config.registerType`.
- **Stamina:** infinite on/off (holds `a.st` at maximum), restore, and set a value, all live.
- **AI:**
  - attacker and defender averages: queued, because they rebuild the NPC attribute vectors at spawn;
  - keeper attributes: live (`applyLive` writes `at.gk`);
  - active counts where allowed: queued until the next reset, with a note.
- **Ball:**
  - spawn or reset (freeplay);
  - reset position;
  - reset scenario;
  - ball options, limited to real ones: the spawn height and speed for Free Play, and the out-of-play law. No decorative settings.
- **Scenario and Match:**
  - restart, replay last, back to config, back to hub, through quick.js;
  - reset half and reset match, wired in Phase 8.
- **Formula tunables:** every `TUNE` entry, with reset to defaults.

Changes apply live where that is safe. Otherwise they are queued for the next safe state, with a visible note.

**Hook requests**
- To P5-A: none beyond the contract (`applyLive`, `queueChange`, `RUN.pending`, `replaceMe`, and the `me.height` and `me.prefFoot` schema fields).
- To the integrator: importmap entries, and `import './admin.js';` in `js/life/train/index.js`. P5-A's modules never import admin.js; they talk to it through the `train:admin` event.

**Acceptance (`qa/tr5-admin.mjs`)**
- **Player**
  - Sprint Speed 99 gives the measured top speed from A1.1.
  - Height 0.92 and 1.08 show the note, and after the restart move `a.scale`, `P.eye`, the capsule radius and the header contact height consistently. Cadence stays within 5% of the table and foot slide ≤ 2 mm. Outside a scenario, the sandbox eye matches too.
  - Preferred foot Left: the next first-time strike uses the left foot (`act.side` or the strike foot).
  - Player presets: save a `player` preset (attributes, height 1.08, Left foot), change everything, load it: all three are restored.
- **Stamina**
  - Infinite stamina keeps breath ≥ 0.99 over a 30 s sprint.
  - Setting breath to 20% lowers sprint speed per stamina.js.
  - Restore after a sprint brings breath back to its cap within one step.
- **AI**
  - Defender average 30 then 90, queued: after the restart, the defenders' mean tackling is within 1 of 90 plus their profiles.
  - Keeper reflex 30 then 90, live: `at.gk.reflex` changes at once, and the save rate over 40 scripted shots differs.
  - A count change during play shows the note and applies at the next reset.
- **Ball**
  - Spawn or reset gives exactly one ball, per tr5-freeplay's rules.
  - Reset position puts the ball back at the scenario's setup point and velocity (±1 mm).
  - Reset scenario equals Restart Current Scenario (the setup snapshot).
  - The ball options really change: spawn height 0.5 m spawns at 0.5 m; the out-of-play law switches between a rebound and an `out` event with a restart.
- **Scenario and Match** (spec 4; each by real click in the panel, under pointer lock where the game holds it):
  - **Restart** equals the setup snapshot (`RUN.digest()` equals the activation digest);
  - **Replay Last**, after a config change, restores the previous setup, as the pause-card item does in tr4-reset;
  - **Back to Configuration** opens the config sheet with the current config. `RUN.cur` is null, the bodies are back in the pool (`poolStats().inUse` 0) and the sheet's cover is up;
  - **Back to Hub** opens the hub, with the same pool and cover checks;
  - after each one the panel is closed and nothing is left open behind it;
  - outside Full Match, Reset Current Half and Reset Match are not shown (no dead buttons). They are tested from this panel in tr8-fullmatch.
- **Tunables:** setting the R tunable to x0.5 halves the control distance in a scripted receive, and reset to defaults restores it.
- The career diff is empty, and the write spy logs no `freyaFootball.v2` write.

---

## Phase 6: Receiving, attacking, defending and match scenarios

Merge order: P6-A, then P6-B. Scenario modules register their config types through `config.registerType`, so neither package edits config.js.

### P6-A: Ball Receiving and First Touch (highest priority; about 17 h)

**Owns (existing files):** `js/life/football/touch.js`, `js/life/football/view.js`, `js/life/moves.js`, `js/life/football/control.js`.

**New files:** `js/life/train/scen-receive.js`, `js/life/train/feeder.js`, `qa/tr6-receive.mjs`, `qa/tr6-receive-anim.mjs`.

**Reuse**
- The P2b engine: R, q and the touch.
- `coachFeed`/`feedStep` (a real strike).
- AI passes through `actions`/`strike.js`.
- The trainspec tests: `receiveTest`, `passTest`, `shotTest`, `volleyTest` and `headerTest`.
- moves.js receive clips, the runner, the presets and the replay.

**Work**
1. **Every receiving variant in spec section 5** as one parameterised scenario family:
   - ground passes to a stationary or moving player; slow or fast;
   - from the left, right, behind or at an angle; into space;
   - while sprinting, jogging or moving sideways;
   - under pressure;
   - first-time pass and first-time shot;
   - chest, thigh, foot control of an aerial ball, and a header to control or redirect;
   - high aerial, low bounce and high bounce;
   - needing adjustment steps; slightly behind or slightly ahead;
   - while turning; facing away from the passer; while shielding;
   - then turn, sprint, through ball, cross or shot.

   Configurable: passer, receiver, stationary or moving, defender and distance, direction, speed, initial height, ground, bouncing or aerial, intended control type, the follow-up (control, redirect, pass or shoot) and attributes.
2. **feeder.js:** an AI passer playing real passes, or the coach feed, along configured trajectories. It never teleports the ball. It reads the same `ball.launch` config field that the runner applies today with an agent -1 kick (P4-A teams.js, P4-B runner). With a passer configured, the passer's own strike plays that launch from his foot instead.

   *Recorded deviation (TR-6 fix round 2, integrator).* The receiving drills are of type `receive` (receive.js), whose options (where from, how, how hard, how high, to where on the receiver) solve the launch in feeder.js, because a pass to a man on the run has to be aimed where he will be, which a fixed `ball.launch` target cannot say. The runner's agent -1 launch and the feeder's coach kick are the same ball.js kick. The Phase 4 type `receiving` in config.js stays as the generic type of the category with its `ball.launch` field (tr4-config checks every Phase 4 type, and a scenario that wants a fixed flight can still use it); no drill registers it today. A configured passer's strike plays the solved launch exactly (no deviation, no speed spread: the acceptance holds the launch within 2% and the apex within 5 cm), so his attributes shape the flight through his ball's drag and curl only.
3. **touch.js:**
   - a cushioned header (today every header leaves at 6 m/s or more);
   - foot control of a ball above 0.6 m within R.
4. **view.js and moves.js receiving animation:**
   - anticipation, adjustment steps, foot placement, body orientation, hip and torso rotation, arms and balance, weight transfer, contact timing, deceleration or redirection, recovery and transition;
   - never an animation where the ball is not;
   - no excessive locking.
5. **control.js:** the intended control direction (look and WASD) feeds the receiver-frame touch.

**Hook requests:** to the integrator: importmap entries, and `import './scen-receive.js';` and `import './feeder.js';` in `js/life/train/index.js`.

**Acceptance**
- **`qa/tr6-receive.mjs`** (Node with `controlStep` bots, about 40 variants x 5 seeds):
  - control happens inside R;
  - the touch rests at `touchDist` ±0.3 m in the intended direction;
  - queued first-time passes and shots fire;
  - the body part follows the real height;
  - a cushioned header leaves the ball ≤ 3 m/s;
  - pressure lowers q;
  - no NaN;
  - results are logged per variant.
- **`qa/tr6-receive-anim.mjs`** (browser):
  - at every contact, the contact bone is within 0.12 m of the ball;
  - at least one adjustment footfall when the ball is off line;
  - no clip starts with the ball more than R + 0.3 m away;
  - input is never locked more than 0.35 s after contact;
  - a contact sheet per variant;
  - **the feeder's first ball:** for a ground pass, a driven pass, a cross and a loft from the configured passer, the launch speed is within ±2% and the apex within ±5 cm of the configured values (the check P4-B runs for the runner's launch), and the ball leaves the passer's foot at contact (within 0.12 m);
  - **presets** (spec 4): save a named `receive` preset with non-default values (moving receiver, bouncing ball from the left at 14 m/s, a defender at 3 m, follow-up shoot), reload, and load it. The config is identical, and the activation's `RUN.digest()` equals that of the saved setup.

### P6-B: Attacking, Defending and Match scenarios on one shared framework (about 19 h)

**Owns (existing files)**
- `js/life/football/brain.js`, `js/life/football/tactics.js`, `js/life/football/replay.js`, `js/life/football/fphud.js`
- `js/life/train/runner.js`, `js/life/train/thud.js`
- `css/train.css`

**New files**
- `js/life/train/scen-team.js`, `js/life/train/scen-attack.js`, `js/life/train/scen-defend.js`, `js/life/train/scen-match.js`
- `qa/tr6-team.mjs`, `qa/tr6-team-browser.mjs`

**Reuse:** `createMatch` with `cfg.tempo` (sim.js does not need editing), the `goalCounts` and goals law, replay.js `clip`, `keep` and `play` for instant replay, the offside notice text from controller.js:631-635, and teams.js.

**Work**
1. **scen-team.js, the shared framework:**
   - counts 0 to 6 per side, the keeper, roles, positions (validated onside), possession and attributes;
   - objectives: score, keep the ball N s, reach the line, win it back and transition, keep a clean sheet for N s.
2. **The scenarios.**
   - **Attacking:** from midfield; alone; with team-mates; an AI carrier while I play another role; me requesting the pass; runs in behind; winger, attacking midfielder and support roles; keeper with no defenders; keeper with defenders; no keeper.
   - **Defending:** 1v1, 2v1, 1v2, 1v3, many against many, a lone attacker against the keeper, positioning without a keeper, AI attackers passing, AI carrying at me.
   - **Match:** wing play, receiving on the wing, crossing from the wing, combinations, one-twos, overlaps, underlaps, through-ball timing, counters, breaking a line, 2v1, 1v2, 1v3, 2v2, 3v2, 3v3, against a low block, receiving under pressure, turning away from a defender, playing out from the back, recovering possession, creating space, first-time passes, crosses to headers or volleys, loose balls and second balls.
3. **AI-3:** gate the shot, cross, first-time-shot and attacking-header options on `goalCounts`, or on the scenario's target. This also fixes the shipped rondo.
4. **AI-4:** a scenario tempo, with shot bias set by the objective, through `cfg.tempo`.
5. **TAC-1:** gate the anchor cap on the offside law (tactics.js:143), and use the last opponent when there are fewer than two (tactics.js:120 falls back to 0.7 L today). **OFF-3, the AI side:** `lineOpp` skips players who are `leaving` (tactics.js:115), as P3-A does for `offsidePosition`.
6. **AI team-mates:**
   - see the user's calls and runs;
   - never make forced, impossible passes;
   - defenders track without crowding one point.
   - "See the user" means: the player is in the carrier's pass candidates in every decision (brain.js reads `ms.call` at 245 and 519). The player's R call (`callFor`, brain.js:1558) raises his value as a target when he is open and onside. A call from an offside or blocked position is never answered with a pass.
6b. **Team-mate calls stay subtle** (spec 2). The existing calls are a small name and chevron over the caller for 1.5 s, or a tick at the screen edge (fphud.js:172, 343-348), plus spoken calls (the `speech` setting, fphud.js:561). Verify them in training. If a check below fails, fix it in fphud.js, which this package owns in Phase 6.
7. **Instant replay** in training, and the **OFF-2** offside notice in thud.

**Hook requests:** importmap entries, and `import './scen-team.js';`, `import './scen-attack.js';`, `import './scen-defend.js';` and `import './scen-match.js';` in `js/life/train/index.js`, all to the integrator. Changes to rules.js are not expected; if one is needed, it is a hook to the integrator.

*Recorded (TR-6 fix rounds, integrator work).* The TR-6 fix rounds act as the integrator for Phase 6 and edited files neither package owns: sim.js (LEVEL 0.82 to 0.90 and Standard tempo shotBias 1.9 to 1.7, the harness recalibration after P6-A's aerial first touch), rules.js (reconsiderSource: the quickest spare ball when the game ball is out of reach), zone.js (playableFrom, the time canPlay's timed bars lift, read by the view's receive clip) and brain.js (the harness stand-in's archetype table, and CALL_MIN for a pass to the player on his call).

**Acceptance**
- **`qa/tr6-team.mjs`** (Node, every scenario x 10 seeds):
  - no shot at an end without a goal;
  - at most 1 chaser per team for a loose ball;
  - three or more of one side within 3 m of the ball only when planned;
  - the carrier passes when a free mate has an xT advantage (rate bands);
  - no pass to an offside receiver when offside is on;
  - **no attacker starts offside** at activation when offside is on (spec 2: scenario generation respects offside);
  - no kick aimed outside the cage;
  - objectives detected correctly;
  - **TAC-1** (the anchorcap.mjs case: Attacking, keeper with no defenders, Full cage):
    - with offside off, no attacker's anchor is capped by `lineOpp`: each anchor equals the value the test recomputes with the cap removed. Today the ST anchor is u = 73.2 of 105 with offside on and off alike (ai.md:61-63);
    - with offside on, the cap is the keeper's line minus 0.3 m (the last opponent, the same rule as OFF-1), not 0.7 L;
    - a defender who is `leaving` does not move the cap;
  - **me requesting a pass** (spec 5 Attacking; the player is a bot agent that calls with `callFor` the way R does, 20 seeds per case):
    - open, onside and with a clear lane (the carrier's `passModel` success ≥ 0.7): the AI carrier passes to me within 2 s in at least 80% of runs;
    - lane blocked (success < 0.3) or me offside: he passes to me in 0 runs;
    - a "behind" call on an onside run that beats the line: he plays a through ball to me in at least 60% of runs where one is on;
    - **sees the user:** in every carrier decision while I am on the pitch, I am among the pass candidates (0 decisions skip me);
    - with no call, my share of the carrier's passes is at most 1.5 times the share an AI player in my slot gets over the same seeds (no forced passes to me).
- **`qa/tr6-team-browser.mjs`:**
  - input bots play two scenarios per category with real keys;
  - **a real R press** while I am open and onside makes the AI carrier pass to me within 2 s in at least 4 of 5 tries;
  - **presets** (spec 4): for `attack`, `defend` and `match`, save a named preset with non-default counts, keeper, roles and objective, reload, and load it. The config is identical, and the activation's `RUN.digest()` equals that of the saved setup;
  - instant replay plays and returns;
  - a scripted offside shows the notice;
  - **calls** (spec 2):
    - when an AI mate calls, a `.fp-call` element shows the caller's name, fits within 160 x 48 px, sits over the caller (or at the screen edge on his bearing when he is off screen) and is gone within 2 s;
    - the spoken call fires when `speech` is on (audio spy) and not when it is off;
    - no HUD element taller or wider than 64 px points at a player or the ball (no giant arrows).
- **Harness:** n=1000 bands pass.

**Risks**
- brain.js changes reach career matches: gate training-only behaviour on objectives or `ms.mode === 'train'`.
- The scenario list is long (about 45 variants).

---

## Phase 7: Set pieces

**Each package consumes the other's API**, so neither merge order is safe on its own:
- P7-A's free kicks call P7-B's `startRestart` options;
- P7-B's corners call P7-A's `cornerPlan`, an export of brain.js. An ES-module import of a missing export fails when the page loads, so merging P7-B first would break the tree until P7-A merged.

**Order:**
1. **Day one: a contract commit.** Both stubs are merged into the phase base before either package's main work:
   - P7-B's rules.js accepts and passes through the `opt.*` fields below;
   - P7-A's brain.js exports `cornerPlan` with the final signature, returning today's corner behaviour.
   
   Both packages then rebase on it.
2. **Then P7-A, then P7-B.**

**Contracts (in the day-one commit)**
- rules.js `startRestart(ms, kind, team, spot, opt)` accepts:
  - `opt.taker`, `opt.second`, `opt.secondAction`;
  - `opt.side`;
  - `opt.noKeeper`;
  - `opt.wallSpec`, which is passed through to brain.js.
- P7-A's brain.js exports `cornerPlan(ms, R0, spec)` for P7-B: designated receiver and a marking scheme, zonal or man.
- **Wall size and the 6v6 limit** (G0 decisions d and h): wall players are drawn from the defending side's 6 outfield players, and the attacking side's 6 include me and the second taker. So a free kick has at most 13 agents, which P3-B's pool covers: 13 agent bodies plus my first-person rig, 14 in all. No official bodies are built in drills (P3-B view.js), and `bodies()` is the pool plus the sandbox's 2.

### P7-A: Free kicks build mode and set-piece AI (about 15 h)

**Owns (existing files):** `js/life/football/brain.js`, `css/train.css`.

**New files:** `js/life/train/scen-freekick.js`, `js/life/train/fkplace.js`, `qa/unit/fkwall.mjs`, `qa/tr7-freekick.mjs`.

**Hook requests:** to the integrator: importmap entries, and `import './scen-freekick.js';` and `import './fkplace.js';` in `js/life/train/index.js`. hub.js needs no edit (it reads the runner's registry).

**Reuse**
- The brain.js wall at 1177-1196: `RULES.WALL_D`, `WALL_GAP`, the jump.
- `fkRole`, the restart system, presets and the runner.

**Work**
1. **Step 1, configure participants:** attackers, defenders, wall size 0 to 6, wall on/off, the taker, and a second taker with an action (pass to the main taker, decoy run, receive short and shoot, or receive and carry). Also the keeper, positions and attributes. The wall counts toward the 6 defenders. The sheet shows "Defenders: 2 in the wall, 4 free" and clamps the total to 6.
2. **Step 2, place the ball:**
   - only valid positions, at various distances and angles;
   - a live "Distance to goal: 21.4 m": the ground-plane distance from the ball to the centre of the goal line, updating as the ball moves.
3. **Step 3, place the wall independently:**
   - distance to the ball, lateral offset, alignment, size and presence;
   - a live "Distance from ball: 9.2 m", with the ball distance also shown;
   - a marked preview versus the confirmed position;
   - moving the wall never moves the confirmed ball.
4. **Step 4, confirm and start:** Confirm Ball Position, Confirm Wall Position, Adjust Placement and Start Free Kick. Start is impossible before placement.
5. **The wall** is real NPCs in an even, coherent line:
   - never overlapping;
   - never inside the ball or a player, never out of bounds;
   - size 0 removes it, and resizing repositions it sensibly.

   This is done through `wallSpec` in brain.js.
6. **Second taker** behaviours in brain.js, and `cornerPlan` for P7-B.

**Acceptance**
- **`qa/unit/fkwall.mjs`:** sizes 0 to 6, by distance, by offset:
  - equal spacing;
  - capsules at least 2r apart;
  - at least 0.5 m from the ball;
  - inside the bounds.
- **`qa/tr7-freekick.mjs`:**
  - a grid of distances (16 to 35 m) and angles (-40 to 40 degrees);
  - no wall, small and large walls, wall distances 5 to 12 m, lateral offsets and resizing;
  - the indicators are within 0.05 m of the computed distance;
  - Start is blocked before both confirms;
  - **the wall never moves the ball:** after Confirm Ball Position, 20 wall changes (distance, offset, size and presence, preview and confirm) leave the confirmed ball position bit-identical;
  - **second taker, each action over 5 seeds:**
    - pass to the main taker: a pass event from the second taker to the main taker, then the main taker's strike;
    - decoy run: the second taker runs at least 5 m and does not touch the ball before the main strike;
    - receive short and shoot: a pass from the main taker to the second, then a shot by the second;
    - receive and carry: a pass from the main taker to the second, then he dribbles at least 3 m;
  - **bodies with a wall of 6** (and no other outfield defenders, the keeper, me and a second taker): `poolStats().inUse` ≤ 14, `bodies().length` equals the drill value of 16 (the pool plus the sandbox's 2), `human()` is not called (spy), and no official body exists;
  - preset save/load restores the ball, the wall, its size and the measurements;
  - a real strike goes over or round the wall, and the keeper reacts.

### P7-B: Corners, throw-ins and penalties (about 15 h)

**Owns (existing files):** `js/life/football/rules.js`, `js/life/football/gkbrain.js`, `js/life/football/actions.js`, `js/life/football/view.js` and `js/life/moves.js` (the throw-in clip).

**New files**
- `js/life/train/scen-corner.js`, `js/life/train/scen-throw.js`, `js/life/train/scen-penalty.js`
- `qa/tr7-corner.mjs`, `qa/tr7-throw.mjs`, `qa/tr7-penalty.mjs`

**Hook requests:** to the integrator: importmap entries, and `import './scen-corner.js';`, `import './scen-throw.js';` and `import './scen-penalty.js';` in `js/life/train/index.js`.

**Reuse**
- `startRestart`, `restartStep`, `pickTaker` and `cornerRole`.
- The throw-in act and its clip (view.js:274), and gkbrain `penaltyStep` (497).
- The replay and the runner.

**Work**
- **Corners:**
  - roles: I take; the AI takes and I play in the box; attacker in the box; defender; support outside the box; designated receiver;
  - settings: counts, keeper, taker, the controlled player, positions, marking and attributes;
  - the ball at the correct corner;
  - crosses, short corners, runs, marking, headers, volleys, clearances and second balls;
  - instant replay.
- **Throw-ins:**
  - roles: I throw; the AI throws and I receive; I run to receive; I mark a receiver; I support for the second ball;
  - settings: counts, location, thrower, receiver, positions and attributes;
  - the throw animation, release, trajectory, receiving, first touch and the change of possession, with no teleport;
  - **the ball stays in the hands until release.** The clip is in view.js:274-278 (`throwin`) and moves.js:1453 and 1595 (duration 1.0, contact 0.62, release event at 1603). The act releases at `ACT.THROW_REL` (actions.js:681-682). Align the clip's release with the act's `tc`, and draw the ball at the hands until then.
- **Penalties:**
  - I take; the AI takes while I play another outfield role;
  - keeper on/off, with an empty-goal drill (`opt.noKeeper`);
  - attributes, including the keeper's;
  - approach, strike, contact, direction, power, trajectory, keeper reactions, saves, goals and rebounds;
  - instant retry.

**Acceptance**
- **`qa/tr7-corner.mjs`:**
  - both corners on each side, with the ball within 1 m of the corner arc;
  - every role works;
  - deliveries go toward the designated receiver;
  - marking follows the config;
  - headers, volleys, clearances and second balls all occur across seeds;
  - instant replay plays the last corner and returns to the same state (spec 5 asks for instant replay on corners);
  - **presets:** a named `corner` preset (non-default side, taker, receiver, marking and counts) survives a reload and a load: the config is identical, and the activation's `RUN.digest()` equals that of the saved setup.
- **`qa/tr7-throw.mjs`:**
  - the ball is within 0.15 m of the hands at release;
  - a believable trajectory;
  - the receiver's first touch and the change of possession;
  - every role works;
  - **presets:** a named `throw` preset (location, thrower, receiver, counts) round-trips as in tr7-corner.
- **`qa/tr7-penalty.mjs`:**
  - every role works;
  - the empty goal works;
  - the keeper's attributes change the save rate;
  - rebounds stay live;
  - retry restores the setup;
  - **presets:** a named `penalty` preset (AI taker, keeper off, keeper attributes) round-trips as in tr7-corner.

---

## Phase 8: Full Match in Training Mode

Merge order: P8-A, then P8-B.

**Contracts (P8-A stubs them)**
- `FP.enterTraining(cfg, {zone, kind, start: 'kickoff' | 'bench', host})`, where `host` is the training host below.
- `FP.resetMatch()`, `FP.resetHalf()`, `FP.restartKickoff()`.
- A bench provider: `registerBench(zone, {seats, fourthOfficial, dugout})`. stadium.js registers its own bench through it, and the cage registers its own.

### P8-A: Match reset API, training entry, training host and the 11v11 pool (about 15 h)

**Owns (existing files)**
- `js/life/football/controller.js`, `js/life/football/sim.js`, `js/life/football/replay.js`
- `js/life/football/warmup.js`, `js/life/football/view.js`, `js/life/football/stadium.js`
- `js/life/train/pool.js`

**New files:** `qa/unit/simreset.mjs`, `qa/tr8-reset.mjs`.

**Reuse**
- `testConfig`, `enterTest` and `enterBench` (controller.js:1496-1552), with `FS.real` false. That means no checkpoint, no settle and no career writes.
- `createMatch` options and `secondHalf`.
- `placeForKickoff` (sim.js:174), exported here.
- `clearMatchFlags` from P2-A, `recInit` and `controlReset`.

**Work (MF-10)**
- **Entry:**
  - `enterTraining` takes a zone and team config: separate team averages, the keeper's attributes, and my slot and role;
  - the start is either kick-off or the bench;
  - `FS.real` is always false;
  - the warm-up minigame is off in training (say so in the config UI).
- **The resets:**
  - **resetMatch:** a fresh `createMatch` from the cfg, then the view is rebound to the pooled bodies. The zone is not re-entered.
  - **resetHalf:** takes a half-start snapshot of everything listed in `fp/p1/matchflow.md` section 6 (matchflow.md:148-150), with nothing dropped:
    - score and goal list, stats, the events cut;
    - the agents on the pitch, including subs made and men sent off;
    - energy and stamina, subs used and planned;
    - `ms.roleDone` and `ms.callUp` (the bench call-up state, sim.js:96, 100);
    - the bench `used` flags (sim.js:130 gives every bench record one);
    - offside, advantage, pending bookings, the chain and the judge queue.

    So a Reset Current Half after a call-up in that half puts the call-up state back to where the half began (spec 5: resets restore control).

    Restore rebuilds `ms` from the cfg, then applies the snapshot. `ms.agents` only ever grows, so it cannot be patched in place.
  - **restartKickoff:** per the G0 decision. The default keeps the clock and score and re-lines both teams for a kick-off in the current half.
- **Every reset clears** (matchflow.md:153-154, the whole list):
  - `FS.htCard`/`htCardT`, `skipping`/`skipResume`, `called`/`atFourth`/`seated`, `goalEv`/`ckGoal`/`ckNow`, `evq`;
  - the replay;
  - `CTRL`;
  - the warm-up: its minigame state and timers (warmup.js). The warm-up is off in Training, but a reset must still leave none behind;
  - pending reveals, which are made cancellable.
- **Bench provider** interface, so a bench start works in the cage.
- **A host for the controller without a career.**
  - Today the controller has one host, the career's, registered in core/tunnel.js:112-166 (`fpHost`). `startMatch` calls `HOST.look()` whenever a host exists (controller.js:238). That reads `G().player.look` (tunnel.js:118), so with `S` null (held by P3-A) it throws inside its try/catch and calls `console.error`, which breaks the DoD rule of 0 console errors. Found by reading; not probed.
  - Work: the controller keeps the host per entry, `FS.host = o.host || HOST`, and every host call goes through `FS.host`: controller.js:177-190, 238, 305, 428, 779, 1160, 1190, 1219, 1226-1239, 1265, 1406, 1422, 1425 and 1445-1482.
  - The training host is built by fullmatch.js (P8-B) from the sandbox:
    - `look()` from `trainLook()` (the created character when a career is held);
    - `kickoff`/`now` from the match clock;
    - `relock`, `note` and `speed`/`setSpeed` on the device settings only;
    - no `setup`, `leave`, `around`, `htCard` or `ftCard` (the controller already skips those when `FS.real` is false).
  - core/tunnel.js is not edited.
- **The pool for 11 v 11** (pool.js; spec 0 and 5).
  - A Full Match needs a body for every agent that is not `off` (22 players, the referee and 2 assistants: 25, perf.md:17) and one for each substitute, as `looksOf` counts them (view.js:54-58). Add the first-person body. The officials are drawn here: the runner's `officials: false` is for drills only (P3-B).
  - `poolEnsure(n, looks)` grows the pool to that size under the entry fade (prebuilt, never during play). It keeps P3-B's kit groups: my side in kit A, the other side in kit B, a keeper kit for each side, and the officials' kit. The drill bodies are reused, and only the missing ones are built.
  - `bodyFor` (view.js:78-84) takes from the pool instead of calling `human()`.
  - Leaving Full Match (Return to Hub) trims the pool back to the 14 drill bodies under the fade.

**Acceptance**
- **`qa/unit/simreset.mjs`:** the snapshot is complete, and a restore equals a fresh state at the half start.
- **`qa/tr8-reset.mjs`.** This runs from a fresh page with no career: 0 console errors and 0 page errors throughout, and the career host's functions are never called (spy on the `fpHost` object).

  After Reset Match:
  - clock 0, half 1, score 0-0;
  - events empty;
  - kick-off positions, possession per config, control on me;
  - AI plans cleared and flags clear;
  - stamina fresh, and no extra balls.

  After Reset Current Half, in the second half after goals: the state equals the half-start snapshot.

  **Reset Current Half after a bench call-up** (bench start, called up and on the pitch in the second half):
  - `roleDone`, `callUp` and every bench `used` flag equal the half-start snapshot;
  - exactly one `isMe`;
  - control is where the half began: on me if I started the half on the pitch, else back on the bench seat with the seat camera;
  - no stale `called`, `atFourth` or `seated` state;
  - a second call-up in the replayed half works through the fourth official.

  `qa/unit/simreset.mjs` checks the snapshot against the field list of matchflow.md section 6 by name, so a field cannot be dropped silently.

  After Restart from Kickoff (G0 decision c), in the second half at 2-1:
  - the clock, the half and the score are unchanged (the clock within one step);
  - both teams stand at `placeForKickoff` positions (±1 mm), and the side that kicked off the half has the ball;
  - AI plans and the chain are cleared, and stamina is kept.

  After each kind of reset, play through half time with real clicks under pointer lock, including Esc, three times, then through full time.

  Over 20 cycles, listeners, timers, SCHED, actors and `renderer.info` all grow by 0.

  The career diff is empty, the write spy logs no `freyaFootball.v2` write, and no checkpoint is written.

  Pool: after entry, `poolStats().size` equals 25 + the substitutes + 1, and `bodies().length` equals that plus the sandbox's 2. Both stay the same after 3 Reset Match. After Return to Hub the pool is back at 14 and `bodies()` at 16, with `renderer.info` geometries at the hub's value.

### P8-B: Full Match in Training Mode (about 10 h)

**Owns (existing files)**
- `js/life/train/cage.js`, `js/life/train/quick.js`, `js/life/train/admin.js`, `js/life/train/hub.js`
- `css/train.css`

**New files:** `js/life/train/fullmatch.js`, `qa/tr8-fullmatch.mjs`.

**Hook requests:** to the integrator: importmap entry, and `import './fullmatch.js';` in `js/life/train/index.js`.

**Reuse**
- Team and role selection through the existing config: the slot picker from js/data/positions.js, and teams.js.
- The quick-menu slots.

**Work**
- **The Full cage** gets bench seats, dugouts and the fourth official's spot, registered through `registerBench`.
- **Configuration:** registered as config type `fullmatch` through `config.registerType` (no config.js edit), so Full Match gets presets through presetui like every scenario (spec 4). It holds:
  - team and role, team averages, keeper attributes, half length;
  - kick-off or bench start, and the substitution minute;
  - real lines and restarts, with `out` forced to `stop` and the pitch forced to `full`. These two are not stored in presets.
- **The training host** for the controller (see P8-A): fullmatch.js builds it and passes it to `FP.enterTraining`.
- **Quick menu:** Reset Current Half and Reset Match (distinct, each with a confirmation), Restart from Kickoff and Return to Hub.
- **Admin panel:** its Scenario and Match section is wired up.
- The keeper is never selectable or switchable: the role picker offers no GK slot, and the bench swap never picks the keeper.

**Acceptance (`qa/tr8-fullmatch.mjs`)**
- From a fresh page with no career, and again with a career quit to the title: 0 console errors and 0 page errors. With a career, my body wears the created character's look.
- From the kick-off in the Full cage, with real clicks through half time and full time.
- From the bench:
  - the call-up and the walk to the fourth official;
  - exactly one `isMe`, and the replaced AI leaves with `subbedOff`;
  - control and camera are handed over, with no duplicates.
- **Real lines and restarts:**
  - a ball driven over the touchline gives `out` and a throw-in restart at the line;
  - over the goal line it gives a goal kick or a corner, per the last touch;
  - the ball is never rebounded by the fence in Full Match.
- **The keeper:**
  - the role picker's DOM has no GK option;
  - for every start choice, my agent is not `isGK`;
  - a bench start never swaps me for the keeper;
  - with the keeper sent off (scripted), I am never put in goal (P2-A's GK-1 rule).
- **Presets:** save a named `fullmatch` preset (my slot LW, team averages 70 and 55, half length, bench start at 60'), reload, load: the config is identical, and the match starts with those values.
- **Quick menu and admin:** Reset Current Half, Reset Match and Restart from Kickoff, from the pause card and again from the admin panel's Scenario and Match section, each by real click with its confirmation, give the tr8-reset results.
- Return to Hub grows listeners by 0, and the pool returns to 14 (`bodies()` to 16).
- The career diff is empty, and the write spy logs no `freyaFootball.v2` write.

---

## Phase 9: Animation and AI refinement, using Training Mode as the test bed

Merge order: P9-B, then P9-A, because P9-A animates the acts that P9-B adds.

**Contract:** keeper distribution acts `act.kind` `'gkthrow'` and `'gkroll'`, with `{target, tRelease}`. P9-B creates them; P9-A animates them.

### P9-A: Animation refinement (about 22 h)

**Owns (existing files)**
- `js/life/gait.js`, `js/life/human.js`, `js/life/rig.js`, `js/life/moves.js`, `js/life/gkmoves.js`
- `js/life/football/view.js`, `js/life/football/matchcam.js`, `js/life/core/me.js`
- `js/life/football/controller.js`, `js/life/football/training.js`, `js/life/football/actions.js`
- `js/life/train/runner.js`

**New files:** `qa/tr9-anim.mjs`, `qa/tr9-gkanim.mjs`, `qa/tr9-sheets.mjs`.

**Work.** Everything in spec section 6 for players and keepers. For each item, record the root cause found: asset, playback speed, controller conflict, priority, transition, root motion, scaling, contact point, physics, an AI interrupt or a stuck state.
- **MV-9:**
  - the jockey style with lead and trail steps up to 3.2 m/s, from `a.state` and `CTRL.jockey`;
  - dribble touches by the visible foot: `st.phase` from `a.g`, and `gait.touch` at the sim's dribble events.
- **MV-14:** apply `strikeRoot` as the speed cap during strikes (actions.js:765-795).
- **MV-15:**
  - the match and training FP body gets the neck fix and arms-in (controller.js:597, training.js:395, runner);
  - trigger `camAction` backswing, slide, chest and land on clip events;
  - map fatigue 0 to 1 from breath and request `tired`.
- **GK-3 (animation side):**
  - map claim, collect, spread and punch states to `gkcatch`, `gkcollect`, `gkpunch` and `gktip`;
  - animate throws and rolls from the new acts.
- Get-up, stagger, landing, blocking, jumping and heading, and all transitions blended.

**Acceptance**
- **`qa/tr9-anim.mjs`.** Bots run every training category. Per animation:
  - planted slide ≤ 10 mm;
  - per-frame bone change ≤ 0.25 rad outside designated impulses;
  - the contact bone within 0.12 m of the ball at contact;
  - no stuck state over 0.5 s;
  - no one-frame jump above 0.3 rad at a transition.

  The generic metrics above can pass even when a state is never reached, so each P9-A item also has its own check:
  - **MV-9, jockey:** in a Defending drill with jockey held, laterally and backward at 1.0, 2.0 and 3.2 m/s:
    - the gait style is `jockey` in at least 90% of jockey frames;
    - the lead foot stays the lead (no crossover) and the feet stay at least 0.08 m apart;
    - planted drift ≤ 2 mm.
  - **MV-9, dribble touches:** at every sim dribble touch, `gait.touch` fires within ±1 frame. The touching foot is the drawn foot in swing, with its toe within 0.15 m of the ball at the touch, in at least 95% of touches.
  - **MV-15, the first-person body** (match and training):
    - `fpPose` gets the neck fix and arms-in on every frame (spy);
    - over 600 frames of sprinting, turning and looking down (pitch down to -60 degrees), no body vertex sits within 0.12 m in front of the camera inside the central 40% of the view;
    - the arms stay out of the central half of the screen except during an action that uses them (shield, throw-in).
  - **MV-15, tired:** with breath set to 0.15 (admin) and the player standing for 1 s, fatigue maps above 0.7 and the `tired` pose is requested and shown within 1 s. It ends within 1 s of breath recovering past the threshold. AI bodies follow the same rule.
  - **MV-15, camAction:** a scripted strike, slide, chest receive and header landing each trigger exactly one `camAction` of their kind (backswing, slide, chest, land) within ±1 frame of the clip event (spy). Camera roll stays ≤ 2 degrees.
  - **GK-3, distribution:** across seeds, the keeper plays `gkthrow` and `gkroll` acts. The ball stays within 0.15 m of the releasing hand until `tRelease`, and the clip's release event is within ±1 frame of it.
- **`qa/tr9-gkanim.mjs`:**
  - walk, reposition and shuffle planted in at least 40% of frames;
  - catch, collect, punch and tip all used across the shot sets, and each claim, collect, spread and punch state shows its mapped pose (`gkcatch`, `gkcollect`, `gkpunch`, `gktip`) within 2 frames;
  - throw and roll animations (`gkthrow`, `gkroll`) are each played at least 10 times across seeds, with the release checks of tr9-anim;
  - dive, land, recover and return to ready within bounds;
  - no teleport.
- **Regression:** `wpB-*`, `wpK-*`, `wpF-feel`, `tr2-gait`, `tr2-startstop`, `tr2-clipexit`, `tr6-receive-anim`, and `tr3-runner`, whose camera checks (owner, eye height, no move above 0.15 m in a frame outside a cut) must still pass once `camAction` adds backswing, slide, chest and land.

### P9-B: AI refinement (about 15 h)

**Owns (existing files)**
- `js/life/football/brain.js`, `js/life/football/tactics.js`, `js/life/football/gkbrain.js`, `js/life/football/gkplan.js`, `js/life/football/harness.js`
- `qa/harness.mjs`

**New files:** `qa/tr9-ai.mjs`.

**Work.** The spec section 6 AI list: positions, passing options, passes, through balls, receiving, runs, support, tracking, marking, interceptions, challenges, tackles, loose balls, recovering shape, changes of possession, crosses, aerial duels and decisions near goal. Also:
- no swarming and no idling when an action is obvious;
- the keeper's AI in every situation;
- `gk.distrib` wired into distribution accuracy and choice (ATTR-1);
- the `gkthrow` and `gkroll` acts (GK-3, AI side).

**Hook requests** (to the integrator; the files have no Phase 9 owner):
- js/life/train/attredit.js: `GK_DISTRIB_LIVE = true`, so the editor shows `distrib` once it changes play;
- qa/tr4-attrs.mjs: the row "Keeper distribution 30 vs 90 | distribution error and completion differ", with the same measurement as tr9-ai.

**Acceptance**
- **`qa/tr9-ai.mjs`** (Node, training scenarios plus 11v11):
  - the swarm metric stays at or below the baseline (101 per 50k team-steps);
  - "obvious idle" (a free ball within 5 m and nobody moving to it for more than 1 s) is 0;
  - the share of shots from beyond 25 m is in its band;
  - pass completion falls in the attribute bands;
  - keeper save percentage is in its band per shot type;
  - **keeper distribution** (ATTR-1; spec 4, "changes affect real behaviour"), over 200 seeded distributions each at `distrib` 30 and 90, everything else equal:
    - the mean landing error from the intended target is at least 1.5 times larger at 30;
    - completion to a team-mate is higher at 90;
    - the choice between throw, roll and kick changes with `distrib` as documented in gkbrain.js's header (for example, a weak distributor kicks long less often to a far target).
- **Harness:** n=1000 bands pass.

---

## Phase 10: First-day fixes, delivery area check and performance

Merge order: P10-A, then P10-B.

### P10-A: First day (about 5 h)

**Owns (existing files)**
- `js/life/firstday.js`, `js/life/furniture.js`, `js/daily.js`, `js/life/core/acts.js`
- `qa/wpH-day.mjs`, `qa/wpG-fridge.mjs`, `qa/wpG-life.mjs`, `qa/wpH2-centre.mjs`, `qa/wpI-delivery.mjs`, `qa/unit/daily.mjs`

**Work.** Fix only what is broken or misleading; no redesign; the intro is not touched.
- **FD-1:** H14's hint becomes "Look at the food, then eat or drink something (E)."
- **FD-2: the bed text matches the real sleep behaviour and hours** (firstday.md section 5):
  - on day one, the bed's hold line in `bedLines` (firstday.js:599-608) and `bedText` (furniture.js:328-348) says that it is not today. It may also hide the hold label while `refuse('sleepDay')` is set (firstday.js:944-948);
  - H15's night line says the real window. Night is from 7:00 PM to 5:00 AM (`isNight`, daily.js:614), so "After 7:00 PM" becomes "Between 7:00 PM and 5:00 AM";
  - H15's nap line gives the nap's energy cost from `sleepPlan('nap')` (−2 at tier 1, daily.js:615-631), as the bed's own prompt already does.
- **FD-3:** after `seen('paid')`, the objective becomes "Pick up your bulb at the end of the counter", pointing at the counter-end drop.
- **FD-6:** energy shows one decimal when it is not whole, in both the tooltip and the eat chip.
- **FD-4:** only if the user chose the literal 30 to 60 minute window at G0.
- **Re-verify** all 14 beats of spec section 7 and the delivery area.
- **FD-5 is not done here.** It is in P11-F, gated.

**Acceptance**
- `wpH-day`, with new checks for the FD-1, FD-2 (all three lines, computed from `sleepPlan`) and FD-3 texts.
- `wpG-fridge`, with the FD-6 strings.
- `wpG-life`: it asserts the exact bed lines (wpG-life.mjs:87-91, including the 24-hour hold line), the barber's states (154-158) and the session lines (241-244), all made by this package's files. It runs with the first day done (lib.mjs:90 `onb = "done"`), where `refuse('sleepDay')` is off (firstday.js:946 needs the first day active), so its 24-hour line must still pass unchanged.
- `node qa/run.mjs unit`, including `qa/unit/daily.mjs`. It asserts the early bonus (`EARLY` at line 96, attendance at 161-177). If FD-4 is chosen at G0, this package updates those expectations; the early bonus is not checked in wpG-life.
- `wpH2-centre` as a full run, not `--quick`, so the G9 lessons are included.
- `wpH-boot`, `wpI-delivery`, `wpH2-ball` and `oldsave`.
- A manual checklist handed to the user: the mouse-circle screw-in, Esc under pointer lock, the real walking routes, and the barber purchase.

### P10-B: Performance (about 11 h)

**Owns (existing files)**
- `js/life/perf.js`, `js/life/core/sched.js`, `js/life/chunks.js`, `js/life/human.js`
- `js/life/football/view.js`, `js/life/football/training.js`
- `js/life/train/runner.js`, `js/life/train/pool.js`
- `qa/perf.mjs`, `qa/record-perf.mjs`, `qa/perf-baseline.json`

**New files:** `qa/tr10-perf.mjs`, `qa/tr10-leak.mjs`.

**Work**
- **perf.js:** add a `cage` view.
- **qa/perf.mjs:** a cage budget, plus body-count, allocation and reset-leak gates.
- **record-perf.mjs (perf-10):**
  - `gfxLow` from `GFX.P.tier`;
  - record the animation of SCHED actors (people).
- **perf-6, allocations:** the literals in view.js `liveSt` and spares, and preallocated `frustumFrom` rows in sched.js.
- **perf-9:** the merge poll runs on a dirty flag.
- **Bone textures:** skip the upload for skinned meshes that were not posed this frame (DESIGN 3.9.8 fallback), if it helps.
- **Humans and shadows by preset: a check, not new work.** perf.md:54-55 measured this policy already holding in the stadium context: no shadow map on Low; statics only on Medium; humans casting at 15 Hz on High. The cage uses that same sky context (P3-A: `SKY.setContext('stadium')`). P10-B verifies it in the cage (tr10-perf below). If a preset differs, the fix belongs in sky.js or quality.js, which nobody owns in Phase 10, so it goes as a hook request of at most 20 lines to the integrator.
- **Budgets:** from `fp/p1/perf.md` section 8, measured with ThreadTime (the perf-3 correction).
- **Full Match in the cage:** measure the 11v11 cage (25 bodies plus substitutes) on Low, and report it against the perf.md budgets. Do not gate on 60 FPS for 11v11.
  - The reference is the skeptic's ThreadTime measurement of the 25-body test match, `fp/p1/vperf/frame2.json`: `threadCpuPerFrame` 3.018 and 3.118 ms in normal views and 4.341 ms in the wide 42-draw view.
  - perf.md's 5.86 ms per frame, "about 45% over" (perf.md:58-60), and its "5.9 ms for 25" (perf.md:157) are wall times that include SwiftShader GPU waits (the perf-3 correction). perf.md itself was never corrected, and its section 7 body budget still divides 5.9 ms.
  - So P10-B re-derives the per-body budget from ThreadTime before using section 7.

**Acceptance**
- **`qa/tr10-perf.mjs`.** The cage with the largest drill the config allows, on Low at 1280x720: 6v6 with me as one of the 12 outfield players, plus a keeper, so 13 agents (G0 decision h):
  - ≤ 45 draw calls, ≤ 80k triangles, 0 point lights, no shadow map;
  - CPU (ThreadTime) for step plus submit: median ≤ 4.5 ms, p95 ≤ 6 ms;
  - the simulation ≤ 0.15 ms per step (in Node). It is also run on a 14-agent stress case built directly with `createMatch`: 12 outfield NPCs, a keeper and me, spec 8's literal "12 NPCs plus GK". That covers the other reading of G0 decision h;
  - ≤ 12 full poses per frame;
  - ≤ 16 KB allocated per frame after warm-up;
  - a reset ≤ 4 ms.
- **Shadows by preset** (in the 13-agent cage):
  - Low: `renderer.shadowMap.enabled` is false and the humans use blob shadows;
  - Medium: the shadow map holds statics only, and no human mesh has `castShadow` set;
  - High: the human shadow pass updates at most 15 times a second over 300 frames.
- **Nothing inactive running** (in `qa/tr10-perf.mjs`; spec 8; perf.md:182-183): with the hub, the config sheet and the preset sheet each open for 300 frames:
  - `renderer.info.render.frame` does not advance;
  - no SCHED actor animates, and no simulation step runs;
  - main-thread CPU (ThreadTime) is ≤ 0.5 ms per frame.
- **`qa/tr10-leak.mjs`.** After 50 resets and 10 enter/exit cycles:
  - `renderer.info`, SCHED, listeners and DOM all +0;
  - timers 0;
  - bodies +0;
  - `MG` entries outside the scene: 0;
  - the heap after GC within +1 MB.
- **qa/perf.mjs:** the life views do not regress against the baseline ratios.
- **Report honestly** that 60 FPS on Low on real hardware is not verified here, and give the user a short manual check (for example an Intel UHD 620 class laptop).

---

## Phase 11: Regression and final report

Sequential: P11-A, then P11-B. P11-F runs only if the user asks.

### P11-A: Full regression (about 7 h)

**Owns:** `qa/full.mjs` and `qa/run.mjs` (both handed over from the integrator for Phase 11, section 0; `run.mjs` gets a `training` group with every `tr*` suite), `qa/golden/*` (re-recorded only with approval), and harness-only fixes in `qa/*.mjs`.

**Runs**
- `node qa/run.mjs unit lint nodash-release oldsave smoke`.
- `node qa/harness.mjs --n 1000`.
- Every `wp*` suite and every `tr*` suite.
- With a career present, "Quit to title", then a career snapshot. Then a full Training session (enter, every category, Full Match, exit). Afterwards:
  - the career diff is empty: every `freyaFootball.v2` key is byte-identical to the snapshot taken after Quit;
  - the write spy logs no `freyaFootball.v2` write between `train:enter` and `train:exit`;
  - `freyaFootball.trainPresets` and `tipFS` hold only what the session saved.
- `qa/unit/trainconfig.mjs`'s "no decorative setting" check, over every config type registered by then (`free`, the scenario types, `fullmatch`, `player`).
- **A preset round trip for every registered type**, in a new file `qa/unit/presetsweep.mjs` (P11-A creates it; `qa/unit/presets.mjs` stays P4-B's). For each type, 20 seeded random valid configs are saved, listed, loaded and compared deep-equal. An old-version and a partial record of each type load as safe defaults. This covers the types whose own suites test the UI path (`free`, `player`, `receive`, `attack`, `defend`, `match`, the free kick, `corner`, `throw`, `penalty`, `fullmatch`) and any type added later.
- `qa/tr4-attrs.mjs` with every row, including the keeper distribution row added in Phase 9: every attribute the editor shows changes play.
- `qa/wpG-life.mjs` and `qa/unit/daily.mjs` (first-day text and the early bonus).
- The career paths again: `wpH-day`, `wpH2-centre` (full run), and `int-fullmatch` with real clicks.

Failures go back as targeted fix rounds to the package that owns the file (see section 12).

### P11-B: Final report (about 3 h)

**Owns:** `fp/FINAL-REPORT.md` and the game's release notes (PATCH text).

**Contents**, per spec section 9:
- the systems inspected and reused;
- the features implemented;
- bugs found and fixed, with their root causes;
- the tests actually run, with results;
- the performance checks;
- known limitations and remaining issues;
- an honest list of what was not tested: real hardware, keyboard lock, mobile (paused), and the manual first-day items.

### P11-F (gated): apartment flash and black boot wait (about 4 h, ONLY if the user asks)

FD-5. The flash did not reproduce on 2026.10.11c: there was no frame of the flat before the film. The measured black-time sources are:
- the synchronous WebGL2 probe on the New Game click, about 4.6 s on SwiftShader with the title frozen;
- 5.6 s of synchronous zone build and warm-up, with the loader text never shown.

**Owns:** `js/ui/main.js`, `js/life/world.js`, `js/life/core/quality.js`, and `js/life/core/modes.js` (only for the optional item below). **Not** `js/life/intro.js`: spec 0 says "Do not touch the intro", and none of the work items needs it.

**Work**
- Paint black, or a loader, before the WebGL2 probe (main.js, quality.js).
- Keep the loader visible while the world builds (main.js, world.js).
- Optionally split the build and warm-up across frames (world.js).
- The intro order is unchanged, and the player stays hidden until created.
- **Optional, asked separately:** the fade part of perf-4, deferred from P3-A. The world tick would also skip drawing under a full black fade, except while `revealPending()` (modes.js), so that no reveal can deadlock: the boot, the intro, the match cards and the test entries. It is offered as its own yes or no, because it changes the boot and intro reveal path. It adds about 1 h.

**Acceptance**
- `qa/wpH-boot.mjs`.
- The screencast probe `fp/p1/fd-boot.mjs`:
  - no frame of the flat;
  - the title never frozen more than 0.5 s after the click;
  - the loader visible during the build.
- `git diff` shows intro.js byte-identical to the base.
- If the optional fade item is taken: every `revealAfterFrames` caller (world.js:298, intro.js:354 and 414, controller.js:283, 348, 976, 985, 1191, 1539 and 1550) still resolves (`tr2-halftime`, `wpH-boot`, `int-fullmatch`, `wpF-match`), and the render count does not grow under a black fade with no reveal pending.

---

## 11. Estimates

| Phase | Package A (h) | Package B (h) | Wall clock with merge (h) |
|---|---|---|---|
| G0 | lead 2 | | 2 |
| 2 Foundations and half time | 13 | 19 | 21 |
| 2b Control, race, shield, tackle | 19 | 14 | 21 |
| 3 Sandbox, cages, hub, cones, runner | 18 | 20 | 22 |
| 4 Config, attributes, presets, pause card, resets, pitch switching | 16 | 19 | 21 |
| 5 Free Play, admin | 12 | 13 | 15 |
| 6 Receiving and team scenarios | 17 | 19 | 21 |
| 7 Set pieces (day-one contract commit first) | 15 | 15 | 17 |
| 8 Full Match | 15 | 10 | 17 |
| 9 Animation and AI | 22 | 15 | 24 |
| 10 First day and performance | 5 | 11 | 13 |
| 11 Regression and report | 7 | 3 (after A) | 10 |
| **Total** | **159** | **158** | **about 204** |
| P11-F (gated, only if asked) | 4 (+1 if the user also wants the optional fade item) | | 4 to 5 |

The first revision of 2026-10-12 added about 45 package hours (162 h to 187 h of wall clock). The extra work was the gaps closed in that revision: the Ctrl guard, the pause card, pitch switching, the 11v11 pool and training host, the runner's admin API, lateral steps, the storage invariant, and the missing acceptance checks.

Revision r4 adds about 27 package hours (187 h to about 204 h of wall clock). Most of it is acceptance work: tr2-startstop, tr4-attredit, the reset digest, the preset round trips, call response, the P9-A state checks and keeper distribution. The rest is the shield challenge and standing reach, the title key path and the Training loader, the kit-grouped pool, and the Free Play behaviours with height and foot in the config.

These estimates assume SwiftShader test runs (slow) and one fix round per phase. A phase whose harness bands move adds 2 to 4 h of calibration.

---

## 12. Requirement traceability (every TRAINING-SPEC item to its package)

| Spec | Requirement | Package(s) |
|---|---|---|
| 0 | Stopped: parody names and nationalities, acrobatics and atmosphere polish. Paused: mobile, save codes. Later: Focus Touch | not built (out of scope; P11-B states it) |
| 0 | Intro order unchanged; player hidden until created | constraint on all; checked by `wpH-boot` in P3-A, P10-A, P11-A |
| 0 | Apartment flash fixed only at the end, only if asked | P11-F (gated; intro.js not touched; the fade part of perf-4 is an optional extra inside it). P3-A's perf-4 leaves the boot and intro path unchanged (`tr3-leak`, `wpH-boot`, `fd-boot.mjs`) |
| 0 | First-day tutorial: verify each beat, fix only what is broken | P10-A |
| 0 | Cages Full/Half/One-goal, fenced rebound; out of play as a setting | P3-A (cage, law, `train:cage`), P3-B (cones follow), P4-A (setting), P4-B (runner switches the cage; `tr4-pitch`) |
| 0 | Full Match always uses real lines and restarts | P8-B (`out` forced to stop; ball-out restarts in `tr8-fullmatch`), P8-A |
| 0 | Admin panel on Numpad 1 / Ctrl+Shift+1, never while typing, Training only | P5-A (keys), P5-B (panel) |
| 0 | Drills up to 6v6 plus an optional AI keeper; Full Match 11v11 | G0 decision h (me counts inside the 6: at most 13 agents), P4-A (limits; the wall counts toward the 6 per G0 d), P3-B (pool of 14 by kit group, no official bodies in drills, `bodies()` = pool + 2; `tr3-runner`), P7-A (`tr7-freekick` wall of 6), P8-A (pool grown for 11v11, training host), P8-B, P10-B (13-agent gate plus a 14-agent stress case) |
| 0 | Keeper always AI, never selectable or switchable, never a role | P2-A (GK-1), P4-A (schema), P8-B (`tr8-fullmatch` keeper checks) |
| 0 | Shield C hold; Ctrl in full screen with keyboard lock; one-time tip | P2b-B (keylock, control, and the D9 guard letting Ctrl through while it shields; `tr2b-shield` moves while Ctrl is held), P2b-A (engine) |
| 1 | One football engine, no training copies | all; lint `train-no-engine-copies` (integrator, Phase 3) |
| 1 | Root causes, no fake mechanics | all; reviewed in P11-B |
| 1 | Sandbox never writes the career; full cleanup on reset and exit | P3-A (hold without a fresh save, write spy, career diff), P4-B (resets), P10-B (leak gate), P11-A |
| 1 | Reuse the existing systems | each package's Reuse list; `effSkill` per G0 decision e |
| 1 | Verify and report honestly | every acceptance list; P11-B |
| 2 | Movement: walk rework, jog, sprint, accel/decel, turning, lateral, stop/restart, jockeying, recovery after tackles; no sliding or snapping | P2-B (walk, stops, clip exits, lateral side steps MV-16; MV-11/12/13 start, stop, turns and backpedal in `tr2-startstop`), P3-A (FOOTBALL profile in the cage), P2b-A (slide recovery), P9-A (jockey, polish; `tr9-anim` MV-9 checks) |
| 2 | Stamina: one model, drains, recovers, never disables | verified working; P2-B regression, P5-B admin hooks, P9-A tired pose |
| 2 | Shooting: no teleport, stats, fatigue, pressure, timing, near-miss, real trajectory and curl | verified working; P9-A strike feet (MV-14) |
| 2 | Passing: all kinds; AI weighs receiver, lanes, defenders, stamina, pressure; no impossible pass | verified working; P2-A (AI-2, ball-10), P6-B |
| 2 | Ball physics including possession changes; animation agrees with the ball | verified working; P2b-A (possession), P3-A (cage), P2b-B and P6-A (animation) |
| 2 | Offside at the moment of the pass; scenarios and AI respect it | verified; P3-A (OFF-1; OFF-3, players walking off no longer hold the line, `unit/offside`), P4-A (onside starts; `unit/trainconfig`), P6-B (OFF-2, AI, TAC-1 and `lineOpp` OFF-3; `tr6-team` onside starts and TAC-1) |
| 2 | Camera smooth, believable eye level, subtle, ball readable, no top-down remnants | P2-B (bob), P2-A (eye height, MV-10; `tr2-scale`), P9-A (camAction); checked in `tr3-runner` (camera owner, eye height, ball size, no jumps) |
| 2 | HUD minimal | existing match HUD; P2-A (MF-11 card hints); P3-B and P4-B (training HUD); checked in `tr3-runner` (at most 10% of the viewport) |
| 2 | Team-mate calls subtle (small name tags, audio, no giant arrows); positional positioning | existing (fphud.js:172, 343-348); checked in `tr6-team-browser` by P6-B, which owns fphud.js in Phase 6 |
| 2 | Half time traced in real use, fixed at the cause, verified after resets | P2-A, P8-A |
| 2 | Keeper AI and believable keeper movement | P2-B (shuffle), P9-A (animations), P9-B (AI) |
| 3 | First to the ball by arrival time; duel within 0.15 s | P2b-A |
| 3 | Control zone R, q, touch distance; automatic control with a foot, thigh or chest animation from the real height | P2b-A (engine), P2b-B (the AI's pass and receive models, brain.js:165 and 196-210; animation), P6-A (animation) |
| 3 | Stat mapping documented (Balance and others derived) | P2b-A (attrs.js) |
| 3 | Shield formula and behaviour (speed cap, far foot, breath, pushing fouls, 50/50) | P2b-A (engine; `ratings` S/D/T/C, `p5050`; shield challenges resolved by `pShieldLoss` in sim.js, item 7a, with fatigue per the G0 reading; `tr2b-race`, `tr2b-shieldsim`), P2b-B (input, AI challenges, pose) |
| 3 | Tackle reach, T vs C logistic, timing, angle, slide momentum and friction, recovery; contact physics; late or behind raises fouls; foot IK to the contact point | P2b-A (engine; standing reach `standReach` = 0.95 + 0.25 Tackling/99; `unit/duel`, `tr2b-tackle`), P2b-B (AI reach, animation; `tr2b-ai`) |
| 3 | Tunables in the admin panel | P2b-A (`tune.js`), P5-B (panel) |
| 4 | Training button on the title; no career; clean exit | P3-B (button, its key path and the title listener off in the cage; loader `js/life/train/index.js`; `tr3-hub`), P3-A (sandbox) |
| 4 | Cage pitches in the same units and geometry; low-poly fence; rebound | P3-A |
| 4 | Hub with 7 categories; name, description, config, Start, reset, back | P3-B, plus registrations in P5 to P8 |
| 4 | Physical cones by category; existing interaction; fixed; one scenario at a time | P3-B (cones), P3-A (anchors) |
| 4 | Shared configuration, only relevant settings, every setting real | P4-A (`tr4-config` table; the no-decorative-setting unit check, run again in P11-A); ball trajectory: P4-A (teams.js `ballInit`), P4-B (runner launch; `tr4-reset`), P6-A (feeder; `tr6-receive-anim`) |
| 4 | Attribute editor: real attributes, presets Low/Avg/High/Max, seeded NPC averages | P4-A (variation per G0 decision f; real-input `tr4-attredit`; `tr4-attrs` behaviour rows for every keeper attribute shown), P9-B (`distrib` wired and shown; tr9-ai) |
| 4 | Presets for every scenario, Free Play and Full Match; persist; validated; config only | P4-B (Save as new and the Load list in `unit/presets` and `tr4-presets`), plus registrations with a round trip in P5-A (`free`; `tr5-freeplay`), P5-B (`player`; `tr5-admin`), P6-A (`receive`), P6-B (`attack`, `defend`, `match`), P7-A (free kick), P7-B (`corner`, `throw`, `penalty`) and P8-B (`fullmatch`; `tr8-fullmatch`); P11-A sweeps every type |
| 4 | Quick menu: Restart, Replay Last, Return to Config, Return to Hub; Reset Half and Reset Match in Full Match | P4-B (pause card on Esc and pointer loss, Backspace; `tr4-reset`, with `RUN.digest()` covering animations, AI states, flags, temporary effects, objects and listeners), P8-A (`restartKickoff`; `tr8-reset`), P8-B (items) |
| 4 | Scenario lifecycle; no full reload | P3-B (runner), P4-B (reset), P8-A (match) |
| 4 | Free Play: Q spawns one ball correctly; optional opponents | P5-A (opponent behaviours stand, jockey and press in brain.js; `tr5-freeplay`) |
| 4 | Admin panel: player, height, stamina, AI, ball, scenario and match, tunables; live or pending | P5-B (panel; Scenario and Match actions in `tr5-admin`), P5-A (`applyLive`, `queueChange`, height at restart, `me.height` and `me.prefFoot` in config.js and teams.js), P8-B (match section; `tr8-fullmatch`) |
| 4 | Training UI small, never covers the ball, free-kick distances | P3-B (thud; `tr3-runner`), P4-B, P6-B, P7-A |
| 5 | Ball Receiving and First Touch (full list, animations) | P6-A |
| 5 | Attacking (full list, instant replay) | P6-B (AI team-mates see me and answer my call: `tr6-team`, `tr6-team-browser`) |
| 5 | Defending (full list) | P6-B (scenarios), P2b-A/B (tackles, shield) |
| 5 | Match scenarios (one framework, full list) | P6-B |
| 5 | Corners | P7-B (plus `cornerPlan` from P7-A; instant replay in `tr7-corner`) |
| 5 | Free kicks: 4-step build mode, wall, indicators, presets, second taker | P7-A (the wall counts toward the 6 defenders, G0 decision d) |
| 5 | Throw-ins | P7-B (rules, plus the view.js and moves.js clip in Phase 7) |
| 5 | Penalties | P7-B |
| 5 | Full Match: real system, kick-off or bench, resets, Return to Hub, never touches the career | P8-A (resets with the full matchflow.md section 6 lists, including `roleDone`/`callUp`, the bench flags and the warm-up; training host; 11v11 pool), P8-B (config type, presets, real restarts, keeper) |
| 6 | Player animation refinement and transitions | P9-A (per-item checks in `tr9-anim`: MV-9 jockey and dribble touches, MV-15 neck, arms, tired, camAction) |
| 6 | Keeper animations | P2-B (shuffle), P9-A (`tr9-gkanim`, including throw and roll) |
| 6 | AI refinement | P9-B (plus P6-B scenario AI; keeper distribution in `tr9-ai`) |
| 7 | First-day beats | P10-A (verify all; fix FD-1, FD-2 (day one, the night window, the nap's energy), FD-3, FD-6; FD-4 on decision; `wpG-life` and `unit/daily` in its tests) |
| 7 | The same created character everywhere | verified in life (firstday.md); Training: P3-A (`trainLook`, body and scale), P8-A (training host look); G0 decision g |
| 8 | Performance: profile, no leaks, efficient updates, nothing inactive running, honest 60 FPS claim | P2-B (ball leak), P3-A (BatchedMesh; perf-4 under Training's own sheets only), P3-B (pool, coach task, hub covers the screen), P4-A and P4-B (sheets cover the screen), P10-B (`tr10-perf` inactive check, shadows-by-preset check, 14-agent stress case; budgets from ThreadTime) |
| 9 | Final report | P11-B |

## 13. Inspection issue traceability (with the skeptic's corrections applied)

| Issue | Status after verification | Package |
|---|---|---|
| MF-1 card under the cover, pointer locked | confirmed; the "2nd kickoff" screenshot was a probe artifact; 60 s auto-advance runs while locked | P2-A |
| MF-2 Esc freezes half time | confirmed | P2-A |
| MF-3 kick-off waits for the player | confirmed; the collect/carry part was read only | P2-A |
| MF-4 full-time card | confirmed; severity raised to blocker; Continue is inside the box but below the fold; the wheel's default is blocked (controller.js:144) and so is Tab's (controller.js:133, matchflow.md:78), so only a scrollbar drag remains | P2-A (item 1 lets both through) |
| MF-5 clicks replayed at the kick-off | not re-verified | P2-A |
| MF-6 skip card under the cover | not re-verified | P2-A |
| MF-7 entering state lost | read only | P2-A |
| MF-8 goal flags not reset | read only | P2-A (flags), P8-A (resets) |
| MF-9 sub enters from the dugout | not re-verified | P2-A |
| MF-10 no in-place reset | confirmed missing | P8-A |
| MF-11 live-play hints over the half-time card | read only (matchflow.md 2.4.d; hud() uses liveMe(), controller.js:738-747); seen in ht-pitch-2nd-kickoff.png | P2-A |
| MV-1 knee snap and foot pop | confirmed; root cause incomplete (the swing start plus the hip notch) | P2-B |
| MV-2 hip plateau and notch, bob | confirmed; evidence numbers corrected | P2-B |
| MV-3 flight phase in the walk | confirmed; interacts with MV-4 and MV-5 | P2-B |
| MV-4 left/right limp | confirmed; the clock is pushed 11 to 17% for the whole R swing | P2-B |
| MV-5 cadence over the table | confirmed; jog +14%; TSW 0.55 fixes it only together with MV-3 | P2-B |
| MV-6 clip-exit pop | confirmed (both branches) | P2-B |
| MV-7 keeper ready stance slides | confirmed; about 1.8 m per foot over 1.5 s | P2-B |
| MV-8 no intent to the gait | confirmed | P2-B |
| MV-9 jockey, shield, dribble-touch animation | confirmed missing | P2b-B (shield), P9-A (jockey, dribble touch) |
| MV-10 career agents at scale 1 | confirmed; the eye height also jumps at the match switch | P2-A |
| MV-11 life walk starts and stops too fast | confirmed | P2-B (`tr2-startstop`) |
| MV-12 third-person yaw lag | not re-verified | P2-B (`tr2-startstop`) |
| MV-13 heel skim, backpedal toe drag | not re-verified | P2-B (`tr2-gait` heel row, `tr2-startstop` backpedal) |
| MV-14 strike root, tackle foot, slide speed | partly confirmed via ball-7 | P2b-A (slide), P2b-B (tackle foot), P9-A (strikeRoot) |
| MV-15 FP body neck and arms, cameras, tired | the tired mode is never requested at all | P9-A |
| MV-16 no side steps in first person at 0.8 m/s or more | inspector's measurement (movement.md 2.9: hips twist up to 1.1 rad, gait.js:65, 431-434); not re-verified | P2-B |
| ball-1 receiving on the move | confirmed; plus the plan wipe of the receive plan and first-time strikes | P2b-A (touch), P2-A (plan wipe) |
| ball-2 no race or duel | confirmed | P2b-A |
| ball-3 possession lock | confirmed; two counts exist: the verifier's `lockSteps` 693 and 1058 (`verify-ball/v3-seed7.out:13`, `v3-seed8.out:12`) and the inspector's looser 888 and 1335 (ball.md:35-37) | P2b-A (`tr2b-race`: 0 on the v3 metric) |
| ball-4 AI shield NaN | confirmed; a pressed carrier picks below-par options (mostly dribble), not hold | P2b-A (Strength), P2b-B (brain) |
| ball-5 no player shield; C is scan | confirmed | P2b-B |
| ball-6 tackle outcome geometric | confirmed; tackling also changes slide travel, the keep chance and the AI timing | P2b-A |
| ball-7 slide ignores momentum and recovery | confirmed | P2b-A |
| ball-8 no loose-ball tackle | confirmed; F with no carrier is silently swallowed | P2b-A, P2b-B |
| ball-9 Tab and Q in a match | confirmed | P2-A |
| ball-10 "In behind!" skips offside | not re-verified | P2-A |
| ball-11 animation thresholds differ from the sim | not re-verified | P2b-B, P6-A |
| ball-12 Numpad1 is "1"; no keyboard lock | confirmed | P2b-B (keylock), P5-A (admin key) |
| ball-13 the D9 guard drops every press while Ctrl is held, so Ctrl cannot shield while you move | confirmed by reading (controller.js:129, 135-136; control.js:126-138; training.js:348) and a Node probe (`fp/p1/gapfix/modguard.mjs`: D, Shift, Space, R and C are all dropped with `MOD.on`) | P2b-B |
| AI-1 AI never shields | confirmed; the stance appears without hold; shield equals hold in movement; no pose | P2b-A, P2b-B |
| AI-2 mates steal passes to the player | confirmed | P2-A, P3-B (coach feeds; checked in `tr3-runner` and `wpI-session`) |
| AI-3 shots at ends with no goal | confirmed; already in the shipped rondo | P6-B |
| AI-4 small sims shot-happy | not re-verified | P6-B |
| GK-1 player made keeper | confirmed (career only today); gkStep at sim.js:338-339 | P2-A |
| GK-2 keeper shuffle slides | confirmed | P2-B |
| GK-3 keeper throw/roll and catch/punch unused | not re-verified | P9-A (animation; `tr9-anim`, `tr9-gkanim` throw and roll), P9-B (acts) |
| OFF-1 offside edge cases in partial areas | not re-verified | P3-A |
| OFF-2 no offside notice in training | not re-verified | P6-B |
| OFF-3 players walking off still hold the offside line | read (ai.md:115; rules.js:126 filters only `onPitch` and role, and `walkOff` keeps `onPitch` true until the exit, rules.js:934, 1054-1056; tactics.js:115 has the same gap); not probed | P3-A (rules.js), P6-B (tactics.js `lineOpp`) |
| TAC-1 anchor cap with offside off | not re-verified | P6-B (`tr6-team` TAC-1 checks) |
| ATTR-1 missing stats, distrib unused, AI floor | not re-verified | P2b-A (stats), P4-A (seed, floor; `distrib` hidden until wired), P9-B (distrib; `tr9-ai`, the `tr4-attrs` row) |
| SIM-1 cage support gaps | not re-verified | P3-A (spec, law), P3-B (host, reset, pool) |
| INF-1 no career-free world | confirmed; the ground zone cannot build without `S` at all | P3-A |
| INF-2 Q and Tab in every mode | confirmed; with `S` null, Q soft-locks; Tab is the overview in match and train per DESIGN | P2-A |
| INF-3 no rebound law; prediction ignores fences | confirmed | P3-A |
| INF-4 career leaks after Quit | confirmed; some paths conditional (autosync only when signed in, fp-resume only in mode life) | P3-A |
| INF-5 training bound to the career | confirmed | P3-B |
| INF-6 admin key undetectable | confirmed; lint covers only `js/life/football`; the controller capture listener swallows modified keys | P5-A |
| INF-7 cage pieces missing | not re-verified | P3-A |
| INF-8 exit-to-title cleanup | not re-verified | P3-B |
| INF-9 no presets, resets or QA helper | not re-verified | P4-B, P8-A, P3-A |
| INF-10 no pause in drills: Esc and pointer loss call quit() | confirmed by reading (training.js:345, 354; only lessons pause, world.js:431) | P4-B (pause card in Training Mode) |
| INF-11 the controller's host needs a career | confirmed by reading (controller.js:238 calls HOST.look(); tunnel.js:118 reads G().player.look inside a try/catch that calls console.error); not probed | P8-A |
| INF-12 the career storage invariant: a save on entry and the play clock break a before/after diff | confirmed by reading (career.js:37-39 meta at: Date.now(), 140 saveNow; 74-79 PLAY_T); the title-time growth was probed (traininginfra.md:36-38) | P3-A (hold without a fresh save, write spy, career diff), P3-B (Quit stops the play clock) |
| INF-13 the movement profile in a new zone is LIFE | read (core/move.js:110; traininginfra.md:82-84) | P3-A |
| FD-1 H14 text | not re-verified | P10-A |
| FD-2 bed text on day one; the night window and the nap's energy | not re-verified (firstday.md section 5, firstday.js:599-608, daily.js:614-631) | P10-A |
| FD-3 H6 objective | not re-verified | P10-A |
| FD-4 early bonus upper bound | not re-verified; user decision | P10-A (on decision) |
| FD-5 boot black wait (flash not reproduced) | not re-verified; user-gated | P11-F |
| FD-6 rounding | not re-verified | P10-A |
| perf-1 BatchedMesh textures | confirmed; 2 textures per batch; status partial (renderer.info drift) | P3-A |
| perf-2 ball leak per view | confirmed; the heap growth is mostly JIT; GL geometries +1 per drawn ball | P2-B (ball), P3-A (MG.still) |
| perf-3 over the CPU budget | refuted as stated: CPU is about 3.0 to 3.1 ms typical and 4.3 ms wide, not 5.9 (`vperf/frame2.json` threadCpuPerFrame 3.018, 3.118 and 4.341); render submit is over its 1.5 ms split. perf.md:58-60 and 157 still show the wall figures | P10-B (ThreadTime gates) |
| perf-4 render under the cover | not re-verified. Skipping the render under the fade would deadlock every `revealAfterFrames` (modes.js:119-130 resolves only from `framePresented`, world.js:237), so the plan skips only under Training's `screenCover` sheets | P3-A (sheets only); the fade part optional in P11-F |
| perf-5 proj forced layout | not re-verified | P2-A |
| perf-6 allocations | not re-verified | P10-B |
| perf-7 body rebuild hitch | not re-verified | P3-B (pool), P10-B |
| perf-8 private fixed-step accumulators | not re-verified | P3-B |
| perf-9 merge poll, train-coach, squad in drills | not re-verified | P3-B (coach), P10-B (merge poll) |
| perf-10 perf baseline gaps | not re-verified | P10-B |

"Not re-verified" means the skeptic did not check that claim. It rests on the inspector's evidence (code reading or probe), and each package confirms it before fixing.

## 14. Hot-file schedule (who owns what, phase by phase)

| File | 2 | 2b | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| football/controller.js | A | B (guard line) | | | | | | A | A | |
| football/brain.js | A | B | | | A (practice behaviours) | B | A | | B | |
| football/rules.js | A | | A | | | | B | | | |
| football/sim.js | A | A | | | B | | | A | | |
| football/view.js | B | B | B | | | A | B | A | A | B |
| football/actions.js, touch.js | | A | | | | A (touch) | B (actions) | | A (actions) | |
| football/control.js | | B | | | | A | | | | |
| football/fphud.js | A | B | | | | B | | | | |
| gait.js, human.js | B | | | | | | | | A | B (human) |
| moves.js | | B | | | | A | B | | A | |
| core/me.js | B | | A | | A | | | | A | |
| core/move.js | B | | A | | | | | | | |
| world.js, chunks.js | | | A | | | | | | | B (chunks) |
| core/modes.js, core/quality.js | | | A (one export each) | | | | | | | |
| career.js | | | A | | | | | | | |
| football/training.js | | B (guard) | B | B | | | | | A | B |
| train/runner.js | | | B | B | A | B | | | A | B |
| train/pool.js | | | B | B | A | | | A | | B |
| train/hub.js | | | B | A | A | | | B | | |
| train/config.js, train/teams.js | | | | A | A | | | | | |
| train/index.js | | | B | integrator | integrator | integrator | integrator | integrator | integrator | integrator |
| css/train.css | | | B | A | B | B | A | B | | |
| index.html, lint-rules.json | integrator in every phase | | | | | | | | | |
| qa/run.mjs, qa/full.mjs | integrator in phases 2 to 10; P11-A in Phase 11 | | | | | | | | | |
