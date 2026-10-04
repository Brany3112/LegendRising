"use strict";
/* ============ STATS APP ============
   Top scorers and top assists for any competition in the world: every league, both European
   cups, internationals, or all of them added together. */

// every competition you can pick, and where its numbers live on a player
// the league you are in right now, whatever it is and whoever you have signed for since
function myLeague(){ const c = myClub(); return c ? W.leagues[c.lg] : null; }
function compList0(){ return compList(); }
function compList(){
  const mine = myLeague();
  const out = [];
  if (mine) out.push({id:"MINE", label:`My league · ${mine.nm}`, group:"Everything"});
  out.push({id:"all", label:"All competitions", group:"Everything"});
  for (const lg of Object.values(W.leagues).sort((a, b) => a.cc.localeCompare(b.cc) || a.t - b.t))
    out.push({id:"L:" + lg.id, label:`${COUNTRIES[lg.cc].name} · ${lg.nm}`, group:"Leagues"});
  const cup = typeof myCup === "function" ? myCup() : null;
  if (cup) out.push({id:"CUP", label:cup.nm, group:"Leagues"});
  out.push({id:"CL", label:CONT.CL, group:"Europe"});
  out.push({id:"EL", label:CONT.EL, group:"Europe"});
  out.push({id:"NT", label:"Internationals", group:"Europe"});
  return out;
}
const ntStat = p => ({ap:(p.nt && p.nt.caps) || 0, g:(p.nt && p.nt.g) || 0, a:(p.nt && p.nt.a) || 0});
const zeroStat = {ap:0, g:0, a:0};
// {player, stat} for whoever took part in the chosen competition
function compRows(id){
  const rows = [];
  const add = (p, s) => { if (p && s && (s.ap || s.g || s.a)) rows.push({p, s}); };
  if (id === "all"){
    for (const p of W.players){
      if (!p) continue;
      const n = ntStat(p), e = p.el || zeroStat, c = p.ct || zeroStat, l = p.st || zeroStat, u = p.cu || zeroStat;
      add(p, {ap:l.ap + c.ap + e.ap + u.ap + n.ap, g:l.g + c.g + e.g + u.g + n.g, a:l.a + c.a + e.a + u.a + n.a});
    }
  } else if (id === "CUP"){
    const cup = myCup(); if (!cup) return rows;
    for (const c of W.clubs) if (c.cc === cup.cc) for (const p of squadOf(c.id)) add(p, p.cu);
  } else if (id === "NT"){
    for (const p of W.players) add(p, ntStat(p));
  } else if (id === "CL" || id === "EL"){
    const comp = (W.comps || {})[id]; if (!comp) return rows;
    const key = id === "CL" ? "ct" : "el";
    for (const cid of comp.clubs) for (const p of squadOf(cid)) add(p, p[key]);
  } else {
    const lg = id === "MINE" ? myLeague() : W.leagues[id.slice(2)];
    if (!lg) return rows;
    for (const cid of lg.clubs) for (const p of squadOf(cid)) add(p, p.st);
  }
  return rows;
}
function statsTable(id, key){
  const other = key === "g" ? "a" : "g";
  const all = compRows(id);
  const rows = all.filter(r => r.s[key] > 0)
    .sort((x, y) => y.s[key] - x.s[key] || y.s[other] - x.s[other] || x.s.ap - y.s.ap)
    .slice(0, 50);
  const mine = meP().id;
  // where you stand, even when you are not on the list — the chart should never look like it forgot you
  const myRow = all.find(r => r.p.id === mine);
  const myRank = myRow && myRow.s[key] > 0
    ? all.filter(r => r.s[key] > myRow.s[key]).length + 1 : 0;
  const foot = !myRow ? "" : rows.some(r => r.p.id === mine) ? ""
    : `<div class="st-you"><b>You</b><span>${myRow.s[key]} ${key === "g" ? "goal" : "assist"}${myRow.s[key] === 1 ? "" : "s"} in ${myRow.s.ap} ${myRow.s.ap === 1 ? "match" : "matches"}${myRank ? ` · ${ord(myRank)}` : ""}</span></div>`;
  if (!rows.length) return `<div class="empty">Nobody has scored in this competition yet this season.</div>${foot}`;
  return `<table class="tbl chart"><thead><tr><th>#</th><th class="l">Player</th><th class="l">Club</th><th>MP</th><th>${key === "g" ? "G" : "A"}</th></tr></thead><tbody>${
    rows.map((r, i) => {
      const c = r.p.club >= 0 ? W.clubs[r.p.club] : null;
      return `<tr class="${r.p.id === mine ? "me" : ""}"><td>${i + 1}</td><td class="l">${esc(pname(r.p))}</td>
        <td class="l"><span class="clubcell">${c ? crest(c.nm, 13) : ""}<span class="cn">${c ? esc(c.nm) : "—"}</span></span></td>
        <td>${r.s.ap}</td><td><b>${r.s[key]}</b></td></tr>`; }).join("")}</tbody></table>${foot}`;
}
APPVIEWS.stats = t => {
  const key = t.p.k || "g";
  const list = compList0();
  let comp = t.p.c || "MINE";
  if (!list.some(c => c.id === comp)) comp = list[0] ? list[0].id : "all";
  const groups = [...new Set(list.map(c => c.group))];
  const tabs = [["g", "Top Scorer"], ["a", "Top Assists"]]
    .map(([k, l]) => `<button class="${key === k ? "on" : ""}" onclick="Object.assign(PH.stack[PH.stack.length-1].p,{k:'${k}'});smRefresh()">${l}</button>`).join("");
  const sel = `<select class="sel" onchange="Object.assign(PH.stack[PH.stack.length-1].p,{c:this.value});smRefresh()">${
    groups.map(g => `<optgroup label="${esc(g)}">${list.filter(c => c.group === g)
      .map(c => `<option value="${esc(c.id)}" ${c.id === comp ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</optgroup>`).join("")}</select>`;
  return {title:"Stats", tabs, html:sel + statsTable(comp, key)};
};
