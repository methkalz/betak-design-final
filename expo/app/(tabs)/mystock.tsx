/**
 * بضاعتي - مخزون الخياط (M17/M25).
 *
 * كل ما أُسند إليه من بضاعة، بكل تفاصيله وأرصدته - قراءةً فقط: الحركة تبقى
 * حكرًا على مسارات الحجز والاستهلاك المضبوطة، فالخياط يرى ولا يعدّل.
 *
 * البطاقة على نسق بطاقات المخزون عند الأدمن: رقم بطل واحد (المتاح)، شريط
 * عمر الرول، وسطر إسناد هادئ - لغة واحدة للمخزون في كل التطبيق.
 */
import { AlertTriangle, PackageOpen } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, EmptyState, Pill, Row, Swatch } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { useRollViews } from '@/hooks/selectors';
import { meters } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function MyStockScreen() {
  const { currentUser } = useStore();
  const insets = useSafeAreaInsets();
  const rolls = useRollViews();

  const mine = useMemo(
    () => rolls.filter((r) => r.roll.assignedTailorId === currentUser?.id),
    [rolls, currentUser?.id],
  );

  const totals = useMemo(
    () => ({
      available: mine.reduce((s, r) => s + r.balance.availableM, 0),
      reserved: mine.reduce((s, r) => s + r.balance.reservedM, 0),
      consumed: mine.reduce((s, r) => s + r.balance.consumedM, 0),
    }),
    [mine],
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">بضاعتي</AppText>
        <Row gap={spacing.md}>
          <View style={[styles.tile, { backgroundColor: palette.sageSoft }]}>
            <AppText variant="number">{meters(totals.available, false)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متاح عندك
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.warningSoft }]}>
            <AppText variant="number">{meters(totals.reserved, false)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              محجوز لمشاريع
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.ivoryDeep }]}>
            <AppText variant="number">{meters(totals.consumed, false)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              استهلكتَه
            </AppText>
          </View>
        </Row>
        <AppText variant="caption" color={palette.muted}>
          للعرض فقط - الحجز والاستهلاك يجريان من أوامر الإنتاج، والتعديل بيد الإدارة.
        </AppText>
      </View>

      <FlatList
        data={mine}
        keyExtractor={(r) => r.roll.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const low = item.balance.availableM < LOW_STOCK_THRESHOLD_M;
          const tone = low ? palette.danger : palette.success;
          const lifetime =
            item.balance.availableM + item.balance.reservedM + item.balance.consumedM;
          const seg = (v: number) => (lifetime > 0 ? (v / lifetime) * 100 : 0);
          return (
            <Card style={{ padding: spacing.xl }}>
              <Row justify="space-between" align="center" gap={spacing.md}>
                <Row gap={spacing.md} style={{ flex: 1 }}>
                  <Swatch color={item.variant?.colorHex ?? palette.sand} size={44} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" numberOfLines={1} style={{ fontSize: 16.5 }}>
                      {item.product?.name} {item.variant?.colorName}
                    </AppText>
                    <Row gap={spacing.sm}>
                      <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                        {item.roll.code} • دفعة {item.roll.dyeLot}
                      </AppText>
                      {item.roll.isMiniRoll && (
                        <Pill label="بواقي" bg={palette.sand} fg={palette.muted} small />
                      )}
                    </Row>
                  </View>
                </Row>
                <View style={{ alignItems: 'flex-start' }}>
                  <Row gap={4} align="baseline">
                    <AppText variant="numberLarge" color={tone}>
                      {meters(item.balance.availableM, false)}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      متر
                    </AppText>
                  </Row>
                  <Row gap={5}>
                    {low && <AlertTriangle size={12} color={palette.danger} />}
                    <AppText variant="caption" color={low ? palette.danger : palette.muted}>
                      متاح
                    </AppText>
                  </Row>
                </View>
              </Row>

              <View style={styles.bar}>
                <View style={{ width: `${seg(item.balance.availableM)}%`, backgroundColor: tone }} />
                <View
                  style={{ width: `${seg(item.balance.reservedM)}%`, backgroundColor: palette.warning }}
                />
                <View
                  style={{ width: `${seg(item.balance.consumedM)}%`, backgroundColor: palette.sandDeep }}
                />
              </View>

              <Row justify="space-between" gap={spacing.sm} style={{ marginTop: spacing.sm }}>
                <AppText variant="caption" color={palette.muted}>
                  محجوز {meters(item.balance.reservedM)} • مستهلك {meters(item.balance.consumedM)}
                </AppText>
                <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                  استُلم {meters(item.roll.initialMeters)}
                </AppText>
              </Row>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<PackageOpen size={28} color={palette.olive} />}
            title="لا بضاعة مسنَدة إليك بعد"
            body="حين تستلم الإدارة بضاعة وتسندها إليك ستظهر هنا بكل تفاصيلها."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  bar: {
    flexDirection: 'row-reverse',
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.ivoryDeep,
    marginTop: spacing.md,
  },
});
