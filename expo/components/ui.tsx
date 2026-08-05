import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing as REasing,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { font, palette, radius, shadow, spacing, TOUCH } from '@/constants/theme';

export const RTL_ROW = 'row-reverse' as const;

/* ────────────────────────────── Text ────────────────────────────── */

type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'label'
  | 'caption'
  | 'number'
  | 'numberLarge';

interface AppTextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  color?: string;
  align?: 'right' | 'left' | 'center';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * مقياس قراءة مريح (توصيات iOS HIG وMaterial + خصوصية العربية):
 * الأساسي ≥16، لا شيء تحت 13، وأسطر ≈1.65 لأن العربية تحتاج تنفسًا رأسيًا.
 */
const TEXT_STYLES: Record<TextVariant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: 32, lineHeight: 46 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 38 },
  heading: { fontFamily: font.semibold, fontSize: 18.5, lineHeight: 29 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 27 },
  label: { fontFamily: font.medium, fontSize: 14.5, lineHeight: 24 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 21 },
  number: { fontFamily: font.semibold, fontSize: 20, lineHeight: 28 },
  numberLarge: { fontFamily: font.bold, fontSize: 30, lineHeight: 42 },
};

export const AppText = memo(function AppText({
  children,
  variant = 'body',
  color = palette.charcoal,
  align = 'right',
  style,
  numberOfLines,
}: AppTextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[TEXT_STYLES[variant], { color, textAlign: align, writingDirection: 'rtl' }, style]}
    >
      {children}
    </Text>
  );
});

/* ────────────────────────────── Layout ────────────────────────────── */

export function Row({
  children,
  gap = spacing.sm,
  align = 'center',
  justify = 'flex-start',
  style,
  wrap,
}: {
  children: React.ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        {
          flexDirection: RTL_ROW,
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  padded = true,
  testID,
  onLayout,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  testID?: string;
  /** موضع البطاقة داخل الصفحة - يلزم للتمرير إليها بعد إنشائها. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const content = (
    <View onLayout={onLayout} style={[styles.card, padded && { padding: spacing.lg }, style]}>
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      android_ripple={{ color: palette.sand }}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Spacer({ h = spacing.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

/* ────────────────────────────── Buttons ────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  full,
  small,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const handle = useCallback(() => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [disabled, loading, onPress]);

  const bg: Record<ButtonVariant, string> = {
    primary: palette.olive,
    secondary: palette.sand,
    ghost: 'transparent',
    danger: palette.danger,
    accent: palette.terracotta,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: palette.ivory,
    secondary: palette.oliveDark,
    ghost: palette.olive,
    danger: palette.white,
    accent: palette.white,
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg[variant],
          opacity: disabled ? 0.45 : 1,
          minHeight: small ? 40 : TOUCH,
          paddingHorizontal: small ? spacing.md : spacing.xl,
          alignSelf: full ? 'stretch' : 'flex-start',
          borderWidth: variant === 'ghost' ? 1.5 : 0,
          borderColor: palette.line,
          transform: [{ scale: pressed ? 0.975 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <View style={{ flexDirection: RTL_ROW, alignItems: 'center', gap: spacing.sm }}>
          {icon}
          <Text
            style={{
              fontFamily: font.semibold,
              fontSize: small ? 14 : 16,
              color: fg[variant],
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  children,
  onPress,
  bg = palette.sand,
  size = TOUCH,
  testID,
}: {
  children: React.ReactNode;
  onPress: () => void;
  bg?: string;
  size?: number;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ────────────────────────────── Pills & chips ────────────────────────────── */

export function Pill({
  label,
  bg = palette.sand,
  fg = palette.oliveDark,
  icon,
  small,
}: {
  label: string;
  bg?: string;
  fg?: string;
  icon?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: RTL_ROW,
        alignItems: 'center',
        gap: 5,
        backgroundColor: bg,
        paddingHorizontal: small ? 8 : 11,
        paddingVertical: small ? 3 : 5,
        borderRadius: radius.pill,
      }}
    >
      {icon}
      <Text style={{ fontFamily: font.medium, fontSize: small ? 12 : 13.5, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: spacing.lg,
          height: 40,
          borderRadius: radius.pill,
          backgroundColor: active ? palette.olive : palette.white,
          borderWidth: 1,
          borderColor: active ? palette.olive : palette.line,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: RTL_ROW,
          gap: 6,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: font.medium,
          fontSize: 14.5,
          color: active ? palette.ivory : palette.charcoal,
        }}
      >
        {label}
      </Text>
      {typeof count === 'number' && (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 5,
            height: 20,
            borderRadius: 10,
            backgroundColor: active ? 'rgba(255,255,255,0.22)' : palette.sand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: font.semibold,
              fontSize: 11,
              color: active ? palette.ivory : palette.muted,
            }}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text
              style={{
                fontFamily: active ? font.semibold : font.regular,
                fontSize: 14.5,
                color: active ? palette.oliveDark : palette.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ────────────────────────────── Inputs ────────────────────────────── */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  suffix,
  error,
  editable = true,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'decimal-pad';
  multiline?: boolean;
  suffix?: string;
  error?: string | null;
  editable?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" color={palette.muted}>
        {label}
      </AppText>
      <View
        style={[
          styles.input,
          multiline && { height: 96, alignItems: 'flex-start', paddingTop: 12 },
          !!error && { borderColor: palette.danger },
          !editable && { backgroundColor: palette.ivoryDeep },
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          keyboardType={keyboardType ?? 'default'}
          multiline={multiline}
          editable={editable}
          style={{
            flex: 1,
            fontFamily: font.regular,
            fontSize: 16,
            color: palette.charcoal,
            textAlign: 'right',
            writingDirection: 'rtl',
            paddingVertical: 0,
            height: multiline ? '100%' : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {!!suffix && (
          <Text style={{ fontFamily: font.medium, fontSize: 13, color: palette.muted }}>
            {suffix}
          </Text>
        )}
      </View>
      {!!error && (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

/* ────────────────────────────── Feedback ────────────────────────────── */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="body" color={palette.muted} align="center">
        {body}
      </AppText>
      {action}
    </View>
  );
}

export function Skeleton({ height = 96, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: radius.lg,
          backgroundColor: palette.ivoryDeep,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[palette.ivoryDeep, palette.sand, palette.ivoryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1, opacity: 0.7 }}
      />
    </View>
  );
}

/**
 * شريط تقدّم أنيق: التوصية المعتمدة تقول إن الشريط لا يجب أن يخطف الانتباه،
 * وأن الحركة تكون خفيفة بمنحنى ناعم لا وميضًا صاخبًا. لذلك:
 * التعبئة تنزلق بمنحنى out-cubic عند تغيّر القيمة، وبريقٌ شفيف يعبرها
 * ببطء (وفي الجزء الممتلئ وحده) فيوحي بالحياة بلا ضجيج - ويتوقف تلقائيًا
 * عند 0% و100% حيث لا شيء «جارٍ» ليُعبَّر عنه.
 */
export function ProgressBar({
  value,
  color = palette.olive,
  height = 8,
  track = palette.sand,
  shimmer = true,
}: {
  value: number;
  color?: string;
  height?: number;
  track?: string;
  shimmer?: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const fill = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(clamped, { duration: 900, easing: REasing.out(REasing.cubic) });
  }, [clamped, fill]);

  const live = shimmer && clamped > 0.02 && clamped < 0.995;
  useEffect(() => {
    if (!live) {
      sweep.value = 0;
      return;
    }
    sweep.value = withRepeat(withTiming(1, { duration: 3400, easing: REasing.inOut(REasing.quad) }), -1, false);
  }, [live, sweep]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  // من اليمين إلى اليسار مع اتجاه القراءة: تحريك الحافة اليمنى للبريق
  const sweepStyle = useAnimatedStyle(() => ({ right: `${sweep.value * 130 - 30}%` }));

  return (
    <View style={{ height, backgroundColor: track, borderRadius: height / 2, overflow: 'hidden' }}>
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: color,
            borderRadius: height / 2,
            alignSelf: 'flex-end',
            overflow: 'hidden',
          },
          fillStyle,
        ]}
      >
        {live && (
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '28%' }, sweepStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

export function Banner({
  tone,
  title,
  body,
  icon,
  action,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const map = {
    info: { bg: palette.infoSoft, fg: palette.info },
    warning: { bg: palette.warningSoft, fg: palette.warning },
    danger: { bg: palette.dangerSoft, fg: palette.danger },
    success: { bg: palette.successSoft, fg: palette.success },
  } as const;
  const c = map[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <View style={{ flexDirection: RTL_ROW, gap: spacing.sm, alignItems: 'flex-start' }}>
        {icon}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={c.fg}>
            {title}
          </AppText>
          {!!body && (
            <AppText variant="caption" color={c.fg} style={{ opacity: 0.85 }}>
              {body}
            </AppText>
          )}
        </View>
      </View>
      {action}
    </View>
  );
}

/**
 * ورقة تأكيد سفلية بأسلوب التطبيق — بديل Alert الأصلي الذي يفرض ألوان
 * النظام وخطوطه فيقطع الهوية البصرية. الممارسة المعتمدة للإجراءات المرتبطة
 * بالشاشة الحالية: ورقة سفلية غير قاطعة، لا حوار مركزي.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'إلغاء',
  tone = 'primary',
  icon,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBackdrop} onPress={onCancel} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet}>
          <View style={styles.sheetGrip} />
          {!!icon && (
            <View
              style={[
                styles.sheetIcon,
                { backgroundColor: tone === 'danger' ? palette.dangerSoft : palette.sand },
              ]}
            >
              {icon}
            </View>
          )}
          <AppText variant="title" align="center">
            {title}
          </AppText>
          {!!body && (
            <AppText variant="body" color={palette.muted} align="center">
              {body}
            </AppText>
          )}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              full
              onPress={onConfirm}
            />
            <Button label={cancelLabel} variant="ghost" full onPress={onCancel} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <Row justify="space-between" align="flex-end" style={{ marginBottom: spacing.md }}>
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
        {!!subtitle && (
          <AppText variant="caption" color={palette.muted}>
            {subtitle}
          </AppText>
        )}
      </View>
      {action}
    </Row>
  );
}

/* ────────────────────────────── Swatch ────────────────────────────── */

export function Swatch({
  color,
  size = 44,
  label,
}: {
  color: string;
  size?: number;
  label?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
      }}
    >
      <LinearGradient
        colors={[color, shade(color, -14)]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {!!label && (
          <Text style={{ fontFamily: font.semibold, fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>
            {label}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

/** Lightens/darkens a hex colour by percentage points. */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function ScrollScreen({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    ...shadow.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: spacing.md },
  button: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: RTL_ROW,
  },
  input: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: spacing.md,
    flexDirection: RTL_ROW,
    alignItems: 'center',
    gap: spacing.sm,
  },
  segment: {
    flexDirection: RTL_ROW,
    backgroundColor: palette.ivoryDeep,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: { backgroundColor: palette.white, ...shadow.card },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.sand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  banner: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,18,34,0.45)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
    alignItems: 'stretch',
    ...shadow.raised,
  },
  sheetGrip: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.sandDeep,
    marginBottom: spacing.lg,
  },
  sheetIcon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
