// qa/u21-warmup.mjs: USER-ISSUES U21 on the touchline, the substitute's warm-up (addendum A1.8), in the real game with
// real input (page.keyboard, page.mouse, the pointer locked by a real click). Third person is for the ball: the
// exercises in which your body plays one (the juggling, the one-twos) are seen from behind you when the Football camera
// is Third person; the stretches and the walk to the strip stay through your own eyes.
//   - a set of lunges, juggling and one-twos, called up and accepted with a real E
//   - the lunges (no ball): first person, your first-person body drawn, your whole body not
//   - the juggling: the camera eases out behind you through its intro (no frame moves more than 0.2 m, no cut), then is
//     behind and above your whole body (drawn, the first-person one not), with you and the ball on screen; touched
//     with real clicks as the ball drops into the ring, it scores
//   - the one-twos: still behind you, passed back with real clicks as the coach opens up, it scores
//   - the set done (the ball put away): eased back to your eyes, your first-person body again, the whole one hidden
//   - the setting: with the Football camera on First person the juggling stays through your eyes all the way
//   - no console or page error
//
//   QA_PORT=8871 node qa/u21-warmup.mjs          exits 1 on any failed check; writes qa/out/u21-warmup.json
import path from "node:path";
import {openFixture, checker, DIR} from "./uf-lib.mjs";

const {check, done} = checker("u21-warmup");
const T = await openFixture("test:bench", {startMin: 2, callAt: 3, subOn: 30, warmSet: ["lunges", "juggle", "onetwo"]});
const {page} = T;
let ok = false;
try {
  check(!!T.lock, "the pointer locked by a real click", T.lock);
  await page.evaluate(async () => {
    const C = await import("./js/life/football/control.js"), M = await import("./js/life/football/matchcam.js");
    C.saveSet({footCam: "third"});
    const F = window.__fp, L = window.__life;
    window.__wu = {C, M,
      // the camera, the bodies and the warm-up now (your whole body: warmup.js warmMe, the first-person one: V.fp)
      st(){
        const W = F.warm.S, X = W.X, V = F.FS.V, cam = L.cam, me = W.me && W.me.h, P = L.P;
        cam.updateMatrixWorld(true);
        const ndc = (x, y, z) => { const v = cam.position.clone().set(x, y, z).project(cam); return {x: +v.x.toFixed(2), y: +v.y.toFixed(2), on: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1}; };
        const b = W.ball && W.ball.b ? W.ball.b.p : null;
        // (the ball not hidden behind you: the nearest the line from the camera to it comes to your body's axis, over
        // the body's height; Infinity when it passes above your head)
        let sight = Infinity;
        if (b) for (let i = 0; i <= 60; i++){ const k = i/60, x = cam.position.x + (b.x - cam.position.x)*k, y = cam.position.y + (b.y - cam.position.y)*k, z = cam.position.z + (b.z - cam.position.z)*k;
          if (y > .05 && y < 1.9 && k < .97) sight = Math.min(sight, Math.hypot(x - P.x, z - P.z)); }
        return {phase: W.phase, sub: W.sub, id: X ? X.id : null, t: X ? X.t : 0, tpK: +M.MC.tpK.toFixed(3), on: M.MC.tp.on,
          whole: !!(me && me.g.visible), fp: !!(V && V.fp && V.fp.g.visible),
          cam: {x: cam.position.x, y: cam.position.y, z: cam.position.z}, back: Math.hypot(cam.position.x - P.x, cam.position.z - P.z), up: cam.position.y,
          head: ndc(P.x, 1.7, P.z), feet: ndc(P.x, .05, P.z), ball: b ? ndc(b.x, b.y, b.z) : null, sight: b ? +sight.toFixed(2) : null, by: b ? +b.y.toFixed(2) : null,
          scores: W.scores.slice(), touches: X && X.id === "juggle" ? X.touches : null, passes: X && X.id === "onetwo" ? X.passes : null};
      },
      // world frames until a click is due in the exercise under way (played well: the ball dropping into the juggling's
      // ring, the coach opened up for the one-two), or n frames; the largest camera move in a frame on the way
      run(n){
        let jump = 0, last = L.cam.position.clone(), due = false, k = 0;
        for (; k < n && !due; k++){
          L.stepN(1);
          const p = L.cam.position; jump = Math.max(jump, p.distanceTo(last)); last.copy(p);
          const W = F.warm.S, X = W.X;
          if (W.phase === "drill" && W.sub === "go" && X){
            if (X.id === "juggle"){ const b = W.ball && W.ball.b; due = !!(b && b.v.y < 0 && Math.abs(b.p.y - X.ring) < .03 && this.jt !== X.touches); if (due) this.jt = X.touches; }
            else if (X.id === "onetwo") due = X.stage === "open" && X.t - X.open > .05 && !X.pending;
          }
        }
        return {jump, due, k};
      }
    };
  });
  const st = () => page.evaluate(() => window.__wu.st());
  // a picture of this very frame, drawn while the page stays frozen (uf-lib's snap runs the page's own frames for a
  // moment, and the set ran on seconds meanwhile), into qa/out/uf/<name>.png
  const shot = async name => {
    await page.evaluate(() => { const L = window.__life, f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; L.FADE.v = 0; L.renderer().render(L.scene(), L.cam); });
    const file = path.join(DIR, name + ".png");
    await page.screenshot({path: file, timeout: 180000});
    console.log("  shot", path.relative(process.cwd(), file));
  };
  const click = async () => { await page.mouse.down({button: "left"}); await page.mouse.up({button: "left"}); };
  // the frames of an exercise to its end, clicking (real) whenever a click is due; what was seen on the way
  const playThrough = async (id, snap = null, upTo = Infinity) => {
    const seen = {frames: 0, jump: 0, clicks: 0, samples: []};
    for (let i = 0; i < 4000; i++){
      const r = await page.evaluate(() => window.__wu.run(30));
      seen.frames += r.k; seen.jump = Math.max(seen.jump, r.jump);
      if (r.due){ await click(); seen.clicks++; }
      const s = await st();
      if (seen.samples.length < 400) seen.samples.push(s);
      if (snap && s.sub === "go" && s.t > 3){ await shot(snap); snap = null; }
      if (s.id !== id || s.phase !== "drill" || (s.sub === "go" && s.t > upTo)) break;
    }
    return seen;
  };

  // ---- the call, answered with a real E
  const want = await T.until(() => window.__fp.warm.S.wantE, 20000);
  check(want >= 0, "the coach calls you to warm up", want);
  await page.keyboard.press("e");
  const drill = await T.until(() => window.__fp.warm.S.phase === "drill" && window.__fp.warm.S.X && window.__fp.warm.S.X.id === "lunges" && window.__fp.warm.S.sub === "go", 3000);
  check(drill >= 0, "a real E stands you up, and the set starts with the lunges", drill);

  // ---- the lunges: no ball, through your own eyes
  await T.frames(60);
  const l1 = await st();
  check(l1.id === "lunges" && l1.tpK === 0 && !l1.on && l1.fp && !l1.whole, "the lunges (no ball): first person, your first-person body drawn", {id: l1.id, tpK: l1.tpK, fp: l1.fp, whole: l1.whole});

  // ---- to the juggling: its intro eases the camera out behind you
  const toJ = await page.evaluate(() => { const F = window.__fp, L = window.__life; let jump = 0, last = L.cam.position.clone(), k = 0;
    for (; k < 1200; k++){ const W = F.warm.S; if (W.X && W.X.id === "juggle") break; L.stepN(1); }
    const samples = [];
    for (let i = 0; i < 160; i++){ L.stepN(1); const p = L.cam.position; jump = Math.max(jump, p.distanceTo(last)); last.copy(p); samples.push(+window.__wu.M.MC.tpK.toFixed(3)); if (F.warm.S.sub === "go") break; }
    return {k, jump: +jump.toFixed(3), tpK: samples, sub: F.warm.S.sub}; });
  const j0 = await st();
  check(j0.id === "juggle" && j0.tpK > .95 && j0.on, "the juggling: by the end of its intro the camera is behind you (third person)", {id: j0.id, tpK: j0.tpK, sub: j0.sub});
  const rising = toJ.tpK.filter((v, i, a) => i > 0 && v > a[i - 1]).length;
  check(toJ.jump < .2 && rising >= 20, "the move out behind you is eased over many frames, no frame moving more than 0.2 m (no cut)", {jump: toJ.jump, rising, first: toJ.tpK.slice(0, 6), last: toJ.tpK.slice(-3)});
  // (the first frame of the intro's ease starts from your eyes: the camera's jump while it was ramping is the one above)
  check(j0.whole && !j0.fp, "third person: your whole body is drawn, the first-person one is not", {whole: j0.whole, fp: j0.fp});
  check(j0.back > 1.5 && j0.back < 5.5 && j0.up > 2.5, "the camera is behind and above you", {back: +j0.back.toFixed(2), up: +j0.up.toFixed(2)});
  check(j0.head.on && j0.feet.on && j0.ball && j0.ball.on, "you and the ball are on screen", {head: j0.head, feet: j0.feet, ball: j0.ball});
  await shot("u21-warmup-juggle");
  const J = await playThrough("juggle");
  const jIn = J.samples.filter(s => s.id === "juggle" && s.sub === "go");
  check(jIn.length > 0 && jIn.every(s => s.on && s.whole && !s.fp), "through the juggling: third person all along, your whole body drawn", {n: jIn.length, bad: jIn.filter(s => !(s.on && s.whole && !s.fp)).slice(0, 3)});
  const jScore = await page.evaluate(() => window.__fp.warm.S.scores[1]);
  check(J.clicks >= 6 && jScore >= .5, "the juggling played with real clicks as the ball drops into the ring: it scores", {clicks: J.clicks, score: jScore});
  check(J.jump < .2, "no camera cut through the juggling", +J.jump.toFixed(3));
  const jUp = jIn.filter(s => s.ball && s.by > .2), seen = jUp.filter(s => s.ball.on && s.sight > .3);
  check(jUp.length > 0 && seen.length >= .9*jUp.length, "the juggled ball is on screen and seen past you (the line to it clears your body by 0.3 m)", {n: jUp.length, seen: seen.length, hidden: jUp.filter(s => !(s.ball.on && s.sight > .3)).slice(0, 3).map(s => ({sight: s.sight, by: s.by, ball: s.ball}))});

  // ---- the one-twos: still behind you
  const O = await playThrough("onetwo", "u21-warmup-onetwo");
  const oIn = O.samples.filter(s => s.id === "onetwo" && s.sub === "go");
  check(oIn.length > 0 && oIn.every(s => s.on && s.whole && !s.fp), "the one-twos: third person all along, your whole body drawn", {n: oIn.length, bad: oIn.filter(s => !(s.on && s.whole && !s.fp)).slice(0, 3)});
  const oScore = await page.evaluate(() => window.__fp.warm.S.scores[2]);
  check(O.clicks >= 3 && oScore >= .4, "the one-twos played with real clicks as the coach opens up: they score", {clicks: O.clicks, score: oScore});

  // ---- the set done, the ball put away: eased back to your eyes
  const back = await page.evaluate(() => { const F = window.__fp, L = window.__life; let jump = 0, last = L.cam.position.clone(), k = 0;
    for (; k < 240; k++){ L.stepN(1); const p = L.cam.position; jump = Math.max(jump, p.distanceTo(last)); last.copy(p); if (window.__wu.M.MC.tpK === 0 && k > 10) break; }
    return {k, jump: +jump.toFixed(3)}; });
  await T.frames(5);
  const d1 = await st();
  check(d1.phase === "done" && d1.tpK === 0 && !d1.on && d1.fp && !d1.whole, "the set done: back through your eyes, your first-person body again, the whole one hidden", {phase: d1.phase, tpK: d1.tpK, fp: d1.fp, whole: d1.whole});
  check(back.k > 20 && back.jump < .2, "the way back is eased too (no cut)", back);

  // ---- the setting: First person keeps the juggling through your eyes
  await page.evaluate(() => { window.__wu.C.saveSet({footCam: "first"}); });
  await page.evaluate(() => { const F = window.__fp, L = window.__life; F.exit(); L.stepN(2); F.enter("test:bench", {startMin: 2, callAt: 3, subOn: 30, warmSet: ["juggle"]}); L.stepN(2);
    const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; L.FADE.v = 0; });
  const want2 = await T.until(() => window.__fp.warm.S.wantE, 20000);
  await page.keyboard.press("e");
  const go2 = await T.until(() => window.__fp.warm.S.phase === "drill" && window.__fp.warm.S.sub === "go", 3000);
  const F1 = await playThrough("juggle", null, 4);   // (its intro and 4 s of it: the camera has eased out by then when it is going to)
  const fIn = F1.samples.filter(s => s.id === "juggle");
  check(want2 >= 0 && go2 >= 0 && fIn.length > 0 && fIn.every(s => s.tpK === 0 && s.fp && !s.whole), "Football camera on First person: the juggling stays through your eyes", {go2, n: fIn.length, bad: fIn.filter(s => !(s.tpK === 0 && s.fp && !s.whole)).slice(0, 3)});
  await page.evaluate(() => { window.__wu.C.saveSet({footCam: "third"}); });

  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await page.evaluate(async () => { try { const C = await import("./js/life/football/control.js"); C.saveSet({footCam: "third"}); } catch(e){} }).catch(() => {});
await T.close();
process.exit(done() && ok ? 0 : 1);
