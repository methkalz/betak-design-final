
import { useLocalSearchParams } from 'expo-router';

import { FileText, MessageCircle, Share2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentPreview } from '@/components/DocumentPreview';
import { AppText, Banner, Button, EmptyState, Row, ScrollScreen } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { exportHtmlDocument } from '@/lib/exportDoc';
import { formatDate, money } from '@/lib/format';
import { buildQuoteHtml } from '@/domain/quoteDoc';
import { QUOTE_STRINGS, type QuoteLang } from '@/domain/quoteStrings';
import { templateLabel } from '@/domain/quoteThemes';
import { useStore } from '@/providers/store';

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
      // قالب المحل من الإعدادات - عرضٌ بحت لا يمسّ رقمًا
      template: db.settings.quoteTemplate,
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
        {/* ★ الوثيقة نفسها لا تقريبٌ لها: مصدرٌ واحد يقطع احتمال أن يرى
            البائع شيئًا ويستلم الزبون غيره. */}
        <DocumentPreview html={html} />

        {!!error && <Banner tone="danger" title="تعذر التنفيذ" body={error} />}
        {!!info && <Banner tone="success" title={info} />}

        <AppText variant="caption" color={palette.muted} align="center">
          هذه الوثيقة نفسها التي ستُطبع وتُرسل - بقالب «{templateLabel(db.settings.quoteTemplate, lang)}».
          لا شيء يُرسل من هذه الشاشة حتى تضغط «إرسال للزبون».
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
            label="تصدير PDF"
            style={{ flex: 1 }}
            loading={busy !== null}
            icon={<Share2 size={18} color={palette.ivory} />}
            onPress={exportPdf}
          />
          <Button
            label="إرسال للزبون"
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
