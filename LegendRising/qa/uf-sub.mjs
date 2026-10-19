// qa/uf-sub.mjs: the call to come on (USER-ISSUES U2: "it tells you to go at the central and you are not seeing any
// central to go at"). On test:bench you are called on; the fourth official is a person standing at the halfway
// touchline (a real body in the scene, in the officials' kit), the spot you report to is ringed on the grass, the HUD
// names him over his head and its compass arrow points at him wherever you look, and the prompt and the notice say who
// and where. Then you walk to him with W held (real keys, the pointer locked by a real click) and go on from beside him.
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U2.
//
//   QA_PORT=8863 node qa/uf-sub.mjs      exits 1 on any failed check; shots in qa/out/uf/
import {openFixture, checker} from "./uf-lib.mjs";

const {check, done} = checker("uf-sub");
const T = await openFixture("test:bench", {startMin: 10, subOn: 11, callAt: 80, seed: 5});
const {page} = T;
let ok = false;
const st = () => page.evaluate(() => {
  const F = window.__fp, FS = F.FS, L = window.__life, P = L.P, R = F.FOURTH, h = R.h, e = F.entrySpot();
  const q = s => document.querySelector(s), op = s => q(s) ? +getComputedStyle(q(s)).opacity : -1;
  // where he is on screen (his chest), and whether a body of his is in the scene and drawn
  let scr = null, inScene = false, meshes = 0;
  if (h){
    let o = h.g; while (o.parent) o = o.parent; inScene = o === L.scene() && h.g.visible;
    h.g.traverse(m => { if (m.isSkinnedMesh && m.visible) meshes++; });
    const v = h.g.position.clone(); v.y = 1.3; v.project(L.cam);
    scr = {x: (v.x + 1)/2*innerWidth, y: (1 - v.y)/2*innerHeight, front: v.z < 1, on: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1};
  }
  const ring = FS.V && FS.V.ringSpot;
  return {state: F.state, called: !!FS.called, atFourth: !!FS.atFourth, onPitch: !!FS.onPitch, seated: !!FS.seated,
    at: h ? [+h.g.position.x.toFixed(2), +h.g.position.z.toFixed(2)] : null, outfit: h ? h.look.outfit.shirt : null, upper: R.st.upper ? R.st.upper.g : null,
    inScene, meshes, scr, P: [+P.x.toFixed(2), +P.z.toFixed(2)], entry: e,
    ring: ring ? {vis: ring.visible, x: +ring.position.x.toFixed(2), z: +ring.position.z.toFixed(2)} : null,
    goal: op(".fp-goal"), goalTxt: (q(".fp-goal b") || {}).textContent || "", goalT: q(".fp-goal") ? q(".fp-goal").style.transform : "",
    compass: op(".fp-goalc"), compassTxt: (q(".fp-goalc b") || {}).textContent || "", arrow: q(".fp-goalc i") ? q(".fp-goalc i").style.transform : "",
    hints: (q(".fp-hints") || {}).textContent || "", cards: (window.__cards || []).join(" | ")};
});
// turn the view (what a mouse move does) toward a point, or away from it
const look = (x, z, away = false) => page.evaluate(([x, z, away]) => { const P = window.__life.P; P.yaw = Math.atan2(-(x - P.x), -(z - P.z)) + (away ? Math.PI : 0); P.pitch = -.08; }, [x, z, away]);
try {
  check(!!T.lock, "the pointer locked by a real click on the 3D view", T.lock);
  const s0 = await st();
  check(s0.inScene && s0.meshes > 0, "the fourth official is a real body in the scene before the call", {inScene: s0.inScene, meshes: s0.meshes, at: s0.at});
  const half = await page.evaluate(() => window.__fp.ms.spec.hz);
  check(s0.at && Math.abs(s0.at[0]) < 1.5 && s0.at[1] < -half && s0.at[1] > -half - 2.5, "he stands at the halfway line, just off the touchline on the bench side", {at: s0.at, touchline: -half});
  // the call (every event card shown is noted as it comes: a card stays 3.5 s of real time, and a loaded machine steps
  // the frames slower than that)
  await page.evaluate(() => { window.__cards = []; const box = document.querySelector(".fp-cards"); new MutationObserver(() => { for (const n of box.querySelectorAll(".fp-card")) if (!window.__cards.includes(n.textContent)) window.__cards.push(n.textContent); }).observe(box, {childList: true, subtree: true}); });
  const n = await T.until(() => window.__fp.state === "entering", 60*60*4);
  check(n >= 0, "called on (state entering)", n);
  await T.frames(20);
  const s1 = await st();
  check(/fourth official at the halfway line/.test(s1.hints), "the prompt names him and where he is", s1.hints);
  check(/Report to the fourth official/.test(s1.cards) && /halfway line/.test(s1.cards), "the call's notice says who to go to and where", s1.cards);
  check(s1.ring && s1.ring.vis && Math.hypot(s1.ring.x - s1.entry.x, s1.ring.z - s1.entry.z) < .05, "the spot you report to is ringed on the grass", {ring: s1.ring, entry: s1.entry});
  check(s1.upper === "call", "he waves you over (his arm up, turned to you)", s1.upper);
  // looking at him: his tag over his head, on screen, and the compass pointing straight on
  await look(s1.at[0], s1.at[1]);
  await T.frames(3);
  const s2 = await st();
  check(s2.scr && s2.scr.on, "looking his way, he is in view", s2.scr);
  check(s2.goal > .9 && /Fourth official/.test(s2.goalTxt), "the HUD's tag names him over his head", {opacity: s2.goal, text: s2.goalTxt, at: s2.goalT});
  const ang = t => { const m = /rotate\((-?[\d.e-]+)rad\)/.exec(t); return m ? +m[1] : NaN; };
  check(s2.compass > .9 && /Fourth official/.test(s2.compassTxt) && Math.abs(ang(s2.arrow)) < .35, "the compass arrow points straight at him, with the distance", {opacity: s2.compass, text: s2.compassTxt, arrow: s2.arrow});
  await T.snap("uf-sub-1-called-look");
  // looking away: no tag, the compass arrow turned round
  await look(s1.at[0], s1.at[1], true);
  await T.frames(3);
  const s3 = await st();
  check(s3.goal < .1 && s3.compass > .9 && Math.abs(Math.abs(ang(s3.arrow)) - Math.PI) < .5, "looking away, the compass still points to him (behind you)", {tag: s3.goal, arrow: s3.arrow});
  await T.snap("uf-sub-2-called-away");
  // the walk to him with W held, the view kept on the spot
  await look(s1.entry.x, s1.entry.z);
  await page.keyboard.down("w");
  let s4 = await st();
  for (let i = 0; i < 400 && !s4.atFourth; i++){
    await look(s4.entry.x, s4.entry.z);
    await T.frames(4);
    s4 = await st();
    if (i === 40) await T.snap("uf-sub-3-walking");
  }
  await page.keyboard.up("w");
  check(s4.atFourth, "walking there with W, you reach him (FS.atFourth)", {P: s4.P, entry: s4.entry});
  await T.frames(4);
  const s5 = await st();
  check(s5.goal < .1 && s5.compass < .1 && !(s5.ring && s5.ring.vis), "there: the tag, the compass and the ring go", {tag: s5.goal, compass: s5.compass, ring: s5.ring});
  check(s5.upper === "point", "he points you on while you wait by him", s5.upper);
  await look(0, 0);
  await T.snap("uf-sub-4-with-him");
  const on = await T.until(() => window.__fp.FS.onPitch, 60*90);
  const s6 = await st();
  check(on >= 0 && s6.onPitch, "you go on from beside him at the next stoppage", {on, P: s6.P});
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
