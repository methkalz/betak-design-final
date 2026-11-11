import { useRouter } from 'expo-router';
// أيقونات الروابط انتقلت إلى `lib/navModel` مع اللائحة نفسها؛ ما بقي هنا
// هو أيقونات هذه الشاشة وحدها.
import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, CloudOff, FileText, LifeBuoy, LogOut, ShieldCheck, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { AppText, Card, ConfirmSheet, Pill, Row, SectionHeader } from '@/components/ui';
import { layout, palette, radius, spacing } from '@/constants/theme';
import { useResponsive, useTopPad } from '@/hooks/useResponsive';
import { ROLE_LABELS, can } from '@/domain/permissions';
import { unreadCount } from '@/hooks/selectors';
import { Avatar } from '@/components/Avatar';
import { PoweredBy } from '@/components/PoweredBy';
import { LEGAL_LINKS, type LegalLink } from '@/domain/legalLinks';
import { secondaryLinks } from '@/lib/navModel';
import { useStore } from '@/providers/store';

const LEGAL_ICONS: Record<LegalLink['key'], React.ReactNode> = {
  privacy: <ShieldCheck size={20} color={palette.olive} />,
  terms: <FileText size={20} color={palette.olive} />,
  support: <LifeBuoy size={20} color={palette.olive} />,
  'delete-account': <Trash2 size={20} color={palette.danger} />,
};

// داخل التطبيق على الهاتف (متصفّحٌ منبثق يُغلق فيعود المستخدم)، ونافذةٌ جديدة على الويب
function openLegal(url: string) {
  if (Platform.OS === 'web') {
    void Linking.openURL(url);
    return;
  }
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
}

export default function MoreScreen() {
  const { db, currentUser, role, isOnline, setIsOnline, signOut } = useStore();
  const router = useRouter();
  const topPad = useTopPad(spacing.lg);
  const { isDesktop } = useResponsive();
  const [confirmOut, setConfirmOut] = useState(false);

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

      {/* الخصوصية وحذف الحساب داخل التطبيق: شرط Google Play وApple 5.1.1(v) */}
      <View>
        <SectionHeader title="الخصوصية والحساب" />
        <Card padded={false}>
          {LEGAL_LINKS.map((l, i, arr) => (
            <Pressable
              key={l.key}
              accessibilityRole="link"
              accessibilityLabel={l.label}
              onPress={() => openLegal(l.url)}
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
                    backgroundColor: l.danger ? palette.dangerSoft : palette.ivoryDeep,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {LEGAL_ICONS[l.key]}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label" color={l.danger ? palette.danger : palette.charcoal}>
                    {l.label}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {l.hint}
                  </AppText>
                </View>
                <ChevronLeft size={18} color={palette.muted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      </View>

      <Pressable
        onPress={() => setConfirmOut(true)}
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
        بيتك ديزاين • إصدار {Application.nativeApplicationVersion ?? '1.0.0'}
        {Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : ''} • {db.organization.name}
      </AppText>

      {/* على نافذةٍ أضيق من 1024 تعود القوقعة شظيّةً فلا شريطَ جانبيّ ولا
          قدمَ له - و«المزيد» هي قدم التطبيق عندئذٍ. فالتوقيع يبلغ مستخدم
          الويب مهما كان عرض نافذته. (لا يظهر على الأصليّ: الحارس منصّة.) */}
      <PoweredBy />

      <ConfirmSheet
        visible={confirmOut}
        title="تسجيل الخروج"
        body="ستحتاج إلى رقم هاتفك وكلمة السر للدخول مجددًا."
        confirmLabel="خروج"
        tone="danger"
        icon={<LogOut size={22} color={palette.danger} />}
        onConfirm={() => {
          setConfirmOut(false);
          signOut();
          router.replace('/login');
        }}
        onCancel={() => setConfirmOut(false)}
      />
    </ScrollView>
  );
}
