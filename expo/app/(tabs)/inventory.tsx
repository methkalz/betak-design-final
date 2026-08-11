import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AlertTriangle, Layers, Package, PackagePlus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  EmptyState,
  Pill,
  Row,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { availabilityTone, consumedInLastDays } from '@/domain/inventory';
import { can } from '@/domain/permissions';
import { useRollViews, useVariantStockViews } from '@/hooks/selectors';
import { meters, money } from '@/lib/format';
import { useStore } from '@/providers/store';

/** عدّ الاستلامات بعربيةٍ سليمة: واحد، اثنان (مثنّى)، ثم جمع. */
function receiptsLabel(n: number): string {
  if (n === 1) return 'استلام واحد';
  if (n === 2) return 'استلامان';
  return `${n} استلامات`;
}

type Tab = 'stock' | 'library';

export default function InventoryScreen() {
  const { db, role } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('stock');
  const rolls = useRollViews();
  const stock = useVariantStockViews();
  const showCost = role === 'admin';
  const canManage = can(role, 'manage_fabrics');

  const totals = useMemo(() => {
    const available = rolls.reduce((s, r) => s + r.balance.availableM, 0);
    const reserved = rolls.reduce((s, r) => s + r.balance.reservedM, 0);
    // استهلاك الشهر الأخير لا العمر كله: رقم العمر يكبر إلى الأبد
    const consumed = consumedInLastDays(db.stockMovements, 30);
    const value = rolls.reduce(
      (s, r) => s + r.balance.onHandM * (r.variant?.costPerMeterAgorot ?? 0),
      0,
    );
    return { available, reserved, consumed, value };
  }, [rolls, db.stockMovements]);

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
        {/* الأرقام الثلاثة التي تُدار بها الورشة - لكلٍّ لون حالته */}
        <Row gap={spacing.md}>
          <TotalTile
            label="متاح"
            value={totals.available}
            tone={palette.success}
            tint={['rgba(16,185,129,0.09)', 'rgba(255,255,255,0)']}
          />
          <TotalTile
            label="محجوز"
            value={totals.reserved}
            tone={palette.warning}
            tint={['rgba(245,158,11,0.09)', 'rgba(255,255,255,0)']}
          />
          {/* البلاطة نفسها بوابة تقريرها: من يسأل «كم استهلكنا؟» يسأل
              «وأين ولماذا؟» بعدها مباشرة */}
          <TotalTile
            label="استهلاك"
            value={totals.consumed}
            tone={palette.muted}
            tint={['rgba(120,126,155,0.08)', 'rgba(255,255,255,0)']}
            onPress={() => router.push('/consumption')}
          />
        </Row>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stock', label: 'المخزون' },
            { value: 'library', label: 'مكتبة الأقمشة' },
          ]}
        />
        {/* الإضافة تتبع ما ينظر إليه المستخدم: شحنة وهو في الرولات، قماش
            وهو في المكتبة - لا زرّ واحد يسأل «أيّهما تقصد؟» */}
        {canManage && (
          <Button
            label={tab === 'stock' ? 'استلام بضاعة' : 'قماش جديد'}
            variant="secondary"
            full
            small
            icon={
              tab === 'stock' ? (
                <PackagePlus size={15} color={palette.oliveDark} />
              ) : (
                <Plus size={15} color={palette.oliveDark} />
              )
            }
            onPress={() => router.push(tab === 'stock' ? '/roll/new' : '/fabric/new')}
          />
        )}
      </View>

      {tab === 'stock' ? (
        /* المخزون بالأمتار لكل صنف (قرار المالك): بطاقة لكل لونٍ برقمه
           البطل، والاستلامات تفصيلٌ خلف ضغطة - لا رولات في الواجهة. */
        <FlatList
          data={stock}
          keyExtractor={(g) => g.variantId}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const tone = availabilityTone(item.availableM);
            const availTone =
              tone === 'danger'
                ? palette.danger
                : tone === 'warning'
                  ? palette.warning
                  : palette.success;
            const lifetime = item.availableM + item.reservedM + item.consumedM;
            const seg = (v: number) => (lifetime > 0 ? (v / lifetime) * 100 : 0);
            return (
              <Card
                onPress={() =>
                  router.push({ pathname: '/stock/[variantId]', params: { variantId: item.variantId } })
                }
                style={{ padding: spacing.xl }}
              >
                <Row justify="space-between" align="center" gap={spacing.md}>
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <Swatch color={item.variant?.colorHex ?? palette.sand} size={44} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="heading" numberOfLines={1} style={{ fontSize: 18 }}>
                        {item.product?.name}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={palette.muted}
                        numberOfLines={1}
                        style={{ fontSize: 14.5 }}
                      >
                        {item.variant?.colorName} • {receiptsLabel(item.receipts.length)}
                      </AppText>
                    </View>
                  </Row>

                  <View style={{ alignItems: 'flex-start' }}>
                    <Row gap={4} align="baseline">
                      <AppText
                        variant="numberLarge"
                        color={availTone}
                        style={{ fontSize: 33, lineHeight: 44 }}
                      >
                        {meters(item.availableM, false)}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        متر
                      </AppText>
                    </Row>
                    <Row gap={5}>
                      {tone === 'danger' && <AlertTriangle size={12} color={palette.danger} />}
                      <AppText
                        variant="caption"
                        color={tone === 'success' ? palette.muted : availTone}
                      >
                        {tone === 'danger'
                          ? 'منخفض - اطلب'
                          : tone === 'warning'
                            ? 'يقترب من الحد'
                            : 'متاح'}
                      </AppText>
                    </Row>
                  </View>
                </Row>

                {/* شريط عمر الصنف كله: متاح ← محجوز ← مستهلك */}
                <View style={styles.bar}>
                  <View style={{ width: `${seg(item.availableM)}%`, backgroundColor: availTone }} />
                  <View style={{ width: `${seg(item.reservedM)}%`, backgroundColor: palette.warning }} />
                  <View style={{ width: `${seg(item.consumedM)}%`, backgroundColor: palette.sandDeep }} />
                </View>

                <Row gap={spacing.md} wrap style={{ marginTop: spacing.sm }}>
                  <Row gap={5}>
                    <View style={[styles.dot, { backgroundColor: palette.warning }]} />
                    <AppText variant="caption" color={palette.muted}>
                      محجوز {meters(item.reservedM)}
                    </AppText>
                  </Row>
                  <Row gap={5}>
                    <View style={[styles.dot, { backgroundColor: palette.sandDeep }]} />
                    <AppText variant="caption" color={palette.muted}>
                      مستهلك {meters(item.consumedM)}
                    </AppText>
                  </Row>
                  {item.consignedM > 0 && (
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: palette.terracotta }]} />
                      <AppText variant="caption" color={palette.terracotta}>
                        عند الخياطين {meters(item.consignedM)}
                      </AppText>
                    </Row>
                  )}
                </Row>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={28} color={palette.olive} />}
              title="لا بضاعة بعد"
              body="سجّل أول استلام بضاعة لبدء إدارة المخزون."
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
                      {[item.supplier, `عرض ${item.widthCm} سم`, item.composition]
                        .filter(Boolean)
                        .join(' • ')}
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
                  {/* بالأمتار لا بالرولات (قرار المالك): كم عندك من هذا القماش */}
                  <Pill
                    label={`متاح ${meters(
                      rolls
                        .filter((r) => variants.some((v) => v.id === r.roll.variantId))
                        .reduce((sum, r) => sum + r.balance.availableM, 0),
                    )}`}
                    bg={palette.ivoryDeep}
                    fg={palette.muted}
                    small
                    icon={<Layers size={12} color={palette.muted} />}
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

/**
 * بلاطة إجمالي: تدرّج زجاجي خفيف بلون الحالة نفسها التي تُلوّن مقاطع شريط
 * البطاقات - فالربط بين الملخص والتفصيل يصير لونيًا لا ذهنيًا. و«متر»
 * لاحقةٌ صغيرة كي يبقى الرقم هو ما تلتقطه العين.
 */
function TotalTile({
  label,
  value,
  tone,
  tint,
  onPress,
}: {
  label: string;
  value: number;
  tone: string;
  tint: [string, string];
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.totalTile, { borderColor: palette.line }]}
    >
      <LinearGradient
        colors={tint}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Row gap={5}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        {/* بلا سقف أسطر: التسمية تلتفّ سطرين ولا تُقصّ أبدًا */}
        <AppText variant="caption" color={palette.muted} style={{ fontSize: 12.5 }}>
          {label}
        </AppText>
      </Row>
      <Row gap={3} align="baseline">
        <AppText variant="number" numberOfLines={1} style={{ fontSize: 23, lineHeight: 32 }}>
          {meters(value, false)}
        </AppText>
        <AppText variant="caption" color={palette.muted} style={{ fontSize: 11.5 }}>
          متر
        </AppText>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  totalTile: {
    flex: 1,
    gap: 2,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bar: {
    flexDirection: 'row-reverse',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: palette.ivoryDeep,
    marginTop: spacing.lg,
  },
});
