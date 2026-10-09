"use strict";
/* ============ SMARTPHONE (Branyfon S1) ============ */
const ICONS = {hub:"⌂", stats:"⌗", rank:"▲", store:"B", showoff:"S", visage:"V", scout:"⌖", news:"N", league:"≡", bank:"€", msgs:"✉", settings:"⚙"};
const ICON_BG = {hub:"linear-gradient(135deg,#c8f060,#16c2b0)", stats:"linear-gradient(135deg,#7c3aed,#c084fc)", rank:"linear-gradient(135deg,#f5b700,#ffd75a 55%,#c8f060)", store:"linear-gradient(135deg,#2b2b2b,#555)", showoff:"linear-gradient(135deg,#ff5f6d,#ffc371 60%,#a855f7)", visage:"linear-gradient(135deg,#0ea5e9,#22d3ee)",
  scout:"linear-gradient(135deg,#16a34a,#84cc16)", news:"linear-gradient(135deg,#dc2626,#f97316)", league:"linear-gradient(135deg,#1e3a8a,#3b82f6)",
  bank:"linear-gradient(135deg,#065f46,#10b981)", msgs:"linear-gradient(135deg,#22c55e,#16a34a)", settings:"linear-gradient(135deg,#6b7280,#9ca3af)"};
const APP_TITLE = {hub:"Hub", stats:"Stats", rank:"Leaderboard", store:"Branystore", msgs:"Messages", settings:"Settings", showoff:"Showoff", visage:"Visage", scout:"Scout Pro", news:"Rising News", league:"Tables", bank:"Bank"};
function smTop(){ return PH.stack[PH.stack.length-1]; }
function smOpen(app, view, p){ if (app === "hub"){ if (window.lifeHub) window.lifeHub(); return; } PH.stack.push({app, view:view || "main", p:p || {}}); renderSmart(true); }
function smGo(view, p){ const t = smTop(); PH.stack.push({app:t.app, view, p:p || {}}); renderSmart(true); }
function smBack(){ PH.stack.pop(); PH.land = false; renderSmart(true); }
function smHome(){ PH.stack = []; PH.land = false; renderSmart(true); }
// drag up from the bar to go back — an app returns home, the home screen puts the phone away
function bindHomeBar(){
  const bar = $("#phoneHolder .sm-homebar"), screen = $("#phoneHolder .sm-screen"), phone = $("#phoneHolder .phone.smart");
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = "1";
  let y0 = 0, dragging = false;
  const move = e => {
    if (!dragging) return;
    const dy = Math.max(0, y0 - e.clientY);
    bar.classList.toggle("pulling", dy > 12);
    if (screen){ const k = Math.min(1, dy/140); screen.style.transform = `translateY(${-dy*.35}px) scale(${1 - k*.06})`; screen.style.opacity = String(1 - k*.35); }
    e.preventDefault();
  };
  const end = e => {
    if (!dragging) return;
    dragging = false; bar.classList.remove("pulling"); if (phone) phone.classList.remove("swiping");
    if (screen){ screen.style.transform = ""; screen.style.opacity = ""; }
    const dy = y0 - (e.clientY || y0);
    if (dy > 55){ PH.stack.length ? smHome() : closePhone(); }      // far enough: home, or put it away
    else if (dy < 6 && PH.stack.length) smHome();                    // a plain tap still works
  };
  bar.addEventListener("pointerdown", e => { dragging = true; y0 = e.clientY; if (phone) phone.classList.add("swiping"); try{ bar.setPointerCapture(e.pointerId); }catch(_){} e.preventDefault(); });
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
}
function smRefresh(){ renderSmart(); }
function installed(app){ return ["store","msgs","settings"].includes(app) || S.apps.includes(app); }
function renderSmart(anim){
  const h = $("#phoneHolder"); if (!h) return;
  const t = smTop(), time = phoneTime();
  let screen;
  if (!t){
    const apps = [...(document.body.classList.contains("life") ? ["hub"] : []), "store","msgs","settings","stats", ...(fbConfigured() ? ["rank"] : []), ...Object.keys(APPS).filter(a => S.apps.includes(a))];
    const unread = S.msgs.filter(m => !m.read).length, mentions = S.social ? S.social.ctx.length : 0;
    screen = `<div class="sm-home"><div class="sm-clock">${time}</div><div class="sm-date">${monthName(S.week)} ${calYear(S.week)} · ${esc(clubLabel(meP() ? meP().club : -1))}</div>
      <div class="sm-grid">${apps.map((a, i) => `<button class="app" style="animation-delay:${i*30}ms" onclick="smOpen('${a}')"><span class="ico ${a}" style="background:${ICON_BG[a]}">${a === "showoff" ? `<span class="s-logo">S</span>` : ICONS[a]}</span><span>${APP_TITLE[a]}</span>${a === "msgs" && unread ? `<i class="badge">${unread}</i>` : ""}${a === "showoff" && mentions ? `<i class="badge">${mentions}</i>` : ""}</button>`).join("")}</div></div>`;
  } else {
    const fn = APPVIEWS[t.app], out = fn ? fn(t) : {title:"", html:""};
    if (out.land && !PH.land) PH.land = true;
    if (!out.land) PH.land = false;
    screen = `<div class="sm-app ${anim ? "zoom" : ""}"><div class="sm-head"><button class="sm-back" onclick="smBack()">‹</button><b>${esc(out.title || APP_TITLE[t.app])}</b><span>${out.right || ""}</span></div>
      ${out.tabs ? `<div class="sm-tabs">${out.tabs}</div>` : ""}<div class="sm-body" id="smBody">${out.html}</div></div>`;
  }
  const fresh = PH.fresh; h.classList.toggle("still", !(fresh || anim)); PH.fresh = false;
  const html = `<div class="phone smart ${PH.land ? "land" : ""} ${fresh ? "pop-up" : ""}"><div class="sm-notch"></div><div class="sm-status"><span>${time}</span><span>5G ▮▮▮ 87%</span></div>
    <div class="sm-screen">${screen}</div><button class="sm-homebar" aria-label="Home, swipe up"></button></div>`;
  // same app, same view: patch in place (keeps scroll, no flicker). Navigating: fresh draw with the app zoom.
  if (!fresh && !anim && h.querySelector(".phone.smart")) morph(h, html); else h.innerHTML = html;
  bindHomeBar();
  // a different tab/filter inside the same app starts at the top; likes, comments etc. keep your place
  const key = t ? t.app + t.view + JSON.stringify(Object.assign({}, t.p, {text:null, tone:null})) : "home";
  if (key !== PH.viewKey){ const body = $("#smBody"); if (body) body.scrollTop = 0; PH.viewKey = key; }
  phoneBadge();
}
const APPVIEWS = {};

/* ---------- Branystore ---------- */
APPVIEWS.store = () => ({title:"Branystore", html:`<div class="store-hero"><span class="ico big" style="background:${ICON_BG.store}">B</span><div><b>Branystore</b><div class="muted small">Apps for your career</div></div></div>` +
  Object.entries(APPS).map(([id, a]) => { const has = S.apps.includes(id), pr = PH.installing[id];
    return `<div class="store-row"><span class="ico" style="background:${ICON_BG[id]}">${id === "showoff" ? `<span class="s-logo">S</span>` : ICONS[id]}</span><div class="grow"><b>${a.name}</b><div class="muted small">${a.desc} · ${a.size}</div>
      ${pr != null ? `<div class="meter thin"><i style="width:${pr}%"></i></div>` : ""}</div>
      ${has ? `<button class="pillbtn" onclick="smOpen('${id}')">Open</button>` : pr != null ? `<span class="muted small">${pr}%</span>` : `<button class="pillbtn get" onclick="installApp('${id}')">Get</button>`}</div>`; }).join("")});
function installApp(id){
  if (PH.installing[id] != null) return;
  PH.installing[id] = 0; smRefresh();
  const step = () => { PH.installing[id] += ri(9, 22);
    if (PH.installing[id] >= 100){ delete PH.installing[id]; if (!S.apps.includes(id)) S.apps.push(id); save(); toast(`${APPS[id].name} installed`, "good"); }
    else setTimeout(step, 120);
    if (PH.open && S.phone === "smart") smRefresh(); };
  setTimeout(step, 150);
}

/* ---------- Messages ---------- */
APPVIEWS.msgs = t => {
  if (t.view === "main") return {title:"Messages", html:S.msgs.length ? S.msgs.map((m, i) => `<button class="list-row" onclick="smGo('read',{i:${i}})"><span class="avatar">${esc(m.from[0])}</span><div class="grow"><b>${esc(m.from)}</b><div class="muted small ell">${esc(m.text)}</div></div>${m.read ? "" : `<i class="dot-new"></i>`}${m.offer && !m.done ? `<span class="pill gold">Offer</span>` : ""}</button>`).join("") : `<div class="empty">No messages yet.</div>`};
  const m = S.msgs[t.p.i]; m.read = true;
  const c = m.offer ? W.clubs[m.offer.club] : null;
  return {title:m.from, html:`<div class="bubble">${esc(m.text)}</div>${m.offer ? `<div class="card-in"><div class="row gap8">${crest(c.nm, 30)}<div><b>${esc(c.nm)}</b><div class="muted small">rep ${pad5(c.rep)} · ${esc(W.leagues[c.lg].nm)}</div></div></div>
    <div class="kvs"><div><span>Wage</span><b>${eur(m.offer.wage)}/wk</b></div><div><span>Length</span><b>${m.offer.years}y</b></div><div><span>Role</span><b>${ROLE[m.offer.role]}</b></div><div><span>Signing</span><b>${eur(m.offer.sign)}</b></div></div>
    ${m.done ? `<div class="muted">This offer is closed.</div>` : `<div class="row gap6 wrap"><button class="btn sm" onclick="msgAccept(${t.p.i})">Accept</button>${S.apps.includes("scout") ? `<button class="btn sm ghost" onclick="startNeg(${c.id},${t.p.i})">Negotiate</button>` : ""}<button class="btn sm ghost" onclick="msgDecline(${t.p.i})">Decline</button></div>
      ${windowAt(S.week).open ? "" : `<p class="muted small">The window is shut. If you accept, you move when the ${windowAt(S.week).next.toLowerCase()} opens.</p>`}`}</div>` : ""}`};
};
function msgAccept(i){ const m = S.msgs[i]; m.done = true; agreeMove(m.offer); save(); smRefresh(); if (!MT) renderHub(); }
function msgDecline(i){ const m = S.msgs[i]; m.done = true; S.locks[m.offer.club] = gw() + 4; save(); smRefresh(); }

/* ---------- Rising News ---------- */
APPVIEWS.news = t => {
  const f = t.p.f || "all", cats = [["all","All"],["you","You"],["rival","Rival"],["league","League"],["transfer","Transfers"],["award","Awards"],["world","World"]];
  const list = S.news.filter(n => f === "all" || n.cat === f || n.tag === f);
  return {title:"Rising News", tabs:cats.map(([k,l]) => `<button class="${f === k ? "on" : ""}" onclick="PH.stack[PH.stack.length-1].p.f='${k}';smRefresh()">${l}</button>`).join(""),
    html:list.length ? list.map(n => `<div class="news-item ${n.tag || n.cat}"><div class="muted small">${monthName(n.wk)} · ${esc({you:"You", rival:"Rival", league:"League", transfer:"Transfer", award:"Awards", world:"World", intl:"National team"}[n.cat] || "News")}</div><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div>`).join("") : `<div class="empty">Nothing here yet.</div>`};
};

/* ---------- Tables ---------- */
APPVIEWS.league = t => {
  const lgId = t.p.lg || shownLg(), view = t.p.v || "table";
  const tabs = [["table","Table"],["fx","My fixtures"],["cup","Cup"],["CL",CONT.CL],["EL",CONT.EL],["wc","World Champs"]].map(([k,l]) => `<button class="${view === k ? "on" : ""}" onclick="Object.assign(PH.stack[PH.stack.length-1].p,{v:'${k}'});smRefresh()">${l}</button>`).join("");
  let html = "";
  if (view === "table"){
    const lg = W.leagues[lgId], order = sortTab(lg.tab);
    html = `<select class="sel" onchange="Object.assign(PH.stack[PH.stack.length-1].p,{lg:this.value});smRefresh()">${Object.values(W.leagues).sort((a,b) => a.cc.localeCompare(b.cc) || a.t - b.t).map(l => `<option value="${l.id}" ${l.id === lgId ? "selected" : ""}>${COUNTRIES[l.cc].name} · ${esc(l.nm)}</option>`).join("")}</select>` + tableHTML(lg.tab, order, lg);
  } else if (view === "fx"){
    const me = meP(), rows = [];
    if (myClub()) for (let w = 0; w < CAL.W; w++) for (const f of fixturesAt(w)) if (f.kind !== "N" && (f.h === me.club || f.a === me.club)){ const d = W.done[f.key]; rows.push(`<div class="res ${w === S.week ? "now" : ""}"><span class="muted small">${monthName(w).slice(0,3)}</span><span>${esc(W.clubs[f.h].nm)}</span><b>${d ? `${d.hg}–${d.ag}` : EMPTY_CELL}</b><span>${esc(W.clubs[f.a].nm)}</span></div>`); }
    html = rows.join("") || `<div class="empty">${myClub() ? "No fixtures." : "No club, so no fixtures. Sign for a club and your games show up here."}</div>`;
  } else if (view === "cup"){
    const cup = myCup();
    html = !Object.keys(W.cups || {}).length ? `<div class="empty">No cup this season. It starts again next season.</div>`
      : cup ? `<div class="muted small">${esc(cup.nm)}${cup.winner != null ? ` · Winner: <b>${esc(W.clubs[cup.winner].nm)}</b>` : ""}</div>`
      + cup.weeks.map(w => { const res = cup.res[w] || []; if (!res.length) return "";
          return `<h4>${cupRoundName(cup, w)}</h4>` + res.map(r => `<div class="res ${myClub() && (r.h === meP().club || r.a === meP().club) ? "now" : ""}"><span>${esc(W.clubs[r.h].nm)}</span><b>${r.hg}–${r.ag}</b><span>${esc(W.clubs[r.a].nm)}</span></div>`).join(""); }).join("")
      : `<div class="empty">No cup for your country.</div>`;
    if (cup && !Object.keys(cup.res).length) html += `<div class="empty">The cup hasn't kicked off yet.</div>`;
  } else if (view === "wc"){
    const wc = W.wc;
    if (!wc) html = `<div class="empty">No World Championship this season. The next one starts with the new season.</div>`;
    else {
      const order = sortNatTab(wc.tab);
      html = `<div class="muted small">Group stage, then semi-finals and the final${wc.winner ? ` · Champions: <b>${esc(NAMES[wc.winner].n)}</b>` : ""}</div>`
        + `<table class="tbl"><thead><tr><th>#</th><th class="l">Nation</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>${
          order.map((nt, i) => { const r = wc.tab[nt];
            return `<tr class="${nt === meP().nat ? "me" : ""} ${i < 4 ? "up" : ""}"><td>${i+1}</td><td class="l">${esc(NAMES[nt].n)}</td><td>${r[0]}</td><td>${r[4]-r[5]}</td><td><b>${r[6]}</b></td></tr>`; }).join("")}</tbody></table>`
        + ["sf","f"].filter(k => wc.ko[k + "R"]).map(k => `<h4>${k === "sf" ? "Semi-finals" : "Final"}</h4>` +
            wc.ko[k + "R"].map(r => `<div class="res"><span>${esc(NAMES[r.h].n)}</span><b>${r.hg}–${r.ag}</b><span>${esc(NAMES[r.a].n)}</span></div>`).join("")).join("");
    }
  } else {
    const c = W.comps[view];
    html = `<div class="muted small">${c.clubs.length} clubs · league phase then knockouts${c.winner != null ? ` · Winner: <b>${esc(W.clubs[c.winner].nm)}</b>` : ""}</div>` + tableHTML(c.tab, sortTab(c.tab), null)
      + ["qf","sf","f"].filter(s => c.ko[s + "R"]).map(s => `<h4>${{qf:"Quarter-finals", sf:"Semi-finals", f:"Final"}[s]}</h4>` + c.ko[s + "R"].map(r => `<div class="res"><span>${esc(W.clubs[r.h].nm)}</span><b>${r.hg}–${r.ag}</b><span>${esc(W.clubs[r.a].nm)}</span></div>`).join("")).join("");
  }
  return {title:"Tables", tabs, html};
};
function tableHTML(tab, order, lg){
  const mine = myClub() ? meP().club : null, n = order.length;
  return `<table class="tbl"><thead><tr><th>#</th><th class="l">Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>${order.map((cid, i) => { const r = tab[cid], c = W.clubs[cid];
    const zone = lg ? (lg.t > 1 && i < (lg.clubs.length < 14 ? 1 : 2) ? "up" : (MOVES[lg.cc] && MOVES[lg.cc][lg.t] && i >= n - Math.max(1, Math.round(MOVES[lg.cc][lg.t]/Object.values(W.leagues).filter(x => x.cc === lg.cc && x.t === lg.t).length)) ? "down" : "")) : (i < 8 ? "up" : "");
    return `<tr class="${cid === mine ? "me" : ""} ${zone}"><td>${i+1}</td><td class="l">${crest(c.nm, 14)} ${esc(c.nm)}</td><td>${r[0]}</td><td>${r[4]-r[5]}</td><td><b>${r[6]}</b></td></tr>`; }).join("")}</tbody></table>`;
}

/* ---------- Bank ---------- */
APPVIEWS.bank = () => {
  const k = S.contract, prog = reqProgress();
  return {title:"Bank", html:`<div class="bank-card"><span class="muted small">Balance</span><b>${eur(S.money)}</b><span class="muted small">Rising Bank · **** ${String(S.meId).padStart(4,"0")}</span></div>
    <div class="kvs"><div><span>Weekly wage</span><b>${k ? eur(k.wage) : EMPTY_CELL}</b></div><div><span>Staff costs</span><b>−${eur(staffCost())}/wk</b></div><div><span>Home</span><b>${["Shared room","Rented flat","House","Villa"][homeTier()]}</b></div><div><span>Car</span><b>${["None","Dacia Logan","SUV","Sports car"][carTier()]}</b></div></div>
    ${k ? `<h4>Contract · ${esc(clubLabel(meP().club))}${k.loan ? " (loan)" : ""}</h4><div class="kvs"><div><span>Years left</span><b>${k.years}</b></div><div><span>Role</span><b>${ROLE[k.role]}</b></div><div><span>Yearly raise</span><b>${k.raise || 0}%</b></div>
      <div><span>Per goal</span><b>${eur(k.bG || 0)}</b></div><div><span>Per assist</span><b>${eur(k.bA || 0)}</b></div><div><span>Per appearance</span><b>${eur(k.bApp || 0)}</b></div><div><span>Per win</span><b>${eur(k.bW || 0)}</b></div></div>
      ${prog ? `<h4>Targets${k.promised ? ` · promised by ${monthName(k.deadline % CAL.W)} ${S.year + Math.floor((k.deadline - (W.season-1)*CAL.W)/CAL.W)}` : ""}</h4>${Object.entries(prog).map(([key, v]) => `<div class="meter-row"><span>${REQ_LABEL[key]}</span><div class="meter ${v.have >= v.target ? "energy" : "xp"}"><i style="width:${Math.min(100, 100*v.have/v.target)}%"></i></div><b>${Math.min(v.have, v.target)}/${v.target}</b></div>`).join("")}${k.failed ? `<p class="bad">Promise broken. Wage halved, bonuses removed.</p>` : k.metDone ? `<p class="good">All targets met.</p>` : ""}` : ""}` : ""}
    <h4>Purchases</h4>${S.purchases.length ? S.purchases.map(p => `<div class="small">${esc(p.name)}</div>`).join("") : `<div class="muted small">Nothing yet.</div>`}`};
};

/* ---------- Settings ---------- */
APPVIEWS.settings = () => ({title:"Settings", html:`<div class="stack">
  <button class="btn sm" onclick="A.fullscreen()">⛶ Full screen</button>
  <div><label>Graphics</label>${gfxSeg("A.gfx")}</div>
  <div><label>Match speed</label><div class="seg">${[1,2,4].map(s => `<button aria-pressed="${S.speed === s}" onclick="S.speed=${s};save();smRefresh()">${s}×</button>`).join("")}</div></div>
  <label>Move this career to another device</label>
  <button class="btn sm" id="phSaveBtn" onclick="phoneSaveCode()">💾 ${SAVE_CODE_LABEL}</button>
  <textarea id="phCode" rows="3" readonly placeholder="Your save code will appear here" onclick="this.select()"></textarea>
  <label>Import save</label><textarea id="impCode" rows="3" placeholder="Paste a save code"></textarea>
  <div class="row gap6 wrap"><button class="btn sm ghost" onclick="importCode()">Import into slot ${SLOT}</button><button class="btn sm ghost" onclick="saveNow();toast('Saved','good')">Save now</button><button class="btn sm danger" onclick="phoneDeleteCareer()">Delete career</button></div>
  <p class="muted small">The code holds the whole football world, so it's long. Copy all of it.</p></div>`});
async function phoneSaveCode(){
  const btn = $("#phSaveBtn"); if (btn){ btn.disabled = true; btn.textContent = "Packing…"; }
  saveNow();
  try{
    const code = await makeCode();
    const box = $("#phCode"); if (box){ box.value = code; }
    const ok = await copyText(code);
    toast(ok ? `Save code copied (${Math.round(code.length/1024)} KB).` : "Code ready. Select it all and copy.", ok ? "good" : "");
  }catch(e){ toast("Couldn't build the code."); }
  if (btn){ btn.disabled = false; btn.textContent = `💾 ${SAVE_CODE_LABEL}`; }
}
async function importCode(){
  const el = $("#impCode"), txt = el ? el.value : "";
  if (!txt.trim()) return toast("Paste a save code first.");
  try{
    const r = await applyCode(txt, SLOT);
    const d = load(SLOT); if (!d) throw new Error("bad");
    resume(d); startPlayClock(); closePhone();
    toast(`${r.name} imported into slot ${r.slot}.`, "good");
    if (S.offerSet) return screenOffers();
    renderHub();
  }catch(e){ toast("That code isn't a valid save."); }
}
function phoneDeleteCareer(){
  const n = SLOT;
  closePhone();
  confirmBox(`Delete slot ${n}?`, "This career will be gone for good. Save a code first if you want to keep it.", () => { deleteSlot(n); S = null; toast("Career deleted."); screenTitle(); });
}
