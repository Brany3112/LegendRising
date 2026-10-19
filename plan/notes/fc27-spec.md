# Adversarial check of the FC 27 spec: 10 claims checked against the frames

I checked each claim in single frames at full size, using zoomed and gridded crops, tracking tiles and fixed-crop tiles. Tracking tiles use the lead's marker track. I measured camera motion by block-matching the ground marking.

| # | Claim in the spec | Verdict | Evidence (frames) |
|---|---|---|---|
| 1 | He is right-footed. The feet at the key touches are R f30-36 (sole), R f47, L f86-88, R f92, R f157-158, L f172-174 (sole), R f235-236, L f240-243 and R f252-253. | **Confirmed** | I told the feet apart by which way he faces, which leg is nearer the camera, and the ripped left jeans leg. Frames: f28-39, f40-55, f84-99, f154-169, f166-181, f232-247, f246-253. |
| 2 | Every running touch lands at foot strike (#3 f47, #7 f92, #14 f158, #18 f197). | **Confirmed, with a refinement.** Contact lasts **2-3 frames** (f47-48, f92-93, f196-198). The ball speeds up across those frames: on screen it moves 16, 18, 22, then 28 px/frame over f91-94. It is released about 1 frame after the strike. | f45-50 (3x), f90-94 (3x), f195-199 (3x) |
| 3 | §2.3: the carry contact is the laces or front of the foot, toe pointing down, at ball-centre height. | **Corrected.** The contact is the **toe end or front of a nearly flat foot as it lands**. The sole is roughly parallel to the ground, and the toe cap meets the back of the ball **low, in the lower third** (about 0.03-0.08 m above the ground). There is no visible toe-down plantar flexion. | f46-49, f91-94, f196-198 at 3x |
| 4 | The gap from toe to ball is 0-0.1 m at a push touch and 0.3-0.6 m from the leading foot between touches. | **Confirmed, roughly (±30%).** At f46, one frame before contact, the gap is about 0.4-0.5 ball widths (about 0.1 m). At f160 the ball is about 0.8 m from the planted R foot, which is about 0.4-0.5 m from the swinging L foot. | f45-47, f157-161 |
| 5 | Cadence in a close carry: R strike f158, L strike, R strike f168. That is 5 frames per step and one touch every second step. The L push at f86-88 is followed by an R push at f92. | **Confirmed (±1 frame).** The L strike falls at about f162-163. I did **not** check the duty factor for f190-202. | f154-169, f84-99 |
| 6 | Sole moves #2 (R sole f30-37) and #16 (L sole stop f172-174, dragged back 0.6 m at 2-3 m/s). | **#2 confirmed:** the sole is on top of the ball f31-35, and the foot follows just above the ball to f37-39 while the ball goes right and toward the camera. **#16: foot and technique confirmed** (far leg, ripped left jeans, knee high f170-172, sole on top f173-174). **The drag is corrected** to about 0.7 m over f175-181, about 3-3.5 m/s relative to his body. | f28-39, f166-181 |
| 7 | The cut at #12 (f130) is a right-foot outside chop. | **Cannot tell.** The contact at f131 is hidden behind the right shin. I can only confirm that the ball is between his feet f128-130 and moves to his right from f132, and that the left leg makes a long lunge f133-136. On screen the direction changes about 110-130°. The 140-160° on the ground depends on the camera's motion. | f125-136 |
| 8 | #21 is a right-foot touch at f235-236. #22 is a left-foot set touch at f240-243, with the knee raised again at f243-246. | **#21 confirmed.** The ball's screen motion changes from (+12, 0) to (+11, -14) px/frame at f236, and the R foot lands next to the ball at f235. **#22: foot and timing confirmed.** The L foot is against the back-left of the ball, low, f240-243. The foot is clear of the ball by f244, and the knee is high f243-245. **Foot part (inside or sole): cannot tell.** The ball slows gradually, with no single-frame stop: screen speed goes 18, 11, 10, 7, 6, 4 px/frame over f238-249. | f232-249 (2.5x) |
| 9 | Shot timeline. Plant f246.5, toe-off f247.5, top of backswing f249.5, contact f252.75, follow-through peak f256-257, plant foot leaves f258-261 with no hop, lands on the kicking foot at **f261-262 (+0.27 to +0.30 s)**. | **Confirmed** through the follow-through peak. At contact the ball has moved 22 px by f253, against 62 px from f253 to f254. **Landing corrected to f264 ±1 (+0.34 to +0.41 s).** At f262-263 the foot is still falling 15-20 px/frame relative to the scene, and it does not settle before f264-265. **Plant foot corrected:** the heel peels up at f259 and the toe leaves at f260-261. That leaves a **short flight of 2-3 frames**, so "no hop" is wrong. | f246-269 (fixed crops), ground block-match f244-266 |
| 10 | Shot plant distance and contact part. The ball is +0.26/0 from the plant foot at plant and +0.37/+0.15 (±0.08) at contact. Contact is the laces or inner laces, toe down. | **Lateral offset at plant confirmed:** the ball centre is 38-40 px (about 0.27 m) right of the plant foot at f248-251, level with it within ±0.15 m. **At contact: 0.30-0.43 m (±0.07).** The plant shoe is hidden under the jeans. The **"+0.15 ahead" cannot be confirmed**; my reading is 0 to +0.15. **Laces, toe down, low on the ball: confirmed.** The red sole faces the camera at f252, and at f253 the ball sits on the top-front of the foot. **Inner laces or full laces: cannot tell.** | f247-254 (4x gridded) |

Also looked at but not counted: #15 (f168 "shadow" touch) **cannot tell**. The ball slows relative to him from f167, but he is braking at the same time. Ball speed at the shot (§0 #4): **could not be confirmed**. The camera moves 12-20 px/frame at the near ground during f244-266, and the two ways I tried to correct for it disagree.

---

# FC 27 "The grounds" clip: how the ball carrier controls, moves and shoots (reverse-engineered spec, checked)

Clip: `/tmp/claude-0/-home-user-LegendRising/d7981b91-2350-5c6d-acea-ac57541f3685/scratchpad/fc27/clip.mp4`, 720x1280 portrait, 30 fps, 347 frames. Frame n is at t = (n-1)/30 s. Frames 1-3 are a held image; real motion starts at f3-4. The HUD clock ticks once every 30 frames, so the clip plays at real time.

The controlled player is right-footed. He keeps the ball for 8.4 s against one pressing defender, then scores with a right-foot laces shot at f253 (contact at f252.75). Frames 254-347 show only the run-on and the celebration, with no more touches.

**Scale and error.** The ball is 30-38 px across near the feet, so about 140-165 px/m across the screen. Distances into the screen are squashed about 0.45-0.5x. Unless a row says otherwise:
- across-screen distances: ±15-25%
- depth distances: ±30-40%
- speeds: ±25%
- frame times: ±1 frame (33 ms)

**Camera** (for picture checks): third person, behind and above. Pitch about 22-30°, height about 3.3-4.2 m, about 8-10 m from the player, focal length about 1250-1400 px. That gives a vertical field of view of about 50° in portrait. The camera lags behind him and orbits during turns, so motion on screen is not motion on the ground. All speeds below are camera-compensated. During the shot (f244-266) the near ground (the skull marking at y ≈ 950-1000) moves about 12-20 px/frame left and 4-18 px/frame down, so the camera is clearly moving then.

---

## 0. How the reports were merged, and disagreements I settled from the frames

**Duplicates removed:**
- A's f74 and B's f73 are one cut, logged as f73-74.
- B's f158 and C's f158 are one redirect.
- C's f242, D's f241 and the shot report's f240-243 are one left-foot set touch.
- B's f154 "brush" is dropped. C shows the left foot planted beside the ball at f152-155, and the ball's speed does not change.

| # | Disagreement | Resolution, and the frames I checked |
|---|---|---|
| 1 | When the left foot plants before the shot. D: lands at f241 and stays planted. Shot report: touches the ball in the air at f240-243, plants at f246-247. | **Shot report is right.** At f243-246 the left knee is lifted to about hip height with the foot off the ground. The foot comes down beside the ball and plants at f247, with weight on it by f248. A brief ground contact at f241-242 while it touches the ball cannot be ruled out. Work file: `work/lead/L-legs241.png`. (Checker: confirmed; the foot is clear of the ball by f244.) |
| 2 | Whether there is a right-foot touch at f235-236. D says the ball rolled steadily from f226 to f240. | **The touch is real.** The ball's screen motion turns from rightward to up-screen (toward goal) at f236, as the right foot lands across it. Work file: `work/lead/L-s232.png`. (Checker: confirmed, (+12, 0) to (+11, -14) px/frame.) |
| 3 | Right toe-off for the shot: D says f247, the shot report says f248. | At f247 the right toe is still down with the heel up. At f248 the foot is in the air. Toe-off is f247.5 ±0.5. (Checker: confirmed.) |
| 4 | Ball speed at the shot: D says "almost dead", the shot report says about 1.1 m/s. | These agree: about 1 m/s (0.5-1.5) at contact. The set touch slows the ball from about 4.4 m/s to about 2.3 (f244-248), then about 1.1 (f248-252). **Low confidence:** the checker could not confirm the ground speed over the last 0.15 s, because the camera moves strongly at f244-254 and the plant shoe is hidden. On screen the ball slows gradually, with no single-frame stop. |
| 5 | Body speed during the shot. D: 0-1 m/s (the goal's size on screen does not change). Shot report: 1.5-2.5 m/s. | **Not settled.** The camera orbits, so D's evidence is weak. The roughly 1.1 m plant step done in about 0.33 s supports 1-2.5 m/s. Reported as 1-2.5 m/s, low confidence. |
| 6 | Step rate. A: 3.5-4 frames/step. B: 4. C: 5-6. | **They are all right; the rate depends on speed and phase.** My counts: L f86-88 (push at landing), R f92, L f97-98, R f102 (about 4.5 frames/step at 5-6 m/s). R f158, L f162-163, R f168, L f172-173 (about 5, then about 4 just before the stop). f190, f195-196, f201-202 (about 5.5, accelerating at 4-4.5 m/s). See §3.1. |
| 7 | Feet at f168 and f173. | Checked. At f168 the near leg (right) lands right behind the ball. At f172-174 the far leg (left jeans with the rip patches) lifts its knee high and puts its sole on top of the ball. C is right. Work file: `work/lead/P-c166.png`. |
| 8 | Foot at f47 (A: medium, inferred). | Arm counter-swing confirms it: the far (left) arm is forward while the front leg meets the ball, so it is the right foot. Work file: `work/lead/P-a043.png`. (Checker: confirmed. The nearer, lower foot touches the ball while he faces screen-right.) |
| 9 | f130 outside chop (B: low). | At f129 the ball is between his feet. At f131 it is hidden behind the right shin. At f132 it is to the right of his feet, with the left foot planted wide. Read as a right-foot outside chop, **medium-low**: the contact itself is never visible. Work file: `work/lead/P-b125.png`. |
| 10 | Redirect angle at f158: B says 45-60°, C says 70-80°. | Reported as 45-80°, about 60°. |
| 11 | The f103-121 sole sequence. | Checked. The right thigh is horizontal with the sole on the ball at f109-111. The left knee is high over the ball at f114-116, with the rip-patch leg visible. Raised to medium-high. Work file: `work/lead/P-b102.png`. |

---

## 1. Touch table (merged, 23 contacts)

R and L are his right and left foot. "Strike" means the foot touching the ground at the end of its swing. Distances are in metres. Error is ±25% across the screen and ±40% in depth.

| # | Frame (span) | t (s) | Foot | Part | Purpose | Ball before | Ball after | Stride phase | Conf. | Src |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6 (5/6-12) | 0.17 | R | sole on top | Drag-back turn: stops a ball rolling at about 1 m/s, pulls it back under the body while he turns 90°, then rolls it out the opposite way. Turns 180° in total. | 0.2 ahead, 0.4-0.5 to the right of the planted L foot | Under the sole: 0.3 back, 0.2 across (f6-11). Released f12-13 at 3-4 m/s, slowing. 1.0 ahead of his feet by f24. | Standing move. L planted as the pivot f1-11. Sole contact 6-7 frames. | high | A |
| 2 | 30 (30/31-36) | 0.97 | R | sole on top | Trap, then a sideways-and-back sole roll away from the defender (2-3 m away). Sets up a 120-135° turn. | 0.35 ahead, 0.3 right of the planted L foot. Ball rolling about 2.5 m/s. | Under the sole f31-35, the foot then following just above the ball to f37-39: 0.45 right, 0.6-0.9 back. Released about f36-37 at 3.5-4.5 m/s. 1.3-1.8 m to the next touch. | L planted f29-39. The R foot goes onto the ball instead of the ground. Feet up to 0.9 m apart (f36). R next lands f40-41, his first step the new way. | high | A + chk |
| 3 | 47 (47-48) | 1.53 | R | toe end / front of a nearly flat landing foot; the toe cap meets the back of the ball low (lower third) | Push and redirect about 60-80° to his left, at speed | 0.85 ahead of the planted L foot. About 0.1 beyond the swinging toe one frame earlier (f46). | Speeds up over the 2 contact frames and separates at f49. Leaves at about 5 m/s. Rolls free about 2.5 m (16-18 frames). Furthest 1.0-1.2 from his feet at f52-53. | End of the R swing. The foot lands flat at f47-48 with its toe against the ball and is planted where the ball was. | med-high | A + lead + chk |
| 4 | about 65 (64-66) | 2.13 | R | probably inside | Small steering touch at speed (partly out of frame) | 0.6 ahead, 0.2 right of the R foot | Stays 0.5-0.6 ahead, between his feet (f68-73) | R reaching forward-right | low | A |
| 5 | 73-74 | 2.42 | R | inside (probable; a sole drag is possible) | Cut back to his left, about 135-150° change | 0.3-0.4 ahead and 0.2-0.3 right of the planted L foot, between the legs | Rolls back-left at 1-1.5 m/s. 0.5-0.85 from his feet by f81-85. | L planted as brake and pivot. Deep crouch. Body turns about 90° left in about 5 frames. | low | A+B |
| 6 | 86 (86-88) | 2.83 | L | toe / front of the foot | First push to accelerate after the turn | At the L toe. About 0.5 ahead of the R support foot. | 1 to 4-5 m/s. 0.3-0.45 ahead of the L foot by f90-91. | End of the L swing. The foot stays with the ball about 3 frames, then lands (f88-89). | med | B + chk |
| 7 | 92 (92-93) | 3.03 | R | toe end / front of a flat landing foot, low on the ball | Push at speed (5-6 m/s) | 0.45 ahead of the planted L foot, in line | Speeds up over f92-93 (screen 16, 18, 22, 28 px/frame over f91-94). Briefly about 6 m/s. 0.5-1.0 ahead of the leading foot (largest about 1.0 at f97). | End of the R swing. Lands flat at the ball at f92-93 and stays planted at f94. | med-high | B + lead + chk |
| 8 | 103 (103-105) | 3.40 | R | toe / inside of the toe | Reach-and-slow touch on a heel-first braking step | 0.8-1.0 ahead of the L support foot. R leg almost straight. | Slows from 4.5 to 3-4 m/s. Stays 0-0.2 from the R foot. | Long braking step. R heel lands at the ball. | med | B |
| 9 | 109 (108/109-112) | 3.60 | R | sole on top | Stops the ball in 1-2 frames (about 4 to 0.5 m/s), then rolls it across the body to the L foot | At the R foot. 0.45 front-left of the planted L foot. | Rolled 0.3-0.4 across at about 2 m/s | L planted as pivot. R thigh near horizontal. Body pivots 90-120° left and faces the camera by f112. | med-high | B + lead |
| 10 | 114 (113-117) | 3.77 | L | sole on top / behind | Catches the rolled ball and rolls it back the other way (second half of a double sole roll, croqueta-like) | 0.45 to the side of the planted R foot | 2-3 m/s back across, 0.3-0.5 from his feet | R planted (stationary on the ground f114-117). L knee high. | med-high | B + lead |
| 11 | 120 (119-121) | 3.97 | R | inside / front (partly hidden) | Push out of a 180° clockwise spin | 0-0.15 from the R foot | 2.5 to about 5 m/s. 0.2-0.4 ahead, between his feet. | R stance and push-off as the L leg strides | low | B |
| 12 | 130-131 (contact hidden at f131) | 4.30 | R (probable) | outside (probable; never visible) | Chop to his right from a sprint. About 110-130° on screen; 140-160° on the ground is camera-dependent. | Between the feet f128-130, 0.1-0.2 in front of / inside the R foot. 0.35 right of the wide-planted L foot. | About 1 m/s to the right. 0.5-0.7 from his nearest foot by f141. | L planted wide as the brake. R swings across in front of the ball. Then a deep lunge (f133-141). | med-low | B + lead + chk |
| 13 | 144 (143-145) | 4.77 | L | laces / instep | Push into space, away from the defender | 0.55-0.7 ahead-right of the trailing R foot | 5-7 m/s. 0.2-0.5 ahead through f145-157. | End of the L swing. The foot carries the ball 2-3 frames. | low | B |
| 14 | 158 (157-158) | 5.23 | R | front near the toe / inside (cannot separate inside from toe) | Redirect 45-80° to his left at running speed | 0.25 ahead of the L support foot. R toe 0.05 behind/left of the ball at f157. | 4-6 m/s along the new line (the ball changes direction between f158 and f159). 1.3-1.5 m to the next contact. | Contact as the R foot strikes. That foot is then planted f158-163. | med | B+C+chk |
| 15 | 168 | 5.57 | R | toe / front | "Shadow" carry: the foot lands right behind the rolling ball. May be no contact. | 0-0.05 in front of the landing R toe | No measurable change. Creeps to 0.35-0.45 ahead by f172. | R strike, one stride (10 frames) after #14 | low | C + lead |
| 16 | 173 (172-174, drag to 181) | 5.73 | L | sole on top | Sole stop and drag-back as the defender closes | 0.35-0.45 ahead of the planted R foot | Dragged back about 0.7 over f175-181 at about 3-3.5 m/s relative to his body. Ends to his right and between his feet as he squares up. | Replaces an L strike: knee lifted high at f170-172. R planted f169-175. Body brakes 4 to 0.5 m/s in about 8 frames and turns 90° right. Stance about 0.7 m. | high (foot), med | C + lead + chk |
| 17 | 181 (181-182) | 6.00 | R | outside | Push into space to his right, starting the burst | 0.1-0.15 outside the R foot, level with it | 2 to 4.4 m/s. 1.9 m (±0.4) to the next touch. Leads by up to 1.0-1.2 (f188-190). | L planted wide. Then a 90° pivot on L and a burst from 0 to 4.5 m/s in 15 frames, leaning 35-45°. | med | C + lead |
| 18 | 197 (196-198) | 6.53 | R | toe end / front of a flat landing foot | Push while running, after catching up with the ball | 0.05-0.1 ahead of the landing foot | Speeds up over f196-198. 2.6 to 4.6 m/s. Leads the foot by 0.2-0.35. | Contact at R strike | med | C + lead + chk |
| 19 | 204 (203-207) | 6.77 | L (probably) | sole on top / back | Sole stop and drag-back, one step after a push | 0.2-0.3 ahead of the front foot | Stops by f207. Rolls back 0.3-0.5 under his hips. Held between his feet f211-219. | The foot lands on the ball instead of the ground. Body 4.5 to 0 in about 10 frames, then a very deep crouch. | low | C |
| 20 | 223 (221-226) | 7.40 | L (probably) | sole on the far side | Sole roll toward the camera, then to his left, while turning. Dodges the defender's lunge (f227-230). | Under the foot, 0.1-0.2 in front of him | Rolls 1.5-2 m across at 2-3 m/s, 0.4-0.7 in front of his feet. Then he side-shuffles. | Sole rides the ball about 5 frames. Other foot planted. | low | C |
| 21 | 235 (235-236) | 7.80 | R | inside (front part) | Redirects the ball about 60° toward goal as the foot lands, then spins 150-170° left on that foot | Rolling across from his right to his left at about 3-4 m/s, 0.1 right of the incoming R toe | About 4 m/s toward goal and to the right | Contact at R strike. R is the pivot f236-247. | med-high | C+Shot+lead+chk |
| 22 | 241 (240-243) | 8.00 | L | inside / front of foot (sole possible; cannot tell) on the back-left of the ball, low | Set / cushion touch for the shot | 0.85-1.0 ahead of the R pivot foot | Slows gradually (no single-frame stop) to about 2.3 m/s (f244-248), then about 1.1 m/s (f248-252; low confidence). Sits about 0.27 right of where L then plants. | End of a high-knee L swing during the spin. The foot is clear of the ball by f244, lifts again (knee about hip height, f243-245) and **plants at f247** as the shot's plant foot. | med | C+D+Shot+lead+chk |
| 23 | 253 (contact at f252.75 ±0.25) | 8.39 | R | laces (inner or full laces cannot be told), locked ankle, toe down; low on the ball | Standing-start drive shot. Scores. | 0.26-0.28 right of the L plant foot at plant (f248); about 0.30-0.43 right and 0-0.15 ahead at contact. Rolling about 1 m/s (low confidence). | About 28 m/s (22-32), launch 5-12°, in the net at f261-263 | See §4 | high | D+Shot+lead+chk |

Possible touches hidden from view: f25-29 (the ball slows sharply behind his body) and f124-127 (the ball is in front of his feet during the sprint).

**Feet:** R = 16 contacts (about 70%), L = 7.

---

## 2. Close control

### 2.1 Touch rate

The rate depends on what he is doing. It is not one fixed number.

| Situation | Frames | Speed (m/s) | Touch interval | Touches per stride (R strike to R strike) | Touches/s |
|---|---|---|---|---|---|
| Close carry, ball kept 0.3-0.6 ahead | f157-172 | 4-4.5 | 10 frames (0.33 s), on every R strike | **1 (every 2nd step)** | about 3 |
| Fast carry with alternating pushes | f86-103 | 5-6 | 6 then 11 frames | 0.7-1 | about 3.5 |
| Push and run (ball 0.6-1.2 ahead) | f47 to about f65 to f74 | 4.5-5 | 17-18 frames | about 0.4 (every 5th step, about 2.5 strides) | about 1.7 |
| After a push into space | f181 to f197; f130 to f144 | 0-4.5 | 13-16 frames | about 0.5 | about 2 |
| Sole sequences (stop, roll, catch, push) | f103-121, f172-182 | 0-4 | a new contact every 3-6 frames | n/a (pivoting) | 5-10 |

- Each sole contact lasts 3-7 frames (0.1-0.23 s).
- A push contact lasts **2-3 frames** (f47-48, f92-93, f196-198). The foot lands against the ball and the ball speeds up over those frames rather than in one.
- Over the whole clip: 23 contacts in 8.4 s, about 2.7/s.
- He never touches the ball more than once per stride with the same foot while running.

### 2.2 Where the kept ball sits

Measured against the feet:

| | Ahead | Side |
|---|---|---|
| At a push touch | 0-0.1 m gap between the toe and the ball (about 0.1 m one frame before contact at f46, 0 at contact). The foot reaches the ball instead of striking it from a distance. | In line with the touching foot (±0.1). |
| Between touches in a close carry | **0.3-0.6 m** ahead of the leading foot (examples: 0.45-0.6 at f160-166, where f160 is about 0.8 from the planted R foot and 0.4-0.5 from the swinging L foot; 0.2-0.35 at f199-202; 0.4-0.6 at f237-247) | In the right foot's lane or between the feet. Up to 0.2 outside the R foot (f58-62). Briefly ahead-left after a left turn (f17-24). |
| Furthest, right after a push into space | **1.0-1.2 m** (f52-53, f97, f188-190) | |
| Sole moves | 0 m from the touching foot (under the sole). 0.3-0.5 m from the planted foot. Up to 0.9 m sideways at full stretch (f36). | |
| Held while standing or crouched | 0-0.2 m, between the feet (f211-219) | |
| Before the shot | 0 ±0.15 ahead of the plant foot at plant; 0-0.15 ahead at contact | 0.26-0.28 right of the plant foot at plant (f248-251); 0.30-0.43 at contact (kicking side) |

**Converted to the body centre (derived, about ±0.15 m).** These assume a landing foot about 0.35-0.4 m ahead of the pelvis at a strike.
- At a carry touch the ball centre is about 0.45-0.65 m ahead of the pelvis.
- Between touches it opens to 0.7-1.0 m.
- Side: +0.05 to +0.15 m toward the strong (right) side.

**Ball speed:**
- Right after a carry push the ball moves at 1.0-1.3 times the player's speed: 4.4-4.8 m/s at 4-4.5 m/s, and about 6 m/s at 5-6 m/s. The gap opens for about 0.2 s, then he catches up.
- Rolling slowdown is inconsistent across the clip, anywhere from about 1 to 5 m/s² (low confidence). Do not change the global roll friction because of it.

### 2.3 How the ball stays on the right foot

- **The touch is timed to the right foot landing.** Every running touch in the clip lands at the end of the touching leg's swing, at foot strike (f47, f92, f158, f168, f197, f235). The foot then plants just behind where the ball was and becomes the stance foot. Between those touches the ball rolls freely.
- **Carry contact (corrected):** the **toe end or front of a nearly flat foot as it lands**. The sole is roughly parallel to the ground, with at most a slight toe-down. The toe cap presses the back of the ball **low, in the lower third** (about 0.03-0.08 m above the ground), for 2-3 frames while the foot comes down (f47-48, f92-93, f196-198). It is a push at landing, not a laces strike with the toe pointed down, and not at ball-centre height.
- **Turning to the weak (left) side:** the inside or front-near-the-toe of the right foot, at foot strike. The ball is on the inside of the right foot (#5, #14, #21).
- **Turning to the strong (right) side:** the outside of the right foot (#17; #12 probable but hidden). He swings it across in front of the ball, with the left foot planted wide.
- **Stopping and holding:** the sole on top of the ball. The foot used is whichever is swinging when he decides to stop (#1, #2, #9, #16, #19).
- **Rolling across the body:** the right sole rolls the ball toward the left (#9) or back and to the right (#2).
- **Head:** down over the ball for every contact.

### 2.4 When the weak (left) foot is used

He uses the left foot only:
1. as a **brake**: a sole stop when the left is the next foot to land (#16, #19), or a sole roll while turning (#20);
2. for the **second half of a two-sole roll** (#10);
3. for the **first push after a turn** when the ball is on the left side (#6, #13);
4. for the **set touch before a right-foot shot**, after which that foot becomes the plant foot (#22).

He never uses the left foot for a redirect, a cut, a push out of a turn, or the shot. At high speed his pushes can alternate L-R (#6, #7).

---

## 3. Movement

### 3.1 Stride while carrying the ball (camera-compensated, ±1 frame per step)

| Speed (m/s) | Frames | Frames/step | Steps/s (steps/min) | Step length (m) | Note |
|---|---|---|---|---|---|
| 2-2.6 | f17-30 | 3.5-4 (low confidence) | 7.5-8.5 | 0.3-0.6 | short choppy steps after a turn |
| 4-4.5 | f155-172, f190-202 | 5-6 | 5-6 (300-360) | 0.7-0.8 | typical close carry (R f158, L f162-163, R f168 checked) |
| 4-4.5, just before a stop | f164-173 | 3.5-4 | 7.5-8.5 | 0.5-0.6 | steps get quicker before a stop |
| 4.5-5 | f40-62 | 3.5-4 | 7.5-8.5 | 0.55-0.65 | A's reading |
| 5-6 | f85-102 | 4-4.5 | 6.7-7.5 (400-450) | 0.75-0.85 | |
| 5-7, re-accelerating after a cut | f145-152 | 6-7 | 4.3-5 | 1.0-1.4 | long low lunging strides |
| Shot run-in / run-on without the ball | f243-250, f260-275 | long strides, not measured | | | |

- **Duty factor** (fraction of the stride a foot is on the ground): about 0.45, from one clean cycle at f190-201 (stance 5 frames in an 11-frame stride). Very little time in the air. Not re-checked.
- **Rule of thumb:** step length is about 0.7-0.8 m and almost constant above 4 m/s; cadence ≈ v / 0.75.
- **Compared with our game** at the same speed: about 2.2-2.5 times the cadence and 0.4-0.5 times the step length.

### 3.2 Posture

- Knees are bent all the time and never straight. Centre of mass stays low.
- Carrying: torso leans forward 10-25° (0.17-0.44 rad).
- Bursting after a stop or cut: 30-45° (0.52-0.79 rad), e.g. f184-190 and f86.
- Sole moves: torso upright, very wide base with feet 0.6-0.9 m apart, knees bent about 60-100°. The raised thigh reaches horizontal when the sole goes on the ball.
- Hard cuts: hips at about knee height, trailing leg stretched back with the knee almost on the ground (f133-141, f147-150, f211-218), torso tilted about 45° into the new direction.
- Drag-back: deep crouch, knees about 90-100° (f1-12).

### 3.3 Arms and head

**Arms:**
- Always held away from the body: raised 40-70° from the sides, elbows bent about 90°, hands around hip height.
- While running they swing opposite to the legs, with a small swing, and stay wide.
- Sole moves: both arms spread wide (f33-37, f110-116).
- Drag-back: one arm straight out level at shoulder height (f1-6).
- Cuts and turns: the arm on the side of the new direction reaches straight out at shoulder height or toward the ball (right arm f136-145; left arm f184-190, f75-77).

**Head:**
- Down on the ball for every contact and through all close control.
- Lifts slightly at 5-6 m/s between touches (f92-100, f142-153).
- Turns into a new direction 1-3 frames (0.03-0.1 s) before the shoulders, which lead the hips.

### 3.4 Turns and cuts

The ball always turns first and the body follows over 6-10 frames.

| Type | Frames | Ball change | How | Body |
|---|---|---|---|---|
| Inside redirect at foot strike | f47, f158, f235 | 45-80° | Front or inside of the right foot as the right foot lands | Pivots on that planted foot. Speed held at about 4-4.5 m/s (f47: 4.5 before and after; f158: 4-4.5 to 4). Body yaw catches up over 0.2-0.33 s. |
| Inside cut-back | f73-74 | 135-150° to the left | Left foot planted as brake and pivot, right inside across | Speed 5 to 1.5 m/s in 4-5 frames. Deep crouch. Body about 90° left in about 5 frames. Left arm reaches forward-left. |
| Outside chop (contact hidden) | f129-132 | 110-130° on screen; 140-160° on the ground (camera-dependent) | Left foot planted wide as the brake, right outside swung across in front of the ball (probable) | From a sprint to 0-1 m/s. Deep lunge for about 10 frames. Re-accelerates with a left push (f144). |
| Sole drag-back turn | f5-19 | 180° | Right sole pulls the ball back under him | Pivots on the left foot: 90° during the drag, then 180° in 7 frames (about 13.5 rad/s). |
| Sole lateral roll | f30-45 | about 120-135° | Right sole rolls the ball sideways and back | Head turns at f39-40, body 120-135° in about 8 frames (about 8-9 rad/s) |
| Stop, square up, push out | f172-190 | 180° in about 18 frames | Left sole stop, drag back about 0.7 m, turn 90° right to face the camera, right outside push, pivot 90° on the left foot | Bursts from 0 to 4.5 m/s in 0.5 s |
| Double sole roll and spin | f103-123 | about 180° | Right sole across, left sole back, spin 180° clockwise in about 6 frames (about 15 rad/s), right foot pushes out | |
| Long continuous turn | f203-243 | about 270° to the left | Sole stop, deep crouch, sole roll, side shuffle, right inside toward goal | |

Standing or slow turn rates are **8-16 rad/s, typically 12-14**. A planted foot is pivoted through up to 150-180° in a single stance (f12-19, f236-243).

### 3.5 Slowing down and speeding up

**Braking.** He never slows with a series of small steps alone. He does one of three things:
- a sole on the ball first, with the body braking behind it in a wide or low stance;
- one long heel-first reaching step (f103);
- a wide brake-plant on the outside foot (f130).

| Example | Frames | Change | Rate |
|---|---|---|---|
| Sole roll stop | f30-37 | 2.5 m/s to 0 in 6 frames | about 12.5 m/s² |
| Left sole stop | f173 | 4 to 0.5 in 8 frames | about 13 m/s² |
| Sole stop | f204 | 4.5 to 0 in 10 frames | about 13.5 m/s² |
| Cuts | f73, f130 | 5 to 1.5 in 4-5 frames | about 20 m/s² or more (low confidence) |

**Acceleration.** About 9 m/s² on average: 0 to 4.5 m/s in 15 frames after a push out (f181-196), with a 35-45° lean.

### 3.6 Feints

- No step-overs anywhere in the clip.
- The fakes are:
  - sole drag-backs (#1, #16, #19);
  - a sideways sole roll (#2);
  - a double sole roll (#9-10);
  - stop-and-go: a sole stop followed at once by a right-foot push the other way (#16 to #17);
  - head-first direction changes.
- Each one is triggered by the defender closing to 2-3 m (f30-37, f172-181, f219-230).

---

## 4. The shot (f235-265)

A turn-and-shoot from close to a standstill. There is no run-up: a turn touch, a set touch, one plant step, then the strike.

| Event | Frame | t (s) | Relative to contact |
|---|---|---|---|
| Right inside turn touch (ball about 60° toward goal at about 4 m/s) | 235-236 | 7.80 | -0.57 s |
| Spin 150-170° to his left on the right pivot foot (left knee high) | 236-243 | | about 10-13 rad/s |
| Left set touch (back-left of the ball, low; foot clear of the ball by f244) | 240-243 | 8.00 | -0.39 to -0.33 s |
| Left knee lifted again, right heel peels up | 243-246 | | |
| **Left plant** | 246.5 ±0.5 (f247 ±1) | 8.18 | **-0.20 s** (6 frames) |
| Right toe-off, backswing starts | 247.5 ±0.5 | 8.23 | -0.16 s |
| Top of the backswing | 249.5 ±0.5 | 8.28 | -0.10 s |
| **Contact** | **252.75 ±0.25** | **8.39** | 0 |
| Follow-through peak (foot about 0.8-1.0 m high, about hip height) | 256-257 | 8.52 | +0.10 to +0.13 s |
| Plant foot: heel peels f259, toe leaves f260-261 (push-off; a short flight follows) | 259-261 | | +0.22 to +0.27 s |
| **Lands on the kicking foot** (foot still falling 15-20 px/frame relative to the scene at f262-263) | **264 ±1** | 8.77 | **+0.34 to +0.41 s (best +0.37)** |
| Ball crosses the goal line / scoreboard changes to 2-1 | about 261 / 267 | | +0.27 s / +0.47 s |

**Positions on the ground**, relative to the left plant foot. +x is to his right, +z is roughly toward goal. Error is about ±0.08 m across (±0.1 at contact) and ±0.15 m in depth.

| Point | x | z |
|---|---|---|
| Right pivot foot | -0.59 | -0.90 (plant step about 1.0-1.1 m, about 33° right of the goal axis) |
| Ball at f244 | +0.15 | -0.28 |
| Ball at plant (f248) | +0.27 (38-40 px at about 141 px/m, f248-251) | 0.0 ±0.15 |
| Ball at contact | +0.35 (0.30-0.43) | 0 to +0.15 (it may have rolled up to about 0.15 m during the backswing) |
| Kicking-foot landing | unverified (the source reading was +0.12) | unverified (the source reading was +0.85). Could not be checked because of camera motion. |

- He approaches from behind-left of the ball, 30-35° off the goal axis.
- The strike goes about 20° left of his step direction (slightly across the body), about 10-13° right of straight at goal.

**Approach and plant:**
- Body speed 1-2.5 m/s (low confidence).
- The plant leg is slightly bent (about 15-20°) and stays down through contact and until about +0.22 s.
- Toe direction is uncertain, probably toward the target.

**Backswing:**
- Knee flexion 100-120°. Heel 0.4-0.6 m above the ground at the top, behind the hips.
- Left (support-side) arm straight out at shoulder height (80-90°) from f248 to f252, pulled in at f253-254.
- Right arm low by the hip.
- Head about 0.2 m toward the plant side at the top (lateral lean of about 10-15°), back over the plant foot by contact.

**Contact:**
- Right laces (inner or full laces cannot be told). Ankle locked, toe down: the red sole faces the camera as the foot swings in at f252.
- Contact is on the back of the ball, below centre (lower third). At f253 the ball is sitting on the top-front of the foot. Nearly central for the shot direction, so little sidespin is expected.
- Trunk near vertical, with 10° or less lean to the plant side. Forward/back lean cannot be seen from this camera.
- Foot speed just before contact is roughly 12-18 m/s (rough).

**Ball flight:**
- About 28 m/s (22-32), launch angle 5-12°.
- Rises steadily to 0.5-1.2 m high at the line.
- Possibly a slight right-to-left bend (uncertain).
- Crosses about 1.3-2 m inside the right post (as seen from the camera), past the diving keeper.

**Follow-through:**
- The foot rises to about hip height in front (highest at f256-257), then sweeps slightly across to the left (support side) and comes down.
- The head comes up toward the goal by f256-258.
- The plant foot pushes off at f260-261. After a short flight (2-3 frames) he lands on the kicking foot at f264 ±1. The left leg flicks up behind, the trunk pitches forward 30-40°, the arms spread, and he runs on (f269 onward).

---

## 5. Mapping onto our code

Paths are relative to `/home/user/LegendRising/LegendRising/js/life/`. Current values come from the code map. Neither the spec author nor the checker opened the repository.

**Type key:**
- **RETUNE**: change a value.
- **NEW**: needs a new mechanism.
- **TEST**: an existing test has to change.

### 5.0 Priorities, by visual impact

1. A carrier gait with short, quick, low steps (§5.4). Without it, one touch per stride cannot keep the ball close.
2. Touches timed to the strong foot landing, with the drawn foot face meeting the drawn ball at that moment (§5.1, §5.3).
3. Drawn sole stops and sole rolls (§5.6).
4. Turns led by the touch, with the head leading and deep-crouch cuts (§5.5).
5. A real plant step and a follow-through ending in a landing at about +0.37 s for the open-play shot (§5.7).

### 5.1 When a touch happens

| Item | Knob | Current | Target from the clip | Why | Type |
|---|---|---|---|---|---|
| What triggers a touch | `football/actions.js` ctlTouch gates L922, L933: CTL.DT 0.18 (0.09 when turning), CTL.TOL 0.12 (L881); `football/sim.js` L541-546 | Position controller not tied to footfalls. Measured 2.6-4.3 touches/s, i.e. 2.2-2.7 per stride, all right laces. | One touch on each strong-foot strike in a close carry. When the ball lead is over 0.6 m (push and run), one touch every 2-3 strides. Keep TOL 0.12 only as the "skip this strike" test (skip if the ball predicted at the following strike is still within 0.12 of the spot). | Every running touch in the clip lands at foot strike (#3, #7, #14, #15, #18, #21) at about 1 per stride. Footfall events already exist (phaseAdvanceQ evs, sim.js L543-546). | **NEW** (scheduler), RETUNE TOL |
| Touch moment within the swing | `gait.js` touch() L196-215: u 0.70, 0.5 s window | Mid-to-late swing; the foot can arrive up to 0.5 s after the ball has already moved | u ≈ 0.9-1.0 (at foot strike). Contact lasts 2-3 frames (0.07-0.1 s), and the ball is pushed up to speed over that time while the foot lands. | The foot meets the ball at the end of its swing, then plants just behind where the ball was | **RETUNE** + NEW |
| Matching the drawn and sim clocks | `football/view.js` dribbleTouches L357-382 (no st.phase); sim a.g vs drawn h.gait | Two independent clocks; the ball moves first, the foot arrives later | The drawn strike frame of the touching foot equals the sim touch step ±1 frame. Drive the drawn swing from the sim footfall, or delay the ball kick until the drawn face arrives. | In the clip the ball's speed changes starting on the contact frame (f47, f92, f158, f197) | **NEW** |
| Where the touching foot lands | gait footprint planner (reachSpan / footprint lead) | Not aimed at the ball | The touching foot's footprint goes 0.1-0.2 m behind the ball's predicted position at contact, in line with it (±0.05) | "Lands right behind where the ball was" (#3, #6, #7, #15) | **NEW** |
| One touch per swing, dropped touches | `gait.js` swingAt via L488-496 (first via wins); touchDown clears it (L542) | 55-65% of close-control touches are never drawn | 100% drawn. With one touch per stride this follows from the scheduler. | | **NEW** (follows from row 1) |
| Touches while standing | gait STAND, no 'phase' swings | Nothing drawn; a stale via can bend a later step | In-place "touch steps" and sole rolls are drawn (#1, #2, #9, #10, #20) | Most standing control in the clip is sole work | **NEW** |
| Stride-dribble event has no foot | `football/actions.js` L724 logEv | No foot logged, so the view picks whichever foot swings first | Log foot and part (they come from touch.js L322-327) | Needed for foot share and face checks | RETUNE (small) |

### 5.2 Where the ball is kept

| Item | Knob | Current | Target | Why | Type |
|---|---|---|---|---|---|
| Lead | `football/actions.js` L881 CTL.LEAD 0.30, LV 0.05, LMAX 0.50; spot formula L928-930 | Ball 0.40-0.61 m ahead of the body, measured | Best: define the spot as the next strong-foot footprint + 0.2 m along the run (ball 0-0.1 beyond the toe at contact). If the root-based formula stays: LEAD about 0.45, LV about 0.06, LMAX about 0.8. Between touches the ball should open to 0.7-1.0 from the pelvis and 0.3-0.6 from the leading toe. | §2.2. The conversion to the pelvis is derived (±0.15). | **RETUNE** (or NEW spot definition) |
| Side offset | CTL.LAT 0.10 (L881) | 0.10 | 0.08-0.12: keep (ball in the right foot's lane) | Matches | keep |
| Look-ahead / arrival time | CTL.T 0.3 (L881) | 0.3 s | The time to the next strong-foot strike (0.27-0.37 s with the carrier gait) | Ties the touch to the stride | RETUNE |
| Push speed | ctlTouch ballKick speed min(D/T + 0.5·dec·T, 14) | Whatever reaches the spot in 0.3 s | 1.05-1.25 times player speed along the run for a carry push, reached over the 2-3 contact frames | §2.2 | RETUNE |
| Reach | CTL.REACH 1.25; TAKE.REACH 1.2 (L880) | | Keep (clip maximum 1.0-1.2) | | keep |
| Standing rest | u26-keep: ≤ 0.6 m, < 0.3 m/s | | ≤ 0.3 m from a foot, between the feet or under the sole | f211-219, f241-252 | RETUNE + TEST |
| AI stride dribble | `football/touch.js` TOUCH.CADENCE [[3,1],[6,2],[∞,3]] (L58); leadN 0.6+0.22v (L307); CLOSE {L0 0.3, LV 0.07} (L69) | Every 2nd stride up to 6 m/s | Once the carrier gait exists: [[3,1],[6,1],[∞,2]] for close carry; push-and-run every 2-3 strides. leadC at 5 m/s ≈ 0.65 is fine. | The clip has 1 touch per stride at 4-6 m/s | RETUNE |
| Knock-on | KNOCK {D 9, ...} (actions.js L882) | | Keep. Not in the clip; the longest push before re-touching was 2.5 m (#3). | | keep |

### 5.3 Foot choice and foot part

| Item | Knob | Current | Target | Type |
|---|---|---|---|---|
| Which foot | `football/actions.js` touchSideOf L730 | Always the strong foot ('B' counts as R) | Strong foot for carry pushes, redirects, cuts and pushes out of turns. Weak foot for: (a) a sole stop when the weak foot lands next; (b) the second half of a two-sole roll; (c) the first push after a turn when the ball is more than about 0.2 m to the weak side (WEAK_SIDE 0.25 in touch.js L55 is fine); (d) the set touch before a strong-foot shot. Expected share: about 70% strong. | **NEW** |
| Which part | actions.js L941 (event only: laces / inside / outside); rollTo 'sole' | laces when straight; when turning left (R foot): inside; when turning right: outside | Keep that mapping for redirects (#14/#21 inside or front; #17 outside). Rename or redefine the straight carry push as "toe/front" (#3, #7, #18), not a laces strike. Add 'sole' for stops and rolls in close control and 'toe' for the reach-brake (#8). | RETUNE |
| Drawn contact face | gait.js swingAt via block L488-496 (sends the ankle to the ball centre); via.laces/dir/strength unused | No foot yaw, roll or pitch | **Carry push:** foot nearly flat as it lands (toe pitch 0-0.3 rad). The toe cap meets the back of the ball low (0.03-0.08 m above the ground) and stays against it for 2-3 frames as the foot plants. Do not aim the ankle at the ball centre. **Inside:** foot yawed out, the inside face on the ball's side. **Outside:** yawed in. **Sole:** sole point on top of the ball (y ≈ 0.20-0.24 m) for 3-7 frames. **Shot laces:** toe plantar-flexed about 0.6-0.9 rad (see §5.7). Reuse moves.js PARTS (L81) / partLocal. | **NEW** |
| Turn touches | CTL.TURN 25°, a touch every 0.09 s when turning, CTL.SPIN 3 | Several quick touches | One redirect touch at the next strong-foot strike; a 45-80° change in one touch at speed. Keep the spin. | RETUNE |

### 5.4 Gait while carrying the ball

| Item | Knob | Current | Target | Type |
|---|---|---|---|---|
| Cadence and step length | `gaitcore.js` RUN rows L17-20 (shared by sim footfalls and the drawn legs) | At 4.0 m/s: 1.44 m steps, 167 steps/min (stride 0.72 s). At 5.9 m/s: 1.97 m, 179 steps/min. | A CARRY table, used while ctlOn or poss.ctl === me, with rows [v, steps/min, step m]: [2.4, 330, 0.44], [3.6, 340, 0.64], [4.5, 360, 0.75], [5.5, 410, 0.80], [6.5, 450, 0.87]. Add a blend knob (CARRY_K 0..1) so it can be dialled between our run and FC's. | **NEW** |
| Duty | RUN rows: duty 0.27-0.36 at 3-5.5 m/s | | About 0.40-0.45 for the carrier (one measured cycle) | NEW (in the table) |
| Minimum swing time | `gait.js` TSW_MIN 0.22 s (L61) | 0.22 | About 0.14 for the carrier (swing ≈ 0.55 × a 0.31 s stride ≈ 0.17 s) | **RETUNE** + TEST (unit/gaitcore asserts 0.22-0.45) |
| Swing lift | `gait.js` L429: lerp(0.14, 0.5, (v-2.4)/6.6), 0.23 m at a jog | | 0.10-0.15 m for the carrier (low, quick steps). Back-kick only in sprint bursts (red soles at f124-127). | RETUNE |
| Hip height | `gait.js` RUN_HIPS -0.03-0.003v (L50) | | Carrier knees bent about 40-60°: hips about 0.06-0.10 m lower than our run (magnitude uncertain) | RETUNE |
| Forward lean | `gait.js` L997: 0.03+0.09R+0.05·sstep, about 0.12 rad at a jog; accel term clamp(0.045·acc, -0.15, 0.25); brake -0.18 | | Carrier 0.17-0.44 rad. Acceleration cap 0.25 → 0.5-0.6 for bursts after stops and cuts (35-45° measured). Sole stops upright (0 to -0.1). | RETUNE |
| Arms | `gait.js` L1006 amplitude (about 0.62 rad at a jog), L1007 elbows | Fore-aft swing only | Carrier swing amplitude 0.3-0.45 rad, elbows about 1.5 rad, plus a NEW abduction term of 0.7-1.2 rad (40-70°). Sole moves: both arms 1.0-1.4. Cuts: the turn-side arm straight out at shoulder height. | **NEW** + RETUNE |
| Head | (no dribble head term in the code map); NECK_CAP 0.95 (L652) | | NEW: pitch down 0.4-0.7 rad toward the ball in close control and through each contact; lift to 0-0.2 above 5 m/s between touches; yaw leads body turns by 0.03-0.1 s | **NEW** |
| Wide base | `gait.js` halfW (L89): hipX - 0.012 - 0.03R | Narrow | Feet 0.6-0.9 m apart for sole moves, squaring up and side shuffles | **NEW** (pose mode) |

### 5.5 Turns, cuts, braking

| Item | Knob | Current | Target | Type |
|---|---|---|---|---|
| Cut rule | `mover.js` L94-96, L182-192: cutAngle 35°, cutMin 3.0, cutFloor 0.3 | Any heading change over 35° above 3 m/s plants and brakes; a 90° sprint cut loses 35-55% | In close control: a change of 80-90° or less made with a redirect touch keeps at least 85% of speed. NEW "step-turn": the heading jumps up to 60-80° on the strike that makes the touch, pivoting on that planted foot. Over 120°: a plant cut down to 0-1.5 m/s (cutFloor 0-0.3; the current 0.3 is fine). | **NEW** + RETUNE + TEST (unit/mover) |
| Brake rates | `mover.js` brake 7.5; plant 9·clamp(...) (L90-97) | 7.5 / 9 m/s² | Ball carrier: about 13-15 m/s² for stops, up to about 20 for hard cuts | RETUNE |
| Turn rate when slow | `mover.js` wMax ≈ 9·(0.85+0.003·agility) ≈ 9 rad/s at 50; faceRate 12 | | Below 1.5 m/s in control: 11-16 rad/s (180° in 0.23 s, f12-19 and f117-123) | RETUNE |
| Foot pivot | `gait.js` L652: PIV_RATE 8, PIV_MAX 0.6 standing / 1.0 running, PIV_HARD 1.15 | | During close-control turns: up to 2.6-3.0 rad on one planted foot at 11-16 rad/s | RETUNE + TEST (uf-turn) |
| Hard-cut pose | `gait.js` G.cut L622 (v > 3, headRate > 1.67); wide plant L337-344 (at most 0.175 m) | | For cuts over 120°: brake foot 0.5-0.9 m wide (lunge); hips down 0.3-0.45 m (about knee height) for 0.15-0.33 s; trunk tilted about 45° into the new direction; turn-side arm out | **NEW** |
| Burst | `mover.js` a0 = (6+0.025p)·accelMul·1.1 ≈ 7.98 | Average about 6 m/s² from 0 to 4.5 | About 9 m/s² on average (0 to 4.5 in 0.5 s) for a carrier burst: about 1.3x a0 (low confidence) | RETUNE (low priority) |
| Hard stop | `gait.js` brakeT 0.25 s, plant 0.45-0.6 m ahead | | Keep brakeT (the clip shows 0.27-0.33 s). Add a sole on the ball first, and/or one long heel-first reaching step of about 0.9-1.0 m (#8). | NEW |

### 5.6 Sole moves and fakes

| Item | Knob | Current | Target | Type |
|---|---|---|---|---|
| A/D drag | `football/actions.js` FAKE L740, rollTo | 0.42+0.25·ctrl/110 across, 0.3 back, rolls to a stop | 0.45 across + 0.6 back (f30-37). **Released rolling at 3.5-4.5 m/s** in the new direction. Sole contact 0.17-0.23 s (f31-35/36). | RETUNE + NEW (release speed) |
| S drag | same | 0.65 straight back | Drag 0.3 back under the body (0.2 s), then the same sole pushes the ball out the reverse way at 3-4 m/s (f6-13). When braking from a run (f173-181), drag about 0.7 back at 3-3.5 m/s. | RETUNE |
| Drawn drags | gaitPlace at the clip hand-over clears the via | Drags are never drawn | Sole on the ball top for 3-7 frames; the other foot planted as the pivot | **NEW** |
| Sole stop | none | | NEW: a stop request at 2 m/s or more in control makes the next landing foot (either side) come down on top of the ball. Ball to 0.5 m/s or less within 2 frames. Body to 0.5 m/s or less within 0.27-0.33 s. | **NEW** |
| Double sole roll | none | | NEW: right sole across 0.3-0.4 m at about 2 m/s (0.1-0.13 s), left sole catches and rolls back at 2-3 m/s (0.13 s), then a 180° spin and a push out to about 5 m/s (f109-121) | **NEW** (optional move) |

### 5.7 The shot

| Item | Knob | Current | Target | Type |
|---|---|---|---|---|
| Release to contact | `football/actions.js` ACT.TC_MAX 0.18; canStrike tc formula L145; first-time min(tc, 0.05) L488 | At most 0.18 s, so every live strike starts late | Allow 0.30-0.35 s for a step-in strike (ball ≤ 2 m/s, within about 1.2 m) so the plant step is drawn. The clip: set-touch end to contact 0.33 s, plant to contact 0.20 s. | RETUNE |
| Late-start rule | `moves.js` L177, L872 | Always late in open play; plant spot ignored; swing squeezed into 0.1-0.18 s | Do not start late when tc ≥ 0.30. Play the plant step and backswing. | **NEW** rule |
| Plant before contact | `moves.js` PLANT_BACK 0.14 (L659); preStep clamp(0.14+0.3d, 0.16, 0.3) (L531) | Plant at -0.14 | Plant at **-0.20 s** (6 frames). The plant step of 1.0-1.1 m takes about 0.13 s (f243 to f247). | RETUNE |
| Plant position | `moves.js` KINDS.instep.plant [0.26, -0.08] (L64) | | Relative to the ball at contact: **across 0.30-0.43 (best about 0.35), along -0.15 to 0** (ball 0-0.15 ahead of the plant foot). The current [0.26, -0.08] is slightly narrow; about [0.33, -0.08] fits. Relative to the ball at plant: [0.27, 0 ±0.15]. | RETUNE (small) |
| Backswing | WIND.SWING 0.13 (L697); strikePath back 0.42+0.1p (L1121); top height gy+0.34+0.08p (L1123-1127) | | Toe-off -0.16 s; top -0.10 s (WIND.SWING → 0.10); heel 0.4-0.6 m (about 0.5 at p ≈ 0.8); knee 100-120°. Keep back distance. | RETUNE |
| Contact face | strikePath laces pitch 0.65 (L1097-1106); lowHigh·0.05 | | Locked ankle, toe down and slightly out. Contact 0.03-0.05 m below centre → launch 5-12°. | keep / small RETUNE |
| Follow-through timing | Tft = min(clamp(dist/(0.4·vFoot), 0.28, 0.4), ...) (L1148); height ftH (L1132); top 0.75 ahead, 0.18 across (L1133) | Peak 0.28-0.4 s after contact | **Peak 0.10-0.13 s** after contact at 0.8-1.0 m. Keep the sweep toward the support side. | RETUNE |
| Landing | kLand L1151-1156: at dur-0.02 (0.56 s after contact for instep), +0.2 along, 0.12 out; KINDS.instep.dur 0.80 | | Kicking foot lands **0.34-0.41 s after contact (best 0.37)**. The plant foot pushes off at +0.22-0.27 s, so there is a short flight of 0.07-0.13 s. dur ≈ contact + 0.38. ACT.FOLLOW 0.28 is too short; about 0.37. Landing position not verified (the source's "about 0.9 m ahead of the plant" could not be checked). | RETUNE |
| Body | strikeBody L1201-1229: roll s·0.12 at contact; spine keyframes; support arm 1.15 | | Lateral lean toward the plant side peaks at the backswing top (about 0.2 rad), 0.15 or less at contact. After landing, pitch forward 0.5-0.7 rad. Support arm 1.4-1.57 from the top to contact, pulled in by +0.05 s. Head on the ball until +0.10-0.15 s. | RETUNE |
| Body speed through the strike | strikeRoot (actions.js L160, moves.js L623): 0.55 at contact | | Step-in shot: the body keeps going (0.85-1.0). Low confidence. | RETUNE (optional) |
| Set touch | none | | NEW (optional): for a strong-foot shot on a ball rolling 3 m/s or more, a weak-foot cushion touch 0.33-0.4 s before contact slows it to 1-2 m/s and leaves it about 0.27 m to the kicking side of where that foot then plants | **NEW** |
| Turn-and-shoot | none | | NEW (optional): right inside redirect at foot strike, then a 150-170° spin on the right pivot in about 0.23 s, then set, plant, strike (contact 0.57 s after the turn touch) | **NEW** |
| Shot outcome | unit/strike | | At about full power: 22-32 m/s, 5-12° elevation | TEST |

---

## 6. Acceptance checks

### 6.1 Automated, simulation only (extend `qa/u27-control.mjs`, `qa/unit/gaitcore.mjs`, `qa/unit/mover.mjs`)

Setup: att-carrier drill, right foot, pace about 55, opponents removed unless stated.

- **CC-1 touches on footfalls.** Straight close carry at 4.0-6.0 m/s for 10 s:
  - at least 90% of keep touches fall within 1 sim step (1/60 s) of a strong-foot footfall;
  - touches per strong-foot footfall 0.8-1.0.
- **CC-2 touch rate.** 2.6-3.8 touches/s at 4-6 m/s in close carry; 1.4-2.2/s in push-and-run.
- **CC-3 carrier gait.**
  - 300-450 steps/min at 4-6 m/s; step length 0.6-0.9 m; duty 0.38-0.50;
  - swing time 0.13-0.20 s;
  - the gait without the ball is unchanged (current tables within 5%).
- **CC-4 ball at the touch.** At each carry touch:
  - the ball centre is 0.10-0.20 m beyond the touching toe tip (a gap of 0-0.09 m);
  - side offset from the touching foot's axis is within ±0.10 m;
  - the ball is 0.4-0.75 m ahead of the pelvis.
- **CC-5 ball between touches.** For at least 85% of frames:
  - ball to leading toe 0.25-0.7 m, with a maximum of 1.05 m in close carry;
  - side offset from the root 0 to +0.2 m (strong side) for at least 80% of frames.
- **CC-6 push speed.** Ball speed right after a carry touch (after the 2-3 frame contact) is 1.0-1.3 times player speed.
- **CC-7 foot use.** Scripted drill: 4 s straight, 2 left redirects of 60°, 1 right redirect of 60°, 2 stops, 1 S-drag, 1 shot.
  - Strong foot makes at least 65% of touches.
  - Every redirect uses the strong foot: inside or front when turning to the weak side, outside when turning to the strong side.
  - Every stop is a sole touch by the foot that lands next.
- **CC-8 sole stop** from 4.5 m/s:
  - sole contact starts within 0.2 s of the input;
  - ball 0.5 m/s or less within 0.067 s of contact;
  - player 0.5 m/s or less within 0.35 s;
  - ball rests 0.25 m or less from a foot.
- **CC-9 redirect at speed.** A 60° key change at 4.5 m/s:
  - the touch comes at the next strong-foot strike (within 0.37 s);
  - speed 0.3 s after the touch is at least 85% of the speed before;
  - body yaw is within 15° of the ball's new heading within 0.33 s.
- **CC-10 hard cut.** 150° at 5 m/s:
  - speed 1.5 m/s or less within 0.17 s of the cut touch;
  - heading within 20° of the reverse by 0.3 s;
  - back to 4.5 m/s within 0.7 s.
- **CC-11 standing turn in control.** 180° in 0.27 s or less.
- **CC-12 S-drag.**
  - Sole contact 0.13-0.25 s.
  - Ball moves 0.25-0.6 m back under the body (up to 0.75 m when braking from a run).
  - Ball is released at 2-4.5 m/s in the new direction.
- **CC-13 standing rest.** Ball within 0.3 m of the nearest foot.

### 6.2 Automated, browser and drawn body (extend `qa/tr9-anim.mjs` MV-9 to close control; `qa/u27-feel.mjs`; `qa/u28-shotkeys.mjs`; `qa/wpK-strike.mjs` for the open-play path)

- **DR-1** Every close-control touch has a drawn foot (100%), and it is the foot named in the event.
- **DR-2** The frame where the drawn contact face is closest to the drawn ball surface is within ±1 frame (33 ms) of the frame where the drawn ball starts its new velocity. That closest distance is 0.04 m or less.
- **DR-3** The face matches the event part:
  - carry push (toe/front): the toe cap is the closest point, at 0.03-0.08 m height, with toe pitch 0.3 rad or less, and stays within 0.03 m of the ball for 2-3 frames;
  - inside and outside: the right face point is closest to the ball;
  - sole: the sole point stays within 0.03 m of the ball top for at least 3 consecutive frames.
- **DR-4** The touching foot lands within 0.1 s after contact starts, with its footprint 0-0.3 m behind the ball's position at contact and within ±0.12 m to the side.
- **DR-5** No snapping: foot bones turn 0.35 rad/frame or less, and the swing never jumps more than 0.08 m in one frame toward the ball.
- **DR-6** Posture at 4-6 m/s in close control:
  - trunk lean 0.17-0.45 rad;
  - upper-arm abduction at least 0.5 rad;
  - head pitched down at least 0.3 rad within ±0.1 s of each touch;
  - hips at least 0.05 m lower than the no-ball run at the same speed.
- **SH-1** Shot from a ball rolling 0.5-1.5 m/s, 0.6-1.0 m ahead, approach 2.5 m/s or less:
  - plant touchdown 0.17-0.23 s before contact;
  - toe-off 0.13-0.20 s before;
  - backswing top 0.07-0.13 s before;
  - heel 0.35-0.65 m high at the top.
- **SH-2** Plant foot at contact: 0.28-0.45 m to the support side of the ball centre and 0-0.2 m behind it.
- **SH-3** At EV.CONTACT the laces are within 0.05 m of the ball surface and ankle pitch is at least 0.6 rad.
- **SH-4** Follow-through:
  - foot peak 0.75-1.05 m high at +0.08 to +0.16 s;
  - after the peak the foot moves at least 0.05 m toward the support side.
- **SH-5** Landing:
  - the kicking foot lands at +0.32 to +0.44 s;
  - the plant foot stays down until at least +0.2 s;
  - a flight of up to 0.13 s between plant toe-off and landing is allowed;
  - landing distance is not asserted (unverified in the clip).
- **SH-6** Support arm abduction at least 1.3 rad from the backswing top to contact.
- **SH-7** In the SH-1 case the clip does not start late, and the plant step is drawn.
- **SH-8** (unit/strike) Full power: 22-32 m/s, 5-12° elevation.

### 6.3 Existing tests that will conflict, and must be updated on purpose

| Test | Current assertion | Change |
|---|---|---|
| `qa/unit/gaitcore.mjs` | Swing time 0.22-0.45 s | Allow 0.13-0.20 s in carrier mode |
| `qa/tr2-gait.mjs` | Cadence within 5% of the table | Add the carrier table as a case |
| `qa/unit/mover.mjs` | A 90° sprint cut loses 35-55% | Keep for players without the ball. Add: a 60-80° redirect in control at about 4.5 m/s keeps at least 85%. |
| `qa/u26-keep.mjs` | Standing rest at most 0.6 m | At most 0.3 m |
| `qa/u27-control.mjs` | CTL_MAX 0.7 | Fine for close carry. Allow up to 1.05 m right after a push-and-run touch. |
| `qa/uf-turn.mjs` | Pivot and step-per-70° limits | Close-control pivots of up to 2.6-3.0 rad on one stance foot will break these. Exempt close-control turns, or adjust the limits. |

### 6.4 Side-by-side picture checks

Use the same 30 fps, the same frame windows, and the game camera set to about 9 m behind, about 3.8 m high, 25° pitch, 9:16 portrait, vertical field of view about 50°. Clip frames are in `.../fc27/full/fNNN.png`. Player-following tiles in this style can be made with `work/lead/py/ptile.py` (or `work/chk/py/ct.py`, which writes to `work/chk`).

| Clip frames | What to compare | Game moment |
|---|---|---|
| f84-103 (`work/lead/P-body084.png`, `P-feet084.png`; `work/chk/b-084.png`, `z-090.png`) | Fast carry: about 4-5 steps per 20 frames, L-R pushes at f86/f92 with the foot landing flat against the ball, ball 0.3-1.0 m ahead | Close control, run at 5.5 m/s straight across the screen |
| f155-172 (`P-low155.png`, `P-c166.png`; `work/chk/b-154.png`, `z-155.png`) | One right-foot touch per stride at foot strike (f158, f168); short quick steps | Close control, jog at 4.2 m/s with a 60° left turn |
| f186-201 (`P-c184.png`, `P-f186.png`; `work/chk/z-195.png`) | Burst lean of 35-45°; duty about 0.45; push at f196-198 | Burst after a stop |
| f1-19 | Right sole drag-back, crouch, outstretched arm, 180° spin | S-drag |
| f28-45 (`work/chk/b-028.png`) | Sole trap and lateral roll, 0.9 m stance, arms wide, head turns first | A/D drag and turn |
| f103-123 (`P-b102.png`) | Heel reach, right sole, left sole, spin, push | Stop and turn sequence (new move) |
| f168-190 (`work/chk/b-166.png`) | Left knee high, sole stop, drag back about 0.7 m, square up, right outside push, pivot and burst | Stop, then a push to the right |
| f72-81 and f125-145 (`P-a062.png`, `P-b125.png`; `work/chk/b-125.png`) | Inside cut-back with deep crouch; outside chop (contact hidden at f131) with deep lunge, turn-side arm out | Hard cuts at 5 m/s, left and right |
| f44-50 (`P-a043.png`; `work/chk/z-045.png`) | Toe/front push of a flat landing foot at foot strike (f47-48), foot plants where the ball was | Single carry touch at 4.5 m/s, frame by frame |
| f232-266 (`L-s232.png`, `L-s240.png`, `L-legs241.png`, `L-shot248.png`; `work/chk/z-238.png`, `s-246.png`, `z-251.png`, `z-253.png`, `z-256.png`, `z-262.png`) | Inside turn touch, spin on the right pivot, left set touch, left plant (f247), backswing (f249-250), contact (f252.75), follow-through peak (f256-257), plant toe-off (f260-261), landing (f264 ±1) | Turn-and-shoot from a slow ball |

Single reference frames to paste beside game frames: f6, f9, f33, f36, f47, f86, f92, f103, f110, f115, f130, f136, f173, f181, f188, f197, f214, f235, f241, f247, f250, f253, f256, f264.

---

## 7. What the clip could not show

**Measurement limits:**
- Absolute metres and m/s depend on a rough camera model:
  - speeds ±25%;
  - depth distances ±40%;
  - shot speed 22-32 m/s;
  - distance to goal 7.6-12 m.
- Step timing is ±1 frame, about ±20% on cadence. The very high cadence (5-8 steps/s) is consistent across four independent readings, but it could be an FC animation style rather than anything physical.
- Duty factor (about 0.45) comes from a single clean cycle.
- Hip drop, knee angles, arm angles and trunk pitch are judged by eye. Fore-aft trunk lean and pelvis rotation at the shot cannot be seen with the camera directly behind.
- The ball's rolling slowdown is inconsistent across the clip (about 1-5 m/s²). It is not usable for tuning roll friction.
- Body speed during the shot approach (1-2.5 m/s) is unresolved.
- Ball ground speed over the last 0.15 s before the shot (about 1 m/s) could not be confirmed. The camera moves about 12-20 px/frame at the near ground during f244-266, and the plant shoe is hidden under the jeans.
- The kicking-foot landing (f264 ±1) is judged from the foot's fall slowing down relative to the scene, not from a visible contact. Its position on the ground is not measurable.
- The plant-foot toe direction and whether the shot curves are uncertain.
- The game's player stats are unknown, so none of this can be scaled by pace, dribbling or agility.

**Touches I could not confirm:**
- Hidden or partly out-of-frame: #4 (f64-66), #5 (f73-74), #11 (f119-121), #12 (contact at f131 hidden), #15 (f168, may be no contact).
- Possible hidden touches at f25-29 and f124-127.
- The foot used for #19 and #20 is probably left (low confidence).
- The foot part at #14 (inside vs toe), #22 (inside vs sole) and #23 (inner vs full laces) is uncertain, and so is whether the left foot touches the ground briefly at f241-242.

**Situations the clip never shows:**
- Sprinting at full speed with the ball (the fastest carry is about 5-7 m/s).
- Walking dribbles.
- Left-footed players.
- Step-overs or other skill moves.
- A dead-ball or long run-up shot.
- Passes.
- Receiving a pass from a teammate.
- What happens when the defender wins the ball.

**Off limits by instruction:** Neither the author nor the checker opened the game repository. All knob locations and current values come from the code map.

---

## Files

All lead work files are in `/tmp/claude-0/-home-user-LegendRising/d7981b91-2350-5c6d-acea-ac57541f3685/scratchpad/fc27/work/lead/`:

- **Player-following tiles:**
  - `P-body084.png`
  - `P-feet084.png`
  - `P-low040.png`
  - `P-low155.png`
  - `P-c166.png`
  - `P-b102.png`
  - `P-a043.png`
  - `P-a062.png`
  - `P-c184.png`
  - `P-f186.png`
  - `P-b125.png`
- **Shot tiles:**
  - `L-s232.png`
  - `L-s240.png`
  - `L-legs241.png`
  - `L-feet240.png`
  - `L-shot248.png`
- **Player marker track for f1-347:** `py/fwd.txt` and `py/bwd.txt` (gaps at f88, f130-131, f307-335).
- **Scripts:**
  - `py/star.py` tracks the yellow marker above the player.
  - `py/ptile.py` makes the player-following tiles.

The segment readers' files (A-, B-, segC-, D-, S-) are in `/tmp/claude-0/-home-user-LegendRising/d7981b91-2350-5c6d-acea-ac57541f3685/scratchpad/fc27/work/`.

Checker files are in `/tmp/claude-0/-home-user-LegendRising/d7981b91-2350-5c6d-acea-ac57541f3685/scratchpad/fc27/work/chk/`:
- **Tracking tiles:** `c-001.png`, `c-040.png`, `b-028.png`, `b-084.png`, `f-084.png`, `b-125.png`, `b-154.png`, `f-154.png`, `b-166.png`, `b-186.png`, `f-186.png`, `g-188.png`, `g-200.png`, `s-232.png`, `s-246.png`
- **Fixed-crop zooms:** `z-045.png`, `z-090.png`, `z-155.png`, `z-195.png`, `z-238.png`, `z-248.png`, `z-251.png`, `z-253.png`, `z-254.png`, `z-256.png`, `z-258.png`, `z-260.png`, `z-262.png`, `z-g247.png` (gridded, 10 px per cell)
- **Full frames:** `full-256.png`, `full-248s.png`
- **Scripts:** `py/ct.py` (tracking tiles), `py/zt.sh` (fixed-crop zoom tiles) and `py/bm.py` (block-match camera motion)

---

## Verification

**Checked at full size or zoomed** (frames in brackets):
1. Foot identity and right-foot dominance [f28-39, f40-55, f84-99, f154-181, f232-253]. Confirmed.
2. Touch at foot strike for #3, #7, #14 and #18 [f45-50, f90-94, f155-160, f195-199]. Confirmed.
3. Carry contact part and height [f46-49, f91-94, f196-198]. Corrected.
4. Ball distance from the foot [f46, f160]. Confirmed, roughly.
5. Cadence R158 / L162-163 / R168 and L86-88 / R92 [f154-169, f84-99]. Confirmed.
6. Sole moves #2 and #16 [f28-39, f166-181]. Confirmed; the #16 drag was corrected.
7. Outside chop #12 [f125-136]. Cannot tell.
8. #21 and #22 [f232-249]. Confirmed, but the #22 foot part cannot be told.
9. Shot timeline [f246-269]. Confirmed through the follow-through; the landing was corrected.
10. Shot plant distance and contact part [f247-254]. Lateral distance confirmed with wider error; fore-aft cannot be told; laces and toe-down confirmed; inner laces cannot be told.

I also block-matched the near ground marking to measure camera motion during f244-266.

**Changed:**
- §2.3, §5.3 and DR-3: the carry contact is now the toe cap of a nearly flat landing foot, low on the ball, for 2-3 frames. It was laces, toe down, at ball-centre height.
- §1 rows #3, #7 and #18: contact spans and foot parts.
- §2.1: push contact lasts 2-3 frames.
- §1 #16 and §5.6: drag about 0.7 m at 3-3.5 m/s.
- §1 #12, §0 #9 and §3.4: chop confidence lowered to medium-low, and the angle marked as camera-dependent.
- §4: landing moved to f264 ±1 (+0.34 to +0.41 s); plant heel-off at f259 and toe-off at f260-261, with a short flight.
- §5.7: Landing row and ACT.FOLLOW (about 0.37).
- SH-5 and SH-2 tolerances.
- §4 positions: ball at contact is +0.35 (0.30-0.43) across and 0 to +0.15 along. Landing position marked unverified.
- §5.7: plant position.
- CC-4: tightened to 0.10-0.20 m.
- §0 #4 and §7: ball speed at the shot downgraded to low confidence.
- §6.4: shot frame window and reference frames (f262 replaced by f264).

**Unchanged and not re-checked:** drag-back #1, #4, #5, #8-#11, #13, #17, #19, #20, the duty factor, the posture, arm and head values, and the ball flight.