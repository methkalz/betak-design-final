import { LinearGradient } from 'expo-linear-gradient';
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
        {/* الأرقام الثلاثة التي تُدار بها الورشة - لكلٍّ لون حالته */}
        <Row gap={spacing.md}>
          <TotalTile
            label="متاح للحجز"
            value={totals.available}
            tone={palette.success}
            tint={['rgba(16,185,129,0.09)', 'rgba(255,255,255,0)']}
          />
          <TotalTile
            label="محجوز لمشاريع"
            value={totals.reserved}
            tone={palette.warning}
            tint={['rgba(245,158,11,0.09)', 'rgba(255,255,255,0)']}
          />
          <TotalTile
            label="مستهلك"
            value={totals.consumed}
            tone={palette.muted}
            tint={['rgba(120,126,155,0.08)', 'rgba(255,255,255,0)']}
          />
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
                {/* نقطة تركيز واحدة: المتاح بأكبر خط وفي عمود ثابت على يسار
                    كل بطاقة، فتنزل العين عمودًا واحدًا عند التصفح بدل أن
                    تتنقل بين ثلاثة أرقام متساوية الوزن في كل بطاقة. */}
                <Row justify="space-between" align="center" gap={spacing.md}>
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <Swatch color={item.variant?.colorHex ?? palette.sand} size={44} />
                    {/* اسم القماش هو ما يبحث عنه الخيّاط، والكود معرّف
                        يُقرأ بعده - فالاسم فوق وبالخط العريض */}
                    <View style={{ flex: 1 }}>
                      <AppText variant="heading" numberOfLines={1} style={{ fontSize: 16.5 }}>
                        {item.product?.name} {item.variant?.colorName}
                      </AppText>
                      <Row gap={spacing.sm}>
                        <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                          {item.roll.code}
                        </AppText>
                        {item.roll.isMiniRoll && (
                          <Pill label="بواقي" bg={palette.sand} fg={palette.muted} small />
                        )}
                      </Row>
                    </View>
                  </Row>

                  <View style={{ alignItems: 'flex-start' }}>
                    <Row gap={4} align="baseline">
                      <AppText variant="numberLarge" color={availTone}>
                        {meters(item.balance.availableM, false)}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        متر
                      </AppText>
                    </Row>
                    <Row gap={5}>
                      {low && <AlertTriangle size={12} color={palette.danger} />}
                      <AppText variant="caption" color={low ? palette.danger : palette.muted}>
                        {low ? 'متاح - منخفض' : 'متاح'}
                      </AppText>
                    </Row>
                  </View>
                </Row>

                {/* شريط عمر الرول: متاح ← محجوز ← مستهلك */}
                <View style={styles.bar}>
                  <View style={{ width: `${seg(item.balance.availableM)}%`, backgroundColor: availTone }} />
                  <View style={{ width: `${seg(item.balance.reservedM)}%`, backgroundColor: palette.warning }} />
                  <View style={{ width: `${seg(item.balance.consumedM)}%`, backgroundColor: palette.sandDeep }} />
                </View>

                {/* سطر إسناد واحد هادئ: حاضرٌ للسياق، غير منافسٍ للرقم البطل */}
                <Row justify="space-between" gap={spacing.sm} style={{ marginTop: spacing.sm }}>
                  <Row gap={spacing.md}>
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: palette.warning }]} />
                      <AppText variant="caption" color={palette.muted}>
                        محجوز {meters(item.balance.reservedM)}
                      </AppText>
                    </Row>
                    <Row gap={5}>
                      <View style={[styles.dot, { backgroundColor: palette.sandDeep }]} />
                      <AppText variant="caption" color={palette.muted}>
                        مستهلك {meters(item.balance.consumedM)}
                      </AppText>
                    </Row>
                  </Row>
                  <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                    رف {item.roll.location}
                  </AppText>
                </Row>
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
}: {
  label: string;
  value: number;
  tone: string;
  tint: [string, string];
}) {
  return (
    <View style={[styles.totalTile, { borderColor: palette.line }]}>
      <LinearGradient
        colors={tint}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Row gap={5}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <AppText variant="caption" color={palette.muted} numberOfLines={1} style={{ fontSize: 12 }}>
          {label}
        </AppText>
      </Row>
      <Row gap={3} align="baseline">
        <AppText variant="number" numberOfLines={1}>
          {meters(value, false)}
        </AppText>
        <AppText variant="caption" color={palette.muted} style={{ fontSize: 11 }}>
          متر
        </AppText>
      </Row>
    </View>
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
