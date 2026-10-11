"use strict";
/* ============ THE MATCH DAY: the career's side of it ============
   Owner: WP-E (Stage 1: matchSetup, matchRewards, bookPlayer, the cards, quickMatch), WP-L (Stage 3: the 2D match and
   its screen deleted). Contract: DESIGN 1.4.19 (match.js), 3.4.5 (match.js after the split), 3.4.6 (routing without
   the 2D engine). A match the player plays is the first-person match (js/life/football, controller.js FP.enter);
   this file holds what the career needs around it: the line-ups and the role before kick-off, the rewards at full
   time, bookings, the half-time and full-time cards, and quickMatch for the hub without the 3D world. MT is the
   mirror of the match on now that the rest of the game reads (awards, feed, phone); bridge.js keeps it current. */
let MT = null;
// work rate: 1-4 bolts. The energy a match minute on the pitch drains at each (the legs after a match played out for
// you, legsAfter, when the match measured none of its own)
const WR = {drain:[0, .16, .26, .38, .55]};
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
/* A match day before a ball is kicked (DESIGN 3.4.5): the two line-ups (the player in his club's XI), the role the
   manager gives him (arriving late he starts on the bench, and the manager remembers it), when he is planned off or
   on, the minutes he is on the pitch (MT.on, match minutes), the kits, the ground and its crowd, and what the nerves
   and tired legs will take off him. No result is decided here and no screen is drawn: the first-person match
   (js/life/football) plays it out, quickMatch has the world's simulation play it for him. Returns MT. */
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
    usGoals:[], themGoals:[], my:blankMatchMy(), stats:{shots:[0,0], corners:[0,0], cards:[0,0]},
    onPitch: role !== "sub" && role !== "cameo", subOn, subOff, chemD:0, on: role === "sub" || role === "cameo" ? [] : [[0, null]],
    myKit: f.kind === "N" ? natKit(usId) : kitOf(nameUs), oppKit: f.kind === "N" ? natKit(themId) : awayKit(nameUs, nameThem)};
  S.speed = S.speed || 2;
  MT.stad = stadiumFor(f); MT.nerves = nervesFor(MT.stad.crowd);
  // tired legs take something off everything you do
  MT.tired = typeof fatigueSkillHit === "function" ? fatigueSkillHit() : 0;
  return MT;
}
function natKit(nat){ return {RO:["#ffd200","#002b7f"], EN:["#ffffff","#0b1f4d"], ES:["#c60b1e","#ffc400"], DE:["#ffffff","#111111"], IT:["#0a5ec2","#ffffff"], FR:["#0b2a6b","#ffffff"]}[nat] || ["#888","#fff"]; }
// which reputation band a fixture belongs to
function repTier(f){
  if (f.kind === "F") return "F";
  if (f.kind === "C") return "C";
  if (f.kind === "E") return f.comp === "EL" ? "EL" : "CL";
  if (f.kind === "N") return f.wc ? "WC" : "N";
  return "L";
}
/* The career's side of full time (DESIGN 3.4.5), for the first-person match (bridge.finish) and a match played out
   from the hub (quickMatch) alike: the big-game composure, bonuses, reputation at home and in the world, XP, the manager's
   trust, the career and season records, the ladders and milestones, the last match, how tired the legs are tomorrow,
   and what playing together did for the group. M: the MT of the match (score, my counters, role, MT.on minutes);
   rating: the player's rating; out: finaliseMatch's result (the man of the match). A friendly is a look, not a
   verdict: no bonuses, nothing on the career or season record, no rating in the form guide. Returns what it gave. */
function matchRewards(M, rating, out){
  M = M || MT;
  M.holdToasts = true;          // the full-time card is coming: what full time toasts waits until you leave (ui/main.js)
  const R = {rating, composure:0};
  // he never got on (rating null: a substitute left on the bench, or one still on it when a crash cut the match short,
  // bridge.finish): no rating, no appearance, no bonus and nothing on his record, the manager's trust and the
  // reputation as they were; only the day in his legs (1.5.2 at 0 minutes)
  if (rating == null){
    const f = M.f, me = meP(), [us, th] = M.score;
    Object.assign(R, {dnp:true, res:us > th ? "W" : us < th ? "L" : "D", motm:false, motmId:out ? out.motm : -1, bonus:0, xp:0, trustD:0, chemD:0,
      rep:me.rep, repD:0, wrep:me.wrep, wrepD:0, repName:(COMP_REP[repTier(f)] || COMP_REP.L).nm});
    legsAfter(M, R, 0);
    save();
    return R;
  }
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
  legsAfter(M, R, mins);
  // playing together builds the group; a good night more so
  if (mins > 0 && typeof chemAdd === "function"){ const g = (.6 + (res === "W" ? .6 : 0) + (rating >= 7.5 ? .5 : 0))*(1 - (S.chem || 0)/140); chemAdd(g); M.chemD = (M.chemD || 0) + g; }
  R.chemD = M.chemD || 0;
  socialEvent("match", `${M.nameUs} ${us}–${th} ${M.nameThem}`);
  if (motm) addNews("you", `${S.player.name} named man of the match`, `${M.nameUs} ${us}–${th} ${M.nameThem}. Rated ${rating}.`, "me");
  else if (my.goals >= 2) addNews("you", `${my.goals >= 3 ? "Hat-trick" : "Brace"} for ${S.player.name}!`, `${M.nameUs} ${us}–${th} ${M.nameThem}.`, "me");
  save();
  return R;
}
// what the match leaves in his legs (1.5.2): the minutes on the pitch and how hard they worked (the mean drain a
// minute, else the work rate's), kept on R, where bridge.finish turns them into R.fatigue through the one formula
// there is (stamina.js matchFatigue: 8 for the day itself, which a substitute left on the bench still had, and up to
// 24 more for the minutes, by their intensity), handed to lifeAfterMatch(fatigue) (3.4.3)
function legsAfter(M, R, mins){
  const drain = M.drainPerMin != null ? M.drainPerMin : WR.drain[S.workrate || 2];
  R.mins = mins; R.drain = drain;
}
// the player's match minutes: from MT.on (pairs of match minutes) when every interval has closed, else from the plan
// matchSetup made (a starter the whole game, a rotation player until he was due off, a substitute from his minute on)
function minutesOn(M){
  if (Array.isArray(M.on) && M.on.length && M.on.every(iv => iv && iv[1] != null)) return clamp(M.on.reduce((s, iv) => s + Math.max(0, iv[1] - iv[0]), 0), 0, 90);
  return M.role === "starter" ? 90 : M.role === "rotation" && M.subOff ? M.subOff : M.subOn ? 90 - M.subOn : 0;
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
// chemistry changes, reputation, the stats, the highlights (each clip a button with data-clip, which controller.js plays).
// R: matchRewards' result (plus around: the league's other results). Buttons are the caller's.
function ftCardHTML(M, R){
  const f = M.f, [us, th] = M.score, my = M.my, me = meP(), rating = R.rating, dnp = rating == null;
  const h = M.home ? us : th, a = M.home ? th : us;
  const hGoals = M.home ? M.usGoals : M.themGoals, aGoals = M.home ? M.themGoals : M.usGoals;
  const mo = R.motmId != null && R.motmId >= 0 ? W.players[R.motmId] : null;
  const chem = R.chemD || 0, trust = R.trustD || 0;
  const hl = (M.highlightsFP || []).map((x, i) => `<div class="hl-row ${x.kind}"><span class="hl-ico">${x.icon}</span><span class="hl-min">${x.min}'</span><span class="grow">${esc(x.text)}</span><button class="btn sm ghost" data-clip="${i}">▶ Replay</button></div>`);
  const around = (R.around || []).map(x => `<div class="res"><span>${esc(x.h)}</span><b>${x.hg}–${x.ag}</b><span>${esc(x.a)}</span></div>`).join("");
  const sc = [scorerLine(hGoals), scorerLine(aGoals)];
  return `<div class="eyebrow">Full time · ${esc(compLabel(f))}</div>
    <h2>${esc(sideName(f,"h"))} ${h} – ${a} ${esc(sideName(f,"a"))}</h2>
    ${sc[0] || sc[1] ? `<div class="muted small ft-scorers"><span>${sc[0]}</span><span>${sc[1]}</span></div>` : ""}
    <div class="ft-grid">${dnp ? `<div class="ft-rating dnp"><b>Bench</b><span>You didn't get on</span></div>`
      : `<div class="ft-rating ${rating >= 7.5 ? "hi" : rating < 6 ? "lo" : ""}"><b>${rating}</b><span>Your rating</span></div>`}
      <div class="ft-list">${dnp ? `<div>The manager kept you on the bench today.</div>` : `<div>${my.goals} goal${my.goals === 1 ? "" : "s"} · ${my.assists} assist${my.assists === 1 ? "" : "s"}</div><div>${my.dribbles} dribbles · ${my.spass + my.lpass}/${my.passAtt} passes</div><div>${my.onTarget}/${my.shots} shots on target</div>`}
      ${mo ? `<div>Man of the match: <b>${esc(pname(mo))}</b></div>` : ""}${dnp ? "" : `<div class="gold">+${Math.round(R.xp || 0)} XP${R.bonus ? ` · +${eur(R.bonus)} bonuses` : ""}</div>`}
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
// player is rated by the world's own rating formula (finaliseMatch), and matchRewards applies. Returns its result, with
// the notice (R.notice) the full-time card shows (ui/main.js playedForYou).
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
  // the match is over: the mirror is cleared (missed-match handling and the online sync wait while MT is set), and
  // the record goes back with the result for the full-time card, ftCardHTML(R.M, R)
  R.M = MT;
  MT = null;
  return R;
}
