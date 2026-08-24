/**
 * قوالب وثيقة عرض السعر - ثمانية مظاهر من هيكلٍ واحد.
 *
 * **لماذا رموزٌ لا ثماني وثائق**: ثماني نسخٍ من HTML تعني ثماني نقاط تعطُّب،
 * وثماني مرّاتٍ يُصلَح فيها كلّ عيبٍ مستقبليّ. هنا الاختلاف **بياناتٌ** لا
 * شيفرة: كلّ قالبٍ كائنُ رموزٍ صغير، والوثيقة واحدة تقرؤه.
 *
 * والألوان تُشتقّ من `constants/theme.ts` لا تُكتب سداسيًّا: الوثيقة كانت
 * تُكرّر ألوان اللوحة حرفيًّا (#4F46E5 هو `palette.olive`)، فكان أيّ تغييرٍ
 * في هويّة التطبيق ينحرف عن الورقة صامتًا.
 */
import { palette } from '@/constants/theme';

export const QUOTE_TEMPLATES = [
  'classic', 'modern', 'minimal', 'sidebar',
  'bold', 'executive', 'warm', 'compact',
] as const;

export type QuoteTemplate = (typeof QUOTE_TEMPLATES)[number];

export const DEFAULT_TEMPLATE: QuoteTemplate = 'modern';

/** يقبل أيّ نصّ ويعيد قالبًا صالحًا - الخادم قد يحمل قيمةً من نسخةٍ أحدث. */
export function asTemplate(value: unknown): QuoteTemplate {
  return QUOTE_TEMPLATES.includes(value as QuoteTemplate)
    ? (value as QuoteTemplate)
    : DEFAULT_TEMPLATE;
}

/**
 * ثلاثة هياكل بنيويّة:
 * - `letterhead` رأسٌ نصّيّ فوق سطرٍ فاصل، بلا كتلٍ لونية - الأرخص حبرًا
 * - `banner`     شريطٌ لونيّ ممتدّ يحمل العلامة والشارة
 * - `edge`       شريطٌ لونيّ على حافّة الورقة **يتكرّر على كلّ صفحة**
 */
export type Skeleton = 'letterhead' | 'banner' | 'edge';

export interface QuoteTheme {
  id: QuoteTemplate;
  labelAr: string;
  labelHe: string;
  skeleton: Skeleton;
  /** اللون القائد: الشارة والخطوط والإجمالي. */
  accent: string;
  /** أغمق منه - للعناوين فوق الأبيض. */
  accentDeep: string;
  /** تظليلٌ خفيف: رأس الجدول والصناديق. */
  accentSoft: string;
  /** لونٌ ثانٍ اختياريّ (الذهب في «تنفيذيّ»). */
  second: string | null;
  ink: string;
  inkMuted: string;
  line: string;
  surface: string;
  onAccent: string;
  radius: number;
  /** مضاعف حجم اسم المحلّ في الرأس. */
  brandScale: number;
  /** `tight` يضغط الحشوات فتتّسع الصفحة لبنودٍ أكثر. */
  density: 'normal' | 'tight';
  zebra: boolean;
  table: 'boxed' | 'ruled' | 'plain';
}

const T = (t: QuoteTheme): QuoteTheme => t;

export const QUOTE_THEMES: Record<QuoteTemplate, QuoteTheme> = {
  /** رسميّ: بلا كتلٍ لونية إطلاقًا - يليق بالبنوك والمكاتب، وأرخص طباعةً. */
  classic: T({
    id: 'classic', labelAr: 'كلاسيكي', labelHe: 'קלאסי',
    skeleton: 'letterhead',
    accent: palette.oliveDeepest, accentDeep: palette.oliveDeepest,
    accentSoft: '#FFFFFF', second: null,
    ink: palette.charcoal, inkMuted: palette.muted, line: '#D8D9E6',
    surface: '#FFFFFF', onAccent: '#FFFFFF',
    radius: 0, brandScale: 1, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** عصريّ: لوحة رأسٍ ملوّنة وبطاقات مستديرة - أقرب ما يكون لهويّة التطبيق. */
  modern: T({
    id: 'modern', labelAr: 'عصري', labelHe: 'מודרני',
    skeleton: 'banner',
    accent: palette.olive, accentDeep: palette.oliveDeepest,
    accentSoft: palette.sand, second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#E2E3F2',
    surface: palette.ivory, onAccent: '#FFFFFF',
    radius: 12, brandScale: 1, density: 'normal', zebra: true, table: 'boxed',
  }),

  /** مبسّط: أبيضُ ومساحات - الأناقة في الفراغ لا في الحبر. */
  minimal: T({
    id: 'minimal', labelAr: 'مبسّط', labelHe: 'מינימלי',
    skeleton: 'letterhead',
    accent: palette.charcoal, accentDeep: '#000000',
    accentSoft: '#FFFFFF', second: null,
    ink: '#2C3150', inkMuted: '#8A90A8', line: '#E8E9F1',
    surface: '#FFFFFF', onAccent: '#FFFFFF',
    radius: 0, brandScale: 0.92, density: 'normal', zebra: false, table: 'plain',
  }),

  /** جانبيّ: شريطٌ لونيّ على حافّة الورقة يتكرّر على كلّ صفحة. */
  sidebar: T({
    id: 'sidebar', labelAr: 'جانبي', labelHe: 'צדי',
    skeleton: 'edge',
    accent: palette.oliveDark, accentDeep: palette.oliveDeepest,
    accentSoft: palette.ivory, second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#E2E3F2',
    surface: palette.ivory, onAccent: '#FFFFFF',
    radius: 10, brandScale: 1, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** جريء: كتلةٌ لونية كبيرة وعناوين ضخمة - يُرى من آخر الغرفة. */
  bold: T({
    id: 'bold', labelAr: 'جريء', labelHe: 'נועז',
    skeleton: 'banner',
    accent: palette.olive, accentDeep: palette.oliveDeepest,
    accentSoft: palette.sand, second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#DCDDEE',
    surface: palette.ivory, onAccent: '#FFFFFF',
    radius: 18, brandScale: 1.5, density: 'normal', zebra: true, table: 'boxed',
  }),

  /** تنفيذيّ: فحميّ ولمسةُ ذهب - رصانةٌ بلا برودة. */
  executive: T({
    id: 'executive', labelAr: 'تنفيذي', labelHe: 'ניהולי',
    skeleton: 'letterhead',
    accent: '#2C3150', accentDeep: '#1B1F32',
    accentSoft: '#F7F5F0', second: '#B08D57',
    ink: '#22263C', inkMuted: '#6E7288', line: '#DAD6CC',
    surface: '#FAF8F4', onAccent: '#FFFFFF',
    radius: 4, brandScale: 1.06, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** دافئ: ترابيّ - يليق بمحلّ أقمشةٍ ومفروشات بيوت. */
  warm: T({
    id: 'warm', labelAr: 'دافئ', labelHe: 'חמים',
    skeleton: 'banner',
    accent: '#A8503A', accentDeep: '#7A3325',
    accentSoft: '#FBF1EC', second: null,
    ink: '#3A2A24', inkMuted: '#8A6E63', line: '#EAD9D1',
    surface: '#FDF7F4', onAccent: '#FFFFFF',
    radius: 14, brandScale: 1, density: 'normal', zebra: true, table: 'boxed',
  }),

  /** مضغوط: كثافةٌ أعلى - لعروضٍ كثيرة البنود، يوفّر صفحاتٍ وحبرًا. */
  compact: T({
    id: 'compact', labelAr: 'مضغوط', labelHe: 'דחוס',
    skeleton: 'letterhead',
    accent: palette.oliveDeepest, accentDeep: palette.oliveDeepest,
    accentSoft: '#F2F2FA', second: null,
    ink: palette.charcoal, inkMuted: '#6B7191', line: '#DFE0EC',
    surface: '#FFFFFF', onAccent: '#FFFFFF',
    radius: 6, brandScale: 0.86, density: 'tight', zebra: true, table: 'ruled',
  }),
};

export const templateLabel = (id: QuoteTemplate, lang: 'ar' | 'he'): string =>
  lang === 'he' ? QUOTE_THEMES[id].labelHe : QUOTE_THEMES[id].labelAr;
