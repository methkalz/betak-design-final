import { Tags } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

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
import { palette, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { money } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { HeightBand, PricingCategory } from '@/types/domain';

const CATEGORY_LABELS: Record<PricingCategory, string> = {
  crepe_with_lining: 'كريب مع بطانة',
  crepe_without_lining: 'كريب بدون بطانة',
  other_without_lining: 'قماش آخر بدون بطانة',
  other_with_lining: 'قماش آخر مع بطانة',
};

const BAND_LABELS: Record<HeightBand, string> = {
  standard: 'ارتفاع أقل من 320 سم',
  tall: 'ارتفاع 320 سم فأكثر',
};

/**
 * كل رقم ثابت في التسعيرة، بيد الأدمن (شرط المالك).
 *
 * فُصلت التكاليف عن الأسعار في مجموعتين لأنهما سؤالان مختلفان: «كم يكلّفني»
 * و«كم أُحاسب عليه». والمسار العادي في التكاليف وحدها عمدًا - هو داخلٌ في
 * سعر القماش فلا يُزاد على الزبون، لكنه يبقى محسوبًا على المحل.
 */
const COST_FIELDS = [
  { key: 'trackCostPerMeterAgorot', label: 'مسار عادي - تكلفة المتر' },
  { key: 'motorizedTrackCostPerMeterAgorot', label: 'مسار كهربائي - تكلفة المتر' },
  { key: 'measureInstallCostPerMeterAgorot', label: 'التركيب - تكلفة المتر' },
  { key: 'deliveryCostPerMeterAgorot', label: 'التوصيل - تكلفة المتر' },
  { key: 'motorCostAgorot', label: 'ماتور - تكلفة الستارة' },
  { key: 'remoteCostAgorot', label: 'جهاز تحكم - تكلفة الستارة' },
] as const;

const PRICE_FIELDS = [
  { key: 'motorizedTrackPricePerMeterAgorot', label: 'مسار كهربائي - للزبون لكل متر' },
  { key: 'motorPriceAgorot', label: 'ماتور - للزبون لكل ستارة' },
  { key: 'remotePriceAgorot', label: 'جهاز تحكم - للزبون لكل ستارة' },
] as const;

export default function PricingRulesScreen() {
  const { db, role, busy, updatePricingRule, updateSettings } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [price, setPrice] = useState<string>('');
  const [tailor, setTailor] = useState<string>('');
  const [info, setInfo] = useState<{ text: string; tone: 'success' | 'warning' } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // ★ مسوّدةٌ منفصلة عمدًا: كل مفتاحٍ في `draft` مبلغٌ بالشيكل يُضرب بمئة
  // ليصير أغورة. والنسبة نسبةٌ - لو انضمّت إليهم لصارت 30٪ ثلاثةَ آلاف بالمئة.
  const [pctDraft, setPctDraft] = useState<string | null>(null);

  const shekel = (k: string) =>
    draft[k] ?? String(Math.round((db.settings[k as keyof typeof db.settings] as number) / 100));
  const dirty = Object.keys(draft).length > 0 || pctDraft !== null;
  const saveNumbers = async () => {
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(draft)) patch[k] = Math.round(parseFloat(v || '0')) * 100;
    if (pctDraft !== null) {
      const pct = parseFloat(pctDraft || '0');
      // العمود numeric(5,2) بقيدٍ بين صفر ومئة - نُمسك الخطأ هنا قبل الرحلة.
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return setInfo({ text: 'نسبة الزيادة رقمٌ بين 0 و100.', tone: 'warning' });
      }
      patch.oversizeSurchargePercent = Math.round(pct * 100) / 100;
    }
    const res = await updateSettings(patch);
    if (!res.ok) return setInfo({ text: res.error, tone: 'warning' });
    setDraft({});
    setPctDraft(null);
    setInfo({ text: 'حُفظت التسعيرة. تسري على العروض الجديدة وحدها.', tone: 'success' });
  };

  if (!can(role, 'edit_pricing_rules')) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Tags size={26} color={palette.olive} />}
          title="غير مصرح"
          body="تعديل قواعد التسعير من صلاحيات الأدمن فقط."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Banner
        tone="info"
        title="التسعير لكل شباك"
        body="السعر يُحسب لكل متر طولي حسب شريحة الارتفاع ونوع القماش ووجود البطانة، ثم تُجمع البنود في عرض واحد."
      />
      {!!info && <Banner tone={info.tone} title={info.text} />}

      <Card>
        <SectionHeader
          title="المسار الكهربائي وملحقاته"
          subtitle="ما يُضاف للزبون - المسار العادي داخلٌ في سعر القماش فلا يُزاد"
        />
        <View style={{ gap: spacing.md }}>
          {PRICE_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              value={shekel(f.key)}
              onChangeText={(t) => setDraft((d) => ({ ...d, [f.key]: t.replace(/\D/g, '') }))}
              keyboardType="numeric"
              suffix="₪"
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="التكاليف على المحل"
          subtitle="لا تظهر للزبون - عليها تُحسب نسبة الربح"
        />
        <View style={{ gap: spacing.md }}>
          {COST_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              value={shekel(f.key)}
              onChangeText={(t) => setDraft((d) => ({ ...d, [f.key]: t.replace(/\D/g, '') }))}
              keyboardType="numeric"
              suffix="₪"
            />
          ))}
          <AppText variant="caption" color={palette.muted}>
            تكلفة القماش والبطانة وكمية استهلاك كل صنف تُضبط من مكتبة الأقمشة،
            لأنها خاصة بكل لون على حدة.
          </AppText>
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="الستائر العالية"
          subtitle="من 500 سم فأكثر - تُزاد على سعر الزبون وأجرة الخياط والقياس والتركيب"
        />
        <View style={{ gap: spacing.md }}>
          <Field
            label="نسبة الزيادة"
            value={pctDraft ?? String(db.settings.oversizeSurchargePercent)}
            onChangeText={(t) => {
              // نقطةٌ واحدة على الأكثر: «3.0.5» يبتلعها parseFloat فيقرؤها 3
              // صامتةً - فتُطوى النقطة الثانية أمام عين المالك وهو يكتب.
              const [head, ...rest] = t.replace(/[^\d.]/g, '').split('.');
              setPctDraft(rest.length ? `${head}.${rest.join('')}` : head);
            }}
            keyboardType="numeric"
            suffix="%"
          />
          <AppText variant="caption" color={palette.muted}>
            تظهر للزبون رقمًا عاديًّا في سعر المتر - لا سطرَ ولا نسبةَ في العرض.
            القماش والبطانة والمسار والتوصيل والماتور لا تُزاد. وفوق 800 سم تلزم
            تسعيرة خاصة.
          </AppText>
        </View>
      </Card>

      {dirty && (
        <Button label="حفظ التسعيرة" full loading={busy === 'save-settings'} onPress={saveNumbers} />
      )}

      {(['standard', 'tall'] as HeightBand[]).map((band) => (
        <Card key={band}>
          <SectionHeader title={BAND_LABELS[band]} />
          {db.pricingRules
            .filter((r) => r.band === band)
            .map((rule, i, arr) => {
              const isEditing = editing === rule.id;
              return (
                <View key={rule.id}>
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">{CATEGORY_LABELS[rule.category]}</AppText>
                      <Row gap={spacing.sm} style={{ marginTop: 4 }}>
                        <Pill
                          label={`الزبون ${money(rule.customerPricePerMeterAgorot)}/م`}
                          bg={palette.sageSoft}
                          fg={palette.oliveDark}
                          small
                        />
                        <Pill
                          label={`الخياط ${money(rule.tailorCostPerMeterAgorot)}/م`}
                          bg={palette.ivoryDeep}
                          fg={palette.muted}
                          small
                        />
                      </Row>
                    </View>
                    <Button
                      label={isEditing ? 'إلغاء' : 'تعديل'}
                      variant="ghost"
                      small
                      onPress={() => {
                        if (isEditing) return setEditing(null);
                        setEditing(rule.id);
                        setPrice(String(rule.customerPricePerMeterAgorot / 100));
                        setTailor(String(rule.tailorCostPerMeterAgorot / 100));
                      }}
                    />
                  </Row>

                  {isEditing && (
                    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                      <Field
                        label="سعر الزبون لكل متر طولي"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        suffix="₪"
                      />
                      <Field
                        label="أجرة الخياط لكل متر طولي"
                        value={tailor}
                        onChangeText={setTailor}
                        keyboardType="decimal-pad"
                        suffix="₪"
                      />
                      <Button
                        label="حفظ القاعدة"
                        full
                        loading={busy === 'save-settings'}
                        onPress={async () => {
                          const res = await updatePricingRule(
                            rule.id,
                            Math.round(parseFloat(price || '0') * 100),
                            Math.round(parseFloat(tailor || '0') * 100),
                          );
                          if (!res.ok) return setInfo({ text: res.error, tone: 'warning' });
                          setEditing(null);
                          setInfo({
                            text: 'تم تحديث قاعدة التسعير. تنعكس على العروض الجديدة فقط.',
                            tone: 'success',
                          });
                        }}
                      />
                    </View>
                  )}

                  {i < arr.length - 1 && <Divider />}
                </View>
              );
            })}
        </Card>
      ))}

      <AppText variant="caption" color={palette.muted} align="center">
        النسخ المرسلة من العروض لا تتأثر بأي تعديل لاحق على الأسعار.
      </AppText>
    </ScrollScreen>
  );
}
