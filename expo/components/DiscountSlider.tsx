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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
const TRACK_H = 10;
/** زنبرك سريع قليل التذبذب: يلتصق كالمغناطيس بلا ارتداد ولا تباطؤ. */
const SNAPPY = { damping: 26, stiffness: 520, mass: 0.4 } as const;
const LABEL_H = 26;
const ROW_H = KNOB + 12;

/** لون الشريط عند نسبة ما: أخضر ← كهرماني ← أحمر بحسب الحدود. */
export function discountTone(pct: number, employeeLimit: number, adminLimit: number): string {
  if (pct <= employeeLimit) return palette.success;
  if (pct <= adminLimit) return palette.warning;
  return palette.danger;
}

interface Snap {
  pct: number;
  label: string;
  kind: 'zero' | 'limit' | 'round';
}

/** خطوة «مريحة» تعطي عددًا معقولًا من النقاط مهما كان حجم العرض. */
function niceStep(rangeShekel: number): number {
  for (const t of [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]) {
    if (rangeShekel / t <= 6) return t;
  }
  return 10000;
}

/**
 * النقاط المغناطيسية: حدود الصلاحية (5% و10%) لأنها تغيّر مسار الموافقة،
 * ونِسَبٌ تُنزل **الإجمالي النهائي** إلى رقم مستدير (1,300 بدل 1,385) لأن
 * التفاوض الحقيقي يجري على الرقم المستدير لا على النسبة.
 */
function buildSnaps(
  subtotalAgorot: number,
  max: number,
  employeeLimit: number,
  adminLimit: number,
): Snap[] {
  const out: Snap[] = [{ pct: 0, label: 'بلا خصم', kind: 'zero' }];

  for (const [limit, label] of [
    [employeeLimit, 'حد الموظف'],
    [adminLimit, 'حد الأدمن'],
  ] as const) {
    if (limit > 0 && limit <= max) out.push({ pct: limit, label, kind: 'limit' });
  }

  if (subtotalAgorot > 0) {
    const rangeShekel = agorotToShekel((subtotalAgorot * max) / 100);
    const stepAgorot = shekelToAgorot(niceStep(rangeShekel));
    const lowest = subtotalAgorot - (subtotalAgorot * max) / 100;
    let target = Math.floor((subtotalAgorot - 1) / stepAgorot) * stepAgorot;
    while (target >= lowest && target > 0) {
      const pct = Math.round(((subtotalAgorot - target) / subtotalAgorot) * 1000) / 10;
      if (pct > 0 && pct <= max) {
        out.push({ pct, label: `الإجمالي ${money(target)}`, kind: 'round' });
      }
      target -= stepAgorot;
    }
  }

  // الحدود تفوز على النقاط المستديرة إن تقاربتا، فمسار الموافقة أهم
  const seen = new Map<string, Snap>();
  for (const s of out.sort((a, b) => (a.kind === 'round' ? 1 : -1))) {
    const key = s.pct.toFixed(1);
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()].sort((a, b) => a.pct - b.pct);
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

  const snaps = useMemo(
    () => buildSnaps(subtotalAgorot, max, employeeLimit, adminLimit),
    [subtotalAgorot, max, employeeLimit, adminLimit],
  );

  /** النقطة التي نقف عليها الآن (إن وُجدت) — تُظهر بطاقة الوصف فوق المقبض. */
  const resting = useMemo(
    () => snaps.find((s) => Math.abs(s.pct - value) < 0.05) ?? null,
    [snaps, value],
  );

  /**
   * موضع المقبض قيمةٌ مشتركة تعمل على الخيط الرسومي، لا مشتقة من حالة
   * React: الاشتقاق كان يعيد تشغيل الزنبرك في كل إطار فيتخلّف المقبض عن
   * الإصبع ويستقر ببطء. الآن يتتبّع الإصبع فورًا، والزنبرك السريع لا يعمل
   * إلا في الجذب إلى نقطة أو عند تغيير القيمة من الحقول اليدوية.
   */
  const pos = useSharedValue(0);
  const dragging = useSharedValue(false);

  const snapPx = useMemo(
    () => (usable > 0 ? snaps.map((s) => (s.pct / max) * usable) : []),
    [snaps, max, usable],
  );

  useEffect(() => {
    if (dragging.value) return;
    pos.value = withSpring(ratio * usable, SNAPPY);
  }, [ratio, usable, pos, dragging]);

  /** RTL: الصفر عند اليمين، فالإزاحة تُقاس من اليمين إلى اليسار. */
  const commitPx = useCallback(
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
          dragging.value = true;
          startPct.value = pos.value;
        })
        .onUpdate((e) => {
          let raw = startPct.value - e.translationX;
          raw = Math.max(0, Math.min(usable, raw));
          // الجذب على الخيط الرسومي نفسه: المقبض يلتصق بالنقطة فورًا
          let target = raw;
          for (let i = 0; i < snapPx.length; i++) {
            if (Math.abs(snapPx[i] - raw) <= 16) {
              target = snapPx[i];
              break;
            }
          }
          pos.value = withSpring(target, SNAPPY);
          runOnJS(commitPx)(target);
        })
        .onFinalize(() => {
          dragging.value = false;
        }),
    [startPct, pos, dragging, usable, snapPx, commitPx],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        let raw = Math.max(0, Math.min(usable, usable - (e.x - KNOB / 2)));
        for (let i = 0; i < snapPx.length; i++) {
          if (Math.abs(snapPx[i] - raw) <= 16) {
            raw = snapPx[i];
            break;
          }
        }
        pos.value = withSpring(raw, SNAPPY);
        runOnJS(commitPx)(raw);
      }),
    [usable, snapPx, pos, commitPx],
  );

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value }] }));

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

      {/* بطاقة الوصف فوق النقطة التي نقف عليها */}
      <View style={{ height: LABEL_H, justifyContent: 'flex-end' }}>
        {!!resting && usable > 0 && (
          <View
            style={[
              styles.snapLabel,
              { borderColor: tone, right: Math.max(0, KNOB / 2 + ratio * usable - 60) },
            ]}
          >
            <AppText variant="caption" color={tone} numberOfLines={1} style={{ fontSize: 12 }}>
              {resting.label}
            </AppText>
          </View>
        )}
      </View>

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

          {/* النقاط المغناطيسية فوق الشريط */}
          {usable > 0 &&
            snaps.map((s) => {
              const on = Math.abs(s.pct - value) < 0.05;
              return (
                <View
                  key={`${s.kind}-${s.pct}`}
                  pointerEvents="none"
                  style={[
                    styles.snapDot,
                    {
                      right: KNOB / 2 + (s.pct / max) * usable - (on ? 4 : 3),
                      width: on ? 8 : 6,
                      height: on ? 8 : 6,
                      borderRadius: on ? 4 : 3,
                      backgroundColor:
                        s.kind === 'limit' ? palette.charcoal : 'rgba(27,31,50,0.35)',
                    },
                  ]}
                />
              );
            })}

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
  /**
   * الصفر عند اليمين: row-reverse مع flex-start يضع المقبض على الحافة
   * اليمنى ثم ينزلق يسارًا. (كان justifyContent: center فيتوسط المقبض
   * بعيدًا عن الشريط.)
   */
  trackWrap: {
    height: ROW_H,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  /**
   * موضع صريح لا absoluteFillObject: الأخير يثبّت top وbottom معًا فيتمدد
   * الشريط على كامل الارتفاع ويُلغى height - وهو سبب ابتعاد المقبض عن الخط.
   */
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (ROW_H - TRACK_H) / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
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
  snapDot: {
    position: 'absolute',
    top: ROW_H / 2 - 4,
  },
  snapLabel: {
    position: 'absolute',
    bottom: 0,
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: palette.white,
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
