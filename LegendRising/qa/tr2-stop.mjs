// qa/tr2-stop.mjs: stopping, for match bodies that pass the gait what they are asked for (BUILD-PLAN P2-B acceptance,
// MV-8: view.js gives the gait st.intent, the agent mover's target speed, 0 when nothing is asked). Owner: P2-B (TR
// stage 2). TRAINING-SPEC 2: "stop/restart".
//
// A body on the real mover (FOOTBALL profile) runs at 1.7, 3.8, 6.0 and 7.8 m/s (and 7.8 at body scales 0.92 and 1.08),
// then the wish is let go (intent 0, the mover brakes). Measured:
//   - the gait is in STOP within 0.2 s of the release;
//   - it stands (STAND) no more than 0.35 s after the root has stopped;
//   - from a release above 4 m/s the hard stop's plant fires (the braced plant step, gait.js brakeT).
//
//   QA_PORT=8841 node qa/tr2-stop.mjs     exits 1 on any failed check; writes qa/out/tr2-stop.json
import {launch, career, freeze, report} from "./lib.mjs";
import {drive} from "./tr2-gaitlib.mjs";

const res = {name: "tr2-stop", checks: [], ok: true, runs: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const CASES = [[1.7, "walk", 1], [3.8, "jog", 1], [6.0, "sprint", 1], [7.8, "sprint", 1], [7.8, "sprint", .92], [7.8, "sprint", 1.08]];
const RUN = 2.2, AFTER = 2.0;

const {page, close} = await launch({gfx: "low", seed: 1, w: 320, h: 240});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  for (const [v, gait, scale] of CASES){
    const r = await drive(page, {hz: 60, scale, prof: "football", v0: v, segs: [{T: RUN, dir: 0, gait, cap: v}, {T: AFTER}]});
    const R = r.rows, rel = R.findIndex(x => x.seg >= 1), tr = R[rel].t;
    const iStop = R.findIndex((x, i) => i >= rel && x.st === "STOP");
    const iRoot = R.findIndex((x, i) => i >= rel && x.v < .02);
    const iStand = R.findIndex((x, i) => i >= Math.max(rel, iRoot) && x.st === "STAND");
    const plant = R.some((x, i) => i >= rel && x.brake);
    const key = `${v} m/s x${scale}`;
    const m = {release: tr, stopAfter: iStop >= 0 ? +(R[iStop].t - tr).toFixed(3) : null, rootStoppedAfter: iRoot >= 0 ? +(R[iRoot].t - tr).toFixed(3) : null,
      standAfterRoot: iStand >= 0 && iRoot >= 0 ? +(R[iStand].t - R[iRoot].t).toFixed(3) : null, plant, slipsMm: r.slips};
    res.runs[key] = m;
    check(m.stopAfter != null && m.stopAfter <= .2, `${key}: STOP within 0.2 s of the release`, m.stopAfter);
    check(m.standAfterRoot != null && m.standAfterRoot <= .35, `${key}: STAND no more than 0.35 s after the root stops`, {standAfterRoot: m.standAfterRoot, rootStoppedAfter: m.rootStoppedAfter});
    if (v > 4) check(plant, `${key}: the hard stop's plant fires from a release above 4 m/s`, plant);
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-stop", res);
await close();
process.exit(res.ok ? 0 : 1);
