import { useRouter } from 'expo-router';
import { AlertTriangle, Layers, Package, Scissors } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Card,
  EmptyState,
  Pill,
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
    const consumed = rolls.reduce((s, r) => s + r.balance.consumedM, 0);
    const value = rolls.reduce(
      (s, r) => s + r.balance.onHandM * (r.variant?.costPerMeterAgorot ?? 0),
      0,
    );
    return { available, reserved, consumed, value };
  }, [rolls]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Row justify="space-between" align="flex-end">
          <AppText variant="title">مخزون الأقمشة</AppText>
          {showCost && (
            <AppText variant="caption" color={palette.muted}>
              قيمة المخزون {money(totals.value, { compact: true })}
            </AppText>
          )}
        </Row>
        {/* الأرقام الثلاثة التي تُدار بها الورشة، بلا زخرفة حولها */}
        <Row gap={spacing.md}>
          <TotalTile label="متاح للحجز" value={meters(totals.available)} tone={palette.success} />
          <TotalTile label="محجوز لمشاريع" value={meters(totals.reserved)} tone={palette.warning} />
          <TotalTile label="مستهلك" value={meters(totals.consumed)} tone={palette.muted} />
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
            const availTone = low ? palette.danger : palette.success;
            // عمر الرول كاملًا: ما بقي (متاح + محجوز) وما خرج (مستهلك)
            const lifetime =
              item.balance.availableM + item.balance.reservedM + item.balance.consumedM;
            const seg = (v: number) => (lifetime > 0 ? (v / lifetime) * 100 : 0);
            return (
              <Card onPress={() => router.push(`/roll/${item.roll.id}`)} style={{ padding: spacing.xl }}>
                <Row justify="space-between" align="flex-start" gap={spacing.md}>
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <Swatch color={item.variant?.colorHex ?? palette.sand} size={44} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="heading" numberOfLines={1}>
                        {item.roll.code}
                      </AppText>
                      <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                        {item.product?.name} • {item.variant?.colorName}
                      </AppText>
                    </View>
                  </Row>
                  {low ? (
                    <Pill
                      label="منخفض"
                      bg={palette.dangerSoft}
                      fg={palette.danger}
                      icon={<AlertTriangle size={12} color={palette.danger} />}
                      small
                    />
                  ) : (
                    item.roll.isMiniRoll && (
                      <Pill label="بواقي" bg={palette.sand} fg={palette.muted} small />
                    )
                  )}
                </Row>

                {/* الأرقام الثلاثة أولًا - المتاح هو القرار، فهو الأكبر */}
                <Row gap={spacing.md} align="flex-end" style={{ marginTop: spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: availTone }]} />
                      <AppText variant="caption" color={palette.muted}>
                        متاح
                      </AppText>
                    </Row>
                    <AppText variant="number" color={availTone}>
                      {meters(item.balance.availableM)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: palette.warning }]} />
                      <AppText variant="caption" color={palette.muted}>
                        محجوز
                      </AppText>
                    </Row>
                    <AppText variant="label">{meters(item.balance.reservedM)}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: palette.sandDeep }]} />
                      <AppText variant="caption" color={palette.muted}>
                        مستهلك
                      </AppText>
                    </Row>
                    <AppText variant="label" color={palette.muted}>
                      {meters(item.balance.consumedM)}
                    </AppText>
                  </View>
                </Row>

                {/* شريط واحد يروي عمر الرول بدل ثلاثة أرقام معلّقة */}
                <View style={styles.bar}>
                  <View style={{ width: `${seg(item.balance.availableM)}%`, backgroundColor: availTone }} />
                  <View style={{ width: `${seg(item.balance.reservedM)}%`, backgroundColor: palette.warning }} />
                  <View style={{ width: `${seg(item.balance.consumedM)}%`, backgroundColor: palette.sandDeep }} />
                </View>

                <AppText variant="caption" color={palette.muted} numberOfLines={1} style={{ marginTop: spacing.sm }}>
                  رف {item.roll.location} • صبغة {item.roll.dyeLot}
                </AppText>
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

/** بلاطة إجمالي علوية: رقم كبير ونقطة لون تربطه بشريط البطاقات. */
function TotalTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.totalTile}>
      <Row gap={5}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <AppText variant="caption" color={palette.muted} numberOfLines={1} style={{ fontSize: 12 }}>
          {label}
        </AppText>
      </Row>
      <AppText variant="number" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  totalTile: {
    flex: 1,
    gap: 2,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bar: {
    flexDirection: 'row-reverse',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.ivoryDeep,
    marginTop: spacing.md,
  },
});
