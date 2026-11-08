// Cosmetic shop catalog (Stage A). Prices are in-game credits only.
// Items are purely visual and never change damage or speed. Display names: i18n keys shop.<id>.
// Rarity is a label only: it does not change the price.
// Rotation order is this array. Daily shelf is 4 items; an item returns within 14 days.
export const SHOP = [
  { id: 'outfit.desert', slot: 'outfit', price: 400, rarity: 'common', tint: 0xc9a46a },
  { id: 'outfit.forest', slot: 'outfit', price: 450, rarity: 'common', tint: 0x3d6b3a },
  { id: 'outfit.urban', slot: 'outfit', price: 500, rarity: 'common', tint: 0x6e7c8a },
  { id: 'camo.digital', slot: 'camo', price: 350, rarity: 'common', color: 0x4a5c3a, metal: 0.15 },
  { id: 'camo.rust', slot: 'camo', price: 550, rarity: 'uncommon', color: 0xa24b2a, metal: 0.35 },
  { id: 'camo.carbon', slot: 'camo', price: 700, rarity: 'rare', color: 0x2b2b30, metal: 0.4 },
  { id: 'outfit.arctic', slot: 'outfit', price: 800, rarity: 'rare', tint: 0xe6edf5 },
  { id: 'outfit.night', slot: 'outfit', price: 900, rarity: 'rare', tint: 0x30343f },
  { id: 'camo.neon', slot: 'camo', price: 1200, rarity: 'epic', color: 0x00e5ff, glow: true },
  { id: 'outfit.inferno', slot: 'outfit', price: 1400, rarity: 'epic', tint: 0xc2410c },
  { id: 'camo.plasma', slot: 'camo', price: 1600, rarity: 'epic', color: 0xb026ff, metal: 0.45, glow: true },
  { id: 'camo.gold', slot: 'camo', price: 2400, rarity: 'legendary', color: 0xd4af37, metal: 0.85 },
  { id: 'outfit.ghost', slot: 'outfit', price: 2600, rarity: 'legendary', tint: 0xd8d8e0 },
  { id: 'camo.obsidian', slot: 'camo', price: 2800, rarity: 'legendary', color: 0x2a0845, metal: 0.7, glow: true },
];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const SLOTS = ['outfit', 'camo'];
export const itemById = (id) => SHOP.find((i) => i.id === id) || null;

// UTC day buckets shared by the shop rotation and the server earn caps.
export const DAY_MS = 86400000;
export function utcDayIndex(now = Date.now()) {
  return Math.floor(Number(now) / DAY_MS);
}
export function utcWeekIndex(now = Date.now()) {
  return Math.floor(utcDayIndex(now) / 7);
}

// 4 offers each UTC day, plus one weekly featured item at full catalog price.
// Step of 4 across 14 items brings every item back within 4 days (the cap is 14).
export const ROTATION = {
  dailyCount: 4,
  featuredPerWeek: 1,
  maxReturnDays: 14,
  featuredDiscount: 0,
};

export function rotationAt(now = Date.now()) {
  const day = utcDayIndex(now);
  const week = utcWeekIndex(now);
  const n = SHOP.length;
  const start = (day * ROTATION.dailyCount) % n;
  const daily = [];
  for (let i = 0; i < ROTATION.dailyCount; i++) daily.push(SHOP[(start + i) % n]);
  const featured = SHOP[week % n];
  return {
    day,
    week,
    daily,
    featured,
    featuredDiscount: ROTATION.featuredDiscount,
    maxReturnDays: ROTATION.maxReturnDays,
  };
}

export function isListed(itemId, now = Date.now()) {
  const rot = rotationAt(now);
  return rot.featured.id === itemId || rot.daily.some((item) => item.id === itemId);
}

// Rewards are computed on the server from server-side match results.
// Daily sources (match, dailies, streak, level-up) share one cap; the week can close first.
export const ECONOMY = {
  startCredits: 500,
  credits: { kill: 10, headshot: 5, win: 100, played: 25 },
  xp: { kill: 100, headshot: 50, win: 500, played: 100 },
  levelXp: (level) => 1000 + (level - 1) * 250,
  dailyCap: 600,
  weeklyCap: 3500,
  levelUp: { credits: 35, maxPerDay: 3 },
  // play: a finished match. kills: at least one kill that UTC day. win: a win that UTC day.
  dailies: [
    { id: 'play', credits: 40 },
    { id: 'kills', credits: 60 },
    { id: 'win', credits: 80 },
  ],
  // Once per UTC week, on the first finished match. Counted inside the weekly cap.
  weekly: { id: 'weekly', credits: 300 },
  // Active days only. Days 1–6 pay `daily`, day 7 pays `day7`, then the cycle repeats.
  // A missed calendar day does not reset the streak and does not deduct credits.
  streak: { daily: 20, day7: 150, cycle: 7 },
};
