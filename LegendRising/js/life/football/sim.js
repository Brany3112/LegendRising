// js/life/football/sim.js: one football match as a deterministic simulation. Twenty-two players, a referee and two
// assistants on a real pitch with one live ball, stepped at a fixed 60 Hz in the order of 3.2.1: tactics, brains and
// keepers, every body's action, movement, stamina and gait, separation, the ball, the referee, then the events to
// whoever listens (the bridge, the view, the HUD, the audio). Nothing is pre-rolled and nothing directs it: the score,
// the stats, the ratings and the highlights are what happened in it. The same seed and inputs give the same match.
// Owner: WP-E. Contract DESIGN 1.4.13 (createMatch, simStep, advance, runHeadless, on, MatchState, cfg); step order
// 3.2.1; clock and tempo 3.2.10; timings 1.5.5.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random (ms.r = mulberry32(cfg.seed)).
//
// LEVEL, the one calibration knob of live play outside the tempo table (DESIGN D28): at kick-off every AI player of
// each side has his attributes moved LEVEL (0.74) of the way from his side's mean overall toward the middle of the two
// sides' (with cfg.ovr; attrs.js levelled). Without it a side 10 overall higher wins about 80% of the time (79% of the
// 46 such matches in a 300-match harness run with LEVEL 0), against the 55 to 62% that 2.3 WP-E asks for, because over
// a whole simulated match every small edge in pace, passing and finishing compounds. It is frozen at kick-off like the
// tempo, the same rule for both sides, never changes during a match and directs nothing. The player himself is never
// levelled: he plays with his own numbers (his skills as they are on the day, bridge.effSkills), so every point he
// trains still counts in full.
//
//   const ms = createMatch(cfg);            // bridge.matchConfig(f, MT) or a test config
//   on(ms, 'goal', ev => ...);
//   live: const alpha = advance(ms, dtReal); headless: runHeadless(ms, 5400, 12);

import {createBall, createBallWorld, ballStep, BALL} from "./ball.js";
import {makePitch, inBox} from "./pitchspec.js";
import {mulberry32, hashStr} from "./rng.js";
import {moverStep} from "../mover.js";
import {stamStep, stamFactors, effortOf, effF, stamSetCap, energyPerMatchMinute} from "../stamina.js";
import {phaseAdvanceQ, GQ, gaitModeStep} from "../gaitcore.js";
import {createAgent, separate, bodyRec} from "./agent.js";
import {levelled} from "./attrs.js";
import {createShape, teamShape, assignDefence, SLOT_POS, teamToPitch, clubStyle, situation} from "./tactics.js";
import {brainStep, restartShape, decideCarrier} from "./brain.js";
import {gkStep, gkOnHand, gkOnBody, gkCollect, gkHands} from "./gkbrain.js";
import {refStep, startRestart, restartStep, ballOut, goalScored, setCtl, clearCtl, foul, liveRoll} from "./rules.js";
import {actionStep, touchCheck, controlCheck, refreshPred, dribbleFoot, bodyContact, steer, standStill} from "./actions.js";
import {createChain, logEv, chainWood, countersAll, rateAgent, minuteOf, onSec, dribbleWatch} from "./events.js";
import {judgeDecision} from "./judge.js";
import {hypot, sin, cos} from "./detmath.js";
import {flightTime} from "./strike.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const H = 1/60, R = BALL.R;

// The tempo table (3.2.10), keyed by S.speed: frozen at kick-off, the harness's only runtime knobs (no director).
export const TEMPO = Object.freeze({
  2: Object.freeze({directness: 1.25, shotBias: 1.9, pressMul: 1.15}),
  1: Object.freeze({directness: 1.15, shotBias: 1.2, pressMul: 1.08}),
  4: Object.freeze({directness: 1.4, shotBias: 1.55, pressMul: 1.25})
});
// The levelling of a match (calibration, 2.3 WP-E: a side 10 overall higher wins 55 to 62%): the AI players of each
// side play this share of the gap between the two sides' mean overalls nearer the middle. The player himself plays
// with his own numbers.
export const LEVEL = 0.74;
// half length in real seconds by S.speed (1.5.5): Standard 600, Long 900, Short 360; which are calibrated
export const HALF_REAL = Object.freeze({2: 600, 1: 900, 4: 360});
export const CALIBRATED = Object.freeze({2: true, 1: false, 4: false});

// the order of the agents (1.4.13): 0..10 home, 11..21 away, 22 the referee, 23 and 24 the assistants, then subs used
export const REF = 22, AR1 = 23, AR2 = 24;

/* ---------- creating a match ---------- */

// cfg (1.4.13): {seed, mode, spec, halfRealSec, clockRate, tempo, teams: [{name, short, kit, gkKit, formation, style,
// players: [{pid, name, number, slot, arch, isGK, isMe, scale, at, energy, prefFoot, items}], bench: [...]}, ...],
// me: {team, slot, prefFoot, chem, trust, traits, staminaF, role}, rules, roleTimes, startSec, startScore, resume}
// plus these additions: meAI (the player driven by the AI, for the harness), htAuto (half time passes by itself:
// headless), kickoffTeam, visible(x, y, z) (the view's frustum test for returning spare balls), benchSide.
export function createMatch(cfg){
  const spec = cfg.spec || makePitch({boards: true});
  const halfRealSec = cfg.halfRealSec || HALF_REAL[2];
  const rate = cfg.clockRate || 45*60/halfRealSec;
  const ms = {
    cfg, r: mulberry32(cfg.seed >>> 0), t: 0, step: 0, spec,
    phase: 'pre', half: 1, clock: {sec: 0, rate, added: 0, running: false},
    score: [0, 0], dirs: [1, -1],
    agents: [], bench: [[], []], me: -1, gks: [-1, -1],
    ball: null, bw: null, quiet: null, pred: new Float32Array(360), predN: 0, predAt: -1, predT: 0, predSeq: 0,
    poss: {team: -1, agent: -1, since: 0, timeA: [0, 0], contested: false, ctl: -1},
    restart: null,
    offside: {snap: 0, set: new Map(), passer: -1, t: 0, pending: null, team: -1},
    advantage: null, pendingBook: [],
    events: [], flushed: 0, subsFn: {},
    stats: {shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], offsides: [0, 0],
      passes: [0, 0], passesOk: [0, 0], possSec: [0, 0], saves: [0, 0], goals: [0, 0]},
    subs: {used: [0, 0], plan: [], nextAt: [60, 60]}, stoppage: [0, 0],
    pref: {decided: 0, received: 0, calls: 0, capped: false, capEvents: 0, log: []},
    checkpointDue: false,
    // additions
    tm: null, chain: createChain(), spares: [], kick: null, call: null, meAI: !!cfg.meAI, restartLog: [],
    roleDone: {on: false, off: false}, asserts: {teleport: 0, ballJump: 0, maxAgent: 0, maxBall: 0, restartLate: 0}, vOutMax: 0,
    judgeQ: [], judgeLast: -999, cutStep: -1, ballSwap: -1, physQ: [], heavyUsed: 0, halfEnd: null, sitT: -99, bumps: [],
    // set later by the brains, the rules and the runner; declared here so the match state keeps one shape (3.9.6)
    judgeSeen: 0, meInvSeen: 0, planSeq: -1, planStep: 0, planDue: 0, planFirst: 0, carrierEval: null, deadBall: false,
    goalEv: null, goalT: 0, htT: 0, ftT: 0, callUp: null, koMate: null, counterIds: null, koFirst: 0, resumedMe: null,
    accum: 0, lastSteps: 0, onJump: null, gkCollect: null, liveRating: null, bodyList: null, handList: null
  };
  ms.gkCollect = gkCollect;
  // the AI's lofted-flight tables (strike.js) are built on first use: build them here, never inside a step
  flightTime('cross', 20, 18); flightTime('throw', 10, 10);
  ms.liveRating = a => liveRating(ms, a);
  // the teams
  const T = cfg.teams || [];
  // the levelling: each side's AI players moved toward the middle of the two sides' overalls
  const ovr = cfg.ovr && cfg.ovr.length === 2 ? cfg.ovr : null, mid = ovr ? (ovr[0] + ovr[1])/2 : 0;
  const lev = (t, p) => ovr && !p.isMe ? levelled(p.at, -(ovr[t] - mid)*LEVEL) : p.at;
  const styles = [0, 1].map(t => (T[t] && T[t].style) || clubStyle(T[t] ? T[t].name : "T" + t));
  ms.tm = [createShape(styles[0], T[0] ? T[0].formation : null), createShape(styles[1], T[1] ? T[1].formation : null)];
  for (let t = 0; t < 2; t++){
    const list = (T[t] && T[t].players) || [];
    for (let i = 0; i < 11; i++){
      const p = list[i];
      if (!p) continue;
      const a = createAgent({id: ms.agents.length, pid: p.pid, team: t, slot: p.slot, arch: p.arch, isGK: !!p.isGK, isMe: !!p.isMe,
        scale: p.scale || 1, at: lev(t, p), energy: p.energy != null ? p.energy : 100, fatigue: p.fatigue || 0, name: p.name, number: p.number,
        items: p.items, prefFoot: p.prefFoot, x: 0, z: 0});
      a.slotLine = (SLOT_POS[p.slot] || SLOT_POS.CM).line;
      a.baseX = p.baseX != null ? p.baseX : null;
      a.eF = effF(a.energy);
      a.on.push([0, null]); a.onT.push([0, null]);
      ms.agents.push(a);
      if (a.isGK) ms.gks[t] = a.id;
      if (a.isMe) ms.me = a.id;
    }
    for (const p of ((T[t] && T[t].bench) || [])) ms.bench[t].push(Object.assign({used: false}, p, {at: lev(t, p)}));
    spreadSlots(ms.agents.filter(a => a.team === t));
  }
  // the officials
  for (const [id, role, z] of [[REF, 'referee', 0], [AR1, 'ar', -spec.hz - 1.2], [AR2, 'ar', spec.hz + 1.2]]){
    while (ms.agents.length < id) ms.agents.push(createAgent({id: ms.agents.length, team: -1, role: 'off', onPitch: false, at: {}}));
    const a = createAgent({id, team: -1, role, at: {pace: 70, dribbling: 50, stamina: 80}, x: id === REF ? -10 : 0, z, onPitch: true});
    a.slot = role; a.slotLine = role;
    ms.agents.push(a);
  }
  // the ball, its world, and the spare balls on their cones
  ms.ball = createBall({x: 0, z: 0, rollDecel: spec.roll});
  ms.ball.state = 'dead';
  ms.bodyList = []; ms.handList = [];
  ms.bw = createBallWorld({spec, bodies: () => ms.bodyList, hands: () => ms.handList, rng: ms.r, t: 0,
    onEvent: (type, d) => onBall(ms, type, d)});
  ms.quiet = createBallWorld({spec});
  spec.spareCones.forEach((c, i) => {
    const b = createBall({x: c.x, z: c.z, rollDecel: spec.roll});
    b.state = 'dead';
    ms.spares.push({ball: b, cone: i, state: 'cone'});
  });
  ms.spares.push({ball: ms.ball, cone: -1, state: 'live'});
  // the movers keep to the run-off (3.1.5 step 7)
  for (const a of ms.agents){ a.prm = Object.assign({}, a.prm, {bounds: spec.runoff}); a.fac = stamFactors(a.st, a.eF, {}); }
  // the player's planned role: a substitute starts on the bench
  if (cfg.me && cfg.me.role && (cfg.me.role === 'sub' || cfg.me.role === 'cameo') && ms.me >= 0){
    // the config put him in the XI: move him to the bench and the man he replaces in
    benchMe(ms);
  }
  // kick-off positions: the first kick-off restart's spots, the bodies standing on them
  const ko = cfg.kickoffTeam != null ? cfg.kickoffTeam : (ms.r() < 0.5 ? 0 : 1);
  ms.koFirst = ko;
  if (cfg.resume) applyResume(ms);
  startRestart(ms, 'kickoff', ko, {x: 0, z: 0}, {first: true});
  placeForKickoff(ms);
  ms.phase = 'kickoff';
  refreshPred(ms);
  for (const t of [0, 1]){ teamShape(ms, t); }
  placeForKickoff(ms);
  return ms;
}

// the bodies at their kick-off spots (a cut: only at creation and behind the half-time fade)
function placeForKickoff(ms){
  restartShape(ms);
  for (const a of ms.agents){
    if (!a.onPitch) continue;
    let x, z;
    if (a.role === 'referee'){ x = -ms.dirs[0]*8; z = -6; }
    else if (a.role === 'ar'){ x = a.id === AR1 ? -ms.spec.hx/4 : ms.spec.hx/4; z = (a.id === AR1 ? -1 : 1)*(ms.spec.hz + 1.2); }
    else if (a.isGK){ x = -ms.dirs[a.team]*(ms.spec.hx - 1.5); z = 0; }
    else if (a.set){ x = a.set.x; z = a.set.z; }
    else { const p = teamToPitch(ms, a.team, a.anchor.u || 20, a.anchor.w || 34, {x: 0, z: 0}); x = p.x; z = p.z; }
    a.m.x = x; a.m.z = z; a.m.vx = 0; a.m.vz = 0; a.m.speed = 0;
    a.m.yaw = a.team >= 0 ? (ms.dirs[a.team] > 0 ? -Math.PI/2 : Math.PI/2) : 0; a.m.heading = a.m.yaw;
    a.x0 = x; a.z0 = z;
  }
  const R0 = ms.restart;
  if (R0){
    const tk = ms.agents[R0.taker];
    if (tk){ tk.m.x = -ms.dirs[tk.team]*0.45; tk.m.z = 0; tk.x0 = tk.m.x; tk.z0 = 0; }
    R0.stage = 'wait'; R0.placed = true;
  }
  ms.ball.p.x = 0; ms.ball.p.y = R; ms.ball.p.z = 0; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0; ms.ball.state = 'dead';
  ms.cutStep = ms.step;
}

// a substitute's day: the player waits on the bench; the man in his slot starts
function benchMe(ms){
  const me = ms.agents[ms.me], t = me.team;
  const cand = ms.bench[t].find(p => !p.isGK && !p.used && p.slot === me.slot) || ms.bench[t].find(p => !p.isGK && !p.used);
  if (!cand) return;
  const keep = {pid: me.pid, name: me.name, number: me.number, slot: me.slot, arch: me.arch, isGK: false, isMe: true, scale: me.scale,
    at: me.at, energy: me.energy, items: null, prefFoot: me.foot === 'L' ? 'Left' : me.foot === 'B' ? 'Both' : 'Right', used: false};
  // the bench man takes the player's place in the XI (same record, his attributes)
  me.pid = cand.pid; me.name = cand.name; me.number = cand.number; me.at = cand.at; me.isMe = false;
  me.prm = Object.assign({}, me.prm);
  cand.used = true;
  ms.bench[t] = ms.bench[t].filter(p => p !== cand);
  ms.bench[t].push(keep);
  ms.me = -1;
}

// crash recovery (3.4.4): the score, the minute and the half from the checkpoint; the player is off (substituted at
// the checkpoint minute) and stays off: a starter is replaced at the kick-off, and a substitute still on the bench (or
// one who had come on before the checkpoint: the sides line up afresh) is never brought on, by his planned call or by
// the bench's own changes, so the remainder plays nobody as him and his rating comes from the checkpoint's counters
// (bridge.finish). The remainder is played from a kick-off at that minute.
function applyResume(ms){
  const rs = ms.cfg.resume;
  ms.score = (rs.score || [0, 0]).slice();
  ms.stats.goals = ms.score.slice();
  ms.half = rs.half || 1;
  ms.clock.sec = rs.sec || 0;
  if (ms.half === 2) ms.dirs = [-1, 1];
  // everyone in the line-up is on from the checkpoint's second (in match seconds, events.onSec)
  const on0 = onSec(ms);
  for (const a of ms.agents) if (a.on.length) a.on[0][0] = on0;
  for (const t of [0, 1]) for (const p of ms.bench[t]) if (p.isMe) p.used = true;
  if (ms.me >= 0){
    const me = ms.agents[ms.me];
    me.onPitch = false; me.subbedOff = true; me.on.length = 0; me.onT.length = 0;
    // the man who comes on for him
    const t = me.team, p = ms.bench[t].find(q => !q.isGK && !q.used);
    if (p){
      p.used = true;
      const a = createAgent({id: ms.agents.length, pid: p.pid, team: t, slot: me.slot, arch: p.arch || me.arch, at: p.at, energy: p.energy,
        name: p.name, number: p.number, x: 0, z: 0});
      a.slotLine = me.slotLine; a.on.push([on0, null]); a.onT.push([0, null]); a.prm = Object.assign({}, a.prm, {bounds: ms.spec.runoff});
      a.fac = stamFactors(a.st, 1, {});
      ms.agents.push(a);
    }
    ms.resumedMe = me.id;
  }
  ms.subs.used = (rs.subsUsed || [0, 0]).slice();
}

/* ---------- events ---------- */

// subscribe to events of a kind ('*' for all; ball contacts 'bounce' 'post' 'bar' 'net' 'board' 'body' too)
export function on(ms, kind, fn){ (ms.subsFn[kind] || (ms.subsFn[kind] = [])).push(fn); return () => { const l = ms.subsFn[kind]; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; }
function flush(ms){
  const S0 = ms.subsFn, all = S0['*'];
  for (; ms.flushed < ms.events.length; ms.flushed++){
    const ev = ms.events[ms.flushed];
    const l = S0[ev.kind];
    if (l) for (const fn of l) fn(ev, ms);
    if (all) for (const fn of all) fn(ev, ms);
  }
  if (ms.physQ.length){
    for (let i = 0; i < ms.physQ.length; i += 2){ const l = S0[ms.physQ[i]]; if (l) for (const fn of l) fn(ms.physQ[i + 1], ms); }
    ms.physQ.length = 0;
  }
}

// what the ball world reports (delivered when its step ends)
function onBall(ms, type, d){
  switch (type){
    case 'goal': goalScored(ms, d); break;
    case 'out': ballOut(ms, d); break;
    case 'post': case 'bar':
      if (ms.phase === 'live'){ logEv(ms, 'woodwork', ms.ball.last.team, ms.ball.last.agent, d.x, d.z, {part: type}); chainWood(ms, type); }
      refreshPred(ms);
      break;
    case 'body': {
      const a = ms.agents[d.id];
      // what the contact sent it on at, for the step's displacement assert (a keeper's hands then put the ball on a new
      // path, gkOnHand, but it travelled at this speed for the rest of the step)
      if (d.vOut) ms.vOutMax = Math.max(ms.vOutMax || 0, hypot(d.vOut.x, d.vOut.y, d.vOut.z));
      if (a && ms.phase === 'live' && ms.ball.state === 'free'){
        if (a.isGK && d.part === 'hand') gkOnHand(ms, a, d);
        else if (a.isGK && gkOnBody(ms, a, d)) {}
        else bodyContact(ms, a, d.part);
      }
      refreshPred(ms);
      break;
    }
    case 'bounce': case 'board':
      refreshPred(ms);
      break;
  }
  if (ms.subsFn[type]) ms.physQ.push(type, d);
}

// A shape names a slot once per player, left to right within a line (positions.js FORMATIONS): two centre backs,
// two or three central midfielders, two strikers share one slot's place. Each gets his own lane across the pitch
// (baseX, 0 at the left touchline to 100 at the right, as SLOT_POS.x), spread evenly about the slot's own x.
const SPREAD = {DF: 24, CM: 24, CAM: 22, FWD: 22};
export function spreadSlots(list){
  const by = new Map();
  for (const a of list){ if (a.isGK || a.baseX != null) continue; const k = a.slot; if (!by.has(k)) by.set(k, []); by.get(k).push(a); }
  for (const [slot, group] of by){
    const p = SLOT_POS[slot] || SLOT_POS.CM, n = group.length, gap = SPREAD[p.line] || 22;
    group.forEach((a, i) => { a.baseX = clamp(p.x + (i - (n - 1)/2)*gap, 8, 92); });
  }
}

/* ---------- the step (3.2.1) ---------- */

const EFF = {stamina: 50, eF: 1};
// One fixed step of h seconds (1/60).
export function simStep(ms, h = H){
  if (ms.phase === 'over') return;
  const agents = ms.agents, n = agents.length;
  // the ball in play rolls on the grass again (a dead one is stopped sooner: rules.RULES.DEAD_ROLL)
  if (ms.phase === 'live') liveRoll(ms.ball);
  const bx0 = ms.ball.p.x, by0 = ms.ball.p.y, bz0 = ms.ball.p.z, ball0 = ms.ball, bv0 = hypot(ms.ball.v.x, ms.ball.v.y, ms.ball.v.z);
  const netQ0 = ms.ball.netQ || 0;
  for (let i = 0; i < n; i++){
    const a = agents[i];
    a.x0 = a.m.x; a.z0 = a.m.z;
    if (a.onPitch && a.role !== 'off') a.fac = stamFactors(a.st, a.eF, a.fac || {});
    a.diveMoved = false; a.slideMoved = false;
  }
  // half time and full time
  if (ms.phase === 'halftime'){
    if (ms.cfg.htAuto !== false && ms.t - ms.htT >= (ms.cfg.htWait || 0)) secondHalf(ms);
    else { idle(ms); endStep(ms, h); return; }
  }
  if (ms.phase === 'fulltime'){ finishUp(ms); endStep(ms, h); return; }
  // 2. tactics at 5 Hz, team 0 on one step and team 1 on the next
  const k = ms.step % 12;
  if (k === 0){ teamShape(ms, 0); assignDefence(ms, 0); }
  else if (k === 1){ teamShape(ms, 1); assignDefence(ms, 1); }
  // the restart's procedure, then 3. the brains, the keepers and the officials
  if (ms.restart) restartStep(ms, h);
  brainStep(ms, h);
  if (ms.gks[0] >= 0) gkStep(ms, agents[ms.gks[0]], h);
  if (ms.gks[1] >= 0) gkStep(ms, agents[ms.gks[1]], h);
  officials(ms);
  // 4. the agents: actions, movement, stamina, the gait clock (footfalls give the dribble touches)
  for (let i = 0; i < n; i++){
    const a = agents[i];
    if (!a.onPitch || a.role === 'off') continue;
    agentStep(ms, a, h);
  }
  // 5. separation; a man who runs hard into the back of the one on the ball may be penalised for it (3.2.9)
  ms.bumps.length = 0;
  separate(agents, h, ms.bumps);
  if (ms.phase === 'live' && ms.bumps.length) chargeFouls(ms);
  // 6. the ball: who plays it before it moves, then its step
  if (ms.phase === 'live'){ controlCheck(ms); touchCheck(ms); }
  const bl = ms.bodyList; bl.length = 0;
  for (let i = 0; i < n; i++){
    const a = agents[i];
    if (!a.onPitch || a.role !== 'player') continue;
    const rec = bodyRec(a);
    // the controller's own body does not knock his ball on (his touches are explicit); a diving keeper is one capsule
    if (a.id === ms.poss.ctl && ms.ball.state === 'free') rec.ghost = true;
    // nobody knocks a dead ball about while a restart is set up
    if (ms.phase !== 'live') rec.ghost = true;
    if (a.isGK && a.gk && a.gk.plan && (a.gk.state === 'dive' || a.gk.state === 'ground')) rec.seg = diveSeg(a, rec.seg || {});
    else rec.seg = null;
    bl.push(rec);
  }
  const hl = ms.handList; hl.length = 0;
  for (const g of ms.gks) if (g >= 0) gkHands(ms, agents[g], hl);
  ms.bw.t = ms.t;
  // the ball's speed as it starts its integration (a kick in this step has set it)
  const bvPre = hypot(ms.ball.v.x, ms.ball.v.y, ms.ball.v.z);
  ms.vOutMax = 0;
  ballStep(ms.ball, ms.bw, h);
  // the path cache while the ball flies with spin (10 Hz)
  const b = ms.ball;
  if (b.state === 'free' && !b.grounded && (Math.abs(b.w.x) + Math.abs(b.w.y) + Math.abs(b.w.z)) > 2 && ms.step - ms.predAt >= 6) refreshPred(ms);
  else if (ms.step - ms.predAt >= 30 && b.state === 'free') refreshPred(ms);
  // 7. the referee
  refStep(ms, h);
  if (ms.phase === 'live' && !ms.clock.running && !ms.clock.ended) ms.clock.running = true;
  energyStep(ms, h);
  judgeStep(ms);
  // take-ons (the dribbles counter), watched ten times a second while the ball is in play
  if (ms.phase === 'live' && ms.step % 6 === 2) dribbleWatch(ms);
  // the scenario line for the player (3.2.9), asked twice a second; situation() keeps it to one per 20 s
  if (ms.me >= 0 && ms.step % 30 === 17 && ms.phase !== 'halftime' && ms.phase !== 'fulltime'){
    const me = ms.agents[ms.me], line = me.onPitch ? situation(ms, ms.me) : null;
    if (line) logEv(ms, 'situation', me.team, me.id, me.m.x, me.m.z, {line});
  }
  // the no-teleport asserts (2.3 WP-E): every body within its top speed, the ball within its own speed
  if (ms.cutStep !== ms.step){
    for (let i = 0; i < n; i++){
      const a = agents[i];
      if (!a.onPitch) continue;
      const d = hypot(a.m.x - a.x0, a.m.z - a.z0), lim = a.prm.vmax*h + 1e-3;
      if (d > ms.asserts.maxAgent) ms.asserts.maxAgent = d;
      if (d > lim) ms.asserts.teleport++;
    }
    if (ms.ball === ball0 && ms.ballSwap !== ms.step){
      const d = hypot(ms.ball.p.x - bx0, ms.ball.p.y - by0, ms.ball.p.z - bz0);
      // the speed changes inside the step (a kick before the integration, drag and gravity within it): 4% and 2 mm
      // (and the speed it left a contact at inside the step: a body moving into it can send it on faster than it ends)
      // (and a ball pressed into a net is sent back by its spring: up to NET_K x the stretch more speed within the step)
      const netQ = Math.max(netQ0, ms.ball.netQ || 0);
      const lim = (Math.max(bv0, bvPre, ms.vOutMax || 0, hypot(ms.ball.v.x, ms.ball.v.y, ms.ball.v.z)) + (netQ > 0 ? BALL.NET_K*netQ*h : 0))*h*1.04 + 2e-3;
      if (d - lim > ms.asserts.maxBall) ms.asserts.maxBall = d - lim;
      if (d > lim){ ms.asserts.ballJump++; if (ms.onJump) ms.onJump(d, lim, by0); }
    }
  }
  if (ms.restart && ms.t - ms.restart.t0 > ms.restart.limit + 5 && !ms.restart.lateNoted){ ms.restart.lateNoted = true; ms.asserts.restartLate++; }
  endStep(ms, h);
}
// one body's step 4 (its own function, so the engine inlines the small calls in it: a call that is not inlined boxes
// every fractional number it passes, 3.9.6)
function agentStep(ms, a, h){
  if (a.role === 'player') actionStep(ms, a, h);
  const m = a.m;
  const px = m.x, pz = m.z;
  if (!a.diveMoved && !a.slideMoved) moverStep(m, a.intent, a.prm, a.fac, h, null);
  if (a.role === 'player'){
    EFF.stamina = a.at.stamina != null ? a.at.stamina : 50; EFF.eF = a.eF;
    stamStep(a.st, h, effortOf(m.gait, m.speed, a.prm.run), EFF);
    const ddx = m.x - px, ddz = m.z - pz, dist = Math.sqrt(ddx*ddx + ddz*ddz);
    a.acc.dist += dist;
    const spr = m.gait === 'sprint' && m.speed > a.prm.run;
    if (spr && !a.acc.sprintOn) a.acc.sprints++;
    a.acc.sprintOn = spr;
    gaitModeStep(a.g, m.speed, h);
    GQ[0] = dist; GQ[1] = m.speed; GQ[2] = a.scale || 1;
    const evs = phaseAdvanceQ(a.g, a.g.mode);
    if (evs.length && ms.poss.ctl === a.id && ms.phase === 'live') for (const e of evs) dribbleFoot(ms, a, e.side);
  }
}
function endStep(ms, h){
  ms.t += h; ms.step++;
  flush(ms);
}
// standing still (half time)
function idle(ms){ for (const a of ms.agents) if (a.onPitch && a.role === 'player') standStill(a); }

// a diving keeper's body as one capsule from his feet to his head along the roll
function diveSeg(a, seg){
  const m = a.m, s = a.scale || 1, roll = a.roll || 0, y = 0.9*s + (a.y || 0);
  const f = {x: -sin(m.yaw), z: -cos(m.yaw)}, rx = -f.z, rz = f.x;
  const sr = sin(roll), cr = cos(roll), half = 0.8*s;
  const ax = rx*sr, ay = cr, az = rz*sr;
  seg.ax = m.x - ax*half; seg.ay = Math.max(0.1, y - ay*half); seg.az = m.z - az*half;
  seg.bx = m.x + ax*half; seg.by = Math.max(0.15, y + ay*half); seg.bz = m.z + az*half; seg.r = 0.22*s;
  return seg;
}

// the referee 15 to 25 m from the ball on the diagonal, off the passing lanes; the assistants on their touchlines level
// with the second-last defender or the ball, whichever is nearer the goal line, in their half (3.2.1 step 3)
function officials(ms){
  const b = ms.ball.p, hx = ms.spec.hx, hz = ms.spec.hz;
  const ref = ms.agents[REF];
  if (ref && ref.onPitch){
    const sx = b.z >= 0 ? -1 : 1, tx = clamp(b.x - Math.sign(b.x || 1)*10, -hx + 6, hx - 6), tz = clamp(b.z + sx*14, -hz + 3, hz - 3);
    const d = hypot(tx - ref.m.x, tz - ref.m.z);
    steer(ref, tx, tz, d > 12 ? 'run' : 'jog', 2.5, null);
  }
  for (const id of [AR1, AR2]){
    const a = ms.agents[id];
    if (!a || !a.onPitch) continue;
    const side = id === AR1 ? -1 : 1, half = id === AR1 ? -1 : 1;     // AR1 covers x < 0, AR2 x > 0
    // the team defending this half: its second-last body
    const def = ms.dirs[0] === -half ? 0 : 1;
    let o1 = 0, o2 = 0;
    for (const o of ms.agents){
      if (o.team !== def || !o.onPitch) continue;
      const x = half*o.m.x;
      if (x > o1){ o2 = o1; o1 = x; } else if (x > o2) o2 = x;
    }
    const line = Math.max(o2, half*b.x, 0);
    const tx = half*clamp(line, 0, hx), tz = side*(hz + 1.2);
    steer(a, tx, tz, 'run', 0.4, {x: 0, z: -side}, 7, true);
  }
}

// career energy per match minute on the pitch (1.5.2), and the stamina cap that follows it
function energyStep(ms, h){
  if (!ms.clock.running) return;
  const dmin = h*ms.clock.rate/60;
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== 'player') continue;
    const sF = a.isMe && ms.cfg.me && ms.cfg.me.staminaF != null ? ms.cfg.me.staminaF : (1.6 - 1.15*(a.at.stamina || 50)/100);
    const e = energyPerMatchMinute({staminaF: sF, meanSpeed: a.m.speed, sprintFrac: a.st.sprintFrac})*dmin;
    a.energy = Math.max(0, a.energy - e);
    a.acc.drain += e;
    if ((ms.step + a.id) % 60 === 0){ a.eF = effF(a.energy); stamSetCap(a.st, a.energy, a.fatigue || 0); }
    // positional discipline: out of possession, how long he is more than 12 m from his anchor (5 Hz samples)
    if (ms.poss.team !== a.team && ms.poss.team >= 0 && !a.isGK && ms.step % 12 === a.team){
      const p = teamToPitch(ms, a.team, a.anchor.u, a.anchor.w, PA);
      a.acc.oop += 0.2;
      if (hypot(p.x - a.m.x, p.z - a.m.z) > 12 && !a.task.press && a.task.mark < 0) a.acc.oopFar += 0.2;
    }
  }
}
const PA = {x: 0, z: 0};

// the second half: ends swapped, the other side kicks off, the bodies on their spots behind the half-time fade
export function secondHalf(ms){
  ms.half = 2;
  ms.dirs = [-ms.dirs[0], -ms.dirs[1]];
  ms.clock.sec = 0; ms.clock.added = 0; ms.clock.running = false; ms.clock.ended = false;
  ms.offside.set.clear(); ms.offside.pending = null; ms.advantage = null;
  for (const a of ms.agents){ a.act = null; a.plan = null; a.drib = null; a.y = 0; a.task.run = null; if (a.gk){ a.gk.state = 'ready'; a.gk.plan = null; a.gk.handsOn = false; a.gk.read = null; } }
  for (const t of [0, 1]){ ms.tm[t].changeT = ms.t - 10; teamShape(ms, t); }
  const ko = 1 - ms.koFirst;
  startRestart(ms, 'kickoff', ko, {x: 0, z: 0}, {first: true});
  placeForKickoff(ms);
  ms.phase = 'kickoff';
  refreshPred(ms);
}
// full time: everyone's time on the pitch closes, the phase ends
function finishUp(ms){
  for (const a of ms.agents){
    const iv = a.on[a.on.length - 1]; if (iv && iv[1] == null) iv[1] = onSec(ms);
    const ivT = a.onT[a.onT.length - 1]; if (ivT && ivT[1] == null) ivT[1] = ms.t;
  }
  ms.clock.running = false; ms.clock.ended = true;
  ms.phase = 'over';
}

/* ---------- the player's decisions, judged (3.2.11) ---------- */

// A decision by the player is judged when it mattered: its value against the best option differs by more than 0.08,
// or it led to a goal or a shot within 8 s, or he lost the ball as the last defender; at most once per 60 s of match
// time. The verdict is an event ('verdict' {rec, res, out}); bridge.judge applies it.
function judgeStep(ms){
  const q = ms.judgeQ;
  // new decisions
  for (let i = ms.judgeSeen || 0; i < ms.events.length; i++){
    const ev = ms.events[i];
    if (ev.kind === 'decision' && ev.agent === ms.me) q.push({ev, kick: null, t: ev.t});
  }
  ms.judgeSeen = ms.events.length;
  if (!q.length) return;
  const matchSec = s => (ms.half - 1)*2700 + s;
  for (let i = q.length - 1; i >= 0; i--){
    const j = q[i];
    if (!j.kick){
      for (let k = j.ev.id + 1; k < ms.events.length; k++){ const e = ms.events[k]; if (e.kind === 'kick' && e.agent === j.ev.agent){ j.kick = e; break; } }
      if (!j.kick && ms.t - j.t > 2){ q.splice(i, 1); continue; }
      if (!j.kick) continue;
    }
    const res = j.kick.res;
    const age = ms.t - j.kick.t;
    if (!res && age < 8) continue;
    if (age < 8 && res !== 'goal' && !(res === 'ok' && age < 8)) { if (res) {} }
    // what came of it within 8 s
    let goalAfter = false, shotAfter = false;
    for (let k = j.kick.id + 1; k < ms.events.length; k++){
      const e = ms.events[k];
      if (e.t - j.kick.t > 8) break;
      if (e.kind === 'goal' && e.team === j.ev.team && !e.disallowed) goalAfter = true;
      if (e.kind === 'kick' && e.team === j.ev.team && (e.intent === 'shot' || e.atGoal)) shotAfter = true;
    }
    if (age < 8 && !goalAfter && res !== 'goal' && res !== 'saved' && res !== 'wide' && res !== 'wood' && res !== 'blocked' && res !== 'int' && res !== 'out' && res !== 'off') continue;
    q.splice(i, 1);
    const rec = j.ev.rec;
    const r = res === 'goal' ? 'goal' : res === 'saved' ? 'saved' : res === 'wood' ? 'post' : res === 'blocked' ? 'blocked' : res === 'wide' ? 'miss'
      : res === 'ok' ? (goalAfter ? 'goal' : 'passOk') : res === 'out' ? 'outplay' : res === 'int' ? 'intercepted' : res === 'off' ? 'intercepted' : 'lost';
    const mattered = Math.abs(rec.bestQ - rec.chosenQ) > 0.08 || goalAfter || shotAfter || res === 'goal';
    const sec = matchSec(ms.clock.sec);
    if (!mattered || sec - ms.judgeLast < 60) continue;
    ms.judgeLast = sec;
    const margin = res === 'wide' ? missMargin(ms, j.kick) : 0;
    const result = {r: rec.choice === 'pass' && r === 'goal' ? 'passOk' : r, margin, saveQ: res === 'saved' ? 0.5 : 0, goalAfter, xg: j.kick.xg || 0};
    const out = judgeDecision(rec, result);
    logEv(ms, 'verdict', j.ev.team, j.ev.agent, j.ev.x, j.ev.z, {rec, res: result, out});
  }
}
// how far a missed shot was off the frame (metres), from where it was aimed
function missMargin(ms, k){
  const dz = Math.max(0, Math.abs(k.tz || 0) - 3.66), dy = Math.max(0, (k.ty || 0) - 2.44);
  return Math.max(dz, dy) + (k.sigma || 0)*(k.dist || 0);
}

/* ---------- body contact on the ball (3.2.9) ---------- */

// A hard collision (separate(): closing above the stagger speed) into the man on the ball, by an opponent: a charge.
// From behind, or harder, it is more likely given against him: pFoul = clamp((closing - 3)/2.5, 0, 1) x (0.35 + 0.65
// fromBehind). A push or a pull, not a tackle: the severity of 3.2.9 at BODY_SEV of its weight, so it is a yellow only
// as a tactical foul (stopping an attack worth xT > 0.15). In the box he attacks, BOX of that chance (a penalty takes
// more than a bump).
export const CHARGE = Object.freeze({V0: 3, DV: 2.5, P0: 0.35, BODY_SEV: 0.72, BOX: 0.35});
function chargeFouls(ms){
  const B = ms.bumps;
  for (let i = 0; i < B.length; i += 3){
    const v = ms.agents[B[i]], o = ms.agents[B[i + 1]], close = B[i + 2];
    if (!v || !o || v.team === o.team || v.team < 0 || o.team < 0) continue;
    const b = ms.ball.p;
    const onBall = ms.poss.ctl === v.id || ms.ball.state === 'free' && ms.poss.team === v.team && hypot(b.x - v.m.x, b.z - v.m.z) < 1.2;
    if (!onBall || ms.phase !== 'live') continue;
    const fx = -sin(v.m.yaw), fz = -cos(v.m.yaw), dx = o.m.x - v.m.x, dz = o.m.z - v.m.z, dl = hypot(dx, dz) || 1;
    const c = (dx*fx + dz*fz)/dl, fromBehind = c > -0.2 ? 0 : c < -0.7 ? 1 : ((-0.2 - c)/0.5)*((-0.2 - c)/0.5)*(3 - 2*(-0.2 - c)/0.5);
    // (in the box he was attacking it takes more than that for a penalty: CHARGE.BOX)
    const p = clamp((close - CHARGE.V0)/CHARGE.DV, 0, 1)*(CHARGE.P0 + (1 - CHARGE.P0)*fromBehind)*(inBox(ms.spec, ms.dirs[v.team], v.m.x, v.m.z) ? CHARGE.BOX : 1);
    if (!(p > 0) || ms.r() >= p) continue;
    const sev = clamp(0.25 + 0.06*close + 0.3*fromBehind, 0, 1)*CHARGE.BODY_SEV;
    foul(ms, o, v, sev, v.m.x, v.m.z, {charge: true, down: false});
    if (ms.phase !== 'live') return;
  }
}

/* ---------- running it ---------- */

// match seconds since the start (both halves)
export const matchSec = ms => (ms.half - 1)*2700 + ms.clock.sec;

// the accumulator for live play (1.4.13): real seconds in, at most maxSteps fixed steps, the interpolation alpha out
export function advance(ms, real, scale = 1, maxSteps = 4){
  ms.accum = (ms.accum || 0) + Math.max(0, real)*scale;
  let n = 0;
  while (ms.accum >= H && n < maxSteps && ms.phase !== 'over'){ simStep(ms, H); ms.accum -= H; n++; }
  if (n >= maxSteps && ms.accum > H) ms.accum = H*0.999;
  ms.lastSteps = n;
  return clamp(ms.accum/H, 0, 1);
}

// Run headless (1.4.13): until the match second untilSec (5400 the whole match) or full time, time-sliced to
// budgetMs of wall time per call (0: no limit). The same simStep as live play. The wall clock is the one the caller
// gave the match (cfg.now: bridge.matchConfig hands in the page's); without one a slice is counted in steps, at the
// reference cost of RUN_STEP_MS a step.
export const RUN_STEP_MS = 0.25;
export function runHeadless(ms, untilSec = 1e9, budgetMs = 0){
  const now = typeof ms.cfg.now === 'function' ? ms.cfg.now : null;
  const t0 = budgetMs > 0 && now ? now() : 0, maxSteps = budgetMs > 0 && !now ? Math.max(1, Math.round(budgetMs/RUN_STEP_MS)) : Infinity;
  let steps = 0;
  while (ms.phase !== 'over' && matchSec(ms) < untilSec){
    simStep(ms, H); steps++;
    if (steps >= maxSteps) break;
    if (budgetMs > 0 && now && (steps & 31) === 0 && now() - t0 >= budgetMs) break;
  }
  return {done: ms.phase === 'over' || matchSec(ms) >= untilSec, steps};
}

// the player's live rating (for the rotation rule: kept on at 7.3 or better)
export function liveRating(ms, a){
  const C = countersAll(ms), my = ms.score[a.team], th = ms.score[1 - a.team];
  return rateAgent(C[a.id], a.isGK ? 'GK' : a.arch, {mins: C[a.id].mins, res: my > th ? 'W' : my < th ? 'L' : 'D', conceded: C[a.id].conceded});
}
