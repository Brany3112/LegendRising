// qa/tr2-gkshuffle.mjs: the keeper's side steps (BUILD-PLAN P2-B acceptance, GK-2 and MV-7). Owner: P2-B (TR stage 2).
//
// On the move above about 0.3 m/s view.js poses the keeper on the gait in its "shuffle" style (side steps, feet
// planted) with the ready stance's upper body laid over it (gkmoves.js "upper:gkready"), the static ready stance only
// when he is nearly still. Here a keeper body on the real mover (FOOTBALL profile, facing held) goes sideways at 0.5,
// 1.5 and 2.4 m/s with the state view.js passes; over the steady part:
//   - a foot is planted in at least 40% of frames;
//   - each foot moves <= 10 mm while it is planted (no skating);
// and a contact sheet of each speed from in front.
//
//   QA_PORT=8841 node qa/tr2-gkshuffle.mjs     exits 1 on any failed check; writes qa/out/tr2-gkshuffle.json
import {launch, career, freeze, report} from "./lib.mjs";
import {drive, metrics} from "./tr2-gaitlib.mjs";

const res = {name: "tr2-gkshuffle", checks: [], ok: true, runs: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const {page, close} = await launch({gfx: "low", seed: 1, w: 640, h: 480});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  for (const v of [.5, 1.5, 2.4]){
    const upper = {g: "gkready", w: 1, mode: "gkready", focus: {x: 0, z: -40}, alert: .6};
    const r = await drive(page, {hz: 60, scale: 1, prof: "football", style: "shuffle", mode: "move", modeSt: {upper},
      segs: [{T: 3.4, dir: 90, gait: "jog", cap: v, face: "start"}], sheet: {every: 4, max: 40, ang: Math.PI/2, dist: 3, camY: 1.5}, sheetName: `tr2-gkshuffle-${v}`});
    const t0 = 1.4, R = r.rows.filter(x => x.t >= t0);
    const m = metrics(r.rows, {t0, t1: 3.4, scale: r.scale});
    const planted = R.filter(x => x.legs[0].d || x.legs[1].d).length/R.length;
    const style = R[R.length >> 1].sty;
    res.runs[`${v} m/s`] = {planted: +planted.toFixed(3), driftMm: m.driftMm, stances: m.stances, style, v: m.v, sheet: r.sheetFile, slipsMm: r.slips};
    console.log("     sheet", r.sheetFile);
    check(style === "shuffle", `${v} m/s: the keeper's legs side-step (the gait's shuffle)`, style);
    check(planted >= .4, `${v} m/s: a foot planted in at least 40% of frames`, +planted.toFixed(3));
    check(m.driftMm <= 10 && m.stances >= 3, `${v} m/s: no foot moves more than 10 mm while planted`, {driftMm: m.driftMm, stances: m.stances});
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-gkshuffle", res);
await close();
process.exit(res.ok ? 0 : 1);
