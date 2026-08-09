import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BadgePercent,
  CheckCircle2,
  FileText,
  History,
  Send,
  Share2,
  ShieldAlert,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

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
import { DiscountSlider } from '@/components/DiscountSlider';
import { QuotationDecision } from '@/components/QuotationDecision';
import { palette, spacing } from '@/constants/theme';
import { QUOTATION_STATUS_LABELS, quotationStatusColor } from '@/domain/labels';
import { can } from '@/domain/permissions';
import { checkDiscount, computeTotals, round3 } from '@/domain/pricing';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';


export default function QuotationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    db,
    role,
    busy,
    createVersion,
    sendVersion,
    requestDiscount,
  } = useStore();

  const [discount, setDiscount] = useState<number | null>(null);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState<boolean>(false);
  // الافتراضي «כולל מע"מ»: هو المبلغ الذي يُسأل عنه الزبون ويدفعه
  const [inclVat, setInclVat] = useState<boolean>(true);

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
  const totalMeters = version.items.reduce((s, i) => s + i.runningMeters, 0);
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
                  {item.roomName} - {item.windowName}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {item.description}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {cm(item.widthCm)} × {cm(item.heightCm)} • {meters(item.runningMeters, false)} متر طولي •{' '}
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
        {/* مجموع الأمتار قبل المال: هو ما يُطلب من المخزن ويُسلَّم للخياط،
            وغيابه كان يُلزم جمعه يدويًا من البنود */}
        <SummaryRow label="مجموع الأمتار الطولية" value={meters(round3(totalMeters))} />
        <SummaryRow label="المجموع قبل الخصم" value={money(preview.subtotalAgorot)} />
        <SummaryRow
          label={`الخصم (${percent(activeDiscount)})`}
          value={`- ${money(preview.discountAgorot)}`}
        />
        <SummaryRow label='المجموع לפני מע"מ' value={money(preview.revenueExVatAgorot)} />
        <SummaryRow
          label={`מע"מ ${db.settings.vatPercent}%`}
          value={`+ ${money(preview.vatAgorot)}`}
        />
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: spacing.md }} />
        {/* الرقم الكبير هو ما يُقال للزبون، والمفتاح يبدّل أيَّ الرقمين
            يُقال: بعض الزبائن يسأل عن السعر قبل الضريبة وبعضهم عن المطلوب
            دفعه. الاثنان معروضان أعلاه على كل حال، فالمفتاح إبرازٌ لا إخفاء. */}
        <Row justify="space-between" align="flex-end">
          <View style={{ flex: 1 }}>
            <AppText variant="heading" color={palette.ivory}>
              {inclVat ? 'المطلوب من الزبون' : 'الإجمالي לפני מע"מ'}
            </AppText>
            <Pressable onPress={() => setInclVat((v) => !v)} style={vatSwitch}>
              <AppText variant="caption" color={palette.sage}>
                {inclVat ? 'اعرض לפני מע"מ' : 'اعرض כולל מע"מ'}
              </AppText>
            </Pressable>
          </View>
          <AppText variant="numberLarge" color={palette.ivory}>
            {money(inclVat ? preview.totalAgorot : preview.revenueExVatAgorot)}
          </AppText>
        </Row>
      </Card>

      {showCost && (
        /* بطاقة شفافية الهامش (M4): الرقم كان يُتَّهم بالخطأ لأنه لا يشرح
           نفسه. هنا سلسلة الحساب كاملة: البيع قبل الضريبة - وهو الإيراد
           كاملًا - ثم التكلفة والربح. ومنذ صارت الضريبة تُضاف لا تُستخرَج
           لم يعد للسعر تعريفان للهامش: מע"מ يمرّ بالمحل إلى الدولة ولا
           يدخل الحساب أصلًا، فيُعرض للعلم لا للقسمة عليه. */
        <Card>
          <SectionHeader title="حساب الهامش" subtitle="للأدمن وحده - سلسلة الحساب كاملة" />
          <View style={{ gap: 4 }}>
            <CalcRow
              label='البيع للزبون (לפני מע"מ)'
              value={money(preview.revenueExVatAgorot)}
              strong
            />
            <CalcRow
              label={`מע"מ ${db.settings.vatPercent}% - يُحصَّل للدولة`}
              value={money(preview.vatAgorot)}
            />
            <CalcRow
              label="التكلفة الكاملة (قماش، بطانة، خياطة، سكة، توصيل، قياس وتركيب)"
              value={`- ${money(preview.internalCostAgorot)}`}
            />
            <CalcRow label="الربح" value={money(preview.marginAgorot)} strong />
          </View>
          <Divider />
          {/* هامشٌ واحد لا اثنان. كان للسعر تعريفان لأنه كان شاملًا للضريبة،
              فيُعرض الهامش عليه وعلى الصافي معًا. والآن الضريبة تُضاف فوق
              السعر ولا تدخله، فقسمة الربح على المبلغ الشامل قسمةٌ على مالٍ
              بعضه للدولة - رقمٌ لا معنى له يخفض الهامش زورًا. */}
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>
              {'الهامش على الإيراد (لפני מע"מ - المعتمد للحد الأدنى)'}
            </AppText>
            <AppText variant="label">{percent(preview.marginPercent)}</AppText>
          </Row>
        </Card>
      )}

      {can(role, 'create_quotation') && (
        <Card>
          <SectionHeader
            title="الخصم"
            subtitle={`حتى ${db.settings.employeeDiscountLimitPercent}% ضمن صلاحية الموظف • حتى ${db.settings.adminDiscountLimitPercent}% بموافقة الأدمن`}
          />
          <DiscountSlider
            value={activeDiscount}
            onChange={setDiscount}
            max={Math.max(db.settings.adminDiscountLimitPercent * 2, 20)}
            employeeLimit={db.settings.employeeDiscountLimitPercent}
            adminLimit={db.settings.adminDiscountLimitPercent}
            subtotalAgorot={preview.subtotalAgorot}
            discountAgorot={preview.discountAgorot}
            totalAgorot={preview.totalAgorot}
          />

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
            variant="secondary"
            full
            style={{ marginTop: spacing.md }}
            icon={<BadgePercent size={18} color={palette.oliveDark} />}
            onPress={applyDiscount}
          />
        </Card>
      )}

      {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
      {!!info && <Banner tone="success" title={info} />}

      {/* إرسال العرض هو الفعل الذي يحرّك الشغل، فهو وحده الملوّن. المعاينة
          والمشاركة خدمةٌ مساعدة، ولو تساوت معه في الحضور لتساوت في النداء. */}
      {can(role, 'create_quotation') && version.status === 'draft' && (
        <Button
          label="إرسال العرض للزبون"
          full
          loading={busy === 'send-quote'}
          icon={<Send size={18} color={palette.ivory} />}
          onPress={async () => {
            setError(null);
            const res = await sendVersion(version.id);
            if (!res.ok) setError(res.error);
            else setInfo('تم إرسال العرض وقُفلت النسخة.');
          }}
        />
      )}

      <Button
        label="معاينة ومشاركة PDF"
        variant="secondary"
        full
        icon={<Share2 size={18} color={palette.oliveDark} />}
        onPress={() =>
          router.push({ pathname: '/quotation/pdf', params: { versionId: version.id } })
        }
      />

      {can(role, 'create_quotation') && version.status === 'sent' && (
        <QuotationDecision
          versionId={version.id}
          projectId={quotation.projectId}
          onApproved={() =>
            router.replace({
              pathname: '/project/[id]',
              params: { id: quotation.projectId, tab: 'production' },
            })
          }
          onEdit={() =>
            router.replace({
              pathname: '/project/[id]',
              params: { id: quotation.projectId, tab: 'rooms' },
            })
          }
        />
      )}
    </ScrollScreen>
  );
}

/** سطر في سلسلة حساب الهامش - على سطح أبيض لا على البطاقة الداكنة. */
function CalcRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row justify="space-between" gap={spacing.md} align="flex-start">
      <AppText variant="caption" color={palette.muted} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant={strong ? 'label' : 'caption'}>{value}</AppText>
    </Row>
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

const vatSwitch = {
  alignSelf: 'flex-start' as const,
  marginTop: 4,
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.28)',
};
