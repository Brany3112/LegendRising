/* ============ LIFE: what is in the fridge ============
   Your food lives in one place as far as you are concerned: the fridge at home and the fridge in the
   gym hold the same stock, so a meal you bought on the way home can be eaten after training. Every
   kind of food you own sits on a shelf as something you can look at and pick up.

   Owner: WP-G (Stage 1). Contract: DESIGN 3.8.2. Nothing in a fridge can be aimed at through a closed door: each
   slot carries the doors in front of it (a bit mask), and it opens only while one of them is past FRIDGE_OPEN. The
   tooltip under each thing is daily.js foodLines(), built from foodEffect(), the same function eating uses, so the
   numbers on it are the numbers you get.
   F (from furniture.js or ground.js): {group, shelves:[{y, kind, slots:[[x, z, mask?]]}], open(), openAt?(mask),
   src?() -> {keep, powerCut} | mult?() -> keep, ctx, emptyAim, across, ry} */
import {THREE, W, part, roundedBoxGeo} from "./build.js";

const G = () => (typeof S !== "undefined" ? S : null);
// a fridge door is open (for what is behind it, and for the hint) once it has swung this far (radians)
export const FRIDGE_OPEN = .9;
// a little model of each thing, standing on y = 0
function itemMesh(id){
  const g = new THREE.Group();
  const add = (geo, c, x = 0, y = 0, z = 0, o = {}) => { const m = part(geo, c, o); m.position.set(x, y, z); if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; g.add(m); return m; };
  const can = (c) => { add(new THREE.CylinderGeometry(.032, .032, .12, 14), c, 0, .06); add(new THREE.CylinderGeometry(.029, .032, .012, 14), 0xc9cdd1, 0, .126); };
  const bottle = (c, cap, glass) => { add(new THREE.CylinderGeometry(.034, .036, .17, 12), c, 0, .085, 0, glass ? {mat:{transparent:true, opacity:.6}} : {});
    add(new THREE.CylinderGeometry(.018, .03, .04, 12), c, 0, .19, 0, glass ? {mat:{transparent:true, opacity:.6}} : {}); add(new THREE.CylinderGeometry(.019, .019, .025, 10), cap, 0, .222); };
  switch (id){
    case "drink": can(0x1f6fd1); break;
    case "max": can(0xcf2f36); break;
    case "water": bottle(0x9fd0f0, 0x2f6fd1, true); break;
    case "iso": bottle(0x4fc3a0, 0xf2f2ee); break;
    case "shake": bottle(0xece6f4, 0x7c3aed); break;
    case "sandwich": {
      const m = add(new THREE.CylinderGeometry(.075, .075, .05, 3), 0xd9b77a, 0, .055, 0, {rx:Math.PI/2, rz:Math.PI/2});
      const f = add(new THREE.CylinderGeometry(.078, .078, .052, 3), 0xe8f4f8, 0, .055, 0, {mat:{transparent:true, opacity:.35}}); f.rotation.copy(m.rotation); break; }
    case "meal": add(new THREE.BoxGeometry(.16, .045, .12), 0x2b2b2e, 0, .0225); add(new THREE.BoxGeometry(.15, .006, .11), 0xc7552d, 0, .048); break;
    case "pasta": add(roundedBoxGeo(.15, .06, .12, .02), 0xf3f0e8, 0, .03); add(new THREE.BoxGeometry(.14, .006, .11), 0xb7322a, 0, .063); break;
    case "fruit": add(new THREE.SphereGeometry(.04, 12, 8), 0xc8342c, -.035, .04); add(new THREE.CapsuleGeometry(.022, .1, 4, 8), 0xf2d04a, .04, .03, 0, {rz:Math.PI/2.4}); break;
    case "rub": add(new THREE.CapsuleGeometry(.02, .09, 4, 8), 0xf2f2ee, 0, .02, 0, {rz:Math.PI/2}); add(new THREE.CylinderGeometry(.014, .014, .025, 8), 0xc8463a, .065, .02, 0, {rz:Math.PI/2}); break;
    default: add(new THREE.BoxGeometry(.1, .1, .1), 0x888888, 0, .05);
  }
  return g;
}
// where this fridge's food comes from, for foodEffect: {keep, powerCut} (or the keep alone, from an older builder)
const srcOf = F => F.src ? F.src() : F.mult ? F.mult() : 1;
const verb = it => it.kind === "food" ? "Eat it" : it.name === "Muscle rub" ? "Use it" : "Drink it";
// is the thing in this slot reachable: one of the doors in front of it open (or, without masks, the fridge open)
const openFor = (F, mask) => mask != null && F.openAt ? F.openAt(mask) : F.open();
export function fillFridge(F){
  const s = G(); if (!s || !F) return;
  F.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  F.group.clear();
  W.spots = W.spots.filter(p => p.fridge !== F);
  const owned = Object.keys(FOOD).filter(k => (s.inv[k] || 0) > 0);
  // food low, drinks high, and anything that does not fit goes wherever there is room
  const free = F.shelves.map(sh => sh.slots.slice());
  const place = (id) => {
    const want = FOOD[id].shelf === "food" ? "food" : "drink";
    let i = F.shelves.findIndex((sh, j) => sh.kind === want && free[j].length);
    if (i < 0) i = free.findIndex(f => f.length);
    if (i < 0) return null;
    return {sh:F.shelves[i], at:free[i].shift()};
  };
  for (const id of owned){
    const p = place(id); if (!p) continue;
    const it = FOOD[id], n = s.inv[id], mask = p.at[2];
    const box = new THREE.Box3();
    for (let c = 0; c < Math.min(n, 3); c++){
      const m = itemMesh(id);
      m.position.set(p.at[0] + (F.across ? F.across[0] : 0)*c*.045, p.sh.y, p.at[1] + (F.across ? F.across[1] : .045)*c);
      if (F.ry) m.rotation.y = F.ry;
      F.group.add(m); m.updateMatrixWorld(true); box.expandByObject(m);
    }
    box.expandByScalar(.03);
    W.spots.push({fridge:F, item:id, mask, label:`${it.name}${n > 1 ? ` ×${n}` : ""}`, hint:verb(it),
      get lines(){ return foodLines(id, s.inv[id] || 0, srcOf(F)).slice(1); }, when:() => openFor(F, mask),
      aim:[box.min.toArray(), box.max.toArray()], run:() => F.ctx.eat(id, srcOf(F))});
  }
  if (!owned.length && F.emptyAim){
    W.spots.push({fridge:F, label:"Empty fridge", hint:"Buy food at the Mini Market, or order on Foodies", when:F.open, aim:F.emptyAim,
      run:() => F.ctx.note("Nothing in here. The Mini Market on your street sells food, or order on Foodies and carry the bag to a fridge.")});
  }
}
