/* ============ LIFE: your flat, the rent and the post ============
   Every career gets its own flat somewhere in the block (floor 1 to 3, door 1 to 4), so nobody's start is the same.
   Your uncle paid the first three months, rent and electricity both. After that a bill for the rent and the month
   before's electricity lands in your mailbox at the start of every month, and you pay it downstairs.

   Owner: WP-G (Stage 1). Contracts: DESIGN 3.8.4 (electricity: S.home.lightBy metered by daily.js utilTick, billed
   here at ELEC_BASE + minutes/60*ELEC_RATE for the month before, nothing for the free months), 1.7 (S.home.light,
   lightBy, the old lightMin migrated by daily.js homeMigrate), 3.7.2 (the welcome letters are written once there is a
   name to write to: lifeWelcomeLetters, called by applyCreation). */
const G = () => (typeof S !== "undefined" ? S : null);
const MONTHS = () => (typeof CAL !== "undefined" && CAL.MONTHS) ? CAL.MONTHS : ["July","August","September","October","November","December","January","February","March","April"];
export const absMonth = s => homeMonth(s);
export const monthOf = m => MONTHS()[((m % 10) + 10) % 10];
const euro = n => "€" + Math.round(n).toLocaleString("en-GB");
// a career that has been made (the intro and the creation screen come before that: no name to write to yet)
const made = s => !(s.flags && s.flags.CharacterCreated === false);

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
    s.home = {floor, door, apt, rent, freeUntil:now + 3, billed:now, bills:[], letters:[], lightBy:{}, welcome:false,
      light:false, curtains:[false, false], seed:Math.floor(Math.random()*1e9), nextId:1};
  }
  if (!s.home.curtains) s.home.curtains = [false, false];
  // a brand-new career (its first day, nothing bought) moves into the worst flat; anything older keeps what it had
  ensureFx(s.home, !s.home.fx && (s.week || 0) === 0 && (s.life.day || 1) <= 1 && !(s.items && (s.items.bed2 || s.items.mattress)));
  // the number on your door ("door" | "floor" | "carried", where it is) and the window the football came through. It
  // is only "carried" while it really is on you (a reload with it in a pocket keeps it there)
  const c = s.carry, onYou = !!c && [c.hand].concat(c.slots || []).some(it => it && it.id === "plate");
  if (s.home.plate === "carried" && !onYou) s.home.plate = "door";
  if (s.home.plate !== "floor" && s.home.plate !== "carried") s.home.plate = "door";
  if (!s.home.win || typeof s.home.win !== "object") s.home.win = {state:"ok", at:0};
  homeMigrate(s.home);
  if (made(s)) welcomeLetters(s);
  return s.home;
}
window.lifeEnsureHome = () => ensureHome();
/* the first two letters in your mailbox: your uncle's welcome and the landlord's terms. Written once, as soon as the
   career has a name (applyCreation calls this; a career from before has had them all along) */
export function welcomeLetters(s = G()){
  const h = s && s.home; if (!h || h.welcome !== false) return false;          // (a flat from before has had them all along)
  h.welcome = true;
  const first = s.player && s.player.name ? s.player.name.split(" ")[0] : "";
  letter(h, "Uncle Nelu", "Welcome to the city",
    `I found you a place${first ? `, ${first}` : ""}. It's small and the boiler makes noises, but it's yours. ` +
    `I've paid the first three months, rent and bills. After that you're on your own. Make me proud.\n\nNelu`);
  letter(h, "The landlord", `Flat ${h.apt}`,
    `Rent is ${euro(h.rent)} a month, plus electricity. Both are covered until the end of ${monthOf(h.freeUntil - 1)}. ` +
    `From then on the bill arrives here at the start of every month. Lights left on cost money.`);
  return true;
}
window.lifeWelcomeLetters = () => welcomeLetters();
/* What is in your flat (furniture.js) and what state it is in: S.home.fx. A new career moves into the worst flat in the
   block: a mattress on the floor, a fridge that wheezes, no table, no chair, no laptop, the wallpaper hanging off and
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
// the electricity on a bill for month m: the month before's light, unless your uncle was paying then
export function elecFor(h, m){
  const used = Math.max(0, +(h.lightBy && h.lightBy[m - 1]) || 0);
  return m - 1 < h.freeUntil ? {used, util:0} : {used, util:ELEC_BASE + Math.round(used/60*ELEC_RATE)};
}

/* a new month means a new letter; returns how many arrived */
export function checkMail(){
  const s = G(), h = s && s.home; if (!h) return 0;
  homeMigrate(h);
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
    if (owed.length) lateNote = ` You still owe ${owed.length === 1 ? "last month" : owed.length + " months"}, so a 10% late fee has been added.`;
    const {used, util} = elecFor(h, m);
    delete h.lightBy[m - 1];
    const bill = {id:h.nextId++, m, rent:h.rent, util, used:Math.round(used), total:h.rent + util, paid:false};
    h.bills.push(bill);
    const elec = util ? `electricity for ${monthOf(m - 1)} ${euro(util)} (${fmtDur(used)} of light)` : `electricity ${euro(0)} (${monthOf(m - 1)} was on your uncle)`;
    letter(h, "The landlord", `Rent for ${monthOf(m)}`, `Rent ${euro(h.rent)} + ${elec} = ${euro(bill.total)}.${lateNote}`, {bill:bill.id});
    if (owed.length >= 2) letter(h, "The landlord", "Final notice", "Three months unpaid. Pay what you owe or I will have to find a new tenant.");
    n++;
  }
  // (old months' meters are of no more use once billed)
  for (const k of Object.keys(h.lightBy || {})) if (+k < h.billed - 1) delete h.lightBy[k];
  h.bills = h.bills.filter(b => !b.paid || b.m > now - 6);
  // three days before the month is out, a reminder for whatever is still unpaid (once a month)
  const day = ((s.week || 0) % 4)*7 + ((s.life && s.life.wd) || 0);        // 0 to 27: a month is four weeks
  const due = h.bills.filter(b => !b.paid);
  if (day >= 25 && due.length && h.reminded !== now){
    h.reminded = now;
    const tot = due.reduce((t, b) => t + b.total, 0);
    letter(h, "The landlord", "Reminder: rent due",
      `Just a reminder that ${euro(tot)} is still owed on flat ${h.apt}. Please pay it before the end of ${monthOf(now)}. A 10% late fee is added after that.`);
    n++;
  }
  return n;
}
export const owed = () => { const h = G() && G().home; return h ? h.bills.filter(b => !b.paid).reduce((a, b) => a + b.total, 0) : 0; };
export const unread = () => { const h = G() && G().home; return h ? h.letters.filter(l => !l.read).length : 0; };
// what paying now would settle: the oldest bills first, as many as the money covers (stopping at the first it cannot)
export function payPlan(){
  const s = G(), h = s && s.home, out = {bills:[], total:0};
  if (!h) return out;
  let left = Math.round(+s.money || 0);
  for (const b of h.bills.filter(b => !b.paid).sort((a, b) => a.m - b.m)){
    if (left < b.total) break;
    left -= b.total; out.bills.push(b); out.total += b.total;
  }
  return out;
}
export function payAll(){
  let paid = 0;
  for (const b of payPlan().bills){ if (!spend(b.total)) break; b.paid = true; paid += b.total; }
  if (typeof save === "function") save();
  return paid;
}

/* ---------- the mailbox, opened ---------- */
let onClose = null;
export function openMail(close){
  const s = G(), h = s.home; onClose = close;
  let el = document.getElementById("lifeMail");
  if (!el){ el = document.createElement("div"); el.id = "lifeMail"; el.className = "lf-mail"; document.getElementById("lifeRoot").appendChild(el); }
  const due = owed(), plan = payPlan();
  const list = h.letters.slice().reverse().map(l => {
    const b = l.bill && h.bills.find(x => x.id === l.bill);
    return `<div class="lm-letter ${l.read ? "" : "new"}"><div class="lm-from">${esc(l.from)}${l.read ? "" : " · new"}</div>
      <b>${esc(l.title)}</b><p>${esc(l.text).replace(/\n/g, "<br>")}</p>${b ? `<span class="lm-tag ${b.paid ? "paid" : "due"}">${b.paid ? "Paid" : "Due " + euro(b.total)}</span>` : ""}</div>`;
  }).join("") || `<p class="lm-empty">Nothing but a pizza leaflet.</p>`;
  // the button pays what payAll pays: the oldest bills first, as far as your money goes
  const label = !due ? "All paid" : !plan.total ? `Need ${euro(h.bills.filter(b => !b.paid).sort((a, b) => a.m - b.m)[0].total)}` : `Pay ${euro(plan.total)}`;
  el.innerHTML = `<div class="lm-card"><div class="lm-head"><div><span>Mailbox</span><b>Flat ${h.apt} · ${esc(s.player.name)}</b></div>
      <button class="lm-x" onclick="lifeCloseMail()">✕</button></div>
    <div class="lm-sum"><div><span>You have</span><b>${euro(s.money)}</b></div><div><span>You owe</span><b class="${due ? "bad" : ""}">${euro(due)}</b></div>
      <button class="btn sm" ${plan.total ? "" : "disabled"} onclick="lifePayRent()">${label}</button></div>
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
