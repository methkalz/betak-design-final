/**
 * حركة الانتقال بين التبويبات - مشتركة بين لوحات الأدوار كلها.
 *
 * مبنية على «المحور المشترك» (shared axis) في Material Motion، وهي الممارسة
 * المستقرّة للتنقّل بين مستويات متجاورة:
 *
 * - الخارج يتلاشى وينزلق، والداخل يأتي من الجهة المقابلة.
 * - الخروج أسرع من الدخول (110 مقابل 210): العين تودّع بسرعة وتستقبل على
 *   مهل، ولو تساويا لبدت النقلة ثقيلة.
 * - مسافة السفر سدس عرض الشاشة لا رقمًا ثابتًا: 26 نقطة توصي بها Material
 *   تُقرأ نكزةً على هاتف عريض. والسدس دون الشاشة كاملة التي تُوهم بأن
 *   المحتوى جاء من العدم.
 * - نسخة واحدة محمولة في كل لحظة، فلا يتراكب محتوى تبويبين ولا يقفز
 *   الارتفاع أثناء الانتقال.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { spacing } from '@/constants/theme';

const OUT_MS = 110;
const IN_MS = 210;

export function TabPanel<T extends string>({
  tab,
  order,
  onSwap,
  gap = spacing.lg,
  style,
  children,
}: {
  tab: T;
  /** ترتيب التبويبات - منه يُعرف اتجاه السفر. */
  order: readonly T[];
  /** يُنادى لحظة تبديل المحتوى - عادةً لإعادة التمرير إلى الأعلى. */
  onSwap?: () => void;
  gap?: number;
  /** يلزم `{ flex: 1 }` حين يكون المحتوى قائمةً تملك تمريرها. */
  style?: ViewStyle;
  children: (shown: T) => React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const shift = Math.min(90, Math.max(40, width * 0.16));
  const [shown, setShown] = useState<T>(tab);
  const pending = useRef<T>(tab);
  const dir = useRef(1);
  const opacity = useSharedValue(0);
  const tx = useSharedValue(0);

  const commit = useCallback(() => {
    setShown(pending.current);
    onSwap?.();
  }, [onSwap]);

  useEffect(() => {
    // يُسجَّل الهدف قبل أي خروج مبكر: ضغطتان سريعتان أ ← ب ← أ كانتا تتركان
    // اللوح الخطأ معروضًا، لأن الحركة الجارية تُثبّت هدفًا لم يعد مطلوبًا.
    pending.current = tab;
    if (tab === shown) return;
    dir.current = order.indexOf(tab) > order.indexOf(shown) ? 1 : -1;
    opacity.value = withTiming(0, { duration: OUT_MS, easing: Easing.in(Easing.quad) });
    tx.value = withTiming(
      dir.current * shift,
      { duration: OUT_MS, easing: Easing.in(Easing.quad) },
      (done) => {
        if (done) runOnJS(commit)();
      },
    );
  }, [tab, shown, order, opacity, tx, commit, shift]);

  useEffect(() => {
    tx.value = -dir.current * shift;
    opacity.value = 0;
    tx.value = withTiming(0, { duration: IN_MS, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.quad) });
  }, [shown, opacity, tx, shift]);

  const motion = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  return <Animated.View style={[{ gap }, style, motion]}>{children(shown)}</Animated.View>;
}
