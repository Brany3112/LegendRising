// qa/u28-pitch.mjs: U28 part F, the real pitch sizes, on the simulation.
//   - each pitch type's spec: its length and width, its goal (the posts' mouth and the bar), its own penalty area
//     (inBox) and boards round its own size
//   - every club's home ground is one of the eleven-a-side sizes its league allows (a top league never Compact), the
//     same every time, Standard the most common; a World Cup match is played on Standard
//   - a match on each eleven-a-side size plays out to the whistle with no NaN, the ball and the players inside the
//     run-off, and a side spreads wider on Wide and Large than on Compact
//   - a drill on each small-sided pitch (futsal, 5, 7 and 9 a side): 20 s with no NaN, everyone inside its run-off
//
//   node qa/u28-pitch.mjs          exits 1 on any failed check
import {PITCH_TYPES, ELEVEN_SIZES, groundFor, pitchOfType, inBox, FIFA, boardsFor} from "../js/life/football/pitchspec.js";
import {configFor} from "./harness.mjs";
import * as HS from "../js/life/football/harness.js";
import {simStep} from "../js/life/football/sim.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("u28-pitch");
const r2 = v => Math.round(v*100)/100;

// the specs
{
  const bad = [];
  for (const [id, T] of Object.entries(PITCH_TYPES)){
    const s = pitchOfType(id), D = Object.assign({}, FIFA, T.dims || {});
    const g = s.goals[0], mouth = 2*g.mouthHalf, bar = g.barY - FIFA.postR;
    if (s.L !== T.L || s.Wd !== T.Wd || Math.abs(mouth - D.goalW) > 1e-9 || Math.abs(bar - D.goalH) > 1e-9 || s.type !== id) bad.push({id, L: s.L, Wd: s.Wd, mouth, bar});
    // the penalty area: in just inside its front edge, out just past it
    if (!inBox(s, 1, s.hx - D.boxD + .05, 0) || inBox(s, 1, s.hx - D.boxD - .05, 0)) bad.push({id, box: D.boxD});
  }
  check(!bad.length, "each pitch type: its length and width, its goal's mouth and bar, its own penalty area", bad);
  const B = boardsFor(110, 75), B0 = boardsFor(105, 68);
  check(B0.hx === 57.5 && B0.hz === 38 && B.hx === 60 && B.hz === 41.5, "the boards follow the pitch (57.5 x 38 round 105 x 68, 60 x 41.5 round 110 x 75)", {B0, B});
}
// home grounds
{
  const clubs = []; for (let t = 1; t <= 3; t++) for (let i = 0; i < 300; i++) clubs.push({nm: "Club " + t + "-" + i, t});
  const top = clubs.filter(c => c.t === 1).map(groundFor), low = clubs.filter(c => c.t > 1).map(groundFor);
  const count = (L, k) => L.filter(x => x === k).length;
  check(!top.includes("compact") && top.every(k => ELEVEN_SIZES.includes(k)) && low.every(k => ELEVEN_SIZES.includes(k)) && low.includes("compact"),
    "every home ground is a size its league allows: a top league never Compact, the lower ones all four", {top: ELEVEN_SIZES.map(k => count(top, k)), low: ELEVEN_SIZES.map(k => count(low, k))});
  check(count(top, "standard") > count(top, "wide") && count(top, "standard") > count(top, "large") && count(low, "standard") > count(low, "compact"), "Standard is the most common ground", {top: ELEVEN_SIZES.map(k => count(top, k)), low: ELEVEN_SIZES.map(k => count(low, k))});
  check(groundFor({nm: "Millhaven United", t: 1}) === groundFor({nm: "Millhaven United", t: 1}) && groundFor(null) === "standard", "a club's ground is the same every time; none, Standard");
}
// matches on each eleven-a-side size
{
  const width = {}, bad = [];
  for (const id of ["compact", "standard", "wide", "large"]){
    let wsum = 0, wn = 0;
    for (const seed of [11, 12]){
      const res = HS.runOne(configFor(seed, {pitch: id}), {keep: true}), ms = res.ms;
      if (ms.phase !== "over" || ms.spec.type !== id) bad.push({id, seed, phase: ms.phase, type: ms.spec.type});
      const rx = ms.spec.runoff.hx + .5, rz = ms.spec.runoff.hz + .5;
      const out = ms.agents.filter(a => a.onPitch && (Math.abs(a.m.x) > rx || Math.abs(a.m.z) > rz || !Number.isFinite(a.m.x + a.m.z)));
      if (out.length || !Number.isFinite(ms.ball.p.x + ms.ball.p.z)) bad.push({id, seed, out: out.length});
      // (the spread: how far apart a side's outfield men stand across the pitch, from the measures' positions)
      for (const t of [0, 1]){ const zs = ms.agents.filter(a => a.team === t && a.onPitch && !a.isGK).map(a => a.m.z); if (zs.length > 4){ wsum += Math.max(...zs) - Math.min(...zs); wn++; } }
    }
    width[id] = r2(wsum/Math.max(1, wn));
  }
  check(!bad.length, "a match on each eleven-a-side size plays to the whistle, no NaN, everyone inside the run-off", bad);
  check(width.wide > width.compact && width.large > width.compact, "a side spreads wider on Wide and Large than on Compact (across the pitch at the whistle)", width);
}
// drills on the small-sided pitches
{
  const bad = [];
  for (const id of ["futsal", "five", "seven", "nine"]){
    const {setup, spec} = setupOf(drill("att-carrier"), 3, cfg => { cfg.pitch = id; });
    const {ms} = matchOf(setup, spec, "train");
    ms.meAI = true;
    let worst = 0;
    for (let k = 0; k < 20*60 && ms.phase !== "over"; k++){
      simStep(ms, H);
      if (!Number.isFinite(ms.ball.p.x + ms.ball.p.y + ms.ball.p.z)){ bad.push({id, nan: "ball", t: ms.t}); break; }
      for (const a of ms.agents){ if (!a.onPitch) continue; const ox = Math.abs(a.m.x) - ms.spec.runoff.hx, oz = Math.abs(a.m.z) - ms.spec.runoff.hz; worst = Math.max(worst, ox, oz); }
    }
    if (worst > .5 || ms.spec.L !== PITCH_TYPES[id].L) bad.push({id, worst: r2(worst), L: ms.spec.L});
  }
  check(!bad.length, "a drill on futsal, 5, 7 and 9 a side: 20 s, no NaN, everyone inside the run-off", bad);
}
done();
