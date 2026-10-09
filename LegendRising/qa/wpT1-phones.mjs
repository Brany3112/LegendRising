// qa/wpT1-phones.mjs: both phones with no club, the leaderboard's text from older builds, and hours read from constants.
// Owner: WP-T1 (DESIGN 2.3 WP-T1 acceptance: "opening both phones with S.club = null throws nothing", the online.js /
// main.js sentinel; 3.10 text sweep rules: persisted text from other players, ranges in sentences; 1.8 text helpers).
//
//   QA_PORT=8771 node qa/wpT1-phones.mjs     exits 1 on a failed check or any console or page error;
//                                             writes qa/out/wpT1-phones.json and qa/out/wpT1-*.png
//
// The game has no S.club: "no club" is the player's own record with club -1 (myClub() null), which is where a career
// stands between creation and the first signature, and after a release (the admin panel's "Fire myself"). Here the
// career is released that way, then every view of the keypad phone and every app and tab of the smartphone is drawn,
// through the same calls their buttons make. The leaderboard is then filled from a stand-in for the online service
// with rows an older build uploaded (em dashes in award names, a lone dash for "no league"), and the account box is
// asked about a board row with no save slot (the sentinel). Last, the shop hours on the barber's door and chairs and
// the town hall's door, as the world shows them.
import {launch, career, snap, report} from "./lib.mjs";

const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
const res = {checks: [], errors: [], ok: false}, t0 = Date.now();
const check = (name, ok, detail) => { res.checks.push({name, ok: !!ok, detail}); console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ": " + detail : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 5});

try {
  await career(page, {zone: "home", min: 12*60});
  // released: the player's record has no club and no contract (admin.js "release", the state before a first signing)
  const free = await page.evaluate(() => { const me = meP(); me.club = -1; S.contract = null; S.raise = null; return {club: myClub(), lg: myLg()}; });
  check("the career has no club", free.club === null && free.lg === null, JSON.stringify(free));

  /* ---------- the keypad phone ---------- */
  const kp = await page.evaluate(() => {
    const out = {views: [], errors: [], text: {}};
    S.phone = "keypad"; openPhone();
    const K = PH.kp, cc = Object.keys(COUNTRIES)[0], lg = Object.values(W.leagues).find(l => l.cc === cc);
    const visit = (view, data) => {
      try { K.view = view; K.data = data; K.sel = 0; K.scroll = 0; K.hist = []; renderPhone(); const t = document.querySelector("#phoneHolder").textContent; out.views.push(view); out.text[view] = t; }
      catch(e){ out.errors.push(`${view}: ${e && e.message}`); }
    };
    for (const [v, d] of [["home"], ["stats"], ["scoutC"], ["scoutL", cc], ["scoutK", lg.id], ["scoutGo", lg.clubs[0]], ["msgs"], ["settings"], ...(document.body.classList.contains("life") ? [["foodies"]] : [])]) visit(v, d);
    // and through the keys, as a player does it: home, down to Stats, select
    try { K.view = "home"; K.hist = []; K.sel = 0; renderPhone(); const items = kpView().items.map(i => i.l); K.sel = items.indexOf("Stats"); kpKey("ok"); out.keyed = K.view;
      for (let i = 0; i < 30; i++) kpKey("down"); kpKey("end"); out.back = K.view; }
    catch(e){ out.errors.push(`keys: ${e && e.message}`); }
    // the stats screen scrolled to its club line
    const lines = (() => { K.view = "stats"; return kpView().lines; })();
    out.clubLine = lines.find(l => /^Club:/.test(l)) || null;
    closePhone();
    return out;
  });
  check("keypad phone: every view drawn with no club", kp.errors.length === 0 && kp.views.length >= 8, kp.errors.join("; ") || kp.views.join(", "));
  check("keypad phone: the keys reach Stats and come back", kp.keyed === "stats" && kp.back === "home", `${kp.keyed}, back to ${kp.back}`);
  check("keypad phone: Stats says you are a free agent", kp.clubLine === "Club: Free agent", JSON.stringify(kp.clubLine));
  check("keypad phone: no em dash on any screen", !Object.values(kp.text).some(t => t.includes(EM)), "");

  /* ---------- the smartphone ---------- */
  const sm = await page.evaluate(() => {
    const out = {drawn: [], errors: [], dash: [], home: ""};
    S.phone = "smart"; S.apps = Object.keys(APPS); if (!S.social) socialInit("tester");
    S.rivalId = S.rivalId >= 0 ? S.rivalId : W.players.findIndex(p => p && !p.me && p.club >= 0);
    openPhone();
    const text = () => document.querySelector("#phoneHolder").textContent;
    const draw = (label, stack) => {
      try { PH.stack = stack; renderSmart(true); const t = text(); out.drawn.push(label); if (t.includes(String.fromCharCode(0x2014))) out.dash.push(label); return t; }
      catch(e){ out.errors.push(`${label}: ${e && e.message}`); return ""; }
    };
    out.home = draw("home", []);
    const a = (app, view, p) => ({app, view: view || "main", p: p || {}});
    for (const app of ["store", "msgs", "settings", "news", "bank", "foodies"]) draw(app, [a(app)]);
    for (const k of ["g", "a"]) draw("stats " + k, [a("stats", "main", {k})]);
    for (const tab of ["feed", "post", "me", "find"]) draw("showoff " + tab, [a("showoff", "main", {tab})]);
    for (const tab of ["me", "league", "rival", "tops", "buzz"]) draw("visage " + tab, [a("visage", "main", {tab})]);
    const other = W.players.find(p => p && !p.me && p.club >= 0);
    draw("visage compare", [a("visage"), a("visage", "cmp", {id: other.id})]);
    for (const v of ["table", "fx", "cup", "CL", "EL", "wc"]) draw("tables " + v, [a("league", "main", {v})]);
    const cc = Object.keys(COUNTRIES)[0], lg = Object.values(W.leagues).find(l => l.cc === cc);
    draw("scout", [a("scout")]); draw("scout lg", [a("scout"), a("scout", "lg", {cc})]); draw("scout clubs", [a("scout"), a("scout", "clubs", {lg: lg.id})]);
    // and a tap on the home screen, the way a finger opens an app
    try { PH.stack = []; renderSmart(); [...document.querySelectorAll("#phoneHolder .sm-grid button.app")].find(b => /Messages/.test(b.textContent)).click(); out.tapped = smTop() && smTop().app; smHome(); }
    catch(e){ out.errors.push(`tap: ${e && e.message}`); }
    out.fx = (() => { PH.stack = [a("league", "main", {v: "fx"})]; renderSmart(); return document.querySelector("#smBody").textContent.trim(); })();
    closePhone();
    return out;
  });
  check("smartphone: every app and tab drawn with no club", sm.errors.length === 0 && sm.drawn.length === 28, sm.errors.join("; ") || `${sm.drawn.length} screens`);
  check("smartphone: the home screen says free agent", /Free agent/.test(sm.home), sm.home.slice(0, 80));
  check("smartphone: a tap on the home screen opens an app", sm.tapped === "msgs", String(sm.tapped));
  check("smartphone: no em dash on any screen", sm.dash.length === 0, sm.dash.join(", "));
  check("smartphone: My fixtures explains there is no club", /No club, so no fixtures/.test(sm.fx), sm.fx.slice(0, 90));

  /* ---------- the leaderboard, filled by an older build ---------- */
  const rank = await page.evaluate(async ({EM}) => {
    const rows = [
      {uid: "old1", d: {name: "Ana Pop", handle: "anap", club: "CS Arini", league: "Liga 4 " + EM + " Seria 2", score: 900, money: 1200,
        career: {apps: 30, goals: 12, assists: 4, motm: 3}, season: {apps: 10, goals: 4, assists: 1},
        awardList: ["Player of the Week " + EM + " Liga 4", "Goal of the Month " + EM + " October"], trophyList: [], ovr: 60, level: 5}},
      {uid: "old2", d: {name: "Dan Ilie", handle: "dani", club: "Free agent", league: EM, score: 300, money: 50, career: {}, season: {}, awardList: [], trophyList: []}}];
    window.FB_CONFIG = {apiKey: "qa-key", projectId: "qa-project"};
    ONLINE.ready = false; ONLINE.loading = null; ONLINE.board = null; ONLINE.boardAt = 0;
    const docs = {board: {old1: {slot: null}}};
    ONLINE.loadSdk = async () => ({
      app: {initializeApp: () => ({})},
      auth: {getAuth: () => ({}), onAuthStateChanged: (a, cb) => cb(null), signOut: async () => {}},
      store: {getFirestore: () => ({}), collection: () => ({}), query: () => ({}), orderBy: () => ({}), limit: () => ({}),
        doc: (db, col, id) => ({col, id}),
        getDoc: async r => ({exists: () => !!(docs[r.col] && docs[r.col][r.id]), data: () => docs[r.col][r.id]}),
        getDocs: async () => ({forEach: f => rows.forEach(r => f({id: r.uid, data: () => JSON.parse(JSON.stringify(r.d))}))})}
    });
    S.phone = "smart"; RANK.rows = null; RANK.err = ""; RANK.open = null;
    openPhone(); PH.stack = [{app: "rank", view: "main", p: {}}]; renderSmart(true);
    for (let i = 0; i < 100 && (RANK.loading || RANK.rows === null); i++) await new Promise(r => setTimeout(r, 20));
    rankTap("old1"); renderSmart();
    const list = document.querySelector("#smBody").textContent;
    // the account box: a board row with no save slot behind it (the sentinel, written by online.js, read by main.js)
    ONLINE.user = {uid: "old1", email: "qa@example.com"};
    await cloudBest();
    const probe = Object.assign({}, ONLINE.probe);
    const box = typeof cloudBoxHTML === "function" ? (CLOUD.info = null, CLOUD.loading = false, CLOUD.checked = true, cloudBoxHTML()) : null;
    ONLINE.user = null; closePhone();
    return {err: RANK.err, rows: RANK.rows, list, probe, box};
  }, {EM});
  const awards = rank.rows && rank.rows[0] ? rank.rows[0].awardList : null;
  check("leaderboard: rows from an older build loaded", !rank.err && rank.rows && rank.rows.length === 2, rank.err || `${rank.rows && rank.rows.length} rows`);
  check("leaderboard: award names read as label: value", JSON.stringify(awards) === JSON.stringify(["Player of the Week: Liga 4", "Goal of the Month: October"]), JSON.stringify(awards));
  check("leaderboard: a lone dash shows as the empty-cell mark", rank.rows && rank.rows[1].league === EN && rank.rows[0].league === "Liga 4: Seria 2", rank.rows && JSON.stringify(rank.rows.map(r => r.league)));
  check("leaderboard: no em dash on the board", !rank.list.includes(EM) && /Player of the Week: Liga 4/.test(rank.list), rank.list.slice(0, 120));
  check("account box: a board row with no slot is read as no slot", rank.probe.board === true && rank.probe.slots.length === 0 && rank.box !== null && !/\(save /.test(rank.box) && /You are on the leaderboard, but no career file came with it/.test(rank.box),
    `probe ${JSON.stringify({board: rank.probe.board, slots: rank.probe.slots})}`);

  /* ---------- hours on the doors, from the constants ---------- */
  const home = await page.evaluate(() => {
    const L = window.__life, spots = L.spots;
    const door = spots.find(s => s.label === "Fade & Co. Barbers"), chair = spots.find(s => s.label === "Barber's chair");
    const was = L.LIFE.min; L.LIFE.min = 22*60; const shut = chair ? chair.hint : null; L.LIFE.min = was;
    return {door: door ? door.hint : null, shut, want: fmtRange(BARBER.open, BARBER.close)};
  });
  check("barber: the door gives the shop's hours", home.door === `Open ${home.want} · walk in`, JSON.stringify(home.door));
  check("barber: a chair after closing gives them too", home.shut === `Closed · open ${home.want}`, JSON.stringify(home.shut));
  await page.evaluate(() => window.__life.enterZone("town", "bus"));
  const f0 = await page.evaluate(() => window.__life.presented);
  await page.waitForFunction(n => window.__life.presented >= n, f0 + 3, {timeout: 180000});
  const town = await page.evaluate(() => { const s = window.__life.spots.find(x => /^Primăria/.test(x.label || "")); return {zone: window.__life.LIFE.zone, hint: s ? s.hint : null}; });
  check("town hall: the door gives its weekday hours with to", town.zone === "town" && town.hint === "The town hall · open weekdays, 8:00 AM to 4:00 PM", JSON.stringify(town));
  await snap(page, "wpT1-town");
} catch(e){ page.errors.push("wpT1-phones: " + (e && e.stack || e)); }
finally {
  res.errors = [...page.errors];
  res.ok = res.errors.length === 0 && res.checks.length > 0 && res.checks.every(c => c.ok);
  res.ms = Date.now() - t0;
  report("wpT1-phones", res);
  await close();
}
if (res.errors.length) console.log("errors:\n  " + res.errors.join("\n  "));
console.log(res.ok ? "wpT1-phones: pass" : "wpT1-phones: FAIL");
process.exit(res.ok ? 0 : 1);
