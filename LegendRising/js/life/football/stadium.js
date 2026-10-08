/* ============ Football: the stadium ============
   Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 1.4.17 (stadium.js: registerZone("stadium")),
   D19, spec 3.3.1 (layout), 3.3.2 (tiers), 3.3.4 (lighting), budgets 1.5.11; the pitch from pitchspec.js (1.1).

   The zone "stadium": world frame = pitch frame (DESIGN 1.1), the centre spot at the origin, X along the length.
   enterZone("stadium", "dressing", {f, tier, crowd, cap, kits, clubs, homeShare, on}) builds, behind the fade:
     the pitch      105 x 68 from makePitch (goals 7.32 x 2.44 between the inner faces), mown and worn by tier
     the boards     0.9 m high at z = +-38 and x = +-57.5, a gap from x = -14 to 14 in front of the dugouts (the ball's
                    colliders are pitchspec's boards with that same gap; these are their pictures and the players' solids)
     the dugouts    covered benches at z = -37, x = -10 (home) and 10 (away), 8 seats each, technical areas painted
     the fourth official's place at (0, -35.5); the tunnel mouth at (0, -41) under the main stand, the corridor
                    x -2.5 to 2.5 from z = -66 to -41 lit by strips; the dressing room x -9 to 9, z -78 to -66
     the stands     by tier (stadiumFor(f).tier, match.js): 0 a local ground (a rail, one small covered stand, grass
                    banks), 1 two side stands, 2 four single-tier stands with open corners, 3 a two-tier bowl, 4 a
                    three-tier enclosed bowl under a roof ring; rows 0.8 m deep and 0.4 m up (the upper tiers steeper),
                    the first row 2 m behind the boards at 1.0 m; empty seats are drawn, the fans are crowd.js
     the lights     floodlight masts (tiers 0 to 2), roof strips (2), a roof ring (3, 4): emissive heads that the sky
                    turns up at night, its flood key light (sky.setNightKey) in the sun's place; no point light at all on
                    Low and Medium, two on High (the tunnel and the dugouts)
   spawns = {dressing, tunnelDoor, tunnelMouth, benchHome, benchAway, fourth, exit}; W.bounds = {x0:-64, x1:64, z0:-80,
   z1:50}. STADIUM (exported) holds what the match needs of the place: the pitch spec, the spare-ball cones, the crowd,
   the scoreboard, the bench seats; STADIUM.excite(v) works the crowd (and its sound) up or down.
   opts.on = {ready(), door(), bench(side), leave()}: the match controller's hands on the place's own spots (the
   dressing room, the tunnel door, the benches, the way out); a spot exists only when its handler is given. */
import {THREE, W, box, rbox, cyl, extrude, solid, wall, doorway, spot, textTex, label, labels, addGeo, reseed, rnd, finishBatches, lightSrc, halo, mat} from "../build.js";
import {frame, rb, cy, fsolid, worldPt, dugout, tacticsBoard, waterCooler, kitHamper, tree, wireFence} from "../props.js";
import {registerZone} from "../core/modes.js";
import {onPresetSwap} from "../core/quality.js";
import {RT, P} from "../core/state.js";
import {makePitch, FIFA, BOARDS, ROLL as PITCH_ROLL} from "./pitchspec.js";
import {buildPitchMesh, WEAR} from "./pitchmesh.js";
import {buildCrowd} from "./crowd.js";
import {AUD} from "./audio.js";

// rolling deceleration of the grass by tier (DESIGN 1.5.1: pitchspec's table, the one the simulation reads too) and the
// seats each tier is built with (3.3.2)
export const ROLL = PITCH_ROLL;
export const SEATS = [300, 6000, 28000, 50000, 82000];
export const TIER_NAME = ["Local ground", "Small stadium", "Stadium", "Big stadium", "Giant arena"];
export const BOUNDS = {x0:-64, x1:64, z0:-80, z1:50};
// the boards' gap in front of the dugouts: pitchspec's stadium layout (BOARDS.gaps), the one the ball meets
export const BOARD_GAPS = BOARDS.gaps;
export const SPAWNS = {
  dressing:{x:0, z:-74, y:0, yaw:Math.PI}, tunnelDoor:{x:0, z:-66, y:0, yaw:Math.PI}, tunnelMouth:{x:0, z:-42, y:0, yaw:Math.PI},
  benchHome:{x:-10, z:-37.4, y:0, yaw:Math.PI}, benchAway:{x:10, z:-37.4, y:0, yaw:Math.PI}, fourth:{x:0, z:-35.5, y:0, yaw:Math.PI},
  exit:{x:0, z:-72, y:0, yaw:0}
};
const ROW = {d:.8, h:.4, y0:1.0};
const Z0 = BOARDS.hz + 2, X0 = BOARDS.hx + 2;          // the front edge of the first row: 2 m behind the boards
const MOUTH = {x:3.0, rows:5};                        // the tunnel's cut through the main stand's first rows
const COR = {x:2.5, z0:-66, z1:-44, h:2.9};           // the corridor under the main stand
// the batch keys of the rooms under the main stand, lit by their own ceiling panels (see W.glows in buildStadium)
const INNER = ["t:tiles", "t:rubberFloor", "t:paint"];

export const STADIUM = {tier:-1, spec:null, pitch:null, crowd:null, stands:[], bench:[], cones:[], att:0, level:0, excitement:.15,
  board:null, spawns:SPAWNS,
  // the crowd, all of it, worked up (0 calm to 1 on its feet): the picture and the sound
  excite(v){ STADIUM.excitement = Math.max(0, Math.min(1, +v || 0)); if (STADIUM.crowd) STADIUM.crowd.setExcite("all", STADIUM.excitement); },
  // the scoreboard: names, score and minute
  score(o){ if (STADIUM.board) STADIUM.board.draw(o); }
};

/* ---------- small geometry: flat quads poured into the batches ---------- */
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
function pour(){
  const P_ = [], N_ = [];
  const api = {
    // a quad a b c d (any winding), facing along hint [x, y, z]. bent: the normal it is lit by instead of its own (a
    // roof's underside lit as the light bounced up off the pitch reaches it, not as a floor facing the ground)
    quad(a, b, c, d, hint, bent = null){
      _u.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_u, _v);
      if (_n.lengthSq() < 1e-12){ _v.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); _n.crossVectors(_u, _v); }
      if (_n.lengthSq() < 1e-12) return api;
      _n.normalize();
      let q = [a, b, c, d];
      if (hint && _n.x*hint[0] + _n.y*hint[1] + _n.z*hint[2] < 0){ q = [a, d, c, b]; _n.negate(); }
      if (bent){ _n.set(bent[0], bent[1], bent[2]).normalize(); }
      for (const i of [0, 1, 2, 0, 2, 3]){ P_.push(q[i][0], q[i][1], q[i][2]); N_.push(_n.x, _n.y, _n.z); }
      return api;
    },
    // into the batch: one colour, the options of addGeo
    done(color, o = {}){
      if (!P_.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P_, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N_, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(P_.length/3*2), 2));
      addGeo(g, color, Object.assign({ao:false, jit:0}, o));
      P_.length = 0; N_.length = 0;
    }
  };
  return api;
}
// a polyline's length, and the piece of it from fraction f0 to f1
function plen(pts){ let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; }
function slice(pts, f0, f1){
  const L = plen(pts), a = f0*L, b = f1*L, out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++){
    const p = pts[i], q = pts[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]), s0 = acc, s1 = acc + l;
    const at = s => { const t = l > 0 ? (s - s0)/l : 0; return [p[0] + (q[0] - p[0])*t, p[1] + (q[1] - p[1])*t]; };
    if (s1 >= a && s0 <= b){
      if (!out.length) out.push(at(Math.max(a, s0)));
      if (s1 < b) out.push([q[0], q[1]]); else { out.push(at(b)); break; }
    }
    acc = s1;
  }
  return out.length >= 2 ? out : null;
}
// the way out of the bowl at a polyline's point i (away from the pitch): its run direction turned (n = (dz, -dx) faces
// the pitch, so outward is (-dz, dx))
function outward(pts, i){
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  return [-dz/L, dx/L];
}

/* ---------- the stands ----------
   A stand is pieces of a path round the pitch, each run so that the pitch is on the side n = (dz, -dx) of it:
   at(d) gives the front edge of a row d metres back from the first row's front edge (a straight piece's two ends, or an
   arc's points). A stand's tiers stack rows on its pieces; every row is a tread and a riser of concrete, a line of
   seats and, for crowd.js, the runs of seats between the aisles */
const straight = (side, a0, a1) => {
  const L = a1 - a0;
  if (side === "z+") return {side, L, a0, a1, at:d => [[a0, Z0 + d], [a1, Z0 + d]]};
  if (side === "z-") return {side, L, a0, a1, at:d => [[a1, -(Z0 + d)], [a0, -(Z0 + d)]]};
  if (side === "x+") return {side, L, a0, a1, at:d => [[X0 + d, a1], [X0 + d, a0]]};
  return {side, L, a0, a1, at:d => [[-(X0 + d), a0], [-(X0 + d), a1]]};
};
// the stretch of a main-stand piece (z-, running towards -x) the tunnel's mouth takes out of its first rows, as
// fractions of the piece, or null when the mouth is not on it
function mouthCut(pc){
  if (pc.side !== "z-") return null;
  const f0 = Math.max(0, (pc.a1 - MOUTH.x)/pc.L), f1 = Math.min(1, (pc.a1 + MOUTH.x)/pc.L);
  return f1 > f0 ? [f0, f1] : null;
}
// an arc round (cx, cz) from angle t0 down to t1, radius r0 + d
const corner = (cx, cz, r0, t0, t1, n = 8) => ({side:"c", at:d => Array.from({length:n + 1}, (_, i) => { const t = t0 + (t1 - t0)*i/n, r = r0 + d; return [cx + r*Math.cos(t), cz + r*Math.sin(t)]; })});
// the rounded rectangle every bowl is built on: straight sides to x = +-CX and z = +-CZ, corners of radius RC
function ring(RC){
  const CX = X0 - RC, CZ = Z0 - RC, h = Math.PI/2;
  return {
    "z+":straight("z+", -CX, CX), "c++":corner(CX, CZ, RC, h, 0), "x+":straight("x+", -CZ, CZ), "c+-":corner(CX, -CZ, RC, 0, -h),
    "z-":straight("z-", -CX, CX), "c--":corner(-CX, -CZ, RC, -h, -2*h), "x-":straight("x-", -CZ, CZ), "c-+":corner(-CX, CZ, RC, 2*h, h)
  };
}

/* the tiers of the stadium. Each stand: id, pieces, tiers [{rows, rise, over (rows of the tier below it overhangs),
   lift (clearance over that row)}], roof, away (the visitors' end), standing (a terrace or a bank: no seats) */
function layout(tier){
  if (tier === 0){
    return {stands:[
      {id:"main", pieces:[straight("z-", 3.2, 16), straight("z-", -16, -3.2)], tiers:[{rows:6, rise:.4}], roof:"posts", main:true},
      {id:"bank-n", pieces:[straight("z+", -46, 46)], tiers:[{rows:5, rise:.3, y0:.3}], bank:true, standing:true},
      {id:"bank-e", pieces:[straight("x+", -24, 24)], tiers:[{rows:4, rise:.3, y0:.3}], bank:true, standing:true, away:true},
      {id:"bank-w", pieces:[straight("x-", -24, 24)], tiers:[{rows:4, rise:.3, y0:.3}], bank:true, standing:true}
    ]};
  }
  if (tier === 1){
    return {stands:[
      {id:"main", pieces:[straight("z-", -50, 50)], tiers:[{rows:15, rise:.4}], roof:"posts", main:true},
      {id:"opp", pieces:[straight("z+", -50, 50)], tiers:[{rows:15, rise:.4}], roof:"posts", awayFrom:30}
    ]};
  }
  if (tier === 2){
    const R = 42;
    return {stands:[
      {id:"main", pieces:[straight("z-", -54, 54)], tiers:[{rows:R, rise:.4}], roof:"cantilever", main:true, strip:true},
      {id:"opp", pieces:[straight("z+", -54, 54)], tiers:[{rows:R, rise:.4}], roof:"cantilever", strip:true},
      {id:"west", pieces:[straight("x-", -32, 32)], tiers:[{rows:R - 4, rise:.4}], roof:"cantilever"},
      {id:"east", pieces:[straight("x+", -32, 32)], tiers:[{rows:R - 4, rise:.4}], roof:"cantilever", away:true}
    ], masts:true};
  }
  const g = ring(tier === 3 ? 10 : 12);
  const tiers = tier === 3 ? [{rows:26, rise:.4}, {rows:30, rise:.5, over:6, lift:5.2}]
    : [{rows:26, rise:.4}, {rows:20, rise:.46, over:6, lift:4.8}, {rows:36, rise:.55, over:5, lift:5.2}];
  return {stands:[
    {id:"main", pieces:[g["z-"]], tiers, main:true},
    {id:"opp", pieces:[g["z+"]], tiers},
    {id:"west", pieces:[g["c--"], g["x-"], g["c-+"]], tiers},
    {id:"east", pieces:[g["c++"], g["x+"], g["c+-"]], tiers, away:true}
  ], bowl:true, roofRing:true, ring:g};
}
// where each tier of a stand starts: its first row's offset and height
function tierStarts(tiers){
  const out = [];
  let d = 0, y = tiers[0].y0 != null ? tiers[0].y0 : ROW.y0;
  tiers.forEach((t, i) => {
    if (i > 0){
      const prev = out[i - 1], pt = tiers[i - 1], k = Math.max(0, pt.rows - (t.over || 0));
      d = prev.d + k*ROW.d; y = prev.y + k*pt.rise + (t.lift || 5);
    }
    out.push({d, y, rows:t.rows, rise:t.rise, end:d + t.rows*ROW.d, top:y + (t.rows - 1)*t.rise});
  });
  return out;
}

// blocks of a piece: the fractions where aisles are, and the aisle's half width in metres
function blocksOf(piece, Lp){
  const n = piece.side === "c" ? 2 : Math.max(1, Math.round(Lp/14));
  return Array.from({length:n + 1}, (_, i) => i/n);
}
const SEAT_OFF = .5;            // the seat line: half a metre back from a tread's front edge

/* ---------- materials and colours ---------- */
const C = {concrete:0xb4b0a8, riser:0x9d9991, front:0x3a4048, roofTop:0x5d646b, roofUnder:0xf2f6ff, steel:0x6d757d, clad:0x8a9096,
  wallIn:0xe8e4da, aisle:0xf2c230, glass:0x2e4a5e, track:0x6d7a5c};
const css = c => typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c);
const hexOf = c => { const k = new THREE.Color(); try { k.set(css(c)); } catch(e){ k.set(0x2c66b8); } return k.getHex(); };
// a colour moved towards another
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

/* ---------- a stand ---------- */
function buildStand(st, opts){
  const tiers = tierStarts(st.tiers), seatsTop = [], rowsOut = [];
  const seatCol = opts.seatCol, alt = opts.seatAlt;
  const tread = pour(), riser = pour(), paint = pour(), backs = pour(), yellow = pour();
  const lastTier = tiers[tiers.length - 1];
  const roofed = !!st.roof || !!opts.roofRing;
  st.rowsOut = rowsOut; st.seatQuads = [];
  tiers.forEach((tr, ti) => {
    for (let k = 0; k < tr.rows; k++){
      const dF = tr.d + k*ROW.d, dB = dF + ROW.d + (k === tr.rows - 1 ? .6 : 0), y = tr.y + k*tr.rise, yPrev = k ? y - tr.rise : (ti ? y - 1.25 : 0);
      // the rows at the back under a roof are in its shade (Low has no shadow map: this is baked in)
      const shade = roofed ? 1 - .3*Math.pow((dF - tiers[0].d)/Math.max(1, lastTier.end - tiers[0].d), 1.2) : 1;
      const runs = [];
      for (const pc of st.pieces){
        const F = pc.at(dF), B = pc.at(dB), S = pc.at(dF + SEAT_OFF), Lp = plen(S);
        // the tunnel's cut through the first rows of the main stand
        const mc = st.main && ti === 0 ? mouthCut(pc) : null, cut = mc && k < MOUTH.rows ? mc : null;
        const spans = cut ? [[0, cut[0]], [cut[1], 1]] : [[0, 1]];
        for (const [s0, s1] of spans){
          if (s1 - s0 < 1e-4) continue;
          const f = s0 === 0 && s1 === 1 ? F : slice(F, s0, s1), b = s0 === 0 && s1 === 1 ? B : slice(B, s0, s1);
          if (!f || !b) continue;
          for (let i = 0; i < f.length - 1; i++){
            const o = outward(f, i);
            tread.quad([f[i][0], y, f[i][1]], [f[i + 1][0], y, f[i + 1][1]], [b[i + 1][0], y, b[i + 1][1]], [b[i][0], y, b[i][1]], [0, 1, 0]);
            // the first riser over the corridor starts at its ceiling, so the mouth is clear to the top
            if (mc && k === MOUTH.rows){
              for (const [r0, r1, lo] of [[0, mc[0], yPrev], [mc[0], mc[1], COR.h], [mc[1], 1, yPrev]]){
                if (r1 - r0 < 1e-4) continue;
                const q = slice(f, r0, r1); if (!q) continue;
                riser.quad([q[0][0], lo, q[0][1]], [q[1][0], lo, q[1][1]], [q[1][0], y, q[1][1]], [q[0][0], y, q[0][1]], [-o[0], 0, -o[1]]);
              }
            } else riser.quad([f[i][0], yPrev, f[i][1]], [f[i + 1][0], yPrev, f[i + 1][1]], [f[i + 1][0], y, f[i + 1][1]], [f[i][0], y, f[i][1]], [-o[0], 0, -o[1]]);
          }
        }
        // the seats: runs between the aisles (and either side of the tunnel's cut)
        const fr = blocksOf(pc, Lp), aw = .6/Lp, end = .25/Lp;
        for (let j = 0; j < fr.length - 1; j++){
          let a = fr[j] + (j === 0 ? end : aw), b = fr[j + 1] - (j === fr.length - 2 ? end : aw);
          const parts = [];
          if (cut && a < cut[1] && b > cut[0]){ if (a < cut[0]) parts.push([a, cut[0]]); if (b > cut[1]) parts.push([cut[1], b]); }
          else parts.push([a, b]);
          for (const [p0, p1] of parts){
            if (p1 - p0 < .5/Lp) continue;
            const pts = slice(S, p0, p1); if (!pts) continue;
            runs.push({pts, piece:pc, f0:p0, f1:p1, dF, y});
            // a yellow nosing on the step at each aisle, both sides of the block (a grass bank has none)
            if (!st.bank) for (const fa of [p0 - aw, p1]){
              if (fa < 0 || fa + aw > 1 || (j === 0 && fa < p0) || (j === fr.length - 2 && fa >= p1)) continue;
              const s = slice(F, Math.max(0, fa), Math.min(1, fa + aw)); if (!s) continue;
              const o = outward(s, 0), A = s[0], Bp = s[s.length - 1];
              yellow.quad([A[0], y + .015, A[1]], [Bp[0], y + .015, Bp[1]], [Bp[0] + o[0]*.06, y + .015, Bp[1] + o[1]*.06], [A[0] + o[0]*.06, y + .015, A[1] + o[1]*.06], [0, 1, 0]);
            }
          }
        }
      }
      tread.done(st.bank ? 0xeef4e6 : C.concrete, {tex:st.bank ? "grass" : "concrete", shade});
      riser.done(st.bank ? 0xd2dcc8 : C.riser, {tex:st.bank ? "grass" : "concrete", shade:shade*.92});
      rowsOut.push({y, runs, k, ti, shade});
    }
    // the tier's front: a wall to the pitch (open where the tunnel comes out), or an upper tier's balcony with its underside
    for (const pc of st.pieces){
      const mc = st.main && ti === 0 ? mouthCut(pc) : null;
      for (const [s0, s1] of mc ? [[0, mc[0]], [mc[1], 1]] : [[0, 1]]){
      if (s1 - s0 < 1e-4) continue;
      const whole = s0 === 0 && s1 === 1, f = whole ? pc.at(tr.d - .22) : slice(pc.at(tr.d - .22), s0, s1), g = whole ? pc.at(tr.d) : slice(pc.at(tr.d), s0, s1);
      if (!f || !g) continue;
      for (let i = 0; i < f.length - 1; i++){
        const o = outward(f, i), y0 = ti ? tr.y - 1.3 : 0, y1 = tr.y + (ti ? .95 : .15);
        paint.quad([f[i][0], y0, f[i][1]], [f[i + 1][0], y0, f[i + 1][1]], [f[i + 1][0], y1, f[i + 1][1]], [f[i][0], y1, f[i][1]], [-o[0], 0, -o[1]]);
        paint.quad([f[i][0], y1, f[i][1]], [f[i + 1][0], y1, f[i + 1][1]], [g[i + 1][0], y1, g[i + 1][1]], [g[i][0], y1, g[i][1]], [0, 1, 0]);
        if (ti){
          // the underside of an upper tier, over the back of the tier below, parallel to its rake
          const below = tiers[ti - 1], dEnd = below.end + .4, h = pc.at(dEnd), ye = tr.y + (dEnd - tr.d)/ROW.d*tr.rise - 1.3;
          paint.quad([f[i][0], y0, f[i][1]], [f[i + 1][0], y0, f[i + 1][1]], [h[i + 1][0], ye, h[i + 1][1]], [h[i][0], ye, h[i][1]], [0, -1, 0], [-o[0]*.7, -.45, -o[1]*.7]);
          // and the boxes' glass along the back of the tier below, lit from inside at night, over a parapet
          const bt = below.top + 1.2;
          backs.quad([h[i][0], bt, h[i][1]], [h[i + 1][0], bt, h[i + 1][1]], [h[i + 1][0], ye, h[i + 1][1]], [h[i][0], ye, h[i][1]], [-o[0], 0, -o[1]]);
          paint.quad([h[i][0], below.top - .05, h[i][1]], [h[i + 1][0], below.top - .05, h[i + 1][1]], [h[i + 1][0], bt, h[i + 1][1]], [h[i][0], bt, h[i][1]], [-o[0], 0, -o[1]]);
        }
      }
      }
    }
    paint.done(ti ? mix(opts.club, 0x202428, .45) : st.bank ? 0x9a978f : C.front, {tex:st.bank ? "concrete" : "paint"});
    backs.done(0x9fb2c0, {key:"lit"});
  });
  yellow.done(C.aisle, {});
  // the back of the stand: a wall from the ground (or the top of the boxes) to over the last row, holed for the corridor;
  // behind a grass bank, the bank's own slope down to the ground
  const back = pour();
  if (st.bank) for (const pc of st.pieces){
    const b = pc.at(lastTier.end), e = pc.at(lastTier.end + 3.5);
    for (let i = 0; i < b.length - 1; i++) back.quad([b[i][0], lastTier.top, b[i][1]], [b[i + 1][0], lastTier.top, b[i + 1][1]], [e[i + 1][0], 0, e[i + 1][1]], [e[i][0], 0, e[i][1]], [0, 1, 0]);
  }
  else for (const pc of st.pieces){
    const dB = lastTier.end + .6, b = pc.at(dB), top = lastTier.top + (st.roof || opts.roofRing ? 3.2 : 1.6), base = st.bank ? 0 : Math.max(0, lastTier.top - 8);
    for (let i = 0; i < b.length - 1; i++){
      const o = outward(b, i);
      // where the corridor goes through it, the wall has a hole up to the corridor's ceiling
      const hole = st.main && pc.side === "z-" && base < COR.h + .3 && b[i][0] > COR.x + .3 && b[i + 1][0] < -COR.x - .3;
      const segs = hole ? [[b[i], [COR.x + .3, b[i][1]]], [[-COR.x - .3, b[i][1]], b[i + 1]]] : [[b[i], b[i + 1]]];
      for (const [p, q] of segs){
        if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < .05) continue;
        back.quad([p[0], base, p[1]], [q[0], base, q[1]], [q[0], top, q[1]], [p[0], top, p[1]], [-o[0], 0, -o[1]]);
        back.quad([p[0], base, p[1]], [q[0], base, q[1]], [q[0], top, q[1]], [p[0], top, p[1]], [o[0], 0, o[1]]);
      }
      if (hole) for (const sg of [-1, 1]) back.quad([COR.x + .3, COR.h + .2, b[i][1]], [-COR.x - .3, COR.h + .2, b[i][1]], [-COR.x - .3, top, b[i][1]], [COR.x + .3, top, b[i][1]], [0, 0, sg]);
    }
  }
  back.done(st.bank ? 0xe2eadb : C.clad, {tex:st.bank ? "grass" : "cladding"});
  // the ends of a straight stand that stands on its own: a wall following the rake, and glass over it under a roof
  if (!opts.bowl && !st.bank){
    const ends = [];
    for (const pc of st.pieces) for (const end of [0, 1]){
      // only where the stand is open: not against the tunnel's cut
      const p = pc.at(0)[end], q = pc.at(lastTier.end + .6)[end], cutSide = st.main && pc.side === "z-" && st.pieces.length > 1 && Math.abs(p[0]) < 4;
      ends.push({p, q, cutSide, pc});
    }
    const cap = pour();
    for (const e of ends){
      const yTop = lastTier.top + (st.roof ? 3.2 : 1.6), dirx = e.q[0] - e.p[0], dirz = e.q[1] - e.p[1], L = Math.hypot(dirx, dirz) || 1;
      const nx = -dirz/L, nz = dirx/L, t = .25;
      // the wall: from the front (1.15 m up) along the rake to the back, both faces
      for (const s of [-1, 1]){
        const ox = nx*t*s/2, oz = nz*t*s/2;
        const a = [e.p[0] + ox, 0, e.p[1] + oz], b = [e.q[0] + ox, 0, e.q[1] + oz], c = [e.q[0] + ox, yTop, e.q[1] + oz], d = [e.p[0] + ox, ROW.y0 + 1.15, e.p[1] + oz];
        cap.quad(a, b, c, d, [nx*s, 0, nz*s]);
      }
      cap.quad([e.p[0] - nx*t/2, ROW.y0 + 1.15, e.p[1] - nz*t/2], [e.p[0] + nx*t/2, ROW.y0 + 1.15, e.p[1] + nz*t/2], [e.q[0] + nx*t/2, yTop, e.q[1] + nz*t/2], [e.q[0] - nx*t/2, yTop, e.q[1] - nz*t/2], [0, 1, 0]);
      cap.quad([e.p[0] - nx*t/2, 0, e.p[1] - nz*t/2], [e.p[0] + nx*t/2, 0, e.p[1] + nz*t/2], [e.p[0] + nx*t/2, ROW.y0 + 1.15, e.p[1] + nz*t/2], [e.p[0] - nx*t/2, ROW.y0 + 1.15, e.p[1] - nz*t/2], [-dirx/L, 0, -dirz/L]);
    }
    cap.done(st.bank ? 0x55803c : 0x8f8c85, {tex:st.bank ? "grass" : "concrete"});
  }
  // the players cannot climb into the stand: its front is a wall
  for (const pc of st.pieces){
    const f = pc.at(-.22), cut = st.main && mouthCut(pc) ? MOUTH.x : 0;
    for (let i = 0; i < f.length - 1; i++){
      const a = f[i], b = f[i + 1];
      if (cut && Math.abs(a[1] - b[1]) < .01){
        for (const [x0, x1] of [[Math.min(a[0], b[0]), -cut], [cut, Math.max(a[0], b[0])]]) if (x1 > x0) solid(x0, x1, a[1] - .3, a[1] + .05, 0, 2.5);
      } else {
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])/3));
        for (let s = 0; s < n; s++){ const p = [a[0] + (b[0] - a[0])*s/n, a[1] + (b[1] - a[1])*s/n], q = [a[0] + (b[0] - a[0])*(s + 1)/n, a[1] + (b[1] - a[1])*(s + 1)/n];
          solid(Math.min(p[0], q[0]) - .15, Math.max(p[0], q[0]) + .15, Math.min(p[1], q[1]) - .15, Math.max(p[1], q[1]) + .15, 0, 2.5); }
      }
    }
  }
  return {tiers, lastTier, rows:rowsOut};
}
/* the seats of every stand as one mesh: a moulded seat (pan and back) every half metre along each run, cut out of one
   small texture, coloured per block in the club's colours */
let SEAT_TEX = null;
function seatTex(){
  if (SEAT_TEX) return SEAT_TEX;
  const t = textTex(64, 128, g => {
    g.clearRect(0, 0, 64, 128);
    // the back (top half): rounded, with a lip; the pan (bottom half)
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = "#e8e8e8"; rr(5, 6, 54, 54, 12); g.fill();
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(8, 48, 48, 10);
    g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(10, 10, 44, 6);
    g.fillStyle = "#d8d8d8"; rr(4, 70, 56, 52, 10); g.fill();
    g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(6, 112, 52, 8);
  });
  t.wrapS = THREE.RepeatWrapping; t.userData.per = 1; t.userData.keep = true;
  return (SEAT_TEX = t);
}
function seatsMesh(stands, opts){
  const P_ = [], N_ = [], Cc = [], U = [], I = [];
  const col = new THREE.Color(), A = new THREE.Color(opts.seatCol), Bc = new THREE.Color(opts.seatAlt);
  let blockN = 0;
  for (const st of stands){
    if (st.bank) continue;
    for (const row of st.rowsOut) for (const run of row.runs){
      blockN++;
      // a block in the second colour here and there (a stripe of rows, the away end), the rest in the first
      const use = st.away || (row.k % 9 === 4) ? Bc : A;
      col.copy(use).multiplyScalar(row.shade);
      const pc = run.piece, y = run.y;
      const line = d => slice(pc.at(run.dF + d), run.f0, run.f1);
      const pan0 = line(.22), pan1 = line(.56), backL = line(.6);
      if (!pan0 || !pan1 || !backL) continue;
      const strip = (a, b, ya, yb, v0, v1, ny) => {
        let s = 0;
        for (let i = 0; i < a.length - 1; i++){
          const L = Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]), o = outward(a, i), base = P_.length/3;
          const nx = ny ? 0 : -o[0], nyy = ny ? 1 : 0, nz = ny ? 0 : -o[1];
          P_.push(a[i][0], ya, a[i][1], a[i + 1][0], ya, a[i + 1][1], b[i + 1][0], yb, b[i + 1][1], b[i][0], yb, b[i][1]);
          for (let q = 0; q < 4; q++){ N_.push(nx, nyy, nz); Cc.push(col.r, col.g, col.b); }
          U.push(s/.5, v0, (s + L)/.5, v0, (s + L)/.5, v1, s/.5, v1);
          I.push(base, base + 1, base + 2, base, base + 2, base + 3);
          s += L;
        }
      };
      strip(pan0, pan1, y + .42, y + .44, .05, .45, true);
      strip(backL, backL, y + .44, y + .86, .53, .97, false);
    }
  }
  if (!P_.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P_, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N_, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(P_.length/3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat({map:seatTex(), vertexColors:true, alphaTest:.5, side:THREE.DoubleSide, roughness:.42, kind:"gloss"}));
  m.name = "stadium-seats"; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
  W.scene.add(m);
  return {mesh:m, blocks:blockN};
}

/* ---------- roofs ---------- */
function roofOver(st, info, opts){
  if (!st.roof) return;
  const top = info.lastTier.top, dBack = info.lastTier.end + .6, back = top + 3.2, front = back + (st.roof === "posts" ? -.6 : 1.4), dFront = st.roof === "posts" ? -.9 : -2.2;
  const r = pour(), u = pour(), fas = pour(), lamp = pour();
  for (const pc of st.pieces){
    const f = pc.at(dFront), b = pc.at(dBack);
    for (let i = 0; i < f.length - 1; i++){
      const o = outward(f, i);
      r.quad([f[i][0], front + .35, f[i][1]], [f[i + 1][0], front + .35, f[i + 1][1]], [b[i + 1][0], back + .35, b[i + 1][1]], [b[i][0], back + .35, b[i][1]], [0, 1, 0]);
      u.quad([f[i][0], front, f[i][1]], [f[i + 1][0], front, f[i + 1][1]], [b[i + 1][0], back, b[i + 1][1]], [b[i][0], back, b[i][1]], [0, -1, 0], [-o[0]*.7, -.45, -o[1]*.7]);
      // the fascia along the front edge, and (tier 2) a strip of floodlights under it
      fas.quad([f[i][0], front - .5, f[i][1]], [f[i + 1][0], front - .5, f[i + 1][1]], [f[i + 1][0], front + .6, f[i + 1][1]], [f[i][0], front + .6, f[i][1]], [-o[0], 0, -o[1]]);
      fas.quad([f[i][0], front - .5, f[i][1]], [f[i + 1][0], front - .5, f[i + 1][1]], [f[i + 1][0] + o[0]*.5, front - .5, f[i + 1][1] + o[1]*.5], [f[i][0] + o[0]*.5, front - .5, f[i][1] + o[1]*.5], [0, -1, 0]);
      if (st.strip){
        const L = Math.hypot(f[i + 1][0] - f[i][0], f[i + 1][1] - f[i][1]), n = Math.floor(L/4.5);
        for (let k = 0; k < n; k++){
          const t0 = (k + .2)/n, t1 = (k + .8)/n, p = [f[i][0] + (f[i + 1][0] - f[i][0])*t0, f[i][1] + (f[i + 1][1] - f[i][1])*t0], q = [f[i][0] + (f[i + 1][0] - f[i][0])*t1, f[i][1] + (f[i + 1][1] - f[i][1])*t1];
          lamp.quad([p[0] + o[0]*.15, front - .55, p[1] + o[1]*.15], [q[0] + o[0]*.15, front - .55, q[1] + o[1]*.15], [q[0] + o[0]*.15, front - .95, q[1] + o[1]*.15], [p[0] + o[0]*.15, front - .95, p[1] + o[1]*.15], [-o[0], -.6, -o[1]]);
        }
        opts.halos.push([(f[i][0] + f[i + 1][0])/2 - o[0]*.6, front - .8, (f[i][1] + f[i + 1][1])/2 - o[1]*.6, 9]);
      }
    }
    // what holds it up: posts along the front (the older grounds), or trusses over the top from the back (a cantilever)
    const F = pc.at(.15), Bk = pc.at(dBack - .2), L = pc.L || plen(F), n = Math.max(2, Math.round(L/12));
    for (let k = 0; k <= n; k++){
      const t = k/n, p = slice(F, Math.max(0, t - .001), Math.min(1, t + .001)) || [F[0]], q = slice(Bk, Math.max(0, t - .001), Math.min(1, t + .001)) || [Bk[0]];
      const P0 = p[0], Q0 = q[0];
      if (st.roof === "posts"){
        if (st.main && Math.abs(P0[0]) < 5) continue;
        const yb = ROW.y0 + .15;
        cyl(P0[0], yb, P0[1], .09, front - yb, C.steel, {seg:8, key:"metal"});
      } else {
        // a truss: a raking top chord from the back post up and over the front, braced
        const fr = pc.at(dFront), pf = slice(fr, Math.max(0, t - .001), Math.min(1, t + .001)) || [fr[0]];
        beamTo(Q0[0], back + .35, Q0[1], pf[0][0], front + .4, pf[0][1], .28, C.steel);
        beamTo(Q0[0], back + 3.2, Q0[1], pf[0][0], front + .45, pf[0][1], .22, C.steel);
        beamTo(Q0[0], back, Q0[1], Q0[0], back + 3.2, Q0[1], .3, C.steel);
      }
    }
  }
  r.done(C.roofTop, {key:"metal"}); u.done(C.roofUnder, {}); fas.done(mix(opts.club, 0x1d2126, .5), {}); lamp.done(0xfff6e0, {key:"street"});
}
// a steel member from one point to another (a cylinder: cheap and round enough from the stands)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3();
function beamTo(ax, ay, az, bx, by, bz, r, color){
  _dv.set(bx - ax, by - ay, bz - az); const L = _dv.length(); if (L < .01) return;
  const g = new THREE.CylinderGeometry(r, r, L, 6, 1, true);
  _q.setFromUnitVectors(_Y, _dv.normalize()); g.applyQuaternion(_q); g.translate((ax + bx)/2, (ay + by)/2, (az + bz)/2);
  addGeo(g, color, {key:"metal", ao:false, jit:0});
}
// the roof ring of a bowl: from the back of the top tier in over the front rows, a floodlight strip along its edge
function roofRing(L, stands, opts, tier){
  const g = L.ring, info = stands.map(s => s.info), top = Math.max(...info.map(i => i.lastTier.top)), dOut = Math.max(...info.map(i => i.lastTier.end)) + .6;
  const dIn = tier >= 4 ? -7 : -3.5, yIn = top + (tier >= 4 ? 9 : 6.5), yOut = top + 3.6;
  const r = pour(), u = pour(), fas = pour(), lamp = pour();
  const order = ["z+", "c++", "x+", "c+-", "z-", "c--", "x-", "c-+"];
  for (const k of order){
    const pc = g[k], f = pc.at(dIn), b = pc.at(dOut);
    for (let i = 0; i < f.length - 1; i++){
      const o = outward(f, i);
      r.quad([f[i][0], yIn + .5, f[i][1]], [f[i + 1][0], yIn + .5, f[i + 1][1]], [b[i + 1][0], yOut + .5, b[i + 1][1]], [b[i][0], yOut + .5, b[i][1]], [0, 1, 0]);
      u.quad([f[i][0], yIn, f[i][1]], [f[i + 1][0], yIn, f[i + 1][1]], [b[i + 1][0], yOut, b[i + 1][1]], [b[i][0], yOut, b[i][1]], [0, -1, 0], [-o[0]*.7, -.45, -o[1]*.7]);
      fas.quad([f[i][0], yIn - 1.2, f[i][1]], [f[i + 1][0], yIn - 1.2, f[i + 1][1]], [f[i + 1][0], yIn + .6, f[i + 1][1]], [f[i][0], yIn + .6, f[i][1]], [-o[0], 0, -o[1]]);
      fas.quad([f[i][0], yIn - 1.2, f[i][1]], [f[i + 1][0], yIn - 1.2, f[i + 1][1]], [f[i + 1][0] + o[0]*.8, yIn - 1.2, f[i + 1][1] + o[1]*.8], [f[i][0] + o[0]*.8, yIn - 1.2, f[i][1] + o[1]*.8], [0, -1, 0]);
      const Ls = Math.hypot(f[i + 1][0] - f[i][0], f[i + 1][1] - f[i][1]), n = Math.max(1, Math.floor(Ls/3.2));
      for (let q = 0; q < n; q++){
        const t0 = (q + .15)/n, t1 = (q + .85)/n, p = [f[i][0] + (f[i + 1][0] - f[i][0])*t0, f[i][1] + (f[i + 1][1] - f[i][1])*t0], e = [f[i][0] + (f[i + 1][0] - f[i][0])*t1, f[i][1] + (f[i + 1][1] - f[i][1])*t1];
        lamp.quad([p[0] + o[0]*.25, yIn - 1.25, p[1] + o[1]*.25], [e[0] + o[0]*.25, yIn - 1.25, e[1] + o[1]*.25], [e[0] + o[0]*.25, yIn - 1.75, e[1] + o[1]*.25], [p[0] + o[0]*.25, yIn - 1.75, p[1] + o[1]*.25], [-o[0], -.5, -o[1]]);
      }
      if (k[0] !== "c" && i === 0) for (const t of [.2, .5, .8]) opts.halos.push([f[0][0] + (f[1][0] - f[0][0])*t - o[0]*.8, yIn - 1.5, f[0][1] + (f[1][1] - f[0][1])*t - o[1]*.8, 12]);
    }
  }
  r.done(0xc9ccce, {key:"metal"}); u.done(0xf2f6ff, {}); fas.done(mix(opts.club, 0x15181c, .6), {}); lamp.done(0xfff6e0, {key:"street"});
  // the steel over it: radial trusses every so often, seen against the sky
  for (const k of order){
    const pc = g[k], f = pc.at(dIn), b = pc.at(dOut), n = k[0] === "c" ? 2 : 5;
    for (let q = 0; q <= n; q++){
      if (k[0] === "c" && (q === 0 || q === n)) continue;
      const t = q/n, p = slice(f, Math.max(0, t - .001), Math.min(1, t + .001)), e = slice(b, Math.max(0, t - .001), Math.min(1, t + .001));
      if (!p || !e) continue;
      beamTo(p[0][0], yIn + .6, p[0][1], e[0][0], yOut + 4.5, e[0][1], .35, 0x8d959c);
    }
  }
  return {yIn, dIn};
}

/* ---------- floodlight masts ---------- */
function mast(x, z, h, opts, wide = 6){
  const f = frame(x, z, Math.atan2(-x, -z));
  // a tapering column, a head of lamps tilted down at the pitch, a ladder cage up the back
  cy(f, 0, 0, 0, .32, .55, h - 1, C.steel, {seg:10, key:"metal"});
  rb(f, 0, h - 1.4, 0, wide + .5, .3, .6, .05, 0x3b4249, {key:"metal"});
  // the head: a frame tilted to look down at the pitch, a grid of lamps on its face
  const rows = wide > 4 ? 4 : 3, cols = Math.max(2, Math.round(wide/1)), t = .45, H = rows*.82 + .3;
  const up = [Math.cos(t), Math.sin(t)], nrm = [-Math.sin(t), Math.cos(t)], cy0 = h - 1.1 + H/2, cz0 = .05;
  rb(f, 0, cy0, cz0, wide + .4, H, .4, .08, 0x2b3036, {key:"metal", rx:t, center:true});
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++){
    const u = (j - (rows - 1)/2)*.82, ly = cy0 + up[0]*u + nrm[0]*.24, lz = cz0 + up[1]*u + nrm[1]*.24;
    rb(f, -wide/2 + .5 + i*(wide - 1)/(cols - 1), ly, lz, .78, .66, .08, .06, 0xfff6e0, {key:"street", rx:t, center:true});
  }
  solid(x - .6, x + .6, z - .6, z + .6, 0, h);
  const [hx, hz] = worldPt(f, 0, .8);
  opts.halos.push([hx, h + .3, hz, wide*1.6]);
}

/* ---------- the advertising boards ---------- */
const ADS = (home, away) => [
  ["#0f1720", "#ffffff", "#c8f060", "FOODIES  ·  HOT FOOD TO YOUR DOOR"],
  ["#f2f2ee", "#1f6f43", "#1f6f43", "MINI MARKET  ·  OPEN 24/7"],
  ["#c8f060", "#14202c", "#14202c", "CITY BUS  ·  LINE 14"],
  [home.bg, home.fg, home.fg, `${home.name}  ·  SEASON TICKETS ON SALE NOW`],
  ["#1d2a4a", "#ffffff", "#ffd75a", "DUMBRAVA MOTORS  ·  DRIVE AWAY TODAY"],
  ["#14202c", "#ffffff", "#c8f060", "RESPECT  ·  FAIR PLAY"],
  [away.bg, away.fg, away.fg, `WELCOME, ${away.name} FANS`],
  ["#8e2b2b", "#ffffff", "#f2c230", "STRADA MARE BARBERS  ·  WALK IN"]
];
function adsTexture(clubs, kits){
  const fg = c => { const k = new THREE.Color(css(c)); return .3*k.r + .59*k.g + .11*k.b > .5 ? "#14202c" : "#ffffff"; };
  const H = {name:clubs.home.toUpperCase(), bg:css(kits.home[0]), fg:fg(kits.home[0])}, Aw = {name:clubs.away.toUpperCase(), bg:css(kits.away[0]), fg:fg(kits.away[0])};
  const ads = ADS(H, Aw), rowH = 160;
  return textTex(1024, rowH*ads.length, g => ads.forEach(([bg, f, ac, s], i) => {
    const y = i*rowH; g.fillStyle = bg; g.fillRect(0, y, 1024, rowH);
    g.fillStyle = ac; g.fillRect(0, y + rowH - 14, 1024, 8);
    let fs = 92; g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; const tw = g.measureText(s).width;
    if (tw > 960){ fs = Math.floor(fs*960/tw); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillStyle = f; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 512, y + rowH/2 - 4);
  }));
}
function boards(tier, tex, ribbons){
  const q = [], n = 8, hb = BOARDS.h, t = .32, gap = BOARD_GAPS[0];
  const run = (side, a0, a1) => {
    const L = a1 - a0, k = Math.max(1, Math.round(L/5)), w = L/k;
    for (let i = 0; i < k; i++){
      const a = a0 + i*w, c = a + w/2, ad = Math.floor(Math.abs(c*7.3 + (side.length*13)) + i) % n, uv = [0, ad/n + .004, 1, (ad + 1)/n - .004];
      if (side === "z+") q.push({x:c, y:hb/2 + .02, z:BOARDS.hz - .005, w:w - .06, h:hb - .1, ry:Math.PI, uv});
      else if (side === "z-") q.push({x:c, y:hb/2 + .02, z:-BOARDS.hz + .005, w:w - .06, h:hb - .1, ry:0, uv});
      else if (side === "x+") q.push({x:BOARDS.hx - .005, y:hb/2 + .02, z:c, w:w - .06, h:hb - .1, ry:-Math.PI/2, uv});
      else q.push({x:-BOARDS.hx + .005, y:hb/2 + .02, z:c, w:w - .06, h:hb - .1, ry:Math.PI/2, uv});
    }
    // the board's body: a dark box behind the screen, a player solid
    const B = (x0, x1, z0, z1) => { box(x0, 0, z0, x1, hb, z1, 0x23282e, {key:"metal", ao:false, jit:0}); solid(x0, x1, z0, z1, 0, hb); };
    if (side === "z+") B(a0, a1, BOARDS.hz, BOARDS.hz + t);
    else if (side === "z-") B(a0, a1, -BOARDS.hz - t, -BOARDS.hz);
    else if (side === "x+") B(BOARDS.hx, BOARDS.hx + t, a0, a1);
    else B(-BOARDS.hx - t, -BOARDS.hx, a0, a1);
  };
  run("z+", -BOARDS.hx, BOARDS.hx);
  run("z-", -BOARDS.hx, gap.a0); run("z-", gap.a1, BOARDS.hx);
  run("x+", -BOARDS.hz - t, BOARDS.hz + t); run("x-", -BOARDS.hz - t, BOARDS.hz + t);
  for (const r of ribbons || []) q.push(r);
  return labels(tex, q, {glow:tier >= 2 ? .55 : tier === 1 ? .15 : 0, rough:.5});
}

/* ---------- the scoreboard ---------- */
function scoreboard(tier, opts, at){
  const W_ = tier >= 2 ? 13 : 6, H_ = W_*.42;
  const t = textTex(512, 220, () => {});
  const cv = t.image, g = cv.getContext("2d");
  const draw = (o = {}) => {
    const hn = (o.home || opts.clubs.home).toUpperCase(), an = (o.away || opts.clubs.away).toUpperCase();
    const hs = o.hs != null ? o.hs : 0, as = o.as != null ? o.as : 0, min = o.min != null ? `${o.min}'` : "";
    g.fillStyle = "#07090c"; g.fillRect(0, 0, 512, 220);
    g.fillStyle = "#11161c"; g.fillRect(8, 8, 496, 204);
    const fit = (s, px, max) => { g.font = `800 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`; const w = g.measureText(s).width; if (w > max){ g.font = `800 ${Math.floor(px*max/w)}px "Barlow Condensed", "Arial Narrow", sans-serif`; } };
    g.textBaseline = "middle"; g.textAlign = "center";
    g.fillStyle = css(opts.kits.home[0]); g.fillRect(24, 34, 10, 60); g.fillStyle = css(opts.kits.away[0]); g.fillRect(24, 122, 10, 60);
    g.textAlign = "left"; g.fillStyle = "#f4f6f8";
    fit(hn, 56, 330); g.fillText(hn, 48, 66); fit(an, 56, 330); g.fillText(an, 48, 154);
    g.textAlign = "center"; g.fillStyle = "#ffd75a"; g.font = `800 76px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillText(String(hs), 440, 66); g.fillText(String(as), 440, 154);
    if (min){ g.fillStyle = "#c8f060"; g.font = `700 28px "Barlow Condensed", "Arial Narrow", sans-serif`; g.fillText(min, 440, 110); }
    t.needsUpdate = true;
  };
  draw();
  // where it stands (at): on legs beyond the open east end (tiers 0 and 1), on the front of the east stand's roof (2),
  // hung under the roof ring over the east end (a bowl); always facing the pitch
  const x = at.x, y = at.legs ? 1.4 + H_/2 : at.y + H_/2, z = at.z, ry = Math.atan2(-x, -z);
  const f = frame(x, z, ry);
  rb(f, 0, y - H_/2 - .3, -.2, W_ + .6, H_ + .6, .4, .05, 0x15181c, {key:"metal"});
  if (at.legs){ for (const s of [-1, 1]) cy(f, s*W_*.35, 0, -.25, .14, .16, y - H_/2, C.steel, {seg:8, key:"metal"}); fsolid(f, 0, -.25, W_*.8, .5, 0, 1.4); }
  const [wx, wz] = worldPt(f, 0, .02);
  const m = label(t, wx, y, wz, W_, H_, ry, {glow:.95, rough:.3});
  m.userData.noMerge = true;                     // its picture changes with the score: it stays a mesh of its own
  return {mesh:m, draw, tex:t};
}

/* ---------- the dressing room, the corridor and the tunnel's mouth ---------- */
function dressingRoom(opts){
  const x0 = -9, x1 = 9, z0 = -78, z1 = -66, H = 3.2, club = opts.club, kit = opts.kits.home;
  const PT = {tex:"paint", jit:0}, SK = {solid:false, ao:false, jit:0, tex:"tiles"};
  // the shell: outer walls, the floor, the ceiling
  box(x0, 0, z0, x1, .02, z1, 0xffffff, {tex:"tiles", ao:false, jit:0});
  box(x0, H, z0, x1, H + .25, z1, 0xeeebe4, {tex:"paint", ao:false, jit:0});
  wall("x", z1 + .125, x0 - .25, x1 + .25, 0, H + .25, .25, C.wallIn, [[-1.1, 1.1, 0, 2.3]], PT);
  wall("x", z0 - .125, x0 - .25, x1 + .25, 0, H + .25, .25, C.wallIn, [[-.75, .75, 0, 2.2]], PT);
  wall("z", x0 - .125, z0, z1, 0, H + .25, .25, C.wallIn, [], PT);
  wall("z", x1 + .125, z0, z1, 0, H + .25, .25, C.wallIn, [], PT);
  doorway("x", z1 + .125, -1.1, 1.1, 0, 2.3, .25, {color:0x2b3036, key:"metal", arch:.08, proud:.05});
  doorway("x", z0 - .125, -.75, .75, 0, 2.2, .25, {color:0x2b3036, key:"metal", arch:.08, proud:.05});
  // tiles to shoulder height in the club's colour, white above
  const band = mix(club, 0xffffff, .15);
  wall("z", x0 + .01, z0 + .01, z1 - .01, .02, 1.5, .02, band, [], SK);
  wall("z", x1 - .01, z0 + .01, z1 - .01, .02, 1.5, .02, band, [], SK);
  wall("x", z0 + .01, x0 + .01, x1 - .01, .02, 1.5, .02, band, [[-.75, .75, 0, 2.2]], SK);
  wall("x", z1 - .01, x0 + .01, x1 - .01, .02, 1.5, .02, band, [[-1.1, 1.1, 0, 2.3]], SK);
  // the doors: the way to the tunnel held open, the way out shut (a bar across it)
  for (const s of [-1, 1]){
    const f = frame(s*1.1, z1 + .1, s*Math.PI/2*.9);
    rb(f, -s*.52, .02, 0, 1.04, 2.24, .05, .02, mix(club, 0x20242a, .5), {key:"paint"});
  }
  rb(frame(0, z0 + .02, 0), 0, .02, 0, 1.46, 2.16, .05, .02, 0x6d737a, {key:"metal"});
  rb(frame(0, z0 + .08, 0), 0, 1.0, 0, 1.2, .05, .06, .02, 0xc9cdd1, {key:"metal"});
  solid(-.8, .8, z0 - .15, z0 + .1, 0, 2.2);
  // a place for each player round three walls: an open wooden cubicle with his shirt hung in it, his number over it,
  // the bench in front and his boots under it
  const wood = 0xc49a6c, panel = mix(club, 0x1a1d22, .55), shirtCol = hexOf(kit[0]), numQ = [];
  const runs = [
    {pts:Array.from({length:7}, (_, i) => z0 + 1.2 + i*1.5), at:t => ({x:x0, z:t, ry:Math.PI/2}), along:"z"},
    {pts:Array.from({length:7}, (_, i) => z0 + 1.2 + i*1.5), at:t => ({x:x1, z:t, ry:-Math.PI/2}), along:"z"},
    {pts:[-7.6, -6.1, -4.6, -3.1], at:t => ({x:t, z:z0, ry:0}), along:"x"},
    {pts:[3.1, 4.6, 6.1, 7.6], at:t => ({x:t, z:z0, ry:0}), along:"x"}
  ];
  const numTex = textTex(512, 256, g => {
    for (let n = 0; n < 32; n++){ const cx = (n % 8)*64 + 32, cy = Math.floor(n/8)*64 + 32;
      g.fillStyle = "#f6f4ee"; g.fillRect(cx - 30, cy - 24, 60, 48); g.fillStyle = "#1b1f24"; g.font = "800 36px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n + 1), cx, cy + 2); }
  });
  const shirtShape = new THREE.Shape([[-.26, 0], [.26, 0], [.27, .52], [.44, .44], [.5, .58], [.22, .74], [.08, .7], [-.08, .7], [-.22, .74], [-.5, .58], [-.44, .44], [-.27, .52]].map(([u, v]) => new THREE.Vector2(u, v)));
  let n = 0;
  for (const run of runs){
    run.pts.forEach((t, i) => {
      const p = run.at(t), f = frame(p.x, p.z, p.ry); n++;
      rb(f, 0, .45, .03, 1.46, 1.95, .03, .01, panel, {});                          // the back
      rb(f, 0, 2.38, .27, 1.5, .05, .5, .01, wood, {});                            // the top
      for (const sx of i === 0 ? [-1, 1] : [1]) rb(f, sx*.75, .45, .27, .04, 1.93, .5, .01, wood, {});
      // the shirt on its hanger
      const g = new THREE.ExtrudeGeometry(shirtShape, {depth:.03, bevelEnabled:false, curveSegments:1});
      g.rotateY(f.ry); const [wx, wz] = worldPt(f, 0, .1); g.translate(wx, 1.22, wz);
      addGeo(g, shirtCol, {key:"plain", ao:false, jit:.03});
      rb(f, 0, 1.94, .11, .5, .02, .02, .01, 0xc9cdd1, {key:"metal"});
      // the number on the cubicle's top, facing the room
      const [lx, lz] = worldPt(f, 0, .523), c = (n - 1) % 8, r = Math.floor((n - 1)/8);
      numQ.push({x:lx, y:2.405, z:lz, w:.24, h:.19, ry:f.ry, uv:[c/8, r/4, (c + 1)/8, (r + 1)/4]});
      // his boots under the bench, his bag beside them now and then
      for (const sx of [-1, 1]) rb(f, -.25 + sx*.07, 0, .78, .1, .1, .27, .03, n % 3 ? 0x15161a : 0xf2f2f0, {});
      if (n % 2) rb(f, .32, 0, .8, .5, .3, .3, .08, 0x1f2e4a, {});
    });
  }
  // the benches in front of the cubicles
  const benchCol = 0xb5895a;
  for (const [x, z, w, d] of [[x0 + .38, (z0 + z1)/2 - .3, .5, 10.6], [x1 - .38, (z0 + z1)/2 - .3, .5, 10.6], [-5.35, z0 + .38, 6.1, .5], [5.35, z0 + .38, 6.1, .5]]){
    rbox(x, .42, z, w, .06, d, .02, benchCol, {});
    rbox(x, 0, z, w*.7, .42, d*.97, .02, 0x3b4249, {key:"metal"});
    solid(x - w/2, x + w/2, z - d/2, z + d/2, 0, .48);
  }
  labels(numTex, numQ, {rough:.6});
  // the club's crest woven into a round rug in the middle of the floor
  const rug = textTex(512, 512, g => {
    const k = opts.kits.home, name = opts.clubs.home.toUpperCase();
    g.fillStyle = css(k[0]); g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
    g.strokeStyle = css(k[1] || "#ffffff"); g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 228, 0, 7); g.stroke();
    g.fillStyle = css(k[1] || "#ffffff"); g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 150px 'Barlow Condensed', sans-serif"; g.fillText(name.split(" ").map(w => w[0]).join("").slice(0, 3), 256, 236);
    let fs = 44; g.font = `800 ${fs}px 'Barlow Condensed', sans-serif`; const w = g.measureText(name).width; if (w > 360){ fs = Math.floor(fs*360/w); g.font = `800 ${fs}px 'Barlow Condensed', sans-serif`; }
    g.fillText(name, 256, 352);
  });
  const rm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI/2).rotateY(Math.PI), mat({map:rug, alphaTest:.5, roughness:.95, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1}));
  rm.position.set(0, .021, -72.2); rm.receiveShadow = true; W.scene.add(rm);
  // the manager's board by the door, a physio's table, water, the kit hamper
  tacticsBoard(-4.2, z1 - .6, Math.PI, "TODAY");
  const pt = frame(6.2, -70.2, 0);
  rb(pt, 0, .7, 0, 1.9, .12, .7, .05, 0x2c3e5c, {key:"gloss"});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rb(pt, sx*.8, 0, sz*.25, .05, .7, .05, .01, 0x8f979e, {key:"metal"});
  fsolid(pt, 0, 0, 1.9, .7, 0, .82);
  waterCooler(-7.9, z1 - .6, Math.PI);
  kitHamper(2.6, z1 - .8, .2, hexOf(kit[1] || "#ffffff"));
  // the light: panels in the ceiling
  for (const x of [-5, 0, 5]) for (const z of [-75, -71, -68]) box(x - .9, H - .02, z - .4, x + .9, H, z + .4, 0xfff6e8, {key:"lamp", ao:false, jit:0});
  // a sign on the door out: where the car park and the bus are
  label(textTex(256, 64, g => { g.fillStyle = "#14202c"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#fff"; g.font = "800 30px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXIT  ·  CAR PARK", 128, 33); }),
    0, 2.45, z0 + .03, 1.0, .25, 0, {glow:.3, rough:.5});
}
function corridor(opts, tier){
  const {x, z0, z1, h} = COR, club = opts.club, PT = {tex:"paint", jit:0};
  // walls, the ceiling and the floor from the dressing room's door to the mouth
  box(-x, 0, z0, x, .02, z1 + 4, 0xffffff, {tex:"rubberFloor", ao:false, jit:0});
  for (const s of [-1, 1]){
    wall("z", s*(x + .125), z0, z1, 0, h + .2, .25, C.wallIn, [], PT);
    // a band of the club's colour along each wall, and the crest painted halfway down
    box(s*x - (s > 0 ? .012 : 0), .02, z0 + .1, s*x + (s < 0 ? .012 : 0), 1.1, z1 - .1, mix(club, 0x15181c, .25), {ao:false, jit:0});
  }
  box(-x - .25, h, z0, x + .25, h + .08, z1, 0xe6e3dc, {tex:"paint", ao:false, jit:0});
  for (let z = z0 + 1.5; z < z1 - .5; z += 3) box(-.35, h - .03, z - .7, .35, h, z + .7, 0xfff6e8, {key:"lamp", ao:false, jit:0});
  // the outside of the corridor where it runs in the open (the smaller grounds): a low block with a flat roof
  if (tier <= 1){
    box(-x - .26, 0, z0, -x - .25, h + .4, z1, C.clad, {tex:"cladding", ao:false, jit:0});
    box(x + .25, 0, z0, x + .26, h + .4, z1, C.clad, {tex:"cladding", ao:false, jit:0});
    box(-x - .45, h + .25, z0, x + .45, h + .45, z1, 0x4b5258, {key:"metal", ao:false, jit:0});
  }
  const name = opts.clubs.home.toUpperCase();
  label(textTex(1024, 128, g => { g.fillStyle = "#14202c"; g.fillRect(0, 0, 1024, 128); g.fillStyle = css(opts.kits.home[0]); g.fillRect(0, 112, 1024, 16);
    g.fillStyle = "#ffffff"; let fs = 70; g.font = `800 ${fs}px "Barlow Condensed", sans-serif`; const s = `WELCOME TO ${name}`, w = g.measureText(s).width; if (w > 960){ fs = Math.floor(fs*960/w); g.font = `800 ${fs}px "Barlow Condensed", sans-serif`; }
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 512, 58); }), 0, h - .38, z1 - .2, 4.6, .56, Math.PI, {glow:.35, rough:.5});
  const crest = textTex(256, 256, g => { const k = opts.kits.home; g.fillStyle = css(k[0]); g.beginPath(); g.moveTo(128, 8); g.lineTo(240, 40); g.lineTo(224, 170); g.lineTo(128, 248); g.lineTo(32, 170); g.lineTo(16, 40); g.closePath(); g.fill();
    g.strokeStyle = css(k[1] || "#fff"); g.lineWidth = 10; g.stroke(); g.fillStyle = css(k[1] || "#fff"); g.font = "900 78px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name.split(" ").map(w => w[0]).join("").slice(0, 3), 128, 120); });
  label(crest, -x + .02, 1.7, -55, 1.2, 1.2, Math.PI/2, {rough:.5, transparent:true, alphaTest:.5});
  label(crest, x - .02, 1.7, -55, 1.2, 1.2, -Math.PI/2, {rough:.5, transparent:true, alphaTest:.5});
  // (a real light only on High: the sky's pool in a stadium has none on Low and Medium, 2 on High, P.nReal.stadium, and
  // follows a change of preset; the source is always there for it)
  lightSrc({x:0, y:h - .3, z:-50, color:0xfff1d8, intensity:6, distance:12, indoor:true});
}
// the mouth: concrete cheeks up the rake either side, a lintel, and the telescopic tunnel out to the boards
function mouth(opts, tier){
  const top = ROW.y0 + MOUTH.rows*ROW.h, zF = -Z0, zB = -(Z0 + MOUTH.rows*ROW.d), PT = {tex:"concrete", jit:0};
  if (tier >= 1){
    for (const s of [-1, 1]){
      extrude("z", [[zF, 0], [zF, ROW.y0 + 1.1], [zB, top + 1.1], [zB, 0]], s > 0 ? MOUTH.x - .4 : -MOUTH.x, s > 0 ? MOUTH.x : -MOUTH.x + .4, 0x8f8c85, PT);
      solid(s > 0 ? MOUTH.x - .4 : -MOUTH.x, s > 0 ? MOUTH.x : -MOUTH.x + .4, zB - .1, zF, 0, top + 1.1);
      // the cheek walls run into the corridor's walls
      solid(s > 0 ? COR.x : -MOUTH.x, s > 0 ? MOUTH.x : -COR.x, zB - .4, zB + .1, 0, top);
    }
    box(-MOUTH.x, COR.h, zB - .3, MOUTH.x, top + .05, zB + .05, 0x8f8c85, PT);
  }
  // the telescopic tunnel: hoops and a cover in the club's colours from the stand out over the track
  const zs = -BOARDS.hz - .2, ze = tier >= 1 ? zB + .1 : COR.z1, len = zs - ze, cl = mix(opts.club, 0x15181c, .35);
  const shell = new THREE.CylinderGeometry(2.0, 2.0, len, 18, 1, true, Math.PI/2, Math.PI);
  shell.rotateX(Math.PI/2); shell.scale(1, 1.35, 1);
  const pos = shell.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
  shell.computeVertexNormals(); shell.translate(0, .02, ze + len/2);
  // seen from inside and out
  const inner = shell.clone(), idx = inner.index;
  if (idx){ const a = idx.array; for (let i = 0; i < a.length; i += 3){ const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; } }
  const nn = inner.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
  addGeo(shell, cl, {ao:false, jit:0}); addGeo(inner, 0xd6d9dc, {ao:false, jit:0});
  for (let k = 0; k <= 4; k++){
    const z = ze + len*k/4, g = new THREE.TorusGeometry(2.02, .05, 5, 18, Math.PI);
    g.scale(1, 1.35, 1); g.translate(0, .02, z);
    addGeo(g, 0xc9cdd1, {key:"metal", ao:false, jit:0});
  }
  for (const s of [-1, 1]) solid(s > 0 ? 1.95 : -2.1, s > 0 ? 2.1 : -1.95, ze, zs, 0, 2.6);
}

/* ---------- around the pitch: dugouts, the fourth official, the technical areas, the rail ---------- */
function dugouts(opts){
  const seats = [], kit = opts.kits;
  for (const [side, x] of [["home", -10], ["away", 10]]){
    dugout(x, -37, Math.PI, 4.6, hexOf((side === "home" ? kit.home : kit.away)[0]));
    const f = frame(x, -37, Math.PI);
    for (let i = 0; i < 8; i++){ const lx = -2.3 + .32 + i*.55, [wx, wz] = worldPt(f, lx, .32); seats.push({x:wx, y:.05, z:wz, side}); }
  }
  lightSrc({x:0, y:2.4, z:-37.2, color:0xfff1d8, intensity:5, distance:16});     // (lit on High only: the sky's stadium pool)
  // the fourth official's desk and his board, to one side of the walk out
  const d = frame(-3.6, -37.4, 0);
  rb(d, 0, .72, 0, 1.3, .05, .55, .02, 0x2b3036, {key:"metal"});
  for (const sx of [-1, 1]) rb(d, sx*.58, 0, 0, .05, .72, .5, .01, 0x8f979e, {key:"metal"});
  rb(d, -.2, .77, 0, .62, .06, .4, .02, 0x15181c, {});
  rb(d, -.2, .835, 0, .5, .005, .3, .01, 0x2cc84e, {key:"neon"});
  fsolid(d, 0, 0, 1.3, .55, 0, .8);
  return seats;
}
// the technical areas painted in front of the dugouts: dashed white lines, as part of the pitch's markings
const techAreas = () => {
  const L = [];
  for (const [a0, a1] of [[-14, -6], [6, 14]]){
    L.push({type:"seg", x0:a0, z0:-37.9, x1:a0, z1:-35.06, dash:.3}, {type:"seg", x0:a1, z0:-37.9, x1:a1, z1:-35.06, dash:.3}, {type:"seg", x0:a0, z0:-35, x1:a1, z1:-35, dash:.3});
  }
  return L;
};
// a local ground's rail round the pitch, on the boards' line, the boards hung on it
function rail(){
  const post = (x, z) => cyl(x, 0, z, .04, 1.15, 0x8f979e, {seg:6, key:"metal"});
  for (const [x0, z0, x1, z1] of [[-BOARDS.hx, BOARDS.hz, BOARDS.hx, BOARDS.hz], [-BOARDS.hx, -BOARDS.hz, -14, -BOARDS.hz], [14, -BOARDS.hz, BOARDS.hx, -BOARDS.hz],
    [BOARDS.hx, -BOARDS.hz, BOARDS.hx, BOARDS.hz], [-BOARDS.hx, -BOARDS.hz, -BOARDS.hx, BOARDS.hz]]){
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L/2.5), o = z0 === z1 ? [0, Math.sign(z0)*.4] : [Math.sign(x0)*.4, 0];
    for (let i = 0; i <= n; i++) post(x0 + (x1 - x0)*i/n + o[0], z0 + (z1 - z0)*i/n + o[1]);
    const g = new THREE.CylinderGeometry(.035, .035, L, 6, 1, true).rotateZ(Math.PI/2);
    if (x0 === x1) g.rotateY(Math.PI/2);
    g.translate((x0 + x1)/2 + o[0], 1.15, (z0 + z1)/2 + o[1]);
    addGeo(g, 0x8f979e, {key:"metal", ao:false, jit:0});
  }
}

/* ---------- outside the ground ---------- */
function surroundings(tier, opts){
  // the ground everything stands on, a little under the grass, out to the fog
  box(-260, -.3, -260, 260, -.03, 260, 0xffffff, {tex:tier <= 1 ? "grass" : "asphalt", ao:false, jit:0});
  // the ground's boundary where the stands leave it open: a wire fence round the smaller grounds
  if (tier === 0){ wireFence(-68, 48, 68, 48); wireFence(-68, -48, -68, 48); wireFence(68, -48, 68, 48); }
  else if (tier === 1){ wireFence(-66, -50, -66, 50); wireFence(66, -50, 66, 50); }
  // trees and the town beyond, where the stands leave the view open
  reseed(4242 + tier);
  if (tier <= 2){
    for (let i = 0; i < 26; i++){
      const a = i/26*Math.PI*2 + rnd()*.1, r = (tier <= 1 ? 82 : 100) + rnd()*30, x = Math.cos(a)*r*1.15, z = Math.sin(a)*r*.85;
      if (z < -60 && Math.abs(x) < 30) continue;
      tree(x, z, 1.3 + rnd()*.7);
    }
    for (let i = 0; i < 18; i++){
      const a = i/18*Math.PI*2 + .17, r = 150 + rnd()*60, x = Math.cos(a)*r*1.2, z = Math.sin(a)*r;
      rbox(x, 0, z, 12 + rnd()*16, 8 + rnd()*(tier >= 2 ? 26 : 10), 10 + rnd()*12, .3, [0x8b8f94, 0xa3593f, 0x9a8e7e, 0x7b8691, 0xc4bba9][i % 5], {});
    }
  }
  // the main stand's building behind it, round the dressing room
  if (tier <= 1){
    box(-14, 0, -82, 14, 3.6, -78.25, 0xd8d2c4, {tex:"paint", ao:false, jit:0});
    box(-14, 3.45, -82, 14, 3.75, -64, 0x4b5258, {key:"metal", ao:false, jit:0});
    for (const s of [-1, 1]) box(s > 0 ? 9.25 : -14, 0, -82, s > 0 ? 14 : -9.25, 3.5, -64, 0xd8d2c4, {tex:"paint", ao:false, jit:0});
    box(-9.25, 0, -66.2, -COR.x - .25, 3.5, -64, 0xd8d2c4, {tex:"paint", ao:false, jit:0});
    box(COR.x + .25, 0, -66.2, 9.25, 3.5, -64, 0xd8d2c4, {tex:"paint", ao:false, jit:0});
  }
}

/* ---------- the zone ---------- */
let LEAVE = [];
function lightOnStands(out){
  const S_ = RT.SKY;
  if (!S_ || !S_.hemi) return out.setRGB(1, 1, 1);
  const h = S_.hemi, s = S_.sun;
  out.copy(h.color).multiplyScalar(.26*h.intensity);
  out.r += s.color.r*.15*s.intensity; out.g += s.color.g*.15*s.intensity; out.b += s.color.b*.15*s.intensity;
  out.r = Math.min(1.25, out.r + .1); out.g = Math.min(1.25, out.g + .1); out.b = Math.min(1.25, out.b + .1);
  return out;
}
const _light = new THREE.Color();
let audT = 0;
export function buildStadium(ctx, o = {}){
  const tier = Math.max(0, Math.min(4, (o.tier == null ? 2 : o.tier) | 0));
  const kits = {home:(o.kits && o.kits.home) || ["#2c66b8", "#ffffff"], away:(o.kits && o.kits.away) || ["#c8463a", "#ffffff"]};
  const clubs = {home:(o.clubs && o.clubs.home) || "Home", away:(o.clubs && o.clubs.away) || "Away"};
  const cap = o.cap || (tier === 0 ? 900 : SEATS[tier]), crowdN = o.crowd == null ? Math.round(cap*.6) : o.crowd;
  const att = Math.max(0, Math.min(1, crowdN/cap));
  reseed(9100 + tier);
  W.bounds = Object.assign({}, BOUNDS);
  const club = hexOf(kits.home[0]);
  const opts = {tier, kits, clubs, club, halos:[], seatCol:mix(club, 0x20242a, .15), seatAlt:mix(hexOf(kits.home[1] || "#ffffff"), 0x9aa0a6, .2)};
  // the pitch, from the one spec the ball and the rules use
  const spec = makePitch({L:FIFA.L, Wd:FIFA.Wd, roll:ROLL[tier], boards:true});
  const pitch = buildPitchMesh(spec, {tier, worn:WEAR[tier], stripes:12, cones:true, grass:{hx:X0 + .3, hz:Z0 + .3}, extra:techAreas()});
  surroundings(tier, opts);
  // the stands
  const L = layout(tier);
  opts.bowl = !!L.bowl; opts.roofRing = !!L.roofRing;
  const stands = L.stands.map(s => Object.assign({}, s));
  for (const st of stands){ st.info = buildStand(st, opts); roofOver(st, st.info, opts); }
  const seats = seatsMesh(stands, opts);
  let ring = null, boardAt = {x:62, z:30, legs:true};
  if (L.roofRing){ ring = roofRing(L, stands, opts, tier); const t1 = stands.find(s => s.id === "east").info.tiers[1]; boardAt = {x:X0 + t1.d - .5, z:0, y:t1.y - 1.2}; }
  else if (tier === 2){ const e = stands.find(s => s.id === "east").info; boardAt = {x:X0 - 1.6, z:0, y:e.lastTier.top + 3.2 + 1.4 + .9}; }
  // the floodlights
  if (tier === 0) for (const [x, z] of [[-32, 44], [32, 44], [-32, -44.5], [32, -44.5]]) mast(x, z, 16, opts, 3);
  else if (tier === 1) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mast(sx*61, sz*45, 28, opts, 5);
  else if (tier === 2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mast(sx*63.5, sz*44.5, 40, opts, 7);
  // the boards, the ribbons along the upper tiers' fronts sharing their picture
  const adTex = adsTexture(clubs, kits), ribbons = [];
  if (L.bowl) for (const st of stands){ const t1 = st.info.tiers[1]; if (!t1) continue;
    for (const pc of st.pieces){ if (pc.side === "c") continue; const f = pc.at(t1.d - .25), [a, b] = f, Lr = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(Lr/8), o = outward(f, 0);
      for (let i = 0; i < n; i++){ const t = (i + .5)/n, ad = (i*3 + st.id.length) % 8;
        ribbons.push({x:a[0] + (b[0] - a[0])*t - o[0]*.01, y:t1.y - .55, z:a[1] + (b[1] - a[1])*t - o[1]*.01, w:Lr/n - .1, h:.9, ry:Math.atan2(-o[0], -o[1]), uv:[0, ad/8 + .004, 1, (ad + 1)/8 - .004]}); } } }
  if (tier === 0) rail();
  boards(tier, adTex, ribbons);
  const bench = dugouts(opts);
  dressingRoom(opts);
  corridor(opts, tier);
  mouth(opts, tier);
  const board = scoreboard(tier, opts, boardAt);
  for (const h of opts.halos) halo(h[0], h[1], h[2], h[3]);
  // the crowd: the seats the stands hand it, filled to the attendance
  const crowdStands = stands.map(st => ({id:st.id, away:!!st.away, standing:!!st.standing, roofed:!!(st.roof || L.roofRing),
    rows:st.info.rows.map(r => ({y:r.y, runs:r.runs.map(run => ({pts:run.pts}))}))}));
  const crowdOpts = {stands:crowdStands, attendance:att, homeShare:o.homeShare == null ? .8 : o.homeShare, kits, renderer:RT.renderer, bench, seed:o.seed};
  const crowd = buildCrowd(W.scene, Object.assign({preset:typeof GFX !== "undefined" && GFX ? GFX.P : null}, crowdOpts));
  const benchN = {home:o.subs != null ? o.subs : 7, away:o.subs != null ? o.subs : 7};
  crowd.setBench("home", benchN.home); crowd.setBench("away", benchN.away);
  // the place's own spots, for the match to hang its steps on
  const on = o.on || {};
  if (on.ready) spot({x:0, y:1.2, z:-72.5, r:3, near:true, stadium:true, label:"Dressing room", hint:"Get ready", run:() => on.ready()});
  if (on.door) spot({x:0, y:1.2, z:-66, r:1.8, near:true, stadium:true, label:"Tunnel", hint:"Walk out", run:() => on.door()});
  if (on.bench) for (const [side, x] of [["home", -10], ["away", 10]]) spot({x, y:.8, z:-37.3, r:2.6, near:true, stadium:true, label:"Bench", hint:"Sit down", run:() => on.bench(side)});
  if (on.leave) spot({x:0, y:1.2, z:-77.6, r:1.8, near:true, stadium:true, label:"Exit", hint:"Leave the ground", run:() => on.leave()});
  finishBatches();
  // the sky: a stadium's own lights and shadows (DESIGN 3.3.4), and the floodlights' key light for the night
  const SKY = RT.SKY;
  if (SKY && SKY.setContext) SKY.setContext("stadium");
  if (SKY && SKY.setNightKey) SKY.setNightKey(true, {dir:[.18, 1, -.32], intensity:[1.3, 1.5, 1.7, 1.85, 2.0][tier], color:0xf2f5ff});
  /* the key light comes from one side; real floodlights from all four corners. Under them, at night, the white of the
     goals (frames and nets, kept as meshes of their own for it) is lifted a little on every face. And the rooms under
     the main stand (the tiles, the painted walls and ceilings, the corridor's floor) are lit by their ceiling panels
     day and night, with no real light in the stadium on Low and Medium: their surfaces carry that light themselves.
     Both through the sky's per-frame glow hook (W.glows, emptied again when the place is left) */
  for (const m of [pitch.frames, pitch.netMesh]) m.userData.noMerge = true;
  W.glows = [k => {
    const v = .2*k.lamps, e = .04 + .11*k.lamps;
    for (const m of [pitch.frames, pitch.netMesh]){ const mt = m.material; if (mt && mt.emissive) mt.emissive.setRGB(v, v, v*1.03); }
    for (const key of INNER){ const mt = W.mats[key]; if (mt && mt.emissive) mt.emissive.setRGB(e, e*.98, e*.94); }
  }];
  // the sound of it
  AUD.init();
  Object.assign(STADIUM, {tier, spec, pitch, crowd, stands, bench, cones:pitch.cones, att, level:Math.min(1, crowdN/20000 + att*.35), board, seats, kits, clubs, cap, fans:crowdN});
  STADIUM.excite(.15);
  audT = 0;
  // a change of preset (DESIGN 3.9.1: the crowd's kind and count go with it): the crowd made again for it, the same
  // people in the same seats (its seed), under the swap's cover and compiled with everything else (quality.js swapNow)
  const offSwap = onPresetSwap(P => {
    if (!STADIUM.crowd) return;
    const bench = {home:STADIUM.crowd.benchN ? STADIUM.crowd.benchN.home : benchN.home, away:STADIUM.crowd.benchN ? STADIUM.crowd.benchN.away : benchN.away};
    STADIUM.crowd.dispose();
    const c = buildCrowd(W.scene, Object.assign({preset:P}, crowdOpts, {renderer:RT.renderer}));
    c.setBench("home", bench.home); c.setBench("away", bench.away);
    STADIUM.crowd = c;
    STADIUM.excite(STADIUM.excitement);
  });
  LEAVE = [() => { offSwap(); if (STADIUM.crowd) STADIUM.crowd.dispose(); }];
  return Object.assign({}, SPAWNS);
}

registerZone("stadium", {
  build:(ctx, opts) => buildStadium(ctx, opts || {}),
  tick(dt){
    if (STADIUM.crowd) STADIUM.crowd.update(dt, lightOnStands(_light));
    const cam = RT.cam;
    if (cam){
      AUD.listener(cam.position, P.yaw);
      // the crowd's sound: muffled inside (the corridor and the dressing room), its level a few times a second
      if ((audT -= dt) <= 0){
        audT = .25;
        const inside = P.z < COR.z1 + 1 ? Math.min(1, (COR.z1 + 1 - P.z)/4) : 0;
        AUD.muffle(inside*.9);
        AUD.crowd(STADIUM.level, STADIUM.excitement);
      }
    }
  },
  leave(){
    for (const f of LEAVE) try { f(); } catch(e){ console.error(e); }
    LEAVE = [];
    W.glows = null;
    const SKY = RT.SKY;
    if (SKY && SKY.setNightKey) SKY.setNightKey(false);
    if (SKY && SKY.setContext) SKY.setContext("life");
    AUD.dispose();
    Object.assign(STADIUM, {tier:-1, spec:null, pitch:null, crowd:null, stands:[], bench:[], cones:[], board:null, seats:null});
  }
});
