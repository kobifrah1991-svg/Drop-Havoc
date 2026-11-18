# הצעה: החלפת מפתח החתימה של בניית ה-sideload / debug

**זה מסמך החלטה בלבד.** שום מפתח לא הוחלף בשינוי הזה, לא נוצר מפתח חדש, וההיסטוריה של גיט לא נכתבה מחדש. ההחלטה היא של קובי.

English summary is at the bottom.

## מה קרה

ב-`android/build.sh` היו קשיחים שם הקובץ `android/arena-debug.keystore` והסיסמה `android` (גם ל-store וגם ל-key). קובץ ה-keystore עצמו היה במעקב של גיט. כל מי ששכפל את המאגר יכול לחתום APK ש-Android מתקין **מעל** התקנת sideload קיימת, כי החתימה זהה.

השינוי הנוכחי:

- הסקריפט קורא את הנתיב ואת הסיסמאות ממשתני סביבה או מ-`android/keystore.properties` מקומי.
- `android/keystore.properties` וקבצי `*.keystore` נמצאים ב-`.gitignore`.
- `android/arena-debug.keystore` הוסר מהמעקב (`git rm --cached`). העותק המקומי, אם קיים, נשאר על הדיסק. הוא **לא** נמחק מההיסטוריה.
- לא נוצר מפתח חדש ולא הוחלף מפתח קיים.

דוגמה בלי סודות: `android/keystore.properties.example`.

## מה זה לא

`android/build-aab.sh` חותם את חבילת Google Play במפתח העלאה (`UPLOAD_KEYSTORE`) שנשמר **מחוץ** לריפו. המסמך הזה לא נוגע בו.

לפני שמחליטים על Play צריך לוודא, אצל קובי, שמפתח ההעלאה ומפתח חתימת האפליקציה של Play **מעולם לא היו** `arena-debug.keystore`. אם הם נפרדים ולא דלפו, אין כאן אירוע Play. אם אי פעם העלו ל-Play APK/AAB חתום במפתח הזה, זה אירוע נפרד (איפוס upload key דרך התמיכה של Play). מפתח החתימה הסופי ש-Play App Signing מחזיק לא יוצא מ-Google.

## למה בכלל להחליף

המפתח הישן דלף. מי שמחזיק בו יכול להוציא עדכון sideload שנראה לטלפון כמו המשך רשמי של אותה התקנה. להפסיק לעקוב אחרי הקובץ לא מוחק עותקים שכבר ירדו, ולא מוחק את ה-blob מההיסטוריה הציבורית.

## אפשרויות (לבחור, לא לבצע מכאן)

1. **להמשיך עם המפתח הישן** כדי ששחקני sideload יוכלו להתקין עדכון בלי להסיר את המשחק. לא מומלץ: המפתח פומבי.
2. **מפתח חדש רק לבניית sideload/debug.** קובי מייצר אותו על המחשב שלו, שומר גיבוי, ולא מכניס אותו לגיט. התקנות ישנות לא יתעדכנו במקום (Android דוחה חתימה שונה). צריך להסיר את האפליקציה הישנה ולהתקין מחדש. מחיקה כזאת מוחקת גם את הנתונים המקומיים של האפליקציה, אלא אם יש גיבוי (חשבון Google במשחק, אם השמירה בענן כבר הייתה פעילה אצל אותו שחקן).
3. **Play.** אם המפתח שם נפרד ולא דלף — לא נוגעים בו. אם הוא דלף — קובי פונה ל-Play Console לאיפוס מפתח ההעלאה, לפי ההנחיות של Google. לא מנחשים את התהליך מתוך הריפו.
4. **מחיקת ההיסטוריה** (filter-repo / BFG ואז force-push). זה לא מחזיר שכפולים שכבר קיימים אצל אחרים, שובר ענפים פתוחים, ודורש תיאום. לא לעשות את זה כחלק מתיקון רגיל, ורק אם קובי מבקש במפורש.

## אם קובי מאשר החלפה של מפתח ה-sideload

1. על המחשב של קובי, מחוץ לריפו:
   `keytool -genkeypair -v -keystore drop-havoc-debug.keystore -alias arena -keyalg RSA -keysize 2048 -validity 10000`
   סיסמה ארוכה, שמורה במנהל סיסמאות, לא בקובץ בריפו ולא בצ'אט.
2. גיבוי של הקובץ במקום שרק קובי שולט בו. בלי הגיבוי אי אפשר להוציא עדכון לאותה חתימה.
3. `android/keystore.properties` מקומי (העתק של ה-example) או משתני הסביבה `DROP_HAVOC_KEYSTORE`, `DROP_HAVOC_KS_PASS`, `DROP_HAVOC_KEY_PASS`, `DROP_HAVOC_KEY_ALIAS`.
4. `bash android/build.sh` ואז בדיקה על מכשיר: התקנה נקייה עוברת; עדכון מעל APK ישן שנחתם במפתח הדלוף **אמור להיכשל**. זה הסימן שהרוטציה עבדה.
5. לכתוב לשחקני ה-sideload שצריך להסיר את הגרסה הישנה לפני ההתקנה החדשה.
6. לא להדפיס את הסיסמה בלוגים של CI, ולא להעביר אותה כארגומנט אם אפשר להימנע. הסקריפט מעביר אותה ל-apksigner דרך משתנה סביבה (`env:`), לא כטקסט קבוע בקובץ.
7. לא להשתמש במפתח החדש כמפתח ההעלאה של Play, ולהפך.

בניית Play (`build-aab.sh`) עדיין מריצה את `build.sh` כדי לארוז את קבצי המשחק, ולכן גם היא צריכה עכשיו keystore מקומי לשלב חתימת ה-APK שבסוף `build.sh`. מפתח ה-upload של ה-AAB נשאר `UPLOAD_KEYSTORE`.

## English

The debug keystore and the password `android` were committed. This change stops tracking the file and removes the hardcoded password. It does not generate a new key and does not rewrite history.

Kobi decides whether to rotate. Recommended if he wants sideload builds to stop being forgeable by anyone who cloned the repo: create a new keystore on his machine, reference it from an untracked `android/keystore.properties`, and accept that existing sideload installs must be uninstalled before the new APK will install. Leave the Play upload key alone unless it was this same leaked key. Purging git history is a separate, explicit decision and does not recall clones that already exist.
