/* ============ Training Mode: Ball Receiving and First Touch, the drills ============
   Owner: P6-A (Training Mode Phase 6: Ball Receiving and First Touch). Contract: BUILD-PLAN P6-A work item 1 ("every
   receiving variant in spec section 5 as one parameterised scenario family"), Phase 6 "Scenario modules register their
   config types through config.registerType"; TRAINING-SPEC 4 (shared configuration, only relevant settings, every
   setting real, presets for every scenario) and 5 (Ball Receiving and First Touch, the highest priority).

   One family: every drill is a configuration of type 'receive' (registered here), so a drill is only its starting
   values and any of them can be turned into any other on the configuration sheet, saved as a preset and loaded again.
   What the configuration says, and what it really changes:
   - who plays it in: the coach (team-mates off) or a team-mate (on: an AI passer whose own strike plays it, feeder.js),
     from where (your own half, the goal end, the left or right touchline, or diagonally from either side) and how far;
   - how: along the ground, driven low, bouncing low or high, in the air at a height, or high and dropping, and how hard
     (m/s): the launch is solved for exactly that (strike.js solveStrike through feeder.js);
   - you: standing, jogging, sprinting, moving sideways or turning (the ball is played once you are moving, to where you
     will be), which way you face (the ball, your back to it, the goal), and where it is aimed: your feet, into space,
     slightly ahead, slightly behind, or off your line so you need a step or two;
   - a defender (opponents on): behind you, at your side or coming at you, how close, pressing and tackling or
     jockeying, and whether you are to shield it from him (C);
   - how you mean to take it (any way, foot, thigh, chest, a cushioned header) and what comes next (keep it, turn,
     sprint away, pass, a through ball, a cross, a shot, a first-time pass or shot, a header on);
   - the shared fields: your attributes, height and foot, the passer's and the defender's averages, a keeper and his
     attributes, the pitch, and what happens when the ball goes out.
   build(config, env) makes the runner's setup (teams.js setupFromConfig for the people and their attributes, then the
   places this drill puts them in); the go is judged from the simulation's own events (judge). The ball starts at
   rest where the passer is and is fed by feeder.js. Pure of the page: qa/tr6-receive.mjs runs it under node. */
import {registerType, validate} from "./config.js";
import {setupFromConfig} from "./teams.js";
import {describe} from "./presets.js";
import {FEEDER, CONTACT, launchOf, targetOf, passerSpot, feedStart, feedStep} from "./feeder.js";
import {BALL} from "../football/ball.js";
import {dirOf, yawOf, wrapA} from "../football/pitchspec.js";

const R = BALL.R;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const r3 = v => Math.round(v*1000)/1000;
export const TYPE = "receive";

/* ---------- the configuration (TRAINING-SPEC 4 and 5) ---------- */
const E = o => Object.entries(o).map(([v, label]) => ({v, label}));
export const FROM = Object.freeze({behind:"From your own half", front:"From the goal end", left:"From the left touchline", right:"From the right touchline",
  angleL:"Diagonally from the left", angleR:"Diagonally from the right"});
export const DELIVERY = Object.freeze({ground:"Along the ground", driven:"Driven, low and hard", lowBounce:"Bouncing, low", highBounce:"Bouncing, high",
  aerial:"In the air", high:"High and dropping"});
export const HEIGHTS = Object.freeze([0.3, 0.5, 0.75, 1, 1.25, 1.7]);
const HEIGHT_NAMES = {0.3:"Shins", 0.5:"Knees", 0.75:"Thighs", 1:"Waist", 1.25:"Chest", 1.7:"Head"};
export const MOVE = Object.freeze({still:"Standing", jog:"Jogging", sprint:"Sprinting", side:"Moving sideways", turn:"Turning"});
export const INTO = Object.freeze({feet:"To your feet", space:"Into space in front of you", ahead:"Slightly ahead of you", behind:"Slightly behind you",
  adjust:"Off your line, a step or two away"});
export const FACING = Object.freeze({passer:"Facing the ball", away:"Your back to it", goal:"Facing the goal"});
export const PRESSURE = Object.freeze({behind:"Behind you", side:"At your side", front:"Coming at you"});
export const BEHAVE = Object.freeze({press:"Presses and tackles", jockey:"Jockeys you, no tackles"});
export const CONTROL = Object.freeze({auto:"However it comes", foot:"With your foot", thigh:"On your thigh", chest:"On your chest", head:"Head it down to your feet"});
export const THEN = Object.freeze({keep:"Keep it", turn:"Turn with it", sprint:"Sprint away with it", pass:"Pass it", through:"Play a through ball", cross:"Cross it",
  shoot:"Shoot", firstPass:"Pass it first time", firstShot:"Shoot first time", redirect:"Head it on to the passer"});
const FIRST = new Set(["firstPass", "firstShot", "redirect"]);
const AIR = new Set(["aerial", "high"]);

registerType(TYPE, {name:"Ball Receiving and First Touch", roles:["receiver"],
  fields:["mates", "opps", "keeper", "me", "attAvg", "defAvg", "gk", "out", "pitch"],
  fixed:{attackers:2, defenders:1, possession:"loose", role:"receiver"},
  labels:{mates:"A team-mate plays it in (off: the coach does)", opps:"A defender on you", attAvg:"Passer's average", defAvg:"Defender's average"},
  defaults:{mates:false, opps:false, keeper:false, pitch:"half", out:"rebound"},
  options:{
    from:{kind:"enum", label:"Where it comes from", values:E(FROM), def:"behind"},
    dist:{kind:"int", label:"How far away it's played from", min:6, max:40, def:15, unit:"m"},
    delivery:{kind:"enum", label:"How it comes", values:E(DELIVERY), def:"ground"},
    speed:{kind:"int", label:"How hard it's played", min:5, max:32, def:12, unit:"m/s", when:c => !ELEV[c.opts.delivery] && !(c.opts.into === "space" && c.opts.delivery === "ground"),
      help:"A ball in the air, a high bouncing one or a pass into space is struck as hard as its flight needs."},
    height:{kind:"enum", label:"How high it gets to you", values:HEIGHTS.map(v => ({v, label:`${HEIGHT_NAMES[v]} (${v} m)`})), def:1.25, when:c => AIR.has(c.opts.delivery)},
    move:{kind:"enum", label:"What you're doing as it comes", values:E(MOVE), def:"still",
      help:"Moving, the ball is played once you're on the move, to where you'll be."},
    facing:{kind:"enum", label:"Which way you face", values:E(FACING), def:"passer"},
    into:{kind:"enum", label:"Where it's aimed", values:E(INTO), def:"feet"},
    pressure:{kind:"enum", label:"Where the defender is", values:E(PRESSURE), def:"behind", when:c => !!c.opps},
    defDist:{kind:"int", label:"How close he is", min:1, max:10, def:3, unit:"m", when:c => !!c.opps},
    behave:{kind:"enum", label:"What he does", values:E(BEHAVE), def:"press", when:c => !!c.opps},
    shield:{kind:"bool", label:"Shield it from him", help:"Hold C as it comes and keep your body between him and the ball.", def:false, when:c => !!c.opps},
    control:{kind:"enum", label:"How you take it", values:E(CONTROL), def:"auto", when:c => !FIRST.has(c.opts.then)},
    then:{kind:"enum", label:"Then", values:E(THEN), def:"keep"}
  }});

/* ---------- the drills: every receiving variant of TRAINING-SPEC 5, each a configuration's starting values ---------- */
const D = (id, name, desc, opts = {}, top = {}) => Object.freeze({id:"receive-" + id, name, desc, config:Object.freeze(Object.assign({opts}, top))});
export const DRILLS = Object.freeze([
  D("feet", "Ground pass to your feet", "A firm pass along the ground while you stand. Take the touch the way you want to go.", {}),
  D("moving", "Ground pass on the move", "Jog onto a pass along the ground and take it in your stride.", {move:"jog", from:"angleL", facing:"goal"}),
  D("slow", "A slow pass", "It's under-hit. Come to meet it, or let it run across you.", {speed:6, dist:12}),
  D("fast", "A fast pass", "Driven at you along the ground. Cushion it.", {speed:22, dist:20}),
  D("left", "From the left", "A pass from the left touchline. Open your body and take it across you.", {from:"left", dist:16}),
  D("right", "From the right", "A pass from the right touchline.", {from:"right", dist:16}),
  D("behind", "From behind you", "Facing the goal, a pass from your own half comes over your shoulder.", {from:"behind", facing:"goal", into:"ahead"}),
  D("angle", "At an angle", "A diagonal ball from the left. Half-turn and take it on the half-volley side.", {from:"angleL", dist:18}),
  D("space", "Into space", "The pass is played into the space in front of you. Run onto it.", {into:"space", facing:"goal", from:"behind", move:"jog", dist:18}),
  D("sprint", "While sprinting", "A through ball into your stride at full speed.", {move:"sprint", from:"angleL", facing:"goal", into:"ahead", speed:19, dist:20}),
  D("jog", "While jogging", "Jog across and take it without breaking stride.", {move:"jog", from:"right", facing:"goal"}),
  D("side", "Moving sideways", "Shuffle across as the ball comes and take it on the move.", {move:"side", from:"behind"}),
  D("pressure", "Under pressure", "A defender is right behind you. Get your first touch away from him.", {pressure:"behind", defDist:2, behave:"press"}, {opps:true}),
  D("firstpass", "First-time pass", "Play it straight back to your team-mate without a touch.", {then:"firstPass", dist:14}, {mates:true}),
  D("firstshot", "First-time shot", "A ball across from the right. Hit it first time at goal.", {then:"firstShot", from:"right", dist:14, speed:11}, {keeper:true}),
  D("chest", "Chest control", "A lofted ball at chest height. Kill it on your chest.", {delivery:"aerial", height:1.25, control:"chest", speed:14, dist:16}),
  D("thigh", "Thigh control", "A dropping ball at thigh height. Take it on your thigh.", {delivery:"aerial", height:0.75, control:"thigh", speed:13, dist:15}),
  D("footair", "Foot control of an aerial ball", "A ball in the air out to your side. Get your foot up and cushion it.", {delivery:"aerial", height:0.75, control:"foot", into:"adjust", speed:13, dist:15}),
  D("headdown", "Header to control", "A high ball at head height. Cushion it down to your feet with F and Space.", {delivery:"aerial", height:1.7, control:"head", speed:14, dist:16}),
  D("headon", "Header to redirect", "A high ball at head height. Head it back to your team-mate.", {delivery:"aerial", height:1.7, then:"redirect", speed:14, dist:14}, {mates:true}),
  D("high", "High aerial ball", "Up high and dropping on you. Judge it and bring it down.", {delivery:"high", height:1.25, speed:17, dist:20}),
  D("lowbounce", "Low bounce", "It skids up off the grass at you at knee height.", {delivery:"lowBounce", speed:12, dist:14}),
  D("highbounce", "High bounce", "It pitches in front of you and kicks up high.", {delivery:"highBounce", speed:15, dist:18}),
  D("adjust", "Needing adjustment steps", "It's off your line. Take a step or two and set your feet.", {into:"adjust"}),
  D("slightlybehind", "Slightly behind you", "A bit behind you as you move. Adjust and take it back across.", {into:"behind", move:"jog", facing:"goal", from:"left"}),
  D("slightlyahead", "Slightly ahead of you", "A bit in front of you. Stretch for it or step onto it.", {into:"ahead", move:"jog", facing:"goal", from:"left"}),
  D("turning", "While turning", "You start turned away. Come round and take it as you turn.", {move:"turn", facing:"away"}),
  D("away", "Facing away from the passer", "Back to the ball. Feel it in, then take it.", {facing:"away", into:"feet"}),
  D("shield", "While shielding", "A defender is tight on your back. Hold C, keep him off and take it.", {pressure:"behind", defDist:1, behave:"press", shield:true}, {opps:true}),
  D("thenturn", "Then turn", "Take it and turn towards goal.", {then:"turn"}),
  D("thensprint", "Then sprint", "Take it and burst away with it.", {then:"sprint", facing:"goal", from:"behind", into:"ahead"}),
  D("thenthrough", "Then a through ball", "Take it and slide your team-mate in behind.", {then:"through"}, {mates:true}),
  D("thencross", "Then cross", "Take it on the wing and get a cross in.", {then:"cross", from:"behind", facing:"goal", into:"ahead"}, {keeper:true, mates:true}),
  D("thenshot", "Then shoot", "Take it and get a shot away.", {then:"shoot", from:"left"}, {keeper:true})
]);
export const drillOf = id => DRILLS.find(d => d.id === id) || null;
// a drill's configuration (its starting values over the type's defaults, validated)
export const drillConfig = (id, extra = null) => { const d = drillOf(id); return validate(TYPE, Object.assign({}, d ? JSON.parse(JSON.stringify(d.config)) : {}, extra || {}, {opts:Object.assign({}, d ? d.config.opts : {}, extra && extra.opts || {})})); };

// the Load list's line for a receive preset: where it comes from, how, how hard, the defender, then what
describe(TYPE, c => {
  const o = c.opts || {};
  const parts = [(FROM[o.from] || "").replace(/^From /, "from "), (DELIVERY[o.delivery] || "").toLowerCase(), `${o.speed} m/s`];
  if (MOVE[o.move] && o.move !== "still") parts.push(MOVE[o.move].toLowerCase());
  if (c.opps) parts.push(`a defender at ${o.defDist} m`);
  if (o.then && o.then !== "keep") parts.push("then " + (THEN[o.then] || "").toLowerCase());
  return parts.filter(Boolean).join(", ").replace(/^./, s => s.toUpperCase());
});

/* ---------- the setup ---------- */
// the way each "from" comes, in the pitch's frame (+x is the goal you attack, +z your right as you face it)
const FROM_DIR = {behind:[-1, 0], front:[1, 0], left:[0, -1], right:[0, 1], angleL:[-0.7071, -0.7071], angleR:[-0.7071, 0.7071]};
// the speed a run is asked for (m/s) and the speed the ball waits for; how far back the run starts
export const RUN_V = Object.freeze({still:0, jog:3.2, sprint:6.5, side:2.0, turn:0});
const WAIT_V = {still:0, jog:2.4, sprint:4.8, side:1.4, turn:0};
const RUN_BACK = {still:0, jog:5, sprint:10, side:3, turn:0};
// (into space: past him on one side, into the space ahead where his run takes him a moment after it gets there, so he
// runs onto it; the pass along the grass is weighted to get there at SPACE_V)
const INTO_OFF = {feet:[0, 0], space:[3, 1.2], ahead:[0.9, 0], behind:[-0.9, 0], adjust:[0, 1.6]};
const SPACE_V = 4;
// the elevation a ball in the air, a high one and a high bounce are played at (their speed is worked out for it: the
// ball's drag makes a lofted ball's range from a speed anything but obvious, so the configuration asks for the flight);
// a low bounce is struck as hard as the configuration says, pitching short of him
// (a ball in the air is met as it comes into reach, about this far in front of the body: that is where its height counts)
const AIR_MEET = 0.45;
export const ELEV = Object.freeze({aerial:28, high:58, highBounce:52});
const DEG = Math.PI/180;
const faceTo = (dx, dz) => yawOf(dx, dz);

// the drill's resolved shape from a configuration: what the go needs, every value made consistent with the others
// (a wish the ball cannot give, a header from a ball along the ground, is turned into one it can, with a note)
export function shapeOf(c, notes = []){
  const o = Object.assign({}, c.opts);
  const say = t => { if (!notes.includes(t)) notes.push(t); };
  // how you mean to take it, against how it comes
  const want = FIRST.has(o.then) ? (o.then === "redirect" ? "head" : "auto") : o.control;
  if (want === "head" && !(AIR.has(o.delivery) && o.height >= 1.7)){ o.delivery = AIR.has(o.delivery) ? o.delivery : "aerial"; o.height = 1.7; say("A header needs the ball at head height, so that's how it comes."); }
  else if (want === "chest" && !(AIR.has(o.delivery) && o.height >= 1 && o.height <= 1.25)){ o.delivery = AIR.has(o.delivery) ? o.delivery : "aerial"; o.height = 1.25; say("To take it on your chest it comes at chest height."); }
  else if (want === "thigh" && !(AIR.has(o.delivery) && o.height >= 0.5 && o.height <= 1)){ o.delivery = AIR.has(o.delivery) ? o.delivery : "aerial"; o.height = 0.75; say("To take it on your thigh it comes at thigh height."); }
  if (o.then === "firstShot" && o.delivery === "high"){ o.delivery = "aerial"; o.height = 0.5; say("A first-time shot from a ball dropping that steeply isn't on, so it comes in lower."); }
  return {o, want};
}

/* build(config, env): the runner's setup. env.spec is the cage pitch (pitch-local metres). The returned setup carries
   feed (feeder.js's plain data) and receive (what the judge needs) besides the runner's own fields; the runner keeps
   only its own (runner.js cleanSetup), and the scenario reads the rest from its configuration again at every go */
export function build(config, env){
  const spec = env.spec, notes = [];
  const c = validate(TYPE, config, notes);
  const s = setupFromConfig(TYPE, c, {spec});
  const P = plan(c, spec, s, notes);
  s.me.x = P.me.x; s.me.z = P.me.z; s.me.yaw = P.me.yaw;
  if (s.mates[0]){ Object.assign(s.mates[0], {x:P.passer.x, z:P.passer.z, yaw:P.passer.yaw, drill:{behave:"stand"}}); s.mates.length = 1; }
  if (s.opps[0]){ Object.assign(s.opps[0], {x:P.def.x, z:P.def.z, yaw:P.def.yaw, drill:{behave:P.o.behave === "jockey" ? "jockey" : "press"}}); s.opps.length = 1; }
  s.ball = {x:P.ball.x, y:R, z:P.ball.z, vx:0, vy:0, vz:0, wx:0, wy:0, wz:0, free:false, kind:P.feed.kind};
  s.poss = {team:-1, who:null, i:-1};
  s.role = "Receiver";
  s.notes = (s.notes || []).concat(notes);
  s.feed = P.feed; s.receive = P.receive;
  return s;
}

/* the places and the feed of a configuration on a pitch: {me, passer, def, ball, feed, receive, o}. s: the
   setupFromConfig setup (its keeper and people); used by build and by the tests */
export function plan(c, spec, s = null, notes = []){
  const {o, want} = shapeOf(c, notes);
  const A = spec.area || {x0:-spec.hx, x1:spec.hx, z0:-spec.hz, z1:spec.hz};
  const cx0 = -spec.hx + 1.5, cx1 = spec.hx - 2, cz = spec.hz - 2;
  void A;
  // where you take it: 20 m out from the goal you attack (a cross from the wing: wide, 14 m out)
  const wide = o.then === "cross";
  const rx = clamp(spec.hx - (wide ? 14 : 20), cx0 + 4, cx1 - 2), rz = wide ? clamp((o.from === "right" || o.from === "angleR" ? -1 : 1)*Math.min(20, cz - 4), -cz, cz) : 0;
  const fd = FROM_DIR[o.from] || FROM_DIR.behind;
  const bx = clamp(rx + fd[0]*o.dist, cx0, cx1), bz = clamp(rz + fd[1]*o.dist, -cz, cz);
  if (Math.hypot(bx - rx, bz - rz) < o.dist - 0.5) notes.push(`The pitch isn't big enough for ${o.dist} m from there, so it's played from as far as it goes.`);
  // the way you run: toward goal, unless it comes from the goal end (then toward it) or you move across
  const toBall = {x:bx - rx, z:bz - rz}, tl = Math.hypot(toBall.x, toBall.z) || 1;
  let run = {x:1, z:0};
  if (o.move === "side") run = Math.abs(fd[1]) > 0.5 ? {x:1, z:0} : {x:0, z:rz > 0 ? -1 : 1};
  else if (o.from === "front") run = {x:1, z:0};
  const back = RUN_BACK[o.move] || 0;
  const mx = clamp(rx - run.x*back, cx0, cx1), mz = clamp(rz - run.z*back, -cz, cz);
  // the way you face
  let yaw;
  if (o.facing === "goal") yaw = faceTo(1, 0);
  else if (o.facing === "away") yaw = faceTo(-toBall.x, -toBall.z);
  else yaw = faceTo(bx - mx, bz - mz);
  if (o.move === "turn") yaw = faceTo(-toBall.x, -toBall.z);
  // the feed: to a point on you (where you will be), at the height and with the bounce the delivery asks for
  const kind = o.delivery === "ground" ? "pass" : o.delivery === "driven" ? "driven" : o.delivery === "aerial" ? (o.height <= 1 ? "cross" : "loft") : "loft";
  const off = (INTO_OFF[o.into] || INTO_OFF.feet).slice();
  // (on the move, "to your feet" is into the stride: just in front of the leading foot, where the touch is taken)
  if (o.move !== "still" && o.move !== "turn" && o.into === "feet") off[0] += 0.55;
  // (off your line: to the side away from the defender, else to your right as the ball comes)
  const up = AIR.has(o.delivery) ? o.height : o.delivery === "driven" ? 0.3 : R;
  const aim = {who:"me", along:off[0], across:off[1], up, toward:AIR.has(o.delivery) ? AIR_MEET : 0, short:o.delivery === "lowBounce" ? 0.38*o.dist : o.delivery === "highBounce" ? 0.3*o.dist : 0,
    dir:o.move === "still" || o.move === "turn" ? {x:-toBall.x/tl, z:-toBall.z/tl} : run};
  // still, the receiving point is where you stand; across it is to your right as the ball comes to you
  if (o.move === "still" || o.move === "turn"){ aim.dir = {x:-toBall.x/tl, z:-toBall.z/tl}; }
  // (in the air: the normal contact's flatter flight, its speed deciding how flat; high and the bounces: the high
  // contact's steep one; driven: low)
  const contact = o.delivery === "aerial" || o.delivery === "ground" ? 0 : o.delivery === "driven" ? -1 : 1;
  // (into space along the grass: weighted to reach the space at SPACE_V, so it is there to run onto, not past him)
  const arrive = o.into === "space" && o.delivery === "ground" ? SPACE_V : 0;
  const feed = {kind, contact, arrive, from:{x:r3(bx), y:R, z:r3(bz)}, speed:o.speed, curl:0, aim, passer:-1,
    wait:{t:o.move === "still" || o.move === "turn" ? (o.move === "turn" ? 0.6 : FEEDER.WAIT) : 0.4, v:WAIT_V[o.move] || 0, max:FEEDER.MAX}};
  // a high ball and the bounces are struck at their own elevation: the speed for it is worked out (and said)
  if (ELEV[o.delivery]){
    const meAt = {m:{x:mx + run.x*back, z:mz + run.z*back, vx:0, vz:0, yaw}};
    const sp = speedForElev(feed, meAt, spec.roll, ELEV[o.delivery]);
    feed.speed = r3(sp);
  }
  // the passer at the ball (team-mates on), behind it on its line to where you will take it
  const tgt0 = targetOf(feed, {m:{x:rx, z:rz, vx:0, vz:0, yaw}}, spec.roll);
  const ps = passerSpot(feed.from, tgt0);
  // the defender
  let def = {x:rx, z:rz, yaw:0};
  if (c.opps){
    const dd = clamp(o.defDist, 1, 10), f = dirOf(yaw);
    let px, pz;
    if (o.pressure === "front"){ px = rx + toBall.x/tl*dd - toBall.z/tl*1.2; pz = rz + toBall.z/tl*dd + toBall.x/tl*1.2; }
    else if (o.pressure === "side"){ px = rx - f.z*dd; pz = rz + f.x*dd; }
    else { px = mx - f.x*dd; pz = mz - f.z*dd; }
    def = {x:clamp(px, cx0, cx1), z:clamp(pz, -cz, cz), yaw:faceTo(mx - px, mz - pz)};
  }
  if (o.shield && !c.opps) o.shield = false;
  return {o, me:{x:r3(mx), z:r3(mz), yaw:r3(yaw)}, passer:{x:r3(ps.x), z:r3(ps.z), yaw:r3(ps.yaw)}, def:{x:r3(def.x), z:r3(def.z), yaw:r3(def.yaw)},
    ball:{x:feed.from.x, z:feed.from.z}, feed, receive:{want, then:o.then, shield:!!o.shield, move:o.move, run, spot:{x:rx, z:rz}}};
}
// the speed a feed needs to leave at elev degrees for where it is aimed (bisection on the solved elevation)
function speedForElev(f, who, roll, elev){
  let lo = 5, hi = 32;
  const el = sp => { const g = Object.assign({}, f, {speed:sp}); const t = targetOf(g, who, roll); const L = launchOf(g, t, roll); return Math.atan2(L.v.y, Math.hypot(L.v.x, L.v.z))/DEG; };
  // (the lower solution's elevation falls as the speed rises)
  if (el(hi) > elev) return hi;
  if (el(lo) < elev) return lo;
  for (let i = 0; i < 18; i++){ const mid = (lo + hi)/2; if (el(mid) > elev) lo = mid; else hi = mid; }
  return (lo + hi)/2;
}

/* ---------- a go: the feed and the judge ----------
   goState(ms, config): the go's own state, made at its first step from the configuration (a restart's new simulation
   gets a new one) */
const GOS = new WeakMap();
export function goState(ms, config, spec){
  let G = GOS.get(ms);
  if (G) return G;
  const P = plan(validate(TYPE, config), spec);
  const me = ms.agents[ms.me];
  const passer = ms.agents.find(a => a.team === me.team && a !== me && a.role === "player" && !a.isGK);
  const f = Object.assign({}, P.feed, {passer:passer ? passer.id : -1});
  G = {P, feed:feedStart(f, ms), ev0:ms.events.length, ctl:null, head:null, first:null, lost:null, verdict:null, t0:ms.t, passer:passer ? passer.id : -1,
    seen:ms.events.length, ctlAt:-1, ctlX:0, ctlZ:0, part:null, q:null, maxV:0, shielded:false, faced:false};
  GOS.set(ms, G);
  return G;
}
// every step of the go (the scenario's step): the feed, and what the judge needs to watch
export function goStep(ms, config, spec){
  const G = goState(ms, config, spec), me = ms.agents[ms.me];
  feedStep(ms, G.feed, me.id);
  // a passer whose drill goes on after the feed (a pass, a through ball or a cross back to him) plays on as the AI does
  const pa = G.passer >= 0 ? ms.agents[G.passer] : null;
  if (pa && pa.drill && G.feed.state === "flight" && /^(pass|through|cross)$/.test(G.P.receive.then)) pa.drill = null;
  if (me.intent && me.intent.shield && ms.poss.ctl === me.id) G.shielded = true;
  return G;
}
/* the verdict of a go, or null while it is still on: {done, ok, text, why, part, q}. Read from the simulation's own
   events since the go began (touches, kicks, tackles, the ball out, a goal) */
export function judge(ms, G){
  if (G.verdict) return G.verdict;
  const me = ms.agents[ms.me], R0 = G.P.receive, then = R0.then;
  const end = (ok, text, why) => (G.verdict = {done:true, ok, text, why, part:G.part, q:G.q});
  const fed = G.feed.state === "flight";
  for (; G.seen < ms.events.length; G.seen++){
    const e = ms.events[G.seen];
    if (!fed) continue;
    const mine = e.agent === me.id;
    if (e.kind === "touch" && !mine && e.team !== me.team && (e.how === "control" || e.how === "block" || e.how === "dribble")) return end(false, G.ctl ? "He took it off you." : "He got there first.", "opp");
    if (e.kind === "tackle" && e.won && e.agent !== me.id && e.team !== me.team) return end(false, "He won it off you.", "tackled");
    if (e.kind === "out") return end(then === "shoot" || then === "firstShot" ? false : false, "It went out of play.", "out");
    if (e.kind === "goal" && !e.disallowed && e.team === me.team && (then === "shoot" || then === "firstShot")) return end(true, "Goal!", "goal");
    if (e.kind === "touch" && mine && e.how === "control" && !G.ctl){
      G.ctl = e; G.ctlAt = ms.t; G.part = e.part; G.q = e.quality; G.ctlX = me.m.x; G.ctlZ = me.m.z;
      if (FIRST.has(then)) return end(false, then === "redirect" ? "You controlled it. Head it on first time." : "You took a touch. Play it first time.", "touched");
      if (R0.want !== "auto" && R0.want !== "head" && e.part !== R0.want) return end(false, `You took it on your ${e.part}, not your ${R0.want}.`, "part");
      if (R0.want === "head" && !G.head) return end(false, "You took it without heading it down first.", "part");
    }
    if (e.kind === "kick" && mine && !e.whiff){
      if (e.intent === "header"){
        if (then === "redirect") return end(true, e.speed > 3 ? "Headed on." : "Headed on, nice and soft.", "header");
        if (R0.want === "head" && !G.ctl){ G.head = e; if (e.speed > 3.05) return end(false, "That was a header away, not one down to your feet.", "header"); continue; }
      }
      const pass = e.intent === "pass" || e.intent === "through" || e.intent === "lob" || e.intent === "cross";
      if (then === "firstPass" && !G.ctl) return end(pass, pass ? "First time, well played." : "That wasn't a pass.", "first");
      if (then === "firstShot" && !G.ctl){ if (e.intent !== "shot") return end(false, "That wasn't a shot.", "first"); G.shot = e; continue; }
      if (G.ctl){
        if (then === "pass" && pass) return end(true, "Controlled and passed.", "pass");
        if (then === "through" && (e.intent === "through" || pass)) return end(true, e.intent === "through" ? "Controlled, and a through ball." : "Controlled and passed.", "through");
        if (then === "cross" && (e.intent === "cross" || e.intent === "lob" || pass && e.ty > 0.5)) return end(true, "Controlled and crossed.", "cross");
        if (then === "shoot" && e.intent === "shot"){ G.shot = e; continue; }
        if (then === "keep" || then === "turn" || then === "sprint") return end(false, "You played it away. Keep it this time.", "kicked");
      }
    }
  }
  if (!fed) return G.feed.state === "wait" && ms.t - G.t0 > FEEDER.MAX + 4 ? end(false, "The ball never came.", "nofeed") : null;
  const tc = G.ctl ? ms.t - G.ctlAt : -1, tf = ms.t - G.feed.fedAt;
  // a shot: on target or not, once its flight is decided
  if (G.shot){
    const s = G.shot;
    if (s.res === "saved") return end(true, "On target, the keeper saved it.", "saved");
    if (s.res && s.res !== "goal") return end(false, s.onTarget ? "The keeper kept it out." : "Off target.", "miss");
    if (ms.t - s.t > 3) return end(!!s.onTarget, s.onTarget ? "On target." : "Off target.", s.onTarget ? "on" : "miss");
    return null;
  }
  if (G.ctl){
    const mineNow = ms.poss.ctl === me.id;
    const gx = ms.dirs[me.team], f = dirOf(me.m.yaw);
    if (then === "keep" && tc >= 1.0){
      if (!mineNow && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) > 2.5) return end(false, "Too heavy, it got away from you.", "heavy");
      if (R0.shield && !G.shielded) return end(false, "You kept it, but shield it with C.", "shield");
      const heavy = G.ctl.heavy;
      return end(true, heavy ? "A bit heavy, but it's yours." : G.q >= 0.75 ? "Lovely first touch." : "Under control.", "kept");
    }
    if (then === "turn"){
      if (mineNow && f.x*gx > Math.cos(55*DEG)) return end(true, "Controlled and turned.", "turned");
      if (tc > 3) return end(false, mineNow ? "You kept it but didn't turn." : "You lost it on the turn.", "noturn");
    }
    if (then === "sprint"){
      G.maxV = Math.max(G.maxV, me.m.speed);
      if (mineNow && Math.hypot(me.m.x - G.ctlX, me.m.z - G.ctlZ) >= 8 && G.maxV > 5) return end(true, "Controlled and away.", "sprint");
      if (tc > 4) return end(false, mineNow ? "Too slow away with it." : "You lost it.", "nosprint");
    }
    if (/^(pass|through|cross|shoot)$/.test(then) && tc > 5) return end(false, then === "shoot" ? "You never got the shot away." : "You held on to it too long.", "slow");
    if (!mineNow && then !== "keep" && tc > 0.5 && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) > 4 && ms.ball.last.agent !== me.id) return end(false, "You lost it.", "lost");
    return null;
  }
  // nothing yet: it went by you
  const b = ms.ball, dx = b.p.x - me.m.x, dz = b.p.z - me.m.z, d = Math.hypot(dx, dz);
  // (gone well past him, or still out of reach long after it was played; a ball played into space ahead of him may run
  // on away from him for a while before he catches it)
  const away = (b.v.x*dx + b.v.z*dz) > 0 && d > 3;
  if (tf > 2 && away && (d > 12 || tf > 7) && b.last.agent !== me.id) return end(false, "It got past you.", "missed");
  if (tf > 8) return end(false, "You never got to it.", "missed");
  return null;
}

// the Training HUD's lines for a go: what comes and what to do with it, and the keys that matter
export function uiOf(config){
  const c = validate(TYPE, config), {o, want} = shapeOf(c);
  const what = `${(FROM[o.from] || "").replace(/^From /, "From ")}: ${(DELIVERY[o.delivery] || "").toLowerCase()}${AIR.has(o.delivery) ? ` to your ${(HEIGHT_NAMES[o.height] || "").toLowerCase()}` : ""}`;
  const todo = [];
  if (o.move !== "still" && o.move !== "turn") todo.push(o.move === "side" ? "Move sideways, it comes once you're moving" : `${MOVE[o.move]} toward goal, it comes once you're moving`);
  if (o.move === "turn") todo.push("Turn round to it");
  const how = FIRST.has(o.then) ? THEN[o.then] : want !== "auto" ? `${CONTROL[want]}, then ${(THEN[o.then] || "").toLowerCase()}` : THEN[o.then];
  todo.push(how);
  const keys = [];
  if (want === "head" || o.then === "redirect") keys.push({key:want === "head" ? "F+Space" : "RMB+Space", text:want === "head" ? "cushion it down" : "head it to him"});
  if (want === "foot") keys.push({key:"F", text:"hold for your foot"});
  if (o.shield) keys.push({key:"C", text:"hold to shield"});
  return {role:"Receiver", lines:[what, todo.join(". ")], keys};
}
