import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

export default function Index() {
  const { hydrated, currentUser } = useStore();

  if (!hydrated) {
    return (
      <LinearGradient
        colors={[palette.oliveDeepest, palette.olive]}
        style={styles.root}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <View style={styles.mark}>
          <View style={styles.rod} />
          <View style={styles.panels}>
            <View style={[styles.panel, { backgroundColor: palette.terracotta }]} />
            <View style={[styles.panel, { backgroundColor: palette.sand }]} />
            <View style={[styles.panel, { backgroundColor: palette.terracotta }]} />
          </View>
        </View>
        <AppText variant="display" color={palette.ivory} align="center">
          بيتك ديزاين
        </AppText>
        <AppText variant="body" color={palette.sage} align="center">
          نظام تشغيل محلات الستائر والأقمشة
        </AppText>
        <ActivityIndicator color={palette.sage} style={{ marginTop: spacing.xl }} />
      </LinearGradient>
    );
  }

  return <Redirect href={currentUser ? '/home' : '/login'} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  mark: {
    width: 128,
    height: 128,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 16,
    marginBottom: spacing.xl,
    gap: 8,
  },
  rod: { height: 4, width: '100%', borderRadius: 2, backgroundColor: palette.sage },
  panels: { flexDirection: 'row', gap: 6, flex: 1 },
  panel: { flex: 1, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, opacity: 0.9 },
});
