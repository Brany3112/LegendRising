"use strict";
/* ============ SCREENS ============
   Owner: WP-H (Stage 1: the boot order of a new career, creation, offers, the first day's migration, TUT moved in
   here, the dream's entry points gone), WP-H2 (Stage 2), WP-L (Stage 3: match routing). Contract: DESIGN 3.7.1 (New
   Game paints black at once and waits for window.lifeReady), 3.7.2 (creation and offers after the uncle's line,
   every line on them), 3.7.7 (deletions; the onboarding migration table, onbMigrate), 3.8.2 (the hub's drink goes
   through consume), 1.3 (trust only through trustAdd). */
let LAST_SCREEN = null;
// settles once the 3D world module has loaded (js/life/world.js resolves it), so a new career can wait for it
window.lifeReady = new Promise(r => { window.lifeReadyResolve = r; });
// the generic card layer #tutRoot (confirmations, the promotion card, honours, the office): a token that cancels a
// fade-out still pending when the next card comes up (office.js, admin.js and awards.js count on it too)
const TUT = {tok:0};
function render(html, key){
  document.body.classList.remove("in-match");
  const app = $("#app"), same = !!key && key === LAST_SCREEN;
  app.classList.toggle("still", same);
  if (same) morph(app, html); else { app.innerHTML = html; app.scrollTop = 0; }
  LAST_SCREEN = key || null;
}
function setPhoneVisible(v){ const r = $("#phoneRoot"); if (r) r.classList.toggle("hidden", !v); }
function crest(name, size){ return badgeSVG(name, size || 26, "club"); }
function leagueBadge(name, size){ return badgeSVG(name, size || 22, "league"); }

// "just now", "4 min", "2 h": for the last automatic sync
function sinceShort(at){
  const s = Math.max(0, Math.round((Date.now() - (at || 0))/1000));
  return s < 45 ? "moments" : s < 5400 ? Math.round(s/60) + " min" : Math.round(s/3600) + " h";
}
function playTime(ms){
  const m = Math.floor((ms || 0)/60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
}
function confirmBox(title, text, onYes){
  const r = $("#tutRoot"); if (typeof TUT === "object") TUT.tok++;
  r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="closeConfirm()"></div>
    <div class="tut-card confirm in"><h3>${title}</h3><p>${text}</p>
      <div class="tut-foot"><button class="btn sm ghost" onclick="closeConfirm()">Cancel</button><button class="btn sm danger" id="cfYes">Yes, do it</button></div></div>`;
  $("#cfYes").onclick = () => { closeConfirm(); onYes(); };
}
/* the account box in the menu: sign in, put your careers on the leaderboard, pull them back down */
function accountPanel(){
  if (typeof fbConfigured !== "function" || !fbConfigured()) return "";
  const busy = ONLINE.busy ? `<span class="muted small">${esc(ONLINE.busy)}…</span>` : "";
  if (!ONLINE.user){
    const mode = ONLINE.mode === "up" ? "up" : "in";
    return `<div class="transfer acct">
      <label>Leaderboard account</label>
      <p class="muted small">Sign in to put your career on the board and pick it up on any other computer. Your saves on this device are untouched either way.</p>
      <div class="seg acct-seg"><button class="${mode === "in" ? "on" : ""}" onclick="A.acctMode('in')">Sign in</button><button class="${mode === "up" ? "on" : ""}" onclick="A.acctMode('up')">Create account</button></div>
      ${mode === "up" ? `<input id="acHandle" class="pw wide" type="text" maxlength="20" placeholder="Name shown on the leaderboard">` : ""}
      <input id="acEmail" class="pw wide" type="email" autocomplete="username" placeholder="Email">
      <input id="acPass" class="pw wide" type="password" autocomplete="current-password" placeholder="Password">
      <div id="acMsg" class="pw-msg">${esc(ONLINE.err || "")}</div>
      <button class="btn" onclick="A.acctGo()">${mode === "up" ? "Create account" : "Sign in"}</button>
      ${mode === "in" ? `<button class="linkbtn" onclick="A.acctReset()">Forgot your password?</button>` : ""}
      ${busy}
    </div>`;
  }
  return `<div class="transfer acct">
    <label>Leaderboard account</label>
    <div class="acct-who"><b>${esc((ONLINE.profile && ONLINE.profile.handle) || "Signed in")}</b><span class="muted small">${esc(ONLINE.user.email || "")}</span></div>
    <button class="btn" onclick="A.syncUp()">▲ Sync to leaderboard${S && S.synced ? " now" : ""}</button>
    <p class="muted small">${S && S.synced
      ? `This career is on the board and re-syncs by itself every five minutes${AUTO.last ? ` · last ${AUTO.last.ok ? "synced" : "attempt"} ${sinceShort(AUTO.last.at)} ago` : ""}. Use the button if you want it up there right now.`
      : "Uploads the career on this device, so it is on the leaderboard and safe if you change computer. After the first time it keeps itself up to date on its own."}</p>
    <button class="btn ghost" onclick="A.syncDown()">▼ Restore my career onto this device</button>
    <p class="muted small">Replaces the career here with the one saved to your account.</p>
    <div id="acMsg" class="pw-msg"></div>
    ${busy}
    <button class="linkbtn" onclick="A.acctOut()">Sign out</button>
  </div>`;
}
function acctMsg(t, good){ const m = $("#acMsg"); if (m){ m.textContent = t; m.className = "pw-msg" + (good ? " good" : ""); } }
function closeConfirm(){
  const r = $("#tutRoot"); if (typeof TUT === "object") TUT.tok++; r.className = "tut"; r.innerHTML = "";
  // several honours in one night queue up behind each other
  if (typeof HONOUR_QUEUE === "object" && HONOUR_QUEUE.length) setTimeout(() => showNextHonour(), 240);
}
/* the promotion pop-up: old salary → new salary, one OK button */
function promoBox(p, paid){
  const r = $("#tutRoot"); if (typeof TUT === "object") TUT.tok++;
  r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="closeConfirm()"></div>
    <div class="tut-card confirm promo in">
      <div class="promo-badge">${esc(p.job.icon)}</div>
      <div class="eyebrow">${p.newJob ? "New job" : "Promoted"}</div>
      <h3>You've been promoted for your hard work</h3>
      <p class="muted small">${p.newJob ? `${esc(p.job.name)} took you on.` : `${esc(p.job.name)}.`} You're now <b>${esc(p.to.name)}</b>${p.to.blurb ? `: ${esc(p.to.blurb)}` : ""}</p>
      <div class="promo-pay"><span class="old">${esc(p.from.name)}<b>${payRange(p.from)}</b></span><i>→</i><span class="new">${esc(p.to.name)}<b>${payRange(p.to)}</b></span></div>
      ${p.newJob && typeof jobWhereLine === "function" && JOB_WHERE[p.job.id] ? `<p class="promo-where">${esc(jobWhereLine(p.job.id))}<span>${esc(JOB_WHERE[p.job.id].how[0].toUpperCase() + JOB_WHERE[p.job.id].how.slice(1))}. It's JOB on your compass.</span></p>` : ""}
      ${paid != null ? `<p class="muted small">That shift paid ${eur(paid)}.</p>` : ""}
      <div class="tut-foot end"><button class="btn sm" id="promoOk" onclick="closeConfirm()">OK</button></div></div>`;
  const b = $("#promoOk"); if (b) b.focus();
}
function slotCard(n){
  const m = slotMeta(n);
  if (!m) return `<button class="slot empty" onclick="A.newGame(${n})" style="--i:${n}">
      <div class="slot-no">Your career</div><div class="slot-empty">Empty<span>Start a new career</span></div><div class="slot-go">+</div></button>`;
  return `<div class="slot" style="--i:${n}">
    <div class="slot-no">Your career</div>
    <button class="slot-main" onclick="A.continue(${n})">
      <div class="slot-name">${esc(m.name)}<span class="slot-ovr">${m.ovr}</span></div>
      <div class="slot-club">${esc(m.club)}${m.lg ? ` · ${esc(m.lg)}` : ""}</div>
      <div class="slot-stats">
        <span><b>${m.seasons}</b>season${m.seasons === 1 ? "" : "s"}</span>
        <span><b>${m.apps}</b>match${m.apps === 1 ? "" : "es"}</span>
        <span><b>${m.goals}</b>goals</span>
        <span><b>${m.assists}</b>assists</span>
        <span><b>${playTime(m.ms)}</b>played</span>
        <span><b>${m.age}</b>years old</span>
      </div>
    </button>
    <div class="slot-foot"><button class="btn sm" onclick="A.continue(${n})">Continue ▸</button><button class="linkbtn danger" onclick="A.deleteSlot(${n})">Delete</button></div>
  </div>`;
}
/* the account corner on the title screen: sign in here and you can pick up the career
   that is on your account, on any computer */
/* the sheet behind the account corner: sign in, then pick up the career on your account */
let CLOUD = {info:null, loading:false, checked:false};
function cloudBoxHTML(){
  // opened from anywhere without a look at the account yet: go and look, then fill this in
  if (ONLINE.user && !CLOUD.checked && !CLOUD.loading){ CLOUD.loading = true; setTimeout(() => A.cloudCheck(), 0); }
  const i = CLOUD.info, local = slotMeta(1);
  if (CLOUD.loading) return `<div class="cloud-box"><span class="muted small">Looking at your account…</span></div>`;
  if (!i){
    const p = ONLINE.probe;
    // when the account looks empty, say what was actually looked at: a leaderboard row with no save
    // behind it is a different problem from never having synced at all
    const why = !p ? ""
      : p.err ? `Could not read your account: ${esc(p.err)}`
      : p.board && !p.slots.length ? `You are on the leaderboard${p.boardSlot !== BOARD_NO_SLOT ? ` (save ${esc(String(p.boardSlot))})` : ""}, but no career file came with it. Sync from the computer you play on and it will be here.`
      : !p.board ? "Nothing has ever been synced from this account."
      : "";
    return `<div class="cloud-box"><b>Nothing saved to your account yet</b>
      <span class="muted small">${why || "Play a career and sync it to the leaderboard, and it will be waiting here next time."}</span>
      ${p ? `<span class="cb-probe">account ${esc(String(p.uid).slice(0, 10))}… · leaderboard row ${p.board ? "yes" : "no"} · saves found ${p.slots.length ? esc(p.slots.join(", ")) : "none"} · build ${esc(window.FF_BUILD || "dev")}</span>` : ""}
      ${local ? `<button class="btn" onclick="A.syncUp()">▲ Put the career on this computer on your account</button>` : ""}</div>${cloudAllHTML()}`;
  }
  return `<div class="cloud-box has">
      <div class="eyebrow">On your account</div>
      <b>${esc(i.name)}<span class="cb-ovr">${i.ovr || "–"}</span></b>
      <span class="muted small">${esc(i.club || "Free agent")}${i.seasons ? ` · season ${i.seasons}` : ""}${i.at ? ` · saved ${sinceShort(i.at)} ago` : ""}</span>
      <div class="cb-stats"><span><b>${fmt(i.career.apps || 0)}</b>matches</span><span><b>${fmt(i.career.goals || 0)}</b>goals</span>
        <span><b>${fmt(i.career.assists || 0)}</b>assists</span><span><b>${fmt(i.score || 0)}</b>points</span></div>
      <button class="btn" onclick="A.cloudPull()">▼ Play this career on this computer</button>
      ${local ? `<p class="muted small">This would replace <b>${esc(local.name)}</b> on this device.</p>` : ""}
    </div>${cloudAllHTML()}`;
}
// the account, as it appears inside another sheet (the in-game menu)
// the account box redraws itself in place: a whole-sheet refresh does not always take
function cloudAllHTML(){
  const rows = CLOUD.all || [];
  if (rows.length < 2) return "";
  return `<div class="cloud-other"><div class="eyebrow">Everything on your account</div>
    ${rows.map(r => `<div class="co-row">
      <div class="grow"><b>${esc(r.name)}</b><span class="muted small">${esc(r.club || EMPTY_CELL)} · ${fmt(r.score)} pts · save ${r.n} · ${r.at ? sinceShort(r.at) + " ago" : EMPTY_CELL} · ${r.kb} KB</span></div>
      <button class="btn sm ghost" onclick="A.pullSlot(${r.n})">Play this</button></div>`).join("")}
    <p class="muted small">Careers synced by the older version of the game are kept here. Bringing one down replaces the career on this computer.</p></div>`;
}
function cloudRefresh(){ const box = $("#cloudBox"); if (box) box.innerHTML = cloudBoxHTML(); else refreshSheet(); }
function cloudPanel(){
  const who = (ONLINE.profile && ONLINE.profile.handle) || ONLINE.user.email || "Signed in";
  return `<div class="transfer acct">
    <label>Your account</label>
    <div class="acct-who"><b>${esc(who)}</b><span class="muted small">${esc(ONLINE.user.email || "")}</span></div>
    <div id="cloudBox">${cloudBoxHTML()}</div>
    <div id="acMsg" class="pw-msg"></div>
    <button class="linkbtn" onclick="A.acctOut()">Sign out</button></div>`;
}
function cloudSheet(){
  if (!ONLINE.user){
    return `<h2>Your account</h2>
      <p class="muted">Sign in and the career saved to your account can be picked up here, on any computer.</p>
      ${accountPanel()}`;
  }
  const who = (ONLINE.profile && ONLINE.profile.handle) || ONLINE.user.email || "Signed in";
  const inner = cloudBoxHTML();
  return `<h2>Your account</h2>
    <div class="acct-who"><b>${esc(who)}</b><span class="muted small">${esc(ONLINE.user.email || "")}</span></div>
    <div id="cloudBox">${inner}</div>
    <div id="acMsg" class="pw-msg"></div>
    <button class="linkbtn" onclick="A.acctOut()">Sign out</button>`;
}
function cloudCorner(){
  if (typeof fbConfigured !== "function" || !fbConfigured()) return "";
  const who = ONLINE.user ? ((ONLINE.profile && ONLINE.profile.handle) || ONLINE.user.email || "Signed in") : "";
  return `<button id="cloudCorner" class="cloud-corner${ONLINE.user ? " on" : ""}" onclick="A.cloud()">
    <span class="cc-ico">☁</span><span class="cc-t">${ONLINE.user ? esc(who) : "Sign in"}</span>
    <span class="cc-s">${ONLINE.user ? "Your saved career" : "Pick up a career from your account"}</span></button>`;
}
// a career is lived in first person, the hub lives in your phone. The world's modules may still be loading (a click on
// Continue straight after the page opens): it starts the moment they are, never with nothing (DESIGN 3.7.1)
function enterCity(){
  if (!S) return;
  if (!window.startLife){
    if (location.protocol === "file:") return;          // (no 3D world from a double-clicked file: the hub is the game)
    const s0 = S;
    window.lifeReady.then(() => { if (S === s0 && !document.body.classList.contains("life") && LAST_SCREEN === "hub") enterCity(); });
    return;
  }
  document.body.classList.add("life");
  window.startLife();
}
/* ---------- a new career: black at once, the city, the film, then who you are (DESIGN 3.7.1, 3.7.2) ----------
   Nothing of the flat is ever on screen first: the page goes black the moment New Game is clicked (a loader only if
   it takes a while), the career's shell is built behind it, and the world starts with the intro's own boot plan
   (intro.js), which keeps the screen covered until the city has been drawn from the film's first camera. The
   creation screen comes after your uncle's "Tell me about yourself" (intro.js calls onbCreation). Without a 3D world
   (a double-clicked file, no WebGL 2) the career is made the plain way: creation, offers, the hub. */
const NG = {tok:0};
const worldOK = () => location.protocol !== "file:" && typeof WebGL2RenderingContext !== "undefined";
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function newGameWorld(){
  const tok = ++NG.tok;
  setPhoneVisible(false); closeSheet();
  render(`<section class="onb-black"><div class="onb-loader"><div class="spinner"></div><p>Getting the city ready</p></div></section>`, "black");
  const ld = setTimeout(() => { const l = document.querySelector(".onb-black .onb-loader"); if (l) l.classList.add("on"); }, 600);
  await nextFrame(); await nextFrame();
  if (tok !== NG.tok) return;
  careerShell();
  await nextFrame();
  const ok = await Promise.race([window.lifeReady, new Promise(r => setTimeout(() => r(false), 60000))]);
  clearTimeout(ld);
  if (tok !== NG.tok) return;
  // the world never came (it failed to load): who you are, and the hub
  if (!ok || !window.startLife){ CR = null; screenCreate(); return; }
  document.body.classList.add("life");
  window.startLife({intro:true});
}
// the film has reached "Tell me about yourself" (intro.js): the world stops behind the creation screen
function onbCreation(){
  if (window.stopLife) window.stopLife();
  document.body.classList.remove("life", "cine", "hand", "hub-out");
  const lr = document.getElementById("lifeRoot"); if (lr) lr.style.display = "none";
  const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; }
  setPhoneVisible(false); closeSheet();
  CR = null; screenCreate();
}
window.onbCreation = onbCreation;
/* ---------- the first day's state from an older build (DESIGN 3.7.7, 1.7) ----------
   S.onb = {v:2, step, seen}: the step runner (js/life/firstday.js) works out where you are from the state of the
   world (the bulb in the light, your letters read, the ball moved); seen marks the steps that are only looking at
   something, and what has already happened. Run once per load (resume, and firstday.js before it reads S.onb). */
const ONB_V2 = 2;
function onbMigrate(){
  if (!S) return;
  const o = S.onb;
  if (o && typeof o === "object" && o.v === ONB_V2){ if (!o.seen || typeof o.seen !== "object") o.seen = {}; return; }
  const f = S.flags && typeof S.flags === "object" ? S.flags : (S.flags = {});
  const K = ["FirstTimeIntroductionCompleted", "ApartmentTutorialCompleted", "GameplayTutorialCompleted", "TrainingCenterTutorialCompleted"];
  const old = o && typeof o === "object" ? o : {}, seen = {};
  S.tutDone = true; delete S.replay;
  // all of it done, or a save from before the flags (resume gave those every flag): nothing to teach
  if (K.every(k => f[k]) || old.stage === "done"){ for (const k of K) f[k] = true; S.onb = {v:ONB_V2, step:"done", seen}; return; }
  // "the whole tutorial" now ends with first-person training: not done, unless everything was
  f.GameplayTutorialCompleted = false; f.TrainingCenterTutorialCompleted = false;
  // the neighbour has slammed his door already (the old first arrival): it is not slammed twice
  if (old.slam){ seen.slam = true; seen.H7 = true; if (old.fixed){ seen.H8 = true; seen.H10 = true; } }
  if (!f.FirstTimeIntroductionCompleted){
    // the film again (creation and offers are skipped: you have a name and a club)
    S.onb = {v:ONB_V2, step:"intro", seen};
  } else if (!f.ApartmentTutorialCompleted){
    // the flat's steps resume by what is so (the number plate where it is); the old tour showed the flat, the board
    // and the table
    if (old.stage === "tour") for (const k of ["H2", "H12", "H13"]) seen[k] = true;
    S.onb = {v:ONB_V2, step:"H1", seen};
  } else if (old.stage === "centre"){
    // already at the training centre the old way: the flat and the bus are behind you, so none of the home steps come
    // back and the home rules (the slow clock at home) do not apply. The training centre's own chapters (G1 to G9,
    // DESIGN 3.7.6) pick this career up: the assistant coach meets you at the gate on your next arrival there
    f.ApartmentTutorialCompleted = true;
    for (const k of ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20", "H21"]) seen[k] = true;
    seen.slam = true;
    S.onb = {v:ONB_V2, step:"G1", seen, centre:true};
  } else {
    // the flat was done the old way (the old guide or bus stage): what was only shown or told is seen, what the world
    // can say is checked (the bulb, your post, the ball), and it ends with the compass, the stop and the bus
    for (const k of ["H1", "H2", "H7", "H8", "H10", "H12", "H13", "H14", "H15", "H16", "H18"]) seen[k] = true;
    seen.slam = true;
    S.onb = {v:ONB_V2, step:"H3", seen};
  }
  // the day you are in, while the first day is not over, is excused at the training centre
  if (S.life && S.life.att && typeof S.life.att === "object") S.life.att.excused = true;
}
function screenTitle(){
  if (document.body.classList.contains("life")){
    if (window.stopLife) window.stopLife();
    if (window.lifeReset) window.lifeReset();
    document.body.classList.remove("life");
    const lr = document.getElementById("lifeRoot"); if (lr) lr.style.display = "none";
  }
  setPhoneVisible(false); closeSheet();
  migrateOldSave(); collapseToOneSlot();
  const mix = (a, b, t) => "#" + [0,1,2].map(i => Math.round(a[i] + (b[i] - a[i])*t).toString(16).padStart(2, "0")).join("");
  const bounce = (t, c1, c2) => [...t].map((ch, i) => `<span style="--b:${i};color:${mix(c1, c2, [...t].length > 1 ? i/([...t].length - 1) : 0)}">${ch}</span>`).join("");
  render(`<section class="title-screen">
    <div class="title-inner">
      <div class="eyebrow">A football career from the bottom up</div>
      <h1 class="logo bouncy"><i>${bounce("LEGEND", [255,255,255], [184,199,214])}</i><span>${bounce("RISING", [200,240,96], [255,215,90])}</span></h1>
      <p class="lede">Start in Romanian Liga 4 with a keypad phone and nothing else. Every shot and pass is physics. Every word you post is remembered.</p>
      <div class="slots one">${Array.from({length:SLOTS}, (_, i) => slotCard(i + 1)).join("")}</div>
      <div class="row gap10 center">
        <button class="btn lg ghost" onclick="A.fullscreen()">⛶ Full screen</button>
        <button class="btn lg ghost" onclick="openSheet('settings0')">⚙ Settings</button>
      </div>
      </div>${cloudCorner()}<div class="build build-corner">Version ${esc(window.FF_BUILD || "dev")}</div></section>`, "title");
  if (typeof fbInit === "function" && fbConfigured()) fbInit().then(() => { if (LAST_SCREEN === "title") { const c = $("#cloudCorner"); if (c) c.outerHTML = cloudCorner(); } }).catch(() => {});
}
let CR = null;
/* ---------- creating your player ----------
   One screen: your player large on the left, turning in the light (drag to spin), and on the right four steps:
   who you are, where you play (a pitch you click), how you look, what you are good at. Every change shows at once;
   nothing is fixed until "That's me". The screen redraws itself on a click; the 3D preview survives that.
   The cut and the colour you pick here are the ones you own (DESIGN 3.7.3); other cuts cost money at the barber. */
const CC_TABS = [["you", "Identity"], ["pos", "Position"], ["look", "Appearance"], ["skills", "Abilities"]];
const CC_LOOK = [["body", "Body"], ["face", "Face"], ["hair", "Hair"], ["beard", "Beard"], ["clothes", "Clothing"]];
function screenCreate(){
  CR = CR || {name:"", number:9, pos:"ST", pref:"ST", foot:"Right", nat:"RO", alloc:Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts:30};
  CR.pref = posOrArch(CR.pref || CR.pos); if (!POSITIONS[CR.pref] || CR.pref === "GK") CR.pref = "ST";
  CR.pos = archOf(CR.pref);
  CR.tab = CC_TABS.some(t => t[0] === CR.tab) ? CR.tab : "you";
  CR.lookSec = CC_LOOK.some(t => t[0] === CR.lookSec) ? CR.lookSec : "body";
  /* how you look: a default of your own until you change it, seeded from a token drawn when this screen first opens,
     so every new player starts as somebody different, and what the preview shows is what the career gets
     (the 3D preview needs the world's modules, so not on file://) */
  const looks = typeof lookFormHTML === "function" && location.protocol !== "file:";
  if (!CR.seed) CR.seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (looks){
    CR.look = lookSane(CR.look, "p:" + CR.seed);
    LK.draft = CR.look; LK.where = "create"; LK.only = CR.lookSec;
    // before there is a career: your chosen number on the back, a plain blue kit until a club signs you
    LK.o = {number:clamp(Math.round(num(+CR.number, 9)), 1, 99), age:17, kit:["#2c66b8", "#ffffff"], seed:7};
  }
  const t = CR.tab, idx = CC_TABS.findIndex(x => x[0] === t);
  const nav = `<nav class="cc-tabs" role="tablist">${CC_TABS.map(([k, n], i) => `<button role="tab" aria-selected="${k === t}" onclick="A.ccTab('${k}')"><i>${i + 1}</i>${n}</button>`).join("")}</nav>`;
  const stage = looks ? `<div class="cc-stage card glass">${lkStageHTML()}
      <div class="cc-plate"><b id="ccName">${esc(CR.name.trim() || "Your name")}</b><span><em id="ccNum">#${CR.number}</em> · <em class="cc-posb">${CR.pref}</em> ${esc(POSITIONS[CR.pref].name)}</span></div></div>`
    : `<div class="cc-stage card glass cc-noprev"><div class="cc-plate"><b id="ccName">${esc(CR.name.trim() || "Your name")}</b><span><em id="ccNum">#${CR.number}</em> · ${esc(POSITIONS[CR.pref].name)}</span></div></div>`;
  render(`<section class="page create cc"><div class="page-inner">
    <div class="cc-head"><div><div class="eyebrow">New career</div><h1>Who are you?</h1></div>${nav}</div>
    <div class="cc-grid">${stage}
      <div class="cc-panel card glass">${ccPanel(t)}
        <div class="cc-foot"><button class="btn ghost" onclick="${idx > 0 ? `A.ccTab('${CC_TABS[idx - 1][0]}')` : "A.ccCancel()"}">${idx > 0 ? "← Back" : "Cancel"}</button><span class="grow"></span>
          ${idx < CC_TABS.length - 1 ? `<button class="btn ghost" onclick="A.ccTab('${CC_TABS[idx + 1][0]}')">Next: ${CC_TABS[idx + 1][1]} →</button>` : ""}
          <button class="btn" onclick="A.startCareer()">That's me</button></div>
      </div>
    </div>
  </div></section>`, "create");
  if (looks) lookCreateMount();
}
function ccPanel(t){
  if (t === "pos") return ccPosHTML();
  if (t === "look") return ccLookHTML();
  if (t === "skills"){
    const baseOf = k => 24 + (POS[CR.pos].bonus[k] || 0);
    return `<div class="row between"><h3>Starting abilities</h3><span class="pill">${CR.pts} points left</span></div>
      <p class="muted small">Your position gives you a head start in what it needs. Spread the rest where you like.</p>
      <div class="cc-skills">${SKILLS.map(([k, n, d]) => `<div class="skillrow"><div><b>${n}</b><div class="muted small">${d}</div></div><div class="sv">${baseOf(k) + CR.alloc[k]}${POS[CR.pos].bonus[k] ? `<small class="cc-bon">+${POS[CR.pos].bonus[k]}</small>` : ""}</div>
        <div class="row gap6"><button class="btn sm ghost" aria-label="Less ${esc(n)}" onclick="A.alloc('${k}',-1)">−</button><button class="btn sm ghost" aria-label="More ${esc(n)}" onclick="A.alloc('${k}',1)">+</button></div></div>`).join("")}</div>`;
  }
  return `<h3>Who you are</h3>
    <label>Name</label><input id="nm" type="text" maxlength="24" placeholder="e.g. Andrei Popa" value="${esc(CR.name)}" oninput="A.ccName(this.value)">
    <div class="row gap10">
      <div class="grow"><label>Shirt number</label><input type="number" min="1" max="99" value="${CR.number}" oninput="A.ccNumber(this.value)"></div>
      <div class="grow"><label>Strong foot</label><div class="seg">${["Right", "Left"].map(f => `<button aria-pressed="${CR.foot === f}" onclick="CR.foot='${f}';screenCreate()">${f}</button>`).join("")}</div></div>
    </div>
    <label>Nationality</label><div class="seg wrap">${HOME_NATS.map(n => `<button aria-pressed="${CR.nat === n}" onclick="CR.nat='${n}';screenCreate()">${NAMES[n].n}</button>`).join("")}</div>
    <p class="muted small">You start at 17 in Romanian Liga 4, whatever your nationality.</p>`;
}
// the pitch: your goal at the bottom, theirs at the top; click where you want to play
function ccPosHTML(){
  const sel = CR.pref, P = POSITIONS[sel], arch = archOf(sel);
  const mix = MOMENT_MIX[arch] || MOMENT_MIX.ST, shoot = mix.run + mix.wing + mix.oneonone + mix.edge + mix.penalty + mix.freekick;
  const pct = Math.round(100*shoot/Object.values(mix).reduce((a, b) => a + b, 0));
  const bon = Object.entries(POS[arch].bonus).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `<span class="pill">${esc(skillName(k))} +${v}</span>`).join("");
  const alt = (POS_NEAR[sel] || []).slice(0, 3).map(k => `<b>${k}</b>`).join(", ");
  const marks = POSITION_ORDER.map(k => { const Q = POSITIONS[k], gk = k === "GK";
    return `<button class="pp-m${k === sel ? " on" : ""}${gk ? " off" : ""}" style="left:${Q.x}%;top:${100 - Q.y}%" aria-pressed="${k === sel}"
      ${gk ? `disabled title="Goalkeeper careers are not playable yet"` : `title="${esc(Q.name)}" onclick="A.ccPos('${k}')"`}>${k}</button>`; }).join("");
  return `<div class="row between"><h3>Preferred position</h3><span class="pill">${esc(POS[arch].name)} role</span></div>
    <div class="pp"><div class="pp-pitch" role="group" aria-label="Pick your position on the pitch">
        <div class="pp-l pp-half"></div><div class="pp-l pp-circle"></div><div class="pp-l pp-box t"></div><div class="pp-l pp-box b"></div>
        <div class="pp-l pp-six t"></div><div class="pp-l pp-six b"></div><span class="pp-att">Attack ↑</span>${marks}</div>
      <div class="pp-info"><div class="pp-code">${sel}</div><h4>${esc(P.name)}</h4>
        <p class="muted small">${esc(POS[arch].blurb)}</p>
        <div class="pos-mix"><span>In a game</span><div class="meter thin"><i style="width:${pct}%"></i></div><b>${pct}% chances on goal</b></div>
        <div class="pp-bon">${bon}</div>
        <p class="muted small">This is where you want to play. Every club has its own shape: if yours has no ${sel}, the manager plays you in the nearest role${alt ? ` (${alt})` : ""}. You can ask him to move you later.</p>
      </div></div>`;
}
function ccLookHTML(){
  if (!(typeof lookFormHTML === "function" && location.protocol !== "file:")) return `<h3>Appearance</h3><p class="muted">The 3D preview needs the game served over http(s). You can change your look later at the mirror at home.</p>`;
  return `<div class="row between"><h3>Appearance</h3><button class="btn sm ghost" onclick="lkRandom()">🎲 Randomise</button></div>
    <div class="seg wrap cc-sub" role="tablist">${CC_LOOK.map(([k, n]) => `<button role="tab" aria-selected="${k === CR.lookSec}" aria-pressed="${k === CR.lookSec}" onclick="A.ccLook('${k}')">${n}</button>`).join("")}</div>
    <div class="lk-ctl cc-ctl" id="lkCtl">${lookFormHTML(CR.look, CR.lookSec)}</div>
    <p class="muted small" id="ccLookNote">${ccLookNote(CR.lookSec)}</p>`;
}
// under the look controls: under the hair, what a cut chosen here means for later (DESIGN 3.7.3)
function ccLookNote(sec){
  return sec === "hair" ? "This is your starting cut. Other styles cost money at the barber, and you keep the ones you've paid for."
    : "Your face and build stay as you make them here. At home the mirror changes your clothes, and any cut or colour you own.";
}
function screenOffers(){
  setPhoneVisible(false);
  const {ctx, list} = S.offerSet;
  const head = ctx === "start" ? ["Your first contract", "Three Liga 4 clubs want to see you. Pick one.", "Your keypad phone only lets you take a basic deal. You can negotiate once you own a smartphone."]
    : ["Summer", "Your contract is up", "Pick where you play next season. Your current club's renewal is first."];
  render(`<section class="page"><div class="page-inner">
    <div class="eyebrow">${head[0]}</div><h1>${head[1]}</h1><p class="lede">${head[2]}</p>
    <div class="grid3">${list.map((o, i) => { const c = W.clubs[o.club];
      return `<div class="card glass offer rise" style="animation-delay:${i*80}ms">${crest(c.nm, 44)}<h3>${esc(c.nm)}</h3>
        <div class="muted small">${esc(W.leagues[c.lg].nm)} · rep ${pad5(c.rep)}${o.renewal ? " · your club" : ""}</div>
        <div class="kvs"><div><span>Wage</span><b>${eur(o.wage)}/week</b></div><div><span>Role</span><b>${ROLE[o.role]}</b></div><div><span>Length</span><b>${o.years} season${o.years > 1 ? "s" : ""}</b></div><div><span>Signing bonus</span><b>${eur(o.sign)}</b></div></div>
        <button class="btn" onclick="A.sign(${i})">Sign</button></div>`; }).join("")}</div>
  </div></section>`, "offers");
}

/* ---------- the hub ---------- */
function hubState(){
  const fx = myFixtures(), next = fx.find(f => !f.done), me = meP();
  return {fx, next, me, c:myClub(), win:windowAt(S.week)};
}
function renderHub(){ try{ renderHubInner(); }catch(e){
  console.error("renderHub failed", e);
  S.faults = (S.faults || []).concat([{gw:gw(), wk:S.week, at:"hub", m:String(e && e.message || e).slice(0, 160)}]).slice(-20);
  render(`<section class="page"><div class="page-inner"><h1>Something on this screen wouldn't draw</h1>
    <p class="muted">The career is fine and the week can still be played. Send the details and it will be fixed.</p>
    <div class="row gap10"><button class="btn" onclick="A.faultReport()">Copy the details</button>
      <button class="btn ghost" onclick="A.endWeek()">Try the next week</button>
      <button class="btn ghost" onclick="screenTitle()">Back to the title screen</button></div>
    <textarea id="faultOut" class="codebox" style="display:none"></textarea></div></section>`, "hubfail");
} }
function renderHubInner(){
  // an honour won while the week was simulating gets its moment as soon as you are back on the hub
  if (typeof HONOUR_QUEUE === "object" && HONOUR_QUEUE.length) setTimeout(() => showNextHonour(), 260);
  if (MT){ clearTimeout(MT.timer); MT = null; } loopOn = false; M = null;
  if (ensureClub()) return screenOffers();          // a free agent picks a club before anything else
  if (S.offerSet) return screenOffers();
  setPhoneVisible(true);
  const {fx, next, me, c, win} = hubState();
  const lg = W.leagues[c.lg], pos = sortTab(lg.tab).indexOf(c.id) + 1, need = xpNeed(), k = S.contract;
  const inj = me.inj > 0;
  const life = typeof lifeMode === "function" && lifeMode();
  const fxHtml = fx.length ? fx.map(f => {
    const d = W.done[f.key], home = f.kind === "N" ? f.h === me.nat : f.h === me.club, sl = life ? fixtureSlot(f) : null;
    const today = life && sl.wd === S.life.wd;
    return `<div class="fx ${d ? "done" : today ? "next" : f === next && !life ? "next" : ""}"><div class="fx-comp">${esc(compLabel(f))}</div>
      <div class="fx-teams">${f.kind !== "N" ? crest(sideName(f,"h"), 18) : ""}<span>${esc(sideName(f,"h"))}</span><b>${d ? `${d.hg}–${d.ag}` : "vs"}</b><span>${esc(sideName(f,"a"))}</span>${f.kind !== "N" ? crest(sideName(f,"a"), 18) : ""}</div>
      <div class="fx-meta">${home ? "Home" : "Away"}${d ? " · played" : life ? ` · ${today ? "TODAY" : dayName(sl.wd)} ${fmtTime(sl.min)}` : ""}</div></div>`; }).join("")
    : `<div class="empty">No match for you this week.${CAL.INTL.includes(S.week) ? " International break." : ""}</div>`;
  const banned = !inj && (S.ban || 0) > 0;
  // living it day by day there is no button that skips time: you sleep, and the week turns on its own
  const tf = life ? todaysFixture() : null;
  const cta = life ? `<div class="life-cta ${tf ? "match" : ""}"><b>${todayName()} · ${fmtTime(S.life.min)}</b><span>${tf
      ? (inj ? "Match today, but you're injured and will watch from the stand." : banned ? "Match today, but you're suspended." : `Match today at ${fmtTime(fixtureSlot(tf).min)}. Walk out of the tunnel at the training ground.`)
      : `${esc(todayLine())}. Sleep in your own bed to move on to tomorrow.`}</span></div>`
    : next ? (inj ? `<button class="btn lg" onclick="A.endWeek()">Injured: watch from the stands, next week →</button>`
      : banned ? `<button class="btn lg" onclick="A.endWeek()">Suspended: ${S.ban} match${S.ban === 1 ? "" : "es"} to sit out, next week →</button>`
      : `<button class="btn lg pulse" onclick="A.playMatch()">Play ${next.kind === "N" ? "for your country" : "match"} →</button>`)
    : `<button class="btn lg" onclick="A.endWeek()">Next week →</button>`;
  const news = S.news.slice(0, 7);
  render(`<section class="hub">
    
    <header class="topbar glass">
      <div class="tb-club" onclick="A.secretTap()">${crest(c.nm, 38)}<div><b>${esc(c.nm)}</b><span>${leagueBadge(lg.nm, 14)} ${esc(lg.nm)} · ${ord(pos)} · ${monthName(S.week)} ${calYear(S.week)} · Week ${S.week + 1}/${CAL.W}</span></div></div>
      <div class="tb-chips">
        <span class="chip ${win.open ? "open" : ""}" title="Transfer window">${win.open ? `● ${win.name} window open · ${win.left} wk left` : `Window shut · ${win.next} in ${win.opens} wk`}</span>
        <span class="chip">REP <b>${pad5(me.rep)}</b></span><span class="chip">WORLD <b>${pad5(me.wrep)}</b></span>
        <button class="chip flagbtn${patchUnseen() ? " unread" : ""}" title="Patch notes" onclick="A.patch()"><span class="fl">⚑</span>Updates${patchUnseen() ? `<i class="dotn"></i>` : ""}</button>
      </div>
      <div class="row gap6"><button class="icon-btn tb-phone" title="Phone" aria-label="Phone" onclick="togglePhone()">▮<i class="badge ph-badge"></i></button><button class="icon-btn" title="Full screen" onclick="A.fullscreen()">⛶</button><button class="icon-btn" title="Menu" onclick="A.menu()">☰</button></div>
    </header>
    <main class="hub-grid">
      <section class="card glass me-card rise">
        <div class="row gap10"><div class="ovr-ring" style="--p:${overall()}"><b>${overall()}</b><span>OVR</span></div>
          <div><h2>${esc(S.player.name)}</h2><div class="muted">#${S.player.number} · ${esc(teamPosText())} · ${S.player.age} · ${NAMES[S.player.nat].n}</div>
          <div class="row gap6 wrap" style="margin-top:6px"><span class="pill">${ROLE[currentRole()]}</span>${inj ? `<span class="pill bad">Injured · ${me.inj} wk</span>` : ""}${(S.ban || 0) > 0 ? `<span class="pill bad">Suspended · ${S.ban}</span>` : ""}${(S.cards && S.cards.run) ? `<span class="pill">🟨 ${S.cards.run}</span>` : ""}${S.sp ? `<span class="pill gold">${S.sp} skill points</span>` : ""}</div></div></div>
        <div class="meter-row"><span>Energy</span><div class="meter energy"><i style="width:${S.energy}%"></i></div><b>${Math.round(S.energy)}</b></div>
        ${life ? `<div class="meter-row"><span>Fatigue</span><div class="meter fatigue"><i style="width:${num(S.fatigue, 0)}%"></i></div><b>${Math.round(num(S.fatigue, 0))}</b></div>
        <div class="meter-row"><span>Chemistry</span><div class="meter chem"><i style="width:${num(S.chem, 0)}%"></i></div><b>${Math.round(num(S.chem, 0))}</b></div>` : ""}
        <div class="meter-row"><span>Level ${S.level}</span><div class="meter xp"><i style="width:${100*S.xp/need}%"></i></div><b>${S.xp}/${need}</b></div>
        ${(() => { const js = jobState(), jn = jobNeed(), top = jobIsTop(), {job, rank} = myJob();
          // at the top of the ladder there is nothing left to earn towards: you just keep working for the money
          return `<div class="job-row${top ? " maxed" : ""}" title="${top ? "Top of the ladder. Keep working for the money" : "Work experience. Fill the bar to get promoted"}">
            <div class="job-head"><span class="ji">${job.icon}</span><b>${esc(rank.name)}</b><span class="muted">${top ? "top rank" : esc(job.name)}</span><em>${top ? payRange(rank) : `${js.xp}/${jn}`}</em></div>
            <div class="meter work"><i style="width:${top ? 100 : Math.min(100, 100*js.xp/jn)}%"></i></div></div>`; })()}
        <div class="kvs"><div class="kv-money"><span>Money</span><b>${eurFull(S.money)}</b></div>${k ? `<div><span>Wage</span><b>${eur(k.wage)}/wk${k.loan ? " (loan)" : ""}</b></div><div><span>Contract</span><b>${k.years} season${k.years !== 1 ? "s" : ""}${k.promised ? " · promised" : ""}</b></div>` : ""}
          <div class="kv-season"><span>Season</span><b>${S.seasonMy.apps} apps · ${S.seasonMy.goals} G · ${S.seasonMy.assists} A</b></div><div><span>Day job</span><b>${fmt(jobState().shifts || 0)} shift${(jobState().shifts || 0) !== 1 ? "s" : ""} worked</b></div>
          <div class="kv-value"><span>Value</span><b>${eur(marketValue(me))}</b></div></div>
        <button class="btn sm ghost wide" onclick="openSheet('cabinet')">🏆 Trophy cabinet${(S.trophies.length + S.awards.length) ? ` (${S.trophies.length + S.awards.length})` : ""}</button>
        <button class="btn sm ghost wide" onclick="openSheet('skills')">Upgrade skills${S.sp ? ` (${S.sp})` : ""}</button>
        ${life ? "" : `<div class="drink-row"><button class="btn sm drink" ${S.inv.drink ? "" : "disabled"} onclick="A.drink('drink')">Energy-UP ×${S.inv.drink}</button>
          <button class="btn sm drink" ${S.inv.max ? "" : "disabled"} onclick="A.drink('max')">Energy-UP MAX ×${S.inv.max}</button></div>`}
        <div class="activities me-acts">
          ${life ? "" : tile("train", "Train", "🏃", S.actions && S.energy >= trainCost() && !inj, inj ? "You're injured" : !S.actions ? "No actions left this week" : `Too tired. You need ${trainCost()} energy`)}
          ${tile("staff", "Staff", "🧑‍🏫", true)}
          ${life ? "" : tile("rest", "Rest at home", "🛏", S.actions > 0, "No actions left this week")}
          ${life ? tile("media", "Media", "🎙", !S.today.media && S.energy >= MEDIA_COST && !inj, inj ? "You're injured" : S.today.media ? "Done for today" : `Too tired. You need ${MEDIA_COST} energy`)
            : tile("media", "Media", "🎙", S.actions && S.energy >= MEDIA_COST && !inj, inj ? "You're injured" : !S.actions ? "No actions left this week" : `Too tired. You need ${MEDIA_COST} energy`)}
          ${tile("manager", "Manager", "🧑‍💼", !!myClub(), "You have no club")}
        </div>
        ${myClub() ? formStrip() : ""}
      </section>
      <div class="col-week">
      <section class="card glass week-card rise" style="animation-delay:60ms">
        <div class="row between"><h3>This week</h3><span class="pill">${life ? `${todayName()} · ${fmtTime(S.life.min)}` : `${S.actions} action${S.actions !== 1 ? "s" : ""} left`}</span></div>
        <div class="fxlist">${fxHtml}</div>
        ${cta}
        <div class="activities week-acts">
          ${life ? `<div class="tile info" title="Your workplace: ${esc(JOB_WHERE[jobState().id].how)}"><span class="ti">${myJob().job.icon}</span><span>${esc(jobLabel())}</span><span class="tile-why">Clock in at work · ${esc(JOB_WHERE[jobState().id].area)}</span></div>`
            : tile("work", jobLabel(), myJob().job.icon, S.actions && S.energy >= 8 && !inj, workWhy(inj))}
          ${tile("mall", "Mall", "🛍", true)}
          ${tile("clothes", "Clothes", "👕", true)}
        </div>
      </section>
      <section class="card glass squad-card rise" style="animation-delay:150ms">${squadPanel()}</section>
      </div>
      <div class="col-news">
      <section class="card glass news-card rise" style="animation-delay:120ms">
        <div class="row between"><h3>Headlines</h3><span class="muted small">${S.phone === "smart" ? "More in Rising News" : "Buy a smartphone for the full feed"}</span></div>
        <div class="headlines">${news.length ? news.map(n => `<div class="hl ${n.tag || n.cat}"><span class="tag">${{you:"YOU", rival:"RIVAL", league:"LEAGUE", transfer:"TRANSFER", award:"AWARD", world:"WORLD", intl:"NATIONAL"}[n.tag === "rival" ? "rival" : n.cat] || "NEWS"}</span><b>${esc(n.title)}</b><span class="muted small">${esc(n.body)}</span></div>`).join("") : `<div class="empty">Nothing yet. Go make headlines.</div>`}</div>
      </section>
      <section class="card glass lgpanel-card rise" style="animation-delay:180ms">${leaguePanel()}</section>
      </div>
    </main>
  </section>`, "hub");
  phoneBadge();
}
/* the flag only wears a dot until you've read the newest notes: it never interrupts you */
function patchUnseen(){ return !!(typeof PATCH !== "undefined" && PATCH.length && S && S.seenPatch !== PATCH[0].v); }
/* ---------- your team: the eleven laid out on the pitch, with the bench beside it ---------- */
const LINE_ORDER = ["GK", "DF", "CM", "CAM", "LW", "RW", "ST"];
// sort the eleven into the lines a coach would draw, back to front
function formationLines(xi){
  const by = k => xi.filter(p => p.pos === k);
  const back = by("DF"), mid = by("CM"), am = by("CAM");
  const wide = by("LW").concat(by("RW")), front = by("ST");
  const lines = [by("GK"), back, mid, am, wide.concat(front).length ? wide.concat(front) : []];
  return lines.filter(l => l.length);
}
function formationName(xi){
  return formationLines(xi).slice(1).map(l => l.length).join("-");
}
// left to right across a line, wingers on their own side
function spread(line){
  const order = line.slice().sort((a, b) => {
    const w = q => q.pos === "LW" ? -1 : q.pos === "RW" ? 1 : 0;
    return w(a) - w(b);
  });
  // spread across the width with a margin at each touchline, so a back four never piles up
  const n = order.length, m = 8;
  return order.map((p, i) => ({p, x:n === 1 ? 50 : m + (i + .5)/n*(100 - m*2)}));
}
function pitchToken(p, x, y, me){
  const mine = p.id === me.id;
  return `<div class="pt${mine ? " me" : ""}${p.inj > 0 ? " inj" : ""}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"
      title="${esc(pname(p))} · ${esc(p.pos)} · ${p.age} · ${eurK(marketValue(p))}">
      <span class="pt-dot ${esc(p.pos)}"><b>${p.ovr}</b></span>
      <span class="pt-nm">${esc(sname(p))}</span></div>`;
}
function squadPanel(){
  const c = myClub(); if (!c) return `<div class="empty">You have no club yet.</div>`;
  const me = meP(), xi = lineup(c.id);
  const inXi = new Set(xi.map(p => p.id));
  const bench = squadOf(c.id).filter(p => !inXi.has(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, 7);
  const lines = formationLines(xi);
  // the keeper sits on his line, the rest are spread up the pitch towards the goal they attack
  const tokens = lines.map((line, li) => {
    const y = 90 - li*(78/Math.max(1, lines.length - 1));
    return spread(line).map(({p, x}) => pitchToken(p, x, y, me)).join("");
  }).join("");
  const avg = Math.round(xi.reduce((t, p) => t + p.ovr, 0)/Math.max(1, xi.length));
  return `<div class="row between sq-title"><h3>Your squad</h3>
      <span class="muted small">${crest(c.nm, 14)} ${esc(formationName(xi))} · ${avg} OVR</span></div>
    <div class="sq-wrap">
      <div class="pitch-mini"><div class="pm-lines"></div><div class="pm-box"></div>${tokens}</div>
      <div class="bench">
        <div class="bench-h">Substitutes</div>
        ${bench.map(p => `<div class="bn-row${p.id === me.id ? " me" : ""}" title="${esc(pname(p))} · ${p.age} · ${eurK(marketValue(p))}">
          <span class="bn-pos ${esc(p.pos)}">${esc(p.pos)}</span>
          <span class="bn-nm">${esc(sname(p))}</span>
          <span class="bn-ovr">${p.inj > 0 ? `<i>${p.inj}w</i>` : p.ovr}</span></div>`).join("")
          || `<div class="empty">Nobody else fit.</div>`}
      </div>
    </div>`;
}
/* ---------- the league panel under the headlines: table, top scorers, top assists ---------- */
let LGTAB = "table";
function setLgTab(t){ LGTAB = t; renderHub(); }
// everyone playing in a league, with that league's season stats
function leaguePlayers(lg){
  const out = [];
  for (const cid of lg.clubs) for (const p of squadOf(cid)) if (p && p.st && p.st.ap) out.push(p);
  return out;
}
function chartRows(lg, key){
  return leaguePlayers(lg).filter(p => p.st[key] > 0)
    .sort((a, b) => b.st[key] - a.st[key] || b.st[key === "g" ? "a" : "g"] - a.st[key === "g" ? "a" : "g"] || a.st.ap - b.st.ap)
    .slice(0, 20);
}
function chartHTML(lg, key){
  const rows = chartRows(lg, key), mine = meP().id;
  const all = leaguePlayers(lg), myRow = all.find(p => p.id === mine);
  const rank = myRow && myRow.st[key] > 0 ? all.filter(p => p.st[key] > myRow.st[key]).length + 1 : 0;
  const foot = !myRow || rows.some(p => p.id === mine) ? ""
    : `<div class="st-you"><b>You</b><span>${myRow.st[key]} ${key === "g" ? "goal" : "assist"}${myRow.st[key] === 1 ? "" : "s"} in ${myRow.st.ap} ${myRow.st.ap === 1 ? "match" : "matches"}${rank ? ` · ${ord(rank)}` : ""}</span></div>`;
  if (!rows.length) return `<div class="empty">No ${key === "g" ? "goals" : "assists"} in ${esc(lg.nm)} yet this season.</div>${foot}`;
  return `<table class="tbl chart"><thead><tr><th>#</th><th class="l">Player</th><th class="l">Club</th><th>MP</th><th>${key === "g" ? "G" : "A"}</th></tr></thead><tbody>${
    rows.map((p, i) => `<tr class="${p.id === mine ? "me" : ""}"><td>${i + 1}</td><td class="l">${esc(pname(p))}</td>
      <td class="l"><span class="clubcell">${crest(W.clubs[p.club].nm, 13)}<span class="cn">${esc(W.clubs[p.club].nm)}</span></span></td>
      <td>${p.st.ap}</td><td><b>${p.st[key]}</b></td></tr>`).join("")}</tbody></table>${foot}`;
}
function leaguePanel(){
  const c = myClub(); if (!c) return `<div class="empty">No club yet.</div>`;
  const lg = W.leagues[c.lg];
  const tabs = [["table", "Leaderboard"], ["g", "Top Scorer"], ["a", "Top Assists"]];
  let body;
  if (LGTAB === "table") body = tableHTML(lg.tab, sortTab(lg.tab), lg);
  else body = chartHTML(lg, LGTAB);
  return `<div class="row between"><h3>${esc(lg.nm)}</h3><span class="muted small">${leagueBadge(lg.nm, 14)} ${esc(COUNTRIES[lg.cc].name)}</span></div>
    <div class="seg lgseg">${tabs.map(([k, l]) => `<button class="${LGTAB === k ? "on" : ""}" onclick="setLgTab('${k}')">${l}</button>`).join("")}</div>
    <div class="lgbody">${body}</div>`;
}
function tile(id, label, icon, enabled, why){
  // a greyed-out tile says why; the rank you've reached is never the reason
  return `<button class="tile" ${enabled ? "" : "disabled"} title="${esc(enabled ? label : (why || label))}" onclick="A.tile('${id}')">
    <span class="ti">${icon}</span><span>${label}</span>${!enabled && why ? `<span class="tile-why">${esc(why)}</span>` : ""}</button>`;
}
// why the day-job tile is greyed out, if it is
function workWhy(inj){
  if (inj) return "You're injured";
  if (!S.actions) return "No actions left this week";
  if (S.energy < 8) return "Too tired. You need 8 energy";
  return "";
}
function trainCost(){ return 14 - (carTier() >= 2 ? 3 : 0); }

/* ---------- sheets (mall, staff, training, skills, menu) ---------- */
function openSheet(kind){
  const r = $("#sheetRoot"); let body = "";
  if (kind === "train"){
    body = `<h2>Training</h2><p class="muted">Pick a focus. With the matching coach you get +50% XP and a good chance of a free skill point.</p>
      <div class="grid2 tight">${Object.entries(TRAIN).map(([id, t]) => { const has = t.coach && S.staff[t.coach];
        return `<button class="opt" onclick="A.train('${id}')"><b>${t.name}</b><span class="muted small">${t.skills ? t.skills.map(k => SKILLS.find(s => s[0] === k)[1]).join(", ") : "All-round work"}</span>
        <span class="pill ${has ? "good" : ""}">${t.coach ? (has ? "Coach hired" : "No coach") : (S.staff.trainer ? "Personal trainer" : "Basic")}</span></button>`; }).join("")}</div>
      <p class="muted small">Costs ${trainCost()} energy and one action.</p>`;
  } else if (kind === "mall"){
    const lifeNow = typeof lifeMode === "function" && lifeMode();
    // in the first-person world food, drinks and furniture are bought in person, in the shops on your street
    const sold = SHOP.filter(s => !lifeNow || s.life !== false);
    const cats = [...new Set(sold.map(s => s.cat))].filter(c => !lifeNow || (c !== "Food" && c !== "Energy"));
    body = `<h2>Mall</h2><p class="muted">You have ${eur(S.money)}.${lifeNow ? " Food and drinks: the Mini Market on your street, or Foodies on your phone. Beds, fridges and furniture: the furniture store next to your block." : ""}</p>` + cats.map(cat => `<h4>${cat}</h4><div class="shopgrid">${sold.filter(s => s.cat === cat).map(it => {
      const owned = it.stack ? false : it.id === "smartphone" ? S.phone === "smart" : !!S.items[it.id];
      const outgrown = it.tier && ((it.cat === "Home" && homeTier() > it.tier) || (it.cat === "Car" && carTier() > it.tier));
      return `<div class="shopitem ${owned ? "owned" : ""}"><div class="row between"><b>${it.name}</b><span class="price">${eur(it.price)}</span></div><p class="muted small">${it.desc}${it.stack ? ` · you have ${S.inv[it.id] || 0}` : ""}</p>
        ${owned ? `<span class="pill good">Owned</span>` : outgrown ? `<span class="pill">You've moved up</span>` : `<button class="btn sm" ${S.money >= it.price ? "" : "disabled"} onclick="A.buy('${it.id}')">Buy</button>`}</div>`; }).join("")}</div>`).join("");
  } else if (kind === "cabinet"){
    body = cabinetSheet();
  } else if (kind === "cloud"){
    body = cloudSheet();
  } else if (kind === "press"){
    body = pressSheet();
  } else if (kind === "media"){
    body = mediaSheet();
  } else if (kind === "manager"){
    body = officeSheet();
  } else if (kind === "pos"){
    body = posSheet();
  } else if (kind === "staff"){
    body = `<h2>Staff</h2><p class="muted">Weekly wages come out with your pay. Currently ${eur(staffCost())}/week.</p><div class="shopgrid">${STAFF.map(s => {
      const has = S.staff[s.id], fee = s.pct ? `${Math.round(s.pct*100)}% of wage` : `${eur(s.weekly)}/wk`;
      return `<div class="shopitem ${has ? "owned" : ""}"><div class="row between"><b>${s.name}</b><span class="price">${s.hire ? eur(s.hire) + " + " : ""}${fee}</span></div><p class="muted small">${s.desc}</p>
        ${has ? `<button class="btn sm ghost" onclick="A.fire('${s.id}')">Let go</button>` : `<button class="btn sm" ${S.money >= s.hire ? "" : "disabled"} onclick="A.hire('${s.id}')">Hire</button>`}</div>`; }).join("")}</div>`;
  } else if (kind === "skills"){
    body = `<h2>Skills</h2><p class="muted">${S.sp} skill points. Upgrades cost 1 point below 50, 2 below 75, then 3.</p>
      <p class="muted small">Each skill also fills its own bar as you play: shooting builds power and accuracy, beating a man builds dribbling, and so on. Fill it and that skill goes up by 1 for free.</p>
      ${SKILLS.map(([k,n,d]) => { const v = S.skills[k], c = skillCost(v), xp = (S.skillXp && S.skillXp[k]) || 0, need = skillNeed(k), pct = v >= 99 ? 100 : Math.round(100*xp/need);
      return `<div class="skillrow"><div><b>${n}</b><div class="muted small">${d}</div><div class="meter thin"><i style="width:${v}%"></i></div>
        <div class="xprow"><div class="meter xp"><i style="width:${pct}%"></i></div><span class="muted small">${v >= 99 ? "max" : `${Math.round(xp)}/${need} xp`}</span></div></div>
        <div class="sv">${v}</div><button class="btn sm" ${S.sp >= c && v < 99 ? "" : "disabled"} onclick="A.up('${k}')">+1 (${c})</button></div>`; }).join("")}`;
  } else if (kind === "clothes"){
    const shop = S.shopOpenId ? SHOPS.find(s => s.id === S.shopOpenId) : null, r = shopRep(), bonus = styleBonus();
    if (!shop){
      body = `<h2>Clothes</h2><p class="muted">Reputation ${fmt(r)} · ${clothesOwned()} item${clothesOwned() === 1 ? "" : "s"} owned · <b class="lime">+${(bonus*100).toFixed(2)}%</b> reputation and followers</p>
        <p class="muted small">What you wear changes how people see you. Every item you own boosts the reputation you earn from playing and how fast your following grows: low end +0.25% each, mid end +0.5%, high end +1%. Better shops unlock as your reputation grows.</p>
        ${SHOPS.map(sh => { const open = shopOpen(sh), owned = sh.items.filter(i => ownsCloth(i.id)).length;
          return `<button class="shoprow ${open ? "" : "locked"}" ${open ? `onclick="A.openShop('${sh.id}')"` : "disabled"}>
            ${shopLogo(sh)}
            <div class="grow"><b>${esc(sh.nm)}</b> <span class="tierpill ${sh.tier}">${CLOTHES_TIER[sh.tier].label}</span>
              <div class="muted small">${esc(sh.blurb)}</div>
              <div class="stars">${starsHTML(sh.stars)}<span class="muted small">Reputation ${fmt(sh.rep)}${open ? "" : `, you have ${fmt(r)}`}</span></div></div>
            <div class="shopright">${open ? `${owned}/${sh.items.length}` : "🔒"}</div></button>`; }).join("")}`;
    } else {
      const open = shopOpen(shop);
      body = `<div class="shophead">${shopLogo(shop)}<h2>${esc(shop.nm)}</h2></div>
        <div class="stars">${starsHTML(shop.stars)}<span class="muted small">${CLOTHES_TIER[shop.tier].label} · +${(CLOTHES_TIER[shop.tier].per*100).toFixed(2)}% each · Reputation ${fmt(shop.rep)}</span></div>
        <p class="muted">You have ${eur(S.money)}. ${open ? "" : "<b>Locked.</b>"}</p>
        <div class="shopgrid">${shop.items.map(it => { const own = ownsCloth(it.id);
          return `<div class="shopitem ${own ? "owned" : ""}"><div><b>${esc(it.n)}</b><div class="muted small">${eur(it.p)}</div></div>
            <button class="btn sm" ${own || !open || S.money < it.p ? "disabled" : ""} onclick="A.buyCloth('${it.id}')">${own ? "Owned" : "Buy"}</button></div>`; }).join("")}</div>
        <button class="btn ghost" onclick="A.openShop(null)">← All shops</button>`;
    }
  } else if (kind === "admin"){
    body = adminHTML();
  } else if (kind === "settings0"){
    body = `<h2>Settings</h2><div class="stack"><div><label>Graphics</label>${gfxSeg("A.gfx0")}</div>
      <button class="btn ghost" onclick="A.fullscreen()">⛶ Toggle full screen</button>
      <div class="transfer">
        <label>Import a save from another device</label>
        <textarea id="impCode0" class="codebox" placeholder="Paste a save code"></textarea>
        <div class="row gap6 wrap">${(() => { const m = slotMeta(1);
          return `<button class="btn sm ghost" onclick="A.importSave(1)">Import${m ? " (replaces your career)" : ""}</button>`; })()}</div>
        <p class="muted small">Get the code from <b>☰ → Save game</b> on the device you played on.</p>
      </div></div>`;
  } else if (kind === "menu"){
    body = `<h2>Menu</h2><div class="stack">
      <button class="btn" onclick="A.fullscreen()">⛶ Toggle full screen</button>
      <div><label>Graphics</label>${gfxSeg("A.gfx")}</div>
      ${window.fpSettingsHTML ? `<div><label>Matches</label>${window.fpSettingsHTML()}</div>` : ""}
      <button class="btn ghost" onclick="saveNow();toast('Saved','good')">Save now</button>
      <button class="btn ghost" onclick="A.faultReport()">🩺 Report a problem: copy the details${S && S.faults && S.faults.length ? ` (${S.faults.length})` : ""}</button>
      <textarea id="faultOut" class="codebox" style="display:none"></textarea>

      <div class="transfer">
        <label>Move this career to another device</label>
        <button class="btn" id="saveCodeBtn" onclick="A.saveGame()">💾 ${SAVE_CODE_LABEL}</button>
        <textarea id="saveCode" class="codebox" readonly placeholder="Your save code will appear here" onclick="this.select()"></textarea>
        <p class="muted small">Copy the code, then paste it into <b>Import save</b> on the other device.</p>
      </div>

      <div class="transfer">
        <label>Import save</label>
        <textarea id="impCode2" class="codebox" placeholder="Paste a save code from your other device"></textarea>
        <button class="btn ghost" onclick="A.importSave()">📥 Import a career</button>
        <p class="muted small">This replaces the career on this device.</p>
      </div>

      ${ONLINE.user ? cloudPanel() : accountPanel()}

      <button class="btn ghost" onclick="A.quit()">Quit to title</button></div>
      <p class="muted small">Your career saves automatically in this browser. The code is only needed to move it somewhere else.</p>`;
  } else if (kind === "patch"){
    body = `<h2>Updates <span class="fl big">⚑</span></h2><p class="muted small">Everything that's changed, newest first. You're on build ${esc(window.FF_BUILD || "dev")}.</p>
      <div class="patchlist">${PATCH.map((p, i) => `<div class="patch${i === 0 ? " latest" : ""}">
        <div class="patch-head"><b>${esc(p.title)}</b>${i === 0 ? `<span class="pill gold">Latest</span>` : ""}<span class="muted small">${esc(p.date)}</span></div>
        <ul>${p.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        <div class="patch-v">${esc(p.v)}</div></div>`).join("")}</div>`;
  }
  const inner = `${body}<button class="sheet-x" onclick="closeSheet()">✕</button>`, cur = r.querySelector(".sheet");
  if (cur && r.classList.contains("open") && r.dataset.kind === kind){ r.classList.add("still"); morph(cur, inner); return; }   // refresh in place: no replayed row animations
  r.classList.remove("still");
  r.innerHTML = `<div class="sheet-back" onclick="closeSheet()"></div><div class="sheet glass">${inner}</div>`;
  requestAnimationFrame(() => r.classList.add("open"));
  r.dataset.kind = kind;
}
function closeSheet(){ const r = $("#sheetRoot"); if (!r) return; r.classList.remove("open"); setTimeout(() => { if (!r.classList.contains("open")) r.innerHTML = ""; }, 300); }
function refreshSheet(){ const r = $("#sheetRoot"); if (r && r.classList.contains("open")) openSheet(r.dataset.kind); }

function screenSeasonEnd(sum){
  setPhoneVisible(false); closeSheet();
  const h = S.history[S.history.length-1];
  render(`<section class="page"><div class="page-inner">
    <div class="eyebrow">Season ${W.season - 1} complete</div><h1>${esc(h.club)} finished ${ord(sum.pos)}</h1>
    <p class="lede">${esc(sum.report.slice(0, 6).join(" · "))}</p>
    <div class="grid3">
      <div class="card glass"><h3>Your season</h3><div class="kvs"><div><span>Apps</span><b>${h.apps}</b></div><div><span>Goals</span><b>${h.goals}</b></div><div><span>Assists</span><b>${h.assists}</b></div><div><span>Avg rating</span><b>${h.avg}</b></div><div><span>Reputation</span><b>${pad5(meP().rep)}</b></div></div></div>
      <div class="card glass"><h3>Awards</h3>${S.awards.filter(a => a.season === W.season - 1).map(a => `<div class="award">🏆 ${esc(a.name)}</div>`).join("") || `<p class="muted">None this year.</p>`}
        <h4>Ballon d'Or</h4>${W.awards.ballon.slice(0, 5).map((pid, i) => `<div class="small">${i+1}. ${esc(pname(W.players[pid]))} <span class="muted">${esc(W.clubs[W.players[pid].club].nm)}</span></div>`).join("")}</div>
      <div class="card glass"><h3>Summer</h3><p>You turn ${S.player.age}. Energy fully restored. The summer transfer window is open.</p><button class="btn" onclick="A.afterSeason()">Continue →</button></div>
    </div></div></section>`, "season");
}

/* ---------- actions ---------- */
// a toast that lands while the full-time card is up (a milestone, big-game experience) would sit over its rows:
// it waits until you leave the ground, then they come one after another
const TOAST_HELD = [];
const toastNow = toast;
// an award's toast ("🏆 Your first appearance") says what an honour card is saying, or is about to (the card is
// queued just after the toast is sent): while that card is up or waiting, the card is enough
function honourCarded(title){
  if (typeof HONOUR_QUEUE === "object" && HONOUR_QUEUE.some(h => h && h[2] === title)) return true;
  const h3 = document.querySelector("#tutRoot.on .honour h3");
  return !!(h3 && h3.textContent === title);
}
const isAwardToast = (msg, kind) => kind === "gold" && typeof msg === "string" && msg.startsWith("🏆 ");
function toastOut(msg, kind){
  if (isAwardToast(msg, kind) && honourCarded(msg.slice(3))) return;
  toastNow(msg, kind); placeToasts();
}
toast = function(msg, kind){
  const hold = typeof MT !== "undefined" && MT && MT.holdToasts;     // read now: full time lifts the hold before a microtask runs
  const send = () => hold ? TOAST_HELD.push([msg, kind]) : toastOut(msg, kind);
  // an award is judged once its card, if any, is queued (the line after the toast): with a card it is dropped for
  // good, so it never turns up later as a second announcement of a card already read and closed
  if (isAwardToast(msg, kind)) queueMicrotask(() => { if (!honourCarded(msg.slice(3))) send(); });
  else send();
};
function flushHeldToasts(){
  const q = TOAST_HELD.splice(0);
  q.forEach(([msg, kind], i) => setTimeout(() => toastOut(msg, kind), 700 + i*3300));
}
// in the street a toast sits at the bottom, where the narrative note (#lifeNote) also sits on a wide screen: while the
// note is up, toasts rise to just above it, and settle back once it has faded
function placeToasts(){
  const ts = document.querySelectorAll("body > .toast"), n = document.getElementById("lifeNote");
  if (n && !placeToasts.mo && typeof MutationObserver === "function"){
    placeToasts.mo = new MutationObserver(() => { clearTimeout(placeToasts.t);
      if (n.classList.contains("on")) placeToasts(); else placeToasts.t = setTimeout(placeToasts, 380); });
    placeToasts.mo.observe(n, {attributes:true, attributeFilter:["class"]});
  }
  if (!ts.length) return;
  let lift = "";
  if (n && n.classList.contains("on") && document.body.classList.contains("life") && !document.body.classList.contains("in-match") && n.offsetParent){
    const r = n.getBoundingClientRect(), H = window.innerHeight, th = Math.max(...[...ts].map(t => t.offsetHeight)) || 48;
    if (r.height > 0 && r.bottom > H - 26 - th - 10 && r.top < H) lift = Math.round(H - r.top + 10) + "px";
  }
  ts.forEach(t => { if (t.style.bottom !== lift) t.style.bottom = lift; });
}
const A = {
  // New Game: black at once, the world and the film, then who you are (newGameWorld); without a 3D world, straight to it
  newGame(n){ useSlot(n || 1); CR = null; if (worldOK()) return newGameWorld(); screenCreate(); },
  // back to the title from the creation screen: a career that was never made is let go, the film with it
  ccCancel(){ NG.tok++; if (window.lifeOnboard && window.lifeOnboard.waiting()) window.lifeOnboard.abort(); screenTitle(); },
  deleteSlot(n){
    const m = slotMeta(n); if (!m) return;
    confirmBox(`Delete slot ${n}?`, `${esc(m.name)} · ${esc(m.club)} · ${m.apps} matches, ${playTime(m.ms)} played. This can't be undone.`, () => { deleteSlot(n); toast("Save deleted."); screenTitle(); });
  },
  alloc(k, d){ if (d > 0 && CR.pts <= 0) return; if (d < 0 && CR.alloc[k] <= 0) return; CR.alloc[k] += d; CR.pts -= d; screenCreate(); },
  ccTab(t){ CR.tab = t; if (t === "pos" && typeof lkKind === "function" && LK.kind !== "training") lkKind("training");
    if (t !== "look" && LK.view !== "front" && typeof lkView === "function") lkView("front"); screenCreate(); },
  ccLook(k){ CR.lookSec = k; LK.only = k; const c = $("#lkCtl"); if (c){ c.innerHTML = lookFormHTML(CR.look, k); for (const b of document.querySelectorAll(".cc-sub button")){ const on = b.getAttribute("onclick").includes(`'${k}'`); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-selected", String(on)); } }
    if (typeof lkView === "function") lkView(k === "face" || k === "hair" || k === "beard" ? "face" : "front");
    if (k === "clothes" && typeof lkKind === "function") lkKind("casual");
    const nt = $("#ccLookNote"); if (nt) nt.textContent = ccLookNote(k); },
  ccPos(k){ if (!POSITIONS[k] || k === "GK") return; CR.pref = k; CR.pos = archOf(k); screenCreate(); },
  ccName(v){ CR.name = v; const e = $("#ccName"); if (e) e.textContent = v.trim() || "Your name"; },
  ccNumber(v){ CR.number = clamp(+v || 9, 1, 99); const e = $("#ccNum"); if (e) e.textContent = "#" + CR.number; if (LK.o){ LK.o.number = CR.number; if (typeof lkUpdate === "function") lkUpdate(); } },
  startCareer(){
    const name = (CR.name || "").trim(); if (!name){ toast("Give your player a name first."); if (CR.tab !== "you") A.ccTab("you"); const n = $("#nm"); if (n) n.focus(); return; }
    CR.name = name;
    // the career whose shell the film was built on (New Game in the world): you, in it, and the clubs that want you
    if (S && S.flags && S.flags.CharacterCreated === false){ applyCreation(CR); screenOffers(); return; }
    render(`<section class="page center"><div class="loader"><div class="spinner"></div><p>Building the football world: clubs, squads, fixtures…</p></div></section>`);
    setTimeout(() => { newCareer(CR); save(); screenOffers(); }, 50);
  },
  continue(n){ if (n) useSlot(n); const d = load(); if (!d) return screenTitle(); startPlayClock(); resume(d); if (S.synced) startAutoSync(); if (S.offerSet) return screenOffers(); renderHub(); enterCity();
    },      // nothing announces itself after an update: the flag in the top bar has the notes when you want them
  sign(i){
    const o = S.offerSet.list[i], ctx = S.offerSet.ctx; S.offerSet = null;
    joinClub(o); if (ctx === "start"){ addNews("you", `A career begins at ${W.clubs[o.club].nm}`, "Liga 4. Keypad phone. Big dreams.", "me"); msg("Branyfon", "Welcome! Use the arrows or the wheel to move, Enter to select, Esc to go back."); }
    save();
    // a new career made in the middle of the film: back into the world, in your own eyes, for your uncle's last
    // lines (intro.js); the hub waits in your phone
    if (ctx === "start" && window.lifeOnboard && window.lifeOnboard.waiting()){ renderHub(); document.body.classList.add("life"); window.lifeOnboard.afterSign(); return; }
    renderHub();
    if (!document.body.classList.contains("life")) enterCity();
  },
  afterSeason(){ save(); S.offerSet ? screenOffers() : renderHub(); },
  playMatch(){ const {next} = hubState(); if (!next) return; setPhoneVisible(false); closePhone(); closeSheet(); startMatch(next); },
  playFixture(f){ if (!f || W.done[f.key]) return; setPhoneVisible(false); closePhone(); closeSheet(); startMatch(f); },
  kickOff(){ resumeClock(); },
  resumeMatch(){ resumeClock(); },
  playMoment(){
    const e = MT && MT.events[MT.i];
    if (!e || e.kind !== "moment") return A.contMoment();      // the chance was taken away (injury, substitution)
    $("#ov").hidden = true; const c = $("#comm"); if (c) c.classList.add("hide");
    const ms = $(".match-screen"); if (ms) ms.classList.add("moment");
    startMoment(e.type);
  },
  contMoment(){ const c = $("#comm"); if (c) c.classList.remove("hide"); const ms = $(".match-screen"); if (ms) ms.classList.remove("moment"); MT.i++; resumeClock(); },
  speed(s){ S.speed = s; showLive(); },
  skipAhead(){ skipAhead(); },
  skipReplay(){ endReplay(); },
  playHighlight(i){ const h = MT.highlights[i]; const ov = $("#ov"); if (ov) ov.hidden = true; startReplay(h.rec, {label:`${h.min}' ${h.text}`}, () => MT.ftCard()); },
  passNow(){ if (typeof passNow === "function") passNow(); },
  shootNow(){ shootNow(); },
  leaveMatch(){ loopOn = false; M = null; REP = null; clearTimeout(MT && MT.timer); MT = null; save(); flushHeldToasts();
    // in the city, the final whistle sends you back out into the yard rather than to the hub
    if (document.body.classList.contains("life") && window.LIFE){
      document.body.classList.remove("in-match");
      if (window.lifeReset) window.lifeReset();
      renderHub();
      // back out of the tunnel, a couple of hours on, facing the pitch you just played on
      if (window.lifeAfterMatch) window.lifeAfterMatch(window.lifeMatchFatigue ? window.lifeMatchFatigue(A._matchLegs) : 0);
      A._matchLegs = null;
      return;
    }
    renderHub(); },
  city(n){
    if (n) useSlot(n);
    const d = load(); if (!d) return screenTitle();
    startPlayClock(); resume(d);
    if (S.offerSet) return screenOffers();
    S.tutDone = true;
    document.body.classList.add("life");
    renderHub();
    if (window.startLife) window.startLife();
  },
  workrate(){ S.workrate = (S.workrate || 2) % 4 + 1; updateWR(); const b = $("#wrBtn"); if (b){ b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
    const names = ["", "Saving energy", "Balanced", "High intensity", "All-out"]; toast(`Work rate: ${"⚡".repeat(S.workrate)} ${names[S.workrate]}`); save(); },
  endWeek(){
    let r;
    try{ r = endWeek(); }
    catch(e){
      console.error("endWeek failed", e);
      S.faults = (S.faults || []).concat([{gw:gw(), wk:S.week, at:"endWeek", m:String(e && e.message || e).slice(0, 160)}]).slice(-20);
      S.week++;                                     // the calendar moves regardless; nothing traps a career
      save(); renderHub();
      return toast("One part of the week had a problem and was skipped. Menu → Report a problem has the details.", "bad");
    }
    if (r.seasonOver){
      let sum; try{ sum = seasonEnd(); }catch(e){ console.error("seasonEnd failed", e); S.faults = (S.faults || []).concat([{gw:gw(), wk:S.week, at:"seasonEnd", m:String(e && e.message || e).slice(0, 160)}]); sum = {pos:0, lg:EMPTY_CELL, report:[]}; }
      save(); return screenSeasonEnd(sum);
    }
    save(); renderHub();
    if (r.skipped && r.skipped.length) return toast(`Week ${S.week}. One part of the week was skipped (${r.skipped.join(", ")}). Menu → Report a problem has the details.`, "bad");
    if (r.income != null) toast(`Week ${S.week}: +${eur(r.income)} wage${r.cost ? `, −${eur(r.cost)} staff` : ""}`);
  },
  faultReport(){
    const me = meP(), c = myClub();
    const lines = [
      `Legend Rising ${window.FF_BUILD || "dev"}`,
      `${S.player.name} · ${S.player.pos} · age ${S.player.age} · OVR ${overall()}`,
      `Season ${W.season} week ${S.week}/${CAL.W} · ${c ? c.nm + " (" + ((W.leagues[c.lg] || {}).nm || c.lg) + ")" : "no club"}`,
      `Contract: ${S.contract ? `${S.contract.wage}/wk, ${S.contract.years}y${S.contract.loan ? ", loan" : ""}` : "none"} · raise deal: ${S.raise ? "yes" : "no"} · pending move: ${S.pendingMove ? "yes" : "no"}`,
      `Injury ${me.inj || 0}w · trust ${Math.round(S.trust)} · money ${S.money}`,
      "", "Faults:",
      ...((S.faults || []).length ? S.faults.map(f => `  s${Math.floor(f.gw/CAL.W)+1} w${f.wk} ${f.at}: ${f.m}`) : ["  none recorded"])
    ];
    const txt = lines.join("\n");
    try{ navigator.clipboard.writeText(txt); toast("Problem report copied. Paste it to whoever is fixing this.", "good"); }
    catch(e){ const t = $("#faultOut"); if (t){ t.style.display = "block"; t.value = txt; t.focus(); t.select(); toast("Copy the text in the box", "bad"); } }
    return txt;
  },
  tile(id){ if (id === "rest") return A.rest(); if (id === "work") return A.work(); openSheet(id === "train" ? "train" : id); },
  media(k, i){
    const l = MEDIA_LINES[k] && MEDIA_LINES[k][i]; if (!l) return;
    const life = typeof lifeMode === "function" && lifeMode();
    if (life){
      if (S.today.media || S.energy < MEDIA_COST) return toast(S.today.media ? "You've spoken to the press today." : "Too tired to face the cameras.");
      S.today.media = 1; S.energy -= MEDIA_COST; dailyPass(30, "idle");
    } else {
      if (!S.actions || S.energy < MEDIA_COST) return toast("Not enough energy or actions.");
      S.actions--; S.energy -= MEDIA_COST;
    }
    const me = meP(), back = Math.random() < l.risk;
    // a line that backfires still gets you talked about; it just costs you the dressing room
    const gain = Math.max(3, Math.round((8 + me.rep*.012)*l.rep*styleMul()*(back ? .6 : 1)));
    me.rep += gain; me.wrep += Math.round(gain*.18);
    trustAdd(back ? l.trust - 8 : l.trust);
    addNews("you", back ? `${S.player.name}'s words go down badly` : `${S.player.name} speaks to the press`,
      `“${l.say}” ${back ? "It has not landed well inside the club." : ""}`.trim(), "me");
    if (typeof socialEvent === "function") try{ socialEvent("media", l.t); }catch(e){}
    closeSheet(); save(); renderHub();
    toast(back ? `+${fmt(gain)} reputation, but that one stung` : `+${fmt(gain)} reputation`, back ? "bad" : "good");
  },
  askRaise(p){ askRaise(p); },
  askPos(to){ askPos(to); },
  press(i){ pressSay(i); },
  takeRaise(){ takeRaise(); },
  dropRaise(){ RAISE_PEND = null; openSheet("manager"); },
  /* the title screen, already signed in: pull the account's career quietly if it is safely ours */
  async adoptQuiet(){
    let r; try{ r = await adoptFromAccount(); }catch(e){ return; }
    try{ CLOUD.all = await cloudAll(); }catch(e){}
    if (r.did === "pulled"){ toast(`${r.info.name} came down from your account`, "good"); screenTitle(); }
    else if (r.did === "ask" || r.did === "local-ahead"){ CLOUD = {info:r.info, loading:false, checked:true}; }
  },
  /* signing in on a device: the account's career comes down by itself when it is safely yours */
  async adopt(){
    CLOUD.loading = true; refreshSheet();
    let r;
    try{ r = await adoptFromAccount(); }catch(e){ r = {did:"none"}; }
    CLOUD.info = r.info || null; CLOUD.loading = false; CLOUD.checked = true;
    try{ CLOUD.all = await cloudAll(); }catch(e){ CLOUD.all = []; }
    if (r.did === "pulled"){
      cloudRefresh();
      toast(`${r.info.name} is on this computer now`, "good");
      if (LAST_SCREEN === "title" || !S) screenTitle();
      return;
    }
    if (r.did === "local-ahead"){
      cloudRefresh();
      acctMsg(`The career on this computer (${r.local.apps} matches) is further along than the one on your account (${(r.info.career || {}).apps || 0}). It has been left alone. Sync it up to make it the account's copy.`, true);
      return;
    }
    if (r.did === "ask"){
      cloudRefresh();
      confirmBox("There is already a career on this computer",
        `<b>${esc(r.local.name)}</b> (${esc(r.local.club)}, ${r.local.apps} match${r.local.apps === 1 ? "" : "es"}, ${playTime(r.local.ms)} played) is saved here and ${r.local.owner ? "belongs to a different account" : "has never been put on an account"}. Replacing it with <b>${esc(r.info.name)}</b> from your account deletes it for good.`,
        async () => {
          ONLINE.busy = "Fetching your career"; refreshSheet();
          try{
            const d = await syncDown();
            ONLINE.busy = "";
            if (!d.ok){ refreshSheet(); return acctMsg(d.msg); }
            closeSheet(); toast(`${r.info.name} is on this computer now`, "good"); screenTitle();
          }catch(e){ ONLINE.busy = ""; refreshSheet(); acctMsg("Couldn't fetch it. Check your connection."); }
        });
      return;
    }
    cloudRefresh();
  },
  cloud(){
    CLOUD = {info:null, loading:!!ONLINE.user, checked:false};
    openSheet("cloud");
    if (ONLINE.user) A.adopt();
  },
  async cloudCheck(){
    CLOUD.loading = true; refreshSheet();
    try{ CLOUD.info = await cloudInfo(); }catch(e){ CLOUD.info = null; }
    try{ CLOUD.all = await cloudAll(); }catch(e){ CLOUD.all = []; }
    CLOUD.loading = false; CLOUD.checked = true;
    cloudRefresh();
  },
  cloudPull(){
    const i = CLOUD.info; if (!i) return;
    const local = slotMeta(1);
    const go = async () => {
      ONLINE.busy = "Fetching your career"; refreshSheet();
      try{
        const r = await syncDown();
        ONLINE.busy = "";
        if (!r.ok){ refreshSheet(); return acctMsg(r.msg); }
        closeSheet(); toast(`${i.name} is ready to play`, "good"); screenTitle();
      }catch(e){ ONLINE.busy = ""; refreshSheet(); acctMsg("Couldn't fetch it. Check your connection and try again."); }
    };
    // there is a career on this device that is about to be written over: say exactly whose
    if (local) return confirmBox("Replace the career on this computer?",
      `<b>${esc(local.name)}</b> (${esc(local.club)}, ${local.apps} match${local.apps === 1 ? "" : "es"}, ${playTime(local.ms)} played) will be deleted from this device and replaced with <b>${esc(i.name)}</b> from your account. Anything in it you have not synced is gone for good.`, go);
    go();
  },
  acctMode(m){ ONLINE.mode = m; ONLINE.err = ""; refreshSheet(); },
  async acctGo(){
    const em = ($("#acEmail") || {}).value || "", pw = ($("#acPass") || {}).value || "", hd = ($("#acHandle") || {}).value || "";
    if (!em || !pw) return acctMsg("Fill in your email and password.");
    ONLINE.busy = ONLINE.mode === "up" ? "Creating your account" : "Signing in"; ONLINE.err = ""; refreshSheet();
    const r = ONLINE.mode === "up" ? await onlineSignUp(em, pw, hd || em.split("@")[0]) : await onlineSignIn(em, pw);
    ONLINE.busy = "";
    if (!r.ok){ ONLINE.err = r.msg; refreshSheet(); return; }
    ONLINE.err = ""; refreshSheet();
    toast(ONLINE.mode === "up" ? "Account created" : "Signed in", "good");
    A.adopt();
  },
  async acctReset(){
    const em = ($("#acEmail") || {}).value || "";
    if (!em) return acctMsg("Type your email first, then tap this.");
    const r = await onlineReset(em);
    acctMsg(r.ok ? "Check your email for a reset link." : r.msg, r.ok);
  },
  async acctOut(){ await onlineSignOut(); toast("Signed out"); refreshSheet(); },
  async pullSlot(n){
    const row = (CLOUD.all || []).find(x => x.n === n); if (!row) return;
    const local = slotMeta(1);
    const go = async () => {
      ONLINE.busy = "Fetching that career"; refreshSheet();
      const r = await window.pullSlot(n);
      ONLINE.busy = "";
      if (!r.ok){ refreshSheet(); return acctMsg(r.msg); }
      closeSheet(); toast(`${r.name} is on this computer now`, "good"); screenTitle();
    };
    if (local) return confirmBox("Replace the career on this computer?",
      `<b>${esc(local.name)}</b> (${esc(local.club)}, ${local.apps} match${local.apps === 1 ? "" : "es"}) will be deleted from this device and replaced with <b>${esc(row.name)}</b> from your account.`, go);
    go();
  },
  async syncUp(){
    if (S) saveNow();
    // never write over a different career without being told to
    const up = (CLOUD.all || []).find(x => x.cid && S && S.cid && x.cid !== S.cid && x.n === 1);
    if (up && !A._syncOk){
      return confirmBox("Your account already holds a different career",
        `<b>${esc(up.name)}</b> is saved to your account. Putting <b>${esc(S.player.name)}</b> up there replaces it, and the old one cannot be got back.`,
        () => { A._syncOk = true; A.syncUp().then(() => { A._syncOk = false; }); });
    }
    ONLINE.busy = "Uploading your careers"; refreshSheet();
    try{
      const r = await syncUp();
      ONLINE.busy = ""; refreshSheet();
      if (!r.ok) return acctMsg(r.msg);
      if (S){ S.synced = true; saveNow(); }          // from here on it keeps itself up to date
      startAutoSync(); refreshSheet();
      acctMsg(`Synced ${r.sent} career${r.sent !== 1 ? "s" : ""}. ${esc(r.best.name)} is on the board with ${fmt(r.best.score)} points. It will now re-sync by itself every five minutes.`, true);
      toast("On the leaderboard", "good");
    }catch(e){ ONLINE.busy = ""; refreshSheet(); acctMsg("Sync failed: " + String(e && e.message || e).slice(0, 110)); }
  },
  async syncDown(){
    confirmBox("Restore from your account?", "This replaces the career saved on this device with the one on your account. Anything here that you have not synced will be lost.", async () => {
      ONLINE.busy = "Fetching your careers"; openSheet("menu");
      try{
        const r = await syncDown();
        ONLINE.busy = ""; refreshSheet();
        if (!r.ok) return acctMsg(r.msg);
        if (S){ S.synced = true; saveNow(); }
        startAutoSync();
        acctMsg(`Restored ${r.got} career${r.got !== 1 ? "s" : ""}. Go back to the title screen to pick one.`, true);
        toast("Careers restored", "good");
      }catch(e){ ONLINE.busy = ""; refreshSheet(); acctMsg("Couldn't fetch your careers. Check your connection."); }
    });
  },
  patch(){ const was = patchUnseen(); if (PATCH.length) S.seenPatch = PATCH[0].v; if (was){ save(); renderHub(); } openSheet("patch"); },
  train(focus){
    const t = TRAIN[focus], cost = trainCost() - (focus === "fitness" && S.staff.fitCoach ? 4 : 0);
    if (!S.actions || S.energy < cost) return toast("Not enough energy or actions.");
    S.energy -= cost; S.actions--;
    const coach = t.coach && S.staff[t.coach];
    const x = Math.round(30*(S.staff.trainer ? 1.5 : 1)*(coach ? 1.5 : 1)); addXP(x);
    let extra = "";
    if (t.skills && Math.random() < (coach ? .4 : .12)){ const k = pick(t.skills); if (S.skills[k] < 99){ S.skills[k]++; extra = ` · ${SKILLS.find(s => s[0] === k)[1]} +1!`; } }
    meP().ovr = overall(); closeSheet(); save(); renderHub(); toast(`${t.name} session: +${x} XP${extra}`, "good");
  },
  rest(){ if (!S.actions) return; const g = Math.round(25*energyMult()); S.energy = Math.min(100, S.energy + g); S.actions--; save(); renderHub(); toast(`Rested: +${g} energy`); },
  work(){
    if (!S.actions || S.energy < 8) return;
    const js = jobState(), before = myJob(), m = jobPay();
    S.money += m; S.energy -= 8; S.actions--; js.shifts = (js.shifts || 0) + 1;
    let promo = null;
    if (!jobIsTop()){ js.xp += JOB_XP_PER_SHIFT; if (js.xp >= jobNeed()) promo = jobMove(1); }
    save(); renderHub();
    if (promo) return promoBox(promo, m);
    toast(`${before.job.name} · ${before.rank.name}: +${eur(m)}`);
  },
  // a drink from your stock (the hub, half time): what it does is what consume() says, the same as from a fridge
  drink(id, inMatch){
    const r = consume(id);
    if (!r.ok){ if (inMatch) return updateMatchHUD(); return toast(r.why); }
    save(); if (inMatch) return updateMatchHUD(); renderHub(); toast(`${r.item.name} · Energy ${fmtSigned(r.gain)}`);
  },
  up(k){ const c = skillCost(S.skills[k]); if (S.sp < c || S.skills[k] >= 99) return; S.sp -= c; S.skills[k]++; meP().ovr = overall(); save(); refreshSheet(); renderHub(); },
  buy(id){
    const it = SHOP.find(x => x.id === id); if (S.money < it.price) return;
    S.money -= it.price;
    if (it.stack) S.inv[id] = (S.inv[id] || 0) + 1;
    else if (id === "smartphone"){ S.phone = "smart"; addNews("you", "New phone!", "The Branyfon S1 is yours. Open the Branystore to get apps.", "me"); toast("Smartphone unlocked. Pull up your phone!", "gold"); }
    else S.items[id] = true;
    if (!it.stack){ S.purchases.push({id, name:it.name, gw:gw()}); socialEvent("purchase", it.name); }
    save(); refreshSheet(); renderHub(); if (!it.stack && id !== "smartphone") toast(`Bought: ${it.name}`, "good");
    if (id === "smartphone"){ PH.stack = []; renderPhone(); }
  },
  hire(id){ const s = STAFF.find(x => x.id === id); if (S.money < s.hire) return; S.money -= s.hire; S.staff[id] = true; save(); refreshSheet(); renderHub(); toast(`${s.name} hired`, "good"); },
  fire(id){ S.staff[id] = false; save(); refreshSheet(); renderHub(); },
  menu(){ openSheet("menu"); },
  // five quick taps on the club badge asks for a password
  secretTap(){
    const now = Date.now();
    if (!A._taps || now - A._taps.last > 900) A._taps = {n:0, last:now};
    A._taps.n++; A._taps.last = now;
    if (A._taps.n >= 5){ A._taps.n = 0; askPassword(); }      // the code is asked every single time
  },
  adminSet(field, value){ adminSet(field, value); },

  openShop(id){ S.shopOpenId = id; refreshSheet(); },
  buyCloth(id){
    let item = null, shop = null;
    for (const sh of SHOPS){ const it = sh.items.find(x => x.id === id); if (it){ item = it; shop = sh; break; } }
    if (!item || ownsCloth(id) || !shopOpen(shop) || S.money < item.p) return;
    S.money -= item.p; (S.wardrobe || (S.wardrobe = [])).push(id);
    const per = CLOTHES_TIER[shop.tier].per*100;
    toast(`${item.n}. Looking sharp. +${per.toFixed(2)}% reputation and followers`, "good");
    socialEvent("purchase", item.n);
    save(); refreshSheet(); renderHub();
  },
  gfx0(m){ setGfx(m); refreshSheet(); },
  async saveGame(){
    const btn = $("#saveCodeBtn"); if (btn){ btn.disabled = true; btn.textContent = "Packing your career…"; }
    saveNow();
    try{
      const code = await makeCode();
      const box = $("#saveCode"); if (box){ box.value = code; box.select && box.select(); }
      const ok = await copyText(code);
      toast(ok ? `Save code copied (${Math.round(code.length/1024)} KB). Paste it on the other device.` : "Code ready below. Select it all and copy.", ok ? "good" : "");
    }catch(e){ toast("Couldn't build the code."); }
    if (btn){ btn.disabled = false; btn.textContent = `💾 ${SAVE_CODE_LABEL}`; }
  },
  async importSave(slot){
    const box = $("#impCode2") || $("#impCode0"), txt = box ? box.value : "";
    if (!txt.trim()) return toast("Paste a save code first.");
    const n = slot || SLOT, existing = slotMeta(n);
    const go = async () => {
      try{
        const r = await applyCode(txt, n);
        closeConfirm(); closeSheet(); closePhone();
        const d = load(n); if (!d) throw new Error("bad");
        resume(d); startPlayClock();
        toast(`${r.name} imported into slot ${n}.`, "good");
        if (S.offerSet) return screenOffers();
        renderHub();
      }catch(e){ closeConfirm(); toast("That code isn't a valid save."); }
    };
    if (existing) confirmBox(`Replace slot ${n}?`, `${esc(existing.name)} · ${esc(existing.club)} · ${existing.apps} matches would be overwritten. This can't be undone.`, go);
    else go();
  },
  gfx(m){ setGfx(m); refreshSheet(); smRefresh && PH.open && S && S.phone === "smart" && smRefresh(); },
  quit(){ saveNow(); closeSheet(); closePhone(); screenTitle(); },
  fullscreen(){
    const d = document;
    if (!d.fullscreenElement){ const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => Promise.reject())).call(el).catch(() => toast("Your browser blocked full screen. Press F11.")); }
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  }
};
window.A = A;
