// qa/uf-bench.mjs: the bench (USER-ISSUES U4: "player has to be going around the back of the place you sit on the bench
// in order to sit cause you cant sit from the front"; U5: "the people on the bench should not look like 2d sprites").
// On test:bench, on your feet: walk up to the home dugout from the front (from the touchline), from its side and from
// behind it, each time with real keys (W to walk up, E to sit, the pointer locked by a real click); the "Bench: Sit down"
// prompt shows and E sits you. The substitutes on both benches are real 3D bodies (skinned meshes in the scene, not
// billboard pictures), seen in a picture from in front of the dugout.
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U4, U5.
//
//   QA_PORT=8863 node qa/uf-bench.mjs      exits 1 on any failed check; shots in qa/out/uf/
import {openFixture, checker} from "./uf-lib.mjs";

const {check, done} = checker("uf-bench");
const T = await openFixture("test:bench", {startMin: 2, subOn: 60, callAt: 80, seated: false, seed: 5});
const {page} = T;
let ok = false;
const st = () => page.evaluate(() => {
  const F = window.__fp, FS = F.FS, P = window.__life.P, pr = document.getElementById("lifePrompt");
  // (shown: the HUD's own on state, not the opacity mid-fade: on a loaded machine the fade-out a frame ago can still read
  // above 0.1 while the frozen page steps)
  const shown = pr && pr.classList.contains("on") && getComputedStyle(pr).display !== "none" && pr.offsetParent !== null;
  return {state: F.state, seated: !!FS.seated, P: [+P.x.toFixed(2), +P.z.toFixed(2)], prompt: shown ? pr.textContent.replace(/\s+/g, " ").trim() : ""};
});
// stand at a spot facing a point (the walk-up starts there), on your feet
const standAt = (x, z, lx, lz) => page.evaluate(([x, z, lx, lz]) => {
  const F = window.__fp, P = window.__life.P;
  if (F.FS.seated) F.warm.stand();
  P.x = x; P.z = z; if (F.FS.own){ F.FS.own.x = x; F.FS.own.z = z; F.FS.own.vx = F.FS.own.vz = 0; }
  P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = -.15;
}, [x, z, lx, lz]);
try {
  check(!!T.lock, "the pointer locked by a real click", T.lock);
  // U5: the substitutes are bodies
  const b = await page.evaluate(() => {
    const F = window.__fp, C = F.stadium && F.stadium.crowd, L = window.__life, people = (C && C.benchPeople) || [];
    let skinned = 0, inScene = 0, vis = 0;
    for (const h of people){ let o = h.g; while (o.parent) o = o.parent; if (o === L.scene()) inScene++; if (h.g.visible) vis++; h.g.traverse(m => { if (m.isSkinnedMesh) skinned++; }); }
    let bill = 0; L.scene().traverse(o => { if (/crowd-bench/.test(o.name || "")) bill++; });
    return {n: people.length, humans: people.filter(h => h.isHuman).length, skinned, inScene, vis, bill, seat: people[0] ? [people[0].g.position.x, people[0].g.position.y, people[0].g.position.z] : null};
  });
  check(b.n >= 16 && b.humans === b.n && b.skinned >= b.n && b.inScene === b.n && b.bill === 0, "the substitutes on the benches are real 3D bodies (skinned meshes in the scene; no billboard bench left)", b);
  check(b.vis > 0, "the seated substitutes are drawn", b.vis);
  await standAt(-10, -33.4, -10, -37.2);
  await page.evaluate(() => { window.__life.P.pitch = -.05; });
  await T.frames(4);
  await T.snap("uf-bench-1-front");
  // U4: the seat from the front, the side and behind
  const ways = [["front, from the touchline", -10.4, -34.6, -10.4, -37.2], ["the side", -13.6, -37.1, -10, -37.1], ["behind", -9.6, -38.6, -9.6, -37]];
  for (const [nm, x, z, lx, lz] of ways){
    await standAt(x, z, lx, lz);
    await T.frames(3);
    // walk up to it with W, the look on it, until the prompt offers the seat (or a few seconds)
    let s = await st();
    await page.keyboard.down("w");
    for (let i = 0; i < 60 && !/Sit down/.test(s.prompt); i++){
      await page.evaluate(([lx, lz]) => { const P = window.__life.P; P.yaw = Math.atan2(-(lx - P.x), -(lz - P.z)); }, [lx, lz]);
      await T.frames(4); s = await st();
    }
    await page.keyboard.up("w");
    await T.frames(2); s = await st();
    check(/Bench/.test(s.prompt) && /Sit down/.test(s.prompt), `from ${nm}: the prompt offers the seat`, s);
    if (nm.startsWith("front")) await T.snap("uf-bench-2-prompt-front");
    await T.key("e", 3);
    await T.frames(3);
    const s2 = await st();
    check(s2.seated, `from ${nm}: E sits you down`, s2);
    if (nm.startsWith("front")) await T.snap("uf-bench-3-seated");
  }
  // seated, the seat is not offered again; called on, it is not offered at all
  const s3 = await st();
  check(!/Sit down/.test(s3.prompt), "seated, nothing is offered under your eye", s3.prompt);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
