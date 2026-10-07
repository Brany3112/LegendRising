"use strict";
/* ============ DEFENDING: the tackle, the interception, the header ============
   Three moments where the ball is not yours yet. The tackle is two stages — hold him up, then
   take it off him. The interception is a read. The header is a jump you have to time and charge. */

/* ---------- setting them up ---------- */
// the man on the ball comes at you; your own goal is behind you
function startTackle(kind){
  const p = M.p, opp = M.opp;
  M.defend = kind;                                 // "tackle" | "last" | "shepherd"
  p.x = 34 + rnd(-9, 9); p.y = 14 + rnd(0, 6);     // you, between him and the goal you are defending
  p.vx = p.vy = 0;
  M.att = {
    x:p.x + rnd(-4, 4), y:p.y + rnd(9, 13),        // him, running at you
    vx:0, vy:0,
    pace:3.9 + opp*.028,
    feint:0, feintT:rnd(.5, 1.1), dir:Math.random() < .5 ? -1 : 1,
    tell:0, heavy:0, gone:false, name:MT.roleNames ? "" : ""
  };
  M.ball.x = M.att.x; M.ball.y = M.att.y - .5; M.ball.z = BR;
  M.press = 0; M.window = 0; M.jockT = 0;
  M.mates = []; M.defs = [];
  M.isPass = false; M.shooting = false;
  M.phase = "jockey"; M.phaseT = 0;
  M.limit = 14;
  M.info = kind === "last" ? "Last man — he cannot get past you"
    : kind === "shepherd" ? "Force him wide and keep him there"
    : "Stay in front of him";
  inp.down = false;
  updateMatchHUD();
}
// a pass is coming across you and you have to decide whether you can reach it
function startIntercept(){
  const p = M.p;
  const fromX = rnd(6, 62), fromY = 26 + rnd(0, 8);
  const toX = 68 - fromX + rnd(-6, 6), toY = 12 + rnd(0, 6);
  p.x = (fromX + toX)/2 + rnd(-7, 7); p.y = (fromY + toY)/2 + rnd(-2, 4);
  p.vx = p.vy = 0;
  const d = Math.hypot(toX - fromX, toY - fromY), spd = clamp(9 + d*.55, 9, 24);
  M.ball.x = fromX; M.ball.y = fromY; M.ball.z = BR;
  M.ball.vx = (toX - fromX)/d*spd; M.ball.vy = (toY - fromY)/d*spd; M.ball.vz = 0;
  M.lane = {toX, toY};
  M.recv = {x:toX, y:toY};
  M.phase = "read"; M.phaseT = 0; M.limit = 8;
  M.isPass = false; M.shooting = false;
  M.mates = []; M.defs = [];
  M.info = "Read it — get across the lane";
  inp.down = false;
  updateMatchHUD();
}
// a ball dropping between the two of you
function startAerial(){
  const p = M.p, att = M.opp;
  const atk = S.player.pos === "DF" || S.player.pos === "CM";   // defending your own box, or attacking theirs
  p.x = 34 + rnd(-7, 7); p.y = atk ? 9 + rnd(0, 5) : 8 + rnd(0, 5);
  p.vx = p.vy = 0;
  M.rival = {x:p.x + rnd(-1.6, 1.6), y:p.y + rnd(-1.2, 1.2), jump:.80 + att*.0045, t:rnd(.75, 1.15)};
  M.ball.x = p.x + rnd(-1.2, 1.2); M.ball.y = p.y + rnd(-1, 1); M.ball.z = 9.5;
  M.ball.vx = M.ball.vy = 0; M.ball.vz = 0;
  M.drop = 1.25 + rnd(0, .35);                    // seconds until it is at heading height
  M.charge = 0; M.jumped = null; M.aerialAtk = !atk;
  M.phase = "aerial"; M.phaseT = 0; M.limit = 8;
  M.isPass = false; M.shooting = false;
  M.mates = []; M.defs = [];
  M.info = atk ? "Head it clear" : "Get on the end of it";
  inp.down = false;
  updateMatchHUD();
}

/* ---------- stage one: jockey him ---------- */
const jockeySpeed = () => 5.0 + S.skills.pace*.028 + (S.skills.tackling || 20)*.012;
function updateJockey(dt){
  M.phaseT += dt; M.jockT += dt;
  const a = M.att, p = M.p;
  // you shuffle across to wherever the pointer is; no clicking, just staying in front
  if (inp.hx != null){
    const want = screenToWorld(inp.hx, inp.hy);
    const dx = clamp(want.x - p.x, -1, 1);
    p.x = clamp(p.x + dx*jockeySpeed()*dt, 1, 67);
    p.vx = dx*jockeySpeed();
  }
  // he feints: a tell, and then he goes
  a.feintT -= dt;
  if (a.feintT <= 0 && !a.tell){ a.tell = .22; }
  if (a.tell > 0){
    a.tell -= dt;
    if (a.tell <= 0){
      a.dir = -a.dir;
      a.feintT = rnd(.55, 1.2);
      a.vx = a.dir*a.pace*rnd(.7, 1.1);
    }
  }
  a.vx = (a.vx || 0)*.92 + a.dir*a.pace*.25*dt*10;
  a.x = clamp(a.x + a.vx*dt, 1, 67);
  a.y -= a.pace*.42*dt;                            // he is always coming towards the goal
  const gap = Math.abs(a.x - p.x);
  const goalSide = p.y < a.y;
  // staying in front of him and goal-side squeezes him: the tighter you are, the heavier his touch
  if (gap < 1.6 && goalSide) M.press = Math.min(1, M.press + dt*(1.05 - gap*.35));
  else M.press = Math.max(0, M.press - dt*.8);
  M.ball.x = a.x; M.ball.y = a.y - .5;
  // he is past you
  if (!goalSide && gap < 2.2 && a.y < p.y - .4) return beaten();
  if (gap > 6.5 && a.y < p.y + 1) return beaten();
  if (M.defend === "shepherd" && M.press > .55 && M.jockT > 3.2){ M.defOut = "shepherd"; return endMoment("tackleWin", "Shepherded him away from goal and out of it. Nothing given."); }
  // the heavy touch — the ball leaves his feet and the window opens
  const chance = dt*(.22 + M.press*1.25);
  if (M.jockT > .9 && Math.random() < chance) return openWindow();
  if (a.y <= 2.2) return beaten();
  if (M.phaseT > M.limit) return beaten("He held you off and played away.");
}
function beaten(txt){
  M.att.gone = true;
  const last = M.defend === "last";
  if (last) return endMoment("beaten", txt || "He has gone past you, and there is nobody else.");
  return endMoment("beaten", txt || "He rolled you and carried on.");
}
// the ball is briefly not his: how long depends on how hard you made him work
function openWindow(){
  const tack = S.skills.tackling || 20;
  M.window = .34 + M.press*.42 + tack*.0035;
  M.winT = 0;
  const a = M.att;
  a.heavy = 1;
  const push = 1.1 + M.press*1.5;
  M.ball.x = clamp(a.x + a.dir*push*.4, 1, 67);
  M.ball.y = a.y - push;
  M.phase = "steal"; M.phaseT = 0;
  M.info = "Now — take it off him";
  flash("Heavy touch!");
}

/* ---------- stage two: the challenge ---------- */
function updateSteal(dt){
  M.phaseT += dt; M.winT += dt;
  const a = M.att, b = M.ball;
  a.y -= a.pace*.5*dt; a.x = clamp(a.x + a.vx*dt*.4, 1, 67);
  b.y -= 1.6*dt;
  if (M.winT > M.window){                          // he has it back under control
    M.phase = "jockey"; M.jockT = 0; M.press = Math.max(0, M.press - .25); a.heavy = 0;
    M.info = "He got it back — stay with him";
    b.x = a.x; b.y = a.y - .5;
    return;
  }
  if (M.phaseT > M.limit) return beaten();
}
// the swipe: where it goes decides everything
function challenge(fromX, fromY, toX, toY){
  if (!M || M.phase !== "steal") return;
  const a = M.att, b = M.ball;
  const bs = worldToScreen(b.x, b.y, b.z);
  const legs = worldToScreen(a.x, a.y, 0);
  const swipe = Math.hypot(toX - fromX, toY - fromY);
  if (swipe < 18*DPR) return;                      // a tap is not a challenge
  const tack = S.skills.tackling || 20;
  // where the swipe comes closest to the ball, and where it comes closest to his legs
  const hitBall = segHit(fromX, fromY, toX, toY, bs.x, bs.y);
  const hitLegs = segHit(fromX, fromY, toX, toY, legs.x, legs.y);
  const legR = (.95 - tack*.0035)*scale;           // a better tackler puts less of him at risk
  const jit = (1 - tack/120)*.3;
  const reach = (.95 + tack*.006 + gauss()*jit)*scale;
  M.tackled = true;
  // following through into him is the foul — where you stop the swipe is what matters
  const endsInHim = Math.hypot(toX - legs.x, toY - legs.y) < legR*1.15;
  if (endsInHim) return foulGiven();
  if (hitBall.d > reach){                          // thin air
    M.phase = "jockey"; M.jockT = 0; M.press = Math.max(0, M.press - .35); a.heavy = 0;
    b.x = a.x; b.y = a.y - .5; M.info = "Missed it — stay on your feet";
    flash("Missed it!");
    return;
  }
  // the closer the swipe runs to his feet, the more likely you catch something. A good tackler
  // gets in and out of the same gap without touching him; a poor one leaves a leg in.
  const prox = clamp(1 - hitLegs.d/(legR*2.1), 0, 1);
  if (Math.random() < prox*prox*(.8 - tack*.0042)) return foulGiven();
  // right through the middle of the ball is a clean take; anything looser pokes it away
  if (hitBall.d < reach*.45) return tackleWon();
  return pokeLoose();
}
// where along a swipe it passes a point, and how close it gets
function segHit(x1, y1, x2, y2, px, py){
  const dx = x2 - x1, dy = y2 - y1, L = dx*dx + dy*dy;
  const t = L ? clamp(((px - x1)*dx + (py - y1)*dy)/L, 0, 1) : 0;
  return {t, d:Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy))};
}
// distance from a point to a line segment, in screen pixels
function segDist(x1, y1, x2, y2, px, py){
  const dx = x2 - x1, dy = y2 - y1, L = dx*dx + dy*dy;
  const t = L ? clamp(((px - x1)*dx + (py - y1)*dy)/L, 0, 1) : 0;
  return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
}
function tackleWon(){
  const b = M.ball, p = M.p;
  MT.my.tackles = (MT.my.tackles || 0) + 1;
  skillXP("tackling", 26);
  flash("WON IT!");
  // you have the ball, and the move carries on as any other
  b.x = p.x; b.y = p.y - .4; b.z = BR; b.vx = b.vy = b.vz = 0;
  M.att.gone = true; M.defs = []; M.mates = buildOutlet();
  M.phase = "dribble"; M.moving = true; M.phaseT = 0;
  M.limit = M.t + 12;
  M.info = "You won it — go";
  M.wonBall = true;
  updateMatchHUD();
}
function pokeLoose(){
  MT.my.tackles = (MT.my.tackles || 0) + 1;
  skillXP("tackling", 14);
  flash("Poked clear"); M.defOut = "poke";
  return endMoment("tackleWin", "Not clean, but you got enough on it and the danger is gone.");
}
function foulGiven(){
  MT.my.fouls = (MT.my.fouls || 0) + 1;
  skillXP("tackling", 4);
  const last = M.defend === "last";
  const inBox = M.att.y < 16.5 && Math.abs(M.att.x - 34) < 20;
  const card = bookPlayer(last ? "red" : inBox ? "yellow" : (Math.random() < .3 ? "yellow" : ""));
  M.defOut = last ? "red" : inBox ? "pen" : card ? "yellow" : "fk";
  if (last) return endMoment("foul", "You brought him down as the last man. That is a red card.");
  if (inBox) return endMoment("foul", "You caught him inside the box. Penalty.");
  return endMoment("foul", card ? "You went through him. Booked." : "You caught his legs. Free kick.");
}
// the outlet after you win it: somebody to give it to
function buildOutlet(){
  const R = MT.roleNames;
  return ["CAM", "LW", "RW", "ST"].map(role => {
    const t = R[role];
    const x = clamp(M.p.x + rnd(-14, 14), 3, 65), y = clamp(M.p.y - rnd(6, 16), 4, 40);
    // nobody has picked them up yet: open, and moving with the ball at the angle they start at
    return {role, name:t.name, pid:t.id, x, y, st:"open", vx:0, vy:0, ox:x - M.p.x, oy:y - M.p.y};
  });
}

/* ---------- the read: an interception ---------- */
function updateRead(dt){
  M.phaseT += dt;
  const p = M.p, b = M.ball;
  if (inp.hx != null){
    const want = screenToWorld(inp.hx, inp.hy);
    const dx = want.x - p.x, dy = want.y - p.y, d = Math.hypot(dx, dy) || 1;
    const sp = jockeySpeed()*1.05 + (S.skills.interception || 20)*.012;
    p.x = clamp(p.x + dx/d*Math.min(d, sp*dt), 1, 67);
    p.y = clamp(p.y + dy/d*Math.min(d, sp*dt), 2, 46);
  }
  b.x += b.vx*dt; b.y += b.vy*dt;
  const icp = S.skills.interception || S.skills.tackling || 20;
  if (Math.hypot(b.x - p.x, b.y - p.y) < .9 + icp*.0048){
    MT.my.tackles = (MT.my.tackles || 0) + 1;
    skillXP("interception", 18); skillXP("tackling", 4);
    flash("INTERCEPTED!");
    b.vx = b.vy = 0; b.x = p.x; b.y = p.y - .4;
    M.mates = buildOutlet(); M.defs = [];
    M.phase = "dribble"; M.moving = true; M.phaseT = 0; M.limit = M.t + 12;
    M.info = "You read it — go"; M.wonBall = true;
    updateMatchHUD();
    return;
  }
  if (Math.hypot(b.x - M.recv.x, b.y - M.recv.y) < 1) return endMoment("beaten", "It found its man. You were a step late.");
  if (M.phaseT > M.limit || b.y < 1 || b.x < 0 || b.x > 68) return endMoment("beaten", "Gone. You could not get across.");
}

/* ---------- the header: charge the jump, time the leap ---------- */
function updateAerial(dt){
  M.phaseT += dt;
  const b = M.ball;
  const f = clamp(M.phaseT/M.drop, 0, 1.6);
  b.z = Math.max(.2, 9.5*(1 - f*f));               // it drops faster as it falls
  // hold to load the legs
  if (inp.down && !M.jumped) M.charge = Math.min(1, M.charge + dt*(1.1 + (S.skills.jumping || 20)*.004));
  if (M.jumped){
    M.jumped.t += dt;
    const j = M.jumped;
    j.z = Math.max(0, j.pow*7.2*j.t - 9.8*j.t*j.t*.5);
    if (j.t > .06 && j.z <= 0 && !j.done){ j.done = true; return headMissed(); }
    if (!j.done && Math.abs(b.z - (1.85 + j.z)) < .55 && b.z > 1.2) return headContact(j);
  }
  if (M.phaseT > M.drop + .9 && !M.jumped) return headMissed("You never left the ground.");
  if (M.phaseT > M.limit) return headMissed();
}
function releaseJump(){
  if (!M || M.phase !== "aerial" || M.jumped) return;
  const pow = clamp(M.charge, .12, 1);
  M.jumped = {t:0, pow, z:0, done:false};
  M.charge = 0;
}
function headContact(j){
  const rival = M.rival, b = M.ball;
  // his jump is fixed; yours is what you charged and when you left the floor
  // how high you got and how well you met it: jumping gets you up there, heading wins the contact
  const mine = j.pow*(1 + (S.skills.jumping || 20)*.0045 + (S.skills.heading || 20)*.0022);
  const his = rival.jump*rnd(.85, 1.15)*(1 + M.opp*.002);
  skillXP("jumping", 7); skillXP("heading", 8);
  if (mine < his) return endMoment("beaten", "He climbed above you and won the header.");
  MT.my.headers = (MT.my.headers || 0) + 1;
  if (M.aerialAtk){
    // you are attacking it: a header on goal
    // a good header goes where you meant it; a poor one goes where it likes
    const hd = S.skills.heading || 20, aimX = 34 + (Math.random() < .5 ? -1 : 1)*rnd(1, 3) + gauss()*(1.3 - hd/100)*3;
    const dx = aimX - M.p.x, dy = -M.p.y, L = Math.hypot(dx, dy) || 1, sp = 11 + mine*6 + hd*.05;
    b.vz = -1.6 - hd*.01; b.vx = dx/L*sp; b.vy = dy/L*sp;
    b.x = M.p.x; b.y = M.p.y; b.z = 2.1;
    M.shot = {t:0, dist:Math.hypot(b.x - 34, b.y), curl:false, style:"header", power:mine, x0:b.x, y0:b.y};
    M.myShot = true; M.shotEval = {xg:typeof xgAt === "function" ? xgAt({x:b.x, y:b.y}) : .2};
    M.shooting = true; M.isPass = false;
    M.phase = "flight"; M.trail = []; M.kickT = 0;
    keeperReads();
    flash("Met it!");
    updateMatchHUD();
    return;
  }
  return endMoment("tackleWin", "Up above him and headed it away. Everything cleared.");
}
function headMissed(txt){
  return endMoment("beaten", txt || "You mistimed the jump and it went over your head.");
}
