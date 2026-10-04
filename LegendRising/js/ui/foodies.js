"use strict";
/* ============ FOODIES: food to your door ============
   Order on the phone, pay now, and it turns up in a while — at your flat if you are at home, at the
   gym fridge if you are at the training ground. Dearer than the Mini Market and you have to wait for
   it, but you do not have to go anywhere. */
const FD = {basket:{}};
ICONS.foodies = "🍔"; ICON_BG.foodies = "linear-gradient(135deg,#ff6a3a,#ffb347)"; APP_TITLE.foodies = "Foodies";
function fdTotal(){ let t = 0, n = 0; for (const [k, q] of Object.entries(FD.basket)) if (FOOD[k] && q > 0){ t += FOOD[k].foodies*q; n += q; } return {t, n, all:n ? t + FOODIES_FEE : 0}; }
function fdAdd(k, d){ FD.basket[k] = clamp((FD.basket[k] || 0) + d, 0, 9); smRefresh(); }
function fdWhere(){ return typeof lifeZone === "function" && lifeZone() === "ground" ? "the gym fridge" : "your flat"; }
function fdOrder(){
  const r = foodiesOrder(FD.basket);
  if (!r.ok){ toast(r.why, "bad"); return; }
  FD.basket = {};
  const eta = r.order.eta % 1440;
  if (typeof FEED === "object" && FEED.live()) FEED.chip(`Foodies · arriving about ${fmtTime(eta)}`, "good"); else toast(`Ordered — arriving about ${fmtTime(eta)}`, "good");
  smRefresh();
}
APPVIEWS.foodies = t => {
  if (!S.life){ return {title:"Foodies", html:`<div class="empty">Foodies delivers when you're out and about in the city.</div>`}; }
  const tot = fdTotal(), pending = S.orders.slice().sort((a, b) => a.eta - b.eta);
  const groups = FOOD_KINDS.map(([kind, label]) => {
    const items = Object.entries(FOOD).filter(([k, it]) => it.kind === kind);
    return `<div class="fo-h">${label}</div>` + items.map(([k, it]) => {
      const q = FD.basket[k] || 0;
      return `<div class="fo-row"><span class="fo-ico">${it.icon}</span><div class="grow"><b>${esc(it.name)}</b>
        <div class="muted small">${it.energy ? `+${it.energy} energy` : ""}${it.fatigue ? ` · ${it.fatigue < 0 ? "−" : "+"}${Math.abs(it.fatigue)} fatigue` : ""} · ${eurFull(it.foodies)}</div></div>
        <div class="fo-step">${q ? `<button onclick="fdAdd('${k}',-1)">−</button><b>${q}</b>` : ""}<button onclick="fdAdd('${k}',1)">+</button></div></div>`;
    }).join("");
  }).join("");
  return {title:"Foodies", html:`<div class="fo-hero"><b>Hungry?</b><span>Delivered to ${fdWhere()} · ${eurFull(FOODIES_FEE)} delivery</span></div>
    ${pending.length ? `<div class="fo-h">On the way</div>${pending.map(o => `<div class="fo-order"><span>${Object.entries(o.items).map(([k, q]) => `${q}× ${FOOD[k] ? FOOD[k].name : k}`).join(", ")}</span><b>${fmtTime(o.eta % 1440)}</b><em>to ${o.where === "ground" ? "the gym" : "home"}</em></div>`).join("")}` : ""}
    ${groups}
    <div class="fo-foot"><div><span>${tot.n} item${tot.n === 1 ? "" : "s"}${tot.n ? ` + ${eurFull(FOODIES_FEE)} delivery` : ""}</span><b>${eurFull(tot.all)}</b></div>
      <button class="btn sm" ${tot.n && S.money >= tot.all ? "" : "disabled"} onclick="fdOrder()">${tot.n && S.money < tot.all ? "Not enough money" : "Order"}</button></div>`};
};
// the keypad phone gets a stripped-down Foodies: pick something and it is ordered
function kpFoodiesView(){
  return {title:"Foodies", items:Object.entries(FOOD).map(([k, it]) => ({l:`${it.name}`, r:eurFull(it.foodies + FOODIES_FEE), v:k})), soft:["Order", "Back"]};
}
function kpFoodiesPick(k){
  const r = foodiesOrder({[k]:1});
  return r.ok ? `Ordered ${FOOD[k].name}. Arrives about ${fmtTime(r.order.eta % 1440)} at ${r.order.where === "ground" ? "the gym" : "your flat"}.` : r.why;
}
