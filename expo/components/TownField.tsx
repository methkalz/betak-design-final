/**
 * حقل البلدة باقتراحات حيّة من قائمة البلدات العربية في البلاد.
 *
 * البحث يطبّع العربية (يتجاهل التشكيل وصور الألف والتاء المربوطة وأداة
 * التعريف) فيجد «طيبة» من «الطيبة» و«كفر منده» من «كفرمندا» - وإلا لم
 * تنفع القائمة إلا من يكتب الاسم بالرسم نفسه.
 *
 * والحقل يبقى حرًّا: الاقتراح تسريعٌ لا قيد، فيُقبل أي نص يكتبه المستخدم.
 */
import { MapPin } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Field, Row } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { suggestTowns } from '@/data/towns';

export function TownField({
  value,
  onChangeText,
  label = 'البلدة',
}: {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
}) {
  const [touched, setTouched] = useState(false);
  const options = useMemo(() => (touched ? suggestTowns(value) : []), [value, touched]);

  return (
    <View>
      <Field
        label={label}
        value={value}
        onChangeText={(t) => {
          setTouched(true);
          onChangeText(t);
        }}
        placeholder="كفرمندا"
      />
      {options.length > 0 && (
        <View style={styles.list}>
          {options.map((t, i) => (
            <Pressable
              key={t}
              onPress={() => {
                onChangeText(t);
                setTouched(false);
              }}
              style={({ pressed }) => [
                styles.item,
                i > 0 && styles.divided,
                pressed && { backgroundColor: palette.sand },
              ]}
            >
              <Row gap={spacing.sm}>
                <MapPin size={15} color={palette.muted} />
                <AppText variant="label">{t}</AppText>
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: 'hidden',
  },
  item: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 48, justifyContent: 'center' },
  divided: { borderTopWidth: 1, borderTopColor: palette.line },
});
