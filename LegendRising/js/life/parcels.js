/* ============ LIFE: deliveries waiting for you ============
   A Foodies order is not put in your fridge by magic. The courier leaves a bag at a delivery point — the table in your
   lobby, to the right of the door as you look out, or the shelf just inside the gym door at the training centre —
   and there it waits (S.parcels: {id, items, at:"home"|"ground"}). A left click picks it up (a bag in your hand,
   inv.js, the food still inside); walk it up to a fridge and the food goes in, the bag goes in the bin. Both fridges
   hold the same food, so it does not matter which one. */
import {THREE, W, spot} from "./build.js";
import {itemMesh, hand, release} from "./inv.js";

const G = () => (typeof S !== "undefined" ? S : null);
let POINT = null;              // this zone's delivery point: {zone, name, slots:[[x, y, z, ry]], shown:[]}
const what = items => Object.entries(items || {}).filter(([k, n]) => n > 0).map(([k, n]) => `${n}× ${typeof FOOD === "object" && FOOD[k] ? FOOD[k].name : k}`).join(", ");
export const parcelText = what;

/* the zone's builder says where its delivery point is: a name for it ("the table in your lobby") and the spots on it
   a bag can stand on, each [x, y, z, ry] */
export function deliveryPoint(zone, name, slots){ POINT = {zone, name, slots, shown:[]}; refreshParcels(); }
export function pointName(at){ return at === "ground" ? "the delivery shelf inside the gym door" : "the delivery table in your lobby"; }
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
        return {id:"bag", items:p.items, hint:"Take it to a fridge — the food goes in when you get close."};
      }});
    POINT.shown.push({p, m});
  });
}
/* every frame: with a bag in your hand, close enough to the front of a fridge, the food goes in. W.fridges: [{x, z,
   name, mult}] — where you stand to open each fridge in this zone (furniture.js, ground.js) */
export function parcelStep(P, done){
  const it = hand(); if (!it || it.id !== "bag" || !W.fridges) return;
  for (const f of W.fridges){
    if (Math.abs((f.y == null ? P.feet : f.y) - P.feet) > .8) continue;
    if (Math.hypot(f.x - P.x, f.z - P.z) > 1.15) continue;
    const s = G(); release();
    for (const [k, n] of Object.entries(it.items || {})) if (typeof FOOD === "object" && FOOD[k] && n > 0) s.inv[k] = (s.inv[k] || 0) + n;
    if (done) done(it, f);
    return;
  }
}
