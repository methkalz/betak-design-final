import { useRouter } from 'expo-router';
import { BadgePercent, CheckCircle2, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { computeTotals } from '@/domain/pricing';
import { formatDateTime, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function DiscountsScreen() {
  const { db, role, busy, decideDiscount } = useStore();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const pending = db.discountRequests.filter((r) => r.status === 'pending');
  const history = db.discountRequests.filter((r) => r.status !== 'pending');
  const allowed = can(role, 'approve_discount');

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setError(null);
    setInfo(null);
    const res = await decideDiscount(id, decision);
    if (!res.ok) return setError(res.error);
    setInfo(decision === 'approved' ? 'تمت الموافقة وأُنشئت نسخة جديدة من العرض.' : 'تم رفض الطلب.');
  };

  if (!allowed) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<BadgePercent size={26} color={palette.olive} />}
          title="غير مصرح"
          body="اعتماد الخصومات الاستثنائية من صلاحيات الأدمن فقط."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Banner
        tone="info"
        title="سياسة الخصم"
        body={`حتى ${db.settings.employeeDiscountLimitPercent}% ضمن صلاحية الموظف • من ${db.settings.employeeDiscountLimitPercent}.01% حتى ${db.settings.adminDiscountLimitPercent}% تحتاج موافقتك • أكثر من ${db.settings.adminDiscountLimitPercent}% ممنوع إلا Override موثق.`}
      />

      {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
      {!!info && <Banner tone="success" title={info} />}

      <SectionHeader title="طلبات بانتظار القرار" subtitle={`${pending.length} طلب`} />
      {pending.length === 0 && (
        <Card>
          <AppText variant="body" color={palette.muted} align="center">
            لا توجد طلبات معلّقة.
          </AppText>
        </Card>
      )}

      {pending.map((r) => {
        const quotation = db.quotations.find((q) => q.id === r.quotationId);
        const version = db.quotationVersions.find((v) => v.id === r.versionId);
        const project = db.projects.find((p) => p.id === quotation?.projectId);
        const customer = db.customers.find((c) => c.id === project?.customerId);
        const requester = db.profiles.find((p) => p.id === r.requestedBy);
        const before = version ? computeTotals(version.items, version.discountPercent, db.settings) : null;
        const after = version ? computeTotals(version.items, r.requestedPercent, db.settings) : null;
        return (
          <Card key={r.id}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{customer?.fullName}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {quotation?.number} • {project?.code} • طلب من {requester?.fullName}
                </AppText>
              </View>
              <Pill
                label={`خصم ${percent(r.requestedPercent)}`}
                bg={palette.warningSoft}
                fg={palette.warning}
              />
            </Row>

            <Divider />

            <AppText variant="label">السبب</AppText>
            <AppText variant="body" color={palette.muted}>
              {r.reason}
            </AppText>

            {before && after && (
              <View style={{ marginTop: spacing.md, gap: 4 }}>
                <Row justify="space-between">
                  <AppText variant="caption" color={palette.muted}>
                    الإجمالي الحالي
                  </AppText>
                  <AppText variant="label">{money(before.totalAgorot)}</AppText>
                </Row>
                <Row justify="space-between">
                  <AppText variant="caption" color={palette.muted}>
                    بعد الخصم المطلوب
                  </AppText>
                  <AppText variant="label" color={palette.terracotta}>
                    {money(after.totalAgorot)}
                  </AppText>
                </Row>
                <Row justify="space-between">
                  <AppText variant="caption" color={palette.muted}>
                    هامش الربح بعد الخصم
                  </AppText>
                  <AppText
                    variant="label"
                    color={after.marginPercent < db.settings.minMarginPercent ? palette.danger : palette.success}
                  >
                    {percent(after.marginPercent)}
                  </AppText>
                </Row>
              </View>
            )}

            {after && after.marginPercent < db.settings.minMarginPercent && (
              <View style={{ marginTop: spacing.md }}>
                <Banner
                  tone="danger"
                  title="تحت الحد الأدنى للربح"
                  body={`الحد الأدنى المسموح ${db.settings.minMarginPercent}%.`}
                />
              </View>
            )}

            <Row gap={spacing.sm} style={{ marginTop: spacing.lg }}>
              <Button
                label="موافقة"
                style={{ flex: 1 }}
                loading={busy === 'decide-discount'}
                icon={<CheckCircle2 size={17} color={palette.ivory} />}
                onPress={() => decide(r.id, 'approved')}
              />
              <Button
                label="رفض"
                variant="ghost"
                icon={<XCircle size={17} color={palette.danger} />}
                onPress={() => decide(r.id, 'rejected')}
              />
              <Button
                label="العرض"
                variant="secondary"
                onPress={() => quotation && router.push(`/quotation/${quotation.id}`)}
              />
            </Row>
          </Card>
        );
      })}

      {history.length > 0 && (
        <>
          <SectionHeader title="القرارات السابقة" />
          {history.map((r) => (
            <Card key={r.id}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <AppText variant="label">خصم {percent(r.requestedPercent)}</AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {formatDateTime(r.decidedAt)} •{' '}
                    {db.profiles.find((p) => p.id === r.decidedBy)?.fullName ?? ''}
                  </AppText>
                </View>
                <Pill
                  label={r.status === 'approved' ? 'معتمد' : 'مرفوض'}
                  bg={r.status === 'approved' ? palette.successSoft : palette.dangerSoft}
                  fg={r.status === 'approved' ? palette.success : palette.danger}
                  small
                />
              </Row>
            </Card>
          ))}
        </>
      )}
    </ScrollScreen>
  );
}
