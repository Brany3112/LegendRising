/* ============ LIFE: people ============
   Your team-mates out on the training pitch, the coach with his clipboard, the woman behind the till.
   Each one is a handful of rounded parts on a couple of hinges — enough to jog, pass, stretch and
   stand about — and they only exist while there is a reason for them to be there. */
import {THREE, W, roundedBoxGeo, lmat, solid} from "./build.js";

const SKIN = [0xf1c9a5, 0xe0ac84, 0xc68863, 0x9a6643, 0x6e4a33], HAIR = [0x1f1712, 0x3a2a1f, 0x6b4a2e, 0xb08a5a, 0x101010];
const col = c => typeof c === "number" ? c : new THREE.Color().setStyle(String(c)).getHex();
function seg(w, h, d, r, color){ const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r, 1), lmat(color)); m.castShadow = true; return m; }

// a person standing with feet at the origin, facing +z
export function person(o = {}){
  const shirt = col(o.shirt || 0x2c66b8), shorts = col(o.shorts || 0xf2f2ee), socks = col(o.socks || shirt);
  const sd = Math.abs(o.seed | 0);
  const skin = o.skin != null ? o.skin : SKIN[sd % SKIN.length], hair = o.hair != null ? o.hair : HAIR[(sd*7) % HAIR.length];
  const g = new THREE.Group(), s = o.scale || 1;
  const hips = new THREE.Group(); hips.position.y = .92; g.add(hips);
  const legs = [-1, 1].map(side => {
    const L = new THREE.Group(); L.position.set(side*.11, 0, 0); hips.add(L);
    const up = seg(.17, .4, .19, .07, o.long ? shirt : shorts); up.position.y = -.2; L.add(up);
    const lo = seg(.13, .48, .14, .06, o.long ? shirt : socks); lo.position.y = -.62; L.add(lo);
    const boot = seg(.13, .08, .25, .04, o.boots || 0x15171a); boot.position.set(0, -.88, .04); L.add(boot);
    return L;
  });
  const body = new THREE.Group(); body.position.y = .92; g.add(body);
  const torso = seg(.44, .62, .25, .1, shirt); torso.position.y = .32; body.add(torso);
  const neck = seg(.1, .08, .1, .03, skin); neck.position.y = .66; body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.135, 14, 10), lmat(skin)); head.position.y = .82; head.castShadow = true; body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 8, 0, Math.PI*2, 0, Math.PI*.5), lmat(hair)); cap.position.y = .84; cap.rotation.x = -.15; body.add(cap);
  const arms = [-1, 1].map(side => {
    const A = new THREE.Group(); A.position.set(side*.28, .58, 0); body.add(A);
    const up = seg(.11, .3, .12, .05, o.long ? shirt : shirt); up.position.y = -.15; A.add(up);
    const lo = seg(.09, .3, .1, .045, o.long ? shirt : skin); lo.position.y = -.43; A.add(lo);
    return A;
  });
  g.scale.setScalar(s);
  return {g, legs, arms, body, hips, phase:Math.random()*6, t:0};
}
// a running stride, an idle sway, or a kick
export function animate(p, dt, mode, speed = 1){
  p.t += dt*speed;
  const t = p.t + p.phase;
  if (mode === "run"){
    const a = Math.sin(t*9)*.7;
    p.legs[0].rotation.x = a; p.legs[1].rotation.x = -a;
    p.arms[0].rotation.x = -a*.8; p.arms[1].rotation.x = a*.8;
    p.body.position.y = .92 + Math.abs(Math.cos(t*9))*.05; p.body.rotation.x = .12;
  } else if (mode === "kick"){
    const k = Math.min(1, p.kick || 0);
    p.legs[1].rotation.x = -Math.sin(k*Math.PI)*1.1; p.legs[0].rotation.x = .1;
    p.arms[0].rotation.z = -.35*Math.sin(k*Math.PI); p.arms[1].rotation.z = .35*Math.sin(k*Math.PI);
  } else if (mode === "stretch"){
    p.body.rotation.x = .5 + Math.sin(t*.8)*.25; p.arms[0].rotation.x = p.arms[1].rotation.x = -.9 + Math.sin(t*.8)*.2;
    p.legs[0].rotation.x = -.15; p.legs[1].rotation.x = .15;
  } else {
    p.body.rotation.y = Math.sin(t*.5)*.08; p.body.position.y = .92 + Math.sin(t*1.6)*.006;
    p.legs[0].rotation.x = p.legs[1].rotation.x *= .9; p.arms[0].rotation.x *= .9; p.arms[1].rotation.x *= .9;
    p.arms[0].rotation.z = -.08; p.arms[1].rotation.z = .08;
  }
}

/* ---------- the training session on the pitch ---------- */
export function teamSession(o){
  // o: {kit:[a,b], when:() => bool, centre:{x,z}, coach:{x,z,ry}, ballMesh:() => Mesh}
  const root = new THREE.Group(); W.scene.add(root);
  const [a, b] = o.kit || ["#2c66b8", "#ffffff"];
  const actors = [];
  let seed = 3;
  // two pairs passing the ball, wearing bibs over the kit
  const pairs = [[{x:o.centre.x - 9, z:o.centre.z - 3}, {x:o.centre.x - 1, z:o.centre.z - 3}], [{x:o.centre.x + 2, z:o.centre.z + 3}, {x:o.centre.x + 10, z:o.centre.z + 3}]];
  for (const [p1, p2] of pairs){
    const A = person({shirt:pairs.indexOf(p1) ? "#d8ff3a" : a, shorts:b, seed:seed++}), B = person({shirt:pairs.indexOf(p1) ? "#d8ff3a" : a, shorts:b, seed:seed++});
    A.g.position.set(p1.x, 0, p1.z); B.g.position.set(p2.x, 0, p2.z);
    A.g.lookAt(p2.x, 0, p2.z); B.g.lookAt(p1.x, 0, p1.z);
    root.add(A.g, B.g);
    const ball = o.ballMesh(); root.add(ball);
    actors.push({kind:"pair", A, B, ball, t:Math.random(), dir:1, p1, p2});
  }
  // three lapping the pitch together
  const lap = o.lap || [{x:-18, z:-6}, {x:18, z:-6}, {x:18, z:-25}, {x:-18, z:-25}];
  for (let i = 0; i < 3; i++){
    const P = person({shirt:a, shorts:b, seed:seed++});
    root.add(P.g);
    actors.push({kind:"lap", P, seg:0, d:i*1.6, speed:3.4 + i*.12});
  }
  // one stretching by the touchline, and the coach watching it all
  const st = person({shirt:a, shorts:b, seed:seed++}); st.g.position.set(o.centre.x + 4, 0, o.centre.z + 8.5); st.g.rotation.y = Math.PI; root.add(st.g);
  actors.push({kind:"stretch", P:st});
  const coach = person({shirt:0x1b2633, shorts:0x1b2633, long:true, socks:0x1b2633, seed:9, hair:0x8a8a8a});
  coach.g.position.set(o.coach.x, 0, o.coach.z); coach.g.rotation.y = o.coach.ry || 0;
  const board = new THREE.Mesh(roundedBoxGeo(.24, .32, .02, .01), lmat(0xf2f2ee)); board.position.set(.05, -.3, .12); board.rotation.x = -.6; coach.arms[1].add(board);
  coach.arms[1].rotation.x = -.7;
  root.add(coach.g);
  const coachSolid = solid(o.coach.x - .35, o.coach.x + .35, o.coach.z - .35, o.coach.z + .35, 0, 1.9);
  let on = null;
  W.anims.push(dt => {
    const now = !!o.when();
    if (now !== on){ on = now; root.visible = now; coachSolid.off = !now; }
    if (!now) return;
    for (const ac of actors){
      if (ac.kind === "pair"){
        ac.t += dt*.55;
        const from = ac.dir > 0 ? ac.A : ac.B, to = ac.dir > 0 ? ac.B : ac.A;
        const k = Math.min(1, ac.t);
        const fp = from.g.position, tp = to.g.position;
        ac.ball.position.set(fp.x + (tp.x - fp.x)*k, .11 + Math.sin(k*Math.PI)*.25, fp.z + (tp.z - fp.z)*k);
        from.kick = Math.min(1, ac.t*4); animate(from, dt, ac.t < .25 ? "kick" : "idle");
        to.kick = 0; animate(to, dt, "idle");
        if (ac.t >= 1.25){ ac.t = 0; ac.dir = -ac.dir; }
      } else if (ac.kind === "lap"){
        ac.d += ac.speed*dt;
        // where along the loop is he
        let d = ac.d, i = 0, n = lap.length;
        const segLen = k => Math.hypot(lap[(k + 1) % n].x - lap[k].x, lap[(k + 1) % n].z - lap[k].z);
        let total = 0; for (let k = 0; k < n; k++) total += segLen(k);
        d %= total; while (d > segLen(i)){ d -= segLen(i); i = (i + 1) % n; }
        const A = lap[i], B = lap[(i + 1) % n], f = d/segLen(i);
        ac.P.g.position.set(A.x + (B.x - A.x)*f, 0, A.z + (B.z - A.z)*f);
        ac.P.g.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
        animate(ac.P, dt, "run", ac.speed/3.4);
      } else animate(ac.P, dt, "stretch");
    }
    animate(coach, dt, "idle");
  });
  return {root, coach};
}
// someone standing behind a counter or a desk
export function staffer(x, z, ry, o = {}){
  const p = person(Object.assign({long:true, seed:5}, o));
  p.g.position.set(x, o.y || 0, z); p.g.rotation.y = ry;
  W.scene.add(p.g);
  W.anims.push(dt => animate(p, dt, "idle"));
  solid(x - .3, x + .3, z - .3, z + .3, o.y || 0, (o.y || 0) + 1.9);
  return p;
}
