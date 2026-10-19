/* ============ Football: training in first person ============
   Owner: WP-I (Stage P2). Contract: DESIGN 1.2 (training.js), 1.4.1 (the mode train and its flags), 1.4.13 (createMatch
   with a training cfg.mode), 1.4.17 (control.js, view.js and fphud.js: the match's own controls, bodies and HUD),
   1.6 (the controls), 3.6.2 (partial simulations, the team session), 3.6.3 (the first day's lessons), D4 (one ball,
   one integrator). WP-D3 (Stage P3a, addendum A1.7): the corner targets and their scoring for the finishing drill and
   the free kicks, the volley drill (a lob met on the A1.5 timing ring), the charge handed to view.js fpPose.

   Everything you do with a ball at the training ground is the match: the same simulation (sim.js simStep at 60 Hz),
   the same ball (ball.js, the one integrator), the same actions, AI, keeper and touch models, and the same controls,
   bodies and HUD (control.js, view.js, fphud.js). A drill, a block of the team session or one of the first day's
   lessons is a partial simulation: createMatch with cfg.mode set to the training mode, played on a part of the
   training pitch (trainspec.js areaPitch: its edges are the lines the ball goes out over), with the people it needs
   borrowed from the squad out on the pitch (npc.js teamSession.borrow) and handed back when it is over.

   What happens between the items (walking over to the next square, the coach saying what is next) is ordinary life:
   you walk there yourself, the borrowed squad jog there, and the item starts once you are in its ground. While an
   item runs, the mode train is on: the simulation moves you (movement 'own'), P mirrors your agent every frame so the
   life camera and your first-person body are where you are, and the clock passes at the item's own rate.

   The coach who plays balls in (the assistant coach of ground.js, GROUND.assist) is a person on the grass, not an
   agent: he walks to his spot, takes a ball out of his bag and plays it with a real strike (moves.js), and the ball
   leaves his boot at the moment of contact through ballKick, the one way a player changes the ball's velocity.

   Only bridge.js among the football files reads or writes the career (D5): what this file needs of it (your skills
   on the day, your squad, the clock, the XP and the rewards) comes through the host acts.js hands in with each run.

   P3-B (TR-3, TRAINING-SPEC 4 and 8, BUILD-PLAN P3-B item 8): the host is handed in per run (startDrill(kind, host),
   startSession(host), startFirstTraining(host)) and kept on the run and on its item (T.host), never module-wide, so
   Training Mode's runner (js/life/train/runner.js) and the career's drills are two clients of the same mode train
   that cannot leak into each other. The runner drives the mode with an item of its own (T.fixed: one SCHED.fixed
   task steps the simulation; T.bodyOf and T.fpBody: pooled bodies; T.officials false). The coach's ball to you is a
   chain pass whose receiver is you (AI-2 follow-up), so your team-mates leave it to you; his scheduler task runs only
   while he is lent to a run or walking back to his post (perf-9). P4-B (TR-4): a host's pause callback (see "leaving").

   UF2-B (user fix round 2, USER-ISSUES Round 2 U13 to U16: the small-sided game, the first day's Lesson 6 and the team
   session's third block, and any item that says it is one): a small scoreboard (ssghud.js: the sides, the score, the
   time left), your side in the club's kit and the other side in bibs of one colour clearly apart from it, the same all
   game (kitsOf, dressFor: the U11 rule through trainspec.js bibKits and kitclash.js), the aura on the team-mate you
   look at (aura.js, U8), and after a goal a quick kick-off from the side that conceded with everyone jogging back to
   shape (ssgStep), the coach's new ball after the ball goes out played in from the line where he stands (ssgFeed).
   The AI's attacking end was checked at its source (brain.js aims every shot, header and first-time finish at
   dirs[team]; qa/uf2-ssg-sim.mjs counts them over many seeds): the side you saw shooting at its own goal was your own
   team-mates in their own clothes or bibs and the other side in a near colour, which the kits above put right. */
import {THREE, W, mat, onBegin} from "../build.js";
import {P, LIFE, RT, ME, FLAGS} from "../core/state.js";
import {registerMode, enterMode, exitMode, mode, pushInput, popInput, persistNow} from "../core/modes.js";
import {overlayCovered} from "../core/quality.js";
import {SCHED} from "../core/sched.js";
import {animateHuman, EV} from "../human.js";
import {GROUND} from "../ground.js";
import {hudSet, hudResult, hudClose} from "../drills.js";
import {createMatch, simStep, on as simOn, REF, AR1, AR2, TEMPO} from "./sim.js";
import {createBall, ballKick, BALL} from "./ball.js";
import {solveStrike, idealPassSpeed} from "./strike.js";
import {attrsForAI} from "./attrs.js";
import {xgAt} from "./judge.js";
import {refreshPred, startKick} from "./actions.js";
import {startRestart} from "./rules.js";
import * as SP from "./ssgplay.js";
import {AUD} from "./audio.js";
import {logEv, chainKick} from "./events.js";
import * as TS from "./trainspec.js";
import {resolveKits} from "./kitclash.js";
import {CTRL, controlInput, controlStep} from "./control.js";
import * as CT from "./control.js";
import {viewInit, viewFrame, viewDispose} from "./view.js";
import * as VW from "./view.js";
import * as HUD from "./fphud.js";
import * as CAM from "./matchcam.js";
import {ssgShow, ssgFrame, ssgGoal, ssgHide, ssgState} from "./ssghud.js";
import {auraInit, auraFrame, AURA} from "./aura.js";

/* the kits as worn, by team index (home: team 0's), for a career host (acts.js kits(): {home: the club's training kit,
   away: [the bib colour it would like, ...]}). Your side is always in the club's kit and the other side in bibs over
   the club's shorts, whichever way the item is played (UF2-B, USER-ISSUES U15): trainspec.js bibKits picks a bib colour
   clearly apart from the club's kit by the U11 rule (CIEDE2000), and kitclash.js picks the keepers' and the referee's
   colours clear of both (UF-B, U11), as controller.js does for a match. The same club gives the same kits every time,
   so nobody changes colour after a goal, a reset or the next block. (Training Mode's runner hands in kits of its own:
   T.kits.) */
function kitsOf(host, myTeam = 0){
  const k = host.kits() || {};
  const B = TS.bibKits(k.home, k.away ? k.away[0] : null);
  const R = resolveKits({home:B.mine, away:B.bibs});
  const mine = R.home, theirs = R.away;
  return myTeam === 1 ? {home:theirs, away:mine, gk:[R.gk[1], R.gk[0]], ref:R.ref, bib:B.bib, mine:1}
    : {home:mine, away:theirs, gk:R.gk, ref:R.ref, bib:B.bib, mine:0};
}
/* what a borrowed squad body wears in an item (UF2-B, U15): his own face, hair and build (npc.js teamSession.lookOf),
   dressed for his side: your side in the club's kit with no bib (the pair that was passing in bibs takes them off),
   the other side in the bibs (its colour on the shirt and the bib over it, so it reads at any distance and level of
   detail), a keeper in his side's keeper colour. kits: kitsOf's, by team index */
export function dressFor(own, a, kits, myTeam){
  if (!own || !own.outfit || !a || !kits) return own || null;
  const K = a.team === 0 ? kits.home : kits.away;
  const o = Object.assign({}, own.outfit);
  if (a.isGK){
    const c = kits.gk && kits.gk[a.team];
    if (c){ o.shirt = c; o.socks = c; }
  } else if (a.team === myTeam){ o.shirt = K[0]; o.shorts = K[1]; o.bib = false; }
  else { o.shirt = K[0]; o.bib = K[0]; o.shorts = K[1]; }
  return Object.assign({}, own, {outfit:o});
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const H = 1/60, R = BALL.R;
const wrapA = a => a - Math.round(a/(2*Math.PI))*2*Math.PI;

/* ---------- numbers ---------- */
export const TRAIN = Object.freeze({
  MAX_STEPS: 4,          // fixed steps a frame at most (a slow frame slows the drill, it never spirals)
  WALK: 1.6,             // the coach walking to his spot (m/s)
  JOG: 3.6,              // the squad jogging over to the next square (m/s), never faster than SQUAD_V
  SQUAD_V: 6,            // nobody borrowed from the squad ever moves faster than this outside the simulation (2.4 WP-I)
  FEED_TC: .34,          // the coach's pass: from the start of his swing to contact (s)
  REP_LIMIT: 12,         // a go is decided within this long of the ball coming (s)
  STILL: 1.6,            // a ball that has stopped for this long is a dead go
  RESULT: 1.5,           // the card with how it went (s)
  AFTER: .6,             // a first touch is judged this long after it (where the ball went)
  GATHER_R: 1.5,         // inside an item's ground by this much (m) and it starts
  TRIES: TS.LESSON_TRIES
});

/* ---------- the life side ----------
   acts.js hands in {me(), squad(), kits(), seed(key), minute(), sessionEnd(), sessionOn(), centreOpen(), xp(skill, amt),
   exert(f, e), pass(mins), note(text), say(who, text), chip(text, kind), center(title, sub), persist(), attSess(),
   sessionDone(score), lessonsDone(), onb(ev, data), trainCheck()} */

// the run in progress (tests: window.__train): {kind, item, T (the simulation while one plays), log}
export const RUN = {cur:null, T:null, last:null};

/* ---------- the borrowed squad and the coach ----------
   A borrowed body is a person of the squad (teamSession.borrow): while an item plays, its agent stands for it and the
   view draws the agent; between items the body itself walks (JOG) to where the next item wants it. */
const BODY_ST = new WeakMap();
function walkBody(h, tx, tz, dt, v = TRAIN.JOG, face = null){
  const g = h.g, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
  const st = BODY_ST.get(h) || {mode:"move", speed:0};
  BODY_ST.set(h, st);
  if (d < .12){
    st.speed = 0; h.ast = {mode:"idle"};
    if (face != null) g.rotation.y = turnTo(g.rotation.y, face + Math.PI, 5*dt);
    return true;
  }
  const sp = Math.min(v, TRAIN.SQUAD_V, d/Math.max(dt, 1e-3), Math.max(1.2, d*1.5));
  const k = Math.min(1, sp*dt/d);
  g.position.x += dx*k; g.position.z += dz*k;
  g.rotation.y = turnTo(g.rotation.y, Math.atan2(dx, dz), 7*dt);
  st.mode = "move"; st.speed = sp; h.ast = st;
  return false;
}
const turnTo = (a, b, k) => a + clamp(wrapA(b - a), -k, k);

// the assistant coach: he plays the balls in. At his post by the touchline when nobody needs him (GROUND.assist)
const COACH = {h:null, home:null, held:false, at:null, face:null, feed:null, task:null};
function coachTake(){
  const A = GROUND.assist;
  if (!A || !A.h || !A.h.g) return null;
  if (!COACH.held){ COACH.h = A.h; COACH.home = {x:A.x, z:A.z, ry:A.ry}; COACH.held = true; if (A.lend) A.lend(); }
  coachTask(true);
  return COACH.h;
}
// while you walk over to a drill he heads for where its first ball is played from (to = where it goes, both in the
// training pitch's frame)
function coachPrep(from, to){
  if (!coachTake()) return;
  const w = TS.toWorld(from.x, from.z), dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  COACH.at = {x:w.x - dx/L*.62 - dz/L*.14, z:w.z - dz/L*.62 + dx/L*.14}; COACH.face = Math.atan2(-dx, -dz); COACH.going = false;
}
function coachGive(){
  if (!COACH.held) return;
  COACH.at = {x:COACH.home.x, z:COACH.home.z}; COACH.face = COACH.home.ry - Math.PI; COACH.going = true;
}
// every frame (a scheduler task while a run is on, and after it until he is back at his post)
function coachStep(dt){
  const h = COACH.h; if (!h || !COACH.held || !COACH.at) return;
  const f = COACH.feed;
  if (f){
    // his swing: the clip runs to the contact the simulation schedules (moves.js tc), the ball leaves at contact; the
    // follow-through plays on for a moment after it
    if (f.st){ f.st.tc = Math.max(0, f.st.tc - dt); h.ast = f.st; }
    if (f.after != null && (f.after -= dt) <= 0){ COACH.feed = null; h.ast = {mode:"idle"}; }
    return;
  }
  // a long way to go (to the next drill's bag, back to his post) he jogs; the last few metres he walks
  const far = Math.hypot(h.g.position.x - COACH.at.x, h.g.position.z - COACH.at.z) > 3;
  const there = walkBody(h, COACH.at.x, COACH.at.z, dt, far ? TRAIN.JOG : TRAIN.WALK, COACH.face);
  if (there && COACH.going){
    COACH.going = false; COACH.held = false; COACH.at = null;
    h.g.rotation.y = COACH.home.ry; h.ast = h.st || {mode:"idle"};
    const A = GROUND.assist; if (A && A.giveBack) A.giveBack();
    coachTask(false);
  }
}
// (a scheduler task of its own only while he is lent to a run or on his way back to his post, perf-9)
function coachTask(on){
  if (on && !COACH.task) COACH.task = SCHED.task({id:"train-coach", kind:"keep", run:dt => coachStep(dt)});
  else if (!on && COACH.task){ SCHED.remove(COACH.task); COACH.task = null; }
}

/* ---------- the item's ground: a part of the training pitch as a pitch of its own ---------- */
const TP = TS.GP;
// the centre of an area in the training pitch's frame (the whole pitch: its centre)
const areaC = a => a ? {x:(a.x0 + a.x1)/2, z:(a.z0 + a.z1)/2} : {x:0, z:0};
// a point of the training pitch's frame in the item's own frame (area-local) and in the world
const toArea = (T, p) => ({x:p.x - T.ac.x, z:p.z - T.ac.z});
const worldOf = (T, x, z) => ({x:x + T.F.cx, z:z + T.F.cz});
const localOf = (T, wx, wz) => ({x:wx - T.F.cx, z:wz - T.F.cz});
// is a world point inside an item's ground (its field and a margin)?
export function inGround(item, wx, wz, margin = TRAIN.GATHER_R){
  const a = item.area || {x0:-TP.L/2, x1:TP.L/2, z0:-TP.Wd/2, z1:TP.Wd/2};
  const p = TS.toLocal(wx, wz);
  return p.x >= a.x0 - margin && p.x <= a.x1 + margin && p.z >= a.z0 - margin && p.z <= a.z1 + margin;
}

/* the cones round an item's ground, put out while you walk over to it and while it is played */
const CONES = {list:[], key:""};
let CONE_G = null, CONE_M = null;
/* one training cone (the drills' own, scaled; Training Mode's category cones, train/cones.js): its geometry is shared and
   its material kept, so a new place never disposes them. color: a material of the caller's (kept too), or the orange */
export function coneMesh(scale = 1, material = null){
  CONE_G = CONE_G || new THREE.ConeGeometry(.11, .3, 10).translate(0, .15, 0);
  CONE_G.userData.keep = true;
  CONE_M = CONE_M || mat({color:0xf07a1a, roughness:.6});
  CONE_M.userData.keep = true;
  const m = new THREE.Mesh(CONE_G, material || CONE_M);
  m.scale.setScalar(scale); m.userData.keep = true; m.castShadow = false;
  return m;
}
function conesFor(item){
  const key = item ? JSON.stringify(item.area || "pitch") + item.kind : "";
  if (key === CONES.key) return;
  for (const m of CONES.list) if (m.parent) m.parent.remove(m);
  CONES.list.length = 0; CONES.key = key;
  if (!item || !item.area || !W.scene) return;
  const a = item.area;
  for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1], [(a.x0 + a.x1)/2, a.z0], [(a.x0 + a.x1)/2, a.z1]]){
    const w = TS.toWorld(x, z), m = coneMesh();
    m.position.set(w.x, 0, w.z);
    W.scene.add(m); CONES.list.push(m);
  }
}
// the cone of the first lesson, 20 m from where you start
const MARK = {m:null};
function markAt(w){
  if (MARK.m && MARK.m.parent) MARK.m.parent.remove(MARK.m);
  MARK.m = null;
  if (!w || !W.scene) return;
  CONE_G = CONE_G || new THREE.ConeGeometry(.11, .3, 10).translate(0, .15, 0);
  const m = new THREE.Mesh(CONE_G.clone().scale(1.6, 1.6, 1.6), mat({color:0xc8f060, roughness:.6}));
  m.position.set(w.x, 0, w.z); W.scene.add(m); MARK.m = m;
}

/* ---------- building one item on the simulation ---------- */
// a world position code for a slot (attrs.js attrsForAI's pos)
const POS_OF = {GK:"GK", LB:"DF", CB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", RF:"ST", CF:"ST", ST:"ST"};
const ARCH_OF = {GK:"GK", DF:"DF", CM:"CM", CAM:"AM", LW:"W", RW:"W", ST:"ST"};
function playerRec(p, slot, me = false){
  const pos = POS_OF[slot] || "CM";
  return {pid:p.pid, name:p.name, number:p.number, slot, arch:ARCH_OF[pos] || "CM", isGK:slot === "GK", isMe:me, scale:p.scale || 1,
    at:me ? p.at : attrsForAI({id:p.pid, ovr:p.ovr, pos}), energy:me ? p.energy : 100, fatigue:me ? p.fatigue : 0, prefFoot:p.prefFoot || "Right", items:me ? p.items : null};
}

/* your team-mates' slots in an item (trainspec.js mateSlotsFor): one of yours in goal ('GK') only when the squad's keeper
   is in the other goal, and in a small-sided game the outfield men round you cover the back, the middle and the front */
const mateSlots = (item, mine, keeper) => TS.mateSlotsFor(item.mateSlots, mine, keeper, TS.isSSG(item));
/* the simulation for an item. who = {mates:[body], opps:[body], keeper:body|null}: the borrowed squad bodies (their
   records from the squad), placed where each stands now. Your agent starts where you stand. */
function buildItem(item, who, opts = {}){
  const host = opts.host;
  const tier = GROUND.tier || 3;
  const spec = TS.areaPitch(item.area, tier);
  const ac = areaC(item.area);
  const F = spec.frame;
  const meRec = host.me();
  // which side you are: team 0 attacks +x (sim dirs [1, -1]); an item played toward -x puts you in team 1
  const myTeam = item.dir < 0 ? 1 : 0, oppTeam = 1 - myTeam;
  // the squad's records (names, numbers, how good they are) for the bodies lent: the club's own players, keepers last
  const squad = host.squad(), outfield = squad.filter(q => q.pos !== "GK");
  let si = 0;
  const nextSquad = () => outfield.length ? outfield[(si++) % outfield.length] : {pid:900 + si, name:"", number:++si + 1, ovr:55, pos:"CM"};
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  const bodiesOf = [[], []];          // per team, in the order of its players: the body each agent stands for (null: you)
  const add = (team, rec, body) => { teams[team].players.push(rec); bodiesOf[team].push(body); };
  add(myTeam, playerRec(meRec, meRec.slot, true), null);
  const mSlots = mateSlots(item, meRec.slot, !!who.keeper);
  (who.mates || []).forEach((b, i) => { const p = nextSquad(); add(myTeam, Object.assign(playerRec(p, mSlots[i] || "CM"), {scale:b.scale || 1}), b); });
  (who.opps || []).forEach((b, i) => { const p = nextSquad(); add(oppTeam, Object.assign(playerRec(p, (item.oppSlots || [])[i] || "CB"), {scale:b.scale || 1}), b); });
  if (who.keeper){
    const p = squad.find(q => q.pos === "GK") || nextSquad();
    add(oppTeam, Object.assign(playerRec(p, "GK"), {scale:who.keeper.scale || 1}), who.keeper);
  }
  const rules =Object.assign({goals:TS.goalsLaw(spec), offside:!!item.offside, restarts:!!item.restarts, cards:false, subs:0, halfTime:false, stoppage:false}, opts.rules || {});
  const cfg = {seed:host.seed(item.kind + ":" + (opts.n || 0)), mode:item.mode, spec, halfRealSec:1e6, tempo:Object.assign({}, TEMPO[2]),
    teams, me:{team:myTeam, slot:meRec.slot, prefFoot:meRec.prefFoot, chem:meRec.chem, trust:meRec.trust, traits:meRec.traits, staminaF:meRec.staminaF, role:"starter"},
    rules, kickoffTeam:myTeam, htAuto:true};
  const ms = createMatch(cfg);
  // no officials at training
  for (const id of [REF, AR1, AR2]) if (ms.agents[id]) ms.agents[id].onPitch = false;
  // everyone where he really is: you where you stand, the squad where they stood when they were borrowed
  const placeAt = (a, wx, wz, yaw) => {
    const p = {x:wx - F.cx, z:wz - F.cz};
    const B = spec.runoff;
    a.m.x = a.x0 = clamp(p.x, -B.hx, B.hx); a.m.z = a.z0 = clamp(p.z, -B.hz, B.hz);
    a.m.vx = a.m.vz = 0; a.m.speed = 0; a.m.yaw = a.m.heading = yaw;
  };
  const T = {item, spec, F, ac, ms, me:ms.agents[ms.me], myTeam, oppTeam, bodies:new Map(), V:null, t:0, acc:0, host,
    evFrom:0, tries:0, rep:0, results:[], xp:{}, xpRaw:0, qs:[], done:false, phase:"play", tRep:0, opts, onEnd:opts.onEnd || null,
    traits:meRec.traits || {}, sprintD:0, ballSeen:false, inPlay:false, goalAt:null, bounces:0};
  // what the ball itself does (ball.js, through the simulation's own feed): where a goal crossed the line, height and
  // all (the corner targets score on it), and each bounce on the grass (a volley is struck before the first)
  simOn(ms, "goal", d => { if (d && d.end != null && d.y != null) T.goalAt = {y:d.y, z:d.z, end:d.end, t:d.t}; });
  simOn(ms, "bounce", () => { T.bounces++; });
  placeAt(T.me, P.x, P.z, P.yaw);
  for (const t of [0, 1]){
    const list = ms.agents.filter(a => a.team === t && a.role === "player");
    list.forEach((a, i) => {
      const body = bodiesOf[t][i];
      if (!body) return;
      const g = body.h.g;
      placeAt(a, g.position.x, g.position.z, g.rotation.y - Math.PI);
      T.bodies.set(a.id, body);
      g.visible = false;                             // the view draws the agent in his place now
    });
  }
  ms.cutStep = ms.step;
  // where the ball starts: dead where the first ball is to be played from (the coach's bag, a free kick's spot)
  const b = ms.ball;
  b.state = "dead"; b.v.x = b.v.y = b.v.z = 0;
  const at = opts.ballAt ? toArea(T, opts.ballAt) : {x:T.me.m.x, z:T.me.m.z + 1.2};
  b.p.x = at.x; b.p.z = at.z; b.p.y = R;
  if (!item.kickoff){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; } }
  refreshPred(ms);
  return T;
}

/* ---------- a new ball ----------
   A drill uses the balls of the coach's bag: each go is a fresh ball out of it, the last one left where it ended up
   (a loose spare of the simulation, still on the grass or in the net). takeBall puts one at (x, z) of the item's frame */
export function takeBall(T, x, z, dead = true){
  const ms = T.ms, old = ms.ball;
  const fresh = createBall({x, z, rollDecel:old.rollDecel});
  fresh.state = dead ? "dead" : "free";
  const j = ms.spares.findIndex(q => q.ball === old);
  // the old ball: loose where it is (the view draws it), unless it was never seen (the first one, parked out of sight)
  if (j >= 0) ms.spares[j].state = T.ballSeen ? "loose" : "gone";
  if (old.state !== "held") old.state = "dead";
  if (!T.ballSeen && j >= 0) ms.spares.splice(j, 1);
  ms.spares.push({ball:fresh, cone:-1, state:"live"});
  ms.ball = fresh; ms.ballSwap = ms.step;
  T.ballSeen = true;
  refreshPred(ms);
  return fresh;
}

/* the coach plays a ball from (x, z) of the item's frame to a point: a ground pass ('pass') or a cross in the air
   ('cross'), struck with his right foot when his swing gets there. to = {x, y, z} item-local */
function coachFeed(T, kind, from, to, toMe = false){
  const h = coachTake(); if (!h) return false;
  const w = worldOf(T, from.x, from.z);
  const dir = {x:to.x - from.x, z:to.z - from.z}, L = Math.hypot(dir.x, dir.z) || 1;
  // he stands behind the ball, square to where it goes
  COACH.at = {x:w.x - dir.x/L*.62 - dir.z/L*.14, z:w.z - dir.z/L*.62 + dir.x/L*.14}; COACH.face = Math.atan2(-dir.x, -dir.z);
  T.feed = {kind, from, to, stage:"walk", t:0, toMe:!!toMe};
  return true;
}
// the feed's progress, every fixed step: walk, ball out of the bag, the swing, contact
function feedStep(T){
  const f = T.feed; if (!f) return;
  const ms = T.ms, h = COACH.h;
  if (!h){ T.feed = null; return; }
  if (f.stage === "walk"){
    const d = Math.hypot(h.g.position.x - COACH.at.x, h.g.position.z - COACH.at.z);
    f.t += H;
    if (d < .2 || f.t > 20){
      takeBall(T, f.from.x, f.from.z, true);
      f.stage = "swing"; f.t = 0;
      const bw = worldOf(T, f.from.x, f.from.z), tw = worldOf(T, f.to.x, f.to.z);
      const up = f.kind === "cross" || f.kind === "loft";
      COACH.feed = {st:{mode:"strike", kind:up ? "lofted" : "side", side:"R", ball:{x:bw.x, y:R, z:bw.z}, dir:{x:tw.x - bw.x, z:tw.z - bw.z},
        power:f.kind === "cross" ? .8 : f.kind === "loft" ? .55 : .5, curl:0, lowHigh:up ? 1 : 0, tc:TRAIN.FEED_TC}};
      f.tc = ms.t + TRAIN.FEED_TC;
    }
    return;
  }
  if (f.stage === "swing" && ms.t >= f.tc - 1e-9){
    const b = ms.ball, d = Math.hypot(f.to.x - b.p.x, f.to.z - b.p.z);
    const cross = f.kind === "cross", loft = f.kind === "loft";
    // (a lob for a volley: a little over the slowest speed that carries it there, so it climbs steeply, about 45 degrees,
    // and drops into the volleyer's stride from above rather than skimming in)
    const speed = loft ? clamp(Math.sqrt(9.81*Math.max(3, d))*1.06*(1 + .006*d), 6, 15)
      : cross ? clamp(Math.sqrt(12.5*Math.max(4, d))*(1 + .005*d), 9, 24) : idealPassSpeed(Math.max(2, d), 9, b.rollDecel);
    const r = solveStrike({from:{x:b.p.x, y:b.p.y, z:b.p.z}, target:{x:f.to.x, y:f.to.y != null ? f.to.y : R, z:f.to.z}, speed, contact:cross || loft ? 1 : 0, curl:0, foot:"R",
      kind:cross || loft ? "cross" : "pass", rollDecel:b.rollDecel});
    b.state = "free";
    const kind = cross || loft ? "cross" : "pass";
    ballKick(b, r.v, r.w, {agent:-1, team:T.myTeam, kind, t:ms.t});
    refreshPred(ms);
    /* the coach's ball is a pass in the chain of play (events.js chainKick) like any other: to you, with you as its
       receiver, so the rule that leaves a pass to the player to him (brain.js ballPlans, P2-A AI-2) sees it is yours
       and your team-mates do not chase it unless one is clearly first. Its kick event (agent -1, the coach) is heard
       by events() below, and it is played with no offside snapshot, as a ball from outside the play */
    const toMe = !!(f.toMe && T.me);
    const ev = logEv(ms, "kick", T.myTeam, -1, b.p.x, b.p.z, {intent:kind, recv:toMe ? T.me.id : -1, coach:true, noOffside:true,
      speed:Math.round(Math.hypot(r.v.x, r.v.y, r.v.z)*100)/100, tx:Math.round(f.to.x*100)/100, tz:Math.round(f.to.z*100)/100});
    chainKick(ms, ev);
    ms.kick = {seq:(ms.kick ? ms.kick.seq : 0) + 1, ev, t:ms.t, team:T.myTeam, agent:-1};
    f.stage = "gone"; T.feed = null; T.fedAt = ms.t; T.fedBounces = T.bounces;
    if (COACH.feed) COACH.feed.after = .5;
  }
}
const worldPt = (T, p) => ({x:p.x + T.F.cx, y:p.y, z:p.z + T.F.cz});

/* ---------- the mode train ----------
   The match's own presentation, on the training pitch: the bodies and the ball (view.js) in a group placed at the
   item's frame (the simulation's pitch-local metres are the group's own), your eyes and your first-person body (the
   camera owner match-fp, matchcam.js, with P mirroring your agent, as in a match), the match HUD (fphud.js: the breath,
   the power arc, the hints, the calls), the controls (control.js). The life HUD stays up (the clock and the needs). */
let INP = null;
const RMB = {down:null, up:null, menu:null};
// (the window losing focus lets go of Tab: its keyup never comes)
if (typeof addEventListener === "function") addEventListener("blur", () => { if (INP) HUD.hudTab(false); });
function inputOn(){
  INP = ev => {
    if (!RUN.T) return false;
    if (ev.type === "keydown" && ev.key === "escape"){ if (ev.prevent) ev.prevent(); if (!ev.repeat) pauseOrQuit(); return true; }
    // (Training Mode: Backspace starts the scenario again from its setup, G0 lead confirmation)
    if (ev.type === "keydown" && ev.key === "backspace" && RUN.T.onRestart){ if (ev.prevent) ev.prevent(); if (!ev.repeat) RUN.T.onRestart(); return true; }
    // (a key with a modifier held is nobody's action here, as in a match: D9, control.js modded)
    if (ev.type === "keyup" && ev.key === "tab"){ HUD.hudTab(false); return true; }
    if ((ev.type === "keydown" || ev.type === "keyup") && CT.modded(ev)) return controlInput(ev);
    if (ev.type === "keydown" && ev.key === "h"){ if (ev.prevent) ev.prevent(); if (!ev.repeat && HUD.hudToggleHints) HUD.hudToggleHints(); return true; }
    // Tab held: the overview, with the offside line (1.6), as in a match
    if (ev.type === "keydown" && ev.key === "tab"){ if (ev.prevent) ev.prevent(); HUD.hudTab(true); return true; }
    // Esc with the pointer held lets the pointer go (the browser keeps that key): letting it go steps out of a drill or
    // the session as Esc does (the lessons only pause, flags.pauseOnUnlock); in Training Mode it opens the pause card
    if (ev.type === "lock"){ if (!ev.locked && !(RUN.T && hostPause(RUN.T)) && RUN.cur && RUN.cur.kind !== "lessons") quit(); return false; }
    return controlInput(ev);
  };
  pushInput(INP);
  // the right button: the world routes the left one only (world.js bindInput), so the pass button is heard here, and
  // (U28 part G) the wheel's button, the flick's (its own default, an auto-scroll, stopped)
  const cv = RT.renderer && RT.renderer.domElement;
  const locked = () => !!cv && document.pointerLockElement === cv;
  RMB.down = e => { if ((e.button === 2 || e.button === 1) && locked() && RUN.T){ if (e.button === 1) e.preventDefault(); controlInput({type:"down", button:e.button, locked:true}); } };
  RMB.up = e => { if ((e.button === 2 || e.button === 1) && RUN.T) controlInput({type:"up", button:e.button, locked:locked()}); };
  RMB.menu = e => { if (RUN.T) e.preventDefault(); };
  addEventListener("mousedown", RMB.down); addEventListener("mouseup", RMB.up); addEventListener("contextmenu", RMB.menu);
}
function inputOff(){
  if (INP) popInput(INP); INP = null;
  HUD.hudTab(false);
  if (RMB.down){ removeEventListener("mousedown", RMB.down); removeEventListener("mouseup", RMB.up); removeEventListener("contextmenu", RMB.menu); }
  RMB.down = RMB.up = RMB.menu = null;
}
const SET = () => CT.SET || {motion:1, fov:78};
const _eye = {x:0, y:0, z:0};

// what viewInit is handed for an item: the career's borrowed squad keep their looks; the runner's pooled bodies
export function viewOpts(T, look, lookOf = null){
  const o = {meLook:look, meFPLook:look, frame:T.F, lookOf:T.bodyOf ? null : lookOf};
  if (T.bodyOf){ o.bodyOf = T.bodyOf; o.fpBody = T.fpBody || null; }
  if (T.officials === false) o.officials = false;
  return o;
}
/* the scoreboard an item shows (ssghud.js ssgShow's argument), or null: a small-sided game's (UF2-B U13: you in the
   club's colour, the other side by its bibs, the score, the time left), or a host item's own T.item.board ({mine:
   {name, kit}, theirs: {name, kit}, real?: seconds}). (Training Mode has no small-sided game of its own yet: its team
   scenarios are objective drills that end on their objective, the first goal for most, with the objective and its
   time on the Training HUD, thud.js. A Training Mode game that is played to a score hands its board in as
   T.item.board) */
function boardOf(T, kits){
  const it = T.item, own = it.board;
  if (!own && !TS.isSSG(it)) return null;
  const mineK = T.myTeam === 0 ? kits.home : kits.away, theirK = T.myTeam === 0 ? kits.away : kits.home;
  const b = {mine:{name:"You", kit:mineK}, theirs:{name:"Bibs", kit:theirK}, us:T.myTeam, real:it.real != null ? +it.real : null};
  if (own) Object.assign(b, own, {us:T.myTeam});
  b.left = b.real != null ? b.real : null;
  return b;
}
// where the view draws an agent this frame, in the world (the aura's posOf), or null when he is not drawn
function auraPosOf(T, id, out){
  const R = T.V && T.V.rec[id];
  if (!R || R.hidden || !R.h || !R.h.g.visible) return null;
  const g = R.h.g.position; out.x = g.x + T.F.cx; out.y = g.y; out.z = g.z + T.F.cz;
  return out;
}

registerMode("train", {
  enter(T){
    RUN.T = T;
    if (CT.controlReset) CT.controlReset();
    CTRL.enabled = true; CTRL.walk = false;
    // the bodies and the ball in the item's frame
    const g = T.group = new THREE.Group();
    g.name = "training"; g.position.set(T.F.cx, 0, T.F.cz); g.updateMatrixWorld(true);
    W.scene.add(g);
    const look = T.host.look();
    // the borrowed squad bodies keep their own faces (npc.js teamSession.lookOf), dressed for their side: yours in the
    // club's kit, the other side in bibs, the same all game (dressFor, UF2-B U15)
    const sess = GROUND.session;
    const kits = T.kits = T.kits || kitsOf(T.host, T.myTeam);
    const lookOf = a => { const b = T.bodies.get(a.id), own = b && b.h && sess && sess.lookOf ? sess.lookOf(b.h) : null; return own ? dressFor(own, a, kits, T.myTeam) : null; };
    // (Training Mode's runner hands in pooled bodies and draws no officials, view.js)
    T.V = viewInit(T.ms, g, kits, viewOpts(T, look, lookOf));
    T.V.me = T.ms.me;
    // your eyes: match-fp (matchcam.js) over where your agent is, your first-person body under them
    CAM.camInit({me:() => T.me, view:() => T.V, eye:out => { out.x = P.x; out.z = P.z; out.y = P.eye; return out; },
      speed:() => T.me.m.speed, top:() => T.me.prm.sprint || 8, breath:() => T.me.st.B, accel:() => T.me.m.acc || 0, bench:() => null,
      motion:() => SET().motion, fov:() => SET().fov,
      pose:(x, z, yaw, dt) => VW.fpPose ? VW.fpPose(T.V, x - T.F.cx, z - T.F.cz, yaw, dt, {speed:T.me.m.speed, wind:CTRL.wind}) : 0,
      clip:() => { const R = T.V && T.V.rec[T.ms.me]; return !!(R && R.clip); }, after:() => {}});
    // the HUD: your breath, the power arc, the hints, the calls; a scorebug only where there is a score to keep
    const k = kits;
    HUD.hudInit({home:{short:T.myTeam === 0 ? T.host.clubShort() : "BIB", kit:k.home}, away:{short:T.myTeam === 0 ? "BIB" : T.host.clubShort(), kit:k.away}, us:T.myTeam});
    const root = HUD.hudRoot ? HUD.hudRoot() : null, bug = root && root.querySelector("[data-part=score]");
    // a small-sided game keeps its score on a scoreboard of its own (ssghud.js: the sides, the score, the time left;
    // UF2-B U13), never the match's scorebug with its match clock. T.item.board (an item of a host's: {mine, theirs,
    // real?}) asks for the same board
    T.board = boardOf(T, k);
    if (bug && (!T.item.score || T.board)) bug.style.display = "none";
    if (T.board) ssgShow(T.board);
    // the team-mate you look at gets the soft red aura, as in a match (aura.js, UF-B U8; UF2-B U15). Made once for the
    // place and kept between items (hidden while none plays), so starting, restarting and stopping build nothing
    if (!AURA.mesh || AURA.scene !== W.scene || !AURA.mesh.parent) auraInit(W.scene);
    // the life HUD's hand, crosshair and compass step aside (the clock and the needs stay)
    document.body.classList.add("drillview");
    // a HUD setting changed in the pause menu applies at once, as in a match
    if (HUD.applySettings && CT.onSet) T.offSet = CT.onSet(() => HUD.applySettings());
    inputOn();
    T.evFrom = T.ms.events.length; T.evSeen = T.ms.events.length;
  },
  exit(reason){
    const T = RUN.T; RUN.T = null;
    if (T && T.offSet){ T.offSet(); T.offSet = null; }
    inputOff();
    document.body.classList.remove("drillview");
    // (ordinary life does not pause when the pointer goes: a pause this mode was in ends with it)
    FLAGS.lockLost = false;
    try { CAM.camDispose(); } catch(e){ console.error(e); }
    try { HUD.hudDispose(); } catch(e){ console.error(e); }
    try { ssgHide(); if (AURA.mesh){ AURA.mesh.visible = false; AURA.target = -1; AURA.alpha = 0; AURA.pick = -1; } } catch(e){ console.error(e); }
    if (T){
      // you stay where your agent was (P has mirrored it all along); the squad's bodies take their agents' places
      handBack(T);
      if (T.V) viewDispose(T.V);
      T.V = null;
      if (T.group && T.group.parent) T.group.parent.remove(T.group);
      if (!T.done){ T.done = true; T.quit = reason !== "done"; if (T.onEnd) T.onEnd(T); }
    }
  },
  // (an item stepped by a scheduler task of its own, T.fixed: the runner's; its view is posed once a frame in step)
  slice(h){ const T = RUN.T; if (T && !T.fixed) sliceItem(T, h); },
  step(dt, real){
    const T = RUN.T; if (!T) return;
    // (P10-B, spec 8 "nothing inactive running": under one of Training's own opaque sheets, the hub, the configuration or
    // the presets (quality.js overlayCovered: never the black fade, whose reveal waits on frames), nothing is drawn, so
    // the bodies are not posed and the HUD and the aura not worked out; the first frame after the sheet goes poses them)
    const hid = overlayCovered();
    if (T.fixed && T.V && !T.done && !hid) viewFrame(T.V, T.ms, SCHED.alpha(T.fixed), dt, RT.cam);
    frameItem(T, dt, real, hid);
  },
  input(ev){ return false; },
  flags:{clock:"own", movement:"own", targeting:false, tunnel:false, closing:false, homeTick:false, compass:false, saves:"defer", tp:false,
    hud:"life", pauseOnUnlock:true, leaveOnZone:true}
});

// the squad's bodies where their agents are now, seen again
function handBack(T){
  for (const [id, b] of T.bodies){
    const a = T.ms.agents[id], g = b.h.g;
    const w = worldOf(T, a.m.x, a.m.z);
    g.position.set(w.x, 0, w.z); g.rotation.y = a.m.yaw + Math.PI; g.visible = true;
    b.h.ast = {mode:"idle"};
  }
}

/* the fixed steps (in the world's sub-steps, before the bodies are posed, so they are drawn at the step shown: the
   view takes its positions after the last step of the frame) */
function sliceItem(T, h){
  // the feel of a strike (A1.7, control.js FEEL): the same fixed steps, fewer of them a real second, never a pause
  T.acc += h*(T.slow ? T.slow.scale : 1);
  let n = 0;
  while (T.acc >= H - 1e-9 && n < TRAIN.MAX_STEPS){
    fixedItem(T);
    T.acc -= H; n++;
  }
  if (T.acc >= H) T.acc %= H;
  if (T.V && !T.done) viewFrame(T.V, T.ms, clamp(T.acc/H, 0, 1), h, RT.cam);
}
/* the runner's one scheduler task (SCHED.fixed at 60 Hz, perf-8) calls this once per 1/60 s it owes: the same fixed
   steps as sliceItem, fewer of them a real second in the feel's slow motion, none while the pointer is let go (the
   mode pauses on it) */
export function fixedRun(T, h){
  if (FLAGS.lockLost || T.done) return;
  T.acc += h*(T.slow ? T.slow.scale : 1);
  let n = 0;
  while (T.acc >= H - 1e-9 && n < TRAIN.MAX_STEPS){ fixedItem(T); T.acc -= H; n++; }
  if (T.acc >= H) T.acc %= H;
}
function fixedItem(T){
  const ms = T.ms;
  if (VW.viewPreStep && T.V) VW.viewPreStep(T.V, ms);
  feedStep(T);
  if (T.script && T.script.pre) T.script.pre(T);
  controlStep(ms, T.me, H, {traits:T.traits, live:true});
  simStep(ms, H);
  // a small-sided game: a goal is followed by a quick kick-off from the side that conceded (UF2-B U16)
  if (TS.isSSG(T.item)) ssgStep(T);
  // a drill has no restarts: whatever stopped play (a ball out, a goal) is the end of a go; the next one is a new ball
  // (a small-sided game's kick-off after a goal is the one restart kept: ssgStep)
  if (!T.item.restarts && !T.item.kickoff && (ms.restart || ms.phase !== "live") && !koPending(T)){
    ms.restart = null; ms.phase = "live";
    for (const a of ms.agents){ a.set = null; a.wall = false; }
  }
  if (T.script && T.script.post) T.script.post(T);
  T.t += H; T.tRep += H;
}
/* the small-sided game's restart after a goal (UF2-B U16, ssgplay.js): the quick kick-off from the side that
   conceded, with a fresh ball out of the coach's bag on the centre spot (takeBall); T.ko and T.koLog are its record */
const koPending = T => SP.koPending(T.ms, T);
function ssgStep(T){
  const scored = SP.ssgGoalStep(T.ms, T, (x, z) => takeBall(T, x, z, true));
  if (scored >= 0 && T.board) ssgGoal(scored);
}

// the HUD's frame (fphud.js hudFrame): what it shows of you and the item; screen points from the item's frame
const _pv = new THREE.Vector3(), PJ = {x:0, y:0, on:false, front:false}, OFF = {pip:null, x:null};
const HS = {ms:null, me:null, ctrl:CTRL, dt:0, B:100, cap:100, energy:100, hints:null, proj:null, w:0, h:0, yaw:0, cam:{x:0, z:0}, offPip:null,
  cards:0, glyph:"", ringAt:.2, offX:null};
function hudOf(T, dt){
  const ms = T.ms, me = T.me, cv = RT.renderer && RT.renderer.domElement;
  HS.ms = ms; HS.me = me; HS.dt = dt; HS.w = cv ? cv.clientWidth : innerWidth; HS.h = cv ? cv.clientHeight : innerHeight;
  HS.yaw = P.yaw; HS.cam.x = RT.cam.position.x - T.F.cx; HS.cam.z = RT.cam.position.z - T.F.cz;
  HS.B = me.st.B; HS.cap = me.st.cap; HS.energy = me.energy;
  HS.ringAt = CT.RING_T != null ? CT.RING_T : .2;
  HS.proj = HS.proj || ((x, y, z) => {
    const cam = RT.cam, F = RUN.T ? RUN.T.F : {cx:0, cz:0};
    _pv.set(x + F.cx, y, z + F.cz).project(cam);
    // (one record, filled in place: the HUD uses each point before it asks for the next)
    PJ.x = (_pv.x + 1)/2*HS.w; PJ.y = (1 - _pv.y)/2*HS.h; PJ.on = _pv.z < 1 && Math.abs(_pv.x) <= 1 && Math.abs(_pv.y) <= 1; PJ.front = _pv.z < 1;
    return PJ;
  });
  if ((T.hintT = (T.hintT || 0) - dt) <= 0){
    T.hintT = .1; HS.hints = CT.hintsFor ? CT.hintsFor(ms, me) : null;
    // the offside pip (1.5.10: Auto shows it in training) and the line for the overview, where offside is in play
    CT.offsideHud(ms, me, CT.SET.offsidePip !== "off", OFF); HS.offPip = OFF.pip; HS.offX = OFF.x;
  }
  HUD.hudFrame(ms, me, CTRL, dt, HS);
}

// once a frame: you where your agent is (for the camera, your body, everyone round you), the HUD, the clock
function frameItem(T, dt, real, hid = false){
  // (the same point between the last two steps the view draws the bodies at: the runner's own scheduler task when it
  // steps the item, T.fixed, whose steps leave T.acc at nothing. With T.acc the eye stayed on the last step while your
  // body was drawn up to a step on from it, and in third person your body shook against the camera as you moved)
  const ms = T.ms, a = T.me, al = T.fixed ? SCHED.alpha(T.fixed) : clamp(T.acc/H, 0, 1);
  const x = a.x0 + (a.m.x - a.x0)*al, z = a.z0 + (a.m.z - a.z0)*al;
  const w = worldOf(T, x, z);
  P.x = w.x; P.z = w.z; P.feet = a.y || 0; P.eye = P.feet + (1.68*(a.scale || 1));
  P.vx = a.m.vx; P.vz = a.m.vz; P.speed = a.m.speed; P.sprint = a.m.gait === "sprint" ? 1 : 0;
  P.moveMode = a.m.speed < .3 ? "idle" : a.m.gait === "sprint" ? "sprint" : a.m.speed > 4 ? "run" : a.m.speed > 2 ? "jog" : "walk";
  FLAGS.moving = a.m.speed > .5;
  // your life bodies stay out of it (the view's first-person body is you here); they come back with your eyes
  if (ME.fp) ME.fp.g.visible = false;
  if (ME.tp) ME.tp.g.visible = false;
  if (!hid){
    try { hudOf(T, dt); } catch(e){ console.error(e); }
    // the small-sided game's scoreboard (the score, the time left) and the aura on the team-mate you look at
    if (T.board) ssgFrame(ms.score, T.board.real != null ? T.board.real - T.t : null);
    try { auraFrame(real, RT.cam, ms, a, T.auraPos || (T.auraPos = (id, out) => auraPosOf(T, id, out))); } catch(e){ console.error(e); }
  }
  if (T.script && T.script.frame) T.script.frame(T, real);
  feelStep(T, real);
  if (T.rate > 0) T.host.pass(real*T.rate);
  // the distance you sprint (pace and stamina XP: one a 60 m)
  if (a.m.gait === "sprint" && a.m.speed > (a.prm.run || 6)) T.sprintD += a.m.speed*real;
  if (AUD && AUD.listener && RT.cam) AUD.listener(RT.cam.position, P.yaw);
  events(T);
}
// the world's time-scale as the match has it (controller.js bigChance and contactFeel): a shot wound up from a big
// chance eases it to FEEL.BIG_SCALE, a clean contact of yours holds it for a blink; each runs out in real time
function feelStep(T, real){
  if (T.slow && (T.slow.t -= real) <= 0) T.slow = null;
  const ms = T.ms, me = T.me;
  if (!CT.windingShot(ms, me) || (T.slow && !T.slow.big)) return;
  if (xgAt(ms, me.team, ms.ball.p.x, ms.ball.p.z) < CT.FEEL.BIG_XG) return;
  T.slow = {scale: CT.FEEL.BIG_SCALE, t: CT.FEEL.BIG_OUT, big: true};
}
// what happened since the last frame, for the ears, the eyes and the HUD
function events(T){
  const ms = T.ms, me = T.me.id;
  for (let i = T.evSeen || 0; i < ms.events.length; i++){
    const e = ms.events[i];
    // ((P9-A, GK-3) the view hears the saves and goals as the career match's does, controller.js events: a dive's outcome
    // (the catch, the tip, the parry) and a punch are posed from them. Training never handed them on, so a keeper's
    // dive showed no outcome and a punch the ready stance)
    if ((e.kind === "save" || e.kind === "goal") && T.V && VW.viewEvent) VW.viewEvent(T.V, e);
    if (e.kind === "call"){
      const o = ms.agents[e.agent];
      // a team-mate calling for it: his voice from where he stands, his name on the HUD
      if (o && o.team === T.myTeam && o.id !== me && (e.to == null || e.to === me)){
        if (HUD.hudCall) HUD.hudCall(o.id, o.name);
        if (AUD && AUD.call) AUD.call(o.name ? o.name.split(" ").pop() : "", worldPt(T, {x:o.m.x, y:1.6, z:o.m.z}), o.pid | 0);
      }
    } else if (e.kind === "kick"){
      const sp = +e.speed || 0;
      // (your own: a clean strike rings out, a scuff is dull, as in a match)
      const qk = e.agent === me && e.strike != null ? (e.scuff ? .5 : .75 + .45*e.strike) : 1;
      if (AUD && AUD.cue) AUD.cue("kick", worldPt(T, {x:e.x, y:.2, z:e.z}), clamp((.3 + sp/30)*qk, .15, 1.3));
      if (e.agent === me){ const hs = CT.hitStopOf(e); if (hs) T.slow = {scale: hs[1], t: hs[2]}; }
      if (e.agent === me && !e.whiff){
        const shot = e.intent === "shot" || e.intent === "header" && e.atGoal;
        if (CAM.camAction) CAM.camAction(e.intent === "header" ? "header" : shot || sp > 18 ? "strike" : "pass");
        if (shot && CAM.camTrauma) CAM.camTrauma(.18);
      }
    } else if (e.kind === "tackle" && (e.agent === me || e.on === me)){ if (CAM.camTrauma) CAM.camTrauma(e.result === "foul" ? .3 : .2); }
    else if (e.kind === "goal" && !e.disallowed && (T.item.score || T.board)){
      if (HUD.hudNotice){
        // (a small-sided game: whose goal, the score as it stands, and who kicks off; UF2-B U13, U16)
        const sc = T.ms.score, us = sc[T.myTeam] | 0, them = sc[1 - T.myTeam] | 0, mine = e.team === T.myTeam;
        // (an own goal: the scorer is the man who put it in his own net, so it is never "your goal" when it went in yours)
        const who = e.ownGoal ? (mine ? "Goal!" : "Own goal") : e.scorer === me ? "Your goal!" : mine ? "Goal!" : "They score";
        HUD.hudNotice("goal", T.board ? who : mine ? "Goal" : "They score", T.board ? `${us}-${them} · ${mine ? "their" : "your"} kick-off` : "");
      }
      if (e.scorer === me && CAM.camTrauma) CAM.camTrauma(.12);
    }
  }
  T.evSeen = ms.events.length;
}

/* ---------- leaving ----------
   P4-B (INF-10, BUILD-PLAN P4-B work item 3): a run whose host has a pause callback (Training Mode's runner: the pause
   card, js/life/train/quick.js, handed in through the host so this file never imports a Training module) is paused by
   Esc and by losing the pointer, not ended. A host without one (the career's drills, the session, the lessons) keeps
   what it always did: Esc ends the drill or the session, losing the pointer ends it too, and the lessons pause */
function hostPause(T){
  const h = T && T.host;
  if (!h || typeof h.pause !== "function") return false;
  try { return h.pause(T) !== false; } catch(e){ console.error(e); return false; }
}
function pauseOrQuit(){
  if (RUN.T && hostPause(RUN.T)) return;
  quit();
}
function quit(){
  // (an item of Training Mode's runner: its own way out)
  if (RUN.T && RUN.T.onQuit) return RUN.T.onQuit();
  const r = RUN.cur;
  if (r && r.quit) r.quit();
  else if (mode() === "train") exitMode("quit");
}

/* ---------- the go's verdicts (trainspec.js tests on the simulation's own events) ---------- */
function evsOf(T){ return T.ms.events.slice(T.evFrom); }
export function ballDead(T){
  const b = T.ms.ball, sp = Math.hypot(b.v.x, b.v.y, b.v.z), out = Math.abs(b.p.x) > T.spec.hx + R || Math.abs(b.p.z) > T.spec.hz + R;
  // (a ball the coach plays in from outside the lines is in play once it has come in)
  if (!out && b.state === "free") T.inPlay = true;
  T.stillT = sp < .15 && b.p.y < R + .02 ? (T.stillT || 0) + H : 0;
  return T.stillT > TRAIN.STILL || (T.inPlay && out && Math.abs(b.p.x) + Math.abs(b.p.z) > 0 && (Math.abs(b.p.x) > T.spec.hx + 1.5 || Math.abs(b.p.z) > T.spec.hz + 1.5));
}
function award(T, lines, q){
  for (const [k, amt] of TS.xpFor(lines, q)){ T.xp[k] = (T.xp[k] || 0) + amt; T.xpRaw += amt; }
}
// the XP of an item, given at its end (scaled into a band for the session): {skill: amount}
function payXP(T, scale = 1){
  let total = 0;
  for (const [k, amt] of Object.entries(T.xp)){ const v = amt*scale; if (v > .05){ total += T.host.xp(k, v); } }
  return total;
}

/* ---------- the walk over ----------
   Between the items of a run you are in ordinary life: you walk over yourself (the cones are out for the next one),
   the squad jog to where it wants them, and it starts once you are in its ground and they are in place (or have had
   long enough). run = {item, spots: [{b, x, z}], check?(run) -> false to stop waiting (the run is over), play(run)} */
function gather(run, item, play){
  run.item = item; run.spots = spotsFor(item, run.lent || [], run.host); run.state = "walk"; run.waitT = 0; run.play = play;
  conesFor(item.area ? item : null);
  run.task = run.task || SCHED.task({id:"train-run", run:dt => gatherTick(run, dt)});
}
function gatherTick(run, dt){
  if (run.state !== "walk" || run.stopped) return;
  const it = run.item;
  let all = true;
  for (const s of run.spots) if (!walkBody(s.b.h, s.x, s.z, dt, TRAIN.JOG, s.face)) all = false;
  run.waitT += dt;
  if (run.check && run.check(run) === false) return;
  if (mode() !== "life" || FLAGS.busy || FLAGS.modal) return;
  if (!inGround(it, P.x, P.z, it.area ? TRAIN.GATHER_R : 0)) return;
  if (!all && run.waitT < 12) return;
  run.state = "play";
  run.play(run);
}
// how far from you (m) a slot spread over the ground is kept: never where you are standing
const SLOT_CLEAR = 4;
// where the squad stands for an item: given spots (mateAt, oppAt), else the slots spread over its ground; the keeper
// on his goal line, in the goal you attack
function spotsFor(item, lent, host){
  const out = [];
  const keeper = lent.find(b => b.role === "keeper"), field = lent.filter(b => b.role !== "keeper");
  const nm = item.mates || 0, no = item.opps || 0;
  let mine = null; try { mine = host && host.me ? host.me().slot : null; } catch(e){ mine = null; }
  const mSlots = mateSlots(item, mine, !!(keeper && item.keeper));
  field.slice(0, nm + no).forEach((b, i) => {
    const mate = i < nm, j = mate ? i : i - nm;
    const given = mate ? item.mateAt && item.mateAt[j] : item.oppAt && item.oppAt[j];
    const slot = mate ? (item.mateSlots || [])[j] && mSlots[j] : (item.oppSlots || [])[j];
    let sp = given || TS.slotSpot(TS.SLOT_POS[slot] || {x:50, y:50}, item.area, item.dir, mate ? 0 : 1);
    // the callers of the third lesson come round behind and beside you
    if (item.kind === "call" && item.start){ const s = item.start; sp = j === 0 ? {x:s.x - 7, z:s.z + 4} : {x:s.x - 2, z:s.z - 9}; }
    const w = TS.toWorld(sp.x, sp.z);
    // a slot that falls where you stand is moved off you (a team-mate jogging to it would end up in your face and nudge
    // you back), out along the line from you to it; the spots a drill gives are its own
    if (!given){ const dx = w.x - P.x, dz = w.z - P.z, d = Math.hypot(dx, dz); if (d < SLOT_CLEAR){ const k = d > .05 ? SLOT_CLEAR/d : 0; w.x = P.x + (k ? dx*k : 0); w.z = P.z + (k ? dz*k : SLOT_CLEAR); } }
    out.push({b, x:w.x, z:w.z, mate});
  });
  if (keeper && item.keeper){ const w = TS.toWorld(item.dir*(TP.L/2 - 1.2), 0); out.push({b:keeper, x:w.x, z:w.z, keeper:true, face:item.dir > 0 ? -Math.PI/2 : Math.PI/2}); }
  return out;
}
const whoOf = spots => ({mates:spots.filter(s => s.mate).map(s => s.b), opps:spots.filter(s => !s.mate && !s.keeper).map(s => s.b),
  keeper:(spots.find(s => s.keeper) || {}).b || null});
/* the squad lends n of its people (and the keeper): they come back to it when the run is over, and before they go
   home at the session's end whatever is running gives them back first (teamSession.beforeLeave) */
function lend(run, n, keeper){
  const sess = GROUND.session;
  if (!sess || !sess.borrow) return [];
  const list = sess.borrow(n, {keeper});
  if (sess.beforeLeave && !run.leaveHook){
    run.leaveHook = () => {
      run.stopped = true;
      if (run.T && mode() === "train") exitMode("quit");
      if (RUN.cur === run){ runOver(run); if (run.res) run.res(false); }
    };
    sess.beforeLeave.push(run.leaveHook);
  }
  return list;
}
function runOver(run){
  if (run.task){ SCHED.remove(run.task); run.task = null; }
  const sess = GROUND.session;
  if (run.leaveHook && sess && sess.beforeLeave){ const i = sess.beforeLeave.indexOf(run.leaveHook); if (i >= 0) sess.beforeLeave.splice(i, 1); }
  if (GROUND.session && GROUND.session.release) GROUND.session.release(run.lent || []);
  coachGive(); conesFor(null); markAt(null); hudClose(); targetsUp(run.item, false);
  if (RUN.cur === run) RUN.cur = null;
}

/* =============================== the drills (3.6.2) =============================== */
/* A drill is reps goes: the coach plays a ball in (to you, or to whoever starts with it), the go is decided by the
   drill's test, the card says how it went, and the next ball comes. 30 minutes of the clock in all, given out go by
   go. The ones with team-mates or opponents need the squad out on the pitch (the session's hours). */
const DRILL_TEST = {shoot:"shot", head:"header", volley:"volley", pass:"pass", intercept:"intercept", duel:"duel", setpiece:"shot"};
// the corner targets in the goal a drill shoots at (ground.js goalTargets), up while it runs (A1.7)
function targetsUp(item, on){
  const m = item && item.targets && GROUND.targets ? GROUND.targets[item.dir] : null;
  if (m) m.visible = !!on;
}
export function startDrill(kind, host){
  const D = TS.DRILLS[kind]; if (!D || RUN.cur) return false;
  const sess = GROUND.session, needSquad = D.mates + D.opps;
  const squadHere = !!(sess && sess.borrow && host.sessionOn());
  if (needSquad && !squadHere){ host.note(`This one needs team-mates. The squad's out on the pitch from ${host.sessionStartText()}.`); return false; }
  if (!GROUND.assist){ host.note("There's no coach about to feed you the balls."); return false; }
  const run = {kind:"drill", lent:[], scores:[], xp:0, host};
  const lent = squadHere ? lend(run, needSquad, !!D.keeper) : [];
  run.lent = lent;
  if (lent.filter(b => b.role !== "keeper").length < needSquad){ runOver(run); host.note("Not enough of the lads are free for that one right now."); return false; }
  const item = Object.assign({}, D, {restarts:kind === "setpiece", keeper:!!D.keeper && lent.some(b => b.role === "keeper")});
  run.item = item; run.pts = 0;
  RUN.cur = run;
  targetsUp(item, true);
  run.quit = () => { run.stopped = true; if (run.T && mode() === "train") exitMode("quit"); else { runOver(run); host.note("Drill called off."); } };
  hudSet({title:D.label, rep:0, reps:D.reps, scores:[]}, {hint:D.sub});
  if (D.feed.from) coachPrep(D.feed.from, D.spot);
  gather(run, item, r => {
    const T = buildItem(item, whoOf(r.spots), {n:0, host, ballAt:D.feed.at || D.feed.from, onEnd:t => drillEnd(run, t)});
    T.rate = 0; T.kits = kitsOf(host, T.myTeam);
    T.script = drillScript(kind, D, run);
    run.T = T;
    enterMode("train", T);
  });
  return true;
}
function drillScript(kind, D, run){
  const test = DRILL_TEST[kind], to = D.feed.to;
  const S = {state:"setup", wait:.6, rep:0, kicks:new Map(), seen:0};
  // (a drill scored on the corner targets keeps its points in the title)
  const title = () => D.targets ? `${D.title} · ${run.pts} point${run.pts === 1 ? "" : "s"}` : D.label;
  const card = hint => hudSet({title:title(), rep:S.rep, reps:D.reps, scores:run.scores}, hint != null ? {hint} : {});
  const nextGo = T => {
    T.evFrom = T.ms.events.length; T.tRep = 0; T.stillT = 0; T.inPlay = false; S.state = "go"; T.goalAt = null;
    const me = T.me;
    if (to === "spot"){
      // a free kick: a ball on the spot, the wall and the keeper set by the restart's own rules, the kick yours
      const sp = toArea(T, D.feed.at);
      takeBall(T, sp.x, sp.z, true);
      startRestart(T.ms, "free", T.myTeam, {x:sp.x, z:sp.z});
      if (T.ms.restart) T.ms.restart.taker = me.id;
      card("Over the wall or round it. Left button to shoot. Scroll the mouse wheel to pick the kick type shown in the corner, or press 1, 2 or 3 for Driven, Normal or Chip.");
      return;
    }
    let tgt;
    if (to === "opp"){
      const o = T.ms.agents.find(q => q.team === T.oppTeam && q.onPitch && q.role === "player" && !q.isGK);
      tgt = o ? {x:o.m.x, z:o.m.z} : {x:me.m.x, z:me.m.z};
    } else if (to === "head"){
      const f = {x:-Math.sin(me.m.yaw), z:-Math.cos(me.m.yaw)};
      tgt = {x:me.m.x + f.x*.5, y:1.95*(me.scale || 1), z:me.m.z + f.z*.5};
    } else if (to === "volley"){
      // dropping in front of you, between you and the goal, at the height of a volley (about the knee to the hip)
      const gx = T.ms.dirs[T.myTeam]*T.spec.hx, dx = gx - me.m.x, dz = -me.m.z, dl = Math.hypot(dx, dz) || 1;
      tgt = {x:me.m.x + dx/dl*.8, y:.75*(me.scale || 1), z:me.m.z + dz/dl*.8};
    } else tgt = {x:me.m.x + me.m.vx*.6, z:me.m.z + me.m.vz*.6};
    coachFeed(T, D.feed.kind === "cross" || D.feed.kind === "loft" ? D.feed.kind : "pass", toArea(T, D.feed.from), tgt, to !== "opp");
    card(to === "volley" ? "Watch it drop. Hold the left button and let go as the ring closes." : D.sub);
  };
  // each kick of yours as it leaves the boot: where its flight crosses the goal line you attack (the corner a save
  // kept out) and whether the ball was still in the air (no bounce since the coach played it)
  const noteKicks = T => {
    const ms = T.ms, end = ms.dirs[T.myTeam];
    for (let i = Math.max(S.seen, T.evFrom); i < ms.events.length; i++){
      const e = ms.events[i];
      if (e.kind !== "kick" || e.agent !== T.me.id || e.whiff) continue;
      S.kicks.set(e.id, {cross:TS.crossAt(ms.pred, ms.predN, end, T.spec.hx, R), air:T.fedBounces == null || T.bounces === T.fedBounces});
    }
    S.seen = ms.events.length;
  };
  // the first ball waits for the keeper (a drill at a goal): he jogs over from wherever the squad had him, and the coach
  // plays it once he is in his goal (within 3 m of the middle of its line), or after ten seconds whatever
  const keeperSet = T => {
    if (S.rep || !D.keeper) return true;
    S.kWait = (S.kWait || 0) + H;
    const ms = T.ms, end = ms.dirs[T.myTeam], k = ms.agents.find(a => a.isGK && a.team === T.oppTeam && a.onPitch);
    return !k || S.kWait > 10 || Math.hypot(k.m.x - end*T.spec.hx, k.m.z) < 3;
  };
  const lastKick = (evs, id) => { for (let i = evs.length - 1; i >= 0; i--){ const e = evs[i]; if (e.kind === "kick" && e.agent === id && !e.whiff) return e; } return null; };
  return {
    post(T){
      if (D.orders === "pass") passersOnly(T);
      if (S.state === "setup"){ if ((S.wait -= H) <= 0 && keeperSet(T)) nextGo(T); return; }
      if (S.state === "result"){ if ((S.wait -= H) <= 0){ if (S.rep >= D.reps) finishItem(T); else nextGo(T); } return; }
      if (S.state !== "go" || T.feed) return;
      noteKicks(T);
      const evs = evsOf(T), ctx = {timeUp:T.tRep > TRAIN.REP_LIMIT + (to === "spot" ? 8 : 0), dead:ballDead(T), passes:3};
      let v = null, sc = null;
      if (test === "shot"){
        v = TS.shotTest(evs, T.me.id, ctx);
        // the corner targets (A1.7): a goal by where it crossed the line, a save by where its flight was going
        if (v && D.targets){
          const end = T.ms.dirs[T.myTeam], k = v.kick ? S.kicks.get(v.kick.id) : null;
          const at = v.why === "goal" ? T.goalAt : v.why === "saved" && k ? k.cross : null;
          sc = TS.targetScore(v, at ? TS.cornerOf(at.y, at.z, end) : null);
          v.q = sc.q; v.pts = sc.pts; v.corner = sc.corner; run.pts += sc.pts;
          const fl = at || (k && k.cross); v.at = fl ? {y:Math.round(fl.y*100)/100, z:Math.round(fl.z*100)/100} : null;
        }
      }
      else if (test === "volley"){
        const lk = lastKick(evs, T.me.id), k = lk ? S.kicks.get(lk.id) : null;
        v = TS.volleyTest(evs, T.me.id, Object.assign(ctx, {air:k ? k.air : true}));
      }
      else if (test === "header") v = TS.headerTest(evs, T.me.id, ctx);
      else if (test === "pass") v = TS.passTest(evs, T.me.id, ctx);
      else if (test === "intercept") v = TS.interceptTest(evs, T.me.id, T.myTeam, ctx);
      else if (test === "duel") v = TS.duelTest(evs, T.me.id, T.myTeam, ctx);
      if (!v) return;
      S.rep++; run.scores.push(v.ok ? Math.max(.45, v.q) : v.q*.4);
      award(T, D.xp, v.ok ? v.q : 0);
      T.results.push(v);
      const sub = sc ? (sc.pts ? `+${sc.pts} point${sc.pts === 1 ? "" : "s"}` : "") : test === "volley" && v.kick && v.ok ? `Strike quality ${Math.round(v.clean*100)}%` : "";
      hudResult(sc && sc.line ? sc.line : v.ok ? (v.q >= .9 ? "Perfect" : v.q >= .7 ? "Great" : "Good") : ((test === "header" || test === "volley") && v.why === "none" ? WHY.missed : WHY[v.why]) || "Not this time", sub, v.ok);
      card();
      run.host.pass(D.mins/D.reps);
      S.state = "result"; S.wait = TRAIN.RESULT;
    }
  };
}
/* the drill's orders to the two passers (reading the lane): they play it to each other and nothing else. Whatever the
   one on the ball was going to do with it (a shot, a run with it) becomes a pass to the other, led into his stride, and
   he does not keep it longer than a second and a half. The pass is his own kick (actions.js), struck at his contact */
function passersOnly(T){
  const ms = T.ms, c = ms.agents[ms.poss.ctl];
  const mates = a => ms.agents.find(o => o !== a && o.team === a.team && o.onPitch && o.role === "player" && !o.isGK);
  const lead = (o, from) => { const d = Math.hypot(o.m.x - from.m.x, o.m.z - from.m.z); return {x:o.m.x + o.m.vx*d/14, y:R, z:o.m.z + o.m.vz*d/14}; };
  for (const a of ms.agents){
    if (a.team !== T.oppTeam || !a.act || a.act.kind !== "kick" || a.act.done || a.act.contactStep >= 0) continue;
    const k = a.act.action;
    if (k.kind === "pass" && k.recv >= 0) continue;
    const o = mates(a); if (!o) continue;
    a.act.action = {kind:"pass", target:lead(o, a), recv:o.id, contact:0};
  }
  if (c && c.team === T.oppTeam){
    if (T.holdBy !== c.id){ T.holdBy = c.id; T.holdT = 0; }
    T.holdT += H;
    const o = mates(c);
    if (o && !c.act && T.holdT > 1.5) startKick(ms, c, {kind:"pass", target:lead(o, c), recv:o.id, contact:0});
  } else T.holdBy = -1;
}
const WHY = {wide:"Wide", blocked:"Blocked", wood:"Off the woodwork", none:"No shot", time:"Out of time", missed:"Missed it", lost:"Didn't find him",
  out:"Out of play", int:"Cut out", off:"Offside", through:"They got it through", beaten:"He got past you", heavy:"Heavy touch", still:"Didn't take it forward",
  other:"Not to the man who called", saved:"Saved", bounced:"It bounced first"};
function drillEnd(run, T){
  const D = TS.DRILLS[run.item.kind], done = T.results.length, avg = run.scores.length ? run.scores.reduce((a, b) => a + b, 0)/run.scores.length : 0;
  const xp = payXP(T);
  if (done){ run.host.exert(6*done/D.reps, 5*done/D.reps); run.host.trainMin(D.mins*done/D.reps); }
  runOver(run);
  RUN.last = {kind:"drill", drill:D.kind, done, scores:run.scores.slice(), xp, pts:D.targets ? run.pts : null,
    results:T.results.map(v => ({ok:v.ok, why:v.why, q:v.q, pts:v.pts, corner:v.corner, at:v.at, aim:v.kick ? {y:v.kick.ty, z:v.kick.tz} : null, air:v.air, clean:v.clean}))};
  const ptsLine = D.targets ? `${run.pts} point${run.pts === 1 ? "" : "s"} · ` : "";
  if (T.quit) run.host.note(done ? `Stopped after ${done} of ${D.reps}${D.targets ? ` with ${run.pts} point${run.pts === 1 ? "" : "s"}` : ""}. You keep the ${Math.round(xp)} XP.` : "Drill called off.");
  else run.host.center(`${D.label} complete`, `${ptsLine}${Math.round(avg*100)}% · +${Math.round(xp)} XP`);
  run.host.persist();
}
// an item done by its own end (not left with Esc)
function finishItem(T){
  if (T.done) return;
  T.done = true;
  if (mode() === "train") exitMode("done");
  if (T.onEnd) T.onEnd(T);
}

/* =============================== the team session (3.6.2) =============================== */
/* Once a day, 90 minutes in four blocks: a rondo, pattern play, a small-sided game, finishing. You walk from block to
   block (the coach says what is next; the cones are out for it), the squad jogs over too, and each block starts once
   you are in its ground. Esc steps out and keeps the blocks you finished; joining again carries on from the next. Its
   XP comes from what you did (trainspec.js involvements), brought into 60 to 90 for the whole session; its rewards
   come once, with the last block. */
export function startSession(host, o = {}){
  if (RUN.cur) return false;
  const ss = host.attSess();
  const left = host.sessionEnd() - host.minute();
  // (o.from: the block to start at, for the tests that play one block: the small-sided game's, say)
  const todo = TS.blocksToRun(o && o.from != null ? o.from : ss ? ss.blocks : 0, left);
  if (!todo.length){ host.note(`The session's nearly over. Join them tomorrow at ${host.sessionStartText()}.`); return false; }
  const run = {kind:"session", blocks:todo, i:0, lent:[], qs:[], xpRaw:0, xp:0, host};
  RUN.cur = run;
  run.quit = () => { run.stopped = true; if (run.T && mode() === "train") exitMode("quit"); else sessionEnd(run); };
  // the session's own time runs out (SESSION.end): what is left is not played
  run.check = r => { if (!run.host.sessionOn() || run.host.sessionEnd() - run.host.minute() < TS.BLOCKS[r.blocks[r.i]].mins - 1e-6){ sessionEnd(r); return false; } return true; };
  // the squad comes over: as many as the biggest block needs, and the keeper
  const need = Math.max(...todo.map(i => TS.BLOCKS[i].mates + TS.BLOCKS[i].opps));
  run.lent = lend(run, need, true);
  nextBlock(run);
  return true;
}
function nextBlock(run){
  if (run.stopped) return;
  if (run.i >= run.blocks.length){ sessionEnd(run); return; }
  const B = TS.BLOCKS[run.blocks[run.i]];
  run.B = B; run.T = null;
  run.host.say("Coach", B.coach);
  hudSet({title:"Team session", rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:`${B.line} · over to the cones`});
  // the first ball: the coach plays it in from the corner of the block's ground nearest the touchline; he heads there
  // while everyone comes over
  const c = areaC(B.area), hx = B.area ? (B.area.x1 - B.area.x0)/2 : TP.L/2, hz = B.area ? (B.area.z1 - B.area.z0)/2 : TP.Wd/2;
  const ballAt = {x:c.x - Math.min(9, hx + 1), z:c.z + Math.min(7, hz + 1)};
  coachPrep(ballAt, c);
  gather(run, Object.assign({}, B, {restarts:false}), r => {
    const item = r.item;
    const T = buildItem(item, whoOf(r.spots), {n:run.i, host:run.host, ballAt, onEnd:t => blockEnd(run, t)});
    T.kits = kitsOf(run.host, T.myTeam);
    T.rate = B.mins/B.real;
    T.script = blockScript(B, run);
    run.T = T;
    hudSet({title:B.title, rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:B.line});
    enterMode("train", T);
  });
}

/* a small-sided game's ball gone dead for good (out of play, or stopped dead with nobody on it), with no kick-off after
   a goal waiting: the coach plays a new one in (UF2-B U16: never while the kick-off is set up, and quickly) */
const ssgDead = (T, wait = 2) => !koPending(T) && T.ms.phase === "live" && T.ms.ball.state === "dead" && ballDead(T) && T.tRep > wait;
/* where the coach plays a new ball in from in a small-sided game: the nearest point of the touchline to where he stands
   now (a step or two for him: he follows the play along the line), not a walk round to a set spot; a long way to you
   is a ball in the air */
function ssgFeedFrom(T){
  const h = COACH.h, me = T.me;
  if (!h || !h.g) return {x:clamp(me.m.x - 9, -T.spec.hx + 2, T.spec.hx - 2), z:clamp(me.m.z + 7, -T.spec.hz - 1, T.spec.hz + 1)};
  const p = localOf(T, h.g.position.x, h.g.position.z), sz = p.z >= 0 ? 1 : -1;
  return {x:clamp(p.x, -T.spec.hx + 3, T.spec.hx - 3), z:sz*(T.spec.hz + 1.2)};
}
function ssgFeed(T){
  const me = T.me, from = ssgFeedFrom(T), d = Math.hypot(me.m.x - from.x, me.m.z - from.z);
  T.tRep = 0; T.inPlay = false; T.stillT = 0;
  coachFeed(T, d > 30 ? "cross" : "pass", from, {x:me.m.x, z:me.m.z}, true);
}
// how a small-sided game ended, on the result card (UF2-B U13): won, drawn or lost, and the score
function ssgOver(T){
  const sc = T.ms.score, r = TS.ssgResult(sc[T.myTeam], sc[1 - T.myTeam]);
  hudResult(r.line, r.sub, !(sc[T.myTeam] < sc[1 - T.myTeam]));
  T.ssgEnd = {score:[sc[T.myTeam] | 0, sc[1 - T.myTeam] | 0], line:r.line};
}

function blockScript(B, run){
  const S = {fed:false};
  const ssg = TS.isSSG(B);
  return {
    post(T){
      // the coach plays the first ball in to you, and a fresh one whenever the last has gone dead for good
      if (!T.feed && ssg && S.fed && ssgDead(T)) ssgFeed(T);
      else if (!T.feed && (!S.fed || !ssg && T.ms.ball.state === "dead" && ballDead(T) && T.tRep > 4)){
        const me = T.me, edge = !S.fed && T.opts.ballAt ? toArea(T, T.opts.ballAt) : {x:clamp(me.m.x - 9, -T.spec.hx - 1, T.spec.hx + 1), z:clamp(me.m.z + 7, -T.spec.hz - 1, T.spec.hz + 1)};
        S.fed = true; T.tRep = 0; T.inPlay = false; T.stillT = 0;
        coachFeed(T, "pass", edge, {x:me.m.x, z:me.m.z}, true);
      }
      if (T.t >= B.real){ if (ssg) ssgOver(T); finishItem(T); }
    },
    frame(T){
      const left = Math.max(0, Math.ceil(B.real - T.t));
      if (left !== T.cardLeft){ T.cardLeft = left; hudSet({title:B.title, rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:`${B.line} · ${left} s`}); }
    }
  };
}
function blockEnd(run, T){
  // a block walked out of (Esc) is not kept: the blocks finished are, and a rejoin plays this one again
  if (T.quit || run.stopped){ run.host.blockDone(run.B.mins, 0); sessionEnd(run); return; }
  const inv = TS.involvements(evsOf(Object.assign({}, T, {evFrom:0})), T.me.id);
  for (const v of inv){ if (v.key) award(T, TS.ACTION_XP[v.key], v.q); run.qs.push(v.q); }
  // sprinting: pace and stamina, one a 60 m
  if (T.sprintD >= 60) award(T, TS.ACTION_XP.sprint.map(([k, b]) => [k, b*Math.floor(T.sprintD/60), 0]), 0);
  // the block's share of the session's 60 to 90 XP: what you earned, brought into its share of the band
  const share = B => B.mins/TS.SESSION_PLAN_MINS;
  const lo = TS.SESSION_XP.min*share(run.B), hi = TS.SESSION_XP.max*share(run.B);
  if (T.xpRaw < lo){
    // too little measured: being out there with the lads is worth the band's floor, on your position's skills
    const ks = run.host.me().sessionSkills || ["passing", "stamina"], each = (lo - T.xpRaw)/ks.length;
    for (const k of ks){ T.xp[k] = (T.xp[k] || 0) + each; } T.xpRaw = lo;
  }
  const scale = T.xpRaw > hi ? hi/T.xpRaw : 1;
  run.xpRaw += T.xpRaw*scale;
  run.xp = (run.xp || 0) + payXP(T, scale);
  run.host.blockDone(run.B.mins, 1);
  run.i++;
  nextBlock(run);
}
function sessionEnd(run){
  if (RUN.cur !== run) return;
  runOver(run);
  const score = TS.sessionScore(run.qs);
  const ss = run.host.attSess();
  const all = ss && ss.blocks >= TS.BLOCKS.length;
  if (all && !ss.done){
    const r = run.host.sessionDone(score);
    run.host.center("Session done", `+${Math.round(run.xp)} XP · Manager trust +${r.trust.toFixed(1)} · the lads saw you put the work in`);
  } else if (ss && ss.blocks){
    run.host.note(run.stopped ? `You stepped out of the session. You keep the ${Math.round(run.xp)} XP, and the next block is there when you come back.` : `That's all the time there was today. You keep the ${Math.round(run.xp)} XP.`);
  } else if (run.stopped) run.host.note("You stepped out before it got going.");
  RUN.last = {kind:"session", xpRaw:run.xpRaw, xp:run.xp, blocks:ss ? ss.blocks : 0, score};
  run.host.persist();
}

/* =============================== the first day's lessons (3.6.3) =============================== */
/* Six lessons on the same controls and the same code path as a match. Each ends on one success or three attempts,
   the coach says its line at the start. Their end is the day's session (its rewards once, the time the rest of it
   would have taken), GameplayTutorialCompleted, and the coach's last word. Resolves when they are over (false when
   they were cut short: the day ended, or you left the training centre). */
export function startFirstTraining(host, o = {}){
  if (RUN.cur) return Promise.resolve(false);
  return new Promise(res => {
    // (o.from: the lesson to start at, 0 to 5, for the tests that play one lesson: the small-sided game's, say)
    const from = Math.max(0, Math.min(TS.LESSONS.length - 1, (o && o.from) | 0));
    const run = {kind:"lessons", i:from, tries:0, ok:[], lent:[], qs:[], mins:0, res, xp:0, bag:{}, xpRaw:0, host};
    RUN.cur = run;
    // (the lessons are not left half-way with Esc: it lets the pointer go, which pauses them)
    run.quit = () => {};
    const need = Math.max(...TS.LESSONS.map(L => (L.mates || 0) + (L.opps || 0)));
    run.lent = run.host.sessionOn() ? lend(run, need, true) : [];
    nextLesson(run);
  });
}
function nextLesson(run){
  if (run.i >= TS.LESSONS.length){ lessonsEnd(run); return; }
  const L = TS.LESSONS[run.i];
  run.L = L; run.T = null;
  if (!run.tries){ run.host.say("Coach", L.line); run.host.onb("lesson", {n:L.n, kind:L.kind, start:true}); }
  hudSet({title:`Lesson ${L.n} · ${L.title}`, rep:run.tries, reps:TRAIN.TRIES, scores:run.ok}, {hint:L.line});
  gather(run, Object.assign({}, L, {restarts:false, kickoff:false, keeper:!!L.keeper && run.lent.some(b => b.role === "keeper")}), r => {
    const T = buildItem(r.item, whoOf(r.spots), {n:run.i*10 + run.tries, host:run.host, ballAt:L.feed ? L.feed.from : TS.toLocal(P.x - 10, P.z + 6), onEnd:t => lessonEnd(run, t)});
    T.kits = kitsOf(run.host, T.myTeam);
    T.rate = 6/60;                     // the day goes on: six minutes of the clock a real minute while you learn
    T.script = lessonScript(L, run);
    run.T = T;
    enterMode("train", T);
  });
}
function lessonScript(L, run){
  const S = {stage:"start", t:0, low:false, high:false, shots:0, fed:false, anchorT:-1};
  const card = (hint, n = run.tries) => hudSet({title:`Lesson ${L.n} · ${L.title}`, rep:n, reps:TRAIN.TRIES, scores:run.ok}, hint != null ? {hint} : {});
  const tryOver = (T, ok, why) => {
    T.lessonOk = ok; T.why = why;
    hudResult(ok ? "That's it" : (WHY[why] || "Again"), "", ok);
    S.stage = "done"; S.t = 0;
  };
  const feedMe = T => {
    const me = T.me, from = L.feed ? toArea(T, L.feed.from) : !S.fedOnce && T.opts.ballAt ? toArea(T, T.opts.ballAt) : {x:me.m.x - 10, z:me.m.z + 6};
    coachFeed(T, "pass", from, {x:me.m.x, z:me.m.z}, true); S.fed = true; S.fedOnce = true; T.evFrom = T.ms.events.length; T.tRep = 0; T.inPlay = false; T.stillT = 0;
  };
  return {
    post(T){
      const me = T.me, ms = T.ms;
      S.t += H;
      if (S.stage === "done"){ if (S.t > TRAIN.RESULT) finishItem(T); return; }
      switch (L.kind){
        case "move": {
          if (S.stage === "start"){
            const c = toArea(T, L.cone), w = worldOf(T, c.x, c.z); markAt(w); S.cone = c; S.st = {stage:"out"}; S.stage = "go";
            card("Jog to the cone. Hold Shift to sprint. The bar at the bottom is your breath.");
          }
          const d = Math.hypot(me.m.x - S.cone.x, me.m.z - S.cone.z), prev = S.st.stage;
          const stage = TS.moveStage(S.st, {d, B:me.st.B});
          if (stage !== prev){
            if (stage === "back") card("Now sprint back. Keep going until the bar drops under 70.");
            else if (stage === "walk") card("Walk now. Watch your breath come back.");
          }
          if (stage === "done"){ markAt(null); tryOver(T, true, ""); }
          else if (S.t > 75){ markAt(null); tryOver(T, false, "time"); }
          return;
        }
        case "receive": {
          if (!S.fed){ feedMe(T); card("Let it come across you. Hold W, A, S or D as it arrives to push it that way."); return; }
          if (T.feed) return;
          const evs = evsOf(T);
          const touch = evs.find(e => e.kind === "touch" && e.agent === me.id && e.how === "control");
          if (touch && !S.recv){ S.recv = {t:ms.t, push:{x:me.intent.dx, z:me.intent.dz}}; }
          let after = null;
          if (S.recv && ms.t - S.recv.t >= TRAIN.AFTER){
            const p = S.recv.push, pl = Math.hypot(p.x, p.z), bx = ms.ball.p.x - me.m.x, bz = ms.ball.p.z - me.m.z;
            after = pl > .1 ? {ahead:(bx*p.x + bz*p.z)/pl, lat:(-bx*p.z + bz*p.x)/pl, dist:Math.hypot(bx, bz), pushed:true} : {ahead:0, lat:0, dist:Math.hypot(bx, bz), pushed:false};
          }
          const v = TS.receiveTest(evs, me.id, {after, timeUp:T.tRep > 9, dead:!touch && ballDead(T)});
          if (v) tryOver(T, v.ok, v.why);
          return;
        }
        case "call": {
          if (!S.fed){ feedMe(T); card("Take it, then look for whoever calls. Right button to pass to him."); return; }
          if (T.feed) return;
          const v = TS.callerTest(evsOf(T), me.id, {timeUp:T.tRep > 16, dead:ballDead(T) && T.tRep > 6});
          if (v) tryOver(T, v.ok, v.why);
          return;
        }
        case "shoot": {
          if (!S.fed){ feedMe(T); card(`${!S.low ? "Driven keeps it low: press 1, or scroll down to Driven." : "A chip lifts it: press 3, or scroll up to Chip."} Left button to shoot.`); return; }
          if (T.feed) return;
          const v = TS.shotTest(evsOf(T), me.id, {timeUp:T.tRep > TRAIN.REP_LIMIT, dead:ballDead(T)});
          if (!v) return;
          S.shots++;
          if (v.ok && v.contact < 0) S.low = true;
          if (v.ok && v.contact > 0) S.high = true;
          if (S.low && S.high) return tryOver(T, true, "");
          hudResult(v.ok ? (v.contact < 0 ? "Low and on target" : v.contact > 0 ? "High and on target" : "On target. Now switch to Driven or Chip") : WHY[v.why] || "Again", "", v.ok);
          if (S.shots >= 2*TRAIN.TRIES) return tryOver(T, false, v.why);
          S.fed = false; S.stage = "go";
          return;
        }
        case "position": {
          if (S.stage === "start"){
            const anchor = TS.shapeAnchor(TS.SLOT_POS[run.host.me().slot] || TS.SLOT_POS.CM, L.dir);
            S.anchor = toArea(T, anchor); S.callT = ms.t; S.stage = "shape";
            markAt(worldOf(T, S.anchor.x, S.anchor.z));
            card("Shape! Get to your position, the marker on the grass.");
          }
          if (S.stage === "shape"){
            const d = Math.hypot(me.m.x - S.anchor.x, me.m.z - S.anchor.z);
            if (TS.shapeOk(d, ms.t - S.callT)){ markAt(null); S.stage = "line"; S.t = 0; card("Good. Now stay level with the last defender until the pass is played. Call for it with R."); S.lineT = ms.t; }
            else if (ms.t - S.callT > 8){ markAt(null); return tryOver(T, false, "time"); }
            return;
          }
          if (S.stage === "line"){
            // the ball to your team-mate in midfield; he plays you in when you are onside and free
            if (!S.fed){
              const mate = ms.agents.find(o => o.team === T.myTeam && !o.isMe && o.role === "player" && o.onPitch);
              if (mate){ coachFeed(T, "pass", {x:mate.m.x - 8, z:mate.m.z + 6}, {x:mate.m.x, z:mate.m.z}); S.fed = true; S.mate = mate.id; T.evFrom = ms.events.length; T.tRep = 0; }
              return;
            }
            if (T.feed) return;
            const evs = evsOf(T);
            if (evs.some(e => e.kind === "offside" && e.agent === me.id)) return tryOver(T, false, "off");
            const pass = evs.find(e => e.kind === "kick" && e.agent === S.mate && e.recv === me.id);
            const got = pass && evs.find(e => e.kind === "touch" && e.agent === me.id && e.how === "control" && e.t > pass.t);
            if (got) return tryOver(T, true, "");
            if (T.tRep > 25 || ballDead(T) && T.tRep > 8) return tryOver(T, false, "time");
          }
          return;
        }
        case "ssg": {
          if (!S.fed){ feedMe(T); card("Two minutes, four against four."); }
          if (T.feed) return;
          // (a ball out of play: the coach plays a new one in from the line; never while a kick-off is set up)
          if (ssgDead(T)) ssgFeed(T);
          if (T.t >= (L.real || 120)){ tryOver(T, true, ""); ssgOver(T); return; }
          return;
        }
      }
    },
    frame(T){
      if (L.kind !== "ssg") return;
      const left = Math.max(0, Math.ceil((L.real || 120) - T.t));
      if (left !== T.cardLeft){ T.cardLeft = left; card(`Two minutes, four against four · ${left} s`); }
    }
  };
}
function lessonEnd(run, T){
  markAt(null);
  const inv = TS.involvements(T.ms.events, T.me.id);
  for (const v of inv){ if (v.key) award(T, TS.ACTION_XP[v.key], v.q); run.qs.push(v.q); }
  // (the lessons are the day's session: what each one earned is kept, and paid once at the end in the session's band)
  for (const k in T.xp){ run.bag[k] = (run.bag[k] || 0) + T.xp[k]; } run.xpRaw += T.xpRaw;
  T.xp = {}; T.xpRaw = 0;
  run.mins += T.t*T.rate;
  if (T.quit && !T.lessonOk) return;            // (left with the place: the run is let go when the next one is built)
  run.tries++;
  const L = run.L;
  if (T.lessonOk || run.tries >= TRAIN.TRIES){
    run.ok.push(T.lessonOk ? 1 : 0);
    run.host.onb("lesson", {n:L.n, kind:L.kind, ok:!!T.lessonOk, tries:run.tries});
    run.i++; run.tries = 0;
  }
  nextLesson(run);
}
function lessonsEnd(run){
  runOver(run);
  // the XP of the lessons, brought into the session's 60 to 90 (3.6.2, 3.6.3: the lessons are the day's session)
  const lo = TS.SESSION_XP.min, hi = TS.SESSION_XP.max;
  if (run.xpRaw < lo){
    const ks = run.host.me().sessionSkills || ["passing", "stamina"], each = (lo - run.xpRaw)/ks.length;
    for (const k of ks){ run.bag[k] = (run.bag[k] || 0) + each; } run.xpRaw = lo;
  }
  run.xp = payXP({xp:run.bag, host:run.host}, run.xpRaw > hi ? hi/run.xpRaw : 1);
  const score = TS.sessionScore(run.qs);
  run.host.lessonsDone(score, run.mins);
  run.host.say("Coach", TS.LESSON_DONE_LINE);
  run.host.onb("trainingDone", {xp:run.xp});
  RUN.last = {kind:"lessons", ok:run.ok.slice(), xp:run.xp, xpRaw:Math.min(run.xpRaw, hi), score};
  run.host.persist();
  run.res(true);
}

/* a new place is being built (the bus, the tunnel, a reload): whatever was running here is over. The bodies it had
   are gone with the place; the run is let go without its end (nothing was finished) */
onBegin(() => {
  const r = RUN.cur;
  RUN.cur = null; RUN.T = null;
  COACH.h = null; COACH.held = false; COACH.at = null; COACH.feed = null; coachTask(false);
  CONES.list.length = 0; CONES.key = ""; MARK.m = null;
  if (r){ if (r.res) r.res(false); hudClose(); }
});

// tests (DESIGN 1.4.20 style): the run, the simulation in play, the coach
if (typeof window !== "undefined") window.__train = {RUN, TRAIN, COACH, get T(){ return RUN.T; }, get ms(){ return RUN.T ? RUN.T.ms : null; }, get me(){ return RUN.T ? RUN.T.me : null; },
  // (the career's host is set here by acts.js when it loads this module: a test starting a drill itself gets that one)
  host:null, startDrill:(kind, host) => startDrill(kind, host || window.__train.host), startSession:(host, o) => startSession(host || window.__train.host, o),
  startFirstTraining:(host, o) => startFirstTraining(host || window.__train.host, o), inGround, input:ev => controlInput(ev), CTRL, TS,
  // (UF2-B: the small-sided game's scoreboard as shown, the kits of the item in play, the aura, how a body is dressed)
  ssgState, get kits(){ return RUN.T ? RUN.T.kits : null; }, AURA, dressFor};
