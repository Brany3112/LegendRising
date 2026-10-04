"use strict";
/* ============ TUTORIAL: THE DREAM ============
   The night before your first game you dream you're a superstar with every skill maxed. The dream teaches the
   controls, then you wake up as the 17-year-old you really are. */
const TUT = {steps:[], i:0, done:null, typing:null, full:"", tok:0};
function tutRoot(){ return $("#tutRoot"); }
function tutShow(steps, done){
  TUT.tok++;                                    // cancels any fade-out still pending from the previous section
  TUT.steps = steps; TUT.i = 0; TUT.done = done;
  const r = tutRoot(); r.className = "tut on";
  r.innerHTML = `<div class="tut-dim" onclick="tutClick()"></div><div class="tut-spot" id="tutSpot"></div>
    <div class="tut-motes">${Array.from({length:26}, (_, i) => `<i style="--x:${(i*37)%100}%;--d:${(i*0.73)%9}s;--s:${6 + (i*7)%10}px;--t:${9 + (i*5)%9}s"></i>`).join("")}</div>
    <div class="tut-card" id="tutCard" onclick="tutClick()"><div class="tut-step" id="tutStep"></div><h3 id="tutTitle"></h3><p id="tutText"></p>
      <div class="tut-foot"><button class="tut-skip" onclick="event.stopPropagation();tutSkip()">Skip tutorial</button><button class="btn sm" id="tutNext" onclick="event.stopPropagation();tutClick()">Next ▸</button></div></div>`;
  tutStep();
}
function tutStep(){
  const st = TUT.steps[TUT.i], card = $("#tutCard"); if (!st || !card) return;
  card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
  $("#tutStep").textContent = `${TUT.i + 1} / ${TUT.steps.length}`;
  $("#tutTitle").textContent = st.title || "";
  $("#tutNext").textContent = st.button || (TUT.i === TUT.steps.length - 1 ? "OK" : "Next ▸");
  card.classList.toggle("low", !!st.low);
  // spotlight on the thing being explained
  const spot = $("#tutSpot"), el = st.focus ? document.querySelector(st.focus) : null;
  if (el){ const b = el.getBoundingClientRect(), pad = 10; Object.assign(spot.style, {left:(b.left - pad) + "px", top:(b.top - pad) + "px", width:(b.width + pad*2) + "px", height:(b.height + pad*2) + "px"}); spot.classList.add("on"); tutRoot().classList.add("spotlit"); }
  else { spot.classList.remove("on"); tutRoot().classList.remove("spotlit"); }
  // type the text in
  const txt = $("#tutText"); TUT.full = st.text; txt.innerHTML = ""; clearInterval(TUT.typing);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches){ txt.innerHTML = TUT.full; TUT.typing = null; return; }
  let n = 0; const plain = TUT.full.replace(/<[^>]+>/g, "");
  TUT.typing = setInterval(() => { n += 2; txt.textContent = plain.slice(0, n); if (n >= plain.length){ clearInterval(TUT.typing); TUT.typing = null; txt.innerHTML = TUT.full; } }, 18);
}
function tutClick(){
  if (!$("#tutCard") || !TUT.steps.length) return;
  if (TUT.typing){ clearInterval(TUT.typing); TUT.typing = null; $("#tutText").innerHTML = TUT.full; return; }   // first click finishes the line
  TUT.i++;
  if (TUT.i >= TUT.steps.length){ TUT.steps = []; tutClose(); const d = TUT.done; TUT.done = null; if (d) d(); return; }
  tutStep();
}
function tutClose(){ const r = tutRoot(), tok = ++TUT.tok; clearInterval(TUT.typing); r.classList.add("out"); setTimeout(() => { if (tok !== TUT.tok) return; r.className = "tut"; r.innerHTML = ""; }, 380); }
function countdown(done){
  TUT.tok++; TUT.steps = [];
  const r = tutRoot(); r.className = "tut on count";
  r.innerHTML = `<div class="tut-dim"></div><div class="cd" id="cd"></div>`;
  const seq = ["3","2","1","DREAM!"]; let i = 0;
  const show = () => { const el = $("#cd"); if (!el) return; el.textContent = seq[i]; el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
    i++; if (i < seq.length) setTimeout(show, 850); else setTimeout(() => { tutClose(); done(); }, 800); };
  show();
}

/* ---------- 1. falling asleep ---------- */
function startTutorial(){
  setPhoneVisible(false); closeSheet();
  const c = myClub();
  if (!S.replay) S.replay = null;
  render(`<section class="dreamscape"><div class="dream-orb"></div><div class="dream-z"><span>z</span><span>z</span><span>Z</span></div>
    <div class="dream-caption">${esc(S.player.name)} · the night before</div></section>`, "dream");
  setTimeout(() => LAST_SCREEN === "dream" && !S.tutDone && tutShow([
    {title:"The night before", text:`Tomorrow is your first game for <b>${esc(c.nm)}</b>. You're 17. You can't sleep.`},
    {title:"You close your eyes…", text:"The noise of 88,000 people fills your head. Floodlights. Your name on a giant screen."},
    {title:"In this dream, you're the best", text:"Every skill is <b>maxed at 99</b>. Pace, power, curl, dribbling, composure — everything. Enjoy it. Learn the game."},
    {title:"The Dream XI vs the Legends", text:"Let's see what you can do.", button:"Enter the dream ▸"}
  ], startDream), 700);
}
/* ---------- 2. the dream match: controls ---------- */
function tutDreamMatch(){
  tutShow([
    {title:"The match plays itself…", text:"The clock runs and the commentary tells you what's happening. When the ball comes to you, the game stops — that's <b>your moment</b>.", focus:"#comm", low:true},
    {title:"Work rate ⚡", text:"This button sets how hard you work. <b>⚡</b> saves energy but you get fewer chances. <b>⚡⚡⚡⚡</b> gets you on the ball far more — but you tire fast and the injury risk climbs. Tap it to change.", focus:"#wrBtn"},
    {title:"Energy", text:"Your energy drains every minute you're on the pitch, faster with a high work rate. Tired legs run slower and shoot weaker. Drink Energy-UP at half-time — that is the only time you can.", focus:".hud-energy"},
    {title:"Dribbling", text:"<b>Hold and drag</b> where you want the ball to go, or use the <b>arrow keys</b>. Drag a little for close control; drag far to <b>sprint</b> — faster, but heavy touches get nicked. Reach the box and your shot starts."},
    {title:"Shooting", text:"<b>Drag back from the ball</b>, the opposite way you want to shoot — like a slingshot. The further you pull, the more power. Watch the bar go white → green → red. <b>Release</b> to lock it in."},
    {title:"Strike the ball — and curl it", text:"Then a big ball appears: <b>click where your boot hits it</b>. Hit the <b>right side</b> and it curls left; the <b>left side</b> curls right. <b>Bottom</b> lifts it (low power + bottom = chip), <b>top</b> keeps it low and dipping, dead <b>centre</b> can knuckle."},
    {title:"Passing", text:"Sometimes a team-mate calls for it — <b>LW, RW, CAM or ST</b>. Same controls, less power. Find the one who's calling for the best chance of an assist.<br>While you're on the ball you can choose for yourself: <b>S</b> picks out the best-placed team-mate, <b>D</b> shoots. Play it to a team-mate and he may give it straight back — then you're running at goal again."},
    {title:"Ready?", text:"Tonight you're a legend. Show the Legends XI.", button:"OK"}
  ], () => countdown(() => { MT.label = "0'"; resumeClock(); }));
}
const DREAM_HINT = {run:"Drag towards the goal. Drag far to sprint past them.", pass:"Pull back away from the team-mate who's calling, release, then strike the middle of the ball.",
  freekick:"Try pulling back for ~70% power, then click the RIGHT side of the ball — watch it curl left round the wall.", edge:"Quick! A little under the centre lifts it into the top corner.",
  oneonone:"The keeper's rushing out. Try a chip: low power, click the bottom of the ball."};
/* ---------- 3. waking up ---------- */
function wakeUp(){
  loopOn = false; M = null; clearTimeout(MT && MT.timer); const sc = MT ? MT.score.slice() : [0,0]; MT = null;
  render(`<section class="dreamscape wake"><div class="wake-flash"></div><div class="dream-caption">Your bedroom · 6:30 am</div></section>`, "wake");
  const sk = SKILLS.map(([k, n]) => `${n} <b>${S.skills[k]}</b>`).join(" · ");
  setTimeout(() => LAST_SCREEN === "wake" && !S.tutDone && tutShow([
    {title:"BEEP. BEEP. BEEP.", text:`The alarm. You were winning ${sc[0]}–${sc[1]} against the Legends… and then it was gone.`},
    {title:"It was a dream", text:`In the real world you're 17, and your skills are… not quite there yet. Overall <b>${overall()}</b>.<br><span class="small">${sk}</span>`},
    {title:"Make it real", text:"Train, play, level up, buy better gear, hire coaches, stay humble online — or don't. Every game gets you closer to the dream."},
    S.replay ? {title:"Back to reality", text:`Your season with <b>${esc(myClub().nm)}</b> goes on. Go make the dream real.`, button:"Let's go"}
      : {title:"Today", text:`Pre-season is done. Your first game for <b>${esc(myClub().nm)}</b> is this week. Your keypad phone is in your pocket (bottom right).`, button:"Let's go"}
  ], finishTutorial), 900);
}
function finishTutorial(){
  S.tutDone = true;
  if (S.replay){ S.energy = S.replay.energy; S.replay = null; save(); renderHub(); return; }   // replaying mid-season: no free energy
  S.energy = 100;
  save(); renderHub();
  if (!window.startLife) toast("Pre-season friendly first — good luck!", "good");
  // test build: after the dream you wake up in your flat, in first person
  if (window.startLife && typeof enterCity === "function") enterCity();
}
function tutSkip(){
  clearInterval(TUT.typing); TUT.done = null;
  if (MT && MT.dream){ clearTimeout(MT.timer); matchSkillsOff(); loopOn = false; M = null; MT = null; }
  matchSkillsOff(); tutClose(); finishTutorial();
}
