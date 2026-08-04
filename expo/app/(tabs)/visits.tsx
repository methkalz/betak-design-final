import { CalendarCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VisitCard } from '@/components/cards';
import { AppText, Card, EmptyState, Row, SegmentedControl } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { VISIT_TYPE_LABELS } from '@/domain/labels';
import { formatDate, formatTime, isSameDay } from '@/lib/format';
import { useStore } from '@/providers/store';

type Tab = 'today' | 'upcoming' | 'done';

export default function VisitsScreen() {
  const { db, currentUser } = useStore();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');

  const mine = useMemo(
    () =>
      db.fieldVisits
        .filter((v) => v.assigneeId === currentUser?.id)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [db.fieldVisits, currentUser?.id],
  );

  const data = useMemo(() => {
    const today = new Date();
    if (tab === 'today')
      return mine.filter((v) => isSameDay(v.scheduledAt, today) && v.status !== 'completed');
    if (tab === 'upcoming')
      return mine.filter((v) => !isSameDay(v.scheduledAt, today) && v.status !== 'completed');
    return mine.filter((v) => v.status === 'completed');
  }, [mine, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">زياراتي</AppText>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'اليوم' },
            { value: 'upcoming', label: 'القادمة' },
            { value: 'done', label: 'المنجزة' },
          ]}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) =>
          tab === 'done' ? (
            <Card>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">
                    {
                      db.customers.find(
                        (c) =>
                          c.id === db.projects.find((p) => p.id === item.projectId)?.customerId,
                      )?.fullName
                    }
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {VISIT_TYPE_LABELS[item.type]} • {formatDate(item.completedAt ?? item.scheduledAt)} •{' '}
                    {formatTime(item.completedAt ?? item.scheduledAt)}
                  </AppText>
                </View>
                <CalendarCheck size={20} color={palette.success} />
              </Row>
            </Card>
          ) : (
            <VisitCard visitId={item.id} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={<CalendarCheck size={28} color={palette.olive} />}
            title="لا توجد زيارات"
            body={tab === 'today' ? 'لا توجد زيارات مجدولة اليوم.' : 'لا زيارات قادمة مجدولة بعد.'}
          />
        }
      />
    </View>
  );
}
