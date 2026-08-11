/**
 * رصيد صنفٍ واحد - سجلّ الاستلامات (قرار المالك 8.8.2026).
 *
 * الرقم البطل هو المتاح من هذا اللون كلّه، وتحته كل استلام بضاعةٍ على حدة:
 * تاريخه وأمتاره وما بقي منه وأين هو. الرول اسمٌ داخلي لهذا الاستلام -
 * تفاصيله (الحركات، دفعة الصبغ) خلف ضغطة لمن يحتاجها، لا في الواجهة.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ChevronLeft, PackageOpen, PackagePlus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { can } from '@/domain/permissions';
import { useVariantStockViews } from '@/hooks/selectors';
import { formatDate, meters, money } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function VariantStockScreen() {
  const { variantId } = useLocalSearchParams<{ variantId: string }>();
  const { db, role } = useStore();
  const router = useRouter();
  const stock = useVariantStockViews();
  const view = useMemo(() => stock.find((g) => g.variantId === variantId) ?? null, [stock, variantId]);
  const canManage = can(role, 'manage_fabrics');
  const showCost = role === 'admin';

  if (!view) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<PackageOpen size={26} color={palette.olive} />}
          title="لا رصيد لهذا الصنف"
          body="لم يُسجَّل له استلام بضاعة بعد."
        />
      </ScrollScreen>
    );
  }

  const low = view.availableM < LOW_STOCK_THRESHOLD_M;
  const tone = low ? palette.danger : palette.success;
  const lifetime = view.availableM + view.reservedM + view.consumedM;
  const seg = (v: number) => (lifetime > 0 ? (v / lifetime) * 100 : 0);

  return (
    <ScrollScreen>
      <Card style={{ padding: spacing.xl }}>
        <Row gap={spacing.md}>
          <Swatch color={view.variant?.colorHex ?? palette.sand} size={52} />
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1} style={{ fontSize: 21 }}>
              {view.product?.name} {view.variant?.colorName}
            </AppText>
            {showCost && (
              <AppText variant="caption" color={palette.muted}>
                التكلفة {money(view.variant?.costPerMeterAgorot ?? 0)}/م
              </AppText>
            )}
          </View>
        </Row>

        <Row gap={4} align="baseline" style={{ marginTop: spacing.lg }}>
          <AppText variant="display" color={tone}>
            {meters(view.availableM, false)}
          </AppText>
          <AppText variant="label" color={palette.muted}>
            متر متاح
          </AppText>
          {low && <AlertTriangle size={16} color={palette.danger} />}
        </Row>

        <View style={styles.bar}>
          <View style={{ width: `${seg(view.availableM)}%`, backgroundColor: tone }} />
          <View style={{ width: `${seg(view.reservedM)}%`, backgroundColor: palette.warning }} />
          <View style={{ width: `${seg(view.consumedM)}%`, backgroundColor: palette.sandDeep }} />
        </View>
        <Row gap={spacing.md} style={{ marginTop: spacing.sm }}>
          <AppText variant="caption" color={palette.muted}>
            محجوز {meters(view.reservedM)}
          </AppText>
          <AppText variant="caption" color={palette.muted}>
            مستهلك {meters(view.consumedM)}
          </AppText>
          {view.consignedM > 0 && (
            <AppText variant="caption" color={palette.terracotta}>
              منها {meters(view.consignedM)} أمانة
            </AppText>
          )}
        </Row>

        {canManage && (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="استلام بضاعة من هذا اللون"
              variant="secondary"
              small
              full
              icon={<PackagePlus size={15} color={palette.oliveDark} />}
              onPress={() =>
                router.push({ pathname: '/roll/new', params: { variantId: view.variantId } })
              }
            />
          </View>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="سجلّ الاستلامات"
          subtitle="كل دفعة بضاعةٍ وما بقي منها - الأحدث أولًا"
        />
        {view.receipts.map((r, i) => {
          const shelf = r.roll.location && r.roll.location !== '-' ? r.roll.location : '';
          const holder = r.roll.assignedTailorId
            ? `عند ${db.profiles.find((p) => p.id === r.roll.assignedTailorId)?.fullName ?? 'خياط'}`
            : shelf
              ? `رف ${shelf}`
              : 'مخزن المعرض';
          return (
            <View key={r.roll.id}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => router.push(`/roll/${r.roll.id}`)}
                style={({ pressed }) => [styles.receipt, pressed && { backgroundColor: palette.ivoryDeep }]}
              >
                <View style={{ flex: 1 }}>
                  <Row gap={spacing.sm}>
                    <AppText variant="label">{formatDate(r.roll.createdAt)}</AppText>
                    {r.roll.isMiniRoll && (
                      <Pill label="بواقي" bg={palette.sand} fg={palette.muted} small />
                    )}
                  </Row>
                  <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                    استُلم {meters(r.roll.initialMeters)} • {holder}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <AppText
                    variant="label"
                    color={r.balance.availableM > 0 ? palette.charcoal : palette.muted}
                  >
                    {meters(r.balance.availableM)}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    متبقٍ
                  </AppText>
                </View>
                <ChevronLeft size={16} color={palette.muted} />
              </Pressable>
            </View>
          );
        })}
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row-reverse',
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.ivoryDeep,
    marginTop: spacing.lg,
  },
  receipt: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
});
