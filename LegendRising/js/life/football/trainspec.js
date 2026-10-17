// js/life/football/trainspec.js: what training at the club is, as numbers and tests. The training pitch (72 x 48, the
// near touchline at world z = -4), its drill stations, the team session's blocks, the first day's lessons, and for each
// one: the part of the pitch it is played on, who is in it, how many goes it has, what counts as a success and what it
// is worth. training.js runs them on the match simulation (createMatch with cfg.mode set to a training mode): the same
// step, ball, actions, AI and controls as a match.
// Owner: WP-I. Contracts DESIGN 1.1 (the training ground's frame), 1.2 (trainspec.js, P), 1.4.13 (cfg.mode), 3.6.1,
// 3.6.2, 3.6.3. The corner targets, their scoring and the volley drill: WP-D3 (Stage P3a), DESIGN 2.7 (the hook queue's
// A1.7 training drills) and addendum A1.7 ("shooting drills with corner targets and scoring, volley and header drills
// that raise the stats").
// UF2-B (user fix round 2, USER-ISSUES Round 2 U13 to U16): the small-sided games' numbers (SSG), the bibs (bibKits),
// the scoreboard's clock and result lines, and the kick-off's taker after a goal.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Every test takes the simulation's
// own events and numbers as arguments.

import {makePitch, PITCHES} from "./pitchspec.js";
import {areaPitchOf, goalsLawOf} from "./cagespec.js";
import {hypot} from "./detmath.js";
import {SLOT_POS} from "./tactics.js";
import {deltaE, kitsClash, rgb, hexOf, KIT_SUM_MIN} from "./kitclash.js";
export {SLOT_POS};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- the training pitch ---------- */

// the training ground's pitch (DESIGN 1.1): 72 x 48, its frame at (0, -28), so the near touchline stays at z = -4
export const GP = PITCHES.ground;
// the grass's rolling deceleration by the club's facility tier 1..6 (DESIGN 1.5.1)
export const GROUND_ROLL = Object.freeze([1.50, 1.40, 1.25, 1.10, 1.00, 0.95]);
export const rollFor = tier => GROUND_ROLL[clamp(Math.round(+tier || 3), 1, 6) - 1];
// the same grass drawn by pitchmesh.js (its tiers 0..4 and how worn it is) for the facility tier 1..6
export const meshTierFor = tier => clamp(Math.round((clamp(+tier || 3, 1, 6) - 1)*4/5), 0, 4);
export const WORN = Object.freeze([1, .85, .62, .42, .25, .12]);
export const wornFor = tier => WORN[clamp(Math.round(+tier || 3), 1, 6) - 1];
// the whole training pitch
export function groundPitch(tier = 3){ return makePitch({L: GP.L, Wd: GP.Wd, cx: GP.cx, cz: GP.cz, roll: rollFor(tier)}); }
// pitch-local to the ground zone's world, and back
export const toWorld = (x, z) => ({x: x + GP.cx, z: z + GP.cz});
export const toLocal = (x, z) => ({x: x - GP.cx, z: z - GP.cz});
// on the training pitch's grass (the field and a margin round it), in world coordinates
export const onPitch = (wx, wz, margin = 0) => Math.abs(wx - GP.cx) <= GP.L/2 + margin && Math.abs(wz - GP.cz) <= GP.Wd/2 + margin;

/* A part of the training pitch as a pitch of its own (a partial simulation is played inside it: its edges are the lines
   the ball goes out over, its run-off keeps the players near). area = {x0, x1, z0, z1} in the training pitch's own
   frame, or null for the whole pitch. Only a real goal of the training pitch is a goal: an end of the area that is not
   one of the training pitch's goal lines has no posts, bar or net, and a ball over it is simply out. */
// how far off the training pitch anybody in a drill may go (the training pitch's frame): 3 m past the goal lines (the
// nets end 2 m back) and 1.1 m past the touchlines (the dugouts' fronts stand 1.34 m off the near one)
export const GROUND_RUN = Object.freeze({x: GP.L/2 + 3, z: GP.Wd/2 + 1.1});
export function areaPitch(area, tier = 3){
  if (!area){ const g = groundPitch(tier); g.runoff = {hx: GROUND_RUN.x, hz: GROUND_RUN.z}; return g; }
  // (cagespec.js areaPitchOf over the training ground: a goal only at an end on one of its goal lines, the area
  // centred across it and wide enough; the run-off round an area 2 m, never past the ground's own, a symmetric box
  // about the area's middle; every mark kept)
  const L = area.x1 - area.x0, Wd = area.z1 - area.z0, cx = (area.x0 + area.x1)/2, cz = (area.z0 + area.z1)/2;
  return areaPitchOf(GP, area, {roll: rollFor(tier), allMarks: true,
    runoff: {hx: Math.min(L/2 + 2, GROUND_RUN.x - Math.abs(cx)), hz: Math.min(Wd/2 + 2, GROUND_RUN.z - Math.abs(cz))}});
}
// the laws.goals of an area: 2 both ends are goals, 1 only the +x end, 0 none (rules.js goalCounts; cagespec.js)
export const goalsLaw = goalsLawOf;

/* ---------- the drill stations (3.6.2) ----------
   Each in the training pitch's frame (x along the length, +x the east goal; z across, +24 the near touchline): the
   marker you stand on to start it (spot), the board beside it, the area it is played in (null: the whole pitch), which
   way team 0 attacks (dir), who is in it, how the ball comes and any orders the others play to (orders 'pass': the
   opponents only pass it to each other). The squad's own work keeps clear of them (npc.js). */
export const DRILLS = Object.freeze({
  shoot: {kind: 'shoot', mode: 'drill', title: "Finishing", label: "Finishing against the keeper", sub: "The coach lays it off. Pick a corner past the keeper",
    hint: "Five shots at the corner targets · accuracy and shot power · 30 min", mins: 30, reps: 5,
    spot: {x: 17, z: 4}, board: {x: 14.5, z: 9.5}, area: null, dir: 1,
    mates: 0, opps: 0, keeper: true, feed: {kind: 'pass', to: 'me', from: {x: 24, z: 15}}, targets: true,
    xp: [['accuracy', 3, 4], ['power', 1, 2]]},
  pass: {kind: 'pass', mode: 'drill', title: "Passing lanes", label: "Passing lanes", sub: "Three team-mates on the move: find them",
    hint: "Six passes · pass accuracy and passing · 30 min", mins: 30, reps: 6,
    spot: {x: -2, z: 13}, board: {x: -19, z: 16}, area: {x0: -17, x1: 13, z0: 1, z1: 21}, dir: 1,
    mates: 3, mateSlots: ['LW', 'RW', 'ST'], mateAt: [{x: -14, z: 5}, {x: 10, z: 5}, {x: -2, z: 2.5}], opps: 0, keeper: false,
    feed: {kind: 'pass', to: 'me', from: {x: -8, z: 23}},
    xp: [['passacc', 2, 4], ['passing', 1, 2]]},
  head: {kind: 'head', mode: 'drill', title: "Crossing and heading", label: "Crossing and heading", sub: "The coach crosses from the wing, you attack it",
    hint: "Five crosses to head · heading and jumping · 30 min", mins: 30, reps: 5,
    spot: {x: -27, z: -1}, board: {x: -23.5, z: -6.5}, area: null, dir: -1,
    mates: 0, opps: 0, keeper: true, feed: {kind: 'cross', to: 'head', from: {x: -30, z: 19}},
    xp: [['heading', 3, 3], ['jumping', 1, 0]]},
  // beside the heading: the coach lobs it up from the side and it drops in front of you; you meet it on the timing ring
  // (A1.5) before it lands
  volley: {kind: 'volley', mode: 'drill', title: "Volleys", label: "Volleys", sub: "The coach lobs it up. Hit it before it lands",
    hint: "Five volleys at goal · clean strike and accuracy · 30 min", mins: 30, reps: 5,
    spot: {x: -24, z: 7}, board: {x: -20.5, z: 10.5}, area: null, dir: -1,
    mates: 0, opps: 0, keeper: true, feed: {kind: 'loft', to: 'volley', from: {x: -27.5, z: 14.5}},
    xp: [['aero', 3, 3], ['accuracy', 1, 2]]},
  intercept: {kind: 'intercept', mode: 'drill', title: "Reading the lane", label: "Reading the lane", sub: "Two of them pass it between them, you cut it out",
    hint: "Six passes to read · interception · 30 min", mins: 30, reps: 6,
    spot: {x: -16, z: -15}, board: {x: -16, z: -5.5}, area: {x0: -28, x1: -4, z0: -22, z1: -8}, dir: 1,
    mates: 0, opps: 2, oppSlots: ['LB', 'RB'], oppAt: [{x: -26, z: -15}, {x: -6, z: -15}], keeper: false,
    feed: {kind: 'pass', to: 'opp', from: {x: -26, z: -23.5}}, orders: 'pass',
    xp: [['interception', 3, 0]]},
  duel: {kind: 'duel', mode: 'drill', title: "One against one", label: "Defending one against one", sub: "Stop him getting past you down the channel",
    hint: "Five duels · tackling · 30 min", mins: 30, reps: 5,
    spot: {x: 22, z: -15}, board: {x: 19, z: -5}, area: {x0: 12, x1: 32, z0: -22.5, z1: -7.5}, dir: -1,
    mates: 0, opps: 1, oppSlots: ['ST'], oppAt: [{x: 14, z: -15}], keeper: false,
    feed: {kind: 'pass', to: 'opp', from: {x: 10, z: -19}},
    xp: [['tackling', 3, 0]]},
  setpiece: {kind: 'setpiece', mode: 'drill', title: "Free kicks", label: "Free kicks", sub: "Over the wall or round it, into a corner",
    hint: "Five free kicks at the corner targets · curve and accuracy · 30 min", mins: 30, reps: 5,
    spot: {x: 13, z: -4}, board: {x: 9.5, z: -9.5}, area: null, dir: 1,
    mates: 0, opps: 3, oppSlots: ['CB', 'CB', 'CDM'], oppAt: [{x: 22, z: -5}, {x: 22, z: -4}, {x: 22, z: -3}], keeper: true,
    feed: {kind: 'freekick', to: 'spot', at: {x: 13, z: -4}}, targets: true,
    xp: [['curve', 2, 3], ['accuracy', 2, 0]]}
});
export const DRILL_KINDS = Object.freeze(Object.keys(DRILLS));

/* ---------- the team session (3.6.2) ---------- */
export const SESSION_PLAN_MINS = 90;
export const SESSION_LAST = 20;                // fewer minutes than this left before SESSION.end: too late to join
export const BLOCKS = Object.freeze([
  {kind: 'rondo', mode: 'rondo', title: "Rondo", line: "Rondo · keep the ball, two in the middle", mins: 20, real: 120,
    coach: "Rondo first. Five round the outside, two in the middle. Keep it moving.",
    area: {x0: -6, x1: 6, z0: -6, z1: 6}, dir: 1, mates: 4, mateSlots: ['LW', 'RW', 'CM', 'ST'], opps: 2, oppSlots: ['CB', 'CDM'], keeper: false},
  {kind: 'pattern', mode: 'pattern', title: "Pattern play", line: "Pattern play · third man runs", mins: 20, real: 120,
    coach: "Pattern play. Give it and go, and the third man runs in behind.",
    area: {x0: 0, x1: 36, z0: -24, z1: 24}, dir: 1, mates: 4, mateSlots: ['CB', 'CM', 'LW', 'ST'], opps: 0, keeper: true},
  {kind: 'ssg', mode: 'ssg', title: "Small-sided game", line: "Small-sided game · four against four", mins: 35, real: 180,
    coach: "Four against four now, bibs against the rest. Win it back quick when you lose it.",
    area: null, dir: 1, mates: 3, mateSlots: ['CB', 'CM', 'ST'], opps: 4, oppSlots: ['CB', 'CM', 'LW', 'ST'], keeper: true},
  {kind: 'finishing', mode: 'finishing', title: "Finishing", line: "Finishing · rebounds are live", mins: 15, real: 90,
    coach: "Finishing to end with. Rebounds are live, so follow everything in.",
    area: null, dir: 1, mates: 2, mateSlots: ['LW', 'RW'], opps: 1, oppSlots: ['CB'], keeper: true}
]);
export const sessionMins = () => BLOCKS.reduce((s, b) => s + b.mins, 0);     // 90 (SESSION_PLAN_MINS)
// the blocks a join can still fit before the session ends: from the next one not done, as many as fit in minsLeft
export function blocksToRun(done, minsLeft){
  const out = [];
  let left = minsLeft;
  for (let i = clamp(done | 0, 0, BLOCKS.length); i < BLOCKS.length; i++){
    if (BLOCKS[i].mins > left + 1e-9) break;
    out.push(i); left -= BLOCKS[i].mins;
  }
  return out;
}
// the game clock's rate in a block: its minutes over its real seconds
export const blockRate = b => b.mins/b.real;
// XP for the session is measured from what you did, and lands in this band (3.6.2)
export const SESSION_XP = Object.freeze({min: 60, max: 90});
export function sessionXPScale(earned, blocksRun = BLOCKS.length){
  // the session's band scaled to the share of it you were in; what you earned is brought into it
  const share = clamp(blocksRun/BLOCKS.length, 0, 1);
  const lo = SESSION_XP.min*share, hi = SESSION_XP.max*share;
  if (!(earned > 0)) return lo > 0 ? lo/Math.max(1e-9, lo) : 1;
  return clamp(earned, lo, hi)/earned;
}
// the session's score: the mean quality of your involvements, 0.3 to 1 (3.6.2)
export function sessionScore(qs){
  if (!qs || !qs.length) return 0.3;
  let s = 0; for (const q of qs) s += q;
  return clamp(s/qs.length, 0.3, 1);
}
// what finishing the session is worth, once a day (3.6.2): chemistry scaled by the room left in it, and trust
export function sessionRewards(score, chem){
  const sc = clamp(+score || 0, 0, 1);
  return {chem: 1.2*(1 - clamp(+chem || 0, 0, 130)/130)*sc, trust: 0.2 + 0.2*sc};
}

/* ---------- the first day's lessons (3.6.3) ---------- */
export const LESSONS = Object.freeze([
  {n: 1, kind: 'move', mode: 'lesson', title: "Move, sprint, breathe",
    line: "Jog to the cone, then sprint back. Watch the bar at the bottom. That's your breath.",
    area: {x0: -26, x1: 6, z0: 2, z1: 22}, dir: 1, start: {x: -16, z: 12}, cone: {x: 4, z: 12}, mates: 0, opps: 0, keeper: false},
  {n: 2, kind: 'receive', mode: 'lesson', title: "Receive",
    line: "I'll play it to you. Let it come across your body and take it forward with your first touch.",
    area: {x0: -26, x1: 6, z0: 2, z1: 22}, dir: 1, start: {x: -10, z: 12}, feed: {kind: 'pass', from: {x: -22, z: 18}}, mates: 0, opps: 0, keeper: false},
  {n: 3, kind: 'call', mode: 'lesson', title: "Pass to a caller",
    line: "When a teammate calls, look for him. Pass with the right mouse button.",
    area: {x0: -26, x1: 6, z0: -2, z1: 22}, dir: 1, start: {x: -10, z: 10}, feed: {kind: 'pass', from: {x: -22, z: 18}}, mates: 2, mateSlots: ['CB', 'CDM'], opps: 0, keeper: false},
  {n: 4, kind: 'shoot', mode: 'lesson', title: "Shoot low and high",
    line: "Low contact keeps it down. High contact lifts it. Try both.",
    area: null, dir: 1, start: {x: 17, z: 4}, feed: {kind: 'pass', from: {x: 24, z: 15}}, mates: 0, opps: 0, keeper: true},
  {n: 5, kind: 'position', mode: 'lesson', title: "Position and the offside line",
    line: "Take your position when I call the shape. Stay level with the last defender until the pass is played.",
    area: null, dir: 1, start: {x: -4, z: 8}, mates: 1, mateSlots: ['CM'], opps: 2, oppSlots: ['CB', 'CB'], keeper: true, offside: true},
  {n: 6, kind: 'ssg', mode: 'lesson', title: "Small-sided game",
    line: "Two minutes, four against four. You're in our colours, the bibs are against you. Show me what you've got.",
    area: null, dir: 1, mates: 3, mateSlots: ['CB', 'CM', 'ST'], opps: 4, oppSlots: ['CB', 'CM', 'LW', 'ST'], keeper: true, real: 120}
]);
export const LESSON_TRIES = 3;
export const LESSON_DONE_LINE = "That'll do for day one. Same time tomorrow.";

/* ---------- where people stand ---------- */

// a slot's place in an area, for team 0 attacking dir: the slot's shape position (x 0..100 left to right, y 0..100 own
// goal to theirs, tactics.js SLOT_POS) spread over the area, in the training pitch's frame
export function slotSpot(slotPos, area, dir, team = 0){
  const a = area || {x0: -GP.L/2, x1: GP.L/2, z0: -GP.Wd/2, z1: GP.Wd/2};
  const d = team === 0 ? dir : -dir;
  const u = clamp(slotPos.y/100, .08, .92), w = clamp(slotPos.x/100, .08, .92);
  const cx = (a.x0 + a.x1)/2, cz = (a.z0 + a.z1)/2, hl = (a.x1 - a.x0)/2, hw = (a.z1 - a.z0)/2;
  return {x: cx + d*(u - .5)*2*hl, z: cz + d*(w - .5)*2*hw};
}
// a lesson's slot anchor for the shape call (L5): the player's own slot in a 4-3-3 on the training pitch (pitch-local)
export function shapeAnchor(slotPos, dir){ return slotSpot(slotPos, null, dir, 0); }

/* ---------- what counts (the success tests; each takes the simulation's own events) ----------
   ev: the events since the go began (ms.events slice), me: the player's agent id, team: his team. Every test answers
   {done, ok, q, why} once the go is decided, else null. q is the quality of it 0..1 (the XP's q). */
const kicksBy = (evs, me, intents) => evs.filter(e => e.kind === 'kick' && e.agent === me && !e.whiff && (!intents || intents.includes(e.intent)));
const lastOf = a => a.length ? a[a.length - 1] : null;

// a shot by you, decided: on target (a goal or a save) or not
export function shotTest(evs, me, ctx = {}){
  const k = lastOf(kicksBy(evs, me, ['shot', 'header', 'chip', 'lob']));
  if (!k) return ctx.timeUp ? {done: true, ok: false, q: 0, why: 'none'} : null;
  if (k.res == null && !ctx.timeUp && !ctx.dead) return null;
  const res = k.res || 'wide';
  const on = res === 'goal' || res === 'saved';
  // how good it was: on target is most of it; a goal is better; how far from the keeper's middle it went
  const q = on ? clamp(.6 + (res === 'goal' ? .25 : 0) + .15*clamp(Math.abs(+k.tz || 0)/3.66, 0, 1), 0, 1) : res === 'wood' ? .3 : 0;
  return {done: true, ok: on, q, why: res, contact: k.contact, kick: k};
}
/* ---------- the corner targets (A1.7) ----------
   Four targets hang in the goal the finishing drill and the free kicks are aimed at: a metre square in each corner of
   the goal mouth, measured on the ball's centre as it crosses the line (TARGET.W in from the post's inner face,
   TARGET.H down from the bar or up from the grass). A goal through one is worth TARGET_PTS.corner, any other goal
   TARGET_PTS.goal, a shot through one that the keeper keeps out TARGET_PTS.saved (it was in the corner: he did well);
   nothing else scores. The goal mouth is 7.32 x 2.44 between the inner faces (pitchspec.js). */
export const TARGET = Object.freeze({W: 1.0, H: 1.0, HW: 3.66, TOP: 2.44});
export const TARGET_PTS = Object.freeze({corner: 3, goal: 1, saved: 1});
export const CORNER_NAME = Object.freeze({tl: "top left", tr: "top right", bl: "bottom left", br: "bottom right"});
// where a flight crosses the goal line of the goal at end (+1 or -1, its x sign; hx the half length): the ball's centre
// {y, z} once it is all the way over the line, from the prediction pred (x, y, z, t per sample, n samples), or null
// when it never gets there
export function crossAt(pred, n, end, hx, r = 0.11){
  const gx = end*(hx + r);
  for (let k = 1; k < n; k++){
    const x0 = pred[4*(k - 1)], x1 = pred[4*k];
    if ((x0 - gx)*end < 0 && (x1 - gx)*end >= 0){
      const f = (gx - x0)/(x1 - x0 || 1e-9);
      return {y: pred[4*(k - 1) + 1] + f*(pred[4*k + 1] - pred[4*(k - 1) + 1]), z: pred[4*(k - 1) + 2] + f*(pred[4*k + 2] - pred[4*(k - 1) + 2])};
    }
  }
  return null;
}
// which target a ball crossing the line at (y, z) went through ('tl', 'tr', 'bl', 'br', as the shooter sees the goal
// at end), or null. Facing the goal at +x your right is +z; facing it at -x, -z.
export function cornerOf(y, z, end){
  if (!(y >= 0) || !Number.isFinite(z)) return null;
  const az = Math.abs(z);
  if (az > TARGET.HW || y > TARGET.TOP || az < TARGET.HW - TARGET.W) return null;
  const lvl = y >= TARGET.TOP - TARGET.H ? 't' : y <= TARGET.H ? 'b' : null;
  return lvl ? lvl + (z*end > 0 ? 'r' : 'l') : null;
}
// a decided shot (shotTest's verdict v) and the target it went through: the points, the quality (the XP's q) and the
// line the card shows
export function targetScore(v, corner){
  if (!v || !v.done) return null;
  const goal = v.why === 'goal', saved = v.why === 'saved';
  const pts = goal ? (corner ? TARGET_PTS.corner : TARGET_PTS.goal) : saved && corner ? TARGET_PTS.saved : 0;
  const q = goal ? (corner ? 1 : .8) : saved ? (corner ? .8 : .6) : v.why === 'wood' ? .3 : 0;
  const line = goal ? (corner ? (corner[0] === 't' ? "Top corner!" : "Bottom corner!") : "Goal") : saved ? (corner ? "In the corner, but he saved it" : "Saved") : null;
  return {pts, q, corner, where: corner ? CORNER_NAME[corner] : "", line};
}

/* ---------- the volley (A1.5, A1.7) ----------
   A volley by you, decided: on target and struck before the ball landed. ctx.air: it was still in the air when you hit
   it (the drill counts the bounces); the kick's strike (1 sweet, lower for a swing early or late off the timing ring)
   makes most of its quality. */
export function volleyTest(evs, me, ctx = {}){
  const k = lastOf(kicksBy(evs, me, ['shot', 'chip', 'lob']));
  if (!k) return ctx.timeUp || ctx.dead ? {done: true, ok: false, q: 0, why: ctx.dead ? 'missed' : 'none'} : null;
  if (k.res == null && !ctx.timeUp && !ctx.dead) return null;
  const res = k.res || 'wide', on = res === 'goal' || res === 'saved', air = ctx.air !== false;
  const clean = clamp(k.strike != null ? +k.strike : .6, 0, 1);
  const q = on ? clamp((.5 + (res === 'goal' ? .2 : 0) + .3*clean)*(air ? 1 : .6), 0, 1) : 0;
  return {done: true, ok: on && air, q, why: on && !air ? 'bounced' : res, clean, air, kick: k};
}
// a header by you, decided: on target
export function headerTest(evs, me, ctx = {}){
  const k = lastOf(kicksBy(evs, me, ['header']));
  if (!k) return ctx.timeUp || ctx.dead ? {done: true, ok: false, q: 0, why: ctx.dead ? 'missed' : 'none'} : null;
  if (k.res == null && !ctx.timeUp && !ctx.dead) return null;
  const res = k.res || 'wide', on = res === 'goal' || res === 'saved';
  return {done: true, ok: on, q: on ? (res === 'goal' ? 1 : .75) : .2, why: res};
}
// a pass by you, decided: completed to a team-mate (the chain resolves it ok when he controls it)
export function passTest(evs, me, ctx = {}){
  const k = lastOf(kicksBy(evs, me, ['pass', 'through', 'cross', 'lob']));
  if (!k) return ctx.timeUp ? {done: true, ok: false, q: 0, why: 'none'} : null;
  if (k.res == null && !ctx.timeUp && !ctx.dead) return null;
  const ok = k.res === 'ok';
  const d = +k.dist || 0;
  return {done: true, ok, q: ok ? clamp(.65 + d/60, 0, 1) : 0, why: k.res || 'lost', to: k.by, kick: k};
}
// reading the lane: you cut a pass out or won the ball (a control, a block or a tackle that won it), before they had
// strung `passes` passes together
export function interceptTest(evs, me, team, ctx = {}){
  for (const e of evs){
    if (e.agent === me && e.kind === 'touch' && (e.how === 'control' || e.how === 'block' || e.how === 'tackle' && e.quality >= 1))
      return {done: true, ok: true, q: e.how === 'control' ? 1 : .8, why: e.how};
    if (e.kind === 'tackle' && e.agent === me && e.won) return {done: true, ok: true, q: .8, why: 'tackle'};
  }
  let n = 0;
  for (const e of evs) if (e.kind === 'kick' && e.team !== team && e.res === 'ok') n++;
  if (n >= (ctx.passes || 3) || ctx.timeUp || ctx.dead) return {done: true, ok: false, q: 0, why: n >= (ctx.passes || 3) ? 'through' : ctx.dead ? 'out' : 'time'};
  return null;
}
// one against one: a tackle won, or the attacker forced out over a touchline; he gets past you if he takes it over the
// end line you defend (or still has it when the time is up)
export function duelTest(evs, me, team, ctx = {}){
  for (const e of evs){
    if (e.kind === 'tackle' && e.agent === me && e.won) return {done: true, ok: true, q: 1, why: 'tackle'};
    if (e.kind === 'touch' && e.agent === me && (e.how === 'control' || e.how === 'block')) return {done: true, ok: true, q: .8, why: e.how};
    if (e.kind === 'out' && e.line === 'touch') return {done: true, ok: true, q: .7, why: 'wide'};
    if (e.kind === 'out' && e.line === 'goal') return {done: true, ok: false, q: 0, why: 'beaten'};
  }
  if (ctx.timeUp) return {done: true, ok: false, q: 0, why: 'time'};
  return null;
}
// a first touch (L2): controlled, and the ball left within 2 m ahead in the direction you pushed it
export function receiveTest(evs, me, ctx = {}){
  const t = evs.find(e => e.kind === 'touch' && e.agent === me && e.how === 'control');
  if (!t) return ctx.timeUp || ctx.dead ? {done: true, ok: false, q: 0, why: 'missed'} : null;
  if (!ctx.after) return null;                         // decided a moment after the touch, where the ball has gone
  const a = ctx.after;                                 // {ahead, lat, dist, pushed}: the ball from the player then
  const ok = !!a.pushed && a.ahead > 0.2 && a.dist <= 2 && Math.abs(a.lat) <= 1.2;
  return {done: true, ok, q: ok ? clamp(1 - Math.abs(a.dist - 1)/2, .5, 1) : clamp(+t.quality || 0, 0, .4), why: ok ? 'clean' : a.pushed ? 'heavy' : 'still'};
}
// a pass to the man who called for it (L3)
export function callerTest(evs, me, ctx = {}){
  const call = evs.find(e => e.kind === 'call' && e.agent !== me && (e.to == null || e.to === me));
  const k = lastOf(kicksBy(evs, me, ['pass', 'through', 'lob']));
  if (!k) return ctx.timeUp ? {done: true, ok: false, q: 0, why: 'none'} : null;
  if (k.res == null && !ctx.timeUp && !ctx.dead) return null;
  const ok = k.res === 'ok' && !!call && k.by === call.agent && k.t >= call.t;
  return {done: true, ok, q: ok ? 1 : 0, why: ok ? 'caller' : k.res === 'ok' ? 'other' : (k.res || 'lost'), caller: call ? call.agent : -1};
}
// L1: to the cone, back at a sprint until the breath is under 70, then walk until it is back over 90
export function moveStage(st, s){
  // s: {d /* distance to the cone */, dBack /* from the start */, B, gait, speed}; st: {stage: 'out'|'back'|'walk'|'done'}
  if (st.stage === 'out' && s.d <= 1.5) st.stage = 'back';
  else if (st.stage === 'back' && s.B < 70) st.stage = 'walk';
  else if (st.stage === 'walk' && s.B > 90) st.stage = 'done';
  return st.stage;
}
// L5: at the slot's anchor within 3 m inside 8 s of the call
export const shapeOk = (d, tSince) => d <= 3 && tSince <= 8;

/* ---------- XP from what you did (3.6.2) ---------- */
// the XP for one measured action: [skill, base, perQ] lines, q 0..1 -> [[skill, amount]]
export function xpFor(lines, q){ return lines.map(([k, b, per]) => [k, b + per*clamp(+q || 0, 0, 1)]); }
export const ACTION_XP = Object.freeze({
  pass: [['passacc', 2, 4], ['passing', 1, 2]],
  touch: [['dribbling', 1, 2]],
  shot: [['accuracy', 3, 4], ['power', 1, 2]],
  win: [['interception', 3, 0]],
  tackle: [['tackling', 3, 0]],
  sprint: [['sprintSpeed', 1, 0], ['acceleration', 0.5, 0], ['stamina', 1, 0]]            // per 60 m of sprinting
});
// what the player did in a block, from its events: [{key, q}] in order (the session's XP and its score)
export function involvements(evs, me){
  const out = [];
  for (const e of evs){
    if (e.agent !== me) continue;
    if (e.kind === 'kick' && !e.whiff){
      if (e.intent === 'shot' || e.intent === 'header' && e.atGoal){ const on = e.res === 'goal' || e.res === 'saved'; if (on) out.push({key: 'shot', q: e.res === 'goal' ? 1 : .7}); else out.push({key: null, q: .3}); }
      else if (e.intent === 'pass' || e.intent === 'through' || e.intent === 'lob' || e.intent === 'cross'){ if (e.res === 'ok') out.push({key: 'pass', q: clamp(.6 + (+e.dist || 0)/50, 0, 1)}); else if (e.res) out.push({key: null, q: .2}); }
    } else if (e.kind === 'touch' && e.how === 'control'){ if ((+e.quality || 0) >= .6) out.push({key: 'touch', q: +e.quality}); }
    else if (e.kind === 'tackle' && e.won) out.push({key: 'tackle', q: 1});
    else if (e.kind === 'touch' && e.how === 'block') out.push({key: 'win', q: .8});
  }
  return out;
}
// the distance between two points (for the tests' callers)
export const dist = (ax, az, bx, bz) => hypot(ax - bx, az - bz);

/* ---------- the small-sided games (UF2-B, USER-ISSUES Round 2: U13 to U16) ----------
   A small-sided game (the first day's Lesson 6 and the team session's third block) is played as a game: a score kept
   on a small scoreboard with the time left, your side in the club's training kit and the other side in bibs of one
   colour clearly apart from it (the U11 rule, kitclash.js CIEDE2000), the same all game; after a goal the side that
   conceded kicks off from the centre spot at once (a fresh ball from the coach's bag), the rest jog back to their
   shape, and play is going again inside SSG.DEAD_MAX seconds.
     CELEB     how long the goal stands before the kick-off is called (s): the match's own is 3
     KO_LIMIT  the kick-off is taken this long after the goal (s) at the latest, once the taker is at the ball, however
               far the others still have to jog (they carry on into shape as play goes on)
     DEAD_MAX  the most a restart after a goal may take, goal to the kick-off's kick (s; the acceptance bound) */
export const SSG = Object.freeze({CELEB: 1.0, KO_LIMIT: 2.6, DEAD_MAX: 6});
// is this item a small-sided game (a lesson, a block, or any item that says so)
export const isSSG = item => !!item && (item.kind === 'ssg' || item.ssg === true);

// the bibs the other side wears over the club's own shorts: the colour a player reads a man by is the bib, so it has
// to stand KIT_SUM_MIN apart from the club's shirt on its own (the shorts are the same on both sides), and well apart
// from the club's shorts too, or a bib over a shirt of the shorts' colour would read as the club's kit at a glance.
// The club's preferred bib first (the kit man's neon), then the other bags of bibs a training ground has.
export const BIB_COLOURS = Object.freeze(['#d8ff3a', '#ff6a3a', '#1fa2c4', '#e84393', '#f2d53c', '#7a3fb0', '#f2f2ee', '#15161a']);
export const BIB_SHORTS_MIN = 20;
/* club = [shirt, shorts] (any colour the game uses), prefer: the host's bib colour (or null) ->
   {mine: [shirt, shorts], bibs: [bib, shorts], bib, d: {shirt, shorts}}: mine is the club's kit as kitclash.js reads it,
   bibs the other side's (the bib its shirt colour), d how far apart the bib stands from the club's shirt and shorts */
export function bibKits(club, prefer = null){
  const ok = Array.isArray(club) && rgb(club[0]);
  const mine = ok ? [hexOf(club[0]), hexOf(club[1] != null && rgb(club[1]) ? club[1] : club[0])] : ['#2c66b8', '#ffffff'];
  const cands = (prefer && rgb(prefer) ? [hexOf(prefer)] : []).concat(BIB_COLOURS);
  let best = null, bs = -Infinity;
  for (const c of cands){
    const d = {shirt: deltaE(c, mine[0]), shorts: deltaE(c, mine[1])};
    const pass = d.shirt >= KIT_SUM_MIN && d.shorts >= BIB_SHORTS_MIN && !kitsClash(mine, [c, mine[1]]);
    if (pass) return {mine, bibs: [c, mine[1]], bib: c, d};
    const s = Math.min(d.shirt, 2*d.shorts);
    if (s > bs){ bs = s; best = {mine, bibs: [c, mine[1]], bib: c, d}; }
  }
  return best;
}
// the scoreboard's time: whole seconds left as m:ss
export function clockText(secs){
  const s = Math.max(0, Math.ceil(+secs || 0)), m = Math.floor(s/60), r = s - 60*m;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
/* how a small-sided game ended, as the coach would put it: score = [ours, theirs] -> {line, sub, won}. Short and plain
   (the result card's own words) */
export function ssgResult(ours, theirs, mineName = 'You', bibName = 'Bibs'){
  const a = ours | 0, b = theirs | 0;
  const line = a > b ? `Won ${a}-${b}` : a < b ? `Lost ${a}-${b}` : `Drew ${a}-${b}`;
  return {line, sub: `${mineName} ${a}, ${bibName} ${b}`, won: a > b, drew: a === b};
}
/* the kick-off's taker after a goal: the conceding side's outfield man nearest the centre spot who is not the player
   (an AI team-mate takes it, so nobody waits on you), else the player. agents: [{id, team, isGK, isMe, onPitch,
   x, z}] -> id or -1 */
export function koTaker(agents, team, spot = {x: 0, z: 0}){
  let best = -1, bd = Infinity, me = -1;
  for (const a of agents){
    if (a.team !== team || !a.onPitch || a.isGK) continue;
    if (a.isMe){ me = a.id; continue; }
    const d = hypot(a.x - spot.x, a.z - spot.z);
    if (d < bd){ bd = d; best = a.id; }
  }
  return best >= 0 ? best : me;
}
