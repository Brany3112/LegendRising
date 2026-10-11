"use strict";
/* ============ ONLINE: accounts, cloud saves and the leaderboard ============
   Everything here is optional. With no Firebase project configured the game runs exactly as before:
   local saves, no account, no network. Nothing in here ever blocks play. */

const ONLINE = {
  ready:false,        // the SDK has loaded and we have an auth + db handle
  user:null,          // {uid, email}
  profile:null,       // {handle}
  board:null,         // the cached leaderboard rows
  boardAt:0,          // when we last fetched it
  busy:"",            // a label while something is in flight
  err:"",
  loading:null
};
const BOARD_TTL = 60000;                       // don't re-read the board more than once a minute

function fbConfigured(){
  const c = window.FB_CONFIG;
  return !!(c && c.apiKey && c.projectId && !/PASTE|YOUR[_-]|xxx/i.test(c.apiKey + c.projectId));
}
/* the SDK is pulled from Google's CDN at runtime. Swapped out in tests. */
ONLINE.loadSdk = async function(){
  const v = "10.12.2", base = `https://www.gstatic.com/firebasejs/${v}/`;
  const [app, auth, store] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
  return {app, auth, store};
};
async function fbInit(){
  if (ONLINE.ready) return true;
  if (!fbConfigured()){ ONLINE.err = "No Firebase project is set up for this build."; return false; }
  if (ONLINE.loading) return ONLINE.loading;
  ONLINE.loading = (async () => {
    try{
      const sdk = await ONLINE.loadSdk();
      const app = sdk.app.initializeApp(window.FB_CONFIG);
      ONLINE.sdk = sdk;
      ONLINE.auth = sdk.auth.getAuth(app);
      ONLINE.db = sdk.store.getFirestore(app);
      sdk.auth.onAuthStateChanged(ONLINE.auth, u => {
        ONLINE.user = u ? {uid:u.uid, email:u.email} : null;
        if (!u){ ONLINE.profile = null; stopAutoSync(); }
        else {
          loadProfile().catch(() => {});
          startAutoSync();
          // opening the game already signed in, sitting on the title screen: bring the career down
          // only ever on the title screen — a career in progress is never pulled out from under you
          if (!ONLINE.adopted && typeof A === "object" && typeof LAST_SCREEN !== "undefined" && LAST_SCREEN === "title"){
            ONLINE.adopted = true;
            setTimeout(() => { try{ A.adoptQuiet(); }catch(e){} }, 0);
          }
        }
        onlineChanged();
      });
      ONLINE.ready = true; ONLINE.err = "";
      return true;
    } catch(e){
      ONLINE.err = "Couldn't reach the account service. Check your connection.";
      ONLINE.loading = null;
      return false;
    }
  })();
  return ONLINE.loading;
}
// anything showing account state re-draws itself when it changes
function onlineChanged(){
  if (typeof refreshSheet === "function") refreshSheet();
  // the title screen's account corner follows whoever is signed in
  if (typeof cloudCorner === "function" && typeof LAST_SCREEN !== "undefined" && LAST_SCREEN === "title"){
    const c = document.getElementById("cloudCorner"); if (c) c.outerHTML = cloudCorner();
  }
  if (typeof smRefresh === "function" && typeof PH === "object" && PH.stack && PH.stack.length) smRefresh();
}

/* ---------- words written by older builds ----------
   Board rows and account saves come from every version of the game, and older ones still carry the long dash the
   game no longer uses. They are shown through util.js undash, the same replacement the save migration applies to a
   career's own text (career.js textMigrate, DESIGN 1.7 and 3.10). */
// one leaderboard row as the phone shows it: every piece of text in it cleaned, numbers left alone
const BOARD_TEXT = ["name", "handle", "club", "league", "job", "nat"];
function boardRow(r){
  if (!r || typeof r !== "object") return r;
  for (const k of BOARD_TEXT) if (typeof r[k] === "string") r[k] = undash(r[k]);
  for (const k of ["trophyList", "awardList"]) if (Array.isArray(r[k])) r[k] = r[k].map(t => undash(t));
  return r;
}

/* ---------- what a career is worth: one number, so three characters can be compared ---------- */
function careerScore(sum){
  if (!sum) return 0;
  const c = sum.career || {}, tier = sum.tier == null ? 4 : sum.tier;
  const leagueMul = 1 + (4 - clamp(tier, 1, 4))*.22;      // a goal in the top flight is worth more than one in Liga 4
  const base = (c.goals || 0)*6 + (c.assists || 0)*4 + (c.apps || 0)*1.2 + (c.motm || 0)*9;
  return Math.round(base*leagueMul + (sum.trophies || 0)*70 + (sum.awards || 0)*45 + (sum.ovr || 0)*6 + (sum.level || 0)*4);
}
/* everything the leaderboard shows, pulled out of a save. Works on the live S or on a loaded save. */
function careerSummary(d){
  if (!d || !d.player || !d.W) return null;
  const W_ = d.W, me = (W_.players || []).find(p => p.id === d.meId) || {};
  const club = me.club >= 0 ? (W_.clubs || [])[me.club] : null;
  const lg = club ? (W_.leagues || [])[club.lg] : null;
  const tier = lg ? (parseInt(String(lg.id).replace(/\D/g, ""), 10) || 4) : 4;
  const sk = d.skills || {};
  const ovr = Math.round(Object.values(sk).reduce((a, b) => a + b, 0) / (Object.keys(sk).length || 1));
  const sum = {
    name:d.player.name, age:d.player.age, pos:d.player.pos, nat:d.player.nat, number:d.player.number,
    club:club ? club.nm : "Free agent", league:lg ? lg.nm : EMPTY_CELL, tier,
    ovr:me.ovr || ovr, level:d.level || 1, skills:sk,
    career:{apps:(d.careerMy || {}).apps || 0, goals:(d.careerMy || {}).goals || 0,
            assists:(d.careerMy || {}).assists || 0, motm:(d.careerMy || {}).motm || 0},
    season:{apps:(d.seasonMy || {}).apps || 0, goals:(d.seasonMy || {}).goals || 0, assists:(d.seasonMy || {}).assists || 0},
    // a save in another slot may never have been loaded by this build, so its words are cleaned here too
    trophies:(d.trophies || []).length, trophyList:(d.trophies || []).slice(-6).map(t => undash(t.name || t.nm || String(t))),
    awards:(d.awards || []).length, awardList:(d.awards || []).slice(-6).map(a => undash(a.name || a.nm || String(a))),
    money:Math.round(d.money || 0), wage:d.contract ? d.contract.wage : 0,
    rep:me.rep || 0, wrep:me.wrep || 0, followers:(d.social || {}).followers || 0,
    job:d.job ? jobNameOf(d.job) : "", clothes:(d.wardrobe || []).length,
    seasons:Math.max(1, (W_.season || 1) - (d.startSeason || 0) + 1), playMs:d.playMs || 0
  };
  sum.score = careerScore(sum);
  return sum;
}
function jobNameOf(j){
  try{ const job = JOBS[clamp((JOBS.findIndex(x => x.id === j.id) < 0 ? j.j : JOBS.findIndex(x => x.id === j.id)) | 0, 0, JOBS.length - 1)];
    return `${job.name} · ${job.ranks[clamp(j.r | 0, 0, 2)].name}`; } catch(e){ return ""; }
}
/* the career on this device */
function bestLocalSlot(){
  let best = null;
  for (let n = 1; n <= SLOTS; n++){
    const raw = localStorage.getItem(slotKey(n)); if (!raw) continue;
    let d; try{ d = deserial(raw); } catch(e){ continue; }
    const sum = careerSummary(d); if (!sum) continue;
    if (!best || sum.score > best.sum.score) best = {slot:n, sum, raw};
  }
  return best;
}

/* ---------- accounts ---------- */
async function loadProfile(){
  const {doc, getDoc} = ONLINE.sdk.store;
  const s = await getDoc(doc(ONLINE.db, "users", ONLINE.user.uid));
  ONLINE.profile = s.exists() ? s.data() : null;
  onlineChanged();
}
function niceAuthError(e){
  const c = (e && (e.code || e.message)) || "";
  if (/email-already-in-use/.test(c)) return "That email already has an account. Sign in instead.";
  if (/invalid-email/.test(c)) return "That doesn't look like an email address.";
  if (/weak-password/.test(c)) return "Pick a password of at least 6 characters.";
  if (/wrong-password|invalid-credential|user-not-found/.test(c)) return "Wrong email or password.";
  if (/too-many-requests/.test(c)) return "Too many tries. Wait a minute and try again.";
  if (/network/.test(c)) return "No connection to the account service.";
  return "Couldn't do that. Try again.";
}
async function onlineSignUp(email, pass, handle){
  if (!await fbInit()) return {ok:false, msg:ONLINE.err};
  const h = String(handle || "").trim();
  if (h.length < 2 || h.length > 20) return {ok:false, msg:"Pick a name between 2 and 20 characters."};
  try{
    const {createUserWithEmailAndPassword} = ONLINE.sdk.auth;
    const cred = await createUserWithEmailAndPassword(ONLINE.auth, String(email).trim(), pass);
    const {doc, setDoc, serverTimestamp} = ONLINE.sdk.store;
    await setDoc(doc(ONLINE.db, "users", cred.user.uid), {handle:h, created:serverTimestamp()}, {merge:true});
    ONLINE.profile = {handle:h};
    return {ok:true};
  } catch(e){ return {ok:false, msg:niceAuthError(e)}; }
}
async function onlineSignIn(email, pass){
  if (!await fbInit()) return {ok:false, msg:ONLINE.err};
  try{
    const {signInWithEmailAndPassword} = ONLINE.sdk.auth;
    await signInWithEmailAndPassword(ONLINE.auth, String(email).trim(), pass);
    return {ok:true};
  } catch(e){ return {ok:false, msg:niceAuthError(e)}; }
}
async function onlineSignOut(){
  if (!ONLINE.ready) return;
  await ONLINE.sdk.auth.signOut(ONLINE.auth);
  ONLINE.board = null; ONLINE.boardAt = 0;
  onlineChanged();
}
async function onlineReset(email){
  if (!await fbInit()) return {ok:false, msg:ONLINE.err};
  try{ await ONLINE.sdk.auth.sendPasswordResetEmail(ONLINE.auth, String(email).trim()); return {ok:true}; }
  catch(e){ return {ok:false, msg:niceAuthError(e)}; }
}

/* ---------- syncing ---------- */
// uploads the local career and publishes it to the board
async function syncUp(){
  if (!ONLINE.user) return {ok:false, msg:"Sign in first."};
  const {doc, setDoc, serverTimestamp} = ONLINE.sdk.store;
  const uid = ONLINE.user.uid, handle = (ONLINE.profile && ONLINE.profile.handle) || "Player";
  let sent = 0, best = null;
  for (let n = 1; n <= SLOTS; n++){
    let raw = localStorage.getItem(slotKey(n)); if (!raw) continue;
    let d; try{ d = deserial(raw); } catch(e){ continue; }
    const sum = careerSummary(d); if (!sum) continue;
    // the save remembers whose account it is on, so another device knows it is looking at its own career
    if (d.owner !== uid){
      d.owner = uid;
      if (S && SLOT === n) S.owner = uid;
      try{ const pl = d.W.players; d.W.players = null; raw = JSON.stringify({S:d, P2:packRows(pl.map(packP))}); d.W.players = pl;
           localStorage.setItem(slotKey(n), raw); localStorage.removeItem(metaKey(n)); }catch(e){}
    }
    const code = await makeCode(raw);
    try{
      await setDoc(doc(ONLINE.db, "users", uid, "slots", String(n)),
        {code, name:sum.name, score:sum.score, club:sum.club, cid:d.cid || "", updated:serverTimestamp()});
    }catch(e){ return {ok:false, msg:`Your save could not be written to your account (${String(e && e.message || e).slice(0, 80)}). Save ${n}, ${Math.round(code.length/1024)} KB.`}; }
    sent++;
    if (!best || sum.score > best.sum.score) best = {slot:n, sum};
  }
  if (!sent) return {ok:false, msg:"There's nothing saved on this device yet."};
  try{ await setDoc(doc(ONLINE.db, "board", uid), Object.assign({}, best.sum, {handle, slot:best.slot, updated:serverTimestamp()})); }
  catch(e){ return {ok:false, msg:`Your leaderboard row was refused (${String(e && e.message || e).slice(0, 80)}).`}; }
  try{ await setDoc(doc(ONLINE.db, "users", uid), {handle, lastSync:serverTimestamp()}, {merge:true}); }catch(e){}
  ONLINE.board = null; ONLINE.boardAt = 0;
  return {ok:true, sent, best:best.sum, slot:best.slot};
}
// pulls this account's careers down onto this device
/* Where does this account's career actually live?
   The game used to hold three, so a career synced back then sits under slot 2 or 3. The board row
   remembers which one it was. We look there first, then fall back to sweeping every old slot, so a
   career uploaded by any version of the game is still found. */
const CLOUD_SLOTS = 3;
// a board row with no slot recorded: the probe holds this, and ui/main.js compares against it before naming a slot (never shown)
const BOARD_NO_SLOT = "—";   // nodash-ok: sentinel
async function cloudBest(){
  if (!ONLINE.user) return null;
  const {doc, getDoc} = ONLINE.sdk.store, uid = ONLINE.user.uid;
  const read = async n => {
    try{ const s = await getDoc(doc(ONLINE.db, "users", uid, "slots", String(n)));
         if (!s.exists()) return null;
         const d = s.data(); return d && d.code ? {n, d} : null; }
    catch(e){ if (ONLINE.probe) ONLINE.probe.err = String(e && e.message || e).slice(0, 90); return null; }
  };
  // what the search saw, so an empty account can be explained rather than guessed at
  const probe = ONLINE.probe = {uid, board:false, boardSlot:null, slots:[], err:""};
  let board = null;
  try{ const bd = await getDoc(doc(ONLINE.db, "board", uid)); if (bd.exists()) board = bd.data(); }
  catch(e){ probe.err = String(e && e.message || e).slice(0, 90); }
  probe.board = !!board; probe.boardSlot = board ? (board.slot == null ? BOARD_NO_SLOT : board.slot) : null;
  if (board && board.slot){ const hit = await read(board.slot); if (hit){ probe.slots.push(board.slot); return {hit, board}; } }
  let best = null;
  for (let n = 1; n <= CLOUD_SLOTS; n++){
    const hit = await read(n);
    if (hit){ probe.slots.push(n); if (!best || (hit.d.score || 0) > (best.d.score || 0)) best = hit; }
  }
  return best ? {hit:best, board} : null;
}
async function syncDown(){
  if (!ONLINE.user) return {ok:false, msg:"Sign in first."};
  const found = await cloudBest();
  if (!found) return {ok:false, msg:"This account has no career saved yet."};
  const was = SLOT;                                  // applyCode switches slots; put it back when we're done
  let r;
  try{ r = await applyCode(found.hit.d.code, 1); }    // wherever it was uploaded from, it lands in the one slot
  catch(e){ useSlot(was); return {ok:false, msg:"The career on your account could not be read."}; }
  if (!r || !r.slot){ useSlot(was); return {ok:false, msg:"The career on your account could not be read."}; }
  try{
    const raw = localStorage.getItem(slotKey(1)); const d = deserial(raw);
    if (d.owner !== ONLINE.user.uid){
      d.owner = ONLINE.user.uid;
      const pl = d.W.players; d.W.players = null;
      localStorage.setItem(slotKey(1), JSON.stringify({S:d, P2:packRows(pl.map(packP))}));
      localStorage.removeItem(metaKey(1));
    }
  }catch(e){}
  useSlot(was);
  return {ok:true, got:1, name:r.name};
}
/* ---------- the board ---------- */
async function loadBoard(force){
  if (!await fbInit()) return null;
  if (!force && ONLINE.board && Date.now() - ONLINE.boardAt < BOARD_TTL) return ONLINE.board;
  const {collection, query, orderBy, limit, getDocs} = ONLINE.sdk.store;
  const snap = await getDocs(query(collection(ONLINE.db, "board"), orderBy("score", "desc"), limit(100)));
  const rows = [];
  snap.forEach(d => rows.push(boardRow(Object.assign({uid:d.id}, d.data()))));
  ONLINE.board = rows; ONLINE.boardAt = Date.now();
  return rows;
}
function myBoardRow(){
  if (!ONLINE.user || !ONLINE.board) return null;
  return ONLINE.board.find(r => r.uid === ONLINE.user.uid) || null;
}

/* ---------- keeping the board up to date on its own ----------
   Once a career has been put on the leaderboard by hand, there is no reason to keep doing it.
   Every five minutes the save goes up again and the board is re-read, so the phone app and
   anyone looking at your row see where you actually are. It is quiet: no toasts, no spinner,
   and it never runs while you are in the middle of a match. */
const AUTO_SYNC_MS = 300000;
const AUTO = {timer:null, at:0, running:false, last:null};
async function autoSyncTick(){
  // a match is the one time the network is worth avoiding — try again on the next tick
  if (!ONLINE.user || !S || !S.synced || ONLINE.busy || AUTO.running) return;
  if (typeof MT !== "undefined" && MT) return;
  AUTO.running = true;
  try{
    saveNow();
    const up = await cloudBest();
    if (up && up.hit.d.cid && S.cid && up.hit.d.cid !== S.cid){
      // the account holds a different career. Only a deliberate sync may replace it.
      AUTO.last = {ok:false, at:Date.now(), blocked:up.hit.d.name || "another career"};
      AUTO.running = false;
      return;
    }
    const r = await syncUp();
    AUTO.at = Date.now();
    AUTO.last = r && r.ok ? {ok:true, at:AUTO.at, score:r.best && r.best.score} : {ok:false, at:AUTO.at};
    if (r && r.ok){
      await loadBoard(true);                       // the row that just changed is our own
      if (typeof RANK === "object" && RANK.rows){ RANK.rows = ONLINE.board || RANK.rows; if (typeof smRefresh === "function") smRefresh(); }
    }
  }catch(e){ AUTO.last = {ok:false, at:Date.now()}; }
  AUTO.running = false;
}
function startAutoSync(){
  if (AUTO.timer) return;
  AUTO.timer = setInterval(autoSyncTick, AUTO_SYNC_MS);
}
function stopAutoSync(){ clearInterval(AUTO.timer); AUTO.timer = null; }

/* ---------- what is waiting on the account, without touching this device ----------
   Read before offering to pull a career down, so the pop-up can name what you would be
   swapping in — and what you would be losing. */
async function cloudInfo(){
  if (!ONLINE.user) return null;
  try{
    const found = await cloudBest();
    if (!found) return null;
    const d = found.hit.d, b = found.board || {};
    const t = d.updated && d.updated.toMillis ? d.updated.toMillis() : (d.updated && d.updated.__ts) || 0;
    return {name:undash(d.name || b.name || "Your career"), club:undash(d.club || b.club || ""), score:d.score || b.score || 0,
      ovr:b.ovr || 0, seasons:b.seasons || 1, career:b.career || {}, at:t, uid:ONLINE.user.uid};
  }catch(e){ return null; }
}

/* ---------- signing in on a new device ----------
   The account is where a career lives. Sign in and it comes down on its own — but only over a save
   that already belongs to this account. A career that is somebody else's, or one that was never put
   on an account, is never quietly thrown away: you are asked first. */
async function adoptFromAccount(){
  if (!ONLINE.user) return {did:"none"};
  let info = null;
  try{ info = await cloudInfo(); }catch(e){ return {did:"none"}; }
  if (!info) return {did:"none", info:null};
  const uid = ONLINE.user.uid, local = slotMeta(1);
  if (!local){                                             // nothing here to lose
    const r = await syncDown();
    return r.ok ? {did:"pulled", info} : {did:"failed", info, msg:r.msg};
  }
  if (local.owner && local.owner !== uid) return {did:"ask", info, local};   // plainly another account's
  if (!local.owner) return {did:"ask", info, local};                        // never synced — could be anyone's
  // same account on both sides: whichever copy has been played further is the real one
  const cloudApps = (info.career && info.career.apps) || 0;
  if (local.apps > cloudApps || (local.apps === cloudApps && local.at > info.at + 60000)){
    return {did:"local-ahead", info, local};
  }
  const r = await syncDown();
  return r.ok ? {did:"pulled", info} : {did:"failed", info, msg:r.msg};
}

/* Everything this account has, including saves left behind by the old three-career version.
   A career that went missing is usually still sitting in one of them. */
async function cloudAll(){
  if (!ONLINE.user) return [];
  const {doc, getDoc} = ONLINE.sdk.store, uid = ONLINE.user.uid, out = [];
  for (let n = 1; n <= CLOUD_SLOTS; n++){
    try{
      const s = await getDoc(doc(ONLINE.db, "users", uid, "slots", String(n)));
      if (!s.exists()) continue;
      const d = s.data(); if (!d || !d.code) continue;
      out.push({n, name:undash(d.name || "Career"), club:undash(d.club || ""), score:d.score || 0, cid:d.cid || "",
        at:d.updated && d.updated.toMillis ? d.updated.toMillis() : (d.updated && d.updated.__ts) || 0,
        kb:Math.round(String(d.code).length/1024)});
    }catch(e){}
  }
  return out;
}
// bring one particular save down, whichever of the old places it is in
async function pullSlot(n){
  if (!ONLINE.user) return {ok:false, msg:"Sign in first."};
  const {doc, getDoc} = ONLINE.sdk.store;
  try{
    const s = await getDoc(doc(ONLINE.db, "users", ONLINE.user.uid, "slots", String(n)));
    if (!s.exists() || !s.data().code) return {ok:false, msg:"That save is not on your account."};
    const was = SLOT;
    const r = await applyCode(s.data().code, 1);
    try{
      const raw = localStorage.getItem(slotKey(1)); const d = deserial(raw);
      if (d.owner !== ONLINE.user.uid){
        d.owner = ONLINE.user.uid;
        const pl = d.W.players; d.W.players = null;
        localStorage.setItem(slotKey(1), JSON.stringify({S:d, P2:packRows(pl.map(packP))}));
        localStorage.removeItem(metaKey(1));
      }
    }catch(e){}
    useSlot(was);
    return {ok:true, name:r.name};
  }catch(e){ return {ok:false, msg:String(e && e.message || e).slice(0, 90)}; }
}
