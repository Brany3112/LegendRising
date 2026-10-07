// qa/wpG-fridge.mjs: WP-G acceptance for the fridge (DESIGN 3.8.2, 2.3 WP-G "fridge").
// Owner: WP-G.
//
//   doors     for every fridge tier, with every door closed nothing on a shelf can be aimed at from 24 views in front
//             of it; with one door open, exactly the things behind that door can (a French door its own side, the
//             middle with either), and nothing behind the others
//   tooltip   for every FOOD id, at tiers 1 and 6, during a power cut and for a second energy drink: the "You get"
//             numbers under the item are the chip's numbers after eating it (+-0.5); the power-cut line reads
//             "Power outage −30%"; the door's hint names the fridge quality and the outage
//   events    opening a door past FRIDGE_OPEN sends lifeOnb "fridge" once
//
//   QA_PORT=8773 node qa/wpG-fridge.mjs      exits 1 on any failure; writes qa/out/wpG-fridge.json
import {launch, career, freeze, report} from "./lib.mjs";

const checks = [];
const check = (name, ok, detail) => {
  checks.push({name, ok: !!ok, detail});
  if (!ok || process.env.QA_VERBOSE) console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`);
};
const MINUS = "−";

const {page, close} = await launch({gfx: "low", seed: 11});
try {
  await career(page, {zone: "home", at: "bed", min: 12*60});
  await freeze(page);
  // helpers in the page: put a fridge of tier t in the flat, the views, and the targets
  await page.evaluate(() => {
    const L = __life;
    window.__wg = {
      onb: [],
      fridge(t){
        const fx = S.home.fx, p = fx.furn.find(q => FURN[q.id] && FURN[q.id].kind === "fridge");
        p.id = "fridge" + t; delete p.x; delete p.z; delete p.ry;
        for (const k of Object.keys(FOOD)) S.inv[k] = 2;
        L.enterZone("home", "bed");
        L.stepN(2);
        return t;
      },
      doors(){ return L.spots.filter(sp => sp.kind === "drag" && (sp.label === "Fridge" || sp.label === "Freezer") && sp.hinge); },
      items(){ return L.spots.filter(sp => sp.fridge && sp.item); },
      // stand well clear of the door's swing (in front of the fridge, 1.4 m back), and look at a point
      view(front, toward, k){
        const P = L.P, a = (k % 8 - 3.5)*.16, d = 1.0 + (Math.floor(k/8))*.3;
        const fx = front.x - toward.x, fz = front.z - toward.z, len = Math.hypot(fx, fz) || 1, ux = fx/len, uz = fz/len;
        const ca = Math.cos(a), sa = Math.sin(a), vx = ux*ca - uz*sa, vz = ux*sa + uz*ca;
        const cam = L.cam, eye = 1.45 + (k % 3)*.15;
        cam.position.set(toward.x + vx*d, front.y + eye, toward.z + vz*d);
        return cam;
      },
      aimAt(sp, k){
        const box = typeof sp.aim === "function" ? sp.aim() : sp.aim, c = box[0].map((v, i) => (v + box[1][i])/2);
        const fr = __life.W.fridges[0], cam = this.view(fr, {x:c[0], z:c[2]}, k);
        cam.lookAt(c[0], c[1], c[2]); cam.updateMatrixWorld(true);
        return L.target();
      },
      open(D, on){ D.toggle(); for (let i = 0; i < 120; i++) L.stepN(1); return D.angle; },
      closeAll(){ for (const D of this.doors()) if (D.angle > .05){ D.toggle(); } L.stepN(120); }
    };
    const on0 = window.lifeOnb;
    window.lifeOnb = (ev, d) => { __wg.onb.push(ev); if (on0) on0(ev, d); };
  });

  /* ---------- doors gate their own shelves, for every tier ---------- */
  for (let t = 1; t <= 6; t++){
    const r = await page.evaluate(t => {
      const L = __life; __wg.fridge(t);
      // (you stay at the bed, well clear of the doors: a door stops short of you rather than swing through you)
      const out = {t, items:__wg.items().length, doors:__wg.doors().map(d => d.label), closedHits:0, closedViews:0, perDoor:[]};
      // every door closed: 24 views at every item
      for (const sp of __wg.items()) for (let k = 0; k < 24; k++){ out.closedViews++; const hit = __wg.aimAt(sp, k); if (hit && hit.fridge && hit.item) out.closedHits++; }
      // one door at a time
      const doors = __wg.doors();
      doors.forEach((D, i) => {
        __wg.onb.length = 0;
        __wg.open(D);
        const row = {door:D.label, angle:+D.angle.toFixed(2), behind:0, behindHit:0, behindReach:0, other:0, otherHit:0, whenWrong:0, onb:__wg.onb.filter(e => e === "fridge").length};
        for (const sp of __wg.items()){
          const mine = !!(sp.mask & (1 << i));
          if (sp.when() !== mine) row.whenWrong++;
          // aim from straight in front, a few views
          // aimed at from 24 views: did any of them give you this thing (hit), or at least something behind the open
          // door (reach: a thing at the back of a shelf may stand behind the one in front of it)
          let hit = 0, reach = 0;
          for (let k = 0; k < 24; k++){ const h = __wg.aimAt(sp, k); if (h === sp) hit++; if (h && h.fridge && h.item && (h.mask & (1 << i))) reach++; }
          if (mine){ row.behind++; if (hit) row.behindHit++; if (reach) row.behindReach++; } else { row.other++; if (hit) row.otherHit++; }
        }
        out.perDoor.push(row);
        D.toggle(); L.stepN(150);
      });
      return out;
    }, t);
    check(`tier ${t}: ${r.items} things on the shelves`, r.items > 0, r);
    check(`tier ${t}: doors closed, nothing targetable from 24 views (${r.closedViews} aims)`, r.closedHits === 0, r.closedHits);
    for (const d of r.perDoor){
      check(`tier ${t}, ${d.door} open: every item's gate matches its doors`, d.whenWrong === 0, d);
      check(`tier ${t}, ${d.door} open: nothing behind another door is targetable`, d.otherHit === 0, d);
      if (d.behind) check(`tier ${t}, ${d.door} open: what is behind it can be reached (${d.behindHit} of ${d.behind} hit directly)`, d.behindReach === d.behind && d.behindHit >= Math.ceil(d.behind/2), d);
      check(`tier ${t}, ${d.door} open: lifeOnb "fridge" once`, d.onb === 1, d.onb);
    }
    // tier 6: the French doors each open their own side, the middle with either
    if (t === 6){
      const m = await page.evaluate(() => __wg.items().map(sp => sp.mask));
      check("tier 6: some slots open with the left door only, some with the right only, the middle with either", m.includes(1) && m.includes(2) && m.includes(3), m);
    }
    if (t === 2 || t === 5){
      const f = r.perDoor.find(d => d.door === "Freezer");
      check(`tier ${t}: the freezer door covers nothing`, f && f.behind === 0, f);
    }
  }

  /* ---------- tooltips are what eating does ---------- */
  const tip = async (tier, power, label) => page.evaluate(([tier, power, label]) => {
    const L = __life; __wg.fridge(tier);
    S.events = S.events || {active:[]}; S.events.active = power ? [{id:"power", from:S.life.day, to:S.life.day}] : [];
    const D = __wg.doors().find(d => d.label === "Fridge"), doorHint = D.hint; __wg.open(D);
    const chips = []; const chip0 = FEED.chip; FEED.chip = (t, k) => { chips.push(t); };
    const rows = [];
    try {
      for (const id of Object.keys(FOOD)){
        S.inv[id] = 3; S.energy = 40; S.fatigue = 50; S.hyd = 50; S.today.drinks = label === "drink2" && id === "drink" ? 1 : 0; S.boost = null;
        L.ctx.eat; window.lifeFridgeChanged();
        const sp = __wg.items().find(s => s.item === id); if (!sp){ rows.push({id, missing:true}); continue; }
        const lines = sp.lines.slice(), hint = doorHint;
        chips.length = 0; sp.run();
        rows.push({id, lines, chip:chips[0] || "", doorHint:hint});
      }
    } finally { FEED.chip = chip0; }
    S.events.active = [];
    return rows;
  }, [tier, power, label]);
  const num = (s, k) => { const m = new RegExp(`${k} ([+${MINUS}]?)(\\d+(?:\\.\\d)?)`).exec(s || ""); return m ? (m[1] === MINUS ? -1 : 1)*+m[2] : null; };
  for (const [tier, power, label] of [[1, false, "tier 1"], [6, false, "tier 6"], [1, true, "power cut"], [3, false, "drink2"]]){
    const rows = await tip(tier, power, label);
    for (const r of rows){
      if (r.missing){ check(`${label}: ${r.id} is on a shelf`, false); continue; }
      const you = r.lines.find(l => l.startsWith("You get: ")) || "";
      for (const k of ["Energy", "Hydration", "Fatigue"]){
        const a = num(you, k), b = num(r.chip, k);
        if (a === null && b === null) continue;
        check(`${label}: ${r.id} ${k}: tooltip ${a}, chip ${b}`, a !== null && b !== null && Math.abs(a - b) <= .5, {you, chip:r.chip});
      }
      if (power) check(`${label}: ${r.id} shows "Power outage ${MINUS}30%"`, r.lines.includes(`Power outage ${MINUS}30%`), r.lines);
      if (tier === 1) check(`${label}: ${r.id} shows "Fridge quality ${MINUS}50%"`, r.lines.includes(`Fridge quality ${MINUS}50%`), r.lines);
      if (label === "drink2" && r.id === "drink") check("second energy drink: the tooltip says so", r.lines.some(l => l.startsWith("Energy drinks today (1)")), r.lines);
    }
    if (power) check("power cut: the door's hint names the outage", rows[0] && /Power outage −30%/.test(rows[0].doorHint), rows[0] && rows[0].doorHint);
    if (tier === 1 && !power) check("tier 1: the door's hint names the fridge quality", rows[0] && /Fridge quality −50%/.test(rows[0].doorHint), rows[0] && rows[0].doorHint);
  }
  check("no console or page errors", page.errors.length === 0, page.errors.slice(0, 5));
} catch(e){
  check("the run completed", false, String(e && e.stack || e));
} finally {
  const failed = checks.filter(c => !c.ok);
  report("wpG-fridge", {pass: !failed.length, checks});
  console.log(`wpG-fridge: ${checks.length - failed.length} of ${checks.length} checks pass`);
  await close();
  process.exit(failed.length ? 1 : 0);
}
