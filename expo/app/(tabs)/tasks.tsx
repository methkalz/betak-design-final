import { Scissors } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TailorCard } from '@/components/cards';
import { TabPanel } from '@/components/TabMotion';
import { AppText, EmptyState, Row, SegmentedControl } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { TAILOR_STAGE_LABELS } from '@/domain/labels';
import { meters } from '@/lib/format';
import { useStore } from '@/providers/store';

type Tab = 'open' | 'ready';

const TAB_ORDER: Tab[] = ['open', 'ready'];

export default function TasksScreen() {
  const { db, currentUser } = useStore();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('open');

  const mine = useMemo(
    () => db.tailorAssignments.filter((a) => a.tailorId === currentUser?.id),
    [db.tailorAssignments, currentUser?.id],
  );
  const data = mine.filter((a) => (tab === 'open' ? a.stage !== 'ready' : a.stage === 'ready'));

  const reservedMeters = useMemo(() => {
    const projectIds = mine.filter((a) => a.stage !== 'ready').map((a) => a.projectId);
    return db.reservations
      .filter((r) => projectIds.includes(r.projectId) && r.status !== 'released')
      .reduce((s, r) => s + (r.quantityM - r.consumedM), 0);
  }, [db.reservations, mine]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">أوامر الإنتاج</AppText>
        <Row gap={spacing.md}>
          <View style={{ flex: 1, backgroundColor: palette.sageSoft, borderRadius: radius.lg, padding: spacing.md }}>
            <AppText variant="number">{mine.filter((a) => a.stage !== 'ready').length}</AppText>
            <AppText variant="caption" color={palette.muted}>
              أوامر مفتوحة
            </AppText>
          </View>
          <View style={{ flex: 1, backgroundColor: palette.terracottaSoft, borderRadius: radius.lg, padding: spacing.md }}>
            <AppText variant="number">{meters(reservedMeters)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              قماش محجوز لك
            </AppText>
          </View>
        </Row>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: 'قيد التنفيذ' },
            { value: 'ready', label: TAILOR_STAGE_LABELS.ready },
          ]}
        />
      </View>

      {/* نفس حركة الانتقال المعتمدة في شاشة المشروع - التبويب لا يقطع */}
      <TabPanel tab={tab} order={TAB_ORDER} style={{ flex: 1 }} gap={0}>
        {() => (
          <FlatList
            data={data}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <TailorCard assignmentId={item.id} />}
            ListEmptyComponent={
              <EmptyState
                icon={<Scissors size={28} color={palette.olive} />}
                title="لا توجد أوامر"
                body="ستظهر هنا المشاريع المسندة إليك فقط."
              />
            }
          />
        )}
      </TabPanel>
    </View>
  );
}
