"use strict";
/* ============ WORLD ============
   Every club and every (fictional) player lives here. Saved inside S.W. */
let W = null, SQ = null;
const SQUAD = ["GK","GK","DF","DF","DF","DF","DF","DF","DF","CM","CM","CM","CM","CM","CAM","CAM","LW","RW","ST","ST","ST"];
const POSW_G = {GK:.01, DF:.22, CM:.6, CAM:1.25, LW:1.1, RW:1.1, ST:2.3};
const POSW_A = {GK:.02, DF:.4, CM:1, CAM:1.7, LW:1.35, RW:1.35, ST:.8};
const MY_POS = {ST:"ST", W:"LW", AM:"CAM", CM:"CM", DF:"DF"};

const club = id => W.clubs[id];
const player = id => W.players[id];
function pname(p){ if (p.me) return S.player.name; const N = NAMES[p.nat]; return N.f[p.fn] + " " + N.l[p.ln]; }
function sname(p){ if (p.me) return S.player.name.trim().split(/\s+/).slice(-1)[0]; return NAMES[p.nat].l[p.ln]; }
function meP(){ return W.players[S.meId]; }
function myClub(){ const p = meP(); return p && p.club >= 0 ? W.clubs[p.club] : null; }
// between clubs you still have a career — everything that asks which league you are in has to cope
function myLg(){ const c = myClub(); return c ? c.lg : null; }
// a club's name as a page prints it: a player between clubs (club -1) is a free agent
const FREE_AGENT = "Free agent";
function clubLabel(id){ const c = id >= 0 && W ? W.clubs[id] : null; return c ? c.nm : FREE_AGENT; }
// the league a page shows as yours: your club's, or, between clubs, the bottom division at home, where every career starts
function shownLg(){
  const c = myClub(); if (c) return c.lg;
  const home = Object.values(W.leagues).filter(l => l.cc === "ROU").sort((a, b) => b.t - a.t || a.id.localeCompare(b.id))[0];
  return (home || Object.values(W.leagues)[0]).id;
}
function gw(){ return (W.season-1)*CAL.W + S.week; }
function monthName(w){ return CAL.MONTHS[Math.min(9, Math.floor(w/4))]; }
function calYear(w){ return S.year + (Math.floor(w/4) >= 5 ? 1 : 0); }
function windowAt(w){
  if (w <= 3) return {open:true, name:"Summer", left:4-w};
  if (w >= 20 && w <= 23) return {open:true, name:"Winter", left:24-w};
  return {open:false, next: w < 20 ? "Winter window (January)" : "Summer window", opens: w < 20 ? 20-w : CAL.W-w};
}
function clubRepInit(name, cc, t){ if (CLUB_REP[name]) return CLUB_REP[name]; const [a,b] = REP_BAND[cc][t]; return Math.round(a + (b-a)*hash(name)); }
function meanOvr(rep){ return 28 + Math.pow(Math.max(1,rep)/9500, .7)*57; }
function wageLevel(rep){ return 40*Math.exp(.00093*(rep-100)); }
/* What a player is worth on the market. Ability is the spine of it, but a valuation that only
   read ability would price a 33-year-old the same as a 24-year-old. So: an age curve that peaks
   in the mid-twenties and falls away hard after thirty, an upside premium for a young player
   whose ceiling is far above where he is now, a premium for being a known name, and a little
   for what he has actually done in his career. */
const VAL_AGE = {16:1.02, 17:1.06, 18:1.10, 19:1.16, 20:1.20, 21:1.24, 22:1.26, 23:1.27, 24:1.26,
                 25:1.24, 26:1.18, 27:1.08, 28:.95, 29:.84, 30:.66, 31:.52, 32:.38, 33:.27, 34:.19, 35:.13};
function marketValue(p){
  if (!p) return 0;
  const base = 350*Math.exp(clamp(p.ovr, 1, 99)*.138);
  const age = VAL_AGE[clamp(p.age, 16, 35)] || (p.age < 16 ? 1 : .09);
  // room to grow, and only while he is still young enough for a buyer to believe in it
  const youth = clamp((27 - p.age)/8, 0, 1);
  const upside = 1 + clamp((p.pot || p.ovr) - p.ovr, 0, 25)/25*.75*youth;
  // a name of his own is worth money on top of what he can do
  const fame = ((p.rep || 0) + (p.wrep || 0)*1.5)/2;
  const star = 1 + clamp(fame/6000, 0, 1)*.35;
  const cr = p.cr || {g:0, a:0};
  const done = 1 + clamp((cr.g + cr.a*.6)/400, 0, .12);
  const v = base*age*upside*star*done;
  // rounded the way a valuation is quoted, not to the euro
  const step = v >= 5e6 ? 5e5 : v >= 1e6 ? 1e5 : v >= 1e5 ? 1e4 : 1e3;
  return Math.max(step, Math.round(v/step)*step);
}
function valueOf(p){ return marketValue(p); }
function isBig5(cc){ return cc !== "ROU"; }
const zst = () => ({ap:0, g:0, a:0, mo:0, rs:0});

function newPlayer(nat, pos, age, ovr, clubId){
  const N = NAMES[nat];
  const p = {id:W.players.length, fn:ri(0, N.f.length-1), ln:ri(0, N.l.length-1), nat, pos, age, ovr:Math.round(clamp(ovr, 15, 94)),
    pot:0, rep:0, wrep:0, club:clubId, loan:-1, inj:0, st:zst(), m:zst(), ct:zst(), el:zst(), cu:zst(), nt:{caps:0, g:0}, cr:{ap:0, g:0, a:0, mo:0}, tro:0, fol:0, per:ri(0,3)};
  p.pot = Math.round(clamp(p.ovr + (age < 21 ? ri(5,22) : age < 25 ? ri(0,10) : 0), 15, 95));
  W.players.push(p); return p;
}
function calcRep(p){
  const c = W.clubs[p.club]; if (!c) return p.rep;
  const rel = clamp((p.ovr - meanOvr(c.rep))/30 + .45, .05, 1.2);
  return Math.round(clamp(c.rep*(.2 + rel*.6) + p.tro*60 + p.cr.g*1.5 + p.nt.caps*20, 1, 12000));
}
function calcWrep(p){ const c = W.clubs[p.club]; const f = c && isBig5(c.cc) ? (c.t === 1 ? .75 : .35) : .15; return Math.round(p.rep*f + p.nt.caps*40 + p.ct.g*30); }
function genSquad(c){
  const m = meanOvr(c.rep), home = COUNTRIES[c.cc].nat;
  const homeShare = c.cc === "ROU" ? (c.t === 1 ? .7 : .9) : c.t === 1 ? .45 : .72;
  for (const pos of [...SQUAD, pick(["DF","CM","ST","LW","RW","CAM"])]){
    const nat = Math.random() < homeShare ? home : pick(FOREIGN_NATS);
    const age = ri(17, 34), ovr = m + gauss()*4.5 + (age < 21 ? -4 : age > 31 ? -2 : 0);
    newPlayer(nat, pos, age, ovr, c.id);
  }
}
function genWorld(){
  W = S.W = {clubs:[], players:[], leagues:{}, comps:{}, season:1, done:{}, nat:{}, awards:{potm:{}, poty:{}, boot:{}, ballon:[]}, champs:[]};
  for (const [cc, C] of Object.entries(COUNTRIES)) for (const L of C.leagues) for (const nm of L.clubs){
    const rep = clubRepInit(nm, cc, L.t);
    const c = {id:W.clubs.length, nm, cc, t:L.t, rep, fin:Math.round(20*Math.pow(rep, 1.75)), lg:null, lastPos:0};
    W.clubs.push(c); genSquad(c);
  }
  for (const p of W.players){ p.rep = calcRep(p); p.wrep = calcWrep(p); p.fol = Math.round(Math.pow(p.rep, 1.35)*2 + ri(20, 400)); }
  buildSeason();
}
function indexSquads(){ SQ = {}; for (const p of W.players) if (p && p.club >= 0) (SQ[p.club] || (SQ[p.club] = [])).push(p); }
function squadOf(cid){ if (!SQ) indexSquads(); return SQ[cid] || []; }
/* The coach picks a shape, not simply the eleven best names: a keeper, a back four, three in
   midfield, one behind the front two. Short of bodies in a line, he fills it with whoever is left. */
const FORMATION = [["GK", 1], ["DF", 4], ["CM", 3], ["CAM", 1], ["FWD", 2]];
const isFwd = p => p.pos === "ST" || p.pos === "LW" || p.pos === "RW";
const lineOf = p => p.pos === "GK" ? "GK" : isFwd(p) ? "FWD" : p.pos;
function lineup(cid){
  let sq = squadOf(cid).filter(p => !p.inj);
  if (sq.length < 12) sq = squadOf(cid);           // injury crisis: the walking wounded have to play
  const used = new Set(), xi = [];
  const shape = typeof formationLinesOf === "function" ? formationLinesOf(club(cid)) : FORMATION;   // the club's own shape (positions.js)
  for (const [k, n] of shape){
    sq.filter(p => lineOf(p) === k && !used.has(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, n)
      .forEach(p => { used.add(p.id); xi.push(p); });
  }
  if (xi.length < 11){                              // a line came up short, so fill it from the rest
    for (const p of sq.filter(p => !used.has(p.id) && p.pos !== "GK").sort((a, b) => b.ovr - a.ovr)){
      if (xi.length >= 11) break;
      used.add(p.id); xi.push(p);
    }
  }
  const me = sq.find(p => p.me);
  if (me && !used.has(me.id) && S.trust >= 12){      // once he trusts you, you come in for someone in your own line
    let out = null;
    for (const p of xi) if (p.pos !== "GK" && lineOf(p) === lineOf(me) && (!out || p.ovr < out.ovr)) out = p;
    if (!out) for (const p of xi) if (p.pos !== "GK" && (!out || p.ovr < out.ovr)) out = p;
    if (out) xi[xi.indexOf(out)] = me;
  }
  return xi;
}
const strength = xi => xi.reduce((s,p) => s + p.ovr, 0)/Math.max(1, xi.length);
function roundRobin(teams, dbl){
  const t = [...teams]; if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n-1; r++){
    const m = [];
    for (let i = 0; i < n/2; i++){ const a = t[i], b = t[n-1-i]; if (a != null && b != null) m.push(r%2 ? [b,a] : [a,b]); }
    rounds.push(m); t.splice(1, 0, t.pop());
  }
  if (dbl) rounds.push(...rounds.map(r => r.map(([a,b]) => [b,a])));
  return rounds;
}
function roundWeeks(R){
  const slots = []; for (let w = 1; w <= 38; w++) if (!CAL.INTL.includes(w)) slots.push(w);
  return Array.from({length:R}, (_, k) => slots[Math.floor(k*slots.length/R)]);
}
function buildSeason(){
  W.leagues = {}; W.done = {};
  for (const [cc, C] of Object.entries(COUNTRIES)) for (const L of C.leagues){
    const ids = W.clubs.filter(c => c.cc === cc && c.t === L.t).map(c => c.id);
    let groups = [ids];
    if (L.series){ const sh = shuffle(ids), n = L.series; groups = Array.from({length:n}, (_, i) => sh.filter((_, k) => k % n === i)); }
    groups.forEach((g, i) => {
      const id = cc + L.t + (L.series ? String.fromCharCode(65+i) : "");
      const lg = {id, cc, t:L.t, nm:L.nm + (L.series ? " · Series " + String.fromCharCode(65+i) : ""), clubs:g, tab:{},
        rounds:roundRobin(shuffle(g), !(cc === "ROU" && L.t === 2)), rw:[]};
      lg.rw = roundWeeks(lg.rounds.length);
      g.forEach(cid => { lg.tab[cid] = [0,0,0,0,0,0,0]; W.clubs[cid].lg = id; });
      W.leagues[id] = lg;
    });
  }
  buildEuro(); buildCups(); buildWC(); W.fr = null;
}
function buildEuro(){
  // Every country with a top division is represented in Europe. Extra places then go to the
  // strongest leagues, so the big countries bring three or four clubs and the smallest bring one.
  const ccs = Object.keys(COUNTRIES).filter(cc => W.clubs.some(c => c.cc === cc && c.t === 1))
    .sort((a, b) => COUNTRIES[b].strength - COUNTRIES[a].strength);
  const SIZE = 32;
  const alloc = cap => {
    const a = {}; let left = cap;
    for (const cc of ccs){ if (left <= 0) break; a[cc] = 1; left--; }
    for (const bar of [.9, .75, .6, 0]) for (const cc of ccs){
      if (left <= 0) break;
      if (a[cc] && COUNTRIES[cc].strength >= bar){ a[cc]++; left--; }
    }
    return a;
  };
  const clA = alloc(SIZE), elA = alloc(SIZE);
  const pickTop = (cc, n, skip) => W.clubs.filter(c => c.cc === cc && c.t === 1)
    .sort((a, b) => (a.lastPos || 99) - (b.lastPos || 99) || b.rep - a.rep).slice(skip, skip + n).map(c => c.id);
  const cl = [], el = [];
  for (const cc of ccs) cl.push(...pickTop(cc, clA[cc] || 0, 0));
  for (const cc of ccs) el.push(...pickTop(cc, elA[cc] || 0, clA[cc] || 0));
  W.comps = {};
  for (const [id, clubs] of [["CL", cl], ["EL", el]]){
    const comp = {id, nm:CONT[id], clubs, tab:{}, md:roundRobin(shuffle(clubs.slice()), false).slice(0, CAL.EURO.length), ko:{}, winner:null};
    clubs.forEach(c => comp.tab[c] = [0,0,0,0,0,0,0]);
    W.comps[id] = comp;
  }
}
/* ---------- domestic cups: every club in the top two divisions of a country, straight knockout ---------- */
function buildCups(){
  W.cups = {};
  for (const [cc, C] of Object.entries(COUNTRIES)){
    let entrants = W.clubs.filter(c => c.cc === cc && c.t <= 2).sort((a, b) => b.rep - a.rep).map(c => c.id);
    if (entrants.length < 4) continue;
    // the bracket can only be as deep as there are cup weeks
    const maxSize = Math.pow(2, CAL.CUP.length);
    if (entrants.length > maxSize) entrants = entrants.slice(0, maxSize);
    let size = 2; while (size < entrants.length) size *= 2;
    const rounds = Math.round(Math.log2(size));
    const weeks = CAL.CUP.slice(-rounds);
    // byes go to the strongest sides, so the big clubs enter the cup later, as they do in real life
    const byes = size - entrants.length;
    const seeded = entrants.slice(0, byes), rest = shuffle(entrants.slice(byes));
    const pairs = [];
    for (const id of seeded) pairs.push([id, -1]);
    for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
    if (rest.length % 2) pairs.push([rest[rest.length - 1], -1]);
    shuffle(pairs);
    W.cups[cc] = {cc, nm:`${C.name} Cup`, rounds, weeks, tie:{[weeks[0]]:pairs}, res:{}, winner:null};
  }
}
function cupRoundName(cup, w){
  const left = cup.weeks.length - cup.weeks.indexOf(w);
  return left === 1 ? "Final" : left === 2 ? "Semi-final" : left === 3 ? "Quarter-final" : `Round of ${Math.pow(2, left)}`;
}
function myCup(){ const c = myClub(); return c ? (W.cups || {})[c.cc] : null; }
/* ---------- the World Championship: two group games, semi-finals, final ---------- */
function buildWC(){
  // not everyone gets in: the eight strongest squads in the world qualify, the rest play friendlies
  const strength = nat => {
    const sq = W.players.filter(p => p && p.nat === nat && p.club >= 0).sort((a, b) => b.ovr - a.ovr).slice(0, 11);
    return sq.length < 11 ? -1 : sq.reduce((t, p) => t + p.ovr, 0)/sq.length;
  };
  const n = HOME_NATS.slice().sort((a, b) => strength(b) - strength(a)).slice(0, 8);
  const tab = {}; n.forEach(x => tab[x] = [0,0,0,0,0,0,0]);
  W.wc = {tab, md:roundRobin(shuffle(n.slice()), false).slice(0, CAL.WC.grp.length), ko:{}, winner:null, season:W.season};
}
function sortNatTab(tab){
  return Object.keys(tab).sort((x, y) => { const a = tab[x], b = tab[y]; return (b[6]-a[6]) || ((b[4]-b[5])-(a[4]-a[5])) || (b[4]-a[4]) || (x < y ? -1 : 1); });
}
function sortTab(tab){
  return Object.keys(tab).map(Number).sort((x,y) => { const a = tab[x], b = tab[y]; return (b[6]-a[6]) || ((b[4]-b[5])-(a[4]-a[5])) || (b[4]-a[4]) || x-y; });
}
function recordTab(tab, h, a, hg, ag){
  const H = tab[h], A = tab[a]; if (!H || !A) return;
  H[0]++; A[0]++; H[4] += hg; H[5] += ag; A[4] += ag; A[5] += hg;
  if (hg > ag){ H[1]++; A[3]++; H[6] += 3; } else if (hg < ag){ A[1]++; H[3]++; A[6] += 3; } else { H[2]++; A[2]++; H[6]++; A[6]++; }
}

/* ---------- fixtures ---------- */
function fixturesAt(w){
  const out = [];
  for (const lg of Object.values(W.leagues)) lg.rw.forEach((rw, r) => { if (rw === w) for (const [h,a] of lg.rounds[r]) out.push({kind:"L", lg:lg.id, h, a, key:`L${lg.id}:${r}:${h}`}); });
  const md = CAL.EURO.indexOf(w);
  for (const comp of Object.values(W.comps)){
    if (md >= 0) for (const [h,a] of comp.md[md] || []) out.push({kind:"E", comp:comp.id, h, a, key:`E${comp.id}:${md}:${h}`});
    for (const [stage, sw] of Object.entries(CAL.KO)) if (sw === w && comp.ko[stage]) comp.ko[stage].forEach((pr, i) => out.push({kind:"E", comp:comp.id, stage, i, h:pr[0], a:pr[1], key:`E${comp.id}:${stage}:${i}`}));
  }
  // pre-season friendlies: every club plays one, nothing is recorded but the minutes
  if (w === CAL.FRIENDLY) for (const [h, a] of friendlyPairs()) out.push({kind:"F", h, a, key:`F${h}`});
  // domestic cups
  for (const cup of Object.values(W.cups || {})) for (const [h, a] of (cup.tie[w] || []))
    if (h >= 0 && a >= 0) out.push({kind:"C", cc:cup.cc, w, h, a, key:`C${cup.cc}:${w}:${h}`});
  // internationals: a friendly, then the World Championship
  if (CAL.INTL.includes(w)){
    const g = CAL.WC.grp.indexOf(w), busy = new Set();
    if (W.wc && g >= 0) for (const [h, a] of W.wc.md[g] || []){ out.push({kind:"N", wc:"grp", h, a, key:`N${w}:${h}`}); busy.add(h); busy.add(a); }
    else if (W.wc && w === CAL.WC.sf && W.wc.ko.sf) W.wc.ko.sf.forEach((pr, i) => { out.push({kind:"N", wc:"sf", i, h:pr[0], a:pr[1], key:`N${w}:${i}`}); busy.add(pr[0]); busy.add(pr[1]); });
    else if (W.wc && w === CAL.WC.f && W.wc.ko.f) W.wc.ko.f.forEach((pr, i) => { out.push({kind:"N", wc:"f", i, h:pr[0], a:pr[1], key:`N${w}:${i}`}); busy.add(pr[0]); busy.add(pr[1]); });
    // everyone with no tournament game to play arranges a friendly
    natPairs(w).forEach(([h, a]) => { if (!busy.has(h) && !busy.has(a)) out.push({kind:"N", h, a, key:`N${w}:${h}`}); });
  }
  return out;
}
function friendlyPairs(){
  if (!W.fr){ const ids = shuffle(W.clubs.map(c => c.id)); W.fr = []; for (let i = 0; i + 1 < ids.length; i += 2) W.fr.push([ids[i], ids[i+1]]); }
  return W.fr;
}
function natPairs(w){
  if (!W.nat[w]){ const n = shuffle(HOME_NATS.slice()), out = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i+1]]);
    W.nat[w] = out; }
  return W.nat[w];
}
function natSquad(nat){
  return W.players.filter(p => p && p.nat === nat && p.club >= 0 && !p.inj)
    .sort((a,b) => (b.ovr + b.rep/400 + (b.st.ap ? (b.st.rs/b.st.ap - 6.5)*3 : 0)) - (a.ovr + a.rep/400 + (a.st.ap ? (a.st.rs/a.st.ap - 6.5)*3 : 0))).slice(0, 23);
}
function compLabel(f){
  if (f.kind === "D") return "The Dream";
  if (f.kind === "F") return "Pre-season friendly";
  if (f.kind === "L") return W.leagues[f.lg].nm;
  if (f.kind === "C"){ const cup = (W.cups || {})[f.cc]; return cup ? `${cup.nm} · ${cupRoundName(cup, f.w)}` : "Cup"; }
  if (f.kind === "E") return `${CONT[f.comp]}${f.stage ? " · " + {qf:"Quarter-final", sf:"Semi-final", f:"Final"}[f.stage] : ""}`;
  if (f.kind === "N" && f.wc) return `World Championship${f.wc === "grp" ? " · Group stage" : f.wc === "sf" ? " · Semi-final" : " · Final"}`;
  return "International friendly";
}
function sideName(f, side){ if (f.kind === "D") return side === "h" ? f.hName : f.aName; const v = f[side]; return f.kind === "N" ? NAMES[v].n : W.clubs[v].nm; }

/* ---------- match simulation ---------- */
// which bucket a match counts towards. ct is the Champs League, el the Euro League — kept apart so
// each competition has its own scorers table. Careers from before the split keep everything in ct.
function statKey(kind, comp){ return kind === "L" ? "st" : kind === "C" ? "cu" : kind === "E" ? (comp === "EL" ? "el" : "ct") : "nt"; }
function applyStats(p, kind, g, a, rating, motm, comp){
  if (kind === "F") return;                    // pre-season: minutes only, nothing goes on your record
  if (kind === "N"){ p.nt.caps++; p.nt.g += g; p.nt.a = (p.nt.a || 0) + a; }
  else { const s = p[statKey(kind, comp)] || (p[statKey(kind, comp)] = zst()); s.ap++; s.g += g; s.a += a; s.rs += rating; if (motm) s.mo++;
    if (kind === "L"){ p.m.ap++; p.m.g += g; p.m.a += a; p.m.rs += rating;
      if (typeof noteWeekPerformance === "function") noteWeekPerformance(p, W.clubs[p.club] ? W.clubs[p.club].lg : null, g, a, rating, motm); } }
  p.cr.ap++; p.cr.g += g; p.cr.a += a; if (motm) p.cr.mo++;
}
function pickScorers(xi, n, exclude){
  const out = [];
  const pool = xi.filter(p => !exclude || !exclude(p));
  for (let i = 0; i < n; i++){
    const s = wpick(pool, p => POSW_G[p.pos]*Math.pow(p.ovr/60, 3));
    const as = Math.random() < .75 ? wpick(pool.filter(p => p !== s), p => POSW_A[p.pos]*Math.pow(p.ovr/60, 2)) : null;
    out.push({s:s.id, a:as ? as.id : -1});
  }
  return out;
}
function goalsFor(sh, sa, home){ const d = (sh - sa)/6 + (home ? .15 : -.15); return [poisson(clamp(1.3*Math.exp(.4*d), .2, 4.5)), poisson(clamp(1.3*Math.exp(-.4*d), .2, 4.5))]; }
// finalise any match: goals lists are [{s, a}] with player ids. ratings: optional map of fixed ratings (for you).
function finaliseMatch(f, hx, ax, hG, aG, fixed){
  const hg = hG.length, ag = aG.length, rt = {};
  const rate = (xi, mine, their, win, loss) => xi.forEach(p => {
    const g = mine.filter(e => e.s === p.id).length, a = mine.filter(e => e.a === p.id).length;
    rt[p.id] = fixed && fixed[p.id] != null ? fixed[p.id] :
      +clamp(6.2 + gauss()*.45 + g*1.1 + a*.7 + (win ? .3 : loss ? -.25 : 0) + ((p.pos === "GK" || p.pos === "DF") && their.length === 0 ? .5 : 0) - ((p.pos === "GK") ? their.length*.3 : 0), 4, 10).toFixed(1);
  });
  rate(hx, hG, aG, hg > ag, hg < ag); rate(ax, aG, hG, ag > hg, ag < hg);
  const all = [...hx, ...ax]; let motm = all[0];
  for (const p of all) if (rt[p.id] + (hx.includes(p) ? (hg > ag ? .3 : 0) : (ag > hg ? .3 : 0)) > rt[motm.id] + (hx.includes(motm) ? (hg > ag ? .3 : 0) : (ag > hg ? .3 : 0))) motm = p;
  for (const [xi, G] of [[hx, hG], [ax, aG]]) for (const p of xi){
    applyStats(p, f.kind, G.filter(e => e.s === p.id).length, G.filter(e => e.a === p.id).length, rt[p.id], p === motm, f.comp);
    if (!p.me && Math.random() < .004) p.inj = ri(1, 7);
  }
  if (f.kind === "L") recordTab(W.leagues[f.lg].tab, f.h, f.a, hg, ag);
  if (f.kind === "E"){ const c = W.comps[f.comp]; if (!f.stage) recordTab(c.tab, f.h, f.a, hg, ag); else c.ko[f.stage + "R"] = (c.ko[f.stage + "R"] || []).concat([{i:f.i, h:f.h, a:f.a, hg, ag, win: hg > ag ? f.h : ag > hg ? f.a : (Math.random() < .5 ? f.h : f.a)}]); }
  if (f.kind === "C"){ const cup = W.cups[f.cc];
    if (cup){ const win = hg > ag ? f.h : ag > hg ? f.a : (Math.random() < .5 ? f.h : f.a);
      (cup.res[f.w] = cup.res[f.w] || []).push({h:f.h, a:f.a, hg, ag, win}); } }
  if (f.kind === "N" && W.wc){
    if (f.wc === "grp") recordTab(W.wc.tab, f.h, f.a, hg, ag);
    else if (f.wc) W.wc.ko[f.wc + "R"] = (W.wc.ko[f.wc + "R"] || []).concat([{i:f.i, h:f.h, a:f.a, hg, ag, win: hg > ag ? f.h : ag > hg ? f.a : (Math.random() < .5 ? f.h : f.a)}]);
  }
  W.done[f.key] = {hg, ag};
  const res = {f, hg, ag, hG, aG, rt, motm:motm.id};
  newsFromMatch(res);
  return res;
}
function simFixture(f){
  if (W.done[f.key]) return null;
  let hx, ax;
  if (f.kind === "N"){ const hs = natSquad(f.h), as = natSquad(f.a); hx = hs.slice(0, 11); ax = as.slice(0, 11); }
  else { hx = lineup(f.h); ax = lineup(f.a); }
  const [hg, ag] = goalsFor(strength(hx), strength(ax), f.kind !== "N");
  return finaliseMatch(f, hx, ax, pickScorers(hx, hg), pickScorers(ax, ag));
}

/* ---------- the week ---------- */
function advanceWorldWeek(){
  const w = S.week;
  indexSquads();
  for (const f of fixturesAt(w)) simFixture(f);
  advanceCups(w); advanceWC(w);
  // end of the European group phase. The top half of the Champs League goes through; the bottom half
  // drops into the Euro League knockout and meets the sides that topped that group.
  if (w === CAL.EURO[5]){
    const cl = W.comps.CL, el = W.comps.EL;
    if (cl && el){
      const ct = sortTab(cl.tab), et = sortTab(el.tab);
      const through = ct.slice(0, 8), dropped = ct.slice(8, 12), elTop = et.slice(0, 4);
      // the top eight go into the Champs League quarter-finals
      cl.ko.qf = [[through[0], through[7]], [through[1], through[6]], [through[2], through[5]], [through[3], through[4]]]
        .filter(p => p[0] != null && p[1] != null);
      cl.dropped = dropped;
      // the Euro League knockout is the four who topped its group against the four who fell out of the Champs League
      el.ko.qf = [[elTop[0], dropped[3]], [elTop[1], dropped[2]], [elTop[2], dropped[1]], [elTop[3], dropped[0]]]
        .filter(p => p[0] != null && p[1] != null);
      for (const cid of dropped) addNews("world", `${W.clubs[cid].nm} drop into the ${CONT.EL}`,
        `Bottom half of the ${CONT.CL} group phase. Their European run carries on in the ${CONT.EL} knockout.`);
    }
  }
  if (w === CAL.KO.qf) for (const c of Object.values(W.comps)){ const r = (c.ko.qfR || []).sort((a,b) => a.i-b.i).map(x => x.win); if (r.length === 4) c.ko.sf = [[r[0],r[3]],[r[1],r[2]]]; }
  if (w === CAL.KO.sf) for (const c of Object.values(W.comps)){ const r = (c.ko.sfR || []).sort((a,b) => a.i-b.i).map(x => x.win); if (r.length === 2) c.ko.f = [[r[0], r[1]]]; }
  if (w === CAL.KO.f) for (const c of Object.values(W.comps)){ const r = c.ko.fR && c.ko.fR[0]; if (r){ c.winner = r.win; for (const p of squadOf(r.win)) p.tro++; addNews("world", `${W.clubs[r.win].nm} win the ${c.nm}!`, `${W.clubs[r.win].nm} beat ${W.clubs[r.win === r.h ? r.a : r.h].nm} ${Math.max(r.hg,r.ag)}–${Math.min(r.hg,r.ag)} in the final.`); if (squadOf(r.win).some(p => p.me)) myTrophy(c.nm); } }
  for (const p of W.players) if (p && p.inj > 0 && !p.me) p.inj--;
  if (typeof weekAwards === "function") weekAwards(w);
  if (w % 4 === 3){ monthAwards(w); if (typeof goalOfMonth === "function") goalOfMonth(w); }
  if (windowAt(w).open) aiTransfers();
}
/* the winners of one cup round are drawn against each other for the next */
function advanceCups(w){
  for (const cup of Object.values(W.cups || {})){
    const i = cup.weeks.indexOf(w); if (i < 0) continue;
    const played = cup.res[w] || [];
    // a bye carries a club straight through
    const byes = (cup.tie[w] || []).filter(([h, a]) => h < 0 || a < 0).map(([h, a]) => h < 0 ? a : h).filter(x => x >= 0);
    const winners = played.map(r => r.win).concat(byes);
    if (i === cup.weeks.length - 1){
      const champ = winners[0];
      if (champ != null){
        cup.winner = champ;
        for (const p of squadOf(champ)) p.tro++;
        addNews("world", `${W.clubs[champ].nm} win the ${cup.nm}`, `They lift the cup at the end of the season.`);
        if (squadOf(champ).some(p => p.me)) myTrophy(cup.nm);
      }
      continue;
    }
    const next = [];
    for (let k = 0; k + 1 < winners.length; k += 2) next.push([winners[k], winners[k + 1]]);
    if (winners.length % 2) next.push([winners[winners.length - 1], -1]);
    cup.tie[cup.weeks[i + 1]] = next;
  }
}
function advanceWC(w){
  const wc = W.wc; if (!wc) return;
  if (w === CAL.WC.grp[CAL.WC.grp.length - 1]){
    const t = sortNatTab(wc.tab);
    wc.ko.sf = [[t[0], t[3]], [t[1], t[2]]];
    addNews("intl", "World Championship semi-finals are set", `${NAMES[t[0]].n} v ${NAMES[t[3]].n} and ${NAMES[t[1]].n} v ${NAMES[t[2]].n}.`);
  }
  if (w === CAL.WC.sf){
    const r = (wc.ko.sfR || []).sort((a, b) => a.i - b.i).map(x => x.win);
    if (r.length === 2) wc.ko.f = [[r[0], r[1]]];
  }
  if (w === CAL.WC.f){
    const r = wc.ko.fR && wc.ko.fR[0];
    if (r){
      wc.winner = r.win;
      addNews("intl", `${NAMES[r.win].n} are World Champions!`, `They beat ${NAMES[r.win === r.h ? r.a : r.h].n} ${Math.max(r.hg, r.ag)}–${Math.min(r.hg, r.ag)} in the final.`);
      if (meP().nat === r.win) myTrophy("World Championship");
    }
  }
}
function monthAwards(w){
  const mine = myLg();
  for (const lg of Object.values(W.leagues)){
    if (lg.t > 1 && lg.id !== mine) continue;
    let best = null, bs = -1e9;
    for (const cid of lg.clubs) for (const p of squadOf(cid)) if (p.m.ap >= 2){ const s = p.m.g*3 + p.m.a*2 + (p.m.rs/p.m.ap - 6.5)*4; if (s > bs){ bs = s; best = p; } }
    if (!best) continue;
    W.awards.potm[lg.id] = best.id; best.rep += Math.round(20 + W.clubs[best.club].rep*.01);
    if (best.me) myAward(`Player of the Month (${monthName(w)}): ${lg.nm}`, 60);
    else if (lg.id === mine) addNews("award", `${pname(best)} is ${lg.nm} Player of the Month`, `${best.m.g} goals, ${best.m.a} assists in ${monthName(w)} for ${W.clubs[best.club].nm}.`, best.id === S.rivalId ? "rival" : "");
  }
  for (const p of W.players) if (p) p.m = zst();
}

/* ---------- AI transfers and loans ---------- */
function movePlayer(p, toClub, fee, loan){
  const from = p.club;
  if (fee){ W.clubs[toClub].fin -= fee; W.clubs[from].fin += fee; }
  if (loan) p.loan = from; else p.loan = -1;
  p.club = toClub;
  if (SQ){ const a = SQ[from]; if (a){ const i = a.indexOf(p); if (i >= 0) a.splice(i, 1); } (SQ[toClub] || (SQ[toClub] = [])).push(p); }
}
function aiTransfers(){
  indexSquads();
  const mine = meP().club;
  let moves = 0;
  for (const c of shuffle(W.clubs).slice(0, 70)){
    const sq = squadOf(c.id);
    if (sq.length >= 26){ const worst = sq.filter(p => !p.me && p.id !== S.rivalId).sort((a,b) => a.ovr - b.ovr)[0]; const lower = W.clubs.filter(x => x.cc === c.cc && x.t === Math.min(c.cc === "ROU" ? 4 : 3, c.t+1)); if (worst && lower.length) movePlayer(worst, pick(lower).id, 0); continue; }
    const pos = pick(["ST","LW","RW","CAM","CM","DF","DF","ST"]);
    const cur = sq.filter(p => p.pos === pos).sort((a,b) => b.ovr - a.ovr);
    const need = (cur[1] ? cur[1].ovr : meanOvr(c.rep)) + 2;
    let best = null;
    for (let k = 0; k < 160; k++){
      const p = W.players[ri(0, W.players.length-1)];
      if (!p || p.me || p.club < 0 || p.club === c.id || p.pos !== pos || p.ovr < need || p.age > 31 || p.loan >= 0) continue;
      if (W.clubs[p.club].rep > c.rep*.97) continue;
      if (valueOf(p) > c.fin*.35) continue;
      if (!best || p.ovr > best.ovr) best = p;
    }
    if (best){
      const fee = Math.round(valueOf(best)*rnd(.8, 1.3)/1000)*1000, from = W.clubs[best.club];
      movePlayer(best, c.id, fee); moves++;
      const inMyLeague = [c.lg, from.lg].includes(myLg());
      if (best.id === S.rivalId) addNews("rival", `Your rival ${pname(best)} joins ${c.nm}`, `${from.nm} sell him for ${eur(fee)}.`, "rival");
      else if (inMyLeague || fee > 25e6 || c.id === mine || from.id === mine) addNews("transfer", `${pname(best)} moves to ${c.nm}`, `${from.nm} → ${c.nm} for ${eur(fee)}.`);
    }
    // big clubs loan out young players who aren't playing
    if (c.rep > 3000 && Math.random() < .25){
      const kid = sq.filter(p => !p.me && p.age <= 21 && p.loan < 0 && p.ovr < need - 8)[0];
      const lower = W.clubs.filter(x => x.cc === c.cc && x.t === c.t + 1);
      if (kid && lower.length){ const to = pick(lower); movePlayer(kid, to.id, 0, true); if (to.lg === myLg()) addNews("transfer", `${pname(kid)} arrives on loan at ${to.nm}`, `On loan from ${c.nm} until the end of the season.`); }
    }
  }
  return moves;
}

/* ---------- end of season ---------- */
function seasonEndWorld(){
  const report = [];
  indexSquads();
  // champions
  for (const lg of Object.values(W.leagues)){
    const order = sortTab(lg.tab);
    order.forEach((cid, i) => W.clubs[cid].lastPos = i+1);
    if (lg.t === 1 || lg.clubs.includes(meP().club)){
      const ch = W.clubs[order[0]];
      if (lg.t === 1){ for (const p of squadOf(ch.id)) p.tro++; ch.rep = Math.min(9800, ch.rep + 120); W.champs.push({season:W.season, lg:lg.nm, club:ch.nm}); if (W.champs.length > 220) W.champs.splice(0, W.champs.length - 220); }
      report.push(`${ch.nm} win ${lg.nm}`);
      if (lg.t === 1 && squadOf(ch.id).some(p => p.me)) myTrophy(lg.nm);
    }
  }
  // season awards: every league's honours, then the ones that span the world
  for (const lg of awardLeagues()) leagueAwards(lg, report);
  const bd = W.players.filter(p => p && p.st.ap >= 10)
    .map(p => ({p, s:p.st.g*3 + p.st.a*2 + p.tro*8 + p.wrep*.01 + (p.st.rs/Math.max(1, p.st.ap) - 6.5)*12}))
    .sort((a, b) => b.s - a.s).slice(0, 10);
  W.awards.ballon = bd.map(x => x.p.id);
  if (bd[0]){ bd[0].p.wrep += 800; bd[0].p.rep += 300;
    addNews("award", `${pname(bd[0].p)} is World Player of the Year`, `${W.clubs[bd[0].p.club].nm} star tops the vote.`);
    if (bd[0].p.me){ myAward("World Player of the Year", 1500, 3000);
      HONOUR_QUEUE.push(["🌟", "The world vote", "World Player of the Year", "The best footballer on the planet this season.", ""]); } }
  worldAwards(report);
  if (typeof goalOfSeason === "function") goalOfSeason();
  // promotion and relegation
  for (const [cc, C] of Object.entries(COUNTRIES)) for (const L of C.leagues){
    const k = MOVES[cc] && MOVES[cc][L.t]; if (!k) continue;
    const upper = Object.values(W.leagues).filter(l => l.cc === cc && l.t === L.t), lower = Object.values(W.leagues).filter(l => l.cc === cc && l.t === L.t+1);
    if (!lower.length) continue;
    const down = upper.flatMap(l => { const o = sortTab(l.tab); return o.slice(o.length - Math.round(k/upper.length)); });
    let up = lower.length > 1 ? lower.map(l => sortTab(l.tab)[0]) : sortTab(lower[0].tab).slice(0, k);
    up = up.slice(0, down.length);
    down.forEach(cid => { W.clubs[cid].t++; W.clubs[cid].rep = Math.round(W.clubs[cid].rep*.9); });
    up.forEach(cid => { W.clubs[cid].t--; W.clubs[cid].rep = Math.round(W.clubs[cid].rep*1.12); });
    const mc = meP().club;
    if (up.includes(mc)) report.push(`Promoted! ${W.clubs[mc].nm} go up.`);
    if (down.includes(mc)) report.push(`Relegated. ${W.clubs[mc].nm} go down.`);
  }
  // players age, develop, retire; loans return
  for (let i = 0; i < W.players.length; i++){
    const p = W.players[i]; if (!p) continue;
    if (p.loan >= 0 && !p.me){ p.club = p.loan; p.loan = -1; }
    if (p.me) continue;
    p.age++;
    const grow = p.age <= 21 ? ri(1, 5) : p.age <= 24 ? ri(0, 3) : p.age <= 29 ? ri(-1, 1) : p.age <= 32 ? ri(-3, 0) : ri(-5, -1);
    p.ovr = Math.round(clamp(Math.min(p.pot, p.ovr + grow), 15, 95));
    if (p.age >= 36 || (p.age >= 33 && Math.random() < .2)){
      if (p.id === S.rivalId){ if (p.age < 38) continue; }
      const c = W.clubs[p.club], nat = Math.random() < .8 ? COUNTRIES[c.cc].nat : pick(FOREIGN_NATS), N = NAMES[nat];
      Object.assign(p, {fn:ri(0, N.f.length-1), ln:ri(0, N.l.length-1), nat, age:ri(17,19), ovr:Math.round(meanOvr(c.rep) - 6 + gauss()*3), st:zst(), m:zst(), ct:zst(), el:zst(), cu:zst(), nt:{caps:0, g:0}, cr:{ap:0,g:0,a:0,mo:0}, tro:0, inj:0, fol:ri(10,200)});
      p.pot = Math.round(clamp(p.ovr + ri(5, 22), 15, 95));
    }
  }
  indexSquads();
  for (const p of W.players) if (p && !p.me){ p.rep = Math.round((calcRep(p) + p.rep)/2); p.wrep = calcWrep(p); p.fol = Math.round(Math.pow(p.rep, 1.35)*2 + p.fol*.3); }
  for (const c of W.clubs) c.fin = Math.round(c.fin*.4 + 20*Math.pow(c.rep, 1.75)*.6);
  // new season
  W.season++;
  for (const p of W.players) if (p){ p.ls = {g:p.st.g, a:p.st.a, ap:p.st.ap}; p.st = zst(); p.ct = zst(); p.el = zst(); p.cu = zst(); p.m = zst(); }
  W.nat = {};
  buildSeason();
  return report;
}
