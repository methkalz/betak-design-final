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
  standard: 'ارتفاع حتى 329 سم',
  tall: 'ارتفاع 330–500 سم',
};

export default function PricingRulesScreen() {
  const { db, role, updatePricingRule } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [price, setPrice] = useState<string>('');
  const [tailor, setTailor] = useState<string>('');
  const [info, setInfo] = useState<string | null>(null);

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
        body="السعر يُحسب لكل متر ركض حسب شريحة الارتفاع ونوع القماش ووجود البطانة، ثم تُجمع البنود في عرض واحد."
      />
      {!!info && <Banner tone="success" title={info} />}

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
                        label="سعر الزبون لكل متر ركض"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        suffix="₪"
                      />
                      <Field
                        label="أجرة الخياط لكل متر ركض"
                        value={tailor}
                        onChangeText={setTailor}
                        keyboardType="decimal-pad"
                        suffix="₪"
                      />
                      <Button
                        label="حفظ القاعدة"
                        full
                        onPress={() => {
                          updatePricingRule(
                            rule.id,
                            Math.round(parseFloat(price || '0') * 100),
                            Math.round(parseFloat(tailor || '0') * 100),
                          );
                          setEditing(null);
                          setInfo('تم تحديث قاعدة التسعير. تنعكس على العروض الجديدة فقط.');
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
