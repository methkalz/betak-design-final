/**
 * منزلق الخصم الذكي — يُقاد بـ**الإجمالي النهائي المستهدَف** لا بالنسبة.
 *
 * التفاوض الحقيقي يجري على الرقم المستدير: «انزل إلى 1600»، لا «انزل 13.51%».
 * فالعصا تقف بالضبط على 1600 و1400 و1200 (نقاطٌ مغناطيسية)، ويمكن الوقوف
 * حرًّا على 1550 بينها. القراءة الأساسية هي الإجمالي المستهدَف، والخصم مبلغٌ
 * مطلقٌ دقيق يُخرَج للأعلى (لا نسبةٌ تُقرِّب فتُخطئ الرقم).
 *
 * لون الشريط يترجم **الصلاحية** لا المقدار: أخضر ما دام ضمن حد الموظف،
 * فيصفرّ حتى حد الأدمن (يلزم اعتماد)، ثم يحمرّ فوقه. والنسبة تُشتقّ من المبلغ
 * لهذا الغرض وحده.
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
const SNAPPY = { damping: 26, stiffness: 520, mass: 0.4 } as const;
const LABEL_H = 26;
const ROW_H = KNOB + 12;

/** إسقاطٌ إلى الشيكل الصحيح (مضاعف 100 أغورة). */
function floorToShekel(agorot: number): number {
  return Math.floor(agorot / 100) * 100;
}

/** لون الشريط عند نسبةٍ مشتقّة: أخضر ← كهرماني ← أحمر بحسب الحدود. */
export function discountTone(pct: number, employeeLimit: number, adminLimit: number): string {
  if (pct <= employeeLimit) return palette.success;
  if (pct <= adminLimit) return palette.warning;
  return palette.danger;
}

interface Snap {
  /** مبلغ الخصم عند هذه النقطة (أغورة). */
  discount: number;
  label: string;
  kind: 'zero' | 'limit' | 'round';
}

/** خطوة «مريحة» تعطي عددًا معقولًا من النقاط المستديرة مهما كان حجم العرض. */
function niceStep(rangeShekel: number): number {
  for (const t of [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]) {
    if (rangeShekel / t <= 6) return t;
  }
  return 10000;
}

/**
 * النقاط المغناطيسية بوصفها **مبالغ خصم**: صفر، وحدود الصلاحية (لأنها تغيّر
 * مسار الموافقة)، وخصومٌ تُنزل الإجمالي إلى رقمٍ مستدير (1,600 بدل 1,658).
 */
function buildSnaps(
  subtotalAgorot: number,
  maxDiscount: number,
  employeeLimit: number,
  adminLimit: number,
): Snap[] {
  const out: Snap[] = [{ discount: 0, label: 'بلا خصم', kind: 'zero' }];

  for (const [limit, label] of [
    [employeeLimit, 'حد الموظف'],
    [adminLimit, 'حد الأدمن'],
  ] as const) {
    const d = floorToShekel((subtotalAgorot * limit) / 100);
    if (d > 0 && d <= maxDiscount) out.push({ discount: d, label, kind: 'limit' });
  }

  if (subtotalAgorot > 0 && maxDiscount > 0) {
    const rangeShekel = agorotToShekel(maxDiscount);
    const stepAgorot = shekelToAgorot(niceStep(rangeShekel));
    const lowestTotal = subtotalAgorot - maxDiscount;
    let target = Math.floor((subtotalAgorot - 1) / stepAgorot) * stepAgorot;
    while (target >= lowestTotal && target > 0) {
      const discount = subtotalAgorot - target;
      if (discount > 0 && discount <= maxDiscount) {
        out.push({ discount, label: `الإجمالي ${money(target)}`, kind: 'round' });
      }
      target -= stepAgorot;
    }
  }

  // الحدود تفوز على النقاط المستديرة إن تقاربتا، فمسار الموافقة أهم
  const seen = new Map<number, Snap>();
  for (const s of out.sort((a, b) => (a.kind === 'round' ? 1 : -1))) {
    const key = Math.round(s.discount / 100);
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()].sort((a, b) => a.discount - b.discount);
}

export function DiscountSlider({
  subtotalAgorot,
  value,
  onChange,
  employeeLimit,
  adminLimit,
  maxPct,
}: {
  subtotalAgorot: number;
  /** مبلغ الخصم الحالي (أغورة). */
  value: number;
  onChange: (discountAgorot: number) => void;
  employeeLimit: number;
  adminLimit: number;
  /** أقصى نسبة خصمٍ مسموحة (يُشتقّ منها أقصى مبلغ). */
  maxPct: number;
}) {
  const [width, setWidth] = useState(0);
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  const [discountDraft, setDiscountDraft] = useState<string | null>(null);
  const startPos = useSharedValue(0);

  const maxDiscount = Math.max(0, floorToShekel((subtotalAgorot * maxPct) / 100));
  const clamped = Math.min(Math.max(0, value), maxDiscount);
  const derivedPct = subtotalAgorot > 0 ? (clamped / subtotalAgorot) * 100 : 0;
  const targetTotal = subtotalAgorot - clamped;

  const ratio = maxDiscount > 0 ? Math.min(1, Math.max(0, clamped / maxDiscount)) : 0;
  const usable = Math.max(0, width - KNOB);
  const tone = discountTone(derivedPct, employeeLimit, adminLimit);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const snaps = useMemo(
    () => buildSnaps(subtotalAgorot, maxDiscount, employeeLimit, adminLimit),
    [subtotalAgorot, maxDiscount, employeeLimit, adminLimit],
  );

  const resting = useMemo(
    () => snaps.find((s) => Math.abs(s.discount - clamped) < 50) ?? null,
    [snaps, clamped],
  );

  const pos = useSharedValue(0);
  const dragging = useSharedValue(false);

  const snapPx = useMemo(
    () => (usable > 0 && maxDiscount > 0 ? snaps.map((s) => (s.discount / maxDiscount) * usable) : []),
    [snaps, maxDiscount, usable],
  );

  useEffect(() => {
    if (dragging.value) return;
    pos.value = withSpring(ratio * usable, SNAPPY);
  }, [ratio, usable, pos, dragging]);

  /** RTL: الصفر عند اليمين. البكسل → مبلغ خصمٍ صحيحٍ بالشيكل. */
  const commitPx = useCallback(
    (px: number) => {
      if (usable <= 0 || maxDiscount <= 0) return;
      const r = Math.min(1, Math.max(0, px / usable));
      onChange(floorToShekel(r * maxDiscount));
    },
    [usable, maxDiscount, onChange],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragging.value = true;
          startPos.value = pos.value;
        })
        .onUpdate((e) => {
          let raw = startPos.value - e.translationX;
          raw = Math.max(0, Math.min(usable, raw));
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
    [startPos, pos, dragging, usable, snapPx, commitPx],
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

  const applyTarget = (t: string) => {
    setTotalDraft(t);
    setDiscountDraft(null);
    const n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    const d = subtotalAgorot - shekelToAgorot(n);
    onChange(Math.min(maxDiscount, Math.max(0, floorToShekel(d))));
  };

  const applyDiscount = (t: string) => {
    setDiscountDraft(t);
    setTotalDraft(null);
    const n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    onChange(Math.min(maxDiscount, Math.max(0, floorToShekel(shekelToAgorot(n)))));
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {/* القراءة الحية: الإجمالي المستهدَف هو البطل */}
      <Row justify="space-between" align="flex-end">
        <View>
          <AppText variant="caption" color={palette.muted}>
            الإجمالي المستهدَف
          </AppText>
          <AppText variant="numberLarge" color={tone}>
            {money(targetTotal)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <AppText variant="caption" color={palette.muted}>
            الخصم
          </AppText>
          <Row gap={6} align="baseline">
            <AppText variant="number">{money(clamped)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {percent(Math.round(derivedPct * 10) / 10)}
            </AppText>
          </Row>
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
              locations={[0, Math.min(0.85, maxPct > 0 ? adminLimit / maxPct : 0.85), 1]}
              start={{ x: 1, y: 0.5 }}
              end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.trackRest, { width: `${(1 - ratio) * 100}%` }]} />
          </View>

          {usable > 0 &&
            maxDiscount > 0 &&
            snaps.map((s) => {
              const on = Math.abs(s.discount - clamped) < 50;
              return (
                <View
                  key={`${s.kind}-${s.discount}`}
                  pointerEvents="none"
                  style={[
                    styles.snapDot,
                    {
                      right: KNOB / 2 + (s.discount / maxDiscount) * usable - (on ? 4 : 3),
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
          {money(subtotalAgorot - maxDiscount)}
        </AppText>
        <AppText variant="caption" color={palette.muted}>
          {money(subtotalAgorot)}
        </AppText>
      </Row>

      {/* الإدخال اليدوي بالوجهين: الإجمالي المستهدَف أو مبلغ الخصم */}
      <Row gap={spacing.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <Field
            label="الإجمالي المستهدَف"
            value={totalDraft ?? String(agorotToShekel(targetTotal))}
            onChangeText={applyTarget}
            keyboardType="decimal-pad"
            suffix="₪"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="مبلغ الخصم"
            value={discountDraft ?? String(agorotToShekel(clamped))}
            onChangeText={applyDiscount}
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
    height: ROW_H,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  track: {
    flex: 1,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    overflow: 'hidden',
    backgroundColor: palette.sandDeep,
  },
  trackRest: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.sandDeep,
  },
  knob: {
    position: 'absolute',
    right: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: palette.white,
    borderWidth: 3,
    ...({ elevation: 4 } as object),
    shadowColor: '#1B1F32',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  snapDot: {
    position: 'absolute',
    top: ROW_H / 2 - 3,
  },
  snapLabel: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1.4,
    backgroundColor: palette.white,
    minWidth: 120,
    alignItems: 'center',
  },
});
