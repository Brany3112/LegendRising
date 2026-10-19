// qa/tr2-gait.mjs: the walk, the jog and the sprint of a real body on the real mover (BUILD-PLAN P2-B acceptance,
// MV-1 to MV-5, MV-13 heel row, MV-16 lateral; TRAINING-SPEC 2: "walk (rework the janky walk), jog, sprint ... no
// foot sliding, no snapping"). Owner: P2-B (TR stage 2).
//
// A body (human.js) driven by mover.js like core/me.js and football/view.js drive theirs, at 60 Hz and 30 Hz, body
// scales 0.92, 1.0 and 1.08: walk at 1.0 and 1.7 m/s (LIFE), jog at 3.8 and sprint at 7.8 m/s (FOOTBALL), and the ball
// carrier's gait (FC27, gaitcore CARRY, its own table for the cadence) at 4.5 and 5.9 m/s. Over the
// steady part of each run, at 60 Hz:
//   knee change at lift-off <= 0.12 rad a frame (0.2 at 30 Hz); the ball of the foot rises <= 12 mm on the lift-off
//   frame; the hips' vertical speed changes <= 4 mm a frame; the hips sit within 1 mm of their top in under 40% of
//   frames; walking, never both feet in the air; left and right touchdown intervals within 3%; cadence within 5% of the
//   table at the body's scale; planted drift <= 2 mm; heel clearance >= 15 mm until u 0.95.
// At 30 Hz: the knee change at lift-off <= 0.2 rad a frame, and the rows that do not depend on the frame (both feet in
// the air walking, left and right, cadence, drift, heel clearance) as at 60 Hz; the foot's rise and the hips' speed
// change are reported.
// In the game, first person, walking: the camera's bob moves <= 2 mm a frame, with no one-frame rebound over 2 mm.
// Lateral (MV-16), first person (the facing held), sideways at 1.0, 2.0 and 3.0 m/s: the hips turn <= 0.8 rad from
// the body (1.6 at 3.0, U26: the hips go round into a run across the facing); at 1.0 and 2.0 each swing foot travels within 35 degrees of the body's sideways axis; planted drift <= 2 mm;
// the feet stay >= 0.08 m apart; at 1.0 and 2.0 the ankles open to <= 0.8 m (a shuffle, not a straddle); a contact
// sheet at each speed.
//
//   QA_PORT=8841 node qa/tr2-gait.mjs [--quick] [--sheets]   exits 1 on any failed check; writes qa/out/tr2-gait.json
//   (--quick: scale 1.0 only; --sheets: walk, jog and sprint contact sheets from the side and from the eye too)
import {launch, career, freeze, report} from "./lib.mjs";
import {drive, metrics} from "./tr2-gaitlib.mjs";

const QUICK = process.argv.includes("--quick"), SHEETS = process.argv.includes("--sheets");
const res = {name: "tr2-gait", checks: [], ok: true, runs: {}};
const note = (name, value) => { res.checks.push({name, info: true, value}); console.log(`info ${name}: ${JSON.stringify(value)}`); };
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const CASES = [
  {name: "walk1.0", prof: "life", gait: "walk", cap: 1.0, v: 1.0},
  {name: "walk1.7", prof: "life", gait: "walk", cap: 1.7, v: 1.7},
  {name: "jog3.8", prof: "football", gait: "jog", cap: 3.8, v: 3.8},
  {name: "sprint7.8", prof: "football", gait: "sprint", cap: 7.8, v: 7.8},
  // (FC27) the ball carrier's gait (gaitcore CARRY: the FC 27 clip's short, quick, low steps), on the same rows
  {name: "carry4.5", prof: "football", gait: "run", cap: 4.5, v: 4.5, carry: 1},
  {name: "carry5.9", prof: "football", gait: "run", cap: 5.9, v: 5.9, carry: 1}
];
const WARM = 1.4, MEAS = 2.4;

const {page, close} = await launch({gfx: "low", seed: 1, w: 640, h: 480});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  for (const hz of [60, 30]) for (const scale of QUICK ? [1] : [.92, 1, 1.08]) for (const C of CASES){
    const sheet = SHEETS && hz === 60 && scale === 1 ? {every: C.v > 3 ? 3 : 5, max: 40} : null;
    const cs = C.carry ? {mode: "move", modeSt: {carry: C.carry}} : {};
    const r = await drive(page, Object.assign({hz, scale, prof: C.prof, v0: C.v, segs: [{T: WARM + MEAS, dir: 0, gait: C.gait, cap: C.cap}], sheet, sheetName: sheet ? `tr2-gait-${C.name}` : null}, cs));
    const m = metrics(r.rows, {t0: WARM, t1: WARM + MEAS, scale: r.scale, hz, ck: C.carry || 0});
    const key = `${C.name}@${hz}Hz x${scale}`;
    res.runs[key] = m;
    if (r.sheetFile) console.log("     sheet", r.sheetFile);
    if (SHEETS && hz === 60 && scale === 1){
      const f = await drive(page, {hz, scale, prof: C.prof, v0: C.v, segs: [{T: 2.2, dir: 0, gait: C.gait, cap: C.cap}], sheet: {every: C.v > 3 ? 3 : 5, max: 40, fp: true, pitch: .9}, sheetName: `tr2-gait-${C.name}-fp`});
      console.log("     sheet", f.sheetFile);
    }
    const k30 = hz === 30;
    check(m.kneeLift <= (k30 ? .2 : .12), `${key}: knee change at lift-off <= ${k30 ? .2 : .12} rad a frame`, {kneeLift: m.kneeLift, lifts: m.lifts, kneeAll: m.kneeAll});
    // (the foot's rise and the hips' speed change are per-frame rows of a motion: at 30 Hz they are reported, not held
    // to a limit; the plan sets its 30 Hz limit on the knee alone. A sprinting stance is two frames long at 30 Hz, and
    // the toe-off's own speed carries the foot 4 to 5 cm in the frame it leaves the ground)
    if (k30) note(`${key}: ball of the foot's rise on the lift-off frame (mm) and the hips' vertical speed change (mm a frame)`, {ballRiseMm: m.ballRiseMm, hipAccMm: m.hipAccMm});
    else {
      check(m.ballRiseMm <= 12, `${key}: ball of the foot rises <= 12 mm on the lift-off frame`, m.ballRiseMm);
      check(m.hipAccMm <= 4, `${key}: hips' vertical speed changes <= 4 mm a frame`, m.hipAccMm);
    }
    check(m.pinned < .4, `${key}: hips pinned at their top in under 40% of frames`, m.pinned);
    if (m.mode === "W") check(m.flight === 0, `${key}: walking, never both feet in the air`, m.flight);
    check(m.lr <= .03, `${key}: left and right touchdown intervals within 3%`, {lr: m.lr, LR: m.LR, RL: m.RL});
    check(Math.abs(m.cadErr) <= .05, `${key}: cadence within 5% of the table at the body's scale`, {cad: m.cadence, table: m.cadTable, err: m.cadErr});
    check(m.driftMm <= 2, `${key}: planted drift <= 2 mm`, {driftMm: m.driftMm, stances: m.stances, slipsMm: r.slips});
    check(m.heelMm >= 15, `${key}: heel clearance >= 15 mm until u 0.95`, m.heelMm);
  }
  // lateral, first person: the facing held where the body started, the wish to its side
  for (const v of [1.0, 2.0, 3.0]){
    // (the sheet from in front of the body and above it, where the side steps show: from the eye, looking down, the
    // chest hides the feet)
    const r = await drive(page, {hz: 60, scale: 1, prof: "football", segs: [{T: 3.4, dir: 90, gait: "jog", cap: v, face: "start"}], sheet: {every: 4, max: 40, ang: Math.PI/2, dist: 3, camY: 1.5}, sheetName: `tr2-gait-side${v}`});
    const t0 = 1.4, R = r.rows.filter(x => x.t >= t0);
    const m = metrics(r.rows, {t0, t1: 3.4, scale: r.scale});
    let twist = 0, minGap = Infinity, span = 0;
    const travel = [];
    const lift = [null, null];
    for (let i = 0; i < R.length; i++){
      const row = R[i];
      twist = Math.max(twist, Math.abs(row.twist));
      const A = row.legs[0], B = row.legs[1];
      span = Math.max(span, Math.hypot(A.ank[0] - B.ank[0], A.ank[2] - B.ank[2]));
      for (const p of [A.heel, A.ball, A.ank, A.tip]) for (const q of [B.heel, B.ball, B.ank, B.tip]) minGap = Math.min(minGap, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      for (let s = 0; s < 2; s++){
        const l = row.legs[s], prev = i ? R[i - 1].legs[s] : null;
        if (prev && prev.d && !l.d) lift[s] = prev.fp;
        if (prev && !prev.d && l.d && lift[s]){
          const dx = l.fp[0] - lift[s][0], dz = l.fp[1] - lift[s][1], d = Math.hypot(dx, dz);
          // the body's sideways axis: its left, (cos yaw, -sin yaw) in the group's yaw
          const lx = Math.cos(row.yaw), lz = -Math.sin(row.yaw);
          if (d > .05) travel.push(+(Math.acos(Math.min(1, Math.abs(dx*lx + dz*lz)/d))*180/Math.PI).toFixed(1));
          lift[s] = null;
        }
      }
    }
    const worst = Math.max(0, ...travel);
    res.runs[`side${v}`] = {...m, twist: +twist.toFixed(3), minGap: +minGap.toFixed(3), span: +span.toFixed(3), travelDeg: travel, sheet: r.sheetFile};
    console.log("     sheet", r.sheetFile);
    // (USER-ISSUES U26: above the side steps' speed the hips go round into the way, up to 1.45 rad and their swing,
    // and the legs run along it instead of crossing; the side steps themselves keep 0.8)
    const twMax = v <= 2 ? .8 : 1.6;
    check(twist <= twMax, `side ${v} m/s: hips turn <= ${twMax} rad from the body`, +twist.toFixed(3));
    if (v <= 2) check(travel.length >= 3 && worst <= 35, `side ${v} m/s: each swing foot travels within 35 degrees of the sideways axis`, {worst, steps: travel.length});
    check(m.driftMm <= 2, `side ${v} m/s: planted drift <= 2 mm`, {driftMm: m.driftMm, slipsMm: r.slips});
    check(minGap >= .08, `side ${v} m/s: the feet stay at least 0.08 m apart`, +minGap.toFixed(3));
    // (a compact defender's shuffle, not a straddle: the ankles never more than 0.8 m apart at the body's scale 1)
    if (v <= 2) check(span <= .8, `side ${v} m/s: the stance opens to at most 0.8 m`, +span.toFixed(3));
  }
  // the camera's bob in the game, first person, walking (LIFE off the pitch and FOOTBALL on it)
  const bob = await page.evaluate(async () => {
    const L = window.__life, P = L.P, keys = L.keys, cam = L.cam, out = [];
    for (const at of [{x: 0, z: -14, yaw: Math.PI/2, name: "pitch"}, {x: -33, z: 20, yaw: Math.PI/2, name: "off"}]){
      for (const k in keys) keys[k] = false;
      L.place({x: at.x, z: at.z, y: 0, yaw: at.yaw}); P.pitch = -.2; L.stepN(40);
      keys.w = true;
      const ys = [];
      for (let i = 0; i < 200; i++){ L.stepN(1); if (i >= 40) ys.push(cam.position.y); }
      keys.w = false; L.stepN(60);
      let step = 0, reb = 0;
      for (let i = 1; i < ys.length; i++){
        const d = ys[i] - ys[i - 1]; step = Math.max(step, Math.abs(d));
        if (i > 1){ const p = ys[i - 1] - ys[i - 2]; if (p*d < 0) reb = Math.max(reb, Math.min(Math.abs(p), Math.abs(d))); }
      }
      out.push({name: at.name, v: +P.speed.toFixed(2), stepMm: +(step*1000).toFixed(2), reboundMm: +(reb*1000).toFixed(2), rangeMm: +((Math.max(...ys) - Math.min(...ys))*1000).toFixed(2)});
    }
    return out;
  });
  res.bob = bob;
  for (const b of bob){
    check(b.stepMm <= 2, `first person walking (${b.name}): the bob moves <= 2 mm a frame`, b);
    check(b.reboundMm <= 2, `first person walking (${b.name}): no one-frame rebound over 2 mm`, b.reboundMm);
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-gait", res);
await close();
process.exit(res.ok ? 0 : 1);
