import { useRouter } from 'expo-router';
import { Banknote, Wallet } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
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
  SegmentedControl,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/domain/labels';
import { can } from '@/domain/permissions';
import { rootProjects } from '@/domain/annex';
import { projectFinance } from '@/hooks/selectors';
import { formatDate, money } from '@/lib/format';
import { useStore } from '@/providers/store';

type Tab = 'debts' | 'settled' | 'log';

export default function PaymentsScreen() {
  const { db, role } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('debts');

  /**
   * فصل الديون عن المسدَّد (M10): كانا قائمة واحدة تُفرز، فالمسدَّد يشغل
   * الشاشة التي جاء صاحبها يطارد ديونًا. تبويبان يعكسان سؤالين مختلفين:
   * «من عليه؟» و«ماذا أُغلق؟».
   */
  const rows = useMemo(
    () =>
      rootProjects(db)
        .map((p) => ({ project: p, finance: projectFinance(db, p.id) }))
        .filter((r) => r.finance.totalAgorot > 0)
        .sort((a, b) => b.finance.dueAgorot - a.finance.dueAgorot),
    [db],
  );
  const shown = useMemo(
    () =>
      tab === 'debts'
        ? rows.filter((r) => r.finance.dueAgorot > 0)
        : rows.filter((r) => r.finance.dueAgorot === 0),
    [rows, tab],
  );

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.finance.totalAgorot, 0);
    const paid = rows.reduce((s, r) => s + r.finance.paidAgorot, 0);
    return { total, paid, due: total - paid };
  }, [rows]);

  if (!can(role, 'record_payment')) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Wallet size={26} color={palette.olive} />}
          title="غير مصرح"
          body="البيانات المالية غير متاحة لدورك."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.md}>
          <View style={[styles.tile, { backgroundColor: palette.sageSoft }]}>
            <AppText variant="number">{money(totals.paid, { compact: true })}</AppText>
            <AppText variant="caption" color={palette.muted}>
              محصّل
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.terracottaSoft }]}>
            <AppText variant="number">{money(totals.due, { compact: true })}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متبقٍ
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.ivoryDeep }]}>
            <AppText variant="number">{money(totals.total, { compact: true })}</AppText>
            <AppText variant="caption" color={palette.muted}>
              الإجمالي
            </AppText>
          </View>
        </Row>
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar
            value={totals.total > 0 ? totals.paid / totals.total : 0}
            color={palette.success}
          />
        </View>
      </Card>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'debts', label: 'الديون' },
          { value: 'settled', label: 'المسدَّد' },
          { value: 'log', label: 'السجل' },
        ]}
      />

      {tab !== 'log' && shown.length === 0 && (
        <EmptyState
          icon={<Wallet size={26} color={palette.olive} />}
          title={tab === 'debts' ? 'لا ديون قائمة' : 'لا مشاريع مسدَّدة بعد'}
          body={tab === 'debts' ? 'كل المشاريع المعتمدة حُصّلت بالكامل.' : 'حين يُسدَّد مشروع بالكامل ينتقل إلى هنا.'}
        />
      )}

      {tab !== 'log' &&
        shown.map(({ project, finance }) => {
          const customer = db.customers.find((c) => c.id === project.customerId);
          return (
            <Card key={project.id} onPress={() => router.push(`/project/${project.id}`)}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{customer?.fullName}</AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {project.code} • {project.title}
                  </AppText>
                </View>
                <Pill
                  label={finance.dueAgorot === 0 ? 'مسدد' : `متبقٍ ${money(finance.dueAgorot)}`}
                  bg={finance.dueAgorot === 0 ? palette.successSoft : palette.terracottaSoft}
                  fg={finance.dueAgorot === 0 ? palette.success : palette.terracotta}
                  small
                />
              </Row>
              <View style={{ marginTop: spacing.md, gap: 6 }}>
                <ProgressBar value={finance.paidRatio} color={palette.success} />
                <AppText variant="caption" color={palette.muted}>
                  {money(finance.paidAgorot)} من {money(finance.totalAgorot)}
                </AppText>
              </View>
            </Card>
          );
        })}

      {tab === 'log' && (
        <Card>
          <SectionHeader title="كل الدفعات" subtitle={`${db.payments.length} حركة`} />
          {db.payments.map((p, i) => {
            const project = db.projects.find((x) => x.id === p.projectId);
            const customer = db.customers.find((c) => c.id === project?.customerId);
            const isReversal = p.kind === 'reversal';
            return (
              <View key={p.id}>
                <Row justify="space-between" align="flex-start">
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: isReversal ? palette.dangerSoft : palette.successSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Banknote size={16} color={isReversal ? palette.danger : palette.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">
                        {customer?.fullName} • {PAYMENT_KIND_LABELS[p.kind]}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        {formatDate(p.createdAt)} • {PAYMENT_METHOD_LABELS[p.method]}
                        {p.reference ? ` • ${p.reference}` : ''}
                      </AppText>
                    </View>
                  </Row>
                  <AppText variant="label" color={isReversal ? palette.danger : palette.charcoal}>
                    {money(p.amountAgorot)}
                  </AppText>
                </Row>
                {i < db.payments.length - 1 && <Divider />}
              </View>
            );
          })}
          {db.payments.length === 0 && (
            <AppText variant="caption" color={palette.muted}>
              لا توجد دفعات مسجلة.
            </AppText>
          )}
        </Card>
      )}
    </ScrollScreen>
  );
}

const styles = {
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.md },
};
