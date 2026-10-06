// qa/smoke.mjs: a fresh career in each zone of the 3D world, a few real frames in each, and no errors.
// Owner: I0 (DESIGN 2.1); WP-0B extends it (DESIGN 2.0: "node qa/run.mjs smoke passes with zero console errors and
// zero page errors in every zone"; 2.2 WP-0B: the Settings segment and gfxApply for each tier).
//
//   node qa/smoke.mjs            exits 1 on any console error or uncaught page error, or a failed check; writes
//                                qa/out/smoke.json and a screenshot per zone (qa/out/smoke-<zone>.png)
//
// Before the career: the title screen's Settings, clicked for real. The Graphics control has four buttons (Auto, Low,
// Medium, High); each click applies its tier (GFX.tier, GFX.P, GFX.low, the body classes) and calls a subscriber
// registered with gfxOn exactly once, with (P, prevP, "user"); the run then goes back to the harness's tier (QA_GFX,
// Low by default), so the zones below run as they always have.
// In the world: the HUD carries the prompt's extra-lines box and the tooltips have no em dash, and css/fp.css and
// css/onb.css are linked and read.
import {launch, career, snap, report} from "./lib.mjs";

const FRAMES = 12, gfx = process.env.QA_GFX || "low", EM = String.fromCharCode(0x2014);
const t0 = Date.now(), res = {gfx, settings: null, zones: [], hud: null, errors: [], ok: false};
const fail = msg => res.errors.push(msg);
const {page, close} = await launch({gfx, seed: 1});

// the title screen's Settings sheet, its Graphics control clicked through every tier
async function settings(){
  const out = {steps: []};
  await page.evaluate(() => { window.__gfxCalls = []; window.__gfxOff = gfxOn((P, prevP, reason) => window.__gfxCalls.push({tier: P.tier, prev: prevP && prevP.tier, reason})); });
  await page.locator(".title-screen button", {hasText: "Settings"}).click();
  await page.waitForSelector("#sheetRoot.open .seg button");
  const labels = await page.locator("#sheetRoot .seg button").allTextContents();
  out.buttons = labels;
  if (labels.join(",") !== "Auto,Low,Medium,High") fail(`settings: the Graphics control shows ${JSON.stringify(labels)}, not Auto, Low, Medium, High`);
  const want = {Auto: "auto", Low: "low", Medium: "medium", High: "high"};
  const order = ["Medium", "High", "Auto", "Low", "High", "Medium"].filter(l => want[l] !== gfx).concat(Object.keys(want).find(l => want[l] === gfx));
  for (const label of order){
    const before = await page.evaluate(() => ({n: window.__gfxCalls.length, tier: GFX.tier}));
    await page.locator("#sheetRoot .seg button", {hasText: label}).click();
    const st = await page.evaluate(() => ({mode: GFX.mode, tier: GFX.tier, low: GFX.low, P: GFX.P === GFX_PRESETS[GFX.tier], body: [...document.body.classList].filter(c => /^gfx-|^low$/.test(c)).sort(),
      calls: window.__gfxCalls.slice(), pressed: [...document.querySelectorAll("#sheetRoot .seg button[aria-pressed=true]")].map(b => b.textContent),
      buttons: document.querySelectorAll("#sheetRoot .seg button").length, note: [...document.querySelectorAll("#sheetRoot .seg ~ .muted")].map(d => d.textContent.trim())}));
    const calls = st.calls.slice(before.n), step = {label, mode: st.mode, tier: st.tier, low: st.low, body: st.body, calls, pressed: st.pressed, note: st.note};
    out.steps.push(step);
    const why = [];
    if (st.mode !== want[label]) why.push(`mode ${st.mode}`);
    if (!st.P) why.push("GFX.P is not the preset of its tier");
    if (st.low !== (st.tier === "low")) why.push(`GFX.low ${st.low} on ${st.tier}`);
    if (st.body.join(" ") !== ["gfx-" + st.tier, ...(st.tier === "low" ? ["low"] : [])].sort().join(" ")) why.push(`body classes ${st.body.join(" ")}`);
    if (calls.length !== 1 || calls[0].tier !== st.tier || calls[0].prev !== before.tier || calls[0].reason !== "user") why.push(`subscriber calls ${JSON.stringify(calls)}`);
    if (st.buttons !== 4 || st.pressed.join() !== label) why.push(`after the click the control shows ${st.buttons} buttons, pressed ${st.pressed.join()}`);
    if (label === "Auto" && !st.note.some(t => t.startsWith("Currently: ")) ) why.push(`no "Currently:" line under Auto (${JSON.stringify(st.note)})`);
    if (st.note.some(t => t.includes(EM))) why.push("an em dash under the control");
    if (why.length) fail(`settings: clicking ${label}: ${why.join("; ")}`);
    console.log(`settings: ${label} -> ${st.tier}${st.mode === "auto" ? " (Auto)" : ""}, body ${st.body.join(" ")}, ${calls.length} subscriber call${calls.length === 1 ? "" : "s"}${why.length ? "  FAIL" : ""}`);
  }
  await page.locator("#sheetRoot .sheet-x").click();
  await page.waitForFunction(() => !document.querySelector("#sheetRoot.open"));
  await page.evaluate(() => { window.__gfxOff(); delete window.__gfxOff; });
  return out;
}

try {
  res.settings = await settings();
  const info = await career(page, {zone: "home", at: "bed", min: 12*60});
  res.career = info;
  for (const zone of ["home", "ground", "town"]){
    if (zone !== "home") await page.evaluate(z => window.__life.enterZone(z, "bus"), zone);
    const f0 = await page.evaluate(() => window.__life.presented);
    await page.waitForFunction(n => window.__life.presented >= n, f0 + FRAMES, {timeout: 120000});
    const st = await page.evaluate(() => { const L = window.__life, P = L.P; return {zone: L.LIFE.zone, presented: L.presented, P: [P.x, P.feet, P.z].map(v => +v.toFixed(2)), finite: [P.x, P.z, P.feet, P.yaw, P.eye].every(Number.isFinite)}; });
    st.shot = await snap(page, "smoke-" + zone);
    st.errors = page.errors.length;
    res.zones.push(st);
    console.log(`${zone}: ${FRAMES} frames presented (${st.presented} in all), you at ${st.P.join(", ")}, ${st.errors} errors so far`);
    if (st.zone !== zone || !st.finite) page.errors.push(`zone ${zone}: the world says ${st.zone}, position finite ${st.finite}`);
  }
  // the HUD and the stylesheets WP-0B added
  res.hud = await page.evaluate(() => {
    const css = n => [...document.styleSheets].some(s => s.href && s.href.includes("css/" + n));
    const root = getComputedStyle(document.documentElement);
    return {lines: !!document.querySelector("#lifePrompt .lp-txt .lp-hint + .lp-lines"),
      tooltips: [...document.querySelectorAll(".hud-needs .need")].map(n => n.getAttribute("title") || ""),
      fpCss: css("fp.css"), onbCss: css("onb.css"), fpToken: root.getPropertyValue("--fp-ring").trim(), onbToken: root.getPropertyValue("--onb-focus-width").trim(), tier: GFX.tier};
  });
  if (!res.hud.lines) fail("hud: no .lp-lines box after .lp-hint in the prompt");
  if (res.hud.tooltips.some(t => t.includes(EM))) fail("hud: a tooltip with an em dash: " + JSON.stringify(res.hud.tooltips));
  if (!res.hud.fpCss || res.hud.fpToken !== "24px") fail(`hud: css/fp.css not read (linked ${res.hud.fpCss}, --fp-ring "${res.hud.fpToken}")`);
  if (!res.hud.onbCss || res.hud.onbToken !== "2px") fail(`hud: css/onb.css not read (linked ${res.hud.onbCss}, --onb-focus-width "${res.hud.onbToken}")`);
  if (res.hud.tier !== gfx && gfx !== "auto") fail(`the run ended on ${res.hud.tier}, not ${gfx}`);
  console.log(`hud: prompt lines box ${res.hud.lines}, fp.css ${res.hud.fpCss}, onb.css ${res.hud.onbCss}, graphics ${res.hud.tier}`);
} catch(e){ page.errors.push("smoke: " + (e && e.stack || e)); }
finally {
  res.errors = [...res.errors, ...page.errors];
  res.ok = res.errors.length === 0 && res.zones.length === 3 && !!res.settings;
  res.ms = Date.now() - t0;
  report("smoke", res);
  await close();
}
if (!res.ok) console.log("errors:\n  " + res.errors.join("\n  "));
console.log(res.ok ? "smoke: pass" : "smoke: FAIL");
process.exit(res.ok ? 0 : 1);
