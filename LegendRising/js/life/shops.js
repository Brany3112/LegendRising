/* ============ LIFE: the corner store ============
   The Mini Market on the corner of your street sells what you eat and drink, open all hours, warm light spilling
   out at night. (The places people work, the café next door among them, are life/units.js.)
   Owner: WP-G (Stage 1). Contract: DESIGN 3.8.6: on the day of the notice-board event "shop" (stocktaking) the
   Mini Market sells nothing and its customers stay away; the furniture store is never part of it. */
import {box, rbox, wall, solid, floor, ramp, spot, label, textTex, lightSrc, pool, reseed, rnd, pick, doorway, extrude, reveal} from "./build.js";
import {frame, rb, cy, sph, fsolid, shelfUnit, cabinet} from "./props.js";
import {staffer, regulars} from "./npc.js";
import {facer, pilasters, roofTop} from "./home.js";

let ctx = null;
// shut for stocktaking today (events.js "shop"): nothing for sale, and the way it is said
const shut = () => typeof lifeEventOn === "function" && lifeEventOn("shop");
const CLOSED = "Closed for stocktaking. Back tomorrow.";
const shop = () => shut() ? ctx.note(CLOSED) : ctx.shop();

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
  // drawn at a fixed resolution along the board, so a long, low fascia keeps crisp letters; the name and the line
  // under it each get their own band of the height, and both shrink to fit the width
  const cw = 2048, ch = Math.max(96, Math.round(cw*h/w));
  const fit = (g, s, px, wt, fam, max) => { let fs = px; g.font = `${wt} ${fs}px ${fam}`; const tw = g.measureText(s).width; if (tw > max){ fs = Math.floor(fs*max/tw); g.font = `${wt} ${fs}px ${fam}`; } };
  const t = textTex(cw, ch, g => {
    g.fillStyle = color; g.fillRect(0, 0, cw, ch);
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, cw, Math.max(3, ch*.05));
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    fit(g, text, Math.round(ch*(sub ? .52 : .66)), 800, `"Barlow Condensed", "Arial Narrow", sans-serif`, cw*.88);
    g.fillText(text, cw/2, ch*(sub ? .37 : .53));
    if (sub){ fit(g, sub, Math.round(ch*.2), 700, `"Barlow", sans-serif`, cw*.8); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(sub, cw/2, ch*.8); }
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
  wall("x", b.z1 - .125, b.x0, b.x1, 0, H, .25, brick, [[19.9, 21.5, 0, 2.4], [22.2, 29.4, .45, 2.85, "glass"]], BT);
  wall("x", b.z0 + .125, b.x0, b.x1, 0, H, .25, brick, [], BT);
  wall("z", b.x0 + .125, b.z0, b.z1, 0, H, .25, brick, [], BT);
  wall("z", b.x1 - .125, b.z0, b.z1, 0, H, .25, brick, [[-3.6, 1.6, .45, 2.85, "glass"]], BT);
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
  box(b.x0 + .27, H - .02, b.z0 + .27, b.x1 - .27, H, b.z1 - .27, 0xe8e3d8, {ao:false, jit:0, tex:"paint"});   // the ceiling, inside the skins
  // the glass front and the side window, in slim dark frames
  box(22.2, .45, b.z1 - .14, 29.4, 2.85, b.z1 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  // lined like the side window, so neither the brick nor the paint skin shows its cut edge round the glass
  reveal("x", b.z1 - .125, 22.2, 29.4, .45, 2.85, .25, 0x2a2e33, {sill:0xc7c2b8, key:"metal"});
  for (const x of [24.6, 27]) box(x - .05, .45, b.z1 - .2, x + .05, 2.85, b.z1 + .035, 0x2a2e33, {ao:false, key:"metal", jit:0});
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
  staffer(18.25, 1.1, Math.PI/2, {role:"shopkeeper", shirt:0x2f7d4a, seed:11, minute:ctx.minute});        // .22 behind the counter (x 18.475)
  // customers: one paying at the till (they come and go through the day), one browsing the middle aisle
  const open = m => m >= 6*60 + 30 && m < 23*60 + 30 && !shut();
  regulars([
    {role:"customer", seed:31, x:19.68, z:1.75, ry:-Math.PI/2, state:{mode:"counter", counter:1.05, reach:.5}, when:m => open(m) && m % 41 < 27, solid:[.44, .44]},
    {role:"customer", seed:57, x:23.95, z:-1.5, ry:-Math.PI/2, browse:{a:[23.95, -3.0], b:[23.95, -.1], face:-Math.PI/2}, when:m => open(m) && (m < 22*60 || m % 53 < 20), solid:[.5, .5]}
  ], {minute:ctx.minute});
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
  pool(25.8, 4.5, 3.4, .125); pool(20.7, 4.3, 2.2, .125);            // its light spilling out over the pavement at night
  for (const x of [20, 23.5, 27]) for (const z of [-3, 0]) box(x - .6, H - .06, z - .15, x + .6, H - .02, z + .15, 0xfff6e0, {key:"lamp", ao:false});
  // buying: at the counter, or anywhere you look at the shelves and fridges
  spot({x:19.6, y:1.1, z:1.1, r:1.8, aim:[[18.4, 0, -.1], [19.6, 1.6, 2.3]], label:"Mini Market", get hint(){ return shut() ? CLOSED : "Buy food, drinks and recovery"; }, run:shop});
  for (const [x, z] of [[23.2, -1.6], [26.4, -1.6]]) spot({aim:[[x - .5, 0, -3.5], [x + .5, 1.7, .3]], label:"Shelves", get hint(){ return shut() ? CLOSED : "Pay at the till · or press E to shop"; }, run:shop});
  spot({aim:[[20.2, 0, -5.3], [28.8, 2.2, -4.5]], label:"Drinks fridges", get hint(){ return shut() ? CLOSED : "Pay at the till · or press E to shop"; }, run:shop});
  floor(b.x0 + .25, b.x1 - .25, b.z0 + .25, b.z1 - .25, .02);
}
