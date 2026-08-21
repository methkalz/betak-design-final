/**
 * Baytak Design — design tokens (اتجاه 2026).
 *
 * تحوّل مقصود بقرار المالك: من اللغة الترابية الهادئة إلى لغة نابضة حديثة —
 * نيلي/بنفسجي أساسًا، خلفية ورقية مائلة للّافندر، تدرّجات حيّة للأبطال
 * والإجراءات، وزجاج جراحي فوقها. أسماء المفاتيح القديمة بقيت كما هي عمدًا
 * (ivory/olive/sand/…) لتسري القيم الجديدة على كل الشاشات بلا لمس واحدة
 * منها — تُقرأ الآن كأدوار لا كألوان: olive = اللون الأساسي، ivory = الخلفية،
 * sand = سطح ثانوي، sage = فاتح فوق الداكن، terracotta = لهجة دافئة.
 */

export const palette = {
  // الخلفيات والأسطح
  ivory: '#F6F6FB',
  ivoryDeep: '#EFEFF8',
  sand: '#EEEFFE',
  sandDeep: '#DEE0FA',
  white: '#FFFFFF',

  // اللون الأساسي — نيلي نابض
  olive: '#4F46E5',
  oliveDark: '#3B32C4',
  oliveDeepest: '#211D63',

  // فاتح فوق الداكن + هالات
  sage: '#A5B4FC',
  sageSoft: '#EBEDFE',

  // لهجة دافئة مقابلة للنيلي
  terracotta: '#F97066',
  terracottaSoft: '#FFE9E6',

  // النص
  charcoal: '#1B1F32',
  ink: '#0F1222',
  muted: '#787E9B',
  line: '#EAEAF5',

  // دلالية
  danger: '#F43F5E',
  dangerSoft: '#FFE4EA',
  success: '#10B981',
  successSoft: '#DFF7EE',
  warning: '#F59E0B',
  warningSoft: '#FEF1D6',
  info: '#3B82F6',
  infoSoft: '#E3EDFF',
} as const;

/** أزواج التدرّج — الأبطال ومربعات الإجراءات (نمط 2026). */
export const gradients = {
  hero: ['#5B54EA', '#7C5CF5', '#9D6FF0'],
  heroDeep: ['#2A2478', '#4F46E5'],
  indigo: ['#6366F1', '#8B5CF6'],
  sky: ['#38BDF8', '#3B82F6'],
  amber: ['#FBBF24', '#F59E0B'],
  emerald: ['#34D399', '#10B981'],
  rose: ['#FB7185', '#F43F5E'],
  coral: ['#FDA4A0', '#F97066'],
} as const;

export const colors = {
  bg: palette.ivory,
  surface: palette.white,
  surfaceAlt: palette.ivoryDeep,
  border: palette.line,
  text: palette.charcoal,
  textSoft: palette.muted,
  primary: palette.olive,
  onPrimary: palette.white,
  accent: palette.terracotta,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

/**
 * حدود القياس. فوق 1024 تُقاد الصفحة بالفأرة لا بالإبهام، وفوق 1440 تتّسع
 * لعمودين. **المنصّة ليست الحكم** — متصفّح الهاتف ويبٌ أيضًا، ونافذةٌ مصغّرة
 * على الحاسوب تُقرأ كالهاتف. فالقياس وحده يقرّر.
 */
export const breakpoint = {
  desktop: 1024,
  wide: 1440,
} as const;

/**
 * عروض التخطيط على سطح المكتب. كلّها **سقوفٌ لا تُبلَغ على الهاتف**: أضيقها
 * (560) أوسع من أعرض هاتفٍ محمول، فلا يمسّ أيٌّ منها نسخة الموبايل بالبناء.
 *
 * الأرقام مقيسة لا مُخمَّنة: متوسّط تقدّم Cairo ≈ 0.52em، فعند 16.5px يكون
 * الحرف ≈ 8.6px. ونطاق المقروئية 45-75 حرفًا = 387-645px.
 */
export const layout = {
  /** عمود الصفحة - بطاقاتٌ مرصوصة (اللوحات، النماذج، التفاصيل). */
  column: 720,
  /** عمود القوائم - يتّسع لبطاقتين في الصفّ. */
  columnWide: 1080,
  /** فقرة نصٍّ متّصل: 640 ÷ 8.6 ≈ 74 حرفًا - سقف المقروئية. */
  text: 640,
  /** نموذجٌ أو حوار: 560 ÷ 8.6 ≈ 65 حرفًا - المقاس المثالي حيث النصّ هو المحتوى. */
  form: 560,
  /** الشريط الجانبي المكتبيّ (المسار الرابع). */
  sidebar: 260,
  /** حشوة الصفحة على المكتب - درجةٌ أعلى من spacing.lg، من السلّم نفسه. */
  gutter: spacing.xxl,
} as const;

/**
 * Cairo — المعيار الذهبي للنصوص العربية الرقمية في تطبيقات الموبايل
 * (توصيات الممارسات 2026): تسعة أوزان تمنح تسلسلًا هرميًا كاملًا، مقروئية
 * ممتازة على الشاشات، وأوسع اعتماد في التطبيقات العربية الإنتاجية.
 * قرار مالك 2026-08-04 بعد رفض Alexandria؛ الأصل كان IBM Plex Sans Arabic.
 */
export const font = {
  regular: 'Cairo_400Regular',
  medium: 'Cairo_500Medium',
  semibold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
} as const;

/** الخط العبري - خيبو، لما كُتب بالعبرية وحده (מע"מ ونحوها). */
export const fontHe = {
  semibold: 'Heebo_600SemiBold',
  bold: 'Heebo_700Bold',
} as const;

export const shadow = {
  // ظل بارد مائل للنيلي — يذوب في الخلفية بدل أن يتسخ فوقها
  card: {
    shadowColor: '#3F3D8F',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#2E2B75',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  /** توهج ملوّن تحت العناصر البطلة والمتدرجة. */
  glow: {
    shadowColor: '#5B54EA',
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

/** Minimum touch target required by the design system (48dp). */
export const TOUCH = 48;
