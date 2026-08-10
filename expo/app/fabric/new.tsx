/**
 * قماش جديد أو تعديل قماش قائم - شاشة واحدة.
 *
 * الحقول هنا كلها تخصّ الصنف لا اللون ولا الشحنة: النوع والمورّد وعرض
 * الطاقة والتركيب. أما التكلفة فتتبع اللون لا القماش، لأن اللونين من الطاقة
 * نفسها قد يختلف سعرهما عند المورّد.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Layers } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AppText, Banner, Button, Card, Field, ScrollScreen, SegmentedControl } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';
import type { FabricKind } from '@/types/domain';

const KINDS: { value: FabricKind; label: string }[] = [
  { value: 'crepe', label: 'كريب' },
  { value: 'other', label: 'قماش آخر' },
  { value: 'lining', label: 'بطانة' },
];

export default function FabricEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { db, saveFabricProduct } = useStore();
  const router = useRouter();

  const existing = id ? db.fabricProducts.find((p) => p.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<FabricKind>(existing?.kind ?? 'crepe');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [widthCm, setWidthCm] = useState(String(existing?.widthCm ?? 300));
  const [composition, setComposition] = useState(existing?.composition ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const res = saveFabricProduct({
      id: existing?.id,
      name,
      kind,
      supplier,
      widthCm: parseFloat(widthCm || '0'),
      composition,
    });
    if (!res.ok) return setError(res.error);
    router.replace({ pathname: '/fabric/[id]', params: { id: res.data } });
  };

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="heading">نوع القماش</AppText>
        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl value={kind} onChange={setKind} options={KINDS} />
        </View>
      </Card>

      <Card>
        <AppText variant="heading">بيانات القماش</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          <Field label="الاسم" value={name} onChangeText={setName} placeholder="مثال: كريب" />
          <Field
            label="المورّد"
            value={supplier}
            onChangeText={setSupplier}
            placeholder="مثال: الشرق للأقمشة"
          />
          <Field
            label="عرض الطاقة"
            value={widthCm}
            onChangeText={setWidthCm}
            keyboardType="numeric"
            suffix="سم"
          />
          <Field
            label="التركيب والملمس"
            value={composition}
            onChangeText={setComposition}
            multiline
            placeholder="مثال: 100% بوليستر - سقوط ثقيل"
          />
          <AppText variant="caption" color={palette.muted}>
            الألوان والتكلفة تُضاف بعد الحفظ، لكل لون تكلفته ورمزه المخزني.
          </AppText>
        </View>
      </Card>

      {!!error && <Banner tone="danger" title="تعذر الحفظ" body={error} />}

      <Button
        label={existing ? 'حفظ التعديل' : 'إضافة القماش'}
        full
        icon={<Layers size={18} color={palette.ivory} />}
        onPress={submit}
      />
    </ScrollScreen>
  );
}
