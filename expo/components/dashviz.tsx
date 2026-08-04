/**
 * أدوات العرض المرئي للوحة — كسر روتين أشرطة التقدم:
 * حلقة نسبة (SVG)، شريط مكدّس واحد بدل خمسة، أعمدة اتجاه مصغّرة،
 * عدّاد رقمي متحرك، ودخول متدرج (reanimated) يمنح اللوحة حياتها.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AppText, Row } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';

/* ── دخول متدرج ─────────────────────────────────────────────────────────── */

export function Enter({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(480)} style={style}>
      {children}
    </Animated.View>
  );
}

/* ── عدّاد رقمي متحرك ───────────────────────────────────────────────────── */

/**
 * عدّاد متأنٍّ (قرار المالك: أبطأ ليُستمتع بمشاهدته) — انطلاقة سريعة
 * ثم استقرار طويل هادئ بمنحنى quart-out، لا حشو زمني في الوسط.
 *
 * `delay` يجب أن يساوي تأخير ظهور البطاقة الحاضنة: بدونه تبدأ الحركة
 * والعنصر ما زال شفافًا، فيرى المستخدم العدّ وقد قطع شوطًا (ملاحظة المالك).
 */
export function useCountUp(target: number, duration = 1900, delay = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const start = Date.now();
      const tick = () => {
        const p = Math.min(1, (Date.now() - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        setValue(target * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    setValue(0);
    if (delay > 0) timer = setTimeout(run, delay);
    else run();
    return () => {
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);
  return value;
}

export function CountUpText({
  value,
  format,
  variant = 'numberLarge',
  color,
  style,
  delay = 0,
}: {
  value: number;
  format: (v: number) => string;
  variant?: 'number' | 'numberLarge' | 'label';
  color?: string;
  style?: StyleProp<TextStyle>;
  /** يساوي تأخير ظهور البطاقة الحاضنة. */
  delay?: number;
}) {
  const v = useCountUp(value, 1900, delay);
  return (
    <AppText variant={variant} color={color} style={style}>
      {format(v)}
    </AppText>
  );
}

/* ── حلقة نسبة (donut) ──────────────────────────────────────────────────── */

const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);

export function RingStat({
  percent,
  size = 96,
  strokeWidth = 10,
  color = palette.olive,
  track = 'rgba(0,0,0,0.07)',
  label,
  centerSuffix = '%',
  delay = 0,
}: {
  /** 0..100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  track?: string;
  label: string;
  centerSuffix?: string;
  /** يساوي تأخير ظهور البطاقة الحاضنة — القوس والرقم يبدآن من الصفر معًا. */
  delay?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = useRef(new RNAnimated.Value(c)).current;
  const shown = useCountUp(clamped, 1900, delay);

  useEffect(() => {
    dash.setValue(c); // القوس يعود للصفر قبل كل انطلاقة
    const anim = RNAnimated.timing(dash, {
      toValue: c - (c * clamped) / 100,
      duration: 1900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [clamped, c, dash, delay]);

  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c}`}
            strokeDashoffset={dash}
          />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <AppText variant="number">{`${Math.round(shown)}${centerSuffix}`}</AppText>
        </View>
      </View>
      <AppText variant="caption" color={palette.muted} align="center">
        {label}
      </AppText>
    </View>
  );
}

/* ── شريط مكدّس واحد + مفتاح ────────────────────────────────────────────── */

export interface StackedSegment {
  label: string;
  count: number;
  color: string;
}

export function StackedBar({
  segments,
  delay = 0,
}: {
  segments: StackedSegment[];
  /** يساوي تأخير ظهور البطاقة الحاضنة. */
  delay?: number;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const scale = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    const anim = RNAnimated.timing(scale, {
      toValue: 1,
      duration: 1100,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [scale, delay]);

  return (
    <View style={{ gap: spacing.md }}>
      <RNAnimated.View
        style={{
          flexDirection: 'row-reverse',
          height: 16,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: 'rgba(0,0,0,0.05)',
          transform: [{ scaleX: scale }],
        }}
      >
        {segments
          .filter((s) => s.count > 0)
          .map((s, i, arr) => (
            <View
              key={s.label}
              style={{
                flex: s.count,
                backgroundColor: s.color,
                marginLeft: i < arr.length - 1 ? 2 : 0,
              }}
            />
          ))}
      </RNAnimated.View>
      <Row gap={spacing.md} wrap>
        {segments.map((s) => (
          <Row key={s.label} gap={6}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
            <AppText variant="caption" color={palette.muted}>
              {s.label}
            </AppText>
            <AppText variant="caption" color={palette.charcoal}>
              {total > 0 ? s.count : 0}
            </AppText>
          </Row>
        ))}
      </Row>
    </View>
  );
}

/* ── أعمدة اتجاه مصغّرة ─────────────────────────────────────────────────── */

export function MiniBars({
  data,
  height = 64,
  color = palette.olive,
  highlightLast = true,
  delay = 0,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  highlightLast?: boolean;
  /** يساوي تأخير ظهور البطاقة الحاضنة. */
  delay?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: height + 22 }}>
      {data.map((d, i) => {
        const h = Math.max(5, (d.value / max) * height);
        const last = highlightLast && i === data.length - 1;
        return (
          <Animated.View
            key={`${d.label}-${i}`}
            entering={FadeInDown.delay(delay + 120 + i * 110).duration(620)}
            style={{ flex: 1, alignItems: 'center', gap: 5 }}
          >
            <View
              style={{
                width: '100%',
                height: h,
                borderRadius: 6,
                backgroundColor: last ? palette.terracotta : color,
                opacity: last ? 1 : 0.5,
              }}
            />
            <AppText variant="caption" color={palette.muted} style={{ fontSize: 11 }}>
              {d.label}
            </AppText>
          </Animated.View>
        );
      })}
    </View>
  );
}
