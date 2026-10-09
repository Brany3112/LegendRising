// qa/wpH-day.mjs: day one, H1 to H21, each step finished by its physical action (DESIGN 4.9 "each step", "timing",
// "day-one rules", "reload", "text"; 2.3 WP-H acceptance).
// Owner: WP-H (Stage 1).
//
//   node qa/wpH-day.mjs [--reload]      exits 1 on any failed check, console error or page error; writes
//                                       qa/out/wpH-day.json and a screenshot per step (qa/out/wpH-day-<step>.png)
//
// A career just past the film (a name, a club, the window broken, the ball on the floor of the flat) stands on the
// pavement at 8:00 AM. A bot then plays the morning through the game's own input: it aims (the view turned to a point,
// as the mouse would), presses keys (E, 1, 2, G, Tab, Space) and clicks the left button, through the same window
// events as a player. Travel is not walked step by step: the bot is put at the far end of each leg and the clock is
// moved on by the time a player walking at 1.4 m/s takes over it (the world's own pass(), at the moving rate and the
// first day's ONB_RATE). Every step must become current in order and be finished by the action meant for it; the
// lines of DESIGN 3.7.5 must be shown word for word; the bus to the training centre must be shut before the gate
// with its generated label; the bot must reach the bus lesson between 9:00 and 9:40; holding E on the bed is refused;
// trust does not move; and the bus ride ends the home chapter at the training centre.
// With --reload, the page is reloaded (Continue on the title screen) after every step from H2 on, and the step must
// resume with nothing duplicated (the plate, the bulb, the ball, the bag).
import {launch, snap, report, freeze, stepN, CAREER_AT} from "./lib.mjs";

const RELOAD = process.argv.includes("--reload");
const SAID_BEFORE = [];
const out = {checks: [], steps: [], lines: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 260) : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 11});

// the bot, in the page: the view turned at things, keys and clicks as window events, the world stepped by hand
async function botInit(){
  await page.evaluate(async () => {
    const [home, inv, fd, hand, store, furn] = await Promise.all(["home", "inv", "firstday", "core/hand", "store", "furniture"].map(m => import(`./js/life/${m}.js`)));
    const L = window.__life, P = L.P, LH = 3.2;
    // the pointer is the world's (a player who has clicked into it): the clock runs, clicks reach the world
    const cv = document.getElementById("lifeCanvas");
    Object.defineProperty(document, "pointerLockElement", {configurable: true, get: () => cv});
    const flat = () => { const h = S.home, A = home.APT[h.door]; return {h, A, base: h.floor*LH}; };
    const B = window.__bot = {
      home, inv, fd, hand, store, furn, P, said: [],
      step(n = 2){ return L.stepN(n, 1/60); },
      place(x, y, z, yaw = P.yaw){ L.place({x, y, z, yaw}); B.step(3); },
      aim(x, y, z){ const dx = x - P.x, dz = z - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(y - P.eye, Math.max(.05, Math.hypot(dx, dz))); B.step(3); return L.held ? L.held.label : null; },
      spot(pred){ return L.spots.find(s => typeof pred === "string" ? (s.label === pred || (typeof s.label === "string" && s.label.startsWith(pred))) : pred(s)); },
      centre(sp){ const a = typeof sp.aim === "function" ? sp.aim() : sp.aim; return a ? [(a[0][0] + a[1][0])/2, (a[0][1] + a[1][1])/2, (a[0][2] + a[1][2])/2] : [sp.x, sp.y || 1.2, sp.z]; },
      aimSpot(pred){ const sp = B.spot(pred); if (!sp) return null; const c = B.centre(sp); return B.aim(c[0], c[1], c[2]); },
      key(k, hold = 2){ const key = k === "space" ? " " : k; dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true})); B.step(hold); dispatchEvent(new KeyboardEvent("keyup", {key, bubbles: true})); B.step(2); },
      click(){ dispatchEvent(new MouseEvent("mousedown", {button: 0, bubbles: true})); B.step(1); dispatchEvent(new MouseEvent("mouseup", {button: 0, bubbles: true})); B.step(2); },
      // a walk of d metres as the crow flies, at 1.4 m/s along a path a third longer (round corners, through doors): the
      // world's own clock at the moving rate (world.js TIME_RATE_MOVING) and the first day's rate
      walk(d){ const secs = d*1.3/1.4; L.pass(secs*.85*(fd.FD.slow() ? fd.ONB_RATE : 1), "walk"); },
      // up or down the stairs between the street and your floor: two flights and a landing a floor
      stairs(){ return 3*8*S.home.floor; },
      // a player listening to what is said (the lines run on while you stand there) and finding the next thing
      listen(max = 20){ for (let i = 0; i < max*4 && fd.saying(); i++) B.step(15); },
      look(secs = 3){ B.idle(secs); },
      // standing still for a while (reading a line, looking about): the world stepped for real
      idle(secs){ B.step(Math.round(secs*60)); },
      flat,
      // inside your flat, by the door
      inFlatPos(){ const {A, base} = flat(); return [A.door + .2, base + .02, A.wz + A.s*1.4]; },
      corridorPos(){ const {A, base} = flat(); return [A.door, base + .02, A.wz - A.s*.9]; },
      state(){ return {step: S.onb.step, cur: fd.FD.currentId(), min: Math.round(S.life.min*10)/10, goal: fd.FD.goal(), hint: (document.querySelector("#onbHint.on") || {}).textContent || "",
        hand: inv.hand() ? inv.hand().id : null, slots: inv.carry().slots.map(x => x ? x.id : null), trust: S.trust, zone: L.LIFE.zone}; }
    };
  });
}
// every line given while you play, in order ({who, text}: firstday.js FD.said)
async function linesSaid(){ return page.evaluate(() => __bot.fd.FD.said()); }

const state = () => page.evaluate(() => __bot.state());
async function expectStep(id, what){
  const s = await state();
  out.steps.push(Object.assign({id, what}, s));
  return s;
}
async function doneStep(id, shot){
  const s = await state();
  const order = await page.evaluate(() => __bot.fd.STEP_IDS);
  const k = order.indexOf(id), now = s.cur ? order.indexOf(s.cur) : order.length;
  check(`${id} done by its action (now on ${s.cur || "nothing"}, ${Math.floor(s.min/60)}:${String(Math.floor(s.min % 60)).padStart(2, "0")})`, now > k, s);
  if (shot) await snap(page, `wpH-day-${id}`);
  if (RELOAD && k >= 1) await reload(id);
}
// a reload: the page is closed (its own pagehide save) and opened again, Continue clicked; the step resumes
async function reload(id){
  const before = await page.evaluate(() => ({cur: __bot.fd.FD.currentId(), plates: (S.drops || []).filter(d => d.item && d.item.id === "plate").length + (__bot.inv.onYou("plate") ? 1 : 0),
    bulbs: (S.drops || []).filter(d => d.item && d.item.id === "bulb").length + [__bot.inv.carry().hand, ...__bot.inv.carry().slots].filter(x => x && x.id === "bulb").length + (S.home.fx.bulb ? 1 : 0),
    balls: (S.drops || []).filter(d => d.item && d.item.id === "ball").length + (__bot.inv.onYou("ball") ? 1 : 0), bags: (S.parcels || []).length + (S.orders || []).length}));
  // (where you stood: Continue puts you back in the zone you saved in; the bot carries on from the same spot)
  const at = await page.evaluate(() => { const P = __bot.P; return {x: P.x, y: P.feet, z: P.z, yaw: P.yaw, pitch: P.pitch}; });
  // (what was said lives in the page: kept from each page before it is reloaded)
  SAID_BEFORE.push(...await linesSaid());
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!window.__life && !!document.querySelector(".slot-main"), null, {timeout: 90000});
  await page.locator(".slot-main").first().click();
  await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
  const resumed = await page.evaluate(at => { const B = __bot, P = B.P, r = {x: P.x, y: P.feet, z: P.z, zone: window.__life.LIFE.zone, panel: !!(window.lifePanelOpen && window.lifePanelOpen()), modal: !!window.__life.FLAGS.modal};
    B.place(at.x, at.y + .02, at.z, at.yaw); P.pitch = at.pitch; B.step(4); return r; }, at);
  out.resumed = out.resumed || []; out.resumed.push(Object.assign({id}, resumed));
  const after = await page.evaluate(() => ({cur: __bot.fd.FD.currentId(), plates: (S.drops || []).filter(d => d.item && d.item.id === "plate").length + (__bot.inv.onYou("plate") ? 1 : 0),
    bulbs: (S.drops || []).filter(d => d.item && d.item.id === "bulb").length + [__bot.inv.carry().hand, ...__bot.inv.carry().slots].filter(x => x && x.id === "bulb").length + (S.home.fx.bulb ? 1 : 0),
    balls: (S.drops || []).filter(d => d.item && d.item.id === "ball").length + (__bot.inv.onYou("ball") ? 1 : 0), bags: (S.parcels || []).length + (S.orders || []).length}));
  check(`reload after ${id}: the same step, nothing duplicated`, before.cur === after.cur && before.plates <= 1 && after.plates === before.plates && after.bulbs === before.bulbs && after.balls === before.balls && after.bags === before.bags, {before, after});
}

try {
  // a career just past the film, on the pavement at 8:00 AM
  await page.evaluate(now => {
    const real = Date.now; Date.now = () => now;
    try {
      careerShell();
      applyCreation({name: "Andrei Popa", number: 9, pos: "ST", pref: "ST", foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30});
      document.body.classList.add("life");
      A.sign(0);
    } finally { Date.now = real; }
    S.home.win = {state: "broken", at: absNow()}; S.home.ballPending = true;
    S.flags.FirstTimeIntroductionCompleted = true; S.onb = {v: 2, step: "H1", seen: {}};
    window.startLife({zone: "home", at: {x: -9.5, z: 5.3, y: .12, yaw: -1.16}});
  }, CAREER_AT);
  await page.waitForFunction(() => window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
  const t0 = await page.evaluate(() => ({min: S.life.min, trust: S.trust, day: S.life.day, excused: S.life.att.excused}));
  check("day one starts at 8:00 AM, excused", t0.min === 480 && t0.excused === true, t0);
  let s = await expectStep("H1"); check("H1 is first: 'Go up to flat ...'", s.cur === "H1" && /^Go up to flat \d0\d, floor \d$/.test(s.goal), s);
  await snap(page, "wpH-day-H0");

  // H1 Go up: in through the block's door, up the stairs, to your door
  await page.evaluate(() => { const B = __bot, c = B.corridorPos(); B.walk(8 + B.stairs()); B.place(c[0], c[1], c[2], 0); B.aimSpot(s => s.kind === "drag" && /^Flat \d0\d$/.test(s.label)); });
  await doneStep("H1", true);

  // H2 Look around: open the door, in, the mattress, the fridge, the window
  await page.evaluate(() => {
    const B = __bot; B.key("e"); B.idle(1.5);
    const p = B.inFlatPos(); B.walk(2); B.place(p[0], p[1], p[2], 0);
    const bed = B.furn.pieceOf("bed"), fr = B.furn.pieceOf("fridge"), base = B.flat().base;
    B.aim(bed.wx, base + .25, bed.wz); B.idle(2.5); B.listen(); B.aim(fr.wx, base + .8, fr.wz); B.idle(2.5); B.listen();
  });
  await page.evaluate(() => __bot.listen());
  await doneStep("H2", true);

  // H3 The light: the switch, with no bulb in it
  await page.evaluate(() => { const B = __bot; B.look(); B.aimSpot("Light switch"); B.key("e"); B.idle(4); B.listen(); });
  s = await state(); check("the switch says 'Click. Nothing.' and does not turn on", (await page.evaluate(() => document.getElementById("lifeNote").textContent)) === "Click. Nothing." && !(await page.evaluate(() => S.home.light)), s);
  await doneStep("H3", true);

  // H4 To the shop: down, out, along to Mobila Bună's door, in
  await page.evaluate(() => { const B = __bot; B.walk(B.stairs() + 22); B.place(-17.95, .02, 1.8, Math.PI); B.idle(1); });
  await doneStep("H4", true);

  // H5 Take a bulb, from the rack by the till
  await page.evaluate(() => { const B = __bot; B.look(5); B.walk(4); B.place(-17.6, .02, -1.3, -Math.PI/2); B.aimSpot("Light bulb"); B.idle(2); B.click(); B.idle(2); B.listen(); });
  s = await state(); check("the bulb is in your hand, not paid for", s.hand === "bulb", s);
  await doneStep("H5", true);

  // H6 Checkout: on the belt, the beep, the card reader, the bulb from the end of the counter
  await page.evaluate(() => {
    const B = __bot; B.look(); B.walk(3); B.place(-20.9, .02, -.4, Math.PI); B.idle(3);
    B.aimSpot("Checkout belt"); B.click(); B.idle(2.2);
  });
  s = await state(); check("H6: 'Wait for the beep, then press E on the card reader.'", /Wait for the beep, then press E on the card reader\./.test(s.hint), s);
  await page.evaluate(() => { const B = __bot; B.aimSpot("Card reader"); B.key("e"); B.idle(2); B.place(-19.6, .02, 0, Math.PI); B.aimSpot(s => s.kind === "pick" && s.drop && s.drop.item.id === "bulb"); B.click(); B.idle(1); });
  await doneStep("H6", true);

  // H7 Carry it home: up to your door, where the neighbour slams his
  await page.evaluate(() => { const B = __bot, c = B.corridorPos(); B.walk(22 + B.stairs()); B.place(c[0], c[1], c[2] - .4, 0); B.idle(2.5); });
  const slam = await page.evaluate(() => ({bang: (document.getElementById("cineBang") || {}).textContent, plate: S.home.plate}));
  check("BANG! and the room number falls", slam.bang === "BANG!" && slam.plate === "floor", slam);
  await doneStep("H7", true);

  // H8 Hands and pockets: 1, pick up the number, 2, 1
  s = await state(); check("H8 starts: 'Your hands only carry one thing at a time. The two slots at the bottom are your pockets. Press 1.'", s.hint === "Your hands only carry one thing at a time. The two slots at the bottom are your pockets. Press 1.", s);
  await page.evaluate(() => { __bot.listen(); __bot.look(2); __bot.key("1"); __bot.idle(.5); });
  s = await state(); check("bulb in slot 1: 'Now pick up the room number.'", s.slots[0] === "bulb" && /Now pick up the room number\./.test(s.hint), s);
  // (a step back along the corridor from where it landed, so it is in view and not under your feet)
  await page.evaluate(() => {
    const B = __bot, pick = s => s.kind === "pick" && /^Room number/.test(s.label), c = B.centre(B.spot(pick)), {A, base} = B.flat();
    B.place(c[0] + 1.1, base + .02, A.wz - A.s*.9); B.aimSpot(pick); B.click(); B.idle(.5);
  });
  s = await state(); check("number in hand: 'Press 2 to pocket it too. You can put it back on your door on the way out.'", s.hand === "plate" && /Press 2 to pocket it too\. You can put it back on your door on the way out\./.test(s.hint), s);
  await page.evaluate(() => { __bot.key("2"); __bot.idle(.5); });
  s = await state(); check("'Press 1 to take the bulb back out.'", /Press 1 to take the bulb back out\./.test(s.hint), s);
  await page.evaluate(() => { __bot.key("1"); __bot.idle(.5); });
  await doneStep("H8", true);

  // H9 Install: in, the empty socket, screw it in (Space taps), the light works
  await page.evaluate(() => { const B = __bot, p = B.inFlatPos(); B.walk(2); B.place(p[0], p[1], p[2], 0); B.idle(2); B.listen(); B.look(); B.aimSpot("Light fitting"); B.click(); B.idle(.3); });
  const mini = await page.evaluate(() => ({on: !!__life.MINI.on, hint: (document.querySelector("#lifeMini .mg-head span") || {}).textContent}));
  check("the screw-in job: 'Move the mouse in clockwise circles, or tap Space'", mini.on && mini.hint === "Move the mouse in clockwise circles, or tap Space", mini);
  await page.evaluate(() => { for (let i = 0; i < 32 && __life.MINI.on; i++) __bot.key("space", 1); __bot.idle(6); });
  check("the bulb is in and the light is on", await page.evaluate(() => S.home.fx.bulb && S.home.light));
  await doneStep("H9", true);

  // H10 Room number: out of the flat, 2, aim at the door, click
  await page.evaluate(() => { const B = __bot, c = B.corridorPos(); B.listen(); B.place(c[0], c[1], c[2] - .3, 0); B.idle(1); });
  s = await state(); check("outside: 'Press 2 to take the room number out, then aim at your door and click to put it back.'", /Press 2 to take the room number out, then aim at your door and click to put it back\./.test(s.hint), s);
  await page.evaluate(() => { const B = __bot; B.key("2"); B.aimSpot(s => s.kind === "place" && /^Your door/.test(s.label) && s.takes === "plate"); B.click(); B.idle(1.5); });
  await doneStep("H10", true);

  // H11 Mailbox: down to the lobby, E on yours, read, close
  await page.evaluate(() => { const B = __bot; B.walk(B.stairs() + 6); B.place(-7.4, .29, -.4, -Math.PI/2); B.idle(2); B.listen(); B.look(); B.aimSpot(s => /^Your mailbox/.test(s.label)); B.key("e"); B.idle(1); });
  check("the mailbox opens with your letters", await page.evaluate(() => __life.mailOpen()));
  await snap(page, "wpH-day-H11-mail");
  await page.evaluate(() => { dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})); __bot.idle(5); });
  await doneStep("H11", true);

  // H12 Notice board: E on it, read, OK
  await page.evaluate(() => { const B = __bot; B.place(-7.2, .29, 1.7, -Math.PI/2); B.listen(); B.look(); B.aimSpot("Notice board"); B.key("e"); B.idle(.5); });
  check("the board opens", await page.evaluate(() => !!document.querySelector(".nb-panel")));
  await snap(page, "wpH-day-H12-board");
  await page.evaluate(() => { if (window.lifePanelClose) window.lifePanelClose(); __bot.idle(2); __bot.listen(); });
  await doneStep("H12", true);

  // H13 Delivery table: across the lobby, a look at it
  await page.evaluate(() => { const B = __bot; B.listen(); B.look(); B.walk(5); B.place(-12.3, .29, 1.2, 0); B.aim(-12.3, .9, 2.45); B.idle(1.5); });
  await doneStep("H13", true);

  // H14 Fridge: back up, open the door, look at the food, eat
  await page.evaluate(() => {
    const B = __bot, f = B.furn.pieceOf("fridge"); B.listen(); B.walk(B.stairs() + 8);
    // an arm's length back from its door, which opens out towards you
    const ux = f.front.x - f.wx, uz = f.front.z - f.wz, ul = Math.hypot(ux, uz) || 1;
    B.place(f.front.x + ux/ul*.9, f.front.y + .02, f.front.z + uz/ul*.9, 0); B.aimSpot("Fridge"); B.key("e"); B.idle(1.5);
  });
  s = await state(); check("door open: 'Look at the food.'", /Look at the food\./.test(s.hint), s);
  await page.evaluate(() => { const B = __bot; B.aimSpot(s => s.item === "sandwich" || s.item === "fruit"); B.idle(3); });
  const tip = await page.evaluate(() => [...document.querySelectorAll("#lifePrompt .lp-lines *")].map(e => e.textContent));
  check("the food's tooltip shows the fridge's quality", tip.some(t => /Fridge quality −50%/.test(t)) && tip.some(t => /^You get: /.test(t)), tip);
  await snap(page, "wpH-day-H14-tooltip");
  await page.evaluate(() => { __bot.key("e"); __bot.idle(2); __bot.listen(); });
  await doneStep("H14", true);

  // H15 Bed: the prompt on screen; then hold E: refused on day one
  await page.evaluate(() => { const B = __bot, q = B.furn.pieceOf("bed"), base = B.flat().base, f = B.flat().A; B.look();
    const x = q.wx + (q.wx > (f.x0 + f.x1)/2 ? -1.3 : 1.3); B.place(x, base + .02, q.wz, 0); B.aim(q.wx, base + .3, q.wz); B.idle(2); });
  s = await state(); check("H15's lines from the sleep plan", /Tap E for a two-hour nap\. It takes \d+ fatigue off\./.test(s.hint) && /After 7:00 PM, a tap means sleep until 7:00 AM\. A full night here takes about \d+ fatigue off and gives you back \d+ energy\. A better bed does more\./.test(s.hint) && /Hold E for about two seconds to sleep through a whole day\. Exactly 24 hours pass\./.test(s.hint) && /The day changes at midnight\./.test(s.hint), s);
  await snap(page, "wpH-day-H15");
  const held = await page.evaluate(() => { const d0 = S.life.day, m0 = S.life.min; dispatchEvent(new KeyboardEvent("keydown", {key: "e", bubbles: true})); __bot.step(150); dispatchEvent(new KeyboardEvent("keyup", {key: "e", bubbles: true})); __bot.step(3);
    return {note: document.getElementById("lifeNote").textContent, day: S.life.day, d0, slept: S.life.min - m0 > 60}; });
  check("Hold E on the bed on day one: 'Not today. The club expects you.'", held.note === "Not today. The club expects you." && held.day === held.d0 && !held.slept, held);
  await doneStep("H15", false);
  // (a how-to on screen is not part of a save: after a reload it is simply gone)
  s = await state(); if (!RELOAD) check("the bed's lines stay up to be read after the step", /The day changes at midnight\./.test(s.hint), s);

  // H16 Phone: Tab, Foodies, order a fruit to the training centre (once the bed's lines have been read)
  await page.evaluate(() => __bot.idle(16.5));
  s = await state(); check("'Press Tab to take your phone out.'", /Press Tab to take your phone out\./.test(s.hint), s);
  await page.evaluate(() => { __bot.idle(2); dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true})); dispatchEvent(new KeyboardEvent("keyup", {key: "Tab", bubbles: true})); __bot.idle(1); __bot.listen(); });
  const ph = await page.evaluate(() => ({open: PH.open, where: fdDest(), goal: __bot.fd.FD.goal()}));
  check("phone out, Foodies set to the training centre", ph.open && ph.where === "ground" && ph.goal === "Order lunch to the training centre", ph);
  await page.evaluate(() => { __bot.look(20); const r = kpFoodiesPick("fruit"); window.__ordered = r; if (typeof closePhone === "function") closePhone(); __bot.idle(2); });
  check("the order went through", await page.evaluate(() => (S.orders || []).length === 1 && S.orders[0].where === "ground"), await page.evaluate(() => window.__ordered));
  await doneStep("H16", true);

  // H17 The ball: pick it up, put it down out of the way
  await page.evaluate(() => { const B = __bot, d = S.drops.find(d => d.item.id === "ball"); B.listen(); B.look(); B.place(d.x - .9, B.flat().base + .02, d.z - .6); B.aim(d.x, d.y, d.z); B.idle(1); B.click(); B.idle(1); });
  s = await state(); check("the ball in both hands: 'G puts it down. Find it a spot out of the way.'", s.hand === "ball" && /G puts it down\. Find it a spot out of the way\./.test(s.hint), s);
  // the ball already in your hands when the step began (no starting spot on the floor): the step still has a start,
  // and putting the ball down anywhere ends it (no soft-lock until a reload)
  const b0held = await page.evaluate(() => { delete S.onb.seen.ball0; __bot.idle(.5); return S.onb.seen.ball0 || null; });
  check("ball in hand when H17 began: its start is 'held', so any put-down counts", !!(b0held && b0held.held), b0held);
  await page.evaluate(() => { const B = __bot; B.look(); B.P.yaw += Math.PI*.6; B.P.pitch = -.3; B.step(2); B.key("g"); B.idle(4); B.listen(); });
  await doneStep("H17", true);

  // H18 Neighbourhood: out on the street, past the Mini Market and the barber
  await page.evaluate(() => { const B = __bot; B.walk(B.stairs() + 30); B.place(19, .12, 5.2, -Math.PI/2); B.idle(2); B.listen(); B.look(); B.walk(14); B.place(11.9, .12, 13.5, Math.PI); B.idle(2); B.listen(); });
  await doneStep("H18", true);

  // H19 Compass: turn to face the bus stop
  await page.evaluate(() => { const B = __bot; B.walk(6); B.place(8, .12, 10, 0); B.listen(); B.look(); B.aim(3, 1.5, 15.2); B.idle(1); });
  await doneStep("H19", true);

  // H20 Bus stop: walk to it, E: the Line 14 panel
  await page.evaluate(() => { const B = __bot; B.listen(); B.walk(7); B.place(3, .12, 14.6, Math.PI); B.idle(4); B.P.yaw = Math.PI; B.P.pitch = 0; B.step(3); B.key("e"); B.idle(.5); });
  const bus = await page.evaluate(() => { const b = [...document.querySelectorAll(".bus-opt")].find(x => /busGo\('ground'\)/.test(x.getAttribute("onclick"))); return {min: S.life.min, disabled: b ? b.disabled : null, em: b ? b.querySelector("b em").textContent : null}; });
  out.busLesson = bus.min;
  check(`the bus lesson is reached between 9:00 and 9:40 (at ${Math.floor(bus.min/60)}:${String(Math.floor(bus.min % 60)).padStart(2, "0")})`, bus.min >= 540 && bus.min <= 580, bus);
  check("before 9:20 the training centre is shut: 'From 9:20 AM today. The club wants you there at 10:00 AM.'", bus.min >= 560 || (bus.disabled === true && bus.em === "From 9:20 AM today. The club wants you there at 10:00 AM."), bus);
  await snap(page, "wpH-day-H20");
  await page.evaluate(() => { if (window.lifePanelClose) window.lifePanelClose(); __bot.idle(2); });
  await doneStep("H20", false);

  // H21 The gate: wait on the shelter bench until the bus to training, then take it
  s = await state(); check("H21: 'Take the bus to the training centre'", s.cur === "H21" && s.goal === "Take the bus to the training centre", s);
  await page.evaluate(() => { const B = __bot; B.aimSpot("Bench"); B.key("e"); B.idle(.3); });
  const wait = await page.evaluate(() => [...document.querySelectorAll(".wait-opt b")].map(b => b.textContent));
  check("the shelter bench offers 'Until the bus to training'", wait.some(t => /^Until the bus to training · 9:20 AM$/.test(t)) || (await page.evaluate(() => S.life.min)) >= 560, wait);
  await page.evaluate(() => { const b = [...document.querySelectorAll(".wait-opt")].find(x => /Until the bus to training/.test(x.textContent)); if (b) b.click(); for (let i = 0; i < 40 && __life.busy; i++) __bot.idle(.5); __bot.idle(1); });
  await page.evaluate(() => { const B = __bot; B.P.yaw = Math.PI; B.P.pitch = 0; B.step(2); B.key("e"); B.idle(.3); });
  const open = await page.evaluate(() => { const b = [...document.querySelectorAll(".bus-opt")].find(x => /busGo\('ground'\)/.test(x.getAttribute("onclick"))); return {min: S.life.min, disabled: b ? b.disabled : null}; });
  check("from the gate the training centre bus is open", open.disabled === false, open);
  await page.evaluate(() => { busGo("ground"); });
  // (the ride: the fade and its card run on timers and on the world's frames, which the bot steps)
  for (let i = 0; i < 80 && !(await page.evaluate(() => window.__life.LIFE.zone === "ground" && !window.__life.busy)); i++){ await page.waitForTimeout(150); await page.evaluate(() => __bot.idle(.5)); }
  const end = await page.evaluate(() => ({zone: __life.LIFE.zone, step: S.onb.step, flags: Object.assign({}, S.flags), trust: S.trust, min: S.life.min, excused: S.life.att.excused}));
  check("off the bus at the training centre, the home chapter is over", end.zone === "ground" && end.step === "done" && end.flags.ApartmentTutorialCompleted, end);
  check("no trust change on day one", end.trust === t0.trust, {before: t0.trust, after: end.trust});
  await snap(page, "wpH-day-H21");
  // every line of DESIGN 3.7.5 the bot's run calls for, word for word, its numbers from the constants
  const said = SAID_BEFORE.concat(await linesSaid());
  out.lines = said;
  const want = await page.evaluate(() => {
    const U = "Uncle Nelu", Y = "You";
    // (two of the flat's three things looked at end H2: the bot looks at the mattress and the fridge)
    return [[Y, "A mattress on the floor. Home sweet home."], [Y, "That fridge has seen better days."],
      [Y, "Looks like the light doesn't even have a bulb."], [U, `The furniture shop next to your block sells them. They're ${eur(HARDWARE.bulb.price)}. Go grab one.`],
      [U, "Take it to the till. Put it on the belt, then pay at the card reader."], [Y, "Somebody across the hall really hates doors."],
      [U, "Put the bulb into the empty socket, then follow the prompt to screw it in."], [Y, "The light works. Not exactly luxury, but at least you can see."],
      [U, "Switch it off when you go out. Lights left on end up on the bill."], [U, "Before you head anywhere, check the mailbox. You never know what the landlord left in there."],
      [Y, "Rent and electricity are covered for three months. After that the bill comes here, so keep an eye on it."],
      [U, "Check the board before you head out. The building usually posts anything important there."],
      [Y, "Quiet today. When something's up in the building, this is where you'll hear about it first."],
      [U, "Couriers leave your food on that table. Pick the bag up and carry it to a fridge, and the food goes in."],
      [U, "Better fridges keep more of what food is worth. Same food at the training centre, by the way. One stock, two fridges."],
      [U, "Messages, your stats, and Foodies are all in here. Order some lunch and have it sent to the training centre."],
      [U, "And get that ball off the floor before you trip over it."], [Y, "There. You can pick it up and move it any time."],
      [Y, "Whatever you buy here goes straight into your fridge."], [Y, "The barber. New cuts cost money, but once you've paid for one it's yours."],
      [U, "See that compass at the top? It'll point you toward places nearby."], [U, "Only places around your current neighbourhood show up."],
      [U, `Line 14 goes to the training centre and to Dumbrava. The ride to training takes ${busMins("home", "ground")} minutes.`],
      [U, `Training starts at ${fmtTime(SESSION.start)}. You can head over now.`]];
  });
  const missing = want.filter(([w, t]) => !said.some(l => l.who === w && l.text === t));
  check("every line of the run, word for word", !missing.length, missing);
  const EM = String.fromCharCode(0x2014);
  check("no em dash in anything said", !said.some(l => l.text.includes(EM)));
  out.order = out.steps.map(x => x.id);
} catch(e){ out.error = String(e && e.stack || e); console.log(out.error); await snap(page, "wpH-day-error").catch(() => {}); }
finally {
  out.errors = page.errors.slice();
  out.ok = !out.error && !out.errors.length && out.checks.every(c => c.ok);
  if (out.errors.length) console.log("errors:\n  " + out.errors.join("\n  "));
  report("wpH-day", out);
  await close();
}
console.log(out.ok ? "wpH-day: pass" : "wpH-day: FAIL");
process.exit(out.ok ? 0 : 1);
