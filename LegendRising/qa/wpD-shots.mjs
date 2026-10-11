// qa/wpD-shots.mjs: pictures of the stadium to look at, from where a player stands.
// Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 2.3 WP-D (the stadium as built), 3.3.
//
//   node qa/wpD-shots.mjs                       Low and High, tier 2, the four views below, at 3 PM
//   node qa/wpD-shots.mjs --gfx low --tiers 0,1,2,3,4 --views spot,centre --min 1260
//
// Views: the penalty spot (looking at the goal), the centre circle (looking along the pitch), the tunnel (from the
// corridor to the mouth) and the stands (the main stand from the pitch); extra: dressing, corner. Each picture is the
// canvas alone (the HUD hidden), written to qa/out/wpD-<gfx>-t<tier>-<view>.png with its draw calls and triangles in
// qa/out/wpD-shots.json. Nothing is checked but the absence of console and page errors.
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, stepN, OUT, report} from "./lib.mjs";

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const GFX = opt("--gfx", "low,high").split(","), TIERS = opt("--tiers", "2").split(",").map(Number), MIN = +opt("--min", 15*60);
const VIEWS = {
  spot: {x: 41.5, z: 0, yaw: -Math.PI/2, pitch: 0},
  centre: {x: 0, z: 0, yaw: -Math.PI/2, pitch: .02},
  tunnel: {x: 0, z: -56, yaw: Math.PI, pitch: 0},
  stands: {x: 0, z: 10, yaw: 0, pitch: .12},
  dressing: {x: 0, z: -75, yaw: Math.PI, pitch: -.05},
  corner: {x: 50, z: 30, yaw: -2.3, pitch: .05}
};
const NAMES = opt("--views", "spot,centre,tunnel,stands").split(",");
const out = {shots: [], errors: []};
fs.mkdirSync(OUT, {recursive: true});
for (const gfx of GFX){
  const {page, close} = await launch({gfx, seed: 3});
  try {
    await career(page, {zone: "ground", min: MIN});
    await freeze(page);
    await page.addStyleTag({content: "#lifeRoot > *:not(#lifeCanvas){visibility:hidden !important}"});
    await page.evaluate(async () => { await import("/js/life/football/stadium.js"); });
    for (const tier of TIERS){
      await page.evaluate(tier => window.__life.enterZone("stadium", "dressing", {tier, crowd: [600, 4200, 21000, 41000, 70000][tier], cap: [900, 6000, 28000, 50000, 82000][tier],
        kits: {home: ["#c8202a", "#ffffff"], away: ["#1f4fb0", "#ffffff"]}, clubs: {home: "Steaua Dumbrava", away: "Rapid Lunca"}}), tier);
      for (const name of NAMES){
        const v = VIEWS[name]; if (!v) continue;
        await page.evaluate(v => { window.__life.place({x: v.x, z: v.z, y: 0, yaw: v.yaw}); window.__life.P.pitch = v.pitch; }, v);
        await stepN(page, 4);
        const r = await page.evaluate(() => { const R = window.__life.renderer(); R.info.autoReset = true; R.render(window.__life.scene(), window.__life.cam); return {calls: R.info.render.calls, tris: R.info.render.triangles}; });
        const file = path.join(OUT, `wpD-${gfx}-t${tier}-${name}.png`);
        await page.locator("#lifeCanvas").screenshot({path: file, timeout: 180000});
        out.shots.push(Object.assign({gfx, tier, view: name, file}, r));
        console.log(`${gfx} tier ${tier} ${name}: ${r.calls} calls, ${r.tris} triangles  ${file}`);
      }
    }
    out.errors.push(...page.errors);
  } finally { await close(); }
}
report("wpD-shots", out);
if (out.errors.length) console.log("errors:\n" + out.errors.join("\n"));
process.exit(out.errors.length ? 1 : 0);
