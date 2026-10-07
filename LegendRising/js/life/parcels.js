/* ============ LIFE: deliveries waiting for you ============
   A Foodies order is not put in your fridge by magic. The courier leaves a bag at a delivery point (the table in your
   lobby, to the right of the door as you look out, or the one at the training centre) and there it waits
   (S.parcels: {id, items, at:"home"|"ground"}). A left click picks it up (a bag in your hands, inv.js, the food still
   inside); walk it up to a fridge and the food goes in, the bag goes in the bin. Both fridges hold the same food, so
   it does not matter which one.

   Owner: WP-G (Stage 1), WP-I (Stage 2). Contracts: DESIGN 3.8.5 (bags travel in your hands; any bag on you, a
   pocketed one from an older save too, goes in at a fridge), 3.8.7 (the delivery point is on the compass while a bag
   waits there: a W.places entry of kind "deliv" with a when()), 1.3 (S.inv changes here only in parcelStep). */
import {THREE, W, spot} from "./build.js";
import {itemMesh, bagsOnYou, removeItem} from "./inv.js";

const G = () => (typeof S !== "undefined" ? S : null);
let POINT = null;              // this zone's delivery point: {zone, name, slots:[[x, y, z, ry]], shown:[]}
const what = items => Object.entries(items || {}).filter(([k, n]) => n > 0).map(([k, n]) => `${n}× ${typeof FOOD === "object" && FOOD[k] ? FOOD[k].name : k}`).join(", ");
export const parcelText = what;
// what each delivery point is called, everywhere it is mentioned (the chips, the Foodies app, the first day)
export const POINT_NAME = {home:"the delivery table in your lobby", ground:"the delivery shelf inside the gym door"};
export function pointName(at){ return POINT_NAME[at === "ground" ? "ground" : "home"]; }
window.lifePointName = pointName;
const waitingAt = zone => { const s = G(); return !!s && (s.parcels || []).some(p => p.at === zone); };

/* the zone's builder says where its delivery point is: a name for it and the spots on it a bag can stand on, each
   [x, y, z, ry]. It goes on the compass (DELIVERIES) while a bag is waiting on it */
export function deliveryPoint(zone, name, slots){
  POINT = {zone, name, slots, shown:[]};
  if (W.places && slots && slots.length){
    const x = slots.reduce((a, s) => a + s[0], 0)/slots.length, z = slots.reduce((a, s) => a + s[2], 0)/slots.length;
    W.places.push({name:"Deliveries", kind:"deliv", x, z, when:() => waitingAt(zone)});
  }
  refreshParcels();
}
export function resetParcels(){ POINT = null; }
// put the bags waiting here on their table: one bag per order, side by side
export function refreshParcels(){
  const s = G(); if (!POINT || !s) return;
  for (const sh of POINT.shown){ if (sh.m.parent) sh.m.parent.remove(sh.m); sh.m.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  W.spots = W.spots.filter(sp => !sp.parcel);
  POINT.shown = [];
  const here = (s.parcels || []).filter(p => p.at === POINT.zone);
  here.forEach((p, i) => {
    const sl = POINT.slots[i % POINT.slots.length], m = itemMesh({id:"bag"});
    m.position.set(sl[0], sl[1] + Math.floor(i/POINT.slots.length)*.3, sl[2]); m.rotation.y = sl[3] || 0;
    W.scene.add(m);
    const bb = new THREE.Box3();
    W.spots.push({kind:"pick", parcel:p, label:"Foodies bag", get hint(){ return `${what(p.items)} · left click to pick it up`; },
      aim:() => { bb.setFromObject(m); bb.expandByScalar(.05); return [bb.min.toArray(), bb.max.toArray()]; },
      pick(){
        s.parcels = s.parcels.filter(x => x !== p);
        refreshParcels();
        return {id:"bag", items:p.items, hint:"Carry it to a fridge in your hands. The food goes in when you get close."};
      }});
    POINT.shown.push({p, m});
  });
}
/* every frame: any bag on you (in your hands, or a pocket from an older save), close enough to the front of a fridge,
   goes in. W.fridges: [{x, z, y, name, mult}] where you stand to open each fridge in this zone (furniture.js,
   ground.js). done(bag, fridge) once per bag */
export function parcelStep(P, done){
  if (!W.fridges || !W.fridges.length) return;
  const bags = bagsOnYou(); if (!bags.length) return;
  const f = W.fridges.find(f => Math.abs((f.y == null ? P.feet : f.y) - P.feet) <= .8 && Math.hypot(f.x - P.x, f.z - P.z) <= 1.15);
  if (!f) return;
  const s = G();
  for (const it of bags){
    if (!removeItem(it)) continue;
    for (const [k, n] of Object.entries(it.items || {})) if (typeof FOOD === "object" && FOOD[k] && n > 0) s.inv[k] = (s.inv[k] || 0) + n;
    if (done) done(it, f);
  }
}
