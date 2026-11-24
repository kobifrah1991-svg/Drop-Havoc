// Which overlay the back / Escape key closes first.
// Microphone consent and the report dialog sit above everything else. Pause (settings, then the card),
// the team lobby, and the front menu (its sub-screens, then the menu itself) close after the in-game windows.
export function nextOverlay(s) {
  if (s.mic) return 'mic';
  if (s.report) return 'report';
  if (s.drop) return 'drop';
  if (s.mapSheet) return 'mapSheet';
  if (s.rotateHint) return 'rotateHint';
  if (s.inspect) return 'inspect';
  if (s.wheel) return 'wheel';
  if (s.gunShop) return 'gunShop';
  if (s.garage) return 'garage';
  if (s.shop) return 'shop';
  if (s.league) return 'league';
  if (s.scoreboard) return 'scoreboard';
  if (s.hints) return 'hints';
  if (s.adminConfirm) return 'adminConfirm';
  if (s.admin) return 'admin';
  if (s.exit) return 'exit';
  if (s.invite) return 'invite';
  if (s.update) return 'update';
  if (s.end) return 'end';
  if (s.quick) return 'quick';
  if (s.chat) return 'chat';
  if (s.pauseSettings) return 'pauseSettings';
  if (s.pause) return 'pause';
  if (s.lobby) return 'lobby';
  if (s.startView && s.startView !== 'home') return 'startView';
  if (s.menuSheet) return 'menuSheet';
  if (s.menuTab && s.menuTab !== 'play') return 'menuTab';
  if (s.menu) return 'menu';
  return null;
}
