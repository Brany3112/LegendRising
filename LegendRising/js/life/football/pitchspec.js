// js/life/football/pitchspec.js: the football pitch as numbers (Law 1), its frames, the goal and net colliders and the
// line markings. One source for the stadium (105 x 68) and the training ground (72 x 48, full-size goals and markings).
// Owner: WP-0D (pure foundations), contracts DESIGN 1.1 (coordinates) and 1.4.9; constants 1.5.1 (geometry only).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness.
//
// Frames (DESIGN 1.1). World: three.js Y up, metres, yaw 0 faces -Z. Pitch-local: origin on the centre spot, X along
// the length (goal lines at x = +-L/2), Z across (touchlines at z = +-Wd/2), grass top at y = 0, a resting ball centre
// at y = 0.11. A pitch's frame is a pure translation: world = local + (cx, cz).
// Lines lie inside the areas they bound: every boundary is measured to the outer edge of its 0.12 m line.

export const dirOf = yaw => ({x: -Math.sin(yaw), z: -Math.cos(yaw)});   // facing vector, as drills.js fwd()
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
export const wrapA = a => { a = (a + Math.PI) % (2*Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };
// facing +X, right is +Z; facing -Z (yaw 0), right is +X

// FIFA dimensions (metres). goalW and goalH are between the inner faces of the posts and under the bar.
export const FIFA = {L:105, Wd:68, line:0.12, goalW:7.32, goalH:2.44, postR:0.06, netDepth:2.0, netBackH:1.90, boxD:16.5,
  boxHalfW:20.16, sixD:5.5, sixHalfW:9.16, spot:11, arcR:9.15, circleR:9.15, cornerR:1, flagH:1.5, ballR:0.11};

// the two pitches the game plays on (DESIGN 1.1 table): size and where the frame sits in its zone's world
export const PITCHES = {
  stadium: {L:105, Wd:68, cx:0, cz:0},
  ground: {L:72, Wd:48, cx:0, cz:-28}      // near touchline at world z = -4 (unchanged), far one at z = -52
};

// stadium advertising boards (DESIGN 1.1): 0.9 m high at z = +-38.0 and x = +-57.5, restitution 0.5
export const BOARDS = {hx:57.5, hz:38.0, h:0.9, e:0.5};

// how far players may run off the field (DESIGN 3.1.5 step 7): |x| <= L/2 + 5, |z| <= Wd/2 + 4
export const RUNOFF = {x:5, z:4};

// a translation-only frame: pitch-local (x, z) to the zone's world and back
export function makeFrame({cx = 0, cz = 0} = {}){
  return {
    cx, cz,
    toWorld: (x, z) => ({x: x + cx, z: z + cz}),
    toLocal: (wx, wz) => ({x: wx - cx, z: wz - cz})
  };
}

// team-relative frame (tactics only): u from the team's own goal line (0) to the opponents' (L), w from the attacking
// team's left touchline (0) to its right (Wd); dir = +1 when the team attacks +X. Facing +X, left is -Z.
export function toLocal(dir, u, w, L, Wd){ return {x: dir*(u - L/2), z: dir*(w - Wd/2)}; }
export function toTeam(dir, x, z, L, Wd){ return {u: dir*x + L/2, w: dir*z + Wd/2}; }
// a formation anchor from js/data/positions.js (x 0..100 left to right, y 0..100 own goal to theirs) in team frame
export function anchorOf(pos, L, Wd){ return {u: pos.y/100*L, w: pos.x/100*Wd}; }

// a plane {n, d, bounds}: points p with n.p = d; n is a unit normal. For a net panel n points into the goal (the side
// the ball belongs on), so the signed distance of a ball centre is n.p - d and a panel is penetrated where that is under
// the ball radius. For a board, n points towards the pitch. bounds is the panel's axis-aligned box
// {x0, x1, y0, y1, z0, z1}; quad lists its four corners in order (an addition to the 1.4.9 shape, for slanted panels).
function plane(n, p0, quad, extra){
  const l = Math.hypot(n[0], n[1], n[2]), u = [n[0]/l, n[1]/l, n[2]/l];
  const d = u[0]*p0[0] + u[1]*p0[1] + u[2]*p0[2];
  const xs = quad.map(q => q[0]), ys = quad.map(q => q[1]), zs = quad.map(q => q[2]);
  const bounds = {x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs)};
  return Object.assign({n: u, d, bounds, quad}, extra || {});
}

// boards: null (none), true (the stadium layout of BOARDS), or {hx, hz, h, e, gaps}. gaps lists stretches with no board
// (in front of the dugouts): [{side: 'z+'|'z-'|'x+'|'x-', a0, a1}] where a0..a1 runs along the board (x for the z
// boards, z for the x boards), in pitch-local metres.
function boardPlanes(boards){
  if (!boards) return [];
  const B = boards === true ? BOARDS : Object.assign({}, BOARDS, boards);
  const gaps = (boards === true ? null : boards.gaps) || [];
  const out = [];
  const sides = [
    {side:'z+', fixed:B.hz, span:B.hx, n:[0, 0, -1]},
    {side:'z-', fixed:-B.hz, span:B.hx, n:[0, 0, 1]},
    {side:'x+', fixed:B.hx, span:B.hz, n:[-1, 0, 0]},
    {side:'x-', fixed:-B.hx, span:B.hz, n:[1, 0, 0]}
  ];
  for (const s of sides){
    // the stretches of this side left after the gaps are cut out
    let runs = [[-s.span, s.span]];
    for (const g of gaps){
      if (g.side !== s.side) continue;
      const a0 = Math.min(g.a0, g.a1), a1 = Math.max(g.a0, g.a1), next = [];
      for (const [r0, r1] of runs){
        if (a1 <= r0 || a0 >= r1){ next.push([r0, r1]); continue; }
        if (a0 > r0) next.push([r0, a0]);
        if (a1 < r1) next.push([a1, r1]);
      }
      runs = next;
    }
    for (const [r0, r1] of runs){
      if (r1 - r0 < 1e-6) continue;
      const alongX = s.side[0] === 'z';
      const P = (a, y) => alongX ? [a, y, s.fixed] : [s.fixed, y, a];
      out.push(plane(s.n, P(r0, 0), [P(r0, 0), P(r1, 0), P(r1, B.h), P(r0, B.h)], {e: B.e, side: s.side}));
    }
  }
  return out;
}

// The whole pitch for a size and a frame. roll is the rolling deceleration of the grass (1.5.1, by tier).
// PitchSpec (1.4.9) = {L, Wd, hx, hz, frame, roll, goals, colliders, lines, spots, areas, spareCones}
// plus these additions: line, ballR, goalX (the ball centre crossing that scores or goes out over a goal line),
// touchZ (the ball centre crossing that goes out over a touchline), runoff {hx, hz}, arcHalf (radians).
export function makePitch({L = FIFA.L, Wd = FIFA.Wd, cx = 0, cz = 0, roll = 1.1, boards = null} = {}){
  const F = FIFA, hx = L/2, hz = Wd/2, ln = F.line, hl = ln/2, R = F.ballR;
  const mouthHalf = F.goalW/2;                       // 3.66: inner faces of the posts
  const postX = hx - hl, postZ = mouthHalf + F.postR; // 52.44, 3.72: post centres sit on the goal line
  const barY = F.goalH + F.postR;                    // 2.50: crossbar centre (underside 2.44)
  const backX = postX + F.netDepth;                  // 54.44: the back of the net

  const goals = [], posts = [], bars = [], nets = [];
  for (const end of [-1, 1]){
    goals.push({end, lineX: end*hx, postX: end*postX, post: [{x: end*postX, z: -postZ}, {x: end*postX, z: postZ}], barY, mouthHalf});
    posts.push({x: end*postX, z: -postZ, r: F.postR, y0: 0, y1: barY, end});
    posts.push({x: end*postX, z: postZ, r: F.postR, y0: 0, y1: barY, end});
    bars.push({x: end*postX, z0: -postZ, z1: postZ, y: barY, r: F.postR, end});
    // net panels: back, roof (from the bar down to the back top), two sides. Normals point into the goal volume.
    const px = end*postX, bx = end*backX, H = F.netBackH;
    const back = plane([-end, 0, 0], [bx, 0, 0], [[bx, 0, -postZ], [bx, 0, postZ], [bx, H, postZ], [bx, H, -postZ]], {part:'back'});
    // roof: through (px, barY) and (bx, H), running along (rdx, rdy) in the x-y plane; its inward normal is
    // perpendicular to that and points down, towards the pitch side of the goal
    const rdx = bx - px, rdy = H - barY;
    const roofN = [-end*Math.abs(rdy), -Math.abs(rdx), 0];
    const roof = plane(roofN, [px, barY, 0], [[px, barY, -postZ], [px, barY, postZ], [bx, H, postZ], [bx, H, -postZ]], {part:'roof'});
    const sideA = plane([0, 0, 1], [px, 0, -postZ], [[px, 0, -postZ], [bx, 0, -postZ], [bx, H, -postZ], [px, barY, -postZ]], {part:'side'});
    const sideB = plane([0, 0, -1], [px, 0, postZ], [[px, 0, postZ], [bx, 0, postZ], [bx, H, postZ], [px, barY, postZ]], {part:'side'});
    nets.push({end, planes: [back, roof, sideA, sideB]});
  }

  // line markings: centre lines of the 0.12 m strips, every one inside the area it bounds
  const lines = [];
  const seg = (x0, z0, x1, z1, tag) => lines.push({type:'seg', x0, z0, x1, z1, tag});
  const arc = (ccx, ccz, r, a0, a1, tag) => lines.push({type:'arc', cx: ccx, cz: ccz, r, a0, a1, tag});
  // touchlines run the full length (their ends square off the corners); goal lines run between them
  seg(-hx, -(hz - hl), hx, -(hz - hl), 'touch');
  seg(-hx, hz - hl, hx, hz - hl, 'touch');
  seg(-(hx - hl), -(hz - ln), -(hx - hl), hz - ln, 'goal');
  seg(hx - hl, -(hz - ln), hx - hl, hz - ln, 'goal');
  seg(0, -(hz - ln), 0, hz - ln, 'halfway');
  arc(0, 0, F.circleR - hl, 0, 2*Math.PI, 'circle');
  const arcHalf = Math.acos(F.boxD - F.spot <= F.arcR ? (F.boxD - F.spot)/F.arcR : 1);   // 53.05 degrees
  const box = [], six = [], pens = [];
  for (const end of [-1, 1]){
    const gl = end*(hx - ln);                         // inner edge of the goal line
    // penalty area: front at 16.5 from the goal line's outer edge, sides at 20.16
    const bf = end*(hx - F.boxD), bfc = end*(hx - F.boxD + hl), bw = F.boxHalfW;
    seg(bfc, -bw, bfc, bw, 'box');
    seg(bf, -(bw - hl), gl, -(bw - hl), 'box');
    seg(bf, bw - hl, gl, bw - hl, 'box');
    box.push({end, x0: Math.min(bf, end*hx), x1: Math.max(bf, end*hx), z0: -bw, z1: bw, front: bf});
    // goal area: front at 5.5, sides at 9.16
    const sf = end*(hx - F.sixD), sfc = end*(hx - F.sixD + hl), sw = F.sixHalfW;
    seg(sfc, -sw, sfc, sw, 'six');
    seg(sf, -(sw - hl), gl, -(sw - hl), 'six');
    seg(sf, sw - hl, gl, sw - hl, 'six');
    six.push({end, x0: Math.min(sf, end*hx), x1: Math.max(sf, end*hx), z0: -sw, z1: sw, front: sf});
    // penalty spot and the arc outside the area (outer edge radius 9.15 around the spot)
    const sx = end*(hx - F.spot);
    pens.push({x: sx, z: 0, r: R, end});
    const facing = end > 0 ? Math.PI : 0;             // the arc bulges towards the halfway line
    arc(sx, 0, F.arcR - hl, facing - arcHalf, facing + arcHalf, 'arc');
  }
  // corner arcs: radius 1 to the outer edge, a quarter circle into the field from each corner
  for (const sxn of [-1, 1]) for (const szn of [-1, 1]){
    // the quarter whose directions point to (-sxn, -szn)
    const a0 = sxn > 0 ? (szn > 0 ? Math.PI : Math.PI/2) : (szn > 0 ? 1.5*Math.PI : 0);
    arc(sxn*hx, szn*hz, F.cornerR - hl, a0, a0 + Math.PI/2, 'corner');
  }

  // spare balls on cones (D14): two behind each goal, one beside each touchline in each half
  const spareCones = [];
  for (const end of [-1, 1]) for (const zs of [-1, 1]) spareCones.push({x: end*(hx + 3), z: zs*Math.min(12, hz - 2)});
  for (const xs of [-1, 1]) for (const zs of [-1, 1]) spareCones.push({x: xs*hx/2, z: zs*(hz + 2)});

  return {
    L, Wd, hx, hz, frame: makeFrame({cx, cz}), roll,
    line: ln, ballR: R, goalX: hx + R, touchZ: hz + R, runoff: {hx: hx + RUNOFF.x, hz: hz + RUNOFF.z}, arcHalf,
    goals,
    colliders: {posts, bars, nets, boards: boardPlanes(boards)},
    lines,
    spots: {centre: {x: 0, z: 0, r: 0.15}, penalty: pens},
    areas: {box, six},
    spareCones
  };
}

// the frame of a named pitch, and a whole spec for it
export const pitchOf = (name, opts = {}) => makePitch(Object.assign({}, PITCHES[name], opts));

// inside the penalty area at an end (-1 or +1), its lines included (a ball on the line is in the area)
export function inBox(spec, end, x, z){
  const ex = end*x;
  return ex >= spec.hx - FIFA.boxD && ex <= spec.hx && Math.abs(z) <= FIFA.boxHalfW;
}
// inside the goal area at an end, its lines included
export function inSix(spec, end, x, z){
  const ex = end*x;
  return ex >= spec.hx - FIFA.sixD && ex <= spec.hx && Math.abs(z) <= FIFA.sixHalfW;
}
// which end's half a point is in: -1 or +1 (x = 0 counts as +1)
export function side(spec, x){ return x < 0 ? -1 : 1; }
// the half by Law 11 terms: -1 or +1, or 0 on the halfway line itself (its 0.12 m strip), which belongs to neither
// half for offside purposes ("in the opponents' half, excluding the halfway line")
export function half(spec, x){ return Math.abs(x) <= FIFA.line/2 ? 0 : x < 0 ? -1 : 1; }
// on the field of play (lines included)
export function onField(spec, x, z){ return Math.abs(x) <= spec.hx && Math.abs(z) <= spec.hz; }
