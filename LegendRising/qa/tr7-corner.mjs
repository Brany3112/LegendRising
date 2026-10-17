// qa/tr7-corner.mjs: corners in Training Mode. Node part: the setup and the go on the simulation the runner plays it on
// (seeded); browser part (qa/tr7-browser.mjs, shared with the throw-in and penalty scripts): the instant replay and the
// preset round trip in the real page.
// Owner: P7-B (Training Mode Phase 7). Contract: BUILD-PLAN P7-B acceptance "qa/tr7-corner.mjs"; TRAINING-SPEC 5 (Corners).
//
// What the checks measure (BUILD-PLAN gives the checks, not the measures):
//   - "the ball within 1 m of the corner arc": the ball's centre within 1 m of the corner (the arc's centre, radius 1 m);
//   - "deliveries go toward the designated receiver": the computer's cross is aimed at the receiver's zone, and before
//     anyone touches it the ball passes within DELIVER_D m of him (across the ground), in at least DELIVER_P of the goes;
//   - "marking follows the config": as the runs begin (everyone set), a man-marker stands within MARK_D m of the spot
//     0.9 m goal side of his man and nearer the goal than him, and a zonal defender within ZONE_D m of his zone (his
//     set-piece spot);
//   - "headers, volleys, clearances and second balls all occur across seeds": each one at least once over every role
//     and seed (setpiece.js tags a go from the simulation's own kick and touch events).
//
//   node qa/tr7-corner.mjs [--seeds 12] [--node]     exits 1 on any failed check; writes qa/out/tr7-corner.json
import {checker} from "./wpF-lib.mjs";
import {cfgOf, playSet, setupOf, agentOf, H} from "./tr7-lib.mjs";
import {ZONES} from "../js/life/train/setpiece.js";
import {typeOf} from "../js/life/train/config.js";
import {RULES} from "../js/life/football/rules.js";
import {loftSpeedFor} from "../js/life/football/actions.js";

const {check, done} = checker("tr7-corner");
const argv = process.argv.slice(2), si = argv.indexOf("--seeds");
const SEEDS = si >= 0 ? +argv[si + 1] : 12;
const DELIVER_D = 2.5, DELIVER_P = 0.7, MARK_D = 1.6, ZONE_D = 1.2;
const ROLES = ["taker", "attacker", "receiver", "support", "defender"];
const r2 = v => Math.round(v*100)/100;
const TAGS = new Set();

check(JSON.stringify(typeOf("corner").roles) === JSON.stringify(ROLES), "the corner type offers every role of TRAINING-SPEC 5 (taker, in the box, receiver, support, defender)", typeOf("corner").roles);

// my own corner: the player's cross, as the controls make it (aimed at the near post zone), once it is ready
const crossBot = (ms, me, J, setup) => {
  const R0 = ms.restart;
  if (!R0 || R0.taken || R0.taker !== me.id || !R0.ready || me.act || me.intent.action) return;
  const gx = ms.dirs[R0.team]*ms.spec.hx, s = R0.side, tx = gx - ms.dirs[R0.team]*6, tz = s*2;
  const d = Math.hypot(tx - ms.ball.p.x, tz - ms.ball.p.z);
  me.intent.action = {kind:"cross", target:{x:tx, y:1.7, z:tz}, recv:-1, contact:1, speed:loftSpeedFor(d)*1.06, curl:0.5};
};

/* ---------- 1. both corners at each end: the ball at the corner, the restart a corner for the side taking it ---------- */
{
  const bad = [];
  for (const pitch of ["half", "full"]) for (const end of pitch === "full" ? ["main", "other"] : ["main"]) for (const side of ["left", "right"]){
    const {setup, spec} = setupOf("corner", cfgOf("corner", {role:"taker", pitch, opts:{side, end}}), 1);
    const P = setup.plan, cx = P.end*spec.hx, cz = Math.sign(setup.ball.z)*spec.hz;
    const d = Math.hypot(setup.ball.x - cx, setup.ball.z - cz);
    // as the attackers look at the goal, their left is -z at +x and +z at -x
    const leftZ = -P.end;
    const sideOk = side === "left" ? Math.sign(setup.ball.z) === leftZ : Math.sign(setup.ball.z) === -leftZ;
    let r0 = null;
    const r = playSet("corner", cfgOf("corner", {role:"taker", pitch, opts:{side, end}}), 1, {max:0.2, onStep:ms => { if (!r0 && ms.restart) r0 = {kind:ms.restart.kind, team:ms.restart.team, stage:ms.restart.stage}; }});
    const att = P.attTeam, dirOk = r.ms.dirs[att] === P.end;
    if (!(d <= 1 && sideOk && dirOk && r0 && r0.kind === "corner" && r0.team === att)) bad.push({pitch, end, side, d:r2(d), sideOk, dirOk, r0});
  }
  check(!bad.length, "both corners at each goal (half pitch, and both ends of the full pitch): the ball within 1 m of the corner, at the attackers' left or right as asked, a corner for the side attacking that goal", bad);
}

/* ---------- 2. every role, every seed: the corner is taken and the go decided ---------- */
const deliver = {n:0, near:0, nearest:0, aimed:0, byZone:{}}, marks = {man:[], zonal:[]}, rolesBad = [], nan = [];
for (const role of ROLES){
  for (let seed = 1; seed <= SEEDS; seed++){
    const zone = ["near", "far", "six", "spot", "edge"][seed % 5], marking = seed % 2 ? "man" : "zonal";
    const cfg = cfgOf("corner", {role, opts:{side:seed % 2 ? "left" : "right", zone, marking, delivery:"cross"}});
    let pathD = Infinity, others = Infinity, aimed = null, snap = null;
    const r = playSet("corner", cfg, seed, {meAI:role !== "taker", bot:crossBot, max:40, onStep:(ms, J, setup) => {
      const b = ms.ball.p;
      if (!Number.isFinite(b.x + b.y + b.z)) nan.push({role, seed, t:r2(ms.t)});
      const tk = ms.agents[J.tkId];
      // the moment the runs begin (everyone set): the marking as it stands
      if (!snap && J.runsGo && !J.taken){
        snap = {marks:J.marks.map(m => { const d = ms.agents[m.d], o = ms.agents[m.o], gx = ms.dirs[J.R0.team]*ms.spec.hx, ux = gx - o.m.x, uz = -o.m.z, ul = Math.hypot(ux, uz) || 1;
            return {d:r2(Math.hypot(d.m.x - (o.m.x + ux/ul*0.9), d.m.z - (o.m.z + uz/ul*0.9))), goalSide:Math.hypot(gx - d.m.x, d.m.z) < Math.hypot(gx - o.m.x, o.m.z) + 0.05, me:d.isMe}; }),
          zonal:J.spots.filter(sp => { const a = ms.agents[sp.id]; return a && a.team !== J.R0.team && !a.isGK && !J.marks.some(m => m.d === sp.id); })
            .map(sp => { const a = ms.agents[sp.id]; return {d:r2(Math.hypot(a.m.x - sp.x, a.m.z - sp.z)), me:a.isMe}; })};
      }
      if (!aimed && tk && !tk.isMe && tk.act && tk.act.kind === "kick" && tk.act.action.kind === "cross" && !J.taken){
        const rc = ms.agents[J.recvId], rr = J.runs.find(q => q.id === J.recvId);
        aimed = {t:tk.act.action.target, want:rr ? {x:rr.x, z:rr.z} : rc ? {x:rc.m.x, z:rc.m.z} : null};
      }
      if (J.taken && J.first == null && J.recvId >= 0){
        const rc = ms.agents[J.recvId];
        pathD = Math.min(pathD, Math.hypot(rc.m.x - b.x, rc.m.z - b.z));
        for (const a of ms.agents) if (a.team === J.R0.team && a.id !== J.recvId && a.id !== J.tkId && a.role === "player" && !a.isGK) others = Math.min(others, Math.hypot(a.m.x - b.x, a.m.z - b.z));
      }
    }});
    if (!r.v || !r.J.taken) rolesBad.push({role, seed, v:r.v && r.v.why, taken:r.J.taken});
    for (const t of r.J.tags) TAGS.add(t);
    // deliveries: the computer's cross (not mine, not a short one) at a designated receiver who is not me
    if (role !== "taker" && aimed && r.J.recvId >= 0){
      deliver.n++;
      // (at his run's zone point; with no run, where he stands, his movement led a little)
      if (aimed.want && Math.hypot(aimed.t.x - aimed.want.x, aimed.t.z - aimed.want.z) < 1.5) deliver.aimed++;
      if (pathD <= DELIVER_D) deliver.near++;
      if (pathD < others) deliver.nearest++;
      const bz = deliver.byZone[zone] = deliver.byZone[zone] || {n:0, near:0, nearest:0};
      bz.n++; if (pathD <= DELIVER_D) bz.near++; if (pathD < others) bz.nearest++;
    }
    if (snap){
      for (const m of snap.marks) if (!m.me) marks.man.push(m);
      for (const z of snap.zonal) if (!z.me) marks.zonal.push(z);
    }
  }
}
check(!rolesBad.length, `every role (${ROLES.join(", ")}) x ${SEEDS} seeds: the corner is taken and the go is decided`, rolesBad.slice(0, 6));
check(!nan.length, "no NaN in the ball's state", nan.slice(0, 3));
check(deliver.n >= ROLES.length && deliver.aimed === deliver.n, "the computer's cross is aimed at the designated receiver's zone", deliver);
check(deliver.near >= DELIVER_P*deliver.n, `the cross reaches the designated receiver: within ${DELIVER_D} m of him before anyone touches it (at least ${DELIVER_P*100}% of goes)`, deliver);
{
  const manBad = marks.man.filter(m => m.d > MARK_D || !m.goalSide), zBad = marks.zonal.filter(z => z.d > ZONE_D);
  check(marks.man.length > 10 && manBad.length <= 0.1*marks.man.length, `man to man: each marker within ${MARK_D} m of the spot goal side of his man as the kick starts (90%)`, {n:marks.man.length, bad:manBad.slice(0, 4)});
  check(marks.zonal.length > 10 && zBad.length <= 0.1*marks.zonal.length, `zonal: each defender within ${ZONE_D} m of his zone as the kick starts (90%)`, {n:marks.zonal.length, bad:zBad.slice(0, 4)});
}
check(["header", "volley", "clearance", "second"].every(t => TAGS.has(t)), "headers, volleys, clearances and second balls all occur across roles and seeds", [...TAGS]);

/* ---------- 3. the instant replay is asked for when it is on, and not when it is off ---------- */
{
  const on = playSet("corner", cfgOf("corner", {role:"attacker", opts:{replay:true}}), 3);
  const off = playSet("corner", cfgOf("corner", {role:"attacker", opts:{replay:false}}), 3);
  check(on.v && on.v.replay === true && on.v.goalT >= on.J.takenT && off.v && off.v.replay === false, "the verdict asks for the instant replay of the corner (its end inside the go) only with the option on",
    {on:on.v && {replay:on.v.replay, goalT:r2(on.v.goalT), taken:r2(on.J.takenT)}, off:off.v && off.v.replay});
}

/* ---------- 4. the same setup and seed play the same corner (what a retry restores) ---------- */
{
  const a = playSet("corner", cfgOf("corner", {role:"receiver"}), 5), b = playSet("corner", cfgOf("corner", {role:"receiver"}), 5);
  const sig = r => JSON.stringify(r.ms.events.map(e => [e.kind, e.agent, r2(e.t)]));
  check(sig(a) === sig(b) && a.v.why === b.v.why, "the same setup and seed play the same corner, event for event", {n:a.ms.events.length, why:[a.v.why, b.v.why]});
}
void agentOf; void H; void ZONES; void RULES;

let ok = done();
if (!argv.includes("--node")){
  const {browserPart} = await import("./tr7-browser.mjs");
  ok = (await browserPart("corner")) && ok;
}
process.exit(ok ? 0 : 1);
