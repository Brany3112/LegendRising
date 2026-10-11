"use strict";
/* ============ SCOUT PRO (clubs + negotiation) ============ */
APPVIEWS.scout = t => {
  const me = meP();
  if (t.view === "main"){
    const inbox = S.msgs.map((m, i) => ({m, i})).filter(x => x.m.offer && !x.m.done);
    return {title:"Scout Pro", html:`<div class="card-in"><div class="muted small">You</div><b>REP ${pad5(me.rep)} · WORLD ${pad5(me.wrep)}</b><div class="muted small">Form ${recentAvg().toFixed(2)} · ${S.staff.agent ? "Agent working for you" : "No agent, so clubs judge you on your own"}</div>
      <div class="muted small">${windowAt(S.week).open ? `Window open: moves happen now.` : `Window shut: agreed deals complete when the ${windowAt(S.week).next.toLowerCase()} opens.`}</div></div>
      ${inbox.length ? `<h4>Offers waiting</h4>` + inbox.map(x => { const c = W.clubs[x.m.offer.club]; return `<button class="list-row" onclick="startNeg(${c.id},${x.i})">${crest(c.nm, 26)}<div class="grow"><b>${esc(c.nm)}</b><div class="muted small">${eur(x.m.offer.wage)}/wk · ${x.m.offer.years}y</div></div><span class="pill gold">Negotiate</span></button>`; }).join("") : ""}
      ${S.contract && S.contract.years <= 1 ? `<button class="list-row" onclick="startNeg(${me.club})">${crest(myClub().nm, 26)}<div class="grow"><b>Renew with ${esc(myClub().nm)}</b><div class="muted small">Last year of your deal</div></div></button>` : ""}
      <h4>Approach a club</h4>${Object.entries(COUNTRIES).map(([cc, C]) => `<button class="list-row" onclick="smGo('lg',{cc:'${cc}'})"><span class="avatar">${cc.slice(0,2)}</span><div class="grow"><b>${C.name}</b><div class="muted small">${C.leagues.length} leagues</div></div>›</button>`).join("")}`};
  }
  if (t.view === "lg") return {title:COUNTRIES[t.p.cc].name, html:Object.values(W.leagues).filter(l => l.cc === t.p.cc).sort((a,b) => a.t - b.t || a.id.localeCompare(b.id)).map(l => `<button class="list-row" onclick="smGo('clubs',{lg:'${l.id}'})"><div class="grow"><b>${esc(l.nm)}</b><div class="muted small">${l.clubs.length} clubs</div></div>›</button>`).join("")};
  if (t.view === "clubs"){
    const lg = W.leagues[t.p.lg];
    return {title:lg.nm, html:lg.clubs.map(id => W.clubs[id]).sort((a,b) => b.rep - a.rep).map(c => { const i = clubInterest(c), lock = S.locks[c.id] && S.locks[c.id] > gw();
      return `<button class="list-row" onclick="startNeg(${c.id})">${crest(c.nm, 26)}<div class="grow"><b>${esc(c.nm)}</b><div class="muted small">rep ${pad5(c.rep)} · budget ${eur(c.fin)}${lock ? " · talks locked" : ""}</div></div><div class="interest"><i style="width:${Math.round(i*100)}%"></i></div></button>`; }).join("")};
  }
  if (t.view === "neg") return negView();
  return {title:"Scout Pro", html:""};
};
function startNeg(cid, msgIdx){
  const n = openNegotiation(cid);
  if (n.error) return toast(n.error);
  if (msgIdx != null){ const o = S.msgs[msgIdx].offer; n.base = Object.assign({}, o); n.ask = Object.assign({}, o); n.msgIdx = msgIdx; n.lim = negLimits(W.clubs[cid], n.base); n.interest = Math.max(n.interest, .5); }
  PH.neg = n;
  if (!smTop() || smTop().app !== "scout") PH.stack.push({app:"scout", view:"main", p:{}});
  smGo("neg");
}
const NEGF = [["wage","Weekly wage", v => eur(v)+"/wk"], ["years","Contract length", v => v + (v > 1 ? " years" : " year")], ["raise","Yearly raise", v => v + "%"], ["sign","Signing bonus", v => eur(v)],
  ["bG","Bonus per goal", v => eur(v)], ["bA","Bonus per assist", v => eur(v)], ["bApp","Bonus per appearance", v => eur(v)], ["bW","Bonus per win", v => eur(v)]];
function negStep(key){ const n = PH.neg, [a,b] = n.lim[key]; if (key === "years") return 1; if (key === "raise") return 1; return Math.max(5, Math.round((b - a)/40/5)*5); }
function negAdj(key, dir){
  const n = PH.neg, [a,b] = n.lim[key]; if (n.done) return;
  n.ask[key] = clamp(n.ask[key] + dir*negStep(key), a, b);
  n.ask.reqs = null; n.reply = n.reply && n.reply.status === "loan" ? null : (n.reply ? Object.assign({}, n.reply, {stale:true}) : null);
  smRefresh();
}
function negRole(){ const n = PH.neg; if (n.done) return; n.ask.role = {sub:"rotation", rotation:"starter", starter:"sub"}[n.ask.role]; n.ask.reqs = null; if (n.reply) n.reply.stale = true; smRefresh(); }
function negSend(){ const n = PH.neg; if (n.done) return; const r = evaluateAsk(n); if (r.status === "decline") n.done = true; save(); smRefresh(); }
function negAgree(promise){
  const n = PH.neg; if (!n.reply || n.reply.stale || !["ok","loan"].includes(n.reply.status)) return toast("Send your offer first.");
  const o = Object.assign({}, n.ask, {promised:!!promise}); if (n.renewal) o.renewal = true;
  if (o.loan) o.prev = S.contract ? Object.assign({}, S.contract, {prev:null}) : null;
  if (n.msgIdx != null) S.msgs[n.msgIdx].done = true;
  agreeMove(o); n.done = true; save();
  toast(promise ? "You promised. Now deliver." : "Deal done!", "good");
  PH.stack = []; PH.land = false; renderSmart(); if (!MT) renderHub();
}
function negWalk(){ PH.neg = null; PH.land = false; smBack(); }
function negView(){
  const n = PH.neg; if (!n) return {title:"Scout Pro", html:""};
  const c = W.clubs[n.club], r = n.reply, reqs = n.ask.reqs;
  const left = NEGF.map(([k, l, f]) => `<div class="neg-row"><span>${l}</span><div class="stepper"><button onclick="negAdj('${k}',-1)">−</button><b>${f(n.ask[k])}</b><button onclick="negAdj('${k}',1)">+</button></div></div>`).join("")
    + `<div class="neg-row"><span>Playing time</span><div class="stepper"><button onclick="negRole()">⇄</button><b>${ROLE[n.ask.role]}</b></div></div>`;
  const pat = clamp(n.patience, 0, 100);
  const right = r ? `<div class="neg-reply ${r.status}">${esc(r.msg)}${r.stale ? `<div class="muted small">You changed your requests. Send them again.</div>` : ""}</div>
      ${reqs && !r.stale ? `<div class="muted small">Required over the contract${n.ask.years > 1 ? ` (${n.ask.years} years)` : ""}:</div>${Object.entries(reqs).map(([k,v]) => `<div class="req"><span>${REQ_LABEL[k]}</span><b>${v}</b></div>`).join("")}
        <p class="muted small">Promise = hit these in half the time (${Math.max(1, Math.round(n.ask.years*CAL.W/2))} weeks). Deliver: 20% raise. Fail: wage halved, bonuses gone, less playing time.</p>` : ""}`
    : `<div class="neg-reply">Set your requests on the left, then send them. Ask for too much and their patience runs out.</div>`;
  const canSign = r && !r.stale && ["ok","loan"].includes(r.status) && !n.done;
  return {title:`Talks: ${c.nm}`, land:true, html:`<div class="neg">
    <div class="neg-top">${crest(c.nm, 28)}<div class="grow"><b>${esc(c.nm)}</b><div class="muted small">rep ${pad5(c.rep)} · budget ${eur(c.fin)} · their first offer ${eur(n.base.wage)}/wk</div></div>
      <div class="patience"><span>Patience</span><div class="meter"><i style="width:${pat}%;background:${pat > 50 ? "#5fd47a" : pat > 25 ? "#ffd75a" : "#ef5a60"}"></i></div></div></div>
    <div class="neg-cols"><div class="neg-left"><div class="neg-h">Your requests</div>${left}<button class="btn sm" ${n.done ? "disabled" : ""} onclick="negSend()">Send offer</button></div>
      <div class="neg-right"><div class="neg-h">Their answer</div>${right}
        <div class="neg-actions"><button class="round ok" ${canSign ? "" : "disabled"} onclick="negAgree(false)" title="Agree">✓</button><button class="round no" onclick="negWalk()" title="Walk away">✕</button><button class="round promise" ${canSign ? "" : "disabled"} onclick="negAgree(true)" title="Promise">🤝 Promise</button></div></div></div></div>`};
}
