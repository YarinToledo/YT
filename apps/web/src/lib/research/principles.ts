/** Reading notes turned into proposed rules (our own wording of ideas from "The Intelligent Investor"). */
export interface Principle { id: string; pages: string; title: { en: string; he: string }; body: { en: string; he: string }; rule: { en: string; he: string } }

export const PRINCIPLES: Principle[] = [
  {
    id: 'business', pages: '19–20',
    title: { en: 'A share is part of a business', he: 'מניה היא חלק בעסק' },
    body: { en: 'The price tells what the market offers. The business tells what we own: revenue, profitability, cash flow and competition.', he: 'המחיר מספר מה השוק מציע. העסק מספר מה אנחנו מחזיקים: הכנסות, רווחיות, תזרים ותחרות.' },
    rule: { en: 'Before deciding, write how the company makes money and what could hurt the business.', he: 'לפני החלטה נכתוב כיצד החברה מרוויחה ומה יכול לפגוע בעסק.' },
  },
  {
    id: 'value', pages: '19–20, 29–31',
    title: { en: 'Price is a fact. Value is an estimate.', he: 'מחיר הוא נתון. שווי הוא הערכה.' },
    body: { en: 'A great company can trade at a price that assumes an overly optimistic future. Test the assumptions already in the price.', he: 'חברה מצוינת יכולה להיסחר במחיר שמניח עתיד אופטימי מדי. נבחן את ההנחות שכבר משתקפות במחיר.' },
    rule: { en: 'Show a value range with assumptions, not a single unexplained number.', he: 'נציג טווח שווי והנחות, ולא מספר יחיד ללא הסבר.' },
  },
  {
    id: 'margin', pages: '19',
    title: { en: 'Leave room for error', he: 'להשאיר מקום לטעות' },
    body: { en: 'A margin of safety leaves room against the value estimate. Even the conservative estimate can turn out wrong.', he: 'שולי ביטחון משאירים מרווח מול אומדן הערך. גם ההערכה השמרנית יכולה להתברר כשגויה.' },
    rule: { en: 'Check the price against a conservative scenario. The margin does not guarantee the principal.', he: 'נבדוק את המחיר מול תרחיש שמרני. המרווח אינו מבטיח הגנה על הקרן.' },
  },
  {
    id: 'separate', pages: '39–43',
    title: { en: 'Know which decision you are making', he: 'לדעת איזו החלטה אנחנו מקבלים' },
    body: { en: 'Business analysis and trading on price moves need different frameworks. Holding period alone does not define an investment.', he: 'ניתוח עסקי ומסחר על תנועת מחיר דורשים מסגרות שונות. משך ההחזקה לבדו אינו מגדיר השקעה.' },
    rule: { en: 'Classify every decision up front, and record a new decision if the purpose of the holding changes.', he: 'נסווג כל החלטה מראש, ונתעד החלטה חדשה אם נשנה את מטרת ההחזקה.' },
  },
  {
    id: 'counter', pages: '33–38',
    title: { en: 'Make room for the counter-argument', he: 'לתת מקום לטיעון הנגדי' },
    body: { en: 'Profit can build confidence even when the process is flawed. Independent thinking means weighing evidence even when it is uncomfortable.', he: 'רווח יכול לחזק ביטחון גם כשהתהליך לקוי. עצמאות מחשבתית דורשת לבחון את הראיות גם כשהן אינן נוחות.' },
    rule: { en: 'Write what could disprove the thesis before choosing an action.', he: 'נכתוב מה עשוי להפריך את התזה, לפני שנבחר פעולה.' },
  },
  {
    id: 'patience', pages: '36–38, 49–54',
    title: { en: 'Waiting is also a decision', he: 'גם המתנה היא החלטה' },
    body: { en: 'There is no need to act on every headline or price move. Weigh the decision against the goal and the information available.', he: 'אין חובה לפעול בעקבות כל כותרת או שינוי מחיר. נבחן את ההחלטה מול המטרה והמידע הזמין.' },
    rule: { en: 'When information is lacking, keep it on watch with a clear condition for checking again.', he: 'כשאין מספיק מידע, נשמור למעקב עם תנאי ברור לבדיקה חוזרת.' },
  },
]
