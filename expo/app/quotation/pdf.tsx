import * as Print from 'expo-print';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { FileText, MessageCircle, Share2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';

import { AppText, Banner, Button, Card, Divider, EmptyState, Row, ScrollScreen } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { QuotationVersion } from '@/types/domain';

/** Arabic RTL invoice markup rendered by expo-print into a real PDF. */
function buildHtml(params: {
  version: QuotationVersion;
  orgName: string;
  orgPhone: string;
  orgAddress: string;
  number: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  projectTitle: string;
  vatPercent: number;
}): string {
  const {
    version,
    orgName,
    orgPhone,
    orgAddress,
    number,
    customerName,
    customerPhone,
    customerCity,
    projectTitle,
    vatPercent,
  } = params;
  const rows = version.items
    .map(
      (i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${i.roomName} — ${i.windowName}</td>
        <td>${i.description}</td>
        <td>${i.widthCm} × ${i.heightCm} سم</td>
        <td>${i.runningMeters} م</td>
        <td>₪${(i.unitPriceAgorot / 100).toLocaleString('en-US')}</td>
        <td class="strong">₪${(i.lineTotalAgorot / 100).toLocaleString('en-US')}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", "Geeza Pro", "Arial", sans-serif;
    direction: rtl; text-align: right; color: #1B1F32; margin: 0; padding: 32px;
    background: #F6F6FB;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #4F46E5; padding-bottom: 18px; margin-bottom: 22px; }
  .brand { font-size: 26px; font-weight: 700; color: #4F46E5; }
  .muted { color: #787E9B; font-size: 12px; line-height: 1.7; }
  .badge { background: #EEEFFE; color: #4F46E5; padding: 6px 14px; border-radius: 999px;
    font-size: 12px; display: inline-block; }
  .grid { display: flex; gap: 16px; margin-bottom: 22px; }
  .box { flex: 1; background: #fff; border: 1px solid #EAEAF5; border-radius: 14px; padding: 14px; }
  .box h3 { margin: 0 0 8px; font-size: 13px; color: #787E9B; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; background: #fff;
    border: 1px solid #EAEAF5; border-radius: 14px; overflow: hidden; }
  th { background: #4F46E5; color: #F6F6FB; font-size: 12px; padding: 10px 8px; text-align: right; }
  td { padding: 10px 8px; font-size: 12px; border-bottom: 1px solid #EFEFF8; }
  .strong { font-weight: 700; }
  .totals { margin-top: 20px; margin-right: auto; width: 300px; background: #fff;
    border: 1px solid #EAEAF5; border-radius: 14px; padding: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
  .grand { border-top: 2px solid #4F46E5; margin-top: 8px; padding-top: 10px !important;
    font-size: 17px; font-weight: 700; color: #4F46E5; }
  .foot { margin-top: 26px; font-size: 11px; color: #787E9B; border-top: 1px solid #EAEAF5; padding-top: 12px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">${orgName}</div>
      <div class="muted">${orgAddress}<br/>${orgPhone}</div>
    </div>
    <div style="text-align:left">
      <div class="badge">عرض سعر ${number}</div>
      <div class="muted">النسخة ${version.versionNumber}<br/>${formatDate(version.createdAt)}<br/>صالح حتى ${formatDate(version.validUntil)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>الزبون</h3>
      <div class="strong">${customerName}</div>
      <div class="muted">${customerPhone} • ${customerCity}</div>
    </div>
    <div class="box">
      <h3>المشروع</h3>
      <div class="strong">${projectTitle}</div>
      <div class="muted">${version.items.length} بند</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>الغرفة والشباك</th><th>الوصف</th><th>القياس</th>
        <th>متر ركض</th><th>سعر المتر</th><th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>المجموع</span><span>₪${(version.subtotalAgorot / 100).toLocaleString('en-US')}</span></div>
    <div><span>الخصم (${version.discountPercent}%)</span><span>- ₪${(version.discountAgorot / 100).toLocaleString('en-US')}</span></div>
    <div><span>ض.ق.م ${vatPercent}%</span><span>₪${(version.vatAgorot / 100).toLocaleString('en-US')}</span></div>
    <div class="grand"><span>الإجمالي</span><span>₪${(version.totalAgorot / 100).toLocaleString('en-US')}</span></div>
  </div>

  <div class="foot">
    ${version.note ? `ملاحظة: ${version.note}<br/>` : ''}
    الأسعار شاملة القياس والتركيب والتوصيل. التنفيذ يبدأ بعد اعتماد العرض ودفع الدفعة الأولى.
    <br/>${orgName} — شكرًا لثقتكم.
  </div>
</body>
</html>`;
}

export default function QuotationPdfScreen() {
  const { versionId } = useLocalSearchParams<{ versionId: string }>();
  const { db } = useStore();
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const version = db.quotationVersions.find((v) => v.id === versionId) ?? null;
  const quotation = db.quotations.find((q) => q.id === version?.quotationId) ?? null;
  const project = db.projects.find((p) => p.id === quotation?.projectId) ?? null;
  const customer = db.customers.find((c) => c.id === project?.customerId) ?? null;

  const html = useMemo(() => {
    if (!version || !quotation) return '';
    return buildHtml({
      version,
      orgName: db.organization.name,
      orgPhone: db.organization.phone,
      orgAddress: db.organization.address,
      number: quotation.number,
      customerName: customer?.fullName ?? '',
      customerPhone: customer?.phone ?? '',
      customerCity: customer?.city ?? '',
      projectTitle: project?.title ?? '',
      vatPercent: db.settings.vatPercent,
    });
  }, [version, quotation, customer, project, db.organization, db.settings.vatPercent]);

  if (!version || !quotation) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<FileText size={26} color={palette.olive} />}
          title="النسخة غير موجودة"
          body="أعد فتح العرض واختر النسخة مجددًا."
        />
      </ScrollScreen>
    );
  }

  const exportPdf = async () => {
    setError(null);
    setInfo(null);
    setBusy('pdf');
    try {
      const { uri } = await Print.printToFileAsync({ html });
      setBusy('share');
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${quotation.number} — ${customer?.fullName ?? ''}`,
          UTI: 'com.adobe.pdf',
        });
        setInfo('تم إنشاء ملف PDF ومشاركته.');
      } else {
        setInfo(`تم إنشاء ملف PDF: ${uri}`);
      }
    } catch (e) {
      console.log('[pdf] export failed', e);
      setError('تعذر إنشاء ملف PDF. حاول مرة أخرى.');
    } finally {
      setBusy(null);
    }
  };

  const whatsapp = () => {
    const digits = (customer?.phone ?? '').replace(/\D/g, '');
    const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
    const text = encodeURIComponent(
      `مرحبًا ${customer?.fullName ?? ''}، هذا عرض السعر ${quotation.number} من ${db.organization.name}.\n` +
        `الإجمالي: ₪${(version.totalAgorot / 100).toLocaleString('en-US')}\n` +
        `صالح حتى ${formatDate(version.validUntil)}.`,
    );
    Linking.openURL(`https://wa.me/${intl}?text=${text}`).catch(() =>
      setError('تعذر فتح واتساب على هذا الجهاز.'),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ backgroundColor: palette.white }}>
          <Row justify="space-between" align="flex-start">
            <View>
              <AppText variant="title" color={palette.olive}>
                {db.organization.name}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {db.organization.address}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {db.organization.phone}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-start', gap: 4 }}>
              <View style={{ backgroundColor: palette.sand, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                <AppText variant="caption" color={palette.oliveDark}>
                  {quotation.number}
                </AppText>
              </View>
              <AppText variant="caption" color={palette.muted}>
                النسخة {version.versionNumber}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                صالح حتى {formatDate(version.validUntil)}
              </AppText>
            </View>
          </Row>

          <Divider />

          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={palette.muted}>
                الزبون
              </AppText>
              <AppText variant="label">{customer?.fullName}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {customer?.phone} • {customer?.city}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={palette.muted}>
                المشروع
              </AppText>
              <AppText variant="label">{project?.title}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {version.items.length} بند
              </AppText>
            </View>
          </Row>

          <Divider />

          {version.items.map((i, idx) => (
            <Row key={i.id} justify="space-between" align="flex-start" style={{ paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {idx + 1}. {i.roomName} — {i.windowName}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {i.description} • {cm(i.widthCm)} × {cm(i.heightCm)} • {meters(i.runningMeters)}
                </AppText>
              </View>
              <AppText variant="label">{money(i.lineTotalAgorot)}</AppText>
            </Row>
          ))}

          <Divider />

          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>
              المجموع
            </AppText>
            <AppText variant="label">{money(version.subtotalAgorot)}</AppText>
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>
              الخصم ({percent(version.discountPercent)})
            </AppText>
            <AppText variant="label" color={palette.terracotta}>
              - {money(version.discountAgorot)}
            </AppText>
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>
              ض.ق.م {db.settings.vatPercent}%
            </AppText>
            <AppText variant="label">{money(version.vatAgorot)}</AppText>
          </Row>
          <Divider />
          <Row justify="space-between">
            <AppText variant="heading">الإجمالي</AppText>
            <AppText variant="numberLarge" color={palette.olive}>
              {money(version.totalAgorot)}
            </AppText>
          </Row>
        </Card>

        {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
        {!!info && <Banner tone="success" title={info} />}

        <AppText variant="caption" color={palette.muted} align="center">
          يُنشأ ملف PDF عربي حقيقي من نفس بيانات النسخة المحفوظة — لا يمكن تعديل نسخة مرسلة.
        </AppText>
      </ScrollView>

      <View style={styles.sticky}>
        <Row gap={spacing.sm}>
          <Button
            label="تصدير PDF ومشاركة"
            style={{ flex: 1 }}
            loading={busy !== null}
            icon={<Share2 size={18} color={palette.ivory} />}
            onPress={exportPdf}
          />
          <Button
            label="واتساب"
            variant="accent"
            icon={<MessageCircle size={18} color={palette.white} />}
            onPress={whatsapp}
          />
        </Row>
        {Platform.OS === 'web' && (
          <AppText variant="caption" color={palette.muted} align="center">
            المشاركة الأصلية تعمل على الجهاز؛ على الويب يفتح الملف في نافذة الطباعة.
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = {
  sticky: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: palette.white,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    gap: spacing.sm,
  },
};
