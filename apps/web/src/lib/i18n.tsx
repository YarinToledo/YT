import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'he'
const KEY = 'tradepilot-lang'

/**
 * English source text → Hebrew. English is the key, so untranslated strings fall back to English.
 * Placeholders use {name}.
 */
const HE: Record<string, string> = {
  // Navigation / layout
  'Overview': 'סקירה',
  'Portfolio Overview': 'סקירת תיק',
  'Open Positions': 'פוזיציות פתוחות',
  'Trade Journal': 'יומן מסחר',
  'Market Watch': 'רשימת מעקב',
  'Risk Management': 'ניהול סיכונים',
  'Analytics': 'ניתוח ביצועים',
  'Settings': 'הגדרות',
  'WORKSPACE': 'סביבת עבודה',
  'MANAGEMENT': 'ניהול',
  'PERSONAL TRADING DESK': 'שולחן מסחר אישי',
  'PERSONAL TRADING TERMINAL': 'מסוף מסחר אישי',
  'DEMO MODE': 'מצב דמו',
  'DEMO DATA · STORED IN THIS BROWSER': 'נתוני דמו · שמורים בדפדפן הזה',
  'MANUAL ENTRY · NO BROKER CONNECTED': 'הזנה ידנית · ללא חיבור לברוקר',
  'Open menu': 'פתח תפריט',
  'Demo user': 'משתמש דמו',
  'Could not load data: {msg}': 'טעינת הנתונים נכשלה: {msg}',
  'Loading…': 'טוען…',
  'Language': 'שפה',

  // Metrics
  'Portfolio equity': 'הון התיק',
  'Started at {v}': 'התחלה: {v}',
  'Total P&L': 'רווח/הפסד כולל',
  '{v} return · realized': 'תשואה {v} · ממומש',
  'Win rate': 'אחוז הצלחה',
  '{w}W · {l}L · {c} closed': '{w} רווח · {l} הפסד · {c} סגורים',
  'Open positions': 'פוזיציות פתוחות',
  'Maximum {n} positions': 'מקסימום {n} פוזיציות',

  // Overview / positions
  'Open and planned trades · manual entry': 'עסקאות פתוחות ומתוכננות · הזנה ידנית',
  '＋ New trade': '＋ עסקה חדשה',
  'Open': 'פתוחות',
  'Planned': 'מתוכננות',
  '{n} live positions': '{n} פוזיציות פעילות',
  '1 live position': 'פוזיציה פעילה אחת',
  'Sized and waiting for entry': 'מחושבות וממתינות לכניסה',
  'No open or planned positions. Use the trade planner to size your next trade.': 'אין פוזיציות פתוחות או מתוכננות. השתמש במתכנן העסקאות כדי לחשב את העסקה הבאה.',
  'Instrument': 'נייר',
  'Direction': 'כיוון',
  'Entry': 'כניסה',
  'Stop loss': 'סטופ לוס',
  'Take profit': 'יעד רווח',
  'Qty': 'כמות',
  'Risk': 'סיכון',
  'R:R': 'סיכוי:סיכון',
  'Status': 'סטטוס',
  'Actions': 'פעולות',
  'Opened {d}': 'נפתחה {d}',
  'Planned {d}': 'תוכננה {d}',
  'Record the fill': 'רשום את הביצוע',
  'Edit': 'עריכה',
  'Cancel': 'ביטול',
  'Close': 'סגירה',
  'Delete': 'מחיקה',
  'Cancel the planned {s} trade?': 'לבטל את העסקה המתוכננת ב-{s}?',
  'Weekly loss limit reached': 'הגעת למגבלת ההפסד השבועית',
  'Daily loss limit reached': 'הגעת למגבלת ההפסד היומית',
  'Maximum open positions reached': 'הגעת למספר הפוזיציות הפתוחות המרבי',

  // Enums
  'LONG': 'לונג',
  'SHORT': 'שורט',
  'OPEN': 'פתוחה',
  'PLANNED': 'מתוכננת',
  'CLOSED': 'סגורה',
  'CANCELLED': 'בוטלה',

  // Equity chart
  'Equity Performance': 'ביצועי ההון',
  'Realized equity · {n}-day change {v}': 'הון ממומש · שינוי ב-{n} ימים {v}',
  '{n}D': '{n} ימים',
  'start {v}': 'התחלה {v}',
  'Equity over the last {n} days, from {a} to {b}': 'הון ב-{n} הימים האחרונים, מ-{a} ל-{b}',

  // Risk panel
  'Risk Control': 'בקרת סיכון',
  'Live usage': 'ניצול נוכחי',
  'Open risk · {a}/{b} positions': 'סיכון פתוח · {a}/{b} פוזיציות',
  'Daily loss · limit {v}%': 'הפסד יומי · מגבלה {v}%',
  'Weekly loss · limit {v}%': 'הפסד שבועי · מגבלה {v}%',
  'Avg planned R:R · minimum {v}': 'יחס סיכוי:סיכון ממוצע · מינימום {v}',
  'Weekly loss limit reached. Opening new positions is blocked until the week resets.': 'הגעת למגבלת ההפסד השבועית. פתיחת פוזיציות חדשות חסומה עד תחילת השבוע הבא.',
  'Daily loss limit reached. Opening new positions is blocked until the day resets.': 'הגעת למגבלת ההפסד היומית. פתיחת פוזיציות חדשות חסומה עד מחר.',
  'Risk per trade: {p}% of equity = {v}. Limits are enforced when you open positions in TradePilot.': 'סיכון לעסקה: {p}% מההון = {v}. המגבלות נאכפות כשפותחים פוזיציות ב-TradePilot.',

  // Activity
  'Recent Activity': 'פעילות אחרונה',
  'LATEST': 'אחרונים',
  '{s} {d} planned': '{s} {d} תוכננה',
  '{s} position opened': 'פוזיציה ב-{s} נפתחה',
  '{s} closed': '{s} נסגרה',
  '{s} cancelled': '{s} בוטלה',
  'Exit {v} · {d}': 'יציאה {v} · {d}',
  'Portfolio initialized': 'התיק נפתח',
  'Starting balance · {v}': 'יתרת פתיחה · {v}',

  // Planner
  'Trade Planner': 'מתכנן עסקאות',
  'Position sizing · {p}% of {v}': 'גודל פוזיציה · {p}% מתוך {v}',
  'RISK-BASED': 'לפי סיכון',
  'Symbol': 'סימול',
  'Setup': 'סטאפ',
  'Optional': 'אופציונלי',
  'Entry price ($)': 'מחיר כניסה ($)',
  'Stop loss ($)': 'סטופ לוס ($)',
  'Target price ($)': 'מחיר יעד ($)',
  'Position size:': 'גודל פוזיציה:',
  '{n} shares': '{n} מניות',
  'Value:': 'שווי:',
  'Risk:': 'סיכון:',
  'Reward:': 'רווח פוטנציאלי:',
  'R:R {v} is below your {m} minimum. Save anyway?': 'יחס {v} נמוך מהמינימום שלך ({m}). לשמור בכל זאת?',
  'Enter a valid symbol (letters, digits, dots, dashes).': 'הזן סימול תקין (אותיות, ספרות, נקודות, מקפים).',
  'R:R is below your {m} minimum.': 'יחס סיכוי:סיכון נמוך מהמינימום שלך ({m}).',
  'Position value exceeds account equity — this would need margin.': 'שווי הפוזיציה גבוה מההון בחשבון. זה ידרוש מרג\'ין.',
  '{reason}. You can still save the trade as planned.': '{reason}. עדיין אפשר לשמור את העסקה כמתוכננת.',
  'Save as planned': 'שמור כמתוכננת',
  'Open position now': 'פתח פוזיציה עכשיו',
  'Enter entry, stop and target prices.': 'הזן מחיר כניסה, סטופ ויעד.',
  'Account equity is zero or negative.': 'ההון בחשבון אפס או שלילי.',
  'Risk budget ({v}) is too small for one share at this stop distance.': 'תקציב הסיכון ({v}) קטן מדי למניה אחת במרחק הסטופ הזה.',

  // Validation (mirrors calc/validate English messages)
  'Symbol must be 1–12 letters, digits, dots or dashes.': 'סימול חייב להכיל 1–12 אותיות, ספרות, נקודות או מקפים.',
  'Entry price must be positive.': 'מחיר הכניסה חייב להיות חיובי.',
  'Stop loss must be positive.': 'הסטופ לוס חייב להיות חיובי.',
  'Quantity must be positive.': 'הכמות חייבת להיות חיובית.',
  'Fees cannot be negative.': 'עמלות לא יכולות להיות שליליות.',
  'For a LONG, the stop must be below entry.': 'בלונג, הסטופ חייב להיות מתחת למחיר הכניסה.',
  'For a SHORT, the stop must be above entry.': 'בשורט, הסטופ חייב להיות מעל מחיר הכניסה.',
  'Target must be positive.': 'היעד חייב להיות חיובי.',
  'For a LONG, the target must be above entry.': 'בלונג, היעד חייב להיות מעל מחיר הכניסה.',
  'For a SHORT, the target must be below entry.': 'בשורט, היעד חייב להיות מתחת למחיר הכניסה.',
  'An open trade needs an open time.': 'עסקה פתוחה צריכה זמן פתיחה.',
  'Enter the exit price.': 'הזן מחיר יציאה.',
  'A closed trade needs open and close times.': 'עסקה סגורה צריכה זמן פתיחה וזמן סגירה.',
  'Close time is before open time.': 'זמן הסגירה מוקדם מזמן הפתיחה.',

  // Trade dialog
  'Open {s}': 'פתיחת {s}',
  'Close {s}': 'סגירת {s}',
  'Edit {s}': 'עריכת {s}',
  'Record your actual fill.': 'רשום את מחיר הביצוע בפועל.',
  'Record the exit to realize P&L.': 'רשום את היציאה כדי לממש את הרווח/הפסד.',
  'Correct any detail of this trade.': 'תקן כל פרט בעסקה.',
  'Company': 'חברה',
  'Fill price ($)': 'מחיר ביצוע ($)',
  'Entry ($)': 'כניסה ($)',
  'Quantity': 'כמות',
  'Target ($)': 'יעד ($)',
  'Opened at': 'נפתחה ב-',
  'Exit price ($)': 'מחיר יציאה ($)',
  'Closed at': 'נסגרה ב-',
  'Fees ($)': 'עמלות ($)',
  'Breakout, pullback…': 'פריצה, תיקון…',
  'Notes': 'הערות',
  'What went right or wrong?': 'מה עבד ומה לא?',
  'Entry {v} × {q}': 'כניסה {v} × {q}',
  'Realized P&L': 'רווח/הפסד ממומש',
  'Saving…': 'שומר…',
  'Open position': 'פתח פוזיציה',
  'Close trade': 'סגור עסקה',
  'Save changes': 'שמור שינויים',

  // Journal
  'All': 'הכל',
  'Search symbol or setup': 'חיפוש לפי סימול או סטאפ',
  'Export CSV': 'ייצוא CSV',
  'No trades match.': 'אין עסקאות מתאימות.',
  'Date': 'תאריך',
  'Dir': 'כיוון',
  'Exit': 'יציאה',
  'P&L': 'רווח/הפסד',
  'R': 'R',
  'Permanently delete this {s} trade? This cannot be undone.': 'למחוק לצמיתות את העסקה ב-{s}? אי אפשר לבטל את זה.',
  'Delete {s} trade': 'מחק עסקה ב-{s}',

  // Market watch
  'Watchlist': 'רשימת מעקב',
  'No market data provider connected · prices are not shown': 'אין חיבור לספק נתוני שוק · מחירים לא מוצגים',
  'Your watchlist is empty.': 'רשימת המעקב ריקה.',
  'Note': 'הערה',
  'Trades': 'עסקאות',
  'Added': 'נוסף',
  'Plan trade': 'תכנן עסקה',
  'Remove': 'הסר',
  'Add to watchlist': 'הוספה לרשימת המעקב',
  'What are you waiting for?': 'למה אתה מחכה?',
  'Add symbol': 'הוסף סימול',
  'Enter a valid symbol.': 'הזן סימול תקין.',

  // Risk / settings
  'Risk framework': 'מסגרת סיכון',
  'Percentages of current equity ({v})': 'אחוזים מההון הנוכחי ({v})',
  'Risk per trade (%)': 'סיכון לעסקה (%)',
  'Sizes every position in the planner.': 'קובע את גודל כל פוזיציה במתכנן.',
  'Minimum reward : risk': 'יחס סיכוי:סיכון מינימלי',
  'Planner warns below this.': 'המתכנן מזהיר מתחת לערך הזה.',
  'Daily loss limit (%)': 'מגבלת הפסד יומית (%)',
  'Blocks opening positions once hit.': 'חוסם פתיחת פוזיציות כשמגיעים אליה.',
  'Weekly loss limit (%)': 'מגבלת הפסד שבועית (%)',
  'Week starts Monday.': 'השבוע מתחיל ביום שני.',
  'Max open positions': 'מקסימום פוזיציות פתוחות',
  'Save': 'שמור',
  '{f} must be between {a} and {b}.': '{f} חייב להיות בין {a} ל-{b}.',
  '{f} must be at least {a}.': '{f} חייב להיות לפחות {a}.',
  '{f} must be between {a} and {b} and above 0.': '{f} חייב להיות בין {a} ל-{b} וגדול מ-0.',
  '{f} must be at least {a} and above 0.': '{f} חייב להיות גדול מ-0.',
  'Max open positions must be a whole number.': 'מספר הפוזיציות המרבי חייב להיות מספר שלם.',
  'Account': 'חשבון',
  'Equity = starting capital + realized P&L': 'הון = הון התחלתי + רווח/הפסד ממומש',
  'Starting capital ($)': 'הון התחלתי ($)',
  'Change this if you deposit or withdraw.': 'עדכן כשאתה מפקיד או מושך כסף.',
  'Allow fractional shares in position sizing': 'לאפשר שברי מניות בחישוב גודל הפוזיציה',
  'Data': 'נתונים',
  'Export trades (CSV)': 'ייצוא עסקאות (CSV)',
  'Reset demo data': 'איפוס נתוני דמו',
  'Erase all demo data in this browser and restore the sample trades?': 'למחוק את כל נתוני הדמו בדפדפן ולשחזר את עסקאות הדוגמה?',
  'Session': 'חיבור',
  'Mode': 'מצב',
  'Demo · browser storage': 'דמו · אחסון בדפדפן',
  'Signed in as': 'מחובר בתור',
  'Trades stored': 'עסקאות שמורות',
  'Market data': 'נתוני שוק',
  'Broker': 'ברוקר',
  'Not connected': 'לא מחובר',
  'Demo mode stores data only in this browser. Add your Supabase URL and anon key to apps/web/.env to sync across devices.': 'במצב דמו הנתונים נשמרים רק בדפדפן הזה. הוסף את כתובת Supabase ומפתח ה-anon לקובץ apps/web/.env כדי לסנכרן בין מכשירים.',
  'Sign out': 'התנתק',

  // Analytics
  'Net realized P&L': 'רווח/הפסד נקי ממומש',
  '{n} closed trades': '{n} עסקאות סגורות',
  '{w} wins · {l} losses': '{w} רווחים · {l} הפסדים',
  'Profit factor': 'פקטור רווח',
  'Gross profit ÷ gross loss': 'רווח ברוטו ÷ הפסד ברוטו',
  'Expectancy': 'תוחלת',
  'Average P&L per trade': 'רווח/הפסד ממוצע לעסקה',
  'Average R': 'R ממוצע',
  'P&L ÷ initial risk': 'רווח/הפסד ÷ סיכון התחלתי',
  'Average win': 'רווח ממוצע',
  'Best {v}': 'הטוב ביותר {v}',
  'Average loss': 'הפסד ממוצע',
  'Worst {v}': 'הגרוע ביותר {v}',
  'Gross profit / loss': 'רווח / הפסד ברוטו',
  'Loss {v}': 'הפסד {v}',
  'By symbol': 'לפי סימול',
  'By setup': 'לפי סטאפ',
  'By direction': 'לפי כיוון',
  'Untagged': 'ללא תיוג',
  'No closed trades yet.': 'עדיין אין עסקאות סגורות.',
  'Avg R': 'R ממוצע',
  'Net P&L': 'רווח/הפסד נקי',

  // Login
  'Email': 'אימייל',
  'Password': 'סיסמה',
  'Signing in…': 'מתחבר…',
  'Sign in': 'התחברות',
  'Single-user app. Create your login in Supabase → Authentication → Users.': 'אפליקציה למשתמש יחיד. יוצרים משתמש ב-Supabase ← Authentication ← Users.',


  'Reward : risk (1:X)': 'יחס סיכוי:סיכון (1:X)',
  'Manual target': 'יעד ידני',
  'Target is calculated from this ratio': 'היעד מחושב לפי היחס הזה',
  'Empty = enter target manually': 'ריק = מזינים יעד ידנית',
  'Risk per trade must be between 0 and 100%.': 'הסיכון לעסקה חייב להיות בין 0 ל-100%.',
  'Risk {p}% is above your default {d}% for this trade.': 'סיכון {p}% בעסקה הזו גבוה מברירת המחדל שלך ({d}%).',

  'Prices are not available in demo mode': 'מחירים לא זמינים במצב דמו',
  'Could not load prices: {msg}': 'טעינת המחירים נכשלה: {msg}',
  'Prices from Financial Modeling Prep · updated {d}': 'מחירים מ-Financial Modeling Prep · עודכן ב-{d}',
  'Loading prices…': 'טוען מחירים…',
  'Refreshing…': 'מרענן…',
  'Refresh prices': 'רענן מחירים',
  'Today': 'היום',

  // AI analyst
  'AI analyst recommendation': 'המלצת סוכן AI',
  'Claude reviews the data above plus recent news, then recommends using your risk settings': 'Claude בוחן את הנתונים, מחפש חדשות עדכניות וממליץ לפי הגדרות הסיכון שלך',
  'Get AI recommendation': 'קבל המלצת AI',
  'Run again': 'הרץ שוב',
  'The analyst is reading the data and searching for news. This can take up to a minute.': 'הסוכן קורא את הנתונים ומחפש חדשות. זה יכול לקחת עד דקה.',
  'Each run costs a few cents on your Anthropic account.': 'כל הרצה עולה כמה סנטים בחשבון Anthropic שלך.',
  'Enter long': 'כניסה ללונג',
  'Wait for a setup': 'להמתין לסטאפ',
  'Avoid': 'להימנע',
  'Low confidence': 'ביטחון נמוך',
  'Medium confidence': 'ביטחון בינוני',
  'High confidence': 'ביטחון גבוה',
  'Reasons for': 'סיבות בעד',
  'Reasons against': 'סיבות נגד',
  'Recommended trade for you': 'העסקה המומלצת עבורך',
  'Entry trigger:': 'תנאי כניסה:',
  'The analyst does not recommend a trade right now.': 'הסוכן לא ממליץ על עסקה כרגע.',
  'Recent news': 'חדשות אחרונות',
  'Key risks': 'סיכונים עיקריים',
  'Upcoming catalysts': 'זרזים קרובים',
  'Sources:': 'מקורות:',
  'Generated {d} by {m}. AI can be wrong; this is decision support, not investment advice. The decision is yours.': 'נוצר ב-{d} על ידי {m}. AI יכול לטעות. זה כלי לתמיכה בהחלטה, לא ייעוץ השקעות, וההחלטה שלך.',
  'ANTHROPIC_API_KEY secret is not set in Supabase': 'המפתח ANTHROPIC_API_KEY לא מוגדר ב-Supabase',
  'The AI declined this request': 'ה-AI סירב לבקשה',

  // Stock analysis
  'Stock Analysis': 'ניתוח מניה',
  'Analyze': 'נתח',
  'Analyzing…': 'מנתח…',
  'Symbol, e.g. NVDA': 'סימול, למשל NVDA',
  'Technical and fundamental data from Financial Modeling Prep. This is automated analysis for learning and planning, not investment advice.': 'נתונים טכניים ופונדמנטליים מ-Financial Modeling Prep. זה ניתוח אוטומטי ללמידה ולתכנון, לא ייעוץ השקעות.',
  'Could not analyze {s}: {msg}': 'לא הצלחתי לנתח את {s}: {msg}',
  'Loading market data…': 'טוען נתוני שוק…',
  'Stock analysis needs the Supabase connection (it is not available in demo mode).': 'ניתוח מניה דורש חיבור ל-Supabase (לא זמין במצב דמו).',
  'Sign in required': 'צריך להתחבר',
  'FMP_API_KEY secret is not set in Supabase': 'המפתח FMP_API_KEY לא מוגדר ב-Supabase',
  'Invalid symbol': 'סימול לא תקין',
  'Market cap': 'שווי שוק',
  'Beta': 'בטא',
  '52-week range': 'טווח 52 שבועות',
  'No price history available.': 'אין היסטוריית מחירים.',
  'Price chart': 'גרף מחיר',
  'Price': 'מחיר',
  '20-day average': 'ממוצע 20 יום',
  '50-day average': 'ממוצע 50 יום',
  '200-day average': 'ממוצע 200 יום',
  'Technical analysis': 'ניתוח טכני',
  'Daily bars · computed from price history': 'נרות יומיים · מחושב מהיסטוריית המחיר',
  'Not enough price history for technical analysis.': 'אין מספיק היסטוריית מחירים לניתוח טכני.',
  'Bullish': 'חיובי',
  'Bearish': 'שלילי',
  'Neutral': 'ניטרלי',
  'Trend': 'מגמה',
  'Uptrend': 'מגמת עלייה',
  'Downtrend': 'מגמת ירידה',
  'Sideways': 'דשדוש',
  'ATR (14) · daily range': 'ATR (14) · טווח יומי',
  'Nearest support': 'תמיכה קרובה',
  'Nearest resistance': 'התנגדות קרובה',
  '1M': 'חודש',
  '3M': '3 חודשים',
  '6M': '6 חודשים',
  '1Y': 'שנה',
  'Price above the 200-day average (long-term uptrend)': 'המחיר מעל ממוצע 200 יום (מגמת עלייה ארוכת טווח)',
  'Price below the 200-day average (long-term downtrend)': 'המחיר מתחת לממוצע 200 יום (מגמת ירידה ארוכת טווח)',
  'Price above the 50-day average': 'המחיר מעל ממוצע 50 יום',
  'Price below the 50-day average': 'המחיר מתחת לממוצע 50 יום',
  '50-day average above the 200-day (golden cross structure)': 'ממוצע 50 מעל ממוצע 200 (מבנה "צלב זהב")',
  '50-day average below the 200-day (death cross structure)': 'ממוצע 50 מתחת לממוצע 200 (מבנה "צלב מוות")',
  '50-day average is rising': 'ממוצע 50 יום עולה',
  '50-day average is falling': 'ממוצע 50 יום יורד',
  'RSI {v}: overbought, pullback risk': 'RSI {v}: קנוי יתר, סיכון לתיקון',
  'RSI {v}: oversold, bounce possible': 'RSI {v}: מכור יתר, ייתכן ריבאונד',
  'RSI {v}: neutral momentum': 'RSI {v}: מומנטום ניטרלי',
  'MACD just crossed above its signal line': 'MACD חצה עכשיו מעל קו הסיגנל',
  'MACD just crossed below its signal line': 'MACD חצה עכשיו מתחת לקו הסיגנל',
  'MACD above its signal line (positive momentum)': 'MACD מעל קו הסיגנל (מומנטום חיובי)',
  'MACD below its signal line (negative momentum)': 'MACD מתחת לקו הסיגנל (מומנטום שלילי)',
  'Trading near the 52-week high': 'נסחרת ליד שיא 52 שבועות',
  'Trading near the 52-week low': 'נסחרת ליד שפל 52 שבועות',
  'Volume {v}× above average in the last 5 days': 'מחזור פי {v} מהממוצע ב-5 הימים האחרונים',
  'Fundamental analysis': 'ניתוח פונדמנטלי',
  'Trailing twelve months · annual reports': '12 חודשים אחרונים · דוחות שנתיים',
  'No fundamental data available for this symbol.': 'אין נתונים פונדמנטליים לסימול הזה.',
  'Gross margin': 'שולי רווח גולמי',
  'Operating margin': 'שולי רווח תפעולי',
  'Net margin': 'שולי רווח נקי',
  'Return on equity': 'תשואה על ההון',
  'Debt / equity': 'חוב / הון',
  'Current ratio': 'יחס שוטף',
  'Dividend yield': 'תשואת דיבידנד',
  'Free cash flow yield': 'תשואת תזרים חופשי',
  'Year': 'שנה',
  'Revenue': 'הכנסות',
  'Net income': 'רווח נקי',
  'Negative earnings (no meaningful P/E)': 'רווח שלילי (אין מכפיל רווח משמעותי)',
  'P/E {v}: low valuation': 'מכפיל רווח {v}: תמחור נמוך',
  'P/E {v}: high valuation, needs strong growth': 'מכפיל רווח {v}: תמחור גבוה, דורש צמיחה חזקה',
  'P/E {v}: moderate valuation': 'מכפיל רווח {v}: תמחור סביר',
  'Net margin {v}: highly profitable': 'שולי רווח נקי {v}: רווחיות גבוהה',
  'Net margin {v}: losing money': 'שולי רווח נקי {v}: החברה מפסידה',
  'Net margin {v}': 'שולי רווח נקי {v}',
  'Revenue grew {v} last year': 'ההכנסות צמחו ב-{v} בשנה האחרונה',
  'Revenue shrank {v} last year': 'ההכנסות ירדו ב-{v} בשנה האחרונה',
  'Return on equity {v}: efficient use of capital': 'תשואה על ההון {v}: שימוש יעיל בהון',
  'Return on equity {v}': 'תשואה על ההון {v}',
  'Debt/equity {v}: heavily leveraged': 'חוב/הון {v}: מינוף גבוה',
  'Current ratio {v}: short-term liabilities exceed current assets': 'יחס שוטף {v}: ההתחייבויות לטווח קצר גבוהות מהנכסים השוטפים',
  'Trade scenario (long)': 'תרחיש עסקה (לונג)',
  'Stop under nearest support (or 2×ATR) · target at your {rr} ratio · risk {p}% of equity': 'סטופ מתחת לתמיכה הקרובה (או 2×ATR) · יעד לפי היחס שלך {rr} · סיכון {p}% מההון',
  'Resistance at {v} sits before the target; price has to break it.': 'יש התנגדות ב-{v} לפני היעד. המחיר יצטרך לפרוץ אותה.',
  'Target': 'יעד',
  'The technical picture is bearish. A long trade here goes against the trend.': 'התמונה הטכנית שלילית. עסקת לונג כאן היא נגד המגמה.',
  'Send to trade planner': 'העבר למתכנן העסקאות',
  'About the business': 'על העסק',
  'Sector': 'סקטור',
  'Industry': 'תעשייה',
  'Country': 'מדינה',
  'Employees': 'עובדים',
  'Website': 'אתר',
  'Related stocks': 'מניות קשורות',
  'Peers in the same sector and industry': 'חברות מקבילות באותו סקטור ותעשייה',
  'No peer data available.': 'אין נתונים על חברות מקבילות.',
  'Some data was unavailable: {list}': 'חלק מהנתונים לא היו זמינים: {list}',
  'Data as of {d}': 'נתונים נכון ל-{d}',

  // Toasts
  'Settings saved': 'ההגדרות נשמרו',
  'Trade updated': 'העסקה עודכנה',
  'Trade deleted': 'העסקה נמחקה',
  '{s} saved as planned': '{s} נשמרה כמתוכננת',
  '{s} added to watchlist': '{s} נוספה לרשימת המעקב',
  '{s} removed': '{s} הוסרה',
  'Error: {msg}': 'שגיאה: {msg}',
}

type Vars = Record<string, string | number>
export type T = (text: string, vars?: Vars) => string

function fill(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}

/** Current language for non-React code (formatters). Kept in sync by LangProvider. */
let current: Lang = initialLang()
export const getLang = () => current

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'he') return saved
  } catch { /* storage unavailable */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('he') ? 'he' : 'en'
}

export function translate(lang: Lang, text: string, vars?: Vars) {
  if (lang === 'he') {
    const direct = HE[text]
    if (direct) return fill(direct, vars)
    // Dynamic message from calc.ts: "Risk budget ($12.34) is too small…"
    const m = /^Risk budget \((.+)\) is too small/.exec(text)
    if (m) return fill(HE['Risk budget ({v}) is too small for one share at this stop distance.'], { v: m[1] })
  }
  return fill(text, vars)
}

interface LangCtx { lang: Lang; setLang(l: Lang): void; t: T }
const Ctx = createContext<LangCtx | null>(null)

function apply(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current)
  // Apply before children render so formatters see the right language.
  if (current !== lang) current = lang
  useEffect(() => { apply(lang) }, [lang])
  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
    setLangState(l)
  }, [])
  const value = useMemo<LangCtx>(() => ({ lang, setLang, t: (s, v) => translate(lang, s, v) }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLang outside LangProvider')
  return c
}

export const useT = () => useLang().t

export function LangToggle() {
  const { lang, setLang, t } = useLang()
  return (
    <button type="button" className="lang-toggle" aria-label={t('Language')} onClick={() => setLang(lang === 'he' ? 'en' : 'he')}>
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  )
}
