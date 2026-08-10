import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, CloudOff, Cloud } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Row } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { ROLE_LABELS } from '@/domain/permissions';
import { unreadCount } from '@/hooks/selectors';
import { Avatar } from '@/components/Avatar';
import { useStore } from '@/providers/store';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'نهارك سعيد';
  return 'مساء الخير';
}

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { currentUser, db, isOnline } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unread = unreadCount(db, currentUser?.id);

  return (
    <LinearGradient
      colors={[palette.oliveDeepest, palette.olive]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.root, { paddingTop: insets.top + spacing.md }]}
    >
      <Row justify="space-between">
        <Row gap={spacing.md}>
          <Avatar
            id={currentUser?.id ?? 'anon'}
            name={currentUser?.fullName ?? ''}
            size={44}
            onDark
          />
          <View>
            <AppText variant="caption" color={palette.sage}>
              {greeting()} • {ROLE_LABELS[currentUser?.role ?? 'field']}
            </AppText>
            <AppText variant="heading" color={palette.ivory}>
              {currentUser?.fullName ?? ''}
            </AppText>
          </View>
        </Row>
        <Row gap={spacing.sm}>
          <Pressable onPress={() => router.push('/sync')} style={styles.iconBtn}>
            {isOnline ? (
              <Cloud size={19} color={palette.sage} />
            ) : (
              <CloudOff size={19} color={palette.terracotta} />
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} style={styles.iconBtn}>
            <Bell size={19} color={palette.sage} />
            {unread > 0 && (
              <View style={styles.badge}>
                <AppText variant="caption" color={palette.white} style={{ fontSize: 10 }}>
                  {unread}
                </AppText>
              </View>
            )}
          </Pressable>
        </Row>
      </Row>
      {!!subtitle && (
        <AppText variant="caption" color={palette.sage} style={{ marginTop: spacing.md }}>
          {subtitle}
        </AppText>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: palette.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
