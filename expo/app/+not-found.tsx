import { Link, Stack } from 'expo-router';
import { Compass } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'صفحة غير موجودة' }} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.md,
          backgroundColor: palette.ivory,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: palette.sand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Compass size={28} color={palette.olive} />
        </View>
        <AppText variant="heading" align="center">
          هذه الشاشة غير موجودة
        </AppText>
        <AppText variant="body" color={palette.muted} align="center">
          ربما تغيّر الرابط أو حُذف العنصر.
        </AppText>
        <Link href="/" style={{ marginTop: spacing.md }}>
          <AppText variant="label" color={palette.olive}>
            العودة إلى الرئيسية
          </AppText>
        </Link>
      </View>
    </>
  );
}
