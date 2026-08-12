import { useRouter } from 'expo-router';
import {
  BadgePercent,
  Bell,
  CalendarClock,
  CheckCheck,
  CloudOff,
  Package,
  Scissors,
  Truck,
  Wallet,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Row, ScrollScreen } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { relativeTime } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { NotificationKind } from '@/types/domain';

function iconFor(kind: NotificationKind) {
  const size = 18;
  switch (kind) {
    case 'discount_request':
      return <BadgePercent size={size} color={palette.warning} />;
    case 'tailor_assignment':
      return <Scissors size={size} color={palette.terracotta} />;
    case 'visit_assigned':
      return <CalendarClock size={size} color={palette.info} />;
    case 'ready_for_install':
      return <Truck size={size} color={palette.olive} />;
    case 'appointment_tomorrow':
      return <CalendarClock size={size} color={palette.olive} />;
    case 'sync_failed':
      return <CloudOff size={size} color={palette.danger} />;
    case 'low_stock':
      return <Package size={size} color={palette.danger} />;
    case 'stock_received':
      return <Package size={size} color={palette.olive} />;
    case 'payment':
    default:
      return <Wallet size={size} color={palette.success} />;
  }
}

export default function NotificationsScreen() {
  const { db, currentUser, markNotificationRead, markAllRead } = useStore();
  const router = useRouter();

  const mine = db.notifications.filter((n) => n.userId === currentUser?.id);
  const unread = mine.filter((n) => !n.readAt);

  if (mine.length === 0) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Bell size={26} color={palette.olive} />}
          title="لا توجد إشعارات"
          body="ستصلك هنا طلبات الخصم والزيارات وتنبيهات المخزون."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      {unread.length > 0 && (
        <Button
          label={`تعليم الكل كمقروء (${unread.length})`}
          variant="ghost"
          full
          icon={<CheckCheck size={16} color={palette.olive} />}
          onPress={markAllRead}
        />
      )}

      {mine.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => {
            markNotificationRead(n.id);
            if (n.deepLink) router.push(n.deepLink as never);
          }}
        >
          <Card style={!n.readAt ? { borderColor: palette.sage, backgroundColor: palette.white } : undefined}>
            <Row gap={spacing.md} align="flex-start">
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
                {iconFor(n.kind)}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row justify="space-between">
                  <AppText variant="label">{n.title}</AppText>
                  {!n.readAt && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: palette.terracotta,
                      }}
                    />
                  )}
                </Row>
                <AppText variant="caption" color={palette.muted}>
                  {n.body}
                </AppText>
                <AppText variant="caption" color={palette.muted}>
                  {relativeTime(n.createdAt)}
                </AppText>
              </View>
            </Row>
          </Card>
        </Pressable>
      ))}
    </ScrollScreen>
  );
}
