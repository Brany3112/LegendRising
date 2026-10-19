// qa/unit/skills99.mjs: U28 part D, skills past 99. A player's own skill grows to 99; boosts take the effective skill
// past it, up to attrs.js SKILL.EFF_MAX, and the match plays it through playOf.
//   - playOf: the same up to 99, then SKILL.SOFT of each point more; never past PLAY_MAX
//   - the player's attributes at every skill 1, 50, 99, 110 and 125: finite, the effective numbers kept (a.eff), every
//     played and derived number no lower than at the level before
//   - what the match makes of them: the top speed and the push (mover.js), the shot's spread (strike.js sigmaOf), each
//     finite and better (or no worse) at each level
//   - a drill played for 30 s by a player with every skill at 125: no NaN anywhere
//   - the warm-up's boost on a skill already at 99 counts SKILL.SOFT a point
//
//   node qa/unit/skills99.mjs          exits 1 on any failed check
import {SKILL, playOf, PLAY_MAX, attrsForPlayer, raised, SKILL_KEYS} from "../../js/life/football/attrs.js";
import {moverParams} from "../../js/life/mover.js";
import {sigmaOf} from "../../js/life/football/strike.js";
import {simStep} from "../../js/life/football/sim.js";
import {setupOf, matchOf, H} from "../tr6-teamlib.mjs";
import {drill} from "../../js/life/train/scen-team.js";

const res = {checks: [], ok: true};
const check = (pass, name, value) => { res.checks.push({name, pass: !!pass, value}); if (!pass) res.ok = false; console.log(`${pass ? "ok  " : "FAIL"} ${name}${value !== undefined ? ": " + JSON.stringify(value) : ""}`); };
const r3 = v => Math.round(v*1000)/1000;
const LV = [1, 50, 99, 110, 125];

check(playOf(50) === 50 && playOf(99) === 99 && Math.abs(playOf(110) - (99 + SKILL.SOFT*11)) < 1e-9 && Math.abs(playOf(125) - PLAY_MAX) < 1e-9 && playOf(200) === PLAY_MAX,
  "playOf: the same up to 99, then SKILL.SOFT a point, never past PLAY_MAX", LV.map(v => r3(playOf(v))));

const skills = v => { const o = {}; for (const k of SKILL_KEYS) o[k] = v; o.acceleration = v; o.sprintSpeed = v; return o; };
const AT = LV.map(v => attrsForPlayer(skills(v), {}, {}));
{
  const keys = SKILL_KEYS.concat(["acceleration", "sprintSpeed", "ctrl", "passAcc", "agility", "vision", "decision", "strength", "balance", "defAware"]);
  let finite = true, mono = true; const worst = [];
  for (let i = 0; i < AT.length; i++) for (const k of keys){
    const v = AT[i][k]; if (!Number.isFinite(v)) finite = false;
    if (i && v < AT[i - 1][k] - 1e-9){ mono = false; worst.push([k, LV[i], v]); }
  }
  check(finite && mono, "the attributes at every skill 1, 50, 99, 110, 125: finite, none lower than at the level before", worst.slice(0, 5));
  check(AT[4].eff.passing === 125 && AT[3].eff.passing === 110 && AT[4].passing <= PLAY_MAX, "the effective numbers are kept on the record (a.eff), the played ones within PLAY_MAX", {eff: AT[4].eff.passing, play: r3(AT[4].passing)});
}
{
  const M = AT.map(a => moverParams(a)), sig = AT.map(a => sigmaOf({kind: "shot", acc: a.accuracy, composure: a.composure, pressure01: .5}));
  const ok = M.every(m => Number.isFinite(m.sprint) && Number.isFinite(m.a0)) && sig.every(Number.isFinite) &&
    M.every((m, i) => !i || (m.sprint >= M[i - 1].sprint - 1e-9 && m.a0 >= M[i - 1].a0 - 1e-9)) && sig.every((s, i) => !i || s <= sig[i - 1] + 1e-12);
  check(ok, "the top speed, the push and the shot's spread: finite and better (or no worse) at each level", {sprint: M.map(m => r3(m.sprint)), a0: M.map(m => r3(m.a0)), sigma: sig.map(r3)});
}
{
  const {setup, spec} = setupOf(drill("att-carrier"), 3);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = true;
  const me = ms.agents[ms.me];
  me.at = attrsForPlayer(skills(125), {control: true}, {});
  let nan = null;
  for (let k = 0; k < 30*60 && ms.phase !== "over"; k++){
    simStep(ms, H);
    const b = ms.ball.p;
    if (!Number.isFinite(b.x + b.y + b.z)) { nan = {what: "ball", t: ms.t}; break; }
    const bad = ms.agents.find(a => !Number.isFinite(a.m.x + a.m.z + a.m.speed));
    if (bad){ nan = {what: "agent " + bad.id, t: ms.t}; break; }
  }
  check(!nan, "a drill played 30 s by a player with every skill at 125: no NaN", nan);
}
{
  const a = attrsForPlayer(skills(99), {}, {}), b = raised(a, 5, {});
  check(Math.abs(b.passing - (99 + SKILL.SOFT*5)) < 1e-9 && b.passing <= PLAY_MAX, "the warm-up's boost on a skill at 99 counts SKILL.SOFT a point", r3(b.passing));
}
console.log(`unit/skills99: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
