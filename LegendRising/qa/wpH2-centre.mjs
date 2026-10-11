// qa/wpH2-centre.mjs: the first day at the training centre, G1 to G9 (DESIGN 3.7.6, 2.4 WP-H2 acceptance, 4.9
// "centre", "each step", "day-one rules", "reload", "text").
// Owner: WP-H2 (Stage 2).
//
//   node qa/wpH2-centre.mjs [--quick]     exits 1 on any failed check, console error or page error; writes
//                                         qa/out/wpH2-centre.json and a screenshot per chapter (qa/out/wpH2-centre-G*.png)
//
// A career whose flat chapter is done (lunch ordered to the training centre at 8:55, as H16 has you do) takes the
// 9:20 bus from its street. At the gate the assistant coach meets you and walks you round; the bot walks with him
// (it keeps a couple of metres behind him, as a player following him would; the world is stepped for real, so the
// clock is the first day's own) and does what each chapter asks through the game's input: the pitch, the lads, the
// gym, the bag off the clubhouse counter carried to the gym fridge (the food goes into S.inv) and the fridge opened,
// the dressing room (your locker has your number), E on the manager (his card, once), the coach on the pitch and the
// six lessons on the match's controls (training.js, played by the lesson bot). Every line of 3.7.6 must be said word
// for word; trust must not move on day one; the slow clock must hold until the lessons. With the tour reloaded half
// way it resumes where it was, nothing duplicated. A second career shows the postponement (a tour not done by 3:30 PM
// carries on the next day, still excused) and the early arrival after the first day. --quick leaves out the lessons.
import {launch, snap, report, freeze, CAREER_AT} from "./lib.mjs";
import {playLessons} from "./wpH2-lessonbot.mjs";

const QUICK = process.argv.includes("--quick");
const out = {checks: [], steps: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 300) : ""}`); };
const hm = m => `${Math.floor(m/60)}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
let page, close, errors = [], r;

async function botInit(){
  await page.evaluate(async () => {
    const [fd, inv, ground] = await Promise.all(["firstday", "inv", "ground"].map(m => import(`./js/life/${m}.js`)));
    const L = window.__life, P = L.P;
    const cv = document.getElementById("lifeCanvas");
    Object.defineProperty(document, "pointerLockElement", {configurable: true, get: () => cv});
    const B = window.__bot = {
      fd, inv, ground, P,
      step(n = 2){ return L.stepN(n, 1/60); },
      place(x, y, z, yaw = P.yaw){ L.place({x, y, z, yaw}); B.step(3); },
      aim(x, y, z){ const dx = x - P.x, dz = z - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(y - P.eye, Math.max(.05, Math.hypot(dx, dz))); B.step(2); return L.held ? L.held.label : null; },
      key(k, hold = 2){ dispatchEvent(new KeyboardEvent("keydown", {key: k, bubbles: true})); B.step(hold); dispatchEvent(new KeyboardEvent("keyup", {key: k, bubbles: true})); B.step(2); },
      click(){ dispatchEvent(new MouseEvent("mousedown", {button: 0, bubbles: true})); B.step(1); dispatchEvent(new MouseEvent("mouseup", {button: 0, bubbles: true})); B.step(2); },
      idle(secs){ B.step(Math.round(secs*60)); },
      listen(max = 30){ for (let i = 0; i < max*4 && fd.saying(); i++) B.step(15); },
      // walking with the assistant coach: a couple of metres behind him, for up to `secs` of the world, until `until()`
      follow(secs, until){
        const n = Math.round(secs*4);
        for (let i = 0; i < n; i++){
          const gd = fd.FD.guide(), g = gd.pos;
          if (g){
            // behind him on his way (toward where he has come from), or where you are if you are already close
            const d = Math.hypot(P.x - g.x, P.z - g.z), nx = gd.path.length ? fd.FD.NODES[gd.path[0]] : null;
            if (d > 2.6){
              let bx = P.x - g.x, bz = P.z - g.z;
              if (nx){ bx = g.x - nx[0]; bz = g.z - nx[1]; }
              const bl = Math.hypot(bx, bz) || 1;
              L.place({x: g.x + bx/bl*2.1, z: g.z + bz/bl*2.1, y: 0, yaw: Math.atan2(bx, bz)});
            }
          }
          B.step(15);
          if (until && until()) return true;
        }
        return until ? !!until() : true;
      },
      // walking somewhere at 1.4 m/s (stepped for real, a straight line: the bot is put at each point along it)
      walkTo(x, z, y = 0){
        const d = Math.hypot(x - P.x, z - P.z), n = Math.max(1, Math.round(d/1.4*4)), x0 = P.x, z0 = P.z, yaw = Math.atan2(-(x - x0), -(z - z0));
        for (let i = 1; i <= n; i++){ L.place({x: x0 + (x - x0)*i/n, z: z0 + (z - z0)*i/n, y, yaw}); B.step(12); }
      },
      cur: () => fd.FD.currentId(),
      state(){ return {cur: fd.FD.currentId(), step: S.onb.step, min: Math.round(S.life.min*10)/10, goal: fd.FD.goal(), zone: L.LIFE.zone, trust: S.trust, hand: inv.hand() ? inv.hand().id : null, guide: fd.FD.guide().at}; }
    };
  });
}
const state = () => page.evaluate(() => __bot.state());
async function done(id, shot = true){
  const s = await state(), order = await page.evaluate(() => __bot.fd.STEP_IDS);
  const k = order.indexOf(id), now = s.cur ? order.indexOf(s.cur) : order.length;
  out.steps.push(Object.assign({id}, s));
  check(`${id} done by its action (now on ${s.cur || "nothing"}, ${hm(s.min)})`, now > k, s);
  if (shot) await snap(page, `wpH2-centre-${id}`);
  return s;
}
// a career whose flat chapter is done, at its own bus stop, lunch ordered to the training centre
async function newDayOne(min, {order = true} = {}){
  await page.evaluate(({now, min, order}) => {
    const real = Date.now; Date.now = () => now;
    try { careerShell(); applyCreation({name: "Andrei Popa", number: 9, pos: "ST", pref: "ST", foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30}); document.body.classList.add("life"); A.sign(0); } finally { Date.now = real; }
    S.flags.FirstTimeIntroductionCompleted = true;
    const seen = {slam: true}; for (let i = 1; i <= 20; i++) seen["H" + i] = true;
    S.onb = {v: 2, step: "H21", seen};
    S.home.win = {state: "broken", at: absNow()}; S.home.ballPending = true;
    if (order){ S.life.min = 8*60 + 55; foodiesOrder({fruit: 1}, "ground"); }
    S.life.min = min;
    window.startLife({zone: "home", at: {x: 3, z: 14.6, y: .12, yaw: Math.PI}});
  }, {now: CAREER_AT, min, order});
  await page.waitForFunction(() => window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
}
async function rideToGround(){
  await page.evaluate(() => { busGo("ground"); });
  for (let i = 0; i < 80 && !(await page.evaluate(() => window.__life.LIFE.zone === "ground" && !window.__life.busy)); i++){ await page.waitForTimeout(150); await page.evaluate(() => __bot.idle(.5)); }
  await page.evaluate(() => __bot.idle(.5));
}
async function reload(){
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!window.__life && !!document.querySelector(".slot-main"), null, {timeout: 90000});
  await page.locator(".slot-main").first().click();
  await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
}

try {
  ({page, close} = await launch({gfx: "low", seed: 31}));
  errors = page.errors;

  /* ================= the tour, start to finish ================= */
  await newDayOne(9*60 + 21);
  const t0 = await page.evaluate(() => ({trust: S.trust, chem: S.chem, inv: Object.assign({}, S.inv)}));
  await rideToGround();
  let s = await state();
  check("off the bus: the flat's chapter is done, G1 'Meet the assistant coach at the gate'", s.zone === "ground" && s.cur === "G1" && s.goal === "Meet the assistant coach at the gate", s);
  const gate = await page.evaluate(() => { const g = __bot.fd.FD.guide().pos, P = __bot.P; return {g, d: g && Math.hypot(g.x - P.x, g.z - P.z), visible: !!(__bot.ground.GROUND.assist && __bot.ground.GROUND.assist.h.g.visible)}; });
  check("the assistant coach stands at the gate, a few steps from the bus stop", gate.g && gate.d > 3 && gate.d < 7 && gate.visible, gate);
  await snap(page, "wpH2-centre-arrive");

  // G1: up to him
  await page.evaluate(() => { const B = __bot, g = B.fd.FD.guide().pos; B.walkTo(g.x + .4, g.z + 2.2); B.aim(g.x, 1.6, g.z); B.idle(1); });
  await done("G1");

  // G2: with him out to the pitch (the slow clock: measured over this walk)
  const c0 = await page.evaluate(() => ({min: S.life.min, slow: __bot.fd.FD.slow()}));
  const walked = await page.evaluate(() => __bot.follow(120, () => __bot.cur() !== "G2"));
  const c1 = await page.evaluate(() => S.life.min);
  check("G2: walking out with him, he leads the way to the pitch", walked, await state());
  await done("G2");
  out.clockG2 = {from: c0.min, to: c1, slow: c0.slow};
  check("the first day's slow clock holds at the training centre", c0.slow === true, c0);

  const SAID_EARLY = [];
  // a reload with G3 next (DESIGN 4.9: a reload at any step resumes it): you wake at home and G3 is still to do (it is
  // only skipped at the training centre, on a day with nobody out there); back on the bus the tour goes on from G3,
  // the assistant coach meeting you at the gate and leading on to the pitch
  {
    const before3 = await state();
    SAID_EARLY.push(...await page.evaluate(() => __bot.fd.FD.said()));
    await reload();
    const home3 = await page.evaluate(() => { __bot.idle(1); return {cur: __bot.cur(), zone: __life.LIFE.zone, goal: __bot.fd.FD.goal(), seen: S.onb.seen.G3 || null}; });
    check("reload with G3 next: at home G3 is still to do (not skipped away from the centre), 'Take the bus to the training centre'",
      before3.cur === "G3" && home3.zone === "home" && home3.cur === "G3" && !home3.seen && home3.goal === "Take the bus to the training centre", {before3, home3});
    await page.evaluate(() => { __bot.place(3, .12, 14.6, Math.PI); });
    await rideToGround();
    const back3 = await page.evaluate(() => { __bot.idle(1); const g = __bot.fd.FD.guide(); return {cur: __bot.cur(), to: g.to, pos: g.pos, P: {x: __bot.P.x, z: __bot.P.z}}; });
    check("  back at the training centre: G3 again, the assistant coach meets you at the gate and leads on to the pitch",
      back3.cur === "G3" && !!back3.pos && back3.to === "pitch" && Math.hypot(back3.pos.x - back3.P.x, back3.pos.z - back3.P.z) < 8, back3);
  }

  // G3: over to the nearest of the lads
  await page.evaluate(() => { const B = __bot; B.listen(); for (let i = 0; i < 6 && B.cur() === "G3"; i++){ const m = B.fd.FD.goal() && (() => { let best = null; const T = B.ground.GROUND.session; for (const ac of T.actors) for (const h of ac.kind === "pair" ? ac.P : [ac.P]) if (h.g.visible){ const d = Math.hypot(h.g.position.x - B.P.x, h.g.position.z - B.P.z); if (!best || d < best.d) best = {x: h.g.position.x, z: h.g.position.z, d}; } return best; })(); if (m) B.walkTo(m.x + 2.5, m.z + 1.5); B.idle(1); } });
  await done("G3");

  // G4: the gym, with him (he opens the door)
  await page.evaluate(() => { __bot.listen(); __bot.follow(150, () => __bot.cur() !== "G4"); });
  const gymDoor = await page.evaluate(() => { const d = __life.spots.find(s => s.kind === "drag" && s.label === "Gym door"); return d ? +d.angle.toFixed(2) : null; });
  check("he opens the gym door on the way in", gymDoor > .5, gymDoor);
  await done("G4");

  // G5: the bag on the clubhouse counter
  const bag = await page.evaluate(() => ({parcels: (S.parcels || []).filter(p => p.at === "ground").length, onCounter: __life.spots.filter(s => s.kind === "pick" && /Foodies/.test(s.label || "")).length}));
  check("the Foodies bag is waiting on the clubhouse counter", bag.parcels === 1, bag);
  s = await state(); check("G5: 'Your lunch is at the delivery counter in the clubhouse'", s.cur === "G5" && s.goal === "Your lunch is at the delivery counter in the clubhouse", s);
  await page.evaluate(() => { const B = __bot; B.listen(); B.follow(200, () => { const g = B.fd.FD.guide(); return g.at === "counter" && !g.path.length; }); B.walkTo(19.4, 6.3); B.idle(2.5); B.listen(); });
  r = await page.evaluate(() => { const B = __bot, sp = __life.spots.filter(s => s.kind === "pick" && s.drop === undefined && s.pick && /bag|Foodies/i.test(s.label || "")); const all = __life.spots.filter(s => s.kind === "pick"); return {labels: all.map(s => s.label).slice(0, 12)}; });
  await page.evaluate(() => { const B = __bot, sp = __life.spots.find(s => s.kind === "pick" && /Foodies/i.test(s.label || "")); if (sp){ const a = typeof sp.aim === "function" ? sp.aim() : sp.aim; B.aim((a[0][0] + a[1][0])/2, (a[0][1] + a[1][1])/2, (a[0][2] + a[1][2])/2); B.click(); B.idle(1); } });
  s = await state(); check("the bag picked up off the counter, in your hand", s.hand === "bag", Object.assign({spots: r}, s));
  await done("G5");

  // G6: carried to the gym fridge (the food goes in), then the fridge opened
  const inv0 = await page.evaluate(() => Object.values(S.inv || {}).reduce((a, b) => a + (+b || 0), 0));
  await page.evaluate(() => { const B = __bot; B.listen(); B.follow(240, () => { const g = B.fd.FD.guide(); return g.at === "fridge" && !g.path.length; }); B.walkTo(11.0, 14.5); B.idle(1.5); });
  const put = await page.evaluate(() => ({bags: __bot.inv.bagsOnYou().length, inv: Object.values(S.inv || {}).reduce((a, b) => a + (+b || 0), 0), fruit: S.inv && S.inv.fruit}));
  check("at the gym fridge the food goes into the one food store (S.inv)", put.bags === 0 && put.inv > inv0, Object.assign({inv0}, put));
  s = await state(); check("G6 then: 'Open the gym fridge'", s.cur === "G6" && s.goal === "Open the gym fridge", s);
  // (a step back first, out of the door's way: it stops short of you rather than swinging through you)
  r = await page.evaluate(() => { const B = __bot; B.walkTo(10.0, 14.4); const fr = __life.spots.find(s => s.kind === "drag" && s.label === "Fridge"); const a = fr.aim(); const l = B.aim((a[0][0] + a[1][0])/2, 1.1, (a[0][2] + a[1][2])/2); B.key("e"); B.idle(1.5); return {label: l, angle: +fr.angle.toFixed(2)}; });
  check("the gym fridge opened with E", r.label === "Fridge" && r.angle > 1, r);
  await done("G6");

  // G7: the dressing room; your locker carries your number
  await page.evaluate(() => { const B = __bot; B.listen(); B.follow(240, () => { const g = B.fd.FD.guide(); return B.cur() !== "G7" || (g.at === "dress" && !g.path.length); }); B.walkTo(24.4, 7.4); B.idle(.5); });
  const locker = await page.evaluate(() => { let m = null; __life.scene().traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === "PlaneGeometry" && Math.abs(o.position.x - 26.2) < .05 && Math.abs(o.position.z - 3.764) < .02) m = o; }); return m ? {y: +m.position.y.toFixed(3), map: !!(m.material && m.material.map)} : null; });
  check("your locker carries a real label with your number", locker && locker.map, locker);
  await done("G7");
  await page.evaluate(() => { const B = __bot; B.place(25.6, 0, 4.8, 0); B.aim(26.2, 1.75, 3.76); });
  await snap(page, "wpH2-centre-locker");

  // G8: E on the manager; his lines, then his card, once
  await page.evaluate(() => { const B = __bot; B.listen(); B.follow(160, () => { const g = B.fd.FD.guide(); return g.at === "offDoor" && !g.path.length; }); B.walkTo(23.2, 12.1); B.walkTo(24.6, 14.3); B.idle(.5); });
  r = await page.evaluate(() => { const B = __bot, l = B.aim(26.6, 1.3, 16.2); B.step(3); return {label: l, prompt: (document.getElementById("lifePrompt") || {}).textContent}; });
  check("aimed at the manager on day one: 'The manager · Talk to him'", r.label === "The manager" && /Talk to him/.test(r.prompt), r);
  await page.evaluate(() => { __bot.key("e"); __bot.idle(.5); __bot.listen(); __bot.idle(1); });
  const card = await page.evaluate(() => ({open: !!(window.lifePanelOpen && window.lifePanelOpen()), rows: [...document.querySelectorAll("#lifePanel .onb-card-row")].map(r => [...r.children].map(c => c.textContent.trim()).join(" ")), title: (document.querySelector("#lifePanel h3") || {}).textContent}));
  const want = await page.evaluate(() => __bot.fd.FD.noticesCard().map(([k, v]) => `${k} ${v}`));
  check("his card: 'What the manager notices', with the numbers daily.js settles a day by", card.open && card.title === "What the manager notices" && JSON.stringify(card.rows) === JSON.stringify(want), {card, want});
  check("  +1.2, +0.3 to +0.6 up to three times a week, −3, −6, −10", JSON.stringify(want) === JSON.stringify(["A full session +1.2", "In early as well +0.3 to +0.6, up to three times a week", "Late −3", "Missing training −6", "Missing a match −10"]), want);
  // (once the card has faded in: nothing of the HUD shows through it or over it)
  await page.waitForTimeout(900);
  const cardClear = await page.evaluate(() => {
    const vis = e => !!e && +getComputedStyle(e).opacity > .05 && e.getBoundingClientRect().width > 0;
    const card = document.querySelector("#lifePanel .lpn"), op = +getComputedStyle(document.getElementById("lifePanel")).opacity;
    return {panel: op, cardBg: card ? getComputedStyle(card).backgroundImage.slice(0, 60) : null, shown: ["#onbGoal", "#onbSay", "#onbHint", "#lifeNote"].filter(s => vis(document.querySelector(s)))};
  });
  check("the manager's card is up, solid, with nothing of the HUD showing through it or over its button", cardClear.panel > .99 && !cardClear.shown.length, cardClear);
  await snap(page, "wpH2-centre-G8-card");
  await page.evaluate(() => { window.lifePanelClose(); __bot.idle(.5); });
  s = await done("G8", false);
  check("TrainingCenterTutorialCompleted is set", await page.evaluate(() => S.flags.TrainingCenterTutorialCompleted === true));

  // reload half way through the day: you wake at home and the step is the same, nothing duplicated
  const SAID_BEFORE = await page.evaluate(() => __bot.fd.FD.said());
  const before = await page.evaluate(() => ({cur: __bot.cur(), bags: (S.parcels || []).length + __bot.inv.bagsOnYou().length, fruit: S.inv.fruit, flags: Object.assign({}, S.flags)}));
  await reload();
  const after = await page.evaluate(() => ({cur: __bot.cur(), bags: (S.parcels || []).length + __bot.inv.bagsOnYou().length, fruit: S.inv.fruit, zone: __life.LIFE.zone, goal: __bot.fd.FD.goal()}));
  check("reload in the middle of the tour: the same step, nothing duplicated", after.cur === before.cur && after.bags === before.bags && after.fruit === before.fruit, {before, after});
  if (after.zone !== "ground"){
    check("  back home after the reload: 'Take the bus to the training centre'", after.goal === "Take the bus to the training centre", after);
    await page.evaluate(() => { __bot.place(3, .12, 14.6, Math.PI); });
    await rideToGround();
  }

  // G9: to the coach on the pitch; the lessons start, on the match's own controls
  s = await state(); check("G9: 'Join the coach on the pitch'", s.cur === "G9" && s.goal === "Join the coach on the pitch", s);
  const minBeforeLessons = s.min;
  await page.evaluate(() => { const B = __bot; B.listen(); B.walkTo(-6, -3.4); B.idle(1); });
  // (training.js and the match's controls load on first use)
  await page.waitForFunction(() => window.__train && window.__train.RUN.cur, null, {timeout: 60000}).catch(() => {});
  r = await page.evaluate(() => ({run: window.__train && window.__train.RUN.cur ? window.__train.RUN.cur.kind : null, lessons: __bot.fd.FD.lessons(), slow: __bot.fd.FD.slow()}));
  check("reaching the coach starts your first training: training.js's lessons", r.run === "lessons" && r.lessons, r);
  check("  the first day's slow clock gives way to the lessons' own", r.slow === false, r);
  await snap(page, "wpH2-centre-G9");
  if (!QUICK){
    const played = await playLessons(page, {onLesson: async n => snap(page, `wpH2-centre-L${n}`)});
    const end = await page.evaluate(() => ({flags: Object.assign({}, S.flags), step: S.onb.step, last: window.__train.RUN.last, min: S.life.min, sess: S.life.att.sess, trust: S.trust, active: __bot.fd.FD.active()}));
    check("the six lessons are played out on training.js and decided", end.last && end.last.kind === "lessons" && end.last.ok && end.last.ok.length === 6, end.last);
    check("G9 done: GameplayTutorialCompleted, step 'done', the day's session done", end.flags.GameplayTutorialCompleted && end.flags.TrainingCenterTutorialCompleted && end.step === "done" && end.sess && end.sess.done, end);
    await page.evaluate(() => { __bot.idle(1); __bot.listen(); __bot.idle(1); });
    const said = await page.evaluate(() => __bot.fd.FD.said().slice(-3));
    check("the coach's last word in the first day's own box: 'That'll do for day one. Same time tomorrow.'", said.some(l => l.who === "Coach" && l.text === "That'll do for day one. Same time tomorrow."), said);
    const tr = await page.evaluate(() => { S.life.min = Math.max(S.life.min, 16*60 - 1); __life.pass(2); return {trust: S.trust, settled: S.life.att.settled, excused: S.life.att.excused}; });
    check("no trust change on day one (the session and the settlement at four)", tr.trust === t0.trust && tr.excused, Object.assign({before: t0.trust}, tr));
    await snap(page, "wpH2-centre-done");
  }

  // every line of 3.7.6 the run calls for, word for word, its numbers from the constants
  const lines = SAID_EARLY.concat(SAID_BEFORE).concat(await page.evaluate(() => __bot.fd.FD.said()));
  const want76 = await page.evaluate(quick => {
    const AC = "Assistant coach", first = S.player.name.split(" ")[0];
    const L = [[AC, `You must be ${first}. Welcome. Walk with me, I'll show you round before the lads finish.`],
      [AC, `Team training is out here, ${sessionHours()}, Monday to Friday unless there's a game.`],
      [null, "You're the new one? Welcome. Don't let the coach catch you walking."],
      [AC, "Weights, bikes, sprint lane. Each set takes 45 minutes and trains a couple of skills."],
      [AC, "Deliveries come to this counter. Take the bag to the gym fridge and the food goes in."],
      [AC, "Same food as your fridge at home. It all comes off one stock."],
      [AC, "This is the dressing room. Your locker's the one with your number on it."],
      ["Manager", `Training's at ${fmtTime(SESSION.start)}. Be on time and I notice. Be here early and I notice that too.`],
      ["Manager", "Miss it, and I notice that most of all."]];
    if (!quick) L.push(["Coach", "That'll do for day one. Same time tomorrow."]);
    return L;
  }, QUICK);
  const said = lines.map(l => l.text);
  const missing = want76.filter(([who, t]) => !lines.some(l => l.text === t && (!who || l.who === who)));
  check("every line of DESIGN 3.7.6, word for word", missing.length === 0, missing);
  check("no em dash in anything said", !said.some(t => /\u2014/.test(t)), said.filter(t => /\u2014/.test(t)));
  if (!QUICK){
    const order = out.steps.map(s => s.id);
    check("the chapters in order: G1 to G9", JSON.stringify(order.filter(x => /^G/.test(x))) === JSON.stringify(["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]), order);
  }
  out.timing = {arrive: out.steps[0] && out.steps[0].min, lessons: minBeforeLessons};
  await close();

  /* ================= postponement and the early arrival ================= */
  ({page, close} = await launch({gfx: "low", seed: 32}));
  errors.push(...page.errors); const errs2 = page.errors;
  await newDayOne(14*60 + 30, {order: false});
  await rideToGround();
  s = await state(); check("a late arrival on day one (3:10 PM): the tour begins at the gate", s.cur === "G1", s);
  await page.evaluate(() => { const B = __bot, g = B.fd.FD.guide().pos; B.walkTo(g.x + .4, g.z + 2.2); B.idle(1); B.listen(); S.life.min = 15*60 + 29.8; __life.pass(.01); B.idle(4); B.listen(); B.idle(1); });
  const post = await page.evaluate(() => ({said: __bot.fd.FD.said().slice(-2), goal: __bot.fd.FD.goal(), postponed: __bot.fd.FD.postponed(), slow: __bot.fd.FD.slow(), cur: __bot.cur()}));
  check("not done by 3:30 PM: 'Let's pick this up tomorrow at 10:00 AM.'", post.said.some(l => l.text === `Let's pick this up tomorrow at 10:00 AM.`) && post.postponed, post);
  check("  the objective says when, and the clock runs at its usual rate", post.goal === "Back at the training centre tomorrow, 10:00 AM" && post.slow === false, post);
  // home, the night, the next morning: still excused, the bus to training shut until 9:20, the tour carries on
  const next = await page.evaluate(() => {
    const B = __bot; __life.enterZone("home", "bus"); B.idle(.5);
    while (S.life.day < 2){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    S.life.min = 8*60 + 30; B.idle(1);
    return {day: S.life.day, excused: S.life.att.excused, gate: window.lifeBusGate("home", "ground"), cur: B.cur(), goal: B.fd.FD.goal(), postponed: B.fd.FD.postponed()};
  });
  check("the next day: still excused, the training centre bus shut until 9:20 AM, the tour where it was", next.day === 2 && next.excused && next.gate === "From 9:20 AM today. The club wants you there at 10:00 AM." && next.cur === "G2" && !next.postponed && next.goal === "Take the bus to the training centre", next);
  // after the first day: in 30 to 60 minutes early, the coach's word
  const early = await page.evaluate(() => {
    for (const k in S.flags) S.flags[k] = true; S.onb.step = "done";
    S.life.att.excused = false; S.life.min = 9*60 + 10; __life.pass(.01);
    __life.enterZone("ground", "bus"); __bot.idle(4);
    return {said: __bot.fd.FD.said().slice(-1)[0], box: (document.getElementById("onbSay") || {}).textContent || "", min: S.life.min, td: trainingDay(), fx: !!todaysFixture()};
  });
  check("after the first day, in 30 to 60 minutes early: the coach says 'In early. Good.'", early.said && early.said.who === "Coach" && early.said.text === "In early. Good." && /In early\. Good\./.test(early.box), early);
  // a career from before the training centre's chapters (its flat done long ago, step "done", the centre's flag not
  // set): none of day one's rules come back on a later day; the tour waits for the next arrival there (DESIGN 3.7.7)
  const reopen = await page.evaluate(() => {
    const B = __bot, fd = B.fd;
    __life.enterZone("home", "bus"); B.idle(.5);
    for (const k in S.flags) S.flags[k] = true;
    S.flags.TrainingCenterTutorialCompleted = false; S.flags.GameplayTutorialCompleted = false;
    S.onb = {v: 2, step: "done", seen: {}};
    while (S.life.day < 4){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    S.life.min = 21*60; __life.pass(.01); B.idle(1);
    const home = {day: S.life.day, active: fd.FD.active(), refuse: fd.FD.refuse("sleepDay"), excused: S.life.att.excused, onboarding: onboarding(), goal: fd.FD.goal(), gate: window.lifeBusGate("home", "ground"), step: S.onb.step};
    while (S.life.day < 5){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    S.life.min = 10*60 + 30; __life.pass(.01); B.idle(.5);
    const morning = {excused: S.life.att.excused, active: fd.FD.active()};
    __life.enterZone("ground", "bus"); B.idle(1);
    const ground = {day: S.life.day, active: fd.FD.active(), cur: B.cur(), excused: S.life.att.excused, goal: fd.FD.goal()};
    return {home, morning, ground};
  });
  check("an older career with the centre's chapters still to do: on day 4 at 9 PM none of day one's rules (sleep, excused, bus, objective)",
    reopen.home.step === "G1" && !reopen.home.active && reopen.home.refuse === null && !reopen.home.excused && !reopen.home.onboarding && !reopen.home.goal && reopen.home.gate === null && !reopen.morning.excused && !reopen.morning.active, reopen);
  check("  the next arrival at the training centre starts G1, and that day is excused", reopen.ground.active && reopen.ground.cur === "G1" && reopen.ground.excused && reopen.ground.goal === "Meet the assistant coach at the gate", reopen.ground);
  check("no console or page errors", errors.length === 0 && errs2.length === 0, errors.concat(errs2).slice(0, 5));
} catch(e){
  check("the run finished", false, String(e && e.stack || e).slice(0, 800));
} finally {
  out.ok = out.checks.every(c => c.ok);
  report("wpH2-centre", out);
  console.log(out.ok ? "wpH2-centre: pass" : "wpH2-centre: FAIL");
  if (close) await close().catch(() => {});
  process.exit(out.ok ? 0 : 1);
}
