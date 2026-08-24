
import { useLocalSearchParams } from 'expo-router';

import { FileText, MessageCircle, Share2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Banner, Button, Card, Divider, EmptyState, Row, ScrollScreen } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { exportHtmlDocument } from '@/lib/exportDoc';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { buildQuoteHtml } from '@/domain/quoteDoc';
import { BRAND_WORDMARK, QUOTE_STRINGS, type QuoteLang } from '@/domain/quoteStrings';
import { useStore } from '@/providers/store';
import type { QuotationVersion } from '@/types/domain';

/**
 * شاشة معاينة/تصدير عرض السعر.
 *
 * الوثيقة نفسها تعيش في `domain/quoteDoc.ts` - وحدةٌ نقيّة مفحوصة. هذه الشاشة
 * تجمع البيانات وتُشغّل التصدير لا أكثر.
 */
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
    return buildQuoteHtml({
      version,
      orgName: db.organization.name,
      orgAddress: db.organization.address,
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
      const title = `${quotation.number} - ${customer?.fullName ?? ''}`.trim();
      const res = await exportHtmlDocument(html, title);
      if (res.kind === 'shared') setInfo('تم إنشاء ملف PDF ومشاركته.');
      else if (res.kind === 'printed') setInfo('فُتحت نافذة الطباعة - اختر «حفظ كـPDF».');
      else setInfo(`تم إنشاء ملف PDF: ${res.uri}`);
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
            على الحاسوب: «تصدير PDF» يفتح نافذة الطباعة على المقترح - اختر «حفظ كـPDF»
            لتنزيله، ثم أرسله بواتساب.
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
