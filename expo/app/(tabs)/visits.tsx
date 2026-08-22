import { CalendarCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { VisitCard } from '@/components/cards';
import { PendingInstallations } from '@/components/PendingInstallations';
import { TabPanel } from '@/components/TabMotion';
import { AppText, Card, EmptyState, Row, SegmentedControl } from '@/components/ui';
import { palette } from '@/constants/theme';
import { useListContent, useListHeader, useTopPad } from '@/hooks/useResponsive';
import { VISIT_TYPE_LABELS } from '@/domain/labels';
import { formatDate, formatTime, isSameDay } from '@/lib/format';
import { useStore } from '@/providers/store';

type Tab = 'today' | 'upcoming' | 'done';

const TAB_ORDER: Tab[] = ['today', 'upcoming', 'done'];

export default function VisitsScreen() {
  const { db, currentUser } = useStore();
  const topPad = useTopPad();
  const listContent = useListContent();
  const listHeader = useListHeader();
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
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: topPad }}>
      <View style={listHeader}>
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

      {/* نفس حركة الانتقال المعتمدة في شاشة المشروع - التبويب لا يقطع */}
      <TabPanel tab={tab} order={TAB_ORDER} style={{ flex: 1 }} gap={0}>
        {() => (
      <FlatList
        data={data}
        keyExtractor={(v) => v.id}
        contentContainerStyle={listContent}
        showsVerticalScrollIndicator={false}
        /* التركيبات المنتظرة فوق القائمة لا في تبويب منفصل: هي أول ما يجب أن
           يفعله العامل حين ينتهي الخياط، ودفنها خلف تبويب يعني ألّا يفعله. */
        ListHeaderComponent={tab === 'done' ? null : <PendingInstallations />}
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
        )}
      </TabPanel>
    </View>
  );
}
