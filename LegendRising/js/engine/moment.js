"use strict";
/* ============ MOMENT ENGINE ============
   Phases: dribble -> aim (stage 1: pull back for direction + power)
           -> contact (stage 2: hit the 3D ball) -> flight -> done */
let M = null, loopOn = false, lastT = 0;
// every moment is recorded (30 snapshots a second, last ~14s) so goals can be played back
let REP = null;
function recFrame(){
  if (!M) return;
  if (M.phase === "aim" || M.phase === "contact") return;      // nothing moves while you line it up
  const r = M.rec || (M.rec = []);
  M.recSkip = (M.recSkip || 0) + 1; if (M.recSkip % 3) return;  // 20 snapshots a second is plenty
  const b = M.ball, p = M.p, n = v => Math.round(v*100)/100;
  r.push({b:[n(b.x), n(b.y), n(b.z)], p:[n(p.x), n(p.y)], c:null,
    d:M.defs.map(d => [n(d.x), n(d.y), d.stun > 0 ? 1 : 0]), g:[n(M.gk.x), n(M.gk.y)],
    m:(M.mates || []).map(t => [n(t.x), n(t.y), t.role]), w:(M.wall || []).map(w => [n(w.x), n(w.y)])});
  if (r.length > 300) r.shift();
}
function startReplay(rec, meta, onEnd){
  if (!rec || rec.length < 6){ if (onEnd) onEnd(); return; }
  REP = {frames:rec, i:0, meta:meta || {}, onEnd, speed:.6};
  const ov = $("#ov"); if (ov){ ov.hidden = false; ov.className = "ov rep"; ov.dataset.kind = "rep";
    ov.innerHTML = `<div class="rep-bar"><span class="rep-dot">● REPLAY</span><b>${esc((meta && meta.label) || "")}</b><button class="btn sm ghost" onclick="A.skipReplay()">Skip ▸</button></div>`; }
}
function stepReplay(dt){ if (!REP) return; REP.i += dt*20*REP.speed; if (REP.i >= REP.frames.length - 1) endReplay(); }
function endReplay(){ const r = REP; REP = null; NEED_DRAW = true; const ov = $("#ov"); if (ov) ov.dataset.kind = ""; if (r && r.onEnd) r.onEnd(); }
const inp = {down:false, id:null, sx:0, sy:0, x:0, y:0, hx:null, hy:null};
const keys = {};

function newDef(x, y, opp){ return {x:clamp(x,1,67), y:clamp(y,2,44), spd:4.2 + opp*.032, cd:0, stun:0, beaten:false}; }

function startMoment(type){
  const opp = MT.oppR, p = {x:34, y:30, vx:0, vy:0, fx:0, fy:-1};
  M = {type, opp, t:0, limit:16, phase:"dribble", moving:true, phaseT:0,
       ball:{x:0,y:0,z:BR,vx:0,vy:0,vz:0,spin:0,lift:0,knuck:0}, p, defs:[], wall:[],
       gk:{x:34, y:1, tx:34, x0:34, react:0, dive:5, cap:2, cd:0, re:false, tPred:1},
       sprintT:0, sprinting:false, dribbles:0, touchCd:0, flash:null, endT:0,
       result:null, resultText:"", gkDone:false, info:"", kickT:null, aimFrom:null, aim:null, lock:null, contact:null, shot:null, trail:[]};
  switch (type){
    case "run": p.x = rnd(16,52); p.y = rnd(30,37);
      M.defs = [newDef(p.x+rnd(-3,3), p.y-rnd(5,8), opp), newDef(p.x+rnd(-10,-4), rnd(18,24), opp), newDef(p.x+rnd(4,10), rnd(18,24), opp)];
      M.limit = 16; break;
    case "wing": { const s = Math.random()<.5 ? -1 : 1; p.x = s<0 ? rnd(4,10) : rnd(58,64); p.y = rnd(20,30);
      M.defs = [newDef(p.x-s*3, p.y-4, opp), newDef(rnd(28,40), rnd(17,21), opp)]; M.limit = 14; break; }
    case "oneonone": p.x = rnd(28,40); p.y = rnd(26,32);
      M.defs = [newDef(p.x+rnd(-2,2), p.y+4, opp)]; M.defs[0].spd *= 1.05; M.limit = 10; break;
    case "edge": p.x = rnd(20,48); p.y = rnd(18.5,22);
      M.defs = [newDef(p.x+rnd(-1.5,1.5), p.y-3, opp), newDef(p.x+(p.x<34?3.5:-3.5), p.y-1.5, opp)];
      M.ball.x = p.x; M.ball.y = p.y - .55; M.info = "Edge of the box"; M.edgeStart = true; break;
    case "counter": {
      // you broke from deep with space in front of you: two of them scrambling back, two of yours flying up alongside
      p.x = 34 + rnd(-10, 10); p.y = rnd(36, 42);
      M.defs = [newDef(p.x + rnd(-6, 6), p.y - rnd(10, 15), opp), newDef(34 + rnd(-5, 5), rnd(14, 19), opp)];
      M.limit = 16; M.info = "Counter-attack!"; break; }
    case "cross": {
      // wide by the byline with bodies arriving in the box: near post, far post, and one waiting for the cut-back
      const sd = Math.random() < .5 ? -1 : 1;
      p.x = sd < 0 ? rnd(3, 7) : rnd(61, 65); p.y = rnd(6, 11);
      const R = MT.roleNames, c = clamp(S.chem/100, 0, 1);
      const spots = [["near", sd < 0 ? 31.6 : 36.4, rnd(4, 6)], ["far", sd < 0 ? 38.6 : 29.4, rnd(5, 8)], ["cut", sd < 0 ? rnd(19, 23) : rnd(45, 49), rnd(12, 16)]];
      // the striker attacks the near post, the far winger arrives at the back stick, the ten waits for the cut-back
      const roles = ["ST", sd < 0 ? "RW" : "LW", "CAM"];
      M.mates = spots.map(([slot, x, y], i) => ({role:roles[i], name:R[roles[i]].name, pid:R[roles[i]].id, x, y, slot, ox:0, oy:0, vx:0, vy:0,
        st:wpick(["open", "space", "marked", "held"], k => ({open:1.6, space:1, marked:2, held:1}[k])*(k === "open" || k === "space" ? .7 + c*.8 : 1.3 - c*.5))}));
      M.defs = [newDef(p.x + (sd < 0 ? 2 : -2), p.y + 2.5, opp)];
      for (const m of M.mates){ const mk = m.st === "held" ? .75 : m.st === "marked" ? 1.5 : m.st === "space" ? 3.2 : 4.5; const d = newDef(m.x + rnd(-.5, .5), m.y - mk, opp); d.mark = m; d.markD = mk; M.defs.push(d); }
      M.gk.x = 34 + sd*-1.5; M.gk.y = 1.2;
      M.ball.x = p.x; M.ball.y = p.y - .4; M.cross = true;
      M.info = "Out wide by the byline"; break; }
    case "freekick": {
      const d = rnd(18,30), a = rnd(-.55,.55), bx = 34 + Math.sin(a)*d, by = Math.cos(a)*d;
      M.ball.x = bx; M.ball.y = by;
      const side = bx < 34 ? -1 : 1, ax = 34 + side*1.8;
      const dl = Math.hypot(ax-bx, by), ux = (ax-bx)/dl, uy = -by/dl, rx = -uy, ry = ux;
      const wx = bx + ux*9.15, wy = by + uy*9.15, n = d < 24 ? 5 : 4;
      for (let i=0; i<n; i++){ const o = (i-(n-1)/2)*.62; M.wall.push({x:wx+rx*o, y:wy+ry*o, wall:true, stun:0}); }
      M.gk.x = 34 - side*1.1; M.gk.y = .8;
      beginAim(false); M.info = `Free kick · ${Math.round(d)}m`; break; }
    case "pass": {
      // you're on the ball; four team-mates are available, one is calling for it
      p.x = 34 + rnd(-12, 12); p.y = rnd(30, 36);
      const R = MT.roleNames;
      M.mates = [{role:"LW", x:rnd(5,12), y:rnd(13,22)}, {role:"RW", x:rnd(56,63), y:rnd(13,22)}, {role:"CAM", x:34 + rnd(-7,7), y:rnd(19,25)}, {role:"ST", x:34 + rnd(-5,5), y:rnd(8,13)}]
        .map(t => Object.assign(t, {name:R[t.role].name, pid:R[t.role].id}));
      M.call = pick(["LW","RW","CAM","ST","ST"]);
      M.defs = M.mates.map(t => { const open = t.role === M.call, d = open ? rnd(4, 6) : rnd(1.2, 2.6), a = rnd(-.8, .8);
        return newDef(t.x + Math.sin(a)*d*(34 > t.x ? 1 : -1)*.5, t.y - Math.cos(a)*d*.8 - .5, opp); });
      M.defs.push(newDef(p.x + rnd(-2, 2), p.y - rnd(4, 6), opp));
      M.ball.x = p.x; M.ball.y = p.y - .55; M.isPass = true;
      beginAim(false, 5.5); M.moving = true;
      M.info = `Find the ${M.call}: ${R[M.call].name} is calling for it`; break; }
    case "tackle": case "last": case "shepherd": return startTackle(type);
    case "intercept": return startIntercept();
    case "aerial": return startAerial();
    case "throwin": {
      // you take it from the touchline. No boot on the ball, so no curl and not much power —
      // it is all about picking the right man and getting the weight right.
      const side = Math.random() < .5 ? 0 : 68;
      p.x = side; p.y = rnd(16, 30);
      const inward = side === 0 ? 1 : -1;
      const R = MT.roleNames;
      M.mates = [{role:"CAM", x:p.x + inward*rnd(5, 9),  y:p.y - rnd(1, 5)},
                 {role:"ST",  x:p.x + inward*rnd(10, 16), y:p.y - rnd(4, 9)},
                 {role:side === 0 ? "LW" : "RW", x:p.x + inward*rnd(2, 5), y:p.y + rnd(3, 7)},
                 // the long one down the line — still inside what a throw can actually reach
                 {role:side === 0 ? "RW" : "LW", x:p.x + inward*rnd(3, 7), y:p.y - rnd(10, 14)}]
        .map(t => Object.assign(t, {name:R[t.role].name, pid:R[t.role].id}));
      M.call = pick(M.mates).role;
      M.defs = M.mates.map(t => { const open = t.role === M.call, d = open ? rnd(3.5, 5.5) : rnd(1.1, 2.4), a = rnd(-.9, .9);
        return newDef(t.x - inward*Math.cos(a)*d, t.y - Math.sin(a)*d*.8, opp); });
      M.ball.x = p.x; M.ball.y = p.y; M.isPass = true; M.throwIn = true;
      beginAim(false, 6); M.moving = false;
      // you take it from behind the line with the ball in your hands, so the throw — and the
      // arrow you aim with — starts at you, not at a ball sitting on the paint
      M.p.x = side === 0 ? -.9 : 68.9; M.p.y = p.y;
      M.p.fx = inward; M.p.fy = 0;
      // the ball sits in his hands above the line — off the paint it would count as out of play
      M.ball.x = side === 0 ? .12 : 67.88; M.ball.y = M.p.y; M.ball.z = 2.1;
      M.aimFrom = {x:M.ball.x, y:M.ball.y};
      M.aim.ang = Math.atan2(0, inward);
      M.info = `Throw-in · find the ${M.call}: ${R[M.call].name}`;
      break; }
    case "corner": {
      // from the corner arc. Side contact swings it in or away; under the ball floats it to the back post.
      const side = Math.random() < .5 ? 0 : 1;
      p.x = side ? 67.4 : .6; p.y = .6;
      const R = MT.roleNames;
      M.mates = [{role:"ST",  x:34 + rnd(-3, 3),  y:rnd(4.5, 7)},
                 {role:"CAM", x:34 + rnd(-7, 7),  y:rnd(7, 11)},
                 {role:"LW",  x:34 - rnd(4, 9),   y:rnd(3.5, 6)},
                 {role:"RW",  x:34 + rnd(4, 9),   y:rnd(3.5, 6)}]
        .map(t => Object.assign(t, {name:R[t.role].name, pid:R[t.role].id}));
      M.call = pick(M.mates).role;
      M.defs = M.mates.map(t => { const open = t.role === M.call, d = open ? rnd(2.6, 4.2) : rnd(.9, 2);
        return newDef(clamp(t.x + rnd(-1, 1)*d, 2, 66), clamp(t.y - d*.7, 1.5, 14), opp); });
      M.gk.x = 34; M.gk.y = 1.2;
      M.ball.x = p.x; M.ball.y = p.y; M.isPass = true; M.corner = true;
      beginAim(false, 7); M.moving = false;
      M.info = `Corner · swing it in for the ${M.call}: ${R[M.call].name}`;
      break; }
    case "penalty": M.ball.x = 34; M.ball.y = 11; M.gk.x = 34; M.gk.y = .3; beginAim(false); M.info = "Penalty"; break;
  }
  if (M.phase === "dribble" && !M.cross){ M.ball.x = p.x; M.ball.y = p.y - .55; }
  if (!M.aimFrom) M.aimFrom = null;
  // team-mates around the chance, each in a state of his own
  if (typeof addSupport === "function" && SUPPORTED[type]) addSupport(type);
  if (M.cross || M.edgeStart){ if (M.mates && M.mates.length && typeof beginDecide === "function") beginDecide(); else { M.shooting = true; beginAim(true, 3.5); } }
  resize(); updateMatchHUD();
}

function flash(t){ if (M) M.flash = {t, life:1.2}; }
function endMoment(res, text){
  if (!M || M.phase === "done") return;
  M.phase = "done"; M.result = res; M.resultText = text; M.endT = res === "goal" ? 2 : 1.4;
  flash(res === "goal" ? "GOAL!" : {saved:"SAVED", miss:"WIDE", post:"POST!", bar:"BAR!", blocked:"BLOCKED", corner:"CORNER", lost:"LOST IT", passed:"GREAT BALL", intercepted:"INTERCEPTED", outplay:"OUT OF PLAY", aiLost:"CHANCE GONE"}[res]);
  if (typeof hideDecide === "function") hideDecide();
  inp.down = false; updateMatchHUD();
}

/* ---------- keeper ---------- */
function keeperSpot(){
  const g = M.gk, b = M.ball, d = Math.max(.1, Math.hypot(b.x-34, b.y));
  if (M.type === "freekick") return {tx:g.x, ty:.8};
  const out = M.type === "oneonone" ? clamp(d*.3, 1, 6) : M.type === "penalty" ? .3 : clamp(d*.08, .6, 2.2);
  return {tx: 34 + (b.x-34)/d*out, ty: Math.max(.3, b.y/d*out)};
}
function moveKeeper(dt){
  const g = M.gk, {tx, ty} = keeperSpot(), gd = Math.hypot(tx-g.x, ty-g.y), gs = (3.2 + M.opp*.02)*dt;
  if (gd > .02){ const m = Math.min(gd, gs); g.x += (tx-g.x)/gd*m; g.y += (ty-g.y)/gd*m; }
}

/* ---------- phase: dribble ---------- */
function updateDribble(dt){
  const p = M.p, b = M.ball, sk = S.skills, ef = energyFactor();
  M.t += dt;
  let tx = null, ty = null;
  if (inp.down){ const w_ = screenToWorld(inp.x, inp.y - (inp.touch ? 78*DPR : 0)); if (w_){ tx = w_.x; ty = w_.y; } }
  const kx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0);
  const ky = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
  if (kx || ky){ const m = Math.hypot(kx,ky), L = keys.shift ? 10 : 4; tx = b.x + kx/m*L; ty = b.y + ky/m*L; }
  const base = (5.2 + sk.pace*.036) * (.6 + .4*ef) * (S.items.grip ? 1.03 : 1);
  let dirx = 0, diry = 0, want = 0, far = 0;
  if (tx !== null){ const dx = tx-b.x, dy = ty-b.y, d = Math.hypot(dx,dy); if (d > .25){ dirx = dx/d; diry = dy/d; want = clamp(d/5, .3, 1); far = d; } }
  M.sprinting = want > 0 && (far > 7 || keys.shift);
  const top = base * (M.sprinting ? 1.27 : 1), spd = top*want;
  const pb = Math.hypot(b.x-p.x, b.y-p.y);
  // the player runs to a spot just behind the ball, on the side away from where he wants to go
  const gx = want ? b.x - dirx*.45 : b.x, gy = want ? b.y - diry*.45 : b.y + .45;
  const gdx = gx-p.x, gdy = gy-p.y, gd = Math.hypot(gdx,gdy);
  const run = want ? (pb > 1.2 ? top : Math.max(spd, 2)) : Math.min(base*.5, gd*3);
  let tvx = 0, tvy = 0; if (gd > .08){ tvx = gdx/gd*run; tvy = gdy/gd*run; }
  const k = Math.min(1, dt*9); p.vx += (tvx-p.vx)*k; p.vy += (tvy-p.vy)*k;
  p.x = clamp(p.x + p.vx*dt, .4, 67.6); p.y = clamp(p.y + p.vy*dt, .4, 44);
  const pv = Math.hypot(p.vx,p.vy); if (pv > .4){ p.fx = p.vx/pv; p.fy = p.vy/pv; }
  if (M.sprinting) M.sprintT += dt;
  // touches: low dribbling = heavier, less accurate touches
  M.touchCd -= dt;
  if (want && pb < .6 && M.touchCd <= 0){
    // q = how good your touch is. Poor touch + speed = the ball gets knocked miles ahead, at odd angles
    const q = sk.dribbling/100, fast = clamp(spd/7, 0, 1.2);
    const heavy = 1.05 + (1 - q)*(.3 + fast*rnd(.2, 1.0)) + (M.sprinting ? .16 : 0);
    const err = gauss()*(1 - q)*(.1 + fast*.22), c = Math.cos(err), s = Math.sin(err);
    const push = Math.max(spd, 2.2)*heavy + (1 - q)*fast*rnd(0, 1.2);
    b.vx = (dirx*c - diry*s)*push; b.vy = (dirx*s + diry*c)*push;
    M.touchCd = .16 + (1 - q)*rnd(0, .18);
  }
  if (!want && pb < .7){ const f = Math.exp(-8*dt); b.vx *= f; b.vy *= f; }   // trap it
  const f = Math.exp(-1.6*dt); b.vx *= f; b.vy *= f;
  b.x += b.vx*dt; b.y += b.vy*dt; b.z = BR;

  if (typeof updateMates === "function") updateMates(dt);
  updateDefs(dt); if (M.phase !== "dribble") return;
  moveKeeper(dt);
  const g = M.gk; g.cd -= dt;
  if (Math.hypot(g.x-b.x, g.y-b.y) < 1.0 && g.cd <= 0){
    if (Math.random() < .35 + M.opp*.004 + (pb > 1.2 ? .3 : 0)) return endMoment("lost", "The keeper came out and smothered it.");
    g.cd = 1.2; M.dribbles++; flash("Rounded the keeper!");
  }
  if (b.x < 0 || b.x > 68 || b.y > 44) return endMoment("lost", "Ran it out of play.");
  if (b.y < .3) return endMoment("lost", "Over the byline.");
  if (b.x > BOX.x0 && b.x < BOX.x1 && b.y < BOX.y1 && pb < 1.3){
    // into the box: if there is somebody to give it to, the game slows and you choose
    if (!M.decided && M.mates && M.mates.length && !M.gaveBack && typeof beginDecide === "function") return beginDecide();
    M.shooting = true; return beginAim(true, 3.2);
  }
  if (M.t > M.limit) endMoment("lost", "Held it too long — the defence closed you down.");
}
function updateDefs(dt){
  if (M.t < .45) return;
  const p = M.p, b = M.ball, sk = S.skills; let best = null, bd = 1e9;
  for (const d of M.defs){ if (d.stun > 0 || d.mark) continue; const dd = Math.hypot(d.x-b.x, d.y-b.y); if (dd < bd){ bd = dd; best = d; } }
  M.defs.forEach((d, i) => {
    d.cd -= dt; if (d.stun > 0){ d.stun -= dt; return; }
    if (d.mark) return;                                             // he has a man to look after
    let tx, ty, sp = d.spd;
    if (d === best){ tx = b.x + b.vx*.2; ty = b.y + b.vy*.2; }
    else { tx = b.x + (34-b.x)*.35 + (i%2 ? 2.5 : -2.5); ty = Math.max(3, b.y*.55); sp *= .78; }
    const dx = tx-d.x, dy = ty-d.y, dl = Math.hypot(dx,dy);
    if (dl > .05){ const m = Math.min(dl, sp*dt); d.x += dx/dl*m; d.y += dy/dl*m; }
    const px = d.x-p.x, py = d.y-p.y, pd = Math.hypot(px,py);          // bodies don't overlap
    if (pd < .9 && pd > 0){ const push = (.9-pd)/2; d.x += px/pd*push; d.y += py/pd*push; p.x -= px/pd*push; p.y -= py/pd*push; }
    if (d === best && d.cd <= 0 && Math.hypot(d.x-b.x, d.y-b.y) < .85 && M.phase === "dribble"){
      const loose = clamp((Math.hypot(b.x-p.x, b.y-p.y) - .7)/1.3, 0, 1);
      const pt = clamp(.28 + (M.opp - sk.dribbling - (S.items.control ? 6 : 0))*.011 + loose*.4 + (M.sprinting ? .05 : 0), .08, .93);
      if (Math.random() < pt){ if (Math.random() < .03) M.injury = ri(1, 4); endMoment("lost", loose > .6 ? "Heavy touch — he nicked it off you." : pick(["Clean tackle — ball's gone.","He read it and took it off you.","Dispossessed."])); }
      else { d.stun = 1.3; d.cd = 1.6; if (!d.beaten){ d.beaten = true; M.dribbles++; flash(pick(["Skinned him!","Nutmeg!","Gone past him!"])); } }
    }
  });
}
function passMode(){ return !!(M && M.isPass && !M.shooting); }     // is the strike being lined up a pass, or a shot?
function shootNow(){
  if (!M) return;
  if (M.phase === "decide"){ const i = M.opt.opts.findIndex(o => o.kind === "shoot"); if (i >= 0) chooseOption(i); return; }
  if (M.phase === "aim" && typeof switchToShot === "function" && switchToShot()) return;
  if (M.phase !== "dribble") return;
  if (Math.hypot(M.ball.x-M.p.x, M.ball.y-M.p.y) > 1.3) return flash("Get to the ball first");
  // choosing to shoot with team-mates around is a decision too
  if (!M.decided && M.mates && M.mates.length && typeof buildOptions === "function"){
    const b = buildOptions(); M.decided = true;
    M.dec = {choice:"shoot", chosenQ:b.shotQ, shotQ:b.shotQ, bestQ:b.best ? b.best.q : 0, bestOpen:b.best ? OPEN_STATES.has(b.best.m.st) : false, bestName:b.best ? b.best.m.name : "", ctx:"open"};
  }
  M.shooting = true; beginAim(true, 3.2);
}
/* who is in the best position right now — used when you choose to pass rather than being told who is calling */
function bestMate(){
  const b = M.ball; let best = null, bv = -1e9;
  for (const m of (M.mates || [])){
    let near = 99;
    for (const d of M.defs) if (d.stun <= 0) near = Math.min(near, Math.hypot(d.x - m.x, d.y - m.y));
    const v = spotValue(m) + Math.min(near, 8)*.55 + (laneOpen(b, m, 1.1) ? 2.5 : 0);
    if (v > bv){ bv = v; best = m; }
  }
  return best;
}
/* S while you are on the ball: pick out a team-mate and open the passing mini-game */
function passNow(){
  if (!M || M.phase !== "dribble") return;
  if (!M.mates || !M.mates.length) return flash("Nobody's in support");
  if (Math.hypot(M.ball.x-M.p.x, M.ball.y-M.p.y) > 1.3) return flash("Get to the ball first");
  if (!M.decided && !M.ai && typeof beginDecide === "function" && !M.wonBall) return beginDecide();
  const t = bestMate(); if (!t) return flash("Nobody's in support");
  M.shooting = false; M.isPass = true; M.call = t.role;
  M.info = `Find the ${t.role}: ${t.name} is calling for it`;
  flash(`${t.name} is calling for it`);
  beginAim(false, 5.5); M.moving = true;
  updateMatchHUD();
}

/* ---------- phase: aim (stage 1) ---------- */
function beginAim(moving, limit){
  const b = M.ball, p = M.p;
  M.phase = "aim"; M.moving = moving; M.phaseT = 0; M.aimLimit = (limit || (moving ? 4.5 : 1e9));
  M.aimFrom = {x:b.x, y:b.y};
  b.vx = b.vy = b.vz = 0; b.z = BR;
  const d = Math.hypot(34-b.x, b.y) || 1, ux = (34-b.x)/d, uy = -b.y/d;
  // stand back and to the side of the ball, ready to run up (left of it for a right-footer)
  const L = S.player.foot === "Left" ? -1 : 1;
  p.x = b.x - ux*.95 + L*uy*.55; p.y = b.y - uy*.95 - L*ux*.55; p.vx = p.vy = 0; p.fx = ux; p.fy = uy;
  const {tx, ty} = keeperSpot(); M.gk.x = tx; M.gk.y = ty;
  M.aim = {ang:Math.atan2(uy, ux), power:0, sway:rnd(0, 6.28), swayAng:0};
  M.powMax = M.throwIn ? .64 : 1;     // a full pull is a full throw — the bar means what it shows
  inp.down = false;
  if (M.type === "run" || M.type === "wing" || M.type === "oneonone") flash("Shooting chance!");
  if (passMode()){ const t = M.mates.find(m => m.role === M.call); M.aim.ang = Math.atan2(t.y - b.y, t.x - b.x); p.fx = Math.cos(M.aim.ang); p.fy = Math.sin(M.aim.ang); }
  updateMatchHUD();
}
function aimSwayAmp(){
  const sk = S.skills, ef = energyFactor();
  const acc = passMode() ? (sk.passacc || sk.passing) : sk.accuracy;
  // confidence steadies the aim a touch; a shaky one wobbles it
  const conf = S.traits ? 1.08 - S.traits.conf/100*.16 : 1;
  return (1 - acc/120) * .05 * (M.moving ? 1.5 : 1) * (1.6 - .6*ef) * (S.staff.psych ? .7 : 1)*conf;
}
// full power needs only a short pull: about 130px on a laptop, less on a small phone
function maxPull(){ return Math.max(70*DPR, Math.min(130*DPR, Math.min(cv.width, cv.height)*.26)); }
function updateAim(dt){
  M.phaseT += dt;
  const A_ = M.aim, amp = aimSwayAmp();
  A_.swayAng = amp*Math.sin(M.phaseT*2.3 + A_.sway) + amp*.5*Math.sin(M.phaseT*3.7 + A_.sway*2);
  if (inp.down){
    const px = inp.x-inp.sx, py = inp.y-inp.sy, len = Math.hypot(px,py);
    if (len > 6*DPR){ A_.ang = pullToAngle(px, py); A_.power = Math.min(1, len/maxPull()); }
  }
  if (M.phaseT > M.aimLimit) endMoment("lost", "Took too long over it — closed down.");
}
function releaseAim(){
  const A_ = M.aim;
  if (A_.power < .08){ A_.power = 0; return; }
  M.lock = {ang: A_.ang + A_.swayAng, power: A_.power * (M.powMax || 1)};
  if (M.throwIn) return throwNow();
  M.phase = "contact"; M.phaseT = 0; M.contactLimit = M.moving ? 2.6 : 1e9;
}
// a throw comes out of the hands: there is no contact point to pick, just a little loft and no spin
function throwNow(){
  const jit = (1 - (S.skills.passacc || S.skills.passing)/120)*.055;
  M.lock.ang += gauss()*jit;
  M.contact = {u:0, v:.22, whiff:false};
  M.p.x = M.p.x < 34 ? 1.2 : 66.8;        // he steps back onto the pitch as the ball leaves his hands
  M.kickSpot = {x:M.ball.x, y:M.ball.y};
  M.phase = "kick"; M.kickT = 0;
}

/* ---------- phase: contact (stage 2) ---------- */
function contactGeom(){
  const R = Math.min(cv.width, cv.height)*.3, t = M.phaseT;
  // pops in with a small overshoot
  const e = clamp(t/.28, 0, 1), k = 1 + 2.2*Math.pow(e-1, 3) + 1.2*Math.pow(e-1, 2);
  let x = cv.width/2, y = cv.height*.52;
  if (M.moving){ x += Math.sin(t*2.6)*R*.16; y -= Math.abs(Math.sin(t*4.2))*R*.14; }
  return {x, y, R:R*Math.max(.15, k), k:e, rot: M.moving ? t*6 : .35};
}
function strikeAt(px, py){
  const g = contactGeom(), sk = S.skills, ef = energyFactor();
  let u = (px-g.x)/g.R, v = (py-g.y)/g.R;
  let whiff = Math.hypot(u,v) > 1.08;
  if (whiff){ u = clamp(u,-1.2,1.2); v = clamp(v,-1.2,1.2); flash("Mis-kick!"); }
  const jit = (1 - sk.accuracy/120) * .10 * (M.moving ? 1.7 : 1) * (1.5 - .5*ef);
  u += gauss()*jit; v += gauss()*jit;
  M.contact = {u, v, whiff};
  const ca = Math.cos(M.lock.ang), sa = Math.sin(M.lock.ang), L = S.player.foot === "Left" ? -1 : 1;
  M.kickSpot = {x:M.ball.x - ca*.32 + L*sa*.18, y:M.ball.y - sa*.32 - L*ca*.18};
  M.phase = "kick"; M.kickT = 0;          // wind-up first; the ball leaves the boot at 0.24s
}
function doLaunch(){
  const {u, v, whiff} = M.contact;
  const meta = launchBall(M.ball, M.lock.ang, M.lock.power * (whiff ? .45 : 1), u, v, M.moving);
  const b = M.ball;
  if (M.throwIn){ M.ball.spin = 0; M.ball.knuck = 0; b.z = 2; }     // out of the hands, over the head, no bend
  M.shotCount = (M.shotCount || 0) + (passMode() ? 0 : 1);
  if (!passMode()){ M.myShot = true; M.shotEval = {xg:typeof xgAt === "function" ? xgAt({x:M.ball.x, y:M.ball.y}) : 0}; }
  M.shot = {t:0, dist:Math.hypot(b.x-34, b.y), curl:meta.style === "curl", style:meta.style, fk:M.type === "freekick", pen:M.type === "penalty", power:M.lock.power, x0:b.x, y0:b.y};
  M.phase = "flight"; M.trail = [];
  if (!passMode()) keeperReads();
  updateMatchHUD();
}
function updateContact(dt){
  M.phaseT += dt;
  if (M.phaseT > M.contactLimit){ flash("Rushed it!"); const g = contactGeom(); strikeAt(g.x + gauss()*g.R*.5, g.y + gauss()*g.R*.5); }
}

/* ---------- phase: flight ---------- */
function keeperReads(){
  // he reads the strike, not the spin, then adjusts late
  const g = M.gk, b = M.ball; g.x0 = g.x; g.re = false;
  const pr = predictCross(b, g.y, .25), spd = Math.hypot(b.vx, b.vy, b.vz);
  g.react = .42 - M.opp*.002 + rnd(0, .1);
  g.dive = 3 + M.opp*.02; g.cap = 1.4 + M.opp*.012; g.tPred = pr ? pr.t : 1;
  let tx = pr ? pr.x : g.x; tx += gauss()*(.2 + .012*Math.max(0, spd-18))*(1.3 - M.opp/100);
  if (M.type === "penalty" && Math.random() < .5){ tx = 34 + pick([-2.8, 2.8, 0]); g.react = .05; g.re = true; g.cap = 3; }
  g.tx = clamp(tx, g.x0-g.cap, g.x0+g.cap);
}
function updateFlight(dt){
  const steps = 8, h = dt/steps, b = M.ball, g = M.gk, aero = S.skills.aero;
  if (M.shot) M.shot.t += dt;
  for (let i=0; i<steps; i++){
    const py = b.y; stepBall(b, h, aero);
    if (M.phase === "flight" && passMode() && !M.aiShot){ passChecks(h); continue; }
    if (M.phase === "flight"){
      if (!g.re && M.shot.t > g.tPred*.55){ g.re = true; const pr = predictCross(b, g.y, 1); if (pr) g.tx = clamp(pr.x + gauss()*.15, g.x0-g.cap, g.x0+g.cap); }
      if (g.react > 0) g.react -= h; else { const dx = g.tx-g.x, m = Math.min(Math.abs(dx), g.dive*h); g.x += Math.sign(dx)*m; }
      shotChecks(py);
    }
    if (M.result === "goal"){
      if (b.y < -1.9){ b.y = -1.9; b.vy = 0; b.vx *= .5; }
      b.x = clamp(b.x, GOAL.L+.12, GOAL.R-.12);
      if (b.z > GOAL.H-.12){ b.z = GOAL.H-.12; b.vz = 0; }
    }
  }
  M.trail.push({x:b.x, y:b.y, z:b.z}); if (M.trail.length > 40) M.trail.shift();
}
function shotChecks(py){
  const b = M.ball, g = M.gk, t = M.shot.t;
  for (const d of [...M.defs, ...M.wall]){
    if (d.stun > 0) continue;
    const top = d.wall ? (t < .7 ? 2.15 : 1.85) : 1.85;
    if (Math.hypot(b.x-d.x, b.y-d.y) < .5 && b.z < top){
      return blockedBy(d);
    }
  }
  if (!M.gkDone && py > g.y && b.y <= g.y){
    M.gkDone = true;
    // how far he can actually get a hand to. Tighter than it was: place it away from him and it goes in
    // how far he can get a hand to. He is strong close to himself and falls away quickly past that,
    // so placing a shot away from him beats him whatever the power on it.
    const reach = .64 + M.opp*.003 + (g.react <= 0 && Math.abs(g.x-g.x0) > .3 ? .30 : 0);
    let ps = 1/(1 + Math.exp(-(reach - Math.abs(b.x-g.x))/.22));
    const spd = Math.hypot(b.vx, b.vy);
    if (b.z > 2.45) ps = 0; else if (b.z > 1.8) ps *= .7;
    if (b.z < .35) ps *= .85;                                  // along the ground into the corner is hard to keep out
    ps *= clamp(1.06 - spd/95, .8, 1.02);                      // a fierce strike gives him a little less time
    if (b.knuck) ps *= .8;
    M.shotEval = Object.assign(M.shotEval || {}, {xg:M.shotEval ? M.shotEval.xg : 0, onTarget:Math.abs(b.x - 34) < 3.66 && b.z < GOAL.H, saveQ:1 - ps});
    if (Math.random() < ps) return keeperSaves(ps, spd);
  }
  if (py > 0 && b.y <= 0){
    const r = BR, d = Math.round(M.shot.dist);
    if (b.x > GOAL.L+r && b.x < GOAL.R-r && b.z < GOAL.H-r){
      const how = M.shot.pen ? "Buried from the spot." : {curl:`Curled in from ${d}m.`, dip:`Dipped under the bar from ${d}m.`, knuckle:`A knuckleball from ${d}m — it moved everywhere.`, chip:`Chipped in from ${d}m.`, lofted:`Lifted in from ${d}m.`}[M.shot.style] || `Drilled in from ${d}m.`;
      return endMoment("goal", M.deflected ? `Deflected in off a defender from ${d}m — it counts!` : how);
    }
    if ((Math.abs(b.x-GOAL.L) < .17 || Math.abs(b.x-GOAL.R) < .17) && b.z < GOAL.H + .1) return woodwork("post");
    if (b.x > GOAL.L && b.x < GOAL.R && Math.abs(b.z-GOAL.H) < .17) return woodwork("bar");
    // how far it missed by: a whisker wide is not the same as a shot into the stand
    const wide = Math.max(0, GOAL.L - b.x, b.x - GOAL.R), high = Math.max(0, b.z - GOAL.H), margin = Math.hypot(wide, high);
    M.shotEval = Object.assign(M.shotEval || {}, {margin, onTarget:false});
    const txt = margin < .6 ? (high > wide ? "Just over the bar." : "Inches wide.") : margin < 2.2 ? (high > wide ? "Over the bar." : "Wide of the post.") : margin < 5 ? (high > wide ? "Well over." : "Well wide.") : "Miles off target.";
    return endMoment("miss", txt);
  }
  if (b.x < -1 || b.x > 69 || b.y > 55){ M.shotEval = Object.assign(M.shotEval || {}, {margin:8}); return endMoment("miss", "Way off target."); }
  if (b.vx === 0 && b.vy === 0 && b.z <= BR + .01) return endMoment("saved", "Not enough on it — the keeper gathers.");
  if (M.shot.t > 4.5) return endMoment("miss", "The chance fizzled out.");
}

/* ---------- blocks and saves: not every stopped shot is the end of it ----------
   A block can be cleared, deflected behind for a corner, run loose for a scramble, fall to a
   team-mate — or, now and then, loop in off the defender. A save can be held, parried back out,
   or tipped round the post. */
function blockedBy(d){
  const b = M.ball, setP = M.type === "penalty" || M.type === "freekick";
  b.spin = 0; b.lift = 0; b.knuck = 0;
  M.shotEval = Object.assign(M.shotEval || {}, {blocked:true, margin:0});
  const r = Math.random();
  if (d.wall){
    if (r < .38){ b.vx = rnd(-6, 6); b.vy = -rnd(6, 10); b.vz = rnd(2, 5); return endMoment("corner", "Off the wall and behind — corner."); }
    b.vx = -b.vx*.25 + rnd(-3, 3); b.vy = Math.abs(b.vy)*.35; b.vz = rnd(1, 4);
    return endMoment("blocked", "Straight into the wall.");
  }
  d.stun = 2;
  if (r < .06 && !setP){
    // it loops off him and wrong-foots the keeper
    const tx = M.gk.x > 34 ? GOAL.L + .7 : GOAL.R - .7, dx = tx - b.x, dy = -b.y, L = Math.hypot(dx, dy) || 1, sp = 11;
    b.vx = dx/L*sp; b.vy = dy/L*sp; b.vz = rnd(2.5, 4); M.gkDone = true; M.deflected = true;
    flash("Deflected!"); return;
  }
  if (r < .32){ b.vx = rnd(-7, 7); b.vy = -rnd(5, 9); b.vz = rnd(2, 5); return endMoment("corner", "Deflected behind — corner."); }
  if (r < .52 && !setP){
    b.vx = -b.vx*.2 + rnd(-4, 4); b.vy = Math.abs(b.vy)*.3 + 2; b.vz = rnd(.5, 2);
    M.phase = "rebound"; M.reb = {t:0, gkCd:.5}; M.shooting = false; M.limit = Math.max(M.limit, M.t + 6);
    M.info = "Blocked — it's loose!"; flash("LOOSE BALL!"); updateMatchHUD(); return;
  }
  if (r < .66 && !setP && M.mates && M.mates.length && !M.ai){
    // it cannons off him into a team-mate's path
    let m = null, md = 1e9; for (const t of M.mates){ const q = Math.hypot(t.x - b.x, t.y - b.y); if (q < md){ md = q; m = t; } }
    if (m && md < 16){
      b.x = m.x; b.y = m.y - .5; b.vx = b.vy = b.vz = 0; b.z = BR;
      flash(`Falls to ${m.name}!`);
      M.passTo = null; M.deflectTo = m;
      return beginAiRun(m, true);
    }
  }
  b.vx = -b.vx*.25 + rnd(-3, 3); b.vy = Math.abs(b.vy)*.35; b.vz = rnd(1, 4);
  return endMoment("blocked", pick(["A defender threw himself in the way.", "Blocked — and cleared.", "Charged down."]));
}
function keeperSaves(ps, spd){
  const b = M.ball, g = M.gk, setP = M.type === "penalty" || M.type === "freekick";
  b.spin = 0; b.lift = 0; b.knuck = 0;
  const hard = ps < .55 || spd > 22, high = b.z > 1.55, nearPost = Math.abs(b.x - GOAL.L) < 1 || Math.abs(b.x - GOAL.R) < 1;
  const r = Math.random();
  if ((high || nearPost) && r < .38){
    b.vx = (b.x - g.x)*3; b.vy = -2; b.vz = high ? 4 : 1;
    return endMoment("corner", high ? "Tipped over the bar — corner." : "Pushed round the post — corner.");
  }
  if (hard && !setP && r < .72){
    // parried: it's back out and it's anybody's
    b.vx = b.vx*.3 + (b.x - g.x)*3 + rnd(-2, 2); b.vy = Math.abs(b.vy)*.32 + 3; b.vz = rnd(.5, 2.5);
    b.y = Math.max(b.y, .3);
    M.phase = "rebound"; M.reb = {t:0, gkCd:1.1 + rnd(0, .3)}; M.shooting = false; M.limit = Math.max(M.limit, M.t + 6);
    M.info = "Parried — follow it in!"; flash("PARRIED!"); updateMatchHUD(); return;
  }
  b.vx = b.vx*.25 + (b.x-g.x)*4; b.vy = Math.abs(b.vy)*.3; b.vz = Math.abs(b.vz)*.3 + 1;
  return endMoment("saved", ps < .4 ? pick(["What a save!", "A superb stop from the keeper.", "Full stretch — he gets there."]) : pick(["Good hands from the keeper.", "Keeper gets down well.", "Straight at him."]));
}

/* ---------- the woodwork: the ball comes back off the frame and stays live ----------
   Hitting a post or the bar no longer ends the move. The ball rebounds into play and it's a
   race — you, the keeper and the defenders all go for it. Win it and you're on the ball again. */
function woodwork(kind){
  const b = M.ball;
  // a team-mate's shot off the frame still ends the move — the accounting there is his, not yours
  if (M.aiShot){
    if (kind === "post"){ b.vy = Math.abs(b.vy)*.6; b.vx *= -.4; return endMoment("post", "Inches away — it rattled the post."); }
    b.vy = Math.abs(b.vy)*.5; b.vz = -Math.abs(b.vz)*.3; return endMoment("bar", "Crashed off the crossbar.");
  }
  // a set piece is one attempt and one attempt only. Off the frame from a penalty or a free kick
  // is a miss, the way it is in a real game — the move is dead and the whistle has gone.
  if (M.type === "penalty" || M.type === "freekick"){
    if (kind === "post"){ b.vy = Math.abs(b.vy)*.6; b.vx *= -.4; }
    else { b.vy = Math.abs(b.vy)*.5; b.vz = -Math.abs(b.vz)*.3; }
    b.spin = 0; b.lift = 0; b.knuck = 0;
    if (M.shot) M.shot.frame = kind;
    M.shotEval = Object.assign(M.shotEval || {}, {margin:.1, frame:kind});
    flash(kind === "post" ? "POST!" : "BAR!");
    return endMoment(kind, kind === "post"
      ? (M.type === "penalty" ? "Off the post! The penalty is gone." : "Off the post! So close from the free kick.")
      : (M.type === "penalty" ? "Off the bar! The penalty is gone." : "Off the bar! Over everyone and against the frame."));
  }
  M.woodwork = (M.woodwork || 0) + 1; M.lastFrame = kind;
  M.shotEval = Object.assign(M.shotEval || {}, {margin:.1, frame:kind});
  if (M.shot) M.shot.frame = kind;                 // remembered for the commentary if you score the rebound
  if (kind === "post"){
    const out = b.x < 34 ? -1 : 1;                 // spits back out across the face of goal
    b.vx = out*Math.abs(b.vx)*.5 + out*rnd(1, 4);        // spits back out across the face of goal
    b.vy = Math.abs(b.vy)*.6 + 3.4;
    b.vz = Math.max(-b.vz*.3, .5);
  } else {
    b.vx *= .55;
    b.vy = Math.abs(b.vy)*.55 + 3.8;                      // off the bar and down into the area
    b.vz = -Math.abs(b.vz)*.35 - 1.2;
  }
  b.spin = 0; b.lift = 0; b.knuck = 0;
  b.y = Math.max(b.y, .12);
  // he has just committed to the shot — he needs a moment to get back up before he can claim it
  M.phase = "rebound"; M.reb = {t:0, gkCd: .95 + rnd(0, .35) - M.opp*.0035}; M.shooting = false;
  M.limit = Math.max(M.limit, M.t + 7);
  flash(kind === "post" ? "POST!" : "BAR!");
  M.info = kind === "post" ? "Off the post — still live!" : "Off the bar — still live!";
  if (typeof say === "function" && MT) say(`${S.player.name} smacks the ${kind === "post" ? "post" : "bar"} — and it's still live!`);
  updateMatchHUD();
}
function updateRebound(dt){
  const b = M.ball, p = M.p, g = M.gk, r = M.reb, sk = S.skills;
  M.t += dt; r.t += dt;
  // the ball keeps bouncing and rolling on its own
  const steps = 4, h = dt/steps;
  for (let i=0; i<steps; i++) stepBall(b, h, sk.aero);
  // you go for it: drag or the arrow keys steer, otherwise you run at where it is going
  let tx = null, ty = null;
  if (inp.down){ const w_ = screenToWorld(inp.x, inp.y - (inp.touch ? 78*DPR : 0)); if (w_){ tx = w_.x; ty = w_.y; } }
  const kx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0);
  const ky = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
  if (kx || ky){ const m = Math.hypot(kx, ky); tx = p.x + kx/m*8; ty = p.y + ky/m*8; }
  const mySpd = (5.2 + sk.pace*.036)*(.6 + .4*energyFactor())*(S.items.grip ? 1.03 : 1)*1.12;
  if (tx === null){ const ic = interceptOn(ballPath(), p, mySpd, .05); tx = ic ? ic.x : b.x; ty = ic ? ic.y : b.y; }
  runTo(p, tx, ty, mySpd, dt);
  // the keeper scrambles for it too, once he is back on his feet, and so do the defenders
  r.gkCd -= dt;
  const gd = Math.hypot(b.x-g.x, b.y-g.y);
  if (r.gkCd <= 0 && gd < 9 && gd > .01){ const gs = (3.4 + M.opp*.022)*dt, m = Math.min(gd, gs); g.x += (b.x-g.x)/gd*m; g.y += (b.y-g.y)/gd*m; }
  for (const d of M.defs){
    if (d.stun > 0){ d.stun -= dt; continue; }
    const ic = interceptOn(ballPath(), d, d.spd, .22, 2.1);
    runTo(d, ic ? ic.x : b.x, ic ? ic.y : b.y, d.spd, dt);
  }
  // first to it wins it — you need it near the ground to take it
  const low = b.z < 1.9;
  if (low && Math.hypot(b.x-p.x, b.y-p.y) < .85 && r.t > .12){
    M.phase = "dribble"; M.shooting = false; M.control = true; M.touchCd = .12; M.wob = 0;
    b.vx *= .18; b.vy *= .18; b.vz = 0; b.z = BR;
    M.reb = null; M.gkDone = false;
    M.info = "";
    flash("Follow it in!");
    updateMatchHUD();
    return;
  }
  if (low && r.gkCd <= 0 && Math.hypot(b.x-g.x, b.y-g.y) < .85) return endMoment("saved", "The keeper pounces on the rebound.");
  for (const d of M.defs) if (d.stun <= 0 && b.z < 1.9 && Math.hypot(b.x-d.x, b.y-d.y) < .75)
    return endMoment("lost", "Hacked clear off the rebound.");
  if (b.y <= 0) return endMoment("miss", "Behind for a corner off the rebound.");
  if (b.x < 0 || b.x > 68 || b.y > 48) return endMoment("miss", "The rebound runs out of play.");
  if (r.t > 4.5) return endMoment("miss", "The rebound is cleared.");
}

/* ---------- passing ---------- */

/* ============ READING THE GAME ============
   Players work out where the ball is going and whether they can get there, instead of
   running at wherever it happens to be right now. */
function predictPath(tMax){
  const b = M.ball;
  const c = {x:b.x, y:b.y, z:b.z, vx:b.vx, vy:b.vy, vz:b.vz, spin:b.spin, lift:b.lift, knuck:0, kt:0, kw:0, kph:0};
  const out = [], h = .06;
  for (let t = 0; t < tMax; t += h){ out.push({t, x:c.x, y:c.y, z:c.z}); stepBall(c, h, S.skills.aero); }
  return out;
}
function ballPath(){                                    // one prediction per frame, not per physics step
  const now = (M.shot && M.phase !== "rebound") ? M.shot.t : M.t;   // the shot clock stops once the ball comes back off the frame
  if (!M.path || Math.abs(now - M.pathT) > .07){ M.path = predictPath(2.6); M.pathT = now; }
  return M.path;
}
// how much of a man is in the way at a given height: all of him at shin height, none of him above his head
function reachAt(z){ const f = clamp((1.95 - z)/.95, 0, 1); return f*f; }
// the first point on the ball's path this player can actually get to and actually play
function interceptOn(path, o, spd, react, maxZ, maxMove){
  const r = react == null ? .14 : react, top = maxZ == null ? 2.1 : maxZ;
  for (const s of path){
    if (s.z > top) continue;                            // still above what he can reach
    if (s.x < -1 || s.x > 69 || s.y < -1 || s.y > 51) break;
    const d = Math.hypot(s.x - o.x, s.y - o.y);
    if (maxMove != null && d > maxMove) continue;       // too far across to be his ball
    if (d <= Math.max(0, s.t - r)*spd + .45) return s;
  }
  return null;
}
function runTo(o, x, y, spd, h){
  const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
  if (d < .04) return;
  const s = Math.min(d, spd*h);
  o.x = clamp(o.x + dx/d*s, .6, 67.4); o.y = clamp(o.y + dy/d*s, .6, 47);
}
function mateSpeed(m){ const p = W.players[m.pid]; return 5.6 + (p ? p.ovr : 60)*.018; }
// how dangerous a position is: near goal, central, and not crowded
function spotValue(o){
  const dGoal = Math.hypot(o.x - 34, o.y);
  const central = 1 - Math.min(1, Math.abs(o.x - 34)/26);
  let press = 0;
  for (const d of M.defs){ if (d.stun > 0) continue; const q = Math.hypot(d.x - o.x, d.y - o.y); if (q < 6.5) press += (6.5 - q)/6.5; }
  return clamp(1.3 - dGoal/38, 0, 1)*.58 + central*.24 - Math.min(.7, press*.23);
}
// a team-mate with no chance of the ball still has a job: get free, stay spread, offer an angle
function supportRun(m, h, ballAt){
  const bx = ballAt ? ballAt.x : M.ball.x, by = ballAt ? ballAt.y : M.ball.y;
  const wide = {LW:12, RW:56, CAM:34, ST:34}[m.role];
  let tx = wide == null ? m.x : wide*.55 + (bx + (m.x - bx)*.6)*.45;
  let ty = m.role === "ST" ? Math.max(4.5, by - 7) : m.role === "CAM" ? by - 1.5 : Math.max(6, by - 3.5);
  let ax = 0, ay = 0;                                    // pull away from whoever is marking him
  for (const d of M.defs){
    if (d.stun > 0) continue;
    const dx = m.x - d.x, dy = m.y - d.y, q = Math.hypot(dx, dy);
    if (q < 5 && q > .01){ const w = (5 - q)/5; ax += dx/q*w; ay += dy/q*w; }
  }
  runTo(m, clamp(tx + ax*4, 3, 65), clamp(ty + ay*3, 3, 46), mateSpeed(m)*.62, h);
}
// contain: get between the ball and your goal and hold him up — no diving in from miles away
// a defender who hasn't read the pass doesn't stand in its corridor — only the man going for it does
function offLane(tx, ty, from, to, keep){
  const vx = to.x - from.x, vy = to.y - from.y, L = Math.hypot(vx, vy);
  if (L < .6) return {x:tx, y:ty};
  const ux = vx/L, uy = vy/L;
  const along = (tx - from.x)*ux + (ty - from.y)*uy;
  if (along < -.5 || along > L + 3) return {x:tx, y:ty};
  const px = from.x + ux*along, py = from.y + uy*along;
  let ox = tx - px, oy = ty - py;
  const off = Math.hypot(ox, oy), need = keep || 1.4;
  if (off >= need) return {x:tx, y:ty};
  if (off < .05){ ox = -uy; oy = ux; }
  else { ox /= off; oy /= off; }
  return {x:px + ox*need, y:py + oy*need};
}
// stay with your man, goal-side of him — not wherever the ball happens to be
function coverRun(d, man, h, mul, stand, lane){
  const st = stand || 1.9;
  const gx = 34 - man.x, gy = -man.y, gl = Math.hypot(gx, gy) || 1;
  let tx = clamp(man.x + gx/gl*st, 2, 66), ty = clamp(Math.max(1.6, man.y + gy/gl*st), 1.6, 46);
  if (lane){ const o = offLane(tx, ty, lane.from, lane.to, 1.5); tx = clamp(o.x, 2, 66); ty = clamp(o.y, 1.6, 46); }
  runTo(d, tx, ty, d.spd*(mul || .78), h);
}
// hand every defender a man to mark, nearest first
function markUp(defs, runners){
  const pairs = [], taken = new Set();
  const list = [];
  for (const d of defs){ for (const r of runners) list.push({d, r, q:Math.hypot(d.x - r.x, d.y - r.y)}); }
  list.sort((a, b) => a.q - b.q);
  const done = new Set();
  for (const e of list){
    if (done.has(e.d) || taken.has(e.r)) continue;
    done.add(e.d); taken.add(e.r); pairs.push(e);
  }
  for (const d of defs) if (!done.has(d)) pairs.push({d, r:null});
  return pairs;
}
function containRun(d, ball, h, tight){
  const gx = 34, gy = 0;
  const vx = gx - ball.x, vy = gy - ball.y, vl = Math.hypot(vx, vy) || 1;
  const stand = tight ? 2.0 : 3.4;                       // how close he gets before jockeying
  const tx = ball.x + vx/vl*stand, ty = ball.y + vy/vl*stand;
  const dx = tx - d.x, dy = ty - d.y, gap = Math.hypot(dx, dy);
  const ease = gap < 1.4 ? .35 : gap < 3 ? .72 : 1;      // slow down as he arrives, then jockey
  runTo(d, tx, ty, d.spd*ease*.92, h);
}
function passChecks(h){
  const b = M.ball, t = M.shot.t, sp = Math.hypot(b.vx, b.vy);
  // a corner can beat everyone and curl straight in, and the keeper can come and claim it
  if (M.corner || M.cross){
    const g = M.gk;
    if (b.y <= 0 && t > .1){
      const r = BR;
      if (b.x > GOAL.L + r && b.x < GOAL.R - r && b.z < GOAL.H - r)
        return endMoment("goal", M.cross ? "The cross beats everyone and drops in!" : "Straight in from the corner — nobody got a touch!");
      if ((Math.abs(b.x - GOAL.L) < .17 || Math.abs(b.x - GOAL.R) < .17) && b.z < GOAL.H + .1) return woodwork("post");
      if (b.x > GOAL.L && b.x < GOAL.R && Math.abs(b.z - GOAL.H) < .17) return woodwork("bar");
      return endMoment("outplay", M.cross ? "The cross sails out for a goal kick." : "The corner sails behind for a goal kick.");
    }
    if (t > .15 && b.z < 2.7 && Math.hypot(b.x - g.x, b.y - g.y) < 1.25)
      return endMoment("lost", pick(["The keeper comes and claims it.", "Punched clear by the keeper.", "Gathered by the goalkeeper."]));
  }
  if (!M.defHome) M.defHome = M.defs.map(d => ({x:d.x, y:d.y}));   // where each defender was when it was played
  const path = ballPath();
  // who can win the race to this ball, and where
  let first = null;
  for (const m of M.mates){
    m.ic = interceptOn(path, m, mateSpeed(m));
    if (m.ic && (!first || m.ic.t < first.ic.t)) first = m;
  }
  let dFirst = null;
  for (const d of M.defs){
    const ic = d.stun > 0 ? null : interceptOn(path, d, d.spd, .2, 1.35, 2.6);  // reads it late, only at a height he can take, and only near him
    if (!ic){ d.ic = null; continue; }
    // he picks his spot once and goes — he can't keep re-reading the flight and home in on it
    if (!d.lock){
      if (!d.err){ const a = rnd(0, 6.283); d.err = {x:Math.cos(a), y:Math.sin(a)}; }
      // stepping up the lane to meet it is easy; it's getting ACROSS that he misjudges
      const bs = Math.hypot(b.vx, b.vy) || 1, ux = b.vx/bs, uy = b.vy/bs;
      const wx = ic.x - d.x, wy = ic.y - d.y, along = wx*ux + wy*uy;
      const across = Math.hypot(wx - ux*along, wy - uy*along);
      const miss = clamp(across*.95, 0, 2.4)*clamp(1.3 - M.opp/130, .35, 1.15);
      d.lock = {x:ic.x + d.err.x*miss, y:ic.y + d.err.y*miss};
    }
    d.ic = {x:d.lock.x, y:d.lock.y, t:ic.t, z:ic.z};
    if (!dFirst || d.ic.t < dFirst.ic.t) dFirst = d;
  }
  // the team-mate who can get there goes for it — through ball or loose ball, he makes the run
  for (const m of M.mates){
    if (m === first && m.ic) runTo(m, m.ic.x, m.ic.y, mateSpeed(m), h);
    else supportRun(m, h, first && first.ic ? first.ic : b);
  }
  // one defender goes for the interception, and only if he genuinely beats the receiver to it
  const goFor = dFirst && dFirst.ic && (!first || dFirst.ic.t < first.ic.t - .05);
  const marks = markUp(M.defs.filter(d => d.stun <= 0 && !(d === dFirst && goFor)), M.mates.concat([M.p]));
  for (const d of M.defs) if (d.stun > 0) d.stun -= h;
  if (dFirst && goFor) runTo(dFirst, dFirst.ic.x, dFirst.ic.y, dFirst.spd, h);
  for (const e of marks){
    // he marks his man, but he doesn't step out of the way of the ball either — if he's in the lane, he's in the lane
    if (e.r) coverRun(e.d, e.r, h, .8);
    else containRun(e.d, first && first.ic ? first.ic : b, h, false);
  }
  if (b.z > 1.95) return;                                  // clean over his head — you've lobbed him
  const near = (arr, r) => arr.find(o => Math.hypot(b.x - o.x, b.y - o.y) < r);
  // the higher the ball, the less of him is in the way, and it drops away fast above the knee
  const hf = reachAt(b.z);
  // a ball that pulls up short isn't dead — it's a loose ball, and the first man there wins it
  if (sp < .5 && b.z <= BR + .02) M.loose = true;
  // his body is simply in the way or it isn't — whether he had to run to get there is already decided by his read
  const def = M.defs.find(d => d.stun <= 0 && Math.hypot(b.x - d.x, b.y - d.y) < (M.loose ? .85 : .52*hf));
  const mate = near(M.mates, M.loose ? 1.3 : 1.55);
  const passLen = Math.hypot(b.x - M.shot.x0, b.y - M.shot.y0);
  if (def && t > .08) return endMoment("intercepted", M.loose ? "It pulls up short and they get there first." : pick(["Cut out by the defender.","Read it — intercepted.","Too close to the marker."]));
  if (mate){ M.passTo = mate; M.passLen = passLen; b.vx *= .15; b.vy *= .15; b.vz = 0; b.spin = 0; b.lift = 0; return beginAiRun(mate, M.loose); }
  if (b.x < 0 || b.x > 68 || b.y < 0 || b.y > 50) return endMoment("outplay", "Overhit — it runs out of play.");
  if (t > (M.loose ? 5.5 : 4)) endMoment("outplay", "Nobody read that pass — it runs away to nothing.");
}

/* ---------- after the pass: your team-mate carries it and picks his moment ----------
   He drives at goal, swerves around the nearest defender, and shoots when the lane is clear,
   when he's close enough, or when he's about to be closed down. */
function beginAiRun(mate, slow){
  const p = W.players[mate.pid], ovr = p ? p.ovr : 60;
  if (M.passLen != null && !M.passDone) M.passDone = {role:mate.role, name:mate.name, pid:mate.pid, len:M.passLen};
  M.ai = {mate, ovr, t:0, p:{x:mate.x, y:mate.y, vx:0, vy:0, fx:0, fy:-1}, touch:0, shot:false, slow:!!slow};
  M.phase = "ai"; M.limit = 9;
  flash("Good ball!");
  return true;
}
function laneClear(from, aim){
  // nobody standing in the corridor between the ball and where he'd shoot
  for (const d of M.defs){
    if (d.stun > 0) continue;
    const vx = aim.x - from.x, vy = aim.y - from.y, L2 = vx*vx + vy*vy || 1;
    const t = clamp(((d.x - from.x)*vx + (d.y - from.y)*vy)/L2, 0, 1);
    if (Math.hypot(from.x + vx*t - d.x, from.y + vy*t - d.y) < 1.5) return false;
  }
  return true;
}
function aiShoot(aim, power){
  const b = M.ball, a = M.ai, acc = clamp(a.ovr/100, .3, .95);
  const ang = Math.atan2(aim.y - b.y, aim.x - b.x) + gauss()*(1 - acc)*.11;
  const dist = Math.hypot(b.x - 34, b.y);
  const spd = (17 + a.ovr*.2)*clamp(power, .6, 1);
  const elev = clamp(.05 + Math.max(0, dist - 9)*.006 + rnd(-.02, .05), 0, .35);
  b.vx = Math.cos(ang)*spd*Math.cos(elev); b.vy = Math.sin(ang)*spd*Math.cos(elev); b.vz = spd*Math.sin(elev); b.z = BR + .01;
  b.spin = gauss()*.06*(a.ovr/100); b.lift = 0; b.knuck = 0;
  M.shot = {t:0, dist, curl:false, style:"driven", fk:false, pen:false, power, ai:true, x0:b.x, y0:b.y};
  M.aiShot = true; M.phase = "flight"; M.trail = [];
  keeperReads();
}
/* ---------- you, while a team-mate has it: make a run ----------
   Drag to steer your run, or he makes a sensible one on his own. */
function updateSupportRun(dt, meetBall){
  const p = M.p, b = M.ball;
  let tx = null, ty = null;
  if (inp.down){ const w_ = screenToWorld(inp.x, inp.y - (inp.touch ? 78*DPR : 0)); if (w_){ tx = w_.x; ty = w_.y; } }
  const kx = (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0);
  const ky = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
  if (kx || ky){ const m = Math.hypot(kx, ky); tx = p.x + kx/m*8; ty = p.y + ky/m*8; }
  if (tx === null && meetBall){                           // it's coming to you — go and meet it
    const ic = interceptOn(ballPath(), p, 5.5 + S.skills.pace*.036, .05);
    tx = ic ? ic.x : b.x; ty = ic ? ic.y : b.y;
  }
  if (tx === null){                                       // no input: hold a run into space ahead of the man on the ball
    const c = M.ai ? M.ai.p : b;
    if (!p.sup || p.supT == null || M.t - p.supT > .7){
      p.supT = M.t;
      const side = p.x < c.x ? -1 : 1;
      let sx = clamp(c.x + side*rnd(6.5, 9.5), 5, 63), sy = clamp(Math.max(4, c.y - rnd(4, 8)), 3.5, 44);
      for (const d of M.defs){ if (d.stun > 0) continue; if (Math.hypot(d.x - sx, d.y - sy) < 4){ sx = clamp(sx + (sx - d.x)*.6, 5, 63); sy = clamp(Math.max(3.5, sy - 1.5), 3.5, 44); } }
      p.sup = {x:sx, y:sy};
    }
    tx = p.sup.x; ty = p.sup.y;
  }
  const base = (5.2 + S.skills.pace*.036)*(.62 + .38*energyFactor());
  const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy);
  const want = dl > .4 ? Math.min(1, dl/5) : 0;
  const k = Math.min(1, dt*8);
  p.vx += ((want ? dx/dl*base*want : 0) - p.vx)*k;
  p.vy += ((want ? dy/dl*base*want : 0) - p.vy)*k;
  p.x = clamp(p.x + p.vx*dt, .6, 67.4); p.y = clamp(p.y + p.vy*dt, .6, 46);
  const pv = Math.hypot(p.vx, p.vy); if (pv > .4){ p.fx = p.vx/pv; p.fy = p.vy/pv; }
  if (pv > 2.5) M.sprintT += dt*.5;
}
/* ---------- defending against the carrier: one contains, the rest cover ---------- */
function aiDefend(dt, carrier){
  const b = M.ball;
  let presser = null, pd = 1e9;
  for (const d of M.defs){
    if (d.stun > 0){ d.stun -= dt; continue; }
    const q = Math.hypot(d.x - b.x, d.y - b.y);
    if (q < pd){ pd = q; presser = d; }
  }
  const runners = M.mates.filter(m => m !== (M.ai && M.ai.mate)).concat([M.p]);
  for (const d of M.defs){
    if (d.stun > 0) continue;
    if (d === presser){
      containRun(d, {x:b.x + carrier.vx*.25, y:b.y + carrier.vy*.25}, dt, true);
      d.aiCd = (d.aiCd || 0) - dt;
      const gap = Math.hypot(d.x - b.x, d.y - b.y);
      // he only commits when he is genuinely on top of it and set
      if (gap < .95 && M.ai.t > .4 && d.aiCd <= 0){
        d.aiCd = 1.2;
        if (Math.random() < clamp(.38 + (M.opp - M.ai.ovr)*.012, .1, .8)) return endMoment("aiLost", `${M.ai.mate.name} is robbed after your pass.`);
        d.stun = 1.1; flash(`${M.ai.mate.name} skips past him!`);
      }
      continue;
    }
  }
  const marks = markUp(M.defs.filter(d => d.stun <= 0 && d !== presser), runners);
  for (const e of marks){
    if (e.r && Math.hypot(e.d.x - e.r.x, e.d.y - e.r.y) < 18) coverRun(e.d, e.r, dt, .8);
    else {
      const ty = clamp(b.y*.55 + 3, 2.5, 44), tx = clamp(34 + (e.d.x - 34)*.7 + (b.x - 34)*.25, 3, 65);
      runTo(e.d, tx, ty, e.d.spd*.55, dt);
    }
  }
}
/* ---------- the carrier's options ---------- */
function laneOpen(from, to, width){
  const w = width || 1.35;
  for (const d of M.defs){
    if (d.stun > 0) continue;
    const vx = to.x - from.x, vy = to.y - from.y, L2 = vx*vx + vy*vy || 1;
    const t = clamp(((d.x - from.x)*vx + (d.y - from.y)*vy)/L2, 0, 1);
    if (t <= 0.02) continue;
    if (Math.hypot(from.x + vx*t - d.x, from.y + vy*t - d.y) < w) return false;
  }
  return true;
}
function aiPassTo(to, isPlayer){
  const a = M.ai, b = M.ball;
  const lead = isPlayer ? .32 : .3;
  const tx = clamp(to.x + (to.vx || 0)*lead, 2, 66), ty = clamp(to.y + (to.vy || 0)*lead, 2, 46);
  const dist = Math.hypot(tx - b.x, ty - b.y);
  const acc = clamp(a.ovr/100, .35, .95);
  const ang = Math.atan2(ty - b.y, tx - b.x) + gauss()*(1 - acc)*.085;
  const spd = clamp(6.5 + dist*1.35, 8, 27);
  b.vx = Math.cos(ang)*spd; b.vy = Math.sin(ang)*spd; b.vz = 0; b.z = BR; b.spin = 0; b.lift = 0;
  M.aiPass = {to, isPlayer, t:0};
  M.phase = "aipass";
  flash(isPlayer ? "Back to you!" : `${a.mate.name} plays it on`);
}
function updateAiPass(dt){
  const ap = M.aiPass, b = M.ball;
  ap.t += dt; M.t += dt;
  const steps = Math.max(1, Math.ceil(dt/.008));
  for (let i = 0; i < steps; i++) stepBall(b, dt/steps, S.skills.aero);
  const path = ballPath();
  // the intended man goes to meet it; everyone else keeps playing
  if (ap.isPlayer) updateSupportRun(dt, true);
  else { const ic = interceptOn(path, ap.to, mateSpeed(ap.to)); if (ic) runTo(ap.to, ic.x, ic.y, mateSpeed(ap.to), dt); }
  for (const m of M.mates){ if (m === ap.to) continue; supportRun(m, dt, b); }
  if (M.ai && M.ai.mate !== ap.to && M.ai.mate !== undefined) supportRun(M.ai.mate, dt, b);
  let dFirst = null;
  for (const d of M.defs){
    if (d.stun > 0){ d.stun -= dt; d.ic = null; continue; }
    d.ic = interceptOn(path, d, d.spd, .18, 1.35);
    if (d.ic && (!dFirst || d.ic.t < dFirst.ic.t)) dFirst = d;
  }
  const recv = ap.isPlayer ? M.p : ap.to;
  const recvIc = interceptOn(path, recv, ap.isPlayer ? 5.5 + S.skills.pace*.036 : mateSpeed(recv));
  for (const d of M.defs){
    if (d.stun > 0) continue;
    if (d === dFirst && d.ic && (!recvIc || d.ic.t < recvIc.t - .05)) runTo(d, d.ic.x, d.ic.y, d.spd, dt);
    else containRun(d, recvIc || b, dt, false);
  }
  moveKeeper(dt);
  // cut out?
  if (b.z <= 1.95){
    const hf = reachAt(b.z);
    for (const d of M.defs){
      if (d.stun > 0) continue;
      if (Math.hypot(b.x - d.x, b.y - d.y) < .5*hf && ap.t > .06) return endMoment("aiLost", "Their pass is cut out.");
    }
  }
  // arrived?
  if (Math.hypot(b.x - recv.x, b.y - recv.y) < 1.5 && ap.t > .08){
    b.vx *= .12; b.vy *= .12; b.vz = 0;
    if (ap.isPlayer){
      M.gaveBack = {name:M.ai.mate.name, role:M.ai.mate.role};
      M.ai = null; M.aiPass = null;
      M.phase = "dribble"; M.control = true; M.touchCd = .1; M.wob = 0; M.shooting = false;
      b.x = M.p.x + M.p.fx*.5; b.y = M.p.y + M.p.fy*.5;
      M.limit = Math.max(M.limit, M.t + 9);
      flash("Your ball!");
      return;
    }
    M.aiPass = null;
    return beginAiRun(ap.to);
  }
  if (b.x < 0 || b.x > 68 || b.y < 0 || b.y > 50) return endMoment("aiLost", "The pass runs out of play.");
  if (ap.t > 3) return endMoment("aiLost", "Nobody got on the end of it.");
}
function updateAi(dt){
  const a = M.ai, p = a.p, b = M.ball, sk = a.ovr;
  a.t += dt; M.t += dt;
  a.think = (a.think || 0) - dt;
  // how boxed in is he, and where is the pressure coming from
  let near = null, nd = 1e9, rx = 0, ry = 0;
  for (const d of M.defs){
    if (d.stun > 0) continue;
    const ddx = p.x - d.x, ddy = p.y - d.y, dd = Math.hypot(ddx, ddy);
    if (dd < nd){ nd = dd; near = d; }
    if (dd < 6.5 && dd > .01){ const push = (6.5 - dd)/6.5; rx += ddx/dd*push; ry += ddy/dd*push; }
  }
  let tx = 34 + clamp((p.x - 34)*.25, -6, 6) + rx*5, ty = Math.max(3.5, 5.5 + ry*4);
  tx = clamp(tx, 4, 64);
  const spd = (4.6 + sk*.035)*(a.slow ? .85 : 1);
  const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, dt*7);
  p.vx += (dx/dl*spd - p.vx)*k; p.vy += (dy/dl*spd - p.vy)*k;
  p.x = clamp(p.x + p.vx*dt, .6, 67.4); p.y = clamp(p.y + p.vy*dt, .6, 46);
  const pv = Math.hypot(p.vx, p.vy); if (pv > .4){ p.fx = p.vx/pv; p.fy = p.vy/pv; }
  a.mate.x = p.x; a.mate.y = p.y;
  b.x = p.x + p.fx*.5; b.y = p.y + p.fy*.5; b.z = BR; b.vx = b.vy = b.vz = 0; b.spin = 0; b.lift = 0;
  updateSupportRun(dt);
  if (aiDefend(dt, p) === false || M.phase !== "ai") return;
  moveKeeper(dt);
  const g = M.gk;
  if (Math.hypot(g.x - b.x, g.y - b.y) < 1.0) return endMoment("aiLost", `The keeper beats ${a.mate.name} to it.`);
  // ---- decide what to do with it, a few times a second
  if (a.think <= 0){
    a.think = .16;
    const side = g.x > 34 ? -1 : 1, aim = {x:34 + side*rnd(1.9, 3.0), y:0};
    const dist = Math.hypot(p.x - 34, p.y), clear = laneOpen(p, aim, 1.5), pressed = nd < 2.2;
    const iq = clamp(sk/100, .35, .95);                       // better players see more
    // shoot?
    if (a.t > .25 && ((clear && dist < 15) || dist < 9.5 || (pressed && dist < 19) || a.t > 5)){
      const power = clamp(.6 + dist/36, .6, 1);
      return aiShoot(clear || dist < 10 ? aim : {x:34 + side*rnd(1.4, 2.8), y:0}, power);
    }
    // pass? compare what he has with what the others have
    const mine = spotValue(p) - (pressed ? .3 : 0) - (nd < 4 ? .12 : 0);
    let best = null, bestV = -9;
    const consider = (o, isPlayer) => {
      if (Math.hypot(o.x - p.x, o.y - p.y) < 3.5) return;
      if (!laneOpen(p, o, 1.25)) return;
      let v = spotValue(o);
      if (isPlayer) v += .1;                                   // your run is the one he most wants to find
      v -= Math.max(0, (Math.hypot(o.x - p.x, o.y - p.y) - 18))*.02;
      v += gauss()*(1 - iq)*.22;                               // weaker players misread it
      if (v > bestV){ bestV = v; best = {o, isPlayer}; }
    };
    consider(M.p, true);
    for (const m of M.mates) if (m !== a.mate) consider(m, false);
    const need = pressed ? .02 : .16;                          // under pressure he lets it go sooner
    if (best && bestV > mine + need && a.t > .3) return aiPassTo(best.o, best.isPlayer);
  }
  if (p.y < 1.2 || M.t > M.limit) return endMoment("aiLost", `${a.mate.name} runs it into a dead end.`);
}

/* ---------- loop ---------- */
function update(dt){
  if (!M) return;
  if (M.flash){ M.flash.life -= dt; if (M.flash.life <= 0) M.flash = null; }
  switch (M.phase){
    case "dribble": updateDribble(dt); break;
    case "decide": updateDecide(dt); break;
    case "ai": updateAi(dt); break;
    case "aipass": updateAiPass(dt); break;
    case "rebound": updateRebound(dt); break;
    case "jockey": updateJockey(dt); break;
    case "steal": updateSteal(dt); break;
    case "read": updateRead(dt); break;
    case "aerial": updateAerial(dt); break;
    case "aim": updateAim(dt); break;
    case "contact": updateContact(dt); break;
    case "kick": M.kickT += dt; if (M.kickT >= .24) doLaunch(); break;
    case "flight": M.kickT += dt; updateFlight(dt); break;
    case "done": if (M.kickT != null) M.kickT += dt; if (M.shot) updateFlight(dt); M.endT -= dt; if (M.endT <= 0) momentOver(); break;
  }
}
function loop(now){
  if (!loopOn) return;
  if (!MT && !REP){ loopOn = false; return; }        // nothing to run outside a match
  const dt = Math.min(1/30, (now-lastT)/1000); lastT = now;
  try{
    if (M){ updateChant(dt); update(dt); recFrame(); draw(dt); watchFps(dt); }
    else if (REP){ stepReplay(dt); draw(dt); }
    else if (MT){                                    // between chances the crowd still sings
      const had = !!CHANT; updateChant(dt);
      if (CHANT || had || NEED_DRAW){ NEED_DRAW = false; draw(dt); }
    }
    else if (NEED_DRAW){ NEED_DRAW = false; draw(dt); }
  }catch(err){ console.error(err); }
  requestAnimationFrame(loop);
}

/* ---------- input ---------- */
function onDown(e){
  if (!M) return;
  const p = toCanvas(e);
  if (M.phase === "contact"){ strikeAt(p.x, p.y); return; }
  if (M.phase === "steal" || M.phase === "aerial"){
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    inp.down = true; inp.id = e.pointerId; inp.sx = inp.x = p.x; inp.sy = inp.y = p.y;
    return;
  }
  if (M.phase !== "dribble" && M.phase !== "aim") return;
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  inp.down = true; inp.id = e.pointerId; inp.touch = e.pointerType === "touch"; inp.sx = inp.x = p.x; inp.sy = inp.y = p.y;
}
function onMove(e){
  if (!cv) return; const p = toCanvas(e);
  inp.hx = p.x; inp.hy = p.y;
  if (inp.down && e.pointerId === inp.id){ inp.x = p.x; inp.y = p.y; }
}
function onUp(e){
  if (!inp.down || e.pointerId !== inp.id) return;
  inp.down = false;
  if (!M) return;
  if (M.phase === "aim") return releaseAim();
  if (M.phase === "steal") return challenge(inp.sx, inp.sy, inp.x, inp.y);
  if (M.phase === "aerial") return releaseJump();
}
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase(); keys[k] = true;
  if (!MT) return;
  if (["arrowup","arrowdown","arrowleft","arrowright"," ","s","d"].includes(k)) e.preventDefault();
  if ((k === " " || k === "d") && M && M.phase === "aerial"){ if (!M.jumped) M.charge = Math.min(1, M.charge + .34); releaseJump(); return; }
  if (M && M.phase === "decide" && /^[1-4]$/.test(k)){ chooseOption(+k - 1); return; }
  if (k === " " || k === "d") shootNow();        // D or Space: shoot (or, lining up a pass, shoot instead)
  if (k === "s") passNow();                       // S: your options
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; inp.down = false; });

// Auto graphics: if moments run below ~25 fps for a few seconds, drop to Low quality once
const FPSW = {n:0, sum:0};
function watchFps(dt){
  if (GFX.mode !== "auto" || GFX.low) return;
  FPSW.n++; FPSW.sum += dt;
  if (FPSW.n >= 120){ const avg = FPSW.sum/FPSW.n; FPSW.n = 0; FPSW.sum = 0;
    if (avg > .04){ GFX.autoLow = true; gfxApply(); toast("Switched to low graphics for smoother play (Menu → Graphics).", "gold"); } }
}
