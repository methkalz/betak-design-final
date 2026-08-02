import { useRouter } from 'expo-router';
import { Plus, Search, LayoutGrid } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectRow } from '@/components/cards';
import { AppText, Chip, EmptyState, IconButton, Row } from '@/components/ui';
import { font, palette, radius, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { useStore } from '@/providers/store';
import type { ProjectStatus } from '@/types/domain';

type Filter = 'all' | 'active' | 'production' | 'install' | 'done';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'قيد المتابعة' },
  { value: 'production', label: 'إنتاج' },
  { value: 'install', label: 'تركيب' },
  { value: 'done', label: 'مكتمل' },
];

const GROUPS: Record<Filter, ProjectStatus[] | null> = {
  all: null,
  active: ['new_request', 'awaiting_measurement', 'measured', 'quotation', 'customer_approved'],
  production: ['fabric_allocated', 'with_tailor'],
  install: ['ready_for_install', 'installed'],
  done: ['completed'],
};

export default function ProjectsScreen() {
  const { db, role, currentUser } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('all');

  const scoped = useMemo(() => {
    if (role === 'field') return db.projects.filter((p) => p.fieldWorkerId === currentUser?.id);
    if (role === 'tailor') return db.projects.filter((p) => p.tailorId === currentUser?.id);
    return db.projects;
  }, [db.projects, role, currentUser?.id]);

  const filtered = useMemo(() => {
    const statuses = GROUPS[filter];
    const q = query.trim();
    return scoped.filter((p) => {
      if (statuses && !statuses.includes(p.status)) return false;
      if (!q) return true;
      const customer = db.customers.find((c) => c.id === p.customerId);
      return (
        p.title.includes(q) ||
        p.code.includes(q) ||
        (customer?.fullName.includes(q) ?? false) ||
        (customer?.phone.includes(q) ?? false)
      );
    });
  }, [scoped, filter, query, db.customers]);

  const counts = useMemo(() => {
    const map: Record<Filter, number> = { all: scoped.length, active: 0, production: 0, install: 0, done: 0 };
    (Object.keys(GROUPS) as Filter[]).forEach((k) => {
      const statuses = GROUPS[k];
      if (statuses) map[k] = scoped.filter((p) => statuses.includes(p.status)).length;
    });
    return map;
  }, [scoped]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Row justify="space-between">
          <AppText variant="title">المشاريع</AppText>
          {can(role, 'manage_customers') && (
            <IconButton onPress={() => router.push('/project/new')} bg={palette.olive}>
              <Plus size={22} color={palette.ivory} />
            </IconButton>
          )}
        </Row>

        <Row
          gap={spacing.sm}
          style={{
            backgroundColor: palette.white,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: palette.line,
            paddingHorizontal: spacing.md,
            height: 48,
          }}
        >
          <Search size={18} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم الزبون أو رقم المشروع"
            placeholderTextColor={palette.muted}
            style={{
              flex: 1,
              fontFamily: font.regular,
              fontSize: 15,
              color: palette.charcoal,
              textAlign: 'right',
            }}
          />
        </Row>

        <FlatList
          horizontal
          inverted
          data={FILTERS}
          keyExtractor={(i) => i.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              active={filter === item.value}
              count={counts[item.value]}
              onPress={() => setFilter(item.value)}
            />
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <ProjectRow projectId={item.id} />}
        ListEmptyComponent={
          <EmptyState
            icon={<LayoutGrid size={28} color={palette.olive} />}
            title="لا توجد مشاريع"
            body={
              query
                ? 'لم نجد نتائج مطابقة لبحثك. جرّب اسمًا أو رقمًا آخر.'
                : 'ابدأ بإنشاء مشروع جديد لأحد الزبائن.'
            }
          />
        }
      />
    </View>
  );
}
