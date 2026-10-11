/* ============ LIFE: the places people work ============
   Every job has a place of its own now, and it stays where it is: the Corner Café next to your block, the
   Neighbourhood Store up Strada Morii, the courier depot down Bulevardul Gării, and the better jobs out in Dumbrava,
   in Arini. A unit is the same shop shell wherever it stands — a dark shopfront with a door and big windows, a lit
   fascia, the inside furnished for the trade — built in its own frame (the one the first workplace was drawn in: x 2–15,
   z −9…3, front at z 3) and turned and moved to its street. You clock in only at your own job's place. */
import {THREE, W, LH, box, rbox, wall, solid, floor, ramp, spot, label, textTex, lightSrc, pool, reseed, rnd, pick, doorway, extrude} from "./build.js";
import {frame, rb, cy, sph, fsolid, worldPt, shelfUnit, desk, monitor, chair, cafeChair, bike, cone, ball, bibs, kitBag, PC} from "./props.js";
import {staffer, regulars, jobRole} from "./npc.js";
import {facer, decoWin, pilasters, roofTop, downpipe} from "./home.js";

const G = () => (typeof S !== "undefined" ? S : null);
/* where each job is (game.js JOB_WHERE: its zone, the area, the way there); the builders add .door, the point on the
   pavement outside it, for the compass and for anyone giving directions */
export const JOB_PLACE = JOB_WHERE;
export const CITY = PLACES.city, TOWN = PLACES.town, HOOD = PLACES.hood;

/* ---------- a frame to build a unit in: the first workplace's own coordinates, turned to face and moved ----------
   face: which way the shopfront looks ("+z" as the first one, "-z", "+x", "-x"); (cx, cz): where the unit's middle is */
const PIV = [8.5, -3];
export function TX(face, cx, cz){
  const th = {"+z":0, "+x":Math.PI/2, "-z":Math.PI, "-x":-Math.PI/2}[face] || 0, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  const T = {face, th, cx, cz,
    p:(x, z) => { const dx = x - PIV[0], dz = z - PIV[1]; return [cx + dx*c + dz*s, cz - dx*s + dz*c]; },
    ry:r => r + th};
  T.box = (x0, y0, z0, x1, y1, z1, color, o) => { const [a, b] = T.p(x0, z0), [d, e] = T.p(x1, z1); return box(Math.min(a, d), y0, Math.min(b, e), Math.max(a, d), y1, Math.max(b, e), color, o); };
  T.solid = (x0, x1, z0, z1, y0, y1) => { const [a, b] = T.p(x0, z0), [d, e] = T.p(x1, z1); return solid(Math.min(a, d), Math.max(a, d), Math.min(b, e), Math.max(b, e), y0, y1); };
  T.floor = (x0, x1, z0, z1, h) => { const [a, b] = T.p(x0, z0), [d, e] = T.p(x1, z1); floor(Math.min(a, d), Math.max(a, d), Math.min(b, e), Math.max(b, e), h); };
  T.f = (x, z, r = 0, y = 0) => { const [a, b] = T.p(x, z); return frame(a, b, r + th, y); };
  T.aim = (lo, hi) => { const [a, b] = T.p(lo[0], lo[2]), [d, e] = T.p(hi[0], hi[2]); return [[Math.min(a, d), lo[1], Math.min(b, e)], [Math.max(a, d), hi[1], Math.max(b, e)]]; };
  // a wall in the unit's frame: along x or z at `fixed`, from a to b, its holes along it; turned, it may run the other way
  T.wall = (axis, fixed, a, b, y0, y1, t, color, holes = [], o = {}) => {
    const at = u => axis === "x" ? T.p(u, fixed) : T.p(fixed, u);
    const [ax, az] = at(a), [bx, bz] = at(b), alongX = Math.abs(ax - bx) > Math.abs(az - bz);
    const nfix = alongX ? az : ax, lo = alongX ? Math.min(ax, bx) : Math.min(az, bz), hi = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const hs = holes.map(h => { const [p0x, p0z] = at(h[0]), [p1x, p1z] = at(h[1]); const u0 = alongX ? p0x : p0z, u1 = alongX ? p1x : p1z; return [Math.min(u0, u1), Math.max(u0, u1), h[2], h[3], h[4]]; });
    return wall(alongX ? "x" : "z", nfix, lo, hi, y0, y1, t, color, hs, o);
  };
  return T;
}
// a shop sign on the fascia, lettered to fit
function fascia(T, text, sub, color){
  const cw = 2048, w = 11.6, h = .52, ch = Math.max(96, Math.round(cw*h/w));
  const fit = (g, s, px, wt, fam, max) => { let fs = px; g.font = `${wt} ${fs}px ${fam}`; const tw = g.measureText(s).width; if (tw > max){ fs = Math.floor(fs*max/tw); g.font = `${wt} ${fs}px ${fam}`; } };
  const t = textTex(cw, ch, g => {
    g.fillStyle = color; g.fillRect(0, 0, cw, ch); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, cw, Math.max(3, ch*.05));
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    fit(g, text, Math.round(ch*.52), 800, `"Barlow Condensed", "Arial Narrow", sans-serif`, cw*.88); g.fillText(text, cw/2, ch*.37);
    fit(g, sub, Math.round(ch*.2), 700, `"Barlow", sans-serif`, cw*.8); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(sub, cw/2, ch*.8);
  });
  const [x, z] = T.p(8.5, 3.105);
  label(t, x, 3.19, z, w, h, T.ry(0), {glow:.75, rough:.4});
}

/* the shop door, as the first workplace had it: a lined opening in the front wall (local x from x0 to x1, the wall's
   middle at zw, t thick), a stone threshold level with the pavement and, inside, a short sloped mat down to the shop
   floor — nothing stands up across the doorway and you never drop off a step. Turned with the unit. */
function shopDoor(T, x0, x1, zw, t, h, color){
  const [ax, az] = T.p(x0, zw), [bx, bz] = T.p(x1, zw), alongX = Math.abs(ax - bx) > Math.abs(az - bz);
  const s0 = alongX ? Math.min(ax, bx) : Math.min(az, bz), s1 = alongX ? Math.max(ax, bx) : Math.max(az, bz);
  doorway(alongX ? "x" : "z", alongX ? az : ax, s0, s1, 0, h, t, {color, arch:.08, proud:.04, key:"metal"});
  const zi = zw - t/2;
  T.box(x0 + .03, 0, zi, x1 - .03, .12, zw + t/2, 0xb4afa6, {tex:"concrete", ao:false, jit:0}); T.floor(x0, x1, zi, zw + t/2, .12);
  // the mat: a wedge whose profile runs in along the unit's depth (world z for a unit facing ±z, world x for ±x)
  const A = z => { const [px, pz] = T.p(x0, z); return alongX ? pz : px; };
  extrude(alongX ? "z" : "x", [[A(zi), 0], [A(zi), .12], [A(zi - .8), .022], [A(zi - .8), 0]], s0 + .03, s1 - .03, 0x3a3f46, {jit:0});
  const lo = Math.min(A(zi), A(zi - .8)), hi = Math.max(A(zi), A(zi - .8));
  if (alongX) ramp(s0 + .03, s1 - .03, lo, hi, "z", A(zi), A(zi - .8), .12, .022);
  else ramp(lo, hi, s0 + .03, s1 - .03, "x", A(zi), A(zi - .8), .12, .022);
}

/* ---------- what the inside of each trade looks like ---------- */
function decor(id, T, ctx){
  const sp = (x, z) => T.p(x, z), F = (x, z, r = 0, y = 0) => T.f(x, z, r, y);
  const goods = (f, lx, lz, w, levels, seed) => {
    reseed(seed); const cols = [0xd8432f, 0xf2c230, 0x2c66b8, 0x3f9a52, 0xf07a22, 0x7c3aed, 0xe8e4da, 0x1f9a8a];
    for (let L = 0; L < levels.length; L++){ let x = -w/2 + .05; while (x < w/2 - .12){ const bw = .08 + rnd()*.1, bh = .12 + rnd()*.16; rb(f, lx + x + bw/2, levels[L] + .03, lz, bw, bh, .2, .015, pick(cols), {jit:.08}); x += bw + .015; } }
  };
  const shelf = (x, z, r, w, h, c) => { const [a, b] = sp(x, z); return shelfUnit(a, b, T.ry(r), w, h, c); };
  const person = e => { const [x, z] = sp(e.x, e.z), o = Object.assign({}, e, {x, z, ry:T.ry(e.ry || 0)});
    if (e.browse){ o.browse = {a:sp(e.browse.a[0], e.browse.a[1]), b:sp(e.browse.b[0], e.browse.b[1]), face:T.ry(e.browse.face)}; }
    return o; };
  if (id === "cafe"){
    const f = F(8.5, -3.6, Math.PI);
    rb(f, 0, 0, 0, 5.2, 1.0, .7, .04, 0x5b3d24); rb(f, 0, 1.0, 0, 5.3, .05, .8, .02, 0xe9e2d4, {key:"gloss"});
    rb(f, -1.4, 1.05, 0, .5, .45, .4, .06, 0x8f979e, {key:"metal"}); rb(f, -1.4, 1.18, -.22, .3, .1, .05, .02, 0x2b2f34);
    for (let i = 0; i < 6; i++) cy(f, .2 + i*.18, 1.05, .1, .04, .035, .09, PC.white, {seg:10});
    fsolid(f, 0, 0, 5.3, .8, 0, 1.05);
    const seats = [];
    for (const [x, z] of [[5.6, -.6], [8.8, .6], [12, -.6]]){
      const t = F(x, z); cy(t, 0, 0, 0, .05, .25, .04, PC.dark); cy(t, 0, .04, 0, .04, .04, .7, PC.dark, {seg:8}); cy(t, 0, .74, 0, .38, .38, .04, 0xf2efe8, {seg:18});
      for (const s of [-1, 1]){
        const [cx, cz] = sp(x + s*.68, z), top = cafeChair(cx, cz, T.ry(-s*Math.PI/2)), [tx, tz] = sp(x, z);
        seats.push({x:x + s*.68, z, ry:-s*Math.PI/2, seat:top, table:{x:tx, z:tz, top:.78, r:.38}});
        cy(t, s*.2, .78, (s > 0 ? .06 : -.06), .035, .03, .08, PC.white, {seg:10});
      }
      T.solid(x - 1, x + 1, z - .5, z + .5, 0, .8);
    }
    const at = (i, role, seed, typing, when) => { const q = seats[i], d = .68;
      return {role, seed, x:q.x, z:q.z, ry:q.ry, solid:false, when, state:typing ? {mode:"typing", keys:false, seat:q.seat, desk:q.table.top, reach:d - q.table.r + .17} : {mode:"sit", seat:q.seat}}; };
    const span = (...r) => m => { for (let i = 0; i < r.length; i += 2) if (m >= r[i]*60 && m < r[i + 1]*60) return true; return false; };
    return {title:"CORNER CAFÉ", sub:"COFFEE · CAKES · BREAKFAST", color:"#6b3f22", floor:"planks", staff:[8.5, -4.22, 0],
      customers:[at(0, "customer", 71, true, span(7.25, 11.5, 14.5, 18.75)), at(3, "customer", 83, false, span(9, 13, 16, 20.5)),
        at(4, "customer", 97, true, span(11.75, 14.75, 17.5, 21)), at(5, "customer", 109, false, span(12, 14.5, 17.25, 20.75))].map(person)};
  }
  if (id === "store"){
    for (const x of [5.5, 9, 12.5]){ const f = shelf(x, -1.6, Math.PI/2, 3.4, 1.6, 0x5a6168); goods(f, 0, .12, 3.2, [.08, .61, 1.14], x*31); goods(f, 0, -.12, 3.2, [.08, .61, 1.14], x*37); }
    const c = F(13.9, .2, -Math.PI/2); rb(c, 0, 0, 0, 1.6, .95, .6, .04, 0x3b4249); rb(c, 0, .95, 0, 1.7, .05, .7, .02, 0xd9cdb8, {key:"gloss"}); rb(c, .4, 1.0, 0, .34, .16, .28, .03, 0x23272b);
    fsolid(c, 0, 0, 1.7, .7, 0, 1.0);
    return {title:"NEIGHBOURHOOD STORE", sub:"GROCERIES · HOUSEHOLD · OPEN LATE", color:"#8a2d2d", floor:"shopfloor", staff:[14.55, .2, -Math.PI/2],
      customers:[person({role:"customer", seed:61, x:6.2, z:-1.4, ry:-Math.PI/2, browse:{a:[6.2, -2.9], b:[6.2, -.3], face:-Math.PI/2}, when:m => m >= 8*60 && m < 21*60, solid:[.5, .5]})]};
  }
  if (id === "courier"){
    for (const x of [4, 7, 10]){ const f = shelf(x, -4.6, 0, 2.6, 1.9, 0x4b5258); reseed(x*7);
      for (let L = 0; L < 3; L++) for (let k = 0; k < 5; k++) rb(f, -1.05 + k*.5, .12 + L*.6, 0, .4 + rnd()*.05, .3 + rnd()*.15, .35, .03, 0xc49a62, {jit:.1}); }
    const [bx, bz] = sp(12, -1.5); bike(bx, bz, T.ry(Math.PI/2), {tier:3});
    for (const [x, z, r] of [[6, .4, .3], [7.2, .2, -.2]]){ const [a, b] = sp(x, z); kitBag(a, b, T.ry(r), 0x1b6f9a); }
    // the sorting table, parcels waiting on it
    const st = F(8.8, -1.6); rb(st, 0, 0, 0, 2.4, .85, .9, .03, 0x6b5a44); reseed(5); for (let k = 0; k < 6; k++) rb(st, -.9 + k*.35, .85, (k % 2 ? .18 : -.15), .28, .18 + rnd()*.1, .24, .02, 0xc49a62, {jit:.1});
    fsolid(st, 0, 0, 2.4, .9, 0, .9);
    return {title:"CITY COURIER", sub:"DISPATCH · DEPOT 4", color:"#1b5f8a", floor:"shopfloor", staff:[9.6, -2.6, 0]};
  }
  if (id === "gym"){
    const f = F(8.5, -3.8, Math.PI); rb(f, 0, 0, 0, 3.6, 1.05, .7, .1, 0x23272c, {seg:2}); rb(f, 0, 1.05, 0, 3.7, .05, .8, .02, PC.lime);
    fsolid(f, 0, 0, 3.7, .8, 0, 1.1);
    for (const z of [-1, .8]){ const [a, b] = sp(4.6, z); bike(a, b, T.ry(0), {tier:4}); }
    for (let i = 0; i < 6; i++) cy(F(12.6, -2 + i*.45), 0, .4, 0, .12, .12, .07, [0xe2722e, 0xe0a52e, PC.teal][i % 3], {seg:12, rz:Math.PI/2});
    return {title:"SPORTS CENTRE", sub:"MEMBERSHIPS · CLASSES · GYM", color:"#2f4a6a", floor:"rubberFloor", staff:[8.5, -4.42, 0]};
  }
  if (id === "academy"){
    for (let i = 0; i < 6; i++){ const [a, b] = sp(5 + i*1.4, -1 + (i % 2)*.8); cone(a, b, i % 2 ? PC.orange : PC.yellow); }
    for (const [x, z] of [[6, -3.5], [8.5, -3.8], [11, -3.3]]){ const [a, b] = sp(x, z); ball(a, .11, b); }
    const g = F(12.6, -2.5, -Math.PI/2); for (const s of [-1, 1]) cy(g, s*.9, 0, 0, .04, .04, 1.1, PC.white); cy(g, 0, 1.1, 0, .04, .04, 1.88, PC.white, {rz:Math.PI/2});
    const [ba, bb] = sp(4.4, -4.4); bibs(ba, .5, bb, T.ry(0), 0xd8ff3a); rb(F(4.4, -4.4), 0, 0, 0, 1.2, .5, .5, .05, 0x3b4249);
    return {title:"YOUTH ACADEMY", sub:"UNDER 9s TO UNDER 16s", color:"#2f7d4a", floor:"turf", staff:[9.4, -2.2, 0]};
  }
  if (id === "photo"){
    const t = F(10.5, -3.9); rb(t, 0, 0, 0, 3.6, 2.6, .05, .02, 0xd8dcd6); rb(t, 0, 0, .05, 3.6, .02, 1.6, .02, 0xd8dcd6);
    const tri = F(7.5, -.8, Math.PI);
    for (const a of [0, 2.1, 4.2]) cy(tri, Math.cos(a)*.25, 0, Math.sin(a)*.25, .015, .02, 1.45, PC.dark, {seg:6});
    rb(tri, 0, 1.4, 0, .22, .16, .14, .03, PC.black);
    for (const s of [-1, 1]){ const sb = F(10.5 + s*2.4, -1.5, s*.6); cy(sb, 0, 0, 0, .02, .02, 1.7, PC.dark, {seg:6}); rb(sb, 0, 1.6, 0, .7, .7, .3, .05, 0xf8f8f4, {key:"lamp"}); }
    return {title:"PHOTO STUDIO", sub:"PORTRAITS · SPORT · EVENTS", color:"#3a3346", floor:"planks", staff:[10.5, -2.9, 0]};
  }
  // video editing
  for (const x of [5, 9]){
    const [a, b] = sp(x, -3.6), d = desk(a, b, T.ry(0), 1.8, 0x3b3f45);
    const tx = textTex(256, 160, g => { g.fillStyle = "#14171c"; g.fillRect(0, 0, 256, 160); for (let i = 0; i < 6; i++){ g.fillStyle = ["#2c66b8", "#c8463a", "#3f9a52", "#f2c230"][i % 4]; g.fillRect(14 + i*38, 110, 32, 12); } g.fillStyle = "#c8f060"; g.fillRect(14, 132, 228, 3); g.fillStyle = "#2a3646"; g.fillRect(14, 14, 228, 86); });
    monitor(d, -.4, .77, -.12, tx, .55); monitor(d, .4, .77, -.12, tx, .55);
    rb(d, 0, .77, .18, .44, .018, .14, .006, 0x1d1f22);
    const [ca, cb] = sp(x, -3.0); chair(ca, cb, T.ry(Math.PI));
  }
  return {title:"CUT & GRADE", sub:"VIDEO EDITING · HIGHLIGHT REELS", color:"#24324a", floor:"carpet", staff:[9, -3.0, Math.PI], pose:{mode:"typing", seat:.5, desk:.77, reach:.4}, noSolid:true};
}

/* ---------- the unit: shell, the trade inside, where you clock in ----------
   o.floors: storeys over the shop (0: a single-storey unit with its own roof); o.brick: the colour of the walls */
export function jobUnit(id, T, ctx, o = {}){
  const floors = o.floors == null ? 3 : o.floors, g0 = 3.2, H = g0 + floors*LH, brick = o.brick || 0xa8392f, PT = {tex:"paint"};
  const job = typeof JOBS === "object" ? JOBS.find(j => j.id === id) : null;
  // the block it is in: brick above the shop, the shop's back wall, the shell
  if (floors > 0){
    T.box(2, g0, -9, 15, H, 3, brick, {solid:true, tex:"brick", ao:false});
    const [ax, az] = T.p(2, -9), [bx, bz] = T.p(15, 3), b = {x0:Math.min(ax, bx), x1:Math.max(ax, bx), z0:Math.min(az, bz), z1:Math.max(az, bz)};
    const ff = facer(T.face, b), sideA = T.face[1] === "z" ? ["+x", "-x"] : ["+z", "-z"];
    for (let L = 1; L <= floors; L++) for (const sx of [2.2, 5.4, 8.6, 11.8]) decoWin(ff, sx, L*LH, rnd() < .3);
    pilasters(ff, 13, H, [[1.85, 12.55]]);
    for (const side of sideA) pilasters(facer(side, b), 12, H);
    for (const sx of [.18, 12.82]) downpipe(ff, sx, H);
    roofTop(b, H, {wall:brick, tex:"brick"});
  } else {
    T.box(2, g0, -9, 15, g0 + .35, 3, brick, {solid:true, tex:"paint", ao:false});
    T.box(1.9, g0 + .35, -9.1, 15.1, g0 + .45, 3.1, 0x3b4249, {key:"metal", ao:false});
  }
  T.box(2, 0, -9, 15, g0, -5, brick, {solid:true, tex:floors > 0 ? "brick" : "paint", ao:false});
  T.wall("x", 3 - .125, 2, 15, 0, g0, .25, 0x2a2e33, [[4, 5.6, 0, 2.4], [6.2, 14.4, .45, 2.8, "glass"]], {key:"metal"});
  T.wall("z", 2 + .125, -5, 3, 0, g0, .25, 0xe6e1d6, [], PT);
  T.wall("z", 15 - .125, -5, 3, 0, g0, .25, 0xe6e1d6, [], PT);
  T.wall("x", -5 + .1, 2, 15, 0, g0, .2, 0xe6e1d6, [], PT);
  T.box(6.2, .45, 3 - .14, 14.4, 2.8, 3 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  for (const x of [8.25, 10.3, 12.35]) T.box(x - .04, .45, 3 - .18, x + .04, 2.8, 3 + .02, 0x2a2e33, {key:"metal", ao:false});
  T.box(6.1, .38, 3 - .27, 14.5, .46, 3 + .1, 0xc7c2b8, {ao:false, jit:0});
  shopDoor(T, 4, 5.6, 3 - .125, .25, 2.4, 0x1f2226);
  const d = decor(id, T, ctx);
  T.box(2.25, 0, -4.9, 14.75, .02, 3 - .25, 0xffffff, {tex:d.floor || "shopfloor", ao:false, jit:0});
  T.floor(2.25, 14.75, -4.9, 3 - .25, .02);
  T.box(2.25, g0 - .05, -4.8, 14.75, g0, 3 - .25, 0xe8e3d8, {ao:false, tex:"paint"});
  // the fascia across the whole front, lit from under its lip
  T.box(2.3, 2.9, 3, 14.7, 3.48, 3.1, parseInt(d.color.slice(1), 16), {ao:false, jit:0});
  fascia(T, d.title, d.sub, d.color);
  T.box(2.6, 2.87, 3.02, 14.4, 2.9, 3.08, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  // where you clock in: a card terminal on the back wall
  const ci = T.f(13.8, -4.75);
  rb(ci, 0, 1.1, 0, .34, .46, .1, .04, 0x23272b);
  fsolid(ci, 0, 0, .34, .1, 1.1, 1.56);
  const tx = textTex(128, 160, g => { g.fillStyle = "#0e2a1d"; g.fillRect(0, 0, 128, 160); g.fillStyle = "#c8f060"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("CLOCK", 64, 52); g.fillText("IN", 64, 80); g.fillStyle = "#fff"; g.font = "14px sans-serif"; g.fillText("Tap your card", 64, 120); });
  const [wx, wz] = worldPt(ci, 0, .051); label(tx, wx, 1.33, wz, .26, .33, ci.ry, {glow:.8});
  const mine = () => typeof jobState === "function" && jobState().id === id;
  const name = d.title.replace(/[\p{L}']+/gu, w => w[0] + w.slice(1).toLowerCase());
  spot({aim:T.aim([13.4, .9, -4.9], [14.2, 1.8, -4.4]), ...(([x, z]) => ({x, z}))(T.p(13.8, -4.2)), r:1.6, near:true, label:"Clock in",
    get hint(){ return mine() ? `Start a shift · ${typeof jobLabel === "function" ? jobLabel() : "your job"}` : "Staff only"; }, hold:.3,
    run:() => mine() ? ctx.work() : ctx.note(`You don't work here. ${typeof myJob === "function" ? `Your job: ${myJob().job.name}, ${JOB_PLACE[jobState().id].how}.` : ""}`)});
  spot({...(([x, z]) => ({x, z}))(T.p(4.8, 2.4)), y:1.2, r:1.6, near:true, label:name, get hint(){ return mine() ? "Your workplace · clock in at the back" : job ? `${job.name} · ${job.ranks.map(r => r.name).join(" → ")}` : "A business"; }, hold:.2,
    run:() => ctx.note(mine() ? "Clock in at the terminal on the back wall to start a shift." : job ? `${job.name}. ${typeof jobStage === "function" && JOBS.indexOf(job)*3 > jobStage() ? "A better job than yours. Keep working up the ladder and it can be yours." : "Not your job these days."}` : "")});
  for (const [x, z] of [[6, -1], [11.5, -1]]){ const [a, b] = T.p(x, z); lightSrc({x:a, y:2.9, z:b, color:0xfff0d8, intensity:8, distance:10, indoor:true}); }
  for (const x of [5, 9, 13]) T.box(x - .5, g0 - .1, -1.2, x + .5, g0 - .05, -.8, 0xfff6e0, {key:"lamp", ao:false});
  { const [a, b] = T.p(10.3, 4.4); pool(a, b, 3.2, .125); }
  if (d.staff){ const [sx, sz] = T.p(d.staff[0], d.staff[1]); staffer(sx, sz, T.ry(d.staff[2]), {role:jobRole(id), seed:21 + id.length, pose:d.pose, noSolid:d.noSolid, when:m => m >= 6*60 + 45 && m < 23*60, minute:ctx.minute}); }
  if (d.customers) regulars(d.customers, {minute:ctx.minute});
  const [ex, ez] = T.p(4.8, 4.2);
  JOB_PLACE[id].door = {zone:o.zone || "home", x:ex, z:ez};
  // on the compass (as JOB, when it is yours) and for "where are you" (the unit's floor)
  const [ux0, uz0] = T.p(2, -9), [ux1, uz1] = T.p(15, 3);
  W.places.push({name, kind:"job", job:id, x:ex, z:ez, at:`at the ${name}`, b:{x0:Math.min(ux0, ux1), x1:Math.max(ux0, ux1), z0:Math.min(uz0, uz1), z1:Math.max(uz0, uz1)}});
  return {door:{x:ex, z:ez}, title:name};
}
