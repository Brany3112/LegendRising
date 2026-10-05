"use strict";
/* ============ THE BARBER ============
   Fade & Co., across the road from your block (js/life/barber.js builds it). Sit in a chair and the barber's book
   opens: hairstyles, beards and colours, each with its price. The cuts the creation screen has are a walk-in job;
   the rest of the menu (barber-only cuts, a proper beard, dye) is kept for people the town has heard of — they show
   as LOCKED with the reputation they need. Pick, watch your head change in the mirror, pay, and it is yours. */
const BARBER = {
  name:"Fade & Co.", open:9*60, close:20*60,
  // walk-in cuts: the creation screen's styles
  hairPrice:k => k === "bald" ? 10 : k === "buzz" ? 12 : ["afro", "dreads", "braids", "cornrows"].includes(k) ? 35 : ["long", "ponytail", "bun"].includes(k) ? 26 : 18,
  // the barber's own: [key, price, reputation]
  hairX:{undercut:[28, 15], slick:[32, 35], spiky:[30, 60], mohawk:[45, 110]},
  beard:{"":[6, 0], stubble:[6, 0], beard:[10, 0], goatee:[14, 20], full:[18, 70]},
  // natural shades are a colour job at €24; the dyes, [price, reputation], in LOOK_BARBER's order
  dye:[[42, 40], [55, 90], [60, 140], [65, 200]]
};
const BRB = {tab:"hair", base:null};
function barberOpen(m){ return m >= BARBER.open && m < BARBER.close; }
function barberRep(){ const me = typeof meP === "function" ? meP() : null; return me ? Math.round(me.rep || 0) : 0; }
// the menu for a part: [{v, n, price, rep}]
function barberMenu(part){
  if (part === "hair") return LOOK_OPT.hair.map(([v, n]) => ({v, n, price:BARBER.hairPrice(v), rep:0}))
    .concat(LOOK_BARBER.hair.map(([v, n]) => ({v, n, price:BARBER.hairX[v][0], rep:BARBER.hairX[v][1], x:true})));
  if (part === "beard") return LOOK_OPT.beard.concat(LOOK_BARBER.beard).map(([v, n]) => ({v, n:v === "" ? "Clean shave" : n, price:BARBER.beard[v][0], rep:BARBER.beard[v][1], x:!LOOK_OPT.beard.some(b => b[0] === v)}));
  const nat = ["Black", "Dark brown", "Brown", "Chestnut", "Dark blonde", "Auburn", "Grey", "Silver"];
  return LOOK_OPT.hairColor.map((c, i) => ({v:c, n:nat[i] || "Natural", price:24, rep:0}))
    .concat(LOOK_BARBER.hairColor.map(([c, n], i) => ({v:c, n, price:BARBER.dye[i][0], rep:BARBER.dye[i][1], x:true})));
}
const BR_KEY = {hair:"hair", beard:"beard", color:"hairColor"};
// what you would pay for the draft against the look you walked in with
function barberBill(){
  if (!LK.draft || !BRB.base) return {items:[], total:0};
  const items = [];
  for (const part of ["hair", "beard", "color"]){
    const k = BR_KEY[part]; if (LK.draft[k] === BRB.base[k]) continue;
    const it = barberMenu(part).find(o => o.v === LK.draft[k]); if (it) items.push({part, n:it.n, price:it.price});
  }
  return {items, total:items.reduce((t, i) => t + i.price, 0)};
}
function barberOptsHTML(){
  const part = BRB.tab, k = BR_KEY[part], rep = barberRep(), cur = LK.draft ? LK.draft[k] : null;
  return `<div class="br-grid${part === "color" ? " br-cols" : ""}" role="group" aria-label="${part}">${barberMenu(part).map(o => {
    const locked = o.rep > rep, mine = BRB.base && o.v === BRB.base[k];
    return `<button class="br-opt${locked ? " locked" : ""}" aria-pressed="${o.v === cur}" ${locked ? `aria-disabled="true"` : ""} onclick="brPick('${part}','${o.v}')">
      ${part === "color" ? `<i class="br-sw" style="--c:${lkHex(o.v)}"></i>` : ""}<b>${esc(o.n)}</b>
      <span>${mine ? "Yours now" : locked ? `🔒 Locked` : eurFull(o.price)}</span>
      ${locked ? `<em>Needs ${o.rep} reputation · you have ${rep}</em>` : o.x ? `<em class="br-x">Barber's own</em>` : ""}</button>`; }).join("")}</div>`;
}
function barberFootHTML(){
  const b = barberBill(), broke = b.total > num(S.money, 0);
  return `<div class="br-bill">${b.items.length ? b.items.map(i => `<span>${esc(i.n)} <b>${eurFull(i.price)}</b></span>`).join("") : `<span class="muted">Pick a cut, a beard or a colour — the mirror shows it before you pay.</span>`}</div>
    <span class="grow"></span><button class="btn sm ghost" onclick="brReset()" ${b.items.length ? "" : "disabled"}>Undo</button>
    <button class="btn sm" onclick="brPay()" ${!b.items.length || broke ? "disabled" : ""}>${broke ? `Need ${eurFull(b.total)}` : b.items.length ? `Pay ${eurFull(b.total)}` : "Pay"}</button>`;
}
function barberRender(){
  const c = $("#brOpts"); if (c) c.innerHTML = barberOptsHTML();
  const f = $("#brFoot"); if (f) f.innerHTML = barberFootHTML();
  for (const b of document.querySelectorAll(".br-tabs button")) b.setAttribute("aria-pressed", String(b.dataset.v === BRB.tab));
}
function openBarber(){
  if (!S || !S.player) return;
  const now = window.LIFE ? window.LIFE.min : S.life.min;
  if (!barberOpen(now)) return window.lifeNote ? window.lifeNote(`Closed. ${BARBER.name} is open ${fmtTime(BARBER.open)} – ${fmtTime(BARBER.close)}.`) : null;
  LK.where = "barber"; LK.saved = false; LK.view = "face"; LK.kind = "casual"; LK.o = null; LK.only = null;
  LK.draft = JSON.parse(JSON.stringify(lookSane(S.player.look, lookSeedOf(S))));
  BRB.base = Object.assign({}, LK.draft); BRB.tab = "hair";
  lpShow("barber", `<div class="lk br">${lpHead(BARBER.name, "Barber · sit back", `<span class="pill">€${Math.round(num(S.money, 0))}</span>`)}
    <div class="lk-main">${lkStageHTML()}<div class="lk-ctl br-ctl">
      <div class="seg br-tabs" role="group" aria-label="What to change">${[["hair", "Hairstyle"], ["beard", "Beard"], ["color", "Colour"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${BRB.tab === v}" onclick="brTab('${v}')">${n}</button>`).join("")}</div>
      <div id="brOpts">${barberOptsHTML()}</div>
      <p class="lk-note">Your reputation: <b>${barberRep()}</b>. The barber's own cuts and the dyes open up as the town gets to know your name.</p></div></div>
    <div class="lk-foot" id="brFoot">${barberFootHTML()}</div></div>`,
    {onClose:() => { if (window.LookPreview) window.LookPreview.unmount(); LK.draft = null; LK.where = ""; BRB.base = null; }});
  lkPreview();
}
function brTab(t){ BRB.tab = t; barberRender(); if (window.LookPreview) lkView(t === "beard" || t === "hair" || t === "color" ? "face" : "front"); }
function brPick(part, raw){
  if (!LK.draft) return;
  const it = barberMenu(part).find(o => String(o.v) === String(raw)); if (!it) return;
  if (it.rep > barberRep()){
    if (typeof FEED === "object" && FEED.chip) FEED.chip(`${it.n}: needs ${it.rep} reputation`, "bad");
    const b = document.querySelector(`.br-opt[onclick*="'${raw}'"]`); if (b){ b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); }
    return;
  }
  LK.draft[BR_KEY[part]] = it.v; lkUpdate(); barberRender();
}
function brReset(){ if (!LK.draft || !BRB.base) return; for (const k of ["hair", "beard", "hairColor"]) LK.draft[k] = BRB.base[k]; lkUpdate(); barberRender(); }
function brPay(){
  const b = barberBill(); if (!b.items.length) return;
  if (!spend(b.total)){ if (typeof FEED === "object" && FEED.chip) FEED.chip("Not enough money", "bad"); return; }
  S.player.look = lookSane(LK.draft, lookSeedOf(S)); LK.saved = true;
  if (window.lifeLookChanged) window.lifeLookChanged();
  if (typeof FEED === "object" && FEED.chip) FEED.chip(`Fresh cut · −${eurFull(b.total)}`, "good");
  lpClose();
  if (window.lifeNote) window.lifeNote("Looking sharp. The barber spins the chair round to the mirror one last time.");
}
