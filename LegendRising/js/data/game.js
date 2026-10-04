"use strict";
/* ============ GAME CONSTANTS ============ */
const SKILLS = [
  ["power","Shot power","Top speed of the ball off your boot"],
  ["aero","Clean strike","Less drag — long shots keep their pace"],
  ["curve","Curve","How hard the ball bends when you hit its side — strike the edge for a big bend"],
  ["accuracy","Accuracy","Less random error on hard shots"],
  ["passing","Passing","Vision and the weight you put on a pass"],
  ["passacc","Pass accuracy","How precisely a pass lands where you meant it to"],
  ["pace","Pace","Running speed with the ball"],
  ["dribbling","Dribbling","Chance to ride a tackle"],
  ["stamina","Stamina","How slowly your energy drains in matches — low stamina burns out fast"],
  ["composure","Composure","Keeps your skills from dropping in front of huge crowds"],
  ["tackling","Tackling","How cleanly you take the ball off a man, and how much of him you risk catching"],
  ["interception","Interception","Reading a pass early and getting into its lane"],
  ["jumping","Jumping","How high and how quickly you get off the ground"],
  ["heading","Heading","Power and direction when you meet the ball with your head"]
];
// where each skill is actually trained, shown on the stats computer
const SKILL_HOW = {
  power:"Gym · squat rack and dumbbells", aero:"Pitch · shooting drill, hit it hard and clean", curve:"Matches · bend shots and free kicks",
  accuracy:"Pitch · shooting accuracy drill at the goal", passing:"Pitch · pass accuracy drill, team sessions", passacc:"Pitch · pass accuracy drill in the centre circle",
  pace:"Gym · sprint ladder and bike", dribbling:"Matches and team sessions", stamina:"Gym · treadmill and bike",
  composure:"Big crowds on match day", tackling:"Matches and team sessions", interception:"Pitch · interception drill by the ball machine",
  jumping:"Gym · plyo boxes, and the heading drill", heading:"Pitch · heading drill at the far goal"
};
/* Everything you can eat or drink. energy is the food/energy meter, fatigue a change to tiredness
   (negative helps). mins is how long it takes. store is the Mini Market price, foodies the delivered one. */
const FOOD = {
  fruit:   {name:"Banana & apple",   icon:"🍌", kind:"food",     energy:7,  fatigue:-1,  mins:5,  store:1, foodies:2,  shelf:"food"},
  sandwich:{name:"Sandwich",         icon:"🥪", kind:"food",     energy:14, fatigue:0,   mins:10, store:3, foodies:4,  shelf:"food"},
  meal:    {name:"Ready meal",       icon:"🍱", kind:"food",     energy:26, fatigue:0,   mins:20, store:5, foodies:7,  shelf:"food"},
  pasta:   {name:"Chicken pasta",    icon:"🍝", kind:"food",     energy:34, fatigue:-3,  mins:20, store:7, foodies:9,  shelf:"food"},
  water:   {name:"Water",            icon:"💧", kind:"drink",    energy:2,  fatigue:-2,  mins:2,  store:1, foodies:2,  shelf:"drink"},
  iso:     {name:"Isotonic drink",   icon:"🧃", kind:"drink",    energy:8,  fatigue:-4,  mins:2,  store:2, foodies:3,  shelf:"drink"},
  drink:   {name:"Energy-UP",        icon:"⚡", kind:"energy",   energy:22, fatigue:0,   mins:2,  store:3, foodies:4,  shelf:"drink"},
  max:     {name:"Energy-UP MAX",    icon:"⚡", kind:"energy",   energy:40, fatigue:0,   mins:2,  store:7, foodies:9,  shelf:"drink"},
  shake:   {name:"Protein shake",    icon:"🥤", kind:"recovery", energy:10, fatigue:-8,  mins:5,  store:4, foodies:6,  shelf:"drink"},
  rub:     {name:"Muscle rub",       icon:"🧴", kind:"recovery", energy:0,  fatigue:-12, mins:10, store:6, foodies:8,  shelf:"door"}
};
const FOOD_KINDS = [["food","Food"], ["drink","Drinks"], ["energy","Energy"], ["recovery","Recovery"]];
const FOODIES_FEE = 2;
/* Where you play. The order is the pitch, back to front — asking to move up or down walks this list.
   blurb is what the position asks of you; chances is roughly how much of a game you spend in front of goal. */
const POS = {
  DF: {name:"Defender",       line:0, bonus:{tackling:9, composure:5, passing:3, interception:7, heading:6, jumping:4}, blurb:"You defend first. Fewer chances, but a clean sheet is your goal."},
  CM: {name:"Central mid",    line:1, bonus:{passing:6, stamina:4, tackling:4, passacc:5, interception:4},  blurb:"The engine. You touch the ball more than anyone."},
  AM: {name:"Attacking mid",  line:2, bonus:{curve:4, passing:6, accuracy:2, passacc:5},  blurb:"Between the lines. Create, and get on the end of things."},
  W:  {name:"Winger",         line:2, bonus:{pace:6, dribbling:6, passacc:2},             blurb:"One against one on the touchline. Beat him and cross, or cut in."},
  ST: {name:"Striker",        line:3, bonus:{power:6, accuracy:6, heading:4, jumping:3},  blurb:"Score. Everything else is a bonus."}
};
const POS_ORDER = ["DF", "CM", "AM", "W", "ST"];
// how often a match asks you to defend. A centre half does it constantly; a striker tracks back now and then.
const DEFEND_MIX = {ST:{tackle:3, intercept:2, aerial:4}, W:{tackle:5, intercept:3, aerial:2},
  AM:{tackle:7, intercept:6, aerial:3}, CM:{tackle:16, intercept:13, aerial:7}, DF:{tackle:24, intercept:17, aerial:16}};
const ROLE = {starter:"Starting XI", rotation:"Rotation", sub:"Impact sub"};
// calendar: 40 weeks, August to May
const CAL = {W:40, MONTHS:["August","September","October","November","December","January","February","March","April","May"],
  INTL:[5,10,15,28,34], EURO:[6,8,11,14,17,19], KO:{qf:25, sf:30, f:37},
  FRIENDLY:0,                                   // pre-season: nothing counts, but you get minutes
  CUP:[2, 7, 13, 18, 24, 33],                       // domestic cup rounds; the last one is always the final
  WC:{grp:[10, 15], sf:28, f:34}};              // the World Championship lives on the international weeks
/* How much a game is worth. base scales your league reputation, world scales the world one.
   A bad game costs you: in the big competitions the league hit is doubled while the world hit stays normal. */
const COMP_REP = {
  F:  {base:.5,  world:.02, bad:1, nm:"Friendly"},
  L:  {base:1,   world:.05, bad:1, nm:"League"},
  C:  {base:1.35,world:.08, bad:1, nm:"Cup"},
  EL: {base:2.0, world:.55, bad:2, nm:"Euro League"},
  CL: {base:2.4, world:.70, bad:2, nm:"Champs League"},
  N:  {base:2.0, world:.50, bad:2, nm:"International"},
  WC: {base:2.6, world:.90, bad:2, nm:"World Championship"}
};
/* Day jobs: five ladders, three positions each. You start washing plates and finish cutting highlight reels.
   Every position pays more than the one before it — including across a jump to the next job. */
const JOBS = [
  {id:"cafe", name:"Corner Café", icon:"☕", ranks:[
    {name:"Dishwasher", pay:[14, 20], need:12, blurb:"Plates, sinks, closing time."},
    {name:"Barista", pay:[22, 30], need:16, blurb:"You know the regulars by order."},
    {name:"Shift Supervisor", pay:[32, 42], need:20, blurb:"You hold the keys and the rota."}]},
  {id:"store", name:"Neighbourhood Store", icon:"🧾", ranks:[
    {name:"Shelf Stacker", pay:[44, 56], need:16, blurb:"Crates in, gaps filled, nights."},
    {name:"Cashier", pay:[58, 72], need:20, blurb:"Till, queue, small talk."},
    {name:"Floor Supervisor", pay:[76, 96], need:24, blurb:"Rotas, stock counts, the safe."}]},
  {id:"courier", name:"City Courier", icon:"🛵", ranks:[
    {name:"Bike Courier", pay:[100, 125], need:20, blurb:"Legs already fit — might as well get paid."},
    {name:"Scooter Rider", pay:[130, 165], need:24, blurb:"Longer runs, bigger tips."},
    {name:"Dispatch Lead", pay:[175, 220], need:28, blurb:"You route the whole evening shift."}]},
  {id:"gym", name:"Sports Centre", icon:"🏋", ranks:[
    {name:"Front Desk", pay:[230, 290], need:24, blurb:"Memberships, towels, the 6am opening."},
    {name:"Gym Assistant", pay:[300, 370], need:28, blurb:"Floor walks and spotting strangers."},
    {name:"Personal Trainer", pay:[380, 470], need:32, blurb:"Your own clients, your own hours."}]},
  {id:"academy", name:"Youth Academy", icon:"🎓", ranks:[
    {name:"Session Helper", pay:[490, 600], need:28, blurb:"Cones, bibs, keeping eleven kids quiet."},
    {name:"Youth Coach", pay:[620, 760], need:32, blurb:"You run the drills now."},
    {name:"Age-Group Lead", pay:[790, 960], need:36, blurb:"A whole age group answers to you."}]},
  {id:"photo", name:"Photo Studio", icon:"📷", ranks:[
    {name:"Studio Assistant", pay:[1000, 1200], need:32, blurb:"Lights, reflectors, carrying bags."},
    {name:"Photographer", pay:[1250, 1500], need:36, blurb:"Portraits and local match days."},
    {name:"Lead Photographer", pay:[1550, 1850], need:40, blurb:"Your name is on the credit line."}]},
  {id:"edit", name:"Video Editing", icon:"🎬", ranks:[
    {name:"Junior Editor", pay:[1900, 2300], need:36, blurb:"Cutting other people's footage."},
    {name:"Video Editor", pay:[2400, 2900], need:40, blurb:"Full edits, your own grade."},
    {name:"Senior Editor", pay:[3000, 3600], need:44, blurb:"Clubs ask for you by name."}]}
];
// saves store the job by id, so inserting a job into the middle of the ladder never demotes anyone.
// this is the order the five-job ladder shipped in, used to read those older saves.
const JOB_LEGACY = ["cafe", "store", "courier", "photo", "edit"];
const JOB_TOP = {j:JOBS.length - 1, r:2};
// a four-hour shift is worth about this much experience; a rank needs `need` shifts' worth
const JOB_XP_PER_SHIFT = 50;
// what you actually do on a shift, for the progress card at work
const JOB_TASKS = {cafe:["Washing up", "Pulling shots", "Clearing tables", "Restocking cups"], store:["Stacking shelves", "On the till", "Counting stock", "Facing up the aisles"],
  courier:["Loading the bag", "Cross-town run", "Doorstep drop-offs", "Back to dispatch"], gym:["Front desk", "Wiping down machines", "Inductions", "Locking up"],
  academy:["Laying out cones", "Running drills", "Small-sided games", "Talking to parents"], photo:["Setting up lights", "Portrait session", "Sorting the shots", "Editing selects"],
  edit:["Logging footage", "Rough cut", "Colour grade", "Exporting the reel"]};
function jobAt(j, r){ const job = JOBS[clamp(j|0, 0, JOBS.length - 1)]; return {job, rank:job.ranks[clamp(r|0, 0, job.ranks.length - 1)]}; }
// mall: things you buy once (except drinks)
const SHOP = [
  {id:"smartphone", cat:"Phone", name:"Branyfon S1 smartphone", desc:"Touchscreen, app store, Showoff, Visage, full negotiations. Replaces your keypad phone.", price:450},
  {id:"drink", cat:"Energy", name:"Energy-UP", desc:"+30 energy at half-time (more with a better home).", price:3, stack:true},
  {id:"max", cat:"Energy", name:"Energy-UP MAX", desc:"+60 energy at half-time (more with a better home).", price:7, stack:true},
  {id:"sandwich", cat:"Food", name:"Sandwich", desc:"Goes in your fridge. Eat it at home or at the gym: +14 energy.", price:3, stack:true},
  {id:"meal", cat:"Food", name:"Ready meal", desc:"Goes in your fridge. A proper dinner: +26 energy.", price:5, stack:true},
  {id:"mattress", cat:"Bed", name:"Better mattress", desc:"A night in your own bed gives +60 energy instead of +45.", price:120},
  {id:"bed2", cat:"Bed", name:"New double bed", desc:"Proper sleep: +75 energy every night.", price:420},
  {id:"flat", cat:"Home", tier:1, name:"Rented flat", desc:"Your own bed. Drinks and rest give 15% more energy, +5 recovery every week.", price:1500},
  {id:"house", cat:"Home", tier:2, name:"House", desc:"Proper sleep. Drinks and rest give 30% more energy, +10 weekly recovery.", price:60000},
  {id:"villa", cat:"Home", tier:3, name:"Villa with a recovery pool", desc:"Drinks and rest give 50% more energy, +15 weekly recovery.", price:900000},
  {id:"car", cat:"Car", tier:1, name:"Used Dacia Logan", desc:"No more buses to training: +1 action every week.", price:3000},
  {id:"suv", cat:"Car", tier:2, name:"SUV", desc:"+1 action a week, and training costs 3 less energy.", price:45000},
  {id:"sports", cat:"Car", tier:3, name:"Sports car", desc:"+1 action a week, training costs 3 less energy, and the fans love it (+ followers).", price:220000},
  {id:"strike", cat:"Gear", name:"Strike boots", desc:"+4% shot speed, permanently.", price:250},
  {id:"grip", cat:"Gear", name:"Grip boots", desc:"+3% running speed, permanently.", price:250},
  {id:"control", cat:"Gear", name:"Control boots", desc:"Tighter touch: defenders win the ball less often.", price:300},
  {id:"physio", cat:"Gear", name:"Physio membership", desc:"+10 energy recovery every week and injuries heal faster.", price:800}
];
// staff: hire fee + weekly wage (agent takes a cut of yours)
const STAFF = [
  {id:"shootCoach", name:"Shooting coach", desc:"Shooting training: +50% XP and a good chance of a free +1 to power, clean strike, curl or accuracy.", hire:150, weekly:15},
  {id:"passCoach", name:"Passing coach", desc:"Passing training: +50% XP and a good chance of a free +1 to passing or accuracy.", hire:150, weekly:15},
  {id:"dribCoach", name:"Dribbling coach", desc:"Dribbling training: +50% XP and a good chance of a free +1 to dribbling or pace.", hire:150, weekly:15},
  {id:"fitCoach", name:"Fitness coach", desc:"Fitness training: +50% XP, a good chance of a free +1 to stamina or pace, and it costs less energy.", hire:150, weekly:15},
  {id:"trainer", name:"Personal trainer", desc:"Every training session gives 50% more XP.", hire:400, weekly:30},
  {id:"nutri", name:"Nutritionist", desc:"Match moments and sprinting burn 20% less energy.", hire:300, weekly:25},
  {id:"psych", name:"Sports psychologist", desc:"Calmer under pressure: your aim wobbles 30% less, and Mental training gives +50% XP and free Composure points.", hire:500, weekly:35},
  {id:"agent", name:"Agent", desc:"Clubs hear about you: more offers, 15% better wages, easier negotiations. Takes 8% of your wage.", hire:0, pct:.08}
];
const TRAIN = {
  general:{name:"General", skills:null, coach:null},
  shooting:{name:"Shooting", skills:["power","aero","curve","accuracy"], coach:"shootCoach"},
  passing:{name:"Passing", skills:["passing","passacc"], coach:"passCoach"},
  dribbling:{name:"Dribbling", skills:["dribbling","pace"], coach:"dribCoach"},
  fitness:{name:"Fitness", skills:["stamina","pace","jumping"], coach:"fitCoach"},
  defending:{name:"Defending", skills:["tackling","interception","heading"], coach:null},
  mental:{name:"Mental", skills:["composure"], coach:"psych"}
};
const APPS = {
  showoff:{name:"Showoff", desc:"Share your life. Build your image.", size:"48 MB"},
  visage:{name:"Visage", desc:"Stats for you, your league, your rival and the world.", size:"31 MB"},
  scout:{name:"Scout Pro", desc:"Contact clubs and negotiate your own contracts.", size:"22 MB"},
  news:{name:"Rising News", desc:"Football news from every league.", size:"18 MB"},
  league:{name:"Tables", desc:"Tables, fixtures and European cups.", size:"12 MB"},
  foodies:{name:"Foodies", desc:"Order food and drinks — delivered to your flat or the training ground.", size:"14 MB"},
  bank:{name:"Bank", desc:"Money, wages, bonuses and your contract.", size:"9 MB"}
};

/* ============ THE CROWD ============
   What the stands sing. Always in English whatever country you're in, and always about you:
   {f} first name, {l} surname, {n} full name, {c} your club. Each league has its own flavour. */
const CHANTS = {
  common: ["{l}! {l}! {l}!", "Oh {f} {l}!", "{n}, {n}!", "We've got {f}, super {f} {l}!",
    "{l} is magic, he wears a magic hat!", "There's only one {f} {l}!", "{f} {l}, he's one of our own!",
    "Sign him up! Sign him up!", "{l} for the win!", "Give it to {l}!", "{l} on fire!"],
  ROU: ["Hai {c}!", "{l}, our boy from the fourth tier!", "{f} {l}, pride of the town!",
    "Come on you reds and whites — {l}!", "{l}, {l}, he came from nothing!"],
  ENG: ["{f} {l}, he's one of our own!", "Que sera sera, we're going up with {l}!",
    "Oh {f} {l}, you are the love of my life!", "{l}'s gonna get ya!", "Stand up for {f} {l}!",
    "He shoots, he scores — it's {l}!"],
  ESP: ["{n}, {n}, the whole ground is singing!", "{l}, our number nine!", "Olé, olé, {l}!",
    "{f} {l}, the crowd is on its feet!", "To the last drop of blood — {l}!"],
  GER: ["{l}, {l}, the terrace is bouncing!", "Stand and sing for {f} {l}!",
    "{n}, our man in the stand's heart!", "All together now — {l}!", "The yellow wall sings for {l}!"],
  ITA: ["{n}, the curva is singing!", "{l}, our captain's heart!", "Forza {c}, forza {l}!",
    "{f} {l}, we live for you!", "The whole curva wants {l}!"],
  FRA: ["Allez {l}!", "{f} {l}, the tribune is standing!", "{n}, the pride of the city!",
    "Come on {c}, come on {l}!", "Sing it loud for {f} {l}!"],
  goal:  ["{l}!!! {l}!!!", "Oh {f} {l}, what a goal!", "{n} — take a bow!", "He's done it again, {l}!"],
  miss:  ["Unlucky {l}!", "Next one, {f}!", "Keep going {l}!", "Head up, {l}!"],
  losing:["Come on {c}!", "We still believe — {l}!", "Get it forward, {l}!"],
  big:   ["{n}, on the big stage!", "This is your night, {f}!", "{l}, show them who you are!"]
};

/* Patch notes — newest first. The flag button in the top bar opens these; nothing pops up on its own. */
const PATCH = [
  {v:"2026.10.04a", date:"4 October", title:"A footballer's life, one day at a time", items:[
    "Sleeping now takes you to the next morning — never further. A week is seven days you live through, and it turns over in the night from Sunday to Monday, when your wage goes in.",
    "Two meters to manage: energy, which is food, and fatigue, which only rest really clears. Training tired is worth less and tires you more; eat, sleep, sit down, take an ice bath. Energy drinks give a lift and then wear off.",
    "Team training runs 10:00 AM to 5:00 PM on weekdays without a match. Turn up on time and stay, and the manager notices — be late or absent and his trust drops. Manager trust decides how often you start, but form, fitness and luck get a say too.",
    "Team Chemistry: being at training with the squad builds it quietly, and you see what the day did once you're home or on the club computer. High chemistry means more of the game comes your way — never the ball every few seconds.",
    "Chances now come with team-mates around you — open, marked, held, making a run. Reach the box and the game slows for a moment: shoot, pass left, pass right or back. You can shoot instead of passing while building an attack, but the dressing room has an opinion.",
    "Shots end more like real ones: saved, parried back out, tipped over for a corner, blocked, deflected behind, loose for a scramble, or off a defender and in. A great save on a good shot costs you nothing; skying a clear chance with a team-mate free costs plenty.",
    "A personality that grows from how you play: teamwork, confidence, decision making, risk. It moves slowly and it shows on the stats computer.",
    "New skills: Pass accuracy, Interception, Jumping and Heading — each with its own drill. Careers already under way get starting values that match the player they are.",
    "Train for real: shooting at targets in the goal, passing to rings round the centre circle, timing headers off the ball machine, reading passes to cut them out, and timed sets in the gym. Every rep shows its experience filling the bar.",
    "The club computer and the laptop at home show your day, your schedule, your skills, your job, your money and your personality. Match day says who, where and when.",
    "The Mini Market on your street sells food, drinks and recovery. The gym has a fridge with the same food as home, a vending machine and a water cooler. Or order on Foodies from your phone and wait for it to arrive.",
    "Work happens at work: clock in on your street for a two- or four-hour shift and watch the job bar fill.",
    "A full day and night: sunrise, a real sunset, stars, street lamps and floodlights coming on, warm shop windows at night.",
    "The training ground has been rebuilt — a proper pitch with nets, dugouts and floodlights, a dressing room with lockers and an ice bath, a staff office, a car park — and the squad is out there training while you are."]},
  {v:"2026.10.01a", date:"1 October", title:"No more milestones for nothing", items:[
    "Fixed milestones being handed out for nought of something — a man-of-the-match award when a team-mate won it, a career goal before you had scored one. Zero counted as a round number and tripped the ladder.",
    "Any of those that were already in your cabinet are cleared out the next time you open your career."]},
  {v:"2026.09.30p", date:"30 September", title:"Goal of the Month, and the cameras after the game", items:[
    "Goals are now judged. Distance counts most, then how it was struck — curled, dipped, lifted over the keeper, off a one-two, from a free kick. A penalty is never in the running.",
    "Win Goal of the Month and it leads the news, and you can post about it, which is worth real reputation rather than just followers.",
    "The best goal you score all season goes up against the best in the world for Goal of the Season.",
    "Every counted thing now runs on the same ladder: the first, the fifth, then every tenth to a hundred, then every hundredth. Goals, assists, appearances, man-of-the-match awards and Goal of the Month trophies all mark the same numbers.",
    "Be the best man on the pitch and the cameras want you. A post-match interview with three ways to answer — credit the team, take it yourself, or call your shot. It is worth more than an ordinary week because you are the story, and the loud answer can still blow up in your face."]},
  {v:"2026.09.30o", date:"30 September", title:"Defending: the tackle, the read and the header", items:[
    "The tackle comes in two parts. First you jockey him — move to stay in front, read the feints, and the tighter you hold him the heavier his touch gets. When the ball leaves his feet, swipe through it. Clean through the middle and you come away with the ball and the move carries on; looser and you poke it away; follow through into his legs and it is a foul.",
    "Squeeze him properly and a tackle is almost free. Let him run at you and it is a coin toss — barely pressured, an average defender fouls him three times out of five.",
    "Interceptions: a pass is played across you and you move into the lane to cut it out. Read it well and you win it two thirds of the time, and the ball is yours to carry.",
    "Aerial duels: hold to load your legs, let go to leap. Charge it fully and time the jump and you win about four in five; jump weak or late and he climbs above you every time. Attacking the ball, a won header is a header on goal.",
    "A new skill, Tackling, widens the window you get and keeps your legs out of his. Defenders start with the most of it.",
    "Yellow and red cards. Five bookings in a season and you sit one out; a red is two matches, and a foul as the last man is always a red. Suspensions are served by the games you miss, and your card count is on your player card.",
    "How often you have to defend depends on where you play: better than a third of a defender's moments, and about one in twelve for a striker tracking back."]},
  {v:"2026.09.30n", date:"30 September", title:"Play anywhere on the pitch", items:[
    "You can now start as a Defender or a Central midfielder, alongside the attacking mid, winger and striker. Each one starts with different strengths.",
    "A game looks different depending on where you play. A striker spends two thirds of it in front of goal; a defender spends one sixth, and most of the rest playing out from the back, going up for corners and taking throw-ins. The creation screen shows you the split before you choose.",
    "You are marked for the job you were given. A defender is judged on the clean sheet and on using the ball, not on goals he was never going to get.",
    "Contract targets, Player of the Week and the end-of-season awards all weigh a goal by where you play, so a centre half can win Player of the Season.",
    "New in the manager's office: ask to play further forward or drop deeper. He moves you one line at a time, and only when you have played enough games, he trusts you, and there is room in that part of the side. Say the wrong thing at the wrong time and he tells you why not."]},
  {v:"2026.09.30m", date:"30 September", title:"Honours: every award a career can win", items:[
    "Player of the Week, every week, in your league and every top flight in the world.",
    "Every league now holds a proper awards night: Player of the Season, Golden Boot, Playmaker for the most assists, Golden Glove, Young Player of the Season, and a Team of the Season you can be named in.",
    "Worldwide: the Golden Shoe for most league goals anywhere on earth, top scorer in both European competitions, and the World Championship Golden Ball and Golden Boot.",
    "Milestones mark the numbers that matter — 50, 100, 200 and 300 goals, 50 and 100 assists, 100, 250 and 500 appearances, your first hat-trick, your first cap, your first European goal.",
    "A trophy cabinet, on your player card, with everything you have ever won grouped by season.",
    "Top Scorer and Top Assists now follow you: the stats app opens on the league you are actually in, and your own line is always shown even before you have scored.",
    "Hitting the post or the bar from a penalty or a free kick is now a miss, the way it is in a real game. The move ends there. In open play the ball still comes back and stays live."]},
  {v:"2026.09.30l", date:"30 September", title:"Everything on your account, and no more silent overwrites", items:[
    "The account panel now lists every career your account holds, including ones left behind by the version that kept three. If a career went missing it is probably in that list, and one button brings it back.",
    "Careers now carry an identity of their own. The automatic sync will not write over a career on your account that is not the one you are playing — it stops and leaves the account alone.",
    "Syncing by hand over a different career now asks first and names the one it would destroy.",
    "Between them, a career can no longer be quietly replaced by another on the same account."]},
  {v:"2026.09.30k", date:"30 September", title:"Saves can be read back off your account", items:[
    "The security rules were refusing every read of your own career. Uploading worked, which is why your name was on the leaderboard, but nothing could ever be downloaded again — the rule checked the data being sent, and on a read there is no data being sent, so it said no every time.",
    "Reads and writes are now separate rules. Your career downloads onto any computer you sign in on.",
    "When a sync is refused the game now names the write that failed and why, instead of blaming your connection."]},
  {v:"2026.09.30j", date:"30 September", title:"The account tells you what it actually has", items:[
    "When your account looks empty it now says why — whether you are on the leaderboard with no career file behind the row, whether nothing was ever synced, or whether your account could not be read at all. It also shows your account, whether a leaderboard row exists, which saves were found and the build you are on.",
    "If there is a career on the computer you are sitting at, there is now a button right there to put it on your account.",
    "The same account panel is in the in-game menu as on the title screen, instead of two different ones.",
    "The account box redraws itself properly now — it could get stuck on \"Looking at your account…\" and never finish."]},
  {v:"2026.09.30i", date:"30 September", title:"Careers synced before the one-save change are found again", items:[
    "Fixed the account saying it had nothing on it when your career was plainly on the leaderboard. The game used to hold three careers, so anything synced back then was filed under save two or three — and after the change to one career per account, only save one was being looked at.",
    "The game now goes by what your leaderboard row says, and sweeps the old places as a backstop, so a career uploaded by any version is found and brought down into your one save.",
    "Nothing to do on your side: sign in and it will be there."]},
  {v:"2026.09.30h", date:"30 September", title:"Sign in and your career is just there", items:[
    "Signing in on another computer now brings your career down by itself — club, age, skills, stats, money, the lot — and the old save on that computer makes way for it. No buttons to press.",
    "Saves now remember which account they belong to, so the game can tell your own career from somebody else's. It only replaces a save it knows is yours.",
    "A career that was never put on an account, or one belonging to a different account, is never quietly deleted. You get asked first, with its name and how much of it there is.",
    "If the copy on the computer you are sitting at is further along than the one on your account, it is left alone and you are told — so a newer career is never lost to an older backup."]},
  {v:"2026.09.30g", date:"30 September", title:"A stuck career can always be unstuck", items:[
    "The week is now run in separate pieces — the matches, the world, your wages, your body, your contract, the dressing room, the transfer window. If one of them fails it is skipped and noted, and the week still turns. A career can no longer be trapped on a button that does nothing.",
    "If a screen refuses to draw you now get a working page with a way out instead of a frozen one.",
    "New in Menu: Report a problem. It copies exactly what the game was doing when something went wrong — your week, your club, your contract and the failures it recorded — so it can be fixed properly rather than guessed at."]},
  {v:"2026.09.30f", date:"30 September", title:"The week can never jam again", items:[
    "Fixed a career that could get stuck: with no club to your name, ending the week quietly failed and the Next week button did nothing at all. Any save caught like that will move again as soon as you open it.",
    "A free agent is now taken straight to a list of clubs who want him, instead of being left on a hub with nothing on it. That applies at the end of a season too.",
    "Everything the week does — the news, the dressing room, your manager, a pay rise you agreed, the promise in your contract, the end-of-season write-up — now copes with you being between clubs rather than falling over.",
    "And if a week ever does fail for any other reason, the game now tells you instead of leaving a button that looks broken."]},
  {v:"2026.09.30e", date:"30 September", title:"Pick your career up on any computer", items:[
    "There is an account button in the bottom-left corner of the title screen now. Sign in there, before you go into a career.",
    "Once you are signed in it shows the career saved to your account — name, club, season, matches, goals, assists and leaderboard points — and one button to bring it onto the computer you are sitting at.",
    "If there is already a career on that computer you get a warning first, naming it and how much of it there is, because it will be deleted and replaced. Nothing happens until you say yes.",
    "With nothing saved on the device it just loads, no questions asked."]},
  {v:"2026.09.30d", date:"30 September", title:"The leaderboard keeps itself up to date", items:[
    "Once you have put your career on the leaderboard yourself, it goes up again on its own every five minutes — you never have to press sync after a good run.",
    "The leaderboard refreshes at the same time, so the phone app shows the new standings without you reloading anything.",
    "It never runs during a match, so nothing interrupts a moment. It catches up as soon as the final whistle goes.",
    "The account panel tells you when the last automatic sync happened, and the sync button is still there if you want your numbers up there this second."]},
  {v:"2026.09.30c", date:"30 September", title:"Throw-ins done properly", items:[
    "You now take a throw-in the way you would take one: standing behind the line with the ball in your hands, and you drag back from yourself rather than from a ball sitting on the paint.",
    "The aiming arrow starts at the thrower and is only as long as the throw will actually carry, so what you see is what you get.",
    "The power bar means something now — a full pull is the longest throw you can make, instead of filling up and then being quietly cut in half.",
    "No more picking a spot on the ball before a throw. It comes out of your hands with a little loft and no spin, and you step back onto the pitch as it leaves you.",
    "Everyone calling for the throw is now inside the range a throw can reach — no more team-mate standing forty metres away."]},
  {v:"2026.09.30b", date:"30 September", title:"Form, the press, and a seat in the manager's office", items:[
    "A form and fitness strip sits under your actions: your last five ratings colour-coded, how sharp you are from playing, and where you stand with the manager.",
    "Media duty is a new action. A reporter asks about the week you have had and you choose how to answer — the safe line keeps the manager happy, the loud line is worth far more reputation and can blow up in your face.",
    "Talk to the manager: walk into his office, see what he makes of your numbers, and ask for a rise. Ask for what he can do and he sets you targets — goals, assists, appearances and an average rating, on a clock. Ask for too much and he counters with the most he can actually offer. Ask with nothing to show and he tells you to go and play first.",
    "Hit every target before the clock runs out and the new wage is yours. Miss it and the offer comes off the table for a while — nothing else changes."]},
  {v:"2026.09.30a", date:"30 September", title:"One career, a wider pitch, and a clear scoreboard", items:[
    "Nothing floats over the score any more. The replay strip and every card that appears during a match — goal, assist, the distance you struck it from — now start underneath the scoreboard instead of covering it.",
    "The game holds one career per account now. If you had more than one on this device, the furthest-along one is the one you keep and it is waiting on the title screen.",
    "The pitch in Your squad is wider: it runs from the left edge of the panel across to the substitutes, so the shape of the team is easier to read."]},
  {v:"2026.09.29p", date:"30 September", title:"Everything lined up", items:[
    "The hub is tidier: the squad panel and the league table now end at exactly the same place, so the page no longer finishes with a hole under one column.",
    "The headlines take the top of the right-hand column and the league table fills the rest of it, instead of the table stopping short and leaving empty card below it.",
    "The pitch is drawn upright like a real team sheet and sits in the middle of the panel, with every player token the same size at every window size.",
    "Your player card is now exactly as tall as what is on it, so there is no gap between the energy drinks and the Train, Staff and Rest buttons."]},
  {v:"2026.09.29o", date:"30 September", title:"The squad on a pitch, and a hub that fits your screen", items:[
    "Your squad is drawn as a formation now: the eleven laid out on a pitch with their rating, surname and position colour, you glowing in green, injured players dimmed in red. The bench sits down the right.",
    "Coaches pick a shape rather than simply the eleven best names — a keeper, a back four, three in midfield, one behind the front two. Every club in the world lines up 4-3-1-2, and you come into the side in your own position once the coach trusts you.",
    "On a desktop the whole hub is one screen with no scrolling: the columns fill the height exactly and the pitch takes whatever room is left, so it grows on a big monitor and shrinks on a laptop without the players ever piling on top of each other.",
    "On a phone the pitch goes full width and the bench sits underneath it in two columns."]},
  {v:"2026.09.29o", date:"30 September", title:"Your squad, player values, and room for three careers again", items:[
    "A squad panel under Play match shows the eleven the coach picks and who is on the bench — position, age, value and rating, with you highlighted and injuries marked.",
    "Your market value sits with your money and wage on your player card.",
    "Every player in the world is valued properly now: ability is the spine of it, with an age curve that peaks in the mid-twenties and falls away after thirty, a premium for a young player whose ceiling is far above him, a premium for being a known name, and a little for what he has actually done.",
    "The numbers land where they should — a 25-year-old world star is worth about €190M, a solid 29-year-old pro €19M, a 21-year-old prospect €14M, a 32-year-old veteran €4.7M.",
    "Important fix: with twenty-two countries in the world a save had grown to 2.3 MB, and a browser only gives the game about 5 MB, so the third career slot had stopped saving. Three quarters of a save is players' empty stat columns, and those are now written as one run instead of thousands of zeros. A save is 1.1 MB, three full careers use 4 MB, and nothing is lost — every one of the 18,217 players comes back exactly as it went in.",
    "Careers saved before this load normally and shrink themselves the next time they save."]},
  {v:"2026.09.29o", date:"30 September", title:"Corners and throw-ins have names again", items:[
    "The card before a corner said \"undefined\" instead of Corner, and a throw-in said the same. Both are named now, and so is the commentary line that introduces them.",
    "There is one list of moment names now with a fallback, so a new kind of moment can never show up unnamed again."]},
  {v:"2026.09.29o", date:"29 September", title:"Shooting, curl and two new set pieces", items:[
    "The goalkeeper's reach has been pulled in. He is strong close to himself and falls away quickly past that, so a shot placed away from him beats him whatever the power on it.",
    "You no longer have to hit everything at 100%. Before this, a full-power shot scored 48% of the time and everything softer scored under 10%. Now placement does the work: into the corner at 85% beats straight down the middle at 100%.",
    "Curl is fixed. Striking half a ball's width out now bends it properly — a free kick aimed six metres wide of the wall used to fly wide 107 times out of 120, and now it bends back on target and goes in.",
    "Striking across the ball gives it some air as well as bend, so a whipped shot has time to curve in.",
    "Lobs work: playing it over a defender gets through 69% of the time against 23% for a flat pass into the same lane.",
    "A ball that leaves the pitch now says it ran out of play instead of calling it an interception.",
    "New set piece — throw-ins. From the touchline, four team-mates making runs, one of them in space. No boot on the ball so there is no bend and not much power on it.",
    "New set piece — corners. Swing it into the box for the man who is calling, float it to the back post, or curl it straight in yourself. The keeper will come and claim it if you drop it on his head.",
    "The advertising boards and the news app carry the game's own name now instead of the old one."]},
  {v:"2026.09.29o", date:"29 September", title:"Sixteen more countries", items:[
    "Portugal, the Netherlands, Belgium, Turkey, Greece, Scotland, Austria, Switzerland, Poland, Ukraine, Serbia, Croatia, Czechia, Denmark, Sweden and Norway all have a top and second division now. Twenty-two countries, 57 leagues, 828 clubs.",
    "You can be from any of the twenty-two, and you can be signed by a club in any of them.",
    "Every country has its own cup, so the cup follows you wherever you move.",
    "The Champs League and Euro League run a 32-club league phase each, and every country is represented. The biggest leagues send three clubs, the smallest send one. The top eight go through to the quarter-finals and the four below them drop into the Euro League knockout.",
    "The World Championship now takes the eight strongest national squads in the world, so getting your country there is an achievement. Everyone who misses out plays friendlies that week instead.",
    "Every club, town and player name is invented — nothing here is a real club."]},
  {v:"2026.09.29o", date:"29 September", title:"Cups, a World Championship and reputation that knows where you played", items:[
    "Pre-season friendlies. Week 0 is now a warm-up game — half-empty ground, nothing goes on your record, but the legs get the work.",
    "Domestic cups. Every country has one: all the clubs in its top two divisions, straight knockout, one game and the winner stays in. The strongest sides get byes and enter later, as they do in real life.",
    "A World Championship. Your national side plays a group stage across the international weeks, then semi-finals and a final. Win it and it goes in your trophy cabinet.",
    "The Champs League group phase now matters. The top four go through to the semi-finals; the bottom four drop into the Euro League knockout and meet the four who topped that group.",
    "Reputation now depends on where you played. Friendly, league, cup, Euro League, international, Champs League, World Championship — each pays its own band, with a random swing so two identical games never pay the same.",
    "Play badly in Europe or for your country and your league reputation falls twice as hard, while your world reputation drops at the normal rate. A standout display pays extra again.",
    "The full-time odometer now names the competition, so you can see why the numbers are what they are.",
    "The Tables app has a Cup tab and a World Champs tab, and the Stats app can show your cup's scorers and assists."]},
  {v:"2026.09.29o", date:"29 September", title:"League tables, a Stats app and rolling reputation", items:[
    "A panel under the headlines with three tabs: Leaderboard (your league's table), Top Scorer and Top Assists — players in your league, their matches played and their goals or assists. It follows you when you transfer.",
    "A Stats app on your phone. Pick Top Scorer or Top Assists, then pick any competition in the world: all 26 leagues, the Champs League, the Euro League, internationals, or everything added together.",
    "The European cups are now called the Champs League and the Euro League.",
    "Goals and assists in the two European cups are counted separately, so each has its own scorers table. International assists are tracked now too.",
    "Your reputation rolls up on the full-time card like a car odometer — green climbing, red falling, easing to a stop on the exact number. European and international games roll your world reputation beside it.",
    "Coming next: pre-season friendlies, a domestic cup, a World Championship, the Champs League drop into the Euro League knockout, and reputation that pays by competition."]},
  {v:"2026.09.29g", date:"29 September", title:"Accounts and the leaderboard", items:[
    "There is a Leaderboard app on your phone. Everyone who has synced a career is ranked on it, with their goals, assists, money and club.",
    "Tap anyone on the board to open their whole career: every stat, their trophy cabinet, awards and skills.",
    "Make an account from ☰ Menu → Leaderboard account. Sign in on any other computer and your careers come with you.",
    "Sync to leaderboard uploads all three of your careers. Your strongest one is the one that shows on the board — the other two are yours to play whenever you like.",
    "Your careers are ranked by a single score built from goals, assists, appearances, man-of-the-match awards, trophies, honours, your rating and the level you play at.",
    "Nothing about your local saves has changed. No account is needed to play, and the game still works with no connection at all."]},
  {v:"2026.09.29g", date:"29 September", title:"The woodwork stays live", items:[
    "Hitting a post or the bar no longer ends the move. The ball rebounds back into play and it is a race — you, the keeper and the defenders all go for it.",
    "Win the loose ball and you are dribbling again, free to shoot a second time.",
    "Lose it and the keeper pounces, a defender hacks it clear, or it runs out for a corner.",
    "How often you win your own rebound depends on where you struck it: roughly two in five from close range, about one in eight from distance.",
    "Every strike in a move now counts towards your shot total, and a goal that follows a rebound says so in the commentary and your highlights.",
    "A team-mate hitting the frame still ends the move — that one is his."]},
  {v:"2026.09.29e", date:"29 September", title:"Patch notes, money and the full job ladder", items:[
    "These notes. The flag button in the top bar opens them whenever you want — nothing pops up at you after an update any more.",
    "Your money moved out of the top bar and onto your player card on the left, in gold, next to your energy and your wage. It shows the exact figure now instead of rounding to the nearest thousand.",
    "Train, Staff and Rest at home moved to the left panel too, under your skills and drinks. The centre panel under Play match is just your job, the Mall and Clothes.",
    "A work-experience bar sits under your level bar. It fills as you take shifts and shows how many are left until your next promotion — and turns gold with your pay per shift once you're at the top.",
    "Two new jobs in the middle of the ladder: the Sports Centre and the Youth Academy. Twenty-one positions in all.",
    "The whole ladder, cheapest to best paid: Corner Café (Dishwasher → Barista → Shift Supervisor), Neighbourhood Store (Shelf Stacker → Cashier → Floor Supervisor), City Courier (Bike Courier → Scooter Rider → Dispatch Lead), Sports Centre (Front Desk → Gym Assistant → Personal Trainer), Youth Academy (Session Helper → Youth Coach → Age-Group Lead), Photo Studio (Studio Assistant → Photographer → Lead Photographer), Video Editing (Junior Editor → Video Editor → Senior Editor).",
    "Every position pays more than the one before it, from €14 a shift washing plates to €3,600 a shift cutting film. Reaching the top takes 544 shifts.",
    "At the top rank you can still take shifts for the money — the job button stays live. If it is greyed out it now tells you why: no actions left, too tired, or injured.",
    "Get the ball back from a team-mate and you can run with it again: S passes, D shoots.",
    "Scrollbars everywhere now match the rest of the game instead of looking like Windows."]},
  {v:"2026.09.29c", date:"29 September", title:"Top of the ladder", items:[
    "At max rank the work bar turns gold and shows what a shift pays instead of an experience count you can no longer fill."]},
  {v:"2026.09.29b", date:"29 September", title:"A longer climb", items:[
    "Every promotion takes twice as many shifts. Getting to the top of the job ladder is a real grind now."]},
  {v:"2026.09.29a", date:"29 September", title:"Day jobs, and a tidier hub", items:[
    "Your side job is a proper career now: five ladders of three positions each, from washing plates to cutting highlight reels, every position paying more than the last.",
    "A work-experience bar under your level shows how many shifts are left until your next promotion.",
    "Get promoted and you get a card telling you so, with your old pay struck through and the new pay beside it.",
    "Freya Energy is now Energy-UP, and MAX is Energy-UP MAX.",
    "Energy drinks are half-time only. They've gone from the in-match HUD.",
    "Train, Staff and Rest at home moved onto your player card. The centre panel is just your job, the Mall and Clothes.",
    "The admin panel has a Day job section for testing promotions."]},
  {v:"2026.09.28h", date:"28 September", title:"Admin panel", items:[
    "The admin code is asked for every single time you open the panel. Nothing is remembered."]},
  {v:"2026.09.28g", date:"28 September", title:"Hitboxes and lobs", items:[
    "Defenders no longer re-read the ball every frame and home in on it — they commit to where they think it's going and can be wrong.",
    "A lob that clears a defender's head stays clear. Interceptions on lobs dropped from 61% to 13%.",
    "You can play the ball much closer to a defender without it being nicked."]}
];
