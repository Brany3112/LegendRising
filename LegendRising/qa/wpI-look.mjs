// qa/wpI-look.mjs: the training ground as you see it after the relayout (DESIGN 3.6.1), from the places that matter:
// the gate, the near touchline, each drill station, the centre spot looking at both goals, the tunnel, the clubhouse's
// delivery counter, by day and at night. Screenshots to qa/out/wpI-look-*.png, for a person to look at; it fails only
// on console or page errors.
// Owner: WP-I (Stage P2). Contract: DESIGN 2.4 WP-I ("look at your results: screenshots of the new pitch").
//
//   node qa/wpI-look.mjs [name ...]     only the views named (gate, near, centre-e, ...)
import {launch, career, freeze, stepN, snap, report, expect} from "./lib.mjs";

const only = process.argv.slice(2).filter(a => !a.startsWith("-"));
const V = [
  {name:"gate", at:{x:-14, z:23.2, yaw:Math.PI}, pitch:-.05},
  {name:"near", at:{x:0, z:-2.6, yaw:0}, pitch:-.12},
  {name:"centre-e", at:{x:0, z:-28, yaw:-Math.PI/2}, pitch:-.04},
  {name:"centre-w", at:{x:0, z:-28, yaw:Math.PI/2}, pitch:-.04},
  {name:"box-e", at:{x:20, z:-28, yaw:-Math.PI/2}, pitch:-.02},
  {name:"stand", at:{x:0, z:-40, yaw:0}, pitch:.05},
  {name:"corner", at:{x:-35, z:-5.5, yaw:-Math.PI*.75}, pitch:-.05},
  {name:"shoot", at:{x:17, z:-24, yaw:-Math.PI/2}, pitch:-.05},
  {name:"pass", at:{x:-2, z:-15, yaw:0}, pitch:-.1},
  {name:"head", at:{x:-27, z:-29, yaw:Math.PI/2}, pitch:-.02},
  {name:"intercept", at:{x:-16, z:-43, yaw:0}, pitch:-.08},
  {name:"duel", at:{x:22, z:-43, yaw:-Math.PI/2}, pitch:-.08},
  {name:"setpiece", at:{x:13, z:-32, yaw:-Math.PI/2}, pitch:-.02},
  {name:"tunnel", at:{x:0, z:-50, yaw:0}, pitch:.02},
  {name:"counter", at:{x:20.6, z:8.5, yaw:Math.PI*.62}, pitch:-.25},
  {name:"night", at:{x:-30, z:-6, yaw:-Math.PI*.8}, pitch:0, min:21*60 + 30}
].filter(v => !only.length || only.includes(v.name));

const {page, close} = await launch({gfx:process.env.QA_GFX || "medium", seed:3});
const out = {views:[]};
try {
  await career(page, {zone:"ground", min:11*60});
  await freeze(page);
  for (const v of V){
    await page.evaluate(v => {
      const L = window.__life;
      if (v.min){ S.life.min = v.min; L.FLAGS.forceSky = true; }
      L.place({x:v.at.x, z:v.at.z, y:0, yaw:v.at.yaw}); L.P.pitch = v.pitch || 0;
      if (L.FADE){ L.FADE.v = 0; L.FADE.boot = false; }
      const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; }
    }, v);
    await stepN(page, 40);
    const file = await snap(page, "wpI-look-" + v.name);
    out.views.push({name:v.name, file});
    console.log(v.name, file);
  }
  out.bounds = await page.evaluate(() => window.__life.bounds);
  out.errors = page.errors.slice();
} catch(e){ out.errors = (page.errors || []).concat(["wpI-look: " + (e && e.stack || e)]); }
finally {
  report("wpI-look", out);
  await close();
}
expect(!out.errors.length, out.errors.join("\n"));
console.log("wpI-look: done");
