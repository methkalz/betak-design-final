import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Delete, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Banner, Row } from '@/components/ui';
import { font, palette, radius, shadow, spacing } from '@/constants/theme';
import { ROLE_LABELS } from '@/domain/permissions';
import { initials } from '@/lib/format';
import { useStore } from '@/providers/store';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export default function LoginScreen() {
  const { db, signIn } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const profiles = useMemo(() => db.profiles.filter((p) => p.isActive), [db.profiles]);
  const active = useMemo(() => profiles.find((p) => p.id === selected) ?? null, [profiles, selected]);

  const submit = useCallback(
    async (code: string) => {
      if (!selected) return;
      setLoading(true);
      setError(null);
      const res = await signIn(selected, code);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setPin('');
        if (Platform.OS !== 'web')
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      if (Platform.OS !== 'web')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/home');
    },
    [selected, signIn, router],
  );

  const press = useCallback(
    (key: string) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      setError(null);
      if (key === 'clear') return setPin('');
      if (key === 'back') return setPin((p) => p.slice(0, -1));
      setPin((p) => {
        if (p.length >= 4) return p;
        const next = p + key;
        if (next.length === 4) setTimeout(() => submit(next), 120);
        return next;
      });
    },
    [submit],
  );

  return (
    <LinearGradient
      colors={[palette.oliveDeepest, palette.olive, '#4E6553']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: spacing.xl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 4 }}>
          <AppText variant="display" color={palette.ivory}>
            بيتك ديزاين
          </AppText>
          <AppText variant="body" color={palette.sage}>
            من أول قياس في منزل الزبون إلى آخر دفعة وتركيب — كل شيء في مكان واحد.
          </AppText>
        </View>

        <View style={{ gap: spacing.md }}>
          <AppText variant="label" color={palette.sage}>
            اختر المستخدم
          </AppText>
          {profiles.map((p) => {
            const isActive = p.id === selected;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setSelected(p.id);
                  setPin('');
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.userCard,
                  isActive && styles.userCardActive,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Row gap={spacing.md}>
                  <View style={[styles.avatar, isActive && { backgroundColor: palette.terracotta }]}>
                    <AppText variant="heading" color={palette.ivory}>
                      {initials(p.fullName)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" color={isActive ? palette.ivory : palette.ivory}>
                      {p.fullName}
                    </AppText>
                    <AppText variant="caption" color={palette.sage}>
                      {ROLE_LABELS[p.role]} • {p.phone}
                    </AppText>
                  </View>
                  {isActive && <ShieldCheck size={20} color={palette.sage} />}
                </Row>
              </Pressable>
            );
          })}
        </View>

        {!!active && (
          <View style={styles.pinPanel}>
            <AppText variant="label" color={palette.muted} align="center">
              أدخل رمز الدخول لـ {active.fullName}
            </AppText>
            <Row justify="center" gap={spacing.md} style={{ marginVertical: spacing.md }}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    pin.length > i && { backgroundColor: palette.olive, borderColor: palette.olive },
                  ]}
                />
              ))}
            </Row>

            {loading ? (
              <ActivityIndicator color={palette.olive} style={{ height: 220 }} />
            ) : (
              <View style={styles.pad}>
                {KEYS.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => press(k)}
                    style={({ pressed }) => [
                      styles.key,
                      pressed && { backgroundColor: palette.sand, transform: [{ scale: 0.96 }] },
                    ]}
                  >
                    {k === 'back' ? (
                      <Delete size={22} color={palette.charcoal} />
                    ) : k === 'clear' ? (
                      <AppText variant="label" color={palette.muted}>
                        مسح
                      </AppText>
                    ) : (
                      <AppText style={{ fontFamily: font.semibold, fontSize: 24 }}>{k}</AppText>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {!!error && (
              <Banner tone="danger" title={error} icon={<ShieldCheck size={16} color={palette.danger} />} />
            )}

            <AppText variant="caption" color={palette.muted} align="center">
              رموز العرض التجريبي: الأدمن 1111 • الميداني 2222 • الخياط 3333
            </AppText>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  userCard: {
    borderRadius: radius.lg,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: spacing.md,
    minHeight: 72,
    justifyContent: 'center',
  },
  userCardActive: {
    borderColor: palette.sage,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPanel: {
    backgroundColor: palette.ivory,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.raised,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.6,
    borderColor: palette.sandDeep,
    backgroundColor: 'transparent',
  },
  pad: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  key: {
    width: '31%',
    height: 58,
    borderRadius: radius.md,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
