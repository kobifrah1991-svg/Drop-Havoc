// 0.16.50 Gun shop (GTA-style, city centre): a counter with a seller and a wall of guns. Players earn match cash for
// kills and spend it here on weapons, ammo, armour and medical supplies. The server checks everything: that you stand
// at the counter, that you have the cash, and that the item does something for you (no paying for a weaker vest).
// Names come from the existing loot/weapon strings, so the menu speaks every language the game does.
export const CASH = { start: 100, kill: 150, head: 60, max: 9999 };
export const GUN_ITEMS = [
  { id: 'pistol', cat: 'weapons', price: 150, loot: { weapon: 'pistol' } },
  { id: 'smg', cat: 'weapons', price: 350, loot: { weapon: 'smg' } },
  { id: 'shotgun', cat: 'weapons', price: 400, loot: { weapon: 'shotgun' } },
  { id: 'rifle', cat: 'weapons', price: 500, loot: { weapon: 'rifle' } },
  { id: 'm4', cat: 'weapons', price: 600, loot: { weapon: 'm4' } },
  { id: 'm16', cat: 'weapons', price: 700, loot: { weapon: 'm16' } },
  { id: 'sniper', cat: 'weapons', price: 900, loot: { weapon: 'sniper' } },
  { id: 'ammo', cat: 'supplies', price: 80, loot: { ammo: 1 } },
  { id: 'bandage', cat: 'supplies', price: 50, loot: { heal: 'bandage' } },
  { id: 'firstaid', cat: 'supplies', price: 120, loot: { heal: 'firstaid' } },
  { id: 'medkit', cat: 'supplies', price: 250, loot: { heal: 'medkit' } },
  { id: 'drink', cat: 'supplies', price: 90, loot: { drink: 1 } },
  { id: 'vest1', cat: 'armor', price: 200, loot: { vest: 1 } },
  { id: 'vest2', cat: 'armor', price: 400, loot: { vest: 2 } },
  { id: 'vest3', cat: 'armor', price: 700, loot: { vest: 3 } },
  { id: 'helmet1', cat: 'armor', price: 150, loot: { helmetLvl: 1 } },
  { id: 'helmet2', cat: 'armor', price: 300, loot: { helmetLvl: 2 } },
  { id: 'helmet3', cat: 'armor', price: 550, loot: { helmetLvl: 3 } },
];
export const gunItem = (id) => GUN_ITEMS.find((x) => x.id === id) || null;
// string key + level for the menu (reuses loot.* and weapon.* strings)
export const gunItemLabel = (it) => (it.loot.weapon ? { key: 'weapon.' + it.loot.weapon } : it.loot.vest ? { key: 'loot.armor', n: it.loot.vest } : it.loot.helmetLvl ? { key: 'loot.helmet', n: it.loot.helmetLvl } : it.loot.heal ? { key: 'loot.' + it.loot.heal } : it.loot.drink ? { key: 'loot.drink' } : { key: 'loot.ammo' });
export const SHOP_REACH = 1.1; // standing in the checkpoint ring in front of the counter (the server allows +0.6)
