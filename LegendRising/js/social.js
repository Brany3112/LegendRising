"use strict";
/* ============ SHOWOFF (in-game social network) ============
   Perception works like an honor meter: two axes, humility (humble <-> cocky) and respect (respectful <-> toxic).
   What you write moves them; they change followers, likes, how fans and clubs treat you. */
const LEX = {
  humble:["thank","thanks","grateful","respect","well played","deserved","appreciate","blessed","team","teammates","together","the boys","lads","god","work hard","hard work","keep working","learn","humble","fans","support","proud of","honour","honor","family","mulțumesc","multumesc","mersi","echipa","echipei","băieți","baieti","munc","suporter","familie","doamne"],
  confident:["ready","next","focus","again","more to come","believe","hungry","let's go","lets go","onwards","keep going","win","victory","three points","3 points","continuam","continuăm","inainte","înainte","hai"],
  brag:["best","goat"," king","rich","money","my new","bought","lambo","ferrari","villa","mansion","house"," car ","cash","too good","nobody","easy","legend","boss","flex","drip","cel mai bun","regele","bani","mașin","masin","smecher","șmecher","vila","vilă","numărul 1","numarul 1","no1"],
  toxic:["trash","terrible","awful","useless","clown","loser","garbage","worst","shit","cry more","go cry","stay quiet","nobody asked","who asked","fuck","idiot","stupid","pathetic","embarrassing","prost","nasol","varza","varză","ratat","fraier","slab","penibil","jalnic","muie"," bou "],
  sorry:["sorry","not good enough","wasn't good enough","let you down","honestly, you're right","be better","apologize","apologise","disappointed","bad day","bounce back","my fault","on me","scuze","îmi pare rău","imi pare rau","pacat","păcat","vina mea"],
  funny:["lol","haha","😂","xd","lmao","🤣","comedy","comedian"]
};
// strong signals (insults, apologies, jokes, crowns) outweigh generic words like "team" or "win"
const TONE_W = {toxic:2.2, sorry:1.8, funny:1.6, brag:1.35, humble:1, confident:.85};
const EMO = {brag:["👑","😎","🐐","💰","💅"], toxic:["🤡","🙄"], humble:["🙏","❤️","💙"], confident:["💪","🔥","🚀","✅","👊","⏭️"], funny:["💀","🤯","🍕","🍦","🛌"]};
function toneOf(text){
  const t = " " + text.toLowerCase() + " ", sc = {};
  for (const [k, words] of Object.entries(LEX)) sc[k] = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
  for (const [k, em] of Object.entries(EMO)) sc[k] += em.reduce((s, e) => s + (text.includes(e) ? .6 : 0), 0);
  for (const k in sc) sc[k] *= TONE_W[k] || 1;
  if (/!{2,}/.test(text)) sc.confident += .5;
  if (text.length > 0 && text === text.toUpperCase() && /[A-Z]{4,}/.test(text)) sc.brag += .5;
  const top = Object.entries(sc).sort((a,b) => b[1] - a[1])[0];
  return {tone: top[1] > 0 ? top[0] : "neutral", sc};
}
function perception(){
  const s = S.social; if (!s) return {label:"Unknown", color:"#8aa"};
  const h = s.humility, r = s.respect;
  if (r < -35) return {label:"Toxic", color:"#ef5a60"};
  if (h < -35) return {label: s.brag > 4 ? "Smug" : "Cocky", color:"#ff9f43"};
  if (r > 35 && h > 25) return {label:"Fan favourite", color:"#5fd47a"};
  if (h > 25) return {label:"Humble professional", color:"#5fd47a"};
  if (h < -15 && r > 10) return {label:"Confident", color:"#ffd75a"};
  if (r < -15) return {label:"Controversial", color:"#ff9f43"};
  return {label:"Neutral", color:"#9db1c2"};
}
function socialInit(handle){
  S.social = {handle, followers:12 + Math.round(meP().rep/5), following:[], friends:[], posts:[], feed:[], humility:0, respect:0, brag:0, ctx:[], notes:[], likes:0};
  addNews("you", `${S.player.name} joins Showoff`, `@${handle} is live.`, "me");
}
// something happened that you can post about
function socialEvent(type, ref, extra){
  if (!S.social) return;
  const labels = {match:`After the game: ${ref}`, purchase:`You bought: ${ref}`, award:`Award: ${ref}`, trophy:`Trophy: ${ref}`, transfer:`New club: ${ref}`, mention:`Reply to ${ref}`, goal:`That goal: ${ref}`};
  S.social.ctx.unshift({id:Date.now() + Math.random(), type, ref, label:labels[type] || ref, extra:extra || null, gw:gw()});
  S.social.ctx = S.social.ctx.slice(0, 8);
}
function postReaction(ctx, text){
  const s = S.social, me = meP(), {tone} = toneOf(text);
  const lm = S.lastMatch, perf = ctx.type === "match" && lm ? (lm.rating - 6.2)*10 + lm.goals*14 + lm.assists*8 + (lm.res === "W" ? 6 : lm.res === "L" ? -4 : 0) : ctx.type === "goal" ? 44 : ctx.type === "award" || ctx.type === "trophy" ? 30 : ctx.type === "transfer" ? 20 : 6;
  const T = {humble:{h:4, r:3, f:1, l:1.1}, confident:{h:-1, r:0, f:1.1, l:1.2}, brag:{h:-5, r:-1, f:1.25, l:1.25}, toxic:{h:-3, r:-8, f:1.15, l:.85}, sorry:{h:3, r:3, f:.9, l:1}, funny:{h:0, r:1, f:1.1, l:1.2}, neutral:{h:0, r:0, f:.9, l:.9}}[tone];
  let hum = T.h, res = T.r;
  if (tone === "brag"){ s.brag++; hum *= 1 + s.brag*.3; }                                    // repeating it makes it worse
  if (ctx.type === "purchase" && tone === "humble") hum += 2;                                 // "thanks to you I bought my first car"
  if (ctx.type === "match" && lm && lm.res === "L" && (tone === "brag" || tone === "confident")) hum -= 3; // bragging after a loss
  if (tone === "toxic" && lm && lm.rating < 6) res -= 3;                                       // toxic while playing badly
  s.humility = clamp(s.humility + hum, -100, 100); s.respect = clamp(s.respect + res, -100, 100);
  const base = Math.max(1, 4 + me.rep/60 + perf) * T.f * rnd(.75, 1.3) * (carTier() === 3 ? 1.15 : 1);
  const gain = Math.round(base * (1 + s.followers/4000) * styleMul());
  s.followers = Math.max(0, s.followers + gain);
  const likes = Math.round((s.followers*rnd(.06, .16) + gain*2) * T.l);
  const post = {id:Date.now(), text, tone, ctx:ctx.label, likes, gain, gw:gw(), comments:fanComments(tone, ctx, lm)};
  s.posts.unshift(post); s.posts = s.posts.slice(0, 40); s.likes += likes;
  s.ctx = s.ctx.filter(c => c.id !== ctx.id);
  // reputation in the country moves with behaviour
  // posting about something that mattered is worth real reputation, not just followers
  const worth = {goal:22, trophy:16, award:12, transfer:8}[ctx.type] || 0;
  const mood = tone === "toxic" ? .25 : tone === "brag" ? .75 : tone === "humble" || tone === "sorry" ? 1.15 : 1;
  const fromPost = Math.round(worth*mood*styleMul()*(1 + me.rep/9000));
  meP().rep = Math.max(0, meP().rep + fromPost
    + (tone === "humble" || tone === "sorry" ? 2 : tone === "toxic" ? -4 : tone === "brag" && s.brag > 3 ? -2 : 0));
  if (worth) meP().wrep = Math.max(0, meP().wrep + Math.round(fromPost*.3));
  if (tone === "toxic" && /team|coach|antrenor|echip/.test(text.toLowerCase())) trustAdd(-6);
  if (ctx.type === "mention" && ctx.extra && ctx.extra.by != null){
    const by = W.players[ctx.extra.by];
    if (tone === "toxic") s.feed.unshift(npcPost(by, pick([`@${s.handle} talk less, play better.`, `Keep crying @${s.handle} 😂`, `Some people can't take criticism. @${s.handle}`]), true));
    else if (tone === "humble" || tone === "sorry"){ if (!s.friends.includes(by.id) && Math.random() < .4){ s.friends.push(by.id); if (!s.following.includes(by.id)) s.following.push(by.id); s.notes.unshift(`${pname(by)} followed you back — you're friends now.`); } }
  }
  return post;
}
function fanComments(tone, ctx, lm){
  const n = ri(3, 6), out = [], s = S.social;
  const good = {humble:["Class act 👏","This is why we love you","Stay humble king","Proud of you!","Legend in the making"], confident:["LET'S GOOO 🔥","Believe!!","Next one loading","That's the mentality"], brag:["Bro relax 😂","Nice car, now score more","Humble yourself","Money won't pass the ball","Flexing again?","We get it, you're rich"], toxic:["Disrespectful.","Delete this","Not a good look","Unfollowed.","Sort your attitude out","Wow. Just wow."], sorry:["Head up! 💪","We go again","Next game you'll smash it","Happens to the best"], funny:["😂😂😂","Admin is on fire","Bro is a comedian"], neutral:["🔥","👏","💯","Nice"]}[tone];
  const bad = ["Terrible performance tbh","Sell him","Stop posting and train","You were invisible today","Overrated"];
  for (let i = 0; i < n; i++){
    const c = myClub(), nat = c ? COUNTRIES[c.cc].nat : S.player.nat, N = NAMES[nat];
    const who = "@" + (N.f[ri(0, N.f.length-1)] + N.l[ri(0, N.l.length-1)]).toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 14) + ri(1, 99);
    const txt = lm && lm.rating < 5.8 && ctx.type === "match" && Math.random() < .4 ? pick(bad) : pick(good);
    out.push({by:who, text:txt, liked:false, replied:null});
  }
  if (s.friends.length && Math.random() < .5){ const f = W.players[pick(s.friends)]; out.unshift({by:"@" + sname(f).toLowerCase(), npc:f.id, text:pick(["Well played bro 🤝","Proud of you!","Let's train together this week","💪🔥"]), liked:false, replied:null}); }
  return out;
}
function replyComment(post, i, text){
  const c = post.comments[i], {tone} = toneOf(text), s = S.social;
  c.replied = text;
  s.humility = clamp(s.humility + (tone === "humble" ? 2 : tone === "brag" ? -2 : 0), -100, 100);
  s.respect = clamp(s.respect + (tone === "toxic" ? -5 : tone === "humble" || tone === "sorry" || tone === "funny" ? 2 : 0), -100, 100);
  s.followers += tone === "toxic" ? ri(0, 6) : ri(1, 4);
  meP().rep = Math.max(0, meP().rep + (tone === "toxic" ? -2 : 1));
  return tone;
}
function likeComment(post, i){ const c = post.comments[i]; if (c.liked) return; c.liked = true; S.social.respect = clamp(S.social.respect + 1, -100, 100); S.social.followers += ri(0, 2); if (Math.random() < .35) meP().rep += 1; }
function npcPost(p, text, mention){ return {id:Date.now() + Math.random(), by:p.id, text, likes:Math.round(p.fol*rnd(.02, .08)), liked:false, mention:!!mention, gw:gw(), comments:[]}; }
function likeFeed(item){ if (!item || item.liked) return; item.liked = true; item.likes++; S.social.respect = clamp(S.social.respect + 1, -100, 100); if (Math.random() < .4) S.social.followers++; }
function followPlayer(pid){
  const s = S.social; if (s.following.includes(pid)) return "Already following.";
  s.following.push(pid);
  const p = W.players[pid], chance = clamp(.1 + s.followers/(p.fol + 50)*1.5 + (p.club === meP().club ? .5 : 0) + (s.respect > 20 ? .1 : 0), .02, .95);
  if (pid !== S.rivalId && Math.random() < chance){ s.friends.push(pid); return `${pname(p)} followed you back — you're friends now.`; }
  return `You're following ${pname(p)}.`;
}
// weekly: other players post, some mention you, rival talks
function socialWeek(){
  const s = S.social; if (!s) return;
  const me = meP(), lg = W.leagues[myLg()];
  if (!lg) return;                                 // no club this week, so no dressing-room chatter
  const pool = lg.clubs.flatMap(cid => squadOf(cid)).filter(p => !p.me && p.st.ap);
  const stars = pool.sort((a,b) => (b.m.g*3 + b.m.a*2) - (a.m.g*3 + a.m.a*2)).slice(0, 4);
  for (const p of stars) if (Math.random() < .5) s.feed.unshift(npcPost(p, pick([`Big win today 💪 #${W.clubs[p.club].nm.replace(/\s/g, "")}`, `Grateful for another goal. On to the next.`, `What a night! Thank you fans 🔥`, `Team effort. Proud of these boys.`, `Back to work tomorrow.`])));
  for (const fid of s.following.slice(-6)) if (Math.random() < .25){ const p = W.players[fid]; if (p && !p.me) s.feed.unshift(npcPost(p, pick(["Recovery day 🧊","Matchday mood 🎧","Focused. 🎯","Training done ✅"]))); }
  const rv = W.players[S.rivalId];
  if (rv && Math.random() < .45){
    const lm = S.lastMatch, mine = s.followers, his = rv.fol;
    let t;
    if (lm && lm.rating < 6) t = pick([`Some people are all hype and no end product 👀 @${s.handle}`, `Rated ${lm.rating}? And they compare us? @${s.handle} 😂`]);
    else if (lm && lm.rating >= 7.5) t = pick([`Decent game @${s.handle}. Still not on my level.`, `Enjoy it while it lasts @${s.handle} 😏`]);
    else t = pick([`Only one of us is going to the top. #${sname(rv)}`, `Numbers don't lie. Check Visage 📊`, `Heard ${mine > his ? "someone has more followers than goals" : "a lot of noise lately"} 🤫`]);
    const post = npcPost(rv, t, t.includes("@" + s.handle));
    s.feed.unshift(post);
    if (post.mention) socialEvent("mention", pname(rv), {by:rv.id, post:post.id});
  }
  if (S.lastMatch && S.lastMatch.gw >= gw() - 1 && Math.random() < .35){
    const mates = squadOf(me.club).filter(p => !p.me);
    if (mates.length){ const m = pick(mates); const good = S.lastMatch.rating >= 7;
      const post = npcPost(m, good ? `What a player we have in @${s.handle} 🔥` : `Heads up @${s.handle}, next week we fix it 🤝`, true); s.feed.unshift(post); socialEvent("mention", pname(m), {by:m.id, post:post.id}); }
  }
  s.feed = s.feed.slice(0, 50);
  // passive drift: followers follow reputation, bad image slowly costs followers
  s.followers = Math.max(0, Math.round(s.followers + me.rep/200 + (s.respect < -40 ? -s.followers*.01 : 0)));
}
