# שם המוצר / Product name

**השם הרשמי: Drop Havoc / דרופ האבוק** — זה השם היחיד של המשחק.

- "Arena Rush" / "ארנה ראש" **הוצא משימוש** ואסור שיופיע בממשק, בדף החנות (Google Play / Steam), באתר או בחומרי שיווק.
- Official name: **Drop Havoc** (Hebrew: דרופ האבוק). "Arena Rush" is retired and must not appear in UI, store listings, or marketing.

## שאריות טכניות מכוונות (לא מוצגות למשתמש)
- `com.arenarush.game` — applicationId ב-Android וב-Electron. שינוי שלו יוצר אפליקציה חדשה (ההתקנה הקיימת לא תתעדכן). לשנות ל-`com.scitedragames.drophavoc` לפני ההעלאה הראשונה ל-Google Play.
- `android/src/com/arenarush/game/` — נתיב חבילת Java התואם ל-applicationId.
- הריפו שונה ל-Drop-Havoc (31.10.2026); GitHub מפנה אוטומטית מהנתיב הישן. מזהים פנימיים בלבד: com.arenarush.game, arena-rush:accounts.
- `arena-rush:accounts` ב-economy.js — מפתח אחסון; שינוי ימחק חשבונות קיימים.
- `arena-debug.keystore` — מפתח debug לחתימה.
