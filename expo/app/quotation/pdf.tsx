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
  // المرساة: السعر المُضخَّم حيث وُجد وإلا الحقيقي - يُقابله النهائي فيخرج «وفّرت»
  const anchorSubtotal = version.items.reduce(
    (a, i) => a + Math.max(i.listPriceAgorot, i.lineTotalAgorot),
    0,
  );
  const saved = anchorSubtotal - revExVat;

  /**
   * \u062e\u0645\u0633\u0629 \u0623\u0639\u0645\u062f\u0629 \u0644\u0627 \u0633\u0628\u0639\u0629. \u0627\u0644\u0648\u0635\u0641 \u0627\u0646\u062a\u0642\u0644 \u062a\u062d\u062a \u0627\u0633\u0645 \u0627\u0644\u0628\u0646\u062f \u0648\u0627\u0644\u0623\u0645\u062a\u0627\u0631 \u062a\u062d\u062a \u0627\u0644\u0642\u064a\u0627\u0633\u060c \u0648\u0647\u0648
   * \u0645\u0627 \u062a\u0641\u0639\u0644\u0647 \u0634\u0627\u0634\u0629 \u0627\u0644\u0639\u0631\u0636 \u0646\u0641\u0633\u0647\u0627: \u0633\u0628\u0639\u0629 \u0623\u0639\u0645\u062f\u0629 \u0639\u0644\u0649 A4 \u0639\u0631\u0628\u064a\u0629 \u062a\u0633\u062d\u0642 \u0639\u0645\u0648\u062f\u064a \u0627\u0644\u0633\u0639\u0631
   * \u0648\u062a\u062c\u0639\u0644 \u0627\u0644\u0648\u062b\u064a\u0642\u0629 \u062a\u064f\u0642\u0631\u0623 \u0643\u062c\u062f\u0648\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0644\u0627 \u0643\u0639\u0631\u0636 \u0633\u0639\u0631.
   */
  const rows = version.items
    .map(
      (i, idx) => `
      <tr>
        <td class="idx num">${idx + 1}</td>
        <td>
          <span class="item-name">${i.roomName} - ${i.windowName}</span>
          ${i.description ? `<span class="item-desc">${i.description}</span>` : ''}
        </td>
        <td class="num">
          <span class="size">${i.widthCm} \u00d7 ${i.heightCm} ${t.sizeUnit}</span>
          <span class="size-sub">${i.runningMeters} ${t.metersUnit}</span>
        </td>
        <td class="num">${money(i.unitPriceAgorot)}</td>
        <td class="num total">${
          i.listPriceAgorot > i.lineTotalAgorot
            ? `<span class="was">${money(i.listPriceAgorot)}</span>`
            : ''
        }<span class="now">${money(i.lineTotalAgorot)}</span></td>
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
    direction: rtl; text-align: right; color: #1B1F32; padding: 32px 28px;
    background: #FFFFFF; -webkit-font-smoothing: antialiased; font-size: 12px; line-height: 1.5; }
  /* أرقامٌ بعرضٍ واحد: بدونها لا تصطفّ خانات الأسعار تحت بعضها في العمود */
  .num, .totals .r, .grand, .brand-phone { font-variant-numeric: tabular-nums; }

  .head { display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 16px; margin-bottom: 18px;
    border-bottom: 2px solid #4F46E5; }
  .brand { font-size: 27px; font-weight: 700; color: #211D63; letter-spacing: .3px; line-height: 1.1; }
  .brand-sub { color: #4338CA; font-size: 12.5px; font-weight: 700; margin-top: 4px; }
  .brand-phone { color: #5C6280; font-size: 11.5px; margin-top: 2px; direction: ltr; text-align: right; }
  .badge { background: #4F46E5; color: #fff; padding: 6px 15px; border-radius: 999px;
    font-size: 12.5px; font-weight: 700; display: inline-block; }
  .meta { color: #5C6280; font-size: 11px; line-height: 1.8; margin-top: 7px; }
  .meta b { color: #211D63; }

  .grid { display: flex; gap: 12px; margin-bottom: 16px; }
  .box { flex: 1; background: #F6F6FB; border: 1px solid #E2E3F2; border-radius: 12px; padding: 12px 14px; }
  .box h3 { font-size: 10.5px; color: #5C6280; font-weight: 700; margin-bottom: 5px; letter-spacing: .3px; }
  .box .big { font-size: 14px; font-weight: 700; color: #211D63; }
  .box .muted { color: #5C6280; font-size: 11px; margin-top: 2px; }

  /* عرضٌ ثابت لكل عمود: بلا هذا يبتلع عمود الوصف الصفحة ويُسحق عمودا السعر */
  table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
    margin-top: 4px; border: 1px solid #E2E3F2; border-radius: 12px; overflow: hidden; }
  col.c-idx   { width: 6%; }
  col.c-item  { width: 39%; }
  col.c-size  { width: 18%; }
  col.c-unit  { width: 16%; }
  col.c-total { width: 21%; }
  /* الرأس يتكرر على كل صفحة، والبند لا ينشطر بين صفحتين */
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  thead th { background: #EEEFFE; color: #2E27A8; font-size: 10.5px; font-weight: 700;
    padding: 9px 8px; text-align: right; }
  td { padding: 9px 8px; font-size: 11.5px; border-top: 1px solid #EDEDF7;
    vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  tbody tr:first-child td { border-top: none; }
  tbody tr:nth-child(even) td { background: #FAFAFE; }
  td.idx { color: #767DA5; font-weight: 700; }
  .item-name { display: block; font-weight: 700; color: #211D63; }
  .item-desc { display: block; color: #5C6280; font-size: 10.5px; margin-top: 2px; line-height: 1.45; }
  .size      { display: block; color: #2C3150; }
  .size-sub  { display: block; color: #5C6280; font-size: 10.5px; margin-top: 2px; }
  td.total .now { display: block; font-weight: 700; color: #211D63; font-size: 12.5px; }

  /* السعر قبل الخصم. كان #A0A4BB وهو أفتح من أن يُقرأ مطبوعًا؛ الآن مقروء،
     والشطب وحده - بلونٍ دافئ - هو ما يقول إنه السعر القديم لا بهتان اللون. */
  .was { display: block; color: #6B7191; font-size: 11px; font-weight: 500;
    text-decoration: line-through; text-decoration-color: #E0796F;
    text-decoration-thickness: 1.4px; margin-bottom: 1px; }

  .totals { margin-top: 16px; margin-inline-start: auto; width: 300px;
    background: #F6F6FB; border: 1px solid #E2E3F2; border-radius: 12px; padding: 14px 16px;
    break-inside: avoid; page-break-inside: avoid; }
  .totals .r { display: flex; justify-content: space-between; padding: 4px 0;
    font-size: 12px; color: #3F4560; }
  /* «قبل الخصم» في صندوق المجاميع يُشطب كما يُشطب سعر البند - نفس اللغة البصرية */
  .totals .r .strike { color: #6B7191; text-decoration: line-through;
    text-decoration-color: #E0796F; text-decoration-thickness: 1.4px; }
  .totals .save { color: #067A5B; font-weight: 700;
    border-top: 1px dashed #C9CBE6; margin-top: 8px; padding-top: 8px; }
  .grand { display: flex; justify-content: space-between; align-items: baseline;
    border-top: 2px solid #4F46E5; margin-top: 9px; padding-top: 10px;
    font-size: 17px; font-weight: 700; color: #3B32C4; }
  .grand .label { font-size: 13px; color: #211D63; }

  .foot { margin-top: 20px; font-size: 10.5px; color: #5C6280; line-height: 1.75;
    border-top: 1px solid #E2E3F2; padding-top: 12px; break-inside: avoid; }
  .foot .note { color: #211D63; font-weight: 700; margin-bottom: 5px; }
  .thanks { color: #3B32C4; font-weight: 700; margin-top: 6px; }
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
    <colgroup>
      <col class="c-idx" /><col class="c-item" /><col class="c-size" />
      <col class="c-unit" /><col class="c-total" />
    </colgroup>
    <thead>
      <tr>
        <th>${t.colIndex}</th><th>${t.colRoom}</th><th>${t.colSize}</th>
        <th>${t.colUnit}</th><th>${t.colTotal}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="r"><span>${t.sumMeters}</span><span>${totalMeters} ${t.metersUnit}</span></div>
    <div class="r"><span>${saved > 0 ? t.listTotal : t.subtotal}</span><span class="${
      saved > 0 ? 'strike' : ''
    }">${money(saved > 0 ? anchorSubtotal : version.subtotalAgorot)}</span></div>
    ${
      showVat
        ? `<div class="r"><span>${saved > 0 ? t.afterDiscount : t.subtotal}</span><span>${money(revExVat)}</span></div>
    <div class="r"><span>${t.vat} ${vatPercent}%</span><span>+ ${money(version.vatAgorot)}</span></div>
    <div class="grand"><span class="label">${t.grandInclVat}</span><span>${money(version.totalAgorot)}</span></div>`
        : `<div class="grand"><span class="label">${t.grand}</span><span>${money(revExVat)}</span></div>`
    }
    ${saved > 0 ? `<div class="r save"><span>${t.youSaved}</span><span>${money(saved)}</span></div>` : ''}
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
      `مرحبا ${customer?.fullName ?? ''}، هذا عرض السعر ${quotation.number} من ${db.organization.name}.\n` +
        `السعر النهائي: ${money(version.totalAgorot)}\n` +
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
