// One switch for paid gates. false = every cosmetic, skin and garage car is free to use.
// The credit/XP economy, match cash and purchase records stay in place so a paid
// build can be turned back on without rewriting saves. There is no real-money billing in this game.
export const PAYWALL_ENABLED = false;

export function cosmeticEntitled(owned, itemId, known) {
  if (!itemId) return false;
  if (!PAYWALL_ENABLED) return known !== false;
  return (owned || []).includes(itemId);
}
