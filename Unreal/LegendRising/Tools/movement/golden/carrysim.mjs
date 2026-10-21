// Close control's touch cadence (the FC 27 carry) in bcs/integ's own simulation, with qa/fc27-carry.mjs's set-up:
//   node carrysim.mjs <wt-integ>
// Prints carry touches a second and the interval at 3 m/s, 6 m/s and a sprint, for LRMovementTests.cpp.
// Touch cadence of close control's carry (bcs/integ sim) at a steady 3 and 6 m/s, straight on, right foot.
const WI = process.argv[2] + "/LegendRising";
const {simStep} = await import(WI + "/js/life/football/sim.js");
const {setupOf, matchOf, H} = await import(WI + "/qa/tr6-teamlib.mjs");
const {drill} = await import(WI + "/js/life/train/scen-team.js");
const fwdOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});
function go(){
  const {setup, spec} = setupOf(drill("att-carrier"), 3, cfg => { cfg.pitch = "full"; });
  const {ms} = matchOf(setup, spec, "train"); ms.meAI = false;
  const me = ms.agents[ms.me]; me.foot = "R";
  for (const a of ms.agents) if (a !== me && !a.isGK){ a.onPitch = false; a.m.x = 200; a.m.z = 200; }
  me.m.x = -40; me.m.z = 0; me.m.yaw = me.m.heading = -Math.PI/2; me.m.vx = me.m.vz = me.m.speed = 0;
  const f = fwdOf(me.m.yaw);
  ms.ball.p.x = me.m.x + f.x*.35; ms.ball.p.z = me.m.z + f.z*.35; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  ms.poss.ctl = -1; return {ms, me};
}
const out = {};
for (const [vT, gait] of [[3, "run"], [6, "run"], [0, "sprint"]]){
  const {ms, me} = go(); me.takeT = ms.t;
  const touches = [], falls = []; let ev0 = ms.events.length; const vs = [];
  for (let k = 0; k < Math.round(8/H); k++){
    if (k === 0 && vT) me.prm.run = vT;
    const I = me.intent; I.dx = 1; I.dz = 0; I.gait = gait; I.speedCap = Infinity; I.strafe = false; I.knock = false;
    if (me.ctlOn && gait === "sprint"){ const kk = Math.min(.97, Math.max(.8, .85 + .1*((me.at.dribbling || 50) - 50)/40)); I.speedCap = kk*me.prm.sprint; }
    I.face = {x: 1, z: 0};
    const gn = me.g.n; simStep(ms, H);
    if (me.g.n !== gn) falls.push({t: ms.t, side: me.g.side});
    for (let i = ev0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.agent === me.id && e.kind === "touch") touches.push({t: ms.t, foot: e.foot, part: e.part, carry: e.carry}); }
    ev0 = ms.events.length; if (ms.t > 2) vs.push(me.m.speed);
  }
  const keep = touches.filter(t => t.t > 2 && t.carry), iv = []; for (let i = 1; i < keep.length; i++) iv.push(keep[i].t - keep[i - 1].t);
  const R = falls.filter(f => f.t > 2 && f.side === "R"), ivR = []; for (let i = 1; i < R.length; i++) ivR.push(R[i].t - R[i - 1].t);
  const mean = a => a.reduce((s, x) => s + x, 0)/a.length;
  out[gait + (vT || "")] = {v: +mean(vs).toFixed(3), carryTouchesPerS: +(keep.length/6).toFixed(3), meanTouchIv: +mean(iv).toFixed(4), strongFallIv: +mean(ivR).toFixed(4),
    feet: [...new Set(keep.map(t => t.foot + ":" + t.part + ":" + t.carry))], ctlOn: !!me.ctlOn, ck: me.g.ck, sprintCap: gait === "sprint" ? +me.intent.speedCap.toFixed(3) : null};
}
console.log(JSON.stringify(out, null, 1));
