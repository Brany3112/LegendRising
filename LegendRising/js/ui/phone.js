"use strict";
/* ============ PHONE SHELL ============ */
const PH = {open:false, stack:[], kp:{view:"home", sel:0, scroll:0, data:null, hist:[]}, land:false, neg:null, installing:{}};
function phoneBadge(){
  if (!S) return;
  const n = S.msgs.filter(m => !m.read).length + (S.social ? S.social.ctx.filter(c => c.type === "mention").length : 0);
  // the floating button's badge, and the one on the hub header's phone button (on a phone screen)
  for (const b of document.querySelectorAll("#phoneBadge, .ph-badge")){ b.textContent = n; b.style.display = n ? "" : "none"; }
}
function mountPhone(){
  const r = $("#phoneRoot");
  r.innerHTML = `<button class="phone-tab" id="phoneTab" onclick="togglePhone()" aria-label="Phone"><span class="pt-ico">▮</span><span>Phone</span><i id="phoneBadge" class="badge"></i></button>
    <div class="phone-back" onclick="closePhone()"></div><div class="phone-holder" id="phoneHolder"></div>`;
}
const inLife = () => document.body.classList.contains("life");
// the phone shows the real time of day when you are walking around, otherwise a time that moves with the weeks
function phoneTime(){
  if (inLife() && window.LIFE) return `${String(Math.floor(LIFE.min/60)%24).padStart(2,"0")}:${String(Math.floor(LIFE.min)%60).padStart(2,"0")}`;
  return `${String(8 + Math.floor(S.week/5)).padStart(2,"0")}:${String((S.week*7)%60).padStart(2,"0")}`;
}
function togglePhone(){
  // in the first-person build the button in the hub puts the phone back in your pocket
  if (window.lifeHubOut && window.lifeHubOut()) return window.lifePutAway();
  PH.open ? closePhone() : openPhone();
}
function openPhone(){ if (!S || MT) return; PH.open = true; PH.fresh = true; $("#phoneRoot").classList.add("open"); renderPhone(); if (window.lifePhoneChanged) lifePhoneChanged(); }
function closePhone(){ PH.open = false; const r = $("#phoneRoot"); if (r) r.classList.remove("open"); PH.land = false; if (window.lifePhoneChanged) lifePhoneChanged(); }
function renderPhone(){
  const h = $("#phoneHolder"); if (!h || !S) return;
  if (S.phone === "smart") return renderSmart();
  const fresh = PH.fresh; h.classList.toggle("still", !fresh); PH.fresh = false;
  if (!fresh && h.querySelector(".phone.keypad")) morph(h, keypadHTML()); else h.innerHTML = keypadHTML();
  phoneBadge();
}

/* ============ KEYPAD PHONE (Branyfon K1) ============
   Real button positions: soft keys either side of the D-pad, call/end below them, then the number pad.
   ▲/▼ on the ring (or 2/8) move, centre (or 5, green, left soft) selects, red / right soft go back. */
function kpView(){
  const K = PH.kp, me = meP();
  switch (K.view){
    case "home": return {title:"Menu", items:[...(inLife() ? [{l:"Hub ▸"}] : []), {l:"Stats"}, ...(inLife() ? [{l:"Foodies"}] : []), {l:"Scout"}, {l:`Messages${S.msgs.some(m => !m.read) ? " ●" : ""}`}, {l:"Settings"}], soft:["Select","Exit"]};
    case "foodies": return kpFoodiesView();
    case "stats": {
      const s = S.seasonMy, c = S.careerMy, k = S.contract, prog = reqProgress();
      const lines = [`${S.player.name}`, `${S.player.teamPos || S.player.pos} · OVR ${overall()}`, `Club: ${myClub().nm}`, `Rep ${pad5(me.rep)} World ${pad5(me.wrep)}`, "-- SEASON --",
        `Apps ${s.apps}  Goals ${s.goals}`, `Assists ${s.assists}  MotM ${s.motm}`, `Dribbles ${s.dribbles}`, `Passes ${s.spass + s.lpass}/${s.passAtt}`, `Avg rating ${s.apps ? (s.ratingSum/s.apps).toFixed(2) : "-"}`,
        "-- CAREER --", `Apps ${c.apps}  Goals ${c.goals}`, `Assists ${c.assists}`, "-- SKILLS --", ...SKILLS.map(([key, n]) => `${n} ${num(S.skills[key], 0)}`),
        "-- TODAY --", `Energy ${Math.round(S.energy)} Fatigue ${Math.round(S.fatigue || 0)}`, `Chemistry ${Math.round(S.chem || 0)}`,
        "-- CONTRACT --", k ? `${eur(k.wage)}/wk ${k.years}y` : "None", ...(prog ? Object.entries(prog).map(([key, v]) => `${REQ_LABEL[key]} ${Math.min(v.have, v.target)}/${v.target}`) : [])];
      return {title:"Stats", lines, soft:["","Back"]};
    }
    case "scoutC": return {title:"Scout: country", items:Object.entries(COUNTRIES).map(([cc, C]) => ({l:C.name, v:cc})), soft:["Select","Back"]};
    case "scoutL": return {title:COUNTRIES[K.data].name, items:Object.values(W.leagues).filter(l => l.cc === K.data).sort((a,b) => a.t - b.t || a.id.localeCompare(b.id)).map(l => ({l:l.nm, v:l.id})), soft:["Select","Back"]};
    case "scoutK": return {title:W.leagues[K.data].nm, items:W.leagues[K.data].clubs.map(id => W.clubs[id]).sort((a,b) => b.rep - a.rep).map(c => ({l:`${c.nm}`, r:pad5(c.rep), v:c.id})), soft:["Select","Back"]};
    case "scoutGo": { const c = W.clubs[K.data]; return {title:"Request", lines:[`${c.nm}`, `Rep ${pad5(c.rep)}`, `You: ${pad5(me.rep)}`, "Ask for a transfer?", "They reply in 1-3 wk."], items:[{l:"Send request", v:"send"}, {l:"Cancel", v:"no"}], soft:["Select","Back"]}; }
    case "msgs": return {title:"Messages", items:S.msgs.length ? S.msgs.map((m, i) => ({l:`${m.read ? "" : "● "}${m.from}`, v:i})) : [{l:"(empty)", v:-1}], soft:["Open","Back"]};
    case "msg": { const m = S.msgs[K.data]; m.read = true;
      const lines = [m.from, ...wrapTxt(m.text, 22)];
      if (m.offer){ lines.push("-- OFFER --", ...wrapTxt(contractText(m.offer), 22)); if (m.done) lines.push("(closed)"); }
      return {title:"SMS", lines, items: m.offer && !m.done ? [{l:"Accept", v:"yes"}, {l:"Decline", v:"no"}] : null, soft:[m.offer && !m.done ? "Select" : "", "Back"]}; }
    case "settings": return {title:"Settings", items:[{l:"Full screen", v:"fs"}, {l:"Save now", v:"save"}, {l:"Quit to title", v:"quit"}], soft:["Select","Back"]};
    case "info": return {title:"Info", lines:wrapTxt(K.data, 22), soft:["OK",""]};
  }
}
function wrapTxt(t, n){ const out = []; let cur = ""; for (const w of String(t).split(" ")){ if ((cur + " " + w).trim().length > n){ out.push(cur.trim()); cur = w; } else cur += " " + w; } if (cur.trim()) out.push(cur.trim()); return out; }
function keypadHTML(){
  const v = kpView(), K = PH.kp, rows = 7;
  let body = "";
  if (v.lines){ const L = v.lines.slice(K.scroll, K.scroll + (v.items ? 4 : rows)); body += L.map(l => `<div class="kp-line">${esc(l)}</div>`).join(""); }
  if (v.items){
    const start = Math.max(0, Math.min(K.sel - 2, v.items.length - (v.lines ? 3 : rows)));
    body += v.items.slice(start, start + (v.lines ? 3 : rows)).map((it, i) => `<div class="kp-item ${start + i === K.sel ? "sel" : ""}" onclick="kpPick(${start + i})"><span>${esc(it.l)}</span>${it.r ? `<em>${it.r}</em>` : ""}</div>`).join("");
  }
  const t = phoneTime();
  const key = (k, cls, html) => `<button class="kk ${cls}" onclick="kpKey('${k}')" aria-label="${k}">${html}</button>`;
  return `<div class="phone keypad pop-up">
    <div class="kp-speaker"></div><div class="kp-brand"><b>B</b><span>Branyfon</span></div>
    <div class="kp-screen"><div class="kp-bar"><span>${esc(v.title)}</span><span>▮▮▮ ${t}</span></div><div class="kp-body">${body}</div>
      <div class="kp-soft"><span>${v.soft[0] || ""}</span><span>${v.soft[1] || ""}</span></div></div>
    <div class="kp-keys">
      <div class="kp-top">
        ${key("lsoft","soft","—")}
        <div class="dpad"><button class="dp up" onclick="kpKey('up')" aria-label="up"></button><button class="dp ok" onclick="kpKey('ok')" aria-label="ok"></button><button class="dp down" onclick="kpKey('down')" aria-label="down"></button></div>
        ${key("rsoft","soft","—")}
        ${key("call","call","<i class='ph g'></i>")}
        ${key("end","end","<i class='ph r'></i>")}
      </div>
      <div class="kp-num">${[["1","ꝏ"],["2","abc"],["3","def"],["4","ghi"],["5","jkl"],["6","mno"],["7","pqrs"],["8","tuv"],["9","wxyz"],["*","+"],["0","⎵"],["#","🔇"]].map(([n,s]) => key(n, "num", `<b>${n}</b><small>${s}</small>`)).join("")}</div>
    </div></div>`;
}
function kpKey(k){
  const K = PH.kp, v = kpView();
  if (k === "2") k = "up"; if (k === "8") k = "down"; if (k === "5" || k === "call" || k === "lsoft") k = "ok"; if (k === "rsoft") k = "end";
  const n = v.items ? v.items.length : 0;
  if (k === "up"){ if (v.items && (!v.lines || K.sel > 0)) K.sel = (K.sel - 1 + n) % n; else K.scroll = Math.max(0, K.scroll - 1); }
  else if (k === "down"){ if (v.items && !v.lines) K.sel = (K.sel + 1) % n; else if (v.lines && K.scroll < v.lines.length - (v.items ? 4 : 7)) K.scroll++; else if (v.items) K.sel = (K.sel + 1) % n; }
  else if (k === "end"){ if (!K.hist.length){ if (K.view === "home") return closePhone(); } kpBack(); }
  else if (k === "ok") kpSelect(v);
  renderPhone();
}
// a click on a line of the menu: that one, chosen
function kpPick(i){ const K = PH.kp, v = kpView(); if (!v.items || !v.items[i]) return; K.sel = i; kpKey("ok"); }
function kpGo(view, data){ const K = PH.kp; K.hist.push({view:K.view, sel:K.sel, data:K.data}); K.view = view; K.data = data; K.sel = 0; K.scroll = 0; }
function kpBack(){ const K = PH.kp, p = K.hist.pop(); if (p){ K.view = p.view; K.sel = p.sel; K.data = p.data; K.scroll = 0; } else { K.view = "home"; K.sel = 0; } }
function kpSelect(v){
  const K = PH.kp, it = v.items ? v.items[K.sel] : null;
  switch (K.view){
    case "foodies": if (it){ K.hist = []; K.view = "info"; K.data = kpFoodiesPick(it.v); save(); } return;
    case "home": { const list = [...(inLife() ? ["hub"] : []), "stats", ...(inLife() ? ["foodies"] : []), "scoutC","msgs","settings"];
      if (list[K.sel] === "hub"){ if (window.lifeHub) setTimeout(window.lifeHub, 0); return; }
      return kpGo(list[K.sel]); }
    case "scoutC": return kpGo("scoutL", it.v);
    case "scoutL": return kpGo("scoutK", it.v);
    case "scoutK": return kpGo("scoutGo", it.v);
    case "scoutGo": if (it.v === "send"){ const r = sendRequest(K.data); save(); K.hist = []; K.view = "info"; K.data = r; } else kpBack(); return;
    case "msgs": if (it.v >= 0) kpGo("msg", it.v); return;
    case "msg": { const m = S.msgs[K.data]; if (!it || !m.offer || m.done) return;
      if (it.v === "yes"){ m.done = true; agreeMove(m.offer); save(); K.hist = []; K.view = "info"; K.data = S.pendingMove ? "Deal agreed. You move when the window opens." : `Welcome to ${W.clubs[m.offer.club].nm}!`; if (!MT) renderHub(); }
      else { m.done = true; S.locks[m.offer.club] = gw() + 4; save(); kpBack(); } return; }
    case "settings": if (it.v === "fs") A.fullscreen(); if (it.v === "save"){ saveNow(); K.view = "info"; K.data = "Saved."; } if (it.v === "quit"){ closePhone(); A.quit(); } return;
    case "info": K.view = "home"; K.hist = []; K.sel = 0; return;
  }
}
/* the mouse on the keypad phone: the wheel moves up and down the menu (a trackpad's flood of small steps is gathered
   into whole ones), a click on a line chooses it — and with the pointer locked (walking about with it in your hand),
   the left button chooses the highlighted line (life/world.js). Esc goes back a screen, and out at the top. */
let kpWheel = 0, kpWheelT = 0;
window.addEventListener("wheel", e => {
  if (!PH.open || !S || MT || S.phone !== "keypad") return;
  const now = performance.now(); if (now - kpWheelT > 400) kpWheel = 0; kpWheelT = now;
  kpWheel += e.deltaMode === 1 ? e.deltaY*40 : e.deltaY;
  while (Math.abs(kpWheel) >= 60){ kpKey(kpWheel > 0 ? "down" : "up"); kpWheel -= Math.sign(kpWheel)*60; }
  e.preventDefault();
}, {passive:false});
window.kpMouseOk = () => { if (!PH.open || !S || MT || S.phone !== "keypad") return false; kpKey("ok"); return true; };
window.addEventListener("keydown", e => {
  if (!PH.open || !S || MT) return;
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === "Escape"){ if (S.phone === "smart"){ smBack(); } else kpKey("end"); e.preventDefault(); return; }
  if (S.phone !== "keypad") return;
  const map = {ArrowUp:"up", ArrowDown:"down", Enter:"ok", Backspace:"end"};
  if (map[e.key]){ e.preventDefault(); kpKey(map[e.key]); }
});
