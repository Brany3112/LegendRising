/* ============ Football: the match day ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.16 (controller.js: registerMode("match"), FP), 1.4.1 (mode flags),
   1.4.20 (the test hooks window.__fp), 3.4.1 to 3.4.4 (match day, roles and the bench, half and full time,
   checkpoints and recovery), 1.5.5 (timings), 1.3 (the player's agent is moved only by the simulation; P mirrors it);
   addendum A1.5 (the world time-scale for slow motion: the same fixed steps, fewer of them a real second).

   The day, in order: the travel card (15 minutes to a home game, 45 on the team bus away) with the life clock passing
   behind it; the dressing room (your team-mates on the benches, the manager's word on your role, E at the door to
   walk out); the walk-out (both sides in two lines down the corridor behind the referee and the match ball, out of the
   tunnel and to their places; you jog to yours, marked by a faint ring, "E: Ready"); the kick-off when everyone is
   set; live play; half time (the whistle, the walk off, the dressing-room card with your drinks, the second half with
   ends changed); full time (every rating, the world's record, the career's rewards, the card) and the walk back out
   of the training ground's tunnel. A substitute watches from the dugout (1x, 2x, 4x, or E held skips to his call
   under a card), walks to the fourth official when he is called and steps on once his man is off.

   One match is one simulation (sim.js), stepped here at 60 Hz: what you press is written into your agent's intent
   before the AI runs (control.js), the view draws the bodies between the last two steps (view.js), your eye rides
   your agent (matchcam.js), the HUD reads the state (fphud.js). Nothing is moved by hand: before kick-off the bodies
   walk to the very spots the simulation keeps them on, and you hand over to your agent where you stand.

   Checkpoints (3.4.4) are written at the entry, at dead balls (at most one a minute of real time), at half time, at
   the kick-off after a goal and at substitutions; a page closed mid-match plays the rest out headless on the next
   load. This module touches no classic global: the career's side (the fixture, matchSetup, the cards, the clock, the
   way back) comes through the host tunnel.js gives it (fpHost), and the simulation's through bridge.js.

   WP-F2 (addendum A1.6, A1.7): seated on the bench nothing else is offered under your eye (the bench spot's prompt
   goes), a tap of E stands you up to warm up along the touchline; watching at 2x and 4x the picture is drawn at 30 Hz
   and the hints say the rate it really runs at. Your strikes: a big chance eases time a little while you wind up (the
   world's time-scale, never a pause); your contact is heard and felt by how cleanly you struck it (the kick's gain
   and a moment of hit-stop for a clean one).

   WP-W1 (addendum A1.8): the warm-up. A substitute with a planned change is called 10 to 15 match minutes before it:
   the assistant coach comes over, E stands you up, you jog to the strip behind the touchline and warm up (warmup.js,
   the exercises, their poses, the coaches) while the match goes on; the rating's boost goes onto your agent's numbers
   for your first minutes on (and 10 more after a goal or an assist while it lasts), then comes off again. The skip to
   your call stops at the coach's call. The career's side (motivation, the boost, trust) through warmup.js's port. */
import {P, RT, FLAGS, FADE, ME, LIFE} from "../core/state.js";
import {registerMode, enterMode, exitMode, mode, revealAfterFrames, persistNow, coverScreen} from "../core/modes.js";
import {camKick} from "../core/camera.js";
import {SCHED} from "../core/sched.js";
import {moveBy, findInside} from "../core/collide.js";
import {pass} from "../core/acts.js";
import {THREE} from "../build.js";
import {createMatch, simStep, runHeadless, on, secondHalf, matchSec, HALF_REAL, CALIBRATED, TEMPO, liveRating} from "./sim.js";
import {xgAt} from "./judge.js";
import {firstReach} from "./ball.js";
import {matchConfig, checkpoint, finish, attach, resumeInfo, drink} from "./bridge.js";
import {minuteOf, highlights, onSec, deriveMy} from "./events.js";
import {makePitch, ROLL, dirOf, yawOf, wrapA} from "./pitchspec.js";
import {attrsForAI} from "./attrs.js";
import {restartReady, startRestart} from "./rules.js";
import {startAction} from "./actions.js";
import {createMover, moverParams, moverStep, sprintSpeed} from "../mover.js";
import {createStam, stamStep, stamFactors, effortOf} from "../stamina.js";
import {viewInit, viewFrame, viewDispose, viewEvent, viewPreStep, fpPose, looksOf, viewPre, viewRing, viewRecv, makeFP} from "./view.js";
import {ctrlShields} from "../core/keylock.js";
import {CTRL, SET, onSet, saveSet, controlInput, controlStep, controlReset, scanStep, hintsFor, offsideHud, MOD, modKey, modded, KEYS, look, CN, RING_T, rhythmOf, FEEL, hitStopOf, windingShot} from "./control.js";
import {camInit, camDispose, benchCam, benchClamp, camAction, camTrauma, cineShot, MC, FX, CAM} from "./matchcam.js";
import {hudInit, hudFrame, hudNotice, hudClearCards, hudScenario, hudCall, hudOverlay, hudDispose, hudToggleHints, hudTab, hudShow, applySettings, settingsHTML, fmtVal, hudPop, hudSay, hudSayOff, hudCallMe} from "./fphud.js";
import {WU, WARM, warmPlan, warmFrame, warmInput, warmPose, warmEye, warmIntent, warmView, warmHud, warmHints, warmDispose, warmDriving, warmDrilling,
  warmCallDue, warmOn, warmTab, careerPort, localPort, boostedAttrs, pickSet, WARM_POOL, boostFor, callMinute, exerciseCount, exScore, touchFence, inFence} from "./warmup.js";
import {recInit, rec, clip, play, playing, skip, replayStep, keep, kept} from "./replay.js";
import {STADIUM, SPAWNS} from "./stadium.js";
import {AUD} from "./audio.js";
import {prebuildHumans, lookFor, human, animateHuman} from "../human.js";
import {runOne} from "./harness.js";
import {resolveKits} from "./kitclash.js";
import {auraInit, auraFrame, auraDispose, AURA} from "./aura.js";
// (the view as a namespace too: the hand-raise clip, U10, is looked up by name, so this module links with or without it)
import * as VIEWNS from "./view.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const H = 1/60;
const DEG = Math.PI/180;

// the numbers of the day (1.5.5, 3.4.1 to 3.4.3)
export const DAY = Object.freeze({
  TRAVEL: {home: 15, away: 45}, LATE: 15, MATCH_LEN: 115, HEAD_OUT: 5,
  WALK_V: 1.4, WALK_MAX: 30, KO_WAIT: 25, KO_HALF_NAG: 15, CIRCLE: 9.15,
  HT_WALK: 2, HT_CARD: 60, FT_WALK: 2, CK_GAP: 60, SKIP_MS: 11, SKIP_CAP: 13, SKIP_MIN: 4, STALL0: 2, REPLAY: 6, MAX_STEPS: 4,
  FF: [1, 2, 4], FF_DRAW: 1/30, E_TAP: .35, E_HOLD: .8, ENTRY_NEAR: 3, CORRIDOR: {x: 1.1, zFront: -46, zBack: -64, gap: 1.25, mouth: -40.5},
  // P2-A: by the fourth official within ENTRY_AT m; called and not going for CALL_WALK s, you head over (MF-9); the lock
  // asked back after a card is waited for RELOCK s of real time before the match is held on the pause card (MF-1)
  ENTRY_AT: 1.2, CALL_WALK: 15, RELOCK: .6,
  // A1.7: a shot wound up with at least BIG_XG of a chance eases the world to BIG_SCALE (released, it comes back over
  // BIG_OUT s); your clean contact holds the world for a blink (HIT: [strike quality from, time-scale, seconds])
  BIG_XG: FEEL.BIG_XG, BIG_SCALE: FEEL.BIG_SCALE, BIG_OUT: FEEL.BIG_OUT, HIT: FEEL.HIT
});

/* ---------- the host: the career's side of the day (tunnel.js gives it) ----------
   {setup(f, {late}) -> MT, kickoff(f) -> minute of the day, now() -> minute of the day, travel(f) -> minutes, place(f)
   -> {from, to}, look(kit, number) -> a body look, drinks() -> [{id, name, n}], htCard(M, opts) -> html,
   ftCard(M, R) -> html, pressOpen() -> bool, press() -> html (the man of the match interview), around(f) -> list, leave(fatigue), traits() -> {}, persist(), timeLapse(mins, label, done, o),
   note(text), relock()} */
let HOST = null;
export function fpHost(h){ HOST = h; }

/* ---------- the state of the day ---------- */
const FS = {
  state: null,            // 'travel'|'dressing'|'walkout'|'kickoff'|'live'|'bench'|'entering'|'halftime'|'fulltime'|'leaving'
  ms: null, V: null, f: null, M: null, cfg: null, test: null, real: false,
  evq: [], offs: [], acc: 0, ffRate: 1, timeScale: 1, slow: null, renderT: 0,
  own: null, ownPrm: null, ownSt: null, ownFac: {}, onPitch: false,
  walkers: null, koT: 0, ready: false, nagT: 0,
  benchSeat: null, skipping: null, called: false, entering: false,
  ckT: -1e9, ckGoal: null, ckNow: null, goalEv: null, goalT: -1, replayQ: null, htT: 0, ftT: 0, R: null, done: false,
  // P2-A: the state the half-time whistle found you in (MF-7); the pointer a card let go of, its answer still to come, and
  // the lock asked back after it (MF-1); the lock seen in this match; your height in it (MV-10); the walk to the fourth
  // official (MF-9)
  prevState: null, htCard: false, ftCard: false, freed: false, exitAsked: false, relockWait: false, lockUsed: false, meScale: 1, callT: 0, autoWalk: false,
  realT: 0, headless: false, pauseShown: false, lastMin: -1, board: -1, stepsLast: 0, stepCost: 0,
  frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), dispScale: 1, eye: {x: 0, y: 1.68, z: 0},
  hints: [], lastHint: 0, offPip: null, lockLook: false, eHeld: 0, eDown: false, tabHeld: false, lateMin: 0, logT: 0,
  viewDt: 0, drawAcc: 0, ffAch: 1, ffSteps: 0, ffReal: 0, stepMean: 0, skipPre: 0, skipLast: 0, recvSeq: -1, recvAt: null
};
const isTest = () => !!FS.test;

/* ---------- the mode (1.4.1, 1.4.16) ----------
   clock 'own' (the travel card and the dressing room pass time; nothing passes from the walk-out to full time),
   movement 'own' (your own walk before and after, your agent in play), targeting only the stadium's own spots,
   saves deferred to the checkpoints, no third person, no life HUD, the pointer let go pauses it */
// (seated on the bench nothing is offered under your eye: the bench's own spot would keep saying "Sit down", A1.6)
// (nor while the warm-up has you: its own keys are the set's, A1.8)
const FLAGS_MATCH = {clock: "own", movement: "own", targeting: s => !!(s && s.stadium) && !(FS.state === "bench" && FS.seated) && !(warmDriving() || WARM.phase === "call"), tunnel: false, closing: false,
  homeTick: false, compass: false, saves: "defer", tp: false, hud: "none", pauseOnUnlock: true, leaveOnZone: false};
const MATCH_MODE = registerMode("match", {
  flags: FLAGS_MATCH,
  enter(){ document.body.classList.add("fp-match"); },
  exit(reason){ document.body.classList.remove("fp-match"); if (reason !== "done" && FS.state) teardown(); },
  step(dt, real){ frame(dt, real); },
  input(ev){ return input(ev); },
  lockLook(){ return FS.lockLook || playing(); }
});
// Half time, full time and the skip under its card are not play (P2-A, MF-2): the pointer let go there pauses nothing.
// Their cards need the pointer (they let it go themselves), and their own timers (the half-time card's 60 s, the walk
// off, the skip) run on, so the card's button is always a way out and nothing waits on a click that cannot come
// (world.js reads the flag when the pointer lock changes). The let-go a card asked for itself pauses nothing either,
// whenever the browser's answer comes (it can come after the card has gone: frames stepped in one go)
Object.defineProperty(MATCH_MODE.flags, "pauseOnUnlock", {enumerable: true, configurable: true, get: () => !offPlay() && !FS.exitAsked});
// the day's states that are not play: a card is up or about to be, or the skip runs under its card
const offPlay = () => FS.state === "halftime" || FS.state === "fulltime" || FS.state === "leaving" || FS.state === "lateRun" || !!FS.skipping;
// a card up that wants the mouse: half time and full time (the bench skip's card does not: you watch it)
const mouseCard = () => FS.state === "halftime" && !!FS.htCard || FS.state === "fulltime" && !!FS.ftCard || FS.state === "leaving";

// the keys of 1.6 have their browser defaults stopped while a match is on, and a key with Ctrl, Alt or Meta held does
// nothing (D9). Captured before world.js sees the event; the right button, the wheel and the context menu too
const KEYSET = new Set(KEYS.concat([" "]));
function capture(e){
  const md = mode();
  // first-person training has the same plain keys (1.6): a key with a modifier held is nobody's action there either
  if (md === "train" && (e.type === "keydown" || e.type === "keyup")){ MOD.on = modKey(e); return; }
  if (md !== "match") return;
  // a card that wants the mouse (half time, full time): the page's own keys and wheel work on it (Tab between its
  // buttons, Enter on one, the wheel scrolls a long card), and nothing reaches the match (MF-4)
  if (mouseCard()){
    if (e.type === "contextmenu") e.preventDefault();
    if (e.type === "keydown" || e.type === "keyup"){ MOD.on = false; if (FS.tabHeld){ FS.tabHeld = false; hudTab(false); } }
    return;
  }
  if (e.type === "keydown" || e.type === "keyup"){
    const k = (e.key || "").toLowerCase();
    if (KEYSET.has(k) || k === "tab") e.preventDefault();
    // (a key with a modifier held: only its default is stopped; control.js ignores it while MOD.on. In full screen with
    // the keyboard locked Ctrl is the shield key, core/keylock.js: a press made with it held is yours, P2b-B)
    MOD.on = false;
    if (e.altKey || e.metaKey || (e.ctrlKey && !ctrlShields())) return void (MOD.on = true);
    // (Tab held through the warm-up finishes it instead of opening the overview)
    if (e.type === "keydown" && k === "tab" && !e.repeat){ FS.tabHeld = true; hudTab(!(warmDriving() && !FS.onPitch)); }
    if (e.type === "keyup" && k === "tab"){ FS.tabHeld = false; hudTab(false); }
    return;
  }
  if (e.type === "contextmenu"){ e.preventDefault(); return; }
  // (the wheel itself reaches the match through world.js's own listener and the router: only its default stops here)
  if (e.type === "wheel"){ e.preventDefault(); return; }
  // the right button (world.js routes only the left one)
  if ((e.type === "mousedown" || e.type === "mouseup") && e.button === 2){
    e.preventDefault();
    if (document.pointerLockElement) routeOwn({type: e.type === "mousedown" ? "down" : "up", button: 2});
  }
}
if (typeof addEventListener === "function"){
  for (const t of ["keydown", "keyup", "contextmenu", "mousedown", "mouseup"]) addEventListener(t, capture, true);
  addEventListener("wheel", capture, {capture: true, passive: false});
  // the window lost the keyboard (Alt+Tab): the key-ups never come; control.js lets go of its keys, and here E and Tab
  addEventListener("blur", () => { MOD.on = false; FS.eDown = false; FS.eHeld = 0; if (FS.tabHeld || FS.state){ FS.tabHeld = false; hudTab(false); } });
}
function routeOwn(ev){ if (mode() === "match") input(ev); }

/* ---------- entering (3.4.1) ----------
   f: the fixture, or "test:<name>" (a fixture of the tests: no career calendar, straight onto the pitch) */
export const FP = {
  get state(){ return FS.state; }, get ms(){ return FS.ms; }, get V(){ return FS.V; },
  get ffRate(){ return FS.ffRate; }, set ffRate(v){ FS.ffRate = DAY.FF.includes(+v) ? +v : 1; },
  get timeScale(){ return FS.timeScale; },
  // a match left half played being played out after a load (recoverCheck): in progress, with FP.state null
  get recovering(){ return RECOVER.busy; },
  enter(f, o = {}){ return enter(f, o); },
  exit(){ abort(); },
  skipToCall(){ startSkip("call"); }, skipToEnd(){ startSkip("end"); },
  checkpointNow(){ return writeCheckpoint(true); },
  // A1.5: the world in slow motion for `seconds` of real time at `scale` (fixed steps, fewer of them a real second)
  slowMo(scale = .35, seconds = 1.2){ FS.slow = {scale: clamp(scale, .05, 1), t: seconds}; FS.timeScale = FS.slow.scale; }
};
window.FP = FP;

function enter(f, o){
  if (FS.state) return false;
  if (typeof f === "string" && f.startsWith("test:")) return enterTest(f.slice(5), o);
  if (!HOST || !f) return false;
  FS.real = true; FS.test = null; FS.f = f; FS.done = false; FS.R = null;
  const ko = HOST.kickoff(f), now = HOST.now(), trav = HOST.travel(f);
  const arrive = now + trav;
  const late = arrive > ko - DAY.LATE;
  FS.lateMin = Math.max(0, arrive - ko);
  FS.state = "travel";
  enterMode("match");
  coverScreen();
  controlReset();
  // the line-up, the role (late: the bench, and the manager remembers), no score decided (matchSetup)
  FS.M = HOST.setup(f, {late});
  const where = HOST.place(f);
  HOST.timeLapse(trav, `${where.to}`, () => arrived(), {ride: {from: where.from, to: where.to, mins: trav}});
  return true;
}
// at the ground: the stadium built behind the card, the match created, the bodies made, the first checkpoint saved
function arrived(){
  const f = FS.f, M = FS.M;
  const stad = M.stad || {tier: 2, crowd: 20000, cap: 28000};
  // two kits that read apart (U11, kitclash.js): the away side changes to its alternate, or a generated kit, and the
  // keepers and the referee take colours clear of both; the side's kit as resolved is the one the match records
  const kits = matchKits(M.home ? {home: M.myKit, away: M.oppKit} : {home: M.oppKit, away: M.myKit});
  if (M.home) M.oppKit = kits.away; else M.myKit = kits.away;
  const clubs = {home: M.home ? M.nameUs : M.nameThem, away: M.home ? M.nameThem : M.nameUs};
  build({tier: stad.tier, crowd: stad.crowd, cap: stad.cap, kits, clubs, at: "dressing", homeShare: M.home ? .8 : .2});
  const cfg = matchConfig(f, M, {benchSide: -1, visible: visibleFn, scaleOf: heightOf});
  cfg.htAuto = false;
  startMatch(cfg, kits);
  // arriving after kick-off: the minutes gone by are played out headless behind the card, then the bench (3.4.1)
  if (FS.lateMin > 0){
    FS.state = "lateRun";
    // (the minutes of the day since the kick-off as match time: the first half, the 15 minutes of the interval, then
    // the second half; an away arrival can be most of an hour late)
    const L = FS.lateMin, until = Math.min(5400 - 60, 60*(L <= 45 ? L : L <= 60 ? 45 : L - 15));
    showSkip(`You're late. The game kicked off ${FS.lateMin} minutes ago.`);
    FS.skipping = {until, kind: "late"};
    return;
  }
  dressing();
}
// a match's kits from the two sides' own (USER-ISSUES U11): {home, away, gk: [home keeper, away keeper], ref, change}
function matchKits(k){
  const R = resolveKits(k);
  return {home: R.home, away: R.away, gk: R.gk, ref: R.ref, change: R.awayChange};
}
function build({tier, crowd, cap, kits, clubs, at, homeShare}){
  const L = window.__life;
  L.enterZone("stadium", at, {tier, crowd, cap, kits, clubs, homeShare, subs: 7, on: {
    ready: () => manager(), door: () => headOut(), bench: side => sitDown(side), leave: () => {},
    // (the seat is offered only to a substitute on his feet and not yet called: U4)
    benchOk: () => FS.state === "bench" && !FS.seated && !FS.called}});
  for (const k in CTRL.held) CTRL.held[k] = false;
  if (ME.fp) ME.fp.g.visible = false;
  if (ME.tp) ME.tp.g.visible = false;
}
function visibleFn(x, y, z){
  const cam = RT.cam; if (!cam) return false;
  return FS.frustum.containsPoint(_vp.set(x, y, z));
}
const _vp = new THREE.Vector3();
// the match itself: the simulation, its listeners, the bodies (prebuilt behind the cover), the camera, the HUD
function startMatch(cfg, kits){
  FS.cfg = cfg;
  // (your own look on your own body; a test fixture of a career wears it too, in the home kit its side plays in, so what
  // a test sees through your eyes is what a match shows: your first-person body under the eye)
  const meRec = recOfMe(cfg);
  const meLook = HOST ? HOST.look(kits && (FS.real && FS.M ? (FS.M.home ? kits.home : kits.away) : kits.home), meRec ? meRec.number : 9) : null;
  // your height (MV-10): the body you are drawn as is the one the simulation moves, so reach, headers and your eye agree
  if (meRec) meRec.scale = meLook && meLook.height ? +meLook.height : heightOf(meRec);
  FS.meScale = meRec && meRec.scale ? meRec.scale : 1;
  const ms = FS.ms = createMatch(cfg);
  FS.evq.length = 0; FS.acc = 0; FS.ffRate = 1; FS.ffAch = 1; FS.ffSteps = FS.ffReal = 0; FS.recvSeq = -1; FS.drawAcc = FS.viewDt = 0; FS.timeScale = 1; FS.slow = null; FS.skipResume = null; FS.ckT = -1e9; FS.goalT = -1; FS.replayQ = null;
  // (nothing of an earlier match carries over: a goal's replay, a checkpoint it owed, MF-8)
  clearMatchFlags();
  FS.prevState = null; FS.htCard = FS.ftCard = false; FS.freed = FS.exitAsked = false; relockWait(false); FS.lockUsed = !!document.pointerLockElement; FS.callT = 0; FS.autoWalk = false;
  // your change off the bench waits for you by the fourth official (MF-9, rules.js subStep): the controller says when you are there
  ms.meEntry = {at: false};
  FS.offs.push(on(ms, "*", ev => FS.evq.push(ev)));
  for (const k of ["bounce", "post", "bar", "net", "board"]) FS.offs.push(on(ms, k, d => ballSound(k, d)));
  if (FS.real) FS.offs.push(attach(ms, on));
  const V = FS.V = viewInit(ms, RT.scene, kits, {meLook, meFPLook: meLook});
  V.me = ms.me;
  recInit(ms, 20, 12, V);
  prebuildHumans(looksOf(ms, kits, meLook), {budgetMs: 4});
  camInit({me: () => liveMe(), view: () => FS.V, eye: eyeOf, speed: () => mySpeed(), top: () => myTop(), breath: () => myB(), accel: () => myAcc(),
    bench: () => FS.state === "bench" && FS.benchSeat ? FS.benchSeat : null, motion: () => SET.motion, fov: () => SET.fov,
    pose: (x, z, yaw, dt) => fpPoseNow(x, z, yaw, dt), clip: () => fpInClip(), after: () => afterCam()});
  const T = cfg.teams;
  hudInit({home: {short: T[0].short || "HOM", kit: (kits && kits.home) || ["#2c66b8", "#fff"]}, away: {short: T[1].short || "AWY", kit: (kits && kits.away) || ["#c8463a", "#fff"]},
    us: cfg.me ? cfg.me.team : 0});
  FS.offs.push(onSet(() => applySettings()));
  AUD.init(); AUD.volume(SET.volume);
  // the player's own legs off the pitch (FOOTBALL profile)
  const at = myAttrs();
  FS.ownPrm = moverParams({pace: at.pace, dribbling: at.dribbling, acceleration: at.acceleration, sprintSpeed: at.sprintSpeed}, "football", {});
  FS.ownSt = createStam({stamina: at.stamina || 50, energy: 100, fatigue: 0});
  FS.own = createMover({x: P.x, z: P.z, yaw: P.yaw});
  if (FS.real){ writeCheckpoint(true); }
  FS.lastMin = -1; FS.board = -1;
  FS.kits = kits;
  fourthInit(kits);
  // the team-mate you look at, lit with a soft red edge (U8)
  auraInit(RT.scene);
  // every call you make for the ball (R, U10): your hand goes up and comes down, and the HUD says what you shouted
  CTRL.callHook = how => handRaise(how);
  warmSetup();
}
// your record in a configuration (in the XI, or on the bench)
function recOfMe(cfg){
  for (const T of cfg.teams || []) for (const p of (T.players || []).concat(T.bench || [])) if (p && p.isMe) return p;
  return null;
}
/* The height a footballer's body is drawn at (MV-10): human.js scales a whole body by its look's height, and view.js
   matchLooks gives every player his look from his record's pid (a keeper's from the goalkeeper's looks, everyone
   else's from the footballers'), so the same seed here gives the same height, and the agent the simulation moves is
   as tall as the body you see (reach, headers, the capsules). seedHint: the seed view.js gives a record without a pid
   (its agent id plus one, a starting keeper 3 plus his side), known only for a starter before the match is made. */
function heightOf(rec, seedHint = null){
  if (!rec) return 1;
  const pid = +rec.pid;
  const seed = pid > 0 ? pid % 100000 : seedHint != null ? seedHint % 100000 : null;
  if (seed == null) return 1;
  try { const L = lookFor(rec.isGK ? "goalkeeper" : "footballer", seed, {sex: "m"}); return L && L.height ? +L.height : 1; }
  catch(e){ console.error(e); return 1; }
}
/* The flags a match moment leaves behind for later (MF-8): a goal waiting for its replay at the restart, the checkpoint
   owed for the kick-off after a goal or for a change. They are cleared when a match starts and ends and when the second
   half starts (a goal on the half-time whistle is never replayed at the second half's kick-off, nor one at full time
   in the next match). A reset of the match (P8-A) clears them too. */
export function clearMatchFlags(){ FS.goalEv = null; FS.ckGoal = null; FS.ckNow = null; }
function myAttrs(){
  const ms = FS.ms;
  const a = ms.me >= 0 ? ms.agents[ms.me] : ms.resumedMe != null ? ms.agents[ms.resumedMe] : null;
  if (a) return a.at;
  for (const t of [0, 1]) for (const p of ms.bench[t]) if (p.isMe) return p.at;
  return {pace: 50, dribbling: 50, stamina: 50};
}

/* ---------- the dressing room (3.4.1 step 4) ---------- */
function dressing(){
  FS.state = "dressing";
  const ms = FS.ms;
  // the team-mates on the benches round the walls (the starters; the subs too), each at his place, seated
  const seats = dressingSeats(), us = FS.cfg.me ? FS.cfg.me.team : 0;
  const pre = [];
  let i = 0;
  for (const a of ms.agents){ if (a.team === us && a.role === "player" && !a.isMe && i < seats.length){ pre[a.id] = Object.assign({mode: "sit", speed: 0}, seats[i++]); } }
  for (const a of ms.agents) if (a.team !== us || a.role !== "player") if (!pre[a.id]) pre[a.id] = {hide: true};
  viewPre(FS.V, pre);
  placeOwn(SPAWNS.dressing);
  P.yaw = Math.PI; P.pitch = 0;
  revealAfterFrames(2).then(() => liftCover());
  const role = roleOf();
  note(role === "sub" || role === "cameo" ? "The dressing room. Talk to the manager, then head out to the bench." : "The dressing room. Talk to the manager, then walk out through the tunnel door.");
}
function dressingSeats(){
  const out = [];
  for (let i = 0; i < 7; i++){ out.push({x: -9 + .6, z: -76.8 + i*1.5, yaw: -Math.PI/2}); out.push({x: 9 - .6, z: -76.8 + i*1.5, yaw: Math.PI/2}); }
  for (const x of [-7.6, -6.1, -4.6, -3.1, 3.1, 4.6, 6.1, 7.6]) out.push({x, z: -78 + .6, yaw: Math.PI});
  return out;
}
const roleOf = () => (FS.M && FS.M.role) || (FS.cfg && FS.cfg.me && FS.cfg.me.role) || "starter";
// the manager's word on your role (3.4.1)
const MANAGER = {
  starter: "You're starting. Play your game and stay in your shape.",
  rotation: "You're starting, but I'll probably bring you off in the second half. Give me everything until then.",
  sub: "You're on the bench. Stay warm. I'll need you later.",
  cameo: "You're on the bench today. If I call you, make it count."
};
function manager(){ if (FS.state !== "dressing") return; note(`Manager: "${MANAGER[roleOf()] || MANAGER.starter}"`); FS.talked = true; }
// E at the door: time passes to kick-off minus 5, then the walk-out
function headOut(){
  if (FS.state !== "dressing") return;
  const ko = HOST ? HOST.kickoff(FS.f) : 0, now = HOST ? HOST.now() : 0, to = ko - DAY.HEAD_OUT;
  coverScreen();
  if (FS.real && now < to) pass(to - now, "idle");
  walkout();
}

/* ---------- the walk-out (3.4.1 step 5) ----------
   Both sides line up in the corridor behind the referee and the ball and walk out at 1.4 m/s; out of the tunnel each
   body goes on to the spot the simulation keeps it on for the kick-off, and is handed back to the simulation there
   (it is already standing on it: nothing moves). You walk out with them and go to your place yourself. */
function walkout(){
  FS.state = "walkout";
  const ms = FS.ms, C = DAY.CORRIDOR;
  const order = [];
  const ref = ms.agents.find(a => a.role === "referee");
  if (ref) order.push([ref, 0]);
  for (const t of [0, 1]){
    const list = ms.agents.filter(a => a.team === t && a.role === "player" && a.onPitch && !a.isMe);
    list.sort((a, b) => (b.isGK ? 1 : 0) - (a.isGK ? 1 : 0) || a.number - b.number);
    list.forEach((a, i) => order.push([a, t === 0 ? -C.x : C.x, i]));
  }
  for (const a of ms.agents) if (a.role === "ar") order.push([a, a.id === 23 ? -C.x : C.x, 11]);
  const W = FS.walkers = [];
  const pre = [];
  for (const [a, lane, i] of order){
    const z = a.role === "referee" ? C.zFront + 1.2 : C.zFront - (i || 0)*C.gap;
    const m = createMover({x: lane, z, yaw: 0});
    const prm = moverParams({pace: a.at.pace, dribbling: a.at.dribbling, acceleration: a.at.acceleration, sprintSpeed: a.at.sprintSpeed}, "football", {});
    const w = {a, m, prm, lane, stage: a.role === "referee" ? "ball" : "corridor", done: false, it: {dx: 0, dz: 0, gait: "walk", face: null, strafe: false, speedCap: DAY.WALK_V}};
    W.push(w);
    pre[a.id] = {x: m.x, z: m.z, yaw: 0, speed: 0};
  }
  for (const a of ms.agents) if (!pre[a.id]) pre[a.id] = {hide: !(a.isMe)};
  viewPre(FS.V, pre);
  FS.V.ballAt = {x: 0, y: 1.0, z: C.zFront + 1.5};
  // you: at the back of your side's line
  const us = FS.cfg.me ? FS.cfg.me.team : 0, myLine = W.filter(w => w.a.team === us).length;
  placeOwn({x: us === 0 ? -C.x : C.x, z: C.zFront - myLine*C.gap - .4, yaw: Math.PI});
  P.yaw = Math.PI; P.pitch = 0;
  FS.koT = 0; FS.ready = false; FS.nagT = 0; FS.lineOut = false;
  const sub = !onTheTeamSheet();
  if (sub) note("Walk out with the substitutes and take your seat on the bench.");
  else note("Walk out with the team and go to your position. Press E when you're ready.");
  revealAfterFrames(2).then(() => liftCover());
}
const onTheTeamSheet = () => !!FS.ms && FS.ms.me >= 0;
function walkStep(dt){
  const W = FS.walkers; if (!W) return true;
  const pre = FS.V.pre;
  let all = true;
  for (const w of W){
    if (w.done) continue;
    all = false;
    const a = w.a, m = w.m, it = w.it, C = DAY.CORRIDOR;
    let tx, tz, gait = "walk", cap = DAY.WALK_V;
    if (w.stage === "corridor" || w.stage === "ball"){
      tx = w.lane; tz = C.mouth;
      if (m.z >= C.mouth - .3) w.stage = w.stage === "ball" ? "toBall" : "spot";
    }
    if (w.stage === "toBall"){ tx = 0; tz = -.6; gait = "jog"; cap = 3.2; if (Math.hypot(m.x - tx, m.z - tz) < .3){ w.stage = "spot"; FS.V.ballAt = null; } }
    if (w.stage === "spot"){ tx = a.m.x; tz = a.m.z; gait = "jog"; cap = Infinity; FS.lineOut = true; }
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (w.stage === "spot" && d < .06){
      // on his spot: the simulation's body stands exactly here; the view draws it from now on
      w.done = true; pre[a.id] = null;
      continue;
    }
    it.dx = d > 1e-6 ? dx/d : 0; it.dz = d > 1e-6 ? dz/d : 0; it.gait = gait;
    it.speedCap = Math.min(cap, Math.sqrt(2*6*Math.max(0, d)) + .05);
    it.face = w.stage === "spot" && d < 1.2 ? dirOf(a.m.yaw) : null;
    moverStep(m, it, w.prm, null, dt, null);
    if (w.stage === "ball" && FS.V.ballAt){ FS.V.ballAt.x = m.x; FS.V.ballAt.z = m.z - .35; FS.V.ballAt.y = 1.0; }
    const q = pre[a.id] || (pre[a.id] = {});
    q.x = m.x; q.z = m.z; q.yaw = m.yaw; q.speed = m.speed; q.hide = false;
  }
  return all;
}
// the kick-off may start (1.5.5): everyone set, and you in your own half outside the centre circle (at the ball if
// you take it), or E (Ready), or 25 s after the line reached the pitch with you in your half. The referee waits
// rather than moving anyone; after 15 s in the wrong half he says so
function koGate(dt){
  const ms = FS.ms, me = ms.me >= 0 ? ms.agents[ms.me] : null;
  if (FS.lineOut) FS.koT += dt;
  if (!walkersDone()) return false;
  if (!me) return true;                                       // on the bench: nobody waits for you
  const dir = ms.dirs[me.team], own = P.x*dir <= .3, R0 = ms.restart, taker = !!R0 && R0.taker === me.id;
  if (Math.abs(P.z) > ms.spec.hz + .5 || Math.abs(P.x) > ms.spec.hx + .5) return false;   // still off the pitch
  // the kick-off's taker at the ball; otherwise the rules below hold for him too, and once play starts the kick-off
  // waits for him as any kick-off does ("Take it." at 12 s, a team-mate takes it at 25 s, rules.js, MF-3)
  if (taker && Math.hypot(P.x - ms.ball.p.x, P.z - ms.ball.p.z) < 1.6 && (FS.ready || FS.koT > DAY.KO_WAIT)) return true;
  const inCircle = Math.hypot(P.x, P.z) < DAY.CIRCLE;
  if (own && !inCircle && (FS.ready || FS.koT > 3)) return true;
  if (own && FS.koT > DAY.KO_WAIT) return true;
  if (!own){ FS.nagT += dt; if (FS.nagT > DAY.KO_HALF_NAG){ FS.nagT = -999; hudNotice("info", "Get back into your half."); } }
  return false;
}
const walkersDone = () => !FS.walkers || FS.walkers.every(w => w.done);
// you hand over to your agent where you stand (no jump: the agent takes your place)
function handover(){
  const ms = FS.ms, me = ms.agents[ms.me], o = FS.own;
  if (!me) return;
  me.m.x = me.x0 = P.x; me.m.z = me.z0 = P.z;
  me.m.vx = o ? o.vx : 0; me.m.vz = o ? o.vz : 0; me.m.speed = o ? o.speed : 0;
  me.m.yaw = me.m.heading = P.yaw; me.y = 0;
  ms.cutStep = ms.step;
  FS.onPitch = true;
  if (FS.V){ FS.V.me = ms.me; const pre = FS.V.pre; if (pre) pre[me.id] = null; }
}

/* ---------- each frame ---------- */
function frame(dt, real){
  if (!FS.ms || !FS.V) return;
  FS.realT += real;
  const ms = FS.ms;
  if (FS.slow){ FS.slow.t -= real; if (FS.slow.t <= 0){ FS.slow = null; FS.timeScale = 1; } }
  switch (FS.state){
    case "travel": return;
    case "lateRun": skipFrame(); return;
    case "dressing":
      if (FS.real) pass(real*.5, "idle");
      ownWalk(dt, true);
      // past kick-off minus 2 the manager sends everyone out
      if (FS.real && HOST && HOST.now() >= HOST.kickoff(FS.f) - 2) headOut();
      break;
    case "walkout": {
      ownWalk(dt, true);
      walkStep(dt);
      if (onTheTeamSheet()){
        viewRing(FS.V, mySpot());
        if (koGate(dt)){ viewRing(FS.V, null); handover(); FS.state = "live"; FS.V.pre = null; }
      } else if (walkersDone()){
        // a substitute: play starts without you; walk to the bench
        FS.state = "bench"; FS.V.pre = null; unseat();
      }
      break;
    }
    case "live": case "kickoff": live(dt, real); break;
    case "bench": case "entering": bench(dt, real); break;
    case "halftime": halftime(dt, real); break;
    case "fulltime": fulltime(dt, real); break;
  }
  if (FS.state === "leaving" || !FS.ms) return;
  events();
  acrobatics();
  feel();
  if (playing()) replayStep(real);
  // watching from the bench above 1x (3.4.2): the steps take the frame, so the picture is drawn at 30 Hz (the frames
  // between are not drawn: world.js FLAGS.skipDraw) and the bodies are posed only for the frames that are
  FS.viewDt += dt;
  if (thinned()){
    FS.drawAcc += real;
    if (FS.drawAcc < DAY.FF_DRAW - .004){ FLAGS.skipDraw = true; FS.thinN = (FS.thinN || 0) + 1; hud(dt); return; }
    FS.drawAcc = Math.min(DAY.FF_DRAW, FS.drawAcc - DAY.FF_DRAW);
  } else FS.drawAcc = 0;
  // the bodies, the ball, the crowd and the board
  const alpha = clamp(FS.acc/H, 0, 1);
  viewFrame(FS.V, ms, alpha, FS.viewDt, RT.cam);
  FS.viewDtLast = FS.viewDt; FS.viewDt = 0;
  place();
  hud(dt);
}
const thinned = () => FS.ffRate > 1 && !FS.onPitch && !FS.skipping && (FS.state === "bench" || FS.state === "entering") && !playing();
const liveMe = () => { const ms = FS.ms; return ms && ms.me >= 0 && FS.onPitch ? ms.agents[ms.me] : null; };
function mySpot(){ const ms = FS.ms, me = ms.agents[ms.me]; return me ? {x: me.m.x, z: me.m.z} : null; }

// your own walk (off the pitch, before the hand-over, on the bench): W A S D through the FOOTBALL mover, the walls
// having their say (collide.js moveBy), Shift to run, X to walk
const OWN_IT = {dx: 0, dz: 0, gait: "jog", face: null, strafe: false, speedCap: Infinity}, OWN_FACE = {x: 0, z: 0};
function ownWalk(dt, walls){
  const m = FS.own; if (!m) return;
  const f = (CTRL.held.w ? 1 : 0) - (CTRL.held.s ? 1 : 0), r = (CTRL.held.d ? 1 : 0) - (CTRL.held.a ? 1 : 0), len = Math.hypot(f, r);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  OWN_IT.dx = len ? (r*cos - f*sin)/len : 0; OWN_IT.dz = len ? (-r*sin - f*cos)/len : 0;
  OWN_IT.gait = CTRL.walk ? "walk" : CTRL.held.shift ? "sprint" : FS.state === "dressing" ? "walk" : "jog";
  OWN_FACE.x = -sin; OWN_FACE.z = -cos; OWN_IT.face = OWN_FACE; OWN_IT.strafe = false; OWN_IT.speedCap = Infinity;
  if (m.x !== P.x || m.z !== P.z){ m.x = P.x; m.z = P.z; }
  const fac = stamFactors(FS.ownSt, 1, FS.ownFac);
  // the warm-up runs your legs while it has you (to the strip, the strides, the shuffles, a few steps to a spot)
  const wi = FS.onPitch ? null : warmIntent() || entryWalk(dt);
  // not on yet (the bench, the warm-up, the walk to the fourth official): the touchline is a fence (U3); you walk
  // along it, never onto the pitch, until you are subbed on. (Taken off, sent off or hurt, you are on the pitch as you
  // become a spectator: you walk off it freely, and once off it the fence holds you there)
  const fenced = !!(FS.ms && !FS.onPitch && (FS.state === "bench" || FS.state === "entering")), outside = fenced && !inFence(m, FS.ms.spec);
  moverStep(m, wi || OWN_IT, FS.ownPrm, fac, dt, walls ? ownCollide : null);
  if (outside){
    const x0 = m.x;
    if (touchFence(m, FS.ms.spec)){ if (m.x !== x0) m.vx = 0; else m.vz = 0; }
  }
  stamStep(FS.ownSt, dt, effortOf(m.gait, m.speed, FS.ownPrm.run), {stamina: 50, eF: 1});
  P.x = m.x; P.z = m.z; P.vx = m.vx; P.vz = m.vz; P.speed = m.speed;
  // (your eye at your height in this match, the same before and after the hand-over to your agent, MV-10)
  P.feet = 0; P.eye = CAM.EYE*(FS.meScale || 1);
}
// called and not going (MF-9): your legs take you to the fourth official, out of the dugout's mouth first and then
// along the touchline, at a jog; your view turns the way you go
// (its facing filled in place every frame, as the record itself is: no garbage on the hot path, DESIGN 3.9.6)
const ENTRY_IT = {dx: 0, dz: 0, gait: "jog", face: {x: 0, z: 0}, strafe: false, speedCap: Infinity};
function entryWalk(dt){
  if (!FS.autoWalk || FS.state !== "entering" || FS.atFourth || FS.seated) return null;
  const e = entrySpot();
  let tx = e.x, tz = e.z;
  if (P.z < e.z - 1 && Math.abs(P.x - e.x) > 1.5){ tx = P.x; tz = e.z - .3; }
  const dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
  ENTRY_IT.dx = d > 1e-6 ? dx/d : 0; ENTRY_IT.dz = d > 1e-6 ? dz/d : 0;
  ENTRY_IT.speedCap = Math.min(4, Math.sqrt(2*5*Math.max(0, Math.hypot(e.x - P.x, e.z - P.z))) + .05);
  ENTRY_IT.face.x = ENTRY_IT.dx; ENTRY_IT.face.z = ENTRY_IT.dz;
  if (d > .05) P.yaw = wrapA(P.yaw + wrapA(yawOf(dx, dz) - P.yaw)*(1 - Math.exp(-4*dt)));
  return ENTRY_IT;
}
const OCR = {dx: 0, dz: 0};
function ownCollide(m, dx, dz){ P.x = m.x; P.z = m.z; moveBy(dx, dz); OCR.dx = P.x - m.x; OCR.dz = P.z - m.z; return OCR; }
function placeOwn(p){
  P.x = p.x; P.z = p.z; P.feet = 0; P.eye = CAM.EYE*(FS.meScale || 1); P.vx = P.vz = 0; P.speed = 0;
  if (FS.own){ FS.own.x = p.x; FS.own.z = p.z; FS.own.vx = FS.own.vz = FS.own.speed = 0; FS.own.yaw = FS.own.heading = p.yaw || 0; }
  findInside();
}

/* ---------- live play ---------- */
function live(dt, real){
  const ms = FS.ms;
  // the world's time-scale (A1.5 slow motion) and the bench's fast-forward: the same 60 Hz steps, more or fewer of
  // them a real second; at most 4 a frame (the world slows rather than spirals)
  bigChance(ms);
  const scale = FS.timeScale*(FS.onPitch ? 1 : FS.ffRate);
  // the goal replay holds the steps only while it plays: its end clears the queue here, in the frame, not in the
  // promise's callback (a callback waits for the task to end, so frames stepped in one go would never see it)
  if (FS.replayQ && !playing()) FS.replayQ = null;
  if (!playing() && !FS.replayQ){
    FS.acc += Math.max(0, real)*scale;
    let n = 0;
    const max = DAY.MAX_STEPS;
    while (FS.acc >= H && n < max && ms.phase !== "over"){
      oneStep();
      FS.acc -= H; n++;
      if (FS.state !== "live" && FS.state !== "bench" && FS.state !== "entering") break;
    }
    if (n >= max && FS.acc > H) FS.acc = H*.999;
    FS.stepsLast = n;
    // the rate the bench actually watches at (the HUD shows it): match time over real time, over half a second
    FS.ffSteps += n; FS.ffReal += Math.max(0, real);
    if (FS.ffReal >= .5){ FS.ffAch = FS.ffSteps*H/FS.ffReal/Math.max(1e-6, FS.timeScale); FS.ffSteps = 0; FS.ffReal = 0; }
  }
  // your eye rides your agent between its last two steps
  mirror();
  scanStep(dt);
  // the warm-up's boost comes off when its minutes are up (A1.8)
  warmBoostStep();
  // the phase of the match
  if (ms.phase === "halftime" && FS.state === "live") startHalftime();
  else if ((ms.phase === "fulltime" || ms.phase === "over") && FS.state === "live") startFulltime();
  // off the pitch (substituted, sent off, hurt): your own legs again, to the bench
  const me = ms.me >= 0 ? ms.agents[ms.me] : null;
  if (FS.onPitch && me && !me.onPitch){ FS.onPitch = false; FS.state = "bench"; unseat(); note(me.sentOff ? "You've been sent off. Walk to the tunnel." : "Your match is over. Take a seat on the bench."); placeOwn({x: P.x, z: P.z, yaw: P.yaw}); }
  maybeCheckpoint();
  replayDue();
}
// a big chance (A1.7): while you wind up a shot from where the chance is at least DAY.BIG_XG, the world eases to
// DAY.BIG_SCALE (the same fixed steps, fewer of them a real second: never a pause); let go, it comes back at once.
// A slow motion of something else (an acrobatic strike, a hit-stop) is left alone
function bigChance(ms){
  const me = liveMe();
  if (!windingShot(ms, me) || (FS.slow && !FS.slow.big)) return;
  if (xgAt(ms, me.team, ms.ball.p.x, ms.ball.p.z) < DAY.BIG_XG) return;
  FS.slow = {scale: DAY.BIG_SCALE, t: DAY.BIG_OUT, big: true}; FS.timeScale = DAY.BIG_SCALE;
}
// your contact (A1.7): the kick heard by how cleanly it was struck, and a moment of hit-stop for a clean strike at goal
// or into the box
// (a longer slow motion already running, an acrobatic strike's, A1.5, is left alone: the hit-stop would cut it short at
// the very contact it is there for)
function contactFeel(ev){
  const h = hitStopOf(ev);
  if (!h || (FS.slow && !FS.slow.big && FS.slow.t > h[2])) return;
  FP.slowMo(h[1], h[2]);
}
// one fixed step: your input first (before the AI, 3.2.1), then the simulation, the record for the replays
function oneStep(){
  const ms = FS.ms;
  viewPreStep(FS.V, ms);
  const me = ms.me >= 0 && FS.onPitch ? ms.agents[ms.me] : null;
  if (me) controlStep(ms, me, H, {traits: FS.cfg.me ? FS.cfg.me.traits : {}});
  else CTRL.queue.length = 0;
  simStep(ms, H);
  // (nothing is recorded for the replays while the match is played headless: nobody is watching it)
  if (!FS.headless) rec(ms);
  if (FS.testDriver) FS.testDriver();
}
const _mv = {x: 0, z: 0};
function mirror(){
  const ms = FS.ms, me = liveMe();
  if (!me) return;
  const a = clamp(FS.acc/H, 0, 1);
  P.x = me.x0 + (me.m.x - me.x0)*a; P.z = me.z0 + (me.m.z - me.z0)*a;
  P.vx = me.m.vx; P.vz = me.m.vz; P.speed = me.m.speed;
  P.feet = me.y || 0; P.eye = CAM.EYE*(me.scale || 1) + (me.y || 0);
  void ms; void _mv;
}
function eyeOf(out){
  out.x = P.x; out.z = P.z;
  out.y = FS.state === "bench" && FS.seated ? CAM.BENCH_EYE : P.eye;
  if (!FS.onPitch && !FS.seated){
    // off the seat the view rises to your standing eye (A1.8); a set that bends you (a lunge) takes the eye with your neck
    if (FS.riseT >= 0){ const k = clamp(FS.riseT/WU.RISE, 0, 1), e = k*k*(3 - 2*k); out.y = CAM.BENCH_EYE + (P.eye - CAM.BENCH_EYE)*e; }
    const E = warmEye();
    if (E.w > 0){ out.x += E.x; out.y += E.y; out.z += E.z; }
  }
  return out;
}
function mySpeed(){ const me = liveMe(); return me ? me.m.speed : FS.own ? FS.own.speed : 0; }
function myTop(){ const me = liveMe(); return me ? me.prm.sprint : FS.ownPrm ? FS.ownPrm.sprint : 8; }
function myB(){ const me = liveMe(); return me ? me.st.B : FS.ownSt ? FS.ownSt.B : 100; }
function myAcc(){ const me = liveMe(); return me ? me.m.acc || 0 : FS.own ? FS.own.acc || 0 : 0; }
function fpPoseNow(x, z, yaw, dt){
  const V = FS.V; if (!V || !V.fp) return 0;
  V.fpOn = !(FS.state === "bench" && FS.seated) && !playing();
  // the warm-up poses you through its set (the body where you stand, not where the eye has gone with the neck)
  if (V.fpOn && !FS.onPitch && !V.src && !V.hideAll){ const m = warmPose(V.fp, P.x, P.z, yaw, dt); if (m != null) return m; }
  return fpPose(V, x, z, yaw, dt, {speed: mySpeed(), wind: CTRL.wind});
}
function fpInClip(){ const V = FS.V, ms = FS.ms; if (!V || !ms || ms.me < 0) return false; const R = V.rec[ms.me]; return !!(R && R.clip); }
// after the camera is placed: the frustum (the spare balls come back to their cones unseen), the listener
function afterCam(){
  const cam = RT.cam;
  cam.updateMatrixWorld();
  FS.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  FS.frustum.setFromProjectionMatrix(FS.pm);
}

/* ---------- the events of the match: notices, sounds, the crowd, the view ---------- */
function events(){
  const ms = FS.ms, q = FS.evq;
  if (!q.length) return;
  const me = ms.me;
  for (let i = 0; i < q.length; i++){
    const ev = q[i];
    if (FS.V) viewEvent(FS.V, ev);
    // what changes the day happens whatever is drawn: you coming on
    if (ev.kind === "sub" && ev.in === ms.me && ms.me >= 0 && !FS.onPitch && FS.state !== "lateRun") onCameOn();
    if (FS.headless) continue;
    const name = id => { const a = ms.agents[id]; return a ? a.name : ""; };
    const at = ev.x != null ? {x: ev.x, y: .5, z: ev.z} : null;
    switch (ev.kind){
      case "goal":
        if (ev.disallowed){ hudNotice("offside", "No goal", "The flag was up for offside."); AUD.cue("crowdGroan", null, .8); break; }
        FS.goalT = ms.t; FS.goalEv = ev; FS.ckGoal = true; FS.replayQ = null; FS.replayAt = ms.t;
        hudNotice("goal", ev.ownGoal ? "Own goal" : "Goal!", `${ev.ownGoal ? name(ev.agent) || "" : name(ev.scorer)} ${minuteOf(ms)}'`);
        AUD.cue("crowdRoar", null, 1); AUD.cue("net", at, 1);
        if (STADIUM.crowd) STADIUM.crowd.goal(ev.x < 0 ? -1 : 1);
        if (ev.scorer === me){ camTrauma(.35); }
        if (me >= 0) warmGoal(ev, me);
        break;
      case "offside": {
        const m = (+ev.margin || 0).toFixed(1);
        if (ev.agent === me) hudNotice("offside", "Offside", `You were ${m} m past the last defender when ${ev.passerName || name(ev.passer)} played it.`);
        else hudNotice("offside", "Offside", `${name(ev.agent)} was ${m} m past the last defender.`);
        break;
      }
      case "flag": AUD.cue("whistleShort", null, .25); break;
      case "whistle":
        AUD.cue(ev.why === "ft" ? "whistleTriple" : ev.why === "ht" || ev.why === "ko" ? "whistleLong" : "whistleShort", null, .9);
        if (ev.why === "ht") hudNotice("whistle", "Half time");
        if (ev.why === "ft") hudNotice("whistle", "Full time");
        break;
      case "card":
        if (ev.agent === me) hudNotice(ev.color === "red" ? "red" : "card", ev.color === "red" ? "Red card" : "Yellow card", ev.color === "red" ? "You're off." : "Careful now.");
        else hudNotice(ev.color === "red" ? "red" : "card", ev.color === "red" ? "Red card" : "Booked", name(ev.agent));
        break;
      case "sub":
        hudNotice("sub", "Substitution", `${ev.inName || name(ev.in)} on, ${ev.outName || name(ev.out)} off`);
        if (FS.real) FS.ckNow = true;
        break;
      case "added": hudNotice("info", `${ev.mins} added minute${ev.mins === 1 ? "" : "s"}`); break;
      // a restart that is yours and waits on you (rules.js restartStep, MF-3): the referee's word at 12 s; at 25 s a
      // team-mate takes it
      case "nudge":
        if (ev.agent === me && ev.what === "take") hudNotice("info", "Take it.");
        else if (ev.agent === me && ev.what === "handed") hudNotice("info", `${name(ev.to)} takes it instead.`);
        break;
      case "call": {
        const a = ms.agents[ev.agent];
        if (a && me >= 0 && a.team === ms.agents[me].team && a.id !== me && (ev.to == null || ev.to === me)){ hudCall(a.id, a.name); AUD.call(a.name, {x: a.m.x, y: 1.7, z: a.m.z}, a.id); }
        break;
      }
      case "situation": hudScenario(ev.line); break;
      case "kick": {
        const sp = +ev.speed || 0;
        // (your own: a clean strike rings out, a scuff is dull, A1.7)
        const qk = ev.agent === me && ev.strike != null ? (ev.scuff ? .5 : .75 + .45*ev.strike) : 1;
        AUD.cue("kick", at, clamp((.3 + sp/30)*qk, .15, 1.3));
        if (ev.agent === me && me >= 0) contactFeel(ev);
        if (ev.agent === me && me >= 0){
          const shot = ev.intent === "shot" || ev.intent === "header" && ev.atGoal;
          camAction(ev.intent === "header" ? "header" : shot || sp > 18 ? "strike" : "pass");
          if (shot) camTrauma(.18);
          if (ev.intent === "shot") CTRL.lastShotT = ms.t;
        }
        break;
      }
      case "save": AUD.cue("crowdOoh", null, .7); break;
      case "woodwork": AUD.cue("crowdOoh", null, .9); break;
      case "tackle":
        if (ev.agent === me || ev.on === me){ camTrauma(ev.result === "foul" ? .3 : .2); if (ev.on === me && ev.result === "foul") camAction("fouled"); }
        break;
      case "injury": if (ev.agent === me) hudNotice("red", "You're hurt", "You can't carry on."); break;
    }
  }
  q.length = 0;
}
function ballSound(k, d){
  if (FS.headless || !d) return;
  const pos = {x: d.x || 0, y: d.y || .2, z: d.z || 0};
  if (k === "bounce") AUD.cue("bounce", pos, clamp(Math.abs(d.vy || 3)/8, .15, 1));
  else if (k === "post" || k === "bar") AUD.cue("post", pos, 1);
  else if (k === "net") AUD.cue("net", pos, .8);
  else if (k === "board") AUD.cue("board", pos, .8);
}
// the crowd works itself up near the goals and after a goal; the scoreboard follows the score and the minute
function place(){
  const ms = FS.ms;
  const since = FS.goalT >= 0 ? ms.t - FS.goalT : 99, near = Math.max(0, (Math.abs(ms.ball.p.x) - 30)/22);
  // (a great set on the touchline gets the fans by the boards going for a moment, A1.8)
  FS.cheer = Math.max(0, (FS.cheer || 0) - (FS.viewDtLast || 0)*.35);
  STADIUM.excite(Math.min(1, .3 + .25*near + (since < 25 ? .7*Math.exp(-since/12) : 0) + .4*FS.cheer));
  const mm = minuteOf(ms), key = (ms.score[0]*1000 + ms.score[1])*1000 + mm;
  if (key !== FS.board){ FS.board = key; STADIUM.score({hs: ms.score[0], as: ms.score[1], min: mm}); }
}

/* ---------- acrobatics (A1.5): the world in slow motion and a third-person shot of it ----------
   An acrobatic strike the action resolver offered (a scissor kick, an overhead kick, a rabona: only with the trait)
   slows the world to a third of real time for a moment (FP.slowMo: the same fixed steps, fewer of them a real second,
   so the match stays the same match) and the cinematic owner frames it from the side, then hands back to your eyes */
function acrobatics(){
  const A0 = CTRL.acro, ms = FS.ms, me = liveMe();
  if (!A0 || !me || A0.shown) return;
  A0.shown = true;
  FP.slowMo(.33, 1.4);
  const side = dirOf(me.m.yaw), px = -side.z, pz = side.x;
  cineShot({dur: 1.4, frame: (dt, cam, k) => {
    const b = ms.ball.p, a = me.m, r = 4.2 - 1.2*k;
    cam.position.set(a.x + px*r - side.x*1.2, 1.3 + .4*k, a.z + pz*r - side.z*1.2);
    cam.lookAt((a.x + b.x)/2, Math.max(.6, (1.0 + b.y)/2), (a.z + b.z)/2);
  }, done: () => { if (FS.V) FS.V.fpOn = true; }});
  if (FS.V) FS.V.fpOn = false;
}
// what you hear of your own running (A1.2) and breathing (A1.3): the audio's feel channel when it has one
function feel(){
  if (!AUD.feel) return;
  const me = liveMe(), B = me ? me.st.B : 100;
  AUD.feel({wind: FX.wind, breath: clamp(1 - B/60, 0, 1), pulse: FX.topT > 0 ? FX.topT/.35 : 0, motion: SET.motion});
}

/* ---------- the HUD's frame ---------- */
const _pv = new THREE.Vector3();
function proj(x, y, z){
  _pv.set(x, y, z).project(RT.cam);
  // (the canvas's size as hud() read it once this frame: reading it here, for every point, forced a layout each time, perf-5)
  const w = HUDS.w || innerWidth, h = HUDS.h || innerHeight;
  // (one record, filled in place: the HUD uses each point before it asks for the next)
  PJ.x = (_pv.x + 1)/2*w; PJ.y = (1 - _pv.y)/2*h; PJ.on = _pv.z < 1 && Math.abs(_pv.x) <= 1 && Math.abs(_pv.y) <= 1; PJ.front = _pv.z < 1;
  return PJ;
}
const PJ = {x: 0, y: 0, on: false, front: false}, OFF = {pip: null, x: null};
const HUDS = {ms: null, me: null, ctrl: CTRL, dt: 0, B: 100, cap: 100, energy: 100, hints: null, proj, w: 0, h: 0, yaw: 0, cam: {x: 0, z: 0}, offPip: null,
  cards: 0, sweet: null, tick: null, glyph: "", ringAt: RING_T, offX: null, hold: null};
function hud(dt){
  const ms = FS.ms, me = liveMe();
  const cv = RT.renderer && RT.renderer.domElement;
  HUDS.w = cv ? cv.clientWidth : innerWidth; HUDS.h = cv ? cv.clientHeight : innerHeight;
  HUDS.yaw = P.yaw; HUDS.cam.x = RT.cam.position.x; HUDS.cam.z = RT.cam.position.z;
  const slow = (FS.lastHint -= dt) <= 0;
  if (slow) FS.lastHint = .1;
  // half time, full time and the skip under its card are not play: no hint of live play shows over them (MF-11), the
  // card says what there is to do
  if (offPlay()){
    HUDS.B = me ? me.st.B : FS.ownSt ? FS.ownSt.B : 100; HUDS.cap = me ? me.st.cap : FS.ownSt ? FS.ownSt.cap : 100;
    HUDS.offPip = null; HUDS.offX = null; HUDS.sweet = HUDS.tick = null; HUDS.glyph = ""; HUDS.hold = null; HUDS.hints = OH.none;
  } else if (me){
    HUDS.B = me.st.B; HUDS.cap = me.st.cap; HUDS.energy = me.energy; HUDS.cards = me.booked || 0; HUDS.red = !!me.sentOff;
    if (slow){ HUDS.hints = hintsFor(ms, me); HUDS.glyph = glyphFor(ms, me); offsideHud(ms, me, pipShown(), OFF); HUDS.offPip = OFF.pip; HUDS.offX = OFF.x; }
    sweetFor(ms, me);
    HUDS.hold = null;
  } else {
    HUDS.B = FS.ownSt ? FS.ownSt.B : 100; HUDS.cap = FS.ownSt ? FS.ownSt.cap : 100; HUDS.offPip = null; HUDS.offX = null; HUDS.sweet = HUDS.tick = null; HUDS.glyph = "";
    if (slow) HUDS.hints = warmHints() || offHints();
    // E held on the bench: the ring fills to the skip; Tab held through the warm-up fills it to the finish
    HUDS.hold = FS.eDown && FS.state === "bench" && FS.seated && !FS.skipping ? clamp(FS.eHeld/DAY.E_HOLD, 0, 1) : warmDrilling() && warmTab() > 0 ? clamp(warmTab(), 0, 1) : null;
  }
  // the warm-up's panel and guide (off the pitch), the Warm mark (A1.8)
  HUDS.warm = FS.onPitch ? null : warmHud();
  // called on and not there yet: the fourth official named over his head, the compass's arrow on him (U2)
  HUDS.goal = goingOn() ? FOURTH.goal : null;
  HUDS.warmIcon = warmIcon();
  hudShow(!playing() && FS.state !== "travel");
  hudFrame(ms, me, CTRL, dt, HUDS);
  // the receiver ring (1.5.10): under the pass's point while you hold the pass, or where a pass to you will be met
  let ring = null;
  if (me && CTRL.rmb && CTRL.target.point && CTRL.ctx !== "defend") ring = CTRL.target.point;
  else if (me && ms.kick && ms.kick.ev && ms.kick.ev.recv === me.id && ms.ball.state === "free" && ms.poss.ctl !== me.id && ms.t - ms.kick.t < 4) ring = recvPoint(ms, me);
  if (FS.V) viewRecv(FS.V, ring);
  // the team-mate under your look (U8): only while you play (not from the bench, not over a card or a replay)
  auraFrame(dt, RT.cam, FS.ms, FS.onPitch && !offPlay() && !playing() ? me : null, auraPos);
  // (the spot you stand on to go on, ringed on the grass while you are on your way; the walk-out's ring is the same one)
  if (FS.V && (FS.state === "bench" || FS.state === "entering")){
    const on = goingOn();
    if (on || FOURTH.ring){ FOURTH.ring = on; viewRing(FS.V, on ? entrySpot() : null); }
  }
}
// where a pass to you will be met: the first point on the ball's predicted path you can reach (ball.js firstReach, the
// AI's own reach), worked out once per kick; the pass's target when the prediction has none
function recvPoint(ms, me){
  if (FS.recvSeq !== ms.kick.seq){
    FS.recvSeq = ms.kick.seq;
    const r = ms.pred && ms.predN > 0 ? firstReach(ms.pred, ms.predN, me) : null, ev = ms.kick.ev;
    const at = FS.recvAt || (FS.recvAt = {x: 0, z: 0});
    if (r){ at.x = r.x; at.z = r.z; } else if (ev.tx != null){ at.x = ev.tx; at.z = ev.tz; } else { at.x = me.m.x; at.z = me.m.z; }
  }
  return FS.recvAt;
}
// the offside pip's setting (1.5.10): Auto shows it in a player's first 5 matches (and the tests), On always, Off never
const pipShown = () => SET.offsidePip === "on" || (SET.offsidePip === "auto" && (isTest() || !!(HOST && HOST.early && HOST.early())));
// the hints off the ball's play: on the bench, walking out, in the dressing room (the records kept, the verbs changed
// in place: written ten times a second at most)
const OH = {walkout: [{key: "W", verb: "go to your position"}, {key: "E", verb: "ready"}], walkSub: [{key: "W", verb: "walk to the bench"}],
  seated: [{key: "E", verb: ""}, {key: "1 2 3", verb: ""}], bench: [{key: "E", verb: "sit down"}, {key: "W", verb: "walk"}],
  entering: [{key: "W", verb: "walk to the fourth official at the halfway line"}], none: []};
function offHints(){
  const st = FS.state;
  if (st === "walkout") return onTheTeamSheet() ? OH.walkout : OH.walkSub;
  if (st === "bench" && FS.seated){
    OH.seated[0].verb = FS.called ? "stand up" : `tap to stand, hold to skip to ${FS.called || !callPlanned() ? "the end" : "your call"}`;
    // the speed asked for, and the one the machine manages when it falls short (3.4.2)
    const ach = Math.round(FS.ffAch*10)/10;
    // (above 1x the rate it really runs at is always said: the picture is drawn at 30 Hz there, 3.4.2)
    OH.seated[1].verb = FS.ffRate > 1 ? `${FS.ffRate}x speed, running at ${ach.toFixed(1)}x` : "1x speed";
    return OH.seated;
  }
  if (st === "bench") return OH.bench;
  if (st === "entering") return OH.entering;
  return OH.none;
}
// the action you can take now, as a tiny glyph by the crosshair (A1.4)
function glyphFor(ms, me){
  const R0 = ms.restart;
  if (R0 && !R0.taken && R0.taker === me.id) return restartReady(ms) ? (R0.kind === "throw" ? "RMB THROW" : "LMB / RMB") : "";
  const r = CTRL.resolve;
  if (r && r.kind === "header") return "SPACE HEAD";
  if (r && r.kind === "divingHeader") return "SPACE DIVE";
  if (r && r.kind !== "ground") return r.kind === "bicycle" ? "LMB OVERHEAD" : r.kind === "scissor" ? "LMB SCISSOR" : "LMB VOLLEY";
  if (ms.poss.ctl === me.id) return "";
  const c = ms.agents[ms.poss.ctl];
  if (c && c.team !== me.team && Math.hypot(c.m.x - me.m.x, c.m.z - me.m.z) < CN.TACKLE_D) return "LMB TACKLE";
  return "";
}
// the pass sweet zone and the shot's power tick for the target distance (A1.4)
const SWEET = {lo: 0, hi: 0};
function sweetFor(ms, me){
  const ch = CTRL.charge;
  HUDS.sweet = null; HUDS.tick = null;
  if (!ch) return;
  if (ch.kind === "pass" && CTRL.target.point){
    const tp = CTRL.target.point, d = Math.hypot(tp.x - ms.ball.p.x, tp.z - ms.ball.p.z);
    const vmax = 22 + .06*(me.at.passing || 50), roll = ms.ball.rollDecel || 1.1;
    const ideal = Math.sqrt(9*9 + 2*roll*d), c = clamp((ideal - CN.PASS_MIN)/(vmax - CN.PASS_MIN), 0, 1), w = .10 + .25*(me.at.passing || 50)/100;
    HUDS.sweet = SWEET; SWEET.lo = c - w/2; SWEET.hi = c + w/2;
  } else if (ch.kind === "shot" && CTRL.aim.ok){
    const d = Math.hypot(CTRL.aim.x - ms.ball.p.x, CTRL.aim.z - ms.ball.p.z);
    // the power that reaches it in a good second (a long shot wants more): 0.55 at 8 m to 0.95 at 30 m
    HUDS.tick = clamp(.55 + .4*(d - 8)/22, .45, .97);
  }
}

/* ---------- the bench (3.4.2) ---------- */
function bench(dt, real){
  const ms = FS.ms;
  // the match goes on (watched at 1x, 2x or 4x, the picture thinned to 30 Hz above 1x (frame), or skipped under a
  // card while E is held)
  if (FS.skipping) skipFrame();
  else live(dt, real);
  // the warm-up (A1.8): the coach's call, the set, the coaches; your look while it frames the set
  if (!FS.skipping && !FS.onPitch && FS.state !== "halftime" && FS.state !== "fulltime"){ warmFrame(real); warmLook(real); }
  // (the keys held when the warm-up takes your legs, or gives them back, are let go: their key-ups went to the set)
  const drv = warmDriving() && !FS.onPitch;
  if (drv !== !!FS.wDrive){ FS.wDrive = drv; for (const k in CTRL.held) CTRL.held[k] = false; }
  if (FS.riseT >= 0){ FS.riseT += real; if (FS.riseT > WU.RISE) FS.riseT = -1; }
  if (!FS.seated && !FS.onPitch) makeFP(FS.V);
  if (!FS.seated){
    ownWalk(dt, true);
    // the call came: walk to the fourth official. The change waits for you there (rules.js subStep, MF-9); left a while
    // without going, you head over by yourself (your own legs, the walls having their say)
    if (FS.called && FS.state === "entering"){
      const e = entrySpot(), d = Math.hypot(P.x - e.x, P.z - e.z);
      if (d < DAY.ENTRY_AT && !FS.atFourth){ FS.atFourth = true; FS.autoWalk = false; note("You're with the fourth official. You'll go on at the next stoppage."); }
      else if (d > DAY.ENTRY_AT + .7 && FS.atFourth) FS.atFourth = false;
      if (!FS.atFourth && !FS.autoWalk && (FS.callT += real) > DAY.CALL_WALK){ FS.autoWalk = true; note("The fourth official is waving you over. You jog across to him."); }
    }
  }
  if (ms.callUp && !FS.called && cameOnAllowed()){
    FS.called = true; FS.state = "entering"; FS.atFourth = false; FS.callT = 0; FS.autoWalk = false;
    hudNotice("sub", "Get ready, you're going on.", "Report to the fourth official. He's waving you over by the halfway line.");
    if (FS.seated){ standUp(); }
  }
  // (the simulation holds your change until you stand by the fourth official)
  if (ms.meEntry) ms.meEntry.at = !!(FS.called && FS.atFourth && !FS.seated);
  if (ms.phase === "halftime" && FS.state !== "halftime") startHalftime();
  else if ((ms.phase === "fulltime" || ms.phase === "over") && FS.state !== "fulltime") startFulltime();
}
const cameOnAllowed = () => !!FS.ms && FS.ms.me < 0;
// your call for the ball (U10): the HUD's line, and the raised hand. Every R press raises it (view.js handRaise, which
// is agent.js raiseHand on your agent), taken as a call or not; the view draws the hand going up and coming down on your
// body and, in first person, in your own view
function handRaise(how){
  hudCallMe(how);
  const ms = FS.ms;
  if (FS.V && ms && typeof VIEWNS.handRaise === "function") VIEWNS.handRaise(FS.V, ms.me, {how, t: ms.t, fp: FS.V.fpOn, ms});
}
// where the view draws an agent (its body's place this frame), or null when it is not drawn
function auraPos(id, out){
  const R = FS.V && FS.V.rec[id];
  if (!R || R.hidden || !R.h || !R.h.g.visible) return null;
  const g = R.h.g.position; out.x = g.x; out.y = g.y; out.z = g.z;
  return out;
}

/* ---------- the fourth official (USER-ISSUES U2) ----------
   A man in the officials' kit at the halfway touchline between the dugouts, by his desk, facing the play. When you are
   called on he turns to you and waves you over; you report to him (the spot beside him, ringed on the grass, the HUD's
   tag over his head and its compass arrow pointing to him) and he sends you on at the next stoppage. */
const FOURTH = {h: null, actor: null, at: {x: 0, z: -35.45}, yaw: 0, st: {mode: "idle", upper: null}, wave: {g: "call", w: 1}, point: {g: "point", w: .8},
  goal: {x: 0, y: 2.25, z: -35.45, label: "Fourth official"}, ring: false};
const goingOn = () => !!(FS.ms && FS.called && FS.state === "entering" && !FS.atFourth && !FS.onPitch);
function fourthInit(kits){
  fourthDispose();
  const V = FS.V; if (!V || !V.scene || !FS.ms) return;
  FOURTH.at.z = FOURTH.goal.z = -(FS.ms.spec.hz + 1.45);
  // (the officials' kit of this match, the one the view dresses the assistants in: he reads as one of them)
  const look = V.L && V.L.of ? V.L.of({role: "ar", id: 44, team: -1}) : lookFor("linesman", 44, kits && kits.ref ? {sex: "m", kit: [kits.ref, "#16171a"], avoid: []} : {sex: "m"});
  const h = FOURTH.h = human(look, {cast: true});
  h.g.name = "fourth-official";
  h.g.position.set(FOURTH.at.x, 0, FOURTH.at.z);
  FOURTH.yaw = 0; h.g.rotation.y = 0;
  V.scene.add(h.g);
  FOURTH.actor = SCHED.actor({id: "fourth", kind: "match", r: 1.1, pos: () => FOURTH.posW || (FOURTH.posW = {x: FOURTH.at.x, y: 0, z: FOURTH.at.z}), active: () => true,
    anim: (dt, tier) => { if (FOURTH.h) animateHuman(FOURTH.h, dt, fourthState(dt), {tier}); }});
}
// what he does this frame: faces the play; turned to you and waving you over while you are called and on your way;
// pointing you on while you wait by him
function fourthState(dt){
  const h = FOURTH.h, st = FOURTH.st;
  let want = 0;
  st.upper = null;
  if (FS.called && FS.state === "entering" && !FS.onPitch){
    want = Math.atan2(P.x - FOURTH.at.x, P.z - FOURTH.at.z);
    st.upper = FS.atFourth ? FOURTH.point : FOURTH.wave;
  }
  FOURTH.yaw += clamp(wrapA(want - FOURTH.yaw), -3*dt, 3*dt);
  if (h) h.g.rotation.y = FOURTH.yaw;
  return st;
}
function fourthDispose(){
  if (FOURTH.actor){ SCHED.remove(FOURTH.actor); FOURTH.actor = null; }
  if (FOURTH.h){ FOURTH.h.dispose(); FOURTH.h = null; }
  FOURTH.ring = false;
}
// where a substitute steps on (rules.js enterSub: the halfway line on the bench side): beside the fourth official
function entrySpot(){ const ms = FS.ms, t = FS.cfg.me ? FS.cfg.me.team : 0; return {x: (t === 0 ? -1 : 1)*2.5, z: -(ms.spec.hz + .9)}; }
// E at the dugout: sit down (the bench camera); E again: stand
// (you take a seat a little way along the dugout with the one beside you left free: the seated substitutes, crowd
// impostors filling the seats from the far end, would otherwise sit at your elbows and fill the edges of the view, and
// the end seat has the dugout's side wall against your shoulder, A1.6; the others are warming up)
function sitDown(side){
  if (FS.state !== "bench" || FS.seated) return;
  const seats = (STADIUM.bench || []).filter(b => b.side === side), k = Math.max(0, seats.length - 4), mine = seats[k];
  const x = mine ? mine.x : side === "home" ? -10 : 10;
  const C = STADIUM.crowd;
  if (C && C.setBench && C.benchN && seats.length){
    // (the count the dugout had before you sat: kept once, so a seat taken again never keeps an already shortened one)
    if (!FS.benchKept || FS.benchKept.side !== side) FS.benchKept = {side, n: C.benchN[side]};
    C.setBench(side, Math.min(FS.benchKept.n, Math.max(0, k - 1)));
  }
  FS.seated = true; FS.benchSeat = {x, z: -37.4, y: 0, yaw: Math.PI};
  placeOwn({x, z: -37.4, yaw: Math.PI});
  P.yaw = Math.PI; P.pitch = -.05;
  benchCam(true);
}
function standUp(){
  if (!FS.seated) return;
  unseat();
  placeOwn({x: P.x, z: -36.6, yaw: Math.PI});
}
// out of the seat however you leave it (standing up, the skip to your call, sent to the bench): the bench camera off,
// real time again, and the seated substitutes back in the dugout
function unseat(){
  const C = STADIUM.crowd, K = FS.benchKept;
  if (C && C.setBench && K) C.setBench(K.side, K.n);
  FS.benchKept = null;
  if (!FS.seated) return;
  // (on your feet the match is watched in real time again)
  FS.seated = false; benchCam(false); FS.ffRate = 1;
}
// you came on (the sub event): your agent takes your place where you stand
function onCameOn(){
  const ms = FS.ms, me = ms.agents[ms.me];
  if (!me) return;
  if (FS.seated) standUp();
  const rx = ms.spec.runoff.hx, rz = ms.spec.runoff.hz;
  // stood by the fourth official (the change waited for you there, MF-9): the agent starts where you stand
  P.x = clamp(P.x, -rx, rx); P.z = clamp(P.z, -rz, rz);
  handover();
  FS.state = "live"; FS.called = false; FS.atFourth = false; FS.autoWalk = false; FS.callT = 0;
  if (ms.meEntry) ms.meEntry.at = false;
  if (FS.V) FS.V.me = ms.me;
  // (the coach's "get over to the fourth official" and the wait note no longer hold)
  hudSayOff(); note("");
  hudNotice("sub", "You're on", "Go and make a difference.");
  // the warm-up's boost runs from now (A1.8); the warm-up itself is over
  warmBoostOn();
  warmDispose(); FS.lockLook = false; FS.riseT = -1;
}
// E held on the bench: the simulation runs headless under a card with the live score and minute (3.4.2: at most
// DAY.SKIP_MS of it a frame, under the 12 ms of the spec)
function startSkip(kind){
  if (!FS.ms || FS.skipping || FS.onPitch) return;
  FS.skipping = {kind, until: kind === "end" ? 5400 : 5400};
  showSkip(kind === "end" ? "Skipping to the final whistle" : "Skipping to your call");
}
function showSkip(title){
  FS.skipTitle = title;
  coverScreen();
  hudOverlay(skipHTML(), "card dim");
}
function skipHTML(){
  const ms = FS.ms, T = FS.cfg.teams;
  return `<div class="fp-skip"><span>${esc(FS.skipTitle || "")}</span><b>${esc(T[0].short || "")} ${ms.score[0]} - ${ms.score[1]} ${esc(T[1].short || "")}</b><span>${minuteOf(ms)}'</span><div class="fp-skip-bar"><i style="width:${Math.min(100, matchSec(ms)/54).toFixed(1)}%"></i></div></div>`;
}
function skipFrame(){
  const ms = FS.ms, S0 = FS.skipping; if (!S0) return;
  FS.headless = true;
  // The clock is read after every step, and the next one is started only while the frame's budget still has room for
  // two ordinary steps (FS.stepMean: the running mean of a step's cost). A step that stalls (a garbage collection, code
  // run for the first time, the page preempted) cannot be stopped once begun, so the budget keeps room for the stalls
  // this machine has shown lately (FS.stallAllow: the largest recent one, fading over a few seconds): the frame's
  // simulation work stays under DAY.SKIP_CAP with one of them in it, and the budget is never more than DAY.SKIP_MS
  // (the 12 ms slice of 3.4.2) nor less than DAY.SKIP_MIN
  const t0 = performance.now();
  let steps = 0, last = t0, worst = 0, pre = 0, dtS = 0;
  if (!(FS.stepMean > 0)) FS.stepMean = .25;
  FS.stallAllow = Math.max(DAY.STALL0, (FS.stallAllow || DAY.STALL0)*.99);
  const budget = clamp(DAY.SKIP_CAP - FS.stallAllow, DAY.SKIP_MIN, DAY.SKIP_MS);
  while (ms.phase !== "over"){
    pre = last - t0;
    oneStep(); steps++;
    const now = performance.now();
    dtS = now - last; last = now; if (dtS > worst) worst = dtS;
    if (dtS > 4*FS.stepMean + 1) FS.stallAllow = Math.max(FS.stallAllow, Math.min(dtS, DAY.SKIP_CAP));
    else FS.stepMean += (dtS - FS.stepMean)*.02;
    // (the skip to your call stops for the coach's warm-up call too, A1.8)
    if (S0.kind === "call" && (ms.callUp || warmCallDue())) break;
    if (S0.kind === "late" && matchSec(ms) >= S0.until) break;
    if (ms.phase === "halftime"){ if (S0.kind === "late" || FS.state === "lateRun"){ secondHalf(ms); } else break; }
    if (now - t0 + Math.max(.2, 2*FS.stepMean) >= budget) break;
  }
  FS.skipBudget = budget;
  FS.skipMs = performance.now() - t0; FS.skipSteps = steps; FS.skipWorst = worst; FS.skipPre = pre; FS.skipLast = dtS;
  FS.stepCost = steps ? FS.skipMs/steps : 0;
  FS.headless = false;
  events();
  hudOverlay(skipHTML(), "card dim");
  const done = S0.kind === "call" ? !!ms.callUp || warmCallDue() : S0.kind === "late" ? matchSec(ms) >= S0.until : false;
  if (done || ms.phase === "halftime" || ms.phase === "fulltime" || ms.phase === "over"){
    FS.skipping = null;
    // (half time stops the skip for the dressing room; it carries on with the second half)
    FS.skipResume = !done && ms.phase === "halftime" && S0.kind !== "late" ? S0.kind : null;
    hudOverlay(null);
    if (S0.kind === "late"){
      // arriving late: on the bench (watching) with the match already going
      FS.state = "bench"; unseat(); FS.V.pre = null;
      placeOwn({x: 0, z: -40.5, yaw: Math.PI}); P.yaw = Math.PI;
      note("You're late. You start on the bench.");
      revealAfterFrames(2).then(() => liftCover());
      return;
    }
    if (S0.kind === "call" && ms.callUp){
      // standing by the fourth official, under the card's cover
      FS.called = true; FS.state = "entering"; unseat(); benchCam(false);
      const e = entrySpot(); placeOwn({x: e.x, z: e.z - .3, yaw: Math.PI}); P.yaw = Math.PI; FS.atFourth = true;
      hudNotice("sub", "Get ready, you're going on.", "You're with the fourth official. You'll go on at the next stoppage.");
    }
    revealAfterFrames(2).then(() => liftCover());
  }
}

/* ---------- the warm-up (WP-W1, addendum A1.8; warmup.js) ----------
   Planned at the match's start for a substitute with a planned change (cfg.roleTimes.subOn); the warm-up runs its own
   course from the bench (warmFrame); here are its hands on the day: your seat, your legs, the bench record your agent is
   made from when you go on, the HUD, the career's port (the stand-in in the test fixtures: a test never touches a
   career). The set of the last match is kept in the career's save (S.player.warmLast) and on this device
   (freyaFootball.warmLast), so no two matches running have the same one. */
const WARM_KEY = "freyaFootball.warmLast";
let WARM_LAST = null;
// (a career keeps it in its save, S.player.warmLast; the device's copy is for a match outside one)
const careerP = () => FS.real && typeof S !== "undefined" && S && S.player ? S.player : null;
function warmLast(){
  if (FS.testWarm && FS.testWarm.last !== undefined) return FS.testWarm.last;
  const cp = careerP();
  if (cp && Array.isArray(cp.warmLast)) return cp.warmLast;
  if (WARM_LAST) return WARM_LAST;
  try { const v = JSON.parse(localStorage.getItem(WARM_KEY) || "null"); return Array.isArray(v) ? v : null; } catch(e){ return null; }
}
function warmRemember(set){
  WARM_LAST = set.slice();
  if (FS.testWarm) return;
  const cp = careerP(); if (cp) cp.warmLast = set.slice();
  try { localStorage.setItem(WARM_KEY, JSON.stringify(set)); } catch(e){}
}
// the coach's style (attacking, pressing, technical): the configuration's (bridge) when it carries one, the career's,
// else the one career.js coachStyleOf fixes for a club of that name (the same club always has the same coach)
function coachStyle(){
  const me = FS.cfg && FS.cfg.me, M = FS.M;
  const s = (me && me.coachStyle) || (M && M.coachStyle) || (FS.testWarm && FS.testWarm.style) || (FS.wport && FS.wport.style());
  const ids = typeof COACH_STYLE_IDS !== "undefined" ? COACH_STYLE_IDS : null;
  if (s && (!ids || ids.includes(s))) return s;
  const team = FS.cfg && me ? FS.cfg.teams[me.team] : null;
  return typeof coachStyleOf === "function" ? coachStyleOf({nm: team ? team.name : "club"}) : null;
}
function warmSetup(){
  const cfg = FS.cfg, ms = FS.ms;
  const subOn = cfg && cfg.roleTimes ? cfg.roleTimes.subOn : 0;
  FS.wb = null; FS.boostLive = null; FS.riseT = -1; FS.cheer = 0; FS.wbRev = NaN; FS.wbNow = null;
  if (!subOn || !cfg.me || cfg.resume || ms.me >= 0){ warmDispose(); return; }
  const port = FS.real ? careerPort() : (FS.testPort = localPort());
  FS.wport = port;
  const t = cfg.me.team, kit = FS.kits ? (t === 0 ? FS.kits.home : FS.kits.away) : null;
  warmPlan({seed: cfg.seed, subOn, callAt: FS.testWarm && FS.testWarm.callAt != null ? FS.testWarm.callAt : null, team: t, side: t === 0 ? -1 : 1,
    real: FS.real, kit, port,
    style: () => coachStyle(),
    minute: () => FS.ms ? minuteOf(FS.ms) : 0, rate: () => FS.ms ? FS.ms.clock.rate : 4.5,
    called: () => !!FS.called || !!(FS.ms && FS.ms.callUp) || FS.onPitch,
    seatAt: () => FS.seated ? FS.benchSeat : null,
    stand: () => { if (FS.seated){ standUp(); FS.riseT = 0; } },
    own: () => FS.own, V: () => FS.V,
    note: t0 => note(t0),
    say: (who, text, mate) => hudSay(who, text, mate),
    pop: (text, kind, sub) => hudPop(text, kind, sub),
    cheer: v => { FS.cheer = Math.min(1, (FS.cheer || 0) + v); },
    mates: () => benchMates(),
    last: () => warmLast(), remember: set => warmRemember(set), forceSet: FS.testWarm && FS.testWarm.set ? FS.testWarm.set : null,
    applyBoost: b => warmBoostBench(b)});
}
// the team-mates on the bench (the ones who have not gone on), where they sit: they shout across now and then
function benchMates(){
  const ms = FS.ms, t = FS.cfg.me ? FS.cfg.me.team : 0, sx = t === 0 ? -1 : 1;
  // (called by the surname, as team-mates do; a name that ends in a number is said whole)
  const callName = n => { const w = String(n || "").split(" "), last = w[w.length - 1]; return /^\d+$/.test(last) ? w.join(" ") : last; };
  return ms.bench[t].filter(p => !p.isMe && !p.used).slice(0, 4).map((p, i) => ({name: callName(p.name), x: sx*10 + sx*(1.2 - .6*i), z: -37.3, seed: p.pid || i}));
}
// the boost onto the record your agent is made from when you go on (sim.js benchMe keeps you there): the boosted
// numbers, the plain ones kept to put back
function warmBoostBench(b){
  const ms = FS.ms, t = FS.cfg.me ? FS.cfg.me.team : 0;
  const rec = ms.bench[t].find(p => p.isMe && !p.used);
  FS.wb = b;
  if (!rec || !b) return;
  if (!rec.atBase) rec.atBase = rec.at;
  rec.at = boostedAttrs(rec.atBase, b);
}
// you came on with a boost: it runs its minutes from now (the port's untilMin, which a goal or an assist moves on);
// the stamina it gives is in your tank's drain too (cfg.me.staminaF)
function warmBoostOn(){
  const ms = FS.ms, me = ms.agents[ms.me], b = FS.wb, port = FS.wport;
  if (!me || !b || !port || !(b.all > 0)) return;
  const t = me.team, rec = ms.bench[t].find(p => p.isMe);
  const now = minuteOf(ms), cur = port.warmBoost.get() || {};
  port.warmBoost.set(Object.assign({}, cur, {rating: b.rating, all: b.all, focus: Object.assign({}, b.focus), focusName: b.focusName, mins: b.mins, untilMin: now + b.mins, onFire: false}));
  const sF = FS.cfg.me.staminaF;
  FS.boostLive = {atBase: rec && rec.atBase ? rec.atBase : me.at, sF, mins: b.mins};
  if (sF != null) FS.cfg.me.staminaF = Math.max(.3, sF - 1.15*((b.all || 0) + (b.focus.stamina || 0))/100);
}
// the boost's time is up: your plain numbers again (the mover's profile from them, its bounds kept), the tank as it was
function warmBoostOff(){
  const ms = FS.ms, me = ms && ms.me >= 0 ? ms.agents[ms.me] : null, L = FS.boostLive;
  FS.boostLive = null;
  if (FS.wport) FS.wport.warmBoost.clear();
  if (!me || !L) return;
  const at = me.at = L.atBase;
  me.prm = Object.assign(moverParams({pace: at.pace, dribbling: at.dribbling, acceleration: at.acceleration, sprintSpeed: at.sprintSpeed, agility: at.agility}, "football", me.items || {}), {bounds: me.prm.bounds});
  if (L.sF != null) FS.cfg.me.staminaF = L.sF;
  hudNotice("info", "Your warm-up boost has worn off.");
}
// the port's boost as it stands: its last get(), read again only when rev() says it moved (no copy each frame)
function warmBoostNow(){
  const port = FS.wport; if (!port) return null;
  const r = port.warmBoost.rev ? port.warmBoost.rev() : -1;
  if (r < 0 || r !== FS.wbRev){ FS.wbRev = r; FS.wbNow = port.warmBoost.get(); }
  return FS.wbNow;
}
function warmBoostStep(){
  const L = FS.boostLive, port = FS.wport; if (!L || !port || !FS.onPitch) return;
  const b = warmBoostNow();
  if (!b || minuteOf(FS.ms) >= b.untilMin) warmBoostOff();
}
// a goal or an assist of yours while the boost lasts: 10 more minutes, and you are on fire
function warmGoal(ev, me){
  if (!FS.boostLive || !FS.wport || ev.disallowed || ev.ownGoal) return;
  if (ev.scorer !== me && ev.assister !== me) return;
  FS.wport.warmBoost.extend(WU.EXTEND);
  hudNotice("goal", "On fire", `Your warm-up boost runs ${WU.EXTEND} more minutes.`);
}
// the Warm mark on the HUD: the boost waiting for you to go on, or running with its minutes left
function warmIcon(){
  const b = warmBoostNow();
  if (!b || !(b.all > 0)) return null;
  if (FS.onPitch && !FS.boostLive) return null;
  const I = FS.wIcon || (FS.wIcon = {});
  I.all = b.all; I.mins = b.mins || 12; I.fire = !!b.onFire; I.wait = !FS.onPitch;
  I.left = FS.onPitch ? b.untilMin - (FS.ms.clock.sec/60 + 1 + (FS.ms.half - 1)*45) : I.mins;
  return I;
}
// while the warm-up has your view, it turns to what the set is framed for, eased (the look is the warm-up's then)
function warmLook(dt){
  const v = warmView();
  FS.lockLook = !!v || (warmOn() && WARM.phase === "rise");
  if (!v) return;
  const k = 1 - Math.exp(-5*dt);
  P.yaw = wrapA(P.yaw + wrapA(v.yaw - P.yaw)*k);
  P.pitch += (v.pitch - P.pitch)*k;
}

/* ---------- half time (3.4.3) ---------- */
function startHalftime(){
  if (FS.state === "halftime") return;
  // (called and walking to the fourth official at the whistle, you still are after the break, MF-7)
  FS.prevState = FS.onPitch ? "live" : FS.state === "entering" ? "entering" : "bench";
  FS.state = "halftime"; FS.htT = 0; FS.htCard = false;
  controlReset();
}
function halftime(dt, real){
  const ms = FS.ms;
  FS.htT += real;
  // the whistle, two seconds to walk off, then the dressing-room card. Its 60 s run with the mode's step, which goes on
  // with the pointer let go (pauseOnUnlock is off at half time, MF-2): the card's button is a way out, and so is the time
  if (FS.onPitch) mirror();
  if (FS.htT < DAY.HT_WALK) return;
  if (!FS.htCard){
    FS.htCard = true; FS.htCardT = 0;
    coverScreen();
    writeCheckpoint(true);
    htMotivation();
    showHalftimeCard();
  }
  FS.htCardT += real;
  if (FS.htCardT >= DAY.HT_CARD) secondHalfGo();
  void ms;
}
// a card that wants the mouse is up (MF-1): the pointer is let go so the card can be clicked (under pointer lock every
// click goes to the canvas, whatever is drawn over it), and the card's box takes the keyboard's focus, so Tab goes
// through its buttons and Enter presses one. The click that closes it takes the pointer back (cardDone)
function cardUp(o){
  if (document.pointerLockElement){ FS.freed = true; FS.lockUsed = true; FS.exitAsked = true; document.exitPointerLock(); }
  const box = o && o.querySelector(".fp-cardbox");
  if (box && document.activeElement !== box && !box.contains(document.activeElement)) try { box.focus({preventScroll: true}); } catch(e){}
}
// the card is done (its button, or its time): the pointer it let go is asked back (a click is the gesture that allows it).
// Granted, play goes on; refused or not granted in DAY.RELOCK s (the time ran out with nobody at the mouse), the match
// waits on the pause card until a click takes the pointer back, as it does whenever the pointer is let go (SCHED task)
function cardDone(){
  // (a pointer the card let go, or one let go before it, Esc in the walk-off: a match played with the pointer takes it back)
  const want = FS.freed || FS.lockUsed;
  FS.freed = false;
  if (!want || FS.relock === false || document.pointerLockElement) return;
  relockWait(true);
  if (HOST) HOST.relock(); else if (window.lifeRelock) window.lifeRelock();
}
// the wait for the lock asked back is real time on a timer, not the frames' dt, and it starts once the page is free again:
// the browser answers between tasks, so frames stepped in one go (a skip's catch-up, a page stepping the match itself)
// are no time it had to answer in
let relockTimer = 0;
function relockWait(on){
  if (relockTimer){ clearTimeout(relockTimer); relockTimer = 0; }
  FS.relockWait = !!on;
  if (on) relockTimer = setTimeout(() => { relockTimer = setTimeout(() => { relockTimer = 0; FS.relockWait = false; }, DAY.RELOCK*1000); }, 0);
}
// a good dressing-room moment moves your Motivation (career.js motivationHalfTime, A1.8): once, as the card comes up
function htMotivation(){
  const ms = FS.ms, me = ms.me >= 0 ? ms.agents[ms.me] : null, t = FS.cfg.me ? FS.cfg.me.team : 0;
  if (!FS.real || typeof window === "undefined" || typeof window.motivationHalfTime !== "function") return;
  try { window.motivationHalfTime({lead: ms.score[t] - ms.score[1 - t], rating: me && me.on.length ? liveRating(ms, me) : null}); } catch(e){ console.error(e); }
}
function showHalftimeCard(){
  const ms = FS.ms, me = ms.me >= 0 ? ms.agents[ms.me] : null;
  const rating = me && me.on.length ? liveRating(ms, me) : null;
  const drift = me && me.acc.oop > 30 && me.acc.oopFar/me.acc.oop > .35;
  let html;
  if (HOST && FS.real){
    html = HOST.htCard(FS.M, {rating, drift, drinks: HOST.drinks()});
  } else {
    const T = FS.cfg.teams;
    html = `<div class="eyebrow">Half time</div><h2>${esc(T[0].name)} ${ms.score[0]} - ${ms.score[1]} ${esc(T[1].name)}</h2>`;
  }
  const o = hudOverlay(cardBox(html, `<button class="btn" data-ht="go">Second half</button>`), "ht");
  if (o){
    o.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ht === "go"){ secondHalfGo(); return; }
      if (b.dataset.drink){ const r = drink(b.dataset.drink); if (r && r.ok === false && r.why) note(r.why); showHalftimeCard(); }
    };
  }
  cardUp(o);
}
// a card's box (MF-4): the body (it scrolls on its own when it is long) and the buttons in a footer that never scrolls
// away, written first so that Tab reaches them first (fp.css shows the footer under the body, main action on the right)
const cardBox = (body, buttons) => `<div class="fp-box fp-cardbox" tabindex="-1"><div class="fp-box-foot row gap8 center">${buttons}</div><div class="fp-box-body">${body}</div></div>`;
function secondHalfGo(){
  if (FS.state !== "halftime") return;
  const ms = FS.ms;
  hudOverlay(null);
  // the first half's cards (the added minutes, the whistle) do not carry on into the second, however long the break
  hudClearCards();
  // ends changed, everyone on the kick-off spots behind the fade (sim.js secondHalf), you at yours
  if (ms.phase === "halftime") secondHalf(ms);
  // nothing of the first half is played again in the second: the input made while the card was up (MF-5), a goal on the
  // whistle waiting for its replay or its checkpoint (MF-8)
  controlReset();
  clearMatchFlags();
  const me = liveMe();
  if (me){ P.x = me.m.x; P.z = me.m.z; me.x0 = me.m.x; me.z0 = me.m.z; P.yaw = me.m.yaw; P.pitch = 0; }
  FS.acc = 0;
  // the state the whistle found you in: on the pitch, on the bench, or called and on your way to the fourth official (MF-7)
  FS.state = FS.onPitch ? "live" : FS.prevState === "entering" && FS.called ? "entering" : "bench";
  FS.prevState = null;
  if (FS.state === "bench" && FS.seated){ P.yaw = Math.PI; }
  if (FS.state === "bench" && FS.skipResume){ const k = FS.skipResume; FS.skipResume = null; startSkip(k); }
  else FS.skipResume = null;
  cardDone();
  revealAfterFrames(2).then(() => liftCover());
}

/* ---------- full time (3.4.3) ---------- */
function startFulltime(){
  if (FS.state === "fulltime" || FS.state === "leaving") return;
  FS.state = "fulltime"; FS.ftT = 0; FS.ftCard = false;
  controlReset();
}
function fulltime(dt, real){
  FS.ftT += real;
  const ms = FS.ms;
  if (ms.phase !== "over"){
    // (the last steps to the final whistle's end, at most DAY.MAX_STEPS a frame as in play: a long frame does not pile up)
    FS.acc += real; let n = 0;
    while (FS.acc >= H && ms.phase !== "over" && n < DAY.MAX_STEPS){ oneStep(); FS.acc -= H; n++; }
    if (n >= DAY.MAX_STEPS && FS.acc > H) FS.acc = H*.999;
  }
  if (FS.ftT < DAY.FT_WALK || FS.ftCard) return;
  FS.ftCard = true;
  coverScreen();
  settle();
  showFulltimeCard();
}
// the result into the world and the career (once): bridge.finish, the league around, the clips for the card
function settle(){
  if (FS.R || !FS.real) return FS.R;
  const out = finish(FS.ms);
  if (HOST) out.around = HOST.around(FS.f);
  FS.R = out;
  return out;
}
function showFulltimeCard(){
  const ms = FS.ms;
  let html;
  if (HOST && FS.real && FS.R && FS.R.R){
    html = HOST.ftCard(FS.M, Object.assign({}, FS.R.R, {around: FS.R.around || []}));
  } else {
    const T = FS.cfg.teams;
    html = `<div class="eyebrow">Full time</div><h2>${esc(T[0].name)} ${ms.score[0]} - ${ms.score[1]} ${esc(T[1].name)}</h2>`;
  }
  const press = !!(HOST && FS.real && HOST.pressOpen && HOST.pressOpen());
  // (Continue first in the footer's markup, so Tab reaches it first; it is drawn on the right, MF-4)
  const o = hudOverlay(cardBox(html, `<button class="btn" data-ft="go">Continue</button>${press ? `<button class="btn ghost" data-ft="press">🎙 Talk to the press</button>` : ""}`), "ft");
  if (o){
    o.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ft === "go"){ leave(); return; }
      // the interview (awards.js): its answers run their own onclick (A.press), then it is back to the card
      if (b.dataset.ft === "press"){ cardUp(hudOverlay(cardBox(HOST.press(), `<button class="btn ghost" data-ft="back">Back</button>`), "ft")); return; }
      if (b.dataset.ft === "back" || b.classList.contains("media")){ showFulltimeCard(); return; }
      if (b.dataset.clip != null) playHighlight(+b.dataset.clip);
    };
  }
  cardUp(o);
}
// a highlight on the full-time card: the clip kept for it, played from the broadcast cameras
function playHighlight(i){
  const ms = FS.ms, me = ms.me >= 0 ? ms.agents[ms.me] : null;
  const hl = me ? highlights(ms, me.id) : [];
  const h = hl[i]; if (!h) return;
  const k = kept().find(c => c.t0 <= h.t1 && c.t1 >= h.t0);
  if (!k) return note("That moment wasn't caught on camera.");
  hudOverlay(null);
  liftCover(150);
  play(k.clip, {cams: broadcastCams(k.end || 1)}).then(() => { coverScreen(); showFulltimeCard(); });
}
// continue: the life world, back out of the training ground's tunnel (lifeAfterMatch)
function leave(){
  if (FS.state === "leaving") return;
  FS.state = "leaving";
  hudOverlay(null);
  const fat = FS.R && FS.R.R ? FS.R.R.fatigue || 0 : 0;
  const real = FS.real;
  teardown();
  exitMode("done");
  if (real && HOST) HOST.leave(fat);
}
function teardown(){
  for (const f of FS.offs) try { f(); } catch(e){ console.error(e); }
  FS.offs.length = 0;
  if (playing()) skip();
  // the warm-up's coaches and ball go; its boost belongs to this match only (a Cold record from an ignored call too)
  warmDispose();
  if (FS.wport && (FS.boostLive || FS.wb || FS.wport.wrote)) FS.wport.warmBoost.clear();
  FS.wport = null; FS.wbNow = null; FS.wb = null; FS.boostLive = null; FS.riseT = -1; FS.wDrive = false; FS.testWarm = null;
  if (AUD.feelOff) AUD.feelOff();
  camDispose();
  hudDispose();
  fourthDispose();
  auraDispose();
  CTRL.callHook = null;
  if (FS.V){ viewDispose(FS.V); FS.V = null; }
  controlReset();
  CTRL.enabled = true;
  // (the match's flags go with it, MF-8; a pause it held the world in is its own, and life never pauses on the pointer)
  clearMatchFlags();
  if (FLAGS.lockLost) FLAGS.lockLost = false;
  FS.ms = null; FS.state = null; FS.walkers = null; FS.skipping = null; FS.seated = false; FS.benchKept = null; FS.called = false; FS.onPitch = false;
  FS.test = null; FS.real = false; FS.slow = null; FS.timeScale = 1; FS.lockLook = false; FS.testDriver = null; FS.testInfo = null;
  FS.prevState = null; FS.htCard = FS.ftCard = false; FS.freed = FS.exitAsked = false; relockWait(false); FS.lockUsed = false; FS.atFourth = false; FS.autoWalk = false; FS.callT = 0;
  FS.pauseShown = false;
  document.body.classList.remove("fp-match");
}
// FP.exit (tests, or a match that has to stop): no result, the mode left
function abort(){
  if (!FS.state) return;
  teardown();
  if (mode() === "match") exitMode("done");
}

/* ---------- checkpoints (3.4.4) ---------- */
function writeCheckpoint(force){
  const ms = FS.ms; if (!ms || !FS.real) return null;
  const r = checkpoint(ms);
  if (r){ persistNow(); FS.ckT = FS.realT; }
  void force;
  return r;
}
function maybeCheckpoint(){
  const ms = FS.ms; if (!FS.real) return;
  const dead = ms.phase === "restart" || ms.phase === "kickoff";
  if (!dead || playing() || FS.replayQ) return;
  // the kick-off after a goal, a substitution: now; otherwise a dead ball at most once a minute of real time
  if (FS.ckGoal && ms.phase === "kickoff" && ms.restart && (ms.restart.stage === "wait" || ms.restart.stage === "go")){ FS.ckGoal = false; writeCheckpoint(true); return; }
  if (FS.ckNow){ FS.ckNow = false; writeCheckpoint(true); return; }
  if (ms.checkpointDue && FS.realT - FS.ckT >= DAY.CK_GAP) writeCheckpoint(false);
}

/* ---------- the goal replay (3.4.3): at the restart, 6 s, two broadcast cameras, Esc skips it ---------- */
function replayDue(){
  const ms = FS.ms;
  if (FS.goalEv && ms.phase === "kickoff" && !FS.replayQ && !playing() && ms.t - FS.goalT > 2.5 && ms.t - FS.goalT < 12){
    const g = FS.goalEv; FS.goalEv = null;
    const c = clip(g.t - DAY.REPLAY + .8, g.t + .8);
    const end = g.x < 0 ? -1 : 1;
    keep(c, "goal", {t0: c.t0, t1: c.t1, end});
    FS.replayQ = true;
    play(c, {cams: broadcastCams(end)}).then(() => { FS.replayQ = null; });
  }
  // the player's shots and the moments he made: kept for the full-time card (taken two seconds after)
  if (CTRL.lastShotT != null && ms.t - CTRL.lastShotT > 2){
    const t = CTRL.lastShotT; CTRL.lastShotT = null;
    const c = clip(t - 4, t + 2);
    keep(c, "shot", {t0: c.t0, t1: c.t1, end: ms.dirs[ms.agents[ms.me] ? ms.agents[ms.me].team : 0]});
  }
}
function broadcastCams(end){
  return [
    {until: .5, fov: 34, pos: b => ({x: clamp(b.x*.8, -40, 40), y: 16, z: -50})},
    {until: 1, fov: 42, pos: b => ({x: end*(54.5 + 9), y: 4.2, z: clamp(b.z*.3, -6, 6)})}
  ];
}

/* ---------- input (1.6) ---------- */
function input(ev){
  if (!FS.state) return false;
  const st = FS.state;
  // (the pointer's change has come: the let-go a card asked for is answered, the next one is the player's own)
  if (ev.type === "lock") FS.exitAsked = false;
  // half time and full time: Esc still skips a highlight being replayed; otherwise the card has the mouse and the keys
  // (its buttons, Tab, Enter, the wheel) and nothing of it reaches the match: a click made on the card is never played
  // as a tackle or a shot when play goes on (MF-5)
  if (mouseCard() && ev.type !== "lock"){
    if (ev.type === "keydown" && ev.key === "escape" && playing()) skip();
    return true;
  }
  if (ev.type === "keydown" || ev.type === "keyup"){
    const k = ev.key === " " ? "space" : ev.key, down = ev.type === "keydown";
    // a key with Ctrl, Alt or Meta held is nobody's action (D9); its release still lets go of what it held
    if (down && ev.prevent && (KEYSET.has(ev.key) || k === "space")) ev.prevent();
    if (down && modded(ev)) return controlInput(ev);
    // Esc during a replay skips it
    if (k === "escape" && playing()){ skip(); return true; }
    if (k === "h"){ if (down && !ev.repeat) hudToggleHints(); return true; }
    // the warm-up (A1.8): E answers the coach's call; through the set its keys are the exercise's, Tab held finishes it
    if (!FS.onPitch && !FS.skipping && warmInput(ev)){ if (k === "tab"){ FS.tabHeld = false; hudTab(false); } return true; }
    if (k === "tab"){ FS.tabHeld = down; hudTab(down); return true; }
    // E: context only (Ready at kick-off, sit or stand on the bench, held to skip); in the dressing room and on your feet
    // by the dugout it uses the spot (the manager, the door, the seat)
    if (k === "e"){
      if (st === "dressing" || (st === "bench" && !FS.seated && !FS.called)){ CTRL.held.e = down; return false; }
      if (down && !ev.repeat){
        if (st === "walkout") FS.ready = true;
        if (st === "bench" && FS.seated){ if (FS.called) standUp(); else { FS.eDown = true; FS.eHeld = 0; FS.eLast = performance.now(); FS.eT0 = ev.t > 0 ? ev.t : null; } }
      }
      if (!down) benchRelease(ev);
      return true;
    }
    // 1, 2, 3 on the bench: watch at 1x, 2x, 4x (on the pitch they choose the contact)
    if (st === "bench" && FS.seated && down && (k === "1" || k === "2" || k === "3")){ FS.ffRate = DAY.FF[+k - 1]; FS.ffSteps = 0; FS.ffReal = 0; FS.ffAch = FS.ffRate; return true; }
  }
  if (!FS.onPitch && !FS.skipping && (ev.type === "move" || ev.type === "down" || ev.type === "up") && warmInput(ev)) return true;
  if (ev.type === "move" && st === "bench" && FS.seated){ look(ev.dx || 0, ev.dy || 0); benchClamp(Math.PI); return true; }
  if (playing() && (ev.type === "down" || ev.type === "up")) return true;
  return controlInput(ev);
}
// E held on the bench (counted per frame by the SCHED task below): the ring fills over DAY.E_HOLD, then the skip.
// A tap stands you up to warm up along the touchline; let go after DAY.E_TAP but before the ring is full and nothing
// happens but the reminder (conflict register: the hold-E dead zone). What counts is the time since the key went down,
// not a whole frame's dt: on a slow machine the first frame after the press also holds the time before it, and a quick
// tap would otherwise land in the dead zone. A frame is credited at most the real time since the last one counted, but
// never less than a 60 Hz frame (the clock-stepped QA frames run faster than real time)
function benchHold(dt){
  if (!FS.eDown || FS.state !== "bench" || !FS.seated || FS.skipping) return;
  const now = performance.now(), since = (now - (FS.eLast || now))/1000;
  FS.eLast = now;
  FS.eHeld += Math.min(dt, Math.max(since, 1/60));
  if (FS.eHeld >= DAY.E_HOLD){ FS.eDown = false; FS.eHeld = 0; startSkip(FS.called || !callPlanned() ? "end" : "call"); }
}
function benchRelease(ev){
  // how long the key was down: from the browser's own time stamps when both events carry one (a key event waits behind a
  // long frame, the stamp says when it happened); else what the frames counted plus the real time since the last of
  // them, so a hold let go between two slow frames is not cut short
  const real = FS.eT0 != null && ev && ev.t > 0 ? Math.max(0, ev.t - FS.eT0)/1000 : null;
  const held = real != null ? real : FS.eHeld + (FS.eDown && FS.eLast ? Math.max(0, performance.now() - FS.eLast)/1000 : 0), was = FS.eDown;
  FS.eT0 = null;
  FS.eDown = false; FS.eHeld = 0;
  if (!was || FS.state !== "bench" || !FS.seated || FS.skipping) return;
  if (held < DAY.E_TAP){
    standUp();
    note(warmOn() && WARM.phase === "wait" ? "You're up. Keep loose, the coach will tell you when to warm up properly. Press E by the dugout to sit back down."
      : "You're up. Warm up along the touchline, and press E by the dugout to sit back down.");
  }
  else hudNotice("info", "Keep holding E until the ring fills.");
}
const callPlanned = () => { const rt = FS.cfg && FS.cfg.roleTimes; return !!(rt && rt.subOn) && !(FS.ms && FS.ms.roleDone.on && !FS.ms.callUp); };

/* ---------- the cover and notes ---------- */
function liftCover(ms = 500){
  const o = document.getElementById("lifeFade");
  FADE.v = 0;
  if (o){ o.style.transition = `opacity ${ms}ms ease`; o.style.opacity = "0"; delete o.dataset.tun; }
}
function note(t){ if (HOST && HOST.note) HOST.note(t); }
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// a task that runs whatever the mode's step does (the pause, E held on the bench)
SCHED.task({id: "fp-match", kind: "keep", run: dt => {
  if (mode() !== "match" || !FS.state) return;
  benchHold(dt);
  // the pointer (MF-1, MF-2): asked back after a card, it is waited for a moment; play without it (a card that ran out
  // its own time with nobody at the mouse, a lock refused, the pointer let go during a skip) is held on the pause card,
  // as play is whenever the pointer is let go, until a click takes it back. A match never locked (the tests' own
  // pages) is left as it is
  const play = (FS.state === "live" || FS.state === "bench" || FS.state === "entering") && !FS.skipping;
  if (document.pointerLockElement){ FS.lockUsed = true; FS.exitAsked = false; if (FS.relockWait) relockWait(false); }
  else if (FS.relockWait){ /* (the lock asked back may still come) */ }
  else if (play && FS.lockUsed && !FLAGS.lockLost && FS.relock !== false) FLAGS.lockLost = true;
  // paused (the pointer let go): the card; the simulation is not stepped (world.js skips the mode's step)
  const paused = !!FLAGS.lockLost && play;
  if (paused !== FS.pauseShown){ FS.pauseShown = paused; hudOverlay(paused ? `<div class="fp-pausebox"><div class="fp-pause">Paused. Click to carry on.</div><div class="fp-box">${fpSettingsHTML()}</div></div>` : null, paused ? "dim pause" : ""); }
}});

/* ---------- the match settings (3.4.7): the pause card and the Settings sheet (window.fpSettingsHTML) ---------- */
const LENGTHS = {4: "Short (6 minute halves)", 2: "Standard (10 minute halves)", 1: "Long (15 minute halves)"};
export function fpSettingsHTML(){
  const lengths = [4, 2, 1].filter(k => CALIBRATED[k]).map(k => [k, LENGTHS[k]]);
  return settingsHTML({speed: HOST && HOST.speed ? HOST.speed() : 2, lengths});
}
export function fpSet(k, v){
  if (k === "speed"){ if (HOST && HOST.setSpeed && CALIBRATED[v]) HOST.setSpeed(v); }
  else if (k === "hide"){ const h = Object.assign({}, SET.hide || {}); h[v] = !h[v]; saveSet({hide: h}); }
  else saveSet({[k]: v});
  if (k === "volume") AUD.volume(SET.volume);
  // the setting cards open: a slider's value written beside it; anything else drawn again
  if (typeof document === "undefined") return;
  const range = ["sens", "fov", "motion", "volume", "hudScale", "hudOpacity"].includes(k);
  for (const box of document.querySelectorAll(".fp-set")){
    if (range){ const sp = box.querySelector(`.fp-set-v[data-k="${k}"]`); if (sp) sp.textContent = fmtVal(k, SET[k]); }
    else box.outerHTML = fpSettingsHTML();
  }
}
window.fpSettingsHTML = fpSettingsHTML; window.fpSet = fpSet;

/* ---------- crash recovery (3.4.4) ----------
   On the first life frames after a load: a match left half played (S.life.inMatch, its fixture not done) is rebuilt
   from the checkpoint and played out headless to full time behind a card; you count as substituted at the
   checkpoint's minute, rated from your own counters; no missed-match penalty. */
export const RECOVER = {busy: false, done: false, ms: null};
export function recoverCheck(){
  if (RECOVER.busy || FS.state || !HOST || mode() !== "life") return false;
  const r = resumeInfo();
  if (!r) return false;
  const f = HOST.fixture(r.fkey);
  if (!f){ HOST.clearInMatch(); return false; }
  RECOVER.busy = true;
  const M = HOST.setup(f, {late: false, resume: r});
  M.role = r.role || M.role; M.late = !!r.late;
  const cfg = matchConfig(f, M, {resume: r, scaleOf: heightOf});
  cfg.htAuto = true;
  const ms = RECOVER.ms = createMatch(cfg);
  const offs = [attach(ms, on)];
  hudInit({home: {short: cfg.teams[0].short, kit: ["#2c66b8", "#fff"]}, away: {short: cfg.teams[1].short, kit: ["#c8463a", "#fff"]}, us: cfg.me ? cfg.me.team : 0});
  // (the minute as the player's minutes count it, events.js minsOn: the seconds played, rounded)
  const min = Math.round(onSec(ms)/60);
  const card = () => hudOverlay(`<div class="fp-box"><div class="eyebrow">Match interrupted</div><h2>Your last match was interrupted at ${min}'.</h2><p>The rest is played out.</p><b>${esc(cfg.teams[0].name)} ${ms.score[0]} - ${ms.score[1]} ${esc(cfg.teams[1].name)}</b><div class="muted small">${minuteOf(ms)}'</div></div>`, "card");
  card();
  const t = SCHED.task({id: "fp-recover", kind: "keep", run: () => {
    runHeadless(ms, 1e9, DAY.SKIP_MS);
    card();
    if (ms.phase !== "over") return;
    SCHED.remove(t);
    for (const f0 of offs) f0();
    FS.ms = ms; FS.M = M; FS.f = f; FS.real = true;
    const out = finish(ms);
    out.around = HOST.around(f);
    RECOVER.out = {rating: out.rating, mins: out.R ? out.R.mins : null, score: ms.score.slice(), fkey: f.key, checkpointMin: min};
    persistNow();
    const R = out.R ? Object.assign({}, out.R, {around: out.around}) : null;
    const done = () => { hudOverlay(null); hudDispose(); FS.ms = null; FS.M = null; FS.f = null; FS.real = false; RECOVER.busy = false; RECOVER.done = true; HOST.afterRecover(f, out.R && out.R.fatigue || 0); };
    // (as the full-time card of a match played through: a man of the match is offered the press from it)
    // (the same card as a match played through: Continue in a footer that never scrolls away, the pointer let go, MF-4)
    const show = () => {
      const press = !!(R && HOST.pressOpen && HOST.pressOpen());
      const o = hudOverlay(cardBox(R ? HOST.ftCard(M, R) : "", `<button class="btn" data-ft="go">Continue</button>${press ? `<button class="btn ghost" data-ft="press">🎙 Talk to the press</button>` : ""}`), "ft");
      if (o) o.onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.ft === "go") return done();
        if (b.dataset.ft === "press") return void cardUp(hudOverlay(cardBox(HOST.press(), `<button class="btn ghost" data-ft="back">Back</button>`), "ft"));
        if (b.dataset.ft === "back" || b.classList.contains("media")) show();
      };
      cardUp(o);
    };
    show();
    RECOVER.finish = done;
  }});
  return true;
}

/* ---------- the test fixtures (1.4.20: __fp.enter("test:<name>")) ----------
   A pitch in the stadium with two sides of the given strength, no career calendar: 11v11 (a whole match from the
   kick-off), stamina (you alone with the ball on the half-way line), offside-<margin> (a through ball to a runner the
   given metres past the line), penalty, corner, gk-shots. The simulation is the real one. */
function testConfig(name, o = {}){
  const seed = o.seed != null ? o.seed : 1;
  const mk = (t, ovr) => {
    const slots = ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"];
    const players = slots.map((slot, i) => {
      const id = 50000 + t*100 + i, arch = slot === "GK" ? "GK" : ["LB", "CB", "RB"].includes(slot) ? "DF" : ["CM", "CDM"].includes(slot) ? "CM" : slot === "ST" ? "ST" : "W";
      const pos = slot === "GK" ? "GK" : arch === "DF" ? "DF" : arch === "CM" ? "CM" : arch === "ST" ? "ST" : slot;
      return {pid: id, name: (t ? "Rival " : "Tester ") + (i + 1), number: i + 1, slot, arch, isGK: slot === "GK", isMe: t === 0 && slot === (o.slot || "ST"),
        at: attrsForAI({id, ovr: o.meOvr && t === 0 && slot === (o.slot || "ST") ? o.meOvr : ovr, pos}), energy: 100};
    });
    const bench = ["GK", "CB", "CM", "LW", "ST"].map((slot, i) => ({pid: 50050 + t*100 + i, name: (t ? "Rival sub " : "Tester sub ") + (i + 1), number: 12 + i, slot,
      arch: slot === "GK" ? "GK" : slot === "CB" ? "DF" : slot === "CM" ? "CM" : slot === "ST" ? "ST" : "W", isGK: slot === "GK", at: attrsForAI({id: 50050 + t*100 + i, ovr, pos: slot === "GK" ? "GK" : slot === "CB" ? "DF" : slot}), energy: 100}));
    return {name: t ? "Rivals" : "Testers", short: t ? "RIV" : "TES", formation: slots, players, bench, ovr};
  };
  const teams = [mk(0, o.ovr || 60), mk(1, o.ovr || 60)];
  if (o.me) Object.assign(teams[0].players.find(p => p.isMe).at, o.me);
  // every player as tall as the body he is drawn as (MV-10; yours is your own look's, startMatch)
  for (const T of teams) for (const p of T.players.concat(T.bench)) p.scale = heightOf(p);
  return {seed, mode: "match", spec: makePitch({boards: true, roll: ROLL[2]}), halfRealSec: HALF_REAL[2], tempo: Object.assign({}, TEMPO[2]),
    teams, me: {team: 0, slot: o.slot || "ST", prefFoot: "Right", chem: 50, trust: 50, traits: o.traits || {},
      // (the career's staminaF, career.js: 1.6 - 1.15 stamina/100, when the fixture gives you a stamina; else 1)
      staminaF: o.me && o.me.stamina != null ? 1.6 - 1.15*o.me.stamina/100 : 1, role: name === "bench" ? "sub" : "starter",
      coachStyle: o.style || null},
    // (test:bench: a substitute planned on at o.subOn, 30 by default)
    rules: {offside: true, cards: true, subs: 5}, roleTimes: name === "bench" ? {subOn: o.subOn || 30} : {}, kickoffTeam: o.kickoffTeam != null ? o.kickoffTeam : 1, benchSide: -1, htAuto: false,
    ovr: [o.ovr || 60, o.ovr || 60], visible: visibleFn};
}
function enterTest(name, o){
  FS.test = name; FS.real = false; FS.f = null; FS.M = null; FS.R = null;
  enterMode("match");
  coverScreen();
  // (o.kits: a fixture's own pair, resolved as a real match's are)
  const kits = matchKits(o.kits || {home: ["#2c66b8", "#ffffff"], away: ["#c8463a", "#ffffff"]});
  build({tier: o.tier != null ? o.tier : 2, crowd: o.crowd != null ? o.crowd : 9000, cap: 28000, kits, clubs: {home: "Testers", away: "Rivals"}, at: "tunnelMouth", homeShare: .7});
  const cfg = testConfig(name.replace(/-.*$/, ""), o);
  // test:bench (A1.8): the warm-up's numbers for the test (the call's minute, the last match's set, the coach's style)
  // (warmLast: the last match's set as given, or "memory" for the one this session remembers, as a real match uses)
  FS.testWarm = name === "bench" ? {callAt: o.callAt != null ? o.callAt : null, last: o.warmLast === "memory" ? undefined : o.warmLast !== undefined ? o.warmLast : null, style: o.style || null,
    set: Array.isArray(o.warmSet) ? o.warmSet.slice() : null} : null;
  startMatch(cfg, kits);
  if (name === "bench") return enterBench(o);
  const ms = FS.ms, me = ms.agents[ms.me];
  FS.state = "live"; FS.onPitch = true;
  placeOwn({x: me.m.x, z: me.m.z, yaw: me.m.yaw}); P.yaw = me.m.yaw; P.pitch = -.12;
  handover();
  scenario(name, o);
  revealAfterFrames(2).then(() => liftCover(100));
  return true;
}
// test:bench (A1.8): you on the home bench, seated (o.seated false: on your feet by the dugout), the match from its
// kick-off with the clock at o.startMin, your change planned at o.subOn
function enterBench(o){
  const ms = FS.ms;
  if (o.startMin > 1) ms.clock.sec = (o.startMin - 1)*60;
  FS.state = "bench"; FS.onPitch = false; FS.V.pre = null;
  placeOwn({x: -10, z: -36.6, yaw: Math.PI}); P.yaw = Math.PI; P.pitch = -.1;
  if (o.seated !== false) sitDown("home");
  revealAfterFrames(2).then(() => liftCover(100));
  return true;
}
// a test's situation set up on the simulation's own state, before its first step (a cut: nothing has been drawn yet)
function scenario(name, o){
  const ms = FS.ms, me = ms.agents[ms.me];
  const put = (a, x, z, yaw = null) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; if (yaw != null){ a.m.yaw = a.m.heading = yaw; } };
  const live = () => { ms.restart = null; ms.phase = "live"; ms.clock.running = true; ms.ball.state = "free"; ms.cutStep = ms.step; };
  const ball = (x, z, vx = 0, vz = 0, y = .11, vy = 0) => { const b = ms.ball; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = vx; b.v.y = vy; b.v.z = vz; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = y <= .12; };
  if (name === "stamina" || name === "dribble"){
    live();
    for (const a of ms.agents){ if (a !== me && a.role === "player"){ put(a, a.team ? 40 : -40, a.m.z); a.onPitch = a.isGK; } }
    put(me, -10, 0, -Math.PI/2); ball(-9.35, 0);
    ms.poss.ctl = me.id; ms.poss.team = me.team; ms.poss.agent = me.id;
  } else if (name === "receive"){
    live();
    for (const a of ms.agents){ if (a !== me && a.role === "player") a.onPitch = a.isGK || a.id === 5; }
    const mate = ms.agents[5];
    put(me, 0, 0, Math.PI/2); put(mate, -20, 0, -Math.PI/2);
    ball(-19.3, 0);
    ms.poss.ctl = mate.id; ms.poss.team = mate.team;
  } else if (name.startsWith("offside")){
    // offside-<margin>: a runner (you) the given metres past the second-last defender as a team-mate plays it through
    const margin = parseFloat(name.split("-")[1] || "0.5") || .5;
    live();
    const dir = ms.dirs[me.team], defs = ms.agents.filter(a => a.team !== me.team && a.role === "player" && !a.isGK);
    // the back four on the line, wide of the pass's lane; the rest back towards the half-way line, out by the touchlines
    defs.forEach((a, i) => put(a, i < 4 ? dir*18 : dir*2, i < 4 ? [-20, -12, 12, 20][i] : (i % 2 ? 1 : -1)*(24 + i*.8), dir > 0 ? Math.PI/2 : -Math.PI/2));
    const line = dir*18, mate = ms.agents.find(a => a.team === me.team && a.slot === "CM");
    put(me, line + dir*margin, 0, -Math.PI/2*dir);
    put(mate, dir*-5, 0, -Math.PI/2*dir);
    for (const a of ms.agents) if (a.team === me.team && a !== me && a !== mate && a.role === "player" && !a.isGK) put(a, dir*-25, a.m.z);
    ball(mate.m.x + dir*.6, mate.m.z);
    ms.poss.ctl = mate.id; ms.poss.team = mate.team;
    // the team-mate plays it to your feet at once (the same Action record his brain would make)
    mate.m.yaw = mate.m.heading = Math.atan2(-(me.m.x - mate.m.x), -(me.m.z - mate.m.z));
    ball(mate.m.x + Math.sin(-mate.m.yaw)*.62, mate.m.z - Math.cos(mate.m.yaw)*.62);
    startAction(ms, mate, {kind: "pass", target: {x: me.m.x, y: .11, z: me.m.z}, recv: me.id, contact: 0});
    FS.testInfo = {margin, mate: mate.id, line};
  } else if (name === "penalty" || name === "corner"){
    // a penalty or a corner for your side, you the taker: the real restart (rules.js), its wall, its keeper, its runners
    const dir = ms.dirs[me.team];
    ms.phase = "live"; ms.clock.running = true;
    const spot = name === "penalty" ? {x: dir*(ms.spec.hx - 11), z: 0} : {x: dir*(ms.spec.hx - .3), z: ms.spec.hz - .3};
    startRestart(ms, name, me.team, spot);
    ms.restart.taker = me.id;
    put(me, spot.x - dir*2.2, spot.z*.95, dir > 0 ? -Math.PI/2 : Math.PI/2);
    ms.cutStep = ms.step;
  } else if (name === "gk-shots"){
    // your keeper faces a shot every few seconds: an opponent from 14 to 24 m, a seeded point in the frame (the test
    // driver below lines them up; the simulation does the rest)
    live();
    for (const a of ms.agents) if (a.role === "player" && !a.isGK && a !== me) a.onPitch = false;
    put(me, 0, -20, 0);
    FS.testDriver = gkShotsDriver;
    FS.testShot = {n: 0, t: -9};
  }
  void o;
}

// test:gk-shots: every 4 s (or once the ball is dead or in the keeper's hands) the next shooter is set up and shoots
function gkShotsDriver(){
  const ms = FS.ms, T0 = FS.testShot, gk = ms.agents[ms.gks[FS.cfg.me.team]];
  if (!gk) return;
  const ball = ms.ball, idle = ball.state !== "free" || Math.hypot(ball.v.x, ball.v.z) < .3 || ms.t - T0.t > 4;
  if (!idle || ms.t - T0.t < 1.2) return;
  const shooter = ms.agents.find(a => a.team !== gk.team && a.role === "player" && a.slot === "ST");
  if (!shooter) return;
  const r = ms.r, end = -ms.dirs[gk.team];            // the goal the keeper keeps
  const d = 14 + 10*r(), ang = (r() - .5)*1.1;
  const x = end*(ms.spec.hx - d*Math.cos(ang)), z = d*Math.sin(ang);
  shooter.onPitch = true;
  shooter.m.x = shooter.x0 = x; shooter.m.z = shooter.z0 = z; shooter.m.vx = shooter.m.vz = shooter.m.speed = 0;
  const tx = end*ms.spec.hx, tz = (r() - .5)*6.4, ty = .2 + 2*r();
  shooter.m.yaw = shooter.m.heading = Math.atan2(-(tx - x), -(tz - z));
  ball.p.x = x - Math.sin(shooter.m.yaw)*.62; ball.p.y = .11; ball.p.z = z - Math.cos(shooter.m.yaw)*.62;
  ball.v.x = ball.v.y = ball.v.z = 0; ball.w.x = ball.w.y = ball.w.z = 0; ball.state = "free"; ball.holder = -1;
  if (gk.gk){ gk.gk.state = "ready"; gk.gk.plan = null; }
  gk.act = null; ms.restart = null; ms.phase = "live"; ms.poss.ctl = -1; ms.cutStep = ms.step;
  startAction(ms, shooter, {kind: "shot", target: {x: tx, y: ty, z: tz}, power: .7 + .3*r(), contact: 0, recv: -1});
  T0.n++; T0.t = ms.t;
}

/* ---------- test hooks (1.4.20) ---------- */
window.__fp = {
  get ms(){ return FS.ms; }, me: () => FS.ms && FS.ms.me >= 0 ? FS.ms.agents[FS.ms.me] : null, ball: () => FS.ms ? FS.ms.ball : null,
  seed(n){ FS.seedOverride = n; }, enter: (f, o) => enter(f, o || {}), exit: () => abort(),
  // n fixed steps of play as live play does them (your input first), no drawing
  stepN(n){ let k = 0; for (; k < n && FS.ms && FS.ms.phase !== "over"; k++){ oneStep(); events(); } mirror(); return k; },
  // headless to the match second untilSec (5400: to the end), half time and full time handled as live play does,
  // and at the end full time settled and the day left (the career's side)
  headless(untilSec = 5400){
    const ms = FS.ms; if (!ms) return null;
    FS.headless = true;
    // (played out with nobody at the keys: your agent plays as the harness's stand-in for you, as it does in the tests)
    const meAI = ms.meAI; ms.meAI = true;
    let guard = 0;
    while (ms.phase !== "over" && (untilSec >= 5400 || matchSec(ms) < untilSec) && guard++ < 2e6){
      if (ms.phase === "halftime"){ writeCheckpoint(true); secondHalf(ms); continue; }
      oneStep();
    }
    FS.headless = false; ms.meAI = meAI;
    events();
    const meA = ms.agents.find(a => a.isMe) || (ms.resumedMe != null ? ms.agents[ms.resumedMe] : null);
    const out = {phase: ms.phase, sec: ms.phase === "over" ? 5400 : matchSec(ms), score: ms.score.slice(), my: meA ? deriveMy(ms, meA.id) : null};
    if (ms.phase === "over" && untilSec >= 5400){
      FS.state = "fulltime"; const R = settle();
      out.rating = R ? R.rating : null; out.mt = R && R.R ? {mins: R.R.mins, xp: R.R.xp, res: R.R.res} : null;
      leave();
    }
    return out;
  },
  input: ev => input(ev), get ctrl(){ return CTRL; }, get state(){ return FS.state; }, FS, FP, MC, FX, CN,
  // (UF-B, USER-ISSUES U2, U8, U11: the fourth official, the look's aura, the match's kits as resolved)
  FOURTH, AURA, get kits(){ return FS.kits; }, get stadium(){ return STADIUM; },
  hud: () => document.getElementById("fpHud"), checkpoint: () => writeCheckpoint(true),
  events: kind => FS.ms ? FS.ms.events.filter(e => !kind || e.kind === kind) : [],
  ready(){ FS.ready = true; }, manager: () => manager(), headOut: () => headOut(), spot: () => FS.ms && FS.ms.me >= 0 ? mySpot() : null, skipToCall: () => startSkip("call"), skipFrame: () => skipFrame(), recover: () => recoverCheck(), RECOVER,
  harness: {runOne}, testInfo: () => FS.testInfo || null, sitDown: s => sitDown(s || "home"), leave: () => leave(),
  halftimeGo: () => secondHalfGo(),
  // (P2-A) the flags a moment leaves for later (MF-8), whether a card has the mouse, where a substitute steps on
  clearMatchFlags: () => clearMatchFlags(), mouseCard: () => mouseCard(), offPlay: () => offPlay(), entrySpot: () => FS.ms ? entrySpot() : null,
  // your stride's rhythm for a strike with this foot now (A1.7: control.js rhythmOf, a copy of its record)
  rhythm: (foot = "R") => { const me = liveMe(); return me ? Object.assign({}, rhythmOf(me, foot)) : null; },
  // the warm-up (A1.8, WP-W1): its session, the pool, the pure rules, the port it used (the stand-in in the tests)
  warm: {
    get S(){ return WARM; }, POOL: WARM_POOL, WU, pickSet, boostFor, boostedAttrs, callMinute, exerciseCount, exScore,
    port: () => FS.wport, testPort: () => FS.testPort || null, boostLive: () => FS.boostLive, wb: () => FS.wb, icon: () => warmIcon(),
    stand: () => FS.seated ? standUp() : null
  }
};
void DEG; void sprintSpeed; void wrapA; void yawOf; void onSec;
