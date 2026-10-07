"use strict";
/* ============ LIVE MATCH ============ */
let MT = null;
// work rate: 1-4 bolts. Per match minute on the pitch: energy drain, chance of an extra involvement, injury risk (kept low)
const WR = {drain:[0, .16, .26, .38, .55], extra:[0, 0, .004, .012, .022], inj:[0, 0, .00003, .0001, .00025], skip:[0, .3, 0, 0, 0]};
const STADIUM = ["Local ground", "Small stadium", "Stadium", "Big stadium", "Giant arena"];
function stadiumFor(f){
  if (f.kind === "D") return {tier:4, crowd:88000};
  if (f.kind === "N") return {tier:4, crowd:ri(45000, 75000)};
  const rep = W.clubs[f.h].rep, tier = rep < 300 ? 0 : rep < 1200 ? 1 : rep < 3500 ? 2 : rep < 7000 ? 3 : 4;
  const cap = [900, 6000, 28000, 50000, 82000][tier];
  let crowd = Math.min(cap, 60*Math.pow(rep/100, 1.55))*rnd(.75, 1);
  if (f.kind === "E") crowd = Math.max(crowd, cap*.9);
  if (f.kind === "F") crowd *= .35;                                    // pre-season: half-empty, nothing riding on it
  if (f.kind === "C"){ const cup = (W.cups || {})[f.cc];
    if (cup){ const left = cup.weeks.length - cup.weeks.indexOf(f.w); crowd = Math.max(crowd, cap*Math.min(.95, .45 + (6 - left)*.1)); } }
  return {tier, crowd:Math.round(crowd), cap};
}
const SPEED_MS = {1:430, 2:210, 4:85};
function momentCount(){
  const r = currentRole(); let n = r === "starter" ? ri(4,6) : r === "rotation" ? ri(3,4) : ri(2,3);
  if (S.energy < 15) n--; return Math.max(1, n);
}
/* What a game looks like from where you play. A striker spends it in front of goal; a defender
   spends it playing out, going up for set pieces, and taking the odd chance when one falls to him. */
const MOMENT_MIX = {
  ST: {run:26, wing:6,  oneonone:12, edge:11, freekick:6,  penalty:6, pass:16, corner:11, throwin:6},
  W:  {run:20, wing:22, oneonone:8,  edge:8,  freekick:7,  penalty:3, pass:19, corner:8,  throwin:5},
  AM: {run:16, wing:9,  oneonone:6,  edge:13, freekick:12, penalty:4, pass:26, corner:9,  throwin:5},
  CM: {run:9,  wing:6,  oneonone:3,  edge:10, freekick:10, penalty:2, pass:41, corner:9,  throwin:10},
  DF: {run:4,  wing:3,  oneonone:1,  edge:4,  freekick:4,  penalty:1, pass:47, corner:18, throwin:18}
};
function momentMix(){
  return Object.assign({}, MOMENT_MIX[S.player.pos] || MOMENT_MIX.ST,
                       DEFEND_MIX[S.player.pos] || DEFEND_MIX.ST);
}
// what kind of moment comes your way depends on where you play, the score, the clock and who you are up against
function pickMomentType(ctx){
  if (typeof pickMomentTypeCtx === "function") return pickMomentTypeCtx(ctx);
  const mix = momentMix(), keys = Object.keys(mix);
  let total = 0; for (const k of keys) total += mix[k];
  let r = Math.random()*total;
  for (const k of keys){ if ((r -= mix[k]) < 0) return k; }
  return "pass";
}
function roleNames(xi){
  const out = {}, used = new Set([S.meId]);
  for (const role of ["ST","LW","RW","CAM"]){
    const p = xi.find(q => q.pos === role && !used.has(q.id)) || xi.find(q => ["ST","LW","RW","CAM","CM"].includes(q.pos) && !used.has(q.id)) || xi.find(q => !used.has(q.id) && q.pos !== "GK");
    used.add(p.id); out[role] = {id:p.id, name:sname(p)};
  }
  return out;
}
/* A match day before a ball is kicked (DESIGN 3.4.5): the two line-ups (the player in his club's XI), the role the
   manager gives him (arriving late he starts on the bench, and the manager remembers it), when he is planned off or
   on, the minutes he is on the pitch (MT.on, match minutes), the kits, the ground and its crowd, and what the nerves
   and tired legs will take off him. No result is decided here and no screen is drawn: the 2D match (startMatch)
   adds its script on top, the 3D match (js/life/football) plays it out. Returns MT. */
const blankMatchMy = () => ({goals:0, assists:0, dribbles:0, shots:0, onTarget:0, lost:0, misses:0, long:0, fk:0, curl:0, pen:0, spass:0, lpass:0, passAtt:0, tackles:0, fouls:0, headers:0, cards:0, beaten:0});
function matchSetup(f, opts = {}){
  const me = meP(), home = f.kind === "N" ? f.h === me.nat : f.h === me.club;
  const usId = home ? f.h : f.a, themId = home ? f.a : f.h;
  const usXI = f.kind === "N" ? natSquad(usId).slice(0, 11) : lineup(usId);
  if (!usXI.some(p => p.me)) usXI[usXI.length-1] = me;
  const themXI = f.kind === "N" ? natSquad(themId).slice(0, 11) : lineup(themId);
  const ourR = strength(usXI.filter(p => !p.me)) + (me.ovr - 50)*.05, oppR = strength(themXI);
  // the manager picks the side on the day: trust above all, but form, fitness, the dressing room and chance too
  let role = typeof selectRole === "function" ? selectRole(f) : (f.kind === "N" ? "rotation" : currentRole());
  const late = !!opts.late;
  if (late && (role === "starter" || role === "rotation")) role = "sub";
  if (late && typeof trustAdd === "function") trustAdd(-3);
  const subOff = role === "rotation" ? ri(64, 78) : 0;
  const subOn = role === "sub" ? ri(56, 68) : role === "cameo" ? ri(78, 84) : 0;
  const nameUs = sideName(f, home ? "h" : "a"), nameThem = sideName(f, home ? "a" : "h");
  MT = {f, home, usId, themId, nameUs, nameThem, usXI, themXI, ourR, oppR, score:[0,0], minute:0, label:"0'", role, late,
    usGoals:[], themGoals:[], my:blankMatchMy(), highlights:[], stats:{shots:[0,0], corners:[0,0], cards:[0,0]},
    onPitch: role !== "sub" && role !== "cameo", subOn, subOff, chemD:0, on: role === "sub" || role === "cameo" ? [] : [[0, null]],
    myKit: f.kind === "N" ? natKit(usId) : kitOf(nameUs), oppKit: f.kind === "N" ? natKit(themId) : awayKit(nameUs, nameThem), lines:[]};
  S.speed = S.speed || 2;
  MT.stad = stadiumFor(f); MT.nerves = nervesFor(MT.stad.crowd); MT.extras = 0;
  // tired legs take something off everything you do
  MT.tired = typeof fatigueSkillHit === "function" ? fatigueSkillHit() : 0;
  return MT;
}
// the 2D match: the day of matchSetup, then the script it plays (the score decided up front, the moments that come
// your way and when, the timeline) and its screen
function startMatch(f){
  matchSetup(f);
  const role = MT.role, ourR = MT.ourR, oppR = MT.oppR, usXI = MT.usXI, themXI = MT.themXI;
  let [us, them] = goalsFor(ourR, oppR, MT.home && f.kind !== "N");
  let thin = 0; for (let i = 0; i < us; i++) if (Math.random() < .72) thin++; us = thin;
  const events = [];
  const usGoals = pickScorers(usXI, us, p => p.me), themGoals = pickScorers(themXI, them);
  usGoals.forEach(g => events.push({min:ri(2,90), kind:"us", g}));
  themGoals.forEach(g => events.push({min:ri(2,90), kind:"them", g}));
  // how often the ball finds you, and when: what kind of moment it is gets decided when it arrives
  const n = typeof involvement === "function" ? involvement(role, ourR, oppR) : momentCount();
  const subOff = MT.subOff;
  const lo = role === "sub" || role === "cameo" ? MT.subOn : 3, hi = subOff ? subOff - 1 : 89;
  for (let i = 0; i < n; i++) events.push({min:ri(lo, hi), kind:"moment", type:null});
  events.sort((a,b) => a.min - b.min);
  const firstMoment = events.find(e => e.kind === "moment");
  const tl = [];
  const s1 = ri(1, 3), s2 = ri(2, 5);
  for (let m = 1; m <= 45; m++) tl.push({base:m, label:m + "'"});
  for (let k = 1; k <= s1; k++) tl.push({base:45, label:`45+${k}'`, st:true});
  tl.push({ht:true, label:"HT"});
  for (let m = 46; m <= 90; m++) tl.push({base:m, label:m + "'"});
  for (let k = 1; k <= s2; k++) tl.push({base:90, label:`90+${k}'`, st:true});
  tl.push({ft:true, label:"FT"});
  Object.assign(MT, {events, i:0, tl, ti:0, running:false, timer:null, poss:clamp(.5 + (ourR - oppR)/40, .3, .72),
    subOn: (role === "sub" || role === "cameo") ? (firstMoment ? Math.max(lo - 4, firstMoment.min - ri(2, 6)) : lo) : 0,
    roleNames: roleNames(usXI.filter(p => !p.me).concat([])), gkName: sname(usXI.find(p => p.pos === "GK") || usXI[0])});
  if (typeof matchSkillsOn === "function") matchSkillsOn(Math.min(.45, MT.nerves + MT.tired));
  renderMatchScreen();
  showPrematch();
}
function natKit(nat){ return {RO:["#ffd200","#002b7f"], EN:["#ffffff","#0b1f4d"], ES:["#c60b1e","#ffc400"], DE:["#ffffff","#111111"], IT:["#0a5ec2","#ffffff"], FR:["#0b2a6b","#ffffff"]}[nat] || ["#888","#fff"]; }
function renderMatchScreen(){
  LAST_SCREEN = null; document.body.classList.add("in-match");
  if (document.body.classList.contains("life")){
    const lr = document.getElementById("lifeRoot"); if (lr) lr.style.display = "none";
    if (window.stopLife) window.stopLife();
    if (window.lifeClearKeys) window.lifeClearKeys();
  }
  const f = MT.f, [hk] = MT.home ? MT.myKit : MT.oppKit, [ak] = MT.home ? MT.oppKit : MT.myKit;
  $("#app").innerHTML = `<div class="match-screen">
    <canvas id="pitch" aria-label="Pitch"></canvas>
    <div class="scorebug glass">
      <div class="sb-comp">${esc(compLabel(f))}</div>
      <div class="sb-row"><span class="sb-team"><i class="dot" style="background:${hk}"></i><span class="sb-nm" title="${esc(sideName(f,"h"))}">${esc(sideName(f,"h"))}</span></span>
        <span class="sb-score" id="sc">0 – 0</span><span class="sb-team"><i class="dot" style="background:${ak}"></i><span class="sb-nm" title="${esc(sideName(f,"a"))}">${esc(sideName(f,"a"))}</span></span></div>
      <div class="sb-min" id="mn">Pre-match</div>
    </div>
    <div class="match-hud glass">
      <div class="hud-energy"><span>Energy</span><div class="meter"><i id="enb"></i></div><b id="en"></b>
        <button id="wrBtn" class="wr" onclick="A.workrate()" aria-label="Work rate" title="Work rate: more bolts = more chances, more tiredness, more injury risk"></button></div>
      ${MT.nerves > .01 ? `<div class="nerves">😰 Nerves: skills −${Math.round(MT.nerves*100)}% (crowd ${MT.stad.crowd.toLocaleString("en-GB")})</div>` : ""}
      <div class="act-row" id="actrow">
        <button class="btn sm ghost" id="passnow" onclick="A.passNow()">Pass · S</button>
        <button class="btn sm" id="shootnow" onclick="A.shootNow()">Shoot · D</button>
      </div>
    </div>
    <div class="commentary glass" id="comm"><div class="comm-head"><b>Live</b><span id="poss"></span></div><div id="llines"></div></div>
    <div id="decide" class="decide"></div>
    <div id="ov" class="ov"></div>
    <div class="rotate-tip">↻ Turn your phone sideways for a bigger pitch</div>
  </div>`;
  setupCanvas(); updateMatchHUD(); updateBoard();
  loopOn = true; lastT = performance.now(); requestAnimationFrame(loop);
}
function updateBoard(){
  const us = MT.score[0], th = MT.score[1];
  const sc = $("#sc"); if (sc) sc.textContent = MT.home ? `${us} – ${th}` : `${th} – ${us}`;
  const mn = $("#mn"); if (mn) mn.textContent = MT.label;
  const ps = $("#poss"); if (ps){ const p = Math.round(MT.poss*100); ps.textContent = `Possession ${MT.home ? p : 100-p}% – ${MT.home ? 100-p : p}%`; }
}
function wrHTML(n){
  const sparks = Array.from({length:n*6}, (_, i) => { const a = (i/(n*6))*Math.PI*2 + (i%3)*.3, r = 26 + (i%4)*7;
    return `<i class="spark" style="--x:${Math.round(Math.cos(a)*r)}px;--y:${Math.round(Math.sin(a)*r*.55)}px;--d:${((i*137)%1000)/1000*1.4}s"></i>`; }).join("");
  return `<span class="wr-ring"></span><span class="wr-bolts">${"⚡".repeat(n)}</span>${sparks}`;
}
function updateWR(){ const b = $("#wrBtn"); if (!b) return; const n = S.workrate || 2; if (b.dataset.n !== String(n)){ b.dataset.n = n; b.className = "wr lv" + n; b.innerHTML = wrHTML(n); } }
function updateMatchHUD(){
  updateWR();
  if (!$("#en")) return;
  $("#en").textContent = Math.round(S.energy); $("#enb").style.width = S.energy + "%";
  const dribbling = !!(M && M.phase === "dribble");
  const ar = $("#actrow"); if (ar) ar.style.display = dribbling ? "" : "none";       // only while you're on the ball
  const pn = $("#passnow"); if (pn){ const can = !!(M && M.mates && M.mates.length); pn.disabled = !can; pn.title = can ? "Pick a team-mate out" : "Nobody's in support"; }
  const hud = $(".match-hud"); if (hud) hud.classList.toggle("hud-hidden", !!M && !dribbling && document.querySelector(".match-screen.moment"));
}
function say(text, cls){
  MT.lines.push({t:MT.label, text, cls:cls || ""});
  const box = $("#llines"); if (!box) return;
  const d = document.createElement("div"); d.className = "cl " + (cls || ""); d.innerHTML = `<span class="cm">${esc(MT.label)}</span>${esc(text)}`;
  box.prepend(d); while (box.children.length > 7) box.lastChild.remove();
}
const U = () => pick(MT.usXI.filter(p => !p.me && p.pos !== "GK")), T = () => pick(MT.themXI.filter(p => p.pos !== "GK"));
function commentary(){
  const m = sname(U()), m2 = sname(U()), o = sname(T()), us = MT.nameUs, opp = MT.nameThem, you = S.player.name, k = MT.gkName;
  if (Math.random() < .07) return pick([`The ${MT.home ? us : opp} fans are making some noise.`, `Scrappy spell in midfield. Nobody can keep the ball.`, `${o} needs treatment after a clash of heads.`, `The referee has a word with both captains.`]);
  if (Math.random() < MT.poss){
    const r = Math.random();
    if (r < .22){ MT.stats.shots[0]++; return pick([`${m} tries his luck from distance — just over.`, `${m} cuts inside and shoots. Straight at the keeper.`, `Header from ${m} off a corner — wide.`, `${m} volleys it... side netting!`, `${m} forces a good save from the ${opp} keeper.`]); }
    if (r < .36){ MT.stats.corners[0]++; return pick([`Corner to ${us}. ${o} heads it clear.`, `${m} wins a corner down the right.`, `${us} corner — cleared at the near post.`]); }
    if (r < .47 && MT.onPitch) return pick([`${you} drops deep to get on the ball.`, `${you} makes a run in behind, but ${m} doesn't see it.`, `${you} calls for it on the edge — the pass goes astray.`, `Neat touch from ${you} to keep the move alive.`]);
    if (r < .55){ MT.stats.cards[1]++; return `Yellow card: ${o} (${opp}) for a cynical foul on ${m}.`; }
    return pick([`${us} keep the ball well, passing it round the back.`, `${m} switches play to ${m2}. Good spell for ${us}.`, `${m} is fouled 30 yards out. Free kick ${us}.`, `Neat one-two between ${m} and ${m2}, but ${o} gets back.`, `${us} pressing high now.`]);
  } else {
    const r = Math.random();
    if (r < .22){ MT.stats.shots[1]++; return pick([`${opp} break! ${o} shoots — ${k} saves!`, `${o} fires wide from the edge of the area.`, `${o} with a header... over the bar.`, `Big chance for ${opp}! ${o} scuffs it.`]); }
    if (r < .36){ MT.stats.corners[1]++; return pick([`${opp} win a corner. ${m} clears it off the line!`, `Corner for ${opp}, ${k} comes and claims it.`]); }
    if (r < .44){ MT.stats.cards[0]++; return `Yellow card for ${m} after a late challenge on ${o}.`; }
    if (r < .5) return `Offside flag against ${o}.`;
    return pick([`${opp} have a long spell of possession.`, `${o} goes down in the box... play on, says the referee!`, `${m} makes a vital block on ${o}.`, `${opp} pushing forward, ${us} sitting deep.`]);
  }
}
function leadIn(e){
  const m = sname(U()), you = S.player.name;
  const line = {run:`${m} wins it back and finds ${you} in space...`, wing:`${m} spreads it wide to ${you}...`, oneonone:`${m} plays a perfect through ball — ${you} is in!`,
    edge:`The ball breaks to ${you} on the edge of the box!`, freekick:`${you} is brought down in a dangerous area. Free kick!`, penalty:`${you} is tripped in the box — PENALTY!`,
    pass:`${you} gets it in the middle of the park. Options everywhere...`,
    counter:`${m} wins it on the edge of our box — ${you} is away on the break!`,
    cross:`${m} slides ${you} in down the line. The box is filling up...`,
    corner:`${you} jogs over to take the corner. The box is packed...`,
    throwin:`It runs out for a throw. ${you} picks the ball up...`}[e.type];
  say(line || `The ball comes to ${you}...`, "hot");
}
function goalEvent(e){
  const us = e.kind === "us", g = e.g, s = W.players[g.s], a = g.a >= 0 ? W.players[g.a] : null;
  if (us){ say(a ? `${sname(a)} threads it through to ${sname(s)}...` : `${sname(s)} picks up a loose ball...`); MT.score[0]++; MT.stats.shots[0]++; MT.usGoals.push(g); say(`GOAL! ${sname(s)} scores for ${MT.nameUs}. ${scoreText()}`, "goal"); }
  else { say(`${MT.nameThem} counter-attack, ${sname(s)} gets in behind...`); MT.score[1]++; MT.stats.shots[1]++; MT.themGoals.push(g); say(`GOAL ${MT.nameThem}. ${sname(s)} beats ${MT.gkName}. ${scoreText()}`, "bad"); }
  updateBoard();
}
function scoreText(){ return MT.home ? `${MT.score[0]}–${MT.score[1]}` : `${MT.score[1]}–${MT.score[0]}`; }
function advance(){
  const t = MT.tl[MT.ti++]; if (!t) return false;
  MT.label = t.label; if (t.base) MT.minute = t.base;
  if (t.ht){ updateBoard(); halfTime(); return false; }
  if (t.ft){ finishMatch(); return false; }
  updateBoard();
  if (t.base === 1 && !t.st) say(`Kick-off! ${MT.f.kind === "N" ? "The anthems are done." : ""} ${MT.role === "sub" ? "You start on the bench." : "You're in the team."}`.trim());
  if (t.base === 46 && !t.st) say("The second half is under way.");
  if (!MT.onPitch && MT.subOn && t.base >= MT.subOn && !t.st && !MT.subbedOff){ MT.onPitch = true; MT.cameOn = t.base; say(`Substitution ${MT.nameUs}: ${S.player.name} comes on for ${sname(U())}.`, "hot"); }
  if (MT.onPitch && MT.subOff && t.base >= MT.subOff && !t.st){
    MT.onPitch = false; MT.subbedOff = t.base;
    MT.events = MT.events.filter((e, i) => i < MT.i || e.kind !== "moment");
    say(`Substitution ${MT.nameUs}: ${S.player.name} makes way after a solid shift.`);
  }
  if (MT.onPitch && !MT.injuredOff){
    const wr = S.workrate || 2, stamF = staminaF();
    S.energy = Math.max(0, S.energy - WR.drain[wr]*stamF);
    skillXP("stamina", .35*wr); if (MT.stad.crowd >= 8000 && MT.minute % 10 === 0) skillXP("composure", 1.6);
    updateMatchHUD();
    if (Math.random() < WR.inj[wr]){
      MT.injuredOff = true; meP().inj = ri(1, 3);
      MT.events = MT.events.filter((e, i) => i < MT.i || e.kind !== "moment");
      say(`${S.player.name} pulls up holding his hamstring — he's been running himself into the ground. He has to come off.`, "bad");
      toast(`Injured — out for about ${meP().inj} week${meP().inj > 1 ? "s" : ""}. Too much work rate!`);
    } else if (!t.st && MT.extras < 4 && Math.random() < WR.extra[wr] && !MT.events.slice(MT.i).some(e => e.kind === "moment" && Math.abs(e.min - t.base) < 5) && t.base < 88){
      MT.extras++; const e = {min:t.base + 1, kind:"moment", type:pickMomentType(), extra:true};
      MT.events.splice(MT.i, 0, e); MT.events.sort((a,b) => a.min - b.min);
      say(`${S.player.name} is everywhere — pressing, running, demanding the ball.`, "hot");
    }
  }
  if (!t.st) while (MT.i < MT.events.length && MT.events[MT.i].min <= t.base){
    const e = MT.events[MT.i];
    if (e.kind === "moment" && WR.skip[S.workrate || 2] && Math.random() < WR.skip[S.workrate || 2]){ MT.i++; say(`${sname(U())} ignores ${S.player.name}'s half-hearted run and loses it.`); continue; }
    if (e.kind === "moment" && MT.subbedOff){ MT.i++; continue; }
    if (e.kind === "moment" && Math.random() < Math.max(0, .07 - (S.chem || 0)*.0006)){
      // a team-mate who does not know you yet goes alone instead
      MT.i++; say(`${sname(U())} has ${S.player.name} free but goes on his own — and loses it.`); continue;
    }
    if (e.kind === "moment"){
      if (!e.type) e.type = pickMomentType({minute:t.base, diff:MT.score[0] - MT.score[1]});
      if (!MT.onPitch){ MT.onPitch = true; MT.cameOn = MT.cameOn || t.base; say(`${S.player.name} comes on.`, "hot"); }
      leadIn(e); showPre(e); return false;
    }
    MT.i++; goalEvent(e);
  }
  if (Math.random() < .32) say(commentary());
  return true;
}
function tick(){ if (!MT || !MT.running) return; if (advance()){ MT.timer = setTimeout(tick, SPEED_MS[S.speed] || 210); } else MT.running = false; }
function resumeClock(){ if (!MT) return; showLive(); MT.running = true; clearTimeout(MT.timer); MT.timer = setTimeout(tick, 250); }
function skipAhead(){ if (!MT) return; clearTimeout(MT.timer); MT.running = false; let n = 0; while (n++ < 200 && advance()){} }
function showLive(){
  const ov = $("#ov"); if (!ov) return; ov.hidden = false; ov.className = "ov live";
  ov.innerHTML = `<div class="live-ctl glass"><div class="seg">${[1,2,4].map(s => `<button aria-pressed="${S.speed === s}" onclick="A.speed(${s})">${s}×</button>`).join("")}</div>
    <button class="btn sm ghost" onclick="A.skipAhead()">Skip to next event ⏭</button></div>`;
}
function card(html, cls){ const ov = $("#ov"); if (!ov){ M = null; return; } const same = !ov.hidden && !!cls && ov.dataset.kind === cls; ov.dataset.kind = cls || ""; ov.hidden = false; ov.className = "ov center " + (cls || "") + (same ? " still" : ""); const inner = `<div class="card glass pop">${html}</div>`; if (same) morph(ov, inner); else ov.innerHTML = inner; const b = ov.querySelector(".btn"); if (b) b.focus(); }
function showPrematch(){
  const f = MT.f, me = meP(), lines = [];
  if (f.kind === "L"){
    const lg = W.leagues[f.lg], order = sortTab(lg.tab), a = lg.tab[MT.usId], b = lg.tab[MT.themId];
    const pa = order.indexOf(MT.usId) + 1, pb = order.indexOf(MT.themId) + 1;
    if (a && b) lines.push(a[0] ? `${MT.nameUs} sit ${ord(pa)} on ${a[6]} pts. ${MT.nameThem} are ${ord(pb)} (${b[6]} pts · W${b[1]} D${b[2]} L${b[3]}).` : `First game of the ${lg.nm} season. Everything to play for.`);
  } else if (f.kind === "E") lines.push(`European night: ${MT.nameUs} face ${MT.nameThem} in the ${compLabel(f)}. The world is watching — big games build your world reputation.`);
  else if (f.kind === "F") lines.push(`Pre-season. Nothing goes on your record today — but the legs need the work, and the coach is watching.`);
  else if (f.kind === "C"){ const cup = (W.cups || {})[f.cc];
    lines.push(`${cup ? cup.nm : "Cup"} ${cup ? cupRoundName(cup, f.w).toLowerCase() : "tie"}. One game, winner stays in.`); }
  else if (f.wc) lines.push(`World Championship${f.wc === "f" ? " final" : f.wc === "sf" ? " semi-final" : ""}. The whole world is watching this one.`);
  else lines.push(`${NAMES[me.nat].n} call on you. A good game here raises your world reputation.`);
  const d = MT.ourR - MT.oppR;
  lines.push(d > 3 ? `Pundits make ${MT.nameUs} clear favourites.` : d < -3 ? `${MT.nameThem} are the favourites today.` : "Pundits expect a tight one.");
  lines.push({starter:"You're in the starting XI.", rotation:"You start — the manager will look at his bench around the hour.", sub:"You start on the bench. Be ready for the second half.",
    cameo:"You're on the bench. If you get on, it'll be late — the manager needs more from you in training."}[MT.role] || "");
  if (MT.tired > .02) lines.push(`Your legs are heavy (fatigue ${Math.round(S.fatigue)}). Everything will be about ${Math.round(MT.tired*100)}% harder tonight.`);
  const rv = W.players[S.rivalId];
  if (rv && (rv.club === MT.themId)) lines.push(`Your rival ${pname(rv)} is in their line-up. All eyes on the two of you.`);
  lines.push(`Coach: "${pick(["We need your goals today.", "Stay patient, the chances will come.", "Take them on — they're slow at the back.", "Look for the runners. Play simple.", "Enjoy it. You've earned this."])}"`);
  if (S.energy < 35) lines.push(`You're running on empty (energy ${Math.round(S.energy)}). You should have eaten — an Energy-UP at half-time will help.`);
  const crowd = MT.stad.crowd;
  if (MT.nerves > .01) lines.push(`${crowd.toLocaleString("en-GB")} fans. With composure ${S.skillsBase ? S.skillsBase.composure : S.skills.composure}, the nerves will take ${Math.round(MT.nerves*100)}% off your skills today. Work on Composure to handle big nights.`);
  else if (crowd >= 8000) lines.push(`${crowd.toLocaleString("en-GB")} fans — but you're calm. Nerves won't be a problem.`);
  card(`<div class="eyebrow">${esc(compLabel(f))} · ${monthName(S.week)} ${calYear(S.week)}</div>
    <h2>${esc(sideName(f,"h"))} <span class="muted">vs</span> ${esc(sideName(f,"a"))}</h2>
    <div class="muted small">${STADIUM[MT.stad.tier]} · ${pick(["Cold, clear night","Light rain","Warm evening","Windy afternoon","Floodlights on, pitch looks perfect"])} · Crowd ${crowd.toLocaleString("en-GB")}</div>
    <ul class="newslist">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
    <div class="row gap8 center"><button class="btn" onclick="A.kickOff()">Kick off</button></div>`, "prematch");
}
function cardHT(h){ card(h, "ht"); }
function halfTime(){
  const s = MT.stats;
  cardHT(`<div class="eyebrow">Half-time</div><h2>${esc(MT.nameUs)} ${MT.score[0]} – ${MT.score[1]} ${esc(MT.nameThem)}</h2>
    ${statTable(s)}
    <p class="muted small">Half-time is the only time you can drink. Top up before the second half.</p>
    <div class="row gap8 center"><button class="btn sm drink" ${S.inv.drink ? "" : "disabled"} onclick="A.drink('drink',true);halfTime()">Energy-UP ×${S.inv.drink}</button><button class="btn sm drink" ${S.inv.max ? "" : "disabled"} onclick="A.drink('max',true);halfTime()">Energy-UP MAX ×${S.inv.max}</button></div>
    <div class="row gap8 center"><button class="btn" onclick="A.resumeMatch()">Second half</button></div>`);
}
function statTable(s){
  const p = Math.round(MT.poss*100);
  return `<div class="stattable">${[["Possession", p + "%", (100-p) + "%"], ["Shots", s.shots[0], s.shots[1]], ["Corners", s.corners[0], s.corners[1]], ["Yellow cards", s.cards[0], s.cards[1]]]
    .map(([k,a,b]) => `<div><b>${a}</b><span>${k}</span><b>${b}</b></div>`).join("")}</div>`;
}
const MOMENT_TITLE = {run:"On the ball", wing:"Out wide", oneonone:"Through on goal!", edge:"Edge of the box", counter:"Counter-attack!", cross:"Cross it in",
  freekick:"Free kick", penalty:"Penalty!", pass:"Pick a pass", corner:"Corner", throwin:"Throw-in",
  tackle:"Get back and stop him", last:"Last man!", shepherd:"Hold him up", intercept:"Read the pass", aerial:"It's in the air"};
function momentTitle(t){ return MOMENT_TITLE[t] || "Your moment"; }
const DESC = {
  run:"Drag the ball past them and get into the box. Team-mates are around you — get to the box and you choose: shoot, or find one of them.",
  wing:"Take on your full-back and cut in. Watch who's free in the middle.", oneonone:"Defender chasing, keeper rushing out. Finish it — or square it if a team-mate has the easier tap-in.",
  edge:"It's moving — hit it quick, or lay it off to a team-mate in a better spot.",
  counter:"You have space and support. Run at them, then decide: shoot, or play in a runner.",
  cross:"Near post, far post, or the cut-back — pick the man in space and whip it in. You can go for goal from the angle too.", freekick:"Hit the side of the ball to bend it round the wall.", penalty:"Just you and the keeper.",
  pass:"Find the team-mate who's calling for it. Drag back to aim, release, then strike the ball. Bottom of the ball lifts it over defenders. You can press D to shoot instead — but you are building an attack, and the lads won't love a wild one.",
  corner:"Swing it into the box. Strike the side of the ball to bend it in, the bottom to float it to the back post — or curl it straight in yourself.",
  tackle:"Move to stay in front of him and wait for the heavy touch. When the ball leaves his feet, swipe through it — across the ball takes it cleanly, straight through pokes it loose. Catch his legs and it is a foul.",
  last:"There is nobody behind you. Beaten and he is through; a foul here is a red card.",
  shepherd:"You do not have to win it. Force him away from goal and keep him there.",
  intercept:"The pass is on its way. Get into the lane and cut it out before it reaches him.",
  aerial:"Hold to load your legs, let go to jump. Too little and he climbs above you; too early and you come down before it arrives.",
  throwin:"Drag back from yourself, not the ball — it is in your hands. No boot on it, so no bend and only so far you can throw it. Pick the man in space and get the weight right."
};
function showPre(e){
  const help = MT.firstMoment ? "" : `<p class="muted small">Dribble: hold and drag where the ball should go. Shoot or pass: drag back from the ball, release, then click where your boot hits the ball. When options appear, press 1–4 or click one.</p>`;
  MT.firstMoment = true;
  card(`<div class="eyebrow">${esc(MT.label)}</div><h2>${esc(momentTitle(e.type))}</h2><p>${esc(DESC[e.type] || "")}</p>${help}<button class="btn" onclick="A.playMoment()">Play</button>`);
}
// a pass you played this moment: the attempt, and the completion if it found its man (whatever happened next)
function notePass(){
  const my = MT.my;
  if (M.isPass && !M.passCounted){ my.passAtt++; M.passCounted = true; }
  if (M.passDone && !M.passLogged){
    M.passLogged = true;
    const long = M.passDone.len >= 22; if (long) my.lpass++; else my.spass++;
    say(`${S.player.name} finds ${esc(M.passDone.name)} — ${long ? "lovely long ball" : "crisp pass"}.`);
  }
}
function momentOver(){
  const my = MT.my, r = M.result, ai = M.ai;
  // only a ball you struck at goal is your shot: a pass you played, or one a team-mate hit, is not
  const sh = M.shot && (M.myShot || M.shooting) ? M.shot : null;
  my.dribbles += M.dribbles;
  // skill experience for what you just did
  if (M.dribbles) skillXP("dribbling", 14*M.dribbles);
  if (M.sprintT) skillXP("pace", Math.min(20, M.sprintT*1.6));
  if (M.isPass && !M.gaveBack && !M.shooting){
    if (M.passTo){ skillXP("passing", 6 + Math.min(8, M.passLen*.2)); skillXP("passacc", 6 + Math.min(8, M.passLen*.2)); }
    if (r === "goal"){ skillXP("passing", 14); skillXP("passacc", 10); }
  } else if (sh){
    if (M.passDone) skillXP("passing", 9 + Math.min(10, M.passDone.len*.25));
    skillXP("power", 4 + Math.min(9, sh.dist*.3)); skillXP("accuracy", r === "goal" || r === "saved" ? 7 : 2);
    if (sh.curl) skillXP("curve", r === "goal" ? 20 : 9);
    if (sh.dist >= 20) skillXP("aero", r === "goal" ? 16 : 6);
    if (r === "goal") skillXP("accuracy", 10);
  }
  let title = "", text = M.resultText, hl = null;
  // defending: winning it, being beaten, or giving one away
  if (r === "tackleWin" || r === "beaten" || r === "foul"){
    const air = M.type === "aerial", read = M.type === "intercept", o = M.defOut || "";
    let line;
    if (r === "tackleWin"){
      title = air ? "WON THE HEADER" : read ? "READ IT" : o === "shepherd" ? "HELD HIM UP" : "WON THE BALL";
      line = air ? "Won the header and cleared it" : read ? "Read the pass: interception" : o === "shepherd" ? "Shepherded him away from goal"
        : o === "poke" ? "Poked it clear with a tackle" : "Won the ball with a tackle";
    } else if (r === "beaten"){
      my.beaten++; title = "BEATEN";
      line = air ? "Beaten in the air" : read ? "Too late to cut out the pass" : M.defend === "last" ? "Beaten as the last man" : "Beaten one-on-one";
    } else {
      title = o === "red" ? "SENT OFF" : o === "yellow" || o === "pen" ? "BOOKED" : "FOUL";
      line = o === "red" ? "Sent off for a last-man foul" : o === "pen" ? "Booked, and a penalty given away" : o === "yellow" ? "Booked for a foul" : "Gave away a free kick";
    }
    const ic = r === "tackleWin" ? "🛡" : r === "foul" ? (o === "red" ? "🟥" : o === "fk" ? "⚠" : "🟨") : "⚠";
    hl = {icon:ic, kind:r, text:line};
  }
  const mate = ai ? W.players[ai.mate.pid] : null;
  notePass();
  if (M.deflectTo && ai){
    // your shot cannoned off a defender into a team-mate's path; what happened next is his
    my.shots++;
    if (r === "goal"){ MT.score[0]++; MT.usGoals.push({s:mate.id, a:-1}); title = "GOAL!"; text = `Your shot cannons off a defender and ${sname(mate)} buries the loose ball.`;
      say(`GOAL! ${sname(mate)} pounces after ${S.player.name}'s shot is blocked. ${scoreText()}`, "goal"); hl = {icon:"⚽", kind:"assist", text:`Blocked shot falls to ${sname(mate)} — he scores`}; }
    else { title = "Blocked"; text = `Your shot is blocked and runs to ${sname(mate)}. ${{saved:"His effort is saved.", miss:"He drags it wide.", blocked:"Blocked again.", aiLost:M.resultText}[r] || "The chance goes."}`;
      hl = {icon:"✖", kind:"shot", text:`Shot from ${Math.round(sh ? sh.dist : 0)}m · blocked, ${sname(mate)} followed up`}; }
  } else if (M.isPass && !M.gaveBack && !M.shooting){
    if (M.passTo){
      // the pass arrived; what happened next is your team-mate's run and shot
      const long = M.passLen >= 22, t = M.passTo;
      if (r === "goal"){
        const fin = M.shot ? M.shot.dist : Math.hypot(M.ball.x - 34, M.ball.y);     // where he hit it from
        my.assists++; MT.score[0]++; MT.usGoals.push({s:mate.id, a:S.meId});
        title = "ASSIST!"; text = `${sname(mate)} drives on and finishes from ${Math.round(fin)}m. What a ball from ${S.player.name}!`;
        say(`GOAL! ${sname(mate)} scores — assisted by ${S.player.name}. ${scoreText()}`, "goal");
        hl = {icon:"🅰", kind:"assist", text:`Assist · pass to ${t.role} ${sname(mate)} · ${Math.round(M.passLen)}m ball, finished from ${Math.round(fin)}m`};
      } else {
        title = long ? "Great long ball" : "Pass completed";
        const end = {saved:`${sname(mate)}'s shot is saved.`, miss:`${sname(mate)} drags it wide.`, post:`${sname(mate)} hits the post!`, bar:`${sname(mate)} rattles the bar!`, blocked:`${sname(mate)}'s shot is blocked.`, aiLost:M.resultText}[r] || `${sname(mate)} keeps the move alive.`;
        text = `You found ${sname(mate)} (${t.role}). ${end}`;
        hl = {icon:"➜", kind:"pass", text:`${long ? "Long pass" : "Pass"} to ${t.role} ${sname(mate)} · ${Math.round(M.passLen)}m · ${end}`};
      }
    } else if (r === "outplay"){
      title = "Out of play"; my.lost++;
      say(`${S.player.name} overhits it and the ball runs out of play.`);
      hl = {icon:"⇢", kind:"lost", text:"Pass ran out of play"};
    } else { title = "Intercepted"; my.lost++; say(`${S.player.name}'s pass is cut out.`); hl = {icon:"✖", kind:"lost", text:"Pass intercepted"}; }
  } else if (sh){
    my.shots += Math.max(1, M.shotCount || 1);         // a rebound off the frame means you had more than one go
    if (r === "goal" || r === "saved") my.onTarget++;
    const wood = M.woodwork ? (M.woodwork > 1 ? " · off the woodwork twice" : (sh.frame === "bar" || M.lastFrame === "bar" ? " · after hitting the bar" : " · after hitting the post")) : "";
    if (r === "goal"){
      my.goals++; MT.score[0]++; MT.usGoals.push({s:S.meId, a:-1}); title = "GOAL!";
      const d = Math.round(sh.dist); if (d >= 20) my.long++; if (sh.fk) my.fk++; if (sh.pen) my.pen++; if (sh.curl) my.curl++;
      say(`GOAL! ${S.player.name} ${M.gaveBack ? `— one-two with ${esc(M.gaveBack.name)}, finished from ${d}m` : sh.pen ? "from the spot" : sh.fk ? `— free kick from ${d}m` : `from ${d}m`}${M.woodwork ? ", following in his own rebound" : ""}! ${scoreText()}`, "goal");
      if (typeof noteGoal === "function") noteGoal(sh, M.gaveBack, M.lastFrame, MT.nameThem, MT.minute);
      hl = {icon:"⚽", kind:"goal", text:`Goal · ${d}m${sh.pen ? " · penalty" : sh.fk ? " · free kick" : ""}${sh.curl ? " · curled" : ""}${wood}${M.gaveBack ? ` · one-two with ${M.gaveBack.role} ${esc(M.gaveBack.name)}` : ""}`};
    } else {
      my.misses++; title = {saved:"Saved", miss:(M.shotEval && M.shotEval.margin > 4 ? "Off target" : "Missed"), post:"Off the post!", bar:"Crossbar!", blocked:"Blocked", corner:"Corner"}[r] || (M.woodwork ? "Off the woodwork!" : "Chance gone");
      if (r === "corner") my.onTarget += (M.shotEval && M.shotEval.saveQ != null) ? 1 : 0;
      say(`${S.player.name}: ${M.resultText}`);
      hl = {icon:r === "saved" ? "🧤" : "✖", kind:"shot", text:`Shot from ${Math.round(sh.dist)}m · ${title.toLowerCase()}${wood}${M.gaveBack ? ` · after a one-two with ${esc(M.gaveBack.name)}` : ""}`};
    }
  } else if (M.gaveBack){
    // he gave it back and it went no further: the one-two broke down before you could get a shot away
    my.lost++; title = "Lost it";
    say(`${esc(M.gaveBack.name)} plays it back to ${S.player.name}, but the one-two breaks down.`);
    hl = {icon:"✖", kind:"lost", text:`One-two with ${M.gaveBack.role} ${esc(M.gaveBack.name)} broke down`};
  } else { if (r === "lost") my.lost++; title = "Lost it"; say(`${S.player.name} loses the ball.`); }
  if (M.injury){ meP().inj = M.injury; title = "Injured"; text += ` You're hurt and have to come off — out for about ${M.injury} week${M.injury > 1 ? "s" : ""}.`; MT.events = MT.events.filter((e, i) => i <= MT.i || e.kind !== "moment"); say(`${S.player.name} goes down injured and is replaced.`, "bad"); }
  const stamF = staminaF();
  S.energy = Math.max(0, S.energy - (5 + M.sprintT*1.1)*stamF);
  // what the dressing room made of it
  const j = typeof judgeMoment === "function" ? judgeMoment() : null;
  // deflected behind: the corner is yours to take
  if (r === "corner" && !(MT.events[MT.i] && MT.events[MT.i].chained) && MT.events.filter((e, i) => i > MT.i && e.kind === "moment").length < 6 && !(M.type === "corner"))
    MT.events.splice(MT.i + 1, 0, {min:MT.minute, kind:"moment", type:"corner", chained:true});
  updateBoard(); updateMatchHUD();
  NEED_DRAW = true;
  // the team's numbers on the full-time card include what happened in your moments, not only the simulated play
  if (MT.stats){
    const st = MT.stats, aiShot = !!(M.shot && M.shot.ai) && ["goal", "saved", "miss", "post", "bar", "blocked", "corner"].includes(r);
    st.shots[0] += (M.deflectTo && ai ? 1 : sh ? Math.max(1, M.shotCount || 1) : 0) + (aiShot ? 1 : 0);
    if (r === "corner") st.corners[0]++;
    if (r === "foul" && (M.defOut === "yellow" || M.defOut === "pen")) st.cards[0]++;            // the card row counts yellows
  }
  const scored = r === "goal";
  if (hl) MT.highlights.push(Object.assign({min:MT.minute, rec:M.rec}, hl));
  const rec = M.rec, label = hl ? hl.text : "";
  const chemLine = j && (j.chem || j.say) ? `<div class="judge ${j.chem > 0 ? "good" : j.chem < 0 ? "bad" : ""}">${j.say ? `<span>${esc(j.say)}</span>` : ""}${j.chem ? `<b>Team Chemistry ${j.chem > 0 ? "+" : "−"}${Math.abs(j.chem).toFixed(1)}</b>` : ""}</div>` : "";
  const show = () => card(`<h2 class="${scored ? "gold" : ""}">${title}</h2><p>${esc(text)}</p>${chemLine}<button class="btn" onclick="A.contMoment()">Continue</button>`);
  M = null;
  if (scored) startReplay(rec, {label}, show); else show();
}
// which reputation band a fixture belongs to
function repTier(f){
  if (f.kind === "F") return "F";
  if (f.kind === "C") return "C";
  if (f.kind === "E") return f.comp === "EL" ? "EL" : "CL";
  if (f.kind === "N") return f.wc ? "WC" : "N";
  return "L";
}
// The 2D match's rating of the player (the counters of its moments): the formula finishMatch has always used
function legacyRating(M){
  const my = M.my, [us, th] = M.score, res = us > th ? "W" : us < th ? "L" : "D";
  // marked for the job you were given: a defender is judged on keeping them out and using the ball,
  // a striker on what he did in front of goal
  const W_ = {ST:{g:1.15, a:.8,  d:.25, p:.10, cs:0},
              W: {g:1.10, a:.95, d:.30, p:.11, cs:0},
              AM:{g:1.00, a:1.05,d:.26, p:.14, cs:.1},
              CM:{g:1.00, a:1.05,d:.22, p:.18, cs:.3},
              DF:{g:1.25, a:1.00,d:.18, p:.20, cs:.7}}[S.player.pos] || {g:1.1, a:.8, d:.25, p:.12, cs:0};
  const conceded = M.score[1];
  let rating = 6 + my.goals*W_.g + my.assists*W_.a + my.dribbles*W_.d + my.onTarget*.15
    + (my.tackles || 0)*(S.player.pos === "DF" ? .42 : S.player.pos === "CM" ? .34 : .22)
    + (my.headers || 0)*.16 - (my.beaten || 0)*.22 - (my.fouls || 0)*.14 - (M.sentOff ? 1.4 : 0) - (my.cards || 0)*.25
    + (my.spass + my.lpass)*W_.p - my.lost*.2 - my.misses*.12*(W_.cs ? .5 : 1)
    + (res === "W" ? .3 : res === "L" ? -.2 : 0)
    + W_.cs*(conceded === 0 ? 1 : conceded === 1 ? .2 : -conceded*.35);
  if (M.role === "sub") rating = 6 + (rating - 6)*.9;
  return +clamp(rating, 3, 10).toFixed(1);
}
function finishMatch(){
  clearTimeout(MT.timer); MT.running = false;
  if (typeof matchSkillsOff === "function") matchSkillsOff();
  const f = MT.f, rating = legacyRating(MT);
  // register with the world: both line-ups, goals, ratings, table
  const hx = MT.home ? MT.usXI : MT.themXI, ax = MT.home ? MT.themXI : MT.usXI;
  const hG = MT.home ? MT.usGoals : MT.themGoals, aG = MT.home ? MT.themGoals : MT.usGoals;
  const out = finaliseMatch(f, hx, ax, hG, aG, {[S.meId]:rating});
  const R = matchRewards(MT, rating, out);
  MT.label = "FT"; updateBoard();
  // results around the league
  const around = f.kind === "L" ? fixturesAt(S.week).filter(x => x.kind === "L" && x.lg === f.lg && x.key !== f.key) : [];
  for (const x of around) simFixture(x);
  R.around = around.map(x => { const d = W.done[x.key]; return d ? {h:W.clubs[x.h].nm, a:W.clubs[x.a].nm, hg:d.hg, ag:d.ag} : null; }).filter(Boolean);
  MT.ftCard = () => card(`${ftCardHTML(MT, R)}
    <div class="row gap8 center">${R.motm ? `<button class="btn ghost" onclick="openSheet('press')">🎙 Talk to the press</button>` : ""}<button class="btn" onclick="A.leaveMatch()">Continue</button></div>`, "ft");
  MT.ftCard();
  MT.holdToasts = false;
  setTimeout(() => odoRun($("#ov")), 260);      // let the card settle, then roll the numbers
}

/* The career's side of full time (DESIGN 3.4.5), for the 3D match (bridge.finish), the 2D match and a match played
   out from the hub alike: the big-game composure, bonuses, reputation at home and in the world, XP, the manager's
   trust, the career and season records, the ladders and milestones, the last match, how tired the legs are tomorrow,
   and what playing together did for the group. M: the MT of the match (score, my counters, role, MT.on minutes);
   rating: the player's rating; out: finaliseMatch's result (the man of the match). A friendly is a look, not a
   verdict: no bonuses, nothing on the career or season record, no rating in the form guide. Returns what it gave. */
function matchRewards(M, rating, out){
  M = M || MT;
  M.holdToasts = true;          // the full-time card is coming: what full time toasts waits until you leave (ui/main.js)
  const R = {rating, composure:0};
  if (M.stad && M.stad.crowd >= 8000 && Math.random() < .35 && S.skills.composure < 99){ S.skills.composure++; R.composure = 1; toast("Big-game experience: Composure +1", "good"); }
  const my = M.my, [us, th] = M.score, res = us > th ? "W" : us < th ? "L" : "D", f = M.f, me = meP(), friendly = f.kind === "F";
  const motm = !!out && out.motm === S.meId;
  R.res = res; R.motm = motm; R.motmId = out ? out.motm : -1;
  // money: the contract's bonuses, never for a friendly or for your country
  const k = S.contract; let bonus = 0;
  if (k && f.kind !== "N" && !friendly){ bonus = my.goals*k.bG + my.assists*k.bA + k.bApp + (res === "W" ? k.bW : 0); S.money += bonus; }
  R.bonus = bonus;
  // reputation
  const tier = repTier(f), TR = COMP_REP[tier] || COMP_REP.L;
  const cRep = f.kind === "N" ? 3000 : W.clubs[M.usId].rep;
  // what the performance was worth before the competition is taken into account
  let raw = (rating - 6.3)*3 + my.goals*4 + my.assists*3 + (motm ? 5 : 0);
  if (rating >= 8.5) raw += (rating - 8.5)*6;               // a standout display is worth more again
  raw = Math.max(-4, raw)*(.5 + cRep/800);
  const swing = rnd(.85, 1.2);                              // two identical games never pay the same
  let gain = raw > 0 ? raw*TR.base*swing : raw*TR.base*TR.bad*swing;   // a bad night in Europe hurts twice as much
  const abroad = f.kind === "L" && W.clubs[M.usId].cc !== {RO:"ROU", EN:"ENG", ES:"ESP", DE:"GER", IT:"ITA", FR:"FRA"}[S.player.nat];
  const wRate = TR.world*(abroad ? 4 : 1);
  let wGain = raw > 0 ? raw*wRate*swing : raw*wRate*swing;  // the world only ever marks you down at the normal rate
  const repWas = me.rep, wrepWas = me.wrep;                 // kept so the full-time card can roll them up
  me.rep = Math.max(0, Math.round(me.rep + (gain > 0 ? gain*styleMul() : gain)));
  me.wrep = Math.max(0, Math.round(me.wrep + (wGain > 0 ? wGain*styleMul() : wGain)));
  R.rep = me.rep; R.repD = me.rep - repWas; R.wrep = me.wrep; R.wrepD = me.wrep - wrepWas; R.repName = TR.nm;
  if (f.kind === "N") addNews("intl", `${S.player.name} wins a cap for ${NAMES[me.nat].n}`, `${sideName(f,"h")} ${M.home ? us : th}–${M.home ? th : us} ${sideName(f,"a")}. Rated ${rating}.`, "me");
  // XP, trust, personal stats
  const xp = Math.max(10, 25 + my.goals*30 + my.assists*22 + my.dribbles*6 + (my.spass + my.lpass)*4 + (rating - 6)*20); addXP(xp);
  R.xp = xp;
  // a pre-season friendly is a look, not a verdict: the manager notices, but less
  const trustWas = S.trust, dT = (rating - 6.5)*8*(friendly ? .5 : 1);
  trustAdd(dT);
  R.trustD = S.trust - trustWas;
  if (!friendly){
    for (const st of [S.careerMy, S.seasonMy]){
      st.apps++; st.goals += my.goals; st.assists += my.assists; st.longGoals += my.long; st.fkGoals += my.fk; st.curlGoals += my.curl; st.penGoals += my.pen;
      st.dribbles += my.dribbles; st.spass += my.spass; st.lpass += my.lpass; st.passAtt += my.passAtt; st.shots += my.shots; st.onTarget += my.onTarget;
      st.lost += my.lost; st.ratingSum += rating; if (res === "W") st.wins++; if (motm) st.motm++;
    }
    S.ratings.push(rating); S.ratings = S.ratings.slice(-60);
  }
  if (typeof checkLadder === "function"){
    const c = S.careerMy;
    checkLadder("g", c.goals, "career goal", "⚽", n => n === 1 ? "The first of many, hopefully." : `${fmt(n)} goals. That is a career.`);
    checkLadder("a", c.assists, "career assist", "🎯", n => n === 1 ? "The first goal you made for somebody else." : `${fmt(n)} times you were the last pass.`);
    checkLadder("ap", c.apps, "appearance", "👕", n => n === 1 ? "Your debut." : `${fmt(n)} games in the shirt.`);
    checkLadder("mo", c.motm, "man of the match award", "🌟", n => n === 1 ? "The first time you were the best man on the pitch." : `${fmt(n)} times the best man on the pitch.`);
  }
  if (typeof checkMilestones === "function"){
    if (my.goals >= 3) firstTime("hat", "🎩", "Your first hat-trick", "Three in one game. You keep the ball.");
    if (f.kind === "N") firstTime("cap", "🎽", "Your first cap", "You played for your country.");
    if (f.kind === "E" && my.goals > 0) firstTime("eur", "🌍", "Your first European goal", "Scored on the biggest stage in club football.");
    checkMilestones();
  }
  S.lastMatch = {gw:gw(), rating, goals:my.goals, assists:my.assists, res, opp:M.nameThem, score:`${us}–${th}`, motm};
  // the legs pay for it (1.5.2): the minutes on the pitch and how hard they worked, tomorrow's fatigue
  const mins = minutesOn(M);
  const drain = M.drainPerMin != null ? M.drainPerMin : WR.drain[S.workrate || 2];
  const intensity = clamp(drain/.56, 0, 1);
  const fatigue = mins > 0 ? Math.round(8 + 24*(mins/90)*(.7 + .6*intensity)) : 0;
  A._matchFatigue = fatigue;
  R.mins = mins; R.fatigue = fatigue;
  // playing together builds the group; a good night more so
  if (mins > 0 && typeof chemAdd === "function"){ const g = (.6 + (res === "W" ? .6 : 0) + (rating >= 7.5 ? .5 : 0))*(1 - (S.chem || 0)/140); chemAdd(g); M.chemD = (M.chemD || 0) + g; }
  R.chemD = M.chemD || 0;
  socialEvent("match", `${M.nameUs} ${us}–${th} ${M.nameThem}`);
  if (motm) addNews("you", `${S.player.name} named man of the match`, `${M.nameUs} ${us}–${th} ${M.nameThem}. Rated ${rating}.`, "me");
  else if (my.goals >= 2) addNews("you", `${my.goals >= 3 ? "Hat-trick" : "Brace"} for ${S.player.name}!`, `${M.nameUs} ${us}–${th} ${M.nameThem}.`, "me");
  save();
  return R;
}
// the player's match minutes: from MT.on (pairs of match minutes) when every interval has closed, else as the 2D match
// counts them (a starter the whole game, a substitute from when he came on, a rotation player until he went off)
function minutesOn(M){
  if (Array.isArray(M.on) && M.on.length && M.on.every(iv => iv && iv[1] != null)) return clamp(M.on.reduce((s, iv) => s + Math.max(0, iv[1] - iv[0]), 0), 0, 90);
  return M.role === "starter" ? 90 : M.subbedOff ? M.subbedOff : M.cameOn ? 90 - M.cameOn : 0;
}

/* ---------- cards and suspensions ---------- */
// a booking for the player, and what it costs him (moved from defend.js): a red is two matches and the manager's
// trust, five yellows in a season is one match
function bookPlayer(kind){
  if (!kind) return false;
  S.cards = S.cards || {y:0, r:0, run:0};
  if (kind === "red"){
    S.cards.r++; S.cards.run = 0;
    S.ban = (S.ban || 0) + 2;
    trustAdd(-10);
    if (MT) MT.sentOff = true;
    addNews("you", `${S.player.name} sent off`, `A red card${myClub() ? ` for ${myClub().nm}` : ""}. Two matches out.`, "me");
    return true;
  }
  S.cards.y++; S.cards.run++;
  if (MT) MT.my.cards = (MT.my.cards || 0) + 1;
  if (S.cards.run >= 5){                           // five bookings and you sit one out
    S.cards.run = 0; S.ban = (S.ban || 0) + 1;
    addNews("you", `${S.player.name} suspended`, "A fifth booking of the season. One match out.", "me");
  }
  return true;
}

/* ---------- the cards at half time and full time ---------- */
// the stat rows of a card: us on the left
function matchStatRows(M){
  const s = M.stats || {}, p = s.possession ? s.possession[0] : M.poss != null ? Math.round(M.poss*100) : null;
  const rows = [];
  if (p != null) rows.push(["Possession", p + "%", (100 - p) + "%"]);
  if (s.shots) rows.push(["Shots", s.shots[0], s.shots[1]]);
  if (s.onTarget) rows.push(["On target", s.onTarget[0], s.onTarget[1]]);
  if (s.corners) rows.push(["Corners", s.corners[0], s.corners[1]]);
  if (s.fouls) rows.push(["Fouls", s.fouls[0], s.fouls[1]]);
  if (s.cards) rows.push(["Cards", s.cards[0], s.cards[1]]);
  return `<div class="stattable">${rows.map(([k, a, b]) => `<div><b>${a}</b><span>${k}</span><b>${b}</b></div>`).join("")}</div>`;
}
// who scored, as the card lists them
function scorerLine(list){
  const by = new Map();
  for (const g of list || []){
    const p = g.s >= 0 ? W.players[g.s] : null, nm = p ? sname(p) : "Own goal";
    by.set(nm, (by.get(nm) || []).concat([g.min != null ? g.min + "'" : ""]));
  }
  return Array.from(by).map(([nm, mins]) => `${esc(nm)} ${mins.filter(Boolean).join(", ")}`.trim()).join(" · ");
}
// The full-time card (DESIGN 3.4.3): the score and the scorers, the player's rating and numbers, XP, trust and
// chemistry changes, reputation, the stats, the highlights (the 3D match's clips carry data-clip; the 2D match's
// moments their replay). R: matchRewards' result (plus around: the league's other results). Buttons are the caller's.
function ftCardHTML(M, R){
  const f = M.f, [us, th] = M.score, my = M.my, me = meP(), rating = R.rating;
  const h = M.home ? us : th, a = M.home ? th : us;
  const hGoals = M.home ? M.usGoals : M.themGoals, aGoals = M.home ? M.themGoals : M.usGoals;
  const mo = R.motmId != null && R.motmId >= 0 ? W.players[R.motmId] : null;
  const chem = R.chemD || 0, trust = R.trustD || 0;
  const hl = (M.highlightsFP && M.highlightsFP.length) ? M.highlightsFP.map((x, i) => `<div class="hl-row ${x.kind}"><span class="hl-ico">${x.icon}</span><span class="hl-min">${x.min}'</span><span class="grow">${esc(x.text)}</span><button class="btn sm ghost" data-clip="${i}">▶ Replay</button></div>`)
    : (M.highlights || []).map((x, i) => `<div class="hl-row ${x.kind}"><span class="hl-ico">${x.icon}</span><span class="hl-min">${x.min}'</span><span class="grow">${esc(x.text)}</span>${x.rec && x.rec.length > 6 ? `<button class="btn sm ghost" onclick="A.playHighlight(${i})">▶ Replay</button>` : ""}</div>`);
  const around = (R.around || []).map(x => `<div class="res"><span>${esc(x.h)}</span><b>${x.hg}–${x.ag}</b><span>${esc(x.a)}</span></div>`).join("");
  const sc = [scorerLine(hGoals), scorerLine(aGoals)];
  return `<div class="eyebrow">Full time · ${esc(compLabel(f))}</div>
    <h2>${esc(sideName(f,"h"))} ${h} – ${a} ${esc(sideName(f,"a"))}</h2>
    ${sc[0] || sc[1] ? `<div class="muted small ft-scorers"><span>${sc[0]}</span><span>${sc[1]}</span></div>` : ""}
    <div class="ft-grid"><div class="ft-rating ${rating >= 7.5 ? "hi" : rating < 6 ? "lo" : ""}"><b>${rating}</b><span>Your rating</span></div>
      <div class="ft-list"><div>${my.goals} goals · ${my.assists} assists</div><div>${my.dribbles} dribbles · ${my.spass + my.lpass}/${my.passAtt} passes</div><div>${my.onTarget}/${my.shots} shots on target</div>
      ${mo ? `<div>Man of the match: <b>${esc(pname(mo))}</b></div>` : ""}<div class="gold">+${Math.round(R.xp || 0)} XP${R.bonus ? ` · +${eur(R.bonus)} bonuses` : ""}</div>
      ${chem ? `<div class="${chem > 0 ? "good" : "bad"}">Team Chemistry ${chem > 0 ? "+" : "−"}${Math.abs(chem).toFixed(1)}</div>` : ""}
      ${trust ? `<div class="${trust > 0 ? "good" : "bad"}">The manager's trust ${trust > 0 ? "+" : "−"}${Math.abs(trust).toFixed(1)}</div>` : ""}</div></div>
    <div class="odo-wrap">${odoHTML(R.rep != null ? R.rep : me.rep, R.repD || 0, `Reputation · ${R.repName || ""}`)}${R.wrepD ? odoHTML(R.wrep, R.wrepD, "World reputation") : ""}</div>
    ${matchStatRows(M)}
    ${hl.length ? `<div class="eyebrow" style="margin-top:12px">Your highlights</div><div class="hlist">${hl.slice(0, 6).join("")}</div>` : ""}
    ${around ? `<div class="eyebrow" style="margin-top:12px">Around the league</div><div class="around">${around}</div>` : ""}`;
}
// The half-time card (DESIGN 3.4.3): the score, the stats so far, the manager's word by the player's rating so far
// (opts.rating), a word on his shape when he drifted (opts.drift), and the drinks he has with him (opts.drinks:
// [{id, name, n}], each a button with data-drink). The "Second half" button is the caller's.
function htCardHTML(M, opts = {}){
  const r = opts.rating, drinks = opts.drinks || [];
  const word = r == null ? "" : r >= 7 ? "Good half. Keep doing what you're doing." : r >= 6 ? "It's there for us. Sharpen up." : "Not good enough. I need more from you.";
  return `<div class="eyebrow">Half time</div><h2>${esc(M.nameUs)} ${M.score[0]} – ${M.score[1]} ${esc(M.nameThem)}</h2>
    ${matchStatRows(M)}
    ${word ? `<p class="ht-word">Manager: "${esc(word)}"</p>` : ""}
    ${opts.drift ? `<p class="ht-word">"Stay in your shape. You were drifting out of position."</p>` : ""}
    ${drinks.length ? `<p class="muted small">Half time is the only time you can drink. Top up before the second half.</p>
      <div class="row gap8 center">${drinks.map(d => `<button class="btn sm drink" data-drink="${esc(d.id)}" ${d.n > 0 ? "" : "disabled"}>${esc(d.name)} ×${d.n}</button>`).join("")}</div>` : ""}`;
}

/* ---------- a match played out for you (DESIGN 3.4.6) ---------- */
// From the hub without the 3D world: the world's own fixture simulation decides the score and the scorers, the
// player is rated by the world's own rating formula (finaliseMatch), and matchRewards applies. Returns its result.
const QUICK_NOTE = "This match was played out for you. Full matches need the 3D world: open the game from a web address in a browser with WebGL2.";
function quickMatch(f){
  matchSetup(f);
  const role = MT.role, playing = role === "starter" || role === "rotation";
  const hx = MT.home ? MT.usXI : MT.themXI, ax = MT.home ? MT.themXI : MT.usXI;
  const [hg, ag] = goalsFor(strength(hx), strength(ax), f.kind !== "N");
  // a substitute's minutes are few: the world's scorers come from the men who started
  const hG = pickScorers(hx, hg, p => p.me && !playing), aG = pickScorers(ax, ag, p => p.me && !playing);
  MT.usGoals = MT.home ? hG : aG; MT.themGoals = MT.home ? aG : hG;
  MT.score = [MT.usGoals.length, MT.themGoals.length];
  MT.on = role === "starter" ? [[0, 90]] : role === "rotation" ? [[0, MT.subOff]] : [[MT.subOn, 90]];
  MT.my.goals = MT.usGoals.filter(g => g.s === S.meId).length;
  MT.my.assists = MT.usGoals.filter(g => g.a === S.meId).length;
  MT.minute = 90; MT.label = "FT";
  const out = finaliseMatch(f, hx, ax, hG, aG);
  const rating = out.rt[S.meId] != null ? out.rt[S.meId] : 6;
  const R = matchRewards(MT, rating, out);
  R.notice = QUICK_NOTE;
  MT.holdToasts = false;
  if (typeof toast === "function") toast(QUICK_NOTE);
  return R;
}
