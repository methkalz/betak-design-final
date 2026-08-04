/**
 * منزلق الخصم — سحبٌ حيّ بمقبض، والمبالغ تتبدّل تحت إصبعك.
 *
 * لون الشريط ليس زينة: يترجم **الصلاحية** لا المقدار. أخضر ما دام الخصم
 * ضمن حد الموظف، فيصفرّ تدريجيًا حتى حد الأدمن (يلزم اعتماد)، ثم يحمرّ
 * فوقه (يلزم Override موثق). فيعرف المستخدم أثر حركته قبل أن يرفع إصبعه.
 *
 * والإدخال اليدوي بالوجهين: نسبة مئوية أو مبلغ بالشيكل - يكتب أيهما شاء
 * فيحسب الآخر، لأن البائع يفاوض أحيانًا بالنسبة وأحيانًا بمبلغ مقطوع.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AppText, Field, Row } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { agorotToShekel, money, percent, shekelToAgorot } from '@/lib/format';

const KNOB = 30;

/** لون الشريط عند نسبة ما: أخضر ← كهرماني ← أحمر بحسب الحدود. */
export function discountTone(pct: number, employeeLimit: number, adminLimit: number): string {
  if (pct <= employeeLimit) return palette.success;
  if (pct <= adminLimit) return palette.warning;
  return palette.danger;
}

export function DiscountSlider({
  value,
  onChange,
  max,
  employeeLimit,
  adminLimit,
  subtotalAgorot,
  discountAgorot,
  totalAgorot,
}: {
  /** النسبة الحالية (0..max) */
  value: number;
  onChange: (pct: number) => void;
  max: number;
  employeeLimit: number;
  adminLimit: number;
  subtotalAgorot: number;
  discountAgorot: number;
  totalAgorot: number;
}) {
  const [width, setWidth] = useState(0);
  const [shekelDraft, setShekelDraft] = useState<string | null>(null);
  const [pctDraft, setPctDraft] = useState<string | null>(null);
  const startPct = useSharedValue(0);

  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const usable = Math.max(0, width - KNOB);
  const tone = discountTone(value, employeeLimit, adminLimit);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  /** RTL: الصفر عند اليمين، فالإزاحة تُقاس من اليمين إلى اليسار. */
  const commit = useCallback(
    (px: number) => {
      if (usable <= 0) return;
      const r = Math.min(1, Math.max(0, px / usable));
      onChange(Math.round(r * max * 10) / 10);
    },
    [usable, max, onChange],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          startPct.value = ratio;
        })
        .onUpdate((e) => {
          const from = startPct.value * usable;
          runOnJS(commit)(from - e.translationX);
        }),
    [startPct, ratio, usable, commit],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        runOnJS(commit)(usable - (e.x - KNOB / 2));
      }),
    [usable, commit],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(-ratio * usable, { damping: 20, stiffness: 220 }) }],
  }));

  const applyPct = (t: string) => {
    setPctDraft(t);
    setShekelDraft(null);
    const n = parseFloat(t.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(0, Math.round(n * 10) / 10)));
  };

  const applyShekel = (t: string) => {
    setShekelDraft(t);
    setPctDraft(null);
    const n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n) || subtotalAgorot <= 0) return;
    const pct = (shekelToAgorot(n) / subtotalAgorot) * 100;
    onChange(Math.min(max, Math.max(0, Math.round(pct * 10) / 10)));
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {/* القراءة الحية */}
      <Row justify="space-between" align="flex-end">
        <View>
          <AppText variant="caption" color={palette.muted}>
            نسبة الخصم
          </AppText>
          <Row gap={6} align="baseline">
            <AppText variant="numberLarge" color={tone}>
              {percent(value)}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              {money(discountAgorot)}
            </AppText>
          </Row>
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <AppText variant="caption" color={palette.muted}>
            المبلغ النهائي
          </AppText>
          <AppText variant="number">{money(totalAgorot)}</AppText>
        </View>
      </Row>

      {/* الشريط */}
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View style={styles.trackWrap} onLayout={onLayout} collapsable={false}>
          <View style={styles.track}>
            <LinearGradient
              colors={[palette.success, palette.warning, palette.danger]}
              locations={[0, Math.min(0.85, adminLimit / Math.max(max, 1)), 1]}
              start={{ x: 1, y: 0.5 }}
              end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            {/* الجزء غير المستخدم يُغطّى فيبقى اللون معبّرًا عن الموضع */}
            <View style={[styles.trackRest, { width: `${(1 - ratio) * 100}%` }]} />
          </View>
          <Animated.View style={[styles.knob, { borderColor: tone }, knobStyle]} />
        </View>
      </GestureDetector>

      <Row justify="space-between">
        <AppText variant="caption" color={palette.muted}>
          0%
        </AppText>
        <AppText variant="caption" color={palette.muted}>
          {percent(max)}
        </AppText>
      </Row>

      {/* الإدخال اليدوي بالوجهين */}
      <Row gap={spacing.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <Field
            label="نسبة مئوية"
            value={pctDraft ?? String(value)}
            onChangeText={applyPct}
            keyboardType="decimal-pad"
            suffix="%"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="مبلغ الخصم"
            value={shekelDraft ?? String(agorotToShekel(discountAgorot))}
            onChangeText={applyShekel}
            keyboardType="decimal-pad"
            suffix="₪"
          />
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: {
    height: KNOB + 8,
    justifyContent: 'center',
    flexDirection: 'row-reverse',
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    top: (KNOB + 8) / 2 - 5,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: palette.sand,
  },
  trackRest: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.sand,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: palette.white,
    borderWidth: 3,
    shadowColor: '#3F3D8F',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
