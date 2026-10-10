// qa/wpG-life.mjs: WP-G acceptance for the life systems in the world (DESIGN 2.3 WP-G; 3.8, 3.7.3, 3.8.8).
// Owner: WP-G.
//
//   pockets   a box, a Foodies bag and the football are refused by a pocket with the 3.8.5 line, and stay in your
//             hands; small things still go in; a bag left in a pocket by an older save goes into the fridge
//   events    each notice-board event forced through S.events.active shows its mechanic in the world: no water at
//             the bath, the noisy line on the bed, the Mini Market closed, the bus 20 minutes longer from home, Foodies
//             running late; its board text has no em dash
//   bed       the bed says what sleepPlan says, by night and by day, with the 24-hour line
//   styles    the barber's cards read Wearing, Purchased, Available and Locked; a locked card cannot be tried on; the
//             mirror offers only owned cuts and refuses an unowned one
//   compass   DELIVERIES only while a bag waits, FRIDGE only while you carry one
//   foodies   "Deliver to" on the app, and the order goes where you chose
//   session   training.js's session: it starts, a second one the same day is refused, a 15:30 start plans only the
//             blocks that fit, 15:45 is too late (Esc, rejoin and rewards are played out in qa/wpI-session.mjs)
//   onb       the lifeOnb events of 3.7.4 that WP-G sends: take, swap, release, throw, eat, openBus, parcelPut,
//             foodiesOrder, nap
//
//   QA_PORT=8773 node qa/wpG-life.mjs      exits 1 on any failure; writes qa/out/wpG-life.json
import {launch, career, freeze, report} from "./lib.mjs";

const checks = [];
const check = (name, ok, detail) => {
  checks.push({name, ok: !!ok, detail});
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined && !ok ? ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`);
};
const MINUS = String.fromCharCode(0x2212), EM = String.fromCharCode(0x2014);

const {page, close} = await launch({gfx: "low", seed: 13});
try {
  await career(page, {zone: "home", at: "bed", min: 12*60});
  await freeze(page);
  await page.evaluate(() => {
    window.__onb = [];
    const on0 = window.lifeOnb;
    window.lifeOnb = (ev, d) => { __onb.push(ev); if (on0) on0(ev, d); };
    window.__note = () => (document.getElementById("lifeNote") || {}).textContent || "";
    S.money = 2000;
  });

  /* ---------- pockets (3.8.5) ---------- */
  const pk = await page.evaluate(() => {
    const L = __life, I = L.INV, out = {};
    I.carry(); S.carry.hand = null; S.carry.slots = [null, null];
    for (const id of ["box", "bag", "ball"]){
      I.take({id, items:id === "bag" ? {fruit:1} : undefined});
      const ok = I.swap(0);
      out[id] = {refused:!ok, inHand:!!(I.hand() && I.hand().id === id), slot:S.carry.slots[0], note:__note()};
      I.release();
    }
    I.take({id:"bulb"}); out.bulb = I.swap(0) && S.carry.slots[0] && S.carry.slots[0].id === "bulb";
    out.out = I.swap(0) && I.hand() && I.hand().id === "bulb";
    I.release();
    // the inventory bar: a hands-only thing shows only "G put down"
    I.take({id:"box"}); I.render(); out.bar = (document.querySelector("#lifeInv .iv-keys") || {}).textContent || ""; I.release();
    return out;
  });
  for (const id of ["box", "bag", "ball"]){
    check(`pockets: a ${id} is refused`, pk[id].refused && pk[id].inHand && !pk[id].slot, pk[id]);
    check(`pockets: the ${id} refusal line`, pk[id].note === "That won't fit in a pocket. Carry it in your hands, or press G to put it down.", pk[id].note);
  }
  check("pockets: a bulb still goes in, and comes back out", pk.bulb && pk.out, pk);
  check("pockets: the bar shows only G put down for a hands-only thing", /G\s*put down/.test(pk.bar) && !/pocket/.test(pk.bar), pk.bar);

  // a bag in a pocket (an older save) goes in at the fridge
  const dep = await page.evaluate(() => {
    const L = __life, f = __life.W.fridges[0];
    const before = S.inv.fruit || 0;
    S.carry.hand = null; S.carry.slots = [{id:"bag", items:{fruit:2}}, null];
    L.P.x = f.x; L.P.z = f.z; L.P.feet = f.y;
    L.stepN(3);
    return {gained:(S.inv.fruit || 0) - before, slot:S.carry.slots[0], note:__note()};
  });
  check("pockets: a legacy pocketed bag deposits at the fridge", dep.gained === 2 && !dep.slot, dep);
  check("pockets: the put-away note", dep.note.startsWith("Food put away. Both fridges share it."), dep.note);

  /* ---------- the bed (3.8.3) ---------- */
  const bed = await page.evaluate(() => {
    const L = __life, sp = L.spots.find(s => s.label === "Mattress" || s.label === "Bed");
    const at = m => { S.life.min = m; L.LIFE.min = m; const t = typeof bedTierNow === "function" ? 1 : 1;
      const tier = FURN[S.home.fx.furn.find(p => FURN[p.id].kind === "bed").id].tier;
      const night = sleepPlan(m >= 19*60 || m < 5*60 ? "night" : "nap", tier, m), day = sleepPlan("day", tier, m);
      return {hint:sp.hint, lines:sp.lines.slice(), hold:sp.long.label, time:sp.long.time, night, day}; };
    return {night:at(19*60), day:at(13*60)};
  });
  const fe = p => `Fatigue ${p.fatigue >= -.5 && p.fatigue < .5 ? "0" : (p.fatigue < 0 ? MINUS : "+") + Math.abs(Math.round(p.fatigue))} · Energy ${Math.round(p.energy) === 0 ? "0" : (p.energy < 0 ? MINUS : "+") + Math.abs(Math.round(p.energy))}`;
  check("bed by night: Tap E sleeps until 7:00 AM, hours from the plan", bed.night.hint === `Tap E: sleep until 7:00 AM (${Math.round(bed.night.night.hours)} h)`, bed.night.hint);
  check("bed by night: the plan's fatigue and energy", bed.night.lines.includes(fe(bed.night.night)), bed.night.lines);
  check("bed by night: the day changes at midnight", bed.night.lines.includes("The day changes at midnight. Your day summary comes first."), bed.night.lines);
  check("bed: the 24-hour line from the plan", bed.night.lines.some(l => l.startsWith("Hold E: sleep 24 hours, to 7:00 PM tomorrow · " + fe(bed.night.day))), bed.night.lines);
  check("bed: holding takes about two seconds", bed.night.time === 2, bed.night.time);
  check("bed by day: a 2 hour nap, to 3:00 PM, from the plan", bed.day.hint === `Tap E: a 2 hour nap, to 3:00 PM · ${fe(bed.day.night)}`, bed.day.hint);
  check("bed: no em dash", ![bed.night.hint, ...bed.night.lines, bed.day.hint, ...bed.day.lines].join(" ").includes(EM));

  /* ---------- notice-board events and their mechanics (3.8.6) ---------- */
  const ev = await page.evaluate(() => {
    const L = __life, out = {};
    const on = (id, x = {}) => { eventsEnsure(); S.events.active = [Object.assign({id, from:S.life.day, to:S.life.day, alt:false}, x)]; };
    S.life.min = 12*60; L.LIFE.min = 12*60;
    on("water");
    L.ctx.bath(); out.bath = {note:__note(), busy:!!L.busy}; L.ctx.shower(); out.shower = {note:__note(), busy:!!L.busy};
    on("noisy", {flat:"302"}); S.life.min = 23*60; L.LIFE.min = 23*60;
    const sp = L.spots.find(s => s.label === "Mattress" || s.label === "Bed"); out.noisy = sp.lines.slice();
    S.life.min = 12*60; L.LIFE.min = 12*60;
    on("shop");
    const shop = L.spots.find(s => s.label === "Mini Market"); out.shop = {hint:shop && shop.hint};
    if (shop) shop.run(); out.shop.note = __note(); out.shop.panel = !!(window.lifePanelOpen && window.lifePanelOpen());
    on("roadworks"); out.road = {mins:busMins("home", "ground")};
    openBus("home"); out.road.panel = (document.querySelector("#lifePanel") || {}).textContent || ""; lpClose(true);
    on("delivery"); out.late = APPVIEWS.foodies().html.includes("Running late today");
    out.board = Object.keys(LIFE_EVENTS).map(id => { const e = {id, from:S.life.day, to:S.life.day, flat:"302"}; return eventText(e) + " | " + eventSub(e) + " | " + eventFx(e); });
    S.events.active = [];
    return out;
  });
  check("water: the bath refuses", ev.bath.note === "No water until 8:00 PM. The showers at the training centre still work." && !ev.bath.busy, ev.bath);
  check("water: the shower at home refuses", ev.shower.note === "No water until 8:00 PM. The showers at the training centre still work." && !ev.shower.busy, ev.shower);
  check("noisy: the bed says Noisy neighbours " + MINUS + "20%", ev.noisy.includes(`Noisy neighbours ${MINUS}20%`), ev.noisy);
  check("shop: the Mini Market is closed", ev.shop.hint === "Closed for stocktaking. Back tomorrow." && ev.shop.note === "Closed for stocktaking. Back tomorrow." && !ev.shop.panel, ev.shop);
  check("road works: 20 minutes longer from home", ev.road.mins === 60 && /Road works: 20 minutes longer/.test(ev.road.panel) && /1 HOUR/.test(ev.road.panel), ev.road);
  check("delivery: Foodies says it is running late", ev.late);
  check("every board text has no em dash", !ev.board.join(" ").includes(EM), ev.board);

  /* ---------- styles: barber and mirror (3.7.3) ---------- */
  const st = await page.evaluate(() => {
    const out = {};
    S.life.min = 12*60; LIFE.min = 12*60; S.odor = 0;
    const L0 = S.player.look; S.player.owned = {hair:[L0.hair], beard:["", "stubble"], hairColor:[L0.hairColor]};
    const other = LOOK_OPT.hair.map(h => h[0]).find(h => h !== L0.hair);
    grantStyle("hair", other);
    openBarber();
    const cards = [...document.querySelectorAll("#brOpts .br-opt")];
    out.states = [...new Set(cards.map(c => c.dataset.state))].sort();
    out.labels = cards.map(c => c.querySelector("span").textContent);
    const lockedCard = cards.find(c => c.dataset.state === "locked");
    out.lockedAria = lockedCard && lockedCard.getAttribute("aria-disabled");
    const before = LK.draft.hair; if (lockedCard) lockedCard.click(); out.lockedTry = LK.draft.hair === before;
    out.purchasedSub = (cards.find(c => c.dataset.state === "purchased") || {textContent:""}).textContent;
    // switch to the purchased cut: no charge
    brPick("hair", other); out.bill = barberBill(); const m0 = S.money; brPay(); out.free = {spent:m0 - S.money, hair:S.player.look.hair};
    // pay for a new one: owned from now on
    openBarber(); const buy = barberMenu("hair").find(o => !ownsStyle("hair", o.v) && o.rep <= barberRep());
    brPick("hair", buy.v); const m1 = S.money; brPay(); out.paid = {spent:m1 - S.money, price:buy.price, owned:ownsStyle("hair", buy.v), wearing:S.player.look.hair === buy.v};
    // the mirror: only what you own
    openLookEditor("mirror");
    out.mirror = [...document.querySelectorAll('#lkCtl [aria-label="Hairstyle"] button')].map(b => b.textContent);
    out.owned = S.player.owned.hair.map(v => (LOOK_OPT.hair.concat(LOOK_BARBER.hair).find(h => h[0] === v) || [, v])[1]);
    const unowned = LOOK_OPT.hair.map(h => h[0]).find(h => !ownsStyle("hair", h));
    const d0 = LK.draft.hair; lkSet("hair", unowned, null); out.mirrorRefused = LK.draft.hair === d0;
    out.noBody = !document.querySelector('#lkCtl [aria-label="Skin tone"], #lkCtl [aria-label="Build"]');
    out.foot = (document.querySelector(".lk-foot") || {}).textContent || "";
    lkSave(); out.after = S.player.look.hair;
    return out;
  });
  check("barber: Wearing, Purchased, Available and Locked cards", JSON.stringify(st.states) === JSON.stringify(["available", "locked", "purchased", "wearing"]), st.states);
  check("barber: a locked card is aria-disabled and cannot be tried on", st.lockedAria === "true" && st.lockedTry, st);
  check("barber: a purchased card says it is yours, free to switch", /Yours, free to switch/.test(st.purchasedSub), st.purchasedSub);
  check("barber: switching to a cut you own costs nothing", st.free.spent === 0, st.free);
  check("barber: a new cut costs its price and is owned after", st.paid.spent === st.paid.price && st.paid.owned && st.paid.wearing, st.paid);
  check("mirror: only owned cuts", st.mirror.length === st.owned.length && st.mirror.every(n => st.owned.includes(n)), {mirror:st.mirror, owned:st.owned});
  check("mirror: an unowned cut is refused", st.mirrorRefused);
  check("mirror: no body, face or randomise in the world", st.noBody && !/Randomise/.test(st.foot) && /More cuts at Fade & Co., across the road./.test(st.foot), st.foot);

  /* ---------- compass (3.8.7) ---------- */
  const cp = await page.evaluate(() => {
    const L = __life, I = L.INV, kinds = () => [...document.querySelectorAll("#lifeCompass .cp-mk")].map(e => [...e.classList].find(c => c.startsWith("k-")));
    const settle = () => { for (let i = 0; i < 30; i++) L.compassStep(.1); };
    S.parcels = []; S.carry.hand = null; S.carry.slots = [null, null]; settle();
    const none = kinds();
    S.parcels = [{id:"q1", items:{fruit:1}, at:"home", t:0}]; L.refreshParcels(); settle();
    const waiting = kinds();
    I.take({id:"bag", items:{fruit:1}}); settle();
    const carrying = kinds();
    I.release(); S.parcels = []; L.refreshParcels(); settle();
    return {none, waiting, carrying};
  });
  check("compass: no DELIVERIES or FRIDGE with nothing waiting or carried", !cp.none.includes("k-deliv") && !cp.none.includes("k-fridge"), cp.none);
  check("compass: DELIVERIES while a bag waits", cp.waiting.includes("k-deliv"), cp.waiting);
  check("compass: FRIDGE while you carry a bag", cp.carrying.includes("k-fridge"), cp.carrying);

  /* ---------- Foodies: deliver to (3.8.10) ---------- */
  const fd = await page.evaluate(() => {
    const html = APPVIEWS.foodies().html;
    fdSetWhere("ground"); FD.basket = {fruit:1}; fdOrder();
    const o = S.orders[S.orders.length - 1];
    const kp = kpFoodiesView().items[0].l;
    FD.where = null;
    return {deliver:/Deliver to/.test(html) && /Home lobby/.test(html) && /Training centre/.test(html), where:o && o.where, kp};
  });
  check("foodies: Deliver to Home lobby or Training centre", fd.deliver, fd);
  check("foodies: the order goes where you chose", fd.where === "ground", fd);
  check("foodies: the keypad phone says where it goes", fd.kp.startsWith("Deliver to: "), fd.kp);

  /* ---------- lifeOnb emitters of WP-G (3.7.4) ---------- */
  await page.evaluate(async () => {
    const L = __life, I = L.INV;
    S.carry.hand = null; S.carry.slots = [null, null];
    I.take({id:"bulb"}); I.swap(0); I.swap(0);
    L.modes.flags; L.throwHand();
    S.inv.fruit = 3; L.ctx.eat("fruit", 1);
    openBus("home"); lpClose(true);
    const f = __life.W.fridges[0]; I.take({id:"bag", items:{fruit:1}}); L.P.x = f.x; L.P.z = f.z; L.P.feet = f.y; L.stepN(2);
    S.life.min = 12*60; LIFE.min = 12*60; L.ctx.sleep();
    await new Promise(r => setTimeout(r, 1900));
  });
  const onb = await page.evaluate(() => [...new Set(__onb)]);
  for (const e of ["take", "swap", "release", "throw", "eat", "openBus", "parcelPut", "foodiesOrder", "nap"]) check(`lifeOnb "${e}" is sent`, onb.includes(e), onb);

  /* ---------- the team session, once a day (3.8.8, 3.6.2) ----------
     The session is training.js's since WP-I (3.6.2: four blocks played on the simulation, asynchronously, after a
     walk over), so the checks that need it played out (Esc keeps the blocks done, a rejoin carries on from the next
     block, the rewards once) live in qa/wpI-session.mjs, which plays it with an input bot. Here: what the coach says
     and plans without anything being played. */
  const ss = await page.evaluate(async () => {
    const L = __life, out = {};
    let wd = 0; while (wd < 5 && !trainingDay(wd)) wd++;
    S.life.wd = wd; S.life.att = freshAtt(); S.energy = 90; S.fatigue = 10;
    L.enterZone("ground", "bus"); L.stepN(2);
    const at = m => { S.life.min = m; L.LIFE.min = m; };
    const startNow = async () => {
      document.getElementById("lifeNote") && (document.getElementById("lifeNote").textContent = "");
      await L.ctx.session();
      for (let i = 0; i < 400 && !(window.__train && window.__train.RUN.cur) && !__note(); i++){ await new Promise(r => setTimeout(r, 25)); L.stepN(1); }
      const run = window.__train && window.__train.RUN.cur;
      return {on:!!run, kind:run ? run.kind : null, blocks:run ? run.blocks.slice() : null, note:__note()};
    };
    const stop = () => { const r = window.__train && window.__train.RUN.cur; if (r && r.quit) r.quit(); L.stepN(2); };
    at(10*60 + 30);
    out.start = await startNow(); stop();
    // the session already done today
    S.life.att = freshAtt(); S.life.att.sess = {blocks:4, mins:90, done:true, score:.5}; at(11*60);
    out.second = await startNow(); stop();
    // the next day, a 15:30 start: only the blocks that fit before four o'clock
    S.life.att = freshAtt(); at(15*60 + 30);
    out.late = await startNow();
    out.late.fit = out.late.blocks ? out.late.blocks.reduce((m, i) => m + window.__train.TS.BLOCKS[i].mins, 0) : null;
    stop();
    S.life.att = freshAtt(); at(15*60 + 45);
    out.tooLate = await startNow(); stop();
    return out;
  });
  check("session: it starts on training.js", ss.start.on && ss.start.kind === "session" && ss.start.blocks.length === 4, ss.start);
  check("session: a second session the same day is refused", !ss.second.on && ss.second.note === "You've done today's session. The coach wants you fresh tomorrow.", ss.second);
  check("session: a 15:30 start only plans the blocks that fit before four o'clock", ss.late.on && ss.late.blocks.length >= 1 && ss.late.fit <= 30, ss.late);
  check("session: with less than 20 minutes left, not today", !ss.tooLate.on && ss.tooLate.note === "The session's nearly over. Join them tomorrow at 10:00 AM.", ss.tooLate);

  check("no console or page errors", page.errors.length === 0, page.errors.slice(0, 5));
} catch(e){
  check("the run completed", false, String(e && e.stack || e));
} finally {
  const failed = checks.filter(c => !c.ok);
  report("wpG-life", {pass: !failed.length, checks});
  console.log(`wpG-life: ${checks.length - failed.length} of ${checks.length} checks pass`);
  await close();
  process.exit(failed.length ? 1 : 0);
}
