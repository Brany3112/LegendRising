# User-reported issues (to be fixed, priority: next phase run, not phase 10)

## U1 (2026-10-13 15:10 UTC) Turning and feet, player and AI
User words: "feet move wanky and dont move naturally, when you turn around the character turns like a turret
from the torso instead of having to turn with the whole body, the characters are able to turn 360 and they do
that only via the torso".
Seen on 2026.10.13a (phase 2 build, which already had MV-11/12/16).
Required:
- Turning (player first person, third person, and all AI) is done by the whole body: the feet step round
  (pivot / turn-in-place steps, plant-and-turn when running), the pelvis follows the feet, the torso may lead
  the pelvis by at most ~0.6-0.8 rad, never a 360 spin of the upper body on still legs.
- The mouse look in first person may turn the head/view, but when the look passes the torso budget the legs
  must step the body round (or the body yaw is rate-limited and the feet step), never a turret.
- Feet: no sliding, no jitter ("wanky"); planted feet stay planted (skate <= 10 mm), step timing natural.
- Acceptance: a test that turns 90/180/360 standing and while running for the player (FP and TP) and for an
  AI player, recording pelvis-vs-chest yaw (cap), foot skate while planted, and that at least one step
  happens per ~70 deg turned. Contact sheets for the user.

## U2..U11 (2026-10-13 18:10 UTC), seen on 2026.10.13a
User words: "still having some issues at the time when you are getting subbed where it tells you to go at the
central and you are not seeing any central to go at, when you get up and you get the warmup at the pass minigame
the coach can step inside the pitch, coach and player should not be able to step inside the pitch if they are not
subbed in, there is a bug where player has to be going around the back of the place you sit on the bench in order
to sit cause you cant sit from the front, also the people on the bench should not look like 2d sprites, when throw
in happens the ai has the ball flying and then puts hands on and then starts to do the animation so that is bugged
aswell, the ai animations are off too the jumping and running, turning, tackling passing, feel off, also make
something that it will be easier to notice your teammates, as you look at them they will have a red slight aura
around them, they play on their positions and not like that they dont shoot from middle, they play where they are
free, sometimes the request for pass doesnt work and i want you to make that when the player request for the pass
to raise a hand and then drop it to signify they requested it, make sure 2 kits are never the same color or close
colors, if one is purple and one is blue for example and they are close do not let the players go out on the field
like that, pick another secondary kit for away team to be easily destinguishable"

- U2 Sub call: the prompt sends you to "the central" (fourth official / halfway point) but nothing is visible.
  Needs a visible fourth official (or marked spot at halfway touchline) + a world marker / compass arrow, and
  the prompt wording names what you see.
- U3 Warm-up pass minigame: the coach (and the player) walk onto the pitch. Anyone not on the field (bench,
  warm-up, coach, staff) is fenced to the touchline/warm-up zone; only subbed-in players may cross the line.
- U4 Bench seat: you can only sit by walking round the back of the bench. Sitting must work from the front
  (approach from any side, the seat prompt and sit animation from the front).
- U5 Bench people look like 2D sprites (impostors). Use real 3D humans (low LOD is fine) on the bench.
- U6 Throw-in: AI ball flies first, then hands go on, then the animation starts. Order must be: pick up / hold
  ball overhead (ball in hands), wind-up, release, ball leaves the hands at release. (Plan P7-B covers the
  throw-in clip; do this now.)
- U7 AI animations feel off: jumping, running, turning, tackling, passing. Ties to U1 (turning) and the
  physics tackle. Review each AI clip against the player's versions; same quality bar.
- U8 Teammate highlight: when you look at a teammate (in view / near crosshair) they get a slight red aura
  (outline/rim glow), subtle, readable at distance. (User said red; keep red unless it clashes with a red kit,
  then still red but as a soft outline.)
- U9 AI team play: players hold their positions/shape; they move into free space; they DO shoot from central
  areas when they have a chance (currently they do not shoot from the middle). Check harness bands after.
- U10 Pass request: sometimes R (call for the pass) does nothing. Make it reliable (always registers, carrier
  considers it). Visual: the player's avatar raises a hand then drops it on each request (visible to others and
  in third person; in first person show the arm in view briefly).
- U11 Kit clash: two kits must never be the same or close colours (e.g. purple vs blue). Use a perceptual colour
  distance (CIEDE2000 or Lab delta-E) on primary and secondary; if too close, the away team switches to its
  alternate kit; if still close, a generated contrasting kit. Also check GK kits against both teams and the
  referee. Applies to every match (career, training, full match).

## Round 2 (Oct 17, after playing career Lesson 6, the 4v4 small-sided game; screenshot plan/notes/u12-legs.webp)

User's words: "look how off the legs look when i supposed to be standing. in the training when you play 4v4, there is
no scoreboard, every ai shoots at every goal, you dont know what team it is, the both teams stop after each goal,
after the team resets they change kits randomly, its super hard to control the ball, it should be working easier to
hold the ball, when i press the key when receeving the ball the ball just goes away, it should stick to the player
main foot like controllling to main foot, shooting is awful you as the player dont even know when you should release
the ball, when you hold the left click, the pass is awful too, the scroll bar only shows when you shoot or pass, it
should be able to select it before shooting and see it always what you have selected... it is such a hard and
tedious, looks incredible hard and plays bad and not even rewarding"

- U12 First-person body while standing: looking down, the legs stretch forward from the camera like the player is
  sitting or lying back, and the hands sit low at the screen corners. Standing still, the feet must be under the
  camera (slightly ahead), knees soft, shins vertical, arms hanging at the sides. Check camera height and offset
  against the body's hips and head at every player height (1.60 to 1.95 m), in idle, walk, run and paused.
- U13 Small-sided game (career Lesson 6 and the daily session's SSG block, and Training Mode's small games):
  a small scoreboard (team names or bib colours, score, time left) always visible.
- U14 Small-sided game AI attacks the wrong goal: each side must attack its own opponent's goal only; no AI shoots
  at its own goal.
- U15 Teams unclear: the two sides wear clearly different bibs or kits (U11 colour rule), the same all game; kits never
  change after a goal or reset. Your own team is obvious (your bib colour, teammate highlight from U8).
- U16 After a goal both teams stop: play restarts quickly and cleanly (a short kick-off from the conceding side, players
  jog back to shape) and nobody stands frozen.
- U17 Ball control is too hard: dribbling and holding the ball must be easier. A first touch when you press the control
  key as the ball arrives should kill the ball onto your preferred foot (settle it within reach), not push it away.
  Close control at jog speed keeps the ball near the main foot; only sprinting pushes it further ahead.
- U18 Shooting: holding left click gives no feedback on when to release. Show a clear power meter near the crosshair
  that fills while held, with a marked sweet spot, and a release that lands in it gives a clean strike. Make the timing
  forgiving and readable; the strike should feel rewarding (sound, net ripple, slight camera kick).
- U19 Passing feels awful: pass weight and direction should help the player (aim assist toward the teammate nearest
  the aim, weight scaled to distance on a short press), with the same visible meter as shooting for a held pass.
- U20 Kick type selector (the scroll wheel): it only appears while shooting or passing. It must be visible all the time
  in a corner of the HUD (small), show the selected type (for example placed, driven, chip, curl), and change on scroll
  before you start the kick.
- Overall: the game must feel easier and more rewarding to play, not tedious. Tune toward an arcade-friendly default
  (assists on) with a harder setting available.

## Round 3 (Oct 17 evening)

User's words: "instead of the first game when playing is third person always when playing or in contact with a ball
but when doing your life you are in first person"

- U21 Camera by activity: every football activity (career matches, the daily team session and lessons, Training Mode
  drills, Free Play, Full Match, the cage, warm-up games with a ball, and any moment you have the ball in life, for
  example the apartment ball) uses a third-person camera behind and slightly above the player. Everything else in life
  (walking around, home, shops, jobs, bus) stays first person. Switch smoothly (no cut) when the activity starts or
  ends. Defaults: a chase camera about 4 m behind and 1.8 m above the player's head, looking slightly down past the
  player toward where they aim; it never clips into walls, goals or the fence; it turns with the mouse as the aim does
  now. The shot meter, kick selector, pass assist and crosshair work the same, placed for third person (the aim point
  shown on the pitch ahead). Keep a setting to go back to first person for football (Settings: Football camera =
  Third person (default) / First person), and keep the existing view toggle key working. Replays and cut-scenes are
  unchanged.
