# Drop Havoc · דרופ האבוק

**Drop Havoc** (דרופ האבוק) is an urban first-person action game: parachute in, loot, and drive. It runs in the browser, as an Android APK, and as a Windows desktop build. Current game version: **0.16.42**.

Created by **Kobi Ifrah** · [Scitedra Games](https://scitedra-games.web.app/). The credit string in the client (`shared/brand.js`) is `Kobi Yifrach`.

**דרופ האבוק** (Drop Havoc) הוא משחק פעולה אורבני בגוף ראשון: צניחה, שלל ורכבים. הוא רץ בדפדפן, כ־APK לאנדרואיד, וכגרסת Windows. גרסת המשחק הנוכחית: **0.16.42**.

נוצר על ידי **Kobi Ifrah** · [Scitedra Games](https://scitedra-games.web.app/). מחרוזת הקרדיט בתוך המשחק (`shared/brand.js`) היא `Kobi Yifrach`.

The official name is Drop Havoc. **Arena Rush** (ארנה ראש) is the retired former name. It is not a store listing. Details are in [Name](#name) / [שם](#שם).

---

## Links · קישורים

These addresses are the ones written in this repository. They answered when this README was updated (5 Nov 2026). None of them is a Google Play or Steam page.

הכתובות האלה מופיעות במאגר. כולן ענו כשהמסמך עודכן (5 בנובמבר 2026). אף אחת מהן אינה דף Google Play או Steam.

| | English | עברית |
|---|---|---|
| Repository | [github.com/kobifrah1991-svg/Drop-Havoc](https://github.com/kobifrah1991-svg/Drop-Havoc) | מאגר GitHub |
| Play in the browser | [kobifrah1991-svg.github.io/Drop-Havoc/](https://kobifrah1991-svg.github.io/Drop-Havoc/) | המשחק ב־GitHub Pages |
| Landing page | […/Drop-Havoc/go/](https://kobifrah1991-svg.github.io/Drop-Havoc/go/) | דף נחיתה: משחק והורדת APK |
| Studio page | […/Drop-Havoc/studio/](https://kobifrah1991-svg.github.io/Drop-Havoc/studio/) | דף הסטודיו על GitHub Pages |
| Android APK | […/DropHavoc.apk](https://kobifrah1991-svg.github.io/Drop-Havoc/DropHavoc.apk) | קובץ APK ישיר, לא חנות |
| Studio site | [scitedra-games.web.app](https://scitedra-games.web.app/) | אתר Scitedra Games |
| Game page on that site | [scitedra-games.web.app/drop-havoc/](https://scitedra-games.web.app/drop-havoc/) | דף המשחק; גם יעד עדכון ה־desktop |
| Online server | [drop-havoc.onrender.com](https://drop-havoc.onrender.com) | השרת שרשום במשחק (`/health`) |

The repository was renamed from `RIVALS-GO` to `Drop-Havoc` on 31 Oct 2026. GitHub redirects the old repository path. Use the Drop-Havoc links above.

המאגר שונה מ־`RIVALS-GO` ל־`Drop-Havoc` ב־31 באוקטובר 2026. GitHub מפנה מהנתיב הישן. השתמשו בקישורי Drop-Havoc למעלה.

---

<div dir="ltr">

## English

### Name

The only product name is **Drop Havoc**. **Arena Rush** was retired on 31 Oct 2026 and must not be used in the interface, on a store page, on the website, or in marketing. See `docs/PRODUCT_NAME.md`.

Two technical leftovers stay on purpose, and they are not shown to players:

- `com.arenarush.game` — Android and Electron application id. Changing it before the first store upload is a separate release decision (`docs/PRODUCT_NAME.md` suggests `com.scitedragames.drophavoc`). Changing it later makes a new app, so an existing install would not update.
- `arena-rush:accounts` — storage key in the economy code. Changing it drops existing accounts.

### Play

- **Browser:** open the [GitHub Pages build](https://kobifrah1991-svg.github.io/Drop-Havoc/). The [landing page](https://kobifrah1991-svg.github.io/Drop-Havoc/go/) links to that build and to the APK. Tagline on that page: “Drop straight into the action.”
- **Android:** the landing page serves [DropHavoc.apk](https://kobifrah1991-svg.github.io/Drop-Havoc/DropHavoc.apk) as a direct file. Copy it to the phone, allow install from that source if Android asks, then open **Drop Havoc**. This is not a Google Play listing.
- **Windows:** build it locally (below). The desktop update channel in `public/version.json` opens [the studio game page](https://scitedra-games.web.app/drop-havoc/). That page is not a Steam listing.
- **Online match server:** the client lists `https://drop-havoc.onrender.com` (`shared/servers.js`). The start screen pings it and shows whether it is up. `/health` is the check used by `.github/workflows/keepalive.yml`. Render’s free plan sleeps after inactivity and the disk does not keep player saves; `render.yaml` stores saves in Firebase when configured.

### Stores

This repository does not contain a Google Play or Steam listing, and this README does not add one.

`docs/STORE_RELEASE.md` is a runbook for a future upload. It states that `android/DropHavoc.apk` is signed with a debug key and is not acceptable for Google Play (an AAB is required). The studio page marks Steam as planned, not published. `docs/PRIVACY_POLICY.md` is a template with placeholders, not a published policy.

### Run from source

Node.js 18 or newer.

```bash
git clone https://github.com/kobifrah1991-svg/Drop-Havoc.git
cd Drop-Havoc
npm install
npm start          # http://localhost:3000
npm test
```

People on the same network use `http://<this-machine-ip>:3000`.

Environment variables:

| Variable | Role |
|---|---|
| `PORT` | HTTP port. Default `3000`. |
| `BOTS` | How many bots fill an online room. Default `3`. `0` disables them. |
| `BOT_DIFFICULTY` | Online bot difficulty. Default `easy`. |
| `GOOGLE_CLIENT_ID` | Optional Google sign-in. Without it, players are guests. |
| `ADMIN_CODE` | Operator admin code. Do not commit it. |
| `FIRESTORE_PROJECT`, `FIRESTORE_PREFIX` | Optional Cloud Firestore saves. See `render.yaml`. |

One-click Render blueprint (needs your own Render account): [render.com/deploy?repo=https://github.com/kobifrah1991-svg/Drop-Havoc](https://render.com/deploy?repo=https://github.com/kobifrah1991-svg/Drop-Havoc). Setup notes: `docs/SERVER_SETUP.md`.

Google sign-in, once: in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an OAuth client ID of type **Web application**. Add the site origin (for this deploy, `https://drop-havoc.onrender.com`) and `http://localhost:3000` under **Authorized JavaScript origins**, then start with `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm start`.

### What the game does

Authoritative server (`shared/game.js` also runs in the browser for offline practice). Shared protocol: `drophavoc-city-2`.

- Free-for-all up to 15 players, first to 25 eliminations or 5 minutes. Duel (first to 10) and 2v2 (first to 15) use a lobby. Bots fill practice and public rooms.
- Twelve fighters (`shared/characters.js`). Weapons in `shared/weapons.js`: assault rifle, M4, M16, SMG, shotgun, sniper, pistol, knife, RPG.
- Ten maps: city, neon warehouse, canyon, harbor, jungle, rooftop, base, snow, factory, town.
- Parachute drop, vehicles, loot chests, and map pickups. Movement includes slide, climb, and jump pads.
- Filtered text chat, quick chat, `/mute`, `/unmute`, `/report`. Push-to-talk voice (V, or the mic button) goes device to device and is not stored.
- Languages in the client: Hebrew, English, Russian, Arabic (`shared/i18n.js`).
- Friend rooms without this game server: open a room, share the 5-character code or a `?join=` link. Devices connect with WebRTC. The free PeerJS service only introduces them. When the host leaves, the room ends. Some networks block the direct connection.

### Other builds

Static site (practice and friend rooms, no game server in the page):

```bash
npm install
node tools/build-web.mjs [output-folder]
```

The default output folder is `../play`, next to the clone. The published GitHub Pages site is the URL in the table above, not a folder committed on `main`.

Windows (Electron):

```bash
cd desktop
npm install
npm run dist
```

Unzip `desktop/dist` and run `Drop Havoc.exe`. The package version is `desktop/package.json` (separate from the 0.16.42 game label). Add a server in `desktop/servers.json` if you want that build to list one. F11 toggles full screen.

Rebuild the Android project after code changes with `android/build.sh` on Linux.

Unity scripts live in `unity/` and have their own `unity/README.md`. They are not the browser game.

### Credits and docs

Models and licenses: `public/models/CREDITS.md`. Studio credit in the client: `shared/brand.js` (Scitedra Games, link to the studio page on GitHub Pages).

- `docs/PRODUCT_NAME.md` — official name
- `docs/STORE_RELEASE.md` — store runbook, not a live listing
- `docs/SERVER_SETUP.md` — hosting
- `docs/ADMIN_GUIDE.md` — admin commands
- `docs/CHANGELOG.md` — version notes

</div>

<div dir="rtl">

## עברית

### שם

השם היחיד של המוצר הוא **דרופ האבוק** (Drop Havoc). **ארנה ראש** (Arena Rush) הוצא משימוש ב־31 באוקטובר 2026, ואסור שיופיע בממשק, בדף חנות, באתר או בחומרי שיווק. הפירוט ב־`docs/PRODUCT_NAME.md`.

שתי שאריות טכניות נשארות בכוונה, והן לא מוצגות לשחקנים:

- `com.arenarush.game` — מזהה האפליקציה באנדרואיד וב־Electron. שינוי שלו לפני ההעלאה הראשונה לחנות הוא החלטת הפצה נפרדת (`docs/PRODUCT_NAME.md` מציע `com.scitedragames.drophavoc`). שינוי אחרי שיש התקנה קיימת יוצר אפליקציה חדשה, וההתקנה הישנה לא תתעדכן.
- `arena-rush:accounts` — מפתח אחסון בקוד הכלכלה. שינוי שלו מוחק חשבונות קיימים.

### לשחק

- **דפדפן:** פותחים את [בניית GitHub Pages](https://kobifrah1991-svg.github.io/Drop-Havoc/). [דף הנחיתה](https://kobifrah1991-svg.github.io/Drop-Havoc/go/) מקשר אליה ואל ה־APK. הסיסמה שם: «צונחים ישר לאקשן.»
- **אנדרואיד:** דף הנחיתה מגיש את [DropHavoc.apk](https://kobifrah1991-svg.github.io/Drop-Havoc/DropHavoc.apk) כקובץ ישיר. מעבירים לטלפון, מאשרים התקנה מהמקור הזה אם אנדרואיד מבקש, ופותחים את **Drop Havoc**. זה לא דף ב־Google Play.
- **Windows:** בונים מקומית (בהמשך). ערוץ העדכון של גרסת המחשב ב־`public/version.json` פותח את [דף המשחק באתר הסטודיו](https://scitedra-games.web.app/drop-havoc/). זה לא דף Steam.
- **שרת משחק:** הלקוח רושם את `https://drop-havoc.onrender.com` (`shared/servers.js`). מסך הפתיחה בודק אותו ומציג אם הוא זמין. `/health` הוא הבדיקה של `.github/workflows/keepalive.yml`. במסלול החינמי של Render השרת נרדם אחרי חוסר פעילות, והדיסק לא שומר את נתוני השחקנים; `render.yaml` שומר אותם ב־Firebase כשהוא מוגדר.

### חנויות

במאגר הזה אין דף Google Play ואין דף Steam, וה־README הזה לא ממציא כאלה.

`docs/STORE_RELEASE.md` הוא מדריך להעלאה עתידית. כתוב שם ש־`android/DropHavoc.apk` חתום במפתח debug ולכן לא מתאים ל־Google Play (נדרש AAB). דף הסטודיו מסמן את Steam כמתוכנן, לא כמפורסם. `docs/PRIVACY_POLICY.md` הוא תבנית עם מקומות למילוי, לא מדיניות שפורסמה.

### הרצה מהמקור

נדרש Node.js 18 ומעלה.

```bash
git clone https://github.com/kobifrah1991-svg/Drop-Havoc.git
cd Drop-Havoc
npm install
npm start          # http://localhost:3000
npm test
```

מי שנמצא באותה רשת נכנס ל־`http://<IP-של-המחשב>:3000`.

משתני סביבה:

| משתנה | תפקיד |
|---|---|
| `PORT` | פורט HTTP. ברירת מחדל `3000`. |
| `BOTS` | כמה בוטים ממלאים חדר אונליין. ברירת מחדל `3`. `0` מכבה אותם. |
| `BOT_DIFFICULTY` | קושי הבוטים באונליין. ברירת מחדל `easy`. |
| `GOOGLE_CLIENT_ID` | התחברות Google, אופציונלי. בלי זה השחקנים אורחים. |
| `ADMIN_CODE` | קוד אדמין של המפעיל. לא שומרים אותו במאגר. |
| `FIRESTORE_PROJECT`, `FIRESTORE_PREFIX` | שמירה אופציונלית ב־Cloud Firestore. ראו `render.yaml`. |

פריסת Render בלחיצה (נדרש חשבון Render שלכם): [render.com/deploy?repo=https://github.com/kobifrah1991-svg/Drop-Havoc](https://render.com/deploy?repo=https://github.com/kobifrah1991-svg/Drop-Havoc). הערות התקנה: `docs/SERVER_SETUP.md`.

התחברות Google, פעם אחת: ב־[Google Cloud Console](https://console.cloud.google.com/apis/credentials) יוצרים OAuth client ID מסוג **Web application**. מוסיפים את כתובת האתר (בפריסה הזו, `https://drop-havoc.onrender.com`) וגם `http://localhost:3000` תחת **Authorized JavaScript origins**, ומפעילים עם `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm start`.

### מה המשחק עושה

השרת מכריע (`shared/game.js` רץ גם בדפדפן לאימון בלי שרת). פרוטוקול משותף: `drophavoc-city-2`.

- כולם נגד כולם עד 15 שחקנים, ראשון ל־25 הריגות או 5 דקות. דו־קרב (ראשון ל־10) ו־2 נגד 2 (ראשון ל־15) מתחילים מלובי. בוטים ממלאים אימון וחדרים ציבוריים.
- שתים־עשרה דמויות (`shared/characters.js`). נשקים ב־`shared/weapons.js`: רובה סער, M4, ‏M16, ‏SMG, שוטגאן, צלף, אקדח, סכין, RPG.
- עשר מפות: עיר, מחסן ניאון, קניון, נמל, ג'ונגל, גג, בסיס, שלג, מפעל, עיירה.
- צניחה, רכבים, תיבות שלל ופריטים על המפה. תנועה כוללת החלקה, טיפוס ומשטחי קפיצה.
- צ'אט טקסט מסונן, הודעות מהירות, `/mute`, ‏`/unmute`, ‏`/report`. צ'אט קולי בלחיצה (V, או כפתור המיקרופון) עובר בין המכשירים ולא נשמר.
- שפות בלקוח: עברית, אנגלית, רוסית וערבית (`shared/i18n.js`).
- חדרי חברים בלי שרת המשחק הזה: פותחים חדר ומשתפים קוד בן 5 תווים או קישור `?join=`. המכשירים מתחברים ב־WebRTC. שירות PeerJS החינמי רק מציג אותם זה לזה. כשפותח החדר יוצא, החדר נסגר. יש רשתות שחוסמות חיבור ישיר.

### בניות נוספות

אתר סטטי (אימון וחדרי חברים, בלי שרת משחק בתוך הדף):

```bash
npm install
node tools/build-web.mjs [תיקיית-פלט]
```

תיקיית ברירת המחדל היא `../play`, ליד העותק המקומי. אתר GitHub Pages המפורסם הוא הכתובת בטבלה למעלה, לא תיקייה שנמצאת על הענף `main`.

Windows ‏(Electron):

```bash
cd desktop
npm install
npm run dist
```

פותחים את ה־zip מתוך `desktop/dist` ומריצים את `Drop Havoc.exe`. גרסת החבילה היא זו שב־`desktop/package.json` (נפרדת מתווית המשחק 0.16.42). כדי שהבנייה תציג שרת, מוסיפים אותו ל־`desktop/servers.json`. ‏F11 עובר למסך מלא.

אחרי שינוי בקוד, בונים מחדש את פרויקט האנדרואיד עם `android/build.sh` על Linux.

סקריפטים ל־Unity נמצאים ב־`unity/` ויש להם `unity/README.md` משלהם. הם לא משחק הדפדפן.

### קרדיטים ומסמכים

מודלים ורישיונות: `public/models/CREDITS.md`. קרדיט הסטודיו בלקוח: `shared/brand.js` (Scitedra Games, קישור לדף הסטודיו ב־GitHub Pages).

- `docs/PRODUCT_NAME.md` — השם הרשמי
- `docs/STORE_RELEASE.md` — מדריך חנויות, לא דף חי
- `docs/SERVER_SETUP.md` — אירוח
- `docs/ADMIN_GUIDE.md` — פקודות אדמין
- `docs/CHANGELOG.md` — הערות גרסה

</div>
