"use strict";
/* ============ CAREER ============ */
const KEY = "freyaFootball.v2";                       // the original single save — migrated into slot 1
const SLOTS = 1;                                      // one career per account
const OLD_SLOTS = 3;                                  // how many there used to be, for the tidy-up below
let SLOT = 1;
function slotKey(n){ return `${KEY}.slot${n}`; }
function metaKey(n){ return `${KEY}.meta${n}`; }
function slotMeta(n){
  try{ const r = localStorage.getItem(metaKey(n)); if (r) return JSON.parse(r); }catch(e){}
  const m = metaFromSave(n);                       // a career saved before slot cards existed: build its card now
  if (m){ try{ localStorage.setItem(metaKey(n), JSON.stringify(m)); }catch(e){} }
  return m;
}
// read a slot's save well enough to fill in its card, without disturbing the game in progress
function metaFromSave(n){
  try{
    const raw = localStorage.getItem(slotKey(n)); if (!raw) return null;
    const d = deserial(raw); if (!d || !d.player) return null;
    const me = d.W.players[d.meId], c = me && me.club >= 0 ? d.W.clubs[me.club] : null;
    const sk = d.skills || {}, ovr = Math.round(SKILLS.reduce((a, [k]) => a + (sk[k] || 0), 0)/SKILLS.length);
    const cm = d.careerMy || {apps:0, goals:0, assists:0};
    return {name:d.player.name, club:c ? c.nm : "Free agent", lg:c ? (d.W.leagues[c.lg] || {}).nm || "" : "",
      season:d.W.season, seasons:(d.W.season - (d.startSeason || d.W.season)) + 1, week:d.week,
      apps:cm.apps || 0, goals:cm.goals || 0, assists:cm.assists || 0,
      ovr, age:me ? me.age : 0, ms:d.playMs || 0, owner:d.owner || "", cid:d.cid || "", at:Date.now()};
  }catch(e){ return null; }
}
function writeMeta(n){
  if (!S) return;
  const me = meP(), c = myClub();
  try{ localStorage.setItem(metaKey(n), JSON.stringify({name:S.player.name, club:c ? c.nm : "", lg:c ? (W.leagues[c.lg] || {}).nm : "",
    season:W.season, seasons:(W.season - (S.startSeason || W.season)) + 1, week:S.week, apps:S.careerMy.apps, goals:S.careerMy.goals, assists:S.careerMy.assists,
    ovr:overall(), age:me ? me.age : 0, ms:S.playMs || 0, owner:S.owner || "", cid:S.cid || "", at:Date.now()})); }catch(e){}
}
function useSlot(n){ SLOT = clamp(n, 1, SLOTS); }
function migrateOldSave(){                                       // a career made before slots existed
  try{
    const old = localStorage.getItem(KEY);
    if (old && !localStorage.getItem(slotKey(1))){ localStorage.setItem(slotKey(1), old); localStorage.removeItem(KEY); }
  }catch(e){}
}
function deleteSlot(n){ try{ localStorage.removeItem(slotKey(n)); localStorage.removeItem(metaKey(n)); }catch(e){} }
/* The game used to hold three careers. Now it holds one, so the furthest-along career is
   brought to the front. Nothing is thrown away: whatever was in slot 1 is put where the kept
   career came from, so it is still in storage if it is ever wanted back. */
function collapseToOneSlot(){
  try{
    if (localStorage.getItem(KEY + ".one")) return;
    let best = 1, bs = -1;
    for (let n = 1; n <= OLD_SLOTS; n++){
      if (!localStorage.getItem(slotKey(n))) continue;
      const m = slotMeta(n); if (!m) continue;
      const s = (m.goals || 0)*6 + (m.assists || 0)*4 + (m.apps || 0)*1.2 + (m.ovr || 0)*6 + (m.seasons || 0)*20;
      if (s > bs){ bs = s; best = n; }
    }
    if (bs >= 0 && best !== 1){
      const keep = localStorage.getItem(slotKey(best)), keepM = localStorage.getItem(metaKey(best));
      const had = localStorage.getItem(slotKey(1)), hadM = localStorage.getItem(metaKey(1));
      localStorage.setItem(slotKey(1), keep);
      keepM ? localStorage.setItem(metaKey(1), keepM) : localStorage.removeItem(metaKey(1));
      if (had){ localStorage.setItem(slotKey(best), had); hadM ? localStorage.setItem(metaKey(best), hadM) : localStorage.removeItem(metaKey(best)); }
      else deleteSlot(best);
    }
    localStorage.setItem(KEY + ".one", "1");
  }catch(e){}
}
// time played ticks while a career is open
let PLAY_T = null;
function startPlayClock(){
  if (PLAY_T) return;
  let last = Date.now();
  PLAY_T = setInterval(() => { const now = Date.now(); if (S && !document.hidden) S.playMs = (S.playMs || 0) + (now - last); last = now; }, 5000);
}
let S = null;
// players are packed into flat arrays so a whole football world fits comfortably in browser storage
const NATS = Object.keys(NAMES), PPOS = ["GK","DF","CM","CAM","LW","RW","ST"];
const st5 = s => [s.ap, s.g, s.a, s.mo, Math.round(s.rs*10)], un5 = a => ({ap:a[0], g:a[1], a:a[2], mo:a[3], rs:a[4]/10});
function packP(p){ if (!p) return 0; return [p.fn, p.ln, NATS.indexOf(p.nat), PPOS.indexOf(p.pos), p.age, p.ovr, p.pot, Math.round(p.rep), Math.round(p.wrep), p.club, p.loan, p.inj,
  ...st5(p.st), ...st5(p.m), ...st5(p.ct), p.nt.caps, p.nt.g, p.cr.ap, p.cr.g, p.cr.a, p.cr.mo, p.tro, p.fol, p.per, p.me ? 1 : 0, p.ls ? p.ls.g : 0, p.ls ? p.ls.a : 0, p.ls ? p.ls.ap : 0, ...st5(p.el || {ap:0,g:0,a:0,mo:0,rs:0}), p.nt.a || 0, ...st5(p.cu || {ap:0,g:0,a:0,mo:0,rs:0})]; }
function unpackP(a, id){ if (!a) return null; const p = {id, fn:a[0], ln:a[1], nat:NATS[a[2]], pos:PPOS[a[3]], age:a[4], ovr:a[5], pot:a[6], rep:a[7], wrep:a[8], club:a[9], loan:a[10], inj:a[11],
  st:un5(a.slice(12,17)), m:un5(a.slice(17,22)), ct:un5(a.slice(22,27)), nt:{caps:a[27], g:a[28], a:a[45] || 0}, cr:{ap:a[29], g:a[30], a:a[31], mo:a[32]}, tro:a[33], fol:a[34], per:a[35], ls:{g:a[37], a:a[38], ap:a[39]}, el:a.length > 40 ? un5(a.slice(40,45)) : {ap:0,g:0,a:0,mo:0,rs:0}, cu:a.length > 46 ? un5(a.slice(46,51)) : {ap:0,g:0,a:0,mo:0,rs:0}};
  if (a[36]) p.me = true; return p; }
/* The packed squad is three quarters zeros — every player carries season, month, cup and career
   columns he has not filled in yet. Writing those as one run instead of "0,0,0,0,…" is lossless and
   takes the save from 2.3 MB to well under half that, which matters because a browser only gives the
   whole game about 5 MB and three careers have to fit in it. */
function packRows(rows){
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    if (!r){ out[i] = ""; continue; }
    let s = "", z = 0;
    for (let k = 0; k < r.length; k++){
      const v = r[k];
      if (v === 0){ z++; continue; }
      if (z){ s += (z > 1 ? "z" + z : "0") + ","; z = 0; }
      s += v + ",";
    }
    if (z) s += (z > 1 ? "z" + z : "0") + ",";
    out[i] = s.slice(0, -1);
  }
  return out.join(";");
}
function unpackRows(str){
  const rows = str.split(";"), out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++){
    const row = rows[i];
    if (!row){ out[i] = 0; continue; }
    const f = row.split(","), a = [];
    for (let k = 0; k < f.length; k++){
      const t = f[k];
      if (t.charCodeAt(0) === 122){ let n = +t.slice(1); while (n-- > 0) a.push(0); }   // "z14" = fourteen zeros
      else a.push(+t);
    }
    out[i] = a;
  }
  return out;
}
function serial(){ const pl = S.W.players; S.W.players = null; const out = JSON.stringify({S, P2:packRows(pl.map(packP))}); S.W.players = pl; return out; }
function deserial(txt){
  const d = JSON.parse(txt);
  if (d.P2){ d.S.W.players = unpackRows(d.P2).map(unpackP); return d.S; }
  if (d.P){ d.S.W.players = d.P.map(unpackP); return d.S; }        // a save from before the squad was packed down
  return d;
}
// saving the whole world is ~1 MB, so clicks only schedule a save; it's written once things go quiet
let SAVE_T = null;
function save(){ clearTimeout(SAVE_T); SAVE_T = setTimeout(() => { if (window.requestIdleCallback) requestIdleCallback(saveNow, {timeout:2000}); else saveNow(); }, 800); return true; }
addEventListener("pagehide", () => { if (SAVE_T) saveNow(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && SAVE_T) saveNow(); });
function saveNow(){ clearTimeout(SAVE_T); SAVE_T = null; if (!S) return false; try{ localStorage.setItem(slotKey(SLOT), serial()); writeMeta(SLOT); return true; }catch(e){ console.warn("save failed", e); if (e && e.name === "QuotaExceededError") toast("Browser storage is full. Delete a career you are not using, or sync this one to the leaderboard first.", "bad"); return false; } }
function load(n){ try{ const r = localStorage.getItem(slotKey(n || SLOT)); return r ? deserial(r) : null; }catch(e){ console.warn(e); return null; } }
// Clubs and leagues are built in a fixed order, so a career started before a renaming
// can be brought up to date by index without disturbing anything else.
function refreshWorldNames(){
  if (!W || !W.clubs) return;
  for (const id in (W.comps || {})) if (CONT[id]) W.comps[id].nm = CONT[id];   // careers started before the cups were renamed
  // a career started before the domestic cups and the World Championship existed. They can only join
  // in if their first round is still ahead; otherwise this season runs without them and the new
  // season builds them properly.
  if (W.clubs && !W.cups){ if (S.week <= CAL.CUP[0]) buildCups(); else W.cups = {}; }
  if (W.clubs && !W.wc && S.week <= CAL.WC.grp[0]) buildWC();
  const names = [];
  for (const C of Object.values(COUNTRIES)) for (const L of C.leagues) for (const nm of L.clubs) names.push(nm);
  if (names.length === W.clubs.length){
    for (let i = 0; i < W.clubs.length; i++) W.clubs[i].nm = names[i];
  }
  for (const lg of Object.values(W.leagues || {})){
    const C = COUNTRIES[lg.cc]; if (!C) continue;
    const L = C.leagues.find(x => x.t === lg.t); if (!L) continue;
    const letter = /[A-Z]$/.test(lg.id) ? lg.id.slice(-1) : "";
    lg.nm = L.nm + (letter ? " · Series " + letter : "");
  }
}
function resume(data){
  S = data; W = S.W; SQ = null;
  if (!S.skillXp) S.skillXp = {};
  if (!S.wardrobe) S.wardrobe = [];
  if (S.playMs == null) S.playMs = 0;
  if (!S.job) S.job = {j:0, r:0, xp:0, shifts:0};
  if (!S.cid) S.cid = "c" + (S.startSeason || 0) + "-" + String(S.player.name).replace(/\W/g, "").slice(0, 10).toLowerCase();
  jobState();                       // resolves the job id, migrating saves from the five-job ladder
  refreshWorldNames();
  if (!S.startSeason) S.startSeason = W.season;
  // older saves: new fields
  if (S.skillsBase){ S.skills = S.skillsBase; delete S.skillsBase; }
  if (S.skills.composure == null) S.skills.composure = 28;
  if (S.skills.tackling == null) S.skills.tackling = 24;      // careers made before defending existed
  if (S.ban == null) S.ban = 0;
  if (!S.cards) S.cards = {y:0, r:0, run:0};
  // a milestone for nought of something was never earned — clear any that were handed out
  if (S.miles){ for (const k of Object.keys(S.miles)) if (/:0$/.test(k)) delete S.miles[k]; }
  if (S.awards) S.awards = S.awards.filter(a => !/^0 /.test(a.name || ""));
  if (!S.workrate) S.workrate = 2;
  if (S.tutDone == null) S.tutDone = true;
  indexSquads();
}
/* ---------- match-day skills: crowd nerves (composure) and the dream ---------- */
// big crowds only: under ~8,000 there's no pressure; it grows up to full pressure around 68,000
function crowdPressure(crowd){ return clamp((crowd - 8000)/60000, 0, 1); }
function nervesFor(crowd){ return +(crowdPressure(crowd)*(1 - S.skills.composure/100)*.35).toFixed(3); }
function matchSkillsOn(nerves, dream){
  if (S.skillsBase) return;
  S.skillsBase = Object.assign({}, S.skills);
  for (const [k] of SKILLS){ if (dream) S.skills[k] = 99; else if (k !== "composure") S.skills[k] = Math.max(5, Math.round(S.skills[k]*(1 - nerves))); }
}
function matchSkillsOff(){ if (S.skillsBase){ S.skills = S.skillsBase; delete S.skillsBase; } }
const blankMy = () => ({apps:0, goals:0, assists:0, longGoals:0, fkGoals:0, curlGoals:0, penGoals:0, dribbles:0, spass:0, lpass:0, passAtt:0, shots:0, onTarget:0, lost:0, motm:0, ratingSum:0, wins:0});
function overall(){ return Math.round(SKILLS.reduce((a,[k]) => a + S.skills[k], 0)/SKILLS.length); }
function xpNeed(){ return 90 + S.level*35; }

/* ---------- moving a career between devices ----------
   The whole football world is in there, so the code is compressed before it goes on the clipboard. */
const CODE_TAG = "LR1:";
async function makeCode(rawIn){
  const raw = rawIn || serial();
  try{
    if (typeof CompressionStream === "function"){
      const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      let bin = ""; const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      return CODE_TAG + btoa(bin);
    }
  }catch(e){ console.warn(e); }
  return btoa(unescape(encodeURIComponent(raw)));                 // older browsers: the long format
}
async function readCode(text){
  const t = (text || "").trim().replace(/\s+/g, "");
  if (!t) throw new Error("empty");
  if (t.startsWith(CODE_TAG)){
    const bin = atob(t.slice(CODE_TAG.length));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }
  return decodeURIComponent(escape(atob(t)));                     // a code from an older version
}
// put the code on the clipboard, falling back to the old copy command where that isn't allowed
async function copyText(t){
  try{ if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(t); return true; } }catch(e){}
  try{
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.setAttribute("readonly", "");
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }catch(e){ return false; }
}
// bring a career in from a code and put it in a slot
async function applyCode(text, slot){
  const json = await readCode(text);
  const d = deserial(json);
  if (!d || !d.player || !d.W || !d.W.players) throw new Error("not a save");
  const n = slot || SLOT;
  useSlot(n);
  localStorage.setItem(slotKey(n), json);
  localStorage.removeItem(metaKey(n));                            // rebuilt from the save on next read
  return {slot:n, name:d.player.name};
}
/* ---------- the day job: five ladders, three positions each ---------- */
function jobState(){
  const s = S.job || (S.job = {j:0, r:0, xp:0, shifts:0});
  // the id is what the save really means; the index is looked up from it, so a job inserted into the
  // middle of the ladder moves nobody. Saves from the five-job ladder carry no id — read those by the old order.
  if (!s.id) s.id = JOB_LEGACY[s.j] || JOBS[0].id;
  const i = JOBS.findIndex(j => j.id === s.id);
  s.j = i < 0 ? 0 : i;
  s.r = clamp(s.r | 0, 0, 2);
  return s;
}
function jobSync(s){ s.id = JOBS[clamp(s.j, 0, JOBS.length - 1)].id; return s; }
function myJob(){ const s = jobState(); return jobAt(s.j, s.r); }
function jobLabel(){ const {job, rank} = myJob(); return `${job.name} · ${rank.name}`; }
function jobPay(){ const {rank} = myJob(); return ri(rank.pay[0], rank.pay[1]); }
function jobNeed(){ return myJob().rank.need; }
function jobStage(){ const s = jobState(); return s.j*3 + s.r; }          // 0…14, one number for the whole ladder
function jobIsTop(){ const s = jobState(); return s.j >= JOBS.length - 1 && s.r >= 2; }
// moves you one position up the ladder (rolling over into the next job), or down. Returns the pay before and after.
function jobMove(dir){
  const s = jobState();
  const before = myJob().rank;
  let stage = clamp(jobStage() + dir, 0, JOBS.length*3 - 1);
  s.j = Math.floor(stage/3); s.r = stage%3; s.xp = 0; jobSync(s);
  const now = myJob();
  return {from:before, to:now.rank, job:now.job, newJob:Math.floor(stage/3) !== Math.floor((stage - dir)/3)};
}
function jobJumpToNextJob(){                                              // skips whatever is left of this ladder
  const s = jobState(), before = myJob().rank;
  s.j = clamp(s.j + 1, 0, JOBS.length - 1); s.r = 0; s.xp = 0; jobSync(s);
  const now = myJob();
  return {from:before, to:now.rank, job:now.job, newJob:true};
}
function payRange(r){ return `${eur(r.pay[0])}–${eur(r.pay[1])}`; }
/* ---------- wardrobe: clothes lift your reputation and your following ---------- */
function ownsCloth(id){ return (S.wardrobe || []).includes(id); }
function styleBonus(){                                   // e.g. 0.07 = +7% reputation and followers
  let b = 0;
  for (const sh of SHOPS){ const per = CLOTHES_TIER[sh.tier].per; for (const it of sh.items) if (ownsCloth(it.id)) b += per; }
  return b;
}
function styleMul(){ return 1 + styleBonus(); }
function shopRep(){ const me = meP(); return me ? me.rep + me.wrep : 0; }
function shopOpen(sh){ return shopRep() >= sh.rep; }
function clothesOwned(){ return (S.wardrobe || []).length; }
/* ----------each skill earns its own experience from what you actually do ---------- */
function skillNeed(k){ return Math.round(45 + S.skills[k]*13); }   // higher skills take longer to grow
function skillXP(k, x){
  if (!S.skillXp) S.skillXp = {};
  if (S.skills[k] >= 99){ S.skillXp[k] = 0; return; }
  S.skillXp[k] = (S.skillXp[k] || 0) + x;
  while (S.skills[k] < 99 && S.skillXp[k] >= skillNeed(k)){
    S.skillXp[k] -= skillNeed(k); S.skills[k]++;
    const nm = (SKILLS.find(s => s[0] === k) || [0, k])[1];
    toast(`${nm} up! Now ${S.skills[k]} — from playing.`, "good");
  }
}
function addXP(x){ S.xp += Math.round(x); while (S.xp >= xpNeed()){ S.xp -= xpNeed(); S.level++; S.sp += 4; toast(`Level ${S.level}! 4 skill points to spend.`, "good"); } }
function skillCost(v){ return v < 50 ? 1 : v < 75 ? 2 : 3; }
// how fast energy burns: stamina 24 -> x1.32, 50 -> x1.03, 75 -> x0.74, 99 -> x0.46 (nutritionist: 20% less)
function staminaF(){ return (1.6 - 1.15*S.skills.stamina/100)*(S.staff.nutri ? .8 : 1); }
function energyFactor(){ return S.energy >= 45 ? 1 : .55 + .45*S.energy/45; }
function avgRating(l){ return l.length ? l.reduce((a,b) => a+b, 0)/l.length : 0; }
function recentAvg(){ return avgRating(S.ratings.slice(-6)) || 6.3; }
function currentRole(){ return S.trust >= 40 ? "starter" : S.trust >= 12 ? "rotation" : "sub"; }
function trustFor(role){ return role === "starter" ? 45 : role === "rotation" ? 22 : 5; }
function homeTier(){ return S.items.villa ? 3 : S.items.house ? 2 : S.items.flat ? 1 : 0; }
function carTier(){ return S.items.sports ? 3 : S.items.suv ? 2 : S.items.car ? 1 : 0; }
function energyMult(){ return [1, 1.15, 1.3, 1.5][homeTier()]; }
function weeklyRecovery(){ return 22 + [0,5,10,15][homeTier()] + (S.items.physio ? 10 : 0); }
function weeklyActions(){ return 3 + (carTier() ? 1 : 0); }
function staffCost(){ let c = 0; for (const s of STAFF) if (S.staff[s.id]) c += s.pct ? S.contract.wage*s.pct : s.weekly; return Math.round(c); }
function hotness(){ return clamp((recentAvg() - 6.2)*.6 + S.seasonMy.goals*.03 + S.seasonMy.assists*.02, 0, 1.5); }

/* ---------- news ---------- */
function addNews(cat, title, body, tag){ if (!S) return; S.news.unshift({gw:gw(), wk:S.week, season:W.season, cat, title, body:body || "", tag:tag || ""}); if (S.news.length > 90) S.news.length = 90; }
function myAward(name, rep, wrep){
  const me = meP(); me.rep += Math.round(rep*styleMul()); me.wrep += Math.round((wrep || Math.round(rep*.3))*styleMul());
  S.awards.unshift({name, season:W.season, year:S.year});
  addNews("you", `${S.player.name}: ${name}`, "Another one for the cabinet.", "me");
  toast(`🏆 ${name}`, "gold"); socialEvent("award", name);
}
function myTrophy(name){ const c = myClub(); S.trophies.unshift({name, season:W.season, year:S.year});
  addNews("you", `Champions! ${name}`, `${S.player.name} lifts the trophy${c ? ` with ${c.nm}` : ""}.`, "me"); socialEvent("trophy", name); }
function newsFromMatch(res){
  const f = res.f, mineLg = S && W.players[S.meId] ? myLg() : null;
  const relevant = (f.kind === "L" && f.lg === mineLg) || f.kind === "E" || f.kind === "N";
  if (!relevant) return;
  const hn = sideName(f, "h"), an = sideName(f, "a"), score = `${res.hg}–${res.ag}`;
  const counts = {}; for (const e of [...res.hG, ...res.aG]) counts[e.s] = (counts[e.s] || 0) + 1;
  for (const [pid, n] of Object.entries(counts)){
    const p = W.players[pid]; if (p.me) continue;
    if (n >= 3) addNews("league", `Hat-trick for ${pname(p)}!`, `${n} goals as ${hn} ${score} ${an}.`, +pid === S.rivalId ? "rival" : "");
    else if (n === 2 && (+pid === S.rivalId || f.kind !== "L")) addNews(+pid === S.rivalId ? "rival" : "league", `${pname(p)} scores twice`, `${hn} ${score} ${an}.`, +pid === S.rivalId ? "rival" : "");
  }
  const m = W.players[res.motm];
  if (f.kind === "L" && !m.me && Math.random() < .35 && !(f.h === meP().club || f.a === meP().club)) addNews("league", `${hn} ${score} ${an}`, `Man of the match: ${pname(m)} (${res.rt[m.id]}).`, m.id === S.rivalId ? "rival" : "");
  if (f.kind === "L" && Math.abs(res.hg - res.ag) >= 4) addNews("league", `Thrashing: ${hn} ${score} ${an}`, "A result nobody saw coming.");
  const rv = W.players[S.rivalId];
  if (rv && (rv.club === f.h || rv.club === f.a) && res.rt[rv.id] != null && !counts[rv.id] && res.rt[rv.id] < 5.8) addNews("rival", `Tough day for ${pname(rv)}`, `Rated ${res.rt[rv.id]} in ${hn} ${score} ${an}.`, "rival");
}

/* ---------- new career ---------- */
function newCareer(cr){
  const skills = {}; SKILLS.forEach(([k]) => skills[k] = 24 + (POS[cr.pos].bonus[k] || 0) + cr.alloc[k]);
  S = {v:2, cid:"c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), player:{name:cr.name, number:cr.number, pos:cr.pos, foot:cr.foot, nat:cr.nat, age:17}, skills, sp:0, xp:0, level:1,
    energy:100, money:100, workrate:2, tutDone:false, skillXp:{}, wardrobe:[], playMs:0, startSeason:0, job:{id:"cafe", j:0, r:0, xp:0, shifts:0}, inv:{drink:2, max:0}, items:{}, staff:{}, phone:"keypad", apps:[], year:2026, week:0,
    contract:null, trust:0, raise:null, ban:0, cards:{y:0, r:0, run:0}, seasonMy:blankMy(), careerMy:blankMy(), ratings:[], awards:[], trophies:[], news:[], msgs:[], requests:[],
    locks:{}, pendingMove:null, actions:3, weekDone:{}, history:[], meId:-1, rivalId:-1, offerSet:null, social:null, purchases:[], speed:2, lastMatch:null, promiseLog:[]};
  genWorld();
  // you join the world as a player with no club yet
  const me = newPlayer(cr.nat, MY_POS[cr.pos], 17, overall(), -1);
  me.me = true; me.rep = 4; me.wrep = 0; me.fol = 0; S.meId = me.id;
  const starts = shuffle(W.clubs.filter(c => c.cc === "ROU" && c.t === 4)).slice(0, 3);
  S.offerSet = {ctx:"start", list:starts.map(c => baseOffer(c, true))};
  S.startSeason = W.season; startPlayClock();
}
function pickRival(){
  const me = meP(), lg = W.leagues[myLg()];
  if (!lg) return;
  const cands = lg.clubs.filter(c => c !== me.club).flatMap(cid => squadOf(cid)).filter(p => ["ST","LW","RW","CAM"].includes(p.pos) && p.age <= 20);
  const r = cands.sort((a,b) => Math.abs(a.ovr - me.ovr - 4) - Math.abs(b.ovr - me.ovr - 4))[0] || pick(lg.clubs.filter(c => c !== me.club).flatMap(cid => squadOf(cid)));
  S.rivalId = r.id; r.per = 3; r.ovr = Math.max(r.ovr, me.ovr + 3); r.pot = Math.max(r.pot, 80);
  addNews("rival", `Meet your rival: ${pname(r)}`, `${r.age}-year-old ${r.pos} at ${W.clubs[r.club].nm}. Everyone is already comparing you two.`, "rival");
}

/* ---------- contracts ---------- */
// what a club would offer you right now (baseline, no negotiation)
function clubInterest(c){
  const me = meP(), xi = lineup(c.id), avg = strength(xi);
  const repFit = Math.log((me.rep + 20)/(c.rep*.2 + 20));
  const ovrGap = (me.ovr - avg)/8, form = (recentAvg() - 6.5)*.8, youth = me.age <= 20 && me.ovr > avg - 12 ? .6 : 0;
  const awards = Math.min(.6, S.awards.length*.1);
  return 1/(1 + Math.exp(-(ovrGap + repFit + form + youth + awards + (S.staff.agent ? .35 : 0))));
}
function baseOffer(c, start){
  const me = meP(), lvl = wageLevel(c.rep), rel = clamp((me.ovr - meanOvr(c.rep))/25 + .6, .25, 1.6);
  const wage = Math.max(start ? ri(3, 8)*5 : 15, Math.round(lvl*rel*(start ? rnd(.6, 1) : rnd(.9, 1.15))*(S.staff.agent ? 1.15 : 1)/5)*5);
  const roll = Math.random() + (me.ovr - meanOvr(c.rep))/20;
  const role = start ? pick(["starter","rotation","sub"]) : roll > .8 ? "starter" : roll > .2 ? "rotation" : "sub";
  return {club:c.id, wage, years:start ? ri(1,2) : ri(1,3), role, sign:Math.round(wage*rnd(0, 3)/5)*5, raise:0, bG:0, bA:0, bApp:0, bW:0, loan:false, reqs:null, promised:false};
}
function contractText(o){
  const b = [];
  if (o.bG) b.push(`${eur(o.bG)}/goal`); if (o.bA) b.push(`${eur(o.bA)}/assist`); if (o.bApp) b.push(`${eur(o.bApp)}/app`); if (o.bW) b.push(`${eur(o.bW)}/win`);
  return `${eur(o.wage)}/wk · ${o.years}y · ${ROLE[o.role]}${o.raise ? ` · +${o.raise}%/yr` : ""}${o.sign ? ` · ${eur(o.sign)} to sign` : ""}${b.length ? " · " + b.join(", ") : ""}${o.loan ? " · LOAN" : ""}`;
}
function joinClub(o){
  const me = meP(), c = W.clubs[o.club], old = me.club;
  me.club = c.id; me.loan = o.loan ? (old >= 0 ? old : -1) : -1;
  S.raise = null;                                   // a new deal wipes any rise agreed with the last manager
  S.contract = Object.assign({}, o, {start:gw(), startSnap:snapMy(), deadline:o.promised ? gw() + Math.round(o.years*CAL.W/2) : gw() + o.years*CAL.W});
  S.trust = trustFor(o.role); S.money += o.sign || 0;
  S.requests = S.requests.filter(r => r.club !== c.id);
  S.msgs.forEach(m => { if (m.offer && m.offer.club === c.id) m.done = true; });
  indexSquads();
  addNews("you", `${S.player.name} signs for ${c.nm}${o.loan ? " on loan" : ""}`, contractText(o), "me");
  if (S.rivalId < 0) pickRival();
  socialEvent("transfer", c.nm);
}
function snapMy(){ const c = S.careerMy; return {goals:c.goals, assists:c.assists, dribbles:c.dribbles, spass:c.spass, lpass:c.lpass, apps:c.apps}; }
function reqProgress(){
  const k = S.contract; if (!k || !k.reqs) return null;
  const out = {}; for (const [key, target] of Object.entries(k.reqs)) out[key] = {have:S.careerMy[key] - (k.startSnap[key] || 0), target};
  return out;
}
const REQ_LABEL = {goals:"Goals", assists:"Assists", dribbles:"Successful dribbles", spass:"Short passes completed", lpass:"Long passes completed", apps:"Appearances"};
// ask a transfer: the player's move happens now if the window is open, otherwise at the next window
function agreeMove(o){
  if (windowAt(S.week).open || o.renewal){ joinClub(o); toast(`Signed for ${W.clubs[o.club].nm}!`, "good"); }
  else { S.pendingMove = o; addNews("you", `Deal agreed with ${W.clubs[o.club].nm}`, `You'll join when the ${windowAt(S.week).next.toLowerCase()} opens.`, "me"); toast("Deal agreed — you move when the window opens.", "good"); }
}

/* ---------- negotiation (smartphone) ---------- */
function negLimits(c, base){
  const cap = Math.max(base.wage*3.2, wageLevel(c.rep)*4);
  return {wage:[Math.round(base.wage*.5), Math.round(Math.min(cap, base.wage*4))], years:[1,5], raise:[0,15], sign:[0, Math.round(base.wage*20)],
    bG:[0, Math.round(base.wage*.8)], bA:[0, Math.round(base.wage*.6)], bApp:[0, Math.round(base.wage*.3)], bW:[0, Math.round(base.wage*.4)]};
}
function openNegotiation(cid){
  const c = W.clubs[cid], lock = S.locks[cid];
  if (lock && lock > gw()) return {error:`${c.nm} won't talk again until ${lock - gw()} week${lock - gw() > 1 ? "s" : ""} from now.`};
  if (cid === meP().club && !(S.contract && S.contract.years <= 1)) return {error:"You're already here. Renewals open in the last year of your deal."};
  const base = baseOffer(c), interest = clubInterest(c);
  return {club:cid, base, ask:Object.assign({}, base), interest, patience:100, lim:negLimits(c, base), reply:null, rounds:0, renewal:cid === meP().club};
}
function askCost(n){
  const a = n.ask, b = n.base, me = meP();
  const expG = clamp(me.st.ap ? me.st.g/me.st.ap : .2, .05, 1.2), expA = clamp(me.st.ap ? me.st.a/me.st.ap : .15, .05, 1);
  const weekly = a.wage + a.bG*expG + a.bA*expA + a.bApp*.9 + a.bW*.45 + a.sign/(a.years*CAL.W) + a.wage*(a.raise/100)*(a.years-1)/2;
  const baseW = b.wage + b.sign/(b.years*CAL.W);
  const roleF = a.role === "starter" && b.role !== "starter" ? 1.15 : 1;
  return weekly/baseW*roleF*(1 + Math.max(0, a.years - 3)*.05);
}
function evaluateAsk(n){
  const c = W.clubs[n.club], me = meP();
  n.rounds++;
  const ratio = askCost(n), wantF = .75 + n.interest*.9;   // wanted players get more room
  const r = ratio/wantF;
  const awardsF = 1 + Math.min(.4, S.awards.length*.05);
  let msg = "", status = "";
  if (n.interest < .22 && c.rep > 1500 && c.rep > me.rep*8 && me.age <= 21 && me.ovr > meanOvr(c.rep) - 18 && !n.renewal){
    status = "loan"; n.ask = Object.assign({}, n.base, {loan:true, years:1, role:"rotation", wage:Math.round(n.base.wage*.7)});
    msg = `We like your potential, but you're not ready for ${c.nm}. We'll bring you in on a one-year loan with these terms.`;
  } else if (n.interest < .12 && !n.renewal){
    status = "decline"; msg = `${c.nm} aren't interested. Your name doesn't mean enough to them yet.`;
  } else if (r <= 1.05*awardsF){
    status = "ok"; msg = r < .9 ? "That works for us. Here's what we expect." : "We can stretch to that, but we need numbers from you.";
  } else if (r <= 1.8*awardsF){
    status = "ok"; msg = "That's a big ask. If you want it, earn it — these are our conditions.";
    n.patience -= Math.round((r - 1.05)*28);
  } else {
    status = "toomuch"; n.patience -= Math.round(25 + (r - 1.8)*35);
    msg = pick(["Be serious. That's nowhere near what we can do.", "We're wasting each other's time with numbers like that.", "Our board laughed at that request."]);
  }
  if (n.patience <= 0){ status = "decline"; msg = `${c.nm} have walked away. You can try again next month.`; S.locks[n.club] = gw() + 4; }
  if (status === "ok" || status === "loan") n.ask.reqs = buildReqs(n.ask, Math.max(1, ratio/wantF), c);
  n.reply = {status, msg, ratio:r};
  return n.reply;
}
function buildReqs(o, r, c){
  const pos = S.player.pos, lvl = clamp(1 + (meanOvr(c.rep) - meP().ovr)/40, .6, 1.3);
  const per = {ST:{goals:9, assists:3, dribbles:14, spass:18, lpass:3, apps:14},
               W: {goals:5, assists:5, dribbles:28, spass:22, lpass:6, apps:14},
               AM:{goals:4, assists:7, dribbles:16, spass:34, lpass:10, apps:14},
               CM:{goals:2, assists:6, dribbles:12, spass:52, lpass:18, apps:14},
               DF:{goals:1, assists:2, dribbles:6,  spass:64, lpass:26, apps:16}}[pos] || {goals:4, assists:4, dribbles:14, spass:30, lpass:8, apps:14};
  const k = (.55 + (r - 1)*1.2)*lvl*(o.loan ? .6 : 1), years = o.years, out = {};
  const keys = Object.keys(per).sort(() => Math.random() - .5).slice(0, 2 + (r > 1.2 ? 1 : 0) + (r > 1.5 ? 1 : 0));
  for (const key of keys) out[key] = Math.max(1, Math.round(per[key]*k*years*(key === "apps" ? 1 : .9)));
  return out;
}

/* ---------- keypad transfer requests ---------- */
function sendRequest(cid){
  const c = W.clubs[cid];
  if (S.locks[cid] && S.locks[cid] > gw()) return `${c.nm} said no recently. Try again later.`;
  if (S.requests.some(r => r.club === cid)) return "Already waiting on them.";
  if (cid === meP().club) return "That's your club.";
  const wait = clamp(3 - Math.round(hotness()*1.5 + (meP().rep > c.rep*.3 ? 1 : 0)), 1, 3);
  S.requests.push({club:cid, due:gw() + wait});
  return `Request sent to ${c.nm}. Expect a reply in ${wait} week${wait > 1 ? "s" : ""}.`;
}
function processRequests(){
  for (const r of [...S.requests]) if (gw() >= r.due){
    S.requests = S.requests.filter(x => x !== r);
    const c = W.clubs[r.club], i = clubInterest(c) + gauss()*.08;
    if (i > .42) msg(c.nm, `We'd like to sign you. Basic terms attached.`, baseOffer(c));
    else { msg(c.nm, pick([`Thanks, but we're not looking at you right now.`, `No, sorry. Keep working.`, `We'll pass for now.`])); S.locks[r.club] = gw() + 4; }
  }
  // clubs that come to you
  const chance = .04 + hotness()*.12 + (S.staff.agent ? .1 : 0);
  if (Math.random() < chance){
    const me = meP(), cur = myClub();
    const cands = W.clubs.filter(c => c.id !== cur.id && c.rep > cur.rep*.9 && c.rep < Math.max(250, me.rep*5 + cur.rep*1.3) && clubInterest(c) > .45);
    if (cands.length){ const c = pick(cands); msg(c.nm, `${c.nm} want you. ${S.staff.agent ? "Your agent pushed them to this offer." : "Here's what they're offering."}`, baseOffer(c)); }
  }
}
function msg(from, text, offer){ S.msgs.unshift({id:Date.now() + Math.random(), from, text, offer:offer || null, gw:gw(), read:false, done:false}); if (S.msgs.length > 60) S.msgs.length = 60; if (typeof phoneBadge === "function") phoneBadge(); }

/* ---------- weekly flow ---------- */
function myFixtures(){
  const me = meP(), out = [];
  for (const f of fixturesAt(S.week)){
    if (f.kind === "N"){ if ((f.h === me.nat || f.a === me.nat) && natSquad(me.nat).some(p => p.me)) out.push(f); }
    else if (f.h === me.club || f.a === me.club) out.push(f);
  }
  return out.map(f => Object.assign(f, {done:!!W.done[f.key]}));
}
/* A career with no club is a dead end: nothing to play, and every screen asks which club you are at.
   So whenever we find ourselves there, clubs who would take you are put in front of you instead. */
function ensureClub(){
  if (myClub()) return false;
  if (S.offerSet && S.offerSet.list && S.offerSet.list.length) return true;
  const me = meP();
  let pool = shuffle(W.clubs.filter(x => clubInterest(x) > .25)).slice(0, 3);
  if (!pool.length) pool = shuffle(W.clubs.filter(x => x.rep < Math.max(400, me.rep*1.6))).slice(0, 3);
  if (!pool.length) pool = shuffle(W.clubs.slice()).slice(0, 3);
  S.offerSet = {ctx:"contract", list:pool.map(x => baseOffer(x))};
  return true;
}
function endWeek(){
  const report = {};
  // Every part of the week runs on its own. If one of them ever fails — a corrupt fixture, a club
  // that has gone missing, anything — that part is skipped and noted, and the week still turns.
  // A career must never be left on a button that does nothing.
  const me = meP();
  step(report, "fixtures", () => { if (myClub()) for (const f of myFixtures()) if (!f.done) simFixture(f); });
  step(report, "world", advanceWorldWeek);
  step(report, "money", () => {
    const k = S.contract;
    report.income = k ? k.wage : 0;
    if (k) S.money += k.wage;
    const cost = staffCost(); S.money -= cost; report.cost = cost;
    if (S.money < 0){ for (const s of STAFF) if (S.staff[s.id]){ S.staff[s.id] = false; addNews("you", `${s.name} left`, "You couldn't pay their wages.", "me"); } S.money = Math.max(0, S.money); }
  });
  step(report, "body", () => {
    // a suspension is served by the games you sit out, not by the calendar
    if ((S.ban || 0) > 0 && myClub() && myFixtures().some(f => f.done)){
      S.ban--;
      if (!S.ban) addNews("you", "Suspension served", "You are available again.", "me");
    }
    if (me.inj > 0){ me.inj = Math.max(0, me.inj - (S.items.physio ? 2 : 1)); if (!me.inj) addNews("you", "Back in training", "You're fit again.", "me"); }
    S.energy = Math.min(100, S.energy + weeklyRecovery());
    S.actions = weeklyActions();
  });
  step(report, "contract", checkPromise);
  step(report, "social", socialWeek);
  const was = windowAt(S.week).open;
  S.week++;                                        // from here the week has turned, whatever else happened
  step(report, "requests", processRequests);
  if (S.week >= CAL.W) return {seasonOver:true, skipped:report.skipped};
  step(report, "window", () => {
    const now = windowAt(S.week);
    if (!was && now.open){ addNews("world", `The ${now.name.toLowerCase()} transfer window is open`, "Clubs can register new players for the next four weeks."); if (S.pendingMove){ const o = S.pendingMove; S.pendingMove = null; joinClub(o); } }
    if (was && !now.open){ addNews("world", "The transfer window has closed", "Squads are locked until the next window."); S.msgs.forEach(m => { if (m.offer && !m.done && m.gw < gw() - 4) m.done = true; }); }
  });
  step(report, "ovr", () => { me.ovr = overall(); });
  return report;
}
/* one part of the week. It either does its job or it is noted and skipped. */
function step(report, name, fn){
  try{ fn(); }
  catch(e){
    (report.skipped = report.skipped || []).push(name);
    S.faults = (S.faults || []).concat([{gw:gw(), wk:S.week, at:name, m:String(e && e.message || e).slice(0, 120)}]).slice(-20);
    if (typeof console === "object") console.error("week step failed:", name, e);
  }
}
function checkPromise(){
  if (typeof checkRaise === "function") checkRaise();   // the manager's own deal runs on the same clock
  const c = myClub(); if (!c) return;
  const k = S.contract; if (!k || !k.reqs) return;
  const prog = reqProgress(), met = Object.values(prog).every(x => x.have >= x.target);
  if (met && !k.metDone){
    k.metDone = true;
    if (k.promised){ k.wage = Math.round(k.wage*1.2/5)*5; addNews("you", "Promise kept", `${c.nm} reward you with a 20% raise: ${eur(k.wage)}/week.`, "me"); S.trust += 15; msg(c.nm, `You delivered on your promise. New wage: ${eur(k.wage)}/week. Keep going.`); }
    else addNews("you", "Contract targets reached", `You hit every target in your ${c.nm} contract.`, "me");
  }
  if (k.promised && !k.metDone && !k.failed && gw() >= k.deadline){
    k.failed = true; k.wage = Math.round(k.wage*.5); k.bG = k.bA = k.bApp = k.bW = 0; S.trust = Math.min(S.trust, 8) - 10;
    addNews("you", "Promise broken", `You didn't reach the numbers you promised. Wage halved, bonuses gone, and the dressing room has lost respect.`, "me");
    msg(c.nm, "You promised and didn't deliver. Your wage is halved and your bonuses are cancelled.");
  }
}
function seasonEnd(){
  const me = meP(), c = myClub();
  const sm = S.seasonMy;
  // a season spent without a club still goes in the book, it just has no table finish
  const lgBefore = c ? W.leagues[c.lg] : null;
  const order = lgBefore ? sortTab(lgBefore.tab) : [];
  const pos = c && lgBefore ? order.indexOf(c.id) + 1 : 0;
  S.history.push({year:S.year, club:c ? c.nm : "Free agent", lg:lgBefore ? lgBefore.nm : "—", pos, apps:sm.apps, goals:sm.goals, assists:sm.assists, avg:sm.apps ? (sm.ratingSum/sm.apps).toFixed(2) : "–", rep:me.rep});
  const report = seasonEndWorld();
  if (S.cards) S.cards.run = 0;                   // bookings do not carry into a new season
  S.year++; S.player.age++; me.age = S.player.age; S.week = 0; S.seasonMy = blankMy(); S.energy = 100; S.actions = weeklyActions();
  // loan ends
  const k = S.contract;
  if (k && k.loan && me.loan >= 0){ me.club = me.loan; me.loan = -1; S.contract = Object.assign({}, k.prev || baseOffer(W.clubs[me.club]), {start:gw(), startSnap:snapMy(), loan:false}); report.push(`Loan over: back at ${W.clubs[me.club].nm}.`); }
  else if (k){ k.years--; if (k.raise) k.wage = Math.round(k.wage*(1 + k.raise/100)); }
  indexSquads();
  if (S.contract && S.contract.years <= 0 && W.clubs[me.club]){
    const cur = W.clubs[me.club];
    const renew = Object.assign(baseOffer(cur), {renewal:true}); renew.wage = Math.max(renew.wage, Math.round(S.contract.wage*rnd(1.05, 1.25)/5)*5);
    S.offerSet = {ctx:"contract", list:[renew, ...shuffle(W.clubs.filter(x => x.id !== cur.id && Math.abs(x.rep - cur.rep) < cur.rep*.8 + 150 && clubInterest(x) > .4)).slice(0, 2).map(x => baseOffer(x))]};
  }
  addNews("world", `Season ${W.season - 1} is over`, report.join(" · "));
  ensureClub();                                   // start the new season somewhere
  return {pos, lg:lgBefore ? lgBefore.nm : "—", report};
}
