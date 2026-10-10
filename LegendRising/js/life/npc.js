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
   them grounds them. People who come and go with the time of day only do it where you can't see them.
   WP-B (Stage 1, DESIGN 3.5.1, 3.5.3, 3.5.9, 3.9.6): what people do (where they go, what they are at) is worked out
   in the world's sub-steps (at most 1/20 s each) as before; their bodies are scheduler actors (SCHED.actor, 1.4.3)
   drawn once a frame at the tier they get (animTier), from the state the logic left them in (h.ast). Nobody's legs
   are told a smoothed speed any more: the animation measures how far the body really went (gait.js). */
import {THREE, W, solid} from "./build.js";
import {human, animateHuman, animTier, lookFor, playerRig, hashStr, rng, CONTACT, BONE, VIEW, onFirstView, you} from "./human.js";
import {SCHED} from "./core/sched.js";
import {SG} from "./core/collide.js";
import {DRILLS, GP, toWorld} from "./football/trainspec.js";
export {human, animateHuman, lookFor, playerRig, CONTACT, BONE, VIEW};

/* a person the scheduler draws: the logic sets h.ast (an animateHuman state) as it goes, and the pose is made once a
   frame at the body's tier. live(): whether it is out at all (else not posed, its gait state kept) */
export function actor(h, id, live = null){
  h.ast = h.ast || {mode:"idle"};
  const opt = {tier:0};                                           // (one per body, not a new one every frame)
  return SCHED.actor({id, kind:"npc", pos:() => h.g.position,
    anim:(dt, tier) => { if (!live || live()){ opt.tier = animTier(h, tier); animateHuman(h, dt, h.ast, opt); } }});
}

const col = c => c == null ? null : typeof c === "number" ? c : new THREE.Color().setStyle(String(c)).getHex();

/* where you are this step, as best known: the latest fix (you() in human.js) carried on at the pace you were going
   when it was taken: a long frame is lived in slices, and you go on moving through them. One per user, called once a
   step: → {x, z, vx, vz, here} */
export function youTracker(){
  const t = {x:0, z:0, vx:0, vz:0, here:false, n:-1, fx:0, fz:0, gap:0, u:0};
  return dt => {
    const f = you();
    t.here = f.here;
    if (!f.here){ t.n = -1; t.vx = t.vz = 0; t.x = t.fx = f.x; t.z = t.fz = f.z; t.u = 0; return t; }
    if (f.n !== t.n){
      // a new fix: the pace since the last one (none across a jump: you were put somewhere)
      const dx = f.x - t.fx, dz = f.z - t.fz, dl = Math.hypot(dx, dz);
      if (t.n >= 0 && t.gap > 1e-4 && dl < 2.5){ const v = dl/t.gap, k = v > 9 ? 9/v : 1; t.vx = dx/t.gap*k; t.vz = dz/t.gap*k; }
      else { t.vx = t.vz = 0; }
      t.n = f.n; t.fx = f.x; t.fz = f.z; t.gap = 0;
    }
    // (you have moved on through this step already: the world moves you before the people round you)
    t.gap += dt;
    const g = Math.min(t.gap, .12);
    t.x = t.fx + t.vx*g; t.z = t.fz + t.vz*g;
    // how far from the fix you could be by now (at least a walking step's worth: you may have just set off)
    t.u = Math.min(.5, Math.max(2.2, Math.hypot(t.vx, t.vz))*g) + .01;
    return t;
  };
}
// the same, read once (outside a step: a place being built, its first frame)
const fixNow = () => { const f = you(); return {x:f.x, z:f.z, fx:f.x, fz:f.z, vx:0, vz:0, u:.14, here:f.here}; };
/* never into you: a body within arm's length of you moves only if that takes it no nearer (its centre no nearer than
   .72 m, and its box (25 cm each way) clear of yours (27) by a few cm), so it never closes round you, and you are
   stopped by it at ~.5 m, not let in. m: a youTracker() reading */
const GUARD_E = .72, GUARD_C = .25 + .27 + .04;
/* (measured from where you were last seen, the margins grown by as far as you could have gone since at the pace you
   were going, whichever way you turned: you may have run on, turned, or been stopped by something) */
function nearer(px, pz, u, x, z, ox, oz){
  const c = Math.max(Math.abs(px - x), Math.abs(pz - z)), e = Math.hypot(px - x, pz - z);
  return (c < GUARD_C + u && c < Math.max(Math.abs(px - ox), Math.abs(pz - oz)) - 1e-4) || (e < GUARD_E + u && e < Math.hypot(px - ox, pz - oz) - 1e-4);
}
// (and no nearer where you most likely are by now, carried on from that fix)
export const into = (m, x, z, ox, oz) => m.here && (nearer(m.fx, m.fz, m.u, x, z, ox, oz) || nearer(m.x, m.z, .02, x, z, ox, oz));
// a moving body's solid (25 cm each way, head high) follows it; never switched on while it overlaps you (it would close
// round you and trap you), and off while the body isn't out
export function follow(q, m, x, z, y, on, top = 1.8){
  q.x0 = x - .25; q.x1 = x + .25; q.z0 = z - .25; q.z1 = z + .25; q.y0 = y; q.y1 = y + top;
  // (one already on when you are put down on top of it is left on: you can only step out of it, see world.js)
  q.off = !on || (q.off && m.here && Math.max(Math.abs(m.fx - x), Math.abs(m.fz - z)) < GUARD_C + m.u);
}

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
// the old call: "run" (speed is a multiple of a 3.4 m/s jog), "kick" (p.kick 0..1), "stretch", "idle", or any animateHuman mode
export function animate(p, dt, mode, speed = 1){
  if (mode === "run") return animateHuman(p, dt, {mode:"move", speed:3.4*speed});
  if (mode === "kick") return animateHuman(p, dt, {mode:"kick", t:Math.min(1, p.kick || 0)});
  return animateHuman(p, dt, mode);
}

/* ---------- the training session on the pitch ----------
   Two pairs passing (one pair in bibs): pass, the ball rolls across, a first touch to stop it, a touch to set
   it, and back; the ball leaves the boot at the moment of contact. Three team-mates running laps together
   (striding out down the far side), the keeper stretching by the touchline, and the coach with his clipboard.
   Everyone is laid out clear of the drill stations: lanes and the lap are tested against the ground's solids
   and against o.avoid, the things lying flat on the pitch that aren't solid (cones, loose balls, drill marks).
   The lap stays on the grass (at most OUT outside the line asked for), goes round the coach on the pitch side,
   and the runners swing out round you (or ease up) if you stand in their way. */
/* the training ground's drills (trainspec.js DRILLS, DESIGN 3.6.1): where each starts (its marker, a person stands
   there), its board, the coach's ball bag, the ground it is played on and the lines its ball travels: from the feed to
   the marker, and from the marker on to the goal it is played at. Nobody of the squad stands on any of it or passes a
   ball across it. Derived from the stations themselves, so a station that moves takes its clear ground with it.
   ground.js may pass its own lists as o.avoid, o.lanes and o.rings */
const GW = (x, z) => toWorld(x, z);
function drillGround(){
  const litter = [], lanes = [];
  for (const k of Object.keys(DRILLS)){
    const D = DRILLS[k], p = GW(D.spot.x, D.spot.z), b = GW(D.board.x, D.board.z);
    litter.push([p.x, p.z, .9], [b.x, b.z, .7]);
    if (D.feed && D.feed.from){ const q = GW(D.feed.from.x, D.feed.from.z); litter.push([q.x + .9, q.z + .4, .5]); lanes.push({a:[q.x, q.z], b:[p.x, p.z], r:.7}); }
    // at a goal: the lines from the marker to both posts and the middle of it
    if (!D.area){ const gx = D.dir*GP.L/2; for (const gz of [-3.66, 0, 3.66]){ const g = GW(gx, gz); lanes.push({a:[p.x, p.z], b:[g.x, g.z], r:.7}); } }
    else {
      // an area of its own: its four edges, kept clear by a lane round it
      const a = D.area, c = [GW(a.x0, a.z0), GW(a.x1, a.z0), GW(a.x1, a.z1), GW(a.x0, a.z1)];
      for (let n = 0; n < 4; n++) lanes.push({a:[c[n].x, c[n].z], b:[c[(n + 1) % 4].x, c[(n + 1) % 4].z], r:.4});
    }
  }
  // the odd cone and ball ground.js leaves lying about
  for (const [x, z] of [[-33, -6], [-33, -8], [-31, -6], [-31, -8], [33, -50]]) litter.push([x, z, .3]);
  litter.push([-2.4, -45.4, .2], [30.8, -6.7, .2]);
  return {litter, lanes};
}
const DG = drillGround(), PITCH_LITTER = DG.litter, DRILL_LANES = DG.lanes, RINGS_AT = [];
const segPt = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx*dx + dz*dz || 1, t = Math.max(0, Math.min(1, ((px - ax)*dx + (pz - az)*dz)/L)); return Math.hypot(ax + dx*t - px, az + dz*t - pz); };
// how close a segment a→b comes to the things in the way (solids standing on the floor, round markers [x, z, r], and
// lanes {a, b, r})
function clearance(ax, az, bx, bz, avoid){
  let m = 1e9;
  const n = Math.ceil(Math.hypot(bx - ax, bz - az)/.25) + 1;
  for (const q of W.solids){
    if (q.off || q.y0 > 1.6 || q.y1 < .05) continue;
    // distance from the segment to the box: sample along the segment (boxes here are small next to the lanes)
    for (let i = 0; i <= n; i++){ const x = ax + (bx - ax)*i/n, z = az + (bz - az)*i/n; m = Math.min(m, Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1))); }
  }
  for (const o of avoid){
    if (Array.isArray(o)){ m = Math.min(m, segPt(o[0], o[1], ax, az, bx, bz) - o[2]); continue; }
    // a lane: the nearer of the two segments' ends to the other one, or zero where they cross
    const [cx, cz] = o.a, [dx, dz] = o.b;
    let d = Math.min(segPt(ax, az, cx, cz, dx, dz), segPt(bx, bz, cx, cz, dx, dz), segPt(cx, cz, ax, az, bx, bz), segPt(dx, dz, ax, az, bx, bz));
    const cr = (px, pz, qx, qz, rx, rz) => (qx - px)*(rz - pz) - (qz - pz)*(rx - px);
    if (cr(ax, az, bx, bz, cx, cz)*cr(ax, az, bx, bz, dx, dz) < 0 && cr(cx, cz, dx, dz, ax, az)*cr(cx, cz, dx, dz, bx, bz) < 0) d = 0;
    m = Math.min(m, d - o.r);
  }
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
    if (Math.hypot(du2, off - lo) < r + half + .14) return true;
    // (only a person standing by THIS straight: one across the pitch from it is no reason to block it all)
    if (pitchSide && off < lo && lo < MAXIN + r + half + 1 && lo > -OUT - r - half - 1 && Math.abs(du2) < r + half + .5) return true; } return false; };
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
  // smoothed over a couple of metres (a runner eases across and closes up over a few strides, so his feet keep their
  // grip), read between samples. The narrow stretches are widened by three metres each way first (and eased in and out over a few more), so the group has
  // closed up before it reaches what it closes up for
  const sm = a => a.map((v, i) => (a[Math.max(0, i - 1)] + 2*v + a[Math.min(N - 1, i + 1)])/4), sm3 = a => sm(sm(sm(a)));
  const O = sm3(offs), Wd = sm3(sm3(wids.map((v, i) => { let m = v; for (let j = Math.max(0, i - 6); j <= Math.min(N - 1, i + 6); j++) m = Math.min(m, wids[j]); return m; })));
  // (a Catmull-Rom curve through the samples: no kink at each one, so a runner's heading never jumps)
  const read = (a, u) => { const f = Math.max(0, Math.min(N - 1, u/du)), i = Math.max(0, Math.min(N - 2, Math.floor(f))), t = f - i;
    const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(N - 1, i + 2)], t2 = t*t, t3 = t2*t;
    return .5*(2*p1 + (p2 - p0)*t + (2*p0 - 5*p1 + 4*p2 - p3)*t2 + (3*p1 - p0 - 3*p2 + p3)*t3); };
  return {L, off:u => read(O, u), wid:u => read(Wd, u)};
}
/* the corners are quarter circles, each as tight as it may be: a corner with something standing in it (the heading
   drill's ball machine) is drawn wider, its arc and the ends of the straights either side of it kept clear of every
   obstacle by CLEAR past the group's width. The straights' swerves fade out over the 1.5 m next to each corner. */
const CLEAR = .35, FADE = 1.5;
function lapLoop(x0, x1, z0, z1, R0, obst){
  // near side (z1) left→right, down the right side, back along the far side (z0), up the left side
  const SIDES = [[{x:x0, z:z1}, {x:x1, z:z1}, {x:0, z:-1}], [{x:x1, z:z1}, {x:x1, z:z0}, {x:-1, z:0}], [{x:x1, z:z0}, {x:x0, z:z0}, {x:0, z:1}], [{x:x0, z:z0}, {x:x0, z:z1}, {x:1, z:0}]];
  const prof = SIDES.map(([A, B, n]) => sideProfile(A, B, n, obst));
  // corner i is the end of side i and the start of side i + 1: its point, and the way in from it along x and z
  const CN = [[x1, z1, -1, -1], [x1, z0, -1, 1], [x0, z0, 1, 1], [x0, z1, 1, -1]];
  const tp = (u, Rs, Re, L) => ss(Rs, Rs + FADE, u)*ss(Re, Re + FADE, L - u);
  const hits = (x, z, half) => { for (const o of obst) if (Math.hypot(x - o[0], z - o[1]) < o[2] + half + CLEAR) return true; return false; };
  const Rc = [R0, R0, R0, R0], RMAX = Math.min((x1 - x0)/2.2, (z1 - z0)/2.2, 9);
  // the straight k at distance u from its start, with its swerve (for the corner test)
  const onSide = (k, u, R, out) => {
    const [A, B, n] = SIDES[k], pr = prof[k], L = pr.L, Rs = k === 0 ? Rc[3] : Rc[k - 1], Re = Rc[k], f = tp(u, Rs, Re, L), o = pr.off(u)*f;
    out.x = A.x + (B.x - A.x)*u/L + n.x*o; out.z = A.z + (B.z - A.z)*u/L + n.z*o; out.half = ONE + (HALF - ONE)*(1 - (1 - pr.wid(u))*f);
    return out;
  };
  const tmp = {};
  for (let i = 0; i < 4; i++){
    const [cx, cz, sx, sz] = CN[i];
    const blocked = R => {
      Rc[i] = R;
      const ox = cx + sx*R, oz = cz + sz*R;
      for (let k = 0; k <= 16; k++){ const a = k/16*Math.PI/2; if (hits(ox - sx*R*Math.sin(a), oz - sz*R*Math.cos(a), HALF)) return true; }
      // and the fading ends of the two straights either side
      const kIn = i, kOut = (i + 1) % 4, Lin = prof[kIn].L;
      for (let u = 0; u <= FADE + 1e-6; u += .25){
        onSide(kIn, Lin - R - u, R, tmp); if (hits(tmp.x, tmp.z, tmp.half)) return true;
        onSide(kOut, R + u, R, tmp); if (hits(tmp.x, tmp.z, tmp.half)) return true;
      }
      return false;
    };
    let R = R0; while (R < RMAX && blocked(R)) R += .1;
    Rc[i] = R;
  }
  const P = [], c = CN.map(([cx, cz, sx, sz], i) => [cx + sx*Rc[i], cz + sz*Rc[i]]);
  const ln = [[[x0 + Rc[3], z1], [x1 - Rc[0], z1]], [[x1, z1 - Rc[0]], [x1, z0 + Rc[1]]], [[x1 - Rc[1], z0], [x0 + Rc[2], z0]], [[x0, z0 + Rc[2]], [x0, z1 - Rc[3]]]];
  for (let i = 0; i < 4; i++){
    const [p, q] = ln[i]; P.push({line:true, p, q, len:Math.hypot(q[0] - p[0], q[1] - p[1]), k:i, Rs:i === 0 ? Rc[3] : Rc[i - 1], Re:Rc[i]});
    P.push({line:false, c:c[i], R:Rc[i], a0:i*Math.PI/2, len:Rc[i]*Math.PI/2});
  }
  const total = P.reduce((t, q) => t + q.len, 0);
  const base = (s, out) => {
    s = ((s % total) + total) % total; let i = 0; while (s > P[i].len && i < P.length - 1){ s -= P[i].len; i++; }
    const q = P[i];
    out.w = 1; out.left = q.len - s;
    if (q.line){
      const f = s/(q.len || 1), k = q.k, pr = prof[k], u = q.Rs + s, t = tp(u, q.Rs, q.Re, pr.L), n = SIDES[k][2];
      const o = pr.off(u)*t;
      out.x = q.p[0] + (q.q[0] - q.p[0])*f + n.x*o; out.z = q.p[1] + (q.q[1] - q.p[1])*f + n.z*o; out.side = k; out.w = 1 - (1 - pr.wid(u))*t;
    } else { const a = q.a0 + s/q.R; out.x = q.c[0] + q.R*Math.sin(a); out.z = q.c[1] + q.R*Math.cos(a); out.side = -1; }
    return out;
  };
  const A = {}, Bq = {};
  /* the last few points asked for, kept: each step asks for every runner's place twice (before and after the group
     moves on) and the second answer is the next step's first, so half the asks are answered from here */
  const MEMO = Array.from({length:8}, () => ({s:NaN, x:0, z:0, w:1, left:0, side:0, ux:0, uz:0}));
  let memoAt = 0;
  // (the fields copied one by one, not by name from a list: a copy by computed name is a slow lookup every time)
  const copy = (a, b) => { b.x = a.x; b.z = a.z; b.w = a.w; b.left = a.left; b.side = a.side; b.ux = a.ux; b.uz = a.uz; };
  return {total, prof, R:Rc, at(s, out){
    for (let i = 0; i < MEMO.length; i++){ const m = MEMO[i]; if (m.s === s){ copy(m, out); return out; } }
    base(s, out); base(s - .15, A); base(s + .15, Bq);
    const dx = Bq.x - A.x, dz = Bq.z - A.z, l = Math.hypot(dx, dz) || 1; out.ux = dx/l; out.uz = dz/l;
    const m = MEMO[memoAt]; memoAt = (memoAt + 1) % MEMO.length;
    m.s = s; copy(out, m);
    return out;
  }};
}
export function teamSession(o){
  // o: {kit:[a,b], when:() => bool, centre:{x,z}, coach:{x,z,ry}, ballMesh:() => Mesh, lap?:[{x,z}...], avoid?:[[x,z,r]...],
  //     pairs?:[[{x,z}, {x,z}, bib]...], lanes?:[{a:[x,z], b:[x,z], r}...], rings?:[[x,z]...]}
  const root = new THREE.Group(); W.scene.add(root);
  const self = {leave:null, left:false};                       // (what is returned; leave.js sets .leave)
  const [a, b] = o.kit || ["#2c66b8", "#ffffff"];
  const base = hashStr(String(a) + String(b)) % 100000, r = rng(base + 11);
  const nums = [2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28];
  for (let i = nums.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  let k = 0;
  const looks = new Map();          // (each squad body's look: the simulation's bodies borrow them)
  const player = extra => { const lk = lookFor("footballer", base + 31*(++k), Object.assign({kit:[a, b, a], number:nums[k]}, extra)), h = human(lk); looks.set(h, lk); return h; };
  const actors = [], c = o.centre;
  const avoid = [...(o.avoid || PITCH_LITTER), [o.coach.x, o.coach.z, .6]], rings = o.rings || RINGS_AT;
  // the drills' lanes and rings: a pair stands, and passes, at least 1.6 m off any line a drill's ball travels and
  // 2.3 m from the middle of a ring
  const drillAvoid = [...(o.lanes || DRILL_LANES), ...rings.map(([x, z]) => [x, z, 1.4])];
  // the passing pairs, facing each other across an open strip: out of the way of every drill, in the two far
  // quarters of the pitch (left of the centre circle behind the shooting drill's mannequins, and right of it
  // short of the heading drill's ball machine)
  const lanes = o.pairs || [[{x:-16.3, z:-21.35}, {x:-11.65, z:-18.65}, false], [{x:15.85, z:-21.85}, {x:13.15, z:-17.15}, "#d8ff3a"]];
  for (const [p1, p2, bib] of lanes){
    const sh = clearLane(p1, p2, .9, [...avoid, ...drillAvoid]), L = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1, nx = -(p2.z - p1.z)/L*sh, nz = (p2.x - p1.x)/L*sh;
    const P = [player({bib, training:!!bib}), player({bib, training:!!bib})];
    P[0].g.position.set(p1.x + nx, 0, p1.z + nz); P[1].g.position.set(p2.x + nx, 0, p2.z + nz);
    P[0].g.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z); P[1].g.rotation.y = Math.atan2(p1.x - p2.x, p1.z - p2.z);
    root.add(P[0].g, P[1].g);
    avoid.push(...[P[0], P[1]].map(h => [h.g.position.x, h.g.position.z, .6]), [(p1.x + p2.x)/2 + nx, (p1.z + p2.z)/2 + nz, L/2 - .4]);
    const ball = o.ballMesh(); root.add(ball);
    actors.push({kind:"pair", P, ball, who:0, st:"pass", t:r()*.5, at:null, to:null, roll:0, ax:new THREE.Vector3(),
      home:P.map(h => ({x:h.g.position.x, z:h.g.position.z, ry:h.g.rotation.y}))});
  }
  // the keeper stretching by the touchline
  const gkLook = lookFor("goalkeeper", base + 7, {kit:[a, b]}), gk = human(gkLook); looks.set(gk, gkLook);
  gk.g.position.set(c.x - 3.5, 0, c.z + 6); gk.g.rotation.y = Math.PI*.85; root.add(gk.g);
  actors.push({kind:"stretch", P:gk, home:[{x:gk.g.position.x, z:gk.g.position.z, ry:gk.g.rotation.y}]});
  avoid.push([gk.g.position.x, gk.g.position.z, .8]);
  // three running laps together, round the pitch: past the coach on the pitch side, round anything else
  const lp = o.lap || [{x:-18, z:-6}, {x:18, z:-6}, {x:18, z:-25}, {x:-18, z:-25}];
  const x0 = Math.min(...lp.map(p => p.x)), x1 = Math.max(...lp.map(p => p.x)), z0 = Math.min(...lp.map(p => p.z)), z1 = Math.max(...lp.map(p => p.z));
  const obst = avoid.map(([x, z, r]) => [x, z, r, 0]);
  obst.push([o.coach.x, o.coach.z, .75, 1]);
  // the painted rings: the runners keep 2 m from the middle of each (the group's edge 70 cm clear of the paint)
  for (const [x, z] of rings) obst.push([x, z, 1.7, 0]);
  // small things standing about (boards, machines, goals' posts) as circles; long walls and fences are left out
  for (const q of W.solids){ if (q.off || q.y0 > 1.6 || q.y1 < .05 || Math.max(q.x1 - q.x0, q.z1 - q.z0) > 3) continue; obst.push([(q.x0 + q.x1)/2, (q.z0 + q.z1)/2, Math.hypot(q.x1 - q.x0, q.z1 - q.z0)/2, 0]); }
  const loop = lapLoop(x0, x1, z0, z1, Math.min(2.6, (x1 - x0)/3, (z1 - z0)/3), obst);
  const group = {d:0, v:3.3, off:0, slow:0, dir:0, clear:0};
  // three abreast, closing up into single file where the lap is narrow: [beside, behind] and [behind in single file]
  [[.55, 0, 0], [-.55, -.5, -1.05], [0, -1.6, -2.1]].forEach(([side, back, file]) => {
    const P = player({}); root.add(P.g);
    actors.push({kind:"lap", P, side, back, file, yaw:null, px:null, pz:null, v:3.3});
  });
  // and the coach watching it all
  const coach = human(lookFor("coach", base + 3, {kit:[a, b]}), {cast:false});
  coach.g.position.set(o.coach.x, 0, o.coach.z); coach.g.rotation.y = o.coach.ry || 0;
  root.add(coach.g);
  // everyone in the session is drawn by the scheduler while the session is on and still theirs (leave.js takes over)
  let on = null;
  const live = () => on === true && !self.left;
  // (a body lent to a drill is drawn by the drill's view while it plays: its own is hidden, and not posed)
  for (const ac of actors) for (const h of ac.kind === "pair" ? ac.P : [ac.P]) actor(h, "team", () => live() && h.g.visible);
  for (const ac of actors) if (ac.kind === "stretch") ac.P.ast = {mode:"stretch"};
  coach.ast = {mode:"clipboard"}; actor(coach, "team-coach", live);
  // (a clip state each, changed in place as the drill goes on)
  const say = (h, mode, t, amp) => { const q = h.ast; q.mode = mode; q.t = t; q.amp = amp; q.speed = undefined; };
  // everyone standing on the pitch is solid while the session is on (you walk round them, not through them); made
  // after the lanes and the lap were laid out, which already keep clear of them
  const solids = [solid(o.coach.x - .35, o.coach.x + .35, o.coach.z - .35, o.coach.z + .35, 0, 1.9)];
  for (const ac of actors) for (const h of ac.kind === "pair" ? ac.P : ac.kind === "stretch" ? [ac.P] : []){
    const x = h.g.position.x, z = h.g.position.z; solids.push(solid(x - .25, x + .25, z - .25, z + .25, 0, 1.85));
  }
  for (const q of solids) q.off = true;                              // until the session is seen to be on
  // ... and the runners too, each a body that goes round with him (see follow(): never switched on round you)
  const runners = actors.filter(ac => ac.kind === "lap"), bodies = runners.map(ac => (ac.sol = solid(0, 0, 0, 0, 0, 1.85), ac.sol.off = true, ac.sol));
  W.runners = runners;                                                     // (for tests: where they are)
  const track = youTracker(), lc = {};
  // (going round you, one doesn't step into another either)
  const bumpsRunner = (ac, x, z) => { for (const o of runners){ if (o === ac || o.px == null || o.away) continue; const e = Math.hypot(o.px - x, o.pz - z); if (e < .5 && e < Math.hypot(o.px - ac.px, o.pz - ac.pz) - 1e-4) return true; } return false; };
  /* somewhere a runner can't go when he leaves the lap to get round you: inside anything solid (a goal, the stand, a
     dugout, the fence, a team-mate in a drill: every solid, the big ones too) or too near the things lying on the
     grass and the people standing on it (obst) */
  const stuck = (x, z) => {
    let hit = false;                                                     // (only the boxes near: the solids hash, DESIGN 3.9.5)
    SG.each(x - .32, z - .32, x + .32, z + .32, q => !(q.off || q.y0 > 1.6 || q.y1 < .1 || bodies.includes(q)) && x > q.x0 - .32 && x < q.x1 + .32 && z > q.z0 - .32 && z < q.z1 + .32 && (hit = true));
    if (hit) return true;
    for (const [ox, oz, r] of obst) if (Math.hypot(x - ox, z - oz) < r + .2) return true;
    return false;
  };
  // the group swung out to lateral offset `off`: is every runner's place (and the way across to it) clear?
  const sideClear = off => {
    for (const ac of runners){
      const q = ac.q; if (!q) continue;
      for (const f of [.5, 1]) for (const ahead of [0, 1.5]){
        const lat = q.lat + off*f, x = q.x - q.uz*lat + q.ux*ahead, z = q.z + q.ux*lat + q.uz*ahead;
        if (stuck(x, z)) return false;
      }
    }
    return true;
  };
  const tmp = new THREE.Vector3(), lpt = {};
  // a spot by a player's right foot, d metres in front of him
  const footSpot = (P, d, out) => { const y = P.g.rotation.y; return out.set(P.g.position.x + Math.sin(y)*d - Math.cos(y)*.12, .11, P.g.position.z + Math.cos(y)*d + Math.sin(y)*.12); };
  const rollBall = (ac, from, to) => {
    const d = tmp.subVectors(to, from), L = d.length(); if (L < 1e-5) return;
    ac.ax.set(d.z, 0, -d.x).normalize(); ac.ball.rotateOnWorldAxis(ac.ax, L/.11);
  };
  const PASS = .75, TRAP = .7, SET = .6, SPEED = 7.5;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  W.anims.push(dt => {
    const now = !!o.when();
    if (now !== on){
      const was = on; on = now;
      // the session ending while you are here: if somebody (leave.js) is taking them home, its people are handed over
      // where they stand (they don't vanish), and the balls are gathered up
      if (!now && was === true && self.leave){
        // anyone lent to a drill is given back first (its owner hands the bodies back where they stand)
        for (const f of self.beforeLeave.slice()) try { f(); } catch(e){ console.error(e); }
        for (const ac of actors){ ac.away = false; ac.homing = false; for (const h of ac.kind === "pair" ? ac.P : [ac.P]) h.g.visible = true; }
        for (const ac of actors) if (ac.ball) ac.ball.visible = false;
        for (const q of solids) q.off = true; for (const q of bodies) q.off = true;
        const list = []; for (const ac of actors) for (const h of ac.kind === "pair" ? ac.P : [ac.P]) list.push(h); list.push(coach);
        self.leave(list); self.left = true;
        return;
      }
      if (!self.left) root.visible = now;
      for (const q of solids) q.off = !now || !!self.left; for (const q of bodies) q.off = true;
    }
    if (!now || self.left) return;
    const me = track(dt);
    // where each runner would be on the lap: beside or behind the others, or in single file where it's narrow
    loop.at(group.d, lpt); const w = lpt.w, side = lpt.side;
    for (const ac of actors) if (ac.kind === "lap"){
      const q = ac.q || (ac.q = {}); loop.at(group.d + ac.back*w + ac.file*(1 - w), q); q.lat = ac.side*w;
    }
    /* you, standing in their way: the whole group swings out to one side of you (picked once, the nearer way,
       and kept until they're past), and if that would take it too far, eases right down until you move */
    let want = 0, slow = 0, hit = false;
    if (me.here){
      // every runner coming up on you: to pass on your right the group must be at least l + .9 over, on your left l - .9
      let lo = 0, hi = 0;
      for (const ac of actors) if (ac.kind === "lap"){
        const q = ac.q, dx = me.x - q.x, dz = me.z - q.z, ahead = dx*q.ux + dz*q.uz, l = -dx*q.uz + dz*q.ux - q.lat;
        if (ahead < -.7 || ahead > 4.5 || Math.abs(l) > 2.6) continue;
        lo = Math.max(lo, l + .9); hi = Math.min(hi, l - .9);
        if (Math.abs(l - group.off) < 1.05) hit = true;
      }
      if (hit || group.dir){
        if (!group.dir) group.dir = Math.abs(lo) < Math.abs(hi) ? 1 : -1;
        const lim = w => Math.abs(w) > 1.6 ? Math.sign(w)*1.6 : w;
        // only round a side that is clear of goals, stands and everything else: the other side if not, and if
        // neither is, they ease up and wait for you to get out of the way
        if (!sideClear(lim(group.dir > 0 ? lo : hi))){
          if (sideClear(lim(group.dir > 0 ? hi : lo))) group.dir = -group.dir;
          else group.blocked = true;
        } else group.blocked = false;
        want = group.blocked ? 0 : lim(group.dir > 0 ? lo : hi);
        if (group.blocked || Math.abs(group.dir > 0 ? lo : hi) > 1.6) slow = 1;
        if (hit) group.clear = 0;
      }
    }
    if (!hit && (group.clear += dt) > .6) group.dir = 0;
    // a few paces across, not a jump sideways: at most 1.2 m/s (they ease up while they can't get round you yet)
    group.off += Math.max(-1.2*dt, Math.min(1.2*dt, (want - group.off)*(1 - Math.exp(-(hit ? 5 : 2)*dt))));
    if (hit && Math.abs(want - group.off) > .5) slow = Math.max(slow, Math.min(1, (Math.abs(want - group.off) - .5)/.8));
    group.slow += (slow - group.slow)*(1 - Math.exp(-5*dt));
    // one held up behind you (below) drops back from his place in the group: the others ease up and wait for him
    let lag = 0; for (const ac of runners) if (!ac.away) lag = Math.max(lag, ac.lag || 0);
    const wait = Math.max(0, Math.min(1, (lag - .6)/1.2));
    // one pace, striding out down the far side: the change of pace eased in over a couple of seconds, and back down
    // to a jog well before the corner at the end of it
    const fast = side === 2 && lpt.left > 12;
    group.v += ((fast ? 5.9 : 3.3)*(1 - .8*group.slow)*(1 - wait) - group.v)*(1 - Math.exp(-(group.slow > .05 || wait > 0 ? 3 : fast ? .5 : .8)*dt));
    group.d += group.v*dt;
    /* where each runner goes this step: towards his place in the group (catching up on it at a little over its pace).
       None of them ever steps into you (into()): if that step would take him nearer, he takes the same length of step
       turned off round you (the least turn that works, away from your side first), and failing every one, he stands
       a moment until you move (and the rest wait for him) */
    loop.at(group.d, lc); const w2 = lc.w;
    for (const ac of runners){
      if (ac.away) continue;
      const c = ac.c || (ac.c = {}); loop.at(group.d + ac.back*w2 + ac.file*(1 - w2), c);
      const lat = ac.side*w2 + group.off, tx = c.x - c.uz*lat, tz = c.z + c.ux*lat;
      const sv = ac.tx == null || !(dt > 0) ? group.v : Math.hypot(tx - ac.tx, tz - ac.tz)/dt;
      ac.tx = tx; ac.tz = tz;
      if (ac.px == null){ c.X = tx; c.Z = tz; ac.lag = 0; continue; }
      // (catching the group up after a drill borrowed him: never faster than a borrowed body may go, 6 m/s)
      let mx = tx - ac.px, mz = tz - ac.pz; const ml = Math.hypot(mx, mz), lim = Math.min(Math.min(sv, 7) + 1.5, ac.lag > 1 ? 6 : 8.5)*dt;
      if (ml > lim){ mx *= lim/ml; mz *= lim/ml; }
      let X = ac.px + mx, Z = ac.pz + mz;
      const offLap = Math.abs(group.off) > .05 || ac.lag > .3;          // (on the lap itself everything is clear already)
      if (into(me, X, Z, ac.px, ac.pz) || bumpsRunner(ac, X, Z) || (offLap && stuck(X, Z) && !stuck(ac.px, ac.pz))){
        X = ac.px; Z = ac.pz;
        const L = Math.hypot(mx, mz);
        if (L > 1e-5){
          // turned away from you first (you on his left: he bears right)
          const away = mx*(me.z - ac.pz) - mz*(me.x - ac.px) > 0 ? 1 : -1;
          // (a squeeze between two of the others is only a brush of shoulders: if nothing else will do, he takes it)
          search: for (const mate of [true, false]) for (const t of [0, .45, .9, 1.35, 1.8]) for (const sg of t ? [away, -away] : [1]){
            const ca = Math.cos(t*sg), sa = Math.sin(t*sg), nx = ac.px + mx*ca + mz*sa, nz = ac.pz - mx*sa + mz*ca;
            if (!into(me, nx, nz, ac.px, ac.pz) && !(mate && bumpsRunner(ac, nx, nz)) && !(stuck(nx, nz) && !stuck(ac.px, ac.pz))){ X = nx; Z = nz; break search; }
          }
        }
      }
      c.X = X; c.Z = Z; ac.lag = Math.hypot(tx - X, tz - Z);
    }
    for (const ac of actors){
      if (ac.away) continue;
      if (ac.homing){ walkHome(ac, dt); continue; }
      if (ac.kind === "pair"){
        const A = ac.P[ac.who], Bp = ac.P[1 - ac.who];
        ac.t += dt;
        const old = pa.copy(ac.ball.position);
        if (ac.st === "pass"){
          const t = ac.t/PASS;
          say(A, "pass", Math.min(1, t));
          if (t < CONTACT.pass) footSpot(A, .34, ac.ball.position);
          else {
            if (!ac.at){ ac.at = footSpot(A, .34, new THREE.Vector3()); ac.to = footSpot(Bp, .3, new THREE.Vector3()); ac.fly = ac.at.distanceTo(ac.to)/SPEED; ac.ft = 0; }
            ac.ft += dt; const f = Math.min(1, ac.ft/ac.fly);
            ac.ball.position.lerpVectors(ac.at, ac.to, f);
            // the receiver times his first touch to meet it
            const left = ac.fly - ac.ft;
            if (left < TRAP*CONTACT.trap){ ac.st = "trap"; ac.t = TRAP*CONTACT.trap - left; }
          }
          if (ac.st === "pass") say(Bp, "idle");
        } else if (ac.st === "trap"){
          const t = ac.t/TRAP;
          say(Bp, "trap", Math.min(1, t)); say(A, "idle");
          if (t < CONTACT.trap){ ac.ft += dt; ac.ball.position.lerpVectors(ac.at, ac.to, Math.min(1, ac.ft/ac.fly)); }
          else ac.ball.position.lerp(footSpot(Bp, .3, pb), 1 - Math.exp(-12*dt));
          if (t >= 1){ ac.st = "set"; ac.t = 0; ac.at = null; }
        } else if (ac.st === "set"){
          const t = ac.t/SET;
          say(Bp, "pass", Math.min(1, t), .45); say(A, "idle");
          // a short touch out of the feet, ready to play it back
          if (t > CONTACT.pass) ac.ball.position.lerp(footSpot(Bp, .34, pb), 1 - Math.exp(-6*dt));
          if (t >= 1.25){ ac.st = "pass"; ac.t = 0; ac.who = 1 - ac.who; }
        }
        rollBall(ac, old, ac.ball.position);
      } else if (ac.kind === "lap"){
        // his place in the group, swung out round you if you're in the way (worked out above)
        const x = ac.c.X, z = ac.c.Z;
        /* he faces the way he really goes, frame to frame (round a bend, swinging out round you, closing up into
           single file), turning no faster than a runner can; his legs measure how far he really went (gait.js),
           quicker on the outside of a bend, so the planted foot stays planted. What he is told is the group's pace */
        if (ac.yaw == null) ac.yaw = Math.atan2(ac.c.ux, ac.c.uz);
        if (ac.px != null && dt > 0){
          const vx = (x - ac.px)/dt, vz = (z - ac.pz)/dt, sp = Math.hypot(vx, vz);
          if (sp > .4){
            let dy = Math.atan2(vx, vz) - ac.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
            ac.yaw += Math.max(-4*dt, Math.min(4*dt, dy*(1 - Math.exp(-25*dt))));
          }
        }
        ac.v = group.v;
        ac.px = x; ac.pz = z; ac.P.g.position.set(x, 0, z); ac.P.g.rotation.y = ac.yaw;
        follow(ac.sol, me, x, z, 0, true, 1.85);
        const q = ac.P.ast; q.mode = "move"; q.speed = group.v;
      }
    }
  });
  /* given back after a drill: a pair or the keeper walk back to where they were (a jog, never over 6 m/s), and pick up
     their work there */
  const HOME_V = 3.4;
  const walkHome = (ac, dt) => {
    let all = true;
    (ac.kind === "pair" ? ac.P : [ac.P]).forEach((h, i) => {
      const hm = ac.home[i], g = h.g, dx = hm.x - g.position.x, dz = hm.z - g.position.z, d = Math.hypot(dx, dz);
      if (d < .08){ g.rotation.y += Math.max(-4*dt, Math.min(4*dt, Math.atan2(Math.sin(hm.ry - g.rotation.y), Math.cos(hm.ry - g.rotation.y)))); h.ast = {mode:"idle"}; return; }
      all = false;
      const k = Math.min(1, HOME_V*dt/d); g.position.x += dx*k; g.position.z += dz*k;
      let dy = Math.atan2(dx, dz) - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += Math.max(-7*dt, Math.min(7*dt, dy));
      h.ast = {mode:"move", speed:Math.min(HOME_V, d/Math.max(dt, 1e-3))};
    });
    if (!all) return;
    ac.homing = false;
    if (ac.kind === "pair"){
      ac.st = "pass"; ac.t = 0; ac.at = null; ac.who = 0; ac.ball.visible = true;
      ac.P.forEach((h, i) => { h.g.rotation.y = ac.home[i].ry; h.ast = {mode:"idle"}; });
    } else if (ac.kind === "stretch"){ ac.P.g.rotation.y = ac.home[0].ry; ac.P.ast = {mode:"stretch"}; }
    if (ac.sols) for (const q of ac.sols) q.off = !on;
  };
  self.beforeLeave = [];
  /* borrowing (training.js, DESIGN 3.6.2): n of the squad step out of what they are doing for a block of the session
     the player joins; the borrower moves them (h.g) and says what they do (h.ast), the scheduler still draws them. A
     pair goes together (its ball is picked up), then the runners, the keeper only when asked for (o.keeper). Their
     solids go off while they are away. release(list) sends them back to it: a pair starts passing again where they
     are, a runner rejoins the group (he catches it up), the keeper goes back to his stretches */
  const borrowable = () => actors.filter(ac => !ac.away && ac.kind !== "stretch");
  self.borrow = (n, o = {}) => {
    const out = [];
    if (!on || self.left) return out;
    const rec = (ac, h, role) => {
      const lk = looks.get(h) || null;
      return {h, role, ac, look:lk, x:h.g.position.x, z:h.g.position.z, number:lk && lk.outfit ? lk.outfit.number || 0 : 0, scale:lk && lk.height ? lk.height : 1};
    };
    const take = (ac, h, role) => { ac.away = true; ac.homing = false; out.push(rec(ac, h, role)); };
    if (o.keeper){ const k = actors.find(ac => ac.kind === "stretch" && !ac.away); if (k) take(k, k.P, "keeper"); }
    for (const ac of borrowable()){
      if (out.filter(b => b.role !== "keeper").length >= n) break;
      if (ac.kind === "pair"){ ac.ball.visible = false; ac.away = true; ac.homing = false; for (const h of ac.P) out.push(rec(ac, h, "player")); }
      else take(ac, ac.P, "player");
    }
    // their solids go off while they are away (the drill's own bodies collide in the simulation)
    for (const b of out){
      const q = solids.find(sq => Math.abs((sq.x0 + sq.x1)/2 - b.x) < .01 && Math.abs((sq.z0 + sq.z1)/2 - b.z) < .01);
      if (q){ q.off = true; b.sol = q; const L = b.ac.sols || (b.ac.sols = []); if (!L.includes(q)) L.push(q); }
      if (b.ac.sol) b.ac.sol.off = true;
    }
    return out;
  };
  self.release = list => {
    for (const b of list || []){
      const ac = b.ac; if (!ac || !ac.away) continue;
      ac.away = false;
      b.h.g.visible = true;
      // a pair and the keeper walk back to their places first; a runner catches the group up
      if (ac.kind === "pair" || ac.kind === "stretch") ac.homing = true;
      else if (ac.kind === "lap"){ ac.px = b.h.g.position.x; ac.pz = b.h.g.position.z; ac.yaw = b.h.g.rotation.y; ac.lag = 99; }
    }
  };
  self.lookOf = h => looks.get(h) || null;
  Object.assign(self, {root, coach, actors, group, solids:[...solids, ...bodies], loop:{x0, x1, z0, z1, path:loop, obst}});
  return self;
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
  // from where the camera is (in third person that is behind you: VIEW.cx/cz), not where you stand
  const dx = x - (VIEW.cx ?? VIEW.x), dz = z - (VIEW.cz ?? VIEW.z), d = Math.hypot(dx, dz);
  if (d < 2.5) return true;                                                // right beside you: you'd notice
  if (d > 32) return false;
  return (dx*(VIEW.fx || 0) + dz*(VIEW.fz || 0))/d > .25;                  // in front of you (the view is ~105° wide)
}

/* ---------- someone at work: behind a counter, at a desk, in the office ---------- */
const JOB_ROLE = {cafe:"barista", store:"clerk", courier:"dispatcher", gym:"gym", academy:"coach", photo:"photographer", edit:"editor", video:"editor"};
/* how each job stands. A counter pose's reach is how far ahead of the feet the hands go when no counter is found in front
   (one that is: its own height, the hands ONTO it past its near edge, and the person stood a natural distance off it) */
const POSE = {manager:{mode:"idle", arms:"behind"}, shopkeeper:{mode:"counter", counter:1.05, reach:.4, onto:.16}, barista:{mode:"counter", counter:1.05, reach:.4, onto:.18, work:true},
  gym:{mode:"counter", counter:1.1, reach:.4, onto:.16},
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
  // (only the boxes within the metre ahead: the solids hash, DESIGN 3.9.5)
  SG.each(Math.min(x, x + dx) - .01, Math.min(z, z + dz) - .01, Math.max(x, x + dx) + .01, Math.max(z, z + dz) + .01, q => {
    if (q.off || q.y1 - y0 < .6 || q.y1 - y0 > 1.3 || q.y0 - y0 > .5) return;
    // a ray against the box's footprint (slabs)
    let t0 = 0, t1 = 1.0, ok = true;
    for (const [p, d, lo, hi] of [[x, dx, q.x0, q.x1], [z, dz, q.z0, q.z1]]){
      if (Math.abs(d) < 1e-6){ if (p < lo || p > hi) ok = false; continue; }
      let a = (lo - p)/d, b = (hi - p)/d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (ok && t0 <= t1 && t0 > .1 && (!best || t0 < best.d)) best = {top:q.y1 - y0, d:t0, q};
  });
  return best;
}
/* o: {role, look, pose (an animateHuman state), seed, shirt (the uniform's colour), hair, y, kit, noSolid,
       when(minute) → bool: only there at those times (they come and go while you aren't looking), minute()} */
export function staffer(x, z, ry, o = {}){
  const role = roleOf(o);
  // shop counters stand in front of the till workers; elsewhere they simply stand about
  let st = o.pose || POSE[role] || {mode:"idle"};
  if (!o.pose && st.mode === "counter" && role === "shopkeeper" && o.seed !== 11 && W.zone !== "ground") st = {mode:"idle", arms:"behind"};
  /* hands on the counter (or desk) actually in front of them: its top, and the hands a little way onto it. Someone put
     further back from it than a person stands at a counter steps up to it (to .24 m off its edge: the body clear of
     it by a hand's width), so nobody stretches out over it */
  if (!o.pose && st.mode === "counter"){
    const c = counterAhead(x, z, ry, o.y || 0);
    if (c){
      let go = Math.max(0, c.d - .24);
      // (not into anything else standing there: a bin, a stool, a wall end)
      const free = (px, pz) => { let hit = false; SG.each(px - .28, pz - .28, px + .28, pz + .28, q => !q.off && q !== c.q && q.y1 - (o.y || 0) > .15 && q.y0 - (o.y || 0) < 1.7 && px + .28 > q.x0 && px - .28 < q.x1 && pz + .28 > q.z0 && pz - .28 < q.z1 && (hit = true)); return !hit; };
      while (go > 0 && !free(x + Math.sin(ry)*go, z + Math.cos(ry)*go)) go = Math.max(0, go - .05);
      x += Math.sin(ry)*go; z += Math.cos(ry)*go;
      st = Object.assign({}, st, {counter:c.top, reach:c.d - go + (st.onto ?? .15)});
    }
  }
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
  // standing still, so they throw a real shadow (when they come or go, the sun's shadows are redrawn)
  const h = human(look, {cast:true});
  h.g.position.set(x, o.y || 0, z); h.g.rotation.y = ry;
  W.scene.add(h.g);
  animateHuman(h, 0, st); h.bw = 1; animateHuman(h, 0, st);         // already in place when you walk in
  const sol = o.noSolid ? null : solid(x - .3, x + .3, z - .3, z + .3, o.y || 0, (o.y || 0) + 1.9);
  let on = true;
  if (o.when){ on = !!o.when(dayMin(o)); h.g.visible = on; if (sol) sol.off = !on; }
  if (o.when) W.anims.push(() => {
    if (h.held) return;                          // (lent to a drill: he is where it has him, not at his post)
    const want = !!o.when(dayMin(o));
    if (want !== on && !inSight(x, z)){ on = want; h.g.visible = on; if (sol) sol.off = !on; W.shadowDirty = true; }
  });
  h.ast = st; actor(h, "staff-" + role, () => on || h.held);
  h.role = role; h.st = st;
  /* lent (training.js: the assistant coach plays the balls in): he leaves his post, and its solid with it, until he is
     given back at it */
  h.lend = () => { h.held = true; on = true; h.g.visible = true; if (sol) sol.off = true; };
  h.giveBack = () => { h.held = false; h.ast = st; if (sol) sol.off = !on; };
  h.post = {x, z, ry};
  return h;
}

/* ---------- customers: people sitting, paying, browsing ----------
   list: [{role, seed, extras (for lookFor), x, z, ry, y, state (an animateHuman state for someone who stays put), when(minute),
           solid ([w, d] footprint or false), browse:{a:[x, z], b:[x, z], face (yaw while looking at the shelf)}}]
   Nobody here moves fast or throws a sun shadow; the blob under them grounds them. They come and go with the time
   of day, but never while you are looking. */
export function regulars(list, o = {}){
  const out = [];
  list.forEach((e, i) => {
    const look = e.look || castLook(e.role || "customer", e.seed ?? (101 + i*37), e.extras || {});
    const h = human(look, {cast:false});
    h.g.position.set(e.x, e.y || 0, e.z); h.g.rotation.y = e.ry || 0;
    W.scene.add(h.g);
    const st = e.state || {mode:"idle"};
    const fp = e.solid === false ? null : e.solid || [.5, .5];
    const sol = fp ? solid(e.x - fp[0]/2, e.x + fp[0]/2, e.z - fp[1]/2, e.z + fp[1]/2, e.y || 0, (e.y || 0) + 1.8, {dyn: !!e.browse}) : null;   // a browser's box walks with them
    const P = {h, e, on:true, sol, st, t:2 + i*1.7, at:0, go:null, yaw:e.ry || 0, v:0};
    if (e.browse){ P.at = .3 + .4*((i*.618) % 1); const a = e.browse.a, b = e.browse.b; h.g.position.set(a[0] + (b[0] - a[0])*P.at, e.y || 0, a[1] + (b[1] - a[1])*P.at); P.yaw = e.browse.face; h.g.rotation.y = P.yaw; }
    animateHuman(h, 0, st); h.bw = 1;
    for (let k = 0; k < 4; k++) animateHuman(h, .1, st);
    if (e.when){ P.on = !!e.when(dayMin(o)); h.g.visible = P.on; if (sol) sol.off = !P.on; }
    h.ast = st; actor(h, "regular", () => P.on);
    P.look = {mode:"idle", look:0}; P.walk = {mode:"move", speed:0};
    out.push(P);
  });
  const track = youTracker();
  W.anims.push(dt => {
    const m = dayMin(o), me = track(dt);
    for (const P of out){
      const {h, e} = P;
      if (e.when){ const want = !!e.when(m); if (want !== P.on && !inSight(h.g.position.x, h.g.position.z)){ P.on = want; h.g.visible = want; if (P.sol) P.sol.off = !want; } }
      if (!P.on) continue;
      if (!e.browse){ h.ast = P.st; continue; }
      // browsing an aisle: stand and look at the shelf a while, then a few steps along it, out of your way
      const B = e.browse, L = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]) || 1;
      if (P.go == null){
        P.t -= dt;
        P.look.look = .35*Math.sin(h.t*.4); h.ast = P.look;
        turn(P, B.face, dt);
        if (P.t <= 0){ P.go = Math.max(0, Math.min(1, P.at + (Math.random() < .5 ? -1 : 1)*(.25 + Math.random()*.35))); if (Math.abs(P.go - P.at)*L < .3) P.go = P.at < .5 ? P.at + .4 : P.at - .4; }
      } else {
        const dir = Math.sign(P.go - P.at), x = h.g.position.x, z = h.g.position.z, ux = (B.b[0] - B.a[0])/L*dir, uz = (B.b[1] - B.a[1])/L*dir;
        // you, standing in the aisle ahead: wait for you to move (and give up after a while)
        const ax = me.x - x, az = me.z - z, ahead = ax*ux + az*uz, side = Math.abs(-ax*uz + az*ux);
        const blocked = me.here && ahead > 0 && ahead < 1.3 && side < .65;
        const want = blocked ? 0 : .75;
        P.v += (want - P.v)*(1 - Math.exp(-6*dt));
        const at1 = Math.max(0, Math.min(1, P.at + dir*P.v*dt/L)), nx = B.a[0] + (B.b[0] - B.a[0])*at1, nz = B.a[1] + (B.b[1] - B.a[1])*at1;
        // (and never a step into you)
        if (into(me, nx, nz, x, z)) P.v = 0; else P.at = at1;
        h.g.position.set(B.a[0] + (B.b[0] - B.a[0])*P.at, e.y || 0, B.a[1] + (B.b[1] - B.a[1])*P.at);
        if (P.sol){ const w = (P.sol.x1 - P.sol.x0)/2, d = (P.sol.z1 - P.sol.z0)/2, gx = h.g.position.x, gz = h.g.position.z; P.sol.x0 = gx - w; P.sol.x1 = gx + w; P.sol.z0 = gz - d; P.sol.z1 = gz + d; }
        turn(P, Math.atan2(ux, uz), dt);
        P.walk.speed = P.v; h.ast = P.walk;
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
   out at that time of day (none in the small hours); o.max (6) of them at most. Walkers glide along the line (read
   between its 20 cm samples), keep to the right of it, swing round you and round anyone coming the other way (or
   stand aside, or wait, and turn back if it stays blocked), and never step into a solid or onto a raised floor:
   every point of a route knows how far to each side it is clear. One mesh each, no sun shadow. */
const ROAD_R = .3, KEEP = .3, NEED = .62, YOU_NEED = .9;
// the ground under (x, z) (the road's surface, a pavement, a kerb) and whether a body of radius r fits there: against
// the solids and floors near one route only (fl, so)
function groundY(x, z, fl = W.floors){
  let g = .013;                                                             // the road's surface (the asphalt is laid 1 cm proud)
  for (const f of fl) if (f.h < .2 && x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.h > g) g = f.h;
  return g;
}
function clearAt(x, z, r, so = W.solids, fl = W.floors){
  for (const q of so){ if (q.off || q.y1 < .15 || q.y0 > 1.7) continue; if (x + r > q.x0 && x - r < q.x1 && z + r > q.z0 && z - r < q.z1) return false; }
  for (const f of fl) if (f.h >= .2 && x + r > f.x0 && x - r < f.x1 && z + r > f.z0 && z - r < f.z1) return false;
  return true;
}
function routeOf(pts){
  // round every corner (Chaikin, three times, cutting no more than 70 cm into a long straight), then sample every 20 cm.
  // A pause (a kerb) goes to the sample nearest where it was asked for, so no corner is left sharp for it
  let P = pts.map(p => [p[0], p[1]]);
  for (let it = 0; it < 3; it++){
    const Q = [];
    for (let i = 0; i < P.length; i++){
      const a = P[i], b = P[(i + 1) % P.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, c = Math.min(.25, .7/L);          // a corner rounded over 70 cm at most
      Q.push([a[0]*(1 - c) + b[0]*c, a[1]*(1 - c) + b[1]*c], [a[0]*c + b[0]*(1 - c), a[1]*c + b[1]*(1 - c)]);
    }
    P = Q;
  }
  // only what stands near this route is ever tested against it
  const xs = P.map(p => p[0]), zs = P.map(p => p[1]), M = 1.6;
  const bx0 = Math.min(...xs) - M, bx1 = Math.max(...xs) + M, bz0 = Math.min(...zs) - M, bz1 = Math.max(...zs) + M;
  const near = q => q.x1 > bx0 && q.x0 < bx1 && q.z1 > bz0 && q.z0 < bz1;
  // ... and through a 1 m grid, so each probe looks only at the few things in its own cells
  const grid = new Map(), key = (i, j) => i*4096 + j;
  const file = (q, kind) => { for (let i = Math.floor(q.x0); i <= Math.floor(q.x1); i++) for (let j = Math.floor(q.z0); j <= Math.floor(q.z1); j++){ const k = key(i, j); let c = grid.get(k); if (!c) grid.set(k, c = {so:[], fl:[]}); c[kind].push(q); } };
  W.solids.filter(q => near(q) && !q.off && q.y1 >= .15 && q.y0 <= 1.7).forEach(q => file(q, "so"));
  W.floors.filter(near).forEach(q => file(q, "fl"));
  const EMPTY = {so:[], fl:[]}, cell = (x, z) => grid.get(key(Math.floor(x), Math.floor(z))) || EMPTY;
  const gAt = (x, z) => groundY(x, z, cell(x, z).fl);
  const clear = (x, z, r) => { for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++){ const c = grid.get(key(i, j)); if (c && !clearAt(x, z, r, c.so, c.fl)) return false; } return true; };
  const S_ = [];
  for (let i = 0; i < P.length; i++){
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L/.2));
    for (let k = 0; k < n; k++) S_.push({x:a[0] + (b[0] - a[0])*k/n, z:a[1] + (b[1] - a[1])*k/n, pause:0, pdir:0});
  }
  for (const p of pts) if (p[2]){
    let bi = 0, bd = 1e9; S_.forEach((a, i) => { const dd = Math.hypot(a.x - p[0], a.z - p[1]); if (dd < bd){ bd = dd; bi = i; } });
    S_[bi].pause = p[2]; S_[bi].pdir = p[3] || 0;
  }
  let d = 0;
  for (let i = 0; i < S_.length; i++){
    const a = S_[i], b = S_[(i + 1) % S_.length];
    a.d = d; const L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6; a.ux = (b.x - a.x)/L; a.uz = (b.z - a.z)/L; a.len = L; d += L;
  }
  // the way the line runs AT each sample (half way between the segments either side), read smoothly between samples:
  // a walker kept to one side of the line then rounds a corner on a curve too, instead of being flicked across it
  for (let i = 0; i < S_.length; i++){ const a = S_[i], p = S_[(i - 1 + S_.length) % S_.length], tx = a.ux + p.ux, tz = a.uz + p.uz, l = Math.hypot(tx, tz) || 1; a.tx = tx/l; a.tz = tz/l; }
  // how far each side (left +, right −) of the line is clear for a body, on the same level as the line
  for (const a of S_){
    a.g0 = gAt(a.x, a.z); a.l = 0; a.r = 0;
    for (let o = .1; o <= 1.01 && clear(a.x - a.uz*o, a.z + a.ux*o, ROAD_R) && Math.abs(gAt(a.x - a.uz*o, a.z + a.ux*o) - a.g0) < .05; o += .1) a.l = o;
    for (let o = .1; o <= 1.01 && clear(a.x + a.uz*o, a.z - a.ux*o, ROAD_R) && Math.abs(gAt(a.x + a.uz*o, a.z - a.ux*o) - a.g0) < .05; o += .1) a.r = o;
    a.ok = clear(a.x, a.z, ROAD_R - .04);
  }
  const pauses = S_.filter(a => a.pause), N_ = S_.length;
  const idx = s => { let lo = 0, hi = N_ - 1; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (S_[m].d <= s) lo = m; else hi = m - 1; } return lo; };
  return {S:S_, len:d, pauses, ground:gAt,
    // the point at distance s round the loop, read BETWEEN the samples (a walker glides, it doesn't hop 20 cm at a time):
    // position, the way the line runs, and the room either side (the narrower of the two samples it lies between)
    at(s, out = {}){
      s = ((s % d) + d) % d; const i = idx(s), A = S_[i], Bq = S_[(i + 1) % N_], t = Math.min(1, (s - A.d)/A.len);
      const tx = A.tx + (Bq.tx - A.tx)*t, tz = A.tz + (Bq.tz - A.tz)*t, tl = Math.hypot(tx, tz) || 1;
      out.x = A.x + (Bq.x - A.x)*t; out.z = A.z + (Bq.z - A.z)*t; out.ux = tx/tl; out.uz = tz/tl; out.g0 = t < .5 ? A.g0 : Bq.g0;
      out.l = Math.min(A.l, Bq.l); out.r = Math.min(A.r, Bq.r); out.i = i; out.s = s;
      return out;
    },
    // the room either side of the line over the next len metres going dir (−1: back round the loop)
    room(s, dir, len){
      s = ((s % d) + d) % d; let i = idx(s), l = 9, r = 9, k = 0;
      if (dir < 0) i = (i + 1) % N_;
      for (let gone = 0; gone <= len && k < N_; k++){ const a = S_[i]; l = Math.min(l, a.l); r = Math.min(r, a.r); gone += a.len; i = (i + dir + N_) % N_; }
      return [l, r];
    }};
}
export function pedestrians(o){
  const routes = o.routes.map(routeOf), walkers = [];
  const bad = routes.reduce((n, R) => n + R.S.filter(a => !a.ok).length, 0);                 // route points not clear (a test reads it)
  // how many walk at once: the route's own count by the time of day, at most the preset's people for the place (DESIGN
  // 1.4.4 GFX.P.peds, read at use time so a preset change applies at once; o.zone "home" or "town")
  const pedCap = () => { const P = typeof GFX === "object" && GFX && GFX.P, c = P && P.peds ? P.peds[o.zone || "home"] : null; return c == null ? Infinity : c; };
  const N = o.max ?? 6, wantNow = () => Math.min(N, pedCap(), Math.max(0, Math.round(o.count(dayMin(o)))));
  const first = wantNow();
  // a walker put at w.s on its route (on the ground there, w.lat to the side of the line)
  const put = w => { const R = w.R, a = R.at(w.s = ((w.s % R.len) + R.len) % R.len, w.b), x = a.x - a.uz*w.lat, z = a.z + a.ux*w.lat; w.y = R.ground(x, z); w.h.g.position.set(x, w.y, z); };
  /* the walker's body as a solid (25 cm each way, head high), wherever it is now: off while they aren't out, and never
     switched on while it overlaps you, so it can't close round you and trap you (follow()). Nor do they ever step
     into you (into(), in the walk below): they ease up, step aside, or stand where they are until you move */
  const track = youTracker();
  let M = null;                                                         // where you are this step (track())
  const body = w => { const p = w.h.g.position; follow(w.sol, M || fixNow(), p.x, p.z, w.y, w.on); };
  for (let i = 0; i < N; i++){
    const R = routes[i % routes.length], dir = (i >> 1) % 2 ? -1 : 1;
    const look = castLook("pedestrian", (o.seed || 500) + i*131);
    const h = human(look, {cast:false});
    W.scene.add(h.g);
    const w = {h, R, dir, s:R.len*((i*.37 + .11) % 1), v:0, base:1.2 + ((i*.29) % 1)*.35, lat:-KEEP*dir, yaw:null, on:false, pause:0, cool:0, wait:0, px:null, pz:null, y:0, b:{}, sol:null};
    put(w);
    h.g.rotation.y = Math.atan2(w.b.ux*dir, w.b.uz*dir);
    // the ones out at this hour are already out when you arrive (nothing has been drawn yet, so nobody sees them
    // appear); after that they come and go only where you can't see
    w.on = i < first; h.g.visible = w.on;
    if (w.on) animateHuman(h, 0, {mode:"move", speed:w.base});
    // drawn by the scheduler while out: walking (told its pace; its legs measure the way it really goes), or stood at
    // a kerb looking both ways
    w.go = {mode:"move", speed:w.base}; w.kerb = {mode:"idle", look:0}; h.ast = w.go;
    actor(h, "walker", () => w.on);
    walkers.push(w);
    // a body you bump into, not walk through (see body() below)
    w.sol = solid(0, 0, 0, 0, 0, 1.8); w.sol.off = true; body(w);
  }
  /* when you arrive (off the bus, out of a door) nobody is standing in your face: before the first frame of the place is
     drawn, anyone within 1.5 m of where you are, or of the line from the camera to you (third person), moves on along
     their way until they are clear. Nothing has been seen yet, so nobody sees them move */
  onFirstView(V => {
    const ax = V.x, az = V.z, bx = V.x + (V.fx || 0)*3.2, bz = V.z + (V.fz || 0)*3.2;
    const near = (x, z) => segPt(x, z, ax, az, bx, bz) < 1.5;
    for (const w of walkers){
      if (!w.on || !near(w.h.g.position.x, w.h.g.position.z)) continue;
      const s0 = w.s;
      for (let k = 1; k <= 60; k++){
        // try ahead of them first, then behind, a little further each time
        w.s = s0 + w.dir*(k % 2 ? 1 : -1)*Math.ceil(k/2)*.5; put(w);
        if (!near(w.h.g.position.x, w.h.g.position.z)) break;
      }
      w.px = null; w.h.g.rotation.y = w.yaw = Math.atan2(w.b.ux*w.dir, w.b.uz*w.dir); body(w);
      w.h.g.updateMatrixWorld(true);
    }
  });
  const ob = [], TMP = {}, TMP2 = {};
  W.anims.push(dt => {
    if (!(dt > 0)) return;
    // where you are, and how you are moving (so someone you come up on from behind or beside can tell)
    const want = wantNow(), me = M = track(dt), here = me.here;
    walkers.forEach((w, i) => {
      const h = w.h, should = i < want;
      if (should !== w.on && !inSight(h.g.position.x, h.g.position.z)){ w.on = should; h.g.visible = should; if (should){ w.v = 0; w.yaw = null; w.px = null; } }
      if (!w.on){ w.sol.off = true; return; }
      const R = w.R, a = R.at(w.s, w.b), fx = a.ux*w.dir, fz = a.uz*w.dir;
      // a pause at a kerb: stand, look one way and the other, then go
      if (w.pause > 0){
        w.pause -= dt; w.v = 0;
        w.kerb.look = Math.sin((1.6 - w.pause)*2.4)*.7; h.ast = w.kerb;
        body(w);
        return;
      }
      /* who is in the way ahead: you, and anyone coming the other way (or on the other loop). Each is measured
         from the line itself (lat 0), across it (pl, + to the line's left) and along it (ahead). The nearest one
         that the walker's line would brush decides: it steps to whichever side of them is nearer and has room,
         else slows and waits (standing aside where there's room); held up for a few seconds it turns back. Two walkers
         meeting each step their own way. */
      const [rl, rr] = R.room(w.s, w.dir, 3.2), lo = -rr, hi = rl;
      let latT = -KEEP*w.dir, slow = 0, close = 9;
      // (you get a little more room than another walker would: a stranger passing a pace off your shoulder, not brushing it)
      ob.length = 0;
      if (here) ob.push(me.x, me.z, YOU_NEED);
      for (const q of walkers) if (q !== w && q.on && (q.R !== R || q.dir !== w.dir)) ob.push(q.h.g.position.x, q.h.g.position.z, NEED);
      let best = null;
      for (let k = 0; k < ob.length; k += 3){
        const dx = ob[k] - a.x, dz = ob[k + 1] - a.z, ahead = dx*fx + dz*fz, pl = -dx*a.uz + dz*a.ux, need = ob[k + 2];
        if (ahead < -.3 || ahead > 3.2 || Math.abs(pl - w.lat) > 2) continue;
        // right in front, still not clear of it: ease up, and stop short of touching
        if (ahead > 0 && Math.abs(pl - w.lat) < NEED*.85) close = Math.min(close, ahead);
        if (Math.abs(pl - latT) < need && (!best || ahead < best[0])) best = [ahead, pl, need];
      }
      let aside = false;
      if (best){
        const [ahead, pl, need0] = best;
        // the room it would like, if the way ahead has it; else the least it needs
        let need = need0, left = pl + need, right = pl - need, okL = left <= hi, okR = right >= lo;
        if (!okL && !okR && need > NEED){ need = NEED; left = pl + need; right = pl - need; okL = left <= hi; okR = right >= lo; }
        if (okL && (!okR || Math.abs(left - w.lat) < Math.abs(right - w.lat))) latT = left;
        else if (okR) latT = right;
        else {
          // no way past along the next few metres: stop a good pace short, and if there's room to one side right
          // here, stand aside there and let them by
          slow = 1 - Math.max(0, Math.min(1, (ahead - 1.1)/1.4));
          const l2 = pl + need <= a.l, r2 = pl - need >= -a.r;
          if (l2 || r2){ latT = l2 && (!r2 || Math.abs(pl + need - w.lat) < Math.abs(pl - need - w.lat)) ? pl + need : pl - need; aside = true; }
        }
      }
      if (close < 9) slow = Math.max(slow, 1 - Math.max(0, Math.min(1, (close - .5)/.7)));
      // and you, near the body itself and in the way it is going (whichever way you came at it): ease right down
      if (here){ const p = h.g.position, dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz), ah = dx*fx + dz*fz;
        if (ah > 0 && d < 1.3 && Math.abs(-dx*fz + dz*fx) < .8) slow = Math.max(slow, 1 - Math.max(0, Math.min(1, (d - .7)/.6))); }
      /* you, beside them or coming up behind (they only look ahead above): close by and closing on them, or right at
         their shoulder, they step across to give you room: to the far side of the line from you, if there's room here */
      if (here){
        const p = h.g.position, dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz), ahead = dx*fx + dz*fz;
        const closing = d > 1e-3 ? (w.v*ahead - me.vx*dx - me.vz*dz)/d : 0;          // how fast the gap shrinks
        if (ahead < .3 && d < 1.8 && (d < 1 || closing > .5)){
          // which way: away from you, chosen once and kept while you're there (no dithering across your line)
          const pl = -(me.x - a.x)*a.uz + (me.z - a.z)*a.ux;
          if (!w.dodge) w.dodge = pl >= w.lat ? -1 : 1;
          const want2 = pl + w.dodge*NEED*1.1;
          latT = Math.max(-a.r, Math.min(a.l, want2)); aside = true;
        } else if (d > 2.2) w.dodge = 0;
      }
      latT = aside ? Math.max(-a.r, Math.min(a.l, latT)) : Math.max(lo, Math.min(hi, latT));
      const latP = w.lat;                                                   // where it was across the line last step
      // a side-step is a few paces, not a skip: at most .9 m/s across
      w.lat += Math.max(-.9*dt, Math.min(.9*dt, (latT - w.lat)*(1 - Math.exp(-3*dt))));
      // still wider than the way ahead allows (just turned round, say): ease up until it has stepped in
      { const out = Math.max(lo - w.lat, w.lat - hi, 0); if (out > .02 && !aside) slow = Math.max(slow, Math.min(1, out/.35)); }
      // the one in front, going the same way: don't walk up their heels
      // (it stops a pace behind them: when they stop at a kerb, it waits there too)
      for (const q of walkers){ if (q === w || !q.on || q.R !== R || q.dir !== w.dir) continue; let gap = (q.s - w.s)*w.dir; gap = ((gap % R.len) + R.len) % R.len; if (gap < 1.8) slow = Math.max(slow, Math.min(1, (1.8 - gap)/.8)); }
      // held up too long: turn back (not all at once: two who meet where neither can pass don't both give up)
      if ((slow > .95 && !aside) || w.held){ if ((w.wait += dt) > 2.5 + (i % 3)*1.6){ w.dir = -w.dir; w.wait = 0; } } else w.wait = 0;
      const vt = w.base*(1 - slow);
      w.v += (vt - w.v)*(1 - Math.exp(-(vt < w.v ? 7 : 4)*dt));
      // on along the line, at the body's own pace (on the outside of a bend the offset path is longer, inside shorter);
      // a pause point passed on the way (for this direction) stops it right there
      const ahd = R.at(w.s + w.dir*.1, TMP), ox = (ahd.x - ahd.uz*w.lat) - (a.x - a.uz*w.lat), oz = (ahd.z + ahd.ux*w.lat) - (a.z + a.ux*w.lat);
      const s0 = w.s, step = w.v*dt*.1/Math.max(.04, Math.hypot(ox, oz));
      let s1 = s0 + w.dir*step;
      w.cool -= dt;
      if (w.cool <= 0) for (const p of R.pauses){
        if (p.pdir && p.pdir !== w.dir) continue;
        const gone = (((p.d - s0)*w.dir % R.len) + R.len) % R.len;
        if (gone > 1e-6 && gone <= step){ s1 = p.d; w.pause = p.pause; w.cool = 12; break; }
      }
      w.s = ((s1 % R.len) + R.len) % R.len;
      let b = R.at(w.s, w.b);
      { const c = Math.max(-b.r, Math.min(b.l, w.lat)); w.lat += Math.max(-1.5*dt, Math.min(1.5*dt, c - w.lat)); }   // never into a post, a bin or a wall
      let x = b.x - b.uz*w.lat, z = b.z + b.ux*w.lat;
      /* never a step into you (see into()): if the step would take it nearer, the side-step alone, or the step on along
         the line alone; failing both, it stands where it is, and its legs stop with it */
      w.held = false;
      if (here && w.px != null && into(me, x, z, w.px, w.pz)){
        const s1n = w.s, lat1 = w.lat;
        let ok = false;
        for (const [ts, tl] of [[s0, lat1], [s1n, latP]]){
          const c = R.at(ts, TMP2), cx = c.x - c.uz*tl, cz = c.z + c.ux*tl;
          if (!into(me, cx, cz, w.px, w.pz)){ w.s = ts; w.lat = tl; b = R.at(w.s, w.b); x = cx; z = cz; ok = true; break; }
        }
        if (!ok){ w.s = s0; w.lat = latP; b = R.at(w.s, w.b); x = w.px; z = w.pz; w.held = true; }
        if (w.s === s0) w.v = 0;
      }
      // the ground under the feet, met over a few centimetres of stride (a kerb is a step up or down, not a ramp)
      const moved = w.px == null ? 1 : Math.hypot(x - w.px, z - w.pz), gy = R.ground(x, z);
      w.y += (gy - w.y)*(1 - Math.exp(-(moved/(gy > w.y ? .03 : .035) + dt*2)));
      h.g.position.set(x, w.y, z);
      // facing eases round to the way it goes (its legs measure how far it really went: gait.js)
      w.px = x; w.pz = z;
      const yaw = Math.atan2(b.ux*w.dir, b.uz*w.dir);
      if (w.yaw == null) w.yaw = yaw;
      let d = yaw - w.yaw; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2;
      w.yaw += d*(1 - Math.exp(-5*dt)); h.g.rotation.y = w.yaw;
      w.go.speed = w.v; h.ast = w.go;
      body(w);
    });
  });
  return {walkers, routes, bad};
}
