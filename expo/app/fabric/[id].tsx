import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layers, Package, PackagePlus, Palette, Pencil, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Pill,
  ProgressBar,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { useRollViews } from '@/hooks/selectors';
import { meters, money } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function FabricScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role } = useStore();
  const router = useRouter();
  const rolls = useRollViews();

  const product = db.fabricProducts.find((p) => p.id === id);
  if (!product) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Layers size={26} color={palette.olive} />}
          title="القماش غير موجود"
          body="راجع مكتبة الأقمشة."
        />
      </ScrollScreen>
    );
  }

  const variants = db.fabricVariants.filter((v) => v.productId === product.id);
  const showCost = role === 'admin';
  const editable = can(role, 'manage_fabrics');

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="title">{product.name}</AppText>
        <AppText variant="caption" color={palette.muted}>
          {product.supplier} • عرض {product.widthCm} سم
        </AppText>
        <AppText variant="caption" color={palette.muted}>
          {product.composition}
        </AppText>
        <Divider />
        <Row gap={spacing.sm} wrap>
          <Pill
            label={product.kind === 'crepe' ? 'كريب' : product.kind === 'lining' ? 'بطانة' : 'قماش آخر'}
            bg={palette.sand}
            fg={palette.oliveDark}
            small
          />
          <Pill label={`${variants.length} لون`} bg={palette.ivoryDeep} fg={palette.muted} small />
        </Row>

        {editable && (
          <>
            <Divider />
            <Row gap={spacing.sm}>
              <Button
                label="تعديل القماش"
                variant="secondary"
                small
                style={{ flex: 1 }}
                icon={<Pencil size={15} color={palette.oliveDark} />}
                onPress={() => router.push({ pathname: '/fabric/new', params: { id: product.id } })}
              />
              <Button
                label="إضافة لون"
                variant="secondary"
                small
                style={{ flex: 1 }}
                icon={<Plus size={15} color={palette.oliveDark} />}
                onPress={() =>
                  router.push({ pathname: '/fabric/color', params: { productId: product.id } })
                }
              />
            </Row>
          </>
        )}
      </Card>

      {variants.length === 0 && (
        <EmptyState
          icon={<Palette size={26} color={palette.olive} />}
          title="لا ألوان بعد"
          body="القماش بلا لون لا يمكن اختياره على شباك. أضف أول لون بتكلفته."
        />
      )}

      {variants.map((v) => {
        const variantRolls = rolls.filter((r) => r.roll.variantId === v.id);
        const available = variantRolls.reduce((s, r) => s + r.balance.availableM, 0);
        const onHand = variantRolls.reduce((s, r) => s + r.balance.onHandM, 0);
        return (
          <Card key={v.id}>
            <Row gap={spacing.md}>
              <Swatch color={v.colorHex} size={52} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{v.colorName}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {v.sku || 'بلا رمز'}
                  {showCost ? ` • تكلفة ${money(v.costPerMeterAgorot)}/م` : ''}
                </AppText>
              </View>
              {editable && (
                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    router.push({
                      pathname: '/fabric/color',
                      params: { productId: product.id, id: v.id },
                    })
                  }
                >
                  <Pencil size={17} color={palette.muted} />
                </Pressable>
              )}
            </Row>

            <View style={{ marginTop: spacing.md, gap: 6 }}>
              <ProgressBar value={onHand > 0 ? available / onHand : 0} color={palette.olive} />
              <AppText variant="caption" color={palette.muted}>
                متاح {meters(available)} من {meters(onHand)} في {variantRolls.length} رول
              </AppText>
            </View>

            <Divider />
            <SectionHeader title="الرولات" />
            {variantRolls.map((r) => (
              <Pressable
                key={r.roll.id}
                onPress={() => router.push(`/roll/${r.roll.id}`)}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Row justify="space-between" style={{ paddingVertical: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{r.roll.code}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      موقع {r.roll.location} • Dye lot {r.roll.dyeLot}
                    </AppText>
                  </View>
                  <Pill
                    label={`${r.balance.availableM} م`}
                    bg={r.balance.availableM < 20 ? palette.dangerSoft : palette.sageSoft}
                    fg={r.balance.availableM < 20 ? palette.danger : palette.oliveDark}
                    small
                  />
                </Row>
              </Pressable>
            ))}
            {variantRolls.length === 0 && (
              <Row gap={spacing.sm}>
                <Package size={16} color={palette.muted} />
                <AppText variant="caption" color={palette.muted}>
                  لا توجد رولات لهذا اللون.
                </AppText>
              </Row>
            )}

            {editable && (
              <Button
                label="استلام شحنة"
                variant="ghost"
                full
                small
                style={{ marginTop: spacing.sm }}
                icon={<PackagePlus size={15} color={palette.olive} />}
                onPress={() => router.push({ pathname: '/roll/new', params: { variantId: v.id } })}
              />
            )}
          </Card>
        );
      })}
    </ScrollScreen>
  );
}
