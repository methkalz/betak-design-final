import { BarChart3, Package, Scissors, TrendingUp } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import {
  AppText,
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
import { PROJECT_STATUS_LABELS } from '@/domain/labels';
import { can } from '@/domain/permissions';
import { approvedVersion, projectFinance, useRollViews } from '@/hooks/selectors';
import { meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function ReportsScreen() {
  const { db, role } = useStore();
  const rolls = useRollViews();
  const showCost = role === 'admin';

  const revenue = useMemo(() => {
    const approved = db.projects
      .map((p) => ({ project: p, version: approvedVersion(db, p.id) }))
      .filter((r) => r.version !== null);
    const gross = approved.reduce((s, r) => s + (r.version?.totalAgorot ?? 0), 0);
    const cost = approved.reduce((s, r) => s + (r.version?.internalCostAgorot ?? 0), 0);
    const collected = db.payments.reduce((s, p) => s + p.amountAgorot, 0);
    const margin = gross > 0 ? ((gross - cost) / gross) * 100 : 0;
    return { gross, cost, collected, margin, count: approved.length };
  }, [db]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    db.projects.forEach((p) => map.set(p.status, (map.get(p.status) ?? 0) + 1));
    return Array.from(map.entries());
  }, [db.projects]);

  const topFabrics = useMemo(() => {
    const map = new Map<string, number>();
    db.reservations.forEach((r) => {
      const roll = db.fabricRolls.find((x) => x.id === r.rollId);
      if (!roll) return;
      map.set(roll.variantId, (map.get(roll.variantId) ?? 0) + r.quantityM);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [db.reservations, db.fabricRolls]);

  if (!can(role, 'view_reports')) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<BarChart3 size={26} color={palette.olive} />}
          title="غير مصرح"
          body="التقارير متاحة للإدارة فقط."
        />
      </ScrollScreen>
    );
  }

  const maxFabric = topFabrics[0]?.[1] ?? 1;

  return (
    <ScrollScreen>
      <Row gap={spacing.md}>
        <View style={[styles.tile, { backgroundColor: palette.sageSoft }]}>
          <TrendingUp size={18} color={palette.olive} />
          <AppText variant="numberLarge">{money(revenue.gross, { compact: true })}</AppText>
          <AppText variant="caption" color={palette.muted}>
            قيمة العروض المعتمدة
          </AppText>
        </View>
        <View style={[styles.tile, { backgroundColor: palette.successSoft }]}>
          <BarChart3 size={18} color={palette.success} />
          <AppText variant="numberLarge">{money(revenue.collected, { compact: true })}</AppText>
          <AppText variant="caption" color={palette.muted}>
            إجمالي التحصيل
          </AppText>
        </View>
      </Row>

      {showCost && (
        <Card>
          <SectionHeader title="الربحية" subtitle="بيانات داخلية — للأدمن فقط" />
          <Row justify="space-between" style={{ paddingVertical: 4 }}>
            <AppText variant="caption" color={palette.muted}>
              التكلفة الداخلية
            </AppText>
            <AppText variant="label">{money(revenue.cost)}</AppText>
          </Row>
          <Row justify="space-between" style={{ paddingVertical: 4 }}>
            <AppText variant="caption" color={palette.muted}>
              الربح الإجمالي
            </AppText>
            <AppText variant="label" color={palette.success}>
              {money(revenue.gross - revenue.cost)}
            </AppText>
          </Row>
          <Divider />
          <Row justify="space-between">
            <AppText variant="label">هامش الربح</AppText>
            <AppText variant="number" color={palette.olive}>
              {percent(Math.round(revenue.margin * 100) / 100)}
            </AppText>
          </Row>
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar value={revenue.margin / 100} color={palette.olive} />
          </View>
        </Card>
      )}

      <Card>
        <SectionHeader title="المشاريع حسب الحالة" subtitle={`${db.projects.length} مشروع`} />
        {byStatus.map(([status, count]) => (
          <Row key={status} justify="space-between" style={{ paddingVertical: 6 }}>
            <AppText variant="caption">
              {PROJECT_STATUS_LABELS[status as keyof typeof PROJECT_STATUS_LABELS]}
            </AppText>
            <Pill label={`${count}`} bg={palette.ivoryDeep} fg={palette.muted} small />
          </Row>
        ))}
      </Card>

      <Card>
        <SectionHeader title="أكثر الأقمشة استخدامًا" subtitle="حسب الأمتار المحجوزة" />
        {topFabrics.map(([variantId, qty]) => {
          const variant = db.fabricVariants.find((v) => v.id === variantId);
          const product = db.fabricProducts.find((p) => p.id === variant?.productId);
          return (
            <View key={variantId} style={{ gap: 6, marginBottom: spacing.md }}>
              <Row justify="space-between">
                <Row gap={spacing.sm}>
                  <Swatch color={variant?.colorHex ?? palette.sand} size={20} />
                  <AppText variant="caption">
                    {product?.name} {variant?.colorName}
                  </AppText>
                </Row>
                <AppText variant="caption" color={palette.muted}>
                  {meters(qty)}
                </AppText>
              </Row>
              <ProgressBar value={qty / maxFabric} color={palette.terracotta} />
            </View>
          );
        })}
        {topFabrics.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا توجد حجوزات بعد.
          </AppText>
        )}
      </Card>

      <Card>
        <SectionHeader title="صحة المخزون" />
        <Row justify="space-between" style={{ paddingVertical: 4 }}>
          <Row gap={spacing.sm}>
            <Package size={15} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              إجمالي المتاح
            </AppText>
          </Row>
          <AppText variant="label">
            {meters(rolls.reduce((s, r) => s + r.balance.availableM, 0))}
          </AppText>
        </Row>
        <Row justify="space-between" style={{ paddingVertical: 4 }}>
          <Row gap={spacing.sm}>
            <Scissors size={15} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              إجمالي المستهلك
            </AppText>
          </Row>
          <AppText variant="label">
            {meters(rolls.reduce((s, r) => s + r.balance.consumedM, 0))}
          </AppText>
        </Row>
        <Row justify="space-between" style={{ paddingVertical: 4 }}>
          <AppText variant="caption" color={palette.muted}>
            رولات تحت 20 م
          </AppText>
          <AppText variant="label" color={palette.danger}>
            {rolls.filter((r) => r.balance.availableM < 20).length}
          </AppText>
        </Row>
      </Card>

      <Card>
        <SectionHeader title="أعلى المشاريع قيمة" />
        {db.projects
          .map((p) => ({ p, f: projectFinance(db, p.id) }))
          .filter((x) => x.f.totalAgorot > 0)
          .sort((a, b) => b.f.totalAgorot - a.f.totalAgorot)
          .slice(0, 5)
          .map(({ p, f }) => (
            <Row key={p.id} justify="space-between" style={{ paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {db.customers.find((c) => c.id === p.customerId)?.fullName}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {p.code}
                </AppText>
              </View>
              <AppText variant="label">{money(f.totalAgorot)}</AppText>
            </Row>
          ))}
      </Card>
    </ScrollScreen>
  );
}

const styles = {
  tile: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
};
