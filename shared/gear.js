// PUBG-style gear levels (1-3) on top of the armor and helmet points the game already uses.
// A vest sets armor to at least its points; a helmet sets helmet points. Levels drop to 0 when the points run out.
export const VEST_POINTS = { 1: 70, 2: 130, 3: 200 };
export const HELMET_POINTS = { 1: 20, 2: 40, 3: 60 };
export const HELMET_ABSORB = { 0: 0.55, 1: 0.35, 2: 0.45, 3: 0.55 }; // share of a head hit a helmet takes (0: legacy points)
export const vestLevelOf = (armor) => (armor <= 0 ? 0 : armor > 130 ? 3 : armor > 70 ? 2 : 1);
export const helmetLevelOf = (h) => (h <= 0 ? 0 : h > 40 ? 3 : h > 20 ? 2 : 1);
// Medical items: how much they heal and up to what (bandage and first aid stop at 150 of 200, like PUBG's 75%)
export const HEALS = { bandage: { hp: 30, cap: 150 }, firstaid: { hp: 90, cap: 150 }, medkit: { hp: 200, cap: 200 } };
export const DRINK = { hp: 25, speedMs: 10000 };
// Visible gear for snapshots: one small number per player
export const packGear = (p) => (p.helmetLvl || 0) * 4 + (p.vestLvl || 0);
export const unpackGear = (g) => [Math.floor((g | 0) / 4), (g | 0) % 4];
