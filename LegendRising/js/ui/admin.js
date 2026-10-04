"use strict";
/* ============ ADMIN PANEL ============
   Five quick taps on the club badge in the top left, then the password. */
const ADMIN_PASS = "197501";
function askPassword(){
  const r = $("#tutRoot"); if (typeof TUT === "object") TUT.tok++;
  r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="closeConfirm()"></div>
    <div class="tut-card confirm in"><h3>Password</h3><p class="muted small">Enter the code to unlock the admin panel.</p>
      <input id="pwIn" class="pw" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="••••••">
      <div id="pwMsg" class="pw-msg"></div>
      <div class="tut-foot"><button class="btn sm ghost" onclick="closeConfirm()">Cancel</button><button class="btn sm" onclick="tryPassword()">Unlock</button></div></div>`;
  const el = $("#pwIn");
  el.focus();
  el.addEventListener("keydown", e => { if (e.key === "Enter") tryPassword(); });
}
function tryPassword(){
  const el = $("#pwIn"); if (!el) return;
  if (el.value.trim() === ADMIN_PASS){ closeConfirm(); openSheet("admin"); }      // opens for this visit only — nothing is remembered
  else { const m = $("#pwMsg"); if (m){ m.textContent = "Wrong code."; } el.value = ""; const c = document.querySelector(".tut-card.confirm"); if (c){ c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); } }
}
/* ---------- every value the game runs on, editable ---------- */
// a labelled control: a number with −/+ steppers, a text box, a dropdown or a row of buttons
function adNum(label, field, val, step, hint){
  const st = step || 1;
  return `<div class="ad-f"><label>${label}${hint ? `<i>${hint}</i>` : ""}</label>
    <div class="ad-in"><button class="ad-step" onclick="adminBump('${field}',${-st})">−</button>
      <input type="number" step="${st}" value="${val}" onchange="adminSet('${field}', this.value)">
      <button class="ad-step" onclick="adminBump('${field}',${st})">+</button></div></div>`;
}
function adTxt(label, field, val){
  return `<div class="ad-f"><label>${label}</label><div class="ad-in"><input type="text" value="${esc(String(val))}" onchange="adminSet('${field}', this.value)"></div></div>`;
}
function adSel(label, field, val, opts){
  return `<div class="ad-f"><label>${label}</label><div class="ad-in"><select onchange="adminSet('${field}', this.value)">${opts.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(String(v))}" ${String(v) === String(val) ? "selected" : ""}>${esc(String(t))}</option>`; }).join("")}</select></div></div>`;
}
function adQuick(label, items){
  // a string argument has to be quoted for the attribute, not JSON-quoted, or the double quotes break it
  const arg = v => typeof v === "string" ? "'" + String(v).replace(/'/g, "\\'") + "'" : String(Number(v));
  return `<div class="ad-f wide"><label>${label}</label><div class="ad-row-btns">${items.map(([t, f, v]) =>
    `<button class="btn sm ghost" onclick="adminSet('${f}', ${arg(v)})">${esc(t)}</button>`).join("")}</div></div>`;
}
function adminHTML(){
  // every section is rendered, always — nothing is hidden behind a control that might not draw
  const parts = [
    ["Player", adSecPlayer], ["Skills", adSecSkills], ["Money", adSecMoney], ["Reputation", adSecRep],
    ["Club", adSecClub], ["Day job", adSecWork], ["Showoff — how people see you", adSecSocial], ["Season", adSecSeason],
    ["Career record", adSecCareer], ["Unlocks", adSecUnlocks]
  ];
  let out = "";
  for (const [title, fn] of parts){
    let inner = "";
    try{ inner = fn(); }
    catch(e){ inner = `<p class="muted small">Couldn't draw this section: ${esc(e.message)}</p>`; }
    out += `<div class="ad-sec"><h4>${title}</h4>${inner}</div>`;
  }
  return `<h2>Admin panel 🔧</h2><p class="muted small">Everything the game runs on. Changes apply straight away. The code is needed every time you open this.</p>
    ${out}<p class="muted small">Build ${esc(window.FF_BUILD || "dev")}</p>`;
}
function adSecPlayer(){
  const me = meP();
  return `<div class="ad-grid">
      ${adTxt("Name", "name", S.player.name)}
      ${adNum("Shirt number", "number", S.player.number)}
      ${adNum("Age", "age", me.age)}
      ${adSel("Position", "pos", me.pos, Object.keys(POS).map(p => [p, POS[p].name]))}
      ${adSel("Strong foot", "foot", S.player.foot, ["Right","Left"])}
      ${adSel("Nationality", "nat", me.nat, NATS)}
      ${adNum("Overall", "ovr", me.ovr, 1, "recalculated when you change a skill")}
      ${adNum("Energy", "energy", Math.round(S.energy), 5)}
      ${adNum("Injury (weeks)", "inj", me.inj)}
      ${adSel("Work rate", "workrate", S.workrate, [[1,"⚡"],[2,"⚡⚡"],[3,"⚡⚡⚡"],[4,"⚡⚡⚡⚡"]])}
      ${adNum("Level", "level", S.level)}
      ${adNum("XP", "xp", S.xp, 50)}
      ${adNum("Skill points", "sp", S.sp)}
    </div>
    ${adQuick("Quick", [["Full energy","energy",100],["Heal injury","inj",0],["+10 skill points","spAdd",10],["Level +1","levelAdd",1]])}`;
}
function adSecSkills(){
  return `<div class="ad-grid">${SKILLS.map(([key, n, d]) => adNum(n, "skill:" + key, S.skills[key], 1, d)).join("")}</div>
    ${adQuick("Set every skill", [["All 99","allSkills",99],["All 75","allSkills",75],["All 50","allSkills",50],["All 25","allSkills",25]])}
    ${adQuick("Nudge every skill", [["+5 all","bumpSkills",5],["−5 all","bumpSkills",-5],["+1 all","bumpSkills",1],["Clear skill XP","clearSkillXp",1]])}`;
}
function adSecMoney(){
  const k = S.contract;
  return `<div class="ad-grid">
      ${adNum("Money (€)", "money", Math.round(S.money), 1000)}
      ${adNum("Wage (€/wk)", "wage", k ? k.wage : 0, 25)}
      ${adNum("Contract years left", "years", k ? k.years : 0)}
      ${adNum("Club trust", "trust", S.trust || 0)}
    </div>
    ${adQuick("Add money", [["+€10k","moneyAdd",10000],["+€100k","moneyAdd",100000],["+€1M","moneyAdd",1000000],["+€10M","moneyAdd",10000000],["Clear","money",0]])}`;
}
function adSecRep(){
  const me = meP();
  return `<div class="ad-grid">
      ${adNum("Club reputation", "rep", me.rep, 100)}
      ${adNum("World reputation", "wrep", me.wrep, 100)}
    </div>
    ${adQuick("Fame", [["Unknown","fame",0],["Local hero","fame",800],["National name","fame",3000],["World star","fame",8000],["Superstar","fame",9900]])}`;
}
function adSecClub(){
  const me = meP(), c = myClub();
  const byLeague = {};
  for (const x of W.clubs){ const lg = (W.leagues[x.lg] || {}).nm || "—"; (byLeague[lg] || (byLeague[lg] = [])).push(x); }
  const groups = Object.entries(byLeague).sort((a, b) => a[0].localeCompare(b[0]));
  return `<div class="ad-now">${c ? crest(c.nm, 34) : ""}<div><b>${c ? esc(c.nm) : "Free agent"}</b>
      <div class="muted small">${c ? `${esc((W.leagues[c.lg] || {}).nm || "")} · reputation ${fmt(c.rep)} · budget ${eur(c.fin)}` : "No club — pick one below"}</div></div></div>
    <div class="ad-f wide"><label>Move me to any club</label><div class="ad-in">
      <select onchange="adminSet('club', this.value)">${groups.map(([lg, list]) =>
        `<optgroup label="${esc(lg)}">${list.slice().sort((a, b) => b.rep - a.rep).map(x =>
          `<option value="${x.id}" ${c && x.id === c.id ? "selected" : ""}>${esc(x.nm)} · ${fmt(x.rep)}</option>`).join("")}</optgroup>`).join("")}</select></div></div>
    ${adQuick("Jump to", [["Best in the world","clubBest",1],["Top of my country","clubTopHome",1],["Bottom club","clubWorst",1]])}
    <div class="ad-row-btns" style="margin-top:10px">
      <button class="btn sm danger" onclick="adminSet('release', 1)">Fire myself (become a free agent)</button>
      <button class="btn sm ghost" onclick="adminSet('offers', 1)">Generate new offers</button></div>`;
}
function adSecSocial(){
  const s = S.social;
  if (!s) return `<p class="muted small">You don't have a Showoff account yet.</p>
    <div class="ad-row-btns"><button class="btn sm" onclick="adminSet('makeSocial', 1)">Create one now</button></div>`;
  return `<div class="ad-grid">
      ${adNum("Followers", "followers", s.followers, 1000)}
      ${adNum("Humility (−100 boastful … 100 humble)", "humility", Math.round(s.humility), 5)}
      ${adNum("Respect (−100 toxic … 100 respected)", "respect", Math.round(s.respect), 5)}
    </div>
    <div class="ad-now"><div><b>They see you as: ${esc(perception().label)}</b>
      <div class="muted small">@${esc(s.handle)} · ${fmt(s.posts.length)} posts · ${fmt(s.friends.length)} friends</div></div></div>
    ${adQuick("How people see you", [["Loved","image","loved"],["Humble pro","image","humble"],["Cocky star","image","cocky"],["Villain","image","villain"],["Reset","image","reset"]])}
    ${adQuick("Following", [["+10k followers","followersAdd",10000],["+100k","followersAdd",100000],["+1M","followersAdd",1000000]])}`;
}
function adSecSeason(){
  return `<div class="ad-grid">
      ${adNum("Week (0–" + (CAL.W - 1) + ")", "week", S.week)}
      ${adNum("Actions left this week", "actions", S.actions)}
      ${adNum("Season number", "season", W.season)}
      ${adNum("Year", "year", S.year)}
      ${adNum("Energy-UP drinks", "drink", S.inv.drink)}
      ${adNum("Energy-UP MAX drinks", "max", S.inv.max)}
    </div>
    ${adQuick("Jump", [["Next week","weekAdd",1],["+4 weeks","weekAdd",4],["Refill actions","actions",3],["Give 10 drinks","drink",10]])}`;
}
function adSecWork(){
  const js = jobState(), {job, rank} = myJob(), top = jobIsTop();
  return `<div class="ad-now"><div><b>${esc(job.name)} · ${esc(rank.name)}</b>
      <div class="muted small">Pays ${payRange(rank)} a shift · ${top ? "top of the ladder" : `${js.xp}/${jobNeed()} shifts to the next promotion`} · ${fmt(js.shifts || 0)} shifts worked</div></div></div>
    <div class="ad-grid">
      ${adSel("Job", "jobIdx", js.j, JOBS.map((j, i) => [i, j.name]))}
      ${adSel("Position", "jobRank", js.r, job.ranks.map((r, i) => [i, r.name]))}
      ${adNum("Experience at this position", "jobXp", js.xp)}
      ${adNum("Shifts worked (all time)", "jobShifts", js.shifts || 0)}
    </div>
    ${adQuick("Test the ladder", [["Promote one position","jobUp",1],["Demote one position","jobUp",-1],["Promote to the next job","jobNext",1],["Fill the bar","jobFill",1],["Back to the first job","jobReset",1]])}
    <div class="muted small">Every position: ${JOBS.map(j => `${esc(j.name)} (${j.ranks.map(r => esc(r.name)).join(", ")})`).join(" → ")}</div>`;
}
function adSecCareer(){
  const cm = S.careerMy, sm = S.seasonMy;
  return `<div class="ad-grid">
      ${adNum("Career appearances", "cAps", cm.apps)}
      ${adNum("Career goals", "cGoals", cm.goals)}
      ${adNum("Career assists", "cAssists", cm.assists)}
      ${adNum("Man of the match", "cMotm", cm.motm)}
      ${adNum("This season: apps", "sAps", sm.apps)}
      ${adNum("This season: goals", "sGoals", sm.goals)}
      ${adNum("This season: assists", "sAssists", sm.assists)}
    </div>
    <div class="muted small">Trophies: ${fmt(S.trophies.length)} · Awards: ${fmt(S.awards.length)}</div>`;
}
function adSecUnlocks(){
  return `<div class="ad-row-btns">
      <button class="btn sm ghost" onclick="adminSet('smartphone', 1)">Give smartphone + all apps</button>
      <button class="btn sm ghost" onclick="adminSet('allItems', 1)">Give all gear &amp; staff</button>
      <button class="btn sm ghost" onclick="adminSet('allClothes', 1)">Unlock every clothing item</button>
      <button class="btn sm ghost" onclick="adminSet('clearClothes', 1)">Empty the wardrobe</button>
      <button class="btn sm ghost" onclick="adminSet('tutorial', 1)">Replay the dream tutorial</button>
    </div>
    <p class="muted small">Clothes give +0.25% / +0.5% / +1% each to reputation and followers — unlocking them all is +70%.</p>`;
}
function adminBump(field, by){
  const cur = adminGet(field);
  if (cur != null) adminSet(field, cur + by);
}
function adminGet(field){
  const me = meP();
  if (field.startsWith("skill:")) return S.skills[field.slice(6)];
  switch (field){
    case "number": return S.player.number; case "age": return me.age; case "ovr": return me.ovr;
    case "energy": return Math.round(S.energy); case "inj": return me.inj; case "level": return S.level;
    case "xp": return S.xp; case "sp": return S.sp; case "money": return Math.round(S.money);
    case "wage": return S.contract ? S.contract.wage : 0; case "years": return S.contract ? S.contract.years : 0;
    case "trust": return S.trust || 0; case "rep": return me.rep; case "wrep": return me.wrep;
    case "followers": return S.social ? S.social.followers : 0;
    case "humility": return S.social ? Math.round(S.social.humility) : 0;
    case "respect": return S.social ? Math.round(S.social.respect) : 0;
    case "week": return S.week; case "actions": return S.actions; case "season": return W.season; case "year": return S.year;
    case "drink": return S.inv.drink; case "max": return S.inv.max;
    case "jobIdx": return jobState().j; case "jobRank": return jobState().r;
    case "jobXp": return jobState().xp; case "jobShifts": return jobState().shifts || 0;
    case "cAps": return S.careerMy.apps; case "cGoals": return S.careerMy.goals; case "cAssists": return S.careerMy.assists; case "cMotm": return S.careerMy.motm;
    case "sAps": return S.seasonMy.apps; case "sGoals": return S.seasonMy.goals; case "sAssists": return S.seasonMy.assists;
  }
  return null;
}
function adminSocial(){ if (!S.social) socialInit((S.player.name || "player").toLowerCase().replace(/[^a-z0-9]/g, "")); }
function adminSet(field, value){
  const me = meP(), v = typeof value === "string" ? value.trim() : value, n = Number(v);
  const num = (lo, hi) => clamp(Math.round(n), lo, hi);
  if (field.startsWith("skill:")){ S.skills[field.slice(6)] = num(1, 99); me.ovr = overall(); }
  else switch (field){
    // ---- player
    case "name": {
      const t = String(v).slice(0, 26) || S.player.name;
      S.player.name = t; const bits = t.split(/\s+/);
      me.fn = bits[0]; me.ln = bits.slice(1).join(" ") || me.ln; break;
    }
    case "number": S.player.number = num(1, 99); break;
    case "age": me.age = num(15, 45); break;
    case "pos": me.pos = v; S.player.pos = v; break;
    case "foot": S.player.foot = v; break;
    case "nat": me.nat = v; S.player.nat = v; break;
    case "ovr": me.ovr = num(1, 99); break;
    case "energy": S.energy = clamp(n, 0, 100); break;
    case "inj": me.inj = Math.max(0, Math.round(n)); break;
    case "workrate": S.workrate = num(1, 4); break;
    case "level": S.level = Math.max(1, Math.round(n)); break;
    case "levelAdd": S.level = Math.max(1, S.level + Math.round(n)); break;
    case "xp": S.xp = Math.max(0, Math.round(n)); break;
    case "sp": S.sp = Math.max(0, Math.round(n)); break;
    case "spAdd": S.sp = Math.max(0, S.sp + Math.round(n)); break;
    // ---- skills
    case "allSkills": for (const [k] of SKILLS) S.skills[k] = num(1, 99); me.ovr = overall(); break;
    case "bumpSkills": for (const [k] of SKILLS) S.skills[k] = clamp(S.skills[k] + Math.round(n), 1, 99); me.ovr = overall(); break;
    case "maxSkills": for (const [k] of SKILLS) S.skills[k] = 99; me.ovr = overall(); break;
    case "clearSkillXp": S.skillXp = {}; break;
    // ---- money & reputation
    case "money": S.money = Math.max(0, Math.round(n)); break;
    case "moneyAdd": S.money = Math.max(0, Math.round(S.money + n)); break;
    case "wage": if (S.contract) S.contract.wage = Math.max(0, Math.round(n)); break;
    case "years": if (S.contract) S.contract.years = Math.max(0, Math.round(n)); break;
    case "trust": S.trust = clamp(Math.round(n), -10, 10); break;
    case "rep": me.rep = Math.max(0, Math.round(n)); break;
    case "wrep": me.wrep = Math.max(0, Math.round(n)); break;
    case "fame": me.rep = Math.max(0, Math.round(n)); me.wrep = Math.round(n*.6); break;
    // ---- club
    case "club": {
      const id = Math.round(n), club = W.clubs[id];
      if (club && club.id !== me.club){ movePlayer(me, id, 0, false); toast(`Moved to ${club.nm}.`, "good"); }
      break;
    }
    case "clubBest": case "clubTopHome": case "clubWorst": {
      let pool = W.clubs.slice();
      if (field === "clubTopHome") pool = pool.filter(x => x.cc === me.nat || x.cc === (c0() || {}).cc);
      if (!pool.length) pool = W.clubs.slice();
      pool.sort((a, b) => field === "clubWorst" ? a.rep - b.rep : b.rep - a.rep);
      const t = pool[0];
      if (t && t.id !== me.club){ movePlayer(me, t.id, 0, false); toast(`Moved to ${t.nm}.`, "good"); }
      break;
    }
    case "release": {
      const from = me.club, cur = W.clubs[from];
      me.club = -1; S.contract = null; S.trust = 0;
      const pool = shuffle(W.clubs.filter(x => x.id !== from && clubInterest(x) > .25)).slice(0, 3);
      S.offerSet = {ctx:"contract", list:(pool.length ? pool : shuffle(W.clubs.filter(x => x.rep < (cur ? cur.rep*1.2 : 400))).slice(0, 3)).map(x => baseOffer(x))};
      save(); closeSheet(); toast("You've been released — pick a new club.");
      screenOffers(); return;
    }
    case "offers": {
      S.offerSet = {ctx:"contract", list:shuffle(W.clubs.filter(x => x.id !== me.club && clubInterest(x) > .2)).slice(0, 3).map(x => baseOffer(x))};
      save(); closeSheet(); screenOffers(); return;
    }
    // ---- Showoff
    case "makeSocial": adminSocial(); break;
    case "followers": adminSocial(); S.social.followers = Math.max(0, Math.round(n)); break;
    case "followersAdd": adminSocial(); S.social.followers = Math.max(0, Math.round(S.social.followers + n)); break;
    case "humility": adminSocial(); S.social.humility = clamp(n, -100, 100); break;
    case "respect": adminSocial(); S.social.respect = clamp(n, -100, 100); break;
    case "image": {
      adminSocial();
      const p = {loved:[60, 85], humble:[85, 60], cocky:[-70, 20], villain:[-80, -80], reset:[0, 0]}[v] || [0, 0];
      S.social.humility = p[0]; S.social.respect = p[1];
      break;
    }
    // ---- season
    case "week": S.week = clamp(Math.round(n), 0, CAL.W - 1); break;
    case "weekAdd": for (let i = 0; i < Math.max(1, Math.round(n)); i++) endWeek(); save(); refreshSheet(); return;
    case "actions": S.actions = Math.max(0, Math.round(n)); break;
    case "season": W.season = Math.max(1, Math.round(n)); break;
    case "year": S.year = Math.max(1900, Math.round(n)); break;
    case "drink": S.inv.drink = Math.max(0, Math.round(n)); break;
    case "max": S.inv.max = Math.max(0, Math.round(n)); break;
    // ---- the day job
    case "jobIdx": { const s = jobState(); s.j = clamp(Math.round(n), 0, JOBS.length - 1); s.r = clamp(s.r, 0, 2); s.xp = 0; jobSync(s); break; }
    case "jobRank": { const s = jobState(); s.r = clamp(Math.round(n), 0, 2); s.xp = 0; break; }
    case "jobXp": { const s = jobState(); s.xp = clamp(Math.round(n), 0, jobNeed()); break; }
    case "jobShifts": jobState().shifts = Math.max(0, Math.round(n)); break;
    case "jobUp": { const dir = Math.round(n) || 1; const before = myJob(); const p = jobMove(dir);
      if (dir > 0 && p.to !== before.rank) promoBox(p, null); else toast(`${p.job.name} · ${p.to.name}`); break; }
    case "jobNext": { const p = jobJumpToNextJob(); promoBox(p, null); break; }
    case "jobFill": { const s = jobState(); s.xp = Math.max(0, jobNeed() - 1); break; }
    case "jobReset": { const s = jobState(); s.j = 0; s.r = 0; s.xp = 0; jobSync(s); break; }
    // ---- career numbers
    case "cAps": S.careerMy.apps = Math.max(0, Math.round(n)); break;
    case "cGoals": S.careerMy.goals = Math.max(0, Math.round(n)); break;
    case "cAssists": S.careerMy.assists = Math.max(0, Math.round(n)); break;
    case "cMotm": S.careerMy.motm = Math.max(0, Math.round(n)); break;
    case "sAps": S.seasonMy.apps = Math.max(0, Math.round(n)); break;
    case "sGoals": S.seasonMy.goals = Math.max(0, Math.round(n)); break;
    case "sAssists": S.seasonMy.assists = Math.max(0, Math.round(n)); break;
    // ---- unlocks
    case "smartphone": S.phone = "smart"; S.apps = [...new Set([...S.apps, ...(Array.isArray(APPS) ? APPS.map(a => a.id) : Object.keys(APPS))])]; adminSocial(); break;
    case "allItems": for (const it of SHOP) if (!it.stack && it.id !== "smartphone") S.items[it.id] = true; for (const st of STAFF) S.staff[st.id] = true; break;
    case "allClothes": S.wardrobe = SHOPS.flatMap(sh => sh.items.map(i => i.id)); break;
    case "clearClothes": S.wardrobe = []; break;
    case "tutorial": closeSheet(); A.replayDream(); return;
  }
  save(); refreshSheet(); renderHub();
}
function c0(){ return meP().club >= 0 ? W.clubs[meP().club] : null; }
