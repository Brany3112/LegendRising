"use strict";
/* ============ FORM STRIP, MEDIA DUTY, AND THE MANAGER'S OFFICE ============ */

/* ---------- form and fitness ---------- */
// the last five ratings, freshest on the right, plus how sharp and how trusted you are
function formPips(n){
  const r = S.ratings.slice(-(n || 5));
  if (!r.length) return `<span class="fp-none">No matches yet</span>`;
  return r.map(v => {
    const c = v >= 7.5 ? "hi" : v >= 6.8 ? "ok" : v >= 6 ? "mid" : "lo";
    return `<i class="fp ${c}" title="Rated ${v.toFixed(1)}">${v.toFixed(1)}</i>`;
  }).join("");
}
// sharpness: match fitness, built by playing and lost by sitting out
function sharpness(){
  const played = S.ratings.length;
  if (!played) return 0;
  const idle = clamp(gw() - (S.lastMatch ? S.lastMatch.gw : gw()), 0, 8);
  const base = 40 + clamp(played, 0, 12)*5;
  return Math.round(clamp(base - idle*9 + (recentAvg() - 6.3)*14, 0, 100));
}
function trustLabel(){
  const t = S.trust;
  return t >= 45 ? "Untouchable" : t >= 25 ? "Trusted" : t >= 8 ? "In the plans" : t >= -8 ? "On trial" : "Out of favour";
}
function formStrip(){
  const sh = sharpness(), tr = clamp((S.trust + 30)/110*100, 0, 100);
  return `<div class="form-strip">
    <div class="fs-row"><span>Form</span><div class="fp-row">${formPips(5)}</div></div>
    <div class="fs-row"><span>Sharpness</span><div class="meter thin"><i style="width:${sh}%"></i></div><b>${sh}</b></div>
    <div class="fs-row"><span>Manager</span><div class="meter thin trust"><i style="width:${tr}%"></i></div><b class="tl">${trustLabel()}</b></div>
  </div>`;
}

/* ---------- media duty ---------- */
const MEDIA_COST = 6;
// a question that fits the week you have just had
function mediaPrompt(){
  const lm = S.lastMatch, c = myClub();
  if (lm && lm.motm) return {q:`You were man of the match against ${lm.opp}. Is this the level you expect of yourself now?`, k:"good"};
  if (lm && lm.rating >= 7.5) return {q:`${lm.rating.toFixed(1)} against ${lm.opp}. What is behind the run you are on?`, k:"good"};
  if (lm && lm.rating < 5.8) return {q:`A quiet afternoon against ${lm.opp}. What went wrong out there?`, k:"bad"};
  if (S.trust < 0) return {q:`You have not started for a while. Are you happy at ${c ? c.nm : "the club"}?`, k:"bad"};
  return {q:`Plenty of people are watching you at ${c ? c.nm : "the club"}. Where do you want this to go?`, k:"neutral"};
}
// each answer trades reputation against the manager's patience
const MEDIA_LINES = {
  good:[
    {t:"Credit the team", rep:.7, trust:6, risk:0, say:"The lads made it easy for me. I just finished what they built."},
    {t:"Back yourself", rep:1.25, trust:1, risk:.12, say:"I have worked for this. I expect to do it every week now."},
    {t:"Call yourself the best", rep:1.9, trust:-9, risk:.4, say:"Nobody in this league can live with me. Simple as that."}],
  bad:[
    {t:"Take it on the chin", rep:.5, trust:8, risk:0, say:"That one is on me. I will be better on Saturday."},
    {t:"Point at the plan", rep:.9, trust:-4, risk:.2, say:"I can only play what is in front of me. Ask the staff about the shape."},
    {t:"Blame the referee", rep:1.4, trust:-12, risk:.45, say:"We were not beaten out there. We were refereed out of it."}],
  neutral:[
    {t:"Keep it humble", rep:.6, trust:5, risk:0, say:"One game at a time. I am still learning my trade here."},
    {t:"Say you want more", rep:1.2, trust:0, risk:.12, say:"I did not come this far to sit still. I want the biggest stage there is."},
    {t:"Flirt with a move", rep:1.8, trust:-14, risk:.35, say:"You never know in football. If a big club came in, who would say no?"}]
};
function mediaSheet(){
  const p = mediaPrompt(), lines = MEDIA_LINES[p.k], can = S.actions > 0 && S.energy >= MEDIA_COST;
  return `<h2>Media duty</h2>
    <p class="muted">A reporter is waiting after training. What you say moves your reputation — and what the manager thinks of you.</p>
    <blockquote class="mq">${esc(p.q)}</blockquote>
    <div class="stack">${lines.map((l, i) => `<button class="opt media" ${can ? "" : "disabled"} onclick="A.media('${p.k}',${i})">
      <b>${esc(l.t)}</b><span class="muted small">“${esc(l.say)}”</span>
      <span class="row gap6 wrap"><span class="pill">Reputation ${l.rep >= 1.5 ? "＋＋＋" : l.rep >= 1 ? "＋＋" : "＋"}</span>
        <span class="pill ${l.trust > 0 ? "good" : l.trust < -6 ? "bad" : ""}">Manager ${l.trust > 0 ? "+" : ""}${l.trust}</span>
        ${l.risk ? `<span class="pill bad">${Math.round(l.risk*100)}% it backfires</span>` : ""}</span></button>`).join("")}</div>
    <p class="muted small">${can ? `Costs ${MEDIA_COST} energy and one action.` : S.actions ? "Too tired to face the cameras." : "No actions left this week."}</p>`;
}

/* ---------- the manager's office ---------- */
const RAISE_STEPS = [10, 25, 50, 80];
// how strong a case you can actually make for more money
function raiseCase(){
  const k = S.contract, c = myClub(), me = meP();
  if (!k || !c) return null;
  const snap = k.startSnap || {}, since = S.careerMy.apps - (snap.apps || 0);
  const g = S.careerMy.goals - (snap.goals || 0), a = S.careerMy.assists - (snap.assists || 0);
  const avg = recentAvg();
  // what a club of this size would pay a player of this ability — the roof on any conversation
  const merit = clamp((avg - 6.3)/1.2, 0, 1)*.45
              + clamp((S.trust + 10)/60, 0, 1)*.3
              + clamp((g*1.6 + a)/Math.max(5, since*.55), 0, 1)*.25;
  // what the club would pay a player of this ability — and a club will stretch for someone playing well
  const ceiling = Math.max(20, Math.round(wageLevel(c.rep)*clamp((me.ovr - meanOvr(c.rep))/22 + 1, .45, 2.1)*(1 + merit*.55)));
  const head = ceiling/Math.max(1, k.wage);
  const maxPct = Math.round(clamp((head - 1)*100*(.3 + merit*.8), 0, 120)/5)*5;
  return {since, g, a, avg, ceiling, head, merit, maxPct, wage:k.wage};
}
// why the manager will not talk money at all right now, if he won't
function raiseBlock(rc){
  if (!rc) return "You have no club to talk to.";
  if (S.raise) return "deal";
  const k = S.contract;
  if (k.promised && !k.metDone && !k.failed) return "You already shook hands on a promise. Deliver that first.";
  if (k.raiseCool && gw() < k.raiseCool) return `We went through this recently. Come back in ${Math.ceil((k.raiseCool - gw())/1)} week${Math.ceil(k.raiseCool - gw()) === 1 ? "" : "s"}.`;
  if (rc.since < 5) return `You have played ${rc.since} game${rc.since === 1 ? "" : "s"} since you signed. Show me something first.`;
  if (rc.maxPct < 5) return rc.head <= 1.05
    ? "You are already on the best money in this dressing room. There is nothing above you here."
    : "On this form I cannot go to the board for you. Play your way into that conversation.";
  return "";
}
// the numbers he wants in return for a given rise
function raiseTerms(pct){
  const pos = S.player.pos, load = pct/25;
  const per = {ST:{goals:1, assists:.45}, W:{goals:.6, assists:.7}, AM:{goals:.4, assists:.9}}[pos] || {goals:.6, assists:.6};
  const weeks = Math.round(clamp(10 + pct*.2, 10, 26));
  const games = Math.max(4, Math.round(weeks*.8));
  const reqs = {apps:Math.max(3, Math.round(games*.55))};
  const gl = Math.round(per.goals*games*.3*(.75 + load*.45));
  const as = Math.round(per.assists*games*.3*(.75 + load*.45));
  if (gl > 0) reqs.goals = gl;
  if (as > 0) reqs.assists = as;
  return {weeks, reqs, avg:+(6.3 + clamp(load, 0, 3.4)*.22).toFixed(1)};
}
function termsLine(t){
  const bits = Object.entries(t.reqs).map(([k, v]) => {
    const w = REQ_LABEL[k].toLowerCase();
    return `${v} ${v === 1 ? w.replace(/s$/, "") : w}`;
  });
  bits.push(`an average rating of ${t.avg}`);
  return `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}, inside ${t.weeks} weeks`;
}
function raiseWage(pct){ return Math.max(S.contract.wage + 5, Math.round(S.contract.wage*(1 + pct/100)/5)*5); }
// how a pending deal is going
function raiseProgress(){
  const d = S.raise; if (!d) return null;
  const out = {}; for (const [k, v] of Object.entries(d.reqs)) out[k] = {have:S.careerMy[k] - (d.snap[k] || 0), target:v};
  const rs = S.ratings.slice(d.ratFrom);
  out.avg = {have:rs.length ? +(rs.reduce((t, x) => t + x, 0)/rs.length).toFixed(2) : 0, target:d.avg, rating:true, n:rs.length};
  return out;
}
function raiseMet(){
  const p = raiseProgress(); if (!p) return false;
  for (const [k, v] of Object.entries(p)){ if (v.rating){ if (!v.n || v.have < v.target) return false; } else if (v.have < v.target) return false; }
  return true;
}
// checked once a week, alongside the contract targets
function checkRaise(){
  const d = S.raise; if (!d) return;
  const c = myClub();
  if (!c || !S.contract){ S.raise = null; return; }   // the deal was with a manager you no longer have
  if (raiseMet()){
    S.contract.wage = d.wage; S.raise = null; trustAdd(6);
    addNews("you", "Pay rise agreed", `${c.nm} move you to ${eur(d.wage)}/week — you hit every number the manager asked for.`, "me");
    raiseBox(d);
    return;
  }
  if (gw() >= d.deadline){
    S.raise = null; trustAdd(-4); S.contract.raiseCool = gw() + 10;
    addNews("you", "No rise this time", `You fell short of the targets the manager set. Your wage stays at ${eur(S.contract.wage)}/week.`, "me");
    msg(c.nm, "You did not get there. The offer is off the table for now — keep playing and we will look again.");
  }
}
// the same pop-up shape as a job promotion: old wage → new wage, one OK button
function raiseBox(d){
  const r = $("#tutRoot");
  if (!r){ toast(`Pay rise: ${eur(d.wage)}/week`, "gold"); return; }
  if (typeof TUT === "object") TUT.tok++;
  r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="closeConfirm()"></div>
    <div class="tut-card confirm promo in">
      <div class="promo-badge">🧑‍💼</div>
      <div class="eyebrow">Pay rise</div>
      <h3>The manager keeps his word</h3>
      <p class="muted small">You hit every number he asked for. ${esc((myClub() || {nm:"Your club"}).nm)} move you up from this week.</p>
      <div class="promo-pay"><span class="old">Old wage<b>${eur(d.from)}/wk</b></span><i>→</i><span class="new">New wage<b>${eur(d.wage)}/wk</b></span></div>
      <div class="tut-foot end"><button class="btn sm" onclick="closeConfirm()">OK</button></div></div>`;
}
function officeSheet(){
  const c = myClub(); if (!c || !S.contract) return `<h2>Manager</h2><p class="muted">You are not at a club — there is nobody to talk to yet.</p>`;
  if (RAISE_PEND) return offerHTML();
  const rc = raiseCase(), block = raiseBlock(rc);
  const head = `<h2>The manager's office</h2>
    <p class="muted">${esc(c.nm)} · ${esc(trustLabel())} · ${eur(S.contract.wage)}/week</p>
    <div class="mgr-read">
      <div><span>Games since you signed</span><b>${rc.since}</b></div>
      <div><span>Goals · assists</span><b>${rc.g} · ${rc.a}</b></div>
      <div><span>Recent average</span><b>${rc.avg.toFixed(2)}</b></div>
    </div>`;
  // a deal is already on the table
  if (S.raise){
    const p = raiseProgress(), d = S.raise, left = Math.max(0, d.deadline - gw());
    const rows = Object.entries(p).map(([k, v]) => {
      const done = v.rating ? (v.n && v.have >= v.target) : v.have >= v.target;
      return `<div class="req ${done ? "done" : ""}"><span>${v.rating ? "Average rating" : REQ_LABEL[k]}</span>
        <b>${v.rating ? (v.n ? v.have.toFixed(2) : "–") : v.have} / ${v.target}</b></div>`; }).join("");
    return `${head}<div class="mgr-deal">
      <div class="row between"><b>Agreed: ${eur(d.from)} → ${eur(d.wage)}/wk</b><span class="pill">${left} week${left === 1 ? "" : "s"} left</span></div>
      <div class="reqs">${rows}</div>
      <p class="muted small">Hit every line before the clock runs out and the rise is yours.</p></div>`;
  }
  if (block) return `${head}<blockquote class="mq">${esc(block)}</blockquote>
    <p class="muted small">Come back when you have something to show him.</p>`;
  // no hints about what he will accept — you make the ask and he answers
  const NERVE = ["Modest ask", "Fair ask", "Big ask", "Long shot"];
  const opts = RAISE_STEPS.map((p, i) => `<button class="opt" onclick="A.askRaise(${p})">
      <b>Ask for +${p}%</b><span class="muted small">${eur(raiseWage(p))}/week</span>
      <span class="pill">${NERVE[i]}</span></button>`).join("");
  return `${head}<p class="muted small">He knows your numbers. Ask for too much and he will tell you what he can actually do.</p>
    <div class="stack">${opts}</div>
    <button class="btn ghost wide" onclick="openSheet('pos')">⇅ Talk about where you play</button>`;
}
// the manager's answer: yes with targets, a counter, or a straight no
let RAISE_PEND = null;
function askRaise(pct){
  const rc = raiseCase(); if (raiseBlock(rc)) return;
  if (pct <= rc.maxPct) RAISE_PEND = {pct, t:raiseTerms(pct), line:`Fine. ${eur(raiseWage(pct))} a week — but I want it earned.`};
  else if (rc.maxPct >= 5) RAISE_PEND = {pct:rc.maxPct, t:raiseTerms(rc.maxPct), asked:pct,
    line:`+${pct}% is not happening, not at this club. The closest I can get you is +${rc.maxPct}% — ${eur(raiseWage(rc.maxPct))} a week.`};
  else { S.contract.raiseCool = gw() + 8; save(); }
  openSheet("manager");
}
function offerHTML(){
  const p = RAISE_PEND;
  return `<h2>The manager's office</h2>
    ${p.asked ? `<p class="muted small">You asked for +${p.asked}%.</p>` : ""}
    <blockquote class="mq">${esc(p.line)}</blockquote>
    <p>He wants <b>${esc(termsLine(p.t))}</b>.</p>
    <div class="row gap10">
      <button class="btn" onclick="A.takeRaise()">Shake on it</button>
      <button class="btn ghost" onclick="A.dropRaise()">Leave it</button>
    </div>
    <p class="muted small">Miss the targets and the offer comes off the table for a while. Nothing else changes.</p>`;
}
function takeRaise(){
  const p = RAISE_PEND; if (!p) return;
  const from = S.contract.wage;
  S.raise = {pct:p.pct, from, wage:raiseWage(p.pct), reqs:p.t.reqs, avg:p.t.avg,
    deadline:gw() + p.t.weeks, snap:snapMy(), ratFrom:S.ratings.length};
  RAISE_PEND = null;
  msg((myClub() || {nm:"Your club"}).nm, `Terms noted: ${termsLine(p.t)}. Get there and the money follows.`);
  addNews("you", "Terms agreed with the manager", `${eur(from)} → ${eur(S.raise.wage)}/week if you deliver: ${termsLine(p.t)}.`, "me");
  toast("Terms agreed with the manager", "good");
  save(); openSheet("manager"); renderHub();
}

/* ---------- asking to play somewhere else ----------
   A manager will move you one line at a time, and only when he can see a reason: you have played
   enough for him to judge you, he trusts you, and there is room in the side where you want to go. */
const POS_COOL = 12;                                  // weeks before he will discuss it again
// the other spots in his shape that are one line from yours (positions.js): deeper, across, or further forward
function posMoveOptions(){
  const cur = S.player.teamPos || posOrArch(S.player.pos), i = POS_ORDER.indexOf(archOf(cur)), seen = new Set([cur]), out = [];
  const slots = myClub() ? formationSlots(myClub()) : POSITION_ORDER;
  for (const s of slots){
    if (seen.has(s) || s === "GK") continue; seen.add(s);
    const j = POS_ORDER.indexOf(archOf(s)), dy = POSITIONS[s].y - POSITIONS[cur].y;
    if (Math.abs(j - i) > 1) continue;
    out.push({dir:Math.sign(dy), to:s, label:j < i || dy < -6 ? "Drop deeper" : j > i || dy > 6 ? "Push further forward" : "Switch flank"});
  }
  return out.sort((a, b) => Math.abs(POSITIONS[a.to].y - POSITIONS[cur].y) - Math.abs(POSITIONS[b.to].y - POSITIONS[cur].y)).slice(0, 4);
}
function posBlock(){
  const c = myClub(); if (!c || !S.contract) return "You need a club before anyone will move you.";
  // every game counts, whether you played the moments yourself or the week was simulated
  const played = (meP().cr && meP().cr.ap) || 0;
  if (S.posCool && gw() < S.posCool) return `We only just moved you. Give it ${Math.max(1, Math.ceil(S.posCool - gw()))} more week${Math.ceil(S.posCool - gw()) === 1 ? "" : "s"}.`;
  if (played < 8) return `You have played ${played} game${played === 1 ? "" : "s"}. Learn this job first.`;
  if (S.trust < 6) return "Get in the side properly and then we will talk about where you play.";
  return "";
}
// how he feels about the move: your form, his trust, and whether that line needs a body
function posVerdict(to){
  const c = myClub(), me = meP();
  const want = POSITIONS[to] ? POSITIONS[to].world : MY_POS[to];
  const line = q => q.pos === "GK" ? "GK" : (q.pos === "ST" || q.pos === "LW" || q.pos === "RW") ? "FWD" : q.pos;
  const sq = squadOf(c.id).filter(p => !p.me);
  const there = sq.filter(p => line(p) === line({pos:want}));
  const best = there.sort((a, b) => b.ovr - a.ovr)[0];
  const room = !best || me.ovr >= best.ovr - 4;       // you do not have to be better, but close
  const form = recentAvg();
  const ok = room && form >= 6.4 && S.trust >= 6;
  return {ok, room, form, rival:best, need:there.length <= 2};
}
function posSheet(){
  if (POS_ANSWER){
    const a = POS_ANSWER; POS_ANSWER = null;
    return `<h2>Where you play</h2><blockquote class="mq">${esc(a.line)}</blockquote>
      <p class="muted small">${a.ok ? `You play <b>${esc(POSITIONS[a.to].name.toLowerCase())}</b> now. Your chances in a game change with the job.` : "Come back when something has changed."}</p>
      <button class="btn ghost" onclick="openSheet('pos')">Back</button>`;
  }
  const block = posBlock();
  const opts = posMoveOptions();
  const head = `<h2>Where you play</h2>
    <p class="muted">You play <b>${esc(teamPosText())}</b> in his ${esc(clubFormation(myClub()))}. ${esc(POS[S.player.pos].blurb)}</p>`;
  if (block) return `${head}<blockquote class="mq">${esc(block)}</blockquote>`;
  return `${head}<p class="muted small">He will move you one line at a time, and only if he thinks it helps the team.</p>
    <div class="stack">${opts.map(o => {
      const v = posVerdict(o.to);
      return `<button class="opt" onclick="A.askPos('${o.to}')">
        <b>${esc(o.label)} — ${esc(POSITIONS[o.to].name)}</b>
        <span class="muted small">${esc(POS[archOf(o.to)].blurb)}</span>
        <span class="pill">${v.need ? "He is short of bodies there" : v.rival ? `${esc(sname(v.rival))} plays there` : "Nobody is ahead of you"}</span></button>`;
    }).join("")}</div>`;
}
function askPos(to){
  if (posBlock()) return;
  const v = posVerdict(to), me = meP();
  if (!v.ok){
    const why = !v.room ? `${sname(v.rival)} is ahead of you there and he is not losing his place.`
      : v.form < 6.4 ? "Play better where you are first. I am not rebuilding the side around a hunch."
      : "Not yet. Earn a bit more of my trust.";
    S.posCool = gw() + 6;
    POS_ANSWER = {ok:false, to, line:why};
    save(); openSheet("pos");
    return;
  }
  S.player.asked = to; assignTeamPos();             // his slot for you, kept until you change clubs
  S.posCool = gw() + POS_COOL;
  trustAdd(Math.max(0, S.trust - 4) - S.trust);     // a new job, and you start again proving it: 4 off, never below 0
  POS_ANSWER = {ok:true, to, line:`Right. From Saturday you play ${POSITIONS[to].name.toLowerCase()}. Show me you can do it.`};
  addNews("you", `${S.player.name} moves to ${POSITIONS[to].name.toLowerCase()}`, `${myClub().nm} give him a new job in the side.`, "me");
  save(); renderHub(); openSheet("pos");
}
let POS_ANSWER = null;
