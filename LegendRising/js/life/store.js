/* ============ LIFE: the furniture store ============
   Mobila Bună, on the ground floor of the block to your right as you come out of your own: a tier-2 furniture store
   (game.js FURN, store "furn"). The big things stand about on the floor with a price on them — hold E on one to buy it
   and it is boxed up in front of you, into your arms (a box, inv.js), to carry home and put down in build mode. The
   small things — bulbs, locks, wallpaper — are on the rack by the till: take them off it (left click), put them on the
   belt (left click), the cashier scans them through, you pay at the card reader, and they wait for you at the end of
   the counter. Walk out with anything you have not paid for and the alarm goes off. */
import {THREE, W, LH, box, rbox, wall, solid, floor, spot, label, textTex, lightSrc, pool, reseed, rnd} from "./build.js";
import {frame, rb, cy, fsolid, worldPt, PC} from "./props.js";
import {staffer, VIEW} from "./npc.js";
import {facer, decoWin, pilasters, roofTop, downpipe} from "./home.js";
import {pieceModel} from "./furniture.js";
import * as INV from "./inv.js";

const G = () => (typeof S !== "undefined" ? S : null);
const eur = n => "€" + Math.round(n).toLocaleString("en-GB");
export const STORE = {name:"Mobila Bună", sub:"FURNITURE & HOME · TIER 2", b:{x0:-31, x1:-16, z0:-9, z1:3}, open:8*60, close:21*60};
let ctx = null;

// a price card on a little stand in front of a piece, in the shop's colours
function priceTag(x, z, ry, name, price, brand = "MOBILA BUNĂ", col = "#c8463a"){
  const f = frame(x, z, ry);
  cy(f, 0, 0, 0, .1, .12, .03, 0x2b2f34, {seg:12}); cy(f, 0, .03, 0, .012, .012, .78, 0x8f979e, {seg:6, key:"metal"});
  const t = textTex(256, 160, g => {
    g.fillStyle = "#f6f2e8"; g.fillRect(0, 0, 256, 160); g.fillStyle = col; g.fillRect(0, 0, 256, 34);
    g.fillStyle = "#fff"; g.font = "800 22px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(brand, 128, 18);
    g.fillStyle = "#1d2328"; g.font = "700 22px 'Barlow', sans-serif";
    const words = name.split(" "); let line = "", y = 62; const lines = [];
    for (const w of words){ const t2 = (line + " " + w).trim(); if (g.measureText(t2).width > 230){ lines.push(line); line = w; } else line = t2; } lines.push(line);
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, 128, y + i*26));
    g.fillStyle = col; g.font = "800 40px 'Barlow Condensed', sans-serif"; g.fillText(eur(price), 128, 136);
  });
  const [lx, lz] = worldPt(f, 0, .012);
  label(t, lx, .9, lz, .3, .19, ry, {rough:.6});
  box(...(() => { const [ax, az] = worldPt(f, -.16, -.004), [bx, bz] = worldPt(f, .16, .004); return [Math.min(ax, bx), .78, Math.min(az, bz), Math.max(ax, bx), 1.0, Math.max(az, bz)]; })(), 0x2b2f34, {ao:false, jit:0});
}
// a puff of dust and packing paper where a piece was: a few soft sprites that swell, rise and fade
let PUFF = null;
function puff(x, y, z){
  if (!PUFF){
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, "rgba(235,228,214,.95)"); gr.addColorStop(.6, "rgba(220,212,196,.45)"); gr.addColorStop(1, "rgba(210,200,184,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    PUFF = new THREE.CanvasTexture(c);
  }
  const ps = [];
  for (let i = 0; i < 14; i++){
    const m = new THREE.Sprite(new THREE.SpriteMaterial({map:PUFF, transparent:true, depthWrite:false, opacity:.9}));
    m.position.set(x + (Math.random() - .5)*.8, y + Math.random()*.6, z + (Math.random() - .5)*.8); m.scale.setScalar(.3);
    m.userData.v = new THREE.Vector3((Math.random() - .5)*.8, .5 + Math.random()*.6, (Math.random() - .5)*.8);
    W.scene.add(m); ps.push(m);
  }
  let t = 0;
  const an = dt => {
    if (t > 1.1) return;
    t += dt;
    for (const m of ps){ m.position.addScaledVector(m.userData.v, dt); m.scale.setScalar(.3 + t*1.4); m.material.opacity = Math.max(0, .9*(1 - t/1.1)); }
    if (t > 1.1) for (const m of ps){ W.scene.remove(m); m.material.dispose(); }
  };
  W.anims.push(an);
}

export function furnitureStore(c){
  ctx = c;
  const b = STORE.b, floors = 4, H = floors*LH, g0 = LH, brick = 0x9b5a3c;
  W.store = {x0:b.x0 + .25, x1:b.x1 - .25, z0:b.z0 + .25, z1:b.z1 - .1};
  // upstairs: flats, like the rest of the street
  box(b.x0, g0, b.z0, b.x1, H, b.z1, brick, {solid:true, tex:"brick", ao:false});
  const ff = facer("+z", b);
  for (let L = 1; L < floors; L++) for (const sx of [1.6, 4.6, 7.6, 10.6, 13.4]) decoWin(ff, sx, L*LH, rnd() < .3);
  pilasters(ff, 15, H, [[1.0, 14.0]]);
  for (const side of ["+x", "-x"]) pilasters(facer(side, b), 12, H);
  for (const sx of [.18, 14.82]) downpipe(ff, sx, H);
  roofTop(b, H, {wall:brick, tex:"brick"});
  // the shop: a dark shopfront with big windows and the door at the end nearest your block
  const dx0 = -18.75, dx1 = -17.15, glass = [[-30.2, -19.4]];
  wall("x", b.z1 - .125, b.x0, b.x1, 0, g0, .25, 0x2a2e33, [[dx0, dx1, 0, 2.4], ...glass.map(([a, z]) => [a, z, .45, 2.8, "glass"])], {key:"metal"});
  const PT = {tex:"paint"};
  wall("z", b.x0 + .125, b.z0, b.z1, 0, g0, .25, 0xe9e4d8, [], PT);
  wall("z", b.x1 - .125, b.z0, b.z1, 0, g0, .25, 0xe9e4d8, [], PT);
  wall("x", b.z0 + .125, b.x0, b.x1, 0, g0, .25, 0xe9e4d8, [], PT);
  for (const [a, z] of glass){
    box(a, .45, b.z1 - .14, z, 2.8, b.z1 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (let x = a + 2.7; x < z - .5; x += 2.7) box(x - .04, .45, b.z1 - .18, x + .04, 2.8, b.z1 + .02, 0x2a2e33, {key:"metal", ao:false});
    box(a - .1, .38, b.z1 - .27, z + .1, .46, b.z1 + .1, 0xc7c2b8, {ao:false, jit:0});
  }
  // the door: a lined opening, a mat inside, the step level with the pavement
  box(dx0 + .03, 0, b.z1 - .25, dx1 - .03, .12, b.z1, 0xb4afa6, {tex:"concrete", ao:false, jit:0}); floor(dx0, dx1, b.z1 - .25, b.z1, .12);
  box(dx0, 0, b.z1 - 1.1, dx1, .02, b.z1 - .25, 0x3a3f46, {ao:false, jit:0});
  // inside: shop floor, painted walls, a ceiling, panel lights
  box(b.x0 + .25, 0, b.z0 + .25, b.x1 - .25, .02, b.z1 - .25, 0xffffff, {tex:"shopfloor", ao:false, jit:0});
  floor(b.x0 + .25, b.x1 - .25, b.z0 + .25, b.z1 - .25, .02);
  box(b.x0 + .25, g0 - .04, b.z0 + .25, b.x1 - .25, g0, b.z1 - .25, 0xe8e3d8, {ao:false, tex:"paint"});
  box(b.x0 + .26, .02, b.z0 + .26, b.x1 - .26, .6, b.z0 + .28, 0xc8463a, {ao:false, jit:0});           // a red dado along the back
  for (const x of [-28, -23.5, -19]) for (const z of [-6, -1.5]) box(x - .7, g0 - .08, z - .2, x + .7, g0 - .04, z + .2, 0xfff6e0, {key:"lamp", ao:false});
  for (const [x, z] of [[-27, -4], [-20, -4], [-23.5, 0]]) lightSrc({x, y:g0 - .4, z, color:0xfff2dc, intensity:8, distance:11, indoor:true});
  pool(-24.5, 4.5, 3.4, .125);
  // the fascia: the name across the front, lit from under its lip
  box(b.x0 + .3, 2.9, b.z1, b.x1 - .3, 3.5, b.z1 + .1, 0x8a2d2d, {ao:false, jit:0});
  const ft = textTex(2048, 96, g => {
    g.fillStyle = "#8a2d2d"; g.fillRect(0, 0, 2048, 96); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, 2048, 5);
    g.fillStyle = "#fff"; g.font = "800 54px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("MOBILA BUNĂ", 760, 50);
    g.font = "700 30px 'Barlow', sans-serif"; g.fillStyle = "rgba(255,255,255,.85)"; g.fillText("FURNITURE · BEDS · FRIDGES · HOME", 1380, 52);
  });
  label(ft, (b.x0 + b.x1)/2, 3.2, b.z1 + .105, 14.4, .6, 0, {glow:.75, rough:.4});
  box(b.x0 + .5, 2.87, b.z1 + .02, b.x1 - .5, 2.9, b.z1 + .08, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  spot({x:-17.95, y:1.2, z:b.z1 + .4, r:1.6, near:true, label:"Mobila Bună", get hint(){ return storeOpen() ? "Furniture store · open till 9:00 PM" : "Closed · opens at 8:00 AM"; }, hold:.2,
    run:() => ctx.note(storeOpen() ? "Beds, fridges, tables and chairs on the floor; bulbs, locks and wallpaper on the rack by the till." : "Closed. Mobila Bună is open 8:00 AM – 9:00 PM.")});

  /* ---------- the floor: the big things, each on show with its price ---------- */
  const show = [
    ["bed2", -28.9, -7.1, Math.PI], ["fridge2", -26.0, -8.25, 0], ["wardrobe", -24.0, -8.3, 0], ["shelf", -22.2, -8.45, 0], ["sofa", -19.6, -7.75, 0], ["tv", -17.1, -8.35, 0],
    ["table", -27.6, -3.4, 0], ["chair", -27.6, -2.55, Math.PI], ["rug", -24.0, -3.6, 0], ["laptop", -24.0, -3.55, 0], ["lamp", -30.1, -1.0, 0], ["plant", -30.0, 1.9, 0]
  ];
  for (const [id, x, z, ry] of show){
    const f = FURN[id];
    const m = pieceModel(id); if (!m) continue;
    m.g.position.set(x, id === "laptop" ? .46 : 0, z); m.g.rotation.y = ry; W.scene.add(m.g);
    if (id === "laptop") rbox(x, 0, z, .5, .44, .4, .03, 0xe6e2d8);              // a white plinth to show it on
    const q = Math.round(ry/(Math.PI/2)) & 1, hw = (q ? m.len : m.w)/2, hd = (q ? m.w : m.len)/2;
    if (!m.flat) solid(x - hw, x + hw, z - hd, z + hd, 0, Math.min(1.9, id === "laptop" ? .7 : m.h));
    // the price on a stand in front of it (towards the middle of the shop)
    const tz = z + (z < -5 ? hd + .35 : hd + .3), tx = x + (id === "chair" ? .45 : id === "laptop" ? .45 : 0);
    priceTag(tx, tz, 0, f.name, f.price);
    const aim = [[x - hw - .05, 0, z - hd - .05], [x + hw + .05, Math.min(2.1, id === "laptop" ? .75 : m.h + .1), z + hd + .05]];
    const sp = spot({aim, label:f.name, get hint(){ return `${eur(f.price)} · ${f.desc}`; }, hold:.2,
      run:() => ctx.note(`${f.name} · ${eur(f.price)}. Hold E to buy it — it comes boxed, for you to carry home and set up (B, in your flat).`),
      long:{time:1, label:`buy · ${eur(f.price)}`, run:() => buyBig(id, m, sp)}});
  }
  // a sign over the floor
  for (const [t, x, z] of [["BEDROOM", -27.5, -6.0], ["LIVING", -20.5, -6.0], ["SMALL ITEMS · PAY AT THE TILL", -17.4, -1.2]]){
    const tt = textTex(512, 96, g => { g.fillStyle = "#14202c"; g.fillRect(0, 0, 512, 96); g.fillStyle = "#c8463a"; g.fillRect(0, 86, 512, 10); g.fillStyle = "#fff"; g.font = "800 40px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; let fs = 40; while (g.measureText(t).width > 470){ fs -= 2; g.font = `800 ${fs}px 'Barlow Condensed', sans-serif`; } g.fillText(t, 256, 44); });
    if (x > -17.5) label(tt, -16.37, 2.3, z, 1.6, .3, -Math.PI/2, {glow:.2});
    else { label(tt, x, 2.55, z + .011, 1.8, .34, 0, {glow:.2}); label(tt, x, 2.55, z - .011, 1.8, .34, Math.PI, {glow:.2}); box(x - .92, 2.38, z - .01, x + .92, 2.72, z + .01, 0x1b2026, {ao:false, jit:0}); }
  }

  /* ---------- the rack of small things, on the east wall by the till ---------- */
  const rack = frame(-16.55, -1.3, -Math.PI/2);
  rb(rack, 0, 0, 0, 2.6, .05, .45, .01, 0x8f979e, {key:"metal"});
  for (const y of [.75, 1.3]) rb(rack, 0, y, 0, 2.6, .03, .42, .01, 0xd5d9dc, {key:"metal"});
  for (const lx of [-1.28, 1.28]) rb(rack, lx, 0, 0, .04, 1.9, .44, .01, 0x8f979e, {key:"metal"});
  fsolid(rack, 0, 0, 2.6, .45, 0, 1.9);
  const smalls = [["bulb", -.85, .78], ["lock", 0, .78], ["paperCream", .85, .78], ["paperSage", -.4, 1.33], ["paperNavy", .45, 1.33]];
  for (const [key, lx, y] of smalls){
    const h = HARDWARE[key], it = () => ({id:h.item || key, name:h.name, unpaid:true, price:h.price, store:"furn", col:h.col, paper:h.paper});
    for (let k = 0; k < 3; k++){
      const m = INV.itemMesh(it());
      const [wx, wz] = worldPt(rack, lx - .18 + k*.18, .02);
      m.position.set(wx, y + (h.item === "paper" ? .05 : 0), wz); if (h.item === "paper") m.rotation.z = Math.PI/2;
      W.scene.add(m);
    }
    const [ax, az] = worldPt(rack, lx - .32, -.22), [bx, bz] = worldPt(rack, lx + .32, .22);
    // its own little price card on the shelf edge
    const t = textTex(256, 96, g => { g.fillStyle = "#fff8d6"; g.fillRect(0, 0, 256, 96); g.fillStyle = "#1d2328"; g.font = "700 24px 'Barlow', sans-serif"; g.textAlign = "center"; g.fillText(h.name, 128, 38); g.fillStyle = "#c8463a"; g.font = "800 34px 'Barlow Condensed', sans-serif"; g.fillText(eur(h.price), 128, 80); });
    const [px, pz] = worldPt(rack, lx, .232);
    label(t, px, y - .03, pz, .24, .09, -Math.PI/2, {rough:.6});
    spot({kind:"pick", label:h.name, get hint(){ return `${eur(h.price)} · ${h.desc} · left click to take one`; },
      aim:[[Math.min(ax, bx), y - .02, Math.min(az, bz)], [Math.max(ax, bx), y + .2, Math.max(az, bz)]],
      pick:() => { if (!storeOpen()){ ctx.note("The store is closed."); return null; } return it(); }});
  }

  /* ---------- the till: a belt you put things on, the cashier, the card reader, the end of the counter ---------- */
  const T = STORE.till = {items:[], total:0, paid:[]};
  const cz0 = .35, cz1 = .95, cx0 = -22.6, cx1 = -18.95, top = .9;
  rbox((cx0 + cx1)/2, 0, (cz0 + cz1)/2, cx1 - cx0, top - .05, cz1 - cz0, .04, 0x3b4249, {seg:2});
  rbox((cx0 + cx1)/2, top - .05, (cz0 + cz1)/2, cx1 - cx0 + .06, .05, cz1 - cz0 + .06, .02, 0xd9cdb8, {key:"gloss"});
  // the belt: dark rubber in a steel frame from the start of the counter to the scanner
  const bx0 = cx0 + .1, bx1 = -20.3;
  box(bx0, top, cz0 + .08, bx1, top + .015, cz1 - .1, 0x1d1f22, {ao:false, jit:0});
  box(bx0, top, cz0 + .05, bx1, top + .03, cz0 + .08, 0x8f979e, {key:"metal", ao:false}); box(bx0, top, cz1 - .1, bx1, top + .03, cz1 - .07, 0x8f979e, {key:"metal", ao:false});
  // the scanner window, the till with its little screen facing you, the bagging end
  box(-20.25, top, cz0 + .1, -19.85, top + .012, cz1 - .12, 0x2a3a4a, {key:"glass", ao:false, jit:0});
  rbox(-19.6, top, cz1 - .14, .34, .22, .2, .03, 0x23272b);
  const screen = textTex(256, 128, () => {});
  const tillScr = label(screen, -19.6, top + .18, cz1 - .25, .3, .14, Math.PI, {glow:.9});
  solid(cx0, cx1, cz0, cz1, 0, top + .05);
  // the card reader on a post on your side, at the end of the belt
  const rx = -20.05, rz = .1;
  cy(frame(rx, rz), 0, 0, 0, .025, .03, 1.0, 0x3b4249, {seg:8, key:"metal"});
  rbox(rx, 1.0, rz, .12, .2, .08, .02, 0x1d1f22);
  rbox(rx, 1.12, rz - .041, .09, .05, .004, .002, 0x3f9a52, {key:"screen"});
  solid(rx - .08, rx + .08, rz - .08, rz + .08, 0, 1.2);
  // the cashier behind the counter, at the scanner
  staffer(-20.05, 1.5, Math.PI, {role:"shopkeeper", shirt:0x8a2d2d, seed:41, minute:ctx.minute, when:m => storeOpen(m)});
  // the security gate either side of the door
  const gates = [];
  for (const x of [dx0 + .12, dx1 - .12]){
    rbox(x, 0, b.z1 - .62, .08, 1.45, .32, .03, 0xd5d9dc, {key:"metal"});
    const gm = new THREE.Mesh(new THREE.BoxGeometry(.03, 1.3, .26), new THREE.MeshStandardMaterial({color:0x6a7178, emissive:0xff2a2a, emissiveIntensity:0, transparent:true, opacity:.8}));
    gm.position.set(x + (x < (dx0 + dx1)/2 ? .045 : -.045), .72, b.z1 - .62); W.scene.add(gm); gates.push(gm);
    solid(x - .05, x + .05, b.z1 - .78, b.z1 - .46, 0, 1.45);
  }
  const drawTill = () => {
    const g = screen.image.getContext("2d");
    g.fillStyle = "#0b1622"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#6fd0ff"; g.font = "bold 22px sans-serif"; g.textAlign = "left";
    g.fillText(T.items.length ? `${T.items.length} item${T.items.length > 1 ? "s" : ""}` : "Next customer", 14, 36);
    g.fillStyle = "#c8f060"; g.font = "bold 44px sans-serif"; g.fillText(eur(T.total), 14, 94);
    screen.needsUpdate = true;
  };
  drawTill();
  // putting a thing on the belt: it rides to the scanner, beeps, and the till counts it
  const belt = [];
  spot({kind:"place", takes:it => !!(it && it.unpaid && it.store === "furn"), label:"Checkout belt", hint:"Click to put it on the belt",
    aim:[[bx0, top - .1, cz0], [bx1, top + .35, cz1]],
    place(it, at){
      const m = INV.itemMesh(it); m.position.set(bx0 + .25, top + .02, (cz0 + cz1)/2); if (it.id === "paper") m.rotation.z = Math.PI/2;
      if (at) m.position.copy(at);
      W.scene.add(m);
      const e = {it, m, t:0, scanned:false, from:m.position.clone()};
      belt.push(e);
      if (window.lifeNote) window.lifeNote("On the belt. The cashier scans it through — then pay at the card reader.");
    }});
  W.anims.push(dt => {
    for (const e of belt){
      e.t += dt;
      const k = Math.min(1, e.t/1.6), x = bx0 + .25 + (bx1 - .15 - bx0 - .25)*k;
      e.m.position.lerpVectors(e.from, new THREE.Vector3(x, top + .02, (cz0 + cz1)/2), Math.min(1, e.t/.35));
      if (e.t > .35) e.m.position.set(x, top + .02, (cz0 + cz1)/2);
      if (!e.scanned && k >= 1){
        e.scanned = true; T.items.push(e); T.total += e.it.price; drawTill();
        tillScr.material.emissiveIntensity = 2.2; setTimeout(() => { tillScr.material.emissiveIntensity = .9; }, 160);
        if (typeof FEED === "object") FEED.chip(`Beep · ${e.it.name} ${eur(e.it.price)}`, "");
      }
    }
  });
  // paying: everything scanned is yours, and waits at the end of the counter — left there, it stays there (it's a
  // thing lying in the shop, saved like anything else you put down: world.js ctx.dropAt) until you pick it up
  spot({aim:[[rx - .15, .85, rz - .15], [rx + .15, 1.3, rz + .15]], label:"Card reader", get hint(){ return T.total ? `Pay ${eur(T.total)}` : "Put your things on the belt first"; }, hold:.2,
    run:() => {
      if (!T.items.length) return ctx.note(belt.length ? "Wait for the cashier to scan it." : "Nothing to pay for. Put what you want on the belt.");
      if (!spend(T.total)) return ctx.note(`Card declined — you need ${eur(T.total)}. Take something off the belt? (Leave it and it goes back on the shelf.)`);
      const paid = T.total, n0 = INV.dropsOf("home").filter(d => d.till).length;
      T.items.forEach((e, i) => {
        belt.splice(belt.indexOf(e), 1); e.it.unpaid = false; delete e.it.store;
        const k = n0 + i; ctx.dropAt(e.it, -19.25 - Math.floor(k/4)*.2, top + .02, .45 + (k % 4)*.13, 0, {mesh:e.m, tag:{till:true}});
      });
      T.items = []; T.total = 0; drawTill();
      if (typeof FEED === "object") FEED.chip(`Paid ${eur(paid)}`, "good");
      ctx.note(`Paid ${eur(paid)}. Your things are at the end of the counter.`);
      if (typeof save === "function") save();
    }});
  // the way out: anything you have not paid for sets the alarm off, and the cashier takes it back
  let was = false, alarm = 0;
  W.anims.push(dt => {
    const x = VIEW.x, z = VIEW.z, inShop = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 - .05;
    if (was && !inShop && x > dx0 - .4 && x < dx1 + .4){
      const bad = INV.unpaid().filter(it => it.store === "furn");
      if (bad.length){
        INV.removeWhere(it => it.unpaid && it.store === "furn");
        alarm = 2.4;
        ctx.note(`BEEP BEEP BEEP — the alarm goes off. The cashier hurries over and takes back the ${bad.map(it => it.name.toLowerCase()).join(", ")}. "Pay at the till, please."`);
        if (typeof FEED === "object") FEED.chip("Shoplifting alarm", "bad");
      }
    }
    was = inShop;
    if (alarm > 0){ alarm -= dt; const on = Math.sin(alarm*18) > 0 ? 2.5 : 0; for (const gm of gates) gm.material.emissiveIntensity = alarm > 0 ? on : 0; }
  });
}
function storeOpen(m, shop = STORE){ const t = m == null ? (ctx ? ctx.minute() : 600) : m; const d = ((t % 1440) + 1440) % 1440; return d >= shop.open && d < shop.close; }
const hours = shop => `${fmtTime(shop.open)} – ${fmtTime(shop.close)}`;
// hold E on a piece on the floor: pay, it is boxed up in a puff of packing, and the box is in your arms
function buyBig(id, m, sp, shop = STORE){
  const f = FURN[id];
  if (!storeOpen(null, shop)) return ctx.note(`${shop.name} is closed. It's open ${hours(shop)}.`);
  if (INV.hand()) return ctx.note("Your hands are full. Pocket what you're holding (1 or 2) or drop it (G) — a box needs both arms.");
  if (!spend(f.price)) return ctx.note(`You need ${eur(f.price)} for the ${f.name.toLowerCase()}.`);
  const p = m.g.position; puff(p.x, .3, p.z);
  // it shrinks away into the dust (the shop has more in the back for next time)
  let t = 0; const g = m.g, s0 = g.scale.x;
  W.anims.push(dt => { if (t > .45) return; t += dt; const k = Math.max(0, 1 - t/.45); g.scale.setScalar(s0*k); if (t > .45) g.visible = false; });
  W.spots = W.spots.filter(x => x !== sp);
  INV.take({id:"box", fid:id, name:`${f.name} (boxed)`, dims:f.box, label:f.name});
  if (typeof FEED === "object") FEED.chip(`Bought · ${f.name} · −${eur(f.price)}`, "good");
  ctx.note("Boxed up and in your arms. Carry it home and press B in your flat to set it up.");
  if (typeof save === "function") save();
}

/* ============ Casa Nova: the big showroom in Dumbrava ============
   Out of town, on Strada Mare: a tall white box with a glass front, where the good beds and fridges are (tiers 3 to 6,
   FURN store "casa"). Buying works as at Mobila Bună — hold E on a piece, it comes boxed into your arms — and the box
   rides home with you on the bus. b: the building's footprint; its front looks out at +z. */
export const CASA = {name:"Casa Nova", open:9*60, close:20*60};
export function showroom(c, b){
  ctx = c;
  const H = 5.0, g0 = 4.4, render = 0xeceae4, dark = 0x2b3238, door = [b.x0 + 2.2, b.x0 + 3.8], glass = [b.x0 + 4.6, b.x1 - .6];
  // the shell: rendered walls on a dark plinth, a glass front, a flat roof behind a parapet
  const PT = {tex:"paint"};
  wall("x", b.z1 - .125, b.x0, b.x1, 0, H, .25, dark, [[door[0], door[1], 0, 2.5], [glass[0], glass[1], .3, 4.1, "glass"]], {key:"metal"});
  wall("z", b.x0 + .125, b.z0, b.z1, 0, H, .25, render, [], PT);
  wall("z", b.x1 - .125, b.z0, b.z1, 0, H, .25, render, [], PT);
  wall("x", b.z0 + .125, b.x0, b.x1, 0, H, .25, render, [], PT);
  box(b.x0 - .02, 0, b.z0 - .02, b.x0 + .02, .5, b.z1, 0x8f9499, {tex:"concrete", ao:false, jit:0});
  box(b.x1 - .02, 0, b.z0 - .02, b.x1 + .02, .5, b.z1, 0x8f9499, {tex:"concrete", ao:false, jit:0});
  box(b.x0 + .25, g0, b.z0 + .25, b.x1 - .25, g0 + .2, b.z1 - .25, 0x9a958c, {tex:"concrete", ao:false, jit:0});
  box(b.x0 - .06, H, b.z0 - .06, b.x1 + .06, H + .1, b.z1 + .06, 0x6a7178, {key:"metal", ao:false, jit:0});
  box(glass[0], .3, b.z1 - .14, glass[1], 4.1, b.z1 - .1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  for (let x = glass[0] + 2.4; x < glass[1] - .5; x += 2.4) box(x - .05, .3, b.z1 - .18, x + .05, 4.1, b.z1 + .02, dark, {key:"metal", ao:false});
  box(glass[0] - .05, .22, b.z1 - .27, glass[1] + .05, .3, b.z1 + .1, 0xc7c2b8, {ao:false, jit:0});
  // the door: a lined opening with the step level with the pavement, a mat inside
  box(door[0] + .03, 0, b.z1 - .25, door[1] - .03, .12, b.z1, 0xb4afa6, {tex:"concrete", ao:false, jit:0}); floor(door[0], door[1], b.z1 - .25, b.z1, .12);
  box(door[0], 0, b.z1 - 1.1, door[1], .02, b.z1 - .25, 0x3a3f46, {ao:false, jit:0});
  // inside: a pale polished floor, white walls, a ceiling of light panels
  const ix0 = b.x0 + .25, ix1 = b.x1 - .25, iz0 = b.z0 + .25, iz1 = b.z1 - .25;
  box(ix0, 0, iz0, ix1, .02, iz1, 0xe9e6df, {tex:"terrazzo", ao:false, jit:0}); floor(ix0, ix1, iz0, iz1, .02);
  box(ix0, g0 - .04, iz0, ix1, g0, iz1, 0xf4f2ee, {ao:false, tex:"paint"});
  for (let x = ix0 + 2.5; x < ix1 - 1; x += 4) for (const z of [iz0 + 2.6, iz0 + 6.6, iz0 + 10]) box(x - .8, g0 - .08, z - .25, x + .8, g0 - .04, z + .25, 0xfff8ec, {key:"lamp", ao:false});
  for (const [x, z] of [[ix0 + 4, iz0 + 3], [ix0 + 13, iz0 + 3], [ix0 + 8.5, iz1 - 3]]) lightSrc({x, y:g0 - .5, z, color:0xfff6e8, intensity:10, distance:13, indoor:true});
  box(ix0 + .01, .02, iz0 + .01, ix1 - .01, .5, iz0 + .03, 0x1f4a5a, {ao:false, jit:0});
  pool((glass[0] + glass[1])/2, b.z1 + 1.4, 3.6, .125);
  // the name across the top of the glass, lit
  box(b.x0 + .3, 4.2, b.z1, b.x1 - .3, 4.9, b.z1 + .1, 0x1f4a5a, {ao:false, jit:0});
  const ft = textTex(2048, 96, g => {
    g.fillStyle = "#1f4a5a"; g.fillRect(0, 0, 2048, 96); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, 2048, 5);
    g.fillStyle = "#fff"; g.font = "800 60px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("CASA NOVA", 640, 50);
    g.font = "700 28px 'Barlow', sans-serif"; g.fillStyle = "rgba(255,255,255,.85)"; g.fillText("SHOWROOM · BEDS · KITCHENS · TIERS 3–6", 1400, 52);
  });
  label(ft, (b.x0 + b.x1)/2, 4.55, b.z1 + .105, b.x1 - b.x0 - .8, (b.x1 - b.x0 - .8)*96/2048, 0, {glow:.75, rough:.4});
  box(b.x0 + .5, 4.17, b.z1 + .02, b.x1 - .5, 4.2, b.z1 + .08, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  const dx = (door[0] + door[1])/2;
  spot({x:dx, y:1.2, z:b.z1 + .4, r:1.6, near:true, label:"Casa Nova", get hint(){ return storeOpen(null, CASA) ? `Furniture showroom · open till ${fmtTime(CASA.close)}` : `Closed · opens at ${fmtTime(CASA.open)}`; }, hold:.2,
    run:() => ctx.note(storeOpen(null, CASA) ? "Beds along the back wall, fridges down the left. Tiers 3 to 6 — the box rides home with you on the bus." : `Closed. Casa Nova is open ${hours(CASA)}.`)});
  // the floor: beds along the back wall, fridges down the side, each with its price
  const show = [["bed3", ix0 + 4.2, Math.PI], ["bed4", ix0 + 8.0, Math.PI], ["bed5", ix0 + 12.1, Math.PI], ["bed6", ix0 + 16.6, Math.PI]]
    .map(([id, x, ry]) => [id, x, iz0 + BEDLEN(id)/2 + .2, ry])
    .concat([["fridge3", 1.65], ["fridge4", 3.15], ["fridge5", 4.85], ["fridge6", 6.75]].map(([id, dz]) => [id, null, iz0 + dz, Math.PI/2]));
  for (const [id, x0, z, ry] of show){
    const f = FURN[id], m = pieceModel(id); if (!m) continue;
    const x = x0 == null ? ix0 + m.len/2 + .12 : x0;
    m.g.position.set(x, 0, z); m.g.rotation.y = ry; W.scene.add(m.g);
    const q = Math.round(ry/(Math.PI/2)) & 1, hw = (q ? m.len : m.w)/2, hd = (q ? m.w : m.len)/2;
    solid(x - hw, x + hw, z - hd, z + hd, 0, Math.min(1.9, m.h));
    // the card stands in front of it, facing you as you walk up
    if (q) priceTag(x + hw + .4, z, Math.PI/2, f.name, f.price, "CASA NOVA", "#1f4a5a");
    else priceTag(x + .1, z + hd + .4, 0, f.name, f.price, "CASA NOVA", "#1f4a5a");
    const aim = [[x - hw - .05, 0, z - hd - .05], [x + hw + .05, Math.min(2.1, m.h + .1), z + hd + .05]];
    const sp = spot({aim, label:f.name, get hint(){ return `${eur(f.price)} · tier ${f.tier} · ${f.desc}`; }, hold:.2,
      run:() => ctx.note(`${f.name} · tier ${f.tier} · ${eur(f.price)}. Hold E to buy it — it comes boxed, for you to carry home on the bus and set up (B, in your flat).`),
      long:{time:1, label:`buy · ${eur(f.price)}`, run:() => buyBig(id, m, sp, CASA)}});
  }
  // signs over the two ranges
  for (const [t, x, z, ry] of [["BEDROOM · TIERS 3–6", ix0 + 10.4, iz0 + 3.0, 0], ["KITCHEN · FRIDGES", ix0 + 1.6, iz0 + 4.2, Math.PI/2]]){
    const tt = textTex(512, 96, g => { g.fillStyle = "#14202c"; g.fillRect(0, 0, 512, 96); g.fillStyle = "#3fa7a0"; g.fillRect(0, 86, 512, 10); g.fillStyle = "#fff"; g.font = "800 40px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, 256, 44); });
    if (ry){ label(tt, x + .011, 3.2, z, 1.8, .34, Math.PI/2, {glow:.2}); label(tt, x - .011, 3.2, z, 1.8, .34, -Math.PI/2, {glow:.2}); box(x - .01, 3.03, z - .92, x + .01, 3.37, z + .92, 0x1b2026, {ao:false, jit:0}); }
    else { label(tt, x, 3.2, z + .011, 1.8, .34, 0, {glow:.2}); label(tt, x, 3.2, z - .011, 1.8, .34, Math.PI, {glow:.2}); box(x - .92, 3.03, z - .01, x + .92, 3.37, z + .01, 0x1b2026, {ao:false, jit:0}); }
    for (const s of [-1, 1]) if (ry) box(x - .005, 3.37, z + s*.8 - .005, x + .005, g0 - .04, z + s*.8 + .005, 0x8f979e, {key:"metal", ao:false}); else box(x + s*.8 - .005, 3.37, z - .005, x + s*.8 + .005, g0 - .04, z + .005, 0x8f979e, {key:"metal", ao:false});
  }
  // a room set in the middle, to show what a flat could look like (display only)
  for (const [id, x, z, ry] of [["rug", ix0 + 11, iz1 - 4.2, 0], ["sofa", ix0 + 11, iz1 - 5.6, 0], ["lamp", ix0 + 12.6, iz1 - 5.9, 0], ["plant", ix0 + 9.3, iz1 - 5.8, 0]]){
    const p = pieceModel(id); if (!p) continue;
    p.g.position.set(x, 0, z); p.g.rotation.y = ry; W.scene.add(p.g);
    if (!p.flat) solid(x - p.w/2, x + p.w/2, z - p.len/2, z + p.len/2, 0, Math.min(1.6, p.h));
  }
  // the sales desk by the door, somebody behind it, a pair of plants
  const desk = frame(ix1 - 3.2, iz1 - 2.2);
  rb(desk, 0, 0, 0, 2.6, .98, .7, .05, 0xf4f2ee, {key:"gloss"}); rb(desk, 0, .98, 0, 2.7, .04, .78, .02, 0x1f4a5a);
  rb(desk, .7, 1.02, -.1, .4, .26, .03, .02, 0x1d1f22);
  fsolid(desk, 0, 0, 2.7, .78, 0, 1.05);
  staffer(ix1 - 3.2, iz1 - 2.95, 0, {role:"shopkeeper", shirt:0x1f4a5a, seed:57, minute:ctx.minute, when:m => storeOpen(m, CASA)});
  for (const [x, z] of [[ix1 - .5, iz0 + .5], [ix1 - .5, iz1 - .6]]){ const p = pieceModel("plant"); if (p){ p.g.position.set(x, 0, z); W.scene.add(p.g); solid(x - .25, x + .25, z - .25, z + .25, 0, 1.2); } }
  W.places.push({name:"Casa Nova", kind:"furniture", x:dx, z:b.z1 + .6, at:"in Casa Nova", b:{x0:b.x0, x1:b.x1, z0:b.z0, z1:b.z1}});
}
const BEDLEN = id => ({bed3:2.0, bed4:2.0, bed5:2.05, bed6:2.1})[id] || 2;
