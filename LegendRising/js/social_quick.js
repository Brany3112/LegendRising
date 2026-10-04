"use strict";
/* ============ SHOWOFF QUICK MESSAGES ============
   One tap = a random line in the chosen personality. Each line carries the words the tone reader looks for,
   so a "Humble" line is read as humble, a "Cocky" line as cocky, and so on. Recently used lines are skipped. */
const QUICK_TONES = [
  {id:"humble", label:"Humble", icon:"🙏"}, {id:"confident", label:"Confident", icon:"💪"}, {id:"brag", label:"Cocky", icon:"😎"},
  {id:"funny", label:"Funny", icon:"😂"}, {id:"sorry", label:"Honest", icon:"😔"}, {id:"toxic", label:"Toxic", icon:"😤"}
];
const QP = {
  // ---------- posts after a win ----------
  "W.humble":["Thank you to the lads and the fans tonight. Proud of this team 🙏","Grateful for every minute on that pitch. Hard work pays off, thanks {club} fans!","{score} vs {opp}. Team effort from start to finish, proud of the boys 💙","Thank God for another win. Big thanks to my teammates for the support.","Credit to the whole team today. The fans pushed us all the way, thank you!","Proud of the lads. We keep working hard together 🙏","That win belongs to the team and the fans. Thank you all ❤️","Blessed to share the pitch with these boys. Thank you {club}!","Humble win, humble group. Thank you fans for coming out 🙏","Grateful. Proud of the team. Back to hard work tomorrow."],
  "W.confident":["Three points in the bag. Focus on the next one 💪","{score}. Let's go! Onwards and upwards 🚀","Believe in the process. On to the next ✅","Hungry for more. Next game, same energy 🔥","We keep going. Ready for the next one 💪","That's the standard now. Focus, next ⏭️","3 points ✅ Still hungry, still ready.","Let's go {club}! More to come, believe it 🔥","Momentum is building. Keep going, focus on the next 👊","Winning mentality. Let's go again next week 💪"],
  "W.brag":["Too easy. {opp} had nobody to stop me 😎","Best player on the pitch again. Too easy, you're welcome 👑","King of {club}. Nobody does it like me 😎","Easy work tonight. Legend behaviour 🐐","They tried. Too good, too easy 💅","Another day, another masterclass. I'm the best in this league 👑","Boss performance. Nobody can touch me 😎","Legend stuff at {opp}. Too good for this level 🐐","Carried again. Too easy for the king 👑","{goals} goals? Easy. Best in the league, no debate 😎"],
  "W.funny":["Me pretending I planned that finish 😂","Coach said 'keep it simple'. I did not keep it simple 😂 but we won lol","{score} and my legs are officially retired 😂","Somebody tell {opp} the game's over lol","Post-match meal loading... haha 🍕","My celebration needs work tbh 😂","Scored and forgot how to celebrate lmao","I blinked and we were ahead lol 😂","Me after the final whistle: 🛌 lol","Group chat is going crazy right now 😂"],
  "W.sorry":["Won {score}, but honestly I have to be better. My fault on a few chances.","Three points, but I'm disappointed with my own game. I'll bounce back sharper.","Happy with the win, but a few of those misses are on me. Sorry fans, I'll fix it.","Good result. Not my best day though — my fault, I'll bounce back."],
  "W.toxic":["{opp} were trash. Embarrassing level 🤡","Worst defence I've ever played against. Pathetic from {opp}.","{opp} fans can go cry. Useless, clown show 🤡","That was a joke of a team. Garbage from start to finish.","Some of those {opp} defenders are embarrassing. Clowns.","Pathetic. {opp} should be relegated tbh, worst side in the league."],
  // ---------- posts after a draw ----------
  "D.humble":["A point today. Thank you fans for the support, we keep working together 🙏","Grateful for the effort from the lads. We go again together.","Proud of how the team kept fighting. Thank you for the support!","Hard work from everyone. Thanks to the fans who travelled 🙏","A point we earned together. Big thanks to the boys and the fans."],
  "D.confident":["A point is a point. Focus on the next one 💪","We go again. Ready for next week 🔥","Not the result we wanted, but we keep going. Next!","Believe in this group. Next game we take all 3 points 💪","Focus reset. On to the next one ⏭️"],
  "D.brag":["Only reason we got a point? Me, the best on the pitch 😎","Too good for this draw. The rest need to catch up to my level 👑","Best player out there again. Nobody else showed up 😎","I did my part. Easy for me, the king can't do it all alone 👑"],
  "D.funny":["A draw... my heart can't take this lol 😂","{score}. Everyone's confused lol 😂","Split the points like splitting a pizza 🍕 lol","That game was a rollercoaster haha 🎢"],
  "D.sorry":["I should have won that for us. My fault, sorry fans.","Disappointed. That chance is on me — I'll bounce back.","Not good enough from me today. Sorry, I'll be better.","Two points dropped and some of that is on me. Sorry."],
  "D.toxic":["That referee was a joke. Pathetic decisions all day 🤡","{opp} parked the bus. Embarrassing football, trash to watch.","Worst pitch I've ever played on. Useless conditions, clown show.","Garbage game. {opp} can't play football, pathetic."],
  // ---------- posts after a loss ----------
  "L.humble":["Tough one today. Thank you fans for sticking with the team, we keep working 🙏","We stay together. Grateful for the support even on days like this.","Hard day, but proud of the lads for fighting. Thank you fans.","We learn and keep working hard together. Thank you for the support ❤️","The team will come back stronger. Thanks for standing with us 🙏"],
  "L.confident":["One loss doesn't define us. Focus on the next one 💪","We go again. Hungry to put this right 🔥","Reset. Ready. Next game we respond 💪","Believe in this group. Keep going, next week is ours."],
  "L.brag":["Lost, but I was still the best player out there 😎","Not my fault. Too good for this level honestly 👑","Everyone else had a bad day. Me? Still the king 😎","Can't do it alone. Best player on the pitch regardless, still the king 👑"],
  "L.funny":["Gonna need a lot of ice cream after that one lol 🍦","That game was a comedy lol 😂","Deleting that match from my memory haha","Well... at least the kit looked nice 😂"],
  "L.sorry":["Sorry to the fans. That's on me, I wasn't good enough. I'll bounce back.","Disappointed with myself. My fault, no excuses. I'll be better.","Not acceptable from me today. Sorry, I'll work to bounce back.","I let you down today. On me. Sorry — we'll bounce back."],
  "L.toxic":["Referee robbed us. Pathetic, absolute clown 🤡","Some people in this team are useless. Embarrassing.","{opp} got lucky. Trash team, worst performance I've seen.","That was a joke. Garbage from the referee and garbage from half our lineup."],
  // ---------- after a purchase ----------
  "P.humble":["Thanks to you, the fans, I was able to buy my {item}. Grateful for everything 🙏","Hard work paid off — got my {item}. Thank you to everyone who supports me!","Never forget where I came from. Grateful for this {item}, thank God 🙏","My family and the fans made this possible. Thank you — my {item} 🙏","Small step, big meaning. Thanks for the support that got me my {item}."],
  "P.confident":["New {item} ✅ Now focus on the next goal 💪","Treated myself to a {item}. Back to work, ready for more 🔥","{item} unlocked. Keep going, more to come 🚀","Got the {item}. Hungry for bigger things 💪"],
  "P.brag":["My new {item} 😎 Rich life, too easy 💰","Bought the {item}. Money is no problem for the king 👑","Look at my new {item}. Nobody in this league lives like me 😎","{item} secured. Boss life, legend status 💰","Cash out. My new {item}, best in the city 😎"],
  "P.funny":["Bought a {item} and now I'm broke again lol 😂","My bank account after this {item}: 💀 haha","Me explaining the {item} to my mum 😂","{item}? Don't ask how many Energy-UPs that cost lol"],
  "P.sorry":["Got a {item}. Sorry if it looks flashy — my fault, feet stay on the ground.","Treated myself to a {item}. Sorry, my fault if it's too much — I'll be better at staying grounded."],
  "P.toxic":["My {item} is worth more than you clowns. Pathetic losers 🤡","Haters crying about my {item}. Pathetic, stay useless.","Imagine being jealous of my {item}. Embarrassing, losers."],
  // ---------- awards, trophies, new club ----------
  "A.humble":["Thank you for {award}. This belongs to the team and the fans 🙏","Grateful for {award}. Couldn't do it without my teammates, thank you!","Proud and humble. {award} is for my family and the fans ❤️","Thank God for {award}. The lads made this possible 🙏"],
  "A.confident":["{award} ✅ Next target loading 💪","Nice to win {award}. Focus on the next one 🔥","{award}. Keep going, more to come 🚀"],
  "A.brag":["{award}. Obviously. Best in the business 👑","Who else? {award}, the king does it again. Too easy 😎","{award}. Too easy. Legend 🐐"],
  "A.funny":["Where do I put {award}? My shelf is tiny lol 😂","{award}! Pinch me haha 🤯"],
  "A.sorry":["Honoured by {award}, but honestly I can still be better. Sorry for the bad days in between."],
  "A.toxic":["{award}. Cry more, haters 🤡","All the clowns who doubted me — {award}. Pathetic losers."],
  "T.humble":["Champions! Thank you to the team, the staff and the fans 🏆🙏","We did it together. Grateful for this group — {award}!","Proud of every one of the lads. {award} belongs to all of us, thank you 🏆"],
  "T.confident":["{award} ✅ Let's go again next season 💪","Champions, and still hungry. Next! 🔥"],
  "T.brag":["{award}. Told you. The king delivers 👑","Trophy in my hands. Best team, best player 😎"],
  "T.funny":["Lost my voice celebrating {award} lol 😂","Who's got the trophy? Not me, I'm asleep 😂"],
  "T.sorry":["Won {award}, but honestly sorry for the rough spells. I'll bounce back even better."],
  "T.toxic":["{award}. All the clowns who wrote us off — pathetic 🤡"],
  "X.humble":["Grateful to join {club}. Thank you for the welcome, proud to be here 🙏","New chapter at {club}. Thank you to my old teammates and fans ❤️","Proud to wear the {club} shirt. Thank you, let's work hard together."],
  "X.confident":["{club}, let's go! Ready for the challenge 💪","New club, same hunger. Focus on the next step 🔥"],
  "X.brag":["{club} got the best signing of the window 😎","Too good for my old club. {club}, your king has arrived 👑"],
  "X.funny":["New club, new kit, still can't find the canteen lol 😂","First day at {club}: got lost twice haha"],
  "X.sorry":["Sorry to my old club's fans if this hurts. I'm disappointed it ended like this — I'll bounce back."],
  "X.toxic":["Glad to leave that clown club behind. Useless management 🤡"],
  // ---------- replying when someone mentions you ----------
  "M.humble":["Respect {name}. Thanks for the words, see you on the pitch 🤝","Appreciate it {name}. Proud of how we both keep working 🙏","Thanks {name}, grateful. We'll talk on the pitch 🤝"],
  "M.confident":["@{name} ready when you are 💪","@{name} focus on your game. I'm focused on mine 🔥","@{name} see you next time. Believe it."],
  "M.brag":["@{name} you're not on my level 😎 King talk only 👑","@{name} check the stats. Best in the league, nobody close 😎","@{name} easy. Too good for you 👑"],
  "M.funny":["@{name} lol ok 😂","@{name} bro typed that with his whole chest haha 😂","@{name} lmao see you Saturday 😂"],
  "M.sorry":["@{name} fair. My fault last game, I'll bounce back.","@{name} honestly, you're right. Disappointed with myself, sorry."],
  "M.toxic":["@{name} stay quiet, clown 🤡","@{name} trash player talking trash. Pathetic.","@{name} worst player in the league talking? Embarrassing loser."],
  // ---------- commenting on someone else's post ----------
  "C.humble":["Well played {name} 👏","Respect bro, proud of you 🙏","Deserved! Keep working 💪","Class performance {name}, thanks for the battle 🤝","Proud of you bro, hard work pays off"],
  "C.funny":["😂😂😂","Bro really posted this lol","Admin cooking again haha 😂","{name} the comedian 😂"],
  "C.brag":["Not bad. Still not as good as me 😎","Nice try {name}. The king approves 👑","Cute. Come back when you're the best 😎"],
  "C.toxic":["Overrated clown 🤡","Trash post from a trash player.","Pathetic. Embarrassing honestly.","Useless on the pitch, useless online."],
  // ---------- replying to a fan on your own post ----------
  "F.humble":["Thank you ❤️🙏","Appreciate the support, thank you!","Grateful for you, thanks 🙏","Thanks bro, we keep working!"],
  "F.funny":["😂😂","lol facts","haha you're not wrong 😂","This comment made my day lmao"],
  "F.brag":["Obviously. Best in the league 😎","I know I'm the king 👑","Too good, I know 😎"],
  "F.toxic":["Nobody asked, clown 🤡","Go cry somewhere else, loser.","Pathetic comment. Useless."]
};
function quickText(kind, tone, vars){
  const pool = QP[`${kind}.${tone}`] || QP[`W.${tone}`] || [];
  if (!pool.length) return "";
  const s = S.social, recent = s.recentQ || (s.recentQ = []);
  let options = pool.filter(t => !recent.includes(t));
  if (!options.length){ options = pool; s.recentQ = recent.filter(t => !pool.includes(t)); }
  const tpl = pick(options);
  s.recentQ.push(tpl); if (s.recentQ.length > 120) s.recentQ.shift();
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : "");
}
// which pool a post context uses, and the words that fill it
function ctxKind(c){
  if (c.type === "match") return (S.lastMatch && S.lastMatch.res) || "W";
  return {purchase:"P", award:"A", trophy:"T", transfer:"X", mention:"M"}[c.type] || "W";
}
function ctxVars(c){
  const lm = S.lastMatch || {};
  return {club:myClub().nm, opp:lm.opp || "them", score:lm.score || "", goals:lm.goals || 0, item:c.type === "purchase" ? c.ref : "", award:c.ref, name:c.type === "mention" ? c.ref.split(" ").slice(-1)[0] : c.ref};
}
