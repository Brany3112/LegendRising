// qa/tr2b-shield.mjs: the shield on C, the shoulder check on V, and Ctrl as a shield key only in a locked full screen
// (browser, trusted keys). BUILD-PLAN Phase 2b, P2b-B acceptance "tr2b-shield"; TRAINING-SPEC section 0 (shield key)
// and section 3 (shield behaviour); ball-5, ball-12, ball-13.
// Owner: P2b-B (TR-2b).
//
// Every key below is a real key press (page.keyboard), with the pointer held on the 3D view as a player has it:
//   - holding C with the ball sets intent.shield; walking on with W and Shift held you go at most 0.6 x your jog, and
//     the ball stays on the far side of you from the defender behind you; letting C go ends the shield;
//   - C no longer turns the look (no shoulder check); V held does, and letting it go turns back;
//   - outside full screen Ctrl does nothing: no shield, and Ctrl+D is still dropped (D9);
//   - with navigator.keyboard stubbed (headless Chromium has no real keyboard lock), full screen plus the lock makes
//     Ctrl shield; with Ctrl held, D and A turn and move you, Shift sets the sprint key, Space and R register; Alt+D
//     and Meta+D are still dropped. The same in a career drill (mode 'train');
//   - the full-screen tip shows once (the first shield on this device), leaves when full screen starts, and never
//     comes again.
//
//   QA_PORT=8851 node qa/tr2b-shield.mjs        exits 1 on any failed check; writes qa/out/tr2b-shield.json
import {launch, career, freeze, unfreeze, snap} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";
import {lockPointer, pointerLocked} from "./trlib.mjs";

const {check, done} = checker("tr2b-shield");
const {page, close} = await launch({gfx: "low", seed: 5, w: 960, h: 600});
let ok = false;
const step = n => page.evaluate(n => window.__life.stepN(n), n);
const hold = async (keys, n) => { for (const k of keys) await page.keyboard.down(k); await step(n); };
const lift = async keys => { for (const k of keys.slice().reverse()) await page.keyboard.up(k); };
try {
  await page.evaluate(() => { try { localStorage.removeItem("freyaFootball.tipFS"); } catch(e){} });
  // (late morning at the training ground: the career's drills are open, for the drill check below)
  await career(page, {zone: "ground", min: 11*60, pos: "ST"});
  await page.evaluate(() => {
    const L = window.__life, F = window.__fp;
    window.__t = {
      put(a, x, z, yaw){ a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.target = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.onPitch = true; },
      // you on the ball at (-10, 0) facing +x, the centre-back right behind you, pressing; the cover lifted
      setup(){
        const ms = F.ms, me = F.me(), b = ms.ball;
        const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } L.FADE.v = 0;
        this.put(me, -10, 0, -Math.PI/2); L.P.yaw = -Math.PI/2; L.P.pitch = -.2;
        b.p.x = -9.4; b.p.y = .11; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
        ms.poss.ctl = me.id; ms.poss.team = me.team; ms.poss.agent = me.id;
        const def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
        this.put(def, -11.1, .15, -Math.PI/2); def.cool.tackle = ms.t + 99;
        return {me: me.id, def: def.id};
      },
      st(){
        const ms = F.ms, me = F.me(), C = F.ctrl, b = ms.ball, def = ms.agents.find(a => a.team !== me.team && a.slot === "CB");
        // the ball's side: + when it is on the far side of you from him (you between them)
        const far = def ? ((b.p.x - me.m.x)*(me.m.x - def.m.x) + (b.p.z - me.m.z)*(me.m.z - def.m.z))/(Math.hypot(me.m.x - def.m.x, me.m.z - def.m.z) || 1) : 0;
        return {shield: !!me.intent.shield, ctrlShield: C.shield, scan: !!C.scan, held: Object.assign({}, C.held), speed: me.m.speed, jog: me.prm.jog, yaw: me.m.yaw,
          x: me.m.x, z: me.m.z, far, poss: ms.poss.ctl === me.id, dx: me.intent.dx, dz: me.intent.dz, queue: C.queue.map(q => q.k), last: C.last};
      }
    };
  });
  const fsOn = async () => {
    await page.evaluate(() => {
      const kb = {locks: 0, unlocks: 0, lock(){ this.locks++; return Promise.resolve(); }, unlock(){ this.unlocks++; }};
      Object.defineProperty(navigator, "keyboard", {value: kb, configurable: true});
      window.__kb = kb;
      if (!window.__fsc){ window.__fsc = 0; document.addEventListener("fullscreenchange", () => window.__fsc++); }
    });
    // (the full-screen request needs a user's gesture: a real key press is one; the game's own button does it)
    await page.evaluate(() => { window.__fsReq = () => document.documentElement.requestFullscreen().then(() => true, e => String(e)); addEventListener("keydown", e => { if (e.code === "F9" && window.__fsReq) window.__fsRes = window.__fsReq(); }, {once: true}); });
    await page.keyboard.press("F9");
    // (the change is the browser's to announce, at its next frame: the page runs its frames meanwhile, up to 5 s)
    await unfreeze(page);
    await page.waitForFunction(async () => { const K = (await import("./js/life/core/keylock.js")).KEYLOCK; return K.fs && K.locked; }, null, {polling: 100, timeout: 5000}).catch(() => {});
    await freeze(page);
    return page.evaluate(async () => { const r = await window.__fsRes; const K = (await import("./js/life/core/keylock.js")).KEYLOCK; return {req: r, fs: !!document.fullscreenElement, K: Object.assign({}, K), locks: window.__kb.locks, fsc: window.__fsc, urls: performance.getEntriesByType("resource").map(e => e.name).filter(n => /keylock/.test(n))}; });
  };
  // ---- 6. the same in a career drill (mode 'train')
  const drill = await page.evaluate(async () => {
    const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS.shoot;
    L.place({x: D.spot.x, z: D.spot.z - 28, y: 0, yaw: -Math.PI/2}); L.stepN(20);
    const sp = L.spots.find(s => s.label === D.label);
    if (!sp) return {error: "no drill spot", labels: L.spots.map(s => s.label).slice(0, 40), zone: L.LIFE.zone};
    L.use(sp);
    return {used: true};
  });
  // (the drill comes up over real frames: the page runs its own while it does, up to 20 s)
  if (!drill.error){
    await unfreeze(page);
    await page.waitForFunction(() => !!(window.__train && window.__train.RUN.T) && window.__life.modes.mode() === "train", null, {polling: 200, timeout: 20000}).catch(() => {});
    await freeze(page);
    Object.assign(drill, await page.evaluate(() => ({mode: window.__life.modes.mode(), on: !!(window.__train && window.__train.RUN.T)})));
  }
  if (drill.error || !drill.on) check(false, "a career drill started (mode 'train')", drill);
  else {
    check(drill.mode === "train", "a career drill started (mode 'train')", drill);
    const fsd = await fsOn();
    check(fsd.fs && fsd.K.locked, "a drill: full screen with the keyboard lock (stubbed)", fsd);
    await unfreeze(page); await page.waitForTimeout(300);
    if (!(await pointerLocked(page))) await lockPointer(page);
    await freeze(page);
    const tr = async () => page.evaluate(() => { const TR = window.__train, C = TR.CTRL || window.__fp.ctrl, me = TR.me; return {held: Object.assign({}, C.held), dx: me ? me.intent.dx : 0, dz: me ? me.intent.dz : 0, shield: me ? !!me.intent.shield : false}; });
    await hold(["Control"], 6);
    await page.keyboard.down("d"); await step(6);
    const t1 = await tr();
    await page.keyboard.up("d"); await page.keyboard.down("Shift"); await step(2);
    const t2 = await tr();
    await page.keyboard.up("Shift");
    // Space and R with Ctrl still down: they reach the drill's controls (R held a moment: its call goes on the release)
    const trq = async () => page.evaluate(() => { const TR = window.__train, C = TR.CTRL || window.__fp.ctrl; return {held: Object.assign({}, C.held), queue: C.queue.map(q => q.k), last: C.last}; });
    await page.keyboard.down("r"); await step(1);
    const t2r = await trq();
    await page.keyboard.up("r");
    await page.keyboard.down("Space");
    const t2s = await trq();
    await page.keyboard.up("Space"); await step(2);
    await lift(["Control"]); await step(2);
    await page.keyboard.down("Alt"); await page.keyboard.down("d"); await step(3);
    const t3 = await tr();
    await page.keyboard.up("d"); await page.keyboard.up("Alt"); await step(2);
    check(t1.held.d && (Math.abs(t1.dx) + Math.abs(t1.dz) > .5), "a drill (mode 'train'): with Ctrl held in a locked full screen, D moves you", t1);
    check(t2.held.shift, "a drill: with Ctrl held, Shift sets the sprint key", t2.held.shift);
    check(t2r.held.r && (t2s.held.space || t2s.queue.includes("space")), "a drill: with Ctrl held, R and Space register", {heldR: !!t2r.held.r, space: !!t2s.held.space, queue: t2s.queue});
    check(!t3.held.d, "a drill: Alt+D is still dropped", t3.held.d);
    // out of full screen and out of the drill again
    await page.evaluate(async () => { await document.exitFullscreen().catch(() => {}); });
    // (Esc steps out of a drill, as a player leaves it)
    await page.keyboard.press("Escape"); await step(5);
    await unfreeze(page); await page.waitForTimeout(800); await freeze(page);
    check(await page.evaluate(() => window.__life.modes.mode() !== "train"), "a drill: Esc steps out of it", await page.evaluate(() => window.__life.modes.mode()));
  }

  await page.evaluate(() => window.__fp.enter("test:stamina", {}));
  await unfreeze(page); await page.waitForTimeout(1200);
  check(!!(await lockPointer(page)), "the pointer locked by a real click on the 3D view");
  await freeze(page);
  await page.evaluate(() => window.__t.setup());
  await step(5);

  // ---- 1. C held on the ball: the shield; walking on with it held, slowed and the ball kept from him
  await hold(["c"], 20);
  const s1 = await page.evaluate(() => window.__t.st());
  check(s1.shield && s1.ctrlShield, "C held with the ball yours: intent.shield is set", {shield: s1.shield, ctrl: s1.ctrlShield});
  // (the first shield on this device: the full-screen tip comes up on the HUD; let the page draw a few frames of it)
  await unfreeze(page); await page.waitForTimeout(400); await freeze(page);
  const tip0 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#fpHud .fp-card")].filter(c => /full screen/i.test(c.textContent));
    const vis = cards.filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && +cs.opacity > 0.05; });
    // (the card shown is marked: what is seen later is told apart as this one still up or a new one)
    for (const c of cards) c.dataset.tipFirst = "1";
    return {seen: vis.length > 0, text: vis.length ? vis[0].textContent : null};
  });
  // (the defender stays on your back, 1.2 m behind you away from the ball, every step: he leans on you without taking
  // it, so what is measured is your own shield)
  await page.keyboard.down("w"); await page.keyboard.down("Shift");
  const follow = n => page.evaluate(n => { const F = window.__fp, ms = F.ms, me = F.me(), b = ms.ball, def = ms.agents.find(a => a.team !== me.team && a.slot === "CB"), out = [];
    for (let i = 0; i < n; i++){
      const dx = b.p.x - me.m.x, dz = b.p.z - me.m.z, d = Math.hypot(dx, dz) || 1;
      def.m.x = def.x0 = me.m.x - dx/d*1.2; def.m.z = def.z0 = me.m.z - dz/d*1.2; def.m.vx = me.m.vx; def.m.vz = me.m.vz; def.cool.tackle = ms.t + 99;
      window.__life.stepN(1); out.push(window.__t.st());
    }
    return out; }, n);
  await follow(120);
  let vmax = 0, farMin = Infinity, poss = 0;
  for (const s of await follow(60)){ vmax = Math.max(vmax, s.speed); farMin = Math.min(farMin, s.far); poss += s.poss ? 1 : 0; }
  const s1b = await page.evaluate(() => window.__t.st());
  check(vmax <= .6*s1b.jog + .05, "shielding with W and Shift held: at most 0.6 x your jog", {vmax: +vmax.toFixed(2), cap: +(.6*s1b.jog).toFixed(2)});
  check(poss >= 50 && farMin > 0, "shielding: the ball stays on the far side of you from the defender", {farMin: +farMin.toFixed(2), framesWithBall: poss});
  await lift(["w", "Shift"]);
  await lift(["c"]); await step(3);
  const s1c = await page.evaluate(() => window.__t.st());
  check(!s1c.shield && !s1c.ctrlShield, "letting C go ends the shield", s1c.shield);

  // ---- 2. C no longer scans; V held does
  await page.evaluate(() => window.__t.setup()); await step(3);
  await hold(["c"], 6);
  const s2a = await page.evaluate(() => window.__t.st());
  await lift(["c"]); await step(3);
  await hold(["v"], 6);
  const s2b = await page.evaluate(() => window.__t.st());
  await lift(["v"]); await step(20);
  const s2c = await page.evaluate(() => window.__t.st());
  check(!s2a.scan, "C held: no shoulder check any more", s2a.scan);
  check(s2b.scan && !s2c.scan, "V held: the shoulder check; let go, it turns back", {held: s2b.scan, after: s2c.scan});

  // ---- 3. outside full screen Ctrl is the browser's: no shield, and Ctrl+D is dropped
  await page.evaluate(() => window.__t.setup()); await step(3);
  const fs0 = await page.evaluate(() => ({fs: !!document.fullscreenElement}));
  await hold(["Control"], 10);
  const s3a = await page.evaluate(() => window.__t.st());
  await page.keyboard.down("d"); await step(10);
  const s3b = await page.evaluate(() => window.__t.st());
  await page.keyboard.up("d"); await lift(["Control"]); await step(3);
  check(!fs0.fs && !s3a.shield, "outside full screen: Ctrl held does not shield", {fs: fs0.fs, shield: s3a.shield});
  check(!s3b.held.d && s3b.dx === 0 && s3b.dz === 0, "outside full screen: Ctrl+D is still dropped (D9)", {heldD: !!s3b.held.d, dx: s3b.dx, dz: s3b.dz});

  // ---- 4. the tip: shown once, on the first shield (it was the C shield above)
  const tip1 = await page.evaluate(() => ({seen: [...document.querySelectorAll("#fpHud .fp-card b")].some(b => /full screen/i.test(b.textContent)), stored: localStorage.getItem("freyaFootball.tipFS")}));
  check(tip0.seen && tip1.stored === "1", "the full-screen tip came up on the HUD at the first shield (and is stored on this device)", {seen: tip0.seen, text: tip0.text, stored: tip1.stored});

  // ---- 5. full screen with the keyboard lock (stubbed): Ctrl shields, and you can move while you hold it
  const fs1 = await fsOn();
  check(fs1.fs && fs1.K.fs && fs1.K.locked && fs1.locks >= 1, "full screen: the keyboard lock is asked for and granted (KEYLOCK.fs and .locked)", fs1);
  // (the tip has been followed: going full screen takes its card away at once, not at the end of its 3.5 s; on a fast
  // machine the card was still up here, and seen again below it read as the tip shown a second time)
  const tipFs = await page.evaluate(() => ({up: [...document.querySelectorAll("#fpHud .fp-card")].filter(c => /full screen/i.test(c.textContent) && !c.classList.contains("out")).length}));
  check(tipFs.up === 0, "full screen: the tip's card has gone", tipFs);
  // (full screen can take the pointer: it is locked again the way a player does it)
  await unfreeze(page); await page.waitForTimeout(300);
  if (!(await pointerLocked(page))) await lockPointer(page);
  await freeze(page);
  const moveWithCtrl = async label => {
    await page.evaluate(() => window.__t.setup()); await step(3);
    await hold(["Control"], 12);
    const a = await page.evaluate(() => window.__t.st());
    const yaw0 = a.yaw;
    await page.keyboard.down("d"); await step(30);
    const b = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("d");
    await page.keyboard.down("a"); await step(4);
    const c = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("a");
    await page.keyboard.down("Shift"); await step(2);
    const d = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("Shift");
    // Space and R: pressed (R held a moment: its call goes on the release) with Ctrl still down
    await page.keyboard.down("r"); await step(1);
    const e = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("r");
    await page.keyboard.press("Space");
    const f = await page.evaluate(() => window.__t.st());
    await step(2);
    // Alt+D and Meta+D: still nobody's
    await lift(["Control"]); await step(2);
    await page.keyboard.down("Alt"); await page.keyboard.down("d"); await step(3);
    const g = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("d"); await page.keyboard.up("Alt");
    await page.keyboard.down("Meta"); await page.keyboard.down("d"); await step(3);
    const h = await page.evaluate(() => window.__t.st());
    await page.keyboard.up("d"); await page.keyboard.up("Meta"); await step(2);
    check(a.shield && a.ctrlShield, `${label}: full screen and the lock, Ctrl held: the shield`, {shield: a.shield});
    check(b.held.d && (Math.abs(b.dx) + Math.abs(b.dz) > .5) && Math.hypot(b.x - a.x, b.z - a.z) > .05, `${label}: with Ctrl held, D moves you`, {heldD: !!b.held.d, dx: b.dx, dz: b.dz, moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(3), yaw: [+yaw0.toFixed(2), +b.yaw.toFixed(2)]});
    check(c.held.a && (Math.abs(c.dx) + Math.abs(c.dz) > .5), `${label}: with Ctrl held, A moves you the other way`, {heldA: !!c.held.a, dx: c.dx, dz: c.dz});
    check(d.held.shift, `${label}: with Ctrl held, Shift sets the sprint key`, !!d.held.shift);
    check(e.held.r && (f.queue.includes("space") || f.last === "jump" || f.last === "header" || f.held.space === false), `${label}: with Ctrl held, R and Space register`, {heldR: !!e.held.r, queue: f.queue, last: f.last, space: f.held.space});
    check(!g.held.d && !h.held.d, `${label}: Alt+D and Meta+D are still dropped`, {alt: !!g.held.d, meta: !!h.held.d});
  };
  await moveWithCtrl("a match");

  // ---- 7. full screen left: the lock released, Ctrl the browser's again; the tip never comes back
  const out = await page.evaluate(async () => { await document.exitFullscreen().catch(() => {}); await new Promise(r => setTimeout(r, 200)); const K = (await import("./js/life/core/keylock.js")).KEYLOCK; return {K: Object.assign({}, K), unlocks: window.__kb.unlocks}; });
  check(!out.K.fs && !out.K.locked && out.unlocks >= 1, "full screen left: the keyboard lock is released", out);
  const tipAgain = await page.evaluate(async () => {
    const F = window.__fp; F.enter("test:stamina", {}); window.__t.setup();
    const K = await import("./js/life/core/keylock.js");
    return {due: K.tipFSDue()};
  });
  await hold(["c"], 30);
  const tip2 = await page.evaluate(() => ({cards: [...document.querySelectorAll("#fpHud .fp-card b")].map(b => b.textContent),
    again: [...document.querySelectorAll("#fpHud .fp-card")].filter(c => /full screen/i.test(c.textContent)).map(c => c.dataset.tipFirst ? "the first, still up" : "a new one"),
    stored: localStorage.getItem("freyaFootball.tipFS")}));
  await lift(["c"]);
  check(!tipAgain.due && !tip2.cards.some(t => /full screen/i.test(t)), "the tip does not show a second time", {due: tipAgain.due, cards: tip2.cards, again: tip2.again, stored: tip2.stored});
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
