// qa/wpW2-ui.mjs: Motivation on the stats panel and the coach's style in club info (addendum A1.8).
// Owner: WP-W2 (stage P2c).
//
//   node qa/wpW2-ui.mjs        exits 1 on any failed check, console error or page error; writes qa/out/wpW2-ui.json and
//                              the screenshots qa/out/wpW2-skills.png, qa/out/wpW2-today.png, qa/out/wpW2-office.png
//
// A signed career at the training ground. The computer (the club portal) shows Motivation with its number, its word and
// the one-line reason of the last thing that moved it, on the Skills tab (the stats panel) and on Today; the hub's card
// and form strip carry it too. Club info names the coach's style: the manager's office (with his line about your
// Motivation), Scout Pro's club list and talks, the start offers and the squad card. No em dash in any of it.
import {launch, report, career, snap} from "./lib.mjs";

const EM = String.fromCharCode(0x2014);
const out = {checks: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 260) : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 9});
try {
  await career(page, {zone: "ground", frames: 2});
  const style = await page.evaluate(() => ({id: coachStyle(), name: COACH_STYLES[coachStyle()].name, line: COACH_STYLES[coachStyle()].line, club: myClub().nm}));
  check("your club has a coach style", ["attacking", "pressing", "technical"].includes(style.id), style);

  // the stats panel: the computer's Skills tab
  await page.evaluate(() => { S.player.motivation = 60; motivationAdd(12, "In early and through the whole session. It shows."); openComputer("ground"); pcTab("skills"); });
  await page.waitForSelector("#lifePanel .pc-motiv", {timeout: 20000});
  const sk = await page.evaluate(() => { const el = document.querySelector("#lifePanel .pc-motiv"); return {text: el.innerText, bar: (el.querySelector(".pb i") || {}).style ? el.querySelector(".pb i").style.width : ""}; });
  check("Skills tab: a Motivation card", /Motivation/i.test(sk.text), sk.text.slice(0, 120));
  check("with its number and its word", /\b72\b/.test(sk.text) && /Hungry/.test(sk.text), sk.text.slice(0, 120));
  check("with the reason and the change", sk.text.includes("In early and through the whole session. It shows.") && sk.text.includes("+12"), sk.text);
  check("the bar is 72% full", parseFloat(sk.bar) === 72, sk.bar);
  check("no em dash on the card", !sk.text.includes(EM));
  await page.waitForTimeout(700); await snap(page, "wpW2-skills");
  // Today: next to the dressing room's numbers
  await page.evaluate(() => pcTab("today"));
  const td = await page.evaluate(() => { const b = document.querySelector("#lifePanel .pc-body"); return b ? b.innerText : ""; });
  check("Today tab: Motivation beside Chemistry and the manager's trust", /Motivation\s*72/.test(td) && /Hungry/.test(td), td.slice(0, 400));
  await page.waitForTimeout(700); await snap(page, "wpW2-today");
  // a drop: the panel follows it, the reason with a minus sign
  await page.evaluate(() => { motivationAdd(-4, "You skipped training. That never feels good the day after."); pcTab("skills"); });
  const sk2 = await page.evaluate(() => document.querySelector("#lifePanel .pc-motiv").innerText);
  check("after skipping training: 68, the new reason, a real minus sign", /\b68\b/.test(sk2) && sk2.includes("You skipped training.") && sk2.includes(String.fromCharCode(0x2212) + "4"), sk2);
  await page.evaluate(() => lpClose(true));

  // the hub: the card's meter and the form strip
  const hub = await page.evaluate(() => {
    const d = document.createElement("div"); d.innerHTML = formStrip(); const fs = d.innerText;
    return {fs, title: d.querySelector(".fs-row[title]") ? d.querySelector(".fs-row[title]").getAttribute("title") : ""};
  });
  check("the form strip has Motivation, with the reason on hover", /Motivation/.test(hub.fs) && hub.title.includes("You skipped training."), hub);

  // club info: the manager's office
  await page.evaluate(() => openSheet("manager"));
  await page.waitForSelector(".mgr-style", {timeout: 20000});
  const off = await page.evaluate(() => ({style: document.querySelector(".mgr-style").innerText, line: document.querySelector(".mgr-motiv").innerText}));
  check("the office names the coach's style", off.style.includes(`${style.name} coach.`) && off.style.includes(style.line), off.style);
  check("and the manager says something about your Motivation", off.line === await page.evaluate(() => motivationManagerLine()) && off.line.length > 20, off.line);
  await page.waitForTimeout(700); await snap(page, "wpW2-office");
  await page.evaluate(() => { if (typeof closeSheet === "function") closeSheet(); });
  // Scout Pro: the clubs of a league, and talks with one
  const sc = await page.evaluate(() => {
    const lg = myClub().lg, v = APPVIEWS.scout({view: "clubs", p: {lg}}), d = document.createElement("div"); d.innerHTML = v.html;
    const rows = [...d.querySelectorAll(".list-row")].map(r => r.innerText);
    const other = W.leagues[lg].clubs.find(id => id !== myClub().id);
    const want = W.leagues[lg].clubs.map(id => W.clubs[id]).sort((a, b) => b.rep - a.rep).map(c => `${COACH_STYLES[c.coachStyle].name} coach`);
    PH.neg = openNegotiation(other); const n = negView(); const e = document.createElement("div"); e.innerHTML = n.html; PH.neg = null;
    return {rows, want, neg: e.querySelector(".neg-coach") ? e.querySelector(".neg-coach").innerText : "", negWant: COACH_STYLES[W.clubs[other].coachStyle].name, err: n.error || null};
  });
  check("Scout Pro's club list: every club's coach", sc.rows.length === sc.want.length && sc.rows.every((r, i) => r.includes(sc.want[i])), sc.rows.slice(0, 3));
  check("Scout Pro's talks: the coach and what he wants", sc.neg.startsWith(`${sc.negWant} coach.`), sc.neg);
  // the squad card and the offers screen (rendered as the hub renders them)
  const sq = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = squadPanel(); return d.querySelector(".sq-title").innerText; });
  check("the squad card names the coach", sq.includes(`${style.name} coach`), sq);
  const of = await page.evaluate(() => {
    const save = S.offerSet; S.offerSet = {ctx: "contract", list: W.clubs.slice(0, 3).map(c => baseOffer(c))};
    const keep = document.querySelector("#app") ? document.querySelector("#app").innerHTML : null;
    let txt = [];
    try { screenOffers(); txt = [...document.querySelectorAll(".offer-coach")].map(e => e.textContent.trim()); }
    finally { S.offerSet = save; }
    return {txt, want: W.clubs.slice(0, 3).map(c => `${COACH_STYLES[c.coachStyle].name} coach`)};
  });
  check("the offers screen names each club's coach", JSON.stringify(of.txt) === JSON.stringify(of.want), of);
  const all = await page.evaluate(() => document.body.innerText);
  check("no em dash anywhere on the page", !all.includes(EM));
} catch(e){ out.error = String(e && e.stack || e); console.log(out.error); }
finally {
  out.errors = page.errors.slice();
  out.ok = !out.error && !out.errors.length && out.checks.every(c => c.ok);
  if (out.errors.length) console.log("errors:\n  " + out.errors.join("\n  "));
  report("wpW2-ui", out);
  await close();
}
console.log(out.ok ? "wpW2-ui: pass" : "wpW2-ui: FAIL");
process.exit(out.ok ? 0 : 1);
