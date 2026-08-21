import { useRouter } from 'expo-router';
// أيقونات الروابط انتقلت إلى `lib/navModel` مع اللائحة نفسها؛ ما بقي هنا
// هو أيقونات هذه الشاشة وحدها.
import { ChevronLeft, CloudOff, LogOut, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { AppText, Card, Pill, Row, SectionHeader } from '@/components/ui';
import { layout, palette, radius, spacing } from '@/constants/theme';
import { useResponsive, useTopPad } from '@/hooks/useResponsive';
import { ROLE_LABELS, can } from '@/domain/permissions';
import { unreadCount } from '@/hooks/selectors';
import { Avatar } from '@/components/Avatar';
import { secondaryLinks } from '@/lib/navModel';
import { useStore } from '@/providers/store';

export default function MoreScreen() {
  const { db, currentUser, role, isOnline, setIsOnline, signOut } = useStore();
  const router = useRouter();
  const topPad = useTopPad(spacing.lg);
  const { isDesktop } = useResponsive();

  const pendingOps = db.operations.filter((o) => o.state !== 'synced').length;
  const pendingDiscounts = db.discountRequests.filter((d) => d.status === 'pending').length;

  const links = secondaryLinks(db, role, currentUser?.id);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={[
        {
          paddingTop: topPad,
          padding: spacing.lg,
          paddingBottom: 120,
          gap: spacing.xl,
        },
        isDesktop && {
          padding: layout.gutter,
          paddingBottom: layout.gutter,
          width: '100%',
          maxWidth: layout.column,
          alignSelf: 'center',
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Row gap={spacing.md}>
          <Avatar
            id={currentUser?.id ?? 'anon'}
            name={currentUser?.fullName ?? ''}
            size={56}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{currentUser?.fullName}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {currentUser?.title}
            </AppText>
          </View>
          <Pill
            label={ROLE_LABELS[role]}
            bg={palette.sageSoft}
            fg={palette.oliveDark}
            icon={<ShieldCheck size={12} color={palette.oliveDark} />}
          />
        </Row>
      </Card>

      <Card>
        <Row justify="space-between">
          <Row gap={spacing.md} style={{ flex: 1 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                backgroundColor: isOnline ? palette.successSoft : palette.dangerSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloudOff size={18} color={isOnline ? palette.success : palette.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">وضع العمل دون اتصال</AppText>
              <AppText variant="caption" color={palette.muted}>
                كل تسجيل يحتاج اتصالًا - لا شيء يُحفظ على الجهاز لرفعه لاحقًا.
              </AppText>
            </View>
          </Row>
          <Switch
            value={!isOnline}
            onValueChange={(v) => setIsOnline(!v)}
            trackColor={{ true: palette.terracotta, false: palette.sandDeep }}
            thumbColor={palette.white}
          />
        </Row>
      </Card>

      <View>
        <SectionHeader title="الإدارة" />
        <Card padded={false}>
          {links
            .filter((l) => l.show)
            .map((l, i, arr) => (
              <Pressable
                key={l.href}
                onPress={() => router.push(l.href as never)}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    minHeight: 64,
                    justifyContent: 'center',
                    borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                    borderBottomColor: palette.line,
                    backgroundColor: pressed ? palette.ivoryDeep : 'transparent',
                  },
                ]}
              >
                <Row gap={spacing.md}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.md,
                      backgroundColor: palette.ivoryDeep,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {l.icon}
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{l.label}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {l.hint}
                    </AppText>
                  </View>
                  {!!l.badge && l.badge > 0 && (
                    <Pill label={`${l.badge}`} bg={palette.terracottaSoft} fg={palette.terracotta} small />
                  )}
                  <ChevronLeft size={18} color={palette.muted} />
                </Row>
              </Pressable>
            ))}
        </Card>
      </View>

      <Pressable
        onPress={() =>
          Alert.alert('تسجيل الخروج', 'هل تريد الخروج من الحساب؟', [
            { text: 'إلغاء', style: 'cancel' },
            {
              text: 'خروج',
              style: 'destructive',
              onPress: () => {
                signOut();
                router.replace('/login');
              },
            },
          ])
        }
        style={({ pressed }) => [
          {
            minHeight: 52,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: palette.dangerSoft,
            backgroundColor: pressed ? palette.dangerSoft : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row-reverse',
            gap: spacing.sm,
          },
        ]}
      >
        <LogOut size={18} color={palette.danger} />
        <AppText variant="label" color={palette.danger}>
          تسجيل الخروج
        </AppText>
      </Pressable>

      <AppText variant="caption" color={palette.muted} align="center">
        بيتك ديزاين • إصدار 1.0 • {db.organization.name}
      </AppText>
    </ScrollView>
  );
}
