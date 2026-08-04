/**
 * Baytak Design — design tokens.
 * Warm interior-design language: ivory paper, olive ink, terracotta accents.
 * Shared with the web dashboard (packages/ui-tokens equivalent).
 */

export const palette = {
  ivory: '#F8F5EF',
  ivoryDeep: '#F1EBE1',
  sand: '#EDE4D7',
  sandDeep: '#E2D5C3',
  olive: '#42584A',
  oliveDark: '#2F4136',
  oliveDeepest: '#22302A',
  sage: '#A8B9A5',
  sageSoft: '#D6E0D2',
  terracotta: '#C8795B',
  terracottaSoft: '#F3DED2',
  charcoal: '#282B29',
  ink: '#1B1F1C',
  muted: '#7C8479',
  line: '#E4DCCE',
  white: '#FFFFFF',
  danger: '#B4462F',
  dangerSoft: '#F7DED6',
  success: '#3E7A54',
  successSoft: '#DCEBE0',
  warning: '#B8862F',
  warningSoft: '#F7EBD2',
  info: '#3C6079',
  infoSoft: '#DCE7EE',
} as const;

export const colors = {
  bg: palette.ivory,
  surface: palette.white,
  surfaceAlt: palette.ivoryDeep,
  border: palette.line,
  text: palette.charcoal,
  textSoft: palette.muted,
  primary: palette.olive,
  onPrimary: palette.ivory,
  accent: palette.terracotta,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
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
 * Alexandria — خط عربي هندسي حديث صُمم للواجهات: نظيف، أنيق، ممتاز القراءة
 * بالأحجام الصغيرة، وبأوزانه الأربعة المطابقة لفتحات النظام (قرار جولة
 * التصميم 2026-08-04؛ كان IBM Plex Sans Arabic).
 */
export const font = {
  regular: 'Alexandria_400Regular',
  medium: 'Alexandria_500Medium',
  semibold: 'Alexandria_600SemiBold',
  bold: 'Alexandria_700Bold',
} as const;

export const shadow = {
  card: {
    shadowColor: '#3B3226',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#2A2418',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
} as const;

/** Minimum touch target required by the design system (48dp). */
export const TOUCH = 48;
