# Legend Rising: what works, what doesn't, and what is missing

This is the check-up we did before building Training Mode and reworking the football. We went through the game area by area, reading how it is built and playing it in a test browser. Every claim below was checked a second time by a separate reviewer, except two added in a later review of the plan, which say how they were found. Where the second check changed the picture, this report uses the corrected version.

A few things to know first:
- We checked a frozen copy of the current game (build 2026.10.11c). Nothing in your game folder was changed.
- The test browser draws graphics in software, without a graphics card. Speed numbers are therefore rough guides, not what your own computer will do.
- Each area is split into what already works, what partly works, what is broken (with the real cause in one sentence) and what is missing.

**In short:** the football engine underneath is in good shape (ball physics, shooting, passing, the keeper's decisions, offside, stamina). The serious problems are:
- the half-time screen, which can freeze a match;
- receiving the ball while running;
- AI team-mates taking passes meant for you;
- the walk, which is janky for clear, fixable reasons;
- Training Mode itself, which does not exist yet: the 3D world cannot even start without a career loaded.

---

## 1. Match flow: kick-off, half time, full time, bench and substitutions

**What already works**
- Getting to a match works, from the career and from test matches, with no errors: tunnel, dressing room, walk-out and kick-off.
- The match clock is correct, including added time and the end of each half. The clock stops for half time and nothing moves during the break.
- Once you get past the half-time card, the second half is set up correctly. The teams swap ends and the other team kicks off. A player on the bench keeps his seat and his view.
- Watching from the bench works, and so does holding E to skip ahead. The skip carries on by itself after half time.
- Coming on as a substitute works. You take over cleanly, the player you replace leaves the pitch, and there is never a second copy of you.
- When a match ends, everything that belonged to it is removed: its on-screen elements, cameras and background listeners.

**Partly working**
- **Full time.** The result is worked out correctly, but leaving the full-time screen is a problem (see Broken).
- **Coming on as a sub.** You are swapped on from wherever you happen to stand, even the dugout, instead of from the fourth official.
- **Crash recovery.** The match saves checkpoints as it goes, but after a reload the rest of the match is played without you. We only read this part; we did not run it.
- **Leftovers between halves.** A few bits of match state are never cleared. A goal scored right on the half-time whistle could replay at the second-half kick-off, or carry over into the next match. We found this by reading only.

**Broken**
- **The half-time card is invisible and cannot be clicked.** Cause: the game puts a black curtain over the screen and draws the card underneath it, and it keeps hold of the mouse, so your clicks land on the pitch, not the button.
- **Pressing Esc at half time freezes the break forever.** Cause: the timer that starts the second half on its own after 60 seconds only runs while the game is not paused. Esc pauses it without showing any pause screen or way back.
- **A kick-off can wait forever when you are your team's only striker.** This happens in the second half or after you concede. Cause: the backup rule that should hand the kick-off to a team-mate after 25 seconds picks you again, and the "Take it." reminder at 12 seconds was never added.
- **The full-time card is hidden too, and hard to leave.** It has no timer, and on a 720p screen its Continue button sits below the bottom of the screen while the mouse wheel cannot scroll down to it. Cause: the same curtain and mouse problem, plus the match blocks every wheel scroll.
- **Clicks on the hidden half-time card come back later.** They fire as a tackle or a shot at the second-half kick-off. Cause: your inputs are not cleared when the second half starts.
- **The live score card on the bench is hidden.** While you skip ahead on the bench you only see black, because of the same curtain.
- **A sub's walk-on is forgotten at half time.** A substitute who was already walking to the touchline loses that progress over the break. We found this by reading only.
- **The hints under the half-time card are for live play.** While the card is up, the corner hints still say things like "R call for it" and "Shift sprint". Cause: the hints are worked out from your player as if play were live. We found this by reading, and it shows in one test screenshot.

**Missing**
- **Match resets.** Reset Match, Reset Current Half and Restart from Kickoff do not exist. Today the only way to restart a match is to leave it and reload the whole stadium.

## 2. Movement and animation

**What already works**
- **The movement engine underneath** behaves as designed: speed, acceleration, stopping, turning and sharp cuts. At average pace your top sprint is 8 m/s and you reach nearly full speed in about 2.5 seconds. A 90 degree cut costs about half your speed.
- **Stamina** is one shared model with sensible numbers:
  - a full sprint empties you in about 10 to 15 seconds, depending on your Stamina stat;
  - you get your breath back in a few seconds standing or walking;
  - being tired slows you down and makes touches and shots worse, but never stops you from doing anything.
- **Planted feet stay put** during ordinary walking and running.

**Partly working**
- **The walk.** This is the janky walk you noticed. The cause is in the walking code itself, not in the playback speed. On every step:
  - the knee of the lifting leg snaps about 17 degrees in a single frame, and the foot pops up 3 to 4 cm;
  - the hips hang at the top, then drop about 1 cm in one frame. The first-person camera follows the hips, so your view dips and bounces on every step;
  - for a moment once per stride both feet are off the ground, which never happens in a real walk;
  - left and right steps take different amounts of time, which reads as a slight limp;
  - the legs step too fast: about 7% too fast walking, and 11 to 14% too fast jogging and sprinting.

  These problems are linked and have to be fixed together. We tested fixing the step speed on its own, and it made the "both feet in the air" problem worse.
- **Starting and stopping a walk.** The body speeds up and stops faster than one step takes. You glide off before your first foot lands, and your legs keep stepping after you have stopped.
- **Setting off in third person.** Starting in a new direction can show a few backwards steps and a jerk in the hips.
- **Moving sideways in first person.** Above a slow walk there are no side steps. The hips twist up to about 63 degrees and the legs walk diagonally, where the design asked for at most about 46 degrees plus side steps. This comes from the first check-up's measurements; the second reviewer did not re-check it.
- **Stopping in matches and training.** Players stop late and never plant hard to brake. The animation is told how fast a player is going, but not that he wants to stop.
- **The keeper's shuffle.** His ready stance slides across the grass whenever he shuffles or repositions; each foot slides about 1.8 m in 1.5 seconds at a slow shuffle. Cause: a frozen pose is used while he moves.
- **Height.** In career matches every player is simulated at the same height, but drawn at his real height. Where the ball meets the body therefore does not match what you see, and your eye height jumps when a match starts. Training already uses real heights.
- **Shots and tackles.** The feet skate a few centimetres on each strike. Tackles always use the right foot and aim at where the ball was when the tackle began.

**Broken**
- **Coming out of any action pops the legs.** After a shot, pass, header or tackle, the legs jump into place in a single frame when you start running again. Cause: the walking code remembers where you were before the action began, and it is not blended back in.

**Missing**
- **Player animations that do not exist yet:**
  - a proper jockeying stance (today you jockey with a twisted forward run);
  - a shielding pose;
  - dribble touches by the foot you can see (the ball is nudged on an invisible rhythm);
  - stagger, getting up and tired animations;
  - feints.
- **Keeper animations.** Catch, collect, punch and tip animations exist but are never used, and keeper throws and rolls have no animation.

## 3. Ball control, receiving, shooting, passing, shielding and tackling

**What already works**
- **Ball physics.** Flight, spin and curl, bounces, rolling, posts and crossbar, the nets, deflections off bodies and blocks all work. In thousands of test shots the ball never passed through a post.
- **Shooting.** A less accurate player misses close to where he aimed, not wildly. From 20 m, an accuracy 40 player misses by about 85 cm on average, and an accuracy 90 player by about 24 cm. Flight paths, travel time and curl are real.
- **Passing.** Accuracy follows the stats. The AI's choice of pass weighs passing lanes, nearby defenders, stamina and offside.
- **No teleporting.** The ball is never moved to fit an animation; animations reach for where the ball really is.
- **First touch standing still** follows Ball Control: a poor player takes a heavy touch, a good one a tight touch.
- **Contact.** Bumps between players and interceptions work.

**Partly working**
- **Who gets a loose ball.** Whoever is nearest within a fixed reach of about one metre wins it, and that reach covers all the way round the body, behind included. There is no race to the ball and no 50/50 contest.
- **Standing tackles** are decided by geometry alone:
  - a weak tackler (40) still wins the ball about two times in three from the front against a great dribbler (90);
  - the angle of approach makes no difference to winning the ball.
- **Slide tackles** start at the same speed whatever your run-up, always keep you busy for 1.9 seconds, and Agility makes no difference.
- **Headers** always hit the ball hard. There is no cushioned header to bring the ball under control.
- **Receiving and tackling animations** start at different distances from the ones the game actually uses.

**Broken**
- **Receiving on the move.** A sprinting or jogging player who receives a pass loses it within a second. There are two causes:
  - the first touch ignores how fast you are running, so the ball is left behind you;
  - every few frames, the team-mate planning wipes your plan to receive the ball. That also cancels any first-time shot or pass you lined up.
- **Possession is locked.** Once someone has the ball, nobody else can touch it until it is 2.4 m away, even an opponent standing closer with the ball at his feet. In test matches this happened 60 to 80 times a match.
- **The AI never shields the ball.** Cause: it looks up a Strength stat that does not exist, gets a broken number, and silently drops the option.
- **Tab and Q in a live match.** Tab opens your phone and Q opens the hub, on top of the match.

**Missing**
- **Shielding for you.** C is currently the shoulder check, and there is no shield.
- **The new formulas** from the spec: the control zone, the race to the ball, shielding and tackling.
- **Challenging a loose ball.** You can only tackle someone who has the ball. Pressing F next to a loose ball does nothing and shows nothing.
- **Three stats.** Strength, Balance and Defensive Awareness do not exist.
- **Ctrl to shield in full screen.** This needs a full-screen keyboard lock, which the game does not have. There is a second obstacle: today any key pressed while Ctrl is held is ignored on purpose, so that browser shortcuts never turn into football actions. We confirmed this with a small test: with Ctrl down, A, D, Shift, Space, R and C presses are all dropped. So even with the lock, you could not turn, sprint or call while holding Ctrl to shield until that rule lets Ctrl through in full screen.
- **Numpad 1.** Today it is read as a plain "1", which means "low contact" in matches. The admin shortcut will need it treated as its own key.

## 4. Team-mates, opponents, goalkeeper, rules and player stats

**What already works**
- **One shared football simulation** that plays out the same way every time from the same starting seed. It can already run small partial games; the current training drills use it.
- **Team play.** Team shape, pressing (usually one player presses with another covering), marking, support runs, and runs in behind that respect offside all work. Tests showed no swarming round the ball and no loose balls left unchased.
- **The keeper's decisions:** positioning, reading shots, diving, catching and parrying, coming for crosses, getting up and penalties. All keeper tests pass and he never teleports.
- **Offside** is judged at the moment the ball is played, against the correct second-last defender (keeper included).
- **Rules per mode.** Each game or training mode can switch rules on and off: offside, cards, substitutions, half time.
- **Your career stats** reach the match correctly, including tiredness, nerves and the warm-up boost.

**Partly working**
- **Small games are too keen to shoot.** In a 3 against 2 from 30 m, all 30 test runs ended in a shot instead of a pass to a free winger. Cause: the shooting eagerness tuned for full matches is reused.
- **Offside in small areas.** With fewer than two defenders, the offside line falls back to halfway. In half-pitch areas, the middle of the area is treated as halfway.
- **Attackers stop at the offside line even when offside is off.** In a "keeper with no defenders" drill this keeps them about 31 m from goal.
- **A player walking off still counts for offside.** A substitute or injured player leaving the pitch still holds the offside line until he reaches the exit, so an attacker beyond the real line can be judged onside. We found this by reading the code; we did not run it.
- **No offside message in training.** Matches show one; training does not.
- **Stats.** The game's 15 real skills all work, but:
  - the keeper's Distribution stat does nothing;
  - AI players' stats cannot go below 20.

**Broken**
- **AI team-mates chase and take passes meant for you.** Cause: when the game plans who goes for a pass, it leaves you out, so the nearest AI team-mate is told to chase every pass played to you. In tests, a team-mate standing near the passing line took the ball 8 times out of 8.
- **You can end up in goal, with the keeper AI steering your body.** This happens in career matches when the keeper is sent off, or injured with no changes left: the choice of emergency keeper does not skip you. It happened in 8 of 30 test matches. It cannot happen in training today, but it would once your own side can have a keeper.
- **The AI shoots at an end with no goal.** In areas with only one goal, it shoots at the empty end anyway. This already happens in the rondo drill in the current game.

**Missing**
- **Three stats:** Strength, Balance and Defensive Awareness.
- **A rebound rule.** A training scenario has no way to make the ball bounce back off a fence instead of going out.

## 5. Training Mode groundwork

**What already works (ready to reuse)**
- **The walk up and press E system** works and is ready for the cones.
- **Menus, pop-up sheets, confirmation boxes and settings rows** are ready to reuse.
- **Fences.** The fences behind the stadium boards bounce the ball correctly. A roof works too, as long as the fence is as tall as the roof.
- **The current training drills** already run on the real match engine, with the real controls, camera and on-screen display.
- **A full 11 against 11 test match** can already be started from code, with no fixture, calendar or career rewards. It still runs inside a loaded career's 3D world, because the world will not start without a career (see Broken).
- **Graphics presets and quality settings** will work unchanged in a cage.

**Partly working**
- **The title's small buttons and the keyboard.** If you move to the full-screen or Settings button with Tab and press Enter or Space, the game starts your career before the button can do its job. The title starts the game on any key, and only mouse clicks on its buttons are exempt. We found this by reading; the new Training button will need the keys exempt too.
- **The current training is tied to the career and the training ground.** It uses your career stats, your squad, your coach and the training ground's pitch, and it pays out career rewards.
- **Esc ends a drill.** Pressing Esc, or losing the mouse, ends the current drill at once. There is no pause screen, so Training Mode's quick menu needs one built. Only the first-day lessons pause.
- **Walking on a new pitch.** Outside the training ground, you walk with the everyday walking settings, not the football ones. A cage would need the football ones.
- **Pitch markings for part of a pitch.** A half pitch or small area would currently be drawn as a complete mini pitch, with a corner flag in every corner.
- **Saving without a career.** The save system does nothing when no career is loaded. That is exactly what a sandbox needs, but it has never been used that way.
- **Every save stamps the time.** Saving writes the current time into the save's summary, even when nothing else changed. So "Training never touches your save" cannot be checked by comparing the save from before Quit to title. The build plan instead checks two things:
  - nothing writes to the save while Training runs;
  - the save is unchanged between just after Quit to title and the end of the session.

**Broken**
- **The 3D world will not start without a career,** and several parts crash without one: dropped items, the compass and the training ground's closing time. The training ground itself cannot be built without a career at all.
- **Q and Tab open the hub and phone in every mode.** With no career loaded, pressing Q gets you stuck: nothing changes on screen and every key is ignored.
- **A match needs a career for your look.** When a match starts, the game asks the career for your character's look. With no career loaded, that lookup fails and writes an error to the browser console. We found this by reading; we did not run it.
- **Quitting to the title leaves the career running in the background.** The play-time counter keeps counting: about 6 seconds were added in 6.5 seconds on the title. If Training ran in the same world, some actions in it could write into the career.

**Missing**
- **Everything you would see:**
  - the Training button;
  - the hub;
  - the cages and cones;
  - configuration and presets;
  - the quick menu;
  - the admin panel;
  - Free Play;
  - every scenario.
- **A "ball bounces off the cage" rule.** Today the ball always goes out and a restart begins. The AI's guess of where the ball will go also ignores fences: it expects the ball to fly 70 m out straight through them.
- **A place to store presets.**
- **A way to detect the admin shortcut.** The game's key handling strips Ctrl and Shift, and reads Numpad 1 as a plain "1".
- **Test tools that prove Training never touches your save.**

## 6. First day

**What already works**
- Nearly every beat in the spec checks out:
  - the bulb: EUR 3, the belt, the card reader and screwing it in;
  - the mailbox and the notice board;
  - the fridge tooltips: only with the door open, real values, and the power cut shown;
  - the hand and two pockets;
  - the phone and ordering food;
  - the apartment ball as a real physical ball;
  - the neighbourhood and the compass;
  - the 10:00 training rule, with the bus available from 9:20;
  - the early-arrival bonus: at most 3 per week, and only with a full session;
  - choosing a hairstyle at creation, and owning it afterwards at the barber;
  - the same created character everywhere;
  - the training centre delivery counter, with the bag going to the gym fridge.
- All four existing first-day tests pass.

**Partly working (wording only)**
- **The fridge step.** It says "Look at the food.", but it only finishes when you eat or drink something.
- **The bed.** It explains holding E to sleep for 24 hours, but on day one that is refused ("Not today. The club expects you."). It also says a tap after 7:00 PM means a night's sleep, but a tap up to 5:00 AM does too. And the nap line leaves out that a nap costs 2 energy, which the bed's own prompt does show.
- **The bulb.** After you pay for it, the goal still says "Pay for the bulb" until you pick it up from the end of the counter.
- **Early arrival.** The bonus is also paid for arriving more than 60 minutes early. It is still limited and cannot be abused.
- **Food energy** is shown rounded: "+4" when you really get 3.5.

**Broken:** nothing.

**Not tested:**
- screwing in the bulb with the mouse circle (the test used the keyboard);
- pressing Esc while the game holds the mouse;
- walking the real routes on foot;
- buying a cut at the barber;
- the training lessons.

## 7. Performance on low-end computers

**What already works**
- **Graphics presets.** Low, Medium and High apply correctly. Low switches off shadows and extra lights.
- **Distant and hidden players** are animated less often, with a cap on how many get a full pose per frame.
- **The hub and the title screen** stop the 3D world.
- **The football simulation is very cheap:** about 0.06 ms per step for 22 players. A cage with 13 players costs almost nothing.
- **Draw calls** stay low (33 to 37) on every preset during a full match.
- **Cleanup.** Listeners, timers, player bodies and on-screen elements are cleaned up between matches and drills.

**Partly working**
- **A full 11 against 11 on Low** costs about 3 ms of processor time per frame in normal views, and about 4.3 ms in wide views, against a 4 ms target. That is borderline, not badly over. An earlier figure of 5.9 ms turned out to include time the test machine spent waiting for its software graphics. Drawing the picture is the bigger half of the cost.
- **Temporary memory.** About 157 KB is created every frame, which can cause small hiccups on weak machines.
- **Rebuilding the bodies** for each reset costs a visible hitch: 7 to 11 ms on the test machine.

**Broken (memory left behind)**
- **Every change of area leaves small graphics pieces behind,** about 100 per trip between home and the training ground. Cause: the merged scenery is removed without being freed.
- **Every match or drill leaves its ball behind in graphics memory.** Cause: each one makes a new ball and never frees the old one.

**Missing**
- **Tests:** a speed test for training or a cage, and a memory test for repeated resets.
- **Pausing the drawing** while the screen is fully covered. The game still draws behind black fades. Training's own full-screen menus (the hub, the scenario settings and the presets) will stop the drawing. We will not change it behind black fades for now: the start of a new game and the intro depend on frames drawn behind the black, and you asked us to leave that area alone until the very end.

**Not tested:** real hardware. Every number here comes from the software renderer.

---

## Biggest problems found

1. **Half time and full time can freeze a match.** The card is hidden under a black curtain, the game keeps hold of the mouse, and pressing Esc stops the half-time timer.
2. **A kick-off can wait forever** when you are your side's only striker.
3. **Receiving on the move loses the ball,** and first-time shots or passes you line up get cancelled.
4. **AI team-mates take passes meant for you.**
5. **The walk is janky** for several linked reasons: knee snap, hip drop, a bouncing camera, both feet in the air, a slight limp and legs stepping too fast.
6. **The legs jump** every time you go from a shot, pass, header or tackle back to running.
7. **Possession is "nearest wins" and then locked.** There is no race to the ball, no shield, and tackles ignore the stats and the angle.
8. **You can be forced into goal** after your keeper is sent off in a career match.
9. **The 3D world cannot start without a career.** Q and Tab also open the phone and hub during matches, and can lock you up when no career is loaded.
10. **The keeper slides** in his ready stance, and his catch and punch animations are never used.
11. **Memory is left behind** on every change of area, and every match or drill leaves its ball behind.
12. **The AI shoots at goals that are not there** in small areas, and small games are far too shot-happy.

## The half-time bug: verdict

**Confirmed.** We found the real causes and saw them happen in the test browser. Four things combine.

1. **The black curtain.** At half time the game covers the screen with black and then draws the half-time card underneath the black, so all you see is a black screen. It also keeps hold of the mouse, so a click goes to the pitch behind, not to the "Second half" button.
2. **Esc stops the clock.** If you touch nothing, the second half starts by itself after 60 seconds. But if you press Esc, which is the natural thing to do when stuck, the 60-second timer stops for good. No pause screen appears, and clicking anywhere except exactly on the invisible button does nothing. The second half never starts. This matches what you saw.
3. **A separate cause, at the kick-off.** If you are your team's only striker and your team kicks off the second half (or kicks off after conceding), the kick-off waits for you forever. The backup rule meant to let a team-mate take it after 25 seconds picks you again, and the "Take it." prompt was never added.
4. **The same at full time.** Full time has the same curtain problem but no timer at all. On a 720p screen its Continue button is below the bottom of the screen, and the mouse wheel cannot scroll down to it.

The football side of half time is correct. The clock stops, the teams swap ends, the other team kicks off, the bench seat is kept and the skip carries on. The problem is only the screen and the controls around it.

The existing tests missed this because they press the buttons directly through code. That ignores both the black curtain and the captured mouse. The fix is the first job in the build (Phase 2), and the new tests click with the real mouse while the game holds it.

## The apartment flash before the intro

On the current build we could not reproduce it. In a recording of a new game starting, the screen goes from the title to black, then straight into the opening film. There is not a single frame of the flat, and the film's camera is in charge from the very first frame drawn.

What does happen is a long black wait. On the slow test machine:
- the title froze for about 4.6 seconds after clicking New Game while the game checked the graphics;
- then building the world took about 5.6 seconds with nothing shown;
- then the film's fade-in stretched to about 10 seconds.

We have not tested this on a real graphics card. As you asked, nothing about it will be changed until the very end, and only if you tell us to. If you still see the flat on your own computer, tell us then.

## What we could not check

- Anything on real hardware: speeds and 60 FPS on Low.
- Full screen with the Ctrl keyboard lock. The test browser cannot do it reliably.
- Crash recovery during a match, and a goal on the half-time whistle replaying. We read the code for these but did not run them.
- Starting a match with no career loaded, and the half-time hints. We read the code for these but did not run them.
- Players walking off still counting for offside, and Enter on a focused title button starting the career. We read the code for these but did not run them.
- Holding Ctrl to shield while moving. We ran the key-handling code on its own, outside the browser; full screen with the keyboard lock was not tested.
- On the first day: the mouse-circle bulb screwing, Esc while the mouse is held, real walking routes, the barber purchase and the lessons.

## Decisions we need from you

1. **Where the shoulder check goes.** The spec makes C the shield key, so the shoulder check has to move. We suggest V (hold), which does nothing in matches today.
2. **Early arrival.** Should the bonus stay as it is ("present from 9:30", so arriving even earlier still counts), or only be paid for arriving 30 to 60 minutes early?
3. **"Restart from Kickoff" in a Full Match.** We suggest it means: keep the clock and the score, and line both teams up for a fresh kick-off in the current half. Reset Current Half and Reset Match then remain the clean resets.
4. **Unfinished changes.** Some changes from the previous round (the shot wind-up and walking fixes) are still sitting unsaved in the game folder, and the walk rework touches the same files. They need to be finished and saved, or set aside, before the build starts.
5. **The free-kick wall and the 6 against 6 limit.** We suggest the players in the wall count as part of the defending side's 6. With a wall of 6 there would be no other outfield defenders. The alternative is a wall on top of 6 defenders, which goes past the 6 against 6 limit you set.
6. **Your stats in Training.** The spec says to reuse the career's match-day skill numbers. Without a career loaded they are all zero, so they cannot be used. We suggest:
   - with a career loaded, Training starts from your career's skills as they stand that day;
   - without one, it starts from the editor's average values;
   - either way, the same stat system turns them into the numbers the football uses.
7. **How much AI players vary.** "Average 50" today means players of different roles land anywhere from about 37 to 62. A centre-back is a better tackler than a striker, plus a small personal wobble of up to 6. We suggest keeping that, since it is how real matches work, and saying so on the settings screen. The alternative is a flat ±6 around the average for training only.
8. **Your character in Training on a fresh start.** When a career is loaded, Training shows your created character. If you open the game and go straight to Training without loading a career, we suggest a default look. The alternative is to read your last career's look from its save without loading it, which is slower.
9. **Do you count in the 6 against 6?** We suggest yes: you are one of your side's players, the way "1 v 1" and "2 v 1" count you. A drill then has at most 12 outfield players including you, plus an optional keeper, so at most 5 AI team-mates when you attack with a full side. The alternative is up to 6 AI team-mates plus you. Speed is tested for that larger case either way.
