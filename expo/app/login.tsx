/**
 * الدخول: باب واحد فقط - رقم الهاتف وكلمة السر إلى بيانات المعرض الحية.
 *
 * أُلغي العرض التجريبي بقرار المالك: بابان يعنيان أن أحدهم سيُدخل قياسًا
 * حقيقيًا في بياناتٍ تتبخر. والهاتف هو الهوية لأن الموظف يعرف رقمه ولا
 * يعرف بريدًا - والتطبيع يقبل 052 و52 و+972 فيصل إلى الحساب نفسه.
 */
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Phone, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Banner, Row } from '@/components/ui';
import { font, layout, palette, radius, shadow, spacing } from '@/constants/theme';
import { useResponsive, useTopPad } from '@/hooks/useResponsive';
import { fetchLiveDatabase } from '@/lib/live';
import { normalizePhone } from '@/lib/phone';
import { useAuth } from '@/providers/auth';
import { useStore } from '@/providers/store';

export default function LoginScreen() {
  const { enterLive } = useStore();
  const { liveConfigured, signInLive, signOutLive } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const topPad = useTopPad(spacing.xxl);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const submit = useCallback(async () => {
    if (!normalizePhone(phoneInput)) {
      setError('أدخل رقم هاتف صحيح - مثال: 0526444414');
      return;
    }
    if (!password) {
      setError('أدخل كلمة السر.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await signInLive(phoneInput, password);
    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      if (Platform.OS !== 'web')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    try {
      const { db: liveDb, me } = await fetchLiveDatabase();
      enterLive(liveDb, me.userId);
      if (Platform.OS !== 'web')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/home');
    } catch (e) {
      // الجلسة قائمة والبيانات لم تصل: نُخرجها كي لا يبقى المستخدم داخلًا
      // بلا معرض - ويُقال له السبب بلا تجميل
      await signOutLive();
      setError(
        e instanceof Error
          ? e.message
          : 'تعذر الوصول إلى الخادم. تأكد من اتصالك بالإنترنت ثم حاول مجددًا.',
      );
    } finally {
      setLoading(false);
    }
  }, [phoneInput, password, signInLive, signOutLive, enterLive, router]);

  return (
    <LinearGradient
      colors={[palette.oliveDeepest, palette.olive, '#8B5CF6']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          {
            paddingTop: topPad,
            paddingBottom: isDesktop ? layout.gutter : insets.bottom + spacing.xxl,
            paddingHorizontal: spacing.xl,
            gap: spacing.xl,
          },
          // على المكتب: بطاقةٌ بمقاس نموذجٍ في وسط الشاشة، لا شريطٌ ممتدّ
          // من حافةٍ إلى حافة. والتوسيط رأسيًّا لأن الصفحة أقصر من النافذة.
          isDesktop && {
            width: '100%',
            maxWidth: layout.form,
            alignSelf: 'center',
            flexGrow: 1,
            justifyContent: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 4 }}>
          <AppText variant="display" color={palette.ivory}>
            بيتك ديزاين
          </AppText>
          <AppText variant="body" color={palette.sage}>
            من أول قياس في منزل الزبون إلى آخر دفعة وتركيب - كل شيء في مكان واحد.
          </AppText>
        </View>

        {!liveConfigured ? (
          <View style={styles.panel}>
            <Banner
              tone="danger"
              title="الخادم غير مضبوط"
              body="عناوين الخادم غير موجودة في إعدادات التطبيق، فلا يمكن الدخول. راجع مزوّد التطبيق."
              icon={<ShieldCheck size={16} color={palette.danger} />}
            />
          </View>
        ) : (
          <View style={styles.panel}>
            <Row gap={spacing.sm}>
              <Phone size={16} color={palette.olive} />
              <AppText variant="label" color={palette.muted}>
                الدخول إلى نظام معرضك
              </AppText>
            </Row>

            <TextInput
              value={phoneInput}
              onChangeText={(t) => {
                setPhoneInput(t);
                setError(null);
              }}
              placeholder="رقم الهاتف"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              placeholder="كلمة السر"
              placeholderTextColor={palette.muted}
              secureTextEntry
              textContentType="password"
              style={styles.input}
              onSubmitEditing={submit}
            />

            {loading ? (
              <ActivityIndicator color={palette.olive} style={{ height: 52 }} />
            ) : (
              <Pressable onPress={submit} style={styles.button}>
                <AppText variant="heading" color={palette.ivory}>
                  دخول
                </AppText>
              </Pressable>
            )}

            {!!error && (
              <Banner
                tone="danger"
                title={error}
                icon={<ShieldCheck size={16} color={palette.danger} />}
              />
            )}

            <AppText variant="caption" color={palette.muted} align="center">
              كل ما تدخله يُحفظ على خادم معرضك. إن نسيت كلمة السر فاطلبها من الأدمن.
            </AppText>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: palette.ivory,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.raised,
  },
  input: {
    borderWidth: 1.4,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.white,
    paddingHorizontal: spacing.md,
    height: 52,
    fontFamily: font.regular,
    fontSize: 16,
    color: palette.charcoal,
    textAlign: 'right',
  },
  button: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: palette.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
