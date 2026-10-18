"use strict";
/* ============ LEADERBOARD APP ============
   Everyone who has synced a career, ranked. Tap a row to open their whole career. */

const RANK = {rows:null, loading:false, err:"", open:null};

function rankLoad(force){
  if (RANK.loading) return;
  RANK.loading = true; RANK.err = "";
  smRefresh();
  loadBoard(force).then(rows => {
    RANK.rows = rows || []; RANK.loading = false;
    if (!rows) RANK.err = ONLINE.err || "Couldn't reach the leaderboard.";
    smRefresh();
  }).catch(() => { RANK.loading = false; RANK.err = "Couldn't reach the leaderboard."; smRefresh(); });
}
function rankTap(uid){ RANK.open = RANK.open === uid ? null : uid; smRefresh(); }
function rankMedal(i){ return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1); }
function playTimeShort(ms){
  const h = Math.floor((ms || 0)/3600000), m = Math.round(((ms || 0)%3600000)/60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function rankDetail(r){
  const c = r.career || {}, s = r.season || {};
  const stat = (k, v) => `<div class="rk-stat"><span>${k}</span><b>${v}</b></div>`;
  const skills = r.skills && typeof SKILLS !== "undefined"
    ? SKILLS.filter(([k]) => r.skills[k] != null).map(([k, n]) => `<div class="rk-sk"><span>${esc(n)}</span><i><u style="width:${clamp(r.skills[k], 0, 99)}%"></u></i><b>${r.skills[k]}</b></div>`).join("")
    : "";
  return `<div class="rk-detail">
    <div class="rk-grid">
      ${stat("Overall", r.ovr || 0)}${stat("Level", r.level || 1)}${stat("Age", r.age || EMPTY_CELL)}
      ${stat("Position", (typeof POS === "object" && POS[r.pos] ? POS[r.pos].name : r.pos) || EMPTY_CELL)}
      ${stat("Seasons", r.seasons || 1)}${stat("Played", playTimeShort(r.playMs))}
    </div>
    <div class="eyebrow">Career</div>
    <div class="rk-grid">
      ${stat("Appearances", fmt(c.apps || 0))}${stat("Goals", fmt(c.goals || 0))}${stat("Assists", fmt(c.assists || 0))}
      ${stat("MOTM", fmt(c.motm || 0))}${stat("Trophies", r.trophies || 0)}${stat("Awards", r.awards || 0)}
    </div>
    <div class="eyebrow">This season</div>
    <div class="rk-grid">${stat("Apps", s.apps || 0)}${stat("Goals", s.goals || 0)}${stat("Assists", s.assists || 0)}</div>
    <div class="eyebrow">Off the pitch</div>
    <div class="rk-grid">
      ${stat("Money", eur(r.money || 0))}${stat("Wage", r.wage ? eur(r.wage) + "/wk" : EMPTY_CELL)}
      ${stat("Reputation", pad5(r.rep || 0))}${stat("World", pad5(r.wrep || 0))}
      ${stat("Followers", fmt(r.followers || 0))}${stat("Wardrobe", `${r.clothes || 0} items`)}
    </div>
    ${r.job ? `<div class="rk-line"><span>Day job</span><b>${esc(r.job)}</b></div>` : ""}
    ${(r.trophyList || []).length ? `<div class="eyebrow">Trophy cabinet</div><div class="rk-tags">${r.trophyList.map(t => `<span class="pill gold">🏆 ${esc(t)}</span>`).join("")}</div>` : ""}
    ${(r.awardList || []).length ? `<div class="eyebrow">Awards</div><div class="rk-tags">${r.awardList.map(t => `<span class="pill">🎖 ${esc(t)}</span>`).join("")}</div>` : ""}
    ${skills ? `<div class="eyebrow">Skills</div><div class="rk-skills">${skills}</div>` : ""}
  </div>`;
}
APPVIEWS.rank = () => {
  const right = `<button class="pillbtn" onclick="rankLoad(true)">↻</button>`;
  if (!fbConfigured()) return {title:"Leaderboard", right,
    html:`<div class="empty">The leaderboard isn't switched on for this build yet.</div>`};
  if (RANK.rows === null && !RANK.loading && !RANK.err) rankLoad(false);
  if (RANK.loading && !RANK.rows) return {title:"Leaderboard", right, html:`<div class="empty">Loading the board…</div>`};
  if (RANK.err) return {title:"Leaderboard", right, html:`<div class="empty">${esc(RANK.err)}<br><button class="pillbtn" style="margin-top:10px" onclick="rankLoad(true)">Try again</button></div>`};
  const rows = RANK.rows || [];
  if (!rows.length) return {title:"Leaderboard", right,
    html:`<div class="empty">Nobody has synced a career yet.<br><span class="small">Put yours up from ☰ Menu → Sync to leaderboard.</span></div>`};
  const mine = ONLINE.user ? ONLINE.user.uid : null;
  const meAt = rows.findIndex(r => r.uid === mine);
  return {title:"Leaderboard", right,
    html:`${meAt >= 0 ? `<div class="rk-you">You're <b>${ord(meAt + 1)}</b> of ${rows.length}</div>` : ONLINE.user ? `<div class="rk-you muted">Your career isn't on the board yet. Sync it from the menu.</div>` : ""}
      <div class="rk-list">${rows.map((r, i) => {
        const c = r.career || {}, open = RANK.open === r.uid;
        return `<div class="rk-row${open ? " open" : ""}${r.uid === mine ? " me" : ""}">
          <button class="rk-head" onclick="rankTap('${esc(r.uid)}')">
            <span class="rk-pos${i < 3 ? " medal" : ""}">${rankMedal(i)}</span>
            <span class="rk-who"><b>${esc(r.name || EMPTY_CELL)}</b><span class="muted small">${esc(r.handle || "")} · ${esc(r.club || "")}</span></span>
            <span class="rk-score">${fmt(r.score || 0)}<u>pts</u></span>
            <span class="rk-caret">${open ? "▴" : "▾"}</span>
            <span class="rk-quick"><i>${fmt(c.goals || 0)}<u>G</u></i><i>${fmt(c.assists || 0)}<u>A</u></i><i>${eur(r.money || 0)}</i><i>${esc(r.league || "")}</i></span>
          </button>
          ${open ? rankDetail(r) : ""}</div>`; }).join("")}</div>`};
};
