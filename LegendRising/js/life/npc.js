/* ============ LIFE: people ============
   Your team-mates out on the training pitch, the coach with his clipboard, the manager in his office, the
   woman behind the till. The bodies, faces, clothes and movement live in human.js (see its header for the
   look schema, lookFor(), human(), animateHuman() and playerRig()); this file puts them to work, and keeps
   the older person()/animate() calls working. */
import {THREE, W, solid} from "./build.js";
import {human, animateHuman, lookFor, playerRig, hashStr, rng, CONTACT, BONE} from "./human.js";
export {human, animateHuman, lookFor, playerRig, CONTACT, BONE};

const col = c => c == null ? null : typeof c === "number" ? c : new THREE.Color().setStyle(String(c)).getHex();

// the old call: a footballer-ish person from a few colours, feet at the origin, facing +z
export function person(o = {}){
  const sd = Math.abs(o.seed | 0);
  const look = o.look || lookFor(o.long ? "coach" : "footballer", sd, {kit:[col(o.shirt) ?? 0x2c66b8, col(o.shorts) ?? 0xf2f2ee, col(o.socks) ?? col(o.shirt) ?? 0x2c66b8]});
  if (o.skin != null) look.skin = col(o.skin);
  if (o.hair != null) look.hairColor = col(o.hair);
  if (o.boots != null) look.outfit.shoes = col(o.boots);
  if (o.scale) look.height = o.scale;
  if (o.long && !o.look){ look.outfit = {type:"tracksuit", shirt:col(o.shirt) ?? 0x1b2633, trousers:col(o.shorts) ?? 0x1b2633, trim:0xf2f2ee}; look.props = []; }
  const h = human(look, o.opts);
  h.legs = [h.bones[BONE.thL], h.bones[BONE.thR]]; h.arms = [h.bones[BONE.uaL], h.bones[BONE.uaR]]; h.body = h.bones[BONE.spine]; h.hips = h.bones[BONE.hips];
  return h;
}
// the old call: "run" (speed is a multiple of a 3.4 m/s jog), "kick" (p.kick 0..1), "stretch", "idle" — or any animateHuman mode
export function animate(p, dt, mode, speed = 1){
  if (mode === "run") return animateHuman(p, dt, {mode:"move", speed:3.4*speed});
  if (mode === "kick") return animateHuman(p, dt, {mode:"kick", t:Math.min(1, p.kick || 0)});
  return animateHuman(p, dt, mode);
}

/* ---------- the training session on the pitch ----------
   Two pairs passing (one pair in bibs): pass, the ball rolls across, a first touch to stop it, a touch to set
   it, and back — the ball leaves the boot at the moment of contact. Three team-mates running laps together
   (striding out down the far side), the keeper stretching by the touchline, and the coach with his clipboard.
   Everyone is laid out clear of the drill stations: lanes and the lap are tested against the ground's solids
   and against o.avoid, the things lying flat on the pitch that aren't solid (cones, loose balls, drill marks). */
// the training ground's loose kit (ground.js drillStations: the cone gates, the odd cone and ball, the spots you
// stand on for a drill); ground.js may pass its own list as o.avoid instead
const PITCH_LITTER = [[-1.5, -6.15, .3], [-1.5, -5.05, .3], [-1.5, -8.15, .3], [-1.5, -7.05, .3], [-1.5, -10.15, .3], [-1.5, -9.05, .3],
  [-17, -9, .3], [-17, -11, .3], [-15, -9, .3], [-15, -11, .3], [18, -8.5, .3], [-6.4, -20.4, .2], [6.8, -18.7, .2], [-9.5, -16.6, .9],
  [-9.5, -15, .7], [0, -15, .7], [15, -13.5, .7], [5.5, -7.6, .7]];
// how close a segment a→b comes to the things in the way (solids standing on the floor, and round markers)
function clearance(ax, az, bx, bz, avoid){
  let m = 1e9;
  const segPt = (px, pz) => { const dx = bx - ax, dz = bz - az, L = dx*dx + dz*dz || 1, t = Math.max(0, Math.min(1, ((px - ax)*dx + (pz - az)*dz)/L)); return Math.hypot(ax + dx*t - px, az + dz*t - pz); };
  for (const q of W.solids){
    if (q.off || q.y0 > 1.6 || q.y1 < .05) continue;
    // distance from the segment to the box: sample along the segment (boxes here are small next to the lanes)
    const n = Math.ceil(Math.hypot(bx - ax, bz - az)/.25) + 1;
    for (let i = 0; i <= n; i++){ const x = ax + (bx - ax)*i/n, z = az + (bz - az)*i/n; m = Math.min(m, Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1))); }
  }
  for (const [x, z, r] of avoid) m = Math.min(m, segPt(x, z) - r);
  return m;
}
// slide a lane sideways (perpendicular to it) until it's clear by `need`; the nearest clear spot wins.
// prefer = the side to try first (-1: against the lane's left normal); it goes no more than `out` that way
function clearLane(a, b, need, avoid, prefer = 1, out = 5){
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz/L, nz = dx/L;
  for (let k = 0; k <= 40; k++){
    const n = Math.ceil(k/2)*.25, first = k % 2 === 1, sh = (first ? 1 : -1)*prefer*n;
    if (first && n > out) continue;
    if (clearance(a.x + nx*sh, a.z + nz*sh, b.x + nx*sh, b.z + nz*sh, avoid) >= need) return sh;
  }
  return 0;
}
// a closed loop with rounded corners, walked by distance: the point and the direction of travel at s
function roundedLoop(x0, x1, z0, z1, R){
  // near side (z1) left→right, down the right side, back along the far side (z0), up the left side
  const P = [], c = [[x1 - R, z1 - R], [x1 - R, z0 + R], [x0 + R, z0 + R], [x0 + R, z1 - R]];
  const ln = [[[x0 + R, z1], [x1 - R, z1]], [[x1, z1 - R], [x1, z0 + R]], [[x1 - R, z0], [x0 + R, z0]], [[x0, z0 + R], [x0, z1 - R]]];
  for (let i = 0; i < 4; i++){
    const [p, q] = ln[i]; P.push({line:true, p, q, len:Math.hypot(q[0] - p[0], q[1] - p[1])});
    P.push({line:false, c:c[i], a0:i*Math.PI/2, len:R*Math.PI/2});
  }
  const total = P.reduce((t, q) => t + q.len, 0);
  return {total, at(s, out){
    s = ((s % total) + total) % total; let i = 0; while (s > P[i].len && i < P.length - 1){ s -= P[i].len; i++; }
    const q = P[i];
    if (q.line){ const f = s/(q.len || 1), ux = (q.q[0] - q.p[0])/(q.len || 1), uz = (q.q[1] - q.p[1])/(q.len || 1); out.x = q.p[0] + (q.q[0] - q.p[0])*f; out.z = q.p[1] + (q.q[1] - q.p[1])*f; out.ux = ux; out.uz = uz; out.side = i >> 1; }
    else { const a = q.a0 + s/R; out.x = q.c[0] + R*Math.sin(a); out.z = q.c[1] + R*Math.cos(a); out.ux = Math.cos(a); out.uz = -Math.sin(a); out.side = -1; }
    return out;
  }};
}
export function teamSession(o){
  // o: {kit:[a,b], when:() => bool, centre:{x,z}, coach:{x,z,ry}, ballMesh:() => Mesh, lap?:[{x,z}...], avoid?:[[x,z,r]...]}
  const root = new THREE.Group(); W.scene.add(root);
  const [a, b] = o.kit || ["#2c66b8", "#ffffff"];
  const base = hashStr(String(a) + String(b)) % 100000, r = rng(base + 11);
  const nums = [2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28];
  for (let i = nums.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  let k = 0;
  const player = extra => human(lookFor("footballer", base + 31*(++k), Object.assign({kit:[a, b, a], number:nums[k]}, extra)));
  const actors = [], c = o.centre;
  const avoid = [...(o.avoid || PITCH_LITTER), [o.coach.x, o.coach.z, .6]];
  // the passing pairs, facing each other across an open strip
  const lanes = o.pairs || [[{x:c.x - 7, z:c.z - 7}, {x:c.x - 1.6, z:c.z - 7}, false], [{x:c.x + 3.5, z:c.z - 4.2}, {x:c.x + 9.5, z:c.z - 4.2}, "#d8ff3a"]];
  for (const [p1, p2, bib] of lanes){
    const sh = clearLane(p1, p2, .9, avoid), L = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1, nx = -(p2.z - p1.z)/L*sh, nz = (p2.x - p1.x)/L*sh;
    const P = [player({bib, training:!!bib}), player({bib, training:!!bib})];
    P[0].g.position.set(p1.x + nx, 0, p1.z + nz); P[1].g.position.set(p2.x + nx, 0, p2.z + nz);
    P[0].g.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z); P[1].g.rotation.y = Math.atan2(p1.x - p2.x, p1.z - p2.z);
    root.add(P[0].g, P[1].g);
    avoid.push(...[P[0], P[1]].map(h => [h.g.position.x, h.g.position.z, .6]), [(p1.x + p2.x)/2 + nx, (p1.z + p2.z)/2 + nz, L/2 - .4]);
    const ball = o.ballMesh(); root.add(ball);
    actors.push({kind:"pair", P, ball, who:0, st:"pass", t:r()*.5, at:null, to:null, roll:0, ax:new THREE.Vector3()});
  }
  // the keeper stretching by the touchline
  const gk = human(lookFor("goalkeeper", base + 7, {kit:[a, b]}));
  gk.g.position.set(c.x - 3.5, 0, c.z + 8.2); gk.g.rotation.y = Math.PI*.85; root.add(gk.g);
  actors.push({kind:"stretch", P:gk});
  avoid.push([gk.g.position.x, gk.g.position.z, .8]);
  // three running laps together, round a loop with rounded corners; each side of it is moved, if it must be,
  // until the group (three abreast is about 1.1 m) passes clear of everything standing on the pitch
  const lp = o.lap || [{x:-18, z:-6}, {x:18, z:-6}, {x:18, z:-25}, {x:-18, z:-25}];
  const X0 = Math.min(...lp.map(p => p.x)), X1 = Math.max(...lp.map(p => p.x)), Z0 = Math.min(...lp.map(p => p.z)), Z1 = Math.max(...lp.map(p => p.z));
  let x0 = X0, x1 = X1, z0 = Z0, z1 = Z1;
  for (let pass = 0; pass < 2; pass++){
    // each side from where it was asked to be, along the other sides as they now stand; outward first
    // (never more than 1.5 m outward, so the lap stays round the pitch, not behind the goals)
    const n1 = Z1 - clearLane({x:x1, z:Z1}, {x:x0, z:Z1}, .85, avoid, -1, 1.5);     // near side
    const e1 = X1 - clearLane({x:X1, z:z0}, {x:X1, z:z1}, .85, avoid, -1, 1.5);     // right side
    const f0 = Z0 + clearLane({x:x0, z:Z0}, {x:x1, z:Z0}, .85, avoid, -1, 1.5);     // far side
    const w0 = X0 + clearLane({x:X0, z:z1}, {x:X0, z:z0}, .85, avoid, -1, 1.5);     // left side
    z1 = n1; x1 = e1; z0 = f0; x0 = w0;
  }
  const loop = roundedLoop(x0, x1, z0, z1, Math.min(2.6, (x1 - x0)/3, (z1 - z0)/3));
  const group = {d:0, v:3.3};
  [[.55, 0], [-.55, -.25], [0, -1.6]].forEach(([side, back], i) => {
    const P = player({}); root.add(P.g);
    actors.push({kind:"lap", P, side, back, yaw:null, px:null, pz:null, v:3.3});
  });
  // and the coach watching it all
  const coach = human(lookFor("coach", base + 3, {kit:[a, b]}), {cast:false});
  coach.g.position.set(o.coach.x, 0, o.coach.z); coach.g.rotation.y = o.coach.ry || 0;
  root.add(coach.g);
  const coachSolid = solid(o.coach.x - .35, o.coach.x + .35, o.coach.z - .35, o.coach.z + .35, 0, 1.9);
  const tmp = new THREE.Vector3(), lpt = {};
  // a spot by a player's right foot, d metres in front of him
  const footSpot = (P, d, out) => { const y = P.g.rotation.y; return out.set(P.g.position.x + Math.sin(y)*d - Math.cos(y)*.12, .11, P.g.position.z + Math.cos(y)*d + Math.sin(y)*.12); };
  const rollBall = (ac, from, to) => {
    const d = tmp.subVectors(to, from), L = d.length(); if (L < 1e-5) return;
    ac.ax.set(d.z, 0, -d.x).normalize(); ac.ball.rotateOnWorldAxis(ac.ax, L/.11);
  };
  const PASS = .75, TRAP = .7, SET = .6, SPEED = 7.5;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  let on = null;
  W.anims.push(dt => {
    const now = !!o.when();
    if (now !== on){ on = now; root.visible = now; coachSolid.off = !now; }
    if (!now) return;
    // the running group: one pace, a little quicker down the far side
    loop.at(group.d, lpt);
    group.v += ((lpt.side === 2 ? 5.9 : 3.3) - group.v)*(1 - Math.exp(-.9*dt));
    group.d += group.v*dt;
    for (const ac of actors){
      if (ac.kind === "pair"){
        const A = ac.P[ac.who], Bp = ac.P[1 - ac.who];
        ac.t += dt;
        const old = pa.copy(ac.ball.position);
        if (ac.st === "pass"){
          const t = ac.t/PASS;
          animateHuman(A, dt, {mode:"pass", t:Math.min(1, t)});
          if (t < CONTACT.pass) footSpot(A, .34, ac.ball.position);
          else {
            if (!ac.at){ ac.at = footSpot(A, .34, new THREE.Vector3()); ac.to = footSpot(Bp, .3, new THREE.Vector3()); ac.fly = ac.at.distanceTo(ac.to)/SPEED; ac.ft = 0; }
            ac.ft += dt; const f = Math.min(1, ac.ft/ac.fly);
            ac.ball.position.lerpVectors(ac.at, ac.to, f);
            // the receiver times his first touch to meet it
            const left = ac.fly - ac.ft;
            if (left < TRAP*CONTACT.trap){ ac.st = "trap"; ac.t = TRAP*CONTACT.trap - left; }
          }
          if (ac.st === "pass") animateHuman(Bp, dt, "idle");
        } else if (ac.st === "trap"){
          const t = ac.t/TRAP;
          animateHuman(Bp, dt, {mode:"trap", t:Math.min(1, t)}); animateHuman(A, dt, "idle");
          if (t < CONTACT.trap){ ac.ft += dt; ac.ball.position.lerpVectors(ac.at, ac.to, Math.min(1, ac.ft/ac.fly)); }
          else ac.ball.position.lerp(footSpot(Bp, .3, pb), 1 - Math.exp(-12*dt));
          if (t >= 1){ ac.st = "set"; ac.t = 0; ac.at = null; }
        } else if (ac.st === "set"){
          const t = ac.t/SET;
          animateHuman(Bp, dt, {mode:"pass", t:Math.min(1, t), amp:.45}); animateHuman(A, dt, "idle");
          // a short touch out of the feet, ready to play it back
          if (t > CONTACT.pass) ac.ball.position.lerp(footSpot(Bp, .34, pb), 1 - Math.exp(-6*dt));
          if (t >= 1.25){ ac.st = "pass"; ac.t = 0; ac.who = 1 - ac.who; }
        }
        rollBall(ac, old, ac.ball.position);
      } else if (ac.kind === "lap"){
        // his place in the group: beside or behind the others, always the same distance off the line of the loop
        loop.at(group.d + ac.back, lpt);
        const x = lpt.x - lpt.uz*ac.side, z = lpt.z + lpt.ux*ac.side;
        // the legs are driven by how fast he really goes (quicker on the outside of a bend)
        if (ac.px != null && dt > 0){ const sp = Math.hypot(x - ac.px, z - ac.pz)/dt; ac.v += (sp - ac.v)*(1 - Math.exp(-10*dt)); }
        ac.px = x; ac.pz = z; ac.P.g.position.set(x, 0, z);
        const yaw = Math.atan2(lpt.ux, lpt.uz);
        if (ac.yaw == null) ac.yaw = yaw;
        let dy = yaw - ac.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
        ac.yaw += dy*(1 - Math.exp(-8*dt)); ac.P.g.rotation.y = ac.yaw;
        animateHuman(ac.P, dt, {mode:"move", speed:ac.v});
      } else animateHuman(ac.P, dt, "stretch");
    }
    animateHuman(coach, dt, "clipboard");
  });
  return {root, coach, actors, loop:{x0, x1, z0, z1}};
}

/* ---------- someone at work: behind a counter, at a desk, in the office ---------- */
const JOB_ROLE = {cafe:"barista", store:"shopkeeper", courier:"courier", gym:"gym", academy:"coach", photo:"office", video:"office"};
const POSE = {manager:{mode:"counter", counter:.8, reach:.4}, shopkeeper:{mode:"counter", counter:1.04, reach:.34}, barista:{mode:"counter", counter:1.04, reach:.4}, gym:{mode:"counter", counter:1.1, reach:.3},
  coach:{mode:"clipboard"}, office:{mode:"idle", arms:"behind"}, courier:{mode:"idle", arms:"hips"}};
function roleOf(o){
  if (o.role) return o.role;
  if (W.zone === "ground") return "manager";
  if (o.seed === 11) return "shopkeeper";
  const id = typeof jobState === "function" ? (jobState() || {}).id : "";
  return JOB_ROLE[id] || "shopkeeper";
}
// o: {role, look, pose (an animateHuman state), seed, shirt (the uniform's colour), hair, y}
export function staffer(x, z, ry, o = {}){
  const role = roleOf(o);
  let look = o.look;
  if (!look){
    const sh = col(o.shirt), out = {};
    if (sh != null){
      if (role === "manager") out.shirt = sh;
      else if (role === "shopkeeper" || role === "barista") out.apron = sh;
      else if (role !== "coach") out.shirt = sh;
    }
    look = lookFor(role, o.seed ?? 5, {outfit:out});
    if (o.hair != null) look.hairColor = col(o.hair);
  }
  const h = human(look, {cast:true});
  h.g.position.set(x, o.y || 0, z); h.g.rotation.y = ry;
  W.scene.add(h.g);
  // shop counters stand in front of the till workers; elsewhere they simply stand about
  let st = o.pose || POSE[role] || {mode:"idle"};
  if (!o.pose && st.mode === "counter" && role === "shopkeeper" && o.seed !== 11 && W.zone !== "ground") st = {mode:"idle", arms:"behind"};
  W.anims.push(dt => animateHuman(h, dt, st));
  solid(x - .3, x + .3, z - .3, z + .3, o.y || 0, (o.y || 0) + 1.9);
  return h;
}
