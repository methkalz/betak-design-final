import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from '@expo-google-fonts/cairo';
import { Heebo_600SemiBold, Heebo_700Bold } from '@expo-google-fonts/heebo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HeaderBack } from '@/components/HeaderBack';
import { font, palette } from '@/constants/theme';
import { useAndroidBackFallback } from '@/lib/nav';
import { AuthProvider } from '@/providers/auth';
import { StoreProvider } from '@/providers/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootLayoutNav() {
  useAndroidBackFallback();

  return (
    <Stack
      screenOptions={{
        // زر رجوع خاص بالتطبيق بدل زر الترويسة الأصلي: الأصلي يختفي حين يفرغ
        // المكدّس فتصير الشاشة بلا مخرج، وهذا يظهر دائمًا ويقود إلى وجهة
        // منطقية. وهو أيضًا بخط التطبيق لا بخط النظام.
        headerLeft: () => <HeaderBack />,
        headerStyle: { backgroundColor: palette.ivory },
        headerTitleStyle: { fontFamily: font.semibold, fontSize: 18, color: palette.charcoal },
        headerTintColor: palette.olive,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.ivory },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="customer/[id]" options={{ title: 'ملف الزبون' }} />
      <Stack.Screen name="customer/new" options={{ title: 'زبون جديد', presentation: 'modal' }} />
      <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="project/new" options={{ title: 'مشروع جديد', presentation: 'modal' }} />
      <Stack.Screen name="window/[id]" options={{ title: 'الشباك والقياس' }} />
      <Stack.Screen name="window/new" options={{ title: 'شباك جديد' }} />
      <Stack.Screen name="visit/[id]" options={{ title: 'الزيارة الميدانية' }} />
      <Stack.Screen name="quotation/[id]" options={{ title: 'عرض السعر' }} />
      <Stack.Screen name="quotation/pdf" options={{ title: 'معاينة العرض', presentation: 'modal' }} />
      <Stack.Screen name="reserve/[projectId]" options={{ title: 'حجز القماش', presentation: 'modal' }} />
      <Stack.Screen name="roll/[id]" options={{ title: 'تفاصيل الرول' }} />
      <Stack.Screen name="roll/new" options={{ title: 'استلام بضاعة', presentation: 'modal' }} />
      <Stack.Screen name="fabric/[id]" options={{ title: 'القماش' }} />
      <Stack.Screen name="fabric/new" options={{ title: 'قماش', presentation: 'modal' }} />
      <Stack.Screen name="fabric/color" options={{ title: 'لون القماش', presentation: 'modal' }} />
      <Stack.Screen name="tailor/[id]" options={{ title: 'أمر الإنتاج' }} />
      <Stack.Screen name="team/index" options={{ title: 'الطاقم' }} />
      <Stack.Screen name="team/new" options={{ title: 'موظف جديد', presentation: 'modal' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'ملف الموظف' }} />
      <Stack.Screen name="discounts" options={{ title: 'طلبات الخصم' }} />
      <Stack.Screen name="payments" options={{ title: 'الدفعات' }} />
      <Stack.Screen name="reports" options={{ title: 'التقارير' }} />
      <Stack.Screen name="notifications" options={{ title: 'الإشعارات' }} />
      <Stack.Screen name="settings" options={{ title: 'الإعدادات' }} />
      <Stack.Screen name="sync" options={{ title: 'مركز المزامنة' }} />
      <Stack.Screen name="audit" options={{ title: 'سجل التدقيق' }} />
      <Stack.Screen name="pricing-rules" options={{ title: 'قواعد التسعير' }} />
      <Stack.Screen name="+not-found" options={{ title: 'غير موجود' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    // للعبرية وحدها (מע"מ ونحوها): القاهرة بلا حروف عبرية فتسقط لخط النظام
    Heebo_600SemiBold,
    Heebo_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StoreProvider>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ivory }}>
            <StatusBar style="dark" />
            <RootLayoutNav />
          </GestureHandlerRootView>
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
