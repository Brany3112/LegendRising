"use strict";
/* ============ BALL PHYSICS (metres, seconds) ============
   Pitch: x across (0..68), y from our target goal line (0) outwards. z is height.
   Goal centred at x=34 on y=0. */
const GOAL = {L:30.34, R:37.66, H:2.44, cx:34};
const BOX = {x0:13.84, x1:54.16, y1:16.5};
const BR = .11; // ball radius

function stepBall(b, h, aero){
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const kd = .0135 * (1 - aero*.0045);          // "Clean strike" lowers drag
  let ax = -kd*sp*b.vx, ay = -kd*sp*b.vy, az = -kd*sp*b.vz - 9.81;
  const hs = Math.hypot(b.vx, b.vy);
  const rolling = b.z <= BR + .001 && b.vz <= 0;
  if (rolling){
    az = 0; b.vz = 0; b.z = BR;
    if (hs > .05){ ax -= 2.6*b.vx/hs; ay -= 2.6*b.vy/hs; }
  } else {
    if (hs > .3){
      const rx = -b.vy/hs, ry = b.vx/hs;           // right-hand perpendicular of travel
      if (b.spin){ ax += b.spin*hs*rx; ay += b.spin*hs*ry; }             // sidespin -> curl
      if (b.knuck){ const k = b.knuck*Math.sin(b.kt*b.kw + b.kph); ax += k*rx; ay += k*ry; b.kt += h; } // no spin -> wobble
    }
    if (b.lift) az += b.lift*sp;                    // backspin floats, topspin dips
  }
  const dec = Math.exp(-(rolling ? 2 : .35)*h);
  b.spin *= dec; b.lift *= dec; if (b.knuck) b.knuck *= Math.exp(-.25*h);
  b.vx += ax*h; b.vy += ay*h; b.vz += az*h;
  if (rolling && Math.hypot(b.vx, b.vy) < .08){ b.vx = 0; b.vy = 0; }
  b.x += b.vx*h; b.y += b.vy*h; b.z += b.vz*h;
  if (b.z < BR){
    b.z = BR;
    if (b.vz < 0){ b.vz = -b.vz*.5; if (b.vz < 1.2) b.vz = 0; b.vx *= .88; b.vy *= .88; b.spin *= .5; b.lift *= .3; b.knuck = 0; }
  }
}

// Where will the ball cross the plane y = yPlane? spinMul < 1 simulates a keeper who misreads spin.
function predictCross(b0, yPlane, spinMul = 1){
  const b = {...b0}; b.spin *= spinMul; b.lift *= spinMul; b.knuck = 0;
  const aero = S.skills.aero;
  for (let t = 0; t < 3; t += 1/240){
    const py = b.y; stepBall(b, 1/240, aero);
    if (py > yPlane && b.y <= yPlane) return {x:b.x, z:b.z, t};
    if (b.vx === 0 && b.vy === 0) break;
  }
  return null;
}

/* Turn stage 1 (aim angle + power) and stage 2 (contact point on the ball) into a flight.
   u: -1 left .. +1 right of centre (as the shooter sees it). v: -1 top .. +1 bottom. */
function launchBall(b, ang, power, u, v, moving){
  const sk = S.skills, ef = energyFactor();
  const r = Math.hypot(u, v);
  const q = r <= .8 ? 1 : clamp(1 - (r-.8)*2.2, .35, 1);      // clean contact vs catching the edge
  u = clamp(u, -1, 1); v = clamp(v, -1, 1);
  const vmax = (17 + sk.power*.18) * (.72 + .28*ef) * (S.items.strike ? 1.04 : 1);
  const spd = vmax * power * (.55 + .45*q);
  const over = power > .9 ? 1 + (power-.9)*8 : 1;              // over-hitting costs accuracy
  const acc = M && M.isPass ? sk.passing*.7 + sk.accuracy*.3 : sk.accuracy;
  const errDeg = (1 - acc/115) * 6 * Math.pow(power, 1.5) * over * (1.6 - .6*ef) * (moving ? 1.25 : 1) * (1 + (1-q)*3);
  // hitting the right side pushes the ball out right first; the spin then bends it back left
  const a = ang + u*.16 + gauss()*errDeg*Math.PI/180;
  let elev = v > 0 ? .05 + Math.pow(v, 1.15)*.62 : .05 + v*.04;  // under the ball = lift, over it = low
  // striking across the ball lifts it as well as bending it — a whipped ball needs air to curl in
  elev += Math.abs(u)*.12*(1 - clamp(Math.abs(v), 0, 1));
  elev = clamp(elev + gauss()*errDeg*.004, 0, 1);
  const vh = spd*Math.cos(elev), vz = spd*Math.sin(elev);
  b.vx = Math.cos(a)*vh; b.vy = Math.sin(a)*vh; b.vz = vz; b.z = BR + .01;
  // curve: much stronger, and the further out you strike it the harder it bends
  // near-linear in how far out you strike it, so half a ball's width already bends it properly
  const curlK = .17 + sk.curve*.014;
  b.spin = -Math.sign(u)*Math.pow(Math.abs(u), .85) * curlK * (.6 + .4*power);
  b.lift = v > 0 ? v*.05 : v*.11*(.5 + .5*power);
  b.knuck = 0;
  if (r < .18 && power > .72){ b.knuck = rnd(1.2, 2.6)*power; b.kw = rnd(5, 9); b.kph = rnd(0, 6.28); b.kt = 0; }
  const style = b.knuck ? "knuckle" : Math.abs(u) >= .35 ? "curl" : v <= -.35 ? "dip" : (v >= .55 && power < .65) ? "chip" : v >= .4 ? "lofted" : "driven";
  return {q, style, speed:spd, u, v};
}
