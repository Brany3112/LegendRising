/* ============ LIFE: your flat, the rent and the post ============
   Every career gets its own flat somewhere in the block — floor 1 to 3, door 1 to 4 — so nobody's
   start is the same. Your uncle paid the first three months. After that a bill for the rent and
   the electricity lands in your mailbox at the start of every month, and you pay it downstairs. */
const G = () => (typeof S !== "undefined" ? S : null);
const MONTHS = () => (typeof CAL !== "undefined" && CAL.MONTHS) ? CAL.MONTHS : ["July","August","September","October","November","December","January","February","March","April"];
export const absMonth = s => (s.year || 2026)*10 + Math.floor((s.week || 0)/4);
export const monthOf = m => MONTHS()[((m % 10) + 10) % 10];
const euro = n => "€" + Math.round(n).toLocaleString("en-GB");

export function ensureHome(){
  const s = G(); if (!s) return null;
  s.inv = s.inv || {};
  for (const k of ["drink", "max", "sandwich", "meal"]) s.inv[k] = s.inv[k] || 0;
  if (!s.life) s.life = {day:1, min:7*60};
  if (!s.home){
    // a new career's flat looks onto the street (doors 1 and 2), where the first morning happens (intro.js)
    const fresh = !!(s.flags && !s.flags.FirstTimeIntroductionCompleted);
    const floor = 1 + Math.floor(Math.random()*3), door = 1 + Math.floor(Math.random()*(fresh ? 2 : 4));
    const now = absMonth(s), rent = 55 + 5*Math.floor(Math.random()*5);
    const apt = `${floor}0${door}`;
    s.home = {floor, door, apt, rent, freeUntil:now + 3, billed:now, bills:[], letters:[], lightMin:0,
      light:true, curtains:[false, false], seed:Math.floor(Math.random()*1e9), nextId:1};
    letter(s.home, "Uncle Nelu", "Welcome to the city",
      `I found you a place, ${s.player ? s.player.name.split(" ")[0] : "kid"}. It's small and the boiler makes noises, but it's yours. ` +
      `I've paid the first three months — after that you're on your own. Make me proud. — Nelu`);
    letter(s.home, "The landlord", `Flat ${apt}`,
      `Rent is ${euro(rent)} a month plus electricity. It is covered until the end of ${monthOf(now + 2)}. ` +
      `From then on the bill arrives here at the start of every month. Lights left on cost money.`);
  }
  if (!s.home.curtains) s.home.curtains = [false, false];
  // a brand-new career (its first day, nothing bought) moves into the worst flat; anything older keeps what it had
  ensureFx(s.home, !s.home.fx && (s.week || 0) === 0 && (s.life.day || 1) <= 1 && !(s.items && (s.items.bed2 || s.items.mattress)));
  // the number on your door ("door" | "floor", where it lies) and the window the football came through
  if (s.home.plate !== "floor") s.home.plate = "door";
  if (!s.home.win || typeof s.home.win !== "object") s.home.win = {state:"ok", at:0};
  return s.home;
}
/* What is in your flat (furniture.js) and what state it is in: S.home.fx. A new career moves into the worst flat in the
   block — a mattress on the floor, a fridge that wheezes, no table, no chair, no laptop, the wallpaper hanging off and
   no bulb in the light. A career from before this all existed keeps what it had: the furniture it was living with
   is the tier-2 kind, the bed it bought is better still. */
export function ensureFx(h, fresh){
  if (h.fx && h.fx.v) return h.fx;
  const s = G();
  if (fresh) h.fx = {v:1, paper:"torn", bulb:false, lock:"broken", locked:false, furn:[{id:"bed1"}, {id:"fridge1"}]};
  else {
    const bt = s.items && s.items.bed2 ? 4 : s.items && s.items.mattress ? 3 : 2;
    h.fx = {v:1, paper:"stripe", bulb:true, lock:"broken", locked:false, furn:[{id:"bed" + bt}, {id:"fridge2"}, {id:"table"}, {id:"chair"}, {id:"laptop"}, {id:"rug"}]};
  }
  return h.fx;
}
function letter(h, from, title, text, extra = {}){
  h.letters.push(Object.assign({id:h.nextId++, from, title, text, read:false}, extra));
  if (h.letters.length > 30) h.letters.splice(0, h.letters.length - 30);
}

/* a new month means a new letter; returns how many arrived */
export function checkMail(){
  const s = G(), h = s && s.home; if (!h) return 0;
  const now = absMonth(s); let n = 0;
  while (h.billed < now){
    h.billed++; const m = h.billed;
    if (m < h.freeUntil){
      if (m === h.freeUntil - 1){ letter(h, "Uncle Nelu", "Last month on me", `This is the last month I've paid. From ${monthOf(m + 1)} the rent is yours: ${euro(h.rent)} plus electricity. Don't let me down.`); n++; }
      continue;
    }
    const owed = h.bills.filter(b => !b.paid);
    let lateNote = "";
    for (const b of owed) if (!b.late){ b.late = Math.max(1, Math.round(b.total*.1)); b.total += b.late; }
    if (owed.length) lateNote = ` You still owe ${owed.length === 1 ? "last month" : owed.length + " months"} — a 10% late fee has been added.`;
    const util = 9 + Math.round((h.lightMin || 0)/60*.35); h.lightMin = 0;
    const bill = {id:h.nextId++, m, rent:h.rent, util, total:h.rent + util, paid:false};
    h.bills.push(bill);
    letter(h, "The landlord", `Rent for ${monthOf(m)}`, `Rent ${euro(h.rent)} + electricity ${euro(util)} = ${euro(bill.total)}.${lateNote}`, {bill:bill.id});
    if (owed.length >= 2) letter(h, "The landlord", "Final notice", "Three months unpaid. Pay what you owe or I will have to find a new tenant.");
    n++;
  }
  h.bills = h.bills.filter(b => !b.paid || b.m > now - 6);
  // three days before the month is out, a reminder for whatever is still unpaid (once a month)
  const day = ((s.week || 0) % 4)*7 + ((s.life && s.life.wd) || 0);        // 0–27: a month is four weeks
  const due = h.bills.filter(b => !b.paid);
  if (day >= 25 && due.length && h.reminded !== now){
    h.reminded = now;
    const tot = due.reduce((t, b) => t + b.total, 0);
    letter(h, "The landlord", "Reminder: rent due",
      `Just a reminder that ${euro(tot)} is still owed on flat ${h.apt}. Please pay it before the end of ${monthOf(now)} — a 10% late fee is added to anything still unpaid when the next bill goes out.`);
    n++;
  }
  return n;
}
export const owed = () => { const h = G() && G().home; return h ? h.bills.filter(b => !b.paid).reduce((a, b) => a + b.total, 0) : 0; };
export const unread = () => { const h = G() && G().home; return h ? h.letters.filter(l => !l.read).length : 0; };
export function payAll(){
  const s = G(), h = s.home; let paid = 0;
  for (const b of h.bills.filter(b => !b.paid).sort((a, b) => a.m - b.m)){
    if (s.money < b.total) break;
    s.money -= b.total; b.paid = true; paid += b.total;
  }
  if (typeof save === "function") save();
  return paid;
}

/* ---------- the mailbox, opened ---------- */
let onClose = null;
export function openMail(close){
  const s = G(), h = s.home; onClose = close;
  let el = document.getElementById("lifeMail");
  if (!el){ el = document.createElement("div"); el.id = "lifeMail"; el.className = "lf-mail"; document.getElementById("lifeRoot").appendChild(el); }
  const due = owed();
  const list = h.letters.slice().reverse().map(l => {
    const b = l.bill && h.bills.find(x => x.id === l.bill);
    return `<div class="lm-letter ${l.read ? "" : "new"}"><div class="lm-from">${esc(l.from)}${l.read ? "" : " · new"}</div>
      <b>${esc(l.title)}</b><p>${esc(l.text)}</p>${b ? `<span class="lm-tag ${b.paid ? "paid" : "due"}">${b.paid ? "Paid" : "Due " + euro(b.total)}</span>` : ""}</div>`;
  }).join("") || `<p class="lm-empty">Nothing but a pizza leaflet.</p>`;
  el.innerHTML = `<div class="lm-card"><div class="lm-head"><div><span>Mailbox</span><b>Flat ${h.apt} · ${esc(s.player.name)}</b></div>
      <button class="lm-x" onclick="lifeCloseMail()">✕</button></div>
    <div class="lm-sum"><div><span>You have</span><b>${euro(s.money)}</b></div><div><span>You owe</span><b class="${due ? "bad" : ""}">${euro(due)}</b></div>
      <button class="btn sm" ${due && s.money >= Math.min(...h.bills.filter(b => !b.paid).map(b => b.total)) ? "" : "disabled"} onclick="lifePayRent()">${due ? "Pay " + euro(due) : "All paid"}</button></div>
    <div class="lm-list">${list}</div><div class="lm-foot">Esc to close</div></div>`;
  el.classList.add("on");
  for (const l of h.letters) l.read = true;
  if (typeof save === "function") save();
}
export function closeMail(){
  const el = document.getElementById("lifeMail"); if (el) el.classList.remove("on");
  const f = onClose; onClose = null; if (f) f();
}
export const mailOpen = () => { const el = document.getElementById("lifeMail"); return !!(el && el.classList.contains("on")); };
function esc(t){ return String(t).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c])); }
window.lifeCloseMail = () => closeMail();
window.lifePayRent = () => {
  const p = payAll();
  if (p && window.lifeNote) window.lifeNote(`Paid ${euro(p)}. The landlord will be pleased.`);
  openMail(onClose);
};
