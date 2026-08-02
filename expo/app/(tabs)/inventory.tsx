import { useRouter } from 'expo-router';
import { AlertTriangle, Layers, Package, Scissors } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Row,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { useRollViews } from '@/hooks/selectors';
import { meters, money } from '@/lib/format';
import { useStore } from '@/providers/store';

type Tab = 'rolls' | 'library';

export default function InventoryScreen() {
  const { db, role } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('rolls');
  const rolls = useRollViews();
  const showCost = role === 'admin';

  const totals = useMemo(() => {
    const available = rolls.reduce((s, r) => s + r.balance.availableM, 0);
    const reserved = rolls.reduce((s, r) => s + r.balance.reservedM, 0);
    const value = rolls.reduce(
      (s, r) => s + r.balance.onHandM * (r.variant?.costPerMeterAgorot ?? 0),
      0,
    );
    return { available, reserved, value };
  }, [rolls]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">المخزون ومكتبة الأقمشة</AppText>
        <Row gap={spacing.md}>
          <View style={{ flex: 1, backgroundColor: palette.sageSoft, borderRadius: radius.lg, padding: spacing.md }}>
            <AppText variant="number">{meters(totals.available)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متاح للحجز
            </AppText>
          </View>
          <View style={{ flex: 1, backgroundColor: palette.terracottaSoft, borderRadius: radius.lg, padding: spacing.md }}>
            <AppText variant="number">{meters(totals.reserved)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              محجوز لمشاريع
            </AppText>
          </View>
          {showCost && (
            <View style={{ flex: 1, backgroundColor: palette.ivoryDeep, borderRadius: radius.lg, padding: spacing.md }}>
              <AppText variant="number">{money(totals.value, { compact: true })}</AppText>
              <AppText variant="caption" color={palette.muted}>
                قيمة المخزون
              </AppText>
            </View>
          )}
        </Row>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rolls', label: 'الرولات' },
            { value: 'library', label: 'مكتبة الأقمشة' },
          ]}
        />
      </View>

      {tab === 'rolls' ? (
        <FlatList
          data={rolls}
          keyExtractor={(r) => r.roll.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const low = item.balance.availableM < LOW_STOCK_THRESHOLD_M;
            const ratio =
              item.balance.onHandM > 0 ? item.balance.availableM / item.balance.onHandM : 0;
            return (
              <Card onPress={() => router.push(`/roll/${item.roll.id}`)}>
                <Row justify="space-between" align="flex-start">
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <Swatch color={item.variant?.colorHex ?? palette.sand} size={46} />
                    <View style={{ flex: 1 }}>
                      <Row gap={spacing.sm}>
                        <AppText variant="heading">{item.roll.code}</AppText>
                        {item.roll.isMiniRoll && (
                          <Pill label="Mini Roll" bg={palette.sand} fg={palette.muted} small />
                        )}
                      </Row>
                      <AppText variant="caption" color={palette.muted}>
                        {item.product?.name} {item.variant?.colorName} • موقع {item.roll.location}
                      </AppText>
                    </View>
                  </Row>
                  {low && <AlertTriangle size={18} color={palette.danger} />}
                </Row>

                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  <ProgressBar
                    value={ratio}
                    color={low ? palette.danger : palette.olive}
                    track={palette.terracottaSoft}
                  />
                  <Row justify="space-between">
                    <Row gap={spacing.md}>
                      <AppText variant="label" color={low ? palette.danger : palette.olive}>
                        متاح {meters(item.balance.availableM)}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        محجوز {meters(item.balance.reservedM)}
                      </AppText>
                    </Row>
                    <AppText variant="caption" color={palette.muted}>
                      Dye lot {item.roll.dyeLot}
                    </AppText>
                  </Row>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={28} color={palette.olive} />}
              title="لا توجد رولات"
              body="أضف رولات لبدء إدارة المخزون."
            />
          }
        />
      ) : (
        <FlatList
          data={db.fabricProducts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const variants = db.fabricVariants.filter((v) => v.productId === item.id);
            return (
              <Card onPress={() => router.push(`/fabric/${item.id}`)}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading">{item.name}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {item.supplier} • عرض {item.widthCm} سم • {item.composition}
                    </AppText>
                  </View>
                  <Layers size={20} color={palette.olive} />
                </Row>
                <Row gap={spacing.sm} style={{ marginTop: spacing.md }} wrap>
                  {variants.map((v) => (
                    <Row key={v.id} gap={6} style={{ alignItems: 'center' }}>
                      <Swatch color={v.colorHex} size={26} />
                      <AppText variant="caption">{v.colorName}</AppText>
                    </Row>
                  ))}
                </Row>
                <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
                  <Pill
                    label={`${db.fabricRolls.filter((r) => variants.some((v) => v.id === r.variantId)).length} رول`}
                    bg={palette.ivoryDeep}
                    fg={palette.muted}
                    small
                    icon={<Scissors size={12} color={palette.muted} />}
                  />
                  {showCost && (
                    <Pill
                      label={`تكلفة من ${money(Math.min(...variants.map((v) => v.costPerMeterAgorot)))}/م`}
                      bg={palette.sand}
                      fg={palette.oliveDark}
                      small
                    />
                  )}
                </Row>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
