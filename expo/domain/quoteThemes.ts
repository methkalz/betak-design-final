/**
 * قوالب وثيقة عرض السعر - **ثمانية تراكيب**، لا ثمانية ألوان.
 *
 * أوّل محاولةٍ جعلت الاختلاف رموزًا لونيّة فوق هيكلٍ واحد، فخرجت ثماني ورقاتٍ
 * متطابقة البنية - وهو ما رآه المالك بحقّ «تغييرًا بالألوان بالأساس». الآن
 * لكلّ قالبٍ **تخطيطُه** (`layout`) و**طريقةُ عرض بنوده** (`itemStyle`)،
 * والأشكال الهندسيّة جزءٌ من التركيب لا زينةٌ فوقه.
 *
 * والألوان تُشتقّ من `constants/theme.ts` لا تُكتب سداسيًّا: الوثيقة كانت
 * تُكرّر ألوان اللوحة حرفيًّا، فكان أيّ تغييرٍ في هويّة التطبيق ينحرف عن
 * الورقة صامتًا.
 */
import { palette } from '@/constants/theme';
import type { ItemStyle, LayoutId } from '@/domain/quoteLayouts';

export const QUOTE_TEMPLATES = [
  'arc', 'diagonal', 'mosaic', 'triangles',
  'column', 'classic', 'blueprint', 'ledger',
] as const;

export type QuoteTemplate = (typeof QUOTE_TEMPLATES)[number];

export const DEFAULT_TEMPLATE: QuoteTemplate = 'arc';

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
  /** التركيب: شكل الرأس وهندسته. */
  layout: LayoutId;
  /** كيف تُعرض البنود: جدولٌ أو بطاقاتٌ أو دفتر. */
  itemStyle: ItemStyle;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  second: string | null;
  ink: string;
  inkMuted: string;
  line: string;
  surface: string;
  onAccent: string;
  radius: number;
  brandScale: number;
  density: 'normal' | 'tight';
  zebra: boolean;
  table: 'boxed' | 'ruled' | 'plain';
}

const T = (t: QuoteTheme): QuoteTheme => t;

export const QUOTE_THEMES: Record<QuoteTemplate, QuoteTheme> = {
  /** ربعُ دائرةٍ ملوّن يملأ ركن الورقة والعلامة داخله. */
  arc: T({
    id: 'arc', labelAr: 'قوس', labelHe: 'קשת',
    layout: 'arc', itemStyle: 'table',
    accent: palette.olive, accentDeep: palette.oliveDeepest,
    accentSoft: palette.sand, second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#E2E3F2',
    surface: palette.ivory, onAccent: '#FFFFFF',
    radius: 14, brandScale: 1.05, density: 'normal', zebra: true, table: 'boxed',
  }),

  /** كتلةٌ لونيّة يشقّها قطرٌ حادّ. */
  diagonal: T({
    id: 'diagonal', labelAr: 'قطري', labelHe: 'אלכסון',
    layout: 'diagonal', itemStyle: 'table',
    accent: palette.oliveDark, accentDeep: palette.oliveDeepest,
    accentSoft: '#EEEFFE', second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#E0E1F0',
    surface: '#FFFFFF', onAccent: '#FFFFFF',
    radius: 0, brandScale: 1.12, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** تسع مربّعاتٍ متدرّجة، والبنود **بطاقاتٌ لا صفوف**. */
  mosaic: T({
    id: 'mosaic', labelAr: 'فسيفساء', labelHe: 'פסיפס',
    layout: 'mosaic', itemStyle: 'cards',
    accent: '#0F766E', accentDeep: '#0B4F49',
    accentSoft: '#ECF7F5', second: null,
    ink: '#1C2B29', inkMuted: '#5F7C78', line: '#D6E7E4',
    surface: '#F5FBFA', onAccent: '#FFFFFF',
    radius: 0, brandScale: 1, density: 'normal', zebra: false, table: 'plain',
  }),

  /** شريطٌ متعرّج من مثلّثات يفصل الرأس عن المتن. */
  triangles: T({
    id: 'triangles', labelAr: 'مثلثات', labelHe: 'משולשים',
    layout: 'triangles', itemStyle: 'table',
    accent: '#A8503A', accentDeep: '#7A3325',
    accentSoft: '#FBF1EC', second: null,
    ink: '#3A2A24', inkMuted: '#8A6E63', line: '#EAD9D1',
    surface: '#FDF7F4', onAccent: '#FFFFFF',
    radius: 10, brandScale: 1.08, density: 'normal', zebra: true, table: 'boxed',
  }),

  /** عمودٌ لونيّ رأسيّ يمتدّ على كلّ صفحة. */
  column: T({
    id: 'column', labelAr: 'عمود', labelHe: 'עמוד',
    layout: 'column', itemStyle: 'table',
    accent: '#3F3D8F', accentDeep: '#26254F',
    accentSoft: '#EFEFF9', second: null,
    ink: palette.charcoal, inkMuted: '#5C6280', line: '#E2E3F2',
    surface: '#F7F7FC', onAccent: '#FFFFFF',
    radius: 8, brandScale: 1, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** موسَّطٌ رسميّ - ثلاثة خطوطٍ تحت العلامة، بلا كتلٍ لونية. */
  classic: T({
    id: 'classic', labelAr: 'كلاسيكي', labelHe: 'קלאסי',
    layout: 'stack', itemStyle: 'table',
    accent: '#2C3150', accentDeep: '#1B1F32',
    accentSoft: '#F7F5F0', second: '#B08D57',
    ink: '#22263C', inkMuted: '#6E7288', line: '#DAD6CC',
    surface: '#FAF8F4', onAccent: '#FFFFFF',
    radius: 2, brandScale: 1.16, density: 'normal', zebra: false, table: 'ruled',
  }),

  /** شبكةُ مخطّطٍ هندسيّ وعلاماتُ ركن - يليق بمحلّ قياسات. */
  blueprint: T({
    id: 'blueprint', labelAr: 'مخطط', labelHe: 'שרטוט',
    layout: 'blueprint', itemStyle: 'table',
    accent: '#1D4ED8', accentDeep: '#16367F',
    accentSoft: '#EAF0FE', second: null,
    ink: '#1B2337', inkMuted: '#5B6780', line: '#D5DEF4',
    surface: '#F6F9FE', onAccent: '#FFFFFF',
    radius: 0, brandScale: .95, density: 'normal', zebra: false, table: 'plain',
  }),

  /** دفترٌ كثيف - كلّ المساحة للبنود، لعروضٍ طويلة. */
  ledger: T({
    id: 'ledger', labelAr: 'دفتر', labelHe: 'פנקס',
    layout: 'ledger', itemStyle: 'ledger',
    accent: palette.oliveDeepest, accentDeep: palette.oliveDeepest,
    accentSoft: '#F2F2FA', second: null,
    ink: palette.charcoal, inkMuted: '#6B7191', line: '#DFE0EC',
    surface: '#FFFFFF', onAccent: '#FFFFFF',
    radius: 4, brandScale: .82, density: 'tight', zebra: true, table: 'ruled',
  }),
};

export const templateLabel = (id: QuoteTemplate, lang: 'ar' | 'he'): string =>
  lang === 'he' ? QUOTE_THEMES[id].labelHe : QUOTE_THEMES[id].labelAr;
