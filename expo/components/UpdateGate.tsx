/**
 * «يتوفر تحديث» - مكوّنٌ في جذر التطبيق.
 *
 * يفحص بعد الدخول، وعند كلّ عودةٍ إلى التطبيق (مرّةً كلّ عشر دقائق على الأكثر):
 *   - إلزاميّ: شاشةٌ تغطّي التطبيق ولا تُغلق، وزرّ «تحديث الآن».
 *   - اختياريّ: شريطٌ أعلى الشاشة بزرّين «تحديث» و«لاحقًا». «لاحقًا» يُخفيه
 *     لهذه النسخة وحدها، فنسخةٌ أحدث تعيده.
 * لا شيء على الويب ولا في Expo Go ولا حين تفشل الشبكة.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CloudDownload } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Row } from '@/components/ui';
import { palette, radius, shadow, spacing } from '@/constants/theme';
import { decideUpdate, type ReleasePolicy, type UpdateDecision } from '@/domain/storeUpdate';
import { fetchReleasePolicy, installedBuild, openStoreUpdate, storeHasNewer } from '@/lib/storeUpdate';
import { useStore } from '@/providers/store';

const DISMISS_KEY = 'baytak.update.dismissed';
const RECHECK_MS = 10 * 60 * 1000;

export function UpdateGate() {
  const { source, currentUser } = useStore();
  const insets = useSafeAreaInsets();
  const [decision, setDecision] = useState<UpdateDecision>({ kind: 'none' });
  const policyRef = useRef<ReleasePolicy | null>(null);
  const checkedAtRef = useRef(0);
  const active = source === 'live' && !!currentUser && installedBuild() !== null;

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - checkedAtRef.current < RECHECK_MS) return;
    checkedAtRef.current = Date.now();
    const installed = installedBuild();
    const [policy, newer, dismissedRaw] = await Promise.all([
      fetchReleasePolicy(),
      storeHasNewer(),
      AsyncStorage.getItem(DISMISS_KEY).catch(() => null),
    ]);
    policyRef.current = policy;
    setDecision(
      decideUpdate({
        installed,
        policy,
        storeHasNewer: newer,
        dismissedTarget: dismissedRaw ? Number(dismissedRaw) : null,
      }),
    );
  }, []);

  useEffect(() => {
    if (!active) {
      setDecision({ kind: 'none' });
      return;
    }
    void check(true);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, [active, check]);

  const update = () =>
    void openStoreUpdate(decision.kind === 'required', policyRef.current?.iosAppStoreId ?? null);

  const later = () => {
    if (decision.kind !== 'optional') return;
    void AsyncStorage.setItem(DISMISS_KEY, String(decision.target)).catch(() => {});
    setDecision({ kind: 'none' });
  };

  if (decision.kind === 'required') {
    return (
      // onRequestClose فارغ عمدًا: زرّ الرجوع في أندرويد لا يتخطّى التحديث الإلزاميّ
      <Modal visible animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
        <View style={[styles.required, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.iconWrap}>
            <CloudDownload size={34} color={palette.olive} />
          </View>
          <AppText variant="heading" align="center">
            يجب تحديث التطبيق
          </AppText>
          <AppText variant="body" color={palette.muted} align="center">
            نسخة جديدة من «بيتك ديزاين» متوفّرة في المتجر، وهذه النسخة لم تعد تعمل. حدّث التطبيق لتتابع عملك، وبياناتك محفوظة.
          </AppText>
          <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
            <Button label="تحديث الآن" full onPress={update} />
          </View>
        </View>
      </Modal>
    );
  }

  if (decision.kind === 'optional') {
    return (
      <View pointerEvents="box-none" style={[styles.bannerWrap, { top: insets.top + spacing.sm }]}>
        <View style={styles.banner}>
          <Row gap={spacing.sm}>
            <CloudDownload size={20} color={palette.olive} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="label">يتوفر تحديث جديد</AppText>
              <AppText variant="caption" color={palette.muted}>
                نسخة أحدث من التطبيق في المتجر.
              </AppText>
            </View>
          </Row>
          <Row gap={spacing.sm} style={{ marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="تحديث" full onPress={update} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="لاحقًا" variant="ghost" full onPress={later} />
            </View>
          </Row>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  required: {
    flex: 1,
    backgroundColor: palette.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  bannerWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
  },
  banner: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.md,
    ...shadow.card,
  },
});
