import * as Print from 'expo-print';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { FileText, MessageCircle, Share2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Banner, Button, Card, Divider, EmptyState, Row, ScrollScreen } from '@/components/ui';
import { CAIRO_BOLD_B64, CAIRO_REGULAR_B64 } from '@/constants/cairoFont';
import { HEEBO_BOLD_B64, HEEBO_REGULAR_B64 } from '@/constants/heeboFont';
import { palette, radius, spacing } from '@/constants/theme';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';
import { BRAND_WORDMARK, QUOTE_STRINGS, type QuoteLang } from '@/domain/quoteStrings';
import type { QuotationVersion } from '@/types/domain';

/**
 * وثيقة مقترح السعر HTML - تُطبع PDF عبر expo-print.
 *
 * ثنائية اللغة (عربي/عبري): الخط والمصطلحات والاتجاه من `lang`. الخط مضمَّن
 * base64 (Cairo للعربي كخط التطبيق، Heebo للعبري) فالوثيقة تُطبع في WebView
 * لا خطوط تطبيقٍ فيه. العنوان علامةٌ طباعية «Betak Design» + المدينة (باللغة)
 * + هاتف الأدمن. لا شعار صورة.
 */
function buildHtml(params: {
  version: QuotationVersion;
  orgPhone: string;
  number: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  projectTitle: string;
  vatPercent: number;
  showVat: boolean;
  lang: QuoteLang;
}): string {
  const { version, orgPhone, number, customerName, customerPhone, customerCity,
    projectTitle, vatPercent, showVat, lang } = params;
  const t = QUOTE_STRINGS[lang];
  const isHe = lang === 'he';
  const [REG, BOLD] = isHe ? [HEEBO_REGULAR_B64, HEEBO_BOLD_B64] : [CAIRO_REGULAR_B64, CAIRO_BOLD_B64];
  const totalMeters = Math.round(version.items.reduce((s, i) => s + i.runningMeters, 0) * 1000) / 1000;
  const revExVat = version.totalAgorot - version.vatAgorot;

  const rows = version.items
    .map(
      (i, idx) => `
      <tr>
        <td class="idx">${idx + 1}</td>
        <td><b>${i.roomName} - ${i.windowName}</b></td>
        <td class="muted">${i.description}</td>
        <td>${i.widthCm} \u00d7 ${i.heightCm} ${t.sizeUnit}</td>
        <td>${i.runningMeters} ${t.metersUnit}</td>
        <td>${money(i.unitPriceAgorot)}</td>
        <td class="strong">${money(i.lineTotalAgorot)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="${lang}">
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family:'Doc'; font-weight:400; font-display:block;
    src:url(data:font/woff2;base64,${REG}) format('woff2'); }
  @font-face { font-family:'Doc'; font-weight:700; font-display:block;
    src:url(data:font/woff2;base64,${BOLD}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Doc', "Helvetica Neue", Arial, sans-serif;
    direction: rtl; text-align: right; color: #1B1F32; padding: 34px 30px;
    background: #FFFFFF; -webkit-font-smoothing: antialiased; font-size: 12.5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 18px; margin-bottom: 22px;
    border-bottom: 2px solid #4F46E5; }
  .brand { font-size: 30px; font-weight: 700; color: #211D63; letter-spacing: .4px; line-height: 1.1; }
  .brand-sub { color: #4F46E5; font-size: 13px; font-weight: 700; margin-top: 5px; }
  .brand-phone { color: #787E9B; font-size: 12px; margin-top: 2px; direction: ltr; text-align: right; }
  .badge { background: #4F46E5; color: #fff; padding: 7px 16px; border-radius: 999px;
    font-size: 13px; font-weight: 700; display: inline-block; }
  .meta { color: #787E9B; font-size: 11.5px; line-height: 1.9; margin-top: 8px; }
  .grid { display: flex; gap: 14px; margin-bottom: 20px; }
  .box { flex: 1; background: #F6F6FB; border: 1px solid #EAEAF5; border-radius: 16px; padding: 14px 16px; }
  .box h3 { font-size: 11px; color: #787E9B; font-weight: 700; margin-bottom: 7px; letter-spacing: .3px; }
  .box .big { font-size: 15px; font-weight: 700; color: #211D63; }
  .box .muted { color: #787E9B; font-size: 11.5px; margin-top: 3px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 4px;
    border: 1px solid #EAEAF5; border-radius: 16px; overflow: hidden; }
  thead th { background: #EEEFFE; color: #3B32C4; font-size: 11px; font-weight: 700;
    padding: 11px 9px; text-align: right; }
  td { padding: 11px 9px; font-size: 12px; border-top: 1px solid #EFEFF8; vertical-align: middle; }
  tbody tr:first-child td { border-top: none; }
  td.idx { color: #A5B4FC; font-weight: 700; }
  td.muted { color: #787E9B; }
  .strong { font-weight: 700; color: #211D63; }
  .totals { margin-top: 20px; margin-inline-start: auto; width: 320px;
    background: #F6F6FB; border: 1px solid #EAEAF5; border-radius: 16px; padding: 16px 18px; }
  .totals .r { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12.5px; color: #4A4F6A; }
  .totals .save { color: #10B981; font-weight: 700; }
  .grand { display: flex; justify-content: space-between; align-items: baseline;
    border-top: 2px solid #4F46E5; margin-top: 10px; padding-top: 12px;
    font-size: 19px; font-weight: 700; color: #4F46E5; }
  .foot { margin-top: 26px; font-size: 11px; color: #787E9B; line-height: 1.8;
    border-top: 1px solid #EAEAF5; padding-top: 14px; }
  .foot .note { color: #211D63; font-weight: 700; margin-bottom: 6px; }
  .thanks { color: #4F46E5; font-weight: 700; margin-top: 6px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">${BRAND_WORDMARK}</div>
      <div class="brand-sub">${t.city}</div>
      <div class="brand-phone">${orgPhone}</div>
    </div>
    <div style="text-align:left">
      <div class="badge">${t.quote} ${number}</div>
      <div class="meta">${t.version} ${version.versionNumber}<br/>${t.issuedOn}: ${formatDate(version.createdAt)}<br/><b>${t.validUntil}: ${formatDate(version.validUntil)}</b></div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>${t.customer}</h3>
      <div class="big">${customerName}</div>
      <div class="muted">${customerPhone}${customerCity ? ' \u2022 ' + customerCity : ''}</div>
    </div>
    <div class="box">
      <h3>${t.project}</h3>
      <div class="big">${projectTitle}</div>
      <div class="muted">${t.itemsCount(version.items.length)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t.colIndex}</th><th>${t.colRoom}</th><th>${t.colDesc}</th><th>${t.colSize}</th>
        <th>${t.colMeters}</th><th>${t.colUnit}</th><th>${t.colTotal}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="r"><span>${t.sumMeters}</span><span>${totalMeters} ${t.metersUnit}</span></div>
    <div class="r"><span>${t.subtotal}</span><span>${money(version.subtotalAgorot)}</span></div>
    ${
      version.discountAgorot > 0
        ? `<div class="r"><span>${t.discount}</span><span>- ${money(version.discountAgorot)}</span></div>`
        : ''
    }
    ${
      showVat
        ? `${version.discountAgorot > 0 ? `<div class="r"><span>${t.afterDiscount}</span><span>${money(revExVat)}</span></div>` : ''}
    <div class="r"><span>${t.vat} ${vatPercent}%</span><span>+ ${money(version.vatAgorot)}</span></div>
    <div class="grand"><span>${t.grandInclVat}</span><span>${money(version.totalAgorot)}</span></div>`
        : `<div class="grand"><span>${t.grand}</span><span>${money(revExVat)}</span></div>`
    }
  </div>

  <div class="foot">
    ${version.note ? `<div class="note">${t.note}: ${version.note}</div>` : ''}
    ${t.terms}
    <div class="thanks">${BRAND_WORDMARK} \u2014 ${t.thanks}</div>
  </div>
</body>
</html>`;
}

export default function QuotationPdfScreen() {
  const { versionId, vat, lang: langParam } = useLocalSearchParams<{
    versionId: string;
    vat?: string;
    lang?: string;
  }>();
  /** מע"מ لا تُذكر في المستند إلا حين اختار المستخدم כולل מע"מ في العرض. */
  const showVat = vat === 'incl';
  const lang: QuoteLang = langParam === 'he' ? 'he' : 'ar';
  const t = QUOTE_STRINGS[lang];
  const { db } = useStore();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // ارتفاع الشريط يُقاس ولا يُخمَّن: كان المحتوى يُحجب خلفه بمقدار يختلف من
  // جهاز لآخر ومن لغة زر لأخرى
  const [barHeight, setBarHeight] = useState(0);

  const version = db.quotationVersions.find((v) => v.id === versionId) ?? null;
  const quotation = db.quotations.find((q) => q.id === version?.quotationId) ?? null;
  const project = db.projects.find((p) => p.id === quotation?.projectId) ?? null;
  const customer = db.customers.find((c) => c.id === project?.customerId) ?? null;

  const html = useMemo(() => {
    if (!version || !quotation) return '';
    return buildHtml({
      version,
      orgPhone: db.organization.phone,
      number: quotation.number,
      customerName: customer?.fullName ?? '',
      customerPhone: customer?.phone ?? '',
      customerCity: customer?.city ?? '',
      projectTitle: project?.title ?? '',
      vatPercent: db.settings.vatPercent,
      showVat,
      lang,
    });
  }, [version, quotation, customer, project, db.organization, db.settings.vatPercent, showVat, lang]);

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
          dialogTitle: `${quotation.number} - ${customer?.fullName ?? ''}`,
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
        `الإجمالي: ${money(version.totalAgorot)}\n` +
        `صالح حتى ${formatDate(version.validUntil)}.`,
    );
    Linking.openURL(`https://wa.me/${intl}?text=${text}`).catch(() =>
      setError('تعذر فتح واتساب على هذا الجهاز.'),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          paddingBottom: barHeight + spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ backgroundColor: palette.white }}>
          <Row justify="space-between" align="flex-start">
            <View>
              <AppText variant="title" color={palette.oliveDeepest}>
                {BRAND_WORDMARK}
              </AppText>
              <AppText variant="caption" color={palette.olive}>
                {t.city}
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
                {t.version} {version.versionNumber}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {t.validUntil} {formatDate(version.validUntil)}
              </AppText>
            </View>
          </Row>

          <Divider />

          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={palette.muted}>
                {t.customer}
              </AppText>
              <AppText variant="label">{customer?.fullName}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {customer?.phone} • {customer?.city}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={palette.muted}>
                {t.project}
              </AppText>
              <AppText variant="label">{project?.title}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {t.itemsCount(version.items.length)} •{' '}
                {meters(
                  Math.round(version.items.reduce((s, i) => s + i.runningMeters, 0) * 1000) / 1000,
                )}
              </AppText>
            </View>
          </Row>

          <Divider />

          {version.items.map((i, idx) => (
            <Row key={i.id} justify="space-between" align="flex-start" style={{ paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">
                  {idx + 1}. {i.roomName} - {i.windowName}
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
              {t.subtotal}
            </AppText>
            <AppText variant="label">{money(version.subtotalAgorot)}</AppText>
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>
              {t.discount} ({percent(version.discountPercent)})
            </AppText>
            <AppText variant="label" color={palette.terracotta}>
              - {money(version.discountAgorot)}
            </AppText>
          </Row>
          {showVat && (
            <>
              {version.discountAgorot > 0 && (
                <Row justify="space-between">
                  <AppText variant="caption" color={palette.muted}>
                    {t.afterDiscount}
                  </AppText>
                  <AppText variant="label">
                    {money(version.totalAgorot - version.vatAgorot)}
                  </AppText>
                </Row>
              )}
              <Row justify="space-between">
                <AppText variant="caption" color={palette.muted}>
                  {t.vat} {db.settings.vatPercent}%
                </AppText>
                <AppText variant="label">+ {money(version.vatAgorot)}</AppText>
              </Row>
            </>
          )}
          <Divider />
          <Row justify="space-between">
            <AppText variant="heading">
              {showVat ? t.grandInclVat : t.grand}
            </AppText>
            <AppText variant="numberLarge" color={palette.olive}>
              {money(showVat ? version.totalAgorot : version.totalAgorot - version.vatAgorot)}
            </AppText>
          </Row>
        </Card>

        {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
        {!!info && <Banner tone="success" title={info} />}

        <AppText variant="caption" color={palette.muted} align="center">
          يُنشأ ملف PDF عربي حقيقي من نفس بيانات النسخة المحفوظة - لا يمكن تعديل نسخة مرسلة.
        </AppText>
      </ScrollView>

      {/* الحشوة السفلية كانت رقمًا ثابتًا (28) يُخمّن شريط الإيماءات، فيقع
          الزران تحته على الأجهزة الحديثة. المقاس الحقيقي يأتي من النظام. */}
      <View
        style={[styles.sticky, { paddingBottom: insets.bottom + spacing.lg }]}
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
      >
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
    backgroundColor: palette.white,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    gap: spacing.sm,
  },
};
