"use strict";
/* ============ FOODIES: food to your door ============
   Order on the phone, pay now, and it turns up in a while: a bag left at the delivery point you chose, the table in
   your lobby or the training centre's. Dearer than the Mini Market and you have to wait for it, and the bag still has
   to go into a fridge, but you do not have to go shopping.
   Owner: WP-G (Stage 1). Contract: DESIGN 3.8.10 (foodiesOrder(items, where): "Deliver to: Home lobby / Training
   centre" on both phones), 3.8.6 (with couriers running late in the area the app says so). */
const FD = {basket:{}, where:null};
ICONS.foodies = "🍔"; ICON_BG.foodies = "linear-gradient(135deg,#ff6a3a,#ffb347)"; APP_TITLE.foodies = "Foodies";
const FD_TO = {home:"Home lobby", ground:"Training centre"};
function fdTotal(){ let t = 0, n = 0; for (const [k, q] of Object.entries(FD.basket)) if (FOOD[k] && q > 0){ t += FOOD[k].foodies*q; n += q; } return {t, n, all:n ? t + FOODIES_FEE : 0}; }
function fdAdd(k, d){ FD.basket[k] = clamp((FD.basket[k] || 0) + d, 0, 9); smRefresh(); }
// where the next order goes: what you chose, or where you are (the training centre if you are there, home otherwise)
function fdDest(){ return FD.where || (typeof lifeZone === "function" && lifeZone() === "ground" ? "ground" : "home"); }
function fdSetWhere(w){ FD.where = w === "ground" ? "ground" : "home"; smRefresh(); }
// the words for a delivery point (life/parcels.js names them all)
const fdPoint = at => typeof window.lifePointName === "function" ? window.lifePointName(at) : `the ${FD_TO[at === "ground" ? "ground" : "home"].toLowerCase()}`;
const fdLate = () => typeof foodiesLate === "function" && foodiesLate();
function fdOrder(){
  const r = foodiesOrder(FD.basket, fdDest());
  if (!r.ok){ toast(r.why, "bad"); return; }
  FD.basket = {};
  const eta = r.order.eta % 1440;
  if (typeof FEED === "object" && FEED.live()) FEED.chip(`Foodies · arriving about ${fmtTime(eta)} · ${FD_TO[r.order.where]}`, "good"); else toast(`Ordered. Arriving about ${fmtTime(eta)}.`, "good");
  smRefresh();
}
APPVIEWS.foodies = t => {
  if (!S.life){ return {title:"Foodies", html:`<div class="empty">Foodies delivers when you're out and about in the city.</div>`}; }
  const tot = fdTotal(), pending = S.orders.slice().sort((a, b) => a.eta - b.eta), dest = fdDest();
  const groups = FOOD_KINDS.map(([kind, label]) => {
    const items = Object.entries(FOOD).filter(([k, it]) => it.kind === kind);
    return `<div class="fo-h">${label}</div>` + items.map(([k, it]) => {
      const q = FD.basket[k] || 0;
      return `<div class="fo-row"><span class="fo-ico">${it.icon}</span><div class="grow"><b>${esc(it.name)}</b>
        <div class="muted small">${it.energy ? `+${it.energy} energy` : ""}${it.fatigue ? ` · ${it.fatigue < 0 ? "−" : "+"}${Math.abs(it.fatigue)} fatigue` : ""} · ${eurFull(it.foodies)}</div></div>
        <div class="fo-step">${q ? `<button onclick="fdAdd('${k}',-1)">−</button><b>${q}</b>` : ""}<button onclick="fdAdd('${k}',1)">+</button></div></div>`;
    }).join("");
  }).join("");
  const waiting = (S.parcels || []).length;
  return {title:"Foodies", html:`<div class="fo-hero"><b>Hungry?</b><span>Left on ${fdPoint(dest)} · ${eurFull(FOODIES_FEE)} delivery</span></div>
    ${fdLate() ? `<div class="fo-h">Running late today</div><p class="muted small">Couriers in this area are slow today. Orders take up to an hour longer than usual.</p>` : ""}
    <div class="fo-h">Deliver to</div><div class="seg fo-where" role="group" aria-label="Deliver to">${["home", "ground"].map(w => `<button aria-pressed="${dest === w}" onclick="fdSetWhere('${w}')">${FD_TO[w]}</button>`).join("")}</div>
    ${waiting ? `<div class="fo-h">Waiting for you</div>${S.parcels.map(p => `<div class="fo-order"><span>${Object.entries(p.items).map(([k, q]) => `${q}× ${FOOD[k] ? FOOD[k].name : k}`).join(", ")}</span><b>Delivered</b><em>at ${FD_TO[p.at === "ground" ? "ground" : "home"]}</em></div>`).join("")}` : ""}
    ${pending.length ? `<div class="fo-h">On the way</div>${pending.map(o => `<div class="fo-order"><span>${Object.entries(o.items).map(([k, q]) => `${q}× ${FOOD[k] ? FOOD[k].name : k}`).join(", ")}</span><b>${fmtTime(o.eta % 1440)}</b><em>to ${FD_TO[o.where === "ground" ? "ground" : "home"]}${o.late ? " · running late" : ""}</em></div>`).join("")}` : ""}
    ${groups}
    <div class="fo-foot"><div><span>${tot.n} item${tot.n === 1 ? "" : "s"}${tot.n ? ` + ${eurFull(FOODIES_FEE)} delivery` : ""}</span><b>${eurFull(tot.all)}</b></div>
      <button class="btn sm" ${tot.n && S.money >= tot.all ? "" : "disabled"} onclick="fdOrder()">${tot.n && S.money >= tot.all ? `Order to ${FD_TO[dest]}` : tot.n ? "Not enough money" : "Order"}</button></div>`};
};
/* the keypad phone gets a stripped-down Foodies: the first line is where it goes (pick it to switch), then pick
   something and it is ordered */
function kpFoodiesView(){
  const dest = fdDest();
  return {title:"Foodies", items:[{l:`Deliver to: ${FD_TO[dest]}`, r:fdLate() ? "Running late today" : "Switch", v:"@where"}]
    .concat(Object.entries(FOOD).map(([k, it]) => ({l:`${it.name}`, r:eurFull(it.foodies + FOODIES_FEE), v:k}))), soft:["Order", "Back"]};
}
function kpFoodiesPick(k){
  if (k === "@where"){ fdSetWhere(fdDest() === "ground" ? "home" : "ground"); return `Deliveries now go to: ${FD_TO[fdDest()]}. Go back and pick something.`; }
  const r = foodiesOrder({[k]:1}, fdDest());
  return r.ok ? `Ordered ${FOOD[k].name}. Left on ${fdPoint(r.order.where)} at about ${fmtTime(r.order.eta % 1440)}.${r.order.late ? " Couriers are running late today." : ""}` : r.why;
}
