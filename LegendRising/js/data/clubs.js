"use strict";
/* ============ LEAGUES & CLUBS ============
   Every club here is invented. The names are built to sound like they belong to their country, but no club,
   crest or league below is a real one. Division names are kept generic (Liga 1, Ligue 1, Serie A and so on).
   Promotion and relegation happen inside the game, so after a season the world drifts on its own. */
const COUNTRIES = {
  ROU:{name:"Romania", nat:"RO", strength:0.45, leagues:[
    {t:1, nm:"Liga 1", clubs:["Flacăra Bălănești","Steagul Urlați Nou","Recolta Lunca Bradului","Voința Vlădeni","Sportul Dobrița","Tricolorul Mihăilești Nou","Rapidul Iancu Jianu","Tricolorul Neagra","CS Ostrovu Mare","Oltul Câmpurelu","Tricolorul Dealu Mare","ACS Hulubești","Tricolorul Tămădău","Gloria Oltenița Nouă","Steagul Frumușani Nou","FC Dragomirești Vale"]},
    {t:2, nm:"Liga 2", clubs:["Voința Bălănești","Steagul Lacu Sărat","Luceafărul Iancu Jianu","CSM Racovița Mare","ACS Fierbinți Vale","Avântul Vârfurile","Luceafărul Vlădeni","FC Neagra","CSM Zăvoiu","Rapidul Zimbru","ACS Bârlogeni","Recolta Frumușani Nou","Viitorul Sălcuța","FC Tămădău","Oltul Jidveiul Nou","ACS Livezile","Gloria Urziceni Nou","Progresul Lacu Sărat","Dacia Sălcuța","Progresul Jidveiul Nou","Flacăra Gura Vadului","Progresul Stejaru"]},
    {t:3, nm:"Liga 3", series:4, clubs:["Victoria Gârbova","Viitorul Olteni Vale","Tricolorul Grădiniștea","CSM Bucșani","Gloria Rovinița","Voința Stejaru","CS Arvoreni","CSM Olteni Vale","Tricolorul Dobrița","FC Izvoarele Noi","Sportul Ilfoveni","Recolta Jariștea","Flacăra Corbeni","Progresul Glodeni","Luceafărul Grădiniștea","Gloria Ilfoveni","Gloria Bârlogeni","ACS Fetești Deal","Oltul Izvoru Rece","ACS Tălmaciu Nou","Luceafărul Olteni Vale","Rapidul Vișina Nouă","Dacia Izvoarele Noi","Luceafărul Bălănești","Dacia Hălchiu","Unirea Traian Vale","Tricolorul Hârtiești","Gloria Dealu Mare","Voința Arvoreni","Sportul Dealu Mare","Sportul Hârtiești","Oltul Sinești","FC Răzvad","Tricolorul Slătioara","Viitorul Zărnești Deal","Luceafărul Văleni Deal","Viitorul Dobrotești","Steagul Văleni Deal","Flacăra Mărăcineni","Luceafărul Sinești","FC Dobrița","Steagul Ulmeni Vale","Sportul Stejaru","Sportul Zăvoiu","Unirea Corbeni","ACS Nucșoara","Victoria Dobrița","CSM Bălănești"]},
    {t:4, nm:"Liga 4", series:4, clubs:["ACS Hălchiu","Avântul Gârbova","Luceafărul Zărnești Deal","Recolta Glodeni","Rapidul Tămădău","Steagul Vârfurile","Dacia Podenii Noi","Progresul Văleni Deal","Avântul Dragomirești Vale","Tricolorul Zimbru","ACS Izvoarele Noi","Oltul Hârtiești","Steagul Vișina Nouă","Viitorul Frumușani Nou","Dacia Dobrița","ACS Ostrovu Mare","Avântul Corbeni","Victoria Slătioara","Unirea Ciocănești","Progresul Fetești Deal","Tricolorul Șuici","Voința Mărăcineni","Sportul Pietroșani","Progresul Mihăilești Nou","FC Câmpurelu","Progresul Rovinița","Luceafărul Racovița Mare","Flacăra Fântâna Albă","Flacăra Ulmeni Vale","Dacia Pădureni","Viitorul Rovinița","Oltul Ulmeni Vale","FC Nucșoara","Tricolorul Nucșoara","Dacia Bârlogeni","CSM Grădiniștea","Recolta Hârtiești","ACS Hârtiești","Dacia Vișina Nouă","Gloria Lacurile"]}
  ]},
  ENG:{name:"England", nat:"EN", strength:1, leagues:[
    {t:1, nm:"Premier Division", clubs:["Millhaven United","Glenmoor City","Granthorpe United","Rothmere FC","Foxholt Athletic","Ravensfield FC","Wychbourne United","Thorpemere Rovers","Thornecliff Rangers","Harkwood Albion","Elderbrook City","Kingsmoor Athletic","Brackenhurst Rangers","Granthorpe County","Pinewick United","Cheswick FC","Elderbrook United","Glenmoor United","Larkfield FC","Stonebridge United"]},
    {t:2, nm:"First Division", clubs:["Rookhampton City","Foxholt Rangers","Brindleford Rovers","Thorpemere City","Marlbrook United","Hollowdale Rangers","Thornecliff Wanderers","Eastmarsh FC","Kestrelford County","Bramblewick United","Highmoor United","Marlbrook Athletic","Farnleigh City","Whitcombe County","Everdon Albion","Sharnbrook Athletic","Sandmere FC","Wintersea Wanderers","Greyfen United","Everdon FC","Coldwater Rovers","Ashcombe Town","Fallowgate Rangers","Yarrowdale Albion"]},
    {t:3, nm:"Second Division", clubs:["Kingsmoor City","Ashcombe County","Fernbridge Albion","Wychbourne County","Brackenhurst Rovers","Millhaven Wanderers","Dunmere City","Brindleford Albion","Netherfold Albion","Whitmarsh County","Lowbridge Rangers","Stanwick Town","Cheswick United","Wexbury FC","Dalebury Albion","Rookhampton Rovers","Kirkstall Athletic","Pentonvale Town","Wexbury United","Farnleigh County","Underhill FC","Sharnbrook FC","Whitmarsh Albion","Cadmoor Town"]}
  ]},
  ESP:{name:"Spain", nat:"ES", strength:0.97, leagues:[
    {t:1, nm:"Primera División", clubs:["Deportivo Sierra Blanca","UD Jaraval","Unión Torrecilla","CF Aldeanova","Real Alcarreña","Deportivo Laguna Vieja","Unión Alcarreña","Unión Fuentenegra","Deportivo Valdeluz","Deportivo Tierrablanca","UD Puerto Sandino","Racing Peñalta","Atlético Sierra Blanca","Sporting Fuentenegra","SD Laguna Vieja","CD Miravalle","Atlético Valdemora","SD Quintanar","Sporting Sierra Blanca","UD Santa Ludmila"]},
    {t:2, nm:"Segunda División", clubs:["UD Palmareda","CD Montesol","CF Monteclaro","Real Marbelena","SD Herrera del Llano","Unión Retamar","CF Santa Ludmila","Real Torrecilla","Unión Higuera del Rey","SD Salmerón","CD Herrera del Llano","Real Puerto Sandino","CD Sotomayor","CD Marbelena","Deportivo Quintanar","UD Campodulce","CF Marbelena","SD Robledal","UD Aljibe","Sporting Baradilla","CD Aldeanova","CD Monteclaro"]},
    {t:3, nm:"Tercera División", clubs:["Unión Cerroverde","Real Robledal","Racing Bermejo","CF Tierrablanca","CF Palmareda","CF Elvara","Sporting Navalvera","UD Olivares","Racing Lastrada","CF Puerto Sandino","UD Fuenteclara","Deportivo Altamar","Real Peñalta","CD Laguna Vieja","UD Peñalta","UD Alcarreña","Atlético Baradilla","CD Riobueno","CD Vegalta","CD Peñalta"]}
  ]},
  GER:{name:"Germany", nat:"DE", strength:0.95, leagues:[
    {t:1, nm:"1. Liga", clubs:["1. FC Ottenstein","Union Dornstadt","Hansa Birkenhain","SC Forstheim","TSV Lauterbrunn","VfB Hohenbach","SpVgg Steinmark","SC Wolkenfeld","Union Schwarzbach","VfB Moorbach","SpVgg Neustetten","VfL Waldhausen","Eintracht Oberwald","SV Zellingen","Eintracht Moorbach","Eintracht Schwarzbach","Fortuna Hasselbach","TSV Tannberg"]},
    {t:2, nm:"2. Liga", clubs:["FC Traunfeld","FC Forstheim","TSV Grünthal","SpVgg Altenfeld","VfL Rheinfels","Hansa Lindenau","VfL Mühlental","Eintracht Eichwald","SC Dornstadt","VfL Nordheide","SpVgg Geroldsheim","SC Königstal","Fortuna Steinmark","VfL Moorbach","SV Lauterbrunn","Eintracht Rabenstein","Fortuna Ulmenau","VfB Waldhausen"]},
    {t:3, nm:"3. Liga", clubs:["FC Weissenau","1. FC Falkenberg","1. FC Kirchstetten","Union Zellingen","Fortuna Bruchsee","1. FC Nordheide","SpVgg Rheinfels","Hansa Hainburg","TSV Ottenstein","Union Moorbach","SpVgg Bruchsee","VfB Steinmark","TSV Drachenfeld","Union Rabenstein","SV Grünthal","VfL Hainburg","FC Eschweiler","FC Merzbach","FC Geroldsheim","Fortuna Eichwald"]}
  ]},
  ITA:{name:"Italy", nat:"IT", strength:0.95, leagues:[
    {t:1, nm:"Serie A", clubs:["Portoforte Calcio","Real Monteforte","Real Belmonte","SS Sanbruno","AS Santelmo","US Torreluna","Pro Vallecorsa","AS Montebruno","Pro Ceresola","AC Grigiano","Roccabella FC","AC Montesiro","Monteforte FC","Real Ceresola","Belmonte FC","Unione Acquaverde","Virtus Salterno","US Arcosanto","Altavilla Mare FC","Virtus Portoforte"]},
    {t:2, nm:"Serie B", clubs:["Virtus Casalverde","Fontanarossa Calcio","Santelmo FC","Marinalta Calcio","AC Fiumenero","Real Torreluna","Pineta Grande FC","US Borgoferro","Real Valdoro","Vallecorsa FC","Virtus Lanzago","Virtus Colleverde","Unione Pineta Grande","Virtus Dolcevalle","Pro Colleverde","Virtus Montesiro","US Vittoriano","Real Portoforte","Acquaverde Calcio","Torreluna Calcio"]},
    {t:3, nm:"Serie C", clubs:["Lanzago Calcio","AC Vallecorsa","Altavilla Mare Calcio","AC Lanzago","AS Colleverde","Unione Vittoriano","Virtus Belmonte","Vittoriano Calcio","Cerasella FC","Virtus Cerasella","Castelrosso Calcio","US Cerasella","Virtus Santelmo","Virtus Borgoferro","Virtus Pietralba","SS Valdoro","Virtus Valdoro","US Acquaverde","Pro Valmarina","Valdoro FC"]}
  ]},
  FRA:{name:"France", nat:"FR", strength:0.9, leagues:[
    {t:1, nm:"Ligue 1", clubs:["US Valmonde","Stade Essarville","Sporting Valmonde","US Noirval","AS Hautbourg","US Saint-Aubert","Stade Maubray","AS Amberac","Verzeau FC","Olympique Chalonnes","Sporting Noirval","Olympique Draguemont","RC Puyverdun","US Thiviers","RC Valmonde","Olympique Amberac","Olympique Fontenaud","Chantevigne FC"]},
    {t:2, nm:"Ligue 2", clubs:["CS Saint-Aubert","US Essarville","Sporting Thiviers","AS Noirval","Union Essarville","Stade Lanvaux","CS Beaulac","Sporting Bellecour","Olympique Lanvaux","CS Verzeau","AS Nogentel","Ravières FC","Olympique Brévelle","Vaucresson FC","Olympique Bellecour","AS Guerlain","FC Dornaise","Union Harcourt"]},
    {t:3, nm:"Ligue 3", clubs:["FC Montclair","AS Lanvaux","Olympique Roquelin","Union Maubray","Union Guerlain","Sporting Lanvaux","AS Essarville","Stade Grandlieu","RC Chalonnes","Harcourt FC","RC Carmaux Vieux","AS Thiviers","US Rivenne","Grandlieu FC","RC Ravières","AS Grandlieu","US Lizerne","FC Draguemont"]}
  ]},
  POR:{name:"Portugal", nat:"PT", strength:0.86, leagues:[
    {t:1, nm:"Divisão 1", clubs:["Académico Espioonte FC","União Guieialva","Futebol Clube Calraeiro","Académico Bareiedo FC","Atlético Monvainho FC","União Alvaoonte","Futebol Clube Vilravela","Clube Baranide FC","SC Guieiança","Futebol Clube Belineiro FC","Académico Torinide","GD Riberavela FC","Grupo Alvatadouro","Clube Calravela"]},
    {t:2, nm:"Divisão 2", clubs:["GD Casteivela","Grupo Guioalva FC","Grupo Beltaide","Académico Viloedo FC","Clube Monvamonte FC","Clube Sereieiro","GD Fontevaosa","CD Calindouro FC","União Beleiedo FC","União Guitaonte","Clube Penvaares","GD Casteieiro"]}
  ]},
  NED:{name:"Netherlands", nat:"NL", strength:0.84, leagues:[
    {t:1, nm:"Divisie 1", clubs:["FC Kortburg","VVV Vriesthoven","VV Rijstveen","SC Kortsveen","SC Loensdam","RKSV Hoogsveen","SV Harsdam","RKSV Harshorst","VVV Naarddijk","FC Midsburg","SC Aalswijk","FC Beemberg","SV Beemthoven","SV Hooglaar"]},
    {t:2, nm:"Divisie 2", clubs:["SC Loenkdijk","RKSV Korttdijk","VVV Duivswijk","VV Oostkkerk","SV Zwolshoven","SV Wierskerk","Sportclub Vriesdhoven","SC Oostswijk","VV Zwoldoord","VVV Zwolshorst","FC Rijsdhorst","RKSV Oostkveen"]}
  ]},
  BEL:{name:"Belgium", nat:"BE", strength:0.78, leagues:[
    {t:1, nm:"Klasse 1", clubs:["Sportkring Lomgenzele","RFC Erpsdonk","RFC Aarneveld","RFC Aarneheim","KV Tiesveld","KFC Bevergenheim","Union Hasseneveld","KFC Hassesheim","Union Lomlem","Sportkring Aarsstad","Royal Mechegendonk","Royal Dendernelem","KV Hassegenmolen","KSV Geelveld"]},
    {t:2, nm:"Klasse 2", clubs:["Royal Bevergenhout","Sportkring Zotgendonk","Union Zotsheim","Union Dendersstad","Royal Lomsstad","Union Ronsestad","Royal Waassgem","KFC Lomnegem","KSV Ninhout","KSV Waasgenlem","KV Erpneheim","RFC Bevergendonk"]}
  ]},
  TUR:{name:"Turkey", nat:"TR", strength:0.75, leagues:[
    {t:1, nm:"1. Lig", clubs:["Günkentspor","Genç Denizyurt SK","Büyük Umutipınar SK","Çanigöl SK","Günderen SK","Büyük Kızılagöl SK","Yeni Denizova SK","Umutbahçespor","Büyük Günayurtspor","Alyurtspor","Genç Kızılgölspor","Deniziovaspor","Genç Karaiderenspor","Burkentspor"]},
    {t:2, nm:"2. Lig", clubs:["Genç Özahisar FK","Gökpınar FK","Büyük Aybahçespor","Yeni Çanaköyspor","Genç Gökitepespor","Kızılovaspor","Erbahçespor","Yeni Akderen SK","Yeni Burakent SK","Genç Beyyurt SK","Dağkentspor","Yeni Kızılköyspor"]}
  ]},
  GRE:{name:"Greece", nat:"GR", strength:0.64, leagues:[
    {t:1, nm:"Kategoria 1", clubs:["PAE Argolithos","AO Verthea","AS Patavrisi","PAE Kavkastro","GS Veripoli","AE Mesakastro","PAE Trikodara","PAE Xanothea","AE Ioanthea","AS Ioanavrisi","AS Mesanissa","PAE Patovouna","PAS Pyripylos","PAS Mesmira"]},
    {t:2, nm:"Kategoria 2", clubs:["PAE Kavistena","AO Trikothea","AO Ioanalaki","AO Seristena","AE Argimira","GS Ioanathea","PAS Neaokastro","AE Neaomira","AS Neainissa","PAS Verostena","AE Xanstena","GS Patlithos"]}
  ]},
  SCO:{name:"Scotland", nat:"SC", strength:0.64, leagues:[
    {t:1, nm:"Division One", clubs:["Pitodonald County","Fingarth Albion","Dalshiel Athletic","Auchecarn Rovers","Auchmuir United","Kilgarth Thistle","Inveregowan Albion","Craigamuir Albion","Branogowan Rovers","Mordonald Athletic","Kilegowan Athletic","Glenemoor Albion"]},
    {t:2, nm:"Division Two", clubs:["Dalgowan United","Kiladonald County","Balevaig Rovers","Auchemoor Thistle","Torabeath Thistle","Morobane Albion","Finocarn United","Finmoor County","Auchbeath Athletic","Findonald Athletic","Pitoshiel Albion","Strathshiel United"]}
  ]},
  AUT:{name:"Austria", nat:"AT", strength:0.66, leagues:[
    {t:1, nm:"Bundesliga", clubs:["ASK Langerstetten","Sportklub Riederthal","FC Mühlenfurt","ASK Talsbach","ASK Ebeerstetten","SC Langberg","SK Steinsdorf","SK Ebethal","Sportklub Kircherbach","SC Bergerdorf","SV Steinsfurt","FC Mühlegg"]},
    {t:2, nm:"2. Bundesliga", clubs:["SC Bergenhofen","SV Riedbruck","SK Grünau","FC Grünerberg","SC Altsegg","Sportklub Walderegg","SK Talsegg","SV Langstetten","ASK Waldendorf","SK Zellkirchen","Sportklub Hocherbruck","ASK Bergenbruck"]}
  ]},
  SUI:{name:"Switzerland", nat:"CH", strength:0.66, leagues:[
    {t:1, nm:"Liga A", clubs:["SC Rootenach","SV Davaimatt","SC Nyonisee","FC Fraumatt","FC Vevatal","BSC Morstein","SC Krienmatt","SC Horwberg","BSC Bremacourt","FC Morental","FC Rootawil","BSC Kriiach"]},
    {t:2, nm:"Liga B", clubs:["SC Thunasee","SV Aarenstein","SV Sierenberg","BSC Rootasee","SC Glandiach","BSC Lenzenhofen","SC Lenztal","AC Rootsee","FC Horwengen","BSC Frautal","SC Oltmatt","SV Lenzenbrunn"]}
  ]},
  POL:{name:"Poland", nat:"PL", strength:0.63, leagues:[
    {t:1, nm:"I Liga", clubs:["GKS Ostroybrzeg","MKS Lubolany","Sportowy Piotrnica","LKS Myszszyn","KS Glidnica","MKS Chorydnica","Klub Ostroynica","Klub Myszłęka","MKS Piotranica","Klub Kędzwice","KS Lubystok","GKS Jaroakowo","Klub Chorbrzeg","LKS Dąbokowo"]},
    {t:2, nm:"II Liga", clubs:["LKS Piotrodnica","Sportowy Włoodnica","GKS Tomachów","MKS Kędzymierz","Klub Radykowo","MKS Sosnnica","Klub Radybrzeg","GKS Kędzabrzeg","GKS Gliaborz","Sportowy Myszymierz","GKS Bialastok","LKS Gliadnica"]}
  ]},
  UKR:{name:"Ukraine", nat:"UA", strength:0.68, leagues:[
    {t:1, nm:"Liha 1", clubs:["SK Bilaoyiv","Sport Umanapil","FK Sumyimyr","MFK Zhytosla","MFK Kremeariv","MFK Mykolovets","FK Sumyapil","FK Vinnyochuk","Sport Truskariv","MFK Chernihrad","MFK Sumyamyr","SK Sumyochuk","SK Lutskavets","Sport Truskaavka"]},
    {t:2, nm:"Liha 2", clubs:["Sport Truskamyr","Sport Sumyipil","FK Prylavka","MFK Kremeitsia","SK Umanchuk","FK Sumyodar","FK Bilaochuk","Sport Bilaomyr","Sport Izmailivets","FK Vinnyoriv","FK Umanimyr","MFK Chernosla"]}
  ]},
  SRB:{name:"Serbia", nat:"RS", strength:0.6, leagues:[
    {t:1, nm:"Prva Liga", clubs:["OFK Kikinamlin","SK Kikinaselo","OFK Ćupokamen","FK Šabomlin","Sport Kikinagora","Sport Smedvac","OFK Šabaselo","OFK Nišedol","OFK Šabagora","OFK Šabmlin","OFK Jagagora","SK Kikinograd","SK Krušvina","FK Smedogora"]},
    {t:2, nm:"Druga Liga", clubs:["Sport Panapolje","FK Užipolje","SK Ćupaselo","FK Smedagora","Sport Užiagrad","OFK Šaboica","SK Ćupevac","FK Smedepolje","Sport Vrbaadol","OFK Zajekamen","OFK Zajeareka","FK Bačdol"]}
  ]},
  CRO:{name:"Croatia", nat:"HR", strength:0.62, leagues:[
    {t:1, nm:"1. Liga", clubs:["HNK Vinavec","NK Oguograd","NK Kninibrda","HNK Siniluka","SK Imoovica","HNK Gosapolje","SK Dugopolje","GNK Vinkovo","NK Novaiselo","HNK Črnvica","HNK Dugooluka","GNK Gospolje"]},
    {t:2, nm:"2. Liga", clubs:["HNK Gosgrad","NK Oguidol","GNK Bjeavica","HNK Novaakovo","GNK Kninavec","NK Trogiluka","SK Imoimir","SK Zadiluka","SK Kopstina","NK Dugoiselo","SK Kopapolje","SK Šibakovo"]}
  ]},
  CZE:{name:"Czechia", nat:"CZ", strength:0.58, leagues:[
    {t:1, nm:"1. Liga", clubs:["FC Cheboměř","SK Rychechod","FK Přeeslav","SK Táboavary","FC Klaavary","TJ Klažice","FK Vsetehrad","TJ Hradice","FK Břectýn","Sportovní Litooslav","SK Dobatýn","FK Mlakov","SK Vsetalany","Sportovní Sobdice"]},
    {t:2, nm:"2. Liga", clubs:["FC Tábookov","SK Frýdadice","Sportovní Klatýn","SK Litoeměř","SK Ostraslav","FC Břecakov","Sportovní Rychměř","Sportovní Hraechod","FC Přeechod","SK Břecachod","Sportovní Vsetoměř","SK Vsetaměř"]}
  ]},
  DEN:{name:"Denmark", nat:"DK", strength:0.6, leagues:[
    {t:1, nm:"Division 1", clubs:["BK Holmdal","BK Lemodal","Boldklub Holmsted","IF Esbekøb","BK Ulfbovig","IK Gredslund","Boldklub Ringested","IF Holmegaard","FC Bjeroborg","Boldklub Ringegaard","BK Esbstrup","IK Lemsgaard"]},
    {t:2, nm:"Division 2", clubs:["IK Ringovig","BK Agerdal","Boldklub Tarmobjerg","BK Holmshavn","BK Jylnæs","Boldklub Esbebjerg","IF Skjernsgaard","Boldklub Jylohavn","IF Farumdal","IF Bjerholm","BK Grednæs","Boldklub Jylenæs"]}
  ]},
  SWE:{name:"Sweden", nat:"SE", strength:0.57, leagues:[
    {t:1, nm:"Division 1", clubs:["IFK Hallehamn","BK Eksberga","IF Vallagård","GIF Fageresund","Sportklubb Vallavik","IFK Ravnsäng","BK Järnesund","Sportklubb Vallasund","IF Fagerhamn","Sportklubb Lindeberga","Sportklubb Eksagård","Sportklubb Ymersgård"]},
    {t:2, nm:"Division 2", clubs:["IFK Dalsfors","IF Vallenäs","GIF Torpberga","BK Fagerebacke","BK Sandberga","IFK Sandsbacke","IF Moraestad","GIF Katrigård","IF Katrifors","IFK Ymersvik","IF Dalsahamn","GIF Järnvik"]}
  ]},
  NOR:{name:"Norway", nat:"NO", strength:0.56, leagues:[
    {t:1, nm:"Divisjon 1", clubs:["IF Lilledal","Ballklubb Tromsøeborg","IF Kviteheim","Ballklubb Mossastrand","IF Haukeøy","FK Eidsafjord","FK Ranastad","IF Lilleaheim","FK Jørsdal","FK Alvaheim","IF Jørehaug","IL Kvitefjord"]},
    {t:2, nm:"Divisjon 2", clubs:["Ballklubb Nordsborg","FK Ranashaug","IF Kvitnes","Ballklubb Tromsøeberg","Ballklubb Eidssheim","FK Vestberg","FK Mossnes","IF Lilleeborg","IF Fjelleberg","Ballklubb Mosshaug","IF Jørsund","IF Brynøy"]}
  ]}
};
// hand-set reputations (0-9999, shown as 5 digits). Everyone else is placed by league and a stable hash.
const CLUB_REP = {
  "Flacăra Bălănești":3200,"Steagul Urlați Nou":3000,"Recolta Lunca Bradului":2900,"Voința Vlădeni":2700,"Sportul Dobrița":2500,"Tricolorul Mihăilești Nou":2500,
  "Rapidul Iancu Jianu":2200,"Tricolorul Neagra":2000,"CS Ostrovu Mare":1900,"Oltul Câmpurelu":1800,"Millhaven United":9250,"Glenmoor City":8900,
  "Granthorpe United":8600,"Rothmere FC":8600,"Foxholt Athletic":8000,"Ravensfield FC":7900,"Wychbourne United":7700,"Thorpemere Rovers":7300,
  "Thornecliff Rangers":7000,"Harkwood Albion":7000,"Deportivo Sierra Blanca":9500,"UD Jaraval":9300,"Unión Torrecilla":8500,"CF Aldeanova":7300,
  "Real Alcarreña":7300,"Deportivo Laguna Vieja":7100,"Unión Alcarreña":7000,"Unión Fuentenegra":7000,"Deportivo Valdeluz":6600,"Deportivo Tierrablanca":6400,
  "1. FC Ottenstein":9300,"Union Dornstadt":8300,"Hansa Birkenhain":8100,"SC Forstheim":7700,"TSV Lauterbrunn":7100,"VfB Hohenbach":7000,
  "SpVgg Steinmark":6600,"SC Wolkenfeld":6300,"Union Schwarzbach":6100,"VfB Moorbach":5900,"Portoforte Calcio":8800,"Real Monteforte":8500,
  "Real Belmonte":8400,"SS Sanbruno":8200,"AS Santelmo":7700,"US Torreluna":7600,"Pro Vallecorsa":7300,"AS Montebruno":6900,
  "Pro Ceresola":6900,"AC Grigiano":6600,"US Valmonde":9100,"Stade Essarville":7200,"Sporting Valmonde":7200,"US Noirval":7000,
  "AS Hautbourg":7000,"US Saint-Aubert":6600,"Stade Maubray":6300,"AS Amberac":6100,"Verzeau FC":5900,"Olympique Chalonnes":5700
};
const REP_BAND = { // per country, per tier: [min, max]
  ROU:{1:[1500,2600],2:[600,1300],3:[200,650],4:[20,220]},
  ENG:{1:[6600,7600],2:[4200,5600],3:[2600,3600]},
  ESP:{1:[6200,7000],2:[3800,5000],3:[2000,3000]},
  GER:{1:[6200,7000],2:[3800,5000],3:[2200,3200]},
  ITA:{1:[6200,7000],2:[3700,4800],3:[1900,2900]},
  FRA:{1:[5800,6700],2:[3400,4600],3:[1800,2700]},
  POR:{1:[4184,5812],2:[1976,3487]},
  NED:{1:[4124,5728],2:[1947,3436]},
  BEL:{1:[3942,5476],2:[1861,3285]},
  TUR:{1:[3852,5350],2:[1819,3210]},
  GRE:{1:[3519,4888],2:[1661,2932]},
  SCO:{1:[3519,4888],2:[1661,2932]},
  AUT:{1:[3579,4972],2:[1690,2983]},
  SUI:{1:[3579,4972],2:[1690,2983]},
  POL:{1:[3489,4846],2:[1647,2907]},
  UKR:{1:[3640,5056],2:[1719,3033]},
  SRB:{1:[3398,4720],2:[1604,2832]},
  CRO:{1:[3458,4804],2:[1633,2882]},
  CZE:{1:[3337,4636],2:[1576,2781]},
  DEN:{1:[3398,4720],2:[1604,2832]},
  SWE:{1:[3307,4594],2:[1561,2756]},
  NOR:{1:[3277,4552],2:[1547,2731]}
};
// promotion/relegation places between tiers (per country)
const MOVES = {ROU:{1:2, 2:4, 3:4}, ENG:{1:3, 2:3}, ESP:{1:3, 2:4}, GER:{1:2, 2:3}, ITA:{1:3, 2:3}, FRA:{1:2, 2:2},
  POR:{1:2}, NED:{1:2}, BEL:{1:2}, TUR:{1:2}, GRE:{1:2}, SCO:{1:2}, AUT:{1:2}, SUI:{1:2}, POL:{1:2}, UKR:{1:2}, SRB:{1:2}, CRO:{1:2}, CZE:{1:2}, DEN:{1:2}, SWE:{1:2}, NOR:{1:2}};
const KITS = {
  "Flacăra Bălănești":["#d7182a","#ffffff"],"Steagul Urlați Nou":["#1b3fa0","#ffffff"],"Recolta Lunca Bradului":["#0e7a3c","#ffffff"],"Voința Vlădeni":["#f2b705","#1b1b1b"],
  "Sportul Dobrița":["#6b1f7a","#ffffff"],"Tricolorul Mihăilești Nou":["#0f6f87","#ffffff"],"Rapidul Iancu Jianu":["#e2582a","#1b1b1b"],"Tricolorul Neagra":["#8c1230","#f2d9a0"],
  "CS Ostrovu Mare":["#1b1b1b","#ffffff"],"Oltul Câmpurelu":["#2f6fd0","#101c3a"],"Tricolorul Dealu Mare":["#b0132e","#101010"],"ACS Hulubești":["#146b5c","#f3f3f3"],
  "Tricolorul Tămădău":["#3b2f8f","#e8c34a"],"Gloria Oltenița Nouă":["#c2410c","#ffffff"],"Steagul Frumușani Nou":["#0b4f9e","#f2b705"],"FC Dragomirești Vale":["#7a0f25","#ffffff"],
  "Millhaven United":["#d7182a","#ffffff"],"Glenmoor City":["#1b3fa0","#ffffff"],"Granthorpe United":["#0e7a3c","#ffffff"],"Rothmere FC":["#f2b705","#1b1b1b"],
  "Foxholt Athletic":["#6b1f7a","#ffffff"],"Ravensfield FC":["#0f6f87","#ffffff"],"Wychbourne United":["#e2582a","#1b1b1b"],"Thorpemere Rovers":["#8c1230","#f2d9a0"],
  "Thornecliff Rangers":["#1b1b1b","#ffffff"],"Harkwood Albion":["#2f6fd0","#101c3a"],"Elderbrook City":["#b0132e","#101010"],"Kingsmoor Athletic":["#146b5c","#f3f3f3"],
  "Brackenhurst Rangers":["#3b2f8f","#e8c34a"],"Granthorpe County":["#c2410c","#ffffff"],"Pinewick United":["#0b4f9e","#f2b705"],"Cheswick FC":["#7a0f25","#ffffff"],
  "Elderbrook United":["#166534","#f5f5f5"],"Glenmoor United":["#9d174d","#ffffff"],"Larkfield FC":["#1e40af","#ffffff"],"Stonebridge United":["#b45309","#ffffff"],
  "Deportivo Sierra Blanca":["#d7182a","#ffffff"],"UD Jaraval":["#1b3fa0","#ffffff"],"Unión Torrecilla":["#0e7a3c","#ffffff"],"CF Aldeanova":["#f2b705","#1b1b1b"],
  "Real Alcarreña":["#6b1f7a","#ffffff"],"Deportivo Laguna Vieja":["#0f6f87","#ffffff"],"Unión Alcarreña":["#e2582a","#1b1b1b"],"Unión Fuentenegra":["#8c1230","#f2d9a0"],
  "Deportivo Valdeluz":["#1b1b1b","#ffffff"],"Deportivo Tierrablanca":["#2f6fd0","#101c3a"],"UD Puerto Sandino":["#b0132e","#101010"],"Racing Peñalta":["#146b5c","#f3f3f3"],
  "Atlético Sierra Blanca":["#3b2f8f","#e8c34a"],"Sporting Fuentenegra":["#c2410c","#ffffff"],"SD Laguna Vieja":["#0b4f9e","#f2b705"],"CD Miravalle":["#7a0f25","#ffffff"],
  "Atlético Valdemora":["#166534","#f5f5f5"],"SD Quintanar":["#9d174d","#ffffff"],"Sporting Sierra Blanca":["#1e40af","#ffffff"],"UD Santa Ludmila":["#b45309","#ffffff"],
  "1. FC Ottenstein":["#d7182a","#ffffff"],"Union Dornstadt":["#1b3fa0","#ffffff"],"Hansa Birkenhain":["#0e7a3c","#ffffff"],"SC Forstheim":["#f2b705","#1b1b1b"],
  "TSV Lauterbrunn":["#6b1f7a","#ffffff"],"VfB Hohenbach":["#0f6f87","#ffffff"],"SpVgg Steinmark":["#e2582a","#1b1b1b"],"SC Wolkenfeld":["#8c1230","#f2d9a0"],
  "Union Schwarzbach":["#1b1b1b","#ffffff"],"VfB Moorbach":["#2f6fd0","#101c3a"],"SpVgg Neustetten":["#b0132e","#101010"],"VfL Waldhausen":["#146b5c","#f3f3f3"],
  "Eintracht Oberwald":["#3b2f8f","#e8c34a"],"SV Zellingen":["#c2410c","#ffffff"],"Eintracht Moorbach":["#0b4f9e","#f2b705"],"Eintracht Schwarzbach":["#7a0f25","#ffffff"],
  "Fortuna Hasselbach":["#166534","#f5f5f5"],"TSV Tannberg":["#9d174d","#ffffff"],"Portoforte Calcio":["#d7182a","#ffffff"],"Real Monteforte":["#1b3fa0","#ffffff"],
  "Real Belmonte":["#0e7a3c","#ffffff"],"SS Sanbruno":["#f2b705","#1b1b1b"],"AS Santelmo":["#6b1f7a","#ffffff"],"US Torreluna":["#0f6f87","#ffffff"],
  "Pro Vallecorsa":["#e2582a","#1b1b1b"],"AS Montebruno":["#8c1230","#f2d9a0"],"Pro Ceresola":["#1b1b1b","#ffffff"],"AC Grigiano":["#2f6fd0","#101c3a"],
  "Roccabella FC":["#b0132e","#101010"],"AC Montesiro":["#146b5c","#f3f3f3"],"Monteforte FC":["#3b2f8f","#e8c34a"],"Real Ceresola":["#c2410c","#ffffff"],
  "Belmonte FC":["#0b4f9e","#f2b705"],"Unione Acquaverde":["#7a0f25","#ffffff"],"Virtus Salterno":["#166534","#f5f5f5"],"US Arcosanto":["#9d174d","#ffffff"],
  "Altavilla Mare FC":["#1e40af","#ffffff"],"Virtus Portoforte":["#b45309","#ffffff"],"US Valmonde":["#d7182a","#ffffff"],"Stade Essarville":["#1b3fa0","#ffffff"],
  "Sporting Valmonde":["#0e7a3c","#ffffff"],"US Noirval":["#f2b705","#1b1b1b"],"AS Hautbourg":["#6b1f7a","#ffffff"],"US Saint-Aubert":["#0f6f87","#ffffff"],
  "Stade Maubray":["#e2582a","#1b1b1b"],"AS Amberac":["#8c1230","#f2d9a0"],"Verzeau FC":["#1b1b1b","#ffffff"],"Olympique Chalonnes":["#2f6fd0","#101c3a"],
  "Sporting Noirval":["#b0132e","#101010"],"Olympique Draguemont":["#146b5c","#f3f3f3"],"RC Puyverdun":["#3b2f8f","#e8c34a"],"US Thiviers":["#c2410c","#ffffff"],
  "RC Valmonde":["#0b4f9e","#f2b705"],"Olympique Amberac":["#7a0f25","#ffffff"],"Olympique Fontenaud":["#166534","#f5f5f5"],"Chantevigne FC":["#9d174d","#ffffff"]
};
const CONT = {CL:"Champs League", EL:"Euro League"};
