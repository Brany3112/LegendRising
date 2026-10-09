"use strict";
/* ============ CLOTHES ============
   Six shops, unlocked by reputation. Every item you own lifts the reputation you earn and how fast
   your Showoff following grows: low end +0.25% each, mid +0.5%, high +1%. */
const CLOTHES_TIER = {low:{per:.0025, label:"Low end"}, mid:{per:.005, label:"Mid end"}, high:{per:.01, label:"High end"}};
const SHOPS = [
{
id: "bazar",
nm: "Urban Wear",
logo: "urban",
tier: "low",
rep: 0,
stars: 1,
blurb: "Basic streetwear anyone can afford. Everyone starts here.",
items: [
{
n: "Patched coat",
p: 15,
id: "bazar0"
},
{
n: "Market driving shoes",
p: 15,
id: "bazar1"
},
{
n: "Second-hand knit",
p: 20,
id: "bazar2"
},
{
n: "Club-shop overshirt",
p: 30,
id: "bazar3"
},
{
n: "Washed leather jacket",
p: 35,
id: "bazar4"
},
{
n: "Second-hand backpack",
p: 45,
id: "bazar5"
},
{
n: "Simple hoodie",
p: 55,
id: "bazar6"
},
{
n: "Plain scarf",
p: 65,
id: "bazar7"
},
{
n: "Budget knit",
p: 75,
id: "bazar8"
},
{
n: "Old-school jacket",
p: 90,
id: "bazar9"
},
{
n: "Club-shop scarf",
p: 105,
id: "bazar10"
},
{
n: "Second-hand dress shoes",
p: 115,
id: "bazar11"
},
{
n: "Worn jeans",
p: 130,
id: "bazar12"
},
{
n: "Practice shirt",
p: 150,
id: "bazar13"
},
{
n: "Practice leather jacket",
p: 165,
id: "bazar14"
},
{
n: "Market shirt",
p: 185,
id: "bazar15"
},
{
n: "Old-school hoodie",
p: 200,
id: "bazar16"
},
{
n: "Club-shop gilet",
p: 220,
id: "bazar17"
},
{
n: "Everyday beanie",
p: 240,
id: "bazar18"
},
{
n: "Cotton suit",
p: 260,
id: "bazar19"
}
]
},
{
id: "highstreet",
nm: "Street Line",
logo: "street",
tier: "low",
rep: 60,
stars: 1.5,
blurb: "Clean high-street fits that at least look new.",
items: [
{
n: "Worn dress shoes",
p: 60,
id: "highstreet0"
},
{
n: "Everyday tuxedo",
p: 65,
id: "highstreet1"
},
{
n: "Basic overshirt",
p: 75,
id: "highstreet2"
},
{
n: "Practice dress shoes",
p: 90,
id: "highstreet3"
},
{
n: "Simple boots",
p: 105,
id: "highstreet4"
},
{
n: "Worn tuxedo",
p: 125,
id: "highstreet5"
},
{
n: "Plain dress shoes",
p: 145,
id: "highstreet6"
},
{
n: "Second-hand raincoat",
p: 170,
id: "highstreet7"
},
{
n: "Simple holdall",
p: 195,
id: "highstreet8"
},
{
n: "Club-shop scarf",
p: 225,
id: "highstreet9"
},
{
n: "Patched sunglasses",
p: 255,
id: "highstreet10"
},
{
n: "Practice sunglasses",
p: 285,
id: "highstreet11"
},
{
n: "Washed shorts",
p: 320,
id: "highstreet12"
},
{
n: "Old-school trench",
p: 355,
id: "highstreet13"
},
{
n: "Old-school jacket",
p: 390,
id: "highstreet14"
},
{
n: "Practice shorts",
p: 430,
id: "highstreet15"
},
{
n: "Local holdall",
p: 470,
id: "highstreet16"
},
{
n: "Patched belt",
p: 510,
id: "highstreet17"
},
{
n: "Everyday puffer",
p: 555,
id: "highstreet18"
},
{
n: "Plain bomber",
p: 600,
id: "highstreet19"
}
]
},
{
id: "urban",
nm: "Velvet & Oak",
logo: "velvet",
tier: "mid",
rep: 180,
stars: 2.5,
blurb: "Quality fabrics and smart casual pieces people notice.",
items: [
{
n: "Harbour beanie",
p: 350,
id: "urban0"
},
{
n: "Oxford tailored pants",
p: 370,
id: "urban1"
},
{
n: "Italian holdall",
p: 410,
id: "urban2"
},
{
n: "Two-tone hoodie",
p: 465,
id: "urban3"
},
{
n: "Merino tuxedo",
p: 535,
id: "urban4"
},
{
n: "Monaco suit trousers",
p: 615,
id: "urban5"
},
{
n: "Pressed trainers",
p: 705,
id: "urban6"
},
{
n: "Riviera holdall",
p: 805,
id: "urban7"
},
{
n: "Monaco sunglasses",
p: 915,
id: "urban8"
},
{
n: "Merino jacket",
p: 1030,
id: "urban9"
},
{
n: "Suede watch strap",
p: 1155,
id: "urban10"
},
{
n: "Merino shirt",
p: 1290,
id: "urban11"
},
{
n: "Cashmere-blend driving shoes",
p: 1430,
id: "urban12"
},
{
n: "Monaco belt",
p: 1575,
id: "urban13"
},
{
n: "Cashmere-blend loafers",
p: 1730,
id: "urban14"
},
{
n: "Heavyweight polo shirt",
p: 1890,
id: "urban15"
},
{
n: "Linen trainers",
p: 2060,
id: "urban16"
},
{
n: "Oxford raincoat",
p: 2235,
id: "urban17"
},
{
n: "Brushed holdall",
p: 2415,
id: "urban18"
},
{
n: "Slim-fit tracksuit top",
p: 2600,
id: "urban19"
}
]
},
{
id: "sartor",
nm: "Maison Éclat",
logo: "maison",
tier: "mid",
rep: 450,
stars: 3.5,
blurb: "Proper tailoring: shirts, suits and good shoes.",
items: [
{
n: "Cashmere-blend gilet",
p: 900,
id: "sartor0"
},
{
n: "Structured cap",
p: 950,
id: "sartor1"
},
{
n: "Matte holdall",
p: 1055,
id: "sartor2"
},
{
n: "Merino blazer",
p: 1190,
id: "sartor3"
},
{
n: "Linen cap",
p: 1365,
id: "sartor4"
},
{
n: "Milan trousers",
p: 1560,
id: "sartor5"
},
{
n: "Italian scarf",
p: 1785,
id: "sartor6"
},
{
n: "Two-tone trainers",
p: 2035,
id: "sartor7"
},
{
n: "Matte jeans",
p: 2305,
id: "sartor8"
},
{
n: "Italian jacket",
p: 2595,
id: "sartor9"
},
{
n: "Oxford coat",
p: 2905,
id: "sartor10"
},
{
n: "Structured jeans",
p: 3235,
id: "sartor11"
},
{
n: "Tailored holdall",
p: 3585,
id: "sartor12"
},
{
n: "Monaco trench",
p: 3950,
id: "sartor13"
},
{
n: "Suede cargos",
p: 4335,
id: "sartor14"
},
{
n: "Tailored coat",
p: 4735,
id: "sartor15"
},
{
n: "Two-tone suit",
p: 5155,
id: "sartor16"
},
{
n: "Heavyweight raincoat",
p: 5585,
id: "sartor17"
},
{
n: "Monaco suit trousers",
p: 6035,
id: "sartor18"
},
{
n: "Italian backpack",
p: 6500,
id: "sartor19"
}
]
},
{
id: "atelier",
nm: "Opulence Atelier",
logo: "opulence",
tier: "high",
rep: 1200,
stars: 4.5,
blurb: "Designer pieces. Cameras find you in these.",
items: [
{
n: "Heritage driving shoes",
p: 6000,
id: "atelier0"
},
{
n: "Hand-stitched sunglasses",
p: 6290,
id: "atelier1"
},
{
n: "Icon cap",
p: 6875,
id: "atelier2"
},
{
n: "Vicuña cap",
p: 7670,
id: "atelier3"
},
{
n: "Vicuña overshirt",
p: 8645,
id: "atelier4"
},
{
n: "One-off varsity jacket",
p: 9780,
id: "atelier5"
},
{
n: "Vicuña shirt",
p: 11060,
id: "atelier6"
},
{
n: "Archive knit",
p: 12475,
id: "atelier7"
},
{
n: "Archive belt",
p: 14020,
id: "atelier8"
},
{
n: "Couture bomber",
p: 15680,
id: "atelier9"
},
{
n: "Atelier puffer",
p: 17460,
id: "atelier10"
},
{
n: "Hand-stitched overshirt",
p: 19345,
id: "atelier11"
},
{
n: "Bespoke dress shoes",
p: 21340,
id: "atelier12"
},
{
n: "Limited suit",
p: 23435,
id: "atelier13"
},
{
n: "Runway boots",
p: 25630,
id: "atelier14"
},
{
n: "Heritage polo shirt",
p: 27925,
id: "atelier15"
},
{
n: "Silk tracksuit top",
p: 30305,
id: "atelier16"
},
{
n: "Heritage loafers",
p: 32785,
id: "atelier17"
},
{
n: "Limited varsity jacket",
p: 35350,
id: "atelier18"
},
{
n: "Diamond-cut trainers",
p: 38000,
id: "atelier19"
}
]
},
{
id: "maison",
nm: "Imperial Couture",
logo: "imperial",
tier: "high",
rep: 3000,
stars: 5,
blurb: "Couture and one-offs. Ballon d'Or night clothing.",
items: [
{
n: "Heritage boots",
p: 20000,
id: "maison0"
},
{
n: "One-off bomber",
p: 21440,
id: "maison1"
},
{
n: "Runway holdall",
p: 24365,
id: "maison2"
},
{
n: "Numbered watch strap",
p: 28345,
id: "maison3"
},
{
n: "One-off shorts",
p: 33225,
id: "maison4"
},
{
n: "Silk coat",
p: 38900,
id: "maison5"
},
{
n: "Runway tailored pants",
p: 45300,
id: "maison6"
},
{
n: "Diamond-cut watch strap",
p: 52380,
id: "maison7"
},
{
n: "Couture gloves",
p: 60090,
id: "maison8"
},
{
n: "Bespoke tracksuit top",
p: 68405,
id: "maison9"
},
{
n: "Signature boots",
p: 77295,
id: "maison10"
},
{
n: "Limited suit",
p: 86735,
id: "maison11"
},
{
n: "Bespoke gloves",
p: 96700,
id: "maison12"
},
{
n: "Custom driving shoes",
p: 107180,
id: "maison13"
},
{
n: "Silk joggers",
p: 118155,
id: "maison14"
},
{
n: "Couture trainers",
p: 129615,
id: "maison15"
},
{
n: "Gold-trim suit",
p: 141535,
id: "maison16"
},
{
n: "Icon backpack",
p: 153915,
id: "maison17"
},
{
n: "Atelier varsity jacket",
p: 166740,
id: "maison18"
},
{
n: "Gold-trim raincoat",
p: 180000,
id: "maison19"
}
]
}
];

/* Shop marks, drawn as inline SVG (cheapest to most expensive). */
const SHOP_LOGOS = {
  urban:`<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="M8 10h11v26l9-10v14l-9 10H8z"/><path d="M34 10h11v18l9-10v14L38 54h-4z"/></g></svg>`,
  street:`<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="miter"><path d="M50 14H26l-9 10 9 10h13l-9 10H14"/></g><path d="M20 44h22l-7 8H13z" fill="#7c93b0"/></svg>`,
  velvet:`<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M30 56c-9-14-8-30 4-44 3 17 1 31-4 44z"/><path d="M34 52c12-6 18-19 16-36-14 6-20 19-16 36z"/></g></svg>`,
  maison:`<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor" font-family="Georgia,serif" font-weight="700"><text x="6" y="46" font-size="40">M</text><text x="30" y="52" font-size="34" opacity=".95">É</text></g></svg>`,
  opulence:`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 8l4 4 4-6 4 6 4-4 1 6H19z" fill="currentColor"/><path d="M12 18h40v22c0 10-9 15-20 20-11-5-20-10-20-20z" fill="#0d1017" stroke="currentColor" stroke-width="2.2"/><circle cx="32" cy="33" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M32 22v26M24 33h16" stroke="currentColor" stroke-width="2"/></svg>`,
  imperial:`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M21 9l4 4 4-6 4 6 4-4 1 5H20z" fill="currentColor"/><ellipse cx="32" cy="36" rx="20" ry="23" fill="#0d1017" stroke="currentColor" stroke-width="2.2"/><ellipse cx="32" cy="36" rx="15" ry="18" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".8"/><g fill="currentColor" font-family="Georgia,serif" font-weight="700"><text x="15" y="47" font-size="26">I</text><text x="24" y="47" font-size="26">C</text></g></svg>`
};
function shopLogo(sh){ return `<span class="shoplogo ${sh.tier}">${SHOP_LOGOS[sh.logo] || ""}</span>`; }
