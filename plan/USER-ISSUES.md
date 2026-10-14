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
