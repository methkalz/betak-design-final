/**
 * زر الرجوع في ترويسة الشاشات.
 *
 * الترويسة الأصلية تخفي زرّها تلقائيًا حين لا تجد شاشةً سابقة في المكدّس،
 * ويحدث ذلك واقعيًا بعد إعادة تحميل التطبيق أثناء التصفح أو الدخول من إشعار
 * أو بعد `replace`. عندها يجد المستخدم نفسه محبوسًا في الصفحة بلا مخرج -
 * وهذا ما ظهر في صفحة عرض السعر، فهي كانت الشاشة الوحيدة التي تعتمد على
 * الترويسة الأصلية دون زرّ رجوع خاص بها.
 *
 * هذا الزر يظهر دائمًا ويمرّ عبر `useGoBack` فلا يبتلع الضغطة أبدًا، ويكتب
 * «رجوع» بخط التطبيق بدل خط النظام.
 */
import { ArrowRight } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

import { AppText } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { useGoBack } from '@/lib/nav';

export function HeaderBack({ fallback = '/home' }: { fallback?: string }) {
  const goBack = useGoBack(fallback);
  return (
    <Pressable
      onPress={goBack}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="رجوع"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
        paddingEnd: spacing.md,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <ArrowRight size={20} color={palette.olive} />
      <AppText variant="label" color={palette.olive}>
        رجوع
      </AppText>
    </Pressable>
  );
}
