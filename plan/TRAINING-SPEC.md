# Training Mode and football rework: approved spec (user brief of 2026-10-11, decisions locked)

This is the user's brief "COMPLETE FOOTBALL GAME REWORK, TRAINING MODE, ANIMATION TESTING, FULL MATCH QA, AND FIRST-TIME EXPERIENCE"
condensed without dropping requirements, plus the user's answers. Where this file and DESIGN.md / ADDENDUM-feel.md differ, THIS FILE WINS.
Player-facing text: no em dashes, natural human wording.

## 0. Locked decisions and scope
- STOPPED: parody club/player names and nationality world; acrobatics/atmosphere polish. PAUSED: mobile controls (A1.9) and save codes (A1.10). Focus Touch (hold-Ctrl foot control) is LATER, not now.
- Intro order: unchanged. The player stays hidden until created. Do not touch the intro. The "apartment visible a few seconds before the intro" flash (brief part 45) is fixed ONLY at the very end and ONLY if the user asks.
- First-time tutorial (brief part VII): verify each beat and fix only what is broken; no redesign. Focus is training and gameplay.
- Training pitches are CAGES, not stadiums: user picks Full (105 x 68), Half (one goal) or One-goal small area. Fenced so the ball rebounds when it leaves play. In drills, "out of play" is a setting (rebound off the cage, or stop for the restart). Full Match always uses real lines and restarts.
- Admin panel: Numpad 1 (event.code "Numpad1", distinct from Digit1) plus laptop shortcut Ctrl+Shift+1. Never opens while typing; Training Mode only.
- Drills: up to 6 attackers vs 6 defenders plus an optional AI goalkeeper. Full Match is 11 v 11.
- Goalkeeper is ALWAYS AI. Never selectable, never switchable-into, never a training role, never counts as an attacker/defender.
- Shield key: C (hold). Ctrl also shields when the game is in full screen with keyboard lock (navigator.keyboard.lock on Chromium) because Ctrl+W would otherwise close the tab; outside full screen only C. Show a one-time tip suggesting full screen.

## 1. Rules for the implementation
- One football engine. Training uses the same movement, ball, touch, pass, shot, tackle, AI, goalkeeper, rules and match systems as the career. No training-only copies.
- Fix root causes; no fake mechanics, no delays to hide bugs, no "force second half" buttons, no decorative controls, no settings that only change a label.
- Training is a sandbox: never writes the career save, money, trust, progression. Clean up NPCs, balls, listeners, timers, update loops on reset and on exit; repeated enter/exit/reset must not accumulate anything.
- Reuse the existing attribute system (its real names and ranges, effSkill), interaction system (spots / E), UI sheets, zones, ball.js, touch.js, strike.js, mover, stamina, moves.js, human.js, sim.js / bridge / controller.
- Verify everything; report honestly what was and was not tested.

## 2. Football foundations (fix in the real game)
- Movement: walk (rework the janky walk), jog, sprint, progressive acceleration and deceleration, turning that differs standing vs sprinting, lateral, stop/restart, with and without ball, jockeying, recovery after tackles. No foot sliding, no snapping rotations, not a generic FPS slide.
- Stamina: sprint drains (longer drains more), release recovers, prolonged sprint degrades acceleration/top speed/repeated actions (and may affect pass/shot reliability). Never fully disables. One model for matches and training.
- Shooting: never teleports or flies perfectly; direction, body orientation, ball position, foot, power, elevation, accuracy and other stats, fatigue, pressure, contact timing; low accuracy = controlled near-miss of the intended target; real trajectories, travel time, curl.
- Passing: short, long, through, into space, to feet, to moving teammates; accuracy by stats; AI weighs receiver position and movement, lanes, nearby defenders, space, stats, stamina, pressure; never a pass to an impossible target.
- Ball physics: passes, shots, crosses, rebounds, posts/crossbar, ground, player contact, tackles, interceptions, aerial balls, deflections, possession changes. Animation and ball agree; never teleport the ball to an animation.
- Offside: tracked at the moment the ball is played; scenario generation and AI passing respect it.
- Camera: smooth, stable, believable eye level, subtle reactions only, ball readable; no top-down remnants.
- HUD: minimal (time, score, stamina, contextual controls, small scenario info).
- Teammate calls: subtle (movement, small name tags, audio, small prompts), no giant arrows. Position-based positioning.
- Halftime: trace the real first-half -> half-time -> second-half -> full-time flow in actual player use (card clicks, bench, resets). Fix the cause. Verify repeatedly, including after Reset Match and Reset Current Half.
- Goalkeeper AI: shots, crosses, rebounds, corners, close range, low/high, deflections, penalties; believable movement, ready stance, dives, landing, recovery; no teleporting.

## 3. Ball control, first-to-ball, shield and tackle formulas (core engine, matches and training)
Starting values; expose them as tunables in the admin panel.

First to the ball: for each nearby player, time to intercept the ball's predicted path using that player's mover (acceleration, top speed, turn). Earliest wins. Arrivals within 0.15 s of each other become a duel (shield/control ratings).

Control zone and touch:
```
c   = (0.55*BallControl + 0.20*Agility + 0.15*Composure + 0.10*Balance) / 99
vc  = 8 + 10*c                                   comfortable ball speed (m/s)
R   = 0.9 * (0.6 + 0.8*c) * fSpeed * fHeight * fAngle * fFatigue   control radius (m)
  fSpeed   = 1 / (1 + max(0, v - vc)/8)
  fHeight  = 1 below 0.4 m, easing to 0.6 at 1.4 m (thigh/chest), above that is a header
  fAngle   = max(0.4, 0.7 + 0.3*cos(angle to facing))
  fFatigue = 0.85 + 0.15*breath
q   = clamp(1.2*c - 0.04*max(0, v - vc) - 0.2*pressure - 0.1*(1 - breath), 0, 1)
touch distance = 0.6 + 0.8*(1 - q) metres
```
When the ball enters R the player controls it automatically, with a foot/thigh/chest animation chosen from the real ball height and driven by the real ball. Low q gives a heavier touch.
Map stat names to the real attribute system (e.g. derived ctrl, balance may need to be derived if absent; document the mapping).

Shield (hold C, or Ctrl in full screen) while in control:
```
S = 0.45*Strength + 0.35*BallControl + 0.20*Balance
D = 0.45*Tackling + 0.30*Strength + 0.25*DefAwareness
p(defender wins a challenge) = clamp( 1/(1+exp(-(D - S)/8)) * angle * fatigue, 0.05, 0.90 )
  angle: from behind 0.6, side 1.0; the shield turns the shielder's back to the defender
```
While shielding: up to about 60% of jog speed, ball on the far foot, body between defender and ball, extra breath cost against a stronger defender, persistent pushing from behind raises foul chance. 50/50 duels use the same with each player's control rating added.

Tackle (standing and sliding), physics-driven animation:
```
reach  standing: 0.95 + 0.25*Tackling/99 m
       slide:    1.6 + 0.9*(speed/topSpeed) m, momentum carried, grass friction mu about 0.55
T = 0.50*Tackling + 0.25*Strength + 0.25*DefAwareness
C = 0.50*BallControl + 0.30*Agility + 0.20*Balance   (or S while shielding)
p(win) = clamp( 1/(1+exp(-(T - C)/8)) * timing * angle, 0.05, 0.92 )
  timing: 1 when the foot reaches the ball within +-0.08 s of its closest point, falling to 0.3 at +-0.3 s
  angle:  front 1.0, side 0.9, behind 0.5; behind or late raises foul chance
recovery: 0.45 + 0.6*(1 - Agility/99) s after a slide, longer after a miss
```
The tackling foot is IK-guided to the real contact point; a won tackle moves the ball by contact physics; a slide carries real speed and decelerates by friction; a miss leaves the player down for the recovery time.

## 4. Training Mode
- Main menu "Training" button matching the title style. Opens the training environment without starting or touching a career; clear exit back to the main menu; full cleanup.
- Cage pitches: Full / Half / One-goal, same world units and pitchspec geometry as matches, low-poly cage fencing, rebound physics.
- Training Hub categories: Set Pieces, Attacking, Defending, Ball Receiving and First Touch, Match Scenarios, Full Match, Free Play. Each: name, short description, configuration, Start, reset, back to hub. Simple, not a dashboard.
- Physical cones around the pitch per scenario/category, opened via the existing interaction system at sensible distances, fixed positions, one scenario at a time (end or reset first). Hub menu also selects scenarios.
- Shared configuration: my role, initial possession, taker/receiver/attacker/defender/support, attackers 0 to 6, defenders 0 to 6, teammates/opponents on/off, AI goalkeeper on/off, starting positions, my attributes, attacker average, defender average, goalkeeper attributes (separate), ball placement and trajectory, scenario options. Only show relevant settings. Every setting changes the real configuration.
- Attribute editor: the real attributes (names, ranges); individual edits, current values, min/max, reset, Low/Average/High/Max presets. NPC averages with modest reproducible variation (seeded). Changes affect real behavior.
- Presets for every scenario (and Free Play settings, Full Match config): Save (named), Load (list with enough info), Edit and overwrite (with confirmation), Save as new, Delete (with confirmation). Persist across sessions in the game's storage, separated by scenario type, validated (old or incomplete presets handled safely). Save configuration only, never runtime state.
- Quick menu / shortcut: Restart Current Scenario, Replay Last Scenario (restores the last setup, not the last attempt's end state), Return to Configuration, Return to Hub; in Full Match also Reset Current Half and Reset Match (clearly distinguished). Resets restore positions, facing, possession, ball position and velocity, animations, AI states, stamina where appropriate, flags, temporary effects, objects, listeners.
- Scenario lifecycle for every scenario: configure, prepare, spawn or reuse participants, position, place ball, activate, play, reset or complete, clean up. No full environment reload unless truly needed.
- Free Play: no objectives; Q spawns or resets ONE ball in front of the player (facing, sensible distance, valid height, never inside the body); optional practice opponents.
- Admin panel (Numpad 1 / Ctrl+Shift+1): Player (attributes, height via the existing whole-body scale with collisions, contact points and foot placement consistent, physical traits, reset, presets); Stamina (infinite on/off, restore, set value); AI (attacker/defender averages, goalkeeper attributes, active counts where allowed); Ball (spawn/reset, reset position, reset scenario, ball options); Scenario and Match (restart, replay last, back to config, back to hub, reset half, reset match); formula tunables. Live where safe, otherwise applied at the next safe state with a note.
- Training UI: small, shows scenario, role, counts, goalkeeper, preset, restart/replay/config controls, admin and Q hints, free-kick distances. Never covers the ball.

## 5. Scenarios
- Ball Receiving and First Touch (highest priority): ground to stationary / moving; slow / fast; from left, right, behind, an angle; into space; while sprinting, jogging, moving laterally; under pressure; first-time pass; first-time shot; chest; thigh; foot control of an aerial ball; header to control or redirect; high aerial; low bounce; high bounce; needing adjustment steps; slightly behind; slightly ahead; while turning; facing away from the passer; while shielding; then turn; then sprint; then through ball; then cross; then shot. Configurable passer, receiver, stationary/moving, defender and distance, direction, speed, initial height, ground/bouncing/aerial, intended control type, control/redirect/pass/shoot, attributes. Animations: anticipation, adjustment steps, foot placement, body orientation, hip/torso rotation, arms and balance, weight transfer, contact timing, deceleration/redirection, recovery, transition; never an animation where the ball is not; no excessive locking.
- Attacking: from midfield; me alone; with teammates; AI carrier while I play another role; me requesting a pass; runs behind; winger, attacking midfielder, support roles; GK with no defenders; GK with defenders; no GK; counts configurable (0 allowed). All pass types incl. one-touch and cross-field, receiving under pressure. AI teammates see the user and make sensible decisions; never forced impossible passes. Defenders track without crowding one point. Instant replay.
- Defending: 1v1, 2v1, 1v2, 1v3, many v many, lone attacker vs GK, positioning without GK, AI attackers passing, AI carrying at me. Jockeying, lateral movement, tracking, closing space, interceptions, standing and sliding tackles (formula above), recovery, defensive turning and acceleration, body position, shielding, reactions to through balls, box positioning, transition to attack after winning the ball.
- Match scenarios (one shared framework): wing play, receiving on the wing, crossing from the wing, combinations, one-twos, overlaps, underlaps, through-ball timing, counters, breaking a line, 2v1, 1v2, 1v3, 2v2, 3v2, 3v3, vs low block, receiving under pressure, turning away from a defender, playing out from defence, recovering possession, creating space, first-time passes, crosses to headers/volleys, loose balls, second balls. Configurable counts, GK, positions, control, possession, attributes, objective.
- Corners: I take; AI takes and I play in the box; attacker in the box; defender; support outside the box; designated receiver. Counts, GK, taker, controlled player, positions, marking, attributes. Ball at the correct corner. Crosses, short corners, runs, marking, headers, volleys, clearances, second balls. Instant replay.
- Free kicks (build mode, in order): 1 configure participants (attackers, defenders, wall size 0 to 6, wall on/off, taker, second taker with action: pass to main taker / decoy run / receive short and shoot / receive and carry, GK, positions, attributes); 2 place the ball (valid positions at various distances and angles; live "Distance to goal: 21.4 m" = horizontal ground-plane distance from the ball to the centre of the goal line, updating as the ball moves); 3 place the wall independently (distance to ball, lateral offset, alignment, size, presence; live "Distance from ball: 9.2 m", marked preview vs confirmed, ball distance shown too; moving the wall never moves the confirmed ball); 4 confirm and start (Confirm Ball Position, Confirm Wall Position, Adjust Placement, Start Free Kick; cannot start before placement). Wall = real NPCs in a coherent, evenly spaced line, never overlapping, never inside the ball/players/out of bounds; size 0 removes it; resizing repositions sensibly. Tests: distances, angles, no wall, small/large walls, wall distances, lateral offsets, resizing, indicator accuracy, preset save/load restoring ball, wall, size and measurements.
- Throw-ins: I throw; AI throws and I receive; I run to receive; I mark a receiver; I support for the second ball. Counts, location, thrower, receiver, positions, attributes. Throw animation, release, trajectory, receiving, first touch, possession transition; no teleport.
- Penalties: I take; AI takes while I play another outfield role where supported; GK on/off (empty-goal drill works); attributes incl. GK. Approach, strike, contact, direction, power, trajectory, GK reactions, saves, goals, rebounds. Instant retry.
- Free Play: see section 4.
- Full Match: the real match system; start from kickoff or from the bench (real substitution flow: control transfer, the AI player leaves, state preserved, no duplicates); team/role selection via existing config; Reset Match, Reset Current Half, Restart from Kickoff, Return to Hub; resets restore clock, half, score, ball, possession, positions, control, AI, events, flags, stamina, objects, timers; no stale timers or listeners; never touches the career.

## 6. Animation and AI refinement (use Training Mode to find and fix)
Walk (rework), jog, sprint, accel/decel, start/stop, turns, direction changes, lateral, jockey, standing and sliding tackles, recovery, dribbling, shielding, passing, through passing, crossing, shooting, first-time shooting, receiving, first touch, chest, aerial control, jumping, heading, landing, blocking, interceptions, collisions, and all transitions. Blend naturally, match speed and foot contact, no sliding/snapping/twisting/robotic returns to idle, responsive, respect the real ball. Find the root cause (asset, playback speed, controller conflict, priority, transitions, root motion, scaling, contact points, physics, AI interrupts, stuck states).
Goalkeeper animations: walking, repositioning, shuffling, ready stance, reactions, dives, saves, landing, recovery, return to ready.
AI: positions, passing options, passes, through balls, receiving, runs, support, tracking, marking, interceptions, challenges, tackles, loose balls, recovering shape, possession changes, crosses, aerial duels, decisions near goal. No ball-swarming, no idling when an action is obvious; holding position, marking, waiting and delayed runs are valid.

## 7. First day (verify, fix only what is broken)
Bulb from the furniture shop (EUR 3, checkout, POS, install interaction, natural text), mailbox with E, building notice board, fridge (tooltips only after the door is open; item name, effects and modifiers with real values, including an electricity event), bed (text matches the real sleep behavior and hours), hand plus two pockets, phone, apartment football as a real physical item, neighborhood and compass, 10:00 AM training rule, early arrival 30 to 60 min with the existing trust bonus (limited, not exploitable), hairstyle choice at creation and ownership afterwards (barber states), the same created character everywhere, training centre delivery area and bag to the gym fridge using the existing delivery system.

## 8. Performance
Profile first. Training cages with up to 12 NPCs plus GK and repeated resets: no leaks, no accumulating loops/listeners, efficient AI and animation updates, nothing inactive running. Aim for a stable 60 FPS on Low where the hardware allows; do not promise what the hardware cannot do.

## 9. Final report
Systems inspected and reused; features implemented; bugs found and fixed; tests actually run; performance checks; known limitations; remaining issues. Honest about what was not tested.
