import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BadgePercent,
  CheckCircle2,
  FileText,
  History,
  Send,
  Share2,
  ShieldAlert,
  XCircle,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { QUOTATION_STATUS_LABELS, quotationStatusColor } from '@/domain/labels';
import { can } from '@/domain/permissions';
import { checkDiscount, computeTotals } from '@/domain/pricing';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';

const DISCOUNT_STEPS = [0, 2, 4, 5, 8, 12];

export default function QuotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    db,
    role,
    busy,
    createVersion,
    sendVersion,
    decideVersion,
    requestDiscount,
  } = useStore();

  const [discount, setDiscount] = useState<number | null>(null);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState<boolean>(false);

  const quotation = db.quotations.find((q) => q.id === id);
  const versions = useMemo(
    () =>
      db.quotationVersions
        .filter((v) => v.quotationId === id)
        .sort((a, b) => b.versionNumber - a.versionNumber),
    [db.quotationVersions, id],
  );
  const version = versions.find((v) => v.id === quotation?.currentVersionId) ?? versions[0] ?? null;

  if (!quotation || !version) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<FileText size={26} color={palette.olive} />}
          title="العرض غير موجود"
          body="ربما تم حذفه أو ليس ضمن صلاحياتك."
        />
      </ScrollScreen>
    );
  }

  const project = db.projects.find((p) => p.id === quotation.projectId);
  const customer = db.customers.find((c) => c.id === project?.customerId);
  const showCost = role === 'admin';
  const statusColor = quotationStatusColor(version.status);
  const activeDiscount = discount ?? version.discountPercent;
  const preview = computeTotals(version.items, activeDiscount, db.settings);
  const check = checkDiscount(version.items, activeDiscount, db.settings);
  const expired = new Date(version.validUntil).getTime() < Date.now() && version.status === 'sent';

  const applyDiscount = () => {
    setError(null);
    setInfo(null);
    // فوق حد الأدمن ليس ممنوعًا مطلقًا (Override موثق عبر طلب خصم معتمد —
    // المحرك يفرضه عند الإرسال)؛ هذه الشاشة المحلية لا تملك مسار الطلب بعد
    // فتوقف التطبيق المباشر، أما الهامش الأدنى فسقف مطلق دائمًا.
    if (check.authority === 'needs_override' || check.belowMinMargin) {
      setError(check.message);
      return;
    }
    if (check.authority === 'needs_admin' && role !== 'admin') {
      if (!reason.trim()) {
        setError('اكتب سبب الخصم لإرسال الطلب للأدمن.');
        return;
      }
      requestDiscount(quotation.id, version.id, activeDiscount, reason);
      setInfo('تم إرسال طلب الخصم للأدمن. ستصلك النتيجة كإشعار.');
      return;
    }
    const res = createVersion(quotation.id, activeDiscount, reason);
    if (!res.ok) return setError(res.error);
    setDiscount(null);
    setReason('');
    setInfo(`تم إنشاء نسخة جديدة بخصم ${activeDiscount}%.`);
  };

  return (
    <ScrollScreen>
      <Card>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <AppText variant="title">{quotation.number}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {customer?.fullName} • {project?.code}
            </AppText>
          </View>
          <Pill
            label={QUOTATION_STATUS_LABELS[version.status]}
            bg={statusColor.bg}
            fg={statusColor.fg}
          />
        </Row>
        <Divider />
        <Row justify="space-between">
          <View>
            <AppText variant="caption" color={palette.muted}>
              النسخة {version.versionNumber} من {versions.length}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              صالح حتى {formatDate(version.validUntil)}
            </AppText>
          </View>
          <Pressable onPress={() => setShowVersions((s) => !s)}>
            <Row gap={6}>
              <History size={16} color={palette.olive} />
              <AppText variant="label" color={palette.olive}>
                النسخ المحفوظة
              </AppText>
            </Row>
          </Pressable>
        </Row>
      </Card>

      {expired && (
        <Banner
          tone="warning"
          title="انتهت صلاحية العرض"
          body="أنشئ نسخة جديدة قبل إرسالها للزبون مرة أخرى."
        />
      )}

      {showVersions && (
        <Card>
          <SectionHeader title="سجل النسخ" subtitle="النسخ المرسلة لا تُعدَّل أبدًا" />
          {versions.map((v) => {
            const c = quotationStatusColor(v.status);
            return (
              <Row key={v.id} justify="space-between" style={{ paddingVertical: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">
                    النسخة {v.versionNumber} • {money(v.totalAgorot)}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    خصم {percent(v.discountPercent)} • {formatDate(v.createdAt)}
                    {v.note ? ` • ${v.note}` : ''}
                  </AppText>
                </View>
                <Pill label={QUOTATION_STATUS_LABELS[v.status]} bg={c.bg} fg={c.fg} small />
              </Row>
            );
          })}
        </Card>
      )}

      <Card>
        <SectionHeader title="بنود العرض" subtitle={`${version.items.length} شباك`} />
        {version.items.map((item) => (
          <View key={item.id} style={{ paddingVertical: spacing.sm }}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {item.roomName} — {item.windowName}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {item.description}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {cm(item.widthCm)} × {cm(item.heightCm)} • {meters(item.runningMeters)} متر ركض •{' '}
                  {item.band === 'standard' ? 'حتى 329 سم' : '330–500 سم'}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <AppText variant="number">{money(item.lineTotalAgorot)}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {money(item.unitPriceAgorot)}/م
                </AppText>
              </View>
            </Row>
          </View>
        ))}
      </Card>

      <Card style={{ backgroundColor: palette.oliveDeepest, borderColor: palette.oliveDeepest }}>
        <SummaryRow label="المجموع قبل الخصم" value={money(preview.subtotalAgorot)} />
        <SummaryRow
          label={`الخصم (${percent(activeDiscount)})`}
          value={`- ${money(preview.discountAgorot)}`}
        />
        <SummaryRow label={`ضريبة القيمة المضافة ${db.settings.vatPercent}%`} value={money(preview.vatAgorot)} />
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: spacing.md }} />
        <Row justify="space-between">
          <AppText variant="heading" color={palette.ivory}>
            الإجمالي للزبون
          </AppText>
          <AppText variant="numberLarge" color={palette.ivory}>
            {money(preview.totalAgorot)}
          </AppText>
        </Row>
        {showCost && (
          <View style={{ marginTop: spacing.md, gap: 4 }}>
            <SummaryRow label="التكلفة الداخلية" value={money(preview.internalCostAgorot)} muted />
            <SummaryRow
              label="هامش الربح"
              value={`${money(preview.marginAgorot)} (${percent(preview.marginPercent)})`}
              muted
            />
          </View>
        )}
      </Card>

      {can(role, 'create_quotation') && (
        <Card>
          <SectionHeader
            title="الخصم"
            subtitle={`حتى ${db.settings.employeeDiscountLimitPercent}% ضمن صلاحية الموظف • حتى ${db.settings.adminDiscountLimitPercent}% بموافقة الأدمن`}
          />
          <Row gap={spacing.sm} wrap>
            {DISCOUNT_STEPS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDiscount(d)}
                style={[
                  {
                    paddingHorizontal: spacing.lg,
                    minHeight: 44,
                    justifyContent: 'center',
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: palette.line,
                    backgroundColor: palette.white,
                  },
                  activeDiscount === d && { backgroundColor: palette.olive, borderColor: palette.olive },
                ]}
              >
                <AppText variant="label" color={activeDiscount === d ? palette.ivory : palette.charcoal}>
                  {d}%
                </AppText>
              </Pressable>
            ))}
          </Row>

          <View style={{ marginTop: spacing.md }}>
            <Banner
              tone={
                check.belowMinMargin
                  ? 'danger'
                  : check.authority === 'needs_admin' || check.authority === 'needs_override'
                    ? 'warning'
                    : 'success'
              }
              title={check.message}
              icon={
                check.authority === 'allowed' && !check.belowMinMargin ? (
                  <CheckCircle2 size={16} color={palette.success} />
                ) : (
                  <ShieldAlert size={16} color={palette.warning} />
                )
              }
            />
          </View>

          {(check.authority === 'needs_admin' || activeDiscount > 0) && (
            <View style={{ marginTop: spacing.md }}>
              <Field
                label="سبب الخصم"
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="مثال: الزبون قارن مع عرض منافس."
              />
            </View>
          )}

          <Button
            label={
              check.authority === 'needs_admin' && role !== 'admin'
                ? 'إرسال طلب خصم للأدمن'
                : 'إنشاء نسخة جديدة بالخصم'
            }
            full
            style={{ marginTop: spacing.md }}
            icon={<BadgePercent size={18} color={palette.ivory} />}
            onPress={applyDiscount}
          />
        </Card>
      )}

      {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
      {!!info && <Banner tone="success" title={info} />}

      <Row gap={spacing.sm}>
        <Button
          label="معاينة PDF ومشاركة"
          full
          style={{ flex: 1 }}
          icon={<Share2 size={18} color={palette.ivory} />}
          onPress={() =>
            router.push({ pathname: '/quotation/pdf', params: { versionId: version.id } })
          }
        />
      </Row>

      {can(role, 'create_quotation') && version.status === 'draft' && (
        <Button
          label="إرسال العرض للزبون"
          variant="accent"
          full
          loading={busy === 'send-quote'}
          icon={<Send size={18} color={palette.white} />}
          onPress={async () => {
            setError(null);
            const res = await sendVersion(version.id);
            if (!res.ok) setError(res.error);
            else setInfo('تم إرسال العرض وقُفلت النسخة.');
          }}
        />
      )}

      {can(role, 'create_quotation') && version.status === 'sent' && (
        <Row gap={spacing.sm}>
          <Button
            label="الزبون وافق"
            style={{ flex: 1 }}
            loading={busy === 'decide-quote'}
            icon={<CheckCircle2 size={18} color={palette.ivory} />}
            onPress={async () => {
              const res = await decideVersion(version.id, 'approved');
              if (!res.ok) setError(res.error);
              else
                Alert.alert('تم الاعتماد', 'انتقل المشروع إلى مرحلة تخصيص القماش.', [
                  { text: 'تمام' },
                ]);
            }}
          />
          <Button
            label="مرفوض"
            variant="ghost"
            icon={<XCircle size={18} color={palette.danger} />}
            onPress={async () => {
              const res = await decideVersion(version.id, 'rejected');
              if (!res.ok) setError(res.error);
            }}
          />
        </Row>
      )}
    </ScrollScreen>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 3 }}>
      <AppText variant="caption" color={palette.sage}>
        {label}
      </AppText>
      <AppText variant="label" color={muted ? palette.sage : palette.ivory}>
        {value}
      </AppText>
    </Row>
  );
}
