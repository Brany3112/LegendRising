"use strict";
/* ============ PANELS IN THE WORLD ============
   The things you open by walking up to them: the club computer (and the laptop at home), the Mini
   Market till and the vending machine, a bench to wait on, the clock-in terminal at work, and the
   card before you sleep. They all share one frame, one look, and Esc to close. */
const LP = {open:false, kind:"", tab:"today", onClose:null, busy:false};
const pctOf = (v, max) => clamp(100*num(v, 0)/(max || 1), 0, 100);
const pbar = (pct, cls) => `<div class="pb ${cls || ""}"><i style="width:${clamp(num(pct, 0), 0, 100).toFixed(1)}%"></i></div>`;
function lpShow(kind, html, o = {}){
  const el = $("#lifePanel"); if (!el) return;
  const same = LP.open && LP.kind === kind;
  if (same){ morph(el.querySelector(".lpn"), html); return; }
  el.className = `lf-panel ${kind}`;
  el.innerHTML = `<div class="lpn-back" onclick="lpClose()"></div><div class="lpn">${html}</div>`;
  void el.offsetWidth; el.classList.add("on");
  LP.open = true; LP.kind = kind; LP.onClose = o.onClose || null;
  if (window.lifeModalSet) window.lifeModalSet(true);
}
function lpClose(silent){
  if (!LP.open || LP.busy) return;
  const el = $("#lifePanel"); if (el){ el.classList.remove("on"); setTimeout(() => { if (!LP.open) el.innerHTML = ""; }, 260); }
  LP.open = false; const cb = LP.onClose; LP.onClose = null; const kind = LP.kind; LP.kind = "";
  if (window.lifeModalSet) window.lifeModalSet(false);
  if (cb) cb(kind);
  if (!silent && typeof save === "function") save();
}
window.lifePanelOpen = () => LP.open;
window.lifePanelClose = () => lpClose();
const lpHead = (title, sub, right) => `<div class="lpn-head"><div><span class="lpn-eyebrow">${esc(sub || "")}</span><h3>${esc(title)}</h3></div>${right || ""}<button class="lpn-x" onclick="lpClose()" aria-label="Close">✕</button></div>`;
const meterRow = (label, val, max, cls, right) => `<div class="mrow"><span>${esc(label)}</span>${pbar(pctOf(val, max), cls)}<b>${right != null ? right : Math.round(num(val, 0))}</b></div>`;

/* =============================== the computer =============================== */
function openComputer(where){ LP.where = where; if (!LP.tab) LP.tab = "today"; renderComputer(); }
function pcTab(t){ LP.tab = t; renderComputer(); const b = document.querySelector("#lifePanel .pc-body"); if (b) b.scrollTop = 0; }
function renderComputer(){
  const c = myClub(), tabs = [["today", "Today"], ["skills", "Skills"], ["career", "Career"], ["you", "You"], ["week", "This week"]];
  const body = {today:pcToday, skills:pcSkills, career:pcCareer, you:pcYou, week:pcWeek}[LP.tab] || pcToday;
  lpShow("pc", `<div class="pc">
    <div class="pc-bar">${c ? crest(c.nm, 26) : ""}<div class="pc-brand"><b>${LP.where === "home" ? "MY LAPTOP" : "CLUB PORTAL"}</b><span>${esc(c ? c.nm : "Free agent")} · ${esc(S.player.name)}</span></div>
      <div class="pc-clock"><b>${fmtTime(S.life.min)}</b><span>${todayName()}</span></div><button class="lpn-x" onclick="lpClose()" aria-label="Close">✕</button></div>
    <div class="pc-main"><nav class="pc-nav">${tabs.map(([k, l]) => `<button class="${LP.tab === k ? "on" : ""}" onclick="pcTab('${k}')">${l}${k === "skills" && S.sp ? `<i>${S.sp}</i>` : ""}</button>`).join("")}</nav>
      <div class="pc-body">${body()}</div></div></div>`);
}
function matchCard(f, big){
  const me = meP(), home = f.kind === "N" ? f.h === me.nat : f.h === me.club, slot = fixtureSlot(f);
  const hn = sideName(f, "h"), an = sideName(f, "a"), d = W.done[f.key];
  return `<div class="pc-match ${big ? "big" : ""}">
    <div class="pm-side"><span>HOME</span>${f.kind !== "N" ? crest(hn, big ? 44 : 30) : ""}<b class="${home ? "me" : ""}">${esc(hn)}</b></div>
    <div class="pm-mid">${d ? `<b class="pm-score">${d.hg} – ${d.ag}</b><span>Full time</span>` : `<b>VS</b><span>${fmtTime(slot.min)}</span>`}</div>
    <div class="pm-side"><span>AWAY</span>${f.kind !== "N" ? crest(an, big ? 44 : 30) : ""}<b class="${!home ? "me" : ""}">${esc(an)}</b></div>
  </div><div class="pm-comp">${esc(compLabel(f))}${d ? "" : ` · ${dayName(slot.wd)} · tunnel opens ${fmtTime(slot.min - TUNNEL_OPEN)}`}</div>`;
}
function pcToday(){
  const f = todaysFixture(true), nf = nextFixture(), a = S.life.att, td = trainingDay();
  let sched = "";
  if (f){
    sched = `<div class="pc-card hl"><div class="pc-h">${f.done ? "Today's match" : "Match today"}</div>${matchCard(f, true)}
      ${!f.done ? `<p class="pc-note">${meP().inj > 0 ? "You're injured — you'll watch this one." : (S.ban || 0) > 0 ? `Suspended — ${S.ban} game${S.ban === 1 ? "" : "s"} to sit out.` : "Walk out of the tunnel at the training ground before kick-off."}</p>` : ""}</div>`;
  } else {
    const st = !td ? "" : a.status === "ontime" ? `<span class="tag good">On time</span>` : a.status === "late" ? `<span class="tag bad">Late</span>` : S.life.min >= SESSION.end ? `<span class="tag bad">Missed</span>` : `<span class="tag">Not checked in</span>`;
    sched = `<div class="pc-card"><div class="pc-h">Today</div>
      <div class="pc-sched"><div><span>Training</span><b>${td ? `${fmtTime(SESSION.start)} – ${fmtTime(SESSION.end)}` : "No session"}</b>${st}</div><div><span>Match</span><b>No match</b></div></div>
      ${nf ? `<div class="pc-next"><span>Next match · ${dayName(fixtureSlot(nf).wd)} ${fmtTime(fixtureSlot(nf).min)}</span><b>vs ${esc(oppName(nf))}</b></div>` : `<div class="pc-next"><span>No more matches this week</span></div>`}</div>`;
  }
  const eff = Math.round(trainEff()*100);
  const tips = [];
  if (f && !f.done && S.fatigue > 55) tips.push("Tired legs cost you on the pitch. Rest before kick-off — sit, nap, or an ice bath.");
  if (f && !f.done && S.energy < 50) tips.push("Eat a proper meal before the match.");
  if (!f && S.energy < 35) tips.push("You're running low. Eat something before you train.");
  if (!f && S.fatigue > 70) tips.push("Training now is worth less and tires you out more. Rest first.");
  if (!tips.length) tips.push(td && S.life.min < SESSION.start ? `Be at the training ground by ${fmtTime(SESSION.start)}. The bus takes 40 minutes.` : "Food keeps your energy up. Sleep is what clears fatigue.");
  const ord = S.orders.slice().sort((x, y) => x.eta - y.eta);
  return `<div class="pc-hero"><div><span class="pc-dow">${todayName()}</span><b class="pc-tm">${fmtTime(S.life.min)}</b></div>
      <div class="pc-meta">Week ${S.week + 1} of ${CAL.W} · ${monthName(S.week)} ${calYear(S.week)}<br>Season ${W.season}</div></div>
    ${sched}
    <div class="pc-grid2">
      <div class="pc-card"><div class="pc-h">Your body</div>
        ${meterRow("Energy", S.energy, 100, "en", `${Math.round(S.energy)}`)}<div class="pc-lab">${energyLabel()}</div>
        ${meterRow("Fatigue", S.fatigue, 100, "fa", `${Math.round(S.fatigue)}`)}<div class="pc-lab">${fatigueLabel()}</div>
        <div class="pc-eff">Training effect right now <b>${eff}%</b></div></div>
      <div class="pc-card"><div class="pc-h">At the club</div>
        ${meterRow("Team Chemistry", S.chem, 100, "chem", `${Math.round(S.chem)}`)}<div class="pc-lab">${chemLabel()}</div>
        ${meterRow("Manager trust", S.trust + 30, 110, "trust", `${Math.round(S.trust)}`)}<div class="pc-lab">${roleOutlook()}</div>
        <div class="pc-eff">Wage <b>${S.contract ? eur(S.contract.wage) + "/wk" : "—"}</b> · Money <b>${eurFull(S.money)}</b></div></div>
    </div>
    <div class="pc-card"><div class="pc-h">Advice</div>${tips.map(t => `<p class="pc-tip">${esc(t)}</p>`).join("")}</div>
    ${ord.length ? `<div class="pc-card"><div class="pc-h">Foodies orders</div>${ord.map(o => `<div class="pc-row"><span>${Object.entries(o.items).map(([k, q]) => `${q}× ${FOOD[k] ? FOOD[k].name : k}`).join(", ")}</span><b>${fmtTime(o.eta % 1440)}</b></div>`).join("")}</div>` : ""}`;
}
function pcSkills(){
  return `<div class="pc-hero slim"><div><span class="pc-dow">Overall</span><b class="pc-tm">${overall()}</b></div>
      <div class="pc-meta">Level ${S.level} · ${S.xp}/${xpNeed()} XP<br><b class="${S.sp ? "lime" : ""}">${S.sp} skill point${S.sp === 1 ? "" : "s"} to spend</b></div></div>
    <div class="pc-skills">${SKILLS.map(([k, n]) => {
      const v = num(S.skills[k], 0), xp = num(S.skillXp[k], 0), need = skillNeed(k), cost = skillCost(v), pct = v >= 99 ? 100 : pctOf(xp, need);
      return `<div class="sk"><div class="sk-top"><b>${esc(n)}</b><em>${v}</em></div>${pbar(pct, "xp")}
        <div class="sk-foot"><span>${v >= 99 ? "Maxed" : `${Math.round(xp)} / ${need} XP`}</span><span class="sk-how">${esc(SKILL_HOW[k] || "")}</span>
        ${S.sp >= cost && v < 99 ? `<button class="sk-up" onclick="A.up('${k}');renderComputer()">+1 · ${cost} pt${cost > 1 ? "s" : ""}</button>` : ""}</div></div>`; }).join("")}</div>`;
}
function pcCareer(){
  const k = S.contract, js = jobState(), {job, rank} = myJob(), top = jobIsTop(), me = meP(), sm = S.seasonMy, cm = S.careerMy;
  return `<div class="pc-grid2">
    <div class="pc-card"><div class="pc-h">Contract</div>
      ${k ? `<div class="pc-row"><span>Club</span><b>${esc(myClub() ? myClub().nm : "—")}${k.loan ? " (loan)" : ""}</b></div><div class="pc-row"><span>Wage</span><b>${eur(k.wage)}/week</b></div>
      <div class="pc-row"><span>Years left</span><b>${k.years}</b></div><div class="pc-row"><span>Role promised</span><b>${ROLE[k.role]}</b></div>` : `<p class="pc-tip">No contract.</p>`}
      <div class="pc-row"><span>Money</span><b class="gold">${eurFull(S.money)}</b></div><div class="pc-row"><span>Market value</span><b>${eur(marketValue(me))}</b></div></div>
    <div class="pc-card"><div class="pc-h">Day job</div>
      <div class="pc-job"><span class="ji">${job.icon}</span><div><b>${esc(rank.name)}</b><span>${esc(job.name)}</span></div></div>
      ${top ? `<p class="pc-tip">Top of the ladder. Every shift is just pay now.</p>` : `${pbar(pctOf(js.xp, jobNeed()), "job")}<div class="pc-row"><span>To promotion</span><b>${js.xp} / ${jobNeed()} XP</b></div>`}
      <div class="pc-row"><span>Pay per 4-hour shift</span><b>${payRange(rank)}</b></div><div class="pc-row"><span>Shifts worked</span><b>${fmt(js.shifts || 0)}</b></div></div>
  </div>
  <div class="pc-grid2">
    <div class="pc-card"><div class="pc-h">This season</div>
      <div class="pc-stats"><span><b>${sm.apps}</b>apps</span><span><b>${sm.goals}</b>goals</span><span><b>${sm.assists}</b>assists</span><span><b>${sm.apps ? (sm.ratingSum/sm.apps).toFixed(2) : "–"}</b>avg</span></div></div>
    <div class="pc-card"><div class="pc-h">Career</div>
      <div class="pc-stats"><span><b>${cm.apps}</b>apps</span><span><b>${cm.goals}</b>goals</span><span><b>${cm.assists}</b>assists</span><span><b>${cm.motm}</b>MotM</span></div></div>
  </div>
  <div class="pc-card"><div class="pc-h">Reputation</div><div class="pc-row"><span>League</span><b>${fmt(me.rep)}</b></div><div class="pc-row"><span>World</span><b>${fmt(me.wrep)}</b></div>
    <div class="pc-row"><span>Position</span><b>${esc(POSITIONS[S.player.teamPos] ? POSITIONS[S.player.teamPos].name : POS[S.player.pos].name)}</b></div>${S.player.pref && S.player.pref !== S.player.teamPos ? `<div class="pc-row"><span>Preferred</span><b>${esc(POSITIONS[S.player.pref].name)}</b></div>` : ""}<div class="pc-row"><span>Age</span><b>${S.player.age}</b></div></div>`;
}
function pcYou(){
  const T = S.traits;
  const say = T.team >= 62 ? "Team-mates see you as someone who makes the right pass." : T.team <= 38 ? "Some in the dressing room think you only look for your own goal." : "The lads are still making their minds up about you.";
  const say2 = T.dec >= 62 ? "Coaches like how you read situations." : T.dec <= 38 ? "You've forced a few things lately." : "";
  const L = S.player.look || {}, hairN = (LOOK_OPT.hair.find(h => h[0] === L.hair) || [, ""])[1], buildN = (LOOK_OPT.build.find(b => b[0] === L.build) || [, ""])[1];
  return `<div class="pc-card pc-look"><div><div class="pc-h">Your look</div>
      <p class="pc-tip">${esc(buildN)} build · ${Math.round(180*num(L.height, 1))} cm · ${esc(hairN.toLowerCase())} hair</p></div>
      <button class="btn sm" onclick="openLookEditor('pc')">Change your look</button></div>
  <div class="pc-card"><div class="pc-h">Personality</div>
    <p class="pc-tip">Built slowly from what you do on the pitch — who you pass to, when you shoot, how you handle the big moments.</p>
    ${TRAIT_KEYS.map(k => `<div class="tr"><div class="tr-top"><span>${TRAIT_NAME[k]}</span><b>${traitLabel(k)}</b></div>${pbar(S.traits[k], "trait")}
      <div class="tr-ends"><span>${{team:"Selfish", conf:"Hesitant", dec:"Rash", risk:"Responsible"}[k]}</span><span>${{team:"Team-first", conf:"Confident", dec:"Reads the game", risk:"Risk-taker"}[k]}</span></div></div>`).join("")}</div>
  <div class="pc-card"><div class="pc-h">In the dressing room</div>${meterRow("Team Chemistry", S.chem, 100, "chem", `${Math.round(S.chem)}`)}
    <p class="pc-tip">${esc(say)} ${esc(say2)}</p>
    <p class="pc-tip muted">Chemistry grows by being at training with the squad and by playing for the team. The higher it is, the more the ball tends to find you — but nobody gets it every minute.</p></div>`;
}
function pcWeek(){
  const fx = weekFixtures();
  return `<div class="pc-week">${DOW.map((d, i) => {
    const f = fx.find(x => fixtureSlot(x).wd === i), today = i === S.life.wd, past = i < S.life.wd, train = !f && i < 5 && !!myClub();
    const dn = f ? W.done[f.key] : null;
    return `<div class="wd ${today ? "today" : ""} ${past ? "past" : ""} ${f ? "match" : train ? "train" : "rest"}">
      <span class="wd-d">${d.slice(0, 3)}</span>
      <i class="wd-ico">${f ? "⚽" : train ? "▲" : "☾"}</i>
      <b>${f ? (dn ? `${dn.hg}–${dn.ag}` : fmtTime(fixtureSlot(f).min)) : train ? "Training" : "Rest"}</b>
      <span class="wd-sub">${f ? `vs ${esc(oppName(f))}` : train ? `${fmtTime(SESSION.start)}–${fmtTime(SESSION.end)}` : "Day off"}</span></div>`; }).join("")}</div>
    <div class="pc-card"><div class="pc-h">How the week works</div>
      <p class="pc-tip">Team training runs ${fmtTime(SESSION.start)} to ${fmtTime(SESSION.end)} on weekdays without a match. Turn up on time and stay for the session — the manager notices, and so do your team-mates.</p>
      <p class="pc-tip">Sleeping takes you to the next morning. The week turns over in the night from Sunday to Monday, and that is when your wage is paid.</p></div>`;
}

/* =============================== the Mini Market and the vending machine =============================== */
function openShop(kind){ LP.shop = kind || "market"; LP.shopCat = LP.shopCat || "food"; renderShop(); }
function shopCat(c){ LP.shopCat = c; renderShop(); }
function renderShop(){
  const vend = LP.shop === "vend", cats = vend ? [["all", "Everything"]] : FOOD_KINDS;
  const list = Object.entries(FOOD).filter(([k, it]) => vend ? ["water", "iso", "drink", "max", "shake", "fruit"].includes(k) : it.kind === LP.shopCat);
  const price = it => vend ? it.store + 1 : it.store;
  const fx = it => [it.energy ? `<span class="fx en">+${it.energy} energy</span>` : "", it.fatigue ? `<span class="fx fa">${it.fatigue < 0 ? "−" : "+"}${Math.abs(it.fatigue)} fatigue</span>` : "",
    it.kind === "energy" ? `<span class="fx warn">wears off</span>` : ""].join("");
  lpShow("shop", `${lpHead(vend ? "Vending machine" : "Mini Market", vend ? "Gym · pay by card" : "Open 24/7 · on your street", `<div class="shop-money"><span>You have</span><b>${eurFull(S.money)}</b></div>`)}
    ${vend ? "" : `<div class="shop-tabs">${cats.map(([k, l]) => `<button class="${LP.shopCat === k ? "on" : ""}" onclick="shopCat('${k}')">${l}</button>`).join("")}</div>`}
    <div class="shop-grid">${list.map(([k, it]) => `<div class="shop-it">
      <div class="si-ico">${it.icon}</div><div class="si-main"><b>${esc(it.name)}</b><div class="si-fx">${fx(it)}</div><span class="si-own">In your fridge: ${S.inv[k] || 0}</span></div>
      <div class="si-buy"><b class="si-price">${eurFull(price(it))}</b>
        <button class="btn sm" ${S.money >= price(it) ? "" : "disabled"} onclick="shopBuy('${k}',false)">${vend ? "Buy" : "Buy"}</button>
        <button class="btn sm ghost" ${S.money >= price(it) ? "" : "disabled"} onclick="shopBuy('${k}',true)">${it.kind === "food" ? "Eat now" : it.name === "Muscle rub" ? "Use now" : "Drink now"}</button></div></div>`).join("")}</div>
    <p class="lpn-foot">${vend ? "A little dearer than the shop. " : ""}What you buy goes in your fridge — the one at home and the one in the gym hold the same food. Energy drinks give a quick lift, then wear off. Proper food lasts.</p>`,
    {onClose:() => { if (window.lifePass) window.lifePass(vend ? 2 : 6, "shop"); }});
}
function shopBuy(k, now){
  const it = FOOD[k]; if (!it) return;
  const p = LP.shop === "vend" ? it.store + 1 : it.store;
  if (!spend(p)) return FEED.chip("Not enough money", "bad");
  S.inv[k] = (S.inv[k] || 0) + 1;
  if (now){
    const r = consume(k);
    if (!r.ok){ FEED.chip(r.why, "bad"); }
    else FEED.chip(`${it.name} · ${r.gain ? `+${r.gain} energy` : ""}${r.fat ? ` ${r.fat < 0 ? "−" : "+"}${Math.abs(r.fat)} fatigue` : ""}`.trim(), "good");
  }
  if (window.lifeFridgeChanged) window.lifeFridgeChanged();
  renderShop();
}

/* =============================== a bench: let time pass =============================== */
function openWait(where){
  const m = S.life.min, opts = [[30, "30 minutes"], [60, "1 hour"], [120, "2 hours"]];
  const td = trainingDay(), f = todaysFixture();
  if (td && m < SESSION.start) opts.unshift([SESSION.start - m, `Until training · ${fmtTime(SESSION.start)}`]);
  const o = nextOrder(); if (o && o.eta > absNow()) opts.unshift([o.eta - absNow(), `Until your Foodies order · ${fmtTime(o.eta % 1440)}`]);
  if (f){ const open = fixtureSlot(f).min - TUNNEL_OPEN; if (m < open) opts.unshift([open - m, `Until the tunnel opens · ${fmtTime(open)}`]); }
  lpShow("wait", `${lpHead("Take a seat", ({gym:"Gym · bench", park:"Park bench · Bulevardul Gării", square:`Bench · Piața ${PLACES.hood}`})[where] || "Training ground · bench")}
    <p class="lpn-p">Sitting down eases fatigue a little and lets the clock run. It's ${fmtTime(m)}.</p>
    <div class="wait-list">${opts.slice(0, 5).map(([mins, l]) => `<button class="wait-opt" onclick="waitGo(${Math.round(mins)})"><b>${esc(l)}</b><span>${Math.round(mins) >= 60 ? `${Math.floor(mins/60)}h ${Math.round(mins) % 60 ? Math.round(mins) % 60 + "m" : ""}` : Math.round(mins) + " min"}</span></button>`).join("")}</div>
    <p class="lpn-foot">Fatigue ${Math.round(S.fatigue)} · Energy ${Math.round(S.energy)} — you'll get a little hungrier while you wait.</p>`);
}
function waitGo(mins){
  lpClose(true);
  if (window.lifeWaitFor) window.lifeWaitFor(mins);
}

/* =============================== the bus: Line 14 ===============================
   Three stops: your street, the training centre and Dumbrava. Where to, how long it takes (game.js BUS_ROUTES) and
   when you would get there; the clock runs while you ride (life/world.js bus). */
const BUS_STOPS = {home:{name:"Strada Teiului", sub:`${PLACES.city} · home`, icon:"🏠"}, ground:{name:"Team Training Center", sub:"The club's training ground", icon:"⚽"},
  town:{name:PLACES.town, sub:`Strada Mare · ${PLACES.hood} · Casa Nova`, icon:"🏘"}};
const busDur = m => m >= 60 ? `${Math.floor(m/60)} HOUR${m >= 120 ? "S" : ""}${m % 60 ? ` ${m % 60} MINUTES` : ""}` : `${m} MINUTES`;
function openBus(from){
  const m = S.life.min, R = BUS_ROUTES[from] || {}, td = trainingDay(), f = todaysFixture();
  const js = jobState(), jw = JOB_WHERE[js.id];
  const why = k => k === "ground" ? (f ? "Match day" : td && m < SESSION.end ? `Training ${fmtTime(SESSION.start)}` : "") : jw && jw.zone === k && k !== "home" ? "Your job" : "";
  const order = ["ground", "town", "home"].filter(k => k !== from && R[k]);
  lpShow("bus", `${lpHead("Line 14", `Bus stop · ${BUS_STOPS[from] ? BUS_STOPS[from].name : ""}`)}
    <p class="lpn-p">Where to? It's ${fmtTime(m)} — the clock runs on while you ride.</p>
    <div class="wait-list bus-list">${order.map(k => `<button class="wait-opt bus-opt" onclick="busGo('${k}')"><i>${BUS_STOPS[k].icon}</i><b>${esc(BUS_STOPS[k].name)}<em>${esc([BUS_STOPS[k].sub, why(k)].filter(Boolean).join(" · "))}</em></b><span>${busDur(R[k])}<em>arrive ${fmtTime(m + R[k])}</em></span></button>`).join("")}</div>
    <p class="lpn-foot">Hungry or tired? Sort it before you go — there's nothing to eat on the bus.</p>`);
}
function busGo(to){
  lpClose(true);
  if (window.lifeBus) setTimeout(() => window.lifeBus(to), 60);
}

/* =============================== work: clock in =============================== */
function openShift(){
  const js = jobState(), {job, rank} = myJob(), top = jobIsTop(), m = S.life.min;
  const p2 = shiftPlan(2), p4 = shiftPlan(4), late = !shiftOpen(m) || !shiftOpen(m + 120), late4 = !shiftOpen(m + 240);
  const tired = S.energy < 12;
  lpShow("shift", `${lpHead(job.name, "Clock in")}
    <div class="shift-top"><span class="ji">${job.icon}</span><div><b>${esc(rank.name)}</b><span>${esc(rank.blurb || "")}</span></div></div>
    ${top ? `<p class="lpn-p">You're at the top of the ladder — shifts are just pay now.</p>` : `${pbar(pctOf(js.xp, jobNeed()), "job")}<div class="pc-row"><span>Experience</span><b>${js.xp} / ${jobNeed()} XP</b></div>`}
    <div class="shift-opts">
      <button class="shift-opt" ${late || tired ? "disabled" : ""} onclick="shiftGo(2)"><b>2-hour shift</b><span>${eurFull(Math.round(p2.pay*.7))}–${eurFull(Math.round(p2.pay*1.25))} · up to +${Math.round(p2.xp*1.4*1.2)} XP</span><em>until about ${fmtTime(m + 120)}</em></button>
      <button class="shift-opt" ${late4 || tired ? "disabled" : ""} onclick="shiftGo(4)"><b>4-hour shift</b><span>${eurFull(Math.round(p4.pay*.7))}–${eurFull(Math.round(p4.pay*1.25))} · up to +${Math.round(p4.xp*1.4*1.2)} XP</span><em>until about ${fmtTime(m + 240)}</em></button>
    </div>
    <p class="lpn-p shift-how">You do the work: how well you do it sets the pay and the XP, and quick work gets you out early. Esc clocks you out, paid for what you've done.</p>
    <p class="lpn-foot">${tired ? "You're too hungry to work. Eat something first." : late ? "We close at 11:00 PM — come back tomorrow from 7:00 AM." : `Work burns energy and adds fatigue. ${trainEff() < .75 ? "You're tired, so you'll learn less on this shift." : ""}`}</p>`);
}
function shiftGo(hours){
  const plan = shiftPlan(hours);
  lpClose(true);
  if (window.lifeShift) window.lifeShift(plan);
}

/* =============================== before bed =============================== */
function openDaySummary(onSleep){
  const d = daySummary(), sk = d.best ? skillName(d.best.k) : "";
  const row = (l, v, cls) => `<div class="ds-row"><span>${esc(l)}</span><b class="${cls || ""}">${v}</b></div>`;
  const sign = n => n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
  lpShow("day", `<div class="ds">
    <div class="ds-eyebrow">${todayName()} · ${fmtTime(S.life.min)}</div><h2>Day complete</h2>
    <div class="ds-rows">
      ${row("Training XP", d.xp ? `+${d.xp}${sk ? ` <small>mostly ${esc(sk)}</small>` : ""}` : "—")}
      ${row("Job XP", d.jobXp ? `+${d.jobXp}` : "—")}
      ${row("Money earned", d.earned ? `+${eurFull(d.earned)}` : "—", d.earned ? "good" : "")}
      ${row("Money spent", d.spent ? `−${eurFull(d.spent)}` : "—")}
      ${row("Food & drink", d.eaten ? `${d.eaten} item${d.eaten === 1 ? "" : "s"} · +${d.food} energy` : "Nothing", d.eaten ? "" : "bad")}
      ${row("Energy", `${d.energy} <small>${energyLabel(d.energy)}</small>`)}
      ${row("Fatigue", `${d.fatigue} <small>${fatigueLabel(d.fatigue)}</small>`)}
      ${row("Team Chemistry", sign(d.chem), d.chem > 0 ? "good" : d.chem < 0 ? "bad" : "")}
      ${row("Manager trust", sign(d.trust), d.trust > 0 ? "good" : d.trust < 0 ? "bad" : "")}
    </div>
    <p class="ds-next">${tomorrowLine()}</p>
    <div class="ds-btns"><button class="btn ghost" onclick="lpClose()">Not yet</button><button class="btn" onclick="daySleep()">Sleep until 7:00 AM</button></div></div>`,
    {onClose:null});
  LP.sleepFn = onSleep;
}
function daySleep(){ const f = LP.sleepFn; LP.sleepFn = null; lpClose(true); if (f) f(); }
function tomorrowLine(){
  const wd = (S.life.min < 5*60 ? S.life.wd : (S.life.wd + 1) % 7);
  if (wd === 0 && S.life.min >= 5*60) return `Tomorrow is Monday — a new week, and your wage goes in.`;
  const f = weekFixtures().find(x => !x.done && fixtureSlot(x).wd === wd);
  if (f) return `Tomorrow: match day · ${fmtTime(fixtureSlot(f).min)} vs ${oppName(f)}. Rest up and eat well.`;
  if (trainingDay(wd)) return `Tomorrow: training at ${fmtTime(SESSION.start)}. The bus takes 40 minutes.`;
  return `Tomorrow is ${dayName(wd)} — no team training.`;
}

/* =============================== your look =============================== */
/* The appearance editor: in the world (the bathroom mirror, the computer) it is a panel; on the creation screen the
   same controls sit in a card. Every control edits LK.draft and the preview follows; nothing is kept until "Save".
   The 3D preview is js/life/look.js (window.LookPreview), a canvas of its own. */
const LK = {draft:null, kind:"casual", view:"front", where:"", saved:false, o:null, only:null};
const lkHex = c => "#" + (num(c, 0) >>> 0).toString(16).padStart(6, "0").slice(-6);
function lkPreview(){
  const el = document.getElementById("lkStage"); if (!el || !LK.draft) return;
  const go = P => P.show(el, LK.draft, LK.kind, LK.view, LK.o);
  if (window.LookPreview) go(window.LookPreview);
  else import("../life/look.js").then(m => { if (el.isConnected) go(m.LookPreview); }).catch(() => { el.classList.add("off"); });
}
function lkUpdate(){ if (window.LookPreview) window.LookPreview.update(LK.draft, LK.kind, LK.o); }
const lkSw = (key, list, cur, label) => `<div class="lk-sw" role="group" aria-label="${esc(label)}">${list.map((c, i) => `<button style="--c:${lkHex(c)}" aria-label="${esc(label)} ${i + 1} of ${list.length}" aria-pressed="${c === cur}" onclick="lkSet('${key}',${c},this)"></button>`).join("")}</div>`;
const lkChips = (key, list, cur, label) => `<div class="seg wrap lk-chips" role="group" aria-label="${esc(label)}">${list.map(([v, n]) => `<button aria-pressed="${v === cur}" onclick="lkSet('${key}','${v}',this)">${esc(n)}</button>`).join("")}</div>`;
const lkRow = (label, inner, right) => `<div class="lk-row"><div class="lk-lab"><span>${esc(label)}</span>${right ? `<b>${right}</b>` : ""}</div>${inner}</div>`;
// the editor's sections; only: one of them ("body" | "face" | "hair" | "beard" | "clothes"), or all of them grouped
function lookFormHTML(L, only){
  const F = L.face || {}, O = LOOK_OPT;
  const faceEnds = {jaw:["Narrow", "Wide"], chin:["Short", "Long"], nose:["Small", "Large"], brow:["Soft", "Strong"], eyes:["Close", "Wide apart"]};
  const part = {
    body:() => lkRow("Skin tone", lkSw("skin", O.skin, L.skin, "Skin tone")) + lkRow("Build", lkChips("build", O.build, L.build, "Build"))
      + lkRow("Height", `<input type="range" class="lk-range" min="${O.height[0]}" max="${O.height[1]}" step=".01" value="${num(L.height, 1)}" aria-label="Height" oninput="lkHeight(this.value)">`, `<span id="lkCm">${Math.round(180*num(L.height, 1))} cm</span>`),
    face:() => O.face.map(([k, n, a, b]) => lkRow(n, `<div class="lk-slide"><em>${faceEnds[k][0]}</em><input type="range" class="lk-range" min="${a}" max="${b}" step=".06" value="${num(F[k], 1)}" aria-label="${esc(n)}" oninput="lkFace('${k}',this.value)"><em>${faceEnds[k][1]}</em></div>`)).join("")
      + lkRow("Eyes", lkSw("eyes", O.eyes, L.eyes, "Eye colour")),
    hair:() => lkRow("Style", lkChips("hair", O.hair, L.hair, "Hairstyle")) + lkRow("Colour", lkSw("hairColor", O.hairColor, L.hairColor, "Hair colour")),
    beard:() => lkRow("Facial hair", lkChips("beard", O.beard, L.beard, "Facial hair")),
    clothes:() => lkRow("Top", lkChips("top", O.top, L.top, "Top") + lkSw("topCol", O.topCol, L.topCol, "Top colour"))
      + lkRow("Bottoms", lkChips("legs", O.legs, L.legs, "Bottoms") + lkSw("legCol", O.legCol, L.legCol, "Bottoms colour"))
      + lkRow("Shoes", lkSw("shoeCol", O.shoeCol, L.shoeCol, "Shoe colour")) + `<p class="lk-note">On the pitch and at training you wear the club's kit with your number.</p>`
  };
  if (only && part[only]) return `<section class="lk-sec">${part[only]()}</section>`;
  return `<section class="lk-sec"><h4>Body</h4>${part.body()}</section>
    <section class="lk-sec"><h4>Hair</h4>${part.hair()}${part.beard()}</section>
    <section class="lk-sec"><h4>Face</h4>${part.face()}</section>
    <section class="lk-sec"><h4>Off the pitch</h4>${part.clothes()}</section>`;
}
// one control changed: the draft, the pressed state in its group, the preview
function lkSet(key, v, el){
  if (!LK.draft) return;
  LK.draft[key] = v;
  if (el && el.parentNode) for (const b of el.parentNode.children) b.setAttribute("aria-pressed", String(b === el));
  // clothes are only seen in your own clothes
  if (["top", "topCol", "legs", "legCol", "shoeCol"].includes(key) && LK.kind !== "casual") lkKind("casual");
  lkUpdate();
}
function lkHeight(v){ if (!LK.draft) return; LK.draft.height = clamp(num(+v, 1), LOOK_OPT.height[0], LOOK_OPT.height[1]); const c = document.getElementById("lkCm"); if (c) c.textContent = Math.round(180*LK.draft.height) + " cm"; lkUpdate(); }
function lkFace(k, v){ if (!LK.draft) return; LK.draft.face = Object.assign({}, LK.draft.face, {[k]:num(+v, 1)}); if (LK.view !== "face") lkView("face"); lkUpdate(); }
function lkView(v){
  LK.view = v; if (window.LookPreview) window.LookPreview.view(v);
  for (const b of document.querySelectorAll(".lk-views button")) b.setAttribute("aria-pressed", String(b.dataset.v === v));
}
function lkKind(k){
  LK.kind = k === "training" ? "training" : "casual"; lkUpdate();
  for (const b of document.querySelectorAll(".lk-kind button")) b.setAttribute("aria-pressed", String(b.dataset.v === LK.kind));
}
function lkRandom(){
  if (!LK.draft) return;
  const fresh = lookDefault("r" + Date.now() + Math.random());
  for (const k of Object.keys(fresh)) LK.draft[k] = fresh[k];
  const c = document.getElementById("lkCtl"); if (c) c.innerHTML = lookFormHTML(LK.draft, LK.only);
  lkUpdate();
}
const lkStageHTML = () => `<div class="lk-side">
    <div class="lk-stage" id="lkStage"><span class="lk-drag">Drag to turn</span></div>
    <div class="lk-bar"><div class="seg lk-views" role="group" aria-label="View">${[["front", "Front"], ["side", "Side"], ["back", "Back"], ["face", "Face"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${LK.view === v}" onclick="lkView('${v}')">${n}</button>`).join("")}</div>
      <div class="seg lk-kind" role="group" aria-label="Outfit">${[["casual", "Casual"], ["training", "Kit"]].map(([v, n]) => `<button data-v="${v}" aria-pressed="${LK.kind === v}" onclick="lkKind('${v}')">${n}</button>`).join("")}</div></div>
  </div>`;
// the creation screen (main.js) draws lkStageHTML() and the form itself, then calls this once the page is up
function lookCreateMount(){ if (LK.where === "create") lkPreview(); }
/* the panel: where = "mirror" | "pc" */
function openLookEditor(where){
  if (!S || !S.player) return;
  LK.where = where || "mirror"; LK.saved = false; LK.view = "front"; LK.kind = "casual"; LK.o = null; LK.only = null;
  LK.draft = JSON.parse(JSON.stringify(lookSane(S.player.look, lookSeedOf(S))));
  lpShow("look", `<div class="lk">${lpHead("Your look", where === "pc" ? "Appearance" : "Bathroom mirror")}
    <div class="lk-main">${lkStageHTML()}<div class="lk-ctl" id="lkCtl">${lookFormHTML(LK.draft)}</div></div>
    <div class="lk-foot"><button class="btn sm ghost" onclick="lkRandom()">🎲 Randomise</button><span class="grow"></span>
      <button class="btn sm ghost" onclick="lpClose(true)">Cancel</button><button class="btn sm" onclick="lkSave()">Save look</button></div></div>`,
    {onClose:() => {
      if (window.LookPreview) window.LookPreview.unmount();
      const back = LK.where === "pc"; LK.draft = null; LK.where = "";
      if (back) setTimeout(() => { if (!LP.open){ LP.tab = "you"; openComputer(LP.where); } }, 0);
    }});
  lkPreview();
}
function lkSave(){
  if (!LK.draft || !S) return;
  S.player.look = lookSane(LK.draft, lookSeedOf(S)); LK.saved = true;
  if (window.lifeLookChanged) window.lifeLookChanged();
  if (typeof FEED === "object" && FEED.chip) FEED.chip("New look saved", "good");
  lpClose();
}

window.addEventListener("keydown", e => {
  if (!LP.open) return;
  if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); lpClose(); }
}, true);
