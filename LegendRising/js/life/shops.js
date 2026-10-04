/* ============ LIFE: the corner store and the place you work ============
   Two ground-floor units on your side of the street. The Mini Market on the corner sells what you
   eat and drink, open all hours, warm light spilling out at night. Next door to your block is where
   your day job is — the sign, the counter and the clutter change with whatever job you hold. */
import {THREE, W, LH, box, rbox, wall, solid, floor, ramp, spot, label, textTex, lightSrc, reseed, rnd, pick, doorway, extrude, reveal} from "./build.js";
import {frame, rb, cy, sph, fsolid, worldPt, shelfUnit, desk, monitor, chair, bike, cone, ball, bibs, kitBag, cabinet, PC} from "./props.js";
import {staffer} from "./npc.js";
import {facer, decoWin, pilasters, roofTop, downpipe} from "./home.js";

let ctx = null;
const G = () => (typeof S !== "undefined" ? S : null);

// shelves of colourful packets, so a shop reads as a shop from the door
function goods(f, lx, lz, w, levels, seed){
  reseed(seed);
  const cols = [0xd8432f, 0xf2c230, 0x2c66b8, 0x3f9a52, 0xf07a22, 0x7c3aed, 0xe8e4da, 0x1f9a8a];
  for (let L = 0; L < levels.length; L++){
    let x = -w/2 + .05;
    while (x < w/2 - .12){
      const bw = .08 + rnd()*.1, bh = .12 + rnd()*.16;
      rb(f, lx + x + bw/2, levels[L] + .03, lz, bw, bh, .2, .015, pick(cols), {jit:.08});
      x += bw + .015;
    }
  }
}
// the shop sign: lettering sized to the board it sits on (h defaults to the old 1024×192 proportion)
function fascia(text, sub, x, y, z, w, color, ry = 0, h = w*192/1024){
  const ch = Math.max(48, Math.round(1024*h/w)), k = ch/192;
  const t = textTex(1024, ch, g => {
    g.fillStyle = color; g.fillRect(0, 0, 1024, ch);
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, 1024, Math.max(3, 10*k));
    let fs = Math.round((sub ? 108 : 120)*Math.min(1, k*1.25)); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const tw = g.measureText(text).width; if (tw > 900){ fs = Math.floor(fs*900/tw); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 512, sub ? ch*.42 : ch*.52);
    if (sub){ g.font = `700 ${Math.round(34*Math.min(1, k*1.4))}px "Barlow", sans-serif`; g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(sub, 512, ch*.81); }
  });
  return label(t, x, y, z, w, h, ry, {glow:.75, rough:.4});
}
// a shop door with no leaf: a lined opening, a stone threshold level with the pavement and, inside, a short
// sloped mat down to the shop floor, so nothing stands up across the doorway and you never drop off a step
function shopDoor(x0, x1, z, t, h, color){
  doorway("x", z, x0, x1, 0, h, t, {color, arch:.08, proud:.04, key:"metal"});
  const zi = z - t/2;
  box(x0 + .03, 0, zi, x1 - .03, .12, z + t/2, 0xb4afa6, {tex:"concrete", ao:false, jit:0});
  floor(x0, x1, zi, z + t/2, .12);
  extrude("z", [[zi, 0], [zi, .12], [zi - .8, .022], [zi - .8, 0]], x0 + .03, x1 - .03, 0x3a3f46, {jit:0});
  ramp(x0 + .03, x1 - .03, zi - .8, zi, "z", zi, zi - .8, .12, .022);
}

/* ================= the Mini Market ================= */
export function miniMarket(c){
  ctx = c;
  const b = {x0:17.5, x1:30, z0:-5.5, z1:3}, H = 4.2;
  // shell: brick on the sides, a big glass front, a flat roof with a parapet
  const brick = 0x9c4e38, BT = {tex:"brick"};
  wall("x", b.z1 - .125, b.x0, b.x1, 0, H, .25, brick, [[19.9, 21.5, 0, 2.4], [22.2, 29.4, .45, 2.85]], BT);
  wall("x", b.z0 + .125, b.x0, b.x1, 0, H, .25, brick, [], BT);
  wall("z", b.x0 + .125, b.z0, b.z1, 0, H, .25, brick, [], BT);
  wall("z", b.x1 - .125, b.z0, b.z1, 0, H, .25, brick, [[-3.6, 1.6, .45, 2.85]], BT);
  roofTop(b, H, {wall:brick, tex:"brick", parapet:.5});
  const ff = facer("+z", b), fs = facer("+x", b);
  pilasters(ff, 12.5, H, [[2.2, 4.2], [4.6, 12.0]]); pilasters(fs, 8.5, H, [[1.3, 6.7]]); pilasters(facer("-x", b), 8.5, H);
  // inside, the walls are painted, not brick
  const PT = {solid:false, ao:false, jit:0, tex:"paint"};
  wall("x", b.z0 + .26, b.x0 + .25, b.x1 - .25, 0, H, .02, 0xeae6dc, [], PT);
  wall("x", b.z1 - .26, b.x0 + .25, b.x1 - .25, 0, H, .02, 0xeae6dc, [[19.9, 21.5, 0, 2.4], [22.2, 29.4, .45, 2.85]], PT);
  wall("z", b.x0 + .26, b.z0 + .25, b.z1 - .25, 0, H, .02, 0xeae6dc, [], PT);
  wall("z", b.x1 - .26, b.z0 + .25, b.z1 - .25, 0, H, .02, 0xeae6dc, [[-3.6, 1.6, .45, 2.85]], PT);
  box(b.x0 + .25, .02, b.z0 + .27, b.x1 - .25, .9, b.z0 + .3, 0x2f7d4a, {ao:false, jit:0});
  box(b.x0, H - .02, b.z0, b.x1, H, b.z1, 0xe8e3d8, {ao:false, jit:0, tex:"paint"});
  // the glass front and the side window, in slim dark frames
  box(22.2, .45, b.z1 - .14, 29.4, 2.85, b.z1 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  for (const x of [22.2, 24.6, 27, 29.4]) box(x - .05, .45, b.z1 - .2, x + .05, 2.85, b.z1 + .02, 0x2a2e33, {ao:false, key:"metal"});
  box(22.1, .38, b.z1 - .2, 29.5, .46, b.z1 + .1, 0xc7c2b8, {ao:false, jit:0}); box(22.15, 2.82, b.z1 - .2, 29.45, 2.9, b.z1 + .05, 0x2a2e33, {ao:false, key:"metal"});
  box(b.x1 - .14, .45, -3.6, b.x1 - .1, 2.85, 1.6, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  reveal("z", b.x1 - .125, -3.6, 1.6, .45, 2.85, .25, 0x2a2e33, {sill:0xc7c2b8, key:"metal"});
  for (const z of [-3.56, -1, 1.56]) box(b.x1 - .18, .45, z - .04, b.x1 - .06, 2.85, z + .04, 0x2a2e33, {key:"metal", ao:false, jit:0});
  shopDoor(19.9, 21.5, b.z1 - .125, .25, 2.4, 0x2a2e33);
  // floor, the awning over the windows and the fascia board above it
  box(b.x0 + .25, 0, b.z0 + .25, b.x1 - .25, .02, b.z1 - .25, 0xffffff, {tex:"shopfloor", ao:false, jit:0});
  for (let i = 0; i < 7; i++) rbox(22.0 + .54 + i*1.08, 2.9, b.z1 + .55, 1.08, .05, 1.1, .02, i % 2 ? 0xf2f0ea : 0x2f7d4a, {rx:.28, jit:0});
  rbox(25.8, 2.98, b.z1 + .06, 7.6, .08, .12, .03, 0x2a2e33, {key:"metal"});
  box(18.9, 3.12, b.z1, 29.9, 3.76, b.z1 + .1, 0x1f6f43, {ao:false, jit:0});
  fascia("MINI MARKET", "OPEN 24/7 · FOOD · DRINKS · RECOVERY", 24.4, 3.44, b.z1 + .105, 10.4, "#1f6f43", 0, .6);
  box(19.2, 3.09, b.z1 + .02, 29.6, 3.12, b.z1 + .08, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  // inside: the counter by the door, two aisles, fridges along the back wall, fruit by the window
  const fc = frame(18.9, 1.1, Math.PI/2);
  rb(fc, 0, 0, 0, 2.2, 1.0, .75, .05, 0x3b4249, {seg:2});
  rb(fc, 0, 1.0, 0, 2.3, .05, .85, .02, 0xd9cdb8, {key:"gloss"});
  rb(fc, -.5, 1.05, -.05, .38, .16, .3, .03, 0x23272b);                  // the till
  rb(fc, -.5, 1.21, -.12, .32, .22, .03, .02, 0x3d7a5a, {rx:-.3, key:"screen"});
  rb(fc, .55, 1.05, .1, .5, .3, .3, .03, 0xf2c230);                      // a box of chocolate bars
  fsolid(fc, 0, 0, 2.3, .85, 0, 1.05);
  staffer(18.15, 1.1, Math.PI/2, {shirt:0x2f7d4a, seed:11});
  for (const [x, z] of [[23.2, -1.6], [26.4, -1.6]]){
    const f = shelfUnit(x, z, Math.PI/2, 3.6, 1.6, 0x5a6168);
    goods(f, 0, .12, 3.4, [.08, .61, 1.14], x*13);
    goods(f, 0, -.12, 3.4, [.08, .61, 1.14], x*17);
  }
  // drinks fridges, lit from inside
  for (let i = 0; i < 4; i++){
    const fx = 21.2 + i*1.9, f = frame(fx, -4.85);
    cabinet(f, 1.8, 2.15, .7, 0xdfe3e6);
    rb(f, 0, .1, -.3, 1.7, 1.95, .02, .01, 0xf4f7ff, {key:"lamp"});
    for (let s = 0; s < 4; s++){
      rb(f, 0, .16 + s*.46, 0, 1.72, .02, .6, .01, 0xcfd8de, {key:"glass"});
      for (let k = 0; k < 9; k++){
        const c = [0x1f6fd1, 0xcf2f36, 0x3f9a52, 0xf2c230, 0xece6f4][(k + s + i) % 5];
        cy(f, -.72 + k*.18, .18 + s*.46, .05, .035, .035, .2, c, {seg:8, key:"gloss"});
      }
    }
    for (const dx of [-.45, .45]) rb(f, dx, .08, .34, .86, 1.98, .02, .01, 0xa9c2d2, {key:"glass"});
    rb(f, 0, .08, .345, .03, 1.98, .03, .01, 0x8f979e, {key:"metal"});
  }
  const fr = frame(28.4, 1.6, -Math.PI/2);
  for (let i = 0; i < 3; i++){
    rb(fr, (i - 1)*.6, .5 - i*.12, 0, .55, .25, .45, .03, 0x9a6b42, {rx:-.25});
    for (let k = 0; k < 6; k++) sph(fr, (i - 1)*.6 + (k % 3 - 1)*.14, .75 - i*.12, (k > 2 ? .08 : -.08), .07, [0xc8342c, 0xf2d04a, 0x5aa83a][i], {detail:1, flat:true});
  }
  rb(fr, 0, 0, 0, 1.9, .45, .5, .03, 0x6b4a2c);
  fsolid(fr, 0, 0, 1.9, .5, 0, .9);
  // warm light inside, day and night
  lightSrc({x:21.4, y:3.6, z:-.8, color:0xffe2b8, intensity:9, distance:11, indoor:true});
  lightSrc({x:26.8, y:3.6, z:-.8, color:0xffe2b8, intensity:9, distance:11, indoor:true});
  for (const x of [20, 23.5, 27]) for (const z of [-3, 0]) box(x - .6, H - .06, z - .15, x + .6, H - .02, z + .15, 0xfff6e0, {key:"lamp", ao:false});
  // buying: at the counter, or anywhere you look at the shelves and fridges
  spot({x:19.6, y:1.1, z:1.1, r:1.8, aim:[[18.4, 0, -.1], [19.6, 1.6, 2.3]], label:"Mini Market", hint:"Buy food, drinks and recovery", hold:.2, run:() => ctx.shop()});
  for (const [x, z] of [[23.2, -1.6], [26.4, -1.6]]) spot({aim:[[x - .5, 0, -3.5], [x + .5, 1.7, .3]], label:"Shelves", hint:"Pay at the till · or press E to shop", hold:.2, run:() => ctx.shop()});
  spot({aim:[[20.2, 0, -5.3], [28.8, 2.2, -4.5]], label:"Drinks fridges", hint:"Pay at the till · or press E to shop", hold:.2, run:() => ctx.shop()});
  floor(b.x0 + .25, b.x1 - .25, b.z0 + .25, b.z1 - .25, .02);
}

/* ================= your workplace ================= */
// what the unit looks like inside for each job
function decor(id){
  if (id === "cafe"){
    const f = frame(8.5, -3.6, Math.PI);
    rb(f, 0, 0, 0, 5.2, 1.0, .7, .04, 0x5b3d24); rb(f, 0, 1.0, 0, 5.3, .05, .8, .02, 0xe9e2d4, {key:"gloss"});
    rb(f, -1.4, 1.05, 0, .5, .45, .4, .06, 0x8f979e, {key:"metal"}); rb(f, -1.4, 1.18, -.22, .3, .1, .05, .02, 0x2b2f34);
    for (let i = 0; i < 6; i++) cy(f, .2 + i*.18, 1.05, .1, .04, .035, .09, PC.white, {seg:10});
    fsolid(f, 0, 0, 5.3, .8, 0, 1.05);
    for (const [x, z] of [[5.6, -.6], [8.8, .6], [12, -.6]]){
      const t = frame(x, z); cy(t, 0, 0, 0, .05, .25, .04, PC.dark); cy(t, 0, .04, 0, .04, .04, .7, PC.dark, {seg:8}); cy(t, 0, .74, 0, .38, .38, .04, 0xf2efe8, {seg:18});
      for (const s of [-1, 1]){ const c = frame(x + s*.62, z, s*Math.PI/2); rb(c, 0, .42, 0, .4, .05, .4, .04, 0x9a6b42); rb(c, 0, .47, -.18, .4, .42, .04, .03, 0x9a6b42); for (const q of [[-.16, -.16], [.16, -.16], [-.16, .16], [.16, .16]]) cy(c, q[0], 0, q[1], .015, .015, .42, PC.dark, {seg:6}); }
      solid(x - 1, x + 1, z - .5, z + .5, 0, .8);
    }
    return {title:"CORNER CAFÉ", sub:"COFFEE · CAKES · BREAKFAST", color:"#6b3f22", staff:[8.5, -4.45, 0]};
  }
  if (id === "store"){
    for (const x of [5.5, 9, 12.5]){ const f = shelfUnit(x, -1.6, Math.PI/2, 3.4, 1.6, 0x5a6168); goods(f, 0, .12, 3.2, [.08, .61, 1.14], x*31); goods(f, 0, -.12, 3.2, [.08, .61, 1.14], x*37); }
    return {title:"NEIGHBOURHOOD STORE", sub:"GROCERIES · HOUSEHOLD", color:"#8a2d2d", staff:[13.9, 1.4, -Math.PI/2]};
  }
  if (id === "courier"){
    for (const x of [4, 7, 10]){ const f = shelfUnit(x, -4.6, 0, 2.6, 1.9, 0x4b5258); reseed(x*7);
      for (let L = 0; L < 3; L++) for (let k = 0; k < 5; k++) rb(f, -1.05 + k*.5, .12 + L*.6, 0, .4 + rnd()*.05, .3 + rnd()*.15, .35, .03, 0xc49a62, {jit:.1}); }
    bike(12, -1.5, Math.PI/2); kitBag(6, .4, .3, 0x1b6f9a); kitBag(7.2, .2, -.2, 0x1b6f9a);
    return {title:"CITY COURIER", sub:"DISPATCH · DEPOT 4", color:"#1b5f8a", staff:[9.6, -2.6, 0]};
  }
  if (id === "gym"){
    const f = frame(8.5, -3.8, Math.PI); rb(f, 0, 0, 0, 3.6, 1.05, .7, .1, 0x23272c, {seg:2}); rb(f, 0, 1.05, 0, 3.7, .05, .8, .02, PC.lime);
    fsolid(f, 0, 0, 3.7, .8, 0, 1.1);
    bike(4.6, -1, 0); bike(4.6, .8, 0);
    for (let i = 0; i < 6; i++) cy(frame(12.6, -2 + i*.45), 0, .4, 0, .12, .12, .07, [0xe2722e, 0xe0a52e, PC.teal][i % 3], {seg:12, rz:Math.PI/2});
    return {title:"SPORTS CENTRE", sub:"MEMBERSHIPS · CLASSES · GYM", color:"#2f4a6a", staff:[8.5, -4.5, 0]};
  }
  if (id === "academy"){
    for (let i = 0; i < 6; i++) cone(5 + i*1.4, -1 + (i % 2)*.8, i % 2 ? PC.orange : PC.yellow);
    for (const [x, z] of [[6, -3.5], [8.5, -3.8], [11, -3.3]]) ball(x, .11, z);
    const g = frame(12.6, -2.5, -Math.PI/2); for (const s of [-1, 1]) cy(g, s*.9, 0, 0, .04, .04, 1.1, PC.white); cy(g, 0, 1.1, 0, .04, .04, 1.88, PC.white, {rz:Math.PI/2});
    bibs(4.4, .5, -4.4, 0, 0xd8ff3a); rb(frame(4.4, -4.4), 0, 0, 0, 1.2, .5, .5, .05, 0x3b4249);
    return {title:"YOUTH ACADEMY", sub:"UNDER 9s TO UNDER 16s", color:"#2f7d4a", staff:[9.4, -2.2, 0]};
  }
  if (id === "photo"){
    const t = frame(10.5, -3.9); rb(t, 0, 0, 0, 3.6, 2.6, .05, .02, 0xd8dcd6); rb(t, 0, 0, .05, 3.6, .02, 1.6, .02, 0xd8dcd6);
    const tri = frame(7.5, -.8, Math.PI);
    for (const a of [0, 2.1, 4.2]) cy(tri, Math.cos(a)*.25, 0, Math.sin(a)*.25, .015, .02, 1.45, PC.dark, {seg:6});
    rb(tri, 0, 1.4, 0, .22, .16, .14, .03, PC.black);
    for (const s of [-1, 1]){ const sb = frame(10.5 + s*2.4, -1.5, s*.6); cy(sb, 0, 0, 0, .02, .02, 1.7, PC.dark, {seg:6}); rb(sb, 0, 1.6, 0, .7, .7, .3, .05, 0xf8f8f4, {key:"lamp"}); }
    return {title:"PHOTO STUDIO", sub:"PORTRAITS · SPORT · EVENTS", color:"#3a3346", staff:[10.5, -2.9, 0]};
  }
  // video editing
  for (const x of [5, 9]){
    const d = desk(x, -3.6, Math.PI, 1.8, 0x3b3f45);
    const tx = textTex(256, 160, g => { g.fillStyle = "#14171c"; g.fillRect(0, 0, 256, 160); for (let i = 0; i < 6; i++){ g.fillStyle = ["#2c66b8", "#c8463a", "#3f9a52", "#f2c230"][i % 4]; g.fillRect(14 + i*38, 110, 32, 12); } g.fillStyle = "#c8f060"; g.fillRect(14, 132, 228, 3); g.fillStyle = "#2a3646"; g.fillRect(14, 14, 228, 86); });
    monitor(d, -.4, .77, .05, tx, .55); monitor(d, .4, .77, .05, tx, .55);
    chair(x, -2.7, Math.PI);
  }
  return {title:"CUT & GRADE", sub:"VIDEO EDITING · HIGHLIGHT REELS", color:"#24324a", staff:[12.6, -1.2, -Math.PI/2]};
}
export function workplace(c){
  ctx = c;
  const b = {x0:2, x1:15, z0:-9, z1:3}, floors = 4, H = floors*LH, g0 = 3.2;
  const s = G(), js = typeof jobState === "function" ? jobState() : {id:"cafe"};
  // upstairs is flats like everywhere else
  const brick = 0xa8392f, PT = {tex:"paint"};
  box(b.x0, g0, b.z0, b.x1, H, b.z1, brick, {solid:true, tex:"brick", ao:false});
  box(b.x0, 0, b.z0, b.x1, g0, -5, brick, {solid:true, tex:"brick", ao:false});
  const ff = facer("+z", b);
  for (let L = 1; L < floors; L++) for (const sx of [2.2, 5.4, 8.6, 11.8]) decoWin(ff, sx, L*LH, rnd() < .3);
  pilasters(ff, 13, H, [[1.85, 12.55]]);
  for (const side of ["+x", "-x"]){ const g = facer(side, b); pilasters(g, 12, H); }
  for (const sx of [.18, 12.82]) downpipe(ff, sx, H);
  roofTop(b, H, {wall:brick, tex:"brick"});
  // the unit itself: a dark shopfront with a lined door, mullions and a stone sill
  wall("x", b.z1 - .125, b.x0, b.x1, 0, g0, .25, 0x2a2e33, [[4, 5.6, 0, 2.4], [6.2, 14.4, .45, 2.8]], {key:"metal"});
  wall("z", b.x0 + .125, -5, b.z1, 0, g0, .25, 0xe6e1d6, [], PT);
  wall("z", b.x1 - .125, -5, b.z1, 0, g0, .25, 0xe6e1d6, [], PT);
  wall("x", -5 + .1, b.x0, b.x1, 0, g0, .2, 0xe6e1d6, [], PT);
  box(6.2, .45, b.z1 - .14, 14.4, 2.8, b.z1 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  for (const x of [8.25, 10.3, 12.35]) box(x - .04, .45, b.z1 - .18, x + .04, 2.8, b.z1 + .02, 0x2a2e33, {key:"metal", ao:false});
  box(6.1, .38, b.z1 - .2, 14.5, .46, b.z1 + .1, 0xc7c2b8, {ao:false, jit:0});
  shopDoor(4, 5.6, b.z1 - .125, .25, 2.4, 0x1f2226);
  box(b.x0 + .25, 0, -4.9, b.x1 - .25, .02, b.z1 - .25, 0xffffff, {tex:js.id === "cafe" || js.id === "photo" ? "planks" : "shopfloor", ao:false, jit:0});
  floor(b.x0 + .25, b.x1 - .25, -4.9, b.z1 - .25, .02);
  box(b.x0 + .25, g0 - .05, -4.9, b.x1 - .25, g0, b.z1 - .25, 0xe8e3d8, {ao:false, tex:"paint"});
  const d = decor(js.id);
  // the fascia: a board in the business's colour across the whole front, lettered, lit from under its lip
  box(2.3, 2.9, b.z1, 14.7, 3.48, b.z1 + .1, parseInt(d.color.slice(1), 16), {ao:false, jit:0});
  fascia(d.title, d.sub, 8.5, 3.19, b.z1 + .105, 11.6, d.color, 0, .52);
  box(2.6, 2.87, b.z1 + .02, 14.4, 2.9, b.z1 + .08, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  // where you clock in
  const ci = frame(13.8, -4.75);
  rb(ci, 0, 1.1, 0, .34, .46, .1, .04, 0x23272b);
  const tx = textTex(128, 160, g => { g.fillStyle = "#0e2a1d"; g.fillRect(0, 0, 128, 160); g.fillStyle = "#c8f060"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("CLOCK", 64, 52); g.fillText("IN", 64, 80); g.fillStyle = "#fff"; g.font = "14px sans-serif"; g.fillText("Tap your card", 64, 120); });
  const [wx, wz] = worldPt(ci, 0, .051); label(tx, wx, 1.33, wz, .26, .33, 0, {glow:.8});
  spot({aim:[[13.4, .9, -4.9], [14.2, 1.8, -4.4]], x:13.8, z:-4.2, r:1.6, near:true, label:"Clock in", get hint(){ return `Start a shift · ${typeof jobLabel === "function" ? jobLabel() : "your job"}`; }, hold:.3, run:() => ctx.work()});
  spot({x:4.8, y:1.2, z:2.4, r:1.6, near:true, label:d.title.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()), hint:"Your workplace · clock in at the back", hold:.2, run:() => ctx.note("Clock in at the terminal on the back wall to start a shift.")});
  lightSrc({x:6, y:2.9, z:-1, color:0xfff0d8, intensity:8, distance:10, indoor:true});
  lightSrc({x:11.5, y:2.9, z:-1, color:0xfff0d8, intensity:8, distance:10, indoor:true});
  for (const x of [5, 9, 13]) box(x - .5, g0 - .1, -1.2, x + .5, g0 - .05, -.8, 0xfff6e0, {key:"lamp", ao:false});
  if (d.staff) staffer(d.staff[0], d.staff[1], d.staff[2], {shirt:0x3b4249, seed:21});
  return {door:{x:4.8, z:4.2}};
}
