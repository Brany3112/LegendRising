# First day and life systems: verification against TRAINING-SPEC section 7

Snapshot inspected: scratchpad/p1tree/LegendRising (committed HEAD, build 2026.10.11c). Read-only; nothing in the
tree or in /home/user/LegendRising was edited. Every probe and every copied test ran on QA_PORT 8856 with its own
in-process server (no stray servers left).

All paths below are relative to the snapshot root. "wpH-day" etc. are the tree's own acceptance tests, copied to
fp/p1/run/ and run through a shim lib (fp/p1/run/lib.mjs) so their screenshots and reports went to fp/p1/run/out,
not into the tree.

## What was run
| run | result | where |
|---|---|---|
| fp/p1/fd-boot.mjs: fresh New Game from the title, CDP screencast of every composited frame plus page state per animation frame | no flat frame before the film (details below) | fp/p1/bootprobe/ (frames f0000-f0033.jpg, boot.json) |
| fp/p1/fd-boot2.mjs: same flow with the CPU profiler on, folded into inclusive time per function | delay breakdown below | fp/p1/bootprobe2/boot2.json |
| qa/wpH-day.mjs (copy): bot plays H1 to H21 through the game's own input | pass, every check ok | fp/p1/run/day.log, run/out/wpH-day*.png/json |
| qa/wpG-fridge.mjs (copy): door gating on all 6 tiers, tooltip vs chip, power cut | pass, 184 of 184 | fp/p1/run/fridge.log, run/out/wpG-fridge.json |
| qa/wpH2-centre.mjs --quick (copy): G1 to G8, bag to gym fridge, manager card, postponement, early word | pass (lessons G9 skipped by --quick) | fp/p1/run/centre.log |
| fp/p1/fd-early.mjs: six training days lived on daily.js's own clock (dailyPass) with different arrival times; body/look and hair ownership | see below | fp/p1/early.json |
| qa/wpH-boot.mjs (copy): covered boot, creation, offers, back in the world, Continue | see the end of this file | fp/p1/run/boot.log |

Caveats: the wpH-day/centre bots move by placing the player at the end of each leg (the clock is passed for the
walk), so real walking and collision on the routes is not exercised; the bulb was screwed in with Space taps, the
mouse-circle input was not driven. SwiftShader timings are far slower than a real GPU.

## Beat by beat

### 1. Bulb from the furniture shop: WORKING
- Price: game.js:93 `bulb:{name:"Light bulb", price:3, ...}`; shelf card and aim hint built from it, store.js:147-163 ("€3 · For the bare socket in your ceiling · left click to take one").
- Flow: switch with no bulb says "Click. Nothing." on day one (home.js:984-988), H3 then You "Looks like the light doesn't even have a bulb." and Uncle "The furniture shop next to your block sells them. They're €3. Go grab one." (firstday.js:324-330; price from HARDWARE, firstday.js:289).
- Checkout: belt (store.js:208-218), scan with beep chip (219-232), card reader E (234-249), declined card line, alarm if you walk out unpaid (251-264). Store open 8:00 to 21:00 (store.js:22) and day one starts 8:00 (career.js:720).
- Install: place spot "Light fitting" takes the bulb (home.js:996), screw-in minigame (mini.js:50-75, "Move the mouse in clockwise circles, or tap Space"), uncle line "Put the bulb into the empty socket, then follow the prompt to screw it in." and after "The light works. Not exactly luxury, but at least you can see." (firstday.js:382-388).
- wpH-day: H3 to H9 each finished by its action; "the bulb is in and the light is on".
- Minor text gap: after paying, the bulb waits at the end of the counter (store.js:240-243) and H6's objective still reads "Pay for the bulb" pointing at the reader until it is picked up (firstday.js:344-352); only the note "Paid €3. Your things are at the end of the counter." says where it is.

### 2. Mailbox with E: WORKING
- home.js:1153-1155 spot "Your mailbox · <apt>" (E opens ctx.openMail, emits "mail"); glow while unread (1161-1176). H11 uncle line "Before you head anywhere, check the mailbox. You never know what the landlord left in there." (firstday.js:401-404). wpH-day: "the mailbox opens with your letters", H11 done.

### 3. Building notice board: WORKING
- home.js:1206-1258 (cork board texture, E opens the panel with each notice's "What it means"), H12 line "Check the board before you head out. The building usually posts anything important there." (firstday.js:406-413). Events are never rolled in a career's first two days (events.js:47-48), so day one shows the house rules and the "Quiet today..." line. wpH-day: "the board opens".

### 4. Fridge: tooltips WORKING, the H14 step guidance PARTIAL
- Gating: each food spot has `when:() => openFor(F, mask)` (fridge.js:70-73) and the aim pass skips spots whose when() is false (core/hand.js:61). wpG-fridge: for tiers 1-6, doors closed, nothing targetable from 24 views (240 aims each); with one door open only what is behind it.
- Lines: daily.js foodLines (723-740) from foodEffect (695-721), the same function eating uses: name, "Energy +7", "Hydration +6", "Fatigue −1", "Fridge quality −50%" (FRIDGE_KEEP[0]=.5, game.js:88), "Power outage −30%" (POWER_CUT_KEEP .7, daily.js:47) when the block's power event is on, then "You get: ...". Door hint names the quality and the outage (furniture.js:363-368). Gym fridge never has the outage (ground.js:160-161). wpG-fridge power-cut row: ["Energy +7","Hydration +6","Fatigue −1","Fridge quality −50%","Power outage −30%","You get: Energy +2 · Hydration +2 · Fatigue −0.4"]; tooltip equals the eat chip for every food.
- Notice board explains the outage with the same number (events.js:23-25).
- PARTIAL: H14 shows the hint "Look at the food." once the door is open, but the step only finishes on an eat/drink or the "You're full" refusal (firstday.js:424-432 done needs seen("ate"); "ate" is marked only by the eat event, firstday.js:900, or an empty fridge, 429). Looking at the food (the tooltip) does not advance it, and the objective keeps saying "Go back up and open your fridge" with the door already open. This is what DESIGN.md 3.7.5 (line 1933) specifies, so it is a text/guidance gap, not a bug in the runner. wpH-day passes because its bot eats.
- Very minor: "You get" rounds (Energy 7 × .5 = 3.5 shown "+4", daily.js:732, chip the same); the meter gets 3.5.

### 5. Bed text vs real sleep: PARTIAL (numbers right, day-one exception unsaid)
- Real behaviour: tap E by day = nap 120 min, rest 6+2·tier (8 at tier 1), energy −2 (daily.js:615-631); tap at night (isNight: from 19:00 to 05:00, daily.js:614) = sleep to WAKE 7:00 (daily.js:44); hold E BED_HOLD 2 s after HOLD_GRACE .15 s (furniture.js:326, core/hand.js:104) = exactly 1440 min (daily.js:634); the day rolls at midnight (daily.js:446).
- H15 lines (firstday.js:600-608) are computed from sleepPlan: "Tap E for a two-hour nap. It takes 8 fatigue off." / "After 7:00 PM, a tap means sleep until 7:00 AM. A full night here takes about 42 fatigue off and gives you back 6 energy. A better bed does more." / "Hold E for about two seconds to sleep through a whole day. Exactly 24 hours pass." / "The day changes at midnight." wpH-day confirmed these exact lines.
- Mismatch: on day one holding E is refused, "Not today. The club expects you." (firstday.js:944-948, wired at home.js:1019; wpH-day confirmed the refusal, day unchanged). The H15 lines teach the hold on the very day it does not work, and the bed's own prompt (furniture.js:328-348 bedText) still offers "Hold E: sleep 24 hours, to ... tomorrow" with the hold ring, then refuses. Smaller gaps: "After 7:00 PM" leaves out midnight to 5 AM (also a night sleep); the nap's −2 energy is in the prompt but not in the H15 line.

### 6. Hand plus two pockets: WORKING
- inv.js:1-15, swap 156-169, POCKET_NO 42, hands-only items (bag, box, ball) 34-37. H8 (firstday.js:358-380): "Your hands only carry one thing at a time. The two slots at the bottom are your pockets. Press 1." then "Now pick up the room number." then "Press 2 to pocket it too..." then "Press 1 to take the bulb back out." wpH-day verified each hint with the bulb in slot 1 and the plate in slot 2.

### 7. Phone: WORKING
- H16 (firstday.js:445-456): "Press Tab to take your phone out." (life/phone.js:108 Tab), Foodies destination set to the training centre (fdSetWhere, ui/foodies.js:15). wpH-day: phone out, order went through "Ordered Banana & apple. Left on the staff delivery counter in the clubhouse at about 9:26 AM."

### 8. Apartment football as a physical item: WORKING
- Intro kick leaves a real drop (intro.js:256-272, inv.js ballDrop), live ball on ball.js (core/hand.js header 1-13, dropSpot 250); hands only, two hands (inv.js:37); H17 (firstday.js:458-470) "The ball takes both hands, so it won't fit in a pocket. Left click to pick it up." / "G puts it down. Find it a spot out of the way." wpH-day: ball in both hands, H17 done by putting it down.

### 9. Neighbourhood and compass: WORKING
- H18 lines near the Mini Market, the barber and your workplace (firstday.js:472-481); H19 "See that compass at the top? It'll point you toward places nearby." / "Only places around your current neighbourhood show up." and facing the bus stop within 10° for 0.5 s (483-495). compass.js shows only W.places of the current zone (68-85). wpH-day: H18 and H19 done.

### 10. 10:00 AM training rule: WORKING
- SESSION.start 600 (daily.js:35). Bus to training gated until start minus ride (busGateAt, firstday.js:295; 9:20 from home with the 40 min ride, game.js BUS_ROUTES), drawn disabled with "From 9:20 AM today. The club wants you there at 10:00 AM." (firstday.js:950-954, ui/panels.js:229-233). Day-one clock at ONB_RATE .2 (firstday.js:44, 960-963). H21 lines "Too early. Grab something from the Mini Market, or sit down and wait." and "Training starts at 10:00 AM. You can head over now." (502-510). Day one excused (daily.js:223 freshAtt excused:onboarding()).
- wpH-day: bus lesson reached at 9:13, panel shut before 9:20 with that label, open after; off the bus at 10:00, trust unchanged on day one.

### 11. Early arrival 30 to 60 min, existing trust bonus: WORKING (limits hold), one deviation
- Rule: daily.js:39 EARLY {by:30, bonus:[.3,.45,.6], weekCap:3}; attendTick counts pre only inside 9:30-10:00 (daily.js:486); settleAttendance pays the bonus on a "good" day (on time, at the start, ≥150 session min) with pre ≥ 30, at most 3 times in any 7 days (daily.js:536-546). Through trustAdd (daily.js:796), the one trust system. Leaving before 10:15 undoes the arrival (attendLeave, 513-517).
- Probe (fp/p1/early.json, day 2 onward, not excused): 9:20 arrival +1.5 (good 1.2 + .3); 7:30 arrival +1.65 (bonus .45, streak 2); 9:45 +1.2 (no bonus, streak reset); 9:25 +1.5; next Monday 9:30 +1.2 with capped:true (3 bonuses already in 7 days); 9:20 arrival leaving at 10:30 −1 ("left early"). Not exploitable.
- Deviation: there is no 60-minute upper bound on the bonus: any arrival before 9:30 that stays the session qualifies (7:30 got it). The 30-60 window only governs the arrival note (core/acts.js:244) and the coach's "In early. Good." (firstday.js:994-999; centre test confirmed the line). Also the streak keeps counting on a capped day (daily.js:553), so the next paid bonus after a cap is at the higher step. DESIGN.md 2065 specifies "present from 9:30", so this is as designed.
- Manager card shows the real numbers (firstday.js:770-785): centre test "A full session +1.2 / In early as well +0.3 to +0.6, up to three times a week / Late −3 / Missing training −6 / Missing a match −10".

### 12. Hairstyle at creation and ownership afterwards: WORKING
- Creation offers the 13 LOOK_OPT cuts (daily.js:105-106); applyCreation owns only the chosen cut and colour (career.js:753). World editor (mirror, wardrobe) lists only owned cuts and refuses others: "You don't own that one. Fade & Co. across the road sells it." (ui/panels.js:342-357). Barber cards WEARING / PURCHASED / AVAILABLE (price) / LOCKED (reputation) from styleState (daily.js:208-215, ui/barber.js:46-56); a locked style cannot be tried on (ui/barber.js:92-95).
- Probe: owned {hair:["messy"]}; states: messy "wearing", the other 12 creation cuts "available", undercut/slick/spiky/mohawk "locked" at reputation 4.
- Not driven: the barber purchase UI flow itself (code read only).

### 13. Same created character everywhere: WORKING
- One function, look.js bodyLook(S.player.look, kind) (22-45), used by the life body (core/me.js:82), the match (core/tunnel.js:118 -> football/controller.js:238), training and drills (core/acts.js:390 -> football/training.js:384), the creation and barber previews (look.js:134-136, LK.draft from S.player.look). The intro hides the player until created (intro.js:283 me:"hide"); afterSign switches to the made body (intro.js:408-409).
- Probe: life body [hair, colour, beard, skin, build, height] == bodyLook(...,"training") == S.player.look. wpH-boot (copy) also compares the body after the real creation flow (see the end).

### 14. Training centre delivery area and bag to the gym fridge: WORKING
- Staff delivery counter in the clubhouse lobby with sign "STAFF · DELIVERIES" (ground.js:496-505), a deliveryPoint of the one parcels system (parcels.js:29-38); a bag never pops in while you look (43-61); picked up into the hands (63-85); carried to within 1.15 m of a fridge, its food goes into the one S.inv (parcels.js:87-98, called every frame from core/hand.js:120, acts.js:194-200). Gym fridge is a W.fridges entry with the same fillFridge (ground.js:120-164). Compass shows DELIVERIES while a bag waits and FRIDGE while carrying one (compass.js:72-90).
- Centre test: bag waiting on the counter, G5 "Your lunch is at the delivery counter in the clubhouse", bag in hand, at the gym fridge S.inv 15 -> 16 and no bag left, "Open the gym fridge", opened with E; line "Deliveries come to this counter. Take the bag to the gym fridge and the food goes in."

### Text rule
- No em dash in player-facing strings of these files (only in comments: store.js:286); wpH-day "no em dash in anything said" and "every line of the run, word for word" both ok.

## The apartment before the intro (measure only; fix deferred per spec section 0 and the user's request)
Result on this build: NOT reproduced. No frame of the flat, the bed or the HUD is composited before the film.

Fresh New Game (localStorage cleared, gfx Low, 1280x720, SwiftShader), fd-boot.mjs screencast and per-frame page log:
- composited frames: title until the click is handled, then pure black (1663-byte JPEGs, f0014-f0017), then the aerial city shot fading in (f0018 onward, e.g. f0020, f0022), first uncle line at f0033. No other image in between.
- page log: from startLife on, body "life cine mode-cine", #lifeFade opacity 1, camera owner "cine" from the first presented frame (camera at the AERIAL pose 76,31,36); the fade only drops below 1 at the third cine frame. Never a "life-fp" owner.
- Why: startLife covers the screen first (world.js:283-298, modes.js bootCover 107), the intro's boot plan (intro.js:459-464) starts the zone at the pavement pose with the aerial warm-up camera, and intro() keeps the cover until two frames are presented by the cine owner (intro.js:350-356, modes.js revealAfterFrames 119-133). The old flash recorded on 2026-10-06 (fp/m_tutorial.txt: startLife spawned at the bed, drew the flat, then a 250 ms timer started the intro) is gone from this code.

Where the black time goes (fd-boot2.mjs, CPU profile, ms; SwiftShader with the profiler attached):
- ui/main.js:225/215 worldOK() -> gl2(): a throwaway WebGL2 context created synchronously on the New Game click, 4610 ms self time, before the black page is painted (the title stays frozen meanwhile; it is cached after the first call). In fd-boot.mjs without the profiler the title-to-black change came within about 2.9 s of the first click.
- careerShell 222 ms (genWorld 217).
- startLife 5607 ms, all synchronous: enterZone 5247 (build/buildHome 2150 of which streets 1306; warm/warmNow 2892 of which program linking at first use 2030 and texture upload about 860), then intro() up to its first await, including warmIntro's five key-pose renders (intro.js:298-311).
- The "Getting the city ready" loader never shows: its 600 ms timer is cleared just before startWorld (ui/main.js:250-262), so those 5.6 s are a plain black screen.
- First cine frames 0.3 s after startLife returns; then the 1.4 s fade on the film clock (intro.js:355-356, first 10 frames clamped to 1/30 s each, CLK.clampN) took about 10 s of wall time because SwiftShader frames were 0.3 to 4.2 s apart. On a real GPU at 60 fps the fade is 1.4 s.
- Total from profile start to the first uncle line: 22.3 s on SwiftShader.

## Issues found (none blocking)
1. minor, firstday.js:424-432/900: H14 says "Look at the food." but needs an eat or drink to finish; the objective still says "open your fridge" with the door open. As per DESIGN 3.7.5, guidance gap only.
2. minor, firstday.js:600-608, furniture.js:328-348 vs firstday.js:944-948: day one teaches and offers hold-E 24 h sleep, which is refused that day; "After 7:00 PM" omits midnight to 5 AM; the nap's −2 energy unsaid in H15.
3. minor, firstday.js:344-352: H6 objective stays "Pay for the bulb" after paying until the bulb is collected from the end of the counter.
4. minor, daily.js:486/536-546: early bonus has no 60 min upper bound (7:30 arrival paid); streak advances on a capped day (daily.js:553). As per DESIGN 2065; not exploitable.
5. minor (boot, record only), ui/main.js:215-262: gl2() runs synchronously on the New Game click before the black page (title frozen; 4.6 s on SwiftShader with profiler); the loader text never appears during startLife's 5.6 s synchronous block. Not an apartment flash.
6. trivial, daily.js:732: "You get" and the chip round (+4 for 3.5 applied).

## wpH-boot (copy) result: pass, every check ok
- New Game paints black at once; every frame before the reveal is covered (opacity >= 0.98) or drawn by the cine owner; no life-fp frame before the film; first visible frame (n 7, opacity 0.974) is the film's.
- Creation only after "It's got character..."; nothing saved before the character exists; a reload on the creation screen leaves no save.
- Back from the offers: covered until cine draws, never life-fp; control returns in your own eyes on H1 "Go up to flat 301, floor 3".
- The body in the world is the one created: body [messy, 4862242, "", 14461832, slim, 0.968] == S.player.look.
- Continue: the first two frames behind the cover; no film again.
This confirms the "apartment before the intro" flash does not occur on this build in this environment.
