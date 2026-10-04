"use strict";
/* ============ HONOURS: weekly, monthly, end of season, and the milestones ============
   Everything a career can win. The weekly and monthly prizes keep a season ticking over; the
   end-of-season list is the awards night; the milestones mark the numbers that matter. */

/* ---------- how good was a performance ---------- */
// one league outing, judged the way a panel would: goals first, then assists, then the mark
function weekScore(p, g, a, rating, motm){
  const w = SEASON_W[p && p.pos] || SEASON_W.ST;
  return g*w.g + a*w.a + (rating - 6.4)*2.4 + (motm ? 1.6 : 0);
}
// which leagues are worth awarding: your own, and every top flight in the world
function awardLeagues(){
  const mine = typeof myLg === "function" ? myLg() : null;
  return Object.values(W.leagues).filter(lg => lg.t === 1 || lg.id === mine);
}
function isAwardLeague(lgId){
  const mine = typeof myLg === "function" ? myLg() : null;
  const lg = W.leagues[lgId];
  return !!lg && (lg.t === 1 || lg.id === mine);
}
/* the best league display of the week, kept as one entry per league while the week is simulated */
function noteWeekPerformance(p, lgId, g, a, rating, motm){
  if (!lgId || !isAwardLeague(lgId)) return;
  const s = weekScore(p, g, a, rating, motm);
  const b = (W.wkb || (W.wkb = {}))[lgId];
  if (!b || s > b.s) W.wkb[lgId] = {id:p.id, s, g, a, r:rating};
}

/* ---------- the announcement card ---------- */
// one shape for every honour: a badge, what it is, and your name on it
function honourBox(icon, eyebrow, title, line, detail){
  const r = $("#tutRoot");
  if (!r){ toast(`🏆 ${title}`, "gold"); return; }
  if (typeof TUT === "object") TUT.tok++;
  r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="closeConfirm()"></div>
    <div class="tut-card confirm honour in">
      <div class="honour-badge">${icon}</div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h3>${esc(title)}</h3>
      <p class="muted small">${esc(line)}</p>
      ${detail ? `<div class="honour-stat">${detail}</div>` : ""}
      <div class="tut-foot end"><button class="btn sm" onclick="closeConfirm()">OK</button></div></div>`;
}
const statChip = (v, k) => `<span><b>${v}</b>${k}</span>`;

/* ---------- weekly: player of the week ---------- */
function weekAwards(w){
  const best = W.wkb; W.wkb = {};
  if (!best) return;
  const mine = typeof myLg === "function" ? myLg() : null;
  for (const [lgId, b] of Object.entries(best)){
    const lg = W.leagues[lgId], p = W.players[b.id];
    if (!lg || !p || b.s < 2) continue;                    // a quiet week has no winner
    (W.awards.potw || (W.awards.potw = {}))[lgId] = p.id;
    p.rep += Math.round(6 + (W.clubs[p.club] ? W.clubs[p.club].rep : 0)*.004);
    if (p.me){
      myAward(`Player of the Week — ${lg.nm}`, 25);
      honourBox("⭐", `Week ${w} · ${lg.nm}`, "Player of the Week",
        `The best performance in the division this week.`,
        `${statChip(b.g, "goals")}${statChip(b.a, "assists")}${statChip(b.r.toFixed(1), "rating")}`);
    } else if (lgId === mine){
      addNews("award", `${pname(p)} is Player of the Week`, `${b.g} goal${b.g === 1 ? "" : "s"}, ${b.a} assist${b.a === 1 ? "" : "s"}, rated ${b.r} for ${W.clubs[p.club].nm}.`,
        p.id === S.rivalId ? "rival" : "");
    }
  }
}

/* ---------- end of season ---------- */
// a centre half will never out-score a striker, so the weight of a goal depends on where you play
const SEASON_W = {GK:{g:6, a:4}, DF:{g:5, a:3.2}, CM:{g:3.4, a:2.4}, CAM:{g:3, a:2.4}, LW:{g:3, a:2.2}, RW:{g:3, a:2.2}, ST:{g:3, a:2}};
function seasonScore(p){
  const w = SEASON_W[p.pos] || SEASON_W.ST;
  return p.st.g*w.g + p.st.a*w.a + (p.st.rs/Math.max(1, p.st.ap) - 6.5)*10 + p.st.mo;
}
// the eleven of the season, in the shape the game plays
function teamOfSeason(ps){
  const want = [["GK", 1], ["DF", 4], ["CM", 3], ["CAM", 1], ["FWD", 2]];
  const line = p => p.pos === "GK" ? "GK" : (p.pos === "ST" || p.pos === "LW" || p.pos === "RW") ? "FWD" : p.pos;
  const used = new Set(), xi = [];
  for (const [k, n] of want)
    ps.filter(p => line(p) === k && !used.has(p.id)).sort((a, b) => seasonScore(b) - seasonScore(a)).slice(0, n)
      .forEach(p => { used.add(p.id); xi.push(p); });
  return xi;
}
function leagueAwards(lg, report){
  const ps = lg.clubs.flatMap(cid => squadOf(cid)).filter(p => p.st.ap >= 5);
  if (ps.length < 11) return;
  const top = (arr, f) => arr.reduce((b, p) => f(p) > f(b) ? p : b, arr[0]);
  const pick2 = {
    pos:  top(ps, seasonScore),
    boot: top(ps, p => p.st.g),
    play: top(ps.filter(p => p.st.a > 0).length ? ps.filter(p => p.st.a > 0) : ps, p => p.st.a),
    glove:(() => { const gks = ps.filter(p => p.pos === "GK"); return gks.length ? top(gks, p => p.st.rs/Math.max(1, p.st.ap)) : null; })(),
    young:(() => { const y = ps.filter(p => p.age <= 21); return y.length ? top(y, seasonScore) : null; })()
  };
  const xi = teamOfSeason(ps);
  W.awards.poty[lg.id] = pick2.pos.id;
  W.awards.boot[lg.id] = pick2.boot.id;
  (W.awards.play || (W.awards.play = {}))[lg.id] = pick2.play.id;
  if (pick2.glove) (W.awards.glove || (W.awards.glove = {}))[lg.id] = pick2.glove.id;
  if (pick2.young) (W.awards.young || (W.awards.young = {}))[lg.id] = pick2.young.id;
  (W.awards.tots || (W.awards.tots = {}))[lg.id] = xi.map(p => p.id);
  // names are kept as well as ids: a winner who retires this summer is replaced by a new young
  // player in the squad list, and the record of what he won should not change with him
  (W.awards.nm || (W.awards.nm = {}))[lg.id] = {
    season:W.season, pos:pname(pick2.pos), boot:pname(pick2.boot), bootG:pick2.boot.st.g,
    play:pname(pick2.play), playA:pick2.play.st.a,
    glove:pick2.glove ? pname(pick2.glove) : "", young:pick2.young ? pname(pick2.young) : "",
    tots:xi.map(p => `${p.pos} ${sname(p)}`)
  };

  pick2.pos.rep += 150; pick2.boot.rep += 80; pick2.play.rep += 70;
  if (pick2.glove) pick2.glove.rep += 60;
  if (pick2.young) pick2.young.rep += 90;
  for (const p of xi) p.rep += 40;

  const won = [];
  if (pick2.pos.me){ myAward(`Player of the Season — ${lg.nm}`, 400); won.push(["🏅", "Player of the Season", `${pick2.pos.st.g} goals and ${pick2.pos.st.a} assists in ${pick2.pos.st.ap} games.`,
    `${statChip(pick2.pos.st.g, "goals")}${statChip(pick2.pos.st.a, "assists")}${statChip((pick2.pos.st.rs/Math.max(1, pick2.pos.st.ap)).toFixed(2), "average")}`]); }
  if (pick2.boot.me){ myAward(`Golden Boot — ${lg.nm} (${pick2.boot.st.g} goals)`, 250); won.push(["👟", "Golden Boot", `Nobody in the division scored more.`,
    `${statChip(pick2.boot.st.g, "goals")}${statChip(pick2.boot.st.ap, "games")}`]); }
  if (pick2.play.me){ myAward(`Playmaker — ${lg.nm} (${pick2.play.st.a} assists)`, 220); won.push(["🎯", "Playmaker of the Season", `Nobody in the division made more.`,
    `${statChip(pick2.play.st.a, "assists")}${statChip(pick2.play.st.ap, "games")}`]); }
  if (pick2.glove && pick2.glove.me){ myAward(`Golden Glove — ${lg.nm}`, 220); won.push(["🧤", "Golden Glove", `The best goalkeeper in the division.`, ""]); }
  if (pick2.young && pick2.young.me){ myAward(`Young Player of the Season — ${lg.nm}`, 300); won.push(["🌱", "Young Player of the Season", `The best of the division's under-21s.`,
    `${statChip(pick2.young.st.g, "goals")}${statChip(pick2.young.st.a, "assists")}`]); }
  if (xi.some(p => p.me)){ myAward(`Team of the Season — ${lg.nm}`, 180); won.push(["⭐", "Team of the Season", `Named in the division's eleven of the year.`, ""]); }
  for (const [ic, t, l, d] of won) HONOUR_QUEUE.push([ic, lg.nm, t, l, d]);

  const mine = typeof myLg === "function" ? myLg() : null;
  if (lg.id === mine || lg.t === 1){
    report.push(`${pname(pick2.pos)} is ${lg.nm} Player of the Season`);
    if (lg.id === mine){
      addNews("award", `${pname(pick2.boot)} wins the ${lg.nm} Golden Boot`, `${pick2.boot.st.g} goals for ${W.clubs[pick2.boot.club].nm}.`);
      addNews("award", `${pname(pick2.play)} is the ${lg.nm} Playmaker`, `${pick2.play.st.a} assists for ${W.clubs[pick2.play.club].nm}.`);
    }
  }
}
/* the ones that span the whole world */
function worldAwards(report){
  const all = W.players.filter(p => p);
  const shoe = all.filter(p => p.st.ap >= 8).sort((a, b) => b.st.g - a.st.g)[0];
  if (shoe){
    (W.awards.shoe || (W.awards.shoe = {})).id = shoe.id; W.awards.shoe.g = shoe.st.g;
    shoe.rep += 220; shoe.wrep += 400;
    if (shoe.me){ myAward(`Golden Shoe (${shoe.st.g} goals)`, 600, 900);
      HONOUR_QUEUE.push(["👑", "Across every league in the world", "The Golden Shoe", "No player on earth scored more league goals this season.", statChip(shoe.st.g, "goals")]); }
    else addNews("award", `${pname(shoe)} wins the Golden Shoe`, `${shoe.st.g} league goals — more than anyone in the world.`);
  }
  for (const [key, label, icon] of [["ct", CONT.CL, "🏆"], ["el", CONT.EL, "🥈"]]){
    const best = all.filter(p => p[key] && p[key].ap).sort((a, b) => b[key].g - a[key].g)[0];
    if (!best || !best[key].g) continue;
    best.rep += 90; best.wrep += 200;
    if (best.me){ myAward(`${label} top scorer (${best[key].g} goals)`, 350, 500);
      HONOUR_QUEUE.push([icon, label, "Top scorer", `Nobody scored more in the competition this season.`, statChip(best[key].g, "goals")]); }
    else addNews("award", `${pname(best)} is ${label} top scorer`, `${best[key].g} goals in the competition.`);
  }
  const caps = all.filter(p => p.nt && p.nt.caps);
  if (W.wc && W.wc.done && caps.length){
    const ball = caps.sort((a, b) => (b.nt.g*3 + (b.nt.a || 0)*2) - (a.nt.g*3 + (a.nt.a || 0)*2))[0];
    const boot = caps.slice().sort((a, b) => b.nt.g - a.nt.g)[0];
    if (ball && ball.me){ myAward("World Championship Golden Ball", 900, 1600);
      HONOUR_QUEUE.push(["🌍", "World Championship", "The Golden Ball", "The best player of the tournament.", ""]); }
    if (boot && boot.me && boot.nt.g){ myAward(`World Championship Golden Boot (${boot.nt.g} goals)`, 700, 1200);
      HONOUR_QUEUE.push(["🌍", "World Championship", "The Golden Boot", "Nobody scored more at the tournament.", statChip(boot.nt.g, "goals")]); }
  }
}
/* the queue exists so a season that brings four honours shows four cards, one after another */
const HONOUR_QUEUE = [];
function showNextHonour(){
  const h = HONOUR_QUEUE.shift(); if (!h) return false;
  honourBox(h[0], h[1], h[2], h[3], h[4]);
  return true;
}

/* ---------- milestones ---------- */
const MILES = [];   // the counted milestones run on the ladder now; only the one-offs below remain
// checked after every match: the first time a number is passed, it is a moment
function checkMilestones(){
  const c = S.careerMy || {}; S.miles = S.miles || {};
  for (const m of MILES){
    if (S.miles[m.k] || (c[m.f] || 0) < m.n) continue;
    S.miles[m.k] = W.season;
    myAward(m.t, 120, 60);
    HONOUR_QUEUE.push([m.icon, "Milestone", m.t, m.l, ""]);
  }
}
// the one-offs that are about the first time, not the count
function firstTime(key, icon, title, line){
  S.miles = S.miles || {};
  if (S.miles[key]) return;
  S.miles[key] = W.season;
  myAward(title, 90, 40);
  HONOUR_QUEUE.push([icon, "A first", title, line, ""]);
}

/* ---------- the trophy cabinet ---------- */
// everything won, newest first, grouped by the season it was won in
function cabinetRows(){
  const rows = [...(S.trophies || []).map(t => Object.assign({kind:"trophy"}, t)),
                ...(S.awards || []).map(a => Object.assign({kind:"award"}, a))];
  return rows.sort((a, b) => (b.season - a.season) || (b.year - a.year));
}
function cabinetSheet(){
  const rows = cabinetRows();
  const tro = (S.trophies || []).length, aw = (S.awards || []).length;
  if (!rows.length) return `<h2>Trophy cabinet</h2>
    <p class="muted">Nothing in here yet. Win something and it will be waiting.</p>`;
  const bySeason = {};
  for (const r of rows) (bySeason[r.season] || (bySeason[r.season] = [])).push(r);
  const seasons = Object.keys(bySeason).sort((a, b) => b - a);
  return `<h2>Trophy cabinet</h2>
    <div class="cab-top">${statChip(tro, "trophies")}${statChip(aw, "awards")}${statChip(seasons.length, "seasons")}</div>
    ${seasons.map(sn => `<div class="cab-season"><div class="eyebrow">Season ${esc(sn)}</div>
      <div class="cab-grid">${bySeason[sn].map(r => `<div class="cab-item ${r.kind}">
        <span class="ci-ic">${r.kind === "trophy" ? "🏆" : "🏅"}</span>
        <span class="ci-nm">${esc(r.name)}</span>
        <span class="ci-yr muted small">${esc(String(r.year || ""))}</span></div>`).join("")}</div></div>`).join("")}`;
}

/* ============ GOALS WORTH TALKING ABOUT ============ */
/* how special a goal was. Distance first — it is the thing everyone argues about — then how it
   was struck, and whether it was built rather than simply finished. */
function goalScore(sh, gaveBack, frame){
  if (!sh || sh.pen) return 0;                   // a penalty is never goal of the month
  const d = sh.dist || 0;
  let s = Math.pow(Math.max(0, d - 7), 1.32)*1.15;
  if (sh.curl || sh.style === "curl") s += 26;
  else if (sh.style === "knuckle") s += 24;
  else if (sh.style === "dip") s += 18;
  else if (sh.style === "chip" || sh.style === "lofted") s += 20;
  else if (sh.style === "header") s += 16;
  if (sh.fk) s += 14;
  if (gaveBack) s += 16;                         // a one-two worked before it
  if (frame) s += 10;                            // in off the frame
  return Math.round(s);
}
// keep the best one you have scored this month, and this season
function noteGoal(sh, gaveBack, frame, opp, minute){
  const s = goalScore(sh, gaveBack, frame);
  if (!s) return;
  const g = {s, d:Math.round(sh.dist || 0), style:sh.style || "driven", fk:!!sh.fk,
    curl:!!(sh.curl || sh.style === "curl"), one:!!gaveBack, opp:opp || "", min:minute || 0,
    season:W.season, wk:S.week};
  if (!S.goalM || s > S.goalM.s) S.goalM = g;
  if (!S.goalS || s > S.goalS.s) S.goalS = g;
}
function goalWords(g){
  const bits = [`${g.d} metres`];
  if (g.fk) bits.push("free kick");
  if (g.curl) bits.push("curled");
  else if (g.style === "chip" || g.style === "lofted") bits.push("lifted over the keeper");
  else if (g.style === "knuckle") bits.push("dipping and swerving");
  else if (g.style === "dip") bits.push("dipping late");
  else if (g.style === "header") bits.push("header");
  if (g.one) bits.push("after a one-two");
  return bits.join(" · ");
}
/* ---------- the ladder ----------
   The first one, the fifth, then every tenth to a hundred, then every hundredth. */
function ladderHit(n){
  if (!n || n < 1) return false;                   // nought of something is not a milestone
  if (n === 1 || n === 5) return true;
  if (n <= 100) return n % 10 === 0;
  return n % 100 === 0;
}
function ladderName(n, what){
  if (n === 1) return `Your first ${what}`;
  return `${fmt(n)} ${what}${n === 1 ? "" : "s"}`;
}
// every counted thing runs on the same ladder, so the numbers keep meaning something
function checkLadder(key, n, what, icon, line){
  S.miles = S.miles || {};
  const tag = key + ":" + n;
  if (!n || S.miles[tag] || !ladderHit(n)) return;
  S.miles[tag] = W.season;
  const title = ladderName(n, what);
  myAward(title, n >= 100 ? 400 : n >= 50 ? 220 : n >= 10 ? 130 : 70, n >= 100 ? 300 : 40);
  HONOUR_QUEUE.push([icon, "Milestone", title, line(n), ""]);
}
/* ---------- goal of the month ---------- */
function goalOfMonth(w){
  const g = S.goalM; S.goalM = null;
  if (!g || !myClub()) return;
  const lg = W.leagues[myLg()];
  // what the rest of the division managed this month — a better league produces better goals
  const bar = rnd(52, 118)*(1 + (4 - clamp(lg ? lg.t : 4, 1, 4))*.14);
  if (g.s < bar){
    if (g.s > bar*.8) addNews("award", `${S.player.name} makes the shortlist`, `That ${g.d}-metre strike was in the running for goal of the month.`, "me");
    return;
  }
  S.gotm = (S.gotm || 0) + 1;
  const me = meP();
  me.rep += Math.round(45 + (myClub().rep || 0)*.008); me.wrep += 12;
  myAward(`Goal of the Month — ${monthName(w)}`, 150, 60);
  addNews("award", `${S.player.name} wins Goal of the Month`, `${goalWords(g)}${g.opp ? ` against ${g.opp}` : ""}. Nothing else came close.`, "me");
  HONOUR_QUEUE.push(["🎬", `${monthName(w)} · ${lg ? lg.nm : ""}`, "Goal of the Month", goalWords(g),
    `${statChip(g.d, "metres")}${statChip(S.gotm, S.gotm === 1 ? "won" : "won")}`]);
  socialEvent("goal", `Goal of the Month — ${goalWords(g)}`);   // and you can post about it
  checkLadder("gotm", S.gotm, "Goal of the Month award", "🎬",
    n => n === 1 ? "The first of them." : `You have won it ${fmt(n)} times now.`);
}
/* ---------- the best goal in the world, at the end of a season ---------- */
function goalOfSeason(){
  const g = S.goalS; S.goalS = null;
  if (!g) return;
  const bar = rnd(118, 172);
  if (g.s < bar) return;
  const me = meP();
  me.rep += 260; me.wrep += 520;
  S.puskas = (S.puskas || 0) + 1;
  myAward("Goal of the Season", 800, 1400);
  addNews("award", `${S.player.name} wins Goal of the Season`, `${goalWords(g)}. The best goal anyone scored all year.`, "me");
  HONOUR_QUEUE.push(["🏹", "The best goal in the world", "Goal of the Season", goalWords(g), statChip(g.d, "metres")]);
  socialEvent("goal", `Goal of the Season — ${goalWords(g)}`);
}

/* ---------- the press, after a man-of-the-match display ---------- */
const PRESS_LINES = [
  {t:"Give it to the team", rep:.7, trust:8, risk:0,
   say:"I had ten others making me look good today. That is the whole story."},
  {t:"Take the credit", rep:1.35, trust:0, risk:.1,
   say:"I have worked for days like this. I expect more of them."},
  {t:"Call your shot", rep:2.1, trust:-10, risk:.34,
   say:"Watch this league. I am going to take it apart this season."}
];
function pressSheet(){
  const lm = S.lastMatch;
  if (!lm || !lm.motm) return `<h2>The press</h2><p class="muted">They only want you when you are the best man on the pitch.</p>`;
  if (S.pressDone === lm.gw) return `<h2>The press</h2><p class="muted">You have already spoken today.</p>`;
  return `<h2>Man of the match</h2>
    <p class="muted">The cameras want you. What you say here is worth more than a normal week — you are the story.</p>
    <blockquote class="mq">You were the best player on the pitch against ${esc(lm.opp)}. Talk us through it.</blockquote>
    <div class="stack">${PRESS_LINES.map((l, i) => `<button class="opt media" onclick="A.press(${i})">
      <b>${esc(l.t)}</b><span class="muted small">“${esc(l.say)}”</span>
      <span class="row gap6 wrap"><span class="pill">Reputation ${l.rep >= 2 ? "＋＋＋" : l.rep >= 1.2 ? "＋＋" : "＋"}</span>
        <span class="pill ${l.trust > 0 ? "good" : l.trust < -6 ? "bad" : ""}">Manager ${l.trust > 0 ? "+" : ""}${l.trust}</span>
        ${l.risk ? `<span class="pill bad">${Math.round(l.risk*100)}% it backfires</span>` : ""}</span></button>`).join("")}</div>
    <p class="muted small">No energy, no action — this one is on the way off the pitch.</p>`;
}
function pressSay(i){
  const l = PRESS_LINES[i], lm = S.lastMatch;
  if (!l || !lm || !lm.motm || S.pressDone === lm.gw) return;
  S.pressDone = lm.gw;
  const me = meP(), back = Math.random() < l.risk;
  const gain = Math.max(6, Math.round((16 + me.rep*.016)*l.rep*styleMul()*(back ? .55 : 1)));
  me.rep += gain; me.wrep += Math.round(gain*.22);
  S.trust = clamp(S.trust + (back ? l.trust - 8 : l.trust), -30, 80);
  addNews("you", back ? `${S.player.name}'s words cause a stir` : `${S.player.name} speaks after the win`,
    `“${l.say}”${back ? " It has not gone down well." : ""}`, "me");
  socialEvent("match", `Man of the match vs ${lm.opp}`);
  closeSheet(); save(); renderHub();
  toast(back ? `+${fmt(gain)} reputation — but that one stung` : `+${fmt(gain)} reputation`, back ? "bad" : "good");
}
