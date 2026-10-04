/* ============ LIFE: people ============
   Your team-mates out on the training pitch, the coach with his clipboard, the manager in his office, the
   woman behind the till, the regulars in the café and the people walking past your block. The bodies, faces,
   clothes and movement live in human.js (see its header for the look schema, lookFor(), human(),
   animateHuman() and playerRig()); this file puts them to work, and keeps the older person()/animate() calls working.
     teamSession(o)                the squad at work on the pitch
     staffer(x, z, ry, {role, ...})   someone at work, dressed for it, posed at their counter, desk or post
     regulars(list, o)             customers: seated (the sit contract), paying at a till, browsing an aisle
     pedestrians({routes, count})  people walking the pavements on looping routes, by the time of day
     castLook(role, seed)          a look nobody else in this place already has
   Everyone who moves is drawn without a sun shadow (the shadow map is not redrawn every frame): the blob under
   them grounds them. People who come and go with the time of day only do it where you can't see them. */
import {THREE, W, solid} from "./build.js";
import {human, animateHuman, lookFor, playerRig, hashStr, rng, CONTACT, BONE, VIEW} from "./human.js";
export {human, animateHuman, lookFor, playerRig, CONTACT, BONE, VIEW};

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
   and against o.avoid, the things lying flat on the pitch that aren't solid (cones, loose balls, drill marks).
   The lap stays on the grass (at most OUT outside the line asked for), goes round the coach on the pitch side,
   and the runners swing out round you — or ease up — if you stand in their way. */
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
/* the lap: a rectangle with rounded corners, each straight bent sideways by a smooth profile of bumps round
   whatever stands on its line (a cone gate, a drill board, the keeper, the coach). A straight gives at most OUT
   outward from where it was asked to be, so the lap stays on the grass; past a person who may be talked to
   (the coach) it always goes on the pitch side; and where three abreast won't fit the group closes up into
   single file. Obstacles are [x, z, r, pitchSideOnly]. */
const OUT = .65, HALF = .77, ONE = .24, MAXIN = 2.4;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };
function sideProfile(A, B, inN, obst){
  // the straight is sampled every half metre; at each sample the line may sit anywhere from OUT outward to MAXIN
  // inward, three abreast or in single file. The cheapest smooth way through that hits nothing wins (dynamic
  // programming over the samples): staying on the asked-for line is free, moving off it or closing up costs.
  const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, tx = (B.x - A.x)/L, tz = (B.z - A.z)/L, du = .5, N = Math.ceil(L/du) + 1;
  const OFF = []; for (let o = -OUT; o <= MAXIN + 1e-6; o += .1) OFF.push(+o.toFixed(2));
  const K = OFF.length, S = K*2, ob = obst.map(o => { const px = o[0] - A.x, pz = o[1] - A.z; return [px*tx + pz*tz, px*inN.x + pz*inN.z, o[2], o[3]]; }).filter(o => o[0] > -2 && o[0] < L + 2);
  const blocked = (u, off, half) => { for (const [uo, lo, r, pitchSide] of ob){ const du2 = u - uo;
    if (Math.hypot(du2, off - lo) < r + half + .08) return true;
    if (pitchSide && off < lo && Math.abs(du2) < r + half + .5) return true; } return false; };
  const cost = new Float64Array(N*S).fill(Infinity), from = new Int32Array(N*S).fill(-1);
  for (let i = 0; i < N; i++){
    const u = Math.min(L, i*du);
    for (let st = 0; st < S; st++){
      const k = st % K, narrow = st >= K, off = OFF[k];
      if (blocked(u, off, narrow ? ONE : HALF)) continue;
      const own = Math.abs(off)*(off < 0 ? 1.5 : 1) + (narrow ? .9 : 0);
      if (!i){ cost[st] = own; continue; }
      let best = Infinity, bi = -1;
      for (let k2 = Math.max(0, k - 3); k2 <= Math.min(K - 1, k + 3); k2++) for (const n2 of [0, 1]){
        const p = (i - 1)*S + k2 + n2*K, c = cost[p]; if (c === Infinity) continue;
        const v = c + (k2 - k)*(k2 - k)*.04 + (n2 !== +narrow ? .3 : 0);
        if (v < best){ best = v; bi = p; }
      }
      if (bi >= 0){ cost[i*S + st] = best + own; from[i*S + st] = bi; }
    }
  }
  // walk back the cheapest way; if nothing gets through (it shouldn't), the asked-for line
  const offs = new Float32Array(N), wids = new Float32Array(N).fill(1);
  let end = -1, bc = Infinity; for (let st = 0; st < S; st++) if (cost[(N - 1)*S + st] < bc){ bc = cost[(N - 1)*S + st]; end = (N - 1)*S + st; }
  for (let i = N - 1, p = end; i >= 0 && p >= 0; i--, p = from[p]){ const st = p - i*S; offs[i] = OFF[st % K]; wids[i] = st >= K ? 0 : 1; }
  // smoothed a little, read between samples
  const sm = a => a.map((v, i) => (a[Math.max(0, i - 1)] + 2*v + a[Math.min(N - 1, i + 1)])/4);
  const O = sm(offs), Wd = sm(wids.map((v, i) => Math.min(v, wids[Math.max(0, i - 1)], wids[Math.min(N - 1, i + 1)])));
  const read = (a, u) => { const f = Math.max(0, Math.min(N - 1, u/du)), i = Math.min(N - 2, Math.floor(f)); return a[i] + (a[i + 1] - a[i])*(f - i); };
  return {L, off:u => read(O, u), wid:u => read(Wd, u)};
}
function lapLoop(x0, x1, z0, z1, R, obst){
  // near side (z1) left→right, down the right side, back along the far side (z0), up the left side
  const SIDES = [[{x:x0, z:z1}, {x:x1, z:z1}, {x:0, z:-1}], [{x:x1, z:z1}, {x:x1, z:z0}, {x:-1, z:0}], [{x:x1, z:z0}, {x:x0, z:z0}, {x:0, z:1}], [{x:x0, z:z0}, {x:x0, z:z1}, {x:1, z:0}]];
  const prof = SIDES.map(([A, B, n]) => sideProfile(A, B, n, obst));
  const P = [], c = [[x1 - R, z1 - R], [x1 - R, z0 + R], [x0 + R, z0 + R], [x0 + R, z1 - R]];
  const ln = [[[x0 + R, z1], [x1 - R, z1]], [[x1, z1 - R], [x1, z0 + R]], [[x1 - R, z0], [x0 + R, z0]], [[x0, z0 + R], [x0, z1 - R]]];
  for (let i = 0; i < 4; i++){
    const [p, q] = ln[i]; P.push({line:true, p, q, len:Math.hypot(q[0] - p[0], q[1] - p[1])});
    P.push({line:false, c:c[i], a0:i*Math.PI/2, len:R*Math.PI/2});
  }
  const total = P.reduce((t, q) => t + q.len, 0);
  const base = (s, out) => {
    s = ((s % total) + total) % total; let i = 0; while (s > P[i].len && i < P.length - 1){ s -= P[i].len; i++; }
    const q = P[i];
    out.w = 1;
    if (q.line){
      const f = s/(q.len || 1), k = i >> 1, pr = prof[k], u = R + s, tp = ss(R*.4, R + .8, u)*ss(R*.4, R + .8, pr.L - u), n = SIDES[k][2];
      const o = pr.off(u)*tp;
      out.x = q.p[0] + (q.q[0] - q.p[0])*f + n.x*o; out.z = q.p[1] + (q.q[1] - q.p[1])*f + n.z*o; out.side = k; out.w = 1 - (1 - pr.wid(u))*tp;
    } else { const a = q.a0 + s/R; out.x = q.c[0] + R*Math.sin(a); out.z = q.c[1] + R*Math.cos(a); out.side = -1; }
    return out;
  };
  const A = {}, Bq = {};
  return {total, prof, at(s, out){
    base(s, out); base(s - .15, A); base(s + .15, Bq);
    const dx = Bq.x - A.x, dz = Bq.z - A.z, l = Math.hypot(dx, dz) || 1; out.ux = dx/l; out.uz = dz/l;
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
  gk.g.position.set(c.x - 3.5, 0, c.z + 6); gk.g.rotation.y = Math.PI*.85; root.add(gk.g);
  actors.push({kind:"stretch", P:gk});
  avoid.push([gk.g.position.x, gk.g.position.z, .8]);
  // three running laps together, round the pitch: past the coach on the pitch side, round anything else
  const lp = o.lap || [{x:-18, z:-6}, {x:18, z:-6}, {x:18, z:-25}, {x:-18, z:-25}];
  const x0 = Math.min(...lp.map(p => p.x)), x1 = Math.max(...lp.map(p => p.x)), z0 = Math.min(...lp.map(p => p.z)), z1 = Math.max(...lp.map(p => p.z));
  const obst = avoid.map(([x, z, r]) => [x, z, r, 0]);
  obst.push([o.coach.x, o.coach.z, .75, 1]);
  // small things standing about (boards, machines, goals' posts) as circles; long walls and fences are left out
  for (const q of W.solids){ if (q.off || q.y0 > 1.6 || q.y1 < .05 || Math.max(q.x1 - q.x0, q.z1 - q.z0) > 3) continue; obst.push([(q.x0 + q.x1)/2, (q.z0 + q.z1)/2, Math.hypot(q.x1 - q.x0, q.z1 - q.z0)/2, 0]); }
  const loop = lapLoop(x0, x1, z0, z1, Math.min(2.6, (x1 - x0)/3, (z1 - z0)/3), obst);
  const group = {d:0, v:3.3, off:0, slow:0, dir:0, clear:0};
  // three abreast, closing up into single file where the lap is narrow: [beside, behind] and [behind in single file]
  [[.55, 0, 0], [-.55, -.25, -1.05], [0, -1.6, -2.1]].forEach(([side, back, file]) => {
    const P = player({}); root.add(P.g);
    actors.push({kind:"lap", P, side, back, file, yaw:null, px:null, pz:null, v:3.3});
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
    // where each runner would be on the lap: beside or behind the others, or in single file where it's narrow
    loop.at(group.d, lpt); const w = lpt.w, side = lpt.side;
    for (const ac of actors) if (ac.kind === "lap"){
      const q = ac.q || (ac.q = {}); loop.at(group.d + ac.back*w + ac.file*(1 - w), q); q.lat = ac.side*w;
    }
    /* you, standing in their way: the whole group swings out to one side of you (picked once, the nearer way,
       and kept until they're past), and if that would take it too far, eases right down until you move */
    let want = 0, slow = 0, hit = false;
    if (VIEW.scene === W.scene){
      // every runner coming up on you: to pass on your right the group must be at least l + .9 over, on your left l - .9
      let lo = 0, hi = 0;
      for (const ac of actors) if (ac.kind === "lap"){
        const q = ac.q, dx = VIEW.x - q.x, dz = VIEW.z - q.z, ahead = dx*q.ux + dz*q.uz, l = -dx*q.uz + dz*q.ux - q.lat;
        if (ahead < -.7 || ahead > 4.5 || Math.abs(l) > 2.6) continue;
        lo = Math.max(lo, l + .9); hi = Math.min(hi, l - .9);
        if (Math.abs(l - group.off) < 1.05) hit = true;
      }
      if (hit || group.dir){
        if (!group.dir) group.dir = Math.abs(lo) < Math.abs(hi) ? 1 : -1;
        want = group.dir > 0 ? lo : hi;
        if (Math.abs(want) > 1.6){ want = Math.sign(want)*1.6; slow = 1; }
        if (hit) group.clear = 0;
      }
    }
    if (!hit && (group.clear += dt) > .6) group.dir = 0;
    group.off += (want - group.off)*(1 - Math.exp(-(hit ? 5 : 2)*dt));
    group.slow += (slow - group.slow)*(1 - Math.exp(-5*dt));
    // one pace, a little quicker down the far side
    group.v += ((side === 2 ? 5.9 : 3.3)*(1 - .8*group.slow) - group.v)*(1 - Math.exp(-(group.slow > .05 ? 3 : .9)*dt));
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
        // his place in the group, swung out round you if you're in the way
        const q = ac.q, lat = q.lat + group.off, x = q.x - q.uz*lat, z = q.z + q.ux*lat;
        // the legs are driven by how fast he really goes (quicker on the outside of a bend)
        if (ac.px != null && dt > 0){ const sp = Math.hypot(x - ac.px, z - ac.pz)/dt; ac.v += (sp - ac.v)*(1 - Math.exp(-10*dt)); }
        ac.px = x; ac.pz = z; ac.P.g.position.set(x, 0, z);
        const yaw = Math.atan2(q.ux, q.uz);
        if (ac.yaw == null) ac.yaw = yaw;
        let dy = yaw - ac.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
        ac.yaw += dy*(1 - Math.exp(-8*dt)); ac.P.g.rotation.y = ac.yaw;
        animateHuman(ac.P, dt, {mode:"move", speed:ac.v});
      } else animateHuman(ac.P, dt, "stretch");
    }
    animateHuman(coach, dt, "clipboard");
  });
  return {root, coach, actors, group, loop:{x0, x1, z0, z1, path:loop}};
}

/* ---------- the cast of a place: nobody twice ----------
   Every person put into a place is checked against the others there: same sex, same hair, same kind of clothes in
   the same colour family counts as the same-looking person, and the seed is moved on until they differ. */
const CAST = new Set();
let castOf = null;
const sigOf = L => { const c = new THREE.Color(col(L.outfit.shirt) ?? 0); return [L.sex, L.hair, L.outfit.type, Math.round(c.r*3), Math.round(c.g*3), Math.round(c.b*3)].join("|"); };
export function castLook(role, seed, x = {}){
  if (castOf !== W.ticks){ castOf = W.ticks; CAST.clear(); }
  let look = null;
  for (let k = 0; k < 16; k++){
    look = lookFor(role, (seed | 0) + k*7919, x);
    const sig = sigOf(look);
    if (!CAST.has(sig)){ CAST.add(sig); break; }
  }
  return look;
}
// the minute of the day, whoever asks
const dayMin = o => { const m = o && o.minute ? o.minute() : typeof S !== "undefined" && S.life ? S.life.min : 720; return ((m % 1440) + 1440) % 1440; };
// is a person at (x, z) somewhere you could see them pop in or out? (near you, or in front of you within 30 m)
function inSight(x, z){
  if (VIEW.scene !== W.scene) return false;
  const dx = x - VIEW.x, dz = z - VIEW.z, d = Math.hypot(dx, dz);
  if (d < 2.5) return true;                                                // right beside you: you'd notice
  if (d > 32) return false;
  return (dx*(VIEW.fx || 0) + dz*(VIEW.fz || 0))/d > .25;                  // in front of you (the view is ~105° wide)
}

/* ---------- someone at work: behind a counter, at a desk, in the office ---------- */
const JOB_ROLE = {cafe:"barista", store:"clerk", courier:"dispatcher", gym:"gym", academy:"coach", photo:"photographer", video:"editor"};
const POSE = {manager:{mode:"counter", counter:.77, reach:.45}, shopkeeper:{mode:"counter", counter:1.05, reach:.36}, barista:{mode:"counter", counter:1.05, reach:.38}, gym:{mode:"counter", counter:1.1, reach:.34},
  coach:{mode:"clipboard"}, office:{mode:"idle", arms:"behind"}, courier:{mode:"idle", arms:"hips"}, dispatcher:{mode:"idle", arms:"folded"}, clerk:{mode:"idle", arms:"behind"},
  photographer:{mode:"idle", arms:"folded"}, editor:{mode:"idle", arms:"behind"}, physio:{mode:"idle", arms:"folded"}, kitman:{mode:"idle", arms:"behind"}, receptionist:{mode:"idle", arms:"behind"}};
function roleOf(o){
  if (o.role) return o.role;
  if (W.zone === "ground") return "manager";
  if (o.seed === 11) return "shopkeeper";
  const id = typeof jobState === "function" ? (jobState() || {}).id : "";
  return JOB_ROLE[id] || "shopkeeper";
}
export function jobRole(id){ return JOB_ROLE[id] || "shopkeeper"; }
// the nearest counter-high solid straight ahead within a metre: {top (its height above the feet), d (to its near edge)}
function counterAhead(x, z, ry, y0){
  const dx = Math.sin(ry), dz = Math.cos(ry);
  let best = null;
  for (const q of W.solids){
    if (q.off || q.y1 - y0 < .6 || q.y1 - y0 > 1.3 || q.y0 - y0 > .5) continue;
    // a ray against the box's footprint (slabs)
    let t0 = 0, t1 = 1.0, ok = true;
    for (const [p, d, lo, hi] of [[x, dx, q.x0, q.x1], [z, dz, q.z0, q.z1]]){
      if (Math.abs(d) < 1e-6){ if (p < lo || p > hi) ok = false; continue; }
      let a = (lo - p)/d, b = (hi - p)/d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (ok && t0 <= t1 && t0 > .1 && (!best || t0 < best.d)) best = {top:q.y1 - y0, d:t0};
  }
  return best;
}
/* o: {role, look, pose (an animateHuman state), seed, shirt (the uniform's colour), hair, y, kit, noSolid,
       when(minute) → bool: only there at those times (they come and go while you aren't looking), minute()} */
export function staffer(x, z, ry, o = {}){
  const role = roleOf(o);
  let look = o.look;
  if (!look){
    const sh = col(o.shirt), out = {};
    if (sh != null){
      if (role === "shopkeeper" || role === "barista") out.apron = sh;
      else if (!["coach", "manager", "physio", "kitman", "clerk", "dispatcher"].includes(role)) out.shirt = sh;
    }
    look = castLook(role, o.seed ?? 5, Object.assign({outfit:out}, o.kit ? {kit:o.kit} : {}));
    if (o.hair != null) look.hairColor = col(o.hair);
  }
  // standing still, so they may throw a real shadow; anyone who comes and goes doesn't (the sun's shadows are not redrawn for them)
  const h = human(look, {cast:!o.when});
  h.g.position.set(x, o.y || 0, z); h.g.rotation.y = ry;
  W.scene.add(h.g);
  // shop counters stand in front of the till workers; elsewhere they simply stand about
  let st = o.pose || POSE[role] || {mode:"idle"};
  if (!o.pose && st.mode === "counter" && role === "shopkeeper" && o.seed !== 11 && W.zone !== "ground") st = {mode:"idle", arms:"behind"};
  // hands on the counter (or desk) actually in front of them: its top and how far off its near edge is
  if (!o.pose && st.mode === "counter"){ const c = counterAhead(x, z, ry, o.y || 0); if (c) st = Object.assign({}, st, {counter:c.top, reach:Math.min(.7, Math.max(.3, c.d + .13))}); }
  animateHuman(h, 0, st); h.bw = 1; animateHuman(h, 0, st);         // already in place when you walk in
  const sol = o.noSolid ? null : solid(x - .3, x + .3, z - .3, z + .3, o.y || 0, (o.y || 0) + 1.9);
  let on = true;
  if (o.when){ on = !!o.when(dayMin(o)); h.g.visible = on; if (sol) sol.off = !on; }
  W.anims.push(dt => {
    if (o.when){
      const want = !!o.when(dayMin(o));
      if (want !== on && !inSight(x, z)){ on = want; h.g.visible = on; if (sol) sol.off = !on; }
    }
    if (on) animateHuman(h, dt, st);
  });
  h.role = role;
  return h;
}

/* ---------- customers: people sitting, paying, browsing ----------
   list: [{role, seed, x, z, ry, y, state (an animateHuman state for someone who stays put), when(minute),
           solid ([w, d] footprint or false), browse:{a:[x, z], b:[x, z], face (yaw while looking at the shelf)}}]
   Nobody here moves fast or throws a sun shadow; the blob under them grounds them. They come and go with the time
   of day, but never while you are looking. */
export function regulars(list, o = {}){
  const out = [];
  list.forEach((e, i) => {
    const look = e.look || castLook(e.role || "customer", e.seed ?? (101 + i*37), e.x0 || {});
    const h = human(look, {cast:false});
    h.g.position.set(e.x, e.y || 0, e.z); h.g.rotation.y = e.ry || 0;
    W.scene.add(h.g);
    const st = e.state || {mode:"idle"};
    const fp = e.solid === false ? null : e.solid || [.5, .5];
    const sol = fp ? solid(e.x - fp[0]/2, e.x + fp[0]/2, e.z - fp[1]/2, e.z + fp[1]/2, e.y || 0, (e.y || 0) + 1.8) : null;
    const P = {h, e, on:true, sol, st, t:2 + i*1.7, at:0, go:null, yaw:e.ry || 0, v:0};
    if (e.browse){ P.at = .3 + .4*((i*.618) % 1); const a = e.browse.a, b = e.browse.b; h.g.position.set(a[0] + (b[0] - a[0])*P.at, e.y || 0, a[1] + (b[1] - a[1])*P.at); P.yaw = e.browse.face; h.g.rotation.y = P.yaw; }
    animateHuman(h, 0, st); h.bw = 1;
    for (let k = 0; k < 4; k++) animateHuman(h, .1, st);
    if (e.when){ P.on = !!e.when(dayMin(o)); h.g.visible = P.on; if (sol) sol.off = !P.on; }
    out.push(P);
  });
  const tmp = {};
  W.anims.push(dt => {
    const m = dayMin(o);
    for (const P of out){
      const {h, e} = P;
      if (e.when){ const want = !!e.when(m); if (want !== P.on && !inSight(h.g.position.x, h.g.position.z)){ P.on = want; h.g.visible = want; if (P.sol) P.sol.off = !want; } }
      if (!P.on) continue;
      if (!e.browse){ animateHuman(h, dt, P.st); continue; }
      // browsing an aisle: stand and look at the shelf a while, then a few steps along it, out of your way
      const B = e.browse, L = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]) || 1;
      if (P.go == null){
        P.t -= dt;
        animateHuman(h, dt, {mode:"idle", look:.35*Math.sin(h.t*.4)});
        turn(P, B.face, dt);
        if (P.t <= 0){ P.go = Math.max(0, Math.min(1, P.at + (Math.random() < .5 ? -1 : 1)*(.25 + Math.random()*.35))); if (Math.abs(P.go - P.at)*L < .3) P.go = P.at < .5 ? P.at + .4 : P.at - .4; }
      } else {
        const dir = Math.sign(P.go - P.at), x = h.g.position.x, z = h.g.position.z, ux = (B.b[0] - B.a[0])/L*dir, uz = (B.b[1] - B.a[1])/L*dir;
        // you, standing in the aisle ahead: wait for you to move (and give up after a while)
        const ax = VIEW.x - x, az = VIEW.z - z, ahead = ax*ux + az*uz, side = Math.abs(-ax*uz + az*ux);
        const blocked = VIEW.scene === W.scene && ahead > 0 && ahead < 1.3 && side < .65;
        const want = blocked ? 0 : .75;
        P.v += (want - P.v)*(1 - Math.exp(-6*dt));
        P.at = Math.max(0, Math.min(1, P.at + dir*P.v*dt/L));
        h.g.position.set(B.a[0] + (B.b[0] - B.a[0])*P.at, e.y || 0, B.a[1] + (B.b[1] - B.a[1])*P.at);
        if (P.sol){ const w = (P.sol.x1 - P.sol.x0)/2, d = (P.sol.z1 - P.sol.z0)/2; Object.assign(P.sol, {x0:h.g.position.x - w, x1:h.g.position.x + w, z0:h.g.position.z - d, z1:h.g.position.z + d}); }
        turn(P, Math.atan2(ux, uz), dt);
        animateHuman(h, dt, {mode:"move", speed:P.v});
        if ((P.go - P.at)*dir <= 1e-3 || (blocked && (P.wait = (P.wait || 0) + dt) > 2.5)){ P.go = null; P.wait = 0; P.t = 3 + Math.random()*5; }
      }
    }
  });
  return out;
}
function turn(P, yaw, dt, k = 6){
  let d = yaw - P.yaw; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2;
  P.yaw += d*(1 - Math.exp(-k*dt)); P.h.g.rotation.y = P.yaw;
}

/* ---------- people walking the street ----------
   o.routes: closed loops of [x, z] waypoints along the pavements (corners are rounded off); a waypoint may carry a
   pause in seconds (at a kerb, looking both ways before crossing) and the way round the loop it applies to
   ([x, z, secs, +1 | −1 | 0 for both]). o.count(minute) → how many are
   out at that time of day (none in the small hours). Walkers keep to the right of their line, swing round you or
   wait if you're in the way (and turn back if you stay there), and never step into a solid or onto a raised floor:
   every point of a route knows how far to each side it is clear. One mesh each, no sun shadow. */
const ROAD_R = .3;
function groundY(x, z){
  let g = .013;                                                             // the road's surface (the asphalt is laid 1 cm proud)
  for (const f of W.floors) if (f.h < .2 && x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.h > g) g = f.h;
  return g;
}
function clearAt(x, z, r){
  for (const q of W.solids){ if (q.off || q.y1 < .15 || q.y0 > 1.7) continue; if (x + r > q.x0 && x - r < q.x1 && z + r > q.z0 && z - r < q.z1) return false; }
  for (const f of W.floors) if (f.h >= .2 && x + r > f.x0 && x - r < f.x1 && z + r > f.z0 && z - r < f.z1) return false;
  return true;
}
function routeOf(pts){
  // round the corners (Chaikin, twice, cutting no more than 70 cm into a long straight), then sample every 20 cm
  let P = pts.map(p => [p[0], p[1], p[2] || 0, p[3] || 0]);
  for (let it = 0; it < 2; it++){
    const Q = [];
    for (let i = 0; i < P.length; i++){
      const a = P[i], b = P[(i + 1) % P.length];
      if (a[2]) Q.push(a);                                                     // a pause point stays where it is
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, c = Math.min(.25, .7/L);          // a corner rounded over 70 cm at most
      Q.push([a[0]*(1 - c) + b[0]*c, a[1]*(1 - c) + b[1]*c, 0, 0], [a[0]*c + b[0]*(1 - c), a[1]*c + b[1]*(1 - c), 0, 0]);
    }
    P = Q;
  }
  const S_ = [];
  for (let i = 0; i < P.length; i++){
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L/.2));
    for (let k = 0; k < n; k++) S_.push({x:a[0] + (b[0] - a[0])*k/n, z:a[1] + (b[1] - a[1])*k/n, pause:k ? 0 : a[2], pdir:k ? 0 : a[3]});
  }
  let d = 0;
  for (let i = 0; i < S_.length; i++){
    const a = S_[i], b = S_[(i + 1) % S_.length];
    a.d = d; const L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6; a.ux = (b.x - a.x)/L; a.uz = (b.z - a.z)/L; d += L;
  }
  // the ground under the line, eased over a kerb so a step down onto the road is a step, not a jump
  for (const a of S_) a.g0 = groundY(a.x, a.z);
  for (let i = 0; i < S_.length; i++){ let t = 0; for (let k = -1; k <= 1; k++) t += S_[(i + k + S_.length) % S_.length].g0; S_[i].y = t/3; }
  // how far each side (left +, right −) of the line is clear for a body
  for (const a of S_){
    a.l = 0; a.r = 0;
    for (let o = .1; o <= 1.01 && clearAt(a.x - a.uz*o, a.z + a.ux*o, ROAD_R) && Math.abs(groundY(a.x - a.uz*o, a.z + a.ux*o) - a.g0) < .05; o += .1) a.l = o;
    for (let o = .1; o <= 1.01 && clearAt(a.x + a.uz*o, a.z - a.ux*o, ROAD_R) && Math.abs(groundY(a.x + a.uz*o, a.z - a.ux*o) - a.g0) < .05; o += .1) a.r = o;
    a.ok = clearAt(a.x, a.z, ROAD_R - .04);
  }
  return {S:S_, len:d, at(s){ s = ((s % d) + d) % d; let lo = 0, hi = S_.length - 1; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (S_[m].d <= s) lo = m; else hi = m - 1; } return S_[lo]; }};
}
export function pedestrians(o){
  const routes = o.routes.map(routeOf), walkers = [];
  const bad = routes.reduce((n, R) => n + R.S.filter(a => !a.ok).length, 0);                 // route points not clear (a test reads it)
  const N = o.max || 6;
  for (let i = 0; i < N; i++){
    const R = routes[i % routes.length], dir = (i >> 1) % 2 ? -1 : 1;
    const look = castLook("pedestrian", (o.seed || 500) + i*131);
    const h = human(look, {cast:false});
    W.scene.add(h.g);
    const w = {h, R, dir, s:R.len*((i*.37 + .11) % 1), v:0, base:1.2 + ((i*.29) % 1)*.35, lat:0, yaw:null, on:false, pause:0, cool:0, wait:0, px:null, pz:null, vis:0};
    const a = R.at(w.s); h.g.position.set(a.x, a.y, a.z); h.g.visible = false;
    walkers.push(w);
  }
  const fwd = (w, a) => [a.ux*w.dir, a.uz*w.dir];
  W.anims.push(dt => {
    const want = Math.min(N, Math.max(0, Math.round(o.count(dayMin(o)))));
    walkers.forEach((w, i) => {
      const h = w.h, should = i < want;
      if (should !== w.on && !inSight(h.g.position.x, h.g.position.z)){ w.on = should; h.g.visible = should; if (should){ w.v = 0; w.yaw = null; } }
      if (!w.on) return;
      const a = w.R.at(w.s), [fx, fz] = fwd(w, a);
      // a pause at a kerb: stand, look one way and the other, then go
      if (w.pause > 0){
        w.pause -= dt;
        animateHuman(h, dt, {mode:"idle", look:Math.sin((1.6 - w.pause)*2.4)*.7});
        return;
      }
      // you, in the way: swing round you to whichever side has room, or slow and wait; turn back if you stay put
      let latT = -.22*w.dir, slow = 0;
      if (VIEW.scene === W.scene){
        const x = h.g.position.x, z = h.g.position.z, dx = VIEW.x - x, dz = VIEW.z - z, ahead = dx*fx + dz*fz;
        if (ahead > -.4 && ahead < 3.2){
          const pl = (-dx*fz + dz*fx)*w.dir;                                  // your offset across the line, on the line's own left/right
          const lo = -a.r, hi = a.l, need = .62;
          if (Math.abs(pl - latT) < need){
            const left = pl + need, right = pl - need;
            if (left <= hi && (right < lo || Math.abs(left - latT) < Math.abs(right - latT))) latT = left;
            else if (right >= lo) latT = right;
            else slow = 1 - Math.max(0, Math.min(1, (ahead - .9)/1.6));
          }
        }
      }
      latT = Math.max(-a.r, Math.min(a.l, latT));
      w.lat += (latT - w.lat)*(1 - Math.exp(-3*dt));
      w.lat = Math.max(-a.r, Math.min(a.l, w.lat));
      // the one in front, going the same way: don't walk up their heels
      for (const q of walkers){ if (q === w || !q.on || q.R !== w.R || q.dir !== w.dir) continue; let gap = (q.s - w.s)*w.dir; gap = ((gap % w.R.len) + w.R.len) % w.R.len; if (gap < 1.6) slow = Math.max(slow, 1 - gap/1.6); }
      if (slow > .95){ if ((w.wait += dt) > 4){ w.dir = -w.dir; w.wait = 0; } } else w.wait = 0;
      const vt = w.base*(1 - slow);
      w.v += (vt - w.v)*(1 - Math.exp(-4*dt));
      const s0 = w.s; w.s += w.dir*w.v*dt;
      // a pause point passed: stop there
      const b = w.R.at(w.s);
      w.cool -= dt;
      if (b.pause && (!b.pdir || b.pdir === w.dir) && w.cool <= 0){ w.cool = 12; w.pause = b.pause; }
      const x = b.x - b.uz*w.lat, z = b.z + b.ux*w.lat;
      h.g.position.set(x, b.y, z);
      // legs driven by how fast the body really goes; facing eases round to the way it goes
      if (w.px != null && dt > 0){ const sp = Math.hypot(x - w.px, z - w.pz)/dt; w.vis += (Math.min(sp, 2.2) - w.vis)*(1 - Math.exp(-8*dt)); }
      w.px = x; w.pz = z;
      const yaw = Math.atan2(b.ux*w.dir, b.uz*w.dir);
      if (w.yaw == null) w.yaw = yaw;
      let d = yaw - w.yaw; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2;
      w.yaw += d*(1 - Math.exp(-5*dt)); h.g.rotation.y = w.yaw;
      // far away, the legs are worked out every other frame
      const far = Math.hypot(x - VIEW.x, z - VIEW.z) > 25;
      if (far && (w.skip = !w.skip)){ w.acc = (w.acc || 0) + dt; return; }
      animateHuman(h, dt + (w.acc || 0), {mode:"move", speed:w.vis}); w.acc = 0;
    });
  });
  return {walkers, routes, bad};
}
