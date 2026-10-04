"use strict";
/* ============ DECISIONS ============
   A chance is rarely only a chance to shoot. Team-mates are around you — some free, some marked,
   one held by his shirt, one making a run nobody has picked up — and the right ball is sometimes
   the pass. When a moment opens up the game slows for a breath and you choose: shoot, or play it
   left, right, or back. What you choose, and how it turns out, is remembered: by the dressing room
   (Team Chemistry) and by you (your personality). A good decision can still fail and a bad one can
   still go in; the reaction knows the difference. */

const MATE_STATE = {
  open:{label:"OPEN", cls:"open", f:1}, space:{label:"IN SPACE", cls:"open", f:1}, better:{label:"BETTER ANGLE", cls:"better", f:1.06},
  run:{label:"MAKING A RUN", cls:"run", f:.86}, marked:{label:"MARKED", cls:"marked", f:.5}, held:{label:"HELD", cls:"held", f:.26}
};
const OPEN_STATES = new Set(["open", "space", "better", "run"]);
// the attacking chances that bring team-mates with them
const SUPPORTED = {run:2, wing:2, oneonone:1, edge:2, counter:2};
// extra kinds of moment the match can throw at you, by position
const EXTRA_MIX = {ST:{counter:7, cross:2}, W:{counter:6, cross:12}, AM:{counter:5, cross:4}, CM:{counter:3, cross:3}, DF:{counter:1, cross:2}};
const ATTACK_T = new Set(["run", "wing", "oneonone", "edge", "counter", "cross"]), DEFEND_T = new Set(["tackle", "intercept", "aerial"]);

/* ---------- what sort of moment, given the state of the game ---------- */
function pickMomentTypeCtx(ctx){
  const mix = Object.assign({}, momentMix(), EXTRA_MIX[S.player.pos] || EXTRA_MIX.ST);
  if (ctx && MT){
    const late = ctx.minute >= 68, diff = ctx.diff;
    const gap = clamp((MT.oppR - MT.ourR)/10, -1, 1);            // > 0: they are the better side
    for (const k of Object.keys(mix)){
      let w = mix[k];
      if (late && diff < 0){ if (ATTACK_T.has(k)) w *= 1.5; if (DEFEND_T.has(k)) w *= .6; }      // chasing the game
      if (late && diff > 0){ if (DEFEND_T.has(k)) w *= 1.45; if (k === "counter") w *= 1.6; if (k === "run" || k === "edge") w *= .8; }   // seeing it out
      if (gap > 0){ if (DEFEND_T.has(k)) w *= 1 + gap*.5; if (k === "counter") w *= 1 + gap*.6; if (k === "pass") w *= 1 - gap*.2; }
      else { if (k === "pass" || k === "cross") w *= 1 - gap*.25; if (DEFEND_T.has(k)) w *= 1 + gap*.3; }
      mix[k] = Math.max(0, w);
    }
  }
  return wpick(Object.keys(mix), k => mix[k]);
}

/* ---------- how good a position is to shoot from ---------- */
function xgAt(o, ignore){
  const dy = Math.max(.6, o.y), d = Math.hypot(o.x - 34, dy);
  const ang = Math.abs(Math.atan2(GOAL.R - o.x, dy) - Math.atan2(GOAL.L - o.x, dy));
  let q = clamp(ang*1.25*Math.exp(-d/22), .01, .85);
  // bodies between the ball and the goal
  let block = 0;
  for (const df of (M.defs || []).concat(M.wall || [])){
    if (df === ignore || df.stun > 0) continue;
    const vx = 34 - o.x, vy = -o.y, L2 = vx*vx + vy*vy || 1, t = clamp(((df.x - o.x)*vx + (df.y - o.y)*vy)/L2, 0, 1);
    if (t > .02 && Math.hypot(o.x + vx*t - df.x, o.y + vy*t - df.y) < 1.0) block += .32;
  }
  return q*Math.max(.22, 1 - block);
}
function mateQ(m){
  const b = M.ball, dist = Math.hypot(m.x - b.x, m.y - b.y);
  const lane = typeof laneOpen === "function" && laneOpen(b, m, 1.1) ? 1 : .35;
  return xgAt(m)*(MATE_STATE[m.st] || MATE_STATE.open).f*lane*clamp(1.12 - dist/45, .5, 1);
}

/* ---------- team-mates around a chance ---------- */
function addSupport(type){
  if (!MT || !MT.roleNames) return;
  const n = (SUPPORTED[type] || 0) + (S.chem > 65 && Math.random() < .5 ? 1 : 0);
  if (!n) return;
  const p = M.p, R = MT.roleNames, roles = shuffle(["ST", "LW", "RW", "CAM"]);
  const slots = type === "wing" ? ["box", "far", "back"] : type === "oneonone" ? ["side"] : type === "counter" ? ["left", "right", "back"] : ["left", "right", "back"];
  const c = clamp(S.chem/100, 0, 1), gap = clamp((MT.oppR - MT.ourR)/20, -.5, 1);
  M.mates = M.mates || [];
  for (let i = 0; i < Math.min(n, slots.length); i++){
    const role = roles[i], sl = slots[i];
    let x = p.x, y = p.y;
    if (sl === "left"){ x = p.x - rnd(8, 13); y = p.y - rnd(0, 5); }
    else if (sl === "right"){ x = p.x + rnd(8, 13); y = p.y - rnd(0, 5); }
    else if (sl === "back"){ x = p.x + rnd(-4, 4); y = p.y + rnd(6, 9); }
    else if (sl === "box"){ x = 34 + rnd(-5, 5); y = Math.max(7, p.y - rnd(9, 14)); }
    else if (sl === "far"){ x = p.x < 34 ? rnd(44, 52) : rnd(16, 24); y = Math.max(8, p.y - rnd(3, 8)); }
    else if (sl === "side"){ x = p.x + (p.x < 34 ? 1 : -1)*rnd(5, 8); y = p.y + rnd(1, 3); }
    x = clamp(x, 4, 64); y = clamp(y, 4, 44);
    // how free he is depends on how well you lot play together, and on who you are up against
    const st = wpick(Object.keys(MATE_STATE), k => ({open:2, space:1.4, run:type === "counter" ? 2.6 : 1.2, better:.8, marked:2, held:1}[k])
      *(OPEN_STATES.has(k) ? .7 + c*.8 : 1.3 - c*.5)*(k === "marked" || k === "held" ? 1 + Math.max(0, gap) : 1));
    const m = {role, name:R[role].name, pid:R[role].id, x, y, st, vx:0, vy:0, slot:sl, ox:x - p.x, oy:y - p.y};
    if (st === "better"){ m.x = clamp(34 + rnd(-7, 7), 6, 62); m.y = clamp(Math.min(p.y - 4, rnd(9, 15)), 5, 40); }
    M.mates.push(m);
    // the man marking him, if he has one
    const mk = st === "held" ? .75 : st === "marked" ? 1.7 : st === "run" ? 2.4 : st === "space" ? 3.6 : 0;
    if (mk){
      const d = newDef(m.x + rnd(-.6, .6), m.y - (st === "space" ? -mk : mk), M.opp);
      d.mark = m; d.markD = mk; M.defs.push(d);
    }
  }
}
// they move with the play: runners attack space, the held man struggles, the rest keep their angle
function updateMates(dt){
  if (!M.mates || M.ai) return;
  const p = M.p, b = M.ball;
  for (const m of M.mates){
    let tx, ty, sp = 5.6;
    if (m.st === "run" || m.st === "space"){ tx = clamp(34 + (m.x - 34)*.7, 6, 62); ty = Math.max(6, Math.min(m.y, b.y - 5)); sp = 6.2; }
    else if (m.st === "better"){ tx = m.x; ty = m.y; sp = 2; }
    else { tx = clamp(b.x + m.ox, 4, 64); ty = clamp(b.y + m.oy, 4, 44); }
    if (m.st === "held") sp *= .3;
    const dx = tx - m.x, dy = ty - m.y, dl = Math.hypot(dx, dy);
    if (dl > .05){ const s = Math.min(dl, sp*dt); m.x += dx/dl*s; m.y += dy/dl*s; m.vx = dx/dl*sp; m.vy = dy/dl*sp; } else { m.vx = m.vy = 0; }
  }
  for (const d of M.defs){
    if (!d.mark || d.stun > 0) continue;
    const m = d.mark;
    if (m.st === "space"){ runTo(d, m.x + rnd(-.1, .1), m.y + d.markD, d.spd*.75, dt); continue; }      // trailing, a yard off the pace
    if (typeof coverRun === "function") coverRun(d, m, dt, m.st === "held" ? 1.2 : .9, d.markD);
  }
}

/* ---------- the decision ---------- */
function dirOf(m){
  const p = M.p;
  if (m.y > p.y + 3) return {k:"back", label:"BACK PASS"};
  if (m.x < p.x - 2.5) return {k:"left", label:"PASS LEFT"};
  if (m.x > p.x + 2.5) return {k:"right", label:"PASS RIGHT"};
  return {k:"through", label:"THROUGH BALL"};
}
function buildOptions(){
  const shotQ = xgAt(M.ball);
  const opts = [];
  if (!M.cross || M.ball.y < 18) opts.push({kind:"shoot", label:M.cross ? "SHOOT" : "SHOOT", q:shotQ, sub:shotQ >= .3 ? "Good chance" : shotQ >= .14 ? "Half a chance" : "Long shot"});
  const used = new Set();
  const ranked = (M.mates || []).map(m => ({m, q:mateQ(m), d:dirOf(m)})).sort((a, b) => b.q - a.q);
  for (const r of ranked){
    if (used.has(r.d.k) || opts.length >= 4) continue;
    used.add(r.d.k);
    const lab = M.cross ? (r.m.slot === "cut" ? "CUT BACK" : r.m.slot === "near" ? "CROSS · NEAR POST" : "CROSS · FAR POST") : r.d.label;
    opts.push({kind:"pass", label:lab, m:r.m, q:r.q, sub:`${r.m.name} · ${MATE_STATE[r.m.st].label.toLowerCase()}`, st:r.m.st});
  }
  return {opts, shotQ, best:ranked[0] || null};
}
function beginDecide(){
  if (!M || !M.mates || !M.mates.length) { M.shooting = true; return beginAim(true, 3.2); }
  const b = buildOptions();
  if (b.opts.length < 2){ M.shooting = true; return beginAim(true, 3.2); }
  M.phase = "decide"; M.decT = 0; M.decided = true;
  M.decLimit = 2.5*(.85 + (S.traits ? S.traits.dec : 50)/100*.3)*(MT && MT.dream ? 1.8 : 1);
  M.opt = b;
  M.ball.vx *= .2; M.ball.vy *= .2;
  showDecide();
  flash(M.cross ? "Cross it — or go yourself" : "Options!");
}
function updateDecide(dt){
  M.decT += dt;
  const sdt = dt*.16;                                       // the world slows while you think
  updateMates(sdt);
  if (typeof updateDefs === "function"){ M.t += sdt; updateDefs(sdt); }
  if (!M || M.phase !== "decide") return hideDecide();
  moveKeeper(sdt);
  const bar = document.querySelector("#decide .dc-timer i"); if (bar) bar.style.width = (100*clamp(1 - M.decT/M.decLimit, 0, 1)).toFixed(1) + "%";
  if (M.decT >= M.decLimit){
    // no decision is a decision: instinct takes over and you hit it
    const shot = M.opt.opts.findIndex(o => o.kind === "shoot");
    chooseOption(shot >= 0 ? shot : 1, true);
  }
}
function showDecide(){
  const el = document.getElementById("decide"); if (!el) return;
  el.innerHTML = `<div class="dc-head"><b>${M.cross ? "Where does it go?" : "Your call"}</b><div class="dc-timer"><i></i></div></div>
    <div class="dc-opts">${M.opt.opts.map((o, i) => `<button class="dc-opt ${o.kind} ${o.st ? MATE_STATE[o.st].cls : ""}" onclick="chooseOption(${i})">
      <kbd>${i + 1}</kbd><b>${o.label}</b><span>${esc(o.sub || "")}</span></button>`).join("")}</div>`;
  placeDecide(el);
  el.classList.add("on");
}
// the choices sit along the bottom unless that is where the play is; then they move up under the score
function placeDecide(el){
  el.classList.remove("top");
  if (typeof cv === "undefined" || !cv || typeof worldToScreen !== "function") return;
  const r = cv.getBoundingClientRect(), k = r.height/(cv.height || 1), box = el.getBoundingClientRect();
  const ys = [M.ball, M.p].concat(M.mates || []).map(o => r.top + worldToScreen(o.x, o.y, o.z || BR).y*k);
  if (ys.some(y => y > box.top - 44 && y < box.bottom + 14)) el.classList.add("top");
}
function hideDecide(){ const el = document.getElementById("decide"); if (el){ el.classList.remove("on"); el.innerHTML = ""; } }
function chooseOption(i, timedOut){
  if (!M || M.phase !== "decide") return;
  const o = M.opt.opts[i]; if (!o) return;
  hideDecide();
  const best = M.opt.best;
  M.dec = {choice:o.kind, chosenQ:o.q, shotQ:M.opt.shotQ, bestQ:best ? best.q : 0, bestOpen:best ? OPEN_STATES.has(best.m.st) : false,
    bestName:best ? best.m.name : "", chosenState:o.st || "", chosenName:o.m ? o.m.name : "", ctx:M.cross ? "cross" : "open", hes:!!timedOut};
  if (o.kind === "shoot"){ M.shooting = true; M.isPass = false; beginAim(true, M.type === "edge" ? 3.5 : 3.2); return; }
  M.isPass = true; M.shooting = false; M.call = o.m.role; M.callOriginal = M.callOriginal || o.m.role;
  M.info = `${o.label.toLowerCase().replace(/^./, c => c.toUpperCase())} · ${o.m.name}`;
  beginAim(false, 4.2); M.moving = true;
  updateMatchHUD();
}
// D during a pass you are lining up: you can shoot instead, and the lads will have an opinion
function switchToShot(){
  if (!M || M.phase !== "aim" || !passMode() || M.throwIn || M.corner) return false;
  const caller = (M.mates || []).find(m => m.role === M.call);
  M.dec = {choice:"shoot", chosenQ:xgAt(M.ball), shotQ:xgAt(M.ball), bestQ:caller ? mateQ(caller) : 0, bestOpen:true, bestName:caller ? caller.name : "",
    ctx:M.cross ? "cross" : "construction"};
  M.construction = !M.cross; M.shooting = true;
  beginAim(true, 2.8);
  flash("Going for goal!");
  return true;
}

/* ---------- what everyone made of it ---------- */
function judgeMoment(){
  if (!M || !MT || MT.dream) return null;
  const r = M.result, dec = M.dec, ev = M.shotEval || {}, setP = M.type === "penalty" || M.type === "freekick";
  let chem = 0, trust = 0, say = "";
  const T = [];
  const margin = ev.margin || 0;
  if (setP && M.myShot){
    if (r === "goal"){ chem += 1; T.push(["conf", 1.2]); say = M.type === "penalty" ? "Cool as you like." : "Unstoppable."; }
    else if (r === "saved" || r === "corner"){
      if ((ev.saveQ || 0) > .55){ T.push(["conf", .2]); say = "Great save — nothing wrong with that strike."; }
      else { chem -= .5; T.push(["conf", -.4]); say = "Too close to the keeper."; }
    }
    else if (r === "post" || r === "bar"){ chem -= .3; say = "Inches away."; }
    else if (r === "blocked"){ chem -= .5; say = "Into the wall."; }
    else if (r === "miss"){
      if (margin < .8){ chem -= .6; say = "Just wide."; }
      else if (margin < 2.5){ chem -= 1.2; T.push(["conf", -.5]); say = "Not close enough."; }
      else { chem -= 2.2; T.push(["conf", -.8], ["dec", -.3]); say = "Way off. Somebody else will want this next time."; }
    }
  } else if (dec && dec.choice === "shoot" && M.myShot){
    const gap = dec.bestQ - dec.shotQ;
    let base = 0;
    if (dec.ctx === "construction") base = dec.shotQ < .1 ? -2.2 : dec.shotQ < .2 ? -1.3 : 0;
    else if (gap > .12 && dec.bestOpen) base = -(1 + gap*6);
    // the result shapes the reaction: a goal forgives a lot, a good save most of it, a shot into the stand none of it
    const mul = r === "goal" ? .12 : (r === "saved" || r === "corner") ? ((ev.saveQ || 0) > .55 ? .3 : .5) : (r === "post" || r === "bar") ? .5 : r === "blocked" ? .8 : r === "miss" ? (margin > 3 ? 1.5 : margin > 1 ? 1.1 : .8) : 1;
    if (base < 0){
      chem += base*mul; T.push(["team", -(.7 + Math.max(0, gap)*2)], ["risk", .6]);
      if (r !== "goal"){ T.push(["dec", -.5]); if (dec.ctx === "construction") trust -= .8; }
      say = r === "goal" ? (dec.ctx === "construction" ? "Audacious — and it went in. They'll let it go this time." : `It went in, but ${dec.bestName} was free.`)
        : dec.ctx === "construction" ? "“We were building that. Why shoot from there?”" : `${dec.bestName} was free and he let you know it.`;
    } else {
      T.push(["dec", .35]);
      if (r === "goal"){ chem += .6; T.push(["conf", 1]); say = "Right call, and finished."; }
      else if ((r === "saved" || r === "corner") && (ev.saveQ || 0) > .55) say = "Right call — the keeper just did his job.";
    }
    if (r === "miss" && dec.shotQ > .3 && margin > 3){ chem -= .8; T.push(["conf", -.5]); if (!say || base >= 0) say = "A big chance, badly missed."; }
    if (dec.hes) T.push(["conf", -.2]);
  } else if (dec && dec.choice === "pass"){
    // picking the wrong man: someone held or marked when a team-mate was clearly free
    const wrongMan = dec.bestOpen && dec.bestName && dec.chosenName && dec.chosenName !== dec.bestName && dec.chosenQ < dec.bestQ*.6;
    if (wrongMan){
      chem += M.passTo ? (r === "goal" ? .6 : .3) : -.3; T.push(["dec", -.4], ["team", .2]);
      const why = dec.chosenState === "held" ? "being held" : dec.chosenState === "marked" ? "marked" : "";
      say = M.passTo ? (r === "goal" ? `It came off — but ${dec.bestName} was in more space.` : `${dec.bestName} was in more space.`)
        : why ? `${dec.chosenName} was ${why} — ${dec.bestName} was free.` : `${dec.bestName} was the better ball.`;
    } else if (dec.chosenQ >= dec.shotQ - .05){
      chem += M.passTo ? 1 + (r === "goal" ? 1 : 0) : .2; T.push(["team", .9], ["dec", .4]);
      say = r === "goal" ? "Unselfish — the lads love that." : M.passTo ? "Right ball." : "Right idea, the execution let you down.";
    } else if (dec.shotQ > dec.chosenQ + .15){
      chem += M.passTo ? .4 : 0; T.push(["conf", -.5], ["dec", -.3], ["team", .3]);
      say = "You had the shot on there.";
    } else { chem += M.passTo ? .5 : -.2; T.push(["team", .4]); }
    if (dec.hes) T.push(["conf", -.2]);
  } else if (M.isPass && !M.shooting && !M.myShot){
    // an ordinary moment of building the play
    if (M.passTo){ chem += M.passTo.role === M.callOriginal ? .7 : .4; T.push(["team", .3]); if (r === "goal") chem += .8; }
    else if (r === "outplay"){ chem -= .5; T.push(["dec", -.2]); }
    else if (r === "intercepted" || r === "lost"){ chem -= .25; }
  } else if (M.myShot){
    if (r === "goal"){ chem += .6; T.push(["conf", .9]); }
    else if (r === "miss" && (ev.xg || 0) > .3 && margin > 3){ chem -= .8; T.push(["conf", -.5]); say = "A big chance, badly missed."; }
  }
  if (r === "tackleWin"){ chem += .5; T.push(["conf", .2], ["dec", .15]); }
  if (r === "foul"){ T.push(["risk", .5], ["dec", -.2]); }
  if (r === "beaten" && M.defend === "last") chem -= .5;
  for (const [k, d] of T) trait(k, d);
  chem = Math.round(chem*10)/10;
  if (chem) chemAdd(chem);
  if (trust) trustAdd(trust);
  MT.chemD = (MT.chemD || 0) + chem;
  return {chem, say};
}
