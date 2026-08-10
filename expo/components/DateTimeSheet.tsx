/**
 * ورقة اختيار موعد: اقتراحات سريعة + تقويم كامل + توقيت اختياري.
 *
 * بأسلوب التطبيق لا بحوار النظام - فمنتقي التاريخ الأصلي يفرض خطوط
 * المنصة وألوانها ويقطع الهوية، وهو أيضًا لا يعرض الاقتراحات السريعة التي
 * تغطي معظم الحالات (اليوم، غدًا، بعد غد، الأسبوع القادم).
 *
 * التوقيت اختياري بقرار المالك: كثير من المواعيد تُحجز باليوم أولًا ثم
 * تُضبط ساعتها بالاتفاق مع الزبون.
 */
import { Clock3, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { AppText, Button, Row } from '@/components/ui';
import { font, palette, radius, shadow, spacing } from '@/constants/theme';
import { formatDate } from '@/lib/format';

const WEEKDAYS = ['أح', 'اث', 'ثل', 'أر', 'خم', 'جم', 'سب'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function DateTimeSheet({
  visible,
  value,
  title = 'اختر الموعد',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  /** ISO أو null */
  value: string | null;
  title?: string;
  onConfirm: (iso: string) => void;
  onCancel: () => void;
}) {
  const initial = useMemo(() => (value ? new Date(value) : new Date()), [value]);
  const [cursor, setCursor] = useState<Date>(startOfDay(initial));
  const [picked, setPicked] = useState<Date>(startOfDay(initial));
  const [withTime, setWithTime] = useState<boolean>(false);
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);

  useEffect(() => {
    if (!visible) return;
    const d = value ? new Date(value) : new Date();
    setCursor(startOfDay(d));
    setPicked(startOfDay(d));
    setWithTime(!!value && (d.getHours() !== 9 || d.getMinutes() !== 0));
    setHour(value ? d.getHours() : 9);
    setMinute(value ? (d.getMinutes() >= 30 ? 30 : 0) : 0);
  }, [visible, value]);

  const today = startOfDay(new Date());

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay(); // الأحد = 0، ويطابق ترتيب WEEKDAYS
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const quick: { label: string; date: Date }[] = useMemo(() => {
    const mk = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return startOfDay(d);
    };
    return [
      { label: 'اليوم', date: mk(0) },
      { label: 'غدًا', date: mk(1) },
      { label: 'بعد غد', date: mk(2) },
      { label: 'الأسبوع القادم', date: mk(7) },
    ];
  }, []);

  const confirm = () => {
    const out = new Date(picked);
    out.setHours(withTime ? hour : 9, withTime ? minute : 0, 0, 0);
    onConfirm(out.toISOString());
  };

  const shift = (months: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.wrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet}>
          <View style={styles.grip} />
          <Row justify="space-between">
            <AppText variant="heading">{title}</AppText>
            <Pressable onPress={onCancel} hitSlop={10}>
              <X size={20} color={palette.muted} />
            </Pressable>
          </Row>

          {/* اقتراحات سريعة تغطي معظم الحالات */}
          <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
            {quick.map((q) => {
              const on = sameDay(q.date, picked);
              return (
                <Pressable
                  key={q.label}
                  onPress={() => {
                    setPicked(q.date);
                    setCursor(startOfDay(q.date));
                  }}
                  style={[styles.quick, on && { backgroundColor: palette.olive, borderColor: palette.olive }]}
                >
                  <AppText variant="caption" color={on ? palette.white : palette.charcoal}>
                    {q.label}
                  </AppText>
                </Pressable>
              );
            })}
          </Row>

          {/* التقويم */}
          <Row justify="space-between" style={{ marginTop: spacing.lg }}>
            <Pressable onPress={() => shift(-1)} hitSlop={12} style={styles.navBtn}>
              <AppText variant="label" color={palette.olive}>
                ‹
              </AppText>
            </Pressable>
            <AppText variant="label">
              {cursor.getMonth() + 1} / {cursor.getFullYear()}
            </AppText>
            <Pressable onPress={() => shift(1)} hitSlop={12} style={styles.navBtn}>
              <AppText variant="label" color={palette.olive}>
                ›
              </AppText>
            </Pressable>
          </Row>

          <View style={styles.grid}>
            {WEEKDAYS.map((w) => (
              <View key={w} style={styles.cell}>
                <AppText variant="caption" color={palette.muted} style={{ fontSize: 11 }}>
                  {w}
                </AppText>
              </View>
            ))}
            {grid.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={styles.cell} />;
              const on = sameDay(d, picked);
              const isToday = sameDay(d, today);
              const past = d < today;
              return (
                <Pressable key={d.toISOString()} onPress={() => setPicked(d)} style={styles.cell}>
                  <View
                    style={[
                      styles.day,
                      on && { backgroundColor: palette.olive },
                      !on && isToday && { borderWidth: 1.5, borderColor: palette.olive },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={on ? palette.white : past ? palette.muted : palette.charcoal}
                      style={on ? { fontFamily: font.bold } : undefined}
                    >
                      {d.getDate()}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* التوقيت - اختياري */}
          <Pressable onPress={() => setWithTime((v) => !v)} style={styles.timeToggle}>
            <Row gap={spacing.sm}>
              <Clock3 size={17} color={withTime ? palette.olive : palette.muted} />
              <AppText variant="label" color={withTime ? palette.olive : palette.muted}>
                {withTime ? 'التوقيت محدد' : 'إضافة توقيت (اختياري)'}
              </AppText>
            </Row>
          </Pressable>

          {withTime && (
            <View style={{ gap: spacing.sm }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.sm }}
              >
                {HOURS.map((h) => {
                  const on = h === hour;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHour(h)}
                      style={[styles.hour, on && { backgroundColor: palette.olive, borderColor: palette.olive }]}
                    >
                      <AppText variant="caption" color={on ? palette.white : palette.charcoal}>
                        {h}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Row gap={spacing.sm}>
                {[0, 30].map((m) => {
                  const on = m === minute;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMinute(m)}
                      style={[
                        styles.minute,
                        on && { backgroundColor: palette.sand, borderColor: palette.olive },
                      ]}
                    >
                      <AppText variant="caption" color={on ? palette.oliveDark : palette.muted}>
                        :{m === 0 ? '00' : '30'}
                      </AppText>
                    </Pressable>
                  );
                })}
              </Row>
            </View>
          )}

          <Button
            label={`تأكيد ${formatDate(picked.toISOString())}${
              withTime ? ` - ${hour}:${minute === 0 ? '00' : '30'}` : ''
            }`}
            full
            onPress={confirm}
            style={{ marginTop: spacing.md }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,18,34,0.45)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
    ...shadow.raised,
  },
  grip: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.sandDeep,
    marginBottom: spacing.md,
  },
  quick: {
    paddingHorizontal: spacing.md,
    height: 38,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  cell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeToggle: { paddingVertical: spacing.md },
  hour: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
  },
  minute: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
  },
});
