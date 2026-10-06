// js/life/football/harness.js: many matches, headless, and what they add up to. Runs a configured match to full time
// on the same 60 Hz step as live play and measures it (the team numbers, the player's involvement at his slot, the
// preference, ratings, trust, step cost, the no-teleport and restart asserts, the determinism hash); aggregates a batch
// into means and distributions; checks them against the WP-E acceptance bands; refits the rating table. The batch
// runner with its club pairs and worker threads is qa/harness.mjs.
// Owner: WP-E. Contract DESIGN 1.2 (harness.js), behaviour 3.2.12; acceptance 2.3 WP-E; QA 4.5, 4.7.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. The clock that times the steps is
// passed in (opt.now).

import {createMatch, simStep, matchSec} from "./sim.js";
import {countersAll, ratingsAll, logHash, RATE, rateAgent, minuteOf} from "./events.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mean = l => l.length ? l.reduce((a, b) => a + b, 0)/l.length : 0;
const sd = l => { const m = mean(l); return l.length > 1 ? Math.sqrt(l.reduce((a, b) => a + (b - m)*(b - m), 0)/(l.length - 1)) : 0; };
const median = l => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k])/2; };
const pct = (l, p) => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p*s.length))]; };

/* ---------- the oracles (3.4.5: the 2D match's moment mixes, kept here when match.js loses them) ---------- */

// js/match.js MOMENT_MIX, js/data/game.js DEFEND_MIX, js/engine/decide.js EXTRA_MIX: what a game asked of each position
export const ORACLE = Object.freeze({
  MOMENT_MIX: {
    ST: {run: 26, wing: 6, oneonone: 12, edge: 11, freekick: 6, penalty: 6, pass: 16, corner: 11, throwin: 6},
    W: {run: 20, wing: 22, oneonone: 8, edge: 8, freekick: 7, penalty: 3, pass: 19, corner: 8, throwin: 5},
    AM: {run: 16, wing: 9, oneonone: 6, edge: 13, freekick: 12, penalty: 4, pass: 26, corner: 9, throwin: 5},
    CM: {run: 9, wing: 6, oneonone: 3, edge: 10, freekick: 10, penalty: 2, pass: 41, corner: 9, throwin: 10},
    DF: {run: 4, wing: 3, oneonone: 1, edge: 4, freekick: 4, penalty: 1, pass: 47, corner: 18, throwin: 18}
  },
  DEFEND_MIX: {ST: {tackle: 3, intercept: 2, aerial: 4}, W: {tackle: 5, intercept: 3, aerial: 2}, AM: {tackle: 7, intercept: 6, aerial: 3},
    CM: {tackle: 16, intercept: 13, aerial: 7}, DF: {tackle: 24, intercept: 17, aerial: 16}},
  EXTRA_MIX: {ST: {counter: 7, cross: 2}, W: {counter: 6, cross: 12}, AM: {counter: 5, cross: 4}, CM: {counter: 3, cross: 3}, DF: {counter: 1, cross: 2}}
});
// the oracle's moments grouped the way the simulation's involvements are counted: going at goal (runs, wing play,
// one-on-ones, the edge of the box, counters), making the play (passes, crosses), set pieces, and defending
const GROUPS = {attack: ['run', 'wing', 'oneonone', 'edge', 'counter'], create: ['pass', 'cross'], set: ['freekick', 'penalty', 'corner', 'throwin'],
  defend: ['tackle', 'intercept', 'aerial']};
export function oracleShares(arch){
  const mix = Object.assign({}, ORACLE.MOMENT_MIX[arch], ORACLE.DEFEND_MIX[arch], ORACLE.EXTRA_MIX[arch]);
  const out = {}; let tot = 0;
  for (const [g, keys] of Object.entries(GROUPS)){ out[g] = keys.reduce((s, k) => s + (mix[k] || 0), 0); tot += out[g]; }
  for (const g in out) out[g] /= tot;
  return out;
}

/* ---------- the acceptance bands (2.3 WP-E, 4.7) ---------- */

export const BANDS = Object.freeze({
  goals: [2.3, 2.9], shots: [14, 22], onTarget: [5, 9], corners: [7, 11], offsides: [2, 4], fouls: [14, 24], yellows: [2, 4],
  win10: [0.55, 0.62], saveRate: [0.65, 0.72],
  touches: {ST: [12, 22], W: [15, 26], AM: [18, 32], CM: [20, 36], DF: [16, 30]},
  meShots: {ST: [3, 6], W: [2, 4], AM: [2, 4], CM: [0.5, 2.5], DF: [0, 1.5]},
  defActs: {ST: [1, 4], W: [2, 6], AM: [3, 7], CM: [5, 10], DF: [6, 12]},
  gapP95: [0, 90], prefShare: [0, 0.25], sideDiff: [0, 8], oracle: 0.35,
  throughOff: [0, 0.02], ratingMean: [6.45, 6.55], ratingSd: [0.55, 0.9], trust: [-1.0, 1.5],
  stepMean: [0, 0.32], stepMax: [0, 1.5],
  seqs5: [5, Infinity], counters: [2, 6], crosses: [8, 20], headersOnTarget: [1, 4], fkFinal: [2, 5]
});

/* ---------- one match ---------- */

// Run one match headless to full time and measure it. opt = {now: () => ms (a clock for the step cost), keep: false}.
export function runOne(cfg, opt = {}){
  const now = opt.now || null;
  const ms = createMatch(cfg);
  let steps = 0, sum = 0, max = 0;
  const hist = new Uint32Array(600);              // 0.01 ms buckets up to 6 ms
  while (ms.phase !== 'over' && steps < 200000){
    if (now){
      const t0 = now();
      simStep(ms);
      const d = now() - t0;
      sum += d; if (d > max) max = d;
      hist[Math.min(599, Math.floor(d*100))]++;
    } else simStep(ms);
    steps++;
  }
  const res = measure(ms);
  res.seed = cfg.seed; res.steps = steps;
  if (now){
    res.stepMean = sum/steps; res.stepMax = max;
    let acc = 0; for (let i = 0; i < 600; i++){ acc += hist[i]; if (acc >= 0.99*steps){ res.stepP99 = (i + 1)/100; break; } }
  }
  if (opt.keep) res.ms = ms;
  return res;
}

// what a finished match says
export function measure(ms){
  const C = countersAll(ms), RT = ratingsAll(ms, C), st = ms.stats, L = ms.spec.L, Wd = ms.spec.Wd;
  const out = {hash: logHash(ms), score: ms.score.slice(), goals: ms.score[0] + ms.score[1],
    shots: st.shots[0] + st.shots[1], onTarget: st.onTarget[0] + st.onTarget[1], corners: st.corners[0] + st.corners[1],
    offsides: st.offsides[0] + st.offsides[1], fouls: st.fouls[0] + st.fouls[1], yellows: st.yellows[0] + st.yellows[1],
    reds: st.reds[0] + st.reds[1], possession: st.possSec.slice(), passes: st.passes[0] + st.passes[1], passesOk: st.passesOk[0] + st.passesOk[1],
    asserts: Object.assign({}, ms.asserts), restarts: ms.restartLog.length, seqs5: (ms.chain.seqs[0] + ms.chain.seqs[1])/2,
    ovr: (ms.cfg.ovr || [0, 0]).slice(), pref: {decided: ms.pref.decided, received: ms.pref.received, calls: ms.pref.calls, capEvents: ms.pref.capEvents}};
  // saves and the shots on target they faced (a goal from a shot on target is one the keeper did not stop)
  let saves = 0, faced = 0;
  for (const ev of ms.events){
    if (ev.kind === 'kick' && (ev.intent === 'shot' || ev.atGoal) && !ev.whiff && !ev.void && (ev.res === 'saved' || ev.res === 'goal')){ faced++; if (ev.res === 'saved') saves++; }
  }
  out.saves = saves; out.faced = faced;
  // crosses, headers on target, final-third free kicks, penalties, counters
  let crosses = 0, hot = 0, through = 0, throughOff = 0;
  const kinds = {};
  for (const ev of ms.events){
    if (ev.kind !== 'kick' || ev.whiff || ev.void) continue;
    kinds[ev.intent] = (kinds[ev.intent] || 0) + 1;
    if (ev.intent === 'cross') crosses++;
    if (ev.intent === 'header' && ev.atGoal && (ev.res === 'saved' || ev.res === 'goal')) hot++;
    if (ev.intent === 'through' && !ev.rk){ through++; if (ev.offSnap && ev.offSnap.includes(ev.recv) && ev.recvOff) throughOff++; }
  }
  out.crosses = crosses; out.headersOnTarget = hot; out.through = through; out.throughOff = throughOff; out.kinds = kinds;
  out.ctlSec = st.possSec[0] + st.possSec[1];
  out.fkFinal = ms.restartLog.filter(r => r.kind === 'free' && r.final).length;
  out.pens = ms.restartLog.filter(r => r.kind === 'penalty').length;
  out.counters = countCounters(ms);
  out.restartMax = ms.restartLog.reduce((m, r) => Math.max(m, r.took - r.limit), -99);
  // ratings
  out.ratings = [];
  for (const a of ms.agents){
    if (a.role !== 'player' || RT[a.id] == null) continue;
    out.ratings.push({arch: a.isGK ? 'GK' : a.arch, r: RT[a.id], starter: a.on.length && a.on[0][0] < 1, mins: C[a.id].mins, c: C[a.id], team: a.team, isMe: a.isMe});
  }
  // the player
  const meId = ms.me >= 0 ? ms.me : ms.agents.findIndex(a => a.isMe);
  if (meId >= 0){
    const a = ms.agents[meId], c = C[meId];
    const inv = involvementOf(ms, a, C);
    let trustJ = 0;
    for (const ev of ms.events) if (ev.kind === 'verdict' && ev.agent === meId) trustJ += ev.out.trust || 0;
    // positional discipline: -0.5 trust per 15% beyond 20%, at most -1.5 a match (3.2.11)
    const pd = c.posDisc > 0.2 ? Math.min(1.5, 0.5*Math.ceil((c.posDisc - 0.2)/0.15 - 1e-9)) : 0;
    const rating = RT[meId] != null ? RT[meId] : 6.5;
    out.me = {arch: a.arch, slot: a.slot, touches: c.touches, shots: c.shots, defActs: c.defActs + c.blocks, mins: c.mins,
      gapP95: inv.gapP95, groups: inv.groups, sides: sidesOf(ms, a.team), rating, trustD: (rating - 6.5)*8*(ms.cfg.friendly ? 0.5 : 1) + trustJ - pd,
      pref: out.pref};
  }
  return out;
}

// counters (4.7): the ball won with 3 or more attackers ahead of it, then in the final third within 10 s
function countCounters(ms){
  const L = ms.spec.L;
  let n = 0;
  const ev = ms.events;
  for (let i = 0; i < ev.length; i++){
    const e = ev[i];
    if (e.kind !== 'possession' || !(e.ahead >= 3)) continue;
    const dir = ms.dirs0 ? ms.dirs0[e.team] : 1;
    for (let j = i + 1; j < ev.length; j++){
      const f = ev[j];
      if (f.t - e.t > 10 || f.kind === 'possession' || f.kind === 'out' || f.kind === 'whistle') break;
      if ((f.kind === 'touch' || f.kind === 'kick') && f.team === e.team && f.u != null && f.u > 2*L/3){ n++; break; }
    }
  }
  return n;
}

// the player's involvements: their times (for the gaps) and their kinds (for the oracle comparison)
function involvementOf(ms, a, C){
  const times = [], groups = {attack: 0, create: 0, set: 0, defend: 0};
  let lastSpell = -1;
  for (const ev of ms.events){
    if (ev.agent !== a.id) { if (ev.kind === 'touch' || ev.kind === 'kick') lastSpell = ev.agent; continue; }
    switch (ev.kind){
      case 'touch':
        if (lastSpell !== a.id) times.push(ev.t);
        if (ev.intercept != null){ groups.defend++; }
        if (ev.how === 'block') groups.defend++;
        lastSpell = a.id;
        break;
      case 'kick':
        if (lastSpell !== a.id) times.push(ev.t);
        lastSpell = a.id;
        if (ev.whiff) break;
        if (ev.rk && ev.rk !== 'kickoff' && ev.rk !== 'goalkick') groups.set++;
        else if (ev.intent === 'shot' || ev.atGoal) groups.attack++;
        else if (ev.intent === 'cross' || ev.intent === 'through' || ev.kp || (ev.intent === 'pass' || ev.intent === 'lob') && ev.gain > 12) groups.create++;
        break;
      case 'tackle': times.push(ev.t); if (ev.won) groups.defend++; break;
      case 'dribble': groups.attack++; break;
      case 'aerial': break;
    }
  }
  for (const ev of ms.events) if (ev.kind === 'aerial' && (ev.winner === a.id || ev.loser === a.id)){ times.push(ev.t); if (ev.winner === a.id) groups.defend++; }
  times.sort((x, y) => x - y);
  // gaps while he was on the pitch, between his involvements (and from his start and to his end)
  const gaps = [];
  for (const iv of a.on){
    const s = iv[0], e = iv[1] == null ? ms.t : iv[1];
    let prev = s;
    for (const t of times){ if (t < s || t > e) continue; gaps.push(t - prev); prev = t; }
    gaps.push(e - prev);
  }
  return {gapP95: pct(gaps, 0.95), groups, times: times.length};
}

// where a team's attacks go: the third (left, centre, right as it attacks) of every pass it completes in the
// opponents' half
function sidesOf(ms, team){
  const s = [0, 0, 0], L = ms.spec.L, Wd = ms.spec.Wd;
  for (const ev of ms.events){
    if (ev.kind !== 'kick' || ev.team !== team || ev.res !== 'ok' || ev.tw == null) continue;
    if (!(ev.tu > L/2)) continue;
    s[clamp(Math.floor(ev.tw/(Wd/3)), 0, 2)]++;
  }
  return s;
}

/* ---------- a batch ---------- */

export function aggregate(list){
  const R = {n: list.length};
  for (const k of ['goals', 'shots', 'onTarget', 'corners', 'offsides', 'fouls', 'yellows', 'reds', 'passes', 'passesOk', 'crosses',
    'headersOnTarget', 'fkFinal', 'pens', 'counters', 'seqs5', 'restarts', 'ctlSec']) R[k] = mean(list.map(m => m[k] || 0));
  R.kinds = {};
  for (const m of list) for (const [k, v] of Object.entries(m.kinds || {})) R.kinds[k] = (R.kinds[k] || 0) + v/list.length;
  for (const k of Object.keys(R.kinds)) R.kinds[k] = Math.round(R.kinds[k]*10)/10;
  const saves = list.reduce((a, m) => a + m.saves, 0), faced = list.reduce((a, m) => a + m.faced, 0);
  R.saveRate = faced ? saves/faced : 0;
  // the side with the higher mean overall, 7 to 13 points higher: its share of the points (draws half)
  let pts = 0, nWin = 0;
  for (const m of list){
    const d = m.ovr[0] - m.ovr[1];
    if (Math.abs(d) < 7 || Math.abs(d) > 13) continue;
    const s = d > 0 ? 0 : 1, o = 1 - s;
    pts += m.score[s] > m.score[o] ? 1 : m.score[s] === m.score[o] ? 0.5 : 0; nWin++;
  }
  R.win10 = nWin ? pts/nWin : null; R.win10n = nWin;
  // ratings of starters
  const st = []; for (const m of list) for (const x of m.ratings) if (x.starter && x.arch !== 'GK') st.push(x.r);
  R.ratingMean = mean(st); R.ratingSd = sd(st);
  // the player by archetype
  const by = {};
  for (const m of list){
    if (!m.me) continue;
    const b = by[m.me.arch] || (by[m.me.arch] = {n: 0, touches: [], shots: [], defActs: [], gap: [], groups: {attack: 0, create: 0, set: 0, defend: 0}, trust: [], rating: []});
    b.n++; b.touches.push(m.me.touches); b.shots.push(m.me.shots); b.defActs.push(m.me.defActs); b.gap.push(m.me.gapP95);
    for (const g in b.groups) b.groups[g] += m.me.groups[g] || 0;
    b.trust.push(m.me.trustD); b.rating.push(m.me.rating);
  }
  R.me = {};
  for (const [k, b] of Object.entries(by)){
    const tot = Object.values(b.groups).reduce((a, x) => a + x, 0) || 1;
    const shares = {}; for (const g in b.groups) shares[g] = b.groups[g]/tot;
    R.me[k] = {n: b.n, touches: mean(b.touches), shots: mean(b.shots), defActs: mean(b.defActs), gapP95: pct(b.gap, 0.95), gapMedian: median(b.gap),
      shares, oracle: oracleShares(k), trust: mean(b.trust), rating: mean(b.rating)};
  }
  const allMe = list.filter(m => m.me);
  R.gapP95 = pct(allMe.map(m => m.me.gapP95), 0.95);
  R.trust = mean(allMe.map(m => m.me.trustD));
  const dec = list.reduce((a, m) => a + m.pref.decided, 0), rec = list.reduce((a, m) => a + m.pref.received, 0);
  R.prefShare = rec ? dec/rec : 0;
  R.prefCaps = list.reduce((a, m) => a + (m.pref.capEvents || 0), 0);
  const thr = list.reduce((a, m) => a + m.through, 0), tho = list.reduce((a, m) => a + m.throughOff, 0);
  R.throughOff = thr ? tho/thr : 0; R.through = thr;
  R.teleports = list.reduce((a, m) => a + m.asserts.teleport, 0);
  R.ballJumps = list.reduce((a, m) => a + m.asserts.ballJump, 0);
  R.restartLate = list.reduce((a, m) => a + m.asserts.restartLate, 0);
  R.restartWorst = Math.max(...list.map(m => m.restartMax));
  const tm = list.filter(m => m.stepMean != null);
  if (tm.length){ R.stepMean = mean(tm.map(m => m.stepMean)); R.stepMax = Math.max(...tm.map(m => m.stepMax)); R.stepP99 = Math.max(...tm.map(m => m.stepP99 || 0)); }
  // attacking sides with and without the preference (paired runs carry .off)
  const on = [0, 0, 0], off = [0, 0, 0];
  for (const m of list){ if (m.me && m.me.sides){ for (let i = 0; i < 3; i++) on[i] += m.me.sides[i]; } if (m.off && m.off.me){ for (let i = 0; i < 3; i++) off[i] += m.off.me.sides[i]; } }
  const tn = on.reduce((a, b) => a + b, 0) || 1, tf = off.reduce((a, b) => a + b, 0) || 1;
  R.sidesOn = on.map(x => Math.round(1000*x/tn)/10); R.sidesOff = off.map(x => Math.round(1000*x/tf)/10);
  R.sideDiff = list.some(m => m.off) ? Math.max(...R.sidesOn.map((x, i) => Math.abs(x - R.sidesOff[i]))) : null;
  R.hashes = list.map(m => m.hash);
  return R;
}

// the report against the bands: [{name, value, lo, hi, pass}]
export function checkReport(R){
  const out = [];
  const band = (name, v, b) => out.push({name, value: v == null ? null : Math.round(v*1000)/1000, lo: b[0], hi: b[1], pass: v != null && v >= b[0] && v <= b[1]});
  for (const k of ['goals', 'shots', 'onTarget', 'corners', 'offsides', 'fouls', 'yellows']) band(k + ' per match', R[k], BANDS[k]);
  band('win share, 10 overall higher', R.win10, BANDS.win10);
  band('keeper save rate', R.saveRate, BANDS.saveRate);
  for (const [k, m] of Object.entries(R.me)){
    if (!BANDS.touches[k]) continue;
    band(`${k} touches`, m.touches, BANDS.touches[k]);
    band(`${k} shots`, m.shots, BANDS.meShots[k]);
    band(`${k} defensive actions`, m.defActs, BANDS.defActs[k]);
    for (const g of Object.keys(m.oracle)){
      const o = m.oracle[g], s = m.shares[g];
      out.push({name: `${k} ${g} share vs oracle`, value: Math.round(s*1000)/1000, lo: Math.round(o*(1 - BANDS.oracle)*1000)/1000,
        hi: Math.round(o*(1 + BANDS.oracle)*1000)/1000, pass: s >= o*(1 - BANDS.oracle) && s <= o*(1 + BANDS.oracle)});
    }
  }
  band('95th percentile gap between the player\'s involvements (s)', R.gapP95, BANDS.gapP95);
  band('preference-decided share of passes received', R.prefShare, BANDS.prefShare);
  if (R.sideDiff != null) band('attacking side distribution vs preference off (points)', R.sideDiff, BANDS.sideDiff);
  band('through balls to an offside receiver', R.throughOff, BANDS.throughOff);
  band('starters\' mean rating', R.ratingMean, BANDS.ratingMean);
  band('starters\' rating spread', R.ratingSd, BANDS.ratingSd);
  band('player\'s trust change per match', R.trust, BANDS.trust);
  out.push({name: 'no teleports (agents)', value: R.teleports, lo: 0, hi: 0, pass: R.teleports === 0});
  out.push({name: 'no ball jumps', value: R.ballJumps, lo: 0, hi: 0, pass: R.ballJumps === 0});
  out.push({name: 'restarts within limit + 5 s', value: R.restartLate, lo: 0, hi: 0, pass: R.restartLate === 0});
  if (R.stepMean != null){ band('simStep mean (ms)', R.stepMean, BANDS.stepMean); band('simStep max (ms)', R.stepMax, BANDS.stepMax); }
  band('sequences of 5+ passes per team', R.seqs5, BANDS.seqs5);
  band('counters per match', R.counters, BANDS.counters);
  band('crosses per match', R.crosses, BANDS.crosses);
  band('headers on target per match', R.headersOnTarget, BANDS.headersOnTarget);
  band('final-third free kicks per match', R.fkFinal, BANDS.fkFinal);
  return out;
}

/* ---------- refitting the rating table (--fit-ratings, 1.5.8) ---------- */

// E per archetype: medians per 90 of the starters who played at least 80 minutes; R0 so that starters average 6.5
export function fitRatings(list){
  const per = {};
  const keys = Object.keys(RATE.E).filter(k => k !== 'saves' && k !== 'bcm' && k !== 'err');
  for (const m of list) for (const x of m.ratings){
    if (!x.starter || x.mins < 80 || x.arch === 'GK') continue;
    const p = per[x.arch] || (per[x.arch] = {});
    for (const k of keys){ (p[k] || (p[k] = [])).push((x.c[k] || 0)*90/Math.max(1, x.mins)); }
  }
  const E = {};
  for (const k of keys){ E[k] = {}; for (const arch of ['ST', 'W', 'AM', 'CM', 'DF']) E[k][arch] = per[arch] && per[arch][k] ? Math.round(median(per[arch][k])*100)/100 : RATE.E[k][arch]; }
  // R0: the shift that brings the starters' mean to 6.5 under the new E
  const save = {E: RATE.E, R0: RATE.R0};
  const E2 = Object.assign({}, RATE.E, E);
  RATE.E = E2;
  const rs = [];
  for (const m of list) for (const x of m.ratings){
    if (!x.starter || x.arch === 'GK') continue;
    const my = x.team === 0 ? m.score[0] : m.score[1], th = x.team === 0 ? m.score[1] : m.score[0];
    rs.push(rateAgent(x.c, x.arch, {mins: x.mins, res: my > th ? 'W' : my < th ? 'L' : 'D', conceded: x.c.conceded}));
  }
  const R0 = Math.round((save.R0 + 6.5 - mean(rs))*100)/100;
  RATE.E = save.E;
  return {E, R0, n: rs.length};
}
