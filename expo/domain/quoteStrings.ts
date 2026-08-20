/**
 * مصطلحات وثيقة مقترح السعر بلغتيها: العربية والعبرية.
 *
 * الوثيقة وحدها ثنائية اللغة (لا التطبيق) - زبائن المعرض بينهم متحدّثون
 * بالعبرية. تُترجَم **المصطلحات** الثابتة فقط؛ المحتوى الذي يُدخله المستخدم
 * (اسم الزبون، الغرف، الأقمشة، الملاحظة) يبقى كما كُتب. توسيع لاحق: أعمدة
 * `he_name` للمنتجات حين تُضاف عناصر جديدة تحتاج اسمًا عبريًا في الوثيقة.
 */
export type QuoteLang = 'ar' | 'he';

export type QuoteStrings = {
  quote: string;
  version: string;
  validUntil: string;
  issuedOn: string;
  customer: string;
  project: string;
  itemsCount: (n: number) => string;
  colIndex: string;
  colRoom: string;
  colDesc: string;
  colSize: string;
  colMeters: string;
  colUnit: string;
  colTotal: string;
  colWas: string;
  sumMeters: string;
  subtotal: string;
  listTotal: string;
  discount: string;
  afterDiscount: string;
  youSaved: string;
  vat: string;
  grandInclVat: string;
  grand: string;
  note: string;
  terms: string;
  thanks: string;
  city: string;
  sizeUnit: string;
  metersUnit: string;
  /** أسماء تصنيفات التسعير للعرض (مفتاحها `pricing_category`). */
  category: Record<string, string>;
};

const AR: QuoteStrings = {
  quote: 'عرض سعر',
  version: 'النسخة',
  validUntil: 'صالح حتى',
  issuedOn: 'تاريخ الإصدار',
  customer: 'الزبون',
  project: 'المشروع',
  itemsCount: (n) => `${n} بند`,
  colIndex: '#',
  colRoom: 'الغرفة والشباك',
  colDesc: 'الوصف',
  colSize: 'القياس',
  colMeters: 'الأمتار',
  colUnit: 'سعر المتر',
  colTotal: 'الإجمالي',
  colWas: 'قبل',
  sumMeters: 'مجموع الأمتار',
  subtotal: 'المجموع',
  listTotal: 'قبل الخصم',
  discount: 'الخصم',
  afterDiscount: 'المجموع بعد الخصم',
  youSaved: 'وفّرت',
  vat: 'الضريبة',
  grandInclVat: 'الإجمالي شامل الضريبة',
  grand: 'الإجمالي',
  note: 'ملاحظة',
  terms: 'الأسعار شاملة القياس والتركيب والتوصيل. التنفيذ يبدأ بعد اعتماد العرض ودفع الدفعة الأولى.',
  thanks: 'شكرًا لثقتكم',
  city: 'كفرمندا',
  sizeUnit: 'سم',
  metersUnit: 'م',
  category: {
    crepe_with_lining: 'كريب مع بطانة',
    crepe_without_lining: 'كريب بلا بطانة',
    other_with_lining: 'قماش مع بطانة',
    other_without_lining: 'قماش بلا بطانة',
  },
};

const HE: QuoteStrings = {
  quote: 'הצעת מחיר',
  version: 'גרסה',
  validUntil: 'בתוקף עד',
  issuedOn: 'תאריך הנפקה',
  customer: 'לקוח',
  project: 'פרויקט',
  itemsCount: (n) => `${n} פריטים`,
  colIndex: '#',
  colRoom: 'חדר וחלון',
  colDesc: 'תיאור',
  colSize: 'מידה',
  colMeters: 'מטרים',
  colUnit: 'מחיר למטר',
  colTotal: 'סה"כ',
  colWas: 'לפני',
  sumMeters: 'סה"כ מטרים',
  subtotal: 'סכום ביניים',
  listTotal: 'לפני הנחה',
  discount: 'הנחה',
  afterDiscount: 'סכום לאחר הנחה',
  youSaved: 'חסכת',
  vat: 'מע"מ',
  grandInclVat: 'סה"כ כולל מע"מ',
  grand: 'סה"כ',
  note: 'הערה',
  terms: 'המחירים כוללים מדידה, התקנה ומשלוח. הביצוע מתחיל לאחר אישור ההצעה ותשלום המקדמה.',
  thanks: 'תודה על האמון',
  city: 'כפר מנדא',
  sizeUnit: 'ס"מ',
  metersUnit: 'מ׳',
  category: {
    crepe_with_lining: 'קרפ עם בטנה',
    crepe_without_lining: 'קרפ ללא בטנה',
    other_with_lining: 'בד עם בטנה',
    other_without_lining: 'בד ללא בטנה',
  },
};

export const QUOTE_STRINGS: Record<QuoteLang, QuoteStrings> = { ar: AR, he: HE };

/** اسم المعرض الطباعي (لاتيني) - ثابتٌ على اللغتين كعلامة. */
export const BRAND_WORDMARK = 'Betak Design';
