// qa/tr7-throw.mjs: throw-ins in Training Mode. Node part: the setup and the go on the simulation the runner plays it on
// (seeded); browser part (qa/tr7-browser.mjs): the ball in the thrower's hands up to the release, drawn as the real page
// draws it, and the preset round trip.
// Owner: P7-B (Training Mode Phase 7). Contract: BUILD-PLAN P7-B acceptance "qa/tr7-throw.mjs"; TRAINING-SPEC 5 (Throw-ins).
//
// What the checks measure:
//   - "a believable trajectory": at the release the ball is 1.7 to 2.4 m up (x the thrower's scale), no faster than the
//     thrower's arm allows (actions.js: 8 + 0.07 passing m/s), its apex at most APEX_MAX m (APEX_FEET for a throw to a
//     man's feet), and it comes down within 30 m of the thrower;
//   - no teleport: from the whistle to a second after the release the ball never moves further in a step than its own
//     velocity carries it (plus JUMP_EPS m), so it is carried, held and thrown, never put anywhere;
//   - "the receiver's first touch and the change of possession": the man it is thrown to touches it first, and his side
//     then has it under control, in at least RECV_P of the goes.
//
//   node qa/tr7-throw.mjs [--seeds 12] [--node]      exits 1 on any failed check; writes qa/out/tr7-throw.json
import {checker} from "./wpF-lib.mjs";
import {cfgOf, playSet, H} from "./tr7-lib.mjs";
import {typeOf} from "../js/life/train/config.js";
import {steer} from "../js/life/football/actions.js";

const {check, done} = checker("tr7-throw");
const argv = process.argv.slice(2), si = argv.indexOf("--seeds");
const SEEDS = si >= 0 ? +argv[si + 1] : 12;
const APEX_MAX = 6, APEX_FEET = 3.5, JUMP_EPS = 0.06, RECV_P = 0.7;
const ROLES = ["taker", "receiver", "attacker", "defender", "support"];
const r2 = v => Math.round(v*100)/100;

check(JSON.stringify(typeOf("throw").roles) === JSON.stringify(ROLES), "the throw-in type offers every role of TRAINING-SPEC 5 (I throw, I receive, I run to receive, I mark, I support)", typeOf("throw").roles);

// the player as the controls make him: my own throw (to the nearest team-mate, as the crosshair would put it), my run
// down the line and then to the ball
const bot = (ms, me, J, setup) => {
  const R0 = ms.restart, P = setup.plan, b = ms.ball;
  if (R0 && !R0.taken && R0.taker === me.id){
    if (R0.ready && !me.act && !me.intent.action){
      let best = null, bd = Infinity;
      for (const a of ms.agents) if (a.team === me.team && a !== me && a.role === "player" && !a.isGK){ const d = Math.hypot(a.m.x - b.p.x, a.m.z - b.p.z); if (d < bd){ bd = d; best = a; } }
      if (best) me.intent.action = {kind:"throw", target:{x:best.m.x, y:.11, z:best.m.z}, recv:best.id};
    }
    return;
  }
  if (P.role === "attacker"){
    if (!J.taken && P.runTo) steer(me, P.runTo.x, P.runTo.z, "sprint", 0.3);
    else if (J.taken && ms.poss.ctl !== me.id) steer(me, b.p.x + b.v.x*0.3, b.p.z + b.v.z*0.3, "sprint", 0.1);
  }
};

const S = {bad:[], traj:[], jumps:[], recv:{n:0, first:0, poss:0}, run:{n:0, first:0}};
for (const role of ROLES){
  for (let seed = 1; seed <= SEEDS; seed++){
    const cfg = cfgOf("throw", {role, opts:{side:seed % 2 ? "left" : "right", along:10 + (seed*7) % 40}});
    let prev = null, rel = null, apex = 0, land = null, thrower = null, tk = null;
    const r = playSet("throw", cfg, seed, {meAI:!(role === "taker" || role === "attacker"), bot, max:40, onStep:(ms, J) => {
      const b = ms.ball;
      // the ball's own way from the whistle to a second after the release
      if (J.started && (!rel || ms.t - rel.t < 1)){
        if (prev && b === prev.ball){
          const step = Math.hypot(b.p.x - prev.x, b.p.y - prev.y, b.p.z - prev.z), allow = Math.hypot(b.v.x, b.v.y, b.v.z)*H + Math.hypot(prev.vx, prev.vy, prev.vz)*H + JUMP_EPS;
          if (step > allow) S.jumps.push({role, seed, t:r2(ms.t), step:r2(step), allow:r2(allow)});
        }
        prev = {ball:b, x:b.p.x, y:b.p.y, z:b.p.z, vx:b.v.x, vy:b.v.y, vz:b.v.z};
      }
      if (!thrower && J.R0) thrower = ms.agents[J.R0.taker];
      if (!rel && J.taken && b.state === "free"){ tk = thrower; rel = {t:ms.t, y:b.p.y, v:Math.hypot(b.v.x, b.v.y, b.v.z), x:b.p.x, z:b.p.z}; }
      if (rel && !land && J.first == null){ apex = Math.max(apex, b.p.y); if (b.p.y <= 0.12 + 0.02 && ms.t - rel.t > 0.1) land = {d:Math.hypot(b.p.x - rel.x, b.p.z - rel.z)}; }
    }});
    if (!r.v || !r.J.taken) S.bad.push({role, seed, v:r.v && r.v.why, taken:r.J.taken});
    if (rel && tk){
      const vmax = 8 + 0.07*tk.at.passing + 0.1, s = tk.scale || 1, feet = r.setup.plan.to === "feet";
      const ok = rel.y >= 1.7*s && rel.y <= 2.4*s && rel.v <= vmax && apex <= (feet ? APEX_FEET : APEX_MAX) && (!land || land.d <= 30);
      S.traj.push({role, seed, ok, y:r2(rel.y), v:r2(rel.v), vmax:r2(vmax), apex:r2(apex), land:land ? r2(land.d) : null});
    }
    // the man it is thrown to: his first touch, then his side has it
    if (role === "receiver" || role === "support" || role === "defender"){
      S.recv.n++;
      if (r.J.first && r.J.first.agent === r.J.recvId) S.recv.first++;
      if (r.J.first && r.J.first.agent === r.J.recvId && r.ms.events.some(e => e.kind === "touch" && e.agent === r.J.recvId && e.how === "control")) S.recv.poss++;
    }
    if (role === "attacker"){ S.run.n++; if (r.J.first && r.J.first.agent === r.ms.me) S.run.first++; }
  }
}
check(!S.bad.length, `every role (${ROLES.join(", ")}) x ${SEEDS} seeds: the throw is taken and the go is decided`, S.bad.slice(0, 6));
check(S.traj.length >= ROLES.length*SEEDS*0.9 && S.traj.every(t => t.ok), "a believable trajectory: released overhead (1.7 to 2.4 m), within the arm's speed, a modest apex, down within 30 m",
  {n:S.traj.length, bad:S.traj.filter(t => !t.ok).slice(0, 4), sample:S.traj.slice(0, 2)});
check(!S.jumps.length, `no teleport: the ball never moves further in a step than its velocity carries it (plus ${JUMP_EPS} m), whistle to a second after the release`, S.jumps.slice(0, 4));
check(S.recv.first >= RECV_P*S.recv.n && S.recv.poss >= RECV_P*S.recv.n, `the receiver's first touch, and his side has it under control (at least ${RECV_P*100}% of goes)`, S.recv);
check(S.run.first >= 0.6*S.run.n, "my run down the line: the throw into my path, my first touch (at least 60% of goes)", S.run);
{
  const a = playSet("throw", cfgOf("throw", {role:"receiver"}), 4), b = playSet("throw", cfgOf("throw", {role:"receiver"}), 4);
  const sig = r => JSON.stringify(r.ms.events.map(e => [e.kind, e.agent, r2(e.t)]));
  check(sig(a) === sig(b), "the same setup and seed play the same throw-in, event for event", a.ms.events.length);
}

let ok = done();
if (!argv.includes("--node")){
  const {browserPart} = await import("./tr7-browser.mjs");
  ok = (await browserPart("throw")) && ok;
}
process.exit(ok ? 0 : 1);
