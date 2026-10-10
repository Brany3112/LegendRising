/* ============ LIFE: the first-person world ============
   Owner: WP-0A in Stage 0; frozen in Stages 1 and 2 (changes through the integrator's hook queue); WP-T2 for its
   strings in Stage 3. Contract: DESIGN 1.2 (what world.js keeps), 1.4.1, 1.4.20, 3.7.1, 2.2 WP-0A.
   Your flat in a brick block, the street with the Mini Market and your job, the bus to the training ground, and the
   tunnel that hands you to the match. This file boots the renderer, builds the zones, runs the loop, binds the input
   and hands it to the input router, and puts together what the zones (ctx), the drills (host), the introduction and
   build mode drive the world through. Everything else lives in core/: the shared state, the modes, the camera owners,
   the scheduler, collision, how you move, your body and the life camera, your hands, the HUD, what you do with your
   day, cinematics and the tunnel. */
import {THREE, W, begin} from "./build.js";
import {buildHome, homeTick, resetHome, HOME, lockKey} from "./home.js";
import {buildGround, GROUND} from "./ground.js";
import {buildTown, TOWNZ} from "./town.js";
import {compassInit, compassStep, compassReset} from "./compass.js";
import {ensureHome, mailOpen, closeMail} from "./rent.js";
import {createSky} from "./sky.js";
import {drillWarmup} from "./drills.js";
import {VIEW} from "./human.js";
import {onboardInit, onboardStart, onboardTick, onboardZone} from "./intro.js";
import * as INV from "./inv.js";
import {refreshParcels, resetParcels} from "./parcels.js";
import {MINI, miniInput, miniStep, screwIn, startMini} from "./mini.js";
import {BM, buildInit, buildEnter, buildExit, buildKey, buildPan} from "./buildmode.js";
import {G, LIFE, P, keys, B, E, ME, RT, FLAGS, FADE, sync} from "./core/state.js";
import {registerMode, enterMode, exitMode, mode, modeFlags, modeStep, modeSlice, modeLookLocked, registerZone, zoneSpec, pushInput, popInput,
  routeInput, locked, tutOn, clockScale, setClockScale, onbEmit, bootPlan, bootPlanFor, bootCover, bootCoverCheck, liftBootCover, revealAfterFrames,
  framePresented, persist, persistNow, saveNowIf, SAVE} from "./core/modes.js";
import {camPush, camPop, camTop, camOwners, camKick, camApply, KICK} from "./core/camera.js";
import {SCHED} from "./core/sched.js";
import {Q, GT, createRenderer, gpuBegin, gpuEnd, quality, resize, warmNow} from "./core/quality.js";
import {SG, CG, camGridBuild, camCast, hits, findInside, inside} from "./core/collide.js";
import {GAIT, body, fovStep, moveInput} from "./core/move.js";
import {meBuild, meDispose, viewStep, toggleView, meCamInit, sstep, meFade} from "./core/me.js";
import {target, use, clickUse, throwHand, holdStep, heldMeshDrop, flyEnd, flying, dropSpot, spawnDrops, HOLD, HOLD_GRACE, HOLD_TAP} from "./core/hand.js";
import {hud, hudReset, HUD, note, fade, noteWhenClear, clockText} from "./core/hud.js";
import {actsInit, pass, sleep, sleepDay, eat, bus, water, work, bath, shower, iceBath, drill, reps, session, mail, robbed, timeLapse, stepBusy,
  closingTime, closingReset, mailNews, lifeRefresh} from "./core/acts.js";
import {CINE, cineBegin, cineEnd, shake} from "./core/cine.js";
import {TUN, tunnelInit, tunnel, toMatch} from "./core/tunnel.js";

export {LIFE};
const TIME_RATE = .5, TIME_RATE_MOVING = .85;       // game minutes per real second
// running costs what running costs (daily.js ACT.run), walking pace until the day has a rate for it
const RUN_ACT = () => typeof ACT === "object" && ACT && ACT.run ? "run" : "walk";

/* ---------- what the zones and the drills drive the world through ---------- */
const ctx = {note, fade, pass, sleep, eat, bus, toMatch, openMail:mail, minute:() => LIFE.min,
  wait:where => openWait(where), reps, drill, session, computer:where => openComputer(where), shop:() => openShop("market"), vend:() => openShop("vend"),
  water, work, bath, shower, iceBath, warm:() => warm(), look:() => { if (typeof openLookEditor === "function") openLookEditor("mirror"); },
  barber:() => { if (typeof openBarber === "function") openBarber(); }, sleepDay,
  // hands-on jobs (mini.js), and putting something back in your hands when one is abandoned
  screw:o => screwIn(o), mini:o => startMini(o), giveBack:it => { if (it && !INV.take(it) && !INV.stow(it)) INV.addDrop({zone:LIFE.zone, x:P.x, y:P.feet + .02, z:P.z, ry:0, item:it}); },
  timeLapse:(mins, act, label, done, o) => timeLapse(mins, act, label, done, o), hand:() => INV.hand(), take:it => INV.take(it), release:() => INV.release(), persist,
  place:p => place(p), robbed:lost => robbed(lost),
  // something left lying here for good (it is saved with the place, and is there when you come back): x.mesh to reuse one
  dropAt:(it, x, y, z, ry = 0, x2 = {}) => { const d = Object.assign({zone:LIFE.zone, x, y, z, ry, item:it}, x2.tag || {}); INV.addDrop(d); dropSpot(d, x2.mesh || INV.itemMesh(it)); return d; },
  busMenu:() => { if (typeof openBus === "function") openBus(LIFE.zone); }};
// the host a drill drives the world through (drills.js): it runs as the mode drill (core/acts.js)
const host = {
  P, place:p => place(p), note, pass:(m, act) => pass(m, act),
  jump(h){ P.drillY = h; }, bob(y){ P.bobY = y; }, warm:() => warm(),
  // your body in a drill: act({mode, t}) plays a move of human.js (kick, pass, trap, header) at that point; act(null) lets go
  act(st){ ME.act = st ? Object.assign(ME.act && ME.act !== st ? ME.act : {}, st) : null; }, actT:() => ME.act && typeof ME.act.t === "number" ? ME.act.t : 0,
  scale:() => ME.scale || 1, scene:() => RT.scene, body:() => ME.tp, cam:() => RT.cam,
  endDrill(){ if (mode() === "drill") exitMode("done"); else { P.drillY = 0; P.bobY = 0; ME.act = null; } }
};
actsInit({enterZone:(z, at) => enterZone(z, at), host});
tunnelInit({stop:() => stop(), resumeLife:() => resumeLife(), place:p => place(p)});

/* ---------- zones ---------- */
registerZone("home", {build:c => { GROUND.fridge = null; return buildHome(c); }, tick:() => { if (modeFlags().homeTick) homeTick(); }});
registerZone("ground", {build:c => { resetHome(); return buildGround(c); }, tick:() => closingTime(modeFlags().closing)});
registerZone("town", {build:c => { resetHome(); GROUND.fridge = null; return buildTown(c); }});
function lights(){ if (RT.SKY) RT.SKY.attach(RT.scene); FLAGS.forceSky = true; }
function clearScene(){
  const scene = RT.scene;
  scene.traverse(o => {
    if (o.userData && o.userData.keep) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material){ for (const m of [].concat(o.material)){ if (m.userData && m.userData.keep) continue; if (m.map && m.map.isCanvasTexture && !m.map.userData.per) m.map.dispose(); m.dispose(); } }
  });
  while (scene.children.length) scene.remove(scene.children[0]);
  lights();
}
let spawns = {};
// opts.cam: the pose the first frames will be drawn from ({pos, look}), to warm up from
function enterZone(zone, at, opts = null){
  // a zone nobody has registered (its module not loaded yet: stadium.js registers itself when it is imported) is a
  // caller's mistake: it throws before anything is torn down, so the place you are in stays as it was, and nothing is
  // ever built as the flat under another zone's name
  if (!zoneSpec(zone)) throw new Error(`enterZone: no zone "${zone}" is registered. Import its module (it registers itself) before entering it.`);
  if (mode() !== "life" && modeFlags().leaveOnZone) exitMode("zone");
  if (BM.on) buildExit();
  const was = zoneSpec(LIFE.zone); if (was && was.leave) was.leave();
  // out of town or to the training centre: your flat is a long way off
  if (zone !== "home" && typeof lifeAway === "function") lifeAway(true);
  closingReset();
  HOLD.sp = null; heldMeshDrop(); flyEnd(); resetParcels();
  LIFE.zone = zone; W.zone = zone;
  meDispose(); clearScene(); begin(RT.scene);
  spawns = zoneSpec(zone).build(ctx, opts) || {};
  compassReset();
  camGridBuild();
  spawnDrops();
  meBuild();
  RT.renderer.shadowMap.needsUpdate = true;
  const p = typeof at === "object" && at ? at : spawns[at] || spawns[zone === "home" ? "bed" : "bus"];
  place(p);
  FLAGS.forceSky = true; skyStep(0);
  hudReset({prompt:false, ctx:false});
  warm(opts && opts.cam);
  onboardZone(zone);
  onbEmit("zone", {zone});
}
/* Shaders are compiled and textures uploaded the first time something is drawn, which, with frustum culling, is the
   first time you turn to face it: a hitch exactly while you move the mouse. Do it all up front instead, including what
   is built but hidden for now (the squad before training, a drill's props), which would otherwise compile the moment it
   appears. compile() does not cover the shadow pass's own depth shaders or a skinned figure's bone texture, so one real
   frame is drawn here too, behind the fade, with everything showing, from the camera that will be shown first (pose:
   {pos, look}, or your eyes). Exposed to the zones as ctx.warm() for anything they add later. */
function warm(pose){
  const scene = RT.scene;
  // a drill's rings, lamp and ball are only built when it starts: draw a set of them now, so none compiles mid-play
  const props = LIFE.zone === "ground" ? drillWarmup() : null;
  if (props){ props.visible = false; scene.add(props); }
  // the one warm-up path (quality.js warmNow, DESIGN 3.9.6): from the pose asked for, or from your eyes
  const c = Math.cos(P.pitch);
  warmNow(pose && pose.pos && pose.look ? pose : {pos:[P.x, P.eye, P.z], look:[P.x - Math.sin(P.yaw)*c, P.eye + Math.sin(P.pitch), P.z - Math.cos(P.yaw)*c]});
  if (props){ scene.remove(props); props.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}
// you, put somewhere: standing still, the view level, the springs at rest
function place(p){
  P.x = p.x; P.z = p.z; P.feet = p.y || 0; P.eye = P.feet + P.eyeH; P.yaw = p.yaw || 0; P.pitch = 0;
  P.vx = P.vz = P.vy = 0; P.speed = 0; P.sprint = 0; P.moveMode = "idle";
  B.amt = B.y = B.yv = B.x = B.xv = 0; E.g = P.feet; E.a = E.av = E.b = E.bv = 0; TUN.go = false; TUN.info = null;
  ME.yaw = P.yaw; ME.tw = 0; ME.look = 0;                // your body turns up facing the way you do
  ME.tpShown = false; ME.near = ME.nearT = 0;             // and a third-person camera starts afresh, not gliding from where you were
  COVER.snap = true;                                        // and the light indoors or out is the one where you now are
  // where you are, for anything that steps out of your way or keeps a door off you (home.js), before a frame is drawn
  VIEW.x = P.x; VIEW.y = P.eye; VIEW.z = P.z; VIEW.feet = P.feet;
}

/* ---------- the sky ----------
   How much of the sky over your head is roofed over: five rays from your eyes, straight up and leaning 30 degrees four
   ways, each cast again ten times a second; 0 out in the open, 1 under a ceiling, in between under a shelter or a
   canopy. Eased, so walking in through a door the light inside comes up over half a second or so. The rays are cast
   one at a time in turn, not five in one frame (DESIGN 1.5.11: at most 12 camera rays a frame in the open), all five
   at once only when the answer is needed now (a new place, the sky forced) */
const hour = () => (LIFE.min/60) % 24;
let skyT = 0;
const COVER_RAYS = [[0, 1, 0], [.5, .866, 0], [-.5, .866, 0], [0, .866, .5], [0, .866, -.5]];
const COVER = {v:0, want:0, t:0, snap:true, hit:COVER_RAYS.map(() => 0), i:0};
const coverRay = i => { const d = COVER_RAYS[i]; COVER.hit[i] = camCast(P.x, P.eye, P.z, d[0], d[1], d[2], 14) < 14 ? 1 : 0; };
function coverStep(real){
  const snap = FLAGS.forceSky || COVER.snap, n = COVER_RAYS.length; COVER.snap = false;
  if (snap){ for (let i = 0; i < n; i++) coverRay(i); COVER.t = .1/n; }
  else if ((COVER.t -= real) <= 0){ COVER.t += .1/n; if (COVER.t <= 0) COVER.t = .1/n; COVER.i = (COVER.i + 1) % n; coverRay(COVER.i); }
  let h = 0; for (let i = 0; i < n; i++) h += COVER.hit[i];
  COVER.want = h/n;
  COVER.v = snap ? COVER.want : COVER.v + (COVER.want - COVER.v)*(1 - Math.exp(-4*real));
  return COVER.v;
}
function skyStep(real){
  const SKY = RT.SKY; if (!SKY) return;
  const h = hour();
  SKY.update(h, P, real, coverStep(real));
  SKY.lights(real || .016, {x:P.x, y:P.eye, z:P.z});
  skyT -= real;
  if (skyT <= 0 || FLAGS.forceSky){ skyT = .5; SKY.refresh(RT.renderer, RT.scene, h, P, FLAGS.forceSky); FLAGS.forceSky = false; }
  SKY.shade(RT.renderer, real);
}

/* ---------- a frame ---------- */
const AIM = {label:null};
const SV = {cam:null, frustum:null, cx:0, cy:0, cz:0};       // where the camera was, for the scheduler's tiers
function step(dt, real){
  const fl = modeFlags(), lk = locked();
  if (!lk) mouseFrame(); else MA.x.hold = MA.y.hold = 0;
  const mv = moveInput(lk);
  // a long frame (under 20 fps) is lived in equal slices of at most 1/20 s: the world keeps real time (a walk is 2 m a
  // second at any frame rate) and nothing (the springs, a drill's ball, a figure's animation) takes a step longer than
  // it was made for. Your own movement first, then the world's little things ('anims'), then the mode's
  const n = Math.max(1, Math.ceil(dt/.05 - 1e-6)), h = dt/n;
  for (let i = 0; i < n; i++){
    if (fl.movement !== "own") body(h, mv.f, mv.r, mv.len, mv.run);
    SCHED.slice(h);
    if (!FLAGS.lockLost) modeSlice(h);
  }
  if (RT.cam){ SV.cam = RT.cam; SV.cx = RT.cam.position.x; SV.cy = RT.cam.position.y; SV.cz = RT.cam.position.z; }
  SCHED.frame(real, SV);
  if (!FLAGS.lockLost) modeStep(dt, real);
  fovStep(dt, fl.movement !== "own");
  // the camera last, after anything (a drill) that moves or turns you: what the mouse did this frame is on screen this frame
  camApply(dt);
  const now = modeFlags();
  if (LIFE.zone === "ground") tunnel(now.tunnel);
  const tg = now.targeting;
  FLAGS.held = !tg ? null : FLAGS.grab || target(typeof tg === "function" ? tg : null);
  const lab = FLAGS.held ? FLAGS.held.label : null;
  if (lab !== AIM.label){ AIM.label = lab; onbEmit("aim", {label:lab, kind:FLAGS.held ? FLAGS.held.kind : null}); }
  holdStep(dt);
  onboardTick(dt);
  hud(FLAGS.held);
}
let last = 0, raf = null, frames = 0, presented = 0, keysT = 0, shadowT = 0;
function loop(t){
  if (!LIFE.running) return;
  const t0 = performance.now(), real = Math.max(0, (t - last)/1000 || 0); last = t;
  tick(real, t0, true);
  raf = requestAnimationFrame(loop);
}
// one frame of the world. The loop draws it; a test stepping the world by hand (__life.stepN) lives the same frame
// with nothing drawn, so the resolution governor, which times real frames, is left out too
function tick(real, t0, draw){
  frames++;
  const dt = Math.min(.1, real), r10 = Math.min(real, .1);
  if (real > 0 && real < .5) MA.frame += (real*1000 - MA.frame)*.2;
  if (Q.pending) resize();
  step(dt, Math.min(real, .5));
  const fl = modeFlags();
  // the clock runs on its own, faster while you are on the move, at the mode's say; it stops while a panel or the hub is up
  if (MINI.on) miniStep(r10);
  if (FLAGS.busy) stepBusy(r10);
  else if (fl.clock === "life" && !FLAGS.modal && !tutOn() && !MINI.on && (document.pointerLockElement || (window.lifeMode && window.lifeMode() === "hand"))){
    const run = P.moveMode === "run" || P.moveMode === "sprint";
    pass(r10*(FLAGS.moving ? TIME_RATE_MOVING : TIME_RATE)*clockScale(), run ? RUN_ACT() : FLAGS.moving ? "walk" : "idle");
  }
  skyStep(r10);
  const zs = zoneSpec(LIFE.zone); if (zs && zs.tick) zs.tick(r10);
  if (fl.compass) compassStep(r10, P);
  // something that throws a shadow has moved (a door swinging): redraw the sun's shadows, at most five times a second
  if (W.shadowDirty && (shadowT -= real) <= 0){ W.shadowDirty = false; shadowT = .2; RT.renderer.shadowMap.needsUpdate = true; }
  // a mode may leave a frame undrawn (the bench watched above 1x is drawn at 30 Hz, controller.js): once, this frame
  const thin = FLAGS.skipDraw; FLAGS.skipDraw = false;
  if (draw && !thin){ gpuBegin(); RT.renderer.render(RT.scene, RT.cam); gpuEnd(); presented++; framePresented(camTop()); }
  // people step out of YOUR way, wherever the camera is: drawing set VIEW to the camera (and the way it looks, fx/fz);
  // in third person that is 2.6 m behind you, so the position goes back to your own head. The camera's own position
  // stays readable as VIEW.cx/cy/cz for anyone who needs what the camera can see rather than where you are
  VIEW.cx = VIEW.x; VIEW.cy = VIEW.y; VIEW.cz = VIEW.z;
  VIEW.x = P.x; VIEW.y = P.eye; VIEW.z = P.z; VIEW.feet = P.feet;
  if (draw && !thin && real > 0 && real < .5) quality(real, performance.now() - t0);
  // a save every 45 s or so, but only at a quiet moment (modes.js persist); after two minutes of never stopping, anyway.
  // A mode that defers saves gets none of these: it saves at its own safe moments (persistNow)
  if ((SAVE.t += real) > 45){ SAVE.due = true; SAVE.t = 0; }
  if (SAVE.due){
    SAVE.dueT += real;
    const still = !P.speed && !Object.keys(keys).some(k => keys[k]) && performance.now() - mouseT > 1200 && !FLAGS.grab;
    if (fl.saves !== "defer" && !MINI.on && (!FLAGS.busy && (still || FLAGS.modal || !document.pointerLockElement) || SAVE.dueT > 120)) saveNowIf();
  }
  // the key hints fade after a while on screen, counted only while they can be read (not under a cinematic, build mode,
  // a panel, the hub or a card)
  if (fl.hud !== "none" && !FLAGS.modal && !tutOn() && !(window.lifeHubOut && window.lifeHubOut())){ keysT += real; if (keysT > 22) document.getElementById("lifeKeys").classList.add("faded"); }
  bootCoverCheck();
  if (DAILY.seasonPending && !FLAGS.busy && !FLAGS.modal && mode() === "life") seasonOver();
}
// the season ended in the night: the hub comes up with the end-of-season screen
function seasonOver(){
  const sum = DAILY.seasonPending; DAILY.seasonPending = null;
  if (window.lifeHub) window.lifeHub();
  setTimeout(() => { if (typeof screenSeasonEnd === "function") screenSeasonEnd(sum); }, 650);
}

/* ---------- start, stop, come back ---------- */
function boot(){
  if (RT.renderer) return;
  const cv = document.getElementById("lifeCanvas");
  createRenderer(cv);
  RT.scene = new THREE.Scene();
  RT.cam = new THREE.PerspectiveCamera(74, 1, .1, 600);   // a 10 cm near plane: twice the depth precision of 5 cm, and the eye is kept further than that from any wall
  // (for tests, DESIGN 1.4.20: __life.cam.top() is the camera's owner, __life.cam.kicks the kick springs)
  Object.defineProperties(RT.cam, {top:{value:camTop}, kicks:{value:KICK}});
  RT.SKY = createSky(RT.renderer);
  resize(); addEventListener("resize", () => { Q.pending = true; });
  bindInput(cv);
  compassInit({zone:() => LIFE.zone});
  meCamInit();
}
/* The screen is covered (#lifeFade) before the world is shown and lifted only once it has been drawn twice, so neither
   a half-built zone nor the wrong place is ever seen. A boot plan (bootPlan, firstday.js) may say where to start and
   keep the cover to lift it itself */
export function startLife(opts = {}){
  const s = G(); if (!s) return;
  ensureHome(); dailyEnsure(); sync();
  const plan = bootPlanFor(opts);
  bootCover();
  if (plan && plan.cover) document.body.classList.add("cine");
  document.getElementById("lifeRoot").style.display = "block";
  boot();
  FEED.reset(); FEED.moneySync(true); HUD.ctxT = 0;       // (and the line under the clock is brought up to date at once)
  INV.render();
  const zone = (plan && plan.zone) || opts.zone || "home";
  enterZone(zone, (plan && plan.at) || opts.at || (zone === "home" ? "bed" : "bus"), plan && plan.cam ? {cam:plan.cam} : null);
  if (zone === "ground") arriveForTraining();
  LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop);
  keysT = 0; document.getElementById("lifeKeys").classList.remove("faded");
  if (!(plan && plan.cover)) revealAfterFrames(2).then(() => liftBootCover(500));
  const h = s.home, first = h.letters.some(l => !l.read) && LIFE.day === 1;
  const f = todaysFixture();
  if (onboardStart()) return;                      // a new career: the first-day introduction takes it from here
  if (opts.later){ noteWhenClear(opts.later); mailNews(); return; }
  TUN.quiet = false;
  const ride = busMins(LIFE.zone, "ground") || busMins("home", "ground");   // daily.js: road works on your street included
  note(opts.msg || (first ? `This is your flat, ${h.apt}. Your uncle paid the first three months. Check your mailbox in the lobby.`
    : f ? `${todayName()}, ${clockText()}. It's match day, and kick-off is at ${clockText(fixtureSlot(f).min)}.` : `${todayName()}, ${clockText()}. ${trainingDay() ? `Training is at ${clockText(SESSION.start)}, and the bus takes ${ride} minutes.` : todayLine() + "."}`));
  mailNews();
}
export function stop(){ if (SAVE.due) saveNowIf(); LIFE.running = false; if (raf) cancelAnimationFrame(raf); raf = null; FLAGS.grab = null; document.exitPointerLock && document.exitPointerLock(); }
export function resumeLife(){
  if (!document.body.classList.contains("life") || !RT.renderer) return;
  lifeRefresh();
  TUN.info = null; sync(); FLAGS.forceSky = true;
  mailNews();
  if (!LIFE.running){ document.getElementById("lifeRoot").style.display = "block"; LIFE.running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
}

/* ---------- the mouse ----------
   Raw mouse counts where the browser allows it (no OS acceleration, and free of the stray jumps some browsers put in
   accelerated pointer-lock movement); anything else falls back to an ordinary lock */
let rawMouse = false, freshLock = false, mouseT = 0;
const RAW_OK = (() => { try { const b = navigator.userAgentData && navigator.userAgentData.brands; return !!(b && b.some(x => /Chromium/.test(x.brand))); } catch(e){ return false; } })();
function lock(cv){
  if (!LIFE.running || locked() || document.pointerLockElement === cv) return;
  const plain = () => { rawMouse = false; try { const q = cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch(e){} };
  try {
    const p = cv.requestPointerLock({unadjustedMovement:true});
    // only Chromium implements unadjustedMovement; another browser may take the lock and ignore the option, and its
    // movement is then not raw at all, so the lock counts as raw only where the option can have been honoured
    if (p && p.then) p.then(() => { rawMouse = RAW_OK && document.pointerLockElement === cv; }, plain); else rawMouse = false;
  } catch(e){ plain(); }
}
/* Stray jumps. Ordinary (non-raw) pointer lock in some browsers now and then reports one event with a jump in it: the
   cursor warped back to the centre, a large count the wrong way in the middle of a turn. A real hand can be just as
   sudden (Chrome adds a whole frame's movement into one event, so a flick at a low frame rate is hundreds of counts at
   once), so size alone decides nothing and nothing the same way as you are turning, or from rest, is ever held back: it
   turns the view at once. Only an event that is large, far larger than the movement just before it, AND the other way
   to a turn in progress is held, but never past the next frame drawn. If another event comes before then and goes on
   the way the turn was going, it was a jump and is dropped; if it goes the new way too (you really did snap back), both
   are applied; if nothing contradicts it, it is applied at the start of the next frame, so a real flick is on screen in
   the very next frame. Raw input never jumps, and nothing in it is ever held. */
const MA = {x:{prev:0, hold:0, age:0}, y:{prev:0, hold:0, age:0}, t:0, frame:16};
function mouseAxis(a, m){
  let out = 0;
  if (a.hold && m){
    if (Math.sign(m) === Math.sign(a.hold)){ out += a.hold; a.prev = a.hold; }
    a.hold = 0;
  }
  if (!m) return out;
  if (!rawMouse && Math.abs(a.prev) >= 4 && Math.sign(m) !== Math.sign(a.prev) && Math.abs(m) > 250 && Math.abs(m) > 8*(Math.abs(a.prev) + 12)){ a.hold = m; a.age = 0; return out; }
  a.prev = m;
  return out + m;
}
// once a frame, before the camera is set: a held event that nothing contradicted since is let through. A pause longer
// than a couple of frames is a hand at rest, and what comes after it is judged from rest
function mouseFrame(){
  if (performance.now() - MA.t > Math.max(60, 2.5*MA.frame)) MA.x.prev = MA.y.prev = 0;
  let mx = 0, my = 0;
  if (MA.x.hold && ++MA.x.age >= 1){ mx = MA.x.hold; MA.x.prev = MA.x.hold; MA.x.hold = 0; }
  if (MA.y.hold && ++MA.y.age >= 1){ my = MA.y.hold; MA.y.prev = MA.y.hold; MA.y.hold = 0; }
  if (mx || my) look(mx, my);
}
// the view turns here, once per event, with no smoothing; step() puts it on the camera before this frame is drawn
function look(mx, my){
  if (FLAGS.grab){ dragBy(mx, my); return; }
  if (modeLookLocked()) return;
  P.yaw -= mx*.0021;
  P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - my*.0021));
}
const _e = new THREE.Vector3(), _h = new THREE.Vector3();
function dragBy(mx, my){
  // which way does the free edge of the door move on screen when it opens?
  const grab = FLAGS.grab, cam = RT.cam, e = grab.edge(), h = grab.hinge();
  const rx = e.x - h.x, rz = e.z - h.z;
  _e.copy(e).project(cam);
  _h.set(e.x + grab.spin*rz*.05, e.y, e.z - grab.spin*rx*.05).project(cam);
  let sx = _h.x - _e.x, sy = _h.y - _e.y; const l = Math.hypot(sx, sy) || 1; sx /= l; sy /= l;
  const c = cam.position;
  const toward = Math.hypot(e.x + grab.spin*rz*.05 - c.x, e.z - grab.spin*rx*.05 - c.z) < Math.hypot(e.x - c.x, e.z - c.z) ? 1 : -1;
  grab.drag((mx*sx - my*sy)*.005 + my*toward*.0045);
}

/* ---------- input ----------
   The browser's events become router events (core/modes.js routeInput): handlers pushed by whoever needs them first,
   then the running mode's, then life's own below */
const MOVE_KEYS = ["w", "a", "s", "d", "e", "shift", " "];
function lifeInput(ev){
  if (ev.type === "down"){
    // the keypad phone in your hand: the left button chooses on it, it doesn't pick anything up
    if (window.lifeMode && window.lifeMode() === "hand" && window.kpMouseOk && window.kpMouseOk()) return true;
    if (FLAGS.held && FLAGS.held.kind === "drag") FLAGS.grab = FLAGS.held;
    if (!locked()) clickUse();
    return true;
  }
  if (ev.type === "move"){ look(ev.dx, ev.dy); return true; }
  if (ev.type === "keydown"){
    const k = ev.key;
    if (MOVE_KEYS.includes(k) && ev.prevent) ev.prevent();
    keys[k === " " ? "space" : k] = true;
    if (ev.repeat) return true;
    if (k === "h"){ const el = document.getElementById("lifeKeys"); el.classList.toggle("faded"); keysT = -999; }
    if (k === "v") toggleView();
    if ((k === "1" || k === "2") && !locked()) INV.swap(+k - 1);
    if (k === "g") throwHand();
    if (k === "b" && !locked()) enterBuild();
    if (k === "f" && !locked() && LIFE.zone === "home") lockKey(P);
    if (k === "e" && !locked()){
      const tg = modeFlags().targeting, t = FLAGS.held || (tg ? target(typeof tg === "function" ? tg : null) : null);
      HOLD.done = false;
      if (t){ if (t.long){ HOLD.sp = t; HOLD.t = 0; } else use(t); }
    }
    return true;
  }
  if (ev.type === "keyup"){
    // a spot that can be held: a short press is the ordinary use, released before the ring has filled
    if (ev.key === "e" && HOLD.sp){ const sp = HOLD.sp, t = HOLD.t; HOLD.sp = null; if (t < HOLD_TAP && !HOLD.done && !locked()) use(sp); }
    return true;
  }
  return false;
}
function bindInput(cv){
  const lockedHere = () => document.pointerLockElement === cv;
  cv.addEventListener("click", () => lock(cv));
  window.lifeRelock = () => lock(cv);
  window.lifeClearKeys = () => { for (const k in keys) keys[k] = false; FLAGS.grab = null; };
  document.addEventListener("pointerlockchange", () => {
    const on = lockedHere();
    FLAGS.lockLost = !on && !!modeFlags().pauseOnUnlock;
    if (!on && MINI.on && !MINI.on.spec.free) miniInput("key", "escape", true);           // Esc took the pointer: that is giving up
    freshLock = on; MA.x.prev = MA.y.prev = MA.x.hold = MA.y.hold = 0;
    const dh = document.getElementById("lifeDrill"); if (dh) dh.classList.toggle("paused", FLAGS.lockLost);
    routeInput({type:"lock", locked:on});
  });
  addEventListener("mousedown", e => {
    if (MINI.on && lockedHere()){ miniInput("down", e.button); return; }
    if (e.button !== 0 || !lockedHere()) return;
    routeInput({type:"down", button:e.button, locked:true}, lifeInput);
  });
  addEventListener("mouseup", e => {
    if (MINI.on){ miniInput("up", e.button); return; }
    if (e.button !== 0) return;
    FLAGS.grab = null;
    routeInput({type:"up", button:e.button, locked:lockedHere()}, lifeInput);
  });
  addEventListener("mousemove", e => {
    if (MINI.on && lockedHere()){ miniInput("move", e.movementX || 0, e.movementY || 0); return; }
    if (!lockedHere() || locked()) return;
    let mx = e.movementX || 0, my = e.movementY || 0;
    // the first event after the lock is taken can carry the jump of the cursor into the lock
    if (freshLock){ freshLock = false; if (Math.abs(mx) > 100 || Math.abs(my) > 100) return; }
    mouseT = MA.t = performance.now();
    mx = mouseAxis(MA.x, mx); my = mouseAxis(MA.y, my);
    if (mx || my) routeInput({type:"move", dx:mx, dy:my, locked:true}, lifeInput);
  });
  addEventListener("wheel", e => { if (LIFE.running && lockedHere()) routeInput({type:"wheel", deltaY:e.deltaY, locked:true}); }, {passive:true});
  addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing || !document.body.classList.contains("life") || document.body.classList.contains("in-match")) return;
    if (mailOpen()){ if (e.key === "Escape"){ e.preventDefault(); closeMail(); } return; }
    if (window.lifePanelOpen && window.lifePanelOpen()) return;
    if (window.lifeMode && window.lifeMode() === "hub") return;
    const k = e.key.toLowerCase();
    if (MINI.on){ e.preventDefault(); if (!e.repeat) miniInput("key", k, true); return; }
    routeInput({type:"keydown", key:k, code:e.code, repeat:e.repeat, locked:lockedHere(), t:e.timeStamp, prevent:() => e.preventDefault()}, lifeInput);
  });
  addEventListener("keyup", e => {
    const k = e.key.toLowerCase(); keys[k === " " ? "space" : k] = false;
    if (MINI.on){ miniInput("key", k, false); return; }
    routeInput({type:"keyup", key:k, code:e.code, locked:lockedHere(), t:e.timeStamp}, lifeInput);
  });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; FLAGS.grab = null; HOLD.sp = null; });
}

/* ---------- build mode (buildmode.js) as a mode: its own camera (build), its keys, the room panned with W A S D ---------- */
function enterBuild(){ buildEnter(); if (BM.on && mode() !== "build") enterMode("build"); }
registerMode("build", {
  exit(){ if (BM.on) buildExit(); },
  step(dt){ buildPan(keys, dt); if (ME.fp) ME.fp.g.visible = false; if (ME.tp) ME.tp.g.visible = false; },
  input(ev){
    if (ev.type !== "keydown") return false;
    const k = ev.key;
    if (["w", "a", "s", "d"].includes(k)){ keys[k] = true; ev.prevent(); }
    else if (!ev.repeat){ ev.prevent(); buildKey(k); }
    return true;
  },
  flags:{clock:"frozen", movement:"locked", targeting:false, tunnel:false, closing:false, homeTick:true, compass:false, saves:"normal", tp:true, hud:"none", pauseOnUnlock:false, leaveOnZone:true}
});
buildInit({P, cam:() => RT.cam, scene:() => RT.scene, canvas:() => RT.renderer.domElement, note, persist, zone:() => LIFE.zone,
  // back in your own eyes: the camera as it was (its owner is your eyes again), the pointer back, and you clear of
  // anything just put where you stood
  done(){
    if (mode() === "build") exitMode("done");
    for (const k in keys) keys[k] = false;
    findInside();
    if (inside.length){
      for (let r = .3; r < 3; r += .2) for (let a = 0; a < 6.28; a += .5){ const x = P.x + Math.cos(a)*r, z = P.z + Math.sin(a)*r; if (!hits(x, z)){ P.x = x; P.z = z; r = 9; break; } }
    }
    RT.renderer.shadowMap.needsUpdate = true; W.shadowDirty = true;
    if (window.lifeRelock) setTimeout(() => window.lifeRelock(), 30);
  }});

/* ---------- what the introduction (intro.js) drives the world through ---------- */
onboardInit({
  P, keys, cam:() => RT.cam, scene:() => RT.scene, renderer:() => RT.renderer, place, note, fade, persist, enterZone, warm,
  minute:() => LIFE.min, zone:() => LIFE.zone, spots:() => W.spots, solids:() => W.solids, eye:() => P.eyeH, camCast, sstep,
  cineBegin, cineEnd, cine:CINE, shake, ME, meFade, B, hudReset:() => hudReset({meters:false}),
  carrying:() => INV.hand(), spawn:k => spawns[k], relock:() => { if (window.lifeRelock) window.lifeRelock(); }, mailNews:() => mailNews(), forceSky:() => { FLAGS.forceSky = true; }
});

window.LIFE = LIFE; window.startLife = startLife; window.stopLife = stop; window.resumeLife = resumeLife; window.lifeNote = note;
// handles for automated tests (DESIGN 1.4.20)
const fadeOpacity = () => { const f = document.getElementById("lifeFade"); if (!f) return 0; try { return +getComputedStyle(f).opacity; } catch(e){ return +f.style.opacity || 0; } };
const keyEvents = (type, list) => { for (const k of [].concat(list || [])) dispatchEvent(new KeyboardEvent(type, {key:k === "space" ? " " : k, bubbles:true})); };
window.__life = {P, keys, B, Q, W, HOME, LIFE, GROUND, TOWNZ, compassStep:dt => compassStep(dt, P), bus:to => bus(to), closingTime, get spots(){ return W.spots; }, get solids(){ return W.solids; }, get bounds(){ return W.bounds; },
  get frames(){ return frames; }, get presented(){ return presented; },
  stepN(n, dt = 1/60){ let k = 0; for (; k < n && LIFE.running; k++) tick(dt, 0, false); return k; },
  get held(){ return FLAGS.held; }, get grab(){ return FLAGS.grab; }, set grab(v){ FLAGS.grab = v; }, get cam(){ return RT.cam; }, get drill(){ return FLAGS.drill; },
  get busy(){ return FLAGS.busy; }, get rawMouse(){ return rawMouse; }, GT, MA, quality, GAIT, E, step:(dt) => step(dt, dt), warm, target, enterZone, place, dragBy, mailOpen, pass, ctx, use, renderer:() => RT.renderer, scene:() => RT.scene, sky:() => RT.SKY,
  drillInput:(type, k) => FLAGS.drill && FLAGS.drill.input(type, k), stepBusy, ME, CG, camCast, toggleView, meBuild, viewStep,
  INV, clickUse, throwHand, get fly(){ return flying(); }, refreshParcels, MINI, miniInput, miniStep, BM, buildEnter:enterBuild, buildExit, buildKey, lockKey:() => lockKey(P), robbed, homeTick,
  keysDown:list => keyEvents("keydown", list), keysUp:list => keyEvents("keyup", list),
  modes:{mode, enterMode, exitMode, flags:modeFlags, register:registerMode, pushInput, popInput, persistNow, setClockScale, bootPlan, revealAfterFrames},
  sched:SCHED, camera:{top:camTop, owners:camOwners, push:camPush, pop:camPop, kick:camKick, kicks:KICK},
  gfx:{apply(m){ if (typeof setGfx === "function") setGfx(m); }, get P(){ return typeof GFX === "object" && GFX ? GFX.P || null : null; }},
  HOLD, HOLD_GRACE, SG, FLAGS, FADE, CINE, cineBegin, cineEnd, hud, get fade(){ return fadeOpacity(); }, get save(){ return SAVE; },
  get keysT(){ return keysT; }, set keysT(v){ keysT = v; }};
// the world has loaded: whoever is waiting on it (ui/main.js before a new career's first frame) can go on
{ const done = window.lifeReadyResolve; window.lifeReady = Promise.resolve(true); if (typeof done === "function") done(true); }
