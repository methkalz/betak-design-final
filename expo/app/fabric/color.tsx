/**
 * لون جديد أو تعديل لون قائم.
 *
 * اللون يُختار بالعين لا بكتابة رقم ست عشري، فالمقدَّم لوحة عيّنات من ألوان
 * الستائر الشائعة هنا. الحقل النصّي باقٍ لمن عنده رمز المورّد بالضبط.
 *
 * والتكلفة بالشيكل الصحيح - لا أغورة في هذا التطبيق - وهي الرقم الذي يقوم
 * عليه الهامش كله، فبدونها لا يُحفظ اللون.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Palette } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Banner, Button, Card, Field, Row, ScrollScreen, Swatch } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

/** عيّنات شائعة في ستائر البيوت هنا - اقتراح لا حصر. */
const SWATCHES = [
  '#D8C3A5', '#C9B79C', '#A89F91', '#8D8577',
  '#5E6B57', '#3F4A3C', '#6B7C93', '#41506B',
  '#8C5A4A', '#B3766A', '#D9A79B', '#F2E8DC',
  '#FFFFFF', '#E8E4DC', '#4A4A4A', '#1F2430',
];

export default function FabricColorScreen() {
  const { productId, id } = useLocalSearchParams<{ productId: string; id?: string }>();
  const { db, saveFabricVariant } = useStore();
  const router = useRouter();

  const existing = id ? db.fabricVariants.find((v) => v.id === id) : undefined;
  const product = db.fabricProducts.find((p) => p.id === (existing?.productId ?? productId));

  const [colorName, setColorName] = useState(existing?.colorName ?? '');
  const [colorHex, setColorHex] = useState(existing?.colorHex ?? SWATCHES[0]);
  const [sku, setSku] = useState(existing?.sku ?? '');
  const [cost, setCost] = useState(
    existing ? String(Math.round(existing.costPerMeterAgorot / 100)) : '',
  );
  const [surcharge, setSurcharge] = useState(
    existing ? String(Math.round((existing.customerSurchargePerMeterAgorot ?? 0) / 100)) : '',
  );
  const [perRm, setPerRm] = useState(
    existing && existing.metersPerRunningMeter > 0 ? String(existing.metersPerRunningMeter) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!product) return setError('القماش غير موجود.');
    const res = saveFabricVariant({
      id: existing?.id,
      productId: product.id,
      colorName,
      colorHex,
      sku,
      costPerMeterAgorot: Math.round(parseFloat(cost || '0')) * 100,
      customerSurchargePerMeterAgorot: Math.round(parseFloat(surcharge || '0')) * 100,
      metersPerRunningMeter: parseFloat(perRm || '0'),
    });
    if (!res.ok) return setError(res.error);
    router.replace({ pathname: '/fabric/[id]', params: { id: product.id } });
  };

  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.md} align="center">
          <Swatch color={colorHex} size={54} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{colorName || 'لون بلا اسم'}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {product?.name} • عرض {product?.widthCm} سم
            </AppText>
          </View>
        </Row>
      </Card>

      <Card>
        <AppText variant="heading">اللون</AppText>
        <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
          {SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColorHex(c)}
              style={[styles.swatchBtn, colorHex === c && { borderColor: palette.olive }]}
            >
              <Swatch color={c} size={38} />
              {colorHex === c && (
                <View style={styles.tick}>
                  <Check size={12} color={palette.white} />
                </View>
              )}
            </Pressable>
          ))}
        </Row>
        <View style={{ marginTop: spacing.lg }}>
          <Field
            label="رمز اللون"
            value={colorHex}
            onChangeText={(t) => setColorHex(t.startsWith('#') ? t : `#${t}`)}
            placeholder="#D8C3A5"
            autoCapitalize="characters"
          />
        </View>
      </Card>

      <Card>
        <AppText variant="heading">التسمية والتكلفة</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          <Field
            label="اسم اللون"
            value={colorName}
            onChangeText={setColorName}
            placeholder="مثال: بيج دافئ"
          />
          <Field
            label="الرمز المخزني"
            value={sku}
            onChangeText={setSku}
            autoCapitalize="characters"
            placeholder="CR-BEIGE"
          />
          <Field
            label="تكلفة المتر عند المورّد"
            value={cost}
            onChangeText={(t) => setCost(t.replace(/\D/g, ''))}
            keyboardType="numeric"
            suffix="₪"
            placeholder="14"
          />
          <AppText variant="caption" color={palette.muted}>
            التكلفة داخلية لا تظهر للخياط ولا للعامل الميداني، وعليها يُحسب هامش كل عرض.
          </AppText>
          {/* الزيادة على سعر الزبون: البطانة 100% مثالها. صفر لكل قماش عادي،
              فلا يتغيّر سعر إلا حيث وضع الأدمن رقمًا بنفسه. */}
          <Field
            label="زيادة على سعر المتر للزبون"
            value={surcharge}
            onChangeText={(t) => setSurcharge(t.replace(/\D/g, ''))}
            keyboardType="numeric"
            suffix="₪"
            placeholder="0"
          />
          <AppText variant="caption" color={palette.muted}>
            تُضاف إلى سعر المتر الطولي حين يُختار هذا اللون. اتركها صفرًا للأقمشة
            العادية - وتُستعمل للبطانة 100% التي تزيد على السعر المحدد.
          </AppText>
          {/* كمية الاستهلاك: للبطانة نسبةٌ ثابتة خاصة بدرجتها، وللقماش
              تُترك فارغة فيتبع مضاعف كل شباك */}
          <Field
            label="أمتار يستهلكها كل متر طولي"
            value={perRm}
            onChangeText={(t) => setPerRm(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            suffix="متر"
            placeholder="اتركه فارغًا ليتبع المضاعف"
          />
          <AppText variant="caption" color={palette.muted}>
            القماش يتبع مضاعف الشباك فيُترك فارغًا. البطانة لها نسبتها هي:
            70% تحتاج 3 أمتار لكل متر طولي، و100% تحتاج مترًا ونصفًا.
          </AppText>
        </View>
      </Card>

      {!!error && <Banner tone="danger" title="تعذر الحفظ" body={error} />}

      <Button
        label={existing ? 'حفظ التعديل' : 'إضافة اللون'}
        full
        icon={<Palette size={18} color={palette.ivory} />}
        onPress={submit}
      />
    </ScrollScreen>
  );
}

const styles = {
  swatchBtn: {
    padding: 4,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent' as const,
  },
  tick: {
    position: 'absolute' as const,
    bottom: 2,
    left: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.olive,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
