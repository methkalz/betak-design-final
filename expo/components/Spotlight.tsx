/**
 * ضوء كاشف (Coach Mark / Feature Discovery): يُعتم الشاشة ويُبقي عنصرًا
 * واحدًا مضيئًا ليقول «من هنا تكمل».
 *
 * أُبني وفق ما توصي به المراجع لهذا النمط تحديدًا:
 * - يُطلق **بعد فعل المستخدم** (إتمام إضافة زبون) لا عند فتح الشاشة عشوائيًا.
 * - خطوة واحدة لا جولة: التكرار يحوّل الإرشاد إلى ضجيج.
 * - نص سطر واحد يُمسح بلمحة، فالمستخدم يغلق قبل أن يقرأ.
 * - **لا يحجب الهدف**: الفتحة قابلة للنقر فعلًا، والضغط عليها ينفّذ الإجراء.
 * - يتلاشى تلقائيًا، ويُغلق بأي لمسة، فلا يحتجز أحدًا.
 *
 * الفتحة مقصوصة بقناع SVG لا بأربعة مستطيلات حول الهدف - القناع وحده يعطي
 * زوايا مستديرة نظيفة ويسمح بهالة متدرّجة حول الحافة.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing as REasing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';

export interface SpotlightTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Spotlight({
  visible,
  target,
  title,
  body,
  radius: holeRadius = radius.md,
  padding = 8,
  autoHideMs = 5200,
  onDismiss,
}: {
  visible: boolean;
  /** إحداثيات الهدف على الشاشة (measureInWindow). */
  target: SpotlightTarget | null;
  title: string;
  body?: string;
  radius?: number;
  padding?: number;
  autoHideMs?: number;
  onDismiss: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    pulse.value = 0;
    pulse.value = withDelay(
      260,
      withRepeat(withTiming(1, { duration: 1400, easing: REasing.inOut(REasing.quad) }), -1, true),
    );
    const t = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(t);
  }, [visible, autoHideMs, onDismiss, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.045 }],
  }));

  if (!visible || !target) return null;

  const hx = target.x - padding;
  const hy = target.y - padding;
  const hw = target.width + padding * 2;
  const hh = target.height + padding * 2;
  /** النص فوق الهدف إن كان في النصف السفلي، وتحته إن كان في الأعلى. */
  const below = hy < H * 0.45;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View
        entering={FadeIn.duration(420)}
        exiting={FadeOut.duration(520)}
        style={StyleSheet.absoluteFill}
      >
        {/* الطبقة المعتمة بفتحة مقصوصة */}
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="spot">
              <Rect x={0} y={0} width={W} height={H} fill="#fff" />
              <Rect x={hx} y={hy} width={hw} height={hh} rx={holeRadius} fill="#000" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="rgba(12,14,28,0.78)" mask="url(#spot)" />
        </Svg>

        {/* هالة نابضة حول الفتحة */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: hx - 3,
              top: hy - 3,
              width: hw + 6,
              height: hh + 6,
              borderRadius: holeRadius + 3,
              borderWidth: 2,
              borderColor: palette.white,
            },
            ring,
          ]}
        />

        {/* الرسالة: سطر واحد يُمسح بلمحة */}
        <View
          pointerEvents="none"
          style={[
            styles.caption,
            below ? { top: hy + hh + spacing.lg } : { top: Math.max(spacing.xxl, hy - 96) },
          ]}
        >
          <AppText variant="heading" color={palette.white} align="center">
            {title}
          </AppText>
          {!!body && (
            <AppText variant="caption" color="rgba(255,255,255,0.75)" align="center">
              {body}
            </AppText>
          )}
        </View>

        {/* أي لمسة خارج الفتحة تُغلق؛ والفتحة نفسها تمرّر اللمسة للزر تحتها */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Pressable
          onPress={onDismiss}
          style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh }}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    gap: 4,
    alignItems: 'center',
  },
});
