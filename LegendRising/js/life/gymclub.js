/* ============ LIFE: gyms ============
   Gym equipment comes in six tiers (game: GYM_XP; a set on tier-1 kit is worth 60% of what it is on tier-4 kit, on
   elite kit 130%): from a rusting rack with a taped-up bench and a treadmill with a cracked screen, through plain
   honest kit, to chrome, leather and a wooden lifting platform. The look is the tier: rust and tape and worn rubber
   at the bottom, polish at the top.
   Every piece says where you stand to use it (W.stations, by kind) so a set (drills.js) can be done on any rack in any
   gym: the club's own (ground.js, at your club's tier) and the IronWorks gym up Strada Morii (members only). */
import {THREE, W, box, rbox, cyl, solid, floor, spot, wall, label, textTex, lightSrc, pool, reseed, rnd, mat} from "./build.js";
import {frame, rb, cy, fsolid, worldPt, plyoBox, bike, cone, bench as propBench, waterCooler, PC} from "./props.js";
import {staffer} from "./npc.js";
import {facer, decoWin, pilasters, roofTop, downpipe} from "./home.js";

const G = () => (typeof S !== "undefined" ? S : null);
export const GYM = {rackBar:null};
export const TIER_LOOK = {
  1:{steel:0x7c6250, dark:0x3a3430, pad:0x5a3a2a, accent:0x6d7f7a, rust:true, name:"Extremely poor"},
  2:{steel:0x8a8f93, dark:0x34373a, pad:0x3d2f29, accent:0x5f7f86, worn:true, name:"Poor"},
  3:{steel:0xa5aba7, dark:0x2b2f34, pad:0x2a2b2d, accent:0x2f8f86, name:"Basic"},
  4:{steel:0xc9cdd1, dark:0x1d1f22, pad:0x8a1f22, accent:0xc8463a, name:"Good"},
  5:{steel:0xd5d9dc, dark:0x16181b, pad:0x1d1f22, accent:0xc8f060, name:"Very good"},
  6:{steel:0xe6e9ec, dark:0x101214, pad:0x5a3a22, accent:0xc9a24a, wood:true, name:"Elite"}
};
const L = t => TIER_LOOK[Math.max(1, Math.min(6, t || 3))];
// where you stand to use a piece, by kind: the set picks the one nearest you
function station(kind, o){ (W.stations[kind] || (W.stations[kind] = [])).push(o); return o; }
// rust and wear: a few orange-brown patches on a piece's frame, tape on its pads
function rust(f, spots){ for (const [x, y, z, w, h] of spots) rb(f, x, y, z, w, h, .012, .004, 0x8a4a22); }

export function treadmill(x, z, t, o = {}){
  const f = frame(x, z), lk = L(t), broken = !!o.broken;
  rb(f, 0, 0, .1, .92, .24, 1.9, .08, t <= 2 ? 0x55524e : 0x45474a, {seg:2});
  rb(f, 0, .24, .15, .74, .015, 1.7, .01, 0x26282a);
  for (const s of [-1, 1]) rb(f, s*.37, .2, -.86, .07, 1.15, .07, .03, lk.steel, {key:"metal", rz:-s*.04});
  rb(f, 0, 1.28, -.92, .98, .42, .12, .06, lk.dark, {rx:.45, seg:2});
  rb(f, 0, 1.36, -.86, .66, .26, .02, .02, broken ? 0x101214 : t >= 5 ? 0x1f6f43 : 0x2f6f9a, {rx:.45, key:broken ? undefined : "screen"});
  for (const s of [-1, 1]) cy(f, s*.37, 1.05, -.6, .022, .022, .5, lk.steel, {seg:8, rx:Math.PI/2, key:"metal"});
  if (lk.rust) rust(f, [[.38, .4, -.86, .08, .2], [-.38, .7, -.86, .08, .15], [.3, .1, .9, .2, .08]]);
  if (broken){ const tt = textTex(256, 96, g => { g.fillStyle = "#f2efe6"; g.fillRect(0, 0, 256, 96); g.fillStyle = "#c8261f"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.fillText("OUT OF", 128, 42); g.fillText("ORDER", 128, 84); });
    const [lx, lz] = worldPt(f, 0, -.8); label(tt, lx, 1.42, lz + .03, .32, .12, 0, {rough:.8}); }
  fsolid(f, 0, .05, .94, 2.1, 0, 1.4);
  if (!broken) station("treadmill", {x, z:z + .45, yaw:0, y:.255, tier:t});
  return f;
}
export function rack(x, z, t){
  const f = frame(x, z), lk = L(t);
  if (lk.wood) rb(f, 0, 0, .3, 2.4, .05, 2.4, .02, 0x9a6b42);
  rb(f, 0, 0, 0, 1.6, .06, .95, .02, lk.dark);
  for (const s of [-1, 1]){ rb(f, s*.6, .06, -.25, .09, 2.1, .09, .02, lk.steel, {key:"metal"}); rb(f, s*.6, .06, .25, .09, 2.1, .09, .02, lk.steel, {key:"metal"}); rb(f, s*.6, 2.12, 0, .09, .07, .6, .02, lk.steel, {key:"metal"}); }
  if (lk.rust) rust(f, [[.6, .3, -.3, .1, .3], [-.6, 1.2, .3, .1, .25], [.6, 1.8, .3, .1, .2], [0, .06, .48, .5, .02]]);
  // the bar and its plates are one piece of their own: you take it off the hooks for a set (drills.js) and put it back
  const bar = barbell(t); bar.position.set(x, 1.45, z - .1); bar.userData.home = bar.position.clone(); W.scene.add(bar);
  // the bench: a pad on two legs (cracked and taped at the bottom tier)
  rb(f, 0, .42, 1.55, .34, .1, 1.2, .04, lk.pad, {seg:2});
  if (t <= 2) for (const dz of [1.2, 1.75]) rb(f, 0, .515, dz, .36, .012, .06, .004, 0x9a958c);
  for (const dz of [1.1, 2.0]) rb(f, 0, 0, dz, .26, .42, .07, .02, lk.steel, {key:"metal"});
  fsolid(f, 0, 0, 1.7, 1.0, 0, 2.2); fsolid(f, 0, 1.55, .4, 1.25, 0, .55);
  station("squat", {x, z:z - .05, yaw:Math.PI, tier:t, bar});
  return f;
}
// a barbell: the bar along x, a plate at each end
export function barbell(t = 3){
  const g = new THREE.Group(), lk = L(t), steel = mat({color:t <= 1 ? 0x8a7a6a : 0xc9cdd0, metalness:t <= 1 ? .4 : .8, roughness:t <= 1 ? .7 : .3});
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 2.0, 10), steel); bar.rotation.z = Math.PI/2; g.add(bar);
  for (const s of [-1, 1]){
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .06, 20), mat({color:s < 0 ? lk.accent : 0x2b2c2e, roughness:.6}));
    p.rotation.z = Math.PI/2; p.position.x = s*.78; g.add(p);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .05, 10), steel); c.rotation.z = Math.PI/2; c.position.x = s*.84; g.add(c);
  }
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; } });
  return g;
}
export function dumbbell(color = 0x2b2c2e){
  const g = new THREE.Group(), steel = mat({color:0x9aa0a4, metalness:.8, roughness:.35}), m = mat({color, roughness:.55});
  const h = new THREE.Mesh(new THREE.CylinderGeometry(.017, .017, .2, 8), steel); h.rotation.z = Math.PI/2; g.add(h);
  for (const s of [-1, 1]){ const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .12, .12), m); b.position.x = s*.1; g.add(b); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function dumbbellRack(x, z, ry, t){
  const f = frame(x, z, ry), lk = L(t);
  for (const s of [-1, 1]) rb(f, s*.85, 0, 0, .06, .85, .5, .02, lk.dark, {key:"metal"});
  rb(f, 0, .78, -.08, 1.8, .04, .38, .02, lk.steel, {key:"metal"}); rb(f, 0, .4, .02, 1.8, .04, .44, .02, lk.steel, {key:"metal"});
  const ends = t <= 2 ? [0x5a5048, 0x4a4440, 0x6a5a4a] : [0xe2722e, 0xe0a52e, lk.accent, 0x2b2c2e, 0xc8463a];
  const n = t <= 1 ? 4 : 6;
  for (let i = 0; i < n; i++) for (const [y, zz] of [[.87, -.08], [.49, .02]]){
    const lx = -.72 + i*.29;
    cy(f, lx, y, zz, .018, .018, .2, 0x9aa0a4, {seg:6, rx:Math.PI/2, key:"metal"});
    for (const e of [-.1, .1]) rb(f, lx, y - .06, zz + e, .12, .12, .05, .025, ends[(i + (y > .7 ? 0 : 2)) % ends.length], {center:false});
  }
  if (lk.rust) rust(f, [[-.85, .3, .2, .08, .3], [.85, .5, -.2, .08, .2]]);
  fsolid(f, 0, 0, 1.8, .55, 0, .95);
  const [sx, sz] = worldPt(f, 0, 1.2);
  station("dumbbell", {x:sx, z:sz, yaw:ry - Math.PI, tier:t, color:ends[0]});
  return f;
}
// dir: which way you jump onto them (+1 towards +z, −1 towards −z); you start .9 m back from the middle one
export function plyoBoxes(x, z, t, dir = 1){
  const lk = L(t);
  for (const [i, h] of [[0, .45], [1, .6], [2, .75]]) plyoBox(x - 1.1 + i*1.1, z, 0, h, t <= 2 ? 0x4a4440 : lk.dark);
  station("plyo", {x, z:z - .9*dir, yaw:dir > 0 ? Math.PI : 0, box:.6, tier:t});
}
export function ladderLane(x, z0, z1, t){
  box(x - 1.3, .025, z0, x + 1.3, .04, z1, 0xffffff, {tex:"turf", ao:false, jit:0});
  for (let z = z0 + .6; z < z1 - 2.6; z += .5) box(x - .45, .041, z, x + .45, .046, z + .05, t <= 1 ? 0xc8c2b2 : 0xf2f2ee, {ao:false, jit:0});
  for (const dx of [-.45, .45]) box(x + dx - .025, .041, z0 + .6, x + dx + .025, .046, z1 - 2.6, t <= 1 ? 0xc8c2b2 : 0xf2f2ee, {ao:false, jit:0});
  for (let i = 0; i < 4; i++) cone(x + (i % 2 ? .55 : -.55), z1 - 2.2 + i*.5, PC.orange, .7);
  station("ladder", {x, z:z0 + .7, yaw:Math.PI, y:.04, len:Math.min(6.8, z1 - z0 - 3.8), tier:t});
}
export function spinBike(x, z, ry, t){ bike(x, z, ry, {tier:t}); const f = frame(x, z, ry), [sx, sz] = worldPt(f, .14, 0); station("bike", {x:sx, z:sz, yaw:ry + Math.PI/2, tier:t}); }

/* ---------- the IronWorks gym, up Strada Morii (east side) ----------
   Tier-4 kit behind a reception desk: everything a set needs, open early till late, members only. A membership is
   four weeks (S.gymSub.until: the last day it covers), bought at the desk. */
export const IRON = {name:"IronWorks Gym", tier:4, price:45, days:28, open:6*60, close:23*60};
export function memberToday(){ const s = G(); return !!(s && s.gymSub && s.life && s.gymSub.until >= s.life.day); }
export function privateGym(ctx){
  const b = {x0:45, x1:59, z0:-30.2, z1:-6.4}, H = 4.4, t = IRON.tier, lk = L(t);
  // the shell: dark cladding, a glass front onto the street with the door in it, a lit sign
  const PT = {tex:"paint"};
  box(b.x0, H, b.z0, b.x1, H + .4, b.z1, 0x2a2e33, {solid:true, key:"metal", ao:false});
  wall("z", b.x0 + .125, b.z0, b.z1, 0, H, .25, 0x2a2e33, [[-19.6, -18.0, 0, 2.5], [-29.4, -20.2, .45, 3.4, "glass"], [-17.4, -7.2, .45, 3.4, "glass"]], {key:"metal"});
  wall("z", b.x1 - .125, b.z0, b.z1, 0, H, .25, 0x3b4249, [], {key:"metal"});
  wall("x", b.z0 + .125, b.x0, b.x1, 0, H, .25, 0x3b4249, [], {key:"metal"});
  wall("x", b.z1 - .125, b.x0, b.x1, 0, H, .25, 0x3b4249, [], {key:"metal"});
  for (const [a, c] of [[-29.4, -20.2], [-17.4, -7.2]]){ box(b.x0 + .1, .45, a, b.x0 + .14, 3.4, c, 0xa9c2d2, {key:"glass", ao:false, jit:0}); for (let z = a; z <= c + .01; z += (c - a)/4) box(b.x0 + .05, .45, z - .04, b.x0 + .2, 3.4, z + .04, 0x16181b, {key:"metal", ao:false}); }
  box(b.x0 - .04, 0, -19.6, b.x0 + .25, .12, -18.0, 0xb4afa6, {tex:"concrete", ao:false, jit:0}); floor(b.x0 - .04, b.x0 + .25, -19.6, -18.0, .12);
  // inside: a rubber floor, mirrors down the far wall, strip lights
  box(b.x0 + .25, 0, b.z0 + .25, b.x1 - .25, .03, b.z1 - .25, 0xffffff, {tex:"rubberFloor", ao:false, jit:0}); floor(b.x0 + .25, b.x1 - .25, b.z0 + .25, b.z1 - .25, .03);
  box(b.x0 + .25, H - .04, b.z0 + .25, b.x1 - .25, H, b.z1 - .25, 0x2b2f34, {ao:false, jit:0});
  box(b.x1 - .27, .5, b.z0 + .6, b.x1 - .25, 2.6, b.z1 - .6, 0xdfe9ee, {key:"gloss", ao:false, jit:0});
  for (const z of [-26, -19, -12]) box(b.x0 + 1.5, H - .1, z - .08, b.x1 - 1.5, H - .05, z + .08, 0xf6fbff, {key:"lamp", ao:false});
  for (const z of [-25, -13]) lightSrc({x:52, y:H - .5, z, color:0xf2f6ff, intensity:10, distance:14, indoor:true});
  box(b.x0 + .26, 3.6, b.z0 + .25, b.x0 + .28, 3.7, b.z1 - .25, lk.accent, {ao:false});
  // the sign over the door
  const st = textTex(1024, 192, g => { g.fillStyle = "#16181b"; g.fillRect(0, 0, 1024, 192); g.fillStyle = "#c8463a"; g.fillRect(0, 176, 1024, 16);
    g.fillStyle = "#fff"; g.font = "800 104px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("IRONWORKS", 512, 80); g.font = "700 34px 'Barlow', sans-serif"; g.fillStyle = "#c9cdd1"; g.fillText(`GYM · MEMBERS ONLY · ${fmtRange(IRON.open, IRON.close).toUpperCase()}`, 512, 150); });
  box(b.x0 - .12, 3.45, -24.5, b.x0, 4.3, -12, 0x16181b, {ao:false, jit:0});
  label(st, b.x0 - .125, 3.88, -18.25, 12.4, .82, -Math.PI/2, {glow:.9});
  pool(b.x0 - 1.4, -18.8, 3, .125);
  // reception, just inside the door
  const rc = frame(46.9, -15.6, -Math.PI/2);
  rb(rc, 0, 0, 0, 2.6, 1.05, .7, .06, 0x1d1f22, {seg:2}); rb(rc, 0, 1.05, 0, 2.7, .05, .8, .02, lk.accent, {key:"metal"});
  fsolid(rc, 0, 0, 2.7, .8, 0, 1.1);
  staffer(47.75, -15.6, -Math.PI/2, {role:"clerk", seed:77, when:m => m >= IRON.open && m < IRON.close, minute:ctx.minute});
  spot({aim:[[46.3, .8, -17], [47.4, 1.4, -14.2]], x:46.0, z:-15.6, r:1.8, near:true, label:"IronWorks · reception",
    get hint(){ return memberToday() ? `Member · until ${dayName((G().life.wd + G().gymSub.until - G().life.day) % 7)}` : `Membership · €${IRON.price} for four weeks · tier-4 kit`; }, hold:.2,
    run:() => joinGym(ctx)});
  // the kit: two racks, dumbbells, plyo boxes, a sprint lane, treadmills and bikes, all tier 4
  rack(56.3, -27.2, t); rack(56.3, -23.4, t);
  dumbbellRack(57.9, -19.0, -Math.PI/2, t);
  plyoBoxes(51.5, -28.4, t, -1);
  ladderLane(52.6, -22.6, -8.8, t);
  for (const z of [-14.0, -11.4]) treadmill(56.6, z, t);
  for (const z of [-17.2, -16.0]) spinBike(56.4, z, -Math.PI, t);
  waterCooler(46.0, -29.4, 0);
  spot({aim:[[45.7, 0, -29.8], [46.3, 1.4, -29.0]], label:"Water cooler", hint:"A cup of water · −2 fatigue", hold:.2, run:() => ctx.water()});
  // every piece: members only
  for (const [kind, lo, hi, label_] of [["squat", [55.3, 0, -28.4], [57.3, 2.2, -21.6], "Squat rack"], ["dumbbell", [57.4, 0, -20], [58.6, 1.1, -18], "Dumbbells"],
    ["plyo", [49.8, 0, -28.8], [53.2, .9, -28.0], "Plyo boxes"], ["ladder", [51.3, 0, -22.6], [53.9, 1.0, -9], "Sprint ladder"], ["treadmill", [56.1, 0, -15], [57.1, 1.7, -10.3], "Treadmill"], ["bike", [55.7, 0, -17.6], [57.1, 1.2, -15.6], "Exercise bike"]])
    spot({aim:[lo, hi], label:label_, get hint(){ return memberToday() ? `${({squat:"Strength set · power", dumbbell:"Strength set · power", plyo:"Jump set · jumping", ladder:"Speed set · acceleration", treadmill:"Endurance run · stamina", bike:"Intervals · stamina and sprint speed"})[kind]} · tier 4 · 45 min` : "Members only. Join at reception"; }, hold:.2,
      run:() => memberToday() ? ctx.reps(kind) : ctx.note(`Members only. Reception will sign you up: €${IRON.price} for four weeks.`)});
  W.places.push({name:IRON.name, kind:"gym", x:44.4, z:-18.8, at:`at ${IRON.name}`, b:{x0:b.x0, x1:b.x1, z0:b.z0, z1:b.z1}});
}
function joinGym(ctx){
  const s = G(), m = ctx.minute() % 1440;
  if (m < IRON.open || m >= IRON.close) return ctx.note(`IronWorks is closed. It opens at ${fmtTime(IRON.open)}.`);
  if (memberToday()) return ctx.note(`You're a member until ${dayName((s.life.wd + s.gymSub.until - s.life.day) % 7)} (day ${s.gymSub.until}). Tier-4 kit: every set here counts for more than on your club's.`);
  if (typeof odorLabel === "function" && num(s.odor, 0) >= ODOR_SMELLY) return ctx.note(`"Showers are for after, not instead of." Have a wash and come back.`);
  if (!spend(IRON.price)) return ctx.note(`Four weeks is €${IRON.price}. You haven't got it.`);
  s.gymSub = {until:s.life.day + IRON.days - 1, since:s.life.day};
  if (typeof FEED === "object") FEED.chip(`IronWorks membership · −€${IRON.price}`, "good");
  ctx.note("You're a member for the next four weeks. Tier-4 kit: every set here counts for more than on your club's tired old stuff.");
  if (typeof save === "function") save();
}
