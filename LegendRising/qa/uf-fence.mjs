// qa/uf-fence.mjs: nobody who is not on the field ever stands on the pitch (USER-ISSUES U3: "the coach can step inside
// the pitch, coach and player should not be able to step inside the pitch if they are not subbed in"). On test:bench,
// over 3 seeds, the warm-up is played to its end with the one-twos with the fitness coach in the set (the pass minigame
// the user saw), every frame checking you, the assistant coach, the fitness coach, the fourth official and the seated
// substitutes against the field of play; then you hold W toward the pitch with real keys (the pointer locked by a real
// click) and must stop at the touchline. After you come on, the fence is gone (you play on the pitch).
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U3.
//
//   QA_PORT=8863 node qa/uf-fence.mjs [seeds...]      exits 1 on any failed check; shots in qa/out/uf/
import {openFixture, checker} from "./uf-lib.mjs";
import {installBot} from "./wpW1-lib.mjs";

const {check, done} = checker("uf-fence");
const seeds = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const SEEDS = seeds.length ? seeds : [5, 11, 23];
let allOk = true;

// in the page: who of the people off the field is on the pitch now (strictly inside the touchlines and goal lines)
const SAMPLE = () => {
  const F = window.__fp, ms = F.ms, sp = ms.spec, P = window.__life.P, W = F.warm.S, out = [];
  const inside = (x, z) => Math.abs(x) < sp.hx && Math.abs(z) < sp.hz;
  const worst = (who, x, z) => { const d = Math.min(sp.hx - Math.abs(x), sp.hz - Math.abs(z)); if (inside(x, z)) out.push({who, x: +x.toFixed(2), z: +z.toFixed(2), d: +d.toFixed(2)}); };
  if (!F.FS.onPitch) worst("you", P.x, P.z);
  if (W && W.coach && W.coach.h) worst("assistant coach", W.coach.pos.x, W.coach.pos.z);
  if (W && W.fit && W.fit.h) worst("fitness coach", W.fit.pos.x, W.fit.pos.z);
  const R = F.FOURTH; if (R && R.h) worst("fourth official", R.h.g.position.x, R.h.g.position.z);
  const C = F.stadium ? F.stadium.crowd : null;
  for (const h of (C && C.benchPeople) || []) if (h.g.visible) worst("bench", h.g.position.x, h.g.position.z);
  return out;
};

for (const seed of SEEDS){
  const tag = `seed ${seed}`;
  // the call early, the change late enough for the whole set; the one-twos in it
  const T = await openFixture("test:bench", {startMin: 2, subOn: 30, callAt: 3, seed, warmSet: ["strides", "onetwo", "juggle"]}, {seed});
  const {page} = T;
  try {
    await installBot(page);
    await page.evaluate(() => { window.__wbot.level = "good"; });
    check(!!T.lock, `${tag}: the pointer locked by a real click`, T.lock);
    let frames = 0, breaches = [], phases = new Set(), maxOneTwo = 0, coachSeen = 0;
    const until = async (cond, max) => {
      for (let i = 0; i < max/30; i++){
        const r = await page.evaluate(([c, SAMPLE]) => {
          const f = new Function("return (" + c + ")")(), S = new Function("return (" + SAMPLE + ")")();
          const bad = [];
          let seen = 0, id = null, ph = null;
          for (let k = 0; k < 30; k++){
            if (f()) return {done: true, bad, seen, ph};
            window.__wbot.frames(1);
            const b = S(); if (b.length) bad.push(...b.slice(0, 2));
            const W = window.__fp.warm.S; ph = W.phase; if (W.X) id = W.X.id;
            if (W.fit && W.fit.h) seen++;
          }
          return {done: false, bad, seen, ph, id};
        }, [cond.toString(), SAMPLE.toString()]);
        frames += 30; coachSeen += r.seen; if (r.ph) phases.add(r.ph); if (r.id === "onetwo") maxOneTwo++;
        if (r.bad.length && breaches.length < 10) breaches.push(...r.bad);
        if (r.done) return true;
      }
      return false;
    };
    // the call: the coach comes over, E (a real key) stands you up
    const called = await until(() => window.__fp.warm.S.phase === "call" && window.__fp.warm.S.coach && window.__fp.warm.S.coach.arrived, 60*60*3);
    check(called, `${tag}: the coach's call came and he reached you`, [...phases]);
    await T.key("e", 2);
    // the set, played by the bot through the warm-up's own input, to its end (a picture of the one-twos on the way, the
    // fitness coach in it)
    if (await until(() => { const X = window.__fp.warm.S.X; return !!(X && X.id === "onetwo" && X.stage === "have"); }, 60*60*4)){
      await page.evaluate(() => { const P = window.__life.P, F = window.__fp.warm.S.fit; if (F){ P.yaw = Math.atan2(-(F.pos.x - P.x), -(F.pos.z - P.z)); P.pitch = -.2; } });
      await T.snap(`uf-fence-${seed}-onetwo`);
    }
    const drilled = await until(() => window.__fp.warm.S.phase === "done" || window.__fp.warm.S.phase === "outro", 60*60*6);
    check(drilled && maxOneTwo > 0, `${tag}: the warm-up played through, the one-twos with the coach among it`, {phases: [...phases], oneTwoRounds: maxOneTwo});
    check(coachSeen > 0, `${tag}: the fitness coach was there for it`, coachSeen);
    await T.snap(`uf-fence-${seed}-after-set`);
    // you hold W toward the pitch: the touchline stops you
    await page.evaluate(() => { const P = window.__life.P; P.yaw = Math.PI; P.pitch = -.1; });
    await page.keyboard.down("w");
    for (let i = 0; i < 12; i++){ const r = await page.evaluate(SAMPLE); if (r.length && breaches.length < 10) breaches.push(...r); await T.frames(15); }
    const zAfter = await page.evaluate(() => [window.__life.P.x, window.__life.P.z, window.__fp.ms.spec.hz]);
    await T.snap(`uf-fence-${seed}-at-the-line`);
    await page.keyboard.up("w");
    check(zAfter[1] <= -zAfter[2] - .3, `${tag}: W held at the pitch stops you at the touchline (z ${zAfter[1].toFixed(2)}, the line at -${zAfter[2]})`, zAfter);
    check(breaches.length === 0, `${tag}: nobody off the field set foot on the pitch in ${frames} frames (you, both coaches, the fourth official, the bench)`, breaches.slice(0, 5));
    // walk along it: allowed, and still off it
    await page.evaluate(() => { const P = window.__life.P; P.yaw = Math.PI*.75; });
    await page.keyboard.down("w"); await T.frames(90); await page.keyboard.up("w");
    const along = await page.evaluate(() => [window.__life.P.x, window.__life.P.z]);
    check(along[1] <= -34.3 && Math.abs(along[0] - zAfter[0]) > .5, `${tag}: walking at an angle you slide along the line, still off the pitch`, {from: zAfter.slice(0, 2), to: along});
    check(page.errors.length === 0, `${tag}: zero console and page errors`, page.errors.slice(0, 5));
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, `${tag}: the run finished`, String(e.message)); allOk = false; }
  await T.close();
}
process.exit(done() && allOk ? 0 : 1);
