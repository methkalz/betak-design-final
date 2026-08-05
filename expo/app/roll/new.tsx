/**
 * استلام شحنة - رول جديد.
 *
 * الشحنة رولٌ مستقلّ بدفعة صبغه ورقمه، لا زيادةُ أمتار على رول قائم. الدمج
 * يُخفي اختلاف الدفعتين تحت رقم واحد، فيسقط التحذير الذي يمنع خروج ستارة
 * بلونين متقاربين لا متطابقين - وهو فرقٌ يظهر على الجدار ولا يُصلَح بعد القص.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PackagePlus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

export default function NewRollScreen() {
  const { variantId: preset } = useLocalSearchParams<{ variantId?: string }>();
  const { db, addFabricRoll } = useStore();
  const router = useRouter();

  const [variantId, setVariantId] = useState<string>(preset ?? '');
  const [code, setCode] = useState('');
  const [dyeLot, setDyeLot] = useState('');
  const [location, setLocation] = useState('');
  const [meters, setMeters] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** الدفعات المستعملة لهذا اللون - تذكيرٌ بما في المخزن قبل كتابة دفعة جديدة. */
  const knownLots = useMemo(() => {
    const lots = db.fabricRolls
      .filter((r) => r.variantId === variantId)
      .map((r) => r.dyeLot)
      .filter(Boolean);
    return Array.from(new Set(lots));
  }, [db.fabricRolls, variantId]);

  const submit = () => {
    setError(null);
    if (!variantId) return setError('اختر لون القماش أولًا.');
    const res = addFabricRoll({
      variantId,
      code,
      dyeLot,
      location,
      meters: parseFloat(meters || '0'),
    });
    if (!res.ok) return setError(res.error);
    router.replace({ pathname: '/roll/[id]', params: { id: res.data } });
  };

  if (db.fabricVariants.length === 0) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<PackagePlus size={26} color={palette.olive} />}
          title="لا توجد ألوان بعد"
          body="أضف قماشًا ولونًا في المكتبة أولًا، ثم استلم شحنته."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Card>
        <SectionHeader title="اللون المستلَم" subtitle="الرول يتبع لونًا واحدًا" />
        <View style={{ gap: spacing.sm }}>
          {db.fabricVariants.map((v) => {
            const product = db.fabricProducts.find((p) => p.id === v.productId);
            const active = variantId === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => setVariantId(v.id)}
                style={[styles.option, active && styles.optionActive]}
              >
                <Row gap={spacing.md}>
                  <Swatch color={v.colorHex} size={34} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">
                      {product?.name} {v.colorName}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {v.sku || 'بلا رمز'} • عرض {product?.widthCm} سم
                    </AppText>
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <AppText variant="heading">بيانات الرول</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          <Field
            label="رقم الرول"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="R-2026-014"
          />
          <Field
            label="دفعة الصبغ"
            value={dyeLot}
            onChangeText={setDyeLot}
            autoCapitalize="characters"
            placeholder="LOT-441"
          />
          {knownLots.length > 0 && (
            <View style={{ gap: 6 }}>
              <AppText variant="caption" color={palette.muted}>
                دفعات موجودة لهذا اللون
              </AppText>
              <Row gap={spacing.sm} wrap>
                {knownLots.map((l) => (
                  <Pressable key={l} onPress={() => setDyeLot(l)} style={styles.lotChip}>
                    <AppText variant="caption" color={palette.oliveDark}>
                      {l}
                    </AppText>
                  </Pressable>
                ))}
              </Row>
            </View>
          )}
          <Field label="الموقع في المخزن" value={location} onChangeText={setLocation} placeholder="رف A3" />
          <Field
            label="الأمتار المستلمة"
            value={meters}
            onChangeText={setMeters}
            keyboardType="decimal-pad"
            suffix="متر"
            placeholder="0"
          />
        </View>
      </Card>

      {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}

      <Button
        label="تسجيل الاستلام"
        full
        icon={<PackagePlus size={18} color={palette.ivory} />}
        onPress={submit}
      />
    </ScrollScreen>
  );
}

const styles = {
  option: {
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    padding: spacing.md,
    minHeight: 58,
    justifyContent: 'center' as const,
  },
  optionActive: { borderColor: palette.olive, backgroundColor: palette.sageSoft },
  lotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: palette.sand,
  },
};
