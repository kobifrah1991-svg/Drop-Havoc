# Changelog

## 2026-11-09 (0.16.58) — plunger rope, run carry, brawling
- Plunger grapple (`shared/grapple.js`): V or the red rope button fires a plunger along the crosshair (46 m); it sticks to the first wall/roof/pole and reels you in at 25 m/s, keeping momentum and hopping up on release (V again or jump lets go early). 3 charges, one back every 9 s. The match validates every shot (origin, line of sight, range, charges) and lets the fast flight through its speed check only while roped. Rope and plunger are drawn for everyone; HUD counter on PC (`V`), button with count on phones.
- Carrying weapons: the gun follows the step phase of the walk/run clip; sprinting puts a long gun at high port (diagonal across the chest), a pistol low in front; aiming or firing brings it up at once.
- Brawling: the player's punches come in a natural random order (left/right, sometimes the same hand twice, never three); the server uses the hand the player threw. Someone lying on the ground (prone or knocked down by a car) gets a stomp kick: 1.45x damage, with a leg-IK kick animation.

## 2026-11-09 (0.16.57) — boxing
- Third person (`fistPose` in public/visuals.js): after a punch the fighter holds a guard (fists by the chin, elbows down) for ~2.6 s. A jab drives the fist from the guard straight out to full reach at chin height with two-bone IK (the old version rotated the arm the wrong way, so it swung backwards); the shoulder turns into the punch and the chest leans in; fists are closed.
- Combo (server, shared/game.js): the third punch within 1.3 s of the previous one is a hook - 1.7x damage, 2.2x knock-back; clients show a round hook across the body. Punches aim with the body (camera pitch clamped to ±0.35), so looking down at the target still lands.
- First person: gloved fists in a guard at the bottom of the screen, the punching one drives to the centre; a body-blow sound on hits (also for other players' punches) and a small camera shake.

## 2026-11-09 (0.16.56) — computer controls fix
- A computer with a mouse (any-pointer: fine, not a phone/tablet browser) always starts with mouse and keyboard controls, also on touch-screen laptops and browsers that report a coarse pointer. The automatic "first touch switches to touch controls" now only applies to phones/tablets.
- A computer that an older version switched to touch controls for good (one touch on a touch-screen laptop) gets mouse controls back on its first real mouse click; a choice made in Settings > Controls is kept.

## 2026-11-09 (0.16.55) — store polish
- First-match coach (`public/coach.js`): one-time tips for the skydive, gear, fighting, the city and live events, with touch wording on phones and a "Hide tips" button.
- Menu music (`public/music.js`): a generated action loop (Web Audio, no files), menus only, "Menu music" setting, silent in the background.
- Sleeping free server: the server list and the online step say "Waking the server… (up to a minute)" and keep asking for ~90 s instead of showing "Unavailable".
- City look: downtown towers are glass office towers, the far skyline has windows and stone/brick/sand tones, houses and apartment blocks stand on paved yards (less lawn).
- Checked, no change needed: the skydive lands in ~23 s (15 s diving); the long fall seen in a headless capture was the test machine's frame rate. Shots are already validated on the server (rate, ammo, inventory, origin, walls).
- Test: every browser script must parse (`test/polish-01655.test.mjs`).

## 2026-11-08 (0.16.54) — Google Play preparation
- Application id is now `com.scitedragames.drophavoc` (was `com.arenarush.game`); Java package moved to match. targetSdk 36 (Play requirement for new apps and updates).
- `android/build-aab.sh` builds the Play version: an Android App Bundle signed with the owner's upload key (kept outside the repo), without REQUEST_INSTALL_PACKAGES or APK self-update; shell updates open the Play listing (`drophavoc.store=play`). Game-file updates stay.
- Store kit in `store/play/`: icon, feature graphic, 7 real screenshots, a Play Console guide with every answer (listing texts en/he, content rating, target audience 16+, data safety), and the privacy policy page (published once the contact email is set).

## 2026-11-08 (0.16.53) — automatic updates in the Android app
- The app asks the live site (version.json) for the current version. A newer game is downloaded file by file from `<site>/app/` (list and SHA-256 in `files.json`, written by android/build.sh) into the app's own storage, with a progress bar; "Restart" loads it. Progress, cash and settings stay (same storage).
- When a newer app shell is needed (`channels.android.minShell` above the installed versionCode), the app downloads the APK itself and opens Android's installer (tap Update once); the first time Android asks to allow installs from Drop Havoc.
- Landing page (/go/): continue in the browser, download / update the APK, live version and what's new.

## 2026-11-08 (0.16.45) — start flow, free roam, league, phone HUD, review fixes
- Start flow (public/start-menu.js): Single player (vs bots) / Multiplayer (real players) picture cards; solo map + difficulty step; online step with server status, Quick match, Free roam, open rooms as picture cards (map, mode, players and their names), create / join / friends.
- Free roam mode (no clock, passive mode, loot refill, car repair, starter pistol, city only) and the National League (public multi-human rooms, real-player kills, daily cap).
- Review fixes: message/connection/room limits, guest-account cap, passive-mode holes, car-blast kill credit, summon cooldown, owned car removed on leave, admin code brute-force guard, e-mail/IP masking, language-switch fixes, no reload mid-match.
- Phone HUD: measured no-overlap layout on 4 phone sizes (tools/hud-overlap.cjs), new fire button, crouch/help/exit off the playing screen, daily panel hidden in matches, car button only in the city. Contact shadows and a sharper medium preset on phones.
- Google sign-in through Firebase for the web and the Android app (browser hand-off, drophavoc://signin) — active once the Firebase web settings are filled in (shared/firebase-web.js or FIREBASE_API_KEY on the server).

## 2026-11-08 (0.16.44) — bigger city, map picker, entry screens, 10 languages
- City grows from ±111 m to ±151 m: ring boulevard (x/z ±118) with sidewalks and lamps; a continuous row of solid edge buildings (towers and low blocks, invisible collision boxes fitted with Polyfork models) replaces the perimeter wall look; skyline moved out behind it; parachutes land inside the ring (`dropBounds`). Mini-roundabouts on the four diagonal junctions. Trees placed in natural clumps (54-tree budget kept).
- Map picker: framed picture cards from the real game (`public/img/maps`, made by `tools/map-previews.cjs`), name and description in the player's language.
- Entry: opening screen (studio mark, title sweep, loading bar, once per launch), cinematic backdrop of map pictures behind the sign-in and menu, two-column sign-in on phones held sideways.
- Graphics: colour grade, vignette and grain on high/ultra, bloom on ultra (`public/post.js`); photo surfaces on the small maps; adaptive resolution; 30/60 FPS setting; pause work in the background.
- Models: cars and city kit compressed with meshopt + WebP (38 MB to 6 MB); the Android app now includes the real cars, skyline buildings and HDR sky.
- Touch: aim assist and optional auto-fire, left-handed layout, vibration toggle, prompts that name the on-screen buttons instead of keys; ping indicator online.
- City traffic plan: two avenues each way instead of three, big roundabouts (asphalt circle, curved sidewalk, crossings set back on each arm) with fountains and bronze parachutist statues, traffic lights where the avenues meet the ring, a central fountain plaza; lighter sidewalks with concrete kerbs.
- Civilians (`shared/civilians.js`): 8 people walk the sidewalks, run by the match so everyone sees the same people; they panic and run from gunfire, can be shot, blown up or run over, and never take part in the fight.
- Cars: the rusty derby car is gone; a realistic electric GT (CC-BY, Khronos sample "Car Concept", logo removed) joined; half the cars wait on house driveways; car models simplified and merged for speed; engine sound per car type (V12, petrol, electric whine).
- Opening screen: animated Scitedra Games logo (`public/img/scitedra-games-logo.svg`).
- Languages: English first and the default for new players, then Hebrew, Arabic, Russian, plus Spanish, Portuguese, French, German, Turkish and Indonesian (`shared/lang/`).

## 2026-11-08 (0.16.43) — GTA feel + admin page
- GTA weapon wheel (hold Q / long-press swap), over-the-shoulder aim, natural low-ready walk with free arms when unarmed.
- GTA driving: drift (grip model), horn, drive-by aim; cars smash trees, poles, lamps, benches and slides (Forza-style debris and sounds), not buildings; car HP 1000.
- Run-over: knocked down, pinned while the car is on top, can be finished.
- Skydive (free fall + canopy) on the big map only; small maps start on the ground.
- PUBG ground loot instead of chests; visible helmets/vests levels 1-3.
- Graphics: instanced wind trees, single-blade grass, Poly Haven photo textures, HDRI sky; sidewalks, crosswalks, traffic lights, benches, playground, fountains, pedestrians.
- Server admin page `/admin.html`: Google (Firebase) or ADMIN_CODE sign-in; warn, mute, kick, ban, unban, announce, audit log; owners manage staff by e-mail or player name; the two main owners are locked.

## 2026-10-31 (0.16.1) — crate fix + branding
- Loot chests are now solid (invisible 1.24×0.62×0.84 m collider per chest in `shared/city.js`); players can no longer stand inside a crate. Chest line-of-sight checks ignore chest colliders (`shared/chests.js`) so opening from outside still works (2.8 m).
- Landing page `go/` background replaced with a 0.16 parachute+skyline capture (`studio/img/drophavoc-hero-0.16.webp/.jpg`) + Scitedra Games mark linking to scitedra-games.web.app.
- Scitedra Games logo in the game menu header (`public/img/`).

## 2026-10-31 (0.16.0) — unified map + HUD release
- **One release** bundling: even house/road layout, driveways/carports, grass & asphalt texture polish, peripheral NYC skyline (Polyfork Office Tower + mid-rises), and the new touch action icon set. Not shipped as separate icon-only or map-only drops.
- Touch HUD action icons: custom urban SVG set in `public/icons/actions/` (jump = leaping figure, prone = body on the floor, crouch = kneeling, plus fire / ads / reload / swap / view). Replaces arrow glyphs ⤒/⤓ and combat emoji; social buttons keep emoji.
- In-game updates: on menu load the client fetches `version.json` (cache-busted), compares to `APP_VERSION` (`shared/app-version.js`), and if newer shows a banner with notes + **Update now** (web: clear caches + reload; Android/desktop: open the channel download URL). Dismiss lasts for the session. See `docs/IN_GAME_UPDATES_HE.md`.
- Map polish: 16 houses in an even outer ring (x/z = ±19, ±62 on the ±90 edge lines), central park + four side parks of equal footprint, trees/lamps regenerated off roads; per-house concrete driveway + carport; seamless grass/asphalt; skyline ring using Polyfork NYC Kit (`public/models/city/`, CREDITS.md) — Office Tower scaled up to ~220 m on the far ring, Brick Tenement / Cast Iron Loft / Brownstone on the near ring; muted boxes as fallback, visual only. Play bounds unchanged.
- Bots move naturally; full character always; persistent achievements; public FFA rooms hold 15 players; `docs/KOBIKO_REQUESTS_HE.md` status list.


## 2026-10-29 (0.14.0)
- More weapons: M4 (key 2) and SMG (key 3); bigger magazines (rifle 40, M4 36, SMG 45, shotgun 8, sniper 7, pistol 15).
- Weapon switching on PC: Q or the mouse wheel = next weapon, X = back to the last weapon, 1-8 direct; weapon slots on the HUD are clickable.
- Practice difficulty: Easy / Normal / Hard / Insane (bot reaction, aim, turn speed, damage and bot count).
- Map pickups that respawn: heart (+75 HP), armor (+60, soaks damage before HP, max 100), speed boost (x1.3 for 15 s), power (x1.5 damage for 15 s), ammo refill, and an RPG on each tower top (4 rockets, 45 s, area blast).
- HUD: armor bar, buff timers, pickup toasts.
- Credits: M4A1 by TORI106 and RPG-7 by Tactical_Gamer (CC-BY 4.0, modified); Kriss Vector SMG (CC0).

## 2026-10-29 (0.13.0)
- Credit: "Created by Kobi Yifrach · Scitedra Games" on the start screen and pause screen, linking to the studio page.
- Scitedra Games landing page (studio/, served at <site>/studio/ by GitHub Pages).
- Free-mouse aiming when a window refuses pointer lock (claude.ai preview, some desktop apps): move the cursor to aim, hold it at the screen edge to keep turning, click to fire. J/L and I/K look keys in every mode.
- Android: web links open in the phone's browser.

## 2026-10-29 (0.12.0)
- Tougher players: 175 HP (rifle ~8 body hits / 5 headshots, pistol 6, sniper 3 / 2 to the head; backstab still kills). Faster regen after 5 s (30/s), +40 HP for a kill.
- Phone controls: floating joystick (appears under the left thumb anywhere on the left side), dead zone and response curve, bigger stick; finger look with gentle acceleration.
- Gyro aiming: turning / tilting the phone turns the view (portrait and both landscape sides); on/off and sensitivity in Settings.

## 2026-10-29 (0.11.0)
- RIVALS-style map traversal: walkable ramps (to the central platform and two new 5.5 m towers), six jump pads (~6 m launch, pulsing), climbing (jump into a ledge up to 2.4 m high to pull yourself up), crate stacks and catwalks to scramble up.
- Higher jump (~1.8 m). Bots use the same ramps and pads.

## 2026-10-29 (0.10.0)
- RIVALS-inspired pace: faster movement (9 m/s), higher jump, snappier acceleration; crouch while running = slide.
- Shot effects: glowing tracers with a white-hot core, bigger muzzle flashes (also on other players), sparks and dust on impact, view kick, an elimination burst.
- Online server ready to deploy: render.yaml (Render free plan) and Upstash Redis storage so credits/XP survive restarts; the online server is listed in the web build, static site, APK and desktop app (shared/servers.js).
- 12 characters in a 4x3 picker: soldiers (2 men, 2 women), civilian women (Mei, Noa, Shira, Emma), civilian men (Andre, Leo, Eli, Daniel).
- Removed the team armband ring from the arm; trigger finger hooks through the guard.

## 2026-10-29 (0.9.0)
- Stances: crouch (C / 🧎) and prone with crawling (Z / ⤓); lower eye height, slower movement and smaller hitboxes, checked on the server (standing up needs headroom). Space stands up.
- Tactical posture for every player: knees bent, torso leaning into the weapon; crouch-walk via leg IK; prone body with raised chest and stretched legs.
- Hands: shooting hand on the pistol grip with the index finger on the trigger and the thumb around the grip; support hand wraps the handguard / pump.
- Roster: 2 male and 2 female soldiers (new Military_Female_02), 3 civilian men and 3 civilian women; names that match each look (Marcus, Diego, Sarah, Gabriela, Andre, Leo, Eli, Mei, Noa, Shira).
- Picker colours: soldiers dark blue (men) / purple (women), civilians blue (men) / pink (women).
- Hair textures: colour bled into transparent pixels (no dark fringes at the hairline), alpha-to-coverage edges.

## 2026-10-29 (0.8.1)
- Moved to its own repository (RIVALS-GO); static site on the gh-pages branch.
- Weapon holds measured from each model: left hand under the AK handguard, on the shotgun pump, under the rifle fore-end; two-hand pistol grip; one-hand machete.
- Hands are turned by the measured palm direction; short-armed characters get the weapon (or first-person body) moved back so the support hand reaches.
- Characters load one at a time on demand; embedded models are decoded without fetch (fixes characters not loading in the claude.ai app).

## 2026-10-29 (0.8.0)
- Hands hold the weapon properly: shooting stance (torso turned, stock at the shoulder), right hand on the grip, left hand under the handguard, fingers closed around the grip, separate holds for pistol and knife; head and spine follow the aim.
- First-person arms: your own character's sleeves and hands hold the weapon at eye height.
- 10 characters: 3 soldiers and 7 civilians (5 women, 5 men in total), all Rocketbox (MIT).
- Online rooms with friends without a game server (WebRTC via the free PeerJS broker): open a room, share the 5-letter code or link, friends join from the browser, the APK or the desktop app.
- Push-to-talk voice chat (V / 🎙), device to device; works in friend rooms and on servers. /mute also mutes voice.
- New start screen: top bar, large character preview with a 10-character grid, tabs for Play / With friends / Servers.
- Static web build (`play/`, `node tools/build-web.mjs`) for GitHub Pages. APK 0.8 (internet and microphone permissions).

## 2026-10-29 (0.7.0)
- Reconnect: a player who drops can return within 30 s to the same seat, keeping kills and team.
- Economy and cosmetic shop: server-side accounts (credits, XP, level, inventory), idempotent purchases, rewards from server match results, Owner `givemoney`.
- Windows desktop build (Electron).
- Store release runbook (Steam, Google Play) and privacy policy template.
- Realistic Rocketbox soldiers (MIT) and CC0 PBR weapons; crosshair stays visible while aiming (except the sniper scope).
- APK 0.7.

## 2026-10-29
- Knife (key 5): server-validated melee arc with line of sight; backstab kills instantly.
- Team modes 1v1 and 2v2 with a lobby (team choice, ready, countdown), team spawn sides, no friendly fire, team score HUD; a team that empties mid-match forfeits.
- APK 0.5.
- Four interface languages (he/en/ru/ar). Server sends message keys; each client translates. Language switch in-game without disconnecting.
- Admin system: roles from verified identity or operator code, server-side permission checks, audit log, rate limit, bans, in-game admin panel (F2).
- Start screen: player name, 3 characters with 3D preview, server list with ping and player counts.
- Fix: lobby quick-match message clashed with in-room quick chat.
- Bans for signed-in players apply to the account, not the shared IP.
- Tracking docs: PROJECT_STATUS, TASKS, ADMIN_GUIDE, LOCALIZATION, SERVER_SETUP.

## 2026-10-28
- Browser FPS with multiplayer, bots and filtered chat; offline practice mode; Android APK.
- Daylight arena, procedural textures, animated soldier model, CC0 weapon models.
- Rooms, quick match, private rooms, Gmail invites, optional Google sign-in.
- Unity 6 scripts (compile-checked, not run in Unity).
