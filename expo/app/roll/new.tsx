/**
 * استلام بضاعة - حقلان لا نموذج (M23).
 *
 * الاختيار للنوع والأمتار فقط. رقم الرول ودفعة الصبغ يولَّدان تلقائيًا في
 * المخزن: كل استلام دفعة مستقلة، فتحذير اختلاف الدفعات - الذي يمنع خروج
 * ستارة بلونين متقاربين لا متطابقين - يبقى يعمل بلا أن يُكتب حرف واحد.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PackagePlus, Search } from 'lucide-react-native';
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
import { normalizeArabic } from '@/data/towns';
import { useStore } from '@/providers/store';

export default function NewRollScreen() {
  const { variantId: preset } = useLocalSearchParams<{ variantId?: string }>();
  const { db, addFabricRoll } = useStore();
  const router = useRouter();

  const [variantId, setVariantId] = useState<string>(preset ?? '');
  const [metersIn, setMetersIn] = useState('');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const variants = useMemo(() => {
    const q = normalizeArabic(search.trim());
    if (!q) return db.fabricVariants;
    return db.fabricVariants.filter((v) => {
      const p = db.fabricProducts.find((x) => x.id === v.productId);
      return (
        normalizeArabic(`${p?.name ?? ''} ${v.colorName}`).includes(q) ||
        v.sku.toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [db.fabricVariants, db.fabricProducts, search]);

  const submit = () => {
    setError(null);
    if (!variantId) return setError('اختر لون القماش أولًا.');
    const res = addFabricRoll({ variantId, meters: parseFloat(metersIn || '0'), location });
    if (!res.ok) return setError(res.error);
    router.replace({ pathname: '/roll/[id]', params: { id: res.data } });
  };

  if (db.fabricVariants.length === 0) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<PackagePlus size={26} color={palette.olive} />}
          title="لا توجد ألوان بعد"
          body="أضف قماشًا ولونًا في المكتبة أولًا، ثم استلم بضاعته."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Card>
        <SectionHeader title="النوع واللون" subtitle="كل استلام يتبع لونًا واحدًا" />
        {db.fabricVariants.length > 6 && (
          <View style={{ marginBottom: spacing.md }}>
            <Field
              label="ابحث"
              value={search}
              onChangeText={setSearch}
              placeholder="اسم القماش أو اللون أو الرمز"
            />
          </View>
        )}
        <View style={{ gap: spacing.sm }}>
          {variants.map((v) => {
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
          {variants.length === 0 && (
            <Row gap={spacing.sm}>
              <Search size={15} color={palette.muted} />
              <AppText variant="caption" color={palette.muted}>
                لا نتيجة مطابقة لبحثك.
              </AppText>
            </Row>
          )}
        </View>
      </Card>

      <Card>
        <AppText variant="heading">الكمية</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          <Field
            label="الأمتار المستلمة"
            value={metersIn}
            onChangeText={setMetersIn}
            keyboardType="decimal-pad"
            suffix="متر"
            placeholder="0"
          />
          <Field
            label="الموقع في المخزن (اختياري)"
            value={location}
            onChangeText={setLocation}
            placeholder="رف A3"
          />
          <AppText variant="caption" color={palette.muted}>
            رقم الرول ودفعة الصبغ يُسجَّلان تلقائيًا - كل استلام دفعة مستقلة،
            وتحذير اختلاف الدفعات يبقى يعمل كما هو.
          </AppText>
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
};
