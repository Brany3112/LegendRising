"use strict";
/* ============ SHOWOFF APP ============ */
function soTabs(cur){ const n = S.social ? S.social.ctx.length : 0; return [["feed","Feed"],["post",`Post${n ? ` (${n})` : ""}`],["me","Profile"],["find","Discover"]].map(([k,l]) => `<button class="${cur === k ? "on" : ""}" onclick="PH.stack[PH.stack.length-1].p.tab='${k}';smRefresh()">${l}</button>`).join(""); }
function avatarFor(p){ const [a] = kitOf(W.clubs[p.club] ? W.clubs[p.club].nm : "x"); return `<span class="avatar" style="background:${a}">${esc(sname(p)[0])}</span>`; }
function handleOf(p){ return p.me ? S.social.handle : (NAMES[p.nat].f[p.fn] + sname(p)).toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 16); }
APPVIEWS.showoff = t => {
  if (!S.social) return {title:"Showoff", html:`<div class="so-signup"><span class="s-logo big">S</span><h3>Create your account</h3><p class="muted small">Pick a handle. Fans, players, clubs and your rival will all see what you post.</p>
    <input id="soHandle" type="text" maxlength="18" placeholder="handle" value="${esc(S.player.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "").slice(0, 14))}${S.player.number}">
    <button class="btn" onclick="soCreate()">Create account</button></div>`};
  const tab = t.p.tab || "feed", s = S.social;
  if (t.view === "compose"){
    const c = s.ctx.find(x => x.id === t.p.id);
    if (!c) return {title:"Post", html:`<div class="empty">That moment has passed.</div>`};
    return {title:"New post", html:`<div class="muted small">${esc(c.label)}</div>
      <div class="quick">${QUICK_TONES.map(q => `<button class="qchip ${t.p.tone === q.id ? "on" : ""}" onclick="soFill('${c.id}','${q.id}')">${q.icon} ${q.label}</button>`).join("")}
        <button class="qchip" onclick="soFill('${c.id}','${t.p.tone || "humble"}')" title="Another line">🎲</button><button class="qchip ${t.p.tone ? "" : "on"}" onclick="soCustom()">✎ Custom</button></div>
      <textarea id="soText" rows="5" maxlength="220" placeholder="Pick a personality above for a ready-made post, or write your own…">${esc(t.p.text || "")}</textarea>
      <p class="muted small">Edit anything you like. What you post shapes how people see you.</p><button class="btn" onclick="soPost('${c.id}')">Post</button>`};
  }
  if (t.view === "result"){ const p = s.posts[0]; return {title:"Posted", html:`<div class="so-result pop"><div class="so-post mine"><p>${esc(p.text)}</p></div><div class="big-num">+${p.gain}</div><div>new followers</div><div class="muted">${p.likes} likes so far</div>
    <p>People read this as <b>${{humble:"humble",confident:"confident",brag:"bragging",toxic:"toxic",sorry:"honest",funny:"funny",neutral:"a bit flat"}[p.tone]}</b>.</p><div class="pill" style="color:${perception().color}">You're seen as: ${perception().label}</div>
    <button class="btn sm" onclick="PH.stack.pop();PH.stack[PH.stack.length-1].p.tab='me';smRefresh()">See your profile</button></div>`}; }
  if (t.view === "post"){
    const p = s.posts.find(x => x.id === t.p.id);
    return {title:"Post", html:`<div class="so-post mine"><b>@${esc(s.handle)}</b><p>${esc(p.text)}</p><div class="muted small">♥ ${p.likes} · ${esc(p.ctx)}</div></div>
      ${p.comments.map((c, i) => `<div class="so-comment"><b>${esc(c.by)}</b> ${esc(c.text)}
        ${c.replied ? `<div class="muted small">You: ${esc(c.replied)}</div>` : `<div class="quick sm"><button class="mini ${c.liked ? "on" : ""}" onclick="soLikeC(${p.id},${i})">♥</button>${REPLY_TONES.map(q => `<button class="mini" onclick="soQuickReply(${p.id},${i},'${q.id}')">${q.icon} ${q.label}</button>`).join("")}<button class="mini" onclick="soToggle('r${p.id}_${i}')">✎</button></div>
        ${PH.custom === `r${p.id}_${i}` ? `<div class="row gap6"><input class="mini-in" id="rc${i}" placeholder="Your reply…"><button class="mini" onclick="soReplyC(${p.id},${i})">Send</button></div>` : ""}`}</div>`).join("")}`};
  }
  let html = "";
  if (tab === "feed"){
    html = s.feed.length ? s.feed.map((f, i) => { const p = W.players[f.by];
      return `<div class="so-post ${f.mention ? "mention" : ""}"><div class="row gap8">${avatarFor(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="muted small">@${esc(handleOf(p))} · ${esc(W.clubs[p.club].nm)}${p.id === S.rivalId ? ` · <span class="bad">RIVAL</span>` : ""}</div></div>
        ${s.following.includes(p.id) ? `<span class="muted small">${s.friends.includes(p.id) ? "Friends" : "Following"}</span>` : `<button class="pillbtn" onclick="soFollow(${p.id})">Follow</button>`}</div>
        <p>${esc(f.text)}</p><div class="quick sm"><button class="mini ${f.liked ? "on" : ""}" ${f.liked ? "disabled" : ""} onclick="soLikeF(${i})">♥ ${f.likes}</button>${f.mine ? `<span class="yours">You: ${esc(f.mine)}</span>` : `${COMMENT_TONES.map(q => `<button class="mini" onclick="soQuickComment(${i},'${q.id}')">${q.icon} ${q.label}</button>`).join("")}<button class="mini" onclick="soToggle('f${i}')">✎</button>`}</div>
        ${!f.mine && PH.custom === `f${i}` ? `<div class="row gap6"><input class="mini-in" id="fc${i}" placeholder="Your comment…"><button class="mini" onclick="soCommentF(${i})">Send</button></div>` : ""}
        ${f.comments.map(c => `<div class="small muted">You: ${esc(c)}</div>`).join("")}</div>`; }).join("") : `<div class="empty">Your feed fills up as the season goes. Follow players in Discover.</div>`;
  } else if (tab === "post"){
    html = s.ctx.length ? `<p class="muted small">You can post after a game, a purchase, an award, a move, or when someone mentions you.</p>` + s.ctx.map(c => `<div class="ctx-card"><div class="row gap8"><span class="avatar">${{match:"⚽",purchase:"🛍",mention:"@",award:"🏆",trophy:"🏆",transfer:"✈"}[c.type]}</span><div class="grow"><b>${esc(c.label)}</b><div class="muted small">${c.type === "mention" ? "Someone mentioned you — reply" : "One tap posts a random line in that style"}</div></div></div>
      <div class="quick">${QUICK_TONES.map(q => `<button class="qchip" onclick="soQuickPost('${c.id}','${q.id}')">${q.icon} ${q.label}</button>`).join("")}<button class="qchip" onclick="smGo('compose',{id:${c.id}})">✎ Custom / edit</button></div></div>`).join("")
      : `<div class="empty">Nothing to post about right now. Play a game, buy something, or wait for someone to mention you.</div>`;
  } else if (tab === "me"){
    const per = perception();
    html = `<div class="so-profile"><span class="avatar big" style="background:${kitOf(myClub().nm)[0]}">${esc(S.player.name[0])}</span><div><b>@${esc(s.handle)}</b><div class="muted small">${esc(S.player.name)} · ${esc(myClub().nm)}</div></div></div>
      <div class="so-stats"><div><b>${s.followers.toLocaleString("en-GB")}</b><span>followers</span></div><div><b>${s.following.length}</b><span>following</span></div><div><b>${s.friends.length}</b><span>friends</span></div><div><b>${s.likes.toLocaleString("en-GB")}</b><span>likes</span></div></div>
      <div class="pill" style="color:${per.color}">Seen as: ${per.label}</div>
      <div class="meter-row"><span>Humble</span><div class="meter axis"><i style="left:${50 + s.humility/2}%"></i></div><span>Cocky</span></div>
      <div class="meter-row"><span>Respectful</span><div class="meter axis"><i style="left:${50 - s.respect/2}%"></i></div><span>Toxic</span></div>
      ${s.notes.slice(0, 3).map(n => `<div class="small good">${esc(n)}</div>`).join("")}
      <h4>Your posts</h4>${s.posts.length ? s.posts.map(p => `<button class="so-post mine" onclick="smGo('post',{id:${p.id}})"><p>${esc(p.text)}</p><div class="muted small">♥ ${p.likes} · ${p.comments.length} comments · ${esc(p.ctx)}</div></button>`).join("") : `<div class="muted small">No posts yet.</div>`}`;
  } else {
    const lg = W.leagues[myClub().lg], ps = lg.clubs.flatMap(cid => squadOf(cid)).filter(p => !p.me).sort((a,b) => b.rep - a.rep).slice(0, 25);
    const mates = squadOf(meP().club).filter(p => !p.me).slice(0, 8);
    html = `<h4>Team-mates</h4>` + mates.map(p => findRow(p)).join("") + `<h4>Biggest names in your league</h4>` + ps.map(p => findRow(p)).join("");
  }
  return {title:"Showoff", tabs:soTabs(tab), html};
};
function findRow(p){ const s = S.social; return `<div class="list-row">${avatarFor(p)}<div class="grow"><b>${esc(pname(p))}</b><div class="muted small">${esc(W.clubs[p.club].nm)} · ${p.fol.toLocaleString("en-GB")} followers${p.id === S.rivalId ? " · RIVAL" : ""}</div></div>${s.following.includes(p.id) ? `<span class="muted small">${s.friends.includes(p.id) ? "Friends" : "Following"}</span>` : `<button class="pillbtn" onclick="soFollow(${p.id})">Follow</button>`}</div>`; }
const COMMENT_TONES = [{id:"humble", label:"Respect", icon:"👏"}, {id:"funny", label:"Funny", icon:"😂"}, {id:"brag", label:"Cocky", icon:"😎"}, {id:"toxic", label:"Toxic", icon:"😤"}];
const REPLY_TONES = [{id:"humble", label:"Thanks", icon:"🙏"}, {id:"funny", label:"Funny", icon:"😂"}, {id:"brag", label:"Cocky", icon:"😎"}, {id:"toxic", label:"Toxic", icon:"😤"}];
function soFind(id){ return S.social.ctx.find(x => String(x.id) === String(id)); }
function soFill(id, tone){ const c = soFind(id); if (!c) return; const t = smTop(); t.p.tone = tone; t.p.text = quickText(ctxKind(c), tone, ctxVars(c)); smRefresh(); }
function soCustom(){ const t = smTop(); t.p.tone = null; t.p.text = ""; smRefresh(); const el = $("#soText"); if (el) el.focus(); }
function soQuickPost(id, tone){ const c = soFind(id); if (!c) return; postReaction(c, quickText(ctxKind(c), tone, ctxVars(c))); save(); smGo("result"); }
function soToggle(key){ PH.custom = PH.custom === key ? null : key; smRefresh(); const el = document.querySelector("#smBody .mini-in"); if (el) el.focus(); }
function soQuickComment(i, tone){ const f = S.social.feed[i]; soCommentF(i, quickText("C", tone, {name:sname(W.players[f.by])})); }
function soQuickReply(pid, i, tone){ const post = S.social.posts.find(p => p.id === pid); const t = replyComment(post, i, quickText("F", tone, {})); save(); smRefresh(); if (t === "toxic") toast("That reply didn't go down well."); }
function soCreate(){ const h = ($("#soHandle").value || "").trim().replace(/[^a-zA-Z0-9_.]/g, ""); if (h.length < 3) return toast("Handle needs at least 3 characters."); socialInit(h); save(); smRefresh(); toast(`Welcome to Showoff, @${h}`, "good"); }
function soPost(id){ const c = S.social.ctx.find(x => String(x.id) === String(id)), txt = ($("#soText").value || "").trim(); if (!c) return; if (txt.length < 2) return toast("Write something first."); postReaction(c, txt); save(); PH.stack.pop(); smGo("result"); }
function soFollow(pid){ toast(followPlayer(pid)); save(); smRefresh(); }
function soLikeF(i){ likeFeed(S.social.feed[i]); save(); smRefresh(); }
function soCommentF(i, given){
  const f0 = S.social.feed[i];
  if (!f0 || f0.mine) return toast("You've already had your say on that one.");     // one comment per post
  const el = $("#fc" + i), txt = given || (el && el.value.trim()); if (!txt) return; PH.custom = null;
  const f = f0, {tone} = toneOf(txt); f.comments.push(txt); f.mine = txt;
  const s = S.social; s.respect = clamp(s.respect + (tone === "toxic" ? -6 : tone === "humble" || tone === "funny" ? 2 : 0), -100, 100);
  s.humility = clamp(s.humility + (tone === "brag" ? -3 : 0), -100, 100);
  if (tone === "toxic"){ s.followers += ri(0, 8); meP().rep = Math.max(0, meP().rep - 2); if (f.by !== S.rivalId && Math.random() < .5) s.feed.unshift(npcPost(W.players[f.by], `@${s.handle} who asked? 🙄`, true)); }
  else if (Math.random() < .25 && !s.friends.includes(f.by) && f.by !== S.rivalId){ s.friends.push(f.by); if (!s.following.includes(f.by)) s.following.push(f.by); toast(`${pname(W.players[f.by])} liked your comment and followed you back`); }
  save(); smRefresh();
}
function soLikeC(pid, i){ likeComment(S.social.posts.find(p => p.id === pid), i); save(); smRefresh(); }
function soReplyC(pid, i){ const el = $("#rc" + i), txt = el && el.value.trim(); if (!txt) return; PH.custom = null; const tone = replyComment(S.social.posts.find(p => p.id === pid), i, txt); save(); smRefresh(); if (tone === "toxic") toast("That reply didn't go down well."); }

/* ============ VISAGE APP (stats) ============ */
const STATCOLS = {g:["Goals", p => p.st.g], a:["Assists", p => p.st.a], r:["Avg rating", p => p.st.ap ? +(p.st.rs/p.st.ap).toFixed(2) : 0], ap:["Apps", p => p.st.ap], mo:["MotM", p => p.st.mo], rep:["Reputation", p => p.rep]};
APPVIEWS.visage = t => {
  const tab = t.p.tab || "me";
  const tabs = [["me","Me"],["league","League"],["rival","Rival"],["tops","Top lists"],["buzz","Buzz"]].map(([k,l]) => `<button class="${tab === k ? "on" : ""}" onclick="PH.stack[PH.stack.length-1].p.tab='${k}';smRefresh()">${l}</button>`).join("");
  const me = meP(); let html = "";
  if (t.view === "cmp"){ const o = W.players[t.p.id]; return {title:"Compare", html:compareHTML(me, o)}; }
  if (tab === "me"){
    const s = S.seasonMy, c = S.careerMy;
    html = `<div class="vis-hero"><div class="ovr-ring small" style="--p:${overall()}"><b>${overall()}</b><span>OVR</span></div><div><b>${esc(S.player.name)}</b><div class="muted small">${esc(myClub().nm)} · age ${S.player.age}</div>
      <div class="row gap6"><span class="pill">REP ${pad5(me.rep)}</span><span class="pill">WORLD ${pad5(me.wrep)}</span></div></div></div>
      <div class="statgrid">${[["Apps",s.apps],["Goals",s.goals],["Assists",s.assists],["MotM",s.motm],["Dribbles",s.dribbles],["Passes",`${s.spass + s.lpass}/${s.passAtt}`],["Shots on target",`${s.onTarget}/${s.shots}`],["Avg rating",s.apps ? (s.ratingSum/s.apps).toFixed(2) : "–"]].map(([k,v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}</div>
      <h4>Career</h4><div class="statgrid">${[["Apps",c.apps],["Goals",c.goals],["Assists",c.assists],["From 20m+",c.longGoals],["Free kicks",c.fkGoals],["Curled",c.curlGoals],["Caps",me.nt.caps],["Europe goals",me.ct.g]].map(([k,v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}</div>
      <h4>Skills</h4>${SKILLS.map(([k,n]) => `<div class="meter-row"><span>${n}</span><div class="meter thin"><i style="width:${S.skills[k]}%"></i></div><b>${S.skills[k]}</b></div>`).join("")}
      <h4>Honours</h4>${[...S.trophies, ...S.awards].map(a => `<div class="small">🏆 ${esc(a.name)} <span class="muted">${a.year}</span></div>`).join("") || `<div class="muted small">Nothing yet.</div>`}
      <h4>History</h4>${S.history.map(h => `<div class="small">${h.year}/${String((h.year+1)%100).padStart(2,"0")} · ${esc(h.club)} · ${h.apps} apps, ${h.goals} G, ${h.assists} A · ${h.avg}</div>`).join("") || `<div class="muted small">First season.</div>`}`;
  } else if (tab === "league"){
    const key = t.p.sort || "g", lg = W.leagues[myClub().lg];
    const ps = lg.clubs.flatMap(cid => squadOf(cid)).filter(p => p.pos !== "GK").sort((a,b) => STATCOLS[key][1](b) - STATCOLS[key][1](a));
    const top = ps.slice(0, 30); if (!top.includes(me)) top.push(me);
    html = `<div class="chips">${Object.entries(STATCOLS).map(([k,[l]]) => `<button class="${key === k ? "on" : ""}" onclick="PH.stack[PH.stack.length-1].p.sort='${k}';smRefresh()">${l}</button>`).join("")}</div>` + playerTable(top, key, ps);
  } else if (tab === "rival"){
    const rv = W.players[S.rivalId];
    html = rv ? `<p class="muted small">Your rival for life. The press compares you every week.</p>` + compareHTML(me, rv) : `<div class="empty">No rival yet.</div>`;
  } else if (tab === "tops"){
    const cc = t.p.cc || myClub().cc, lgs = Object.values(W.leagues).filter(l => l.cc === cc).sort((a,b) => a.t - b.t || a.id.localeCompare(b.id));
    const lgId = t.p.lg && W.leagues[t.p.lg] && W.leagues[t.p.lg].cc === cc ? t.p.lg : lgs[0].id, lg = W.leagues[lgId];
    const ps = lg.clubs.flatMap(cid => squadOf(cid));
    const top = (f) => ps.filter(p => f(p) > 0).sort((a,b) => f(b) - f(a)).slice(0, 10);
    html = `<div class="chips">${Object.entries(COUNTRIES).map(([k,C]) => `<button class="${cc === k ? "on" : ""}" onclick="Object.assign(PH.stack[PH.stack.length-1].p,{cc:'${k}',lg:null});smRefresh()">${C.name}</button>`).join("")}</div>
      <select class="sel" onchange="PH.stack[PH.stack.length-1].p.lg=this.value;smRefresh()">${lgs.map(l => `<option value="${l.id}" ${l.id === lgId ? "selected" : ""}>${esc(l.nm)}</option>`).join("")}</select>
      <h4>Top scorers</h4>${rankList(top(p => p.st.g), p => p.st.g)}<h4>Top assists</h4>${rankList(top(p => p.st.a), p => p.st.a)}
      <h4>Man of the match awards</h4>${rankList(top(p => p.st.mo), p => p.st.mo)}`;
  } else {
    const s = S.social;
    if (!s) html = `<div class="empty">Get Showoff from the Branystore to see what people say about you.</div>`;
    else {
      const about = s.feed.filter(f => f.mention).slice(0, 12), com = s.posts.flatMap(p => p.comments.map(c => ({c, p}))).slice(0, 15);
      html = `<div class="pill" style="color:${perception().color}">Public image: ${perception().label}</div><h4>Mentions</h4>` + (about.map(f => `<div class="so-post mention"><b>${esc(pname(W.players[f.by]))}</b><p>${esc(f.text)}</p></div>`).join("") || `<div class="muted small">Nobody's talking about you yet.</div>`)
        + `<h4>What fans say</h4>` + (com.map(x => `<div class="small"><b>${esc(x.c.by)}</b> ${esc(x.c.text)}</div>`).join("") || `<div class="muted small">No comments yet.</div>`);
    }
  }
  return {title:"Visage", tabs, html};
};
function playerTable(list, key, full){
  return `<table class="tbl"><thead><tr><th>#</th><th class="l">Player</th><th>${STATCOLS[key][0]}</th><th></th></tr></thead><tbody>${list.map(p => `<tr class="${p.me ? "me" : p.id === S.rivalId ? "rival" : ""}"><td>${full.indexOf(p) + 1}</td><td class="l"><b>${esc(pname(p))}</b><div class="muted small">${esc(W.clubs[p.club].nm)} · ${p.pos} · ${p.age}</div></td><td><b>${STATCOLS[key][1](p)}</b></td><td>${p.me ? "" : `<button class="mini" onclick="smGo('cmp',{id:${p.id}})">vs</button>`}</td></tr>`).join("")}</tbody></table>`;
}
function rankList(list, f){ return list.length ? list.map((p, i) => `<div class="rank ${p.me ? "me" : p.id === S.rivalId ? "rival" : ""}"><span>${i+1}</span><div class="grow"><b>${esc(pname(p))}</b><div class="muted small">${esc(W.clubs[p.club].nm)}</div></div><b>${f(p)}</b></div>`).join("") : `<div class="muted small">No data yet.</div>`; }
function compareHTML(a, b){
  const rows = [["Club", p => W.clubs[p.club].nm], ["Age", p => p.age], ["Overall", p => p.me ? overall() : p.ovr], ["Reputation", p => pad5(p.rep)], ["World rep", p => pad5(p.wrep)], ["Apps", p => p.st.ap], ["Goals", p => p.st.g], ["Assists", p => p.st.a],
    ["Avg rating", p => p.st.ap ? (p.st.rs/p.st.ap).toFixed(2) : "–"], ["MotM", p => p.st.mo], ["Career goals", p => p.cr.g], ["Trophies", p => p.tro], ["Caps", p => p.nt.caps], ["Followers", p => p.me ? (S.social ? S.social.followers : 0) : p.fol]];
  return `<div class="cmp-head"><div><b>${esc(pname(a))}</b></div><span>vs</span><div><b>${esc(pname(b))}</b></div></div>` + rows.map(([k, f]) => { const x = f(a), y = f(b), nx = parseFloat(x), ny = parseFloat(y);
    return `<div class="cmp-row"><b class="${!isNaN(nx) && nx > ny ? "good" : ""}">${esc(x)}</b><span>${k}</span><b class="${!isNaN(ny) && ny > nx ? "good" : ""}">${esc(y)}</b></div>`; }).join("");
}
