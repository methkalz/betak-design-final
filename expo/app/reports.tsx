

import { BarChart3, FileDown, Package, Scissors, TrendingUp, Users } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

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
import { customersProfitReport, monthlyReport } from '@/domain/reports';
import { rootProjects } from '@/domain/annex';
import { approvedVersion, projectFinance, useRollViews } from '@/hooks/selectors';
import { exportHtmlDocument } from '@/lib/exportDoc';
import { meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';

/** آخر ستة أشهر كرقاقات اختيار - الشهر الجاري أولًا. */
function lastMonths(n: number): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i += 1) {
    out.push({ year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}.${d.getFullYear()}` });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function ReportsScreen() {
  const { db, role } = useStore();
  const rolls = useRollViews();
  const showCost = role === 'admin';
  const months = useMemo(() => lastMonths(6), []);
  const [sel, setSel] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const monthly = useMemo(
    () => monthlyReport(db, months[sel].year, months[sel].month),
    [db, months, sel],
  );
  const customers = useMemo(() => (showCost ? customersProfitReport(db) : []), [db, showCost]);

  /** الملف الشهري التفصيلي (M10): PDF عربي بنمط عروض الأسعار نفسه. */
  const exportMonth = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const m = monthly;
      const row = (l: string, v: string) =>
        `<div><span>${l}</span><span>${v}</span></div>`;
      const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
 body{font-family:-apple-system,"Helvetica Neue","Geeza Pro","Arial",sans-serif;direction:rtl;color:#1B1F32;margin:0;padding:32px;background:#F6F6FB}
 h1{color:#4F46E5;font-size:24px;margin:0 0 4px}
 .muted{color:#787E9B;font-size:12px;margin-bottom:20px}
 .box{background:#fff;border:1px solid #EAEAF5;border-radius:14px;padding:16px;margin-bottom:14px}
 .box h3{margin:0 0 10px;font-size:14px;color:#4F46E5}
 .box div{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #F4F4FB}
 .box div:last-child{border-bottom:none}
 .grand{font-weight:700;color:#4F46E5}
</style></head><body>
<h1>بيتك ديزاين - التقرير الشهري ${months[sel].label}</h1>
<div class="muted">أُنشئ آليًا من سجلات التطبيق - كل رقم قابل للجمع اليدوي من سجله.</div>
<div class="box"><h3>الإنتاج</h3>
 ${row('ورشات أُنجزت', String(m.workshopsCompleted))}
 ${row('أمتار مقصوصة', `${m.metersCut} م`)}
 ${row('هدر مسجَّل', `${m.wasteM} م`)}
</div>
<div class="box"><h3>المبيعات والربح (عروض اعتُمدت هذا الشهر)</h3>
 ${row('عدد العروض المعتمدة', String(m.approvedCount))}
 ${row('الإيراد', money(m.revenueExAgorot))}
 ${row('التكلفة الكاملة كما سُعّرت', money(m.costAgorot))}
 ${`<div class="grand"><span>الربح</span><span>${money(m.profitAgorot)}</span></div>`}
</div>
<div class="box"><h3>مصاريف الطاقم المتكوّنة هذا الشهر</h3>
 ${row('مستحقات الخياطين', money(m.tailorFeesAgorot))}
 ${row('أجور الزيارات الميدانية', money(m.fieldWagesAgorot))}
 <div class="muted" style="border:none;display:block;padding-top:8px">مكوّنا الخياطة والقياس/التركيب مقدَّران داخل التكلفة أعلاه - لا يُخصمان مرة ثانية.</div>
</div>
<div class="box"><h3>التحصيل</h3>
 ${row('المحصَّل خلال الشهر', money(m.collectedAgorot))}
</div>
<div class="box"><h3>من أين أتى (توزيع البلدات)</h3>
 ${m.byTown.map((t) => row(`${t.town} (${t.count})`, money(t.totalAgorot))).join('') || row('لا اعتمادات هذا الشهر', '-')}
</div>
</body></html>`;
      const res = await exportHtmlDocument(html, `تقرير ${months[sel].label}`);
      if (res.kind === 'shared') setExportMsg('أُنشئ الملف الشهري وشورك.');
      else if (res.kind === 'printed') setExportMsg('فُتحت نافذة الطباعة - اختر «حفظ كـPDF».');
      else setExportMsg(`أُنشئ الملف: ${res.uri}`);
    } catch {
      setExportMsg('تعذر إنشاء الملف - حاول مجددًا.');
    } finally {
      setExporting(false);
    }
  };

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

      {/* M7: الشهر تحت المجهر - رقاقات الأشهر ثم أرقامه ثم تصديره ملفًا */}
      <Card>
        <SectionHeader title="تقرير الشهر" subtitle="اختر شهرًا - وكل رقم قابل للجمع اليدوي" />
        <Row gap={spacing.sm} wrap>
          {months.map((m, i) => (
            <Pressable
              key={m.label}
              onPress={() => setSel(i)}
              style={[styles.monthChip, sel === i && styles.monthChipActive]}
            >
              <AppText variant="caption" color={sel === i ? palette.ivory : palette.charcoal}>
                {m.label}
              </AppText>
            </Pressable>
          ))}
        </Row>
        <Divider />
        <ReportRow label="ورشات أُنجزت" value={String(monthly.workshopsCompleted)} />
        <ReportRow label="أمتار مقصوصة" value={`${monthly.metersCut} م`} />
        <ReportRow label="عروض اعتُمدت" value={String(monthly.approvedCount)} />
        <ReportRow label="مبيعات معتمدة (شامل)" value={money(monthly.approvedTotalAgorot)} />
        {showCost && (
          <>
            <ReportRow label="الإيراد الصافي" value={money(monthly.revenueExAgorot)} />
            <ReportRow label="التكلفة" value={money(monthly.costAgorot)} />
            <ReportRow label="الربح" value={money(monthly.profitAgorot)} strong />
            <ReportRow label="مستحقات الخياطين المتكوّنة" value={money(monthly.tailorFeesAgorot)} />
            <ReportRow label="أجور الزيارات المتكوّنة" value={money(monthly.fieldWagesAgorot)} />
          </>
        )}
        <ReportRow label="المحصَّل خلال الشهر" value={money(monthly.collectedAgorot)} />

        {monthly.byTown.length > 0 && (
          <>
            <Divider />
            <AppText variant="label" color={palette.muted}>
              من أين أتى
            </AppText>
            {monthly.byTown.map((t) => (
              <ReportRow key={t.town} label={`${t.town} (${t.count})`} value={money(t.totalAgorot)} />
            ))}
          </>
        )}

        {showCost && (
          <Pressable
            onPress={exportMonth}
            disabled={exporting}
            style={({ pressed }) => [styles.exportBtn, pressed && { backgroundColor: palette.sand }]}
          >
            <Row gap={spacing.sm} justify="center">
              <FileDown size={16} color={palette.olive} />
              <AppText variant="label" color={palette.oliveDark}>
                {exporting ? 'يُنشأ الملف...' : 'تصدير الملف الشهري التفصيلي'}
              </AppText>
            </Row>
          </Pressable>
        )}
        {!!exportMsg && (
          <AppText variant="caption" color={palette.muted} align="center" style={{ marginTop: 6 }}>
            {exportMsg}
          </AppText>
        )}
      </Card>

      {/* M5: الزبائن بالربح والتكلفة - للأدمن */}
      {showCost && customers.length > 0 && (
        <Card>
          <SectionHeader
            title="الزبائن: ربحًا وتكلفة"
            subtitle="عبر كل مشاريع الزبون - الأربح أولًا"
          />
          {customers.map((c, i) => (
            <View key={c.customerId}>
              {i > 0 && <Divider />}
              <Row justify="space-between" align="flex-start" gap={spacing.md}>
                <View style={{ flex: 1 }}>
                  <Row gap={spacing.sm}>
                    <Users size={14} color={palette.muted} />
                    <AppText variant="label" numberOfLines={1}>
                      {c.name}
                    </AppText>
                  </Row>
                  <AppText variant="caption" color={palette.muted}>
                    {c.town} • {c.projectsCount} مشروع • تكلفة {money(c.costAgorot)}
                    {c.dueAgorot > 0 ? ` • عليه ${money(c.dueAgorot)}` : ''}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <AppText variant="number" color={c.profitAgorot >= 0 ? palette.success : palette.danger}>
                    {money(c.profitAgorot)}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    ربح
                  </AppText>
                </View>
              </Row>
            </View>
          ))}
        </Card>
      )}

      {showCost && (
        <Card>
          <SectionHeader title="الربحية" subtitle="بيانات داخلية - للأدمن فقط" />
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
            <AppText variant="label">نسبة الربح</AppText>
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
        {rootProjects(db)
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

/** سطر تقرير: تسمية هادئة ورقم يقرأه المحاسب. */
function ReportRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 4 }}>
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
      <AppText variant={strong ? 'number' : 'label'}>{value}</AppText>
    </Row>
  );
}

const styles = {
  tile: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  monthChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  monthChipActive: { backgroundColor: palette.olive, borderColor: palette.olive },
  exportBtn: {
    marginTop: spacing.md,
    minHeight: 48,
    justifyContent: 'center' as const,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
};
