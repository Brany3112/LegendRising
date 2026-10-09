/* ============ Football: training in first person ============
   Owner: WP-I (Stage P2). Contract: DESIGN 1.2 (training.js), 1.4.1 (the mode train and its flags), 1.4.13 (createMatch
   with a training cfg.mode), 1.4.17 (control.js, view.js and fphud.js: the match's own controls, bodies and HUD),
   1.6 (the controls), 3.6.2 (partial simulations, the team session), 3.6.3 (the first day's lessons), D4 (one ball,
   one integrator).

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
   on the day, your squad, the clock, the XP and the rewards) comes through the host acts.js hands in (trainHost). */
import {THREE, W, mat, onBegin} from "../build.js";
import {P, LIFE, RT, ME, FLAGS} from "../core/state.js";
import {registerMode, enterMode, exitMode, mode, pushInput, popInput, persistNow} from "../core/modes.js";
import {SCHED} from "../core/sched.js";
import {animateHuman, EV} from "../human.js";
import {GROUND} from "../ground.js";
import {hudSet, hudResult, hudClose} from "../drills.js";
import {createMatch, simStep, REF, AR1, AR2, TEMPO} from "./sim.js";
import {createBall, ballKick, BALL} from "./ball.js";
import {solveStrike, idealPassSpeed} from "./strike.js";
import {attrsForAI} from "./attrs.js";
import {refreshPred} from "./actions.js";
import {startRestart} from "./rules.js";
import {AUD} from "./audio.js";
import * as TS from "./trainspec.js";
import {CTRL, controlInput, controlStep} from "./control.js";
import * as CT from "./control.js";
import {viewInit, viewFrame, viewDispose} from "./view.js";
import * as VW from "./view.js";
import {hudInit, hudFrame, hudNotice, hudScenario, hudDispose} from "./fphud.js";

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
let HOST = null;
export function trainHost(h){ HOST = h; }

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
const COACH = {h:null, home:null, held:false, at:null, face:null, feed:null};
function coachTake(){
  const A = GROUND.assist;
  if (!A || !A.h || !A.h.g) return null;
  if (!COACH.held){ COACH.h = A.h; COACH.home = {x:A.x, z:A.z, ry:A.ry}; COACH.held = true; if (A.lend) A.lend(); }
  return COACH.h;
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
  const there = walkBody(h, COACH.at.x, COACH.at.z, dt, TRAIN.WALK, COACH.face);
  if (there && COACH.going){
    COACH.going = false; COACH.held = false; COACH.at = null;
    h.g.rotation.y = COACH.home.ry; h.ast = h.st || {mode:"idle"};
    const A = GROUND.assist; if (A && A.giveBack) A.giveBack();
  }
}
SCHED.task({id:"train-coach", kind:"keep", run:dt => coachStep(dt)});

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
function conesFor(item){
  const key = item ? JSON.stringify(item.area || "pitch") + item.kind : "";
  if (key === CONES.key) return;
  for (const m of CONES.list) if (m.parent) m.parent.remove(m);
  CONES.list.length = 0; CONES.key = key;
  if (!item || !item.area || !W.scene) return;
  CONE_G = CONE_G || new THREE.ConeGeometry(.11, .3, 10).translate(0, .15, 0);
  CONE_M = CONE_M || mat({color:0xf07a1a, roughness:.6});
  CONE_M.userData.keep = true;
  const a = item.area;
  for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1], [(a.x0 + a.x1)/2, a.z0], [(a.x0 + a.x1)/2, a.z1]]){
    const w = TS.toWorld(x, z), m = new THREE.Mesh(CONE_G, CONE_M);
    m.position.set(w.x, 0, w.z); m.userData.keep = true; m.castShadow = false;
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

/* the simulation for an item. who = {mates:[body], opps:[body], keeper:body|null}: the borrowed squad bodies (their
   records from the squad), placed where each stands now. Your agent starts where you stand. */
function buildItem(item, who, opts = {}){
  const tier = GROUND.tier || 3;
  const spec = TS.areaPitch(item.area, tier);
  const ac = areaC(item.area);
  const F = spec.frame;
  const meRec = HOST.me();
  // which side you are: team 0 attacks +x (sim dirs [1, -1]); an item played toward -x puts you in team 1
  const myTeam = item.dir < 0 ? 1 : 0, oppTeam = 1 - myTeam;
  // the squad's records (names, numbers, how good they are) for the bodies lent: the club's own players, keepers last
  const squad = HOST.squad(), outfield = squad.filter(q => q.pos !== "GK");
  let si = 0;
  const nextSquad = () => outfield.length ? outfield[(si++) % outfield.length] : {pid:900 + si, name:"", number:++si + 1, ovr:55, pos:"CM"};
  const teams = [{name:"A", players:[], bench:[]}, {name:"B", players:[], bench:[]}];
  const bodiesOf = [[], []];          // per team, in the order of its players: the body each agent stands for (null: you)
  const add = (team, rec, body) => { teams[team].players.push(rec); bodiesOf[team].push(body); };
  add(myTeam, playerRec(meRec, meRec.slot, true), null);
  (who.mates || []).forEach((b, i) => { const p = nextSquad(); add(myTeam, Object.assign(playerRec(p, (item.mateSlots || [])[i] || "CM"), {scale:b.scale || 1}), b); });
  (who.opps || []).forEach((b, i) => { const p = nextSquad(); add(oppTeam, Object.assign(playerRec(p, (item.oppSlots || [])[i] || "CB"), {scale:b.scale || 1}), b); });
  if (who.keeper){
    const p = squad.find(q => q.pos === "GK") || nextSquad();
    add(oppTeam, Object.assign(playerRec(p, "GK"), {scale:who.keeper.scale || 1}), who.keeper);
  }
  const kits = HOST.kits();
  const rules = Object.assign({goals:TS.goalsLaw(spec), offside:!!item.offside, restarts:!!item.restarts, cards:false, subs:0, halfTime:false, stoppage:false}, opts.rules || {});
  const cfg = {seed:HOST.seed(item.kind + ":" + (opts.n || 0)), mode:item.mode, spec, halfRealSec:1e6, tempo:Object.assign({}, TEMPO[2]),
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
  const T = {item, spec, F, ac, ms, me:ms.agents[ms.me], myTeam, oppTeam, bodies:new Map(), V:null, t:0, acc:0,
    evFrom:0, tries:0, rep:0, results:[], xp:{}, xpRaw:0, qs:[], done:false, phase:"play", tRep:0, opts, onEnd:opts.onEnd || null,
    traits:meRec.traits || {}, sprintD:0, ballSeen:false, inPlay:false};
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
function takeBall(T, x, z, dead = true){
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
function coachFeed(T, kind, from, to){
  const h = coachTake(); if (!h) return false;
  const w = worldOf(T, from.x, from.z);
  const dir = {x:to.x - from.x, z:to.z - from.z}, L = Math.hypot(dir.x, dir.z) || 1;
  // he stands behind the ball, square to where it goes
  COACH.at = {x:w.x - dir.x/L*.62 - dir.z/L*.14, z:w.z - dir.z/L*.62 + dir.x/L*.14}; COACH.face = Math.atan2(-dir.x, -dir.z);
  T.feed = {kind, from, to, stage:"walk", t:0};
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
      COACH.feed = {st:{mode:"strike", kind:f.kind === "cross" ? "lofted" : "side", side:"R", ball:{x:bw.x, y:R, z:bw.z}, dir:{x:tw.x - bw.x, z:tw.z - bw.z},
        power:f.kind === "cross" ? .8 : .5, curl:0, lowHigh:f.kind === "cross" ? 1 : 0, tc:TRAIN.FEED_TC}};
      f.tc = ms.t + TRAIN.FEED_TC;
    }
    return;
  }
  if (f.stage === "swing" && ms.t >= f.tc - 1e-9){
    const b = ms.ball, d = Math.hypot(f.to.x - b.p.x, f.to.z - b.p.z);
    const cross = f.kind === "cross";
    const speed = cross ? clamp(Math.sqrt(12.5*Math.max(4, d))*(1 + .005*d), 9, 24) : idealPassSpeed(Math.max(2, d), 9, b.rollDecel);
    const r = solveStrike({from:{x:b.p.x, y:b.p.y, z:b.p.z}, target:{x:f.to.x, y:f.to.y != null ? f.to.y : R, z:f.to.z}, speed, contact:cross ? 1 : 0, curl:0, foot:"R",
      kind:cross ? "cross" : "pass", rollDecel:b.rollDecel});
    b.state = "free";
    ballKick(b, r.v, r.w, {agent:-1, team:T.myTeam, kind:cross ? "cross" : "pass", t:ms.t});
    refreshPred(ms);
    if (AUD && AUD.cue) AUD.cue("kick", worldPt(T, b.p), .7);
    f.stage = "gone"; T.feed = null; T.fedAt = ms.t;
    if (COACH.feed) COACH.feed.after = .5;
  }
}
const worldPt = (T, p) => ({x:p.x + T.F.cx, y:p.y, z:p.z + T.F.cz});

/* ---------- the mode train ---------- */
let INP = null;
const RMB = {down:null, up:null, menu:null};
function inputOn(){
  INP = ev => {
    if (!RUN.T) return false;
    if (ev.type === "keydown" && ev.key === "escape"){ if (ev.prevent) ev.prevent(); if (!ev.repeat) quit(); return true; }
    if (ev.type === "keydown" && (ev.key === "q" || ev.key === "tab" && false)) return false;
    if (ev.type === "lock") return false;
    return controlInput(ev);
  };
  pushInput(INP);
  // the right button: the world routes the left one only (world.js bindInput), so the pass button is heard here
  const cv = RT.renderer && RT.renderer.domElement;
  const locked = () => !!cv && document.pointerLockElement === cv;
  RMB.down = e => { if (e.button === 2 && locked() && RUN.T) controlInput({type:"down", button:2, locked:true}); };
  RMB.up = e => { if (e.button === 2 && RUN.T) controlInput({type:"up", button:2, locked:locked()}); };
  RMB.menu = e => { if (RUN.T) e.preventDefault(); };
  addEventListener("mousedown", RMB.down); addEventListener("mouseup", RMB.up); addEventListener("contextmenu", RMB.menu);
}
function inputOff(){
  if (INP) popInput(INP); INP = null;
  if (RMB.down){ removeEventListener("mousedown", RMB.down); removeEventListener("mouseup", RMB.up); removeEventListener("contextmenu", RMB.menu); }
  RMB.down = RMB.up = RMB.menu = null;
}

registerMode("train", {
  enter(T){
    RUN.T = T;
    if (CT.controlReset) CT.controlReset();
    CTRL.enabled = true; CTRL.walk = false;
    T.V = viewInit(T.ms, W.scene, T.kits || HOST.kits(), {frame:T.F});
    try { hudInit(T.ms.cfg); } catch(e){ console.error(e); }
    inputOn();
    T.evFrom = T.ms.events.length;
    if (T.item.line && hudScenario) hudScenario(T.item.line);
  },
  exit(reason){
    const T = RUN.T; RUN.T = null;
    inputOff();
    if (T){
      // you stay where your agent was (P has mirrored it all along); the squad's bodies take their agents' places
      handBack(T);
      if (T.V) viewDispose(T.V);
      T.V = null;
      if (!T.done){ T.done = true; T.quit = reason !== "done"; if (T.onEnd) T.onEnd(T); }
    }
    try { hudDispose(); } catch(e){ console.error(e); }
    ME.act = null;
  },
  slice(h){ const T = RUN.T; if (T) sliceItem(T, h); },
  step(dt, real){ const T = RUN.T; if (T) frameItem(T, dt, real); },
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
  T.acc += h;
  let n = 0;
  while (T.acc >= H - 1e-9 && n < TRAIN.MAX_STEPS){
    fixedItem(T);
    T.acc -= H; n++;
  }
  if (T.acc >= H) T.acc %= H;
  if (T.V && !T.done){
    viewFrame(T.V, T.ms, clamp(T.acc/H, 0, 1), h, RT.cam);
  }
}
function fixedItem(T){
  const ms = T.ms;
  if (VW.viewPreStep && T.V) VW.viewPreStep(T.V, ms);
  feedStep(T);
  if (T.script && T.script.pre) T.script.pre(T);
  controlStep(ms, T.me, H, {traits:T.traits, live:true});
  simStep(ms, H);
  // a drill has no restarts: whatever stopped play (a ball out, a goal) is the end of a go; the next one is a new ball
  if (!T.item.restarts && !T.item.kickoff && (ms.restart || ms.phase !== "live")){
    ms.restart = null; ms.phase = "live";
    for (const a of ms.agents){ a.set = null; a.wall = false; }
  }
  if (T.script && T.script.post) T.script.post(T);
  T.t += H; T.tRep += H;
}

// once a frame: you where your agent is (for the camera, your body, everyone round you), the HUD, the clock
function frameItem(T, dt, real){
  const ms = T.ms, a = T.me, al = clamp(T.acc/H, 0, 1);
  const x = a.x0 + (a.m.x - a.x0)*al, z = a.z0 + (a.m.z - a.z0)*al;
  const w = worldOf(T, x, z);
  P.x = w.x; P.z = w.z; P.feet = a.y || 0; P.eye = P.feet + P.eyeH;
  P.vx = a.m.vx; P.vz = a.m.vz; P.speed = a.m.speed; P.sprint = a.m.gait === "sprint" ? 1 : 0;
  P.moveMode = a.m.speed < .3 ? "idle" : a.m.gait === "sprint" ? "sprint" : a.m.speed > 4 ? "run" : a.m.speed > 2 ? "jog" : "walk";
  FLAGS.moving = a.m.speed > .5;
  if (CT.scanStep) CT.scanStep(dt);
  // your first-person body plays the strike, the header or the touch your agent is making (the legacy clip names)
  ME.act = meClip(T);
  try { hudFrame(ms, a, CTRL, dt); } catch(e){ console.error(e); }
  if (T.script && T.script.frame) T.script.frame(T, real);
  if (T.rate > 0) HOST.pass(real*T.rate);
  // the distance you sprint (pace and stamina XP: one a 60 m)
  if (a.m.gait === "sprint" && a.m.speed > (a.prm.run || 6)) T.sprintD += a.m.speed*real;
  if (AUD && AUD.listener && RT.cam) AUD.listener(RT.cam.position, P.yaw);
  // calls for the ball: the caller's voice from where he stands (and his name, 1.5.10)
  for (let i = T.callSeen || 0; i < ms.events.length; i++){
    const e = ms.events[i];
    if (e.kind === "call" && e.agent !== a.id && ms.agents[e.agent] && ms.agents[e.agent].team === T.myTeam && AUD && AUD.call){
      const o = ms.agents[e.agent];
      AUD.call(o.name ? o.name.split(" ").pop() : "", worldPt(T, {x:o.m.x, y:1.6, z:o.m.z}), o.pid | 0);
    }
  }
  T.callSeen = ms.events.length;
}
// the legacy clips of your first-person body (human.js CONTACT: the moment of contact in each clip), timed to the
// contact your agent's action has scheduled
const CLIP = {mode:"kick", t:0};
function meClip(T){
  const act = T.me.act; if (!act) return null;
  const mode = act.kind === "header" ? "header" : act.kind === "kick" ? (act.action && (act.action.kind === "pass" || act.action.kind === "through") ? "pass" : "kick")
    : act.kind === "tackle" || act.kind === "slide" ? "kick" : null;
  if (!mode) return null;
  const C = {kick:.42, pass:.44, header:.5}[mode];
  const tc = act.tc || act.tEff || .2, t = act.t || 0;
  CLIP.mode = mode;
  CLIP.t = t < tc ? C*t/Math.max(tc, 1e-3) : Math.min(1, C + (1 - C)*(t - tc)/Math.max(.2, (act.dur || tc + .3) - tc));
  return CLIP;
}

/* ---------- leaving ---------- */
function quit(){
  const r = RUN.cur;
  if (r && r.quit) r.quit();
  else if (mode() === "train") exitMode("quit");
}

/* ---------- the go's verdicts (trainspec.js tests on the simulation's own events) ---------- */
function evsOf(T){ return T.ms.events.slice(T.evFrom); }
function ballDead(T){
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
  for (const [k, amt] of Object.entries(T.xp)){ const v = amt*scale; if (v > .05){ total += HOST.xp(k, v); } }
  return total;
}

/* ---------- the walk over ----------
   Between the items of a run you are in ordinary life: you walk over yourself (the cones are out for the next one),
   the squad jog to where it wants them, and it starts once you are in its ground and they are in place (or have had
   long enough). run = {item, spots: [{b, x, z}], check?(run) -> false to stop waiting (the run is over), play(run)} */
function gather(run, item, play){
  run.item = item; run.spots = spotsFor(item, run.lent || []); run.state = "walk"; run.waitT = 0; run.play = play;
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
// where the squad stands for an item: given spots (mateAt, oppAt), else the slots spread over its ground; the keeper
// on his goal line, in the goal you attack
function spotsFor(item, lent){
  const out = [];
  const keeper = lent.find(b => b.role === "keeper"), field = lent.filter(b => b.role !== "keeper");
  const nm = item.mates || 0, no = item.opps || 0;
  field.slice(0, nm + no).forEach((b, i) => {
    const mate = i < nm, j = mate ? i : i - nm;
    const given = mate ? item.mateAt && item.mateAt[j] : item.oppAt && item.oppAt[j];
    const slot = mate ? (item.mateSlots || [])[j] : (item.oppSlots || [])[j];
    let sp = given || TS.slotSpot(TS.SLOT_POS[slot] || {x:50, y:50}, item.area, item.dir, mate ? 0 : 1);
    // the callers of the third lesson come round behind and beside you
    if (item.kind === "call" && item.start){ const s = item.start; sp = j === 0 ? {x:s.x - 7, z:s.z + 4} : {x:s.x - 2, z:s.z - 9}; }
    const w = TS.toWorld(sp.x, sp.z);
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
  coachGive(); conesFor(null); markAt(null); hudClose();
  if (RUN.cur === run) RUN.cur = null;
}

/* =============================== the drills (3.6.2) =============================== */
/* A drill is reps goes: the coach plays a ball in (to you, or to whoever starts with it), the go is decided by the
   drill's test, the card says how it went, and the next ball comes. 30 minutes of the clock in all, given out go by
   go. The ones with team-mates or opponents need the squad out on the pitch (the session's hours). */
const DRILL_TEST = {shoot:"shot", head:"header", pass:"pass", intercept:"intercept", duel:"duel", setpiece:"shot"};
export function startDrill(kind){
  const D = TS.DRILLS[kind]; if (!D || RUN.cur) return false;
  const sess = GROUND.session, needSquad = D.mates + D.opps;
  const squadHere = !!(sess && sess.borrow && HOST.sessionOn());
  if (needSquad && !squadHere){ HOST.note(`This one needs team-mates. The squad's out on the pitch from ${HOST.sessionStartText()}.`); return false; }
  if (!GROUND.assist){ HOST.note("There's no coach about to feed you the balls."); return false; }
  const run = {kind:"drill", lent:[], scores:[], xp:0};
  const lent = squadHere ? lend(run, needSquad, !!D.keeper) : [];
  run.lent = lent;
  if (lent.filter(b => b.role !== "keeper").length < needSquad){ runOver(run); HOST.note("Not enough of the lads are free for that one right now."); return false; }
  const item = Object.assign({}, D, {restarts:kind === "setpiece", line:`${D.title} · ${D.hint.split(" · ")[0]}`, keeper:!!D.keeper && lent.some(b => b.role === "keeper")});
  run.item = item;
  RUN.cur = run;
  run.quit = () => { run.stopped = true; if (run.T && mode() === "train") exitMode("quit"); else { runOver(run); HOST.note("Drill called off."); } };
  hudSet({title:D.label, rep:0, reps:D.reps, scores:[]}, {hint:D.sub});
  gather(run, item, r => {
    const T = buildItem(item, whoOf(r.spots), {n:0, ballAt:D.feed.at || D.feed.from, onEnd:t => drillEnd(run, t)});
    T.rate = 0; T.kits = HOST.kits();
    T.script = drillScript(kind, D, run);
    run.T = T;
    enterMode("train", T);
  });
  return true;
}
function drillScript(kind, D, run){
  const test = DRILL_TEST[kind], to = D.feed.to;
  const S = {state:"setup", wait:.6, rep:0};
  const card = hint => hudSet({title:D.label, rep:S.rep, reps:D.reps, scores:run.scores}, hint != null ? {hint} : {});
  const nextGo = T => {
    T.evFrom = T.ms.events.length; T.tRep = 0; T.stillT = 0; T.inPlay = false; S.state = "go";
    const me = T.me;
    if (to === "spot"){
      // a free kick: a ball on the spot, the wall and the keeper set by the restart's own rules, the kick yours
      const sp = toArea(T, D.feed.at);
      takeBall(T, sp.x, sp.z, true);
      startRestart(T.ms, "free", T.myTeam, {x:sp.x, z:sp.z});
      if (T.ms.restart) T.ms.restart.taker = me.id;
      card("Over the wall or round it. Left button to shoot; the wheel, or 1, 2 and 3, for low, normal or high contact.");
      return;
    }
    let tgt;
    if (to === "opp"){
      const o = T.ms.agents.find(q => q.team === T.oppTeam && q.onPitch && q.role === "player" && !q.isGK);
      tgt = o ? {x:o.m.x, z:o.m.z} : {x:me.m.x, z:me.m.z};
    } else if (to === "head"){
      const f = {x:-Math.sin(me.m.yaw), z:-Math.cos(me.m.yaw)};
      tgt = {x:me.m.x + f.x*.5, y:1.95*(me.scale || 1), z:me.m.z + f.z*.5};
    } else tgt = {x:me.m.x + me.m.vx*.6, z:me.m.z + me.m.vz*.6};
    coachFeed(T, D.feed.kind === "cross" ? "cross" : "pass", toArea(T, D.feed.from), tgt);
    card(D.sub);
  };
  return {
    post(T){
      if (S.state === "setup"){ if ((S.wait -= H) <= 0) nextGo(T); return; }
      if (S.state === "result"){ if ((S.wait -= H) <= 0){ if (S.rep >= D.reps) finishItem(T); else nextGo(T); } return; }
      if (S.state !== "go" || T.feed) return;
      const evs = evsOf(T), ctx = {timeUp:T.tRep > TRAIN.REP_LIMIT + (to === "spot" ? 8 : 0), dead:ballDead(T), passes:3};
      let v = null;
      if (test === "shot") v = TS.shotTest(evs, T.me.id, ctx);
      else if (test === "header") v = TS.headerTest(evs, T.me.id, ctx);
      else if (test === "pass") v = TS.passTest(evs, T.me.id, ctx);
      else if (test === "intercept") v = TS.interceptTest(evs, T.me.id, T.myTeam, ctx);
      else if (test === "duel") v = TS.duelTest(evs, T.me.id, T.myTeam, ctx);
      if (!v) return;
      S.rep++; run.scores.push(v.ok ? Math.max(.45, v.q) : v.q*.4);
      award(T, D.xp, v.ok ? v.q : 0);
      T.results.push(v);
      hudResult(v.ok ? (v.q >= .9 ? "Perfect" : v.q >= .7 ? "Great" : "Good") : WHY[v.why] || "Not this time", "", v.ok);
      card();
      HOST.pass(D.mins/D.reps);
      S.state = "result"; S.wait = TRAIN.RESULT;
    }
  };
}
const WHY = {wide:"Wide", blocked:"Blocked", wood:"Off the woodwork", none:"No shot", time:"Out of time", missed:"Missed it", lost:"Didn't find him",
  out:"Out of play", int:"Cut out", off:"Offside", through:"They got it through", beaten:"He got past you", heavy:"Heavy touch", still:"Didn't take it forward",
  other:"Not to the man who called", saved:"Saved"};
function drillEnd(run, T){
  const D = TS.DRILLS[run.item.kind], done = T.results.length, avg = run.scores.length ? run.scores.reduce((a, b) => a + b, 0)/run.scores.length : 0;
  const xp = payXP(T);
  if (done){ HOST.exert(6*done/D.reps, 5*done/D.reps); HOST.trainMin(D.mins*done/D.reps); }
  runOver(run);
  RUN.last = {kind:"drill", drill:D.kind, done, scores:run.scores.slice(), xp, results:T.results.map(v => ({ok:v.ok, why:v.why, q:v.q}))};
  if (T.quit) HOST.note(done ? `Stopped after ${done} of ${D.reps}. You keep the ${Math.round(xp)} XP.` : "Drill called off.");
  else HOST.center(`${D.label} complete`, `${Math.round(avg*100)}% · +${Math.round(xp)} XP`);
  HOST.persist();
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
export function startSession(){
  if (RUN.cur) return false;
  const ss = HOST.attSess();
  const left = HOST.sessionEnd() - HOST.minute();
  const todo = TS.blocksToRun(ss ? ss.blocks : 0, left);
  if (!todo.length){ HOST.note(`The session's nearly over. Join them tomorrow at ${HOST.sessionStartText()}.`); return false; }
  const run = {kind:"session", blocks:todo, i:0, lent:[], qs:[], xpRaw:0, xp:0};
  RUN.cur = run;
  run.quit = () => { run.stopped = true; if (run.T && mode() === "train") exitMode("quit"); else sessionEnd(run); };
  // the session's own time runs out (SESSION.end): what is left is not played
  run.check = r => { if (!HOST.sessionOn() || HOST.sessionEnd() - HOST.minute() < TS.BLOCKS[r.blocks[r.i]].mins - 1e-6){ sessionEnd(r); return false; } return true; };
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
  HOST.say("Coach", B.coach);
  hudSet({title:"Team session", rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:`${B.line} · over to the cones`});
  gather(run, Object.assign({}, B, {restarts:false}), r => {
    const item = r.item;
    const T = buildItem(item, whoOf(r.spots), {n:run.i, ballAt:TS.toLocal(P.x - 9, P.z + 7), onEnd:t => blockEnd(run, t)});
    T.kits = HOST.kits();
    T.rate = B.mins/B.real;
    T.script = blockScript(B, run);
    run.T = T;
    hudSet({title:B.title, rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:B.line});
    enterMode("train", T);
  });
}

function blockScript(B, run){
  const S = {fed:false};
  return {
    post(T){
      // the coach plays the first ball in to you, and a fresh one whenever the last has gone dead for good
      if (!T.feed && (!S.fed || T.ms.ball.state === "dead" && ballDead(T) && T.tRep > 4)){
        const me = T.me, edge = !S.fed && T.opts.ballAt ? toArea(T, T.opts.ballAt) : {x:clamp(me.m.x - 9, -T.spec.hx - 1, T.spec.hx + 1), z:clamp(me.m.z + 7, -T.spec.hz - 1, T.spec.hz + 1)};
        S.fed = true; T.tRep = 0; T.inPlay = false; T.stillT = 0;
        coachFeed(T, "pass", edge, {x:me.m.x, z:me.m.z});
      }
      if (T.t >= B.real) finishItem(T);
    },
    frame(T){ hudSet({title:B.title, rep:run.i, reps:run.blocks.length, scores:run.qs}, {hint:`${B.line} · ${Math.max(0, Math.ceil(B.real - T.t))} s`}); }
  };
}
function blockEnd(run, T){
  const inv = TS.involvements(evsOf(Object.assign({}, T, {evFrom:0})), T.me.id);
  for (const v of inv){ if (v.key) award(T, TS.ACTION_XP[v.key], v.q); run.qs.push(v.q); }
  // sprinting: pace and stamina, one a 60 m
  if (T.sprintD >= 60) award(T, TS.ACTION_XP.sprint.map(([k, b]) => [k, b*Math.floor(T.sprintD/60), 0]), 0);
  // the block's share of the session's 60 to 90 XP: what you earned, brought into its share of the band
  const share = B => B.mins/TS.SESSION_PLAN_MINS;
  const lo = TS.SESSION_XP.min*share(run.B), hi = TS.SESSION_XP.max*share(run.B);
  if (T.xpRaw < lo){
    // too little measured: being out there with the lads is worth the band's floor, on your position's skills
    const ks = HOST.me().sessionSkills || ["passing", "stamina"], each = (lo - T.xpRaw)/ks.length;
    for (const k of ks){ T.xp[k] = (T.xp[k] || 0) + each; } T.xpRaw = lo;
  }
  const scale = T.xpRaw > hi ? hi/T.xpRaw : 1;
  run.xpRaw += T.xpRaw*scale;
  run.xp = (run.xp || 0) + payXP(T, scale);
  HOST.blockDone(run.B.mins, T.quit ? 0 : 1);
  if (T.quit || run.stopped){ sessionEnd(run); return; }
  run.i++;
  nextBlock(run);
}
function sessionEnd(run){
  if (RUN.cur !== run) return;
  runOver(run);
  const score = TS.sessionScore(run.qs);
  const ss = HOST.attSess();
  const all = ss && ss.blocks >= TS.BLOCKS.length;
  if (all && !ss.done){
    const r = HOST.sessionDone(score);
    HOST.center("Session done", `+${Math.round(run.xp)} XP · Manager trust +${r.trust.toFixed(1)} · the lads saw you put the work in`);
  } else if (ss && ss.blocks){
    HOST.note(run.stopped ? `You stepped out of the session. You keep the ${Math.round(run.xp)} XP, and the next block is there when you come back.` : `That's all the time there was today. You keep the ${Math.round(run.xp)} XP.`);
  } else if (run.stopped) HOST.note("You stepped out before it got going.");
  RUN.last = {kind:"session", xpRaw:run.xpRaw, xp:run.xp, blocks:ss ? ss.blocks : 0, score};
  HOST.persist();
}

/* =============================== the first day's lessons (3.6.3) =============================== */
/* Six lessons on the same controls and the same code path as a match. Each ends on one success or three attempts,
   the coach says its line at the start. Their end is the day's session (its rewards once, the time the rest of it
   would have taken), GameplayTutorialCompleted, and the coach's last word. Resolves when they are over (false when
   they were cut short: the day ended, or you left the training centre). */
export function startFirstTraining(){
  if (RUN.cur) return Promise.resolve(false);
  return new Promise(res => {
    const run = {kind:"lessons", i:0, tries:0, ok:[], lent:[], qs:[], mins:0, res, xp:0};
    RUN.cur = run;
    // (the lessons are not left half-way with Esc: it lets the pointer go, which pauses them)
    run.quit = () => {};
    const need = Math.max(...TS.LESSONS.map(L => (L.mates || 0) + (L.opps || 0)));
    run.lent = HOST.sessionOn() ? lend(run, need, true) : [];
    nextLesson(run);
  });
}
function nextLesson(run){
  if (run.i >= TS.LESSONS.length){ lessonsEnd(run); return; }
  const L = TS.LESSONS[run.i];
  run.L = L; run.T = null;
  if (!run.tries){ HOST.say("Coach", L.line); HOST.onb("lesson", {n:L.n, kind:L.kind, start:true}); }
  hudSet({title:`Lesson ${L.n} · ${L.title}`, rep:run.tries, reps:TRAIN.TRIES, scores:run.ok}, {hint:L.line});
  gather(run, Object.assign({}, L, {restarts:false, kickoff:false, keeper:!!L.keeper && run.lent.some(b => b.role === "keeper")}), r => {
    const T = buildItem(r.item, whoOf(r.spots), {n:run.i*10 + run.tries, ballAt:L.feed ? L.feed.from : TS.toLocal(P.x - 10, P.z + 6), onEnd:t => lessonEnd(run, t)});
    T.kits = HOST.kits();
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
    coachFeed(T, "pass", from, {x:me.m.x, z:me.m.z}); S.fed = true; S.fedOnce = true; T.evFrom = T.ms.events.length; T.tRep = 0; T.inPlay = false; T.stillT = 0;
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
          if (!S.fed){ feedMe(T); card(`${!S.low ? "Low contact: the wheel down, or 1." : "High contact: the wheel up, or 3."} Left button to shoot.`); return; }
          if (T.feed) return;
          const v = TS.shotTest(evsOf(T), me.id, {timeUp:T.tRep > TRAIN.REP_LIMIT, dead:ballDead(T)});
          if (!v) return;
          S.shots++;
          if (v.ok && v.contact < 0) S.low = true;
          if (v.ok && v.contact > 0) S.high = true;
          if (S.low && S.high) return tryOver(T, true, "");
          hudResult(v.ok ? (v.contact < 0 ? "Low and on target" : v.contact > 0 ? "High and on target" : "On target, now change the contact") : WHY[v.why] || "Again", "", v.ok);
          if (S.shots >= 2*TRAIN.TRIES) return tryOver(T, false, v.why);
          S.fed = false; S.stage = "go";
          return;
        }
        case "position": {
          if (S.stage === "start"){
            const anchor = TS.shapeAnchor(TS.SLOT_POS[HOST.me().slot] || TS.SLOT_POS.CM, L.dir);
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
          if (T.ms.ball.state === "dead" && ballDead(T) && T.tRep > 4){ feedMe(T); }
          if (T.t >= (L.real || 120)) return tryOver(T, true, "");
          return;
        }
      }
    },
    frame(T){ if (L.kind === "ssg") card(`Two minutes, four against four · ${Math.max(0, Math.ceil((L.real || 120) - T.t))} s`); }
  };
}
function lessonEnd(run, T){
  markAt(null);
  const inv = TS.involvements(T.ms.events, T.me.id);
  for (const v of inv){ if (v.key) award(T, TS.ACTION_XP[v.key], v.q); run.qs.push(v.q); }
  run.xp += payXP(T);
  run.mins += T.t*T.rate;
  if (T.quit && !T.lessonOk) return;            // (left with the place: the run is let go when the next one is built)
  run.tries++;
  const L = run.L;
  if (T.lessonOk || run.tries >= TRAIN.TRIES){
    run.ok.push(T.lessonOk ? 1 : 0);
    HOST.onb("lesson", {n:L.n, kind:L.kind, ok:!!T.lessonOk, tries:run.tries});
    run.i++; run.tries = 0;
  }
  nextLesson(run);
}
function lessonsEnd(run){
  runOver(run);
  const score = TS.sessionScore(run.qs);
  HOST.lessonsDone(score, run.mins);
  HOST.say("Coach", TS.LESSON_DONE_LINE);
  HOST.onb("trainingDone", {xp:run.xp});
  RUN.last = {kind:"lessons", ok:run.ok.slice(), xp:run.xp, score};
  HOST.persist();
  run.res(true);
}

/* a new place is being built (the bus, the tunnel, a reload): whatever was running here is over. The bodies it had
   are gone with the place; the run is let go without its end (nothing was finished) */
onBegin(() => {
  const r = RUN.cur;
  RUN.cur = null; RUN.T = null;
  COACH.h = null; COACH.held = false; COACH.at = null; COACH.feed = null;
  CONES.list.length = 0; CONES.key = ""; MARK.m = null;
  if (r){ if (r.res) r.res(false); hudClose(); }
});

// tests (DESIGN 1.4.20 style): the run, the simulation in play, the coach
if (typeof window !== "undefined") window.__train = {RUN, TRAIN, COACH, get T(){ return RUN.T; }, get ms(){ return RUN.T ? RUN.T.ms : null; }, get me(){ return RUN.T ? RUN.T.me : null; },
  startDrill, startSession, startFirstTraining, inGround};
