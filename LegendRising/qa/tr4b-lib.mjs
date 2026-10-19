// qa/tr4b-lib.mjs: helpers the Phase 4 Training tests of P4-B share (tr4-reset, tr4-presets, tr4-pitch).
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance (real input under pointer lock, the career untouched) and
// section 0 "QA conventions"; builds on tr3b-lib.mjs (P3-B) and trlib.mjs (P2-A).
//
//   const t = await trainLaunch({seed: 4, count: true});
//   await enterByButton(t.page);                       // the hub up, by a real click on the title's Training button
//   await closeHubReal(t.page);                        // Esc: into the cage
//   await registerTestScenarios(t.page);               // qa-3v3 (3 v 3 and a keeper) and friends, by registerScenario
import {pressReal, lockPointer} from "./tr3b-lib.mjs";

export * from "./tr3b-lib.mjs";

// the hub closed the player's way (Esc), and the cage's sandbox mode running
export async function closeHubReal(page){
  if (await page.evaluate(() => window.__trainHub && window.__trainHub.hubOpen())){
    await pressReal(page, "Escape");
    await page.waitForFunction(() => !window.__trainHub.hubOpen(), null, {timeout: 10000});
  }
}

/* test scenarios registered through the runner's own API (as a scenario module does), in the cage pitch's frame:
   qa-3v3: me and two team-mates against three and a keeper; its ball is launched as config.launch says ({kind, speed,
   tx, ty, tz}), solved with strike.js solveStrike from the placement (the solver P4-A's teams.js uses), or at rest.
   config.pitch picks the cage (runner pitch switching). config.n and config.m change the counts (Replay Last after a
   configuration change) */
export async function registerTestScenarios(page){
  await page.evaluate(async () => {
    const R = window.__trainRun;
    if (R.scenario("qa-3v3")) return;
    const ST = await import("/js/life/football/strike.js");
    window.__qaStrike = ST;
    const build = (cfg, env) => {
      const spec = env.spec, hx = spec.hx, n = cfg.n != null ? cfg.n : 2, m = cfg.m != null ? cfg.m : 3;
      const ball = {x: hx - 30, y: .11, z: 0, vx: 0, vy: 0, vz: 0};
      if (cfg.launch){
        const L = cfg.launch, kind = L.kind;
        const contact = kind === "driven" ? -1 : kind === "cross" || kind === "loft" ? 1 : 0;
        const r = ST.solveStrike({from: {x: ball.x, y: ball.y, z: ball.z}, target: {x: L.tx, y: L.ty != null ? L.ty : .11, z: L.tz}, speed: L.speed, contact, curl: 0, foot: "R", kind, rollDecel: spec.roll});
        Object.assign(ball, {vx: r.v.x, vy: r.v.y, vz: r.v.z, wx: r.w.x, wy: r.w.y, wz: r.w.z, kind, free: true});
        window.__qaLaunch = {v: {x: r.v.x, y: r.v.y, z: r.v.z}, apex: r.apex, ok: r.ok, speed: Math.hypot(r.v.x, r.v.y, r.v.z)};
      }
      return {myTeam: 0, role: "Attacker", seed: cfg.seed || 41, laws: {out: cfg.out || "rebound"},
        me: {slot: "CM", x: hx - 26, z: 2, yaw: -Math.PI/2},
        mates: Array.from({length: n}, (_, i) => ({slot: ["LW", "RW", "ST", "CAM", "CB"][i], x: hx - 22 - 3*i, z: -12 + 24*i, yaw: -Math.PI/2})),
        opps: Array.from({length: m}, (_, i) => ({slot: ["CB", "CB", "LB", "RB", "CM", "CM"][i], x: hx - 12 + i, z: -8 + 8*i, yaw: Math.PI/2})),
        keeper: {side: "theirs", x: hx - 1.2, z: 0, yaw: Math.PI/2},
        ball};
    };
    R.registerScenario({id: "qa-3v3", category: "attacking", type: "qa3v3", name: "Test three against three", desc: "A test scenario", build});
  });
}

// the pointer locked on the game the player's way (a real click on the 3D view), with the hub and any card out of the way
export async function playLocked(page){
  const id = await lockPointer(page);
  if (!id) throw new Error("the pointer could not be locked");
  return id;
}
// the pause card up and drawn: the overlay's card with its buttons
export const cardUp = page => page.waitForFunction(() => { const o = document.getElementById("fpOverlay"); return !!o && o.classList.contains("on") && !!o.querySelector('[data-q="resume"]'); }, null, {timeout: 15000});
export const cardState = page => page.evaluate(() => { const o = document.getElementById("fpOverlay"); return {on: !!o && o.classList.contains("on"), items: o ? [...o.querySelectorAll("[data-q]")].map(b => b.dataset.q) : [], quick: !!(window.__trainQuick && window.__trainQuick.quickIsOpen()), lock: document.pointerLockElement ? document.pointerLockElement.id || "?" : null}; });
// n real frames
export const frames = (page, n) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => { if (++k >= n) r(); else window.__qa.realRAF(f); }; window.__qa.realRAF(f); }), n);
// (BCS) a key tapped twice, a double tap (control.js KNOCK_TAP: a press within 0.3 s of real time of the one before,
// that one not itself the second of a pair), by real presses, pressed again, one at a time, up to `presses` in all,
// until the page has seen a pair that close, and no more after it (a press left over would pair with the caller's
// next). On a loaded machine the page drew a frame in 1 to 4 s and the second press waited behind it, seconds after
// the first as the page saw it. Resolves {presses (0: never a pair), gaps (s, between the presses the page saw)}
export async function doubleTap(page, key, {within = .3, presses = 16} = {}){
  await page.evaluate(key => {
    const K = window.__qaTap || (window.__qaTap = {key, ts: [], on: false});
    K.key = key; K.ts.length = 0;
    if (!K.on){ K.on = true; addEventListener("keydown", e => { if (e.key === K.key && !e.repeat) K.ts.push(performance.now()); }, true); }
  }, key);
  let r = {pair: false, gaps: []};
  for (let i = 1; i <= presses; i++){
    await page.keyboard.press(key);
    // (paired as control.js pairs them: a press completes a pair with the unpaired one before it, else waits for the next)
    r = await page.evaluate(w => { const t = window.__qaTap.ts, gaps = []; let at = -Infinity, pair = false;
      for (let j = 0; j < t.length; j++){ if (j) gaps.push(+((t[j] - t[j - 1])/1000).toFixed(3)); if ((t[j] - at)/1000 < w){ pair = true; at = -Infinity; } else at = t[j]; }
      return {pair, gaps}; }, within);
    if (r.pair) return {presses: i, gaps: r.gaps};
  }
  return {presses: 0, gaps: r.gaps};
}
