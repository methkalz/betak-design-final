/**
 * بضاعتي - مخزون الخياط (M17/M25).
 *
 * كل ما أُسند إليه من بضاعة، قراءةً فقط: الحركة تبقى حكرًا على مسارات
 * الحجز والاستهلاك المضبوطة، فالخياط يرى ولا يعدّل.
 *
 * والعرض بالأمتار لكل صنفٍ لا بالرولات (قرار المالك 8.8.2026): بطاقة لكل
 * لونٍ برقمه البطل، واستلاماته تحته مباشرةً - قائمته قصيرة فلا شاشة خلف
 * ضغطة، بل التفصيل حاضرٌ في البطاقة نفسها.
 */
import { AlertTriangle, PackageOpen } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Divider, EmptyState, Pill, Row, Swatch } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { availabilityTone } from '@/domain/inventory';
import { round3 } from '@/domain/pricing';
import { useRollViews } from '@/hooks/selectors';
import { formatDate, meters } from '@/lib/format';
import { useStore } from '@/providers/store';

/** عدّ الاستلامات بعربيةٍ سليمة: واحد، اثنان (مثنّى)، ثم جمع. */
function receiptsLabel(n: number): string {
  if (n === 1) return 'استلام واحد';
  if (n === 2) return 'استلامان';
  return `${n} استلامات`;
}

export default function MyStockScreen() {
  const { currentUser } = useStore();
  const insets = useSafeAreaInsets();
  const rolls = useRollViews();

  const mine = useMemo(
    () => rolls.filter((r) => r.roll.assignedTailorId === currentUser?.id),
    [rolls, currentUser?.id],
  );

  // التجميع محليًا لا من useVariantStockViews: هناك يُجمع مخزون المعرض كله،
  // وهنا حصّة هذا الخياط وحدها من كل صنف
  const groups = useMemo(() => {
    const map = new Map<string, {
      variantId: string;
      variant: (typeof mine)[number]['variant'];
      product: (typeof mine)[number]['product'];
      availableM: number;
      reservedM: number;
      consumedM: number;
      receipts: typeof mine;
    }>();
    for (const r of mine) {
      let g = map.get(r.roll.variantId);
      if (!g) {
        g = {
          variantId: r.roll.variantId,
          variant: r.variant,
          product: r.product,
          availableM: 0,
          reservedM: 0,
          consumedM: 0,
          receipts: [],
        };
        map.set(r.roll.variantId, g);
      }
      g.availableM = round3(g.availableM + r.balance.availableM);
      g.reservedM = round3(g.reservedM + r.balance.reservedM);
      g.consumedM = round3(g.consumedM + r.balance.consumedM);
      g.receipts.push(r);
    }
    for (const g of map.values()) {
      g.receipts.sort((a, b) => b.roll.createdAt.localeCompare(a.roll.createdAt));
    }
    return Array.from(map.values()).sort((a, b) => b.availableM - a.availableM);
  }, [mine]);

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
        data={groups}
        keyExtractor={(g) => g.variantId}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const level = availabilityTone(item.availableM);
          const tone =
            level === 'danger'
              ? palette.danger
              : level === 'warning'
                ? palette.warning
                : palette.success;
          const lifetime = item.availableM + item.reservedM + item.consumedM;
          const seg = (v: number) => (lifetime > 0 ? (v / lifetime) * 100 : 0);
          return (
            <Card style={{ padding: spacing.xl }}>
              <Row justify="space-between" align="center" gap={spacing.md}>
                <Row gap={spacing.md} style={{ flex: 1 }}>
                  <Swatch color={item.variant?.colorHex ?? palette.sand} size={44} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" numberOfLines={1} style={{ fontSize: 18 }}>
                      {item.product?.name}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {item.variant?.colorName} • {receiptsLabel(item.receipts.length)}
                    </AppText>
                  </View>
                </Row>
                <View style={{ alignItems: 'flex-start' }}>
                  <Row gap={4} align="baseline">
                    <AppText
                      variant="numberLarge"
                      color={tone}
                      style={{ fontSize: 33, lineHeight: 44 }}
                    >
                      {meters(item.availableM, false)}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      متر
                    </AppText>
                  </Row>
                  <Row gap={5}>
                    {level === 'danger' && <AlertTriangle size={12} color={palette.danger} />}
                    <AppText
                      variant="caption"
                      color={level === 'success' ? palette.muted : tone}
                    >
                      {level === 'danger'
                        ? 'منخفض'
                        : level === 'warning'
                          ? 'يقترب من الحد'
                          : 'متاح'}
                    </AppText>
                  </Row>
                </View>
              </Row>

              <View style={styles.bar}>
                <View style={{ width: `${seg(item.availableM)}%`, backgroundColor: tone }} />
                <View
                  style={{ width: `${seg(item.reservedM)}%`, backgroundColor: palette.warning }}
                />
                <View
                  style={{ width: `${seg(item.consumedM)}%`, backgroundColor: palette.sandDeep }}
                />
              </View>
              <AppText
                variant="caption"
                color={palette.muted}
                style={{ marginTop: spacing.sm }}
              >
                محجوز {meters(item.reservedM)} • مستهلك {meters(item.consumedM)}
              </AppText>

              {/* الاستلامات في البطاقة نفسها: تاريخٌ وأمتارٌ وما بقي */}
              <Divider />
              <View style={{ gap: spacing.sm }}>
                {item.receipts.map((r) => (
                  <Row key={r.roll.id} justify="space-between" gap={spacing.sm}>
                    <Row gap={spacing.sm} style={{ flex: 1 }}>
                      <AppText variant="caption" color={palette.charcoal}>
                        {formatDate(r.roll.createdAt)}
                      </AppText>
                      {r.roll.isMiniRoll && (
                        <Pill label="بواقي" bg={palette.sand} fg={palette.muted} small />
                      )}
                    </Row>
                    <AppText variant="caption" color={palette.muted}>
                      استُلم {meters(r.roll.initialMeters)} • بقي {meters(r.balance.availableM)}
                    </AppText>
                  </Row>
                ))}
              </View>
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
