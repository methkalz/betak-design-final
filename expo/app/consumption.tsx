/**
 * تقرير الاستهلاك - المخطط مقابل الفعلي (قرار المالك 11.8.2026).
 *
 * على نمط لوحات الفروقات المعتمدة: الفرق يُعرض مطلقًا ونسبةً معًا، والرسم
 * قضيبٌ رصاصي (bullet) لكل شهر - مسارٌ باهت للمخطط وامتلاءٌ للفعلي وما زاد
 * يصبغ بالأحمر - فالفجوة تُقرأ طولًا لا تُستنتج من رقمين متباعدين. والشواذ
 * تتصدر قائمتها: ما طابق الخطة لا يُسرد أصلًا.
 */
import { TrendingUp } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  Divider,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import {
  consumptionOverruns,
  monthConsumptionByVariant,
  monthlyConsumption,
} from '@/domain/reports';
import { formatDate, meters } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function ConsumptionScreen() {
  const { db, role } = useStore();

  const months = useMemo(() => monthlyConsumption(db, 6), [db]);
  const overruns = useMemo(() => consumptionOverruns(db, 180), [db]);
  const byVariant = useMemo(() => monthConsumptionByVariant(db), [db]);

  if (role !== 'admin') {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<TrendingUp size={26} color={palette.olive} />}
          title="غير مصرح"
          body="تقرير الاستهلاك من صلاحيات الأدمن."
        />
      </ScrollScreen>
    );
  }

  const current = months[months.length - 1];
  const currentDiff = current ? Math.round((current.actualM - current.plannedM) * 1000) / 1000 : 0;
  const maxM = Math.max(1, ...months.map((m) => Math.max(m.plannedM, m.actualM)));
  const anyData = months.some((m) => m.plannedM > 0 || m.actualM > 0);

  return (
    <ScrollScreen>
      {/* هذا الشهر: الرقمان الحاكمان والفرق بينهما مطلقًا ونسبة */}
      <Card style={{ padding: spacing.xl }}>
        <SectionHeader title="هذا الشهر" subtitle="من سجلات إنهاء الشبابيك" />
        <Row gap={spacing.xl}>
          <View style={{ flex: 1 }}>
            <AppText variant="numberLarge" style={{ fontSize: 33, lineHeight: 44 }}>
              {meters(current?.actualM ?? 0, false)}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              متر مستهلك
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText
              variant="numberLarge"
              color={palette.muted}
              style={{ fontSize: 33, lineHeight: 44 }}
            >
              {meters(current?.plannedM ?? 0, false)}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              متر مخطط
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
            <Pill
              label={
                currentDiff > 0
                  ? `+${meters(currentDiff)}`
                  : currentDiff < 0
                    ? `−${meters(Math.abs(currentDiff))}`
                    : 'مطابق'
              }
              bg={currentDiff > 0 ? palette.dangerSoft : palette.successSoft}
              fg={currentDiff > 0 ? palette.danger : palette.success}
            />
          </View>
        </Row>
      </Card>

      {/* شهر بشهر: قضيب رصاصي لكل شهر */}
      <Card>
        <SectionHeader
          title="شهر بشهر"
          subtitle="المسار الباهت هو المخطط، والامتلاء هو الفعلي - وما زاد يحمرّ"
        />
        {!anyData && (
          <AppText variant="caption" color={palette.muted}>
            لا استهلاك مسجَّلًا في الأشهر الستة الأخيرة.
          </AppText>
        )}
        <View style={{ gap: spacing.lg }}>
          {months.map((m) => {
            const over = m.actualM > m.plannedM;
            const withinM = Math.min(m.actualM, m.plannedM);
            const pct = (v: number) => `${Math.min(100, (v / maxM) * 100)}%` as const;
            const diff = Math.round((m.actualM - m.plannedM) * 1000) / 1000;
            const diffPct = m.plannedM > 0 ? Math.round((diff / m.plannedM) * 1000) / 10 : 0;
            return (
              <View key={m.key} style={{ gap: 4 }}>
                <Row justify="space-between" align="baseline">
                  <AppText variant="label">{m.label}</AppText>
                  <Row gap={spacing.sm} align="baseline">
                    <AppText variant="number" color={over ? palette.danger : palette.charcoal}>
                      {meters(m.actualM, false)}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      من {meters(m.plannedM, false)} مخططة
                    </AppText>
                    {diff !== 0 && m.plannedM > 0 && (
                      <AppText
                        variant="caption"
                        color={diff > 0 ? palette.danger : palette.success}
                      >
                        {diff > 0 ? `+${diffPct}%` : `${diffPct}%`}
                      </AppText>
                    )}
                  </Row>
                </Row>
                {/* القضيب: مسار المخطط ثم الفعلي فوقه، والزيادة قطعة حمراء */}
                <View style={styles.track}>
                  <View style={[styles.planned, { width: pct(m.plannedM) }]} />
                  <View style={[styles.actual, { width: pct(withinM) }]} />
                  {over && (
                    <View
                      style={[
                        styles.overflow,
                        { insetInlineStart: pct(m.plannedM), width: pct(m.actualM - m.plannedM) } as const,
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* الزيادات الواضحة: الاستثناء يتصدر، والمطابق لا يُسرد */}
      <Card>
        <SectionHeader
          title="الزيادات عن المخطط"
          subtitle="آخر 6 أشهر - الأكبر أولًا، وسببها كما كتبه الخياط"
        />
        {overruns.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا زيادات - كل إنهاءٍ ضمن مخططه. هذا هو الوضع الصحي.
          </AppText>
        )}
        {overruns.map((o, i) => (
          <View key={o.usageId}>
            {i > 0 && <Divider />}
            <Row justify="space-between" align="flex-start" style={{ paddingVertical: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {o.windowName} • {o.projectTitle}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {formatDate(o.createdAt)}
                  {o.byName ? ` • ${o.byName}` : ''}
                </AppText>
                {!!o.notes && (
                  <AppText variant="caption" color={palette.charcoal}>
                    «{o.notes}»
                  </AppText>
                )}
              </View>
              <Pill
                label={`+${meters(o.overM)} (${o.overPct}%)`}
                bg={palette.dangerSoft}
                fg={palette.danger}
                small
              />
            </Row>
          </View>
        ))}
      </Card>

      {/* استهلاك الشهر حسب الصنف */}
      {byVariant.length > 0 && (
        <Card>
          <SectionHeader title="هذا الشهر حسب الصنف" />
          <View style={{ gap: spacing.md }}>
            {byVariant.map((v) => {
              const maxV = byVariant[0]?.meters || 1;
              return (
                <View key={v.variantId} style={{ gap: 4 }}>
                  <Row justify="space-between">
                    <Row gap={spacing.sm}>
                      <Swatch color={v.colorHex} size={22} />
                      <AppText variant="label">{v.name}</AppText>
                    </Row>
                    <AppText variant="number">{meters(v.meters, false)}</AppText>
                  </Row>
                  <View style={styles.track}>
                    <View style={[styles.actual, { width: `${(v.meters / maxV) * 100}%` as const }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      <AppText variant="caption" color={palette.muted} align="center">
        المخطط يُؤخذ من حاجة كل شباك لحظة إنهائه، والفعلي مما أكّده الخياط.
      </AppText>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.ivoryDeep,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  planned: {
    position: 'absolute',
    insetInlineStart: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.sandDeep,
    borderRadius: 5,
  },
  actual: {
    position: 'absolute',
    insetInlineStart: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.olive,
    borderRadius: 5,
  },
  overflow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: palette.danger,
  },
});
