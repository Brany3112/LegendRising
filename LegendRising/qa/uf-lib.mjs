// qa/uf-lib.mjs: what the UF-B acceptance scripts share (USER-ISSUES U2, U3, U4, U5, U8, U10, U11): a page with a
// career at the ground, a match fixture entered (test:bench or test:11v11), world frames stepped in the page, real
// frames for the pictures, screenshots into qa/out/uf/.
// Owner: UF-B (stage TR-3+U). Contract: BUILD-PLAN section 0 "QA conventions" (real input for acceptance: keys with
// page.keyboard, clicks with page.mouse, the pointer locked by a real click on the 3D view; aim is a write to P.yaw and
// P.pitch, what a mouse move does).
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, unfreeze, OUT} from "./lib.mjs";
import {lockPointer} from "./trlib.mjs";
export {checker} from "./wpF-lib.mjs";

export const DIR = path.join(OUT, "uf");
fs.mkdirSync(DIR, {recursive: true});

// a page on a fixture: name "test:bench" (you a substitute) or "test:11v11"; o its options (kits, startMin, subOn,
// callAt, seated, warmSet...). The pointer is locked by a real click, then the page is frozen: the test steps it
export async function openFixture(name, o = {}, {seed = 5, w = 1280, h = 720, gfx = "low"} = {}){
  const {page, close} = await launch({gfx, seed, w, h});
  await career(page, {zone: "ground", min: 12*60});
  await page.evaluate(([name, o]) => window.__fp.enter(name, o), [name, o]);
  await unfreeze(page); await page.waitForTimeout(1500);
  const lock = await lockPointer(page);
  await freeze(page);
  const T = {page, close, lock};
  // world frames until a condition (a function, run in the page) holds; -1 when it never did within max
  T.until = (cond, max = 20000) => page.evaluate(([c, max]) => {
    const f = new Function("return (" + c + ")")();
    for (let i = 0; i < max; i++){ if (f()) return i; window.__life.stepN(1); }
    return f() ? max : -1;
  }, [cond.toString(), max]);
  T.frames = n => page.evaluate(n => window.__life.stepN(n), n);
  // a picture as the page draws it (its own frames for a moment), into qa/out/uf/<name>.png
  T.snap = async (name, ms = 250) => {
    await page.evaluate(() => { const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; window.__life.FADE.v = 0; });
    await unfreeze(page); await page.waitForTimeout(ms);
    const file = path.join(DIR, name + ".png");
    await page.screenshot({path: file, timeout: 180000});
    await freeze(page);
    console.log("  shot", path.relative(process.cwd(), file));
    return file;
  };
  // a real key press, held for a few world frames
  T.key = async (k, frames = 2) => { await page.keyboard.down(k); await T.frames(frames); await page.keyboard.up(k); };
  return T;
}
// the share of a screenshot region's pixels that are reddish (a halo), and how many are lit at all
export async function regionStats(page, file, box){
  const b64 = fs.readFileSync(file).toString("base64");
  return page.evaluate(async ([b64, box]) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.round(box.x0)), y0 = Math.max(0, Math.round(box.y0)), x1 = Math.min(img.width, Math.round(box.x1)), y1 = Math.min(img.height, Math.round(box.y1));
    if (x1 <= x0 || y1 <= y0) return {n: 0, red: 0};
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let red = 0, n = 0;
    for (let i = 0; i < d.length; i += 4){ n++; if (d[i] > 120 && d[i] > d[i + 1]*1.55 && d[i] > d[i + 2]*1.55) red++; }
    return {n, red: red/n};
  }, [b64, box]);
}
