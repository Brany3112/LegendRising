// qa/wpW1-lib.mjs: what the WP-W1 acceptance scripts share: a page on the test fixture test:bench (you a substitute on
// the home bench, the match running, your change planned), a bot that plays each warm-up exercise well, badly or not
// at all through the real input path (__fp.input), and screenshots through your own eyes.
// Owner: WP-W1 (Stage P2c). Contracts: addendum A1.8; DESIGN 1.4.20 (window.__fp), 1.6 (controls).
//
//   const T = await openBench({callAt: 3, subOn: 16});   // seated on the bench, the clock at minute 2
//   await T.until(() => window.__fp.warm.S.phase === "call");
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
export {checker} from "./wpF-lib.mjs";

export const DIR = path.join(OUT, "wpW1");
fs.mkdirSync(DIR, {recursive: true});

// a page with a career at the ground (for the look), frozen, then test:bench entered with o
export async function openBench(o = {}, {w = 1280, h = 720, seed = 7} = {}){
  const {page, close} = await launch({gfx: "low", seed, w, h});
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  await installBot(page);
  const T = {page, close};
  // (the cover the fixture lifts once frames have been presented: a clock-stepped page presents none, so it is lifted
  // here, or every body would stay at the scheduler's covered tier)
  T.enter = async (oo = o) => page.evaluate(oo => {
    const F = window.__fp, L = window.__life; if (F.state) F.exit();
    F.enter("test:bench", Object.assign({seed: 5, startMin: 2, subOn: 16, callAt: 3}, oo)); L.stepN(2);
    const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; delete f.dataset.tun; L.FADE.v = 0;
    return F.state;
  }, oo);
  // frames until fn (a string of a page expression) is true, or the guard runs out; n frames per round trip
  T.until = async (expr, frames = 6000, n = 30) => {
    for (let i = 0; i < frames/n; i++){
      const r = await page.evaluate(([expr, n]) => { const ok = (0, eval)(expr); if (ok) return true; window.__wbot.frames(n); return false; }, [expr, n]);
      if (r) return true;
    }
    return page.evaluate(expr => !!(0, eval)(expr), expr);
  };
  T.step = (n = 1) => page.evaluate(n => window.__wbot.frames(n), n);
  T.st = () => page.evaluate(() => { const F = window.__fp, W = F.warm.S, X = W.X; return {state: F.state, phase: W.phase, sub: W.sub, i: W.i, set: W.set, id: X ? X.id : null, t: X ? X.t : 0,
    reps: X ? X.reps.length : 0, scores: W.scores.slice(), min: F.ms ? (F.ms.half - 1)*45 + Math.floor(F.ms.clock.sec/60) + 1 : 0, seated: F.FS.seated, P: [window.__life.P.x, window.__life.P.z]}; });
  T.snap = async name => {
    await page.evaluate(() => { const L = window.__life; const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; L.FADE.v = 0; L.renderer().render(L.scene(), L.cam); });
    const file = path.join(DIR, name + ".png");
    await page.screenshot({path: file, timeout: 180000});
    console.log("shot", file);
    return file;
  };
  // a look at your own body from outside (a contact sheet of the poses): the camera `d` metres off at bearing `ang`
  // from where you face, at `y`, on the body; the HUD and the cover as they are
  T.side = async (name, {d = 2.6, ang = 1.2, y = 1.3} = {}) => {
    await page.evaluate(({d, ang, y}) => {
      const L = window.__life, P = L.P, cam = L.cam, f = window.__fp.FS.V && window.__fp.FS.V.fp, yaw = f ? f.g.rotation.y - Math.PI : P.yaw;
      const a = yaw + ang, x = P.x - Math.sin(a)*d, z = P.z - Math.cos(a)*d;
      const keep = {p: cam.position.clone(), q: cam.quaternion.clone()};
      cam.position.set(x, y, z); cam.lookAt(P.x, .85, P.z); cam.updateMatrixWorld();
      const fd = document.getElementById("lifeFade"); fd.style.transition = "none"; fd.style.opacity = "0"; L.FADE.v = 0;
      L.renderer().render(L.scene(), cam);
      window.__keepCam = keep;
    }, {d, ang, y});
    const file = path.join(DIR, name + ".png");
    await page.screenshot({path: file, timeout: 180000});
    await page.evaluate(() => { const L = window.__life, k = window.__keepCam; L.cam.position.copy(k.p); L.cam.quaternion.copy(k.q); });
    console.log("shot", file);
    return file;
  };
  return T;
}

// the bot in the page: frames(n) steps the world n frames and, while a set runs, plays it with the skill asked for
// (window.__wbot.level: 'good' plays on the beat and to the targets, 'bad' late and off, 'none' does nothing)
export async function installBot(page){
  await page.evaluate(() => {
    if (window.__wbot) return;
    const L = window.__life, F = window.__fp;
    const B = window.__wbot = {level: "good", log: [], t: 0, last: {},
      key(k){ F.input({type: "keydown", key: k}); F.input({type: "keyup", key: k}); },
      click(){ F.input({type: "down", button: 0}); F.input({type: "up", button: 0}); },
      move(dx, dy){ F.input({type: "move", dx, dy}); },
      frames(n){ for (let i = 0; i < n; i++){ B.play(); L.stepN(1); } },
      // one frame of play: what a player of this level would do now
      play(){
        const W = F.warm.S, X = W.X;
        if (!W.on || W.phase !== "drill" || W.sub !== "go" || !X || B.level === "none") return;
        const good = B.level === "good", r = Math.random;
        switch (X.id){
          case "strides": {
            // tap on the footfall the gait just made (good), or at random moments (bad)
            const L0 = X.falls, last = L0.length ? L0[L0.length - 1] : null;
            if (good){ if (last && !last.done && X.t - last.t < .04 && B.last.f !== last){ B.last.f = last; B.key("shift"); } }
            else if (r() < .03) B.key("shift");
            break;
          }
          case "lunges": {
            // down to the ghost line and back up, at a steady pace (good); far too deep and fast (bad)
            const tgt = good ? X.target : 1.2, sp = good ? 9 : 26;
            if (!B.last.lunge || B.last.lungeK !== X.k){ B.last.lunge = "down"; B.last.lungeK = X.k; }
            if (B.last.lunge === "down"){ if (X.d < tgt - .01) B.move(0, Math.min(sp, (tgt - X.d)*320)); else B.last.lunge = "up"; }
            else B.move(0, -sp);
            break;
          }
          case "swings": {
            // follow the pendulum (good), or lag it by a quarter (bad)
            const want = good ? X.guide : Math.sin((X.ph - .25)*Math.PI*2)*.4;
            const d = (want - X.a)*150; if (X.lat) B.move(-d, 0); else B.move(0, -d);
            break;
          }
          case "hips": {
            // round the ring at its radius (good), a squashed wobbly loop (bad)
            const R = X.var.R, th = Math.atan2(X.cy, X.cx) + (good ? .16 : .3), rr = good ? R : R*(.45 + .5*Math.abs(Math.sin(X.t*3)));
            B.move(rr*Math.cos(th) - X.cx, rr*Math.sin(th) - X.cy);
            break;
          }
          case "quad": {
            // counter the wobble (good), or chase it (bad)
            const d = X.dot || {x: 0, y: 0};
            if (good) B.move(-d.x*60, -d.y*60); else B.move(d.x*20, d.y*20);
            break;
          }
          case "knees": {
            // the right key on each beat (good), the wrong one late (bad)
            for (const b of X.beats){
              if (b.done || B.last.beat === b) continue;
              if (good && Math.abs(b.t - X.t) < .02){ B.last.beat = b; B.key(b.s > 0 ? "a" : "d"); break; }
              if (!good && X.t - b.t > .12 && X.t - b.t < .14){ B.last.beat = b; B.key(b.s > 0 ? "d" : "a"); break; }
            }
            break;
          }
          case "shuffle": {
            // W as the coach shouts (good: at 0.25 s), late or early (bad)
            if (good && X.go && X.t - X.go.t >= .2) B.key("w");
            if (!good && !X.go && r() < .02) B.key("w");
            break;
          }
          case "juggle": {
            const b = W.ball && W.ball.b; if (!b) break;
            if (good){ if (b.v.y < 0 && Math.abs(b.p.y - X.ring) < .03 && B.last.jt !== X.touches){ B.last.jt = X.touches; B.click(); } }
            else if (b.v.y > 0 && r() < .05) B.click();
            break;
          }
          case "onetwo": {
            if (good){ if (X.stage === "open" && X.t - X.open > .05) B.click(); }
            else if (X.stage === "have" && r() < .05) B.click();
            break;
          }
        }
      }
    };
  });
}
