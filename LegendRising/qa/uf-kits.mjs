// qa/uf-kits.mjs: the kits on the pitch in a real match (USER-ISSUES U11: two kits never the same or close colours; the
// keepers checked against both teams and the referee). test:11v11 is entered with kit pairs that clash (purple against
// blue, white against white, red against crimson) and one that does not; the outfield bodies, both keepers and the
// referee are read from the view and every pair of them is measured (CIEDE2000, kitclash.js) against the thresholds.
// The keepers' and the referee's colours come from the resolved kits once view.js matchLooks takes kits.gk and
// kits.ref (UF-B hook request); until then they come from human.js clashFree, and the script says which it saw.
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U11.
//
//   QA_PORT=8863 node qa/uf-kits.mjs      exits 1 on any failed check; shots in qa/out/uf/
import {openFixture, checker} from "./uf-lib.mjs";
import {deltaE, kitsClash, KIT_SHIRT_MIN, GK_MIN, REF_MIN} from "../js/life/football/kitclash.js";

const {check, done} = checker("uf-kits");
const PAIRS = [["purple v blue", {home: ["#6b1f7a", "#ffffff"], away: ["#1b3fa0", "#ffffff"]}], ["white v white", {home: ["#ffffff", "#111111"], away: ["#f3f3f3", "#0b1f4d"]}],
  ["red v crimson", {home: ["#d7182a", "#ffffff"], away: ["#b0132e", "#101010"]}], ["red v blue", {home: ["#d7182a", "#ffffff"], away: ["#1b3fa0", "#ffffff"]}]];
const hex = c => typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c).toLowerCase();
let i = 0, ok = true;
for (const [nm, kits] of PAIRS){
  const T = await openFixture("test:11v11", {seed: 3 + i, kits}, {seed: 3 + i});
  const {page} = T;
  try {
    await T.frames(4);
    const r = await page.evaluate(() => {
      const F = window.__fp, ms = F.ms, V = F.FS.V, K = F.kits, pick = f => { const a = ms.agents.find(f); const R = a && V.rec[a.id]; return R ? R.h.look.outfit : null; };
      const o = t => pick(x => x.team === t && x.role === "player" && !x.isGK && !x.isMe && x.onPitch), g = t => pick(x => x.team === t && x.isGK && x.onPitch);
      const ref = pick(x => x.role === "referee");
      return {K: {home: K.home, away: K.away, gk: K.gk, ref: K.ref, change: K.change}, home: o(0), away: o(1), gk0: g(0), gk1: g(1), ref};
    });
    const H = [hex(r.home.shirt), hex(r.home.shorts)], A = [hex(r.away.shirt), hex(r.away.shorts)];
    const g0 = hex(r.gk0.shirt), g1 = hex(r.gk1.shirt), rf = hex(r.ref.shirt);
    check(!kitsClash(H, A) && deltaE(H[0], A[0]) >= KIT_SHIRT_MIN, `${nm}: the two sides' kits as worn read apart (${H.join("/")} against ${A.join("/")}, shirts ${deltaE(H[0], A[0]).toFixed(1)} apart, the away side ${r.K.change})`, {H, A});
    const kitCols = [H[0], H[1], A[0], A[1]], minTo = (c, l) => Math.min(...l.map(x => deltaE(c, x)));
    const fromKits = g0 === hex(r.K.gk[0]) && g1 === hex(r.K.gk[1]) && rf === hex(r.K.ref);
    const dG = Math.min(minTo(g0, kitCols.concat([rf, g1])), minTo(g1, kitCols.concat([rf, g0]))), dR = minTo(rf, kitCols.concat([g0, g1]));
    console.log(`  ${nm}: keepers ${g0}, ${g1}, referee ${rf} (${fromKits ? "the resolved kits" : "human.js clashFree: view.js hook not applied"}); keepers at least ${dG.toFixed(1)}, referee at least ${dR.toFixed(1)} from everything else`);
    check(fromKits ? dG >= GK_MIN && dR >= REF_MIN : dG >= 10 && dR >= 10, `${nm}: both keepers clear of both teams, each other and the referee; the referee clear of all of them`, {gk: [g0, g1], ref: rf, dG: +dG.toFixed(1), dR: +dR.toFixed(1), fromKits});
    if (i === 0){ await page.evaluate(() => { const P = window.__life.P; P.yaw = Math.PI/2; P.pitch = -.05; }); await T.snap("uf-kits-purple-blue"); }
    check(page.errors.length === 0, `${nm}: zero console and page errors`, page.errors.slice(0, 5));
  } catch (e){ console.log("FAILED", e.stack || e.message); check(false, `${nm}: the run finished`, String(e.message)); ok = false; }
  await T.close();
  i++;
}
process.exit(done() && ok ? 0 : 1);
