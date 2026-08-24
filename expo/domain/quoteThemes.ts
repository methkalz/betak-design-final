/**
 * قوالب وثيقة عرض السعر - ثمانية تصاميم على أسس التصميم التجاريّ المحترف.
 *
 * ## المرجعيّة
 *
 * بعد نقدَي المالك (الأوّل: «تغييرٌ بالألوان»، والثاني: «لا تمتّ للاحترافيّة»)
 * بُنيت هذه على أفضل ممارسات تصميم الفواتير وعروض الأسعار المنشورة، وخلاصتها:
 *
 * - **لونٌ واحد يُستعمل باعتدال**: في العلامة والتسميات والإجمالي - والباقي
 *   حبرٌ داكن على أبيض.
 * - **الإجمالي أكبرُ رقمٍ في الورقة** - هو بطل الصفحة.
 * - **خطوطٌ شعريّة ومساحات، لا صناديق**: الفخامة من الفراغ لا من الأُطر.
 * - **الشخصيّة من إيماءةٍ واحدة**: شريطٌ داكن، أو لوحٌ جانبيّ، أو رقمٌ
 *   طباعيّ كبير - لا زخارف متراكمة.
 *
 * ما سقط عمدًا من المحاولة السابقة: المثلّثات والفسيفساء وعلامات الأركان -
 * زخارف تُضعف الثقة ولا تبنيها.
 */
import { palette } from '@/constants/theme';
import type { LayoutId } from '@/domain/quoteLayouts';

export const QUOTE_TEMPLATES = [
  'onyx', 'swiss', 'panel', 'linen', 'ink', 'azure', 'atelier', 'ledger',
  'seal', 'weave', 'curve', 'folds',
] as const;

export type QuoteTemplate = (typeof QUOTE_TEMPLATES)[number];

export const DEFAULT_TEMPLATE: QuoteTemplate = 'onyx';

/** يقبل أيّ نصّ ويعيد قالبًا صالحًا - الخادم قد يحمل قيمةً من نسخةٍ أحدث. */
export function asTemplate(value: unknown): QuoteTemplate {
  return QUOTE_TEMPLATES.includes(value as QuoteTemplate)
    ? (value as QuoteTemplate)
    : DEFAULT_TEMPLATE;
}

export interface QuoteTheme {
  id: QuoteTemplate;
  labelAr: string;
  labelHe: string;
  layout: LayoutId;
  /** اللون القائد - يُستعمل باعتدال: علامة، تسميات، إجمالي. */
  accent: string;
  accentDeep: string;
  /** تظليلٌ هادئ لرأس الجدول أو صفوفه. */
  accentSoft: string;
  /** لونٌ ثانٍ نادر الاستعمال (ذهب «أونيكس»). */
  second: string | null;
  ink: string;
  inkMuted: string;
  line: string;
  /** خلفيّة الورقة كلّها - أبيض أو عاجيّ دافئ. */
  paper: string;
  onAccent: string;
  radius: number;
  brandScale: number;
  density: 'normal' | 'tight';
  zebra: boolean;
  /** الإجمالي: كتلةٌ مصمتة بلون القائد، أو طباعةٌ كبيرة فوق خطّ. */
  totalStyle: 'block' | 'type';
  /** رأس الجدول: خطٌّ سفليّ حازم، أو تعبئةٌ هادئة. */
  tableHead: 'rule' | 'fill';
}

const T = (t: QuoteTheme): QuoteTheme => t;

export const QUOTE_THEMES: Record<QuoteTemplate, QuoteTheme> = {
  /** لوحُ رأسٍ فحميّ وخيطُ ذهب - فخامةُ المكاتب الراقية. */
  onyx: T({
    id: 'onyx', labelAr: 'أونيكس', labelHe: 'אוניקס',
    layout: 'band',
    accent: '#1F2233', accentDeep: '#14161F', accentSoft: '#F4F2ED',
    second: '#B08D57',
    ink: '#22242E', inkMuted: '#75798A', line: '#E4E2DB', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 1, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** سويسريّ: بياضٌ ومقياسٌ طباعيّ - رقمُ العرض عنوانٌ ضخم. */
  swiss: T({
    id: 'swiss', labelAr: 'سويسري', labelHe: 'שוויצרי',
    layout: 'display',
    accent: palette.olive, accentDeep: palette.oliveDeepest, accentSoft: '#EFEFFC',
    second: null,
    ink: '#14161F', inkMuted: '#787E9B', line: '#E6E7EF', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 0.92, density: 'normal', zebra: false,
    totalStyle: 'type', tableHead: 'rule',
  }),

  /** لوحٌ جانبيّ نيليّ عميق يحمل العلامة ويمتدّ على كلّ صفحة. */
  panel: T({
    id: 'panel', labelAr: 'لوح', labelHe: 'פאנל',
    layout: 'panel',
    accent: '#232159', accentDeep: '#191740', accentSoft: '#F0F0F8',
    second: null,
    ink: palette.charcoal, inkMuted: '#787E9B', line: '#E4E4EF', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 0.95, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** كتّان: ورقٌ دافئ وتوسيطٌ رسميّ ولمسة تراكوتّا - يليق بمحلّ مفروشات. */
  linen: T({
    id: 'linen', labelAr: 'كتّان', labelHe: 'פשתן',
    layout: 'centered',
    accent: '#A8503A', accentDeep: '#7A3325', accentSoft: '#F6EEE6',
    second: null,
    ink: '#33302B', inkMuted: '#8A8073', line: '#E7DFD3', paper: '#FBF8F3',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 1.06, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** حبر: أحاديّ اللون، قاعدةٌ سوداء حازمة - لمن يريد أقصى الرسميّة. */
  ink: T({
    id: 'ink', labelAr: 'حبر', labelHe: 'דיו',
    layout: 'rule',
    accent: '#111318', accentDeep: '#000000', accentSoft: '#F3F3F5',
    second: null,
    ink: '#1B1D24', inkMuted: '#6E7280', line: '#DDDEE4', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 1, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** سماويّ: شريطٌ علويّ نحيل وأزرق مؤسّساتيّ هادئ. */
  azure: T({
    id: 'azure', labelAr: 'سماوي', labelHe: 'תכלת',
    layout: 'strip',
    accent: '#2563EB', accentDeep: '#173E8F', accentSoft: '#EFF4FD',
    second: null,
    ink: '#1E2A3D', inkMuted: '#64748B', line: '#DCE4F2', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 6, brandScale: 0.95, density: 'normal', zebra: true,
    totalStyle: 'block', tableHead: 'fill',
  }),

  /** مشغل: رقمُ العرض ظلًّا طباعيًّا خلف الرأس - أناقةُ المجلّات. */
  atelier: T({
    id: 'atelier', labelAr: 'مشغل', labelHe: 'סטודיו',
    layout: 'ghost',
    accent: '#5B21B6', accentDeep: '#3B1478', accentSoft: '#F4EFFC',
    second: null,
    ink: '#211F2E', inkMuted: '#7A768C', line: '#E6E3F0', paper: '#FDFDFF',
    onAccent: '#FFFFFF',
    radius: 0, brandScale: 1.02, density: 'normal', zebra: false,
    totalStyle: 'type', tableHead: 'rule',
  }),

  /** دفتر: نحيلٌ كثيف لعروضٍ طويلة - كلّ المساحة للبنود. */
  ledger: T({
    id: 'ledger', labelAr: 'دفتر', labelHe: 'פנקס',
    layout: 'slim',
    accent: palette.oliveDeepest, accentDeep: palette.oliveDeepest, accentSoft: '#F2F2FA',
    second: null,
    ink: palette.charcoal, inkMuted: '#6B7191', line: '#DFE0EC', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 2, brandScale: 0.82, density: 'tight', zebra: true,
    totalStyle: 'block', tableHead: 'fill',
  }),

  /** علامةٌ مائيّة: شعارٌ كبير خافت خلف المتن - عُرف الوثائق الفاخرة. */
  seal: T({
    id: 'seal', labelAr: 'ختم', labelHe: 'חותם',
    layout: 'seal',
    accent: '#1E3A5F', accentDeep: '#132741', accentSoft: '#EEF3F9',
    second: null,
    ink: '#1C2736', inkMuted: '#64748B', line: '#DCE3EE', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 2, brandScale: 1, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** نسيج: الشعار متكرّرًا كطباعة الورق الفاخر - على كلّ صفحة. */
  weave: T({
    id: 'weave', labelAr: 'نسيج', labelHe: 'אריג',
    layout: 'weave',
    accent: '#8A6844', accentDeep: '#5E4630', accentSoft: '#F6F1E9',
    second: null,
    ink: '#332B22', inkMuted: '#8B8071', line: '#E6DCCB', paper: '#FDFBF7',
    onAccent: '#FFFFFF',
    radius: 2, brandScale: 1, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'rule',
  }),

  /** موجة: دائرتان ناعمتان خلف الرأس - حداثةٌ بلا ضجيج. */
  curve: T({
    id: 'curve', labelAr: 'موجة', labelHe: 'גל',
    layout: 'curve',
    accent: '#4F46E5', accentDeep: '#211D63', accentSoft: '#EFEFFC',
    second: null,
    ink: '#1B1F32', inkMuted: '#787E9B', line: '#E6E7EF', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 10, brandScale: 1.02, density: 'normal', zebra: false,
    totalStyle: 'type', tableHead: 'rule',
  }),

  /** طيّات: خطوطٌ رأسيّة خافتة كطيّات ستارة - هويّةُ المحلّ في الورقة. */
  folds: T({
    id: 'folds', labelAr: 'طيّات', labelHe: 'קפלים',
    layout: 'folds',
    accent: '#0F766E', accentDeep: '#0B4F49', accentSoft: '#ECF6F4',
    second: null,
    ink: '#1C2B29', inkMuted: '#5F7C78', line: '#D9E7E4', paper: '#FFFFFF',
    onAccent: '#FFFFFF',
    radius: 4, brandScale: 1, density: 'normal', zebra: false,
    totalStyle: 'block', tableHead: 'fill',
  }),
};

export const templateLabel = (id: QuoteTemplate, lang: 'ar' | 'he'): string =>
  lang === 'he' ? QUOTE_THEMES[id].labelHe : QUOTE_THEMES[id].labelAr;
