# עדכונים בתוך המשחק — Drop Havoc

## מה קורה בפועל
1. בכל כניסה לתפריט הראשי הלקוח טוען `version.json` מאותו מקור (עם `?t=` כדי לעקוף מטמון).
2. משווים ל־`APP_VERSION` ב־`shared/app-version.js` (חייב להתאים ל־`package.json` ולתווית ALPHA בתפריט).
3. אם השרת מפרסם גרסה חדשה יותר — מופיעה באנר **"יש עדכון חדש"** עם הערות הגרסה, הגרסה הנוכחית והחדשה.
4. **עדכן עכשיו**:
   - **Web**: מנקה Cache Storage ומרענן את הדף לכתובת הערוץ (`channels.web`).
   - **Android / Desktop** (APK / אפליקציה עם `ARENA_OFFLINE`): פותח את קישור ההורדה מ־`channels.android` / `channels.desktop` (למשל APK או דף ההורדות).
5. **מאוחר יותר**: מסתיר את הבאנר עד סוף הסשן (`sessionStorage`).

## איך מפרסמים עדכון
1. מעלים את `APP_VERSION` ב־`shared/app-version.js`, ב־`package.json`, וב־`public/version.json` (אותו מספר).
2. מעדכנים את `notes` (he/en/ru/ar) ואת קישורי `channels` אם צריך.
3. פורסים את האתר/APK. שחקנים עם בנייה ישנה יראו את הבאנר אוטומטית.

## קבצים
- `public/update-check.js` — לוגיקת הבדיקה והבאנר
- `public/version.json` — מטא־דאטה של הגרסה האחרונה
- `shared/app-version.js` — גרסת הבנייה הנוכחית
- מפתחות i18n: `update.title` / `update.download` / `update.later` / `update.current`
